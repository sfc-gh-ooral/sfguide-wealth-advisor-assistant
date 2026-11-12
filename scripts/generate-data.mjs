// Seeded, deterministic synthetic data for the Wealth Advisor Assistant.
// Same seed -> same files, every run. All people, firms, and securities are fictional.
//
//   node scripts/generate-data.mjs
//
// Writes:
//   data/csv/*.csv.gz        full data set (~25K households) loaded by sql/setup.sql
//   lib/mock/book.json       branch BR01 summaries bundled for no-account mode
//   public/mock/hh/*.json    per-household detail for BR01, fetched on demand
//
// The next-best-action and attrition rules below are mirrored in sql/setup.sql
// (views V_NEXT_BEST_ACTIONS and V_ATTRITION). Change both together.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const SEED = 20261112;
const AS_OF = "2026-10-31"; // month-end snapshot used everywhere
const MONTHS = Array.from({ length: 12 }, (_, i) => monthEnd(2025, 11 + i)); // 2025-11 .. 2026-10

// ---------- deterministic helpers ----------
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
const round2 = (x) => Math.round(x * 100) / 100;
function lognormal(median, sigma) {
  const u = Math.max(rnd(), 1e-9), v = rnd();
  return median * Math.exp(sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v));
}
function monthEnd(y, m) { // m may exceed 12
  const yy = y + Math.floor((m - 1) / 12), mm = ((m - 1) % 12) + 1;
  return new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
}
function dateIn(start, end) {
  const a = Date.parse(start), b = Date.parse(end);
  return new Date(a + Math.floor(rnd() * (b - a))).toISOString().slice(0, 10);
}
const pad = (n, w) => String(n).padStart(w, "0");

// ---------- reference data ----------
const FIRST = ["James","Mary","Robert","Patricia","John","Jennifer","Michael","Linda","David","Elizabeth","William","Barbara","Richard","Susan","Joseph","Jessica","Thomas","Sarah","Charles","Karen","Daniel","Nancy","Matthew","Lisa","Anthony","Betty","Mark","Sandra","Steven","Ashley","Paul","Kimberly","Andrew","Emily","Joshua","Donna","Kenneth","Michelle","Kevin","Carol","Brian","Amanda","George","Melissa","Timothy","Deborah","Ravi","Priya","Wei","Mei","Hiroshi","Yuki","Omar","Layla","Mateo","Sofia","Diego","Lucia","Kwame","Ama","Ivan","Olga","Liam","Nora","Elena","Arjun","Fatima","Tariq","Grace","Owen"];
const LAST = ["Anderson","Brooks","Carter","Dawson","Ellis","Foster","Garcia","Hughes","Iverson","Jensen","Keller","Lambert","Morgan","Nguyen","Olsen","Patel","Quinn","Reyes","Sullivan","Turner","Underwood","Vance","Walsh","Xu","Young","Zimmerman","Abbott","Bishop","Coleman","Donovan","Everett","Fischer","Grant","Hayes","Ingram","Jordan","Kim","Larsen","Mendez","Nash","Ortiz","Parker","Ramos","Shah","Tanaka","Holloway","Whitaker","Yates","Bauer","Castillo","Delgado","Ferreira","Gallagher","Haddad","Ibarra","Kowalski","Lindqvist","Moreau","Novak","Petrov","Romero","Sato","Thornton","Varga","Weber","Adeyemi","Banerjee","Cohen","Duarte","Erikson"];
// Names reserved for planted stories; never used for background households.
const RESERVED = new Set(["Martinez","Okafor","Chen-Whitaker"]);

const BRANCHES = ["Lakeside","Harbor Point","Cedar Ridge","Riverbend","Summit Park","Westgate","Northfield","Bayview","Oak Hollow","Granite Falls","Meadowbrook","Pine Crest"]
  .map((name, i) => ({ branch_id: "BR" + pad(i + 1, 2), branch_name: name }));

const MODELS = [
  { model_id: "M1", name: "Conservative",     w: { "US Equity": 25, "International Equity": 5,  "Fixed Income": 63, "Alternatives": 5, "Cash": 2 } },
  { model_id: "M2", name: "Moderate",         w: { "US Equity": 40, "International Equity": 12, "Fixed Income": 41, "Alternatives": 5, "Cash": 2 } },
  { model_id: "M3", name: "Balanced Growth",  w: { "US Equity": 50, "International Equity": 15, "Fixed Income": 28, "Alternatives": 5, "Cash": 2 } },
  { model_id: "M4", name: "Growth",           w: { "US Equity": 60, "International Equity": 20, "Fixed Income": 13, "Alternatives": 5, "Cash": 2 } },
  { model_id: "M5", name: "Income",           w: { "US Equity": 20, "International Equity": 5,  "Fixed Income": 70, "Alternatives": 3, "Cash": 2 } },
];

