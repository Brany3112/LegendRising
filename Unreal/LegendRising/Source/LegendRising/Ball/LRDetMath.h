// LRDetMath.h: the game's deterministic transcendental functions, ported from js/life/football/detmath.js.
//
// Why this exists: the browser game never calls Math.sin/exp/atan2 in its simulation. It uses detmath.js, which builds
// every function from + - * / and sqrt (all correctly rounded by IEEE 754) so that every JavaScript engine gives the
// same bits. The ball and the strike solver call these on every sub-step, so to reproduce the JS numbers exactly the
// C++ port must use the very same polynomials in the very same order. std::sin and friends would drift in the last
// bits and a long flight would end up a few micrometres elsewhere.
//
// This header is plain C++ (no Unreal types) so it can be compiled outside the engine to check the port bit for bit
// against Node (see PORT-ball.md). Every function is pure.

#pragma once

#ifndef LEGENDRISING_API
#define LEGENDRISING_API
#endif

namespace LRDetMath
{
	// detmath.js line 30
	constexpr double Pi = 3.141592653589793;
	constexpr double HalfPi = 1.5707963267948966;

	// e^x (detmath.js expQ, lines 47-60)
	LEGENDRISING_API double Exp(double X);
	// natural log (logQ, lines 68-87)
	LEGENDRISING_API double Log(double X);
	// x^y (powQ, lines 91-109): integer exponents up to 64 by squaring, otherwise exp(y log x)
	LEGENDRISING_API double Pow(double X, double Y);
	// sin, cos, tan (sinQ, cosQ, tanQ, lines 140-185)
	LEGENDRISING_API double Sin(double X);
	LEGENDRISING_API double Cos(double X);
	LEGENDRISING_API double Tan(double X);
	// atan, atan2(y, x), asin, acos (lines 196-246)
	LEGENDRISING_API double Atan(double X);
	LEGENDRISING_API double Atan2(double Y, double X);
	LEGENDRISING_API double Asin(double X);
	LEGENDRISING_API double Acos(double X);

	// detmath.js hypot (line 252): the plain square root of the sum of squares, summed left to right.
	// (Out of line on purpose: an inline body would be compiled with the including file's float settings, which may
	// fuse a*a + b*b into one multiply-add and change the last bit.)
	LEGENDRISING_API double Hypot(double A, double B);
	LEGENDRISING_API double Hypot(double A, double B, double C);
}
