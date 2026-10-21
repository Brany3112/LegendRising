// LRGaitTables.cpp: see the header. Ported from js/life/gaitcore.js (bcs/integ 41c4cd0) line for line.

#include "LRGaitTables.h"
#include "LRMoveMath.h"

#include <cmath>

namespace LRMove
{
namespace Gait
{
	// rows: {v m/s, steps per minute, step length m, duty}
	const FRow WALK[7] = {
		{0.5, 84, 0.357, 0.64}, {0.8, 94, 0.511, 0.63}, {1.1, 104, 0.635, 0.62}, {1.4, 113, 0.743, 0.61},
		{1.7, 121, 0.843, 0.60}, {2.0, 128, 0.938, 0.585}, {2.3, 134, 1.030, 0.57}};
	const FRow RUN[8] = {
		{2.4, 150, 0.960, 0.406}, {3.0, 160, 1.125, 0.356}, {3.6, 164, 1.317, 0.315}, {4.5, 170, 1.588, 0.274},
		{5.5, 176, 1.875, 0.243}, {6.5, 184, 2.120, 0.224}, {7.6, 194, 2.351, 0.213}, {9.0, 204, 2.647, 0.189}};
	const FRow CARRY[6] = {
		{2.4, 330, 0.44, 0.46}, {3.6, 340, 0.64, 0.45}, {4.5, 360, 0.75, 0.44}, {5.5, 410, 0.80, 0.42},
		{6.5, 450, 0.87, 0.40}, {7.6, 470, 0.97, 0.36}};
	const double WALK_HIP_DROP[7] = {0.020, 0.025, 0.032, 0.040, 0.045, 0.050, 0.055};

	// Which column of a row (gaitcore.js col's index c: 2 the step, 3 the duty)
	enum class ECol : uint8_t { Step, Duty };
	static_assert(sizeof(FRow) == 4 * sizeof(double), "FRow must stay four doubles");

	inline double ColOf(const FRow& R, ECol C) { return C == ECol::Step ? R.Step : R.Duty; }

	// gaitcore.js col: a table column interpolated by speed, clamped to the first and last rows
	template <int32_t NRows>
	double Col(const FRow (&T)[NRows], double V, ECol C)
	{
		if (V <= T[0].V) return ColOf(T[0], C);
		for (int32_t I = 1; I < NRows; I++)
		{
			if (V <= T[I].V)
			{
				const FRow& A = T[I - 1];
				const FRow& B = T[I];
				return Lerp(ColOf(A, C), ColOf(B, C), (V - A.V) / (B.V - A.V));
			}
		}
		return ColOf(T[NRows - 1], C);
	}

	double CarryEaseK(double H)
	{
		// exactly the game's number at its own step, the same time constant at any other
		if (std::fabs(H - 1.0 / 60.0) < 1e-9) return CARRY_EASE_K;
		return 1.0 - std::exp(-H / CARRY_EASE_TAU);
	}

	double CarryW(double V, double CK)
	{
		const double A = std::fabs(V);
		return CK > 0.0 ? CARRY_K.K * Min2(1.0, CK) * SStep(CARRY_K.V0, CARRY_K.V1, A) * (1.0 - SStep(CARRY_K.V2, CARRY_K.V3, A)) : 0.0;
	}

	EGaitMode GaitMode(EGaitMode Prev, double V, double HeldT)
	{
		if (Prev == EGaitMode::Run) return V < RUN_OFF ? EGaitMode::Walk : EGaitMode::Run;
		return (V > RUN_ON && HeldT >= RUN_HOLD - 1e-9) ? EGaitMode::Run : EGaitMode::Walk;
	}

	double StepLen(double V, EGaitMode Mode, double Scale, double Reach, double CK)
	{
		double S;
		if (Mode == EGaitMode::Run) S = Col(RUN, V, ECol::Step) * Scale;
		else
		{
			const double R = Reach < 0.0 ? ReachStep(V, Scale) : Reach;
			S = Min2(Col(WALK, V, ECol::Step) * Scale, R);
		}
		const double W = CarryW(V, CK);
		return W > 0.0 ? S + (Min2(S, Col(CARRY, V, ECol::Step) * Scale) - S) * W : S;
	}

	double Cadence(double V, EGaitMode Mode, double Scale, double Reach, double CK)
	{
		return V / StepLen(V, Mode, Scale, Reach, CK);
	}

