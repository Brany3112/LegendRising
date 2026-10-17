// qa/unit/ssg.mjs: the small-sided games' pure pieces under plain node (trainspec.js: bibKits, clockText, ssgResult,
// koTaker, isSSG, SSG, mateSlotsFor). Owner: UF2-B (user fix round 2). Contract: USER-ISSUES.md Round 2 U13 (the scoreboard's time
// and the result line), U15 (the bibs clearly apart from the club's kit by the U11 rule, the same every time) and U16
// (the kick-off's taker: the conceding side's AI man nearest the spot, never the player).
//
// The bibs are checked against every club kit of the game (js/data/clubs.js KITS), generated club kits (util.js kitOf:
// hsl hues) and the national kits, as qa/unit/kitclash.mjs does for match kits.
//
//   node qa/unit/ssg.mjs      exits 1 on any failed check; writes qa/out/unit-ssg.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import * as TS from "../../js/life/football/trainspec.js";
import {kitsClash, kitDelta, deltaE, KIT_SUM_MIN, resolveKits} from "../../js/life/football/kitclash.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const res = {name: "unit-ssg", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const r2 = v => Math.round(v*100)/100;

/* ---------- the bibs ---------- */
const src = fs.readFileSync(path.join(ROOT, "js/data/clubs.js"), "utf8");
const m = /const KITS = (\{[\s\S]*?\n\});/.exec(src);
const KITS = m ? Function(`return ${m[1]}`)() : {};
const kits = Object.entries(KITS).map(([n, k]) => [n, k]);
for (let h = 0; h < 360; h += 5) kits.push(["gen" + h, [`hsl(${h}, 62%, 42%)`, `hsl(${(h + 180)%360}, 55%, 92%)`]]);
for (const k of [["#ffd200", "#002b7f"], ["#ffffff", "#0b1f4d"], ["#c60b1e", "#ffc400"], ["#ffffff", "#111111"], ["#0a5ec2", "#ffffff"], ["#0b2a6b", "#ffffff"]]) kits.push(["nat" + k[0], k]);
check(kits.length > 120, "the kits to try: every club kit, generated kits all round the hue circle, national kits", kits.length);
const bad = [], used = {};
let worst = Infinity;
for (const [n, k] of kits){
  const B = TS.bibKits(k, "#d8ff3a");
  used[B.bib] = (used[B.bib] || 0) + 1;
  const d = kitDelta(B.mine, B.bibs);
  worst = Math.min(worst, d.shirt);
  if (kitsClash(B.mine, B.bibs) || d.shirt < KIT_SUM_MIN || B.d.shorts < TS.BIB_SHORTS_MIN) bad.push({n, k, bib: B.bib, shirt: r2(d.shirt), shorts: r2(B.d.shorts)});
  // the same club gives the same bibs every time (no change after a goal, a reset or the next block)
  const again = TS.bibKits(k, "#d8ff3a");
  if (again.bib !== B.bib || again.mine.join() !== B.mine.join()) bad.push({n, again: again.bib, first: B.bib});
  // and kitclash.js leaves them as they are (no clash to resolve), with the keepers clear of both
  const R = resolveKits({home: B.mine, away: B.bibs});
  if (R.awayChange !== "own") bad.push({n, change: R.awayChange});
}
check(!bad.length, `the bibs stand clearly apart from every club's kit (shirts at least ${KIT_SUM_MIN} apart by CIEDE2000, clear of the shorts too), the same every time`, {bad: bad.slice(0, 5), worst: r2(worst)});
check(Object.keys(used).length >= 2 && used["#d8ff3a"] > kits.length/2, "the kit man's neon bibs when they read, another bag of bibs when they do not", used);
{
  const green = TS.bibKits(["#1f8a3b", "#ffffff"], "#d8ff3a"), lime = TS.bibKits(["#c8f060", "#ffffff"], "#d8ff3a");
  check(lime.bib !== "#d8ff3a" && deltaE(lime.bib, "#c8f060") >= KIT_SUM_MIN, "a lime club kit gets bibs of another colour, not the lime ones", {bib: lime.bib, d: r2(deltaE(lime.bib, "#c8f060"))});
  check(deltaE(green.bib, "#1f8a3b") >= KIT_SUM_MIN, "a green club kit's bibs are far from green (the screenshot's green against lime)", {bib: green.bib, d: r2(deltaE(green.bib, "#1f8a3b"))});
  const none = TS.bibKits(null, null);
  check(none && none.mine[0] === "#2c66b8" && !kitsClash(none.mine, none.bibs), "no club kit known: the default kit and bibs that read against it", none && none.bib);
}

