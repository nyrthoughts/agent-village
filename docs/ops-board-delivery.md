# Operations board delivery

Local implementation verified on 6 November 2026. The village is the default view; the board remains available. Both use the same sourced data. Sources provide dated facts; the owner ledger controls milestone validation.

| Phase | Delivered | Main coverage |
| --- | --- | --- |
| Journal | Bounded projection and replay; private JSONL; durable deduplication; recovery after restart and index failure | Journal, projector and adapter tests |
| Stream | Owner-authenticated snapshot and fetch SSE; replay/reset; revocation; reconnect and polling fallback | HTTP and client feed tests |
| Sources | Serialized watching and polling; dated health; opt-in GitHub reads scoped to repository, branch and SHA | Source and mapping tests |
| Board | Attention, visit digest, projects and detail; ledger editor; copy-only resume; stable reading; FR/EN and keyboard | View-model and browser tests |
| Retirement | Scenes, artwork, old client modules and obsolete journeys deleted; temporary exclusions removed; fictional static export retained | Full checks and static browser preview |

The server and browser share the pure reducer. A delayed fact stays journaled without replacing a newer entity. Source identities survive retries. Index failures retain recoverable lines; stopped collectors discard late results.

Review fixes cover attribution, negated claims, unresolved waits, ledger-only validation, stale activity, auth drift, persistence errors, redaction and request races. All 19 independent checks pass, with repository regression coverage.

## Verification

Checks were repeated independently after a clean dependency installation:

| Check | Result |
| --- | --- |
| `npm ci`, `npm ls --all` | Pass; valid dependency tree |
| `npm run typecheck` | Pass across all remaining code |
| `npm test -- --run` | 266 tests in 43 files pass |
| `npm run e2e` | 17 pass on local Chrome, including passkey verification with a virtual authenticator |
| Server receipt → DOM | p95 6 ms on 50 fictional hooks, measured from `receivedAt`; target 2,000 ms |
| Static build and preview at `/agent-village/` | Pass; fictional board loads without an API |
| Hygiene, diff whitespace and shell syntax | Pass, including the generated hook command |
| `npm audit` | Zero vulnerabilities |

A read-only public GitHub probe observed commit, CI and deployment facts. Conditional requests confirmed HTTP 200/304, including `gh` exit 1 for 304. Private histories and private repositories were outside validation.

Dependencies: Vite 8.2.4, Vitest 4.1.12, source-map-js 1.2.2 and Zod 4.6.7. npm 10's resolver crashed during updates. Exact registry manifests supplied the lockfile updates; clean installation, tree validation, tests and audit passed. Global tooling was not changed.

## Limits

- Existing hooks need the connection installer to send stable IDs. Anonymous legacy deliveries retain documented best-effort deduplication.
- Git common-root identities preserve existing ledgers; separate clones remain separate projects. Durable keys grow by 16 bytes per event. Already-folded keys from pre-index development journals cannot be reconstructed.
- Optional Codex notifications and model syntheses remain in the backlog. Historical design notes remain under `docs/plans/`.
- Browser inspection covered desktop and mobile. The ten-second human usability target was not timed. Deployment and private-source activation are outside this local delivery.

The village uses the canonical project mappings, parent-session ownership and presence clock. Unmatched sessions open their source conversation. The inbox remains reachable at zero attention items. The initial camera fits all six demo projects, names keep their screen size, and zoom/reset controls remain separate. Browser tests cover these paths on desktop and at 390 px, including stable reading when new events arrive.
