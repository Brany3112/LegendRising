// LRCloseControlComponent.h: automatic close control and the FC 27 carry for the player (LRCloseControlCore), wired to
// the movement component's fixed steps and footfalls and to the ball through ILRBallInterface.
//
// What it does each fixed step (sim.js agentStep's order):
//   before the mover: reads the ball (once per frame from the interface; between two fixed steps of the same frame it
//     rolls its own copy on, so a 30 fps frame's two steps see the ball move), and tells the gait clock whether the body
//     is carrying it (the carrier's quick short steps ease in over 0.15 s);
//   on each footfall: the carry's touch, if this foot's touch was planned (actions.js dribbleFoot -> carryFoot), then the
//     next touch planned;
//   after the footfalls: keepStep (automatic entry, the exits, the knock-on, the spot's touches when standing or turning).
// Every touch goes to the ball as ILRBallInterface::Kick(velocity, spin) and is announced with OnTouch(foot, part,
// contact time). GetNextPlannedTouch() says which foot will meet the ball when, and where, for foot IK.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "LRCloseControlCore.h"
#include "LRPlayerTypes.h"
#include "LRCloseControlComponent.generated.h"

class ILRBallInterface;
class ULRMovementComponent;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FLROnTouchSignature, ELRFoot, Foot, ELRFootPart, Part, float, ContactTime);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FLROnCloseControlChangedSignature, bool, bInCloseControl, ELRCloseControlEnd, EndReason);

