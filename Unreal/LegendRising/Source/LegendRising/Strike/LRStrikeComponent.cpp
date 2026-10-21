// LRStrikeComponent.cpp: see LRStrikeComponent.h.

#include "LRStrikeComponent.h"

#include "Components/CapsuleComponent.h"
#include "GameFramework/Actor.h"
#include "GameFramework/Character.h"
#include "Ball/LRBall.h"
#include "Ball/LRBallComponent.h"
#include "Ball/LRDetMath.h"
#include "Ball/LRUnits.h"

#include <algorithm>
#include <cmath>

namespace
{
	// the phase times of the step-in shot, from the contact (moves.js SHOT, KINDS.instep; LRStrikeSolver.h SHOT_CLOCK)
	double PhaseOffset(ELRStrikePhase P)
	{
		switch (P)
		{
		case ELRStrikePhase::Plant: return -LRStrike::SHOT_CLOCK::PLANT_BEFORE;
		case ELRStrikePhase::BackswingTop: return -LRStrike::SHOT_CLOCK::TOP_BEFORE;
		case ELRStrikePhase::Contact: return 0.0;
		case ELRStrikePhase::FollowThrough: return LRStrike::SHOT_CLOCK::FT_AFTER;
		case ELRStrikePhase::Land: return LRStrike::SHOT_CLOCK::LAND_AFTER;
		}
		return 0.0;
	}

	ELRShotGrade ToGrade(const LRMeter::FShotReleaseOut& R)
	{
		if (!R.bGraded) return ELRShotGrade::None;
		switch (R.Grade.Grade)
		{
		case LRMeter::EGrade::Perfect: return ELRShotGrade::Perfect;
		case LRMeter::EGrade::Good: return ELRShotGrade::Good;
		case LRMeter::EGrade::Scuff: return ELRShotGrade::Scuff;
		}
		return ELRShotGrade::None;
	}

	LRStrike::EFoot ToFoot(ELRPreferredFoot F)
	{
		return F == ELRPreferredFoot::Left ? LRStrike::EFoot::Left : F == ELRPreferredFoot::Both ? LRStrike::EFoot::Both : LRStrike::EFoot::Right;
	}
}

ULRStrikeComponent::ULRStrikeComponent()
{
	// everything happens on the ball's fixed step
	PrimaryComponentTick.bCanEverTick = false;
}

void ULRStrikeComponent::BeginPlay()
{
	Super::BeginPlay();
	BallComp = Ball ? Ball->GetBallComponent() : nullptr;
	if (BallComp.IsValid()) StepHandle = BallComp->OnPreFixedStep().AddUObject(this, &ULRStrikeComponent::OnFixedStep);
}

void ULRStrikeComponent::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (BallComp.IsValid() && StepHandle.IsValid()) BallComp->OnPreFixedStep().Remove(StepHandle);
	StepHandle.Reset();
	Super::EndPlay(EndPlayReason);
}

// ---------------------------------------------------------------------------------------------------------------------
// input (control.js controlInput: the button's time is counted in steps from its press)
// ---------------------------------------------------------------------------------------------------------------------

void ULRStrikeComponent::PressShot()
{
	if (!bLmb) { bLmb = true; LmbT = 0; }
}

void ULRStrikeComponent::ReleaseShot()
{
	if (!bLmb) return;
	bLmb = false;
	bShotReleaseQueued = true;
	QueuedShotHeld = LmbT;
}

void ULRStrikeComponent::PressFlick()
{
	if (!bMmb) { bMmb = true; MmbT = 0; }
}

void ULRStrikeComponent::ReleaseFlick()
{
	if (!bMmb) return;
	bMmb = false;
	bFlickReleaseQueued = true;
	QueuedFlickHeld = MmbT;
}

void ULRStrikeComponent::SetMoveKeys(bool bW, bool bA, bool bS, bool bD)
{
	bKeyW = bW; bKeyA = bA; bKeyS = bS; bKeyD = bD;
}

void ULRStrikeComponent::SetFinesseHeld(bool bHeld) { bFinesseHeld = bHeld; }

void ULRStrikeComponent::SetReleaseGesture(bool bLift, bool bDip)
{
	bLiftGesture = bLift; bDipGesture = bDip;
}

void ULRStrikeComponent::RequestKnockOn(FVector MoveDirection)
{
	bKnockQueued = true;
	KnockDir = MoveDirection;
}

// ---------------------------------------------------------------------------------------------------------------------
// the fixed step
// ---------------------------------------------------------------------------------------------------------------------

