// qa/u28-flick.mjs: U28 part G as U29 has it, the flick (the wheel's button), on the simulation a drill plays on: the
// action control.js flick queues ({kind: "flick", p, fwd, side, first}).
//   - each of the eight ways and none lifts the ball the right way from the facing (none: a keepy-up, nearly straight up)
//   - its top by Strength: a full bar 1.5 m at 33, 3 at 55, 4.5 at 99 (within 0.15 m); half a bar half of it; never past
//     what the Strength allows
//   - it comes down 0.75 of its top and 0.5 m on along the way held (within 0.3 m)
//   - no stat moves it off what was asked: the same flick by a poor and a fine Ball Control lands in the same spot
//   - a ball rolling to you, flicked first time (the sombrero), goes up and over a man in front of you
//   - a flick from close control ends it
//
//   node qa/u28-flick.mjs          exits 1 on any failed check
import {simStep} from "../js/life/football/sim.js";
import {FLICK, flickTop} from "../js/life/football/actions.js";
import {setupOf, matchOf, H} from "./tr6-teamlib.mjs";
import {drill} from "../js/life/train/scen-team.js";
import {checker} from "./wpF-lib.mjs";

const {check, done} = checker("u28-flick");
const r2 = v => Math.round(v*100)/100;
const fwdOf = me => ({x: -Math.sin(me.m.yaw), z: -Math.cos(me.m.yaw)});

