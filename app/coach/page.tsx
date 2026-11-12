'use client';

// Screens 4 and 5: Coach chat, plus "Ask as all three" to show the same question under each persona.
import { Bot, Send, Users } from 'lucide-react';
import { useState } from 'react';
import { usePersona } from '@/components/Shell';
import { Card, Markdown, PoweredBy, RlsBadge, SampleAiBadge, SourceBadge, Thinking } from '@/components/ui';
import { data } from '@/lib/client';
import { PERSONAS, PERSONA_IDS } from '@/lib/personas';
import type { AiAnswer, PersonaId } from '@/lib/types';

const SUGGESTED = [
  'Which clients should I call about RMDs this month?',
  'Summarize the Martinez household before my 2pm.',
  'Which households have the most idle cash?',
];

type Msg = { role: 'user'; text: string; persona: PersonaId } | { role: 'assistant'; persona: PersonaId; answer?: AiAnswer; error?: string };

function Answer({ a }: { a: AiAnswer }) {
  return (
    <>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {a.source === 'mock' ? <SampleAiBadge /> : <PoweredBy>Cortex Agents (Analyst + Search)</PoweredBy>}
        <RlsBadge role={a.role} />
        {a.guardrail.flagged && <span className="text-[11px] font-medium" style={{ color: 'var(--negative)' }}>Guardrail flag</span>}
        <SourceBadge p={a} />
      </div>
      <Markdown text={a.text} />
      {a.sources.length > 0 && <div className="text-[11px] muted">Sources: {a.sources.join(' · ')}</div>}
    </>
  );
}

export default function Coach() {
  const { persona } = usePersona();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState<{ q: string; results: Partial<Record<PersonaId, AiAnswer | 'loading' | string>> }>();

  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    setInput('');
    setBusy(true);
    setMsgs((m) => [...m, { role: 'user', text: q, persona }, { role: 'assistant', persona }]);
    let next: Msg;
    try { next = { role: 'assistant', persona, answer: await data.coach(persona, q) }; } catch (e) { next = { role: 'assistant', persona, error: String((e as Error).message) }; }
    setMsgs((m) => [...m.slice(0, -1), next]);
    setBusy(false);
  };

  const askAll = async (q: string) => {
    if (!q.trim()) return;
    setCompare({ q, results: Object.fromEntries(PERSONA_IDS.map((p) => [p, 'loading'])) });
    // Sequential, so live mode runs one agent call at a time on the XSMALL warehouse.
    for (const p of PERSONA_IDS) {
      let r: AiAnswer | string;
      try { r = await data.coach(p, q); } catch (e) { r = String((e as Error).message); }
      setCompare((c) => c && c.q === q ? { q, results: { ...c.results, [p]: r } } : c);
    }
  };

  const lastQ = [...msgs].reverse().find((m) => m.role === 'user') as Extract<Msg, { role: 'user' }> | undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Coach</h1>
          <p className="text-sm muted">Ask about your book. Answers only use households your role can see.</p>
        </div>
        <RlsBadge role={PERSONAS[persona].role} />
      </div>

      <Card>
        <div className="space-y-4 min-h-[180px]" aria-live="polite">
          {msgs.length === 0 && (
            <div className="text-sm text-2">
              <p className="mb-3">Try a question:</p>
              <div className="flex flex-col gap-2 items-start">
                {SUGGESTED.map((s) => <button key={s} className="btn" onClick={() => ask(s)}>{s}</button>)}
              </div>
            </div>
          )}
          {msgs.map((m, i) => m.role === 'user' ? (
            <div key={i} className="flex justify-end"><div className="rounded-xl px-3 py-2 text-sm max-w-[80%]" style={{ background: 'var(--accent)', color: '#fff' }}>
              <div className="text-[10px] opacity-80 mb-0.5">{PERSONAS[m.persona].label} · {PERSONAS[m.persona].person}</div>{m.text}</div></div>
          ) : (
            <div key={i} className="flex gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><Bot className="w-4 h-4" aria-hidden /></div>
              <div className="flex-1 min-w-0 rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
                {m.answer ? <Answer a={m.answer} /> : m.error ? <p className="text-sm" style={{ color: 'var(--negative)' }}>{m.error}</p> : <Thinking label="Asking the coach" />}
              </div>
            </div>
          ))}
        </div>
        <form className="flex gap-2 mt-4" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
          <label htmlFor="ask" className="sr-only">Ask the coach</label>
          <input id="ask" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your clients…" disabled={busy}
            className="flex-1 rounded-lg border px-3 py-2 text-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }} />
          <button className="btn btn-primary" disabled={busy || !input.trim()}><Send className="w-3.5 h-3.5" aria-hidden />Ask</button>
          <button type="button" className="btn" disabled={!(input.trim() || lastQ)} onClick={() => askAll(input.trim() || lastQ!.text)} title="Run the same question as each persona">
            <Users className="w-3.5 h-3.5" aria-hidden />Ask as all three
          </button>
        </form>
      </Card>

      {compare && (
        <Card title={<>Same question, three personas: <span className="font-normal text-2">&ldquo;{compare.q}&rdquo;</span></>} right={<RlsBadge />}>
          <div className="grid lg:grid-cols-3 gap-3">
            {PERSONA_IDS.map((p) => {
              const r = compare.results[p];
              return (
                <div key={p} className="rounded-xl p-3 min-w-0" style={{ background: 'var(--surface-2)' }}>
                  <div className="text-sm font-semibold">{PERSONAS[p].label}</div>
                  <div className="text-xs muted mb-2">{PERSONAS[p].person} · role {PERSONAS[p].role}</div>
                  {r === 'loading' || r === undefined ? <Thinking /> : typeof r === 'string' ? <p className="text-sm" style={{ color: 'var(--negative)' }}>{r}</p> : <Answer a={r} />}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
