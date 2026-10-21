// LRStrikeSolver.cpp: see LRStrikeSolver.h. Line-for-line ports of strike.js and the kick, flick and knock-on parts of
// actions.js (bcs/integ 41c4cd0). The order of every floating point operation follows the JS.

#include "LRStrikeSolver.h"
#include "Ball/LRDetMath.h"

#include <algorithm>
#include <cmath>
#include <limits>

// Strict IEEE arithmetic in this file (see LRDetMath.cpp)
#if defined(_MSC_VER) && !defined(__clang__)
	#pragma float_control(precise, on, push)
	#pragma fp_contract(off)
#elif defined(__clang__)
	#pragma float_control(precise, on, push)
	#pragma clang fp contract(off)
#endif

namespace LRStrike
{
namespace
{
	using LRBall::FBallState;
	using LRBall::FVec3;
	namespace BALL = LRBall::BALL;

	const double SS_INF = std::numeric_limits<double>::infinity();
	const double SS_NAN = std::numeric_limits<double>::quiet_NaN();

	inline double Clamp(double V, double A, double B) { return V < A ? A : V > B ? B : V; }
	inline double Num(double V) { return V == V ? V : 0; }
	// Math.sign, keeping the sign of a zero
	inline double Sign(double V) { return V > 0 ? 1.0 : V < 0 ? -1.0 : V; }
	// actions.js sstep01
	inline double SStep01(double A, double B, double X)
	{
		const double T = Clamp((X - A) / (B - A), 0, 1);
		return T * T * (3 - 2 * T);
	}
	FVec3 V3(double X, double Y, double Z) { FVec3 V; V.X = X; V.Y = Y; V.Z = Z; return V; }

	// piecewise straight lines through (Xs, Ys), on past the last point at the last slope (strike.js shotVFull uses
	// a fixed slope HI instead; flickTop and flickRate the last segment's, capped)
	double PiecewiseUpTo(const double* Xs, const double* Ys, int Count, double X)
	{
		for (int I = 1; I < Count; I++)
		{
			if (X <= Xs[I])
			{
				const double X0 = Xs[I - 1], Y0 = Ys[I - 1], X1 = Xs[I], Y1 = Ys[I];
				return Y0 + (Y1 - Y0) * (X - X0) / (X1 - X0);
			}
		}
		return Ys[0];
	}
}
}

// ---------------------------------------------------------------------------------------------------------------------
// pitchspec.js
// ---------------------------------------------------------------------------------------------------------------------

LRStrike::FDir2 LRStrike::DirOf(double Yaw)
{
	FDir2 D;
	D.X = -LRDetMath::Sin(Yaw);
	D.Z = -LRDetMath::Cos(Yaw);
	return D;
}

double LRStrike::YawOf(double Dx, double Dz) { return LRDetMath::Atan2(-Dx, -Dz); }

double LRStrike::WrapA(double A)
{
	// a = (a + PI) % (2*PI); return a < 0 ? a + PI : a - PI
	A = std::fmod(A + LRDetMath::Pi, 2 * LRDetMath::Pi);
	return A < 0 ? A + LRDetMath::Pi : A - LRDetMath::Pi;
}

bool LRStrike::IsShotKind(EKind K) { return K == EKind::Shot || K == EKind::Chip; }
bool LRStrike::IsGroundKind(EKind K) { return K == EKind::Pass || K == EKind::Through || K == EKind::Roll; }
const char* LRStrike::KindName(EKind K)
{
	switch (K)
	{
	case EKind::Shot: return "shot";
	case EKind::Chip: return "chip";
	case EKind::Pass: return "pass";
	case EKind::Through: return "through";
	case EKind::Roll: return "roll";
	case EKind::Cross: return "cross";
	case EKind::Lob: return "lob";
	case EKind::Clear: return "clear";
	case EKind::Header: return "header";
	case EKind::Throw: return "throw";
	}
	return "shot";
}

// ---------------------------------------------------------------------------------------------------------------------
// spin (strike.js launchSpin, lines 53-61)
// ---------------------------------------------------------------------------------------------------------------------

LRBall::FVec3 LRStrike::LaunchSpin(double Dx, double Dz, int Contact, double Curl, bool bLeftFoot, double Curve)
{
	const double Rx = -Dz, Rz = Dx;                       // right of the facing
	const double Tb = Contact > 0 ? STRIKE::HIGH_BACK : Contact < 0 ? -STRIKE::LOW_TOP : 0;
	const double C = Clamp(Num(Curl), -3, 3);
	const double Side = std::fabs(C) * (STRIKE::CURL_BASE + STRIKE::CURL_K * Clamp(Num(Curve), 0, 99));
	FVec3 Out;
	Out.X = Tb * Rx; Out.Z = Tb * Rz;
	Out.Y = (bLeftFoot ? -1.0 : 1.0) * Sign(C) * Side;
	return Out;
}

// ---------------------------------------------------------------------------------------------------------------------
// the solver (strike.js solveGen, lines 144-255)
// ---------------------------------------------------------------------------------------------------------------------

void LRStrike::FStrikeSolve::Begin(const FStrikeRequest& Req, const FWarmStart* WarmStart)
{
	*this = FStrikeSolve();
	Rq = Req;
	if (WarmStart) { bHasWarmIn = true; WarmIn = *WarmStart; }
	StYaw = SS_NAN; StEl = SS_NAN;
	Phase = EPhase::Start;
}

LRStrike::FStrikeSolve::FEval LRStrike::FStrikeSolve::EvalLaunch(double YawIn, double ElIn) const
{
	// strike.js evalLaunch (lines 71-84): one flight for (yaw, elev), the miss in the target plane
	const FDir2 Dd = DirOf(YawIn);
	const double C = LRDetMath::Cos(ElIn), Sp = Speed;
	FBallState SB = LRBall::CreateBall();
	SB.P.X = From.X; SB.P.Y = std::max(BALL::R, From.Y); SB.P.Z = From.Z;
	SB.V.X = Sp * C * Dd.X; SB.V.Y = Sp * LRDetMath::Sin(ElIn); SB.V.Z = Sp * C * Dd.Z;
	SB.W = LaunchSpin(Dd.X, Dd.Z, Contact, Curl, bLeft, Curve);
	SB.DragMul = DragMul; SB.RollDecel = RollDecel; SB.State = LRBall::EBallState::Free; SB.Knuck = LRBall::FKnuckle();
	SB.bGrounded = SB.P.Y <= BALL::R + 0.002 && SB.V.Y <= 0.05;
	const LRBall::FFlyResult FO = LRBall::FlyTo(SB, nullptr, Tx, Tz, Ax, Az, STRIKE::T_MAX);
	FEval Ev;
	Ev.bShort = !FO.bHit; Ev.T = FO.T; Ev.Apex = FO.Apex; Ev.X = FO.X; Ev.Y = FO.Y; Ev.Z = FO.Z;
	Ev.Lat = (FO.X - Tx) * Rx + (FO.Z - Tz) * Rz;
	Ev.Ver = FO.Y - Ty;
	return Ev;
}

void LRStrike::FStrikeSolve::Keep()
{
	// the closest launch seen: a crossing scores its miss, a ball that dies first 1000 plus how far short it is
	const double Sc = bShort ? 1000 + std::max(0.0, (Tx - E.X) * Ax + (Tz - E.Z) * Az) : LRDetMath::Hypot(Lat, Ver);
	if (Sc < BestScore)
	{
		BestScore = Sc; BestYaw = Yaw; BestEl = El; BestT = T; BestApex = ApexV; BestMiss = bShort ? SS_INF : Sc;
	}
	StYaw = BestYaw; StEl = BestEl; StN++;
}

void LRStrike::FStrikeSolve::Finish(bool bDirect, const FVec3& VDirect, double YawIn, double ElIn, bool bOk, double TFlight, double Apex,
	double Miss, int Iters)
{
	// strike.js result (lines 250-255)
	const FDir2 Dd = DirOf(YawIn);
	const double C = LRDetMath::Cos(ElIn);
	if (bDirect) Res.V = VDirect;
	else Res.V = V3(Speed * C * Dd.X, Speed * LRDetMath::Sin(ElIn), Speed * C * Dd.Z);
	Res.W = LaunchSpin(Dd.X, Dd.Z, Contact, Curl, bLeft, Curve);
	Res.bOk = bOk; Res.TFlight = TFlight; Res.Apex = Apex; Res.Yaw = YawIn; Res.Elev = ElIn; Res.Miss = Miss; Res.Iters = Iters;
	Res.Knuck = FKnuckleLaunch();
	bDone = true;
	Phase = EPhase::Done;
}

