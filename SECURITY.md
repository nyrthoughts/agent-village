# Security

## Supported version

Security fixes target the latest commit on the default branch until the project publishes versioned releases.

## Reporting

Do not open a public issue for a vulnerability or include real secrets in a report. Contact the repository maintainer privately with the affected version, reproduction steps, impact, and a minimal proof of concept.

## Security model

- The server is read-only and binds to IPv4 loopback.
- Commit evidence paths must stay below the YAML directory; absolute paths, upward traversal, and escaping symlinks are rejected.
- Activity sources must use loopback HTTP and have an 800 ms timeout.
- Activity fields are allowlisted and likely paths, emails, and common secret formats are redacted.
- Native hook routes exist only in `native` mode, accept at most 64 KiB, validate their schemas, and remain loopback-only with the server.
- Claude hooks forward lifecycle payloads locally, but the in-memory store retains only allowlisted metadata. The OpenClaw plugin never reads prompt or transcript fields.
- Static file traversal is rejected before path resolution.
- The WebGL canvas is presentation-only. It receives already-derived public view data, exposes no agent-control API, and falls back to semantic HTML if initialization or the graphics context fails.
- No authentication exists because V1 is localhost-first. Do not expose it directly to the public internet.

Redaction reduces accidental exposure; it is not a data-loss-prevention guarantee. Any local process can reach a loopback service running as the same user. Keep sensitive prompts, transcripts, secrets, and customer data out of the YAML file and third-party activity endpoints.
