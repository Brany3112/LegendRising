# pc/p8a: the PC's status and hook requests (moved here at integration)

## PC-STATUS.md

### PC status: P8-A (Match reset API, training entry, training host, 11v11 pool), branch `pc/p8a`

**State: finished; ready for the cloud to merge.** Base: `origin/claude/awesome-babbage-o53g6x` at `6c5db89`, plus the
PC's Playwright import fix (`009ecae`, cherry-picked). One `[hook]` commit (`ec869a8`, `rng.js`) is explained in
`HOOKS.md`, together with the contract P8-B builds on.

## What changed (P8-A's own files)

### `sim.js`

- **The match's generator** keeps its word in `ms.rng.s`. It's the same mulberry32 sequence, so determinism, goldens
  and the harness are unchanged; `wpC-det` passes.
- **`placeForKickoff` is exported.**
- **The half-start snapshot:**
  - `halfSnapshot`, `halfStart(ms)` and `restoreHalf(cfg, snap)` are new.
  - The snapshot is a deep copy of every field of the match except the match object's own (`HALF_KEEP`: cfg, spec, the
    generator function, the ball worlds' functions, the listeners, the bound helpers). It also holds the ball worlds'
    data and the generator's word and spare.
  - It's taken at the step boundary where each half begins.
  - A restore builds a fresh match from the cfg and puts the copy on it (`ms.agents` only grows, so a match is never
    patched).
  - `HALF_FIELDS` names the matchflow.md section 6 fields for the test.

### `controller.js`

- **The host per entry:** `FS.host`. Every host call during a match goes through it. The career's own entry and the
  crash recovery still use the career's host. `fpHost` and `tunnel.js` are untouched.
- **`FP.enterTraining(cfg, {zone, kind, start, host, kits, subOn})`:**
  - no career: `FS.real` is false, so there's no checkpoint, no settle and no career write;
  - no warm-up;
  - a start from the kick-off or the bench;
  - the bodies from the host's pool;
  - the real match's 5 changes when there's a bench and the cfg names none.
- **`FP.resetMatch()`, `FP.resetHalf()` and `FP.restartKickoff()`** (G0 decision c's default). Every reset clears the
  controller's own flags (cards, the skip, the call-up walk and the seat, the goal flags, the event queue), the replay,
  `CTRL`, the warm-up, and pending reveals. Reveals are now cancellable (`FS.revealSeq`).
- **Restart from Kickoff puts the ball on the centre spot before the restart starts.** Otherwise the rules send a man
  to fetch it, and the kick-off shape leaves him out.
- **`bindMatch`:** the simulation's listeners (kept apart in `FS.simOffs`), the view and the replay's record, bound
  again on each reset to the same pooled bodies.
- **The bench, its seat and stand spots, the fourth official and the dugout come from the bench provider.** The fourth
  official's body comes from the host's pool when it has one.
- **New test hooks:** `__fp.careerHost()` and `__fp.host()`.

### `stadium.js`

- `registerBench(zone, provider)` and `benchOf(zone)` are new. The stadium registers its own dugouts through them.

### `pool.js`

- `poolEnsure`, `matchBodies(ms, myTeam)` and `poolTrim()` are new:
  - my side's outfield players in my bib, theirs in theirs;
  - a keeper's kit for each side;
  - the officials, including the fourth official.
- `poolReady` now checks the drill groups, not an exact size, so a pool grown for a match is still ready for a drill.

### Not changed

- **`replay.js`, `warmup.js` and `view.js`.** The view already accepted pooled bodies (P3-B); the replay and the
  warm-up are cleared through their existing calls (`skip`, `recInit`, `warmDispose`).

### Tests

- **`qa/unit/simreset.mjs`, 16 checks:**
  - the generator;
  - the snapshot holds every matchflow.md section 6 field by name, and every field but `HALF_KEEP`;
  - a restore equals the half start field for field, and replays the same 40 s event for event;
  - the snapshot is untouched by a restore;
  - after a bench call-up, `roleDone`, `callUp` and the bench `used` flags go back as the half began.
- **`qa/tr8-reset.mjs`, 30 checks:** the BUILD-PLAN list, in the real page with no career.

## Tests run on this PC (Windows, Node 26.3.0, real GPU)

### New tests

| Test | Result |
|---|---|
| `qa/unit/simreset.mjs` | 16 of 16 |
| `qa/tr8-reset.mjs` | 30 of 30 |

What `tr8-reset` covers:

- **The pool:** 37 bodies = 25 + 10 substitutes + 1 + the fourth official, and `bodies()` that plus 2. The same after 3
  Reset Match.
- **Reset Match after a goal:** every listed item (clock 0, half 1, 0-0, the events of a new match, the kick-off places
  within 1 mm, the same side to kick off, control on me, no AI plan or flag, fresh stamina, no extra ball).
- **Reset Current Half in the second half after two goals:** the second half was reached by a real click on the
  half-time card. The whole state equals the snapshot.
- **The bench call-up:**
  - called up and on through the fourth official;
  - after the reset, `roleDone`, `callUp` and the `used` flags are as the half began, there's one of me, and I'm on the
    bench seat with its camera, with no stale call-up state;
  - a second call-up works.
- **Restart from Kickoff at 2-1:** clock, half and score kept; the kick-off places within 1 mm; the half's side on the
  ball; plans and the chain cleared; stamina kept.
- **Half time and full time:** after each kind of reset, half time was played through by real clicks, with Esc on the
  card first. Then full time, with its Continue clicked for real; the training host hears `ended`.
- **20 cycles of all three resets:** listeners, timers, the scheduler's tasks and actors, and `renderer.info` +0.
- **Return to Hub:** the pool is 14 and `bodies()` 16, and the geometries and textures are the same after a second Full
  Match.
- **The career:** it's never called, there's no `v2` write, the career diff is empty, and there are 0 console and page
  errors.

### Regression (the code P8-A touches), all passing

| Test | Result |
|---|---|
| `tr2-halftime` | 113 / 113 |
| `tr2-kickoff` | 12 / 12 |
| `tr2-realmatch` | 9 / 9 |
| `uf-sub` | 17 / 17 |
| `uf-throwin` (career `test:11v11`) | 8 / 8 |
| `wpC-det` (determinism) | 5 / 5 |
| `oldsave` (including the mid-match recovery replay) | pass |
| `tr6-team` | 25 / 25 |
| `tr3-play` | 15 / 15 |

- `node qa/run.mjs unit lint smoke`: see the bottom of this file.

## Deviations and notes

- **The pool count includes the fourth official** (+1 over the plan's 25 + subs + 1). The controller used to build him
  with `human()`. He's now a pooled body, so nothing is built outside the pool.
- **The half-time clicks use a real mouse click on the card's button, with Esc pressed on the card first**, under the
  test's own pointer handling. A headless browser grants no real pointer lock, so "under pointer lock" is as close as
  headless allows.
- **The geometry baseline:** `renderer.info` geometries are compared between the first and the second Full Match's
  Return to Hub. The pool's drill bodies are on the GPU once they've been drawn, and a body that was parked and never
  drawn isn't counted, so the hub's figure before any match isn't comparable.

## `node qa/run.mjs unit lint smoke`

29 of 31 pass (`qa/unit/simreset.mjs` is among the passes; smoke passes). The 2 failures are `qa/unit/daily.mjs` and
`qa/unit/presets.mjs`. Both fail only on Windows, because they import a bare `d:` path. They aren't P8-A's files, and
the same 2 failed on the base. `daily.mjs` is fixed on `pc/p10a`.

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
