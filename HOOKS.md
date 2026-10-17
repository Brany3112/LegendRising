# P8-A hook requests, and the contract P8-B builds on

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

# P8-B hook requests (this branch builds on `pc/p8a`; everything above still applies)

## 3. `LegendRising/index.html` importmap and `LegendRising/js/life/train/index.js`

```
    "./js/life/train/fullmatch.js": "./js/life/train/fullmatch.js?v=<build>",
```
```js
import "./fullmatch.js";
```

Applied on this branch in commit `aac72ab`, labelled `[hook]`.

## 4. `LegendRising/js/life/football/controller.js` (P8-A's file), for the match's pause card and the cage's bench

Applied on this branch in commit `3f490a8`, labelled `[hook]`:

- **The pause card.** In the `fp-match` task, when the pause card goes up or down: if `FS.host.pause(on)` returns true,
  the host drew its own card (Training's quick menu) and the controller draws none. With no such host, the controller
  behaves exactly as before.
- **The cage's bench.** Two new `FP` members: `FP.bench(side)` (calls `sitDown(side)`) and `FP.benchOk(side)`
  (`FS.state === "bench" && !FS.seated && !FS.called`). The Full cage's bench spots use them, as the stadium's spots
  use its `on.bench` and `on.benchOk`.

## 5. A fix to P8-A's own files, found by P8-B's test (commit `39af9db`'s parent, labelled "P8-A fix")

- `sim.js markHalfStart(ms)`. `controller.js` calls it after `enterTraining` and `resetMatch` set the match up.
- A reset now zeroes your own walk's speed.

Together these make Reset Current Half in the **first** half exact. `tr8-reset` covered the second half.

## Notes

- **Presets.** `config.js` fixes `pitch: 'full'` and `out: 'stop'` for `fullmatch`. They go into a preset with the rest
  of the validated configuration, but they're always forced on load, so a preset never changes them. Keeping them out
  of the stored record would need a change in `presets.js` (P4-B's).
- **`teams.js` builds no bench** for `fullmatch`. `fullmatch.js matchConfigOf` adds five a side (one keeper among
  them), the real match's 5 changes, the half's length and my position.
