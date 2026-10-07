/* ============ LIFE: walking, running, starting, stopping and turning ============
   Owner: WP-B (Stage 1). Contract: DESIGN 1.4.18 (gait.js: gaitPlace, footstep, touch, h.gait), 3.5.2 to 3.5.5, 3.5.9
   (first person), 1.4.8 (the gait clock it runs on: gaitcore.js).

   The feet are where the body put them. Each foot is either planted (a footprint locked in the world at touchdown:
   its spot, its yaw and the height of the ground there, never moved until it lifts; only its roll changes, pivoting
   about the heel and then the ball) or swinging (a path in world space from where it left the ground to where it will
   land, leaving and landing at zero speed relative to the ground). The body moves however its owner moves it (the
   mover, a route, the simulation); the gait measures that root motion and keeps the legs under it:
     - the gait clock (gaitcore phaseAdvance) runs on the distance the root travels, so a blocked body stands still
       instead of running on the spot, and the same clock gives the footfalls the camera bob and the sounds use;
     - a foot lifts when its share of the stride (duty, captured at lift-off) is over, or earlier when the body has
       gone further than the leg reaches; its landing spot is planned on the body's real path (straight or turning)
       ahead of where the body will be at touchdown, re-planned every frame until 85% of the swing;
     - start, stop, pivot, settle and cut are footsteps too (3.5.5), never a cross-fade of joint angles;
     - reach resolution in order (3.5.3): the trailing heel rises and the leading foot dorsiflexes, the pelvis turns,
       the hips drop by at most the gait's budget, and anything left over slips the lock and is counted in G.slips
       (a tuning bug, never hidden).
   Units: world metres for footprints and the root; the rig works in body units (metres / h.scale).

   State on the body, read only for everyone else: h.gait = G
     G.phi, G.n, G.side, G.mode ('W' | 'R')   the gait clock (gaitcore), G.n counts every footfall
     G.state   'STAND' | 'CYCLE' | 'STOP'
     G.vs      smoothed root speed (m/s); G.R the walk to run posture blend; G.style 'fwd' | 'shuffle' | 'back'
     G.feet[0] the left foot, [1] the right: {down, x, y, z, yaw, roll, sw (the swing while in the air)}
     G.hipDy   the hips' height offset this frame (body units), G.hipLat its sideways sway (the first-person bob)
     G.ev      what happened in the last step: {mask, at, side} (EV bits) and G.falls [{side, t, x, z}] */
import {WALK, RUN, stepLen, dutyOf, strideTime, gaitShape, phaseAdvance, RUN_ON, RUN_OFF, RUN_HOLD, WALK_HIP_DROP, WALK_PELVIS_YAW} from "./gaitcore.js";
import {clamp, lerp, sstep, wrap, TAU, B, ARM, LEG, R3, qEuler, qMul, fkHips, solveLeg, newFK} from "./rig.js";

export const EV = {FOOTFALL:1, PLANT:2, TAKEOFF:4, CONTACT:8, RELEASE:16, LAND:32, END:64};

// foot geometry (body units): the heel's contact point behind the ankle, the ball under the toe joint ahead of it
// (the ball pivot is the toe joint itself, 2.5 cm off the ground: the toes stay flat while the heel rises)
const HEEL = .078, BALL = .11, TOEY = .025;
const LH = Math.hypot(HEEL, .085), LB = Math.hypot(BALL, .085 - TOEY);
// how far a planted leg may reach, as a share of its full length (softReach eases in past .985)
const REACH = .99;
// the most a heel rises (walk, run) and a leading foot dorsiflexes at heel strike (3.5.3)
const RISE = [1.0, 1.2], DORSI = .35;
// the run's hips (3.5.2): -0.035 - 0.006 v, and a dip at mid-stance
const RUN_HIPS = v => -.035 - .006*v;
// the running foot lands on the heel jogging, flat at a run and on the ball of the foot sprinting
const runLand = v => lerp(-.12, .25, sstep(4.5, 7.5, v));
// posture blend: 0.45 s from walk to run and back (3.5.2)
const R_EASE = .45;
// swing time limits (3.5.3)
const TSW_MIN = .22, TSW_MAX = .45;

/* the ankle of a footprint with roll r (radians: negative toes up about the heel, positive heel up about the ball),
   relative to the footprint's own ground point (the flat ankle's spot): out[0] along the foot, out[1] up (body units) */
const A0 = Math.atan2(.085, HEEL), B0 = Math.atan2(.085 - TOEY, -BALL);
function ankleRel(r, ankY, out){
  if (r <= 0){ const a = A0 - r, k = ankY/.085; out[0] = -HEEL + LH*Math.cos(a); out[1] = LH*Math.sin(a)*k; }
  else { const b = B0 - r, k = ankY/.085; out[0] = BALL + LB*Math.cos(b); out[1] = (TOEY + LB*Math.sin(b))*k; }
  return out;
}
const _ar = [0, 0];

// stance half-width (body units) for a foot at walk-to-run blend R
const halfW = (D, R) => D.hipX - .012 - .03*R;
/* side steps (3.5.2): 3.2 to 4.0 steps a second, the feet never crossing. Each foot travels 2 v / cadence a step, and
   a leg reaches only so far sideways, so a shuffle is a slow gait: above SHUF_MAX the hips turn into the way of travel
   and the legs walk or run across it (the upper body keeps facing where it looks) */
const SHUF_MAX = .9, shufCad = v => clamp(3.2 + .8*v, 3.2, 4.0);
// the body's travel per footfall for the gait's style (the clock's step); turning tightly the steps shorten (the
// planted foot is left behind on the inside of the bend faster than along a straight)
const turnK = G => 1 + clamp(Math.abs(G.headRate) - .5, 0, 4)*(G.mode === "R" ? .08 : .25);
const stepOf = (G, v, sc) => G.style === "shuffle" ? v/shufCad(v/sc) : stepLen(v, G.mode, sc)/turnK(G);
const strideOf = (G, v, sc) => G.style === "shuffle" ? 2/shufCad(v/sc) : strideTime(v, G.mode, sc)/turnK(G);

function newFoot(s){ return {s, down:true, x:0, y:0, z:0, yaw:0, roll:0, tDown:0, sw:null, slip:0, wx:0, wy:0, wz:0}; }
export function gaitInit(h){
  h.gait = {phi:0, n:0, side:"L", mode:"W", held:0, R:0, state:"STAND", init:false,
    rx:0, rz:0, ry:0, vx:0, vz:0, v:0, vs:0, acc:0, head:0, mdx:0, mdz:1, headRate:0, yawRate:0,
    style:"fwd", twist:0, intentT:0, pivotT:0, settleT:0, brakeT:0, cut:0, final:-1, rest:null,
    feet:[newFoot(1), newFoot(-1)], hipDy:0, hipLat:0, hipY:null, slips:0, t:0,
    ev:{mask:0, at:0, side:null, reachErr:0, impact:0}, falls:[], over:[null, null], via:[null, null], belt:0, ext:false};
  return h.gait;
}

/* ---------- where the ground is ---------- */
// the height of the ground for a footprint at (x, z) with yaw: the body's own ground finder (the player's, one ray
// under the heel and one under the tips of the toes, the higher wins: a foot that would reach over a stair's edge
// stands on the step it reaches, the heel out over the edge below) or the root's level
function groundFor(h, x, z, yaw, yRef){
  if (!h.groundAt) return yRef;
  const sc = h.scale, fx = Math.sin(yaw), fz = Math.cos(yaw);
  const a = h.groundAt(x - fx*.07*sc, z - fz*.07*sc, yRef), b = h.groundAt(x + fx*.2*sc, z + fz*.2*sc, yRef);
  if (a == null && b == null) return yRef;
  return Math.max(a == null ? -1e9 : a, b == null ? -1e9 : b);
}

/* ---------- placing the feet afresh (a new body, a teleport, the end of a clip) ----------
   Under the body at its stance width, facing its way, both planted; the clock at a left touchdown. from: the body's
   current drawn feet (world points) when there is a pose to keep, else under the root */
export function gaitPlace(h, from = null){
  const G = h.gait || gaitInit(h), g = h.g, sc = h.scale, ry = g.rotation.y, D = h.D;
  const rx = G.rootX != null ? G.rootX : g.position.x, rz = G.rootZ != null ? G.rootZ : g.position.z;
  const lx = Math.cos(ry), lz = -Math.sin(ry), w = halfW(D, 0)*sc;
  for (let i = 0; i < 2; i++){
    const f = G.feet[i], s = f.s;
    f.down = true; f.sw = null; f.roll = 0; f.tDown = 1; f.slip = 0;
    if (from && from[i]){ f.x = from[i].x; f.z = from[i].z; f.yaw = from[i].yaw != null ? from[i].yaw : ry; }
    else { f.x = rx + lx*s*w; f.z = rz + lz*s*w; f.yaw = ry + s*.06; }
    f.y = groundFor(h, f.x, f.z, f.yaw, g.position.y);
  }
  G.rx = rx; G.rz = rz; G.ry = ry; G.vx = G.vz = G.vs = G.v = G.acc = 0; G.headRate = G.yawRate = 0;
  G.head = ry; G.mdx = Math.sin(ry); G.mdz = Math.cos(ry);
  G.state = "STAND"; G.phi = 0; G.mode = "W"; G.held = 0; G.R = 0; G.init = true; G.intentT = 0; G.pivotT = G.settleT = 0;
  G.hipY = null; G.final = -1; G.rest = null; G.over[0] = G.over[1] = null; G.via[0] = G.via[1] = null;
}

