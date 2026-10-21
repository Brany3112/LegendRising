// LRStrikeSolver.h: from "I want the ball there" to a launch, and the kick that carries it out. Plain C++ (no Unreal
// types), all in the browser game's frame (metres, y up, yaw 0 facing -Z; see LRBallCore.h).
//
// Ported from (bcs/integ 41c4cd0):
//   js/life/football/strike.js   launchSpin, solveStrike (+ presolve), deviation, sigmaOf, aimOf, planShot, shot speed
//   js/life/football/actions.js  the reach window (canStrike), the step-in (STEP_IN, stepInOf, stepInSpot and its
//                                steering), kickRequest, kickCtx, kickPresolve, strikeContact, the kick's per-step
//                                logic in actionStep, the flick (FLICK, flickTop, flickFly, flickLaunch, flickStep) and
//                                the knock-on (KNOCK, knockOn)
//   js/life/football/pitchspec.js dirOf, yawOf, wrapA

#pragma once

#include "Ball/LRBallCore.h"

#include <string>

namespace LRStrike
{
	using LRBall::FVec3;

	constexpr double DEG = 3.141592653589793 / 180;

	// pitchspec.js lines 15-17: yaw 0 faces -Z, yaw grows to the left (toward -X)
	struct FDir2 { double X = 0, Z = 0; };
	LEGENDRISING_API FDir2 DirOf(double Yaw);                // (-sin yaw, -cos yaw)
	LEGENDRISING_API double YawOf(double Dx, double Dz);     // atan2(-dx, -dz)
	LEGENDRISING_API double WrapA(double A);                 // into [-pi, pi)

	// ---------------------------------------------------------------------------------------------------------------
	// strike.js STRIKE (lines 28-41)
	// ---------------------------------------------------------------------------------------------------------------
	namespace STRIKE
	{
		constexpr double LOW_MAX = 6 * DEG, LOW_TOP = 15;          // Low contact: elevation at most 6 degrees, topspin 15 rad/s
		constexpr double HIGH_MIN = 14 * DEG, HIGH_BACK = 20;      // High contact: elevation at least 14 degrees, backspin 20 rad/s
		constexpr double ELEV_MIN = -30 * DEG, ELEV_MAX = 70 * DEG;
		constexpr double RANGE_EL = 40 * DEG;                      // about the longest-range elevation under drag
		constexpr double CURL_BASE = 18, CURL_K = 0.25;            // finesse sidespin 18 + 0.25 curve rad/s
		constexpr double TOL = 0.01, MISS_OK = 0.05;               // Newton stops under 1 cm; ok within 5 cm
		constexpr int ITERS = 4, WARM_ITERS = 2;
		constexpr double T_MAX = 6;                                // seconds of flight the solver follows
		constexpr double AIM_Y0 = 0.11, AIM_Y1 = 6.0;              // aim heights are clamped to this
		// knuckle conditions and wobble (1.5.1)
		constexpr double KNUCK_W = 4, KNUCK_V = 24, KNUCK_P = 0.72, KNUCK_A0 = 1.2, KNUCK_A1 = 2.6, KNUCK_F0 = 5, KNUCK_F1 = 9;
		// vertical sigma factor by contact
		constexpr double KV_LOW = 0.8, KV_NORMAL = 0.8, KV_HIGH = 1.2;
		// sigma factor by the ball's state
		constexpr double BS_STILL = 1, BS_ROLLING = 1.1, BS_BOUNCING = 1.25, BS_VOLLEY = 1.5;
	}
	// strike.js SHOT_V (line 410) and SHOT_ACC (line 423)
	namespace SHOT_V
	{
		constexpr double PTS_X[4] = {0, 33, 55, 99};
		constexpr double PTS_Y[4] = {9, 12.915, 25.83, 37.22};
		constexpr double HI = 0.26, SPREAD = 0.023;
	}
	namespace SHOT_ACC
	{
		constexpr double K = 0.026, EXP = 1.7095113, SIT = 0.012;
	}

