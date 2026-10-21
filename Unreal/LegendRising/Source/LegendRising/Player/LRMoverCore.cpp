// LRMoverCore.cpp: see the header. Every function names the JS it ports; the comments in quotes are the game's own.

#include "LRMoverCore.h"

#include <cmath>

namespace LRMove
{
	// ---------------------------------------------------------------------------------------------------------------
	// Stamina (stamina.js)
	// ---------------------------------------------------------------------------------------------------------------

	FStaminaFactors FStaminaFactors::FromBreath(double Breath, double EnergyFactor)
	{
		FStaminaFactors F;
		const double BF = SStep(0.0, Stam::BF_FULL, Breath);
		const double E = Clamp(EnergyFactor, 0.0, 1.0);
		F.BF = BF;
		F.EF = E;
		F.Speed = 0.45 + 0.55 * BF;
		F.ESpeed = 0.92 + 0.08 * E;
		F.Accel = 0.75 + 0.25 * BF;
		F.Turn = 0.88 + 0.12 * BF;
		F.Aim = 1.0 + 0.25 * (1.0 - BF) + 0.35 * (1.0 - E);
		F.Power = (0.9 + 0.1 * BF) * (0.9 + 0.1 * E);
		F.Touch = 0.08 * (1.0 - BF);
		F.Lean = 1.0 - 0.15 * (1.0 - BF);
		return F;
	}

	double StaminaKs(double StaminaSkill)
	{
		return Max2(0.45, 1.43 - 0.0086 * Clamp(StaminaSkill, 0.0, 100.0));
	}

	double EnergyFactorOf(double Energy)
	{
		return 0.6 + 0.4 * SStep(0.0, 60.0, Energy);
	}

	double FStaminaPool::CapOf(double Energy, double Fatigue)
	{
		// stamina.js CAP {LATE0: 0.86, LATE_FROM: 40}: above energy 40 the cap follows the energy all the way up
		const double T = Clamp((Energy - 40.0) / (100.0 - 40.0), 0.0, 1.0);
		const double Late = 0.86 + (1.0 - 0.86) * T * std::sqrt(T);
		return 100.0 * Min2(0.6 + 0.4 * SStep(10.0, 60.0, Energy), Late) * (1.0 - 0.3 * SStep(50.0, 100.0, Fatigue));
	}

	EEffort EffortOf(EGait Gait, double V, double RunSpeed)
	{
		// "a sprint held under the run speed (above a jog) is 'sprint-run' or 'sprint-jog': counted as the sprint it is
		// once the breath is low enough to cap the speed"
		if (Gait == EGait::Sprint && V > RunSpeed) return EEffort::Sprint;
		if (Gait == EGait::Sprint && V > Stam::JOG_V) return V > Stam::RUN_V ? EEffort::SprintRun : EEffort::SprintJog;
		if (V > Stam::RUN_V) return EEffort::Run;
		if (V > Stam::JOG_V) return EEffort::Jog;
		if (V > Stam::WALK_V) return EEffort::Walk;
		return EEffort::Stand;
	}

	void FStaminaPool::Step(double H, EEffort Effort, double StaminaSkill, double EnergyFactor)
	{
		if (!(H > 0.0)) return;
		const double S = StaminaSkill;
		const double Ks = StaminaKs(S);
		if (Effort == EEffort::SprintRun || Effort == EEffort::SprintJog)
		{
			Effort = B < Stam::BF_FULL ? EEffort::Sprint : (Effort == EEffort::SprintRun ? EEffort::Run : EEffort::Jog);
		}
		const double Drain = bInfinite ? 0.0 : (Effort == EEffort::Sprint ? Stam::SPRINT * Ks : (Effort == EEffort::Run ? Stam::RUN * Ks : 0.0));
		if (Drain > 0.0)
		{
			B = Max2(0.0, B - Drain * H);
			RecoverDelay = Stam::DELAY;
		}
		else
		{
			double Rest = H;
			if (RecoverDelay > 0.0)
			{
				const double Used = Min2(RecoverDelay, H);
				RecoverDelay -= Used;
				Rest -= Used;
			}
			if (Rest > 0.0)
			{
				const double Rec = Effort == EEffort::Stand ? Stam::REC_STAND : Effort == EEffort::Walk ? Stam::REC_WALK : Effort == EEffort::Jog ? Stam::REC_JOG : 0.0;
				const double Rate = Rec * (0.7 + 0.6 * Clamp(S, 0.0, 100.0) / 100.0) * (0.75 + 0.25 * EnergyFactor);
				B = Min2(Cap, B + Rate * Rest);
			}
		}
		if (B > Cap || bInfinite) B = Cap;
		const bool bSprinting = Effort == EEffort::Sprint;
		SprintT = bSprinting ? SprintT + H : 0.0;
		SprintFrac += ((bSprinting ? 1.0 : 0.0) - SprintFrac) * (1.0 - std::exp(-H / Stam::SPRINT_TAU));
	}

