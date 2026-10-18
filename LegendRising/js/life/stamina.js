// js/life/stamina.js: short-term stamina (breath, B) for any body: sprint drain, recovery, action costs, the factors
// that make a tired player slower, heavier and less precise, and the career energy and fatigue a match costs.
// Owner: WP-0D (pure foundations), then WP-B, then WP-F2 (addendum A1.6: the late-match cap, the capped sprint), then
// P2b-A (TRAINING-SPEC section 3: the shield's breath, stamShield), then P5-B (Training Mode Phase 5, the admin panel's
// stamina controls: TRAINING-SPEC 4 "Stamina: infinite on/off, restore, set value"; stamInfinite, stamRestore,
// stamSetBreath). Contract DESIGN 1.4.7 and BUILD-PLAN Phase 2b and P5-B; numbers 1.5.2; use 3.1.6.
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no randomness. The pool is never saved; the long-term
// numbers (S.energy, S.fatigue, the stamina skill) come in through arguments.
//
//   const st = createStam({stamina: 60, energy: 80, fatigue: 20});
//   each 60 Hz step: stamStep(st, h, effortOf(mover.gait, mover.speed, prm.run), {stamina: 60, eF: effF(80)});
//   const fac = stamFactors(st, effF(80));      // feeds moverStep, the strike deviation, first touch and the body
//
// exp comes from detmath.js, so the pool gives the same bits in Node and in every browser (D6).

import {exp} from "./football/detmath.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };

// 1.5.2 numbers in one place
export const STAM = {
  SPRINT: 9,                  // breath per second sprinting, times ks
  RUN: 1.2,                   // breath per second running over RUN_V without sprinting, times ks
  RUN_V: 5.0, JOG_V: 2.3, WALK_V: 0.3,   // effort thresholds (3.1.6)
  // (U28 part C: about 60% of what it was, which had a player back to a full sprint in 6.5 s standing and 14 s jogging,
  // so in a match everyone finished as fresh as he began: now about 11 s and 25 s at Stamina 50)
  REC: {stand: 6, walk: 5, jog: 2.6, run: 0, sprint: 0},   // recovery per second, before the stamina and energy terms
  DELAY: 0.5,                 // recovery starts this long after the last drain
  ACT: {shot: 3, slide: 6, jump: 3, tackle: 2, pass: 0.5},  // breath points per action
  BF_FULL: 35,                // at or above this much breath nothing is lost
  SPRINT_TAU: 30              // seconds: the time constant of sprintFrac, the recent share of time spent sprinting
};

// ks: how hard a sprint drains you for a stamina skill (30: 1.17, 50: 1.0, 90: 0.66, 99: 0.58). (U28 part C: a full sprint
// from full breath lasts about 7 s at 50 and 11 s at 90 before it fades; it was 0.8 at 90, 9 s, and the skill hardly told)
export const ksOf = stamina => Math.max(.45, 1.43 - 0.0086*clamp(stamina == null ? 50 : stamina, 0, 100));
// eF: the long-term energy factor, 0.6 when empty to 1 from energy 60
export const effF = energy => 0.6 + 0.4*sstep(0, 60, energy == null ? 100 : energy);

// the most breath you can have today: low energy and high fatigue shrink the pool (energy 40: 86, 20: 64; fatigue 80: 81).
// Above energy 40 the cap follows the energy all the way up (addendum A1.6): a match spends energy every minute on the
// pitch (energyPerMatchMinute, scaled by the Stamina stat through staminaF and by how hard you run), so over 90 minutes
// the cap comes down gradually, to about 91 for a player of stamina 50 who started fresh, 89 at stamina 30 and 96 at
// 99. It used to move only under energy 60, which a normal match never reaches, so the late-match cap never showed.
export const CAP = Object.freeze({LATE0: 0.86, LATE_FROM: 40});
export function stamCap(energy, fatigue){
  const e = energy == null ? 100 : energy, f = fatigue == null ? 0 : fatigue;
  const t = clamp((e - CAP.LATE_FROM)/(100 - CAP.LATE_FROM), 0, 1);
  const late = CAP.LATE0 + (1 - CAP.LATE0)*t*Math.sqrt(t);
  return 100*Math.min(0.6 + 0.4*sstep(10, 60, e), late)*(1 - 0.3*sstep(50, 100, f));
}

// a fresh pool, full to its cap. stamina is kept for reference; stamStep takes it from ctx each step.
export function createStam({stamina = 50, energy = 100, fatigue = 0} = {}){
  const cap = stamCap(energy, fatigue);
  return {B: cap, cap, recoverDelay: 0, sprintT: 0, sprintFrac: 0, stamina, inf: false,
    acc: {t: 0, sprint: 0, drain: 0, shield: 0, shieldT: 0}};   // running totals (seconds, seconds sprinting, breath
                                                                 // drained; breath and seconds spent shielding)
}
// a new cap when energy or fatigue changes (a match minute, a meal); the breath never exceeds it
export function stamSetCap(st, energy, fatigue){
  st.cap = stamCap(energy, fatigue);
  if (st.B > st.cap) st.B = st.cap;
  return st.cap;
}