void LRStrike::FStrikeSolve::Update()
{
	// (the Jacobian in J00..J11 has been set by the caller through WarmJ)
	const double J00 = WarmJ[0], J01 = WarmJ[1], J10 = WarmJ[2], J11 = WarmJ[3];
	const double Det = J00 * J11 - J01 * J10;
	double DYaw, DEl;
	if (std::fabs(Det) > 1e-9)
	{
		DYaw = -(J11 * Lat - J01 * Ver) / Det;
		DEl = -(-J10 * Lat + J00 * Ver) / Det;
	}
	else { DYaw = std::fabs(J00) > 1e-9 ? -Lat / J00 : 0; DEl = std::fabs(J11) > 1e-9 ? -Ver / J11 : 0; }
	DYaw = Clamp(DYaw, -0.3, 0.3); DEl = Clamp(DEl, -0.3, 0.3);
	double ElN = El + DEl;
	if (ElN < Lo || ElN > Hi)
	{
		// the contact's bound holds the elevation: aim the yaw alone at the bound
		ElN = Clamp(ElN, Lo, Hi);
		DYaw = std::fabs(J00) > 1e-9 ? Clamp(-(Lat + J01 * (ElN - El)) / J00, -0.3, 0.3) : 0;
	}
	Yaw += DYaw; El = ElN;
	E = EvalLaunch(Yaw, El); Lat = E.Lat; Ver = E.Ver; bShort = E.bShort; T = E.T; ApexV = E.Apex;
	Keep();
}

bool LRStrike::FStrikeSolve::StepFlight()
{
	const double Dp = 1e-3, De = 1e-3;
	switch (Phase)
	{
	case EPhase::Start:
	{
		From = Rq.From;
		Contact = Rq.Contact > 0 ? 1 : Rq.Contact < 0 ? -1 : 0;
		Speed = Clamp(Num(Rq.Speed), 0.1, BALL::VMAX);
		Curl = Clamp(Num(Rq.Curl), -3, 3);
		bLeft = Rq.bLeftFoot;
		Curve = Rq.Curve;
		DragMul = 1 - 0.0045 * Clamp(Num(Rq.Aero), 0, 99);
		RollDecel = Rq.RollDecel;
		Tx = Rq.Target.X; Ty = Clamp(Rq.Target.Y, BALL::R, 60); Tz = Rq.Target.Z;
		const double Dx = Rq.Target.X - From.X, Dz = Rq.Target.Z - From.Z;
		D = LRDetMath::Hypot(Dx, Dz);
		if (D < 0.05)
		{
			// straight at it
			const double Dy = Ty - From.Y;
			double L = LRDetMath::Hypot(Dx, Dy, Dz);
			if (L == 0) L = 1;
			const FVec3 Vd = V3(Speed * Dx / L, Speed * Dy / L, Speed * Dz / L);
			Finish(true, Vd, YawOf(Dx != 0 ? Dx : 0, Dz != 0 ? Dz : -1), LRDetMath::Asin(Clamp(Dy / L, -1, 1)), true, 0, From.Y, 0, 0);
			return true;
		}
		Ax = Dx / D; Az = Dz / D; Rx = -Az; Rz = Ax; YawT = YawOf(Ax, Az);
		Lo = Contact < 0 ? STRIKE::ELEV_MIN : Contact > 0 ? STRIKE::HIGH_MIN : STRIKE::ELEV_MIN;
		Hi = Contact < 0 ? STRIKE::LOW_MAX : STRIKE::ELEV_MAX;

		// a rolling ball for a ground target
		if (Ty <= BALL::R + 0.05 && From.Y <= BALL::R + 0.05 && Contact <= 0)
		{
			Yaw = YawT; E = EvalLaunch(Yaw, 0); It = 0;
			StYaw = Yaw; StEl = 0; StN++;
			Phase = EPhase::RollLoop;
			return false;
		}

		bool bWarm = bHasWarmIn && WarmIn.bValid && std::isfinite(WarmIn.Yaw) && std::isfinite(WarmIn.El);
		if (bWarm)
		{
			Yaw = WarmIn.Yaw; El = Clamp(WarmIn.El, Lo, Hi); MaxIt = STRIKE::WARM_ITERS;
			bWarmJ = WarmIn.bHasJ && std::isfinite(WarmIn.J[0]) && std::isfinite(WarmIn.J[1]) && std::isfinite(WarmIn.J[2]) && std::isfinite(WarmIn.J[3]);
			for (int I = 0; I < 4; I++) WarmJ[I] = WarmIn.J[I];
		}
		else
		{
			// strike.js guess (lines 88-102): the drag-aware flight time and the low elevation that clears the drop
			// under the spin-adjusted gravity; the curl's bend aimed off to the other side
			const double Dy = Ty - std::max(BALL::R, From.Y), Sp = Speed;
			const double KSpin = Contact > 0 ? -BALL::KM * STRIKE::HIGH_BACK * Sp : Contact < 0 ? BALL::KM * STRIKE::LOW_TOP * Sp : 0;
			const double G = std::max(1.0, BALL::G + 0.8 * KSpin);
			double GEl = LRDetMath::Atan2(Dy, D), GT = 0;
			for (int I = 0; I < 6; I++)
			{
				GT = (LRDetMath::Exp(BALL::KD * DragMul * D) - 1) / (BALL::KD * DragMul * Sp * std::max(0.2, LRDetMath::Cos(GEl)));
				GEl = LRDetMath::Atan2(Dy + 0.5 * G * GT * GT, D);
			}
			const FVec3 Ws = LaunchSpin(Ax, Az, 0, Curl, bLeft, Curve);
			const double Bend = 0.5 * BALL::KM * std::fabs(Ws.Y) * Sp * GT * GT * 0.85;
			// w.y > 0 curls left: aim right (yaw decreases to the right)
			Yaw = YawT - Sign(Ws.Y) * LRDetMath::Atan2(Bend, D);
			El = Clamp(GEl, Lo, Hi);
		}
		E = EvalLaunch(Yaw, El);
		Lat = E.Lat; Ver = E.Ver; bShort = E.bShort; T = E.T; ApexV = E.Apex;
		BestScore = SS_INF; BestYaw = Yaw; BestEl = El; BestT = T; BestApex = ApexV; BestMiss = SS_INF;
		Keep();
		Phase = EPhase::MainLoop;
		return false;
	}
	case EPhase::RollLoop:
	{
		if (!E.bShort && std::fabs(E.Lat) > STRIKE::TOL && It < STRIKE::ITERS)
		{
			Yaw -= E.Lat / D; It++;                  // a rolling ball goes straight: d(lat)/d(yaw) = -D
			E = EvalLaunch(Yaw, 0);
			StYaw = Yaw; StN++;
			return false;
		}
		const double Miss = E.bShort ? SS_INF : LRDetMath::Hypot(E.Lat, E.Ver);
		Finish(false, FVec3(), Yaw, 0, !E.bShort && Miss <= STRIKE::MISS_OK, E.bShort ? SS_INF : E.T, E.Apex, Miss, It);
		return true;
	}
	case EPhase::MainLoop:
	{
		bool bStop = !(It < MaxIt) || (!bShort && LRDetMath::Hypot(Lat, Ver) <= STRIKE::TOL);
		if (!bStop)
		{
			It++;
			if (bShort)
			{
				// the ball dies before the plane: more elevation, toward the longest range
				const double Top = std::min(Hi, STRIKE::RANGE_EL);
				if (El >= Top - 1e-9) bStop = true;
				else
				{
					El = std::min(Top, El + std::max(0.08, 0.5 * (Top - El)));
					E = EvalLaunch(Yaw, El); Lat = E.Lat; Ver = E.Ver; bShort = E.bShort; T = E.T; ApexV = E.Apex;
					Keep();
					return false;
				}
			}
			else if (bWarmJ)
			{
				// the first update of a warm start: the presolve's Jacobian
				bWarmJ = false;
				Update();
				return false;
			}
			else
			{
				const FEval E1 = EvalLaunch(Yaw + Dp, El);
				L1 = E1.Lat; V1 = E1.Ver; bS1 = E1.bShort;
				E = E1;
				StN++;
				Phase = EPhase::NeedE2;
				return false;
			}
		}
		Finish(false, FVec3(), BestYaw, BestEl, BestMiss <= STRIKE::MISS_OK, std::isfinite(BestMiss) ? BestT : SS_INF, BestApex, BestMiss, It);
		return true;
	}
	case EPhase::NeedE2:
	{
		EStep = El + De <= Hi ? De : -De;
		const FEval E2 = EvalLaunch(Yaw, El + EStep);
		L2 = E2.Lat; V2 = E2.Ver; bS2 = E2.bShort;
		E = E2;
		StN++;
		Phase = EPhase::NeedUpdate;
		return false;
	}
	case EPhase::NeedUpdate:
	{
		// the Jacobian by finite differences (worked out after the second flight's yield, as the JS does)
		const double J00 = bS1 ? -D : (L1 - Lat) / Dp, J10 = bS1 ? 0 : (V1 - Ver) / Dp;
		const double J01 = bS2 ? 0 : (L2 - Lat) / EStep, J11 = bS2 ? 1 : (V2 - Ver) / EStep;
		StJ[0] = J00; StJ[1] = J01; StJ[2] = J10; StJ[3] = J11; bStHasJ = true;
		WarmJ[0] = J00; WarmJ[1] = J01; WarmJ[2] = J10; WarmJ[3] = J11;
		Update();
		Phase = EPhase::MainLoop;
		return false;
	}
	case EPhase::Done:
		return true;
	}
	return true;
}

