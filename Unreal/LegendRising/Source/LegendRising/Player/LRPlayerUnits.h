// LRPlayerUnits.h: the one place where the browser game's frame meets Unreal's.
//
//   Game (sim):  metres, seconds, radians. y is up; the ground is (x, z). Yaw 0 faces -Z, a positive yaw turns LEFT
//                (counter-clockwise from above), the facing of a yaw is (-sin yaw, -cos yaw), and the right-hand side
//                of a facing (fx, fz) is (-fz, fx). (three.js: right-handed.)
//   Unreal:      centimetres, Z up, X forward, Y right; yaw in degrees, a positive yaw turns RIGHT. (Left-handed.)
//
// The mapping keeps forward as forward, right as right and up as up:
//   Unreal.X = -sim.z * 100      Unreal.Y = sim.x * 100      Unreal.Z = sim.y * 100
//   sim.x = Unreal.Y / 100       sim.y = Unreal.Z / 100      sim.z = -Unreal.X / 100
//   Unreal yaw (deg) = -degrees(sim yaw)
// Check: sim yaw 0 faces sim -Z, which is Unreal +X (yaw 0). Sim yaw +90 deg faces sim -X (the left), which is Unreal
// -Y (yaw -90). Sim right (+X at yaw 0) is Unreal +Y.
//
// Spin (angular velocity) is a pseudovector, and this mapping is a reflection (its determinant is -1), so it changes
// sign on top of the axis swap: w_unreal = -(M w_sim) = (w.z, -w.x, -w.y). With that, a ball rolling without slipping
// satisfies v = w x (R * up) in both frames (the algebraic cross product, which is what Chaos uses), so the "spin of a
// ball rolling that way" that close control gives a touch stays a pure roll in Unreal. The ball port must agree with
// this convention (see PORT-movement.md, "Uncertain").

#pragma once

#include "CoreMinimal.h"
#include "LRMoveMath.h"

namespace LRPlayerUnits
{
	constexpr double CmPerMetre = 100.0;

	// a position or a velocity (m, m/s) in the sim frame -> Unreal (cm, cm/s)
	FORCEINLINE FVector SimToUnreal(double X, double Y, double Z)
	{
		return FVector(-Z * CmPerMetre, X * CmPerMetre, Y * CmPerMetre);
	}
	// a position or a velocity (cm, cm/s) in Unreal -> the sim frame (m, m/s)
	FORCEINLINE void UnrealToSim(const FVector& U, double& OutX, double& OutY, double& OutZ)
	{
		OutX = U.Y / CmPerMetre;
		OutY = U.Z / CmPerMetre;
		OutZ = -U.X / CmPerMetre;
	}
	// a direction on the ground (sim x, z) -> a unit-or-less Unreal direction (no scaling: it is a direction)
	FORCEINLINE FVector SimDirToUnreal(double DX, double DZ)
	{
		return FVector(-DZ, DX, 0.0);
	}
	// sim yaw (rad) -> Unreal yaw (deg) and back
	FORCEINLINE double SimYawToUnrealDeg(double SimYaw)
	{
		return -FMath::RadiansToDegrees(SimYaw);
	}
	FORCEINLINE double UnrealDegToSimYaw(double UnrealYawDeg)
	{
		return LRMove::WrapA(-FMath::DegreesToRadians(UnrealYawDeg));
	}
	// spin (rad/s): see the header comment
	FORCEINLINE FVector SimSpinToUnreal(double WX, double WY, double WZ)
	{
		return FVector(WZ, -WX, -WY);
	}
	FORCEINLINE void UnrealSpinToSim(const FVector& W, double& OutWX, double& OutWY, double& OutWZ)
	{
		OutWX = -W.Y;
		OutWY = -W.Z;
		OutWZ = W.X;
	}
}
