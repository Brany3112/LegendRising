// core_check_strike.cpp: prints the same lines as strike_trace.mjs from the C++ port (LRStrikeSolver, LRShotMeter).
#include "LRBallCore.h"
#include "LRDetMath.h"
#include "LRShotMeter.h"
#include "LRStrikeSolver.h"

#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

using namespace LRStrike;
using LRBall::FVec3;

static std::vector<std::string> Out;
static std::string Fmt(double V)
{
	uint64_t U;
	std::memcpy(&U, &V, 8);
	char Buf[32];
	std::snprintf(Buf, sizeof(Buf), "%016llx", static_cast<unsigned long long>(U));
	return Buf;
}
static std::string Js(double V)
{
	char Buf[64];
	if (V == std::floor(V) && std::fabs(V) < 1e15) { std::snprintf(Buf, sizeof(Buf), "%.0f", V == 0 ? 0.0 : V); return Buf; }
	for (int P = 1; P <= 17; P++) { std::snprintf(Buf, sizeof(Buf), "%.*g", P, V); if (std::strtod(Buf, nullptr) == V) break; }
	std::string S = Buf;
	if (S == "1e-08") return "1e-8";
	if (S == "3e-09") return "3e-9";
	return S;
}
static void Put(const std::string& N, double V) { Out.push_back(N + " " + Fmt(V)); }
static void PutV(const std::string& N, const FVec3& V) { Put(N + ".x", V.X); Put(N + ".y", V.Y); Put(N + ".z", V.Z); }
static FVec3 V3(double X, double Y, double Z) { FVec3 V; V.X = X; V.Y = Y; V.Z = Z; return V; }
static void PutL(const std::string& N, const FStrikeLaunch& L)
{
	PutV(N + ".v", L.V); PutV(N + ".w", L.W); Put(N + ".ok", L.bOk ? 1 : 0); Put(N + ".tFlight", L.TFlight); Put(N + ".apex", L.Apex);
	Put(N + ".yaw", L.Yaw); Put(N + ".elev", L.Elev); Put(N + ".miss", L.Miss); Put(N + ".iters", L.Iters);
}
static FStrikeRequest Req(FVec3 From, FVec3 Tg, double Speed, int Contact, double Curl, bool bLeft, EKind Kind, double Curve = 50, double Aero = 0)
{
	FStrikeRequest R;
	R.From = From; R.Target = Tg; R.Speed = Speed; R.Contact = Contact; R.Curl = Curl; R.bLeftFoot = bLeft; R.Kind = Kind; R.RollDecel = 1.1;
	R.Curve = Curve; R.Aero = Aero;
	return R;
}

