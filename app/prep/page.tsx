'use client';

// Screen 3: Client prep. Household 360 plus an AI-drafted agenda and talking points.
import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { usePersona } from '@/components/Shell';
import { Card, Markdown, PoweredBy, RlsBadge, SampleAiBadge, SourceBadge, Thinking, money } from '@/components/ui';
import { Reasoning } from '@/components/Reasoning';
import { useAsync } from '@/components/useAsync';
import { data } from '@/lib/client';
import { PERSONAS } from '@/lib/personas';
import type { AiAnswer } from '@/lib/types';

const tip = { contentStyle: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)' }, labelStyle: { color: 'var(--text)' } };
const axis = { stroke: 'var(--muted)', fontSize: 11, tickLine: false };
const SENT: Record<string, string> = { positive: 'var(--positive)', negative: 'var(--negative)', neutral: 'var(--muted)', mixed: 'var(--warning)' };

function Picker() {
  const { persona } = usePersona();
  const { data: book } = useAsync(() => data.book(persona), [persona]);
  if (!book) return <Thinking label="Loading households" />;
  const flagged = book.households.filter((h) => h.attrition >= 70 || h.topStock.pct >= 20 || h.rmd.length || h.cashMonths >= 6).sort((a, b) => b.aum - a.aum).slice(0, 12);
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div><h1 className="page-title">Client prep</h1><p className="text-sm muted">Pick a household to prepare for. Households with open actions are listed first.</p></div>
        <RlsBadge role={book.role} />
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {flagged.map((h) => (
          <Link key={h.id} href={`/prep?id=${h.id}`} className="card p-4 no-underline hover:brightness-105">
            <div className="font-semibold">{h.name}</div>
            <div className="text-sm text-2">{money(h.aum)} · {h.segment} · {h.city}</div>
            <div className="text-xs muted mt-1">
              {[h.attrition >= 70 && 'Attrition watch', h.topStock.pct >= 20 && `${h.topStock.pct.toFixed(0)}% ${h.topStock.ticker}`, h.rmd.length && 'RMD this year', h.cashMonths >= 6 && 'Idle cash'].filter(Boolean).join(' · ')}
            </div>
          </Link>
        ))}
      </div>
      <p className="text-xs muted">Or open any household from the <Link href="/book" className="underline">Book overview</Link> explorer.</p>
    </div>
  );
}

