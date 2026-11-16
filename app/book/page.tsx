'use client';

// Screen 2: Book overview. AUM and flows, segmentation, drift vs. model, and a household explorer.
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { usePersona } from '@/components/Shell';
import { Card, Kpi, RlsBadge, SourceBadge, Thinking, money } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { data } from '@/lib/client';
import { PERSONAS } from '@/lib/personas';
import type { HouseholdSummary } from '@/lib/types';

const SEGMENTS = ['Emerging', 'Core', 'Premier', 'Private'];
const tip = { contentStyle: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)' }, labelStyle: { color: 'var(--text)' } };
const axis = { stroke: 'var(--muted)', fontSize: 11, tickLine: false };
const FLAGS: Record<string, (h: HouseholdSummary) => boolean> = {
  All: () => true,
  'Idle cash': (h) => h.cashMonths >= 6,
  Concentrated: (h) => h.topStock.pct >= 20,
  'Off model': (h) => h.maxDrift > 10,
  'RMD this year': (h) => h.rmd.length > 0,
  'Attrition watch': (h) => h.attrition >= 70,
};

export default function BookOverview() {
  const { persona } = usePersona();
  const router = useRouter();
  const { data: book, error } = useAsync(() => data.book(persona), [persona]);
  const [flag, setFlag] = useState('All');
  const [segment, setSegment] = useState('All');
  const [q, setQ] = useState('');

  const derived = useMemo(() => {
    if (!book) return null;
    const hh = book.households;
    const seg = SEGMENTS.map((s) => ({ segment: s, households: hh.filter((h) => h.segment === s).length, aum: hh.filter((h) => h.segment === s).reduce((a, h) => a + h.aum, 0) }));
    const offModel = book.models.map((m) => {
      const inModel = hh.filter((h) => h.model === m.id);
      return { model: m.name, onModel: inModel.filter((h) => h.maxDrift <= 10).length, offModel: inModel.filter((h) => h.maxDrift > 10).length };
    });
    const advisors = book.advisors.map((a) => {
      const mine = hh.filter((h) => h.advisorId === a.advisor_id);
      const acts = book.actions.filter((x) => x.advisor_id === a.advisor_id);
      return { ...a, households: mine.length, aum: mine.reduce((s, h) => s + h.aum, 0), cash: acts.filter((x) => x.type === 'CASH_DRAG').length,
        rmd: mine.reduce((s, h) => s + h.rmd.length, 0), conc: acts.filter((x) => x.type === 'CONCENTRATION').length, attr: acts.filter((x) => x.type === 'ATTRITION_RISK').length };
    });
    return { seg, offModel, advisors };
  }, [book]);

  if (error) return <Card title="Couldn't load the book"><p className="text-sm">{error}</p></Card>;
  if (!book || !derived) return <Thinking label="Loading book" />;
  const p = PERSONAS[persona];
  const last = book.monthly.at(-1)!;
  const flows12 = book.monthly.reduce((s, m) => s + m.netFlow, 0);
  const names = new Map(book.advisors.map((a) => [a.advisor_id, a.advisor_name]));
  const rows = book.households.filter((h) => FLAGS[flag](h) && (segment === 'All' || h.segment === segment) && h.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.aum - a.aum);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-title">Book overview</h1>
          <p className="text-sm muted">{p.advisorIds === 'BRANCH' ? 'Lakeside branch, all advisors' : `${p.person}'s book`} · as of {book.asOf}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap"><RlsBadge role={book.role} /><SourceBadge p={book} /></div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="AUM" value={money(last.aum)} sub={`${book.households.length.toLocaleString()} households`} />
        <Kpi label="Net flows, 12 months" value={(flows12 >= 0 ? '+' : '−') + money(Math.abs(flows12))} sub="Deposits, withdrawals, transfers" />
        <Kpi label="Off model" value={String(book.households.filter((h) => h.maxDrift > 10).length)} sub="Any asset class > 10 pts from target" />
        <Kpi label="Idle cash" value={String(book.households.filter((h) => h.cashMonths >= 6).length)} sub="> 10% cash for 6+ months" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="AUM trend" className="lg:col-span-2">
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <AreaChart data={book.monthly} margin={{ left: 8, right: 8, top: 4 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" {...axis} tickFormatter={(m) => m.slice(0, 7)} />
                <YAxis {...axis} tickFormatter={(v) => money(v)} width={64} domain={['auto', 'auto']} />
                <Tooltip {...tip} formatter={(v) => money(Number(v))} />
                <Area type="monotone" dataKey="aum" name="AUM" stroke="var(--chart-1)" fill="var(--accent-soft)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Net flows by month">
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={book.monthly} margin={{ left: 8, right: 8, top: 4 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" {...axis} tickFormatter={(m) => m.slice(5, 7)} />
                <YAxis {...axis} tickFormatter={(v) => money(v)} width={56} />
                <Tooltip {...tip} formatter={(v) => money(Number(v))} />
                <Bar dataKey="netFlow" name="Net flow">{book.monthly.map((m) => <Cell key={m.month} fill={m.netFlow >= 0 ? 'var(--chart-2)' : 'var(--chart-5)'} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Household segmentation">
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={derived.seg} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid stroke="var(--border)" horizontal={false} />
                <XAxis type="number" {...axis} tickFormatter={(v) => money(v)} />
                <YAxis type="category" dataKey="segment" {...axis} width={72} />
                <Tooltip {...tip} formatter={(v, n) => (n === 'AUM' ? money(Number(v)) : v)} />
                <Bar dataKey="aum" name="AUM" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center text-xs mt-2">
            {derived.seg.map((s) => <div key={s.segment}><div className="font-semibold tabular">{s.households}</div><div className="muted">{s.segment}</div></div>)}
          </div>
        </Card>
        <Card title="Allocation drift vs. model">
          <div style={{ height: 248 }}>
            <ResponsiveContainer>
              <BarChart data={derived.offModel} margin={{ left: 0, right: 8 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="model" {...axis} interval={0} fontSize={10} />
                <YAxis {...axis} allowDecimals={false} width={36} />
                <Tooltip {...tip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="onModel" name="Within 10 pts" stackId="a" fill="var(--chart-2)" />
                <Bar dataKey="offModel" name="More than 10 pts off" stackId="a" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {p.advisorIds === 'BRANCH' && (
        <Card title="Coaching view: advisors in the branch">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Advisor</th><th>Households</th><th>AUM</th><th>Idle cash</th><th>RMD clients</th><th>Concentrated</th><th>Attrition watch</th></tr></thead>
              <tbody>{derived.advisors.sort((a, b) => b.cash - a.cash).map((a) => (
                <tr key={a.advisor_id}><td>{a.advisor_name}</td><td className="tabular">{a.households}</td><td className="tabular">{money(a.aum)}</td>
                  <td className="tabular" style={a.cash >= 10 ? { color: 'var(--warning)', fontWeight: 600 } : undefined}>{a.cash}</td>
                  <td className="tabular">{a.rmd}</td><td className="tabular">{a.conc}</td><td className="tabular">{a.attr}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title="Household explorer" right={
        <>
          <label className="sr-only" htmlFor="q">Search households</label>
          <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search households" className="rounded-lg border px-3 py-1.5 text-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }} />
          <label className="sr-only" htmlFor="seg">Segment</label>
          <select id="seg" value={segment} onChange={(e) => setSegment(e.target.value)} className="rounded-lg border px-2 py-1.5 text-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}>
            {['All', ...SEGMENTS].map((s) => <option key={s}>{s}</option>)}
          </select>
        </>
      }>
        <div className="flex gap-2 flex-wrap mb-3" role="group" aria-label="Filter">
          {Object.keys(FLAGS).map((f) => (
            <button key={f} className={`btn ${flag === f ? 'btn-primary' : ''}`} aria-pressed={flag === f} onClick={() => setFlag(f)}>
              {f} <span className="tabular opacity-75">{book.households.filter(FLAGS[f]).length}</span>
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Household</th>{p.advisorIds === 'BRANCH' && <th>Advisor</th>}<th>Segment</th><th>AUM</th><th>Cash</th><th>Top stock</th><th>Max drift</th><th>Attrition</th></tr></thead>
            <tbody>
              {rows.slice(0, 60).map((h) => (
                <tr key={h.id} className="click" onClick={() => router.push(`/prep?id=${h.id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && router.push(`/prep?id=${h.id}`)}>
                  <td className="font-medium">{h.name}</td>
                  {p.advisorIds === 'BRANCH' && <td className="text-2">{names.get(h.advisorId)}</td>}
                  <td className="text-2">{h.segment}</td>
                  <td className="tabular">{money(h.aum)}</td>
                  <td className="tabular" style={h.cashMonths >= 6 ? { color: 'var(--warning)', fontWeight: 600 } : undefined}>{h.cashPct.toFixed(1)}%</td>
                  <td className="tabular" style={h.topStock.pct >= 20 ? { color: 'var(--negative)', fontWeight: 600 } : undefined}>{h.topStock.ticker ? `${h.topStock.ticker} ${h.topStock.pct.toFixed(0)}%` : '—'}</td>
                  <td className="tabular">{h.maxDrift.toFixed(1)} pts</td>
                  <td className="tabular" style={h.attrition >= 70 ? { color: 'var(--negative)', fontWeight: 600 } : undefined}>{h.attrition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs muted mt-2">Showing {Math.min(60, rows.length)} of {rows.length} households, largest first.</p>
      </Card>
    </div>
  );
}
