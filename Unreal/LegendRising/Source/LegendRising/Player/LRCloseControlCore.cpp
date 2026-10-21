// LRCloseControlCore.cpp: see the header. Each function names the actions.js function it ports (bcs/controls c824ef1
// for keepStep's automatic rules and the knock-on, bcs/integ 41c4cd0 for the carry and ctlTouch).

#include "LRCloseControlCore.h"

#include <cmath>

namespace LRMove
{
	// ---------------------------------------------------------------------------------------------------------------
	// The ball's roll (ball.js closed forms) and actions.js ballAt
	// ---------------------------------------------------------------------------------------------------------------

	double RollDistance(double V0, double V1, double RollDecel, double DragMul)
	{
		const double K = Ctl::BALL_KD * DragMul;
		if (!(V0 > V1)) return 0.0;
		return std::log((RollDecel + K * V0 * V0) / (RollDecel + K * V1 * V1)) / (2.0 * K);
	}

	double RollSpeedAt(double V0, double T, double RollDecel, double DragMul)
	{
		const double K = Ctl::BALL_KD * DragMul;
		const double C = std::sqrt(RollDecel * K);
		const double Phi = std::atan(V0 * std::sqrt(K / RollDecel)) - C * T;
		return Phi <= 0.0 ? 0.0 : std::sqrt(RollDecel / K) * std::tan(Phi);
	}

	void BallAt(const FBallState& B, double T, double& OutX, double& OutZ, double& OutVX, double& OutVZ)
	{
		const double V = Hypot(B.VX, B.VZ);
		if (V < 1e-3 || B.Y > 0.3 || !(T > 0.0)) { OutX = B.X; OutZ = B.Z; OutVX = B.VX; OutVZ = B.VZ; return; }
		const double RD = B.RollDecel > 0.0 ? B.RollDecel : Ctl::ROLL_DECEL;
		const double DM = B.DragMul > 0.0 ? B.DragMul : 1.0;
		const double V1 = RollSpeedAt(V, T, RD, DM);
		const double S = RollDistance(V, V1, RD, DM);
		OutX = B.X + B.VX / V * S;
		OutZ = B.Z + B.VZ / V * S;
		OutVX = B.VX / V * V1;
		OutVZ = B.VZ / V * V1;
	}

	void RollBall(FBallState& B, double H)
	{
		double X, Z, VX, VZ;
		BallAt(B, H, X, Z, VX, VZ);
		B.X = X; B.Z = Z; B.VX = VX; B.VZ = VZ;
		// ball.js ROLL_STOP: a grounded ball slower than 0.05 m/s stops dead
		if (B.Y <= 0.3 && Hypot(B.VX, B.VZ) < 0.05) { B.VX = 0.0; B.VZ = 0.0; }
	}

	// ---------------------------------------------------------------------------------------------------------------
	// helpers
	// ---------------------------------------------------------------------------------------------------------------

	// can a strike reach the ball at P, the body at B facing F: CARRY.BEHIND or more in front of him (actions.js inFront)
	static bool CtlInFront(const FPlane2& P, const FPlane2& B, const FPlane2& F, double Sc)
	{
		return (P.X - B.X) * F.X + (P.Z - B.Z) * F.Z >= Ctl::CARRY_BEHIND * Sc;
	}

	// actions.js footLat: where foot Side, playing the ball at P (the body at B, facing F) along U with Part, comes down
	// across his facing: + on its own side of his middle (the toe in line with the ball's middle; the inside or the
	// outside CARRY.FACE beside it)
	static double CtlFootLat(EFoot Side, EFootPart Part, const FPlane2& P, const FPlane2& B, const FPlane2& U, const FPlane2& F)
	{
		const double RX = -F.Z, RZ = F.X, SS = Side == EFoot::Right ? 1.0 : -1.0;
		const double PartK = Part == EFootPart::Inside ? 1.0 : (Part == EFootPart::Outside ? -1.0 : 0.0);
		return ((P.X - B.X) * RX + (P.Z - B.Z) * RZ - Ctl::CARRY_BACK * (U.X * RX + U.Z * RZ) + PartK * SS * Ctl::CARRY_FACE) * SS;
	}

