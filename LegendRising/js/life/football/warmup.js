/* ============ Football: the warm-up on the touchline ============
   Owner: WP-W1 (Stage P2c). Contract: addendum A1.8 (the call, the warm-up minigame, the reward), DESIGN 1.4.16
   (controller.js drives it from the bench), 1.4.18 (the poses are modes registered through human.js registerMode, on
   the shared rig), 1.4.10 (the ball of the juggling and the one-twos is ball.js's), 1.5.10 (the HUD in #fpHud);
   the shared contract of P2c with WP-W2: window.motivation(), window.warmBoost {set, get, clear, extend} and
   trustAdd, reached through the port below (a local stand-in with the same shape until WP-W2's career.js has them, and
   always in the test fixtures, so a test never touches a career).

   The day of a substitute, in order:
     wait     on the bench (sitting or on your feet) until 10 to 15 match minutes before the planned change (the
              minute is drawn per match from the match's own seed; a call that would land in the last minutes of the
              first half moves to the start of the second)
     call     the assistant coach walks over from the dugout, crouches in front of you (or stands by you if you are on
              your feet) and says a line: "Get warm. You're going on in ten." E stands you up. Leave him waiting and he
              gives up on you: you go on cold, with no boost, and the manager notices (a small trust cost)
     rise     the view rises off the seat
     jog      you jog to the warm-up strip, between the touchline and the boards, beyond the dugouts
     drill    the set: 3 exercises when the call came late, up to 5 when there is time, drawn per match from a pool of
              nine and never the same set two matches running; each one 8 to 15 s, played with what you see your own
              body do (the legs, the arms, the ground, the ball), its quality following your input; Tab held finishes
              the rest at an average result
     done     the rating (Sharp, Ready, Cold) and the boost; you stay loose on the strip until the coach calls you over,
              then the match's own call ("Get ready, you're going on") takes you to the fourth official
   The match keeps running all along (the live clock stays on the scorebug). When you come on, the boost goes on your
   agent's numbers for the first 10 to 15 minutes; a goal or an assist while it lasts adds 10 more ("On fire").

   Every exercise is a record in POOL: what it is called, what the fitness coach says, the keys, how long, the view it
   is framed for, and its own begin / step / input / pose. Its reps are graded (Perfect, Good, OK, Miss) and its score is
   the mean of its reps over at least the reps it should have had, so doing nothing scores nothing. */
import {THREE} from "../build.js";
import {P} from "../core/state.js";
import {SCHED} from "../core/sched.js";
import {human, animateHuman, lookFor, registerMode, EV} from "../human.js";
import {clamp, lerp, sstep, B, ARM, LEG, R3, legIK, armIK, frameOf, fkQ, newFK, PALM} from "../rig.js";
import {mulberry32, hashStr} from "./rng.js";
import {createBall, createBallWorld, ballKick, ballHold, ballStep, rollSpeedFor} from "./ball.js";
import {ballMesh} from "./pitchmesh.js";
import {dirOf, wrapA} from "./pitchspec.js";
import {levelled} from "./attrs.js";
import {AUD} from "./audio.js";
import {STADIUM} from "./stadium.js";

const TAU = Math.PI*2;

/* ---------- the numbers ---------- */
export const WU = Object.freeze({
  CALL_LO: 15, CALL_HI: 10,           // the call: this many match minutes before the planned change (A1.8)
  HT_GUARD: 46,                        // a call that would land in the first half's last minutes waits for the second
  WAIT_E: 22,                          // real seconds the coach waits for you to stand before he gives up on you
  TRUST_IGNORE: -1,                    // what ignoring him costs (trustAdd)
  RISE: .7, INTRO: 2.2, OUTRO: 1.3,    // real seconds: off the seat; the coach's line before a set; the result after it
  N_MIN: 3, N_MAX: 5, PER_EX: 16, SLACK: 26,   // exercises: (real seconds left - SLACK)/PER_EX, within 3 to 5
  TAB_HOLD: .9,                        // Tab held this long finishes the warm-up at an average result
  AVERAGE: .55,                        // that result
  SHARP: .72, READY: .42,              // the rating's thresholds on the warm-up's score (0..1)
  EXTEND: 10,                          // a goal or an assist while the boost lasts adds this many minutes
  // the warm-up strip, between the touchline and the boards on your dugout's side (x mirrored for the away bench), clear
  // of the spare balls' cones at 15 and 30 m; a standing exercise is done on a spot between SPOT0 and SPOT1
  STRIP: Object.freeze({z: -35.85, x0: 17.5, x1: 28.5, boardZ: -37.28, SPOT0: 19.5, SPOT1: 26.5}),
  JUG_D: .48,                          // the juggled ball this far in front of you (over the touching foot)
  JOG: 3.1, WALK: 1.5
});
const GRADE = Object.freeze({perfect: 1, good: .72, ok: .38, miss: 0});
const POP_TEXT = {perfect: "Perfect", good: "Good", ok: "OK", miss: "Miss"};

/* ---------- pure helpers (exported for the tests and for the career side) ---------- */
// the call's match minute for a planned change at subOn, drawn from r; null when there is no planned change
export function callMinute(subOn, r){
  if (!(subOn > 0)) return null;
  let lo = subOn - WU.CALL_LO, hi = subOn - WU.CALL_HI;
  if (lo < WU.HT_GUARD && hi >= WU.HT_GUARD) lo = WU.HT_GUARD;
  return Math.max(1, Math.round(lo + (hi - lo)*r()));
}
// how many exercises fit in the real seconds left before the change (3 when the call came late, up to 5)
export function exerciseCount(realLeft){
  return clamp(Math.floor((realLeft - WU.SLACK)/WU.PER_EX), WU.N_MIN, WU.N_MAX);
}
// a set of n exercise ids, drawn from r: never the same set as last (the set the last match had); the ones the last
// set had are drawn less often, so the warm-ups go round the pool. Ordered as a warm-up goes: moving first, then
// mobility, then quick feet, the ball last
export function pickSet(r, n, last = null){
  const ids = POOL_IDS.slice(), lastSet = new Set(last || []);
  const same = s => last && s.length === last.length && s.every(id => lastSet.has(id));
  let out = null;
  for (let tries = 0; tries < 12 && (!out || same(out)); tries++){
    const w = ids.map(id => ({id, k: r()*(lastSet.has(id) ? .45 : 1)}));
    w.sort((a, b) => b.k - a.k);
    out = w.slice(0, clamp(n | 0, 1, ids.length)).map(o => o.id);
  }
  if (same(out)){
    // (every draw came out the same, a pool of n: swap one for one the last set did not have)
    const spare = ids.find(id => !lastSet.has(id));
    if (spare) out[out.length - 1] = spare;
  }
  return out.sort((a, b) => POOL[a].order - POOL[b].order || POOL_IDS.indexOf(a) - POOL_IDS.indexOf(b));
}
// a rep's grade from its error against windows [perfect, good, ok] (the same units as err)
export function grade(err, win){
  const e = Math.abs(err);
  return e <= win[0] ? "perfect" : e <= win[1] ? "good" : e <= win[2] ? "ok" : "miss";
}
// the rating of a warm-up score (0..1)
export const ratingOf = q => q >= WU.SHARP ? "sharp" : q >= WU.READY ? "ready" : "cold";
export const RATING_NAME = Object.freeze({sharp: "Sharp", ready: "Ready", cold: "Cold"});
// the coach's style picks the focus (A1.8): two candidates each, one drawn
export const FOCUS = Object.freeze({
  attacking: [{name: "Finishing", keys: ["accuracy", "power"]}, {name: "Dribbling", keys: ["dribbling"]}],
  pressing: [{name: "Stamina", keys: ["stamina"]}, {name: "Acceleration", keys: ["acceleration"]}],
  technical: [{name: "Passing", keys: ["passing", "passacc"]}, {name: "Ball Control", keys: ["ctrl"]}]
});
/* the boost of a warm-up scored q (0..1) with motivation mot (0..100) under a coach of style: {rating, all (+1..+4),
   focus {skill: +n}, focusName, mins (10..15 on the pitch), q}. Motivation scales the size (0.7x at 0 to 1.3x at 100) */
export function boostFor(q, mot, style, r){
  q = clamp(+q || 0, 0, 1);
  const mf = .7 + .6*clamp(mot == null ? 60 : +mot, 0, 100)/100;
  const all = clamp(Math.round(1 + 3.3*q*q*mf), 1, 4);
  const f = (FOCUS[style] || FOCUS.attacking)[r() < .5 ? 0 : 1];
  const fn = clamp(Math.round(1 + 4*q*mf), 1, 5);
  const focus = {}; for (const k of f.keys) focus[k] = fn;
  return {rating: ratingOf(q), all, focus, focusName: f.name, mins: Math.round(10 + 5*q), q};
}
// an agent's attributes with a boost on: every skill up by all, the focus skills by their own amount, the derived
// numbers worked out again (attrs.js levelled); Ball Control (ctrl, a derived number) on top. A new object
export function boostedAttrs(at, b){
  if (!at || !b) return at;
  const base = Object.assign({}, at), f = b.focus || {};
  for (const k in f) if (k !== "ctrl" && base[k] != null) base[k] = base[k] + f[k];
  const a = levelled(base, b.all || 1e-9);
  if (f.ctrl) a.ctrl = clamp(a.ctrl + f.ctrl, 1, 99);
  return a;
}
const NUM = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
export const numWord = n => NUM[n] || String(n);

/* ---------- what the coaches say ---------- */
const LINES = {
  call: [n => `Get warm. You're going on in ${numWord(n)}.`, n => `Up you get. Gaffer wants you on in about ${numWord(n)} minutes, so get loose.`,
    n => `Right, you're on in ${numWord(n)}. Go and get warm.`],
  late: [n => `No time to hang about. Get warm, you're on in ${numWord(n)}.`, () => "Quick, get warm. You're going on any minute."],
  standing: [n => `There you are. Get warm properly, you're on in ${numWord(n)}.`],
  ignored: ["Suit yourself. Don't come crying to me when your legs are cold.", "Fine. You'll go on cold then."],
  back: ["That's enough. You're on, get over to the fourth official.", "Right, you're going on. Off you go, and good luck."],
  done: {sharp: ["Sharp. You're flying today.", "Lovely stuff. You're ready to go."], ready: ["Good enough. Now go and show it out there.", "Decent. Keep moving till they call you."],
    cold: ["Still a bit stiff. Keep moving, shake it off.", "Not quite there. Keep the legs going."]},
  great: ["The fans behind the dugout give you a clap.", "A few fans by the boards clap that one."],
  mates: ["That's it, looking sharp!", "Come on, big man!", "Get loose, we need you!", "Go on, son!", "Looking lively!"]
};

