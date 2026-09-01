import { useCallback } from 'react';
import { fetchActivity } from '../api/client.js';
import { usePolling } from './usePolling.js';

export function useActivity(fetchImpl: typeof fetch = fetch) {
  const load = useCallback(() => fetchActivity(fetchImpl), [fetchImpl]);
  return usePolling({ load });
}
