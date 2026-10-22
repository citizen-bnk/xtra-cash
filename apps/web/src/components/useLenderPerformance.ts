'use client';
import { useEffect, useState } from 'react';
import type { LenderPerformance } from '@xtra/shared';
import { useClient } from '@xtra/ui';

/** Mounted only by the dashboard. Hidden tabs and navigation cancel the requests. */
export function useLenderPerformance(interval: number) {
  const client = useClient();
  const [data, setData] = useState<LenderPerformance | null>(null);
  const [error, setError] = useState(''), [visible, setVisible] = useState(true);
  useEffect(() => {
    let mounted = true, generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined;
    const stop = () => { generation++; clearTimeout(timer); controller?.abort(); };
    const refresh = async () => {
      if (document.hidden || !mounted) return;
      const ticket = ++generation;
      const request = new AbortController(); controller = request;
      try {
        const snapshot = await client.lender.performance(request.signal);
        if (mounted && ticket === generation) { setData(snapshot); setError(''); }
      } catch (e) {
        if (mounted && ticket === generation && !request.signal.aborted) setError(e instanceof Error ? e.message : 'Could not update your figures.');
      } finally {
        if (mounted && ticket === generation && !document.hidden) timer = setTimeout(refresh, interval);
      }
    };
    const visibility = () => { stop(); setVisible(!document.hidden); if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', visibility); visibility();
    return () => { mounted = false; stop(); document.removeEventListener('visibilitychange', visibility); };
  }, [client, interval]);
  return { data, error, visible };
}
