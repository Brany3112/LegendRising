# PORT-ball: the ball and the strikes, from the browser game to Unreal Engine 5

This ports the football's ball physics and its striking (shot, shot meter, step-in timing, flick, knock-on) from the
browser game (`LegendRising/js/life/football/`) to UE 5 C++ (module `LegendRising`, API macro `LEGENDRISING_API`).

- **Source.** Branch `bcs/integ`, commit `41c4cd0`. `ball.js` and `strike.js` are identical on `bcs/integ` and
  `bcs/controls`. In `control.js` and `actions.js`, the ported functions (meterBand, shotGrade, passBand, flickRate,
  FLICK, flickFly, flickLaunch, knockOn, kickRequest, canStrike) are the same on both branches. The one difference is
  that `bcs/controls` has **no step-in** (`STEP_IN` does not occur in its actions.js), so the step-in and its timeline
  come from `bcs/integ`. That branch also holds `moves.js` (`SHOT`) and `plan/notes/fc27-shot.md`.
  Line numbers below refer to `bcs/integ`.
- **Accuracy.** The ball and strike cores match the JavaScript bit for bit. Every operation is in the JS order, and
  the game's own deterministic math (`detmath.js`) is ported too. This was checked outside the engine on 2175 numbers
  with both gcc 13 and clang 18 (see "Bit-exactness" below).

## Files

| File | What it is |
|---|---|
| `Source/LegendRising/Ball/LRDetMath.h/.cpp` | detmath.js: exp, log, pow, sin, cos, tan, atan, atan2, asin, acos, hypot, built from + - * / sqrt. Pure C++. |
| `Source/LegendRising/Ball/LRBallCore.h/.cpp` | ball.js and the rng.js generator: the **pure-function core** (`LRBall::Step`, `Kick`, `Predict`, `FlyTo`, the roll closed forms, `FPredCache`), sim frame, no Unreal types. |
| `Source/LegendRising/Ball/LRUnits.h` | The one sim to Unreal conversion (axes, cm, the sign of spin, yaw). |
| `Source/LegendRising/Ball/LRBallComponent.h/.cpp` | `ULRBallComponent`: the fixed 60 Hz step of the core from an accumulator (no Chaos), events, colliders, bodies, the path cache, and interpolated drawing with the mesh turned by the spin. |
| `Source/LegendRising/Ball/LRBall.h/.cpp` | `ALRBall`: static mesh (engine sphere scaled to radius 11 cm, no physics) plus `ULRBallComponent`. |
| `Source/LegendRising/Strike/LRStrikeSolver.h/.cpp` | strike.js (launchSpin, solveStrike as a resumable solve = presolve, deviation, sigmaOf, aimOf, planShot, shot speed) and the kick, flick, knock-on and step-in parts of actions.js. Pure C++. |
| `Source/LegendRising/Strike/LRShotMeter.h/.cpp` | control.js: meterBand, shotGrade, passBand, the charge curve, techniqueOf, flickRate/flickFull, curlSpin, and the shot release (`BuildShotRelease`). Pure C++. |
| `Source/LegendRising/Strike/LRStrikeComponent.h/.cpp` | `ULRStrikeComponent`: LMB charge and release, grade, the kick act with step-in steering, the five timing delegates, the MMB flick, the knock-on. |
| `Source/LegendRising/Tests/LRBallTests.cpp` | UE automation tests (`IMPLEMENT_SIMPLE_AUTOMATION_TEST`, group `LegendRising.*`) with 111 golden numbers from the JS. |
| `Tools/uemock/*` | A minimal stand-in for the UE headers the port uses, and a smoke driver (shot, flick, knock-on, stride adjust). Only for checking outside the engine; never add it to the build. |
| `Tools/golden/*` | The Node scripts that compute the goldens from the JS, the template the test file is generated from, and the standalone bit-exactness check (not part of the module; do not add to the build). |

Build: the module needs only `Core`, `CoreUObject` and `Engine` (`PublicDependencyModuleNames`). The core headers
include `<vector>`, `<string>` and `<functional>`, which compile fine in a UE module. Cross-folder includes use the
module-root form (`"Ball/LRBallCore.h"`), so no extra include paths are needed.

## Units and axes

| | Browser game (sim) | Unreal |
|---|---|---|
| length | metres | centimetres (x100) |
| up | +Y | +Z |
| forward (yaw 0) | -Z | +X |
| right of forward | +X | +Y |
| handedness | right-handed | left-handed |
| yaw | radians, 0 faces -Z, + turns **left** | degrees, 0 faces +X, + turns **right** |

`LRUnits.h`:

```
UE.X = -sim.Z * 100      UE.Y = sim.X * 100      UE.Z = sim.Y * 100          (positions, velocities)
UE.w = (sim.w.Z, -sim.w.X, -sim.w.Y)                                          (spin, rad/s, not scaled)
UE yaw (deg) = -sim yaw (rad) * 180/pi
```

The axis map keeps forward, right and up but has determinant -1, because it turns a right-handed frame into a
left-handed one. Angular velocity is a pseudovector, so it takes an extra minus sign. With that sign, `v = w x r`
holds in both frames. `FQuat(w.GetSafeNormal(), |w| dt)` therefore turns the drawn ball the right way, a backspun shot
lifts toward +Z, and a right foot's inside curl bends toward -Y (left). The `LegendRising.Ball.UnitConversion` test
checks all of this.