	// the kinds a strike's context can be (strike.js SHOT_KINDS, GROUND_KINDS, DRIVEN_KINDS)
	enum class EKind : unsigned char { Shot, Chip, Pass, Through, Roll, Cross, Lob, Clear, Header, Throw };
	LEGENDRISING_API bool IsShotKind(EKind K);     // shot, chip
	LEGENDRISING_API bool IsGroundKind(EKind K);   // pass, through, roll
	LEGENDRISING_API const char* KindName(EKind K);

	enum class EFoot : unsigned char { Right, Left, Both };

	// ---------------------------------------------------------------------------------------------------------------
	// the launch solver (strike.js lines 53-255)
	// ---------------------------------------------------------------------------------------------------------------

	// strike.js launchSpin: topspin for Low (contact < 0), backspin for High (> 0) about the right of the facing
	// (dx, dz); finesse sidespin |curl|*(18 + 0.25 curve) curling toward the striking foot's inside for curl > 0
	LEGENDRISING_API FVec3 LaunchSpin(double Dx, double Dz, int Contact, double Curl, bool bLeftFoot, double Curve = 50);

	struct FStrikeRequest
	{
		FVec3 From;                  // the ball's centre
		FVec3 Target;                // where it is to go (its height clamped to R..60)
		double Speed = 20;           // m/s, clamped 0.1..VMAX
		int Contact = 0;             // -1 Low (driven), 0 Normal, 1 High (chip, lofted)
		double Curl = 0;             // -3..3
		bool bLeftFoot = false;
		EKind Kind = EKind::Shot;
		double RollDecel = 1.1;
		double Curve = 50;           // the curve skill (finesse spin)
		double Aero = 0;             // the striker's aero skill: drag x (1 - 0.0045 aero)
	};

	struct FKnuckleLaunch
	{
		bool bOn = false;
		double Amp = 0, Freq = 0, Phase = 0;
	};

	struct FStrikeLaunch
	{
		FVec3 V, W;                  // launch velocity and spin
		bool bOk = false;            // false: out of reach at that speed and contact (the closest launch is returned)
		double TFlight = 0, Apex = 0, Yaw = 0, Elev = 0, Miss = 0;
		int Iters = 0;
		FKnuckleLaunch Knuck;        // set by PlanShot
	};

	// a warm start: a solve of nearly the same strike a moment earlier (strike.js presolveWarm)
	struct FWarmStart
	{
		bool bValid = false;
		double Yaw = 0, El = 0;
		bool bHasJ = false;
		double J[4] = {0, 0, 0, 0};  // [dlat/dyaw, dlat/del, dver/dyaw, dver/del]
	};

	// strike.js solveGen as a resumable solve: each StepFlight() runs to the JS generator's next yield (one flight),
	// so a kick's swing can carry it one flight a step (presolve/presolveStep). Solve() runs it to the end
	// (solveStrike). Newton on the real ball integrator, at most 4 updates (2 from a warm start).
	class LEGENDRISING_API FStrikeSolve
	{
	public:
		void Begin(const FStrikeRequest& Req, const FWarmStart* Warm = nullptr);
		// one generator step; true once finished (then Result() is set)
		bool StepFlight();
		bool IsDone() const { return bDone; }
		const FStrikeLaunch& Result() const { return Res; }
		// strike.js presolveWarm: the best launch so far and the last Jacobian (invalid before the first flight)
		FWarmStart Warm() const;
		int Flights() const { return StN; }

	private:
		enum class EPhase : unsigned char { Start, RollLoop, MainLoop, NeedE2, NeedUpdate, Done };
		struct FEval { double Lat = 0, Ver = 0, T = 0, Apex = 0, X = 0, Y = 0, Z = 0; bool bShort = false; };
		FEval EvalLaunch(double Yaw, double El) const;
		void Keep();
		void Finish(bool bDirect, const FVec3& VDirect, double Yaw, double El, bool bOk, double TFlight, double Apex, double Miss, int Iters);
		void Update();

