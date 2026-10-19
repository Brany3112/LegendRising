// qa/u27-control.mjs: USER-ISSUES U27, close control (F toggles it on), on the simulation a drill plays on
// (scen-team.js matchOf), the player's intents set as control.js sets them (F: me.takeT; the keys: intent.dx, dz, gait).
//   - F takes a ball rolling to you, a loose ball you run to first, and a ball you reach sprinting
//   - in close control, walking, jogging and sprinting, forward, sideways, backwards, a turn back and a circle: the ball
//     within CTL_MAX m of you (RUN_MAX at a sprint: FC27, the clip's push and run, the ball pushed on a couple of strides at a
//     time) and yours for 3 s each, and a sprint in it a little under your sprint
//   - a turn is played with the side of the strong foot it needs: left, the ball's right side (a right foot's inside,
//     a left foot's outside); right, the other way round
//   - it ends on a pass, a shot, Shift twice (the knock-on) and the ball taken by an opponent
//   - F again with the ball out of reach takes nothing until it is within reach
//
//   node qa/u27-control.mjs          exits 1 on any failed check
import {simStep} from "../js/life/football/sim.js";
import {startKick, TAKE} from "../js/life/football/actions.js";
import {setCtl} from "../js/life/football/rules.js";
import {setupOf, matchOf, H} from "./tr6-teamlib.mjs";
import {drill} from "../js/life/train/scen-team.js";
import {checker} from "./wpF-lib.mjs";

const {check, done} = checker("u27-control");
// (FC27, plan/notes/fc27-spec.md 6.3: a sprint in close control is the clip's push and run, every 2 to 3 strides with the
// ball run onto; right after its touch the ball may be up to 1.05 m off)
const CTL_MAX = 0.7, RUN_MAX = 1.05;
const r2 = v => Math.round(v*100)/100;
const fwdOf = me => ({x: -Math.sin(me.m.yaw), z: -Math.cos(me.m.yaw)});

// a fresh go of the carrier drill: you, the ball where asked (ahead of you: along, across), still or rolling
function go(o = {}){
  const {setup, spec} = setupOf(drill("att-carrier"), o.seed || 3);
  const {ms} = matchOf(setup, spec, "train");
  ms.meAI = false;
  const me = ms.agents[ms.me];
  if (o.foot) me.foot = o.foot;
  const f = fwdOf(me), along = o.along != null ? o.along : .35;
  ms.ball.p.x = me.m.x + f.x*along; ms.ball.p.z = me.m.z + f.z*along; ms.ball.p.y = .11;
  ms.ball.v.x = f.x*(o.roll || 0); ms.ball.v.z = f.z*(o.roll || 0); ms.ball.v.y = 0;
  if (o.loose){ ms.poss.ctl = -1; }
  return {ms, me, f};
}
function intent(me, dx, dz, gait){
  const I = me.intent, l = Math.hypot(dx, dz);
  I.dx = l ? dx/l : 0; I.dz = l ? dz/l : 0; I.gait = gait; I.speedCap = Infinity; I.strafe = false; I.knock = false;
  // (as control.js: a sprint in close control is a little under your sprint, from Dribbling)
  if (me.ctlOn && gait === "sprint"){ const k = Math.min(.97, Math.max(.8, .85 + .1*((me.at.dribbling || 50) - 50)/40)); I.speedCap = k*me.prm.sprint; }
  I.face = I.face || {x: 0, z: 0}; I.face.x = -Math.sin(me.m.yaw); I.face.z = -Math.cos(me.m.yaw);
}
const steps = (ms, me, n, way, gait) => { for (let k = 0; k < n; k++){ const w = way(k*H, me); intent(me, w.x, w.z, gait); simStep(ms, H); } };

