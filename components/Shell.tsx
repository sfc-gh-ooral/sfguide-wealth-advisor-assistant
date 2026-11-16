'use client';

// App frame: navigation, the "View as" persona switcher, mode notice, and the disclaimer.
import { BookOpen, ClipboardList, LayoutDashboard, Menu, MessageSquare, ShieldCheck, Sun, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ModeChip } from '@/components/ModeChip';
import { HOSTED_EXAMPLE } from '@/lib/hosted';
import { PERSONAS, PERSONA_IDS, isPersonaId } from '@/lib/personas';
import type { PersonaId } from '@/lib/types';

const PersonaContext = createContext<{ persona: PersonaId; setPersona: (p: PersonaId) => void }>({ persona: 'ADVISOR_A', setPersona: () => {} });
export const usePersona = () => useContext(PersonaContext);

const NAV = [
  { href: '/', label: 'Morning brief', icon: Sun },
  { href: '/book', label: 'Book overview', icon: LayoutDashboard },
  { href: '/prep', label: 'Client prep', icon: ClipboardList },
  { href: '/coach', label: 'Coach', icon: MessageSquare },
  { href: '/supervision', label: 'Supervision log', icon: ShieldCheck },
];

export default function Shell({ children }: { children: ReactNode }) {
  const [persona, setPersonaState] = useState<PersonaId>('ADVISOR_A');
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    const saved = window.localStorage.getItem('waa-persona');
    if (isPersonaId(saved)) setPersonaState(saved);
  }, []);
  useEffect(() => setOpen(false), [pathname]);
  const setPersona = (p: PersonaId) => { setPersonaState(p); window.localStorage.setItem('waa-persona', p); };
  const p = PERSONAS[persona];
  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <PersonaContext.Provider value={{ persona, setPersona }}>
      <div className="min-h-screen flex">
        <aside className={`sidebar fixed inset-y-0 left-0 z-40 w-60 flex flex-col border-r transition-transform md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
          aria-label="Main navigation">
          <div className="px-5 py-5 border-b flex items-center gap-3" style={{ borderColor: 'rgba(255,255,255,.08)' }}>
            <div className="icon-tile w-9 h-9 rounded-xl flex items-center justify-center"><BookOpen className="w-4 h-4" aria-hidden /></div>
            <div>
              <div className="text-sm font-semibold leading-tight text-white">Wealth Advisor Assistant</div>
              <div className="text-[11px] muted">Example on synthetic data</div>
            </div>
            <button className="md:hidden ml-auto btn !px-2" onClick={() => setOpen(false)} aria-label="Close menu"><X className="w-4 h-4" /></button>
          </div>
          <nav className="flex-1 px-3 py-3 space-y-1">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined}
                className="nav-link flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium no-underline">
                <Icon className="w-4 h-4" aria-hidden />{label}
              </Link>
            ))}
          </nav>
          <div className="px-4 py-4 border-t text-[11px] muted leading-relaxed" style={{ borderColor: 'rgba(255,255,255,.08)' }}>
            Synthetic data and illustrative logic. Not investment, tax, regulatory, or compliance advice. Next best actions are suggestions for advisor review only.
          </div>
        </aside>

        <div className="flex-1 md:ml-60 min-w-0">
          {HOSTED_EXAMPLE && (
            <div role="note" className="px-4 md:px-8 py-2 text-xs border-b" style={{ background: 'var(--sample-soft)', borderColor: 'var(--border)', color: 'var(--text-2)' }}>
              <strong style={{ color: 'var(--text)' }}>Sample data mode.</strong> Runs entirely in your browser on synthetic data; no Snowflake account needed. AI answers are scripted samples, not live Cortex output.{' '}
              <a href="https://github.com/sfc-gh-ooral/sfguide-wealth-advisor-assistant" className="underline underline-offset-2">Run it in your own account</a>
            </div>
          )}
          <header className="glass sticky top-0 z-30 flex items-center gap-3 px-4 md:px-8 py-3 border-b flex-wrap" style={{ borderColor: 'var(--border)' }}>
            <button className="md:hidden btn !px-2" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="w-4 h-4" /></button>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{p.person}</div>
              <div className="text-xs muted truncate">{p.title}</div>
            </div>
            <div className="ml-auto"><ModeChip /></div>
            <div className="flex items-center gap-2" role="group" aria-label="View as persona">
              <span className="text-xs muted hidden sm:inline">View as</span>
              <div className="seg flex">
                {PERSONA_IDS.map((id) => (
                  <button key={id} onClick={() => setPersona(id)} aria-pressed={persona === id}
                    className="px-3 py-1.5 text-xs font-medium">
                    {PERSONAS[id].label}
                  </button>
                ))}
              </div>
            </div>
          </header>
          <main key={pathname} className="fade-up px-4 md:px-8 py-6 max-w-[1400px]">{children}</main>
        </div>
        {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} aria-hidden />}
      </div>
    </PersonaContext.Provider>
  );
}
