// LRMovementComponent.cpp: see the header.

#include "LRMovementComponent.h"

#include "GameFramework/Character.h"
#include "GameFramework/Controller.h"
#include "LRPlayerUnits.h"

ULRMovementComponent::ULRMovementComponent()
{
	// The mover owns the facing: no orient-to-movement, no controller-desired rotation (PhysicsRotation is replaced).
	bOrientRotationToMovement = false;
	bUseControllerDesiredRotation = false;
	// The mover's own top speed is about 9.4 m/s at pace 99 (more with grip boots and boosted skills); nothing in the
	// CharacterMovementComponent may clamp below it. GetMaxSpeed reports the mover's real top for AI and navigation.
	MaxWalkSpeed = 1200.f;
	MaxAcceleration = 10000.f;
	BrakingDecelerationWalking = 750.f;      // only used with bDriveWithMoverModel off or in the air
	GroundFriction = 8.f;
	bCanWalkOffLedges = true;
}

void ULRMovementComponent::BeginPlay()
{
	Super::BeginPlay();
	RebuildParams();
	ResetSimFromActor();
	Body.T = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0;
	Body.StepIndex = 0;
	bSimReady = true;
}

void ULRMovementComponent::RebuildParams()
{
	LRMove::FMoverSkills S;
	S.Pace = Skills.Pace;
	S.SprintSpeed = Skills.SprintSpeed;
	S.Acceleration = Skills.Acceleration;
	S.Dribbling = Skills.Dribbling;
	S.Agility = Skills.Agility;
	S.bGripBoots = Skills.bGripBoots;
	Body.Skills = S;
	Body.RebuildParams();
	LRMove::FControlLayer::ApplyViewOverlay(Body.P, bThirdPerson);
	Body.StaminaSkill = Skills.Stamina;
	Body.EnergyFactor = LRMove::EnergyFactorOf(Skills.Energy);
	Body.Scale = BodyScale;
}

void ULRMovementComponent::ResetSimFromActor()
{
	if (!UpdatedComponent) return;
	double X, Y, Z;
	LRPlayerUnits::UnrealToSim(UpdatedComponent->GetComponentLocation(), X, Y, Z);
	const double Yaw = LRPlayerUnits::UnrealDegToSimYaw(UpdatedComponent->GetComponentRotation().Yaw);
	const double T = Body.T;
	const int64 StepIndex = Body.StepIndex;
	Body.Stamina.Init(Skills.Energy, Skills.Fatigue);
	Body.Init(X, Z, Yaw);
	LRMove::FControlLayer::ApplyViewOverlay(Body.P, bThirdPerson);
	Body.T = T;
	Body.StepIndex = StepIndex;
	Accumulator = 0.0;
	DesiredVelocity = FVector::ZeroVector;
	bCommandPending = false;
}

bool ULRMovementComponent::UsingMover() const
{
	return bDriveWithMoverModel && bSimReady && CharacterOwner != nullptr && UpdatedComponent != nullptr;
}

double ULRMovementComponent::CameraYawSim() const
{
	// P.yaw: the look's yaw. The keys are relative to it in third person, and it is the aim's way
	const AController* C = CharacterOwner ? CharacterOwner->GetController() : nullptr;
	const double YawDeg = C ? C->GetControlRotation().Yaw : (UpdatedComponent ? UpdatedComponent->GetComponentRotation().Yaw : 0.0);
	return LRPlayerUnits::UnrealDegToSimYaw(YawDeg);
}

void ULRMovementComponent::SyncFromWorld()
{
	double X, Y, Z;
	LRPlayerUnits::UnrealToSim(UpdatedComponent->GetComponentLocation(), X, Y, Z);
	if (HasAnimRootMotion() || !IsMovingOnGround())
	{
		// root motion (a strike, a slide) or the air moved the body: take its facing and its ground velocity as they are
		Body.M.Yaw = LRPlayerUnits::UnrealDegToSimYaw(UpdatedComponent->GetComponentRotation().Yaw);
		double VX, VY, VZ;
		LRPlayerUnits::UnrealToSim(FVector(Velocity.X, Velocity.Y, 0.0), VX, VY, VZ);
		Body.M.VX = VX;
		Body.M.VZ = VZ;
		Body.M.Speed = LRMove::Hypot(VX, VZ);
		if (Body.M.Speed > LRMove::SNAP_V) Body.M.Heading = LRMove::YawOf(VX, VZ);
	}
	else if (bCommandPending)
	{
		// mover.js step 7: "the body never goes anywhere collide did not answer ... the velocity after it follows the
		// slide ... never faster than before". The CharacterMovementComponent has just moved the capsule with the
		// velocity we asked for; Velocity is now what it really moved (PhysWalking sets it from the displacement). When
		// that is clearly less, the mover's speed and heading follow it.
		const FVector Asked(DesiredVelocity.X, DesiredVelocity.Y, 0.0);
		const FVector Got(Velocity.X, Velocity.Y, 0.0);
		const double AskedSize = Asked.Size();
		if (AskedSize > 1.0 && Got.Size() < 0.95 * AskedSize)
		{
			double VX, VY, VZ;
			LRPlayerUnits::UnrealToSim(Got, VX, VY, VZ);
			Body.M.VX = VX;
			Body.M.VZ = VZ;
			Body.M.Speed = LRMove::Hypot(VX, VZ);
			if (Body.M.Speed > LRMove::SNAP_V) Body.M.Heading = LRMove::YawOf(VX, VZ);
		}
	}
	Body.M.X = X;
	Body.M.Z = Z;
	bCommandPending = false;
}

