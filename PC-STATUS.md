# PC status: P10-B (Performance), branch `pc/p10b`

**State: partly done. Merge it, then finish the rest from `HOOKS.md`.** The branch builds on `pc/p8b` (and so on
`pc/p8a`), as asked. P8-A's and P8-B's status files are on their own branches. The work is safe to merge (every
regression passes), but 4 of tr10-perf's 16 checks and 2 of tr10-leak's 6 don't meet their budgets yet. The fixes
those need are outside P10-B's files, and `HOOKS.md` says what each one needs.

## What changed (P10-B's own files)

- **`perf.js`:** a `cage` view (the Half cage, from the halfway line's side), and `setView` passes a zone's kind.
- **perf-6, allocations:**
  - `sched.js frustumFrom` reads the six planes straight from the matrix, with no row or plane arrays each frame;
  - `view.js` writes a clip's direction, ball and group points into objects the clip keeps, not new literals every
    frame;
  - `spares()` loops instead of making a closure per cone.
- **Nothing inactive running.** Under one of Training's own opaque sheets (`quality.js overlayCovered()`, never the
  black fade):
  - `training.js` doesn't pose the drill's bodies or work out its HUD and aura;
  - `view.js fpPose` doesn't pose your rig;
  - as a result, nothing is drawn, posed or stepped.
- **Shadows by preset (`human.js`).** A body casts only where the preset's shadows include people:
  - everywhere a life zone has a map;
  - in a stadium's or the cage's sky, only on High (`P.shadow.stadium.humans`). Medium's map holds statics only.
  - `pool.js` keeps the new cast flags across resets.
- **`qa/perf.mjs`** folds in the cage's gates (`tr10-perf`, `tr10-leak`). `--no-cage` leaves them out.
- **`qa/record-perf.mjs`** (perf-10) takes `gfxLow` from the applied preset and records the people's animation
  (`peopleMs`, the scheduler's actors).
- **New tests:** `qa/tr10-perf.mjs` and `qa/tr10-leak.mjs`.
- **A P8-A fix found by the reset budget:** the half-start snapshot is opt-in (`cfg.halfSnaps`, set by
  `FP.enterTraining`), so a drill's restart no longer copies its whole match.
  - `tr8-reset` passes 30/30 and `simreset` 16/16 with it.
- **Tried and reverted:** a cache of view balls between resets. It saved little and changed the renderer's geometry
  count, so the original behaviour is kept.

## Results on this PC (Windows, real GPU; Low at 1280 x 720; the largest drill: 6 v 6 with me, and a keeper)

| Check | Budget | Measured | |
|---|---|---|---|
| Simulation per step, 13 agents (Node, best of 3) | 0.15 ms | 0.08 to 0.11 ms | pass |
| Simulation per step, 14-agent stress | 0.15 ms | 0.07 to 0.12 ms | pass |
| Draw calls / triangles | 45 / 80k | 24 / 21k | pass |
| Point lights, shadow map (Low) | 0, none | 0, none | pass |
| Full poses a frame | 12 | 11 to 12 max | pass |
| Main-thread CPU a frame, median (ThreadTime) | 4.5 ms | 3.4 to 4.2 ms | pass |
| Main-thread CPU a frame, p95 | 6 ms | 7.5 to 8.3 ms | **fail** (GC spikes from the allocations) |
| Allocation a frame | 16 KB | 155 to 170 KB | **fail** (mostly `gait.js` and `rig.js`, not P10-B's) |
| A reset (main-thread CPU) | 4 ms | 5.7 to 7.2 ms | **fail** (mostly native: the HUD's style and layout, new meshes) |
| Low: no map, blob shadows | | yes (13 blobs) | pass |
| Medium: statics only | | the map on, no human casts | pass |
| High: humans cast, at most 15 redraws a second | | 13 cast, 0 redraws in 300 frames | pass (see `HOOKS.md` 4) |
| Under the hub, the config sheet, the presets sheet: drawn, posed, stepped | 0 | 0 | pass |
| CPU a frame under those sheets | 0.5 ms | 0.7 to 1.0 ms | **fail** (the world's own tick: `HOOKS.md` 1) |
| 50 resets and 10 visits: renderer, scheduler, listeners, DOM, bodies, merge entries +0, timers 0 | +0 | geometries +1 (12 to 13), everything else +0 | **fail** (likely a lazily uploaded geometry; not traced) |
| The heap after GC | +1 MB | +2.9 MB | **fail** (the same without P10-B's changes: `HOOKS.md` 6) |

**Full Match in the cage** (report only; no 60 FPS gate for 11 v 11):

- 23 draw calls, 22k triangles, 39 bodies;
- main-thread CPU median 2.6 to 2.8 ms a frame, p95 5.6 to 6.7 ms;
- perf.md's reference, the 25-body test match on the reference container, was 3.0 to 3.1 ms ThreadTime, so this is
  within it.

**60 FPS on real low-end hardware is NOT verified here.** This PC is far faster than the target. A manual check for you
on an Intel UHD 620 class laptop:

1. Open the game with `index.html?perf=1`, go into Training, and start Attacking → "Attacking midfielder" with 6
   attackers, 6 defenders and the keeper (the configuration sheet).
2. Play for a minute on Low and watch for stutter.
3. In the console, run `await __perf.snapshot(300)`. `ms.frame.median` under 16.7 is 60 FPS.

## Regression run on this branch

| Test | Result |
|---|---|
| `tr8-reset` | 30 / 30 |
| `tr8-fullmatch` | 30 / 30 |
| `uf-throwin` | 8 / 8 |
| `tr6-receive-anim` | pass |
| `tr3-leak` | 16 / 16 |
| `tr4-reset` | pass |
| `qa/unit/simreset.mjs` | 16 / 16 |
| `node qa/run.mjs unit lint smoke` | 29 of 31 |

- In the unit/lint/smoke run, the 2 failures are `qa/unit/daily.mjs` and `qa/unit/presets.mjs`. They fail on Windows
  only (a bare `d:` import). `daily.mjs` is fixed on `pc/p10a`.
- `qa/wpB-npc.mjs` couldn't run on this PC: `tar` fails on the Windows path ("Cannot connect to D:"). That's a test
  environment issue, not a game failure.
- `qa/perf.mjs` (the life views' probe and the I0 side-by-side) wasn't run on this PC. It needs the I0 tree
  (`sideBySide`, git worktree and tar). The cloud should run it.

## Next steps (for the cloud)

1. Apply or forward `HOOKS.md` items 1 to 3 to their owners. They're what stands between the cage and its CPU p95,
   allocation, reset and idle budgets.
2. Find the +2.9 MB heap growth over visits with a heap-snapshot diff (`HOOKS.md` 6), and the +1 renderer geometry.
3. Decide whether High's human shadows should follow the people (`HOOKS.md` 4).
