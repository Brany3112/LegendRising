# P1 inspection: movement and animation (read-only)

Snapshot: scratchpad/p1tree/LegendRising (committed HEAD). Spec: fp/TRAINING-SPEC.md sections 2 and 6 (walk rework, no
sliding/snapping, stamina one model, height via whole-body scale with collisions/contact points/foot placement consistent).
All line numbers below are in the snapshot. Probes (all under fp/p1/, port 8852, server started and closed by lib.mjs):

| Probe | What it does | Output |
|---|---|---|
| probe-move.mjs | real human() body driven by the real mover.js like core/me.js (life, FP and TP yaw, 60 and 30 Hz, height 1.07) and like view.js (match, football profile); per segment: sole-contact skate, gait-bookkeeping drift, bone jumps, hip motion, cadence, start/stop latency; keeper gkready while moving; clip transitions | probe-move.json |
| probe-walktrace.mjs | per-frame trace of walk (life 1.7 m/s), jog (3.8), sprint: knee angle, foot points, swing u, hips | probe-walktrace.json |
| probe-cam.mjs | in the game with the keys (training pitch, FOOTBALL profile): first-person camera height per frame | probe-cam.json |
| probe-clipexit.mjs | first locomotion frames after a strike clip, root still vs moving during the clip | probe-clipexit.json |
| probe-strikeroot.mjs | strike clip while the root keeps moving (as actions.js lets it) | probe-strikeroot.json |
| stamnum.mjs, cutnum.mjs | Node: stamina and mover numbers from the pure modules | console |
| wpB-feet-copy.mjs | copy of qa/wpB-feet.mjs with output redirected here | wpB-feet-copy.json/log: 66 ok, 0 FAIL |

Unit tests qa/unit/mover.mjs, stamina.mjs, gaitcore.mjs: pass.

## 1. Architecture map (who animates what)

- Locomotion physics: js/life/mover.js `moverStep` (one model; LIFE and FOOTBALL profiles, mover.js:59-90). Life body:
  core/move.js `body()` (96-149) every frame slice, LIFE profile off-pitch, FOOTBALL profile on the training grass
  (move.js:110); keys -> intent (126-129: face = camera dir always, gait walk / Shift run / Shift+forward sprint).
  Match/training agents: sim.js `agentStep` (414-431) at fixed 60 Hz, intents from control.js (531-545) or brain.js.
- Stamina: js/life/stamina.js (one model) used by core/move.js (121-143), sim.js (422, 481-491), actions.js action costs,
  controller.js own pre-match walk (254, 482-486).
- Animation: human.js `animateHuman` (1874-1995): mode dispatch (MODES 1736-1745 plus registerMode from moves.js
  1611-1623 and gkmoves.js 497-504), Euler base pose -> quaternions, inertialisation (1778-1812, upper layer 1815), then
  constraints: locomotion legs by gait.js `gaitLegs` (1982), clips by plantLegs/ground.
- Gait: gait.js (phase from root distance via gaitcore.js phaseAdvance; world footprint locks; start/stop/pivot/cut
  steps; reach resolution; swing Hermite). Upper body on the move: gaitPose (709-750).
- First person life: core/me.js meStep (139-197): FP body faces P.yaw (148), posed with gaitState (102-107, speed P.speed,
  intent LOCO.want, root P.x/z), neckFix (112-121), armsIn; bob from FP body pelvis hipDy + footfall nod (127-137).
  Third person life: ME.tp yaw turns to velocity at <= 9 rad/s (151).
- Match: view.js animAgent/liveSt (171-302) per agent (SCHED tiers), FP body fpPose (354-376) posed by matchcam fpFrame
  (157-226); training.js uses the same view/matchcam (training.js:392-395).

## 2. The janky walk: measured root causes

Walk = life profile 1.7 m/s (and football walk 1.5), 60 Hz, scale 1, FP yaw. Same code for TP and NPCs.

1. Toe-off knee snap and foot pop, every step. At each lift-off the knee flexes 0.29 rad (17 deg) in ONE frame
   (8 of 8 lift-offs, walk trace) and the ball of the foot jumps 26-42 mm up in that frame (jog 46-51 mm). 0.29 = the
   KNEE_RATE cap (gait.js:914, 18 rad/s x 1/60, applied at 879-880), so the unclamped jump is larger. Root cause: the
   swinging leg's hold (gait.js:861 l0 = 0.90 leg length walking, 870 `cw = max(1 - sstep(.75,.93,u), R)` = 1 from u = 0)
   draws the ankle in toward the hip at full weight on the first swing frame, while in stance the same leg is solved out
   to REACH 0.99 (gait.js:38). The existing gate (qa/wpB-feet, 0.35 rad/frame) passes it (max 0.289-0.343).