function Prep({ id }: { id: string }) {
  const { persona } = usePersona();
  const router = useRouter();
  const { data: view, error, loading } = useAsync(() => data.household(persona, id), [persona, id]);
  const [ai, setAi] = useState<AiAnswer | 'loading' | { error: string }>();
  useEffect(() => setAi(undefined), [persona, id]);

  if (error) return <Card title="Couldn't load this household"><p className="text-sm">{error}</p></Card>;
  if (loading) return <Thinking label="Loading household 360" />;
  if (!view || 'notFound' in view) {
    return (
      <Card title="Not in your book">
        <p className="text-sm text-2 mb-3">This household isn&apos;t visible to <strong>{PERSONAS[persona].label}</strong>. The row access policy returns no rows for it, so the app has nothing to show.</p>
        <div className="flex gap-2 flex-wrap"><RlsBadge /><button className="btn" onClick={() => router.push('/prep')}>Choose another household</button></div>
      </Card>
    );
  }
  const { summary: h, detail: d } = view;
  const drafting = async () => {
    setAi('loading');
    try { setAi(await data.agenda(persona, id)); } catch (e) { setAi({ error: String((e as Error).message) }); }
  };
  const concentrated = h.topStock.pct >= 20;
  const cashLogins = d.cash.map((c, i) => ({ month: c.month.slice(0, 7), cash: c.pct, logins: d.logins[i]?.logins ?? 0 }));

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <Link href="/prep" className="text-xs muted underline-offset-2 hover:underline">Client prep</Link>
          <h1 className="page-title">{h.name}</h1>
          <p className="text-sm text-2">{d.clients.map((c) => `${c.first_name} (${c.birth_date.slice(0, 4)})`).join(' · ')} · {h.city} · {h.segment} · model {h.model}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap"><RlsBadge role={view.role} /><SourceBadge p={view} /></div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[['AUM', money(h.aum)], ['Cash', `${h.cashPct.toFixed(1)}%`], ['Largest stock', h.topStock.ticker ? `${h.topStock.pct.toFixed(0)}% ${h.topStock.ticker}` : 'None'], ['Max drift', `${h.maxDrift.toFixed(1)} pts`], ['Attrition score', `${h.attrition}/100`]].map(([l, v]) => (
          <div key={l} className="card p-3"><div className="text-[11px] uppercase tracking-wider muted">{l}</div><div className="text-lg font-semibold tabular" style={(l === 'Largest stock' && concentrated) || (l === 'Attrition score' && h.attrition >= 70) ? { color: 'var(--negative)' } : undefined}>{v}</div></div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card title="Holdings and concentration">
            <div className="space-y-2">
              {d.holdings.slice(0, 8).map((x) => (
                <div key={x.id} className="text-sm">
                  <div className="flex justify-between gap-3"><span className="truncate">{x.name} <span className="muted text-xs">{x.id}</span></span><span className="tabular">{money(x.value)} · {x.pct.toFixed(1)}%</span></div>
                  <div className="h-2 rounded-full mt-1" style={{ background: 'var(--surface-2)' }}>
                    <div className="h-2 rounded-full" style={{ width: `${Math.min(100, x.pct)}%`, background: x.single && x.pct >= 20 ? 'var(--negative)' : x.assetClass === 'Cash' ? 'var(--chart-3)' : 'var(--chart-1)' }} />
                  </div>
                </div>
              ))}
            </div>
            {concentrated && <p className="text-xs mt-3" style={{ color: 'var(--negative)' }}>{h.topStock.ticker} is {h.topStock.pct.toFixed(0)}% of the household, above the 10% single-stock guideline used in this example.</p>}
          </Card>

          <Card title="Allocation vs. model">
            <div style={{ height: 210 }}>
              <ResponsiveContainer>
                <BarChart data={d.drift} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="asset_class" {...axis} interval={0} fontSize={10} />
                  <YAxis {...axis} unit="%" width={40} />
                  <Tooltip {...tip} formatter={(v) => `${Number(v).toFixed(1)}%`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="target" name="Model target" fill="var(--muted)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="actual" name="Actual" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Cash and portal logins, 12 months">
            <div style={{ height: 180 }}>
              <ResponsiveContainer>
                <LineChart data={cashLogins} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" {...axis} tickFormatter={(m) => m.slice(5)} />
                  <YAxis yAxisId="l" {...axis} unit="%" width={40} />
                  <YAxis yAxisId="r" orientation="right" {...axis} width={28} allowDecimals={false} />
                  <Tooltip {...tip} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line yAxisId="l" dataKey="cash" name="Cash %" stroke="var(--chart-3)" strokeWidth={2} dot={false} />
                  <Line yAxisId="r" dataKey="logins" name="Portal logins" stroke="var(--chart-4)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Accounts">
            <table className="data-table"><thead><tr><th>Account</th><th>Type</th><th>Value</th></tr></thead>
              <tbody>{d.accounts.map((a) => <tr key={a.id}><td className="muted">{a.id}</td><td>{a.type}</td><td className="tabular">{a.heldAway ? 'Held away' : money(a.value)}</td></tr>)}</tbody></table>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="AI meeting prep" right={ai && ai !== 'loading' && !('error' in ai) ? (ai.source === 'mock' ? <SampleAiBadge /> : <PoweredBy>AI_COMPLETE with Cortex Guard</PoweredBy>) : undefined}>
            {!ai && (
              <div>
                <p className="text-sm text-2 mb-3">Draft an agenda and talking points from this household&apos;s accounts, holdings, life events, notes, and cases.</p>
                <button className="btn btn-primary" onClick={drafting}><Sparkles className="w-3.5 h-3.5" aria-hidden />Draft agenda</button>
              </div>
            )}
            {ai === 'loading' && <Reasoning kind="agenda" />}
            {ai && ai !== 'loading' && ('error' in ai ? <p className="text-sm" style={{ color: 'var(--negative)' }}>{ai.error}</p> : (
              <div className="ai-panel">
                <Markdown text={ai.text} />
                <div className="flex items-center gap-2 mt-2 flex-wrap"><SourceBadge p={ai} /></div>
                <p className="text-[11px] muted mt-2">Draft for the advisor to review and edit. Logged to the supervision trail.</p>
              </div>
            ))}
          </Card>

          <Card title="Life events">
            {d.events.length ? <ul className="text-sm space-y-1">{d.events.map((e, i) => <li key={i}><span className="font-medium">{e.type}</span> <span className="muted">· {e.date}</span>{e.detail && <div className="text-xs muted">{e.detail}</div>}</li>)}</ul>
              : <p className="text-sm muted">No upcoming events on file.</p>}
            {h.rmd.length > 0 && <p className="text-xs mt-2" style={{ color: 'var(--warning)' }}>RMD planning: {h.rmd.map((r) => r.name).join(', ')} turns 73 in 2026.</p>}
          </Card>

          <Card title="Recent CRM notes" right={view.source === 'mock' ? <SampleAiBadge /> : <PoweredBy>AI_SENTIMENT</PoweredBy>}>
            {d.notes.length ? <ul className="space-y-3">{d.notes.slice(0, 4).map((n, i) => (
              <li key={i} className="text-sm">
                <div className="flex items-center gap-2 text-xs muted mb-0.5">{n.date} · {n.author}
                  {n.sentiment && <span className="font-medium" style={{ color: SENT[n.sentiment] ?? 'var(--muted)' }}>{n.sentiment}</span>}</div>
                {n.text}
              </li>))}</ul> : <p className="text-sm muted">No notes in the last 12 months.</p>}
            <p className="text-[11px] muted mt-2">Sentiment labels {view.source === 'mock' ? 'are sample values in no-account mode' : 'come from AI_SENTIMENT on notes since Aug 1'}.</p>
          </Card>

          <Card title="Service cases">
            {d.cases.length ? <ul className="text-sm space-y-1">{d.cases.map((c) => <li key={c.id}><span className="font-medium">{c.subject}</span> <span className="muted">· {c.category} · {c.status} · {c.opened}</span></li>)}</ul>
              : <p className="text-sm muted">No cases in the last 12 months.</p>}
          </Card>

          <Card title="Recent transactions">
            <ul className="text-sm space-y-1">{d.transactions.map((t, i) => (
              <li key={i} className="flex justify-between gap-2"><span>{t.type === 'ACAT_OUT' ? <strong style={{ color: 'var(--negative)' }}>ACAT out</strong> : t.type.toLowerCase()} <span className="muted text-xs">{t.date}{t.type === 'ACAT_OUT' ? ` · ${t.counterparty}` : ''}</span></span>
                <span className="tabular" style={{ color: t.amount < 0 ? 'var(--negative)' : 'var(--positive)' }}>{t.amount < 0 ? '−' : '+'}{money(Math.abs(t.amount))}</span></li>))}</ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PrepRouter() {
  const id = useSearchParams().get('id');
  return id ? <Prep id={id} /> : <Picker />;
}

export default function PrepPage() {
  return <Suspense fallback={<Thinking />}><PrepRouter /></Suspense>;
}
