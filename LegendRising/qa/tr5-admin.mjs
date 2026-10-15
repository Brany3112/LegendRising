// qa/tr5-admin.mjs: the Training admin panel (Numpad 1 or Ctrl+Shift+1).
// Owner: P5-B (TR-5). Contract: BUILD-PLAN P5-B acceptance "qa/tr5-admin.mjs"; TRAINING-SPEC 4 (the admin panel: Player,
// Stamina, AI, Ball, Scenario and Match, formula tunables; live where safe, otherwise at the next safe state with a
// note) and 1 (Training never writes the career).
//
// Two parts.
//   engine   under plain node, on the match simulation the panel changes (sim.js setAttrs, agent.js agentFoot,
//            stamina.js stamInfinite / stamRestore / stamSetBreath, the keeper's at.gk, tune.js): what each change
//            does to play, measured.
//   browser  the panel itself in Training, every control pressed with the real mouse and keyboard (page.mouse at the
//            element's box, page.keyboard), under pointer lock where the game holds it: what each control changes in
//            the running scenario, its setup snapshot and its configuration; the queued changes and their note; the
//            Scenario section's Restart, Replay Last, Back to Configuration and Back to Hub; the career untouched.
// Parts that need the P5-A side of the contract (keys.js, freeplay.js spawnBall, the me.height schema field and the
// body rebuilt at restart) run when it is there and are reported as waiting for it otherwise.
//
//   node qa/tr5-admin.mjs [--engine-only]
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTF = path.join(ROOT, "qa", "out", "tr5-admin.json");
const res = {engine: {}, browser: {}, waiting: [], errors: []};
const check = (ok, what, got) => { if (!ok) res.errors.push(`${what}: ${JSON.stringify(got).slice(0, 1500)}`); console.log(`${ok ? "ok  " : "FAIL"} ${what}${got !== undefined && ok ? "" : ""}`); return ok; };
const wait = (what, why) => { res.waiting.push(`${what}: ${why}`); console.log(`WAIT ${what} (${why})`); };
const r3 = v => Math.round(v*1000)/1000;

