// qa/run.mjs: runs QA suites by name, one child process each, and reports pass or fail per script.
// Owner: I0 (DESIGN 2.1); WP-0B extends it (lint, nodash, oldsave), WP-QA builds qa/full.mjs on it.
//
//   node qa/run.mjs                    unit, then smoke
//   node qa/run.mjs smoke              qa/smoke.mjs
//   node qa/run.mjs unit               every qa/unit/*.mjs under plain node
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
const suites = names.length ? names : ["unit", "smoke"];

// a suite name to the scripts it runs
function scripts(name){
  if (name === "unit"){
    const dir = path.join(QA, "unit");
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith(".mjs")).sort().map(f => path.join(dir, f)) : [];
  }
  const f = path.join(QA, name.replace(/\.mjs$/, "") + ".mjs");
  if (!fs.existsSync(f)) throw new Error(`no suite "${name}": ${path.relative(ROOT, f)} does not exist`);
  return [f];
}

function runOne(file){
  return new Promise(resolve => {
    const t0 = Date.now();
    const ch = spawn(process.execPath, [file, ...extra], {cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], env: {...process.env, QA_PORT: String(PORT)}});
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
  for (const f of list){
    console.log(`${s}: ${path.relative(ROOT, f)}`);
    const r = await runOne(f); r.suite = s; results.push(r);
    console.log(`${s}: ${r.script} ${r.ok ? "pass" : "FAIL (exit " + r.code + ")"} in ${(r.ms/1000).toFixed(1)} s`);
  }
}
if (srv.started) srv.server.close();
const fail = results.filter(r => !r.ok);
fs.mkdirSync(OUT, {recursive: true});
fs.writeFileSync(path.join(OUT, "run.json"), JSON.stringify({suites, port: PORT, ok: !fail.length, results}, null, 1));
console.log(`\n${results.filter(r => r.ok && !r.skipped).length} passed, ${fail.length} failed${fail.length ? ": " + fail.map(r => r.script || r.suite).join(", ") : ""}`);
process.exit(fail.length ? 1 : 0);
