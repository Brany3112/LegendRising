// qa/u28-shot.mjs: U28 part E, the shot shaped by the keys and the fake, on the simulation a drill plays on. The shot's
// request is built as control.js strike builds it from the keys held at the release (A or D: bend that way, by
// Technique; W with it: half the bend, SHOT_KEYS.POWER more power); the fake is the action control.js queues for S.
//   - A and D curl the ball opposite ways (its path's sideways bulge off the straight line, seen from behind it)
//   - W+A curls less than A and goes faster
//   - a better Technique curls more
//   - the fake (S pressed while the shot is held): no kick, the ball still at your feet and yours; a key just after it
//     plays it: A back to your left, D back to your right, S straight back, W on a little
//   - a quicker player (Agility) plays it sooner; a better Ball Control drags it nearer where it was meant to go
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
function shoot(kc, w, at = {}, o = {}){
  const {ms, me, f} = go({at});
  const tech = techniqueOf(me.at), amt = (.35 + .65*Math.min(1.1, Math.max(0, tech/99)))*(w ? .5 : 1);
  const tgt = {x: me.m.x + f.x*25, y: 1, z: me.m.z + f.z*25};
  const rq = {kind: "shot", target: tgt, recv: -1, power: o.power || .8, contact: 0, finesse: !!kc, atGoal: false, shape: "test"};
  if (w && kc) rq.drive = SHOT_KEYS.POWER;
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
  const Af = shoot(-1, false, {}, {power: 1}), WAf = shoot(-1, true, {}, {power: 1}), Nf = shoot(0, false, {}, {power: 1});
  check(WAf.v0 > Af.v0*1.05, "at a full charge too, W+A goes faster than A", {A: Af.v0, WA: WAf.v0, straight: Nf.v0});
  const lo = shoot(1, false, {curve: 30, aero: 30, ctrl: 30}), hi = shoot(1, false, {curve: 95, aero: 95, ctrl: 95});
  check(Math.abs(hi.drift) > Math.abs(lo.drift), "a better Technique curls it more", {lo, hi});
}
// the fake (S pressed while the shot is held: control.js queues {kind: "fake"}; a key pressed just after sets act.dir)
function fake(dir, at = {}, seed){
  const {ms, me, f} = go({at, seed});
  const b0 = {x: ms.ball.p.x, z: ms.ball.p.z}, m0 = {x: me.m.x, z: me.m.z};
  me.intent.action = {kind: "fake"};
  let touchT = null, t0 = null;
  for (let k = 0; k < 90; k++){
    still(me); simStep(ms, H);
    if (me.act && me.act.kind === "fake" && t0 == null){ t0 = ms.t; if (dir){ me.act.dir = dir; me.act.dirT = me.act.t; } }
    if (touchT == null && ms.events.some(e => e.kind === "touch" && e.fake)) touchT = ms.t - t0;
  }
  const kicks = ms.events.filter(e => e.kind === "kick" && e.agent === me.id).length;
  const rx = -f.z, rz = f.x, dx = ms.ball.p.x - m0.x, dz = ms.ball.p.z - m0.z;
  return {side: r2(dx*rx + dz*rz), fwd: r2(dx*f.x + dz*f.z), back0: r2((b0.x - m0.x)*f.x + (b0.z - m0.z)*f.z), dist: r2(Math.hypot(ms.ball.p.x - me.m.x, ms.ball.p.z - me.m.z)), mine: ms.poss.ctl === me.id, kicks,
    touchT: touchT != null ? r2(touchT) : null, touches: ms.events.filter(e => e.kind === "touch" && e.fake).map(e => e.fake), me, f, ms};
}
{
  const S = fake(null), A = fake("a"), D = fake("d"), Sb = fake("s"), W = fake("w");
  const pick = r => ({side: r.side, fwd: r.fwd, back0: r.back0, dist: r.dist, mine: r.mine, kicks: r.kicks, touches: r.touches});
  check(S.kicks === 0 && S.mine && S.dist < 1 && !S.touches.length, "S: a fake, no kick, the ball still at your feet and yours, no touch without a key after it", pick(S));
  check(A.side < -.2 && A.fwd < S.fwd && D.side > .2 && D.fwd < S.fwd && A.mine && D.mine, "then A drags it back to your left, D to your right", {A: pick(A), D: pick(D)});
  check(Sb.fwd < Sb.back0 - .3 && Math.abs(Sb.side) < .25 && Sb.mine, "then S drags it straight back behind where it was", pick(Sb));
  check(W.fwd > W.back0 + .3 && W.mine && W.kicks === 0, "then W pushes it on a little", pick(W));
  const slow = fake("d", {agility: 30}), quick = fake("d", {agility: 95});
  check(quick.touchT < slow.touchT, "a quicker player (Agility) plays the drag sooner after the key", {slow: slow.touchT, quick: quick.touchT});
  // (Ball Control: the drag's miss over several seeds from where it was meant to go)
  const miss = ctrl => { let s = 0; for (let seed = 1; seed <= 12; seed++){ const r = fake("d", {ctrl}, seed), c = Math.min(1, ctrl/110), me = r.me, f = r.f;
    const want = {x: me.m.x - f.x*FAKE.BACK - f.z*(FAKE.DRAG + FAKE.CTRL*c), z: me.m.z - f.z*FAKE.BACK + f.x*(FAKE.DRAG + FAKE.CTRL*c)}; s += Math.hypot(r.ms.ball.p.x - want.x, r.ms.ball.p.z - want.z); } return s/12; };
  const mLo = miss(30), mHi = miss(95);
  check(mHi < mLo, "a better Ball Control drags it nearer where it was meant to go", {ctrl30: r2(mLo), ctrl95: r2(mHi)});
}
done();
