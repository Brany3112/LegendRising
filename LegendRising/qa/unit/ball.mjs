// qa/unit/ball.mjs: js/life/football/ball.js under plain node.
// Owner: WP-C, contract DESIGN 1.4.10; constants 1.5.1; behaviour 3.1.1 and 3.1.2; acceptance 2.3 WP-C (rest
// distances, bounces, posts and bar, nets, tunnelling, sub-step travel, determinism, firstReach).
//
//   node qa/unit/ball.mjs       exits 1 on any failed check; writes qa/out/unit-ball.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {BALL, BALL_X, createBall, createBallWorld, ballStep, ballKick, ballHold, ballRelease, ballPredict, firstReach,
  ballFlyTo, rollDistance, rollSpeedFor, rollTime, rollSpeedAt} from "../../js/life/football/ball.js";
import {makePitch, yawOf} from "../../js/life/football/pitchspec.js";
import {mulberry32} from "../../js/life/football/rng.js";
import {timeToPoint, moverParams} from "../../js/life/mover.js";
import {FRESH} from "../../js/life/stamina.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const res = {name: "unit-ball", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const r4 = v => Math.round(v*1e4)/1e4;
const DEG = Math.PI/180, H = 1/60, R = BALL.R;
const spec = makePitch();

// run a ball until it rests (or tMax), returning the time
function runToRest(b, bw, tMax = 60){
  let t = 0;
  while (t < tMax){
    ballStep(b, bw, H); t += H;
    if (b.grounded && b.v.x === 0 && b.v.y === 0 && b.v.z === 0) break;
  }
  return t;
}

/* ---------- the contract's shape ---------- */
{
  check(Object.isFrozen(BALL) && BALL.R === 0.11 && BALL.KD === 0.0135 && BALL.KM === 0.0055 && BALL.AMAX === 9 && BALL.VMAX === 40 &&
    BALL.SUB_TRAVEL === 0.12 && BALL.E_POST === 0.6 && BALL.MU_POST === 0.15 && BALL.NET_K === 600 && BALL.NET_C === 25 && BALL.NET_T === 3,
    "BALL constants are the 1.4.10 table");
  const b = createBall();
  const keys = ['p', 'v', 'w', 'dragMul', 'knuck', 'state', 'holder', 'last', 'rollDecel', 'sleep', 'still'];
  check(keys.every(k => k in b) && b.state === 'free' && b.holder === -1 && b.p.y === R && b.rollDecel === 1.1 && b.knuck === null &&
    ['agent', 'team', 'kind', 't', 'x', 'z'].every(k => k in b.last), "createBall has the 1.4.10 shape");
  const bw = createBallWorld({spec, bodies: () => [], hands: () => [], onEvent: () => {}});
  check(bw.caps.filter(c => c.kind === 'post').length === 4 && bw.caps.filter(c => c.kind === 'bar').length === 2 && bw.panels.length === 8,
    "createBallWorld reads 4 posts, 2 bars and 8 net panels from the pitch spec");
}

/* ---------- rest distances (1.5.1 expected) ---------- */
{
  const cases = [[10, 1.10, 27, 32], [15, 1.10, 46, 52], [20, 1.10, 62, 69], [10, 1.40, 23, 27]];
  const bw = createBallWorld({});
  for (const [v, roll, lo, hi] of cases){
    const b = createBall({rollDecel: roll});
    ballKick(b, {x: v, y: 0, z: 0}, null, {});
    runToRest(b, bw);
    const d = b.p.x;
    check(d >= lo && d <= hi, `ground pass at ${v} m/s on roll ${roll.toFixed(2)} rests at ${lo} to ${hi} m`, r4(d));
    check(Math.abs(d - rollDistance(v, 0, roll)) < 0.15, `  and agrees with the closed form ground roll (${r4(rollDistance(v, 0, roll))} m)`, r4(d));
  }
  // the closed forms agree with each other
  const v0 = rollSpeedFor(25, 9, 1.1), tt = rollTime(v0, 25, 1.1);
  check(Math.abs(rollDistance(v0, 9, 1.1) - 25) < 1e-9 && Math.abs(rollSpeedAt(v0, tt, 1.1) - 9) < 1e-6, "rollSpeedFor, rollDistance, rollTime and rollSpeedAt are consistent");
  // the integrator against rollTime
  const b = createBall(); ballKick(b, {x: v0, y: 0, z: 0}, null, {});
  let t = 0; while (b.p.x < 25){ ballStep(b, bw, H); t += H; }
  check(Math.abs(t - tt) < 0.03, "a rolling ball reaches 25 m when rollTime says", {sim: r4(t), closed: r4(tt)});
}

/* ---------- a drop from 2 m: bounce peaks by the restitution model, no hovering ---------- */
{
  const evs = [];
  const bw = createBallWorld({onEvent: (type, d) => { if (type === 'bounce') evs.push(d); }});
  const b = createBall({y: 2.0});
  const peaks = [];
  for (let i = 0; i < 900; i++){
    const vy0 = b.v.y, y0 = b.p.y;
    ballStep(b, bw, H);
    if (vy0 > 0 && b.v.y <= 0) peaks.push(y0 + vy0*vy0/(2*BALL.G) - R);   // the apex inside this step
  }
  const eOf = vy => Math.min(BALL.E_MAX, Math.max(BALL.E_MIN, 0.62 - 0.012*(vy - 4)));
  check(evs.length >= 4, "the dropped ball bounces several times", evs.length);
  check(evs.every(e => Math.abs(e.e - eOf(e.vy)) < 1e-12), "each bounce's restitution is clamp(0.62 - 0.012(|vy| - 4), 0.45, 0.62)", evs.map(e => r4(e.e)));
  let worst = 0;
  for (let i = 1; i < peaks.length; i++){
    const want = eOf(evs[i].vy)**2*peaks[i - 1], dev = Math.abs(peaks[i]/want - 1);
    worst = Math.max(worst, dev);
  }
  check(peaks.length >= 3 && worst <= 0.03, "successive bounce peaks are within 3% of e^2 times the previous", {peaks: peaks.map(r4), worst: r4(worst)});
  check(b.grounded && Math.abs(b.p.y - R) <= 1e-3 && b.v.y === 0 && b.v.x === 0, "the ball comes to rest on the grass, not hovering (y within 1e-3 of 0.11)", r4(b.p.y));
  let maxDev = 0;
  for (let i = 0; i < 120; i++){ ballStep(b, bw, H); maxDev = Math.max(maxDev, Math.abs(b.p.y - R)); }
  check(maxDev <= 1e-3, "and stays there", maxDev);
}