LRStrike::FWarmStart LRStrike::FStrikeSolve::Warm() const
{
	FWarmStart Wst;
	Wst.bValid = StN > 0 && std::isfinite(StYaw) && std::isfinite(StEl);
	if (!Wst.bValid) return Wst;
	Wst.Yaw = StYaw; Wst.El = StEl; Wst.bHasJ = bStHasJ;
	for (int I = 0; I < 4; I++) Wst.J[I] = StJ[I];
	return Wst;
}

LRStrike::FStrikeLaunch LRStrike::SolveStrike(const FStrikeRequest& Req, const FWarmStart* Warm)
{
	FStrikeSolve S;
	S.Begin(Req, Warm);
	while (!S.StepFlight()) {}
	return S.Result();
}

// ---------------------------------------------------------------------------------------------------------------------
// deviation (strike.js lines 259-342 and 407-428)
// ---------------------------------------------------------------------------------------------------------------------

double LRStrike::AccSigma(double Acc)
{
	return SHOT_ACC::K * LRDetMath::Pow(std::max(0.0, 99 - Clamp(Num(Acc), 0, 110)) / 44, SHOT_ACC::EXP);
}

double LRStrike::ShotVFull(double Power)
{
	const double X = std::max(0.0, Num(Power));
	if (X >= SHOT_V::PTS_X[3]) return SHOT_V::PTS_Y[3] + SHOT_V::HI * (X - SHOT_V::PTS_X[3]);
	return PiecewiseUpTo(SHOT_V::PTS_X, SHOT_V::PTS_Y, 4, X);
}

double LRStrike::ShotSpeed(double Power, double P, bool bStrikeBoots, double FacPower)
{
	return ShotVFull(Power) * Clamp(Num(P), 0, 1) * (bStrikeBoots ? 1.04 : 1) * FacPower;
}

double LRStrike::CleanOf(const FStrikeCtx& Ctx)
{
	return Clamp(1 - 1.8 * std::fabs(Num(Ctx.PlantErr)) - (Ctx.bScuff ? 0.5 : 0) - 0.25 * (1 - Clamp(Ctx.BF, 0, 1)), 0, 1);
}

double LRStrike::SigmaOf(const FStrikeCtx& Ctx)
{
	const double Acc = Clamp(Ctx.Acc, 0, 110);
	const double BF = Clamp(Ctx.BF, 0, 1), EF = Clamp(Ctx.EF, 0, 1);
	const double Fatigue = 1 + 0.25 * (1 - BF) + 0.35 * (1 - EF);
	const double Pressure = 1 + 0.4 * Clamp(Num(Ctx.Pressure01), 0, 1) * (1 - Clamp(Ctx.Composure, 0, 150) / 150);
	const double Foot = Ctx.WeakFoot == EFoot::Both ? 1.1 : Ctx.WeakFoot == EFoot::Left ? 1.35 : 1;
	const double Body = 1 + 1.5 * std::fabs(Num(Ctx.PlantErr)) / 0.3 + std::max(0.0, Num(Ctx.BodyAngleDeg) - 45) / 45 * 0.6;
	const double VIn = std::fabs(Ctx.VIn);
	const double Scuff = Ctx.bScuff ? 2 : 1;
	if (Ctx.Kind == EKind::Header) return (1 - Clamp(Acc, 0, 110) / 110) * 6 * DEG * Fatigue * Pressure * Scuff;
	if (IsShotKind(Ctx.Kind))
	{
		const double P = Clamp(Ctx.Power01, 0, 1);
		const double Over = P > 0.92 ? 1 + 3 * (P - 0.92) : 1;
		const double Ball = Ctx.BallState == EBallMotion::Rolling ? STRIKE::BS_ROLLING : Ctx.BallState == EBallMotion::Bouncing ? STRIKE::BS_BOUNCING
			: Ctx.BallState == EBallMotion::Volley ? STRIKE::BS_VOLLEY : STRIKE::BS_STILL;
		const double First = Ctx.bFirstTime ? 1 + VIn / 30 : 1;
		const double Fin = Ctx.bFinesse ? 0.85 : 1;
		const double M = Over * Fatigue * Pressure * Foot * Body * Ball * First * Fin * Scuff;
		return AccSigma(Ctx.Acc) * (0.6 + 0.8 * P * P) * M + SHOT_ACC::SIT * std::max(0.0, M - 1);
	}
	return (0.006 + 0.05 * LRDetMath::Pow(std::max(0.0, 1 - Acc / 100), 1.4)) * Pressure * Foot * Body * Fatigue * (Ctx.bFirstTime ? 1.3 : 1) * Scuff;
}

void LRStrike::DevDraws(LRBall::FRng& R, double Out[3])
{
	Out[0] = R.TruncNormal(1, 2.5); Out[1] = R.TruncNormal(1, 2.5); Out[2] = R.TruncNormal(1, 2.5);
}

LRStrike::FDeviation LRStrike::Deviation(const FStrikeCtx& Ctx, LRBall::FRng& R)
{
	FDeviation Dv;
	const double S = SigmaOf(Ctx), D = std::max(0.0, Ctx.bHasDist ? Num(Ctx.Dist) : 0);
	const double Kv = Ctx.Contact > 0 ? STRIKE::KV_HIGH : STRIKE::KV_NORMAL;
	// (U28: a shot's speed is not drawn at random: the cleaner the strike, the nearer the top of its range)
	const bool bShot = IsShotKind(Ctx.Kind);
	const double Sv = bShot ? 0 : Ctx.bHasWeightSigma ? Ctx.WeightSigma : 0.02;
	const bool bZ = Ctx.bHasZ;
	Dv.Ex = D * S * (bZ ? Ctx.Z[0] : R.TruncNormal(1, 2.5));
	Dv.Ey = D * S * Kv * (bZ ? Ctx.Z[1] : R.TruncNormal(1, 2.5));
	Dv.Es = bShot ? 1 + SHOT_V::SPREAD * (2 * CleanOf(Ctx) - 1) : 1 + Sv * (bZ ? Ctx.Z[2] : R.TruncNormal(1, 2.5));
	Dv.S = S; Dv.Sv = Sv;
	return Dv;
}

