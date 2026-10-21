# BCS to Unreal Engine 5.8.4: the guide for the PC session

This branch, `bcs-unreal`, holds the BCS football mechanics (the better control system) ported from the browser game to
Unreal C++. You are Claude Code on the user's Windows PC, with Unreal Engine 5.8.4 and an Unreal MCP server connected.
Your job is to build this into a working Unreal project the user can play. Work through the steps in order.

## What is here

| Path | What it is |
|---|---|
| `Unreal/LegendRising/LegendRising.uproject` | The project (module LegendRising; plugins Enhanced Input, Pose Search, Control Rig) |
| `Unreal/LegendRising/Source/LegendRising/Ball/` | The ball: deterministic physics matching the browser game bit for bit (roll, bounce, spin, curl, knuckle, posts and bar), `ALRBall` actor, `ULRBallComponent` |
| `Unreal/LegendRising/Source/LegendRising/Strike/` | The shot: launch solver, the shot meter (sweet band and gold perfect spot, scuff), the flick bar and solver, the knock-on, `ULRStrikeComponent` with the step-in timing events (plant, backswing top, contact, follow-through, landing) |
| `Unreal/LegendRising/Source/LegendRising/Player/` | `ALRPlayerCharacter` (third-person camera on the mouse, Enhanced Input), `ULRMovementComponent` (free-direction W A S D, the walk/jog/run/sprint ladder in every direction, smoothing, turn rates, plant and pivot), `ULRCloseControlComponent` (automatic close control, touches on the strong foot's footfalls, knock-on, exits), gait and carry tables |
| `Unreal/LegendRising/Source/LegendRising/Tests/` | Automation tests with golden numbers taken from the browser game |
| `Unreal/LegendRising/Tools/` | Node and g++ scripts that produced the golden numbers (not part of the build) |
| `plan/unreal/PORT-ball.md`, `PORT-movement.md` | Every constant and rule with its JavaScript source line, what is not ported and why, open questions |
| `plan/unreal/CONTENT-SETUP-movement.md` | The Enhanced Input assets, Blueprints and animation plan |
| `plan/notes/fc27-spec.md` | The reference clip reverse-engineered: the targets for the look and timing |
| `LegendRising/` | The browser game itself (the reference implementation; run it with any static server to compare) |

The code has NOT been compiled in Unreal yet (it was written in a cloud container with no engine; its maths was checked
against the JavaScript with g++/clang and a stand-in for the Unreal headers). Expect a few small compile fixes. The likely
spots are listed in PORT-ball.md and PORT-movement.md under "Uncertain".

## Step 0: tools check

1. List the tools your Unreal MCP gives you (they vary between MCP servers). Note which can: create/open a project, create
   Blueprints and assets, set properties, place actors, run console commands, compile, start Play In Editor, take screenshots.
   Use the MCP for editor work; use the command line (UnrealBuildTool / Build.bat) for compiling when that is more reliable.
2. Visual Studio 2022 with the "Game development with C++" workload must be installed. If it is not, stop and tell the user.

## Step 1: compile

1. Right-click `LegendRising.uproject` > Generate Visual Studio project files (or run
   `"<UE>/Engine/Build/BatchFiles/Build.bat" LegendRisingEditor Win64 Development -Project="<path>/LegendRising.uproject" -WaitMutex`).
2. Fix compile errors with the smallest change that keeps the behaviour. Never change a constant or the order of operations
   in `LRBallCore`, `LRDetMath`, `LRStrikeSolver`, `LRShotMeter`, `LRMoverCore`, `LRCloseControlCore`: they are bit-exact
   ports and the tests check them.
3. Connect the ball to the player code: make `ALRBall` implement `ILRBallInterface` (Player/LRBallInterface.h):
   `class ALRBall : public AActor, public ILRBallInterface`, forwarding GetLocation, GetVelocity (one override serves both
   AActor and the interface: see the note in the header), Kick (to `ULRBallComponent::KickBall`), IsFree, IsInPlay, and
   GetPossessor (nullptr until a possession system exists). Check the units: both sides use LRUnits.h / LRPlayerUnits.h,
   which agree (Unreal X = -sim Z, Y = sim X, Z = sim Y, centimetres; spin (wZ, -wX, -wY)).
4. Run the automation tests: Session Frontend > Automation, filter "LegendRising" (or
   `UnrealEditor-Cmd.exe <uproject> -ExecCmds="Automation RunTests LegendRising;Quit" -unattended -nullrhi`).
   All must pass. If a ball test reports fewer exact matches than its total, MSVC is fusing floating-point operations: set
   `/fp:precise` and no FMA contraction for that module (see PORT-ball.md "Float settings").

## Step 2: content

Follow `plan/unreal/CONTENT-SETUP-movement.md`:
1. Enhanced Input: the input actions (Move 2D, Look 2D, Sprint, Walk, Shoot, Pass, Flick, Shield, Jockey) and one mapping
   context: W A S D, mouse, Left Shift (double tap = knock-on), X, LMB (hold to charge the shot, release on the meter), RMB,
   middle button (hold to fill the flick bar), C. There is no V and no F for close control: close control is automatic.
2. A test map: a flat pitch (105 x 68 m) with goals (posts and bar where PORT-ball.md says), a light, `BP_Ball` from
   `ALRBall` with a ball mesh of radius 11 cm, `BP_Player` from `ALRPlayerCharacter` with a mannequin, a GameMode using it.
3. A simple HUD widget for the shot meter (the band, the gold spot) and the flick bar, reading `ULRStrikeComponent`.

## Step 3: animation (the look)

The browser game drew its body procedurally. In Unreal use real animation:
1. Locomotion with Motion Matching (Pose Search plugin): a pose search database of run/turn/stop/start clips (the free
   Game Animation Sample's set is a good start), driven by the movement component's velocity and facing. API names changed
   between 5.3 and 5.6; check the 5.8 names.
2. Footfalls: sync markers on the clips; `ULRGaitTables` gives the step rate by speed (and the CARRY table for running with
   the ball: short quick steps), so the close-control touches land on the strong foot's footfalls.
3. Touches: on `OnTouch`, Control Rig / two-bone IK puts the touching foot (toe of a flat foot, low on the ball) on the
   ball at the touch time.
4. The shot: a montage keyed to `ULRStrikeComponent`'s events: plant 0.20 s before contact beside the ball (about 33 cm to
   the side), backswing top 0.10 s before, contact on the laces, follow-through 0.10-0.12 s after, landing 0.35-0.38 s after.
5. The legs must never cross or pass through each other in turns (the user's strongest complaint in the browser version).

## Step 4: check it with the user

Play In Editor and record (MCP screenshots, or the editor's movie capture):
- running W, A, S, D for 3 s each with the camera still (the body turns and runs every way at the run speed, about 5.9 m/s;
  Shift sprints any way),
- reaching a loose ball (close control comes on by itself), carrying it, double Shift (knock-on), the middle button (flick),
- a turn back to goal and a shot released on the gold spot.
Compare with the browser game and the reference clip (the user has the clip; plan/notes/fc27-spec.md has its numbers).

## What is not ported yet

Passes, headers, volleys, tackles, the AI, goals and out-of-play, possession and the match rules, the sole moves (the
`bcs/sole` branch is half done), and the clip's turn package (not built yet in the browser game either). PORT-ball.md and
PORT-movement.md list each with the reason. Ask the cloud session (or do it here) to port the next piece when this works.
