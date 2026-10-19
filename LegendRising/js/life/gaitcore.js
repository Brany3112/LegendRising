// js/life/gaitcore.js: the one gait clock. Step length and cadence by speed, walk and run modes, the gait phase
// advanced by distance travelled, footfall events and swing progress. The simulation, the animation (gait.js) and the
// first-person camera bob all read this, so a footfall is the same footfall everywhere.
// Owner: WP-0D (pure foundations), then WP-B. Contract DESIGN 1.4.8; numbers 3.5.2; conflict register 0.2
// ("Gait phase owner": phase advances by distance travelled divided by stride length).
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no randomness.
//
// Phase: phi in [0, 1) over one stride (two steps). The left foot touches down at phi = 0, the right at phi = 0.5.
// dphi = dist/(2*step(v)), so a blocked body does not run on the spot and a backward move runs the gait backwards.

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a)*t;
const sstep = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };

// rows: [v m/s, steps per minute, step length m, duty (share of a stride a foot is on the ground)]
export const WALK = [[0.5, 84, 0.357, 0.64], [0.8, 94, 0.511, 0.63], [1.1, 104, 0.635, 0.62], [1.4, 113, 0.743, 0.61],
                     [1.7, 121, 0.843, 0.60], [2.0, 128, 0.938, 0.585], [2.3, 134, 1.030, 0.57]];   // v, steps/min, step m, duty
export const RUN = [[2.4, 150, 0.960, 0.406], [3.0, 160, 1.125, 0.356], [3.6, 164, 1.317, 0.315], [4.5, 170, 1.588, 0.274],
                    [5.5, 176, 1.875, 0.243], [6.5, 184, 2.120, 0.224], [7.6, 194, 2.351, 0.213], [9.0, 204, 2.647, 0.189]];

/* (FC27) the ball carrier's gait: short, quick, low steps (the FC 27 clip, plan/notes/fc27-spec.md 3.1 and 5.4). At
   4.5 m/s the run takes 1.59 m steps at 170 a minute; a man with the ball at his feet takes 0.75 m at 360, two and a
   half times the cadence, so his strong foot comes down once every 0.33 s and can play the ball on every stride. The
   duty is higher (about 0.44: little time in the air). Rows: [v m/s, steps per minute, step length m, duty]; the
   last row (a sprint with it) is past what the clip shows, carried on at the same cadence's rise */
export const CARRY = [[2.4, 330, .44, .46], [3.6, 340, .64, .45], [4.5, 360, .75, .44], [5.5, 410, .80, .42],
                      [6.5, 450, .87, .40], [7.6, 470, .97, .36]];
/* how much of the carrier's gait a carrier gets: K (0, our run; 1, the clip's) times the body's own carry weight (g.ck,
   0..1, eased in and out by its owner as he takes the ball and lets it go), coming in from a walk between V0 and V1
   (a walk with the ball shortens its steps towards the carrier's first row; below V0 it is the walk) and going out
   again between V2 and V3 (a full sprint with it, which the clip never shows, opens back up towards the run's) */
export const CARRY_K = Object.freeze({K: 1, V0: 1.2, V1: 2.4, V2: 7.6, V3: 9.5});
export function carryW(v, ck){
  const a = Math.abs(v);
  return ck > 0 ? CARRY_K.K*Math.min(1, ck)*sstep(CARRY_K.V0, CARRY_K.V1, a)*(1 - sstep(CARRY_K.V2, CARRY_K.V3, a)) : 0;
}
// walk posture budgets, one per WALK row (3.5.2): how far the hips may drop to reach a step, and the pelvis yaw
export const WALK_HIP_DROP = [0.020, 0.025, 0.032, 0.040, 0.045, 0.050, 0.055];
export const WALK_PELVIS_YAW = [0.05, 0.13];         // rad, from the slowest row to the fastest
// run swing lift from the slowest RUN row to the fastest (3.5.2; contact length 0.78 to 1.00 m follows from the table)
export const RUN_LIFT = [0.14, 0.50];
// the longest walking step a leg reaches without crouching, at body scale 1 (3.5.2: "about 0.92 m"). A faster walk
// keeps this step and raises the cadence instead of dropping the hips.
export const WALK_REACH = 0.92;
// mode switching (3.5.2): W to R when v > RUN_ON for RUN_HOLD seconds, R to W when v < RUN_OFF
export const RUN_ON = 2.30, RUN_OFF = 2.00, RUN_HOLD = 0.15;

// a table column interpolated by speed, clamped to the first and last rows
function col(T, v, c){
  if (v <= T[0][0]) return T[0][c];
  for (let i = 1; i < T.length; i++){
    if (v <= T[i][0]){ const a = T[i - 1], b = T[i]; return lerp(a[c], b[c], (v - a[0])/(b[0] - a[0])); }
  }
  return T[T.length - 1][c];
}
// a per-row array interpolated by speed against a table's speeds
function rowVal(T, arr, v){
  if (v <= T[0][0]) return arr[0];
  for (let i = 1; i < T.length; i++){
    if (v <= T[i][0]) return lerp(arr[i - 1], arr[i], (v - T[i - 1][0])/(T[i][0] - T[i - 1][0]));
  }
  return arr[arr.length - 1];
}

