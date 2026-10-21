// LRPlayerCharacter.cpp: see the header.

#include "LRPlayerCharacter.h"

#include "Camera/CameraComponent.h"
#include "Camera/PlayerCameraManager.h"
#include "Components/CapsuleComponent.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "Engine/LocalPlayer.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "HAL/PlatformTime.h"
#include "InputAction.h"
#include "InputActionValue.h"
#include "InputMappingContext.h"
#include "LRCloseControlComponent.h"
#include "LRMovementComponent.h"
#include "LRPlayerUnits.h"

namespace LRPlayerCharacterLocal
{
	// control.js CN
	constexpr double SHOT_FULL = 0.85;      // a shot's wind-up fills in 0.85 s (eased: 1 - (1 - t/0.85)^2)
	constexpr double PASS_FULL = 0.8;       // a pass's weight fills in 0.8 s
	constexpr double RUN_SHOT_V = 1.5;      // a shot let go faster than this keeps its run (CTRL.runShot)
	constexpr double FLICK_AT_FEET = 1.3;   // control.js flick(): the ball at your feet within 1.3 m
	// control.js approaching(): a ball within 25 m closing on you at more than 1 m/s
	constexpr double APPROACH_D = 25.0, APPROACH_V = 1.0;
	// control.js 'coming': a pass rolling your way at 2 m/s or more (no step up to a run under it)
	constexpr double COMING_V = 2.0;
	// control.js FLICK_CHG: a full bar in BASE / flickRate(Ball Control) s; flickRate 0.3 at 0, 0.6 at 33, 1.5 at 55,
	// 3 at 99, straight lines between, a little more past 99, MAX at most
	constexpr double FLICK_BASE = 0.5 / 1.5;
	constexpr double FLICK_PTS[4][2] = {{0, 0.3}, {33, 0.6}, {55, 1.5}, {99, 3.0}};
	constexpr double FLICK_MAX = 3.5;

	static double FlickRate(double Ctrl)
	{
		const double X = FMath::Max(0.0, Ctrl);
		const int32 N = 3;
		if (X >= FLICK_PTS[N][0])
		{
			return FMath::Min(FLICK_MAX, FLICK_PTS[N][1] + (FLICK_PTS[N][1] - FLICK_PTS[N - 1][1]) / (FLICK_PTS[N][0] - FLICK_PTS[N - 1][0]) * (X - FLICK_PTS[N][0]));
		}
		for (int32 I = 1; I <= N; I++)
		{
			if (X <= FLICK_PTS[I][0])
			{
				const double X0 = FLICK_PTS[I - 1][0], Y0 = FLICK_PTS[I - 1][1], X1 = FLICK_PTS[I][0], Y1 = FLICK_PTS[I][1];
				return Y0 + (Y1 - Y0) * (X - X0) / (X1 - X0);
			}
		}
		return FLICK_PTS[0][1];
	}
}

ALRPlayerCharacter::ALRPlayerCharacter(const FObjectInitializer& ObjectInitializer)
	: Super(ObjectInitializer.SetDefaultSubobjectClass<ULRMovementComponent>(ACharacter::CharacterMovementComponentName))
{
	PrimaryActorTick.bCanEverTick = false;

	// a body of about 1.8 m; the eyes at 1.68 m (control.js eyeOf: 1.68 x scale over the feet)
	GetCapsuleComponent()->InitCapsuleSize(34.f, 90.f);

	// the mover owns the facing; the camera follows the mouse
	bUseControllerRotationPitch = false;
	bUseControllerRotationYaw = false;
	bUseControllerRotationRoll = false;

	// third person (matchcam.js TP): the pivot at the head, TP.BACK 4 m back along the look, TP.UP 1.5 m above that line
	// (tilting with the look), kept out of walls (camCast)
	CameraBoom = CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraBoom"));
	CameraBoom->SetupAttachment(RootComponent);
	CameraBoom->SetRelativeLocation(FVector(0.f, 0.f, 168.f - 90.f));
	CameraBoom->TargetArmLength = 400.f;
	CameraBoom->SocketOffset = FVector(0.f, 0.f, 150.f);
	CameraBoom->bUsePawnControlRotation = true;
	CameraBoom->bDoCollisionTest = true;
	CameraBoom->ProbeSize = 12.f;
	CameraBoom->bEnableCameraLag = false;

	FollowCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("FollowCamera"));
	FollowCamera->SetupAttachment(CameraBoom, USpringArmComponent::SocketName);
	FollowCamera->bUsePawnControlRotation = false;
	FollowCamera->SetFieldOfView(78.f);   // control.js SET_DEF.fov

	CloseControl = CreateDefaultSubobject<ULRCloseControlComponent>(TEXT("CloseControl"));
}