// the effort of a body this step (3.1.6): sprint when the gait is sprint and the speed is above the run speed; run
// above 5 m/s; jog above 2.3; walk above 0.3; stand otherwise. Addendum A1.6: a sprint held under the run speed (above
// a jog) is 'sprint-run' or 'sprint-jog': stamStep counts it as the sprint it is once the breath is low enough to cap
// the speed (under STAM.BF_FULL: a tired body holding Shift keeps draining instead of getting its breath back as if it
// jogged), and as the run or jog its speed says while it is fresh (the run-up of a sprint, as before)
export function effortOf(gait, v, runSpeed = STAM.RUN_V){
  if (gait === 'sprint' && v > runSpeed) return 'sprint';
  if (gait === 'sprint' && v > STAM.JOG_V) return v > STAM.RUN_V ? 'sprint-run' : 'sprint-jog';
  if (v > STAM.RUN_V) return 'run';
  if (v > STAM.JOG_V) return 'jog';
  if (v > STAM.WALK_V) return 'walk';
  return 'stand';
}

// one step of h seconds at an effort. ctx = {stamina, eF}. Draining stops recovery for DELAY seconds; recovery then
// refills at the effort's rate, scaled by the stamina skill and today's energy, up to the cap.
export function stamStep(st, h, effort, ctx = {}){
  if (!(h > 0)) return st;
  const s = ctx.stamina == null ? (st.stamina == null ? 50 : st.stamina) : ctx.stamina, eF = ctx.eF == null ? 1 : ctx.eF;
  const ks = ksOf(s);
  // (a sprint held under the run speed: a sprint once the breath is what caps it, A1.6)
  if (effort === 'sprint-run' || effort === 'sprint-jog') effort = st.B < STAM.BF_FULL ? 'sprint' : effort === 'sprint-run' ? 'run' : 'jog';
  // (infinite stamina, P5-B: the pool is held full, so nothing is drained and there is nothing to wait for)
  const drain = st.inf ? 0 : effort === 'sprint' ? STAM.SPRINT*ks : effort === 'run' ? STAM.RUN*ks : 0;
  if (drain > 0){
    const before = st.B;
    st.B = Math.max(0, st.B - drain*h);
    st.recoverDelay = STAM.DELAY;
    if (st.acc) st.acc.drain += before - st.B;
  } else {
    let rest = h;
    if (st.recoverDelay > 0){ const used = Math.min(st.recoverDelay, h); st.recoverDelay -= used; rest -= used; }
    if (rest > 0){
      const rate = (STAM.REC[effort] || 0)*(0.7 + 0.6*clamp(s, 0, 100)/100)*(0.75 + 0.25*eF);
      st.B = Math.min(st.cap, st.B + rate*rest);
    }
  }
  if (st.B > st.cap || st.inf) st.B = st.cap;
  const sprinting = effort === 'sprint';
  st.sprintT = sprinting ? st.sprintT + h : 0;
  st.sprintFrac += ((sprinting ? 1 : 0) - st.sprintFrac)*(1 - exp(-h/STAM.SPRINT_TAU));
  if (st.acc){ st.acc.t += h; if (sprinting) st.acc.sprint += h; }
  return st;
}

// the breath an action costs: shot 3, slide 6, jump 3, tackle 2, pass 0.5. Returns the cost. Never refused: a tired
// player still shoots, the factors make it worse.
export function stamAction(st, kind){
  const c = st.inf ? 0 : STAM.ACT[kind] || 0;
  if (c > 0){
    const before = st.B;
    st.B = Math.max(0, st.B - c);
    st.recoverDelay = Math.max(st.recoverDelay, STAM.DELAY);
    if (st.acc) st.acc.drain += before - st.B;
  }
  return c;
}

