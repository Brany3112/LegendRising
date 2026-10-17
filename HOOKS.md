# P9-A hook requests (for the integrator)

P9-A edited only the files it owns, and added its new files: the three tests and the root-cause record
`plan/notes/p9a-rootcause.md`. The branch is `pc/p10b` with `pc/p9b` merged in (as asked), so P10-B's, P8-A's, P8-B's,
P7-A's and P9-B's own requests (their branches' `HOOKS.md`) still stand.

## 1. `LegendRising/qa/run.mjs`, named suites

```js
  tr9: ["tr9-ai", "tr9-anim", "tr9-gkanim", "tr9-sheets"],
  tr9a: ["tr9-anim", "tr9-gkanim", "tr9-sheets"],
```

(`tr9b` is P9-B's.) `tr9-sheets` reads `plan/notes/p9a-rootcause.md`, one level above `LegendRising/`.

## 2. For P9-B (`js/life/football/gkbrain.js`): the roll's threshold

`DIST.ROLL_NEED` (0.85 for a typical keeper) is on the scale of P9-B's original numbers. On `brain.js passModel`'s scale it
is out of reach for most receivers:
- a pass to an open centre-back 9.5 m away, with nobody within 40 m, rates 0.76 for a drill's player;
- the receiver's first touch (`RECV_CTRL`: 0.31 + 0.7 q) caps a pass near 0.8 unless his control is near the top.

So a keeper in a drill never rolls, and in a match he rolls 0.5 times a match (P9-B's harness). Suggested:

```js
ROLL_NEED: [0.72, 0.10],   // (0.72 for a typical keeper: passModel's own scale, as THROW_NEED was moved to)
```

The animation tests give their roll seeds sure-touch centre-backs for now, so they test the roll's animation regardless.
The integrator should apply this with P9-B's other numbers and re-run `tr9-ai` and the harness.

## 3. For the Training host: nothing to apply

`training.js` (P9-A owns it) now hands the view the simulation's saves and goals, as `controller.js` does. A keeper's dive
shows its outcome in Training, and a punch its pose.
