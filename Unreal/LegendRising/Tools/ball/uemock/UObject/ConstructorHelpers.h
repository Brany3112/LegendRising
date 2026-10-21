#pragma once
#include "CoreMinimal.h"
namespace ConstructorHelpers { template<class T> struct FObjectFinder { T* Object = nullptr; explicit FObjectFinder(const TCHAR*) {} bool Succeeded() const { return Object != nullptr; } }; }
