# Contributing

Keep Agent Village understandable in one sitting. Prefer fewer dependencies, explicit data flow, and evidence-backed state.

## Development

```sh
nvm use
npm ci
npm run dev
```

Before opening a change:

```sh
npm run typecheck
npm test -- --run
npm run build
npm run e2e
node scripts/check-clean.mjs
npm audit
```

Add focused tests for behavior changes. Keep all committed fixtures fictional. Never commit real names, company identifiers, absolute home paths, transcripts, prompts, credentials, or customer data.

Changes must preserve the primary invariant: activity may decorate truth, but it cannot create, upgrade, or downgrade progress. Put ideas outside the current scope in `docs/backlog.md` before adding infrastructure.