int main()
{
	// 1. solveStrike
	const FVec3 P0 = V3(0, 0.11, 0);
	std::vector<FStrikeRequest> Reqs = {
		Req(P0, V3(2, 1.2, -20), 26, 0, 0, false, EKind::Shot),
		Req(P0, V3(-3, 0.4, -16), 28, -1, 0, false, EKind::Shot, 50, 70),
		Req(P0, V3(1, 2.2, -14), 15, 1, 0, true, EKind::Chip, 80),
		Req(V3(4, 0.11, 2), V3(-2.5, 1.8, -22), 24, 0, 1.4, false, EKind::Shot, 85, 40),
		Req(P0, V3(6, 0.11, -18), 14, 0, 0, false, EKind::Pass),
		Req(P0, V3(0, 2, -60), 12, 0, 0, false, EKind::Shot),
		Req(P0, V3(0.01, 1, 0.02), 20, 0, 0, false, EKind::Shot),
		Req(V3(0, 0.6, 0), V3(-4, 2.3, -25), 30, 0, -2.5, true, EKind::Shot, 60),
	};
	for (size_t I = 0; I < Reqs.size(); I++) PutL("solve" + std::to_string(I), SolveStrike(Reqs[I]));
	for (size_t I = 0; I < 6; I++)
	{
		FStrikeSolve St;
		St.Begin(Reqs[I]);
		bool bDone = false;
		for (int K = 0; K < 40 && !bDone; K++)
		{
			bDone = St.StepFlight();
			const FWarmStart W = St.Warm();
			const std::string P = "pre" + std::to_string(I) + "." + std::to_string(K);
			// (the JS prints st.yaw/st.el, NaN before a flight; Warm() is only valid after one)
			Put(P + ".n", St.Flights());
			Put(P + ".yaw", W.bValid ? W.Yaw : NAN); Put(P + ".el", W.bValid ? W.El : NAN);
			if (W.bValid && W.bHasJ) for (int Q = 0; Q < 4; Q++) Put(P + ".J" + std::to_string(Q), W.J[Q]);
			if (K == 1)
			{
				FStrikeRequest R2 = Reqs[I];
				R2.Target.X += 0.3; R2.Target.Y += 0.1;
				PutL("warm" + std::to_string(I), SolveStrike(R2, W.bValid ? &W : nullptr));
			}
		}
		if (bDone) PutL("pre" + std::to_string(I) + ".res", St.Result());
	}

	// 2. sigma, deviation, planShot
	std::vector<FStrikeCtx> Ctxs(5);
	{
		FStrikeCtx& C = Ctxs[0];
		C.Kind = EKind::Shot; C.bHasDist = true; C.Dist = 18; C.Power01 = 0.85; C.Acc = 72; C.Contact = 0; C.WeakFoot = EFoot::Right; C.BodyAngleDeg = 20;
		C.PlantErr = 0.05; C.BallState = EBallMotion::Rolling; C.Pressure01 = 0.3; C.Composure = 60; C.BF = 0.9; C.EF = 0.95; C.Power = 70;
	}
	{
		FStrikeCtx& C = Ctxs[1];
		C.Kind = EKind::Shot; C.bHasDist = true; C.Dist = 25; C.Power01 = 0.97; C.Acc = 40; C.Contact = -1; C.WeakFoot = EFoot::Left; C.BodyAngleDeg = 70;
		C.PlantErr = 0.2; C.BallState = EBallMotion::Still; C.Pressure01 = 0.8; C.Composure = 30; C.BF = 0.6; C.EF = 0.7; C.bFinesse = true; C.bFirstTime = true;
		C.VIn = 6; C.Power = 50; C.bScuff = true;
	}
	{
		FStrikeCtx& C = Ctxs[2];
		C.Kind = EKind::Chip; C.bHasDist = true; C.Dist = 12; C.Power01 = 0.6; C.Acc = 99; C.Contact = 1; C.WeakFoot = EFoot::Both; C.BallState = EBallMotion::Bouncing;
		C.Composure = 50; C.Power = 80;
	}
	{
		FStrikeCtx& C = Ctxs[3];
		C.Kind = EKind::Pass; C.bHasDist = true; C.Dist = 20; C.Acc = 65; C.BodyAngleDeg = 10; C.PlantErr = 0.1; C.Pressure01 = 0.5; C.Composure = 70;
		C.bFirstTime = true; C.bHasWeightSigma = true; C.WeightSigma = 0.04; C.Power01 = 0.8;
	}
	{
		FStrikeCtx& C = Ctxs[4];
		C.Kind = EKind::Header; C.bHasDist = true; C.Dist = 10; C.Acc = 55; C.Pressure01 = 0.2; C.Composure = 50; C.BF = 0.8;
	}
	for (size_t I = 0; I < Ctxs.size(); I++) Put("sigma" + std::to_string(I), SigmaOf(Ctxs[I]));
	{
		LRBall::FRng R(4242);
		for (size_t I = 0; I < Ctxs.size(); I++)
		{
			const FDeviation Dv = Deviation(Ctxs[I], R);
			Put("dev" + std::to_string(I) + ".ex", Dv.Ex); Put("dev" + std::to_string(I) + ".ey", Dv.Ey); Put("dev" + std::to_string(I) + ".es", Dv.Es);
		}
		FStrikeCtx Fin = Ctxs[0]; Fin.bFinesse = true;
		FStrikeRequest Fast = Reqs[0]; Fast.Speed = 30;
		FStrikeCtx Hard = Ctxs[0]; Hard.Power01 = 0.95; Hard.Acc = 85;
		struct FPair { FStrikeRequest Q; FStrikeCtx C; };
		const FPair Plans[] = {{Reqs[0], Ctxs[0]}, {Reqs[1], Ctxs[1]}, {Reqs[3], Fin}, {Fast, Hard}};
		int I = 0;
		for (const FPair& Pp : Plans)
		{
			const FShotPlan Pl = PlanShot(Pp.Q, Pp.C, R);
			const std::string N = "plan" + std::to_string(I++);
			PutL(N, Pl.Launch); PutV(N + ".aimed", Pl.Aimed); Put(N + ".sigma", Pl.Sigma); Put(N + ".quality", Pl.Quality);
			Put(N + ".knuck", Pl.Launch.Knuck.bOn ? 1 : 0);
			if (Pl.Launch.Knuck.bOn) { Put(N + ".kamp", Pl.Launch.Knuck.Amp); Put(N + ".kfreq", Pl.Launch.Knuck.Freq); Put(N + ".kphase", Pl.Launch.Knuck.Phase); }
		}
		Put("rng.after", R.Next());
	}
	for (double P : {0.0, 20.0, 33.0, 44.0, 55.0, 77.0, 99.0, 110.0}) { Put("shotV(" + Js(P) + ")", ShotVFull(P)); Put("accSigma(" + Js(P) + ")", AccSigma(P)); }
	Put("shotSpeed", ShotSpeed(77, 0.83, true, 0.97));
	for (double D : {3.0, 12.0, 40.0}) { Put("passSpeed(" + Js(D) + ")", PassSpeedFor(D, 9, 1.1)); Put("loft(" + Js(D) + ")", LoftSpeedFor(D)); }

	// 3. the meter
	for (double D : {10.0, 20.0, 30.0})
	{
		const double Cases[4][2] = {{50, 1}, {50, 0}, {99, 0.5}, {0, 1}};
		for (const auto& Tc : Cases)
		{
			const LRMeter::FMeterBand Bd = LRMeter::MeterBand(D, Tc[0], Tc[1]);
			const std::string N = "band(" + Js(D) + "," + Js(Tc[0]) + "," + Js(Tc[1]) + ")";
			Put(N + ".lo", Bd.Lo); Put(N + ".hi", Bd.Hi); Put(N + ".c", Bd.C); Put(N + ".glo", Bd.GLo); Put(N + ".ghi", Bd.GHi);
		}
	}
	{
		const LRMeter::FMeterBand Bd = LRMeter::MeterBand(20, 50, 1);
		for (double P : {0.1, 0.5, 0.62, 0.66, 0.7, 0.75, 0.8, 0.86, 0.95})
		{
			const LRMeter::FGrade G = LRMeter::ShotGrade(P, Bd);
			const std::string N = "grade(" + Js(P) + ")";
			Out.push_back(N + " " + (G.Grade == LRMeter::EGrade::Perfect ? "perfect" : G.Grade == LRMeter::EGrade::Good ? "good" : "scuff"));
			Put(N + ".e", G.E); Put(N + ".over", G.bOver ? 1 : 0);
		}
		const LRMeter::FPassBand Pb = LRMeter::PassBand(14, 26, 70, 1);
		Put("pass.lo", Pb.Lo); Put("pass.hi", Pb.Hi); Put("pass.c", Pb.C);
	}
	for (double C : {0.0, 20.0, 33.0, 50.0, 55.0, 80.0, 99.0, 120.0, 200.0})
	{
		Put("flickRate(" + Js(C) + ")", LRMeter::FlickRate(C)); Put("flickFull(" + Js(C) + ")", LRMeter::FlickFull(C)); Put("curlSpin(" + Js(C) + ")", LRMeter::CurlSpin(C));
	}
	Put("tech", LRMeter::TechniqueOf(60, 0, 77));
	for (double T : {0.0, 0.1, 0.18, 0.4, 0.85, 1.2}) Put("charge(" + Js(T) + ")", LRMeter::ChargeP(T));
	const double Hy[5][2] = {{3, 4}, {0.1, 1e-3}, {12.25, -7.5}, {1e-8, 3e-9}, {19.7, 0.33}};
	for (const auto& H : Hy) Put("hypot(" + Js(H[0]) + "," + Js(H[1]) + ")", LRMeter::JsHypot(H[0], H[1]));

	// 4. flick and knock-on
	for (double S : {0.0, 20.0, 33.0, 55.0, 80.0, 99.0, 140.0}) Put("flickTop(" + Js(S) + ")", FlickTop(S));
	struct FFl { double P; int Fwd, Side; double Str; bool bFirst; };
	const FFl Flicks[] = {{0.8, 1, 0, 70, false}, {0.5, 0, 0, 40, false}, {1, -1, 0, 99, false}, {0.6, 0, 1, 55, false}, {0.9, 1, -1, 80, true}, {0.3, 0, -1, 20, true}};
	for (int I = 0; I < 6; I++)
	{
		const FFl& Fl = Flicks[I];
		const FVec3 BP = V3(1.2, I == 4 ? 0.3 : 0.11, -3.4);
		const FFlickResult R = FlickKick(BP, 1.1, DirOf(0.4), Fl.P, Fl.Fwd, Fl.Side, Fl.Str, Fl.bFirst, I == 5);
		PutV("flick" + std::to_string(I) + ".v", R.V); PutV("flick" + std::to_string(I) + ".w", R.W);
	}
	{
		FVec3 V, W;
		KnockOnLaunch(1.25, 1.05, 5.1, 8.4, 0.6, -0.8, V, W);
		PutV("knock.v", V); PutV("knock.w", W);
	}

	// 5. the reach window and the step-in
	{
		struct FCase { double X, Z, Yaw, Speed, Vx, Vz; FVec3 Bv, Tg; EFoot Foot; };
		const FCase Cases[] = {
			{0, 0.5, 0, 0, 0, 0, V3(0, 0, 0), V3(1, 1, -20), EFoot::Right},
			{-0.3, 0.9, 0.2, 1.6, -0.3, -1.57, V3(-0.2, 0, -1.4), V3(-2, 0.8, -18), EFoot::Right},
			{0.4, 0.7, -0.3, 3.5, 1.0, -3.35, V3(0.8, 0, -2.6), V3(3, 1.5, -22), EFoot::Left},
			{0.6, 0.2, 1.0, 0.5, -0.42, -0.27, V3(0, 0, 0), V3(0, 1, -20), EFoot::Right},
			{0, 0.5, 0, 5, 0, -5, V3(0, 0, -4.5), V3(0, 1, -20), EFoot::Right},
		};
		int I = 0;
		for (const FCase& C : Cases)
		{
			LRBall::FBallState Ball = LRBall::CreateBall(0, 0.11, 0, 1.1);
			LRBall::Kick(Ball, C.Bv, V3(0, 0, 0), LRBall::FTouch());
			LRBall::FWorld W;
			LRBall::FWorld PW = LRBall::MakePredictionWorld(W);
			LRBall::FPredCache Pred;
			Pred.Refresh(Ball, &PW, 0, 0);
			FBody A; A.X = C.X; A.Z = C.Z; A.Yaw = C.Yaw; A.Speed = C.Speed; A.Vx = C.Vx; A.Vz = C.Vz; A.Foot = C.Foot;
			const FReach Cs = CanStrike(A, Ball);
			const std::string N = std::to_string(I);
			Put("cs" + N + ".ok", Cs.bOk ? 1 : 0); Put("cs" + N + ".tc", Cs.Tc); Out.push_back("cs" + N + ".foot " + (Cs.bLeftFoot ? "L" : "R"));
			Put("cs" + N + ".ahead", Cs.Ahead); Put("cs" + N + ".lat", Cs.Lat);
			FShotAsk Rq; Rq.Kind = EKind::Shot; Rq.bHasTarget = true; Rq.Target = C.Tg;
			FStepIn Si;
			const bool bSi = StepInOf(A, Rq, Ball, Pred, 1.0 / 60, Cs.bLeftFoot, false, Si);
			Put("si" + N, bSi ? 1 : 0);
			if (bSi) { Put("si" + N + ".t", Si.T); Put("si" + N + ".x", Si.X); Put("si" + N + ".z", Si.Z); Put("si" + N + ".fx", Si.Fx); Put("si" + N + ".fz", Si.Fz); }
			I++;
		}
		for (double T : {0.0, 0.1, 0.2, 0.3, 0.45, 0.7, 1.0}) Put("root(" + Js(T) + ")", StrikeRoot(T, 0.3));
	}
	for (const std::string& L : Out) std::printf("%s\n", L.c_str());
	return 0;
}