	FPlane2 FCloseControlCore::BodyAt(const FBodyView& Body, double T, bool bUseWay, const FPlane2& U)
	{
		// actions.js bodyAt: "the body t s on: going the way the keys ask (u, else as it goes), its speed coming up to the
		// mover's target at the mover's push (a0, falling off towards top speed) or down to it at its brake, in four steps"
		const FMoverState& M = *Body.M;
		const FMoverParams& P = *Body.P;
		const double V0 = M.Speed;
		double DX = bUseWay ? U.X : 0.0, DZ = bUseWay ? U.Z : 0.0;
		if (!bUseWay && V0 > 1e-3) { DX = M.VX / V0; DZ = M.VZ / V0; }
		const double Tg = M.Target > 0.0 ? M.Target : V0;
		const double H = T / 4.0;
		const double VMax = P.VMax > 0.0 ? P.VMax : 9.0;
		const double A0 = P.A0 > 0.0 ? P.A0 : 7.0;
		const double Br = P.Brake > 0.0 ? P.Brake : 7.5;
		double V = V0, S = 0.0;
		for (int32_t I = 0; I < 4; I++)
		{
			const double V1 = V < Tg ? Min2(Tg, V + A0 * Max2(0.0, 1.0 - V / VMax) * H) : Max2(Tg, V - Br * H);
			S += (V + V1) * 0.5 * H;
			V = V1;
		}
		return FPlane2(M.X + DX * S, M.Z + DZ * S);
	}

	bool FCloseControlCore::KeysWay(const FBodyView& Body, FPlane2& Out) const
	{
		// actions.js keysWay: the way the keys take him (or his facing)
		const FMoverIntent& I = *Body.I;
		const double L = Hypot(I.DX, I.DZ);
		if (L > 0.1) { Out.X = I.DX / L; Out.Z = I.DZ / L; }
		else { Out.X = DirX(Body.M->Yaw); Out.Z = DirZ(Body.M->Yaw); }
		return L > 0.1;
	}

	EFootPart FCloseControlCore::CarryPart(EFoot Side, const FPlane2& U) const
	{
		// actions.js carryPart: "straight on the toe (the front of a flat foot as it lands); turning, the side of the ball
		// the turn needs (left: its right side, a right foot's inside, a left foot's outside)"
		const FPlane2 D0 = bHasCtlDir ? CtlDir : U;
		const double Cross = D0.X * U.Z - D0.Z * U.X, Dot = D0.X * U.X + D0.Z * U.Z;
		const double Turn = std::atan2(Cross, Dot);
		if (std::fabs(Turn) <= Ctl::TURN) return EFootPart::Toe;
		const bool bBallRight = Turn < 0.0;
		return (bBallRight == (Side == EFoot::Right)) ? EFootPart::Inside : EFootPart::Outside;
	}

	bool FCloseControlCore::CarryOn(const FBodyView& Body, bool bFake) const
	{
		// actions.js carryOn: "running on with it at V_FOOT or more, the keys' way within FWD (a cosine) of his facing
		// (backwards and sideways the spot's touches keep it in front of him) and not a cut back past CUT from the last
		// touch's way (the ball is turned at once, as the spot's touches turn it); or stopping from STOP_V (the next foot
		// down puts its sole on it). Not a fake's drag"
		if (!bCtlOn || bFake) return false;
		const FMoverState& M = *Body.M;
		const FMoverIntent& I = *Body.I;
		const double L = Hypot(I.DX, I.DZ);
		if (L <= 0.1) return M.Speed >= Ctl::CARRY_STOP_V;
		if (M.Speed < Ctl::CARRY_V_FOOT) return false;
		const double UX = I.DX / L, UZ = I.DZ / L;
		if (UX * DirX(M.Yaw) + UZ * DirZ(M.Yaw) < Ctl::CARRY_FWD) return false;
		return !(bHasCtlDir && CtlDir.X * UX + CtlDir.Z * UZ < std::cos(Ctl::CARRY_CUT));
	}