/* ---------- posts and bar: reflection by restitution 0.6 and Coulomb friction 0.15 ---------- */
// the model written out independently: normal restitution, friction impulse capped by mu and by rolling contact
function expectedOut(vIn, n, w = {x: 0, y: 0, z: 0}, e = 0.6, mu = 0.15){
  const vn = vIn.x*n.x + vIn.y*n.y + vIn.z*n.z;
  const out = {x: vIn.x - (1 + e)*vn*n.x, y: vIn.y - (1 + e)*vn*n.y, z: vIn.z - (1 + e)*vn*n.z};
  // slip at the contact: v + w x (-R n), tangential
  const wxn = {x: w.y*n.z - w.z*n.y, y: w.z*n.x - w.x*n.z, z: w.x*n.y - w.y*n.x};
  let u = {x: vIn.x - R*wxn.x, y: vIn.y - R*wxn.y, z: vIn.z - R*wxn.z};
  const un = u.x*n.x + u.y*n.y + u.z*n.z;
  u = {x: u.x - un*n.x, y: u.y - un*n.y, z: u.z - un*n.z};
  const ul = Math.hypot(u.x, u.y, u.z);
  if (ul > 1e-12){ const J = Math.min(ul/3.5, mu*(1 + e)*(-vn)); out.x -= J*u.x/ul; out.y -= J*u.y/ul; out.z -= J*u.z/ul; }
  return out;
}
const angleBetween = (a, b) => Math.acos(Math.max(-1, Math.min(1, (a.x*b.x + a.y*b.y + a.z*b.z)/(Math.hypot(a.x, a.y, a.z)*Math.hypot(b.x, b.y, b.z)))))/DEG;
{
  const post = {x: 52.44, z: 3.72};
  for (const inc of [30, 60]){
    // a 20 m/s ball whose contact normal makes `inc` degrees with its reversed velocity: impact parameter 0.17 sin(inc)
    const evs = [];
    const bw = createBallWorld({spec, onEvent: (type, d) => { if (type === 'post' || type === 'bar') evs.push([type, d]); }});
    const b = createBall({x: post.x - 1.2, y: 1.2, z: post.z - 0.17*Math.sin(inc*DEG)});
    b.state = 'dead';     // no goal or out events in the way; physics is the same
    ballKick(b, {x: 20, y: 0, z: 0}, null, {}); b.state = 'dead';
    // events are not emitted for a dead ball: catch the collision through the trace instead
    let hitPiece = null;
    bw.trace = (k, x0, y0, z0, x1, y1, z1) => { if (k === 'post' && !hitPiece) hitPiece = {x: x1, y: y1, z: z1}; };
    let vIn = null, vOut = null;
    for (let i = 0; i < 30 && !vOut; i++){
      const before = {x: b.v.x, y: b.v.y, z: b.v.z};
      ballStep(b, bw, H);
      if (hitPiece && !vOut){ vIn = before; vOut = {x: b.v.x, y: b.v.y, z: b.v.z}; }
    }
    // the normal from the post's axis to the contact
    const nx = hitPiece.x - post.x, nz = hitPiece.z - post.z, nl = Math.hypot(nx, nz), n = {x: nx/nl, y: 0, z: nz/nl};
    check(Math.abs(nl - 0.17) < 1e-6, `post at ${inc} degrees incidence: contact at post radius + ball radius from the axis`, r4(nl));
    const inAng = angleBetween({x: -vIn.x, y: -vIn.y, z: -vIn.z}, n);
    const want = expectedOut(vIn, n);
    const err = angleBetween(vOut, want);
    check(Math.abs(inAng - inc) < 1.0 && err <= 2, `a 20 m/s ball at ${inc} degrees incidence reflects within 2 degrees of the model`, {incidence: r4(inAng), err: r4(err)});
    const ratio = -(vOut.x*n.x + vOut.z*n.z)/(vIn.x*n.x + vIn.z*n.z);
    check(Math.abs(ratio - 0.6) < 0.03, "  the normal speed comes back at 0.6 of the incoming", r4(ratio));
  }
  // the bar from below at 30 degrees, live ball: the 'bar' event carries vIn, vOut and the normal
  {
    const evs = [];
    const bw = createBallWorld({spec, onEvent: (type, d) => { if (type === 'bar' || type === 'post') evs.push([type, d]); }});
    const inc = 30, bx = 52.44, by = 2.5;
    // approach along +x with an upward tilt so the contact normal makes 30 degrees with the reversed velocity
    const b = createBall({x: bx - 0.6, y: by - 0.17*Math.sin(inc*DEG) - 0.05, z: 0.5});
    ballKick(b, {x: 20, y: 0, z: 0}, null, {});
    for (let i = 0; i < 20 && !evs.length; i++) ballStep(b, bw, H);
    const [type, d] = evs[0] || [];
    check(type === 'bar', "a ball at the bar raises a 'bar' event", type);
    if (d){
      const ax = d.x - bx, ay = d.y - by, al = Math.hypot(ax, ay);
      check(Math.abs(al - 0.17) < 1e-6 && Math.abs(d.n.x - ax/al) < 1e-9 && Math.abs(d.n.y - ay/al) < 1e-9, "the bar event's normal points from the bar's axis to the ball", r4(al));
      const err = angleBetween(d.vOut, expectedOut(d.vIn, d.n));
      check(err <= 2, "the bar reflects within 2 degrees of the model", r4(err));
      check(Math.abs(d.speed - -(d.vIn.x*d.n.x + d.vIn.y*d.n.y + d.vIn.z*d.n.z)) < 1e-9, "the event's speed is the normal speed of approach", r4(d.speed));
    }
  }
}