	// ---------------------------------------------------------------------------------------------------------------
	// The mover (mover.js)
	// ---------------------------------------------------------------------------------------------------------------

	// mover.js skill(): missing or not finite counts as 50; 1..110 (a boosted skill's play value goes past 99)
	static double SkillOf(double V)
	{
		return Clamp((V < 0.0 || !std::isfinite(V)) ? 50.0 : V, 1.0, 110.0);
	}

	double AccelMul(double Acceleration)
	{
		const double A = Clamp((Acceleration < 0.0 || !std::isfinite(Acceleration)) ? 50.0 : Acceleration, 1.0, 110.0);
		if (A >= 50.0) return 1.0 + (Move::ACC_TOP - 1.0) * (A - 50.0) / 49.0;
		return Max2(0.55, A >= 40.0 ? 1.0 - 0.02 * (50.0 - A) : 0.8 - 0.018 * (40.0 - A));
	}

	FMoverParams FMoverParams::Football(const FMoverSkills& Skills)
	{
		// FOOTBALL: walk 1.5 (toggle), jog 3.4 + 0.008 pace (default), run 5.0 + 0.012 pace (AI, and the ladder), sprint
		// 6.6 + 0.028 pace (x1.03 grip boots), backpedal 3.2 and strafe 4.0 caps, a0 6.0 + 0.025 pace, brake 7.5,
		// plant 9.0, aLat 7.5 + 0.05 (agility - 50), turn rate 9 (0.85 + 0.003 agility), sprint cone 35 degrees;
		// all speeds x MOVE.SPEED_MUL and the push x MOVE.A0_MUL (U28 part B)
		const double Pace = SkillOf(Skills.SprintSpeed >= 0.0 ? Skills.SprintSpeed : Skills.Pace);
		const double Drib = SkillOf(Skills.Dribbling);
		const double Acc = SkillOf(Skills.Acceleration >= 0.0 ? Skills.Acceleration : Skills.Pace);
		const double Agility = (Skills.Agility >= 0.0 && std::isfinite(Skills.Agility)) ? SkillOf(Skills.Agility) : (Acc + Drib) / 2.0;
		const double Sm = Move::SPEED_MUL;
		const double Sprint = Max2(5.8 + 0.012 * Pace, 6.6 + 0.028 * Pace - 0.052 * Max2(0.0, 50.0 - Pace)) * (Skills.bGripBoots ? 1.03 : 1.0) * Sm;

		FMoverParams P;
		P.Pace = Pace;
		P.Agility = Agility;
		P.Acceleration = Acc;
		P.Walk = 1.5;
		P.Jog = (3.4 + 0.008 * Pace) * Sm;
		P.Run = (5.0 + 0.012 * Pace) * Sm;
		P.Sprint = Sprint;
		P.VMax = Sprint;
		P.Back = 3.2; P.Strafe = 4.0; P.BackMul = 1.0; P.StrafeMul = 1.0;
		P.A0 = (6.0 + 0.025 * Pace) * AccelMul(Acc) * Move::A0_MUL;
		P.Brake = 7.5;
		P.Plant = 9.0 * Clamp(1.0 - 0.004 * (Agility - 50.0), 0.8, 1.15);
		P.ALat = 7.5 + 0.05 * (Agility - 50.0);
		P.WMax = 9.0 * (0.85 + 0.003 * Agility);
		P.WalkA = 0.0; P.WalkBrake = 0.0;
		P.bTurnFirst = false; P.TurnFirstRate = 0.0;
		P.SprintCone = 35 * Deg; P.SprintBuild = 0.0; P.SprintFade = 0.0;
		P.CutAngle = 35 * Deg; P.CutMin = 3.0; P.CutFloor = Clamp(0.3 + 0.002 * (Agility - 50.0), 0.2, 0.42);
		P.FaceRate = 12.0; P.StaggerCap = 2.0; P.StaggerT = 0.35;
		return P;
	}