function go(o = {}){
  const {setup, spec} = setupOf(drill("att-carrier"), o.seed || 3);
  const {ms} = matchOf(setup, spec, "train");
  ms.meAI = false;
  const me = ms.agents[ms.me];
  // (everybody else held and moved 30 m off: a held man still challenges for a loose ball in his reach)
  for (const a of ms.agents) if (a !== me){ a.hold = true; a.m.z = a.z0 = me.m.z + 30; a.m.x = a.x0 = me.m.x; }
  if (o.at) Object.assign(me.at, o.at);
  const f = fwdOf(me), along = o.along != null ? o.along : .4;
  ms.ball.p.x = me.m.x + f.x*along; ms.ball.p.z = me.m.z + f.z*along; ms.ball.p.y = .11;
  ms.ball.v.x = f.x*(o.roll || 0); ms.ball.v.z = f.z*(o.roll || 0); ms.ball.v.y = 0;
  ms.poss.ctl = o.loose ? -1 : me.id;
  return {ms, me, f};
}
const still = me => { const I = me.intent; I.dx = 0; I.dz = 0; I.gait = "jog"; I.speedCap = Infinity; I.knock = false; };
// a flick: the ball's launch way (on the facing: along, across), its apex and where it first comes down
function flick(rq, o = {}){
  const {ms, me, f} = go(o);
  me.intent.action = Object.assign({kind: "flick"}, rq);
  let launch = null, apex = 0, land = null, ev = null;
  for (let k = 0; k < 300; k++){
    still(me); simStep(ms, H);
    if (!ev){ ev = ms.events.find(e => e.kind === "touch" && e.how === "flick"); if (ev){ const v = ms.ball.v, l = Math.hypot(v.x, v.z) || 1; launch = {x0: ms.ball.p.x, z0: ms.ball.p.z, along: (v.x*f.x + v.z*f.z)/l, across: (v.x*-f.z + v.z*f.x)/l, vy: v.y, vh: Math.hypot(v.x, v.z)}; } }
    if (ev){ apex = Math.max(apex, ms.ball.p.y); if (!land && k > 2 && ms.ball.p.y < .2 && ms.ball.v.y <= 0){ land = {x: ms.ball.p.x, z: ms.ball.p.z}; } }
  }
  const dist = land && launch ? Math.hypot(land.x - launch.x0, land.z - launch.z0) : null;
  return {ev: ev ? {flick: ev.flick, part: ev.part, scuff: ev.scuff} : null, launch: launch && {along: r2(launch.along), across: r2(launch.across), vy: r2(launch.vy), vh: r2(launch.vh)}, apex: r2(apex), dist: dist != null ? r2(dist) : null, land, f, me};
}
{
  const ways = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]], bad = [];
  for (const [fwd, side] of ways){
    const r = flick({p: .8, fwd, side}, {at: {strength: 80}});
    const l = Math.hypot(fwd, side), wa = fwd/l, wc = side/l;
    if (!r.launch || r.launch.vy <= 0 || r.launch.along*wa + r.launch.across*wc < .85) bad.push({fwd, side, launch: r.launch});
  }
  const k = flick({p: .8, fwd: 0, side: 0}, {at: {strength: 80}});
  check(!bad.length, "each of the eight ways lifts the ball that way from the facing", bad);
  check(k.ev && k.ev.flick === "keepy" && k.launch.vy > 2 && k.launch.vh < 1, "no key: a keepy-up, nearly straight up", k.launch);
}
{
  // its top by Strength, a full bar and half of one; how far on it comes down
  const tops = {}, lands = {}, bad = [];
  for (const st of [99, 55, 33]){
    const r = flick({p: 1, fwd: 1, side: 0}, {at: {strength: st}}), hh = flick({p: .5, fwd: 1, side: 0}, {at: {strength: st}});
    tops[st] = {full: r.apex, half: hh.apex}; lands[st] = r.dist;
    const want = flickTop(st), land = FLICK.D_K*want + FLICK.D_0;
    if (Math.abs(r.apex - want) > .15 || Math.abs(hh.apex - want/2) > .15) bad.push({st, want, got: tops[st]});
    if (Math.abs(r.dist - land) > .3) bad.push({st, land, got: r.dist});
  }
  check(!bad.length && Math.abs(flickTop(99) - 4.5) < 1e-9 && Math.abs(flickTop(55) - 3) < 1e-9 && Math.abs(flickTop(33) - 1.5) < 1e-9,
    "its top by Strength: a full bar 4.5 m at 99, 3 at 55, 1.5 at 33, half a bar half of it; it comes down 0.75 of the top and 0.5 m on", {tops, lands, bad});
  const capped = flick({p: 1, fwd: 1, side: 0}, {at: {strength: 33, ctrl: 99, power: 99}});
  check(capped.apex <= 1.5 + .15, "a full bar at Strength 33 never goes past 1.5 m, whatever the other stats", capped.apex);
}
{
  // no stat moves it off what was asked
  const poor = flick({p: .7, fwd: 1, side: 1}, {seed: 4, at: {strength: 70, ctrl: 25, dribbling: 25, composure: 25}});
  const fine = flick({p: .7, fwd: 1, side: 1}, {seed: 9, at: {strength: 70, ctrl: 95, dribbling: 95, composure: 95}});
  const gap = poor.land && fine.land ? Math.hypot(poor.land.x - fine.land.x, poor.land.z - fine.land.z) : 99;
  check(gap < .05 && Math.abs(poor.apex - fine.apex) < .02, "no stat moves it off what was asked: a poor and a fine Ball Control land it in the same spot", {gap: r2(gap), apex: [poor.apex, fine.apex]});
}
{
  // the sombrero: a ball rolling to you from 4 m at 6 m/s, flicked on first time over a man rushing in, 1.8 m in front
  const {ms, me, f} = go({along: 4, roll: -6, loose: true, at: {strength: 90}});
  me.intent.action = {kind: "flick", p: 1, fwd: 1, side: 0, first: true};
  let ev = null, overAt = null;
  const man = {x: me.m.x + f.x*1.8, z: me.m.z + f.z*1.8};
  for (let k = 0; k < 200; k++){
    still(me); simStep(ms, H);
    if (!ev) ev = ms.events.find(e => e.kind === "touch" && e.how === "flick");
    if (ev && overAt == null && (ms.ball.p.x - man.x)*f.x + (ms.ball.p.z - man.z)*f.z >= 0) overAt = r2(ms.ball.p.y);
  }
  check(ev && ev.flick === "sombrero" && overAt != null && overAt > 1.9, "a ball rolling to you, flicked first time, goes up and over a man in front of you (over 1.9 m as it passes him)", {flick: ev && ev.flick, heightOverHim: overAt});
}
{
  const {ms, me} = go();
  // ((BCS) close control is automatic: your controls on (intent.ctlAuto) and the ball at your feet take it)
  const on = () => { still(me); me.intent.ctlAuto = true; };
  for (let k = 0; k < 20; k++){ on(); simStep(ms, H); }
  const on0 = !!me.ctlOn;
  me.intent.action = {kind: "flick", p: .5, fwd: 1, side: 0};
  for (let k = 0; k < 30; k++){ on(); simStep(ms, H); }
  check(on0 && !me.ctlOn && me.ctlEnd === "flick", "a flick from close control ends it", {before: on0, after: !!me.ctlOn, end: me.ctlEnd});
}
done();
