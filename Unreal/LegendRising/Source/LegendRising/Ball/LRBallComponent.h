// LRBallComponent.h: the ball of js/life/football/ball.js in the engine.
//
// The physics is the pure core in LRBallCore.h (bit-exact with the browser game, see PORT-ball.md), stepped here at a
// fixed rate (60 Hz, the game's own) from an accumulator, never with Chaos: the owner's transform is only drawn from
// the simulated state (interpolated between the last two steps) and the mesh is turned by the simulated spin.
//
// One fixed step, in the order of the game's simStep (sim.js lines 419-571):
//   1. OnPreFixedStep (native): strikers act (ULRStrikeComponent: charges, step-ins, contacts) and may kick the ball;
//   2. the ball steps (bodies and hands as set for this step);
//   3. its events are broadcast (OnBallEvent) and the path cache is refreshed after a bounce, a post, a bar, a board or
//      a body, then every 6 steps while it flies with spin and every 30 otherwise (sim.js lines 395-396, 490-491);
//   4. the clock advances.
//
// The ball lives in the sim frame (metres, y up); SimFrameToWorld places that frame in the world. See LRUnits.h for the
// axis map. Everything in this component's Blueprint API is in Unreal units (cm, cm/s, world space, rad/s for spin).

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "LRBallCore.h"
#include "LRBallComponent.generated.h"

UENUM(BlueprintType)
enum class ELRBallEventType : uint8
{
	Touch,
	Bounce,
	Post,
	Bar,
	Board,
	Body,
	Wall
};

UENUM(BlueprintType)
enum class ELRBallColliderKind : uint8
{
	Post,
	Bar,
	Board
};

// one event of the ball (ball.js 1.4.10), in world units
USTRUCT(BlueprintType)
struct LEGENDRISING_API FLRBallEventInfo
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "LR|Ball")
	ELRBallEventType Type = ELRBallEventType::Touch;

	// the sim clock at the moment it happened (inside the step), seconds
	UPROPERTY(BlueprintReadOnly, Category = "LR|Ball")
	float SimTime = 0.f;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Ball")
	FVector Location = FVector::ZeroVector;

	// the normal speed of approach (collisions), m/s
	UPROPERTY(BlueprintReadOnly, Category = "LR|Ball")
	float ImpactSpeed = 0.f;

	// a bounce's vertical speed into the ground, m/s, and the restitution used
	UPROPERTY(BlueprintReadOnly, Category = "LR|Ball")
	float BounceSpeed = 0.f;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Ball")
	float Restitution = 0.f;

	// velocities in and out (cm/s, world) and the contact normal (collisions)
	UPROPERTY(BlueprintReadOnly, Category = "LR|Ball")
	FVector VelocityIn = FVector::ZeroVector;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Ball")
	FVector VelocityOut = FVector::ZeroVector;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Ball")
	FVector Normal = FVector::ZeroVector;

	// the goal end (post, bar), the body or agent and team (body, touch)
	UPROPERTY(BlueprintReadOnly, Category = "LR|Ball")
	int32 End = 0;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Ball")
	int32 Id = -1;

	UPROPERTY(BlueprintReadOnly, Category = "LR|Ball")
	int32 Team = -1;

	// body part ("legs", "torso", "head", "body", "hand") or touch kind ("shot", "pass", "flick", ...)
	UPROPERTY(BlueprintReadOnly, Category = "LR|Ball")
	FName Part;
};

// a body for the ball to hit this step (ball.js bodies(): the standing body as legs, torso and head capsules, or one
// capsule for a diving keeper), in world units
USTRUCT(BlueprintType)
struct LEGENDRISING_API FLRBallBody
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Ball")
	int32 Id = -1;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Ball")
	int32 Team = -1;

	// the root on the ground (between the feet), world
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Ball")
	FVector RootLocation = FVector::ZeroVector;

	// cm/s, world
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Ball")
	FVector Velocity = FVector::ZeroVector;

	// the body's height as a share of the game's 1.8 m man (the capsules scale with it)
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Ball")
	float HeightScale = 1.f;

	// skip it this step (the kicker stepping in, a dead ball)
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Ball")
	bool bGhost = false;

	// one capsule instead of the standing body (a keeper in a dive)
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Ball")
	bool bUseCapsule = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Ball")
	FVector CapsuleA = FVector::ZeroVector;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Ball")
	FVector CapsuleB = FVector::ZeroVector;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Ball")
	float CapsuleRadiusCm = 20.f;
};

