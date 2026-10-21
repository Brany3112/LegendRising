// LRCloseControlComponent.cpp: see the header.

#include "LRCloseControlComponent.h"

#include "Components/CapsuleComponent.h"
#include "GameFramework/Actor.h"
#include "GameFramework/Character.h"
#include "LRBallInterface.h"
#include "LRMovementComponent.h"
#include "LRPlayerUnits.h"

namespace LRCloseControlLocal
{
	// ball.last.kind -> what keepStep distinguishes (actions.js STRUCK, 'control', 'deflect')
	static LRMove::ELastKind KindOf(const FName& Kind)
	{
		static const FName Control(TEXT("control"));
		static const FName Deflect(TEXT("deflect"));
		static const FName Dribble(TEXT("dribble"));
		static const FName Struck[] = {FName(TEXT("shot")), FName(TEXT("pass")), FName(TEXT("through")), FName(TEXT("cross")),
			FName(TEXT("lob")), FName(TEXT("clear")), FName(TEXT("roll")), FName(TEXT("punt")), FName(TEXT("header")),
			FName(TEXT("throw")), FName(TEXT("kick"))};
		if (Kind == Control) return LRMove::ELastKind::Control;
		if (Kind == Deflect) return LRMove::ELastKind::Deflect;
		if (Kind == Dribble) return LRMove::ELastKind::Dribble;
		for (const FName& S : Struck)
		{
			if (Kind == S) return LRMove::ELastKind::Struck;
		}
		return LRMove::ELastKind::Other;
	}

	// gait.js touchLanding: the toe tip TOE_BACK behind the ball's middle, the inside or outside FACE_BACK, the foot
	// turned at most TOUCH_YAW so that face looks along the way
	constexpr double TOE_BACK_CM = 10.5;
	constexpr double FACE_BACK_CM = 8.5;
	constexpr double TOUCH_YAW_DEG = 0.6 * 180.0 / LRMove::Pi;
}

ULRCloseControlComponent::ULRCloseControlComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
}

void ULRCloseControlComponent::BeginPlay()
{
	Super::BeginPlay();
	Core.OnTouch = [this](const LRMove::FTouchRecord& Rec) { HandleTouch(Rec); };
	if (AActor* OwnerActor = GetOwner())
	{
		Move = OwnerActor->FindComponentByClass<ULRMovementComponent>();
	}
	if (ULRMovementComponent* M = Move.Get())
	{
		PreHandle = M->OnPreSimStep.AddUObject(this, &ULRCloseControlComponent::HandlePreStep);
		FootHandle = M->OnFootfallNative.AddUObject(this, &ULRCloseControlComponent::HandleFootfall);
		PostHandle = M->OnPostSimStep.AddUObject(this, &ULRCloseControlComponent::HandlePostStep);
	}
}

void ULRCloseControlComponent::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (ULRMovementComponent* M = Move.Get())
	{
		M->OnPreSimStep.Remove(PreHandle);
		M->OnFootfallNative.Remove(FootHandle);
		M->OnPostSimStep.Remove(PostHandle);
	}
	Core.OnTouch = nullptr;
	Super::EndPlay(EndPlayReason);
}

ILRBallInterface* ULRCloseControlComponent::GetBallInterface() const
{
	return BallActor ? Cast<ILRBallInterface>(BallActor.Get()) : nullptr;
}

double ULRCloseControlComponent::FeetZ() const
{
	const AActor* OwnerActor = GetOwner();
	if (!OwnerActor) return 0.0;
	double Z = OwnerActor->GetActorLocation().Z;
	if (const ACharacter* C = Cast<ACharacter>(OwnerActor))
	{
		if (const UCapsuleComponent* Capsule = C->GetCapsuleComponent())
		{
			Z -= Capsule->GetScaledCapsuleHalfHeight();
		}
	}
	return Z;
}