LRStrike::FAim LRStrike::AimOf(const FStrikeRequest& Req, const FStrikeCtx& Ctx, LRBall::FRng& R)
{
	FAim A;
	const FVec3& From = Req.From;
	const FVec3& Tg = Req.Target;
	A.D = Ctx.bHasDist ? Ctx.Dist : LRDetMath::Hypot(Tg.X - From.X, Tg.Z - From.Z);
	A.Ctx = Ctx; A.Ctx.bHasDist = true; A.Ctx.Dist = A.D;
	A.Dev = Deviation(A.Ctx, R);
	double Ax = Tg.X - From.X, Az = Tg.Z - From.Z;
	double Al = LRDetMath::Hypot(Ax, Az);
	if (Al == 0) Al = 1;
	Ax /= Al; Az /= Al;
	A.bGround = Tg.Y <= BALL::R + 0.05 && IsGroundKind(A.Ctx.Kind) && !(A.Ctx.Contact > 0);
	A.Aimed = V3(Tg.X + A.Dev.Ex * (-Az), A.bGround ? Tg.Y : Clamp(Tg.Y + A.Dev.Ey, STRIKE::AIM_Y0, STRIKE::AIM_Y1), Tg.Z + A.Dev.Ex * Ax);
	A.Req = Req;
	A.Req.Target = A.Aimed;
	A.Req.Speed = Req.Speed * A.Dev.Es;
	return A;
}

LRStrike::FShotPlan LRStrike::PlanShot(const FStrikeRequest& Req, const FStrikeCtx& Ctx, LRBall::FRng& R, const FWarmStart* Warm)
{
	FShotPlan Plan;
	const FAim Aim = AimOf(Req, Ctx, R);
	const FVec3& Tg = Req.Target;
	Plan.Launch = SolveStrike(Aim.Req, Warm);
	const FStrikeLaunch& L = Plan.Launch;
	const double Wl = LRDetMath::Hypot(L.W.X, L.W.Y, L.W.Z), Sp = LRDetMath::Hypot(L.V.X, L.V.Y, L.V.Z);
	const double P = Clamp(Aim.Ctx.Power01, 0, 1);
	Plan.Launch.Knuck = FKnuckleLaunch();
	// the knuckle (1.5.1): |w| under 4 rad/s, over 24 m/s, Normal contact, no finesse, power over 0.72, a shot
	if (Wl < STRIKE::KNUCK_W && Sp > STRIKE::KNUCK_V && !(Req.Contact) && !Aim.Ctx.bFinesse && P > STRIKE::KNUCK_P && IsShotKind(Aim.Ctx.Kind))
	{
		Plan.Launch.Knuck.bOn = true;
		Plan.Launch.Knuck.Amp = (STRIKE::KNUCK_A0 + (STRIKE::KNUCK_A1 - STRIKE::KNUCK_A0) * R.Next()) * P;
		Plan.Launch.Knuck.Freq = STRIKE::KNUCK_F0 + (STRIKE::KNUCK_F1 - STRIKE::KNUCK_F0) * R.Next();
		Plan.Launch.Knuck.Phase = 2 * 3.141592653589793 * R.Next();
	}
	const double Off = LRDetMath::Hypot(Aim.Dev.Ex, Aim.bGround ? 0 : Aim.Aimed.Y - Tg.Y);
	Plan.Quality = Clamp(1 - Off / std::max(0.25, 0.06 * Aim.D), 0, 1);
	Plan.Aimed = Aim.Aimed; Plan.Sigma = Aim.Dev.S; Plan.SigmaM = Aim.Dev.S * Aim.D; Plan.Dev = Aim.Dev;
	return Plan;
}

double LRStrike::PassSpeedFor(double D, double Arrive, double Roll)
{
	return LRBall::RollSpeedFor(std::max(1.0, D), Clamp(Arrive, 6, 10), Roll);
}

double LRStrike::LoftSpeedFor(double D)
{
	return Clamp(std::sqrt(12.5 * std::max(4.0, D)) * (1 + 0.005 * D), 9, 30);
}

// ---------------------------------------------------------------------------------------------------------------------
// the flick and the knock-on (actions.js lines 924-1003, 1296-1305)
// ---------------------------------------------------------------------------------------------------------------------

double LRStrike::FlickTop(double Strength)
{
	const double X = std::max(0.0, Num(Strength));
	const int N = 3;
	if (X >= FLICK::H_PTS_X[N])
		return std::min(FLICK::H_MAX, FLICK::H_PTS_Y[N] + (FLICK::H_PTS_Y[N] - FLICK::H_PTS_Y[N - 1]) / (FLICK::H_PTS_X[N] - FLICK::H_PTS_X[N - 1]) * (X - FLICK::H_PTS_X[N]));
	return PiecewiseUpTo(FLICK::H_PTS_X, FLICK::H_PTS_Y, 4, X);
}

void LRStrike::FlickFly(const FVec3& P, double Ux, double Uz, double Vh, double Vy, const FVec3& Wspin, double RollDecel, double& OutTop, double& OutD)
{
	// a new ball each time (one flown before keeps its resting state), in an empty world
	FBallState C = LRBall::CreateBall(P.X, std::max(P.Y, 0.11), P.Z, RollDecel);
	LRBall::FWorld W;
	W.bCollectEvents = false;
	LRBall::Kick(C, V3(Ux * Vh, Vy, Uz * Vh), Wspin, LRBall::FTouch());
	// down when it is back at its start's height on the way down, or bounces off the grass
	const double Y0 = C.P.Y;
	double Top = Y0, Vy0 = C.V.Y;
	for (int I = 0; I < 600; I++)
	{
		LRBall::Step(C, W, 1.0 / 60);
		if (C.P.Y > Top) Top = C.P.Y;
		if ((C.V.Y < 0 && C.P.Y <= Y0) || (Vy0 < 0 && C.V.Y >= 0)) break;
		Vy0 = C.V.Y;
	}
	OutTop = Top;
	OutD = (C.P.X - P.X) * Ux + (C.P.Z - P.Z) * Uz;
}

void LRStrike::FlickLaunch(const FVec3& P, double Ux, double Uz, double Top, double D, const FVec3& Wspin, double RollDecel, double& OutVy, double& OutVh)
{
	// vy for the top, vh for the way, fitted in turn (each by halves), three rounds
	const double G = 9.81;
	double Vy = std::sqrt(2 * G * std::max(0.05, Top - P.Y)), Vh = D > 0 ? D / (2 * Vy / G) : 0;
	for (int Round = 0; Round < 3; Round++)
	{
		double Lo = 0, Hi = 20;
		for (int K = 0; K < 22; K++)
		{
			const double M = (Lo + Hi) / 2;
			double FTop, FD;
			FlickFly(P, Ux, Uz, Vh, M, Wspin, RollDecel, FTop, FD);
			if (FTop < Top) Lo = M; else Hi = M;
		}
		Vy = (Lo + Hi) / 2;
		if (D <= 0) { Vh = 0; break; }
		Lo = 0; Hi = 20;
		for (int K = 0; K < 22; K++)
		{
			const double M = (Lo + Hi) / 2;
			double FTop, FD;
			FlickFly(P, Ux, Uz, M, Vy, Wspin, RollDecel, FTop, FD);
			if (FD < D) Lo = M; else Hi = M;
		}
		Vh = (Lo + Hi) / 2;
	}
	OutVy = Vy; OutVh = Vh;
}

LRStrike::FFlickResult LRStrike::FlickKick(const FVec3& BallP, double BallRollDecel, FDir2 Face, double P, int Fwd, int Side, double Strength,
	bool bFirstTime, bool bLeftFooted)
{
	FFlickResult Out;
	P = Clamp(P, 0, 1);
	const double Rx = -Face.Z, Rz = Face.X;
	// the way: on the facing, by the keys (none: a keepy-up, a touch on ahead)
	double Ux = Face.X * Fwd + Rx * Side, Uz = Face.Z * Fwd + Rz * Side;
	const double Ul = LRDetMath::Hypot(Ux, Uz);
	const bool bKeepy = Ul < 1e-6, bBack = Fwd < 0 && !Side;
	if (bKeepy) { Ux = Face.X; Uz = Face.Z; } else { Ux /= Ul; Uz /= Ul; }
	// its top: the bar's share of what the player's Strength can do; where it comes down: D_K of that plus D_0
	const double Top = std::max(0.25, P * FlickTop(Strength));
	const double D = bKeepy ? FLICK::KEEPY_D : FLICK::D_K * Top + FLICK::D_0;
	// the spin its contact gives: backspin under a lift on, topspin over the head, sidespin to the side
	const double Spin = FLICK::SPIN * (0.5 + 0.5 * P), RollX = Uz, RollZ = -Ux;
	FVec3 W;
	if (bKeepy) W = V3(0, 0, 0);
	else if (bBack) W = V3(RollX * Spin, 0, RollZ * Spin);
	else if (Side && Fwd == 0) W = V3(0, -static_cast<double>(Side) * Spin * 0.6, 0);
	else W = V3(-RollX * Spin, 0, -RollZ * Spin);
	const double RD = BallRollDecel != 0 ? BallRollDecel : 1.1;
	double Vy, Vh;
	FlickLaunch(BallP, Ux, Uz, BallP.Y + std::max(0.05, Top - 0.11), D, W, RD, Vy, Vh);
	Out.V = V3(Ux * Vh, Vy, Uz * Vh);
	Out.W = W; Out.Top = Top; Out.Land = D; Out.Ux = Ux; Out.Uz = Uz;
	Out.Part = bKeepy ? "laces" : bBack ? "heel" : (Side && !Fwd) ? (((Side > 0) == !bLeftFooted) ? "outside" : "inside") : Fwd > 0 ? "toe" : "laces";
	Out.Flick = bKeepy ? "keepy" : bBack ? "rainbow" : bFirstTime ? "sombrero" : (Fwd > 0 && !Side) ? "chip" : "flick";
	return Out;
}

