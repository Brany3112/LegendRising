// qa/lint.mjs: the grep gates of the rework, as data (qa/lint-rules.json) run by one small engine.
// Owner: WP-0B (DESIGN 2.2 WP-0B lint rules, 2.0 definition of done "node qa/lint.mjs passes", 4.11 integrity checks).
//
//   node qa/lint.mjs                 every active rule; prints each finding as file:line, exits 1 if there is any
//   node qa/lint.mjs --all           every rule, active or not (inactive ones are reported, never fail the run)
//   node qa/lint.mjs --rule <id>     that rule (repeatable), active or not; exits 1 if it finds anything
//   node qa/lint.mjs --list          the rules, whether each is active, and the package whose merge activates it
//
// Writes qa/out/lint.json. JS is read through qa/jslex.mjs, so "code" scope never matches inside comments or strings.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {lexJS, codeOnly, lineIndex} from "./jslex.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const RULES = path.join(ROOT, "qa", "lint-rules.json");
const OUT = path.join(ROOT, "qa", "out");

/* ---------- files ---------- */
let ALL = null;
function allFiles(){
  if (ALL) return ALL;
  ALL = [];
  const walk = d => {
    for (const f of fs.readdirSync(path.join(ROOT, d))){
      const rel = d ? d + "/" + f : f;
      if (fs.statSync(path.join(ROOT, rel)).isDirectory()){ if (![".git", "node_modules", "vendor", "qa"].includes(f)) walk(rel); }
      else ALL.push(rel);
    }
  };
  walk("");
  return ALL.sort();
}
// a glob from the game root: ** crosses folders, * and ? stay inside one
export function globRe(g){
  let re = "";
  for (let i = 0; i < g.length; i++){
    const c = g[i];
    if (c === "*" && g[i + 1] === "*"){ if (g[i + 2] === "/"){ re += "(?:.*/)?"; i += 2; } else { re += ".*"; i++; } }
    else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp("^" + re + "$");
}
function filesOf(rule, cfg){
  const expand = l => (l || []).flatMap(g => g.startsWith("@") ? (cfg[g.slice(1)] || []) : [g]).map(globRe);
  const inc = expand(rule.files), exc = expand(rule.except);
  return allFiles().filter(f => inc.some(r => r.test(f)) && !exc.some(r => r.test(f)));
}

/* ---------- reading a file in a rule's scope ---------- */
const isJS = f => /\.m?js$/.test(f);
// a file's text as a rule's scope sees it, same length and lines as the file
export function scopeText(file, src, scope){
  if (scope === "raw") return src;
  if (isJS(file)){
    const lex = lexJS(src);
    return scope === "code" ? codeOnly(src, lex) : codeOnly(src, {comments: lex.comments, strings: [], regexes: []});
  }
  // HTML and CSS: comments blanked; "code" has no further meaning there
  const blank = m => m.replace(/[^\n]/g, " ");
  return /\.html?$/.test(file) ? src.replace(/<!--[\s\S]*?-->/g, blank) : /\.css$/.test(file) ? src.replace(/\/\*[\s\S]*?\*\//g, blank) : src;
}
function view(file, scope, cache, given){
  const k = file + "\u0000" + scope;
  if (cache.has(k)) return cache.get(k);
  const src = given != null ? given : fs.readFileSync(path.join(ROOT, file), "utf8"), text = scopeText(file, src, scope);
  const v = {src, text, lines: text.split("\n"), srcLines: src.split("\n")};
  cache.set(k, v);
  return v;
}

// the named function around each offset: every { of the code gets the name of the function it opens, if any, read
// backwards from the brace (function f(...){, f(...){ as a method, f = (...) => {, f = x => {, f = function(...){,
// f: function(...){), so a match can ask which functions it sits in. Linear in the file, whatever its shape.
const KW = new Set(["if", "for", "while", "switch", "catch", "with", "function", "return", "else", "do", "try", "finally", "async", "await", "typeof", "new"]);
function fnNameBefore(code, i){
  let j = i - 1;
  const ws = () => { while (j >= 0 && /\s/.test(code[j])) j--; };
  const ident = () => { const e = j + 1; while (j >= 0 && /[\w$]/.test(code[j])) j--; return code.slice(j + 1, e); };
  const parens = () => { for (let d = 0; j >= 0; j--){ if (code[j] === ")") d++; else if (code[j] === "(" && --d === 0){ j--; return true; } } return false; };
  const skipAsync = () => { const k = j, w = ident(); if (w !== "async") j = k; ws(); };
  const assigned = () => {           // "name =" or "name:" before j; the name, or null
    if (code[j] === ":" || (code[j] === "=" && !"=!<>+-*/%&|^".includes(code[j - 1] || ""))){ j--; ws(); const n = ident(); return n && !KW.has(n) ? n : null; }
    return null;
  };
  ws();
  if (code[j] === ">" && code[j - 1] === "="){                         // an arrow with a block body
    j -= 2; ws();
    if (code[j] === ")"){ if (!parens()) return null; } else if (!ident()) return null;
    ws(); skipAsync();
    return assigned();
  }
  if (code[j] !== ")" || !parens()) return null;
  ws();
  let name = ident();
  ws();
  if (code[j] === "*"){ j--; ws(); }                                   // function* name(
  if (name === "function"){ skipAsync(); return assigned(); }          // an anonymous function expression
  if (!name || KW.has(name)) return null;
  return name;                                                          // function name(, or a method name(
}
export function functionSpans(code){
  const spans = [], stack = [];
  for (let i = 0; i < code.length; i++){
    const c = code[i];
    if (c === "{") stack.push({a: i, name: fnNameBefore(code, i)});
    else if (c === "}" && stack.length){ const f = stack.pop(); if (f.name) spans.push({a: f.a, b: i, name: f.name}); }
  }
  return spans;
}

/* ---------- rules ---------- */
// what one forbid rule finds in one file (src: its text, read from disk when left out)
export function findIn(rule, f, src = null, cache = new Map()){
  const pats = (rule.patterns || [rule.pattern]).map(p => new RegExp(p, "gu"));
  const allowLine = rule.allowLine ? new RegExp(rule.allowLine, "u") : null;
  const v = view(f, rule.scope || "code", cache, src), found = [];
  let spans = null, offs = null;
  for (let ln = 0; ln < v.lines.length; ln++){
    const line = v.lines[ln];
    for (const re of pats){
      re.lastIndex = 0;
      for (let m; (m = re.exec(line)); ){
        if (m[0] === ""){ re.lastIndex++; continue; }
        if (allowLine && allowLine.test(line)) continue;
        if (rule.marker && v.srcLines[ln].includes(rule.marker)) continue;
        if (rule.allowIn && rule.allowIn.length && isJS(f)){
          if (!spans){ spans = functionSpans(view(f, "code", cache, src).text); offs = [0]; for (const l of v.lines) offs.push(offs[offs.length - 1] + l.length + 1); }
          const at = offs[ln] + m.index;
          if (spans.some(s => s.a < at && at < s.b && rule.allowIn.includes(s.name))) continue;
        }
        found.push({file: f, line: ln + 1, match: m[0], text: v.srcLines[ln].trim().slice(0, 160)});
      }
    }
  }
  return found;
}
function runForbid(rule, cfg, cache){
  const files = filesOf(rule, cfg), found = [];
  for (const f of files) found.push(...findIn(rule, f, null, cache));
  return {files: files.length, found};
}
function runImportmap(rule, cfg){
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const m = /<script\s+type=["']importmap["']\s*>([\s\S]*?)<\/script>/.exec(html);
  let map = {};
  try { map = m ? JSON.parse(m[1]).imports || {} : {}; } catch(e){ return {files: 0, found: [{file: "index.html", line: 0, match: "importmap", text: "the importmap is not valid JSON: " + e.message}]}; }
  const keys = new Set(Object.keys(map).map(k => k.replace(/^\.\//, "")));
  const files = filesOf(rule, cfg), lineOfMap = m ? html.slice(0, m.index).split("\n").length : 0;
  return {files: files.length, found: files.filter(f => !keys.has(f)).map(f => ({file: "index.html", line: lineOfMap, match: f, text: `no importmap entry for ./${f}`}))};
}
export function runRule(rule, cfg, cache = new Map()){
  return rule.kind === "importmap" ? runImportmap(rule, cfg) : runForbid(rule, cfg, cache);
}
export function loadRules(file = RULES){
  const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
  const ids = new Set();
  for (const r of cfg.rules){
    if (!r.id || ids.has(r.id)) throw new Error(`lint-rules.json: missing or repeated id ${r.id}`);
    ids.add(r.id);
    if (!r.activatedBy) throw new Error(`lint-rules.json: ${r.id} names no package in activatedBy`);
    if (r.kind !== "importmap") for (const p of r.patterns || [r.pattern]) new RegExp(p, "u");
  }
  return cfg;
}

/* ---------- command line ---------- */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain){
  const argv = process.argv.slice(2), want = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === "--rule") want.push(argv[++i]);
  const all = argv.includes("--all"), list = argv.includes("--list");
  const cfg = loadRules();
  if (list){
    for (const r of cfg.rules) console.log(`${r.active ? "active  " : "inactive"}  ${r.id.padEnd(26)} ${("activated by " + r.activatedBy).padEnd(18)} ${r.what}`);
    process.exit(0);
  }
  const unknown = want.filter(id => !cfg.rules.some(r => r.id === id));
  if (unknown.length){ console.log(`lint: no rule ${unknown.join(", ")} in qa/lint-rules.json`); process.exit(2); }
  const chosen = want.length ? cfg.rules.filter(r => want.includes(r.id)) : all ? cfg.rules : cfg.rules.filter(r => r.active);
  const cache = new Map(), results = [];
  let failing = 0;
  for (const r of chosen){
    const res = runRule(r, cfg, cache), counts = want.length || r.active;
    results.push({id: r.id, active: !!r.active, activatedBy: r.activatedBy, files: res.files, count: res.found.length, found: res.found});
    const state = res.found.length ? (counts ? "FAIL" : "would fail") : "pass";
    console.log(`${state.padEnd(10)} ${r.id} (${r.active ? "active" : "inactive until " + r.activatedBy}): ${res.found.length} finding${res.found.length === 1 ? "" : "s"} in ${res.files} file${res.files === 1 ? "" : "s"}`);
    // one line of output per source line, however many matches it holds
    const lines = [];
    for (const x of res.found){ const k = `${x.file}:${x.line}`, l = lines[lines.length - 1]; if (l && l.k === k) l.n++; else lines.push({k, n: 1, text: x.text}); }
    const cap = counts ? 200 : 12;
    for (const l of lines.slice(0, cap)) console.log(`    ${l.k}${l.n > 1 ? ` (${l.n} matches)` : ""}  ${l.text}`);
    if (lines.length > cap) console.log(`    ... and ${lines.length - cap} more lines`);
    if (counts && res.found.length) failing++;
  }
  const ok = failing === 0;
  console.log(`lint: ${chosen.length} rule${chosen.length === 1 ? "" : "s"} run, ${failing} failing${chosen.length < cfg.rules.length && !want.length && !all ? ` (${cfg.rules.length - chosen.length} inactive; --all to see them)` : ""}`);
  fs.mkdirSync(OUT, {recursive: true});
  fs.writeFileSync(path.join(OUT, "lint.json"), JSON.stringify({ok, rules: results}, null, 1));
  process.exit(ok ? 0 : 1);
}
