'use client';

// Header indicator: Live (Snowflake) or Sample mode. The hosted /try/ build has no server and is always sample.
import { Database, FlaskConical } from 'lucide-react';
import { useEffect, useState } from 'react';
import { HOSTED_EXAMPLE } from '@/lib/hosted';

export function ModeChip() {
  const [mode, setMode] = useState<'live' | 'sample' | undefined>(HOSTED_EXAMPLE ? 'sample' : undefined);
  useEffect(() => {
    if (HOSTED_EXAMPLE) return;
    fetch('/api/mode').then((r) => r.json()).then((j) => setMode(j.mode)).catch(() => setMode('sample'));
  }, []);
  if (!mode) return null;
  const live = mode === 'live';
  return (
    <span className={`mode-chip ${live ? 'live' : 'sample'}`}
      title={live ? 'Data and AI answers come from your Snowflake account' : 'Bundled synthetic data; AI answers are scripted samples'}>
      {live ? <><span className="mode-dot" aria-hidden /><Database className="w-3.5 h-3.5" aria-hidden />Live · Snowflake</>
        : <><FlaskConical className="w-3.5 h-3.5" aria-hidden />Sample mode</>}
    </span>
  );
}