void LRStrike::KnockOnLaunch(double RollDecel, double Scale, double BodySpeed, double SprintSpeed, double Ux, double Uz, FVec3& OutV, FVec3& OutW)
{
	const double BallR = 0.11;
	const double Dec = RollDecel != 0 ? RollDecel : 1.1;
	const double Sc = Scale != 0 ? Scale : 1, Spr = SprintSpeed != 0 ? SprintSpeed : 8;
	const double Sp = std::max(std::max(std::sqrt(2 * Dec * KNOCK::D * Sc), BodySpeed + KNOCK::MIN_V), Spr + KNOCK::OVER);
	OutV = V3(Ux * Sp, 0, Uz * Sp);
	OutW = V3(Uz * Sp / BallR, 0, -Ux * Sp / BallR);
}

// ---------------------------------------------------------------------------------------------------------------------
// the reach window and the step-in (actions.js lines 114-222, 232-238)
// ---------------------------------------------------------------------------------------------------------------------

namespace LRStrike
{
namespace
{
	struct FRel { double Ahead = 0, Lat = 0, Dist = 0; };
	// actions.js relBall: where the ball is relative to the body: ahead along the facing, across (+ right), distance
	FRel RelBall(const FBody& A, const FVec3& BP)
	{
		const FDir2 F = DirOf(A.Yaw);
		const double Dx = BP.X - A.X, Dz = BP.Z - A.Z;
		FRel R;
		R.Ahead = Dx * F.X + Dz * F.Z; R.Lat = Dx * (-F.Z) + Dz * F.X; R.Dist = LRDetMath::Hypot(Dx, Dz);
		return R;
	}
	// actions.js footFor: the strong foot unless the ball is over WEAK_SIDE to the weak side; true = left
	bool FootForLeft(const FBody& A, double Lat)
	{
		if (A.Foot == EFoot::Both) return !(Lat >= 0);
		if (A.Foot == EFoot::Right && Lat < -ACT::WEAK_SIDE) return true;
		if (A.Foot == EFoot::Left && Lat > ACT::WEAK_SIDE) return false;
		return A.Foot == EFoot::Left;
	}
}
}

LRStrike::FReach LRStrike::CanStrike(const FBody& A, const FBallState& Ball)
{
	const FRel R = RelBall(A, Ball.P);
	FReach O;
	O.bLeftFoot = FootForLeft(A, R.Lat);
	O.Side = O.bLeftFoot ? -1 : 1;
	const double S = A.Scale != 0 ? A.Scale : 1;
	const bool bLow = Ball.P.Y - A.Y < 0.6 * S;
	O.bOk = bLow && R.Ahead >= ACT::REACH0 * 0.6 && R.Ahead <= ACT::REACH1 * S * 1 && std::fabs(R.Lat) <= ACT::REACH_LAT;
	// the next swing: sooner when the ball is well placed, a little later at the edge of the window
	O.Tc = O.bOk ? Clamp(0.11 + 0.07 * std::fabs(R.Ahead - 0.65) / 0.25, 0.10, ACT::TC_MAX) : ACT::TC_MAX;
	O.Ahead = R.Ahead; O.Lat = R.Lat; O.Dist = R.Dist;
	return O;
}

double LRStrike::StrikeRoot(double T, double Contact)
{
	if (T < Contact) return 1 + (0.55 - 1) * SStep01(Contact - 0.18, Contact, T);
	if (T < Contact + 0.25) return 0.55 + (0.40 - 0.55) * (T - Contact) / 0.25;
	return 0.40 + (1 - 0.40) * SStep01(Contact + 0.25, Contact + 0.6, T);
}

void LRStrike::StepInSpot(const FBody& A, const FShotAsk& Rq, const FVec3& BP, FStepIn& Si)
{
	// the root's place at the contact: BACK behind the ball along the aim, SIDE to the support side
	const double Sc = A.Scale != 0 ? A.Scale : 1;
	double Fx = Rq.bHasTarget ? Rq.Target.X - BP.X : DirOf(A.Yaw).X, Fz = Rq.bHasTarget ? Rq.Target.Z - BP.Z : DirOf(A.Yaw).Z;
	double Fl = LRDetMath::Hypot(Fx, Fz);
	if (Fl == 0) Fl = 1;
	Fx /= Fl; Fz /= Fl;
	// (the support side: the left (fz, -fx) of the aim for a right foot, its right for a left one)
	const double Ss = Si.bLeftFoot ? -1 : 1;
	Si.Fx = Fx; Si.Fz = Fz;
	Si.X = BP.X - Fx * STEP_IN::BACK * Sc + Fz * Ss * STEP_IN::SIDE * Sc; Si.Z = BP.Z - Fz * STEP_IN::BACK * Sc - Fx * Ss * STEP_IN::SIDE * Sc;
}

bool LRStrike::StepInOf(const FBody& A, const FShotAsk& Rq, const FBallState& Ball, const LRBall::FPredCache& Pred, double NowT, bool bLeftFoot,
	bool bRestartTaker, FStepIn& Out)
{
	const double Sc = A.Scale != 0 ? A.Scale : 1;
	// a shot along the ground (not quick, a chip, a styled strike or a high finesse) ...
	if (Rq.Kind != EKind::Shot || Rq.bQuick || Rq.bChip || Rq.bStyle || (Rq.Contact > 0 && Rq.bFinesse)) return false;
	// ... at a free ball on the ground ...
	if (Ball.State != LRBall::EBallState::Free || bRestartTaker || Ball.P.Y > 0.3 || std::fabs(Ball.V.Y) > 1) return false;
	// ... slow against him, by a body no faster than V_BODY
	const double Vx = A.Vx, Vz = A.Vz;
	if (LRDetMath::Hypot(Ball.V.X, Ball.V.Z) > STEP_IN::V_ROLL || LRDetMath::Hypot(Ball.V.X - Vx, Ball.V.Z - Vz) > STEP_IN::V_BALL || A.Speed > STEP_IN::V_BODY) return false;
	const FDir2 F = DirOf(A.Yaw);
	FStepIn Si;
	Si.bLeftFoot = bLeftFoot; Si.T = 0.33; Si.V0 = A.Speed;
	FVec3 B;
	// its time from the plant step's length: the support foot, half a stance to its side of the body, to the plant
	// beside where the ball will be; once again with the ball where it will be at that time
	for (int I = 0; I < 2; I++)
	{
		B = Pred.At(Ball, NowT, Si.T);
		StepInSpot(A, Rq, B, Si);
		const double Ss = Si.bLeftFoot ? -1 : 1;
		const double Px = B.X + (Si.Fx * STEP_IN::PLANT_ALONG + Si.Fz * Ss * STEP_IN::PLANT_LAT) * Sc;
		const double Pz = B.Z + (Si.Fz * STEP_IN::PLANT_ALONG - Si.Fx * Ss * STEP_IN::PLANT_LAT) * Sc;
		const double Fx0 = A.X + F.Z * Ss * 0.11 * Sc, Fz0 = A.Z - F.X * Ss * 0.11 * Sc;
		Si.T = Clamp(0.29 + STEP_IN::PER * LRDetMath::Hypot(Px - Fx0, Pz - Fz0) / Sc, STEP_IN::T0, STEP_IN::T1);
		Si.PlantX = Px; Si.PlantZ = Pz;
	}
	// the ball ahead of him along his way or along the aim, and the aim not behind him
	const double Bx = B.X - A.X, Bz = B.Z - A.Z;
	if (Bx * F.X + Bz * F.Z < STEP_IN::AHEAD * Sc && Bx * Si.Fx + Bz * Si.Fz < STEP_IN::AHEAD * Sc) return false;
	if (F.X * Si.Fx + F.Z * Si.Fz < LRDetMath::Cos(STEP_IN::TURN)) return false;
	const double D = LRDetMath::Hypot(Si.X - A.X, Si.Z - A.Z);
	// (a body over VMAX is let down to it by the plant: that much further)
	if (!(D <= (STEP_IN::REACH + std::min(A.Speed, STEP_IN::VMAX) * Si.T + std::max(0.0, A.Speed - STEP_IN::VMAX) * (Si.T - STEP_IN::PLANT_T) * 0.5) * Sc)) return false;
	Out = Si;
	return true;
}