`ULRBallComponent::SimFrameToWorld` places the sim frame in the world. It may only rotate about Z and translate. By
default (`bOriginAtStart`) the origin is taken at BeginPlay: it is on the grass under the ball, with sim yaw 0 along
the actor's forward. Every Blueprint-facing value is in world units (cm, cm/s, rad/s).

## Bit-exactness: how it was checked, and what it needs

- `Tools/golden/run_check.sh <checkout of bcs/integ> <build dir>` builds the cores (`LRDetMath`, `LRBallCore`,
  `LRStrikeSolver`, `LRShotMeter`) with gcc and clang outside Unreal. It then prints every number of a set of scenarios
  as the hex bits of the double, prints the same scenarios from the JS in Node (`ball_trace.mjs`, `strike_trace.mjs`),
  and diffs the two. Result: **ball 1387 / 1387 and strike 788 / 788 identical**, with gcc 13 and clang 18.
- **Ball scenarios:** a roll; a spun shot with bounces; a knuckler; posts, bar, a board with its edge capsule, standing
  bodies, a diving-keeper capsule and a hand, with the seeded spread; prediction; fly-to; the roll closed forms; detmath
  over 21 arguments; the generator.
- **Strike scenarios:** 8 solves (normal, driven out of reach, chip, curl, ground pass, too far, point-blank, raised
  ball); 6 presolves checked flight by flight (yaw, elevation, flights, Jacobian) with warm-started solves; sigma and
  deviation for 5 contexts; 4 planShots with knuckles; the meter, grades and flick bar; flicks; the knock-on; the reach
  window and the step-in.
- Functions that actions.js does not export (flickFly, flickLaunch, flickStep, knockOn, stepInOf, stepInSpot) are taken
  from its source text and run with stubs for the match bookkeeping they touch (event log, chains, rules).
- **Requirements for bit-exactness.** (1) The ported detmath must be used, never `std::sin` and friends. (2) No fused
  multiply-add and no reassociation. Each core `.cpp` therefore opens with `#pragma float_control(precise, on, push)`
  plus `fp_contract(off)` (MSVC) or `clang fp contract(off)` (clang), and pops at the end, so unity builds are safe.
  Hypot is out of line so that no inline body is compiled under the including file's settings.
- Not compiled in the real engine (none is available here). The Unreal layer and the tests were compiled with
  `-Wall -Wextra -Wshadow` against a small mock of the UE API (Unreal promotes shadowing to an error). Run that way, the
  six automation tests pass, with **111 / 111 golden numbers bit-equal**. A component smoke run (charge 25 steps,
  release, step-in, flick, knock-on) behaved as described under "The step-in strike and its clock" below.

## The fixed step (integration order)