/* =================================== engine =================================== */
{
  const {createMatch, simStep, setAttrs} = await import("../js/life/football/sim.js");
  const {agentFoot} = await import("../js/life/football/agent.js");
  const ST = await import("../js/life/stamina.js");
  const {attrsForTraining, presetSkills} = await import("../js/life/football/attrs.js");
  const {cfgFromConfig} = await import("../js/life/train/teams.js");
  const {defaults} = await import("../js/life/train/config.js");
  const {moverParams} = await import("../js/life/mover.js");
  const {TUNE, tuneSet, tuneReset} = await import("../js/life/football/tune.js");
  const Z = await import("../js/life/football/zone.js");
  const {configFor} = await import("./harness.mjs");
  const {setCtl} = await import("../js/life/football/rules.js");
  const {startKick} = await import("../js/life/football/actions.js");
  const {createChain} = await import("../js/life/football/events.js");
  const H = 1/60;

  // a Free Play match on the full cage: me alone, the player not driven by the AI (the test steers him)
  const freeMatch = (skills = presetSkills("average")) => {
    const c = Object.assign(defaults("freeplay"), {me: skills});
    const {cfg} = cfgFromConfig("freeplay", c, 7);
    const ms = createMatch(Object.assign({}, cfg, {meAI: false}));
    ms.phase = "live"; ms.restart = null;
    const me = ms.agents[ms.me];
    me.m.x = me.x0 = 0; me.m.z = me.z0 = 0;
    ms.ball.p.x = 0; ms.ball.p.z = 30; ms.ball.state = "dead";
    return {ms, me};
  };
  // the player sprints round a circle (so the run-off never stops him), for n steps; returns the top speed
  const sprint = (ms, me, n, w = 0.32, gait = "sprint") => {
    let top = 0;
    for (let i = 0; i < n; i++){
      const t = ms.t, dx = Math.cos(t*w), dz = Math.sin(t*w);
      Object.assign(me.intent, {dx, dz, gait, speedCap: Infinity, face: null, strafe: false, action: null});
      simStep(ms, H);
      top = Math.max(top, me.m.speed);
    }
    return top;
  };

  // ---- Player: Sprint Speed 99, live, gives A1.1's top speed (mover.js: 6.6 + 0.028 x 99 = 9.37 m/s) ----
  {
    const {ms, me} = freeMatch();
    const before = sprint(ms, me, 360);
    ST.stamRestore(me.st);
    const sk = Object.assign(presetSkills("average"), {sprintSpeed: 99});
    setAttrs(ms, me, attrsForTraining(sk));
    // (from a standstill again, so the top speed is reached from rest under the new profile)
    for (let i = 0; i < 90; i++){ Object.assign(me.intent, {dx: 0, dz: 0, gait: "jog"}); simStep(ms, H); }
    ST.stamRestore(me.st);
    const after = sprint(ms, me, 420);
    const want = moverParams({sprintSpeed: 99, acceleration: 55, dribbling: 55}, "football").sprint;
    res.engine.sprint99 = {before: r3(before), after: r3(after), want: r3(want), prmSprint: r3(me.prm.sprint), bounds: !!me.prm.bounds};
    check(Math.abs(after - want) <= 0.02*want && after > before + 1 && me.prm.bounds, "Sprint Speed 99 set live: the measured top speed is A1.1's 9.37 m/s (within 2%), the run-off bounds kept", res.engine.sprint99);
  }
  // ---- Player: preferred foot Left, live: the next first-time strike is struck with the left foot ----
  {
    const strikeFoot = f => {
      const {ms, me} = freeMatch();
      if (f) agentFoot(me, f);
      me.m.yaw = me.m.heading = -Math.PI/2;      // facing +x
      ms.ball.p.x = 0.55; ms.ball.p.z = 0; ms.ball.p.y = 0.11; ms.ball.v.x = ms.ball.v.y = ms.ball.v.z = 0; ms.ball.state = "free";
      setCtl(ms, me);
      // (a target straight ahead: the foot is the preferred one when nothing else decides it)
      const act = startKick(ms, me, {kind: "shot", target: {x: 40, y: 1, z: 0}, power: 0.8, contact: 0});
      let foot = act ? act.foot : null, kick = null;
      for (let i = 0; i < 90 && !kick; i++){ simStep(ms, H); kick = ms.events.find(e => e.kind === "kick" && e.agent === me.id) || null; }
      return {agentFoot: me.foot, actFoot: foot, side: act ? act.side : null, kicked: !!kick};
    };
    const right = strikeFoot(null), left = strikeFoot("Left");
    res.engine.foot = {right, left};
    check(right.actFoot === "R" && left.agentFoot === "L" && left.actFoot === "L" && left.side === -1 && left.kicked,
      "preferred foot Left set live: the next strike is struck with the left foot (the same strike is right-footed before)", res.engine.foot);
  }
  // ---- Stamina: infinite keeps the breath at its cap over a 30 s sprint; without it the same sprint drains ----
  {
    const a = freeMatch(), b = freeMatch();
    ST.stamInfinite(a.me.st, true);
    let minA = 1;
    for (let k = 0; k < 30; k++){ sprint(a.ms, a.me, 60); minA = Math.min(minA, a.me.st.B/a.me.st.cap); }
    sprint(b.ms, b.me, 1800);
    res.engine.infinite = {minFrac: r3(minA), off: r3(b.me.st.B/b.me.st.cap), dist: r3(a.me.acc.dist)};
    check(minA >= 0.99 && b.me.st.B/b.me.st.cap < 0.5, "infinite stamina keeps the breath at 99% or more of its cap over a 30 s sprint (the same sprint without it drains it)", res.engine.infinite);
    ST.stamInfinite(a.me.st, false);
    sprint(a.ms, a.me, 600);
    check(a.me.st.B < a.me.st.cap*0.9, "turned off again, the breath drains as usual", {B: r3(a.me.st.B)});
  }
  // ---- Stamina: breath set to 20 lowers the sprint speed by stamina.js's factors ----
  {
    const {ms, me} = freeMatch();
    const fresh = sprint(ms, me, 240);
    for (let i = 0; i < 120; i++){ Object.assign(me.intent, {dx: 0, dz: 0, gait: "jog"}); simStep(ms, H); }
    ST.stamSetBreath(me.st, 20);
    const B0 = me.st.B;
    let top = 0, Bend = B0;
    for (let i = 0; i < 240; i++){ top = Math.max(top, sprint(ms, me, 1)); Bend = me.st.B; }
    const P = me.prm, f = B => { const F = ST.stamFactors({B}, me.eF); return (P.jog + (P.sprint - P.jog)*F.speed)*F.eSpeed; };
    res.engine.breath20 = {fresh: r3(fresh), at20: r3(top), want20: r3(f(20)), wantEnd: r3(f(Bend)), B0: r3(B0), Bend: r3(Bend)};
    check(B0 === 20 && top <= f(20) + 0.05 && top >= f(Bend) - 0.05 && top < fresh - 0.5, "breath set to 20: the sprint is capped where stamina.js's speed factor puts it (fresh top speed is not reached)", res.engine.breath20);
  }
  // ---- Stamina: restore after a sprint brings the breath back to its cap within one step ----
  {
    const {ms, me} = freeMatch();
    sprint(ms, me, 600);
    const low = me.st.B;
    ST.stamRestore(me.st);
    Object.assign(me.intent, {dx: 0, dz: 0, gait: "jog"}); simStep(ms, H);
    res.engine.restore = {low: r3(low), after: r3(me.st.B), cap: r3(me.st.cap)};
    check(low < me.st.cap*0.7 && Math.abs(me.st.B - me.st.cap) < 1e-9, "restore after a sprint: the breath is back at its cap within one step", res.engine.restore);
  }
  // ---- AI: the keeper's reflex 30 then 90, live: the save rate over 40 scripted shots differs ----
  {
    const put = (a, x, z, yaw = null) => { a.m.x = x; a.m.z = z; a.m.vx = 0; a.m.vz = 0; a.m.speed = 0; if (yaw != null){ a.m.yaw = yaw; a.m.heading = yaw; a.look.yaw = yaw; } a.x0 = x; a.z0 = z; a.body.x = x; a.body.z = z; a.tgt.x = x; a.tgt.z = z; };
    const range = seed => {
      const cfg = configFor(seed); cfg.meAI = false;
      const ms = createMatch(cfg), me = ms.agents[ms.me], gk = ms.agents[ms.gks[1]];
      for (const a of ms.agents){ if (a.role !== "player" || a === me || a === gk) continue; a.onPitch = false; put(a, 0, 80); }
      me.at = Object.assign({}, me.at, {accuracy: 80, power: 75, composure: 80});
      return {ms, me, gk};
    };
    const shoot = (rg, x, z, target) => {
      const {ms, me, gk} = rg, R = 0.11;
      ms.phase = "live"; ms.restart = null; ms.clock.running = true; ms.clock.sec = 60; ms.advantage = null; ms.pendingBook.length = 0;
      ms.offside.set.clear(); ms.offside.pending = null; ms.chain = createChain(); ms.kick = null;
      const yaw = Math.atan2(-(ms.spec.hx - x), -(0 - z));
      put(me, x + 0.65*Math.sin(yaw), z + 0.65*Math.cos(yaw), yaw);
      me.act = null; me.state = "idle"; me.intent.dx = 0; me.intent.dz = 0; me.intent.action = null;
      const b = ms.ball; b.p.x = x; b.p.y = R; b.p.z = z; b.v.x = b.v.y = b.v.z = 0; b.w.x = b.w.y = b.w.z = 0; b.state = "free"; b.grounded = true;
      put(gk, ms.spec.hx - 0.8, 0, Math.PI/2);
      gk.gk = null; gk.act = null; gk.plan = null; gk.y = 0; gk.roll = 0; gk.state = "idle";
      setCtl(ms, me);
      for (let i = 0; i < 72; i++) simStep(ms);
      const n0 = ms.events.length, s0 = ms.score[0];
      startKick(ms, me, {kind: "shot", target, power: 0.75, contact: 0});
      for (let n = 0; n < 210; n++){
        simStep(ms);
        for (let i = n0; i < ms.events.length; i++){ const e = ms.events[i]; if (e.kind === "save" && e.agent === gk.id) return "saved"; if (e.kind === "goal") return "goal"; if (e.kind === "out") return "wide"; }
        if (ms.score[0] !== s0) return "goal";
      }
      return "none";
    };
    const rate = reflex => {
      let saved = 0, goals = 0;
      for (let i = 0; i < 40; i++){
        const rg = range(500 + i), gx = rg.ms.spec.hx;
        // the keeper's set changed live, as the admin does it (at.gk, read when he acts)
        rg.gk.at.gk = Object.assign({}, rg.gk.at.gk || {}, {reflex});
        const z = -8 + (i % 5)*4, tz = ((i*7) % 5 - 2)*1.4, ty = 0.3 + (i % 3)*0.6;
        const r = shoot(rg, gx - 15 - (i % 4), z, {x: gx, y: ty, z: tz});
        if (r === "saved") saved++; if (r === "goal") goals++;
      }
      return {saved, goals};
    };
    const lo = rate(30), hi = rate(90);
    res.engine.keeper = {reflex30: lo, reflex90: hi};
    check(hi.saved > lo.saved, "the keeper's reflex 30 then 90 (live, at.gk): the save rate over 40 scripted shots differs, higher with 90", res.engine.keeper);
  }
  // ---- Tunables: R x0.5 halves the control distance in a scripted receive; reset to defaults restores it ----
  {
    const recv = () => {
      const {ms, me} = freeMatch();
      ms.meAI = true;
      me.m.yaw = me.m.heading = Math.PI/2;      // facing -x, toward the ball
      const b = ms.ball; b.p.x = -14; b.p.y = 0.11; b.p.z = 0; b.v.x = 9; b.v.y = 0; b.v.z = 0; b.state = "free"; b.grounded = true;
      ms.poss.ctl = -1;
      const Rz = Z.R(me, b, ms);
      let at = null;
      for (let i = 0; i < 240 && at == null; i++){
        me.intent.dx = 0; me.intent.dz = 0;
        const d = Math.hypot(b.p.x - me.m.x, b.p.z - me.m.z);
        simStep(ms, H);
        if (ms.poss.ctl === me.id) at = d;
      }
      return {R: Rz, at};
    };
    const def = recv();
    tuneSet("R0", TUNE.R0.def*0.5);
    const half = recv();
    tuneReset();
    const back = recv();
    res.engine.tuneR = {def: {R: r3(def.R), at: def.at == null ? null : r3(def.at)}, half: {R: r3(half.R), at: half.at == null ? null : r3(half.at)}, back: {R: r3(back.R), at: back.at == null ? null : r3(back.at)}};
    check(Math.abs(half.R/def.R - 0.5) < 1e-9 && back.R === def.R, "the R tunable at x0.5 halves the control radius (zone.js R), and reset to defaults restores it", res.engine.tuneR);
    const step = 9/60 + 0.02;
    check(def.at != null && half.at != null && Math.abs(half.at - def.at*0.5) <= step && Math.abs(back.at - def.at) < 1e-9,
      "in a scripted receive the control distance halves with it (within one step of the ball's travel)", res.engine.tuneR);
  }
}

