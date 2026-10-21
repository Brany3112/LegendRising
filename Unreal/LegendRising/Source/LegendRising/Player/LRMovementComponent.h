// LRMovementComponent.h: the player's locomotion in Unreal, the browser game's mover.js rules (LRMoverCore) driving a
// UCharacterMovementComponent.
//
// How it fits together:
//   - The game's simulation runs at a fixed 60 Hz (FixedStepHz). Every frame this component runs as many fixed steps as
//     the frame's time allows (an accumulator), each one in sim.js agentStep's order: controls -> intent (the BCS
//     control layer: camera-relative W A S D, the smoothed wish, the walk/jog/run/sprint ladder, the held facings),
//     mover.js moverStep (acceleration, braking, plant/pivot, turn rates, facing), stamina, the gait clock (footfalls).
//   - The velocity the mover arrives at is handed to the CharacterMovementComponent, which moves the capsule with its
//     own sweeps, steps and floor handling (CalcVelocity is replaced, nothing else). The facing is the mover's
//     (PhysicsRotation is replaced). The world has the last word: when the capsule moved less than it was asked to (a
//     wall, another body), the mover's speed comes down to what it really moved, as mover.js's collide answer does.
//   - Footfalls are broadcast (OnFootfall, and OnFootfallNative for close control), so ball touches land on them and the
//     animation can be checked against them.
//   - Single player / listen-server host only: the fixed-step state is not replicated or predicted (see PORT-movement.md).
//
// Units: the cores work in metres and the game's frame; every value this component shows to Blueprint is converted
// (cm, degrees, Unreal axes) unless its name says metres.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "LRMoverCore.h"
#include "LRPlayerTypes.h"
#include "LRMovementComponent.generated.h"

// a foot touched down: which, and the world time of the touchdown (inside the fixed step it fell in)
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FLROnFootfallSignature, ELRFoot, Foot, float, ContactWorldTime);

// native hooks around each fixed step (C++ only: close control and the character use them)
DECLARE_MULTICAST_DELEGATE_OneParam(FLRSimStepNative, double /*StepSeconds*/);
DECLARE_MULTICAST_DELEGATE_ThreeParams(FLRFootfallNative, LRMove::EFoot /*Foot*/, double /*FootfallSimTime*/, double /*StepSeconds*/);

UCLASS(ClassGroup = (LegendRising), meta = (BlueprintSpawnableComponent))
class LEGENDRISING_API ULRMovementComponent : public UCharacterMovementComponent
{
	GENERATED_BODY()

public:
	ULRMovementComponent();

	// --- settings ------------------------------------------------------------------------------------------------

	// the player's skills (mover.js moverParams' football profile is built from them at BeginPlay and by RebuildParams)
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Movement")
	FLRPlayerSkills Skills;

	// drive the capsule with the mover model (off: plain CharacterMovementComponent behaviour)
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Movement")
	bool bDriveWithMoverModel = true;

	// third person (the default): W A S D relative to the camera, the body free to face where it runs. Off: first
	// person, the body faces the view, strafe and backpedal caps apply
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Movement")
	bool bThirdPerson = true;

	// the simulation's fixed step rate (the game's is 60; the golden tests assume it)
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Movement", meta = (ClampMin = "10", ClampMax = "240"))
	float FixedStepHz = 60.f;

	// the most time one frame may catch up (a hitch longer than this is dropped, not simulated)
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Movement", meta = (ClampMin = "0.02"))
	float MaxCatchUpSeconds = 0.25f;

	// the body's height scale (1 = the game's standard body: eyes at 1.68 m); scales the gait's steps and close control
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Movement", meta = (ClampMin = "0.5", ClampMax = "1.5"))
	float BodyScale = 1.f;

	// the admin switch: the breath pool held full
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Movement")
	bool bInfiniteStamina = false;

	// a gamepad stick's length is the throttle (the keyboard is always full)
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Movement")
	bool bAnalogThrottle = false;

	// --- events ---------------------------------------------------------------------------------------------------

	// a foot touched down (the gait clock: the same footfalls close control plays the ball on)
	UPROPERTY(BlueprintAssignable, Category = "LR|Movement")
	FLROnFootfallSignature OnFootfall;