ULRMovementComponent* ALRPlayerCharacter::GetLRMovement() const
{
	return Cast<ULRMovementComponent>(GetCharacterMovement());
}

void ALRPlayerCharacter::BeginPlay()
{
	Super::BeginPlay();
	if (ULRMovementComponent* M = GetLRMovement())
	{
		PreStepHandle = M->OnPreSimStep.AddUObject(this, &ALRPlayerCharacter::HandlePreSimStep);
	}
	AddMappingContext();
}

void ALRPlayerCharacter::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (ULRMovementComponent* M = GetLRMovement())
	{
		M->OnPreSimStep.Remove(PreStepHandle);
	}
	Super::EndPlay(EndPlayReason);
}

void ALRPlayerCharacter::PawnClientRestart()
{
	Super::PawnClientRestart();
	AddMappingContext();
}

void ALRPlayerCharacter::AddMappingContext()
{
	APlayerController* PC = Cast<APlayerController>(GetController());
	if (!PC) return;
	if (PC->PlayerCameraManager)
	{
		PC->PlayerCameraManager->ViewPitchMin = CameraPitchMinDeg;
		PC->PlayerCameraManager->ViewPitchMax = CameraPitchMaxDeg;
	}
	if (!DefaultMappingContext) return;
	if (ULocalPlayer* LP = PC->GetLocalPlayer())
	{
		if (UEnhancedInputLocalPlayerSubsystem* Subsystem = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(LP))
		{
			if (!Subsystem->HasMappingContext(DefaultMappingContext))
			{
				Subsystem->AddMappingContext(DefaultMappingContext, 0);
			}
		}
	}
}

void ALRPlayerCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);
	UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(PlayerInputComponent);
	if (!EIC) return;
	if (MoveAction)
	{
		EIC->BindAction(MoveAction, ETriggerEvent::Triggered, this, &ALRPlayerCharacter::OnMove);
		EIC->BindAction(MoveAction, ETriggerEvent::Completed, this, &ALRPlayerCharacter::OnMoveCompleted);
		EIC->BindAction(MoveAction, ETriggerEvent::Canceled, this, &ALRPlayerCharacter::OnMoveCompleted);
	}
	if (LookAction) EIC->BindAction(LookAction, ETriggerEvent::Triggered, this, &ALRPlayerCharacter::OnLook);
	if (SprintAction)
	{
		EIC->BindAction(SprintAction, ETriggerEvent::Started, this, &ALRPlayerCharacter::OnSprintStarted);
		EIC->BindAction(SprintAction, ETriggerEvent::Completed, this, &ALRPlayerCharacter::OnSprintCompleted);
	}
	if (WalkAction) EIC->BindAction(WalkAction, ETriggerEvent::Started, this, &ALRPlayerCharacter::OnWalkStarted);
	if (ShootAction)
	{
		EIC->BindAction(ShootAction, ETriggerEvent::Started, this, &ALRPlayerCharacter::OnShootStarted);
		EIC->BindAction(ShootAction, ETriggerEvent::Completed, this, &ALRPlayerCharacter::OnShootCompleted);
	}
	if (PassAction)
	{
		EIC->BindAction(PassAction, ETriggerEvent::Started, this, &ALRPlayerCharacter::OnPassStarted);
		EIC->BindAction(PassAction, ETriggerEvent::Completed, this, &ALRPlayerCharacter::OnPassCompleted);
	}
	if (FlickAction)
	{
		EIC->BindAction(FlickAction, ETriggerEvent::Started, this, &ALRPlayerCharacter::OnFlickStarted);
		EIC->BindAction(FlickAction, ETriggerEvent::Completed, this, &ALRPlayerCharacter::OnFlickCompleted);
	}
	if (ShieldAction)
	{
		EIC->BindAction(ShieldAction, ETriggerEvent::Started, this, &ALRPlayerCharacter::OnShieldStarted);
		EIC->BindAction(ShieldAction, ETriggerEvent::Completed, this, &ALRPlayerCharacter::OnShieldCompleted);
	}
	if (JockeyAction)
	{
		EIC->BindAction(JockeyAction, ETriggerEvent::Started, this, &ALRPlayerCharacter::OnJockeyStarted);
		EIC->BindAction(JockeyAction, ETriggerEvent::Completed, this, &ALRPlayerCharacter::OnJockeyCompleted);
	}
}

// ---------------------------------------------------------------------------------------------------------------------
// the input events (control.js controlInput)
// ---------------------------------------------------------------------------------------------------------------------

