// qa/run.mjs: runs QA suites by name, one child process each, and reports pass or fail per script.
// Owner: I0 (DESIGN 2.1); WP-0B extends it (lint, nodash, oldsave), WP-QA builds qa/full.mjs on it.
//
//   node qa/run.mjs                    unit, lint, nodash, then smoke
//   node qa/run.mjs smoke              qa/smoke.mjs
//   node qa/run.mjs unit               every qa/unit/*.mjs under plain node
//   node qa/run.mjs lint               qa/lint.mjs: the active grep gates of qa/lint-rules.json
//   node qa/run.mjs nodash             qa/nodash.mjs --report: the I0 text baseline still reproduces and no new em dash
//                                      string has appeared (a package's own files: node qa/nodash.mjs <files>)
//   node qa/run.mjs nodash-release     qa/nodash.mjs over the whole repository: no em dash at all (DESIGN 4.11)
//   node qa/run.mjs oldsave            qa/oldsave.mjs: the old-save round trip
//   node qa/run.mjs integrity          lint, nodash and oldsave (DESIGN 4.11, on every merge)
//   node qa/run.mjs tr2                every TR-2 acceptance suite (BUILD-PLAN Phase 2)
//   node qa/run.mjs tr2b               every TR-2b acceptance suite (BUILD-PLAN Phase 2b)
//   node qa/run.mjs tr3                every TR-3 acceptance suite (BUILD-PLAN Phase 3)
//   node qa/run.mjs tr4                every TR-4 acceptance suite (BUILD-PLAN Phase 4; tr4a and tr4b per package)
//   node qa/run.mjs tr5                every TR-5 acceptance suite (BUILD-PLAN Phase 5; tr5a and tr5b per package)
//   node qa/run.mjs tr6                every TR-6 acceptance suite (BUILD-PLAN Phase 6; tr6a and tr6b per package)
//   node qa/run.mjs uf                 every user-fix suite merged with TR-3 (UF-A and UF-B)
//   node qa/run.mjs parity wp0a-cam    any qa/<name>.mjs (arguments after "--" go to every script)
//
// A script passes when it exits 0 (lib.mjs expect() throws, which exits 1). The summary goes to qa/out/run.json.
// One server for this tree is started (or found) on QA_PORT first, so the scripts share it.
import fs from "node:fs";
import path from "node:path";
import {spawn} from "node:child_process";
import {ensureServer, ROOT, PORT} from "./serve.mjs";

const QA = path.join(ROOT, "qa"), OUT = path.join(QA, "out");
const TIMEOUT = +(process.env.QA_TIMEOUT || 20*60*1000);
const argv = process.argv.slice(2), dd = argv.indexOf("--");
const names = (dd >= 0 ? argv.slice(0, dd) : argv), extra = dd >= 0 ? argv.slice(dd + 1) : [];
const suites = names.length ? names : ["unit", "lint", "nodash", "smoke"];

