# fc27/shot: the shot from the FC 27 clip

Branch `fc27/shot`, from `claude/awesome-babbage-o53g6x` at `6cfac4a` (the spec, `plan/notes/fc27-spec.md`, sections 4
and 5.7; acceptance 6.1, 6.2 SH-1 to SH-8 and the shot rows of 6.4). Names stay `fc27` here; the integration renames
the rework to BCS (the "better control system").

## What changed

### The simulation (`js/life/football/actions.js`, `STEP_IN`)

- **The step-in strike.** A shot along the ground at a slow ball a step away is struck 0.30 to 0.35 s after it is
  asked (`STEP_IN.T`; 0.29 s plus 0.07 s a metre of plant step), not in the reach window's 0.10 to 0.18 s, so the
  clip is never begun late and its plant step is drawn. Before, every live strike began late (`ACT.TC_MAX` 0.18).
  - The root is steered to its place at the contact: 0.184 m behind the ball along the aim and 0.28 m to the support
    side (the clip's geometry, `KINDS.instep`'s plant and `rootAtPlant`), kept on the ball as it rolls.
  - Across the aim it is at its place 0.12 s before the contact (`LAT_BY`, with speed to spare, `LAT_V` 0.8 of
    `VMAX`); along the aim it is `V_PLANT` 1.4 m/s short of it at the plant's moment (`PLANT_T` 0.2), so it comes on
    over the planted foot at the clip's pace and does not go on sideways over it.
  - Speed at most `VMAX` 2.3 (the clip's body 1 to 2.5 m/s); a body that came faster (up to `V_BODY` 4.4, the W jog)
    is let down to it by the plant's moment.
  - After the contact it runs on along the aim at 0.9 of its speed (at most 2.0) for 0.3 s (`ON`, `KEEP`, `VON`), so
    the plant foot pushes off and he lands on the kicking foot; the act lasts 0.37 s past the contact (`FOLLOW`).
  - Plant error: how far the root is from its place at the contact, less 0.3 m (`TOL`).
  - A stride adjust that comes within a step-in's reach becomes one.
- **Who gets one.** The ball's speed against his at most 2.0 m/s (`V_BALL`), the ball itself at most 3.2 (`V_ROLL`),
  he at most 4.4 (`V_BODY`); not a chip, a styled shot, a finesse shot, a dead ball, a restart taker's or a ball in
  the air. A ball carried at his feet counts (the review's preview: a shot charged while running with the ball).
  Before the review it was the ball's own speed at most 2.0 and the body at most 2.5.
- **Struck where he aims, not where he faces** (for the free-direction keys to come: the body runs where the keys say
  while the shot is aimed with the look). The ball ahead along his way or along the aim, the aim at most 1.75 rad off
  his facing (`TURN`); through the step he turns to the aim, the turn spread evenly to 0.15 s before the contact
  (`TURN_BY`; at most about 9 rad/s in the 75 degree case), and faces the aim until the act ends.
- The striker's body is ghosted for ball collisions during an undone step-in (`sim.js`), and no dribble touch is
  taken then (`dribbleFoot`); a first-time step-in keeps its own time (no 0.05 s clamp).

### The drawn shot (`js/life/moves.js`, `SHOT`, `shotPath`, `shotBody`)

| Item (spec 5.7) | Old | New |
|---|---|---|
| Contact (clip s from the plant) | instep 0.22, the plant at -0.14 (`PLANT_BACK`) | 0.20, the plant at clip time 0 (0.20 s before the contact) |
| Plant position | `KINDS.instep.plant` [0.26, -0.08] | [0.33, -0.08] (drawn: 0.31 to 0.32 across, 0.04 to 0.09 behind) |
| Plant step | `preStep` 0.16 to 0.3 s, plus `PLANT_BACK` | `shotStep` 0.12 to 0.30 s (`SHOT.PRE`), the time the simulation's contact leaves; up to 1.06 m drawn |
| Late start | always in open play | never for a step-in (0.30 to 0.35 s); a shot in the reach window (no step-in: a fast ball or body) begins late as before, a frame sooner (`LEAD`) |
| Toe-off | the swing from the plant | at the plant's moment (`OFF` 0; measured -0.18 s from a stand); a trailing foot rolled right up onto its toes leaves when it must (`PEEL`, 1.0 rad) |
| Backswing top | 0.42 + 0.1p back, 0.34 + 0.08p up | `TOP` 0.10 s before the contact, 0.14 + 0.06p behind the root on the hip's line, 0.47 + 0.12p up (heel 0.46 to 0.55 m, knee 95 to 120 degrees) |
| Contact face | laces, pitch 0.65 | laces toe down and a little out (pitch 0.7, yaw +0.12), 0.02 m lower |
| Follow-through | top 0.28 to 0.4 s after | top at +0.115 s (`FT`), 0.92 m at p 0.85, drifting to the support side (`FT_IN`) |
| Landing | dur - 0.02 (0.56 s after) | +0.36 s (`LAND`), placed from where the root is and how it moves |
| Plant foot after | down until the kicking foot lands | heel up from +0.20, toe off +0.27, a short flight, step through landing +0.58 on the move (`S_HEEL`, `S_OFF`, `S_LAND`) |
| Body | roll 0.12 at contact, arm 1.15 | lean to the plant side 0.2 at the top (`LEAN` 0.36 on the hips), arm out 1.45 from the top to the contact (`ARM`), dip into the plant (`DIP`), pitch forward 0.63 after landing on the move (`PITCH`), head on the ball to +0.1 then let go |

Also:
- **Held wind-up let go (the review).** A shot let go from a held wind-up swings the shot's own full swing from the
  cocked leg (back and up to the top 0.10 s before the contact, through, follow-through, landing). Before, the leg was
  held cocked and whipped in its joints in the last 0.13 s, and the body stood over the ball with nothing moving (the
  preview's "stands over the ball for about 0.3 s with an arm out, then a short, stiff swing"). With less than 0.15 s
  to the contact (`FULL`) it still whips. The support foot hops onto its plant when it is more than 0.12 m off it.
- **Which shots get the new drawing.** A step-in (`C.step`: the simulation's contact leaves `SHOT.STEP`, 0.05 s, or
  more for the plant step) gets all of it. A run-up's last step handed over (`st.pre`, the moves kit) keeps its own
  toe-off (0.02) and the hips' reach along the leg, on the shot's swing. A shot in the reach window (`C.win`, 0.10 to
  0.18 s to its contact, played up to twice as fast) swings `strikePath`'s smooth curve to the ball with a shorter,
  lower backswing, then the shot's follow-through and landing: the shot's own last tenth of a second at 7.5 m/s was
  more than the joints can turn at that pace, and the foot came 0.2 m short of a ball rolling on ahead of a running
  body (tr9-anim).
- A long plant step is reached by the hips leading into it, down at most 0.06 m (`DROP`, `reachLevel`), held to the
  contact. Along the leg, a metre's plant step had the hips 0.25 m down in a twentieth of a second.
- The kick's reach for its foot never raises the hips for a step-in; off a run-up or in the reach window it starts as
  the foot comes down from the top of the backswing. Reaching for the top lifted the hips and the planted foot.
- After the contact the hips' last reach eases away as part of the pose the hips' speed limit sees (`rateHips`):
  added after it, it was counted again every frame while the limit held, and a cross's follow-through sank the hips
  from 0.87 to 0.35 m (every strike kind).
- The planted foot keeps its world yaw while the body turns over it; the heel peels about the toe joint.
- Hit-stop: the training and match hit-stop scale the bodies' clip clock as well as the simulation (`V.timeScale`), so
  the swinging foot no longer runs ahead of a held ball (`view.js`, `training.js`, `controller.js`).
- `runupStep` (a run-up's plan, used by the moves kit): when the feet and the count both say the next plant footfall
  is the kicking foot's, the support foot's turn is one footfall on. A walk-up that stopped short counted its closing
  steps on one foot and never planted (wpK-strike instep 116).

### Tests

- `qa/fc27-shot.mjs` (new), group `fc27` in `qa/run.mjs`:
  - simulation: SI-1 (stand, walk-up, rolling, left foot, a ball at his feet slower and faster than he is, a jog, aimed
    57 and 75 degrees off his facing), SI-2 (fast ball, fast body, out of reach, in the air, a pass, a ball coming at
    him, an aim behind him), SH-8;
  - drawn: SH-1 to SH-7, the body (lean, pitch), fluid (contact, bone turns, plant slide), the release (the clip begins
    with the act, the contact 0.30 to 0.36 s after the release), the turn to the aim, the lunge, the held wind-up's
    full swing; cases stand, walk, left, hold, dribble (the review's), turn;
  - 6.4: `qa/out/fc27-shot-sbs.png`, the walk-up beside the clip's f246 to f266 (`FC27_PICS=dribble` for another case).
  - `FC27_SIM=0`, `FC27_DRAW=0`, `FC27_CASES=...` run parts.
- No existing test encoded the old behaviour in a way that had to change.

## Test results

Base is `6cfac4a`; this branch's last code commit is `e5f9b73` (the simulation unchanged since `0359575`). Browser
tests one at a time on a machine that other sessions' tests kept at a load of 15 to 22 (4 CPUs).

| Test | Base | This branch |
|---|---|---|
| `node qa/run.mjs unit lint nodash` | 33 passed | 32 passed, 1 failed: `unit/gk` close range 279 saves of 1400 (0.1993; band 0.20 to 0.40; base 283, 0.2021). See What is open |
| `fc27` (`fc27-shot`, new) | (none) | 26 of 26 |
| `wpK-strike` (40 a kind, as `run.mjs` runs it) | FAIL: volley 20 never planted | pass |
| `wpK-strike --n 200` | 4 fails: volley 20, sidevolley 84, rabona 161, scissor 65 never planted | pass |
| `tr9-anim` | 23 of 26 (slide 13.96 mm, bone turns 2.33 rad in loco, transitions 3.13 rad) | 23 of 26, the same three (13.93 mm, 2.94 rad in loco, 3.11 rad); the contact check passes (17 contacts, none over 0.12 m) |
| `wpD3-windup` | FAIL (in game: the body in your eyes not posed by the held clip, fpHold false) | the same FAIL, the same values |
| `u28-shotkeys` (run alone with no time cap, 19 and 23 min: in the chain it ran out of `run.mjs`'s 1200 s on the loaded machine) | 5 failed: the parts (the W+A shot struck with the laces, 0.58 m off the ball), a capital A (over-charged and scuffed), W+A half the curl (its bend missing), S then D (side -0.11), the guide's picture (width 0) | 5 failed: the parts (every curled strike with its part and at the ball, 0.07 m or nearer, but the plain one after them drawn with the outside, 0.15 m), a capital A (over-charged and scuffed, as base), W+A as hard as a straight shot (the straight one over-charged and scuffed: 12.74 against 14.99), S then D (side -0.10, as base), the guide's picture (as base). A real-input test whose held charge overshoots on a loaded machine: four of the five fail on both, and one each differs |
| `u28-shot` | (not run) | 10 of 10 |
| `u27-feel` (run alone with no time cap: in the chain it ran out of `run.mjs`'s 1200 s) | (not run) | its four checks pass (F with W: in close control; a sprint: within 1 m, yours; Shift twice: knocked on; run on and F: taken again), then the screenshot for its contact sheet timed out (30 s) on the loaded machine and the rest (the sheets, no console error) was not reached |
| `smoke` | (not run) | pass |
| harness, 200 matches from seed 1, 2 workers | 50 of 59, 8 misses, 1 fail (W touches 31.85); goals 2.875, shots 15.9, save rate 0.702 | 50 of 59, 8 misses, 1 fail (W touches 30.64, base's); goals 2.975 (a miss, band 2.3 to 2.9, within two standard errors), shots 16.55, save rate 0.696. An earlier run (the simulation before the review) had 53 of 59, goals 2.655 |

The drawn shot, measured by `fc27-shot` (s from the contact; m):

| Case | Plant | Toe-off | Top (heel, knee) | Plant at contact (across, behind) | Follow-through top | Kicking foot down | Plant foot down to | Lean at top | Pitch landed | Lunge |
|---|---|---|---|---|---|---|---|---|---|---|
| stand | -0.217 | -0.200 | -0.117 (0.545, 107) | 0.316, 0.071 | 0.925 at +0.100 | +0.367 | +0.267 | 0.19 | 0.63 | 0.15 |
| walk-up | -0.217 | -0.317 | -0.117 (0.543, 99) | 0.316, 0.070 | 0.928 at +0.100 | +0.350 | +0.267 | 0.20 | 0.63 | 0.21 |
| left foot | -0.200 | -0.183 | -0.100 (0.543, 95) | 0.312, 0.087 | 0.928 at +0.100 | +0.350 | +0.283 | 0.20 | 0.63 | 0.19 |
| held wind-up | -0.200 | (held) | -0.100 (0.552, 105) | 0.321, 0.040 | 0.953 at +0.117 | +0.383 | +0.283 | 0.20 | 0.63 | 0.13 |
| dribble (review) | -0.217 | -0.233 | -0.100 (0.465, 98) | 0.319, 0.054 | 0.769 at +0.117 | +0.383 | +0.283 | 0.21 | 0.62 | 0.22 |
| turn 75 degrees | -0.200 | -0.183 | -0.100 (0.542, 117) | 0.316, 0.071 | 0.928 at +0.100 | +0.350 | +0.283 | 0.19 | 0.63 | 0.12 |

The review's preview again, on this branch merged with `fc27/carry` (a turn, then the shot let go in the gold spot, the
same clip-matched camera at 30 frames a second): let go at frame 39; the step-in begins at 40; the support foot is
carried 0.95 m onto its plant by 43, the hips 0.14 m down into it, the support arm going out; the heel is 0.52 m up at
47; the contact at 51, 0.35 s after the release; the follow-through 0.85 m up at 57; he runs on at 1.55 m/s. Before:
standing over the ball for 0.3 s, then a short, stiff swing.

Release (or ask) to contact 0.317 to 0.350 s in every case (the preview: 0.37 s with the body standing over the ball);
the laces 0.025 m into the ball, the ankle pitched 0.70; the support arm 1.45 rad out; no bone over 0.333 rad a frame
away from the contact; the plant foot slides 9 mm at most; facing the aim within 0.12 rad at the contact.

## What is open

- **`unit/gk` close range, 279 saves of 1400 against the band's 280.** The range's shooter stands 0.65 m behind a still
  ball, which is now a step-in: the kick comes at 0.347 s, not 0.140. The shots are the same (26.44 m/s on average on
  both trees, the keeper 3.24 m off his line at the kick on both); only where the simulation's random draws fall moves
  with the 0.21 s. The same 1400 shots on fresh ranges give 280 (0.200) here and 283 on base; seeds 16 to 34 give
  0.1985 here and 0.202 on base. Base sits three saves above the edge of the band. Not changed here (it is not a test of
  the old shot, and widening its band would weaken it): for the lead.
- The weak-foot set touch (5.7, optional) is not built.
- Shots at run speed (the body over 4.4 m/s, the ball over 3.2 m/s or more than 2.0 m/s faster or slower than him)
  keep the reach window (0.10 to 0.18 s, begun late, `strikePath`'s curve). The clip's turn-and-shoot is not in this
  package.
- A step-in turns the body to an aim up to 1.75 rad (100 degrees) off its facing; an aim further round keeps the reach
  window and its old turn. With the free-direction keys (the parallel package) a shot charged running away from the aim
  will be common: worth a look once they are in.
- Close control automatic (no F, the parallel package): a step-in takes a ball carried at his feet whether close control
  is on or not (the ball's speed against his within 2.0 m/s), and no dribble touch is taken during it.
- Merging with `fc27/carry` (checked with `git merge-tree`, no branch touched): two conflicts. `actions.js`
  `dribbleFoot`: keep both, this branch's step-in guard (`a.act && a.act.stepIn && !a.act.done`: no touch) before
  carry's `if (a.ctlOn) return carryFoot(ms, a, side)`; `qa/run.mjs`: both add a `fc27` group, one group with both
  scripts.
- Base's own failures, unchanged here: `wpD3-windup` (the held clip in first person), `tr9-anim`'s three (a corner
  drill's planted foot, loco bone turns, transitions), the harness's W touches.
