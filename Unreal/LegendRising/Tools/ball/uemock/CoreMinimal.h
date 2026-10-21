// A tiny stand-in for the parts of Unreal's API the port uses, to compile and run it outside the engine. NOT Unreal.
#pragma once
#include <cmath>
#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include <cwchar>
#include <functional>
#include <memory>
#include <string>
#include <vector>
#include <algorithm>
typedef int32_t int32; typedef uint32_t uint32; typedef uint8_t uint8; typedef int64_t int64; typedef wchar_t TCHAR;
#define TEXT(x) L##x
#define UCLASS(...)
#define USTRUCT(...)
#define UENUM(...)
#define UPROPERTY(...)
#define UFUNCTION(...)
#define GENERATED_BODY()
#ifndef LEGENDRISING_API
#define LEGENDRISING_API
#endif
#define UE_KINDA_SMALL_NUMBER (1.e-4f)
#define UE_DOUBLE_PI (3.141592653589793238462643383279502884197169399)
#define WITH_DEV_AUTOMATION_TESTS 1
struct FMath {
  template<class T> static T Max(T A, T B){ return A > B ? A : B; }
  template<class T> static T Min(T A, T B){ return A < B ? A : B; }
  template<class T> static T Clamp(T V, T A, T B){ return V < A ? A : V > B ? B : V; }
  template<class T> static T Abs(T V){ return V < 0 ? -V : V; }
  static double Fmod(double A, double B){ return std::fmod(A, B); }
  static bool IsNearlyEqual(double A, double B, double T){ return std::fabs(A - B) <= T; }
};
struct FVector {
  double X = 0, Y = 0, Z = 0;
  FVector() {}
  explicit FVector(double V) : X(V), Y(V), Z(V) {}
  FVector(double A, double B, double C) : X(A), Y(B), Z(C) {}
  FVector operator+(const FVector& O) const { return FVector(X + O.X, Y + O.Y, Z + O.Z); }
  FVector operator-(const FVector& O) const { return FVector(X - O.X, Y - O.Y, Z - O.Z); }
  FVector operator-() const { return FVector(-X, -Y, -Z); }
  FVector operator*(double S) const { return FVector(X * S, Y * S, Z * S); }
  FVector operator/(double S) const { return FVector(X / S, Y / S, Z / S); }
  double Size() const { return std::sqrt(X * X + Y * Y + Z * Z); }
  FVector GetSafeNormal() const { const double L = Size(); return L > 1e-8 ? *this / L : FVector(); }
  bool Equals(const FVector& O, double T) const { return std::fabs(X - O.X) <= T && std::fabs(Y - O.Y) <= T && std::fabs(Z - O.Z) <= T; }
  static FVector CrossProduct(const FVector& A, const FVector& B){ return FVector(A.Y * B.Z - A.Z * B.Y, A.Z * B.X - A.X * B.Z, A.X * B.Y - A.Y * B.X); }
  static const FVector ZeroVector, OneVector, ForwardVector;
};
inline const FVector FVector::ZeroVector(0, 0, 0);
inline const FVector FVector::OneVector(1, 1, 1);
inline const FVector FVector::ForwardVector(1, 0, 0);
struct FRotator {
  double Pitch = 0, Yaw = 0, Roll = 0;
  FRotator() {}
  FRotator(double P, double Y, double R) : Pitch(P), Yaw(Y), Roll(R) {}
  FVector Vector() const { const double p = Pitch * UE_DOUBLE_PI / 180, y = Yaw * UE_DOUBLE_PI / 180; return FVector(std::cos(p) * std::cos(y), std::cos(p) * std::sin(y), std::sin(p)); }
};
struct FQuat {
  double X = 0, Y = 0, Z = 0, W = 1;
  FQuat() {}
  FQuat(double a, double b, double c, double d) : X(a), Y(b), Z(c), W(d) {}
  FQuat(const FVector& Axis, double Angle){ const double s = std::sin(Angle / 2); X = Axis.X * s; Y = Axis.Y * s; Z = Axis.Z * s; W = std::cos(Angle / 2); }
  FQuat operator*(const FQuat& Q) const { return FQuat(W*Q.X + X*Q.W + Y*Q.Z - Z*Q.Y, W*Q.Y - X*Q.Z + Y*Q.W + Z*Q.X, W*Q.Z + X*Q.Y - Y*Q.X + Z*Q.W, W*Q.W - X*Q.X - Y*Q.Y - Z*Q.Z); }
  void Normalize(){ const double L = std::sqrt(X*X + Y*Y + Z*Z + W*W); X /= L; Y /= L; Z /= L; W /= L; }
  static const FQuat Identity;
};
inline const FQuat FQuat::Identity(0, 0, 0, 1);
// yaw-only transform (all the port uses)
struct FTransform {
  double YawDeg = 0; FVector T;
  FTransform() {}
  FTransform(const FRotator& R, const FVector& Tr, const FVector&) : YawDeg(R.Yaw), T(Tr) {}
  FVector Rot(const FVector& V, double S) const { const double a = S * YawDeg * UE_DOUBLE_PI / 180, c = std::cos(a), s = std::sin(a); return FVector(c * V.X - s * V.Y, s * V.X + c * V.Y, V.Z); }
  FVector TransformPosition(const FVector& V) const { return Rot(V, 1) + T; }
  FVector InverseTransformPosition(const FVector& V) const { return Rot(V - T, -1); }
  FVector TransformVectorNoScale(const FVector& V) const { return Rot(V, 1); }
  FVector InverseTransformVectorNoScale(const FVector& V) const { return Rot(V, -1); }
  FRotator Rotator() const { return FRotator(0, YawDeg, 0); }
};
struct FString {
  std::wstring S;
  FString() {}
  FString(const char* C){ while (C && *C) S.push_back(static_cast<wchar_t>(*C++)); }
  FString(const wchar_t* C) : S(C ? C : L"") {}
  int32 Len() const { return static_cast<int32>(S.size()); }
  wchar_t operator[](int32 I) const { return S[I]; }
  const wchar_t* operator*() const { return S.c_str(); }
  FString operator+(const FString& O) const { FString R; R.S = S + O.S; return R; }
  FString operator+(const wchar_t* O) const { FString R; R.S = S + O; return R; }
  static FString Printf(const wchar_t* Fmt, ...){ wchar_t B[2048]; va_list A; va_start(A, Fmt); vswprintf(B, 2048, Fmt, A); va_end(A); return FString(B); }
};
struct FName {
  std::string S;
  FName() {}
  FName(const char* C) : S(C ? C : "") {}
  bool IsNone() const { return S.empty(); }
  FString ToString() const { return FString(S.c_str()); }
};
#define NAME_None FName()
template<class T> struct TArray {
  std::vector<T> V;
  void Add(const T& X){ V.push_back(X); }
  int32 Num() const { return static_cast<int32>(V.size()); }
  void Reserve(int32 N){ V.reserve(N); }
  typename std::vector<T>::const_iterator begin() const { return V.begin(); }
  typename std::vector<T>::const_iterator end() const { return V.end(); }
};
template<class T> using TObjectPtr = T*;
template<class T> struct TWeakObjectPtr {
  T* P = nullptr;
  TWeakObjectPtr() {}
  TWeakObjectPtr(T* X) : P(X) {}
  bool IsValid() const { return P != nullptr; }
  T* operator->() const { return P; }
  T* Get() const { return P; }
};
struct FDelegateHandle { int64 Id = 0; bool IsValid() const { return Id != 0; } void Reset(){ Id = 0; } };
#define DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(Name, T1, N1) \
  struct Name { std::vector<std::function<void(T1)>> Fns; void AddLambda(std::function<void(T1)> F){ Fns.push_back(F); } void Broadcast(T1 A) const { for (auto& F : Fns) F(A); } };