	// C++: before each fixed step (fill GetControlInput() here), after its footfalls, and after the step
	FLRSimStepNative OnPreSimStep;
	FLRFootfallNative OnFootfallNative;
	FLRSimStepNative OnPostSimStep;

	// --- input (the character sets these from Enhanced Input) -----------------------------------------------------

	// the Move action's value: X = right (D +1, A -1), Y = forward (W +1, S -1)
	UFUNCTION(BlueprintCallable, Category = "LR|Movement")
	void SetMoveAxes(FVector2D Axes) { MoveAxes = Axes; }

	UFUNCTION(BlueprintPure, Category = "LR|Movement")
	FVector2D GetMoveAxes() const { return MoveAxes; }

	// Shift held (the sprint)
	UFUNCTION(BlueprintCallable, Category = "LR|Movement")
	void SetSprintHeld(bool bHeld) { bSprintHeld = bHeld; }

	// X: the walk toggle
	UFUNCTION(BlueprintCallable, Category = "LR|Movement")
	void ToggleWalk() { bWalkToggle = !bWalkToggle; }

	UFUNCTION(BlueprintCallable, Category = "LR|Movement")
	void SetWalk(bool bWalk) { bWalkToggle = bWalk; }

	UFUNCTION(BlueprintPure, Category = "LR|Movement")
	bool IsWalkToggled() const { return bWalkToggle; }

	// the per-step control flags (aim hold, jockey, shield, receiving...). The character fills them in OnPreSimStep;
	// the keys, Shift, the walk toggle, the camera yaw and the skills are filled by this component.
	LRMove::FControlInput& GetControlInput() { return ControlInput; }

	// the AI (or a cutscene) drives the body: the intent set with SetExternalIntent is used as it is, the controls are
	// not read
	UFUNCTION(BlueprintCallable, Category = "LR|Movement")
	void SetExternalIntentEnabled(bool bEnabled) { bExternalIntent = bEnabled; }
	void SetExternalIntent(const LRMove::FMoverIntent& Intent) { Body.I = Intent; }

	// close control tells the gait clock whether the body is carrying the ball (eased into the carrier's gait)
	void SetCarryTarget(bool bCarrying) { Body.CarryTarget = bCarrying ? 1.0 : 0.0; }

	// re-read position and facing from the actor (after a teleport or a cut)
	UFUNCTION(BlueprintCallable, Category = "LR|Movement")
	void ResetSimFromActor();

	// rebuild the mover's params from Skills (after changing them)
	UFUNCTION(BlueprintCallable, Category = "LR|Movement")
	void RebuildParams();

	// --- queries for the animation, the HUD and the camera ----------------------------------------------------------

	UFUNCTION(BlueprintPure, Category = "LR|Movement")
	float GetSpeedMetresPerSecond() const { return static_cast<float>(Body.M.Speed); }

	// the target speed of the last step (m/s): where the mover is heading
	UFUNCTION(BlueprintPure, Category = "LR|Movement")
	float GetTargetSpeedMetresPerSecond() const { return static_cast<float>(Body.M.Target); }

	UFUNCTION(BlueprintPure, Category = "LR|Movement")
	ELRGait GetGait() const { return static_cast<ELRGait>(Body.M.Gait); }

	// the gait asked for this step (the ladder's rung)
	UFUNCTION(BlueprintPure, Category = "LR|Movement")
	ELRGait GetIntentGait() const { return static_cast<ELRGait>(Body.I.Gait); }

	// how fast the heading turned in the last step (deg/s, + to the right, Unreal's sense)
	UFUNCTION(BlueprintPure, Category = "LR|Movement")
	float GetTurnRateDegPerSec() const { return static_cast<float>(-FMath::RadiansToDegrees(Body.M.TurnRate)); }

	// longitudinal acceleration of the last step (m/s^2; negative braking)
	UFUNCTION(BlueprintPure, Category = "LR|Movement")
	float GetLongitudinalAccel() const { return static_cast<float>(Body.M.Acc); }

	// a planted cut or a reversal's plant this step (the mover braking at its plant rate)
	UFUNCTION(BlueprintPure, Category = "LR|Movement")
	bool IsPlanting() const { return Body.M.Plant > 0.0; }

