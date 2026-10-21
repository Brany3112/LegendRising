// LRCloseControlCore.h: close control and the carry, ported from js/life/football/actions.js.
//
// Two branches are combined here, as the brief asks:
//   - bcs/controls (c824ef1): close control is AUTOMATIC for the player (keepStep's AUTO rules: taken when you reach the
//     ball first, never your own strike within OWN_T, never within FIRST_T of your own first touch; ended by a tackle
//     'lost', the knock-on 'knock' (Shift twice), the flick 'flick' (the middle button), a kick, out of reach, play
//     stopping, the AI standing in; after a knock-on or a flick you stay out of it while you chase at a sprint, and are
//     back in once the ball has left your feet and you let go of Shift or drop below RUN_K of your run).
//   - bcs/integ (41c4cd0): the FC 27 carry (carryPlan / carryFoot / carryKick): on the move every touch is made on a
//     footfall of the gait clock, planned a footfall ahead; the ball is sent CARRY.LEAD (0.56 m) ahead of the pelvis and
//     CARRY.LAT (0.1 m) to the strong side of where the body will be at that foot's next strike; the strong foot carries
//     it (its toe), turns it (its inside to the weak side, its outside to the strong side); the weak foot only stops it
//     (its sole, if it is the next foot down), makes the first push after a turn that left the ball on its side, plays a
//     ball the strong foot would overrun or could only reach across the other leg; at a sprint the push goes two strides
//     on (push and run). Standing, turning on the spot or under 2 m/s, the spot's touches (ctlTouch) keep it.
// Neither branch has both; the merge is: keepStep from bcs/controls with bcs/integ's carry calls (carryPlan after the
// gathering touch, the carry before the spot's touch) and bcs/integ's ctlTouch (the ball at rest CTL.STAND 0.22 m in
// front standing still). See PORT-movement.md.
//
// Plain C++ in the game's frame (LRMoveMath.h). The ball is a plain state here; ULRCloseControlComponent reads it from
// the real ball through ILRBallInterface and hands every kick back to it.

#pragma once

#include "LRGaitTables.h"
#include "LRMoveMath.h"
#include "LRMoverCore.h"

#include <cstdint>
#include <functional>

namespace LRMove
{
	// the part of the foot a touch is made with (matches ELRFootPart in LRPlayerTypes.h, same order)
	enum class EFootPart : uint8_t { None = 0, Toe = 1, Laces = 2, Inside = 3, Outside = 4, Sole = 5 };
	// which side of the ball the foot meets (matches ELRBallSide)
	enum class EBallSide : uint8_t { Back = 0, Left = 1, Right = 2 };
	// why a touch was made, the JS's `carry` and `how` tags (matches ELRTouchWhy)
	enum class ETouchWhy : uint8_t { None = 0, Gather = 1, Spot = 2, Carry = 3, Run = 4, Turn = 5, Stop = 6, WeakSide = 7, Overrun = 8, Across = 9, Knock = 10 };
	// why close control ended, actions.js a.ctlEnd (matches ELRCloseControlEnd)
	enum class ECtlEnd : uint8_t { None = 0, Stop = 1, Action = 2, Lost = 3, Reach = 4, Knock = 5, Flick = 6, AI = 7 };
	// the player's strong foot, a.foot: 'R', 'L' or 'B' (both: the right carries, as touchSideOf does)
	enum class EStrongFoot : uint8_t { Right = 0, Left = 1, Both = 2 };
	// who touched the ball last, and how (ball.last.agent / kind as keepStep reads them)
	enum class ELastBy : uint8_t { Nobody = 0, Me = 1, Other = 2 };
	enum class ELastKind : uint8_t { None = 0, Dribble = 1, Control = 2, Struck = 3, Deflect = 4, Other = 5 };

