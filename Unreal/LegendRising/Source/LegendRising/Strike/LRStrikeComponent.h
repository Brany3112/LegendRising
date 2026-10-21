// LRStrikeComponent.h: a player's strikes in the engine: the shot (LMB held to charge, let go to strike), the flick
// (MMB held, let go) and the knock-on, carried out on the ball's fixed step exactly as the browser game's control.js and
// actions.js do (the pure cores: LRShotMeter.h, LRStrikeSolver.h).
//
// THE STEP-IN SHOT AND ITS CLOCK (actions.js STEP_IN, moves.js SHOT, plan/notes/fc27-shot.md): a shot along the ground
// at a slow ball a step away is struck 0.30 to 0.35 s after it is let go (0.29 s plus 0.07 s a metre of plant step).
// Measured from the contact C:
//     OnPlant          C - 0.20 s   the support foot down, 0.33 m beside the ball and 0.08 m behind it (along the aim);
//                                   the kicking foot's toe-off is at the same moment (SHOT.OFF 0)
//     OnBackswingTop   C - 0.10 s   the top of the backswing
//     OnContact        C            the ball is struck (the launch is in the event)
//     OnFollowThrough  C + 0.115 s  the follow-through's top (about hip height)
//     OnLand           C + 0.36 s   the kicking foot down (the act itself ends at C + 0.37 s, STEP_IN.FOLLOW)
// A montage authored with the plant at time 0 and the contact at 0.20 s plays in sync if started at OnPlant, or at
// FLRStrikeTiming::ClipStartOffset when the strike is quicker than that (a shot in the reach window, 0.10 to 0.18 s from
// the release, begins late as in the game). Every event carries the act's clock, so a montage can also be re-synced.
//
// INPUT: the game calls PressShot/ReleaseShot (LMB), PressFlick/ReleaseFlick (MMB), SetMoveKeys (W A S D),
// SetFinesseHeld (F) and RequestKnockOn (Shift tapped twice) from its own bindings, and sets AimPoint every frame (the
// point the camera looks at: the reticle). Every timing counts fixed steps of the ball, as the game counts simulation
// steps, so a replay of the same inputs on the same steps is identical.
//
// OUTPUT: the delegates below; GetMeter() for the HUD; GetSteer() for the body: during a step-in the strike steers the
// body (where to go, how fast at most, which way to face), as the game's act does through the mover's intent.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "LRShotMeter.h"
#include "LRStrikeSolver.h"
#include "LRStrikeComponent.generated.h"

class ULRBallComponent;
class ALRBall;

UENUM(BlueprintType)
enum class ELRStrikePhase : uint8
{
	Plant,
	BackswingTop,
	Contact,
	FollowThrough,
	Land
};

UENUM(BlueprintType)
enum class ELRShotGrade : uint8
{
	None,
	Perfect,
	Good,
	Scuff
};

UENUM(BlueprintType)
enum class ELRPreferredFoot : uint8
{
	Right,
	Left,
	Both
};

// one moment of the strike's clock
USTRUCT(BlueprintType)
struct LEGENDRISING_API FLRStrikeTiming
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	ELRStrikePhase Phase = ELRStrikePhase::Plant;

	// seconds since the strike was asked (the act's clock) when this fired
	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	float ActTime = 0.f;

	// the act's clock at the contact (planned until it happens), and the seconds from now to it (negative after it)
	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	float ContactTime = 0.f;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	float TimeToContact = 0.f;

	// when the moment itself was (the act's clock): before ActTime when it fired late
	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	float EventTime = 0.f;

	// fired after its moment (it was in the past when the contact became known: a quick strike begins late)
	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	bool bLate = false;

	// a step-in (0.30 to 0.35 s) or a strike in the reach window / after a stride adjust
	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	bool bStepIn = false;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	bool bLeftFoot = false;

	// the montage time to start at for a clip with the plant at 0 and the contact at 0.20 s (0 for a step-in)
	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	float ClipStartOffset = 0.f;

	// where the support foot plants (world, on the grass) and where the ball will be at the contact (world)
	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	FVector PlantLocation = FVector::ZeroVector;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	FVector BallAtContact = FVector::ZeroVector;

	// the aim, world, horizontal unit vector
	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	FVector AimDirection = FVector::ForwardVector;
};

