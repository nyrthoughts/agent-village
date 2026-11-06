# Architecture

Agent Village is a read-only operations board for parallel agent work. It answers "where do I need to step in?" from dated, sourced facts. Observation is not execution: no event triggers an action and no endpoint starts, stops or instructs an agent.

## Event flow

```
sources ──► normalized events ──► journal (seq, dedup, JSONL 0600) ──► pure projector ──► board snapshot
                                                     │                                        │
                                                     └──► GET /api/stream (SSE over fetch) ───┴──► browser (same reducer)
```

- **Schema** (`src/shared/events.ts`): one strict zod schema per kind — native session observations, hook signals, dated request/report excerpts, owner mappings, plan revisions, GitHub commit/CI/PR/deployment facts, YAML tasks. Fields are allowlisted and bounded; unknown fields are rejected, so prompts, reasoning, tool payloads and raw hook extras cannot be stored. Every event carries `occurredAt`, a server `receivedAt`, a source, an idempotence key and a provenance: `declared` (agent or YAML claim), `observed` (a source reported it) or `verified` (explicit owner validation).
- **Journal** (`src/server/events/journal.ts`): append-only JSONL in `<private dir>/journal/` (0700 directory, 0600 files, outside the repository). The server assigns a contiguous, monotone `seq` that survives restart through a checkpoint. A replay ring keeps the latest 5 000 events within 24 hours; older events fold into the checkpoint state, so the projection never loses them. Idempotence is exact and durable: every accepted key is recorded as a 128-bit hash in 256 private append-only shard files (`journal/keys/`, `src/server/events/keyIndex.ts`), read in fixed 64 KiB chunks with a bounded in-memory LRU, so a duplicate is recognized after ring eviction, projection eviction and restart. A new event that leaves the projection unchanged (a delayed older CI status) is still a distinct fact and is journaled; it never overwrites the newer entity. Events are written before their keys; lines whose keys are not yet indexed stay in the events file through compaction and are re-indexed at start, and appends are refused beyond 10 000 unindexed events. A closed journal never reopens its files. Corrupt checkpoints fail closed; a torn final line is skipped.
- **Projector** (`src/shared/projector.ts`): a pure reducer shared by server and browser. Each entity keeps its newest fact by `occurredAt` (a late CI `pending` cannot replace `success`). Reports are distinct immutable facts ordered by occurrence. Entity counts are capped.
- **Read model** (`src/shared/boardView.ts`): attention items, the since-last-visit digest, one row per project, the proof ladder, the sourced timeline and copy-only resume commands. It produces no percentage, estimate or inferred completion.

## Hook identity

A hook's key is, in order: the producer's delivery identity (`x-village-event-id` header or `event_id`/`eventId` body field, generated once per lifecycle event and reused on retry); the tool call identity (`tool_use_id`, event name, helper id); otherwise the receiving second. The bundled Claude command and OpenClaw plugin send an identity and the producer time. Legacy metadata-only hooks have no identity, so their retries are merged only within the same second; a resumed session still produces new lifecycle events. `occurredAt` is the producer time when supplied and not in the future, the receipt time otherwise; `receivedAt` is always the server receipt.

## Sources and detection

| Source | Detection | Provenance |
| --- | --- | --- |
| Claude / OpenClaw hooks | Push (`/api/hooks/*`, ingestion header) | observed |
| Codex index and journals | `fs.watch` on `~/.codex/sessions` and the index directory, 250 ms debounce, 5 s safety poll | observed (state), declared (reports) |
| Claude journals and process metadata | `fs.watch` on `~/.claude/projects` and `~/.claude/sessions`, same debounce and poll | observed / declared |
| GitHub (opt-in per repository) | `gh api --method GET` with ETags every 30–60 s | observed |
| Owner plan ledger and mappings | Immediate on save | verified |

Refreshes are serialized: a change during a run schedules exactly one more. Native snapshots become events by diff against the projection, so unchanged polls add nothing. Collection starts after an authorized board read, never inside the request, and pauses when no owner session remains or the owner configuration becomes invalid. A collector or GitHub request still in flight when its source stops (lock, revocation, shutdown) is discarded. GitHub reads run only from their periodic timer; per repository they cover the default branch and up to five branches of observed sessions, read check runs page by page (three pages of 100 at most), and report `success` only when every check was read, completed and recognized. Partial pages and unknown conclusions give `unknown`; only skipped/neutral checks give `neutral`; neither proves a green CI. Commit messages, titles, check names and environments are redacted before persistence; links with user information or token, key, signature or authorization parameters are dropped while the fact is kept.

Source health records `lastOkAt`, `lastErrorAt` and the expected cadence. A storage failure is recorded as a source failure, never as a successful read, and every background failure becomes health or a board error rather than an unhandled rejection. The browser derives the status with the wall clock of each render: stale beyond three cadences, unreachable when the latest attempt failed. Every source is always listed.

## Project attribution

In order: a native collector identity (cwd → Git common root, with the normalized GitHub remote kept as an attribute), `VILLAGE_PROJECT_ALIASES` (directories, `session:` or `title:` entries), an explicit owner mapping written to the private `project-mappings.json`, then the parent of a helper session. A hook-only identity stays in **Unmatched** until one of these applies; names and directory basenames are never compared.

