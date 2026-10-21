// LRBallTests.cpp: automation tests of the ball and strike port against golden numbers from the browser game.
//
// The numbers in LRGolden were computed by running the game's own JavaScript (branch bcs/integ, commit 41c4cd0:
// ball.js, strike.js, control.js, actions.js) in Node with Tools/golden/golden_values.mjs; regenerate them with
//     node Tools/golden/golden_values.mjs <a checkout of bcs/integ>
// Each value is compared to within 1e-9 of its size, and the test reports how many match to the last bit (with the
// strict float pragmas of the core files they all should: Tools/golden/run_check.sh checks 2175 numbers that way
// outside the engine).
//
// Run: Session Frontend > Automation > LegendRising, or -ExecCmds="Automation RunTests LegendRising".

#include "CoreMinimal.h"
#include "Misc/AutomationTest.h"

#include "Ball/LRBallCore.h"
#include "Ball/LRDetMath.h"
#include "Ball/LRUnits.h"
#include "Strike/LRShotMeter.h"
#include "Strike/LRStrikeSolver.h"

#if WITH_DEV_AUTOMATION_TESTS

namespace LRGolden
{
//GOLDEN//
}

namespace
{
	// compares to 1e-9 of the value's size (at least 1e-9), counting exact matches
	struct FGolden
	{
		FAutomationTestBase& Test;
		int32 Exact = 0;
		int32 Total = 0;

		explicit FGolden(FAutomationTestBase& InTest) : Test(InTest) {}

		void operator()(const TCHAR* What, double Actual, double Expected)
		{
			++Total;
			if (Actual == Expected) { ++Exact; return; }
			const double Err = FMath::Abs(Actual - Expected);
			if (!(Err <= 1e-9 * FMath::Max(1.0, FMath::Abs(Expected))))
			{
				Test.AddError(FString::Printf(TEXT("%s: %.17g, expected %.17g (off by %.3g)"), What, Actual, Expected, Err));
			}
		}

		void Report()
		{
			Test.AddInfo(FString::Printf(TEXT("%d of %d golden numbers match the JavaScript to the last bit"), Exact, Total));
		}
	};

	LRBall::FVec3 V3(double X, double Y, double Z)
	{
		LRBall::FVec3 V;
		V.X = X; V.Y = Y; V.Z = Z;
		return V;
	}

	LRStrike::FStrikeRequest Req(LRBall::FVec3 From, LRBall::FVec3 To, double Speed, int Contact, double Curl, double Curve = 50, double Aero = 0)
	{
		LRStrike::FStrikeRequest R;
		R.From = From; R.Target = To; R.Speed = Speed; R.Contact = Contact; R.Curl = Curl; R.bLeftFoot = false; R.Kind = LRStrike::EKind::Shot;
		R.RollDecel = 1.1; R.Curve = Curve; R.Aero = Aero;
		return R;
	}
}