/* ---------- the net absorbs the shot ---------- */
{
  for (const [aim, label] of [[{x: 54.44, y: 1.0, z: 1.0}, "back of the net"], [{x: 54.44, y: 0.4, z: -2.5}, "low corner"], [{x: 54.0, y: 2.1, z: 0}, "under the roof"]]){
    let tNet = -1, vNet = 0;
    const bw = createBallWorld({spec, onEvent: (type, d) => { if (type === 'net' && tNet < 0){ tNet = d.t; vNet = d.speed; } }});
    const b = createBall({x: 41.5, z: 0});
    const dx = aim.x - b.p.x, dy = aim.y - b.p.y + 0.3, dz = aim.z - b.p.z, L = Math.hypot(dx, dy, dz);
    ballKick(b, {x: 28*dx/L, y: 28*dy/L, z: 28*dz/L}, null, {});
    let vAt = null, maxPen = 0;
    for (let i = 0; i < 180; i++){
      ballStep(b, bw, H);
      maxPen = Math.max(maxPen, b.p.x - 54.44);
      if (tNet >= 0 && vAt == null && bw.t >= tNet + 0.4) vAt = Math.hypot(b.v.x, b.v.y, b.v.z);
    }
    check(tNet > 0 && vAt != null && vAt <= 0.2*vNet, `shot into the ${label}: the net takes at least 80% of the speed within 0.4 s`, {in: r4(vNet), after: r4(vAt), bulge: r4(maxPen)});
    check(Math.abs(b.p.x) < 54.44 + 1.0 && Math.abs(b.p.z) < 3.72 + 1.0, "  and the ball stays in the goal", {x: r4(b.p.x), z: r4(b.p.z)});
  }
  // a shot that passes just outside the post into the side netting stays outside the goal
  {
    const bw = createBallWorld({spec});
    const b = createBall({x: 46.95, y: 2.2, z: 0.16});
    const dx = 52.41 - 46.95, dy = 2.32 - 2.2, dz = 4.02 - 0.16, L = Math.hypot(dx, dy, dz);
    ballKick(b, {x: 35*dx/L, y: 35*dy/L, z: 35*dz/L}, null, {});
    let minZ = Infinity, maxX = -Infinity;
    for (let i = 0; i < 90; i++){ ballStep(b, bw, H); if (b.p.x > 52.6){ minZ = Math.min(minZ, b.p.z); maxX = Math.max(maxX, b.p.x); } }
    check(minZ > 3.72 - 0.11 - 0.3, "a shot just outside the post into the side netting stays outside the goal", {minZ: r4(minZ)});
  }
  // a ball from behind the goal is kept out by the same net
  {
    const bw = createBallWorld({spec});
    const b = createBall({x: 58, y: 0.8, z: 0});
    ballKick(b, {x: -15, y: 1, z: 0}, null, {});
    let minX = Infinity;
    for (let i = 0; i < 120; i++){ ballStep(b, bw, H); minX = Math.min(minX, b.p.x); }
    check(minX > 52.44 + 0.5, "a ball hit at the back of the net from outside stays outside the goal", r4(minX));
  }
}

