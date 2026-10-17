// qa/uf2-feel.mjs: the player's controls and feel made easier, readable and rewarding (USER-ISSUES Round 2: U12, U17,
// U18, U19, U20), in the real game with real input (page.keyboard, page.mouse, the pointer locked by a real click).
// Owner: UF2-A (stage UF2). Contract: plan/USER-ISSUES.md Round 2 and TRAINING-SPEC 2 (camera, HUD never covering the
// ball, passing and shooting with feedback). Training Mode's runner plays a scenario of the test's own (qa-uf2: you and
// two team-mates against an empty pitch, the ball at your feet or launched to you), on the same engine, controls, view
// and HUD as a career match and the career's training sessions (one control.js, view.js, matchcam.js, fphud.js).
//
//   U12  the first-person body under the eye at 1.60, 1.75 and 1.95 m: idle, walking, jogging, sprinting and paused
//        (a real Esc), looking down: the feet under the camera (never out ahead of it as if sitting), the hands at the
//        sides; through a slide the eye goes down with the body and after it the body is under the eye again; shots
//        idle-<h>.png and paused.png
//   U20  the kick type always in its corner (visible with nothing held), the wheel (real) and 1, 2, 3 change it before
//        the kick, and the strike is the type chosen (a Chip is chipped)
//   U18  holding LMB (real) fills one meter under the crosshair with its sweet spot marked; let go in it and the strike
//        is clean (the kick logged clean, Clean strike!, the camera's kick); past it, not; the meter never covers the
//        ball; a shot into the net ripples it
//   U19  a tap of RMB (real) well off a team-mate (outside the plain pass cone) goes to him with the assists on and not with them off; a tap is
//        weighted for the distance (a longer pass is struck harder and both arrive at about 9 m/s)
//   U17  F held as the ball arrives settles it on the preferred foot within reach; with the assists, standing still
//        settles it too; a push touch (W held, assists off) leaves it further; dribbling at a jog keeps the ball closer
//        than sprinting does
//   and no console or page error.
//
//   QA_PORT=8900 node qa/uf2-feel.mjs          exits 1 on any failed check; writes qa/out/uf2-feel.json and qa/out/uf2/*.png
//   UF2_ONLY=body,kick,meter,pass,touch       runs only those parts (a rerun of one failure)
import fs from "node:fs";
import path from "node:path";
import {report, OUT, freeze, unfreeze} from "./lib.mjs";
import {trainLaunch, enterByButton, closeHubReal, lockPointer, pressReal, clickReal, assertVisible, cardUp, frames} from "./tr4b-lib.mjs";

