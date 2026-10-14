// qa/unit/kitclash.mjs: js/life/football/kitclash.js under plain node (USER-ISSUES U11: two kits never the same or
// close colours; the away side to its alternate kit, then to a generated one; keepers and referee clear of all of it).
// Owner: UF-B (stage TR-3+U). Contract: USER-ISSUES.md U11.
//
// Checks CIEDE2000 against the published test pairs (Sharma, Wu and Dalal 2005), then resolves every pairing of the
// game's own club kits (js/data/clubs.js KITS), the national kits (match.js natKit), generated club kits (util.js kitOf:
// hsl hues) and the training bibs, both ways round, and asserts every final pair is above the thresholds, with the
// purple against blue pairs the user saw named on their own.
//
//   node qa/unit/kitclash.mjs      exits 1 on any failed check; writes qa/out/unit-kitclash.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {de00, deltaE, lab, rgb, hexOf, kitDelta, kitsClash, resolveKits, KIT_SHIRT_MIN, KIT_SUM_MIN, GK_MIN, REF_MIN} from "../../js/life/football/kitclash.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const res = {name: "unit-kitclash", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const r2 = v => Math.round(v*100)/100;

/* ---------- CIEDE2000: the published test data ---------- */
{
  const T = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425], [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.8361, -74.0200], [50, 0, -82.7485], 3.4412], [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0000],
    [[50, 0, 0], [50, -1, 2], 2.3669], [[50, 2.49, -.001], [50, -2.49, .0009], 7.1792], [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[50, 2.5, 0], [58, 24, 15], 19.4535], [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.2630], [[35.0831, -44.1164, 3.7933], [35.0232, -40.0716, 1.5901], 1.8645],
    [[22.7233, 20.0904, -46.6940], [23.0331, 14.9730, -42.5619], 2.0373], [[90.8027, -2.0831, 1.4410], [91.1528, -1.6435, .0447], 1.4441]];
  let worst = 0;
  for (const [a, b, want] of T){ const got = de00(a, b), back = de00(b, a); worst = Math.max(worst, Math.abs(got - want), Math.abs(back - want)); }
  check(worst < 1e-3, "CIEDE2000 matches the published test pairs (both ways round) within 0.001", r2(worst*1000)/1000);
  const w = lab("#ffffff"), k = lab("#000000");
  check(Math.abs(w[0] - 100) < .01 && Math.abs(w[1]) < .01 && Math.abs(w[2]) < .01 && Math.abs(k[0]) < .01, "white is L 100, black is L 0 (D65)", {w, k});
  check(hexOf("hsl(270, 62%, 42%)") === "#6b29ae" && hexOf("#abc") === "#aabbcc" && hexOf(0x1c1d21) === "#1c1d21" && rgb("nonsense") === null, "colours read: hsl(), #rgb, numbers, unreadable", hexOf("hsl(270, 62%, 42%)"));
}

/* ---------- the game's kits ---------- */
const clubsSrc = fs.readFileSync(path.join(ROOT, "js/data/clubs.js"), "utf8");
const m = /const KITS = (\{[\s\S]*?\n\});/.exec(clubsSrc);
const KITS = m ? Function(`return ${m[1]}`)() : {};
check(Object.keys(KITS).length > 50, "the club kits read from js/data/clubs.js", Object.keys(KITS).length);
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0)/4294967295; };
const genKit = name => { const h = Math.floor(hash(name)*360); return [`hsl(${h}, 62%, 42%)`, `hsl(${(h + 180)%360}, 55%, 92%)`]; };
const NAT = {RO: ["#ffd200", "#002b7f"], EN: ["#ffffff", "#0b1f4d"], ES: ["#c60b1e", "#ffc400"], DE: ["#ffffff", "#111111"], IT: ["#0a5ec2", "#ffffff"], FR: ["#0b2a6b", "#ffffff"]};
const kits = new Map();
for (const v of Object.values(KITS)) kits.set(v.join(","), v);
for (let h = 0; h < 360; h += 7) kits.set("gen" + h, [`hsl(${h}, 62%, 42%)`, `hsl(${(h + 180)%360}, 55%, 92%)`]);
for (const n of ["Dinamo Nord", "Rapid Vest", "Olimpia Sud", "Atletic Est", "Unirea Centru"]) kits.set(n, genKit(n));
for (const v of Object.values(NAT)) kits.set("n" + v.join(","), v);
const all = [...kits.values()];
// the training bibs (acts.js kits(): the club kit at home, neon bibs over the club's shorts)
const bibs = Object.values(KITS).map(k => ({home: [k[0], k[1]], away: ["#d8ff3a", k[1]]}));