	double SprintSpeedOf(const FMoverParams& P, const FStaminaFactors& Fac)
	{
		return (P.Jog + (P.Sprint - P.Jog) * Fac.Speed) * Fac.ESpeed;
	}

	double GaitSpeedOf(const FMoverParams& P, const FStaminaFactors& Fac, EGait Gait)
	{
		const double Top = SprintSpeedOf(P, Fac);
		switch (Gait)
		{
		case EGait::Walk: return Min2(P.Walk, Top);
		case EGait::Jog: return Min2(P.Jog, Top);
		case EGait::Run: return Min2(P.Run, Top);
		case EGait::Sprint: return Top;
		default: return 0.0;
		}
	}

	void MoverStep(FMoverState& M, const FMoverIntent& It, const FMoverParams& P, const FStaminaFactors& Fac, double H)
	{
		if (!(H > 0.0)) return;
		double DX = std::isfinite(It.DX) ? It.DX : 0.0;
		double DZ = std::isfinite(It.DZ) ? It.DZ : 0.0;
		const double DL = Hypot(DX, DZ);
		const bool bHas = DL > 1e-3;
		if (bHas) { DX /= DL; DZ /= DL; }
		const double Thr = bHas ? Min2(1.0, DL) : 0.0;
		const double V0 = M.Speed;
		double WishYaw = M.Heading;
		if (bHas) WishYaw = YawOf(DX, DZ);
		// facing is held (look, jockey, keeper), not following the heading
		const bool bHeld = It.bFace || It.bStrafe;

		// 1. target speed from the gait, the stamina factors, the facing caps and the caller's cap. "The facing caps
		// (the sprint cone, backpedal and strafe) are measured against a held facing: a body that faces where it runs
		// turns to its wish at the turn rate, and the angle on the way round is the cut rule's to price"
		EGait Gait = bHas ? (It.Gait == EGait::Stand ? EGait::Jog : It.Gait) : EGait::Stand;
		const double Alpha = (bHas && bHeld) ? std::fabs(WrapA(WishYaw - M.Yaw)) : 0.0;
		if (Gait == EGait::Sprint && Alpha > P.SprintCone) Gait = EGait::Run;
		if (P.SprintBuild > 0.0)
		{
			// life: the sprint builds over sprintBuild seconds of Shift forward at running pace, and fades when let go
			const bool bBuilding = Gait == EGait::Sprint && V0 > 0.85 * GaitSpeedOf(P, Fac, EGait::Run);
			M.SprintB = bBuilding ? Min2(1.0, M.SprintB + H / P.SprintBuild) : Max2(0.0, M.SprintB - H * P.SprintFade);
		}
		else M.SprintB = Gait == EGait::Sprint ? 1.0 : 0.0;
		double VT;
		if (Gait == EGait::Sprint && P.SprintBuild > 0.0)
		{
			const double RunV = GaitSpeedOf(P, Fac, EGait::Run);
			VT = RunV + (SprintSpeedOf(P, Fac) - RunV) * SStep(0.0, 1.0, M.SprintB);
		}
		else VT = GaitSpeedOf(P, Fac, Gait);
		VT *= Thr;
		if (bHas && bHeld)
		{
			if (Alpha > 120 * Deg) VT = Min2(VT * P.BackMul, P.Back);
			else if (Alpha > 60 * Deg) VT = Min2(VT * P.StrafeMul, P.Strafe);
		}
		if (It.SpeedCap < VT) VT = Max2(0.0, It.SpeedCap);
		// turning before setting off (facing free: third person, P2-B MV-12): "from standing, no more of the target than
		// the facing's cos share past 60 degrees allows (none while the wish is 60 degrees or more off the way the body
		// faces), so the body turns on the spot in steps and walks off forwards, never backing or sidling away first"
		if (P.bTurnFirst && bHas && !bHeld && V0 <= SNAP_V)
		{
			VT *= Clamp((std::cos(WrapA(WishYaw - M.Yaw)) - 0.5) / 0.5, 0.0, 1.0);
		}
		// 6. stagger: the speed is capped at staggerCap (2.0 m/s) for staggerT (0.35 s), from the first step of it
		bool bStaggered = false;
		if (M.Stagger > 0.0)
		{
			VT = Min2(VT, P.StaggerCap);
			bStaggered = true;
			M.Stagger = M.Stagger - H > 1e-9 ? M.Stagger - H : 0.0;
		}

		// 2. the cut rule: "a heading error over 35 degrees above 3 m/s plants and costs speed (target x max(0.3, cos));
		// below that, a wish to go back the way you came first stops you (a pivot), then you go"
		const double Theta = (bHas && V0 > SNAP_V) ? std::fabs(WrapA(WishYaw - M.Heading)) : 0.0;
		bool bPlanting = false;
		M.Cut = 0.0;
		if (bHas && V0 > P.CutMin && Theta > P.CutAngle)
		{
			VT *= Max2(P.CutFloor * Fac.Turn, std::cos(Theta));
			bPlanting = true;
			M.Cut = Theta;
		}
		else if (bHas && Theta > Pi / 2.0)
		{
			VT = 0.0;
			bPlanting = true;
		}

		// 3. longitudinal: "accelerate with a0*(1 - v/vmax)^0.8*accel up to the target, vmax being the top speed the body
		// has now. Integrated exactly over the step (s = 1 - v/vmax, s(t)^0.2 = s0^0.2 - 0.2 k t, k = a0*accel/vmax), so
		// the run does not depend on the step length. Or brake at a constant rate: prm.brake (7.5) with no input or a
		// slower gait, prm.plant (9) for cuts and reversals." A stagger caps the speed outright.
		double V = V0;
		M.Plant = 0.0;
		const bool bWalking = P.WalkA > 0.0 && VT <= P.Walk + 1e-9 && V0 <= P.Walk + 1e-9;
		if (P.WalkA > 0.0)
		{
			if (!(V0 > VT) || bPlanting) M.WB = 0.0;
			else if (M.WB == 0.0) M.WB = (bWalking && !bStaggered) ? 1.0 : -1.0;
		}
		if (V < VT)
		{
			if (bWalking) V = Min2(VT, V + P.WalkA * Fac.Accel * H);
			else
			{
				const double VMaxNow = Max2(VT, SprintSpeedOf(P, Fac));
				const double K = P.A0 * Fac.Accel / VMaxNow;
				const double S0 = 1.0 - V / VMaxNow;
				const double SG = Max2(0.0, std::pow(S0, 0.2) - 0.2 * K * H);
				const double SG2 = SG * SG;
				V = Min2(VT, VMaxNow * (1.0 - SG * (SG2 * SG2)));   // sg^5 multiplied out as the JS does
			}
		}
		else if (V > VT)
		{
			const double Rate = bPlanting ? P.Plant : (M.WB > 0.0 ? P.WalkBrake : P.Brake);
			V = (bStaggered && V > P.StaggerCap) ? P.StaggerCap : Max2(VT, V - Rate * H);
			if (bPlanting) M.Plant = Rate;
		}

		// 4. lateral: "the heading turns towards the wish at w = min(wMax, aLat*turn/max(v, 0.5)) (a lateral
		// acceleration of aLat at speed: about 8.5 m of radius at a pace-50 sprint); from (almost) standing it takes the
		// wish at once"
		const double H0 = M.Heading;
		if (bHas)
		{
			if (V0 <= SNAP_V) M.Heading = WishYaw;
			else
			{
				const double W = Min2(P.WMax, P.ALat * Fac.Turn / Max2(V, 0.5));
				const double E = WrapA(WishYaw - M.Heading);
				const double Lim = W * H;
				M.Heading = WrapA(M.Heading + Clamp(E, -Lim, Lim));
			}
		}

		// 5. body facing: "the held facing when given, else the heading while moving; never faster than faceRate"
		bool bTurnFace = false;
		double FaceYaw = 0.0;
		double FaceRate = P.FaceRate;
		if (It.bFace && (It.FaceX != 0.0 || It.FaceZ != 0.0)) { FaceYaw = YawOf(It.FaceX, It.FaceZ); bTurnFace = true; }
		else if (!It.bStrafe && V > SNAP_V) { FaceYaw = M.Heading; bTurnFace = true; }
		else if (P.bTurnFirst && bHas && !It.bStrafe)
		{
			// standing, turning to set off
			FaceYaw = WishYaw;
			FaceRate = P.TurnFirstRate > 0.0 ? P.TurnFirstRate : FaceRate;
			bTurnFace = true;
		}
		if (bTurnFace)
		{
			const double E = WrapA(FaceYaw - M.Yaw);
			const double Lim = FaceRate * H;
			M.Yaw = WrapA(M.Yaw + Clamp(E, -Lim, Lim));
		}

		// 7. integrate. (The JS's collide/bounds answer is Unreal's capsule sweep here: ULRMovementComponent feeds the
		// actual move back into the state before the next step.)
		const double UX = DirX(M.Heading);
		const double UZ = DirZ(M.Heading);
		const double Want = V * H;
		M.TurnRate = WrapA(M.Heading - H0) / H;
		M.X += UX * Want;
		M.Z += UZ * Want;
		M.VX = UX * V;
		M.VZ = UZ * V;
		M.Acc = (V - V0) / H;
		M.Speed = V;
		M.Target = VT;
		M.Gait = (V > SNAP_V || bHas) ? Gait : EGait::Stand;
	}

