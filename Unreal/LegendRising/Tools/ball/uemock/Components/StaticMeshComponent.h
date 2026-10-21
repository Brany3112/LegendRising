#pragma once
#include "CoreMinimal.h"
#include "Engine/StaticMesh.h"
namespace ECollisionEnabled { enum Type { NoCollision, QueryOnly }; }
namespace EComponentMobility { enum Type { Static, Movable }; }
class UStaticMeshComponent : public USceneComponent { public:
  FVector Scale;
  void SetSimulatePhysics(bool) {} void SetEnableGravity(bool) {} void SetCollisionEnabled(ECollisionEnabled::Type) {}
  void SetCollisionProfileName(const TCHAR*) {} void SetGenerateOverlapEvents(bool) {} void SetCanEverAffectNavigation(bool) {}
  void SetMobility(EComponentMobility::Type) {} bool SetStaticMesh(UStaticMesh*){ return true; } void SetRelativeScale3D(const FVector& S){ Scale = S; } };
