// qa/wpA-overdraw.mjs: WP-A acceptance for overdraw on Low (how many times a pixel is shaded).
// Owner: WP-A (DESIGN 1.5.11 budget table: overdraw <= 2.0 in the home bedroom and lobby; 3.9.2 front-to-back order
// of the static batches, chunks.js "the order of the batches").
//
//   bedroom, lobby      the perf views (perf.js VIEWS): overdraw at most 2.0, and below what three.js's own order (by
//                       material, then depth) gives for the same view
//   turned round        the same two places looking the other ways, and the street and the training ground: reported,
//                       and held to the same 2.0
//
// The measure is perf.js __perf.overdraw: the view drawn again as it is drawn, every fragment that passes the depth
// test counted.
//
//   QA_PORT=8765 node qa/wpA-overdraw.mjs        writes qa/out/wpA-overdraw.json
import {launch, career, freeze, expect, report} from "./lib.mjs";

const out = {checks: [], views: {}, ok: true};
const check = (name, ok, detail, soft = false) => { out.checks.push({name, ok: !!ok, soft, detail}); if (!ok && !soft) out.ok = false; console.log(`${ok ? "ok  " : soft ? "note" : "FAIL"} ${name}${detail !== undefined ? ": " + JSON.stringify(detail) : ""}`); };

// [name, perf view, turn (rad), pitch or null for the view's own]
const VIEWS = [["bedroom", "bedroom", 0, null], ["lobby", "lobby", 0, null],
  ["bedroom, turned round", "bedroom", Math.PI, null], ["bedroom, turned left", "bedroom", Math.PI/2, -.2],
  ["lobby, turned left", "lobby", Math.PI/2, 0], ["lobby, turned right", "lobby", -Math.PI/2, -.15], ["lobby, turned round", "lobby", Math.PI, .1],
  ["street", "street", 0, null], ["training ground yard", "yard", 0, null]];

const {page, close, errors} = await launch({gfx: "low", seed: 2, query: "perf=1"});
try {
  await career(page, {zone: "home", min: 12*60});
  await freeze(page);
  await page.evaluate(() => { __life.FADE.v = 0; __life.FADE.boot = false; });
  for (const [name, view, turn, pitch] of VIEWS){
    const r = await page.evaluate(({view, turn, pitch}) => {
      const L = __life, R = L.renderer();
      __perf.setView(view);
      L.P.yaw += turn; if (pitch != null) L.P.pitch = pitch;
      for (let i = 0; i < 12; i++){ L.stepN(1); R.render(L.scene(), L.cam); }
      return {batches: __perf.overdraw(), material: __perf.overdraw({order: "material"}), calls: R.info.render.calls};
    }, {view, turn, pitch});
    out.views[name] = r;
    const main = name === "bedroom" || name === "lobby";
    check(`${name}: overdraw at most 2.0`, r.batches.overdraw <= 2.0, {overdraw: r.batches.overdraw, materialOrder: r.material.overdraw, covered: r.batches.covered});
    if (main) check(`${name}: the batches' order shades less than three.js's material order`, r.batches.overdraw < r.material.overdraw, {batches: r.batches.overdraw, material: r.material.overdraw});
  }
  check("no errors", errors.length === 0, errors.slice(0, 5));
} finally { await close(); }
report("wpA-overdraw", out);
console.log(out.ok ? "wpA-overdraw: pass" : "wpA-overdraw: FAIL");
expect(out.ok, "wpA-overdraw failed");
