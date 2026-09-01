# Temporary Codex Observer Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add one temporary launcher that shows real local Codex conversations in Agent Village and removes its downloaded source, dependencies, npm cache, and server process at exit.

**Architecture:** A POSIX shell script owns one validated `mktemp` directory, downloads the public design branch, builds inside that directory with a contained npm cache, and starts the existing native loopback server. A neutral YAML fixture supplies no fictional work; Codex conversations remain a separate activity overlay and can be mapped only through an optional private `VILLAGE_FILE`.

**Tech Stack:** POSIX shell, Node.js 20.19+, npm, Codex app-server stdio, Vitest, GitHub Actions.

---

### Task 1: Neutral observer truth

**Files:**
- Create: `fixtures/village.observer.yaml`
- Create: `src/server/truth/observerFixture.test.ts`

**Step 1: Write the failing test**

Load `fixtures/village.observer.yaml` through `loadWorkspace`. Assert that the workspace is valid, is named `My Agent Village`, has one project, contains zero tasks, and contains no activity mappings.

**Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/server/truth/observerFixture.test.ts`

Expected: FAIL because `fixtures/village.observer.yaml` does not exist.

**Step 3: Add the minimal fixture**

```yaml
version: 1
name: My Agent Village
projects:
  - id: observed-work
    name: Observed work
    objective: See current agent activity without inferring task progress
    features: []
    tasks: []
```

**Step 4: Run the focused test**

Expected: one passing test.

**Step 5: Commit**

Use the repository commit workflow with `feat(truth): add neutral observer workspace`.

### Task 2: Temporary launcher behavior

**Files:**
- Create: `scripts/run-temporary.sh`
- Create: `src/server/temporaryLauncher.test.ts`

**Step 1: Write failing launcher tests**

Use real `/bin/sh` plus a temporary fake `PATH`. Cover these observable behaviors:

- missing `codex` fails before creating an Agent Village temporary directory;
- a successful run sets `VILLAGE_MODE=native`, defaults `VILLAGE_FILE` to the neutral fixture, and puts `npm_config_cache` below the temporary directory;
- normal exit removes the temporary directory;
- `SIGTERM` stops the child and removes the temporary directory;
- an install or build failure returns non-zero and still removes the temporary directory.

The fake commands must log environment and working directory only. They must never call a real Codex instance or the network.

**Step 2: Run the focused test to verify RED**

Run: `npm test -- --run src/server/temporaryLauncher.test.ts`

Expected: FAIL because `scripts/run-temporary.sh` does not exist.

**Step 3: Implement the minimal launcher**

The script must:

1. use `set -eu`;
2. check `node`, `npm`, `codex`, `curl`, and `tar` before `mktemp`;
3. validate Node.js is at least 20.19;
4. validate an optional `VILLAGE_FILE` exists;
5. create one directory with `mktemp -d "${TMPDIR:-/tmp}/agent-village.XXXXXX"`;
6. register `EXIT`, `INT`, `TERM`, and `HUP` cleanup;
7. download and extract `design/emerald-village-v4` from GitHub;
8. run `npm ci --ignore-scripts --no-audit --no-fund` with its cache below the temp directory;
9. run `npm run build`;
10. start `VILLAGE_MODE=native npm start` in the background;
11. poll `http://127.0.0.1:${PORT:-4180}/api/health` with a bounded timeout;
12. open the URL with `open` or `xdg-open` when available, otherwise print it;
13. wait for the child and preserve its exit status;
14. terminate the child before deleting only the validated `mktemp` path.

**Step 4: Run focused tests to verify GREEN**

Expected: all launcher tests pass with no real network or Codex access.

**Step 5: Refactor without changing behavior**

Keep prerequisite checks, health polling, child shutdown, and cleanup in named shell functions. Re-run focused tests.

**Step 6: Commit**

Use the repository commit workflow with `feat(runtime): add temporary Codex observer`.

### Task 3: Public instructions and CI shell gate

**Files:**
- Modify: `README.md`
- Modify: `docs/connections.md`
- Modify: `docs/deployment.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/deploy-pages.yml`

**Step 1: Add the user command and boundaries**

Document the inspectable launcher URL and one-line command. State that the launcher downloads temporary dependencies while running, removes them at exit, observes Codex only, binds to loopback, and does not make the public demo live.

Document `VILLAGE_FILE=/absolute/private/path/village.yaml` as the optional mapping path. Keep Claude Code and OpenClaw setup explicitly separate because those integrations modify tool configuration.

**Step 2: Add a CI syntax check**

Run `sh -n scripts/run-temporary.sh` in both CI workflows before tests.

**Step 3: Verify documentation hygiene**

Run: `node scripts/check-clean.mjs && git diff --check`

Expected: `Clean public fixture.` and exit 0.

**Step 4: Commit**

Use the repository commit workflow with `docs: explain temporary observer`.

### Task 4: Full verification and real local smoke test

**Files:**
- Modify only if a failing proof requires a tested fix.

**Step 1: Run the complete automated gate**

```sh
sh -n scripts/run-temporary.sh
npm run typecheck
npm test -- --run
npm run build
node scripts/check-clean.mjs
npm audit --audit-level=high
npm run e2e
git diff --check
```

Expected: zero failures.

**Step 2: Run a real bounded smoke test**

Run the launcher against the checked-out source through a test-only source override that still creates its own temporary runtime. Verify:

- `/api/health` returns 200;
- `/api/activity` returns `live` with redacted Codex worker records or returns degraded without exposing private fields;
- the server listens only on `127.0.0.1`;
- terminating the launcher removes its temporary directory and listener.

Do not capture or publish conversation titles in logs, screenshots, fixtures, or commits.

**Step 3: Push final branch state**

Use the repository push workflow. Verify remote `design/emerald-village-v4` equals local HEAD and remote `main` remains unchanged.

**Step 4: Clean the working environment**

Delete the temporary clone, node modules, caches, test artifacts, and launcher runtime. Verify no Agent Village process or port 4180 listener remains.
