# Agent Village — Living Construction and Agent Analytics Design

**Status:** Approved by the user and reviewed by Claude Fable 5.1 on 2026-09-01.

## Outcome

Make progress physically visible. Each task building advances through six construction stages based on server-derived verified truth. Agents appear as original RPG people on the worksite, with visually smaller helper sprites and honest analytics available by clicking people or buildings.

The design preserves the existing truth/activity boundary, connectors, open-source license, semantic controls, and deployment boundary.

## Fable 5.1 corrections adopted

- Construction stage is derived in `server/truth/derive.ts`; the renderer only displays it.
- A building reaches `complete` only through the existing evidence-backed roof gate.
- Tasks without subtasks use the task itself as one truth leaf. Unverified activity never advances construction.
- Eight architectural families compose palette and roof-shape tokens with six shared stages. The implementation does not create forty-eight independent sprite sets.
- Family assignment hashes the stable task ID and never depends on ethnicity, geography, project value, status, or YAML order.
- The adult/helper distinction is visual. Accessible language uses “lead agent” and “helper agent,” never “child worker.”
- Tokens and active time are not collected because current providers and privacy contracts do not support them. The UI renders `Unavailable` rather than zero or an estimate.

## Truth model

Construction stages are:

1. `lot`
2. `foundation`
3. `frame`
4. `walls`
5. `roof`
6. `complete`

For a task with subtasks, only verified subtasks unlock intermediate construction. For a task without subtasks, the task is one leaf. The existing `roof` boolean remains the only completion gate.

```ts
interface TaskProgress {
  stageIndex: 0 | 1 | 2 | 3 | 4 | 5;
  stage: ConstructionStage;
  verifiedLeaves: number;
  totalLeaves: number;
  remainingLeaves: number;
}
```

Status and construction are separate axes. A blocked task can retain its existing foundation or walls while showing a barrier. Review and warning marks overlay the current construction stage.

Projects, features, and the workspace expose rollups of verified, total, and remaining leaves plus verified and total tasks.

## Architectural families

The first registry contains eight original, fictionalized architectural vocabularies:

- `timber_north`
- `courtyard_sun`
- `townhouse_brick`
- `earth_courtyard`
- `mountain_adobe`
- `tropical_stilt`
- `woodland_tile`
- `civic_modern`

Each family supplies CSS variables for roof, roof accent, wall, trim, door, and silhouette token. Names are design-system identifiers, not claims of cultural authenticity. Packs remain extensible through a typed registry.

## Agents and helpers

The activity contract adds `role: lead | helper | unknown`, optional `parentId`, and optional `firstSeenAt`.

- Lead agents render as full-sized people.
- Helpers render as smaller original people clustered beside a lead or task.
- A `×N` bubble shows the number of helpers when several exist.
- Unknown role renders as a neutral full-sized person and never invents hierarchy.
- People use dedicated hit areas on path spurs, not overlapping building buttons.

Claude hooks add `SubagentStart` and `SubagentStop`. Codex preserves its thread source kind so subagent sources map to `helper`; missing linkage remains unknown. OpenClaw and AMC stay unknown until they prove role data.

## Analytics

Clicking a house opens task analytics:

- verified progress and remaining leaves;
- current construction stage;
- project and owner;
- blocker, next action, resume hint, and evidence;
- assigned visible agents;
- tokens: `Unavailable`;
- active time: `Unavailable`.

Clicking a person opens agent analytics:

- provider, state, thread title, project, mapped task;
- lead/helper/unknown role;
- helper count;
- first observed and last activity timestamps when available;
- tokens and active time with an explicit unavailable state.

No percentage is shown when its denominator is unknown. No ETA or cost is inferred.

## Interaction and accessibility

Task buildings and people are real buttons with separate non-overlapping targets. App selection becomes a discriminated union for task and worker dialogs. Focus returns to the correct trigger after closing.

The visual child metaphor is never exposed as age in accessible names. Reduced motion disables tool, worker, helper, water, and completion animation.

## Scope

MVP includes server-derived stages and rollups, eight-family registry, lead/helper/unknown role, Claude and Codex role ingestion, helper count bubble, clickable people, task and worker analytics, unit/E2E coverage, and updated previews.

Deferred: token collection, active-time history, Codex parent linkage when unavailable, OpenClaw helper events, provider cost comparison, unique prop sets per family, and helper walking paths.

## Completion criteria

- The same task ID keeps the same family when YAML order changes.
- Verified subtasks visibly build the structure; live activity alone never advances it.
- Completion never appears without the roof evidence gate.
- People and houses are independently clickable.
- Every unavailable metric says so explicitly.
- All existing connector, truth, accessibility, mobile, hygiene, build, audit, and E2E gates remain green.
