// LRMoverCore.h: the one locomotion model, ported from js/life/mover.js (identical on bcs/controls c824ef1 and
// bcs/integ 41c4cd0), its stamina factors (js/life/stamina.js), and the third-person control layer that turns W A S D
// into the mover's intent (js/life/football/control.js, bcs/controls: the "where you go" block, BCS).
//
// Plain C++ in the game's own frame and units (see LRMoveMath.h): metres, seconds, radians, y up, yaw 0 faces -Z, a
// positive yaw turns left. ULRMovementComponent wraps it for Unreal and converts at the edge (LRPlayerUnits.h).
//
// The model in one paragraph (mover.js header): walk, jog, run and sprint targets; acceleration that falls off towards
// top speed, integrated exactly over the step; braking at a constant rate; planted cuts that cost speed; a heading turn
// rate that drops as speed rises; backpedal and strafe caps when the facing is held; stagger; and the stamina factors on
// top. The body's facing (yaw) follows the heading at faceRate unless the caller holds it (jockey, aim, shield).

#pragma once

#include "LRGaitTables.h"
#include "LRMoveMath.h"

#include <cstdint>
#include <limits>

namespace LRMove
{
	// matches ELRGait in LRPlayerTypes.h (same order)
	enum class EGait : uint8_t { Stand = 0, Walk = 1, Jog = 2, Run = 3, Sprint = 4 };

	// below this speed (m/s) the velocity has no direction worth keeping: the heading takes the wish at once
	constexpr double SNAP_V = 0.05;

	// ---------------------------------------------------------------------------------------------------------------
	// Stamina (stamina.js). The factors make a tired body slower, heavier and less precise.
	// ---------------------------------------------------------------------------------------------------------------
	struct FStaminaFactors
	{
		double BF = 1.0;     // breath factor 0..1 (1 at or above BF_FULL breath)
		double EF = 1.0;     // long-term energy factor 0.6..1
		double Speed = 1.0;  // 0.45 + 0.55 bF: the share of the sprint's margin over the jog that is left
		double ESpeed = 1.0; // 0.92 + 0.08 eF
		double Accel = 1.0;  // 0.75 + 0.25 bF
		double Turn = 1.0;   // 0.88 + 0.12 bF
		double Aim = 1.0;    // 1 + 0.25 (1 - bF) + 0.35 (1 - eF)
		double Power = 1.0;  // (0.9 + 0.1 bF)(0.9 + 0.1 eF)
		double Touch = 0.0;  // 0.08 (1 - bF)
		double Lean = 1.0;   // 1 - 0.15 (1 - bF), for the animation

		// stamina.js stamFactors(st, eF)
		static FStaminaFactors FromBreath(double Breath, double EnergyFactor);
		// stamina.js FRESH: a fresh, rested body
		static FStaminaFactors Fresh() { return FromBreath(100.0, 1.0); }
	};

	// stamina.js effortOf's answers
	enum class EEffort : uint8_t { Stand, Walk, Jog, Run, Sprint, SprintRun, SprintJog };

	// stamina.js STAM (1.5.2 numbers in one place)
	namespace Stam
	{
		constexpr double SPRINT = 9.0;      // breath per second sprinting, times ks
		constexpr double RUN = 1.2;         // breath per second running over RUN_V without sprinting, times ks
		constexpr double RUN_V = 5.0, JOG_V = 2.3, WALK_V = 0.3;   // effort thresholds
		constexpr double REC_STAND = 6.0, REC_WALK = 5.0, REC_JOG = 2.6;   // recovery per second (run, sprint: none)
		constexpr double DELAY = 0.5;       // recovery starts this long after the last drain
		constexpr double BF_FULL = 35.0;    // at or above this much breath nothing is lost
		constexpr double SPRINT_TAU = 30.0; // seconds: time constant of SprintFrac
	}

	// the breath pool (stamina.js createStam / stamStep). Infinite: held full (the admin switch).
	struct FStaminaPool
	{
		double B = 100.0;           // breath 0..Cap
		double Cap = 100.0;
		double RecoverDelay = 0.0;
		double SprintT = 0.0;       // seconds of the current sprint
		double SprintFrac = 0.0;    // recent share of time spent sprinting
		bool bInfinite = false;