// a ball rolled at 8 m/s, after 1 s: grass deceleration 1.1 m/s^2 plus drag, the spin locking to rolling
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FLRBallRollTest, "LegendRising.Ball.RollAfterOneSecond", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FLRBallRollTest::RunTest(const FString& Parameters)
{
	using namespace LRGolden;
	FGolden G(*this);
	LRBall::FBallState B = LRBall::CreateBall(0, LRBall::BALL::R, 0, 1.1);
	LRBall::FWorld W;
	LRBall::FTouch T;
	T.Agent = 1; T.Team = 0; T.Kind = "pass"; T.bHasT = true; T.T = 0;
	LRBall::Kick(B, V3(0, 0, -8), V3(0, 0, 0), T);
	for (int32 I = 0; I < 60; ++I) LRBall::Step(B, W, 1.0 / 60);
	G(TEXT("roll p.x"), B.P.X, RollPX); G(TEXT("roll p.y"), B.P.Y, RollPY); G(TEXT("roll p.z"), B.P.Z, RollPZ);
	G(TEXT("roll v.x"), B.V.X, RollVX); G(TEXT("roll v.y"), B.V.Y, RollVY); G(TEXT("roll v.z"), B.V.Z, RollVZ);
	G(TEXT("roll w.x"), B.W.X, RollWX); G(TEXT("roll w.y"), B.W.Y, RollWY); G(TEXT("roll w.z"), B.W.Z, RollWZ);
	G(TEXT("roll grounded"), B.bGrounded ? 1 : 0, RollGrounded);
	// in Unreal units: 8 m/s along sim -Z is 800 cm/s forward; after 1 s it is 708 cm ahead, 11 cm up, at 622 cm/s
	const FVector P = LRUnits::SimToUnreal(B.P), V = LRUnits::SimToUnreal(B.V);
	TestTrue(TEXT("rolled forward (+X) in Unreal"), FMath::IsNearlyEqual(P.X, -RollPZ * 100.0, 1e-6) && FMath::IsNearlyEqual(P.Z, 11.0, 1e-6));
	TestTrue(TEXT("rolling forward (+X) in Unreal"), FMath::IsNearlyEqual(V.X, -RollVZ * 100.0, 1e-6));
	G.Report();
	return true;
}

// a struck, spun ball after 1 s of flight and after a bounce
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FLRBallFlightTest, "LegendRising.Ball.FlightAndBounce", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FLRBallFlightTest::RunTest(const FString& Parameters)
{
	using namespace LRGolden;
	FGolden G(*this);
	LRBall::FBallState B = LRBall::CreateBall(1, LRBall::BALL::R, -2, 1.3);
	LRBall::FWorld W;
	LRBall::FTouch T;
	T.Agent = 2; T.Team = 1; T.Kind = "shot"; T.Aero = 60; T.bHasT = true; T.T = 0;
	LRBall::Kick(B, V3(3, 9, -25), V3(15, 20, -5), T);
	for (int32 I = 0; I < 60; ++I) LRBall::Step(B, W, 1.0 / 60);
	G(TEXT("flight p.x"), B.P.X, FlightPX); G(TEXT("flight p.y"), B.P.Y, FlightPY); G(TEXT("flight p.z"), B.P.Z, FlightPZ);
	G(TEXT("flight v.x"), B.V.X, FlightVX); G(TEXT("flight v.y"), B.V.Y, FlightVY); G(TEXT("flight v.z"), B.V.Z, FlightVZ);
	G(TEXT("flight w.x"), B.W.X, FlightWX); G(TEXT("flight w.y"), B.W.Y, FlightWY); G(TEXT("flight w.z"), B.W.Z, FlightWZ);
	bool bBounced = false;
	W.bCollectEvents = true;
	for (int32 I = 0; I < 60; ++I) LRBall::Step(B, W, 1.0 / 60);
	for (const LRBall::FEvent& Ev : W.Events) if (Ev.Type == LRBall::EEventType::Bounce) bBounced = true;
	TestTrue(TEXT("it bounced in the second second"), bBounced);
	G(TEXT("flight2 p.x"), B.P.X, Flight2PX); G(TEXT("flight2 p.y"), B.P.Y, Flight2PY); G(TEXT("flight2 p.z"), B.P.Z, Flight2PZ);
	G(TEXT("flight2 v.x"), B.V.X, Flight2VX); G(TEXT("flight2 v.y"), B.V.Y, Flight2VY); G(TEXT("flight2 v.z"), B.V.Z, Flight2VZ);
	G(TEXT("flight2 w.x"), B.W.X, Flight2WX); G(TEXT("flight2 w.y"), B.W.Y, Flight2WY); G(TEXT("flight2 w.z"), B.W.Z, Flight2WZ);
	G(TEXT("flight2 grounded"), B.bGrounded ? 1 : 0, Flight2Grounded);
	G.Report();
	return true;
}

