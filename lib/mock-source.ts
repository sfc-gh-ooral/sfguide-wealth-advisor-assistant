// No-account data source: the bundled synthetic slice (branch BR01) from scripts/generate-data.mjs.
// Applies the same per-advisor scoping as the row access policies, so "View as" behaves the same.
import bookJson from './mock/book.json';
import { PERSONAS } from './personas';
import type { Book, BriefItem, HouseholdAction, HouseholdSummary, PersonaId } from './types';

export const BOOK = bookJson as unknown as Book;

export function visibleAdvisorIds(persona: PersonaId): Set<string> {
  const p = PERSONAS[persona];
  return new Set(p.advisorIds === 'BRANCH' ? BOOK.advisors.map((a) => a.advisor_id) : p.advisorIds);
}

export function scopedHouseholds(persona: PersonaId): HouseholdSummary[] {
  const ids = visibleAdvisorIds(persona);
  return BOOK.households.filter((h) => ids.has(h.advisorId));
}

export function scopedActions(persona: PersonaId): HouseholdAction[] {
  const ids = visibleAdvisorIds(persona);
  return BOOK.actions.filter((a) => ids.has(a.advisor_id));
}

export function canSee(persona: PersonaId, householdId: string): boolean {
  const ids = visibleAdvisorIds(persona);
  return BOOK.households.some((h) => h.id === householdId && ids.has(h.advisorId));
}

export const advisorName = (id: string) => BOOK.advisors.find((a) => a.advisor_id === id)?.advisor_name ?? id;

/** Rank actions into the morning brief. Cash drag and RMD are grouped per advisor. */
export function buildBrief(actions: HouseholdAction[], households: HouseholdSummary[]): BriefItem[] {
  const hh = new Map(households.map((h) => [h.id, h]));
  const items: BriefItem[] = [];
  const grouped = new Map<string, HouseholdAction[]>();
  for (const a of actions) {
    if (a.type === 'CASH_DRAG' || a.type === 'RMD' || a.type === 'DRIFT') {
      const k = `${a.type}:${a.advisor_id}`;
      grouped.set(k, [...(grouped.get(k) ?? []), a]);
    } else {
      items.push({
        key: `${a.type}:${a.household_id}`, type: a.type, advisorId: a.advisor_id,
        title: TITLES[a.type](a.household_name), reason: a.reason, impact: a.impact, impactLabel: IMPACT_LABEL[a.type],
        households: [{ id: a.household_id, name: a.household_name, detail: a.reason }],
      });
    }
  }
  for (const [k, list] of grouped) {
    const [type, advisorId] = k.split(':') as [HouseholdAction['type'], string];
    const total = list.reduce((s, a) => s + (type === 'RMD' ? 1 : a.impact), 0);
    const clients = list.reduce((s, a) => s + (hh.get(a.household_id)?.rmd.length ?? 1), 0);
    items.push({
      key: k, type, advisorId,
      title: type === 'CASH_DRAG' ? `${list.length} households holding idle cash`
        : type === 'DRIFT' ? `${list.length} households drifted from their model`
        : `${clients} clients turning 73 need RMD planning`,
      reason: type === 'CASH_DRAG' ? `More than 10% cash for 6+ straight months across ${list.length} households`
        : type === 'DRIFT' ? 'An asset class is more than 10 points from target; review for rebalancing'
        : `First required minimum distribution year in 2026 for ${clients} IRA owners in ${list.length} households`,
      impact: type === 'RMD' ? list.reduce((s, a) => s + a.impact, 0) : total,
      impactLabel: IMPACT_LABEL[type],
      households: list.sort((a, b) => b.impact - a.impact).map((a) => ({ id: a.household_id, name: a.household_name, detail: a.reason })),
    });
  }
  const order: Record<string, number> = { ATTRITION_RISK: 1, CASH_DRAG: 2, CONCENTRATION: 3, RMD: 4, ACAT_OUT: 5, DRIFT: 6 };
  return items.sort((a, b) => order[a.type] - order[b.type] || b.impact - a.impact);
}

const TITLES: Record<string, (n: string) => string> = {
  ATTRITION_RISK: (n) => `${n} shows attrition risk`,
  ACAT_OUT: (n) => `${n} transferred assets out`,
  CONCENTRATION: (n) => `${n} is concentrated in one stock`,
};
export const IMPACT_LABEL: Record<string, string> = {
  ATTRITION_RISK: 'AUM at risk', ACAT_OUT: 'Transferred out', CONCENTRATION: 'Above 10% guideline',
  CASH_DRAG: 'Idle cash', RMD: 'IRA household AUM', DRIFT: 'Household AUM',
};