void ULRCloseControlComponent::PrepareForStep(double H)
{
	const ULRMovementComponent* M = Move.Get();
	const int64 Step = M ? M->GetSimStepIndex() : 0;
	if (bBallValid && Step == BallStep) return;
	ILRBallInterface* B = GetBallInterface();
	if (!B)
	{
		bBallValid = false;
		return;
	}
	if (!bBallValid || BallFrame != GFrameCounter)
	{
		// a new frame: the ball as the engine has it now
		double X, Y, Z;
		LRPlayerUnits::UnrealToSim(B->GetLocation(), X, Y, Z);
		Ball.X = X;
		Ball.Z = Z;
		Ball.Y = (B->GetLocation().Z - FeetZ()) / LRPlayerUnits::CmPerMetre;   // the centre's height over the grass
		double VX, VY, VZ;
		LRPlayerUnits::UnrealToSim(B->GetVelocity(), VX, VY, VZ);
		Ball.VX = VX;
		Ball.VY = VY;
		Ball.VZ = VZ;
		Ball.RollDecel = static_cast<double>(B->GetRollDeceleration()) / LRPlayerUnits::CmPerMetre;
		Ball.DragMul = 1.0;
		Ball.bFree = B->IsFree();
		AActor* By = nullptr;
		FName Kind;
		double WorldT = 0.0;
		if (B->GetLastTouch(By, Kind, WorldT))
		{
			Ball.LastBy = By == nullptr ? LRMove::ELastBy::Nobody : (By == GetOwner() ? LRMove::ELastBy::Me : LRMove::ELastBy::Other);
			Ball.LastKind = LRCloseControlLocal::KindOf(Kind);
			Ball.LastT = WorldT;
		}
		// our own notes (our touches, our strikes and first touches we were told of) when they are the newer record
		if (NoteKind != LRMove::ELastKind::None && NoteT >= Ball.LastT)
		{
			Ball.LastBy = LRMove::ELastBy::Me;
			Ball.LastKind = NoteKind;
			Ball.LastT = NoteT;
		}
		BallFrame = GFrameCounter;
	}
	else
	{
		// a later fixed step in the same frame: the engine has not moved the ball yet, so roll our copy on
		LRMove::RollBall(Ball, H);
	}
	BallStep = Step;
	bBallValid = true;
}

LRMove::FBodyView ULRCloseControlComponent::MakeBodyView() const
{
	const LRMove::FBodySim& B = Move->GetBody();
	LRMove::FBodyView V;
	V.M = &B.M;
	V.P = &B.P;
	V.Fac = &B.Fac;
	V.I = &B.I;
	V.G = &B.G;
	V.Scale = B.Scale;
	V.Foot = static_cast<LRMove::EStrongFoot>(StrongFoot);
	return V;
}

bool ULRCloseControlComponent::IsBallMine() const
{
	const ILRBallInterface* B = GetBallInterface();
	if (!B) return false;
	const AActor* P = B->GetPossessor();
	return P == GetOwner() || (P == nullptr && bAssumeUnownedBallIsMine);
}

bool ULRCloseControlComponent::IsBallOthers() const
{
	const ILRBallInterface* B = GetBallInterface();
	if (!B) return false;
	const AActor* P = B->GetPossessor();
	return P != nullptr && P != GetOwner();
}

LRMove::FCtlWorld ULRCloseControlComponent::MakeWorld(double T) const
{
	static const FName Header(TEXT("header"));
	static const FName Fake(TEXT("fake"));
	LRMove::FCtlWorld W;
	const ULRMovementComponent* M = Move.Get();
	const ILRBallInterface* B = GetBallInterface();
	W.T = T;
	W.Step = M ? M->GetSimStepIndex() : 0;
	W.bLive = B ? B->IsInPlay() : false;
	W.bBallMine = IsBallMine();
	W.bBallOthers = IsBallOthers();
	W.bAIControlled = bAIControlled;
	W.bCtlAuto = !bAIControlled;
	W.bAction = bAction;
	W.bActionHeaderOrFake = bAction && (ActionKind == Header || ActionKind == Fake);
	W.bFake = bAction && ActionKind == Fake;
	W.bStepIn = bAction && bActionStepIn;
	W.bShielding = bShielding;
	return W;
}