// ---------------------------------------------------------------------------------------------------------------------
// the kick act (actions.js startKick, kickRequest, kickCtx, kickPresolve, strikeContact, actionStep 'kick')
// ---------------------------------------------------------------------------------------------------------------------

namespace LRStrike
{
namespace
{
	struct FKickReq
	{
		FStrikeRequest Req;
		double Tx = 0, Ty = 0, Tz = 0, Dist = 0;
		bool bIsShot = false;
		EKind CtxKind = EKind::Shot;
		double Acc = 50;
		int Contact = 0;
	};

	// actions.js kickRequest (lines 274-308): what a kick asks the solver for with the ball at BP
	FKickReq KickRequest(const FKickEnv& Env, const FKickAct& Act, bool bScuff, const FVec3& BP, bool bLeftFoot)
	{
		const FShotAsk& Rq = Act.Action;
		const FStriker& At = Env.Striker;
		FKickReq K;
		FVec3 Tgt;
		if (Rq.bHasTarget) Tgt = Rq.Target;
		else
		{
			const FDir2 F = DirOf(Env.Body.Yaw);
			Tgt = V3(Env.Body.X + F.X * 20, BALL::R, Env.Body.Z + F.Z * 20);
		}
		double Tx = Tgt.X, Ty = Tgt.Y, Tz = Tgt.Z;
		const EKind Kind = Rq.Kind;
		const bool bIsShot = Kind == EKind::Shot;
		// the scuff (1.5.3): aim lerped 25% toward the goal centre
		if (bScuff && bIsShot)
		{
			Tx += (Env.ScuffGoal.X - Tx) * 0.25; Tz += (Env.ScuffGoal.Z - Tz) * 0.25; Ty += (Env.ScuffGoal.Y - Ty) * 0.25;
		}
		const double Dist = LRDetMath::Hypot(Tx - BP.X, Tz - BP.Z);
		const int Contact = Rq.Contact;
		const double FacPower = At.bHasFacPower ? At.FacPower : 1;
		double Speed;
		EKind CtxKind;
		double Acc;
		if (bIsShot)
		{
			const double P = Clamp(Rq.Power, 0.05, 1);
			Speed = ShotSpeed(At.Power, P, At.bStrikeBoots, FacPower) * (Rq.bFinesse ? 0.92 : 1);
			// (a curler is placed, not hit: no faster than a 0.85 strike; W with A or D struck as hard as a straight shot)
			if (Rq.bDrive) Speed = ShotSpeed(At.Power, P, At.bStrikeBoots, FacPower);
			else if (Rq.bFinesse) Speed = std::min(Speed, ShotSpeed(At.Power, 0.85, At.bStrikeBoots, FacPower));
			CtxKind = Contact > 0 && Rq.bChip ? EKind::Chip : EKind::Shot;
			Acc = At.Accuracy;
		}
		else
		{
			Speed = Rq.bHasSpeed ? Rq.Speed : IsGroundKind(Kind) ? PassSpeedFor(Dist, 9, Env.Ball->RollDecel) : LoftSpeedFor(Dist);
			Speed *= At.bHasFacPower ? 0.95 + 0.05 * At.FacPower : 1;
			CtxKind = Kind;
			Acc = At.PassAcc;
		}
		if (bScuff) Speed *= 0.55;
		// (rq.bend: the way the ball is to bend, + to its right; the curl that does it depends on the striking foot)
		const double Curl = Rq.bHasBend ? (bLeftFoot ? 1 : -1) * Clamp(Rq.Bend, -3, 3) : Rq.bFinesse ? (Rq.bHasCurl ? Rq.Curl : 1) : (Rq.bHasCurl ? Rq.Curl : 0);
		K.Req.From = BP; K.Req.Target = V3(Tx, Ty, Tz); K.Req.Speed = Speed; K.Req.Contact = Contact; K.Req.Curl = Curl;
		K.Req.bLeftFoot = bLeftFoot; K.Req.Kind = CtxKind; K.Req.RollDecel = Env.Ball->RollDecel; K.Req.Curve = At.Curve; K.Req.Aero = At.Aero;
		K.Tx = Tx; K.Ty = Ty; K.Tz = Tz; K.Dist = Dist; K.bIsShot = bIsShot; K.CtxKind = CtxKind; K.Acc = Acc; K.Contact = Contact;
		return K;
	}

	// actions.js kickCtx (lines 310-329): the strike's context for its deviation, the ball `Ahead` m in front
	FStrikeCtx KickCtx(const FKickEnv& Env, const FKickAct& Act, const FKickReq& K, const FVec3& BP, double Ahead, EFoot Weak, bool bScuff)
	{
		const FBallState& B = *Env.Ball;
		const FShotAsk& Rq = Act.Action;
		const FStriker& At = Env.Striker;
		const double Kdir = YawOf(K.Tx - BP.X, K.Tz - BP.Z);
		const double BodyAngleDeg = std::fabs(WrapA(Kdir - Env.Body.Yaw)) / DEG;
		// (the rhythm and the volley's timing ring are not ported: both 0)
		const double Timing = 0, Rhythm = 0;
		const double Plant0 = (Act.bStepIn ? Clamp(Act.StepIn.Err, 0, 0.4) : Clamp(std::fabs(Ahead - 0.65) - 0.15, 0, 0.4)) + (bScuff ? 0.2 : 0) + 0.3 * Clamp(Timing, 0, 1) +
			(K.bIsShot ? ACT::RHYTHM_SHOT : ACT::RHYTHM_PASS) * Clamp(Rhythm, 0, 1);
		const double PlantErr = Rq.bClean && !bScuff ? std::min(Plant0, ACT::CLEAN_PLANT) : Plant0;
		const double Sp = LRDetMath::Hypot(B.V.X, B.V.Y, B.V.Z);
		const bool bAir = B.P.Y > BALL::R + 0.05;
		const EBallMotion BallState = !bAir ? (Sp < 0.4 ? EBallMotion::Still : EBallMotion::Rolling) : (B.V.Y < 0 && B.P.Y > 0.35 ? EBallMotion::Volley : EBallMotion::Bouncing);
		const bool bFirst = !Env.bInControl || Rq.bFirstTime;
		FStrikeCtx C;
		C.Kind = K.CtxKind; C.bHasDist = true; C.Dist = K.Dist;
		C.Power01 = K.bIsShot ? Clamp(Rq.Power, 0, 1) : 0.6;
		C.Acc = K.Acc; C.Contact = K.Contact; C.WeakFoot = Weak; C.BodyAngleDeg = BodyAngleDeg; C.PlantErr = PlantErr; C.BallState = BallState;
		C.Pressure01 = Env.Pressure01; C.Composure = At.Composure; C.BF = At.BF; C.EF = At.EF; C.bFinesse = Rq.bFinesse;
		C.bFirstTime = bFirst && Sp > 1; C.VIn = bFirst ? Sp : 0; C.Power = At.Power; C.bScuff = bScuff;
		if (!K.bIsShot)
		{
			C.bHasWeightSigma = true;
			C.WeightSigma = Rq.bHasWeightSigma ? Rq.WeightSigma : Rq.bCharged ? (Rq.bSweet ? 0.02 : 0.0) : (1 - At.Passing / 120) * 0.12;
		}
		return C;
	}

