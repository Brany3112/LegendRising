// Golden numbers for Source/LegendRising/Tests/LRMovementTests.cpp, from the browser game's own JavaScript.
// Usage (from this folder, with read-only detached worktrees of the two branches):
//   git -C <repo> worktree add --detach <wt-controls> bcs/controls
//   git -C <repo> worktree add --detach <wt-integ> bcs/integ
//   node golden.mjs <wt-controls> <wt-integ>
// Prints the mover's run-up, sprint, ladder, 180 reversals, turn from a stand, the BCS wish curve, and the gait clock's
// carrier cadence. (Node 22; the game's modules are ES modules.)
// Golden numbers for the Unreal port (LRMovementTests.cpp): runs the game's own mover.js and gaitcore.js.
const W = process.argv[2], WI = process.argv[3];
const {createMover, moverParams, moverStep} = await import(W + "/LegendRising/js/life/mover.js");
const {FRESH} = await import(W + "/LegendRising/js/life/stamina.js");
const G = await import(WI + "/LegendRising/js/life/gaitcore.js");
const H = 1/60, r = (v, n = 4) => +(+v).toFixed(n);
const wrapA = a => { a = (a + Math.PI) % (2*Math.PI); if (a < 0) a += 2*Math.PI; return a - Math.PI; };
function prmTP(){ const p = moverParams({}, "football", {}); p.turnFirst = true; p.turnFirstRate = 13; p.faceRate = 12; return p; }
const out = {};
// S1/S2: from a stand, already facing the way (-Z), gait run / sprint
for (const gait of ["run", "sprint"]){
  const p = prmTP(), m = createMover({x: 0, z: 0, yaw: 0}), tgt = gait === "run" ? p.run : p.sprint;
  const o = {target: r(tgt, 6)}; const th = [.5, .9, .95, .99];
  let t = 0;
  for (let k = 1; k <= 600; k++){
    moverStep(m, {dx: 0, dz: -1, gait}, p, FRESH, H); t = k*H;
    for (const f of th) if (o["t" + f] == null && m.speed >= f*tgt) o["t" + f] = r(t);
    if (o.tFull == null && m.speed >= tgt - 1e-9) o.tFull = r(t);
    if (k === 30) o.v05 = r(m.speed, 6);
    if (k === 60){ o.v1 = r(m.speed, 6); o.d1 = r(-m.z, 6); }
    if (k === 120){ o.v2 = r(m.speed, 6); o.d2 = r(-m.z, 6); }
    if (k === 180){ o.d3 = r(-m.z, 6); }
  }
  out[gait] = o;
}
// S3: the controls' ladder: jog, then run once the keys have been held runAfter (0.6 s at Acceleration 50)
{
  const p = prmTP(), m = createMover({yaw: 0}); let fwdT = 0; const o = {};
  for (let k = 1; k <= 300; k++){
    fwdT += H; const gait = fwdT >= 0.6 ? "run" : "jog";
    if (gait === "run" && o.kRun == null) o.kRun = k;
    moverStep(m, {dx: 0, dz: -1, gait}, p, FRESH, H);
    if (k === o.kRun - 1) o.vAtSwitch = r(m.speed, 6);
    if (o.t90 == null && m.speed >= .9*p.run) o.t90 = r(k*H);
    if (o.tJog95 == null && m.speed >= .95*p.jog) o.tJog95 = r(k*H);
  }
  out.ladder = o;
}
// S4: a 180 reversal at a run (5.88) and at 2.5 m/s (speedCap)
for (const [name, gait, cap] of [["revRun", "run", Infinity], ["revSlow", "jog", 2.5]]){
  const p = prmTP(), m = createMover({yaw: 0}); const o = {};
  for (let k = 1; k <= 240; k++) moverStep(m, {dx: 0, dz: -1, gait, speedCap: cap}, p, FRESH, H);
  o.v0 = r(m.speed, 6); const z0 = m.z; let minZ = m.z, minV = m.speed;
  for (let k = 1; k <= 300; k++){
    moverStep(m, {dx: 0, dz: 1, gait, speedCap: cap}, p, FRESH, H);
    if (k === 1){ o.v1step = r(m.speed, 6); o.plant1 = m.plant; o.cut1 = r(m.cut, 6); }
    if (k === 6) o.v6 = r(m.speed, 6);
    if (k === 12) o.v12 = r(m.speed, 6);
    minZ = Math.min(minZ, m.z); if (m.speed < minV){ minV = m.speed; o.tMinV = r(k*H); }
    if (o.tHead == null && Math.abs(wrapA(m.heading - Math.PI)) < .05) o.tHead = r(k*H);
    if (o.tFace == null && Math.abs(wrapA(m.yaw - Math.PI)) < .05) o.tFace = r(k*H);
    const tg = Math.min(gait === "run" ? p.run : p.jog, cap);
    if (o.tBack90 == null && m.speed >= .9*tg && Math.abs(wrapA(m.heading - Math.PI)) < .05) o.tBack90 = r(k*H);
    if (k === 60){ o.z1 = r(m.z - z0, 6); o.vz1 = r(m.vz, 6); }
  }
  o.overshoot = r(z0 - minZ, 6); o.minV = r(minV, 6);
  out[name] = o;
}
// S5: from a stand, the keys a quarter turn right (+X): the turn on the spot first (turnFirst at 13 rad/s)
{
  const p = prmTP(), m = createMover({yaw: 0}); const o = {};
  for (let k = 1; k <= 120; k++){
    moverStep(m, {dx: 1, dz: 0, gait: "jog"}, p, FRESH, H);
    if (k === 1){ o.yaw1 = r(m.yaw, 6); o.v1 = r(m.speed, 6); }
    if (o.tMove == null && m.speed > .05) o.tMove = r(k*H), o.yawMove = r(m.yaw, 6);
    if (o.tFace == null && Math.abs(wrapA(m.yaw + Math.PI/2)) < 1e-3) o.tFace = r(k*H);
    if (k === 60) o.v1s = r(m.speed, 6), o.x1s = r(m.x, 6);
  }
  out.turnStand = o;
}
// S6: the smoothed wish (control.js wishStep, BCS) at a run: the keys a quarter turn right after 4 s straight
{
  const p = prmTP(), m = createMover({yaw: 0}); const o = {}; const Wsh = {on: false, yaw: 0};
  const wish = (kx, kz) => { const v = m.speed, ky = Math.atan2(-kx, -kz);
    if (!Wsh.on){ Wsh.on = true; Wsh.yaw = v < 1.2 ? ky : m.heading; }
    const e = wrapA(ky - Wsh.yaw);
    if (v < 1.2 || Math.abs(e) > 120*Math.PI/180) Wsh.yaw = ky;
    else { const w = Math.min(14, Math.max(4, 5*p.aLat*1/Math.max(v, .5))), lim = w*H; Wsh.yaw = wrapA(Wsh.yaw + Math.max(-lim, Math.min(lim, e))); }
    return {dx: -Math.sin(Wsh.yaw), dz: -Math.cos(Wsh.yaw)}; };
  for (let k = 1; k <= 240; k++){ const d = wish(0, -1); moverStep(m, {dx: d.dx, dz: d.dz, gait: "run"}, p, FRESH, H); }
  for (let k = 1; k <= 120; k++){
    const d = wish(1, 0); moverStep(m, {dx: d.dx, dz: d.dz, gait: "run"}, p, FRESH, H);
    if (k === 1){ o.wish1 = r(Wsh.yaw, 6); o.head1 = r(m.heading, 6); o.v1 = r(m.speed, 6); }
    if (o.tWish == null && Math.abs(wrapA(Wsh.yaw + Math.PI/2)) < 1e-6) o.tWish = r(k*H);
    if (o.tHead == null && Math.abs(wrapA(m.heading + Math.PI/2)) < .02) o.tHead = r(k*H);
    if (k === 15) o.v15 = r(m.speed, 6), o.cut15 = r(m.cut, 6);
  }
  o.minSpeedNote = "see vEnd"; o.vEnd = r(m.speed, 6);
  out.wish90 = o;
}
// S7: the carrier's gait clock at a steady 3 and 6 m/s (ck 1, run mode): footfalls and the strong foot's interval
for (const v of [3, 4.5, 6]){
  const g = G.createGait({mode: "R", ck: 1}); let t = 0; const falls = [];
  for (let k = 1; k <= 600; k++){ t = k*H; G.GQ[0] = v*H; G.GQ[1] = v; G.GQ[2] = 1; const ev = G.phaseAdvanceQ(g, "R"); for (const e of ev) falls.push({t: t - H + e.at*H, side: e.side}); }
  const R = falls.filter(f => f.side === "R"), iv = []; for (let i = 1; i < R.length; i++) iv.push(R[i].t - R[i - 1].t);
  out["carry" + v] = {step: r(G.stepLen(v, "R", 1, null, 1), 6), stepNoBall: r(G.stepLen(v, "R", 1, null, 0), 6), spm: r(60*G.cadence(v, "R", 1, null, 1), 3),
    stride: r(G.strideTime(v, "R", 1, 1), 6), duty: r(G.dutyOf(v, "R", 1), 6), swing: r(G.swingTime(v, "R", 1, 1), 6), falls10s: falls.length,
    strongIv: r(iv.reduce((s, x) => s + x, 0)/iv.length, 6), firstR: r(R[0].t, 6), carryW: r(G.carryW(v, 1), 6)};
}
out.walk = {step14: r(G.stepLen(1.4, "W"), 6), step2: r(G.stepLen(2.0, "W"), 6), stepRun5: r(G.stepLen(5, "R"), 6), carryW1_8: r(G.carryW(1.8, 1), 6), carryW8_5: r(G.carryW(8.5, 1), 6), stepCarry1_8W: r(G.stepLen(1.8, "W", 1, null, 1), 6)};
console.log(JSON.stringify(out, null, 1));