// solveStrike: a plain shot, a curler and a driven shot out of its reach; planShot with its deviation and knuckle
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FLRStrikeSolveTest, "LegendRising.Strike.SolveShot", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FLRStrikeSolveTest::RunTest(const FString& Parameters)
{
	using namespace LRGolden;
	FGolden G(*this);
	const LRBall::FVec3 P0 = V3(0, 0.11, 0);
	const LRStrike::FStrikeLaunch L = LRStrike::SolveStrike(Req(P0, V3(2, 1.2, -20), 26, 0, 0));
	G(TEXT("solve v.x"), L.V.X, SolveVX); G(TEXT("solve v.y"), L.V.Y, SolveVY); G(TEXT("solve v.z"), L.V.Z, SolveVZ);
	G(TEXT("solve w.x"), L.W.X, SolveWX); G(TEXT("solve w.y"), L.W.Y, SolveWY); G(TEXT("solve w.z"), L.W.Z, SolveWZ);
	G(TEXT("solve yaw"), L.Yaw, SolveYaw); G(TEXT("solve elev"), L.Elev, SolveElev); G(TEXT("solve tFlight"), L.TFlight, SolveTFlight);
	G(TEXT("solve apex"), L.Apex, SolveApex); G(TEXT("solve miss"), L.Miss, SolveMiss); G(TEXT("solve ok"), L.bOk ? 1 : 0, SolveOk);
	G(TEXT("solve iters"), L.Iters, SolveIters);
	const LRStrike::FStrikeLaunch C = LRStrike::SolveStrike(Req(V3(4, 0.11, 2), V3(-2.5, 1.8, -22), 24, 0, 1.4, 85, 40));
	G(TEXT("curl v.x"), C.V.X, CurlVX); G(TEXT("curl v.y"), C.V.Y, CurlVY); G(TEXT("curl v.z"), C.V.Z, CurlVZ);
	G(TEXT("curl w.x"), C.W.X, CurlWX); G(TEXT("curl w.y"), C.W.Y, CurlWY); G(TEXT("curl w.z"), C.W.Z, CurlWZ); G(TEXT("curl miss"), C.Miss, CurlMiss);
	const LRStrike::FStrikeLaunch D = LRStrike::SolveStrike(Req(P0, V3(-3, 0.4, -16), 28, -1, 0, 50, 70));
	G(TEXT("driven v.x"), D.V.X, DrivenVX); G(TEXT("driven v.y"), D.V.Y, DrivenVY); G(TEXT("driven v.z"), D.V.Z, DrivenVZ);
	G(TEXT("driven elev"), D.Elev, DrivenElev); G(TEXT("driven ok"), D.bOk ? 1 : 0, DrivenOk);
	// the launch in Unreal: 26 m/s at 13.6 degrees, forward and a little right, the ball's centre 1.2 m up at 20 m
	const FVector Vu = LRUnits::SimToUnreal(L.V);
	TestTrue(TEXT("shot goes forward, right and up in Unreal"), Vu.X > 0 && Vu.Y > 0 && Vu.Z > 0);

	LRBall::FRng R(7);
	LRStrike::FStrikeCtx Ctx;
	Ctx.Kind = LRStrike::EKind::Shot; Ctx.bHasDist = true; Ctx.Dist = 18; Ctx.Power01 = 0.95; Ctx.Acc = 85; Ctx.Contact = 0; Ctx.BodyAngleDeg = 20;
	Ctx.PlantErr = 0.05; Ctx.BallState = LRStrike::EBallMotion::Rolling; Ctx.Pressure01 = 0.3; Ctx.Composure = 60; Ctx.BF = 0.9; Ctx.EF = 0.95; Ctx.Power = 70;
	const LRStrike::FShotPlan Pl = LRStrike::PlanShot(Req(P0, V3(2, 1.2, -20), 30, 0, 0), Ctx, R);
	G(TEXT("plan v.x"), Pl.Launch.V.X, PlanVX); G(TEXT("plan v.y"), Pl.Launch.V.Y, PlanVY); G(TEXT("plan v.z"), Pl.Launch.V.Z, PlanVZ);
	G(TEXT("plan aimed.x"), Pl.Aimed.X, PlanAimedX); G(TEXT("plan aimed.y"), Pl.Aimed.Y, PlanAimedY); G(TEXT("plan aimed.z"), Pl.Aimed.Z, PlanAimedZ);
	G(TEXT("plan sigma"), Pl.Sigma, PlanSigma); G(TEXT("plan knuckle"), Pl.Launch.Knuck.bOn ? 1 : 0, PlanKnuck);
	G(TEXT("plan knuckle amp"), Pl.Launch.Knuck.Amp, PlanKAmp); G(TEXT("plan knuckle freq"), Pl.Launch.Knuck.Freq, PlanKFreq);
	G(TEXT("plan knuckle phase"), Pl.Launch.Knuck.Phase, PlanKPhase);
	G(TEXT("shotSpeed"), LRStrike::ShotSpeed(77, 0.83, true, 0.97), ShotSpeed);
	G.Report();
	return true;
}

