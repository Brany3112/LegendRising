// LRBallCore.h: the ball model of js/life/football/ball.js (bcs/integ 41c4cd0), ported to plain C++.
//
// This is the "pure-function core": no Unreal types, no globals, no randomness except the seeded generator handed in.
// ULRBallComponent (LRBallComponent.h) wraps it for the engine; tests and the standalone bit-exactness check in
// PORT-ball.md call it directly.
//
// FRAME AND UNITS. Everything in this file is in the browser game's own frame: metres, seconds, radians, y up, grass
// at y = 0, a resting ball's centre at y = R = 0.11, yaw 0 facing -Z, right of a facing (dx, dz) being (-dz, dx).
// Spin w is rad/s about the world axes; the Magnus force is KM*(w x v). Conversion to Unreal (centimetres, Z up,
// X forward) happens only at the edge, in LRUnits.h.
//
// INTEGRATION (ball.js lines 19-25, 3.1.1 of the game's design): one step is h seconds (the game uses 1/60). Each step
// is cut into n = clamp(ceil(vMax*h/0.12), 1, 6) sub-steps so the ball never moves more than 12 cm in one. Inside a
// sub-step the forces are taken at its start and the motion under them is exact (p += v*t + a*t*t/2). Collisions are
// swept along the piece, earliest first, at most 3 per sub-step: the ground exactly on the parabola, everything else
// on the chord. Events are queued and handed out when the step is over.

#pragma once

#include <cstdint>
#include <functional>
#include <string>
#include <vector>

#ifndef LEGENDRISING_API
#define LEGENDRISING_API
#endif

namespace LRBall
{
	// ---------------------------------------------------------------------------------------------------------------
	// Constants. ball.js lines 34-36 (BALL, the frozen table) and 39-53 (BALL_X).
	// ---------------------------------------------------------------------------------------------------------------
	namespace BALL
	{
		constexpr double R = 0.11;            // ball radius, m
		constexpr double G = 9.81;            // gravity, m/s^2
		constexpr double KD = 0.0135;         // quadratic drag: a = -KD*dragMul*|v|*v
		constexpr double KM = 0.0055;         // Magnus: a = KM*(w x v)
		constexpr double AMAX = 9;            // the Magnus acceleration is capped at this, m/s^2
		constexpr double SPIN_DECAY = 0.25;   // airborne spin decays as exp(-0.25 t)
		constexpr double E_MAX = 0.62;        // ground restitution, highest (slow impacts)
		constexpr double E_MIN = 0.45;        // ground restitution, lowest (hard impacts)
		constexpr double MU = 0.4;            // ground friction at a bounce
		constexpr double ROLL_STOP = 0.05;    // a grounded ball slower than this stops dead
		constexpr double VMAX = 40;           // speed cap, m/s
		constexpr double SUB_TRAVEL = 0.12;   // the most a sub-step may move the ball, m
		constexpr double E_POST = 0.6;        // posts and bar: restitution
		constexpr double MU_POST = 0.15;      //   and friction
		constexpr double E_BOARD = 0.5;       // advertising boards and life walls: restitution
		constexpr double E_BODY = 0.3;        // bodies and hands: restitution
		constexpr double NET_K = 600;         // nets (not ported, see PORT-ball.md): spring
		constexpr double NET_C = 25;          //   damper
		constexpr double NET_T = 3;           //   tangential damping
	}
	namespace BALL_X
	{
		constexpr double ROLL_VY = 0.6;       // a bounce leaving the ground slower than this becomes rolling
		constexpr double AIR_Y = 0.002;       // airborne above R + this, or rising faster than AIR_VY
		constexpr double AIR_VY = 0.05;
		constexpr double ROLL_SPIN = 8;       // per second: rolling spin locks to v/R at this rate
		constexpr double NET_IN = 4;          // (nets, not ported)
		constexpr double NET_MAX = 1.2;       // (nets, not ported)
		constexpr double SPREAD = 8 * 3.141592653589793 / 180;   // sigma of the spread off a body or a board, rad
		constexpr double MU_BOARD = 0.3;
		constexpr double MU_BODY = 0.3;
		constexpr double SLEEP_T = 0.3;       // (life balls sleep: only with life solids, not ported)
		constexpr double GHOST_T = 0.25;      // the kicker's own body ignores the ball this long after his touch
		constexpr int MAX_SUB = 6;
		constexpr int MAX_HITS = 3;
		constexpr int MAX_PIECES = 16;
		// a standing body as three upright capsules, times the body's height scale h
		constexpr double BODY_LEGS_TOP = 0.85, BODY_LEGS_R = 0.16, BODY_TORSO_TOP = 1.5, BODY_TORSO_R = 0.25;
		constexpr double BODY_HEAD_Y = 1.66, BODY_HEAD_R = 0.12;
		constexpr double EDGE_R = 0.02;       // the rounded top edge of a board
	}

