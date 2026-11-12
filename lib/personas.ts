import type { Persona, PersonaId } from './types';

// "View as" personas. In live mode each maps to a Snowflake role that the row access
// policies in sql/setup.sql key on; in no-account mode the same scoping runs in the browser.
export const PERSONAS: Record<PersonaId, Persona> = {
  ADVISOR_A: { id: 'ADVISOR_A', label: 'Advisor A', person: 'Dana Whitfield', title: 'Financial advisor · Lakeside', role: 'WAA_ADVISOR_A', advisorIds: ['ADV001'] },
  ADVISOR_B: { id: 'ADVISOR_B', label: 'Advisor B', person: 'Marcus Lee', title: 'Financial advisor · Lakeside', role: 'WAA_ADVISOR_B', advisorIds: ['ADV002'] },
  BRANCH_MGR: { id: 'BRANCH_MGR', label: 'Branch manager', person: 'Alicia Romero', title: 'Branch manager · Lakeside (8 advisors)', role: 'WAA_BRANCH_MGR', advisorIds: 'BRANCH' },
};

export const PERSONA_IDS = Object.keys(PERSONAS) as PersonaId[];

export function isPersonaId(x: unknown): x is PersonaId {
  return typeof x === 'string' && x in PERSONAS;
}