		// stamina.js stamCap(energy, fatigue)
		static double CapOf(double Energy, double Fatigue);
		void Init(double Energy = 100.0, double Fatigue = 0.0) { Cap = CapOf(Energy, Fatigue); B = Cap; RecoverDelay = 0.0; SprintT = 0.0; SprintFrac = 0.0; }
		// stamina.js stamStep(st, h, effort, {stamina, eF})
		void Step(double H, EEffort Effort, double StaminaSkill, double EnergyFactor);
	};
	// stamina.js ksOf: how hard a sprint drains you for a stamina skill (30: 1.17, 50: 1.0, 90: 0.66)
	double StaminaKs(double StaminaSkill);
	// stamina.js effF: the long-term energy factor, 0.6 when empty to 1 from energy 60
	double EnergyFactorOf(double Energy);
	// stamina.js effortOf(gait, v, runSpeed)
	EEffort EffortOf(EGait Gait, double V, double RunSpeed = Stam::RUN_V);

	// ---------------------------------------------------------------------------------------------------------------
	// The mover (mover.js)
	// ---------------------------------------------------------------------------------------------------------------

	// mover.js MOVE (U28 part B): Acceleration felt more above 50, every jog/run/sprint 5% faster, the push 10% harder
	namespace Move
	{
		constexpr double ACC_TOP = 1.35;
		constexpr double A0_MUL = 1.1;
		constexpr double SPEED_MUL = 1.05;
	}
	// mover.js accelMul: 1 at 50, ACC_TOP at 99, 0.8 at 40, never under 0.55
	double AccelMul(double Acceleration);

	// The skills that shape the football profile (1..110; a negative value means "not given", which counts as 50, or
	// for Agility as (Acceleration + Dribbling) / 2, mover.js moverParams)
	struct FMoverSkills
	{
		double Pace = 50.0;           // pace (the sprint speed when SprintSpeed is not given)
		double SprintSpeed = -1.0;    // A1.1: sets the top speeds (else Pace)
		double Acceleration = -1.0;   // A1.1: sets how steep the approach is (else Pace)
		double Dribbling = 50.0;
		double Agility = -1.0;        // else (Acceleration + Dribbling) / 2
		bool bGripBoots = false;      // x1.03 on the sprint
	};

	// mover.js moverParams' answer. Only the football profile is ported (the life world's walk build-up, turn-first and
	// sprint build are fields here so the step reads like the JS, but FootballProfile leaves them off; the BCS control
	// layer switches turnFirst on for third person).
	struct FMoverParams
	{
		double Pace = 50, Agility = 50, Acceleration = 50;
		double Walk = 1.5, Jog = 0, Run = 0, Sprint = 0, VMax = 0;
		double Back = 3.2, Strafe = 4.0, BackMul = 1.0, StrafeMul = 1.0;
		double A0 = 0, Brake = 7.5, Plant = 9.0, ALat = 7.5, WMax = 9.0;
		double WalkA = 0.0, WalkBrake = 0.0;          // life only (0: off)
		bool bTurnFirst = false;                      // from a stand, turn to the wish before setting off
		double TurnFirstRate = 0.0;                   // rad/s for that turn (0: use FaceRate)
		double SprintCone = 35 * Deg, SprintBuild = 0.0, SprintFade = 0.0;
		double CutAngle = 35 * Deg, CutMin = 3.0, CutFloor = 0.3;
		double FaceRate = 12.0, StaggerCap = 2.0, StaggerT = 0.35;

		// mover.js moverParams(skills, "football", {grip})
		static FMoverParams Football(const FMoverSkills& Skills);
	};

	// mover.js createMover's state, plus what the last step did (gait, acc, turnRate, target) for the animation
	struct FMoverState
	{
		double X = 0, Z = 0;          // position on the ground plane, m
		double VX = 0, VZ = 0;        // velocity, m/s
		double Speed = 0;             // |velocity| along the heading, m/s
		double Yaw = 0;               // body facing
		double Heading = 0;           // velocity direction
		double Cut = 0;               // the heading error of a planted cut this step (0 if none)
		double Plant = 0;             // the braking rate of a plant this step (0 if none)
		double Stagger = 0;           // seconds of stagger left (set StaggerT after a lost shoulder duel)
		EGait Gait = EGait::Stand;
		double Acc = 0;               // longitudinal acceleration of the last step, m/s^2
		double TurnRate = 0;          // heading turn rate of the last step, rad/s (+ is to the left)
		double SprintB = 0;           // sprint build (life only; football: 1 while sprinting)
		double Target = 0;            // the target speed of the last step
		double WB = 0;                // life: the brake of a stop that began at a walk

		void Reset(double InX, double InZ, double InYaw) { *this = FMoverState(); X = InX; Z = InZ; Yaw = InYaw; Heading = InYaw; }
	};