/* ---------- F takes it ---------- */
{
  // rolling to you: 5 m out at 4 m/s, F pressed as it comes
  const a = go({along: 5, roll: -4, loose: true});
  a.me.takeT = a.ms.t; steps(a.ms, a.me, 90, () => ({x: 0, z: 0}), "jog");
  // a loose ball 4 m ahead: jog to it with F pressed on the way
  const b = go({along: 4, loose: true});
  steps(b.ms, b.me, 20, (t, me) => fwdOf(me), "jog"); b.me.takeT = b.ms.t; steps(b.ms, b.me, 60, (t, me) => fwdOf(me), "jog");
  // sprinting at a loose ball 8 m ahead, F pressed 2 m out
  const c = go({along: 8, loose: true});
  let pressed = false;
  for (let k = 0; k < 150 && !c.me.ctlOn; k++){ const d = Math.hypot(c.ms.ball.p.x - c.me.m.x, c.ms.ball.p.z - c.me.m.z); if (!pressed && d < 2.2){ c.me.takeT = c.ms.t; pressed = true; } const f = fwdOf(c.me); intent(c.me, f.x, f.z, "sprint"); simStep(c.ms, H); }
  const st = x => ({ctlOn: !!x.me.ctlOn, mine: x.ms.poss.ctl === x.me.id, d: r2(Math.hypot(x.ms.ball.p.x - x.me.m.x, x.ms.ball.p.z - x.me.m.z))});
  check(a.me.ctlOn && a.ms.poss.ctl === a.me.id, "F takes a ball rolling to you into close control", st(a));
  check(b.me.ctlOn && b.ms.poss.ctl === b.me.id, "F takes a loose ball you run to first", st(b));
  check(c.me.ctlOn && c.ms.poss.ctl === c.me.id && c.me.m.speed > 5, "F takes a loose ball you reach sprinting", {...st(c), speed: r2(c.me.m.speed)});
}

/* ---------- in close control it follows you ---------- */
const ways = {
  forward: (t, me) => fwdOf(me),
  sideways: (t, me) => { const f = fwdOf(me); return {x: -f.z, z: f.x}; },
  backwards: (t, me) => { const f = fwdOf(me); return {x: -f.x, z: -f.z}; },
  "a turn back": (t, me) => { const f = fwdOf(me); return t < 1.4 ? f : {x: -f.x, z: -f.z}; },
  "a circle": t => ({x: Math.cos(t*1.6), z: Math.sin(t*1.6)})
};
const inCtl = (way, gait) => {
  const {ms, me} = go();
  me.takeT = ms.t;
  let worst = 0, lost = 0, off = 0, vmax = 0;
  for (let k = 0; k < 180; k++){
    const w = way(k*H, me); intent(me, w.x, w.z, gait); simStep(ms, H);
    if (k > 20){ worst = Math.max(worst, Math.hypot(ms.ball.p.x - me.m.x, ms.ball.p.z - me.m.z)); if (ms.poss.ctl !== me.id) lost++; if (!me.ctlOn) off++; vmax = Math.max(vmax, me.m.speed); }
  }
  return {worst: r2(worst), lost, off, vmax: r2(vmax), sprint: r2(me.prm.sprint), end: me.ctlEnd || null};
};
for (const gait of ["walk", "jog", "sprint"]){
  const bad = [];
  for (const [name, way] of Object.entries(ways)){
    // (backwards is a backpedal at any gait: not a sprint)
    const r = inCtl(way, gait);
    if (!(r.worst <= (gait === "sprint" ? RUN_MAX : CTL_MAX) && r.lost === 0 && r.off === 0)) bad.push({name, ...r});
  }
  check(!bad.length, `in close control, ${gait}: forward, sideways, backwards, a turn back and a circle, the ball within ${gait === "sprint" ? RUN_MAX : CTL_MAX} m and yours for 3 s each`, bad);
}
{
  const r = inCtl(ways.forward, "sprint");
  check(r.vmax > .8*r.sprint && r.vmax < .98*r.sprint, "a sprint in close control is a little under your sprint (85 to 95% from Dribbling)", r);
}

