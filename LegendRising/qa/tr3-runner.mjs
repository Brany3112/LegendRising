// qa/tr3-runner.mjs: the scenario runner and the body pool (BUILD-PLAN P3-B acceptance), and the Training UI, camera and
// HUD over a scenario in play.
// Owner: P3-B (TR-3). Contract: TRAINING-SPEC 0 (up to 6 against 6 plus a keeper, me counted, G0 decision h), 2 (HUD
// minimal, camera at eye level, ball readable), 4 (scenario lifecycle, resets restore the setup, the Training UI never
// covers the ball) and 8 (no rebuilds, nothing accumulating over 30 start and reset cycles).
//
// A test scenario is registered through the runner's own API: 2 against 2 plus a keeper in the Half cage, then the
// largest drill, 6 against 6 with me in my side's six, plus a keeper. 30 start, play and reset cycles in all.
//
//   node qa/tr3-runner.mjs
import {report, expect, snap, freeze, unfreeze} from "./lib.mjs";
import {trainLaunch, enterByButton, trainWrites, pressReal, lockPointer, clickReal} from "./tr3b-lib.mjs";

const res = {setup: null, cycles: [], counts: null, restore: [], ui: null, cam: null, ball: null, errors: []};
const check = (ok, what, got) => { if (!ok) res.errors.push(`${what}: ${JSON.stringify(got)}`); console.log(`${ok ? "ok  " : "FAIL"} ${what}`); };

