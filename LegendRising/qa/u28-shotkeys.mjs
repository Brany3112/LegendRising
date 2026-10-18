// qa/u28-shotkeys.mjs: U28 part E (as reworked) with real input (the left button held and let go, W A S D on the
// keyboard, the pointer locked by a real click), in third person
//   - A held as a shot is let go sends it out to the left and bends it back to the right (the ball's spin, and its
//     flight bowing out on the left), D out to the right and back; a capital A the same as a small one; W with it, less
//     curl and more power; a right foot strikes it with its outside for A, its inside for D (as in the real game), and
//     the drawn foot meets the ball
//   - S pressed while the shot is held: the shot is called off (the meter goes, letting go strikes nothing), a fake; a
//     key pressed just after it plays the ball: D drags it back to the right, W pushes it on; none, nothing more
//   - the shooting guide in the settings card, its picture loading; no reticle on the screen, no console or page error
//
//   node qa/u28-shotkeys.mjs          exits 1 on any failed check; writes qa/out/u28-shotkeys.json
import fs from "node:fs";
import path from "node:path";
import {OUT} from "./lib.mjs";
import {trainLaunch, enterByButton, closeHubReal, lockPointer, frames} from "./tr4b-lib.mjs";

const res = {errors: []};
const check = (ok, what, got) => { if (!ok) res.errors.push(`${what}: ${JSON.stringify(got).slice(0, 1500)}`); console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok ? "" : ": " + JSON.stringify(got).slice(0, 900)}`); };

const t = await trainLaunch({seed: 6, gfx: "medium"});
const page = t.page;
try {
  await enterByButton(page);
  await closeHubReal(page);
  await page.evaluate(async () => {
    const R = window.__trainRun, C = await import("/js/life/football/control.js");
    const build = (cfg, env) => {
      const hx = env.spec.hx, me = {slot: "ST", x: -hx + 20, z: 0, yaw: -Math.PI/2};
      return {myTeam: 0, role: "Attacker", seed: 11, laws: {out: "rebound"}, me, mates: [], opps: [], keeper: null, ball: {x: me.x + .4, y: .11, z: 0, free: true}};
    };
    if (!R.scenario("qa-u28s")) R.registerScenario({id: "qa-u28s", category: "attacking", type: "qau28s", name: "Shot test", desc: "A test scenario", build});
    C.saveSet({footCam: "third"});
    window.__u28s = {C, start: () => { if (R.RUN.cur) R.stopScenario("hub"); if (window.__trainHub.hubOpen()) window.__trainHub.closeHub(); return R.startScenario("qa-u28s", {}); },
      T: () => window.__trainRun.RUN.cur.T};
  });
  const begin = async () => {
    await page.evaluate(() => window.__u28s.start());
    await page.waitForFunction(() => !!(window.__trainRun.RUN.cur && window.__trainRun.RUN.cur.T && window.__trainRun.RUN.cur.T.V), null, {timeout: 60000});
    await frames(page, 40);
    await page.evaluate(() => { const P = window.__life.P; P.yaw = -Math.PI/2; P.pitch = -.15; });
    await frames(page, 10);
  };
  await begin();
  const id = await lockPointer(page); if (!id) throw new Error("the pointer could not be locked");
  await frames(page, 10);
  const state = () => page.evaluate(() => { const T = window.__u28s.T(), ms = T.ms, me = T.me, C = window.__u28s.C.CTRL, kick = ms.events.filter(e => e.kind === "kick" && e.agent === me.id).pop(), fake = ms.events.filter(e => e.kind === "fake" && e.agent === me.id).pop();
    const f = {x: -Math.sin(me.m.yaw), z: -Math.cos(me.m.yaw)}, dx = ms.ball.p.x - me.m.x, dz = ms.ball.p.z - me.m.z;
    return {kick: !!kick, fake: !!fake, touches: ms.events.filter(e => e.kind === "touch" && e.fake).map(e => e.fake), bend: C.lastRq ? C.lastRq.bend : null, power: kick ? kick.speed : null, part: C.lastRq ? C.lastRq.footPart : null, clip: (() => { const R0 = T.V && T.V.rec && T.V.rec[me.id]; return R0 && R0.clip ? R0.clip.kind : null; })(),
      foot: me.foot || "R", wy: Math.round(ms.ball.w.y*10)/10, shape: C.shape, last: C.last, charge: C.charge ? C.charge.kind : null, meter: !!C.meter.on, mine: ms.poss.ctl === me.id,
      side: Math.round((dx*-f.z + dz*f.x)*100)/100, fwd: Math.round((dx*f.x + dz*f.z)*100)/100}; });
  // hold the shot, the key down just before letting go, then what the game made of it
  // (the shot held to 0.6 s of game time, short of full: the headless browser runs several steps a frame, and a count of
  // frames held it past full, over-hit and scuffed, its aim's error then hiding the curl. The striker's Curve 99)
  const holdShot = async () => { await page.mouse.down(); for (let i = 0; i < 200 && await page.evaluate(() => window.__u28s.C.CTRL.lmbT < .6); i++) await frames(page, 1); };
  const prep = () => page.evaluate(() => { const T = window.__u28s.T(); T.ms.poss.ctl = T.me.id; Object.assign(T.me.at, {curve: 99, accuracy: 90, composure: 90}); });
  const release = async key => {
    await begin();
    await prep();
    await holdShot();
    await page.keyboard.down(key);
    await frames(page, 3); await page.mouse.up(); await frames(page, 2);
    await page.keyboard.up(key);
    await frames(page, 30);
    return state();
  };
  // the drawn foot's nearest to the ball through each strike clip (the ball where it was struck: the drawn ball's last
  // place while it was still at rest), and the clip's kind. (Read at the clip's contact event alone it is the follow-
  // through's: the headless browser draws a frame for up to four steps, and the event comes a frame or two late)
  await page.evaluate(async () => {
    const HM = await import("/js/life/human.js"), B = HM.BONE;
    const v1 = new (window.__life.cam.position.constructor)(), rest = v1.clone(), raf = window.__qa.realRAF;
    window.__u28s.contact = []; let cur = null;
    const f = () => { const T = window.__u28s.T(); if (T && T.V){ const me = T.me, R = T.V.rec[me.id], bv = T.ms.ball.v;
      if (T.V.ball && T.V.ball.mesh && Math.hypot(bv.x, bv.y, bv.z) < 1) T.V.ball.mesh.getWorldPosition(rest);
      const on = R && R.h && R.clip && R.clip.mode === "strike" && T.V.ball && T.V.ball.mesh;
      if (cur && (!on || R.clip.id !== cur.id)){ window.__u28s.contact.push({kind: cur.kind, d: Math.round(cur.d*100)/100}); cur = null; }
      if (on){ if (!cur) cur = {id: R.clip.id, kind: R.clip.part || R.clip.kind, d: 9};
        for (const p of [B.toL, B.ftL, B.toR, B.ftR]){ R.h.bones[p].getWorldPosition(v1); cur.d = Math.min(cur.d, v1.distanceTo(rest) - .11); } } } raf(f); };
    raf(f);
  });
  // the ball's flight after each kick (the simulation's ball, every real frame, a new drill starting it afresh): how far
  // out from the line to the shot's target it goes in its first 16 m, + to the right
  await page.evaluate(() => {
    const raf = window.__qa.realRAF; window.__u28s.path = []; let ms0 = null;
    const f = () => { const T = window.__u28s.T(); if (T && T.ms){ if (T.ms !== ms0){ ms0 = T.ms; window.__u28s.path = []; }
      const me = T.me, kicked = T.ms.events.some(e => e.kind === "kick" && e.agent === me.id);
      if (kicked) window.__u28s.path.push({x: T.ms.ball.p.x, z: T.ms.ball.p.z}); } raf(f); };
    raf(f);
  });
  const outOf = (path, tg) => { if (path.length < 3 || !tg) return null; const p0 = path[0], lx = tg.x - p0.x, lz = tg.z - p0.z, l = Math.hypot(lx, lz) || 1, ux = lx/l, uz = lz/l; let out = 0;
    for (const q of path){ if (Math.hypot(q.x - p0.x, q.z - p0.z) > 16) break; const d = (q.x - p0.x)*-uz + (q.z - p0.z)*ux; if (Math.abs(d) > Math.abs(out)) out = d; } return Math.round(out*100)/100; };
  const flight = async key => { const r = await release(key); const got = await page.evaluate(() => ({path: window.__u28s.path.slice(), tg: window.__u28s.C.CTRL.lastRq && window.__u28s.C.CTRL.lastRq.target}));
    r.out = outOf(got.path, got.tg); return r; };
  const A = await flight("a"), D = await flight("d"), AC = await flight("A");
  const releaseTwo = async keys => {
    await begin();
    await prep();
    await holdShot();
    for (const k of keys) await page.keyboard.down(k);
    await frames(page, 3); await page.mouse.up(); await frames(page, 2);
    for (const k of keys) await page.keyboard.up(k);
    await frames(page, 30);
    return state();
  };
  const WA = await releaseTwo(["w", "a"]), WD = await releaseTwo(["w", "d"]), N = await release("q");
  const contact = await page.evaluate(() => window.__u28s.contact);
  res.contact = contact;
  // (the curled strikes: A, D, a capital A, then W+A and W+D, W pressed with the curl from a stand)
  const curled = contact.filter(c => c.kind !== "instep");
  check(curled.map(c => c.kind).join() === "outside,inside,outside,outside,inside" && curled.every(c => c.d <= .15), "a right foot strikes A (and W+A) with its outside, D (and W+D) with its inside (as in the real game), and the drawn foot comes to the ball (within 0.15 m)", contact);
  res.keys = {A, D, AC};
  check(A.kick && D.kick && /curl/.test(A.shape || "") && /curl/.test(D.shape || "") && A.bend > 0 && D.bend < 0 && Math.sign(A.wy) !== Math.sign(D.wy) && A.wy !== 0, "a shot let go with A held bends to the right, with D to the left (the ball's spin)", {A, D});
  check(A.out < -.3 && D.out > .3, "its flight: with A it goes out to the left of the line to the target and comes back, with D out to the right and back", {A: A.out, D: D.out});
  check(AC.kick && AC.bend > 0 && AC.wy === A.wy && AC.out < -.3, "a capital A curls it the same as a small one", {A: A.wy, AC});
  check(WA.kick && WD.kick && WA.bend > 0 && WD.bend < 0 && Math.abs(WA.bend) < Math.abs(A.bend) && Math.abs(WD.bend) < Math.abs(D.bend) && WA.power > A.power && WD.power > D.power,
    "W+A and W+D: the same way, half the curl and more power (the ball's launch speed)", {A: {bend: A.bend, v: A.power}, WA: {bend: WA.bend, v: WA.power}, D: {bend: D.bend, v: D.power}, WD: {bend: WD.bend, v: WD.power}});
  check(Math.abs(WA.power - N.power) < .06*N.power && Math.abs(WD.power - N.power) < .06*N.power, "W+A and W+D go about as hard as a straight shot (within 6%)", {straight: N.power, WA: WA.power, WD: WD.power});
  const out = A.foot === "L" ? "inside" : "outside", ins = A.foot === "L" ? "outside" : "inside";
  check(A.part === out && D.part === ins, `the ${A.foot === "L" ? "left" : "right"} foot strikes it with its ${out} for A, its ${ins} for D`, {A: A.part, D: D.part});
  // the fake: S while the shot is held, then (or not) a key just after it, then the button let go
  const fakeWith = async key => {
    await begin();
    await page.evaluate(() => { const T = window.__u28s.T(); T.ms.poss.ctl = T.me.id; });
    await page.mouse.down(); await frames(page, 20);
    const held = await state();
    await page.keyboard.press("s"); await frames(page, 4);
    const after = await state();
    if (key){ await page.keyboard.press(key); }
    await frames(page, 6); await page.mouse.up(); await frames(page, 40);
    return {held, after, end: await state()};
  };
  const F0 = await fakeWith(null), FD = await fakeWith("d"), FW = await fakeWith("w");
  res.fake = {F0, FD, FW};
  check(F0.held.charge === "shot" && F0.after.charge === null && !F0.after.meter && F0.end.fake && !F0.end.kick && F0.end.mine && !F0.end.touches.length,
    "S while the shot is held: the shot is called off and the bar goes, a fake, no kick when the button is let go, the ball still yours", F0);
  check(FD.end.fake && !FD.end.kick && FD.end.touches.join() === "drag right" && FD.end.side > .2 && FD.end.mine, "S, then D: the ball dragged back to the right", FD.end);
  check(FW.end.fake && !FW.end.kick && FW.end.touches.join() === "push" && FW.end.mine, "S, then W: the ball pushed on a little", FW.end);
  // the shooting guide in the settings card (the pause card's and the Settings sheet's): opened, its picture loads
  const guide = await page.evaluate(async () => { const h = window.fpSettingsHTML ? window.fpSettingsHTML() : "", d = document.createElement("div"); d.innerHTML = h; document.body.appendChild(d);
    const det = d.querySelector(".fp-guide"), img = d.querySelector(".fp-guide img"); if (det) det.open = true; if (img) await img.decode().catch(() => {});
    const r = {has: !!det, sum: det ? det.querySelector("summary").textContent : null, w: img ? img.naturalWidth : 0, shown: img ? Math.round(img.getBoundingClientRect().width) : 0}; d.remove(); return r; });
  check(guide.has && guide.w === 1360 && guide.shown > 200, "the settings card has the shooting guide; opened, its picture loads and shows", guide);
  const ret = await page.evaluate(() => !!document.querySelector("#fpHud .fp-ret"));
  check(!ret, "no reticle on the screen", ret);
  check(!t.errors.length, "no console or page error", t.errors.slice(0, 5));
} finally { await t.close(); }
fs.writeFileSync(path.join(OUT, "u28-shotkeys.json"), JSON.stringify(res, null, 1));
console.log(res.errors.length ? `u28-shotkeys: ${res.errors.length} failed` : "u28-shotkeys: all checks pass");
process.exit(res.errors.length ? 1 : 0);
