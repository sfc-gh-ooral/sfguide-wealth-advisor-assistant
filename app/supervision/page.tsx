'use client';

// Screen 6: Supervision log. Every AI prompt and response with user, role, time, sources, and guardrail flags.
import { ChevronDown, ChevronRight, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Fragment, useState } from 'react';
import { Card, Markdown, PoweredBy, SampleAiBadge, Thinking } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { data } from '@/lib/client';

export default function Supervision() {
  const [tick, setTick] = useState(0);
  const { data: log, error } = useAsync(() => data.log(), [tick]);
  const { data: traces } = useAsync(() => data.traces(), [tick]);
  const [open, setOpen] = useState<string>();
  const [flagged, setFlagged] = useState(false);
  const [surface, setSurface] = useState('All');

  if (error) return <Card title="Couldn't load the log"><p className="text-sm">{error}</p></Card>;
  if (!log) return <Thinking label="Loading supervision log" />;
  const live = log.some((e) => e.source === 'snowflake');
  const rows = log.filter((e) => (!flagged || e.guardrail.flagged) && (surface === 'All' || e.surface === surface));
  const surfaces = ['All', ...new Set(log.map((e) => e.surface))];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Supervision log</h1>
          <p className="text-sm muted">
            Viewing as supervision reviewer{live ? ' (role WAA_SUPERVISOR, read-only)' : ''}. {live ? 'Read from APP.AI_INTERACTION_LOG, which advisor roles can insert into but not change or read.' : 'In no-account mode, entries from this browser session are kept locally, alongside a few sample entries.'}
          </p>
        </div>
        <button className="btn" onClick={() => setTick((t) => t + 1)}>Refresh</button>
      </div>

      <Card right={
        <>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} />Guardrail flags only</label>
          <label className="sr-only" htmlFor="surf">Surface</label>
          <select id="surf" value={surface} onChange={(e) => setSurface(e.target.value)} className="rounded-lg border px-2 py-1.5 text-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}>
            {surfaces.map((s) => <option key={s}>{s}</option>)}
          </select>
        </>
      } title={`${rows.length} interactions`}>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th aria-label="Expand" /><th>Time</th><th>User</th><th>Role</th><th>Surface</th><th>Prompt</th><th>Guardrails</th><th>Latency</th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <Fragment key={e.id}>
                  <tr className="click" onClick={() => setOpen(open === e.id ? undefined : e.id)} tabIndex={0} onKeyDown={(k) => k.key === 'Enter' && setOpen(open === e.id ? undefined : e.id)} aria-expanded={open === e.id}>
                    <td>{open === e.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</td>
                    <td className="tabular whitespace-nowrap text-2">{new Date(e.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                    <td>{e.user}</td>
                    <td className="text-2 text-xs">{e.role}</td>
                    <td className="text-2">{e.surface}</td>
                    <td className="max-w-[240px] truncate">{e.prompt}</td>
                    <td>{!e.guardrail.checked ? <span className="muted text-xs">n/a</span> : e.guardrail.flagged
                      ? <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--negative)' }}><ShieldAlert className="w-3.5 h-3.5" />Flagged</span>
                      : <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--positive)' }}><ShieldCheck className="w-3.5 h-3.5" />No flag</span>}</td>
                    <td className="tabular text-2">{e.latencyMs ? `${e.latencyMs.toLocaleString()} ms` : '—'}</td>
                  </tr>
                  {open === e.id && (
                    <tr><td /><td colSpan={7}>
                      <div className="grid md:grid-cols-2 gap-4 py-2">
                        <div><div className="text-[11px] uppercase muted mb-1">Prompt</div><p className="text-sm whitespace-pre-wrap">{e.prompt}</p>
                          <div className="text-[11px] uppercase muted mt-3 mb-1">Sources</div><p className="text-sm">{e.sources.length ? e.sources.join(' · ') : 'None'}</p>
                          {e.guardrail.detail && <><div className="text-[11px] uppercase muted mt-3 mb-1">Guardrail detail</div><p className="text-sm">{e.guardrail.detail}</p></>}
                          <div className="text-[11px] uppercase muted mt-3 mb-1">Record</div><p className="text-xs muted">{e.source === 'mock' ? 'Sample entry (no-account mode)' : `Interaction ${e.id}`}</p></div>
                        <div><div className="text-[11px] uppercase muted mb-1">Response</div><Markdown text={e.response} /></div>
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Agent traces" right={traces?.[0]?.source === 'snowflake' ? <PoweredBy>AI Observability</PoweredBy> : <SampleAiBadge />}>
        <p className="text-xs muted mb-3">
          {traces?.[0]?.source === 'snowflake'
            ? 'One row per Cortex Agent turn from SNOWFLAKE.LOCAL.AI_OBSERVABILITY_EVENTS, read with MONITOR on the agent. Spans (planning, tool calls, SQL) open in Snowsight under AI & ML » Agents » Observability. Entries in the event table can\u2019t be modified.'
            : 'In live mode this lists each Cortex Agent turn from AI Observability. These rows are samples.'}
        </p>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Time</th><th>Role</th><th>Request ID</th><th>Duration</th></tr></thead>
            <tbody>{(traces ?? []).slice(0, 12).map((t) => (
              <tr key={t.requestId}><td className="tabular text-2 whitespace-nowrap">{new Date(t.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                <td className="text-xs text-2">{t.role}</td><td className="text-xs muted font-mono">{t.requestId}</td><td className="tabular">{(t.durationMs / 1000).toFixed(1)} s</td></tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