	// the heading error of this step's planted cut (deg, 0 if none)
	UFUNCTION(BlueprintPure, Category = "LR|Movement")
	float GetCutAngleDeg() const { return static_cast<float>(FMath::RadiansToDegrees(Body.M.Cut)); }

	// the velocity's direction (world yaw, deg) and the body's facing (world yaw, deg)
	UFUNCTION(BlueprintPure, Category = "LR|Movement")
	float GetHeadingYawDeg() const;

	UFUNCTION(BlueprintPure, Category = "LR|Movement")
	float GetFacingYawDeg() const;

	// the smoothed wish direction this step (world, unit, horizontal; zero with no keys)
	UFUNCTION(BlueprintPure, Category = "LR|Movement")
	FVector GetWishDirection() const;

	// the gait clock: phase 0..1 over a stride (left down at 0, right at 0.5), the walk/run mode, the carry weight
	UFUNCTION(BlueprintPure, Category = "LR|Movement")
	float GetGaitPhase() const { return static_cast<float>(Body.G.Phi); }

	UFUNCTION(BlueprintPure, Category = "LR|Movement")
	bool IsGaitRunMode() const { return Body.G.Mode == LRMove::EGaitMode::Run; }

	UFUNCTION(BlueprintPure, Category = "LR|Movement")
	float GetCarryWeight() const { return static_cast<float>(Body.G.CK); }

	// the step length (m) and the steps a minute the clock runs at now
	UFUNCTION(BlueprintPure, Category = "LR|Movement")
	float GetStepLengthMetres() const;

	UFUNCTION(BlueprintPure, Category = "LR|Movement")
	float GetStepsPerMinute() const;

	// seconds until this foot next touches down at the present speed
	UFUNCTION(BlueprintPure, Category = "LR|Movement")
	float GetTimeToFootfall(ELRFoot Foot) const;

	// how far through its swing a foot is (0 lift-off .. 1 touchdown), or -1 while it is on the ground
	UFUNCTION(BlueprintPure, Category = "LR|Movement")
	float GetSwingProgress(ELRFoot Foot) const;

	// the footfall counter
	UFUNCTION(BlueprintPure, Category = "LR|Movement")
	int32 GetFootfallCount() const { return static_cast<int32>(Body.G.N); }

	// the breath (0..cap) and the stamina factors' speed share
	UFUNCTION(BlueprintPure, Category = "LR|Movement")
	float GetBreath() const { return static_cast<float>(Body.Stamina.B); }

	UFUNCTION(BlueprintPure, Category = "LR|Movement")
	float GetBreathFactor() const { return static_cast<float>(Body.Fac.BF); }

	// the mover's sim clock (world-time based: it starts at the world time at BeginPlay and runs by fixed steps)
	double GetSimTime() const { return Body.T; }
	int64 GetSimStepIndex() const { return Body.StepIndex; }
	double GetFixedStep() const { return 1.0 / FMath::Max(10.0, static_cast<double>(FixedStepHz)); }

	// the whole core state (read-only), for close control and the tests
	const LRMove::FBodySim& GetBody() const { return Body; }

protected:
	virtual void BeginPlay() override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;
	virtual void CalcVelocity(float DeltaTime, float Friction, bool bFluid, float BrakingDeceleration) override;
	virtual void PhysicsRotation(float DeltaTime) override;
	virtual float GetMaxSpeed() const override;

private:
	// read the capsule's real position (and, if it was held up, its real speed) into the mover
	void SyncFromWorld();
	// one fixed step of the whole pipeline
	void RunSimStep(double H);
	// the camera's yaw in the sim frame (P.yaw)
	double CameraYawSim() const;
	bool UsingMover() const;

	LRMove::FBodySim Body;
	LRMove::FControlInput ControlInput;
	FVector2D MoveAxes = FVector2D::ZeroVector;
	bool bSprintHeld = false;
	bool bWalkToggle = false;
	bool bExternalIntent = false;
	bool bSimReady = false;
	double Accumulator = 0.0;
	// the velocity the last fixed step asked for (cm/s, horizontal) and whether one was handed to the capsule since
	FVector DesiredVelocity = FVector::ZeroVector;
	bool bCommandPending = false;
};