/* ---------- a turn's touch: which side of the ball, which part of the strong foot ---------- */
for (const foot of ["R", "L"]){
  const turnTouch = sign => {
    const {ms, me} = go({foot});
    me.takeT = ms.t;
    steps(ms, me, 60, (t, m) => fwdOf(m), "jog");
    const f = fwdOf(me), side = {x: -f.z*sign, z: f.x*sign};   // sign 1: the right of the way (-fz, fx)
    const n0 = ms.events.length;
    steps(ms, me, 40, () => side, "jog");
    const e = ms.events.slice(n0).find(x => x.kind === "touch" && x.keep && x.ballSide !== "back");
    return e ? {ballSide: e.ballSide, part: e.part, foot: e.foot} : null;
  };
  const L = turnTouch(-1), R = turnTouch(1);
  const want = foot === "R" ? {L: {ballSide: "right", part: "inside"}, R: {ballSide: "left", part: "outside"}} : {L: {ballSide: "right", part: "outside"}, R: {ballSide: "left", part: "inside"}};
  check(L && R && L.foot === foot && R.foot === foot && L.ballSide === want.L.ballSide && L.part === want.L.part && R.ballSide === want.R.ballSide && R.part === want.R.part,
    `strong foot ${foot}: turning left plays the ball's right side (the ${want.L.part}), turning right its left side (the ${want.R.part})`, {left: L, right: R});
}

/* ---------- the ends ---------- */
{
  const ends = {};
  // a pass and a shot (a kick begun)
  for (const kind of ["pass", "shot"]){
    const {ms, me} = go(); me.takeT = ms.t; steps(ms, me, 40, (t, m) => fwdOf(m), "jog");
    const f = fwdOf(me);
    startKick(ms, me, {kind, target: {x: me.m.x + f.x*20, y: kind === "shot" ? 1 : .11, z: me.m.z + f.z*20}, power: .7, speed: 14});
    steps(ms, me, 30, (t, m) => fwdOf(m), "jog");
    ends[kind] = {ctlOn: !!me.ctlOn, end: me.ctlEnd};
  }
  // Shift twice
  { const {ms, me} = go(); me.takeT = ms.t; steps(ms, me, 40, (t, m) => fwdOf(m), "jog"); const f = fwdOf(me); intent(me, f.x, f.z, "sprint"); me.intent.knock = true; simStep(ms, H); steps(ms, me, 20, (t, m) => fwdOf(m), "sprint"); ends.knock = {ctlOn: !!me.ctlOn, end: me.ctlEnd}; }
  // an opponent takes it (a tackle won, a poke)
  { const {ms, me} = go(); me.takeT = ms.t; steps(ms, me, 40, (t, m) => fwdOf(m), "jog"); const opp = ms.agents.find(o => o.team !== me.team && o.role === "player" && o.onPitch); setCtl(ms, opp); steps(ms, me, 5, (t, m) => fwdOf(m), "jog"); ends.lost = {ctlOn: !!me.ctlOn, end: me.ctlEnd}; }
  check(!ends.pass.ctlOn && !ends.shot.ctlOn && !ends.knock.ctlOn && ends.knock.end === "knock" && !ends.lost.ctlOn && ends.lost.end === "lost",
    "close control ends on a pass, a shot, Shift twice and the ball taken by an opponent", ends);
}

/* ---------- F again: only within reach ---------- */
{
  const {ms, me} = go({along: 3, loose: true});
  me.takeT = ms.t; steps(ms, me, 30, () => ({x: 0, z: 0}), "jog");
  const far = !!me.ctlOn;
  me.takeT = ms.t; steps(ms, me, 50, (t, m) => fwdOf(m), "jog");
  check(!far && me.ctlOn, `F with the ball 3 m off takes nothing standing; walking up to it (within ${TAKE.REACH} m) it is taken`, {far, after: !!me.ctlOn});
}
done();
