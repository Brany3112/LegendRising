using UnrealBuildTool;

public class LegendRisingTarget : TargetRules
{
	public LegendRisingTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("LegendRising");
	}
}
