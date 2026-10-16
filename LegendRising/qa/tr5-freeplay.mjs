// qa/tr5-freeplay.mjs: Free Play, its practice opponents, its presets, and the player's height and foot in the config.
// Owner: P5-A (Training Mode Phase 5). Contract: BUILD-PLAN P5-A acceptance "qa/tr5-freeplay.mjs"; TRAINING-SPEC 4
// (Free Play: no objectives; Q spawns or resets ONE ball in front of the player at a sensible distance and a valid
// height, never inside the body; optional practice opponents; presets for Free Play) and 1 (the career is never written).
//
// Node part (the real simulation, seeded):
//   - the practice opponents' behaviours, 10 seeds each, the player's agent dribbling past at 2 to 4 m, driven by the
//     player's own controls (control.js controlStep, W held): stand holds his spot within 0.5 m over 10 s, faces the
//     ball within 30 degrees in 90% of frames, and makes no tackle or challenge; jockey stays 1.5 to 3.5 m from the
//     player and goal side in at least 85% of the frames from the moment he first engages (within 3.5 m), and makes no
//     tackle or challenge; press closes to 1.5 m within 3 s and makes at least one tackle or challenge within 10 s;
//   - the height and the foot in the config: with a held career the defaults are its height and foot.
// Browser part (real input under pointer lock):
//   - Free Play started from the hub by real clicks; 30 Q presses (standing at random facings, walking, sprinting,
//     near the fence, near a goal, near a practice opponent): exactly one ball every time, in front within 15 degrees
//     of the body's facing and 1.0 to 1.4 m out scaled by height (a ball that had to be pushed out of a fence, a goal or a
//     body is checked for that instead), y the radius, no capsule overlap, inside the fence; geometries grow by 0;
//   - practice opponents spawn and despawn cleanly (a count queued with the runner's queueChange: the note shows, the
//     restart applies it), no objective UI, the Q hint on the Training HUD here and not in another scenario;
//   - cfgFromConfig with me.height 1.70 and 1.95 gives the look rule's scale (lookSane) within 0.001, me.prefFoot Left
//     gives a.foot 'L' after createAgent;
//   - a named 'free' preset (2 opponents, press, average 70, spawn height 0.5 m) saved by real typing and clicks,
//     the page reloaded, loaded from the hub's Presets: the same configuration, the opponents with those settings, Q at
//     0.5 m;
//   - the career untouched (write spy, career diff).
//
//   node qa/tr5-freeplay.mjs          exits 1 on any failed check; writes qa/out/tr5-freeplay.json
import {report, snap} from "./lib.mjs";
import {trainLaunch, enterByButton, trainWrites, careerSnapshot, careerDiff, clickReal, assertVisible, pressReal, lockPointer, closeHubReal, registerTestScenarios, frames, hubUp} from "./tr4b-lib.mjs";
import {createMatch, simStep} from "../js/life/football/sim.js";
import {cagePitch} from "../js/life/football/cagespec.js";
import {cfgFromConfig} from "../js/life/train/teams.js";
import * as C from "../js/life/train/config.js";
import {refreshPred} from "../js/life/football/actions.js";
import {controlStep, controlReset, CTRL} from "../js/life/football/control.js";
import {P as LP} from "../js/life/core/state.js";

