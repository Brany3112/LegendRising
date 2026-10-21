// LRBallCore.cpp: see LRBallCore.h. A line-for-line port of js/life/football/ball.js (bcs/integ 41c4cd0) and of the
// generator in rng.js. Comments give the JS line each block comes from. The order of every floating point operation
// follows the JS: the results match Node bit for bit (checked by Tools/golden, PORT-ball.md).

#include "LRBallCore.h"
#include "LRDetMath.h"

#include <algorithm>
#include <cmath>
#include <limits>

// Strict IEEE arithmetic in this file: no fused multiply-add, no reassociation, whatever the module's float settings.
#if defined(_MSC_VER) && !defined(__clang__)
	#pragma float_control(precise, on, push)
	#pragma fp_contract(off)
#elif defined(__clang__)
	#pragma float_control(precise, on, push)
	#pragma clang fp contract(off)
#endif

namespace LRBall
{
	// what FlyTo watches while its copy of the ball flies (ball.js FLY, line 966)
	struct FFlyProbe
	{
		double Px = 0, Pz = 0, Nx = 0, Nz = 0, T = 0, Apex = 0;
		bool bDone = false;
		FFlyResult* Out = nullptr;
	};
}

namespace LRBall
{
namespace
{
	const double BC_NAN = std::numeric_limits<double>::quiet_NaN();

	inline double Clamp(double V, double A, double B) { return V < A ? A : V > B ? B : V; }
	// JS's (+x || 0): NaN becomes 0
	inline double Num(double V) { return V == V ? V : 0; }

	constexpr double INV_STICK = 1 / 3.5;               // line 59: a solid sphere, slip changes 3.5x the impulse
	constexpr double SPIN_K = 5 / (2 * BALL::R);        // line 60: spin change per unit tangential velocity change

	// the best hit of the current piece (ball.js HIT, line 433)
	struct FHit
	{
		double S = 2, Tau = 0;
		EHitKind Kind = EHitKind::None;
		double Nx = 0, Ny = 0, Nz = 0, E = 0, Mu = 0, Svx = 0, Svy = 0, Svz = 0;
		bool bSpread = false;
		int End = 0;
		const char* Part = "";
		int Id = -1, Team = -1;
		bool bGround = false;
		double Px = 0, Py = 0, Pz = 0;
	};

	// a piece of motion (ball.js PC, lines 229-236)
	struct FPiece
	{
		double Px = 0, Py = 0, Pz = 0, Dx = 0, Dy = 0, Dz = 0;
		double T = 0;          // its length in seconds
		double TPiece = 0;     // its start within the step
		double TAbs = 0;       // its absolute start
		double Ax = 0, Ay = 0, Az = 0;
		double Yc = 0;         // the resting centre height
	};

	// what one Step reads once (ball.js BODIES, HANDS, STEP_H)
	struct FStepCtx
	{
		const std::vector<FBodyRec>* Bodies = nullptr;
		const std::vector<FHandRec>* Hands = nullptr;
		double StepH = 1.0 / 60;
	};

	FBallState CopyBall(const FBallState& Src, double SpinMul)
	{
		// ball.js copyBall, lines 845-855 (onto a fresh ball: the fields it does not copy are a fresh ball's)
		FBallState Dst;
		Dst.P = Src.P;
		Dst.V = Src.V;
		Dst.W.X = Src.W.X * SpinMul; Dst.W.Y = Src.W.Y * SpinMul; Dst.W.Z = Src.W.Z * SpinMul;
		Dst.DragMul = Src.DragMul; Dst.Knuck = FKnuckle(); Dst.State = Src.State == EBallState::Held ? EBallState::Held : EBallState::Free;
		Dst.Holder = Src.Holder;
		Dst.RollDecel = Src.RollDecel; Dst.bSleep = false; Dst.Still = 0; Dst.bGrounded = Src.bGrounded;
		Dst.PendN = 0;
		Dst.Last.Agent = Src.Last.Agent; Dst.Last.T = -1e9;
		return Dst;
	}

	// ---------- events (ball.js emit and stepEnd, lines 325-337) ----------

	void Emit(FWorld& W, const FEvent& Ev)
	{
		if (!W.OnEvent && !W.bCollectEvents) return;
		W.Queue.push_back(Ev);
	}
	void StepEnd(FWorld& W)
	{
		if (W.Queue.empty()) return;
		std::vector<FEvent> Q;
		Q.swap(W.Queue);
		if (W.OnEvent) { for (const FEvent& Ev : Q) W.OnEvent(Ev); }
		else W.Events.insert(W.Events.end(), Q.begin(), Q.end());
	}

	void Trace(FWorld& W, EHitKind Kind, double X0, double Y0, double Z0, double X1, double Y1, double Z1, double Dt);

	// ---------- the swept capsule (ball.js sweepCapsuleQ, lines 241-279) ----------
	// earliest s in [0, 1] at which p0 + s*d comes within Rr of the segment a + t*u, t in [0, L]; -1 if never. A point
	// already inside and moving deeper counts at s = 0. N receives the unit normal from the segment at contact.
	double SweepCapsule(double Px, double Py, double Pz, double Dx, double Dy, double Dz, double Ax, double Ay, double Az,
		double Ux, double Uy, double Uz, double L, double Rr, double& OutNx, double& OutNy, double& OutNz)
	{
		double Best = 2;
		const double Mx = Px - Ax, My = Py - Ay, Mz = Pz - Az;
		const double Md = Mx * Ux + My * Uy + Mz * Uz, Dd = Dx * Ux + Dy * Uy + Dz * Uz;
		const double Mpx = Mx - Md * Ux, Mpy = My - Md * Uy, Mpz = Mz - Md * Uz;
		const double Dpx = Dx - Dd * Ux, Dpy = Dy - Dd * Uy, Dpz = Dz - Dd * Uz;
		const double A = Dpx * Dpx + Dpy * Dpy + Dpz * Dpz, B = Mpx * Dpx + Mpy * Dpy + Mpz * Dpz, C = Mpx * Mpx + Mpy * Mpy + Mpz * Mpz - Rr * Rr;
		if (C <= 0)
		{
			if (Md >= 0 && Md <= L && B < 0) Best = 0;
		}
		else if (A > 1e-18)
		{
			const double Disc = B * B - A * C;
			if (Disc >= 0)
			{
				const double S = (-B - std::sqrt(Disc)) / A;
				if (S >= 0 && S <= 1) { const double Ax2 = Md + S * Dd; if (Ax2 >= 0 && Ax2 <= L) Best = S; }
			}
		}
		// the two end spheres
		for (int E = 0; E < 2; E++)
		{
			const double Ex = E ? Mx - L * Ux : Mx, Ey = E ? My - L * Uy : My, Ez = E ? Mz - L * Uz : Mz;
			const double A2 = Dx * Dx + Dy * Dy + Dz * Dz, B2 = Ex * Dx + Ey * Dy + Ez * Dz, C2 = Ex * Ex + Ey * Ey + Ez * Ez - Rr * Rr;
			double Se = -1;
			if (C2 <= 0) Se = B2 < 0 ? 0 : -1;
			else if (!(A2 < 1e-18))
			{
				const double Disc2 = B2 * B2 - A2 * C2;
				if (!(Disc2 < 0)) { const double S = (-B2 - std::sqrt(Disc2)) / A2; Se = S >= 0 && S <= 1 ? S : -1; }
			}
			if (Se >= 0 && Se < Best) Best = Se;
		}
		if (Best > 1) return -1;
		const double Qx = Px + Best * Dx, Qy = Py + Best * Dy, Qz = Pz + Best * Dz;
		const double T = Clamp((Qx - Ax) * Ux + (Qy - Ay) * Uy + (Qz - Az) * Uz, 0, L);
		const double Nx = Qx - (Ax + T * Ux), Ny = Qy - (Ay + T * Uy), Nz = Qz - (Az + T * Uz);
		const double Nl = std::sqrt(Nx * Nx + Ny * Ny + Nz * Nz);
		if (Nl > 1e-12) { OutNx = Nx / Nl; OutNy = Ny / Nl; OutNz = Nz / Nl; }
		else
		{
			double Dl = std::sqrt(Dx * Dx + Dy * Dy + Dz * Dz);
			if (Dl == 0) Dl = 1;
			OutNx = -Dx / Dl; OutNy = -Dy / Dl; OutNz = -Dz / Dl;
		}
		return Best;
	}

