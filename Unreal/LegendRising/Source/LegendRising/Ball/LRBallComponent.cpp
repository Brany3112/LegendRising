// LRBallComponent.cpp: see LRBallComponent.h.

#include "LRBallComponent.h"

#include "GameFramework/Actor.h"
#include "LRUnits.h"

#include <cmath>
#include <string>
#include <vector>

namespace
{
	// game kind strings are plain ASCII
	std::string ToStd(const FString& S)
	{
		std::string Out;
		Out.reserve(S.Len());
		for (int32 I = 0; I < S.Len(); ++I) Out.push_back(static_cast<char>(S[I]));
		return Out;
	}

	ELRBallEventType ToEventType(LRBall::EEventType T)
	{
		switch (T)
		{
		case LRBall::EEventType::Touch: return ELRBallEventType::Touch;
		case LRBall::EEventType::Bounce: return ELRBallEventType::Bounce;
		case LRBall::EEventType::Post: return ELRBallEventType::Post;
		case LRBall::EEventType::Bar: return ELRBallEventType::Bar;
		case LRBall::EEventType::Board: return ELRBallEventType::Board;
		case LRBall::EEventType::Body: return ELRBallEventType::Body;
		case LRBall::EEventType::Wall: return ELRBallEventType::Wall;
		}
		return ELRBallEventType::Touch;
	}
}

ULRBallComponent::ULRBallComponent()
	: Rng(1u)
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.bStartWithTickEnabled = true;
	PrimaryComponentTick.TickGroup = TG_PrePhysics;
	World.bCollectEvents = true;
}

void ULRBallComponent::BeginPlay()
{
	Super::BeginPlay();
	Rng = LRBall::FRng(static_cast<uint32>(RngSeed));
	AActor* Owner = GetOwner();
	if (bOriginAtStart && Owner)
	{
		// the sim origin on the grass under the ball, sim yaw 0 (its -Z) along the owner's forward
		const FVector L = Owner->GetActorLocation();
		const double Yaw = Owner->GetActorRotation().Yaw;
		SimFrameToWorld = FTransform(FRotator(0.0, Yaw, 0.0), L - FVector(0.0, 0.0, LRBall::BALL::R * LRUnits::CmPerM), FVector::OneVector);
		State = LRBall::CreateBall(0, LRBall::BALL::R, 0, RollDecel);
	}
	else if (Owner)
	{
		const LRBall::FVec3 P = WorldToSim(Owner->GetActorLocation());
		State = LRBall::CreateBall(P.X, FMath::Max(P.Y, LRBall::BALL::R), P.Z, RollDecel);
	}
	else State = LRBall::CreateBall(0, LRBall::BALL::R, 0, RollDecel);
	PrevP = State.P;
	SpinRotation = Owner ? Owner->GetActorQuat() : FQuat::Identity;
	RebuildPredWorld();
	RefreshPrediction();
}

void ULRBallComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	const double H = 1.0 / FMath::Max(1.0, static_cast<double>(FixedStepHz));
	Accumulator += DeltaTime;
	int32 Steps = 0;
	while (Accumulator >= H && Steps < MaxStepsPerFrame)
	{
		FixedStep(H);
		Accumulator -= H;
		++Steps;
	}
	// after a hitch the backlog is dropped (the simulation slows down rather than spiralling)
	if (Accumulator >= H) Accumulator = FMath::Fmod(Accumulator, H);
	ApplyToOwner(bInterpolate ? static_cast<float>(Accumulator / H) : 1.f, DeltaTime);
}

