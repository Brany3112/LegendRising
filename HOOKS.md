# P7-A hook requests (for the integrator)

P7-A only edited the files it owns (`brain.js`, `css/train.css` and its new files). These lines go into files it does not
own.

## 1. `LegendRising/index.html`, importmap (next to the other `js/life/train/` entries)

```
    "./js/life/train/scen-freekick.js": "./js/life/train/scen-freekick.js?v=<build>",
    "./js/life/train/fkplace.js": "./js/life/train/fkplace.js?v=<build>",
```

## 2. `LegendRising/js/life/train/index.js` (after `import "./scen-match.js";`, and after P7-B's set-piece imports when both are in)

```js
import "./scen-freekick.js";
import "./fkplace.js";
```

Items 1 and 2 are already applied on this branch in commit `6014ff1`, labelled `[hook]`, so the tests could run.
`qa/unit/trainentry.mjs` fails without them, and the 10 free-kick drills don't show in the hub.

## 3. `LegendRising/js/life/football/rules.js`: the Phase 7 contract (no new edit)

P7-A needs `startRestart`'s set-piece options (`opt.taker`, `opt.second`, `opt.secondAction`, `opt.wallSpec`, `opt.plan`).
P7-B owns `rules.js` and made that change on `pc/p7b`. This branch carries the same change, byte for byte, in commit
`85d10cc` labelled `[hook]`, so the free kicks could run here. Merging `pc/p7b` and then `pc/p7a` brings in the same
text twice, so git sees no conflict.

## 4. `LegendRising/qa/run.mjs`, named suites (next to `tr6b`)

```js
  tr7: ["tr7-corner", "tr7-throw", "tr7-penalty", "tr7-freekick"],
  tr7a: ["tr7-freekick"],
```

(`tr7b` is P7-B's.) `qa/unit/fkwall.mjs` is a unit test and runs with the other `qa/unit/` files. `tr7-freekick` runs its
Node part and then its browser part; `--node` runs the Node part only.

## 5. `LegendRising/js/life/train/configui.js`, the sheet's live line (optional, BUILD-PLAN P7-A work item 1)

The plan asks the free-kick sheet to say "Defenders: 2 in the wall, 4 free". config.js already does the clamping (the wall
counts in the defenders' six, with a note when it has to cut). This branch only relabels the two counts for the free-kick
type ("Defenders in the wall", "Free defenders") with `registerType` labels. For the line itself, in `previewHTML(c)`,
after the `who` line:

```js
  const fk = CF.type === "freekick" && n.wall > 0 ? ` Defenders: ${n.wall} in the wall, ${n.def - n.wall} free.` : "";
```

and append `fk` to the `<b>` text.

## 6. For P7-B (`setpiece.js`), nothing to change

`brain.js` now exports `cornerPlan(ms, R0, spec)` with the contract's signature. It returns `{recv, marking}`:
- `recv`: the receiver asked for when he is one of the attacking side's outfield players on the pitch and not the taker,
  else the side's best in the air;
- `marking`: the marking asked for (`zonal`, `man` or `mixed`), else `man`.

It draws no random numbers, and a match never calls it. `setpiece.js` already calls it through its namespace import.
