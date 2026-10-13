// qa/tr2b-ai.mjs: the AI's shield, its challenges and the models it plans with follow TRAINING-SPEC section 3 (BUILD-PLAN
// Phase 2b, P2b-B acceptance "tr2b-ai"; AI-1, ball-4, ball-8).
// Owner: P2b-B (TR-2b).
//
// Node, three whole seeded matches of the real simulation (the harness's own configurations, qa/harness.mjs configFor),
// watched through the brain's hooks (ms.onDecide, onReach, onRecv, onTackle, onPress, onLoose) and the event log:
//   - the shield is offered (> 0) and chosen in at least 10% of the decisions made under pressure (press > 0.5);
//   - the AI challenges loose balls and 50/50s (tackles and slides at the ball itself);
//   - over 200 sampled pass candidates, the defender reach the pass model uses equals zone.R for that defender and that
//     ball within 1e-9, and the receiver's control rises with his zone.q (ground passes: never lower for a higher q);
//   - over 200 sampled AI tackle triggers, the reach used equals duel.standReach(tackling) within 1e-9;
//   - pressers facing a shielder choose both shield challenges and tackles, and over the three matches more than 0
//     challenges are resolved through sim.js's challenge path ('shieldChal' events);
//   - nothing NaN in the decisions' values.
// The harness bands are the harness's own run: node qa/harness.mjs --n 1000.
//
//   node qa/tr2b-ai.mjs [--seeds 1,2,3]        exits 1 on any failed check; writes qa/out/tr2b-ai.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {configFor} from "./harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "qa", "out");
const F = rel => pathToFileURL(path.join(ROOT, rel)).href;
const {createMatch, simStep} = await import(F("js/life/football/sim.js"));
const Z = await import(F("js/life/football/zone.js"));
const D = await import(F("js/life/football/duel.js"));

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const SEEDS = String(arg("seeds", "1,2,3")).split(",").map(Number);
const res = {name: "tr2b-ai", checks: [], ok: true};
const check = (pass, what, value) => {
  res.checks.push({name: what, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${what}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};

const S = {decisions: 0, pressed: 0, offered: 0, offeredPressed: 0, chosen: 0, chosenPressed: 0, nan: 0, kinds: {},
  reach: {n: 0, maxErr: 0}, recv: [], tackle: {n: 0, maxErr: 0}, press: {challenge: 0, tackle: 0}, loose: {tackle: 0, slide: 0},
  chal: 0, chalWon: 0, looseEv: 0, slides: 0};
// (three matches for everything; the tackle triggers' sample is topped up from further seeds when three gave fewer than
// 200 of them, and only that sample is taken from those)
const extra = [];
for (let k = 0, seedsAll = SEEDS.slice(); k < seedsAll.length; k++){
  const seed = seedsAll[k], more = k >= SEEDS.length;
  const ms = createMatch(configFor(seed));
  if (more){
    ms.onTackle = (a, c, o) => { if (S.tackle.n < 400){ S.tackle.n++; S.tackle.maxErr = Math.max(S.tackle.maxErr, Math.abs(o.reach - D.standReach(a.at.tackling))); } };
    let n = 0; while (ms.phase !== "over" && n++ < 200000 && S.tackle.n < 200) simStep(ms);
    extra.push(seed);
    if (S.tackle.n < 200 && seedsAll.length < SEEDS.length + 4) seedsAll.push(seed + 100);
    continue;
  }
  ms.onDecide = (a, opts, chosen, u, here, press) => {
    S.decisions++;
    for (const o of opts) if (!Number.isFinite(o.V)) S.nan++;
    const sh = opts.some(o => o.kind === "shield"), p = press > .5;
    if (sh) S.offered++;
    if (p){ S.pressed++; if (sh) S.offeredPressed++; }
    if (chosen && chosen.kind === "shield"){ S.chosen++; if (p) S.chosenPressed++; }
    if (chosen) S.kinds[chosen.kind] = (S.kinds[chosen.kind] || 0) + 1;
  };
  // (every 7th reach and receiver read, so the samples spread over the whole match)
  let kR = 0, kQ = 0;
  ms.onReach = (o, ball, r) => {
    if (kR++ % 7 || S.reach.n >= 400) return;
    const z = Z.R(o, ball, ms);
    S.reach.n++; S.reach.maxErr = Math.max(S.reach.maxErr, Math.abs(z - r));
  };
  ms.onRecv = (recv, q, rc, ground) => { if (ground && kQ++ % 5 === 0 && S.recv.length < 600) S.recv.push([q, rc]); };
  ms.onTackle = (a, c, o) => { if (S.tackle.n < 400){ S.tackle.n++; S.tackle.maxErr = Math.max(S.tackle.maxErr, Math.abs(o.reach - D.standReach(a.at.tackling))); } };
  ms.onPress = (a, c, o) => { S.press[o.choice] = (S.press[o.choice] || 0) + 1; };
  ms.onLoose = (a, kind) => { S.loose[kind] = (S.loose[kind] || 0) + 1; };
  let n = 0;
  while (ms.phase !== "over" && n++ < 200000) simStep(ms);
  for (const e of ms.events){
    if (e.kind === "shieldChal"){ S.chal++; if (e.won) S.chalWon++; }
    if (e.kind === "tackle" && e.loose) S.looseEv++;
    if (e.kind === "tackle" && e.type === "slide") S.slides++;
  }
  console.log(`seed ${seed}: ${n} steps, score ${ms.score.join("-")}`);
  if (k === SEEDS.length - 1 && S.tackle.n < 200) seedsAll.push(SEEDS[SEEDS.length - 1] + 100);
}
if (extra.length) console.log(`(tackle triggers topped up from seed ${extra.join(", ")})`);
// the receiver's control against his q: sorted by q, never lower for a higher q (within rounding)
S.recv.sort((a, b) => a[0] - b[0]);
let drops = 0;
for (let i = 1; i < S.recv.length; i++) if (S.recv[i][1] < S.recv[i - 1][1] - 1e-9) drops++;
const share = S.pressed ? S.chosenPressed/S.pressed : 0;
check(S.offered > 0, "the shield is offered", {offered: S.offered, underPressure: S.offeredPressed});
check(share >= .10, "the shield is chosen in at least 10% of the decisions made under pressure", {chosen: S.chosenPressed, pressed: S.pressed, share: +share.toFixed(3), kinds: S.kinds});
check(S.nan === 0, "no option is valued NaN", S.nan);
check(S.loose.tackle + S.loose.slide > 0 && S.looseEv > 0, "the AI challenges loose balls and 50/50s", {started: S.loose, logged: S.looseEv});
check(S.reach.n >= 200 && S.reach.maxErr <= 1e-9, "over 200 sampled pass candidates the defender reach is zone.R", S.reach);
check(S.recv.length >= 200 && drops === 0 && S.recv[S.recv.length - 1][1] > S.recv[0][1], "the receiver's control rises with his zone.q", {n: S.recv.length, drops, lo: S.recv[0], hi: S.recv[S.recv.length - 1]});
check(S.tackle.n >= 200 && S.tackle.maxErr <= 1e-9, "over 200 sampled AI tackle triggers the reach is duel.standReach(tackling)", S.tackle);
check(S.press.challenge > 0 && S.press.tackle > 0, "pressers facing a shielder choose both shield challenges and tackles", S.press);
check(S.chal > 0, "challenges on shielders are resolved through sim.js's challenge path", {challenges: S.chal, won: S.chalWon});
res.stats = S;
fs.mkdirSync(OUT, {recursive: true});
fs.writeFileSync(path.join(OUT, "tr2b-ai.json"), JSON.stringify(res, null, 1));
console.log(`tr2b-ai: ${res.checks.filter(c => c.pass).length} of ${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