bool ULRStrikeComponent::KeyRecent(double KeyT, double NowT) const
{
	// control.js keyHeld: pressed (or still held) within the last SHOT_KEYS.T seconds
	return NowT - KeyT >= 0 && NowT - KeyT <= LRMeter::SHOT_KEYS_T;
}

double ULRStrikeComponent::TechniqueOf() const
{
	return LRMeter::TechniqueOf(Attributes.Aero, Attributes.Curve, Attributes.BallControl);
}

LRStrike::FBody ULRStrikeComponent::ReadBody() const
{
	LRStrike::FBody A;
	const AActor* Owner = GetOwner();
	if (!Owner || !BallComp.IsValid()) return A;
	FVector Root = Owner->GetActorLocation();
	// a character's location is its capsule's middle: the game's body is its root on the grass
	if (const ACharacter* C = Cast<ACharacter>(Owner))
	{
		if (const UCapsuleComponent* Cap = C->GetCapsuleComponent()) Root.Z -= Cap->GetScaledCapsuleHalfHeight();
	}
	const LRBall::FVec3 P = BallComp->WorldToSim(Root);
	const LRBall::FVec3 V = BallComp->WorldVectorToSim(Owner->GetVelocity());
	A.X = P.X; A.Z = P.Z; A.Y = 0;
	A.Vx = V.X; A.Vz = V.Z;
	A.Speed = std::sqrt(V.X * V.X + V.Z * V.Z);
	A.Yaw = BallComp->WorldDegToSimYaw(Owner->GetActorRotation().Yaw);
	A.Scale = Attributes.BodyScale;
	A.Foot = ToFoot(Attributes.PreferredFoot);
	A.SprintSpeed = Attributes.SprintSpeed;
	return A;
}

LRStrike::FStriker ULRStrikeComponent::ReadStriker() const
{
	LRStrike::FStriker S;
	S.Power = Attributes.ShotPower; S.Accuracy = Attributes.ShotAccuracy; S.PassAcc = Attributes.PassAccuracy; S.Passing = Attributes.Passing;
	S.Curve = Attributes.Curve; S.Aero = Attributes.Aero; S.Composure = Attributes.Composure; S.bStrikeBoots = Attributes.bStrikeBoots;
	S.BF = Attributes.Breath; S.EF = Attributes.Energy;
	return S;
}

LRStrike::FKickEnv ULRStrikeComponent::MakeEnv(double NowT, int32 StepIndex)
{
	LRStrike::FKickEnv Env;
	Env.Ball = &BallComp->GetState();
	Env.Pred = &BallComp->GetPredCache();
	Env.PredWorld = &BallComp->GetPredWorld();
	Env.Rng = &BallComp->GetRng();
	Env.NowT = NowT;
	Env.StepIndex = StepIndex;
	Env.Body = ReadBody();
	Env.Striker = ReadStriker();
	Env.bInControl = bInControl;
	Env.Pressure01 = Pressure;
	Env.bDeadBall = bDeadBall;
	Env.ScuffGoal = BallComp->WorldToSim(GoalCentre);
	Env.Agent = AgentId;
	Env.Team = TeamId;
	return Env;
}

FLRStrikeSteer ULRStrikeComponent::ToWorldSteer(const LRStrike::FKickSteer& S) const
{
	FLRStrikeSteer Out;
	if (!S.bSet || !BallComp.IsValid()) return Out;
	Out.bActive = true;
	if (S.bHasDir)
	{
		LRBall::FVec3 D;
		D.X = S.Dx; D.Y = 0; D.Z = S.Dz;
		Out.bHasDirection = true;
		Out.Direction = BallComp->SimVectorToWorld(D).GetSafeNormal();
	}
	Out.SpeedCap = static_cast<float>(FMath::Min(S.SpeedCap, 1.e5) * LRUnits::CmPerM);
	if (S.bHasFace)
	{
		Out.bHasFacing = true;
		Out.FacingYaw = static_cast<float>(BallComp->SimYawToWorldDeg(LRStrike::YawOf(S.FaceX, S.FaceZ)));
	}
	return Out;
}

