// qa/u21-camera.mjs: USER-ISSUES U21, the camera by activity, in the real game with real input (page.mouse, the pointer
// locked by a real click). Training Mode's runner plays a scenario of the test's own on the same engine, controls,
// camera, view and HUD as a career match and the career's training sessions (one control.js, matchcam.js, view.js,
// fphud.js), so what holds here holds for every football moment.
//   - the start: behind you from its first drawn frame, your whole body drawn (U29: no first-person start eased back)
//   - third person: behind and above your head (about 4 m back, 1.8 m over it), looking at your aim point on the pitch
//     ahead (the screen's middle, where the crosshair is); your whole body drawn, the first-person one not
//   - it turns with the mouse (real movement) as the aim does
//   - the shot meter (LMB held, real), no kick selector (the wheel, real, changes nothing) and the pass assist (an RMB tap off a
//     team-mate, real) all work in third person, and the shot goes where you aim
//   - never through the fence: standing with your back to it the camera is pulled in, inside it
//   - the setting: Football camera = First person turns it back to your eyes (eased), and Third person back again
//   - Training's cage follows the Football camera setting (U29): behind you, the ball at your feet or not; first person
//     when the setting is First person
//   - no console or page error
//
//   node qa/u21-camera.mjs          exits 1 on any failed check; writes qa/out/u21-camera.json and qa/out/u21/*.png
import fs from "node:fs";
import path from "node:path";
import {report, OUT, freeze, unfreeze} from "./lib.mjs";
import {trainLaunch, enterByButton, closeHubReal, lockPointer, pressReal, frames} from "./tr4b-lib.mjs";

