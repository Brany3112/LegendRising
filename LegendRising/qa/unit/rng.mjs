// qa/unit/rng.mjs: js/life/football/rng.js under plain node.
// Owner: WP-0D, contract DESIGN 1.4.9; acceptance 2.2 WP-0D (mulberry32 and hashStr against human.js:81-87, truncNormal).
//
//   node qa/unit/rng.mjs        exits 1 on any failed check; writes qa/out/unit-rng.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {mulberry32, hashStr, gauss, truncNormal, truncSd} from "../../js/life/football/rng.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const res = {name: "unit-rng", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};

// the originals, taken from human.js's own source so the comparison is against the code the game runs
const src = fs.readFileSync(path.join(ROOT, "js/life/human.js"), "utf8");
const rngSrc = src.match(/export function rng\(seed\)\{[\s\S]*?\n\}/);
const hashSrc = src.match(/export const hashStr = s => \{[^\n]*\};/);
check(!!rngSrc && !!hashSrc, "human.js rng and hashStr found");
const humanRng = new Function(rngSrc[0].replace("export ", "") + "\nreturn rng;")();
const humanHash = new Function(hashSrc[0].replace("export ", "") + "\nreturn hashStr;")();

for (const seed of [1, 42, 2026]){
  const a = mulberry32(seed), b = humanRng(seed);
  let same = 0;
  for (let i = 0; i < 1000; i++) if (a() === b()) same++;
  check(same === 1000, `mulberry32(${seed}) equals human.js rng for the first 1000 values`, same);
}
// edge seeds: zero, negative, beyond 32 bits all behave exactly like the original
for (const seed of [0, -7, 2**33 + 5, 0x9e3779b9]){
  const a = mulberry32(seed), b = humanRng(seed);
  let same = 0;
  for (let i = 0; i < 100; i++) if (a() === b()) same++;
  check(same === 100, `mulberry32(${seed}) equals the original`, same);
}
{
  // the first 1000 values of hashStr for 1000 strings of the shapes the game hashes (fixture key | career id | day)
  // and for arbitrary text, seeded from each of the three seeds
  let same = 0, n = 0;
  for (const seed of [1, 42, 2026]){
    const r = mulberry32(seed);
    for (let i = 0; i < 1000; i++){
      const len = Math.floor(r()*24);
      let s = "";
      for (let j = 0; j < len; j++) s += String.fromCharCode(32 + Math.floor(r()*(i % 3 ? 95 : 1200)));
      const key = i % 2 ? `fx${i}|c${Math.floor(r()*1e9)}|${i % 40}` : s;
      n++; if (hashStr(key) === humanHash(key)) same++;
    }
  }
  check(same === n, "hashStr equals human.js hashStr on 3000 strings", same);
  check(hashStr("") === humanHash("") && hashStr("é😀") === humanHash("é😀"), "hashStr on empty and non-ASCII strings");
}

// determinism and stream independence of gauss: a stream's values do not depend on other streams being used
{
  const a = mulberry32(9), b = mulberry32(9), c = mulberry32(10);
  const seqA = [], seqB = [];
  for (let i = 0; i < 50; i++){ seqA.push(gauss(a)); gauss(c); }
  for (let i = 0; i < 50; i++) seqB.push(gauss(b));
  check(seqA.every((v, i) => v === seqB[i]), "gauss is deterministic per stream and independent of other streams");
}
{
  const r = mulberry32(2026);
  let s = 0, s2 = 0;
  const N = 1e6;
  for (let i = 0; i < N; i++){ const g = gauss(r); s += g; s2 += g*g; }
  const mean = s/N, sd = Math.sqrt(s2/N - mean*mean);
  check(Math.abs(mean) < 0.005 && Math.abs(sd - 1) < 0.005, "gauss mean 0 and standard deviation 1 over 1e6 draws", {mean: +mean.toFixed(5), sd: +sd.toFixed(5)});
}

// truncNormal: never beyond cap*sigma in 1e6 samples, standard deviation within 2% of the truncated normal's theory
for (const [seed, sigma, cap] of [[1, 1, 2.5], [42, 0.37, 2.5], [2026, 2.2, 1.5]]){
  const r = mulberry32(seed), N = 1e6;
  let max = 0, s = 0, s2 = 0;
  for (let i = 0; i < N; i++){ const x = truncNormal(r, sigma, cap); const a = Math.abs(x); if (a > max) max = a; s += x; s2 += x*x; }
  const mean = s/N, sd = Math.sqrt(s2/N - mean*mean), theory = sigma*truncSd(cap);
  check(max <= cap*sigma, `truncNormal(sigma ${sigma}, cap ${cap}) never exceeds cap*sigma in 1e6 samples`, {max: +max.toFixed(6), limit: cap*sigma});
  check(Math.abs(sd/theory - 1) <= 0.02, `truncNormal(sigma ${sigma}, cap ${cap}) standard deviation within 2% of theory`, {sd: +sd.toFixed(5), theory: +theory.toFixed(5)});
}
check(Math.abs(truncSd(2.5) - 0.95460) < 1e-4 && Math.abs(truncSd(1) - 0.53956) < 1e-4, "truncated normal theory values", {c25: truncSd(2.5), c1: truncSd(1)});
check(truncNormal(mulberry32(1), 0) === 0, "truncNormal with sigma 0 is 0");

// purity (DESIGN 1.2, P): no Math.random, no globals of the classic game, no DOM
{
  const code = fs.readFileSync(path.join(ROOT, "js/life/football/rng.js"), "utf8").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
  const bad = [/Math\.random/, /\bS\./, /\bMT\b/, /\bA\./, /\bwindow\./, /\bdocument\./, /\bTHREE\b/, /^\s*import\b/m].filter(re => re.test(code)).map(String);
  check(!bad.length, "rng.js is pure", bad);
}

fs.mkdirSync(path.join(ROOT, "qa/out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa/out/unit-rng.json"), JSON.stringify(res, null, 1));
console.log(res.ok ? "rng: pass" : "rng: FAIL");
process.exit(res.ok ? 0 : 1);
