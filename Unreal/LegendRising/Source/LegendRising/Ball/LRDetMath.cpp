// LRDetMath.cpp: see LRDetMath.h. A line-for-line port of js/life/football/detmath.js (bcs/integ 41c4cd0).
// The operation order of every expression is the JS order: do not "simplify" these, the bits depend on it.

#include "LRDetMath.h"

#include <cmath>
#include <cstdint>
#include <cstring>
#include <limits>

// Strict IEEE arithmetic in this file: no fused multiply-add, no reassociation, whatever the module's float settings.
// (Unity builds paste .cpp files together, so the state is pushed here and popped at the end of the file.)
#if defined(_MSC_VER) && !defined(__clang__)
	#pragma float_control(precise, on, push)
	#pragma fp_contract(off)
#elif defined(__clang__)
	#pragma float_control(precise, on, push)
	#pragma clang fp contract(off)
#endif

namespace LRDetMath
{
namespace
{
	const double DM_INF = std::numeric_limits<double>::infinity();
	const double DM_NAN = std::numeric_limits<double>::quiet_NaN();

	// detmath.js lines 33-34: 1/n! for n = 0..26, by repeated division (the same rounding everywhere)
	struct FInvFact
	{
		double V[27];
		FInvFact()
		{
			V[0] = 1;
			for (int N = 1; N <= 26; N++) V[N] = V[N - 1] / N;
		}
	};
	const FInvFact& IF()
	{
		static const FInvFact Table;
		return Table;
	}

	// lines 65-66: 2/(2k+1) for k = 1..12 (stored from index 0)
	struct FLogSeries
	{
		double V[12];
		FLogSeries()
		{
			for (int K = 1; K <= 12; K++) V[K - 1] = 2.0 / (2 * K + 1);
		}
	};
	const FLogSeries& LG()
	{
		static const FLogSeries Table;
		return Table;
	}

	// lines 193-194: (-1)^k/(2k+1) for k = 0..12
	struct FAtanSeries
	{
		double V[13];
		FAtanSeries()
		{
			for (int K = 0; K <= 12; K++) V[K] = (K % 2 ? -1.0 : 1.0) / (2 * K + 1);
		}
	};
	const FAtanSeries& AT()
	{
		static const FAtanSeries Table;
		return Table;
	}

	// line 37: 2^k as a double, for k in -1022..1023, written straight into the exponent bits
	double Pow2(int K)
	{
		const uint64_t Bits = static_cast<uint64_t>(K + 1023) << 52;
		double Out;
		std::memcpy(&Out, &Bits, sizeof(Out));
		return Out;
	}

	// line 45: ln 2 split so that k*LN2_HI is exact (fdlibm's ln2_hi and ln2_lo)
	constexpr double LN2_HI = 6.93147180369123816490e-01;
	constexpr double LN2_LO = 1.90821492927058770002e-10;
	constexpr double LOG2E = 1.4426950408889634;
	constexpr double SQRT2 = 1.4142135623730951;
	// line 115: pi/2 split, and 2/pi
	constexpr double PIO2_1 = 1.57079632673412561417e+00;
	constexpr double PIO2_1T = 6.07710050650619224932e-11;
	constexpr double TWO_OVER_PI = 0.6366197723675814;

	// JS's ((n % 4) + 4) % 4 on a double n
	int Quadrant(double N)
	{
		return static_cast<int>(std::fmod(std::fmod(N, 4.0) + 4.0, 4.0));
	}

	// kSin and kCos (lines 118-129): sin and cos on [-pi/4, pi/4], Taylor to r^17 and r^18
	double KSin(double R)
	{
		const double* F = IF().V;
		const double Z = R * R;
		double P = -F[17];
		P = P * Z + F[15]; P = P * Z - F[13]; P = P * Z + F[11]; P = P * Z - F[9]; P = P * Z + F[7]; P = P * Z - F[5]; P = P * Z + F[3];
		return R - R * Z * P;
	}
	double KCos(double R)
	{
		const double* F = IF().V;
		const double Z = R * R, Hz = 0.5 * Z, W = 1 - Hz;
		double P = F[18];
		P = P * Z - F[16]; P = P * Z + F[14]; P = P * Z - F[12]; P = P * Z + F[10]; P = P * Z - F[8]; P = P * Z + F[6]; P = P * Z - F[4];
		return W + (((1 - W) - Hz) - Z * Z * P);
	}
}
}

