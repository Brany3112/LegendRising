// qa/u28-shotkeys.mjs: U28 part E with real input (the left button held and let go, A, D and S on the keyboard, the
// pointer locked by a real click), in third person: the keys held as a shot is let go shape it
//   - A curls it one way, D the other (the ball's spin about the vertical)
//   - S: a fake, no kick; S+D: a fake and a drag-back to the right
//   - no console or page error
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
  // hold the shot, the key(s) down just before letting go, then what the game made of it
  const release = async keys => {
    await begin();
    await page.evaluate(() => { const T = window.__u28s.T(); T.ms.poss.ctl = T.me.id; });
    await page.mouse.down(); await frames(page, 25);
    for (const k of keys) await page.keyboard.down(k);
    await frames(page, 3); await page.mouse.up(); await frames(page, 2);
    for (const k of keys) await page.keyboard.up(k);
    await frames(page, 30);
    return page.evaluate(() => { const T = window.__u28s.T(), ms = T.ms, me = T.me, kick = ms.events.filter(e => e.kind === "kick" && e.agent === me.id).pop(), fake = ms.events.filter(e => e.kind === "fake" && e.agent === me.id).pop();
      return {kick: !!kick, fake: fake ? {drag: fake.drag, nudge: fake.nudge} : null, bend: me.lastRq ? me.lastRq.bend : null, wy: Math.round(ms.ball.w.y*10)/10, shape: window.__u28s.C.CTRL.shape, last: window.__u28s.C.CTRL.last}; });
  };
  const A = await release(["a"]), D = await release(["d"]), S = await release(["s"]), SD = await release(["s", "d"]);
  res.keys = {A, D, S, SD};
  check(A.kick && D.kick && /curl/.test(A.shape || "") && /curl/.test(D.shape || "") && Math.sign(A.wy) !== Math.sign(D.wy) && A.wy !== 0, "a shot let go with A held curls one way, with D the other (the ball's spin)", {A, D});
  check(!S.kick && S.fake && S.fake.drag === 0, "let go with S held: a fake, no kick", S);
  check(!SD.kick && SD.fake && SD.fake.drag === 1, "let go with S and D held: a fake and a drag-back to the right", SD);
  check(!t.errors.length, "no console or page error", t.errors.slice(0, 5));
} finally { await t.close(); }
fs.writeFileSync(path.join(OUT, "u28-shotkeys.json"), JSON.stringify(res, null, 1));
console.log(res.errors.length ? `u28-shotkeys: ${res.errors.length} failed` : "u28-shotkeys: all checks pass");
process.exit(res.errors.length ? 1 : 0);
