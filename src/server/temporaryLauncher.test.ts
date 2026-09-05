import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const launcherPath = resolve('scripts/run-temporary.sh');
const cleanups: string[] = [];

afterEach(() => {
  while (cleanups.length > 0) rmSync(cleanups.pop()!, { recursive: true, force: true });
});

function executable(path: string, body: string): void {
  writeFileSync(path, `#!/bin/sh\nset -eu\n${body}\n`, 'utf8');
  chmodSync(path, 0o755);
}

function harness(options: { codex?: boolean; failInstall?: boolean; longRunning?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'agent-village-launcher-test-'));
  cleanups.push(root);
  const bin = join(root, 'bin');
  const runtimeParent = join(root, 'runtime');
  const log = join(root, 'commands.log');
  mkdirSync(bin);
  mkdirSync(runtimeParent);

  const startBody = options.longRunning
    ? `printf 'STARTED\n' >> '${log}'\ntrap 'exit 0' TERM INT HUP\nwhile :; do sleep 1; done`
    : `printf 'STARTED\n' >> '${log}'\nexit 0`;
  executable(join(bin, 'node'), `
if [ "\${1-}" = '--version' ]; then echo v20.19.0; exit 0; fi
if [ "\${2-}" = 'scripts/auth-setup.ts' ]; then
  mkdir -p "$VILLAGE_AUTH_DIR"
  printf 'test-bootstrap-do-not-print\\n' > "$VILLAGE_AUTH_DIR/bootstrap.txt"
  printf 'AUTH_SETUP|DIR=%s\\n' "$VILLAGE_AUTH_DIR" >> '${log}'
  printf 'Owner enrollment code saved privately to %s/bootstrap.txt\\n' "$VILLAGE_AUTH_DIR"
  exit 0
fi
printf 'NODE_SERVER|PWD=%s|CACHE=%s|MODE=%s|FILE=%s\n' "$PWD" "\${npm_config_cache-}" "\${VILLAGE_MODE-}" "\${VILLAGE_FILE-}" >> '${log}'
${startBody}`);
  executable(join(bin, 'curl'), `
output=''
previous=''
for argument in "$@"; do
  if [ "$previous" = '--output' ]; then output=$argument; fi
  previous=$argument
done
if [ -n "$output" ]; then : > "$output"; fi
exit 0`);
  executable(join(bin, 'tar'), `
target=''
previous=''
for argument in "$@"; do
  if [ "$previous" = '-C' ]; then target=$argument; fi
  previous=$argument
done
mkdir -p "$target/fixtures"
printf '{"name":"agent-village"}\n' > "$target/package.json"
printf 'version: 1\nname: My Agent Village\nprojects: []\n' > "$target/fixtures/village.observer.yaml"`);
  executable(join(bin, 'open'), `printf 'OPEN|%s\n' "$*" >> '${log}'`);
  if (options.codex !== false) executable(join(bin, 'codex'), 'exit 0');
  executable(join(bin, 'sqlite3'), 'exit 0');

  executable(join(bin, 'npm'), `
printf 'NPM|%s|PWD=%s|CACHE=%s|MODE=%s|FILE=%s\n' "$*" "$PWD" "\${npm_config_cache-}" "\${VILLAGE_MODE-}" "\${VILLAGE_FILE-}" >> '${log}'
if [ "\${1-}" = 'ci' ]; then ${options.failInstall ? 'exit 23' : 'exit 0'}; fi
if [ "\${1-} \${2-}" = 'run build' ]; then exit 0; fi
if [ "\${1-}" = 'start' ]; then exit 91; fi
exit 0`);

  return {
    root,
    runtimeParent,
    log,
    env: {
      ...process.env,
      PATH: `${bin}:/usr/bin:/bin`,
      TMPDIR: runtimeParent,
    },
  };
}

function runLauncher(env: NodeJS.ProcessEnv) {
  const child = spawn('/bin/sh', [launcherPath], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const completed = new Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }>((resolveRun) => {
    child.once('exit', (code, signal) => resolveRun({ code, signal, stdout, stderr }));
  });
  return { child, completed };
}

async function waitForLog(path: string, text: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      if (readFileSync(path, 'utf8').includes(text)) return;
    } catch {
      // The command has not written its first line yet.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
  throw new Error(`Timed out waiting for ${text}`);
}

describe('temporary Codex observer launcher', () => {
  it('does not require a Codex executable for read-only index discovery', async () => {
    const test = harness({ codex: false });

    const result = await runLauncher(test.env).completed;

    expect(result.code).toBe(0);
    expect(readdirSync(test.runtimeParent)).toEqual([]);
  });

  it('fails before creating a runtime when sqlite3 is missing', async () => {
    const test = harness();
    rmSync(join(test.root, 'bin/sqlite3'));
    const result = await runLauncher({ ...test.env, PATH: join(test.root, 'bin') }).completed;
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('Missing required command: sqlite3');
    expect(readdirSync(test.runtimeParent)).toEqual([]);
  });

  it('isolates native mode, source and npm cache below the temporary runtime', async () => {
    const test = harness();

    const result = await runLauncher(test.env).completed;

    expect(result.code).toBe(0);
    const log = readFileSync(test.log, 'utf8');
    expect(log).toContain('MODE=native');
    expect(log).toContain('NODE_SERVER');
    expect(log).not.toContain('NPM|start');
    expect(log).toMatch(/FILE=.*\/source\/fixtures\/village\.observer\.yaml/);
    expect(log).toMatch(/CACHE=.*\/npm-cache/);
    expect(log).toMatch(/AUTH_SETUP\|DIR=.*\/agent-village\.[^/]+\/private-auth/);
    expect(log.indexOf('AUTH_SETUP')).toBeLessThan(log.indexOf('NODE_SERVER'));
    expect(result.stdout).toContain('/private-auth/bootstrap.txt');
    expect(result.stdout).not.toContain('test-bootstrap-do-not-print');
    expect(log).toContain('OPEN|http://127.0.0.1:4180');
    expect(readdirSync(test.runtimeParent)).toEqual([]);
  });

  it('keeps temporary auth inside its own runtime even when another auth directory is configured', async () => {
    const test = harness();
    const externalAuth = join(test.root, 'persistent-auth');
    mkdirSync(externalAuth);
    writeFileSync(join(externalAuth, 'retained.txt'), 'retained', 'utf8');
    const result = await runLauncher({ ...test.env, VILLAGE_AUTH_DIR: externalAuth }).completed;
    expect(result.code).toBe(0);
    expect(readFileSync(test.log, 'utf8')).not.toContain(externalAuth);
    expect(readdirSync(externalAuth)).toEqual(['retained.txt']);
    expect(readdirSync(test.runtimeParent)).toEqual([]);
  });

  it('removes the runtime after an install failure', async () => {
    const test = harness({ failInstall: true });

    const result = await runLauncher(test.env).completed;

    expect(result.code).toBe(23);
    expect(readdirSync(test.runtimeParent)).toEqual([]);
  });

  it('stops the child and removes the runtime on SIGTERM', async () => {
    const test = harness({ longRunning: true });
    const run = runLauncher(test.env);
    await waitForLog(test.log, 'STARTED');

    run.child.kill('SIGTERM');
    const result = await run.completed;

    expect([0, 143]).toContain(result.code);
    expect(readdirSync(test.runtimeParent)).toEqual([]);
  });
});
