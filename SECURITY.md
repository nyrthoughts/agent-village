# Security

## Supported version and reporting

Security fixes target the latest commit on the default branch until versioned releases exist. Do not open a public issue for a vulnerability or include secrets in a report. Contact the repository maintainer privately with the affected version, reproduction steps, impact and a minimal proof of concept.

## Private native access

- The server binds to IPv4 loopback. Its canonical browser origin is `http://localhost:PORT`; the IP page redirects on the same port. Native requests validate hosts, origins and fetch metadata. Remote proxies are unsupported.
- One owner enrolls a passkey with a private bootstrap code created by `npm run auth:setup`. The code expires after 15 minutes and is consumed on enrollment. Existing ownership cannot be overwritten by setup. Registration and login require user verification.
- Auth state lives outside the repository in an owner-only directory (`0700`) with private regular files (`0600`). The app stores the credential public key; the authenticator manages its private key. Corrupt configuration fails closed.
- Native data APIs (`/api/board`, `/api/stream`) validate a bearer session; source collection starts only after an authorized read and pauses when no owner session remains. Tokens live only in page memory, not cookies or browser storage. Sessions last 30 minutes. Login rotates the previous session; restarting the server revokes all sessions.
- The event stream is read with `fetch` and bound to its session: logout, rotation, expiry, and a missing or invalid owner configuration close it, so a revoked bearer cannot keep receiving events. Collection also stops when the owner configuration becomes invalid. Locking clears the page session and unmounts private content immediately, even if the logout request fails. Expiration, an `expired` stream frame and HTTP 401 remove the private view; late responses cannot remount it.
- Responses use `Cache-Control: no-store`, a restrictive content security policy and frame protection. Source text is rendered as text, never executable HTML. No endpoint starts, stops, approves or instructs an agent; receiving an event only appends to the journal. Resume commands are shown for copying and never executed. Routes run no subprocess; read-only collectors (`sqlite3 -readonly`, `git` metadata, opt-in `gh api --method GET`) run from timers.

See [owner access](docs/owner-access.md) for setup, limits and recovery boundaries.

## Observation and file inputs

- Claude/OpenClaw hooks use a separate bearer from `ingestion.header`. It permits observation submissions only, never native reads, owner enrollment or browser login. Missing and incorrect authorization are rejected.
- Native hooks validate event names and schemas, enforce a 64 KiB body limit and bound request time/rate. A producer delivery identity and time are accepted only as bounded identifiers and dates and used for the hashed key and `occurredAt`. A persistence failure answers 503 and is shown as source health. Only allowlisted metadata becomes a journal event; a strict schema rejects any other field, so prompts, tool payloads and raw hook extras are never stored. Unknown events are rejected. Hook identities are not matched to projects by name; they stay unmatched until a native identity, an alias or an explicit owner mapping applies.
- The event journal is private (0700 directory, 0600 files, `O_NOFOLLOW`, owner and size checks), bounded in memory (5 000 events / 24 h ring, bounded key cache) and outside the repository. Its idempotence index stores only 128-bit key hashes in private shard files, never key text. Future-dated events are rejected so they cannot pin an entity state. Event content is untrusted input: it is displayed, never interpreted as an instruction.
- Optional GitHub reads are disabled unless repositories are listed and use the owner's local `gh` authentication with GET requests only. Only allowlisted fields are kept; commit messages, titles, check names and environments are redacted before persistence, and links are kept only when GitHub returned them over https without user information or token, key, signature or authorization parameters. The journal schema rejects any other link.
- Claude forwards local lifecycle payloads; the store keeps only allowlisted metadata. The OpenClaw plugin never reads prompt or transcript fields. Neither integration installs automatically.
- Codex observation reads its existing SQLite index in read-only mode and bounded transcript tails. Claude observation reads existing journals and allowlisted process metadata. No additional conversation database or remote inference service is created.
- Commit evidence paths must stay below the YAML directory; absolute paths, upward traversal and escaping symlinks are rejected. Static file traversal is rejected before path resolution.
- AMC-compatible sources use loopback HTTP with an 800 ms timeout. Their fields are allowlisted and likely paths, emails and common secret formats are redacted.

## Public demo and remaining limits

GitHub Pages serves a fictional board snapshot only, labelled as such. It does not connect to native sources or deploy the private server. `demo`, `truth-only` and `live` do not enable the native owner gate; keep their inputs fictional or non-sensitive. Never publish private YAML, authentication files, journals or native API responses.

Passkeys and file permissions do not defend against malware running as the owner, administrator/root access, modified application code or a compromised authenticator. This gate does not encrypt or secure the original Codex/Claude files beyond those tools' own protections. Anyone using an unlocked browser can read it; sharing the OS account, passkey or live session defeats the boundary.

Visit sequence numbers, seen/snoozed item identifiers with timestamps and the language preference remain in local storage. Bearer tokens, conversation text, titles and plans do not. Redaction reduces accidental exposure; it is not a data-loss-prevention guarantee.

The localhost passkey configuration does not support Tailscale Serve, public tunnels, remote devices or Internet hosting. Those require a separate deployment and security design.
