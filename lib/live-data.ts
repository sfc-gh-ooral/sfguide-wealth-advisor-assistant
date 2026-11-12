// Live implementation of AdvisorData against the objects created by sql/setup.sql.
// Each call runs as the persona's Snowflake role, so row access policies scope every result,
// including the Cortex Agent. Latency shown in the UI is measured here, in live mode only.
import { randomUUID } from 'node:crypto';
import type { ActionInput, AdvisorData, BookView } from './advisor-data';
import { buildBrief } from './mock-source';
import { PERSONAS } from './personas';
import { query } from './snowflake';
import type { AgentTrace, AiAnswer, BriefItem, HouseholdAction, HouseholdDetail, HouseholdSummary, LogEntry, PersonaId } from './types';

const AGENT = process.env.SNOWFLAKE_AGENT_NAME ?? 'WEALTH_ADVISOR_DEMO.BOOK.ADVISOR_COACH';
const MODEL = process.env.SNOWFLAKE_COMPLETE_MODEL ?? 'claude-sonnet-4-5';
const SUPERVISOR_ROLE = 'WAA_SUPERVISOR';
const roleOf = (p: PersonaId) => PERSONAS[p].role;
const num = (x: unknown) => (x === null || x === undefined ? 0 : Number(x));
const day = (x: unknown) => (x instanceof Date ? x.toISOString().slice(0, 10) : String(x ?? '').slice(0, 10));
type Row = Record<string, unknown>;

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t = Date.now();
  const r = await fn();
  return [r, Date.now() - t];
}

const HH_COLS = `household_id, household_name, advisor_id, segment, model_id, city, aum, cash_pct, cash_months,
  top_stock, top_stock_pct, max_drift, net_flow_12m, attrition_score`;

function toSummary(r: Row, rmd: Map<string, { name: string; birthDate: string }[]>): HouseholdSummary {
  return {
    id: String(r.HOUSEHOLD_ID), name: String(r.HOUSEHOLD_NAME), advisorId: String(r.ADVISOR_ID), segment: String(r.SEGMENT),
    model: String(r.MODEL_ID), city: String(r.CITY), aum: num(r.AUM), cashPct: num(r.CASH_PCT), cashMonths: num(r.CASH_MONTHS),
    maxDrift: num(r.MAX_DRIFT), topStock: { ticker: (r.TOP_STOCK as string) ?? null, pct: num(r.TOP_STOCK_PCT) },
    netFlow: num(r.NET_FLOW_12M), attrition: num(r.ATTRITION_SCORE), rmd: rmd.get(String(r.HOUSEHOLD_ID)) ?? [],
  };
}

async function rmdClients(role: string, householdId?: string) {
  const rows = await query<Row>(role,
    `SELECT household_id, first_name || ' ' || last_name AS name, birth_date FROM CLIENT_PROFILES
     WHERE turns_73_in_2026 AND has_ira ${householdId ? 'AND household_id = ?' : ''}`, householdId ? [householdId] : []);
  const m = new Map<string, { name: string; birthDate: string }[]>();
  for (const r of rows) m.set(String(r.HOUSEHOLD_ID), [...(m.get(String(r.HOUSEHOLD_ID)) ?? []), { name: String(r.NAME), birthDate: day(r.BIRTH_DATE) }]);
  return m;
}

async function logInteraction(role: string, e: { surface: string; prompt: string; response: string; sources: string[]; guardrail: unknown; latencyMs: number; requestId?: string }) {
  const id = randomUUID();
  await query(role,
    `INSERT INTO APP.AI_INTERACTION_LOG (interaction_id, surface, prompt, response, sources, guardrail_flags, latency_ms, request_id)
     SELECT ?, ?, ?, ?, PARSE_JSON(?), PARSE_JSON(?), ?, ?`,
    [id, e.surface, e.prompt, e.response, JSON.stringify(e.sources), JSON.stringify(e.guardrail), e.latencyMs, e.requestId ?? null]);
  return id;
}

// Cortex Guard: AI_COMPLETE with guardrails = TRUE. A filtered response replaces the text.
async function complete(persona: PersonaId, surface: string, prompt: string, facts: unknown, sources: string[]): Promise<AiAnswer> {
  const role = roleOf(persona);
  const full = `${prompt}\n\nUse only these facts (synthetic data):\n<facts>${JSON.stringify(facts)}</facts>\n\nEnd with: "Suggestions for advisor review only; not investment or tax advice."`;
  const [rows, latencyMs] = await timed(() => query<{ R: string }>(role,
    `SELECT AI_COMPLETE(model => ?, prompt => ?, model_parameters => {'temperature': 0.2, 'max_tokens': 900, 'guardrails': TRUE}, show_details => TRUE)::VARCHAR AS R`,
    [MODEL, full]));
  const parsed = JSON.parse(rows[0].R);
  const text: string = parsed.choices?.[0]?.messages ?? '';
  const flagged = /filtered by cortex guard/i.test(text);
  // show_details does not report a guardrail verdict for passing responses, so record only what is known.
  const guardrail = { checked: true, flagged, detail: flagged ? 'Response filtered by Cortex Guard' : 'Cortex Guard enabled (guardrails: TRUE); response not filtered' };
  const interactionId = await logInteraction(role, { surface, prompt, response: text, sources, guardrail, latencyMs });
  return { text, sources, guardrail, source: 'snowflake', role, latencyMs, interactionId };
}