// The shield's breath (spec 3, P2b-A): holding off a defender costs SHIELD.B0 a second, and SHIELD.K more a second for
// every point his challenge rating D is over the shielder's S (nothing extra when he is weaker): shieldRate(D - S). It is
// spent over the step (h seconds) on top of the running effort, and the breath does not recover while he shields.
// gap: D - S (-Infinity or null: no defender near, the base cost only); b0 and k default to SHIELD's (the engine passes
// its tunables, tune.js SH_B0 and SH_BK). Returns the breath spent. Not shielding costs nothing: it is never called.
export const SHIELD = Object.freeze({B0: 0.5, K: 0.06});
export function shieldRate(gap, b0 = SHIELD.B0, k = SHIELD.K){
  const g = gap == null || !Number.isFinite(+gap) ? 0 : Math.max(0, +gap);
  return Math.max(0, b0) + Math.max(0, k)*g;
}
export function stamShield(st, h, gap, b0 = SHIELD.B0, k = SHIELD.K){
  if (!st || !(h > 0) || st.inf) return 0;
  const before = st.B;
  st.B = Math.max(0, st.B - shieldRate(gap, b0, k)*h);
  st.recoverDelay = Math.max(st.recoverDelay, h*1.01);
  const c = before - st.B;
  if (st.acc){ st.acc.drain += c; st.acc.shield = (st.acc.shield || 0) + c; st.acc.shieldT = (st.acc.shieldT || 0) + h; }
  return c;
}

// The admin panel's stamina controls (P5-B; TRAINING-SPEC 4). They change the one pool every body already has, so the
// factors below follow them exactly as they follow a sprint.
//   stamInfinite(st, on)   on: the breath is held at its cap (every drain is skipped and the pool refilled each step);
//                          off: it drains and recovers as usual again, from full
//   stamRestore(st)        the breath back to its cap at once, recovery not held back
//   stamSetBreath(st, b)   the breath set to b (0 to 100, kept under the cap); recovery starts from there as usual
export function stamInfinite(st, on){
  if (!st) return false;
  st.inf = !!on;
  if (st.inf){ st.B = st.cap; st.recoverDelay = 0; }
  return st.inf;
}
export function stamRestore(st){
  if (!st) return 0;
  st.B = st.cap; st.recoverDelay = 0;
  return st.B;
}
export function stamSetBreath(st, b){
  if (!st) return 0;
  const v = Number.isFinite(+b) ? +b : st.B;
  st.B = clamp(v, 0, st.cap); st.recoverDelay = 0;
  return st.B;
}

// How tiredness shows (1.5.2). bF = sstep(0, 35, B) is breath, eF today's energy. Every factor is smooth in both and
// has a floor; nothing ever reaches zero or disables an action.
//   speed   share of the jog-to-sprint margin left: sprint speed = (jog + (sprint - jog)*speed)*eSpeed (moverStep does
//           this); 0.45 at B = 0, 1 from B = 35, so a pace-50 sprint is 71% of fresh at B = 0 and 89% at B = 20
//   eSpeed  0.92 + 0.08 eF on the sprint speed
//   accel   0.75 + 0.25 bF on acceleration
//   turn    0.88 + 0.12 bF on lateral acceleration
//   aim     1 + 0.25(1 - bF) + 0.35(1 - eF) on aim sigma (1.39 at bF 0, eF 0.6)
//   power   (0.9 + 0.1 bF)(0.9 + 0.1 eF) on strike speed
//   touch   +0.08(1 - bF) added to the first-touch absorb
//   lean    1 - 0.15(1 - bF) on body lean and arm swing (the animation)
// out: an object to fill instead of a new one, so a body stepped 60 times a second can keep one (each agent its own)
export function stamFactors(st, eF = 1, out = {}){
  const bF = sstep(0, STAM.BF_FULL, st ? st.B : 100), e = clamp(eF == null ? 1 : eF, 0, 1);
  out.bF = bF; out.eF = e;
  out.speed = 0.45 + 0.55*bF;
  out.eSpeed = 0.92 + 0.08*e;
  out.accel = 0.75 + 0.25*bF;
  out.turn = 0.88 + 0.12*bF;
  out.aim = 1 + 0.25*(1 - bF) + 0.35*(1 - e);
  out.power = (0.9 + 0.1*bF)*(0.9 + 0.1*e);
  out.touch = 0.08*(1 - bF);
  out.lean = 1 - 0.15*(1 - bF);
  return out;
}
// the factors of a fresh, rested body (life NPCs, tests)
export const FRESH = Object.freeze(stamFactors({B: 100}, 1));

// career energy a match minute on the pitch costs (1.5.2): staminaF() from career.js (typical 0.26 to 0.30 a minute)
export function energyPerMatchMinute({staminaF = 1, meanSpeed = 0, sprintFrac = 0} = {}){
  return staminaF*(0.12 + 0.05*meanSpeed + 0.6*sprintFrac);
}
// how hard the match was: the mean energy drain per minute over 0.56, clamped to 0..1
export function matchIntensity(meanDrainPerMin){ return clamp((meanDrainPerMin || 0)/0.56, 0, 1); }
// the fatigue a match leaves (replaces A._matchFatigue): round(8 + 24*(minsOn/90)*(0.7 + 0.6*intensity))
export function matchFatigue(minsOn, intensity){
  return Math.round(8 + 24*(Math.max(0, minsOn || 0)/90)*(0.7 + 0.6*clamp(intensity || 0, 0, 1)));
}