	// actions.js TAKE, AUTO, CTL, KNOCK, CARRY and the touch.js / ball.js numbers they use (metres, seconds, m/s)
	namespace Ctl
	{
		// TAKE: the reach and the height of a ball taken into close control
		constexpr double TAKE_REACH = 1.2, TAKE_MAX_Y = 0.5;
		// AUTO (BCS): reach, own strike memory, first-touch hold-off, the chase's release below RUN_K of the run
		constexpr double AUTO_REACH = 1.2, AUTO_OWN_T = 1.0, AUTO_FIRST_T = 0.2, AUTO_RUN_K = 0.9;
		// CTL: the spot (LEAD + LV a m/s of speed, LMAX at most; SIDE of a lead sideways; LAT to the strong side), the
		// reach, the tolerance before a touch, the touch interval DT (halved on a turn), the touch's travel time T, what
		// counts as a turn, the side spin of a turning touch, and (FC27) the rest spot standing still
		constexpr double LEAD = 0.3, LV = 0.05, LMAX = 0.5, SIDE = 0.35, LAT = 0.1, REACH = 1.25, TOL = 0.12, DT = 0.18, T = 0.3;
		constexpr double TURN = 25 * Deg, SPIN = 3.0, STAND = 0.22;
		// KNOCK: the knock-on's distance, its lead over your speed and over your sprint, its reach, and how long a
		// stride's touch leaves the knocked ball alone
		constexpr double KNOCK_D = 9.0, KNOCK_MIN_V = 4.0, KNOCK_OVER = 2.5, KNOCK_REACH = 1.8, KNOCK_LET = 0.8;
		// CARRY (FC27): footfall touches from V_FOOT, keys within FWD (a cosine) of the facing, not a cut past CUT; the
		// spot LEAD ahead / LAT to the strong side; a strike AHEAD past it plays nothing; RUN_N strides on at a sprint,
		// pushed again once within RUN_TOL; OVERRUN, STOP_V, MAX_V; the cross guard XLAT, BACK, FACE; reach BEHIND, WIDE
		constexpr double CARRY_V_FOOT = 2.0, CARRY_FWD = 0.5, CARRY_CUT = 100 * Deg, CARRY_LEAD = 0.56, CARRY_LAT = 0.1, CARRY_AHEAD = 0.1;
		constexpr double CARRY_RUN_N = 2.0, CARRY_RUN_TOL = 0.03, CARRY_OVERRUN = 0.3, CARRY_STOP_V = 2.0, CARRY_MAX_V = 14.0;
		constexpr double CARRY_XLAT = 0.05, CARRY_BACK = 0.1, CARRY_FACE = 0.045, CARRY_BEHIND = 0.15, CARRY_WIDE = 0.85;
		// touch.js TOUCH.WEAK_SIDE: the strong foot plays a ball unless it sits past this to the weak side
		constexpr double WEAK_SIDE = 0.25;
		// ball.js: radius, the quadratic drag of the roll (dv/dt = -(rollDecel + KD v^2)), the grass's roll
		constexpr double BALL_R = 0.11, BALL_KD = 0.0135, ROLL_DECEL = 1.1;
		// control.js flick (MMB): the ball counts as at your feet within this (m)
		constexpr double FLICK_AT_FEET = 1.3;
		// how often (steps) the carry plan is refreshed between footfalls (actions.js: ms.step % 6)
		constexpr int32_t PLAN_EVERY = 6;
	}

	// The ball as close control sees it (sim frame). Y is the centre's height above the grass (0.11 at rest).
	struct FBallState
	{
		double X = 0, Y = Ctl::BALL_R, Z = 0;
		double VX = 0, VY = 0, VZ = 0;
		double WX = 0, WY = 0, WZ = 0;          // spin, rad/s about the sim axes
		bool bFree = true;                       // ball.state === 'free' (not held by a keeper, not dead)
		double RollDecel = Ctl::ROLL_DECEL;
		double DragMul = 1.0;
		ELastBy LastBy = ELastBy::Nobody;
		ELastKind LastKind = ELastKind::None;
		double LastT = -1e9;
	};

	// ball.js closed forms of the ground roll, dv/dt = -(rollDecel + KD v^2)
	double RollDistance(double V0, double V1, double RollDecel, double DragMul);
	double RollSpeedAt(double V0, double T, double RollDecel, double DragMul);
	// actions.js ballAt: the ball rolling on for T s (a ball in the air where it is): position and velocity
	void BallAt(const FBallState& B, double T, double& OutX, double& OutZ, double& OutVX, double& OutVZ);
	// advance a rolling ball by H seconds along the ground (used to predict between engine frames and in tests; a ball in
	// the air is left where it is)
	void RollBall(FBallState& B, double H);

	// What the next touch will be (actions.js a.cplan), which the animation reads to put that foot behind the ball
	struct FCarryPlan
	{
		bool bOn = false;            // a plan exists
		bool bTouch = false;         // that foot plays the ball (false: it comes down beside or behind it)
		EFoot Side = EFoot::Right;
		EFootPart Part = EFootPart::Toe;
		ETouchWhy Why = ETouchWhy::None;
		int32_t N = 0;               // the gait clock's footfall number the touch is planned for
		FPlane2 Way;                 // the way the touch plays the ball (the keys' way when planned)
	};

	// one touch made (actions.js logEv 'touch' with foot, part, ballSide, carry)
	struct FTouchRecord
	{
		EFoot Foot = EFoot::Right;
		EFootPart Part = EFootPart::Toe;
		EBallSide BallSide = EBallSide::Back;
		ETouchWhy Why = ETouchWhy::None;
		double T = 0.0;              // sim time of the contact
		FPlane2 Way;                 // the way it was played
		double KickVX = 0, KickVZ = 0;           // the ball's new velocity (m/s, sim)
		double SpinX = 0, SpinY = 0, SpinZ = 0;  // the ball's new spin (rad/s, sim)
		double BallX = 0, BallY = 0, BallZ = 0;  // where the ball was when it was played
	};

