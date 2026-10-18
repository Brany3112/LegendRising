// qa/u28-move.mjs: U28 part B, the start and the ladder, in the real game with real input (W and Shift on the keyboard,
// the pointer locked by a real click), in third person. From standing, W pressed (the game's seconds: a headless frame
// can be slower than the 4 steps a frame the runner catches up with, so the page's clock runs ahead of the game's):
//   - your agent is moving (0.5 m/s) within 0.15 s, and the drawn body's first foot leaves the ground within 0.25 s
//   - you are at a jog within 0.75 s
//   - held on forward at a jog, it becomes a run (the control's ladder) and the run's speed is reached
//   - Shift: the full sprint
//   - no console or page error
//
//   node qa/u28-move.mjs          exits 1 on any failed check; writes qa/out/u28-move.json
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
      return {myTeam: 0, role: "Attacker", seed: 11, laws: {out: "rebound"}, me, mates: [], opps: [], keeper: null, ball: {x: me.x - 3, y: .11, z: 8, free: true}};
    };
    if (!R.scenario("qa-u28m")) R.registerScenario({id: "qa-u28m", category: "attacking", type: "qau28m", name: "Move test", desc: "A test scenario", build});
    C.saveSet({footCam: "third"});
    window.__u28 = {C, start: () => { if (R.RUN.cur) R.stopScenario("hub"); if (window.__trainHub.hubOpen()) window.__trainHub.closeHub(); return R.startScenario("qa-u28m", {}); },
      T: () => window.__trainRun.RUN.cur.T};
  });
  const begin = async () => {
    await page.evaluate(() => window.__u28.start());
    await page.waitForFunction(() => !!(window.__trainRun.RUN.cur && window.__trainRun.RUN.cur.T && window.__trainRun.RUN.cur.T.V), null, {timeout: 60000});
    await frames(page, 40);
    await page.evaluate(() => { const P = window.__life.P; P.yaw = -Math.PI/2; P.pitch = -.15; });
    await frames(page, 10);
  };
  await begin();
  const id = await lockPointer(page); if (!id) throw new Error("the pointer could not be locked");
  await frames(page, 10);
  // every real frame from the press: the agent's speed, the drawn body's feet, the control's gait
  const watch = page.evaluate(() => new Promise(done => {
    const raf = window.__qa.realRAF, t0 = window.__u28.T().ms.t, out = {move: -1, foot: -1, jog: -1, run: -1, runV: -1, gaits: []};
    const f = () => {
      const T = window.__u28.T(), me = T.me, R0 = T.V.rec[me.id], G = R0 && R0.h && R0.h.gait, dt = T.ms.t - t0;
      if (out.move < 0 && me.m.speed >= .5) out.move = dt;
      if (out.foot < 0 && G && G.feet.some(x => !x.down)) out.foot = dt;
      if (out.jog < 0 && me.m.speed >= .95*me.prm.jog) out.jog = dt;
      if (out.run < 0 && me.intent.gait === "run") out.run = dt;
      if (out.runV < 0 && me.m.speed >= .95*me.prm.run) out.runV = dt;
      if (dt > 3) done(out); else raf(f);
    };
    raf(f);
  }));
  await page.keyboard.down("w");
  const W = await watch;
  await page.keyboard.down("Shift"); await frames(page, 90);
  const S = await page.evaluate(() => { const T = window.__u28.T(), me = T.me; return {gait: me.intent.gait, v: Math.round(me.m.speed*100)/100, sprint: Math.round(me.prm.sprint*100)/100}; });
  await page.keyboard.up("Shift"); await page.keyboard.up("w");
  res.start = W; res.sprint = S;
  check(W.move >= 0 && W.move <= .15, "from standing, W: your agent is moving within 0.15 s", W);
  check(W.foot >= 0 && W.foot <= .25, "the drawn body's first foot leaves the ground within 0.25 s", W);
  check(W.jog >= 0 && W.jog <= .75, "at a jog within 0.75 s", W);
  check(W.run >= 0 && W.runV >= 0, "held on forward, the jog becomes a run and the run's speed is reached", W);
  check(S.gait === "sprint" && S.v > .9*S.sprint, "Shift: the full sprint", S);
  check(!t.errors.length, "no console or page error", t.errors.slice(0, 5));
} finally { await t.close(); }
fs.writeFileSync(path.join(OUT, "u28-move.json"), JSON.stringify(res, null, 1));
console.log(res.errors.length ? `u28-move: ${res.errors.length} failed` : "u28-move: all checks pass");
process.exit(res.errors.length ? 1 : 0);