/* ---------- the scoreboard's clock and the result line ---------- */
check(TS.clockText(120) === "2:00" && TS.clockText(119.2) === "2:00" && TS.clockText(65) === "1:05" && TS.clockText(5) === "0:05" && TS.clockText(-3) === "0:00",
  "the time left reads m:ss, whole seconds rounded up", [TS.clockText(120), TS.clockText(119.2), TS.clockText(65), TS.clockText(5), TS.clockText(-3)]);
{
  const w = TS.ssgResult(3, 1), d = TS.ssgResult(2, 2), l = TS.ssgResult(0, 2);
  check(w.line === "Won 3-1" && w.won && d.line === "Drew 2-2" && d.drew && l.line === "Lost 0-2" && !l.won && w.sub === "You 3, Bibs 1",
    "how the game ended, in a few plain words", [w.line, d.line, l.line, w.sub]);
}

/* ---------- the kick-off's taker ---------- */
{
  const ag = [{id: 0, team: 0, isMe: true, onPitch: true, x: 0.5, z: 0}, {id: 1, team: 0, onPitch: true, x: -10, z: 4}, {id: 2, team: 0, onPitch: true, x: -4, z: -2},
    {id: 3, team: 0, isGK: true, onPitch: true, x: -1, z: 0}, {id: 4, team: 1, onPitch: true, x: 1, z: 1}, {id: 5, team: 0, onPitch: false, x: 0, z: 0}];
  check(TS.koTaker(ag, 0) === 2, "the conceding side's AI outfield man nearest the centre spot takes it (not the player, not the keeper, not a man off the pitch)", TS.koTaker(ag, 0));
  check(TS.koTaker(ag, 1) === 4, "the other side's: its own nearest man", TS.koTaker(ag, 1));
  check(TS.koTaker([{id: 0, team: 0, isMe: true, onPitch: true, x: 3, z: 0}], 0) === 0, "the player only when nobody else of his side can", 0);
  check(TS.koTaker([], 0) === -1, "nobody at all: none", -1);
}

/* ---------- which items are small-sided games, and the numbers ---------- */
check(TS.isSSG(TS.LESSONS.find(L => L.n === 6)) && TS.isSSG(TS.BLOCKS.find(B => B.kind === "ssg")) && !TS.isSSG(TS.BLOCKS[0]) && !TS.isSSG(TS.DRILLS.shoot) && TS.isSSG({ssg: true}),
  "Lesson 6 and the session's third block are small-sided games; the rondo and the drills are not; an item can say it is one");
check(TS.SSG.CELEB + TS.SSG.KO_LIMIT < TS.SSG.DEAD_MAX && TS.SSG.DEAD_MAX <= 6, "the kick-off is called and taken well inside the 6 s the restart may take", TS.SSG);
check(/bibs/.test(TS.LESSONS[5].line) && /bibs/.test(TS.BLOCKS[2].coach), "the coach says who is in the bibs", [TS.LESSONS[5].line, TS.BLOCKS[2].coach]);

// (UF2 round 1) four a side counting the keepers: one of yours in goal while the squad's keeper is in the other, and
// the three outfield men round you cover the back, the middle and the front (never a second man in your line)
{
  const lines = a => a.map(s => s === "GK" ? "GK" : ({CB: "B", RB: "B", LB: "B", CM: "M", CAM: "M", CDM: "M", ST: "F", LW: "F", RW: "F"})[s]).sort().join("");
  const L6 = TS.LESSONS[5], B3 = TS.BLOCKS[2], out = {};
  let ok = L6.mates + 1 === L6.opps + (L6.keeper ? 1 : 0) && B3.mates + 1 === B3.opps + (B3.keeper ? 1 : 0);
  for (const mine of ["ST", "LW", "CM", "CAM", "CB", "RB"]){
    const m = TS.mateSlotsFor(L6.mateSlots, mine, true, true), n = TS.mateSlotsFor(B3.mateSlots, mine, true, true);
    out[mine] = m.join();
    ok = ok && lines(m.concat(mine)) === "BFGKM" && m.join() === n.join() && m.filter(s => s === "GK").length === 1;
  }
  const gk = TS.mateSlotsFor(L6.mateSlots, "GK", true, true), none = TS.mateSlotsFor(L6.mateSlots, "ST", false, true), drill = TS.mateSlotsFor(["CM", "ST"], "ST", true, false);
  out.GK = gk.join(); out.noKeeper = none.join(); out.drill = drill.join();
  ok = ok && !gk.includes("GK") && lines(gk) === "BFM" && !none.includes("GK") && drill.join() === "CM,ST" && TS.mateSlotsFor(["GK", "CM"], "ST", false, false).join() === "CM,CM";
  check(ok, "a small-sided game is four a side counting the keepers: one of yours in goal, the others round you at the back, in the middle and up front (you in goal: nobody else is); no keeper lent, nobody in goal; a drill's slots stay as given", out);
}

fs.mkdirSync(path.join(ROOT, "qa/out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa/out/unit-ssg.json"), JSON.stringify(res, null, 1));
console.log(`unit-ssg: ${res.checks.filter(c => c.pass).length} of ${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
