// qa/u21-smooth.mjs: third person on the move, in the real game with real input (W and Shift held on the keyboard). The
// user's report after U21: running, your body shook and smudged against the camera (not standing), and its shadow
// lagged and jumped.
//   - running and sprinting straight on, your body keeps its place against the camera: frame to frame it moves under
//     STEADY mm against the camera (the camera and your body taken at the same point between the simulation's steps)
//   - on High (people's shadows in a stadium's or the cage's sky) the shadow map is redrawn every frame your body moves,
//     so its shadow never trails behind it
//   - no console or page error
//
//   node qa/u21-smooth.mjs          exits 1 on any failed check; writes qa/out/u21-smooth.json
import fs from "node:fs";
import path from "node:path";
import {OUT} from "./lib.mjs";
import {trainLaunch, enterByButton, closeHubReal, lockPointer, frames} from "./tr4b-lib.mjs";

const STEADY = 6;   // mm a frame
const res = {errors: []};
const check = (ok, what, got) => { if (!ok) res.errors.push(`${what}: ${JSON.stringify(got).slice(0, 1500)}`); console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok ? "" : ": " + JSON.stringify(got).slice(0, 900)}`); };

async function run(gfx){
  const t = await trainLaunch({seed: 6, gfx});
  const page = t.page;
  try {
    await enterByButton(page);
    await closeHubReal(page);
    await page.evaluate(async () => {
      const R = window.__trainRun, C = await import("/js/life/football/control.js"), M = await import("/js/life/football/matchcam.js");
      const ST = await import("/js/life/core/state.js");
      // you, alone, the ball far behind you: room to run 30 m straight on
      const build = (cfg, env) => {
        const hx = env.spec.hx, me = {slot: "ST", x: hx - 8, z: 0, yaw: Math.PI/2};
        return {myTeam: 0, role: "Attacker", seed: 11, laws: {out: "rebound"}, me, mates: [], opps: [], keeper: null, ball: {x: hx - 2, y: .11, z: 6, free: true}};
      };
      if (!R.scenario("qa-u21s")) R.registerScenario({id: "qa-u21s", category: "attacking", type: "qau21s", name: "Smooth test", desc: "A test scenario", build});
      C.saveSet({footCam: "third"});
      window.__u21s = {M, ST, start: () => { if (window.__trainHub.hubOpen()) window.__trainHub.closeHub(); return R.startScenario("qa-u21s", {}); }};
    });
    await page.evaluate(() => window.__u21s.start());
    await page.waitForFunction(() => !!(window.__trainRun.RUN.cur && window.__trainRun.RUN.cur.T && window.__trainRun.RUN.cur.T.V), null, {timeout: 60000});
    await frames(page, 60);
    const id = await lockPointer(page); if (!id) throw new Error("the pointer could not be locked");
    await page.evaluate(() => { const P = window.__life.P; P.yaw = Math.PI/2; P.pitch = -.15; });
    await frames(page, 10);
    // every real frame: your body's place against the camera, its speed, the shadow map's redraws
    const watch = page.evaluate(() => new Promise(done => {
      const L = window.__life, T = window.__trainRun.RUN.cur.T, me = T.me, SK = window.__u21s.ST.RT.SKY, raf = window.__qa.realRAF;
      const out = {frames: 0, moving: 0, d: [], shadowAt: [], speedMax: 0};
      let last = null, k = 0;
      const f = () => {
        const R0 = T.V.rec[me.id], g = R0 && R0.h.g, cam = L.cam;
        if (g){
          g.updateMatrixWorld(true);
          const e = g.matrixWorld.elements, o = {x: e[12] - cam.position.x, z: e[14] - cam.position.z};
          const sp = me.m.speed;
          if (last && sp > 4 && last.sp > 4 && window.__u21s.M.MC.tpK === 1){ out.moving++; out.d.push(Math.hypot(o.x - last.x, o.z - last.z)*1000); out.shadowAt.push(SK && SK.shadow ? SK.shadow.count : -1); }
          out.speedMax = Math.max(out.speedMax, sp);
          last = {x: o.x, z: o.z, sp};
        }
        out.frames++;
        if (++k >= 150) done(out); else raf(f);
      };
      raf(f);
    }));
    await page.keyboard.down("KeyW"); await page.keyboard.down("ShiftLeft");
    const W = await watch;
    await page.keyboard.up("ShiftLeft"); await page.keyboard.up("KeyW");
    const ds = W.d.slice().sort((a, b) => a - b), p95 = ds[Math.floor(ds.length*.95)] || 0, max = ds[ds.length - 1] || 0;
    const redraws = W.shadowAt.length > 1 ? W.shadowAt[W.shadowAt.length - 1] - W.shadowAt[0] : 0;
    const out = {gfx, moving: W.moving, speedMax: +W.speedMax.toFixed(2), p95: +p95.toFixed(2), max: +max.toFixed(2), redraws, movingFrames: W.shadowAt.length,
      tier: await page.evaluate(() => { const ST = window.__u21s.ST; return {where: ST.RT.SKY && ST.RT.SKY.where, shadows: !!(ST.RT.renderer && ST.RT.renderer.shadowMap.enabled)}; }),
      errors: t.errors.slice(0, 5)};
    return out;
  } finally { await t.close(); }
}

for (const gfx of ["medium", "high"]){
  const r = await run(gfx);
  res[gfx] = r;
  check(r.moving >= 40 && r.speedMax > 6, `${gfx}: you ran with W and Shift held, in third person`, r);
  check(r.max < STEADY, `${gfx}: running, your body keeps its place against the camera (under ${STEADY} mm a frame, the worst frame)`, r);
  if (gfx === "high") check(!r.tier.shadows || r.redraws >= r.movingFrames - 3, "high: the shadow map is redrawn every frame your body moves (its shadow never trails it)", r);
  check(!r.errors.length, `${gfx}: no console or page error`, r.errors);
}
fs.writeFileSync(path.join(OUT, "u21-smooth.json"), JSON.stringify(res, null, 1));
console.log(res.errors.length ? `u21-smooth: ${res.errors.length} failed` : "u21-smooth: all checks pass");
process.exit(res.errors.length ? 1 : 0);