	// ---------- collision response (ball.js respond, spread, capSpeed: lines 285-320) ----------

	// an impulse at a contact with unit normal n (to the ball) on a surface moving at sv: restitution e on the normal,
	// Coulomb friction mu (at most the impulse that would make the contact roll), the tangential impulse turned into
	// spin. Returns the normal approach speed (0 when already separating).
	double Respond(FBallState& B, double Nx, double Ny, double Nz, double E, double Mu, double Svx, double Svy, double Svz)
	{
		FVec3& V = B.V;
		FVec3& Wv = B.W;
		const double R = BALL::R;
		const double Rvx = V.X - Svx, Rvy = V.Y - Svy, Rvz = V.Z - Svz;
		const double Vn = Rvx * Nx + Rvy * Ny + Rvz * Nz;
		if (Vn >= 0) return 0;
		const double Jn = -(1 + E) * Vn;
		V.X += Jn * Nx; V.Y += Jn * Ny; V.Z += Jn * Nz;
		// slip of the contact point: relative velocity plus w x (-R n), its tangential part
		double Ux = Rvx - R * (Wv.Y * Nz - Wv.Z * Ny), Uy = Rvy - R * (Wv.Z * Nx - Wv.X * Nz), Uz = Rvz - R * (Wv.X * Ny - Wv.Y * Nx);
		const double Un = Ux * Nx + Uy * Ny + Uz * Nz;
		Ux -= Un * Nx; Uy -= Un * Ny; Uz -= Un * Nz;
		const double Ul = LRDetMath::Hypot(Ux, Uy, Uz);
		if (Ul > 1e-9 && Mu > 0)
		{
			const double J = std::min(Ul * INV_STICK, Mu * Jn), K = -J / Ul;
			const double Dvx = K * Ux, Dvy = K * Uy, Dvz = K * Uz;
			V.X += Dvx; V.Y += Dvy; V.Z += Dvz;
			// dw = (5/(2R)) (dv x n)
			Wv.X += SPIN_K * (Dvy * Nz - Dvz * Ny); Wv.Y += SPIN_K * (Dvz * Nx - Dvx * Nz); Wv.Z += SPIN_K * (Dvx * Ny - Dvy * Nx);
		}
		return -Vn;
	}

	// turn the outgoing relative velocity about the vertical by a seeded angle (the spread off a body or a board)
	void Spread(FBallState& B, FWorld& W, double Nx, double Ny, double Nz, double Svx, double Svz)
	{
		if (!W.Rng) return;
		const double A = W.Rng->TruncNormal(BALL_X::SPREAD, 2.5);
		const double Rx = B.V.X - Svx, Rz = B.V.Z - Svz, C = LRDetMath::Cos(A), S = LRDetMath::Sin(A);
		const double Qx = Rx * C - Rz * S, Qz = Rx * S + Rz * C;
		if ((Qx * Nx + (B.V.Y) * Ny + Qz * Nz) > 0) { B.V.X = Qx + Svx; B.V.Z = Qz + Svz; }
	}

	void CapSpeed(FBallState& B)
	{
		FVec3& V = B.V;
		const double S = LRDetMath::Hypot(V.X, V.Y, V.Z);
		if (S > BALL::VMAX) { const double K = BALL::VMAX / S; V.X *= K; V.Y *= K; V.Z *= K; }
	}

	// ---------- touches and the ground (ball.js flushTouches line 394, groundImpact line 759) ----------

	void FlushTouches(FBallState& B, FWorld& W)
	{
		for (int I = 0; I < B.PendN; I++)
		{
			const FPendingTouch& Q = B.Pend[I];
			const double T = Q.T >= 0 ? Q.T : W.T;
			if (std::isnan(B.Last.T)) B.Last.T = T;
			FEvent Ev;
			Ev.Type = EEventType::Touch; Ev.Agent = Q.Agent; Ev.Team = Q.Team; Ev.Kind = Q.Kind;
			Ev.X = B.P.X; Ev.Y = B.P.Y; Ev.Z = B.P.Z; Ev.T = T;
			Emit(W, Ev);
		}
		B.PendN = 0;
		if (std::isnan(B.Last.T)) B.Last.T = W.T;
	}

	// a bounce on the floor (1.5.1): restitution clamp(0.62 - 0.012(|vy| - 4), 0.45, 0.62), friction mu 0.4 toward
	// rolling, the knuckle reset; rolling from here when it leaves slower than 0.6 m/s
	void GroundImpact(FBallState& B, FWorld& W, double T)
	{
		FVec3& V = B.V;
		const double VyIn = -V.Y;
		if (!(VyIn > 0)) { V.Y = std::max(0.0, V.Y); return; }
		const double E = Clamp(BALL::E_MAX - 0.012 * (VyIn - 4), BALL::E_MIN, BALL::E_MAX);
		Respond(B, 0, 1, 0, E, BALL::MU, 0, 0, 0);
		if (V.Y < BALL_X::ROLL_VY) V.Y = 0;
		B.Knuck.bOn = false;
		if (VyIn >= BALL_X::ROLL_VY && B.State != EBallState::Dead)
		{
			FEvent Ev;
			Ev.Type = EEventType::Bounce; Ev.X = B.P.X; Ev.Y = B.P.Y; Ev.Z = B.P.Z; Ev.T = T; Ev.Vy = VyIn; Ev.E = E;
			Emit(W, Ev);
		}
	}

	// ---------- spin (ball.js spinAndClockQ, lines 565-580) ----------
	// spin decay in the air (and the knuckle's clock), or the lock to rolling spin on the ground, over T seconds.
	// (ball.js caches the exp() of the last few lengths; the cached value is the same number, so it is computed here.)
	void SpinAndClock(FBallState& B, bool bGr, double T)
	{
		if (!(T > 0)) return;
		FVec3& Wv = B.W;
		const FVec3& V = B.V;
		if (!bGr)
		{
			const double K = LRDetMath::Exp(-BALL::SPIN_DECAY * T);
			Wv.X *= K; Wv.Y *= K; Wv.Z *= K;
			if (B.Knuck.bOn) B.Knuck.T += T;
		}
		else
		{
			// rolling spin (n x v)/R with n up: (vz, 0, -vx)/R
			const double F = 1 - LRDetMath::Exp(-BALL_X::ROLL_SPIN * T);
			Wv.X += (V.Z / BALL::R - Wv.X) * F; Wv.Y += (0 - Wv.Y) * F; Wv.Z += (-V.X / BALL::R - Wv.Z) * F;
		}
	}

