# Security

## Supported version and reporting

Security fixes target the latest commit on the default branch until versioned releases exist. Do not open a public issue for a vulnerability or include secrets in a report. Contact the repository maintainer privately with the affected version, reproduction steps, impact and a minimal proof of concept.

## Private native access

- The server binds to IPv4 loopback. Its canonical browser origin is `http://localhost:PORT`; the IP page redirects on the same port. Native requests validate hosts, origins and fetch metadata. Remote proxies are unsupported.
- One owner enrolls a passkey with a private bootstrap code created by `npm run auth:setup`. The code expires after 15 minutes and is consumed on enrollment. Existing ownership cannot be overwritten by setup. Registration and login require user verification.
- Auth state lives outside the repository in an owner-only directory (`0700`) with private regular files (`0600`). The app stores the credential public key; the authenticator manages its private key. Corrupt configuration fails closed.
- Native data APIs validate a bearer session before collecting sources. Tokens live only in page memory, not cookies or browser storage. Sessions last 30 minutes. Login rotates the previous session; restarting the server revokes all sessions.
- Locking clears the page session and unmounts private content immediately, even if the logout request fails. Successful logout also revokes the server session. Expiration and HTTP 401 remove the private view; late polling responses cannot remount it.
- Responses use `Cache-Control: no-store`, a restrictive content security policy and frame protection. Source text is rendered as text, never executable HTML. No endpoint starts, stops, approves or instructs an agent.

See [owner access](docs/owner-access.md) for setup, limits and recovery boundaries.

## Observation and file inputs

- Claude/OpenClaw hooks use a separate bearer from `ingestion.header`. It permits observation submissions only, never native reads, owner enrollment or browser login. Missing and incorrect authorization are rejected.
- Native hooks validate event names and schemas, enforce a 64 KiB body limit, bound request time/rate and retain a bounded set of allowlisted metadata in memory. Unknown events are rejected.
- Claude forwards local lifecycle payloads; the store keeps only allowlisted metadata. The OpenClaw plugin never reads prompt or transcript fields. Neither integration installs automatically.
- Codex observation reads its existing SQLite index in read-only mode and bounded transcript tails. Claude observation reads existing journals and allowlisted process metadata. No additional conversation database or remote inference service is created.
- Commit evidence paths must stay below the YAML directory; absolute paths, upward traversal and escaping symlinks are rejected. Static file traversal is rejected before path resolution.
- AMC-compatible sources use loopback HTTP with an 800 ms timeout. Their fields are allowlisted and likely paths, emails and common secret formats are redacted.

## Public demo and remaining limits

GitHub Pages serves fictional snapshots only. It does not connect to native sources or deploy the private server. `demo`, `truth-only` and `live` do not enable the native owner gate; keep their inputs fictional or non-sensitive. Never publish private YAML, authentication files, journals or native API responses.

Passkeys and file permissions do not defend against malware running as the owner, administrator/root access, modified application code or a compromised authenticator. This gate does not encrypt or secure the original Codex/Claude files beyond those tools' own protections. Anyone using an unlocked browser can read it; sharing the OS account, passkey or live session defeats the boundary.

Read-position IDs/timestamps and language preferences remain in local storage. Bearer tokens and conversation text do not. Redaction reduces accidental exposure; it is not a data-loss-prevention guarantee.

The localhost passkey configuration does not support Tailscale Serve, public tunnels, remote devices or Internet hosting. Those require a separate deployment and security design.