/* ---------- overrides: a planned footprint (strike run-ups, stops), a dribble touch ---------- */
// the next landing of foot side ('L' | 'R' | +1 | -1) goes to (x, z) with yaw, instead of where the gait would put it
export function footstep(h, side, x, z, yaw){
  const G = h.gait || gaitInit(h), i = side === "L" || side === 1 ? 0 : 1;
  G.over[i] = {x, z, yaw: yaw == null ? h.g.rotation.y : yaw};
}
/* a dribble touch: the next swing of that foot (or whichever comes first) passes through the ball at u = 0.70 of its
   swing, keeping its zero landing speed. Returns {tContact} (seconds from now) or null when no swing reaches the ball
   within 0.5 s (no magnet: the caller's ball model decides what happens instead) */
export function touch(h, {side = null, ball, dir = null, strength = 1} = {}){
  const G = h.gait; if (!G || !ball) return null;
  const v = Math.max(G.vs, .3), step = stepOf(G, v, h.scale), rate = v/(2*step);        // strides a second
  let best = null;
  for (let i = 0; i < 2; i++){
    const f = G.feet[i], s = i ? "R" : "L";
    if (side && side !== s && side !== f.s) continue;
    // seconds until u = .7 of this foot's next (or current) swing
    const base = i ? .5 : 0, duty = f.sw ? f.sw.duty : dutyOf(v, G.mode);
    let local = G.phi - base; local -= Math.floor(local);
    let ph;
    if (f.sw && f.sw.u < .7) ph = (duty + .7*(1 - duty)) - local;
    else { ph = duty + .7*(1 - duty) - local; if (ph <= 0) ph += 1; }
    const t = ph/rate;
    if (t <= .5 && (!best || t < best.t)) best = {t, i};
  }
  if (!best) return null;
  G.via[best.i] = {x:ball.x, y:ball.y != null ? ball.y : .11, z:ball.z, laces:G.vs > 5, dir, strength};
  return {tContact:best.t};
}

/* ---------- planning ---------- */
// how far a planted ankle may be from the hip joint (horizontally) for a hip joint H above the footprint, with roll r
// (the ankle of a footprint at a given roll is the same all a body's life: worked out once per body and roll, as reachAt
// is asked several times a frame for every body on the move; out: [reach, the ankle's offset along the foot])
function ankleAt(D, r){ const c = D.arC || (D.arC = new Map()); let a = c.get(r); if (!a){ a = ankleRel(r, D.ankY, [0, 0]); c.set(r, a); } return a; }
const _rA = [0, 0], _rB = [0, 0], _rS = [0, 0];
function reachAt(D, H, r, out = _rA){ const L = REACH*(D.hipY - D.ankY), a = ankleAt(D, r), dy = H - a[1]; out[0] = Math.sqrt(Math.max(0, L*L - dy*dy)); out[1] = a[0]; return out; }
// the most a footprint may lead the hips at touchdown (a) and trail them at lift-off (b) along the way of travel, for
// the gait's lowest hips. Forwards the leading foot reaches on its heel and the trailing one on its ball; backwards the
// other way round (the leading foot lands toe first behind the body, the trailing one rocks back onto its heel in
// front); sideways neither (the legs reach out flat)
function reachSpan(G, D, v, dH = 0){
  // (running, the trailing foot leaves when the leg is long behind at the posture's own height: a run does not squat to
  // keep a foot on the ground. dH: how much higher the hips stand over this footprint than over level ground, a foot
  // left a stair or two below on the way up)
  const run = G.R > .5, H = D.hipY + postureY(G, D, v) - (run ? .01 : hipBudget(G, v)) + dH;
  // (the answer in one array kept for it: read it before asking again)
  if (G.style === "shuffle"){ const w = reachAt(D, H, 0)[0] - Math.max(0, D.hipX - halfW(D, G.R)); _rS[0] = _rS[1] = w; return _rS; }
  const A = reachAt(D, H, run ? -.1 : -DORSI*.8, _rA), Bk = reachAt(D, H, G.style === "back" ? .3 : RISE[run ? 1 : 0], _rB);
  const ra = A[0], za = A[1], rb = Bk[0], zb = Bk[1];
  const yaw = G.R > .5 ? 0 : D.hipX*Math.sin(walkYaw(v));
  if (G.style === "back"){ _rS[0] = rb + zb + yaw; _rS[1] = ra - za + yaw; } else { _rS[0] = ra - za + yaw; _rS[1] = rb + zb + yaw; }
  return _rS;
}
// the walk's pelvis yaw budget and hip drop budget (3.5.2), the run's own
const walkYaw = v => lerp(WALK_PELVIS_YAW[0], WALK_PELVIS_YAW[1], clamp((v - WALK[0][0])/(WALK[WALK.length - 1][0] - WALK[0][0]), 0, 1));
function hipBudget(G, v){
  let w = WALK_HIP_DROP[0];
  if (v > WALK[0][0]){ w = WALK_HIP_DROP[WALK_HIP_DROP.length - 1]; for (let i = 1; i < WALK.length; i++) if (v <= WALK[i][0]){ w = lerp(WALK_HIP_DROP[i - 1], WALK_HIP_DROP[i], (v - WALK[i - 1][0])/(WALK[i][0] - WALK[i - 1][0])); break; } }
  return lerp(w, .07, G.R);
}
// the hips' height for the posture (body units, before reach): standing tall walking, lower running
function postureY(G, D, v){ return lerp(-.012, RUN_HIPS(v), G.R) - (G.style === "shuffle" ? .03 : 0) - (G.jockey ? .07 : 0); }

// the root's position after travelling dist along its path (turning at the measured rate), and its heading there
const _pr = {x:0, z:0, h:0};
function predict(G, dist){
  const k = G.vs > .3 ? G.headRate/G.vs : 0, h0 = G.head, th = k*dist;
  if (Math.abs(th) < 1e-4){ _pr.x = G.rx + Math.sin(h0)*dist; _pr.z = G.rz + Math.cos(h0)*dist; _pr.h = h0; return _pr; }
  _pr.x = G.rx + (Math.cos(h0) - Math.cos(h0 + th))/k; _pr.z = G.rz + (Math.sin(h0 + th) - Math.sin(h0))/k; _pr.h = h0 + th;
  return _pr;
}

/* where foot f should land when its swing ends: (x, z, yaw, roll) into out. rem: the distance the root will have
   travelled by then (the clock's remaining share of the stride times its length) */