	bool FCloseControlCore::Carrying(const FBallState& Ball, const FBodyView& Body, const FCtlWorld& W) const
	{
		if (bCtlOn) return true;
		if (!W.bBallMine || !Ball.bFree || !W.bLive || Ball.Y > 0.5) return false;
		if (W.bAction && !W.bFake) return false;
		const double DX = Ball.X - Body.M->X, DZ = Ball.Z - Body.M->Z;
		return DX * DX + DZ * DZ < 4.0;
	}

	double FCloseControlCore::TimeToPlannedTouch(const FBodyView& Body) const
	{
		if (!Plan.bOn || !Body.G) return -1.0;
		return Body.G->TimeToFootfall(Plan.Side, Max2(Body.M->Speed, 0.5), Body.Scale);
	}

	void FCloseControlCore::Kick(FBallState& Ball, const FCtlWorld& W, FTouchRecord& Rec, double KX, double KZ, double WY)
	{
		// ballKick(b, {kx, 0, kz}, {kz/R, wy, -kx/R}): rolling, with the spin of a ball rolling that way (plus a turn's
		// side spin)
		Rec.BallX = Ball.X; Rec.BallY = Ball.Y; Rec.BallZ = Ball.Z;
		Ball.VX = KX; Ball.VY = 0.0; Ball.VZ = KZ;
		Ball.WX = KZ / Ctl::BALL_R; Ball.WY = WY; Ball.WZ = -KX / Ctl::BALL_R;
		Ball.LastBy = ELastBy::Me; Ball.LastKind = ELastKind::Dribble; Ball.LastT = W.T;
		Rec.T = W.T;
		Rec.KickVX = KX; Rec.KickVZ = KZ;
		Rec.SpinX = Ball.WX; Rec.SpinY = Ball.WY; Rec.SpinZ = Ball.WZ;
		if (OnTouch) OnTouch(Rec);
	}

	// ---------------------------------------------------------------------------------------------------------------
	// keepStep (bcs/controls) with the carry (bcs/integ)
	// ---------------------------------------------------------------------------------------------------------------