	// ---------- swept tests (ball.js lines 583-708) ----------

	// the ground on the piece's exact parabola: the first time y reaches Yc while moving down
	void GroundHit(const FBallState& B, const FPiece& Pc, FHit& Hit)
	{
		const FVec3& P = B.P;
		const FVec3& V = B.V;
		const double Ax = Pc.Ax, Ay = Pc.Ay, Az = Pc.Az, Yc = Pc.Yc, T = Pc.T;
		const double C = P.Y - Yc;
		double Tau = -1;
		if (C <= 0) { if (V.Y < 0) Tau = 0; }
		else
		{
			const double A = 0.5 * Ay, Bq = V.Y;
			if (std::fabs(A) < 1e-12) { if (Bq < 0) Tau = -C / Bq; }
			else
			{
				const double Disc = Bq * Bq - 4 * A * C;
				if (Disc >= 0)
				{
					const double Sq = std::sqrt(Disc), R1 = (-Bq - Sq) / (2 * A), R2 = (-Bq + Sq) / (2 * A);
					const double Lo = std::min(R1, R2), Hi = std::max(R1, R2);
					Tau = Lo > 0 ? Lo : Hi > 0 ? Hi : -1;
				}
			}
		}
		if (!(Tau >= 0) || Tau > T) return;
		const double S = T > 0 ? Tau / T : 0;
		if (S >= Hit.S) return;
		Hit.S = S; Hit.Kind = EHitKind::Ground; Hit.bGround = true; Hit.Tau = Tau;
		Hit.Px = P.X + V.X * Tau + 0.5 * Ax * Tau * Tau; Hit.Py = Yc; Hit.Pz = P.Z + V.Z * Tau + 0.5 * Az * Tau * Tau;
		Hit.Nx = 0; Hit.Ny = 1; Hit.Nz = 0;
	}

	void CapsHit(const FWorld& W, const FPiece& Pc, FHit& Hit)
	{
		const double Px = Pc.Px, Py = Pc.Py, Pz = Pc.Pz, Dx = Pc.Dx, Dy = Pc.Dy, Dz = Pc.Dz;
		const double Lx = std::min(Px, Px + Dx), Hx = std::max(Px, Px + Dx), Ly = std::min(Py, Py + Dy), Hy = std::max(Py, Py + Dy);
		const double Lz = std::min(Pz, Pz + Dz), Hz = std::max(Pz, Pz + Dz);
		for (const FCapsule& C : W.Caps)
		{
			if (Hx < C.X0 || Lx > C.X1 || Hy < C.Y0 || Ly > C.Y1 || Hz < C.Z0 || Lz > C.Z1) continue;
			double Nx = 0, Ny = 0, Nz = 0;
			const double S = SweepCapsule(Px, Py, Pz, Dx, Dy, Dz, C.Ax, C.Ay, C.Az, C.Ux, C.Uy, C.Uz, C.L, C.Rr, Nx, Ny, Nz);
			if (S < 0 || S >= Hit.S) continue;
			const bool bBoard = C.Kind == EHitKind::Board;
			Hit.S = S; Hit.Kind = C.Kind; Hit.bGround = false; Hit.Nx = Nx; Hit.Ny = Ny; Hit.Nz = Nz;
			Hit.E = bBoard ? BALL::E_BOARD : BALL::E_POST; Hit.Mu = bBoard ? BALL_X::MU_BOARD : BALL::MU_POST;
			Hit.Svx = Hit.Svy = Hit.Svz = 0; Hit.bSpread = bBoard; Hit.End = C.End;
			Hit.Part = C.Kind == EHitKind::Bar ? "bar" : bBoard ? "board" : "post";
		}
	}

	void BoardsHit(const FWorld& W, const FPiece& Pc, FHit& Hit)
	{
		const double R = BALL::R;
		const double Px = Pc.Px, Py = Pc.Py, Pz = Pc.Pz, Dx = Pc.Dx, Dy = Pc.Dy, Dz = Pc.Dz;
		for (const FBoard& Bd : W.Boards)
		{
			const double S0 = Bd.Nx * Px + Bd.Ny * Py + Bd.Nz * Pz - Bd.D, Ds = Bd.Nx * Dx + Bd.Ny * Dy + Bd.Nz * Dz;
			double S = -1, Side = 1;
			if (S0 >= 0)
			{
				if (Ds < 0) { if (S0 <= R) S = 0; else if (S0 + Ds < R) S = (S0 - R) / (-Ds); }
			}
			else
			{
				Side = -1;
				if (Ds > 0) { if (S0 >= -R) S = 0; else if (S0 + Ds > -R) S = (-R - S0) / Ds; }
			}
			if (S < 0 || S > 1 || S >= Hit.S) continue;
			// the contact point on the board's face must be within the board
			const double Cx = Px + S * Dx, Cy = Py + S * Dy, Cz = Pz + S * Dz, Off = Bd.Nx * Cx + Bd.Ny * Cy + Bd.Nz * Cz - Bd.D;
			const double Qx = Cx - Off * Bd.Nx, Qy = Cy - Off * Bd.Ny, Qz = Cz - Off * Bd.Nz, Tol = 1e-6;
			if (Qx < Bd.X0 - Tol || Qx > Bd.X1 + Tol || Qz < Bd.Z0 - Tol || Qz > Bd.Z1 + Tol || Qy > Bd.Y1 || Qy < Bd.Y0 - R) continue;
			Hit.S = S; Hit.Kind = EHitKind::Board; Hit.bGround = false; Hit.Nx = Side * Bd.Nx; Hit.Ny = Side * Bd.Ny; Hit.Nz = Side * Bd.Nz;
			Hit.E = Bd.E; Hit.Mu = BALL_X::MU_BOARD; Hit.Svx = Hit.Svy = Hit.Svz = 0; Hit.bSpread = true; Hit.End = 0; Hit.Part = "board";
		}
	}

	void BodyHitSet(FHit& Hit, double S, const FBodyRec& Bd, const char* Part, double Vx, double Vy, double Vz, double Nx, double Ny, double Nz)
	{
		Hit.S = S; Hit.Kind = EHitKind::Body; Hit.bGround = false; Hit.Nx = Nx; Hit.Ny = Ny; Hit.Nz = Nz;
		Hit.E = BALL::E_BODY; Hit.Mu = BALL_X::MU_BODY; Hit.Svx = Vx; Hit.Svy = Vy; Hit.Svz = Vz; Hit.bSpread = true;
		Hit.End = 0; Hit.Part = Part; Hit.Id = Bd.Id; Hit.Team = Bd.Team;
	}

