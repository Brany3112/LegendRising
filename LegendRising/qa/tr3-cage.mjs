// qa/tr3-cage.mjs: Training Mode's cages (Node, then the browser), for each kind (Full, Half, One goal):
//   - rolling, lofted and driven balls at the corners and the sides stay inside the fence and under the roof;
//   - out 'rebound' emits no out and play goes on; out 'stop' emits an out and a restart (the simulation itself);
//   - the brains' prediction of the ball never leaves the cage in rebound mode (rules.js turns the fences on for it);
//   - the One-goal cage has exactly one goal, with clipped markings (none outside its area);
//   - the cage costs at most 13 draw calls on Low (the whole scene, from the spawn and looking back across it; your own
//     body seen from behind in third person is one of them);
//   - cageEnter to every other kind rebuilds it (the spec, the goals, the anchors) and fires train:cage.
// Owner: P3-A (Training Mode, Phase 3). Contract: BUILD-PLAN P3-A acceptance "qa/tr3-cage.mjs"; TRAINING-SPEC 0 and 4.
//
//   QA_PORT=8860 node qa/tr3-cage.mjs        exits 1 on any failed check; writes qa/out/tr3-cage.json
import {CAGE_KINDS, cagePitch, cageDraw} from "../js/life/football/cagespec.js";
import {createBall, createBallWorld, ballStep, ballKick, ballPredict, BALL} from "../js/life/football/ball.js";
import {createMatch, simStep} from "../js/life/football/sim.js";
import {configFor} from "./harness.mjs";
import {launch, trainingStart, freeze, report, snap} from "./lib.mjs";

const res = {name: "tr3-cage", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const H = 1/60, R = BALL.R, r3 = v => Math.round(v*1000)/1000;

/* ---------- Node: the ball against the fence and the roof ---------- */
for (const kind of CAGE_KINDS){
  const spec = cagePitch(kind), F = spec.cage.fence;
  const shots = [];
  // from a few places on the pitch, at every corner and the middle of every side: rolling, lofted and driven
  const from = [[0, 0], [spec.hx*.6, spec.hz*.5], [-spec.hx*.5, -spec.hz*.4]];
  const at = [];
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 0, 1]) if (sx || sz) at.push([sx*F.hx, sz*F.hz]);
  const kinds = {rolling: [26, 0], lofted: [22, 16], driven: [34, 5]};
  let worst = {x: 0, z: 0, y: 0}, escaped = 0, n = 0;
  for (const [fx, fz] of from) for (const [tx, tz] of at) for (const [nm, [sp, up]] of Object.entries(kinds)){
    const bw = createBallWorld({spec});
    const b = createBall({x: fx, z: fz, rollDecel: spec.roll});
    const dx = tx - fx, dz = tz - fz, d = Math.hypot(dx, dz);
    ballKick(b, {x: dx/d*sp, y: up, z: dz/d*sp}, {x: 0, y: 0, z: 0}, {agent: 1, team: 0, kind: 'shot', t: 0});
    let out = false;
    for (let i = 0; i < 60*8; i++){
      ballStep(b, bw, H);
      const ax = Math.abs(b.p.x), az = Math.abs(b.p.z);
      worst.x = Math.max(worst.x, ax); worst.z = Math.max(worst.z, az); worst.y = Math.max(worst.y, b.p.y);
      if (ax > F.hx || az > F.hz || b.p.y > F.h) out = true;
    }
    n++; if (out){ escaped++; shots.push(nm + "@" + tx + "," + tz); }
  }
  check(escaped === 0, `${kind}: ${n} rolling, lofted and driven balls at the corners and sides all stay inside the fence and under the roof`,
    {escaped, worst: {x: r3(worst.x), z: r3(worst.z), y: r3(worst.y)}, fence: F, first: shots.slice(0, 3)});
}