// the gait state a body carries: phase, footfall counter, the last foot down (the left at phi 0 to 0.5), the
// walk/run mode with its timer, and the carry weight (FC27: ck, 0..1, the carrier's gait, CARRY)
export function createGait({phi = 0, mode = 'W', ck = 0} = {}){
  return {phi, n: 0, side: phi < 0.5 ? 'L' : 'R', mode, held: 0, ck};
}

// walk or run for a speed. heldT is how long v has been above RUN_ON (the caller keeps it, or uses gaitModeStep).
export function gaitMode(prevMode, v, heldT){
  if (prevMode === 'R') return v < RUN_OFF ? 'W' : 'R';
  return v > RUN_ON && heldT >= RUN_HOLD - 1e-9 ? 'R' : 'W';
}
// the same rule with the timer kept on g ({mode, held}); returns the mode and stores it on g
export function gaitModeStep(g, v, h){
  g.held = v > RUN_ON ? (g.held || 0) + h : 0;
  g.mode = gaitMode(g.mode || 'W', v, g.held);
  return g.mode;
}

// the walking reach limit for a body scale (3.5.2 reachStep): the longest step without crouching
export function reachStep(v, scale = 1){ return WALK_REACH*scale; }

// step length (metres, one foot to the other) at speed v in a mode, for a body of height scale `scale`.
// Walking: the table value, never beyond the reach limit (reach overrides it; Infinity gives the pure table).
// ck: the carry weight (FC27), the carrier's step blended in by carryW
export function stepLen(v, mode, scale = 1, reach = null, ck = 0){
  let s;
  if (mode === 'R') s = col(RUN, v, 2)*scale;
  else { const r = reach == null ? reachStep(v, scale) : reach; s = Math.min(col(WALK, v, 2)*scale, r); }
  const w = carryW(v, ck);
  return w > 0 ? s + (Math.min(s, col(CARRY, v, 2)*scale) - s)*w : s;
}
// steps per second at speed v (cadence = v/step); the table's own cadence at its rows
export function cadence(v, mode, scale = 1, reach = null, ck = 0){ return v/stepLen(v, mode, scale, reach, ck); }
// duty factor (share of a stride each foot is in stance) at speed v (a carrier's run: CARRY's; his walk keeps the walk's
// double support)
export function dutyOf(v, mode, ck = 0){
  if (mode !== 'R') return col(WALK, v, 3);
  const d = col(RUN, v, 3), w = carryW(v, ck);
  return w > 0 ? d + (col(CARRY, v, 3) - d)*w : d;
}
// seconds for one stride (two steps)
export function strideTime(v, mode, scale = 1, ck = 0){ return 2*stepLen(v, mode, scale, null, ck)/Math.max(v, 0.05); }
// swing duration of one foot (3.5.3): (1 - duty)*strideTime clamped to 0.22..0.45 s; a carrier's quick low steps
// swing in as little as CARRY_SWING (FC27: about 0.17 s at 4.5 m/s, the clip's)
export const CARRY_SWING = 0.13;
export function swingTime(v, mode, scale = 1, ck = 0){
  const lo = 0.22 + (CARRY_SWING - 0.22)*carryW(v, ck);
  return clamp((1 - dutyOf(v, mode, ck))*strideTime(v, mode, scale, ck), lo, 0.45);
}

// the shape numbers of the gait at speed v (3.5.2), for the animation. R is the posture blend 0..1 (h.gait.R); it
// defaults to the mode.
// walk: hipDrop (budget m), pelvisYaw (rad); run: contact (m of ground travel per stance), lift (m), hips (m), and
// lean (rad) for both.
export function gaitShape(v, mode, scale = 1, R = mode === 'R' ? 1 : 0){
  const duty = dutyOf(v, mode), step = stepLen(v, mode, scale);
  const lean = 0.03 + 0.09*R + 0.05*sstep(4.5, 8, v);
  if (mode === 'R'){
    const t = clamp((v - RUN[0][0])/(RUN[RUN.length - 1][0] - RUN[0][0]), 0, 1);
    return {mode, v, step, duty, contact: duty*2*step, lift: lerp(RUN_LIFT[0], RUN_LIFT[1], t)*scale,
      hips: (-0.035 - 0.006*v)*scale, lean, hipDrop: 0, pelvisYaw: 0};
  }
  const t = clamp((v - WALK[0][0])/(WALK[WALK.length - 1][0] - WALK[0][0]), 0, 1);
  return {mode, v, step, duty, contact: duty*2*step, lift: 0, hips: 0, lean,
    hipDrop: rowVal(WALK, WALK_HIP_DROP, v)*scale, pelvisYaw: lerp(WALK_PELVIS_YAW[0], WALK_PELVIS_YAW[1], t)};
}

