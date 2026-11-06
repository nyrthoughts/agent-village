# Deferred backlog

These are options, not commitments.

- `connect:codex`: only if the installed Codex version documents a `notify` hook; the file watcher and 5-second poll cover Codex today.
- Merge projects across separate clones of the same remote. Identities are keyed by Git common root today, so existing plans keep their identifiers; the normalized remote is stored as an attribute.
- Model-written syntheses, if ever added: labelled as synthesis, citing event sequence numbers, never changing state or validation.
- Inspect `test` and `observed` evidence through pluggable verifiers in YAML modes.
- Adapters for other local session dashboards without changing the event contract.
- Shared authentication only if the product moves beyond localhost.
- A physical display driven by the same `/api/board` projection.
- Per-branch proof ladders when a project has several observed branches (today the newest attributed commit is the head).
- Compaction of the journal key index (16 bytes per accepted event, never pruned today).
- Remove the village-era `observedVillage`/`mergeLiveSessions` helpers and construction stages once the ledger tests no longer rely on them.

Explicitly out of scope: agent commands, automatic execution triggered by events, approvals, prompt inspection, cost accounting, webhooks or tunnels, and public multi-tenant hosting. Any future execution would be a separate, disabled-by-default phase.
