// core_check_ball.cpp: prints the same lines as ball_trace.mjs from the C++ port (LRDetMath, LRBallCore). Built
// outside Unreal by run_check.sh; the two outputs must be identical.
#include "LRBallCore.h"
#include "LRDetMath.h"

#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

using namespace LRBall;

static std::vector<std::string> Out;
static std::string Fmt(double V)
{
	uint64_t U;
	std::memcpy(&U, &V, 8);
	char Buf[32];
	std::snprintf(Buf, sizeof(Buf), "%016llx", static_cast<unsigned long long>(U));
	return Buf;
}
// JS's Number toString for the names (only simple numbers are used: integers and short decimals)
static std::string Js(double V)
{
	char Buf[64];
	if (V == std::floor(V) && std::fabs(V) < 1e15) { std::snprintf(Buf, sizeof(Buf), "%.0f", V == 0 ? 0.0 : V); return Buf; }
	for (int P = 1; P <= 17; P++)
	{
		std::snprintf(Buf, sizeof(Buf), "%.*g", P, V);
		if (std::strtod(Buf, nullptr) == V) break;
	}
	std::string S = Buf;
	// JS writes 1e-9 and 1e-3 as 1e-9 and 0.001
	if (S == "1e-09") return "1e-9";
	if (S == "-1e-09") return "-1e-9";
	if (S == "0.001") return "0.001";
	if (S == "-0.001") return "-0.001";
	if (S == "-1e+03") return "-1000";
	return S;
}
static void Put(const std::string& N, double V) { Out.push_back(N + " " + Fmt(V)); }
static void PutV(const std::string& N, const FVec3& V) { Put(N + ".x", V.X); Put(N + ".y", V.Y); Put(N + ".z", V.Z); }
static void PutBall(const std::string& N, const FBallState& B)
{
	PutV(N + ".p", B.P); PutV(N + ".v", B.V); PutV(N + ".w", B.W); Put(N + ".grounded", B.bGrounded ? 1 : 0);
}
static FVec3 V3(double X, double Y, double Z) { FVec3 V; V.X = X; V.Y = Y; V.Z = Z; return V; }

