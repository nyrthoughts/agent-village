# Temporary Codex Observer Design

## Decision

Ship a POSIX launcher that runs Agent Village from a temporary directory and removes that directory when the process stops. The launcher observes Codex through the existing read-only app-server connector. It does not install Claude hooks, OpenClaw plugins, a database, a daemon, or a login item.

This is the smallest architecture that proves whether live agent visibility is useful without creating a second hosted product.

## Options considered

1. `npx` or a global package. This is convenient, but npm caches and package state remain on the machine. Rejected for the first validation.
2. A temporary source launcher. It downloads the public branch into `mktemp`, keeps the npm cache inside that directory, runs on loopback, and deletes everything at exit. Selected.
3. A cloud relay. It would require authentication, storage, synchronization, and a privacy model before there is evidence that the dashboard is useful. Deferred.

## User flow

The user runs one documented command from a terminal. The launcher checks for Node.js, npm, Codex, curl, and tar; creates a temporary directory; downloads Agent Village from GitHub; installs and builds inside that directory; and starts native mode on `127.0.0.1:4180`.

The launcher waits for `/api/health`, opens the local page when the platform supports it, and keeps the server attached to the terminal. `Ctrl-C` stops the child process and triggers cleanup. A normal exit and a startup failure use the same cleanup path.

No project data is uploaded. The public GitHub Pages site remains fictional.

## Truth and activity

Codex conversations are activity, not proof of task completion. They appear as people with redacted title, project folder name, role, state, and last activity. They do not advance construction.

Without `VILLAGE_FILE`, the launcher uses a neutral observer fixture with no fictional product work. People gather at the village entrance. If `VILLAGE_FILE` points to a private YAML file, its explicit `activity_mapping` can place people beside real task buildings while evidence remains the only source of construction progress.

## Data and privacy boundaries

- Bind only to `127.0.0.1`.
- Call only Codex `initialize` and `thread/list` through stdio.
- Keep prompts, transcripts, tool calls, token counts, costs, secrets, and absolute paths out of the browser payload.
- Keep npm cache and downloaded source below the temporary directory.
- Do not edit Claude Code or OpenClaw configuration.
- Do not persist hooks or activity payloads.

The launcher cannot make local observation use zero RAM or zero temporary disk while it is running. It guarantees no Agent Village installation remains after a normal exit, interrupt, or handled termination signal.

## Failure behavior

Missing prerequisites fail before download with one actionable message. Download, extraction, install, build, port, or server errors return a non-zero status and still clean the temporary directory. The launcher never falls back to a public upload.

If the browser cannot open automatically, the terminal prints the loopback URL. If Codex is unavailable after startup, the village remains usable as truth-only context and reports degraded activity.

## Testing

- Unit-test prerequisite validation, temporary paths, environment isolation, health polling, and cleanup through injected shell commands.
- Run a launcher smoke test with fake `curl`, `npm`, `codex`, and browser commands so CI never reads real local conversations.
- Keep existing Codex provider, privacy, unit, build, and end-to-end gates.
- Manually verify a real local run reads the current Codex app-server and leaves no temporary directory or listener after `Ctrl-C`.

## Deferred

Claude hooks, OpenClaw plugin installation, cloud synchronization, authentication, remote control, background startup, automatic truth inference, and public real-data hosting remain out of scope until the temporary observer produces real usage evidence.
