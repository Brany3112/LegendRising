// qa/parity.mjs: the Stage 0 parity gate for the split of js/life/world.js into js/life/core/.
// Owner: WP-0A (DESIGN 2.2 WP-0A acceptance: "replaying the I0 scripts gives every recorded value within 1e-6").
//
// Replays the exact I0 recorder scripts (qa/record-traj.mjs SCRIPTS, run by its own recordFresh in a fresh browser per
// zone: the same seeds, the same career, the same 1200 steps of input) against the code as it is now, and compares
// every recorded number (you, the camera, both bodies' bones and roots) with qa/golden/traj-<zone>.json.
//
//   node qa/parity.mjs                  every zone
//   node qa/parity.mjs --zones home     only these
//
// Writes qa/out/parity.json; exits 1 on any difference above the tolerance, a structural difference, or a page error.
import fs from "node:fs";
import {SCRIPTS, GOLDEN, TOL, recordFresh, compare} from "./record-traj.mjs";
import {report} from "./lib.mjs";

const arg = process.argv.slice(2), zi = arg.indexOf("--zones");
const zones = zi >= 0 ? arg[zi + 1].split(",") : Object.keys(SCRIPTS);
const out = {tol: TOL, zones: {}, ok: true};
for (const z of zones){
  const t0 = Date.now();
  let r;
  try {
    const rec = await recordFresh(z);
    const golden = JSON.parse(fs.readFileSync(GOLDEN(z), "utf8"));
    const c = compare(rec, golden, TOL);
    r = {ok: c.ok && !rec.errors.length && rec.finished === golden.finished, values: c.n, maxErr: c.maxErr, worst: c.worst, bad: c.bad,
      finished: rec.finished, marks: rec.marks, errors: rec.errors, s: Math.round((Date.now() - t0)/1000)};
  } catch(e){ r = {ok: false, errors: [String(e && e.stack || e)]}; }
  out.zones[z] = r;
  if (!r.ok) out.ok = false;
  console.log(`${z}: ${r.ok ? "parity" : "DIFFERS"} over ${r.values} values, max error ${r.maxErr}${!r.ok && r.worst ? ` at ${r.worst.path} (${r.worst.a} vs ${r.worst.b})` : ""}${r.bad ? `, ${r.bad.path}: ${r.bad.why}` : ""}${r.errors && r.errors.length ? `, errors:\n  ${r.errors.join("\n  ")}` : ""} (${r.s} s)`);
}
report("parity", out);
console.log(out.ok ? "parity: pass" : "parity: FAIL");
process.exit(out.ok ? 0 : 1);
