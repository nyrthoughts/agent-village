import { useCallback } from 'react';
import { fetchVillage } from '../api/client.js';
import { usePolling } from './usePolling.js';

export function useVillage(fetchImpl: typeof fetch = fetch) {
  const load = useCallback(() => fetchVillage(fetchImpl), [fetchImpl]);
  return usePolling({ load });
}
