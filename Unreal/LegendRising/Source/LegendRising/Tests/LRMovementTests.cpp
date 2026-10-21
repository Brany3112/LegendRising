// LRMovementTests.cpp: Unreal Automation tests for the movement port (Session Frontend > Automation, filter
// "LegendRising.Movement", or: UnrealEditor-Cmd <project> -ExecCmds="Automation RunTests LegendRising.Movement" -unattended).
//
// The golden numbers come from running the browser game's own JavaScript in Node (js/life/mover.js and gaitcore.js on
// bcs/controls c824ef1 / bcs/integ 41c4cd0; the carry's touch cadence from bcs/integ's own simulation, sim.js, with the
// qa/fc27-carry.mjs drill set-up). The scripts are described in PORT-movement.md ("Golden numbers"). Every test runs the
// plain C++ cores at the game's fixed 60 Hz step, so they need no world, no map and no assets.
//
// Tolerances: the JS uses its own deterministic trigonometry (detmath.js) and this port the C++ standard library, so the
// last few bits can differ. Speeds and distances are compared within 1e-3 (m/s, m) or tighter; "the step at which X
// first happens" within one 60 Hz step.

#include "Misc/AutomationTest.h"

#include "Player/LRCloseControlCore.h"
#include "Player/LRGaitTables.h"
#include "Player/LRMoverCore.h"

#include <cmath>
#include <cstdlib>

#if WITH_DEV_AUTOMATION_TESTS

namespace LRMovementTestUtil
{
	using namespace LRMove;

	constexpr double H = 1.0 / 60.0;
	constexpr double Inf = 1e18;

	// the body the golden script used: the football profile, every skill 50, fresh, the third-person overlay (turnFirst
	// at 13 rad/s, faceRate 12), at the origin facing -Z (yaw 0)
	inline FBodySim MakeBody(double Yaw = 0.0)
	{
		FBodySim B;
		B.Init(0.0, 0.0, Yaw);
		FControlLayer::ApplyViewOverlay(B.P, true);
		B.Stamina.bInfinite = true;   // the golden script used stamina.js FRESH throughout
		return B;
	}

	// one step with a direct intent (the JS script called moverStep with {dx, dz, gait, speedCap})
	inline void StepWith(FBodySim& B, double DX, double DZ, EGait Gait, double Cap = Inf)
	{
		B.I = FMoverIntent();
		B.I.DX = DX; B.I.DZ = DZ; B.I.Gait = Gait;
		if (Cap < Inf) B.I.SpeedCap = Cap;
		FFootfall Falls[8];
		B.Advance(H, nullptr, Falls, 8);
		B.EndStep(H);
	}

	inline int32 StepOf(double Seconds) { return static_cast<int32>(std::lround(Seconds * 60.0)); }