void ALRPlayerCharacter::OnMove(const FInputActionValue& Value)
{
	if (ULRMovementComponent* M = GetLRMovement()) M->SetMoveAxes(Value.Get<FVector2D>());
}

void ALRPlayerCharacter::OnMoveCompleted(const FInputActionValue& Value)
{
	if (ULRMovementComponent* M = GetLRMovement()) M->SetMoveAxes(FVector2D::ZeroVector);
}

void ALRPlayerCharacter::OnLook(const FInputActionValue& Value)
{
	// control.js look(): the view turns per event, unsmoothed, at the sensitivity setting. Written to the control
	// rotation directly (not AddControllerYawInput), so no legacy input scale can change its size or sign: the mouse
	// to the right turns the view right, the mouse up looks up (bInvertY flips that)
	AController* C = GetController();
	if (!C) return;
	const FVector2D D = Value.Get<FVector2D>();
	const double K = static_cast<double>(LookDegreesPerUnit) * static_cast<double>(MouseSensitivity);
	FRotator R = C->GetControlRotation();
	R.Yaw = FRotator::NormalizeAxis(R.Yaw + D.X * K);
	const double Pitch = FRotator::NormalizeAxis(R.Pitch) + D.Y * K * (bInvertY ? -1.0 : 1.0);
	R.Pitch = FMath::Clamp(Pitch, static_cast<double>(CameraPitchMinDeg), static_cast<double>(CameraPitchMaxDeg));
	R.Roll = 0.0;
	C->SetControlRotation(R);
}

void ALRPlayerCharacter::OnSprintStarted(const FInputActionValue& Value)
{
	if (ULRMovementComponent* M = GetLRMovement()) M->SetSprintHeld(true);
	// (U26) Shift tapped twice within KNOCK_TAP s: the knock-on. Real time, like the game's performance.now(); the press
	// that completes a pair is used up, so a third press starts a new pair
	const double Now = FPlatformTime::Seconds();
	if (Now - LastShiftPress < static_cast<double>(KnockTapSeconds))
	{
		bKnockRequested = true;
		LastShiftPress = -1e9;
	}
	else
	{
		LastShiftPress = Now;
	}
}

void ALRPlayerCharacter::OnSprintCompleted(const FInputActionValue& Value)
{
	if (ULRMovementComponent* M = GetLRMovement()) M->SetSprintHeld(false);
}

void ALRPlayerCharacter::OnWalkStarted(const FInputActionValue& Value)
{
	if (ULRMovementComponent* M = GetLRMovement()) M->ToggleWalk();
}

void ALRPlayerCharacter::OnShootStarted(const FInputActionValue& Value)
{
	if (!bLMB) { bLMB = true; LmbT = 0.0; }
	if (bDefending) OnTackleRequested.Broadcast();
}

void ALRPlayerCharacter::OnShootCompleted(const FInputActionValue& Value)
{
	if (!bLMB) return;
	bLMB = false;
	const ULRMovementComponent* M = GetLRMovement();
	bRunShot = M ? M->GetSpeedMetresPerSecond() > LRPlayerCharacterLocal::RUN_SHOT_V : true;
	if (!bDefending) OnShootReleased.Broadcast(static_cast<float>(LmbT), ShotPower(static_cast<float>(LmbT)));
}

void ALRPlayerCharacter::OnPassStarted(const FInputActionValue& Value)
{
	if (!bRMB) { bRMB = true; RmbT = 0.0; }
}

void ALRPlayerCharacter::OnPassCompleted(const FInputActionValue& Value)
{
	if (!bRMB) return;
	bRMB = false;
	if (!bDefending) OnPassReleased.Broadcast(static_cast<float>(RmbT), PassPower(static_cast<float>(RmbT)));
}

void ALRPlayerCharacter::OnFlickStarted(const FInputActionValue& Value)
{
	if (!bMMB) { bMMB = true; MmbT = 0.0; }
}

void ALRPlayerCharacter::OnFlickCompleted(const FInputActionValue& Value)
{
	using namespace LRPlayerCharacterLocal;
	if (!bMMB) return;
	bMMB = false;
	if (bDefending) return;
	const ULRMovementComponent* M = GetLRMovement();
	const float Full = FlickFullSeconds(M ? M->Skills.BallControl : 50.f);
	const float P = FMath::Clamp(static_cast<float>(MmbT) / Full, 0.05f, 1.f);
	// from your feet the flick ends close control and you chase it (actions.js startFlick: ctlOff 'flick', ctlChase). The
	// flick's launch itself is the game's (OnFlickReleased)
	LRMove::FBallState B;
	if (CloseControl && M && CloseControl->GetBallSim(B))
	{
		const LRMove::FBodySim& Body = M->GetBody();
		const double D = LRMove::Hypot(B.X - Body.M.X, B.Z - Body.M.Z);
		const bool bMine = CloseControl->IsInCloseControl() || CloseControl->IsBallMine();
		if (bMine && B.bFree && B.Y < 0.5 && D <= FLICK_AT_FEET * Body.Scale) CloseControl->NotifyFlickStarted();
	}
	OnFlickReleased.Broadcast(static_cast<float>(MmbT), P);
}