const DIR = path.join(OUT, "uf2");
fs.mkdirSync(DIR, {recursive: true});
const res = {body: {}, slide: null, kick: null, meter: null, pass: null, touch: null, errors: [], console: []};
const check = (ok, what, got) => { if (!ok) res.errors.push(`${what}: ${JSON.stringify(got).slice(0, 1500)}`); console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok ? "" : ": " + JSON.stringify(got).slice(0, 700)}`); };
const ONLY = process.env.UF2_ONLY ? new Set(process.env.UF2_ONLY.split(",")) : null, on = k => !ONLY || ONLY.has(k);

const t = await trainLaunch({seed: 6});
const page = t.page;
const shot = async name => {
  await page.evaluate(() => { const f = document.getElementById("lifeFade"); if (f){ f.style.transition = "none"; f.style.opacity = "0"; } });
  await unfreeze(page); await frames(page, 8);
  const file = path.join(DIR, name + ".png");
  await page.screenshot({path: file, timeout: 180000});
  await freeze(page);
  console.log("  shot", path.relative(process.cwd(), file));
};
const step = n => page.evaluate(n => window.__life.stepN(n), n);
// a HUD element on screen (the HUD lets the pointer through, so elementFromPoint finds the canvas under it): shown,
// opaque enough, inside the view, small, and its pixels drawn (not the same colour throughout)
const shown = async sel => {
  const r = await page.evaluate(sel => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
    let op = 1; for (let n = e; n && n.nodeType === 1; n = n.parentElement) op *= +getComputedStyle(n).opacity;
    return {x: b.left, y: b.top, w: b.width, h: b.height, op, display: cs.display, vis: cs.visibility, vw: innerWidth, vh: innerHeight}; }, sel);
  if (!r) return {ok: false, why: "missing"};
  const inView = r.x >= 0 && r.y >= 0 && r.x + r.w <= r.vw && r.y + r.h <= r.vh && r.w > 20 && r.h > 20;
  const png = await page.screenshot({clip: {x: r.x, y: r.y, width: r.w, height: r.h}});
  const lum = await page.evaluate(async b64 => { const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode(); const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let lo = 255, hi = 0; for (let i = 0; i < d.length; i += 4){ const l = (d[i] + d[i + 1] + d[i + 2])/3; lo = Math.min(lo, l); hi = Math.max(hi, l); } return {lo, hi}; }, png.toString("base64"));
  return Object.assign(r, {lum, ok: inView && r.op > .6 && r.display !== "none" && r.vis !== "hidden" && lum.hi - lum.lo > 60});
};

try {
  await enterByButton(page);
  await closeHubReal(page);
  // the test's scenario, registered through the runner's own API (as a scenario module does); and the page's probes
  await page.evaluate(async () => {
    const R = window.__trainRun;
    const C = await import("/js/life/football/control.js"), M = await import("/js/life/football/matchcam.js"), ST = await import("/js/life/football/strike.js");
    const {THREE} = await import("/js/life/build.js");
    const build = (cfg, env) => {
      const hx = env.spec.hx, me = {slot: "ST", x: hx - 22, z: 0, yaw: -Math.PI/2};
      if (cfg.scale) me.scale = cfg.scale;
      if (cfg.foot) me.foot = cfg.foot;
      const ball = cfg.ball === "far" ? {x: hx - 40, y: .11, z: 14, free: true} : {x: me.x + .55, y: .11, z: .12, free: true};
      if (cfg.launch){
        // a ball played to you from in front: from (fx, fz) metres off you, to your feet at speed
        const L = cfg.launch, from = {x: me.x + L.fx, y: .11, z: me.z + L.fz};
        const r = ST.solveStrike({from, target: {x: me.x, y: .11, z: me.z}, speed: L.speed, contact: 0, curl: 0, foot: "R", kind: "pass", rollDecel: env.spec.roll});
        Object.assign(ball, from, {vx: r.v.x, vy: r.v.y, vz: r.v.z, wx: r.w.x, wy: r.w.y, wz: r.w.z, kind: "pass", free: true});
      }
      const mates = (cfg.mates || [[8, -10], [-3, 25]]).map(([dx, dz], i) => ({slot: ["LW", "RW", "CM"][i], x: me.x + dx, z: me.z + dz, yaw: -Math.PI/2}));
      return {myTeam: 0, role: "Attacker", seed: 11, laws: {out: "rebound"}, me, mates, opps: [], keeper: null, ball};
    };
    if (!R.scenario("qa-uf2")) R.registerScenario({id: "qa-uf2", category: "attacking", type: "qauf2", name: "Feel test", desc: "A test scenario", build});
    const BN = ["root", "hips", "spine", "chest", "neck", "head", "uaL", "faL", "haL", "uaR", "faR", "haR", "thL", "shL", "ftL", "toL", "thR", "shR", "ftR", "toR"];
    const v = new THREE.Vector3();
    window.__uf2 = {C, M,
      T: () => R.RUN.cur && R.RUN.cur.T, ms: () => R.RUN.ms,
      start: cfg => { if (R.RUN.cur) R.stopScenario("hub"); if (window.__trainHub.hubOpen()) window.__trainHub.closeHub(); return R.startScenario("qa-uf2", cfg); },
      // the body in your eyes in the camera's own yaw frame, in units of your height's scale: [ahead, right, down]
      body(){
        const L = window.__life, T = R.RUN.cur.T, h = T.V.fp, c = L.cam, s = h.scale || 1;
        c.updateMatrixWorld(true); h.g.updateMatrixWorld(true);
        const yaw = L.P.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw), o = {s, agentScale: T.me.scale, pitch: L.P.pitch, visible: h.g.visible, clip: T.V.rec[T.me.id] && T.V.rec[T.me.id].clip ? T.V.rec[T.me.id].clip.mode : null, act: T.me.act ? T.me.act.kind : null, head: [window.__uf2.M.MC.head.x, window.__uf2.M.MC.head.y, window.__uf2.M.MC.head.z].map(v => Math.round(v*1000)/1000)};
        for (const n of ["hips", "neck", "ftL", "ftR", "toL", "toR", "haL", "haR"]){
          h.bones[BN.indexOf(n)].getWorldPosition(v);
          const dx = v.x - c.position.x, dz = v.z - c.position.z;
          o[n] = [(dx*fx + dz*fz)/s, (dx*rx + dz*rz)/s, (c.position.y - v.y)/s].map(q => Math.round(q*1000)/1000);
        }
        return o;
      },
      kickEv: (from = 0) => { const ms = R.RUN.ms, me = ms.me; return ms.events.slice(from).filter(e => e.kind === "kick" && e.agent === me); },
      touchEv: (from = 0) => { const ms = R.RUN.ms, me = ms.me; return ms.events.slice(from).filter(e => e.kind === "touch" && e.agent === me && e.how === "control"); },
      ballRel(){ const ms = R.RUN.ms, me = ms.agents[ms.me], b = ms.ball, f = {x: -Math.sin(me.m.yaw), z: -Math.cos(me.m.yaw)}, dx = b.p.x - me.m.x, dz = b.p.z - me.m.z;
        return {d: Math.hypot(dx, dz), ahead: dx*f.x + dz*f.z, v: Math.hypot(b.v.x - me.m.vx, b.v.z - me.m.vz), mine: ms.poss.ctl === me.id, speed: me.m.speed}; },
      // where an element is on screen, and whether a screen point is inside it
      rect: sel => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return {x0: b.left, y0: b.top, x1: b.right, y1: b.bottom, op: +getComputedStyle(e).opacity}; },
      ballScreen(){ const ms = R.RUN.ms, T = R.RUN.cur.T, F = T.F || {cx: 0, cz: 0}, cam = window.__life.cam, p = new THREE.Vector3(ms.ball.p.x + F.cx, ms.ball.p.y, ms.ball.p.z + F.cz).project(cam);
        return {x: (p.x + 1)/2*innerWidth, y: (1 - p.y)/2*innerHeight, front: p.z < 1}; },
      look(yaw, pitch){ const P = window.__life.P; if (yaw != null) P.yaw = yaw; if (pitch != null) P.pitch = pitch; }
    };
  });
  // the pointer locked by a real click, then the mouse brought to the corner: headless Chromium reports each mouse event
  // under the lock as a movement from (0, 0), so a button pressed anywhere else would also turn the view (a sweep, read
  // as a curl). From the corner a press moves nothing; the look is then set where each part wants it
  const lock = async () => { const id = await lockPointer(page); if (!id) throw new Error("the pointer could not be locked"); await page.mouse.move(0, 0); await step(12); return id; };

  /* ---------- U12: the body under the eye ---------- */
  if (on("body")){
    const heights = process.env.UF2_H ? process.env.UF2_H.split(",").map(Number) : [1.60, 1.75, 1.95];
    for (const H of heights){
      const scale = await page.evaluate(H => window.__trainConfig.scaleOfHeight(H), H);
      await page.evaluate(scale => window.__uf2.start({scale}), scale);
      await page.waitForFunction(() => !!(window.__trainRun.RUN.cur && window.__trainRun.RUN.cur.T && window.__trainRun.RUN.cur.T.V), null, {timeout: 60000});
      await unfreeze(page); await frames(page, 10);
      await lock();
      await freeze(page);
      const out = res.body[H] = {scale};
      // idle, looking down at your feet
      await page.evaluate(() => window.__uf2.look(-Math.PI/2, -1.0));
      await step(60);
      out.idle = await page.evaluate(() => window.__uf2.body());
      await shot(`idle-${H.toFixed(2)}`);
      // walking (X toggles the walk), jogging and sprinting: real keys, sampled every 4 frames
      const moving = async (keys, n = 90) => {
        for (const k of keys) await page.keyboard.down(k);
        const S = [];
        await step(30);
        for (let i = 0; i < n/4; i++){ await step(4); S.push(await page.evaluate(() => window.__uf2.body())); }
        for (const k of keys.slice().reverse()) await page.keyboard.up(k);
        await step(40);
        return S;
      };
      await pressReal(page, "x");
      out.walk = await moving(["w"]);
      await pressReal(page, "x");
      out.jog = await moving(["w"]);
      out.sprint = await moving(["Shift", "w"]);
      // paused: a real Esc, the card up, the simulation held
      await page.evaluate(() => window.__uf2.look(null, -1.0));
      await unfreeze(page);
      await page.keyboard.down("w"); await frames(page, 20);
      await pressReal(page, "Escape");
      await page.keyboard.up("w");
      await cardUp(page);
      await frames(page, 45);
      out.paused = await page.evaluate(() => Object.assign(window.__uf2.body(), {held: window.__trainRun.RUN.paused, fpHeld: window.__uf2.T().V.fpHeldNow}));
      if (H === 1.75) await shot("paused");
      await unfreeze(page);
      await clickReal(page, '#fpOverlay [data-q="resume"]');
      await page.waitForFunction(() => !!document.pointerLockElement, null, {timeout: 10000}).catch(() => {});
      await freeze(page);
      const s = out.idle.s;
      check(Math.abs(s - scale) < .002 && Math.abs(out.idle.agentScale - scale) < .002, `${H} m: the body in your eyes and your agent at the height's scale`, {s, agent: out.idle.agentScale, scale});
      // standing (idle and paused): the feet under the camera, the toes at most a little ahead, the hands at your sides
      for (const st of ["idle", "paused"]){
        const b = out[st];
        const feetOk = ["ftL", "ftR"].every(k => b[k][0] >= -.32 && b[k][0] <= .12 && Math.abs(b[k][1]) <= .25 && b[k][2] >= 1.3 && b[k][2] <= 1.8);
        const toesOk = ["toL", "toR"].every(k => b[k][0] >= -.25 && b[k][0] <= .3);
        const handsOk = ["haL", "haR"].every(k => Math.abs(b[k][1]) >= .12 && Math.abs(b[k][1]) <= .45 && b[k][0] >= -.35 && b[k][0] <= .2 && b[k][2] >= .5 && b[k][2] <= 1.0);
        check(feetOk && toesOk, `${H} m ${st}: the feet under the camera (ankles within -0.32..0.12 of it ahead, 1.3 to 1.8 below), the toes just ahead at most`, b);
        check(handsOk, `${H} m ${st}: the hands hang at your sides (0.12 to 0.45 out, 0.5 to 1.0 below, not ahead)`, {haL: b.haL, haR: b.haR});
        check(b.hips[0] >= -.32 && b.hips[0] <= .12 && b.hips[2] >= .5 && b.hips[2] <= .85, `${H} m ${st}: the hips under the camera`, b.hips);
      }
      check(out.paused.held === true && out.paused.fpHeld === true, `${H} m: a real Esc holds the scenario and your body stands at ease`, {held: out.paused.held, fp: out.paused.fpHeld});
      // moving: never the legs out ahead of the eye (the sitting look: a foot further ahead than half its depth below)
      for (const st of ["walk", "jog", "sprint"]){
        const S = out[st], worst = {ahead: -9, ratio: -9, low: 9, hips: 9, hand: 9};
        for (const b of S) for (const k of ["ftL", "ftR"]){
          worst.ahead = Math.max(worst.ahead, b[k][0]); worst.ratio = Math.max(worst.ratio, b[k][0]/b[k][2]); worst.low = Math.min(worst.low, b[k][2]);
          worst.hips = Math.min(worst.hips, b.hips[2]); worst.hand = Math.min(worst.hand, b.haL[2], b.haR[2]);
        }
        check(worst.ahead <= .85 && worst.ratio <= .6 && worst.low >= 1.05 && worst.hips >= .5 && worst.hand >= .3, `${H} m ${st}: the feet stay under and around the camera through the stride (never out ahead as if sitting)`, worst);
      }
    }
    // the slide: the eye goes down with the body, and after it the body is under the eye again (its clip ended)
    await page.evaluate(() => window.__uf2.start({ball: "far"}));
    await page.waitForFunction(() => !!(window.__trainRun.RUN.cur && window.__trainRun.RUN.cur.T && window.__trainRun.RUN.cur.T.V), null, {timeout: 60000});
    await freeze(page);
    res.slide = await page.evaluate(async () => {
      const U = window.__uf2, ms = U.ms(), me = ms.agents[ms.me], A = await import("/js/life/football/actions.js"), M = U.M;
      U.look(-Math.PI/2, -.9);
      window.__train.input({type: "keydown", key: "w"}); window.__train.input({type: "keydown", key: "shift"});
      window.__life.stepN(90);
      const f = {x: -Math.sin(me.m.yaw), z: -Math.cos(me.m.yaw)};
      ms.ball.p.x = me.m.x + f.x*1.6; ms.ball.p.z = me.m.z + f.z*1.6; ms.ball.v.x = ms.ball.v.z = 0; ms.ball.state = "free"; ms.poss.ctl = -1; A.refreshPred(ms);
      const act = A.startAction(ms, me, {kind: "slide", target: "ball"});
      let low = 9, neckGap = 0, during = 0; const gaps = [];
      for (let i = 0; i < 40; i++){ window.__life.stepN(1); const b = U.body(); low = Math.min(low, window.__life.cam.position.y); if (me.act && me.act.kind === "slide"){ during++; gaps.push(b.neck[2]); if (during > 12) neckGap = Math.max(neckGap, b.neck[2]); } }
      for (let i = 0; i < 150 && me.act; i++) window.__life.stepN(1);
      window.__life.stepN(70);
      const after = U.body(), clip = U.T().V.rec[me.id].clip;
      window.__train.input({type: "keyup", key: "w"}); window.__train.input({type: "keyup", key: "shift"});
      return {started: !!act, low, neckGap, during, gaps, after, clip: clip ? clip.mode : null, speed: me.m.speed, eyeStand: 1.68*(me.scale || 1)};
    });
    const S = res.slide;
    check(S.started && S.low < S.eyeStand - .45, "a slide takes the eye down with the body (the camera at least 0.45 m under standing height)", S);
    check(S.neckGap <= .45, "through the slide (once it is under way, 0.2 s in) the body's neck stays just under the eye (within 0.45 of the height's scale)", S.neckGap);
    check(!S.clip && ["ftL", "ftR"].every(k => Math.hypot(S.after[k][0], S.after[k][1]) <= .95 && S.after[k][2] >= 1.05), "after the slide its clip has ended and the body runs under the eye again", S);
  }

  /* ---------- U20: the kick type ---------- */
  if (on("kick") || on("meter")){
    await page.evaluate(() => window.__uf2.start({}));
    await page.waitForFunction(() => !!(window.__trainRun.RUN.cur && window.__trainRun.RUN.cur.T && window.__trainRun.RUN.cur.T.V), null, {timeout: 60000});
    await unfreeze(page); await frames(page, 10); await lock(); await freeze(page);
    await page.evaluate(() => window.__uf2.look(-Math.PI/2, -.03));
    await step(40);
  }
  if (on("kick")){
    const K = res.kick = {};
    const lit = () => page.evaluate(() => { const e = document.querySelector("#fpHud .fp-kick li.on"); return {lit: e ? e.textContent.trim() : null, kick: window.__uf2.C.CTRL.kick, contact: window.__uf2.C.CTRL.contact, charge: !!window.__uf2.C.CTRL.charge}; });
    await unfreeze(page); await frames(page, 4);
    K.visible = await shown("#fpHud .fp-kick");
    await freeze(page);
    K.start = await lit();
    check(K.visible.ok && K.start.lit === "Normal" && !K.start.charge, "the kick type is in its corner with nothing held, Normal lit", K);
    // the wheel (real, over the locked view): down the list, then back up
    K.seq = [];
    for (const dy of [120, 120, -120, -120, -120, -120]){ await page.mouse.wheel(0, dy); await step(2); K.seq.push(await lit()); }
    check(K.seq.map(s => s.lit).join(",") === "Placed,Driven,Placed,Normal,Curl,Chip", "the wheel goes down and up the list and the corner shows each type as it is chosen", K.seq.map(s => s.lit));
    check(K.seq[1].contact === -1 && K.seq[5].contact === 1 && K.seq[3].contact === 0, "Driven strikes with Low contact, Chip with High, Normal with Normal", K.seq.map(s => s.contact));
    for (const k of ["1", "3", "2"]){ await pressReal(page, k); await step(2); K["key" + k] = await lit(); }
    check(K.key1.lit === "Driven" && K.key3.lit === "Chip" && K.key2.lit === "Normal", "1, 2 and 3 choose Driven, Normal and Chip", [K.key1, K.key3, K.key2]);
    await shot("kick");
    // the type chosen is the strike: Chip chosen, then a held shot
    await pressReal(page, "3"); await step(2);
    const ev0 = await page.evaluate(() => window.__uf2.ms().events.length);
    await page.mouse.down(); await step(24); await page.mouse.up();
    await step(40);
    K.chip = await page.evaluate(ev0 => window.__uf2.kickEv(ev0).map(e => ({shape: e.shape, contact: e.contact, kick: e.kick, gest: window.__uf2.C.CTRL.gest}))[0] || null, ev0);
    check(!!K.chip && /chip/.test(K.chip.shape) && K.chip.contact === 1 && K.chip.kick === "chip", "a shot with Chip chosen is chipped (the strike is the type in the corner)", K.chip);
    await pressReal(page, "2"); await step(2);
  }

  /* ---------- U18: the meter ---------- */
  if (on("meter")){
    const M = res.meter = {};
    const reset = async () => { await page.evaluate(() => { window.__trainRun.restart(); window.__uf2.look(-Math.PI/2, -.03); }); await step(40); };
    await reset();
    await pressReal(page, "2"); await step(2);
    M.kick = await page.evaluate(() => (document.querySelector("#fpHud .fp-kick li.on") || {}).textContent);
    const mstate = () => page.evaluate(() => { const C = window.__uf2.C.CTRL, r = window.__uf2.rect("#fpHud .fp-meter"), sw = window.__uf2.rect("#fpHud .fp-meter-sweet"), f = document.querySelector("#fpHud .fp-meter-fill");
      return {on: C.meter.on, p: C.meter.p, lo: C.meter.lo, hi: C.meter.hi, sweet: C.meter.sweet, rect: r, sweetW: sw ? sw.x1 - sw.x0 : 0, fill: f ? f.style.transform : null, say: (document.querySelector("#fpHud .fp-meter-say") || {}).textContent || "", ball: window.__uf2.ballScreen(), w: innerWidth, h: innerHeight}; });
    M.rest = await mstate();
    check(!M.rest.on && M.rest.rect.op < .05, "the meter is out of the way until you hold a button", M.rest);
    // hold LMB (real): it fills, the sweet spot marked; let go inside it
    const ev0 = await page.evaluate(() => window.__uf2.ms().events.length);
    const cam0 = await page.evaluate(() => window.__uf2.M.MC.cleanN || 0);
    await page.mouse.down();
    const fills = [];
    let inSweet = null;
    for (let i = 0; i < 80; i++){
      await step(1);
      const s = await mstate(); fills.push(s.p);
      if (i === 6) M.early = s;
      if (s.sweet && s.p >= (s.lo + s.hi)/2){ inSweet = s; break; }
    }
    await page.mouse.up();
    M.inSweet = inSweet; M.fills = fills.slice(0, 12);
    check(!!M.early && M.early.on && M.early.rect.op > .8 && M.early.sweetW > 6, "holding LMB brings up the meter near the crosshair with its sweet spot marked", M.early);
    check(fills.every((p, i) => i === 0 || p >= fills[i - 1]) && fills[fills.length - 1] > fills[0], "the meter fills while the button is held", M.fills);
    const midY = M.early ? (M.early.rect.y0 + M.early.rect.y1)/2 : 0;
    check(!!M.early && Math.abs(midY - M.early.h/2) < 90 && Math.abs((M.early.rect.x0 + M.early.rect.x1)/2 - M.early.w/2) < 4, "the meter sits on the crosshair's line, just above or under it", M.early && M.early.rect);
    await step(30);
    M.after = await mstate();
    const k1 = await page.evaluate(ev0 => window.__uf2.kickEv(ev0)[0] || null, ev0);
    M.clean = k1 ? {clean: k1.clean, strike: k1.strike, shape: k1.shape, line: (document => "")()} : null;
    M.cam = await page.evaluate(cam0 => (window.__uf2.M.MC.cleanN || 0) - cam0, cam0);
    M.camDbg = await page.evaluate(() => { const MC = window.__uf2.M.MC, ms = window.__uf2.ms(); return {kseq: ms.kick && ms.kick.seq, agent: ms.kick && ms.kick.agent, me: ms.me, on: MC.on, mcKeys: Object.keys(MC).join()}; });
    M.line = await page.evaluate(() => (document.querySelector("#fpHud .fp-sline") || {}).textContent || "");
    check(!!inSweet && !!k1 && k1.clean === true && k1.strike >= .9, "let go in the sweet spot, the strike is clean (logged clean, a sweet contact)", {inSweet, k1: M.clean});
    check(M.cam === 1 && /Clean strike/.test(M.line) && M.after.say === "Clean", "a clean strike is felt and shown: the camera's kick, Clean strike! under the crosshair, Clean on the meter", {cam: M.cam, line: M.line, say: M.after.say, dbg: M.camDbg, kick: M.kick});
    // into the net: it ripples
    let rip = null;
    for (let i = 0; i < 160 && !rip; i++){ await step(2); rip = await page.evaluate(() => { const V = window.__uf2.T().V; return V.ripRing && V.ripRing.visible ? {ring: true, mesh: !!V.rip, t: V.ripRing.userData.t} : null; }); }
    M.net = rip;
    check(!!rip, "the shot into the net ripples it (the ring where it went in, the net pushed back where it is drawn as its own mesh)", rip);
    if (rip) await shot("net");
    // a picture of the meter as it fills (real frames go by for it: a hold of its own, let go and not judged)
    await reset();
    await page.mouse.down(); await step(14); await shot("meter"); await page.mouse.up(); await step(30);
    // held past the spot: not clean
    await reset();
    const ev1 = await page.evaluate(() => window.__uf2.ms().events.length);
    await page.mouse.down();
    for (let i = 0; i < 90; i++){ await step(1); const s = await mstate(); if (s.p > s.hi + .04) break; }
    await page.mouse.up(); await step(30);
    const k2 = await page.evaluate(ev1 => window.__uf2.kickEv(ev1)[0] || null, ev1);
    M.late = k2 ? {clean: !!k2.clean, shape: k2.shape} : null;
    check(!!k2 && !k2.clean, "let go past the sweet spot, the strike is not clean", M.late);
    // the meter never covers the ball: looking down at it as the button is held, over a range of looks
    await reset();
    M.cover = [];
    await page.mouse.down();
    for (const pitch of [-.35, -.5, -.65, -.8, -.95]){
      await page.evaluate(p => window.__uf2.look(null, p), pitch); await step(2);
      const s = await mstate();
      const inside = s.ball.front && s.ball.x > s.rect.x0 - 6 && s.ball.x < s.rect.x1 + 6 && s.ball.y > s.rect.y0 - 6 && s.ball.y < s.rect.y1 + 6;
      M.cover.push({pitch, inside, ball: s.ball, rect: s.rect});
    }
    await page.mouse.up(); await step(20);
    check(M.cover.every(c => !c.inside), "the meter never covers the ball (it moves over the crosshair when the ball is under it)", M.cover);
  }

  /* ---------- U19: passing ---------- */
  if (on("pass")){
    const Pp = res.pass = {};
    // a team-mate 12.8 m off at 51 degrees from the goal's way; the look 45 degrees off him
    const tap = async (assist, yawOff, mates) => {
      await page.evaluate(([a, m]) => { window.__uf2.C.saveSet({assist: a}); window.__uf2.start({mates: m}); }, [assist, mates]);
      await page.waitForFunction(() => !!(window.__trainRun.RUN.cur && window.__trainRun.RUN.cur.T && window.__trainRun.RUN.cur.T.V), null, {timeout: 60000});
      await unfreeze(page); await frames(page, 6); await lock(); await freeze(page);
      // (the ball yours first; then the look set just before the tap, so the team-mate has not moved off the line since)
      await step(30);
      const aim = await page.evaluate(off => { const ms = window.__uf2.ms(), me = ms.agents[ms.me], o = ms.agents.find(a => a.team === me.team && a !== me && !a.isGK);
        // ("cone": 0.85 of the cone the assists give at his distance now, outside the cone without them and its hold)
        const d = Math.hypot(o.m.x - me.m.x, o.m.z - me.m.z), C = window.__uf2.C, base = d < C.CN.CONE_NEAR_D ? C.CN.CONE_NEAR : C.CN.CONE, a = off === "cone" ? .85*base*(1 + C.METER.CONE_A) : off;
        const yaw = Math.atan2(-(o.m.x - me.m.x), -(o.m.z - me.m.z)) + a; window.__uf2.look(yaw, -.15); return {mate: o.id, d, off: a*180/Math.PI, outside: a > base + C.CN.HYST}; }, yawOff);
      await step(1);
      const ev0 = await page.evaluate(() => window.__uf2.ms().events.length);
      await page.mouse.down({button: "right"}); await step(4); await page.mouse.up({button: "right"});
      await step(30);
      const k = await page.evaluate(ev0 => window.__uf2.kickEv(ev0)[0] || null, ev0);
      // the ball followed until it is beside the team-mate it was meant for (or 4 s): its speed there
      const arrive = await page.evaluate(id => { const ms = window.__uf2.ms(), o = ms.agents[id]; let best = 99, v = null;
        for (let i = 0; i < 240; i++){ const d = Math.hypot(ms.ball.p.x - o.m.x, ms.ball.p.z - o.m.z); if (d < best){ best = d; v = Math.hypot(ms.ball.v.x, ms.ball.v.z); } if (d < 1.2 || ms.poss.ctl >= 0) break; window.__life.stepN(1); }
        return {closest: best, speed: v}; }, aim.mate);
      return {aim, recv: k ? k.recv : null, speed: k ? k.speed : null, intent: k ? k.intent : null, arrive};
    };
    Pp.onAt45 = await tap("on", "cone", [[7, -9]]);
    Pp.offAt45 = await tap("off", "cone", [[7, -9]]);
    check(Pp.onAt45.aim.outside && Pp.onAt45.recv === Pp.onAt45.aim.mate, "assists on: a tap well off a team-mate (outside the plain pass cone) goes to him (the aim assist)", Pp.onAt45);
    check(Pp.offAt45.aim.outside && Pp.offAt45.recv !== Pp.offAt45.aim.mate, "assists off: the same tap is not steered to him", Pp.offAt45);
    Pp.near = await tap("on", 0, [[8, -10]]);
    Pp.far = await tap("on", 0, [[24, -12]]);
    check(Pp.near.recv === Pp.near.aim.mate && Pp.far.recv === Pp.far.aim.mate && Pp.far.speed > Pp.near.speed + 1, "a tap is weighted for the distance: the longer pass is struck harder", {near: Pp.near, far: Pp.far});
    check([Pp.near, Pp.far].every(r => r.arrive.closest < 1.6 && r.arrive.speed >= 5 && r.arrive.speed <= 13), "both arrive at the team-mate at a pace he can take (5 to 13 m/s, under his comfortable speed)", [Pp.near.arrive, Pp.far.arrive]);
    await page.evaluate(() => window.__uf2.C.saveSet({assist: "on"}));
  }

  /* ---------- U17: the first touch and the dribble ---------- */
  if (on("touch")){
    const T0 = res.touch = {};
    // a ball played to you from 14 m in front at 11 m/s; how it is met: keys held through it, the assists
    const receive = async (assist, keys) => {
      await page.evaluate(a => { window.__uf2.C.saveSet({assist: a}); window.__uf2.start({launch: {fx: 14, fz: 3, speed: 11}, mates: [[-3, 25]]}); }, assist);
      await page.waitForFunction(() => !!(window.__trainRun.RUN.cur && window.__trainRun.RUN.cur.T && window.__trainRun.RUN.cur.T.V), null, {timeout: 60000});
      await freeze(page);
      // (the pointer is still locked from the parts before: the keys are the game's)
      await lock().catch(() => null);
      await page.evaluate(() => window.__uf2.look(-Math.PI/2, -.3));
      for (const k of keys) await page.keyboard.down(k);
      let tch = null;
      for (let i = 0; i < 200 && !tch; i++){ await step(1); tch = await page.evaluate(() => window.__uf2.touchEv(0)[0] || null); }
      await step(36);
      for (const k of keys.slice().reverse()) await page.keyboard.up(k);
      const rel = await page.evaluate(() => window.__uf2.ballRel());
      return {touch: tch ? {settle: tch.settle || 0, td: tch.td, quality: tch.quality, part: tch.part} : null, rel};
    };
    T0.f = await receive("on", ["f"]);
    T0.still = await receive("on", []);
    T0.offF = await receive("off", ["f"]);
    T0.push = await receive("off", ["w"]);
    check(!!T0.f.touch && T0.f.touch.settle === 1 && T0.f.touch.part === "foot" && T0.f.rel.d <= .85 && T0.f.rel.v <= 1.5, "F held as it arrives: the ball killed onto the foot, within reach (0.85 m) and nearly still", T0.f);
    check(!!T0.still.touch && T0.still.touch.settle > .9 && T0.still.rel.d <= .9, "assists on, standing with no keys: the ball settled at your feet too", T0.still);
    check(!!T0.offF.touch && T0.offF.touch.settle === 1 && T0.offF.rel.d <= 1.0, "assists off, F still settles it (the harder setting keeps the key)", T0.offF);
    check(!!T0.push.touch && !T0.push.touch.settle && T0.push.rel.d > T0.f.rel.d + .25, "a push touch with W (assists off) leaves the ball further than the settle", {push: T0.push, f: T0.f});
    // dribbling: W held at a jog, then W and Shift, the ball's lead sampled after the first second
    const dribble = async (assist, keys) => {
      await page.evaluate(a => { window.__uf2.C.saveSet({assist: a}); window.__uf2.start({mates: [[-3, 25]]}); }, assist);
      await page.waitForFunction(() => !!(window.__trainRun.RUN.cur && window.__trainRun.RUN.cur.T && window.__trainRun.RUN.cur.T.V), null, {timeout: 60000});
      await freeze(page);
      await page.evaluate(() => window.__uf2.look(-Math.PI/2, -.4));
      await step(20);
      for (const k of keys) await page.keyboard.down(k);
      await step(60);
      const S = [];
      for (let i = 0; i < 45; i++){ await step(3); S.push(await page.evaluate(() => window.__uf2.ballRel())); }
      for (const k of keys.slice().reverse()) await page.keyboard.up(k);
      await step(30);
      const mine = S.filter(s => s.mine).length, ds = S.map(s => s.ahead);
      return {mine, n: S.length, mean: ds.reduce((a, b) => a + b, 0)/ds.length, max: Math.max(...ds), speed: S[S.length - 1].speed};
    };
    T0.jog = await dribble("on", ["w"]);
    T0.sprint = await dribble("on", ["Shift", "w"]);
    T0.jogOff = await dribble("off", ["w"]);
    check(T0.jog.mine >= T0.jog.n - 2 && T0.jog.mean <= 1.0 && T0.jog.max <= 1.5, "dribbling at a jog keeps the ball near the foot (mean lead 1.0 m or less, never past 1.5)", T0.jog);
    check(T0.sprint.mean > T0.jog.mean + .2, "only a sprint pushes it further ahead", {jog: T0.jog.mean, sprint: T0.sprint.mean});
    check(T0.jogOff.mean >= T0.jog.mean, "the assists' close control is what keeps it close (off, the jog's lead is longer)", {on: T0.jog.mean, off: T0.jogOff.mean});
    await page.evaluate(() => window.__uf2.C.saveSet({assist: "on"}));
  }

  res.console = page.errors.slice();
  check(page.errors.length === 0, "no console or page error", page.errors);
} catch(e){
  res.errors.push("crash: " + (e && e.stack || e));
  console.log("CRASH", e);
} finally {
  report("uf2-feel", res);
  await t.close();
}
console.log(res.errors.length ? `uf2-feel: ${res.errors.length} failed` : "uf2-feel: all checks pass");
process.exit(res.errors.length ? 1 : 0);
