// LRBallInterface.h: how the player's movement and close control talk to the ball, so they compile without the ball's
// code. The ball actor (or its component's owner) implements this; ULRCloseControlComponent finds it on BallActor.
//
// Units are Unreal's: centimetres, cm/s, rad/s about the world axes (see LRPlayerUnits.h for the spin convention).
//
// Only the first three are required. The rest have defaults that let close control work in a training scene with a
// single player and nothing else: the ball always free and in play, nobody's by the race (close control then counts it
// as the player's whenever he reaches it, ULRCloseControlComponent::bAssumeUnownedBallIsMine), the grass's roll
// 1.1 m/s^2, no last-touch record (close control still remembers its own touches and what it is told through
// NotifyOwnStrike / NotifyFirstTouch).
//
// Note: AActor also has a virtual GetVelocity() const with the same signature. A ball actor that implements this
// interface overrides both with one function (return the ball's physics velocity), which is what both callers want.

#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "LRBallInterface.generated.h"

UINTERFACE(MinimalAPI, meta = (CannotImplementInterfaceInBlueprint))
class ULRBallInterface : public UInterface
{
	GENERATED_BODY()
};

class LEGENDRISING_API ILRBallInterface
{
	GENERATED_BODY()

public:
	// the ball's centre (cm, world)
	virtual FVector GetLocation() const = 0;
	// the ball's velocity (cm/s, world)
	virtual FVector GetVelocity() const = 0;
	// play the ball: set its velocity (cm/s) and its spin (rad/s, world axes) as they are now, from where it is. Close
	// control's touches are all ground touches (no vertical speed): a push, a turn with side spin, a sole stop, a
	// knock-on.
	virtual void Kick(const FVector& Velocity, const FVector& Spin) = 0;

	// --- optional (defaults for a lone training scene) -------------------------------------------------------------

	// ball.state === 'free': not held by a keeper, not dead
	virtual bool IsFree() const { return true; }
	// ms.phase === 'live'
	virtual bool IsInPlay() const { return true; }
	// the race's answer (actions.js looseBall / contest: ms.poss.ctl): who the ball is with, or null for nobody
	virtual AActor* GetPossessor() const { return nullptr; }
	// the grass's rolling deceleration (cm/s^2); the quadratic drag (0.0135 per metre) is close control's own
	virtual float GetRollDeceleration() const { return 110.f; }
	// ball.last: who touched it last, the kind of touch ("dribble", "control" for a first touch, "shot", "pass",
	// "through", "cross", "lob", "clear", "roll", "punt", "header", "throw", "kick" for a strike, "deflect"), and when
	// (world seconds). Returns false when the ball keeps no such record.
	virtual bool GetLastTouch(AActor*& OutBy, FName& OutKind, double& OutWorldTime) const { return false; }
	// told after every Kick from close control: who played it and how ("dribble")
	virtual void NotifyTouchedBy(AActor* By, FName Kind) {}
};
