// LRShotMeter.h: the shot meter, the shot's grade and the flick bar of js/life/football/control.js (bcs/integ
// 41c4cd0, identical on bcs/controls), as plain C++. Pure functions; the frame is the game's (metres, y up).
//
//   - The charge: holding the shot button for t seconds fills p = 1 - (1 - min(1, t/0.85))^2 (control.js line 1054).
//   - The sweet band (meterBand): centred on the power that suits the distance (0.55 at 8 m to 0.86 at 30 m), 0.12 wide
//     with no assists, 0.14 wider with them, a little wider with Technique, never past 0.91 (the over-hit is 0.92).
//     Its gold (perfect) spot is the middle 35% of the band (at least 0.04 wide).
//   - The grade (shotGrade): let go in the gold, "perfect"; in the band, "good" (1 to 2.5 degrees off the aim); outside
//     it, "scuff" (5 to 10 degrees off, at least 1.2 m; skied when over-hit, weak along the grass when under-hit).
//   - The flick bar: the wheel button held fills it in flickFull = (0.5/1.5)/flickRate(Ball Control) seconds.

#pragma once

#include "LRStrikeSolver.h"

namespace LRMeter
{
	using LRBall::FVec3;

	// control.js CN (line 167): the charge's numbers
	namespace CN
	{
		constexpr double SHOT_FULL = 0.85;   // seconds to a full charge
		constexpr double OVERHIT = 0.92;     // power over this is an over-hit (strike.js sigma)
		constexpr double TAP = 0.18;         // a press shorter than this is a tap: a placed side-foot, not graded
		constexpr double PASS_FULL = 0.8;
		constexpr double PASS_MIN = 4;
	}
	// control.js METER (lines 211-213)
	namespace METER
	{
		constexpr double SHOT_C0 = 0.55, SHOT_C1 = 0.86, SHOT_D0 = 8, SHOT_D1 = 30;
		constexpr double SHOT_W = 0.12, SHOT_WA = 0.14, TECH_W = 0.04, SHOT_MAX = 0.91;
		constexpr double GOLD = 0.35, GOLD_MIN = 0.04;
		constexpr double GOOD_DEG = 1, GOOD_DEG1 = 1.5, SCUFF_DEG = 5, SCUFF_DEG1 = 5, SCUFF_MIN = 1.2, SCUFF_P = 0.75;
		constexpr double PASS_W0 = 0.10, PASS_W1 = 0.25, PASS_WA = 0.6, SETTLE_LATCH = 0.5, CONE_A = 0.8;
	}
	// control.js AIM (lines 187-190): the parts the shot release uses
	namespace AIM
	{
		constexpr double OVER = 0.6;         // held past full, the lean back grows over this many seconds
		constexpr double LOW_Y = 0.6;        // a shot aimed under this height on goal is driven low
		constexpr double PLACED = 0.5;       // a tapped shot's power
		constexpr double CHIP = 0.72;        // a chip's share of the wind-up's power
		constexpr double PLACED_MAX = 0.72;
	}
	// control.js CURL (line 127): sidespin from A or D by the Curve skill
	namespace CURL
	{
		constexpr double MAX = 80, LO = 11, POW = 1;
	}
	// control.js FLICK_CHG (line 105)
	namespace FLICK_CHG
	{
		constexpr double BASE = 0.5 / 1.5;
		constexpr double PTS_X[4] = {0, 33, 55, 99};
		constexpr double PTS_Y[4] = {0.3, 0.6, 1.5, 3};
		constexpr double MAX = 3.5;
	}
	constexpr double SHOT_KEYS_T = 0.25;     // control.js SHOT_KEYS.T: keys held this recently shape the shot
	constexpr double KNOCK_TAP = 0.3;        // control.js KNOCK_TAP: two Shift presses this close are a knock-on
	// control.js ASSIST_K (line 92): on 1, low 0.5, off 0
	constexpr double ASSIST_ON = 1, ASSIST_LOW = 0.5, ASSIST_OFF = 0;