double LRDetMath::Exp(double X)
{
	// expQ, lines 47-60
	if (X != X) return DM_NAN;
	if (X > 709.782712893384) return DM_INF;
	if (X < -745.1332191019412) return 0;
	const double K = std::floor(X * LOG2E + 0.5);
	const double R = (X - K * LN2_HI) - K * LN2_LO;            // |r| <= 0.35
	const double* F = IF().V;
	double P = F[14];
	for (int N = 13; N >= 0; N--) P = P * R + F[N];
	const int Ki = static_cast<int>(K);
	if (Ki > 1023) return P * Pow2(1023) * Pow2(Ki - 1023);
	if (Ki < -1021) return P * Pow2(Ki + 54) * Pow2(-54);
	return P * Pow2(Ki);
}

double LRDetMath::Log(double X)
{
	// logQ, lines 68-87
	if (X != X || X < 0) return DM_NAN;
	if (X == 0) return -DM_INF;
	if (X == DM_INF) return DM_INF;
	int E = 0;
	if (X < 2.2250738585072014e-308) { X *= 18014398509481984.0; E = -54; }   // subnormal: scale by 2^54 first
	uint64_t Bits;
	std::memcpy(&Bits, &X, sizeof(Bits));
	const uint32_t Hi = static_cast<uint32_t>(Bits >> 32);
	E += static_cast<int>(Hi >> 20) - 1023;
	const uint32_t NewHi = (Hi & 0x000fffffu) | 0x3ff00000u;
	Bits = (static_cast<uint64_t>(NewHi) << 32) | (Bits & 0xffffffffull);
	double M;
	std::memcpy(&M, &Bits, sizeof(M));                         // the mantissa in [1, 2)
	if (M > SQRT2) { M *= 0.5; E++; }
	// log(m) = 2 atanh(s) with s = f/(2 + f), f = m - 1 (exact)
	const double Fm = M - 1, S = Fm / (2 + Fm), Z = S * S;
	const double* L = LG().V;
	double Rr = L[11];
	for (int K = 10; K >= 0; K--) Rr = Rr * Z + L[K];
	Rr *= Z;
	return (E * LN2_LO + (Fm - S * (Fm - Rr))) + E * LN2_HI;
}

double LRDetMath::Pow(double X, double Y)
{
	// powQ, lines 91-109
	if (Y == 0) return 1;
	if (X != X || Y != Y) return DM_NAN;
	if (X == 1) return 1;
	const double Yi = std::floor(Y);
	if (Yi == Y && std::fabs(Y) <= 64)
	{
		double N = std::fabs(Y), B = X, Out = 1;
		while (N > 0)
		{
			if (static_cast<long long>(N) & 1) Out *= B;
			B *= B;
			N = std::floor(N / 2);
		}
		return Y < 0 ? 1 / Out : Out;
	}
	if (X == 0) return Y > 0 ? 0 : DM_INF;
	if (X < 0)
	{
		if (Yi == Y) return (std::fmod(Yi, 2.0) != 0 ? -1.0 : 1.0) * Pow(-X, Y);
		return DM_NAN;
	}
	if (X == DM_INF) return Y > 0 ? DM_INF : 0;
	return Exp(Y * Log(X));
}

double LRDetMath::Sin(double X)
{
	// sinQ, lines 140-159
	if (X != X || X == DM_INF || X == -DM_INF) return DM_NAN;
	if (std::fabs(X) < 7.450580596923828e-9) return X;
	const double N = std::floor(X * TWO_OVER_PI + 0.5);
	const int Q = Quadrant(N);
	const double R = (X - N * PIO2_1) - N * PIO2_1T;
	if (Q == 0 || Q == 2)
	{
		const double V = KSin(R);
		return Q == 0 ? V : -V;
	}
	const double V = KCos(R);
	return Q == 1 ? V : -V;
}