	// bodies: standing capsules (legs, torso, head) moved to the step, or one capsule (a diving keeper). Each moves at
	// its own velocity through the step, so the test runs on the ball's motion relative to it.
	void BodiesHit(const FBallState& B, const FStepCtx& Ctx, const FPiece& Pc, FHit& Hit)
	{
		const double R = BALL::R;
		const double Px = Pc.Px, Py = Pc.Py, Pz = Pc.Pz, Dx = Pc.Dx, Dy = Pc.Dy, Dz = Pc.Dz, T = Pc.T, TPiece = Pc.TPiece, TAbs = Pc.TAbs;
		const double Back = Ctx.StepH - TPiece;    // the body positions are for the end of the step
		for (const FBodyRec& Bd : *Ctx.Bodies)
		{
			if (Bd.bGhost) continue;
			if (Bd.Id == B.Last.Agent && TAbs - B.Last.T < BALL_X::GHOST_T) continue;
			const double Bvx = Bd.Vx, Bvz = Bd.Vz, Bvy = Bd.Vy;
			const double Rdx = Dx - Bvx * T, Rdy = Dy - Bvy * T, Rdz = Dz - Bvz * T;    // the ball's motion seen from the body
			double Nx = 0, Ny = 0, Nz = 0;
			if (Bd.bSeg)
			{
				const double Sx = -Bvx * Back, Sy = -Bvy * Back, Sz = -Bvz * Back;
				const double Gx = Bd.SegBx - Bd.SegAx, Gy = Bd.SegBy - Bd.SegAy, Gz = Bd.SegBz - Bd.SegAz;
				double L = std::sqrt(Gx * Gx + Gy * Gy + Gz * Gz);
				if (L == 0) L = 1e-9;
				const double SegR = Bd.SegR != 0 ? Bd.SegR : 0.2;
				const double S = SweepCapsule(Px, Py, Pz, Rdx, Rdy, Rdz, Bd.SegAx + Sx, Bd.SegAy + Sy, Bd.SegAz + Sz,
					(Bd.SegBx - Bd.SegAx) / L, (Bd.SegBy - Bd.SegAy) / L, (Bd.SegBz - Bd.SegAz) / L, L, SegR + R, Nx, Ny, Nz);
				if (S >= 0 && S < Hit.S) BodyHitSet(Hit, S, Bd, "body", Bvx, Bvy, Bvz, Nx, Ny, Nz);
				continue;
			}
			const double Hh = Bd.H != 0 ? Bd.H : 1, By = Bd.Y, X0 = Bd.X - Bvx * Back, Z0 = Bd.Z - Bvz * Back, Y0 = By - Bvy * Back;
			const double Reach = BALL_X::BODY_TORSO_R * Hh + R + std::sqrt(Rdx * Rdx + Rdz * Rdz) + 0.05, Ddx = Px - X0, Ddz = Pz - Z0;
			if (Ddx * Ddx + Ddz * Ddz > Reach * Reach) continue;
			if (Py > Y0 + (BALL_X::BODY_HEAD_Y + BALL_X::BODY_HEAD_R) * Hh + R + std::fabs(Rdy) + 0.05) continue;
			// the legs, the torso and the head: three upright capsules
			double S = SweepCapsule(Px, Py, Pz, Rdx, Rdy, Rdz, X0, Y0, Z0, 0, 1, 0, BALL_X::BODY_LEGS_TOP * Hh, BALL_X::BODY_LEGS_R * Hh + R, Nx, Ny, Nz);
			if (S >= 0 && S < Hit.S) BodyHitSet(Hit, S, Bd, "legs", Bvx, Bvy, Bvz, Nx, Ny, Nz);
			S = SweepCapsule(Px, Py, Pz, Rdx, Rdy, Rdz, X0, Y0 + BALL_X::BODY_LEGS_TOP * Hh, Z0, 0, 1, 0,
				(BALL_X::BODY_TORSO_TOP - BALL_X::BODY_LEGS_TOP) * Hh, BALL_X::BODY_TORSO_R * Hh + R, Nx, Ny, Nz);
			if (S >= 0 && S < Hit.S) BodyHitSet(Hit, S, Bd, "torso", Bvx, Bvy, Bvz, Nx, Ny, Nz);
			S = SweepCapsule(Px, Py, Pz, Rdx, Rdy, Rdz, X0, Y0 + BALL_X::BODY_HEAD_Y * Hh, Z0, 0, 1, 0, 0, BALL_X::BODY_HEAD_R * Hh + R, Nx, Ny, Nz);
			if (S >= 0 && S < Hit.S) BodyHitSet(Hit, S, Bd, "head", Bvx, Bvy, Bvz, Nx, Ny, Nz);
		}
	}

	void HandsHit(const FStepCtx& Ctx, const FPiece& Pc, FHit& Hit)
	{
		const double Px = Pc.Px, Py = Pc.Py, Pz = Pc.Pz, Dx = Pc.Dx, Dy = Pc.Dy, Dz = Pc.Dz, T = Pc.T, TPiece = Pc.TPiece;
		const double Back = Ctx.StepH - TPiece;
		for (const FHandRec& Hd : *Ctx.Hands)
		{
			const double Vx = Hd.Vx, Vy = Hd.Vy, Vz = Hd.Vz;
			const double Cx = Hd.X - Vx * Back, Cy = Hd.Y - Vy * Back, Cz = Hd.Z - Vz * Back;
			const double HandR = Hd.Rad != 0 ? Hd.Rad : 0.1;
			double Nx = 0, Ny = 0, Nz = 0;
			const double S = SweepCapsule(Px, Py, Pz, Dx - Vx * T, Dy - Vy * T, Dz - Vz * T, Cx, Cy, Cz, 0, 1, 0, 0, HandR + BALL::R, Nx, Ny, Nz);
			if (S >= 0 && S < Hit.S)
			{
				Hit.S = S; Hit.Kind = EHitKind::Body; Hit.bGround = false; Hit.Nx = Nx; Hit.Ny = Ny; Hit.Nz = Nz;
				Hit.E = BALL::E_BODY; Hit.Mu = BALL_X::MU_BODY; Hit.Svx = Vx; Hit.Svy = Vy; Hit.Svz = Vz; Hit.bSpread = false;
				Hit.End = 0; Hit.Part = "hand"; Hit.Id = Hd.Id; Hit.Team = Hd.Team;
			}
		}
	}

	// ---------- the response to a hit and its event (ball.js resolve, lines 733-755) ----------
	void Resolve(FBallState& B, FWorld& W, const FHit& Hit, double T)
	{
		FVec3& V = B.V;
		const FVec3& P = B.P;
		if (Hit.bGround) { GroundImpact(B, W, T); return; }
		const FVec3 VIn = V;
		const double Sp = Respond(B, Hit.Nx, Hit.Ny, Hit.Nz, Hit.E, Hit.Mu, Hit.Svx, Hit.Svy, Hit.Svz);
		if (Sp <= 0) return;
		if (Hit.bSpread) Spread(B, W, Hit.Nx, Hit.Ny, Hit.Nz, Hit.Svx, Hit.Svz);
		CapSpeed(B);
		B.Knuck.bOn = false;
		if (B.State == EBallState::Dead) return;
		FEvent Ev;
		Ev.X = P.X; Ev.Y = P.Y; Ev.Z = P.Z; Ev.T = T; Ev.Speed = Sp; Ev.VIn = VIn; Ev.VOut = V;
		Ev.N.X = Hit.Nx; Ev.N.Y = Hit.Ny; Ev.N.Z = Hit.Nz;
		if (Hit.Kind == EHitKind::Post || Hit.Kind == EHitKind::Bar)
		{
			Ev.Type = Hit.Kind == EHitKind::Post ? EEventType::Post : EEventType::Bar; Ev.End = Hit.End;
			Emit(W, Ev);
		}
		else if (Hit.Kind == EHitKind::Board) { Ev.Type = EEventType::Board; Emit(W, Ev); }
		else if (Hit.Kind == EHitKind::Body)
		{
			FLastTouch& L = B.Last;
			L.Agent = Hit.Id; L.Team = Hit.Team; L.Kind = "deflect"; L.T = T; L.X = P.X; L.Z = P.Z;
			Ev.Type = EEventType::Body; Ev.Id = Hit.Id; Ev.Team = Hit.Team; Ev.Part = Hit.Part;
			Emit(W, Ev);
		}
		else if (Hit.Kind == EHitKind::Wall) { Ev.Type = EEventType::Wall; Emit(W, Ev); }
	}