	// a vector in the sim frame (metres, y up)
	struct FVec3
	{
		double X = 0, Y = 0, Z = 0;
	};

	// ---------------------------------------------------------------------------------------------------------------
	// The seeded generator (js/life/football/rng.js): mulberry32 plus a Box-Muller normal with its cached second
	// value, and the truncated normal the spread and the strike deviation use. Same seed, same numbers as the JS.
	// ---------------------------------------------------------------------------------------------------------------
	class LEGENDRISING_API FRng
	{
	public:
		explicit FRng(uint32_t Seed = 0);
		// a uniform draw in [0, 1) (rng.js mulberry32)
		double Next();
		// a standard normal (rng.js gauss)
		double Gauss();
		// a normal with standard deviation Sigma, redrawn until within Cap*Sigma (rng.js truncNormal)
		double TruncNormal(double Sigma, double Cap = 2.5);

		uint32_t State = 0;
		bool bHasSpare = false;
		double Spare = 0;
	};

	// ---------------------------------------------------------------------------------------------------------------
	// The ball (ball.js createBall, lines 67-76)
	// ---------------------------------------------------------------------------------------------------------------
	enum class EBallState : uint8_t { Free, Held, Dead };

	// the knuckle wobble armed by a strike (strike.js planShot): a sideways acceleration amp*sin(freq*t + phase)
	struct FKnuckle
	{
		bool bOn = false;
		double Amp = 0, Freq = 0, Phase = 0, T = 0;
	};

	// who touched the ball last, and where (ball.js b.last)
	struct FLastTouch
	{
		int Agent = -1, Team = -1;
		std::string Kind;
		double T = 0, X = 0, Z = 0;
	};

	struct FPendingTouch
	{
		int Agent = -1, Team = -1;
		std::string Kind;
		double T = -1;
	};

	struct LEGENDRISING_API FBallState
	{
		FVec3 P{0, BALL::R, 0};
		FVec3 V;
		FVec3 W;
		double DragMul = 1;          // 1 - 0.0045*aero of the last striker (a clean striker's ball flies further)
		FKnuckle Knuck;
		EBallState State = EBallState::Free;
		int Holder = -1;
		FLastTouch Last;
		double RollDecel = 1.1;      // the grass's rolling deceleration, m/s^2 (the pitch's pace)
		bool bSleep = false;         // (life balls only; never set by this port)
		double Still = 0;            // seconds at rest
		bool bGrounded = true;
		FPendingTouch Pend[4];       // touches waiting to be reported by the next Step
		int PendN = 0;
	};

	// ball.js createBall
	LEGENDRISING_API FBallState CreateBall(double X = 0, double Y = BALL::R, double Z = 0, double RollDecel = 1.1);

	// what a touch tells the ball (ball.js ballKick's touch argument)
	struct FTouch
	{
		int Agent = -1, Team = -1;
		std::string Kind;            // empty means "kick"
		double Aero = 0;             // the striker's aero skill (0..99): drag x (1 - 0.0045 aero) for this flight
		bool bHasT = false;          // the touch's time (else the step's clock is used)
		double T = 0;
		FKnuckle Knuck;              // armed when Knuck.bOn
	};

	// ball.js ballKick (lines 82-103): the only way a player changes the ball's velocity. Speed capped at VMAX.
	LEGENDRISING_API void Kick(FBallState& B, const FVec3& V, const FVec3& W, const FTouch& Touch);

