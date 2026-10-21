// LRShotMeter.cpp: see LRShotMeter.h. A line-for-line port of the meter, grade, flick bar and shot release parts of
// js/life/football/control.js (bcs/integ 41c4cd0).

#include "LRShotMeter.h"

#include <algorithm>
#include <cmath>

// Strict IEEE arithmetic in this file (see LRDetMath.cpp)
#if defined(_MSC_VER) && !defined(__clang__)
	#pragma float_control(precise, on, push)
	#pragma fp_contract(off)
#elif defined(__clang__)
	#pragma float_control(precise, on, push)
	#pragma clang fp contract(off)
#endif

namespace LRMeter
{
namespace
{
	inline double Clamp(double V, double A, double B) { return V < A ? A : V > B ? B : V; }
	inline double Num(double V) { return V == V ? V : 0; }
	constexpr double CDEG = 3.141592653589793 / 180;
}
}

double LRMeter::JsHypot(double A, double B)
{
	// V8's MathHypot (src/builtins/math.tq): normalise by the largest, Kahan-sum the squares, sqrt times the largest
	if (A != A || B != B)
	{
		if (std::isinf(A) || std::isinf(B)) return INFINITY;
		return NAN;
	}
	const double Abs[2] = {std::fabs(A), std::fabs(B)};
	double Max = 0;
	for (double V : Abs) if (V > Max) Max = V;
	if (std::isinf(Max)) return INFINITY;
	if (Max == 0) return 0;
	double Sum = 0, Compensation = 0;
	for (double V : Abs)
	{
		const double N = V / Max;
		const double Summand = N * N - Compensation;
		const double Preliminary = Sum + Summand;
		Compensation = (Preliminary - Sum) - Summand;
		Sum = Preliminary;
	}
	return std::sqrt(Sum) * Max;
}

LRMeter::FMeterBand LRMeter::MeterBand(double D, double Tech, double Ak)
{
	// control.js meterBand (lines 217-225)
	FMeterBand Out;
	const double K = Clamp((Num(D) - METER::SHOT_D0) / (METER::SHOT_D1 - METER::SHOT_D0), 0, 1);
	const double C = METER::SHOT_C0 + (METER::SHOT_C1 - METER::SHOT_C0) * K;
	const double W = METER::SHOT_W + METER::SHOT_WA * Clamp(Ak, 0, 1) + METER::TECH_W * Clamp(Tech, 0, 99) / 99;
	Out.C = C; Out.Hi = std::min(METER::SHOT_MAX, C + W / 2); Out.Lo = std::max(0.2, Out.Hi - W);
	const double M = (Out.Lo + Out.Hi) / 2, G = std::max(METER::GOLD_MIN, (Out.Hi - Out.Lo) * METER::GOLD) / 2;
	Out.GLo = M - G; Out.GHi = M + G;
	return Out;
}

LRMeter::FGrade LRMeter::ShotGrade(double P, const FMeterBand& Band)
{
	// control.js shotGrade (lines 228-237)
	FGrade Out;
	Out.bOver = P > Band.Hi;
	if (P >= Band.GLo && P <= Band.GHi) { Out.Grade = EGrade::Perfect; Out.E = 0; }
	else if (P >= Band.Lo && P <= Band.Hi)
	{
		Out.Grade = EGrade::Good;
		Out.E = P < Band.GLo ? (Band.GLo - P) / std::max(1e-6, Band.GLo - Band.Lo) : (P - Band.GHi) / std::max(1e-6, Band.Hi - Band.GHi);
	}
	else { Out.Grade = EGrade::Scuff; Out.E = Clamp((P < Band.Lo ? Band.Lo - P : P - Band.Hi) / 0.15, 0, 1); }
	Out.E = Clamp(Out.E, 0, 1);
	return Out;
}

LRMeter::FPassBand LRMeter::PassBand(double Ideal, double VMax, double Passing, double Ak)
{
	// control.js passBand (lines 240-245)
	FPassBand Out;
	const double C = Clamp((Ideal - CN::PASS_MIN) / (VMax - CN::PASS_MIN), 0, 1);
	const double W = (METER::PASS_W0 + METER::PASS_W1 * Clamp(Passing, 0, 100) / 100) * (1 + METER::PASS_WA * Clamp(Ak, 0, 1));
	Out.C = C; Out.Lo = C - W / 2; Out.Hi = C + W / 2;
	return Out;
}

double LRMeter::ChargeP(double Held)
{
	// 1 - Math.pow(1 - min(1, t/0.85), 2): pow(x, 2) is x*x exactly (fdlibm's own special case)
	const double X = 1 - std::min(1.0, Held / CN::SHOT_FULL);
	return 1 - X * X;
}