/* ---------- Node: the law out, and the prediction, in a real simulation on each cage ---------- */
function cageMatch(kind, out){
  const cfg = configFor(21); cfg.mode = 'train'; cfg.rules = {out}; cfg.spec = cagePitch(kind);
  const ms = createMatch(cfg);
  ms.phase = 'live'; ms.clock.running = true; ms.restart = null;
  // everybody far from the ball's line, so nobody plays it
  for (const a of ms.agents) if (a.role === 'player'){ a.m.x = ms.spec.hx*.8*(a.team ? 1 : -1); a.m.z = (a.id % 11) - 5; a.m.vx = a.m.vz = a.m.speed = 0; }
  return ms;
}
for (const kind of CAGE_KINDS){
  for (const out of ['rebound', 'stop']){
    const ms = cageMatch(kind, out), F = ms.spec.cage.fence, b = ms.ball;
    b.state = 'free'; b.p.x = 0; b.p.y = R; b.p.z = ms.spec.hz*.3; b.v.x = 0; b.v.y = 9; b.v.z = 20; b.last.team = 0; b.last.agent = 1; b.inField = null;
    const n0 = ms.events.length;
    let maxZ = 0, maxY = 0;
    // the brains' prediction through the flight, in rebound mode: never past the fence
    const pred = new Float32Array(4*120); let predOut = 0, predN = 0;
    for (let i = 0; i < 60*4; i++){
      simStep(ms, H);
      maxZ = Math.max(maxZ, Math.abs(ms.ball.p.z)); maxY = Math.max(maxY, ms.ball.p.y);
      if (out === 'rebound' && i % 10 === 5 && ms.ball.state === 'free'){
        const k = ballPredict(ms.ball, ms.bw, pred, 120, 30);
        for (let j = 0; j < k; j++){ predN++; const x = pred[4*j], y = pred[4*j + 1], z = pred[4*j + 2]; if (Math.abs(x) > F.hx || Math.abs(z) > F.hz || y > F.h) predOut++; }
      }
    }
    const outs = ms.events.slice(n0).filter(e => e.kind === 'out');
    if (out === 'rebound'){
      check(outs.length === 0 && !ms.restart && ms.phase === 'live', `${kind}: rebound mode emits no out, play goes on`, {outs: outs.length, restart: ms.restart && ms.restart.kind, phase: ms.phase});
      check(maxZ < F.hz && maxY < F.h, `${kind}: the lofted ball over the touchline comes back off the fence`, {maxZ: r3(maxZ), maxY: r3(maxY), F});
      check(predN > 0 && predOut === 0 && ms.bw.predFence === true, `${kind}: the prediction never leaves the cage (${predN} samples)`, {predOut, predFence: ms.bw.predFence});
    } else {
      check(outs.length >= 1 && ms.restart && (ms.restart.kind === 'throw' || ms.restart.kind === 'indirect'), `${kind}: stop mode emits an out and a restart`, {outs: outs.length, restart: ms.restart && ms.restart.kind});
      check(!ms.bw.predFence, `${kind}: stop mode leaves the prediction as a match's`);
    }
  }
  // a goal at the real goal still counts in rebound mode; over a goalless end it plays on
  {
    const ms = cageMatch(kind, 'rebound'), b = ms.ball, g = ms.spec.goals.find(x => x.end === 1);
    b.state = 'free'; b.p.x = g.lineX - 12; b.p.y = R; b.p.z = 0; b.v.x = 26; b.v.y = 2; b.v.z = 0; b.last.team = ms.dirs[0] === 1 ? 0 : 1; b.last.agent = 2; b.inField = null;
    for (const a of ms.agents) if (a.isGK){ a.m.x = -999; a.m.z = 0; a.onPitch = false; }
    const n0 = ms.events.length;
    for (let i = 0; i < 60*2; i++) simStep(ms, H);
    const goals = ms.events.slice(n0).filter(e => e.kind === 'goal' && !e.disallowed);
    check(goals.length === 1, `${kind}: a ball into the real goal is still a goal in rebound mode`, goals.length);
  }
  // (a cage cut from a pitch with an end left open; the cages of the pitch types, U28 part F, are whole pitches with a
  // goal at each end)
  if (kind !== 'full' && cageMatch(kind, 'rebound').spec.goals.length < 2){
    const ms = cageMatch(kind, 'rebound'), b = ms.ball;
    b.state = 'free'; b.p.x = -ms.spec.hx + 6; b.p.y = R; b.p.z = 0; b.v.x = -24; b.v.y = 1; b.v.z = 0; b.last.team = 0; b.last.agent = 1; b.inField = null;
    for (const a of ms.agents) if (a.role === 'player'){ a.m.x = ms.spec.hx*.8; }
    const n0 = ms.events.length;
    for (let i = 0; i < 60*2; i++) simStep(ms, H);
    const ev = ms.events.slice(n0).filter(e => e.kind === 'goal' || e.kind === 'out');
    check(ev.length === 0 && ms.phase === 'live' && Math.abs(ms.ball.p.x) < ms.spec.cage.fence.hx, `${kind}: over the end with no goal, play goes on off the fence`, {ev: ev.map(e => e.kind), x: r3(ms.ball.p.x)});
  }
}
{
  const s = cagePitch('onegoal'), D = cageDraw('onegoal'), tol = .061;
  const pts = D.lines.flatMap(l => l.type === 'seg' ? [[l.x0, l.z0], [l.x1, l.z1]] : [0, .25, .5, .75, 1].map(t => { const a = l.a0 + (l.a1 - l.a0)*t; return [l.cx + l.r*Math.cos(a), l.cz + l.r*Math.sin(a)]; }));
  check(s.goals.length === 1 && s.colliders.nets.length === 1, "one goal: exactly one goal (posts, bar and net)", s.goals.length);
  check(pts.every(([x, z]) => Math.abs(x) <= s.hx + tol && Math.abs(z) <= s.hz + tol), "one goal: every marking is clipped to the area", D.lines.length);
}