	// ---------- one sub-step (ball.js subStepQ, lines 439-549) ----------
	// one sub-step of Dt seconds starting at absolute time TS (TL into the step). Returns the time consumed: Dt, or less
	// when a collision left the ball faster than VSize (the step then re-splits what is left).
	double SubStep(FBallState& B, FWorld& W, const FStepCtx& Ctx, double Dt, double TS, double TL, double VSize)
	{
		const double R = BALL::R;
		FVec3& P = B.P;
		FVec3& V = B.V;
		FVec3& Wv = B.W;
		double Rem = Dt, Used = 0;
		int Hits = 0;
		while (Rem > 1e-12)
		{
			const double Fy = W.FloorY, Yc = Fy + R;
			if (P.Y < Yc) P.Y = Yc;
			bool bGr = P.Y <= Yc + BALL_X::AIR_Y && V.Y <= BALL_X::AIR_VY;
			if (bGr && V.Y < -BALL_X::AIR_VY && Hits < BALL_X::MAX_HITS)
			{
				// on the floor and moving into it: a bounce here and now
				GroundImpact(B, W, TS + Used);
				Hits++;
				bGr = V.Y <= BALL_X::AIR_VY;
			}
			if (bGr) { P.Y = Yc; V.Y = 0; }
			B.bGrounded = bGr;

			// (nets: not ported, PORT-ball.md)

			// accelerations, constant over the piece
			const double Sp = std::sqrt(V.X * V.X + V.Y * V.Y + V.Z * V.Z), Kd = BALL::KD * B.DragMul * Sp;
			double Ax = -Kd * V.X, Ay = -Kd * V.Y - BALL::G, Az = -Kd * V.Z, MT = Rem;
			bool bStops = false;
			if (!bGr)
			{
				// Magnus KM (w x v), capped at AMAX
				double Mx = BALL::KM * (Wv.Y * V.Z - Wv.Z * V.Y), My = BALL::KM * (Wv.Z * V.X - Wv.X * V.Z), Mz = BALL::KM * (Wv.X * V.Y - Wv.Y * V.X);
				const double Ml = std::sqrt(Mx * Mx + My * My + Mz * Mz);
				if (Ml > BALL::AMAX) { const double K = BALL::AMAX / Ml; Mx *= K; My *= K; Mz *= K; }
				Ax += Mx; Ay += My; Az += Mz;
				// the knuckle's sideways wobble
				if (B.Knuck.bOn)
				{
					const double Vh = std::sqrt(V.X * V.X + V.Z * V.Z);
					if (Vh > 0.3)
					{
						const double A = B.Knuck.Amp * LRDetMath::Sin(B.Knuck.Freq * B.Knuck.T + B.Knuck.Phase);
						Ax += A * V.Z / Vh; Az -= A * V.X / Vh;
					}
				}
			}
			else
			{
				// rolling: the grass's deceleration against the motion, plus the drag
				Ay = 0;
				const double Vh = std::sqrt(V.X * V.X + V.Z * V.Z);
				if (Vh > 0)
				{
					Ax -= B.RollDecel * V.X / Vh; Az -= B.RollDecel * V.Z / Vh;
					const double Dec = B.RollDecel + Kd;
					if (Vh <= Dec * Rem) { bStops = true; MT = Vh / Dec; }
				}
			}
			// the motion over the piece: exact for these accelerations (a stop inside it ends the motion at the stop)
			double Ex, Ey, Ez, Evx, Evy, Evz;
			if (bStops)
			{
				Ex = P.X + V.X * MT * 0.5; Ey = P.Y; Ez = P.Z + V.Z * MT * 0.5; Evx = 0; Evy = 0; Evz = 0;
			}
			else
			{
				Evx = V.X + Ax * MT; Evy = V.Y + Ay * MT; Evz = V.Z + Az * MT;
				Ex = P.X + (V.X + Evx) * 0.5 * MT; Ey = P.Y + (V.Y + Evy) * 0.5 * MT; Ez = P.Z + (V.Z + Evz) * 0.5 * MT;
			}
			const double DX = Ex - P.X, DY = Ey - P.Y, DZ = Ez - P.Z;

			// the earliest contact along the piece
			FHit Hit;
			Hit.S = 2;
			if (Hits < BALL_X::MAX_HITS)
			{
				FPiece Pc;
				Pc.Px = P.X; Pc.Py = P.Y; Pc.Pz = P.Z; Pc.Dx = DX; Pc.Dy = DY; Pc.Dz = DZ; Pc.T = MT; Pc.TPiece = TL + Used; Pc.TAbs = TS + Used;
				Pc.Ax = Ax; Pc.Ay = Ay; Pc.Az = Az; Pc.Yc = Yc;
				if (!bGr) GroundHit(B, Pc, Hit);
				if (!W.Caps.empty()) CapsHit(W, Pc, Hit);
				if (!W.Boards.empty()) BoardsHit(W, Pc, Hit);
				if (Ctx.Bodies && !Ctx.Bodies->empty()) BodiesHit(B, Ctx, Pc, Hit);
				if (Ctx.Hands && !Ctx.Hands->empty()) HandsHit(Ctx, Pc, Hit);
				// (life walls: not ported)
			}

			if (Hit.S > 1)
			{
				// no contact: commit the piece
				const double X0 = P.X, Y0 = P.Y, Z0 = P.Z;
				P.X = Ex; P.Y = std::max(Ey, Yc); P.Z = Ez; V.X = Evx; V.Y = Evy; V.Z = Evz;
				SpinAndClock(B, bGr, MT);
				Trace(W, EHitKind::None, X0, Y0, Z0, P.X, P.Y, P.Z, Rem);
				Used += Rem; Rem = 0;
				break;
			}
			// move to the contact and respond
			// (a stop inside the piece decelerates evenly: at a fraction s of its distance the speed is v*sqrt(1 - s))
			const double S = Hit.S, Left = std::sqrt(std::max(0.0, 1 - S));
			const double Tc = Hit.bGround ? Hit.Tau : bStops ? MT * (1 - Left) : S * MT;
			const double X0 = P.X, Y0 = P.Y, Z0 = P.Z;
			if (Hit.bGround) { P.X = Hit.Px; P.Y = Hit.Py; P.Z = Hit.Pz; }
			else { P.X += S * DX; P.Y += S * DY; P.Z += S * DZ; }
			if (bStops) { V.X *= Left; V.Z *= Left; }
			else { V.X += Ax * Tc; V.Y += Ay * Tc; V.Z += Az * Tc; }
			SpinAndClock(B, bGr, Tc);
			Trace(W, Hit.Kind, X0, Y0, Z0, P.X, P.Y, P.Z, Tc);
			Used += Tc; Rem -= Tc; Hits++;
			Resolve(B, W, Hit, TS + Used);
			// a hair off the surface, so the next piece starts outside it
			if (!Hit.bGround) { P.X += Hit.Nx * 1e-7; P.Y += Hit.Ny * 1e-7; P.Z += Hit.Nz * 1e-7; }
			if (P.Y < Yc) P.Y = Yc;
			if (std::sqrt(V.X * V.X + V.Y * V.Y + V.Z * V.Z) > VSize + 1e-9) return Used;
		}
		// rest
		if (B.bGrounded && std::sqrt(V.X * V.X + V.Y * V.Y + V.Z * V.Z) < BALL::ROLL_STOP && B.State == EBallState::Free)
		{
			V.X = 0; V.Y = 0; V.Z = 0; Wv.X = 0; Wv.Y = 0; Wv.Z = 0;
			B.Still += Dt;
		}
		else B.Still = 0;
		return Used;
	}