void ULRCloseControlComponent::HandlePreStep(double H)
{
	if (!Move.IsValid()) return;
	PrepareForStep(H);
	if (!bBallValid)
	{
		Move->SetCarryTarget(false);
		return;
	}
	// sim.js carrying(): the gait clock eases into the carrier's quick short steps while this holds
	const LRMove::FBodyView Body = MakeBodyView();
	Move->SetCarryTarget(Core.Carrying(Ball, Body, MakeWorld(Move->GetSimTime())));
}

void ULRCloseControlComponent::HandleFootfall(LRMove::EFoot Foot, double FootfallT, double H)
{
	if (!Move.IsValid() || !bBallValid) return;
	const LRMove::FBodyView Body = MakeBodyView();
	Core.OnFootfall(Ball, Body, MakeWorld(FootfallT), Foot);
	BroadcastIfChanged();
}

void ULRCloseControlComponent::HandlePostStep(double H)
{
	if (!Move.IsValid() || !bBallValid) return;
	const LRMove::FBodyView Body = MakeBodyView();
	Core.KeepStep(Ball, Body, MakeWorld(Move->GetSimTime()));
	BroadcastIfChanged();
}

void ULRCloseControlComponent::HandleTouch(const LRMove::FTouchRecord& Rec)
{
	ILRBallInterface* B = GetBallInterface();
	const FVector Vel = LRPlayerUnits::SimToUnreal(Rec.KickVX, 0.0, Rec.KickVZ);
	const FVector Spin = LRPlayerUnits::SimSpinToUnreal(Rec.SpinX, Rec.SpinY, Rec.SpinZ);
	if (B)
	{
		B->Kick(Vel, Spin);
		B->NotifyTouchedBy(GetOwner(), FName(TEXT("dribble")));
	}
	NoteKind = LRMove::ELastKind::Dribble;
	NoteT = Rec.T;

	LastTouch.Foot = static_cast<ELRFoot>(Rec.Foot);
	LastTouch.Part = static_cast<ELRFootPart>(Rec.Part);
	LastTouch.BallSide = static_cast<ELRBallSide>(Rec.BallSide);
	LastTouch.Why = static_cast<ELRTouchWhy>(Rec.Why);
	LastTouch.ContactWorldTime = Rec.T;
	FVector At = LRPlayerUnits::SimToUnreal(Rec.BallX, 0.0, Rec.BallZ);
	At.Z = FeetZ() + Rec.BallY * LRPlayerUnits::CmPerMetre;
	LastTouch.BallLocation = At;
	LastTouch.KickVelocity = Vel;
	LastTouch.Spin = Spin;
	OnTouch.Broadcast(LastTouch.Foot, LastTouch.Part, static_cast<float>(Rec.T));
}

void ULRCloseControlComponent::BroadcastIfChanged()
{
	if (Core.bCtlOn != bWasOn)
	{
		bWasOn = Core.bCtlOn;
		OnCloseControlChanged.Broadcast(bWasOn, static_cast<ELRCloseControlEnd>(Core.End));
	}
}

void ULRCloseControlComponent::NotifyOwnStrike(FName Kind)
{
	const double T = Move.IsValid() ? Move->GetSimTime() : (GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0);
	const LRMove::ELastKind K = LRCloseControlLocal::KindOf(Kind);
	NoteKind = K == LRMove::ELastKind::Other ? LRMove::ELastKind::Struck : K;
	NoteT = T;
	Ball.LastBy = LRMove::ELastBy::Me;
	Ball.LastKind = NoteKind;
	Ball.LastT = T;
}

void ULRCloseControlComponent::NotifyFirstTouch()
{
	const double T = Move.IsValid() ? Move->GetSimTime() : (GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0);
	NoteKind = LRMove::ELastKind::Control;
	NoteT = T;
	Ball.LastBy = LRMove::ELastBy::Me;
	Ball.LastKind = NoteKind;
	Ball.LastT = T;
}

void ULRCloseControlComponent::NotifyActionStarted(FName Kind, bool bStepIn)
{
	bAction = true;
	ActionKind = Kind;
	bActionStepIn = bStepIn;
}