/* ---------- the pool ----------
   Each record: name, say (the fitness coach), how (the instruction line), keys (the hints), order (where in a set it
   goes), dur [lo, hi] seconds, view {pitch} (the look the set is framed for), face 'strip' | 'pitch' | 'boards' |
   'coach', minReps (the reps it should have had at least, from its duration), and begin(X, r), step(X, dt), input(X,
   ev) -> boolean, pose(X) -> the body's state, demo(X, t) -> the coach's state (null: he watches), hud(X) -> what the
   HUD draws. X is the running exercise: {id, t, dur, reps: [], streak, best, var: {...}} */
const POOL = {};
const POOL_IDS = ["strides", "lunges", "swings", "hips", "quad", "knees", "shuffle", "juggle", "onetwo"];

// strides along the strip: tap Shift as each foot lands (the footfalls of your own body's gait), the run picks up
// with the streak and stumbles on a miss
POOL.strides = {name: "Touchline strides", order: 0, dur: [10, 12], face: "strip", view: {pitch: -.5}, minK: 1,
  say: ["Few strides down the line, nice and easy.", "Stretch the legs out along the line for me."],
  how: "Tap Shift each time a foot lands.", keys: [{key: "Shift", verb: "as a foot lands"}],
  begin(X, r){ X.var.v0 = 3.0 + .5*r(); X.dir = X.side; X.falls = []; X.claim = null; X.period = .36; X.speed = X.var.v0; X.flash = 0; },
  step(X, dt){
    // a footfall nobody tapped for, once it is past the window: a miss (only once you have started)
    const now = X.t;
    for (const f of X.falls) if (!f.done && now - f.t > WIN.strides[2]){ f.done = true; if (X.started) rep(X, "miss", "Late"); }
    X.speed += ((X.var.v0 + .16*Math.min(X.streak, 8)) - X.speed)*(1 - Math.exp(-2*dt));
    X.flash = Math.max(0, X.flash - dt*4);
  },
  // a footfall of your body at time t (warm-up seconds)
  foot(X, t){
    const L = X.falls; const last = L.length ? L[L.length - 1] : null;
    if (last && t - last.t > .18 && t - last.t < .8) X.period += ((t - last.t) - X.period)*.35;
    L.push({t, done: false}); if (L.length > 12) L.shift();
    X.flash = 1;
    // a tap already waiting for this footfall
    if (X.claim && Math.abs(X.claim.t - t) <= WIN.strides[2]){ const c = X.claim; X.claim = null; L[L.length - 1].done = true; rep(X, grade(t - c.t, WIN.strides), timingWord(c.t - t)); }
  },
  input(X, ev){
    if (ev.type !== "keydown" || ev.key !== "shift" || ev.repeat) return false;
    X.started = true;
    const t = X.t, L = X.falls, last = [...L].reverse().find(f => !f.done);
    const lastT = last ? last.t : -9, next = (L.length ? L[L.length - 1].t : t) + X.period;
    if (last && Math.abs(t - lastT) <= Math.abs(next - t) && t - lastT <= WIN.strides[2]){ last.done = true; rep(X, grade(t - lastT, WIN.strides), timingWord(lastT - t)); }
    else if (next - t <= WIN.strides[2] && !X.claim) X.claim = {t};
    else rep(X, "miss", "Off the beat");
    return true;
  },
  hud(X){ const L = X.falls, lt = L.length ? L[L.length - 1].t : X.t; return {kind: "beat", lead: X.t - lt, period: X.period, flash: X.flash, next: (lt + X.period - X.t)/X.period}; }
};
// forward lunges: drag the mouse down to sink to the ghost depth line, up to rise; alternate legs
POOL.lunges = {name: "Forward lunges", order: 1, dur: [11, 13], face: "strip", view: {pitch: -.88}, minK: .32,
  say: ["Lunges. Nice and controlled, down to the line.", "Let's open the hips up. Lunges, down to the line and back up."],
  how: "Drag the mouse down to sink to the line, then back up.", keys: [{key: "Mouse", verb: "down to sink, up to rise"}],
  begin(X, r){ X.d = 0; X.lead = r() < .5 ? 1 : -1; X.down = false; X.bot = 0; X.repT = 0; X.var.tg = []; for (let i = 0; i < 9; i++) X.var.tg.push(.62 + .26*r()); X.target = X.var.tg[0]; X.k = 0; },
  step(X, dt){ X.repT += dt; },
  input(X, ev){
    if (ev.type !== "move") return false;
    const d0 = X.d;
    X.d = clamp(X.d + (ev.dy || 0)/320, 0, 1.25);
    if (!X.down && X.d > .22 && d0 <= .22){ X.down = true; X.bot = X.d; X.repT = 0; }
    if (X.down){
      X.bot = Math.max(X.bot, X.d);
      if (X.d < .1){
        X.down = false;
        const err = X.bot - X.target;
        let g = grade(err, WIN.lunges), word = err > WIN.lunges[1] ? "Too deep" : err < -WIN.lunges[1] ? "Go lower" : null;
        if (X.repT < .45 && g !== "miss"){ g = "ok"; word = "Slow it down"; }
        rep(X, g, word);
        X.lead = -X.lead; X.k++; X.target = X.var.tg[X.k % X.var.tg.length];
      }
    }
    return true;
  },
  hud(X){ return {kind: "gauge", v: X.d/1.25, target: X.target/1.25, band: WIN.lunges[1]/1.25}; }
};
// leg swings at the boards: one hand on the boards, swing a leg with the mouse in time with the pendulum
POOL.swings = {name: "Leg swings at the boards", order: 1, dur: [10, 12], face: "boards", view: {pitch: -.82}, minK: 1,
  say: ["Hand on the boards. Leg swings, in time with me.", "Grab the boards and swing that leg, nice rhythm."],
  how: "Move the mouse up and down to swing your leg with the pendulum.", keys: [{key: "Mouse", verb: "swing with the pendulum"}],
  begin(X, r){ X.var.T = 1.15 + .35*r(); X.a = 0; X.s = r() < .5 ? 1 : -1; X.lat = false; X.ph = 0; X.next = .25; X.swapped = false; },
  step(X, dt){
    X.ph += dt/X.var.T;
    X.guide = Math.sin(X.ph*TAU);
    // each turn of the pendulum: where your leg is against it
    if (X.ph >= X.next){ X.next += .5; const want = Math.sin((X.next - .5)*TAU); rep(X, grade(X.a - want, WIN.swings), null); }
    // half way: the other leg, swinging across the body (the mouse left and right)
    if (!X.swapped && X.t > X.dur/2){ X.swapped = true; X.s = -X.s; X.lat = true; pop(X, "Other leg, across the body", "info"); }
  },
  input(X, ev){
    if (ev.type !== "move") return false;
    X.a = clamp(X.a - (X.lat ? -(ev.dx || 0) : (ev.dy || 0))/150, -1.15, 1.15);
    return true;
  },
  hud(X){ return {kind: "pend", guide: X.guide || 0, v: X.a, lat: X.lat}; }
};
// hip openers: trace a smooth circle with the mouse; the knee draws it
POOL.hips = {name: "Hip openers", order: 1, dur: [10, 12], face: "strip", view: {pitch: -.98}, minK: .55,
  say: ["Open the gate. Big smooth circles with the knee.", "Hip circles now. Slow and round, no wobbles."],
  how: "Trace a smooth circle with the mouse, round the ring.", keys: [{key: "Mouse", verb: "trace a circle"}],
  begin(X, r){ X.var.R = 105 + 30*r(); X.cx = X.var.R; X.cy = 0; X.th = 0; X.acc = 0; X.dev = 0; X.n = 0; X.back = 0; X.repT = 0; X.s = r() < .5 ? 1 : -1; X.trail = []; X.dirSign = 0; },
  step(X, dt){ X.repT += dt; },
  input(X, ev){
    if (ev.type !== "move") return false;
    const R = X.var.R;
    X.cx += ev.dx || 0; X.cy += ev.dy || 0;
    const r0 = Math.hypot(X.cx, X.cy); if (r0 > 1.6*R){ X.cx *= 1.6*R/r0; X.cy *= 1.6*R/r0; }
    const th = Math.atan2(X.cy, X.cx), d = wrapA(th - X.th); X.th = th;
    if (Math.abs(d) < 1.2){
      if (!X.dirSign && Math.abs(d) > .02) X.dirSign = Math.sign(d);
      if (X.dirSign && Math.sign(d) === X.dirSign) X.acc += Math.abs(d); else if (X.dirSign) X.back += Math.abs(d);
      X.dev += Math.abs(Math.hypot(X.cx, X.cy) - R)/R*Math.abs(d); X.n += Math.abs(d);
    }
    X.trail.push([X.cx/R, X.cy/R]); if (X.trail.length > 28) X.trail.shift();
    if (X.acc >= TAU){
      const e = X.dev/Math.max(1e-3, X.n) + .5*X.back/TAU;
      let g = grade(e, WIN.hips), word = null;
      if (X.repT < .55 && g !== "miss"){ g = "ok"; word = "Smoother, slower"; }
      rep(X, g, word);
      X.acc -= TAU; X.dev = X.n = X.back = 0; X.repT = 0;
      if (X.reps.length === 3) { X.s = -X.s; pop(X, "Other leg", "info"); }
    }
    return true;
  },
  hud(X){ return {kind: "circle", x: X.cx/X.var.R, y: X.cy/X.var.R, trail: X.trail}; }
};
// quad stretch balance: on one leg, the other foot in your hand; keep the wobbling dot in the middle with the mouse
POOL.quad = {name: "Quad stretch balance", order: 1, dur: [9, 11], face: "strip", view: {pitch: -1.02}, minK: 1,
  say: ["Quad stretch. Stay tall and keep your balance.", "Grab your foot, stand tall, don't wobble."],
  how: "Keep the wobbling dot in the middle with the mouse.", keys: [{key: "Mouse", verb: "keep the dot centred"}],
  begin(X, r){ X.r = r; X.wx = 0; X.wy = 0; X.vx = 0; X.vy = 0; X.ux = 0; X.uy = 0; X.in = 0; X.good = 0; X.sec = 0; X.s = r() < .5 ? 1 : -1; X.swapped = false; X.var.force = 1.6 + .8*r(); },
  step(X, dt){
    // the wobble: a springy drift that keeps changing its mind (pushes drawn from the match's own numbers)
    const F = X.var.force;
    X.vx += ((X.r() - .5)*F*2.6 - X.wx*1.2 - X.vx*.9)*dt*3; X.vy += ((X.r() - .5)*F*2.6 - X.wy*1.2 - X.vy*.9)*dt*3;
    X.wx += X.vx*dt; X.wy += X.vy*dt;
    X.ux *= Math.exp(-.35*dt); X.uy *= Math.exp(-.35*dt);
    const dx = X.wx + X.ux, dy = X.wy + X.uy, d = Math.hypot(dx, dy);
    if (d > 1.4){ X.ux -= dx*(1 - 1.4/d); X.uy -= dy*(1 - 1.4/d); }
    X.dot = {x: clamp(dx, -1.4, 1.4), y: clamp(dy, -1.4, 1.4)};
    const dd = Math.hypot(X.dot.x, X.dot.y);
    if (dd < .3) X.in += dt; if (dd < .6) X.good += dt;
    X.sec += dt;
    if (X.sec >= 1){ const k = X.in/X.sec, k2 = X.good/X.sec; rep(X, k >= .8 ? "perfect" : k2 >= .75 ? "good" : k2 >= .4 ? "ok" : "miss", null); X.sec = 0; X.in = X.good = 0; }
    if (!X.swapped && X.t > X.dur/2){ X.swapped = true; X.s = -X.s; pop(X, "Other leg", "info"); }
  },
  input(X, ev){ if (ev.type !== "move") return false; X.ux += (ev.dx || 0)/110; X.uy += (ev.dy || 0)/110; return true; },
  hud(X){ const d = X.dot || {x: 0, y: 0}; return {kind: "balance", x: d.x, y: d.y}; }
};
// high knees, then butt kicks: A for the left leg, D for the right, on a beat that keeps getting quicker
POOL.knees = {name: "High knees and butt kicks", order: 2, dur: [10, 12], face: "strip", view: {pitch: -1.05}, minK: 1,
  say: ["Quick feet. High knees, then heels to the backside, on the beat.", "On the beat now. Knees up, then kick the heels."],
  how: "A for the left leg, D for the right, as each beat hits the line.", keys: [{key: "A", verb: "left"}, {key: "D", verb: "right"}],
  begin(X, r){ X.var.p0 = .5 + .06*r(); X.var.p1 = .3 + .04*r(); X.beats = []; X.bt = .9; X.side = r() < .5 ? 1 : -1; X.kL = 0; X.kR = 0; X.kick = false; X.n = 0; },
  step(X, dt){
    const u = clamp(X.t/X.dur, 0, 1), p = lerp(X.var.p0, X.var.p1, u);
    while (X.bt < X.t + 2.2){ X.beats.push({t: X.bt, s: X.side, done: false, kick: X.bt > X.dur/2}); X.side = -X.side; X.bt += p; }
    for (const b of X.beats) if (!b.done && X.t - b.t > WIN.knees[2]){ b.done = true; if (b.t > .5) rep(X, "miss", "Missed the beat"); }
    while (X.beats.length && X.beats[0].done && X.t - X.beats[0].t > 1) X.beats.shift();
    X.kick = X.t > X.dur/2;
    X.kL = Math.max(0, X.kL - dt*3.2); X.kR = Math.max(0, X.kR - dt*3.2);
  },
  input(X, ev){
    if (ev.type !== "keydown" || ev.repeat || (ev.key !== "a" && ev.key !== "d")) return false;
    const s = ev.key === "a" ? 1 : -1;
    let best = null;
    for (const b of X.beats) if (!b.done && Math.abs(b.t - X.t) <= WIN.knees[2] && (!best || Math.abs(b.t - X.t) < Math.abs(best.t - X.t))) best = b;
    if (!best){ rep(X, "miss", "Off the beat"); if (s > 0) X.kL = .45; else X.kR = .45; return true; }
    best.done = true;
    if (best.s !== s){ rep(X, "miss", "Wrong leg"); if (s > 0) X.kL = .45; else X.kR = .45; return true; }
    const g = grade(X.t - best.t, WIN.knees);
    rep(X, g, timingWord(best.t - X.t));
    const lift = g === "perfect" ? 1 : g === "good" ? .85 : .55;
    if (s > 0) X.kL = lift; else X.kR = lift;
    return true;
  },
  hud(X){ return {kind: "strip", t: X.t, beats: X.beats, kick: X.kick}; }
};
// side shuffles: along the strip facing the pitch; on the coach's "Go!" burst away (W) as quickly as you can
POOL.shuffle = {name: "Side shuffles", order: 0, dur: [11, 13], face: "pitch", view: {pitch: -.9}, minK: .3,
  say: ["Shuffle along the line. When I shout go, you go!", "Side shuffles. Stay on your toes and react to my call."],
  how: "Press W the moment the coach shouts Go.", keys: [{key: "W", verb: "burst on Go"}],
  begin(X, r){ X.r = r; X.dir = X.side; X.goAt = 1.6 + 1.2*r(); X.go = null; X.burst = 0; X.rt = null; X.goShow = 0; },
  step(X, dt){
    if (!X.go && X.t >= X.goAt && !(X.burst > 0)){ X.go = {t: X.t}; X.goShow = 1; X.call = "Go!"; }
    if (X.go && X.t - X.go.t > 1.0){ rep(X, "miss", "Too slow"); X.go = null; X.goAt = X.t + 1.6 + 1.4*X.r(); }
    if (X.burst > 0){ X.burst -= dt; if (X.burst <= 0){ X.burst = 0; X.goAt = X.t + 1.3 + 1.3*X.r(); } }
    X.goShow = Math.max(0, X.goShow - dt*1.2);
  },
  input(X, ev){
    if (ev.type !== "keydown" || ev.repeat || (ev.key !== "w" && ev.key !== "shift")) return false;
    if (X.burst > 0) return true;
    if (!X.go){ rep(X, "miss", "Too early"); X.goAt = Math.max(X.goAt, X.t + 1.2); return true; }
    const rt = X.t - X.go.t; X.rt = rt; X.go = null; X.goShow = 0;
    rep(X, grade(rt, WIN.shuffle), rt.toFixed(2) + " s");
    X.burst = 1.05;
    return true;
  },
  hud(X){ return {kind: "go", show: X.goShow, rt: X.rt, burst: X.burst > 0}; }
};
// ball juggling: click as the ball drops into the ring; a clean touch sends it straight back up
POOL.juggle = {name: "Ball juggling", order: 3, dur: [11, 13], face: "strip", view: {pitch: -.95}, minK: .62,
  say: ["Keep it up for me. Touch it as it drops into the ring.", "Couple of touches on the ball. Nice and soft."],
  how: "Click as the ball drops into the ring.", keys: [{key: "LMB", verb: "touch as it drops into the ring"}],
  begin(X, r){ X.var.ring = .42 + .14*r(); X.var.hi = .3 + .14*r(); X.ring = X.var.ring; X.k = 0; X.side = 1; X.drop = 0; X.flick = .5; X.touches = 0; X.drift = 0; },
  step(X, dt){ X.k = Math.max(0, X.k - dt*3.4); if (X.t > X.dur*.55) X.ring = X.var.ring + .22*sstep(.55, .7, X.t/X.dur); },
  input(X, ev){
    if (ev.type !== "down" || ev.button !== 0) return false;
    const S0 = SESS.ball; if (!S0 || X.drop > 0 || X.flick > 0) return true;
    const y = S0.b.p.y, vy = S0.b.v.y, e = y - X.ring;
    // still on its way up, or well above the ring: nothing to touch yet
    if (vy > .4 || e > WIN.juggle[2]){ rep(X, "miss", vy > .4 ? "Wait for it to drop" : "Early"); return true; }
    const g = grade(e, WIN.juggle);
    rep(X, g, g === "perfect" ? null : e > 0 ? "Early" : "Late");
    juggleTouch(X, g);
    return true;
  },
  hud(X){ return {kind: "juggle", touches: X.touches}; }
};
// quick one-twos with the fitness coach: he plays it in, you take it, he steps across and opens up; click to pass it
// back the moment he does
POOL.onetwo = {name: "Quick one-twos", order: 3, dur: [12, 14], face: "coach", view: {pitch: -.72}, minK: .25,
  say: ["One-twos with me. Play it back the second I open up.", "Give and go. Wait till I open my body, then hit me."],
  how: "Click to pass back the moment he opens up.", keys: [{key: "LMB", verb: "pass as he opens up"}],
  begin(X, r){ X.r = r; X.stage = "feed"; X.st = 0; X.open = null; X.shift = 0; X.passes = 0; },
  step(X, dt){ oneTwoStep(X, dt); },
  input(X, ev){
    if (ev.type !== "down" || ev.button !== 0) return false;
    if (X.stage !== "have" && X.stage !== "open") return true;
    if (X.pending) return true;
    if (X.stage === "have"){ rep(X, "miss", "Wait for him to open up"); oneTwoPass(X, "miss"); return true; }
    const g = grade(Math.max(0, X.t - X.open - .05), WIN.onetwo);
    rep(X, g, g === "perfect" ? null : X.t - X.open > WIN.onetwo[1] ? "Late" : null);
    oneTwoPass(X, g);
    return true;
  },
  hud(X){ return {kind: "pass", open: X.stage === "open" ? clamp((X.t - X.open)/WIN.onetwo[2], 0, 1) : -1, at: SESS.fit ? SESS.fit.pos : null}; }
};
for (const id of POOL_IDS) POOL[id].id = id;
// the timing windows: strides, knees (seconds either side); lunges (depth); swings (leg against pendulum, -1..1);
// hips (mean radius error, share); juggle (metres from the ring); shuffle (reaction seconds); onetwo (seconds late)
const WIN0 = {strides: [.055, .11, .17], knees: [.05, .095, .15], lunges: [.06, .12, .22], swings: [.2, .38, .62],
  hips: [.14, .26, .42], juggle: [.06, .12, .2], shuffle: [.3, .45, .7], onetwo: [.12, .26, .45]};