	// a traced piece goes to FlyTo's probe (ball.js flyTraceQ, lines 967-980) or the world's Trace
	void Trace(FWorld& W, EHitKind Kind, double X0, double Y0, double Z0, double X1, double Y1, double Z1, double Dt)
	{
		if (W.Fly)
		{
			FFlyProbe& F = *W.Fly;
			if (F.bDone) return;
			const double S0 = (X0 - F.Px) * F.Nx + (Z0 - F.Pz) * F.Nz, S1 = (X1 - F.Px) * F.Nx + (Z1 - F.Pz) * F.Nz;
			if (S0 < 0 && S1 >= 0)
			{
				const double Fr = S0 / (S0 - S1);
				FFlyResult& O = *F.Out;
				O.bHit = true; O.X = X0 + Fr * (X1 - X0); O.Y = Y0 + Fr * (Y1 - Y0); O.Z = Z0 + Fr * (Z1 - Z0); O.T = F.T + Fr * Dt;
				if (O.Y > F.Apex) F.Apex = O.Y;
				F.bDone = true;
				return;
			}
			if (Y1 > F.Apex) F.Apex = Y1;
			F.T += Dt;
			return;
		}
		if (W.Trace)
		{
			FTracePiece Pc;
			Pc.Kind = Kind; Pc.X0 = X0; Pc.Y0 = Y0; Pc.Z0 = Z0; Pc.X1 = X1; Pc.Y1 = Y1; Pc.Z1 = Z1; Pc.Dt = Dt;
			W.Trace(Pc);
		}
	}
}
}

// ---------------------------------------------------------------------------------------------------------------------
// rng.js
// ---------------------------------------------------------------------------------------------------------------------

LRBall::FRng::FRng(uint32_t Seed)
	: State(Seed ? Seed : 0x9e3779b9u)    // the zero seed is replaced by the golden ratio constant (rng.js line 20)
{
}

double LRBall::FRng::Next()
{
	// mulberry32 (rng.js lines 21-27): 32-bit unsigned arithmetic wraps exactly as Math.imul and >>> 0 do
	State += 0x6D2B79F5u;
	uint32_t T = State;
	T = (T ^ (T >> 15)) * (T | 1u);
	T ^= T + (T ^ (T >> 7)) * (T | 61u);
	return static_cast<double>(T ^ (T >> 14)) / 4294967296.0;
}

double LRBall::FRng::Gauss()
{
	// rng.js gauss: Box-Muller, the second normal kept for the next call
	if (bHasSpare) { bHasSpare = false; return Spare; }
	double U = Next();
	while (U <= 1e-300) U = Next();
	const double V = Next(), M = std::sqrt(-2 * LRDetMath::Log(U)), A = 2 * LRDetMath::PI * V;
	Spare = M * LRDetMath::Sin(A);
	bHasSpare = true;
	return M * LRDetMath::Cos(A);
}

double LRBall::FRng::TruncNormal(double Sigma, double Cap)
{
	// rng.js truncNormal (lines 56-62)
	if (!(Sigma > 0)) return 0;
	if (!(Cap > 0)) return 0;
	double Z = Gauss();
	while (std::fabs(Z) > Cap) Z = Gauss();
	return Z * Sigma;
}

// ---------------------------------------------------------------------------------------------------------------------
// the ball
// ---------------------------------------------------------------------------------------------------------------------

LRBall::FBallState LRBall::CreateBall(double X, double Y, double Z, double RollDecel)
{
	// ball.js createBall (lines 67-76)
	FBallState B;
	B.P.X = X; B.P.Y = Y; B.P.Z = Z;
	B.RollDecel = RollDecel;
	B.bGrounded = Y <= BALL::R + BALL_X::AIR_Y;
	return B;
}

void LRBall::Kick(FBallState& B, const FVec3& V, const FVec3& Wspin, const FTouch& Touch)
{
	// ball.js ballKick (lines 82-103)
	double Vx = Num(V.X), Vy = Num(V.Y), Vz = Num(V.Z);
	const double S = LRDetMath::Hypot(Vx, Vy, Vz);
	if (S > BALL::VMAX) { const double K = BALL::VMAX / S; Vx *= K; Vy *= K; Vz *= K; }
	B.V.X = Vx; B.V.Y = Vy; B.V.Z = Vz;
	B.W.X = Num(Wspin.X); B.W.Y = Num(Wspin.Y); B.W.Z = Num(Wspin.Z);
	B.State = EBallState::Free; B.Holder = -1; B.bSleep = false; B.Still = 0;
	B.DragMul = 1 - 0.0045 * Clamp(Num(Touch.Aero), 0, 99);
	B.Knuck = FKnuckle();
	if (Touch.Knuck.bOn)
	{
		B.Knuck.bOn = true; B.Knuck.Amp = Num(Touch.Knuck.Amp); B.Knuck.Freq = Num(Touch.Knuck.Freq); B.Knuck.Phase = Num(Touch.Knuck.Phase); B.Knuck.T = 0;
	}
	if (B.P.Y < BALL::R) B.P.Y = BALL::R;
	B.bGrounded = B.P.Y <= BALL::R + BALL_X::AIR_Y && Vy <= BALL_X::AIR_VY;
	FLastTouch& L = B.Last;
	const double T = Touch.bHasT && std::isfinite(Touch.T) ? Touch.T : BC_NAN;
	L.Agent = Touch.Agent; L.Team = Touch.Team;
	L.Kind = Touch.Kind.empty() ? std::string("kick") : Touch.Kind; L.T = T; L.X = B.P.X; L.Z = B.P.Z;
	if (B.PendN < 4)
	{
		FPendingTouch& Q = B.Pend[B.PendN++];
		Q.Agent = L.Agent; Q.Team = L.Team; Q.Kind = L.Kind; Q.T = std::isnan(T) ? -1 : T;
	}
}

