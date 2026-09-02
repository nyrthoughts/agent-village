# Connections

Agent Village observes lifecycle state. It does not start, stop, approve, or send instructions to agents, and activity never changes a building's progress.

## Codex

Run `VILLAGE_MODE=native npm start`. No installation step is required when the `codex` CLI is available. The server starts `codex app-server --stdio`, calls the read-only `thread/list` method, then closes the process. Results are cached for ten seconds and inactive conversations expire from the view after 30 minutes by default. Codex `subAgent*` sources are helpers; known non-subagent sources are leads; missing source metadata stays unknown.

Set `VILLAGE_IDLE_MINUTES` to change that window.

For a temporary run that leaves no Agent Village installation or npm cache after exit:

```sh
curl -fsSL https://raw.githubusercontent.com/nyrthoughts/agent-village/design/emerald-village-v4/scripts/run-temporary.sh | sh
```

This default uses `fixtures/village.observer.yaml`, which contains no fictional tasks. Real Codex conversations appear at the entrance. An optional private `VILLAGE_FILE` can supply evidence-backed buildings and `activity_mapping`; it is read locally and never uploaded.

## Claude Code

```sh
npm run connect:claude
VILLAGE_MODE=native npm start
```

The installer updates `~/.claude/settings.json` atomically, preserves existing hooks, and adds short loopback POST hooks. It is safe to run again. To reverse it:

```sh
npm run disconnect:claude
```

The server stores only session ID, helper ID/type, project folder name, normalized role/state, and timestamps in memory. `SubagentStart` creates a helper beside its lead; `SubagentStop` removes it. It does not persist hook payloads.

The temporary Codex command does not install these hooks. Claude Code remains an explicit, reversible setup because its lifecycle events require a configuration change.

## OpenClaw

```sh
openclaw plugins install ./integrations/openclaw
VILLAGE_MODE=native npm start
```

The bundled plugin uses the typed `session_start`, `before_agent_run`, `agent_end`, and `session_end` hooks. It reports the session key, agent ID, workspace folder, and lifecycle state to loopback. It never reads messages, prompts, tool calls, or outputs.

OpenClaw is not bundled. Installation must happen on the machine where its Gateway runs.

The temporary Codex command does not install this plugin.

## Map a conversation to a building

People appear at the village entrance even without a mapping. To place one beside a building, add a case-insensitive title substring to the YAML:

```yaml
activity_mapping:
  - match: agent village
    taskId: publish-v1
```

Mapping changes position only. Building status still comes exclusively from the truth plane and its evidence.

## Analytics contract

Selecting a building shows verified/total leaves, remaining work, owner, blocker, next action, evidence, and connected people. Selecting a person shows tool, state, role, project, task mapping, and observed timestamps. Token usage and active duration remain `Unavailable` until a provider exposes trustworthy values; Agent Village does not estimate either metric.