const finish = () => {
  fs.mkdirSync(path.dirname(OUTF), {recursive: true}); fs.writeFileSync(OUTF, JSON.stringify(res, null, 1));
  if (res.waiting.length) console.log("waiting for P5-A's side of the contract:\n  " + res.waiting.join("\n  "));
  console.log(res.errors.length ? `tr5-admin: ${res.errors.length} failed\n  ${res.errors.join("\n  ")}` : "tr5-admin: pass");
  process.exit(res.errors.length ? 1 : 0);
};
if (process.argv.includes("--engine-only")) finish();

/* =================================== browser =================================== */
const {freeze, unfreeze, snap} = await import("./lib.mjs");
const B = await import("./tr4b-lib.mjs");
const {pressReal, assertVisible, lockPointer} = B;
// a real click (page.mouse at the element's box) on an element the player has scrolled to, as he would in a sheet
// longer than the screen; the element must then be what is under the pointer (not the sheet's sticky foot)
async function clickReal(pg, sel, o){
  let top = null;
  for (let i = 0; i < 4 && top !== "ok"; i++){
    if (i) await pg.waitForTimeout(400);
    await pg.evaluate(s => { const e = document.querySelector(s); if (e && e.scrollIntoView) e.scrollIntoView({block: "center"}); }, sel);
    await B.settle(pg, sel);
    top = await pg.evaluate(s => { const e = document.querySelector(s); if (!e) return "none"; const r = e.getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
      if (t && (t === e || e.contains(t))) return "ok";
      const sh = document.querySelector("#sheetRoot .sheet"), sr = sh && sh.getBoundingClientRect(), root = document.getElementById("sheetRoot");
      return `${t ? t.tagName + "." + t.className : "nothing"} at ${Math.round(r.left)},${Math.round(r.top)}; sheet ${sr ? [Math.round(sr.left), Math.round(sr.top), Math.round(sr.width)].join(",") + " " + getComputedStyle(sh).transform : "none"}; root ${root.className} ${root.dataset.kind}`; }, sel);
  }
  if (top !== "ok") throw new Error(`clickReal: ${sel} is not what is under the pointer (${top})`);
  return B.clickReal(pg, sel, o);
}
const t = await B.trainLaunch({seed: 5});
const {page} = t;
const W = res.browser;

// the page's view of the run: my agent, the keeper, the defenders, the ball, the setup and the configuration
const look = () => page.evaluate(async () => {
  const R = window.__trainRun, ms = R.RUN.ms, s = R.RUN.setup, run = R.RUN.cur;
  if (!ms) return {cur: !!run};
  const me = ms.agents[ms.me], gk = ms.agents.find(a => a.isGK && a.role === "player" && a.onPitch);
  const AG = await import("/js/life/football/agent.js");
  const opps = ms.agents.filter(a => a.role === "player" && a.team !== me.team && !a.isGK && a.onPitch);
  return {cur: true, id: run.id, paused: R.RUN.paused, t: ms.t, starts: R.RUN.starts, restarts: R.RUN.restarts,
    me: {at: Object.assign({}, me.at, {gk: null}), foot: me.foot, scale: me.scale, sprint: me.prm.sprint, bounds: !!me.prm.bounds, B: me.st.B, cap: me.st.cap, inf: !!me.st.inf,
      torsoR: AG.capsules(me).torso.r, headY: AG.capsules(me).head.y, reachHead: AG.reachY(me, "head")},
    gk: gk ? Object.assign({}, gk.at.gk) : null, opps: opps.map(a => ({tackling: a.at.tackling, slot: a.slot})),
    ball: {p: [ms.ball.p.x, ms.ball.p.y, ms.ball.p.z], v: [ms.ball.v.x, ms.ball.v.y, ms.ball.v.z]},
    setup: JSON.parse(JSON.stringify(s)), config: JSON.parse(JSON.stringify(run.config)), eye: window.__life && window.__life.P ? window.__life.P.eye : null};
});
const adminState = () => page.evaluate(() => Object.assign(window.__trainAdmin.state(), {
  sheet: (() => { const r = document.getElementById("sheetRoot"); return r ? {open: r.classList.contains("open"), kind: r.dataset.kind || ""} : null; })(),
  note: (() => { const n = document.querySelector("#sheetRoot .tad-pending"); return n && !n.hidden ? n.textContent.trim() : null; })(),
  card: !!(document.getElementById("fpOverlay") && document.getElementById("fpOverlay").classList.contains("on")), quick: window.__trainQuick.quickIsOpen(),
  lock: document.pointerLockElement ? document.pointerLockElement.id || "?" : null}));
