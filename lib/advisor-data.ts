// The data interface every screen uses. Two implementations:
//   lib/mock-data.ts  bundled synthetic data (no account; also runs in the browser for /try/)
//   lib/live-data.ts  Snowflake, one connection per persona role (server only)
import type { AgentTrace, AiAnswer, Advisor, BookMonth, BriefItem, HouseholdAction, HouseholdDetail, HouseholdSummary, LogEntry, PersonaId, Provenance } from './types';

export interface BookView extends Provenance {
  asOf: string;
  advisors: Advisor[];
  models: { id: string; name: string; weights: Record<string, number> }[];
  households: HouseholdSummary[];
  actions: HouseholdAction[];
  brief: BriefItem[];
  monthly: BookMonth[];
}

export interface HouseholdView extends Provenance {
  summary: HouseholdSummary;
  detail: HouseholdDetail;
}

export interface ActionInput { householdId: string; actionType: string; decision: 'SCHEDULE_CALL' | 'SNOOZE' | 'DONE'; note: string }

export interface AdvisorData {
  book(persona: PersonaId): Promise<BookView>;
  household(persona: PersonaId, id: string): Promise<HouseholdView | null>;
  explain(persona: PersonaId, item: BriefItem): Promise<AiAnswer>;
  agenda(persona: PersonaId, householdId: string): Promise<AiAnswer>;
  coach(persona: PersonaId, question: string): Promise<AiAnswer>;
  recordAction(persona: PersonaId, input: ActionInput): Promise<Provenance & { ok: boolean }>;
  log(): Promise<LogEntry[]>;
  traces(): Promise<AgentTrace[]>;
}