export const liveData: AdvisorData = {
  async book(persona): Promise<BookView> {
    const role = roleOf(persona);
    const [[hh, acts, monthly, advisors, models, rmd], latencyMs] = await timed(() => Promise.all([
      query<Row>(role, `SELECT ${HH_COLS} FROM HOUSEHOLD_METRICS`),
      query<Row>(role, 'SELECT household_id, household_name, advisor_id, action_type, priority, impact, reason FROM NEXT_BEST_ACTIONS'),
      query<Row>(role,
        `WITH c AS (SELECT month_end, SUM(total_value) AS aum FROM CASH_BALANCES GROUP BY 1),
              f AS (SELECT LAST_DAY(txn_date) AS month_end, SUM(amount) AS net_flow FROM TRANSACTIONS GROUP BY 1)
         SELECT c.month_end, c.aum, COALESCE(f.net_flow, 0) AS net_flow FROM c LEFT JOIN f USING (month_end) ORDER BY 1`),
      query<Row>(role, 'SELECT advisor_id, advisor_name, branch_id, branch_name FROM ADVISORS ORDER BY advisor_id'),
      query<Row>(role, 'SELECT model_id, model_name, asset_class, target_pct FROM MODEL_PORTFOLIOS'),
      rmdClients(role),
    ]));
    const households = hh.map((r) => toSummary(r, rmd));
    const actions: HouseholdAction[] = acts.map((r) => ({
      type: r.ACTION_TYPE as HouseholdAction['type'], priority: num(r.PRIORITY), impact: num(r.IMPACT), reason: String(r.REASON),
      household_id: String(r.HOUSEHOLD_ID), household_name: String(r.HOUSEHOLD_NAME), advisor_id: String(r.ADVISOR_ID),
    }));
    const modelMap = new Map<string, { id: string; name: string; weights: Record<string, number> }>();
    for (const m of models) {
      const id = String(m.MODEL_ID);
      const e = modelMap.get(id) ?? { id, name: String(m.MODEL_NAME), weights: {} };
      e.weights[String(m.ASSET_CLASS)] = num(m.TARGET_PCT);
      modelMap.set(id, e);
    }
    return {
      source: 'snowflake', role, latencyMs, asOf: '2026-10-31',
      advisors: advisors.map((a) => ({ advisor_id: String(a.ADVISOR_ID), advisor_name: String(a.ADVISOR_NAME), branch_id: String(a.BRANCH_ID), branch_name: String(a.BRANCH_NAME) })),
      models: [...modelMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
      households, actions, brief: buildBrief(actions, households),
      monthly: monthly.map((m) => ({ month: day(m.MONTH_END), aum: num(m.AUM), netFlow: num(m.NET_FLOW) })),
    };
  },

  async household(persona, id) {
    const role = roleOf(persona);
    const [result, latencyMs] = await timed(async () => {
      const head = await query<Row>(role, `SELECT ${HH_COLS} FROM HOUSEHOLD_METRICS WHERE household_id = ?`, [id]);
      if (!head.length) return null; // not visible to this role (or does not exist)
      const b = [id];
      const [clients, accounts, holdings, drift, events, notes, cases, cash, logins, txns, rmd] = await Promise.all([
        query<Row>(role, 'SELECT client_id, first_name, last_name, birth_date, is_primary FROM CLIENTS WHERE household_id = ? ORDER BY is_primary DESC', b),
        query<Row>(role, `SELECT a.account_id, a.account_type, COALESCE(SUM(p.market_value), 0) AS value FROM ACCOUNTS a
                          LEFT JOIN POSITIONS p ON p.account_id = a.account_id WHERE a.household_id = ? GROUP BY 1, 2 ORDER BY value DESC`, b),
        query<Row>(role, `SELECT s.security_id, s.name, s.asset_class, s.is_single_stock, SUM(p.market_value) AS value,
                                 ROUND(100 * RATIO_TO_REPORT(SUM(p.market_value)) OVER (), 2) AS pct
                          FROM POSITIONS p JOIN SECURITIES s ON s.security_id = p.security_id WHERE p.household_id = ? GROUP BY 1, 2, 3, 4 ORDER BY value DESC`, b),
        query<Row>(role, `SELECT m.asset_class, m.target_pct, ROUND(100 * COALESCE(c.mv, 0) / NULLIF(t.aum, 0), 2) AS actual
                          FROM HOUSEHOLDS h JOIN MODEL_PORTFOLIOS m ON m.model_id = h.model_id
                          CROSS JOIN (SELECT SUM(market_value) AS aum FROM POSITIONS WHERE household_id = ?) t
                          LEFT JOIN (SELECT s.asset_class, SUM(p.market_value) AS mv FROM POSITIONS p JOIN SECURITIES s ON s.security_id = p.security_id
                                     WHERE p.household_id = ? GROUP BY 1) c ON c.asset_class = m.asset_class
                          WHERE h.household_id = ?`, [id, id, id]),
        query<Row>(role, 'SELECT event_type, event_date, detail FROM LIFE_EVENTS WHERE household_id = ? ORDER BY event_date', b),
        query<Row>(role, 'SELECT note_date, author, note_text, sentiment FROM NOTES_ENRICHED WHERE household_id = ? ORDER BY note_date DESC', b),
        query<Row>(role, 'SELECT case_id, opened_date, status, category, subject FROM SERVICE_CASES WHERE household_id = ? ORDER BY opened_date DESC', b),
        query<Row>(role, 'SELECT month_end, cash_pct FROM CASH_BALANCES WHERE household_id = ? ORDER BY month_end', b),
        query<Row>(role, 'SELECT month_end, logins FROM PORTAL_LOGINS WHERE household_id = ? ORDER BY month_end', b),
        query<Row>(role, 'SELECT txn_date, txn_type, amount, counterparty FROM TRANSACTIONS WHERE household_id = ? ORDER BY txn_date DESC LIMIT 8', b),
        rmdClients(role, id),
      ]);
      const detail: HouseholdDetail = {
        clients: clients.map((c) => ({ client_id: String(c.CLIENT_ID), first_name: String(c.FIRST_NAME), last_name: String(c.LAST_NAME), birth_date: day(c.BIRTH_DATE), is_primary: !!c.IS_PRIMARY })),
        accounts: accounts.map((a) => ({ id: String(a.ACCOUNT_ID), type: String(a.ACCOUNT_TYPE), value: num(a.VALUE), heldAway: a.ACCOUNT_TYPE === '401(k) rollover-eligible' })),
        holdings: holdings.map((h) => ({ id: String(h.SECURITY_ID), name: String(h.NAME), assetClass: String(h.ASSET_CLASS), single: !!h.IS_SINGLE_STOCK, value: num(h.VALUE), pct: num(h.PCT) })),
        drift: drift.map((d) => ({ asset_class: String(d.ASSET_CLASS), target: num(d.TARGET_PCT), actual: num(d.ACTUAL) })),
        events: events.map((e) => ({ type: String(e.EVENT_TYPE), date: day(e.EVENT_DATE), detail: String(e.DETAIL ?? '') })),
        notes: notes.map((n) => ({ date: day(n.NOTE_DATE), author: String(n.AUTHOR), text: String(n.NOTE_TEXT), sentiment: (n.SENTIMENT as string) ?? null })),
        cases: cases.map((c) => ({ id: String(c.CASE_ID), opened: day(c.OPENED_DATE), status: String(c.STATUS), category: String(c.CATEGORY), subject: String(c.SUBJECT) })),
        cash: cash.map((c) => ({ month: day(c.MONTH_END), pct: num(c.CASH_PCT) })),
        logins: logins.map((l) => ({ month: day(l.MONTH_END), logins: num(l.LOGINS) })),
        transactions: txns.map((t) => ({ date: day(t.TXN_DATE), type: String(t.TXN_TYPE), amount: num(t.AMOUNT), counterparty: String(t.COUNTERPARTY ?? '') })),
      };
      return { summary: toSummary(head[0], rmd), detail };
    });
    return result && { ...result, source: 'snowflake' as const, role, latencyMs };
  },

  async explain(persona, item: BriefItem) {
    return complete(persona, 'explanation',
      'You coach a financial advisor. In under 110 words, explain why this next best action matters now and suggest one concrete next step. Use **Why now:** and **Suggested next step:** headings.',
      { action: item.type, title: item.title, reason: item.reason, impact_usd: Math.round(item.impact), households: item.households.slice(0, 20) },
      ['AI_COMPLETE (Cortex Guard on)', 'NEXT_BEST_ACTIONS']);
  },

  async agenda(persona, householdId) {
    const v = await liveData.household(persona, householdId);
    if (!v) throw new Error('Household not visible to this role');
    const { summary: s, detail: d } = v;
    return complete(persona, 'agenda',
      'Draft a client review meeting agenda (numbered, 4-6 items) and 3-4 talking points for this household. Be specific and factual. Markdown.',
      { household: s.name, aum: s.aum, segment: s.segment, model: s.model, cash_pct: s.cashPct, cash_months: s.cashMonths, top_stock: s.topStock, max_drift: s.maxDrift,
        attrition_score: s.attrition, rmd_clients: s.rmd, clients: d.clients.map((c) => c.first_name), events: d.events, recent_notes: d.notes.slice(0, 4), open_cases: d.cases.filter((c) => c.status === 'Open') },
      ['AI_COMPLETE (Cortex Guard on)', 'Household 360 (row access policy applied)']);
  },

  async coach(persona, question) {
    const role = roleOf(persona);
    const body = JSON.stringify({ messages: [{ role: 'user', content: [{ type: 'text', text: question }] }] });
    const [rows, latencyMs] = await timed(() => query<{ R: string }>(role, 'SELECT SNOWFLAKE.CORTEX.DATA_AGENT_RUN(?, ?, TRUE)::VARCHAR AS R', [AGENT, body]));
    const resp = JSON.parse(rows[0].R);
    const content: Row[] = resp.content ?? [];
    const text = content.filter((c) => c.type === 'text').map((c) => String(c.text)).join('\n').trim();
    const sources = [...new Set(content.filter((c) => c.type === 'tool_use' || c.type === 'tool_result')
      .map((c) => String((c.tool_use as Row | undefined)?.name ?? (c.tool_result as Row | undefined)?.name ?? '')).filter(Boolean))];
    const guardrailNote = content.find((c) => /guardrail/i.test(JSON.stringify(c)));
    const guardrail = { checked: true, flagged: !!guardrailNote, detail: guardrailNote ? 'Guardrail signal in agent response' : 'Account AI Guardrails enabled; no signal in response' };
    const requestId = resp.request_id ?? resp.metadata?.request_id;
    const interactionId = await logInteraction(role, { surface: 'coach', prompt: question, response: text, sources, guardrail, latencyMs, requestId });
    return { text: text || '(No text in agent response.)', sources, guardrail, source: 'snowflake', role, latencyMs, interactionId };
  },

  async recordAction(persona, input: ActionInput) {
    const role = roleOf(persona);
    await query(role, 'INSERT INTO APP.ADVISOR_ACTIONS (household_id, action_type, decision, note) SELECT ?, ?, ?, ?',
      [input.householdId, input.actionType, input.decision, input.note]);
    return { ok: true, source: 'snowflake', role };
  },

  async log(): Promise<LogEntry[]> {
    const rows = await query<Row>(SUPERVISOR_ROLE,
      `SELECT interaction_id, logged_at, user_name, role_name, surface, prompt, response, sources, guardrail_flags, latency_ms
       FROM APP.AI_INTERACTION_LOG ORDER BY logged_at DESC LIMIT 200`);
    const parse = (x: unknown) => (typeof x === 'string' ? JSON.parse(x) : x);
    return rows.map((r) => ({
      id: String(r.INTERACTION_ID), at: new Date(r.LOGGED_AT as string).toISOString(), user: String(r.USER_NAME), role: String(r.ROLE_NAME),
      surface: String(r.SURFACE), prompt: String(r.PROMPT), response: String(r.RESPONSE ?? ''), sources: parse(r.SOURCES) ?? [],
      guardrail: parse(r.GUARDRAIL_FLAGS) ?? { checked: false, flagged: false }, latencyMs: num(r.LATENCY_MS), source: 'snowflake',
    }));
  },

  // AI Observability: one row per agent turn, read with MONITOR on the agent (no access to book data).
  async traces(): Promise<AgentTrace[]> {
    const [db, schema, name] = AGENT.split('.');
    const rows = await query<Row>(SUPERVISOR_ROLE,
      `SELECT start_timestamp,
              record_attributes:"snow.ai.observability.agent.request_id"::STRING AS request_id,
              record_attributes:"snow.ai.observability.agent.duration"::NUMBER AS duration_ms,
              resource_attributes:"snow.session.role.primary.name"::STRING AS role_name,
              COALESCE(record_attributes:"snow.ai.observability.agent.status.code"::STRING, record:status:code::STRING, '') AS status
       FROM TABLE(SNOWFLAKE.LOCAL.GET_AI_OBSERVABILITY_EVENTS(?, ?, ?, 'CORTEX AGENT'))
       WHERE record:name = 'AgentV2RequestResponseInfo'
       ORDER BY start_timestamp DESC LIMIT 50`, [db, schema, name]);
    return rows.map((r) => ({ at: new Date(r.START_TIMESTAMP as string).toISOString(), requestId: String(r.REQUEST_ID), role: String(r.ROLE_NAME ?? ''),
      durationMs: num(r.DURATION_MS), status: String(r.STATUS ?? ''), source: 'snowflake' }));
  },
};