UCLASS(ClassGroup = (LegendRising), meta = (BlueprintSpawnableComponent))
class LEGENDRISING_API ULRCloseControlComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	ULRCloseControlComponent();

	// the ball: an actor implementing ILRBallInterface
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|CloseControl")
	TObjectPtr<AActor> BallActor;

	// the strong foot carries, turns and shoots (a.foot)
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|CloseControl")
	ELRStrongFoot StrongFoot = ELRStrongFoot::Right;

	// with no possession system answering (GetPossessor null), a ball nobody has counts as yours: close control takes
	// it whenever you reach it (the race of actions.js is not part of this port)
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|CloseControl")
	bool bAssumeUnownedBallIsMine = true;

	// the height on the ball the touching face meets (cm above the grass): the lower third (fc27-spec 2.3: 3 to 8 cm)
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|CloseControl")
	float ContactHeightCm = 5.5f;

	// a touch was made: the foot, the part of it, and the world time of the contact
	UPROPERTY(BlueprintAssignable, Category = "LR|CloseControl")
	FLROnTouchSignature OnTouch;

	// close control began or ended (and why it ended)
	UPROPERTY(BlueprintAssignable, Category = "LR|CloseControl")
	FLROnCloseControlChangedSignature OnCloseControlChanged;

	UFUNCTION(BlueprintCallable, Category = "LR|CloseControl")
	void SetBall(AActor* InBall) { BallActor = InBall; BallFrame = MAX_uint64; }

	UFUNCTION(BlueprintPure, Category = "LR|CloseControl")
	bool IsInCloseControl() const { return Core.bCtlOn; }

	UFUNCTION(BlueprintPure, Category = "LR|CloseControl")
	ELRCloseControlEnd GetLastEndReason() const { return static_cast<ELRCloseControlEnd>(Core.End); }

	// chasing a knocked-on or flicked ball (Shift held keeps you out of close control until you let go)
	UFUNCTION(BlueprintPure, Category = "LR|CloseControl")
	bool IsChasingKnockOn() const { return Core.bChase; }

	// the ball is the player's by the race (ms.poss.ctl === me)
	UFUNCTION(BlueprintPure, Category = "LR|CloseControl")
	bool IsBallMine() const;

	// somebody else has it
	UFUNCTION(BlueprintPure, Category = "LR|CloseControl")
	bool IsBallOthers() const;

	// the next touch close control has planned (for foot IK and the animation)
	UFUNCTION(BlueprintPure, Category = "LR|CloseControl")
	FLRPlannedTouch GetNextPlannedTouch() const;

	UFUNCTION(BlueprintPure, Category = "LR|CloseControl")
	FLRTouchEvent GetLastTouch() const { return LastTouch; }

	// Shift tapped twice: the knock-on, made on the next fixed step if the ball is yours and within 1.8 m
	UFUNCTION(BlueprintCallable, Category = "LR|CloseControl")
	void RequestKnockOn() { Core.bKnockRequested = true; }

	// the flick (the middle button) was launched from your feet: close control ends ('flick') and the chase begins
	UFUNCTION(BlueprintCallable, Category = "LR|CloseControl")
	void NotifyFlickStarted() { Core.NotifyFlick(); }

	// your own strike (a shot, a pass...): not taken back into close control within AUTO.OWN_T (1 s)
	UFUNCTION(BlueprintCallable, Category = "LR|CloseControl")
	void NotifyOwnStrike(FName Kind);

	// your first touch of a received ball: close control waits AUTO.FIRST_T (0.2 s) before gathering it
	UFUNCTION(BlueprintCallable, Category = "LR|CloseControl")
	void NotifyFirstTouch();

	// an action of yours began (Kind: "kick", "tackle", "flick", "header", "fake"...): anything but a header or a fake
	// ends close control; bStepIn: you are stepping in to strike it (no touch of the carry's meanwhile)
	UFUNCTION(BlueprintCallable, Category = "LR|CloseControl")
	void NotifyActionStarted(FName Kind, bool bStepIn);

	UFUNCTION(BlueprintCallable, Category = "LR|CloseControl")
	void NotifyActionFinished();

	UFUNCTION(BlueprintPure, Category = "LR|CloseControl")
	bool IsActionInProgress() const { return bAction; }

	UFUNCTION(BlueprintPure, Category = "LR|CloseControl")
	FName GetActionKind() const { return ActionKind; }

	// the AI stands in for the player (ms.meAI): close control ends and is not taken
	UFUNCTION(BlueprintCallable, Category = "LR|CloseControl")
	void SetAIControlled(bool bAI) { bAIControlled = bAI; }

	// the shield is on (its own touches: close control holds on but leaves the ball alone)
	UFUNCTION(BlueprintCallable, Category = "LR|CloseControl")
	void SetShielding(bool bOn) { bShielding = bOn; }

	// distance from the body to the ball (m), and the ball as the cores see it (sim frame)
	UFUNCTION(BlueprintPure, Category = "LR|CloseControl")
	float GetBallDistanceMetres() const;
	// the ball as last read (or predicted between two fixed steps of one frame); false with no ball. Safe to call from
	// any thread that may read the component (it never reads the ball actor itself)
	bool GetBallSim(LRMove::FBallState& Out) const;
	bool HasBall() const { return GetBallInterface() != nullptr; }

	// make sure the ball has been read for the coming fixed step (idempotent within a step). The movement component's
	// pre-step hook calls it; the character calls it before reading the ball in its own pre-step hook.
	void PrepareForStep(double H);

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

private:
	void HandlePreStep(double H);
	void HandleFootfall(LRMove::EFoot Foot, double FootfallT, double H);
	void HandlePostStep(double H);
	void HandleTouch(const LRMove::FTouchRecord& Rec);

	ILRBallInterface* GetBallInterface() const;
	LRMove::FBodyView MakeBodyView() const;
	LRMove::FCtlWorld MakeWorld(double T) const;
	double FeetZ() const;
	void BroadcastIfChanged();

	LRMove::FCloseControlCore Core;
	TWeakObjectPtr<ULRMovementComponent> Move;
	FDelegateHandle PreHandle, FootHandle, PostHandle;

	// the ball as last read or predicted
	LRMove::FBallState Ball;
	uint64 BallFrame = MAX_uint64;
	int64 BallStep = -1;
	bool bBallValid = false;

	// what close control is told about the player
	bool bAIControlled = false;
	bool bShielding = false;
	bool bAction = false;
	bool bActionStepIn = false;
	FName ActionKind;
	// its own notes about the ball's last touch (when the ball keeps no record)
	LRMove::ELastKind NoteKind = LRMove::ELastKind::None;
	double NoteT = -1e9;

	FLRTouchEvent LastTouch;
	bool bWasOn = false;
};