	// mover.js intent: {dx, dz (world wish, |d| <= 1 is the throttle), gait, face, strafe, speedCap}
	struct FMoverIntent
	{
		double DX = 0, DZ = 0;
		EGait Gait = EGait::Jog;      // Stand is read as "none given" (the football default is a jog)
		bool bFace = false;           // a held facing: face along (FaceX, FaceZ)
		double FaceX = 0, FaceZ = -1;
		bool bStrafe = false;
		double SpeedCap = std::numeric_limits<double>::infinity();
	};

	// mover.js sprintSpeed: the sprint keeps (0.45 + 0.55 bF) of its margin over the jog, times (0.92 + 0.08 eF)
	double SprintSpeedOf(const FMoverParams& P, const FStaminaFactors& Fac);
	// mover.js gaitSpeed: no gait is ever faster than the tired sprint
	double GaitSpeedOf(const FMoverParams& P, const FStaminaFactors& Fac, EGait Gait);

	// mover.js moverStep: one step of H seconds. No world collision here: Unreal's capsule sweep is the "collide" (see
	// ULRMovementComponent and PORT-movement.md). Nothing is allocated.
	void MoverStep(FMoverState& M, const FMoverIntent& It, const FMoverParams& P, const FStaminaFactors& Fac, double H);

	// ---------------------------------------------------------------------------------------------------------------
	// The third-person control layer (control.js on bcs/controls: BCS, the better control system)
	// ---------------------------------------------------------------------------------------------------------------

	// control.js BCS knobs
	namespace BCS
	{
		constexpr double CURVE_K = 5.0;        // the wish turns at CURVE_K x aLat x turn / max(v, 0.5) ...
		constexpr double CURVE_MIN = 4.0;      // ... clamped to CURVE_MIN .. CURVE_MAX rad/s
		constexpr double CURVE_MAX = 14.0;
		constexpr double SNAP = 120 * Deg;     // a change of more than this (a reversal) goes to the mover as it is
		constexpr double STAND_V = 1.2;        // below this speed every change goes to the mover as it is
		constexpr bool TURN_FIRST = true;      // from a stand, turn on the spot first
		constexpr double TURN_RATE = 13.0;     // rad/s for that turn (mover default 7.5)
		constexpr double FACE_RATE = 12.0;     // rad/s, the facing following the heading
		constexpr double AIM_NEAR = 3.0;       // a charge holds the facing with the ball within this (m)
		constexpr double RECV_T = 0.7;         // receiving: open to a pass arriving within this (s) ...
		constexpr double RECV_V = 2.0;         // ... rolling at this or more (m/s) ...
		constexpr double RECV_ANG = 110 * Deg; // ... from no further round than this off the facing
	}
	// control.js FACE_RATE_FP: first person goes back to the football profile's own facing rate
	constexpr double FACE_RATE_FP = 12.0;
	// control.js CN numbers used by movement
	constexpr double JOCKEY_V = 3.2;       // jockeying: at most 3.2 m/s, side-on (strafe)
	constexpr double SHIELD_NEAR = 2.2;    // a loose ball this close counts for the shield
	// tune.js SH_SPEED: shielding holds you to this share of your jog
	constexpr double SH_SPEED = 0.6;
	// actions.js shieldStep's SH_NEAR: the defender counted for the shield's facing (m)
	constexpr double SH_NEAR = 2.0;
	// control.js SHOT_KEYS.T: W pressed while a shot is held from a stand moves you only after this (s)
	constexpr double SHOT_KEY_T = 0.25;

	// control.js runAfter: how long you go on at a jog before it is a run: 0.6 s at Acceleration 50, 0.3 at 90
	// (0.2 to 0.8). JS reads me.at.acceleration || 50 (not pace).
	double RunAfter(double Acceleration);
	// control.js: a sprint in close control is k of your sprint, k = 0.85 at Dribbling 50, 0.95 at 90 (0.8 to 0.97)
	double CloseControlSprintK(double Dribbling);

