# pc/p7b: the PC's status and hook requests (moved here at integration)

## PC-STATUS.md

### PC status: P7-B (Corners, throw-ins and penalties), branch `pc/p7b`

**State: finished; ready for the cloud to merge.** Every P7-B acceptance check passes on this PC (Node and browser).
Base: `6c5db89` (UF2 integration, with the user's fix round).

## What's in it

- **Phase 7 contract (`rules.js`):**
  - `startRestart(ms, kind, team, spot, opt)` keeps `opt.taker`, `opt.second`, `opt.secondAction`, `opt.side`,
    `opt.noKeeper`, `opt.wallSpec` and `opt.plan` on the restart as plain data;
  - with `opt.hold`, an AI taker's restart is never ready by itself (`R0.set` says everyone is in place) and the
    scenario gives the go;
  - a match passes none of these, so it plays exactly as before.
- **`js/life/train/setpiece.js` (new, pure):**
  - config types `corner`, `throw` and `penalty` (presets are kept apart by type, and the Load list has its own line);
  - a setup for every spec role;
  - the real restart, started with the Phase 7 options;
  - set-piece spots held while the ball is dead: man-markers goal side of their man, zonal defenders in their zones,
    9.15 m kept at a corner;
  - the computer's delivery to the designated man:
    - corners: the runs start first, and the cross is struck as the receiver nears his zone, at head height or low for
      a volley; or a short corner;
    - throw-ins: a throw to the man's feet, or led into a runner's path;
  - the judge works from the simulation's own events, including fouls during play;
  - each go is tagged with headers, volleys, clearances, second balls and saves;
  - corners have an instant replay;
  - `fitConfig` adds the people a role needs (an AI taker, a receiver), with a note saying so.
  - P7-A's `brain.js cornerPlan`, when it exists, can override the receiver and the marking. `setpiece.js` imports it
    through a namespace import, so the merge order doesn't matter.
- **Scenarios, 15 drills in Set Pieces:**
  - `scen-corner.js`: take it, attack the box, the target, the edge of the box, the short one, defend it;
  - `scen-throw.js`: throw it, take it in, run down the line, mark the receiver, the second ball;
  - `scen-penalty.js`: take it, empty goal, follow it in, theirs.
- **`actions.js`:** a throw aimed at a height goes on a flatter line, about 20 degrees, so the receiver can control it.
  AI and player throws without a height are unchanged.
- **Unchanged:** `gkbrain.js`, because the keeper's attributes already change the penalty save rate (measured below).
  `view.js` and `moves.js`, because UF-A had already aligned the throw-in clip; `tr7-throw` confirms it.
- **Tests (new):**
  - `qa/tr7-lib.mjs`: the Node harness, which plays a set piece with the runner's own per-step calls;
  - `qa/tr7-corner.mjs`, `qa/tr7-throw.mjs` and `qa/tr7-penalty.mjs`: each runs its Node part, then its browser part
    from `qa/tr7-browser.mjs` (`--node` runs the Node part only).
- **PC test setup:** `qa/lib.mjs`, `qa/wpC-det.mjs` and `qa/wpK-lib.mjs` try the Linux Playwright path first, then the
  global package. On Windows they use the real GPU. Linux behaviour is unchanged.

## For the integrator

See `HOOKS.md`. The importmap entries and the `index.js` imports are applied in commit `5cff9a1`, labelled `[hook]`;
keep it or apply the lines yourself. `qa/run.mjs` needs a `tr7b` suite (not applied).

## Tests run on this PC (Windows, Node 26.3.0, real GPU)

| Script | Node part | Browser part |
|---|---|---|
| `qa/tr7-corner.mjs` | 11 / 11 | 11 / 11 |
| `qa/tr7-throw.mjs` | 7 / 7 | 13 / 13 |
| `qa/tr7-penalty.mjs` | 6 / 6 | 10 / 10 |

What the numbers mean (Node parts seeded, 12 seeds a role unless said otherwise):

- **Corners:**
  - both flags at each goal (half pitch, and both ends of the full pitch), the ball within 1 m of the corner;
  - every role takes the corner and the go is decided;
  - the computer's cross is aimed at the receiver's zone in 48 of 48 goes, and reaches him (within 2.5 m, before
    anyone else touches it) in 37 of 48. The far post is the weakest, at 7 of 12;
  - man and zonal marking hold;
  - headers, volleys, clearances, second balls and saves all occur;
  - the replay is requested only when its option is on;
  - the same seed plays the same corner, event for event.
- **Throw-ins:**
  - every role works;
  - believable trajectories: released overhead, within the arm's speed, a modest apex;
  - no teleport of the ball, from the whistle to a second after the release;
  - the receiver touches it first and controls it in 32 of 36 goes;
  - my run down the line gets the ball first in 12 of 12.
- **Penalties:**
  - every role works;
  - the empty goal has no keeper and nothing saves the shot;
  - over 60 penalties each, a keeper of 20 saves 8 and a keeper of 99 saves 18;
  - after every save the keeper doesn't hold, the ball stays live (14 such rebounds, 11 played again).
- **Browser parts, by real clicks and typing:**
  - the drills are in Set Pieces;
  - a named preset of each type survives a reload, and its activation digest equals the saved setup's (only the
    HUD's preset line differs);
  - the corner replay plays, and the next corner starts in an identical state;
  - the drawn throw-in ball is 0.05 m from the middle of the thrower's hands at the release, and leaves them after;
  - retry restores the penalty setup, both after a decided go and mid-go;
  - no career write, an empty career diff, and no console or page error.

Other runs:

- `node qa/run.mjs unit lint smoke`: 28 of 30 pass. `qa/unit/daily.mjs` and `qa/unit/presets.mjs` fail on Windows only
  (`ERR_UNSUPPORTED_ESM_URL_SCHEME`: they import a bare `d:` path), exactly as on the base before P7-B, so it's not a
  game failure. Smoke passes with 0 errors.
- `node qa/oldsave.mjs`: passes.
- `node qa/nodash.mjs` on every file written or changed: 0.

## Known limits

- **Corner delivery:** the AI cross reaches the far-post receiver less often (7 of 12) than the near post (8 of 8): the
  ball has further to travel and passes defenders first.
- **Corner goals are rare:** attackers score from about 5 to 15% of corners in the simulation. That's realistic, but a
  drill might want it more generous later.
- **Fixed role names:** the configuration sheet names the roles with the shared `ROLE_NAMES` ("Taker", "Attacker",
  "Receiver", "Support", "Defender"), whatever the set piece. The scenario names and HUD lines say what each role means.
  Per-type role labels would need a change in `configui.js`.
- **No hands-on play:** nobody has played the drills in the game yet.

## HOOKS.md

### P7-B hook requests (for the integrator)

P7-B only edited the files it owns. These lines go into files it does not own.

## 1. `LegendRising/index.html`, importmap (next to the other `js/life/train/` entries)

```
    "./js/life/train/setpiece.js": "./js/life/train/setpiece.js?v=<build>",
    "./js/life/train/scen-corner.js": "./js/life/train/scen-corner.js?v=<build>",
    "./js/life/train/scen-throw.js": "./js/life/train/scen-throw.js?v=<build>",
    "./js/life/train/scen-penalty.js": "./js/life/train/scen-penalty.js?v=<build>",
```

## 2. `LegendRising/js/life/train/index.js` (after `import "./scen-match.js";`)

```js
import "./setpiece.js";
import "./scen-corner.js";
import "./scen-throw.js";
import "./scen-penalty.js";
```

Without these, `qa/unit/trainentry.mjs` fails and the 15 set-piece drills don't show in the hub.

Items 1 and 2 are already applied on this branch, in commit `5cff9a1` labelled `[hook]`, so the tests could run. Keep that
commit or drop it and apply these lines yourself, whichever suits the merge.

## 2b. `LegendRising/qa/run.mjs`, named suites (next to `tr6b`)

```js
  tr7b: ["tr7-corner", "tr7-throw", "tr7-penalty"],
```

(and add them to `tr7` with P7-A's `tr7-freekick` once that exists). Each script runs its Node part, then its browser part;
`--node` runs the Node part only.

## 3. For P7-A (`js/life/football/brain.js`), no edit required

`setpiece.js` imports brain.js as a namespace (`import * as BR`) and calls `BR.cornerPlan(ms, R0, {recv, marking, zone})` only
when it exists, so merging P7-B before or after P7-A never breaks the page. If `cornerPlan` returns `{recv: agentId, marking}`,
those replace the configuration's own. The restart also carries the plan as plain data: `R0.plan = {recvId, zone, marking,
delivery, to}`.

When Training sets `opt.hold`, the restart never becomes ready on its own, so brain.js `decideRestart` is never called for that
taker. The scenario starts the AI taker's kick or throw itself (`actions.js startKick` / `startThrow`), aimed at the designated
receiver. `restartShape` is held off by the scenario (it keeps `R0.shapeStep` current) while it sets everyone's spot.