int main()
{
	using namespace LRDetMath;
	const double Args[] = {-1e3, -37.5, -7.1, -3.3, -1.2, -0.7, -1e-3, -1e-9, 0, 1e-9, 2e-3, 0.3, 0.785, 1, 1.5, 2.2, 3.14159, 4.9, 10.5, 123.456, 700};
	for (double A : Args)
	{
		const std::string S = Js(A);
		Put("exp(" + S + ")", Exp(A)); Put("sin(" + S + ")", Sin(A)); Put("cos(" + S + ")", Cos(A)); Put("atan(" + S + ")", Atan(A));
		Put("tan(" + S + ")", Tan(A));
		if (A > 0) { Put("log(" + S + ")", Log(A)); Put("pow(" + S + ",1.7)", Pow(A, 1.7)); Put("pow(" + S + ",3)", Pow(A, 3)); }
		Put("atan2(" + S + ",-2.5)", Atan2(A, -2.5)); Put("atan2(" + S + ",0.75)", Atan2(A, 0.75));
		if (A >= -1 && A <= 1) { Put("asin(" + S + ")", Asin(A)); Put("acos(" + S + ")", Acos(A)); }
	}
	{
		FRng R(12345);
		for (int I = 0; I < 6; I++) Put("rng.u" + std::to_string(I), R.Next());
		for (int I = 0; I < 6; I++) Put("rng.t" + std::to_string(I), R.TruncNormal(1, 2.5));
	}
	// A
	{
		FBallState B = CreateBall(0, BALL::R, 0, 1.1);
		FWorld W;
		FTouch T; T.Agent = 1; T.Team = 0; T.Kind = "pass"; T.bHasT = true; T.T = 0;
		Kick(B, V3(0, 0, -8), V3(0, 0, 0), T);
		for (int I = 0; I < 60; I++) { Step(B, W, 1.0 / 60); if (I % 10 == 9) PutBall("A" + std::to_string(I + 1), B); }
	}
	// B
	{
		FBallState B = CreateBall(1, BALL::R, -2, 1.3);
		FWorld W;
		FTouch T; T.Agent = 2; T.Team = 1; T.Kind = "shot"; T.Aero = 60; T.bHasT = true; T.T = 0.5;
		Kick(B, V3(3, 9, -25), V3(15, 20, -5), T);
		for (int I = 0; I < 180; I++) { Step(B, W, 1.0 / 60); if (I % 15 == 14) PutBall("B" + std::to_string(I + 1), B); }
	}
	// C
	{
		FBallState B = CreateBall();
		FWorld W;
		FTouch T; T.Kind = "shot"; T.Knuck.bOn = true; T.Knuck.Amp = 2.1; T.Knuck.Freq = 7.3; T.Knuck.Phase = 1.1;
		Kick(B, V3(0.5, 5, -27), V3(0.5, 1, 0), T);
		for (int I = 0; I < 70; I++) { Step(B, W, 1.0 / 60); if (I % 10 == 9) PutBall("C" + std::to_string(I + 1), B); }
	}
	// E
	{
		std::vector<FEvent> Ev;
		FRng Rng(99);
		FWorld W;
		W.Rng = &Rng;
		W.OnEvent = [&Ev](const FEvent& E) { Ev.push_back(E); };
		AddCapsule(W, -3.66, 0, -20, -3.66, 2.44, -20, 0.06, EHitKind::Post, 1);
		AddCapsule(W, 3.66, 0, -20, 3.66, 2.44, -20, 0.06, EHitKind::Post, 1);
		AddCapsule(W, -3.66, 2.44, -20, 3.66, 2.44, -20, 0.06, EHitKind::Bar, 1);
		FBoard Bd; Bd.Nx = 0; Bd.Ny = 0; Bd.Nz = 1; Bd.D = -26; Bd.E = 0.5; Bd.X0 = -30; Bd.X1 = 30; Bd.Y0 = 0; Bd.Y1 = 0.9; Bd.Z0 = -26; Bd.Z1 = -26;
		AddBoard(W, Bd, true, V3(-30, 0.9, -26), V3(30, 0.9, -26));
		FBodyRec B1; B1.Id = 5; B1.Team = 1; B1.X = 0.4; B1.Z = -10; B1.H = 1; B1.Vx = 0.5; B1.Vz = 0.2;
		FBodyRec B2; B2.Id = 6; B2.Team = 1; B2.X = -2; B2.Z = -14; B2.H = 1.05; B2.Vx = 0; B2.Vz = 1;
		FBodyRec B3; B3.Id = 7; B3.Team = 1; B3.X = -1.5; B3.Z = -19.5; B3.H = 1; B3.Vx = -2; B3.Vy = 0.5; B3.Vz = 0;
		B3.bSeg = true; B3.SegAx = -1.2; B3.SegAy = 0.5; B3.SegAz = -19.5; B3.SegBx = -2.6; B3.SegBy = 1.1; B3.SegBz = -19.5; B3.SegR = 0.22;
		W.Bodies = {B1, B2, B3};
		FHandRec H; H.Id = 9; H.Team = 1; H.X = 2.6; H.Y = 1.2; H.Z = -19.6; H.Rad = 0.1;
		W.Hands = {H};
		struct FShot { double Px, Pz; FVec3 V, S; };
		const FShot Shots[] = {
			{0, 0, V3(-0.2, 4, -24), V3(5, 0, 0)},
			{0, -3, V3(-6.2, 3.4, -27), V3(0, 3, 0)},
			{1, -6, V3(0.3, 6.3, -22), V3(10, -12, 0)},
			{0, -12, V3(3.3, 3.8, -20), V3(0, 0, 0)},
			{3.66, -10, V3(0, 4, -20), V3(0, 0, 0)},
			{0, -8, V3(0, 7.7, -22), V3(-20, 0, 0)},
			{0.4, -6, V3(0, 1, -15), V3(0, 0, 0)},
			{2.6, -12, V3(0, 4.5, -18), V3(0, 0, 0)},
			{-1.8, -15, V3(0, 2.6, -16), V3(0, 0, 0)},
		};
		int K = 0;
		for (const FShot& Sh : Shots)
		{
			FBallState B = CreateBall(Sh.Px, BALL::R, Sh.Pz);
			FTouch T; T.Agent = 3; T.Team = 0; T.Kind = "shot"; T.Aero = 40; T.bHasT = true; T.T = W.T;
			Kick(B, Sh.V, Sh.S, T);
			for (int I = 0; I < 150; I++) { Step(B, W, 1.0 / 60); if (I % 25 == 24) PutBall("E" + std::to_string(K) + "." + std::to_string(I + 1), B); }
			K++;
		}
		static const char* Names[] = {"touch", "bounce", "post", "bar", "board", "body", "wall"};
		for (size_t I = 0; I < Ev.size(); I++)
		{
			const FEvent& E = Ev[I];
			const std::string P = "ev" + std::to_string(I);
			Put(P + "." + Names[static_cast<int>(E.Type)] + ".t", E.T); Put(P + ".x", E.X); Put(P + ".y", E.Y); Put(P + ".z", E.Z);
			const bool bColl = E.Type == EEventType::Post || E.Type == EEventType::Bar || E.Type == EEventType::Board || E.Type == EEventType::Body || E.Type == EEventType::Wall;
			if (bColl) Put(P + ".speed", E.Speed);
			if (E.Type == EEventType::Bounce) Put(P + ".vy", E.Vy);
			if (bColl) PutV(P + ".vOut", E.VOut);
			if (E.Type == EEventType::Body) Out.push_back(P + ".part " + E.Part);
		}
	}
	// F
	{
		FBallState B = CreateBall();
		FTouch T; T.Kind = "shot";
		Kick(B, V3(1, 7, -20), V3(8, -6, 0), T);
		float Pred[360];
		const int N = Predict(B, nullptr, Pred, 360, 90, 30);
		Put("F.n", N);
		for (int K = 0; K < N; K += 7)
		{
			Put("F.p" + std::to_string(K) + ".x", Pred[4 * K]); Put("F.p" + std::to_string(K) + ".y", Pred[4 * K + 1]);
			Put("F.p" + std::to_string(K) + ".z", Pred[4 * K + 2]); Put("F.p" + std::to_string(K) + ".t", Pred[4 * K + 3]);
		}
		const FFlyResult Fo = FlyTo(B, nullptr, 0, -18, 0, -1, 6);
		Put("F.fly.hit", Fo.bHit ? 1 : 0); Put("F.fly.x", Fo.X); Put("F.fly.y", Fo.Y); Put("F.fly.z", Fo.Z); Put("F.fly.t", Fo.T);
		Put("F.fly.apex", Fo.Apex); Put("F.fly.vx", Fo.Vx); Put("F.fly.vy", Fo.Vy); Put("F.fly.vz", Fo.Vz);
	}
	// G
	for (double V0 : {3.0, 8.5, 14.0}) for (double D : {2.0, 9.0, 25.0})
	{
		Put("G.dist(" + Js(V0) + ")", RollDistance(V0, 0, 1.1)); Put("G.speedFor(" + Js(D) + ")", RollSpeedFor(D, 2, 1.25));
		Put("G.time(" + Js(V0) + "," + Js(D) + ")", RollTime(V0, D, 1.1)); Put("G.at(" + Js(V0) + "," + Js(D / 10) + ")", RollSpeedAt(V0, D / 10, 1.1));
	}
	for (const std::string& L : Out) std::printf("%s\n", L.c_str());
	return 0;
}
