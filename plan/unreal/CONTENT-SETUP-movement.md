# Content setup: player movement, controls and close control (UE 5.8)

What to create in the editor so the C++ in `Source/LegendRising/Player/` runs, and how the animation should be built
around it. Numbers come from the browser game; the source of each is given in `PORT-movement.md`.

## 1. Module and plugins

`LegendRising.Build.cs` needs these module dependencies (add the ones that are missing):

```csharp
PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "InputCore", "EnhancedInput" });
```

The tests (`Source/LegendRising/Tests/LRMovementTests.cpp`) need nothing more. They are compiled in Development
Editor builds (`WITH_DEV_AUTOMATION_TESTS`).

Plugins to enable for the animation plan in section 4: **Enhanced Input** (on by default), **Pose Search** (Motion
Matching), **Animation Warping**, **Control Rig**, and **Chooser** if you pick databases with a chooser table.

## 2. Enhanced Input assets

Create these under `Content/LegendRising/Input/`. The names are the ones the C++ comments use. Assign them to the
`ALRPlayerCharacter` Blueprint's **LR|Input** properties.

### Input Actions

| Asset | Value type | Triggers | C++ property | What it does |
|---|---|---|---|---|
| `IA_Move` | Axis2D (Vector2D) | none (implicit Down) | `MoveAction` | X = right (D +1, A −1), Y = forward (W +1, S −1). Camera-relative in third person. |
| `IA_Look` | Axis2D (Vector2D) | none | `LookAction` | Mouse delta. The character turns the control rotation by 0.1203° a count times `MouseSensitivity` (the game's 0.0021 rad a pixel). |
| `IA_Sprint` | Digital (bool) | none (implicit Down) | `SprintAction` | Held = sprint. A second press within 0.3 s = the knock-on. The double tap is detected in C++; **do not** add Tap or Double Tap triggers, because they delay `Started`. |
| `IA_Walk` | Digital | Pressed | `WalkAction` | Toggles the walk. |
| `IA_Shoot` | Digital | none | `ShootAction` | LMB. Hold to wind up a shot, release to strike. Defending, it is a tackle on the press. |
| `IA_Pass` | Digital | none | `PassAction` | RMB. Hold to weigh a pass, release to play it. Defending, held, it is the jockey. |
| `IA_Flick` | Digital | none | `FlickAction` | MMB. Hold to charge, release to flick. |
| `IA_Shield` | Digital | none | `ShieldAction` | C. Held to shield. |
| `IA_Jockey` | Digital | none | `JockeyAction` | Optional, for a gamepad trigger. On the keyboard the jockey is RMB held while defending. |

`V` has no action. The shoulder check was removed in the BCS controls.

### Input Mapping Context `IMC_LRPlayer`

Assign it to `DefaultMappingContext`. The character adds it at priority 0 when it is possessed.

| Action | Key | Modifiers |
|---|---|---|
| `IA_Move` | W | Swizzle Input Axis Values (YXZ) |
| `IA_Move` | S | Swizzle Input Axis Values (YXZ), Negate |
| `IA_Move` | D | none |
| `IA_Move` | A | Negate |
| `IA_Move` | Gamepad Left Thumbstick 2D-Axis | Dead Zone (radial, 0.2). Set `bAnalogThrottle` on the movement component if the stick's length should be the throttle. |
| `IA_Look` | Mouse XY 2D-Axis | **none**. The C++ already makes mouse-up look up. If your project's mouse feels inverted, tick `bInvertY` rather than adding Negate. |
| `IA_Look` | Gamepad Right Thumbstick 2D-Axis | Dead Zone, Scalar (about 30 to 60: a stick gives −1..1 each frame, a mouse gives counts) |
| `IA_Sprint` | Left Shift | none |
| `IA_Sprint` | Gamepad Left Thumbstick Button | none |
| `IA_Walk` | X | none |
| `IA_Shoot` | Left Mouse Button | none |
| `IA_Pass` | Right Mouse Button | none |
| `IA_Flick` | Middle Mouse Button | none |
| `IA_Shield` | C | none |
| `IA_Shield` | Left Ctrl | Optional. The game allows it only in full screen with the keyboard locked. |
| `IA_Jockey` | Gamepad Left Trigger | Optional. |

The game ignores any key pressed with Alt or Meta held. Ctrl is allowed only for the shield. To copy that, put the
mappings in a context without chorded actions, or add a Chorded Action trigger that blocks them. The C++ does not
check for modifiers.

## 3. The player Blueprint

1. Create `BP_LRPlayer` from `ALRPlayerCharacter`. Its CharacterMovement is already `ULRMovementComponent`.
2. Mesh: your footballer's skeletal mesh, rotated −90° in yaw to face +X, with its feet at the capsule's bottom. The
   capsule is 34 × 90 cm, with the eyes at 1.68 m.
3. **LR|Input**: the assets from section 2.
4. **LR|Movement** on the CharacterMovement component:
   - `Skills`: pace, sprint speed, acceleration, dribbling, agility, ball control, stamina, energy, fatigue, grip boots.
     These follow the game's attributes; 50 everywhere is the golden tests' body.
   - `FixedStepHz` 60 (the game's rate; the tests assume it).
   - `bThirdPerson` on.
5. **CloseControl**:
   - `BallActor`: the ball, which must implement `ILRBallInterface`.
   - `StrongFoot`.
   - `bAssumeUnownedBallIsMine`: keep it on until a possession system answers `GetPossessor`.
6. Game code wires the outputs: `OnShootReleased`, `OnPassReleased`, `OnFlickReleased`, `OnTackleRequested`,
   `OnFakeRequested`. It also tells close control about actions: `NotifyActionStarted("kick", bStepIn)` /
   `NotifyActionFinished`, `NotifyOwnStrike("shot")`, and `NotifyFirstTouch` for a received ball. It sets
   `bDefending`, `JockeyTarget` and `ShieldThreat` on the character.

The camera is a spring arm 4 m back along the look and 1.5 m above it, with a 78° field of view and pitch limited to
−63..40°. These are matchcam.js `TP`. The game's camera settings (`tpDist` 2..8 m, `tpHeight` 0.3..3 m, `tpSide`
−1.2..1.2 m) map to `TargetArmLength`, `SocketOffset.Z` and `SocketOffset.Y`.

## 4. The animation plan (UE 5.8)

The browser game draws its legs procedurally (gait.js) from the simulation's gait clock. Unreal replaces that drawing
with animation. The simulation's clock stays the authority for gameplay: **the ball is touched when the sim says a
foot comes down, and the animation is kept in step with it.** It is never the other way round. This keeps the
tests, the AI's timing and any replay deterministic.

### 4.1 Locomotion: Motion Matching (Pose Search)

- **Two families of databases**, chosen by `GetCarryWeight()` (0 → free running, 1 → with the ball) through a Chooser
  or a simple blend:
  - **Free locomotion**: walk (1.5 m/s), jog (≈4 m/s), run (≈5.9), sprint (≈8.4 at pace 50, up to ≈9.4), plus
    starts, stops, plants and pivots. Include 90°, 135° and 180° turns at a run, because the cut rule plants above
    3 m/s, and a turn on the spot from a stand (13 rad/s, ≈0.13 s for a quarter turn). Also include side-on strafing
    for the jockey (≤3.2 m/s) and a shielding shuffle (≤0.6 × jog).
  - **Carry locomotion** (the FC 27 carrier): short, quick, low steps at the CARRY table's cadence. That is 330
    steps a minute at 2.4 m/s, 340 at 3.6, 360 at 4.5, 410 at 5.5, 450 at 6.5 and 470 at 7.6, with steps 0.44 to
    0.97 m and a duty of 0.46 down to 0.36. Use the carrier posture: hips 7.5 cm lower, the trunk 0.15 rad further
    forward (0.45 when bursting), arms out, the head down over the ball. **The clips must be authored or retimed to
    these cadences.** The clock does not follow the clips.
- **Trajectory**. The capsule moves by the mover model, not by input acceleration, so CharacterMovement's own
  acceleration is not a prediction. Build the query trajectory from the mover:
  - Copy `GetBody()` (an `LRMove::FBodySim`) and step it forward with the current control input for the future samples:
    for example 0.33 s, 0.66 s and 1.0 s at the fixed step. It is a few dozen cheap steps.
  - Use the recorded positions and facings for the past samples.
  - Feed it to the Motion Matching node's trajectory input. In 5.8 that is `FTransformTrajectory`, from the Pose Search
    trajectory library. Check the exact type name in your engine version, because it was renamed between 5.4 and 5.6.
- **Root motion off for locomotion.** The capsule is moved by `ULRMovementComponent` and the clips play in place. Use
  root motion only for strike and slide montages. While a montage drives root motion, the movement component hands
  over and reads the body back afterwards.
- Signals worth adding as channels or chooser inputs:
  - `IsPlanting()` and `GetCutAngleDeg()`: a planted cut or a reversal.
  - `GetTurnRateDegPerSec()`.
  - `GetLongitudinalAccel()`: a start, a brake.
  - `GetIntentGait()`.
  - the held facing: `GetFacingYawDeg()` against `GetHeadingYawDeg()`, which is non-zero only for the jockey, the
    shield or an aim hold. Use a strafe database or Orientation Warping for it.

### 4.2 Footfalls: sync markers

- In every locomotion and carry sequence, add sync markers named **`Foot_L`** and **`Foot_R`** on the frame each foot
  touches down (heel or flat-foot contact; for the carry, the flat foot landing).
- The sim's convention: one stride is phase 0..1, the **left foot lands at phase 0 and the right at 0.5**
  (`GetGaitPhase()`).
- Keep the clock and the pose together:
  1. **Choose by cadence.** The databases cover the table's cadence at each speed, so Motion Matching mostly picks a
     clip whose step matches `GetStepLengthMetres()` and `GetStepsPerMinute()`.
  2. **Retime.** Each frame, compare the animation's time to its next `Foot_L` / `Foot_R` marker with
     `GetTimeToFootfall(Foot)`. The animation's time comes from the playing sequence's sync markers; with Motion
     Matching, read the current database asset and time from the node's output or the PoseSearch debugger API. Set
     the Motion Matching node's play rate within ±15% to close the gap. Stride Warping (Animation Warping) keeps the
     feet planted when the play rate changes.
  3. **Re-phase.** If the gap stays over half a step (≈0.08 s in the carry), force a new search, or blend to the
     mirror pose so the right foot is next. Never move the sim's clock to suit the animation.
- `ULRMovementComponent::OnFootfall(Foot, Time)` fires on the sim's footfalls. Use it for footstep sounds and dust,
  and in development builds to log the animation's marker error.

### 4.3 The touch: foot IK / Control Rig

`ULRCloseControlComponent::GetNextPlannedTouch()` returns the next touch. It is valid in close control on the move. It
says which foot (`Foot`), with which part (`Part`: Toe, Inside, Outside, Sole), whether it plays the ball
(`bWillTouch`), in how long (`TimeToContact`, `ContactWorldTime`), where the ball will be (`PredictedBallLocation`),
the play direction, and where the touching face of the foot should be (`FootFaceTarget`, `FootYawDeg`).

In a Control Rig (or the AnimBP's IK), for the planned foot when `bWillTouch`:

- **Target.** Use gait.js `touchLanding`:
  - the toe tip **10.5 cm** behind the ball's centre along the play direction (`TOE_BACK`);
  - the inside or the outside **8.5 cm** behind it (`FACE_BACK`), with the foot turned up to **0.6 rad** so that face
    looks along the way (`TOUCH_YAW`; the component has already turned `FootYawDeg`);
  - the face meeting the ball **3 to 8 cm** up, in its lower third (`ContactHeightCm`, default 5.5);
  - the foot nearly flat, pitched about 0.03 rad (`TOUCH_ROLL`).
  - A **sole** stop puts the ball of the foot on top of the ball.
- **When.** Blend the IK in over the last part of the swing: from swing progress 0.38 to 0.62 (`TRACK_U`, using
  `GetSwingProgress(Foot)`), eased in over **0.1 s** (`TRACK_IN`) from when the plan appears. This way a touch planned
  late in a swing never snaps the foot. The foot then comes on with the ball at its speed for the 2 to 3 frames before
  the footfall, and plants just behind where the ball was. Release the IK after the contact, as the foot becomes the
  stance foot.
- **No crossing.** Keep the touching foot at least **8 cm** to its own side of the other foot across the hips
  (`TOUCH_SEP`). Keep a swing passing the other foot **12 cm** out (`PASS_SEP`, within 0.15 to 0.3 m along it). Turn
  the touching foot in by at most **0.25 rad** (`TOUCH_IN`). The simulation already avoids planning a touch across the
  support foot (`CARRY.XLAT`), so these are small corrections.
- Use **Full Body IK** or **two-bone IK** for the leg, with a small pelvis shift. Keep the knee's pole on the foot's
  way.
- **Head.** Look at the ball: down 0.42 rad on the move, 0.25 rad more through each touch, and up 0.12 rad between
  touches above 5 to 6.5 m/s (gait.js `CARRY_HEAD`).

### 4.4 Anim notifies

- `AN_FootDown` (on `Foot_L` / `Foot_R`): footstep audio and VFX. The gameplay footfall is `OnFootfall`.
- `AN_BallContact` in the carry clips, on the touch frame: a visual and audio cue only. **The authoritative touch is
  `ULRCloseControlComponent::OnTouch(Foot, Part, ContactTime)`**, fired when the sim plays the ball. Play the contact
  sound from it, and use the notify only to check the alignment in development.
- Strike montages carry their own plant and contact notifies; they belong to the strike package.

## 5. Running the tests

In the editor, open **Tools → Session Frontend → Automation**, filter `LegendRising.Movement`, and run. From the
command line:

```
UnrealEditor-Cmd.exe <Project>.uproject -ExecCmds="Automation RunTests LegendRising.Movement; Quit" -unattended -nullrhi -log
```

There are seven tests: the run-up and sprint from a stand, the controls' ladder, the 180° reversals, the turn from a
stand and the wish curve, the gait and carry cadence, close control's touch cadence, and its automatic entry and exits.
They run the plain C++ cores, so they need no map or assets.