function planLanding(h, f, i, rem, out){
  const G = h.gait, D = h.D, sc = h.scale, v = G.vs, s = f.s, ry = h.g.rotation.y;
  const ov = G.over[i];
  if (ov){ out.x = ov.x; out.z = ov.z; out.yaw = ov.yaw; out.roll = G.R > .5 ? -.05 : -.22; return out; }
  // stopping: beside the rest point, square to the way the body faces
  if (G.final === i && G.rest){
    const lx = Math.cos(ry), lz = -Math.sin(ry), w = halfW(D, 0)*sc;
    out.x = G.rest.x + lx*s*w; out.z = G.rest.z + lz*s*w; out.yaw = ry + s*.06; out.roll = -.12; return out;
  }
  const p = predict(G, rem), step = stepOf(G, Math.max(v, .3), sc), duty = dutyOf(Math.max(v, .3), G.mode);
  const fx = Math.sin(p.h), fz = Math.cos(p.h);
  let ax, az, yaw, along, lat, roll;
  const tYaw = ry + G.yawRate*Math.min(.5, rem/Math.max(v, .3));          // where the body will face at touchdown
  if (G.style === "shuffle"){
    // side steps: the feet along the line of travel, never crossing (3.5.2): closed to W2 after the trailing foot's
    // step, open by the stride after the leading one's
    const lead = Math.sin(p.h)*Math.cos(tYaw) - Math.cos(p.h)*Math.sin(tYaw) > 0 ? (s > 0) : (s < 0);   // travelling to this foot's side
    const W2 = lerp(.38, .45, clamp(v/sc, 0, 1))*sc, L = 2*step;
    along = lead ? (W2 + L)/2 : -W2/2; lat = 0; yaw = tYaw + s*.05; roll = -.04;
    ax = p.x + fx*along; az = p.z + fz*along;
  } else {
    const back = G.style === "back";
    const c = duty*2*step, rs = reachSpan(G, D, v/sc), aM = rs[0], bM = rs[1];
    // the footprint leads the hips by a share of the stance in proportion to what each end can reach, and a little
    // inside what the leg reaches at its lowest, so the foot comes down onto it rather than being stretched for it
    const margin = (.03 + .015*Math.min(v/sc, 6))*sc;
    along = Math.min(c <= (aM + bM)*sc ? c*aM/(aM + bM) : aM*sc, aM*sc - margin);
    // the swing reaches past its spot before it comes back onto it: the spot is kept that much inside the leg's forward
    // reach at the height the hips have in the air (running) or late in the swing (walking)
    const T = clamp((1 - duty)*strideOf(G, Math.max(v, .3), sc), TSW_MIN, TSW_MAX), VT = v*T, Dsw = VT + along + .45*sc;
    const Lr = REACH*(D.hipY - D.ankY), Hf = D.hipY + postureY(G, D, v/sc) - (G.R > .5 ? .5*(.012 + .002*v/sc) : .02) - .12;
    const fwd = Math.sqrt(Math.max(0, Lr*Lr - Hf*Hf))*sc;
    const aW = Math.max(.05*sc, Math.min(along, fwd - .6*overshoot(Dsw, VT) - .02*sc));
    // running, the swing leg is held inside RUN_HOLD of its length all the way (gaitLegs): the footprint is where that
    // leaves the ankle once the body has come on to the last 5% of the swing (the foot comes down, it is not reached for)
    let aR = aW;
    if (G.R > 0){
      ankleRel(runLand(v/sc), D.ankY, _ar);
      const dy = D.hipY + postureY(G, D, v/sc) - _ar[1], lr = RUN_HOLD_L*(D.hipY - D.ankY);
      aR = Math.max(.05*sc, (Math.sqrt(Math.max(0, lr*lr - dy*dy)) - _ar[0])*sc - (1 - UH)*VT - (.035 + .03*clamp(Math.abs(G.headRate) - .3, 0, 1))*sc);
    }
    along = lerp(aW, aR, G.R);
    if (back) along *= .8;
    if (G.start > 0) along *= .55;                                       // the first step is a short one
    // the plant of a hard stop: well ahead, as far as the leg reaches with the hips braced low (they come down 0.08)
    if (G.brakeT > 0 && G.state === "STOP" && v > 4) along = Math.min(clamp(.45 + .03*(v - 4), .45, .6)*sc, aR + .07*sc);
    // a cut (3.5.5): the outside foot plants wide, on the new heading: 0.35 m out from the stance line as the design
    // asks, less where the leg would not reach that far sideways at the run's hip height (it plants inside its reach,
    // so the body can turn over it); the plant comes in under the hips by as much
    let wide = 0;
    if (G.cut && Math.sign(G.headRate) === -s){
      const lr = reachAt(D, D.hipY + postureY(G, D, v/sc), 0)[0];
      wide = clamp(lr - (halfW(D, G.R) - D.hipX) - .14, 0, .35)*sc;
      const rr = along + .1*sc; along = Math.sqrt(Math.max(0, rr*rr - wide*wide));
    }
    lat = s*halfW(D, G.R)*sc + s*wide;
    yaw = back ? tYaw : p.h;
    // a foot turns at most 0.6 rad a step walking, 0.35 running (3.5.4)
    const lim = lerp(.6, .35, G.R), dy = wrap(yaw - f.yaw);
    if (Math.abs(dy) > lim) yaw = f.yaw + Math.sign(dy)*lim;
    yaw += s*lerp(.07, .03, G.R)*(back ? -1 : 1);
    const lx = Math.cos(p.h), lz = -Math.sin(p.h);
    if (back){ const bx = Math.sin(tYaw), bz = Math.cos(tYaw), blx = Math.cos(tYaw), blz = -Math.sin(tYaw); ax = p.x + fx*along + blx*lat; az = p.z + fz*along + blz*lat; void bx; void bz; }
    else { ax = p.x + fx*along + lx*lat; az = p.z + fz*along + lz*lat; }
    roll = back ? .3 : lerp(-.26, runLand(v/sc), G.R);
  }
  out.x = ax; out.z = az; out.yaw = yaw; out.roll = roll;
  return out;
}

/* ---------- the swing ---------- */
/* horizontal progress over the ground: a Hermite with zero end tangents (the foot leaves and meets the ground at zero
   speed: in the body's own frame it swings back after toe-off, through under the hip at mid-swing and reaches a little
   past its landing spot before it comes back onto it, as a real foot does), over the ground at u = .95: the last of the
   swing is the foot settling straight down onto its footprint */
const UH = .95;
const EARLY = (1/9)*Math.pow(2/3, 4);
// running, a swinging leg reaches at most this share of its length (the knee keeps its bend until the foot is down)
const RUN_HOLD_L = .965;
const sH = u => { const w = u >= UH ? 1 : u/UH; return w*w*(3 - 2*w); };
// how far past its landing spot (relative to the hips) a swing of world length D carries while the body covers VT
const overshoot = (D, VT) => { const r = VT*UH/Math.max(D, 1e-3); return D*r*r/12 + (1 - UH)*VT; };
const sV = u => u*u*(3 - 2*u);
// the lift: walking it peaks at a third of the swing (u^1.2 (1 - u)^2.2: both exponents over 1, so the foot leaves and
// lands with no vertical jerk); running the heel whips up towards the seat by a third of the swing and the foot stays up
// while the leg comes through, coming down late but slowly at the end (a Bernstein curve: under 0.9 m/s over the last
// 10% at the top sprint lift)
const BW = Math.pow(1.2/3.4, 1.2)*Math.pow(2.2/3.4, 2.2);
const RUNB = [0, .8, 1.2, 1.1, 1, .5, 0, 0, 0], RUNC = RUNB.map((c, k) => { let r = 1; for (let i = 0; i < k; i++) r = r*(8 - i)/(i + 1); return c*r; });
const bR = u => { let s = 0; for (let k = 1; k < 6; k++) s += RUNC[k]*Math.pow(u, k)*Math.pow(1 - u, 8 - k); return s; };
const BR = (() => { let m = 0; for (let u = 0; u <= 1; u += .005) m = Math.max(m, bR(u)); return m; })();
const bump = (u, R) => lerp(Math.pow(u, 1.2)*Math.pow(1 - u, 2.2)/BW, bR(u)/BR, R);

function liftOff(h, f, i, duty, T, kind){
  const G = h.gait, D = h.D, sc = h.scale;
  // where the ankle is right now (the footprint rolled up onto the ball)
  ankleRel(f.roll, D.ankY, _ar);
  const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw);
  const sw = {kind, duty, t:0, T, u:0, x0:f.x + fx*_ar[0]*sc, y0:f.y + _ar[1]*sc, z0:f.z + fz*_ar[0]*sc, yaw0:f.yaw, roll0:f.roll,
    // the footprint it will land on (planned now, re-planned until u = .85)
    x1:f.x, z1:f.z, y1:f.y, yaw1:f.yaw, roll1:0, ok:false, lift:0, gy:f.y, rays:0, vt:G.vs*T};
  const v = G.vs;
  sw.lift = (kind === "close" ? .035 : G.R > .5 ? lerp(.14, .5, clamp((v - RUN[0][0])/(RUN[RUN.length - 1][0] - RUN[0][0]), 0, 1)) : .05 + .012*v)*sc;
  if (kind === "pivot" || kind === "settle") sw.lift = .05*sc;
  f.down = false; f.sw = sw;
  G.ev.mask |= EV.TAKEOFF;
}
// the swing's footprint target this frame (eased after the plan, frozen from u = .85)
const _pl = {x:0, z:0, yaw:0, roll:0};
function updateTarget(h, f, i, rem, dt, force = false){
  const sw = f.sw, G = h.gait;
  if (sw.u >= .85 && sw.ok && !force) return;
  // (a far body, T2 and beyond, re-plans every other frame: its target eases toward the plan either way)
  if (sw.ok && !force && G.lod >= 2 && (G.tick & 1)) return;
  if (sw.kind === "phase" || sw.kind === "stop") planLanding(h, f, i, rem, _pl);
  else { _pl.x = sw.tx; _pl.z = sw.tz; _pl.yaw = sw.tyaw; _pl.roll = -.05; }
  if (!sw.ok || force){ sw.x1 = _pl.x; sw.z1 = _pl.z; sw.yaw1 = _pl.yaw; sw.roll1 = _pl.roll; sw.ok = true; }
  else {
    const k = 1 - Math.exp(-20*dt);
    sw.x1 += (_pl.x - sw.x1)*k; sw.z1 += (_pl.z - sw.z1)*k; sw.yaw1 += wrap(_pl.yaw - sw.yaw1)*k; sw.roll1 += (_pl.roll - sw.roll1)*k;
  }
  // the ground there: looked for at lift-off and again half way (two rays a step), and again if the spot has moved on
  // since by more than a few centimetres (a slope or a stair: the height of where it will really land), met smoothly
  const moved = sw.rays > 0 ? Math.hypot(sw.x1 - sw.rx, sw.z1 - sw.rz) : 0;
  if (sw.rays === 0 || (sw.rays === 1 && sw.u >= .5) || (moved > .06*h.scale && sw.rays < 5)){
    sw.gy = groundFor(h, sw.x1, sw.z1, sw.yaw1, h.g.position.y); sw.rays++; sw.rx = sw.x1; sw.rz = sw.z1;
  }
  sw.y1 += (sw.gy - sw.y1)*(1 - Math.exp(-20*dt));
  void G;
}
// the ankle on its way (world), and the foot's angles, at progress u
function swingAt(h, f, out){
  const sw = f.sw, D = h.D, sc = h.scale, G = h.gait, u = sw.u, s = f.s;
  ankleRel(sw.roll1, D.ankY, _ar);
  const f1x = Math.sin(sw.yaw1), f1z = Math.cos(sw.yaw1);
  const ex = sw.x1 + f1x*_ar[0]*sc, ey = sw.y1 + _ar[1]*sc, ez = sw.z1 + f1z*_ar[0]*sc;
  // (a step up: the foot comes up off its tread before it goes forward, the toes clear of the riser ahead)
  const stepUp = ey - sw.y0 > .05*sc, k = stepUp ? sH(Math.max(0, (u - .12)/.88)) : sH(u);
  let x = sw.x0 + (ex - sw.x0)*k, z = sw.z0 + (ez - sw.z0)*k;
  // step-ups lift higher; the ankle keeps outside the hip line with a small bulge at mid-swing
  // (going up, the foot rises at least as fast as it goes along: up a stair it follows the line of the nosings rather
  // than cutting under them; going down it keeps its height and comes down at the end)
  const up = Math.max(0, ey - sw.y0);
  // (a step up lifts the foot early, the toes clear of the riser in front of them before they come forward)
  let y = sw.y0 + (ey - sw.y0)*(up > .02 ? Math.max(sV(u), sH(u)) : sV(u)) + sw.lift*bump(u, G.R) + up*.6*sstep(0, .3, u)*(1 - sstep(.7, 1, u));
  const dx = ex - sw.x0, dz = ez - sw.z0, dl = Math.hypot(dx, dz);
  if (dl > .05 && sw.kind !== "close"){
    const sb = Math.sin(Math.PI*Math.min(1, u/UH)), b = .025*sc*sb*sb*s; x += dz/dl*b; z += -dx/dl*b;   // (all done by the last 5%: the foot comes straight down)
    // running, the foot comes through early: it leaves the ground at its own speed (zero) but does not trail behind the
    // body while it rises; the heel folds up under the seat and the knee comes through (zero at both ends, peak at 1/3)
    if (G.R > 0 && sw.kind === "phase"){ const w = Math.min(1, u/UH), e = .1*sw.vt*G.R*w*w*Math.pow(1 - w, 4)/EARLY; x += dx/dl*e; z += dz/dl*e; }
  }
  // a dribble touch: through the ball at u = .7, still landing where it was going (a bump that is zero at both ends)
  const via = G.via[f.s > 0 ? 0 : 1];
  if (via && sw.kind === "phase"){
    const m = u < .7 ? sstep(0, .7, u) : 1 - sstep(.7, 1, u);
    if (m > 0){
      if (sw.vx == null && u <= .7){ sw.vx = via.x - (sw.x0 + (ex - sw.x0)*sH(.7)); sw.vz = via.z - (sw.z0 + (ez - sw.z0)*sH(.7)); sw.vy = Math.max(0, via.y - .06*sc - (sw.y0 + (ey - sw.y0)*sV(.7))); }
      if (sw.vx != null){ x += sw.vx*m; z += sw.vz*m; y += (sw.vy || 0)*m; }
    }
  }
  out.x = x; out.y = y; out.z = z;
  out.yaw = sw.yaw0 + wrap(sw.yaw1 - sw.yaw0)*sstep(.1, .8, u);
  // the foot leaves pointed (toe-off), comes through with the toes up a little and reaches for its landing angle
  out.roll = lerp(sw.roll0, sw.roll1, sstep(.15, .9, u)) - lerp(.18, -.15, G.R)*Math.sin(Math.PI*Math.min(1, u*1.15))*(sw.kind === "close" ? .3 : sw.kind === "stop" ? 0 : 1);
  out.toe = -Math.max(0, sw.roll0)*(1 - sstep(.05, .5, u));
  return out;
}

