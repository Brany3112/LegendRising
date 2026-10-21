// LRMoveMath.h: the small maths every movement core file shares (header only, plain C++).
//
// The cores (LRGaitTables, LRMoverCore, LRCloseControlCore) work in the browser game's own frame and units, so that
// they read line for line like the JavaScript they port and the golden numbers from it apply as they are:
//   metres, seconds, radians; y up; the ground plane is (x, z); yaw 0 faces -Z; a positive yaw turns to the LEFT
//   (counter-clockwise seen from above); the facing of a yaw is dirOf(yaw) = (-sin yaw, -cos yaw); the right-hand side
//   of a facing (fx, fz) is (-fz, fx).
// Conversion to Unreal (centimetres, Z up, X forward, yaw in degrees turning right) happens only at the edge, in
// LRPlayerUnits.h.
//
// These helpers live in a named namespace (not an anonymous one or file statics) so that Unreal's unity builds, which
// glue several .cpp files together, never see two definitions of the same name.

#pragma once

#include <cmath>

namespace LRMove
{
	constexpr double Pi = 3.14159265358979323846;
	constexpr double Deg = Pi / 180.0;

	inline double Clamp(double V, double A, double B) { return V < A ? A : (V > B ? B : V); }
	inline double Min2(double A, double B) { return A < B ? A : B; }
	inline double Max2(double A, double B) { return A > B ? A : B; }
	inline double Lerp(double A, double B, double T) { return A + (B - A) * T; }

	// smoothstep from A to B (mover.js, gaitcore.js sstep)
	inline double SStep(double A, double B, double X)
	{
		const double T = Clamp((X - A) / (B - A), 0.0, 1.0);
		return T * T * (3.0 - 2.0 * T);
	}

	// pitchspec.js wrapA: an angle brought into [-pi, pi). Written as the JS does it (fmod keeps the sign of the
	// dividend, exactly like JavaScript's %), so the same input gives the same output.
	inline double WrapA(double A)
	{
		A = std::fmod(A + Pi, 2.0 * Pi);
		return A < 0.0 ? A + Pi : A - Pi;
	}

	// pitchspec.js yawOf(dx, dz) = atan2(-dx, -dz): the yaw that faces along (dx, dz)
	inline double YawOf(double DX, double DZ) { return std::atan2(-DX, -DZ); }
	// pitchspec.js dirOf(yaw): the facing of a yaw, as (x, z)
	inline double DirX(double Yaw) { return -std::sin(Yaw); }
	inline double DirZ(double Yaw) { return -std::cos(Yaw); }

	inline double Hypot(double A, double B) { return std::sqrt(A * A + B * B); }

	// a plain (x, z) pair on the ground plane, in metres
	struct FPlane2
	{
		double X = 0.0;
		double Z = 0.0;
		FPlane2() = default;
		FPlane2(double InX, double InZ) : X(InX), Z(InZ) {}
	};
}