		FStrikeRequest Rq;
		// the request as solveGen normalises it (sv)
		FVec3 From;
		double Speed = 0, Curl = 0, Curve = 50, DragMul = 1, RollDecel = 1.1;
		int Contact = 0;
		bool bLeft = false;
		double Tx = 0, Ty = 0, Tz = 0, Ax = 0, Az = 0, Rx = 0, Rz = 0, YawT = 0, D = 0, Lo = 0, Hi = 0;
		// the search
		EPhase Phase = EPhase::Start;
		bool bDone = false;
		bool bHasWarmIn = false;
		FWarmStart WarmIn;
		double Yaw = 0, El = 0;
		int It = 0, MaxIt = STRIKE::ITERS;
		bool bWarmJ = false;
		double WarmJ[4] = {0, 0, 0, 0};
		FEval E;
		double Lat = 0, Ver = 0, T = 0, ApexV = 0;
		bool bShort = false;
		double BestScore = 0, BestYaw = 0, BestEl = 0, BestT = 0, BestApex = 0, BestMiss = 0;
		double L1 = 0, V1 = 0, L2 = 0, V2 = 0, EStep = 0;
		bool bS1 = false, bS2 = false;
		// presolve state (st)
		double StYaw = 0, StEl = 0;
		bool bStHasJ = false;
		double StJ[4] = {0, 0, 0, 0};
		int StN = 0;
		FStrikeLaunch Res;
	};

	// strike.js solveStrike: the whole solve at once
	LEGENDRISING_API FStrikeLaunch SolveStrike(const FStrikeRequest& Req, const FWarmStart* Warm = nullptr);

	// ---------------------------------------------------------------------------------------------------------------
	// deviation (strike.js lines 259-342): skill, fatigue, pressure, the weak foot, the body and the ball's state
	// ---------------------------------------------------------------------------------------------------------------
	enum class EBallMotion : unsigned char { Still, Rolling, Bouncing, Volley };

	struct FStrikeCtx
	{
		EKind Kind = EKind::Shot;
		bool bHasDist = false;
		double Dist = 0;
		double Power01 = 0.8;        // the charge (shots)
		double Acc = 50;             // accuracy (shots) or pass accuracy
		int Contact = 0;
		EFoot WeakFoot = EFoot::Right;   // Right: the strong foot; Left: the weak foot; Both: a two-footed player
		double BodyAngleDeg = 0;
		double PlantErr = 0;
		EBallMotion BallState = EBallMotion::Still;
		double Pressure01 = 0, Composure = 50, BF = 1, EF = 1;
		bool bFinesse = false, bFirstTime = false;
		double VIn = 0;
		double Power = 50;           // the power skill
		bool bScuff = false;
		bool bHasWeightSigma = false;
		double WeightSigma = 0.02;
		bool bHasZ = false;          // the three unit draws made earlier (devDraws)
		double Z[3] = {0, 0, 0};
	};

	struct FDeviation
	{
		double Ex = 0, Ey = 0, Es = 1, S = 0, Sv = 0;
	};

	LEGENDRISING_API double SigmaOf(const FStrikeCtx& Ctx);                        // strike.js sigmaOf
	LEGENDRISING_API FDeviation Deviation(const FStrikeCtx& Ctx, LRBall::FRng& R);  // strike.js deviation
	LEGENDRISING_API void DevDraws(LRBall::FRng& R, double Out[3]);                // strike.js devDraws
	LEGENDRISING_API double CleanOf(const FStrikeCtx& Ctx);                        // strike.js cleanOf
	LEGENDRISING_API double AccSigma(double Acc);                                  // strike.js accSigma
	LEGENDRISING_API double ShotVFull(double Power);                               // strike.js shotVFull
	LEGENDRISING_API double ShotSpeed(double Power, double P, bool bStrikeBoots = false, double FacPower = 1);

	// strike.js aimOf: the deviation sample moves the aim in the target plane
	struct FAim
	{
		FStrikeCtx Ctx;
		FDeviation Dev;
		FVec3 Aimed;
		bool bGround = false;
		double D = 0;
		FStrikeRequest Req;          // the request to solve: aimed target, speed x es
	};
	LEGENDRISING_API FAim AimOf(const FStrikeRequest& Req, const FStrikeCtx& Ctx, LRBall::FRng& R);