/* ---------- purple against blue, and the other near pairs the palette has ---------- */
{
  const named = [["purple v blue", ["#6b1f7a", "#ffffff"], ["#1b3fa0", "#ffffff"]], ["purple v indigo", ["#6b1f7a", "#ffffff"], ["#3b2f8f", "#e8c34a"]],
    ["blue v blue", ["#1b3fa0", "#ffffff"], ["#1e40af", "#ffffff"]], ["teal v sky blue", ["#0f6f87", "#ffffff"], ["#2f6fd0", "#101c3a"]],
    ["red v crimson", ["#d7182a", "#ffffff"], ["#b0132e", "#101010"]], ["maroon v maroon", ["#8c1230", "#f2d9a0"], ["#7a0f25", "#ffffff"]],
    ["generated purple v generated blue", ["hsl(270, 62%, 42%)", "hsl(90, 55%, 92%)"], ["hsl(235, 62%, 42%)", "hsl(55, 55%, 92%)"]]];
  for (const [nm, a, b] of named){
    const before = kitDelta(a, b), R = resolveKits({home: a, away: b}), after = kitDelta(R.home, R.away);
    check(kitsClash(a, b) && !kitsClash(R.home, R.away) && after.shirt >= KIT_SHIRT_MIN,
      `${nm}: seen as a clash (shirts ${r2(before.shirt)} apart) and separated (${R.awayChange}: ${R.away.join("/")}, shirts ${r2(after.shirt)} apart)`, {before: r2(before.shirt), after: r2(after.shirt), change: R.awayChange});
  }
  const ok = resolveKits({home: ["#d7182a", "#ffffff"], away: ["#1b3fa0", "#ffffff"]});
  check(ok.awayChange === "own" && ok.away[0] === "#1b3fa0", "red against blue is no clash: the away side keeps its own kit", ok.awayChange);
  const same = resolveKits({home: ["#ffffff", "#111111"], away: ["#ffffff", "#0b1f4d"]});
  check(same.awayChange === "alt" && same.away[0] === "#0b1f4d" && !kitsClash(same.home, same.away), "white against white: the away side turns out in its alternate (navy shirt, white shorts)", {change: same.awayChange, away: same.away});
  const gen = resolveKits({home: ["#d7182a", "#ffffff"], away: ["#c60b1e", "#e2582a"]});
  check(gen.awayChange === "generated" && !kitsClash(gen.home, gen.away), "red against red with orange shorts: the alternate (orange) is still close, so a generated kit", {change: gen.awayChange, away: gen.away, d: r2(kitDelta(gen.home, gen.away).shirt)});
}

/* ---------- every pairing, both ways round ---------- */
{
  let n = 0, clashes = 0, alt = 0, gen = 0, minShirt = Infinity, minSum = Infinity, minGk = Infinity, minRef = Infinity, worst = null, bad = [];
  const one = (home, away) => {
    const R = resolveKits({home, away}); n++;
    if (kitsClash(home, away)) clashes++;
    if (R.awayChange === "alt") alt++; else if (R.awayChange === "generated") gen++;
    const d = kitDelta(R.home, R.away);
    if (d.shirt < minShirt){ minShirt = d.shirt; worst = {home, away, final: R.away}; }
    minSum = Math.min(minSum, d.sum); minGk = Math.min(minGk, R.d.gk); minRef = Math.min(minRef, R.d.ref);
    if (kitsClash(R.home, R.away) || R.d.gk < GK_MIN || R.d.ref < REF_MIN) bad.push({home, away, R});
    // the home side never changes
    if (R.home[0] !== hexOf(home[0]) || R.home[1] !== hexOf(home[1])) bad.push({home, away, why: "home changed"});
  };
  for (const a of all) for (const b of all) one(a, b);
  for (const k of bibs) one(k.home, k.away);
  console.log(`  ${n} pairings: ${clashes} clashed as given, ${alt} took the alternate kit, ${gen} a generated one`);
  check(bad.length === 0, `every final pair is clear: shirts >= ${KIT_SHIRT_MIN}, shirts plus shorts >= ${KIT_SUM_MIN}, keepers >= ${GK_MIN}, referee >= ${REF_MIN} (CIEDE2000)`,
    {bad: bad.length, first: bad[0] ? {home: bad[0].home, away: bad[0].away, d: bad[0].R && bad[0].R.d} : null});
  check(minShirt >= KIT_SHIRT_MIN && minSum >= KIT_SUM_MIN, "the closest final pair of shirts", {minShirt: r2(minShirt), minSum: r2(minSum), worst});
  check(minGk >= GK_MIN && minRef >= REF_MIN, "the closest keeper and referee colours", {gk: r2(minGk), ref: r2(minRef)});
  check(clashes > 0 && alt > 0 && gen > 0, "the palette does produce clashes, and both remedies are used", {clashes, alt, gen});
  res.stats = {n, clashes, alt, gen, minShirt: r2(minShirt), minSum: r2(minSum), minGk: r2(minGk), minRef: r2(minRef)};
}

/* ---------- determinism and robustness ---------- */
{
  const a = resolveKits({home: ["#6b1f7a", "#fff"], away: ["#1b3fa0", "#fff"]}), b = resolveKits({home: ["#6b1f7a", "#fff"], away: ["#1b3fa0", "#fff"]});
  check(JSON.stringify(a) === JSON.stringify(b), "the same kits resolve the same way every time");
  const z = resolveKits({});
  check(z.home && z.away && !kitsClash(z.home, z.away) && z.gk.length === 2 && z.ref, "missing kits fall back to the default pair", z.away);
  const g = resolveKits({home: ["nonsense", null], away: [0x2c66b8, 0xffffff]});
  check(/^#[0-9a-f]{6}$/.test(g.home[0]) && /^#[0-9a-f]{6}$/.test(g.away[0]), "an unreadable kit falls back; numbers are read", g);
  check(deltaE("#123456", "#123456") === 0, "a colour is 0 from itself");
}

fs.mkdirSync(path.join(ROOT, "qa/out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa/out/unit-kitclash.json"), JSON.stringify(res, null, 1));
console.log(res.ok ? "unit-kitclash: all passed" : "unit-kitclash: FAILED");
process.exit(res.ok ? 0 : 1);
