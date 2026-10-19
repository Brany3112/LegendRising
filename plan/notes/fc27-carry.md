# fc27/carry: close control and the carrier's gait (FC 27 clip)

Branch `fc27/carry`, from `6cfac4a` (the spec, `plan/notes/fc27-spec.md`). Spec sections 2, 3.1 to 3.3, 5.0
(priorities 1 and 2), 5.1 to 5.4; checks 6.1 CC-1 to CC-9 and CC-13 for the touches, the gait and the ball, and the
carrying part of 6.2 (DR-1 to DR-6), plus DR-7 for the user's report of crossed legs in a turn.

(The rework is now called BCS; the names here stay fc27 until the integration renames them.)

## What changed

### The carrier's gait (`gaitcore.js`, `sim.js`, `gait.js`)

- **CARRY table** (`gaitcore.js`): speed, steps a minute, step length, duty, from the clip (spec 3.1):

  | m/s | 2.4 | 3.6 | 4.5 | 5.5 | 6.5 | 7.6 |
  |---|---|---|---|---|---|---|
  | steps/min | 330 | 340 | 360 | 410 | 450 | 470 |
  | step (m) | 0.44 | 0.64 | 0.75 | 0.80 | 0.87 | 0.97 |
  | duty | 0.46 | 0.45 | 0.44 | 0.42 | 0.40 | 0.36 |

  Blended in by `carryW(v, ck)`: the knob `CARRY_K.K` (1: the clip's, 0: our run) times the body's carry weight,
  faded in from 1.2 to 2.4 m/s and out from 7.6 to 9.5 m/s. `stepLen`, `cadence`, `dutyOf`, `strideTime` and
  `swingTime` take it (`ck`); the swing's floor goes from 0.22 s to `CARRY_SWING` 0.13 s. With no ball every table is
  exactly what it was (unit/gaitcore checks it).
- **The simulation's clock** (`sim.js agentStep`): `g.ck` eases to 1 while he carries the ball (in close control, or
  his stride dribble: the ball his, free, low, within 2 m) and back to 0 (`CARRY_EASE_K` 0.105 a step, about 0.15 s).
  `phaseAdvanceQ` uses the carrier's step, so the footfalls come at the clip's cadence: 358 steps a minute at 4.4 m/s,
  429 at 5.9.
- **The drawn body** (`gait.js`): the hips 0.075 m lower (`CARRY_HIPS`), the lift 0.11 to 0.01 m, the trunk 0.15 rad
  further forward (0.45 rad when bursting), the arms out (swing 0.36, elbows 1.35 rad, upper arms 0.85 rad out), the
  head down 0.42 rad on the move, 0.25 more through each touch, up a little between touches above 5 m/s.
  Measured: lean 0.26 rad, arms 0.83 rad out, head 0.67 to 0.78 rad down at the touches, hips 0.072 m lower.
