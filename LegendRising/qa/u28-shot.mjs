// qa/u28-shot.mjs: U28 part E, the shot shaped by the keys and the fake, on the simulation a drill plays on. The shot's
// request is built as control.js strike builds it from the keys held at the release (A or D: bend that way, by
// Technique; W with it: half the bend, SHOT_KEYS.POWER more power); the fake is the action control.js queues for S.
//   - A and D curl the ball opposite ways (its path's sideways bulge off the straight line, seen from behind it)
//   - W+A curls less than A and goes faster
//   - a better Technique curls more
//   - S: a fake, no kick, the ball still at your feet and yours
//   - S+A drags it back to your left, S+D to your right, S+W nudges it on and drags it back behind where it was
//   - a quicker player (Agility) fakes quicker; a better Ball Control drags it nearer where it was meant to go
//
//   node qa/u28-shot.mjs          exits 1 on any failed check
import {simStep} from "../js/life/football/sim.js";
import {startAction, FAKE} from "../js/life/football/actions.js";
import {techniqueOf, SHOT_KEYS} from "../js/life/football/control.js";
import {setupOf, matchOf, H} from "./tr6-teamlib.mjs";
import {drill} from "../js/life/train/scen-team.js";
import {checker} from "./wpF-lib.mjs";

const {check, done} = checker("u28-shot");
const r2 = v => Math.round(v*100)/100;
const fwdOf = me => ({x: -Math.sin(me.m.yaw), z: -Math.cos(me.m.yaw)});