// Fictional securities. Tickers are made up for this example.
const FUNDS = [
  ["BUSX", "Broad US Equity Index Fund", "US Equity"],
  ["ULGX", "US Large Cap Growth Fund", "US Equity"],
  ["UDVX", "US Dividend Income Fund", "US Equity"],
  ["DMIX", "Developed Markets Index Fund", "International Equity"],
  ["EMFX", "Emerging Markets Equity Fund", "International Equity"],
  ["CBDX", "Core Bond Fund", "Fixed Income"],
  ["STTX", "Short-Term Treasury Fund", "Fixed Income"],
  ["MUNX", "Intermediate Municipal Bond Fund", "Fixed Income"],
  ["RAFX", "Real Assets Fund", "Alternatives"],
  ["SWPX", "Firm Cash Sweep", "Cash"],
];
const STOCKS = [
  ["NWRB", "Northwind Robotics"], ["HLXB", "Helixbay Therapeutics"], ["QRVT", "Quarrivant Energy"],
  ["LUMQ", "Lumiquest Software"], ["TRDX", "Tradewell Logistics"], ["VNTH", "Venthora Materials"],
  ["OKRA", "Okrana Foods"], ["ZPLN", "Zephyrline Aerospace"], ["CRSV", "Crestvale Bancorp"], ["MDWK", "Meadowark Health"],
];
const SECURITIES = [
  ...FUNDS.map(([t, n, c]) => ({ security_id: t, name: n, asset_class: c, is_single_stock: false })),
  ...STOCKS.map(([t, n]) => ({ security_id: t, name: n + " (common stock)", asset_class: "US Equity", is_single_stock: true })),
];
const FUNDS_BY_CLASS = {};
for (const s of SECURITIES) if (!s.is_single_stock) (FUNDS_BY_CLASS[s.asset_class] ??= []).push(s.security_id);

const SEGMENTS = [ // by household AUM
  { name: "Emerging", max: 250e3 }, { name: "Core", max: 1e6 }, { name: "Premier", max: 5e6 }, { name: "Private", max: Infinity },
];
const segmentOf = (aum) => SEGMENTS.find((s) => aum < s.max).name;
const CITIES = [["Columbus","OH"],["Raleigh","NC"],["Denver","CO"],["Tampa","FL"],["Minneapolis","MN"],["Austin","TX"],["Portland","OR"],["Richmond","VA"],["Madison","WI"],["Scottsdale","AZ"],["Charlotte","NC"],["Boise","ID"]];

// ---------- advisors ----------
// ADV001 and ADV002 are the two "View as" advisors; both sit in branch BR01 (Lakeside).
const ADVISOR_NAMES = { ADV001: "Dana Whitfield", ADV002: "Marcus Lee" };
const advisors = [];
for (let i = 1; i <= 200; i++) {
  const id = "ADV" + pad(i, 3);
  const branch = i <= 8 ? BRANCHES[0] : BRANCHES[1 + ((i - 9) % 11)];
  advisors.push({
    advisor_id: id,
    advisor_name: ADVISOR_NAMES[id] ?? `${pick(FIRST)} ${pick(LAST)}`,
    branch_id: branch.branch_id,
    branch_name: branch.branch_name,
    hire_year: int(2004, 2023),
  });
}
const branchManagers = BRANCHES.map((b, i) => ({ branch_id: b.branch_id, manager_name: i === 0 ? "Alicia Romero" : `${pick(FIRST)} ${pick(LAST)}` }));

// ---------- tables ----------
const T = { households: [], clients: [], accounts: [], positions: [], cash_balances: [], transactions: [], life_events: [], crm_notes: [], service_cases: [], portal_logins: [] };
let hhSeq = 0, clSeq = 0, acSeq = 0, txSeq = 0, noteSeq = 0, caseSeq = 0, evSeq = 0;
const usedNames = {};

const NOTE_TEMPLATES = {
  positive: [
    "Annual review went well. {f} is happy with performance and asked about adding to the 529 for the grandchildren.",
    "Quick check-in call. {f} appreciated the tax-loss harvesting summary and wants to keep the current allocation.",
    "Met with {f} and spouse. They are comfortable with the plan and referred a colleague who is retiring next year.",
    "{f} thanked us for the fast turnaround on the distribution request. No concerns raised.",
  ],
  neutral: [
    "Updated beneficiary designations on the IRA per {f}'s request. Paperwork sent for e-signature.",
    "{f} called to confirm the address change. Mentioned a possible home renovation next spring.",
    "Reviewed statement questions with {f}; explained the fee line and the dividend reinvestment timing.",
    "Scheduled the annual review for next quarter. {f} wants to discuss Social Security timing.",
  ],
  negative: [
    "{f} was unhappy that the transfer took three weeks and said communication was poor.",
    "{f} questioned the advisory fee again and asked why returns lagged the index this year.",
  ],
};
const CASE_TYPES = [["Address change","Service"],["Distribution request","Money movement"],["Statement question","Service"],["Beneficiary update","Account maintenance"],["Fee inquiry","Complaint"],["Transfer delay","Complaint"],["Password reset","Digital"]];