	inline bool NearStep(int32 Got, double WantSeconds) { return std::abs(Got - StepOf(WantSeconds)) <= 1; }
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. From a stand to the run (5.88 m/s at pace 50) and to the sprint (8.4 m/s)
// ---------------------------------------------------------------------------------------------------------------------
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FLRMoverRunUpTest, "LegendRising.Movement.Mover.RunAndSprintFromStand",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FLRMoverRunUpTest::RunTest(const FString& Parameters)
{
	using namespace LRMove;
	using namespace LRMovementTestUtil;

	// the profile itself (mover.js moverParams, football, skills 50)
	{
		const FMoverParams P = FMoverParams::Football(FMoverSkills());
		TestEqual(TEXT("jog 3.99"), P.Jog, 3.99, 1e-9);
		TestEqual(TEXT("run 5.88"), P.Run, 5.88, 1e-9);
		TestEqual(TEXT("sprint 8.4"), P.Sprint, 8.4, 1e-9);
		TestEqual(TEXT("a0 7.975"), P.A0, 7.975, 1e-9);
		TestEqual(TEXT("plant 9"), P.Plant, 9.0, 1e-9);
		TestEqual(TEXT("aLat 7.5"), P.ALat, 7.5, 1e-9);
		TestEqual(TEXT("wMax 9"), P.WMax, 9.0, 1e-9);
		TestEqual(TEXT("cutFloor 0.3"), P.CutFloor, 0.3, 1e-9);
		TestEqual(TEXT("runAfter at Acceleration 50"), RunAfter(50), 0.6, 1e-12);
		TestEqual(TEXT("runAfter at Acceleration 90"), RunAfter(90), 0.3, 1e-12);
	}

	struct FGolden { EGait Gait; double Target; double T50, T90, T95, T99, TFull, V05, V1, D1, V2, D2, D3; };
	const FGolden Runs[2] = {
		// run: 0.45, 0.95, 1.05, 1.1167, 1.1333 s; v at 0.5, 1, 2 s; distance at 1, 2, 3 s
		{EGait::Run, 5.88, 0.45, 0.95, 1.05, 1.1167, 1.1333, 3.298886, 5.468948, 3.15663, 5.88, 9.01437, 14.89437},
		// sprint: the same push to the run, then the curve flattening towards 8.4
		{EGait::Sprint, 8.4, 0.6833, 1.95, 2.3833, 3.1833, 5.2167, 3.298886, 5.468948, 3.15663, 7.62897, 9.910133, 17.942588}};

	for (const FGolden& G : Runs)
	{
		FBodySim B = MakeBody();
		int32 K50 = -1, K90 = -1, K95 = -1, K99 = -1, KFull = -1;
		double V05 = 0, V1 = 0, D1 = 0, V2 = 0, D2 = 0, D3 = 0;
		for (int32 K = 1; K <= 600; K++)
		{
			StepWith(B, 0.0, -1.0, G.Gait);
			const double V = B.M.Speed;
			if (K50 < 0 && V >= 0.5 * G.Target) K50 = K;
			if (K90 < 0 && V >= 0.9 * G.Target) K90 = K;
			if (K95 < 0 && V >= 0.95 * G.Target) K95 = K;
			if (K99 < 0 && V >= 0.99 * G.Target) K99 = K;
			if (KFull < 0 && V >= G.Target - 1e-9) KFull = K;
			if (K == 30) V05 = V;
			if (K == 60) { V1 = V; D1 = -B.M.Z; }
			if (K == 120) { V2 = V; D2 = -B.M.Z; }
			if (K == 180) D3 = -B.M.Z;
		}
		const TCHAR* Label = G.Gait == EGait::Run ? TEXT("run") : TEXT("sprint");
		AddInfo(FString::Printf(TEXT("%s: 50%% at step %d, 90%% at %d, 95%% at %d, 99%% at %d, full at %d"), Label, K50, K90, K95, K99, KFull));
		TestTrue(*FString::Printf(TEXT("%s: 50%% of the target within a step of %.4f s"), Label, G.T50), NearStep(K50, G.T50));
		TestTrue(*FString::Printf(TEXT("%s: 90%% of the target within a step of %.4f s"), Label, G.T90), NearStep(K90, G.T90));
		TestTrue(*FString::Printf(TEXT("%s: 95%% of the target within a step of %.4f s"), Label, G.T95), NearStep(K95, G.T95));
		TestTrue(*FString::Printf(TEXT("%s: 99%% of the target within a step of %.4f s"), Label, G.T99), NearStep(K99, G.T99));
		TestTrue(*FString::Printf(TEXT("%s: the full target within a step of %.4f s"), Label, G.TFull), NearStep(KFull, G.TFull));
		TestEqual(*FString::Printf(TEXT("%s: speed at 0.5 s"), Label), V05, G.V05, 1e-3);
		TestEqual(*FString::Printf(TEXT("%s: speed at 1 s"), Label), V1, G.V1, 1e-3);
		TestEqual(*FString::Printf(TEXT("%s: distance at 1 s"), Label), D1, G.D1, 2e-3);
		TestEqual(*FString::Printf(TEXT("%s: speed at 2 s"), Label), V2, G.V2, 1e-3);
		TestEqual(*FString::Printf(TEXT("%s: distance at 2 s"), Label), D2, G.D2, 3e-3);
		TestEqual(*FString::Printf(TEXT("%s: distance at 3 s"), Label), D3, G.D3, 4e-3);
	}
	return true;
}

// ---------------------------------------------------------------------------------------------------------------------
// 2. The controls' ladder: W held from a stand is a jog, a run after RunAfter (0.6 s at Acceleration 50)
// ---------------------------------------------------------------------------------------------------------------------
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FLRControlLadderTest, "LegendRising.Movement.Controls.WalkJogRunLadder",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FLRControlLadderTest::RunTest(const FString& Parameters)
{
	using namespace LRMove;
	using namespace LRMovementTestUtil;

	FBodySim B = MakeBody();
	FControlInput In;
	In.Forward = 1.0;           // W
	In.CameraYaw = 0.0;         // the camera looks down -Z, as the body faces
	In.AccelerationSkill = 50.0;
	int32 KRun = -1, K90 = -1, KJog95 = -1;
	for (int32 K = 1; K <= 300; K++)
	{
		FFootfall Falls[8];
		B.Advance(H, &In, Falls, 8);
		B.EndStep(H);
		if (KRun < 0 && B.I.Gait == EGait::Run) KRun = K;
		if (K90 < 0 && B.M.Speed >= 0.9 * B.P.Run) K90 = K;
		if (KJog95 < 0 && B.M.Speed >= 0.95 * B.P.Jog) KJog95 = K;
	}
	// golden: the run from step 36 (0.6 s), 95% of the jog at 0.6 s, 90% of the run at 0.95 s
	TestEqual(TEXT("the jog becomes a run at step 36 (0.6 s)"), KRun, 36);
	TestTrue(TEXT("95% of the jog within a step of 0.6 s"), NearStep(KJog95, 0.6));
	TestTrue(TEXT("90% of the run within a step of 0.95 s"), NearStep(K90, 0.95));

	// Shift: the sprint; X: the walk; the shield takes the sprint away and holds you to 0.6 of the jog
	{
		FBodySim S = MakeBody();
		FControlInput Sp = In;
		Sp.bSprintHeld = true;
		FFootfall Falls[8];
		S.Advance(H, &Sp, Falls, 8);
		TestTrue(TEXT("Shift held: a sprint"), S.I.Gait == EGait::Sprint);
		Sp.bShield = true;
		S.Advance(H, &Sp, Falls, 8);
		TestTrue(TEXT("shielding: no sprint"), S.I.Gait == EGait::Jog);
		TestEqual(TEXT("shielding: capped at 0.6 of the jog"), S.I.SpeedCap, 0.6 * S.P.Jog, 1e-9);
		Sp.bShield = false; Sp.bSprintHeld = false; Sp.bWalk = true;
		S.Advance(H, &Sp, Falls, 8);
		TestTrue(TEXT("X: a walk"), S.I.Gait == EGait::Walk);
		Sp.bWalk = false; Sp.bJockey = true; Sp.bSprintHeld = true;
		S.Advance(H, &Sp, Falls, 8);
		TestTrue(TEXT("jockeying: a run, never a sprint"), S.I.Gait == EGait::Run);
		TestTrue(TEXT("jockeying: strafing with the facing held"), S.I.bStrafe && S.I.bFace);
		TestEqual(TEXT("jockeying: capped at 3.2 m/s"), S.I.SpeedCap, 3.2, 1e-12);
	}
	// D from a stand with the camera looking down -Z: the keys' way is +X (screen right), in every direction the ladder
	{
		FControlInput Right;
		Right.Right = 1.0;
		FControlLayer L;
		FBodySim S = MakeBody();
		FMoverIntent I;
		L.BuildIntent(Right, S.M, S.P, S.Fac, 0.0, H, I);
		TestEqual(TEXT("D: the keys' way is +X"), I.DX, 1.0, 1e-9);
		TestEqual(TEXT("D: and nothing along Z"), I.DZ, 0.0, 1e-9);
		TestFalse(TEXT("third person: the facing is free"), I.bFace);
	}
	return true;
}

// ---------------------------------------------------------------------------------------------------------------------
// 3. A 180 reversal: at a run (the cut rule plants, the heading swings round) and at 2.5 m/s (a pivot: stop, then go)
// ---------------------------------------------------------------------------------------------------------------------
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FLRMoverReversalTest, "LegendRising.Movement.Mover.Reversal180",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FLRMoverReversalTest::RunTest(const FString& Parameters)
{
	using namespace LRMove;
	using namespace LRMovementTestUtil;

	struct FGolden { const TCHAR* Name; EGait Gait; double Cap; double V1, Plant1, Cut1, TMinV, MinV, V6, V12, THead, TFace, TBack90, Z1, VZ1, Overshoot; };
	const FGolden Cases[2] = {
		{TEXT("at a run"), EGait::Run, Inf, 5.73, 9.0, Pi, 0.55, 0.93, 4.98, 4.08, 0.9667, 0.9667, 1.3833, -0.660986, 3.673457, 1.593933},
		{TEXT("at 2.5 m/s"), EGait::Jog, 2.5, 2.35, 9.0, 0.0, 0.2667, 0.1, 1.6, 0.7, 0.45, 0.45, 0.5833, 1.15866, 2.5, 0.27646}};

	for (const FGolden& G : Cases)
	{
		FBodySim B = MakeBody();
		for (int32 K = 1; K <= 240; K++) StepWith(B, 0.0, -1.0, G.Gait, G.Cap);
		const double Z0 = B.M.Z;
		const double Tg = Min2(G.Gait == EGait::Run ? B.P.Run : B.P.Jog, G.Cap);
		double MinZ = B.M.Z, MinV = B.M.Speed, V1 = 0, Plant1 = 0, Cut1 = 0, V6 = 0, V12 = 0, Z1 = 0, VZ1 = 0;
		int32 KMinV = -1, KHead = -1, KFace = -1, KBack = -1;
		for (int32 K = 1; K <= 300; K++)
		{
			StepWith(B, 0.0, 1.0, G.Gait, G.Cap);
			if (K == 1) { V1 = B.M.Speed; Plant1 = B.M.Plant; Cut1 = B.M.Cut; }
			if (K == 6) V6 = B.M.Speed;
			if (K == 12) V12 = B.M.Speed;
			MinZ = Min2(MinZ, B.M.Z);
			if (B.M.Speed < MinV) { MinV = B.M.Speed; KMinV = K; }
			if (KHead < 0 && std::fabs(WrapA(B.M.Heading - Pi)) < 0.05) KHead = K;
			if (KFace < 0 && std::fabs(WrapA(B.M.Yaw - Pi)) < 0.05) KFace = K;
			if (KBack < 0 && B.M.Speed >= 0.9 * Tg && std::fabs(WrapA(B.M.Heading - Pi)) < 0.05) KBack = K;
			if (K == 60) { Z1 = B.M.Z - Z0; VZ1 = B.M.VZ; }
		}
		AddInfo(FString::Printf(TEXT("reversal %s: slowest at step %d (%.3f m/s), heading round at %d, back to 90%% at %d, overshoot %.3f m"),
			G.Name, KMinV, MinV, KHead, KBack, Z0 - MinZ));
		TestEqual(*FString::Printf(TEXT("reversal %s: speed after one step"), G.Name), V1, G.V1, 1e-6);
		TestEqual(*FString::Printf(TEXT("reversal %s: a plant at the plant rate"), G.Name), Plant1, G.Plant1, 1e-9);
		TestEqual(*FString::Printf(TEXT("reversal %s: the cut's heading error"), G.Name), Cut1, G.Cut1, 1e-6);
		TestEqual(*FString::Printf(TEXT("reversal %s: speed after 6 steps"), G.Name), V6, G.V6, 1e-3);
		TestEqual(*FString::Printf(TEXT("reversal %s: speed after 12 steps"), G.Name), V12, G.V12, 1e-3);
		TestEqual(*FString::Printf(TEXT("reversal %s: the slowest speed"), G.Name), MinV, G.MinV, 2e-3);
		TestTrue(*FString::Printf(TEXT("reversal %s: slowest within a step of %.4f s"), G.Name, G.TMinV), NearStep(KMinV, G.TMinV));
		TestTrue(*FString::Printf(TEXT("reversal %s: heading round within a step of %.4f s"), G.Name, G.THead), NearStep(KHead, G.THead));
		TestTrue(*FString::Printf(TEXT("reversal %s: facing round within a step of %.4f s"), G.Name, G.TFace), NearStep(KFace, G.TFace));
		TestTrue(*FString::Printf(TEXT("reversal %s: back to 90%% the other way within a step of %.4f s"), G.Name, G.TBack90), NearStep(KBack, G.TBack90));
		TestEqual(*FString::Printf(TEXT("reversal %s: the overshoot"), G.Name), Z0 - MinZ, G.Overshoot, 3e-3);
		TestEqual(*FString::Printf(TEXT("reversal %s: where it is 1 s after"), G.Name), Z1, G.Z1, 5e-3);
		TestEqual(*FString::Printf(TEXT("reversal %s: going back at 1 s"), G.Name), VZ1, G.VZ1, 5e-3);
	}
	return true;
}

// ---------------------------------------------------------------------------------------------------------------------
// 4. Turning: a quarter turn from a stand (turn on the spot first, 13 rad/s) and the smoothed wish at a run
// ---------------------------------------------------------------------------------------------------------------------
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FLRMoverTurnTest, "LegendRising.Movement.Controls.TurnFromStandAndWishCurve",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FLRMoverTurnTest::RunTest(const FString& Parameters)
{
	using namespace LRMove;
	using namespace LRMovementTestUtil;

	// a quarter turn right (+X) from a stand: the body turns on the spot, then sets off
	{
		FBodySim B = MakeBody();
		double Yaw1 = 0, V1 = 0, YawMove = 0, V1s = 0, X1s = 0;
		int32 KMove = -1, KFace = -1;
		for (int32 K = 1; K <= 120; K++)
		{
			StepWith(B, 1.0, 0.0, EGait::Jog);
			if (K == 1) { Yaw1 = B.M.Yaw; V1 = B.M.Speed; }
			if (KMove < 0 && B.M.Speed > 0.05) { KMove = K; YawMove = B.M.Yaw; }
			if (KFace < 0 && std::fabs(WrapA(B.M.Yaw + Pi / 2)) < 1e-3) KFace = K;
			if (K == 60) { V1s = B.M.Speed; X1s = B.M.X; }
		}
		TestEqual(TEXT("turn from a stand: 13 rad/s for the first step"), Yaw1, -0.216667, 1e-5);
		TestEqual(TEXT("turn from a stand: no speed in the first step"), V1, 0.0, 1e-12);
		TestTrue(TEXT("turn from a stand: sets off within a step of 0.0667 s"), NearStep(KMove, 0.0667));
		TestEqual(TEXT("turn from a stand: the facing as it sets off"), YawMove, -0.85, 1e-3);
		TestTrue(TEXT("turn from a stand: facing the way within a step of 0.1333 s"), NearStep(KFace, 0.1333));
		TestEqual(TEXT("turn from a stand: at the jog at 1 s"), V1s, 3.99, 1e-3);
		TestEqual(TEXT("turn from a stand: distance at 1 s"), X1s, 2.661551, 3e-3);
	}

	// the wish at a run: the keys a quarter turn right after 4 s straight (90 < SNAP 120, so it curves)
	{
		FBodySim B = MakeBody();
		FControlInput In;
		In.Forward = 1.0;
		In.AccelerationSkill = 50.0;
		FFootfall Falls[8];
		// (the golden script drove gait 'run' directly; the ladder reaches the run after 0.6 s and 4 s is plenty)
		for (int32 K = 1; K <= 240; K++) { B.Advance(H, &In, Falls, 8); B.EndStep(H); }
		TestEqual(TEXT("wish: at the run after 4 s"), B.M.Speed, 5.88, 1e-6);
		In.Forward = 0.0;
		In.Right = 1.0;
		double Wish1 = 0, Head1 = 0, V15 = 0, Cut15 = 0;
		int32 KWish = -1, KHead = -1;
		for (int32 K = 1; K <= 120; K++)
		{
			B.Advance(H, &In, Falls, 8);
			B.EndStep(H);
			if (K == 1) { Wish1 = B.Ctrl.WishYaw; Head1 = B.M.Heading; }
			if (KWish < 0 && std::fabs(WrapA(B.Ctrl.WishYaw + Pi / 2)) < 1e-6) KWish = K;
			if (KHead < 0 && std::fabs(WrapA(B.M.Heading + Pi / 2)) < 0.02) KHead = K;
			if (K == 15) { V15 = B.M.Speed; Cut15 = B.M.Cut; }
		}
		TestEqual(TEXT("wish: turned 37.5/5.88 rad/s in the first step"), Wish1, -0.106293, 1e-5);
		TestEqual(TEXT("wish: the heading after the first step"), Head1, -0.021259, 1e-5);
		TestTrue(TEXT("wish: on the keys' way within a step of 0.2333 s"), NearStep(KWish, 0.2333));
		TestTrue(TEXT("wish: the heading round within a step of 0.95 s"), NearStep(KHead, 0.95));
		TestEqual(TEXT("wish: speed at 0.25 s (the cut rule pricing the bend)"), V15, 4.53, 2e-3);
		TestEqual(TEXT("wish: the cut at 0.25 s"), Cut15, 1.250278, 2e-3);
		TestEqual(TEXT("wish: back at the run after 2 s"), B.M.Speed, 5.88, 1e-6);
	}
	return true;
}

// ---------------------------------------------------------------------------------------------------------------------
// 5. The gait tables and the carrier's clock at 3, 4.5 and 6 m/s
// ---------------------------------------------------------------------------------------------------------------------
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FLRGaitCadenceTest, "LegendRising.Movement.Gait.CarryCadence",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FLRGaitCadenceTest::RunTest(const FString& Parameters)
{
	using namespace LRMove;
	using namespace LRMovementTestUtil;

	TestEqual(TEXT("walk step at 1.4"), Gait::StepLen(1.4, EGaitMode::Walk), 0.743, 1e-9);
	TestEqual(TEXT("walk step at 2.0 (the reach limit)"), Gait::StepLen(2.0, EGaitMode::Walk), 0.92, 1e-9);
	TestEqual(TEXT("run step at 5.0"), Gait::StepLen(5.0, EGaitMode::Run), 1.7315, 1e-9);
	TestEqual(TEXT("carry weight at 1.8 m/s (fading in)"), Gait::CarryW(1.8, 1.0), 0.5, 1e-9);
	TestEqual(TEXT("carry weight at 8.5 m/s (fading out)"), Gait::CarryW(8.5, 1.0), 0.539437, 1e-6);
	TestEqual(TEXT("a carrier's walk step at 1.8"), Gait::StepLen(1.8, EGaitMode::Walk, 1.0, -1.0, 1.0), 0.657333, 1e-6);

	struct FGolden { double V, Step, StepNoBall, Spm, Stride, Duty, Swing; int32 Falls10s; double StrongIv, FirstR; };
	const FGolden Rows[3] = {
		{3.0, 0.54, 1.125, 333.333, 0.36, 0.455, 0.1962, 55, 0.36, 0.18},
		{4.5, 0.75, 1.588, 360.0, 0.333333, 0.44, 0.186667, 60, 0.333333, 0.166667},
		{6.0, 0.835, 1.9975, 431.138, 0.278333, 0.41, 0.164217, 71, 0.278333, 0.139167}};
	for (const FGolden& G : Rows)
	{
		TestEqual(*FString::Printf(TEXT("carry step at %.1f"), G.V), Gait::StepLen(G.V, EGaitMode::Run, 1.0, -1.0, 1.0), G.Step, 1e-6);
		TestEqual(*FString::Printf(TEXT("no-ball step at %.1f"), G.V), Gait::StepLen(G.V, EGaitMode::Run), G.StepNoBall, 1e-6);
		TestEqual(*FString::Printf(TEXT("carry steps a minute at %.1f"), G.V), 60.0 * Gait::Cadence(G.V, EGaitMode::Run, 1.0, -1.0, 1.0), G.Spm, 1e-3);
		TestEqual(*FString::Printf(TEXT("carry stride at %.1f"), G.V), Gait::StrideTime(G.V, EGaitMode::Run, 1.0, 1.0), G.Stride, 1e-6);
		TestEqual(*FString::Printf(TEXT("carry duty at %.1f"), G.V), Gait::DutyOf(G.V, EGaitMode::Run, 1.0), G.Duty, 1e-6);
		TestEqual(*FString::Printf(TEXT("carry swing at %.1f"), G.V), Gait::SwingTime(G.V, EGaitMode::Run, 1.0, 1.0), G.Swing, 1e-6);

		// the clock itself, 10 s at a steady speed, 60 Hz
		FGaitClock Clock;
		Clock.Reset(0.0, EGaitMode::Run, 1.0);
		int32 Count = 0, NR = 0;
		double FirstR = -1, LastR = -1;
		for (int32 K = 1; K <= 600; K++)
		{
			FFootfall Falls[8];
			const int32 N = Clock.PhaseAdvance(G.V * H, G.V, 1.0, Falls, 8);
			for (int32 I = 0; I < N; I++)
			{
				Count++;
				if (Falls[I].Side == EFoot::Right)
				{
					const double T = (K - 1) * H + Falls[I].At * H;
					if (FirstR < 0) FirstR = T;
					LastR = T;
					NR++;
				}
			}
		}
		const double StrongIv = NR > 1 ? (LastR - FirstR) / (NR - 1) : 0.0;
		TestEqual(*FString::Printf(TEXT("footfalls in 10 s at %.1f"), G.V), Count, G.Falls10s);
		TestEqual(*FString::Printf(TEXT("the strong (right) foot's interval at %.1f"), G.V), StrongIv, G.StrongIv, 1e-6);
		TestEqual(*FString::Printf(TEXT("the first right footfall at %.1f"), G.V), FirstR, G.FirstR, 1e-6);
	}
	return true;
}

// ---------------------------------------------------------------------------------------------------------------------
// 6. Close control's touch cadence: a straight carry at 3 and 6 m/s (a touch on every strong-foot footfall), and a sprint
//    with it (push and run: every second stride). Golden from bcs/integ's own simulation (sim.js) with the qa/fc27-carry
//    set-up: the drill's man (every skill 55), the ball 0.35 m in front at rest, right footed, keys straight on, the run held to the speed.
//      3 m/s: 2.833 carry touches a second, every 0.3604 s (the strong foot's stride: 0.36 s), all right toe 'carry'
//      6 m/s: 3.667 a second, every 0.2778 s (stride 0.2783 s)
//      a sprint (7.372 m/s: the close-control cap, 0.8625 x 8.547 at Dribbling and Sprint Speed 55): 1.833 a second,
//      every 0.515 s (every second strong-foot footfall)
// ---------------------------------------------------------------------------------------------------------------------
namespace LRMovementTestUtil
{
	struct FCarryResult { double TouchesPerS = 0; double MeanIv = 0; double MeanV = 0; int32 Touches = 0; bool bAllRightToe = true; bool bCtlOn = false; double CK = 0; double AheadMin = 9; double AheadMax = -9; };

