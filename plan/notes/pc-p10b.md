# pc/p10b: the PC's status and hook requests (moved here at integration)

## PC-STATUS.md

### PC status: P10-B (Performance), branch `pc/p10b`

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

## HOOKS.md

### P8-A hook requests, and the contract P8-B builds on

## 1. `LegendRising/js/life/football/rng.js` (not P8-A's file), needed for an exact Reset Current Half

`gauss` keeps each generator's second normal in a private `SPARE` map, which a half-start snapshot can't see, so a
restored half could draw differently from its first normal on. Add, just above `export function gauss(r){`:

```js
// (P8-A hook, sim.js halfSnapshot and restoreHalf) a generator's cached second normal, read and put back, so a match
// restored to the start of a half draws exactly what the half drew
export const spareOf = r => SPARE.get(r);
export function setSpare(r, v){ if (v === undefined) SPARE.delete(r); else SPARE.set(r, v); }
```

- **Applied on this branch:** commit `ec869a8`, labelled `[hook]`. Keep it, or drop it and apply the lines yourself.
- **Merge order:** `sim.js` reads these through a namespace import (`import * as RNG`) and only when they exist, so either
  order works.
- **What the hook buys:** without it, a reset half is still the same state, but its play can differ from the original
  from the first normal draw.
- **No other change:** nothing else in `rng.js`, and the generator's sequence is unchanged (`ms.r` is the same mulberry32,
  its word now kept in `ms.rng.s`).

## 2. For P8-B (`fullmatch.js`, `cage.js`, `quick.js`, `admin.js`, `hub.js`): what P8-A gives and expects

- **The entry:** `FP.enterTraining(cfg, {zone, kind, start: 'kickoff' | 'bench', host, kits, subOn})`.
  - `cfg` is a createMatch cfg (`teams.js cfgFromConfig('fullmatch', config).cfg`).
  - The controller sets `htAuto: false` itself.
  - A bench start sets `me.role = 'sub'` and `roleTimes.subOn` (default 60).
  - If the cfg's teams have a bench and its rules give no `subs`, the real match's 5 are allowed. Training's own laws
    allow 0, and a bench start's change would otherwise never be made.
  - `teams.js` builds no bench today. P8-B has to add the benches to the cfg (the tests add five a side).
