// qa/nodash.mjs: the no-em-dash gate for player-facing text.
// Owner: WP-0B (DESIGN 1.8 text helpers and the no-dash rule, 3.10 text sweep, 4.11 integrity checks).
//
// Player-facing text is every JS string and template literal in js/**/*.js (comments ignored), the text, inline
// scripts and the title, placeholder, aria-label and alt attributes of index.html, and CSS content: values in css/*.css.
// No U+2014 (em dash) may appear in it. The one exception is the internal leaderboard sentinel (js/online.js, compared
// in js/ui/main.js), allowed on a line that carries the marker "nodash-ok" (DESIGN 1.8: "// nodash-ok: sentinel").
//
//   node qa/nodash.mjs                       the whole scope; prints every em dash found, exits 1 if there is any
//   node qa/nodash.mjs js/util.js index.html only these files (directories are walked); same output and exit code
//   node qa/nodash.mjs --report              the full list in the I0 baseline's format (qa/out/nodash-report.txt),
//                                            checked against qa/golden/nodash-baseline.txt: the scanner run on the
//                                            commit that recorded the baseline must reproduce it exactly, and every
//                                            string in this tree is either in the baseline or reported as new.
//                                            Exits 1 when the baseline is not reproduced or a new dash string appeared.
//   --rev <commit>                           scan that git revision instead of the working tree
//   --json                                   also print the result as JSON
//
// Writes qa/out/nodash.json (and qa/out/nodash-report.txt with --report).
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {lexJS, lineIndex} from "./jslex.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const EM = String.fromCharCode(0x2014);
export const BASELINE = path.join(ROOT, "qa", "golden", "nodash-baseline.txt");
const OUT = path.join(ROOT, "qa", "out");
const MARK = "nodash-ok";