void ULRBallComponent::FixedStep(double H)
{
	const double NowT = SimTime;
	PrevP = State.P;
	// 1. the strikers (they may kick the ball and refresh the path cache)
	PreFixedStep.Broadcast(H, NowT, StepIndex);
	// 2. the ball
	World.T = NowT;
	World.Rng = &Rng;
	LRBall::Step(State, World, H);
	// 3. its events, and the path cache after anything that changed its path
	bool bRefresh = false;
	std::vector<LRBall::FEvent> Events;
	Events.swap(World.Events);
	for (const LRBall::FEvent& Ev : Events)
	{
		if (Ev.Type != LRBall::EEventType::Touch && Ev.Type != LRBall::EEventType::Wall) bRefresh = true;
		FLRBallEventInfo Info;
		Info.Type = ToEventType(Ev.Type);
		Info.SimTime = static_cast<float>(Ev.T);
		LRBall::FVec3 P;
		P.X = Ev.X; P.Y = Ev.Y; P.Z = Ev.Z;
		Info.Location = SimToWorld(P);
		Info.ImpactSpeed = static_cast<float>(Ev.Speed);
		Info.BounceSpeed = static_cast<float>(Ev.Vy);
		Info.Restitution = static_cast<float>(Ev.E);
		Info.VelocityIn = SimVectorToWorld(Ev.VIn);
		Info.VelocityOut = SimVectorToWorld(Ev.VOut);
		Info.Normal = SimVectorToWorld(Ev.N).GetSafeNormal();
		Info.End = Ev.End;
		Info.Id = Ev.Type == LRBall::EEventType::Touch ? Ev.Agent : Ev.Id;
		Info.Team = Ev.Team;
		Info.Part = Ev.Type == LRBall::EEventType::Touch ? FName(Ev.Kind.c_str()) : (Ev.Part.empty() ? NAME_None : FName(Ev.Part.c_str()));
		OnBallEvent.Broadcast(Info);
	}
	if (bRefresh) Pred.Refresh(State, &PredWorld, NowT, StepIndex);
	// the path cache while the ball flies with spin (10 Hz), else every half second (sim.js lines 490-491)
	const LRBall::FVec3& W = State.W;
	if (State.State == LRBall::EBallState::Free && !State.bGrounded && (std::fabs(W.X) + std::fabs(W.Y) + std::fabs(W.Z)) > 2 && StepIndex - Pred.PredStep >= 6)
		Pred.Refresh(State, &PredWorld, NowT, StepIndex);
	else if (StepIndex - Pred.PredStep >= 30 && State.State == LRBall::EBallState::Free)
		Pred.Refresh(State, &PredWorld, NowT, StepIndex);
	// 4. the clock
	SimTime += H;
	++StepIndex;
}

void ULRBallComponent::ApplyToOwner(float Alpha, float DeltaTime)
{
	AActor* Owner = GetOwner();
	if (!bDriveOwnerTransform || !Owner) return;
	LRBall::FVec3 P = State.P;
	if (bInterpolate)
	{
		const double A = FMath::Clamp(static_cast<double>(Alpha), 0.0, 1.0);
		P.X = PrevP.X + (State.P.X - PrevP.X) * A;
		P.Y = PrevP.Y + (State.P.Y - PrevP.Y) * A;
		P.Z = PrevP.Z + (State.P.Z - PrevP.Z) * A;
	}
	Owner->SetActorLocation(SimToWorld(P), false, nullptr, ETeleportType::TeleportPhysics);
	if (bRollMesh)
	{
		// turn the drawn ball by its spin (world rad/s): the axis-angle of w*dt on top of where it is
		const FVector Wd = GetBallSpin();
		const double Rate = Wd.Size();
		if (Rate > UE_KINDA_SMALL_NUMBER)
		{
			SpinRotation = FQuat(Wd / Rate, Rate * DeltaTime) * SpinRotation;
			SpinRotation.Normalize();
		}
		Owner->SetActorRotation(SpinRotation, ETeleportType::TeleportPhysics);
	}
}

void ULRBallComponent::KickBall(FVector VelocityCmS, FVector SpinRadS, int32 Agent, int32 Team, FName Kind, float Aero)
{
	LRBall::FTouch T;
	T.Agent = Agent; T.Team = Team;
	T.Kind = Kind.IsNone() ? std::string() : ToStd(Kind.ToString());
	T.Aero = Aero;
	T.bHasT = true; T.T = SimTime;
	LRBall::Kick(State, WorldVectorToSim(VelocityCmS), WorldSpinToSim(SpinRadS), T);
	RefreshPrediction();
}