const WIN = {};
// motivation widens the windows a little (A1.8): 0.92x at 0 to 1.08x at 100
function setWindows(mot){ const k = .92 + .16*clamp(mot, 0, 100)/100; for (const id in WIN0) WIN[id] = WIN0[id].map(v => v*k); }
setWindows(60);
const timingWord = d => Math.abs(d) < .03 ? null : d > 0 ? "Early" : "Late";

/* ---------- the port to the career (the WP-W2 contract), and the stand-in ---------- */
// The stand-in has the contract's shape: motivation() 60, warmBoost {set(o), get(), clear(), extend(min)}, trust(d) and
// motivationAdd(d, why) recorded. Used until the career's own exist, and always in the test fixtures
export function localPort(){
  const L = {boost: null, log: [], mot: 60,
    motivation: () => L.mot,
    motivationAdd(d, why){ L.log.push(["motivation", d, why]); L.mot = clamp(L.mot + (+d || 0), 0, 100); },
    trust(d){ L.log.push(["trust", d]); },
    style: () => null,
    warmBoost: {
      set(o){ L.boost = Object.assign({rating: "ready", all: 0, focus: {}, untilMin: 0, onFire: false}, o || {}); L.log.push(["set", Object.assign({}, L.boost)]); return L.boost; },
      get(){ return L.boost; },
      clear(){ L.boost = null; L.log.push(["clear"]); },
      extend(min){ if (L.boost){ L.boost.untilMin += +min || 0; L.boost.onFire = true; L.log.push(["extend", min]); } return L.boost; }
    }};
  return L;
}
// the career's own when it has them (window.motivation, window.warmBoost, trustAdd), else the stand-in
export function careerPort(){
  const w = typeof window !== "undefined" ? window : {};
  const loc = localPort();
  const wb = w.warmBoost && typeof w.warmBoost.set === "function" ? w.warmBoost : null;
  return {
    real: !!wb, local: loc,
    motivation: () => { try { const m = typeof w.motivation === "function" ? +w.motivation() : NaN; return Number.isFinite(m) ? m : loc.motivation(); } catch(e){ return loc.motivation(); } },
    motivationAdd: (d, why) => { try { if (typeof w.motivationAdd === "function") return w.motivationAdd(d, why); } catch(e){ console.error(e); } return loc.motivationAdd(d, why); },
    trust: d => { try { if (typeof w.trustAdd === "function") return w.trustAdd(d); } catch(e){ console.error(e); } return loc.trust(d); },
    style: () => { try { return typeof w.coachStyle === "function" ? w.coachStyle() : null; } catch(e){ return null; } },
    warmBoost: wb || loc.warmBoost
  };
}

