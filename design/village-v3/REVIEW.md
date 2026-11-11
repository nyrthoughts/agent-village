# Review before showing

Two passes on the first render of the v2 boards, then fixes. The reviewer was a second model run as an independent subagent: it read the brief, the spec, the v1 boards and every v2 board, with no access to my notes. Its verdict on the first render: "show with the listed caveats". Model names are in the session report, not in the repo.

## Anti-slop pass

| # | Finding | Fix |
|---|---|---|
| A1 | Every room had exactly one pending request, split 1/2/2. Real data is lumpy. | Atlas now has none, Warehouse has two. Split is 1 error, 1 approval, 3 questions. |
| A2 | Every agent had a uniform `noun-noun` id. Strongest "invented" tell left. | Labels now follow the source: folder names and task titles, mixed ("Rebuild segment models", `warehouse`, "Follow-up emails, round 2"). Rule written in DESIGN.md §3. |
| A3 | One desk asset repeated at the same angle; reads tiled. | Two unassigned desks added (one birch top, one bare). Desk extras were already randomised per seed. Kept: no chairs, since bots do not sit. |
| A4 | "Tone A or tone B for the follow-up sequence?" is filler. | "Lead the trial follow-up with pricing or with the case study?" |
| A5 | A "Pin" pill broke the one-pill rule and has no specified behaviour. | Removed. |
| A6 | Task lamp invisible on a black tile. | Asset tiles lightened. |
| A7 | The covered Claude app dock read as a pouf beside the sofa. | Redesigned as a charging pedestal with a cable, moved out of the rooms (see B11). |
| A8 | Legend lists states that were not visible at overview scale. | Resolved by B1. |

## Correctness and usability pass

| # | Finding | Fix |
|---|---|---|
| B1 | **Monitors rendered as blank slabs.** The boards promised a per-state monitor; the art did not deliver it. Root cause: generated boxes carry no UVs, so the screen texture sampled one dark pixel. | Texture mapped from generated coordinates. Every monitor now shows its state (text, dialog, field, red banner, dimmed, off). All bot layers and stations re-rendered. |
| B2 | Working and idle were indistinguishable at 1x; grayscale separated four clusters, not six. | B1 restores the monitor as a second channel: working = bright text, idle = dimmed. Remaining limit stated below. |
| B3 | Project notes covered the bots and desks they label. | Notes moved to the top of each room's back wall, or hung from the front cut edge for the one room without an exterior wall. |
| B4 | DESIGN.md floor-plan table did not match the render. | Table rewritten by screen position. |
| B5 | 38 % dim not visible in the zoomed view. | The mask is now shaped to the room's real walls (3.1 m on exterior walls, 1 m on cut partitions), so it no longer leaves neighbours lit. |
| B6 | 02 and 02b showed the same scene with notes and chips in different places. | Both boards share one layout; chips sit under their bots and step down when they would overlap. |
| B7 | Detailed call-out floated with no visible link to its bot. | Explicit diagonal stem from the bot's head to the call-out. |
| B8 | Reduced motion removed the walker without showing where it went. | It waits at the Connector Lab bench; a HUD note says so. |
| B9 | Mobile strip showed "Desk" (clipped "Privacy Desk"); home indicator covered text. | Strip edges fade so clipping reads as scroll; a bottom fade sits under the home indicator. |
| B10 | Asset names hidden under renders on the asset sheet. | Tiles clip their render. |
| B11 | "storyboard · offline" named a Claude app chat that no source could know. Same problem for any per-project Claude app dock. | Per-project docks removed. One dock for the app, no chat names. Agent count is now 12. |
| B12 | "Status strip" vs "status light". | "Status light" everywhere. |

## Checks that passed

DEMO marking in header, stage and board kickers. No percentages or progress. Activity lines are session, approval, question or error events, never commits, CI or deploys; the repo block says so. Claude app shown unavailable everywhere. No history API assumed.

## Known limits, not fixed

- At 1x overview a bot is about 40 px tall. Pose and monitor separate the six states clearly in the 3.5x station renders, less so at 1x. At overview scale the three "needs you" states rely on the HTML call-out, and working vs idle on the monitor brightness. That is by design, but it is a limit.
- One base render for the whole floor. Step 3 should split it per room so a room can be dimmed or rebuilt alone.
- Frame timing (60 fps) is a target, not measured.