function newHousehold(advisor, opts = {}) {
  hhSeq++;
  const household_id = "HH" + pad(hhSeq, 6);
  let last = opts.last ?? pick(LAST);
  while (!opts.last && RESERVED.has(last)) last = pick(LAST);
  // Household names are unique within an advisor's book; collisions become double-barreled names.
  const used = (usedNames[advisor.advisor_id] ??= new Set());
  while (!opts.last && (used.has(last) || RESERVED.has(last))) last = `${pick(LAST)}-${pick(LAST)}`;
  used.add(last);
  const aum = opts.aum ?? Math.min(Math.max(lognormal(620e3, 1.05), 40e3), 28e6);
  const model = opts.model ?? pick(MODELS);
  const [city, state] = pick(CITIES);
  const hh = {
    household_id, advisor_id: advisor.advisor_id, household_name: `${last} Household`, last_name: last,
    segment: segmentOf(aum), model_id: model.model_id, city, state,
    client_since: dateIn("2006-01-01", "2024-06-30"), _aum: aum, _model: model, _opts: opts,
  };
  T.households.push(hh);

  // clients: primary + maybe spouse
  const nClients = opts.clients?.length ?? (chance(0.62) ? 2 : 1);
  const clients = [];
  for (let c = 0; c < nClients; c++) {
    const spec = opts.clients?.[c] ?? {};
    clSeq++;
    // Background birth years avoid 1953 for the two story advisors so the RMD list is exactly the planted set.
    let by = spec.birthYear ?? int(1940, 1992);
    if (!spec.birthYear && (advisor.advisor_id === "ADV001" || advisor.advisor_id === "ADV002")) while (by === 1953) by = int(1940, 1992);
    const cl = {
      client_id: "CL" + pad(clSeq, 6), household_id, first_name: spec.first ?? pick(FIRST), last_name: last,
      birth_date: `${by}-${pad(spec.birthMonth ?? int(1, 12), 2)}-${pad(int(1, 28), 2)}`, is_primary: c === 0,
    };
    clients.push(cl); T.clients.push(cl);
  }

  // accounts
  const types = opts.accountTypes ?? (() => {
    const t = ["Advisory"];
    if (chance(0.6)) t.push("IRA");
    if (chance(0.35)) t.push("Brokerage");
    if (chance(0.12)) t.push("401(k) rollover-eligible");
    return t;
  })();
  const weights = types.map(() => 0.5 + rnd());
  const wsum = weights.reduce((a, b) => a + b, 0);
  const accounts = types.map((type, k) => {
    acSeq++;
    const ac = {
      account_id: "AC" + pad(acSeq, 7), household_id, client_id: clients[k % clients.length].client_id,
      account_type: type, opened_date: dateIn(hh.client_since, "2025-12-31"), _value: (aum * weights[k]) / wsum,
    };
    if (type === "IRA" && opts.iraOwnerIdx !== undefined) ac.client_id = clients[opts.iraOwnerIdx].client_id;
    T.accounts.push(ac);
    return ac;
  });
  // Every 401(k) rollover-eligible account is held away, so it carries no positions here.
  const managed = accounts.filter((a) => a.account_type !== "401(k) rollover-eligible");
  const managedValue = managed.reduce((s, a) => s + a._value, 0);

  // cash percentage path (12 months)
  const cashPath = opts.cashPath ?? (() => {
    const drag = advisor.advisor_id === "ADV001" || advisor.advisor_id === "ADV002" ? false : chance(0.03);
    return MONTHS.map(() => drag ? 11 + rnd() * 9 : 1 + rnd() * (advisor.advisor_id === "ADV001" ? 5.5 : 7));
  })();
  const cashPct = cashPath[11] / 100;
  const singleStock = opts.singleStock ?? (chance(0.18) && advisor.advisor_id !== "ADV001" ? { ticker: pick(STOCKS)[0], pct: advisor.advisor_id === "ADV002" ? 0.03 + rnd() * 0.09 : 0.03 + rnd() * (chance(0.15) ? 0.3 : 0.1) } : null);
  const ssPct = singleStock?.pct ?? 0;

  // positions, by asset class with drift noise from the model target
  for (const ac of managed) {
    const share = ac._value / managedValue;
    const hhValue = managedValue * share;
    const cls = { ...model.w };
    delete cls.Cash;
    const nonCashTotal = Object.values(cls).reduce((a, b) => a + b, 0);
    const pos = {};
    pos.SWPX = hhValue * cashPct;
    if (singleStock) pos[singleStock.ticker] = hhValue * ssPct;
    const remaining = hhValue * (1 - cashPct - ssPct);
    for (const [c, w] of Object.entries(cls)) {
      const noisy = Math.max(0, w * (1 + (rnd() - 0.5) * (opts.driftNoise ?? 0.35)));
      const funds = FUNDS_BY_CLASS[c];
      const n = Math.min(funds.length, int(1, 2));
      const first = int(0, funds.length - 1);
      for (let f = 0; f < n; f++) { const k = funds[(first + f) % funds.length]; pos[k] = (pos[k] ?? 0) + (remaining * noisy) / nonCashTotal / n; }
    }
    // renormalize non-cash, non-single-stock so the account sums to its value
    const keys = Object.keys(pos).filter((k) => k !== "SWPX" && k !== singleStock?.ticker);
    const sumK = keys.reduce((s, k) => s + pos[k], 0);
    for (const k of keys) pos[k] = (pos[k] / sumK) * remaining;
    for (const [security_id, mv] of Object.entries(pos)) if (mv > 0.5) T.positions.push({ account_id: ac.account_id, household_id, security_id, market_value: round2(mv), as_of_date: AS_OF });
  }

  // monthly cash balances & totals (gentle market drift)
  let tv = managedValue / (1 + 0.006 * 11);
  MONTHS.forEach((m, i) => {
    const total = i === 11 ? managedValue : tv * (1 + 0.006 * i) * (1 + (rnd() - 0.5) * 0.01);
    T.cash_balances.push({ household_id, month_end: m, total_value: round2(total), cash_value: round2((total * cashPath[i]) / 100), cash_pct: round2(cashPath[i]) });
  });

  // portal logins
  const loginPath = opts.loginPath ?? (() => {
    const declining = !["ADV001", "ADV002"].includes(advisor.advisor_id) && chance(0.01);
    const base = int(2, 9);
    return MONTHS.map((_, i) => Math.max(0, declining ? Math.round(base * (1 - i / 11)) : base + int(-2, 2)));
  })();
  MONTHS.forEach((m, i) => T.portal_logins.push({ household_id, month_end: m, logins: loginPath[i] }));

  // transactions (deposits / withdrawals), plus any planted ones
  const nTx = int(2, 6);
  for (let k = 0; k < nTx; k++) {
    const dep = chance(0.55);
    const ac = pick(managed);
    T.transactions.push({ txn_id: "TX" + pad(++txSeq, 8), account_id: ac.account_id, household_id, txn_date: dateIn("2025-11-01", AS_OF), txn_type: dep ? "DEPOSIT" : "WITHDRAWAL", amount: round2((dep ? 1 : -1) * aum * (0.003 + rnd() * 0.02)), counterparty: dep ? "External bank" : "External bank" });
  }
  for (const t of opts.transactions ?? []) T.transactions.push({ txn_id: "TX" + pad(++txSeq, 8), account_id: managed[0].account_id, household_id, ...t });

  // CRM notes
  const advisorFirst = advisor.advisor_name.split(" ")[0];
  const notes = opts.notes ?? Array.from({ length: int(0, 3) }, () => {
    const tone = ["ADV001", "ADV002"].includes(advisor.advisor_id) ? (chance(0.7) ? "positive" : "neutral") : (chance(0.06) ? "negative" : chance(0.6) ? "positive" : "neutral");
    return { tone, text: pick(NOTE_TEMPLATES[tone]).replaceAll("{f}", clients[0].first_name), date: dateIn("2025-11-01", AS_OF) };
  });
  for (const n of notes) T.crm_notes.push({ note_id: "NT" + pad(++noteSeq, 7), household_id, advisor_id: advisor.advisor_id, note_date: n.date, author: advisorFirst, note_text: n.text, _tone: n.tone });

  // service cases
  const cases = opts.cases ?? (chance(0.28) ? [(() => { const [s, c] = pick(CASE_TYPES.filter(([, c]) => ["ADV001", "ADV002"].includes(advisor.advisor_id) ? c !== "Complaint" : true)); return { subject: s, category: c, status: chance(0.8) ? "Closed" : "Open", opened: dateIn("2025-11-01", AS_OF) }; })()] : []);
  for (const c of cases) T.service_cases.push({ case_id: "SC" + pad(++caseSeq, 6), household_id, opened_date: c.opened, status: c.status, category: c.category, subject: c.subject });

  // life events (non-RMD); RMD-age events are derived from birth dates below
  for (const e of opts.events ?? (chance(0.04) ? [{ type: pick(["New grandchild", "Retirement", "Home purchase", "New baby", "Child starting college"]), date: dateIn("2026-01-01", "2027-03-31") }] : []))
    T.life_events.push({ event_id: "EV" + pad(++evSeq, 6), household_id, client_id: clients[0].client_id, event_type: e.type, event_date: e.date, detail: e.detail ?? "" });

  return hh;
}