void ULRBallComponent::PlaceBall(FVector WorldLocation)
{
	const LRBall::FVec3 P = WorldToSim(WorldLocation);
	State = LRBall::CreateBall(P.X, FMath::Max(P.Y, LRBall::BALL::R), P.Z, RollDecel);
	PrevP = State.P;
	RefreshPrediction();
}

FVector ULRBallComponent::GetBallLocation() const { return SimToWorld(State.P); }
FVector ULRBallComponent::GetBallVelocity() const { return SimVectorToWorld(State.V); }
FVector ULRBallComponent::GetBallSpin() const { return SimSpinToWorld(State.W); }

TArray<FVector> ULRBallComponent::PredictPath(int32 Samples, float SampleHz)
{
	TArray<FVector> Out;
	const int32 N = FMath::Clamp(Samples, 1, 900);
	std::vector<float> Buf(static_cast<size_t>(4 * N), 0.f);
	const int32 Got = LRBall::Predict(State, &PredWorld, Buf.data(), 4 * N, N, FMath::Max(1.0, static_cast<double>(SampleHz)));
	Out.Reserve(Got);
	for (int32 K = 0; K < Got; ++K)
	{
		LRBall::FVec3 P;
		P.X = Buf[4 * K]; P.Y = Buf[4 * K + 1]; P.Z = Buf[4 * K + 2];
		Out.Add(SimToWorld(P));
	}
	return Out;
}

void ULRBallComponent::AddCapsuleCollider(FVector A, FVector B, float RadiusCm, ELRBallColliderKind Kind, int32 GoalEnd)
{
	const LRBall::FVec3 Sa = WorldToSim(A), Sb = WorldToSim(B);
	const LRBall::EHitKind K = Kind == ELRBallColliderKind::Bar ? LRBall::EHitKind::Bar : Kind == ELRBallColliderKind::Board ? LRBall::EHitKind::Board : LRBall::EHitKind::Post;
	LRBall::AddCapsule(World, Sa.X, Sa.Y, Sa.Z, Sb.X, Sb.Y, Sb.Z, RadiusCm * LRUnits::MPerCm, K, GoalEnd);
	RebuildPredWorld();
}

void ULRBallComponent::AddBoardCollider(FVector PointOnFace, FVector Normal, FVector CornerA, FVector CornerB, float Restitution, bool bRoundedTopEdge)
{
	LRBall::FVec3 N = WorldVectorToSim(Normal.GetSafeNormal());
	const double L = std::sqrt(N.X * N.X + N.Y * N.Y + N.Z * N.Z);
	if (L <= 0) return;
	N.X /= L; N.Y /= L; N.Z /= L;
	const LRBall::FVec3 P = WorldToSim(PointOnFace), Ca = WorldToSim(CornerA), Cb = WorldToSim(CornerB);
	LRBall::FBoard Bd;
	Bd.Nx = N.X; Bd.Ny = N.Y; Bd.Nz = N.Z; Bd.D = N.X * P.X + N.Y * P.Y + N.Z * P.Z; Bd.E = Restitution;
	Bd.X0 = FMath::Min(Ca.X, Cb.X); Bd.X1 = FMath::Max(Ca.X, Cb.X);
	Bd.Y0 = FMath::Min(Ca.Y, Cb.Y); Bd.Y1 = FMath::Max(Ca.Y, Cb.Y);
	Bd.Z0 = FMath::Min(Ca.Z, Cb.Z); Bd.Z1 = FMath::Max(Ca.Z, Cb.Z);
	// the rounded top edge from one top corner of the box to the other
	LRBall::FVec3 Ea, Eb;
	Ea.X = Bd.X0; Ea.Y = Bd.Y1; Ea.Z = Bd.Z0;
	Eb.X = Bd.X1; Eb.Y = Bd.Y1; Eb.Z = Bd.Z1;
	LRBall::AddBoard(World, Bd, bRoundedTopEdge, Ea, Eb);
	RebuildPredWorld();
}