	// ---------------------------------------------------------------------------------------------------------------
	// The control layer (control.js, bcs/controls)
	// ---------------------------------------------------------------------------------------------------------------

	double RunAfter(double Acceleration)
	{
		const double A = Acceleration > 0.0 ? Acceleration : 50.0;   // JS: (me.at.acceleration) || 50
		return Clamp(0.6 - 0.3 * (A - 50.0) / 40.0, 0.2, 0.8);
	}

	double CloseControlSprintK(double Dribbling)
	{
		const double D = Dribbling > 0.0 ? Dribbling : 50.0;
		return Clamp(0.85 + 0.1 * (D - 50.0) / 40.0, 0.8, 0.97);
	}

	void FControlLayer::ApplyViewOverlay(FMoverParams& P, bool bThirdPerson)
	{
		// control.js bcsPrm: third person, the turn on the spot from a stand and the face's rate (BCS); first person,
		// the football profile's own
		if (bThirdPerson) { P.bTurnFirst = BCS::TURN_FIRST; P.TurnFirstRate = BCS::TURN_RATE; P.FaceRate = BCS::FACE_RATE; }
		else { P.bTurnFirst = false; P.FaceRate = FACE_RATE_FP; }
	}

	void FControlLayer::WishStep(const FMoverState& M, const FMoverParams& P, const FStaminaFactors& Fac, double KX, double KZ, double H,
		double& OutDX, double& OutDZ)
	{
		// "CTRL.wish, the way the body is asked to go (a yaw), turns towards the keys' way at CURVE_K times the body's
		// own lateral grip over its speed, CURVE_MIN to CURVE_MAX rad/s: quick from a stand, about 7 at a run (5.3 m/s,
		// agility 50), 4.7 at a full sprint. A change of more than SNAP (the keyboard's 135 and 180: a reversal), or any
		// change below STAND_V m/s, goes to the mover as it is: it plants and pivots."
		const double V = M.Speed;
		const double KY = std::atan2(-KX, -KZ);
		if (!bWishOn) { bWishOn = true; WishYaw = V < BCS::STAND_V ? KY : M.Heading; }
		const double E = WrapA(KY - WishYaw);
		if (V < BCS::STAND_V || std::fabs(E) > BCS::SNAP) WishYaw = KY;
		else
		{
			const double Turn = Fac.Turn;
			const double ALat = P.ALat != 0.0 ? P.ALat : 7.5;
			const double W = Clamp(BCS::CURVE_K * ALat * Turn / Max2(V, 0.5), BCS::CURVE_MIN, BCS::CURVE_MAX);
			const double Lim = W * H;
			WishYaw = WrapA(WishYaw + Clamp(E, -Lim, Lim));
		}
		OutDX = -std::sin(WishYaw);
		OutDZ = -std::cos(WishYaw);
	}

