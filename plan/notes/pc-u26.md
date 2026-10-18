# pc/u26: the user's test of 2026-10-18 (video), fixed on the PC

Branch `pc/u26`, from `origin/claude/awesome-babbage-o53g6x` at `f7ffe6e` (2026.10.18a, which has pc/integ in it).

## What the user asked

- The legs cross and look unnatural on the move, above all turning.
- In a jump the legs stay where the jump began and stretch.
- A kick with no ball makes the body contort.
- Tackles and slides are almost always a card, so the player is afraid to tackle.
- F when you are first to the ball keeps it at your feet with W A S D in any direction. Holding Shift lets it go.
  Shift tapped twice knocks it on to run onto.
- R held asks for a through ball ahead of your run, along the pitch towards goal, never sideways or out of play.

## What changed

**Tackles (`touch.js tackleSeverity`, `rules.js RULES.CARD`)**
- The severity is now 0.12, plus 0.045 × closing speed, plus 0.32 × from behind, plus 0.1 for a slide (0.12 more for a
  slide from behind), less 0.1 when the ball was played first.
- A yellow is above 0.7 and a red above 0.97. A tactical yellow needs a foul above 0.45 that stops an attack worth
  xT > 0.25.
- **Results:**
  - a slide from the front at 7 m/s is a free kick;
  - one from the side is a yellow;
  - a fast slide straight from behind is still a red.
- Before, a standing tackle at 6 m/s or any slide was a card.

**Legs across the facing (`gait.js`)**
- Above the side steps' speed the hips turn up to 1.45 rad into the way of travel. The chest, neck and head turn back
  to the facing within their own caps.
- The hips were held at 0.8 rad, so every diagonal or sideways jog or run in third person stepped the feet across each
  other.
- `tr2-gait`: at 3 m/s sideways the hips turn 1.50 rad (its cap there is now 1.6), the feet stay 0.18 m apart, with no
  drift.

**The jump (`moves.js` header jump)**
- In the air the feet go with the body, from where they were under it at take-off, and plant where they come down.
- They were placed from the take-off footprints in the world, so a jump on the run stretched the legs back.

**A kick at nothing (`view.js`)**
- If the ball is more than 1.3 m (× scale) from the striker when the clip begins, the clip is a swing in front of the
  body for its whole length.
- Before, the clip aimed at the ball wherever it was, and the leg reached out sideways for it.

**F, the ball at your feet (`actions.js keepStep`, `control.js`, `sim.js`)**
- With F held, the ball yours and no sprint, the ball is kept on a spot 0.32 m (plus 0.05 m per m/s) ahead along the
  way you go, or in front of you when you stand still.
- A soft real touch (at most every 0.18 s) is made whenever the ball would be 0.12 m off that spot.
- Holding Shift lets it go to the strides' dribble.

**Shift tapped twice (`knockOn`)**
- Two presses within 0.3 s knock the ball on along your way, 2.5 m/s faster than your sprint.

**R held (`control.js runPoint`)**
- "In behind!" asks for a spot ahead of your run when you run towards their goal (else straight up the pitch).
  - It is never more than 35 degrees off straight at their goal line.
  - It is 1.6 s of your pace plus 6 m ahead, between 8 and 18 m.
  - It is kept 3 m inside the touchlines and their goal line.
- Before, it was the point under the crosshair.

**Hints:** "F hold to keep it at your feet" and "Shift Shift knock it on and run" when you have the ball.

## Tests on this PC

| Test | Result |
|---|---|
| unit (`rules.mjs` and `touch.mjs` on the new values) | 31 of 31 |
| lint, nodash | pass |
| `qa/u26-keep.mjs` (new, simulation) | 9 of 9 |
| `qa/u26-feel.mjs` (new, real keys, third person) | all pass |
| `tr2-gait` | pass, with the new cap at 3 m/s |
| `tr2-*`, `tr2b-*` (`tr2b-tackle` included) | see the commit after the group run |

`u26-keep.mjs` results:
- F held while jogging forward, sideways, backwards, turning back and in a circle: the ball stays 0.58 to 0.66 m from
  you and is never lost.
- Standing still, the ball comes to rest 0.32 m in front of you.
- A sprint makes no kept touches.
- The knock-on goes 5.1 m ahead of you sprinting, and you catch it after 2.9 s.
- The held-R spot is checked running diagonally, running backwards, near a touchline and near their goal line.

`u26-feel.mjs` results:
- F held with W, D and S keeps the ball within 1 m and yours.
- Shift tapped twice with W held knocks it on over 3 m ahead.

## Open

- **Turning on the spot** (`gait.js standStep`, the pivot) is not changed. The video's worst frames were runs across
  the facing, which the hips' turn now covers.
- **Contact sheets:** the ones for a jump and a kick at nothing did not trigger in the test's drill. Space with no ball
  near made no jump, and a shot with the ball 15 m off made no swing. Those two fixes are covered by their code and
  the animation tests, not by a picture.