	struct FMeterBand
	{
		double Lo = 0, Hi = 0, C = 0, GLo = 0, GHi = 0;
	};
	enum class EGrade : unsigned char { Perfect, Good, Scuff };
	struct FGrade
	{
		EGrade Grade = EGrade::Good;
		double E = 0;                // how far off, 0..1
		bool bOver = false;          // past the band (over-hit)
	};
	struct FPassBand
	{
		double Lo = 0, Hi = 0, C = 0;
	};

	// control.js meterBand: the band for a strike D metres to its target, a Technique (0..99), an assist share (0..1)
	LEGENDRISING_API FMeterBand MeterBand(double D, double Tech = 50, double Ak = 1);
	// control.js shotGrade: how a shot let go at charge P sits on its band
	LEGENDRISING_API FGrade ShotGrade(double P, const FMeterBand& Band);
	// control.js passBand
	LEGENDRISING_API FPassBand PassBand(double Ideal, double VMax, double Passing = 50, double Ak = 1);
	// the shot charge after Held seconds (control.js lines 768 and 1054)
	LEGENDRISING_API double ChargeP(double Held);
	// control.js techniqueOf: 0.4 aero + 0.3 curve + 0.3 ball control (a 0 curve or control counts as 50)
	LEGENDRISING_API double TechniqueOf(double Aero, double Curve, double Ctrl);
	// control.js flickRate, flickFull: how fast the flick bar fills, and the seconds for a full bar
	LEGENDRISING_API double FlickRate(double Ctrl);
	LEGENDRISING_API double FlickFull(double Ctrl);
	// the flick bar on show while held (control.js line 771) and its share as it is let go (line 120)
	LEGENDRISING_API double FlickCharge(double Held, double Ctrl);
	LEGENDRISING_API double FlickP(double Held, double Ctrl);
	// control.js curlSpin
	LEGENDRISING_API double CurlSpin(double Curve);
	// V8's Math.hypot for two numbers (control.js measures the meter's distance with it, not detmath's hypot)
	LEGENDRISING_API double JsHypot(double A, double B);

	// ---------------------------------------------------------------------------------------------------------------
	// letting go of the shot (control.js strike(), the shot branch, lines 1052-1140)
	// ---------------------------------------------------------------------------------------------------------------
	struct FShotReleaseIn
	{
		double Held = 0;             // seconds the button was held
		FVec3 BallP;                 // the ball now
		FVec3 LookPoint;             // where you look (RP): the aim of a clean strike, and the meter's distance
		FVec3 ReticlePoint;          // the swaying reticle (Ret): the aim otherwise (set it to LookPoint for no sway)
		bool bLookOnGoal = true;     // RP.ok: the look is on the goal mouth
		bool bReticleOnGoal = true;  // Ret.ok
		double ReticleSwaySign = 0;  // sign of the reticle's sideways sway (0: the step's parity decides)
		int StepIndex = 0;           // ms.step
		int Contact = 0;             // the lesson's contact (CTRL.contact): -1 Low, 0 Normal, 1 High
		bool bFinesseKey = false;    // F held: a finesse strike
		bool bKeyW = false, bKeyA = false, bKeyS = false, bKeyD = false;   // held within SHOT_KEYS_T before the release
		bool bLift = false, bDip = false;      // the mouse gestures (a lift chips it, a flick down dips it)
		double Technique = 50;
		double AssistK = 1;
		double Curve = 50;
		bool bLeftFooted = false;
		bool bInControl = true;      // the ball is yours (else it is first time)
		bool bTargetInBox = false;   // for a lofted ball off goal: a cross (in the box) or a lob
	};
	struct FShotReleaseOut
	{
		LRStrike::FShotAsk Ask;      // the request for the kick
		FMeterBand Band;
		bool bGraded = false;        // a tap is not graded
		FGrade Grade;
		bool bInSpot = false, bClean = false, bScuff = false;
		double ChargeShown = 0;      // the meter's p at the release (before the shape changes it)
		std::string Shape;
		const char* FootPart = "";   // "inside"/"outside" for a curled shot
	};
	LEGENDRISING_API FShotReleaseOut BuildShotRelease(const FShotReleaseIn& In);
}