/* ---------- 10,000 shots at 35 m/s at the frame never tunnel ---------- */
// closest distance between segments p0-p1 and q0-q1 (Ericson, Real-Time Collision Detection 5.1.9), written here so
// the check does not lean on the integrator's own swept test
function segSegDist(p0, p1, q0, q1){
  const d1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], d2 = [q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]];
  const r = [p0[0] - q0[0], p0[1] - q0[1], p0[2] - q0[2]];
  const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s, t;
  const cl = (v) => Math.max(0, Math.min(1, v));
  if (a <= 1e-14 && e <= 1e-14){ s = t = 0; }
  else if (a <= 1e-14){ s = 0; t = cl(f/e); }
  else {
    const c = dot(d1, r);
    if (e <= 1e-14){ t = 0; s = cl(-c/a); }
    else {
      const b = dot(d1, d2), den = a*e - b*b;
      s = den > 1e-14 ? cl((b*f - c*e)/den) : 0;
      t = (b*s + f)/e;
      if (t < 0){ t = 0; s = cl(-c/a); } else if (t > 1){ t = 1; s = cl((b - c)/a); }
    }
  }
  const c1 = [p0[0] + d1[0]*s, p0[1] + d1[1]*s, p0[2] + d1[2]*s], c2 = [q0[0] + d2[0]*t, q0[1] + d2[1]*t, q0[2] + d2[2]*t];
  return Math.hypot(c1[0] - c2[0], c1[1] - c2[1], c1[2] - c2[2]);
}
{
  const frame = [];
  for (const z of [-3.72, 3.72]) frame.push({kind: 'post', a: [52.44, 0, z], b: [52.44, 2.5, z]});
  frame.push({kind: 'bar', a: [52.44, 2.5, -3.72], b: [52.44, 2.5, 3.72]});
  const r = mulberry32(2026), rr = 0.17;
  let shots = 0, hits = 0, misses = 0, tunnels = 0, badContact = 0, maxTravel = 0;
  const bw = createBallWorld({spec});
  bw.boards = [];
  let pieces = [];
  bw.trace = (k, x0, y0, z0, x1, y1, z1) => pieces.push([k, x0, y0, z0, x1, y1, z1]);
  for (let i = 0; i < 10000; i++){
    // a start in front of the goal and an aim point near a random part of the frame
    const sx = 40 + 11*r(), sz = -10 + 20*r(), sy = 0.3 + 2.0*r();
    let ax, ay, az;
    const pick = r();
    if (pick < 0.66){ ax = 52.44 + (r() - 0.5)*0.4; ay = 0.2 + 2.2*r(); az = (pick < 0.33 ? -3.72 : 3.72) + (r() - 0.5)*0.7; }
    else { ax = 52.44 + (r() - 0.5)*0.4; ay = 2.5 + (r() - 0.5)*0.7; az = -3.9 + 7.8*r(); }
    const dx = ax - sx, dy = ay - sy, dz = az - sz, L = Math.hypot(dx, dy, dz);
    const b = createBall({x: sx, y: sy, z: sz});
    ballKick(b, {x: 35*dx/L, y: 35*dy/L, z: 35*dz/L}, null, {});
    pieces = [];
    let hit = false;
    for (let s = 0; s < 40 && !hit; s++){
      ballStep(b, bw, H);
      for (const p of pieces) if (p[0] === 'post' || p[0] === 'bar') hit = true;
    }
    shots++;
    // every piece before the first frame contact keeps the ball's centre at least rr from every frame axis; the contact
    // piece ends exactly at rr from the frame
    let contactSeen = false;
    for (const p of pieces){
      const p0 = [p[1], p[2], p[3]], p1 = [p[4], p[5], p[6]];
      maxTravel = Math.max(maxTravel, Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]));
      if (contactSeen) break;
      if (p[0] === 'post' || p[0] === 'bar'){
        const dEnd = Math.min(...frame.map(f => segSegDist(p1, p1, f.a, f.b)));
        if (Math.abs(dEnd - rr) > 1e-6) badContact++;
        const dMin = Math.min(...frame.map(f => segSegDist(p0, p1, f.a, f.b)));
        if (dMin < rr - 1e-6) tunnels++;
        contactSeen = true;
        continue;
      }
      const dMin = Math.min(...frame.map(f => segSegDist(p0, p1, f.a, f.b)));
      if (dMin < rr - 1e-6) tunnels++;
    }
    if (hit) hits++; else misses++;
  }
  check(tunnels === 0 && badContact === 0, "10,000 shots at 35 m/s at the posts and bar: none passes through the frame (analytic segment test)", {shots, hits, misses, tunnels, badContact});
  check(hits > 2000 && misses > 2000, "  and the set covers both hits and near misses", {hits, misses});
  check(maxTravel <= BALL.SUB_TRAVEL + 1e-6, "  every straight piece of motion is at most 0.12 m", r4(maxTravel));
}

/* ---------- sub-steps: count and travel ---------- */
{
  const pieces = [];
  const bw = createBallWorld({spec, trace: (k, x0, y0, z0, x1, y1, z1, dt) => pieces.push({len: Math.hypot(x1 - x0, y1 - y0, z1 - z0), dt})});
  const counts = [];
  for (const v of [0.5, 7.0, 7.19, 20, 40]){
    const b = createBall({x: 0, y: 1, z: 0});
    ballKick(b, {x: v, y: 0, z: 0}, null, {});
    pieces.length = 0;
    ballStep(b, bw, H);
    const want = Math.max(1, Math.min(6, Math.ceil((v + (BALL.G + BALL.AMAX)*H)*H/BALL.SUB_TRAVEL)));
    counts.push([v, pieces.length, want]);
  }
  check(counts.every(([v, got, want]) => got === want), "sub-steps per 60 Hz step: clamp(ceil(|v| h / 0.12), 1, 6) with |v| the step's top speed", counts);
  check(counts[counts.length - 1][1] === 6, "a 40 m/s ball takes 6 sub-steps (0.111 m each)");
  // a long mixed run: shots, bounces, rolling, the net, the posts, boards and bodies, never more than 0.12 m a sub-step
  const r = mulberry32(7);
  const bodies = [];
  for (let i = 0; i < 10; i++) bodies.push({id: i, team: i%2, x: 30 + 20*r(), z: -15 + 30*r(), h: 1, vx: 0, vz: 0});
  let worst = 0, perStep = 0;
  const bw2 = createBallWorld({spec: makePitch({boards: true}), bodies: () => bodies, rng: mulberry32(3),
    trace: (k, x0, y0, z0, x1, y1, z1) => { perStep += Math.hypot(x1 - x0, y1 - y0, z1 - z0); }});
  const b = createBall({x: 20});
  let worstSub = 0;
  for (let k = 0; k < 40; k++){
    const a = r()*2*Math.PI, el = r()*0.6, sp = 8 + 32*r();
    ballKick(b, {x: sp*Math.cos(el)*Math.cos(a) + 10, y: sp*Math.sin(el), z: sp*Math.cos(el)*Math.sin(a)}, {x: 0, y: 40*(r() - 0.5), z: 0}, {});
    if (Math.abs(b.p.x) > 50 || Math.abs(b.p.z) > 30){ b.p.x = 20; b.p.z = 0; }
    for (let i = 0; i < 120; i++){
      for (const bd of bodies){ bd.vx = 6*Math.sin(i*0.05 + bd.id); bd.vz = 6*Math.cos(i*0.07 + bd.id); bd.x += bd.vx*H; bd.z += bd.vz*H; }
      const n0 = 0;
      const tr = bw2.trace;
      let subs = [];
      bw2.trace = (k2, x0, y0, z0, x1, y1, z1, dt) => { subs.push(Math.hypot(x1 - x0, y1 - y0, z1 - z0)); };
      ballStep(b, bw2, H);
      bw2.trace = tr;
      for (const s of subs) worstSub = Math.max(worstSub, s);
    }
  }
  check(worstSub <= BALL.SUB_TRAVEL + 1e-6, "a long mixed run (shots, spin, bounces, posts, net, boards, moving bodies): no piece over 0.12 m", r4(worstSub));
}