const DIR = path.join(OUT, "u21");
fs.mkdirSync(DIR, {recursive: true});
const res = {errors: []};
const check = (ok, what, got) => { if (!ok) res.errors.push(`${what}: ${JSON.stringify(got).slice(0, 1500)}`); console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok ? "" : ": " + JSON.stringify(got).slice(0, 900)}`); };

const t = await trainLaunch({seed: 6});
const page = t.page;
const step = n => page.evaluate(n => window.__life.stepN(n), n);
const shot = async name => { await page.screenshot({path: path.join(DIR, name + ".png"), timeout: 180000}); };
// real frames, recording the camera every frame: the largest move in one frame, and where it ended
const watch = n => page.evaluate(n => new Promise(res => {
  const cam = window.__life.cam, raf = window.__qa && window.__qa.realRAF ? window.__qa.realRAF : requestAnimationFrame;
  let k = 0, last = null, maxJump = 0, maxTurn = 0, maxSpeed = 0, t0 = 0, q0 = cam.quaternion.clone();
  const f = now => {
    const p = cam.position;
    if (last){ const d = Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z), dt = Math.max(1/240, (now - t0)/1000); maxJump = Math.max(maxJump, d); maxSpeed = Math.max(maxSpeed, d/dt); maxTurn = Math.max(maxTurn, cam.quaternion.angleTo(q0)); }
    last = {x: p.x, y: p.y, z: p.z}; q0.copy(cam.quaternion); t0 = now;
    if (++k >= n) res({maxJump, maxSpeed, maxTurn, at: last}); else raf(f);
  };
  raf(f);
}), n);
try {
  await enterByButton(page);
  await closeHubReal(page);
  await page.evaluate(async () => {
    const R = window.__trainRun;
    const C = await import("/js/life/football/control.js"), M = await import("/js/life/football/matchcam.js"), ST = await import("/js/life/core/state.js");
    const {THREE} = await import("/js/life/build.js");
    const build = (cfg, env) => {
      const hx = env.spec.hx, me = {slot: "ST", x: cfg.meX != null ? cfg.meX : hx - 22, z: cfg.meZ || 0, yaw: cfg.yaw != null ? cfg.yaw : -Math.PI/2};
      const ball = {x: me.x + .55, y: .11, z: me.z + .12, free: true};
      const mates = (cfg.mates || [[8, -10], [-3, 25]]).map(([dx, dz], i) => ({slot: ["LW", "RW", "CM"][i], x: me.x + dx, z: me.z + dz, yaw: -Math.PI/2, drill: {behave: "stand"}}));
      return {myTeam: 0, role: "Attacker", seed: 11, laws: {out: "rebound"}, me, mates, opps: [], keeper: null, ball};
    };
    if (!R.scenario("qa-u21")) R.registerScenario({id: "qa-u21", category: "attacking", type: "qau21", name: "Camera test", desc: "A test scenario", build});
    const v = new THREE.Vector3();
    window.__u21 = {C, M, ST,
      start: cfg => { if (R.RUN.cur) R.stopScenario("hub"); if (window.__trainHub.hubOpen()) window.__trainHub.closeHub(); return R.startScenario("qa-u21", cfg || {}); },
      ms: () => R.RUN.ms, T: () => R.RUN.cur && R.RUN.cur.T,
      kickEv: (from = 0) => { const ms = R.RUN.ms; return ms.events.slice(from).filter(e => e.kind === "kick" && e.agent === ms.me); },
      look(yaw, pitch){ const P = window.__life.P; if (yaw != null) P.yaw = yaw; if (pitch != null) P.pitch = pitch; },
      // the camera against your head and your look: back, up, behind; the aim point on the screen
      state(){
        const L = window.__life, T = R.RUN.cur.T, cam = L.cam, me = T.me, F = T.F || {cx: 0, cz: 0}, P = L.P, s = me.scale || 1;
        cam.updateMatrixWorld(true);
        const hx = me.m.x + F.cx, hz = me.m.z + F.cz, hy = 1.68*s + .12*s, fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
        const dx = cam.position.x - hx, dz = cam.position.z - hz, back = -(dx*fx + dz*fz), side = dx*-fz + dz*fx, up = cam.position.y - hy;
        const A = M.MC.tp.aim, q = v.set(A.x, A.y, A.z).project(cam), aimScreen = {x: (q.x + 1)/2, y: (1 - q.y)/2};
        cam.getWorldDirection(v); const cyaw = Math.atan2(-v.x, -v.z), dyaw = Math.atan2(Math.sin(cyaw - P.yaw), Math.cos(cyaw - P.yaw));
        const R0 = T.V.rec[me.id];
        return {tpK: M.MC.tpK, on: M.MC.tp.on, back, side, up, aimScreen, aimDist: Math.hypot(A.x - hx, A.z - hz), aimY: A.y, dyaw,
          whole: !!(R0 && R0.h.g.visible), fp: !!(T.V.fp && T.V.fp.g.visible), pulled: M.MC.tp.pulled, cam: {x: cam.position.x - F.cx, y: cam.position.y, z: cam.position.z - F.cz}, yaw: P.yaw, spec: {hx: T.spec.hx, hz: T.spec.hz, runoff: T.spec.runoff || null}};
      }
    };
  });
  const lock = async () => { const id = await lockPointer(page); if (!id) throw new Error("the pointer could not be locked"); await page.mouse.move(0, 0); return id; };
  const ready = () => page.waitForFunction(() => !!(window.__trainRun.RUN.cur && window.__trainRun.RUN.cur.T && window.__trainRun.RUN.cur.T.V), null, {timeout: 60000});

  /* ---------- the start: behind you from its first frame (U29) ---------- */
  await page.evaluate(() => window.__u21.C.saveSet({footCam: "third", assist: "on"}));
  await unfreeze(page); await frames(page, 20);
  const life0 = await page.evaluate(() => ({owner: window.__life.camTop ? window.__life.camTop() : null}));
  // (every real frame from the start on, once the activity draws: how far behind you the camera is, matchcam.js MC.tpK,
  // and whether your whole body is drawn, view.js V.tp)
  await page.evaluate(() => { const raf = window.__qa && window.__qa.realRAF ? window.__qa.realRAF : requestAnimationFrame; window.__u21.first = []; let n = 0;
    const f = () => { const T = window.__u21.T(); if (T && T.V){ window.__u21.first.push({k: window.__u21.M.MC.tpK, whole: !!T.V.tp}); n++; } if (n < 75) raf(f); }; raf(f); });
  await page.evaluate(() => window.__u21.start({}));
  await ready();
  const W0 = await watch(75);
  const first = await page.evaluate(() => window.__u21.first);
  const S0 = await page.evaluate(() => window.__u21.state());
  res.start = {W0, S0, life0, frames: first.length, firstFp: first.findIndex(x => x.k < 1 || !x.whole)};
  // (a cut is the whole way, about 4.4 m, in one frame: an endless speed; eased it never goes faster than matchcam.js TP.SPEED,
  // 7 m/s, under 0.15 m a 60 Hz frame; measured over the real frames' own times, with a margin for their jitter)
  check(first.length >= 20 && first.every(x => x.k === 1 && x.whole), "the start is behind you from its first drawn frame, your whole body drawn: no first-person frame, no glide while it loads", {frames: first.length, firstFp: res.start.firstFp, head: first.slice(0, 4)});
  check(W0.maxSpeed < 10 && W0.maxTurn < .35, "and steady after it: no jump (never faster than 10 m/s, under 0.17 m a 60 Hz frame; turn under 20 degrees a frame)", W0);
  check(S0.on && S0.tpK === 1, "a football activity is in third person by default", {tpK: S0.tpK});
  check(S0.back > 2.6 && S0.back < 4.4 && S0.up > 1.2 && S0.up < 2.3 && Math.abs(S0.side) < .4, "the camera is about 4 m behind you and 1.8 m above your head", {back: S0.back, up: S0.up, side: S0.side});
  // (looking level the aim is far ahead at eye height, and the camera, over your head, looks down past you to it; looking
  // a little down, the aim point is on the pitch)
  const level = await page.evaluate(() => { const cam = window.__life.cam, v = cam.getWorldDirection(new cam.position.constructor()); return {camPitch: Math.asin(v.y), pitch: window.__life.P.pitch}; });
  await page.evaluate(() => window.__u21.look(null, -.12)); await frames(page, 20);
  const Sd = await page.evaluate(() => window.__u21.state());
  res.start.level = level; res.start.down = {aimScreen: Sd.aimScreen, aimY: Sd.aimY, aimDist: Sd.aimDist};
  // (U25: the camera tilts with your look one for one, so it never races or jumps near the horizon)
  check(Math.abs(level.camPitch - level.pitch) < .01, "the camera looks where you look (its tilt is your aim's)", level);
  check(Math.abs(Sd.aimScreen.x - .5) < .02 && Math.abs(Sd.aimScreen.y - .5) < .02 && Sd.aimY < .2 && Sd.aimDist > 4, "it looks at your aim point on the pitch ahead: the screen's middle (the crosshair) is that point", res.start.down);
  check(S0.whole && !S0.fp, "your whole body is drawn, the first-person one is not", {whole: S0.whole, fp: S0.fp});
  await shot("third-person");

  /* ---------- the mouse turns it ---------- */
  await lock();
  const y0 = await page.evaluate(() => window.__life.P.yaw);
  // (under the lock each event is read as a movement from the corner: one move out, and left there)
  await page.mouse.move(180, 0, {steps: 6});
  await frames(page, 30);
  const S1 = await page.evaluate(() => window.__u21.state());
  res.turn = {y0, y1: S1.yaw, dyaw: S1.dyaw, back: S1.back};
  check(Math.abs(S1.yaw - y0) > .05 && Math.abs(S1.dyaw) < .2 && S1.back > 2.6, "the mouse (real movement) turns the view: the camera stays behind you, facing where you aim", res.turn);

  /* ---------- the kick selector, the meter, the shot ---------- */
  await freeze(page);
  await page.evaluate(() => { window.__trainRun.restart(); window.__u21.look(-Math.PI/2, -.08); });
  await step(30);
  const lit = () => page.evaluate(() => (document.querySelector("#fpHud .fp-kick li.on") || {}).textContent || null);
  const K = {start: await lit(), seq: []};
  for (const dy of [120, -120, -120]){ await page.mouse.wheel(0, dy); await step(2); K.seq.push(await lit()); }
  res.kick = K;
  check(K.seq.length === 3 && [K.start].concat(K.seq).every(x => x === null), "no kick selector (U28 part E): the wheel (real) shows and changes no kick type in third person", K);
  await pressReal(page, "2"); await step(2);
  const ev0 = await page.evaluate(() => window.__u21.ms().events.length);
  await page.mouse.down(); await step(10);
  const M1 = await page.evaluate(() => { const C = window.__u21.C.CTRL, e = document.querySelector("#fpHud .fp-meter"), b = e ? e.getBoundingClientRect() : null; return {on: C.meter.on, p: C.meter.p, op: e ? +getComputedStyle(e).opacity : 0, w: b ? b.width : 0, inView: !!b && b.top > 0 && b.bottom < innerHeight}; });
  await unfreeze(page); await frames(page, 4); await shot("meter"); await freeze(page);
  await step(10); await page.mouse.up(); await step(40);
  const k1 = await page.evaluate(ev0 => window.__u21.kickEv(ev0)[0] || null, ev0);
  const aimNow = await page.evaluate(() => { const P = window.__life.P, ms = window.__u21.ms(), me = ms.agents[ms.me]; return {yaw: P.yaw}; });
  res.meter = {M1, kick: k1 ? {intent: k1.intent, speed: k1.speed, tu: k1.tu, tw: k1.tw, x: k1.x, z: k1.z, tx: k1.tx, tz: k1.tz} : null, aimNow};
  check(M1.on && M1.p > 0 && M1.op > .5 && M1.w > 20 && M1.inView, "the shot meter fills on screen while LMB is held (real) in third person", M1);
  const dirOk = k1 && k1.tx != null ? Math.abs(Math.atan2(Math.sin(Math.atan2(-(k1.tx - k1.x), -(k1.tz - k1.z)) - aimNow.yaw), Math.cos(Math.atan2(-(k1.tx - k1.x), -(k1.tz - k1.z)) - aimNow.yaw))) < .35 : false;
  check(!!k1 && k1.intent === "shot" && dirOk, "letting go strikes the shot, along where you aim (the aim is the same as in first person)", res.meter.kick);

  /* ---------- the pass assist ---------- */
  await page.evaluate(() => window.__u21.start({mates: [[7, -9]]}));
  await ready(); await step(30);
  const aim = await page.evaluate(() => { const ms = window.__u21.ms(), me = ms.agents[ms.me], o = ms.agents.find(a => a.team === me.team && a !== me && !a.isGK);
    const d = Math.hypot(o.m.x - me.m.x, o.m.z - me.m.z), C = window.__u21.C, base = d < C.CN.CONE_NEAR_D ? C.CN.CONE_NEAR : C.CN.CONE, a = .85*base*(1 + C.METER.CONE_A);
    window.__u21.look(Math.atan2(-(o.m.x - me.m.x), -(o.m.z - me.m.z)) + a, -.15); return {mate: o.id, off: a*180/Math.PI, outside: Math.abs(a) > base + C.CN.HYST}; });
  await step(1);
  const ev1 = await page.evaluate(() => window.__u21.ms().events.length);
  await page.mouse.down({button: "right"}); await step(4); await page.mouse.up({button: "right"});
  await step(30);
  const pk = await page.evaluate(ev1 => window.__u21.kickEv(ev1)[0] || null, ev1);
  res.pass = {aim, recv: pk ? pk.recv : null, intent: pk ? pk.intent : null, tp: await page.evaluate(() => window.__u21.M.MC.tp.on)};
  check(aim.outside && pk && pk.recv === aim.mate && res.pass.tp, "the pass assist: an RMB tap (real) well off a team-mate goes to him, in third person", res.pass);

  /* ---------- never through the fence ---------- */
  const edge = await page.evaluate(() => { const T = window.__u21.T(), sp = T.spec; return {hx: sp.hx, run: sp.runoff ? sp.runoff.hx : sp.hx + 2}; });
  await page.evaluate(e => window.__u21.start({meX: -e.run + .9, yaw: -Math.PI/2, mates: [[8, -10]]}), edge);
  await ready(); await unfreeze(page);
  await page.evaluate(() => window.__u21.look(-Math.PI/2, -.1)); await frames(page, 60);
  const S2 = await page.evaluate(() => window.__u21.state());
  res.fence = {S2: {cam: S2.cam, back: S2.back, pulled: S2.pulled}, edge};
  // (the fence stands at the run-off's edge; the camera keeps TP.MARGIN off whatever it hits)
  check(S2.pulled && S2.cam.x > -edge.run - .3 && S2.back < 3.5, "with your back to the fence the camera is pulled in and stays inside it", res.fence);
  await shot("fence");

  /* ---------- the setting: first person, and back ---------- */
  await page.evaluate(() => window.__u21.start({}));
  await ready(); await frames(page, 60);
  await page.evaluate(() => window.fpSet("footCam", "first"));
  const W3 = await watch(75);
  const S3 = await page.evaluate(() => window.__u21.state());
  const row = await page.evaluate(() => (window.fpSettingsHTML() || "").includes("Football camera"));
  await page.evaluate(() => window.fpSet("footCam", "third"));
  const W4 = await watch(75);
  const S4 = await page.evaluate(() => window.__u21.state());
  res.setting = {W3, S3: {tpK: S3.tpK, fp: S3.fp, whole: S3.whole}, W4, S4: {tpK: S4.tpK}, row};
  check(row, "the settings have Football camera (Third person / First person)", row);
  check(S3.tpK === 0 && S3.fp && !S3.whole && W3.maxSpeed < 10, "Football camera = First person: your eyes again, eased (no cut), your first-person body under them", res.setting);
  check(S4.tpK === 1 && W4.maxSpeed < 10, "Third person again: eased back behind you", {tpK: S4.tpK, W4});

  /* ---------- Training's cage (U29): it follows the Football camera setting, the ball at your feet or not ---------- */
  await page.evaluate(() => window.__trainRun.stopScenario("hub"));
  await page.evaluate(() => { if (window.__trainHub.hubOpen()) window.__trainHub.closeHub(); });
  await frames(page, 60);
  const L0 = await page.evaluate(() => ({camT: window.__u21.ST.ME.camT, tp: window.__u21.ST.ME.tpShown, ball: !!window.__u21.ST.ME.footBall}));
  await page.evaluate(() => { const ME = window.__u21.ST.ME; ME.footBallT = 99; ME.footBallTest = true; });
  // (hand.js works ME.footBall out every step from your hands and the live balls by you; a ball laid at your feet)
  const placed = await page.evaluate(async () => {
    const H = await import("/js/life/core/hand.js"), P = window.__life.P, L = H.balls();
    return {balls: L.length};
  });
  await page.evaluate(() => { const ME = window.__u21.ST.ME; Object.defineProperty(ME, "footBall", {configurable: true, get(){ return true; }, set(v){} }); });
  await frames(page, 60);
  const L1 = await page.evaluate(() => ({camT: window.__u21.ST.ME.camT, tp: window.__u21.ST.ME.tpShown}));
  await page.evaluate(() => { const ME = window.__u21.ST.ME; delete ME.footBall; ME.footBall = false; ME.footBallT = 0; });
  await frames(page, 60);
  const L2 = await page.evaluate(() => ({camT: window.__u21.ST.ME.camT, tp: window.__u21.ST.ME.tpShown}));
  await page.evaluate(() => window.__u21.C.saveSet({footCam: "first"}));
  await frames(page, 60);
  const L3 = await page.evaluate(() => ({camT: window.__u21.ST.ME.camT, tp: window.__u21.ST.ME.tpShown}));
  await page.evaluate(() => window.__u21.C.saveSet({footCam: "third"}));
  await frames(page, 30);
  res.life = {L0, L1, L2, L3, placed};
  check(L0.camT === 1 && L0.tp, "Training's cage is behind you (Football camera Third person), the ball or not", L0);
  check(L1.camT === 1 && L1.tp, "with the ball (hand.js ME.footBall) still behind you", L1);
  check(L2.camT === 1 && L2.tp, "and still behind you once you no longer have it", L2);
  check(L3.camT === 0 && !L3.tp, "Football camera First person: the cage through your eyes", L3);
} catch(e){ check(false, "ran", String(e && e.stack || e)); }
res.pageErrors = page.errors.slice(0, 5);
check(!page.errors.length, "zero console and page errors", page.errors.slice(0, 5));
await page.evaluate(() => { try { window.__u21 && window.__u21.C.saveSet({footCam: "third"}); } catch(e){} }).catch(() => {});
await t.close();
fs.writeFileSync(path.join(OUT, "u21-camera.json"), JSON.stringify(res, null, 1));
console.log(`u21-camera: ${res.errors.length ? res.errors.length + " failed" : "all checks pass"}`);
process.exit(res.errors.length ? 1 : 0);