function touchDown(h, f, i, at, dt){
  const G = h.gait, sw = f.sw;
  if (sw){
    sw.u = 1;
    f.x = sw.x1; f.z = sw.z1; f.y = sw.gy; f.yaw = sw.yaw1; f.roll = sw.roll1;
    if (sw.kind !== "phase" && sw.kind !== "stop") f.roll = Math.min(0, sw.roll1);
    // (the clock counts its own footfalls; every other step, a stop, a close, a pivot, is counted here: G.n is
    // every footfall, the one counter the camera's bob and the sounds go by)
    if (sw.kind !== "phase") G.n++;
  }
  f.down = true; f.sw = null; f.tDown = 0; f.slip = 0; f.rollLand = f.roll; f.rollAdj = 0;
  if (G.over[i]) G.over[i] = null;
  if (G.via[i]) G.via[i] = null;
  G.ev.mask |= EV.FOOTFALL; G.ev.at = at*dt; G.ev.side = i ? "R" : "L";
  G.falls.push({side:i ? "R" : "L", t:at*dt, x:f.x, z:f.z});
  if (G.start > 0) G.start = 0;
  G.side = i ? "R" : "L";
}

/* ---------- one step of the gait ----------
   st: the animation state ({speed (what the owner asks for), intent, style, phase (an external gait clock), root
   ({x, z}: where the body really is, when the drawn group carries cosmetic offsets), belt (m/s of treadmill)}) */
export function gaitStep(h, dt, st){
  const G = h.gait || gaitInit(h), g = h.g, sc = h.scale, D = h.D;
  G.ev.mask = 0; G.ev.side = null; G.falls.length = 0;
  const rx = st.root ? st.root.x : g.position.x, rz = st.root ? st.root.z : g.position.z, ry = g.rotation.y;
  G.rootX = rx; G.rootZ = rz;
  if (!G.init){ gaitPlace(h); return G; }
  if (!(dt > 0)) return G;
  let dx = rx - G.rx, dz = rz - G.rz;
  // a treadmill: the ground runs back under the feet; what counts for the stride is the body against the belt
  const belt = +st.belt || 0;
  if (belt){
    const bx = -Math.sin(ry)*belt*dt, bz = -Math.cos(ry)*belt*dt;
    for (const f of G.feet) if (f.down){ f.x += bx; f.z += bz; }
    dx -= bx; dz -= bz;
  }
  const dl = Math.hypot(dx, dz);
  if (dl > Math.max(1.5, 12*dt)){ gaitPlace(h); return G; }          // put somewhere, not a step
  G.rx = rx; G.rz = rz; G.t += dt; G.lastDx = dx; G.lastDz = dz; G.tick = (G.tick || 0) + 1;
  // what the root did: velocity (smoothed for posture and planning), acceleration, the way it travels, turning
  const ivx = dx/dt, ivz = dz/dt, k12 = 1 - Math.exp(-12*dt), vs0 = G.vs;
  G.vx += (ivx - G.vx)*k12; G.vz += (ivz - G.vz)*k12; G.v = dl/dt;
  G.vs = Math.hypot(G.vx, G.vz);
  G.acc += ((G.vs - vs0)/dt - G.acc)*(1 - Math.exp(-8*dt));
  // (and the root's own speed change, barely smoothed: how hard it is braking right now, for where a stop ends)
  G.accR = G.vRaw0 == null ? 0 : G.accR + ((G.v - G.vRaw0)/dt - G.accR)*(1 - Math.exp(-25*dt)); G.vRaw0 = G.v;
  if (G.vs > .08){
    const hd = Math.atan2(G.vx, G.vz), d = wrap(hd - G.head);
    G.headRate += (clamp(d/dt, -12, 12) - G.headRate)*(1 - Math.exp(-10*dt));
    G.head = hd; G.mdx = Math.sin(hd); G.mdz = Math.cos(hd);
  } else {
    G.headRate *= Math.exp(-10*dt);
    // standing still, the way of travel is the way the body faces (the next start goes from there)
    if (G.state === "STAND"){ G.head = ry; G.mdx = Math.sin(ry); G.mdz = Math.cos(ry); }
  }
  G.yawRate += (clamp(wrap(ry - G.ry)/dt, -15, 15) - G.yawRate)*(1 - Math.exp(-12*dt)); G.ry = ry;
  const v = G.vs, intent = st.intent != null ? +st.intent : st.speed != null ? +st.speed : v;
  // the style of stepping (3.5.2): along the way the body faces, sideways, or backwards
  const rel = wrap(G.head - ry), ar = Math.abs(rel);
  G.jockey = st.style === "jockey";
  const side = ar >= 60*Math.PI/180 && ar <= 120*Math.PI/180 && G.vs/sc < (G.style === "shuffle" ? SHUF_MAX + .15 : SHUF_MAX - .1);
  const style = st.style === "jockey" ? "shuffle" : st.style && st.style !== "normal" ? st.style : ar > 120*Math.PI/180 ? "back" : side ? "shuffle" : "fwd";
  if (v > .2 || G.state === "STAND") G.style = style;
  G.twist += ((G.style === "fwd" ? clamp(rel, -1.1, 1.1) : G.style === "back" ? clamp(wrap(rel - Math.PI), -.5, .5) : 0) - G.twist)*(1 - Math.exp(-10*dt));
  // walk or run, effective at the next footfall; the posture eases over 0.45 s
  G.held = v > RUN_ON ? G.held + dt : 0;
  const want = G.mode === "R" ? (v < RUN_OFF ? "W" : "R") : (v > RUN_ON && G.held >= RUN_HOLD ? "R" : "W");
  G.want = want;
  G.R = clamp(G.R + (G.mode === "R" ? dt : -dt)/R_EASE, 0, 1);
  G.cut = v > 3 && Math.abs(G.headRate)*.3 > .5 ? 1 : 0;
  if (G.brakeT > 0) G.brakeT -= dt;
  for (const f of G.feet){ if (f.down) f.tDown += dt; else f.sw.t += dt; }

  if (G.state === "STAND") standStep(h, dt, v, intent);
  else cycleStep(h, dt, v, intent, st);
  // the swings in flight
  for (let i = 0; i < 2; i++){
    const f = G.feet[i];
    if (!f.sw || f.sw.kind === "phase" || f.sw.kind === "stop") continue;
    f.sw.u = Math.min(1, f.sw.t/f.sw.T);
    if (f.sw.frac != null && f.sw.u < .85) pivotTarget(h, f);
    updateTarget(h, f, i, 0, dt);
    if (f.sw.u >= 1) touchDown(h, f, i, 1, dt);
  }
  if (G.state === "STOP" && !G.feet[0].sw && !G.feet[1].sw && G.final < 0 && v < .05){ G.state = "STAND"; G.rest = null; }
  return G;
}