void ULRStrikeComponent::OnFixedStep(double H, double NowT, int32 StepIndex)
{
	if (!BallComp.IsValid()) return;
	// the keys held now are "recent" (control.js line 754), the buttons' times count steps (lines 760-762)
	if (bKeyW) KeyTW = NowT;
	if (bKeyA) KeyTA = NowT;
	if (bKeyS) KeyTS = NowT;
	if (bKeyD) KeyTD = NowT;
	if (bLmb) LmbT += H;
	if (bMmb) MmbT += H;
	UpdateMeter(NowT);

	// the releases become actions this step (control.js queue "lup", "mup")
	if (bShotReleaseQueued) { bShotReleaseQueued = false; StartShot(QueuedShotHeld, NowT, StepIndex); }
	if (bFlickReleaseQueued) { bFlickReleaseQueued = false; StartFlickAct(QueuedFlickHeld, NowT); }

	Steer = FLRStrikeSteer();
	// the kick (actions.js actionStep 'kick')
	if (bKickOn)
	{
		LRStrike::FKickEnv Env = MakeEnv(NowT, StepIndex);
		LRStrike::FKickSteer S;
		const bool bContactNow = LRStrike::KickStep(Act, Env, H, S);
		Steer = ToWorldSteer(S);
		if (bContactNow) ContactActT = Act.ContactT;
		FirePhases(bContactNow);
		if (bContactNow)
		{
			FLRStrikeResult R;
			R.bStruck = Act.bStruck; R.bWhiff = Act.bWhiff; R.bScuffed = Act.bScuffed; R.bStepIn = Act.bStepIn;
			if (Act.bStruck)
			{
				const LRStrike::FStrikeLaunch& L = Act.Plan.Launch;
				R.LaunchVelocity = BallComp->SimVectorToWorld(L.V);
				R.LaunchSpin = BallComp->SimSpinToWorld(L.W);
				R.SpeedKmh = static_cast<float>(LRDetMath::Hypot(L.V.X, L.V.Y, L.V.Z) * 3.6);
				R.Clean = static_cast<float>(Act.Clean);
				R.Sigma = static_cast<float>(Act.Plan.Sigma);
				R.bKnuckle = L.Knuck.bOn;
			}
			R.Grade = ToGrade(Release);
			R.Shape = FString(Release.Shape.c_str());
			OnStrike.Broadcast(R);
		}
		// the act ends; its clock runs on for the landing, which can come after it (a strike in the reach window)
		if (Act.bDone && Act.T >= Act.Dur) bKickOn = false;
	}
	else if (PhasesFired != 0 && PhasesFired != 0x1F)
	{
		Act.T += H;
		FirePhases(false);
	}

	// the flick (actions.js flickStep)
	if (bFlickOn) FlickStep(H, NowT, StepIndex);

	// the knock-on (actions.js keepStep, Shift tapped twice)
	if (bKnockQueued) { bKnockQueued = false; KnockOnNow(NowT); }
}

void ULRStrikeComponent::UpdateMeter(double NowT)
{
	(void)NowT;
	// control.js meterStep: what is filling, and the shot's sweet spot for what you aim at now
	Meter = FLRMeterState();
	if (bLmb)
	{
		const LRBall::FVec3 B = BallComp->GetState().P, T = BallComp->WorldToSim(AimPoint);
		const LRMeter::FMeterBand Bd = LRMeter::MeterBand(LRMeter::JsHypot(T.X - B.X, T.Z - B.Z), TechniqueOf(), AssistLevel);
		const double P = LRMeter::ChargeP(LmbT);
		Meter.bOn = true; Meter.Charge = static_cast<float>(P);
		Meter.SweetLo = static_cast<float>(Bd.Lo); Meter.SweetHi = static_cast<float>(Bd.Hi);
		Meter.GoldLo = static_cast<float>(Bd.GLo); Meter.GoldHi = static_cast<float>(Bd.GHi);
		Meter.bInSweet = P >= Bd.Lo && P <= Bd.Hi;
		Meter.bInGold = P >= Bd.GLo && P <= Bd.GHi;
	}
	else if (bMmb)
	{
		Meter.bOn = true; Meter.bFlick = true;
		Meter.Charge = static_cast<float>(LRMeter::FlickCharge(MmbT, Attributes.BallControl));
	}
}

FLRMeterState ULRStrikeComponent::GetMeterBandFor(float DistanceCm) const
{
	FLRMeterState M;
	const LRMeter::FMeterBand Bd = LRMeter::MeterBand(DistanceCm * LRUnits::MPerCm, TechniqueOf(), AssistLevel);
	M.SweetLo = static_cast<float>(Bd.Lo); M.SweetHi = static_cast<float>(Bd.Hi);
	M.GoldLo = static_cast<float>(Bd.GLo); M.GoldHi = static_cast<float>(Bd.GHi);
	return M;
}