double LRDetMath::Cos(double X)
{
	// cosQ, lines 160-179
	if (X != X || X == DM_INF || X == -DM_INF) return DM_NAN;
	if (std::fabs(X) < 7.450580596923828e-9) return 1;
	const double N = std::floor(X * TWO_OVER_PI + 0.5);
	const int Q = Quadrant(N);
	const double R = (X - N * PIO2_1) - N * PIO2_1T;
	if (Q == 0 || Q == 2)
	{
		const double V = KCos(R);
		return Q == 0 ? V : -V;
	}
	const double V = KSin(R);
	return Q == 3 ? V : -V;
}

double LRDetMath::Tan(double X)
{
	// tanQ, lines 180-185 (reduce, kSin, kCos)
	if (X != X || X == DM_INF || X == -DM_INF) return DM_NAN;
	const double N = std::floor(X * TWO_OVER_PI + 0.5);
	const int Q = Quadrant(N);
	const double R = (X - N * PIO2_1) - N * PIO2_1T;
	const double S = KSin(R), C = KCos(R);
	return Q % 2 == 0 ? S / C : -C / S;
}

double LRDetMath::Atan(double X)
{
	// atanQ, lines 196-214
	if (X != X) return DM_NAN;
	if (X == DM_INF) return HALF_PI;
	if (X == -DM_INF) return -HALF_PI;
	double A = std::fabs(X);
	if (A < 7.450580596923828e-9) return X;
	const bool bInv = A > 1;
	if (bInv) A = 1 / A;
	// halve the angle twice: |a| <= tan(pi/16)
	A = A / (1 + std::sqrt(1 + A * A));
	A = A / (1 + std::sqrt(1 + A * A));
	const double Z = A * A;
	const double* T = AT().V;
	double P = T[12];
	for (int K = 11; K >= 1; K--) P = P * Z + T[K];
	double Th = 4 * (A + A * Z * P);
	if (bInv) Th = HALF_PI - Th;
	return X < 0 ? -Th : Th;
}

double LRDetMath::Atan2(double Y, double X)
{
	// atan2Q, lines 216-233 (with the signs of zero as the standard function)
	if (X != X || Y != Y) return DM_NAN;
	if (Y == 0)
	{
		if (X > 0 || (X == 0 && !std::signbit(X))) return Y;
		return std::signbit(Y) ? -PI : PI;
	}
	if (X == 0) return Y > 0 ? HALF_PI : -HALF_PI;
	if (X == DM_INF) return Y == DM_INF ? PI / 4 : Y == -DM_INF ? -PI / 4 : Y > 0 ? 0.0 : -0.0;
	if (X == -DM_INF) return Y == DM_INF ? 3 * PI / 4 : Y == -DM_INF ? -3 * PI / 4 : Y > 0 ? PI : -PI;
	if (Y == DM_INF) return HALF_PI;
	if (Y == -DM_INF) return -HALF_PI;
	const double T = Atan(std::fabs(Y / X));
	if (X > 0) return Y > 0 ? T : -T;
	return Y > 0 ? PI - T : T - PI;
}

double LRDetMath::Hypot(double A, double B) { return std::sqrt(A * A + B * B); }
double LRDetMath::Hypot(double A, double B, double C) { return std::sqrt(A * A + B * B + C * C); }

double LRDetMath::Asin(double X)
{
	// lines 237-241
	if (!(X >= -1 && X <= 1)) return DM_NAN;
	return Atan2(X, std::sqrt((1 - X) * (1 + X)));
}

double LRDetMath::Acos(double X)
{
	// lines 242-246
	if (!(X >= -1 && X <= 1)) return DM_NAN;
	return Atan2(std::sqrt((1 - X) * (1 + X)), X);
}

#if defined(_MSC_VER) && !defined(__clang__)
	#pragma float_control(pop)
#elif defined(__clang__)
	#pragma float_control(pop)
#endif
