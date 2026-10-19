// qa/full.mjs: the whole QA plan in one run, in the order of DESIGN 4.0.
// Owner: WP-QA (DESIGN 2.5 WP-QA, 4.0 runner, 4.10 performance on Low, 4.11 integrity checks).
//
// Each stage is one qa/run.mjs call (one server on QA_PORT, one child process per script, pass or fail by exit code):
//   1. unit       every qa/unit/*.mjs
//   2. integrity  lint (the active grep gates), nodash over the whole repository (the release gate: 0 em dashes)
//   3. harness    qa/harness.mjs --n 1000, the simulation's acceptance bands (seeds 1 to 1000)
//   4. browser    smoke, parity, every qa/wp*.mjs acceptance suite and qa/int-fullmatch.mjs
//   5. low        what Low is in the world (qa/wpA-low.mjs: shadows, lights, rays, the scripted 60 m walk, memory)
//   6. perf       qa/perf.mjs over Low, Medium and High: the 1.5.11 budgets, the I0 ratios, the release baseline
//   7. oldsave    the old-save round trip, every fixture in qa/golden/oldsave-*.json
//
//   QA_PORT=8765 node qa/full.mjs                   everything (hours under SwiftShader: run it in the background)
//   node qa/full.mjs --only unit,integrity,oldsave  some stages
//   node qa/full.mjs --skip harness,perf            all but these
//   node qa/full.mjs --n 200                        a shorter harness run (not the acceptance run)
//
// Writes qa/out/full.json (every stage's qa/run.mjs summary) and exits 1 when anything failed.
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QA = path.join(ROOT, "qa"), OUT = path.join(QA, "out");
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

// the browser acceptance suites: every qa/wp*.mjs that is a script (the shared helpers end in -lib)
const wpSuites = fs.readdirSync(QA).filter(f => /^wp.*\.mjs$/.test(f) && !/-lib\.mjs$/.test(f) && f !== "wpA-low.mjs").sort().map(f => f.replace(/\.mjs$/, ""));

const STAGES = [
  {id: "unit", suites: ["unit"]},
  {id: "integrity", suites: ["lint", "nodash-release", "nodash"]},
  {id: "harness", suites: ["harness"], args: ["--n", opt("--n", "1000")]},
  {id: "browser", suites: ["smoke", "parity", ...wpSuites, "int-fullmatch"]},
  {id: "low", suites: ["wpA-low"]},
  {id: "perf", suites: ["perf"], args: ["--tiers", "low,medium,high"]},
  {id: "oldsave", suites: ["oldsave"]}
];
const only = opt("--only", null), skip = (opt("--skip", "") || "").split(",").filter(Boolean);
const run = STAGES.filter(s => (!only || only.split(",").includes(s.id)) && !skip.includes(s.id));

fs.mkdirSync(OUT, {recursive: true});
const summary = {started: new Date().toISOString(), port: process.env.QA_PORT || null, stages: []};
for (const st of run){
  const t0 = Date.now();
  console.log(`\n=== ${st.id}: ${st.suites.join(" ")}${st.args ? " -- " + st.args.join(" ") : ""}`);
  const r = spawnSync(process.execPath, [path.join(QA, "run.mjs"), ...st.suites, ...(st.args ? ["--", ...st.args] : [])],
    {cwd: ROOT, env: process.env, stdio: "inherit"});
  let res = null;
  try { res = JSON.parse(fs.readFileSync(path.join(OUT, "run.json"), "utf8")); } catch(e){}
  const results = res ? res.results.map(x => ({script: x.script || x.suite, ok: x.ok, skipped: !!x.skipped, s: +(x.ms/1000).toFixed(1), tail: x.ok ? undefined : x.tail})) : [];
  summary.stages.push({id: st.id, ok: r.status === 0, exit: r.status, s: Math.round((Date.now() - t0)/1000), results});
  fs.writeFileSync(path.join(OUT, "full.json"), JSON.stringify(summary, null, 1));
}
const failed = summary.stages.flatMap(s => s.results.filter(x => !x.ok).map(x => `${s.id}: ${x.script}`)).concat(summary.stages.filter(s => !s.ok && !s.results.length).map(s => s.id));
summary.ok = !failed.length && summary.stages.every(s => s.ok);
summary.finished = new Date().toISOString();
fs.writeFileSync(path.join(OUT, "full.json"), JSON.stringify(summary, null, 1));
console.log(`\nfull: ${summary.stages.map(s => `${s.id} ${s.ok ? "pass" : "FAIL"}`).join(", ")}`);
if (failed.length) console.log("failed:\n  " + failed.join("\n  "));
process.exit(summary.ok ? 0 : 1);