float ULRStrikeComponent::GetFlickFullTime() const
{
	return static_cast<float>(LRMeter::FlickFull(Attributes.BallControl));
}

// ---------------------------------------------------------------------------------------------------------------------
// the shot
// ---------------------------------------------------------------------------------------------------------------------

void ULRStrikeComponent::StartShot(double Held, double NowT, int32 StepIndex)
{
	if (bKickOn || bFlickOn) return;                    // busy (control.js noteWhy "busy")
	const LRBall::FBallState& B = BallComp->GetState();
	LRMeter::FShotReleaseIn In;
	In.Held = Held;
	In.BallP = B.P;
	In.LookPoint = BallComp->WorldToSim(AimPoint);
	In.ReticlePoint = In.LookPoint;
	In.bLookOnGoal = bAimOnGoal; In.bReticleOnGoal = bAimOnGoal;
	In.StepIndex = StepIndex;
	In.Contact = FMath::Clamp(Contact, -1, 1);
	In.bFinesseKey = bFinesseHeld;
	In.bKeyW = KeyRecent(KeyTW, NowT); In.bKeyA = KeyRecent(KeyTA, NowT); In.bKeyS = KeyRecent(KeyTS, NowT); In.bKeyD = KeyRecent(KeyTD, NowT);
	In.bLift = bLiftGesture; In.bDip = bDipGesture;
	In.Technique = TechniqueOf();
	In.AssistK = AssistLevel;
	In.Curve = Attributes.Curve;
	In.bLeftFooted = Attributes.PreferredFoot == ELRPreferredFoot::Left;
	In.bInControl = bInControl;
	In.bTargetInBox = bAimInBox;
	Release = LRMeter::BuildShotRelease(In);
	bLiftGesture = bDipGesture = false;
	const LRStrike::FKickEnv Env = MakeEnv(NowT, StepIndex);
	Act = LRStrike::StartKick(Env, Release.Ask);
	bKickOn = true;
	PhasesFired = 0;
	ContactActT = 0;
	bHaveContactPlace = false;
}

void ULRStrikeComponent::FirePhases(bool bContactNow)
{
	// the contact's time on the act's clock: known for a step-in and a strike in the window, not during a stride adjust
	if (Act.bAdjust && !Act.bDone) return;
	const double Tc = Act.bDone ? ContactActT : Act.Tc;
	for (int32 I = 0; I < 5; ++I)
	{
		const ELRStrikePhase P = static_cast<ELRStrikePhase>(I);
		if (PhasesFired & (1u << I)) continue;
		if (P == ELRStrikePhase::Contact)
		{
			// the contact fires when it happens (a whiff or a scuff included), never by the clock alone
			if (!bContactNow) break;
			FirePhase(P, Tc, true);
			continue;
		}
		const double At = Tc + PhaseOffset(P);
		if (P > ELRStrikePhase::Contact && !Act.bDone) break;
		if (Act.T >= At - 1e-9) FirePhase(P, At, false);
		else break;
	}
}

