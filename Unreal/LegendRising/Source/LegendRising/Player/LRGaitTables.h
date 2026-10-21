// LRGaitTables.h: the one gait clock, ported from js/life/gaitcore.js (bcs/integ 41c4cd0, which adds the FC 27
// carrier's table to the bcs/controls version; with no ball the two are identical).
//
// What it is for in Unreal. In the browser game this clock decides when each foot touches down: the simulation's ball
// touches are made on those footfalls, and the drawn legs follow the same clock. In Unreal the legs are drawn by
// animation (Motion Matching), but the clock stays the authority for gameplay: close control plays the ball on its
// footfalls, and it tells the animation in advance which foot comes down when (LRCloseControlComponent's planned
// touch, the movement component's OnFootfall). The animation is then kept in step with it with sync markers (see
// CONTENT-SETUP-movement.md).
//
// How the clock works (gaitcore.js header): phase phi in [0, 1) over one stride (two steps). The left foot touches down
// at phi = 0, the right at phi = 0.5. The phase advances by distance travelled: dphi = dist / (2 * step(v)), so a
// blocked body does not run on the spot and a backward move runs the gait backwards.
//
// Plain C++ (no Unreal types) so the automation tests and a desktop compiler can run it as it is. Units: metres,
// seconds, m/s.

#pragma once

#include <cstdint>

namespace LRMove
{
	// which foot: matches ELRFoot in LRPlayerTypes.h (same order)
	enum class EFoot : uint8_t { Left = 0, Right = 1 };
	// gaitcore.js modes: 'W' walk, 'R' run
	enum class EGaitMode : uint8_t { Walk = 0, Run = 1 };

	inline EFoot OtherFoot(EFoot F) { return F == EFoot::Left ? EFoot::Right : EFoot::Left; }

	namespace Gait
	{
		// One row of a gait table: [speed m/s, steps per minute, step length m, duty (share of a stride a foot is on
		// the ground)]. The steps-per-minute column is informational: the code always uses cadence = v / step.
		struct FRow { double V; double StepsPerMin; double Step; double Duty; };

		// gaitcore.js WALK and RUN (DESIGN 3.5.2)
		extern const FRow WALK[7];
		extern const FRow RUN[8];
		// gaitcore.js CARRY (FC 27 clip, plan/notes/fc27-spec.md 3.1): the ball carrier's short, quick, low steps.
		// At 4.5 m/s the run takes 1.59 m steps at 170 a minute; with the ball at his feet 0.75 m at 360, so his strong
		// foot comes down every 0.33 s and can play the ball on every stride. The last row (7.6 m/s) is past what the
		// clip shows.
		extern const FRow CARRY[6];

		// gaitcore.js CARRY_K: how much of the carrier's gait a carrier gets. K (0 = our run, 1 = the clip's) times the
		// body's carry weight ck (0..1, eased in and out as he takes the ball and lets it go), faded in from a walk
		// between V0 and V1 and out again between V2 and V3 (a full sprint with the ball opens back up to the run).
		struct FCarryK { double K; double V0; double V1; double V2; double V3; };
		constexpr FCarryK CARRY_K{1.0, 1.2, 2.4, 7.6, 9.5};

		// walk posture budgets per WALK row, pelvis yaw range, run swing lift (gaitcore.js; animation only, kept for
		// reference: the drawn gait is replaced by animation in Unreal)
		extern const double WALK_HIP_DROP[7];
		constexpr double WALK_PELVIS_YAW[2] = {0.05, 0.13};
		constexpr double RUN_LIFT[2] = {0.14, 0.50};

		// the longest walking step a leg reaches without crouching, at body scale 1 (3.5.2: "about 0.92 m")
		constexpr double WALK_REACH = 0.92;
		// mode switching (3.5.2): walk to run when v > RUN_ON for RUN_HOLD seconds, run to walk when v < RUN_OFF
		constexpr double RUN_ON = 2.30;
		constexpr double RUN_OFF = 2.00;
		constexpr double RUN_HOLD = 0.15;
		// a carrier's quickest swing (FC27: about 0.17 s at 4.5 m/s, the clip's); the normal floor is 0.22 s
		constexpr double CARRY_SWING = 0.13;
		// the most strides one call may cover: more is a teleport, not walking (no footfalls reported)
		constexpr double MAX_STRIDES = 4.0;
		// sim.js CARRY_EASE_K: one 60 Hz step's share of the carry weight's ease, 1 - e^(-1/9), i.e. a 0.15 s time
		// constant. CarryEaseK(h) gives the same ease for any step length (exactly this number at h = 1/60).
		constexpr double CARRY_EASE_K = 0.10516;
		constexpr double CARRY_EASE_TAU = 0.15;
		double CarryEaseK(double H);