// the shot meter's sweet band at 10, 20 and 30 m, its grades, and the flick bar
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FLRMeterTest, "LegendRising.Strike.MeterBands", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FLRMeterTest::RunTest(const FString& Parameters)
{
	using namespace LRGolden;
	FGolden G(*this);
	const LRMeter::FMeterBand B10 = LRMeter::MeterBand(10, 50, 1), B20 = LRMeter::MeterBand(20, 50, 1), B30 = LRMeter::MeterBand(30, 50, 1);
	G(TEXT("10 m lo"), B10.Lo, Band10Lo); G(TEXT("10 m hi"), B10.Hi, Band10Hi); G(TEXT("10 m c"), B10.C, Band10C); G(TEXT("10 m gold lo"), B10.GLo, Band10GLo); G(TEXT("10 m gold hi"), B10.GHi, Band10GHi);
	G(TEXT("20 m lo"), B20.Lo, Band20Lo); G(TEXT("20 m hi"), B20.Hi, Band20Hi); G(TEXT("20 m c"), B20.C, Band20C); G(TEXT("20 m gold lo"), B20.GLo, Band20GLo); G(TEXT("20 m gold hi"), B20.GHi, Band20GHi);
	G(TEXT("30 m lo"), B30.Lo, Band30Lo); G(TEXT("30 m hi"), B30.Hi, Band30Hi); G(TEXT("30 m c"), B30.C, Band30C); G(TEXT("30 m gold lo"), B30.GLo, Band30GLo); G(TEXT("30 m gold hi"), B30.GHi, Band30GHi);
	const LRMeter::FMeterBand Off = LRMeter::MeterBand(20, 99, 0);
	G(TEXT("20 m, no assists lo"), Off.Lo, Band20OffLo); G(TEXT("20 m, no assists hi"), Off.Hi, Band20OffHi);
	G(TEXT("20 m, no assists gold lo"), Off.GLo, Band20OffGLo); G(TEXT("20 m, no assists gold hi"), Off.GHi, Band20OffGHi);
	TestTrue(TEXT("the band never reaches the over-hit (0.91 < 0.92)"), B30.Hi <= LRMeter::METER::SHOT_MAX && LRMeter::METER::SHOT_MAX < LRMeter::CN::OVERHIT);
	const double Ps[4] = {0.5, 0.62, 0.72, 0.86};
	const double Es[4] = {G050E, G062E, G072E, G086E};
	const int Gs[4] = {G050Grade, G062Grade, G072Grade, G086Grade};
	const double Os[4] = {G050Over, G062Over, G072Over, G086Over};
	for (int32 I = 0; I < 4; ++I)
	{
		const LRMeter::FGrade Gr = LRMeter::ShotGrade(Ps[I], B20);
		TestEqual(*FString::Printf(TEXT("grade at p %.2f"), Ps[I]), static_cast<int32>(Gr.Grade), Gs[I]);
		G(*FString::Printf(TEXT("grade e at p %.2f"), Ps[I]), Gr.E, Es[I]);
		G(*FString::Printf(TEXT("grade over at p %.2f"), Ps[I]), Gr.bOver ? 1 : 0, Os[I]);
	}
	G(TEXT("flickFull at 33"), LRMeter::FlickFull(33), FlickFull33);
	G(TEXT("flickFull at 55"), LRMeter::FlickFull(55), FlickFull55);
	G(TEXT("flickFull at 99"), LRMeter::FlickFull(99), FlickFull99);
	// the charge: 1 - (1 - t/0.85)^2, full at 0.85 s
	TestTrue(TEXT("charge full at 0.85 s"), LRMeter::ChargeP(0.85) == 1.0 && LRMeter::ChargeP(0.0) == 0.0);
	G.Report();
	return true;
}