const res = {behave: {}, held: null, q: [], one: null, geo: null, opps: null, hud: null, foot: null, preset: null, career: null, errors: []};
const check = (ok, what, got) => { if (!ok) res.errors.push(`${what}: ${JSON.stringify(got).slice(0, 1500)}`); console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok ? "" : ": " + JSON.stringify(got).slice(0, 400)}`); };
const H = 1/60, R = 0.11, D2R = Math.PI/180;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

/* ==================== Node: the practice opponents' behaviours ==================== */
function behaveRun(behave, seed){
  const spec = cagePitch("full");
  const c = C.validate("free", {opps: true, defenders: 1, opts: {behave}, seed});
  const {cfg} = cfgFromConfig("free", c, seed, spec);
  const ms = createMatch(cfg);
  ms.phase = "live"; ms.restart = null; ms.clock.running = true;
  const me = ms.agents[ms.me], o = ms.agents.find(a => a.team !== me.team && a.role === "player" && !a.isGK);
  const put = (a, x, z, yaw) => { a.m.x = a.x0 = x; a.m.z = a.z0 = z; a.m.vx = a.m.vz = a.m.speed = 0; a.m.yaw = a.m.heading = yaw; a.set = null; a.plan = null; };
  // the player sets off from 12 m out along z = 0 toward the goal at +x; the opponent stands 2 to 4 m to one side of
  // that line (by the seed), and the runner's way of giving him his behaviour (a.drill with his spawn point)
  const lat = (2 + (seed % 5)*0.5)*(seed % 2 ? 1 : -1), sx = -8, sz = lat;
  put(me, -20, 0, -Math.PI/2); put(o, sx, sz, Math.PI/2);
  o.drill = {behave, x: sx, z: sz};
  const b = ms.ball; b.state = "free"; b.p.x = -19.4; b.p.y = R; b.p.z = 0; b.v.x = b.v.y = b.v.z = 0;
  ms.poss.ctl = me.id; ms.poss.team = me.team; ms.poss.agent = me.id;
  refreshPred(ms); controlReset();
  const out = {lat, frames: 0, maxOff: 0, face: 0, band: 0, engaged: 0, goalSide: 0, close: null, deeds: 0, kinds: {}};
  const ev0 = ms.events.length;
  let lastAct = null, eng = false;
  const gx = -ms.dirs[o.team]*spec.hx;
  for (let i = 0; i < 600; i++){
    // the bot: the player's own controls, W held, looking along the line
    LP.yaw = -Math.PI/2; LP.pitch = -0.3; CTRL.enabled = true; CTRL.held.w = true;
    controlStep(ms, me, H, {live: true});
    simStep(ms, H);
    out.frames++;
    const d = Math.hypot(o.m.x - me.m.x, o.m.z - me.m.z);
    out.maxOff = Math.max(out.maxOff, Math.hypot(o.m.x - sx, o.m.z - sz));
    const fx = -Math.sin(o.m.yaw), fz = -Math.cos(o.m.yaw), bx = b.p.x - o.m.x, bz = b.p.z - o.m.z, bl = Math.hypot(bx, bz) || 1;
    if ((fx*bx + fz*bz)/bl >= Math.cos(30*D2R)) out.face++;
    if (d <= 3.5) eng = true;
    if (eng){
      out.engaged++;
      if (d >= 1.5 && d <= 3.5 && Math.hypot(gx - o.m.x, o.m.z) < Math.hypot(gx - me.m.x, me.m.z)) out.band++;
    }
    if (d <= 1.5 && out.close == null) out.close = +(i*H).toFixed(2);
    if (o.act && (o.act.kind === "tackle" || o.act.kind === "slide") && o.act !== lastAct) out.deeds++;
    lastAct = o.act;
  }
  CTRL.held.w = false; controlReset();
  for (const e of ms.events.slice(ev0)){
    if (e.agent !== o.id) continue;
    out.kinds[e.kind] = (out.kinds[e.kind] || 0) + 1;
    // (a tackle, a shield challenge, a 50/50 at the feet; the 'challenge' event is the stats' count of a defender
    // within 3 m of the man on the ball, events.js CHALLENGE_D, not something he does)
    if (e.kind === "tackle" || e.kind === "shieldChal" || e.kind === "duel") out.deeds++;
  }
  for (const e of ms.events.slice(ev0)) if (e.kind === "duel" && e.other === o.id){ out.kinds.duel = (out.kinds.duel || 0) + 1; out.deeds++; }
  return out;
}
{
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  for (const bh of ["stand", "jockey", "press"]) res.behave[bh] = seeds.map(s => behaveRun(bh, s));
  const S = res.behave.stand, J = res.behave.jockey, Pr = res.behave.press;
  check(S.every(r => r.maxOff <= 0.5), "stand: his root stays within 0.5 m of his spawn point over 10 s (10 seeds)", S.map(r => +r.maxOff.toFixed(3)));
  check(S.every(r => r.face >= 0.9*r.frames), "stand: he faces the ball within 30 degrees in at least 90% of frames", S.map(r => r.face));
  check(S.every(r => r.deeds === 0), "stand: no tackle and no challenge", S.map(r => r.kinds));
  check(J.every(r => r.engaged > 0 && r.band >= 0.85*r.engaged), "jockey: 1.5 to 3.5 m from the player and goal side in at least 85% of the frames once engaged (10 seeds)", J.map(r => [r.band, r.engaged]));
  check(J.every(r => r.deeds === 0), "jockey: no tackle and no challenge", J.map(r => r.kinds));
  check(Pr.every(r => r.close != null && r.close <= 3), "press: he closes to 1.5 m within 3 s (10 seeds)", Pr.map(r => r.close));
  check(Pr.every(r => r.deeds >= 1), "press: at least one tackle or challenge within 10 s", Pr.map(r => r.kinds));
}

/* ==================== Node: the height and the foot by default, with a career held ==================== */
{
  const d0 = C.defaults("free").me;
  globalThis.heldLook = () => ({height: 1.03}); globalThis.heldFoot = () => "Left";
  const d1 = C.defaults("attacking").me, f1 = C.defaults("free").me;
  globalThis.heldFoot = () => "B";
  const d2 = C.defaults("attacking").me;
  delete globalThis.heldLook; delete globalThis.heldFoot;
  const r = cfgFromConfig("attacking", C.defaults("attacking"), 1);
  res.held = {none: [d0.height, d0.prefFoot], held: [d1.height, d1.prefFoot], free: [f1.height, f1.prefFoot], both: d2.prefFoot};
  check(d0.height === 1.8 && d0.prefFoot === "Right", "with no career held (and no look under node): 1.80 m and the right foot", res.held);
  check(Math.abs(d1.height - 1.03*1.8) < 1e-9 && d1.prefFoot === "Left" && f1.height === d1.height && f1.prefFoot === "Left" && d2.prefFoot === "Both",
    "with a career held the defaults are its height (look.height x 1.80 m) and its preferred foot, for every type", res.held);
  const me = r.cfg.teams[r.cfg.me.team].players.find(p => p.isMe);
  check(me.scale === 1 && me.prefFoot === "Right" && r.setup.me.scale === 1 && r.setup.me.foot === "Right", "the defaults reach the player record and the runner's setup", {scale: me.scale, foot: me.prefFoot});
  const v = C.validate("free", {me: {height: 3, prefFoot: "Middle"}}), w = C.validate("free", {me: {height: 1.2, prefFoot: "L"}});
  check(v.me.height === C.heightRange().max && v.me.prefFoot === "Right" && w.me.height === C.heightRange().min && w.me.prefFoot === "Left",
    "validate keeps the height within the look editor's range and the foot one of Right, Left or Both", {v: v.me, w: w.me, range: C.heightRange()});
}

/* ==================== the browser ==================== */
const t = await trainLaunch({seed: 6});
const {page} = t;
const pageErr = [];
page.on("pageerror", e => pageErr.push(String(e)));
page.on("console", m => { if (m.type() === "error") pageErr.push(m.text()); });

// one string the page runs: the ball count, the last Q and the checks on it
const QCHECK = `(() => {
  const R = window.__trainRun, T = R.RUN.T, ms = T.ms, F = window.__trainFree, L = F.last, spec = T.spec;
  const live = ms.spares.filter(q => q.state !== "cone" && q.state !== "gone");
  const extraShown = T.V ? T.V.extra.filter(m => m.mesh.visible).length : -1;
  const fence = spec.cage.fence;
  return {spawns: F.spawns, last: L, balls: live.length, isMain: live.length === 1 && live[0].ball === ms.ball, extraShown,
    inside: !!L && Math.abs(L.x) <= fence.hx - 0.11 && Math.abs(L.z) <= fence.hz - 0.11 && L.y <= fence.h, ballNow: [ms.ball.p.x, ms.ball.p.y, ms.ball.p.z]};
})()`;
// the capsules of a body (agent.js capsules) against the ball at the Q
function overlaps(L){
  const out = [];
  for (const b of L.bodies){
    const s = b.scale, y = L.y, d = Math.hypot(L.x - b.x, L.z - b.z);
    const caps = [[0, .85*s, .16*s], [.85*s, 1.5*s, .25*s]];
    for (const [y0, y1, r] of caps) if (y + R > y0 && y - R < y1 && d < r + R - 1e-6) out.push({id: b.id, d, r});
    if (Math.abs(y - 1.66*s) < .12*s + R && d < .12*s + R - 1e-6) out.push({id: b.id, d, head: true});
  }
  return out;
}
const q = [];
const dbg = (...a) => { if (process.env.DBG) console.log(new Date().toISOString().slice(11, 19), ...a); };
async function pressQ(label, extra = {}){
  dbg("press", label);
  const n0 = await page.evaluate(() => window.__trainFree.spawns);
  await frames(page, 1);
  dbg("framed");
  const g0 = await page.evaluate(() => window.__life.renderer().info.memory.geometries);
  await pressReal(page, "q", {hold: 30});
  await page.waitForFunction(n => window.__trainFree.spawns > n, n0, {timeout: 10000}).catch(() => {});
  await frames(page, 2);
  const g1 = await page.evaluate(() => window.__life.renderer().info.memory.geometries);
  const s = await page.evaluate(QCHECK);
  const L = s.last, ok1 = s.spawns === n0 + 1;
  const ang = L ? Math.atan2(L.x - L.me.x, L.z - L.me.z) : 0, face = L ? Math.atan2(-Math.sin(L.me.yaw), -Math.cos(L.me.yaw)) : 0;
  const dAng = L ? Math.abs(wrap(ang - face))/D2R : 999, dist = L ? Math.hypot(L.x - L.me.x, L.z - L.me.z) : 0;
  const ov = L ? overlaps(L) : [{none: true}];
  const row = {label, spawned: ok1, balls: s.balls, isMain: s.isMain, extraShown: s.extraShown, pushed: L && L.pushed, dAng: +dAng.toFixed(2), dist: +dist.toFixed(3),
    scale: L && L.me.scale, speed: L && +L.me.speed.toFixed(2), y: L && L.y, inside: s.inside, overlaps: ov.length, geo: g1 - g0, ...extra};
  const s0 = row.scale || 1;
  row.front = row.pushed ? null : dAng <= 15 && dist >= 1.0*s0 - 0.01 && dist <= 1.4*s0 + 0.01;
  q.push(row);
  return row;
}
// you placed on the pitch for a press (the test's setup: the agent and the look together, a cut for the simulation)
const place = (x, z, yaw) => page.evaluate(([x, z, yaw]) => {
  const T = window.__trainRun.RUN.T, m = T.me.m, P = window.__life.P;
  m.x = T.me.x0 = x; m.z = T.me.z0 = z; m.vx = m.vz = m.speed = 0; m.yaw = m.heading = yaw; P.yaw = yaw; T.ms.cutStep = T.ms.step;
}, [x, z, yaw]);

try {
  const careerBefore = await careerSnapshot(page);
  await enterByButton(page);
  // ---------- Free Play from the hub, by real clicks ----------
  await clickReal(page, '#sheetRoot [data-th="cat"][data-id="freeplay"]');
  await page.waitForFunction(() => !!document.querySelector('#sheetRoot [data-th="start"][data-id="freeplay"]'), null, {timeout: 10000});
  const sv = await assertVisible(page, '#sheetRoot [data-th="start"][data-id="freeplay"]');
  check(sv.ok, "the hub's Free Play category has Free Play with a visible Start", sv);
  await clickReal(page, '#sheetRoot [data-th="start"][data-id="freeplay"]');
  await page.waitForFunction(() => { const R = window.__trainRun.RUN; return !!R.cur && R.cur.id === "freeplay" && !R.switching && !!R.T && !!R.T.V; }, null, {timeout: 120000});
  check(!!(await lockPointer(page)), "the pointer is locked on the game", null);
  await frames(page, 10);
  const geo0 = await page.evaluate(() => window.__life.renderer().info.memory.geometries);

  // ---------- the Training HUD: the Q hint here ----------
  res.hud = await page.evaluate(() => { const e = document.getElementById("trainHud"); return {text: e ? e.textContent.replace(/\s+/g, " ") : null, q: !!(e && [...e.querySelectorAll(".thud-own kbd")].some(k => k.textContent === "Q"))}; });
  check(res.hud.q && /a ball in front of you/.test(res.hud.text), "the Training HUD shows the Q hint in Free Play", res.hud);

  // ---------- 30 presses of Q ----------
  // standing, at random facings (the look turned with the real mouse under pointer lock)
  for (let i = 0; i < 10; i++){
    dbg("place", i);
    await place(0, 0, 0);
    await page.mouse.move(640 + (i*137 % 400) - 200, 400, {steps: 4});
    // (the body turns to where you look: until it faces it, in the simulation's own time)
    await page.waitForFunction(() => { const T = window.__trainRun.RUN.T, P = window.__life.P; return Math.abs(Math.atan2(Math.sin(T.me.m.yaw - P.yaw), Math.cos(T.me.m.yaw - P.yaw))) < 0.05 && T.me.m.speed < 0.05; }, null, {timeout: 30000, polling: 100}).catch(() => {});
    await pressQ("standing, a random facing");
  }
  // walking (W) and sprinting (Shift and W)
  for (let i = 0; i < 6; i++){
    await place(-20, (i - 3)*6, -Math.PI/2 + (i - 3)*0.3);
    await page.keyboard.down("w");
    await page.waitForFunction(() => window.__trainRun.RUN.T.me.m.speed > 2.5, null, {timeout: 20000}).catch(() => {});
    await pressQ("walking");
    await page.keyboard.up("w"); await frames(page, 2);
  }
  for (let i = 0; i < 6; i++){
    await place(-30, (i - 3)*6, -Math.PI/2);
    await page.keyboard.down("Shift"); await page.keyboard.down("w");
    await page.waitForFunction(() => window.__trainRun.RUN.T.me.m.speed > 5.5, null, {timeout: 20000}).catch(() => {});
    await pressQ("sprinting");
    await page.keyboard.up("w"); await page.keyboard.up("Shift"); await frames(page, 2);
  }
  // near the fence: facing it (no room in front: pushed back inside) and running along it
  const fz = await page.evaluate(() => window.__trainRun.RUN.T.spec.runoff.hz);
  for (const [x, z, yaw, lab] of [[10, fz - .05, Math.PI, "at the fence, facing it"], [-10, -fz + .05, 0, "at the fence, facing it"], [0, fz - .1, -Math.PI/2, "at the fence, along it"], [20, -fz + .1, Math.PI/2, "at the fence, along it"]]){
    await place(x, z, yaw); await frames(page, 4);
    await pressQ(lab);
  }
  // near a goal: in front of it, and with the goal right in front of you (the frame and net are solid: pushed out)
  const hx = await page.evaluate(() => window.__trainRun.RUN.T.spec.hx);
  for (const [x, z, lab] of [[hx - 6, 2, "near a goal"], [hx - 0.9, 0.5, "at a goal, the net in front"]]){
    await place(x, z, -Math.PI/2); await frames(page, 4);
    await pressQ(lab);
  }

  // ---------- practice opponents: a count queued (the note), applied at the restart, despawned ----------
  const geoA = await page.evaluate(() => window.__life.renderer().info.memory.geometries);
  const pool0 = await page.evaluate(() => window.__trainRun.poolStats());
  await page.evaluate(() => window.__trainRun.queueChange({key: "opps", label: "3 opponents who stand still", apply: c => Object.assign(c, {opps: true, defenders: 3, opts: Object.assign({}, c.opts, {behave: "stand"})})}));
  const note = await page.evaluate(() => ({pending: window.__trainRun.RUN.pending, hud: [...document.querySelectorAll("#trainHud .thud-pend")].map(e => e.textContent)}));
  check(note.pending && note.pending.length === 1 && note.hud[0] === "Applies on restart: 3 opponents who stand still", "a queued change is listed in RUN.pending and shown on the HUD as a note", note);
  await pressReal(page, "Backspace");
  await page.waitForFunction(() => { const R = window.__trainRun.RUN; return !!R.cur && !R.switching && !!R.T && !!R.T.V && R.setup && R.setup.opps.length === 3; }, null, {timeout: 60000});
  await lockPointer(page);
  await frames(page, 10);
  const o1 = await page.evaluate(() => { const R = window.__trainRun, T = R.RUN.T; return {pool: R.poolStats(), pending: R.RUN.pending, opps: T.ms.agents.filter(a => a.team !== T.myTeam && a.role === "player").map(a => ({drill: a.drill && a.drill.behave, ovr: null})), hud: [...document.querySelectorAll("#trainHud .thud-pend")].length}; });
  check(o1.pending === null && o1.hud === 0 && o1.opps.length === 3 && o1.opps.every(o => o.drill === "stand") && o1.pool.inUse === pool0.inUse + 3,
    "Backspace applies it: three practice opponents spawn with their behaviour, three more pooled bodies in use, the note gone", {o1, pool0});
  // a Q next to one of them: pushed out of his body
  const geoB = await page.evaluate(() => window.__life.renderer().info.memory.geometries);
  const op = await page.evaluate(() => { const T = window.__trainRun.RUN.T, o = T.ms.agents.find(a => a.team !== T.myTeam && a.role === "player"); return {x: o.m.x, z: o.m.z}; });
  for (const k of [1.0, 1.25]){
    await place(op.x - k, op.z, -Math.PI/2); await frames(page, 2);
    await pressQ("next to a practice opponent");
  }
  const geoC = await page.evaluate(() => window.__life.renderer().info.memory.geometries);
  // no objective: nothing judged, no result line, no result card
  await page.waitForFunction(t0 => window.__trainRun.RUN.T.t > t0 + 1.5, await page.evaluate(() => window.__trainRun.RUN.T.t), {timeout: 120000});
  const obj = await page.evaluate(() => { const T = window.__trainRun.RUN.T, n = document.querySelector("#trainHud .thud-note"); return {results: T.results.length, verdict: window.__trainRun.RUN.cur.verdict, note: n ? !n.hidden : null, card: !!document.querySelector("#fpOverlay.on")}; });
  check(obj.results === 0 && !obj.verdict && obj.note === false && !obj.card, "no objective: nothing judged, no result line on the HUD, no result card", obj);
  // stopped: every body back in the pool, nothing left of it
  await page.evaluate(() => window.__trainRun.stopScenario("hub"));
  await page.waitForFunction(() => !window.__trainRun.RUN.cur, null, {timeout: 10000});
  const o2 = await page.evaluate(() => ({pool: window.__trainRun.poolStats(), hud: !!document.getElementById("trainHud"), free: window.__trainFree.freePlaying()}));
  check(o2.pool.inUse === 0 && !o2.hud && !o2.free, "they despawn cleanly when it stops: no pooled body in use, no HUD", o2);
  res.opps = {note, o1, o2, obj};

  // ---------- the 30 presses ----------
  res.q = q;
  // (measured across each press, three drawn frames either side: what the camera first brings into view as you are
  // moved about the pitch between presses, a goal or the three opponents of the restart, is not the press's)
  res.geo = {before: geo0, after28: geoA, restart: geoB, after30: geoC, perPress: q.map(r => r.geo), grew: q.reduce((a, r) => a + r.geo, 0)};
  check(q.length === 30, "30 presses of Q", q.length);
  check(q.every(r => r.spawned && r.balls === 1 && r.isMain && r.extraShown === 0), "exactly one ball every time (the same ball moved; no second ball drawn)", q.filter(r => !(r.spawned && r.balls === 1 && r.isMain && r.extraShown === 0)));
  check(q.every(r => r.front !== false), "in front within 15 degrees of the body's facing and 1.0 to 1.4 m out scaled by height (every ball not pushed out of something)", q.filter(r => r.front === false));
  check(q.filter(r => !r.pushed).length >= 24, "most presses need no push (open grass)", q.filter(r => r.pushed).map(r => r.label));
  check(q.filter(r => r.label === "walking").every(r => r.speed > 2) && q.filter(r => r.label === "sprinting").every(r => r.speed > 5), "presses made while really on the move (over 2 m/s) and really sprinting (over 5 m/s)", q.map(r => [r.label, r.speed]));
  check(q.every(r => Math.abs(r.y - R) < 1e-9), "on the grass: y equals the ball's radius", q.map(r => r.y));
  check(q.every(r => r.overlaps === 0 && r.inside), "never inside a body's capsule, always inside the fence", q.filter(r => r.overlaps || !r.inside));
  check(q.filter(r => /facing it|net in front|next to/.test(r.label)).every(r => r.pushed), "where there was no room in front (the fence, the goal, a body) it was pushed to the nearest free point", q.filter(r => /facing it|net in front|next to/.test(r.label)));
  check(res.geo.grew === 0, "geometries grow by 0 over the 30 presses", res.geo);

  // ---------- the Q hint only in Free Play ----------
  await closeHubReal(page);
  await registerTestScenarios(page);
  await page.evaluate(() => window.__trainRun.startScenario("qa-3v3", {}));
  await page.waitForFunction(() => { const R = window.__trainRun.RUN; return !!R.cur && !R.switching && !!document.getElementById("trainHud"); }, null, {timeout: 120000});
  const other = await page.evaluate(() => { const e = document.getElementById("trainHud"); return {q: [...e.querySelectorAll("kbd")].some(k => k.textContent === "Q"), text: e.textContent.replace(/\s+/g, " ")}; });
  await lockPointer(page);
  const n0 = await page.evaluate(() => window.__trainFree.spawns);
  await pressReal(page, "q");
  await frames(page, 5);
  const n1 = await page.evaluate(() => window.__trainFree.spawns);
  check(!other.q && !/ball in front of you/.test(other.text) && n1 === n0, "another scenario shows no Q hint, and Q there does nothing of Free Play's", {other, n0, n1});
  await page.evaluate(() => window.__trainRun.stopScenario("hub"));

  // ---------- height and foot in the config (the look rule, createAgent) ----------
  res.foot = await page.evaluate(async () => {
    const T = await import("/js/life/train/teams.js"), A = await import("/js/life/football/agent.js");
    const out = {};
    for (const h of [1.70, 1.95]){
      const r = T.cfgFromConfig("attacking", {me: {height: h}}), me = r.cfg.teams[r.cfg.me.team].players.find(p => p.isMe);
      out[h] = {scale: me.scale, look: lookSane({height: h/1.8}, 1).height, setup: r.setup.me.scale};
    }
    const r = T.cfgFromConfig("attacking", {me: {prefFoot: "Left"}}), me = r.cfg.teams[r.cfg.me.team].players.find(p => p.isMe);
    out.foot = {rec: me.prefFoot, cfg: r.cfg.me.prefFoot, agent: A.createAgent(Object.assign({id: 1}, me)).foot};
    return out;
  });
  check([1.70, 1.95].every(h => Math.abs(res.foot[h].scale - res.foot[h].look) <= 0.001 && res.foot[h].setup === res.foot[h].scale), "me.height 1.70 and 1.95 give the player record the scale the look rule gives (within 0.001)", res.foot);
  check(res.foot.foot.rec === "Left" && res.foot.foot.cfg === "Left" && res.foot.foot.agent === "L", "me.prefFoot Left gives a.foot 'L' after createAgent", res.foot.foot);

  // ---------- a Free Play preset: saved, the page reloaded, loaded ----------
  const want = await page.evaluate(async () => {
    const Cf = await import("/js/life/train/config.js");
    const c = Cf.validate("free", Object.assign(Cf.defaults("free"), {opps: true, defenders: 2, defAvg: 70, opts: {behave: "press", spawnY: 0.5, spawnV: 0}}));
    window.__trainHub.setScenarioConfig("freeplay", c);
    return window.__trainHub.scenarioConfig("freeplay");
  });
  await page.evaluate(() => window.__trainHub.openHub("freeplay"));
  await hubUp(page);
  await clickReal(page, '#sheetRoot [data-th="presets"][data-id="freeplay"]');
  await page.waitForFunction(() => !!document.querySelector("#sheetRoot.open .tp") && window.__trainPresetUI.presetsOpen(), null, {timeout: 15000});
  await clickReal(page, "#tpName");
  await page.keyboard.type("Pressing pair", {delay: 15});
  await clickReal(page, '#sheetRoot [data-tp="save"]');
  await page.waitForFunction(() => document.querySelectorAll("#sheetRoot .tp-row").length === 1, null, {timeout: 10000});
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("freyaFootball.trainPresets")));
  check(stored && stored.byType.free && stored.byType.free.length === 1 && JSON.stringify(stored.byType.free[0].config) === JSON.stringify(want), "the preset is saved under type free with the configuration as it was", stored && stored.byType.free);
  await clickReal(page, '#sheetRoot .th-foot [data-tp="close"]');
  await page.waitForFunction(() => !window.__trainPresetUI.presetsOpen(), null, {timeout: 10000});
  const writesBefore = await trainWrites(page);
  await page.reload();
  await page.waitForFunction(() => typeof newCareer === "function" && !!window.__life && document.readyState !== "loading", null, {timeout: 60000});
  await enterByButton(page);
  await clickReal(page, '#sheetRoot [data-th="cat"][data-id="freeplay"]');
  await page.waitForFunction(() => !!document.querySelector('#sheetRoot [data-th="presets"][data-id="freeplay"]'), null, {timeout: 10000});
  await clickReal(page, '#sheetRoot [data-th="presets"][data-id="freeplay"]');
  await page.waitForFunction(() => !!document.querySelector("#sheetRoot.open .tp-row"), null, {timeout: 15000});
  const row = await page.evaluate(() => { const r = document.querySelector("#sheetRoot .tp-row"); return {id: r.dataset.row, name: r.querySelector(".tp-name").textContent, meta: r.querySelector(".tp-meta").textContent}; });
  await clickReal(page, `#sheetRoot [data-row="${row.id}"] [data-tp="load"]`);
  await page.waitForFunction(() => { const R = window.__trainRun.RUN; return !!R.cur && R.cur.id === "freeplay" && !R.switching && !!R.T && !!R.T.V; }, null, {timeout: 120000});
  await lockPointer(page);
  await frames(page, 10);
  const ld = await page.evaluate(() => { const R = window.__trainRun.RUN, T = R.T; return {config: R.cur.config, preset: R.cur.preset,
    opps: T.ms.agents.filter(a => a.team !== T.myTeam && a.role === "player" && !a.isGK).map(a => ({drill: a.drill && a.drill.behave})), ovr: R.setup.opps.map(p => p.ovr), hud: document.getElementById("trainHud").textContent.replace(/\s+/g, " ")}; });
  await place(-30, 0, -Math.PI/2);
  await frames(page, 4);
  const qp = await pressQ("after loading the preset");
  q.pop();
  res.preset = {row, want, ld, q: qp};
  check(row.name === "Pressing pair", "after the reload the preset is listed by its name", row);
  check(JSON.stringify(ld.config) === JSON.stringify(want) && ld.preset && ld.preset.name === "Pressing pair" && /Pressing pair/.test(ld.hud), "Load plays exactly the saved configuration, named on the HUD", {same: JSON.stringify(ld.config) === JSON.stringify(want), preset: ld.preset});
  check(ld.opps.length === 2 && ld.opps.every(o => o.drill === "press") && ld.ovr.every(v => v === 70), "the opponents spawn with those settings: two of them, pressing, average 70", ld);
  check(Math.abs(qp.y - 0.5) < 1e-9 && qp.spawned, "Q spawns the ball at the saved height, 0.5 m", qp);
  await snap(page, "tr5-freeplay");

  // ---------- the career never touched ----------
  await page.evaluate(() => window.__trainRun.stopScenario("hub"));
  const writes = (await trainWrites(page)).concat(writesBefore);
  const careerAfter = await careerSnapshot(page);
  res.career = {writes, diff: careerDiff(careerBefore, careerAfter)};
  check(writes.length === 0 && res.career.diff.length === 0, "the career save is never written (write spy) and the career keys are unchanged (career diff)", res.career);
  check(pageErr.length === 0, "no console or page errors", pageErr);
} catch(e){
  res.errors.push("crash: " + (e && e.stack || e));
  console.log("FAIL crash", e);
} finally {
  await t.close();
}
res.ok = res.errors.length === 0;
report("tr5-freeplay", res);
console.log(res.ok ? "tr5-freeplay: pass" : `tr5-freeplay: ${res.errors.length} failed`);
process.exit(res.ok ? 0 : 1);
