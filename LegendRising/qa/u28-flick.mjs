// qa/u28-flick.mjs: U28 part G, the flick and the chip (the wheel's button), on the simulation a drill plays on: the
// action control.js flick queues ({kind: "flick", p, fwd, side, first}).
//   - each of the eight ways and none lifts the ball the right way from the facing (none: a keepy-up, nearly straight up)
//   - a light flick pops it low and short, a full one high and long
//   - over many tries a skilled player lands it nearer where it was asked than a poor one
//   - a ball rolling to you, flicked first time (the sombrero), goes up and over a man in front of you
//   - a flick from close control ends it
//
//   node qa/u28-flick.mjs          exits 1 on any failed check
import {simStep} from "../js/life/football/sim.js";
import {FLICK} from "../js/life/football/actions.js";
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
  for (const a of ms.agents) if (a !== me) a.hold = true;
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
  for (let k = 0; k < 240; k++){
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
    const r = flick({p: .5, fwd, side}, {at: {ctrl: 95, dribbling: 95, aero: 95, curve: 95, composure: 95}});
    const l = Math.hypot(fwd, side), wa = fwd/l, wc = side/l;
    if (!r.launch || r.launch.vy <= 0 || r.launch.along*wa + r.launch.across*wc < .85) bad.push({fwd, side, launch: r.launch});
  }
  const k = flick({p: .5, fwd: 0, side: 0}, {at: {ctrl: 95}});
  check(!bad.length, "each of the eight ways lifts the ball that way from the facing", bad);
  check(k.ev && k.ev.flick === "keepy" && k.launch.vy > 2 && k.launch.vh < 1.5, "no key: a keepy-up, nearly straight up", k.launch);
}
{
  const at = {ctrl: 95, dribbling: 95, aero: 95, curve: 95, composure: 95, power: 70};
  const lo = flick({p: .05, fwd: 1, side: 0}, {at}), hi = flick({p: 1, fwd: 1, side: 0}, {at});
  // (FLICK.FAST: it goes 1.4 times quicker over the ground than it did, so a full one tops out over a standing man's head,
  // 1.9 m, not 3 m; the light one just over a sliding leg)
  check(lo.apex < 1.2 && lo.dist < 3.5 && hi.apex > 1.9 && hi.dist > 8 && hi.launch.vh > 9, "a light flick pops it low and short, a full one over a standing man and long, quick over the ground (over 9 m/s)", {lo: {apex: lo.apex, dist: lo.dist}, hi: {apex: hi.apex, dist: hi.dist, vh: hi.launch.vh}});
}
{
  // (the spot asked for: FLICK's distance for the strength, on the facing)
  const missOf = at => { let s = 0, n = 0; for (let seed = 1; seed <= 16; seed++){ const r = flick({p: .6, fwd: 1, side: 0}, {seed, at}); if (!r.land) continue;
    const pw = Math.min(1.1, (r.me.at.power || 50)/99), D = (FLICK.D0 + (FLICK.D1 - FLICK.D0)*.6)*(.85 + .3*pw), want = {x: r.me.m.x + r.f.x*(D + .4), z: r.me.m.z + r.f.z*(D + .4)};
    s += Math.hypot(r.land.x - want.x, r.land.z - want.z); n++; } return n ? s/n : 99; };
  const poor = missOf({ctrl: 25, dribbling: 25, aero: 20, curve: 25, composure: 25}), good = missOf({ctrl: 95, dribbling: 95, aero: 95, curve: 95, composure: 95});
  check(good < poor, "over many tries a skilled player lands it nearer where it was asked than a poor one", {poor: r2(poor), good: r2(good)});
}
{
  // the sombrero: a ball rolling to you from 4 m at 6 m/s, flicked on first time over a man rushing in, 1.8 m in front
  const {ms, me, f} = go({along: 4, roll: -6, loose: true, at: {ctrl: 90, dribbling: 90, aero: 90, curve: 90, composure: 90}});
  me.intent.action = {kind: "flick", p: .55, fwd: 1, side: 0, first: true};
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
  me.takeT = ms.t;
  for (let k = 0; k < 20; k++){ still(me); simStep(ms, H); }
  const on0 = !!me.ctlOn;
  me.intent.action = {kind: "flick", p: .5, fwd: 1, side: 0};
  for (let k = 0; k < 30; k++){ still(me); simStep(ms, H); }
  check(on0 && !me.ctlOn && me.ctlEnd === "flick", "a flick from close control ends it", {before: on0, after: !!me.ctlOn, end: me.ctlEnd});
}
done();
