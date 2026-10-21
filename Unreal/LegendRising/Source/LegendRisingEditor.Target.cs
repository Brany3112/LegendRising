using UnrealBuildTool;

public class LegendRisingEditorTarget : TargetRules
{
	public LegendRisingEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("LegendRising");
	}
}
