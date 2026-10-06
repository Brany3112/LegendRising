// qa/unit/qatools.mjs: the text and lint gates themselves (qa/jslex.mjs, qa/nodash.mjs, qa/lint.mjs and every rule of
// qa/lint-rules.json) on small samples, so a gate that stops seeing what it should is caught before it waves a
// package through.
// Owner: WP-0B (DESIGN 1.8 nodash, 2.2 WP-0B lint rules).
//
//   node qa/unit/qatools.mjs     exits 1 on any failed check; writes qa/out/unit-qatools.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {lexJS, codeOnly, lineIndex} from "../jslex.mjs";
import {scanFile} from "../nodash.mjs";
import {globRe, functionSpans, findIn, loadRules} from "../lint.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const EM = String.fromCharCode(0x2014);
const results = [];
function check(name, cond, detail = ""){ results.push({name, ok: !!cond, detail: cond ? "" : String(detail)}); if (!cond) console.log(`FAIL ${name}${detail ? ": " + detail : ""}`); }
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

/* ---------- jslex ---------- */
{
  const src = [
    `const a = "one ${EM} two"; // a comment ${EM}`,
    `const b = \`x \${ f("in") } y\`; /* block */`,
    `const r = /a"b/g, d = x / y / z;`,
    `const t = 'it\\'s';`
  ].join("\n");
  const lx = lexJS(src), str = lx.strings.map(([a, b]) => src.slice(a, b));
  eq("strings, template parts and nested strings", str, [`one ${EM} two`, "x ", "in", " y", "it\\'s"]);
  eq("comments", lx.comments.map(([a, b]) => src.slice(a, b)), [`// a comment ${EM}`, "/* block */"]);
  eq("a regex literal, and division is not one", lx.regexes.map(([a, b]) => src.slice(a, b)), ['a"b']);
  const code = codeOnly(src);
  check("codeOnly keeps length and lines", code.length === src.length && code.split("\n").length === src.split("\n").length);
  check("codeOnly blanks strings and comments", !code.includes(EM) && !code.includes("comment") && !code.includes("one") && code.includes("f(") && code.includes("x / y / z"));
  const L = lineIndex(src);
  eq("lineIndex", [L.lineOf(0), L.lineOf(src.indexOf("block")), L.lineText(3)], [1, 2, "const r = /a\"b/g, d = x / y / z;"]);
}

/* ---------- nodash ---------- */
{
  const js = [
    `const ok = "Fine: no dash here";`,
    `// a comment ${EM} is never player-facing`,
    `toast("Saved ${EM} see you tomorrow");`,
    `const cell = "${EM}";`,
    `p.boardSlot = x == null ? "${EM}" : x;`,
    `if (s !== "${EM}") go(); // nodash-ok: sentinel`
  ].join("\n");
  const rows = scanFile("js/sample.js", js);
  eq("nodash finds the strings, not the comment", rows.map(r => [r.line, r.cls]), [[3, "sentence"], [4, "placeholder"], [5, "sentinel"], [6, "sentinel"]]);
  eq("nodash-ok marks only its own line", rows.map(r => r.at.every(d => d.ok)), [false, false, false, true]);
  const html = `<div title="Energy ${EM} food">x</div>\n<!-- ${EM} -->\n<p>Hello ${EM} there</p>\n<script>const s = "in ${EM} script";</script>`;
  eq("nodash in HTML: attribute, text, inline script; comments ignored", scanFile("index.html", html).map(r => r.line).sort(), [1, 3, 4]);
  const css = `/* ${EM} */\n.a::before{content:"Paused ${EM} click"}\n.b{color:red}`;
  eq("nodash in CSS: content values only", scanFile("css/x.css", css).map(r => r.line), [2]);
}

/* ---------- lint engine ---------- */
{
  eq("glob **", ["js/life/a.js", "js/life/football/b.js", "js/x.js"].filter(f => globRe("js/life/**/*.js").test(f)), ["js/life/a.js", "js/life/football/b.js"]);
  eq("glob *", ["css/a.css", "css/sub/b.css"].filter(f => globRe("css/*.css").test(f)), ["css/a.css"]);
  const code = codeOnly(`function trustAdd(d){ S.trust = 1; }
const o = { buy(id){ if (x){ S.inv[id]++; } }, drink: function(a){ S.inv.x--; } };
const consume = (id, mult = 1) => { S.inv[id]--; };
const k = x => { y(); };
let g = async function* gen(a){ t(); };
for (const a of b) { q(); }`);
  eq("function names around braces", functionSpans(code).map(s => s.name), ["trustAdd", "buy", "drink", "consume", "k", "gen"]);
}

