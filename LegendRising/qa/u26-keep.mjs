// qa/u26-keep.mjs: USER-ISSUES U26, the ball at your feet (since U27 close control; since BCS automatic) and the knock-on
// (Shift tapped twice), on the
// simulation a drill plays on (scen-team.js matchOf), the player's intents set as control.js sets them.
//   - in close control (automatic, BCS), the ball yours: jogging forward, sideways, backwards, turning back on yourself and standing still, the
//     ball stays within KEEP_MAX m of you and stays yours, each for 3 s
//   - standing still, it comes to rest in front of you
//   - R held ("In behind!"): the spot asked for is ahead of your run up the pitch, within 35 degrees of straight at
//     their goal line, inside the touchlines and the goal line: never sideways or out of play
//   - Shift tapped twice: it is knocked on, at least 3 m ahead of you sprinting along your way, and you run onto it
//
//   node qa/u26-keep.mjs          exits 1 on any failed check
import {simStep} from "../js/life/football/sim.js";
import {setupOf, matchOf, H} from "./tr6-teamlib.mjs";
import {drill} from "../js/life/train/scen-team.js";
import {checker} from "./wpF-lib.mjs";
import {runPoint, RUN_PT} from "../js/life/football/control.js";

const {check, done} = checker("u26-keep");
const KEEP_MAX = 0.95;
const r2 = v => Math.round(v*100)/100;