void ULRMovementComponent::RunSimStep(double H)
{
	// the character (and close control) fill the per-step flags first
	OnPreSimStep.Broadcast(H);

	ControlInput.Forward = MoveAxes.Y;
	ControlInput.Right = MoveAxes.X;
	ControlInput.CameraYaw = CameraYawSim();
	ControlInput.bThirdPerson = bThirdPerson;
	ControlInput.bSprintHeld = bSprintHeld;
	ControlInput.bWalk = bWalkToggle;
	ControlInput.AccelerationSkill = Body.P.Acceleration;
	ControlInput.DribblingSkill = Skills.Dribbling;
	ControlInput.bAnalogThrottle = bAnalogThrottle;
	Body.Stamina.bInfinite = bInfiniteStamina;
	Body.Scale = BodyScale;

	LRMove::FFootfall Falls[8];
	const int32 N = Body.Advance(H, bExternalIntent ? nullptr : &ControlInput, Falls, 8);
	for (int32 I = 0; I < N; I++)
	{
		const double FT = Body.T + Falls[I].At * H;
		OnFootfallNative.Broadcast(Falls[I].Side, FT, H);
		OnFootfall.Broadcast(static_cast<ELRFoot>(Falls[I].Side), static_cast<float>(FT));
	}
	OnPostSimStep.Broadcast(H);
	Body.EndStep(H);

	DesiredVelocity = LRPlayerUnits::SimToUnreal(Body.M.VX, 0.0, Body.M.VZ);
}

void ULRMovementComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	if (UsingMover() && DeltaTime > 0.f)
	{
		SyncFromWorld();
		const double H = GetFixedStep();
		Accumulator = FMath::Min(Accumulator + static_cast<double>(DeltaTime), static_cast<double>(MaxCatchUpSeconds));
		// (the 1e-9 keeps a frame of exactly 1/60 s from waiting a frame on rounding)
		while (Accumulator + 1e-9 >= H)
		{
			RunSimStep(H);
			Accumulator -= H;
			// a step moved the core's position; the capsule follows in this frame's movement, so later steps in the same
			// frame start from where the core says it is
		}
		bCommandPending = true;
	}
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
}

void ULRMovementComponent::CalcVelocity(float DeltaTime, float Friction, bool bFluid, float BrakingDeceleration)
{
	if (!UsingMover() || HasAnimRootMotion() || !IsMovingOnGround() || DeltaTime < MIN_TICK_TIME)
	{
		Super::CalcVelocity(DeltaTime, Friction, bFluid, BrakingDeceleration);
		return;
	}
	// the mover's velocity, as it is; the capsule sweep, the steps and the floor are the CharacterMovementComponent's
	Velocity.X = DesiredVelocity.X;
	Velocity.Y = DesiredVelocity.Y;
}

void ULRMovementComponent::PhysicsRotation(float DeltaTime)
{
	if (!UsingMover() || HasAnimRootMotion())
	{
		Super::PhysicsRotation(DeltaTime);
		return;
	}
	// the body's facing is the mover's (it already turned at faceRate / turnFirstRate)
	const FRotator Current = UpdatedComponent->GetComponentRotation();
	const FRotator Desired(0.0, LRPlayerUnits::SimYawToUnrealDeg(Body.M.Yaw), 0.0);
	if (!Current.Equals(Desired, 0.01f))
	{
		MoveUpdatedComponent(FVector::ZeroVector, Desired, /*bSweep*/ false);
	}
}

float ULRMovementComponent::GetMaxSpeed() const
{
	if (!UsingMover() || !IsMovingOnGround()) return Super::GetMaxSpeed();
	// the top speed the body has now (the sprint after the stamina factors), in cm/s
	return static_cast<float>(LRMove::SprintSpeedOf(Body.P, Body.Fac) * LRPlayerUnits::CmPerMetre);
}

float ULRMovementComponent::GetHeadingYawDeg() const
{
	return static_cast<float>(LRPlayerUnits::SimYawToUnrealDeg(Body.M.Heading));
}

float ULRMovementComponent::GetFacingYawDeg() const
{
	return static_cast<float>(LRPlayerUnits::SimYawToUnrealDeg(Body.M.Yaw));
}

FVector ULRMovementComponent::GetWishDirection() const
{
	const double L = LRMove::Hypot(Body.I.DX, Body.I.DZ);
	if (L < 1e-6) return FVector::ZeroVector;
	return LRPlayerUnits::SimDirToUnreal(Body.I.DX / L, Body.I.DZ / L);
}

float ULRMovementComponent::GetStepLengthMetres() const
{
	return static_cast<float>(LRMove::Gait::StepLen(Body.M.Speed, Body.G.Mode, Body.Scale, -1.0, Body.G.CK));
}

float ULRMovementComponent::GetStepsPerMinute() const
{
	if (Body.M.Speed < 0.05) return 0.f;
	return static_cast<float>(60.0 * LRMove::Gait::Cadence(Body.M.Speed, Body.G.Mode, Body.Scale, -1.0, Body.G.CK));
}

float ULRMovementComponent::GetTimeToFootfall(ELRFoot Foot) const
{
	return static_cast<float>(Body.G.TimeToFootfall(static_cast<LRMove::EFoot>(Foot), LRMove::Max2(Body.M.Speed, 0.3), Body.Scale));
}

float ULRMovementComponent::GetSwingProgress(ELRFoot Foot) const
{
	const double Duty = LRMove::Gait::DutyOf(Body.M.Speed, Body.G.Mode, Body.G.CK);
	return static_cast<float>(Body.G.SwingProgress(static_cast<LRMove::EFoot>(Foot), Duty));
}