	bool FCloseControlCore::KeepStep(FBallState& Ball, const FBodyView& Body, const FCtlWorld& W)
	{
		const FMoverState& M = *Body.M;
		const FMoverIntent& I = *Body.I;
		const double Sc = Body.Scale;
		const double Dist = Hypot(Ball.X - M.X, Ball.Z - M.Z);
		FPlane2 U;
		KeysWay(Body, U);

		// the ends of close control ((BCS) it is the player's own: with the AI standing in for him it ends at once, and so
		// does the chase after a knock-on)
		if (W.bAIControlled) { Off(ECtlEnd::AI); bChase = false; }
		if (bCtlOn)
		{
			if (!W.bLive) Off(ECtlEnd::Stop);
			else if (W.bAction && !W.bActionHeaderOrFake) Off(ECtlEnd::Action);
			else if (!W.bBallMine) Off(ECtlEnd::Lost);
			else if (!Ball.bFree || Ball.Y > Ctl::TAKE_MAX_Y + 0.3 || Dist > Ctl::REACH * Sc) Off(ECtlEnd::Reach);
		}
		// the knock-on (on a ball a stride's touch may just have played on: KNOCK.REACH), and the chase after it
		if (bKnockRequested)
		{
			bKnockRequested = false;
			if ((bCtlOn || W.bBallMine) && W.bLive && Dist <= Ctl::KNOCK_REACH * Sc)
			{
				Off(ECtlEnd::Knock);
				bChase = true;
				bOut = false;
				return KnockOn(Ball, Body, W, U);
			}
		}
		// (BCS) close control taken automatically: the player's controls on this step, and nothing of his under way
		const bool bAuto = W.bCtlAuto && !W.bAIControlled;
		if (!bCtlOn && bAuto)
		{
			// the chase after a knock-on or a flick: over once the ball has left his feet and he lets go of Shift or drops
			// below a run; at once when play stops or another body plays the ball
			if (bChase)
			{
				if (Dist > Ctl::AUTO_REACH * Sc || Ball.Y > Ctl::TAKE_MAX_Y) bOut = true;
				if (!W.bLive || Ball.LastBy == ELastBy::Other || W.bBallOthers) bChase = false;
				else if (bOut && (I.Gait != EGait::Sprint || M.Speed < Ctl::AUTO_RUN_K * GaitSpeedOf(*Body.P, *Body.Fac, EGait::Run))) bChase = false;
			}
			// his own strike remembered when it was struck (a.ownT): a touch of his own on it since is still his own
			// ball; another body's touch, or a deflection, frees it
			const bool bOwn = Ball.LastBy == ELastBy::Me && Ball.LastKind != ELastKind::Deflect;
			if (bOwn && Ball.LastKind == ELastKind::Struck) { bHasOwnT = true; OwnT = Ball.LastT; }
			else if (!bOwn) bHasOwnT = false;
			const bool bStruck = bOwn && bHasOwnT && W.T - OwnT < Ctl::AUTO_OWN_T;
			const bool bFirstTouchHold = bOwn && Ball.LastKind == ELastKind::Control && W.T - Ball.LastT < Ctl::AUTO_FIRST_T;
			if (!bChase && W.bLive && W.bBallMine && Ball.bFree && Ball.Y < Ctl::TAKE_MAX_Y && Dist <= Ctl::AUTO_REACH * Sc && !W.bAction &&
				!bStruck && !bFirstTouchHold)
			{
				bCtlOn = true;
				End = ECtlEnd::None;
				CtlDir = U;
				bHasCtlDir = true;
				const bool bR = CtlTouch(Ball, Body, W, U, true);
				CarryPlan(Ball, Body, W);
				return bR;
			}
		}
		// a fake's drag and a shield's touches are their own: close control holds on but leaves the ball to them
		if (!bCtlOn || W.bFake || W.bShielding)
		{
			if (!bCtlOn && !W.bBallMine) Plan.bOn = false;
			return false;
		}
		// (FC27) on the move the touches are the footfalls' (carryFoot); standing and turning on the spot, the spot's, and
		// a ball neither foot's next strike can play the spot's too until it is in front of him
		if (CarryOn(Body, W.bFake))
		{
			// (the plan kept up with the keys between footfalls: a turn asked for after the plan was made is the plan's
			// foot's to play, its inside or outside, and a stop its sole)
			if (!Plan.bOn || W.Step % Ctl::PLAN_EVERY == 0) CarryPlan(Ball, Body, W);
			if (Plan.bOn) return false;
		}
		Plan.bOn = false;
		return CtlTouch(Ball, Body, W, U, false);
	}

	bool FCloseControlCore::OnFootfall(FBallState& Ball, const FBodyView& Body, const FCtlWorld& W, EFoot Side)
	{
		// actions.js dribbleFoot (the sim calls it only with the ball his and play live)
		if (!W.bBallMine || !Ball.bFree || !W.bLive) { Plan.bOn = false; return false; }
		// no touch while he steps in to strike it, nor the carry's from the step a kick or a flick begins
		if (W.bAction && (W.bStepIn || (bCtlOn && !W.bActionHeaderOrFake))) { Plan.bOn = false; return false; }
		if (bCtlOn) return CarryFoot(Ball, Body, W, Side);
		// (the AI's stride dribble, dribbleWants / dribblePlan / dribbleKick with touch.js dribbleTouch, is not ported:
		// the player is always in automatic close control once the ball is his)
		Plan.bOn = false;
		return false;
	}

	bool FCloseControlCore::CarryFoot(FBallState& Ball, const FBodyView& Body, const FCtlWorld& W, EFoot Side)
	{
		// actions.js carryFoot: the planned touch if this is its foot, then the next one planned
		bool bDid = false;
		if (CarryOn(Body, W.bFake) && Plan.bOn && Plan.Side == Side)
		{
			if (Plan.bTouch) bDid = CarryKick(Ball, Body, W, Side, Plan.Part == EFootPart::Sole ? ETouchWhy::Stop : Plan.Why);
			Plan.bOn = false;
		}
		if (bCtlOn) CarryPlan(Ball, Body, W);
		return bDid;
	}

