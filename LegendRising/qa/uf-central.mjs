// qa/uf-central.mjs: where the AI shoots from (USER-ISSUES U9: "they don't shoot from the middle"). Plays N seeded
// harness matches (qa/harness.mjs configFor: the same pairs, tempo and stand-in as the acceptance run) on worker threads
// and sorts every shot by where it was struck: central (within 11 m of the pitch's long axis, the width of the box's
// D and a little more) or wide, inside the box or outside it, and how far. It also reports, for every AI carrier's
// decision from a central spot 12 to 28 m from goal, whether a shot was among his options and whether he took it.
// Owner: UF-B (stage TR-3+U). Contract: USER-ISSUES.md U9 (shots from central areas; the harness bands kept).
//
//   node qa/uf-central.mjs --n 200 [--from 1] [--root <a game root>] [--min-central 0.6]
//   writes qa/out/uf-central.json under the game root it ran; exits 1 when the AI's central share of shots is below
//   --min-central, or when a match fails
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {fileURLToPath, pathToFileURL} from "node:url";
import {Worker, isMainThread, parentPort, workerData} from "node:worker_threads";

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (!isMainThread && workerData && workerData.ufCentral){
  const {root, seeds} = workerData;
  const F = rel => pathToFileURL(path.join(root, rel)).href;
  const H = await import(F("js/life/football/harness.js"));
  const {createMatch, simStep} = await import(F("js/life/football/sim.js"));
  const {configFor} = await import(F("qa/harness.mjs"));
  for (const s of seeds){
    try {
      const ms = createMatch(configFor(s, {speed: 2})), hx = ms.spec.hx;
      // every AI carrier's decision from a central spot 12 to 28 m from goal (|z| <= 11): was a shot among his options,
      // and did he take it
      const ch = {decisions: 0, offered: 0, shot: 0, pass: 0, other: 0};
      ms.onDecide = (a, opts, chosen, u) => {
        if (a.isMe || a.isGK) return;
        const d = Math.hypot(2*hx - u, a.m.z);
        if (Math.abs(a.m.z) > 11 || d > 28 || d < 12) return;
        ch.decisions++;
        if (opts.some(o => o.kind === "shot")) ch.offered++;
        if (chosen.kind === "shot") ch.shot++; else if (/pass|lob|through|cross/.test(chosen.kind)) ch.pass++; else ch.other++;
      };
      let steps = 0;
      while (ms.phase !== "over" && steps++ < 200000) simStep(ms);
      const r = H.measure(ms);
      const shots = [];
      for (const ev of ms.events){
        if (ev.kind !== "kick" || ev.whiff || ev.void || ev.team < 0) continue;
        if (ev.intent !== "shot" && !ev.atGoal) continue;
        // (ev.u: how far up the pitch for the side at the time, so the ends they changed at half time do not matter)
        const d = Math.hypot(2*hx - ev.u, ev.z), ag = ms.agents[ev.agent];
        shots.push({team: ev.team, d: Math.round(d*10)/10, z: Math.round(ev.z*10)/10, me: !!(ag && ag.isMe)});
      }
      parentPort.postMessage({seed: s, shots, goals: r.goals, ch});
    } catch(e){ parentPort.postMessage({seed: s, error: String(e && e.stack || e)}); }
  }
  process.exit(0);
}

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i < 0 ? d : argv[i + 1]; };
const N = +arg("n", 200), FROM = +arg("from", 1), ROOT = path.resolve(arg("root", HERE)), MIN = +arg("min-central", 0.6);
const W = Math.max(1, Math.min(4, os.cpus().length));
const seeds = Array.from({length: N}, (_, i) => FROM + i), per = Array.from({length: W}, () => []);
seeds.forEach((s, i) => per[i % W].push(s));
const out = [];
const t0 = Date.now();
await Promise.all(per.map(ss => new Promise(res => {
  const w = new Worker(fileURLToPath(import.meta.url), {workerData: {ufCentral: true, root: ROOT, seeds: ss}});
  w.on("message", m => { out.push(m); if (out.length % 50 === 0) console.log(`  ${out.length}/${N} (${Math.round((Date.now() - t0)/1000)} s)`); });
  w.on("exit", res); w.on("error", e => { console.log("worker error", e); res(); });
})));
const bad = out.filter(m => m.error), good = out.length - bad.length;
const all = out.flatMap(m => m.shots || []), shots = all.filter(s => !s.me), mine = all.filter(s => s.me);
const CH = out.reduce((a, m) => { if (m.ch) for (const k in m.ch) a[k] = (a[k] || 0) + m.ch[k]; return a; }, {});
const cen = s => Math.abs(s.z) <= 11, box = s => s.d <= 18;
const n = shots.length || 1;
const R = {root: ROOT, matches: good, errors: bad.length, shotsAll: all.length, perMatch: all.length/Math.max(1, good), aiShots: shots.length,
  central: shots.filter(cen).length/n, centralOutside: shots.filter(s => cen(s) && !box(s)).length/n, centralInside: shots.filter(s => cen(s) && box(s)).length/n,
  wide: shots.filter(s => !cen(s)).length/n, outside: shots.filter(s => !box(s)).length/n,
  meanDist: shots.reduce((a, s) => a + s.d, 0)/n,
  byDist: [[0, 12], [12, 18], [18, 25], [25, 40]].map(([a, b]) => ({from: a, to: b, central: shots.filter(s => cen(s) && s.d >= a && s.d < b).length/n, wide: shots.filter(s => !cen(s) && s.d >= a && s.d < b).length/n})),
  goalsPerMatch: out.reduce((a, m) => a + (m.goals || 0), 0)/Math.max(1, good),
  standIn: {shots: mine.length, central: mine.filter(cen).length/Math.max(1, mine.length)},
  chances: Object.assign({}, CH, {shotRate: (CH.shot || 0)/Math.max(1, CH.decisions || 0), offeredRate: (CH.offered || 0)/Math.max(1, CH.decisions || 0)})};
const r3 = v => Math.round(v*1000)/1000;
console.log(`${good} matches, ${all.length} shots (${r3(R.perMatch)} a match; the AI's ${shots.length}, the player's stand-in ${mine.length}), ${r3(R.goalsPerMatch)} goals a match`);
console.log(`the AI's shots: central ${r3(R.central)} (inside the box ${r3(R.centralInside)}, outside it ${r3(R.centralOutside)}); wide ${r3(R.wide)}; from outside the box ${r3(R.outside)}; mean distance ${r3(R.meanDist)} m`);
for (const b of R.byDist) console.log(`  ${b.from} to ${b.to} m: central ${r3(b.central)}, wide ${r3(b.wide)}`);
console.log(`AI carriers central, 12 to 28 m out: ${CH.decisions || 0} decisions, a shot offered in ${r3(R.chances.offeredRate)}, taken in ${r3(R.chances.shotRate)} (passes ${CH.pass || 0}, other ${CH.other || 0})`);
if (bad.length) console.log("errors:", bad.slice(0, 3).map(b => b.error));
const dir = path.join(ROOT, "qa", "out");
fs.mkdirSync(dir, {recursive: true});
fs.writeFileSync(path.join(dir, "uf-central.json"), JSON.stringify(R, null, 1));
const ok = !bad.length && R.central >= MIN;
console.log(ok ? "uf-central: ok" : `uf-central: FAILED (central share ${r3(R.central)} below ${MIN}, or errors)`);
process.exit(ok ? 0 : 1);
