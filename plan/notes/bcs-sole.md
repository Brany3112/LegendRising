# bcs/sole: the sole moves and the fakes (FC 27 clip)

Branch `bcs/sole`, from `bcs/integ` (`41c4cd0`). Spec (`plan/notes/fc27-spec.md`) sections 3.6 and 5.6 and the sole
rows of 6.1 and 6.2: the sole stop, the A, D and S drags after the fake, and the double sole roll as an optional move.
Acceptance: `qa/bcs-sole.mjs` (group `bcs`, with `bcs-integ`).

## What changed

### The simulation (`js/life/football/actions.js`, `SOLE`)

Every sole move is an act with `segs`, one per sole contact: `{side, t0, t1, x0, z0, x1, z1, vx1, vz1}`. As the sole
lands (`soleLand`, logged as a touch with `part: 'sole'` and `sole: 'stop' | 'drag' | 'drag back' | 'roll'`) the ball
is stopped dead under it and from then on driven along a Hermite path (`solePath`) from where it was to where the sole
lets it go, leaving at `(vx1, vz1)`. The drawn sole stands on the simulation's own ball, step for step. Close control
is kept through all of them.

- **The sole stop** (`startSoleStop`, from `keepStep`): the keys let go in close control at `STOP_V` 2 m/s or more,
  running the way he faces (`STOP_FACE` 0.5 rad, turning under `STOP_TURN` 3 rad/s). The next foot down, either side,
  comes down on top of the ball on its own footfall (`soleFoot` from `dribbleFoot`); not one already landing within
  `NEXT_MIN` 0.034 s, nor one whose sole would land `STOP_X` 0.15 m across his middle (the one after then). He runs on
  into that stride; from the contact the ball is held `STOP_HOLD` 0.15 s (the clip's 3 to 7 frames are 0.1 to 0.23 s;
  dragged back `STOP_DRAG` 0.03 m) and left at rest, and the body brakes at a steady rate to `STOP_V_END`
  0.4 m/s in `STOP_BRAKE` 0.29 s (`soleBrake`, up to `BRAKE_MAX` 20 m/s²): stopped 0.283 to 0.3 s after the contact.
- **The drags** (`dragPlan`, `dragBody`; the fake's A, D and S): the sole on the ball `DRAG_HOLD` 0.2 s (the clip's
  0.17 to 0.23). A or D: the foot on that side, drawn back and out to that side (`DRAG_DIR` across 0.45 : back 0.6)
  and let go at `DRAG_V` 4 m/s (3.98 measured). S: the strong foot, straight back, `S_BACK` 0.3 m under him from a
  stand, `S_BACK_RUN` 0.7 m against his body from a run of 3 m/s (0.69 measured at 4.4), let go at `S_V` 3.5 m/s.
  Ball Control: the way it goes is off by up to `DRAG_ERR` 0.2 rad times (1 - Ball Control/110). The fake's run-in
  now holds the body's speed (`fakeCap`) so a drag from a run still reaches the ball (`DRAG_LATE` 0.45 s at most).
- **The turn after a drag** (new this round): the sole foot comes down `DRAG_SET` 0.08 m to its own side of where it
  let go (`solePivot`), and `DRAG_FACE` 0.08 s after the release he turns over that planted foot to the way the ball
  goes (S: half a turn to the sole's side), in `act.turnT` = |turn| / `TURN_RATE` 11 rad/s (`TURN_MIN` 0.14 s at
  least), eased (`spinEase`). His middle is carried round the planted foot as he turns and in to `ORB_R` 0.15 m of it
  (`orbit`): his weight goes over the foot he turns on, so the drawn feet each stay on their own side. Before this the
  body turned about its own middle while the drawn pivot foot stood still, and the run after the ball began with one
  foot on the wrong side of the other (dragD crossed to 0.027 m).
- **The run after it** (`followBall`): sprinting at the ball (where it will be 0.25 s on), facing it, but no faster
  than `CLOSE_V` 1 m/s more than it rolls away plus `CLOSE_K` 3 m/s for each metre beyond `CATCH`, so he comes on to
  it under control; it is his again once within `CATCH` 0.75 m, in front of him, him turned the way it rolls and it no
  longer running away (`CATCH_V` 0.5 m/s), `FOLLOW` 1.4 s at most.