	double DutyOf(double V, EGaitMode Mode, double CK)
	{
		if (Mode != EGaitMode::Run) return Col(WALK, V, ECol::Duty);
		const double D = Col(RUN, V, ECol::Duty);
		const double W = CarryW(V, CK);
		return W > 0.0 ? D + (Col(CARRY, V, ECol::Duty) - D) * W : D;
	}

	double StrideTime(double V, EGaitMode Mode, double Scale, double CK)
	{
		return 2.0 * StepLen(V, Mode, Scale, -1.0, CK) / Max2(V, 0.05);
	}

	double SwingTime(double V, EGaitMode Mode, double Scale, double CK)
	{
		const double Lo = 0.22 + (CARRY_SWING - 0.22) * CarryW(V, CK);
		return Clamp((1.0 - DutyOf(V, Mode, CK)) * StrideTime(V, Mode, Scale, CK), Lo, 0.45);
	}
} // namespace Gait

	EGaitMode FGaitClock::ModeStep(double V, double H)
	{
		Held = V > Gait::RUN_ON ? Held + H : 0.0;
		Mode = Gait::GaitMode(Mode, V, Held);
		return Mode;
	}

	int32_t FGaitClock::PhaseAdvance(double Dist, double V, double Scale, FFootfall* Out, int32_t MaxOut)
	{
		if (Dist == 0.0 || !std::isfinite(Dist) || !std::isfinite(V) || !std::isfinite(Scale)) return 0;
		// gaitcore.js phaseAdvanceQ writes stepLen out inline; it is the same arithmetic as StepLen with the default
		// reach and this clock's carry weight
		const double VA = std::fabs(V);
		const double Step = Gait::StepLen(VA, Mode, Scale, -1.0, CK);
		const double DPhi = Dist / (2.0 * Step);
		const double P0 = Phi;
		if (!(std::fabs(DPhi) <= Gait::MAX_STRIDES) || !std::isfinite(P0)) return 0;
		const double P1 = P0 + DPhi;
		int32_t Count = 0;
		if (DPhi > 0.0)
		{
			// boundaries k/2 with p0 < k/2 <= p1
			for (int64_t K = static_cast<int64_t>(std::floor(P0 * 2.0)) + 1; static_cast<double>(K) / 2.0 <= P1; K++)
			{
				const double B = static_cast<double>(K) / 2.0;
				const EFoot FootDown = (K & 1) ? EFoot::Right : EFoot::Left;
				if (Count < MaxOut && Out) { Out[Count].Side = FootDown; Out[Count].At = (B - P0) / DPhi; }
				Count++;
				N++;
				Side = FootDown;
			}
		}
		else
		{
			// boundaries k/2 with p1 <= k/2 < p0
			for (int64_t K = static_cast<int64_t>(std::ceil(P0 * 2.0)) - 1; static_cast<double>(K) / 2.0 >= P1; K--)
			{
				const double B = static_cast<double>(K) / 2.0;
				const EFoot FootDown = (K & 1) ? EFoot::Right : EFoot::Left;
				if (Count < MaxOut && Out) { Out[Count].Side = FootDown; Out[Count].At = (B - P0) / DPhi; }
				Count++;
				N++;
				Side = FootDown;
			}
		}
		double P = P1 - std::floor(P1);
		if (P >= 1.0) P = 0.0;  // -1e-17 floors to -1 and lands on 1
		Phi = P;
		return Count < MaxOut ? Count : MaxOut;
	}

	double FGaitClock::SwingProgress(EFoot Foot, double Duty) const
	{
		double Local = Foot == EFoot::Left ? Phi : Phi - 0.5;
		Local -= std::floor(Local);
		if (Local < Duty) return -1.0;
		return Duty >= 1.0 ? -1.0 : (Local - Duty) / (1.0 - Duty);
	}

	double FGaitClock::StrideSeconds(double V, double Scale) const
	{
		return 2.0 * Gait::StepLen(V, Mode, Scale, -1.0, CK) / Max2(V, 0.3);
	}

	double FGaitClock::TimeToFootfall(EFoot Foot, double V, double Scale) const
	{
		double D = (Foot == EFoot::Right ? 0.5 : 1.0) - Phi;
		D -= std::floor(D);
		if (D < 1e-6) D = 1.0;
		return D * StrideSeconds(V, Scale);
	}
} // namespace LRMove