void ULRCloseControlComponent::NotifyActionFinished()
{
	bAction = false;
	ActionKind = NAME_None;
	bActionStepIn = false;
}

bool ULRCloseControlComponent::GetBallSim(LRMove::FBallState& Out) const
{
	if (!bBallValid) return false;
	Out = Ball;
	return true;
}

float ULRCloseControlComponent::GetBallDistanceMetres() const
{
	if (!bBallValid || !Move.IsValid()) return -1.f;
	const LRMove::FBodySim& B = Move->GetBody();
	return static_cast<float>(LRMove::Hypot(Ball.X - B.M.X, Ball.Z - B.M.Z));
}

FLRPlannedTouch ULRCloseControlComponent::GetNextPlannedTouch() const
{
	using namespace LRCloseControlLocal;
	FLRPlannedTouch Out;
	const ULRMovementComponent* M = Move.Get();
	if (!M || !Core.Plan.bOn || !bBallValid) return Out;
	const LRMove::FBodyView Body = MakeBodyView();
	const LRMove::FCarryPlan& P = Core.Plan;
	const double Ttc = LRMove::Max2(0.0, Core.TimeToPlannedTouch(Body));
	Out.bValid = true;
	Out.bWillTouch = P.bTouch;
	Out.Foot = static_cast<ELRFoot>(P.Side);
	Out.Part = static_cast<ELRFootPart>(P.Part);
	Out.Why = static_cast<ELRTouchWhy>(P.Why);
	Out.FootfallIndex = static_cast<int32>(P.N);
	Out.TimeToContact = static_cast<float>(Ttc);
	Out.ContactWorldTime = M->GetSimTime() + Ttc;

	// the ball where it will be (rolling on), on the grass
	double BX, BZ, BVX, BVZ;
	LRMove::BallAt(Ball, Ttc, BX, BZ, BVX, BVZ);
	const double Ground = FeetZ();
	FVector C = LRPlayerUnits::SimToUnreal(BX, 0.0, BZ);
	C.Z = Ground + LRMove::Ctl::BALL_R * LRPlayerUnits::CmPerMetre;
	Out.PredictedBallLocation = C;

	FVector D = LRPlayerUnits::SimDirToUnreal(P.Way.X, P.Way.Z);
	D = D.GetSafeNormal2D();
	if (D.IsNearlyZero()) D = M->UpdatedComponent ? M->UpdatedComponent->GetForwardVector().GetSafeNormal2D() : FVector::ForwardVector;
	Out.PlayDirection = D;
	const double PlayYaw = FMath::RadiansToDegrees(FMath::Atan2(D.Y, D.X));

	// where the touching face goes (gait.js touchLanding's numbers)
	switch (P.Part)
	{
	case LRMove::EFootPart::Sole:
		Out.FootFaceTarget = FVector(C.X, C.Y, Ground + 2.0 * LRMove::Ctl::BALL_R * LRPlayerUnits::CmPerMetre);
		Out.FootYawDeg = static_cast<float>(PlayYaw);
		break;
	case LRMove::EFootPart::Inside:
	case LRMove::EFootPart::Outside:
	{
		// the inside of a right foot looks to its left, so the foot turns right (out) for its inside to face the way;
		// its outside the other way; a left foot mirrored
		const bool bRight = P.Side == LRMove::EFoot::Right;
		const bool bInside = P.Part == LRMove::EFootPart::Inside;
		const double Turn = (bRight == bInside ? 1.0 : -1.0) * TOUCH_YAW_DEG;
		const FVector F = C - D * FACE_BACK_CM;
		Out.FootFaceTarget = FVector(F.X, F.Y, Ground + ContactHeightCm);
		Out.FootYawDeg = static_cast<float>(PlayYaw + Turn);
		break;
	}
	default:
	{
		const FVector F = C - D * TOE_BACK_CM;
		Out.FootFaceTarget = FVector(F.X, F.Y, Ground + ContactHeightCm);
		Out.FootYawDeg = static_cast<float>(PlayYaw);
		break;
	}
	}
	return Out;
}