// a hand (keeper hands, a tackling foot), world units
USTRUCT(BlueprintType)
struct LEGENDRISING_API FLRBallHand
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Ball")
	int32 Id = -1;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Ball")
	int32 Team = -1;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Ball")
	FVector Location = FVector::ZeroVector;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Ball")
	FVector Velocity = FVector::ZeroVector;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Ball")
	float RadiusCm = 10.f;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FLRBallEventSignature, const FLRBallEventInfo&, Event);

// native: called at the start of every fixed step, before the ball moves (H seconds, the clock now, the step index)
DECLARE_MULTICAST_DELEGATE_ThreeParams(FLRPreFixedStep, double /*H*/, double /*NowT*/, int32 /*StepIndex*/);

UCLASS(ClassGroup = (LegendRising), meta = (BlueprintSpawnableComponent))
class LEGENDRISING_API ULRBallComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	ULRBallComponent();

	virtual void BeginPlay() override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	// ---------- settings ----------

	// the game's fixed rate (ball.js is tuned at 60 Hz: each step is cut into sub-steps of at most 12 cm)
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "LR|Ball", meta = (ClampMin = "30", ClampMax = "240"))
	float FixedStepHz = 60.f;

	// the most fixed steps one frame may run (a long hitch drops the rest instead of spiralling)
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Ball", meta = (ClampMin = "1"))
	int32 MaxStepsPerFrame = 8;

	// the grass's rolling deceleration, m/s^2 (the pitch's pace; ball.js createBall default 1.1)
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Ball")
	float RollDecel = 1.1f;

	// where the sim frame sits in the world: its origin on the grass and its heading (rotation about Z and translation
	// only). With bOriginAtStart it is taken from the owner at BeginPlay: the origin under the ball, sim yaw 0 along
	// the owner's forward.
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Ball")
	FTransform SimFrameToWorld;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Ball")
	bool bOriginAtStart = true;

	// the seed of the generator for the spread off bodies and boards (rng.js mulberry32)
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Ball")
	int32 RngSeed = 1;

	// move the owner to the simulated ball (interpolated between the last two steps) and turn it by the spin
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Ball")
	bool bDriveOwnerTransform = true;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Ball")
	bool bInterpolate = true;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Ball")
	bool bRollMesh = true;

	// ---------- events ----------

	UPROPERTY(BlueprintAssignable, Category = "LR|Ball")
	FLRBallEventSignature OnBallEvent;

	FLRPreFixedStep& OnPreFixedStep() { return PreFixedStep; }

	// ---------- the ball, in world units ----------

	// a touch: the new velocity (cm/s, world) and spin (rad/s, world); Kind as the game's ("shot", "pass", ...);
	// Aero the striker's aero skill (0..99, a cleaner flight). Capped at 40 m/s.
	UFUNCTION(BlueprintCallable, Category = "LR|Ball")
	void KickBall(FVector VelocityCmS, FVector SpinRadS, int32 Agent = -1, int32 Team = -1, FName Kind = NAME_None, float Aero = 0.f);

	// put the ball at a world location, at rest (its centre; it is lifted to the grass if below)
	UFUNCTION(BlueprintCallable, Category = "LR|Ball")
	void PlaceBall(FVector WorldLocation);

	UFUNCTION(BlueprintPure, Category = "LR|Ball")
	FVector GetBallLocation() const;

	UFUNCTION(BlueprintPure, Category = "LR|Ball")
	FVector GetBallVelocity() const;

	UFUNCTION(BlueprintPure, Category = "LR|Ball")
	FVector GetBallSpin() const;

	UFUNCTION(BlueprintPure, Category = "LR|Ball")
	bool IsGrounded() const { return State.bGrounded; }

	UFUNCTION(BlueprintPure, Category = "LR|Ball")
	float GetSimTime() const { return static_cast<float>(SimTime); }

	UFUNCTION(BlueprintPure, Category = "LR|Ball")
	int32 GetStepIndex() const { return StepIndex; }

	// the ball's path: Samples points at SampleHz from now (world), posts and bar included, bodies not (ball.js
	// ballPredict)
	UFUNCTION(BlueprintCallable, Category = "LR|Ball")
	TArray<FVector> PredictPath(int32 Samples = 90, float SampleHz = 30.f);

	// ---------- the world the ball hits (world units) ----------

	// a post, the crossbar or a board's rounded top edge: a capsule from A to B
	UFUNCTION(BlueprintCallable, Category = "LR|Ball")
	void AddCapsuleCollider(FVector A, FVector B, float RadiusCm, ELRBallColliderKind Kind, int32 GoalEnd = 0);

	// an advertising board: the plane through PointOnFace with Normal, bounded by the box of CornerA..CornerB (the box
	// is taken in the sim frame, so the board must be square to it, as the game's are); Restitution 0.5 as the game's
	UFUNCTION(BlueprintCallable, Category = "LR|Ball")
	void AddBoardCollider(FVector PointOnFace, FVector Normal, FVector CornerA, FVector CornerB, float Restitution = 0.5f, bool bRoundedTopEdge = true);

	UFUNCTION(BlueprintCallable, Category = "LR|Ball")
	void ClearColliders();

	// the bodies and hands the ball can hit from the next step on (set them every step, e.g. from OnPreFixedStep)
	UFUNCTION(BlueprintCallable, Category = "LR|Ball")
	void SetBodies(const TArray<FLRBallBody>& Bodies);

	UFUNCTION(BlueprintCallable, Category = "LR|Ball")
	void SetHands(const TArray<FLRBallHand>& Hands);

	// ---------- native access for the strikers and tests (sim frame) ----------

	LRBall::FBallState& GetState() { return State; }
	const LRBall::FBallState& GetState() const { return State; }
	LRBall::FPredCache& GetPredCache() { return Pred; }
	LRBall::FWorld& GetPredWorld() { return PredWorld; }
	LRBall::FRng& GetRng() { return Rng; }
	double GetSimTimeD() const { return SimTime; }
	// refresh the path cache now (after a touch: actions.js refreshPred)
	void RefreshPrediction();

	FVector SimToWorld(const LRBall::FVec3& P) const;
	LRBall::FVec3 WorldToSim(const FVector& P) const;
	FVector SimVectorToWorld(const LRBall::FVec3& V) const;
	LRBall::FVec3 WorldVectorToSim(const FVector& V) const;
	FVector SimSpinToWorld(const LRBall::FVec3& W) const;
	LRBall::FVec3 WorldSpinToSim(const FVector& W) const;
	// a sim yaw (radians) to a world yaw (degrees) and back
	double SimYawToWorldDeg(double SimYaw) const;
	double WorldDegToSimYaw(double WorldYawDeg) const;

	// one fixed step by hand (tests; the component's tick calls it)
	void FixedStep(double H);

private:
	void ApplyToOwner(float Alpha, float DeltaTime);
	void RebuildPredWorld();

	LRBall::FBallState State;
	LRBall::FWorld World;
	LRBall::FWorld PredWorld;
	LRBall::FPredCache Pred;
	LRBall::FRng Rng;
	LRBall::FVec3 PrevP;
	double Accumulator = 0;
	double SimTime = 0;
	int32 StepIndex = 0;
	FQuat SpinRotation = FQuat::Identity;
	FLRPreFixedStep PreFixedStep;
};