	void FControlLayer::BuildIntent(const FControlInput& In, const FMoverState& M, FMoverParams& P, const FStaminaFactors& Fac,
		double T, double H, FMoverIntent& Out)
	{
		const bool bTP = In.bThirdPerson;
		// (U28 fix) "while a shot is held and while it is struck, A and D curl it and do not move you ... W pressed while
		// a shot is held from a stand moves you only once held SHOT_KEYS.T s, and a shot let go from a stand or a walk is
		// struck without a step on"
		const bool bStriking = In.bShotCharging || In.bKicking;
		const bool bWLate = In.bShotCharging && M.Speed < 0.5 && T - In.WPressedT < SHOT_KEY_T;
		const double F = ((In.bKicking && !In.bRunShot) || bWLate) ? 0.0 : Clamp(In.Forward, -1.0, 1.0);
		const double R = bStriking ? 0.0 : Clamp(In.Right, -1.0, 1.0);
		const double Len = Hypot(F, R);
		const double Sn = std::sin(In.CameraYaw);
		const double Cs = std::cos(In.CameraYaw);
		// the keys' own way on the ground, as pressed: W away from the camera, S towards it, A to its left, D to its right
		const double KX = Len > 0.0 ? (R * Cs - F * Sn) / Len : 0.0;
		const double KZ = Len > 0.0 ? (-R * Sn - F * Cs) / Len : 0.0;
		KeysX = KX; KeysZ = KZ; bKeys = Len > 0.0;

		Out = FMoverIntent();
		Out.DX = KX;
		Out.DZ = KZ;
		// third person: the way the body is asked to go curves round to the keys' way; first person, the keys as they are
		if (bTP && Len > 0.0) WishStep(M, P, Fac, KX, KZ, H, Out.DX, Out.DZ);
		else { bWishOn = false; WishYaw = 0.0; }
		if (In.bAnalogThrottle && Len > 0.0) { const double Thr = Min2(1.0, Len); Out.DX *= Thr; Out.DZ *= Thr; }

		// the facing: first person, the view's; third person free (the body turning to where it runs), held to the aim
		// only while a strike needs it, or open to a pass about to reach you
		const double CamFX = -Sn, CamFZ = -Cs;
		if (!bTP || In.bAimHold) { Out.bFace = true; Out.FaceX = CamFX; Out.FaceZ = CamFZ; }
		else if (In.bReceiving) { Out.bFace = true; Out.FaceX = In.ReceiveX; Out.FaceZ = In.ReceiveZ; }
		else Out.bFace = false;
		ApplyViewOverlay(P, bTP);
		Out.bStrafe = false;
		Out.SpeedCap = std::numeric_limits<double>::infinity();
		Out.Gait = In.bWalk ? EGait::Walk : ((In.bSprintHeld && !In.bShield) ? EGait::Sprint : EGait::Jog);

		// (U28 part B) the ladder walk, jog, run, sprint: "going on at a jog it becomes a run after RUN_AFTER s, sooner
		// the higher your Acceleration; Shift is the full sprint, X the walk". (BCS) In third person any way held climbs
		// the ladder (the body runs where it goes); first person, only going forward. Not with a pass on its way to you
		// (met at a run it went through your feet), but a run you are already in is kept.
		if (Out.Gait == EGait::Jog && Len > 0.0 && (bTP || F > 0.0))
		{
			FwdT += H;
			if (FwdT >= RunAfter(In.AccelerationSkill) && (!In.bPassComing || bRan)) { Out.Gait = EGait::Run; bRan = true; }
		}
		else { FwdT = 0.0; bRan = false; }

		// (U27, BCS) close control: a sprint with it is CTL_SPRINT of your sprint, from Dribbling
		if (In.bInCloseControl && Out.Gait == EGait::Sprint)
		{
			Out.SpeedCap = Min2(Out.SpeedCap, CloseControlSprintK(In.DribblingSkill) * SprintSpeedOf(P, Fac));
		}

		// jockeying (RMB held defending): side-on, at most 3.2 m/s, facing the man on the ball (else the view)
		if (In.bJockey)
		{
			Out.bFace = true; Out.FaceX = CamFX; Out.FaceZ = CamFZ;
			if (In.bJockeyTarget)
			{
				const double JX = In.JockeyX - M.X, JZ = In.JockeyZ - M.Z;
				double JD = Hypot(JX, JZ);
				if (JD == 0.0) JD = 1.0;
				Out.FaceX = JX / JD; Out.FaceZ = JZ / JD;
			}
			Out.SpeedCap = JOCKEY_V;
			Out.bStrafe = true;
			if (Out.Gait == EGait::Sprint) Out.Gait = EGait::Run;
		}

		// the shield (actions.js shieldStep, the engine's part): held to SH_SPEED of your jog, no run or sprint, the back
		// to the nearest opponent within SH_NEAR (the body between him and the ball)
		if (In.bShield)
		{
			Out.SpeedCap = Min2(Out.SpeedCap, SH_SPEED * P.Jog);
			if (Out.Gait == EGait::Sprint || Out.Gait == EGait::Run) Out.Gait = EGait::Jog;
			if (In.bShieldFrom)
			{
				const double UX = M.X - In.ShieldFromX, UZ = M.Z - In.ShieldFromZ;
				const double UL = Hypot(UX, UZ);
				if (UL < SH_NEAR)
				{
					const double L = UL > 0.0 ? UL : 1.0;
					Out.bFace = true; Out.FaceX = UX / L; Out.FaceZ = UZ / L;
				}
			}
		}
	}