/* ---------- where files come from: the working tree or a git revision ---------- */
export function diskSource(root = ROOT){
  const all = [];
  const walk = d => { for (const f of fs.readdirSync(path.join(root, d))){ const rel = d ? d + "/" + f : f, st = fs.statSync(path.join(root, rel)); if (st.isDirectory()){ if (f !== ".git" && f !== "node_modules" && f !== "vendor" && f !== "qa") walk(rel); } else all.push(rel); } };
  walk("");
  return {name: "the working tree", files: all.sort(), read: rel => fs.readFileSync(path.join(root, rel), "utf8")};
}
function git(args, input){
  const r = spawnSync("git", args, {cwd: ROOT, input, maxBuffer: 1 << 28});
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${String(r.stderr || r.error || "").trim()}`);
  return r.stdout;
}
export function gitSource(rev){
  const prefix = git(["rev-parse", "--show-prefix"]).toString().trim();
  const sha = git(["rev-parse", "--short", rev + "^{commit}"]).toString().trim();
  const files = git(["ls-tree", "-r", "--name-only", "--full-tree", sha]).toString().split("\n")
    .filter(f => f && f.startsWith(prefix)).map(f => f.slice(prefix.length)).sort();
  const want = files.filter(inScope);
  // every file in one git process: cat-file --batch prints "<sha> blob <size>\n<bytes>\n" per request
  const buf = git(["cat-file", "--batch"], want.map(f => `${sha}:${prefix}${f}`).join("\n") + "\n");
  const text = {};
  let at = 0;
  for (const f of want){
    const nl = buf.indexOf(10, at), head = buf.slice(at, nl).toString().split(" ");
    if (head[1] === "missing") throw new Error(`git cat-file: ${f} missing at ${sha}`);
    const size = +head[2];
    text[f] = buf.slice(nl + 1, nl + 1 + size).toString("utf8");
    at = nl + 1 + size + 1;
  }
  return {name: `the tree at ${sha}`, sha, files, read: rel => { if (!(rel in text)) throw new Error(`${rel} is not in ${sha}`); return text[rel]; }};
}

// the scope of DESIGN 1.8, and which scanner reads each file
const kindOf = rel => /\.(m?js)$/.test(rel) ? "js" : /\.html?$/.test(rel) ? "html" : /\.css$/.test(rel) ? "css" : null;
export function inScope(rel){ return rel === "index.html" || (/^css\/[^/]+$/.test(rel)) || (/^js\/.+\.js$/.test(rel)); }
// the files of the whole scope, in the baseline's order: js/**/*.js, then index.html, then css/*.css
function scopeFiles(src){
  return [...src.files.filter(f => /^js\/.+\.js$/.test(f)), "index.html", ...src.files.filter(f => /^css\/[^/]+\.css$/.test(f))].filter(f => src.files.includes(f));
}

/* ---------- scanning ---------- */
const show = t => t.replace(/\s+/g, " ").trim().replace(new RegExp(EM, "g"), "\\u2014");
// the leaderboard sentinel: a lone dash on a line that is about the board slot, or any line marked nodash-ok
const isSentinel = (t, line) => line.includes(MARK) || (t === EM && /\bboardSlot\b/.test(line));

// string segments [a, b) of one file, by kind
function segmentsOf(kind, src){
  if (kind === "js") return lexJS(src).strings;
  const segs = [];
  if (kind === "html"){
    const masked = src.replace(/<!--[\s\S]*?-->/g, m => " ".repeat(m.length));
    for (const m of masked.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)){
      const off = m.index + m[0].indexOf(m[1]);
      for (const [a, b] of lexJS(m[1]).strings) segs.push([a + off, b + off]);
    }
    const noScript = masked.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, m => " ".repeat(m.length));
    for (const m of noScript.matchAll(/\s(title|placeholder|aria-label|alt)\s*=\s*("([^"]*)"|'([^']*)')/g)){
      const v = m[3] != null ? m[3] : m[4], a = m.index + m[0].indexOf(v); segs.push([a, a + v.length]);
    }
    for (const m of noScript.matchAll(/>([^<]+)</g)){ const a = m.index + 1; segs.push([a, a + m[1].length]); }
  } else if (kind === "css"){
    const masked = src.replace(/\/\*[\s\S]*?\*\//g, m => " ".repeat(m.length));
    for (const m of masked.matchAll(/content\s*:\s*("([^"]*)"|'([^']*)')/g)){
      const v = m[2] != null ? m[2] : m[3], a = m.index + m[0].indexOf(v); segs.push([a, a + v.length]);
    }
  }
  return segs;
}

// every player-facing string with an em dash in one file:
// {file, line, dashes, cls, text, at: [{line, ok}] one per dash (ok: its line carries the nodash-ok marker)}
export function scanFile(rel, src){
  const kind = kindOf(rel); if (!kind || !src.includes(EM)) return [];
  const L = lineIndex(src), rows = [];
  // in HTML a text run can span a comment (text, comment, text): read it with the comments blanked, which keeps every
  // offset and line where it was
  const read = kind === "html" ? src.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, " ")) : src;
  for (const [a, b] of segmentsOf(kind, src)){
    const t = read.slice(a, b); if (!t.includes(EM)) continue;
    const line = L.lineOf(a), at = [];
    for (let k = t.indexOf(EM); k >= 0; k = t.indexOf(EM, k + 1)){ const ln = L.lineOf(a + k); at.push({line: ln, ok: L.lineText(ln).includes(MARK)}); }
    const cls = isSentinel(t, L.lineText(line)) ? "sentinel" : t === EM ? "placeholder" : "sentence";
    rows.push({file: rel, line, dashes: at.length, cls, text: show(t).slice(0, 220), at});
  }
  return rows;
}
export function scan(src, files = scopeFiles(src)){
  const rows = [];
  for (const f of files) rows.push(...scanFile(f, src.read(f)));
  rows.sort((x, y) => x.file < y.file ? -1 : x.file > y.file ? 1 : x.line - y.line);
  return rows;
}
// every U+2014 in the scope's files, strings or not (the baseline's "every other one is in a comment" line)
function rawCount(src){
  let n = 0;
  for (const f of [...src.files.filter(f => /^js\/.+\.js$/.test(f)), "index.html", ...src.files.filter(f => /^css\/[^/]+$/.test(f))])
    if (src.files.includes(f)) n += src.read(f).split(EM).length - 1;
  return n;
}

/* ---------- the baseline format (qa/golden/nodash-baseline.txt) ---------- */
export const rowLine = r => `${r.file}:${r.line}\t${r.dashes}\t${r.cls}\t${r.text}`;
export function totals(rows){
  const sum = c => rows.filter(r => !c || r.cls === c).reduce((a, r) => a + r.dashes, 0), cnt = c => rows.filter(r => !c || r.cls === c).length;
  return {all: sum(), strings: cnt(), sentence: sum("sentence"), sentenceStrings: cnt("sentence"), placeholder: sum("placeholder"), sentinel: sum("sentinel")};
}
const totalsLine = t => `# Totals: ${t.all} U+2014 in ${t.strings} strings. sentence ${t.sentence} in ${t.sentenceStrings} strings, placeholder ${t.placeholder}, sentinel ${t.sentinel}.`;
function reportText(src, rows){
  const t = totals(rows), raw = rawCount(src);
  return [
    `# Player-facing strings that contain U+2014 (em dash) in ${src.name}.`,
    "# Written by qa/nodash.mjs --report (WP-0B) in the format of the I0 baseline, qa/golden/nodash-baseline.txt.",
    "# Scope (DESIGN 1.8): JS string and template literals in js/**/*.js (comments ignored), HTML text, inline scripts and the",
    "# title, placeholder, aria-label and alt attributes in index.html, and CSS content: values in css/*.css.",
    "# Each line: file:line, then the number of U+2014 in that string, its class, and the string with every U+2014 written as \\u2014.",
    "# Classes: sentence (a dash inside a sentence or a label, or joining two), placeholder (the string is the dash alone: an empty cell),",
    "# sentinel (the placeholder that js/online.js sets and js/ui/main.js compares; allowed once marked nodash-ok).",
    totalsLine(t),
    `# Player-facing sentence and label dashes (the sweep target): ${t.sentence}. Every other U+2014 in these files (${raw - t.all}) is in a comment.`,
    ...rows.map(rowLine)
  ].join("\n") + "\n";
}
export function readBaseline(file = BASELINE){
  const txt = fs.readFileSync(file, "utf8").split("\n");
  const rows = txt.filter(l => l && !l.startsWith("#")).map(l => {
    const [loc, dashes, cls, ...rest] = l.split("\t"), k = loc.lastIndexOf(":");
    return {file: loc.slice(0, k), line: +loc.slice(k + 1), dashes: +dashes, cls, text: rest.join("\t"), raw: l};
  });
  const tl = txt.find(l => l.startsWith("# Totals:")) || "";
  return {rows, totalsLine: tl};
}

// match this tree's rows against the baseline's: the same string in the same file (it may have moved lines), then
// the same string anywhere (moved to another file, as when world.js was split), else new; what is left is fixed
export function compare(base, rows){
  const key = r => `${r.file}\u0000${r.cls}\u0000${r.text}`, tkey = r => `${r.cls}\u0000${r.text}`;
  const pool = new Map(), tpool = new Map();
  base.forEach((r, i) => { (pool.get(key(r)) || pool.set(key(r), []).get(key(r))).push(i); (tpool.get(tkey(r)) || tpool.set(tkey(r), []).get(tkey(r))).push(i); });
  const used = new Set(), kept = [], moved = [], fresh = [];
  const take = (m, k) => { const l = m.get(k) || []; while (l.length){ const i = l.shift(); if (!used.has(i)){ used.add(i); return i; } } return -1; };
  const later = [];
  for (const r of rows){ const i = take(pool, key(r)); if (i >= 0) kept.push(r); else later.push(r); }
  for (const r of later){ const i = take(tpool, tkey(r)); if (i >= 0) moved.push({row: r, from: base[i]}); else fresh.push(r); }
  const fixed = base.filter((r, i) => !used.has(i));
  return {kept, moved, fresh, fixed};
}

// the commit that last wrote the baseline file (where the scanner has to reproduce it exactly)
function baselineCommit(){
  try { return git(["log", "-1", "--format=%h", "--", path.relative(ROOT, BASELINE)]).toString().trim() || null; }
  catch(e){ return null; }
}

/* ---------- command line ---------- */
function resolveArgs(list){
  const out = new Set();
  for (const a of list){
    const abs = path.resolve(process.cwd(), a), rel = path.relative(ROOT, abs).split(path.sep).join("/");
    if (rel.startsWith("..")) throw new Error(`${a} is outside the game (${ROOT})`);
    if (!fs.existsSync(abs)) throw new Error(`${a} does not exist`);
    if (fs.statSync(abs).isDirectory()){
      const walk = d => { for (const f of fs.readdirSync(path.join(ROOT, d)).sort()){ const r = d ? d + "/" + f : f; if (fs.statSync(path.join(ROOT, r)).isDirectory()) walk(r); else if (kindOf(r)) out.add(r); } };
      walk(rel === "" ? "" : rel);
    } else if (kindOf(rel)) out.add(rel);
    else throw new Error(`${a}: not a .js, .mjs, .html or .css file`);
  }
  return [...out];
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain){
  const argv = process.argv.slice(2);
  const flag = f => { const i = argv.indexOf(f); if (i >= 0){ argv.splice(i, 1); return true; } return false; };
  const opt = f => { const i = argv.indexOf(f); if (i >= 0){ const v = argv[i + 1]; argv.splice(i, 2); return v; } return null; };
  const report = flag("--report"), asJson = flag("--json"), rev = opt("--rev");
  let code = 0;
  const res = {mode: report ? "report" : "check"};
  try {
    const src = rev ? gitSource(rev) : diskSource();
    const files = argv.length ? resolveArgs(argv) : null;
    if (files && rev) throw new Error("--rev scans the whole scope; leave the file list out");
    const rows = scan(src, files || undefined);
    res.source = src.name; res.files = files || "scope"; res.totals = totals(rows);
    if (!report){
      // the gate: every em dash in a player-facing string, except on a line marked nodash-ok
      const bad = rows.filter(r => r.at.some(d => !d.ok));
      const n = bad.reduce((a, r) => a + r.at.filter(d => !d.ok).length, 0), allowed = rows.reduce((a, r) => a + r.at.filter(d => d.ok).length, 0);
      for (const r of bad) console.log(`${r.file}:${r.at.find(d => !d.ok).line}\t${r.cls}\t${r.text}`);
      const where = files ? `${argv.join(", ")}: ${files.length} file${files.length === 1 ? "" : "s"}` : "index.html, css/*.css and js/**/*.js";
      console.log(`nodash: ${n} em dash${n === 1 ? "" : "es"} in ${bad.length} player-facing string${bad.length === 1 ? "" : "s"} (${where}, in ${src.name})${allowed ? `; ${allowed} allowed on nodash-ok lines` : ""}`);
      Object.assign(res, {count: n, strings: bad.length, allowed, rows: bad.map(r => ({file: r.file, line: r.at.find(d => !d.ok).line, cls: r.cls, text: r.text}))});
      code = n ? 1 : 0;
    } else {
      if (files) throw new Error("--report covers the whole scope; leave the file list out");
      fs.mkdirSync(OUT, {recursive: true});
      const outFile = path.join(OUT, rev ? `nodash-report-${src.sha}.txt` : "nodash-report.txt");
      fs.writeFileSync(outFile, reportText(src, rows));
      const base = readBaseline(), bt = totals(base.rows);
      // 1. the scanner reproduces the I0 baseline on the tree it was recorded from
      const at = baselineCommit();
      let repro = {commit: at, ok: null, note: ""};
      if (at){
        const brows = scan(gitSource(at)), got = brows.map(rowLine), want = base.rows.map(r => r.raw);
        const miss = want.filter(l => !got.includes(l)), extra = got.filter(l => !want.includes(l));
        const same = got.length === want.length && got.every((l, i) => l === want[i]) && totalsLine(totals(brows)) === base.totalsLine;
        repro = {commit: at, ok: same, strings: brows.length, totals: totals(brows), missing: miss, extra};
      } else repro.note = "git history is not available here, so the baseline could not be re-scanned";
      // 2. this tree against the baseline
      const cmp = compare(base.rows, rows), t = totals(rows), dsum = l => l.reduce((a, r) => a + (r.row || r).dashes, 0);
      console.log(`I0 baseline (${path.relative(ROOT, BASELINE)}): ${bt.sentence} sentence dashes in ${bt.sentenceStrings} strings; ${bt.all} U+2014 in ${bt.strings} strings with ${bt.placeholder} placeholders and ${bt.sentinel} sentinels.`);
      if (repro.ok === true) console.log(`Reproduced: scanning the tree at ${repro.commit} (the commit that recorded the baseline) gives the same ${repro.strings} strings line for line: ${repro.totals.sentence} sentence dashes, ${repro.totals.all} in all.`);
      else if (repro.ok === false){
        console.log(`NOT reproduced: the tree at ${repro.commit} gives ${repro.totals.sentence} sentence dashes in ${repro.totals.sentenceStrings} strings (${repro.totals.all} in all).`);
        for (const l of repro.missing.slice(0, 20)) console.log("  in the baseline only: " + l);
        for (const l of repro.extra.slice(0, 20)) console.log("  in the re-scan only:  " + l);
      } else console.log(`Baseline re-scan skipped: ${repro.note}.`);
      console.log(`${src.name[0].toUpperCase() + src.name.slice(1)}: ${t.sentence} sentence dashes in ${t.sentenceStrings} strings; ${t.all} U+2014 in ${t.strings} strings (${t.placeholder} placeholders, ${t.sentinel} sentinels).`);
      console.log(`Against the baseline: ${cmp.kept.length} strings unchanged, ${cmp.moved.length} moved to another file, ${cmp.fixed.length} fixed (${dsum(cmp.fixed)} dashes), ${cmp.fresh.length} new (${dsum(cmp.fresh)} dashes). Baseline accounted for: ${dsum(cmp.kept) + dsum(cmp.moved) + dsum(cmp.fixed)} of ${bt.all}.`);
      for (const r of cmp.fixed) console.log(`  fixed: ${rowLine(r)}`);
      for (const m of cmp.moved) console.log(`  moved: ${m.from.file}:${m.from.line} -> ${m.row.file}:${m.row.line}\t${m.row.text}`);
      for (const r of cmp.fresh) console.log(`  NEW:   ${rowLine(r)}`);
      console.log(`Full list: ${path.relative(ROOT, outFile)}`);
      Object.assign(res, {baseline: bt, reproduced: repro, kept: cmp.kept.length, moved: cmp.moved.map(m => ({from: `${m.from.file}:${m.from.line}`, to: `${m.row.file}:${m.row.line}`, text: m.row.text})),
        fixed: cmp.fixed.map(rowLine), fresh: cmp.fresh.map(rowLine), file: path.relative(ROOT, outFile)});
      code = repro.ok === false || cmp.fresh.length ? 1 : 0;
    }
  } catch(e){ console.log("nodash: " + (e && e.message || e)); res.error = String(e && e.message || e); code = 2; }
  res.ok = code === 0;
  fs.mkdirSync(OUT, {recursive: true});
  fs.writeFileSync(path.join(OUT, report ? "nodash-report.json" : "nodash.json"), JSON.stringify(res, null, 1));
  if (asJson) console.log(JSON.stringify(res, null, 1));
  process.exit(code);
}