	void FCloseControlCore::PlanSet(const FBodyView& Body, EFoot Side, bool bTouch, EFootPart Part, ETouchWhy Why, const FPlane2& U)
	{
		Plan.bOn = true;
		Plan.bTouch = bTouch;
		Plan.Side = Side;
		Plan.Part = Part;
		Plan.Why = Why;
		Plan.N = Body.G->N + (Side == Body.G->Side ? 2 : 1);
		Plan.Way = U;
	}

	void FCloseControlCore::CarryPlan(const FBallState& Ball, const FBodyView& Body, const FCtlWorld& W)
	{
		// actions.js carryPlan: "the next touch, planned after a footfall (and kept up with the keys between them): which
		// foot, which part of it, and whether it plays the ball or only comes down behind it"
		const FMoverState& M = *Body.M;
		const FGaitClock& G = *Body.G;
		const double Sc = Body.Scale;
		Plan.bOn = false;
		Plan.bTouch = false;
		if (!bCtlOn || !Ball.bFree || Ball.Y > 0.3 || !W.bBallMine) return;
		const double V = Max2(M.Speed, 0.5);
		FPlane2 U;
		const bool bMv = KeysWay(Body, U);
		const EFoot Strong = StrongOf(Body.Foot);
		const EFoot Weak = OtherFoot(Strong);
		const double Sg = Strong == EFoot::Right ? 1.0 : -1.0;
		const double TS = G.TimeToFootfall(Strong, V, Sc);
		const double TW = G.TimeToFootfall(Weak, V, Sc);
		// a stop asked for on the move: the next foot down puts its sole on it
		if (!bMv && M.Speed >= Ctl::CARRY_STOP_V) { PlanSet(Body, TS < TW ? Strong : Weak, true, EFootPart::Sole, ETouchWhy::Stop, U); return; }
		// where the ball is against the body at each foot's next strike (ahead along the way, across: + the strong side)
		FPlane2 BP;
		double BVX, BVZ;
		BallAt(Ball, TS, BP.X, BP.Z, BVX, BVZ);
		const FPlane2 BB1 = BodyAt(Body, TS, bMv, U);
		const double AheadS = (BP.X - BB1.X) * U.X + (BP.Z - BB1.Z) * U.Z;
		const EFootPart Part = CarryPart(Strong, U);
		const FPlane2 FY(DirX(M.Yaw), DirZ(M.Yaw));
		// (can the strong foot's strike play it at all: in front of him, not too far out to its side, as he faces and goes
		// now; and would it come down across the other to play it, across the keys' way)
		const FPlane2 BB3S = BodyAt(Body, TS, false, U);
		const bool bBadS = !CtlInFront(BP, BB3S, FY, Sc) || CtlFootLat(Strong, Part, BP, BB3S, U, FY) > Ctl::CARRY_WIDE * Sc;
		const bool bXS = CtlFootLat(Strong, Part, BP, BB1, U, U) < -Ctl::CARRY_XLAT * Sc;
		// the weak foot's strike: the first push after a turn that left it on the weak side, a ball the strong foot could
		// only play across the other or not at all, and a ball the strong foot would come down on top of
		BallAt(Ball, TW, BP.X, BP.Z, BVX, BVZ);
		const FPlane2 BB2 = BodyAt(Body, TW, bMv, U);
		const FPlane2 BB3W = BodyAt(Body, TW, false, U);
		const EFootPart PW = CarryPart(Weak, U);
		const double LatW = ((BP.X - BB2.X) * (-U.Z) + (BP.Z - BB2.Z) * U.X) * Sg;
		const bool bOkW = CtlInFront(BP, BB3W, FY, Sc) && CtlFootLat(Weak, PW, BP, BB3W, U, FY) <= Ctl::CARRY_WIDE * Sc &&
			CtlFootLat(Weak, PW, BP, BB2, U, U) >= -Ctl::CARRY_XLAT * Sc;
		const bool bWantW = bOkW && (bBadS || bXS || (Part == EFootPart::Toe && (LatW < -Ctl::WEAK_SIDE * Sc || AheadS < Ctl::CARRY_OVERRUN * Sc)));
		if (bWantW && TW < TS)
		{
			PlanSet(Body, Weak, true, PW, (bBadS || bXS || LatW < -Ctl::WEAK_SIDE * Sc) ? ETouchWhy::WeakSide : ETouchWhy::Overrun, U);
			return;
		}
		// the strong foot's strike first: it comes down on its own side without it, the weak foot's next
		if (bWantW && (bBadS || bXS)) { PlanSet(Body, Strong, false, Part, ETouchWhy::Across, U); return; }
		// neither strike can play it (behind him, out to his side): the position controller brings it in front of him
		if (bBadS || bXS) return;
		// the strong foot: a turn is played at once; straight on, every strike plays it unless it will still be AHEAD past
		// where the touch wants it (it comes down behind it), and pushed to run on to (a sprint) only once it is back
		// within RUN_TOL of there (RUN_N strides on from the last push: the clip's push and run)
		const double Over = AheadS - Ctl::CARRY_LEAD * Sc;
		const bool bRun = Body.I->Gait == EGait::Sprint;
		const bool bTouch = Part != EFootPart::Toe || (bRun ? Over < Ctl::CARRY_RUN_TOL * Sc : Over < Ctl::CARRY_AHEAD * Sc);
		PlanSet(Body, Strong, bTouch, Part, Part != EFootPart::Toe ? ETouchWhy::Turn : (bRun ? ETouchWhy::Run : ETouchWhy::Carry), U);
	}

