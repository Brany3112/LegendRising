# P1 inspection: ball, touch, receiving, shooting, passing, shielding, tackling

Snapshot inspected: `scratchpad/p1tree/LegendRising` (committed HEAD export). Spec: `fp/TRAINING-SPEC.md` (section 3 is the target).
All paths below are relative to the snapshot root. Nothing in the snapshot or in /home/user/LegendRising was edited.
(Housekeeping: running `qa/unit/{ball,touch,strike}.mjs` wrote their json reports into the snapshot's `qa/out/`; I moved
those three files to `fp/p1/ballprobe/unit-out/`, so the snapshot's `qa/out` is as it was, holding only a sibling's `unit-stamina.json`.)

Probes (all under `fp/p1/ballprobe/`):
- `p1.mjs` / `p1.out`: pure-module checks (attrs keys, the shield NaN, firstTouch distances, reach envelope, tackles, deviation).
- `p2.mjs` / `p2-seed{7,8,9}-full.out`, `p2b-seed{7,8}.out`: headless AI matches (harness `configFor`), possession statistics.
- `p3.mjs` / `p3.out`: browser (Playwright, QA_PORT 8853, server started and closed by `qa/lib.mjs launch/close`), key routing in a live `test:stamina` match.
- `p4.mjs` / `p4.out`: the player's first touch while running (sim with control.js's receive plan and dribble record emulated).
- Unit suites run unchanged: `qa/unit/ball.mjs` 76/76, `qa/unit/touch.mjs` 49/49, `qa/unit/strike.mjs` 52/52 pass.

## 1. How possession is decided today

Step order (`js/life/football/sim.js:312-460`): brains (ballPlans, carriers, pressers), agents move (actions + mover),
`separate()` (agent.js:105), then `controlCheck(ms); touchCheck(ms)` (sim.js:352), then the ball steps with all bodies as
capsules except the controller, who is a ghost (sim.js:360).

- **Planning (AI only) is first-to-ball**: `brain.js:307 ballPlans` runs `ball.js:908 firstReach` (mover `timeToPointQ` on the
  shared 90-sample prediction, reaction time, 0.6 m reach, feet 1.45 m height) for every candidate of ONE team per step
  (the two sides on consecutive steps), picks the earliest, gives him plan `chase`/`receive`/`intercept`; the intended
  receiver keeps it if within 0.4 s of the best. The player (`isMe`, not meAI) is skipped (brain.js:325).
- **Actual possession is nearest-in-envelope this step**: `actions.js:384 touchCheck` takes every on-pitch player within a
  1.6 m box, skips ghosts (own kick < 0.3 s), agents mid-kick/tackle/header/throw, diving keepers, staggered or grounded;
  keeps the one whose `reachEnvelope` (touch.js:79) distance is smallest. No arrival-time comparison, no 0.15 s duel, no
  shield/control ratings. Then: planned first-time strike; keeper gather in his box; opponent's ball: control under
  `8 + 0.12 interception` m/s (+4 if he wanted it) else `block()`; own ball: control under `18 + 0.12 ctrl` else block if
  he wanted it, else nothing.
- **Once controlled, the ball is locked**: `touchCheck` returns at once while `ms.poss.ctl >= 0` (actions.js:388, comment
  "a ball under somebody's control is only taken off him by a tackle"); the lock lasts until the ball is 2.4 m from the
  controller or above 1.8 m (`ACT.LOSE_CTL`, actions.js:38, `controlCheck` actions.js:847-855) or it hits another body
  (ball.js body capsule -> `bodyContact` -> `clearCtl`, actions.js:369-378).
  Measured (p2b, full AI matches seeds 7 and 8): 888 and 1335 steps (70 and 83 separate episodes, about 15 to 22 s a match)
  where an opponent was NEARER the ball than its controller with the ball inside that opponent's foot envelope, and he could
  not play it (only a tackle roll or a body hit could).
