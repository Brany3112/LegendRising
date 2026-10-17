# P7-B hook requests (for the integrator)

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

## 3. For P7-A (`js/life/football/brain.js`), no edit required

`setpiece.js` imports brain.js as a namespace (`import * as BR`) and calls `BR.cornerPlan(ms, R0, {recv, marking, zone})` only
when it exists, so merging P7-B before or after P7-A never breaks the page. If `cornerPlan` returns `{recv: agentId, marking}`,
those replace the configuration's own. The restart also carries the plan as plain data: `R0.plan = {recvId, zone, marking,
delivery, to}`.

When Training sets `opt.hold`, the restart never becomes ready on its own, so brain.js `decideRestart` is never called for that
taker. The scenario starts the AI taker's kick or throw itself (`actions.js startKick` / `startThrow`), aimed at the designated
receiver. `restartShape` is held off by the scenario (it keeps `R0.shapeStep` current) while it sets everyone's spot.