// standing: both feet planted, the turn taken up by the hips until it is too much, then pivot steps; settle steps when
// the body has drifted off its feet; and the start when it moves off
function standStep(h, dt, v, intent){
  const G = h.gait, D = h.D, sc = h.scale, ry = h.g.rotation.y;
  const swinging = G.feet[0].sw || G.feet[1].sw;
  G.intentT = intent > .2 ? G.intentT + dt : 0;
  if ((v > .15 || G.intentT >= .05) && !swinging && !G.ext) return startMoving(h, intent);
  if (G.ext && v > .15 && !swinging) return startMoving(h, intent);
  if (swinging){
    // a quick turn while one foot is stepping: the planted one turns on the ball of its foot (at most 7 rad/s, the
    // only way a footprint ever moves: about its ball, which stays where it is)
    for (const f of G.feet){
      if (!f.down) continue;
      const d = wrap(ry + f.s*.06 - f.yaw), ex = Math.abs(d) - .6;
      if (ex <= 0 || Math.abs(G.yawRate) < 2) continue;
      const k = Math.sign(d)*Math.min(ex, 7*dt), bx = f.x + Math.sin(f.yaw)*BALL*sc, bz = f.z + Math.cos(f.yaw)*BALL*sc;
      f.yaw += k; f.x = bx - Math.sin(f.yaw)*BALL*sc; f.z = bz - Math.cos(f.yaw)*BALL*sc; f.ballPivot = .25;
    }
    return;
  }
  // a foot the leg cannot reach where it stands (left out there by a clip, a shove): it steps in at once, it is not
  // dragged
  for (let i = 0; i < 2; i++){ const f = G.feet[i]; if (f.down && (f.miss || 0) > .004 && f.tDown > .05) return pivotStep(h, i, .28, 1, "settle"); }
  // the turn: the feet's mean yaw against the body's
  const fy = G.feet[0].yaw + wrap(G.feet[1].yaw - G.feet[0].yaw)/2 - (G.feet[0].s*.06 + G.feet[1].s*.06)/2, dy = wrap(ry - fy), ady = Math.abs(dy);
  // (and either foot on its own left turned well away from the body: the mean of two wrong feet can look right)
  const f0 = G.feet[0], f1 = G.feet[1], off = Math.max(Math.abs(wrap(ry + f0.s*.06 - f0.yaw)), Math.abs(wrap(ry + f1.s*.06 - f1.yaw)));
  G.pivotT = ady > .25 || off > .5 ? G.pivotT + dt : 0;
  if (ady < .2 && off < .5) G.turnN = 0;
  // (a turn under way goes on step after step until both feet face the body's way)
  if (ady > .45 || G.pivotT > .6 || (off > .7 && Math.abs(G.yawRate) < 1) || (G.turnN > 0 && off > .3)){
    // the foot on the side of the turn opens first; more than 1.6 rad is three quicker steps: the first foot opens
    // half way, the other comes right round, the first closes beside it
    const many = ady > 1.6 || G.turnN > 0, first = dy > 0 ? 0 : 1, f = G.feet[first], o = G.feet[1 - first];
    // (the feet take turns through a turn; the first step is the foot turned furthest from the way the body faces)
    const pick = G.turnN > 0 && G.lastPivot != null ? 1 - G.lastPivot : Math.abs(wrap(ry - f.yaw)) > Math.abs(wrap(ry - o.yaw)) ? first : 1 - first;
    const half = ady > 1.6 && !G.turnN;
    G.turnN = (G.turnN || 0) + 1; G.lastPivot = pick;
    return pivotStep(h, pick, many ? .26 : .3, half ? .55 : 1);
  }
  // drift: the support midpoint against the root, in the body's frame
  const mx = (G.feet[0].x + G.feet[1].x)/2 - G.rx, mz = (G.feet[0].z + G.feet[1].z)/2 - G.rz;
  const fwd = mx*Math.sin(ry) + mz*Math.cos(ry), lat = mx*Math.cos(ry) - mz*Math.sin(ry);
  const wide = Math.hypot(G.feet[0].x - G.feet[1].x, G.feet[0].z - G.feet[1].z)/sc;
  // (and a foot well away from its own spot beside the other: after a quick turn, say, one behind the other)
  let worst = -1, wd = 0;
  for (let i = 0; i < 2; i++){
    const f = G.feet[i], w = halfW(D, 0)*sc, tx = G.rx + Math.cos(ry)*f.s*w, tz = G.rz - Math.sin(ry)*f.s*w, d = Math.hypot(f.x - tx, f.z - tz);
    if (d > wd){ wd = d; worst = i; }
  }
  G.settleT = Math.abs(lat) > .18*sc || Math.abs(fwd) > .22*sc || wide < .1 || wide > .55 || wd > .16*sc ? G.settleT + dt : 0;
  if (G.settleT > .12){
    // the foot furthest from where it would stand steps there
    if (worst >= 0 && wd > .04*sc) pivotStep(h, worst, .3, 1, "settle");
    G.settleT = 0;
  }
}
// a step in place: foot i to its stance spot round the root, turned frac of the way to where the body will face when
// it lands (the body's turn carried on for most of the step)
function pivotStep(h, i, T, frac, kind = "pivot"){
  const G = h.gait, f = G.feet[i];
  liftOff(h, f, i, 0, T, kind);
  const sw = f.sw;
  sw.frac = frac; sw.yawS = f.yaw;
  pivotTarget(h, f);
  sw.x1 = sw.tx; sw.z1 = sw.tz; sw.yaw1 = sw.tyaw; sw.roll1 = 0; sw.ok = true;
}
// where a step in place lands: re-planned as the body goes on turning (the share frac of the way from where the foot
// was to where the body faces now, a little ahead of it while it is still turning), until 85% of the step
function pivotTarget(h, f){
  const G = h.gait, D = h.D, sc = h.scale, sw = f.sw;
  const ry = h.g.rotation.y + clamp(G.yawRate*(sw.T - sw.t)*.5, -.6, .6);
  const yaw = sw.yawS + wrap(ry - sw.yawS + f.s*.06)*sw.frac, fy = yaw - f.s*.06, w = halfW(D, 0)*sc;
  sw.tx = G.rx + Math.cos(fy)*f.s*w; sw.tz = G.rz - Math.sin(fy)*f.s*w; sw.tyaw = yaw;
}
// moving off (3.5.5): the foot further behind along the way steps first, a short step, quickly
function startMoving(h, intent){
  const G = h.gait, v = Math.max(G.vs, intent || 0, .5), ry = h.g.rotation.y;
  let mdx = G.mdx, mdz = G.mdz;
  if (G.vs < .08){ mdx = Math.sin(ry); mdz = Math.cos(ry); G.head = ry; G.mdx = mdx; G.mdz = mdz; }
  const a = (G.feet[0].x - G.rx)*mdx + (G.feet[0].z - G.rz)*mdz, b = (G.feet[1].x - G.rx)*mdx + (G.feet[1].z - G.rz)*mdz;
  // the first step is always a walking one (a run starts from a step, then the clock changes gait at a footfall)
  const lead = a <= b ? 0 : 1, run = v > RUN_ON;
  G.mode = "W"; G.held = 0; G.state = "CYCLE"; G.start = 1; G.final = -1; G.rest = null;
  const duty = dutyOf(Math.min(v, 2.2), "W");
  G.phi = lead ? (.5 + duty) % 1 : duty;
  void run;
  liftOff(h, G.feet[lead], lead, duty, v > RUN_ON ? .24 : .28, "phase");
  G.feet[lead].sw.first = true;
}