/* ---------- every rule on a sample it must catch and one it must let through ---------- */
{
  const cfg = loadRules();
  const samples = {
    "pure-no-random": ["js/life/mover.js", "const r = Math.random();", "// Math.random() is not allowed\nconst s = 'Math.random';"],
    "pure-no-globals": ["js/life/football/sim.js", "const me = S.player;\nMT.score = 1;\nA.sign(0);\nwindow.x = 1;\ndocument.body;", "const S2 = this.S.x, MTX = 1, a = obj.A.b; // S.player"],
    "pure-no-three": ["js/life/gaitcore.js", "import * as THREE from \"../../vendor/three.module.js\";", "// no THREE here\nconst three = 3;"],
    "bridge-no-build-W": ["js/life/football/bridge.js", "import {scene, W} from \"../build.js?v=1\";", "import {scene} from \"../build.js\";\nconst w = W.clubs;"],
    "football-no-modifier-keys": ["js/life/football/control.js", "if (ev.ctrlKey) shoot();", "if (ev.ctrlKey || ev.altKey || ev.metaKey) return false;"],
    "standard-material-routing": ["js/life/home.js", "const m = new THREE.MeshStandardMaterial({color: 1});", "const m = mat({color: 1}); // new THREE.MeshStandardMaterial"],
    "no-legacy-match": ["js/match.js", "if (params.get(\"legacyMatch\")) old();", "// legacyMatch is gone"],
    "one-ball-integrator": ["js/life/drills.js", "function stepBall(b, dt){}\nfunction ballStep(b){}", "ballStep(b, bw, 1/60);"],
    "trust-writes": ["js/career.js", "S.trust += 6;\nS.trust = 0;\nS.trust--;", "if (S.trust === 3) x();\nconst t = S.trust;\nfunction trustAdd(d){ S.trust = clamp(S.trust + d, -30, 80); }"],
    "inv-writes": ["js/ui/main.js", "S.inv[id]--;\nS.inv.drink = 0;\ndelete S.inv.x;", "if (!S.inv[id]) return;\nfunction consume(id){ S.inv[id]--; }"],
    "hours-literals": ["js/life/intro.js", "note(\"Training starts at 10:00 AM.\");", "note(`Training starts at ${fmtTime(SESSION.start)}.`); // 10:00 AM"],
    "engine-names": ["css/style.css", "#pitch{display:block}", "#pitchlines{display:block}"]
  };
  for (const r of cfg.rules){
    if (r.kind === "importmap"){ check(`rule ${r.id} is understood`, Array.isArray(r.files)); continue; }
    const s = samples[r.id];
    if (!s){ check(`rule ${r.id} has samples here`, false, "add a sample that it must catch and one it must let through"); continue; }
    const [file, bad, good] = s;
    check(`rule ${r.id} covers ${file}`, (r.files || []).flatMap(g => g.startsWith("@") ? cfg[g.slice(1)] : [g]).some(g => globRe(g).test(file)), "the sample file is outside the rule");
    const hit = findIn(r, file, bad), miss = findIn(r, file, good);
    check(`rule ${r.id} catches its sample`, hit.length >= bad.split("\n").length, `${hit.length} findings: ${JSON.stringify(hit.map(h => h.match))}`);
    check(`rule ${r.id} lets the good sample through`, miss.length === 0, JSON.stringify(miss.map(h => h.text)));
  }
  // active exactly when the package that activates it has been merged (the integrator keeps cfg.merged)
  check("lint-rules.json lists the merged packages", Array.isArray(cfg.merged) && cfg.merged.length > 0, "add \"merged\": [package ids]");
  eq("rules active now", cfg.rules.filter(r => r.active).map(r => r.id), cfg.rules.filter(r => (cfg.merged || []).includes(r.activatedBy)).map(r => r.id));
}

const failed = results.filter(r => !r.ok);
fs.mkdirSync(path.join(ROOT, "qa", "out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa", "out", "unit-qatools.json"), JSON.stringify({ok: !failed.length, checks: results}, null, 1));
console.log(`unit/qatools: ${results.length - failed.length} of ${results.length} checks pass`);
process.exit(failed.length ? 1 : 0);