2. Hip "plateau and notch". Hips pinned within 1 mm of their top for 81/120 frames, then once per step drop 13.4 mm in
   one frame (up to 20 mm over 3-4 frames) and climb back at exactly 10 mm/frame = the 0.6 m/s rise cap (gait.js:856:
   "falling at once, rising at most 0.6 m/s"). Not a smooth pelvis curve; velocity discontinuities twice a stride. At
   30 fps: 26 mm drop in one frame. The first-person bob is this curve (me.js:130-134, matchcam.js:177-183): in game
   (probe-cam, 1.5 m/s) the eye drifts down 0.1-0.2 mm/frame for ~23 frames (mean subtraction, 2.5/s low-pass) then
   notches -2.4, -2.7, -1.5 mm and rebounds +4.5 mm in one frame at the footfall (range 11.5 mm). Sprint: flat plateaus
   (10 frames) and 3.5 mm/frame jumps. This is the most visible "janky" FP symptom.
3. Walking flight phase. Both feet in the air for 3 frames (50 ms) once per stride at 1.7 m/s (frames 1.550-1.583,
   2.433-2.467) plus 6 frames at the start; DESIGN 3.5.3 says walking never has one. Stance 0.43 s vs stride 0.90 s
   (duty 0.48, table 0.60). Root cause: the trailing foot lifts by reach (gait.js:594 outOfReach) before the other lands:
   the WALK table step (0.843 m at 1.7, gaitcore.js:17) is more than reachSpan allows with the walk hip budget.
4. Limp (left/right asymmetry). Touchdown intervals alternate L 0.467-0.483 s / R 0.400-0.417 s (14%). The clock runs
   0.0173 phase/frame normally but 0.0232 (+34%) for ~7 frames during one foot's late swing: the swing time floor
   (gait.js:561-568, `advance(need)`) pushes the clock when sw.t/sw.T runs ahead of phase.
5. Cadence above the table (busy legs): walk 2.19 steps/s vs table 2.09; jog 3.29 vs 2.76 (+19%); sprint 3.75 vs 3.34
   (+12%); tall body (1.07) walk 2.18 vs 1.88 (+16%). Root cause: TSW_MAX 0.45 s (gait.js:48) is shorter than the RUN
   table's own swing time (3.8 m/s: stride 0.725 s x (1 - 0.306) = 0.50 s), so the time floor pushes the clock.
6. Heel skim at landing. The heel point is within 12 mm of the ground for ~3 frames before touchdown moving 0.8-1.7 m/s
   (22-46 mm of travel) and the knee straightens up to 0.24 rad in one frame at u ~ 0.9, where the knee rate limit stops
   (gait.js:879 `f.sw.u < .9`). Planted feet themselves do not slide (bookkeeping drift <= 0.4 mm, slips 0).
7. Start/stop: root vs legs. LIFE a0 9, brake 12 (mover.js:70): walk reaches 95% in 0.20 s and stops in 0.15 s over
   0.11 m (FOOTBALL walk 0.22 s / 0.20 s / 0.14 m). The first footfall lands 0.33 s after the root starts, after 0.41 m of
   travel; after release the feet keep stepping 0.45 s (STAND at 0.60 s, root stopped at 0.15 s). The body glides off
   and settles before the legs.
8. Third person only: ME.yaw turns at <= 9 rad/s (me.js:151) while the LIFE mover takes the wish heading at once from
   standing (mover.js:197) and reaches walk speed in 0.2 s, so starting off away from the body's facing shows backpedal
   and side-step frames ("back" 6 frames, "shuffle" 3) and thigh pops of 0.75-0.84 rad in one frame (lifeTP60 tap1,
   runSprint). Also TP strafe/back are a forward walk at 0.8 speed (face = camera, move.js:129).
9. Sideways in first person: at >= 0.8 m/s (SHUF_MAX 0.9 body units, gait.js:65, 431) there are no side steps; the hips
   twist up to 1.1 rad (gait.js:434; DESIGN 3.5.9 asked for 0.8 plus shuffle) and the legs walk diagonally.
10. Frame rate: the player's body is posed once a frame with the full dt (me.js:186); at 30 fps the rate limits are
   per-frame doubles: knee 0.36-0.6 rad/frame, hip 26-37 mm/frame drops.

## 3. Other movement/animation findings

- Clip -> locomotion pops (BROKEN, measured). gaitPlace keeps the stale G.rootX from the last locomotion frame before
  the clip (gait.js:105; G.rootX only set in gaitStep 396; human.js:1900 calls gaitPlace on returning). First loco frame
  after a strike during which the root moved 1.36 m: G.v = 83 m/s, G.vs = 15.1 m/s decaying to 3.2 after 11 frames while
  the body walks at 1.7; a planted foot moves 109 mm in a frame, the swing foot 110-160 mm/frame. Over 1.5 m of clip
  travel gaitStep re-places the feet under the root instead (gait.js:408, a snap). Independently, the legs are not
  inertialised (IK after the blend, human.js:1982): first loco frame after an instep strike with the root still: a leg
  bone turns 1.62 rad in one frame. Same pattern after pass, receive (chest/inside), header, standing tackle
  (0.85-1.6 rad).
