// Scripted answers for no-account mode. Every one is shown with a "Sample AI response" label.
// They are built from the same scoped synthetic data, so "View as" changes them the same way
// row access policies change live Cortex Agent answers.
import { BOOK, advisorName, scopedHouseholds } from './mock-source';
import { PERSONAS } from './personas';
import type { BriefItem, HouseholdDetail, HouseholdSummary, PersonaId } from './types';

export const fmtMoney = (x: number) =>
  x >= 1e9 ? `$${(x / 1e9).toFixed(2)}B` : x >= 1e6 ? `$${(x / 1e6).toFixed(2)}M` : x >= 1e3 ? `$${Math.round(x / 1e3)}K` : `$${Math.round(x)}`;

const FOOTER = '\n\n_Suggestions for advisor review only; not investment or tax advice._';

export function sampleExplanation(item: BriefItem): { text: string; sources: string[] } {
  const h = item.households[0];
  switch (item.type) {
    case 'ATTRITION_RISK':
      return {
        sources: ['BookAnalyst: HOUSEHOLD_METRICS', 'FirmPlaybooks: Client retention signals'],
        text: `**Why now:** ${h.name} has the highest attrition score in your book. Portal logins fell from about 9 a month to zero, the two most recent CRM notes are negative (trust paperwork delay, fee comparison with another firm), and a complaint case has been open since June.\n\n**Suggested next step:** a personal call this week. Give the open trust case a named owner, and follow up with a written fee and value summary, per the *Client retention signals* playbook.${FOOTER}`,
      };
    case 'CASH_DRAG':
      return {
        sources: ['BookAnalyst: NEXT_BEST_ACTIONS', 'FirmPlaybooks: Idle cash conversation guide'],
        text: `**Why now:** ${item.households.length} households have held more than 10% cash for at least six straight month-ends, about ${fmtMoney(item.impact)} in total. Several have been elevated for the full year.\n\n**Suggested next step:** ask each household what the cash is for (reserve, planned purchase, or market worry). Then offer options that match: a short-term Treasury sleeve or a phased plan back to the model. Some clients will prefer to keep cash; record their decision.${FOOTER}`,
      };
    case 'CONCENTRATION':
      return {
        sources: ['BookAnalyst: HOUSEHOLD_METRICS', 'FirmPlaybooks: Concentrated stock position options'],
        text: `**Why now:** ${h.detail} for ${h.name}, three times the 10% guideline. The shares came from employer vests and carry large embedded gains, and the spouse raised the exposure in the last note.\n\n**Suggested next step:** review staged sales, charitable gifting of appreciated shares, and offsetting losses elsewhere. Check any employer trading windows first.${FOOTER}`,
      };
    case 'RMD':
      return {
        sources: ['BookAnalyst: CLIENT_PROFILES', 'FirmPlaybooks: RMD planning checklist'],
        text: `**Why now:** these clients turn 73 in 2026, which makes this their first required minimum distribution (RMD) year. Waiting until April 1 next year can mean two distributions in one tax year.\n\n**Suggested next step:** confirm IRA balances as of last year-end, estimate each RMD, and raise qualified charitable distributions with charitably minded clients. Coordinate with each client's tax professional.${FOOTER}`,
      };
    case 'ACAT_OUT':
      return {
        sources: ['BookAnalyst: NEXT_BEST_ACTIONS', 'FirmPlaybooks: Outgoing ACAT transfer response'],
        text: `**Why now:** ${h.detail}. The July note says Grace's new employer offers a managed account program through another firm.\n\n**Suggested next step:** call within two business days to understand the reason and whether her remaining IRA is affected. Don't delay a valid transfer.${FOOTER}`,
      };
    case 'DRIFT':
      return {
        sources: ['BookAnalyst: NEXT_BEST_ACTIONS', 'FirmPlaybooks: Model portfolio rebalancing policy'],
        text: `**Why now:** ${item.households.length} households have an asset class more than 10 points from their model target, which triggers a rebalancing review under the *Model portfolio rebalancing policy*.\n\n**Suggested next step:** review each one for tax impact and client preferences before you rebalance. Some drift may be intentional.${FOOTER}`,
      };
    default:
      return { sources: ['BookAnalyst'], text: `${item.reason}.${FOOTER}` };
  }
}

export function sampleAgenda(h: HouseholdSummary, d: HouseholdDetail): { text: string; sources: string[] } {
  const primary = d.clients.find((c) => c.is_primary) ?? d.clients[0];
  const names = d.clients.map((c) => c.first_name).join(' and ');
  const top = d.holdings[0];
  const lines: string[] = [`**Meeting agenda: ${h.name}** (${names})`, ''];
  lines.push('1. **Life updates.** ' + (d.events.length ? d.events.map((e) => `${e.type} (${e.date})`).join('; ') + '.' : 'Ask about any changes at home or work.'));
  lines.push(`2. **Portfolio review.** ${fmtMoney(h.aum)} across ${d.accounts.filter((a) => !a.heldAway).length} accounts on the ${BOOK.models.find((m) => m.id === h.model)?.name} model; largest drift ${h.maxDrift.toFixed(1)} pts.`);
  if (h.topStock.ticker && h.topStock.pct >= 20) lines.push(`3. **Concentration.** ${h.topStock.pct.toFixed(0)}% in ${top?.single ? top.name : h.topStock.ticker}. Walk through staged sales, gifting, and tax-loss offsets.`);
  else if (h.cashPct > 10) lines.push(`3. **Cash.** ${h.cashPct.toFixed(1)}% cash for ${h.cashMonths} months. Ask what it's for.`);
  else lines.push('3. **Cash and liquidity.** Confirm upcoming needs for the next 12 months.');
  if (h.rmd.length) lines.push(`4. **RMD planning.** ${h.rmd.map((r) => r.name).join(', ')} turns 73 this year; estimate the first RMD and discuss timing.`);
  const neg = d.notes.find((n) => n.sentiment === 'negative');
  if (neg) lines.push(`${h.rmd.length ? 5 : 4}. **Service follow-up.** Acknowledge the concern from ${neg.date}: "${neg.text.slice(0, 90)}…"`);
  lines.push('', '**Talking points**');
  lines.push(`- Thank ${primary.first_name} for their continued trust and confirm goals are unchanged.`);
  if (h.topStock.pct >= 20) lines.push('- Frame concentration as risk management, not a view on the company.');
  if (h.attrition >= 70) lines.push('- Lead with the open case and a named owner before discussing performance or fees.');
  lines.push('- Agree on next steps with owners and dates.');
  return { text: lines.join('\n') + FOOTER, sources: ['AI_COMPLETE over household 360', 'FirmPlaybooks: Meeting agenda template'] };
}

