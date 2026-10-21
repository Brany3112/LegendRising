#pragma once
#include "CoreMinimal.h"
enum class EAutomationTestFlags : uint32 { EditorContext = 1, EngineFilter = 2 };
inline EAutomationTestFlags operator|(EAutomationTestFlags A, EAutomationTestFlags B){ return static_cast<EAutomationTestFlags>(static_cast<uint32>(A) | static_cast<uint32>(B)); }
class FAutomationTestBase {
public:
  std::wstring Name; int Errors = 0;
  virtual ~FAutomationTestBase() {}
  virtual bool RunTest(const FString&) = 0;
  void AddError(const FString& S, int32 = 0){ Errors++; std::printf("    ERROR %s\n", std::string(S.S.begin(), S.S.end()).c_str()); }
  void AddInfo(const FString& S, int32 = 0){ std::printf("    info  %s\n", std::string(S.S.begin(), S.S.end()).c_str()); }
  bool TestTrue(const TCHAR* W, bool B){ if (!B) AddError(FString(W) + L" is false"); return B; }
  bool TestEqual(const TCHAR* W, double A, double E, double T = 1e-4){ if (std::fabs(A - E) > T) { AddError(FString::Printf(L"%ls: %.17g vs %.17g", W, A, E)); return false; } return true; }
  bool TestEqual(const TCHAR* W, int32 A, int32 E){ if (A != E) { AddError(FString::Printf(L"%ls: %d vs %d", W, A, E)); return false; } return true; }
  bool TestEqual(const TCHAR* W, const FVector& A, const FVector& E, double T = 1e-4){ if (!A.Equals(E, T)) { AddError(FString::Printf(L"%ls: (%g %g %g) vs (%g %g %g)", W, A.X, A.Y, A.Z, E.X, E.Y, E.Z)); return false; } return true; }
};
inline std::vector<FAutomationTestBase*>& AllTests(){ static std::vector<FAutomationTestBase*> V; return V; }
#define IMPLEMENT_SIMPLE_AUTOMATION_TEST(Class, PrettyName, Flags) \
  class Class : public FAutomationTestBase { public: Class(){ Name = TEXT(PrettyName); AllTests().push_back(this); } bool RunTest(const FString& Parameters) override; }; \
  static Class Class##Instance;
