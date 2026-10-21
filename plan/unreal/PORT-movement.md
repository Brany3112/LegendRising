# PORT-movement: player movement, controls and close control, from the browser game to Unreal Engine 5.8

## Sources

| Branch | Commit | Files read |
|---|---|---|
| `bcs/controls` (new controls, automatic close control) | `c824ef1` | `js/life/mover.js`, `js/life/stamina.js`, `js/life/gaitcore.js`, `js/life/football/control.js`, `js/life/football/actions.js`, `js/life/football/sim.js`, `js/life/football/tune.js`, `js/life/football/matchcam.js`, `plan/notes/bcs-controls.md` |
| `bcs/integ` (the FC 27 carry and the shot) | `41c4cd0` | `js/life/gaitcore.js` (with CARRY), `js/life/football/actions.js` (carryPlan, carryFoot, carryKick, dribbleFoot, ctlTouch), `js/life/football/sim.js` (agentStep, carrying), `js/life/football/touch.js`, `js/life/football/ball.js` (roll closed forms), `js/life/gait.js` (touchLanding numbers), `plan/notes/fc27-carry.md`, `plan/notes/fc27-spec.md` §2–3 |

- `mover.js` is identical on both branches.
- `gaitcore.js` on `bcs/integ` is `bcs/controls` plus the CARRY table. With no ball (carry weight 0) the two give the
  same numbers.
- Paths are under `LegendRising/` in the repository, except `plan/notes/`, which is at the repository root.
- Nothing in the repository or on any branch was changed. The golden numbers were computed from read-only detached
  worktrees.

Two things in the brief did not match the code:

- **The wish knobs** are named `BCS.CURVE_K` / `CURVE_MIN` / `CURVE_MAX` / `SNAP` / `STAND_V` in control.js (there is
  no `WISH_RATE`).
- **The double-Shift helper** called `doubleTap` is a QA helper (`qa/tr4b-lib`). The game's rule is control.js
  `KNOCK_TAP` (0.3 s).

## Files

```
unreal-port/movement/
  Source/LegendRising/Player/
    LRMoveMath.h                 shared maths for the cores (wrapA, yawOf, dirOf, smoothstep), plain C++
    LRGaitTables.h/.cpp          gaitcore.js: WALK / RUN / CARRY tables, carryW, stepLen, cadence, duty, stride, swing,
                                 the gait clock (phaseAdvance, swingProgress, time to a foot's next footfall), plain C++
    LRMoverCore.h/.cpp           mover.js moverStep and moverParams (football), stamina.js, the BCS control layer
                                 (control.js "where you go"), and FBodySim (sim.js agentStep's order), plain C++
    LRCloseControlCore.h/.cpp    actions.js keepStep (AUTO) + ctlTouch + knockOn + the carry (carryOn/Plan/Foot/Kick,
                                 bodyAt, ballAt, footLat), the dribbleFoot gate, sim.js carrying(), plain C++
    LRPlayerUnits.h              the sim <-> Unreal conversion (positions, velocities, yaw, spin)
    LRPlayerTypes.h              Blueprint enums and structs (ELRFoot, ELRFootPart, FLRPlannedTouch, FLRTouchEvent, ...)
    LRBallInterface.h            ILRBallInterface: GetLocation / GetVelocity / Kick(Velocity, Spin) (+ optional extras)
    LRMovementComponent.h/.cpp   ULRMovementComponent : UCharacterMovementComponent (fixed 60 Hz steps, CalcVelocity and
                                 PhysicsRotation replaced, footfall events)
    LRCloseControlComponent.h/.cpp  ULRCloseControlComponent : UActorComponent (OnTouch, planned touch, ball interface)
    LRPlayerCharacter.h/.cpp     ALRPlayerCharacter : ACharacter (spring-arm camera, Enhanced Input, per-step controls)
  Source/LegendRising/Tests/
    LRMovementTests.cpp          7 UE Automation tests, golden numbers from the JS
  Tools/golden/
    golden.mjs, carrysim.mjs     the Node scripts that produced the golden numbers
  CONTENT-SETUP-movement.md      Enhanced Input assets, the Blueprint, the animation plan (Motion Matching, sync markers,
                                 foot IK, notifies)
  PORT-movement.md               this file
```

## The frame and the units

The cores (`LRMove` namespace) keep the game's frame, so they read line for line like the JS and the golden numbers
apply unchanged:

- metres, seconds and radians;
- y is up and the ground is (x, z);
- **yaw 0 faces −Z, and a positive yaw turns left**;
- facing = (−sin yaw, −cos yaw), and the right-hand side of a facing f is (−f.z, f.x).

`LRPlayerUnits.h` is the only place where the two frames meet:

| | Sim → Unreal |
|---|---|
| position, velocity | `UE.X = −z·100`, `UE.Y = x·100`, `UE.Z = y·100` (cm, cm/s) |
| yaw | `UE yaw (deg) = −degrees(sim yaw)` (sim +90° faces −X, the left, which is UE −Y, yaw −90°) |
| spin (rad/s) | `w_UE = (w.z, −w.x, −w.y)`. The axis swap is a reflection (determinant −1) and spin is a pseudovector, so it also changes sign. With this, a ball rolling without slipping obeys v = w × (R·up) in both frames. |
| ball height | the ball's centre over the grass: `(BallZ − (actor Z − capsule half height)) / 100`. A ball at rest is 0.11 m. |

## How the pieces run (sim.js agentStep's order)

`ULRMovementComponent::TickComponent` accumulates frame time and runs fixed steps of `1/FixedStepHz`, 60 Hz by
default, as the game does. A hitch longer than `MaxCatchUpSeconds` (0.25 s) is dropped. Each step runs:

1. `OnPreSimStep`:
   - The character fills the per-step control flags, as control.js `controlStep` does: charges counted in steps, the
     shield, aim holds, receiving, jockey, the knock request.
   - Close control reads the ball, once per frame from the interface. Between two steps of the same frame it rolls its
     own copy on with the closed-form roll.
   - Close control sets the gait clock's carry target (`carrying()`).