/* ---------- determinism: the same seed gives bit-identical trajectories ---------- */
{
  function run(seed){
    const r = mulberry32(seed);
    const bodies = [];
    for (let i = 0; i < 12; i++) bodies.push({id: i, team: i%2, x: -30 + 60*r(), z: -20 + 40*r(), h: 0.95 + 0.1*r(), vx: 0, vz: 0});
    const evs = [];
    const bw = createBallWorld({spec: makePitch({boards: true}), bodies: () => bodies, rng: mulberry32(seed + 1),
      onEvent: (type, d) => evs.push(type + ":" + d.t)});
    const b = createBall();
    const out = [];
    for (let k = 0; k < 30; k++){
      // every other kick goes at a body, so deflections (and their seeded spread) are part of the run
      const tgt = k%2 ? bodies[k%12] : {x: -30 + 60*r(), z: -20 + 40*r()};
      const dx = tgt.x - b.p.x, dz = tgt.z - b.p.z, dl = Math.hypot(dx, dz) || 1, sp = 8 + 20*r();
      ballKick(b, {x: sp*dx/dl, y: k%2 ? 1.5*r() : 12*r(), z: sp*dz/dl}, {x: 0, y: 40*(r() - 0.5), z: 20*(r() - 0.5)}, {agent: (k + 5)%12, team: k%2, kind: 'shot', aero: 99*r(), t: bw.t});
      for (let i = 0; i < 90; i++){
        for (const bd of bodies){ bd.vx = 2*Math.sin(bw.t + bd.id); bd.vz = 2*Math.cos(1.3*bw.t + bd.id); bd.x += bd.vx*H; bd.z += bd.vz*H; }
        ballStep(b, bw, H);
        out.push(b.p.x, b.p.y, b.p.z, b.v.x, b.v.y, b.v.z, b.w.x, b.w.y, b.w.z);
      }
      if (Math.abs(b.p.x) > 52 || Math.abs(b.p.z) > 33){ ballHold(b, {id: 0, x: 0, y: R, z: 0}); }
    }
    return {out, evs};
  }
  const A = run(11), B = run(11), C = run(12);
  let same = A.out.length === B.out.length;
  for (let i = 0; same && i < A.out.length; i++) if (!Object.is(A.out[i], B.out[i])) same = false;
  check(same && A.evs.join() === B.evs.join(), "the same seed gives a bit-identical trajectory and event list", {values: A.out.length, events: A.evs.length});
  check(A.out.some((v, i) => v !== C.out[i]), "a different seed gives a different run");
  check(A.evs.some(e => e.startsWith('body')) && A.evs.some(e => e.startsWith('bounce')), "  (the run includes body deflections and bounces)", A.evs.slice(0, 6));
}

/* ---------- a handler may predict inside an event without disturbing the step ---------- */
{
  const run = nested => {
    const bodies = [{id: 1, team: 0, x: 8, z: 0.1, h: 1, vx: -2, vz: 0}, {id: 2, team: 1, x: 14, z: -0.2, h: 1, vx: 0, vz: 0}];
    const pred = new Float32Array(360);
    let bw = null;
    const evs = [];
    bw = createBallWorld({spec, bodies: () => bodies, rng: mulberry32(4), onEvent: (type, d) => {
      evs.push(type);
      if (nested) ballPredict(b, bw, pred, 90, 30);       // as the simulation does on a bounce or a collision
    }});
    const b = createBall();
    ballKick(b, {x: 16, y: 3, z: 0}, {x: 0, y: 10, z: 0}, {agent: 9, team: 0, kind: 'pass', t: 0});
    const out = [];
    for (let i = 0; i < 150; i++){ for (const bd of bodies) bd.x += bd.vx*H; ballStep(b, bw, H); out.push(b.p.x, b.p.y, b.p.z, b.v.x, b.v.y, b.v.z); }
    return {out, evs};
  };
  const A = run(false), B = run(true);
  check(A.out.every((v, i) => Object.is(v, B.out[i])) && A.evs.join() === B.evs.join() && A.evs.includes('body'),
    "a handler that predicts inside a 'body' or 'bounce' event leaves the step exactly as it was", A.evs.slice(0, 5));
}