// the panel opened the player's way: Numpad 1 (P5-A's keys.js) when the key layer is there, else its event
let KEYS = null;
async function openAdmin(sec = null){
  if (KEYS === null) KEYS = await page.evaluate(() => performance.getEntriesByType("resource").some(e => /\/train\/keys\.js/.test(e.name)));
  if (KEYS) await pressReal(page, "Numpad1");
  else await page.evaluate(() => dispatchEvent(new CustomEvent("train:admin", {detail: {open: true}})));
  await page.waitForFunction(() => window.__trainAdmin.adminIsOpen() && !!document.querySelector("#sheetRoot.open .tad"), null, {timeout: 10000, polling: 50});
  if (sec) await tab(sec);
}
const tab = async sec => { await clickReal(page, `#sheetRoot [data-ad="sec"][data-v="${sec}"]`); await page.waitForFunction(s => !!document.querySelector(`#sheetRoot .tad[data-sec="${s}"]`), sec, {timeout: 5000, polling: 50}); };
// a value typed into a field and taken with Enter, the real keyboard
async function typeField(sel, text){
  await clickReal(page, sel);
  await page.keyboard.press("Control+A");
  await page.keyboard.type(String(text));
  await pressReal(page, "Enter");
}
const closeAdmin = async () => { await clickReal(page, '#sheetRoot [data-ad="close"].btn'); await page.waitForFunction(() => !window.__trainAdmin.adminIsOpen(), null, {timeout: 5000, polling: 50}); };
const relocked = () => page.waitForFunction(() => !!document.pointerLockElement, null, {timeout: 8000, polling: 50}).then(() => true, () => false);