- **Control radius actually used**: foot 0.75 + 0.003 dribbling m (max 1.047), sole 0.45, thigh/chest 0.6 m at 0.6 to 1.4 m
  height, head 0.55 at 1.5 to 2.1 (head excluded from touchCheck) (touch.js:25-39, 79-94). The envelope is 360 degrees:
  `reachEnvelope` never looks at facing; p1 shows a ball 1.0 m directly BEHIND a dribbling-99 player is `foot`.
  `envAhead` (actions.js:440) also tests the ball's position later in the same step. Measured from the body at control
  time (p2, 3 matches): median 0.85 to 1.0 m, p90 0.97 to 1.13 m, max 1.22 m; 105 to 308 controls a match beyond 0.9 m;
  12 to 16 controls a match with the ball more than 0.1 m behind the body.
- **Contested balls**: 109 to 130 steps a match had both teams in reach of a free uncontrolled ball; 36 to 52 controls a
  match happened with an opponent also in reach. Winner = smallest envelope distance.
- **No teleporting of the ball**: control is a `ballKick` velocity change at the ball's current position (actions.js:336).
  The rendered ball is the simulation's, interpolated (view.js:130-142). Receive/strike/header clips IK the foot/head to the
  PREDICTED ball (view.js:240-247, 331-347; moves.js:1189-1250). The sim's no-teleport asserts read 0 in all probe matches.
  Direct position writes exist only for the keeper's catch at the contact point within one step (gkbrain.js:278-282, 305),
  restarts/spares (rules.js:566, 781, 1207), test fixtures and the warm-up minigame (warmup.js:820-886, its own ball).

## 2. First touch, aerial control, deflections, woodwork, contact, interceptions

- **First touch** (touch.js:105-142, called by actions.js:331 `receive`): absorb = clamp(0.05 + 0.13(1 - ctrl/100)^1.2 +
  0.01 max(0, |v| - 10) + 0.12 pressure + 0.08(1 - bF), 0.04, 0.6), +0.08 thigh/chest; out = incoming direction x |v| x
  absorb + push 1 to 3 m/s along WASD (player) / planFirst push (AI); direction error sigma (1 - ctrl/110) 0.35 |v|/15;
  quality from absorb and angle; heavy when the uncontrolled part rolls > 1.5 m. p1 numbers (12 m/s ground pass, standing,
  no push): rest 0.40 m at ctrl 90, 1.03 m at 50, 1.53 m at 30 (heavy); ctrl 50 with pressure 1: 3.78 m; ctrl 50 at 20 m/s:
  7.04 m; chest at 10 m/s, ctrl 50: 1.55 m. Uses absolute ball speed, not speed relative to the receiver; no agility,
  composure (except through ctrl), balance or facing angle; no fatigue term other than bF.