void ULRBallComponent::ClearColliders()
{
	World.Caps.clear();
	World.Boards.clear();
	RebuildPredWorld();
}

void ULRBallComponent::SetBodies(const TArray<FLRBallBody>& Bodies)
{
	World.Bodies.clear();
	World.Bodies.reserve(Bodies.Num());
	for (const FLRBallBody& In : Bodies)
	{
		LRBall::FBodyRec R;
		const LRBall::FVec3 P = WorldToSim(In.RootLocation), V = WorldVectorToSim(In.Velocity);
		R.Id = In.Id; R.Team = In.Team; R.X = P.X; R.Z = P.Z; R.Y = P.Y; R.H = In.HeightScale;
		R.Vx = V.X; R.Vy = V.Y; R.Vz = V.Z; R.bGhost = In.bGhost;
		if (In.bUseCapsule)
		{
			const LRBall::FVec3 A = WorldToSim(In.CapsuleA), B = WorldToSim(In.CapsuleB);
			R.bSeg = true; R.SegAx = A.X; R.SegAy = A.Y; R.SegAz = A.Z; R.SegBx = B.X; R.SegBy = B.Y; R.SegBz = B.Z;
			R.SegR = In.CapsuleRadiusCm * LRUnits::MPerCm;
		}
		World.Bodies.push_back(R);
	}
}

void ULRBallComponent::SetHands(const TArray<FLRBallHand>& Hands)
{
	World.Hands.clear();
	World.Hands.reserve(Hands.Num());
	for (const FLRBallHand& In : Hands)
	{
		LRBall::FHandRec R;
		const LRBall::FVec3 P = WorldToSim(In.Location), V = WorldVectorToSim(In.Velocity);
		R.Id = In.Id; R.Team = In.Team; R.X = P.X; R.Y = P.Y; R.Z = P.Z; R.Rad = In.RadiusCm * LRUnits::MPerCm;
		R.Vx = V.X; R.Vy = V.Y; R.Vz = V.Z;
		World.Hands.push_back(R);
	}
}

void ULRBallComponent::RefreshPrediction()
{
	Pred.Refresh(State, &PredWorld, SimTime, StepIndex);
}

void ULRBallComponent::RebuildPredWorld()
{
	PredWorld = LRBall::MakePredictionWorld(World);
}

FVector ULRBallComponent::SimToWorld(const LRBall::FVec3& P) const
{
	return SimFrameToWorld.TransformPosition(LRUnits::SimToUnreal(P));
}

LRBall::FVec3 ULRBallComponent::WorldToSim(const FVector& P) const
{
	return LRUnits::UnrealToSim(SimFrameToWorld.InverseTransformPosition(P));
}

FVector ULRBallComponent::SimVectorToWorld(const LRBall::FVec3& V) const
{
	return SimFrameToWorld.TransformVectorNoScale(LRUnits::SimToUnreal(V));
}

LRBall::FVec3 ULRBallComponent::WorldVectorToSim(const FVector& V) const
{
	return LRUnits::UnrealToSim(SimFrameToWorld.InverseTransformVectorNoScale(V));
}

FVector ULRBallComponent::SimSpinToWorld(const LRBall::FVec3& W) const
{
	return SimFrameToWorld.TransformVectorNoScale(LRUnits::SimSpinToUnreal(W));
}

LRBall::FVec3 ULRBallComponent::WorldSpinToSim(const FVector& W) const
{
	return LRUnits::UnrealSpinToSim(SimFrameToWorld.InverseTransformVectorNoScale(W));
}

double ULRBallComponent::SimYawToWorldDeg(double SimYaw) const
{
	return LRUnits::SimYawToUnrealDeg(SimYaw) + SimFrameToWorld.Rotator().Yaw;
}

double ULRBallComponent::WorldDegToSimYaw(double WorldYawDeg) const
{
	return LRUnits::UnrealDegToSimYaw(WorldYawDeg - SimFrameToWorld.Rotator().Yaw);
}