GitHub facts attach by repository AND observed branch, then by exact SHA: commits of a branch a project session is on; pull requests whose head branch is observed or whose head is one of those commits; CI runs and deployments of one of those SHAs (commit, pull request head or merge commit). The default branch's CI never proves a feature branch. A project without an observed branch gets no GitHub proof.

## Stream

`GET /api/board` returns the snapshot (epoch, seq, entities, plans, health, capabilities). `GET /api/stream?after=SEQ&epoch=E` (or `Last-Event-ID`) replays the missed events, then streams new ones with `id = seq`, a context frame for plans and health, and a heartbeat every 15 seconds. Replay and subscription run in one synchronous block, so nothing falls between them. A future position, a folded position or another journal epoch receives `reset` with a full snapshot. The stream is bound to its owner session and closes on logout, rotation, expiry, or when the owner configuration disappears or becomes invalid (checked on every frame and heartbeat). The browser reads it with `fetch` (EventSource cannot send the bearer), applies the same reducer, resumes from its last sequence after a gap, reconnects with exponential backoff, and polls `/api/board` every 5 seconds while the stream is down. Polls are serialized (visibility changes reuse the poll in flight, one timer at a time); a poll response that started before a stream reset is discarded; a late 401 from a stopped feed clears only the token it sent, never a rotated session. Demo and YAML boards have no stream and are polled.

Render latency (server `receivedAt` → DOM commit) is measured in the page and shown in the source bar. A Playwright test drives 50 hooks whose producer time differs from receipt, reads each event's `receivedAt` from an independent stream reader, and asserts DOM p95 ≤ 2 s.

## Board

- **For you**: contradictions, decisions, reports to read and validations, sorted by type, then oldest wait first. Nothing expires on a timer: an item stays until a newer fact of the same source (a newer state or report of that session, a newer owner request, a plan revision) or an owner action (seen, snooze, validation) resolves it. Actions: open, copy the resume command, validate with a note through the existing ledger, mark seen, snooze.
  - Contradictions: a success claim that cites a SHA against a failed CI result or deployment of that exact commit (proved); a claim without a SHA against a failure on the observed head (shown as uncertain, to check); two sessions declaring opposite outcomes; YAML verified claims without valid evidence. Negated wording ("tests are not passing", "no tests failed") carries no polarity.
  - Decisions: an unanswered agent notification; a blocker declared in any session's latest report (another session's newer report does not clear it).
  - Reports to read: the latest report of a confirmed lead conversation that is not working now, or its stop signal. The wording is factual; no reply is claimed to be owed. Unknown roles create no item.
  - Validations: a declared completion newer than the ledger, when the project has no ledger plan or has unvalidated milestones.
- **Since your last visit**: changes after the owner's global or per-project sequence mark, grouped by project; requests and session state changes are folded. Without a mark for the journal epoch, the last 24 hours.
- **Projects**: one line each — goal (from the ledger only), state with provenance and date, declared next action and blockers, milestones validated in the owner ledger (YAML tasks with verified evidence are counted separately and never called validated milestones), and the proof ladder `Declared / Activity / Commit / CI / Merge / Deployment`. Each dot is one dated fact with its source; an unlit dot means not observed, never failure; CI from another attributed commit is labelled as such; partial or unknown CI is inconclusive. Working means a non-`detected` signal at most two minutes old and not in the future; older or future signals are shown as unconfirmed, including in session detail.
- **Detail** (side panel, list stays visible): ladder with sources, goal and milestone ledger editing, agents and sessions with copy-only resume commands, the sourced timeline and the source conversation.
- **Reading stability**: while the pointer or focus is in the reading area, or a detail is open, attention, digest, list and detail are frozen; the source bar shows "N changes — apply" in a slot that is always laid out, so its appearance moves neither the reading area nor the selected text. Applying keeps the selection and restores scroll anchors, so new timeline entries land outside the viewport. Rows that received an observed event are highlighted for at most 1.4 s on a timer independent of later renders, never under `prefers-reduced-motion`. Keyboard: `j`/`k`, Enter, Escape.

Browser storage holds only language, visit sequence numbers, and seen/snoozed item identifiers with timestamps.

## Modes

| Mode | Board |
| --- | --- |
| `native` | Journal, local sources, hooks, optional GitHub; owner passkey required. |
| `demo` | Fictional six-project fixture (`fixtures/board.demo.json`), labelled fictional; also exported to `dist/demo/board.json` for GitHub Pages. |
| `truth-only` | YAML tasks with verifier verdicts, rebuilt on a background timer that re-verifies evidence every time (one refresh at a time). CI, merge and deployment remain `not_checked_v1`. |
| `live` | YAML plus an AMC-compatible loopback activity endpoint. |

## Runtime and privacy

- Node binds IPv4 loopback; native APIs require the owner session and canonical origin; responses use `no-store` and a strict CSP.
- Plans, mappings, journal and auth state stay in the private directory outside the source tree and static output. Public builds use fictional fixtures only.
- Subprocesses are limited to read-only collectors (`sqlite3 -readonly`, `git` metadata, opt-in `gh api --method GET`), started from timers, never from a route. A guard test enforces this.
- No agent commands, remote transcript bridge, webhook, tunnel, token accounting or model inference.

Known tradeoffs: the ledger and journal are single-process stores. The key index grows by 16 bytes per accepted event and is never compacted. Legacy hooks without a delivery or tool identity are merged only within the same receiving second. Claims are detected from explicit wording; the owner reads the quoted sources before deciding.
