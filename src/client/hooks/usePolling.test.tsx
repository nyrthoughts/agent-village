import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePolling } from './usePolling.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('usePolling', () => {
  it('polls every five seconds and cleans up on unmount', async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValue({ version: 1 });
    const { result, unmount } = renderHook(() => usePolling({ load }));
    await act(async () => Promise.resolve());
    expect(load).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual({ version: 1 });

    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(load).toHaveBeenCalledTimes(2);
    unmount();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('pauses while hidden and refreshes immediately when visible', async () => {
    vi.useFakeTimers();
    let hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const load = vi.fn().mockResolvedValue('truth');
    const { unmount } = renderHook(() => usePolling({ load }));
    await act(async () => Promise.resolve());

    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(load).toHaveBeenCalledTimes(1);

    hidden = false;
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(load).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('retains the last known truth when a later poll fails', async () => {
    vi.useFakeTimers();
    const load = vi.fn()
      .mockResolvedValueOnce('known truth')
      .mockRejectedValueOnce(new Error('offline'));
    const { result, unmount } = renderHook(() => usePolling({ load }));
    await act(async () => Promise.resolve());
    await act(async () => vi.advanceTimersByTimeAsync(5000));

    expect(result.current.data).toBe('known truth');
    expect(result.current.error?.message).toBe('offline');
    unmount();
  });
});
