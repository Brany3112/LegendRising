// ball_trace.mjs: runs the game's own ball.js / detmath.js / rng.js on fixed scenarios and prints every number as the
// hex bits of the double, one "name value" per line. core_check.cpp prints the same lines from the C++ port; the two
// outputs must be identical (diff). Usage: node ball_trace.mjs <worktree of bcs/integ>
const W = process.argv[2] + "/LegendRising/js/life/football/";
const B = await import(W + "ball.js");
const D = await import(W + "detmath.js");
const RNG = await import(W + "rng.js");

const F = new Float64Array(1), U = new BigUint64Array(F.buffer);
const hex = x => { F[0] = x; return U[0].toString(16).padStart(16, "0"); };
const out = [];
const put = (name, x) => out.push(name + " " + hex(x));
const putV = (name, v) => { put(name + ".x", v.x); put(name + ".y", v.y); put(name + ".z", v.z); };
const putBall = (name, b) => { putV(name + ".p", b.p); putV(name + ".v", b.v); putV(name + ".w", b.w); put(name + ".grounded", b.grounded ? 1 : 0); };

// detmath on a spread of arguments
const args = [-1e3, -37.5, -7.1, -3.3, -1.2, -0.7, -1e-3, -1e-9, 0, 1e-9, 2e-3, 0.3, 0.785, 1, 1.5, 2.2, 3.14159, 4.9, 10.5, 123.456, 700];
for (const a of args){
  put(`exp(${a})`, D.exp(a)); put(`sin(${a})`, D.sin(a)); put(`cos(${a})`, D.cos(a)); put(`atan(${a})`, D.atan(a));
  put(`tan(${a})`, D.tan(a));
  if (a > 0){ put(`log(${a})`, D.log(a)); put(`pow(${a},1.7)`, D.pow(a, 1.7)); put(`pow(${a},3)`, D.pow(a, 3)); }
  put(`atan2(${a},-2.5)`, D.atan2(a, -2.5)); put(`atan2(${a},0.75)`, D.atan2(a, 0.75));
  if (a >= -1 && a <= 1){ put(`asin(${a})`, D.asin(a)); put(`acos(${a})`, D.acos(a)); }
}

// the generator
{
  const r = RNG.mulberry32(12345);
  for (let i = 0; i < 6; i++) put(`rng.u${i}`, r());
  for (let i = 0; i < 6; i++) put(`rng.t${i}`, RNG.truncNormal(r, 1, 2.5));
}

