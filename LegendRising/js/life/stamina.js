// js/life/stamina.js: short-term stamina (breath, B) for any body: sprint drain, recovery, action costs, the factors
// that make a tired player slower, heavier and less precise, and the career energy and fatigue a match costs.
// Owner: WP-0D (pure foundations), then WP-B. Contract DESIGN 1.4.7; numbers 1.5.2; use 3.1.6.
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no randomness. The pool is never saved; the long-term
// numbers (S.energy, S.fatigue, the stamina skill) come in through arguments.
//
//   const st = createStam({stamina: 60, energy: 80, fatigue: 20});
//   each 60 Hz step: stamStep(st, h, effortOf(mover.gait, mover.speed, prm.run), {stamina: 60, eF: effF(80)});
//   const fac = stamFactors(st, effF(80));      // feeds moverStep, the strike deviation, first touch and the body

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

// the most breath you can have today: low energy and high fatigue shrink the pool (energy 40: 86, 20: 64; fatigue 80: 81)
export function stamCap(energy, fatigue){
  const e = energy == null ? 100 : energy, f = fatigue == null ? 0 : fatigue;
  return 100*(0.6 + 0.4*sstep(10, 60, e))*(1 - 0.3*sstep(50, 100, f));
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

// the effort of a body this step (3.1.6): sprint when the gait is sprint and the speed is above the run speed;
// run above 5 m/s; jog above 2.3; walk above 0.3; stand otherwise
export function effortOf(gait, v, runSpeed = STAM.RUN_V){
  if (gait === 'sprint' && v > runSpeed) return 'sprint';
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
  st.sprintFrac += ((sprinting ? 1 : 0) - st.sprintFrac)*(1 - Math.exp(-h/STAM.SPRINT_TAU));
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
export function stamFactors(st, eF = 1){
  const bF = sstep(0, STAM.BF_FULL, st ? st.B : 100), e = clamp(eF == null ? 1 : eF, 0, 1);
  return {
    bF, eF: e,
    speed: 0.45 + 0.55*bF,
    eSpeed: 0.92 + 0.08*e,
    accel: 0.75 + 0.25*bF,
    turn: 0.88 + 0.12*bF,
    aim: 1 + 0.25*(1 - bF) + 0.35*(1 - e),
    power: (0.9 + 0.1*bF)*(0.9 + 0.1*e),
    touch: 0.08*(1 - bF),
    lean: 1 - 0.15*(1 - bF)
  };
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