function go(o = {}){
  const {setup, spec} = setupOf(drill("att-carrier"), o.seed || 3);
  const {ms} = matchOf(setup, spec, "train");
  ms.meAI = false;
  const me = ms.agents[ms.me];
  for (const a of ms.agents) if (a !== me) a.hold = true;
  if (o.at) Object.assign(me.at, o.at);
  const f = fwdOf(me);
  ms.ball.p.x = me.m.x + f.x*.4; ms.ball.p.z = me.m.z + f.z*.4; ms.ball.p.y = .11; ms.ball.v.x = ms.ball.v.y = ms.ball.v.z = 0;
  ms.poss.ctl = me.id;
  return {ms, me, f};
}
const still = me => { const I = me.intent; I.dx = 0; I.dz = 0; I.gait = "jog"; I.speedCap = Infinity; I.knock = false; };
// the shot as strike builds it from the keys: kc -1 (A), 0, +1 (D); w: W held with it
function shoot(kc, w, at = {}){
  const {ms, me, f} = go({at});
  const tech = techniqueOf(me.at), amt = (.35 + .65*Math.min(1.1, Math.max(0, tech/99)))*(w ? .5 : 1);
  const tgt = {x: me.m.x + f.x*25, y: 1, z: me.m.z + f.z*25};
  const rq = {kind: "shot", target: tgt, recv: -1, power: Math.min(1, .8*(w && kc ? SHOT_KEYS.POWER : 1)), contact: 0, finesse: !!kc, atGoal: false, shape: "test"};
  if (kc) rq.bend = kc*amt;
  me.intent.action = rq;
  let v0 = 0, kicked = false;
  const path = [];
  // (the bend of its path: the largest sideways bulge off its own chord, from where it was struck to where it had got to
  // by 18 m, + to the right of the way it went. Against the line to the target the aim's own error would be in it too)
  for (let k = 0; k < 120; k++){
    still(me); simStep(ms, H);
    const e = ms.events.find(x => x.kind === "kick" && x.agent === me.id);
    if (e && !kicked){ kicked = true; v0 = Math.hypot(ms.ball.v.x, ms.ball.v.y, ms.ball.v.z); }
    if (kicked) path.push({x: ms.ball.p.x, z: ms.ball.p.z});
  }
  const p0 = path[0];
  let end = path.findIndex(q => Math.hypot(q.x - p0.x, q.z - p0.z) >= 18); if (end < 0) end = path.length - 1;
  const p1 = path[end], lx = p1.x - p0.x, lz = p1.z - p0.z, l = Math.hypot(lx, lz) || 1, ux = lx/l, uz = lz/l;
  let drift = 0;
  for (let i = 0; i <= end; i++){ const dr = (path[i].x - p0.x)*-uz + (path[i].z - p0.z)*ux; if (Math.abs(dr) > Math.abs(drift)) drift = dr; }
  const along = l;
  return {drift: r2(drift), along: r2(along), v0: r2(v0), kicked};
}
{
  const A = shoot(-1, false), D = shoot(1, false), N = shoot(0, false), WA = shoot(-1, true);
  check(A.kicked && D.kicked && Math.sign(A.drift) !== Math.sign(D.drift) && Math.abs(A.drift) > Math.abs(N.drift) + .15 && Math.abs(D.drift) > Math.abs(N.drift) + .15,
    "A and D bend the ball's path opposite ways (more than a straight strike's)", {A, D, none: N});
  check(Math.abs(WA.drift) < Math.abs(A.drift) && WA.v0 > A.v0, "W+A curls less than A and goes faster", {A, WA});
  const lo = shoot(1, false, {curve: 30, aero: 30, ctrl: 30}), hi = shoot(1, false, {curve: 95, aero: 95, ctrl: 95});
  check(Math.abs(hi.drift) > Math.abs(lo.drift), "a better Technique curls it more", {lo, hi});
}
// the fake
function fake(rq, at = {}){
  const {ms, me, f} = go({at});
  const b0 = {x: ms.ball.p.x, z: ms.ball.p.z}, m0 = {x: me.m.x, z: me.m.z};
  me.intent.action = Object.assign({kind: "fake"}, rq);
  let dur = null, kicks = 0;
  for (let k = 0; k < 90; k++){
    still(me); simStep(ms, H);
    if (dur == null && me.act && me.act.kind === "fake") dur = me.act.dur;
  }
  kicks = ms.events.filter(e => e.kind === "kick" && e.agent === me.id).length;
  const rx = -f.z, rz = f.x, dx = ms.ball.p.x - m0.x, dz = ms.ball.p.z - m0.z;
  return {side: r2(dx*rx + dz*rz), fwd: r2(dx*f.x + dz*f.z), back0: r2((b0.x - m0.x)*f.x + (b0.z - m0.z)*f.z), dist: r2(Math.hypot(ms.ball.p.x - me.m.x, ms.ball.p.z - me.m.z)), mine: ms.poss.ctl === me.id, kicks, dur: dur != null ? r2(dur) : null,
    touches: ms.events.filter(e => e.kind === "touch" && e.fake).map(e => e.fake)};
}
{
  const S = fake({drag: 0}), SA = fake({drag: -1}), SD = fake({drag: 1}), SW = fake({nudge: true});
  check(S.kicks === 0 && S.mine && S.dist < 1, "S: a fake, no kick, the ball still at your feet and yours", S);
  check(SA.side < -.2 && SA.fwd < S.fwd && SD.side > .2 && SD.fwd < S.fwd && SA.mine && SD.mine, "S+A drags it back to your left, S+D to your right", {SA, SD});
  check(SW.touches.join() === "nudge,drag back" && SW.fwd < SW.back0 && SW.mine, "S+W nudges it on, then drags it back behind where it was", SW);
  const slow = fake({drag: 1}, {agility: 30}), quick = fake({drag: 1}, {agility: 95});
  check(quick.dur < slow.dur, "a quicker player (Agility) fakes quicker", {slow: slow.dur, quick: quick.dur});
  // (Ball Control: the drag's error over several seeds, the mean miss from where it was meant to go)
  const miss = ctrl => { let s = 0; for (let seed = 1; seed <= 12; seed++){ const r = (() => { const {ms, me, f} = go({seed, at: {ctrl}}); me.intent.action = {kind: "fake", drag: 1}; for (let k = 0; k < 90; k++){ still(me); simStep(ms, H); } const c = Math.min(1, ctrl/110), want = {x: me.m.x - f.x*FAKE.BACK - f.z*(FAKE.DRAG + FAKE.CTRL*c), z: me.m.z - f.z*FAKE.BACK + f.x*(FAKE.DRAG + FAKE.CTRL*c)}; return Math.hypot(ms.ball.p.x - want.x, ms.ball.p.z - want.z); })(); s += r; } return s/12; };
  const mLo = miss(30), mHi = miss(95);
  check(mHi < mLo, "a better Ball Control drags it nearer where it was meant to go", {ctrl30: r2(mLo), ctrl95: r2(mHi)});
}
done();