// moving: the clock runs on the distance travelled; lift-offs at the end of a foot's share of the stride or of its reach;
// landings at the clock's footfalls; and the stop when the body comes to a halt
function cycleStep(h, dt, v, intent, st){
  const G = h.gait, D = h.D, sc = h.scale, ry = h.g.rotation.y;
  const vv = Math.max(v, .3), step = stepOf(G, vv, sc), kS = stepLen(vv, G.mode, sc)/step;
  // 1. the clock: distance along the way of travel (an external clock if the owner has one)
  let dist = 0;
  if (typeof st.phase === "number"){ let d = st.phase - G.phi; d -= Math.round(d); dist = Math.max(0, d)*2*step; G.ext = true; }
  else { dist = Math.max(0, G.lastDx*G.mdx + G.lastDz*G.mdz); G.ext = false; }
  const phi0 = G.phi;
  advance(h, dist*kS, vv, dt);
  // 2. the time floor: a swing finishes its step on time even when the body slows (the clock is moved on with it)
  let need = 0;
  for (let i = 0; i < 2; i++){
    const f = G.feet[i], sw = f.sw; if (!sw || sw.kind !== "phase") continue;
    const up = phaseU(G, i, sw.duty), ut = sw.t/sw.T;
    if (ut > up + 1e-6) need = Math.max(need, (ut - up)*(1 - sw.duty));
  }
  if (need > 0) advance(h, Math.min(need, .5)*2*step*kS, vv, dt);
  // how fast the clock really runs (by distance, or faster when a swing's time floor pushes it)
  let dph = G.phi - phi0; dph -= Math.floor(dph);
  G.phRate = G.phRate == null ? dph/dt : G.phRate + (dph/dt - G.phRate)*(1 - Math.exp(-10*dt));
  // 3. lift-offs: a planted foot whose share of the stride is over, or that the body has left behind beyond reach
  const duty = dutyOf(vv, G.mode), bM = reachSpan(G, D, vv/sc)[1], stopping = G.state === "STOP";
  for (let i = 0; i < 2; i++){
    const f = G.feet[i]; if (!f.down || f.tDown < .05) continue;
    const local = localPhase(G, i);
    const other = G.feet[1 - i];
    // (running, where it will be 20 ms on, whatever the frame rate: at a sprint the body passes 15 cm in that time)
    // (measured from its own hip joint, turned with the hips; and out to the side as well as behind: a cut or a bend
    // leaves a foot out there, and the leg reaches radially)
    const hy = ry + G.twist, hx = G.rx + f.s*D.hipX*sc*Math.cos(hy), hz = G.rz - f.s*D.hipX*sc*Math.sin(hy);
    const bk = -((f.x - hx)*G.mdx + (f.z - hz)*G.mdz) + (G.mode === "R" ? G.vs*.02 : 0);
    const lat = (f.x - hx)*G.mdz - (f.z - hz)*G.mdx, side = G.style === "shuffle" ? 0 : Math.max(0, Math.abs(lat) - .03*sc);
    const behind = bk > 0 ? Math.hypot(bk, side) : bk;
    // (not a foot that has only just landed walking: that one waits for the body to come over it)
    // (a foot left turned away from the way of travel gains less from rising onto its ball; one left lower than the body
    // stands, up a stair, reaches less far behind)
    const dH = (h.g.position.y - f.y)/sc, bH = Math.abs(dH) > .02 ? reachSpan(G, D, vv/sc, dH)[1] : bM;
    const bMf = bH - .1*(1 - Math.cos(wrap(f.yaw - G.head - (G.style === "back" ? Math.PI : 0))));
    const outOfReach = behind > (bMf - .02)*sc && (G.mode === "R" ? local > .5*duty : local > .2 || f.tDown > .12);
    void other;
    if ((local >= duty && local < duty + .45) || outOfReach){
      if (stopping && G.final >= 0) continue;
      // (the swing has the rest of the stride: a foot that leaves early by reach takes the longer swing)
      const d0 = Math.min(local, duty), T = clamp((1 - d0)*strideOf(G, vv, sc), TSW_MIN, TSW_MAX);
      liftOff(h, f, i, d0, T, "phase");
    }
  }
  // 4. swings: progress from the clock, targets re-planned
  for (let i = 0; i < 2; i++){
    const f = G.feet[i], sw = f.sw; if (!sw || (sw.kind !== "phase" && sw.kind !== "stop")) continue;
    if (sw.kind === "stop"){ sw.u = Math.min(1, sw.u0 + (1 - sw.u0)*clamp((sw.t - sw.t0)/Math.max(1e-3, sw.T - sw.t0), 0, 1)); }
    else sw.u = clamp(phaseU(G, i, sw.duty), 0, 1);
    // (the swing ends by the clock or by its time floor, whichever comes first: the body covers the less of the two)
    // (the time left, at the speed the body will have: it may be slowing into a stop or a cut)
    const left = Math.max(0, (1 - sw.u)*(1 - sw.duty)), tl = Math.min(Math.max(0, sw.T - sw.t), G.phRate > .05 ? left/G.phRate : 9);
    const rem = Math.min(left*2*step*1.5, Math.max(0, v*tl + .5*clamp(G.acc, -8, 8)*tl*tl));
    updateTarget(h, f, i, rem, dt);
    if (sw.kind === "stop" && sw.u >= 1) touchDown(h, f, i, 1, dt);
  }
  // 5. stopping (3.5.5): the owner wants to stop and the body is slowing, or it has all but stopped
  // (not a body just getting going: slow, but asked to go and speeding up)
  // (not a body just getting going: slow, but asked to go and speeding up; and a hard brake with nothing asked of the
  // legs is a stop at once, whatever the speed: the steps left are worked out from the stopping distance below)
  const wantStop = (intent < .2 && (G.acc < -.3 || v < .6)) || (v < .35 && !(intent > .35 && G.acc > .3));
  // (or braking so hard, whatever it was asked, that it will have stopped inside this step)
  const hard = intent < 1 && G.accR < -4 && G.v*G.v/(-2*G.accR) < .6*step;
  if (!stopping && ((wantStop && (v < Math.max(.35, intent + .5) || (intent < .2 && G.acc < -3))) || hard)){
    G.state = "STOP";
    if (v > 4) G.brakeT = .25;
  }
  if (G.state === "STOP"){
    // going on after all: asked to and speeding up, or still well on the move with no last step under way
    if ((intent > .25 && v > .5 && G.acc > 0) || (intent > .5 && v > 1.2 && G.final < 0)){ G.state = "CYCLE"; G.final = -1; G.rest = null; G.closed = false; return; }
    const vr = Math.min(v, G.v), dec = Math.max(3, -G.acc, -G.accR), dstop = vr*vr/(2*dec);
    G.rest = G.rest || {x:0, z:0};
    G.rest.x = G.rx + G.mdx*dstop; G.rest.z = G.rz + G.mdz*dstop;
    // a foot in the air lands beside the rest point if the body stops within this step, else steps on
    if (G.final < 0){
      for (let i = 0; i < 2; i++){
        const f = G.feet[i], sw = f.sw; if (!sw) continue;
        // (running, not a swing too far on to be put somewhere else: it lands where it was going, the other foot last)
        if (dstop <= .6*step && (sw.u < .6 || G.R < .5)){ G.final = i; sw.kind = "stop"; sw.T = Math.min(sw.T, sw.t + Math.max(.12, (1 - sw.u)*.3)); sw.t0 = sw.t; sw.u0 = sw.u; }
      }
      // both feet down and (almost) stopped: the foot further from its spot beside the rest point closes up
      if (G.final < 0 && G.feet[0].down && G.feet[1].down && v < .25) closeStep(h);
    } else if (G.feet[G.final].down){
      // the last step is down: the other foot closes up beside it, then the body stands
      const o = 1 - G.final, f = G.feet[o];
      if (f.down){
        // (the close comes once the body has all but stopped over the last step)
        if (!G.closed){ if (v < .6){ G.closed = true; closeStep(h, o); } }
        // (standing once the body has all but stopped over its feet; until then the feet stay where they are)
        else if (v < .25){ G.state = "STAND"; G.final = -1; G.rest = null; G.closed = false; }
      }
    }
  }
  void ry;
}
// the closing step of a stop: foot i (or the one further from its spot) beside the other, 0.30 s, low (3.5.5)
function closeStep(h, i = -1){
  const G = h.gait, D = h.D, sc = h.scale, ry = h.g.rotation.y, w = halfW(D, 0)*sc;
  const rx = G.rest ? G.rest.x : G.rx, rz = G.rest ? G.rest.z : G.rz;
  const spot = j => { const s = G.feet[j].s; return [rx + Math.cos(ry)*s*w, rz - Math.sin(ry)*s*w]; };
  if (i < 0){
    const d0 = Math.hypot(G.feet[0].x - spot(0)[0], G.feet[0].z - spot(0)[1]), d1 = Math.hypot(G.feet[1].x - spot(1)[0], G.feet[1].z - spot(1)[1]);
    i = d0 > d1 ? 0 : 1;
    if (Math.max(d0, d1) < .05*sc){ G.state = "STAND"; G.final = -1; G.rest = null; G.closed = false; return; }
    G.final = 1 - i; G.closed = true;
  }
  const f = G.feet[i], [tx, tz] = spot(i);
  if (Math.hypot(f.x - tx, f.z - tz) < .04*sc){ G.state = "STAND"; G.final = -1; G.rest = null; G.closed = false; return; }
  liftOff(h, f, i, 0, .3, "close");
  f.sw.tx = tx; f.sw.tz = tz; f.sw.tyaw = ry + f.s*.06;
  f.sw.x1 = tx; f.sw.z1 = tz; f.sw.yaw1 = f.sw.tyaw; f.sw.roll1 = 0; f.sw.ok = true;
}
const localPhase = (G, i) => { let p = G.phi - (i ? .5 : 0); p -= Math.floor(p); return p; };
function phaseU(G, i, duty){ const p = localPhase(G, i); return p < duty ? (p > duty - .02 ? 0 : 1) : (p - duty)/(1 - duty); }
// the clock moved on by dist: every footfall it crosses lands that foot
function advance(h, dist, v, dt){
  const G = h.gait;
  if (!(dist > 0)) return;
  const evs = phaseAdvance(G, dist, v, G.mode, h.scale);
  for (const e of evs){
    const i = e.side === "L" ? 0 : 1, f = G.feet[i];
    if (f.sw && f.sw.kind === "phase") touchDown(h, f, i, e.at, dt);
    // the walk/run switch takes effect at a footfall (3.5.2)
    if (G.want && G.want !== G.mode) G.mode = G.want;
  }
}