	// ball.js ballHold (lines 108-123): a holder takes the ball (hands or feet). Call every step while held; the held
	// ball moves with HolderV and nothing else.
	LEGENDRISING_API void Hold(FBallState& B, int HolderId, int HolderTeam, bool bHasPos, const FVec3& Pos, const FVec3& HolderV,
		bool bHasT, double T);

	// ball.js ballRelease (lines 126-138)
	LEGENDRISING_API void Release(FBallState& B, bool bHasPos, const FVec3& Pos, const FVec3& V, const FVec3& W);

	// ---------------------------------------------------------------------------------------------------------------
	// The world the ball lives in (ball.js createBallWorld, lines 149-181), reduced to what the port carries: the
	// ground (a flat floor at FloorY), static capsules (posts, crossbar, board edges), plane boards, bodies and hands.
	// ---------------------------------------------------------------------------------------------------------------
	enum class EHitKind : uint8_t { None, Ground, Post, Bar, Board, Body, Wall };

	// a capsule from A to B with radius r (ball.js capsule(), lines 184-189); Rr is r + R
	struct FCapsule
	{
		double Ax = 0, Ay = 0, Az = 0, Ux = 0, Uy = 0, Uz = 0, L = 0, Rad = 0, Rr = 0;
		EHitKind Kind = EHitKind::Post;
		int End = 0;
		double X0 = 0, X1 = 0, Y0 = 0, Y1 = 0, Z0 = 0, Z1 = 0;
	};
	// a board: the plane n.p = d with its bounds (ball.js boardOf, lines 217-220)
	struct FBoard
	{
		double Nx = 0, Ny = 0, Nz = 0, D = 0, E = BALL::E_BOARD;
		double X0 = 0, X1 = 0, Y0 = 0, Y1 = 0, Z0 = 0, Z1 = 0;
	};
	// a body at the END of the step (ball.js bodies() records): root x, z, height scale h, velocity, optional jump y,
	// optional single capsule (a diving keeper), ghost to skip
	struct FBodyRec
	{
		int Id = -1, Team = -1;
		double X = 0, Z = 0, H = 1, Vx = 0, Vy = 0, Vz = 0, Y = 0;
		bool bGhost = false;
		bool bSeg = false;
		double SegAx = 0, SegAy = 0, SegAz = 0, SegBx = 0, SegBy = 0, SegBz = 0, SegR = 0.2;
	};
	// a hand (keeper hands, tackle feet) at the end of the step
	struct FHandRec
	{
		int Id = -1, Team = -1;
		double X = 0, Y = 0, Z = 0, Rad = 0.1, Vx = 0, Vy = 0, Vz = 0;
	};

	enum class EEventType : uint8_t { Touch, Bounce, Post, Bar, Board, Body, Wall };

	// one event of 1.4.10 (ball.js emit calls); fields not used by a type stay at their defaults
	struct FEvent
	{
		EEventType Type = EEventType::Touch;
		double T = 0, X = 0, Y = 0, Z = 0;
		double Speed = 0;            // normal approach speed (post, bar, board, body, wall)
		double Vy = 0, E = 0;        // bounce: the impact's vertical speed and the restitution used
		FVec3 VIn, VOut, N;          // collisions: velocity in and out, contact normal
		int End = 0, Id = -1, Team = -1, Agent = -1;
		std::string Part, Kind;      // body part ('legs', 'torso', 'head', 'body', 'hand'); touch kind
	};

	// one straight piece of motion, for tracing (ball.js trace)
	struct FTracePiece
	{
		EHitKind Kind = EHitKind::None;
		double X0 = 0, Y0 = 0, Z0 = 0, X1 = 0, Y1 = 0, Z1 = 0, Dt = 0;
	};

	struct FFlyProbe;

