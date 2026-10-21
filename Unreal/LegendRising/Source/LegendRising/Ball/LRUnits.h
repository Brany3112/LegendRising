// LRUnits.h: the one place where the browser game's frame meets Unreal's.
//
//   The game (sim):   metres, seconds, radians. Right-handed: +X to the right of a body facing yaw 0, +Y up, +Z back
//                     (yaw 0 faces -Z). Yaw grows turning LEFT (toward -X). Spin w is a right-hand-rule pseudovector.
//   Unreal:           centimetres, seconds. Left-handed: +X forward, +Y right, +Z up. Yaw in degrees grows turning RIGHT.
//
// The axis map (forward stays forward, right stays right, up stays up):
//
//     UE.X = -sim.Z * 100      (sim -Z, the way yaw 0 faces, is Unreal's forward)
//     UE.Y =  sim.X * 100      (sim +X, the right of yaw 0, is Unreal's right)
//     UE.Z =  sim.Y * 100      (up is up)
//
// That map has determinant -1 (it turns a right-handed frame into Unreal's left-handed one), so an angular velocity,
// which is a pseudovector, picks up an extra minus sign:   UE.w = -(map of sim.w) = (sim.w.Z, -sim.w.X, -sim.w.Y)
// (rad/s, no scaling). With that sign, v = w x r computed with the usual cross product formula holds in both frames, so
// FQuat(w.GetSafeNormal(), |w| dt) turns the drawn ball the way it really spins.
//
// Yaw: a sim facing (dx, dz) = (-sin yaw, -cos yaw) is the Unreal direction (cos yaw, -sin yaw), so
//     UE yaw (degrees) = -sim yaw (radians) * 180/pi.
//
// The sim frame's origin and heading in the world is a separate FTransform (ULRBallComponent::SimFrameToWorld):
// "sim local" Unreal coordinates are the map above, then that transform (rotation about Z and a translation only; a
// scale or a mirror in it would break the physics' units).

#pragma once

#include "CoreMinimal.h"
#include "LRBallCore.h"

namespace LRUnits
{
	constexpr double CmPerM = 100.0;
	constexpr double MPerCm = 0.01;

	// a position or a velocity: sim metres (m/s) to Unreal centimetres (cm/s), sim-local axes
	inline FVector SimToUnreal(const LRBall::FVec3& P)
	{
		return FVector(-P.Z * CmPerM, P.X * CmPerM, P.Y * CmPerM);
	}
	inline LRBall::FVec3 UnrealToSim(const FVector& P)
	{
		LRBall::FVec3 S;
		S.X = P.Y * MPerCm;
		S.Y = P.Z * MPerCm;
		S.Z = -P.X * MPerCm;
		return S;
	}
	// a spin (rad/s): the pseudovector rule, no length scaling
	inline FVector SimSpinToUnreal(const LRBall::FVec3& W)
	{
		return FVector(W.Z, -W.X, -W.Y);
	}
	inline LRBall::FVec3 UnrealSpinToSim(const FVector& W)
	{
		LRBall::FVec3 S;
		S.X = -W.Y;
		S.Y = -W.Z;
		S.Z = W.X;
		return S;
	}
	// yaw: sim radians (0 faces -Z, + turns left) to Unreal degrees (0 faces +X, + turns right), and back
	inline double SimYawToUnrealDeg(double SimYaw)
	{
		return -SimYaw * (180.0 / UE_DOUBLE_PI);
	}
	inline double UnrealDegToSimYaw(double UnrealYawDeg)
	{
		return -UnrealYawDeg * (UE_DOUBLE_PI / 180.0);
	}
	// a horizontal direction in the sim (dx, dz) as an Unreal unit vector (sim-local axes)
	inline FVector SimDirToUnreal(double Dx, double Dz)
	{
		return FVector(-Dz, Dx, 0.0);
	}
}