try {
  await B.enterByButton(page);
  await B.closeHubReal(page);
  await page.evaluate(async () => { const C = await import("/js/life/train/cage.js"); await C.cageEnter("half"); });
  // (index.js imports admin.js once the integrator has added its line; until then the test loads it the same way)
  W.loadedByIndex = await page.evaluate(async () => { const was = !!window.__trainAdmin; if (!was) await import("/js/life/train/admin.js"); return was; });
  if (!W.loadedByIndex) wait("admin.js loaded by train/index.js", "the integrator adds import './admin.js' to js/life/train/index.js");
  const caps = await page.evaluate(async () => {
    const R = window.__trainRun, TM = await import("/js/life/train/teams.js"), CF = await import("/js/life/train/config.js");
    if (!R.scenario("qa-adm")) R.registerScenario({id: "qa-adm", category: "attacking", type: "attacking", name: "Admin test", desc: "Two against two and a keeper",
      build: (cfg, env) => TM.setupFromConfig("attacking", cfg, env)});
    window.__qaCfgA = CF.validate("attacking", {attackers: 2, defenders: 2, mates: true, opps: true, keeper: true, pitch: "half", out: "rebound", seed: 11, possession: "me"});
    window.__qaCfgB = CF.validate("attacking", Object.assign({}, window.__qaCfgA, {defenders: 1, seed: 12}));
    // every start and restart's digest, at the moment the runner tells its listeners (before any input of the new go)
    const RM = await import("/js/life/train/runner.js");
    window.__qaDig = [];
    RM.onRunner(() => { if (R.RUN.cur) window.__qaDig.push({starts: R.RUN.starts, restarts: R.RUN.restarts, hash: R.digest().hash}); });
    let height = false, prefFoot = false;
    try { height = CF.validate("player", {me: {height: 1.9}}).me.height === 1.9; } catch(e){}
    try { prefFoot = CF.validate("player", {me: {prefFoot: "Left"}}).me.prefFoot === "Left"; } catch(e){}
    return {height, prefFoot, freeplay: R.scenariosOf("freeplay").length > 0};
  });
  W.caps = caps;
  const careerBefore = await B.careerSnapshot(page);
  const activation = () => page.evaluate(() => { const R = window.__trainRun, l = window.__qaDig.filter(d => d.starts === R.RUN.starts); return {first: l.length ? l[0].hash : null, last: l.length ? l[l.length - 1].hash : null, n: l.length}; });

  await freeze(page);
  await page.evaluate(() => window.__trainRun.startScenario("qa-adm", window.__qaCfgA));
  check(!!(await lockPointer(page)), "the pointer is locked on the game (a real click)");
  await page.evaluate(() => window.__life.stepN(40));

  // ---------- opening ----------
  await openAdmin();
  W.keys = KEYS;
  if (!KEYS) wait("the panel opened with the real Numpad 1", "P5-A's keys.js sends train:admin; the panel was opened with that event here");
  const vis = await assertVisible(page, "#sheetRoot .tad h2");
  const o1 = await adminState(), t0 = (await look()).t;
  await page.evaluate(() => window.__life.stepN(30));
  const t1 = (await look()).t;
  W.open = {vis: vis.ok ? "ok" : vis.why, state: o1, t0, t1};
  await snap(page, "tr5-admin-player");
  check(vis.ok && o1.sheet.open && o1.sheet.kind === "trainadmin" && !o1.card && o1.lock === null && t1 === t0,
    "the panel opens over the scenario, visible, the pointer free, the pause card down and the scenario held", W.open);

  // ---------- Player ----------
  await typeField("#ae-me-sprintSpeed", "99");
  const p1 = await look();
  W.sprint = {at: p1.me.at.sprintSpeed, sprint: r3(p1.me.sprint), bounds: p1.me.bounds, setup: p1.setup.me.at.sprintSpeed, config: p1.config.me.sprintSpeed};
  check(p1.me.at.sprintSpeed === 99 && Math.abs(p1.me.sprint - 9.372) < 0.01 && p1.me.bounds && p1.setup.me.at.sprintSpeed === 99 && p1.config.me.sprintSpeed === 99,
    "Sprint speed 99 typed in the panel: the playing agent's sprint is A1.1's 9.37 m/s at once, and the setup and the configuration keep it", W.sprint);
  await clickReal(page, '#sheetRoot [data-ad="foot"][data-v="Left"]');
  const p2 = await look();
  W.foot = {foot: p2.me.foot, setup: p2.setup.me.foot};
  check(p2.me.foot === "L" && p2.setup.me.foot === "Left", "Preferred foot Left (a real click): the agent's foot is L at once, and the setup keeps it", W.foot);
  if (caps.height){
    // the look editor's range (daily.js LOOK_OPT.height, a scale of a 1.80 m body): its top and its bottom, each set with
    // the slider's own keys (End, Home), Set, then Restart
    const range = await page.evaluate(() => typeof LOOK_OPT !== "undefined" ? LOOK_OPT.height.slice() : [0.93, 1.07]);
    W.height = [];
    for (const [key, sc] of [["End", range[1]], ["Home", range[0]]]){
      const cm = Math.round(sc*180);
      await clickReal(page, "#tadH"); await pressReal(page, key);
      await clickReal(page, '#sheetRoot [data-ad="height"]');
      const n1 = await adminState(), b1 = await look();
      check(!!n1.note && n1.note.includes(`Height ${cm} cm`) && Math.abs(b1.me.scale - sc) > 0.005, `Height ${sc} (${cm} cm) shows the note and waits for the restart`, {note: n1.note, scale: b1.me.scale});
      await tab("scenario");
      await clickReal(page, '#sheetRoot [data-ad="restart"]');
      await page.waitForFunction(s => { const ms = window.__trainRun.RUN.ms; return ms && Math.abs(ms.agents[ms.me].scale - s) < 0.005; }, sc, {timeout: 15000, polling: 50}).catch(() => {});
      await page.evaluate(() => window.__life.stepN(2));
      const h1 = await look();
      const row = {want: sc, scale: h1.me.scale, eye: h1.eye, torsoR: h1.me.torsoR, headY: h1.me.headY, pending: (await adminState()).pending};
      W.height.push(row);
      check(Math.abs(h1.me.scale - sc) < 0.005 && Math.abs(h1.me.torsoR - 0.25*h1.me.scale) < 1e-6 && Math.abs(h1.me.headY - 1.66*h1.me.scale) < 1e-6 && Math.abs(h1.eye - 1.68*h1.me.scale) < 0.02 && !row.pending.length,
        `after the restart at ${sc}: a.scale, the capsule radius, the header point and the eye all at that scale`, row);
      await relocked();
      await openAdmin("player");
    }
  } else wait("Height at the top and bottom of the range at the restart (scale, eye, capsules, header point)", "P5-A's me.height schema field and the body rebuilt at restart (runner, pool.replaceMe); the panel hides the height until the configuration carries it");

  // ---------- Stamina ----------
  await tab("stamina");
  await typeField("#tadSetB", "20");
  const s1 = await look();
  await clickReal(page, '#sheetRoot [data-ad="restore"]');
  const s2 = await look();
  await clickReal(page, '#sheetRoot [data-ad="inf"][data-v="on"]');
  const s3 = await look();
  W.stamina = {set: s1.me.B, restore: [s2.me.B, s2.me.cap], inf: s3.me.inf};
  check(s1.me.B === 20 && s2.me.B === s2.me.cap && s3.me.inf, "Stamina (real input): breath set to 20, Back to full gives the cap, Infinite on", W.stamina);
  await closeAdmin();
  const lockBack = await relocked();
  const c1 = await adminState(), pl0 = await look();
  await page.keyboard.down("w"); await page.keyboard.down("Shift");
  await page.evaluate(() => window.__life.stepN(600));
  await page.keyboard.up("Shift"); await page.keyboard.up("w");
  const pl1 = await look();
  W.close = {lock: lockBack, state: c1, played: r3(pl1.t - pl0.t), B: pl1.me.B, cap: pl1.me.cap};
  check(lockBack && !c1.card && !pl1.paused && pl1.t > pl0.t, "Close (a real click): play goes on and the pointer comes back, no pause card", W.close);
  check(pl1.me.B === pl1.me.cap, "with infinite stamina the breath stays at its cap through 10 s of Shift held", W.close);
  await pressReal(page, "Backspace");
  const pl2 = await look();
  check(pl2.restarts === pl1.restarts + 1 && pl2.me.inf && pl2.me.foot === "L", "after a restart (Backspace) infinite stamina and the foot are still on", {restarts: pl2.restarts, inf: pl2.me.inf, foot: pl2.me.foot});
  // with them on, every restart puts back the same state (the live edits are part of the setup now)
  await page.evaluate(() => window.__life.stepN(45));
  await pressReal(page, "Backspace");
  const a0 = await page.evaluate(() => window.__qaDig.slice(-2));
  check(a0.length === 2 && a0[0].hash === a0[1].hash && a0[1].restarts === a0[0].restarts + 1, "two restarts in a row with the live edits and infinite stamina on give the same digest", a0);

  // ---------- AI ----------
  await openAdmin("ai");
  await typeField("#tad-defAvg", "30");
  await typeField("#tad-defAvg", "90");
  await clickReal(page, '#sheetRoot [data-ad="count:defenders"][data-v="3"]');
  const q1 = await adminState(), q1l = await look();
  W.queued = {pending: q1.pending, note: q1.note, opps: q1l.opps.length, defAvg: q1l.config.defAvg};
  check(q1.pending.filter(l => /Defenders' average/.test(l)).length === 1 && q1.pending.includes("Defenders' average 90") && q1.pending.includes("3 defenders") && /Applies on restart/.test(q1.note || "") && q1l.opps.length === 2,
    "the defenders' average (30 then 90) and a count change during play are queued: one note each, shown, nothing changed yet", W.queued);
  await typeField("#ae-gk-reflex", "30");
  const g1 = await look();
  await typeField("#ae-gk-reflex", "90");
  const g2 = await look();
  W.keeper = {r30: g1.gk.reflex, r90: g2.gk.reflex, setup: g2.setup.keeper.at.gk.reflex, config: g2.config.gk.reflex};
  check(g1.gk.reflex === 30 && g2.gk.reflex === 90 && W.keeper.setup === 90 && W.keeper.config === 90, "the keeper's reflex 30 then 90: at.gk.reflex changes at once (live), the setup and configuration keep it", W.keeper);
  await tab("scenario");
  await clickReal(page, '#sheetRoot [data-ad="restart"]');
  await page.waitForFunction(() => { const R = window.__trainRun; return R.RUN.cur && R.RUN.cur.config.defAvg === 90 && R.RUN.setup.opps.length === 3; }, null, {timeout: 10000, polling: 50}).catch(() => {});
  const q2 = await look();
  const want = await page.evaluate(async () => {
    const R = window.__trainRun, TM = await import("/js/life/train/teams.js"), A = await import("/js/life/football/attrs.js");
    const r = TM.cfgFromConfig("attacking", R.RUN.cur.config), opp = r.cfg.teams[1].players.filter(p => !p.isGK);
    const exact = opp.map(p => p.at.tackling), prof = opp.map(p => 90 + A.PROFILE[A.ARCH_OF_POS[p.slot === "CB" || p.slot === "LB" || p.slot === "RB" ? "DF" : "CM"] || "DF"].tackling);
    return {exact, prof};
  });
  const mean = l => l.reduce((s, v) => s + v, 0)/Math.max(1, l.length);
  const got = q2.opps.map(o => o.tackling);
  W.applied = {opps: q2.opps.length, got, want, pending: (await adminState()).pending, keeper: q2.gk && q2.gk.reflex};
  check(q2.opps.length === 3 && Math.abs(mean(got) - mean(want.exact)) <= 1 && Math.abs(mean(got) - mean(want.prof)) <= 6.5 && !W.applied.pending.length,
    "after the restart: 3 defenders, their mean tackling within 1 of 90 plus their profiles (and the seeded spread), nothing left pending", W.applied);
  check(q2.gk && q2.gk.reflex === 90 && q2.me.at.sprintSpeed === 99, "the live changes are still there after it (keeper reflex 90, sprint speed 99)", {gk: q2.gk, sprint: q2.me.at.sprintSpeed});

  // ---------- Ball ----------
  await relocked();
  await page.evaluate(() => window.__life.stepN(90));
  await openAdmin("ball");
  const b0 = await look();
  await clickReal(page, '#sheetRoot [data-ad="resetball"]');
  const b1 = await look();
  const sb = b1.setup.ball, dp = Math.hypot(b1.ball.p[0] - sb.x, b1.ball.p[1] - Math.max(0.11, sb.y), b1.ball.p[2] - sb.z), dv = Math.hypot(b1.ball.v[0] - sb.vx, b1.ball.v[1] - sb.vy, b1.ball.v[2] - sb.vz);
  W.resetBall = {moved: r3(Math.hypot(b0.ball.p[0] - sb.x, b0.ball.p[2] - sb.z)), dp, dv};
  check(dp <= 0.001 && dv <= 0.001, "Reset position (a real click): the ball is back at the setup's point and velocity (within 1 mm)", W.resetBall);
  await clickReal(page, '#sheetRoot [data-ad="restart"]');
  await relocked();
  const rs = await activation(), ra = await adminState();
  W.resetScenario = {rs, open: ra.open};
  check(rs.last === rs.first && !ra.open, "Reset scenario (a real click) equals Restart Current Scenario: the activation digest, the panel closed", W.resetScenario);
  // the out-of-play law: stop, then rebound again
  const outRun = async () => page.evaluate(() => {
    const R = window.__trainRun, ms = R.RUN.ms, b = ms.ball, n0 = ms.events.length;
    b.p.x = 0; b.p.y = 0.11; b.p.z = ms.spec.hz - 1.5; b.v.x = 0; b.v.y = 0; b.v.z = 12; b.w.x = b.w.y = b.w.z = 0; b.state = "free"; ms.poss.ctl = -1;
    window.__life.stepN(90);
    const ev = ms.events.slice(n0).map(e => e.kind);
    return {out: ev.includes("out"), restart: !!ms.restart, z: ms.ball.p.z, hz: ms.spec.hz, law: ms.cfg.rules.out};
  });
  await openAdmin("ball");
  await clickReal(page, '#sheetRoot [data-ad="out"][data-v="stop"]');
  const o2 = await adminState();
  await clickReal(page, '#sheetRoot [data-ad="restart"]');
  await page.waitForFunction(() => window.__trainRun.RUN.cur && window.__trainRun.RUN.cur.config.out === "stop", null, {timeout: 10000, polling: 50}).catch(() => {});
  const stopRes = await outRun();
  await openAdmin("ball");
  await clickReal(page, '#sheetRoot [data-ad="out"][data-v="rebound"]');
  await clickReal(page, '#sheetRoot [data-ad="restart"]');
  await page.waitForFunction(() => window.__trainRun.RUN.cur && window.__trainRun.RUN.cur.config.out === "rebound", null, {timeout: 10000, polling: 50}).catch(() => {});
  const rebRes = await outRun();
  W.outLaw = {note: o2.note, stop: stopRes, rebound: rebRes};
  check(/stops play/.test(o2.note || "") && stopRes.law === "stop" && stopRes.out && stopRes.restart && rebRes.law === "rebound" && !rebRes.out && !rebRes.restart && Math.abs(rebRes.z) < rebRes.hz + 3,
    "the out-of-play law really changes: 'stop' gives an out event and a restart, 'rebound' gives neither and the ball stays in the cage", W.outLaw);
  if (caps.freeplay){
    await page.evaluate(() => { const R = window.__trainRun, sc = R.scenariosOf("freeplay")[0]; R.stopScenario("hub"); if (window.__trainHub.hubOpen()) window.__trainHub.closeHub(); R.startScenario(sc.id, Object.assign(window.__trainConfig.defaults(sc.type), {pitch: "half"})); });
    await page.waitForFunction(() => !!window.__trainRun.RUN.ms, null, {timeout: 30000, polling: 100});
    await lockPointer(page);
    await openAdmin("ball");
    await typeField("#tadSpH", "0.5");
    await clickReal(page, '#sheetRoot [data-ad="spawn"]');
    await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
    const fp = await page.evaluate(() => { const ms = window.__trainRun.RUN.ms; return {y: ms.ball.p.y, live: (ms.spares || []).filter(s => s.state !== "cone").length}; });
    W.spawn = fp;
    check(Math.abs(fp.y - 0.5) < 0.01 && fp.live === 1, "Free Play: spawn height 0.5 m (typed in the panel) spawns one ball at 0.5 m", fp);
    await closeAdmin();
  } else wait("Spawn or reset and the spawn height in Free Play", "P5-A's freeplay.js (spawnBall); the panel shows these only in Free Play");

  // ---------- Scenario and Match ----------
  await page.evaluate(() => { const R = window.__trainRun; if (R.RUN.cur) R.stopScenario("hub"); if (window.__trainHub.hubOpen()) window.__trainHub.closeHub(); R.startScenario("qa-adm", window.__qaCfgA); });
  await lockPointer(page);
  await page.evaluate(() => window.__life.stepN(40));
  await openAdmin("scenario");
  const items = await page.evaluate(() => [...document.querySelectorAll("#sheetRoot .tad [data-ad]")].map(b => b.dataset.ad));
  W.items = items;
  check(["restart", "config", "hub"].every(k => items.includes(k)) && !items.includes("qitem"), "Scenario: Restart, Back to Configuration and Back to Hub are there; Reset Current Half and Reset Match are not, outside Full Match", items);
  await clickReal(page, '#sheetRoot [data-ad="restart"]');
  const rl = await relocked(), d1 = await activation(), st1 = await adminState();
  W.restart = {digest: d1, lock: rl, state: st1};
  check(d1.last === d1.first && rl && !st1.open && !st1.card, "Restart (a real click): RUN.digest() equals the activation digest, the panel closed, the pointer back, no card", W.restart);
  // Back to Hub
  await openAdmin("scenario");
  await clickReal(page, '#sheetRoot [data-ad="hub"]');
  await page.waitForFunction(() => window.__trainHub.hubOpen(), null, {timeout: 10000, polling: 50}).catch(() => {});
  const hb = await page.evaluate(() => ({cur: !!window.__trainRun.RUN.cur, inUse: window.__trainRun.poolStats().inUse, hub: window.__trainHub.hubOpen(), cat: window.__trainHub.hubCategory(), kind: document.getElementById("sheetRoot").dataset.kind, admin: window.__trainAdmin.adminIsOpen(), card: window.__trainQuick.quickIsOpen()}));
  W.hub = hb;
  check(!hb.cur && hb.inUse === 0 && hb.hub && hb.kind === "trainhub" && !hb.admin && !hb.card, "Back to Hub (a real click): the hub on the scenario's category, nothing playing, every body back in the pool, the panel and card gone", hb);
  // Replay Last after a configuration change
  await B.closeHubReal(page);
  const prevSetup = await page.evaluate(() => { const R = window.__trainRun, prev = JSON.stringify(R.RUN.last.setup); R.startScenario("qa-adm", window.__qaCfgB); return {prev, now: JSON.stringify(R.RUN.setup)}; });
  await lockPointer(page);
  await page.evaluate(() => window.__life.stepN(30));
  await openAdmin("scenario");
  await clickReal(page, '#sheetRoot [data-ad="replay"]');
  await relocked();
  const rp = await page.evaluate(() => ({setup: JSON.stringify(window.__trainRun.RUN.setup), last: JSON.stringify(window.__trainRun.RUN.last.setup), admin: window.__trainAdmin.adminIsOpen(), card: window.__trainQuick.quickIsOpen()}));
  W.replay = {changed: prevSetup.prev !== prevSetup.now, restored: rp.setup === prevSetup.prev, lastIsChanged: rp.last === prevSetup.now, admin: rp.admin, card: rp.card};
  check(W.replay.changed && W.replay.restored && W.replay.lastIsChanged && !rp.admin && !rp.card, "Replay Last (a real click) after a configuration change restores the setup before it; the panel closed", W.replay);
  // Back to Configuration
  await page.evaluate(() => window.__life.stepN(20));
  const cfgNow = await page.evaluate(() => JSON.stringify(window.__trainRun.RUN.cur.config));
  await openAdmin("scenario");
  await clickReal(page, '#sheetRoot [data-ad="config"]');
  await page.waitForFunction(() => window.__trainConfigUI.configOpen(), null, {timeout: 10000, polling: 50}).catch(() => {});
  const cf = await page.evaluate(async () => { const Q = await import("/js/life/core/quality.js"); return {cur: !!window.__trainRun.RUN.cur, inUse: window.__trainRun.poolStats().inUse, open: window.__trainConfigUI.configOpen(), cfg: JSON.stringify(window.__trainConfigUI.configNow()), cover: Q.overlayCovered(), admin: window.__trainAdmin.adminIsOpen(), card: window.__trainQuick.quickIsOpen(), sheet: document.getElementById("sheetRoot").classList.contains("open")}; });
  W.config = Object.assign({}, cf, {cfg: cf.cfg === cfgNow});
  check(!cf.cur && cf.inUse === 0 && cf.open && cf.cfg === cfgNow && cf.cover && !cf.admin && !cf.card && !cf.sheet,
    "Back to Configuration (a real click): the configuration sheet with the current configuration and its cover up, nothing playing, every body in the pool, nothing else left open", W.config);
  await page.evaluate(() => window.__trainConfigUI.closeConfig());

  // ---------- Tunables ----------
  await page.evaluate(() => window.__trainRun.startScenario("qa-adm", window.__qaCfgA));
  await lockPointer(page);
  await openAdmin("tune");
  await typeField("#tadT-R0", "0.45");
  const tu1 = await page.evaluate(async () => { const T = await import("/js/life/football/tune.js"), Z = await import("/js/life/football/zone.js"), ms = window.__trainRun.RUN.ms, me = ms.agents[ms.me];
    const r = Z.R(me, ms.ball, ms); T.tuneSet("R0", T.TUNE.R0.def); const r0 = Z.R(me, ms.ball, ms); T.tuneSet("R0", 0.45); return {v: T.TUNE.R0.value, ratio: r/r0, marked: !!document.querySelector('#sheetRoot .tad-tr.changed[data-tk="R0"]')}; });
  await clickReal(page, '#sheetRoot [data-ad="tunereset"]');
  const tu2 = await page.evaluate(async () => { const T = await import("/js/life/football/tune.js"); return {v: T.TUNE.R0.value, changed: T.TUNE_KEYS.filter(k => T.TUNE[k].value !== T.TUNE[k].def).length}; });
  W.tune = {set: tu1, reset: tu2};
  check(tu1.v === 0.45 && Math.abs(tu1.ratio - 0.5) < 1e-9 && tu1.marked && tu2.v === 0.9 && tu2.changed === 0, "Tunables (real typing): R set to x0.5 halves the control radius, Reset all to defaults restores every one", W.tune);

  // ---------- Player presets (the presets sheet slides in on the page's own frames: the page runs again) ----------
  await unfreeze(page);
  await tab("player");
  await clickReal(page, '#sheetRoot [data-ted="me"] [data-ae="preset"][data-level="low"]');
  await clickReal(page, '#sheetRoot [data-ad="foot"][data-v="Left"]');
  await clickReal(page, '#sheetRoot [data-ad="ppresets"]');
  await page.waitForFunction(() => !!document.querySelector("#sheetRoot.open #tpName"), null, {timeout: 10000, polling: 50});
  await clickReal(page, "#tpName");
  await page.keyboard.type("Low and left");
  await clickReal(page, '#sheetRoot [data-tp="save"]');
  await clickReal(page, '#sheetRoot .th-foot [data-tp="close"]');
  await page.waitForFunction(() => window.__trainAdmin.adminIsOpen(), null, {timeout: 10000, polling: 50});
  await clickReal(page, '#sheetRoot [data-ted="me"] [data-ae="preset"][data-level="max"]');
  await clickReal(page, '#sheetRoot [data-ad="foot"][data-v="Right"]');
  const pr0 = await look();
  await clickReal(page, '#sheetRoot [data-ad="ppresets"]');
  await page.waitForFunction(() => !!document.querySelector('#sheetRoot.open [data-tp="load"]'), null, {timeout: 10000, polling: 50});
  const meta = await page.evaluate(() => (document.querySelector("#sheetRoot .tp-row .tp-meta") || {}).textContent || "");
  await clickReal(page, '#sheetRoot [data-tp="load"]');
  await page.waitForFunction(() => window.__trainAdmin.adminIsOpen(), null, {timeout: 10000, polling: 50});
  const pr1 = await look();
  const allIs = (at, v) => ["power", "passing", "sprintSpeed", "tackling", "heading"].every(k => at[k] === v);
  W.presets = {changed: {power: pr0.me.at.power, foot: pr0.me.foot}, loaded: {power: pr1.me.at.power, sprint: pr1.me.at.sprintSpeed, foot: pr1.me.foot}, meta, height: caps.height};
  check(allIs(pr0.me.at, 99) && pr0.me.foot === "R" && allIs(pr1.me.at, 35) && (caps.prefFoot ? pr1.me.foot === "L" : true),
    "a player preset (attributes and foot) saved, everything changed, loaded: the attributes and foot come back", W.presets);
  if (!caps.prefFoot) wait("the preferred foot kept in a player preset", "P5-A's me.prefFoot schema field (config.js validate keeps only the skills until then)");
  if (!caps.height) wait("the height kept in a player preset", "P5-A's me.height schema field");
  await closeAdmin();
  const back = await relocked(), bs = await adminState(), bt0 = (await look()).t;
  await page.waitForFunction(t0 => window.__trainRun.RUN.ms && window.__trainRun.RUN.ms.t > t0, bt0, {timeout: 15000, polling: 100}).catch(() => {});
  const bt1 = (await look()).t;
  W.afterPresets = {lock: back, card: bs.card, played: r3(bt1 - bt0)};
  check(back && !bs.card && bt1 > bt0, "closing the panel after the presets round trip lets play go on (no pause card)", W.afterPresets);

  // ---------- outside a scenario, and the panel's own Esc ----------
  await page.evaluate(() => { const R = window.__trainRun; R.stopScenario("hub"); if (window.__trainHub.hubOpen()) window.__trainHub.closeHub(); });
  await openAdmin("player");
  const out1 = await page.evaluate(() => ({none: !!document.querySelector("#sheetRoot .tad .tad-none"), sec: window.__trainAdmin.state().sec}));
  await pressReal(page, "Escape");
  await page.waitForFunction(() => !window.__trainAdmin.adminIsOpen(), null, {timeout: 5000, polling: 50}).catch(() => {});
  const out2 = await adminState();
  if (caps.height){
    const sb = await page.evaluate(() => ({eyeH: window.__life.P.eyeH, last: window.__trainRun.RUN.last && window.__trainRun.RUN.last.setup.me.scale}));
    W.sandboxEye = sb;
    check(sb.last > 0 && Math.abs(sb.eyeH - 1.68*sb.last) < 0.01, "outside a scenario the sandbox eye is at the height set too", sb);
  }
  W.outside = {out1, open: out2.open};
  check(out1.none && !out2.open, "outside a scenario the panel opens and says what to start first; Esc closes it", W.outside);
  // never outside Training: the event is ignored on the title
  await B.exitByHub(page);
  const title = await page.evaluate(() => { dispatchEvent(new CustomEvent("train:admin", {detail: {open: true}})); return {open: window.__trainAdmin.adminIsOpen(), sheet: document.getElementById("sheetRoot").dataset.kind || ""}; });
  W.title = title;
  check(!title.open && title.sheet !== "trainadmin", "outside Training (the title) the panel never opens", title);
  const tun = await page.evaluate(async () => { const T = await import("/js/life/football/tune.js"); return T.TUNE_KEYS.filter(k => T.TUNE[k].value !== T.TUNE[k].def).length; });
  check(tun === 0, "leaving Training puts every tunable back to its default (a career match never plays with Training's)", tun);

  // ---------- the career ----------
  check(!(await B.trainWrites(page)).length, "no career key written while Training ran (write spy)", await B.trainWrites(page));
  const careerAfter = await B.careerSnapshot(page);
  check(B.careerDiff(careerBefore, careerAfter).length === 0, "the career keys are unchanged (career diff)", B.careerDiff(careerBefore, careerAfter));
} catch(e){ res.errors.push("tr5-admin: " + (e && e.stack || e)); }
finally {
  res.errors.push(...page.errors.map(x => "page: " + x));
  await t.close();
}
finish();