- **BROKEN: receiving on the move.** p4 (the player's own receive path, control.js plan emulated):
  sprinting 7.4 m/s with a 14 m/s pass from behind: controlled with the ball 1.04 m BEHIND him, the touch leaves it at about
  3 m/s, he runs on, control lost after 0.32 s. Jogging with a 12 m/s pass from behind: controlled 1.04 m behind, lost after
  1 s. Sprinting toward a 12 m/s pass at ctrl 40: controlled 0.77 m ahead, cushion (back along the pass) and push cancel,
  he runs over it, lost after 0.48 s. Jogging toward a pass works (kept, ball 0.5 to 2 m ahead).
  Root cause: firstTouch works in the ground frame with a fixed 1 to 3 m/s push (not relative to the receiver's velocity),
  the 360 degree envelope lets him "control" a ball behind him, and afterwards dribble touches only play a ball within
  0.9 m and 50 degrees ahead (actions.js:471) while his body is a ghost (sim.js:360), so a ball behind is never touched again.
- **Aerial**: thigh 0.6 to 0.95 m, chest 0.95 to 1.4 m within 0.6 m (vy pop 0.3 / 0.6 m/s), head 1.5 to 2.1 m only as a
  header action (touch.js:371 `headerContact`, speed >= 6 m/s, no cushioning header). Gaps: nothing between 1.4 and 1.5 m;
  no foot control of a ball above 0.6 m (no aerial foot cushion); a 0.6 to 1.4 m ball 0.6 to 1.05 m away is unplayable.
  View mismatch: view.js:342 picks thigh above 0.45 m (sim: foot below 0.6), and the receive clip triggers at 0.75 m
  (sim reaches 1.05 m+), so a sim control can happen without the clip.
- **Deflections**: ball.js body capsules legs/torso/head moving with the body (ball.js:648-690), e 0.3, mu 0.3, 8 degree
  spread, kicker ghost 0.25 s; logged as deflect/block (actions.js:369). Measured 44 to 94 deflects and 43 to 57 blocks a
  match. `block()` (actions.js:351) is automatic for any too-fast ball in an AI/player envelope (360 degrees, no reaction).
- **Posts and crossbar**: capsules r 0.06, e 0.6, mu 0.15 (ball.js:34-36, 156-157); unit/ball 10,000 shots at 35 m/s no
  tunnelling; 'woodwork' events logged (sim.js:271). Working.
- **Player contact**: `separate()` agent.js:105-146 (0.6 m shoulders, 70/30 by momentum, stagger above 3 m/s closing,
  speed-bounded); `chargeFouls` sim.js:588-605 for hard bumps into the man on the ball. No holding/pushing model.
- **Interceptions**: passModel lanes (brain.js:113-238), `intercept` plans (ballPlans), touchCheck interception thresholds.

## 3. Shooting and passing

- **Shot deviation** (strike.js:267-303, 307-336): Gaussian (truncated 2.5 sigma) around the INTENDED target in the target
  plane, sigma from accuracy, power (over-hit above 0.92), fatigue (bF, eF), pressure x composure, weak foot, body angle,
  plant error (incl. rhythm, volley timing), ball state, first time, finesse, scuff; speed spread from power; real flight
  re-solved by Newton on the integrator; knuckle; curl. p1: acc 40 at 20 m: median miss 0.85 m, p95 1.65, max 2.41;
  acc 90: 0.24 / 0.49 / 0.70. So low accuracy is a controlled near-miss of the aim, not random. Player aim adds reticle
  sway (control.js:247-255). Working.
- **Pass accuracy**: lateral sigma (0.006 + 0.05(1 - passAcc/100)^1.4) x pressure x foot x body x fatigue (x1.3 first time);
  weight sigma (1 - passing/120) x 12% for AI, 0.4% plus arrival spread for a tapped player pass. p1: passAcc 40 at 25 m
  median lateral 0.51 m (p95 1.42); 85: 0.15 (0.44). Working.
- **AI pass choice** (brain.js:440-660): every team-mate 4 to 52 m, to feet with 0.35 s lead, lob if lane pOK < 0.6, through
  balls to runners, crosses to 3 zones, long balls, clearances; passModel samples 8 lane points + 3 near the passer, every
  opponent's time with reaction and stamina (`o.fac`), receiver's meeting point, receiver control (ctrl, pressure, ball
  speed); perceived offside with a vision error; softmax by decision. Targets clamped inside the pitch. Partial issue: the
  player's "In behind!" call adds a through-ball option with NO offside check (brain.js:518-529), unlike normal through
  balls (`!seenOff`, brain.js:495).

## 4. Shielding

- No player shield action exists. C is the shoulder check (scan) in matches and FP training (control.js:105, 147, 155,
  520-521, 769-775); verified in the browser: C keydown sets `CTRL.scan`, released clears it.
- AI: the `shield` decision is dead. brain.js:631 `pLose = clamp(0.45 press (1 + (50 - at.strength)/150), 0, 0.7)` reads
  `at.strength`, which no attribute record has (attrs.js; p1 key lists), so pLose and V are NaN and `add()` drops the option
  (brain.js:450 `Number.isFinite`). Measured: shield never offered in 3 matches although the pressed hold/shield branch
  condition held in 264 to 447 decisions a match ("hold" was chosen 52 to 78 times).
- What remains is a movement fallback: `carrierMove` (brain.js:750-784) with no dribble and an opponent within 3 m sets
  state 'shield' and walks (cap 2 m/s) to 0.45 m behind the ball away from that opponent. Nothing reads state 'shield'
  for an effect (only actions.js:740 keeps it); tackleOutcome ignores it; pressMove's "shielded" rate is purely geometric
  (`exposed`, brain.js:1030). moves.js has an `upper:shield` gesture (moves.js:1576, 1623) that view.js never sets
  (view.js only uses UP_CALL/UP_FLAG/windUpper, 301-306). No Strength in the data at all.

## 5. Tackling

- **Standing / poke** (touch.js:44-49, 240-281, 293-362; actions.js:513-553): reach 1.05 + 0.003 tackling (poke 1.15 +),
  50 degree sweep, wind 0.12 s, active 0.25 s; outcome decided at the start by walking the foot sphere through the window
  at 240 Hz against the extrapolated ball and the carrier's leg capsule: ball first -> won (or poke with chance
  clamp(0.1 + 0.005(dribbling - tackling), 0.03, 0.35)), leg first -> foul (severity from closing speed, from behind,
  slide), else miss. Applied at the contact time; a ball since moved > 1.5 m (slide 2.2) away -> miss. No stat logistic,
  no timing factor, no angle factor (behind only via geometry and severity). p1: front, tackling 80 v dribbling 50:
  293 won / 7 poke of 300; tackling 40 v dribbling 90: 204 won / 96 poke (never a miss when the geometry reaches).
  Measured in matches: standing won 8 to 20, miss 17 to 29, poke 3 to 5, foul 3 to 8 a match.
- **Player**: LMB in defend context with the carrier within 1.6 m (control.js:603-609), F above 4 m/s for a slide
  (control.js:524). Both need an opponent IN CONTROL (actions.js:833-834): no tackle or slide on a loose ball or a 50/50.
- **AI**: pressMove (brain.js:1014-1060): jockey within 3.5 m at 3.2 m/s, tackle at a rate 2.5/s exposed or 0.5/s
  otherwise, x0.12 from behind, care factors, timing error 0.12(1 - tackling/110) s; slide at 0.55/s when chasing.
- **Slide** (touch.js:212-221, actions.js:785-797): travel 2.8 + 0.01 tackling m at a constant 6 m/s^2, so v0 =
  sqrt(12 travel) = 6.29 m/s at tackling 50, 6.74 at 99 REGARDLESS of the approach speed (gate only > 4 m/s), and the
  direction is toward the ball, not the run: momentum is not carried (a 4.1 m/s runner starts the slide at 6.3 m/s).
  Committed 1.1 s + 0.8 s on the ground = 1.9 s every time (hit or miss); no Agility recovery. Measured: 0 to 1 slides a
  match (both fouls).
- **Animation**: view.js:251-262 hard-codes `side = "R"` and targets the ball's position when the clip starts, not
  tackleOutcome's contact point; moves.js tackle clamps the foot reach to 1.0 m (poke 1.15) from the hip (moves.js:1393)
  while the sim reaches up to 1.35 m. Won tackles move the ball by an impulse along the sweep (3 to 6 m/s, +2 slide;
  poke 1.5 to 3) with 0.35 rad spread (touch.js:342-353).

## 6. Keys (match, FP training, life)

Match and FP training (control.js:105 KEYS, controlInput 133-178, controlStep 517-587, controller.js:127-153, 1336-1370,
training.js:341-355):
W A S D move, Shift sprint, X walk toggle, C shoulder check (hold), F finesse at release / small touch (held, attacking,
no charge) / slide (defending, > 4 m/s), Space header or jump, R tap "Here!" / hold 0.4 s "In behind!", E context only
(ready, bench sit/stand/hold to skip, dressing room use), Tab overview (match; in training too), H hints, Esc skip replay
(match) or quit (training), 1/2/3 contact Low/Normal/High on the pitch (FF speed on the bench), wheel contact, LMB shot
(hold, release) / standing tackle when defending, RMB pass or throw (hold, release) / jockey when defending. q v g b are
in KEYS only to stop their defaults.
- Modifiers: a key pressed with Ctrl/Alt/Meta is nobody's action (control.js:126-138, controller.js:129-136); Ctrl itself
  is unbound everywhere. No `navigator.keyboard.lock` anywhere; full screen only via the settings action
  (ui/main.js:1296-1300). Ctrl+W: the capture listener calls preventDefault on it (browser probe: defaultPrevented true),
  but Chromium does not let a page block Ctrl+W outside full screen with keyboard lock (browser behaviour, not testable
  headless). So binding shield to Ctrl outside a locked full screen would close the tab on Ctrl+W.
- Numpad: nothing uses `e.code`; control.js reads `ev.key`, so Numpad1 with NumLock on arrives as "1" and selects Low
  contact in a match (control.js:146). An admin key on Numpad1 must be checked by code before controlInput.
- VERIFIED conflict (browser, p3, live test match): Tab also opens the phone in hand (phone.js:108, lifeMode "street" ->
  "hand", pointer lock released by lifeHand) and Q opens the hub (phone.js:109, -> "hub"), because body keeps class "life"
  in a match and phone.js's window capture listener has no match guard (matches pending task #114).
Life (world.js:386-420, phone.js:99-114): W A S D, Shift, Space, E use (hold for long spots), H key panel, V view, 1/2
pockets, G throw, B build mode, F lock key at home, Tab phone, Q hub, Esc, LMB use/pick up (world routes only the left
button). C, Ctrl, RMB and the numpad are free in life.

## 7. Attribute names (attrs.js)

Career skills (js/data/game.js:5-21, attrs.js:16-17): power ("Shot power", trained in the gym's "Strength set"),
aero, curve, accuracy, passing, passacc, acceleration, sprintSpeed (pace = their mean), dribbling ("Chance to ride a
tackle"), stamina, composure, tackling, interception, jumping, heading. Derived (attrs.js:51-63): ctrl, passAcc,
agility, vision, decision. Ranges 1 to 99 (AI 20 to 99). AI wobble seeded by hashNoise.

| Spec name | Real name | Status |
|---|---|---|
| BallControl | `ctrl` = 0.65 dribbling + 0.2 composure + 0.15 passing (+5 control boots) | exists (derived) |
| Agility | `agility` = (acceleration + dribbling)/2; used by mover turn rate | exists (derived) |
| Composure | `composure` | career skill |
| Balance | none | missing; must be derived (e.g. from agility, power, composure) |
| Strength | none (brain.js:631 reads `at.strength` -> undefined) | missing; nearest real skill `power` (the gym's strength sets train it, gymclub.js:160) |
| Tackling | `tackling` | career skill |
| DefAwareness | none | missing; nearest `interception` (reaction time agent.js:75, interception thresholds), optionally with `decision` |

## 8. Where the section 3 formulas plug in

- **First to the ball / duels**: actions.js:384 `touchCheck` (replace "nearest in envelope" with arrival times; duel when
  two teams arrive within 0.15 s); feed it from brain.js:307 `ballPlans` (today per team on alternate steps and the player
  excluded) or a shared per-step candidate list using ball.js:908 `firstReach`. Also remove/limit the possession lock
  (actions.js:388) so a ball outside the controller's R can be taken.
- **Control zone R and touch q**: touch.js:79 `reachEnvelope` (radius from c, v - vc, height band, facing angle, breath)
  and touch.js:105 `firstTouch` (q and touch distance 0.6 + 0.8(1 - q), relative to the receiver's velocity); constants
  touch.js:25-39; callers actions.js:331 `receive` (pass agility, composure, balance, breath, pressure) and actions.js:440
  `envAhead`; classifyContact thresholds touch.js:409-424 (vc instead of 18 + 0.12 ctrl); brain.js:165 passModel reach and
  brain.js:226-234 receiver control; view.js:331-347 `recvFor` (same R and height bands so the clip matches).
- **Shield**: control.js (C hold; Ctrl only under full screen + keyboard lock; move the shoulder check off C), an intent flag
  read in actions.js actionStep (speed cap 0.6 jog, far-foot dribble via `dribbleKick`/`nudge`), touch.js:293
  `tackleOutcome` (S vs D logistic with angle and fatigue), brain.js:624-633 (fix the NaN, use the S/D model),
  brain.js:771-783 (AI stance), brain.js:1028-1040 (presser rate), sim.js:588-605 (pushing-from-behind fouls), stamina
  cost via stamAction, view.js:301-303 + moves.js:1576 (`upper:shield`).
- **Tackle**: touch.js:44-49 constants, 212-221 slideProfile (approach speed, mu 0.55), 240-281 reach, 293-362 outcome
  (T vs C logistic x timing x angle; keep the geometric leg-first foul test); actions.js:513-553 start/apply (allow loose
  balls), 785-797 slide step and recovery 0.45 + 0.6(1 - agility/99), longer after a miss; brain.js:1014-1060 AI trigger;
  control.js:524, 603-609 player trigger; view.js:251-262 and moves.js:1376-1410 (real contact point, real side, reach).