// suites that are a script with arguments of its own, or a list of other suites
const NAMED = {
  nodash: [["nodash.mjs", "--report"]],
  "nodash-release": [["nodash.mjs"]],
  integrity: ["lint", "nodash", "oldsave"],
  // Phase 2 of the Training Mode and football rework (TR-2): P2-A's and P2-B's acceptance, the integrator's real-input match
  tr2: ["tr2-passme", "tr2-gkme", "tr2-halftime", "tr2-kickoff", "tr2-keys", "tr2-scale", "tr2-gait", "tr2-startstop",
    "tr2-clipexit", "tr2-stop", "tr2-gkshuffle", "tr2-viewleak", "tr2-realmatch"],
  // Phase 2b (TR-2b): P2b-A's engine suites, P2b-B's input, animation and AI suites, the integrator's real-input match
  tr2b: ["tr2b-race", "tr2b-receive", "tr2b-tackle", "tr2b-shieldsim", "tr2b-shield", "tr2b-anim", "tr2b-ai", "tr2b-realmatch"],
  tr3: ["tr3-sandbox", "tr3-cage", "tr3-leak", "tr3-hub", "tr3-cones", "tr3-runner"],
  // Phase 4 (TR-4): P4-A's configuration and attribute suites, P4-B's reset, pitch and presets suites
  tr4: ["tr4-config", "tr4-attrs", "tr4-attredit", "tr4-reset", "tr4-pitch", "tr4-presets", "tr4-play"],
  tr4a: ["tr4-config", "tr4-attrs", "tr4-attredit"],
  tr4b: ["tr4-reset", "tr4-pitch", "tr4-presets"],
  // Phase 5 (TR-5): P5-A's Free Play and key suites, P5-B's admin panel suite
  tr5: ["tr5-freeplay", "tr5-keys", "tr5-admin"],
  tr5a: ["tr5-freeplay", "tr5-keys"],
  tr5b: ["tr5-admin"],
  // Phase 6 (TR-6): P6-A's receiving suites, P6-B's team scenario suites
  tr6: ["tr6-receive", "tr6-receive-anim", "tr6-team", "tr6-team-browser"],
  tr6a: ["tr6-receive", "tr6-receive-anim"],
  tr6b: ["tr6-team", "tr6-team-browser"],
  uf: ["uf-turn", "uf-throwin", "uf-anim", "uf-sub", "uf-fence", "uf-bench", "uf-aura", "uf-callpass", "uf-kits"],
  // User fix round 2 (UF2): UF2-A's feel suite (first-person body, settle, meter, pass assist, kick type), UF2-B's small-sided game suites
  uf2: ["uf2-feel", "uf2-ssg-sim", "uf2-ssg"],
  uf2a: ["uf2-feel"],
  uf2b: ["uf2-ssg-sim", "uf2-ssg"],
  uf3: ["uf3-pausecam"],
  // Phase 7 (TR-7): P7-A's free kicks, P7-B's corners, throw-ins and penalties
  tr7: ["tr7-freekick", "tr7-corner", "tr7-throw", "tr7-penalty"],
  tr7a: ["tr7-freekick"],
  tr7b: ["tr7-corner", "tr7-throw", "tr7-penalty"],
  // Phase 8 (TR-8): P8-A's resets, P8-B's Full Match in Training
  tr8: ["tr8-reset", "tr8-fullmatch"],
  tr8a: ["tr8-reset"],
  // Phase 9 (TR-9): P9-B's AI, P9-A's animation
  tr9: ["tr9-ai", "tr9-anim", "tr9-gkanim", "tr9-sheets"],
  tr9a: ["tr9-anim", "tr9-gkanim", "tr9-sheets"],
  tr9b: ["tr9-ai"],
  // USER-ISSUES U21: the camera by activity (third person for football, first person for life)
  u21: ["u21-camera", "u21-smooth", "u21-warmup"],
  // FC 27 (plan/notes/fc27-spec.md): the shot from the clip (section 4, 6.2 SH-1 to SH-8)
  fc27: ["fc27-shot"]
};
// a suite name to the scripts it runs: [{file, args}]
function scripts(name){
  if (name === "unit"){
    const dir = path.join(QA, "unit");
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith(".mjs")).sort().map(f => ({file: path.join(dir, f), args: []})) : [];
  }
  if (NAMED[name]) return NAMED[name].flatMap(x => typeof x === "string" ? scripts(x) : [{file: path.join(QA, x[0]), args: x.slice(1)}]);
  const f = path.join(QA, name.replace(/\.mjs$/, "") + ".mjs");
  if (!fs.existsSync(f)) throw new Error(`no suite "${name}": ${path.relative(ROOT, f)} does not exist`);
  return [{file: f, args: []}];
}

function runOne(file, args = []){
  return new Promise(resolve => {
    const t0 = Date.now();
    const ch = spawn(process.execPath, [file, ...args, ...extra], {cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], env: {...process.env, QA_PORT: String(PORT)}});
    let tail = "";
    let fresh = true;      // at the start of a line: the next character gets the indent
    const keep = d => { const s = d.toString(); process.stdout.write(s.replace(/[^\n]*\n|[^\n]+$/g, l => { const o = (fresh ? "  " : "") + l; fresh = l.endsWith("\n"); return o; })); tail = (tail + s).slice(-4000); };
    ch.stdout.on("data", keep); ch.stderr.on("data", keep);
    const timer = setTimeout(() => { tail += `\n(timed out after ${TIMEOUT/1000} s)`; ch.kill("SIGTERM"); }, TIMEOUT);
    ch.on("close", code => { clearTimeout(timer); resolve({script: path.relative(ROOT, file), ok: code === 0, code, ms: Date.now() - t0, tail: code === 0 ? "" : tail}); });
  });
}

const srv = await ensureServer(PORT);
const results = [];
for (const s of suites){
  let list;
  try { list = scripts(s); } catch(e){ results.push({suite: s, script: null, ok: false, code: null, ms: 0, tail: e.message}); console.log(`${s}: ${e.message}`); continue; }
  if (!list.length){ console.log(`${s}: no scripts yet`); results.push({suite: s, script: null, ok: true, skipped: true, ms: 0}); continue; }
  for (const {file: f, args} of list){
    console.log(`${s}: ${path.relative(ROOT, f)}${args.length ? " " + args.join(" ") : ""}`);
    const r = await runOne(f, args); r.suite = s; r.args = args; results.push(r);
    console.log(`${s}: ${r.script} ${r.ok ? "pass" : "FAIL (exit " + r.code + ")"} in ${(r.ms/1000).toFixed(1)} s`);
  }
}
if (srv.started) srv.server.close();
const fail = results.filter(r => !r.ok);
fs.mkdirSync(OUT, {recursive: true});
fs.writeFileSync(path.join(OUT, "run.json"), JSON.stringify({suites, port: PORT, ok: !fail.length, results}, null, 1));
console.log(`\n${results.filter(r => r.ok && !r.skipped).length} passed, ${fail.length} failed${fail.length ? ": " + fail.map(r => r.script || r.suite).join(", ") : ""}`);
process.exit(fail.length ? 1 : 0);