	inline FCarryResult RunCarry(double RunSpeed, bool bSprint)
	{
		// (the att-carrier drill's man: every skill 55, right footed)
		FBodySim B;
		B.Skills.Pace = 55.0; B.Skills.SprintSpeed = 55.0; B.Skills.Acceleration = 55.0; B.Skills.Dribbling = 55.0; B.Skills.Agility = 55.0;
		B.StaminaSkill = 55.0;
		B.Init(-40.0, 0.0, -Pi / 2);          // facing +X
		B.Stamina.Init(100.0, 0.0);
		if (RunSpeed > 0) B.P.Run = RunSpeed;  // the harness's me.prm.run = cap
		FBallState Ball;
		Ball.X = B.M.X + 0.35; Ball.Z = 0.0; Ball.Y = Ctl::BALL_R;
		FCloseControlCore C;
		FCarryResult R;
		double LastTouchT = -1, SumIv = 0, SumV = 0;
		int32 NIv = 0, NV = 0;
		C.OnTouch = [&](const FTouchRecord& Rec)
		{
			const bool bCarryTag = Rec.Why == ETouchWhy::Carry || Rec.Why == ETouchWhy::Run || Rec.Why == ETouchWhy::Turn ||
				Rec.Why == ETouchWhy::Stop || Rec.Why == ETouchWhy::WeakSide || Rec.Why == ETouchWhy::Overrun;
			if (!bCarryTag || Rec.T <= 2.0) return;
			R.Touches++;
			if (Rec.Foot != EFoot::Right || Rec.Part != EFootPart::Toe) R.bAllRightToe = false;
			// (CC-4: where the ball is against the pelvis as it is played, along the way he runs, +X)
			const double Ahead = Rec.BallX - B.M.X;
			R.AheadMin = Min2(R.AheadMin, Ahead);
			R.AheadMax = Max2(R.AheadMax, Ahead);
			if (LastTouchT > 0) { SumIv += Rec.T - LastTouchT; NIv++; }
			LastTouchT = Rec.T;
		};
		for (int32 K = 0; K < 480; K++)
		{
			// the intent as the harness sets it (control.js's for a sprint in close control: k of the sprint)
			B.I = FMoverIntent();
			B.I.DX = 1.0; B.I.DZ = 0.0;
			B.I.Gait = bSprint ? EGait::Sprint : EGait::Run;
			if (C.bCtlOn && bSprint) B.I.SpeedCap = CloseControlSprintK(55.0) * B.P.Sprint;
			B.I.bFace = true; B.I.FaceX = 1.0; B.I.FaceZ = 0.0;
			FCtlWorld W;
			W.T = B.T; W.Step = B.StepIndex; W.bBallMine = true; W.bCtlAuto = true;
			FBodyView Body{&B.M, &B.P, &B.Fac, &B.I, &B.G, 1.0, EStrongFoot::Right};
			B.CarryTarget = C.Carrying(Ball, Body, W) ? 1.0 : 0.0;
			FFootfall Falls[8];
			const int32 N = B.Advance(H, nullptr, Falls, 8);
			for (int32 I = 0; I < N; I++) C.OnFootfall(Ball, Body, W, Falls[I].Side);
			C.KeepStep(Ball, Body, W);
			RollBall(Ball, H);
			B.EndStep(H);
			if (B.T > 2.0) { SumV += B.M.Speed; NV++; }
		}
		R.TouchesPerS = R.Touches / 6.0;
		R.MeanIv = NIv ? SumIv / NIv : 0.0;
		R.MeanV = NV ? SumV / NV : 0.0;
		R.bCtlOn = C.bCtlOn;
		R.CK = B.G.CK;
		return R;
	}
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FLRCloseControlCadenceTest, "LegendRising.Movement.CloseControl.TouchCadence",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FLRCloseControlCadenceTest::RunTest(const FString& Parameters)
{
	using namespace LRMove;
	using namespace LRMovementTestUtil;

	struct FGolden { const TCHAR* Name; double RunSpeed; bool bSprint; double PerS, Iv, V; };
	const FGolden Cases[3] = {
		{TEXT("3 m/s"), 3.0, false, 2.833, 0.3604, 3.0},
		{TEXT("6 m/s"), 6.0, false, 3.667, 0.2778, 6.0},
		{TEXT("a sprint"), -1.0, true, 1.833, 0.515, 7.372}};
	for (const FGolden& G : Cases)
	{
		const FCarryResult R = RunCarry(G.RunSpeed, G.bSprint);
		AddInfo(FString::Printf(TEXT("carry %s: %.3f m/s, %d touches, %.3f a second, every %.4f s, ck %.3f, ball %.3f to %.3f m ahead at the touches"),
			G.Name, R.MeanV, R.Touches, R.TouchesPerS, R.MeanIv, R.CK, R.AheadMin, R.AheadMax));
		TestTrue(*FString::Printf(TEXT("carry %s: still in close control"), G.Name), R.bCtlOn);
		TestEqual(*FString::Printf(TEXT("carry %s: the speed"), G.Name), R.MeanV, G.V, 0.02);
		TestEqual(*FString::Printf(TEXT("carry %s: touches a second"), G.Name), R.TouchesPerS, G.PerS, 0.2);
		TestEqual(*FString::Printf(TEXT("carry %s: the interval between touches"), G.Name), R.MeanIv, G.Iv, 1.5 / 60.0);
		TestTrue(*FString::Printf(TEXT("carry %s: every touch the right foot's toe"), G.Name), R.bAllRightToe);
		TestEqual(*FString::Printf(TEXT("carry %s: the carrier's gait in full"), G.Name), R.CK, 1.0, 1e-9);
		// (fc27-spec 2.2 / CC-4: at a carry touch the ball is about 0.45 to 0.65 m ahead of the pelvis; the check's band
		// is 0.4 to 0.75; a sprint's push and run lets it run on further between pushes)
		if (!G.bSprint) TestTrue(*FString::Printf(TEXT("carry %s: the ball 0.4 to 0.75 m ahead of the pelvis at every touch"), G.Name), R.AheadMin >= 0.4 && R.AheadMax <= 0.75);
	}
	return true;
}

// ---------------------------------------------------------------------------------------------------------------------
// 7. Close control's automatic rules: taken when first to it, ended by the knock-on, the chase held off until Shift is
//    let go, never taking back your own strike within a second
// ---------------------------------------------------------------------------------------------------------------------
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FLRCloseControlAutoTest, "LegendRising.Movement.CloseControl.AutoEnterAndExits",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FLRCloseControlAutoTest::RunTest(const FString& Parameters)
{
	using namespace LRMove;
	using namespace LRMovementTestUtil;

	FBodySim B;
	B.Init(0.0, 0.0, 0.0);
	FBallState Ball;
	Ball.X = 0.0; Ball.Z = -0.5;
	FCloseControlCore C;
	int32 Touches = 0;
	C.OnTouch = [&](const FTouchRecord&) { Touches++; };
	auto Step = [&](double DX, double DZ, EGait Gait, bool bMine, bool bKnock)
	{
		B.I = FMoverIntent();
		B.I.DX = DX; B.I.DZ = DZ; B.I.Gait = Gait;
		if (bKnock) C.bKnockRequested = true;
		FCtlWorld W;
		W.T = B.T; W.Step = B.StepIndex; W.bBallMine = bMine; W.bBallOthers = false; W.bCtlAuto = true;
		FBodyView Body{&B.M, &B.P, &B.Fac, &B.I, &B.G, 1.0, EStrongFoot::Right};
		B.CarryTarget = C.Carrying(Ball, Body, W) ? 1.0 : 0.0;
		FFootfall Falls[8];
		const int32 N = B.Advance(H, nullptr, Falls, 8);
		for (int32 I = 0; I < N; I++) C.OnFootfall(Ball, Body, W, Falls[I].Side);
		C.KeepStep(Ball, Body, W);
		RollBall(Ball, H);
		B.EndStep(H);
	};

	// not ours by the race: never taken
	Step(0.0, 0.0, EGait::Jog, false, false);
	TestFalse(TEXT("a ball that is not yours is never taken"), C.bCtlOn);
	// ours, within 1.2 m, low and free: taken with a gathering touch, no key
	Step(0.0, 0.0, EGait::Jog, true, false);
	TestTrue(TEXT("first to it: close control, no key"), C.bCtlOn);
	TestTrue(TEXT("the gathering touch was made"), Touches >= 1);
	// standing with it: the ball comes to rest at the strong foot's toe (CTL.STAND 0.22 m ahead, 0.1 m to the right)
	for (int32 K = 0; K < 120; K++) Step(0.0, 0.0, EGait::Jog, true, false);
	const double Ahead = -(Ball.Z - B.M.Z), Side = Ball.X - B.M.X;
	AddInfo(FString::Printf(TEXT("standing: the ball %.3f m ahead, %.3f m to the right"), Ahead, Side));
	TestTrue(TEXT("standing: the ball within 0.3 m (CC-13)"), Hypot(Ahead, Side) < 0.3);
	// sprint with it, then Shift twice: the knock-on ends it ('knock') and the ball goes on at sprint + 2.5 or more
	for (int32 K = 0; K < 120; K++) Step(0.0, -1.0, EGait::Sprint, true, false);
	TestTrue(TEXT("sprinting with it: still in close control"), C.bCtlOn);
	Step(0.0, -1.0, EGait::Sprint, true, true);
	TestFalse(TEXT("Shift twice: close control ends"), C.bCtlOn);
	TestTrue(TEXT("Shift twice: the end is the knock"), C.End == ECtlEnd::Knock);
	TestTrue(TEXT("Shift twice: the chase begins"), C.bChase);
	TestTrue(TEXT("the knock-on: at least the sprint + 2.5 m/s"), Hypot(Ball.VX, Ball.VZ) >= B.P.Sprint + 2.5 - 1e-9);
	// chasing at a sprint with Shift held: not taken back even when level with it
	for (int32 K = 0; K < 30; K++) Step(0.0, -1.0, EGait::Sprint, true, false);
	TestFalse(TEXT("chasing with Shift held: out of close control"), C.bCtlOn);
	// put the ball at his feet again and let go of Shift: back in
	Ball.X = B.M.X; Ball.Z = B.M.Z - 0.4; Ball.VX = 0; Ball.VZ = B.M.VZ;
	C.bOut = true;   // (the ball has left his feet during the chase)
	Step(0.0, -1.0, EGait::Run, true, false);
	TestFalse(TEXT("Shift let go: the chase is over"), C.bChase);
	Step(0.0, -1.0, EGait::Run, true, false);
	TestTrue(TEXT("Shift let go with it at his feet: close control again"), C.bCtlOn);
	// his own strike (a pass) is not taken back within AUTO.OWN_T, even in reach
	C.Reset();
	C.OnTouch = [&](const FTouchRecord&) { Touches++; };
	Ball.X = B.M.X; Ball.Z = B.M.Z - 0.6; Ball.VX = 0; Ball.VZ = -1.6;
	Ball.LastBy = ELastBy::Me; Ball.LastKind = ELastKind::Struck; Ball.LastT = B.T;
	for (int32 K = 0; K < 10; K++) Step(0.0, 0.0, EGait::Jog, true, false);
	TestFalse(TEXT("his own pass is not taken back within a second"), C.bCtlOn);
	return true;
}

#endif // WITH_DEV_AUTOMATION_TESTS