/* ---------- the session ---------- */
// ctx (controller.js): {ms, cfg, V, team, real, kit, port, style, seed, last, now() -> real seconds, minute() ->
// match minute, rate() -> match seconds per real second, subOn, seated() -> bool, stand(), note(t), say(who, t),
// pop(text, kind), mates() -> [{name, x, z, seed}], cheer(v)}
const SESS = {on: false, ctx: null, phase: "idle", t: 0, plan: null, set: null, i: -1, X: null, sub: "", st: 0, scores: [],
  coach: null, fit: null, ball: null, bw: null, ring: null, it: null, view: null, eye: {x: 0, y: 0, z: 0, w: 0}, boost: null,
  tab: 0, said: null, lastSaid: -9, mateT: 0, wantE: false, auto: false, result: null, footT: 0, prevAt: 0};
export const WARM = SESS;

// a match's warm-up plan (null when there is none): the call minute and the set's seed, from the match seed
export function warmPlan(ctx){
  warmDispose();
  const subOn = ctx.subOn;
  if (!(subOn > 0)) return null;
  const r = mulberry32(hashStr("warm|" + (ctx.seed >>> 0)));
  const call = ctx.callAt != null ? ctx.callAt : callMinute(subOn, r);
  SESS.on = true; SESS.ctx = ctx; SESS.phase = "wait"; SESS.t = 0; SESS.r = r; SESS.scores = []; SESS.result = null; SESS.boost = null;
  SESS.plan = {subOn, call, seed: ctx.seed >>> 0};
  SESS.set = null; SESS.i = -1; SESS.X = null; SESS.tab = 0; SESS.auto = false;
  setWindows(ctx.port ? ctx.port.motivation() : 60);
  return SESS.plan;
}
export const warmOn = () => SESS.on && SESS.phase !== "idle";
// the phases in which the warm-up has your body and your keys
export const warmDriving = () => SESS.on && (SESS.phase === "rise" || SESS.phase === "jog" || SESS.phase === "drill");
export const warmDrilling = () => SESS.on && SESS.phase === "drill";
// the call is due now (the skip to your call stops for it)
export const warmCallDue = () => SESS.on && SESS.phase === "wait" && SESS.ctx && SESS.ctx.minute() >= SESS.plan.call;

/* each frame while you are a substitute off the pitch (bench or entering); dt real seconds */
export function warmFrame(dt){
  if (!SESS.on || !SESS.ctx) return;
  const C = SESS.ctx;
  SESS.t += dt;
  stepBodies(dt);
  switch (SESS.phase){
    case "wait":
      if (C.called()) { SESS.phase = "missed"; break; }
      if (C.minute() >= SESS.plan.call) startCall();
      break;
    case "call": callStep(dt); break;
    case "rise":
      SESS.st += dt;
      if (SESS.st >= WU.RISE){ SESS.phase = "jog"; SESS.st = 0; }
      break;
    case "jog": jogStep(dt); break;
    case "drill": drillStep(dt); break;
    case "done": doneStep(dt); break;
  }
  // the coach calls you over when the change is made (the match's own call); a set still running ends where it is
  if (C.called() && (SESS.phase === "drill" || SESS.phase === "jog" || SESS.phase === "rise")) finishWarm(false);
  if (C.called() && SESS.phase === "done" && !SESS.calledBack){ SESS.calledBack = true; say("coach", pick(LINES.back)); }
  if (C.called() && SESS.phase === "call"){ SESS.phase = "missed"; coachLeave(); }
}

/* ---------- the call ---------- */
function startCall(){
  const C = SESS.ctx, left = Math.max(1, SESS.plan.subOn - C.minute());
  SESS.phase = "call"; SESS.st = 0; SESS.calledBack = false;
  SESS.left = left;
  // the assistant coach comes from the dugout's far end
  const sx = C.side, seat = C.seatAt();
  SESS.coach = makeBody(C, "coach", 5 + C.team, {x: sx*14.2, z: -36.7});
  const at = seat ? {x: seat.x + .35*sx, z: seat.z + 1.2} : {x: P.x + .9, z: P.z + .9};
  SESS.coach.to = at; SESS.coach.state = "walk"; SESS.coach.crouch = !!seat;
  SESS.callLine = seat ? (left < 8 ? pick(LINES.late)(left) : pick(LINES.call)(left)) : pick(LINES.standing)(left);
  // the fitness coach waits on the strip, loosening up
  const s0 = stripStart();
  SESS.fit = makeBody(C, "coach", 19 + C.team, {x: s0.x + sx*3, z: WU.STRIP.z + .9}, true);
  SESS.fit.state = "stretch";
}
function callStep(dt){
  const C = SESS.ctx, k = SESS.coach;
  SESS.st += dt;
  if (k && k.state === "walk" && k.arrived){
    k.state = k.crouch ? "crouch" : "talk"; SESS.waitT = 0;
    say("coach", SESS.callLine);
    SESS.wantE = true;
  }
  if (SESS.wantE){
    // (he keeps facing you; if you walk off he follows a little)
    if (k && !k.crouch){ k.to = {x: P.x + .8*Math.sin(P.yaw + .6), z: P.z - .8*Math.cos(P.yaw + .6)}; }
    SESS.waitT += dt;
    if (SESS.waitT > WU.WAIT_E) ignoreCall();
  }
}
// E (on the seat or on your feet) while he is waiting, or once he is on his way
export function warmAccept(){
  if (!SESS.on || SESS.phase !== "call") return false;
  const C = SESS.ctx;
  SESS.wantE = false;
  if (!SESS.coach.arrived){ say("coach", SESS.callLine); }
  C.stand();
  SESS.phase = "rise"; SESS.st = 0;
  coachLeave();
  return true;
}
function ignoreCall(){
  const C = SESS.ctx;
  SESS.wantE = false; SESS.phase = "ignored";
  say("coach", pick(LINES.ignored));
  coachLeave();
  fitLeave();
  C.port.trust(WU.TRUST_IGNORE);
  C.port.warmBoost.set({rating: "cold", all: 0, focus: {}, untilMin: 0, onFire: false, ignored: true});
  C.note("You stayed on the bench. You'll go on cold.");
}
function coachLeave(){ const k = SESS.coach; if (!k) return; k.state = "walk"; k.crouch = false; k.to = {x: SESS.ctx.side*14.2, z: -36.7}; k.leave = true; k.arrived = false; }

