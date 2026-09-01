import type { ActivitySnapshot, Worker } from '../../shared/activity.js';
import type { ActivityMapping } from '../../shared/schema.js';
import { mapWorkers } from './mapWorkers.js';
import type { HookActivityStore } from './hookStore.js';

export interface WorkerProvider {
  read(): Promise<Worker[]>;
}

export class NativeActivityHub {
  constructor(
    private readonly providers: readonly WorkerProvider[],
    private readonly now: () => Date = () => new Date(),
    private readonly hooks?: HookActivityStore,
  ) {}

  ingestClaude(payload: unknown): boolean {
    return this.hooks?.ingestClaude(payload) ?? false;
  }

  ingestOpenClaw(payload: unknown): boolean {
    return this.hooks?.ingestOpenClaw(payload) ?? false;
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