	// ---------------------------------------------------------------------------------------------------------------
	// FBodySim (sim.js agentStep's order)
	// ---------------------------------------------------------------------------------------------------------------

	void FBodySim::Init(double X, double Z, double Yaw)
	{
		RebuildParams();
		M.Reset(X, Z, Yaw);
		I = FMoverIntent();
		Fac = FStaminaFactors::FromBreath(Stamina.B, EnergyFactor);
		G.Reset();
		Ctrl.Reset();
		CarryTarget = 0.0;
		LastDist = 0.0;
	}

	int32_t FBodySim::Advance(double H, const FControlInput* In, FFootfall* Falls, int32_t MaxFalls)
	{
		if (!(H > 0.0)) return 0;
		// controls -> intent (control.js controlStep; the overlay of bcsPrm is re-laid on the params every step)
		if (In) Ctrl.BuildIntent(*In, M, P, Fac, T, H, I);
		const double PX = M.X, PZ = M.Z;
		MoverStep(M, I, P, Fac, H);
		// stamina: "braking is not running: a body slowing from a sprint costs no run drain on the way down"
		Stamina.Step(H, EffortOf(M.Gait, M.Acc < -1.0 ? Min2(M.Speed, Stam::RUN_V - 0.01) : M.Speed, P.Run), StaminaSkill, EnergyFactor);
		Fac = FStaminaFactors::FromBreath(Stamina.B, EnergyFactor);
		const double DDX = M.X - PX, DDZ = M.Z - PZ;
		LastDist = std::sqrt(DDX * DDX + DDZ * DDZ);
		G.ModeStep(M.Speed, H);
		// (FC27) the man on the ball runs the carrier's gait, eased in and out over 0.15 s
		if (G.CK != CarryTarget)
		{
			G.CK = std::fabs(CarryTarget - G.CK) < 1e-3 ? CarryTarget : G.CK + (CarryTarget - G.CK) * Gait::CarryEaseK(H);
		}
		return G.PhaseAdvance(LastDist, M.Speed, Scale, Falls, MaxFalls);
	}
}
