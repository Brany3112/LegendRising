// LRPlayerTypes.h: the Blueprint-facing enums and structs of the player port. Each enum has the same order as its
// plain C++ twin in the cores (LRGaitTables.h, LRMoverCore.h, LRCloseControlCore.h), so they convert with a cast.

#pragma once

#include "CoreMinimal.h"
#include "LRPlayerTypes.generated.h"

// which foot (LRMove::EFoot)
UENUM(BlueprintType)
enum class ELRFoot : uint8
{
	Left,
	Right
};

// the gait the mover ran this step (LRMove::EGait)
UENUM(BlueprintType)
enum class ELRGait : uint8
{
	Stand,
	Walk,
	Jog,
	Run,
	Sprint
};

// the part of the foot a touch is made with (LRMove::EFootPart)
UENUM(BlueprintType)
enum class ELRFootPart : uint8
{
	None,
	Toe,      // the toe of a nearly flat foot as it lands (the carry's push, FC 27)
	Laces,    // close control's spot touch and the knock-on
	Inside,   // turning to the weak side with the strong foot
	Outside,  // turning to the strong side with the strong foot
	Sole      // a stop: the sole on top of the ball
};

// which side of the ball the foot meets (LRMove::EBallSide)
UENUM(BlueprintType)
enum class ELRBallSide : uint8
{
	Back,
	Left,
	Right
};

// why a touch was made (LRMove::ETouchWhy)
UENUM(BlueprintType)
enum class ELRTouchWhy : uint8
{
	None,
	Gather,    // the touch that takes the ball into close control
	Spot,      // close control's position controller (standing, slow, turning on the spot)
	Carry,     // a carry push on a strong-foot footfall
	Run,       // a sprint's push and run (two strides on)
	Turn,      // a turn played with the inside or outside
	Stop,      // a sole stop
	WeakSide,  // the weak foot, the ball on its side (after a turn) or the strong foot could not reach it
	Overrun,   // the weak foot, the strong foot would have come down on top of it
	Across,    // the strong foot comes down beside it (no touch) and the weak foot plays it next
	Knock      // the knock-on (Shift twice)
};

// why close control ended (LRMove::ECtlEnd)
UENUM(BlueprintType)
enum class ELRCloseControlEnd : uint8
{
	None,
	Stop,    // play stopped
	Action,  // a kick, a tackle or another action of his began
	Lost,    // somebody else has the ball (a tackle won, a poke, a foul)
	Reach,   // the ball went out of reach, in the air or dead
	Knock,   // the knock-on (Shift twice)
	Flick,   // the flick (the middle button)
	AI       // the AI stands in for the player
};

// the player's strong foot (LRMove::EStrongFoot)
UENUM(BlueprintType)
enum class ELRStrongFoot : uint8
{
	Right,
	Left,
	Both    // two-footed: the right carries
};

// what a held mouse button is charging
UENUM(BlueprintType)
enum class ELRChargeKind : uint8
{
	None,
	Shot,
	Pass,
	Flick
};

// The player's skills as movement and close control read them (1..110; a negative value means "not given": Sprint
// Speed and Acceleration fall back to Pace, Agility to (Acceleration + Dribbling) / 2)
USTRUCT(BlueprintType)
struct FLRPlayerSkills
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Skills")
	float Pace = 50.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Skills")
	float SprintSpeed = -1.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Skills")
	float Acceleration = -1.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Skills")
	float Dribbling = 50.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Skills")
	float Agility = -1.f;

	// Ball Control (attrs ctrl): how fast the flick's bar fills
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Skills")
	float BallControl = 50.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Skills")
	float Stamina = 50.f;

	// career energy 0..100 (the breath pool's cap and the energy factor) and fatigue 0..100
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Skills")
	float Energy = 100.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Skills")
	float Fatigue = 0.f;

	// grip boots: x1.03 on the sprint
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Skills")
	bool bGripBoots = false;
};

// The next touch close control has planned (actions.js a.cplan), for the animation: which foot comes down on the ball
// when, with which part, and where to put it. Read it every frame (ULRCloseControlComponent::GetNextPlannedTouch).
USTRUCT(BlueprintType)
struct FLRPlannedTouch
{
	GENERATED_BODY()

	// a plan exists (in close control on the move)
	UPROPERTY(BlueprintReadOnly, Category = "LR|Touch")
	bool bValid = false;

	// that foot plays the ball; false: it comes down beside or just behind it without a touch
	UPROPERTY(BlueprintReadOnly, Category = "LR|Touch")
	bool bWillTouch = false;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Touch")
	ELRFoot Foot = ELRFoot::Right;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Touch")
	ELRFootPart Part = ELRFootPart::Toe;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Touch")
	ELRTouchWhy Why = ELRTouchWhy::None;

	// the gait clock's footfall number the touch is planned for (the movement component counts footfalls)
	UPROPERTY(BlueprintReadOnly, Category = "LR|Touch")
	int32 FootfallIndex = 0;

	// seconds from now until that foot comes down (the gait clock run on at the body's speed)
	UPROPERTY(BlueprintReadOnly, Category = "LR|Touch")
	float TimeToContact = 0.f;

	// the world time (UWorld::GetTimeSeconds base) of the contact
	UPROPERTY(BlueprintReadOnly, Category = "LR|Touch")
	double ContactWorldTime = 0.0;

	// where the ball's centre will be at the contact (cm, world), rolling on as it rolls now
	UPROPERTY(BlueprintReadOnly, Category = "LR|Touch")
	FVector PredictedBallLocation = FVector::ZeroVector;

	// the way the touch plays the ball (unit, world, horizontal)
	UPROPERTY(BlueprintReadOnly, Category = "LR|Touch")
	FVector PlayDirection = FVector::ForwardVector;

	// where the touching face of the foot should be at the contact (cm, world): the toe tip TOE_BACK (10.5 cm) behind the
	// ball's centre along the play direction, the inside or outside FACE_BACK (8.5 cm) behind it, low on the ball (the
	// lower third); a sole on top of it (gait.js touchLanding's numbers)
	UPROPERTY(BlueprintReadOnly, Category = "LR|Touch")
	FVector FootFaceTarget = FVector::ZeroVector;

	// the foot's yaw at the contact (deg, world): the play direction, turned up to 0.6 rad (TOUCH_YAW) so the inside or
	// outside face looks along it
	UPROPERTY(BlueprintReadOnly, Category = "LR|Touch")
	float FootYawDeg = 0.f;
};

// One touch made, as OnTouch reports it, with the rest of the record (ULRCloseControlComponent::GetLastTouch)
USTRUCT(BlueprintType)
struct FLRTouchEvent
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "LR|Touch")
	ELRFoot Foot = ELRFoot::Right;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Touch")
	ELRFootPart Part = ELRFootPart::Toe;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Touch")
	ELRBallSide BallSide = ELRBallSide::Back;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Touch")
	ELRTouchWhy Why = ELRTouchWhy::None;

	// world time of the contact (a footfall touch: the footfall's own time inside the step)
	UPROPERTY(BlueprintReadOnly, Category = "LR|Touch")
	double ContactWorldTime = 0.0;

	// where the ball was when it was played (cm, world)
	UPROPERTY(BlueprintReadOnly, Category = "LR|Touch")
	FVector BallLocation = FVector::ZeroVector;

	// the velocity (cm/s) and spin (rad/s, Unreal axes) handed to the ball
	UPROPERTY(BlueprintReadOnly, Category = "LR|Touch")
	FVector KickVelocity = FVector::ZeroVector;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Touch")
	FVector Spin = FVector::ZeroVector;
};
