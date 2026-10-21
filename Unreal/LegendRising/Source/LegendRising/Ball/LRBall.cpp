// LRBall.cpp: see LRBall.h.

#include "LRBall.h"

#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "LRBallComponent.h"
#include "UObject/ConstructorHelpers.h"

ALRBall::ALRBall()
{
	PrimaryActorTick.bCanEverTick = false;

	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	SetRootComponent(Mesh);
	Mesh->SetSimulatePhysics(false);
	Mesh->SetEnableGravity(false);
	Mesh->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	Mesh->SetCollisionProfileName(TEXT("OverlapAllDynamic"));
	Mesh->SetGenerateOverlapEvents(false);
	Mesh->SetCanEverAffectNavigation(false);
	Mesh->SetMobility(EComponentMobility::Movable);

	// the engine's unit sphere (100 cm across) until a football mesh is set on a Blueprint child
	static ConstructorHelpers::FObjectFinder<UStaticMesh> SphereMesh(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
	if (SphereMesh.Succeeded()) Mesh->SetStaticMesh(SphereMesh.Object);

	Ball = CreateDefaultSubobject<ULRBallComponent>(TEXT("Ball"));
}

void ALRBall::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	// the mesh at the game's size: 0.11 m radius
	const float S = RadiusCm / FMath::Max(1.f, MeshAuthoredRadiusCm);
	Mesh->SetRelativeScale3D(FVector(S));
}
