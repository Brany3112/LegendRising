// qa/u28-flickfeel.mjs: U28 part G with real input (the wheel's button held and let go, W A S D, the pointer locked by
// a real click), in third person:
//   - W a chip on, S a rainbow back over your head, D a flick to the right, no key a keepy-up
//   - the middle button scrolls nothing
//   - a flick from close control ends it; run to the ball and it is in close control again, no key (BCS: automatic)
//   - at the frame of each flick the drawn foot is at the drawn ball; contact sheets in qa/out/u28flick
//   - no console or page error
//
//   node qa/u28-flickfeel.mjs          exits 1 on any failed check; writes qa/out/u28-flickfeel.json
import fs from "node:fs";
import path from "node:path";
import {OUT} from "./lib.mjs";
import {trainLaunch, enterByButton, closeHubReal, lockPointer, frames} from "./tr4b-lib.mjs";
const DIR = path.join(OUT, "u28flick");
fs.mkdirSync(DIR, {recursive: true});

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
    if (!R.scenario("qa-u28f")) R.registerScenario({id: "qa-u28f", category: "attacking", type: "qau28f", name: "Flick test", desc: "A test scenario", build});
    C.saveSet({footCam: "third"});
    window.__u28f = {C, start: () => { if (R.RUN.cur) R.stopScenario("hub"); if (window.__trainHub.hubOpen()) window.__trainHub.closeHub(); return R.startScenario("qa-u28f", {}); },
      T: () => window.__trainRun.RUN.cur.T};
  });
  const begin = async () => {
    await page.evaluate(() => window.__u28f.start());
    await page.waitForFunction(() => !!(window.__trainRun.RUN.cur && window.__trainRun.RUN.cur.T && window.__trainRun.RUN.cur.T.V), null, {timeout: 60000});
    await frames(page, 40);
    await page.evaluate(() => { const P = window.__life.P; P.yaw = -Math.PI/2; P.pitch = -.15; });
    await frames(page, 10);
  };
  await begin();
  const id = await lockPointer(page); if (!id) throw new Error("the pointer could not be locked");
  await frames(page, 10);
  // the drawn foot nearest the drawn ball, every frame, kept for the frame the flick's touch is made in
  await page.evaluate(async () => {
    const HM = await import("/js/life/human.js"), B = HM.BONE; window.__u28f.watchOn = true;
    const v1 = new (window.__life.cam.position.constructor)(), v2 = v1.clone();
    const raf = window.__qa.realRAF;
    const f = () => { if (window.__u28f.watchOn){ const T = window.__u28f.T(); if (T && T.V){ const me = T.me, R = T.V.rec[me.id], ms = T.ms;
      const ev = ms.events.filter(e => e.kind === "touch" && e.how === "flick" && e.agent === me.id).length;
      if (R && R.h && T.V.ball && T.V.ball.mesh && me.act && me.act.kind === "flick" && R.h.ev && (R.h.ev.mask & HM.EV.CONTACT) && window.__u28f.lastC !== R.h.ev.t){ window.__u28f.lastC = R.h.ev.t; T.V.ball.mesh.getWorldPosition(v2); let best = 9; for (const p of [B.toL, B.ftL, B.toR, B.ftR]){ R.h.bones[p].getWorldPosition(v1); best = Math.min(best, v1.distanceTo(v2) - .11); } (window.__u28f.contact || (window.__u28f.contact = [])).push(Math.round(best*100)/100); } } } raf(f); };
    raf(f);
  });
  const doFlick = async (name, keys, hold = 25) => {
    await begin();
    await page.evaluate(() => { const T = window.__u28f.T(); T.ms.poss.ctl = T.me.id; window.__u28f.evSeen = 0; });
    await page.mouse.down({button: "middle"}); await frames(page, hold);
    for (const k of keys) await page.keyboard.down(k);
    await frames(page, 3); await page.mouse.up({button: "middle"});
    for (let i = 0; i < 6; i++){ await frames(page, 4); await page.screenshot({path: path.join(DIR, `${name}-${i}.png`), clip: {x: 440, y: 260, width: 400, height: 460}}); }
    for (const k of keys) await page.keyboard.up(k);
    return page.evaluate(() => { const T = window.__u28f.T(), ms = T.ms, me = T.me, e = ms.events.filter(x => x.kind === "touch" && x.how === "flick" && x.agent === me.id).pop(), f = {x: -Math.sin(me.m.yaw), z: -Math.cos(me.m.yaw)};
      return {flick: e ? e.flick : null, part: e ? e.part : null, along: e ? Math.round((e.dx*f.x + e.dz*f.z)*100)/100 : null, across: e ? Math.round((e.dx*-f.z + e.dz*f.x)*100)/100 : null, y: Math.round(ms.ball.p.y*100)/100, scrollY: window.scrollY}; });
  };
  const chip = await doFlick("chip", ["w"]), rainbow = await doFlick("rainbow", ["s"]), right = await doFlick("side", ["d"]), keepy = await doFlick("keepy", []);
  res.flicks = {chip, rainbow, right, keepy};
  check(chip.flick === "chip" && chip.along > .8 && rainbow.flick === "rainbow" && rainbow.along < -.8 && right.across > .8 && keepy.flick === "keepy",
    "the wheel's button held and let go: W a chip on, S a rainbow back over your head, D a flick to the right, no key a keepy-up", res.flicks);
  check([chip, rainbow, right, keepy].every(r => r.scrollY === 0), "the middle button scrolls nothing", [chip, rainbow, right, keepy].map(r => r.scrollY));
  // from close control: the flick ends it; run to the ball and it is yours again, no key ((BCS) close control is automatic)
  await begin();
  await page.keyboard.down("w"); await frames(page, 6); await frames(page, 20);
  const on0 = await page.evaluate(() => !!window.__u28f.T().me.ctlOn);
  await page.keyboard.up("w");
  await page.mouse.down({button: "middle"}); await frames(page, 8); await page.mouse.up({button: "middle"}); await frames(page, 10);
  const off = await page.evaluate(() => ({on: !!window.__u28f.T().me.ctlOn, end: window.__u28f.T().me.ctlEnd}));
  let again = false; const trail = [];
  // (as a player does: run to the ball; within reach and low it is taken into close control by itself, BCS)
  for (let i = 0; i < 80 && !again; i++){
    await frames(page, 3);
    const s0 = await page.evaluate(() => { const T = window.__u28f.T(), me = T.me, b = T.ms.ball; return {d: Math.hypot(b.p.x - me.m.x, b.p.z - me.m.z), on: !!me.ctlOn, y: b.p.y, yaw: Math.atan2(-(b.p.x - me.m.x), -(b.p.z - me.m.z))}; });
    if (i % 8 === 0) trail.push({d: Math.round(s0.d*100)/100, y: Math.round(s0.y*100)/100, on: s0.on});
    if (s0.on){ again = true; break; }
    if (s0.d < 1.1 && s0.y < .5){ await page.keyboard.up("w"); }
    else { await page.evaluate(y => { window.__life.P.yaw = y; }, s0.yaw); await page.keyboard.down("w"); }
  }
  await page.keyboard.up("w");
  res.ctl = {on0, off, again, trail};
  check(on0 && !off.on && off.end === "flick" && again, "a flick from close control ends it; run to the ball and it is in close control again, no key (BCS)", res.ctl);
  const contact = await page.evaluate(() => window.__u28f.contact || []);
  res.contact = contact;
  check(contact.length >= 4 && contact.filter(c => c <= .15).length >= Math.ceil(.75*contact.length), "at the frame of each flick the drawn foot is at the drawn ball (within 0.15 m, three in four)", contact);
  check(!t.errors.length, "no console or page error", t.errors.slice(0, 5));
} finally { await t.close(); }
fs.writeFileSync(path.join(OUT, "u28-flickfeel.json"), JSON.stringify(res, null, 1));
console.log(res.errors.length ? `u28-flickfeel: ${res.errors.length} failed` : "u28-flickfeel: all checks pass");
process.exit(res.errors.length ? 1 : 0);