void ULRStrikeComponent::FirePhase(ELRStrikePhase Phase, double EventTime, bool /*bForce*/)
{
	PhasesFired |= static_cast<uint8>(1u << static_cast<uint32>(Phase));
	const double Tc = Act.bDone ? ContactActT : Act.Tc;
	FLRStrikeTiming T;
	T.Phase = Phase;
	T.ActTime = static_cast<float>(Act.T);
	T.ContactTime = static_cast<float>(Tc);
	T.TimeToContact = static_cast<float>(Tc - Act.T);
	T.EventTime = static_cast<float>(EventTime);
	T.bLate = Act.T - EventTime > 1.0 / 60 + 1e-9;
	T.bStepIn = Act.bStepIn;
	T.bLeftFoot = Act.bStepIn ? Act.StepIn.bLeftFoot : Act.bLeftFoot;
	T.ClipStartOffset = Phase == ELRStrikePhase::Plant ? static_cast<float>(FMath::Max(0.0, Act.T - EventTime)) : 0.f;
	// where the ball will be at the contact, the aim and the plant beside it (the clip's [0.33, -0.08]); after the
	// contact, as they were at it
	if (Phase > ELRStrikePhase::Contact && bHaveContactPlace)
	{
		T.PlantLocation = ContactPlant; T.BallAtContact = ContactBall; T.AimDirection = ContactAim;
	}
	else
	{
		const LRBall::FBallState& B = BallComp->GetState();
		const LRBall::FVec3 Bc = BallComp->GetPredCache().At(B, BallComp->GetSimTimeD(), FMath::Max(0.0, Tc - Act.T));
		double Fx = 0, Fz = -1;
		if (Act.bStepIn) { Fx = Act.StepIn.Fx; Fz = Act.StepIn.Fz; }
		else if (Act.Action.bHasTarget)
		{
			const double Dx = Act.Action.Target.X - Bc.X, Dz = Act.Action.Target.Z - Bc.Z, L = std::sqrt(Dx * Dx + Dz * Dz);
			if (L > 0) { Fx = Dx / L; Fz = Dz / L; }
		}
		const double Ss = T.bLeftFoot ? -1 : 1, Sc = Attributes.BodyScale != 0 ? Attributes.BodyScale : 1;
		LRBall::FVec3 Plant;
		Plant.X = Bc.X + (Fx * LRStrike::STEP_IN::PLANT_ALONG + Fz * Ss * LRStrike::STEP_IN::PLANT_LAT) * Sc;
		Plant.Y = 0;
		Plant.Z = Bc.Z + (Fz * LRStrike::STEP_IN::PLANT_ALONG - Fx * Ss * LRStrike::STEP_IN::PLANT_LAT) * Sc;
		T.PlantLocation = BallComp->SimToWorld(Plant);
		T.BallAtContact = BallComp->SimToWorld(Bc);
		LRBall::FVec3 Fd;
		Fd.X = Fx; Fd.Y = 0; Fd.Z = Fz;
		T.AimDirection = BallComp->SimVectorToWorld(Fd).GetSafeNormal();
		if (Phase == ELRStrikePhase::Contact)
		{
			bHaveContactPlace = true; ContactPlant = T.PlantLocation; ContactBall = T.BallAtContact; ContactAim = T.AimDirection;
		}
	}
	switch (Phase)
	{
	case ELRStrikePhase::Plant: OnPlant.Broadcast(T); break;
	case ELRStrikePhase::BackswingTop: OnBackswingTop.Broadcast(T); break;
	case ELRStrikePhase::Contact: OnContact.Broadcast(T); break;
	case ELRStrikePhase::FollowThrough: OnFollowThrough.Broadcast(T); break;
	case ELRStrikePhase::Land: OnLand.Broadcast(T); break;
	}
}

// ---------------------------------------------------------------------------------------------------------------------
// the flick (control.js flick, actions.js startFlick and flickStep) and the knock-on (actions.js knockOn)
// ---------------------------------------------------------------------------------------------------------------------

void ULRStrikeComponent::StartFlickAct(double Held, double NowT)
{
	if (bKickOn || bFlickOn) return;
	const LRBall::FBallState& B = BallComp->GetState();
	const LRStrike::FBody A = ReadBody();
	const double Sc = A.Scale != 0 ? A.Scale : 1;
	const double D = LRMeter::JsHypot(B.P.X - A.X, B.P.Z - A.Z);
	const bool bFree = B.State == LRBall::EBallState::Free;
	// the ball at your feet, or a ball low on its way to you first time (a sombrero)
	const bool bAtFeet = bInControl && bFree && B.P.Y < 0.5 && D <= 1.3 * Sc;
	bool bApproaching = false;
	{
		const double Dx = A.X - B.P.X, Dz = A.Z - B.P.Z, Dd = LRMeter::JsHypot(Dx, Dz);
		bApproaching = Dd < 25 && (Dx * B.V.X + Dz * B.V.Z) / (Dd != 0 ? Dd : 1) > 1;
	}
	const bool bComing = !bAtFeet && bFree && !bInControl && B.P.Y < 0.5 && D < 8 && bApproaching;
	if (!bAtFeet && !bComing) return;
	const bool bW = KeyRecent(KeyTW, NowT), bA = KeyRecent(KeyTA, NowT), bS = KeyRecent(KeyTS, NowT), bD = KeyRecent(KeyTD, NowT);
	FlickP = LRMeter::FlickP(Held, Attributes.BallControl);
	FlickFwd = (bW ? 1 : 0) - (bS ? 1 : 0);
	FlickSide = (bD ? 1 : 0) - (bA ? 1 : 0);
	bFlickFirst = bComing;
	FlickT = 0;
	FlickDur = LRStrike::FLICK::DUR + (bComing ? LRStrike::FLICK::WAIT : 0);
	FlickTc = bComing ? -1 : LRStrike::FLICK::TC;
	FlickFace = LRStrike::DirOf(A.Yaw);
	bFlickDone = false;
	bFlickOn = true;
}