double LRMeter::TechniqueOf(double Aero, double Curve, double Ctrl)
{
	// .4*(aero || 0) + .3*(curve || 50) + .3*(ctrl || dribbling || 50)
	const double Cv = Num(Curve) != 0 ? Curve : 50, Ct = Num(Ctrl) != 0 ? Ctrl : 50;
	return Clamp(0.4 * Num(Aero) + 0.3 * Cv + 0.3 * Ct, 0, 99);
}

double LRMeter::FlickRate(double Ctrl)
{
	// control.js flickRate (lines 106-111)
	const double X = std::max(0.0, Num(Ctrl));
	const int N = 3;
	const double* Px = FLICK_CHG::PTS_X;
	const double* Py = FLICK_CHG::PTS_Y;
	if (X >= Px[N]) return std::min(FLICK_CHG::MAX, Py[N] + (Py[N] - Py[N - 1]) / (Px[N] - Px[N - 1]) * (X - Px[N]));
	for (int I = 1; I <= N; I++)
	{
		if (X <= Px[I]) { const double X0 = Px[I - 1], Y0 = Py[I - 1], X1 = Px[I], Y1 = Py[I]; return Y0 + (Y1 - Y0) * (X - X0) / (X1 - X0); }
	}
	return Py[0];
}

double LRMeter::FlickFull(double Ctrl) { return FLICK_CHG::BASE / FlickRate(Ctrl); }
double LRMeter::FlickCharge(double Held, double Ctrl) { return std::min(1.0, Held / FlickFull(Ctrl)); }
double LRMeter::FlickP(double Held, double Ctrl) { return Clamp(Held / FlickFull(Ctrl), 0.05, 1); }

double LRMeter::CurlSpin(double Curve)
{
	// CURL.MAX*pow(clamp((curve - LO)/(99 - LO), 0, 1.15), POW) with POW 1 (pow(x, 1) is x)
	return CURL::MAX * Clamp((Num(Curve) - CURL::LO) / (99 - CURL::LO), 0, 1.15);
}