// ---------- planted stories (Advisor A = ADV001 Dana Whitfield) ----------
const A = advisors[0], B = advisors[1];
const steady = (lo, hi) => MONTHS.map(() => lo + rnd() * (hi - lo));

// (4) Martinez: high AUM, declining logins, negative CRM sentiment, open complaint, outflow -> attrition risk
newHousehold(A, {
  last: "Martinez", aum: 4.2e6, model: MODELS[2],
  clients: [{ first: "Robert", birthYear: 1961, birthMonth: 4 }, { first: "Elena", birthYear: 1963, birthMonth: 9 }],
  accountTypes: ["Advisory", "IRA", "Brokerage"],
  loginPath: [9, 8, 9, 8, 7, 7, 6, 4, 3, 1, 1, 0],
  cashPath: steady(2, 4),
  transactions: [{ txn_date: "2026-09-18", txn_type: "WITHDRAWAL", amount: -185000, counterparty: "External bank" }],
  notes: [
    { tone: "neutral", date: "2026-03-14", text: "Annual review with Robert and Elena. Discussed trust funding for the lake property; they want paperwork done before summer." },
    { tone: "negative", date: "2026-08-02", text: "Robert called frustrated that the trust paperwork is still not complete after four months. Said he feels like he is chasing us." },
    { tone: "negative", date: "2026-10-09", text: "Elena asked for a full fee breakdown and mentioned a friend's advisor at another firm charges much less. Tone was cold; they declined to book the Q4 review." },
  ],
  cases: [{ subject: "Trust account paperwork delay", category: "Complaint", status: "Open", opened: "2026-06-20" }],
});
// (2) Okafor: 30% in a single stock
newHousehold(A, {
  last: "Okafor", aum: 2.1e6, model: MODELS[1], singleStock: { ticker: "NWRB", pct: 0.30 },
  clients: [{ first: "Chidi", birthYear: 1968, birthMonth: 2 }, { first: "Adaeze", birthYear: 1970, birthMonth: 11 }],
  accountTypes: ["Advisory", "Brokerage", "IRA"], cashPath: steady(2, 4),
  notes: [
    { tone: "positive", date: "2026-05-22", text: "Chidi received another vest of Northwind Robotics shares from his employer. Proud of the company; reluctant to sell because of the gain." },
    { tone: "neutral", date: "2026-09-30", text: "Adaeze asked whether they are too exposed to one stock now that it is a big part of the portfolio. Agreed to revisit at the next meeting." },
  ],
  events: [{ type: "Child starting college", date: "2027-08-20", detail: "Eldest starts university next fall" }],
});
// (5) Outflow transfer to a competitor
newHousehold(A, {
  last: "Chen-Whitaker", aum: 1.35e6, model: MODELS[3], cashPath: steady(2, 4),
  clients: [{ first: "Grace", birthYear: 1975, birthMonth: 6 }],
  accountTypes: ["Advisory", "IRA"],
  transactions: [{ txn_date: "2026-10-21", txn_type: "ACAT_OUT", amount: -642000, counterparty: "Harborview Investments" }],
  notes: [{ tone: "neutral", date: "2026-07-11", text: "Grace mentioned her new employer offers a managed account program through another firm. Did not ask for anything specific." }],
});
// (3) 9 clients turning 73 in 2026 with IRAs -> RMD planning
for (let k = 0; k < 9; k++) newHousehold(A, {
  clients: [{ birthYear: 1953, birthMonth: [1, 2, 3, 5, 6, 8, 10, 11, 12][k] }], accountTypes: ["Advisory", "IRA"], iraOwnerIdx: 0, cashPath: steady(1.5, 5),
});
// (1) 18 households holding >10% cash for 6+ months
for (let k = 0; k < 18; k++) {
  const start = k % 3 === 0 ? 0 : k % 3 === 1 ? 3 : 6; // 12, 9, or 6 months of elevated cash
  newHousehold(A, { cashPath: MONTHS.map((_, i) => (i >= start ? 10.5 + rnd() * 14 : 2 + rnd() * 3)) });
}
// Advisor B: 4 RMD-age clients and a Martinez-free book (proves isolation in the coach)
for (let k = 0; k < 4; k++) newHousehold(B, { clients: [{ birthYear: 1953, birthMonth: [2, 4, 7, 9][k] }], accountTypes: ["Advisory", "IRA"], iraOwnerIdx: 0 });

