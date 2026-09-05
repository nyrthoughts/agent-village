# Local owner access

Native mode listens only on IPv4 loopback. Open `http://localhost:4180` in a browser with WebAuthn support. The IP URL serves a locked shell and reports the canonical localhost origin; it cannot read private data.

## Initial setup

1. Run `npm run auth:setup` locally in the installed runtime. If using `VILLAGE_AUTH_DIR`, set the same absolute directory for setup, the server and hook senders.
2. Setup prints the path to `bootstrap.txt`, never its code. Open that private file yourself, paste the code into the locked page and create the owner passkey within 15 minutes. Complete the browser's user-verification gesture yourself.
3. The server consumes the bootstrap file after enrollment. Only this owner's passkey can start a reading session. Existing enrollment cannot be replaced by setup or a public signup endpoint.
4. Run `npm run connect:claude` to migrate the known Agent Village hooks to authenticated observation. Other hooks and settings are preserved. OpenClaw reads the same private ingestion file.

The default state directory is `~/.local/share/agent-village` with mode 0700. Files use mode 0600. `owner.json` stores a public credential, user ID and signature counter. `ingestion.header` is a separate observation-only secret. Never put these files inside the repository, static output, backups with public access, or screenshots.

## Sessions and limits

Sessions expire after 30 minutes. The token lives only in page memory; reloading requires another login. Login rotates the previous session, so signing in from another tab locks the earlier tab. Logout and server restart revoke sessions. There are no session cookies or browser-storage tokens.

Only minimal health and enrollment status are public. Private API reads require the owner session before collecting source data. A hook credential cannot read those APIs or administer the owner. Missing/corrupt private configuration fails closed. No endpoint can start, stop or instruct an agent.

Auth challenges last two minutes and are consumed on a verification attempt. Auth requests are limited to 30 per minute; hook requests to 240 per minute. JSON uploads are limited to 64 KiB and five seconds. The observation store retains at most 1,000 records and expires them after 30 minutes.

This protects against an anonymous visitor, another ordinary local account and cross-origin requests. A process already running with the owner's OS permissions can read the owner's source files; this web gate cannot protect those files from that process. Passkey storage/synchronization follows the authenticator the owner chooses. No transcript data or model requests leave the machine through this feature.

## Recovery and deployment

If the integrated browser does not support WebAuthn, use a compatible system browser at the same localhost URL. Never disable authentication to recover access. Losing the owner passkey requires deliberate local recovery of the private owner configuration; there is no remote recovery endpoint or automatic reset.

An installed runtime keeps its private directory across updates. Back up only the exact installed runtime and private state to a directory accessible by its owner before an authorized update. The disposable launcher instead places private state inside its own temporary directory and removes it on exit; every new temporary launch requires fresh enrollment. It does not alter an installed runtime's owner state.

Restart only Agent Village. Verify unauthenticated `/api/village` and `/api/activity` return 401 on localhost, and that `/api/auth/status` reports the expected enrollment state. The owner's actual enrollment is not complete until their real browser gesture succeeds.
