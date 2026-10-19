// qa/u26-feel.mjs: USER-ISSUES U26 in the real game with real input (the keyboard held and tapped, the pointer locked by
// a real click), in third person:
//   - F held with W, D and S in turn (forward, sideways, backwards, 2 s each): the ball stays within KEEP_MAX m of you
//     and stays yours
//   - Shift tapped twice with W held: the ball is knocked on, at least 3 m ahead of you
//   - contact sheets for the eye (qa/out/u26/*.png): a run across the facing (D held at a jog), a jump (Space with no
//     ball near), a strike at nothing (LMB with the ball far away)
//   - no console or page error
//
//   node qa/u26-feel.mjs          exits 1 on any failed check; writes qa/out/u26-feel.json and qa/out/u26/*.png
import fs from "node:fs";
import path from "node:path";
import {OUT, freeze, unfreeze} from "./lib.mjs";
import {trainLaunch, enterByButton, closeHubReal, lockPointer, frames} from "./tr4b-lib.mjs";

const DIR = path.join(OUT, "u26");
fs.mkdirSync(DIR, {recursive: true});
const KEEP_MAX = 1.0;
const res = {errors: []};
const check = (ok, what, got) => { if (!ok) res.errors.push(`${what}: ${JSON.stringify(got).slice(0, 1500)}`); console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok ? "" : ": " + JSON.stringify(got).slice(0, 900)}`); };

const t = await trainLaunch({seed: 6, gfx: "medium"});
const page = t.page;
try {
  await enterByButton(page);
  await closeHubReal(page);
  await page.evaluate(async () => {
    const R = window.__trainRun, C = await import("/js/life/football/control.js");
    // you on the ball in open space, nobody near
    const build = (cfg, env) => {
      const hx = env.spec.hx, me = {slot: "ST", x: -hx + 25, z: 0, yaw: -Math.PI/2};
      return {myTeam: 0, role: "Attacker", seed: 11, laws: {out: "rebound"}, me, mates: [], opps: [], keeper: null, ball: {x: me.x + .4, y: .11, z: 0, free: true}};
    };
    if (!R.scenario("qa-u26")) R.registerScenario({id: "qa-u26", category: "attacking", type: "qau26", name: "Feel test", desc: "A test scenario", build});
    C.saveSet({footCam: "third"});
    window.__u26 = {start: () => { if (R.RUN.cur) R.stopScenario("hub"); if (window.__trainHub.hubOpen()) window.__trainHub.closeHub(); return R.startScenario("qa-u26", {}); },
      T: () => window.__trainRun.RUN.cur.T,
      st: () => { const T = window.__trainRun.RUN.cur.T, ms = T.ms, me = T.me; return {d: Math.hypot(ms.ball.p.x - me.m.x, ms.ball.p.z - me.m.z), mine: ms.poss.ctl === me.id, v: me.m.speed}; }};
  });
  const begin = async () => {
    await page.evaluate(() => window.__u26.start());
    await page.waitForFunction(() => !!(window.__trainRun.RUN.cur && window.__trainRun.RUN.cur.T && window.__trainRun.RUN.cur.T.V), null, {timeout: 60000});
    await frames(page, 40);
    await page.evaluate(() => { const P = window.__life.P; P.yaw = -Math.PI/2; P.pitch = -.2; });
    await frames(page, 5);
  };
  await begin();
  const id = await lockPointer(page); if (!id) throw new Error("the pointer could not be locked");
  // F held with each way in turn: the ball's distance every frame
  const hold = async (key, secs) => {
    await page.keyboard.down(key);
    const out = await page.evaluate(n => new Promise(done => { const raf = window.__qa.realRAF; let k = 0, worst = 0, lost = 0; const f = () => { const s = window.__u26.st(); if (k > 20){ worst = Math.max(worst, s.d); if (!s.mine) lost++; } if (++k >= n) done({worst: Math.round(worst*100)/100, lost}); else raf(f); }; raf(f); }), Math.round(secs*60));
    await page.keyboard.up(key);
    return out;
  };
  await page.keyboard.down("f");
  const keep = {forward: await hold("w", 2), sideways: await hold("d", 2), backwards: await hold("s", 2)};
  await page.keyboard.up("f");
  res.keep = keep;
  for (const [k, r] of Object.entries(keep)) check(r.worst <= KEEP_MAX && r.lost === 0, `F held, ${k}: the ball within ${KEEP_MAX} m of you and yours`, r);
  // the knock-on: W held, Shift tapped twice
  await begin();
  await page.keyboard.down("w"); await frames(page, 30);
  // (the two real presses back to back with the game's loop held between them, unfrozen at once: a double tap must
  // come within control.js KNOCK_TAP, 0.3 s of real time, and on a loaded machine the page drew a frame in 1 to 4 s,
  // the second press waiting behind it, 3 to 14 s after the first as the page saw them)
  await freeze(page);
  await page.keyboard.press("Shift"); await page.keyboard.press("Shift");
  await unfreeze(page);
  await page.keyboard.down("Shift");
  // (the most it gets ahead of you over the next 45 frames, along the way you face)
  const kn = await page.evaluate(n => new Promise(done => { const raf = window.__qa.realRAF; let k = 0, best = -99; const f = () => { const T = window.__u26.T(), ms = T.ms, me = T.me, d = {x: -Math.sin(me.m.yaw), z: -Math.cos(me.m.yaw)}; best = Math.max(best, (ms.ball.p.x - me.m.x)*d.x + (ms.ball.p.z - me.m.z)*d.z); if (++k >= n) done({ahead: Math.round(best*100)/100, knocks: ms.events.filter(e => e.kind === "touch" && e.knock).length}); else raf(f); }; raf(f); }), 45);
  await page.keyboard.up("Shift"); await page.keyboard.up("w");
  res.knock = kn;
  check(kn.knocks === 1 && kn.ahead >= 3, "Shift tapped twice with W held: the ball knocked on, at least 3 m ahead of you", kn);
  // contact sheets: a run across the facing, a jump, a strike at nothing
  const sheet = async (name, act) => {
    await begin();
    await act();
    // ((BCS) up to 2 minutes a picture: on a loaded machine a frame took 1 to 4 s and the default 30 s could run out)
    for (let i = 0; i < 6; i++){ await frames(page, 6); await page.screenshot({path: path.join(DIR, `${name}-${i}.png`), clip: {x: 470, y: 400, width: 340, height: 320}, timeout: 120000}); }
    await page.keyboard.up("d"); await page.keyboard.up("w");
  };
  await sheet("across", async () => { await page.keyboard.down("d"); await frames(page, 30); });
  await sheet("jump", async () => { await page.evaluate(() => { const T = window.__u26.T(); T.ms.ball.p.x += 15; }); await page.keyboard.down("w"); await frames(page, 20); await page.keyboard.press("Space"); });
  await sheet("air-kick", async () => { await page.evaluate(() => { const T = window.__u26.T(); T.ms.ball.p.x += 15; }); await page.mouse.down(); await frames(page, 15); await page.mouse.up(); });
  check(!t.errors.length, "no console or page error", t.errors.slice(0, 5));
} finally { await t.close(); }
fs.writeFileSync(path.join(OUT, "u26-feel.json"), JSON.stringify(res, null, 1));
console.log(res.errors.length ? `u26-feel: ${res.errors.length} failed` : "u26-feel: all checks pass");
process.exit(res.errors.length ? 1 : 0);