	EFoot WeakOf(const FBody& A, bool bLeftFoot)
	{
		if (A.Foot == EFoot::Both) return EFoot::Both;
		const bool bPrefLeft = A.Foot == EFoot::Left;
		return bLeftFoot != bPrefLeft ? EFoot::Left : EFoot::Right;     // Left here means "the weak foot"
	}

	// actions.js kickPresolve (lines 336-351): as the swing starts the deviation's three draws are made and the solve
	// starts for the point they aim at; it runs one flight a step through the swing
	void KickPresolve(FKickAct& Act, FKickEnv& Env)
	{
		if (Act.PreState == 0) return;
		if (Act.PreState < 0)
		{
			const FBallState& B = *Env.Ball;
			FVec3 PreB;
			if (B.State == LRBall::EBallState::Dead || B.State == LRBall::EBallState::Held || LRDetMath::Hypot(B.V.X, B.V.Y, B.V.Z) < 0.05) PreB = B.P;
			else PreB = Env.Pred->At(B, Env.NowT, Act.bAdjust ? ACT::TC_MAX : std::max(0.0, Act.Tc - Act.T));
			const EFoot Weak = WeakOf(Env.Body, Act.bLeftFoot);
			const FKickReq K = KickRequest(Env, Act, false, PreB, Act.bLeftFoot);
			if (K.Ty <= BALL::R + 0.05 && PreB.Y <= BALL::R + 0.05 && K.Contact <= 0) { Act.PreState = 0; return; }
			DevDraws(*Env.Rng, Act.DevZ);
			Act.bHasDevZ = true;
			FStrikeCtx Ctx = KickCtx(Env, Act, K, PreB, 0.65, Weak, false);
			Ctx.bHasZ = true; Ctx.Z[0] = Act.DevZ[0]; Ctx.Z[1] = Act.DevZ[1]; Ctx.Z[2] = Act.DevZ[2];
			const FAim Aim = AimOf(K.Req, Ctx, *Env.Rng);
			Act.Pre.Begin(Aim.Req, nullptr);
			Act.PreState = 1;
		}
		if (!Act.Pre.IsDone()) Act.Pre.StepFlight();
	}

	// actions.js strikeContact (lines 353-439): plan the launch with the ball as it is now and kick it
	void StrikeContact(FKickAct& Act, FKickEnv& Env, bool bScuff)
	{
		FBallState& B = *Env.Ball;
		const FShotAsk& Rq = Act.Action;
		const FRel R = RelBall(Env.Body, B.P);
		Act.ContactT = Act.T;
		// the ball is gone: an air kick (never a silent cancel)
		if (R.Dist > ACT::SCUFF_D || B.P.Y - Env.Body.Y > ACT::WHIFF_H || (B.State == LRBall::EBallState::Held && B.Holder != Env.Agent))
		{
			Act.bDone = true; Act.bWhiff = true;
			return;
		}
		// a step-in strikes with the foot it stepped in for, its plant error how far the root is off its place
		if (Act.bStepIn)
		{
			FStepIn& Si = Act.StepIn;
			Si.VC = Env.Body.Speed;
			StepInSpot(Env.Body, Rq, B.P, Si);
			Si.Err = std::max(0.0, LRDetMath::Hypot(Si.X - Env.Body.X, Si.Z - Env.Body.Z) - STEP_IN::TOL * (Env.Body.Scale != 0 ? Env.Body.Scale : 1));
		}
		const bool bLeft = Act.bStepIn ? Act.StepIn.bLeftFoot : FootForLeft(Env.Body, R.Lat);
		const EFoot Weak = WeakOf(Env.Body, bLeft);
		const FKickReq K = KickRequest(Env, Act, bScuff, B.P, bLeft);
		// (the player's shot let go off the meter's sweet spot is scuffed: its aim and power already moved, here it
		// strikes as a scuff does, wider and dull)
		const bool bMis = !bScuff && Rq.bScuff;
		FStrikeCtx Ctx = KickCtx(Env, Act, K, B.P, R.Ahead, Weak, bScuff || bMis);
		if (Act.bHasDevZ) { Ctx.bHasZ = true; Ctx.Z[0] = Act.DevZ[0]; Ctx.Z[1] = Act.DevZ[1]; Ctx.Z[2] = Act.DevZ[2]; }
		// (a scuff changes the speed and the aim: it starts cold)
		FWarmStart Warm;
		const bool bWarm = !bScuff && Act.PreState == 1;
		if (bWarm) Warm = Act.Pre.Warm();
		Act.Plan = PlanShot(K.Req, Ctx, *Env.Rng, bWarm && Warm.bValid ? &Warm : nullptr);
		Act.PreState = -2; Act.bHasDevZ = false;
		const FStrikeLaunch& L = Act.Plan.Launch;
		LRBall::FTouch T;
		T.Agent = Env.Agent; T.Team = Env.Team; T.Kind = K.bIsShot ? "shot" : KindName(Rq.Kind); T.Aero = Env.Striker.Aero;
		T.bHasT = true; T.T = Env.NowT;
		T.Knuck.bOn = L.Knuck.bOn; T.Knuck.Amp = L.Knuck.Amp; T.Knuck.Freq = L.Knuck.Freq; T.Knuck.Phase = L.Knuck.Phase;
		LRBall::Kick(B, L.V, L.W, T);
		if (Env.Pred) Env.Pred->Refresh(B, Env.PredWorld, Env.NowT, Env.StepIndex);
		// how cleanly it was struck (1 sweet, 0 a snatch): the plant error, the scuff, the over-hit, the legs
		const double Over = K.bIsShot && Rq.Power > 0.92 ? 3 * (Rq.Power - 0.92) : 0;
		Act.Clean = Clamp(1 - 1.8 * Ctx.PlantErr - Over - (bScuff || bMis ? 0.5 : 0) - 0.25 * (1 - Ctx.BF) - 0.2 * Rq.Over, 0, 1);
		Act.bStruck = true; Act.bScuffed = bScuff || bMis;
		Act.bDone = true; Act.ContactStep = Env.StepIndex;
	}
}
}

LRStrike::FKickAct LRStrike::StartKick(const FKickEnv& Env, const FShotAsk& Action)
{
	const FReach Cs = CanStrike(Env.Body, *Env.Ball);
	// a dead ball (a set piece) is walked up to: the run-up has no 0.35 s limit, only a generous one
	const bool bDead = Env.Ball->State == LRBall::EBallState::Dead || Env.bDeadBall || Env.bRestartTaker;
	const double Wait = ACT::ADJUST;
	const double Tc0 = Cs.Tc;
	FKickAct Act;
	Act.Action = Action;
	Act.StartStep = Env.StepIndex;
	// (FC27) a slow ball a step away: the step-in, its own time to the contact wherever the ball is in the window
	FStepIn Si;
	const bool bSi = !bDead && StepInOf(Env.Body, Action, *Env.Ball, *Env.Pred, Env.NowT, Cs.bLeftFoot, Env.bRestartTaker, Si);
	Act.bLeftFoot = Cs.bLeftFoot; Act.Side = Cs.Side;
	if (bSi)
	{
		Act.Tc = Si.T; Act.bAdjust = false; Act.Dur = Si.T + STEP_IN::FOLLOW; Act.AdjustMax = Wait; Act.bStepIn = true; Act.StepIn = Si;
		return Act;
	}
	Act.Tc = Cs.bOk ? Tc0 : ACT::ADJUST + ACT::TC_MAX;
	Act.bAdjust = !Cs.bOk;
	Act.Dur = (Cs.bOk ? Tc0 : ACT::ADJUST) + ACT::FOLLOW;
	Act.AdjustMax = bDead ? 3.0 : Wait;
	return Act;
}