- **The double sole roll** (`startSoleRoll`, `rollBody`; the Z key): the strong sole lands `ROLL.T0` 0.18 s on and
  rolls it `ROLL.ACROSS` 0.3 m across to the weak side in `ROLL.T1` 0.13 s (let go at 1.5 m/s); the weak sole catches
  it `ROLL.GAP` 0.1 s later and rolls it `ROLL.BACK` 0.38 m back and `ROLL.IN` 0.09 m to the strong side in `ROLL.T2`
  0.13 s; he spins half a turn to his strong side in `ROLL.SPIN` 0.2 s on the strong foot (set down `ROLL.OUT` 0.3 m
  to its side and `ROLL.SET_BACK` 0.1 m back of where its roll let go, his middle carried round it as in the drag);
  `ROLL.PUSH_T` 0.08 s later the strong toe pushes it out the way he came at `ROLL.PUSH` 4.5 m/s, and he runs on after
  it. From a run (`ROLL.V_MAX` 3.2 m/s at most) he brakes to stand `ROLL.STAND` 0.4 m behind the ball.

### The drawn body (`js/life/moves.js` mode `'sole'`, `js/life/football/view.js soleSt`)

A clip posed at the act's own time (`st.at`: the act's seconds at the drawn moment), on the simulation's contacts, so it
can neither fall behind nor run ahead. Both feet are world points held by the plant pass (`lockFeet`).

- The sole on the top of the ball (`SD.PRESS` 5 mm into it, toes `SD.PITCH` 0.25 rad up) from the contact's first step
  to its last, coming onto it from above (`SD.LIFT`) and leaving the same way.
- The other foot planted as the pivot through every drag and roll contact: set wide first (`SD.PIV_W` 0.5 m out and
  `SD.PIV_B` 0.2 m back of the ball for a drag, `SD.ROLL_W` 0.55 for the roll), within `SD.PIV_STEP` 0.1 s. For a
  roll from a run the weak foot is planted no further than `SD.ROLL_PA` 0.25 m ahead of where he will be as the strong
  sole lands (`act.root0`), so he comes on over it rather than reaching for it.
- The stop's other foot leaves the grass as its stride would and comes through to square up beside the ball
  (`SD.PIV_T` 0.2 s after the sole lands, `SD.PIV_OUT` 0.36 m out).
- A drag's sole foot comes down on the simulation's pivot as the turn begins and its toes turn with the body; the
  other foot steps round to its own side of him (the pivot's place in the body mirrored, `SD.STANCE` 0.12 m out at
  least), down as the turn ends.
- The roll: the strong foot set on the pivot before the weak sole lands (a little hop between the two soles), the weak
  foot carried round it through the spin, the strong toe pushing the ball out and stepping after it.
- The legs never cross: the hips turn (`SD.PSI_MAX` 0.8 rad at `SD.PSI_RATE` 7 rad/s) so each ankle stays `SD.SEP` to
  its own side of the other across the hip joints; the hips over the base (`SD.OVER`), down while a sole is on the
  ball (`SD.CROUCH`), the arms out (`SD.ARMS` 1.1 rad, the clip's 1.0 to 1.4), the head on the ball.
- The clip ends with its act for a stop, 0.03 s after a drag's turn (the run after the ball is the gait's own) and
  0.13 s after the roll's push.

### The controls (`control.js`, `fphud.js`, `css/fp.css`)

- **Z: the double sole roll.** Z was free both in football (`KEYS`) and in the bcs/controls layout (W A S D, Shift,
  X, C, F, Space, R, E, Tab, Q, G, B, 1 to 3, mouse buttons) and nothing else in the game reads it; it sits under the
  left hand beside the movement keys, so it can be pressed without letting go of W A S D. Pressed with the ball his in an attack (no act, no charge), it
  starts the roll; otherwise the reason line says "the ball has to be at your feet to roll it". The pressed-key hints
  show "Z roll it with your soles and turn away" while he has it in close control.
- The in-game guide (the shooting and flick guide, now "... the fake, the flick and the sole moves") has a sole moves
  paragraph: the stop, the drags, Z.
- The sole stop and the drags need no new key: W let go, and LMB held then S then A, D or S.

## Tests

`qa/bcs-sole.mjs` (in group `bcs`): the simulation (SS-1 to SS-4) and the drawn body (DS-1 to DS-7), see its header.

Changed on purpose:

- `qa/u28-shot.mjs`: Ball Control's drag check now measures the angle the ball is let go off `SOLE.DRAG_DIR` (the drag
  lets go rolling the new way; it used to be a push to a spot).
- `qa/bcs-integ.mjs` BI-3: the run goes on 4.5 s after the fake rather than 3.5, so the whole 2 s after the fake's end
  (later now: he runs after the ball he let go) is seen. Its thresholds are as they were (1.0 s, 3 touches).

RESULTS

## Open issues

OPEN
