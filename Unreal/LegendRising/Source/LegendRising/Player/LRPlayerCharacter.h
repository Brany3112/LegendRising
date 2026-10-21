// LRPlayerCharacter.h: the footballer you play, in third person.
//
// What your hands do (js/life/football/control.js on bcs/controls, "BCS"):
//   W A S D   a way on the screen, relative to the camera: W away from it, S towards it, A left, D right. The body turns
//             to run that way at any speed; the walk, the jog, the run and the sprint are the same in every direction.
//             Held, a jog becomes a run after RunAfter (0.6 s at Acceleration 50, 0.3 at 90).
//   Shift     the sprint while held. Tapped twice within 0.3 s with the ball yours: the knock-on (close control ends, the
//             ball is played 9 m on; you chase it at a sprint and are back in close control once you let go of Shift).
//   X         the walk (a toggle).
//   Mouse     the look (the camera), never a limit on how you move.
//   LMB       hold to wind up a shot, let go to strike (defending: a standing tackle).
//   RMB       hold to weigh a pass, let go to play it (defending: held, the jockey: side-on, at most 3.2 m/s, facing the
//             man on the ball).
//   MMB       hold to charge the flick, let go to flick it (from your feet it ends close control).
//   C         hold to shield the ball (yours, or loose within 2.2 m): held to 0.6 of your jog, your back to the man.
//   V         nothing (the shoulder check was removed in BCS).
// The facing is held only for the jockey, the shield, and a strike being charged or struck with the ball near (facing
// the aim, the camera's way). Close control is automatic: first to a ball, it is at your feet with no key
// (ULRCloseControlComponent).
//
// The strike, the pass, the flick and the tackle themselves (actions.js startKick, startFlick, startTackle, the strike
// model) are not part of this port: their releases are announced with OnShootReleased, OnPassReleased, OnFlickReleased
// and OnTackleRequested for the game's action code.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "LRPlayerTypes.h"
#include "LRPlayerCharacter.generated.h"

class UCameraComponent;
class UInputAction;
class UInputMappingContext;
class ULRCloseControlComponent;
class ULRMovementComponent;
class USpringArmComponent;
struct FInputActionValue;

// a charged button let go: how long it was held (s) and the power or weight it reached (0..1)
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FLROnChargeReleasedSignature, float, HeldSeconds, float, Power);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FLROnPlayerRequestSignature);

