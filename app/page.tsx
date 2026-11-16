'use client';

// Screen 1: Morning brief. Top next best actions with an AI explanation and a human decision.
import { AlertTriangle, ArrowRightLeft, Banknote, CalendarClock, Check, ChevronDown, ChevronRight, Clock, PieChart, Sparkles, UserMinus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { usePersona } from '@/components/Shell';
import { Card, Kpi, Markdown, PoweredBy, RlsBadge, SampleAiBadge, SourceBadge, Thinking, money } from '@/components/ui';
import { Reasoning } from '@/components/Reasoning';
import { useAsync } from '@/components/useAsync';
import { data } from '@/lib/client';
import { PERSONAS } from '@/lib/personas';
import type { AiAnswer, BriefItem } from '@/lib/types';

const ICON = { ATTRITION_RISK: UserMinus, CASH_DRAG: Banknote, CONCENTRATION: PieChart, RMD: CalendarClock, ACAT_OUT: ArrowRightLeft, DRIFT: AlertTriangle };
const DECISIONS = [
  { id: 'SCHEDULE_CALL', label: 'Schedule call', icon: CalendarClock },
  { id: 'SNOOZE', label: 'Snooze', icon: Clock },
  { id: 'DONE', label: 'Done', icon: Check },
] as const;

function BriefCard({ item, rank, advisor }: { item: BriefItem; rank: number; advisor?: string }) {
  const { persona } = usePersona();
  const Icon = ICON[item.type];
  const [showHH, setShowHH] = useState(false);
  const [ai, setAi] = useState<AiAnswer | 'loading' | { error: string }>();
  const [decision, setDecision] = useState<string>();
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState<string>();
  const multi = item.households.length > 1;
  const prepHref = `/prep?id=${item.households[0].id}`;

  const explain = async () => {
    setAi('loading');
    try { setAi(await data.explain(persona, item)); } catch (e) { setAi({ error: String((e as Error).message) }); }
  };
  const save = async () => {
    if (!decision) return;
    await data.recordAction(persona, { householdId: item.households.map((h) => h.id).join(','), actionType: item.type, decision: decision as 'DONE', note });
    setSaved(DECISIONS.find((d) => d.id === decision)!.label);
  };

  return (
    <article className="card card-hover p-4" aria-labelledby={`t-${item.key}`} style={saved ? { opacity: 0.7 } : undefined}>
      <div className="flex items-start gap-3">
        <div className="text-xs font-semibold muted w-5 pt-1 tabular">{rank}</div>
        <div className="icon-tile w-10 h-10 rounded-xl flex items-center justify-center shrink-0"><Icon className="w-4 h-4" aria-hidden /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 id={`t-${item.key}`} className="text-[15px] font-semibold">{item.title}</h3>
              <p className="text-sm text-2 mt-0.5">{item.reason}{advisor ? ` · ${advisor}` : ''}</p>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold tabular">{money(item.impact)}</div>
              <div className="text-[11px] muted">{item.impactLabel}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {multi
              ? <button className="btn" onClick={() => setShowHH(!showHH)} aria-expanded={showHH}>{showHH ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}{item.households.length} households</button>
              : <Link className="btn no-underline" href={prepHref}>Open client prep</Link>}
            {!ai && <button className="btn btn-ai" onClick={explain}><Sparkles className="w-3.5 h-3.5" aria-hidden />AI explanation</button>}
            {saved && <span className="text-xs font-medium" style={{ color: 'var(--positive)' }}>Recorded: {saved}{note ? ` · "${note}"` : ''}</span>}
          </div>

          {showHH && (
            <ul className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {item.households.map((h) => (
                <li key={h.id} className="flex justify-between gap-3 border-b py-1" style={{ borderColor: 'var(--border)' }}>
                  <Link href={`/prep?id=${h.id}`} className="underline-offset-2 hover:underline truncate">{h.name}</Link>
                  <span className="muted text-xs truncate">{h.detail}</span>
                </li>
              ))}
            </ul>
          )}

          {ai && (
            <div className="mt-3">
              {ai === 'loading' ? <Reasoning kind="explain" /> : 'error' in ai ? <p className="text-sm" style={{ color: 'var(--negative)' }}>{ai.error}</p> : (
                <div className="ai-panel">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {ai.source === 'mock' ? <SampleAiBadge /> : <PoweredBy>AI_COMPLETE with Cortex Guard</PoweredBy>}
                    <SourceBadge p={ai} />
                  </div>
                  <Markdown text={ai.text} />
                  <div className="text-[11px] muted">Sources: {ai.sources.join(' · ')}</div>
                </div>
              )}
            </div>
          )}

          {!saved && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {DECISIONS.map(({ id, label, icon: I }) => (
                <button key={id} className={`btn ${decision === id ? 'btn-primary' : ''}`} aria-pressed={decision === id} onClick={() => setDecision(id)}><I className="w-3.5 h-3.5" aria-hidden />{label}</button>
              ))}
              {decision && (
                <>
                  <label className="sr-only" htmlFor={`n-${item.key}`}>Note</label>
                  <input id={`n-${item.key}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional)"
                    className="flex-1 min-w-[180px] rounded-lg border px-3 py-1.5 text-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }} />
                  <button className="btn btn-primary" onClick={save}>Save</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export default function MorningBrief() {
  const { persona } = usePersona();
  const { data: book, error } = useAsync(() => data.book(persona), [persona]);
  const p = PERSONAS[persona];
  if (error) return <Card title="Couldn't load the book"><p className="text-sm">{error}</p></Card>;
  if (!book) return <Thinking label="Loading your book" />;
  const names = new Map(book.advisors.map((a) => [a.advisor_id, a.advisor_name]));
  const aum = book.households.reduce((s, h) => s + h.aum, 0);
  const top = book.brief.slice(0, 5);

  return (
    <div className="space-y-5">
      <div className="hero flex items-end justify-between gap-3 flex-wrap">
        <div className="relative z-10">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-1" style={{ color: 'rgba(255,255,255,.75)' }}>Morning brief</div>
          <h1 className="page-title text-white">Good morning, {p.person.split(' ')[0]}</h1>
          <p className="text-sm muted">Data as of {book.asOf}. Top {top.length} next best actions{p.advisorIds === 'BRANCH' ? ' across the Lakeside branch' : ' in your book'}, ranked by priority and impact.</p>
        </div>
        <div className="relative z-10 flex items-center gap-2 flex-wrap rounded-full px-2 py-1" style={{ background: 'rgba(255,255,255,.92)' }}><RlsBadge role={book.role} /><SourceBadge p={book} /></div>
      </div>
      <div className="stagger grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Households" value={book.households.length.toLocaleString()} sub={p.advisorIds === 'BRANCH' ? `${book.advisors.length} advisors` : 'In your book'} />
        <Kpi label="AUM" value={money(aum)} sub="Assets under management" />
        <Kpi label="Open actions" value={book.actions.length.toLocaleString()} sub="Rules-based, all types" />
        <Kpi label="Attrition watch" value={String(book.households.filter((h) => h.attrition >= 70).length)} sub="Score ≥ 70 (rules, not a model)" />
      </div>
      <div className="stagger space-y-3">
        {top.map((item, i) => <BriefCard key={`${persona}-${item.key}`} item={item} rank={i + 1} advisor={p.advisorIds === 'BRANCH' ? names.get(item.advisorId) : undefined} />)}
      </div>
      <p className="text-xs muted">Expected impact values are illustrative estimates from the rules in data/README.md. Suggestions are for advisor review only; not investment or tax advice.</p>
    </div>
  );
}