bool LRStrike::KickStep(FKickAct& Act, FKickEnv& Env, double H, FKickSteer& Steer)
{
	Steer = FKickSteer();
	Act.T += H;
	const FBody& A = Env.Body;
	bool bStruckNow = false;
	if (!Act.bDone)
	{
		const FBallState& B = *Env.Ball;
		bool bBreak = false;
		if (Act.bAdjust)
		{
			// the stride adjust: steer to the plant spot behind the ball; strike the moment it is in the window
			const FReach Cs = CanStrike(A, B);
			FStepIn Si;
			const bool bSi = Act.AdjustMax <= 1 && StepInOf(A, Act.Action, B, *Env.Pred, Env.NowT, Cs.bLeftFoot, Env.bRestartTaker, Si);
			if (bSi)
			{
				Act.bAdjust = false; Act.bStepIn = true; Act.StepIn = Si; Act.bLeftFoot = Cs.bLeftFoot; Act.Side = Cs.Side;
				Act.Tc = Act.T + Si.T; Act.Dur = Act.Tc + STEP_IN::FOLLOW;
			}
			else if (Cs.bOk) { Act.bAdjust = false; Act.Tc = Act.T + Cs.Tc; Act.Dur = Act.Tc + ACT::FOLLOW; }
			else if (Act.T >= (Act.AdjustMax != 0 ? Act.AdjustMax : ACT::ADJUST))
			{
				StrikeContact(Act, Env, true); bStruckNow = true;
				Act.Dur = Act.T + ACT::FOLLOW;
				bBreak = true;
			}
			else
			{
				// the plant: behind the ball on the line of the kick, a little to the support foot's side
				const FVec3 Mp = B.P;
				const FVec3 Tg = Act.Action.bHasTarget ? Act.Action.Target : Mp;
				const double Kx = Tg.X - Mp.X, Kz = Tg.Z - Mp.Z;
				double Kl = LRDetMath::Hypot(Kx, Kz);
				if (Kl == 0) Kl = 1;
				const double Sd = Act.bLeftFoot ? 1 : -1, Rx = -Kz / Kl, Rz = Kx / Kl;
				const double Back = 0.62;
				const double Px = Mp.X - Kx / Kl * Back + Rx * Sd * 0.12, Pz = Mp.Z - Kz / Kl * Back + Rz * Sd * 0.12;
				// at a dead ball, slowing as he comes onto the spot; a moving ball is chased at full stride
				const double Cap = Act.AdjustMax > 1 ? std::max(0.6, 1.5 * LRDetMath::Hypot(Px - A.X, Pz - A.Z) + 0.3) : SS_INF;
				// actions.js steer(a, px, pz, gait, 0.04, face, cap)
				const double Dx = Px - A.X, Dz = Pz - A.Z, Dd = LRDetMath::Hypot(Dx, Dz), Stop = 0.04;
				Steer.bSet = true; Steer.bHasStand = true; Steer.StandX = Px; Steer.StandZ = Pz;
				Steer.bHasFace = true; Steer.FaceX = Kx / Kl; Steer.FaceZ = Kz / Kl;
				if (Dd <= Stop) { Steer.bHasDir = true; Steer.Dx = 0; Steer.Dz = 0; Steer.SpeedCap = Cap; }
				else
				{
					Steer.bHasDir = true; Steer.Dx = Dx / Dd; Steer.Dz = Dz / Dd;
					Steer.SpeedCap = std::min(Cap, std::sqrt(2 * 6.5 * std::max(0.0, Dd - Stop * 0.5)) + 0.15);
				}
			}
		}
		if (!bBreak)
		{
			if (!Act.bAdjust && !Act.bDone)
			{
				Steer.bSet = true;
				if (Act.Action.bHasTarget)
				{
					const double Dx = Act.Action.Target.X - A.X, Dz = Act.Action.Target.Z - A.Z;
					double Dd = LRDetMath::Hypot(Dx, Dz);
					if (Dd == 0) Dd = 1;
					Steer.bHasFace = true; Steer.FaceX = Dx / Dd; Steer.FaceZ = Dz / Dd;
				}
				if (Act.bStepIn)
				{
					// the step-in: to the root's place at the contact, kept on the ball where it will be then
					FStepIn& Si = Act.StepIn;
					const double Left = std::max(0.0, Act.Tc - Act.T);
					const FVec3 SiB = Env.Pred->At(B, Env.NowT, Left);
					StepInSpot(A, Act.Action, SiB, Si);
					// across the aim he is at his place LAT_BY before the contact; along it V_PLANT short at the plant
					const double Dx = Si.X - A.X, Dz = Si.Z - A.Z, Al = Dx * Si.Fx + Dz * Si.Fz, La = Dz * Si.Fx - Dx * Si.Fz;
					const double Ap = Left > STEP_IN::PLANT_T + H ? (Al - STEP_IN::V_PLANT * STEP_IN::PLANT_T) / (Left - STEP_IN::PLANT_T) : Al / std::max(Left, H);
					const double Va = std::max(Ap, std::min(Al / std::max(Left, H), STEP_IN::V_PLANT)), Vl0 = La / std::max(Left, H), Vlm = STEP_IN::LAT_V * STEP_IN::VMAX;
					const double Vm = std::sqrt(std::max(0.0, Vlm * Vlm - Va * Va));
					const double Vw = La / std::max(Left - STEP_IN::LAT_BY, H);
					const double Vl = std::fabs(Vw) > std::fabs(Vl0) ? Sign(Vw) * std::max(std::fabs(Vl0), std::min(std::fabs(Vw), Vm)) : Vl0;
					const double Vx = Va * Si.Fx - Vl * Si.Fz, Vz = Va * Si.Fz + Vl * Si.Fx;
					const double Vv = LRDetMath::Hypot(Vx, Vz);
					Steer.bHasDir = true; Steer.Dx = Vv > 1e-3 ? Vx / Vv : 0; Steer.Dz = Vv > 1e-3 ? Vz / Vv : 0;
					const double V0 = std::max(0.0, Si.V0 - STEP_IN::VMAX) * Clamp((Left - STEP_IN::PLANT_T) / std::max(H, Si.T - STEP_IN::PLANT_T), 0, 1);
					Steer.SpeedCap = std::min(STEP_IN::VMAX + V0, Vv);
					// turned to the aim through the step: this step's share of what is left of the turn
					const double E = WrapA(YawOf(Si.Fx, Si.Fz) - A.Yaw), Fy = A.Yaw + E * std::min(1.0, H / std::max(H, Left - STEP_IN::TURN_BY));
					Steer.bHasFace = true; Steer.FaceX = -LRDetMath::Sin(Fy); Steer.FaceZ = -LRDetMath::Cos(Fy);
				}
				else
				{
					// the root's speed through the strike: strikeRoot of the approach speed
					if (!Act.bVInSet) { Act.bVInSet = true; Act.VIn = A.Speed; }
					Steer.SpeedCap = std::min(std::max(1.5, A.Speed * 0.97), std::max(STRIKE_ROOT_MIN, Act.VIn * StrikeRoot(Act.T, Act.Tc)));
				}
				if (Act.T >= Act.Tc - 1e-9) { StrikeContact(Act, Env, false); bStruckNow = true; }
			}
			// the solve, a flight a step through the swing
			if (!Act.bDone) KickPresolve(Act, Env);
		}
	}
	else if (Act.bStepIn)
	{
		// after a step-in's contact: on along the aim at KEEP of the speed he struck it at for ON, then his own way
		const FStepIn& Si = Act.StepIn;
		const double K = Act.T - Act.Tc;
		Steer.bSet = true;
		if (K < STEP_IN::ON) { Steer.bHasDir = true; Steer.Dx = Si.Fx; Steer.Dz = Si.Fz; }
		Steer.bHasFace = true; Steer.FaceX = Si.Fx; Steer.FaceZ = Si.Fz;
		Steer.SpeedCap = std::max(STRIKE_ROOT_MIN, std::min(Si.VC, STEP_IN::VON) * STEP_IN::KEEP * (1 - 0.6 * SStep01(STEP_IN::ON, STEP_IN::ON + 0.3, K)));
	}
	else
	{
		Steer.bSet = true;
		Steer.SpeedCap = std::min(2.5, Act.bVInSet ? std::max(STRIKE_ROOT_MIN, Act.VIn * StrikeRoot(Act.T, Act.Tc)) : 2.5);
	}
	return bStruckNow;
}

#if defined(_MSC_VER) && !defined(__clang__)
	#pragma float_control(pop)
#elif defined(__clang__)
	#pragma float_control(pop)
#endif