- Strike clip vs root (PARTIAL). strikeRoot (moves.js:601-605, the root-speed curve the mover was to apply) is not used
  by the simulation; actions.js caps the striker at max(1.5, 0.97 v) per step before contact and 2.5 m/s after
  (actions.js:770, 775), tackle 2.5 (780). With the root moving 1.5-4 m/s during a strike the on-ground skate is 23-66 mm
  per clip; bones hit the clip rate limit RATE.max 20 rad/s (moves.js:110) at 0.333 rad/frame near contact.
- Match bodies have no intent (BROKEN for stops). view.js passes speed only (298, FPST 371), gait intent = speed
  (gait.js:427), so STOP starts only below ~1 m/s (629-631) and the hard-stop plant/brace (634, v > 4) never runs for any
  match/training body (probe: sprint stop STOP at 0.967 s, root stopped 1.05 s, STAND ~0.5 s later; life: STOP at 0.1 s).
- Jockey (BROKEN/MISSING). gait.js supports st.style 'jockey' (430-432) but view.js/fpPose never pass a style; at
  3.2 m/s strafe with face held the body runs forward twisted (styles fwd 79/back 11) with a 52.8 mm planted-contact
  drift and a 0.546 rad bone jump.
- Backpedal toe drag: toe tip within 12 mm of the grass in swing at up to 3.44 m/s, 339 mm per 1.5 s (match), 1.43 m/s
  life.