	// What the player's hands are doing this step (control.js CTRL, as far as movement reads it). The keys are the raw
	// axes: Forward (W = +1, S = -1) and Right (D = +1, A = -1). CameraYaw is the look's yaw (P.yaw) in sim radians.
	struct FControlInput
	{
		double Forward = 0.0, Right = 0.0;
		double CameraYaw = 0.0;
		bool bThirdPerson = true;      // SET.footCam "third" (the default)
		bool bSprintHeld = false;      // Shift
		bool bWalk = false;            // the X toggle
		bool bShield = false;          // C held and the shield is allowed (ball yours or about to be)
		bool bJockey = false;          // RMB held defending (or the Jockey action)
		bool bJockeyTarget = false;    // face the man on the ball: (JockeyX, JockeyZ) is his position
		double JockeyX = 0.0, JockeyZ = 0.0;
		bool bShieldFrom = false;      // a defender within SH_NEAR: (ShieldFromX, ShieldFromZ) is his position
		double ShieldFromX = 0.0, ShieldFromZ = 0.0;
		bool bAimHold = false;         // a strike being charged or struck needs the facing (the aim = the camera's way)
		bool bReceiving = false;       // a pass about to reach you: face it, along (ReceiveX, ReceiveZ)
		double ReceiveX = 0.0, ReceiveZ = -1.0;
		bool bShotCharging = false;    // LMB held for a shot: A and D curl it and do not move you
		bool bKicking = false;         // a kick under way
		bool bRunShot = true;          // the shot was let go at more than 1.5 m/s (kicking from a stand stops W)
		double WPressedT = -1e9;       // sim time W last went down (for the late W of a shot held from a stand)
		bool bPassComing = false;      // a pass is on its way to you (no step up to a run under it)
		bool bInCloseControl = false;  // close control is on (a sprint with it is capped)
		double AccelerationSkill = 50; // for RunAfter
		double DribblingSkill = 50;    // for CloseControlSprintK
		bool bAnalogThrottle = false;  // a stick: its length is the throttle (the keyboard is always full)
	};

	// The control layer's own memory (control.js CTRL.wish, CTRL.fwdT, CTRL.ran)
	struct FControlLayer
	{
		bool bWishOn = false;
		double WishYaw = 0.0;
		double FwdT = 0.0;
		bool bRan = false;
		// the raw keys' way on the ground this step (the first touch's push goes by it, P6-A), unit or zero
		double KeysX = 0.0, KeysZ = 0.0;
		bool bKeys = false;

		void Reset() { *this = FControlLayer(); }

		// control.js bcsPrm: the mover overlay for third / first person (applied every step)
		static void ApplyViewOverlay(FMoverParams& P, bool bThirdPerson);

		// control.js controlStep's "where you go" block plus the engine's shield cap (actions.js shieldStep):
		// builds the mover's intent for this step. P is the body's params (the overlay is applied to it), M its state,
		// Fac its stamina factors, T the sim time, H the step.
		void BuildIntent(const FControlInput& In, const FMoverState& M, FMoverParams& P, const FStaminaFactors& Fac,
			double T, double H, FMoverIntent& Out);

		// control.js wishStep: the way the body is asked to go turned on towards the keys' way (KX, KZ) this step
		void WishStep(const FMoverState& M, const FMoverParams& P, const FStaminaFactors& Fac, double KX, double KZ, double H,
			double& OutDX, double& OutDZ);
	};

	// ---------------------------------------------------------------------------------------------------------------
	// One body's step, in the order sim.js agentStep runs it (bcs/integ):
	//   controls -> intent (control.js controlStep), moverStep, stamina (stamStep, then the factors), gaitModeStep, the
	//   carry weight eased towards its target (CARRY_EASE_K), phaseAdvance by the distance moved -> footfalls.
	// The caller then plays the footfalls (close control's dribbleFoot), runs keepStep, and calls EndStep (ms.t += h).
	// ULRMovementComponent and the automation tests both drive this, so the tests exercise the component's own pipeline.
	// ---------------------------------------------------------------------------------------------------------------
	struct FBodySim
	{
		FMoverSkills Skills;
		FMoverParams P;               // the params as they are this step (the view overlay applied)
		FMoverState M;
		FMoverIntent I;               // this step's intent
		FStaminaFactors Fac = FStaminaFactors::Fresh();
		FStaminaPool Stamina;
		double StaminaSkill = 50.0;
		double EnergyFactor = 1.0;    // stamina.js effF(energy)
		FGaitClock G;
		FControlLayer Ctrl;
		double Scale = 1.0;           // body height scale (1 = the game's standard body)
		double CarryTarget = 0.0;     // 1 while carrying (sim.js carrying()), eased into G.CK
		double T = 0.0;               // sim time (ms.t)
		int64_t StepIndex = 0;        // ms.step
		double LastDist = 0.0;        // the distance the last step moved

		// fresh params from the skills (call after changing Skills)
		void RebuildParams() { P = FMoverParams::Football(Skills); }
		void Init(double X, double Z, double Yaw);
		// one step: the intent from In (or, with In null, the intent already in I: the AI's or a test's), the mover, the
		// stamina, the gait clock. Writes the footfalls into Falls and returns how many.
		int32_t Advance(double H, const FControlInput* In, FFootfall* Falls, int32_t MaxFalls);
		void EndStep(double H) { T += H; StepIndex++; }
	};
}