- **Smooth at a third of a run's swing** (tr2-gait's carrier rows, first run this round): the swinging knee bends from
  the push-off at up to `KNEE_RISE` 4 rad/s, coming up to the knee's own 18 rad/s over 0.15 s (it reversed 0.21 to 0.29
  rad in the frame after the toe-off; now 0.075); the lift is even (a shuffle's, u² (1 - u)²) rather than the run's heel
  whip; the hips' rise and fall on the stride is `CARRY_BOB` 0.7 of the run's (on steps twice as quick the hips' speed
  changed 5 mm a frame; now 2.2 to 3.8); the foot lands flat (`landRoll`, the clip's), not heel first at a jog (the
  heel came to 12.5 mm over the grass before the footfall; now 16 mm or more).
- **The drawn clock** (`view.js carrySt`): while the footfalls play the ball, the drawn feet follow the simulation's
  clock (followed at 0.5 to 1.5 times the body's own rate, never jumped), carried on by the steps between the bodies'
  posing and the ball's drawing (`V.lag`: the match steps after the actors, so the bodies are a step behind). Through a
  turn played by the position controller, a stop or a slow walk, the drawn gait takes its own steps and the carrier's
  weight eases out and back over 0.12 s (see the turn, below).

### The touches (`actions.js`)

- **In close control on the move** (2 m/s or more, the keys within 60 degrees of the facing, not a cut of more than
  100 degrees from the last touch), every touch is made on a footfall: planned a footfall ahead (`carryPlan` into
  `a.cplan`, which the drawn body reads) and made on that footfall (`carryFoot`, `carryKick`).
- **Where**: the ball is sent to `CARRY.LEAD` 0.56 m ahead of the pelvis and `CARRY.LAT` 0.1 m to the strong side
  where the body will be at that foot's next strike, so it leaves at 1.03 to 1.04 times his speed and he catches it up.
  A strike whose ball would still be 0.1 m or more past that spot comes down behind it without a touch (the clip's
  #15). At a sprint the push goes two strides on (push and run, 2.2 touches a second).
- **Which foot and part** (spec 2.3, 2.4, 5.3): the strong foot carries it (the toe of a flat foot), turns it (its
  inside to the weak side, its outside to the strong side) and is about 85 to 90% of the touches. The weak foot only:
  a stop when it is the next foot down (its sole), the first push with the ball on its side after a turn, a ball the
  strong foot would come down on top of, and (new, below) a ball the strong foot could only play across the other.
- **Stops**: no key at 2 m/s or more: the next foot down puts its sole on it and rolls it to rest 0.22 m in front
  of where he stops. Standing, the ball rests at the strong foot's toe (`CTL.STAND` 0.22 m; was 0.3 to 0.5).
- **From any entry** (for automatic close control, bcs/controls): a ball neither foot's next strike can reach (less
  than 0.15 m in front of him as he goes, or a landing more than 0.85 m out to its side: a pass just taken, a loose
  ball, after a knock-on) is the position controller's (`ctlTouch`) until it is in front of him; a carry touch is
  never made on a ball more than 1.25 m from him.
- **The AI's stride dribble** (`dribbleFoot`, `dribblePlan`): the touch is the footfall's foot by the clip's rule,
  planned two footfalls ahead with the ball and body predicted; the other foot only when the ball would be overrun.
  The touch rate table (`touch.js CADENCE`) is one touch a stride up to 6 m/s and every 2nd above (was every 2nd
  from 3 m/s and every 3rd from 6: the carrier's strides are half as long).
- Every touch event names its foot and part (`foot`, `part`, and `carry`: why).

### The drawn contact (`gait.js`, `view.js`)

- The touch's foot comes down with its face behind the ball (`touchLanding`): the toe tip 0.105 m behind the ball's
  middle along the way it is played (the toe meets it in its lower third), or the inside or outside 0.085 m behind
  with the foot turned at most 0.6 rad off the way. Over the last of the swing (u 0.38 to 0.62) the foot comes on with
  the ball at its speed, so the toe is at it for the 2 to 3 frames before the footfall, held up by the carrier's even
  lift (the clip's toe on the ball as the foot comes down, low on it), the tracking eased in over 0.1 s from when the
  touch is known.
- The ball the drawn foot meets is the simulation's prediction at the drawn footfall (`predAt`), the simulation's
  clock extrapolated by `V.alpha` and `V.lag`.

### The turn the user saw (legs crossing)

Measured with a probe of the user's turn (running at the camera, then the view turned round and W+D, 135 degrees)
and of 60 degree turns (keys and view), per frame the ankles' and knees' order across the hip joints and the shins'
nearest approach (segment to segment). Before this fix, on this branch: the 135 degree turn crossed the ankles by
0.13 m with the shins 0.017 m apart; a 60 degree left turn landed the right foot 0.39 m across the left. The base
(6cfac4a) crosses too in most turns (right 60: ankles 0.27 m across, shins 0.003 m; view turned 60 left or right:
0.18 and 0.28 m across).

Causes and fixes:

1. **The touch's foot on the far side of the ball** (sim): the plan picked the strong foot for a ball that, at its
   strike, was on his weak side; the drawn foot went across to it. `carryPlan` now works out where each foot would
   land across the keys' way (`footLat`) and never plays a ball with a foot that would land more than 0.05 m past
   his middle: the other foot plays it (CC-7 updated on purpose), or the strong foot comes down beside it first.
2. **The simulation's quick stride through a hard turn** (view): with the carrier's clock and gait held through a
   turn played by the position controller, the feet kept stepping at 7 a second while the body spun 3 rad in 0.25 s
   over them. Now only the footfall touches drive the drawn clock and the carrier's gait (eased).
3. **A guard in the drawn gait** (`gait.js`): for a carrier, every landing at least `TOUCH_SEP` 0.08 m to its own side
   of the other foot across the pelvis (`ownSide`), a swing passing the other foot kept `PASS_SEP` 0.12 m out from it
   (let go of by the footfall), and a touch's foot turned in by 0.25 rad at most against the hips (a toe-in foot took
   its knee across the other).

After (the same probe): the user's 135 degree turn, ankles 0.13 m apart at the closest, knees 0.095, shins 0.104;
60 degree turns (keys or view, left or right) 0.12 to 0.15 m, shins 0.16 to 0.17 m; nothing crossed. Still crossing:
the view turned 135 degrees with W alone (the body snaps round, the turn is the position controller's): ankles up to
0.09 m across for a few frames while one foot swings well ahead of the other (shins 0.16 m apart), from the base gait's
stop and crossover steps (`cam135L`). The turn itself is the later turn package's.

## Tests

The machine ran at a load of 15 to 26 most of the afternoon (other packages' browsers and harnesses), and several
browser tests timed out starting the game (Training's hub in 120 s) and were run again.

- `node qa/run.mjs unit lint nodash`: 33 passed, 0 failed (unit/gaitcore with its FC27 block, unit/touch 52 of 52;
  lint 17 rules, 0 failing; nodash pass).
- `smoke`: pass.
- `fc27` (`qa/fc27-carry.mjs`): 22 of 23. Simulation: CC-1 16 of 16 touches on a strong footfall at 4.4 m/s, 20 of 20
  at 5.9, one a footfall; CC-2 2.91 and 3.64 touches a second, push and run 2.18 at 7.4 m/s; CC-3 358 and 429 steps a
  minute, 0.74 and 0.83 m, duty 0.441 and 0.411, swings 0.187 and 0.165 s, no ball 180 against the table's 180; CC-4
  the ball 0.63 to 0.67 m ahead of the pelvis; CC-5 on the strong side in every frame, at most 0.68 m ahead; CC-6
  1.03 to 1.04 times his speed; CC-7 strong foot 37 of 43 (0.86), turns R inside / L inside (ball on his weak side,
  -0.57 m) / R inside / R outside / L inside (-0.65) / R inside, stops R, R, L sole, the shot R; CC-9 played 0.18 s
  after the key, on the strike, R inside; CC-13 at rest 0.17 m. Drawn: DR-1 22 of 22; DR-2 closest 0.009 to 0.019 m,
  1 or 2 frames before the ball's new velocity; DR-3 contact 0.049 to 0.073 m up, the foot 0.07 to 0.21 rad off flat,
  2 to 4 frames within 0.03 m; CC-4 the ball's middle 0.105 to 0.117 m beyond the toe tip, 0 across; DR-4 down 0.017 s
  after, the toe 0.017 to 0.12 m behind where the ball was, 0 across; DR-5 0.301 rad (no ball 0.319), jump 0.068 m;
  DR-6 lean 0.257, arms 0.83 rad out, head 0.72 to 0.77 rad down, hips 0.069 m lower; DR-7 every turn touch's foot
  0.17 to 0.65 m to its own side, shins at least 0.091 m apart (left 60 0.171, right 60 0.106, back 135 0.091).
  FAIL CC-5 (drawn): the ball 0.25 to 0.7 m from the leading toe in 0.67 of the frames (0.85 asked; see Open).
- `tr2-gait`: every row passes but one: carry4.5 at 30 Hz, scale 1, hips within 1 mm of their top in 0.417 of frames
  (under 0.4 asked). At 30 Hz the carrier's step at 4.5 m/s is exactly 5 frames, so the same phases of the hips' curve
  are sampled every step; it is the same 0.417 with the hips' bob at 0.4, 0.55, 0.7 and 1.0 of the run's. The other
  carrier rows (knee at lift-off 0.075 rad a frame at 60 Hz, 0.19 at 30; hips' speed change 2.2 to 3.8 mm a frame; heel
  16 to 36 mm; cadence on the carrier's table) pass.
- `uf-turn`: pass.
- `tr9-anim`: 21 of 26. The base (6cfac4a, run the same afternoon) is 23 of 26. Failing in both: a planted foot slides
  13.7 mm (base 13.9), a bone turns 2.63 rad in a frame (base 3.07), 1.74 rad at a pose change (base 3.10). Failing
  here only: the kicking foot 0.183 m from the ball at one shot's contact of 18 (an earlier run here: 17 contacts, none
  over; the drills' contacts vary run to run), and MV-9 dribble touches met 6 of 7 (one 0.152 m against 0.15: the AI's
  stride touches are now planned on the footfall, the toe tip at the ball, and the test measures the toe joint, 0.07 m
  behind the tip: 0.08 to 0.10 m at the others; the base's touches went through the ball). MV-9 jockey passes again
  (a jockeying body is never the carrier).
- `u27-control` 11 of 11, `u26-keep` 8 of 8 (updated on purpose, spec 6.3: a sprint's push and run up to 1.05 m; the
  ball at rest within 0.3 m).
- `u27-feel` (real keys): F takes it, held Shift keeps it within 1 m in close control, running on to it and F takes it
  again: ok. Shift tapped twice: FAIL, no knock-on (close control still on). `u26-feel`: F held forward, sideways,
  backwards ok; Shift twice: FAIL the same way. Both then timed out drawing their contact sheets. The knock-on is two
  real key presses 2 frames apart that must come within 0.3 s of real time (control.js KNOCK_TAP); at a load of 18 to
  20 two frames took longer. The knock itself is unchanged and passes in the simulation (u27-control: close control
  ends on Shift twice). Not re-run at a low load.
- `harness --n 300 --workers 2`, before (6cfac4a) and after (the AI's stride dribble as now; nothing in the AI's path
  changed after it: close control is the player's only): 53 of 62 both. Before: 2 fail (W touches 30.57 [15, 26]; CM
  defend share 0.371 [0.165, 0.342]), 7 missed within two standard errors. After: 1 fail (ST defend share 0.037 [0.050,
  0.103]; 0.047, a miss, before), 8 missed within two standard errors: goals 2.917 [2.3, 2.9] (2.747 before), win share
  0.511 [0.55, 0.62] (0.543), W touches 27.81 [15, 26] (30.57, a fail, before), W shots 1.833 [2, 4] (2.233), AM defend
  share 0.196 [0.083, 0.173] (0.163), ST touches 23.52 [12, 22] (22.08), ST defensive actions 4.40 [1, 4] (4.10),
  headers on target 4.15 [1, 4] (4.05). CM defend share 0.321 and DF defend share 0.265 are back in their bands. simStep
  mean 0.065 ms, max 0.893 ms (1.152 before); determinism true. None of these bands is the carry's; the AI's dribble
  now touches every stride up to 6 m/s (the carrier's strides are half as long), which moves possession a little.

## Open

- **CC-5 drawn** (ball 0.25 to 0.7 m from the leading toe in 85% of frames): 0.67. The ball sits 0.63 to 0.67 m
  ahead of the pelvis at each touch (CC-4) and moves at his speed between touches; the clip's ball opens to 0.7 to 1.0
  m and he catches it up, which needs it to slow by 5 m/s² or so after the touch. The grass's roll is 1.1 m/s² and
  spin does not change the ground speed, and the spec says not to change the roll; so twice a stride (the touch and the
  other foot's landing) the leading toe is within 0.25 m of it.
- **The gather from standing** is the receive's clip (`view.js recvFor`: the ball is free and his to take), a big
  first swing (a foot bone turns 0.40 rad in a frame, the swing jumps 0.18 m); the drawn checks start at 0.75 s.
- **Turns the position controller plays** (a cut over 100 degrees, a stop, under 2 m/s): the drawn gait's own stops and
  crossover steps. The user's turn back (view turned round, W+D) no longer crosses (probe above); the view turned 135
  degrees with W alone still crosses the ankles up to 0.09 m for a few frames, the shins 0.16 m apart, as the base does
  (0.42 m there). The turn package's.
- **Automatic close control (bcs/controls)**: the carry is planned only for a ball in front of him that a foot can
  reach without crossing; anything else goes to the position controller until it is. Entry from a pass is tested only
  in the simulation (u27-control: a ball rolling to you, a loose ball, one reached sprinting).
- **The knock-on with real keys** under load (u26-feel, u27-feel): not re-run at a low load; see Tests.
- **tr2-gait at 30 Hz**: carry4.5's hips sit at their top in 0.417 of frames (0.4 asked), a sampling lock (5 frames a
  step).
- **Sole stops, sole rolls, cuts, standing turns, the S drag** (CC-8, CC-10 to CC-12) are other packages; the sole
  stop's foot comes down behind the ball here, not on it.
- **The engine's frame order**: bodies are posed before the match steps, so a body is a step behind the ball drawn
  with it. Only the carrier's drawn clock is carried over that step (`V.lag`); everything else still is a step late.
- **The first-person body** is not the carrier's (no lean or arms there).
- **The AI's set-off touch**: about 40% of the AI's stride touches are not on a planned footfall, mostly the first
  as he sets off at 1.5 to 2 m/s; those go through the ball on the old way (`gait.touch`, looked for over 0.8 s for a
  carrier). An AI's planned touch made late (a dribble taken up again mid-stride) can leave the foot 0.15 m off it
  (tr9-anim MV-9).
