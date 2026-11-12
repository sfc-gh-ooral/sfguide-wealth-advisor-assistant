'use client';

import { useEffect, useState } from 'react';

/** Load async data and reload when deps change (for example the "View as" persona). */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => {
    let live = true;
    setState({ loading: true }); // drop the previous persona's data so it never shows under the new one
    fn().then((data) => live && setState({ data, loading: false }), (e) => live && setState({ error: String(e?.message ?? e), loading: false }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
