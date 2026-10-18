// qa/unit/trainentry.mjs: every Training module has a loader.
// Owner: P3-B (TR-3). Contract: BUILD-PLAN section 0 "How Training modules are loaded": js/life/train/index.js is the
// one Training entry and statically imports every other js/life/train/*.js module (each runs its registrations on
// import), and no career code imports a js/life/train/ module statically (the title loads index.js dynamically).
//
//   node qa/unit/trainentry.mjs        exits 1 on any failed check; writes qa/out/unit-trainentry.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const res = {name: "unit-trainentry", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
// the static import specifiers of a module's source (comments taken out first)
const importsOf = src => {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
  const out = [];
  for (const m of code.matchAll(/^\s*import\s+(?:[^"'`;]*?\s+from\s+)?["']([^"']+)["']/gm)) out.push(m[1]);
  for (const m of code.matchAll(/^\s*export\s+[^"'`;]*?\s+from\s+["']([^"']+)["']/gm)) out.push(m[1]);
  return out;
};

const DIR = path.join(ROOT, "js/life/train");
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(f => f.endsWith(".js")).sort() : [];
check(files.includes("index.js"), "js/life/train/index.js exists", files);
const idx = files.includes("index.js") ? fs.readFileSync(path.join(DIR, "index.js"), "utf8") : "";
const loaded = new Set(importsOf(idx).filter(s => s.startsWith("./")).map(s => s.slice(2).replace(/\?.*$/, "")));
for (const f of files) if (f !== "index.js") check(loaded.has(f), `index.js imports ./${f}`);

// no career file and no world module imports a Training module statically (only the title's dynamic import loads it)
const walk = d => fs.readdirSync(d, {withFileTypes: true}).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const bad = [];
for (const f of walk(path.join(ROOT, "js"))){
  if (f.startsWith(DIR + path.sep)) continue;
  const specs = importsOf(fs.readFileSync(f, "utf8"));
  for (const s of specs) if (/(^|\/)train\/[^/]+\.js/.test(s)) bad.push(`${path.relative(ROOT, f)} -> ${s}`);
}
check(!bad.length, "no module outside js/life/train/ imports a Training module statically", bad);
// the title loads the entry with a dynamic import
const ui = fs.readFileSync(path.join(ROOT, "js/ui/main.js"), "utf8");
check(/import\(\s*["']\.\.\/life\/train\/index\.js["']\s*\)/.test(ui), "js/ui/main.js loads ../life/train/index.js with a dynamic import");

fs.mkdirSync(path.join(ROOT, "qa/out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa/out/unit-trainentry.json"), JSON.stringify(res, null, 1));
console.log(res.ok ? "unit-trainentry: all checks pass" : "unit-trainentry: FAILED");
process.exit(res.ok ? 0 : 1);
