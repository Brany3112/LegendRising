#pragma once
#include "CoreMinimal.h"
#include "Components/CapsuleComponent.h"
class ACharacter : public AActor { public: UCapsuleComponent Capsule; UCapsuleComponent* GetCapsuleComponent() const { return const_cast<UCapsuleComponent*>(&Capsule); } };
