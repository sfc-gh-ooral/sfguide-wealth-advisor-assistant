// Shared types for the Wealth Advisor Assistant data layer.

export type PersonaId = 'ADVISOR_A' | 'ADVISOR_B' | 'BRANCH_MGR';

export interface Persona {
  id: PersonaId;
  label: string;
  person: string;
  title: string;
  role: string; // Snowflake role used in live mode
  advisorIds: string[] | 'BRANCH';
}

export type ActionType = 'ATTRITION_RISK' | 'ACAT_OUT' | 'CONCENTRATION' | 'CASH_DRAG' | 'RMD' | 'DRIFT';

export interface HouseholdSummary {
  id: string;
  name: string;
  advisorId: string;
  segment: string;
  model: string;
  city: string;
  aum: number;
  cashPct: number;
  cashMonths: number;
  maxDrift: number;
  topStock: { ticker: string | null; pct: number };
  netFlow: number;
  attrition: number;
  rmd: { name: string; birthDate: string }[];
}

export interface HouseholdAction {
  type: ActionType;
  priority: number;
  impact: number;
  impactLabel?: string;
  reason: string;
  household_id: string;
  household_name: string;
  advisor_id: string;
}

/** A morning-brief item: one household action, or several grouped (cash drag, RMD). */
export interface BriefItem {
  key: string;
  type: ActionType;
  title: string;
  reason: string;
  impact: number;
  impactLabel: string;
  households: { id: string; name: string; detail: string }[];
  advisorId: string;
}

export interface Advisor { advisor_id: string; advisor_name: string; branch_id: string; branch_name: string }

export interface BookMonth { month: string; aum: number; netFlow: number }

export interface Book {
  asOf: string;
  branch: { branch_id: string; branch_name: string; manager: string };
  advisors: Advisor[];
  models: { id: string; name: string; weights: Record<string, number> }[];
  households: HouseholdSummary[];
  actions: HouseholdAction[];
  monthly: { advisorId: string; months: BookMonth[] }[];
  docs: { id: string; title: string; type: string }[];
}

export interface HouseholdDetail {
  clients: { client_id: string; first_name: string; last_name: string; birth_date: string; is_primary: boolean }[];
  accounts: { id: string; type: string; value: number; heldAway: boolean }[];
  holdings: { id: string; name: string; assetClass: string; single: boolean; value: number; pct: number }[];
  drift: { asset_class: string; target: number; actual: number }[];
  events: { type: string; date: string; detail: string }[];
  notes: { date: string; author: string; text: string; sentiment: string | null }[];
  cases: { id: string; opened: string; status: string; category: string; subject: string }[];
  cash: { month: string; pct: number }[];
  logins: { month: string; logins: number }[];
  transactions: { date: string; type: string; amount: number; counterparty: string }[];
}

/** Where a result came from. Live results carry measured latency. */
export interface Provenance {
  source: 'mock' | 'snowflake';
  role?: string;
  latencyMs?: number;
}

export interface AiAnswer extends Provenance {
  text: string;
  sources: string[];
  guardrail: { checked: boolean; flagged: boolean; detail?: string };
  interactionId?: string;
}

/** One Cortex Agent turn from AI Observability (SNOWFLAKE.LOCAL.AI_OBSERVABILITY_EVENTS). */
export interface AgentTrace { at: string; requestId: string; role: string; durationMs: number; status: string; source: 'mock' | 'snowflake' }

export interface LogEntry {
  id: string;
  at: string;
  user: string;
  role: string;
  surface: string;
  prompt: string;
  response: string;
  sources: string[];
  guardrail: { checked: boolean; flagged: boolean; detail?: string };
  latencyMs?: number;
  source: 'mock' | 'snowflake';
}