/* ---------- to the strip, and the set ---------- */
const stripStart = () => { const C = SESS.ctx; return {x: C.side*WU.STRIP.SPOT0, z: WU.STRIP.z}; };
function jogStep(dt){
  const C = SESS.ctx, s0 = stripStart(), dx = s0.x - P.x, dz = s0.z - P.z, d = Math.hypot(dx, dz);
  SESS.st += dt;
  if (!SESS.set){
    const realLeft = (SESS.plan.subOn - C.minute())*60/Math.max(.5, C.rate());
    const n = exerciseCount(realLeft);
    // (a test fixture may name the set: test:bench {warmSet})
    SESS.set = C.forceSet ? C.forceSet.slice() : pickSet(SESS.r, n, C.last ? C.last() : null);
    if (C.remember) C.remember(SESS.set);
  }
  if (d < .6 || SESS.st > 14){ SESS.it = null; startExercise(0); return; }
  SESS.it = intent(dx/d, dz/d, "jog", null, Math.min(WU.JOG, 1 + d));
  SESS.view = {yaw: Math.atan2(-dx, -dz), pitch: -.15};
}
function startExercise(i){
  const C = SESS.ctx;
  SESS.phase = "drill"; SESS.i = i; SESS.sub = "intro"; SESS.st = 0;
  const id = SESS.set[i], E = POOL[id], r = SESS.r;
  const X = SESS.X = {id, t: 0, dur: lerp(E.dur[0], E.dur[1], r()), reps: [], streak: 0, best: 0, var: {}, side: r() < .5 ? 1 : -1, pops: []};
  X.minReps = Math.max(3, Math.round(X.dur*E.minK));
  E.begin(X, r);
  // where it is done: the boards for the leg swings, the strip otherwise; the fitness coach across from you
  const sx = C.side;
  const hx = clamp(P.x*sx, WU.STRIP.SPOT0, WU.STRIP.SPOT1)*sx;
  X.home = {x: hx, z: id === "swings" ? WU.STRIP.boardZ : WU.STRIP.z};
  X.face = faceOf(E.face, X);
  say("fit", pick(E.say));
  if (id === "juggle") ballStart(X);
  if (id === "onetwo"){ X.coachAt = {x: X.home.x, z: X.home.z + 5.5}; X.shift = 0; if (SESS.fit) SESS.fit.to = {x: X.coachAt.x, z: X.coachAt.z}; }
  if (SESS.fit){ SESS.fit.leave = false; SESS.fit.state = "demo"; }
}
// the yaw an exercise faces: along the strip, at the pitch, at the boards, at the coach
function faceOf(kind, X){
  const sx = SESS.ctx.side;
  if (kind === "boards") return 0;
  if (kind === "pitch") return Math.PI;
  if (kind === "coach") return Math.PI;
  // along the strip, away from the halfway line
  return sx < 0 ? Math.PI/2 : -Math.PI/2;
}
function drillStep(dt){
  const C = SESS.ctx, X = SESS.X, E = POOL[X.id];
  SESS.st += dt;
  // Tab held: the rest of the warm-up done at an average result
  if (SESS.tabDown){ SESS.tab += dt; if (SESS.tab >= WU.TAB_HOLD){ SESS.tabDown = false; SESS.tab = 0; autoComplete(); return; } }
  else SESS.tab = Math.max(0, SESS.tab - dt*3);
  // the moving exercises run you along the strip; the others hold you on the spot the exercise is done on
  if (SESS.sub === "go" || SESS.sub === "intro") moveFor(X, dt);
  if (SESS.sub === "intro"){
    SESS.view = {yaw: X.face, pitch: E.view.pitch};
    if (SESS.st >= WU.INTRO){ SESS.sub = "go"; SESS.st = 0; X.t = 0; pop(X, "Go", "go"); AUD.cue("whistleShort", null, .25); }
    return;
  }
  if (SESS.sub === "go"){
    X.t += dt;
    E.step(X, dt);
    if (X.id === "juggle") ballStepX(X, dt);
    SESS.view = {yaw: viewYaw(X), pitch: E.view.pitch};
    mateShout(dt);
    if (X.t >= X.dur) endExercise();
    return;
  }
  if (SESS.sub === "outro"){
    SESS.view = {yaw: viewYaw(X), pitch: E.view.pitch*.6};
    if (SESS.st >= WU.OUTRO){
      if (SESS.ball) ballEnd();
      if (SESS.i + 1 < SESS.set.length) startExercise(SESS.i + 1); else finishWarm(true);
    }
  }
}
const viewYaw = X => X.id === "strides" ? SESS.ctx.own().yaw : X.id === "shuffle" && X.burst > 0 ? SESS.ctx.own().yaw : X.face;
function endExercise(){
  const X = SESS.X, sc = exScore(X);
  SESS.scores[SESS.i] = sc;
  SESS.sub = "outro"; SESS.st = 0;
  const words = sc >= .8 ? "Great set" : sc >= .55 ? "Good set" : sc >= .3 ? "Keep at it" : "Rusty";
  pop(X, `${words} ${Math.round(sc*100)}%`, sc >= .8 ? "great" : "set");
  if (sc >= .8){
    // a great set: the fans by the boards give you a clap
    if (!AUD.cue("clap", null, .5)) AUD.cue("crowdRoar", null, .22);
    SESS.ctx.cheer(.5);
    SESS.ctx.say("", pick(LINES.great), true);
  }
  SESS.it = null;
}
// an exercise's score: the mean of its reps over at least the reps it should have had
export function exScore(X){
  const n = Math.max(X.reps.length, X.minReps || 3);
  let s = 0; for (const r0 of X.reps) s += GRADE[r0.g];
  return clamp(s/n, 0, 1);
}
function autoComplete(){
  const X = SESS.X;
  // what you did of the one running stays yours if it was better than average; the rest at the average
  if (X && SESS.sub === "go"){ const partial = exScore(X); SESS.scores[SESS.i] = Math.max(WU.AVERAGE, X.reps.length >= 3 ? partial : 0); }
  for (let i = 0; i < SESS.set.length; i++) if (SESS.scores[i] == null) SESS.scores[i] = WU.AVERAGE;
  SESS.auto = true;
  finishWarm(true);
}
// the end of the warm-up (done: the set finished; else the call came first): the rating, the boost, the line
function finishWarm(done){
  const C = SESS.ctx;
  if (SESS.ball) ballEnd();
  SESS.it = null;
  const n = SESS.set ? SESS.set.length : 0;
  if (!done && SESS.X && SESS.sub === "go") SESS.scores[SESS.i] = exScore(SESS.X)*clamp(SESS.X.t/SESS.X.dur, 0, 1);
  // (an exercise never reached counts as nothing)
  let s = 0; for (let i = 0; i < n; i++) s += SESS.scores[i] || 0;
  const q = n ? s/n : 0;
  const mot = C.port.motivation();
  const b = boostFor(q, mot, C.style(), SESS.r);
  SESS.boost = b; SESS.result = {q, rating: b.rating, done, auto: SESS.auto, scores: SESS.scores.slice(0, n)};
  // the boost lasts its minutes from when you go on (the planned change until then; controller.js moves it on)
  C.port.warmBoost.set({rating: b.rating, all: b.all, focus: Object.assign({}, b.focus), focusName: b.focusName, mins: b.mins, untilMin: SESS.plan.subOn + b.mins, onFire: false});
  if (b.rating === "sharp") C.port.motivationAdd(1, "A sharp warm-up");
  C.applyBoost(b);
  SESS.phase = "done"; SESS.st = 0; SESS.X = null;
  say("fit", pick(LINES.done[b.rating]));
  const foc = b.focusName ? ` and +${b.focus[Object.keys(b.focus)[0]]} ${b.focusName}` : "";
  C.pop(`${RATING_NAME[b.rating]}`, "rating", `+${b.all} to everything${foc} for your first ${b.mins} minutes on.`);
  fitLeave();
}
function doneStep(dt){ SESS.st += dt; }

// the moving exercises: strides back and forth along the strip, shuffles facing the pitch; the rest stand on their spot
function moveFor(X, dt){
  const C = SESS.ctx, own = C.own(), sx = C.side;
  const xa = sx < 0 ? -WU.STRIP.x1 : WU.STRIP.x0, xb = sx < 0 ? -WU.STRIP.x0 : WU.STRIP.x1;
  if (SESS.sub === "go" && X.id === "strides"){
    if (own.x <= xa + 1.2) X.dir = 1; else if (own.x >= xb - 1.2) X.dir = -1;
    SESS.it = intent(X.dir, (WU.STRIP.z - own.z)*.3, "jog", null, X.speed);
    return;
  }
  if (SESS.sub === "go" && X.id === "shuffle"){
    if (own.x <= xa + 1.5) X.dir = 1; else if (own.x >= xb - 1.5) X.dir = -1;
    if (X.burst > 0) SESS.it = intent(X.dir, 0, "sprint", null, 7.5);
    else SESS.it = intent(X.dir, (WU.STRIP.z - own.z)*.4, "jog", {x: 0, z: 1}, 2.3, true);
    return;
  }
  // to its spot (a few steps), then still
  const dx = X.home.x - own.x, dz = X.home.z - own.z, d = Math.hypot(dx, dz);
  if (d > .12) SESS.it = intent(dx/d, dz/d, "walk", dirOf(X.face), Math.min(WU.WALK, .4 + 2*d), true);
  else SESS.it = intent(0, 0, "walk", dirOf(X.face), 0, true);
}
const INT = {dx: 0, dz: 0, gait: "jog", face: null, strafe: false, speedCap: Infinity};
function intent(dx, dz, gait, face, cap, strafe = false){
  const l = Math.hypot(dx, dz) || 1;
  INT.dx = dx/l; INT.dz = dz/l; INT.gait = gait; INT.face = face; INT.speedCap = cap; INT.strafe = strafe;
  if (!(cap > 0)){ INT.dx = 0; INT.dz = 0; }
  return INT;
}
// the intent the controller's own walk takes this frame (null: your keys)
export const warmIntent = () => warmDriving() ? SESS.it : null;
// the look a set is framed for (the controller eases P.yaw and P.pitch to it while the warm-up has the view)
export const warmView = () => warmDriving() ? SESS.view : null;

/* ---------- input ---------- */
// returns true when the warm-up took the event. E during the call, Tab held during the set, the exercise's own keys
export function warmInput(ev){
  if (!SESS.on) return false;
  const k = ev.key === " " ? "space" : ev.key;
  if ((ev.type === "keydown" || ev.type === "keyup") && k === "e" && SESS.phase === "call"){ if (ev.type === "keydown" && !ev.repeat) warmAccept(); return true; }
  if (!warmDriving()) return false;
  if ((ev.type === "keydown" || ev.type === "keyup") && k === "tab"){
    if (SESS.phase === "drill"){ SESS.tabDown = ev.type === "keydown"; if (!SESS.tabDown) SESS.tab = 0; }
    return true;
  }
  if (SESS.phase !== "drill" || SESS.sub !== "go") return true;
  const X = SESS.X, E = POOL[X.id];
  E.input(X, ev);
  return true;
}
export const warmTab = () => SESS.tab/WU.TAB_HOLD;

/* ---------- reps, pops, voices ---------- */
function rep(X, g, word){
  X.reps.push({g, t: X.t});
  if (g === "perfect" || g === "good") X.streak++; else X.streak = 0;
  X.best = Math.max(X.best, X.streak);
  const sc = SESS.ctx;
  pop(X, word && g !== "perfect" ? `${POP_TEXT[g]}. ${word}` : POP_TEXT[g], g);
  if (g === "perfect") AUD.cue("post", null, .1);
  else if (g === "good") AUD.cue("bounce", null, .35);
  else if (g === "miss") AUD.cue("board", null, .08);
  if (X.streak > 0 && X.streak % 5 === 0){ pop(X, `Streak x${X.streak}`, "streak"); if (sc) sc.cheer(.25); mateShout(0, true); }
}
function pop(X, text, kind){ const C = SESS.ctx; if (C) C.pop(text, kind); if (X) X.lastPop = {text, kind}; }
function say(who, text){
  const C = SESS.ctx; if (!C || !text) return;
  SESS.said = {who, text, t: SESS.t};
  C.say(who === "coach" ? "Assistant coach" : who === "fit" ? "Fitness coach" : who, text);
  const b = who === "coach" ? SESS.coach : SESS.fit;
  if (b && b.h) AUD.call(text, {x: b.pos.x, y: 1.7, z: b.pos.z}, who === "coach" ? 31 : 47);
}
// the team-mates on the bench shout now and then (on a streak, or every so often while you work)
function mateShout(dt, now = false){
  SESS.mateT -= dt;
  if (!now && SESS.mateT > 0) return;
  SESS.mateT = 7 + 6*SESS.r();
  const C = SESS.ctx, m = C.mates ? C.mates() : [];
  if (!m.length) return;
  const who = m[Math.floor(SESS.r()*m.length) % m.length];
  const line = pick(LINES.mates);
  C.say(who.name, line, true);
  AUD.call(line, {x: who.x, y: 1.2, z: who.z}, who.seed || 3);
}
const pick = a => a[Math.floor((SESS.r ? SESS.r() : Math.random())*a.length) % a.length];

