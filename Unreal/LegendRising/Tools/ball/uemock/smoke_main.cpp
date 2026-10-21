// Runs the automation tests and drives the components through a shot, a flick and a knock-on in the UE mock.
#include "CoreMinimal.h"
#include "Misc/AutomationTest.h"
#include "Ball/LRBall.h"
#include "Ball/LRBallComponent.h"
#include "Strike/LRStrikeComponent.h"
#include "GameFramework/Character.h"
#include <cstdio>

static const char* PhaseName(ELRStrikePhase P){ const char* N[] = {"Plant", "BackswingTop", "Contact", "FollowThrough", "Land"}; return N[static_cast<int>(P)]; }

int main(){
  int Fails = 0;
  for (FAutomationTestBase* T : AllTests()){ std::printf("%s\n", std::string(T->Name.begin(), T->Name.end()).c_str()); T->RunTest(FString()); if (T->Errors) Fails++; }
  std::printf("automation tests: %d failing\n", Fails);

  ALRBall* Ball = new ALRBall();
  Ball->Loc = FVector(1000, 500, 11); Ball->Rot = FRotator(0, 30, 0);
  static_cast<AActor*>(Ball)->OnConstruction(FTransform());
  ULRBallComponent* BC = Ball->GetBallComponent();
  BC->OwnerPtr = Ball;
  BC->BeginPlay();
  ACharacter* Me = new ACharacter();
  ULRStrikeComponent* S = Me->CreateDefaultSubobject<ULRStrikeComponent>(TEXT("Strike"));
  S->Ball = Ball;
  LRBall::FVec3 Stand; Stand.X = 0; Stand.Y = 0; Stand.Z = 0.55;
  Me->Loc = BC->SimToWorld(Stand) + FVector(0, 0, 90);
  Me->Rot = FRotator(0, BC->SimYawToWorldDeg(0), 0);
  LRBall::FVec3 Aim; Aim.X = 1; Aim.Y = 1; Aim.Z = -20;
  S->AimPoint = BC->SimToWorld(Aim);
  S->BeginPlay();
  auto Phase = [&](const FLRStrikeTiming& T){ std::printf("  step %3d %-14s act %.4f contact %.4f toContact %+.4f late %d stepIn %d clipStart %.3f plant (%.1f %.1f %.1f)\n",
    BC->GetStepIndex(), PhaseName(T.Phase), T.ActTime, T.ContactTime, T.TimeToContact, T.bLate, T.bStepIn, T.ClipStartOffset, T.PlantLocation.X, T.PlantLocation.Y, T.PlantLocation.Z); };
  S->OnPlant.AddLambda(Phase); S->OnBackswingTop.AddLambda(Phase); S->OnContact.AddLambda(Phase); S->OnFollowThrough.AddLambda(Phase); S->OnLand.AddLambda(Phase);
  S->OnStrike.AddLambda([&](const FLRStrikeResult& R){ std::printf("  STRIKE struck %d whiff %d scuffed %d stepIn %d %.1f km/h v (%.1f %.1f %.1f) clean %.2f grade %d knuckle %d shape %s\n",
    R.bStruck, R.bWhiff, R.bScuffed, R.bStepIn, R.SpeedKmh, R.LaunchVelocity.X, R.LaunchVelocity.Y, R.LaunchVelocity.Z, R.Clean, (int)R.Grade, R.bKnuckle, std::string(R.Shape.S.begin(), R.Shape.S.end()).c_str()); });
  S->OnTouch.AddLambda([&](const FLRStrikeResult& R){ std::printf("  TOUCH %s %.1f km/h v (%.1f %.1f %.1f)\n", std::string(R.Shape.S.begin(), R.Shape.S.end()).c_str(), R.SpeedKmh, R.LaunchVelocity.X, R.LaunchVelocity.Y, R.LaunchVelocity.Z); });
  BC->OnBallEvent.AddLambda([&](const FLRBallEventInfo& E){ if (E.Type != ELRBallEventType::Touch) std::printf("  ball event %d at t %.3f (%.0f %.0f %.0f)\n", (int)E.Type, E.SimTime, E.Location.X, E.Location.Y, E.Location.Z); });
  const float Dt = 1.f / 60;
  std::printf("shot: hold 25 steps\n");
  S->PressShot();
  for (int I = 0; I < 25; I++) BC->TickComponent(Dt, LEVELTICK_All, nullptr);
  FLRMeterState M = S->GetMeter();
  std::printf("  meter on %d charge %.3f band [%.3f %.3f] gold [%.3f %.3f] sweet %d gold %d\n", M.bOn, M.Charge, M.SweetLo, M.SweetHi, M.GoldLo, M.GoldHi, M.bInSweet, M.bInGold);
  S->ReleaseShot();
  for (int I = 0; I < 50; I++){ BC->TickComponent(Dt, LEVELTICK_All, nullptr); FLRStrikeSteer St = S->GetSteer(); if (I < 3 && St.bActive) std::printf("  steer dir (%.2f %.2f) cap %.0f cm/s facing %.1f\n", St.Direction.X, St.Direction.Y, St.SpeedCap, St.FacingYaw); }
  FVector L = BC->GetBallLocation(); std::printf("  ball after: (%.0f %.0f %.0f) striking %d\n", L.X, L.Y, L.Z, S->IsStriking());

  std::printf("flick: ball back at the feet, hold MMB 10 steps, W held\n");
  LRBall::FVec3 Feet; Feet.X = 0; Feet.Y = 0.11; Feet.Z = -0.3;
  BC->PlaceBall(BC->SimToWorld(Feet));
  S->SetMoveKeys(true, false, false, false);
  S->PressFlick();
  for (int I = 0; I < 10; I++) BC->TickComponent(Dt, LEVELTICK_All, nullptr);
  S->SetMoveKeys(false, false, false, false);
  S->ReleaseFlick();
  for (int I = 0; I < 40; I++) BC->TickComponent(Dt, LEVELTICK_All, nullptr);
  std::printf("knock-on: ball at the feet, along the facing\n");
  BC->PlaceBall(BC->SimToWorld(Feet));
  BC->TickComponent(Dt, LEVELTICK_All, nullptr);
  S->RequestKnockOn(FVector::ZeroVector);
  for (int I = 0; I < 60; I++) BC->TickComponent(Dt, LEVELTICK_All, nullptr);
  L = BC->GetBallLocation(); FVector Bv = BC->GetBallVelocity();
  std::printf("  ball 1 s after the knock: (%.0f %.0f %.0f) v (%.0f %.0f %.0f)\n", L.X, L.Y, L.Z, Bv.X, Bv.Y, Bv.Z);
  std::printf("out of reach: ball 3 m ahead, a 0.3 s charge (stride adjust, then the scuff/whiff)\n");
  LRBall::FVec3 Far; Far.X = 0; Far.Y = 0.11; Far.Z = -2.5;
  BC->PlaceBall(BC->SimToWorld(Far));
  S->PressShot();
  for (int I = 0; I < 18; I++) BC->TickComponent(Dt, LEVELTICK_All, nullptr);
  S->ReleaseShot();
  for (int I = 0; I < 60; I++) BC->TickComponent(Dt, LEVELTICK_All, nullptr);
  return Fails;
}