/* ---------- goal, out of play, touches ---------- */
{
  const evs = [];
  const bw = createBallWorld({spec, onEvent: (type, d) => evs.push([type, d])});
  const shoot = (from, to, sp) => {
    const b = createBall(from);
    const dx = to.x - from.x, dy = to.y - (from.y || R), dz = to.z - from.z, L = Math.hypot(dx, dy, dz);
    ballKick(b, {x: sp*dx/L, y: sp*dy/L + 1.2, z: sp*dz/L}, null, {agent: 9, team: 0, kind: 'shot', t: bw.t});
    evs.length = 0;
    for (let i = 0; i < 240; i++) ballStep(b, bw, H);
    return b;
  };
  shoot({x: 41.5, z: 0}, {x: 52.5, y: 1.0, z: 1.5}, 25);
  const touch = evs.find(e => e[0] === 'touch'), goal = evs.find(e => e[0] === 'goal');
  check(touch && touch[1].agent === 9 && touch[1].kind === 'shot', "a kick is reported as a 'touch' event with its agent and kind");
  check(goal && Math.abs(goal[1].x - 52.61) < 1e-9 && Math.abs(goal[1].z) < 3.66 && goal[1].y < 2.44 && goal[1].end === 1,
    "a shot inside the mouth scores: 'goal' at the crossing of x = 52.61", goal && {x: r4(goal[1].x), y: r4(goal[1].y), z: r4(goal[1].z)});
  check(evs.filter(e => e[0] === 'goal' || e[0] === 'out').length === 1, "  exactly one goal or out event for it");
  shoot({x: 41.5, z: 0}, {x: 52.5, y: 1.0, z: 6}, 25);
  const wide = evs.find(e => e[0] === 'out');
  check(wide && wide[1].line === 'goal' && Math.abs(wide[1].x - 52.61) < 1e-9 && !evs.some(e => e[0] === 'goal'), "a shot wide of the post goes out over the goal line", wide && wide[1].line);
  shoot({x: 0, z: 30}, {x: 5, y: 0.11, z: 40}, 12);
  const touchOut = evs.find(e => e[0] === 'out');
  check(touchOut && touchOut[1].line === 'touch' && Math.abs(touchOut[1].z - 34.11) < 1e-9, "a ball over the touchline goes out at z = 34.11", touchOut && r4(touchOut[1].z));
  shoot({x: 41.5, z: 0}, {x: 52.5, y: 4.0, z: 0}, 26);
  check(!evs.some(e => e[0] === 'goal'), "a shot over the bar does not score", evs.map(e => e[0]));
  // the timing of a goal is inside the sub-step, not on the 60 Hz grid
  shoot({x: 41.5, z: 0}, {x: 52.5, y: 0.8, z: -2}, 30);
  const g2 = evs.find(e => e[0] === 'goal');
  check(g2 && Math.abs(g2[1].t*60 - Math.round(g2[1].t*60)) > 1e-6, "the goal event carries the interpolated time of the crossing", g2 && r4(g2[1].t));
}

/* ---------- bodies and hands ---------- */
{
  const evs = [];
  const bodies = [{id: 4, team: 1, x: 5, z: 0, h: 1, vx: 0, vz: 0}];
  const bw = createBallWorld({spec, bodies: () => bodies, onEvent: (type, d) => evs.push([type, d])});
  const b = createBall({x: 0, z: 0});
  ballKick(b, {x: 10, y: 0, z: 0}, null, {agent: 1, team: 0, kind: 'pass', t: 0});
  for (let i = 0; i < 60; i++) ballStep(b, bw, H);
  const hit = evs.find(e => e[0] === 'body');
  check(hit && hit[1].id === 4 && hit[1].part === 'legs', "a rolling ball into a standing body hits his legs ('body' event)", hit && hit[1].part);
  if (hit){
    const n = hit[1].n, vin = hit[1].vIn, vout = hit[1].vOut;
    const ratio = -(vout.x*n.x + vout.y*n.y + vout.z*n.z)/(vin.x*n.x + vin.y*n.y + vin.z*n.z);
    check(Math.abs(ratio - BALL.E_BODY) < 1e-9, "  it comes off with restitution 0.3 (no RNG: no spread)", r4(ratio));
    check(b.last.agent === 4 && b.last.team === 1 && b.last.kind === 'deflect', "  and the last touch is his");
  }
  // the kicker's own body does not take the ball he just kicked
  evs.length = 0;
  const me = [{id: 7, team: 0, x: -0.25, z: 0, h: 1, vx: 0, vz: 0}];
  const bw2 = createBallWorld({bodies: () => me, onEvent: (type, d) => evs.push([type, d])});
  const b2 = createBall();
  ballKick(b2, {x: 8, y: 0, z: 0}, null, {agent: 7, team: 0, kind: 'pass', t: 0});
  for (let i = 0; i < 30; i++) ballStep(b2, bw2, H);
  check(!evs.some(e => e[0] === 'body') && b2.p.x > 2, "the kicker's own capsule ignores the ball for the moment after his touch");
  // a moving body adds its velocity: the ball comes off faster than it arrived, and the step re-splits
  evs.length = 0;
  const runner = [{id: 2, team: 1, x: 3, z: 0, h: 1, vx: -7, vz: 0}];
  let worst = 0;
  const bw3 = createBallWorld({bodies: () => runner, onEvent: (type, d) => evs.push([type, d]),
    trace: (k, x0, y0, z0, x1, y1, z1) => { worst = Math.max(worst, Math.hypot(x1 - x0, y1 - y0, z1 - z0)); }});
  const b3 = createBall();
  ballKick(b3, {x: 5, y: 0, z: 0}, null, {agent: 1, team: 0, kind: 'pass', t: 0});
  for (let i = 0; i < 40; i++){ runner[0].x += runner[0].vx*H; ballStep(b3, bw3, H); }
  check(evs.some(e => e[0] === 'body') && b3.v.x < -5 && worst <= BALL.SUB_TRAVEL + 1e-6, "a body running into the ball sends it back faster, still at most 0.12 m a piece", {vx: r4(b3.v.x), worst: r4(worst)});
  // hands
  evs.length = 0;
  const bw4 = createBallWorld({spec, hands: () => [{id: 0, x: 50, y: 1.2, z: 0, r: 0.11}], onEvent: (type, d) => evs.push([type, d])});
  const b4 = createBall({x: 44, y: 1.2, z: 0});
  ballKick(b4, {x: 20, y: 1.5, z: 0}, null, {});
  for (let i = 0; i < 30; i++) ballStep(b4, bw4, H);
  const hh = evs.find(e => e[0] === 'body');
  check(hh && hh[1].part === 'hand' && b4.v.x < 0, "a keeper's hand sphere stops a shot and sends it back", hh && hh[1].part);
}

