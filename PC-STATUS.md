# PC status: P7-A (Free kicks build mode and set-piece AI), branch `pc/p7a`

**State: finished; ready for the cloud to merge.** Every P7-A acceptance check passes on this PC (Node and browser).
Base: `origin/claude/awesome-babbage-o53g6x` at `0977e2a`.

Merge order for Phase 7: `pc/p7b`, then `pc/p7a`. The `rules.js` contract commit (`85d10cc`, `[hook]`) is byte-identical to
P7-B's change, so the second merge sees no conflict there. `HOOKS.md` has the integrator's lines.

## What's in it

- **`brain.js` (P7-A owns it):**
  - **`wallSpots(sp, gx, spec, bounds)`, pure:** a wall of 0 to 6 men.
    - It sits at a distance from the ball (3 to 20 m, 9.15 by default) with an offset across.
    - It covers the near post (from just outside it, inward) or stands square to the goal's middle.
    - Its men are always 0.62 m apart (more than two shoulders), at least 0.8 m from the ball and inside the lines.
    - The wall only ever moves as one, so it keeps its line and spacing.
  - **`restartShape` with `R0.wallSpec`:** builds the wall from the men the scenario names (then the nearest). It keeps
    everyone else clear of the wall and of the ball. Without a `wallSpec`, a match builds its wall as before.
  - **The second taker** (`R0.second`, `R0.secondAction`), with his spot and his part in `decideRestart`:
    - `pass`: he takes it and rolls it into the main taker's path, and the main taker strikes it first time;
    - `decoy`: he runs over the ball and on past it (about 7.4 m) and never touches it, then the main taker strikes;
    - `short`: the main taker plays it to him and he shoots;
    - `carry`: the main taker plays it to him and he runs with it.

    The part is kept (`a.fkNext`) until he strikes, or for 4 s after the restart is taken. With a decoy on my own free
    kick, he goes 1.2 s after it is ready.
  - **The wall jumps** only at a strike, not at a routine's short pass.
  - **`fkShot`:** the strike over the wall or round it.
  - **`plan.strike`:** a configured taker can be told to shoot or to cross.
  - **`cornerPlan(ms, R0, spec)`:** the contract's export for P7-B. Its rules are in `HOOKS.md` item 6.
  - **A match plays as before.** Every new path is gated on options a match never sets.
- **`js/life/train/scen-freekick.js` (new, pure):**
  - **Type `freekick` options:**
    - wall up or down (the size is kept);
    - the second taker and his action;
    - what the computer's taker goes for;
    - me in the wall (when I defend);
    - seconds of play after the kick;
    - instant replay of a goal;
    - the placement (ball distance and angle; the wall's distance, offset and alignment).

    The sheet doesn't show the placement fields. The wall counts in the defenders' six (config.js clamps it).
  - **Valid ball places only:** 16 to 40 m and up to 60 degrees, outside the penalty area, inside the lines. A place in
    the area is moved out along the same line.
  - **Live measurements:** "distance to goal" (ball to the middle of the goal line) and "distance from ball" (to the
    wall's nearest man).
  - **The setup for every role:**
    - me as taker, second taker, attacker, support, or defender (free or in the wall);
    - the takers on their spots;
    - the wall where `wallSpots` puts it;
    - everyone else on his configured spot, kept clear: defenders 9.15 m away, attackers out of the routine's way.
  - **The go:** the real restart with the wall and the second taker. The judge works from the simulation's events.
    Verdicts include "Goal! Straight in from the free kick.", "Off the wall and out." and "Saved, and out it goes.".
  - **The placement state:** `placeState`, `previewBall`, `confirmBall`, `previewWall`, `confirmWall`, `adjust`,
    `canStart`, `measures` and `applyPlace`.
  - **10 drills in Set Pieces:** over the wall, from distance, the wide angle, touched to you, the decoy, the short one,
    take it on, attack the cross, stand in the wall, defend it.
- **`js/life/train/fkplace.js` (new, the build mode):**
  - Every free kick starts on a card over the pitch, with the simulation held and the pointer free.
  - **Step 2, the ball:** distance and angle sliders and a live "Distance to goal: 22.0 m". A ring on the grass marks the
    preview, and Confirm Ball Position moves the real ball.
  - **Step 3, the wall:**
    - its controls: up or down, size 0 to 6, distance from the ball, offset across, and alignment;
    - a live "Distance from ball: 9.2 m", with the ball's distance shown too;
    - a ring for each man as the preview; the men themselves are the confirmed wall;
    - Confirm Wall Position moves them;
    - a change to a confirmed wall reopens only the wall step.
  - **Step 4:** Adjust Placement, Back to settings, and Start Free Kick. Start is blocked, and says why, until both are
    confirmed.
  - **How a confirm applies:** through the runner's own change path (queueChange, then restart), so the configuration
    and any preset saved from it hold exactly what was placed. Retries go straight to the kick.
  - The pause card gains "Adjust Free Kick Placement".
  - The Training HUD stands aside while the card is up.
- **`css/train.css`:** the card's styles, with phone widths covered.

## Tests run on this PC

| Test | Result |
|---|---|
| `qa/unit/fkwall.mjs` | 14 / 14 (86,100 walls: 246 balls x sizes 0 to 6 x 5 distances x 5 offsets x 2 alignments) |
| `qa/tr7-freekick.mjs` (Node and browser) | 45 / 45 |
| `node qa/run.mjs unit lint smoke` | lint 17 / 17 rules; see below |
| `qa/nodash.mjs` on every P7-A file | 0 em dashes |
| `qa/harness.mjs --n 1000` | see "Harness" below |

`tr7-freekick` covers:
- **The placement grid:** 1,575 setups (16 to 35 m, -40 to 40 degrees, no wall, small and large walls, wall distances 5
  to 12 m, offsets).
  - The ball is always valid.
  - The indicators are within 0.05 m.
  - The wall stands exactly where `wallSpots` puts it.
  - Nobody is inside the wall or on the ball, and the defenders are 9.15 m off.
- **Resizing** never moves the ball, and repositions the wall on its line.
- **Start** is blocked before both confirms.
- **20 wall changes with 10 confirms** leave the ball bit-identical, both in Node and for the real ball in the page.
- **The second taker, 5 seeds of each action:**
  - pass then strike: 5 / 5;
  - decoy run of about 7.4 m with no touch: 5 / 5;
  - short then shot: 5 / 5;
  - pass then a carry of 3.4 to 7 m: 5 / 5.
- **The strike:** over or round the wall in 12 / 12 shots, and the keeper reacts in 12 / 12.
- **Bodies with a wall of 6:** inUse 10, `bodies()` 16, no body built, no official.
- **A preset after a reload:** it restores the ball, the wall, its size and the measurements exactly.
- The career save is never written, and there are no console or page errors.

The unit/lint/smoke failures are the same Windows-only ones as before. `qa/unit/daily.mjs` and `qa/unit/presets.mjs`
import by a bare `d:` path; `daily.mjs` is fixed on `pc/p10a`.

## Harness

(filled in below once the n=1000 run on this branch is done)

## Left for a person to check

- How the free kick feels with a mouse:
  - drag the sliders;
  - watch the rings and the real wall move;
  - take a few free kicks over the wall.

  The checks above drive the same code, but by its functions and real clicks, not by feel.
- The computer's direct free kicks mostly clear the wall high (about 3.5 m at the wall). That is the match engine's own
  free-kick strike, unchanged, so they go over the bar more often than they dip under it. P9-B (AI refinement) is
  the place to tune it.