UCLASS()
class LEGENDRISING_API ALRPlayerCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	ALRPlayerCharacter(const FObjectInitializer& ObjectInitializer);

	// --- components -------------------------------------------------------------------------------------------------

	// third-person camera: TP.BACK 4 m behind the head along the look, TP.UP 1.5 m above that line (matchcam.js TP)
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "LR|Camera")
	TObjectPtr<USpringArmComponent> CameraBoom;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "LR|Camera")
	TObjectPtr<UCameraComponent> FollowCamera;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "LR|CloseControl")
	TObjectPtr<ULRCloseControlComponent> CloseControl;

	// --- input assets (see CONTENT-SETUP-movement.md) -------------------------------------------------------------

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "LR|Input")
	TObjectPtr<UInputMappingContext> DefaultMappingContext;

	// Axis2D: X = right (D +1, A -1), Y = forward (W +1, S -1)
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "LR|Input")
	TObjectPtr<UInputAction> MoveAction;

	// Axis2D: mouse delta (X right, Y up)
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "LR|Input")
	TObjectPtr<UInputAction> LookAction;

	// Digital: Shift (held = sprint; two presses within KnockTapSeconds = knock-on)
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "LR|Input")
	TObjectPtr<UInputAction> SprintAction;

	// Digital: X (toggle walk)
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "LR|Input")
	TObjectPtr<UInputAction> WalkAction;

	// Digital: LMB (hold / release)
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "LR|Input")
	TObjectPtr<UInputAction> ShootAction;

	// Digital: RMB (hold / release)
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "LR|Input")
	TObjectPtr<UInputAction> PassAction;

	// Digital: MMB (hold / release)
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "LR|Input")
	TObjectPtr<UInputAction> FlickAction;

	// Digital: C (held)
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "LR|Input")
	TObjectPtr<UInputAction> ShieldAction;

	// Digital, optional: a separate jockey key (a gamepad trigger). With the keyboard the jockey is RMB held defending.
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "LR|Input")
	TObjectPtr<UInputAction> JockeyAction;

	// --- settings ---------------------------------------------------------------------------------------------------

	// the look: control.js look(), 0.0021 rad a pixel at sensitivity 1 (0.1203 deg)
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Input")
	float LookDegreesPerUnit = 0.1203f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Input", meta = (ClampMin = "0.05", ClampMax = "5"))
	float MouseSensitivity = 1.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Input")
	bool bInvertY = false;

	// the third-person camera's pitch range (matchcam.js TP.PMIN -1.1 rad, TP.PMAX 0.7 rad)
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Camera")
	float CameraPitchMinDeg = -63.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Camera")
	float CameraPitchMaxDeg = 40.f;

	// two Shift presses this close together (real seconds) are a knock-on (control.js KNOCK_TAP)
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Input")
	float KnockTapSeconds = 0.3f;

	// --- what the game tells the controls ---------------------------------------------------------------------------

	// the other side has the ball (control.js ctx 'defend'): LMB tackles, RMB jockeys, no strikes
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Context")
	bool bDefending = false;

	// the man on the ball, faced while jockeying (null: face the camera's way)
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Context")
	TObjectPtr<AActor> JockeyTarget;

	// the nearest opponent, turned away from while shielding (null: no turn)
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LR|Context")
	TObjectPtr<AActor> ShieldThreat;

	// --- what the controls tell the game ----------------------------------------------------------------------------

	UPROPERTY(BlueprintAssignable, Category = "LR|Actions")
	FLROnChargeReleasedSignature OnShootReleased;

	UPROPERTY(BlueprintAssignable, Category = "LR|Actions")
	FLROnChargeReleasedSignature OnPassReleased;

	UPROPERTY(BlueprintAssignable, Category = "LR|Actions")
	FLROnChargeReleasedSignature OnFlickReleased;

	// LMB pressed while defending
	UPROPERTY(BlueprintAssignable, Category = "LR|Actions")
	FLROnPlayerRequestSignature OnTackleRequested;

	// S pressed while a shot is held: the shot is dropped, the fake asked for (U28 fix)
	UPROPERTY(BlueprintAssignable, Category = "LR|Actions")
	FLROnPlayerRequestSignature OnFakeRequested;

	// --- state for the HUD and the animation -----------------------------------------------------------------------

	UFUNCTION(BlueprintPure, Category = "LR|Actions")
	ELRChargeKind GetChargeKind() const { return ChargeKind; }

	// the charge's fill 0..1 (a shot: 1 - (1 - t/0.85)^2; a pass: t/0.8; a flick: t/flickFull(Ball Control))
	UFUNCTION(BlueprintPure, Category = "LR|Actions")
	float GetChargePower() const;

	UFUNCTION(BlueprintPure, Category = "LR|Movement")
	ULRMovementComponent* GetLRMovement() const;

	// control.js numbers
	static float ShotPower(float HeldSeconds);
	static float PassPower(float HeldSeconds);
	static float FlickFullSeconds(float BallControl);

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
	virtual void PawnClientRestart() override;

private:
	void OnMove(const FInputActionValue& Value);
	void OnMoveCompleted(const FInputActionValue& Value);
	void OnLook(const FInputActionValue& Value);
	void OnSprintStarted(const FInputActionValue& Value);
	void OnSprintCompleted(const FInputActionValue& Value);
	void OnWalkStarted(const FInputActionValue& Value);
	void OnShootStarted(const FInputActionValue& Value);
	void OnShootCompleted(const FInputActionValue& Value);
	void OnPassStarted(const FInputActionValue& Value);
	void OnPassCompleted(const FInputActionValue& Value);
	void OnFlickStarted(const FInputActionValue& Value);
	void OnFlickCompleted(const FInputActionValue& Value);
	void OnShieldStarted(const FInputActionValue& Value);
	void OnShieldCompleted(const FInputActionValue& Value);
	void OnJockeyStarted(const FInputActionValue& Value);
	void OnJockeyCompleted(const FInputActionValue& Value);

	// control.js controlStep, the per-step part: called by the movement component before each fixed step
	void HandlePreSimStep(double H);
	void AddMappingContext();

	FDelegateHandle PreStepHandle;

	// buttons and their charge clocks (counted in fixed steps, as the game counts them)
	bool bLMB = false, bRMB = false, bMMB = false;
	double LmbT = 0.0, RmbT = 0.0, MmbT = 0.0;
	bool bShieldKey = false;
	bool bJockeyHeld = false;
	ELRChargeKind ChargeKind = ELRChargeKind::None;
	// Shift's double tap (real time, like the game's performance.now) and the knock it asks for
	double LastShiftPress = -1e9;
	bool bKnockRequested = false;
	// W's last press (sim time) for the late W of a shot held from a stand; S's edge for the fake
	bool bWWas = false;
	bool bSWas = false;
	double WOnT = -1e9;
	// the shot was let go at more than 1.5 m/s (control.js CTRL.runShot)
	bool bRunShot = true;
};