LRMeter::FShotReleaseOut LRMeter::BuildShotRelease(const FShotReleaseIn& In)
{
	FShotReleaseOut Out;
	LRStrike::FShotAsk& Rq = Out.Ask;
	const double Held = In.Held;
	const FVec3& BP = In.BallP;
	// the charge: p = 1 - (1 - t/0.85)^2; past full the over-hold grows (the lean back)
	double P = ChargeP(Held);
	const double Over = Clamp((Held - CN::SHOT_FULL) / AIM::OVER, 0, 1);
	// the meter: let go inside its sweet spot (the power for the distance you look at) and, with the assists, it is clean
	Out.Band = MeterBand(JsHypot(In.LookPoint.X - BP.X, In.LookPoint.Z - BP.Z), In.Technique, In.AssistK);
	const FMeterBand& Band = Out.Band;
	Out.bInSpot = Held >= CN::TAP && P >= Band.Lo && P <= Band.Hi;
	Out.bClean = Out.bInSpot && In.AssistK > 0;
	Out.bGraded = Held >= CN::TAP;
	if (Out.bGraded) Out.Grade = ShotGrade(P, Band);
	const double GE = Out.Grade.E;
	const bool bGOver = Out.Grade.bOver;
	// where it goes: the look when clean, else the reticle
	FVec3 Tgt = Out.bClean ? In.LookPoint : In.ReticlePoint;
	const bool bToGoal = Out.bClean ? In.bLookOnGoal : In.bReticleOnGoal;
	// a lofted ball with contact High at a point on the grass: a cross or a lob
	LRStrike::EKind Kind = LRStrike::EKind::Shot;
	if (!bToGoal && (In.Contact > 0 || In.bLift)) Kind = In.bTargetInBox ? LRStrike::EKind::Cross : LRStrike::EKind::Lob;
	// the shape: a tap is a placed side-foot; a lift chips it, a flick down dips it; a full wind-up is power; looked
	// at low on goal with Normal contact it is driven low. (The kick type is always "normal" now, control.js line 248.)
	std::string Shape = Held < CN::TAP ? "placed" : P >= 0.97 ? "power" : "struck";
	int Ctc = In.Contact;
	bool bFinesse = In.bFinesseKey, bChip = false, bHasCurl = false, bStyle = false;
	double Curl = 0;
	if (Shape == "placed") { P = AIM::PLACED; bFinesse = true; bHasCurl = true; Curl = 0; bStyle = true; }
	if (In.bLift && Kind == LRStrike::EKind::Shot) { Shape = "chip"; Ctc = 1; bChip = true; P *= AIM::CHIP; bStyle = true; }
	else if (In.bDip) { Shape = "dip"; Ctc = -1; }
	else if (Kind == LRStrike::EKind::Shot && Ctc == 0 && bToGoal && Tgt.Y < AIM::LOW_Y && Shape != "placed")
	{
		Shape = Shape == "power" ? "power low" : "low"; Ctc = -1;
	}
	if (Kind != LRStrike::EKind::Shot) { Ctc = 1; Shape = "lofted"; }
	// A or D held as it is let go sends it out that way and bends it back, by the Curve skill; W with it: half the
	// curl, as hard as a straight shot
	const int Kc = In.bKeyA != In.bKeyD ? (In.bKeyD ? 1 : -1) : 0;
	bool bHasBend = false;
	double Bend = 0;
	if (Kc && Kind == LRStrike::EKind::Shot && !bChip)
	{
		const double Amt = CurlSpin(In.Curve) / (18 + 0.25 * Clamp(Num(In.Curve), 0, 99)) * (In.bKeyW ? 0.5 : 1);
		bFinesse = true; bHasBend = true; Bend = -Kc * Amt;
		// the part of the strong foot: a right foot's outside bends it right (A), its inside left (D)
		Out.FootPart = ((Kc < 0) == !In.bLeftFooted) ? "outside" : "inside";
		Shape = (Shape == "placed" || Shape == "struck" || Shape == "power" ? std::string("") : Shape + " ") + (In.bKeyW ? "curl and power" : "curl");
	}
	// held past full: you lean back and it rises
	if (Over > 0 && Kind == LRStrike::EKind::Shot)
	{
		const double D = JsHypot(Tgt.X - BP.X, Tgt.Z - BP.Z);
		Tgt.Y += Over * (0.6 + 0.05 * D);
		Shape += " over";
	}
	// the grade moves the aim: a good shot a degree or two off, a scuff well off (skied over-hit, along the grass
	// under-hit); the way it goes off is the reticle's sway, or the step's parity
	if (Out.bGraded && Out.Grade.Grade != EGrade::Perfect && Kind == LRStrike::EKind::Shot)
	{
		const double Dx = Tgt.X - BP.X, Dz = Tgt.Z - BP.Z, D = std::max(1.0, JsHypot(Dx, Dz));
		const double SwaySign = In.ReticleSwaySign > 0 ? 1.0 : In.ReticleSwaySign < 0 ? -1.0 : 0.0;
		const double Sg = SwaySign != 0 ? SwaySign : ((In.StepIndex & 1) ? 1.0 : -1.0);
		const double Deg = Out.Grade.Grade == EGrade::Good ? METER::GOOD_DEG + METER::GOOD_DEG1 * GE : METER::SCUFF_DEG + METER::SCUFF_DEG1 * GE;
		double Off = D * std::tan(Deg * CDEG);
		if (Out.Grade.Grade == EGrade::Scuff)
		{
			Off = std::max(Off, METER::SCUFF_MIN); Out.bScuff = true;
			if (bGOver) Tgt.Y += 1.5 + 0.08 * D;
			else { Tgt.Y = std::min(Tgt.Y, 0.3); P *= METER::SCUFF_P; }
			Shape += " scuffed";
		}
		else Tgt.Y = std::max(0.15, Tgt.Y + 0.35 * Off * (((In.StepIndex >> 1) & 1) ? 1 : -1));
		Tgt.X += Sg * Dz / D * Off; Tgt.Z -= Sg * Dx / D * Off;
	}
	Rq.Kind = Kind; Rq.bHasTarget = true; Rq.Target = Tgt; Rq.Power = Clamp(P, 0.05, 1); Rq.Contact = Ctc; Rq.bFinesse = bFinesse;
	Rq.bFirstTime = !In.bInControl; Rq.Over = Over;
	if (Out.bClean) { Rq.bClean = true; Shape += " clean"; }
	if (Out.bScuff) Rq.bScuff = true;
	if (bHasCurl) { Rq.bHasCurl = true; Rq.Curl = Curl; }
	if (bHasBend) { Rq.bHasBend = true; Rq.Bend = Bend; }
	if (bChip) Rq.bChip = true;
	if (bStyle) Rq.bStyle = true;
	if (Out.FootPart[0] && In.bKeyW) Rq.bDrive = true;
	// a lofted ball: its speed is the loft's for the distance (actions.js loftSpeedFor), no power
	if (Kind == LRStrike::EKind::Cross || Kind == LRStrike::EKind::Lob) { Rq.bHasSpeed = false; Rq.Power = 0.85; }
	Out.ChargeShown = Out.bGraded ? ChargeP(Held) : 0;
	Out.Shape = Shape;
	return Out;
}

#if defined(_MSC_VER) && !defined(__clang__)
	#pragma float_control(pop)
#elif defined(__clang__)
	#pragma float_control(pop)
#endif