- Goalkeeper ready/shuffle (BROKEN). view.js:224 poses gkready below 2.6 m/s while he moves; gkready is a static
  body-space pose (gkmoves.js:59-75, legIK, no plant/gait), so the feet slide at the body's speed: 3.56 m in 1.5 s at
  1.2 m/s, 4.72 m in 1 s at 2.4 m/s. gkcatch, gkcollect, gkpunch, gktip are registered (gkmoves.js:500-503) but never
  requested by view.js; dives (gkdive with the sim's plan), gkset, gkdistribute and throws are wired (view.js:205-226).
- Tackles: side always "R" (view.js:253, 259); target = ball position when the clip starts, not the contact point
  (view.js:254); 'block' kind unused. Slide: v0 = sqrt(2*6*(2.8 + 0.01 tackling)) = 5.8-6.7 m/s regardless of run-in
  speed (touch.js:212-215, actions.js:520-525, 784-795): a 4 m/s approach jumps to >= 5.8 m/s, an 8 m/s one loses
  >= 1.3 m/s at once; fixed 1.9 s with get-up (commit 1.1 + ground 0.8); recovery not by Agility.
- Receive: view.js recvFor (332-352) picks the clip from a 0.35 s prediction (chest > 0.95 m, thigh > 0.45, sole < 0.16 and
  slow, else inside), independent of touch.js's decision; not verified in a match by me.
- Dribbling (MISSING animation). gait.touch() (gait.js:129) is never called; view.js passes no st.phase (DESIGN 3.5.9);
  the sim kicks the ball on its own gait clock's footfalls (sim.js:427-430 -> actions.js dribbleFoot 460-474) using
  a.scale, while the drawn body's footfalls come from its own root measurement: ball touches and drawn feet are on
  different clocks.
- First-person match/training body: fpPose gets no `correct` (neck fix) and no armsIn (controller.js:597,
  training.js:395); life has both (me.js:185-186). Not visually verified.
- Camera actions: backswing, slide, chest, land are defined (matchcam.js:134-138) but camAction is only called with
  strike/pass/header/fouled (controller.js:666, 675; training.js:549). Sway adds roll 0.2 deg at full speed
  (matchcam.js:211, A1.2 sway).
- Fatigue on the body: view.js fatigue = (1 - B/60)*0.6, max 0.6 (299), so the 'tired' hands-on-thighs pose (> 0.7,
  moves.js 'tired') never triggers and is not requested anyway; match bodies get no st.fac (lean factor) unlike life.

## 4. Stamina (one model, several pools)

- One model: stamina.js. Pools: life LOCO.st (move.js:121, never saved, cap re-read every 1 s), each sim agent's a.st
  (agent.js:43, created per match and per training item, cap from match energy every 60 steps sim.js:490), the controller's
  pre-match own walk FS.ownSt (controller.js:254, stepped with stamina hard-coded 50 at 486). Breath never carries from
  life into a match or between training items.
- Drain: sprint 9*ks/s, ks = 1.25 - 0.5 stamina/100 (stamina.js:22, 33); run over 5 m/s 1.2*ks; a sprint held under run
  speed counts as sprint once B < 35 (68-75, 84); braking is not running in the sim (sim.js:422). Actions: shot 3, slide 6,
  jump 3, tackle 2, pass 0.5 (stamina.js:27; actions.js:263, 527, 572, 590). Recovery after 0.5 s: stand 10, walk 8, jog
  4.5 per s x (0.7 + 0.6 stamina/100)(0.75 + 0.25 eF) (25, 92-97). Cap from energy/fatigue (43-48).
- Measured (stamnum.mjs): full sprint to empty 9.83 / 11.12 / 14.73 s at stamina 24/50/99; recover to 35 standing 3.5 s,
  walking 4.4 s, jogging 7.8 s (to 100: 10.0/12.5/22.2 s); repeated 3 s sprint + 4 s walk never below 73.
- Fatigue effects (stamFactors 132-144): sprint top = (jog + (sprint - jog)(0.45 + 0.55 bF))(0.92 + 0.08 eF): pace 50
  8.0 m/s fresh, 7.09 (89%) at B 20, 6.15 (77%) at B 10, 5.69 (71%) at B 0; acceleration x0.75 at B 0; lateral turn
  x0.88; walk and jog unaffected unless above the tired sprint. Also shot speed, strike quality (-0.25(1 - bF)), strike
  deviation, first touch, dribble touch, FP reticle sway (actions.js:180-185, 210, 283, 334, 485; control.js:252).

## 5. Mover (working, verified)

FOOTBALL pace/accel/drib 50: walk 1.5, jog 3.8, run 5.6, sprint 8.0, a0 7.25, brake 7.5, plant 9. 0 to 95% sprint 2.50 s;
jog 0.63 s; sprint stop 1.07 s / 4.20 m; cut 45/90/135/180 deg at sprint: loss 19/49/64/84%, back to 95% at
1.10/2.18/2.73/3.07 s; sprint turn rate 0.94 rad/s (radius 8.53 m); standing face rate 12 rad/s. LIFE: walk 1.7, run 5.2,
sprint 7.6 building over 1.1 s, turn 8.2 rad/s walking.

## 6. Height scaling

- Body: look.height (about 0.92-1.08) is a uniform group scale (human.js:1172-1175); gait step lengths, hip budgets and
  lifts scale with h.scale. Life eye = 1.68 x scale (me.js:91). Life collision radius fixed R = 0.26 (collide.js:20).
  Mover speeds do not scale with height.
- Match sim: bridge.js player records carry no scale (86-91, 101-103), so every career-match agent is scale 1 (capsules,
  reach, header contact 1.66 x scale + 0.06, agent.js:79-90, actions.js:611, touch.js:81/304), and the match eye is
  1.68 x me.scale = 1.68 (controller.js:574), while the drawn bodies use their look height. Training items do pass scale
  (acts.js:378 ME.scale for you, training.js:214-218 the borrowed bodies'). So in career matches collisions, contact
  points and eye height do not follow the drawn height; in training they do.
- Tall body (1.07) walk stop: a planted foot slipped 17 mm (gait's own slip counter), cadence +16% over the table.
- No admin/height control exists yet.

## 7. Missing animations (precise)

Dribble touch (foot to ball), shielding (no C-hold shield in control.js, where C is the shoulder check; AI 'shield' state
not shown; 'upper:shield' registered moves.js:1623, unused), jockey stance on match bodies, stagger after a lost duel
(mover stagger only), get-up after being fouled or landing on the ground (a.state 'ground' actions.js:604, 794; 'getup'
registered, unused), tired idle, keeper catch/collect/punch/tip without a dive, keeper lateral shuffle gait, block tackle,
left-foot tackles, IK to the real tackle contact point, feints/skill moves/turns with the ball (none in the codebase),
collision/shoulder-barge reactions, landing camera kick, hard-stop plant for match bodies.

## 8. Notes on scope and side effects

- Findings are against the committed HEAD snapshot. /home/user/LegendRising has uncommitted edits (not mine) to gait.js,
  human.js, moves.js and view.js (P3a fix round 2): gaitPlace now carries the drawn knee bend and eases the posture in
  over 0.15 s after a clip, but still takes the stale G.rootX (gait.js:105 unchanged), so the clip-exit velocity spike
  would remain. Not tested on the working tree.
- Running qa/unit/mover.mjs and gaitcore.mjs wrote qa/out/unit-mover.json and unit-gaitcore.json into the snapshot; I
  removed those two files. A qa/out/unit-stamina.json that appeared afterwards was left alone (not created by my runs as
  far as I can tell).
- Not verified: receive/strike contact alignment inside a live match, keeper dives in a match, the FP neck intrusion in
  matches (code-level only), the life profile in town (all life-profile numbers come from the mover+body harness and the
  FOOTBALL-profile in-game camera run).
