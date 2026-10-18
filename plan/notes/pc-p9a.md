# pc/p9a: the PC's status and hook requests (moved here at integration)

## PC-STATUS.md

### PC status: P9-A (Animation refinement), branch `pc/p9a`

**State: partly done; safe to merge.**
- **Branch:** `pc/p10b` with `pc/p9b` merged, as asked. P9-A animates P9-B's keeper acts.
- **Every item has a fix and a check** (`tr9-anim`, `tr9-gkanim`), and the plan's regression suites pass, except two
  that fail the same way on origin.
- **Still open, recorded with numbers and causes:** a clip handing back to the gait, strike contact timing, the slow
  lateral jockey, and the hands in view.
- **The root-cause record** for every item is `plan/notes/p9a-rootcause.md`, which `qa/tr9-sheets.mjs` checks.
  `HOOKS.md` has the integrator's lines.

## What changed (P9-A's own files)

- **MV-9 jockey** (`view.js locoOf`): a jockeying body uses the gait's jockey style, side-on lead and trail steps up to
  3.4 m/s:
  - the AI's pressMove stance (state `'jockey'`);
  - yours, the strafe your held jockey asks for.

  It applies only going sideways or back; going forward at the man it runs.
- **MV-9 dribble touches** (`view.js dribbleTouches`): every dribble touch the simulation makes sends the drawn body's
  next swing through the ball (`gait.js touch`), aimed at where the ball will be when the foot gets there.
- **MV-14** (`actions.js`): the striker's speed through a strike follows `strikeRoot`, the clip's own root curve (a pure
  copy, since the simulation can't load the drawing code). The planted foot no longer skates under a body still moving
  at the run-up's pace.
- **MV-15, the body:**
  - the match's and Training's first-person body gets the life body's neck fix (`me.js neckFix`, now exported) and the
    arms-in every frame (`fpPose`, `V.fpSpy`);
  - fatigue is 0 to 1 from the breath (`view.js fatigueOf`). A standing body above 0.7 takes the tired stance and leaves
    it below 0.7; yours and the AI's alike.
- **MV-15 camAction** (`matchcam.js clipCam`): the camera's backswing, slide, chest and landing springs fire once, on your
  own clip's moment (a strike's plant, a slide's landing, a chest receive's contact, a header's landing).
- **GK-3:**
  - **Hands without a dive** (`view.js gkHands`), each from the step its state begins:
    - a claim shows `gkcatch` (high, on the claim's time), or `gkpunch` once he punched;
    - the spread shows `gkcollect` smother;
    - a ball gathered shows `gkcollect` scoop, or `gkcatch` chest above it;
    - a tip over without a dive shows `gktip`.
  - **Throw and roll:** P9-B's `gkthrow` and `gkroll` acts play `gkdistribute` on the act's own clock, its release on
    `tRelease`. The drawn ball sits in his right hand (`moves.js handBall`) until the release, then eases onto the
    simulation's.
  - **Training passes the saves on** (`training.js`): it now hands the view the simulation's saves and goals, as the match
    does. Before, a keeper's dive in Training showed no outcome and a punch showed the ready stance.

## Tests on this PC

| Test | Result |
|---|---|
| `qa/tr9-anim.mjs` (new) | 19 of 26 |
| `qa/tr9-gkanim.mjs` (new) | 7 of 8 |
| `qa/tr9-sheets.mjs` (new) | 5 / 5 |
| Regression: `wpB-feet`, `wpB-life`, `wpF-feel`, `tr2-gait`, `tr2-startstop`, `tr2-clipexit`, `tr6-receive-anim`, `tr3-runner`, `lint`, unit | pass (but the Windows-only unit `daily` and `presets`, fixed on `pc/integ`) |
| Regression: `wpK-throw` | passes once its Windows output path is fixed (done on `pc/integ`) |
| Regression: `wpK-gk`, `wpK-strike` | fail, the same on `pc/integ` without P9-A: hand-to-plan 2.8 cm (limit 2); a volley, a side volley, a rabona and a scissor kick that never plant |

**`tr9-anim` passes:**
- the bots ran every category;
- no stuck clip;
- the jockey style in 100% of jockeying frames, no crossover;
- dribble touches: every one asked for the same frame, and the drawn foot meets the drawn ball;
- the first-person body: the neck fix and arms-in every frame, and no joint within 0.12 m in front of the camera
  looking down to -60 degrees;
- tired: the stance comes and goes within 1 s, the AI's too;
- camAction: exactly one backswing, slide, chest and land, with the camera's roll under 2 degrees;
- the keeper's throw: the ball in his hand to the release, and the clip's release within 1 frame.

**`tr9-gkanim` passes:**
- planted feet in 49% of his moving frames;
- each claim, collect and spread shows its pose within 2 frames;
- 13 throws and 13 rolls;
- back in his ready stance 2.0 to 2.5 s after a dive;
- no teleport.

## Open (measured, cause found or narrowed, not fixed here)

1. **A clip handing back to the gait** (`tr9-anim` "no bone turns more than 0.25 rad / 0.3 rad at a change").
   - The first gait pose after a receive or a strike can turn a leg bone up to 1.6 to 1.9 rad from the clip's last pose.
   - The legs' IK runs after the blend into locomotion (`human.js`), so the blend doesn't cover them.
   - Most other large one-frame changes are far bodies posed less often (level of detail); the check now spreads those
     over the frames since the last pose.
2. **Strike contact timing** (`tr9-anim` "at contact the kicking foot is within 0.12 m of the drawn ball", 2 of 14).
   - The strike clip's contact is on its own clock, rate-adjusted toward the simulation's. From a stride adjust or a
     first-time ball, it can be a frame or more off the simulation's contact.
   - Fix: pin the clip's contact to the act's `tc`, as the keeper's distribution now is.
3. **The slow lateral jockey:**
   - at 1 and 2 m/s sideways a planted foot is carried with the body (0.22 m and 0.43 m over its plant);
   - at 1 m/s the feet come within 0.04 m of each other;
   - backward at every speed, and sideways at 3.2 m/s, are clean.
   - The cause is in the gait's shuffle at low speed (`gait.js`, its slip allowance); not traced further.
4. **The hands in view:** looking down at a run, the hands come into the middle half of the view in 11 of 600 frames.
   They're there when the arms-in pulls them in front of the hips.
5. **No punch** in `tr9-gkanim`'s crosses, even with four men within 1 m of the target. The keeper claims, catches or
   parries every time. The punch pose is wired (`gkHands`) and reached from the simulation's punch, but no run of the
   sets produced one.
6. **The plant-slide figure** in `tr9-anim`'s generic check still reads as large (metres) for a few bodies. A body posed
   rarely enough can lift a foot and set it down again between two poses without its own time down dropping. The
   check needs the gait's plant count, not its time down. Treat that number as a test limit, not a skate. The jockey
   section's plant check (one body posed every frame) is the reliable one.

## Next steps (for the cloud)

- Apply `HOOKS.md` item 2 (P9-B's roll threshold on `passModel`'s scale), and re-run `tr9-ai` and the harness.
- Open items 1 and 2 are the next animation work: the legs' IK inside the locomotion blend, and the strike clip's contact
  pinned to the simulation's.

## HOOKS.md

### P9-A hook requests (for the integrator)

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