/* ---------- held, released, knuckle ---------- */
{
  const bw = createBallWorld({spec});
  const b = createBall();
  ballHold(b, {id: 3, team: 1, x: 10, y: 1.2, z: 2, vx: 2, vy: 0, vz: 0});
  for (let i = 0; i < 30; i++) ballStep(b, bw, H);
  check(b.state === 'held' && Math.abs(b.p.x - 11) < 1e-9 && b.p.y === 1.2 && b.last.agent === 3, "a held ball moves with its holder and nothing else", r4(b.p.x));
  ballRelease(b, {x: 11, y: 2.0, z: 2}, {x: 10, y: 6, z: 0}, null);
  for (let i = 0; i < 30; i++) ballStep(b, bw, H);
  check(b.state === 'free' && b.p.x > 15 && b.last.kind === 'release', "a released ball flies from the release point", r4(b.p.x));
  // the knuckle wobbles a driven ball sideways and stops at its first bounce
  const a = createBall(), c = createBall();
  ballKick(a, {x: 28, y: 3, z: 0}, null, {});
  ballKick(c, {x: 28, y: 3, z: 0}, null, {knuck: {amp: 2.4, freq: 7, phase: 1}});
  const fw = createBallWorld({});
  let maxOff = 0, bounced = false;
  const cw = createBallWorld({onEvent: t => { if (t === 'bounce') bounced = true; }});
  for (let i = 0; i < 45; i++){ ballStep(a, fw, H); ballStep(c, cw, H); maxOff = Math.max(maxOff, Math.abs(c.p.z - a.p.z)); if (bounced) break; }
  check(maxOff > 0.05 && maxOff < 1.0, "a knuckling ball wanders sideways off the line of an identical ball without it", r4(maxOff));
  for (let i = 0; i < 60; i++) ballStep(c, cw, H);
  check(bounced && c.knuck === null, "the knuckle is reset at the first bounce");
}

/* ---------- life adapter: walls and floors from solids, sleeping ---------- */
{
  const evs = [];
  const solids = {
    cast(ox, oy, oz, dx, dy, dz, len, out){
      if (dx > 0){ const t = (3 - ox)/dx; if (t >= 0 && t < len){ out[0] = -1; out[1] = 0; out[2] = 0; return t; } }
      return len;
    },
    floor(x, y, z){ return y >= 0.45 ? 0.5 : null; }
  };
  const bw = createBallWorld({solids, onEvent: (type, d) => evs.push([type, d])});
  const b = createBall({x: 0, y: 1.5, z: 0});
  ballKick(b, {x: 8, y: 0, z: 0}, null, {});
  let maxX = -Infinity;
  for (let i = 0; i < 900; i++){ ballStep(b, bw, H); maxX = Math.max(maxX, b.p.x); }
  const wall = evs.find(e => e[0] === 'wall');
  check(wall && maxX <= 3 - R + 1e-6, "a life ball meets a wall from solids.cast and never passes it", {maxX: r4(maxX)});
  if (wall){
    const n = wall[1].n, ratio = -(wall[1].vOut.x*n.x)/(wall[1].vIn.x*n.x);
    check(Math.abs(ratio - BALL.E_BOARD) < 1e-9, "  coming off at restitution 0.5", r4(ratio));
  }
  check(Math.abs(b.p.y - 0.61) < 1e-3 && b.sleep, "it rests on the floor from solids.floor and sleeps", {y: r4(b.p.y), sleep: b.sleep});
  ballKick(b, {x: -2, y: 0, z: 0}, null, {});
  ballStep(b, bw, H);
  check(!b.sleep && b.v.x < 0, "a kick wakes it");
}