	struct LEGENDRISING_API FWorld
	{
		std::vector<FCapsule> Caps;
		std::vector<FBoard> Boards;
		// set these before each Step (the game reads them once a step, as ball.js reads bodies() and hands())
		std::vector<FBodyRec> Bodies;
		std::vector<FHandRec> Hands;
		// the spread off bodies and boards draws from this (none: no spread, as ball.js with no rng)
		FRng* Rng = nullptr;
		// events: handed to OnEvent at the end of each step when it is set, else (with bCollectEvents) appended to
		// Events for the caller to drain
		std::function<void(const FEvent&)> OnEvent;
		std::vector<FEvent> Events;
		bool bCollectEvents = true;
		// optional trace of every straight piece (tests)
		std::function<void(const FTracePiece&)> Trace;
		double T = 0;                // the clock Step advances
		double FloorY = 0;           // the ground's height
		bool bPredFence = false;     // predictions keep the boards (ball.js ballPredFence)

		// internal
		std::vector<FEvent> Queue;
		FFlyProbe* Fly = nullptr;
	};

	// a post, the crossbar or any static capsule (ball.js capsule())
	LEGENDRISING_API void AddCapsule(FWorld& W, double Ax, double Ay, double Az, double Bx, double By, double Bz, double Radius,
		EHitKind Kind, int End);
	// a board plane n.p = d (n unit), its restitution and bounds; bAddEdge also adds its rounded top edge, a capsule of
	// radius EDGE_R from EdgeA to EdgeB (ball.js adds it from the board quad's corners 3 to 2)
	LEGENDRISING_API void AddBoard(FWorld& W, const FBoard& Board, bool bAddEdge, const FVec3& EdgeA, const FVec3& EdgeB);

	// ball.js ballStep (lines 345-390): one step of H seconds. Advances W.T by H.
	LEGENDRISING_API void Step(FBallState& B, FWorld& W, double H);

	// the world a prediction runs in (ball.js predWorld): the same posts and bar, no bodies, hands, events or spread;
	// boards only with bPredFence
	LEGENDRISING_API FWorld MakePredictionWorld(const FWorld& W);

	// ball.js ballPredict (lines 881-895): N samples (x, y, z, t) at Hz into Out (4*N floats, single precision as the
	// game's Float32Array). PredWorld null means open ground. Returns the samples written.
	LEGENDRISING_API int Predict(const FBallState& B, FWorld* PredWorld, float* Out, int OutLen, int N = 90, double Hz = 30,
		double SpinMul = 1);

	// ball.js ballFlyTo (lines 981-1001): fly a copy of B until its centre crosses the vertical plane through (Px, Pz)
	// with horizontal unit normal (Nx, Nz), or TMax s pass, or it comes to rest
	struct FFlyResult
	{
		bool bHit = false;
		double X = 0, Y = 0, Z = 0, T = 0, Apex = 0, Vx = 0, Vy = 0, Vz = 0;
	};
	LEGENDRISING_API FFlyResult FlyTo(const FBallState& B, FWorld* PredWorld, double Px, double Pz, double Nx, double Nz, double TMax);

	// The match's cached path of the live ball (actions.js refreshPred and predAt, lines 67-82; sim.js refreshes it
	// after kicks, bounces and collisions, every 6 steps while the ball flies with spin and every 30 otherwise).
	struct LEGENDRISING_API FPredCache
	{
		float Samples[360] = {};     // 90 samples at 30 Hz: x, y, z, t (single precision, as the game)
		int N = 0;
		double PredT = 0;            // the clock when it was made
		int PredStep = -1000000;     // the step when it was made
		// ballPredict of the ball now
		void Refresh(const FBallState& B, FWorld* PredWorld, double NowT, int StepIndex);
		// the predicted centre T seconds from NowT, interpolated (the ball itself before any refresh)
		FVec3 At(const FBallState& B, double NowT, double T) const;
	};

	// closed forms of the ground roll, dv/dt = -(rollDecel + KD v^2) (ball.js lines 1006-1050)
	LEGENDRISING_API double RollDistance(double V0, double V1 = 0, double RollDecel = 1.1, double DragMul = 1);
	LEGENDRISING_API double RollSpeedFor(double D, double V1 = 0, double RollDecel = 1.1, double DragMul = 1);
	LEGENDRISING_API double RollTime(double V0, double D, double RollDecel = 1.1, double DragMul = 1);
	LEGENDRISING_API double RollSpeedAt(double V0, double T, double RollDecel = 1.1, double DragMul = 1);
}