/* ---------- the juggling ball (ball.js, in world metres) ---------- */
function ballStart(X){
  const V = SESS.ctx.V();
  if (!SESS.bw) SESS.bw = createBallWorld({});
  const f = dirOf(X.face), p = {x: X.home.x + f.x*WU.JUG_D, z: X.home.z + f.z*WU.JUG_D};
  const b = createBall({x: p.x, y: .11, z: p.z, rollDecel: 1.2});
  const m = ballMesh({shadow: true}); m.mesh.matrixAutoUpdate = true;
  if (V && V.scene) V.scene.add(m.mesh);
  SESS.ball = {b, m, acc: 0};
  // the ring the ball should drop into, a thin hoop in front of you
  if (!SESS.ring){
    SESS.ring = new THREE.Mesh(new THREE.TorusGeometry(.2, .008, 6, 40), new THREE.MeshBasicMaterial({color: 0xc8f060, transparent: true, opacity: .75, depthWrite: false}));
    SESS.ring.rotation.x = Math.PI/2; SESS.ring.userData.noMerge = true; SESS.ring.renderOrder = 3;
  }
  if (V && V.scene) V.scene.add(SESS.ring);
  SESS.ring.visible = true;
  X.drop = 0; X.flick = .35;
}
function juggleTouch(X, g){
  const S0 = SESS.ball; if (!S0) return;
  const b = S0.b, f = dirOf(X.face);
  const q = GRADE[g];
  // a clean touch goes straight up to about the same height; a poor one loses height and wanders off
  X.drift = clamp(X.drift + (SESS.r() - .5)*(1 - q)*.5, -.35, .35);
  // (it goes up to about the same height above the ring each time: a clean touch to the top of it, a poor one short)
  const apex = X.ring + X.var.hi*(.55 + .45*q), vy = Math.sqrt(2*9.81*Math.max(.12, apex - b.p.y));
  const back = (b.p.x - (X.home.x + f.x*WU.JUG_D))*-1.6, backZ = (b.p.z - (X.home.z + f.z*WU.JUG_D))*-1.6;
  ballKick(b, {x: back - f.z*X.drift, y: vy, z: backZ + f.x*X.drift}, {x: 0, y: 0, z: 0}, {agent: -1, kind: "juggle"});
  X.k = 1; X.side = -X.side; X.touches++;
  AUD.cue("kick", {x: b.p.x, y: b.p.y, z: b.p.z}, .22 + .1*q);
}
function ballStepX(X, dt){
  const S0 = SESS.ball; if (!S0) return;
  const b = S0.b, f = dirOf(X.face);
  S0.acc += dt;
  while (S0.acc >= 1/60){ ballStep(b, SESS.bw, 1/60); S0.acc -= 1/60; }
  // dropped: it bounces; a moment later you flick it back up with your foot
  if (X.drop > 0){ X.drop -= dt; if (X.drop <= 0){ X.flick = .01; } }
  if (!X.drop && b.p.y < .2 && b.v.y <= 0 && X.flick <= 0 && X.touches > 0){ X.drop = .8; rep(X, "miss", "Dropped it"); X.streak = 0; }
  if (X.flick > 0){
    X.flick -= dt;
    if (X.flick <= 0){
      // the flick up off the grass (no score): back in front of you
      b.p.x = X.home.x + f.x*WU.JUG_D; b.p.z = X.home.z + f.z*WU.JUG_D; b.p.y = .12;
      ballKick(b, {x: 0, y: Math.sqrt(2*9.81*(X.ring + X.var.hi - .12)), z: 0}, {x: 0, y: 0, z: 0}, {agent: -1, kind: "flick"});
      X.k = .7; X.drop = 0; X.touches = Math.max(X.touches, 1);
    }
  }
  S0.m.mesh.position.set(b.p.x, b.p.y, b.p.z);
  if (SESS.ring){ SESS.ring.position.set(X.home.x + f.x*WU.JUG_D, X.ring, X.home.z + f.z*WU.JUG_D); SESS.ring.material.opacity = .45 + .4*(b.v.y < 0 && Math.abs(b.p.y - X.ring) < .25 ? 1 : 0); }
}
function ballEnd(){
  const S0 = SESS.ball;
  if (S0 && S0.m.mesh.parent) S0.m.mesh.parent.remove(S0.m.mesh);
  SESS.ball = null;
  if (SESS.ring) SESS.ring.visible = false;
}

/* ---------- the one-twos ---------- */
function oneTwoStep(X, dt){
  const F = SESS.fit; if (!F) return;
  X.st += dt;
  const at = X.coachAt;
  if (!SESS.ball){
    if (!SESS.bw) SESS.bw = createBallWorld({});
    const b = createBall({x: F.pos.x, y: .11, z: F.pos.z - .45, rollDecel: 1.2});
    const m = ballMesh({shadow: true}); m.mesh.matrixAutoUpdate = true;
    const V = SESS.ctx.V(); if (V && V.scene) V.scene.add(m.mesh);
    SESS.ball = {b, m, acc: 0};
    ballHold(b, {id: 1, x: F.pos.x, y: .11, z: F.pos.z - .45});
  }
  const S0 = SESS.ball, b = S0.b;
  switch (X.stage){
    case "feed":
      // back on his spot with the ball at his feet, he plays it in to yours
      F.to = {x: at.x + X.shift, z: at.z};
      if (b.state === "held") ballHold(b, {id: 1, x: F.pos.x, y: .11, z: F.pos.z - .45});
      // (his swing starts a moment before the ball goes: the clip runs to the contact, moves.js tc)
      if (X.st > .25 && F.arrived && !F.strike) F.strike = {tc: .3, after: .45, id: (F.sid = (F.sid || 0) + 1), ball: {x: b.p.x, y: .11, z: b.p.z}, dir: {x: X.home.x - b.p.x, z: X.home.z - b.p.z}};
      if (F.strike && F.strike.tc <= 0 && b.state === "held"){
        const tx = X.home.x, tz = X.home.z + .45, dx = tx - b.p.x, dz = tz - b.p.z, d = Math.hypot(dx, dz) || 1, v = rollSpeedFor(d, 2.6, 1.2);
        b.state = "free";
        ballKick(b, {x: dx/d*v, y: 0, z: dz/d*v}, {x: 0, y: 0, z: 0}, {agent: -1, kind: "pass"});
        AUD.cue("kick", {x: b.p.x, y: .2, z: b.p.z}, .35);
        X.stage = "rolling"; X.st = 0;
        // (he steps across as it rolls to you: the angle for the return)
        X.shift = (X.shift > 0 ? -1 : 1)*(1.1 + .8*SESS.r());
      }
      break;
    case "rolling":
      F.to = {x: at.x + X.shift, z: at.z};
      // it comes to your feet: you take it (a cushioned first touch: the ball stops at your boot)
      if (Math.hypot(b.p.x - X.home.x, b.p.z - (X.home.z + .45)) < .45 || X.st > 3){
        ballHold(b, {id: 0, x: X.home.x, y: .11, z: X.home.z + .45}); AUD.cue("bounce", {x: X.home.x, y: .1, z: X.home.z + .45}, .25);
        X.stage = "have"; X.st = 0; X.openAt = .3 + .6*SESS.r();
      }
      break;
    case "have":
      // he steps across, then opens his body to you
      F.to = {x: at.x + X.shift, z: at.z};
      if (X.st >= X.openAt && F.arrived){ X.stage = "open"; X.open = X.t; F.open = 1; }
      break;
    case "open":
      if (X.t - X.open > WIN.onetwo[2] + .35){ rep(X, "miss", "Too slow, he closed up"); oneTwoPass(X, "miss"); }
      break;
    case "back": {
      // he takes it (a pass gone astray he has to go and fetch)
      const d = Math.hypot(b.p.x - F.pos.x, b.p.z - (F.pos.z - .45)), slow = Math.hypot(b.v.x, b.v.z) < .4;
      if (slow && d > .6) F.to = {x: b.p.x, z: b.p.z + .45};
      if (d < .55 || (X.st > 4)){ ballHold(b, {id: 1, x: F.pos.x, y: .11, z: F.pos.z - .45}); X.stage = "feed"; X.st = 0; F.open = 0; }
      break;
    }
  }
  // your pass goes as your foot meets it (the swing started on the click)
  if (X.pending && X.t >= X.pending.at){ const g = X.pending.g; X.pending = null; oneTwoKick(X, g); }
  if (F.strike){ F.strike.tc -= dt; if (F.strike.tc < -F.strike.after) F.strike = null; }
  if (SESS.strike){ SESS.strike.tc -= dt; if (SESS.strike.tc < -.45) SESS.strike = null; }
  S0.acc += dt;
  while (S0.acc >= 1/60){ ballStep(b, SESS.bw, 1/60); S0.acc -= 1/60; }
  S0.m.mesh.position.set(b.p.x, b.p.y, b.p.z);
}
// the click: the swing starts now, the ball goes at contact (0.14 s on)
function oneTwoPass(X, g){
  const S0 = SESS.ball; if (!S0 || X.pending) return;
  X.pending = {g, at: X.t + .14}; X.stage = "passing";
  const b = S0.b, F = SESS.fit;
  SESS.strike = {tc: .14, id: (SESS.sid = (SESS.sid || 0) + 1), ball: {x: b.p.x, y: .11, z: b.p.z}, dir: {x: (F ? F.pos.x : b.p.x) - b.p.x, z: (F ? F.pos.z : b.p.z + 6) - b.p.z}};
}
function oneTwoKick(X, g){
  const S0 = SESS.ball, F = SESS.fit; if (!S0 || !F) return;
  const b = S0.b, q = GRADE[g];
  // into his feet when it is clean; behind him or wide when it is not
  const miss = (1 - q)*(SESS.r() < .5 ? -1 : 1)*(1.0 + 1.4*SESS.r());
  const tx = F.to.x + miss, tz = F.to.z - .45, dx = tx - b.p.x, dz = tz - b.p.z, d = Math.hypot(dx, dz) || 1, v = rollSpeedFor(d, 2.2 + 2.4*(1 - q), 1.2);
  b.state = "free";
  ballKick(b, {x: dx/d*v, y: 0, z: dz/d*v}, {x: 0, y: 0, z: 0}, {agent: 0, kind: "pass"});
  AUD.cue("kick", {x: b.p.x, y: .2, z: b.p.z}, .3 + .15*q);
  X.stage = "back"; X.st = 0; X.passes++;
  F.open = 0;
}
// the fitness coach heads back to the dugout once the set is done (or the call is ignored)
function fitLeave(){ const F = SESS.fit; if (!F) return; F.leave = true; F.to = {x: SESS.ctx.side*14.6, z: -36.3}; }

