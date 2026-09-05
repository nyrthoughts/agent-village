# Deployment

Agent Village has two separate surfaces: a public fictional demo and a private native server on the owner's computer. A hosted page cannot read local sessions. No upload bridge or conversation database joins them.

## Private installed runtime

Requirements: Node.js 20.19+, npm and sqlite3. Run from a trusted source checkout:

```sh
npm ci
npm run build
npm run auth:setup
VILLAGE_MODE=native npm start
```

Open `http://localhost:4180`. First-time setup prints paths to private files, not their secrets. Open `bootstrap.txt` locally, enter its code within 15 minutes and complete passkey registration. Setup refuses to overwrite an enrolled owner. Subsequent starts use the existing owner state and do not rerun setup.

The default auth directory is `~/.local/share/agent-village`. Set the same absolute `VILLAGE_AUTH_DIR` for setup, server and optional connectors if overriding it. Keep it owner-only and outside the repository, public output and shared backups. See [owner access](owner-access.md) for files, permissions and deliberate recovery.

The server binds to `127.0.0.1:4180` but requires the canonical browser origin `http://localhost:4180`. The IP page redirects on the same port. If setting `PORT`, open that port directly and update optional connector endpoints consistently.

The browser session lasts 30 minutes and exists only in memory. Reloading requires another passkey check; restarting the server invalidates sessions. Each login rotates the previous session. **Lock** clears private content immediately. Successful logout revokes its server token; if the request fails, the page still locks while that token remains valid until expiry or later login.

Native APIs reject unauthenticated reads before collecting journals. `/api/health` is public liveness only, not proof of authentication or source access. Preserve installed owner state when updating the application, then verify the unauthenticated APIs remain closed before unlocking it.

## Disposable launcher

The [temporary launcher](../scripts/run-temporary.sh) downloads published source and puts its build, npm cache, runtime and private auth directory under one validated temporary directory. It runs owner setup automatically before starting native mode. It prints the bootstrap file location, never the secret; the user still performs enrollment.

Stopping the launcher removes its temporary auth state as well as the runtime. Every new launch therefore requires a fresh enrollment. This is distinct from the installed runtime above, whose owner state persists. The authenticator may retain a passkey created for a disposable run; runtime cleanup does not manage authenticator credentials.

The launcher requires curl and tar in addition to the native prerequisites. It does not install a daemon, Claude hooks or the OpenClaw plugin. Inspect its source before executing downloaded code. Use the installed runtime when preserving the same owner enrollment matters.

## Public fictional demo

`npm run build` exports fictional, redacted snapshots to `dist/demo` and builds the client. With `VILLAGE_PUBLIC_BASE=/agent-village/`, the client reads only static demo files and skips native authentication. A root-hosted demo uses the server's `native: false` status. Missing APIs may fall back to static snapshots on HTTP 404 or an HTML shell; authentication failures do not trigger that fallback.

The `deploy public demo` workflow currently runs on `main`, `design/emerald-village-v4` and manual dispatch. It publishes `dist` to GitHub Pages with the repository subpath. That does not deploy the private server. Inspect exports before publishing; never copy native responses, journals or auth state into the artifact.

The demo illustrates evidence-based task progress. Native buildings organize observed project conversations and sourced reports, without unsupported completion percentages or independent verification. Activity never proves delivery.

## Unsupported exposure and other modes

Do not proxy the native server through Tailscale Serve, a reverse proxy or a public tunnel. Its localhost passkey and origin rules do not support remote devices or Internet hosting. The previous tailnet exposure instructions no longer apply.

The development server (`npm run dev`, port 5173) defaults to fictional data. Use the built server at its canonical localhost origin to validate native passkeys; the development proxy is not a supported native deployment.

`truth-only` reads YAML evidence without workers. `live` also reads an AMC-compatible loopback endpoint. Neither uses the owner gate; use fictional or non-sensitive inputs. Optional native hooks require the separate ingestion header created by setup; see [connections](connections.md).

Local authentication does not defend against same-account malware, root/administrator access or use of an unlocked browser session. Keep the OS account, passkey and active session private.
