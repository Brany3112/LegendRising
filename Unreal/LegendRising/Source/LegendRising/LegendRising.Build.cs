using UnrealBuildTool;

public class LegendRising : ModuleRules
{
	public LegendRising(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "InputCore", "EnhancedInput" });
		// the module folder (for "Ball/LRBallCore.h" style includes) and each subfolder (for plain file-name includes)
		PublicIncludePaths.AddRange(new string[] { ModuleDirectory, ModuleDirectory + "/Ball", ModuleDirectory + "/Strike", ModuleDirectory + "/Player" });
	}
}