/* ---------- the bodies: the assistant coach, the fitness coach ---------- */
function makeBody(C, role, seed, at, bare = false){
  const V = C.V(); if (!V || !V.scene) return null;
  const look0 = lookFor(role, seed, {kit: C.kit, sex: "m"});
  // (the fitness coach works with his hands free: no clipboard)
  const look = bare ? Object.assign({}, look0, {props: []}) : look0;
  const h = human(look, {cast: true});
  h.g.name = "warm-" + seed;
  V.scene.add(h.g);
  const o = {h, pos: {x: at.x, z: at.z}, yaw: 0, st: {mode: "move", speed: 0}, to: null, arrived: false, state: "idle", speed: 0, kick: 0, open: 0, leave: false, crouch: false};
  h.g.position.set(at.x, 0, at.z);
  o.actor = SCHED.actor({id: "warm-" + seed, kind: "match", r: 1.1, pos: () => o.posW || (o.posW = {x: o.pos.x, y: 0, z: o.pos.z}), active: () => true,
    anim: (dt, tier) => { if (o.h) animateHuman(o.h, dt, o.st, {tier}); }});
  return o;
}
function dropBody(o){ if (!o) return; SCHED.remove(o.actor); if (o.h) o.h.dispose(); o.h = null; }
function stepBodies(dt){
  for (const key of ["coach", "fit"]){
    const o = SESS[key]; if (!o || !o.h) continue;
    const g = o.h.g;
    let moving = false;
    // the fitness coach's spot through a set: across from you (the one-twos: 6.5 m off), along the strip for the
    // moving ones
    if (key === "fit" && SESS.phase === "drill" && SESS.X && SESS.X.id !== "onetwo"){
      const X = SESS.X, f = dirOf(X.face);
      o.to = X.id === "strides" || X.id === "shuffle" ? {x: X.home.x - SESS.ctx.side*4, z: WU.STRIP.z + 1.6} : X.id === "swings" ? {x: X.home.x + 1.5*SESS.ctx.side, z: WU.STRIP.boardZ} : {x: X.home.x + f.x*3.1, z: X.home.z + f.z*3.1};
    }
    if (o.to){
      const dx = o.to.x - o.pos.x, dz = o.to.z - o.pos.z, d = Math.hypot(dx, dz);
      if (d > .08){
        const v = Math.min(d > 3 ? WU.JOG*.8 : WU.WALK, Math.max(.6, d*1.6));
        // (round you, never through you: a push away from where you stand within 1.6 m, on the pitch side of you)
        let ux = dx/d, uz = dz/d;
        const px = o.pos.x - P.x, pz = o.pos.z - P.z, pd = Math.hypot(px, pz);
        if (pd < 1.6 && d > .3){ const w = (1.6 - pd)/1.6*2.2; ux += px/Math.max(.1, pd)*w; uz += pz/Math.max(.1, pd)*w + .6*w; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l; }
        const step = Math.min(d, v*dt);
        o.pos.x += ux*step; o.pos.z += uz*step; o.speed = v; moving = true;
        o.yaw = turnTo(o.yaw, Math.atan2(-ux, -uz), 6*dt);
        o.arrived = false;
      } else { o.speed = 0; if (!o.arrived){ o.arrived = true; if (o.leave && key === "coach"){ dropBody(o); SESS.coach = null; continue; } } }
    }
    // facing: you (the coaches talk to you), or the way the set faces
    const toMe = Math.atan2(-(P.x - o.pos.x), -(P.z - o.pos.z));
    if (!moving) o.yaw = turnTo(o.yaw, key === "fit" && SESS.phase === "drill" && SESS.X && SESS.X.id === "swings" ? 0 : toMe, 5*dt);
    g.position.set(o.pos.x, 0, o.pos.z); g.rotation.y = o.yaw + Math.PI;
    if (o.posW){ o.posW.x = o.pos.x; o.posW.z = o.pos.z; }
    o.st = bodySt(key, o, moving);
  }
}
const turnTo = (a, b, k) => a + clamp(wrapA(b - a), -k, k);
const DEMO = {};
function bodySt(key, o, moving){
  if (moving) return Object.assign(o.mv || (o.mv = {mode: "move", speed: 0}), {speed: o.speed, upper: null});
  if (key === "coach") return o.crouch && o.arrived ? (o.cst || (o.cst = {mode: "wu:crouch", talk: 0})) : (o.tst || (o.tst = {mode: "idle", upper: {g: "point", w: .6}}));
  // the fitness coach: loosening up, demonstrating the set, playing the one-twos
  if (SESS.phase === "drill" && SESS.X){
    const X = SESS.X, t = X.t + .15;
    switch (X.id){
      case "lunges": { const c = Math.sin(Math.PI*(t % 2.6)/2.6); return demo("wu:lunge", {d: .95*c*c, lead: Math.floor(t/2.6) % 2 ? 1 : -1}); }
      case "swings": return demo("wu:swing", {a: X.guide || 0, s: -X.s, lat: X.lat, board: .7});
      case "hips": { const th = t*2.4; return demo("wu:hips", {th, r: 1, s: 1}); }
      case "quad": return demo("wu:quad", {ox: .15*Math.sin(t*1.3), oy: .1*Math.sin(t*.9), s: -X.s});
      case "knees": { const b = (X.beats || []).filter(q => q.t <= X.t).pop(); const since = b ? X.t - b.t : 9; return demo("wu:knees", {L: b && b.s > 0 ? Math.max(0, 1 - since*3.2) : 0, R: b && b.s < 0 ? Math.max(0, 1 - since*3.2) : 0, kick: X.kick}); }
      case "juggle": return o.fst || (o.fst = {mode: "idle", arms: "folded"});
      case "onetwo": {
        if (o.strike){ const k = o.kst || (o.kst = {mode: "strike", kind: "side", side: "R", power: .45}); k.id = o.strike.id; k.ball = o.strike.ball; k.dir = o.strike.dir; k.tc = Math.max(0, o.strike.tc); return k; }
        return o.open ? (o.ost || (o.ost = {mode: "idle", upper: {g: "call", w: 1}})) : (o.ist || (o.ist = {mode: "idle"}));
      }
      default: return o.wst || (o.wst = {mode: "idle", upper: {g: "armsOut", w: .25}});
    }
  }
  return o.sst || (o.sst = {mode: "stretch"});
}
function demo(mode, p){ const k = mode; const s = DEMO[k] || (DEMO[k] = {mode}); return Object.assign(s, p); }

/* ---------- your own body through the set (controller.js fpPose hands it over while the warm-up has you) ----------
   h: your first-person body; at (x, z) where you stand; dt. Places and poses it, returns the pose's events (the
   footfalls the strides are tapped to). */
const FK = newFK(), FK0 = newFK();
let REST_Q = null;
export function warmPose(h, x, z, yaw, dt){
  if (!warmDriving() || !h) return null;
  const X = SESS.X, own = SESS.ctx.own();
  let st, by = yaw;
  if (SESS.phase === "drill" && X && SESS.sub !== "intro" && !(X.id === "strides" || X.id === "shuffle")) { st = myState(X); by = X.face; }
  else if (SESS.phase === "drill" && X && SESS.sub === "intro" && !(X.id === "strides" || X.id === "shuffle") && Math.hypot(own.x - X.home.x, own.z - X.home.z) < .2){ st = myState(X, true); by = X.face; }
  else {
    const L = SESS.loco || (SESS.loco = {mode: "move", speed: 0, root: {x: 0, z: 0}, style: "normal"});
    L.speed = own.speed; L.root.x = x; L.root.z = z;
    L.style = X && X.id === "shuffle" && !(X.burst > 0) && SESS.sub === "go" ? "shuffle" : "normal";
    st = L; by = own.yaw;
  }
  h.g.visible = true;
  h.g.position.set(x, 0, z); h.g.rotation.y = by + Math.PI;
  const tPrev = X ? X.t - (SESS.sub === "go" ? dt : 0) : 0;
  const ev = animateHuman(h, dt, st);
  // a footfall of the strides: when it happened inside this frame
  if (X && X.id === "strides" && SESS.sub === "go" && (ev.mask & EV.FOOTFALL)) POOL.strides.foot(X, tPrev + (ev.at || 0));
  eyeFrom(h, st.mode !== "move");
  return ev.mask;
}
function myState(X, still = false){
  const s = SESS.my || (SESS.my = {});
  switch (X.id){
    case "lunges": return Object.assign(s, {mode: "wu:lunge", d: still ? 0 : X.d, lead: X.lead});
    case "swings": return Object.assign(s, {mode: "wu:swing", a: still ? 0 : X.a, s: X.s, lat: X.lat, board: Math.max(.45, (P.z - (-38))/1.0)});
    case "hips": return Object.assign(s, {mode: "wu:hips", th: X.th, r: still ? 0 : clamp(Math.hypot(X.cx, X.cy)/X.var.R, 0, 1.4), s: X.s});
    case "quad": return Object.assign(s, {mode: "wu:quad", ox: X.dot ? X.dot.x : 0, oy: X.dot ? X.dot.y : 0, s: X.s});
    case "knees": return Object.assign(s, {mode: "wu:knees", L: X.kL, R: X.kR, kick: X.kick});
    case "juggle": return Object.assign(s, {mode: "wu:juggle", k: X.k, side: X.side});
    case "onetwo":
      if (SESS.strike){ const k = SESS.sk || (SESS.sk = {mode: "strike", kind: "side", side: "R", power: .45}); k.id = SESS.strike.id; k.ball = SESS.strike.ball; k.dir = SESS.strike.dir; k.tc = Math.max(0, SESS.strike.tc); return k; }
      return Object.assign(s, {mode: "idle"});
  }
  return Object.assign(s, {mode: "idle"});
}
// the eye rides your neck while a set bends you (a lunge takes it down): how far the neck is from where it stands at
// rest, eased in and out so nothing jumps between the moving and the standing exercises
function eyeFrom(h, on){
  const E = SESS.eye;
  E.on = on; E.f = SESS.t;
  if (!on && E.w < .002) return;
  if (!REST_Q){ REST_Q = new Float64Array(83); for (let i = 0; i < 20; i++) REST_Q[i*4 + 3] = 1; }
  fkQ(h, h.pose, FK, 5); fkQ(h, REST_Q, FK0, 5);
  const o = B.neck*7, sc = h.scale || 1, ry = h.g.rotation.y, c = Math.cos(ry), s = Math.sin(ry);
  const bx = FK[o] - FK0[o], by = FK[o + 1] - FK0[o + 1], bz = FK[o + 2] - FK0[o + 2];
  E.rx = clamp((bx*c + bz*s)*sc, -.35, .35); E.rz = clamp((-bx*s + bz*c)*sc, -.35, .35); E.ry = clamp(by*sc, -.8, .15);
}
// the eye's offset this frame (weighted in over a quarter of a second, out again once the set lets go of you)
export function warmEye(){
  const E = SESS.eye, on = !!E.on && warmDriving();
  E.w += ((on ? 1 : 0) - E.w)*.16;
  if (E.w < .002){ E.w = 0; E.x = E.y = E.z = 0; return E; }
  E.x = (E.rx || 0)*E.w; E.y = (E.ry || 0)*E.w; E.z = (E.rz || 0)*E.w;
  return E;
}

/* ---------- the HUD's view of it (fphud.js hudWarm) ---------- */
export function warmHud(){
  if (!SESS.on) return null;
  if (SESS.phase === "drill" && SESS.X){
    const X = SESS.X, E = POOL[X.id];
    return {name: E.name, how: E.how, i: SESS.i, n: SESS.set.length, sub: SESS.sub, t: SESS.sub === "go" ? X.t : 0, dur: X.dur, streak: X.streak,
      w: SESS.sub === "go" ? E.hud(X) : null, tab: SESS.tab/WU.TAB_HOLD, scores: SESS.scores};
  }
  return null;
}
// the hints while the warm-up has you
export function warmHints(){
  if (!SESS.on) return null;
  if (SESS.phase === "call" && SESS.wantE) return [{key: "E", verb: "stand up and get warm"}];
  if (SESS.phase === "drill" && SESS.X) return POOL[SESS.X.id].keys.concat([{key: "Tab", verb: "hold to finish the warm-up"}]);
  if (SESS.phase === "rise" || SESS.phase === "jog") return [{key: "Tab", verb: "hold to finish the warm-up"}];
  return null;
}

