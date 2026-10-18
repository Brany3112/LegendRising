// qa/u28-shot.mjs: U28 part E, the shot shaped by the keys and the fake, on the simulation a drill plays on. The shot's
// request is built as control.js strike builds it from the keys held at the release (A or D: bend that way, by
// Curve skill; W with it: half the bend, as hard as a straight shot); the fake is the action control.js queues for S.
//   - A sends the ball out to the left and it bends back to the right (its path bows out to the left of the straight
//     line, seen from behind it); D out to the right and back
//   - W+A curls less than A and goes faster
//   - by the Curve skill: 55 about half of 99's, 33 about half of 55's (how far out from the line to the target it goes)
//   - the fake (S pressed while the shot is held): no kick, the ball still at your feet and yours; a key just after it
//     plays it: A back to your left, D back to your right, S straight back, W on a little
//   - a quicker player (Agility) plays it sooner; a better Ball Control drags it nearer where it was meant to go
//
//   node qa/u28-shot.mjs          exits 1 on any failed check
import {simStep} from "../js/life/football/sim.js";
import {startAction, FAKE} from "../js/life/football/actions.js";
import {curlSpin, SHOT_KEYS} from "../js/life/football/control.js";
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
  const cv = +me.at.curve || 0, amt = curlSpin(cv)/(18 + .25*Math.min(99, Math.max(0, cv)))*(w ? .5 : 1);
  const tgt = {x: me.m.x + f.x*25, y: 1, z: me.m.z + f.z*25};
  const rq = {kind: "shot", target: tgt, recv: -1, power: o.power || .8, contact: 0, finesse: !!kc, atGoal: false, shape: "test"};
  if (w && kc) rq.drive = true;
  if (kc) rq.bend = -kc*amt;
  me.intent.action = rq;
  let v0 = 0, kicked = false;
  const path = [];
  // (the bend of its path: the largest sideways bulge off its own chord, from where it was struck to where it had got to
  // by 18 m, + to the right of the way it went. Against the line to the target the aim's own error would be in it too)
  for (let k = 0; k < 120; k++){
    still(me); simStep(ms, H);
    const e = ms.events.find(x => x.kind === "kick" && x.agent === me.id);
    if (e && !kicked){ kicked = true; v0 = Math.hypot(ms.ball.v.x, ms.ball.v.y, ms.ball.v.z); }
    if (kicked) path.push({x: ms.ball.p.x, y: ms.ball.p.y, z: ms.ball.p.z});
  }
  const p0 = path[0];
  // (to where it has gone o.far m, or to its first bounce if that is sooner: a bounce turns it)
  let end = path.findIndex((q, i) => Math.hypot(q.x - p0.x, q.z - p0.z) >= (o.far || 18) || (i > 3 && q.y < .25)); if (end < 0) end = path.length - 1;
  const p1 = path[end], lx = p1.x - p0.x, lz = p1.z - p0.z, l = Math.hypot(lx, lz) || 1, ux = lx/l, uz = lz/l;
  let drift = 0;
  for (let i = 0; i <= end; i++){ const dr = (path[i].x - p0.x)*-uz + (path[i].z - p0.z)*ux; if (Math.abs(dr) > Math.abs(drift)) drift = dr; }
  const along = l;
  // (how far out from the line to the target it goes, + to the right, up to 16 m, short of the drill's fence: what you see of the curl)
  let out = 0;
  for (const q of path){ if (Math.hypot(q.x - p0.x, q.z - p0.z) > 16) break; const d = (q.x - p0.x)*-f.z + (q.z - p0.z)*f.x; if (Math.abs(d) > Math.abs(out)) out = d; }
  return {drift: r2(drift), out: r2(out), along: r2(along), v0: r2(v0), kicked};
}
{
  const A = shoot(-1, false), D = shoot(1, false), N = shoot(0, false), WA = shoot(-1, true);
  check(A.kicked && D.kicked && A.drift < -.15 && D.drift > .15 && Math.abs(N.drift) < .1,
    "A: the ball's path bows out to the left and comes back (it bends right); D: out to the right and back (more than a straight strike's)", {A, D, none: N});
  check(Math.abs(WA.drift) < Math.abs(A.drift) && WA.v0 > A.v0, "W+A curls less than A and goes faster", {A, WA});
  const Af = shoot(-1, false, {}, {power: 1}), WAf = shoot(-1, true, {}, {power: 1}), Nf = shoot(0, false, {}, {power: 1});
  check(WAf.v0 > Af.v0*1.05 && Math.abs(WAf.v0 - Nf.v0) < .03*Nf.v0, "at a full charge too, W+A goes faster than A, as hard as a straight shot", {A: Af.v0, WA: WAf.v0, straight: Nf.v0});
  const sure = cv => ({curve: cv, accuracy: 99, composure: 99});
  const c33 = shoot(1, false, sure(33)), c55 = shoot(1, false, sure(55)), c99 = shoot(1, false, sure(99));
  const r55 = c55.out/c99.out, r33 = c33.out/c55.out;
  check(c99.out > 1.4 && r55 > .4 && r55 < .62 && r33 > .38 && r33 < .62,
    "by the Curve skill, D's shot out to the right of the line to the target: 99 a lot (over 1.4 m), 55 about half of it, 33 about half of 55's", {c33: c33.out, c55: c55.out, c99: c99.out, r55: r2(r55), r33: r2(r33)});
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
