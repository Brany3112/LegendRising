// qa/smoke.mjs: a fresh career in each zone of the 3D world, a few real frames in each, and no errors.
// Owner: I0 (DESIGN 2.1); WP-0B extends it (DESIGN 2.0: "node qa/run.mjs smoke passes with zero console errors and
// zero page errors in every zone").
//
//   node qa/smoke.mjs            exits 1 on any console error or uncaught page error; writes qa/out/smoke.json and a
//                                screenshot per zone (qa/out/smoke-<zone>.png)
import {launch, career, snap, report} from "./lib.mjs";

const FRAMES = 12, gfx = process.env.QA_GFX || "low";
const t0 = Date.now(), res = {gfx, zones: [], errors: [], ok: false};
const {page, close} = await launch({gfx, seed: 1});
try {
  const info = await career(page, {zone: "home", at: "bed", min: 12*60});
  res.career = info;
  for (const zone of ["home", "ground", "town"]){
    if (zone !== "home") await page.evaluate(z => window.__life.enterZone(z, "bus"), zone);
    const f0 = await page.evaluate(() => window.__life.presented);
    await page.waitForFunction(n => window.__life.presented >= n, f0 + FRAMES, {timeout: 120000});
    const st = await page.evaluate(() => { const L = window.__life, P = L.P; return {zone: L.LIFE.zone, presented: L.presented, P: [P.x, P.feet, P.z].map(v => +v.toFixed(2)), finite: [P.x, P.z, P.feet, P.yaw, P.eye].every(Number.isFinite)}; });
    st.shot = await snap(page, "smoke-" + zone);
    st.errors = page.errors.length;
    res.zones.push(st);
    console.log(`${zone}: ${FRAMES} frames presented (${st.presented} in all), you at ${st.P.join(", ")}, ${st.errors} errors so far`);
    if (st.zone !== zone || !st.finite) page.errors.push(`zone ${zone}: the world says ${st.zone}, position finite ${st.finite}`);
  }
} catch(e){ page.errors.push("smoke: " + (e && e.stack || e)); }
finally {
  res.errors = page.errors.slice();
  res.ok = res.errors.length === 0 && res.zones.length === 3;
  res.ms = Date.now() - t0;
  report("smoke", res);
  await close();
}
if (!res.ok) console.log("errors:\n  " + res.errors.join("\n  "));
console.log(res.ok ? "smoke: pass" : "smoke: FAIL");
process.exit(res.ok ? 0 : 1);