/** Coach answers, scoped to what the persona can see. */
export function sampleCoach(persona: PersonaId, question: string): { text: string; sources: string[] } {
  const q = question.toLowerCase();
  const visible = scopedHouseholds(persona);
  const p = PERSONAS[persona];
  if (q.includes('rmd') || q.includes('required minimum')) {
    const rows = visible.filter((h) => h.rmd.length).flatMap((h) => h.rmd.map((r) => ({ ...r, household: h.name, aum: h.aum, advisor: advisorName(h.advisorId) })));
    rows.sort((a, b) => a.birthDate.slice(5).localeCompare(b.birthDate.slice(5)));
    const thisMonth = rows.filter((r) => r.birthDate.slice(5, 7) === '11' || r.birthDate.slice(5, 7) === '12');
    const table = ['| Client | Household | Turns 73 | Household AUM' + (p.advisorIds === 'BRANCH' ? ' | Advisor |' : ' |'),
      '| --- | --- | --- | ---' + (p.advisorIds === 'BRANCH' ? ' | --- |' : ' |'),
      ...rows.map((r) => `| ${r.name} | ${r.household} | ${r.birthDate.slice(5)} | ${fmtMoney(r.aum)}` + (p.advisorIds === 'BRANCH' ? ` | ${r.advisor} |` : ' |'))];
    return {
      sources: ['BookAnalyst: BOOK_SV (CLIENT_PROFILES)', 'FirmPlaybooks: RMD planning checklist'],
      text: `You have **${rows.length} clients** turning 73 in 2026 who own an IRA, so this is their first RMD year. ${thisMonth.length ? `Start with the ${thisMonth.length} whose birthdays fall in November or December, then work through the rest.` : ''}\n\n${table.join('\n')}\n\nThe *RMD planning checklist* suggests confirming last year-end IRA balances, estimating each RMD, and discussing qualified charitable distributions.${FOOTER}`,
    };
  }
  const named = BOOK.households.find((h) => q.includes(h.name.toLowerCase().replace(' household', '')));
  if (named) {
    if (!visible.some((h) => h.id === named.id)) {
      return { sources: ['BookAnalyst: BOOK_SV'], text: `I couldn't find a ${named.name} in the households you can see. It may belong to another advisor's book, or it may not be visible to your role.` };
    }
    if (named.name.startsWith('Martinez')) {
      return {
        sources: ['BookAnalyst: BOOK_SV (HOUSEHOLD_METRICS, NOTES_ENRICHED)', 'FirmPlaybooks: Client retention signals'],
        text: `**Martinez Household: Robert and Elena** · ${fmtMoney(named.aum)} · Premier · Balanced Growth model\n\n- **Relationship risk is high.** The attrition score is ${named.attrition}/100. Portal logins dropped from 9 a month to 0 since summer.\n- **Open complaint.** The trust account paperwork has been delayed since June 20. Robert said he feels he is "chasing us" (Aug 2 note).\n- **Fee pressure.** On Oct 9 Elena asked for a full fee breakdown, compared us with another firm, and declined the Q4 review.\n- **Flows.** A $185K withdrawal in September; net flow over 12 months is ${fmtMoney(Math.abs(named.netFlow))} out.\n- **Portfolio.** On model, with cash under 4%. Performance isn't the issue; service is.\n\n**For your 2pm:** open with the trust paperwork. Bring a completion date and a named owner, then offer the written fee summary before they ask.${FOOTER}`,
      };
    }
    return { sources: ['BookAnalyst: BOOK_SV'], text: `**${named.name}** · ${fmtMoney(named.aum)} · ${named.segment}. Cash ${named.cashPct.toFixed(1)}%, max drift ${named.maxDrift.toFixed(1)} pts, attrition score ${named.attrition}/100.${FOOTER}` };
  }
  if (q.includes('cash')) {
    const rows = visible.filter((h) => h.cashMonths >= 6).sort((a, b) => b.cashPct - a.cashPct).slice(0, 10);
    return { sources: ['BookAnalyst: BOOK_SV'], text: `${visible.filter((h) => h.cashMonths >= 6).length} visible households have held more than 10% cash for 6+ months. Highest first:\n\n${rows.map((h) => `- ${h.name}: ${h.cashPct.toFixed(1)}% cash for ${h.cashMonths} months (${fmtMoney(h.aum)})`).join('\n')}${FOOTER}` };
  }
  return {
    sources: ['BookAnalyst: BOOK_SV'],
    text: `You can see **${visible.length} households** (${fmtMoney(visible.reduce((s, h) => s + h.aum, 0))} AUM). In this sample mode, try one of the suggested questions: RMDs this month, the Martinez household, or idle cash.${FOOTER}`,
  };
}