void ULRStrikeComponent::FlickStep(double H, double NowT, int32 StepIndex)
{
	(void)StepIndex;
	FlickT += H;
	if (!bFlickDone)
	{
		LRBall::FBallState& B = BallComp->GetState();
		const LRStrike::FBody A = ReadBody();
		const double Sc = A.Scale != 0 ? A.Scale : 1, D = LRDetMath::Hypot(B.P.X - A.X, B.P.Z - A.Z);
		Steer.bActive = true;
		Steer.SpeedCap = static_cast<float>(FMath::Min(static_cast<double>(Steer.SpeedCap), (bFlickFirst ? A.Speed : 1.5) * LRUnits::CmPerM));
		const bool bOk = B.State == LRBall::EBallState::Free && B.P.Y < 0.6;
		bool bGo = false;
		if (bFlickFirst)
		{
			// the sombrero: met as it arrives, low and within reach; not reached in time: nothing
			if (FlickT > LRStrike::FLICK::WAIT) bFlickDone = true;
			else if (bOk && D <= LRStrike::FLICK::REACH * Sc) { FlickTc = FlickT; bGo = true; }
		}
		else if (FlickT >= FlickTc)
		{
			if (bOk && D <= 1.3 * Sc) bGo = true;
			else bFlickDone = true;
		}
		if (bGo)
		{
			bFlickDone = true;
			const LRStrike::FFlickResult R = LRStrike::FlickKick(B.P, B.RollDecel, FlickFace, FlickP, FlickFwd, FlickSide, Attributes.Strength, bFlickFirst,
				Attributes.PreferredFoot == ELRPreferredFoot::Left);
			LRBall::FTouch T;
			T.Agent = AgentId; T.Team = TeamId; T.Kind = "flick"; T.bHasT = true; T.T = NowT;
			LRBall::Kick(B, R.V, R.W, T);
			BallComp->RefreshPrediction();
			FLRStrikeResult Out;
			Out.bStruck = true;
			Out.LaunchVelocity = BallComp->SimVectorToWorld(R.V);
			Out.LaunchSpin = BallComp->SimSpinToWorld(R.W);
			Out.SpeedKmh = static_cast<float>(LRDetMath::Hypot(R.V.X, R.V.Y, R.V.Z) * 3.6);
			Out.Clean = 1.f;
			Out.Shape = FString(R.Flick) + TEXT(" ") + FString(R.Part);
			OnTouch.Broadcast(Out);
		}
	}
	if (FlickT >= FlickDur) bFlickOn = false;
}

void ULRStrikeComponent::KnockOnNow(double NowT)
{
	LRBall::FBallState& B = BallComp->GetState();
	const LRStrike::FBody A = ReadBody();
	const double Sc = A.Scale != 0 ? A.Scale : 1;
	const double D = LRDetMath::Hypot(B.P.X - A.X, B.P.Z - A.Z);
	if (!bInControl || D > LRStrike::KNOCK::REACH * Sc) return;
	// along the way he is going, else the way he faces (actions.js keepStep)
	const LRBall::FVec3 M = BallComp->WorldVectorToSim(KnockDir * LRUnits::CmPerM);
	double Ux, Uz;
	const double Ml = LRDetMath::Hypot(M.X, M.Z);
	if (Ml > 0.1) { Ux = M.X / Ml; Uz = M.Z / Ml; }
	else { const LRStrike::FDir2 F = LRStrike::DirOf(A.Yaw); Ux = F.X; Uz = F.Z; }
	LRBall::FVec3 V, W;
	LRStrike::KnockOnLaunch(B.RollDecel, Sc, A.Speed, A.SprintSpeed, Ux, Uz, V, W);
	LRBall::FTouch T;
	T.Agent = AgentId; T.Team = TeamId; T.Kind = "dribble"; T.bHasT = true; T.T = NowT;
	LRBall::Kick(B, V, W, T);
	BallComp->RefreshPrediction();
	FLRStrikeResult Out;
	Out.bStruck = true;
	Out.LaunchVelocity = BallComp->SimVectorToWorld(V);
	Out.LaunchSpin = BallComp->SimSpinToWorld(W);
	Out.SpeedKmh = static_cast<float>(LRDetMath::Hypot(V.X, V.Y, V.Z) * 3.6);
	Out.Clean = 1.f;
	Out.Shape = TEXT("knock");
	OnTouch.Broadcast(Out);
}