// what a strike did to the ball
USTRUCT(BlueprintType)
struct LEGENDRISING_API FLRStrikeResult
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	bool bStruck = false;

	// the foot came through on air (the ball had gone)
	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	bool bWhiff = false;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	bool bScuffed = false;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	bool bStepIn = false;

	// launch velocity (cm/s, world) and spin (rad/s, world)
	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	FVector LaunchVelocity = FVector::ZeroVector;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	FVector LaunchSpin = FVector::ZeroVector;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	float SpeedKmh = 0.f;

	// how cleanly it was struck, 0 (a snatch) to 1 (sweet)
	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	float Clean = 0.f;

	// the deviation's sigma (radians) and whether the knuckle wobble was armed
	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	float Sigma = 0.f;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	bool bKnuckle = false;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	ELRShotGrade Grade = ELRShotGrade::None;

	// the game's words for it ("struck", "power low", "curl", "chip", ... "scuffed", "clean")
	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	FString Shape;
};

// the meter for the HUD (control.js CTRL.meter)
USTRUCT(BlueprintType)
struct LEGENDRISING_API FLRMeterState
{
	GENERATED_BODY()

	// a shot or a flick is being charged
	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	bool bOn = false;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	bool bFlick = false;

	// the charge 0..1 (shot: 1 - (1 - t/0.85)^2; flick: t/flickFull)
	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	float Charge = 0.f;

	// the shot's sweet band and its gold spot (charge units; -1 for a flick)
	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	float SweetLo = -1.f;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	float SweetHi = -1.f;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	float GoldLo = -1.f;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	float GoldHi = -1.f;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	bool bInSweet = false;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	bool bInGold = false;
};

// what the strike asks of the body this step (the game's mover intent), world units
USTRUCT(BlueprintType)
struct LEGENDRISING_API FLRStrikeSteer
{
	GENERATED_BODY()

	// the strike is steering the body now
	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	bool bActive = false;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	bool bHasDirection = false;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	FVector Direction = FVector::ZeroVector;

	// the most speed allowed, cm/s
	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	float SpeedCap = 1.e7f;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	bool bHasFacing = false;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Strike")
	float FacingYaw = 0.f;
};

// the player's attributes as the strikes read them (the game's 0..99 scales)
USTRUCT(BlueprintType)
struct LEGENDRISING_API FLRStrikeAttributes
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Strike")
	float ShotPower = 70.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Strike")
	float ShotAccuracy = 70.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Strike")
	float PassAccuracy = 70.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Strike")
	float Passing = 70.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Strike")
	float Curve = 60.f;

	// the clean strike skill (ball.js dragMul = 1 - 0.0045 aero)
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Strike")
	float Aero = 50.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Strike")
	float Composure = 60.f;

	// Ball Control: how fast the flick bar fills, and Technique
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Strike")
	float BallControl = 60.f;

	// Strength: how high a flick goes
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Strike")
	float Strength = 60.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Strike")
	bool bStrikeBoots = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Strike")
	ELRPreferredFoot PreferredFoot = ELRPreferredFoot::Right;

	// the body's top speed (m/s; the knock-on outruns it) and its size (the reach scales with it)
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Strike")
	float SprintSpeed = 8.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Strike")
	float BodyScale = 1.f;

	// breath and energy, 0..1 (stamina.js bF, eF), and the stamina power factor (absent: 1)
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Strike")
	float Breath = 1.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Strike")
	float Energy = 1.f;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FLRStrikePhaseSignature, const FLRStrikeTiming&, Timing);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FLRStrikeResultSignature, const FLRStrikeResult&, Result);