		// how much of the carrier's gait applies at speed v with carry weight ck (gaitcore.js carryW)
		double CarryW(double V, double CK);
		// walk or run for a speed; HeldT is how long v has been above RUN_ON (gaitcore.js gaitMode)
		EGaitMode GaitMode(EGaitMode Prev, double V, double HeldT);
		// the walking reach limit for a body scale (gaitcore.js reachStep)
		inline double ReachStep(double /*V*/, double Scale = 1.0) { return WALK_REACH * Scale; }
		// step length in metres (one foot to the other) at speed v in a mode, for a body of height scale Scale.
		// Walking: the table value, never beyond the reach limit (Reach < 0 means "use the default reach").
		// CK: the carry weight, blending in the carrier's step (gaitcore.js stepLen)
		double StepLen(double V, EGaitMode Mode, double Scale = 1.0, double Reach = -1.0, double CK = 0.0);
		// steps per second at speed v (gaitcore.js cadence)
		double Cadence(double V, EGaitMode Mode, double Scale = 1.0, double Reach = -1.0, double CK = 0.0);
		// duty factor at speed v (a carrier's run: CARRY's; his walk keeps the walk's) (gaitcore.js dutyOf)
		double DutyOf(double V, EGaitMode Mode, double CK = 0.0);
		// seconds for one stride, two steps (gaitcore.js strideTime)
		double StrideTime(double V, EGaitMode Mode, double Scale = 1.0, double CK = 0.0);
		// swing duration of one foot: (1 - duty) * strideTime clamped to 0.22..0.45 s, a carrier's floor down to
		// CARRY_SWING (gaitcore.js swingTime)
		double SwingTime(double V, EGaitMode Mode, double Scale = 1.0, double CK = 0.0);
	}

	// one touchdown found by FGaitClock::PhaseAdvance
	struct FFootfall
	{
		EFoot Side = EFoot::Left;
		// the fraction of the distance passed in at which this foot landed (0 < At <= 1): the footfall's time within the
		// step is StepStart + At * h
		double At = 0.0;
	};

	// The gait state a body carries (gaitcore.js createGait): phase, footfall counter, the last foot down, the walk/run
	// mode with its timer, and the carry weight.
	struct FGaitClock
	{
		double Phi = 0.0;              // [0, 1) over a stride; left down at 0, right at 0.5
		int32_t N = 0;                 // footfalls so far
		EFoot Side = EFoot::Left;      // the last foot down
		EGaitMode Mode = EGaitMode::Walk;
		double Held = 0.0;             // seconds above RUN_ON (for the walk -> run switch)
		double CK = 0.0;               // carry weight 0..1 (FC27)

		void Reset(double InPhi = 0.0, EGaitMode InMode = EGaitMode::Walk, double InCK = 0.0)
		{
			Phi = InPhi; N = 0; Side = InPhi < 0.5 ? EFoot::Left : EFoot::Right; Mode = InMode; Held = 0.0; CK = InCK;
		}

		// gaitcore.js gaitModeStep: the walk/run rule with the timer kept here; returns the mode
		EGaitMode ModeStep(double V, double H);

		// gaitcore.js phaseAdvance: advance the phase by a signed distance (metres along the direction of travel) at
		// speed V. Writes the touchdowns crossed, in order, into Out (room for MaxOut; never more than 8 can occur) and
		// returns how many. A distance, speed or scale that is not finite, or a move of more than MAX_STRIDES strides,
		// changes nothing and returns 0.
		int32_t PhaseAdvance(double Dist, double V, double Scale, FFootfall* Out, int32_t MaxOut);

		// gaitcore.js swingProgress: how far through its swing a foot is (0 at lift-off, 1 at touchdown), or a
		// negative number while it is on the ground
		double SwingProgress(EFoot Foot, double Duty) const;

		// actions.js strideOf: seconds for one stride at v with this clock's mode and carry weight (v floored at 0.3)
		double StrideSeconds(double V, double Scale = 1.0) const;
		// actions.js sideT: seconds until foot `Foot` next comes down, running on at v (the phase runs on by distance)
		double TimeToFootfall(EFoot Foot, double V, double Scale = 1.0) const;
	};
}
