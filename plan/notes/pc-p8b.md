# pc/p8b: the PC's status and hook requests (moved here at integration)

## PC-STATUS.md

### PC status: P8-B (Full Match in Training Mode), branch `pc/p8b`

**State: finished; ready for the cloud to merge (after `pc/p8a`, which it builds on).** `HOOKS.md` lists P8-A's and
P8-B's hook requests together. On this branch:

- three `[hook]` commits:
  - `3f490a8`: `controller.js` (`host.pause`, `FP.bench`, `FP.benchOk`);
  - `49fae31`: the `fullmatch.js` loader;
  - `34be84d`: `qa/tr3-hub.mjs`;
- one commit to P8-A's own files that P8-B's test found was needed: `161cdc8`, labelled "P8-A fix".

## What's in it (P8-B's own files)

- **`js/life/train/fullmatch.js` (new):**
  - Full Match's options on config type `fullmatch`, registered here so `config.js` isn't edited:
    - where I start (kick-off or bench; the help text says there's no warm-up in Training);
    - the minute I come on;
    - the half's length in real minutes;
    - my position (never GK).
  - `matchConfigOf(config)` builds on `teams.js cfgFromConfig`, adding:
    - my position (swapped with the man who had it);
    - a bench of five a side;
    - the half's length;
    - the real match's 5 changes.
  - The training host (P8-A's contract):
    - my look (the pool's: the created character in my bib), the bibs as kits, and the pool's bodies;
    - notes and the pointer from the device;
    - the quick menu's card as the pause card;
    - `ended`, which goes back to the hub.
  - `startFullMatch` switches to the Full cage first when another cage is up.
  - `backToHub` runs under the fade: the match ends, the pool goes back to 14 and the sandbox mode returns.
  - Two hub entries (from the kick-off, from the bench) and the quick menu's "match" items:
    - Reset Current Half and Reset Match, each with its confirmation;
    - Restart from Kickoff;
    - Return to Hub.
- **`hub.js`:** `registerEntry` for entries that aren't the runner's scenarios. They're listed with the category's
  scenarios and get Configure, Presets, Start and End it.
- **`quick.js`:**
  - `matchCard(on, {title, preset})`: the match's pause card, with Resume and the match items;
  - items can ask for a confirmation (Yes and Cancel in the card);
  - the drill items show only while a drill plays.
- **`admin.js`:** the Scenario and Match section shows the match's items during a Full Match, with the same
  confirmations.
- **`cage.js`:** the Full cage's two dugouts and their bench spots (6 seats a side, the fourth official by the halfway
  line), registered as the cage's bench (`stadium.js registerBench`).
- **`css/train.css`:** unchanged. The cards reuse the match's card styles.

## Tests run on this PC (Windows, Node 26.3.0, real GPU)

### `qa/tr8-fullmatch.mjs`: 30 of 30

**Part A, a fresh page with no career:**

- **Hub and entry:** Full Match lists its 2 entries, and Start (a real click) plays the real match on the Full cage
  with real lines and no career. The cage's bench has 12 seats, and every body is the pool's.
- **Real lines:**
  - a ball driven over the touchline gives `out` and a throw-in at the line, never sent back by the fence;
  - over the goal line it gives a goal kick (the attackers last) or a corner (the defenders last).
- **The pause card:** when the pointer is let go, the match's card comes up. These were clicked for real:
  - Reset Match, after its Yes: clock 0, 0-0;
  - Reset Current Half, after its Yes: the exact state of the half's start;
  - Restart from Kickoff: a kick-off, with the clock and the 2-1 score kept.
- **The admin panel:** the same three, by real clicks with the confirmations.
- **Half time and full time:** from the kick-off, both played through by real clicks on their cards. Continue goes
  back to the hub on Full Match, the pool is 14, `bodies()` 16, and the listeners +0.
- **From the bench:**
  - seated in the cage's dugout, called up, at the fourth official, on at a stoppage;
  - one of me; the replaced man is `subbedOff`;
  - control and camera handed over, and no duplicate body;
  - never swapped for the keeper.
- **The keeper:**
  - with my keeper sent off (scripted), I'm never put in goal;
  - the role and position pickers offer no keeper;
  - my agent is never the keeper for any start and position.
- **Presets:** the named `fullmatch` preset (LW, averages 70 and 55, 5-minute halves, the bench at 60') was saved by
  real typing and clicks, survived a reload and was loaded by a real click. The configuration is identical, and the
  match starts with those values.
- **The career:** no `v2` write, the career diff is empty, and there are 0 console and page errors.

**Part B, a career quit to the title:**

- My body in the Full Match wears the created character's look (hair, skin, beard, build, height), with 0 errors.

### Regression

| Test | Result |
|---|---|
| `tr8-reset` (P8-A, re-run with the P8-A fix) | 30 / 30 |
| `qa/unit/simreset.mjs` | 16 / 16 |
| `tr3-hub` (with its `[hook]`) | pass |
| `tr4-reset` | pass |
| `tr4-presets` | pass |
| `tr4-play` | pass |
| `tr5-admin` | pass |
| `node qa/run.mjs unit lint smoke` | 29 of 31 |

- In the unit/lint/smoke run, the 2 failures are `qa/unit/daily.mjs` and `qa/unit/presets.mjs`. Both fail on Windows
  only (they import a bare `d:` path), they aren't this package's files, and `daily.mjs` is fixed on `pc/p10a`.

## Notes

- **The pause card in a headless browser.** No real pointer lock is granted, so the test lets the pointer go the way
  the world does: it releases the lock and sets `FLAGS.lockLost`. The card then comes up through the controller, and
  every button press on it is a real mouse click.
- **The walk to the fourth official.** The test places the player at the entry spot beside him, as the bench tests do,
  instead of walking there key by key.
- **Not seen by eye:** the dugouts' look in the Full cage. They're simple boxes, a seat, a back and a roof on two posts.
  They're worth a glance in the game.

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