const NONE = Object.freeze([]);
// The most strides one call may cover. A step of a 60 Hz loop moves a body a fraction of a stride, and even a long
// hitch (half a second at a full sprint) stays under one; four strides in one call is not walking but a jump (a
// teleport or a zone change fed in as a distance, or a bad input), so the phase is left as it was and no footfall is
// reported. That also bounds the work and the events of any call to at most eight.
export const MAX_STRIDES = 4;
// Advance the phase by a signed distance (metres along the direction of travel) at speed v. Returns the touchdowns
// crossed, in order: [{side: 'L' | 'R', at}] where at is the fraction of dist at which that foot landed (0 < at <= 1).
// Forwards a touchdown at a boundary b fires when phi passes from below b to b or beyond; backwards when phi falls
// from above b to b or below, so standing exactly on a boundary never fires it twice in a row in one direction.
// When no foot lands the same frozen empty array is returned every time (no allocation on most steps). A distance,
// speed or scale that is not a finite number, or a move over MAX_STRIDES strides, changes nothing and returns that.
export function phaseAdvance(g, dist, v, mode, scale = 1){
  GQ[0] = dist; GQ[1] = v; GQ[2] = scale;
  return phaseAdvanceQ(g, mode);
}
// The register form for a loop that steps many bodies (the match simulation): GQ[0] = dist, GQ[1] = v, GQ[2] = scale
// in. A call that passes a fractional number boxes it in a fresh heap object, 25 bodies times every step (3.9.6). The
// step length is worked out inline (stepLen's table and reach, the same arithmetic).
export const GQ = new Float64Array(3);
export function phaseAdvanceQ(g, mode){
  const dist = GQ[0], v = GQ[1], scale = GQ[2];
  if (!dist || !Number.isFinite(dist) || !Number.isFinite(v)) return NONE;
  // stepLen(|v|, mode, scale): col(RUN or WALK, |v|, 2)*scale, a walk no longer than the reach (WALK_REACH*scale)
  const T = mode === 'R' ? RUN : WALK, va = Math.abs(v);
  let c;
  if (va <= T[0][0]) c = T[0][2];
  else {
    c = T[T.length - 1][2];
    for (let i = 1; i < T.length; i++){
      if (va <= T[i][0]){ const a = T[i - 1], b = T[i], t = (va - a[0])/(b[0] - a[0]); c = a[2] + (b[2] - a[2])*t; break; }
    }
  }
  let step = mode === 'R' ? c*scale : Math.min(c*scale, WALK_REACH*scale);
  // (FC27: a carrier's step, stepLen's carry blend written out the same way: CARRY's column at |v|, carryW's weight)
  const ck = g.ck;
  if (ck > 0 && va > CARRY_K.V0){
    let cc = CARRY[CARRY.length - 1][2];
    if (va <= CARRY[0][0]) cc = CARRY[0][2];
    else for (let i = 1; i < CARRY.length; i++){
      if (va <= CARRY[i][0]){ const a = CARRY[i - 1], b = CARRY[i], t = (va - a[0])/(b[0] - a[0]); cc = a[2] + (b[2] - a[2])*t; break; }
    }
    const x = va >= CARRY_K.V1 ? 1 : (va - CARRY_K.V0)/(CARRY_K.V1 - CARRY_K.V0), y = va <= CARRY_K.V2 ? 0 : va >= CARRY_K.V3 ? 1 : (va - CARRY_K.V2)/(CARRY_K.V3 - CARRY_K.V2);
    const w = CARRY_K.K*(ck < 1 ? ck : 1)*x*x*(3 - 2*x)*(1 - y*y*(3 - 2*y));
    cc *= scale; if (cc > step) cc = step;
    step += (cc - step)*w;
  }
  const dphi = dist/(2*step), p0 = g.phi;
  if (!(Math.abs(dphi) <= MAX_STRIDES) || !Number.isFinite(p0)) return NONE;
  const p1 = p0 + dphi;
  let out = NONE;
  if (dphi > 0){
    // boundaries k/2 with p0 < k/2 <= p1
    for (let k = Math.floor(p0*2) + 1; k/2 <= p1; k++){
      const b = k/2;
      if (out === NONE) out = [];
      const side = (k & 1) ? 'R' : 'L';
      out.push({side, at: (b - p0)/dphi});
      g.n++; g.side = side;
    }
  } else {
    // boundaries k/2 with p1 <= k/2 < p0
    for (let k = Math.ceil(p0*2) - 1; k/2 >= p1; k--){
      const b = k/2;
      if (out === NONE) out = [];
      const side = (k & 1) ? 'R' : 'L';
      out.push({side, at: (b - p0)/dphi});
      g.n++; g.side = side;
    }
  }
  let p = p1 - Math.floor(p1);
  if (p >= 1) p = 0;                                  // -1e-17 floors to -1 and lands on 1
  g.phi = p;
  return out;
}

// how far through its swing a foot is (0 at lift-off, 1 at touchdown), or null while it is on the ground.
// The left foot is down from phi = 0 to duty, the right from 0.5 to 0.5 + duty (wrapping).
export function swingProgress(g, side, duty){
  let local = side === 'L' ? g.phi : g.phi - 0.5;
  local -= Math.floor(local);
  if (local < duty) return null;
  return duty >= 1 ? null : (local - duty)/(1 - duty);
}