// A: a ball rolled at 8 m/s along -Z, 60 steps
{
  const b = B.createBall({x: 0, z: 0, rollDecel: 1.1}), w = B.createBallWorld({});
  B.ballKick(b, {x: 0, y: 0, z: -8}, {x: 0, y: 0, z: 0}, {agent: 1, team: 0, kind: 'pass', t: 0});
  for (let i = 0; i < 60; i++){ B.ballStep(b, w, 1/60); if (i % 10 === 9) putBall(`A${i + 1}`, b); }
}
// B: a spun, struck ball with bounces and rolling, 180 steps
{
  const b = B.createBall({x: 1, z: -2, rollDecel: 1.3}), w = B.createBallWorld({});
  B.ballKick(b, {x: 3, y: 9, z: -25}, {x: 15, y: 20, z: -5}, {agent: 2, team: 1, kind: 'shot', aero: 60, t: 0.5});
  for (let i = 0; i < 180; i++){ B.ballStep(b, w, 1/60); if (i % 15 === 14) putBall(`B${i + 1}`, b); }
}
// C: a knuckler
{
  const b = B.createBall({}), w = B.createBallWorld({});
  B.ballKick(b, {x: 0.5, y: 5, z: -27}, {x: 0.5, y: 1, z: 0}, {kind: 'shot', knuck: {amp: 2.1, freq: 7.3, phase: 1.1}});
  for (let i = 0; i < 70; i++){ B.ballStep(b, w, 1/60); if (i % 10 === 9) putBall(`C${i + 1}`, b); }
}
// E: posts, a bar, a board and bodies with the spread (seeded), events recorded
{
  const ev = [];
  const rng = RNG.mulberry32(99);
  const w = B.createBallWorld({rng, onEvent: (type, d) => ev.push([type, d])});
  // a hand-built pitch end without a spec: posts and bar straight into caps, one board
  const cap = (ax, ay, az, bx, by, bz, r, kind, end) => {
    const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1e-9, rr = r + 0.11;
    return {ax, ay, az, ux: dx/L, uy: dy/L, uz: dz/L, L, r, rr, kind, end,
      x0: Math.min(ax, bx) - rr, x1: Math.max(ax, bx) + rr, y0: Math.min(ay, by) - rr, y1: Math.max(ay, by) + rr,
      z0: Math.min(az, bz) - rr, z1: Math.max(az, bz) + rr};
  };
  w.caps.push(cap(-3.66, 0, -20, -3.66, 2.44, -20, 0.06, 'post', 1));
  w.caps.push(cap(3.66, 0, -20, 3.66, 2.44, -20, 0.06, 'post', 1));
  w.caps.push(cap(-3.66, 2.44, -20, 3.66, 2.44, -20, 0.06, 'bar', 1));
  w.boards.push({nx: 0, ny: 0, nz: 1, d: -26, e: 0.5, x0: -30, x1: 30, y0: 0, y1: 0.9, z0: -26, z1: -26});
  w.caps.push(cap(-30, 0.9, -26, 30, 0.9, -26, 0.02, 'board', 0));
  const bodies = [{id: 5, team: 1, x: 0.4, z: -10, h: 1, vx: 0.5, vz: 0.2}, {id: 6, team: 1, x: -2, z: -14, h: 1.05, vx: 0, vz: 1},
    {id: 7, team: 1, x: -1.5, z: -19.5, h: 1, vx: -2, vy: 0.5, vz: 0, seg: {ax: -1.2, ay: 0.5, az: -19.5, bx: -2.6, by: 1.1, bz: -19.5, r: 0.22}}];
  w.bodies = () => bodies;
  const hands = [{id: 9, team: 1, x: 2.6, y: 1.2, z: -19.6, r: 0.1, vx: 0, vy: 0, vz: 0}];
  w.hands = () => hands;
  const shots = [
    {p: {x: 0, z: 0}, v: {x: -0.2, y: 4, z: -24}, s: {x: 5, y: 0, z: 0}},
    {p: {x: 0, z: -3}, v: {x: -6.2, y: 3.4, z: -27}, s: {x: 0, y: 3, z: 0}},
    {p: {x: 1, z: -6}, v: {x: 0.3, y: 6.3, z: -22}, s: {x: 10, y: -12, z: 0}},
    {p: {x: 0, z: -12}, v: {x: 3.3, y: 3.8, z: -20}, s: {x: 0, y: 0, z: 0}},
    {p: {x: 3.66, z: -10}, v: {x: 0, y: 4, z: -20}, s: {x: 0, y: 0, z: 0}},
    {p: {x: 0, z: -8}, v: {x: 0, y: 7.7, z: -22}, s: {x: -20, y: 0, z: 0}},
    {p: {x: 0.4, z: -6}, v: {x: 0, y: 1, z: -15}, s: {x: 0, y: 0, z: 0}},
    {p: {x: 2.6, z: -12}, v: {x: 0, y: 4.5, z: -18}, s: {x: 0, y: 0, z: 0}},
    {p: {x: -1.8, z: -15}, v: {x: 0, y: 2.6, z: -16}, s: {x: 0, y: 0, z: 0}},
  ];
  shots.forEach((sh, k) => {
    const b = B.createBall({x: sh.p.x, z: sh.p.z});
    B.ballKick(b, sh.v, sh.s, {agent: 3, team: 0, kind: 'shot', aero: 40, t: w.t});
    for (let i = 0; i < 150; i++){ B.ballStep(b, w, 1/60); if (i % 25 === 24) putBall(`E${k}.${i + 1}`, b); }
  });
  ev.forEach(([type, d], i) => {
    put(`ev${i}.${type}.t`, d.t); put(`ev${i}.x`, d.x); put(`ev${i}.y`, d.y); put(`ev${i}.z`, d.z);
    if (d.speed != null) put(`ev${i}.speed`, d.speed);
    if (d.vy != null) put(`ev${i}.vy`, d.vy);
    if (d.vOut) putV(`ev${i}.vOut`, d.vOut);
    if (d.part) out.push(`ev${i}.part ${d.part}`);
  });
}
// F: prediction and the fly-to
{
  const b = B.createBall({x: 0, z: 0});
  B.ballKick(b, {x: 1, y: 7, z: -20}, {x: 8, y: -6, z: 0}, {kind: 'shot'});
  const pred = new Float32Array(360), n = B.ballPredict(b, null, pred, 90, 30);
  put("F.n", n);
  for (let k = 0; k < n; k += 7){ put(`F.p${k}.x`, pred[4*k]); put(`F.p${k}.y`, pred[4*k + 1]); put(`F.p${k}.z`, pred[4*k + 2]); put(`F.p${k}.t`, pred[4*k + 3]); }
  const fo = B.ballFlyTo(b, null, 0, -18, 0, -1, 6, {});
  put("F.fly.hit", fo.hit ? 1 : 0); for (const k of ["x", "y", "z", "t", "apex", "vx", "vy", "vz"]) put("F.fly." + k, fo[k]);
}
// G: the closed forms of the roll
for (const v0 of [3, 8.5, 14]) for (const d of [2, 9, 25]){
  put(`G.dist(${v0})`, B.rollDistance(v0, 0, 1.1)); put(`G.speedFor(${d})`, B.rollSpeedFor(d, 2, 1.25));
  put(`G.time(${v0},${d})`, B.rollTime(v0, d, 1.1)); put(`G.at(${v0},${d/10})`, B.rollSpeedAt(v0, d/10, 1.1));
}
console.log(out.join("\n"));