// ---------- background households (~25K total) ----------
for (const adv of advisors) {
  const target = adv.advisor_id === "ADV001" ? 140 : adv.advisor_id === "ADV002" ? 118 : int(95, 155);
  while (T.households.filter((h) => h.advisor_id === adv.advisor_id).length < target) newHousehold(adv);
}

// Derived RMD-age life events (turning 73 during 2026; born 1953)
for (const c of T.clients) if (c.birth_date.startsWith("1953-"))
  T.life_events.push({ event_id: "EV" + pad(++evSeq, 6), household_id: c.household_id, client_id: c.client_id, event_type: "Turns 73 (RMD age)", event_date: "2026" + c.birth_date.slice(4), detail: "First required minimum distribution year" });

// ---------- product docs for Cortex Search (non-client content only) ----------
const PRODUCT_DOCS = [
  ["DOC-01", "RMD planning checklist", "Playbook", "Clients generally must begin required minimum distributions (RMDs) from traditional IRAs at age 73 under current rules for people born 1951 through 1959. The first RMD may be delayed until April 1 of the year after the client turns 73, but that can mean two distributions in one tax year. Checklist: confirm birth date and account types, estimate the RMD from the prior year-end balance and the IRS Uniform Lifetime Table, discuss qualified charitable distributions if the client is charitably inclined, and decide on withholding. Coordinate with the client's tax professional. Illustrative guidance only; not tax advice."],
  ["DOC-02", "Idle cash conversation guide", "Playbook", "When a household holds more than 10 percent cash for several months, ask whether the cash has a purpose: an emergency reserve, a planned purchase, or anxiety about markets. Offer options that match the purpose, such as a short-term Treasury sleeve, a laddered CD program, or a phased investment schedule back to the model. Document the client's decision in the CRM. Never pressure; some clients prefer to hold cash."],
  ["DOC-03", "Concentrated stock position options", "Playbook", "Common approaches for a single stock above 20 percent of a household: staged sales to manage capital gains, gifting appreciated shares to charity or a donor-advised fund, tax-loss harvesting elsewhere to offset gains, exchange funds for qualified investors, and protective option strategies where suitable. Consider employer blackout windows and 10b5-1 plans for insiders. Suitability review required."],
  ["DOC-04", "Client retention signals", "Playbook", "Early signals of attrition risk include falling portal logins, declined review meetings, repeated fee questions, unresolved service cases, and partial outgoing transfers. Recommended response: a personal call from the advisor within a week, an owner for any open case, and a clear written summary of fees and value delivered."],
  ["DOC-05", "Outgoing ACAT transfer response", "Procedure", "When an ACAT transfer out is received, call the client within two business days to understand the reason and confirm whether other accounts are affected. Do not obstruct or delay a valid transfer. Log the conversation and the reason code."],
  ["DOC-06", "401(k) rollover discussion", "Playbook", "For held-away 401(k) plans from former employers, compare plan fees, investment options, creditor protection, and the client's need for consolidation. Document a best-interest rationale before recommending a rollover."],
  ["DOC-07", "Model portfolio rebalancing policy", "Policy", "Advisory accounts are reviewed against their assigned model quarterly. A drift of more than 10 percentage points in any asset class triggers a rebalancing review. Tax impact and client preferences take priority over strict adherence."],
  ["DOC-08", "Meeting agenda template", "Template", "A strong review agenda covers: life updates, progress against goals, portfolio and drift, cash and liquidity needs, tax items for the year, beneficiaries and estate documents, and next steps with owners and dates."],
  ["DOC-09", "Short-Term Treasury Fund fact sheet", "Product", "Fictional fund used in this example. Invests in US Treasury securities with maturities under three years. Intended as a lower-volatility option for cash that is not needed immediately. Values fluctuate; not FDIC insured."],
  ["DOC-10", "Firm Cash Sweep program", "Product", "Fictional program used in this example. Uninvested cash in advisory accounts is swept to program banks. Sweep rates change and may be lower than money market alternatives."],
  ["DOC-11", "Qualified charitable distributions", "Playbook", "Clients age 70 and a half or older may direct IRA distributions to qualified charities, which can count toward their RMD. Confirm the charity is eligible and the distribution goes directly from the IRA."],
  ["DOC-12", "Communications supervision policy", "Policy", "All AI-assisted drafts sent to clients must be reviewed by the advisor. AI interactions are logged with the user, timestamp, prompt, response, and sources for supervision review."],
].map(([doc_id, title, doc_type, body]) => ({ doc_id, title, doc_type, body }));