	bool FCloseControlCore::CarryKick(FBallState& Ball, const FBodyView& Body, const FCtlWorld& W, EFoot Side, ETouchWhy Why)
	{
		// actions.js carryKick: "the ball sent to where the next touch will meet it (the spot CARRY.LEAD ahead of the pelvis
		// and CARRY.LAT to the strong side when this foot is next down, a stride on, RUN_N at a sprint), rolling with the
		// spin of the roll and a turn's side spin; a stop rolls it to rest CTL.STAND in front of where the body will stand"
		const FMoverState& M = *Body.M;
		const double Sc = Body.Scale;
		const double Dec = Ball.RollDecel > 0.0 ? Ball.RollDecel : Ctl::ROLL_DECEL;
		const double Reach = Hypot(Ball.X - M.X, Ball.Z - M.Z);
		if (Reach > Ctl::REACH * Sc || Ball.Y > 0.4) return false;
		FPlane2 U;
		KeysWay(Body, U);
		const EFoot Strong = StrongOf(Body.Foot);
		const double Sg = Strong == EFoot::Right ? 1.0 : -1.0;
		const double V = Max2(M.Speed, 0.5);
		FTouchRecord Rec;
		Rec.Foot = Side;
		Rec.Way = U;
		Rec.Why = Why;
		if (Why == ETouchWhy::Stop)
		{
			// (the body's own stop: its speed over the mover's brake)
			const double Ds = M.Speed * M.Speed / (2.0 * Max2(1.0, Body.P->Brake > 0.0 ? Body.P->Brake : 7.5));
			const double FX = DirX(M.Yaw), FZ = DirZ(M.Yaw);
			const double Hv = M.Speed > 1e-3 ? 1.0 / M.Speed : 0.0;
			const double TX = M.X + M.VX * Hv * Ds + FX * Ctl::STAND * Sc - FZ * Sg * Ctl::LAT * Sc;
			const double TZ = M.Z + M.VZ * Hv * Ds + FZ * Ctl::STAND * Sc + FX * Sg * Ctl::LAT * Sc;
			const double EX = TX - Ball.X, EZ = TZ - Ball.Z, D = Hypot(EX, EZ);
			const double Sp = D > 1e-3 ? Min2(std::sqrt(2.0 * Dec * D), Ctl::CARRY_MAX_V) : 0.0;
			const double KX = D > 1e-3 ? EX / D * Sp : 0.0, KZ = D > 1e-3 ? EZ / D * Sp : 0.0;
			Rec.Part = EFootPart::Sole;
			Rec.BallSide = EBallSide::Back;
			KeepT = W.T;
			Kick(Ball, W, Rec, KX, KZ, 0.0);
			return true;
		}
		const EFootPart Part = CarryPart(Side, U);
		const FPlane2 D0 = bHasCtlDir ? CtlDir : U;
		const double Turn = std::atan2(D0.X * U.Z - D0.Z * U.X, D0.X * U.X + D0.Z * U.Z);
		// (pushed on to run onto at a sprint, RUN_N strides; a turn's touch for the next stride, the body coming round)
		const double T = Body.G->StrideSeconds(V, Sc) * ((Body.I->Gait == EGait::Sprint && Part == EFootPart::Toe) ? Ctl::CARRY_RUN_N : 1.0);
		const FPlane2 BB1 = BodyAt(Body, T, true, U);
		const double TX = BB1.X + U.X * Ctl::CARRY_LEAD * Sc - U.Z * Sg * Ctl::CARRY_LAT * Sc;
		const double TZ = BB1.Z + U.Z * Ctl::CARRY_LEAD * Sc + U.X * Sg * Ctl::CARRY_LAT * Sc;
		// the speed that rolls it there in T (the grass's roll and the air's drag on the way, at the mean speed)
		const double EX = TX - Ball.X, EZ = TZ - Ball.Z, D = Hypot(EX, EZ), Vm = D / T;
		const double Sp = D > 1e-3 ? Min2(Vm + 0.5 * (Dec + Ctl::BALL_KD * Vm * Vm) * T, Ctl::CARRY_MAX_V) : 0.0;
		const double KX = D > 1e-3 ? EX / D * Sp : 0.0, KZ = D > 1e-3 ? EZ / D * Sp : 0.0;
		const bool bTurning = Part != EFootPart::Toe;
		const EBallSide BallSide = !bTurning ? EBallSide::Back : (Turn < 0.0 ? EBallSide::Right : EBallSide::Left);
		const double WY = bTurning ? (BallSide == EBallSide::Right ? 1.0 : -1.0) * Ctl::SPIN : 0.0;
		Rec.Part = Part;
		Rec.BallSide = BallSide;
		KeepT = W.T;
		CtlDir = U;
		bHasCtlDir = true;
		Kick(Ball, W, Rec, KX, KZ, WY);
		return true;
	}

