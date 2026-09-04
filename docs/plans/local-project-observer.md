# Local project observer

Outcome: the private village shows actual Codex and Claude Code sessions, grouped
by project, without uploading conversations or inventing completion percentages.

1. Read the Codex SQLite index read-only and bounded transcript tails. Discover
   existing Claude sessions from local metadata and transcripts, including tmux.
2. Derive one building per project; show session state, latest user request,
   assistant updates and timestamped history. Agent statements are not independent
   verification. Hide unsupported analytics.
3. Keep localhost-only access; reject foreign origins and hosts. Public builds
   contain only the existing fictional demo. No model calls or new cloud service.
4. Test parsers, grouping, privacy, failures and UI; verify real sessions in-browser.

Delivered catch-up layer: project-level extractive briefs; chronological history
across sessions; source navigation; explicit done/next/blocker sections only;
persisted read points with new-exchange counts; optional focused projects with
distinct stable buildings and access to all remaining conversations. No paid
model, new conversation database or invented percentage.

Limits: bounded recent history, not a complete archive; source timestamps do not
measure work time; idle sessions do not imply a completed project. A CLI stopped
at a trust prompt cannot be treated as an active agent. No remote private hosting
or remote computer discovery is part of this connector.