// ---------- rules shared with sql/setup.sql ----------
const byHH = (rows) => { const m = new Map(); for (const r of rows) (m.get(r.household_id) ?? m.set(r.household_id, []).get(r.household_id)).push(r); return m; };
const posBy = byHH(T.positions), cashBy = byHH(T.cash_balances), loginBy = byHH(T.portal_logins), txBy = byHH(T.transactions), noteBy = byHH(T.crm_notes), caseBy = byHH(T.service_cases), clientBy = byHH(T.clients), acctBy = byHH(T.accounts), evBy = byHH(T.life_events);
const secById = Object.fromEntries(SECURITIES.map((s) => [s.security_id, s]));
// Sample sentiment used in mock mode; live mode uses AI_SENTIMENT on the note text.
const SAMPLE_SENTIMENT = { positive: "positive", neutral: "neutral", negative: "negative" };

function metrics(hh) {
  const pos = posBy.get(hh.household_id) ?? [];
  const aum = pos.reduce((s, p) => s + p.market_value, 0);
  const byClass = {};
  let maxStock = { pct: 0, ticker: null };
  const byStock = {};
  for (const p of pos) {
    const s = secById[p.security_id];
    byClass[s.asset_class] = (byClass[s.asset_class] ?? 0) + p.market_value;
    if (s.is_single_stock) byStock[s.security_id] = (byStock[s.security_id] ?? 0) + p.market_value;
  }
  for (const [t, v] of Object.entries(byStock)) if (v / aum > maxStock.pct) maxStock = { pct: v / aum, ticker: t };
  const model = MODELS.find((m) => m.model_id === hh.model_id);
  const drift = Object.entries(model.w).map(([c, w]) => ({ asset_class: c, target: w, actual: round2(((byClass[c] ?? 0) / aum) * 100) }));
  const maxDrift = Math.max(...drift.map((d) => Math.abs(d.actual - d.target)));
  const cash = (cashBy.get(hh.household_id) ?? []).sort((a, b) => a.month_end.localeCompare(b.month_end));
  let cashMonths = 0; for (let i = cash.length - 1; i >= 0 && cash[i].cash_pct > 10; i--) cashMonths++;
  const logins = (loginBy.get(hh.household_id) ?? []).sort((a, b) => a.month_end.localeCompare(b.month_end)).map((l) => l.logins);
  const last3 = logins.slice(-3).reduce((a, b) => a + b, 0) / 3, prior3 = logins.slice(-6, -3).reduce((a, b) => a + b, 0) / 3;
  const loginDecline = prior3 > 0 && last3 < prior3 * 0.5;
  const tx = txBy.get(hh.household_id) ?? [];
  const netFlow = tx.reduce((s, t) => s + t.amount, 0);
  const acatOut = tx.find((t) => t.txn_type === "ACAT_OUT" && t.txn_date >= "2026-10-01");
  const notes = noteBy.get(hh.household_id) ?? [];
  const negNote = notes.some((n) => n.note_date >= "2026-08-01" && SAMPLE_SENTIMENT[n._tone] === "negative");
  const openComplaint = (caseBy.get(hh.household_id) ?? []).some((c) => c.status === "Open" && c.category === "Complaint");
  // Rules-based attrition score (0-100). Not a trained model.
  const attrition = (loginDecline ? 40 : 0) + (negNote ? 30 : 0) + (netFlow < 0 ? 15 : 0) + (openComplaint ? 15 : 0);
  const rmdClients = (clientBy.get(hh.household_id) ?? []).filter((c) => c.birth_date.startsWith("1953-") && (acctBy.get(hh.household_id) ?? []).some((a) => a.account_type === "IRA" && a.client_id === c.client_id));
  return { aum: round2(aum), cashPct: cash.at(-1)?.cash_pct ?? 0, cashValue: round2(byClass.Cash ?? 0), cashMonths, maxStock: { ticker: maxStock.ticker, pct: round2(maxStock.pct * 100) }, drift, maxDrift: round2(maxDrift), loginDecline, netFlow: round2(netFlow), acatOut, negNote, openComplaint, attrition, rmdClients };
}