- **The training host** (what P8-B's `fullmatch.js` builds), every member optional:
  - `look()` and `kits()`;
  - `bodies(ms, kits, meLook)`, returning `{bodyOf, fp, fourth}`: give it `pool.js matchBodies(ms, myTeam)`;
  - `kickoff()`, `now()`, `note(text)`, `relock()`, `speed()`, `setSpeed(v)`;
  - `ended('fulltime')`, called after the full-time card's Continue: go back to the hub there.
  - The controller never calls `setup`, `leave`, `around`, `htCard` or `ftCard` on it, and never the career's host
    (`tr8-reset` spies on it).
- **The resets:** `FP.resetMatch()`, `FP.resetHalf()`, `FP.restartKickoff()`, each returning `true` when done. Each one
  puts up its own cover and lifts it two frames later.
- **The bench:**
  - Register it with `stadium.js registerBench("cage", {seats() -> [{side, x, z?}], seatZ, standZ, fourthOfficial(spec)
    -> {x, z}, dugout(side) -> {x, z, yaw}, crowd() -> null})`.
  - The controller asks `benchOf(FP.training.zone)`, so pass `zone: "cage"` to `enterTraining`.
  - The cage's own bench spots must carry `stadium: true`. The match mode only targets spots with it
    (`FLAGS_MATCH.targeting`).
- **The pool:**
  - After entry, `poolStats().size` = 25 + the substitutes + 1, **plus 1 for the fourth official**. He is a body too,
    taken from the pool so that nothing is built outside it.
  - On Return to Hub, call `FP.exit()` and then `pool.js poolTrim()`, under the fade. That brings it back to 14, and
    `bodies()` to 16.

---

### P8-B hook requests (this branch builds on `pc/p8a`; everything above still applies)

## 3. `LegendRising/index.html` importmap and `LegendRising/js/life/train/index.js`

```
    "./js/life/train/fullmatch.js": "./js/life/train/fullmatch.js?v=<build>",
```
```js
import "./fullmatch.js";
```

Applied on this branch in commit `49fae31`, labelled `[hook]`.

## 4. `LegendRising/js/life/football/controller.js` (P8-A's file), for the match's pause card and the cage's bench

Applied on this branch in commit `3f490a8`, labelled `[hook]`:

- **The pause card.** In the `fp-match` task, when the pause card goes up or down: if `FS.host.pause(on)` returns true,
  the host drew its own card (Training's quick menu) and the controller draws none. With no such host, the controller
  behaves exactly as before.
- **The cage's bench.** Two new `FP` members: `FP.bench(side)` (calls `sitDown(side)`) and `FP.benchOk(side)`
  (`FS.state === "bench" && !FS.seated && !FS.called`). The Full cage's bench spots use them, as the stadium's spots
  use its `on.bench` and `on.benchOk`.

## 5. A fix to P8-A's own files, found by P8-B's test (commit `161cdc8`, labelled "P8-A fix")

- `sim.js markHalfStart(ms)`. `controller.js` calls it after `enterTraining` and `resetMatch` set the match up.
- A reset now zeroes your own walk's speed.

Together these make Reset Current Half in the **first** half exact. `tr8-reset` covered the second half.

## Notes

- **Presets.** `config.js` fixes `pitch: 'full'` and `out: 'stop'` for `fullmatch`. They go into a preset with the rest
  of the validated configuration, but they're always forced on load, so a preset never changes them. Keeping them out
  of the stored record would need a change in `presets.js` (P4-B's).
- **`teams.js` builds no bench** for `fullmatch`. `fullmatch.js matchConfigOf` adds five a side (one keeper among
  them), the real match's 5 changes, the half's length and my position.

## 6. `LegendRising/qa/tr3-hub.mjs` (P3-B's test)

Its check "a category with nothing registered shows no buttons that do nothing" counted only the runner's scenarios.
Full Match's two entries are the hub's own (`hub.js registerEntry`), so line 64 counts them too:

```js
      const registered = await page.evaluate(i => { const id = window.__trainRun.CATEGORIES[i].id, H = window.__trainHub; return window.__trainRun.scenariosOf(id).length + (H && H.entriesOf ? H.entriesOf(id).length : 0); }, i);
```

Applied on this branch in commit `34be84d`, labelled `[hook]`. With it, `tr3-hub` passes.

---

### P10-B hook requests and findings for other owners (this branch builds on `pc/p8b`; everything above still applies)

No hook commit on this branch for P10-B itself. Two commits touch P8-A's files, both labelled "P8-A fix":

- `161cdc8`, from P8-B;
- the half-start snapshot made opt-in (`cfg.halfSnaps`). It was found by P10-B's reset budget: every drill restart
  copied its whole match.

Below are the budgets P10-B could not meet with its own files. Each one needs a change in a file it doesn't own.

1. **`js/life/world.js` (P3-A's), the CPU under Training's sheets.**
   - Under the hub, the configuration sheet or the presets sheet, nothing is drawn, posed or stepped now. P10-B guards
     `training.js` and `view.js fpPose` with `quality.js overlayCovered()`.
   - The world's own tick still runs: the scheduler's tasks, the sky, the camera owner's frame, the life HUD. That costs
     0.7 to 1.0 ms a frame on this PC, against a budget of 0.5.
   - Suggestion: in `world.js tick`, when `overlayCovered()` and no reveal is pending, run only the scheduler's keep
     tasks and skip `step()`, as the lifeHub stop does. P3-A's perf-4 rule (never skip under a reveal) still applies.
2. **Allocations: about 155 to 170 KB a frame, against 16 KB.**
   - The top sites per frame:
     - `gait.js gaitLegs` 8 to 12 KB, `planLanding` 6.6, `cycleStep` 5.2, `gaitStep` 5, `swingAt` 3.3;
     - `rig.js solveLeg` 5.3;
     - `zone.js` about 4;
     - `chunks.js occFrame` 8.5 (P10-B's file, but its occlusion structures need a rewrite to pool them);
     - `view.js contactStep` 4.2 and `human.js animateHuman` 3.7 (P10-B's: closures in the pose path);
     - three.js `getParameters` 6.2.
   - The three.js item means three re-reads a material's program parameters every frame, which happens when some
     material's version or the lights' state changes every frame. I didn't find the source.
   - `gait.js`, `rig.js` and `zone.js` belong to the animation and engine owners (P2-B, P9-A).
3. **The reset: 5.7 to 7.2 ms of main-thread CPU, against 4 ms.**
   - The JavaScript parts are small: restoring the 14 pooled bodies about 0.6 ms, `createMatch` 0.1, `createAgent`
     0.2.
   - Most of the time is native ("(program)" in the profile): style and layout from the HUD redraw (`thud.js`) and the
     view's new meshes.
   - The reset is already pooled, nothing is built, and no snapshot is copied any more.
4. **`js/life/sky.js`, shadows on High.**
   - The humans cast, but the stadium-context shadow map is only redrawn when the sun's angle steps or something
     requests it.
   - In the cage that's 0 redraws in 300 frames, so the people's shadows don't follow them. The cap of 15 a second
     holds, trivially.
   - For moving shadows on High, the match or training view would have to request a redraw (at most `P.shadow.stadium.hz`)
     while bodies move.
5. **perf-9 (the merge poll on a dirty flag): not done.**
   - The cage turns merging off (`W.noMerge`, P3-A), so Training never runs the poll.
   - A correct dirty flag for the life zones needs a hook wherever a merged mesh is moved or re-materialed (`home.js`,
     `npc.js`, and others).
6. **The JS heap grows about 2.9 MB over 10 Training visits and 50 resets**, after a forced GC.
   - It's the same with and without P10-B's changes, so it predates them. I haven't found the cause yet.
   - Suspects: the human `SHAPES` cache (perf.md section 6.4) and three's program and binding caches.