	bool FCloseControlCore::CtlTouch(FBallState& Ball, const FBodyView& Body, const FCtlWorld& W, const FPlane2& U, bool bForce)
	{
		// actions.js ctlTouch (bcs/integ): one touch of close control, if the ball is drifting off its spot (or force:
		// the gathering touch)
		const FMoverState& M = *Body.M;
		const FMoverIntent& I = *Body.I;
		const double Sc = Body.Scale;
		if (!bHasCtlDir) { CtlDir = U; bHasCtlDir = true; }
		const FPlane2 D0 = CtlDir;
		// a turn: the way the keys take you now against the last touch's
		const double Cross = D0.X * U.Z - D0.Z * U.X, Dot = D0.X * U.X + D0.Z * U.Z, Turn = std::atan2(Cross, Dot);
		const bool bTurning = std::fabs(Turn) > Ctl::TURN;
		if (!bForce && W.T - KeepT < (bTurning ? Ctl::DT * 0.5 : Ctl::DT)) return false;
		const double VX = M.VX, VZ = M.VZ, V = Hypot(VX, VZ), T = Ctl::T;
		const double Dec = Ball.RollDecel > 0.0 ? Ball.RollDecel : Ctl::ROLL_DECEL;
		// "the spot: in front of you as you face, leaning towards the way you go as much as that way is forward (running
		// on, ahead along it; sideways or backwards, in front of your feet, with CTL.SIDE of a lead the way you go), at
		// the strong foot's side of your facing"
		const double FX = DirX(M.Yaw), FZ = DirZ(M.Yaw);
		const double Fwd = Max2(0.0, U.X * FX + U.Z * FZ);
		const double SX0 = FX + U.X * Fwd + U.X * Ctl::SIDE * (1.0 - Fwd);
		const double SZ0 = FZ + U.Z * Fwd + U.Z * Ctl::SIDE * (1.0 - Fwd);
		double SL = Hypot(SX0, SZ0);
		if (SL == 0.0) SL = 1.0;
		const double SX = SX0 / SL, SZ = SZ0 / SL;
		const bool bStill = Hypot(I.DX, I.DZ) <= 0.1 && V < 1.0;
		const EFoot Strong = StrongOf(Body.Foot);
		const double Lat = (Strong == EFoot::Right ? 1.0 : -1.0) * Ctl::LAT * Sc;
		const double Lead = (bStill ? Ctl::STAND : Min2(Ctl::LEAD + Ctl::LV * V * Fwd, Ctl::LMAX)) * Sc;
		const double TX = M.X + VX * T + SX * Lead - FZ * Lat;
		const double TZ = M.Z + VZ * T + SZ * Lead + FX * Lat;
		// where the ball will be in T s, rolling on at the grass's decel
		const double BS = Hypot(Ball.VX, Ball.VZ);
		const double Tr = BS > 1e-4 ? Min2(T, BS / Dec) : 0.0;
		const double Go = BS > 1e-4 ? (BS * Tr - 0.5 * Dec * Tr * Tr) / BS : 0.0;
		const double PX = Ball.X + Ball.VX * Go, PZ = Ball.Z + Ball.VZ * Go;
		if (!bForce && !bTurning && Hypot(PX - TX, PZ - TZ) < Ctl::TOL * Sc) return false;
		// the touch: onto the spot in T s, rolling, with a turn's side spin
		const double EX = TX - Ball.X, EZ = TZ - Ball.Z, D = Hypot(EX, EZ);
		const double Sp = D > 1e-3 ? Min2(D / T + 0.5 * Dec * T, 14.0) : 0.0;
		const double KX = D > 1e-3 ? EX / D * Sp : 0.0, KZ = D > 1e-3 ? EZ / D * Sp : 0.0;
		// which side of the ball and which part of the strong foot: turning left (turn < 0) the ball is played on its
		// right side
		const bool bLeft = bTurning && Turn < 0.0, bRight = bTurning && Turn > 0.0;
		const EBallSide BallSide = bLeft ? EBallSide::Right : (bRight ? EBallSide::Left : EBallSide::Back);
		const EFootPart Part = !bTurning ? EFootPart::Laces : (((BallSide == EBallSide::Right) == (Strong == EFoot::Right)) ? EFootPart::Inside : EFootPart::Outside);
		const double WY = bTurning ? (BallSide == EBallSide::Right ? 1.0 : -1.0) * Ctl::SPIN : 0.0;
		FTouchRecord Rec;
		Rec.Foot = Strong;
		Rec.Part = Part;
		Rec.BallSide = BallSide;
		Rec.Why = bForce ? ETouchWhy::Gather : ETouchWhy::Spot;
		Rec.Way = U;
		KeepT = W.T;
		CtlDir = U;
		bHasCtlDir = true;
		Kick(Ball, W, Rec, KX, KZ, WY);
		return true;
	}

	bool FCloseControlCore::KnockOn(FBallState& Ball, const FBodyView& Body, const FCtlWorld& W, const FPlane2& U)
	{
		// actions.js knockOn: "the ball KNOCK.D on along (ux, uz), faster than your sprint by KNOCK.OVER, MIN_V over your
		// speed now"
		const double Dec = Ball.RollDecel > 0.0 ? Ball.RollDecel : Ctl::ROLL_DECEL;
		const double Sprint = Body.P->Sprint > 0.0 ? Body.P->Sprint : 8.0;
		const double Sp = Max2(Max2(std::sqrt(2.0 * Dec * Ctl::KNOCK_D * Body.Scale), Body.M->Speed + Ctl::KNOCK_MIN_V), Sprint + Ctl::KNOCK_OVER);
		FTouchRecord Rec;
		Rec.Foot = StrongOf(Body.Foot);
		Rec.Part = EFootPart::Laces;
		Rec.BallSide = EBallSide::Back;
		Rec.Why = ETouchWhy::Knock;
		Rec.Way = U;
		KeepT = W.T;
		KnockT = W.T;
		bKnockRequested = false;
		Kick(Ball, W, Rec, U.X * Sp, U.Z * Sp, 0.0);
		return true;
	}
}