const M = new Map(T.households.map((h) => [h.household_id, metrics(h)]));
// Re-segment on actual position value
for (const h of T.households) h.segment = segmentOf(M.get(h.household_id).aum);

// Next best actions, per household. Impact values are illustrative estimates, documented in data/README.md.
function householdActions(h) {
  const m = M.get(h.household_id), out = [];
  if (m.attrition >= 70) out.push({ type: "ATTRITION_RISK", priority: 1, impact: m.aum, impactLabel: "AUM at risk", reason: `Attrition score ${m.attrition}/100: logins down, negative recent notes, open complaint` });
  if (m.acatOut) out.push({ type: "ACAT_OUT", priority: 2, impact: -m.acatOut.amount, impactLabel: "Transferred out", reason: `ACAT transfer of ${fmt(-m.acatOut.amount)} to ${m.acatOut.counterparty} on ${m.acatOut.txn_date}` });
  if (m.maxStock.pct >= 20) out.push({ type: "CONCENTRATION", priority: 3, impact: (m.aum * (m.maxStock.pct - 10)) / 100, impactLabel: "Above 10% single-stock guideline", reason: `${m.maxStock.pct.toFixed(0)}% of household in ${m.maxStock.ticker}` });
  if (m.cashMonths >= 6) out.push({ type: "CASH_DRAG", priority: 4, impact: m.cashValue, impactLabel: "Idle cash", reason: `${m.cashPct.toFixed(1)}% cash for ${m.cashMonths} straight months` });
  if (m.rmdClients.length) out.push({ type: "RMD", priority: 5, impact: m.aum, impactLabel: "IRA household", reason: `${m.rmdClients.map((c) => c.first_name).join(", ")} turns 73 in 2026` });
  if (m.maxDrift > 10 && !m.cashMonths) out.push({ type: "DRIFT", priority: 6, impact: m.aum, impactLabel: "Household value", reason: `Max drift ${m.maxDrift.toFixed(1)} pts vs model` });
  return out.map((a) => ({ ...a, household_id: h.household_id, household_name: h.household_name, advisor_id: h.advisor_id }));
}
function fmt(x) { return "$" + (x >= 1e6 ? (x / 1e6).toFixed(2) + "M" : Math.round(x / 1e3) + "K"); }