2. `FBodySim::Advance`, in this order:
   - the control layer builds the intent (control.js "where you go", with bcsPrm's overlay);
   - `MoverStep` (mover.js `moverStep`);
   - stamina (`stamStep`, then `stamFactors`);
   - `gaitModeStep`;
   - the carry weight eased by `CARRY_EASE_K`;
   - `phaseAdvance` by the distance moved, which gives the footfalls.
3. For each footfall: `OnFootfallNative`, then close control's `OnFootfall` (actions.js `dribbleFoot` → `carryFoot`),
   then the Blueprint `OnFootfall`.
4. `OnPostSimStep`: close control's `KeepStep` (actions.js `keepStep`).
5. `EndStep`: `ms.t += h`.

The mover's velocity then goes to the CharacterMovementComponent:

- `CalcVelocity` is replaced on the ground. The capsule sweep, step-up and floor checks stay the engine's.
- `PhysicsRotation` is replaced, so the facing is the mover's.
- Before the next frame's steps, the capsule's real position is read back. If it moved clearly less than asked
  (under 95%), the mover's speed and heading follow the real move. This is the role of mover.js's `collide`: "the body
  never goes anywhere collide did not answer ... never faster than before".

## Constants and rules ported

### The mover (`LRMoverCore`, from `mover.js`)

| Constant / rule | Value | JS source |
|---|---|---|
| `SNAP_V`: below this speed the heading takes the wish at once | 0.05 m/s | mover.js:31 |
| `MOVE.ACC_TOP`, `A0_MUL`, `SPEED_MUL` (U28 part B) | 1.35, 1.1, 1.05 | mover.js:62 |
| `accelMul(acc)` | ≥50: 1 + 0.35·(a−50)/49; 40..50: 1 − 0.02·(50−a); <40: 0.8 − 0.018·(40−a); ≥0.55 | mover.js:63 |
| skills: missing → 50; clamp | 1..110; sprintSpeed else pace; acceleration else pace; agility else (acc+drib)/2 | mover.js:67–70 |
| walk | 1.5 m/s | mover.js:92 |
| jog | (3.4 + 0.008·pace)·1.05 (3.99 at 50) | mover.js:92 |
| run | (5.0 + 0.012·pace)·1.05 (5.88 at 50) | mover.js:92 |
| sprint | max(5.8 + 0.012p, 6.6 + 0.028p − 0.052·max(0, 50−p))·(grip 1.03)·1.05 (8.4 at 50) | mover.js:90 |
| backpedal / strafe caps (facing held) | 3.2 / 4.0 m/s, for an angle >120° / >60° off the held facing | mover.js:93, 161–164 |
| a0 | (6.0 + 0.025·pace)·accelMul·1.1 (7.975 at 50) | mover.js:94 |
| brake / plant | 7.5 / 9·clamp(1 − 0.004(agility−50), 0.8, 1.15) m/s² | mover.js:94 |
| aLat, wMax | 7.5 + 0.05(agility−50); 9·(0.85 + 0.003·agility) rad/s | mover.js:94 |
| sprint cone (facing held) | 35°: a sprint asked more than 35° off a held facing is a run | mover.js:95, 149 |
| cut rule | above cutMin **3 m/s**, a heading error over **35°** plants: target × max(cutFloor·turn, cos θ), braking at the plant rate | mover.js:96, 182–192 |
| cutFloor | clamp(0.3 + 0.002(agility−50), 0.2, 0.42) | mover.js:96 |
| pivot | below 3 m/s, a wish more than 90° off the heading: target 0 at the plant rate (stop, then go) | mover.js:189–191 |
| acceleration | v → vmax(1 − s^5), s^0.2 = s0^0.2 − 0.2·k·h, k = a0·accel/vmax, integrated exactly over the step | mover.js:194–216 |
| heading turn | w = min(wMax, aLat·turn / max(v, 0.5)); from (almost) standing the heading takes the wish at once | mover.js:225–235 |
| facing | the held facing, else the heading while moving, at faceRate (12 rad/s) | mover.js:237–246 |
| turn first (third person) | from a stand, target × clamp((cos(wish − facing) − 0.5)/0.5, 0, 1), and the facing turns at turnFirstRate | mover.js:170–173, 244 |
| stagger | speed capped at 2.0 m/s for 0.35 s (the caller sets `M.Stagger`) | mover.js:174–180 |
| `sprintSpeed` (tired) | (jog + (sprint − jog)·fac.speed)·fac.eSpeed | mover.js:110 |
| `gaitSpeed` | min(gait's speed, tired sprint) | mover.js:113 |

### Stamina (`LRMoverCore`, from `stamina.js`)

| Constant / rule | Value | JS source |
|---|---|---|
| `STAM` | sprint drain 9/s·ks, run drain 1.2/s·ks above 5 m/s; RUN_V 5.0, JOG_V 2.3, WALK_V 0.3; recovery stand 6, walk 5, jog 2.6 /s; DELAY 0.5 s; BF_FULL 35; SPRINT_TAU 30 s | stamina.js:23–36 |
| `ksOf` | max(0.45, 1.43 − 0.0086·stamina) | stamina.js:38 |
| `effF` | 0.6 + 0.4·sstep(0, 60, energy) | stamina.js:40 |
| `stamCap` | 100·min(0.6 + 0.4·sstep(10, 60, e), 0.86 + 0.14·t·√t)·(1 − 0.3·sstep(50, 100, fatigue)) | stamina.js:48–53 |
| `effortOf` | sprint / sprint-run / sprint-jog / run / jog / walk / stand | stamina.js:74–81 |
| `stamStep` | drain, recovery after DELAY at REC·(0.7 + 0.6·s/100)·(0.75 + 0.25·eF); a sprint held under the run speed counts as a sprint once breath < 35 | stamina.js:85–112 |
| `stamFactors` | speed 0.45 + 0.55bF, eSpeed 0.92 + 0.08eF, accel 0.75 + 0.25bF, turn 0.88 + 0.12bF, aim, power, touch, lean | stamina.js:183–196 |
| braking is not running | effort read at min(v, RUN_V − 0.01) while acc < −1 | sim.js:536 (bcs/integ) |

### The controls (`FControlLayer` in `LRMoverCore`, and `ALRPlayerCharacter`, from `control.js` on bcs/controls)

| Constant / rule | Value | JS source |
|---|---|---|
| keys relative to the camera | W away, S towards, A left, D right: kx = (r·cos − f·sin)/len, kz = (−r·sin − f·cos)/len with the camera's yaw | control.js:944–947 |
| the wish (`CTRL.wish`) | turns at clamp(CURVE_K·aLat·turn / max(v, 0.5), CURVE_MIN, CURVE_MAX) | control.js:808–821, BCS 189 |
| `CURVE_K`, `CURVE_MIN`, `CURVE_MAX` | 5, 4, 14 rad/s | control.js:189 |
| `SNAP` | 120°: a bigger change (a reversal) goes to the mover as it is (plant/pivot) | control.js:189 |
| `STAND_V` | 1.2 m/s: below it every change goes as it is | control.js:189 |
| bcsPrm overlay, third person | turnFirst on, turnFirstRate **13**, faceRate **12**. First person: turnFirst off, faceRate 12 | control.js:834–838 |
| `AIM_NEAR` | 3 m: a charge holds the facing (the aim = the camera's way) with the ball yours, within 3 m, or coming to you | control.js:958–960 |
| receiving | free ball, nobody's, ≤1.2 m high, ≥0.3 m away, closing ≥ **RECV_V 2 m/s**, arriving within **RECV_T 0.7 s**, from no more than **RECV_ANG 110°** off the facing: face it | control.js:823–831 |
| facing held only for | jockey, shield (engine), aim hold (charge/strike/fake/flick), receiving; otherwise free (face = null) | control.js:955–967 |
| gait | X toggles walk; Shift (not shielding) sprint; else jog | control.js:398, 970 |
| the ladder (`RUN_AFTER`) | jog → run after runAfter = clamp(0.6 − 0.3·(acc − 50)/40, 0.2, 0.8) s of keys held, any direction in third person (forward only in first); not while a pass is coming unless already running | control.js:167, 976–982 |
| close-control sprint cap | k·sprintSpeed, k = clamp(0.85 + 0.1·(dribbling − 50)/40, 0.8, 0.97) | control.js:988 |
| jockey | RMB held defending: face the man on the ball (else the view), strafe, cap **3.2 m/s**, sprint → run | control.js:995–1002, CN.JOCKEY_V 230 |
| shield | C held, ball yours or loose within **2.2 m** and nobody's; the engine caps at **0.6·jog** (tune SH_SPEED), no run/sprint, back to the defender within **2.0 m** | control.js:919–923, actions.js shieldStep 1014 (bcs/controls), tune.js:78 |
| shot keys | while a shot is held, A/D do not move you; W pressed while a shot is held from a stand moves you only after **0.25 s**; a shot let go under **1.5 m/s** is struck without a step on | control.js:935–943, SHOT_KEYS 162 |
| fake | S pressed while a shot is held drops the shot and asks for the fake (`OnFakeRequested`) | control.js:394–396 |
| Shift twice | two presses within **KNOCK_TAP 0.3 s** (real time) → knock request; the completing press is used up; consumed every step, so it is dropped if the ball is not yours | control.js:196, 401, 989–990 |
| V | does nothing (the shoulder check was removed) | bcs-controls.md §2 |
| look | 0.0021 rad a pixel × sensitivity (0.1203°); third-person pitch −1.1..0.7 rad | control.js:437–441, matchcam.js:288 |
| camera | TP.BACK 4 m back along the look, TP.UP 1.5 m above it, fov 78 | matchcam.js:288, control.js SET_DEF |
| charges | shot p = 1 − (1 − min(1, t/0.85))²; pass p = min(1, t/0.8); flick p = t/flickFull, flickFull = (0.5/1.5)/flickRate(ctrl), flickRate 0.3@0, 0.6@33, 1.5@55, 3@99, ≤3.5 | control.js:116–123, 228, 864–868 |

### The gait clock (`LRGaitTables`, from `gaitcore.js` on bcs/integ, and `sim.js`)

| Constant / rule | Value | JS source |
|---|---|---|
| WALK table | 7 rows, 0.5..2.3 m/s, steps 0.357..1.030 m, duty 0.64..0.57 | gaitcore.js:17 |
| RUN table | 8 rows, 2.4..9.0 m/s, steps 0.96..2.647 m, duty 0.406..0.189 | gaitcore.js:19 |
| **CARRY** table | 2.4/330/0.44/0.46, 3.6/340/0.64/0.45, 4.5/360/0.75/0.44, 5.5/410/0.80/0.42, 6.5/450/0.87/0.40, 7.6/470/0.97/0.36 | gaitcore.js:27 |
| `CARRY_K` and `carryW` | K 1; fades in 1.2→2.4 m/s, out 7.6→9.5 m/s (smoothstep); × carry weight | gaitcore.js:33–37 |
| `WALK_REACH` | 0.92 m (a faster walk keeps this step and raises the cadence) | gaitcore.js:45 |
| walk ↔ run mode | run above **2.30** held **0.15 s**, walk below **2.00** | gaitcore.js:47, 73–81 |
| stepLen / cadence / duty / stride / swing | as gaitcore.js, with the carry blend; swing clamped to [0.22 → 0.13 carrying, 0.45] s | gaitcore.js:90–115 |
| phase convention | left down at phase 0, right at 0.5; phase advanced by distance / (2·step) | gaitcore.js:8–10, 153–208 |
| `MAX_STRIDES` | 4 (a bigger jump is a teleport: no footfalls) | gaitcore.js:138 |
| swingProgress | (local − duty)/(1 − duty), or on the ground | gaitcore.js:211 |
| carry weight ease | `CARRY_EASE_K` 0.10516 per 60 Hz step (τ 0.15 s; any other step: 1 − e^(−h/0.15)) | sim.js:560 |
| carrying() | in close control, or the ball his, free, live, low (≤0.5 m), within 2 m, nothing of his under way but a fake | sim.js:561–568 |
| strideOf / sideT | 2·stepLen(v, mode, scale, ck)/max(v, 0.3); time to a foot's next footfall from the phase | actions.js:1108–1116 (bcs/integ) |

### Close control (`LRCloseControlCore`, from `actions.js`)

| Constant / rule | Value | JS source |
|---|---|---|
| `TAKE` | REACH 1.2, MAX_Y 0.5 | actions.js:890 (controls) |
| `AUTO` | REACH 1.2 m, OWN_T 1 s, FIRST_T 0.2 s, RUN_K 0.9 | actions.js:891 (controls) |
| `STRUCK` (own strikes) | shot, pass, through, cross, lob, clear, roll, punt, header, throw, kick | actions.js:893 (controls) |
| automatic entry | the player's controls on, not the AI; not chasing; live; the ball his by the race, free, < 0.5 m high, within 1.2 m; nothing of his under way; not his own strike within 1 s (remembered in `ownT`); not within 0.2 s of his own first touch → gathering touch (`ctlTouch(force)`) and carryPlan | actions.js:899–946 (controls), 147–155 (integ for the carryPlan call) |
| exits | the AI stands in ('ai'); play stopped ('stop'); an action other than a header or a fake ('kick' etc. → `Action`); not his ('lost'); not free, > 0.8 m high or > 1.25 m away ('reach'); the knock-on ('knock'); the flick ('flick') | actions.js:908–914, 830 (controls) |
| the knock-on | on request, with the ball his or in close control, live, within **KNOCK.REACH 1.8 m**: off ('knock'), chase on; ball speed max(√(2·dec·9), v + 4, sprint + 2.5) along the way | actions.js:895, 917–920, 984–993 (controls) |
| the chase hold-off | after a knock-on or a flick: out once the ball is > 1.2 m away or > 0.5 m high (`ctlOut`); the chase ends when play stops or another body touches it or has it, or, once out, when Shift is let go (gait ≠ sprint) or speed < 0.9 × run | actions.js:927–931 (controls) |
| the shield | close control holds on but leaves the ball to the shield's touches | actions.js:944–945 (controls) |
| `CTL` | LEAD 0.3, LV 0.05, LMAX 0.5, SIDE 0.35, LAT 0.1, REACH 1.25, TOL 0.12, DT 0.18 (halved turning), T 0.3, TURN 25°, SPIN 3; **STAND 0.22** (FC27) | actions.js:1018–1020 (integ) |
| ctlTouch (the spot) | the spot in front, leaning the way you go, LAT to the strong side, STAND standing still; a touch if the ball would be > TOL off it in T; speed min(D/T + 0.5·dec·T, 14); a turn plays the side the turn needs (inside/outside) with side spin ±3 | actions.js:1260–1296 (integ) |
| `CARRY` | V_FOOT 2.0, FWD 0.5 (cos), CUT 100°, **LEAD 0.56**, **LAT 0.1**, AHEAD 0.1, RUN_N 2, RUN_TOL 0.03, OVERRUN 0.3, STOP_V 2.0, MAX_V 14, XLAT 0.05, BACK 0.1, FACE 0.045, BEHIND 0.15, WIDE 0.85 | actions.js:1091–1092 (integ) |
| carryOn | in close control, not a fake; keys within FWD of the facing at ≥ 2 m/s and not a cut back past 100° from the last touch; or no keys at ≥ 2 m/s (a stop) | actions.js:1097–1105 (integ) |
| carryPlan | strong vs weak foot at each foot's next strike; the stop's sole on the next foot down; the weak foot for weak-side / overrun / the strong foot crossing; the strong foot otherwise, touching unless the ball is still ≥ AHEAD past the spot; at a sprint, only once back within RUN_TOL | actions.js:1165–1202 (integ) |
| planSet | the planned footfall number n + (same side ? 2 : 1) | actions.js:1203–1206 (integ) |
| carryFoot | on the planned foot's footfall, the touch if planned to touch; then plan the next | actions.js:1208–1218 (integ) |
| carryKick | ball to LEAD ahead of the pelvis + LAT strong side where the body will be a stride on (RUN_N at a sprint, toe only); speed vm + 0.5·(dec + 0.0135·vm²)·T; stop: rolled to rest STAND in front of where the body stops (v²/2·brake) | actions.js:1220–1258 (integ) |
| inFront / footLat | as the JS | actions.js:1156–1164 (integ) |
| bodyAt | four sub-steps towards the mover's target at a0·(1 − v/vmax) or the brake | actions.js:1126–1139 (integ) |
| ballAt and the roll | ball.js rollSpeedAt / rollDistance, dv/dt = −(rollDecel + 0.0135·v²), rollDecel 1.1 | actions.js:1117–1124 (integ), ball.js:1006, 1047 |
| dribbleFoot gate | ball his, free (and live); not while stepping in, nor from the step a kick or flick begins in close control; in close control → carryFoot | actions.js:776–790 (integ) |
| `TOUCH.WEAK_SIDE` | 0.25 m | touch.js:55 |
| the ball's kick spin | {kz/R, wy, −kx/R}, R 0.11: rolling, with a turn's side spin | actions.js (ballKick calls) |

### Animation targets (data only, from `gait.js` on bcs/integ, used by `GetNextPlannedTouch` and the content notes)

TOE_BACK 0.105, FACE_BACK 0.085, TOUCH_ROLL 0.03, TOUCH_YAW 0.6 rad, TRACK_U [0.38, 0.62], TRACK_IN 0.1 s (gait.js:70);
TOUCH_SEP 0.08, PASS_SEP 0.12, PASS_W [0.15, 0.3], TOUCH_IN 0.25 (gait.js:80); CARRY_BOB 0.7, CARRY_HIPS 0.075,
CARRY_LIFT [0.11, 0.01], CARRY_LEAN 0.15, CARRY_BURST 0.45, CARRY_ARMS [0.36, 1.35, 0.85], CARRY_HEAD [0.42, 0.25,
0.12], CARRY_HEAD_V [5, 6.5] (gait.js:60).

## Combining the two branches (close control)

Neither branch has both the automatic close control and the carry. This port joins them as follows:

- **keepStep** is bcs/controls' version: the AUTO entry, the chase, the own-strike memory, the shield leaving the ball
  alone, and the `'ai'` end.
  - Two calls are added from bcs/integ: `carryPlan` after the gathering touch, and the carry block (`carryOn` → plan
    every 6 steps, no spot touch while a plan is on) before the spot's touch.
  - bcs/integ's F-press window (`TAKE.WIN`, `a.takeT`) is not used. Entry is automatic, as on bcs/controls; F no
    longer takes the ball there.
- **ctlTouch** is bcs/integ's version: the ball at rest `CTL.STAND` 0.22 m ahead when standing still. bcs/controls'
  version has the same lead at every pace.
- **knockOn**, **AUTO**, **STRUCK** and the **flick end** are bcs/controls'. The carry, **dribbleFoot**'s close-control
  path, **ballAt** and **bodyAt** are bcs/integ's.
- The carry plan's planned touch is also used for the animation (`a.cplan` in the JS). It is exposed as
  `FLRPlannedTouch`.

bcs-controls.md §8 and fc27-carry.md "Open" describe the same merge points (`a.ctlOn`, `a.cplan`, `ctlAuto`). The
integration branch the team makes may differ in detail. If it does, re-run `Tools/golden/carrysim.mjs` on it and update
test 6.

## Not ported, and why

| What | Why |
|---|---|
| **The drawn gait** (gait.js: procedural legs, the swing curves, the hips' bob, the BCS leg-crossing guards `sideLand` / `sidePivot` / `sideHips` / `TOE_IN`, the carrier's drawn posture, `touchLanding` as code, view.js's drawn clock) | Unreal draws the legs with animation (Motion Matching, sync markers, foot IK). Their numbers that matter to animation are listed above and in CONTENT-SETUP-movement.md as targets; the leg-crossing guards become the IK's separation limits. |
| `gaitShape` (posture numbers for the drawn gait) | Animation only; the tables it reads are ported. |
| The life-world profile (`moverParams(..., "life")`: walkA, walkBrake, sprintBuild) | Football only was asked. The fields exist in `FMoverParams` and the code paths are ported, so a life profile is only a params function away. |
| World collision (`collide`, `boundsCollide`, `prm.bounds`) | The CharacterMovementComponent's capsule sweep is the collision. Its real move is fed back into the mover (speed and heading follow a slide). This is close to mover.js's slide rule, but not the same: mover.js prices the slide at the wish's push along it, while the CMC slides at its own projection. |
| `timeToPoint` / `timeToPointQ` (AI interception estimates) | The AI's; not needed for the player. A direct port later is straightforward (it only reads `FMoverParams` and `FMoverState`). |
| detmath.js (deterministic trig, the `Q` register forms) | Plain C++ maths is used; the golden tests compare within 1e-3 m and one 60 Hz step. Bit-exact replays across platforms would need detmath; the ball port has `LRDetMath`. |
| The race for the ball (actions.js `touchCheck`, `looseBall`, `contest`, `regain`: who the ball belongs to) | That is the match engine's. The interface's `GetPossessor()` is the hook. Without it, `bAssumeUnownedBallIsMine` treats an unowned ball as yours when you reach it, which is right for a lone training scene. |
| The AI's stride dribble (`dribbleWants`, `dribblePlan`, `dribbleKick`, touch.js `dribbleTouch`, `TOUCH.CADENCE`) | The player is always in automatic close control once the ball is his; the stride dribble is the AI's (and it needs touch.js's dribbleTouch). The dribbleFoot gate is ported. |
| The actions themselves (strike, pass, through ball, cross, flick launch, fake drag, tackle, slide, header, throw), the first touch (touch.js `firstTouch`, the settle on F), resolveAction, the meter, the reticle, gestures, the hint texts | Not movement. The character announces releases (`OnShootReleased`, `OnPassReleased`, `OnFlickReleased`, `OnTackleRequested`, `OnFakeRequested`) and close control takes `NotifyActionStarted/Finished`, `NotifyOwnStrike` and `NotifyFirstTouch`. |
| The shield's ball touches and its breath cost (actions.js shieldStep, stamina `stamShield`, ratings) | Part of the duel and shield package. The movement half (the speed cap, no sprint, facing away from the defender) is ported. |
| The dribble line bend (control.js: the run bent up to 15° towards a ball in front when not in close control) | Only applies with the ball yours and outside close control, which with automatic close control is the moment before the gather. Small; left out. |
| The restart context (control.js ctx 'restart': walk/jog near the ball) | Set-piece handling is the match engine's. |
| The header meeting run (control.js `CTRL.headMeet`) | Part of the header package. |
| First-person specifics (the reticle and sway) | Third person was asked. `bThirdPerson = false` still gives first person's movement (facing the view, strafe and backpedal caps, forward-only ladder). |
| Ctrl as a shield key in locked full screen, the modifier guard | Browser specifics. Mapping notes are in CONTENT-SETUP-movement.md. |
| Networking | The fixed-step state is not replicated or predicted (no `FSavedMove` extension). This is single player or a listen-server host only. |
| The camera's ease from the eyes, its height follow and kicks (matchcam.js) | A spring arm with the same distances; the camera polish is separate. |

## Golden numbers (tests)

`Tools/golden/golden.mjs` runs mover.js and gaitcore.js from read-only detached worktrees of `bcs/controls` and
`bcs/integ`. `Tools/golden/carrysim.mjs` runs bcs/integ's own simulation (sim.js) with qa/fc27-carry.mjs's drill
set-up. The body is the football profile with every skill 50, fresh, and the third-person overlay; the carry runs use
the drill's man (every skill 55, right footed).

| Test | Golden (JS) |
|---|---|
| Run from a stand (target 5.88) | 50% at 0.45 s, 90% at 0.95 s, 95% at 1.05 s, 99% at 1.1167 s, full at 1.1333 s; 3.2989 m/s at 0.5 s, 5.4689 at 1 s; 3.1566 m at 1 s, 9.0144 at 2 s, 14.8944 at 3 s |
| Sprint from a stand (target 8.4) | 90% at 1.95 s, 95% at 2.3833 s, 99% at 3.1833 s, full at 5.2167 s; 7.629 m/s at 2 s; 17.9426 m at 3 s |
| Ladder (W held, Acceleration 50) | the run from step 36 (0.6 s); 95% of the jog at 0.6 s; 90% of the run at 0.95 s |
| 180° at a run | after one step 5.73 m/s (plant 9, cut π); slowest 0.93 m/s at 0.55 s; heading round at 0.9667 s; back to 90% at 1.3833 s; overshoot 1.5939 m |
| 180° at 2.5 m/s | a pivot: slowest 0.1 m/s at 0.2667 s; heading round at 0.45 s; back to 90% at 0.5833 s; overshoot 0.2765 m |
| Quarter turn from a stand | yaw −0.2167 after one step (13 rad/s), no speed; sets off at 0.0667 s; facing round at 0.1333 s; 3.99 m/s and 2.6616 m at 1 s |
| Wish at a run, keys 90° right | wish −0.1063 after one step (37.5/5.88 rad/s), heading −0.0213; wish on the keys at 0.2333 s; 4.53 m/s with cut 1.2503 at 0.25 s; heading round at 0.95 s |
| Carry gait 3 / 4.5 / 6 m/s | steps 0.54 / 0.75 / 0.835 m; 333.3 / 360 / 431.1 a minute; strong foot every 0.36 / 0.3333 / 0.2783 s; 55 / 60 / 71 footfalls in 10 s |
| Close-control touch cadence (sim) | 3 m/s: 2.833 carry touches a second, every 0.3604 s, all right toe; 6 m/s: 3.667 a second, every 0.2778 s; sprint (7.372 m/s, the close-control cap): 1.833 a second, every 0.515 s (every second stride) |

**Checked here.** The plain C++ cores and the test file itself were compiled with g++ 13 and clang (C++17/20, `-Wall
-Wextra -Wshadow -Wconversion`, warning-free, and as a unity build) against a minimal stand-in for
`Misc/AutomationTest.h`. All seven tests pass: every golden number above is reproduced, the carry's touch cadence
matching the JS simulation's to the touch (17 / 22 / 11 touches in the 6 s window). The Unreal wrapper files
(components, character) were checked for syntax and names against a hand-written mock of the UE API only. They have
**not** been compiled against the real engine (there is no engine here).

## Uncertain

1. **Not compiled against UE 5.8.** These API points could need a small fix:
   - `EAutomationTestFlags` naming (5.5 moved the context mask);
   - `UEnhancedInputLocalPlayerSubsystem::HasMappingContext`;
   - `FInputActionValue::Get<FVector2D>`;
   - `UCharacterMovementComponent::CalcVelocity` / `PhysicsRotation` / `MIN_TICK_TIME`;
   - `UPROPERTY` doubles in Blueprint structs.

   These are all stable since 5.0 as far as I know.
2. **The CharacterMovementComponent hand-off.**
   - Replacing `CalcVelocity` on the ground relies on PhysWalking setting `Velocity` from the real displacement after
     the move; the read-back uses that.
   - Sub-stepped walking (`MaxSimulationTimeStep`) applies the same velocity in each sub-step, which is fine.
   - Ramps, step-ups and very low frame rates were not exercised.
3. **The combined close control.** No branch holds both the automatic rules and the carry. The merge (above) follows
   both branches' notes, but an integration branch may settle the details differently.
4. **The race / possession.** Without a possession system, `bAssumeUnownedBallIsMine` counts any unowned ball as
   yours, so in a match close control could take a loose ball an opponent was about to reach. Wire `GetPossessor()` to
   the match's race before using it with other players.
5. **The spin convention.** Close control hands the ball `w_UE = (w.z, −w.x, −w.y)` rad/s. The ball port
   (`unreal-port/ball`, being written alongside: it has its own `LRUnits.h`, which I did not see finished) must use the
   same mapping, or the touches' roll and side spin come out mirrored. The two units headers should be merged into one.
6. **`ILRBallInterface::GetVelocity`** has the same signature as `AActor::GetVelocity`. One override serves both and is
   what both callers want, but an implementer must override it, or a call on the concrete type is ambiguous.
7. **Time base.** The sim clock starts at the world time at BeginPlay and runs by fixed steps. `ContactWorldTime` and
   `OnTouch`'s time are on that clock, within one fixed step of `GetWorld()->GetTimeSeconds()`. A pause or time dilation
   moves them apart, because `DeltaTime` is dilated and the clock follows the steps run.
8. **Carry target timing.** `carrying()` is evaluated before the mover step here and after it in sim.js; the carry
   weight's ease therefore lags one 1/60 s step. This made no difference in the tests.
9. **Two frames' worth of steps.** At under 60 fps one frame runs two steps. The ball is rolled on by close control's
   own closed form between them, because the engine's physics has not moved it yet. That is exact for a rolling ball
   and approximate for a bouncing one.
10. **The animation plan's Pose Search API names** (trajectory types, the play rate and the current-asset queries)
    changed across 5.3–5.6. CONTENT-SETUP-movement.md describes them by function, so check the names against 5.8.