const t = await trainLaunch({seed: 9});
const {page} = t;
try {
  await enterByButton(page);
  await pressReal(page, "Escape");
  await page.waitForFunction(() => !window.__trainHub.hubOpen(), null, {timeout: 10000});
  // the Half cage, and the test scenarios (through the runner's registerScenario, as a scenario module would)
  await page.evaluate(async () => {
    const C = await import("/js/life/train/cage.js");
    await C.cageEnter("half");
    const R = window.__trainRun;
    const build = (n, m) => (cfg, env) => {
      const hx = env.spec.hx;
      return {myTeam: 0, role: "Attacker", seed: 77, laws: {out: "rebound"},
        me: {slot: "CM", x: -6, z: 0, yaw: -Math.PI/2},
        mates: Array.from({length: n}, (_, i) => ({slot: ["LW", "RW", "ST", "CM", "CB"][i], x: -10 - 3*i, z: -14 + 7*i, yaw: -Math.PI/2})),
        opps: Array.from({length: m}, (_, i) => ({slot: ["CB", "CB", "LB", "RB", "CM", "CM"][i], x: 6 + 2.5*i, z: -12 + 5*i, yaw: Math.PI/2})),
        keeper: {side: "theirs", x: hx - 1.2, z: 0, yaw: Math.PI/2},
        ball: {x: -4.8, y: .11, z: 0}};
    };
    R.registerScenario({id: "qa-2v2", category: "attacking", name: "Test two against two", desc: "A test scenario", build: build(1, 2)});
    R.registerScenario({id: "qa-6v6", category: "attacking", name: "Test six against six", desc: "A test scenario", build: build(5, 6)});
  });
  await freeze(page);
  const base = await page.evaluate(async () => {
    const H = await import("/js/life/human.js"), L = window.__life, R = window.__trainRun, info = L.renderer().info.memory;
    window.__qaH = H;
    const ids = H.bodies().map(h => h.id);
    return {bodies: H.bodies().length, maxId: Math.max(...ids), pool: R.poolStats(), sched: L.sched.stats().counts, geo: info.geometries, tex: info.textures};
  });
  res.setup = base;
  check(base.pool.size === 14 && base.bodies === base.pool.size + 2, "the pool is built on entry: 14 bodies, bodies() = pool + 2 = 16", base);

  // 30 cycles: start, play a little, restart (every other cycle), check the setup is back exactly, stop
  let firstMem = null;
  for (let c = 0; c < 30; c++){
    const id = c < 15 ? "qa-2v2" : "qa-6v6";
    const r = await page.evaluate(({id, c}) => {
      const L = window.__life, R = window.__trainRun, H = window.__qaH;
      // (Esc out of the last one opened the hub, which lets the pointer go and so pauses play: it is closed and the
      // pointer taken again, as the hub's own Start does)
      if (window.__trainHub.hubOpen()) window.__trainHub.closeHub();
      L.FLAGS.lockLost = false;
      const before = {bodies: H.bodies().length, sched: L.sched.stats().counts};
      const ok = R.startScenario(id, {});
      const T = R.RUN.T, ms0 = T ? T.ms : null;
      const during = {bodies: H.bodies().length, pool: R.poolStats(), sched: L.sched.stats().counts, mode: L.modes.mode()};
      // every drawn body comes from the pool; no official's body anywhere in the scene
      const pooled = T && T.V ? T.V.rec.filter(Boolean).every(Rr => Rr.pooled) && T.V.fpPooled : false;
      let officials = 0; L.scene().traverse(o => { if (/^match-(22|23|24)$/.test(o.name)) officials++; });
      const step0 = ms0 ? ms0.step : 0;
      L.stepN(60);
      const stepped = T && T.ms ? T.ms.step - step0 : 0;
      const sameMs = T && T.ms === ms0;
      // a restart puts the setup back exactly
      let restore = null;
      if (c % 2 === 0){
        L.stepN(30);
        R.restart();
        const s = R.RUN.setup, ms = R.RUN.ms, me = ms.agents[ms.me];
        const places = [s.me, ...s.mates], err = {pos: 0, yaw: 0, ball: 0, vel: 0};
        const mine = ms.agents.filter(a => a.team === s.myTeam && a.role === "player" && !a.isGK);
        mine.forEach((a, i) => { const p = places[i]; if (p){ err.pos = Math.max(err.pos, Math.hypot(a.m.x - p.x, a.m.z - p.z)); err.yaw = Math.max(err.yaw, Math.abs(a.m.yaw - p.yaw)); } });
        const theirs = ms.agents.filter(a => a.team !== s.myTeam && a.team >= 0 && a.role === "player" && !a.isGK);
        theirs.forEach((a, i) => { const p = s.opps[i]; if (p){ err.pos = Math.max(err.pos, Math.hypot(a.m.x - p.x, a.m.z - p.z)); err.yaw = Math.max(err.yaw, Math.abs(a.m.yaw - p.yaw)); } });
        const b = ms.ball; err.ball = Math.hypot(b.p.x - s.ball.x, b.p.y - s.ball.y, b.p.z - s.ball.z); err.vel = Math.hypot(b.v.x - s.ball.vx, b.v.y - s.ball.vy, b.v.z - s.ball.vz);
        restore = Object.assign(err, {me: !!me, bodies: H.bodies().length, inUse: R.poolStats().inUse});
        L.stepN(30);
      }
      R.stopScenario("quit");
      L.stepN(5);
      const after = {bodies: H.bodies().length, pool: R.poolStats(), sched: L.sched.stats().counts, mode: L.modes.mode(), maxId: Math.max(...H.bodies().map(h => h.id))};
      const mem = L.renderer().info.memory;
      return {id, ok, before, during, after, pooled, officials, stepped, sameMs, restore, geo: mem.geometries, tex: mem.textures};
    }, {id, c});
    if (c === 0) firstMem = {geo: r.geo, tex: r.tex};
    res.cycles.push(r);
    if (r.restore) res.restore.push(r.restore);
  }
  const C = res.cycles, six = C.filter(r => r.id === "qa-6v6");
  check(C.every(r => r.ok), "every start succeeds", C.map(r => r.ok));
  check(C.every(r => r.before.bodies === 16 && r.during.bodies === 16 && r.after.bodies === 16), "bodies() is the pool + 2 = 16 before, during and after every scenario", C.map(r => [r.before.bodies, r.during.bodies, r.after.bodies]));
  check(C.every(r => r.after.maxId === base.maxId), "no body is built after the entry (no human() call)", C.map(r => r.after.maxId));
  check(C.every(r => r.officials === 0), "no body for the referee or the assistants", C.map(r => r.officials));
  check(C.every(r => r.pooled), "every drawn body comes from the pool", C.map(r => r.pooled));
  check(six.every(r => r.during.pool.inUse === 14), "6 v 6 with a keeper: all 14 pooled bodies in use", six.map(r => r.during.pool.inUse));
  check(C.every(r => r.during.mode === "train" && r.after.mode === "trainsb"), "a scenario plays in the mode train, and you walk again after it", C.map(r => [r.during.mode, r.after.mode]));
  check(C.every(r => r.during.sched.fixed === base.sched.fixed + 1 && r.stepped === 60), "a single scheduler task drives the simulation (one fixed task more, 60 steps in 60 frames)", C.map(r => [r.during.sched.fixed - base.sched.fixed, r.stepped]));
  check(C.every(r => r.after.sched.fixed === base.sched.fixed && r.after.sched.tasks === base.sched.tasks && r.after.sched.actors === base.sched.actors), "scheduler counts back where they were after every scenario", C.map(r => r.after.sched));
  check(C.slice(1).every(r => r.geo === firstMem.geo && r.tex === firstMem.tex), "renderer.info is +0 after the first cycle", C.map(r => [r.geo, r.tex]));
  check(res.restore.every(e => e.pos < .001 && e.yaw < 1e-6 && e.ball < .001 && e.vel < 1e-6), "a restart restores the setup exactly (positions within 1 mm, facing, ball position and velocity)", res.restore);
  check(res.restore.every(e => e.bodies === 16), "a restart builds nothing", res.restore.map(e => e.bodies));

  // the Training UI, the camera and the HUD over 600 frames of the 2 v 2 with the ball played all over the screen
  await unfreeze(page);
  await page.evaluate(() => { if (window.__trainHub.hubOpen()) window.__trainHub.closeHub(); window.__trainRun.startScenario("qa-2v2", {}); });
  // the measuring starts in play: the hub's sheet gone and the pause card (up while the pointer was free, P4-B) left with
  // its own Resume, as a player does. A click for the pointer made while either is still there lands on it instead,
  // and the 600 frames would then start over a card or a closing sheet (a flake under load)
  await page.waitForFunction(() => !document.querySelector("#sheetRoot.open") && !window.__trainHub.hubOpen(), null, {timeout: 15000});
  await page.waitForTimeout(500);
  if (await page.evaluate(() => window.__trainQuick.quickIsOpen() && !!document.querySelector('#fpOverlay.on [data-q="resume"]'))){
    await clickReal(page, '#fpOverlay [data-q="resume"]');
    await page.waitForFunction(() => !window.__trainQuick.quickIsOpen(), null, {timeout: 10000});
  }
  await lockPointer(page);
  await page.waitForFunction(() => !window.__trainQuick.quickIsOpen() && !document.querySelector("#fpOverlay.on") && !!document.pointerLockElement, null, {timeout: 10000});
  const ui = await page.evaluate(() => new Promise(done => {
    const L = window.__life, R = window.__trainRun, T = () => R.RUN.T, THREE = null;
    const out = {frames: 0, onScreen: 0, covered: [], thud: null, area: [], owners: {}, flips: 0, sideStart: null};
    const el = document.getElementById("trainHud");
    out.thud = el ? el.textContent.replace(/\s+/g, " ") : null;
    out.sideStart = el ? el.className : null;
    const cam = L.cam, W = innerWidth, H = innerHeight;
    // the ball put through the screen's regions: a grid of points in front of you at several distances and heights
    const spots = [];
    for (const d of [6, 12, 22]) for (const lat of [-.9, -.45, 0, .45, .9]) for (const up of [.1, .35, .7]) spots.push({d, lat, up});
    let k = 0;
    const tick = () => {
      const t = T(); if (!t){ out.err = "no run"; return done(out); }
      if (out.frames % 4 === 0){
        const s = spots[k++ % spots.length], me = t.me, yaw = window.__life.P.yaw, f = {x: -Math.sin(yaw), z: -Math.cos(yaw)}, r = {x: Math.cos(yaw), z: -Math.sin(yaw)};
        const b = t.ms.ball; b.p.x = me.m.x + f.x*s.d + r.x*s.lat*s.d*.7; b.p.z = me.m.z + f.z*s.d + r.z*s.lat*s.d*.7; b.p.y = .11 + s.up*s.d*.8; b.v.x = b.v.y = b.v.z = 0; b.state = "dead";
      }
      // where the ball is drawn now, against the card and the match HUD's boxes
      const bm = t.V && t.V.ball.mesh;
      if (bm){
        const v = bm.getWorldPosition(bm.position.clone()).project(cam);
        if (v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1){
          out.onScreen++;
          const x = (v.x + 1)/2*W, y = (1 - v.y)/2*H;
          // the Training UI's own layers (pointer-events none, so elementFromPoint looks through them): by their boxes
          const boxes = [document.getElementById("trainHud"), document.getElementById("trainIdle")].filter(Boolean);
          for (const e of boxes){ const q = e.getBoundingClientRect(); if (x >= q.left && x <= q.right && y >= q.top && y <= q.bottom) out.covered.push({f: out.frames, x, y, side: e.className}); }
          // and any other HTML that would take the eye or the click at the ball's centre (a card, a note, a prompt): the
          // element there has to be the 3D view's canvas (BUILD-PLAN P3-B acceptance, document.elementFromPoint)
          const top = document.elementFromPoint(Math.round(x), Math.round(y));
          if (top && top.tagName !== "CANVAS") { const sr = document.getElementById("sheetRoot");
            // (what was up, so a failure says which layer it was: the sheet's kind, the hub, the pause card, the admin panel, the pointer)
            out.covered.push({f: out.frames, x, y, over: top.id || top.className || top.tagName, sheet: sr ? sr.className + "/" + (sr.dataset.kind || "") : null,
              hub: window.__trainHub.hubOpen(), card: window.__trainQuick.quickIsOpen(), admin: !!(window.__trainAdmin && window.__trainAdmin.adminIsOpen()), lock: !!document.pointerLockElement}); }
        }
      }
      // the HUD's footprint: the card and the match HUD's visible boxes (not its full-screen effects layer)
      if (out.frames % 30 === 0){
        let a = 0;
        const add = e => { const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) return; const q = e.getBoundingClientRect(); a += Math.max(0, Math.min(q.right, W) - Math.max(q.left, 0))*Math.max(0, Math.min(q.bottom, H) - Math.max(q.top, 0)); };
        const th = document.getElementById("trainHud"); if (th) add(th);
        const fp = document.getElementById("fpHud");
        if (fp) for (const c of fp.children){ if (c.classList.contains("fp-fx")) continue; const q = c.getBoundingClientRect(); if (q.width*q.height > W*H*.5) continue; add(c); }
        out.area.push(a/(W*H));
      }
      const o = L.cam.top(); out.owners[o] = (out.owners[o] || 0) + 1;
      if (el && el.className !== out.sideStart){ out.flips++; out.sideStart = el.className; }
      if (++out.frames >= 600) return done(out);
      window.__qa.realRAF(tick);
    };
    window.__qa.realRAF(tick);
  }));
  res.ui = ui;
  check(/Test two against two/.test(ui.thud || "") && /Attacker/.test(ui.thud) && /2 v 2/.test(ui.thud) && /Keeper on/.test(ui.thud) && /No preset/.test(ui.thud) && /Backspace/.test(ui.thud) && /replay/.test(ui.thud) && /pick another/.test(ui.thud),
    "the Training HUD shows the scenario, role, counts, keeper, preset and the restart and replay hints (no settings hint until a scenario has settings, P4)", ui.thud);
  check(ui.onScreen > 100 && ui.covered.length === 0, "the Training HUD never covers the ball", {onScreen: ui.onScreen, covered: ui.covered.slice(0, 5), flips: ui.flips});
  check(ui.area.every(a => a <= .10), "the Training HUD and the match HUD cover at most 10% of the screen", ui.area.map(a => +a.toFixed(4)));
  check(Object.keys(ui.owners).every(o => o === "match-fp" || o === "match-cine"), "the camera's owner is match-fp throughout", ui.owners);
  await snap(page, "tr3-runner-2v2");

  // the camera at eye level and steady: stepped frames with you running and turning (a restart is a cut)
  await freeze(page);
  res.cam = await page.evaluate(() => {
    const L = window.__life, R = window.__trainRun, TR = window.__train, cam = L.cam;
    const T = R.RUN.T, me = T.me, out = {maxStep: 0, eyeErr: 0, frames: 0};
    let prev = null;
    TR.input({type: "keydown", key: "w"}); TR.input({type: "keydown", key: "shift"});
    for (let i = 0; i < 240; i++){
      if (i === 120) TR.input({type: "keyup", key: "shift"});
      if (i % 40 === 20) TR.input({type: "move", dx: 120, dy: 0});
      L.stepN(1);
      const p = cam.position.clone();
      if (prev) out.maxStep = Math.max(out.maxStep, p.distanceTo(prev));
      prev = p;
      out.eyeErr = Math.max(out.eyeErr, Math.abs((L.P.eye - L.P.feet) - 1.68*(me.scale || 1)));
      out.frames++;
    }
    TR.input({type: "keyup", key: "w"});
    return out;
  });
  check(res.cam.eyeErr <= .01, "the eye is at 1.68 x the body's scale (within 1 cm)", res.cam);
  check(res.cam.maxStep <= .15, "the camera never moves more than 0.15 m in one frame", res.cam);
  // the ball readable: at 40 m it is at least 3 px across on screen
  res.ball = await page.evaluate(() => {
    const L = window.__life, R = window.__trainRun, T = R.RUN.T, cam = L.cam;
    const yaw = L.P.yaw, f = {x: -Math.sin(yaw), z: -Math.cos(yaw)}, b = T.ms.ball;
    b.p.x = T.me.m.x + f.x*40; b.p.z = T.me.m.z + f.z*40; b.p.y = .11; b.state = "dead"; b.v.x = b.v.y = b.v.z = 0;
    L.stepN(2);
    const bm = T.V.ball.mesh, c = bm.getWorldPosition(bm.position.clone()), up = c.clone(); up.y += .11*bm.scale.y;
    const a = c.clone().project(cam), u = up.project(cam);
    const d = Math.hypot(c.x - cam.position.x, c.y - cam.position.y, c.z - cam.position.z);
    return {d, px: 2*Math.abs(u.y - a.y)/2*innerHeight, scale: bm.scale.x};
  });
  check(res.ball.px >= 3 - 1e-6, "the ball is at least 3 px across at 40 m", res.ball);
  await page.evaluate(() => window.__trainRun.stopScenario("quit"));
  check(!(await trainWrites(page)).length, "no career write while Training ran", await trainWrites(page));
} catch(e){ res.errors.push("tr3-runner: " + (e && e.stack || e)); }
finally {
  res.errors.push(...page.errors.map(x => "page: " + x));
  report("tr3-runner", res);
  await t.close();
}
expect(!res.errors.length, res.errors.join("\n"));
console.log("tr3-runner: pass");