// a fresh go of the carrier drill: you with the ball, everyone else held where they stand
function go(seed = 3){
  const {setup, spec} = setupOf(drill("att-carrier"), seed);
  const {ms} = matchOf(setup, spec, "train");
  ms.meAI = false;
  const me = ms.agents[ms.me];
  for (const a of ms.agents) if (a !== me){ a.hold = true; }
  // the ball at your feet to begin with, yours
  const f = {x: -Math.sin(me.m.yaw), z: -Math.cos(me.m.yaw)};
  ms.ball.p.x = me.m.x + f.x*.35; ms.ball.p.z = me.m.z + f.z*.35; ms.ball.p.y = .11; ms.ball.v.x = ms.ball.v.y = ms.ball.v.z = 0;
  return {ms, me};
}
// the player's intent for a step: a way (dx, dz) or none, a gait, whether close control is on (automatic since BCS), the knock
function intent(me, dx, dz, gait, keep, knock = false){
  const I = me.intent, l = Math.hypot(dx, dz);
  // ((BCS) close control is automatic: control.js sets intent.ctlAuto every step your controls run, and keepStep takes
  // the ball you are first to into it; the keep flag is kept as the old F was, the controls on throughout)
  I.ctlAuto = true; void keep;
  I.dx = l ? dx/l : 0; I.dz = l ? dz/l : 0; I.gait = gait; I.knock = knock; I.speedCap = Infinity; I.strafe = false;
  I.face = I.face || {x: 0, z: 0}; I.face.x = -Math.sin(me.m.yaw); I.face.z = -Math.cos(me.m.yaw);
  if (me.drib || l){ const d = me.drib || (me.drib = {dx: 0, dz: 0, gait, speed: 3, t: 0, commit: 0, small: false, start: false}); d.dx = I.dx; d.dz = I.dz; d.gait = gait; d.close = gait === "sprint" ? 0 : 1; if (!l) me.drib = null; }
}
function run(way, secs, gait, keep){
  const {ms, me} = go();
  let worst = 0, lost = 0, n = 0;
  for (let k = 0; k < secs*60; k++){
    const w = way(k*H, me);
    intent(me, w.x, w.z, gait, keep);
    simStep(ms, H);
    const d = Math.hypot(ms.ball.p.x - me.m.x, ms.ball.p.z - me.m.z);
    if (k > 20){ worst = Math.max(worst, d); n++; if (ms.poss.ctl !== me.id) lost++; }
  }
  return {worst: r2(worst), lost, n, end: r2(Math.hypot(ms.ball.p.x - me.m.x, ms.ball.p.z - me.m.z)), v: r2(Math.hypot(ms.ball.v.x, ms.ball.v.z)), speed: r2(me.m.speed), ms, me};
}
const fwdOf = me => ({x: -Math.sin(me.m.yaw), z: -Math.cos(me.m.yaw)});
const ways = {
  forward: (t, me) => fwdOf(me),
  sideways: (t, me) => { const f = fwdOf(me); return {x: -f.z, z: f.x}; },
  backwards: (t, me) => { const f = fwdOf(me); return {x: -f.x, z: -f.z}; },
  "turning back": (t, me) => { const f = fwdOf(me); return t < 1.4 ? f : {x: -f.x, z: -f.z}; },
  "a circle": t => ({x: Math.cos(t*1.6), z: Math.sin(t*1.6)})
};
for (const [name, way] of Object.entries(ways)){
  const r = run(way, 3, "jog", true);
  check(r.worst <= KEEP_MAX && r.lost === 0, `In close control (automatic), jogging ${name}: the ball within ${KEEP_MAX} m of you and yours for 3 s`, {worst: r.worst, lost: r.lost, speed: r.speed});
}
{
  const r = run(() => ({x: 0, z: 0}), 3, "jog", true);
  check(r.worst <= KEEP_MAX && r.lost === 0 && r.end <= .6 && r.v < .3, "In close control (automatic), standing still: the ball comes to rest in front of you, yours", {worst: r.worst, end: r.end, v: r.v});
}
{
  const {ms, me} = go();
  const f = fwdOf(me);
  for (let k = 0; k < 30; k++){ intent(me, f.x, f.z, "jog", true); simStep(ms, H); }
  const x0 = me.m.x, z0 = me.m.z;
  intent(me, f.x, f.z, "sprint", false, true); simStep(ms, H);
  let ahead = 0, caught = -1;
  for (let k = 0; k < 240; k++){
    intent(me, f.x, f.z, "sprint", false); simStep(ms, H);
    const along = (ms.ball.p.x - x0)*f.x + (ms.ball.p.z - z0)*f.z;
    ahead = Math.max(ahead, along - ((me.m.x - x0)*f.x + (me.m.z - z0)*f.z));
    if (caught < 0 && k > 30 && Math.hypot(ms.ball.p.x - me.m.x, ms.ball.p.z - me.m.z) < .8) caught = r2(k*H);
  }
  const knocks = ms.events.filter(e => e.kind === "touch" && e.knock).length;
  check(knocks === 1 && ahead >= 3 && caught > 0, "Shift tapped twice: the ball knocked on ahead of you along your way, and you run onto it", {knocks, ahead: r2(ahead), caughtAfter: caught});
}
{
  // R held: where "In behind!" asks for it
  const {ms, me} = go();
  const dir = ms.dirs[me.team], hx = ms.spec.hx, hz = ms.spec.hz, P = {x: 0, z: 0};
  const at = (x, z, vx, vz) => { me.m.x = x; me.m.z = z; me.m.vx = vx; me.m.vz = vz; runPoint(ms, me, P); const dx = P.x - x, dz = P.z - z; return {x: r2(P.x), z: r2(P.z), ang: r2(Math.atan2(Math.abs(dz), dx*dir)*180/Math.PI), ahead: r2(dx*dir)}; };
  const diag = at(0, hz - 6, dir*5, 5), back = at(0, 0, -dir*4, 0), stand = at(-dir*10, 3, 0, 0), wide = at(0, -hz + 1, dir*2, -6), near = at(dir*(hx - 5), 0, dir*7, 0);
  const inside = p => Math.abs(p.x) <= hx - RUN_PT.EDGE + 1e-6 && Math.abs(p.z) <= hz - RUN_PT.EDGE + 1e-6;
  check(diag.ang <= 35.01 && diag.ahead > 6 && inside(diag) && back.ang < .01 && back.ahead >= RUN_PT.MIN && stand.ang < .01 && wide.ahead > 0 && inside(wide) && inside(near) && near.ahead > 0,
    "R held: the spot asked for is ahead of your run up the pitch (35 degrees at most off straight at their goal line), inside the touchlines and the goal line", {diag, back, stand, wide, near});
}
done();
