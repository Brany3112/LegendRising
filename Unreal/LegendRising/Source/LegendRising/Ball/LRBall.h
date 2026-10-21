// LRBall.h: the ball actor. A static mesh sized to the game's ball (radius 0.11 m = 11 cm) and the simulation that
// moves it (ULRBallComponent). The mesh never simulates physics: Chaos would fight the deterministic ball.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "LRBall.generated.h"

class UStaticMeshComponent;
class ULRBallComponent;

UCLASS()
class LEGENDRISING_API ALRBall : public AActor
{
	GENERATED_BODY()

public:
	ALRBall();

	// the ball's radius in centimetres (ball.js BALL.R = 0.11 m)
	static constexpr float RadiusCm = 11.f;

	UFUNCTION(BlueprintPure, Category = "LR|Ball")
	ULRBallComponent* GetBallComponent() const { return Ball; }

	UFUNCTION(BlueprintPure, Category = "LR|Ball")
	UStaticMeshComponent* GetMesh() const { return Mesh; }

protected:
	// drawn only: no collision response, no physics (queries may still see it)
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "LR|Ball")
	TObjectPtr<UStaticMeshComponent> Mesh;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "LR|Ball")
	TObjectPtr<ULRBallComponent> Ball;

	// the radius of the mesh asset as authored, cm (the engine's /Engine/BasicShapes/Sphere is 50); the mesh is scaled
	// to RadiusCm from it
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "LR|Ball")
	float MeshAuthoredRadiusCm = 50.f;

	virtual void OnConstruction(const FTransform& Transform) override;
};