/* ---------- the upper body while on the move (Euler, before the constraint pass) ----------
   Writes the hips' sway, roll and turn, the spine's lean, the chest's counter-turn, the head held level, and arms
   swinging against the legs, all on the same clock as the feet. fac: stamina factors ({lean}) or null. The legs are
   left to gaitLegs. */
export function gaitPose(h, T, st, fac = null, dt = 0){
  const G = h.gait, D = h.D, sc = h.scale, v = G.vs/sc, R = G.R;
  // how much the body is on the move, eased: arms and lean settle over a few tenths of a second after a hard stop
  const m0 = sstep(.05, .9, v);
  G.mvA = G.mvA == null || !(dt > 0) ? m0 : G.mvA + (m0 - G.mvA)*(1 - Math.exp(-(m0 > G.mvA ? 10 : 6)*dt));
  const mv = G.mvA;
  // the hard stop's brace (3.5.5), eased in and out
  G.brakeW = G.brakeW == null || !(dt > 0) ? (G.brakeT > 0 ? 1 : 0) : G.brakeW + ((G.brakeT > 0 ? 1 : 0) - G.brakeW)*(1 - Math.exp(-12*dt));
  const pL = G.phi, duty = dutyOf(Math.max(v, .3), G.mode), cL = Math.cos(TAU*pL), mid = Math.cos(TAU*(pL - duty/2));
  const lk = fac && Number.isFinite(fac.lean) ? fac.lean : 1,          // (stamina factors not worked out yet: a fresh body)
    tired = clamp(+st.fatigue || 0, 0, 1);
  // pelvis: turns with the legs (the walk's budget), rolls onto the stance side and sways over it walking
  const yaw = (G.R > .5 ? .1 : walkYaw(v))*mv;
  T[60] = .012*(1 - R)*mid*mv; T[62] = 0;
  // turn lean (into the bend) and acceleration lean (into a start, back into a stop)
  const om = G.headRate, turn = clamp(Math.atan(v*om/9.81)*.8, -.35, .35)*sstep(1, 3, v);
  const acc = clamp(.045*G.acc, -.15, .25)*sstep(.3, 1.5, v), brake = -.18*G.brakeW;
  const lean = (.03 + .09*R + .05*sstep(4.5, 8, v))*lk*mv + acc + brake + .08*tired*mv;
  T[60] += turn*.12;
  R3(T, B.hips, .04*R*mv + (G.style === "shuffle" ? .05 : 0) + (G.jockey ? .1 : 0), -yaw*cL + G.twist, .035*(1 - R)*mid*mv - turn);
  R3(T, B.spine, lean, yaw*.5*cL - G.twist*.55, turn*.4);
  R3(T, B.chest, .02*R - .01 + .06*tired*mv, yaw*.8*cL - G.twist*.45, turn*.3);
  R3(T, B.neck, -lean*.5, -yaw*.6*cL, -turn*.3); R3(T, B.head, -lean*.25 - .02, -yaw*.35*cL, -turn*.2);
  // arms swing against the legs; elbows fold as the pace rises (tired arms swing less)
  const A = lerp(.22 + .14*Math.min(1, v/1.4), Math.min(1.05, .55 + .07*(v - 3)), R)*mv*lk*(1 - .2*tired)*(G.style === "fwd" ? 1 : .35);
  const e0 = lerp(.22, 1.3 + .12*sstep(5, 8, v), R)*Math.max(mv, .5) + (1 - mv)*.16;
  const fwdArms = .5*G.brakeW;
  for (const s of [1, -1]){
    const [ua, fa, hd] = ARM(s), p = s > 0 ? pL : (pL + .5) % 1, c = Math.cos(TAU*p);
    let ux = A*c - .08*R - fwdArms + (G.jockey ? -.35 : 0), uz = s*(.1 + .05*R + (G.jockey ? .45 : 0));
    // first person looking down at a run: the arms kept low and near the body, so the hands stay at the bottom of the view
    const ak = +st.armsIn || 0;
    if (ak > 0){ if (ux < 0) ux *= 1 - .85*ak; ux += .3*ak; uz += s*.2*ak; }
    R3(T, ua, ux, -s*.1*R*c, uz);
    R3(T, fa, -(e0 + .25*R*(1 - c)/2 + .1*(1 - R)*(1 - c)/2*mv)*(1 - .3*ak), -s*(.25 + .2*R), 0);
    R3(T, hd, lerp(.1, -.05, R), 0, 0);
  }
}

/* ---------- the constraint pass: hips height and both legs (quaternion pose) ----------
   After the blend: the feet go to their footprints (planted, rolled) or along their swings, and the hips come down
   just as far as a planted leg needs to reach (at most the gait's budget; falling at once, rising at most 0.6 m/s).
   Q: the pose (hips offset at 80..82 as the posture asks), F: an FK buffer. */
const _fq = new Float64Array(8), _sa = {x:0, y:0, z:0, yaw:0, roll:0, toe:0}, _tg = [{}, {}], _tq = new Float64Array(4);
const _hj = new Float64Array(3);
// the frame gaitLegs works in (the body's group: where it stands, its scale, its yaw), so the helpers below need no
// closures made for every call
const TB = {gx:0, gy:0, gz:0, sc:1, cy:1, sy:0};
// a world point into the body's own space (body units)
function toBody(x, y, z, o){ const ox = (x - TB.gx)/TB.sc, oz = (z - TB.gz)/TB.sc; o.x = ox*TB.cy - oz*TB.sy; o.z = ox*TB.sy + oz*TB.cy; o.y = (y - TB.gy)/TB.sc; }
// how much lower the hip joint must come for a planted foot rolled rr to be reached (t: receives the ankle, body space)
function needAt(rr, f, fx, fz, hip, t, L, D){
  const sc = TB.sc;
  ankleRel(rr, D.ankY, _ar); toBody(f.x + fx*_ar[0]*sc, f.y + _ar[1]*sc, f.z + fz*_ar[0]*sc, t);
  const dh = Math.hypot(t.x - hip[0], t.z - hip[2]);
  return hip[1] - (t.y + Math.sqrt(Math.max(0, L*L - dh*dh))) + (dh > L ? dh - L : 0);
}
/* lite: the leg pass of a far body between its full poses (DESIGN 3.5.9: the gait, two leg solves and the hips'
   height): a planted foot keeps the reach correction its roll had at the last full solve, and is searched for (the heel
   rise) only when that no longer reaches; a swinging knee is not rate-limited */