// ---------- write CSVs (full data set) ----------
mkdirSync("data/csv", { recursive: true });
const csvCell = (v) => v === null || v === undefined ? "" : typeof v === "string" && /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : String(v);
function writeCsv(name, rows, cols) {
  const body = [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n";
  writeFileSync(`data/csv/${name}.csv.gz`, gzipSync(body, { level: 9, mtime: 0 }));
}
const cleanCols = (rows) => Object.keys(rows[0]).filter((k) => !k.startsWith("_"));
writeCsv("advisors", advisors, cleanCols(advisors));
writeCsv("branch_managers", branchManagers, cleanCols(branchManagers));
writeCsv("model_portfolios", MODELS.flatMap((m) => Object.entries(m.w).map(([c, w]) => ({ model_id: m.model_id, model_name: m.name, asset_class: c, target_pct: w }))), ["model_id", "model_name", "asset_class", "target_pct"]);
writeCsv("securities", SECURITIES, cleanCols(SECURITIES));
writeCsv("product_docs", PRODUCT_DOCS, cleanCols(PRODUCT_DOCS));
for (const [name, rows] of Object.entries(T)) writeCsv(name, rows, cleanCols(rows));

// ---------- mock slice (branch BR01) ----------
const br01 = advisors.filter((a) => a.branch_id === "BR01");
const br01Ids = new Set(br01.map((a) => a.advisor_id));
const br01HH = T.households.filter((h) => br01Ids.has(h.advisor_id));
const summaries = br01HH.map((h) => {
  const m = M.get(h.household_id);
  return { id: h.household_id, name: h.household_name, advisorId: h.advisor_id, segment: h.segment, model: h.model_id, city: `${h.city}, ${h.state}`, aum: m.aum, cashPct: m.cashPct, cashMonths: m.cashMonths, maxDrift: m.maxDrift, topStock: m.maxStock, netFlow: m.netFlow, attrition: m.attrition, rmd: m.rmdClients.map((c) => ({ name: `${c.first_name} ${c.last_name}`, birthDate: c.birth_date })) };
});
const actions = br01HH.flatMap(householdActions);
const monthly = br01.map((a) => {
  const ids = new Set(br01HH.filter((h) => h.advisor_id === a.advisor_id).map((h) => h.household_id));
  return { advisorId: a.advisor_id, months: MONTHS.map((m) => {
    const tv = T.cash_balances.filter((c) => ids.has(c.household_id) && c.month_end === m).reduce((s, c) => s + c.total_value, 0);
    const flow = T.transactions.filter((t) => ids.has(t.household_id) && t.txn_date.slice(0, 7) === m.slice(0, 7)).reduce((s, t) => s + t.amount, 0);
    return { month: m, aum: Math.round(tv), netFlow: Math.round(flow) };
  }) };
});
const detail = {};
for (const h of br01HH) {
  const id = h.household_id, m = M.get(id);
  const holdings = {};
  for (const p of posBy.get(id) ?? []) holdings[p.security_id] = (holdings[p.security_id] ?? 0) + p.market_value;
  detail[id] = {
    clients: (clientBy.get(id) ?? []).map(({ client_id, first_name, last_name, birth_date, is_primary }) => ({ client_id, first_name, last_name, birth_date, is_primary })),
    accounts: (acctBy.get(id) ?? []).map((a) => ({ id: a.account_id, type: a.account_type, value: round2((posBy.get(id) ?? []).filter((p) => p.account_id === a.account_id).reduce((s, p) => s + p.market_value, 0)), heldAway: a.account_type === "401(k) rollover-eligible" })),
    holdings: Object.entries(holdings).sort((a, b) => b[1] - a[1]).map(([sid, v]) => ({ id: sid, name: secById[sid].name, assetClass: secById[sid].asset_class, single: secById[sid].is_single_stock, value: round2(v), pct: round2((v / m.aum) * 100) })),
    drift: m.drift,
    events: (evBy.get(id) ?? []).map(({ event_type, event_date, detail }) => ({ type: event_type, date: event_date, detail })),
    notes: (noteBy.get(id) ?? []).sort((a, b) => b.note_date.localeCompare(a.note_date)).map((n) => ({ date: n.note_date, author: n.author, text: n.note_text, sentiment: SAMPLE_SENTIMENT[n._tone] })),
    cases: (caseBy.get(id) ?? []).map(({ case_id, opened_date, status, category, subject }) => ({ id: case_id, opened: opened_date, status, category, subject })),
    cash: (cashBy.get(id) ?? []).map((c) => ({ month: c.month_end, pct: c.cash_pct })),
    logins: (loginBy.get(id) ?? []).map((l) => ({ month: l.month_end, logins: l.logins })),
    transactions: (txBy.get(id) ?? []).sort((a, b) => b.txn_date.localeCompare(a.txn_date)).slice(0, 8).map((t) => ({ date: t.txn_date, type: t.txn_type, amount: t.amount, counterparty: t.counterparty })),
  };
}
mkdirSync("lib/mock", { recursive: true });
writeFileSync("lib/mock/book.json", JSON.stringify({ asOf: AS_OF, seed: SEED, branch: { ...BRANCHES[0], manager: branchManagers[0].manager_name }, advisors: br01, models: MODELS.map(({ model_id, name, w }) => ({ id: model_id, name, weights: w })), households: summaries, actions, monthly, docs: PRODUCT_DOCS.map(({ doc_id, title, doc_type }) => ({ id: doc_id, title, type: doc_type })) }));
// Household detail is split into one small file per household, loaded on demand.
rmSync("public/mock/hh", { recursive: true, force: true });
mkdirSync("public/mock/hh", { recursive: true });
for (const [id, d] of Object.entries(detail)) writeFileSync(`public/mock/hh/${id}.json`, JSON.stringify(d));

// ---------- story check (fails loudly if a planted story drifts) ----------
const aActs = actions.filter((x) => x.advisor_id === "ADV001");
const count = (t, adv = "ADV001") => actions.filter((x) => x.advisor_id === adv && x.type === t).length;
const rmdA = br01HH.filter((h) => h.advisor_id === "ADV001").reduce((s, h) => s + M.get(h.household_id).rmdClients.length, 0);
const checks = { cashDragA: count("CASH_DRAG"), rmdClientsA: rmdA, rmdHouseholdsB: count("RMD", "ADV002"), concentrationA: count("CONCENTRATION"), attritionA: count("ATTRITION_RISK"), acatOutA: count("ACAT_OUT") };
const expected = { cashDragA: 18, rmdClientsA: 9, rmdHouseholdsB: 4, concentrationA: 1, attritionA: 1, acatOutA: 1 };
for (const [k, v] of Object.entries(expected)) if (checks[k] !== v) throw new Error(`Story check failed: ${k}=${checks[k]}, expected ${v}`);
console.log("Rows:", Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v.length])));
console.log("Advisors:", advisors.length, "Households:", T.households.length, "Story checks:", checks, "ADV001 actions:", aActs.length);
