// qa/u27-feel.mjs: USER-ISSUES U27, close control in the real game with real input (the keyboard, the pointer locked by a
// real click), in third person. ((BCS) close control is automatic, no F: the checks moved to that on purpose)
//   - with the ball at your feet and W held it is in close control, no key; held Shift (a sprint) it stays within
//     KEEP_MAX m of you and yours
//   - Shift tapped twice knocks it on and close control ends; chasing it with Shift held you stay out of it, and letting
//     go of Shift once you are on it takes it into close control again
//   - contact sheets (qa/out/u27/*.png): a turn left and a turn right in close control, with which foot and which side
//     of the ball each touch was (the simulation's touch events)
//   - no console or page error
//
//   node qa/u27-feel.mjs          exits 1 on any failed check; writes qa/out/u27-feel.json and qa/out/u27/*.png
import fs from "node:fs";
import path from "node:path";
import {OUT} from "./lib.mjs";
import {trainLaunch, enterByButton, closeHubReal, lockPointer, frames, doubleTap} from "./tr4b-lib.mjs";

const DIR = path.join(OUT, "u27");
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
    if (!R.scenario("qa-u27")) R.registerScenario({id: "qa-u27", category: "attacking", type: "qau27", name: "Control test", desc: "A test scenario", build});
    C.saveSet({footCam: "third"});
    window.__u27 = {start: () => { if (R.RUN.cur) R.stopScenario("hub"); if (window.__trainHub.hubOpen()) window.__trainHub.closeHub(); return R.startScenario("qa-u27", {}); },
      T: () => window.__trainRun.RUN.cur.T,
      st: () => { const T = window.__trainRun.RUN.cur.T, ms = T.ms, me = T.me; return {d: Math.hypot(ms.ball.p.x - me.m.x, ms.ball.p.z - me.m.z), mine: ms.poss.ctl === me.id, on: !!me.ctlOn, v: me.m.speed, left: Math.min(ms.spec.runoff.hx - Math.abs(me.m.x), ms.spec.runoff.hx - Math.abs(ms.ball.p.x))}; }};
  });
  const begin = async () => {
    await page.evaluate(() => window.__u27.start());
    await page.waitForFunction(() => !!(window.__trainRun.RUN.cur && window.__trainRun.RUN.cur.T && window.__trainRun.RUN.cur.T.V), null, {timeout: 60000});
    await frames(page, 40);
    await page.evaluate(() => { const P = window.__life.P; P.yaw = -Math.PI/2; P.pitch = -.2; });
    await frames(page, 5);
  };
  await begin();
  const id = await lockPointer(page); if (!id) throw new Error("the pointer could not be locked");
  // every real frame for n frames: the ball's distance, yours, close control on, your speed (away from the cage's end:
  // the sprint, 5% quicker since U28 part B, reaches its fence within the frames, and the fence stops the ball)
  const watch = n => page.evaluate(n => new Promise(done => { const raf = window.__qa.realRAF; let k = 0, worst = 0, lost = 0, off = 0, vmax = 0; const f = () => { const s = window.__u27.st(); if (k > 10 && s.left > 6){ worst = Math.max(worst, s.d); if (!s.mine) lost++; if (!s.on) off++; vmax = Math.max(vmax, s.v); } if (++k >= n) done({worst: Math.round(worst*100)/100, lost, off, vmax: Math.round(vmax*100)/100}); else raf(f); }; raf(f); }), n);
  await page.keyboard.down("w"); await frames(page, 10);
  await frames(page, 20);
  const on0 = await page.evaluate(() => window.__u27.st());
  await page.keyboard.down("Shift");
  const run = await watch(150);
  await page.keyboard.up("Shift");
  res.run = {on0, run};
  check(on0.on && on0.mine, "W held with the ball at your feet: in close control, no key (BCS)", on0);
  check(run.worst <= KEEP_MAX && run.lost === 0 && run.off === 0 && run.vmax > 5, `held Shift (a sprint): it stays within ${KEEP_MAX} m of you, yours and in close control`, run);
  // Shift twice: knocked on, control off; run to it, F: taken again (from the start again: the sprint above ran the
  // length of the pitch)
  await page.keyboard.up("w"); await begin();
  await page.keyboard.down("w"); await frames(page, 6); await frames(page, 20);
  // (the two presses back to back: a headless frame can be slower than the 0.3 s a double tap has. (BCS) Pressed again
  // until the page has seen two presses within it (doubleTap): on a loaded machine the page drew a frame in 1 to 4 s
  // and the second press waited behind it, 3 to 9 s after the first as the page saw them)
  const tap = await doubleTap(page, "Shift");
  await page.keyboard.down("Shift"); await frames(page, 12);
  const kn = await page.evaluate(() => { const T = window.__u27.T(), me = T.me; return {on: !!me.ctlOn, end: me.ctlEnd || null, knocks: T.ms.events.filter(e => e.kind === "touch" && e.knock).length}; });
  kn.tap = tap;
  // ((BCS) the chase with Shift held: out of close control however near you get; let go of Shift on it: in it again)
  let chaseOn = false, near = false, again = false;
  for (let i = 0; i < 100 && !near; i++){
    await frames(page, 2);
    const s0 = await page.evaluate(() => window.__u27.st());
    if (s0.on) chaseOn = true;
    if (s0.d < 1.1 && s0.mine) near = true;
  }
  await page.keyboard.up("Shift");
  for (let i = 0; i < 60 && !again; i++){
    await frames(page, 2);
    const s0 = await page.evaluate(() => window.__u27.st());
    if (s0.on) again = true;
  }
  await page.keyboard.up("w");
  res.knock = {kn, chaseOn, near, again};
  check(kn.knocks === 1 && !kn.on && kn.end === "knock", "Shift tapped twice: knocked on, close control ends", kn);
  check(near && !chaseOn, "chasing it with Shift held: on it, and still out of close control (the strides push it on)", {near, chaseOn});
  check(again, "letting go of Shift with the ball at your feet: in close control again (BCS)", {again});
  // contact sheets: a turn left and a turn right in close control, the touches' foot and side
  const turn = async (name, key) => {
    await begin();
    await page.keyboard.down("w"); await frames(page, 6); await frames(page, 30);
    const n0 = await page.evaluate(() => window.__u27.T().ms.events.length);
    await page.keyboard.up("w"); await page.keyboard.down(key);
    // ((BCS) up to 2 minutes a picture: on a loaded machine a frame took 1 to 4 s and the default 30 s ran out)
    for (let i = 0; i < 6; i++){ await frames(page, 5); await page.screenshot({path: path.join(DIR, `${name}-${i}.png`), clip: {x: 470, y: 400, width: 340, height: 320}, timeout: 120000}); }
    // (the touches while the turn's key is held: let go, the ball's spot comes back in front of you, a turn of its own)
    const out = await page.evaluate(n0 => window.__u27.T().ms.events.slice(n0).filter(e => e.kind === "touch" && e.keep).map(e => ({foot: e.foot, part: e.part, side: e.ballSide})), n0);
    await page.keyboard.up(key);
    return out;
  };
  res.turns = {left: await turn("turn-left", "a"), right: await turn("turn-right", "d")};
  const sidesL = res.turns.left.filter(x => x.side !== "back"), sidesR = res.turns.right.filter(x => x.side !== "back");
  check(sidesL.some(x => x.side === "right") && !sidesL.some(x => x.side === "left") && sidesR.some(x => x.side === "left") && !sidesR.some(x => x.side === "right"), "a turn left plays the ball's right side, a turn right its left side (contact sheets in qa/out/u27)", res.turns);
  check(!t.errors.length, "no console or page error", t.errors.slice(0, 5));
} finally { await t.close(); }
fs.writeFileSync(path.join(OUT, "u27-feel.json"), JSON.stringify(res, null, 1));
console.log(res.errors.length ? `u27-feel: ${res.errors.length} failed` : "u27-feel: all checks pass");
process.exit(res.errors.length ? 1 : 0);