export function gaitLegs(h, Q, F, dt, lite = false){
  const G = h.gait, D = h.D, sc = h.scale, g = h.g, ry = g.rotation.y, cy = Math.cos(ry), sy = Math.sin(ry);
  const gx = g.position.x, gy = g.position.y, gz = g.position.z, v = G.vs/sc;
  const L = REACH*(D.hipY - D.ankY), run = G.R > .5, mv = sstep(.05, .9, v);
  // the posture's hips (with the run's dip at mid-stance)
  let post = postureY(G, D, v)*mv + -.01*(1 - mv);
  if (G.R > 0){
    let comp = 0;
    for (let i = 0; i < 2; i++){ const f = G.feet[i]; if (!f.down) continue; const p = localPhase(G, i), d = dutyOf(Math.max(v, .3), G.mode); if (p < d) comp = Math.max(comp, Math.sin(Math.PI*p/d)); }
    post -= (.012 + .002*v)*comp*G.R*mv;
  }
  post -= .08*(G.brakeW || 0);
  Q[81] += post;
  const floor = Q[81] - hipBudget(G, v) - .04*(G.brakeW || 0);
  // every foot's target, in body space
  TB.gx = gx; TB.gy = gy; TB.gz = gz; TB.sc = sc; TB.cy = cy; TB.sy = sy;
  fkHips(h, Q, F);
  let drop = 0;
  for (let i = 0; i < 2; i++){
    const f = G.feet[i], t = _tg[i];
    if (f.down){
      // stance: the roll from the heel strike to foot-flat, then the heel rising as the body passes and as the reach asks
      let r;
      if (G.state === "CYCLE"){
        const p = localPhase(G, i), d = dutyOf(Math.max(v, .3), G.mode), u = p < d ? p/d : 1;
        r = (f.rollLand || 0)*(1 - sstep(0, lerp(.1, .06, G.R), f.tDown)) + (G.style === "shuffle" ? .15 : run ? 1.0 : .78)*Math.pow(clamp((u - (run ? .3 : .55))/(run ? .7 : .45), 0, 1), 1.5);
      } else {
        r = f.roll*Math.exp(-8*dt);
        // turning on the ball of the foot: the heel up off the ground while it does
        if (f.ballPivot > 0){ f.ballPivot -= dt; r = Math.max(r, .2); }
      }

      // the hip joint of this leg, and how far the ankle is from it
      const s = f.s, lr = r;
      const fyl = f.yaw - ry, fx = Math.sin(f.yaw), fz = Math.cos(f.yaw);
      const hip = hipJoint(h, F, s);
      // heel rise (behind) or dorsiflexion (ahead) before the hips drop
      let need0, rr = lr;
      if (lite){
        // (the leg pass: the last full solve's correction carried on and one reach test; only a foot that is then out
        // of reach is solved in full below. Standing, stopping or pivoting the roll already carries it)
        rr = lr + (G.state === "CYCLE" ? f.rollAdj || 0 : 0); need0 = needAt(rr, f, fx, fz, hip, t, L, D);
        if (!(need0 > 0)){ f.roll = rr; t.roll = rr; t.yaw = fyl; t.toe = rr > 0 ? -rr : 0; t.hold = 1; continue; }
        rr = lr;
      }
      need0 = needAt(lr, f, fx, fz, hip, t, L, D);
      if (need0 > 0){
        // (ahead or behind along the foot's own length: a foot turned across the body rolls about its own axis)
        const ahead = (t.x - hip[0])*Math.sin(fyl) + (t.z - hip[2])*Math.cos(fyl) > 0;
        // (a foot turning on its ball keeps its heel up: no rocking back onto the heel while it turns)
        const lim = ahead ? (f.ballPivot > 0 ? lr : Math.min(lr, -DORSI)) : Math.max(lr, RISE[run ? 1 : 0]);
        if (needAt(lim, f, fx, fz, hip, t, L, D) < need0){
          let lo = lr, hi = lim;
          for (let k = 0; k < 6; k++){ const m = (lo + hi)/2; if (needAt(m, f, fx, fz, hip, t, L, D) > 0) lo = m; else hi = m; }
          rr = hi;
        } else rr = lr;
        need0 = needAt(rr, f, fx, fz, hip, t, L, D);
      }
      // the foot rolls fast but never in one frame (what the rate leaves unreached, the hips take)
      const rate = run ? 16 : 12;
      rr = clamp(rr, f.roll - rate*dt, f.roll + rate*dt);
      if (rr !== lr) need0 = needAt(rr, f, fx, fz, hip, t, L, D);
      f.roll = rr; f.rollAdj = rr - lr;
      t.roll = rr; t.yaw = fyl; t.toe = rr > 0 ? -rr : 0; t.hold = 1;
      if (need0 > 0) drop = Math.max(drop, need0);
    } else {
      const sa = swingAt(h, f, _sa);
      toBody(sa.x, sa.y, sa.z, t); t.roll = sa.roll; t.yaw = sa.yaw - ry; t.toe = sa.toe; t.hold = 0;
      // the hips settle for the landing foot over the end of its swing (where the foot is now on its way down)
      const u = f.sw.u;
      if (u > .7 && G.R < 1){
        const hip = hipJoint(h, F, f.s), dh = Math.hypot(t.x - hip[0], t.z - hip[2]), nd = hip[1] - (t.y + Math.sqrt(Math.max(0, L*L - dh*dh)));
        if (nd > 0) drop = Math.max(drop, nd*sstep(.7, 1, u)*(1 - G.R));
      }
    }
  }
  // the hips: as low as the reach needs, never below the budget (what is left slips the planted foot and is counted)
  let hy = Q[81] - drop, short = 0;
  if (hy < floor){ short = floor - hy; hy = floor; }
  // falling at once, rising at most 0.6 m/s
  if (G.hipY != null && hy > G.hipY) hy = Math.min(hy, G.hipY + .6*dt/sc);
  G.hipY = hy;
  G.hipDy = hy; G.hipLat = Q[80];
  Q[81] = hy;
  fkHips(h, Q, F);
  const Lf = D.hipY - D.ankY, l0 = lerp(.9, RUN_HOLD_L, G.R)*Lf, lk = lerp(.07, .99 - RUN_HOLD_L, G.R)*Lf, l1 = D.hipY - D.kneeY, l2 = D.kneeY - D.ankY;
  for (let i = 0; i < 2; i++){
    const f = G.feet[i], t = _tg[i];
    // a swinging foot is never reached for with a locked-straight knee: past 90% of the leg (95% running) its path is
    // drawn in towards the hip, easing to at most 97% (98.5%): the knee keeps a little bend and the path catches up as
    // the body comes on. Walking it lets go as the foot comes down (the heel strikes on a straight leg, the plan keeps
    // it within reach); running it holds to the end (the plan lands the foot inside it)
    // (a stopping step comes down where it was put, the way a walking one does)
    // (a running swing re-seated on its last 5% (below) has a footprint the leg reaches as it is: no more holding)
    const cw = f.down || f.sw.seat ? 0 : Math.max(1 - sstep(.75, .93, f.sw.u), f.sw.kind === "phase" ? G.R : 0);
    const hip = hipJoint(h, F, f.s), dx = t.x - hip[0], dy = t.y - hip[1], dz = t.z - hip[2], d = Math.hypot(dx, dy, dz);
    let de = d;
    if (cw > 0 && d > l0) de = lerp(d, l0 + lk*(1 - Math.exp(-(d - l0)/lk)), cw);
    // the knee of a swinging leg bends and straightens at most KNEE_RATE: near straight a few centimetres of reach are a
    // big change of knee angle, so the ankle lags its path a little there rather than the knee snapping (it is in the
    // air; the path's end, the footprint, is where the plan keeps it within reach)
    const kf = kneeFlex(D, Math.min(de, l1 + l2));
    // (not as the foot comes down: from u = 0.9 it goes straight to its footprint)
    if (!lite && !f.down && f.kf != null && dt > 0 && dt < .05 && f.sw.u < .9){
      const k2 = clamp(kf, f.kf - KNEE_RATE*dt, f.kf + KNEE_RATE*dt);
      if (k2 !== kf){ de = Math.sqrt(l1*l1 + l2*l2 + 2*l1*l2*Math.cos(k2)); f.kf = k2; } else f.kf = kf;
    } else f.kf = kf;
    if (de !== d && d > 1e-6){ const k = de/d; t.x = hip[0] + dx*k; t.y = hip[1] + dy*k; t.z = hip[2] + dz*k; }
    // the last 5% of a running swing is the foot coming straight down (3.5.4): if the body has not come on as far as
    // the plan foresaw (braking into a cut or a stop, turning off the line), the held leg leaves the ankle short of the
    // planned spot, and the foot would slide on to it as the body catches up. Where the held leg has it now becomes
    // the footprint instead, once, as the swing reaches its last 5%
    if (!f.down && !f.sw.seat && f.sw.kind === "phase" && f.sw.u >= UH){
      f.sw.seat = true;
      if (de < d - 1e-4) reseat(h, f, t, gx, gz, cy, sy);
    }
    // the foot in body space: its yaw against the body's, then its roll
    qEuler(_tq, 0, 0, t.yaw, 0); qEuler(_fq, 4, t.roll, 0, 0); qMul(_tq, 0, _fq, 4, _fq, 0);
    const miss = solveLeg(h, Q, F, f.s, t.x, t.y, t.z, _fq, 0, t.toe);
    f.miss = miss*sc;
    // (standing, a foot out of reach steps in on the next frame instead: see standStep)
    if (f.down && miss*sc > .003 && short > 0 && G.state !== "STAND"){
      // out of reach: the footprint slips towards the hip (a tuning bug, counted, never hidden)
      const hip = hipJoint(h, F, f.s), dx = t.x - hip[0], dz = t.z - hip[2], dl = Math.hypot(dx, dz) || 1, k = Math.min(miss, dl)*sc;
      const wx = (dx/dl)*cy + (dz/dl)*sy, wz = -(dx/dl)*sy + (dz/dl)*cy;
      f.x -= wx*k; f.z -= wz*k; f.slip += k; G.slips += k;
    }
  }
}
// a swing's landing spot moved to where the ankle is drawn now (t: the ankle in body space): the footprint (heel point)
// is put back from it along the foot as it will land, so the ankle comes down where it is
function reseat(h, f, t, gx, gz, cy, sy){
  const sw = f.sw, sc = h.scale;
  const wx = gx + (t.x*cy + t.z*sy)*sc, wz = gz + (-t.x*sy + t.z*cy)*sc;
  ankleRel(sw.roll1, h.D.ankY, _ar);
  sw.x1 = wx - Math.sin(sw.yaw1)*_ar[0]*sc; sw.z1 = wz - Math.cos(sw.yaw1)*_ar[0]*sc;
}
// the knee's flexion (0 straight) for a hip to ankle distance d
const KNEE_RATE = 18;
function kneeFlex(D, d){ const l1 = D.hipY - D.kneeY, l2 = D.kneeY - D.ankY, c = clamp((l1*l1 + l2*l2 - d*d)/(2*l1*l2), -1, 1); return Math.PI - Math.acos(c); }
// the hip joint of leg s in body space (from F: the hips' position and rotation)
function hipJoint(h, F, s){
  const A = h.restA, th = s > 0 ? 12 : 16;
  const x = A[th*3], y = A[th*3 + 1], z = A[th*3 + 2], qx = F[10], qy = F[11], qz = F[12], qw = F[13];
  const tx = 2*(qy*z - qz*y), ty = 2*(qz*x - qx*z), tz = 2*(qx*y - qy*x);
  _hj[0] = F[7] + x + qw*tx + (qy*tz - qz*ty); _hj[1] = F[8] + y + qw*ty + (qz*tx - qx*tz); _hj[2] = F[9] + z + qw*tz + (qx*ty - qy*tx);
  return _hj;
}

// the world positions of the feet as last placed (tests, footstep sounds): [{side, down, x, y, z}]
export function feetNow(h){
  const G = h.gait; if (!G) return [];
  return G.feet.map((f, i) => ({side:i ? "R" : "L", down:f.down, x:f.x, y:f.y, z:f.z, yaw:f.yaw, slip:f.slip}));
}
export {newFK, LEG};
