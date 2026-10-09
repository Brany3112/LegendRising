// qa/wpT1-text.mjs: the text sweep and the guards of WP-T1, checked under plain node.
// Owner: WP-T1 (DESIGN 2.3 WP-T1 acceptance; 1.8 text helpers and the no-dash rule; 3.10 text sweep rules; 1.3 trust).
//
//   node qa/wpT1-text.mjs      exits 1 on any failed check; writes qa/out/wpT1-text.json
//
// 1. nodash: no em dash in a player-facing string of any file WP-T1 owns (the sentinel line excepted).
// 2. sentinel: the leaderboard's board-slot sentinel (online.js, marked "nodash-ok: sentinel") is the same string that
//    js/ui/main.js compares against, so an account with no slot on its board row still reads as "no slot".
// 3. trust: no direct write to S.trust in the owned files (admin.js is the editor and sets it by design), and the
//    lint rule trust-writes finds nothing in the whole tree.
// 4. hours: no clock time written by hand in a string of the owned files; copy reads them from the constants.
// 5. older text from other players: undash() and boardRow() (online.js) turn a board row written by an older build into
//    the punctuation the game uses now, the same replacement the save migration applies (career.js textMigrate).
// 6. quick posts: every ready-made Showoff line still reads as the personality it was written for after the rewrite.
// 7. clothes: the admin panel's line about clothes is worked out from the clothing tiers themselves.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {lexJS, codeOnly, lineIndex} from "./jslex.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "qa", "out");
const EM = String.fromCharCode(0x2014), EN = String.fromCharCode(0x2013);
export const OWNED = ["js/awards.js", "js/social.js", "js/social_quick.js", "js/online.js", "js/firebase-config.js", "js/world.js",
  "js/ui/feed.js", "js/ui/office.js", "js/ui/apps_rank.js", "js/ui/apps_scout.js", "js/ui/apps_social.js", "js/ui/apps_stats.js",
  "js/ui/smart.js", "js/ui/phone.js", "js/ui/admin.js", "js/data/clothes.js", "js/life/phone.js", "js/life/jobs.js", "js/life/town.js",
  "js/life/units.js", "js/life/gymclub.js", "js/life/barber.js", "js/life/roads.js", "js/life/buildmode.js"];
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const checks = [];
const check = (name, ok, detail) => { checks.push({name, ok: !!ok, detail}); console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? ": " + detail : ""}`); };

// 1. nodash over the owned files
{
  const r = spawnSync(process.execPath, [path.join(ROOT, "qa", "nodash.mjs"), ...OWNED], {cwd: ROOT, encoding: "utf8"});
  const last = (r.stdout || "").trim().split("\n").pop();
  check("nodash 0 on the owned files", r.status === 0 && /^nodash: 0 em dashes/.test(last), last);
}

// 2. the sentinel, as written and as compared
{
  const onl = read("js/online.js").split("\n"), main = read("js/ui/main.js");
  const line = onl.find(l => /nodash-ok: sentinel/.test(l) && /boardSlot/.test(l)) || "";
  const set = (line.match(/board\.slot == null \? "([^"]*)"/) || [])[1];
  const cmp = (main.match(/boardSlot !== "([^"]*)"/) || [])[1];
  check("the board-slot sentinel is marked in online.js", !!line && set === EM, line.trim().slice(0, 120));
  check("main.js compares against the same sentinel", set != null && cmp === set, `online.js ${JSON.stringify(set)}, main.js ${JSON.stringify(cmp)}`);
}

// 3. trust only through trustAdd
{
  const direct = /\bS\s*\.\s*trust\s*(?:[-+*/]?=(?!=)|\+\+|--)|(?:\+\+|--)\s*S\s*\.\s*trust\b/;
  const hits = [];
  for (const f of OWNED.filter(f => f !== "js/ui/admin.js")){
    const code = codeOnly(read(f)).split("\n");
    code.forEach((l, i) => { if (direct.test(l)) hits.push(`${f}:${i + 1}`); });
  }
  check("no direct trust write in the owned files", hits.length === 0, hits.join(", ") || "routed through trustAdd");
  const r = spawnSync(process.execPath, [path.join(ROOT, "qa", "lint.mjs"), "--rule", "trust-writes"], {cwd: ROOT, encoding: "utf8"});
  check("lint rule trust-writes finds nothing", r.status === 0, (r.stdout || "").trim().split("\n")[0]);
}

// 4. no hand-written clock time in a string of the owned files
{
  const clock = /\b\d{1,2}(?::\d\d)?\s?(?:AM|PM)\b/i, hits = [];
  for (const f of OWNED){
    const src = read(f), L = lineIndex(src);
    for (const [a, b] of lexJS(src).strings){ const t = src.slice(a, b); if (clock.test(t)) hits.push(`${f}:${L.lineOf(a)} ${JSON.stringify(t.slice(0, 60))}`); }
  }
  check("hours in copy come from constants (no clock literal)", hits.length === 0, hits.join("; ") || "none written by hand");
  const gen = [["js/life/town.js", /fmtRange\(TOWN_HALL\.open, TOWN_HALL\.close\)/], ["js/life/barber.js", /fmtRange\(BARBER\.open, BARBER\.close\)/],
    ["js/life/gymclub.js", /fmtRange\(IRON\.open, IRON\.close\)/], ["js/life/gymclub.js", /fmtTime\(IRON\.open\)/]];
  const missing = gen.filter(([f, re]) => !re.test(read(f))).map(([f, re]) => `${f} ${re.source}`);
  check("the town hall, barber and gym hours are generated", missing.length === 0, missing.join("; ") || "fmtRange/fmtTime of their own constants");
}

// 5. other players' rows through the same replacement as the save migration
{
  const ctx = vm.createContext({EMPTY_CELL: EN, window: {}, console, clamp: (v, a, b) => Math.min(b, Math.max(a, v))});
  vm.runInContext(read("js/online.js"), ctx, {filename: "online.js"});
  const run = s => vm.runInContext(s, ctx);
  const row = run(`boardRow({uid:"u1", name:"Ion Popa", handle:"ionp", club:"Free agent", league:${JSON.stringify(EM)}, job:"Cafe ${EM} Barista",
    awardList:["Player of the Week ${EM} Liga 4", "Golden Boot ${EM} Liga 4 (21 goals)"], trophyList:["Cupa României"], score:812, money:1500})`);
  const flat = JSON.stringify(row);
  check("a board row from an older build has no em dash", !flat.includes(EM), flat.slice(0, 160));
  check("award names read as label: value", row.awardList[0] === "Player of the Week: Liga 4" && row.awardList[1] === "Golden Boot: Liga 4 (21 goals)", JSON.stringify(row.awardList));
  check("a lone dash becomes the empty-cell mark", row.league === EN, JSON.stringify(row.league));
  check("numbers and clean text are left alone", row.score === 812 && row.money === 1500 && row.name === "Ion Popa" && row.trophyList[0] === "Cupa României", "");
  // the save migration's own rule, on the same inputs (career.js textMigrate: spaced dash -> rep, lone dash -> EMPTY_CELL)
  const mig = (t, rep) => t.trim() === EM ? EN : t.replace(new RegExp(`\\s*${EM}\\s*`, "g"), rep).replace(new RegExp(EM, "g"), "-");
  const samples = [["Player of the Month (August) " + EM + " Liga 1", ": "], [EM, ": "], ["  " + EM + " ", ": "], ["A" + EM + "B", ": "], ["no dash here", ": "], ["News " + EM + " body", ". "]];
  const diff = samples.filter(([t, rep]) => run(`undash(${JSON.stringify(t)}, ${JSON.stringify(rep)})`) !== mig(t, rep));
  check("undash() gives what the save migration gives", diff.length === 0, diff.map(d => JSON.stringify(d[0])).join(", ") || `${samples.length} samples agree`);
  // careerSummary() of a save that this build never loaded uploads clean award names
  const sum = run(`careerSummary({player:{name:"A", age:20, pos:"ST", nat:"RO", number:9}, meId:0, W:{players:[{id:0, club:-1}], clubs:[], leagues:{}, season:2},
    skills:{a:50}, awards:[{name:"Player of the Week ${EM} Liga 4"}], trophies:[], careerMy:{}, seasonMy:{}})`);
  check("careerSummary cleans an unmigrated save's awards", sum && sum.awardList[0] === "Player of the Week: Liga 4" && sum.league === EN && sum.club === "Free agent", sum ? JSON.stringify({a: sum.awardList, l: sum.league, c: sum.club}) : "no summary");
}

// 6. the ready-made posts still read as their personality
{
  const ctx = vm.createContext({console});
  vm.runInContext(read("js/social.js"), ctx, {filename: "social.js"});
  vm.runInContext(read("js/social_quick.js"), ctx, {filename: "social_quick.js"});
  const r = vm.runInContext(`(() => { const bad = []; let n = 0, dash = 0;
    for (const [k, lines] of Object.entries(QP)){ const tone = k.split(".")[1];
      for (const l of lines){ n++; if (l.includes(${JSON.stringify(EM)})) dash++; const t = toneOf(l).tone; if (t !== tone) bad.push(k + " read as " + t + ": " + l); } }
    return {n, dash, bad}; })()`, ctx);
  check("every quick post reads as its own tone", r.bad.length === 0 && r.n > 150, `${r.n} lines${r.bad.length ? "; " + r.bad.slice(0, 4).join(" | ") : ""}`);
  check("no quick post carries an em dash", r.dash === 0, `${r.dash} with a dash`);
}

// 7. the clothes line in the admin panel, from the tiers
{
  const ctx = vm.createContext({console});
  vm.runInContext(read("js/data/clothes.js"), ctx, {filename: "clothes.js"});
  vm.runInContext(read("js/ui/admin.js"), ctx, {filename: "admin.js"});
  const line = vm.runInContext("clothesLine()", ctx);
  const total = vm.runInContext("SHOPS.reduce((s, sh) => s + CLOTHES_TIER[sh.tier].per*sh.items.length, 0)", ctx);
  check("the clothes line is worked out from CLOTHES_TIER and SHOPS",
    line === `Clothes give +0.25%, +0.5% or +1% each to reputation and followers. Unlocking them all is +${+(total*100).toFixed(2)}%.` && !line.includes(EM), line);
}

const ok = checks.every(c => c.ok);
fs.mkdirSync(OUT, {recursive: true});
fs.writeFileSync(path.join(OUT, "wpT1-text.json"), JSON.stringify({ok, checks}, null, 1));
console.log(ok ? "wpT1-text: pass" : "wpT1-text: FAIL");
process.exit(ok ? 0 : 1);