// the flick's launch, the knock-on and the step-in's timing
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FLRTouchTest, "LegendRising.Strike.FlickKnockOnStepIn", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FLRTouchTest::RunTest(const FString& Parameters)
{
	using namespace LRGolden;
	FGolden G(*this);
	const LRStrike::FFlickResult F = LRStrike::FlickKick(V3(1.2, 0.11, -3.4), 1.1, LRStrike::DirOf(0.4), 0.8, 1, 0, 70, false, false);
	G(TEXT("flick v.x"), F.V.X, FlickVX); G(TEXT("flick v.y"), F.V.Y, FlickVY); G(TEXT("flick v.z"), F.V.Z, FlickVZ);
	G(TEXT("flick w.x"), F.W.X, FlickWX); G(TEXT("flick w.y"), F.W.Y, FlickWY); G(TEXT("flick w.z"), F.W.Z, FlickWZ);
	LRBall::FVec3 KV, KW;
	LRStrike::KnockOnLaunch(1.25, 1.05, 5.1, 8.4, 0.6, -0.8, KV, KW);
	G(TEXT("knock v.x"), KV.X, KnockVX); G(TEXT("knock v.y"), KV.Y, KnockVY); G(TEXT("knock v.z"), KV.Z, KnockVZ);
	G(TEXT("knock w.x"), KW.X, KnockWX); G(TEXT("knock w.y"), KW.Y, KnockWY); G(TEXT("knock w.z"), KW.Z, KnockWZ);

	// the step-in: a ball rolling 1.4 m/s, the striker jogging onto it
	LRBall::FBallState Ball = LRBall::CreateBall(0, 0.11, 0, 1.1);
	LRBall::Kick(Ball, V3(-0.2, 0, -1.4), V3(0, 0, 0), LRBall::FTouch());
	LRBall::FWorld W;
	LRBall::FWorld PW = LRBall::MakePredictionWorld(W);
	LRBall::FPredCache Pred;
	Pred.Refresh(Ball, &PW, 0, 0);
	LRStrike::FBody A;
	A.X = -0.3; A.Z = 0.9; A.Yaw = 0.2; A.Speed = 1.6; A.Vx = -0.3; A.Vz = -1.57;
	const LRStrike::FReach Cs = LRStrike::CanStrike(A, Ball);
	LRStrike::FShotAsk Rq;
	Rq.Kind = LRStrike::EKind::Shot; Rq.bHasTarget = true; Rq.Target = V3(-2, 0.8, -18);
	LRStrike::FStepIn Si;
	const bool bSi = LRStrike::StepInOf(A, Rq, Ball, Pred, 1.0 / 60, Cs.bLeftFoot, false, Si);
	TestTrue(TEXT("a step-in"), bSi);
	G(TEXT("step-in contact time"), Si.T, StepInT); G(TEXT("step-in root x"), Si.X, StepInX); G(TEXT("step-in root z"), Si.Z, StepInZ);
	TestTrue(TEXT("a step-in is struck 0.30 to 0.35 s after it is asked"), Si.T >= 0.30 && Si.T <= 0.35);

	// the drawn shot's clock (moves.js SHOT, KINDS.instep; actions.js STEP_IN)
	TestEqual(TEXT("plant 0.20 s before the contact"), LRStrike::SHOT_CLOCK::PLANT_BEFORE, 0.20);
	TestEqual(TEXT("backswing top 0.10 s before"), LRStrike::SHOT_CLOCK::TOP_BEFORE, 0.10);
	TestEqual(TEXT("follow-through top 0.115 s after"), LRStrike::SHOT_CLOCK::FT_AFTER, 0.115);
	TestEqual(TEXT("kicking foot down 0.36 s after"), LRStrike::SHOT_CLOCK::LAND_AFTER, 0.36);
	TestEqual(TEXT("the act ends 0.37 s after"), LRStrike::STEP_IN::FOLLOW, 0.37);
	TestEqual(TEXT("plant 0.33 m across"), LRStrike::STEP_IN::PLANT_LAT, 0.33);
	TestEqual(TEXT("plant 0.08 m behind"), LRStrike::STEP_IN::PLANT_ALONG, -0.08);
	G.Report();
	return true;
}