/* ---------- the browser: each kind built, its draw calls on Low, cageEnter between kinds ---------- */
{
  const {page, close, errors} = await launch({gfx: "low", seed: 5});
  try {
    await trainingStart(page, {kind: "full"});
    await freeze(page);
    await page.evaluate(() => { window.__cages = []; addEventListener("train:cage", e => window.__cages.push(e.detail.kind)); });
    for (const kind of ["full", "half", "onegoal", "full"]){
      const m = await page.evaluate(async kind => {
        const L = window.__life, sb = await import("/js/life/train/sandbox.js");
        if (sb.CAGE.kind !== kind){
          // cageEnter waits for frames drawn: let the page's own loop run for it
          const qa = window.__qa; qa.frozen = false; const q = [...qa.queue.values()]; qa.queue.clear(); for (const cb of q) requestAnimationFrame(cb);
          await sb.cageEnter(kind);
          await new Promise(r => { qa.frozen = true; qa.realRAF(() => qa.realRAF(() => r())); });
        }
        const r = L.renderer(), C = sb.CAGE;
        const calls = [];
        for (const yaw of [0, Math.PI, Math.PI/2, -Math.PI/2]){
          L.P.yaw = yaw; L.stepN(2);
          r.render(L.scene(), L.cam); calls.push(r.info.render.calls);
        }
        const goals = C.spec.goals.length, nets = L.scene().getObjectByName("pitch-nets");
        return {kind: C.kind, calls, goals, ends: C.goalEnds, anchors: Object.keys(C.anchors).length, zone: L.LIFE.zone, fence: !!C.fence, mode: L.modes.mode(), S: S === null,
          P: {x: +L.P.x.toFixed(2), z: +L.P.z.toFixed(2)}, netVerts: nets ? nets.geometry.attributes.position.count : 0};
      }, kind);
      check(m.kind === kind && m.zone === "cage" && m.mode === "trainsb" && m.S, `${kind}: the cage is built in Training, no career`, {kind: m.kind, mode: m.mode});
      // (13 since U29: the cage view is behind you in third person, your whole body in it, one call more)
      check(Math.max(...m.calls) <= 13, `${kind}: the cage costs at most 13 draw calls on Low (12, and your own body seen from behind)`, m.calls);
      check(m.goals === (kind === "full" ? 2 : 1) && m.anchors === 7, `${kind}: its goals and the seven cone anchors`, {goals: m.goals, ends: m.ends, anchors: m.anchors});
      await snap(page, "tr3-cage-" + kind);
    }
    const seen = await page.evaluate(() => window.__cages);
    check(seen.join() === "half,onegoal,full", "train:cage fires after every build, with its kind", seen);
    check(errors.length === 0, "no console or page error", errors.slice(0, 3));
    await page.evaluate(() => import("/js/life/train/sandbox.js").then(m => m.exitTraining()));
  } finally { await close(); }
}

report("tr3-cage", res);
console.log(`${res.checks.filter(c => c.pass).length}/${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