Each fixed step (h = 1/60 s, from `ULRBallComponent::TickComponent`'s accumulator, at most `MaxStepsPerFrame`)
follows `sim.js` `simStep` (lines 419-571):

1. `OnPreFixedStep(h, now, step)`: each `ULRStrikeComponent` reads its queued input, counts held buttons in steps
   (control.js 754, 760-762), starts actions and runs its act. A kick happens here (`LRBall::Kick`), followed by a
   path-cache refresh (actions.js `refreshPred`, called from `strikeContact`).
2. `World.T = now`, then `LRBall::Step(ball, world, h)` (ball.js `ballStep`, 345-390). Bodies and hands are the ones
   last set with `SetBodies` / `SetHands`.
3. The events are broadcast (`OnBallEvent`). The path cache is refreshed after a bounce, post, bar, board or body
   (sim.js 380, 392, 396), then every 6 steps while the ball flies with |w|1 > 2 and every 30 steps otherwise (sim.js
   490-491). Like the JS, a refresh is stamped with the step's start time (`predT = ms.t` before `ms.t += h`), and
   `FPredCache::At` reads with that same offset (actions.js `predAt`, 75-82).
4. `SimTime += h; StepIndex++` (sim.js 570).

Inside `LRBall::Step`, the order is ball.js's own:

- **Pending touches.** They are flushed as events.
- **Held ball.** It moves with its holder's velocity.
- **Sub-steps.** n = clamp(ceil(vb*h/0.12 - 1e-12), 1, 6), where vb = |v| + (G + AMAX)*h. Each sub-step (`subStepQ`,
  439-549) runs these parts:
  - **Floor clamp and contact.** Grounded if y <= R + 0.002 and vy <= 0.05; a ball moving into the floor faster than
    0.05 m/s bounces first.
  - **Accelerations at the sub-step's start.** Drag -KD*dragMul*|v|*v; gravity; in the air, Magnus KM*(w x v) capped
    at 9 m/s^2 plus the knuckle amp*sin(freq*t + phase) across the motion. On the ground, the grass deceleration
    rollDecel against v, and a stop inside the piece.
  - **Exact motion under constant acceleration.** p += (v + v')/2*t.
  - **Swept contacts, earliest first, at most 3 per sub-step.** The ground on the exact parabola, then capsules
    (posts, bar, board edges), boards, bodies (legs, torso and head, or one dive capsule, moved with their velocity),
    hands.
  - **The response.** Restitution, Coulomb friction turned into spin, the spread off bodies and boards. The ball moves
    1e-7 m off the surface and the sub-step re-splits if the ball came out faster.
  - **Spin.** Exp decay in the air (exp(-0.25 t)) and the knuckle clock, or the lock to rolling spin on the grass
    (rate 8/s).
  - **Rest.** A grounded free ball under 0.05 m/s stops.

## Constants and rules ported (with their JS source)

### ball.js

| Constant | Value | JS | C++ |
|---|---|---|---|
| R (radius) | 0.11 m | ball.js 34 | `LRBall::BALL::R`; `ALRBall::RadiusCm = 11` |
| G | 9.81 | 34 | `BALL::G` |
| KD (drag) | 0.0135 | 34 | `BALL::KD` |
| KM (Magnus) | 0.0055 | 34 | `BALL::KM` |
| AMAX (Magnus cap) | 9 m/s^2 | 34 | `BALL::AMAX` |
| SPIN_DECAY | 0.25 /s | 34 | `BALL::SPIN_DECAY` |
| E_MAX, E_MIN (ground restitution) | 0.62, 0.45 | 34 | `BALL::E_MAX/E_MIN` |
| MU (ground friction) | 0.4 | 35 | `BALL::MU` |
| ROLL_STOP | 0.05 m/s | 35 | `BALL::ROLL_STOP` |
| VMAX | 40 m/s | 35 | `BALL::VMAX` |
| SUB_TRAVEL | 0.12 m | 35 | `BALL::SUB_TRAVEL` |
| E_POST, MU_POST | 0.6, 0.15 | 35 | `BALL::E_POST/MU_POST` |
| E_BOARD, E_BODY | 0.5, 0.3 | 35 | `BALL::E_BOARD/E_BODY` |
| NET_K, NET_C, NET_T | 600, 25, 3 | 35-36 | declared, unused (nets not ported) |
| ROLL_VY (a bounce slower than this rolls) | 0.6 m/s | 40 | `BALL_X::ROLL_VY` |
| AIR_Y, AIR_VY | 0.002 m, 0.05 m/s | 41-42 | `BALL_X::AIR_Y/AIR_VY` |
| ROLL_SPIN (lock rate) | 8 /s | 43 | `BALL_X::ROLL_SPIN` |
| SPREAD (sigma off a body/board) | 8 deg | 46 | `BALL_X::SPREAD` |
| MU_BOARD, MU_BODY | 0.3, 0.3 | 47 | `BALL_X::MU_BOARD/MU_BODY` |
| GHOST_T (kicker's own body ignores the ball) | 0.25 s | 49 | `BALL_X::GHOST_T` |
| MAX_SUB, MAX_HITS, MAX_PIECES | 6, 3, 16 | 50 | `BALL_X::...` |
| BODY capsules | legs top 0.85 r 0.16, torso top 1.5 r 0.25, head y 1.66 r 0.12 (x height scale) | 51 | `BALL_X::BODY_*` |
| EDGE_R (board's rounded top edge) | 0.02 m | 52 | `BALL_X::EDGE_R` |
| INV_STICK | 1/3.5 (solid sphere) | 59 | `INV_STICK` |
| SPIN_K | 5/(2R) | 60 | `SPIN_K` |
| ball's default rollDecel | 1.1 m/s^2 | 67 | `CreateBall`, `ULRBallComponent::RollDecel` |

| Rule | JS | C++ |
|---|---|---|
| a touch: v capped at VMAX, dragMul = 1 - 0.0045*clamp(aero, 0, 99), knuckle armed, ball lifted to R | ballKick 82-103 | `LRBall::Kick` |
| holding and releasing | ballHold 108-123, ballRelease 126-138 | `LRBall::Hold`, `LRBall::Release` (core only) |
| capsule collider with a bounding box | capsule 184-189 | `LRBall::AddCapsule` |
| swept capsule (cylinder plus end spheres) | sweepCapsuleQ 241-279 | `SweepCapsule` |
| impulse response: restitution, Coulomb friction min(slip/3.5, mu*jn), dw = SPIN_K (dv x n) | respond 285-305 | `Respond` |
| the spread: truncated normal 8 deg about the vertical, kept if still separating | spread 309-315 | `Spread` |
| the step and its sub-step split | ballStep 345-390 | `LRBall::Step` |
| the sub-step | subStepQ 439-549 | `SubStep` |
| spin decay / rolling lock | spinAndClockQ 565-580 | `SpinAndClock` |
| ground on the parabola | groundHitQ 583-606 | `GroundHit` |
| posts, bar, board edges / boards / bodies / hands | 608-708 | `CapsHit`, `BoardsHit`, `BodiesHit`, `HandsHit` |
| response and events (post, bar, board, body: the deflector becomes last toucher) | resolve 733-755 | `Resolve` |
| a bounce: e = clamp(0.62 - 0.012(|vy| - 4), 0.45, 0.62), mu 0.4, rolls under 0.6 m/s, knuckle cleared | groundImpact 759-767 | `GroundImpact` |
| prediction world (posts and bar, no bodies, boards only with the fence) | predWorld 860-875 | `MakePredictionWorld` |
| path prediction (single-precision samples, as the Float32Array) | ballPredict 881-895 | `LRBall::Predict`, `FPredCache` |
| fly to a plane (the solver's flights) | ballFlyTo 981-1001 | `LRBall::FlyTo` |
| roll closed forms | 1006-1050 | `RollDistance`, `RollSpeedFor`, `RollTime`, `RollSpeedAt` |
| events queued and handed out after the step | emit, stepEnd 325-337 | `FWorld::Queue`, `StepEnd` |

### rng.js and detmath.js

| Item | JS | C++ |
|---|---|---|
| mulberry32 (zero seed becomes 0x9e3779b9) | rng.js 19-28 | `LRBall::FRng::Next` |
| Box-Muller with the cached second normal | rng.js 44-52 | `FRng::Gauss` |
| truncated normal (redraw beyond cap*sigma) | rng.js 56-62 | `FRng::TruncNormal` |
| 1/n! table, exp (Taylor to r^14 after ln2 reduction) | detmath.js 33-60 | `LRDetMath::Exp` |
| log (atanh series), pow (squaring for integers up to 64) | 63-110 | `Log`, `Pow` |
| sin, cos (Taylor on [-pi/4, pi/4], pi/2 split), tan | 114-188 | `Sin`, `Cos`, `Tan` |
| atan (two half-angle steps, series), atan2 (signs of zero), asin, acos | 192-246 | `Atan`, `Atan2`, `Asin`, `Acos` |
| hypot = sqrt of the sum of squares | 252-254 | `Hypot` |

### strike.js

| Constant | Value | JS line | C++ |
|---|---|---|---|
| LOW_MAX, LOW_TOP (Low contact) | 6 deg, topspin 15 rad/s | 29 | `STRIKE::LOW_MAX/LOW_TOP` |
| HIGH_MIN, HIGH_BACK (High contact) | 14 deg, backspin 20 rad/s | 30 | `STRIKE::HIGH_MIN/HIGH_BACK` |
| ELEV_MIN, ELEV_MAX | -30, 70 deg | 31 | `STRIKE::ELEV_MIN/MAX` |
| RANGE_EL | 40 deg | 32 | `STRIKE::RANGE_EL` |
| CURL_BASE, CURL_K | sidespin abs(curl)*(18 + 0.25 curve) | 33 | `STRIKE::CURL_BASE/CURL_K` |
| TOL, MISS_OK, ITERS | 0.01 m, 0.05 m, 4 | 34 | `STRIKE::TOL/MISS_OK/ITERS` |
| WARM_ITERS | 2 | 35 | `STRIKE::WARM_ITERS` |
| T_MAX | 6 s | 36 | `STRIKE::T_MAX` |
| AIM_Y0, AIM_Y1 | 0.11, 6.0 m | 37 | `STRIKE::AIM_Y0/AIM_Y1` |
| KNUCK W, V, P, A0, A1, F0, F1 | 4, 24, 0.72, 1.2, 2.6, 5, 9 | 38 | `STRIKE::KNUCK_*` |
| KV low, normal, high | 0.8, 0.8, 1.2 | 39 | `STRIKE::KV_*` |
| BALL_STATE still, rolling, bouncing, volley | 1, 1.1, 1.25, 1.5 | 40 | `STRIKE::BS_*` |
| SHOT_V PTS (power to m/s), HI, SPREAD | (0, 9) (33, 12.915) (55, 25.83) (99, 37.22); 0.26; 0.023 | 410 | `SHOT_V::*` |
| SHOT_ACC K, EXP, SIT | 0.026, 1.7095113, 0.012 | 423 | `SHOT_ACC::*` |

| Rule | JS | C++ |
|---|---|---|
| **Contact kinds.** -1 Low (driven: elevation at most 6 deg, topspin 15), 0 Normal (the lower solution), 1 High (chip/lofted: at least 14 deg, backspin 20). Curl > 0 curls toward the striking foot's inside; a left foot mirrors it. | launchSpin 53-61, solveGen 159-160 | `LRStrike::LaunchSpin`, `FStrikeSolve` |
| **Ground target.** From a grounded ball with contact <= 0, a rolling ball (elevation 0); only the yaw is solved. | solveGen 163-175 | `FStrikeSolve` (RollLoop) |
| **Newton.** On the real integrator, on yaw and elevation, finite differences 1e-3, steps clamped to 0.3 rad. The elevation is held at the contact's bound. A short ball gets more elevation toward 40 deg. The closest launch is kept (a short ball scores 1000 plus how far short). | solveGen 179-247 | `FStrikeSolve::StepFlight`, `Update`, `Keep` |
| **First guess.** Drag-aware flight time and spin-adjusted gravity; the curl's bend aimed off. | guess 88-102 | `FStrikeSolve` (Start phase) |
| **Presolve.** One flight per step; the warm start is (yaw, el, J). | presolve, presolveStep, presolveWarm 127-143 | `FStrikeSolve` (resumable), `Warm()` |
| **Deviation.** sigma, offsets ex = D s z1, ey = D s kv z2, a shot's speed factor 1 + 0.023 (2 clean - 1). | deviation 268-282, sigmaOf 287-309 | `Deviation`, `SigmaOf` |
| **The aim moved in the target plane.** | aimOf 313-323 | `AimOf` |
| **The knuckle and the quality.** | planShot 330-342 | `PlanShot` |
| **Shot speed.** Power curve, x1.04 with strike boots, x stamina. | 411-428 | `ShotVFull`, `ShotSpeed`, `CleanOf`, `AccSigma` |

### control.js (the meter, the grade, the flick bar)

| Constant | Value | JS line | C++ |
|---|---|---|---|
| CN.SHOT_FULL, OVERHIT, TAP | 0.85 s, 0.92, 0.18 s | 168 | `LRMeter::CN::*` |
| CN.PASS_FULL, PASS_MIN | 0.8 s, 4 m/s | 168 | `LRMeter::CN::*` |
| METER.SHOT_C0, C1, D0, D1 | band centre 0.55 at 8 m to 0.86 at 30 m | 211 | `METER::SHOT_*` |
| METER.SHOT_W, SHOT_WA, TECH_W, SHOT_MAX | width 0.12, +0.14 with assists, +0.04 Technique/99, top at 0.91 | 211 | `METER::*` |
| METER.GOLD, GOLD_MIN | gold = 35% of the band, at least 0.04 | 212 | `METER::GOLD/GOLD_MIN` |
| METER.GOOD_DEG, GOOD_DEG1 | good shot 1 + 1.5e degrees off the aim | 212 | `METER::GOOD_DEG*` |
| METER.SCUFF_DEG, SCUFF_DEG1, SCUFF_MIN, SCUFF_P | scuff 5 + 5e degrees off, at least 1.2 m, x0.75 power when under-hit | 212 | `METER::SCUFF_*` |
| METER.PASS_W0, PASS_W1, PASS_WA, SETTLE_LATCH, CONE_A | 0.10, 0.25, 0.6, 0.5, 0.8 | 213 | `METER::*` |
| AIM.OVER, LOW_Y, PLACED, CHIP, PLACED_MAX | 0.6 s, 0.6 m, 0.5, 0.72, 0.72 | 188-190 | `LRMeter::AIM::*` |
| CURL MAX, LO, POW | 80 rad/s at 99, none at 11, linear | 127 | `LRMeter::CURL::*` |
| SHOT_KEYS.T (keys held this recently shape the shot) | 0.25 s | 129 | `LRMeter::SHOT_KEYS_T` |
| KNOCK_TAP (Shift twice) | 0.3 s | 136 | `LRMeter::KNOCK_TAP` (the game's binding) |
| ASSIST_K on, low, off | 1, 0.5, 0 | 92 | `LRMeter::ASSIST_*`, `ULRStrikeComponent::AssistLevel` |
| FLICK_CHG BASE, PTS, MAX | 0.5/1.5 s; rate 0.3 at 0, 0.6 at 33, 1.5 at 55, 3 at 99; at most 3.5 | 105 | `LRMeter::FLICK_CHG::*` |

| Rule | JS | C++ |
|---|---|---|
| **Charge.** p = 1 - (1 - min(1, t/0.85))^2. pow(x, 2) is x*x, fdlibm's own special case. | 768, 1054 | `ChargeP` |
| **The band.** k = clamp((d - 8)/22, 0, 1); c = 0.55 + 0.31k; w = 0.12 + 0.14 ak + 0.04 tech/99; hi = min(0.91, c + w/2); lo = max(0.2, hi - w); gold = middle, max(0.04, 0.35(hi - lo)) wide. | meterBand 217-225 | `MeterBand` |
| **The grade.** Perfect in the gold; good in the band (e = distance to the gold over the side's width); scuff outside (e = miss/0.15); over = p > hi. | shotGrade 228-237 | `ShotGrade` |
| **A held pass's band.** | passBand 240-245 | `PassBand` |
| **Technique.** 0.4 aero + 0.3 curve + 0.3 ball control; 0 counts as 50. | techniqueOf 257 | `TechniqueOf` |
| **The flick bar.** Fill rate by Ball Control; full in BASE/rate seconds; let go at p = clamp(t/full, 0.05, 1). | flickRate, flickFull 106-112, flick 113-121, 771 | `FlickRate`, `FlickFull`, `FlickCharge`, `FlickP` |
| **Curl from A or D.** | curlSpin 128 | `CurlSpin` |
| **"Held recently."** Pressed or held within 0.25 s. | keyHeld 131, 754 | `ULRStrikeComponent::KeyRecent` |
| **Shot release: tap and charge.** A tap is placed; a full charge is power. | strike() shot branch 1052-1076 | `BuildShotRelease` |
| **Shot release: shape.** Lift chips; dip; low drive on goal under 0.6 m; A or D curl (W: half the curl, full speed). | strike() 1077-1102 | `BuildShotRelease` |
| **Shot release: over-hold.** Held past full, the aim rises. | strike() 1104 | `BuildShotRelease` |
| **Shot release: grade offsets.** The aim moves by the grade. | strike() 1105-1119 | `BuildShotRelease` |
| **Shot release: the request.** | strike() 1120-1133 | `BuildShotRelease` |
| **The meter's distance.** Measured with `Math.hypot`, which is V8's (normalised, Kahan-summed), not detmath's. | 1059 | `LRMeter::JsHypot` |
| **Approaching ball.** For a first-time flick. | approaching 1224-1227 | `ULRStrikeComponent::StartFlickAct` |

### actions.js (the kick, the step-in, the flick, the knock-on)

| Constant | Value | JS line | C++ |
|---|---|---|---|
| ACT.REACH0, REACH1, REACH_LAT | ball 0.45 (x0.6 = 0.27) to 0.90 m ahead, within 0.5 m across | 45 | `LRStrike::ACT::*` |
| ACT.TC_MAX, ADJUST, SCUFF_D | contact within 0.18 s; stride adjust at most 0.35 s; whiff beyond 1.3 m | 46 | `ACT::*` |
| ACT.FOLLOW | 0.28 s after a window strike's contact | 47 | `ACT::FOLLOW` |
| ACT.RHYTHM, CLEAN_PLANT | 0.12 / 0.06; a clean strike keeps at most 0.03 plant error | 59-61 | `ACT::RHYTHM_*`, `ACT::CLEAN_PLANT` |
| VOLLEY.WHIFF_H | 1.0 m (ball too high: whiff) | 135 | `ACT::WHIFF_H` |
| TOUCH.WEAK_SIDE | 0.25 m (touch.js 55) | - | `ACT::WEAK_SIDE` |
| STEP_IN.T | 0.30 to 0.35 s from the ask to the contact | 182 | `STEP_IN::T0/T1` |
| STEP_IN.PER | +0.07 s a metre of plant step (from 0.29) | 182 | `STEP_IN::PER` |
| STEP_IN.PLANT | support foot [0.33 across, -0.08 along] from the ball | 182 | `STEP_IN::PLANT_LAT/PLANT_ALONG` |
| STEP_IN.V_BALL, V_ROLL, V_BODY | 2.0, 3.2, 4.4 m/s eligibility | 182 | `STEP_IN::V_*` |
| STEP_IN.REACH, AHEAD, BACK, SIDE | 0.9, 0.1, 0.184, 0.28 m | 183 | `STEP_IN::*` |
| STEP_IN.TOL, VMAX, ON, KEEP, VON | 0.3 m, 2.3 m/s, 0.3 s, 0.9, 2.0 m/s | 183 | `STEP_IN::*` |
| STEP_IN.FOLLOW | the act ends 0.37 s after the contact | 183 | `STEP_IN::FOLLOW` |
| STEP_IN.TURN, TURN_BY, LAT_BY, LAT_V, PLANT_T, V_PLANT | 1.75 rad, 0.15 s, 0.12 s, 0.8, 0.2 s, 1.4 m/s | 183-184 | `STEP_IN::*` |
| STRIKE_ROOT.MIN | 0.3 m/s | 232 | `STRIKE_ROOT_MIN` |
| FLICK.TC, WAIT, REACH, DUR, SPIN | 0.2 s, 1.8 s, 0.85 m, 0.7 s, 12 rad/s | 924 | `LRStrike::FLICK::*` |
| FLICK.H_PTS, H_MAX, D_K, D_0, KEEPY_D | top 0.5/1.5/3/4.5 m at Strength 0/33/55/99, at most 5; lands 0.75 top + 0.5 m on; keepy-up 0.3 m | 925 | `FLICK::*` |
| KNOCK.D, MIN_V, OVER, REACH, LET | 9 m, +4 m/s, sprint + 2.5, 1.8 m, 0.8 s | 1021 | `LRStrike::KNOCK::*` |
| passSpeedFor / loftSpeedFor | rollSpeedFor(max(1, d), clamp(arrive, 6, 10)); clamp(sqrt(12.5 max(4, d))(1 + 0.005d), 9, 30) | 265, 268 | `PassSpeedFor`, `LoftSpeedFor` |

| Rule | JS | C++ |
|---|---|---|
| **Where the ball is, and the foot.** Ahead, across and distance; the weak foot beyond 0.25 m over. | relBall 124-128, footFor 115-121 | `RelBall`, `FootForLeft` |
| **The reach window.** tc = clamp(0.11 + 0.07 abs(ahead - 0.65)/0.25, 0.10, 0.18). | canStrike 138-150 | `CanStrike` |
| **Step-in eligibility and time.** Two passes with the predicted ball: tc = clamp(0.29 + 0.07*plant-step length, 0.30, 0.35). Ball ahead, aim within 1.75 rad, within reach. | stepInOf 188-211 | `StepInOf` |
| **The root's place at the contact.** 0.184 m behind the ball along the aim, 0.28 m to the support side. | stepInSpot 213-222 | `StepInSpot` |
| **The root's speed through a window strike.** | strikeRoot 234-238 | `StrikeRoot` |
| **Starting a kick.** A step-in, else the window, else a stride adjust (dead ball: up to 3 s). | startKick 239-262 | `StartKick` |
| **What the kick asks the solver.** Scuff aim lerp 25% to the goal centre, speed x0.55; shot speed, finesse x0.92 capped at a 0.85 strike, the drive; curl from bend/finesse. | kickRequest 274-308 | `KickRequest` |
| **The deviation's context.** Plant error (step-in: root error less 0.3 m; window: abs(ahead - 0.65) - 0.15); ball state; first time. | kickCtx 310-329 | `KickCtx` |
| **The presolve.** Three draws as the swing starts, one flight per step. | kickPresolve 336-351 | `KickPresolve` |
| **The contact.** Whiff checks; step-in plant error; planShot warm-started; ballKick; refreshPred; extra.strike (cleanness). | strikeContact 353-439 | `StrikeContact` |
| **Per step.** Stride adjust steering, step-in steering (across the aim by LAT_BY, V_PLANT short at the plant, turn spread to TURN_BY), window speed cap, contact at tc, run-on after a step-in (KEEP of the speed for ON s). | actionStep 'kick' 1680-1755 | `KickStep` |
| **The flick act.** | startFlick 964-970, flickStep 971-1003 | `ULRStrikeComponent::StartFlickAct/FlickStep`, `FlickKick` |
| **The flick's launch fitted on the real ball.** Bisection, 3 rounds of 22. | flickTop 927-932, flickFly 936-949, flickLaunch 951-963 | `FlickTop`, `FlickFly`, `FlickLaunch` |
| **The knock-on.** Along the move direction or the facing; spin v/R rolling. | keepStep 1025-1042, knockOn 1296-1305 | `KnockOnLaunch`, `ULRStrikeComponent::KnockOnNow` |
| **The predicted ball.** | predAt 75-82 | `FPredCache::At` |

### moves.js and the shot clip (plan/notes/fc27-shot.md, fc27-spec.md section 4)

| Item | Value | Source | C++ |
|---|---|---|---|
| Plant before contact | 0.20 s | moves.js 66 (`KINDS.instep.contact .20`, the plant at clip time 0); spec 4: "Left plant -0.20 s" | `SHOT_CLOCK::PLANT_BEFORE` |
| Plant position | [0.33, -0.08] (across, along the aim) from the ball | moves.js 66, actions.js 182; spec 5.7 | `STEP_IN::PLANT_LAT/ALONG` |
| Toe-off | at the plant (SHOT.OFF 0) | moves.js 105 | `SHOT_CLOCK::TOE_OFF` |
| Backswing top | 0.10 s before the contact | moves.js 105 (SHOT.TOP); spec 4: -0.10 s | `SHOT_CLOCK::TOP_BEFORE` |
| Follow-through top | +0.115 s | moves.js 105 (SHOT.FT); spec 4: +0.10 to +0.13 s | `SHOT_CLOCK::FT_AFTER` |
| Landing (kicking foot down) | +0.36 s | moves.js 105 (SHOT.LAND); spec 4: +0.34 to +0.41 s (best +0.37) | `SHOT_CLOCK::LAND_AFTER` |
| Act end | +0.37 s | actions.js 183 (STEP_IN.FOLLOW) | `STEP_IN::FOLLOW` |
| Support foot after (on the move) | heel up +0.20, toe off +0.27, lands +0.58 | moves.js 105 (S_HEEL, S_OFF, S_LAND) | `SHOT_CLOCK::S_*` (constants only) |

## The step-in strike and its clock in the engine

`ULRStrikeComponent` fires `OnPlant`, `OnBackswingTop`, `OnContact`, `OnFollowThrough` and `OnLand`, each with an
`FLRStrikeTiming` payload:

- **The act's clock and the contact time.** `ActTime`, `ContactTime` and `TimeToContact`.
- **Lateness.** `bLate` is set if the moment had already passed when it became known. `ClipStartOffset` (for
  `OnPlant`) is the time into a clip that has the plant at 0 and the contact at 0.20 s.
- **The kind and the foot.** `bStepIn`, `bLeftFoot`.
- **Positions.** `PlantLocation` (world, on the grass), `BallAtContact` and `AimDirection`.

How the events are timed:

- **A step-in** is decided at the release, so the plant comes 0.10 to 0.15 s later. To sync an animation, play the
  montage at `OnPlant` from `ClipStartOffset` (0 for a step-in), or re-sync at each event.
- **A window strike** (a fast ball or body: contact 0.10 to 0.18 s after the release) fires `OnPlant` and
  `OnBackswingTop` late, on the first step. `ClipStartOffset` then says how far into the clip to start, as the game's
  drawing "begins late".
- **During a stride adjust**, nothing fires until the contact time is known.
- **`OnContact`** fires on the step the ball is struck, whiffs and scuffs included. It is followed by `OnStrike`.
- **After the contact**, the follow-through and the landing are timed from the actual contact step, and fire even
  after a window strike's act has ended (0.28 s).

The times are quantised to 60 Hz steps, as in the game. The smoke run gave: plant -0.194 s, top -0.094 s, contact,
follow-through +0.117 s, landing +0.367 s, for a step-in planned 0.3275 s after the release and struck at 0.3333 s.

During a step-in, the act steers the body (actions.js 1710-1733). `GetSteer()` returns the direction, a speed cap
(cm/s) and the facing yaw each step, which the character's movement must follow (for example `AddMovementInput` plus
`MaxWalkSpeed` and the rotation). If it does not, the plant error grows and the shot gets wider, which is the game's
own rule (kickCtx 317).

Input wiring, done in the game's input code:

| Game input | Call |
|---|---|
| LMB pressed / released | `PressShot()` / `ReleaseShot()` |
| MMB pressed / released | `PressFlick()` / `ReleaseFlick()` |
| W A S D state every frame | `SetMoveKeys(W, A, S, D)` |
| F (finesse) | `SetFinesseHeld(bHeld)` |
| Shift tapped twice within 0.3 s | `RequestKnockOn(MoveDirection)` |
| The reticle | `AimPoint` (world), plus `bAimOnGoal`, `bAimInBox`, `GoalCentre`, `bInControl`, `Pressure` |

Button times count fixed steps, so a replay of the same inputs on the same steps reproduces the game.

## Not ported, and why

- **Nets.** These are soft panels (ball.js `netApplyQ` 773-816; NET_K, NET_C, NET_T, NET_IN, NET_MAX). They are built
  from `pitchspec.js` geometry, which is not part of this package. Posts and the crossbar are ported (`AddCapsuleCollider`).
- **Goal and out-of-play detection.** `zoneCheckQ` 820-838 and the "goal"/"out" events are the rules' and the match's
  business.
- **Pitch spec parsing.** createBallWorld's spec branch (154-179). Colliders are added by hand in world units instead:
  `AddCapsuleCollider`, `AddBoardCollider`.
- **Life-zone solids.** Walls ray-cast (`wallHitQ`), the floor lip (`floorAt`), sleeping and waking (`wakeCheck`,
  SLEEP_T). The engine's own world would need its own adapter; the ball here has a flat floor at the sim origin.
- **AI tools.** firstReach (916-960), flightTime and its lofted tables (strike.js 353-405), idealPassSpeed beyond
  `PassSpeedFor`. They are used by brains, not by the ball or the player's strikes.
- **Strikes other than the ground shot.** Volleys and acrobatics (VOLLEY air windows, timing ring, ACRO), headers,
  passes (RMB) and through balls, crosses beyond the cross/lob kind decided at release, throw-ins, set-piece run-ups,
  the fake (S while charging). They are separate features. A lofted ball off goal is supported as `cross`/`lob` at the
  loft speed.
- **First-person reticle mechanics.** Reticle sway (AIM.SW0..CH, TREMBLE, LEAN), the mouse-sweep curl gesture (G.curl),
  stride rhythm (A1.7: `rhythm` is taken as 0), the kick-type wheel (KICKS: control.js `kickType()` always returns
  Normal since U28). The reticle point is an input (`AimPoint`). Lift and dip gestures are inputs (`SetReleaseGesture`).
- **Match bookkeeping.** Possession and loss checks (noTouch, the 50/50 duel), the event log, decision records, stats,
  xG, hit-stop, stamina drain on a kick (`stamAction`), close control and dribble touches. These are other systems.
  Possession and pressure are inputs (`bInControl`, `Pressure`).
- **The drawn body.** moves.js `shotPath`, `shotBody`, the IK, lean, arm and pitch. The animation is the montage's job;
  this package provides the clock and the plant spot to sync it.
- **The game's mover** (mover.js acceleration and turn rates). Unreal's CharacterMovement moves the body; the strike
  only reads it and asks it to steer.
- **`ballHold` / `ballRelease`.** Ported in the core, but not exposed in Blueprint (no keeper here).

## Uncertain

- **Not built in Unreal.** It was compiled against a mock of the UE API (the tests and a component smoke run pass
  there), and the cores were compiled with gcc and clang. APIs relied on: `EAutomationTestFlags::EditorContext |
  EngineFilter`, `UE_KINDA_SMALL_NUMBER`, `UE_DOUBLE_PI`, `FName(const ANSICHAR*)`, `TObjectPtr`, `TWeakObjectPtr`,
  native multicast `AddUObject`, `FTransform::TransformVectorNoScale`, `ConstructorHelpers::FObjectFinder`, and the
  const-preserving `Cast<ACharacter>`. All are stable in UE 5.x, but 5.8 itself was not available to try.
- **Float settings in the real toolchain.** The per-file pragmas (`float_control(precise, on, push)` plus no contraction)
  should hold the bits even if the module builds with fast-math. MSVC was not tried. If the golden tests report
  "N of M match to the last bit" with N < M (but within 1e-9), a compiler setting is fusing operations. The tolerance
  keeps the tests green while the report shows it.
- **`Math.tan`.** The grade's aim offset (control.js 1111) uses the engine's tan, which in V8 is fdlibm. The port uses
  `std::tan`, which may differ in the last bit; this only affects the offset of non-perfect shots. `Math.hypot` is
  ported as V8's algorithm from memory; it is bit-equal on the values tested.
- **The character's root.** For an `ACharacter`, the capsule half-height is subtracted from the actor location to get
  the game's root on the grass. Other pawns use the actor location as is.
- **The shared generator.** In the game, the knuckle's draws and the presolve's deviation draws come from the match
  generator `ms.r`, shared with everything else. Here they come from the ball's `FRng` (seeded by `RngSeed`), shared by
  its strikers and the spread. Sequences match the JS for the same order of calls, but a whole JS match is not
  replayed.
- **The prediction stamp.** The path cache is stamped with the step's start time after the ball has already moved
  (the JS does the same: refreshPred during or after ballStep, before `ms.t += h`). This was replicated on purpose.
- **Dead balls and restarts.** These reduce to `bDeadBall` (no step-in, stride adjust up to 3 s), since the rules are
  not ported.

## Regenerating and re-checking

```
git -C <repo> worktree add --detach <wt> bcs/integ            # a read-only checkout
Tools/golden/run_check.sh <wt> <build dir>                      # cores vs JS, bit for bit (needs node, g++, clang++)
Tools/golden/make_tests.sh <wt>                                 # regenerates Source/LegendRising/Tests/LRBallTests.cpp
# the Unreal layer and tests against the API mock (not Unreal; a compile and logic check only):
g++ -std=c++17 -ffp-contract=off -Wno-unknown-pragmas -ITools/uemock -ISource/LegendRising Source/LegendRising/Ball/*.cpp \
    Source/LegendRising/Strike/*.cpp Source/LegendRising/Tests/LRBallTests.cpp Tools/uemock/smoke_main.cpp -o smoke && ./smoke
```