/* ---------- prediction and firstReach ---------- */
{
  const bw = createBallWorld({spec});
  // the prediction at 30 Hz is the live ball, sample for sample
  const b = createBall({x: 10, z: -5});
  ballKick(b, {x: 18, y: 7, z: 3}, {x: 0, y: 25, z: 0}, {aero: 40});
  const out = new Float32Array(360), n = ballPredict(b, bw, out, 90, 30);
  const live = createBall({x: 10, z: -5});
  ballKick(live, {x: 18, y: 7, z: 3}, {x: 0, y: 25, z: 0}, {aero: 40});
  const lw = createBallWorld({spec});
  let same = n === 90;
  for (let k = 1; k < n && same; k++){
    ballStep(live, lw, H); ballStep(live, lw, H);
    if (out[4*k] !== Math.fround(live.p.x) || out[4*k + 1] !== Math.fround(live.p.y) || out[4*k + 2] !== Math.fround(live.p.z)) same = false;
  }
  check(same && Math.abs(out[4*89 + 3] - 89/30) < 1e-6, "ballPredict at 30 Hz writes 90 samples that are the live ball's own positions", n);
  check(b.p.x === 10 && b.v.x === 18, "  and leaves the ball itself untouched");
  // spinMul: a misread of the spin moves the prediction
  const out2 = new Float32Array(360);
  ballPredict(b, bw, out2, 90, 30, 0.4);
  check(Math.abs(out2[4*30 + 2] - out[4*30 + 2]) > 0.2, "a spin misread (spinMul 0.4) predicts a different path", r4(out2[4*30 + 2] - out[4*30 + 2]));

  // firstReach against a brute-force search over the live trajectory at 60 Hz
  const prm = moverParams({pace: 60, dribbling: 55}, "football");
  const launches = [
    {p: {x: 0, z: 0}, v: {x: 15, y: 0, z: 2}, w: null, label: "ground pass"},
    {p: {x: 0, z: 0}, v: {x: 14, y: 9, z: -3}, w: {x: 0, y: 0, z: 0}, label: "lofted ball"},
    {p: {x: -10, z: 5}, v: {x: 22, y: 4, z: 0}, w: {x: 0, y: 30, z: 0}, label: "curled driven ball"}
  ];
  const actors = [
    {x: 20, z: 6, vx: 0, vz: 0, react: 0.2, reachY: 0.6},
    {x: 12, z: -8, vx: 3, vz: 2, react: 0.25, reachY: 0.6},
    {x: 25, z: -2, vx: -4, vz: 0, react: 0.15, reachY: 1.45},
    {x: 8, z: 4, vx: 0, vz: -2, react: 0.3, reachY: 2.4}
  ];
  let worst = 0, compared = 0, agree = 0;
  const predT = (pred, cnt) => pred[4*(cnt - 1) + 3];
  for (const L of launches){
    const bb = createBall(L.p);
    ballKick(bb, L.v, L.w, {});
    const pred = new Float32Array(360), cnt = ballPredict(bb, null, pred, 90, 30);
    for (const A of actors){
      const actor = Object.assign({prm, fac: FRESH}, A);
      const fr = firstReach(pred, cnt, actor);
      // brute force: the live ball at 60 Hz, the margin t - (timeToPoint + react) interpolated to zero
      const lb = createBall(L.p); ballKick(lb, L.v, L.w, {});
      const lw2 = createBallWorld({});
      const m = {x: A.x, z: A.z, speed: Math.hypot(A.vx, A.vz), heading: Math.hypot(A.vx, A.vz) > 0 ? yawOf(A.vx, A.vz) : 0};
      let t = 0, prev = null, found = null;
      const horizon = predT(pred, cnt);
      for (let i = 0; t <= horizon + 1e-9 && !found; i++){
        const ok = lb.p.y <= A.reachY, g = ok ? t - timeToPoint(m, prm, FRESH, lb.p.x, lb.p.z, A.react) : -Infinity;
        if (ok && g >= 0){
          if (!prev || !prev.ok) found = prev && !prev.ok && prev.y !== lb.p.y ? prev.t + (t - prev.t)*(prev.y - A.reachY)/(prev.y - lb.p.y) : t;
          else found = prev.t + (t - prev.t)*(-prev.g)/(g - prev.g);
          break;
        }
        prev = {t, g, ok, y: lb.p.y};
        ballStep(lb, lw2, H); t += H;
      }
      compared++;
      if ((fr == null) === (found == null)){
        if (fr){ const d = Math.abs(fr.t - found); worst = Math.max(worst, d); if (d <= 0.05) agree++; }
        else agree++;
      }
    }
  }
  check(agree === compared, "firstReach agrees with a brute-force search within 0.05 s", {compared, agree, worst: r4(worst)});
  // already in reach: t = 0
  const near = createBall({x: 1, z: 0});
  const pn = new Float32Array(360), cn = ballPredict(near, null, pn);
  const fr0 = firstReach(pn, cn, {x: 1, z: 0.3, vx: 0, vz: 0, react: 0, reach: 0.75});
  check(fr0 && fr0.t === 0, "a ball within the actor's reach is reachable now");
  const fr1 = firstReach(pn, cn, {x: 1, z: 0.3, vx: 0, vz: 0, react: 0});
  check(fr1 && fr1.t > 0.1, "  and without the reach he has to get to its point first", fr1 && r4(fr1.t));
  // out of reach in height for the whole prediction: null
  const hb = createBall({x: 0, y: 1, z: 0}); ballKick(hb, {x: 5, y: 25, z: 0}, null, {});
  const ph = new Float32Array(360), chh = ballPredict(hb, null, ph, 30, 30);
  check(firstReach(ph, chh, {x: 1, z: 0, vx: 0, vz: 0, react: 0.2, reachY: 0.6}) === null, "a ball above reach for the whole prediction gives null");
}

/* ---------- ballFlyTo (the solver's flight) ---------- */
{
  const b = createBall();
  ballKick(b, {x: 25, y: 5, z: 0}, null, {});
  const o = ballFlyTo(b, null, 18, 0, 1, 0, 3, {});
  check(o.hit && Math.abs(o.x - 18) < 1e-9 && o.t > 0.7 && o.t < 0.9 && o.apex >= o.y, "ballFlyTo finds the crossing of a vertical plane on the flight", {t: r4(o.t), y: r4(o.y)});
  const s = createBall(); ballKick(s, {x: 5, y: 0, z: 0}, null, {});
  const o2 = ballFlyTo(s, null, 30, 0, 1, 0, 6, {});
  check(!o2.hit && o2.x < 30, "a ball that dies before the plane reports no crossing", r4(o2.x));
}

fs.mkdirSync(path.join(ROOT, "qa", "out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa", "out", "unit-ball.json"), JSON.stringify(res, null, 1));
console.log(`unit/ball: ${res.checks.filter(c => c.pass).length} of ${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
