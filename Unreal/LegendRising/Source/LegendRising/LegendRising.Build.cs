using UnrealBuildTool;

public class LegendRising : ModuleRules
{
	public LegendRising(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "InputCore", "EnhancedInput" });
		// the folders hold their own headers (Ball/, Strike/, Player/), included by file name
		PublicIncludePaths.AddRange(new string[] { ModuleDirectory + "/Ball", ModuleDirectory + "/Strike", ModuleDirectory + "/Player" });
	}
}