/* ---------- the end of it ---------- */
export function warmDispose(){
  dropBody(SESS.coach); dropBody(SESS.fit); SESS.coach = SESS.fit = null;
  ballEnd();
  if (SESS.ring){ if (SESS.ring.parent) SESS.ring.parent.remove(SESS.ring); SESS.ring.geometry.dispose(); SESS.ring.material.dispose(); SESS.ring = null; }
  SESS.on = false; SESS.ctx = null; SESS.phase = "idle"; SESS.X = null; SESS.set = null; SESS.it = null; SESS.view = null;
  SESS.eye.x = SESS.eye.y = SESS.eye.z = SESS.eye.w = 0; SESS.tab = 0; SESS.tabDown = false; SESS.strike = null;
}
// the controller's view of the plan for the tests (__fp.warm)
export const WARM_POOL = POOL;

/* ====================================================================================================
   THE POSES (registered through human.js registerMode; Euler pose T on the shared rig, body space: +X the body's left,
   +Y up, +Z forward, in units of the 1.80 m frame)
   ==================================================================================================== */
const _M = new THREE.Matrix4(), _V = new THREE.Vector3();
function hipsHands(h, T){ for (let s = 1; s >= -1; s -= 2) armIK(h, T, s, s*.205, 1.0, .02, -s*.6, -.3, [1, -.2, -.25]); }
function plant(h, T, s, z = 0, x = .04, y = 0){ const D = h.D; legIK(h, T, s, s*(D.hipX + x), D.ankY + y, z, 0); }
// a leg's three bones set straight from angles (thigh forward-back and out, knee bend, foot pitch)
function legFK(T, s, flex, out, knee, foot, twist = 0){ const L = LEG(s); R3(T, L[0], flex, s*twist, s*out); R3(T, L[1], knee); R3(T, L[2], foot); R3(T, L[3], 0); }
// blend a leg's bones from what T has (planted) toward a set of angles, by w
function legMix(T, s, flex, out, knee, foot, w){
  const L = LEG(s);
  T[L[0]*3] = lerp(T[L[0]*3], flex, w); T[L[0]*3 + 1] *= 1 - w; T[L[0]*3 + 2] = lerp(T[L[0]*3 + 2], s*out, w);
  T[L[1]*3] = lerp(T[L[1]*3], knee, w); T[L[1]*3 + 1] *= 1 - w; T[L[1]*3 + 2] *= 1 - w;
  T[L[2]*3] = lerp(T[L[2]*3], foot, w);
}

// a forward lunge: the lead foot steps out as you go down, the back knee drops toward the grass; up again, it steps back
registerMode("wu:lunge", (h, T, st) => {
  const D = h.D, d = clamp(st.d || 0, 0, 1.25), L = st.lead || 1, leg = D.hipY - D.ankY, t = h.t;
  const e = sstep(0, .35, d), zf = .5*e, zb = -.36*e;
  const need = leg - Math.sqrt(Math.max(.01, leg*leg*.985 - zf*zf));
  const drop = Math.max(need, leg*.44*Math.min(d, 1.1));
  T[61] = -drop; T[62] = .04*e; T[60] = 0;
  R3(T, B.hips, .05*e); R3(T, B.spine, -.03*e + .01*Math.sin(t*1.7)); R3(T, B.chest, .02); R3(T, B.neck, .12 + .1*e);
  legIK(h, T, L, L*(D.hipX + .05), D.ankY + .07*Math.sin(Math.PI*clamp(e*1.6, 0, 1))*(e < .6 ? 1 : 0), zf, 0);
  legIK(h, T, -L, -L*(D.hipX + .03), D.ankY + .03*e, zb, .75*e, -.75*e);
  hipsHands(h, T);
}, {blend: .2, low: true, ground: false});
// leg swings at the boards: both hands on the board, the support leg planted, the other swinging (forward and back, or
// across the body and out)
registerMode("wu:swing", (h, T, st) => {
  const D = h.D, s = st.s || 1, w = -s, a = clamp(st.a || 0, -1.2, 1.2), sc = h.scale || 1;
  T[60] = s*.035; T[61] = -.012; R3(T, B.hips, .06, 0, -s*.04); R3(T, B.spine, .08); R3(T, B.chest, .03); R3(T, B.neck, .15);
  plant(h, T, s, 0, .01);
  if (!st.lat) legFK(T, w, -(a > 0 ? 1.0*a : .6*a), .05, .12 + .5*Math.max(0, -a) + .08*Math.max(0, a), .25 + .25*Math.max(0, a));
  else legFK(T, w, -.3 - .1*Math.abs(a), a > 0 ? -.55*a : .5*-a, .18, .3);
  // the hands on top of the boards in front (0.9 m high)
  const bz = (st.board || .7)/sc, by = .9/sc + PALM + .01;
  for (let s2 = 1; s2 >= -1; s2 -= 2) armIK(h, T, s2, s2*.24, by, bz - .03, -s2*.3, .2, [.6, -.3, -.8]);
}, {blend: .2});
// hip openers: on one leg, the other knee raised and drawing a circle out to the side and back
registerMode("wu:hips", (h, T, st) => {
  const s = st.s || 1, w = -s, r = clamp(st.r || 0, 0, 1.3), th = st.th || 0;
  T[60] = s*.03; T[61] = -.02; R3(T, B.hips, .04, -w*.08*r*Math.cos(th), -s*.03); R3(T, B.spine, .05); R3(T, B.neck, .2);
  plant(h, T, s, 0, .01);
  const lift = sstep(0, .25, r);
  legFK(T, w, -(.25 + 1.0*lift) - .32*r*Math.sin(th), .12*lift + .55*r*(.5 + .5*Math.cos(th)), .3 + 1.5*lift, .35*lift, .25*r);
  hipsHands(h, T);
}, {blend: .2});
// a quad stretch on one leg: the heel held to the backside, the free arm out; the body sways with the wobble
registerMode("wu:quad", (h, T, st) => {
  const D = h.D, s = st.s || 1, w = -s, ox = clamp(st.ox || 0, -1.4, 1.4), oy = clamp(st.oy || 0, -1.4, 1.4);
  T[60] = s*.02 + .02*ox; T[61] = -.015;
  R3(T, B.hips, .03 + .05*oy, 0, -.06*ox); R3(T, B.spine, .06 + .05*oy, 0, -.08*ox); R3(T, B.chest, .02, 0, -.05*ox); R3(T, B.neck, .1);
  legIK(h, T, s, s*(D.hipX - .01), D.ankY, 0, 0);
  const L = LEG(w); R3(T, L[0], .14, 0, -w*.02); R3(T, L[1], 2.45); R3(T, L[2], .8);
  frameOf(h, T, L[2], _M); _V.set(0, .085, .045).applyMatrix4(_M);
  armIK(h, T, w, _V.x, _V.y, _V.z, w*-.6, .35, [.35, .1, -1]);
  const A = ARM(s); R3(T, A[0], -.2 - .2*oy, 0, s*(.7 + .35*ox*s)); R3(T, A[1], -.35); R3(T, A[2], 0, 0, s*.15);
}, {blend: .25});
// high knees (the knee driven up) or butt kicks (the heel to the backside), each leg by its own pulse; the arms pump
registerMode("wu:knees", (h, T, st) => {
  const kick = !!st.kick, kl = clamp(st.L || 0, 0, 1), kr = clamp(st.R || 0, 0, 1), up = Math.max(kl, kr);
  T[61] = -.025 + .03*up; T[62] = 0;
  R3(T, B.hips, kick ? .1 : -.02); R3(T, B.spine, kick ? .08 : -.04); R3(T, B.neck, .2);
  for (let s = 1; s >= -1; s -= 2){
    const k = s > 0 ? kl : kr, e = sstep(0, .35, k);
    plant(h, T, s, 0, .03);
    if (e > .001){ if (kick) legMix(T, s, .12*k, .02, 2.35*k, .7*k, e); else legMix(T, s, -1.55*k, .04, 1.8*k + .05, .45*k, e); }
    // the opposite arm drives with the knee
    const o = s > 0 ? kr : kl, A = ARM(s);
    R3(T, A[0], -.9*sstep(0, .5, o) + .45*sstep(0, .5, k), 0, s*.12); R3(T, A[1], -1.35); R3(T, A[2], 0);
  }
}, {blend: .15});
// juggling: on one leg, the other lifting its foot flat under the ball for a touch; the arms out for balance
registerMode("wu:juggle", (h, T, st) => {
  const side = st.side || 1, k = clamp(st.k || 0, 0, 1), e = sstep(0, .4, k);
  T[61] = -.03; R3(T, B.hips, .06); R3(T, B.spine, .1); R3(T, B.neck, .3);
  for (let s = 1; s >= -1; s -= 2){
    plant(h, T, s, s === side ? .04 : -.02, .05);
    if (s === side && e > .001) legMix(T, s, -1.0*k, .06, .75*k + .1, -.1*k, e);
    const A = ARM(s); R3(T, A[0], -.35, 0, s*(.55 + .2*e)); R3(T, A[1], -.55); R3(T, A[2], 0);
  }
}, {blend: .15});
// the assistant coach crouched in front of you: low on his heels, forearms on his knees, one hand making the point
registerMode("wu:crouch", (h, T, st) => {
  const D = h.D, leg = D.hipY - D.ankY, t = h.t;
  // (the back leaning in over the knees, the head up to look you in the eye on the seat)
  T[61] = -leg*.52; T[62] = -.05; R3(T, B.hips, .5); R3(T, B.spine, .18); R3(T, B.chest, .04); R3(T, B.neck, -.42, .06*Math.sin(t*.7), 0); R3(T, B.head, -.32 + .05*Math.sin(t*1.9));
  legIK(h, T, 1, D.hipX + .1, D.ankY, .22, 0, 0);
  legIK(h, T, -1, -(D.hipX + .08), D.ankY + .03, -.08, -.5, -.9);
  for (let s = 1; s >= -1; s -= 2){
    frameOf(h, T, LEG(s)[1], _M); _V.setFromMatrixPosition(_M);
    if (s < 0) armIK(h, T, s, _V.x - .02, _V.y + .06 + .03*Math.sin(t*3.1), _V.z + .2 + .05*Math.sin(t*2.3), .6, -.3, [1, -.2, -.25]);
    else armIK(h, T, s, _V.x + .02, _V.y + .07, _V.z + .1, -.6, -.3, [1, -.2, -.25]);
  }
}, {blend: .35, low: true});