UCLASS(ClassGroup = (LegendRising), meta = (BlueprintSpawnableComponent))
class LEGENDRISING_API ULRStrikeComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	ULRStrikeComponent();

	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

	// ---------- set up ----------

	// the ball to strike (its ULRBallComponent drives this component's steps)
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Strike")
	TObjectPtr<ALRBall> Ball;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Strike")
	FLRStrikeAttributes Attributes;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Strike")
	int32 AgentId = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Strike")
	int32 TeamId = 0;

	// the assists (control.js SET.assist): 1 on, 0.5 low, 0 off. A shot let go in the sweet band is clean with them.
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Strike", meta = (ClampMin = "0", ClampMax = "1"))
	float AssistLevel = 1.f;

	// the lesson's contact (control.js CTRL.contact): -1 Low, 0 Normal, 1 High
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Strike", meta = (ClampMin = "-1", ClampMax = "1"))
	int32 Contact = 0;

	// ---------- what the game tells it every frame ----------

	// the point the player looks at (the reticle), world
	UPROPERTY(BlueprintReadWrite, Category = "LR|Strike")
	FVector AimPoint = FVector::ZeroVector;

	// the look is on the goal mouth (a shot), else a lofted ball goes to the point (a cross or a lob)
	UPROPERTY(BlueprintReadWrite, Category = "LR|Strike")
	bool bAimOnGoal = true;

	UPROPERTY(BlueprintReadWrite, Category = "LR|Strike")
	bool bAimInBox = false;

	// a scuffed shot's aim lerps a quarter of the way toward this (the goal's centre, 1 m up), world
	UPROPERTY(BlueprintReadWrite, Category = "LR|Strike")
	FVector GoalCentre = FVector::ZeroVector;

	// the ball is his (else a strike is first time)
	UPROPERTY(BlueprintReadWrite, Category = "LR|Strike")
	bool bInControl = true;

	// the nearest opponent's closeness, 0 at 3 m or more, 1 at contact (actions.js pressureOn)
	UPROPERTY(BlueprintReadWrite, Category = "LR|Strike")
	float Pressure = 0.f;

	// a set piece: the ball is walked up to (no step-in, a generous stride adjust)
	UPROPERTY(BlueprintReadWrite, Category = "LR|Strike")
	bool bDeadBall = false;

	// ---------- input ----------

	UFUNCTION(BlueprintCallable, Category = "LR|Strike")
	void PressShot();

	UFUNCTION(BlueprintCallable, Category = "LR|Strike")
	void ReleaseShot();

	UFUNCTION(BlueprintCallable, Category = "LR|Strike")
	void PressFlick();

	UFUNCTION(BlueprintCallable, Category = "LR|Strike")
	void ReleaseFlick();

	// W A S D held now (the shot reads the keys held within the last 0.25 s as it is let go)
	UFUNCTION(BlueprintCallable, Category = "LR|Strike")
	void SetMoveKeys(bool bW, bool bA, bool bS, bool bD);

	// F held: a finesse shot
	UFUNCTION(BlueprintCallable, Category = "LR|Strike")
	void SetFinesseHeld(bool bHeld);

	// the mouse gestures through a release: a lift chips it, a flick down dips it (topspin)
	UFUNCTION(BlueprintCallable, Category = "LR|Strike")
	void SetReleaseGesture(bool bLift, bool bDip);

	// Shift tapped twice: knock the ball 9 m on along MoveDirection (world; zero: the facing), if within 1.8 m
	UFUNCTION(BlueprintCallable, Category = "LR|Strike")
	void RequestKnockOn(FVector MoveDirection);

	// ---------- output ----------

	UPROPERTY(BlueprintAssignable, Category = "LR|Strike")
	FLRStrikePhaseSignature OnPlant;

	UPROPERTY(BlueprintAssignable, Category = "LR|Strike")
	FLRStrikePhaseSignature OnBackswingTop;

	UPROPERTY(BlueprintAssignable, Category = "LR|Strike")
	FLRStrikePhaseSignature OnContact;

	UPROPERTY(BlueprintAssignable, Category = "LR|Strike")
	FLRStrikePhaseSignature OnFollowThrough;

	UPROPERTY(BlueprintAssignable, Category = "LR|Strike")
	FLRStrikePhaseSignature OnLand;

	// the strike's outcome, on the contact step (after OnContact)
	UPROPERTY(BlueprintAssignable, Category = "LR|Strike")
	FLRStrikeResultSignature OnStrike;

	// a flick or a knock-on touched the ball (LaunchVelocity, LaunchSpin, Shape: "keepy", "rainbow", "knock", ...)
	UPROPERTY(BlueprintAssignable, Category = "LR|Strike")
	FLRStrikeResultSignature OnTouch;

	UFUNCTION(BlueprintPure, Category = "LR|Strike")
	FLRMeterState GetMeter() const { return Meter; }

	UFUNCTION(BlueprintPure, Category = "LR|Strike")
	FLRStrikeSteer GetSteer() const { return Steer; }

	UFUNCTION(BlueprintPure, Category = "LR|Strike")
	bool IsStriking() const { return bKickOn || bFlickOn; }

	// the shot's sweet band for a strike DistanceCm away with this player's Technique and the assists (for the HUD)
	UFUNCTION(BlueprintPure, Category = "LR|Strike")
	FLRMeterState GetMeterBandFor(float DistanceCm) const;

	// seconds the flick bar takes to fill for this player (control.js flickFull)
	UFUNCTION(BlueprintPure, Category = "LR|Strike")
	float GetFlickFullTime() const;

