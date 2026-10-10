// js/life/stamina.js: short-term stamina (breath, B) for any body: sprint drain, recovery, action costs, the factors
// that make a tired player slower, heavier and less precise, and the career energy and fatigue a match costs.
// Owner: WP-0D (pure foundations), then WP-B, then WP-F2 (addendum A1.6: the late-match cap, the capped sprint).
// Contract DESIGN 1.4.7; numbers 1.5.2; use 3.1.6.
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
  REC: {stand: 10, walk: 8, jog: 4.5, run: 0, sprint: 0},   // recovery per second, before the stamina and energy terms
  DELAY: 0.5,                 // recovery starts this long after the last drain
  ACT: {shot: 3, slide: 6, jump: 3, tackle: 2, pass: 0.5},  // breath points per action
  BF_FULL: 35,                // at or above this much breath nothing is lost
  SPRINT_TAU: 30              // seconds: the time constant of sprintFrac, the recent share of time spent sprinting
};

// ks: how hard a sprint drains you for a stamina skill (24: 1.13, 50: 1.0, 99: 0.755)
export const ksOf = stamina => 1.25 - 0.5*clamp(stamina == null ? 50 : stamina, 0, 100)/100;
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
  return {B: cap, cap, recoverDelay: 0, sprintT: 0, sprintFrac: 0, stamina,
    acc: {t: 0, sprint: 0, drain: 0}};          // running totals (seconds, seconds sprinting, breath drained)
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
  const drain = effort === 'sprint' ? STAM.SPRINT*ks : effort === 'run' ? STAM.RUN*ks : 0;
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
  if (st.B > st.cap) st.B = st.cap;
  const sprinting = effort === 'sprint';
  st.sprintT = sprinting ? st.sprintT + h : 0;
  st.sprintFrac += ((sprinting ? 1 : 0) - st.sprintFrac)*(1 - exp(-h/STAM.SPRINT_TAU));
  if (st.acc){ st.acc.t += h; if (sprinting) st.acc.sprint += h; }
  return st;
}

// the breath an action costs: shot 3, slide 6, jump 3, tackle 2, pass 0.5. Returns the cost. Never refused: a tired
// player still shoots, the factors make it worse.
export function stamAction(st, kind){
  const c = STAM.ACT[kind] || 0;
  if (c > 0){
    const before = st.B;
    st.B = Math.max(0, st.B - c);
    st.recoverDelay = Math.max(st.recoverDelay, STAM.DELAY);
    if (st.acc) st.acc.drain += before - st.B;
  }
  return c;
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
