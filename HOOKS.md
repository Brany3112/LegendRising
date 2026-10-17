# P9-B hook requests (for the integrator)

P9-B only edited the files it owns (`brain.js`, `gkbrain.js`, and its new `qa/tr9-ai.mjs`). These lines go into files it does
not own. Branch `pc/p9b` is built on `pc/p7a`, so P7-A's own requests (its `HOOKS.md`, on `pc/p7a`) still stand.

## 1. `LegendRising/js/life/football/attrs.js`: show the keeper's distribution in the attribute editor

The plan names `attredit.js`, but the flag is in `attrs.js`:

```js
export const GK_DISTRIB_LIVE = true;
```

`gk.distrib` now changes play (ATTR-1): his choice between throw, roll and punt, the scatter of where it goes, and the
passing numbers his punts and goal kicks are struck with. So the editor should show it.

## 2. `LegendRising/qa/tr4-attrs.mjs`: the keeper distribution row

Add the row "Keeper distribution 30 vs 90 | distribution error and completion differ". Use the same measurement as
`qa/tr9-ai.mjs` section 3 (`distOne`):
- a match a few seconds in, with the ball put in team 0's keeper's hands (`gkbrain.js gkCollect`) and his own hold;
- seeded, paired runs at distrib 30 and 90, everything else equal;
- the mean landing error from `gk.gk.distAim` (where he meant it to go) is at least 1.5 times larger at 30;
- completion (`ev.res === 'ok'`) is higher at 90.

## 3. `LegendRising/qa/run.mjs`, named suites

```js
  tr9: ["tr9-ai", "tr9-anim", "tr9-gkanim", "tr9-sheets"],
  tr9b: ["tr9-ai"],
```

(`tr9a` is P9-A's.)

## 4. For P9-A: the keeper's distribution acts (the Phase 9 contract)

- **When:** while the keeper holds the ball and has chosen a throw or a roll.
- **The act:** `a.act = {kind: 'gkthrow' | 'gkroll', t, tRelease, dur, target: {x, y, z}, aim: {x, z}, recv, done}`.
  - `tRelease`: 0.55 s for a throw, 0.45 s for a roll (the release of `gkmoves.js gkdistribute`).
  - `dur`: 0.9 s and 0.8 s (the clip's length).
  - `target`: where it is let go to, with his error in it. `aim`: where he meant it to go.
- **The ball** stays in his hands (`rules.js holdAt`, held high for a throw) until `act.t >= tRelease`. At that step
  `gkbrain.js distRelease` lets it go and sets `act.done` and `act.tReleased`.
- **The clock:** `actions.js` steps the act's clock (its default branch) and clears it at `dur`.
- **The punt** is the volley act it always was.