private:
	// one fixed step of the ball's clock (bound to ULRBallComponent::OnPreFixedStep)
	void OnFixedStep(double H, double NowT, int32 StepIndex);
	void StartShot(double Held, double NowT, int32 StepIndex);
	void StartFlickAct(double Held, double NowT);
	void FlickStep(double H, double NowT, int32 StepIndex);
	void KnockOnNow(double NowT);
	void UpdateMeter(double NowT);
	void FirePhases(bool bContactNow);
	void FirePhase(ELRStrikePhase Phase, double EventTime, bool bForce);
	LRStrike::FBody ReadBody() const;
	LRStrike::FStriker ReadStriker() const;
	LRStrike::FKickEnv MakeEnv(double NowT, int32 StepIndex);
	FLRStrikeSteer ToWorldSteer(const LRStrike::FKickSteer& S) const;
	double TechniqueOf() const;
	bool KeyRecent(double KeyT, double NowT) const;

	// (the ball actor's component, held weakly: the Ball UPROPERTY keeps the actor alive)
	TWeakObjectPtr<ULRBallComponent> BallComp;
	FDelegateHandle StepHandle;

	// input, applied on the next fixed step
	bool bLmb = false, bMmb = false;
	double LmbT = 0, MmbT = 0;
	bool bShotReleaseQueued = false, bFlickReleaseQueued = false;
	double QueuedShotHeld = 0, QueuedFlickHeld = 0;
	bool bKeyW = false, bKeyA = false, bKeyS = false, bKeyD = false;
	double KeyTW = -1e9, KeyTA = -1e9, KeyTS = -1e9, KeyTD = -1e9;
	bool bFinesseHeld = false, bLiftGesture = false, bDipGesture = false;
	bool bKnockQueued = false;
	FVector KnockDir = FVector::ZeroVector;

	// the kick act
	bool bKickOn = false;
	LRStrike::FKickAct Act;
	LRMeter::FShotReleaseOut Release;
	uint8 PhasesFired = 0;      // bit per ELRStrikePhase
	double ContactActT = 0;
	// the plant, the ball and the aim as they were at the contact (for the follow-through and the landing)
	bool bHaveContactPlace = false;
	FVector ContactPlant = FVector::ZeroVector, ContactBall = FVector::ZeroVector, ContactAim = FVector::ForwardVector;

	// the flick act (actions.js startFlick/flickStep)
	bool bFlickOn = false;
	double FlickT = 0, FlickTc = 0, FlickDur = 0, FlickP = 0;
	int32 FlickFwd = 0, FlickSide = 0;
	bool bFlickFirst = false, bFlickDone = false;
	LRStrike::FDir2 FlickFace;

	FLRMeterState Meter;
	FLRStrikeSteer Steer;
};