	// strike.js planShot: the deviation, the solve, the knuckle
	struct FShotPlan
	{
		FStrikeLaunch Launch;
		FVec3 Aimed;
		double Sigma = 0, SigmaM = 0, Quality = 0;
		FDeviation Dev;
	};
	LEGENDRISING_API FShotPlan PlanShot(const FStrikeRequest& Req, const FStrikeCtx& Ctx, LRBall::FRng& R, const FWarmStart* Warm = nullptr);

	// actions.js passSpeedFor and loftSpeedFor (lines 265-268)
	LEGENDRISING_API double PassSpeedFor(double D, double Arrive = 9, double Roll = 1.1);
	LEGENDRISING_API double LoftSpeedFor(double D);

	// ---------------------------------------------------------------------------------------------------------------
	// the flick (actions.js lines 913-1003) and the knock-on (lines 1021, 1296-1305)
	// ---------------------------------------------------------------------------------------------------------------
	namespace FLICK
	{
		constexpr double TC = 0.2, WAIT = 1.8, REACH = 0.85, DUR = 0.7, SPIN = 12;
		constexpr double H_PTS_X[4] = {0, 33, 55, 99};
		constexpr double H_PTS_Y[4] = {0.5, 1.5, 3, 4.5};
		constexpr double H_MAX = 5, D_K = 0.75, D_0 = 0.5, KEEPY_D = 0.3;
	}
	namespace KNOCK
	{
		constexpr double D = 9, MIN_V = 4, OVER = 2.5, REACH = 1.8, LET = 0.8;
	}
	// the most a player's Strength can flick it up (the ball's middle at its top, m)
	LEGENDRISING_API double FlickTop(double Strength);
	// a copy of the ball launched from P (vh along (ux, uz), vy up, spin W): its top and how far on it comes down
	LEGENDRISING_API void FlickFly(const FVec3& P, double Ux, double Uz, double Vh, double Vy, const FVec3& W, double RollDecel,
		double& OutTop, double& OutD);
	// the launch (vy, vh) that tops out at Top and comes down D on, fitted by halves on the real ball
	LEGENDRISING_API void FlickLaunch(const FVec3& P, double Ux, double Uz, double Top, double D, const FVec3& W, double RollDecel,
		double& OutVy, double& OutVh);

	// the whole flick touch (actions.js flickStep after its checks): the bar's share P (0..1), the keys' way (Fwd +1 on,
	// -1 back over the head; Side +1 right, -1 left) from the facing Face at the flick's start
	struct FFlickResult
	{
		FVec3 V, W;
		double Top = 0, Land = 0, Ux = 0, Uz = 0;
		const char* Flick = "flick";     // keepy, rainbow, sombrero, chip, flick
		const char* Part = "laces";      // laces, heel, outside, inside, toe
	};
	LEGENDRISING_API FFlickResult FlickKick(const FVec3& BallP, double BallRollDecel, FDir2 Face, double P, int Fwd, int Side,
		double Strength, bool bFirstTime, bool bLeftFooted);

	// actions.js knockOn: the ball KNOCK.D on along (Ux, Uz) (unit), faster than the sprint by OVER, MIN_V over the speed now
	LEGENDRISING_API void KnockOnLaunch(double RollDecel, double Scale, double BodySpeed, double SprintSpeed, double Ux, double Uz,
		FVec3& OutV, FVec3& OutW);

