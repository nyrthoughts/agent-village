import { useEffect, useState } from 'react';

export interface PollingScheduler {
  setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

export interface PollingState<T> {
  data?: T;
  error?: Error;
  loading: boolean;
  updatedAt?: string;
}

export interface PollingOptions<T> {
  load: () => Promise<T>;
  intervalMs?: number;
  scheduler?: PollingScheduler;
  visibilityTarget?: Document;
}

const defaultScheduler: PollingScheduler = {
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (handle) => clearTimeout(handle),
};

export function usePolling<T>({
  load,
  intervalMs = 5000,
  scheduler = defaultScheduler,
  visibilityTarget = document,
}: PollingOptions<T>): PollingState<T> {
  const [state, setState] = useState<PollingState<T>>({ loading: true });

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;

    const clear = () => {
      if (timer !== undefined) scheduler.clearTimeout(timer);
      timer = undefined;
    };

    const schedule = () => {
      clear();
      if (!active || visibilityTarget.hidden) return;
      timer = scheduler.setTimeout(() => void run(), intervalMs);
    };

    const run = async () => {
      if (!active || running || visibilityTarget.hidden) return;
      running = true;
      try {
        const data = await load();
        if (active) setState({ data, loading: false, updatedAt: new Date().toISOString() });
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        if (active) setState((current) => ({ ...current, error, loading: false }));
      } finally {
        running = false;
        schedule();
      }
    };

    const onVisibilityChange = () => {
      clear();
      if (!visibilityTarget.hidden) void run();
    };

    visibilityTarget.addEventListener('visibilitychange', onVisibilityChange);
    void run();
    return () => {
      active = false;
      clear();
      visibilityTarget.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [intervalMs, load, scheduler, visibilityTarget]);

  return state;
}