// the axis map: forward, right and up survive, and a spin still turns the way it did (pseudovector sign)
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FLRUnitsTest, "LegendRising.Ball.UnitConversion", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FLRUnitsTest::RunTest(const FString& Parameters)
{
	// yaw 0 faces sim -Z: Unreal +X; the right of it, sim +X, is Unreal +Y; up is up; metres to centimetres
	TestEqual(TEXT("sim -Z is forward"), LRUnits::SimToUnreal(V3(0, 0, -1)), FVector(100, 0, 0));
	TestEqual(TEXT("sim +X is right"), LRUnits::SimToUnreal(V3(1, 0, 0)), FVector(0, 100, 0));
	TestEqual(TEXT("sim +Y is up"), LRUnits::SimToUnreal(V3(0, 1, 0)), FVector(0, 0, 100));
	const LRBall::FVec3 Back = LRUnits::UnrealToSim(FVector(123, -45, 67));
	TestEqual(TEXT("round trip"), LRUnits::SimToUnreal(Back), FVector(123, -45, 67));
	// yaw: a sim facing turned left (+0.5 rad) is an Unreal yaw of -28.6 degrees, and the directions agree
	const LRStrike::FDir2 D = LRStrike::DirOf(0.5);
	const double UeYaw = LRUnits::SimYawToUnrealDeg(0.5);
	const FVector Fwd = FRotator(0, UeYaw, 0).Vector();
	TestTrue(TEXT("yaw map"), Fwd.Equals(LRUnits::SimDirToUnreal(D.X, D.Z), 1e-9));
	// backspin on a ball struck forward lifts it in both frames: Magnus w x v points up
	const LRStrike::FDir2 F0 = LRStrike::DirOf(0);
	const LRBall::FVec3 W = LRStrike::LaunchSpin(F0.X, F0.Z, 1, 0, false);       // High contact: backspin
	const LRBall::FVec3 V = V3(F0.X * 25, 0, F0.Z * 25);
	const double SimLift = W.Z * V.X - W.X * V.Z;                                   // (w x v).y
	const FVector Lift = FVector::CrossProduct(LRUnits::SimSpinToUnreal(W), LRUnits::SimToUnreal(V));
	TestTrue(TEXT("backspin lifts in the sim"), SimLift > 0);
	TestTrue(TEXT("backspin lifts in Unreal (+Z)"), Lift.Z > 0 && FMath::Abs(Lift.X) < 1e-9 && FMath::Abs(Lift.Y) < 1e-9);
	// a right foot's inside curl (w.y > 0 in the sim) bends the ball to the striker's left: Unreal -Y
	const LRBall::FVec3 Wc = LRStrike::LaunchSpin(F0.X, F0.Z, 0, 1, false);
	const FVector Bend = FVector::CrossProduct(LRUnits::SimSpinToUnreal(Wc), LRUnits::SimToUnreal(V));
	TestTrue(TEXT("inside curl bends left (-Y) in Unreal"), Bend.Y < 0);
	return true;
}

#endif // WITH_DEV_AUTOMATION_TESTS