	// ---------------------------------------------------------------------------------------------------------------
	// where and when a ground strike meets the ball (actions.js ACT, canStrike, STEP_IN, strikeRoot)
	// ---------------------------------------------------------------------------------------------------------------
	namespace ACT
	{
		constexpr double REACH0 = 0.45, REACH1 = 0.90, REACH_LAT = 0.5;
		constexpr double TC_MAX = 0.18, ADJUST = 0.35, SCUFF_D = 1.3;
		constexpr double FOLLOW = 0.28;
		constexpr double RHYTHM_SHOT = 0.12, RHYTHM_PASS = 0.06;
		constexpr double CLEAN_PLANT = 0.03;
		constexpr double WHIFF_H = 1.0;          // (VOLLEY.WHIFF_H: a ball this high above the feet is missed)
		constexpr double WEAK_SIDE = 0.25;       // (touch.js TOUCH.WEAK_SIDE: the weak foot for a ball this far over)
	}
	// actions.js STEP_IN (lines 182-184) and the drawn shot's clock (moves.js SHOT, lines 105-107; KINDS.instep)
	namespace STEP_IN
	{
		constexpr double T0 = 0.30, T1 = 0.35, PER = 0.07;
		constexpr double PLANT_LAT = 0.33, PLANT_ALONG = -0.08;   // the support foot from the ball: across, along the aim
		constexpr double V_BALL = 2.0, V_ROLL = 3.2, V_BODY = 4.4, REACH = 0.9, AHEAD = 0.1, BACK = 0.184, SIDE = 0.28;
		constexpr double TOL = 0.3, VMAX = 2.3, ON = 0.3, KEEP = 0.9, VON = 2.0, FOLLOW = 0.37, TURN = 1.75;
		constexpr double TURN_BY = 0.15, LAT_BY = 0.12, LAT_V = 0.8, PLANT_T = 0.2, V_PLANT = 1.4;
	}
	namespace SHOT_CLOCK
	{
		constexpr double PLANT_BEFORE = 0.20;    // KINDS.instep.contact: the plant 0.20 s before the contact
		constexpr double TOE_OFF = 0.0;          // SHOT.OFF: the kicking foot leaves at the plant's moment
		constexpr double TOP_BEFORE = 0.10;      // SHOT.TOP: top of the backswing 0.10 s before the contact
		constexpr double FT_AFTER = 0.115;       // SHOT.FT: follow-through top 0.115 s after
		constexpr double LAND_AFTER = 0.36;      // SHOT.LAND: the kicking foot down 0.36 s after
		constexpr double S_HEEL = 0.20, S_OFF = 0.27, S_LAND = 0.58;   // the support foot after the contact, on the move
	}
	constexpr double STRIKE_ROOT_MIN = 0.3;

	// the body as the strike reads it (agent a.m and friends)
	struct FBody
	{
		double X = 0, Z = 0, Y = 0, Yaw = 0, Speed = 0, Vx = 0, Vz = 0;
		double Scale = 1;
		EFoot Foot = EFoot::Right;   // the preferred foot
		double SprintSpeed = 8;      // (a.prm.sprint)
	};

	// actions.js footFor and canStrike: the reach window for release-to-contact
	struct FReach
	{
		bool bOk = false;
		int Side = 1;
		double Tc = ACT::TC_MAX;
		bool bLeftFoot = false;
		double Ahead = 0, Lat = 0, Dist = 0;
	};
	LEGENDRISING_API FReach CanStrike(const FBody& A, const LRBall::FBallState& Ball);

	// actions.js strikeRoot: the root's speed through a strike as a share of the approach speed
	LEGENDRISING_API double StrikeRoot(double T, double Contact);

	// the step-in (actions.js stepInOf/stepInSpot)
	struct FStepIn
	{
		double X = 0, Z = 0;         // the root's place at the contact
		double Fx = 0, Fz = 0;       // the aim
		bool bLeftFoot = false;      // the kicking foot
		double Err = 0, VC = 0, T = 0.33, V0 = 0;
		double PlantX = 0, PlantZ = 0;   // where the support foot plants (the clip's [0.33, -0.08] from the ball)
	};
	// the shot request as the step-in reads it
	struct FShotAsk
	{
		EKind Kind = EKind::Shot;
		bool bHasTarget = true;
		FVec3 Target;
		double Power = 0.85;
		bool bHasSpeed = false;
		double Speed = 0;
		int Contact = 0;
		bool bFinesse = false, bChip = false, bQuick = false, bDrive = false;
		bool bStyle = false;         // rq.style set: a placed side-foot ('side') or a chip ('chip'); never stepped into
		bool bHasBend = false;
		double Bend = 0;
		bool bHasCurl = false;
		double Curl = 0;
		bool bClean = false, bScuff = false, bFirstTime = false, bCharged = false, bSweet = false;
		double Over = 0;
		bool bHasWeightSigma = false;
		double WeightSigma = 0;
	};
	LEGENDRISING_API void StepInSpot(const FBody& A, const FShotAsk& Rq, const FVec3& BallP, FStepIn& Si);
	LEGENDRISING_API bool StepInOf(const FBody& A, const FShotAsk& Rq, const LRBall::FBallState& Ball, const LRBall::FPredCache& Pred,
		double NowT, bool bLeftFoot, bool bRestartTaker, FStepIn& Out);