void ALRPlayerCharacter::OnShieldStarted(const FInputActionValue& Value) { bShieldKey = true; }
void ALRPlayerCharacter::OnShieldCompleted(const FInputActionValue& Value) { bShieldKey = false; }
void ALRPlayerCharacter::OnJockeyStarted(const FInputActionValue& Value) { bJockeyHeld = true; }
void ALRPlayerCharacter::OnJockeyCompleted(const FInputActionValue& Value) { bJockeyHeld = false; }

// ---------------------------------------------------------------------------------------------------------------------
// one fixed step (control.js controlStep, the parts that shape where you go)
// ---------------------------------------------------------------------------------------------------------------------

void ALRPlayerCharacter::HandlePreSimStep(double H)
{
	using namespace LRPlayerCharacterLocal;
	ULRMovementComponent* M = GetLRMovement();
	if (!M || !CloseControl) return;
	LRMove::FControlInput& In = M->GetControlInput();
	const LRMove::FBodySim& Body = M->GetBody();
	const double T = M->GetSimTime();

	// the charges count in fixed steps
	if (bLMB) LmbT += H;
	if (bRMB) RmbT += H;
	if (bMMB) MmbT += H;

	// W's press (for a shot held from a stand) and S's press while a shot is held (the fake)
	const FVector2D Axes = M->GetMoveAxes();
	const bool bW = Axes.Y > 0.5, bS = Axes.Y < -0.5;
	if (bW && !bWWas) WOnT = T;
	bWWas = bW;
	if (bS && !bSWas && bLMB && !bDefending)
	{
		bLMB = false;
		OnFakeRequested.Broadcast();
	}
	bSWas = bS;

	// the ball as close control sees it this step
	CloseControl->SetAIControlled(!IsPlayerControlled());
	CloseControl->PrepareForStep(H);
	LRMove::FBallState B;
	const bool bHaveBall = CloseControl->GetBallSim(B);
	const double DX = bHaveBall ? B.X - Body.M.X : 0.0, DZ = bHaveBall ? B.Z - Body.M.Z : 0.0;
	const double DBall = bHaveBall ? LRMove::Hypot(DX, DZ) : 1e9;
	const bool bCtl = CloseControl->IsInCloseControl();
	const bool bOthers = CloseControl->IsBallOthers();
	// "yours" for the controls: in close control, or the possession system says so
	const bool bMine = bCtl || (bHaveBall && !bOthers && CloseControl->IsBallMine() && DBall <= LRMove::Ctl::AUTO_REACH * Body.Scale);
	const bool bNobody = bHaveBall && !bOthers && !bMine;
	const bool bApproaching = bHaveBall && DBall > 1e-6 && DBall < APPROACH_D && (-(DX * B.VX + DZ * B.VZ)) / DBall > APPROACH_V;

	// the shield: C held with the ball yours or loose within SHIELD_NEAR and nobody's (P2b-B); the engine holds you to
	// 0.6 of your jog and turns your back to the nearest opponent (LRMoverCore), close control leaves the ball alone
	const bool bSoon = bHaveBall && B.bFree && bNobody && DBall < LRMove::SHIELD_NEAR;
	In.bShield = bShieldKey && (bMine || bSoon);
	CloseControl->SetShielding(In.bShield && bMine && bHaveBall && B.bFree);
	In.bShieldFrom = false;
	if (ShieldThreat)
	{
		double SX, SY, SZ;
		LRPlayerUnits::UnrealToSim(ShieldThreat->GetActorLocation(), SX, SY, SZ);
		In.bShieldFrom = true;
		In.ShieldFromX = SX;
		In.ShieldFromZ = SZ;
	}

	// what a held button charges (none while defending: LMB is the tackle, RMB the jockey)
	ChargeKind = ELRChargeKind::None;
	if (!bDefending)
	{
		if (bLMB) ChargeKind = ELRChargeKind::Shot;
		else if (bRMB) ChargeKind = ELRChargeKind::Pass;
		else if (bMMB) ChargeKind = ELRChargeKind::Flick;
	}
	static const FName KickName(TEXT("kick"));
	static const FName FakeName(TEXT("fake"));
	static const FName FlickName(TEXT("flick"));
	const FName Act = CloseControl->IsActionInProgress() ? CloseControl->GetActionKind() : NAME_None;
	In.bShotCharging = ChargeKind == ELRChargeKind::Shot;
	In.bKicking = Act == KickName;
	In.bRunShot = bRunShot;
	In.WPressedT = WOnT;

	// the facing held to the aim (the camera's way) only while a strike needs it: a shot, a pass or a flick being charged
	// with the ball yours, within AIM_NEAR or coming to you; a strike, a fake or a flick under way
	In.bAimHold = Act == KickName || Act == FakeName || Act == FlickName ||
		(ChargeKind != ELRChargeKind::None && (bMine || DBall < LRMove::BCS::AIM_NEAR * Body.Scale || (bHaveBall && B.bFree && bApproaching)));

	// receiving: a free ball nobody has, rolling your way at RECV_V or more, within RECV_T s, from no further round than
	// RECV_ANG off your facing: the body stays open to it while the keys move you
	In.bReceiving = false;
	if (bHaveBall && B.bFree && bNobody && B.Y <= 1.2 && DBall >= 0.3)
	{
		const double CX = -DX, CZ = -DZ;   // from the ball to you
		const double Close = ((B.VX - Body.M.VX) * CX + (B.VZ - Body.M.VZ) * CZ) / DBall;
		if (Close >= LRMove::BCS::RECV_V && DBall / Close <= LRMove::BCS::RECV_T)
		{
			const double FX = LRMove::DirX(Body.M.Yaw), FZ = LRMove::DirZ(Body.M.Yaw);
			if (-(CX * FX + CZ * FZ) / DBall > FMath::Cos(LRMove::BCS::RECV_ANG))
			{
				In.bReceiving = true;
				In.ReceiveX = DX / DBall;
				In.ReceiveZ = DZ / DBall;
			}
		}
	}
	// a pass on its way to you (no step up to a run under it)
	In.bPassComing = bHaveBall && B.bFree && !bMine && DBall > 1e-6 && (-(DX * B.VX + DZ * B.VZ)) / DBall >= COMING_V;

	// the jockey: RMB held defending (or the jockey key)
	In.bJockey = bDefending && (bRMB || bJockeyHeld);
	In.bJockeyTarget = false;
	if (In.bJockey && JockeyTarget)
	{
		double JX, JY, JZ;
		LRPlayerUnits::UnrealToSim(JockeyTarget->GetActorLocation(), JX, JY, JZ);
		In.bJockeyTarget = true;
		In.JockeyX = JX;
		In.JockeyZ = JZ;
	}
	In.bInCloseControl = bCtl;

	// Shift twice: the knock-on, with the ball yours or in close control (asked for this step, or dropped)
	if (bKnockRequested)
	{
		if (bCtl || CloseControl->IsBallMine()) CloseControl->RequestKnockOn();
		bKnockRequested = false;
	}
}

