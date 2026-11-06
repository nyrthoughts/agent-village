import type { ActivitySnapshot, Worker } from '../../shared/activity.js';
import type { ActivityMapping } from '../../shared/schema.js';
import { mapWorkers } from './mapWorkers.js';
import type { HookActivityStore, HookDelivery } from './hookStore.js';

export interface WorkerProvider {
  read(): Promise<Worker[]>;
}

export class NativeActivityHub {
  constructor(
    private readonly providers: readonly WorkerProvider[],
    private readonly now: () => Date = () => new Date(),
    private readonly hooks?: HookActivityStore,
  ) {}

  observe(listener: Parameters<HookActivityStore['observe']>[0]): () => void {
    return this.hooks?.observe(listener) ?? (() => undefined);
  }

  ingestClaude(payload: unknown, meta?: HookDelivery): boolean {
    return this.hooks?.ingestClaude(payload, meta) ?? false;
  }

  ingestOpenClaw(payload: unknown, meta?: HookDelivery): boolean {
    return this.hooks?.ingestOpenClaw(payload, meta) ?? false;
  }

  async snapshot(mappings: readonly ActivityMapping[]): Promise<ActivitySnapshot> {
    const results = await Promise.allSettled(this.providers.map((provider) => provider.read()));
    const workers = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    return {
      status: workers.length > 0 ? 'live' : 'degraded',
      fetchedAt: this.now().toISOString(),
      workers: mapWorkers(workers, mappings),
    };
  }
}