	// ---------------------------------------------------------------------------------------------------------------
	// the kick act (actions.js startKick, actionStep's 'kick' case, kickRequest, kickCtx, kickPresolve, strikeContact)
	// ---------------------------------------------------------------------------------------------------------------

	// the striker's attributes and condition
	struct FStriker
	{
		double Power = 50, Accuracy = 50, PassAcc = 50, Passing = 50, Curve = 50, Aero = 0, Composure = 50;
		bool bStrikeBoots = false;
		bool bHasFacPower = false;
		double FacPower = 1, BF = 1, EF = 1;
	};

	// what the act reads from the match each step
	struct FKickEnv
	{
		LRBall::FBallState* Ball = nullptr;
		LRBall::FPredCache* Pred = nullptr;
		LRBall::FWorld* PredWorld = nullptr;  // for refreshing the cache after the contact
		LRBall::FRng* Rng = nullptr;
		double NowT = 0;             // the match clock at this step (before it advances)
		int StepIndex = 0;
		FBody Body;
		FStriker Striker;
		bool bInControl = false;     // ms.poss.ctl === a.id
		double Pressure01 = 0;       // pressureOn(ms, a)
		bool bDeadBall = false;      // a set piece: walked up to
		bool bRestartTaker = false;
		FVec3 ScuffGoal;             // a scuffed shot's aim lerps 25% toward this (the goal centre, y 1.0)
		int Agent = -1, Team = -1;
	};

	// the steering the act asks of the body this step (a.intent)
	struct FKickSteer
	{
		bool bSet = false;           // false: the act leaves the body's own steering alone
		bool bHasDir = false;
		double Dx = 0, Dz = 0;       // the way to go (unit)
		bool bHasFace = false;
		double FaceX = 0, FaceZ = 0; // the facing to hold
		double SpeedCap = 1e9;
		bool bHasStand = false;      // stride adjust: steer to this spot (actions.js steer())
		double StandX = 0, StandZ = 0;
	};

	struct FKickAct
	{
		FShotAsk Action;
		double T = 0, Tc = 0, Dur = 0, AdjustMax = ACT::ADJUST;
		bool bAdjust = false, bDone = false;
		bool bLeftFoot = false;
		int Side = 1;
		bool bStepIn = false;
		FStepIn StepIn;
		int StartStep = 0, ContactStep = -1;
		bool bVInSet = false;
		double VIn = 0;
		// the presolve (kickPresolve): -1 not begun, 0 none for this kick, 1 running
		int PreState = -1;
		FStrikeSolve Pre;
		bool bHasDevZ = false;
		double DevZ[3] = {0, 0, 0};
		// the outcome, once struck
		bool bStruck = false, bWhiff = false, bScuffed = false;
		FShotPlan Plan;
		double Clean = 0;            // the strike's quality (actions.js extra.strike)
		double ContactT = 0;         // act time of the contact
	};

	// actions.js startKick
	LEGENDRISING_API FKickAct StartKick(const FKickEnv& Env, const FShotAsk& Action);
	// one step of the act (actions.js actionStep 'kick' case): advances Act.T by H, steers, strikes the ball when the
	// time comes (a real LRBall::Kick on Env.Ball). Returns true on the step the ball was struck (or missed).
	LEGENDRISING_API bool KickStep(FKickAct& Act, FKickEnv& Env, double H, FKickSteer& OutSteer);
}