	// The body, read-only (the mover's state, params, stamina factors and this step's intent, the gait clock)
	struct FBodyView
	{
		const FMoverState* M = nullptr;
		const FMoverParams* P = nullptr;
		const FStaminaFactors* Fac = nullptr;
		const FMoverIntent* I = nullptr;
		const FGaitClock* G = nullptr;
		double Scale = 1.0;
		EStrongFoot Foot = EStrongFoot::Right;
	};

	// The rest of the match as keepStep reads it this step
	struct FCtlWorld
	{
		double T = 0.0;              // sim time (ms.t)
		int64_t Step = 0;            // step counter (ms.step)
		bool bLive = true;           // ms.phase === 'live'
		bool bBallMine = false;      // ms.poss.ctl === me (the race's answer: first to it)
		bool bBallOthers = false;    // somebody else has it (ms.poss.ctl >= 0 and not me)
		bool bAIControlled = false;  // ms.meAI: the AI stands in for the player
		bool bCtlAuto = true;        // the player's controls ran this step (intent.ctlAuto)
		bool bAction = false;        // something of his is under way (a.act && !a.act.done)
		bool bActionHeaderOrFake = false;
		bool bFake = false;          // that action is a fake (the drag-back)
		bool bStepIn = false;        // he is stepping in to strike it
		bool bShielding = false;     // a.shield.on: the shield's touches are its own
	};

	class FCloseControlCore
	{
	public:
		// --- state (actions.js a.ctlOn, a.ctlEnd, a.ctlChase, a.ctlOut, a.ownT, a.ctlDir, a.keepT, a.knockT, a.cplan)
		bool bCtlOn = false;
		ECtlEnd End = ECtlEnd::None;
		bool bChase = false;
		bool bOut = false;
		bool bHasOwnT = false;
		double OwnT = 0.0;
		bool bHasCtlDir = false;
		FPlane2 CtlDir;
		double KeepT = -9.0;
		double KnockT = -1e9;
		FCarryPlan Plan;
		bool bKnockRequested = false;   // intent.knock: Shift tapped twice (consumed by KeepStep)

		// called for every touch made, after the ball state has been changed (the wrapper pushes it to the real ball)
		std::function<void(const FTouchRecord&)> OnTouch;

		void Reset() { const auto Keep = OnTouch; *this = FCloseControlCore(); OnTouch = Keep; }

		// actions.js keepStep (after the mover and the footfalls, every step the player's controls run). Returns true
		// when it touched the ball.
		bool KeepStep(FBallState& Ball, const FBodyView& Body, const FCtlWorld& W);

		// actions.js dribbleFoot, close control's part: a footfall of foot `Side`. W.T is the footfall's own time.
		bool OnFootfall(FBallState& Ball, const FBodyView& Body, const FCtlWorld& W, EFoot Side);

		// actions.js startFlick: the flick ends close control and starts the chase
		void NotifyFlick() { Off(ECtlEnd::Flick); bChase = true; bOut = false; }

		// sim.js carrying(): the man the ball is with while it is free and at his feet (close control, or his own
		// dribble: the ball his, free, live, low, within 2 m, nothing of his under way but a fake). The gait clock's
		// carry weight eases towards 1 while this holds.
		bool Carrying(const FBallState& Ball, const FBodyView& Body, const FCtlWorld& W) const;

		// actions.js carryOn: is the carry on (the footfalls' touches)
		bool CarryOn(const FBodyView& Body, bool bFake) const;

		// seconds until the planned touch's foot comes down (sideT at the body's speed), or a negative number
		double TimeToPlannedTouch(const FBodyView& Body) const;

		// actions.js bodyAt: the body t s on, going the way u (or as it goes when bUseWay is false)
		static FPlane2 BodyAt(const FBodyView& Body, double T, bool bUseWay, const FPlane2& U);

	private:
		void Off(ECtlEnd Why) { if (bCtlOn) { bCtlOn = false; End = Why; } }
		static EFoot StrongOf(EStrongFoot F) { return F == EStrongFoot::Left ? EFoot::Left : EFoot::Right; }
		bool KeysWay(const FBodyView& Body, FPlane2& Out) const;
		EFootPart CarryPart(EFoot Side, const FPlane2& U) const;
		void CarryPlan(const FBallState& Ball, const FBodyView& Body, const FCtlWorld& W);
		void PlanSet(const FBodyView& Body, EFoot Side, bool bTouch, EFootPart Part, ETouchWhy Why, const FPlane2& U);
		bool CarryFoot(FBallState& Ball, const FBodyView& Body, const FCtlWorld& W, EFoot Side);
		bool CarryKick(FBallState& Ball, const FBodyView& Body, const FCtlWorld& W, EFoot Side, ETouchWhy Why);
		bool CtlTouch(FBallState& Ball, const FBodyView& Body, const FCtlWorld& W, const FPlane2& U, bool bForce);
		bool KnockOn(FBallState& Ball, const FBodyView& Body, const FCtlWorld& W, const FPlane2& U);
		void Kick(FBallState& Ball, const FCtlWorld& W, FTouchRecord& Rec, double KX, double KZ, double WY);
	};
}
