import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveMode } from './mode.js';
import { createRouter, type RouterOptions } from './router.js';
import { CodexAppServerProvider } from './activity/codexProvider.js';
import { HookActivityStore } from './activity/hookStore.js';
import { NativeActivityHub } from './activity/nativeActivity.js';

export const LOCAL_HOST = '127.0.0.1';

export function createVillageServer(options: RouterOptions): Server {
  const route = createRouter(options);
  return createServer((request, response) => {
    void route(request, response).catch(() => {
      if (!response.headersSent) {
        response.statusCode = 500;
        response.setHeader('content-type', 'application/json; charset=utf-8');
      }
      response.end('{"error":"internal_error"}');
    });
  });
}

export function listenLocal(server: Server, port: number): Promise<void> {
  return new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, LOCAL_HOST, () => {
      server.off('error', reject);
      resolveListen();
    });
  });
}

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 4180);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be a valid integer');
  const mode = resolveMode();
  const hooks = new HookActivityStore();
  const nativeActivity = new NativeActivityHub([
    new CodexAppServerProvider({
      idleMinutes: Number(process.env.VILLAGE_IDLE_MINUTES ?? 30),
    }),
    { read: async () => hooks.workers() },
  ], undefined, hooks);
  const server = createVillageServer({
    villagePath: resolve(process.env.VILLAGE_FILE ?? 'fixtures/village.demo.yaml'),
    distDir: resolve(process.env.DIST_DIR ?? 'dist'),
    mode,
    amcEndpoint: process.env.AMC_ENDPOINT,
    demoActivityPath: resolve(process.env.AMC_FIXTURE ?? 'fixtures/amc/dashboard.nominal.json'),
    nativeActivity: mode === 'native' ? nativeActivity : undefined,
  });
  await listenLocal(server, port);
  console.log(`Agent Village listening on http://${LOCAL_HOST}:${port}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
