#pragma once
#include "CoreMinimal.h"
class UCapsuleComponent : public USceneComponent { public: float HalfHeight = 90.f; float GetScaledCapsuleHalfHeight() const { return HalfHeight; } };