void LRBall::Hold(FBallState& B, int HolderId, int HolderTeam, bool bHasPos, const FVec3& Pos, const FVec3& HolderV, bool bHasT, double T)
{
	// ball.js ballHold (lines 108-123). HolderTeam < 0 means "not given" (the last team is kept).
	if (bHasPos)
	{
		B.P.X = Pos.X; B.P.Y = std::max(BALL::R, Pos.Y); B.P.Z = Pos.Z;
	}
	B.V.X = Num(HolderV.X); B.V.Y = Num(HolderV.Y); B.V.Z = Num(HolderV.Z);
	B.W = FVec3(); B.Knuck = FKnuckle(); B.bSleep = false; B.Still = 0;
	if (B.State != EBallState::Held || B.Holder != HolderId)
	{
		FLastTouch& L = B.Last;
		L.Agent = HolderId; if (HolderTeam >= 0) L.Team = HolderTeam; L.Kind = "hold";
		if (bHasT) L.T = T;
		L.X = B.P.X; L.Z = B.P.Z;
	}
	B.State = EBallState::Held; B.Holder = HolderId;
}

void LRBall::Release(FBallState& B, bool bHasPos, const FVec3& Pos, const FVec3& V, const FVec3& Wspin)
{
	// ball.js ballRelease (lines 126-138)
	if (bHasPos) { B.P.X = Pos.X; B.P.Y = std::max(BALL::R, Pos.Y); B.P.Z = Pos.Z; }
	double Vx = Num(V.X), Vy = Num(V.Y), Vz = Num(V.Z);
	const double S = LRDetMath::Hypot(Vx, Vy, Vz);
	if (S > BALL::VMAX) { const double K = BALL::VMAX / S; Vx *= K; Vy *= K; Vz *= K; }
	B.V.X = Vx; B.V.Y = Vy; B.V.Z = Vz;
	B.W.X = Num(Wspin.X); B.W.Y = Num(Wspin.Y); B.W.Z = Num(Wspin.Z);
	B.State = EBallState::Free; B.Knuck = FKnuckle(); B.bSleep = false; B.Still = 0;
	B.Last.Agent = B.Holder; B.Last.Kind = "release"; B.Last.X = B.P.X; B.Last.Z = B.P.Z;
	B.Holder = -1;
	B.bGrounded = B.P.Y <= BALL::R + BALL_X::AIR_Y && Vy <= BALL_X::AIR_VY;
}

// ---------------------------------------------------------------------------------------------------------------------
// the world
// ---------------------------------------------------------------------------------------------------------------------

void LRBall::AddCapsule(FWorld& W, double Ax, double Ay, double Az, double Bx, double By, double Bz, double Radius, EHitKind Kind, int End)
{
	// ball.js capsule (lines 184-189)
	const double Dx = Bx - Ax, Dy = By - Ay, Dz = Bz - Az;
	double L = LRDetMath::Hypot(Dx, Dy, Dz);
	if (L == 0) L = 1e-9;
	const double Rr = Radius + BALL::R;
	FCapsule C;
	C.Ax = Ax; C.Ay = Ay; C.Az = Az; C.Ux = Dx / L; C.Uy = Dy / L; C.Uz = Dz / L; C.L = L; C.Rad = Radius; C.Rr = Rr; C.Kind = Kind; C.End = End;
	C.X0 = std::min(Ax, Bx) - Rr; C.X1 = std::max(Ax, Bx) + Rr; C.Y0 = std::min(Ay, By) - Rr; C.Y1 = std::max(Ay, By) + Rr;
	C.Z0 = std::min(Az, Bz) - Rr; C.Z1 = std::max(Az, Bz) + Rr;
	W.Caps.push_back(C);
}

void LRBall::AddBoard(FWorld& W, const FBoard& Board, bool bAddEdge, const FVec3& EdgeA, const FVec3& EdgeB)
{
	// ball.js createBallWorld lines 161-165: the board, and its rounded top edge as a capsule
	W.Boards.push_back(Board);
	if (bAddEdge) AddCapsule(W, EdgeA.X, EdgeA.Y, EdgeA.Z, EdgeB.X, EdgeB.Y, EdgeB.Z, BALL_X::EDGE_R, EHitKind::Board, 0);
}

LRBall::FWorld LRBall::MakePredictionWorld(const FWorld& W)
{
	// ball.js predWorld (lines 860-869): the colliders without bodies, hands, events or spread; boards only with
	// the fence on
	FWorld P;
	P.FloorY = W.FloorY;
	P.bCollectEvents = false;
	P.bPredFence = W.bPredFence;
	for (const FCapsule& C : W.Caps) if (W.bPredFence || C.Kind != EHitKind::Board) P.Caps.push_back(C);
	if (W.bPredFence) P.Boards = W.Boards;
	return P;
}

// ---------------------------------------------------------------------------------------------------------------------
// stepping (ball.js ballStep, lines 345-390)
// ---------------------------------------------------------------------------------------------------------------------

void LRBall::Step(FBallState& B, FWorld& W, double H)
{
	if (!(H > 0)) return;
	const double T0 = W.T;
	if (B.PendN) FlushTouches(B, W);
	if (B.State == EBallState::Held)
	{
		// a held ball moves with its holder's velocity and nothing else
		FVec3& P = B.P;
		const FVec3& V = B.V;
		P.X += V.X * H; P.Y = std::max(BALL::R, P.Y + V.Y * H); P.Z += V.Z * H;
		W.T = T0 + H;
		StepEnd(W);
		return;
	}
	FStepCtx Ctx;
	Ctx.Bodies = &W.Bodies;
	Ctx.Hands = &W.Hands;
	Ctx.StepH = H;
	// (a sleeping life ball: never set by this port, life solids are not ported)

	// sub-steps for the step: enough that even the fastest the ball can get moves at most SUB_TRAVEL in each, the most
	// the forces can add to its speed a second being gravity and the Magnus cap (plus a stretched net's spring in the
	// JS, zero here: nets are not ported)
	const FVec3& V = B.V;
	double RemT = H, TL = 0;
	int Guard = 0;
	double Vb = std::sqrt(V.X * V.X + V.Y * V.Y + V.Z * V.Z) + (BALL::G + BALL::AMAX + 0.0) * H;
	int N = static_cast<int>(Clamp(std::ceil(Vb * H / BALL::SUB_TRAVEL - 1e-12), 1, BALL_X::MAX_SUB));
	while (N > 0 && RemT > 1e-12 && Guard++ < BALL_X::MAX_PIECES)
	{
		const double Dt = RemT / N;
		const double VSize = std::sqrt(V.X * V.X + V.Y * V.Y + V.Z * V.Z) + (BALL::G + BALL::AMAX + 0.0) * Dt;
		const double Used = SubStep(B, W, Ctx, Dt, T0 + TL, TL, VSize);
		TL += Used; RemT -= Used; N--;
		if (Used < Dt - 1e-12 && RemT > 1e-12)
		{
			// a collision left it faster: re-split the rest
			Vb = std::sqrt(V.X * V.X + V.Y * V.Y + V.Z * V.Z) + (BALL::G + BALL::AMAX + 0.0) * RemT;
			N = static_cast<int>(Clamp(std::ceil(Vb * RemT / BALL::SUB_TRAVEL - 1e-12), 1, BALL_X::MAX_SUB));
		}
	}
	W.T = T0 + H;
	StepEnd(W);
}

// ---------------------------------------------------------------------------------------------------------------------
// prediction (ball.js 3.1.2, lines 842-1001)
// ---------------------------------------------------------------------------------------------------------------------