// ---------------------------------------------------------------------------------------------------------------------
// the charges
// ---------------------------------------------------------------------------------------------------------------------

float ALRPlayerCharacter::ShotPower(float HeldSeconds)
{
	const double U = 1.0 - FMath::Min(1.0, static_cast<double>(HeldSeconds) / LRPlayerCharacterLocal::SHOT_FULL);
	return static_cast<float>(1.0 - U * U);
}

float ALRPlayerCharacter::PassPower(float HeldSeconds)
{
	return static_cast<float>(FMath::Min(1.0, static_cast<double>(HeldSeconds) / LRPlayerCharacterLocal::PASS_FULL));
}

float ALRPlayerCharacter::FlickFullSeconds(float BallControl)
{
	return static_cast<float>(LRPlayerCharacterLocal::FLICK_BASE / LRPlayerCharacterLocal::FlickRate(static_cast<double>(BallControl)));
}

float ALRPlayerCharacter::GetChargePower() const
{
	switch (ChargeKind)
	{
	case ELRChargeKind::Shot: return ShotPower(static_cast<float>(LmbT));
	case ELRChargeKind::Pass: return PassPower(static_cast<float>(RmbT));
	case ELRChargeKind::Flick:
	{
		const ULRMovementComponent* M = GetLRMovement();
		return FMath::Min(1.f, static_cast<float>(MmbT) / FlickFullSeconds(M ? M->Skills.BallControl : 50.f));
	}
	default: return 0.f;
	}
}