#define DECLARE_MULTICAST_DELEGATE_ThreeParams(Name, T1, T2, T3) \
  struct Name { std::vector<std::pair<int64, std::function<void(T1, T2, T3)>>> Fns; int64 Next = 1; \
    template<class O, class M> FDelegateHandle AddUObject(O* Obj, M Fn){ FDelegateHandle H; H.Id = Next++; Fns.push_back({H.Id, [Obj, Fn](T1 a, T2 b, T3 c){ (Obj->*Fn)(a, b, c); }}); return H; } \
    void Remove(FDelegateHandle H){ Fns.erase(std::remove_if(Fns.begin(), Fns.end(), [&](auto& p){ return p.first == H.Id; }), Fns.end()); } \
    void Broadcast(T1 a, T2 b, T3 c) const { for (auto& p : Fns) p.second(a, b, c); } };
enum ETickingGroup { TG_PrePhysics, TG_DuringPhysics, TG_PostPhysics };
enum ELevelTick { LEVELTICK_All };
struct FActorComponentTickFunction { bool bCanEverTick = false, bStartWithTickEnabled = false; ETickingGroup TickGroup = TG_DuringPhysics; };
struct FActorTickFunction { bool bCanEverTick = false; };
enum class ETeleportType { None, TeleportPhysics };
namespace EEndPlayReason { enum Type { Destroyed, RemovedFromWorld }; }
struct FHitResult {};
class AActor;
class UActorComponent {
public:
  typedef UActorComponent Super;
  virtual ~UActorComponent() {}
  FActorComponentTickFunction PrimaryComponentTick;
  AActor* OwnerPtr = nullptr;
  AActor* GetOwner() const { return OwnerPtr; }
  virtual void BeginPlay() {}
  virtual void EndPlay(const EEndPlayReason::Type) {}
  virtual void TickComponent(float, ELevelTick, FActorComponentTickFunction*) {}
};
class USceneComponent : public UActorComponent {};
class AActor {
public:
  typedef AActor Super;
  virtual ~AActor() {}
  FActorTickFunction PrimaryActorTick;
  FVector Loc, Vel; FRotator Rot; FQuat Quat;
  USceneComponent* Root = nullptr;
  std::vector<std::unique_ptr<UActorComponent>> Owned;
  FVector GetActorLocation() const { return Loc; }
  FRotator GetActorRotation() const { return Rot; }
  FQuat GetActorQuat() const { return Quat; }
  FVector GetVelocity() const { return Vel; }
  bool SetActorLocation(const FVector& L, bool, FHitResult*, ETeleportType){ Loc = L; return true; }
  bool SetActorRotation(const FQuat& Q, ETeleportType){ Quat = Q; return true; }
  virtual void OnConstruction(const FTransform&) {}
  template<class T> T* CreateDefaultSubobject(const TCHAR*){ T* C = new T(); C->OwnerPtr = this; Owned.emplace_back(C); return C; }
  void SetRootComponent(USceneComponent* C){ Root = C; }
};
template<class T, class F> T* Cast(F* X){ return dynamic_cast<T*>(X); }
template<class T, class F> const T* Cast(const F* X){ return dynamic_cast<const T*>(X); }