int LRBall::Predict(const FBallState& B, FWorld* PredWorld, float* Out, int OutLen, int N, double Hz, double SpinMul)
{
	const int Cap = std::min(N, OutLen / 4);
	if (Cap <= 0) return 0;
	FWorld Free;
	Free.bCollectEvents = false;
	FWorld& Pw = PredWorld ? *PredWorld : Free;
	const int Per = std::max(1, static_cast<int>(std::floor(60 / Hz + 0.5)));
	const double Hs = 1 / (Hz * Per);
	FBallState PB = CopyBall(B, SpinMul);
	Pw.T = 0;
	// (single precision, as the game's Float32Array)
	Out[0] = static_cast<float>(PB.P.X); Out[1] = static_cast<float>(PB.P.Y); Out[2] = static_cast<float>(PB.P.Z); Out[3] = 0;
	for (int K = 1; K < Cap; K++)
	{
		const bool bAtRest = PB.State != EBallState::Held && PB.V.X == 0 && PB.V.Y == 0 && PB.V.Z == 0 && PB.bGrounded;
		if (!bAtRest) for (int J = 0; J < Per; J++) Step(PB, Pw, Hs);
		const int O = 4 * K;
		Out[O] = static_cast<float>(PB.P.X); Out[O + 1] = static_cast<float>(PB.P.Y); Out[O + 2] = static_cast<float>(PB.P.Z);
		Out[O + 3] = static_cast<float>(K / Hz);
	}
	return Cap;
}

LRBall::FFlyResult LRBall::FlyTo(const FBallState& B, FWorld* PredWorld, double Px, double Pz, double Nx, double Nz, double TMax)
{
	FWorld Free;
	Free.bCollectEvents = false;
	FWorld& Fw = PredWorld ? *PredWorld : Free;
	FBallState FB = CopyBall(B, 1);
	FFlyResult Out;
	Out.bHit = false; Out.X = FB.P.X; Out.Y = FB.P.Y; Out.Z = FB.P.Z; Out.T = 0;
	FFlyProbe Probe;
	Probe.Px = Px; Probe.Pz = Pz; Probe.Nx = Nx; Probe.Nz = Nz; Probe.T = 0; Probe.bDone = false; Probe.Apex = FB.P.Y; Probe.Out = &Out;
	const double S0 = (FB.P.X - Px) * Nx + (FB.P.Z - Pz) * Nz;
	if (S0 >= 0) { Out.bHit = true; Out.Apex = FB.P.Y; Out.Vx = FB.V.X; Out.Vy = FB.V.Y; Out.Vz = FB.V.Z; return Out; }
	FFlyProbe* Keep = Fw.Fly;
	Fw.Fly = &Probe;
	Fw.T = 0;
	const double H = 1.0 / 60;
	int Steps = 0;
	const double MaxSteps = std::ceil(TMax / H);
	while (!Probe.bDone && Steps++ < MaxSteps)
	{
		Step(FB, Fw, H);
		if (FB.bGrounded && FB.V.X == 0 && FB.V.Z == 0) break;
	}
	Fw.Fly = Keep;
	if (!Probe.bDone) { Out.X = FB.P.X; Out.Y = FB.P.Y; Out.Z = FB.P.Z; Out.T = Probe.T; }
	Out.Apex = Probe.Apex; Out.Vx = FB.V.X; Out.Vy = FB.V.Y; Out.Vz = FB.V.Z;
	return Out;
}

void LRBall::FPredCache::Refresh(const FBallState& B, FWorld* PredWorld, double NowT, int StepIndex)
{
	// actions.js refreshPred (lines 68-73)
	N = Predict(B, PredWorld, Samples, 360, 90, 30);
	PredStep = StepIndex;
	PredT = NowT;
}

LRBall::FVec3 LRBall::FPredCache::At(const FBallState& B, double NowT, double T) const
{
	// actions.js predAt (lines 75-82)
	const float* P = Samples;
	const int Nn = N;
	const double Dt0 = NowT - PredT;
	const double Tt = T + Dt0, K = Clamp(Tt * 30, 0, Nn - 1.001), I = std::floor(K), F = K - I;
	const int Ii = static_cast<int>(I), O = 4 * Ii;
	FVec3 Out;
	if (Nn <= 0) { Out = B.P; return Out; }
	if (Ii >= Nn - 1)
	{
		Out.X = P[4 * (Nn - 1)]; Out.Y = P[4 * (Nn - 1) + 1]; Out.Z = P[4 * (Nn - 1) + 2];
		return Out;
	}
	Out.X = P[O] + (static_cast<double>(P[O + 4]) - P[O]) * F;
	Out.Y = P[O + 1] + (static_cast<double>(P[O + 5]) - P[O + 1]) * F;
	Out.Z = P[O + 2] + (static_cast<double>(P[O + 6]) - P[O + 2]) * F;
	return Out;
}

// ---------------------------------------------------------------------------------------------------------------------
// closed forms of the ground roll (ball.js lines 1006-1050)
// ---------------------------------------------------------------------------------------------------------------------

double LRBall::RollDistance(double V0, double V1, double RollDecel, double DragMul)
{
	// metres a ball rolling at V0 covers until it has slowed to V1
	const double K = BALL::KD * DragMul;
	if (!(V0 > V1)) return 0;
	return LRDetMath::Log((RollDecel + K * V0 * V0) / (RollDecel + K * V1 * V1)) / (2 * K);
}

double LRBall::RollSpeedFor(double D, double V1, double RollDecel, double DragMul)
{
	// the speed a rolling ball needs to arrive D metres away at V1
	const double K = BALL::KD * DragMul;
	return std::sqrt(std::max(0.0, ((RollDecel + K * V1 * V1) * LRDetMath::Exp(2 * K * std::max(0.0, D)) - RollDecel) / K));
}

double LRBall::RollTime(double V0, double D, double RollDecel, double DragMul)
{
	// seconds a ball rolling at V0 takes to cover D metres (infinity when it stops short)
	if (!(D > 0)) return 0;
	if (!(V0 > 0)) return std::numeric_limits<double>::infinity();
	const double K = BALL::KD * DragMul, C = std::sqrt(RollDecel * K);
	const double Phi0 = LRDetMath::Atan(V0 * std::sqrt(K / RollDecel));
	const double Cp = LRDetMath::Cos(Phi0);
	const double Q = Cp * LRDetMath::Exp(K * D);
	if (Q >= 1) return std::numeric_limits<double>::infinity();
	double Ac = BC_NAN;
	if (Q >= -1 && Q <= 1) Ac = LRDetMath::Atan2(std::sqrt((1 - Q) * (1 + Q)), Q);
	return (Phi0 - Ac) / C;
}

double LRBall::RollSpeedAt(double V0, double T, double RollDecel, double DragMul)
{
	// the speed of that ball after T seconds
	const double K = BALL::KD * DragMul, C = std::sqrt(RollDecel * K), Phi = LRDetMath::Atan(V0 * std::sqrt(K / RollDecel)) - C * T;
	return Phi <= 0 ? 0 : std::sqrt(RollDecel / K) * LRDetMath::Tan(Phi);
}

#if defined(_MSC_VER) && !defined(__clang__)
	#pragma float_control(pop)
#elif defined(__clang__)
	#pragma float_control(pop)
#endif
