// qa/harness.mjs: the match simulation's batch harness. Plays N seeded matches between club pairs from the game's own
// club list, both sides AI (the player's slot played by the same brain with his preference on, chemistry 50, trust
// 20, the slot rotating ST, W, AM, CM, DF), on worker threads, and checks the means and distributions against the
// WP-E acceptance bands; then times simStep alone on this thread.
// Owner: WP-E. DESIGN 3.2.12 (harness), 2.3 WP-E acceptance, 4.5 and 4.7.
//
//   node qa/harness.mjs --n 1000                the acceptance run (Standard tempo)
//   node qa/harness.mjs --n 100 --from 1        a calibration run
//   options: --speed 2|1|4  --workers 4  --prefoff 4 (every 4th match is also played with the preference off)
//            --arch ST|W|AM|CM|DF (the player in that archetype in every match: calibration)
//            --timing 3 (matches timed alone; 0 to skip)  --fit-ratings  --fit-tempo  --tempo d,s,p  --quiet
//   writes qa/out/harness.json; exits 1 when a band fails (not with --fit-*).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import os from "node:os";
import {fileURLToPath, pathToFileURL} from "node:url";
import {Worker, isMainThread, parentPort, workerData} from "node:worker_threads";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = rel => pathToFileURL(path.join(ROOT, rel)).href;
const H = await import(F("js/life/football/harness.js"));
const {mulberry32, hashStr, gauss} = await import(F("js/life/football/rng.js"));
const {makePitch} = await import(F("js/life/football/pitchspec.js"));
const {attrsForAI} = await import(F("js/life/football/attrs.js"));
const {TEMPO, HALF_REAL} = await import(F("js/life/football/sim.js"));

/* ---------- the game's clubs and shapes (classic scripts, read in a sandbox) ---------- */

function classic(file, names){
  const src = fs.readFileSync(path.join(ROOT, file), "utf8") + `\n;this.__out = {${names.join(", ")}};`;
  const ctx = vm.createContext({});
  vm.runInContext(src, ctx, {filename: file});
  return ctx.__out;
}
const CL = classic("js/data/clubs.js", ["COUNTRIES", "CLUB_REP", "REP_BAND"]);
const PS = classic("js/data/positions.js", ["POSITIONS", "FORMATIONS", "FORMATION_KEYS"]);
// util.js hash (the same FNV the career uses for a club's formation and reputation)
const hash01 = s => { let h = 2166136261; for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0)/4294967295; };
// world.js clubRepInit and meanOvr
const repOf = (nm, cc, t) => CL.CLUB_REP[nm] || Math.round(CL.REP_BAND[cc][t][0] + (CL.REP_BAND[cc][t][1] - CL.REP_BAND[cc][t][0])*hash01(nm));
const meanOvr = rep => 28 + Math.pow(Math.max(1, rep)/9500, 0.7)*57;
const formationOf = nm => PS.FORMATION_KEYS[Math.floor(hash01("form:" + nm)*PS.FORMATION_KEYS.length) % PS.FORMATION_KEYS.length];
const CLUBS = [];
for (const [cc, C] of Object.entries(CL.COUNTRIES)) for (const L of C.leagues) for (const nm of L.clubs) CLUBS.push({nm, cc, t: L.t, rep: repOf(nm, cc, L.t)});

const ARCHS = ['ST', 'W', 'AM', 'CM', 'DF'];
const SLOTS_FOR = {ST: ['ST', 'CF', 'LF', 'RF'], W: ['LW', 'RW', 'LM', 'RM'], AM: ['CAM'], CM: ['CM', 'CDM'], DF: ['CB', 'LB', 'RB', 'LWB', 'RWB']};

// one match's configuration from its seed (deterministic)
export function configFor(seed, opt = {}){
  const r = mulberry32(hashStr("pair:" + seed));
  const a = CLUBS[Math.floor(r()*CLUBS.length)];
  // the opponent: same league most of the time, else any club of the same country
  const same = CLUBS.filter(c => c.cc === a.cc && c.t === a.t && c !== a), country = CLUBS.filter(c => c.cc === a.cc && c !== a);
  const pool = r() < 0.6 && same.length ? same : country;
  const b = pool[Math.floor(r()*pool.length)];
  const meArch = opt.arch || ARCHS[seed % 5], meTeam = seed % 2;
  const teams = [a, b].map((c, ti) => {
    let form = formationOf(c.nm);
    let slots = PS.FORMATIONS[form].slice();
    if (ti === meTeam && !slots.some(s => SLOTS_FOR[meArch].includes(s))){ form = meArch === 'AM' ? '4-2-3-1' : '4-3-3'; slots = PS.FORMATIONS[form].slice(); }
    const mo = meanOvr(c.rep), base = 100000*(ti + 1) + seed*50;
    let meIdx = -1;
    if (ti === meTeam){ const cand = slots.map((s, i) => [s, i]).filter(([s]) => SLOTS_FOR[meArch].includes(s)); meIdx = cand[Math.floor(r()*cand.length)][1]; }
    const players = slots.map((slot, i) => {
      const P = PS.POSITIONS[slot], ovr = Math.round(Math.max(15, Math.min(94, mo + gauss(r)*4.5)));
      const id = base + i;
      return {pid: id, name: c.nm.split(" ")[0] + i, number: i + 1, slot, arch: slot === 'GK' ? 'GK' : P.arch, isGK: slot === 'GK', isMe: i === meIdx,
        at: attrsForAI({id, ovr: i === meIdx ? Math.round(mo) : ovr, pos: P.world}), energy: 85 + Math.floor(r()*15), ovr};
    });
    const bench = ['GK', 'CB', 'LB', 'CM', 'CAM', 'LW', 'ST'].map((slot, i) => {
      const P = PS.POSITIONS[slot], ovr = Math.round(mo - 3 + gauss(r)*4.5), id = base + 20 + i;
      return {pid: id, name: c.nm.split(" ")[0] + "s" + i, number: 12 + i, slot, arch: slot === 'GK' ? 'GK' : P.arch, isGK: slot === 'GK', at: attrsForAI({id, ovr, pos: P.world}), energy: 100, ovr};
    });
    return {name: c.nm, short: c.nm.slice(0, 3).toUpperCase(), formation: slots, players, bench, ovr: players.reduce((s, p) => s + p.ovr, 0)/11, tier: c.t};
  });
  const speed = opt.speed || 2;
  const tempo = Object.assign({}, TEMPO[speed], opt.tempo || {});
  const meSlot = teams[meTeam].players.find(p => p.isMe);
  return {seed, mode: 'match', spec: makePitch({boards: true, roll: [1.25, 1.1, 1.1, 1.0, 0.9][Math.min(4, Math.max(0, 4 - teams[0].tier))]}),
    halfRealSec: HALF_REAL[speed], tempo, teams, me: {team: meTeam, slot: meSlot.slot, chem: 50, trust: 20, staminaF: 1.0, role: 'starter'},
    rules: {offside: true, cards: true, subs: 5}, roleTimes: {}, meAI: true, htAuto: true, prefOff: !!opt.prefOff,
    ovr: [Math.round(teams[0].ovr*10)/10, Math.round(teams[1].ovr*10)/10]};
}

// a match's result without the heavy parts, for the trip back from a worker
function slim(m){ delete m.ms; for (const x of m.ratings) delete x.c.__; return m; }

/* ---------- worker ---------- */

// (only this script's own workers: another script's worker thread may import configFor too)
if (!isMainThread && workerData && workerData.harness){
  const {seeds, opt} = workerData;
  for (const s of seeds){
    let res;
    try {
      res = H.runOne(configFor(s, opt));
      if (opt.prefoff && s % opt.prefoff === 0) res.off = H.runOne(configFor(s, Object.assign({}, opt, {prefOff: true})));
      if (res.off){ delete res.off.ratings; }
      res = slim(res);
    } catch(e){ res = {seed: s, error: String(e && e.stack || e)}; }
    parentPort.postMessage(res);
  }
  process.exit(0);
}

/* ---------- main ---------- */

// only when run as a script (configFor is also imported by other QA scripts)
const entry = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMainThread && entry) await main();

async function main(){

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true); };
const N = +arg("n", 100), FROM = +arg("from", 1), SPEED = +arg("speed", 2), WORKERS = +arg("workers", Math.max(1, Math.min(4, os.cpus().length)));
const PREFOFF = +arg("prefoff", 4), TIMING = +arg("timing", 3), QUIET = !!arg("quiet", false);
const tempoArg = arg("tempo", null);
const opt = {speed: SPEED, prefoff: PREFOFF};
// a calibration run with the player in one archetype only (ST, W, AM, CM or DF)
if (arg("arch", null) && arg("arch", null) !== true) opt.arch = String(arg("arch", null));
if (tempoArg && tempoArg !== true){ const [d, s, p] = String(tempoArg).split(",").map(Number); opt.tempo = {directness: d, shotBias: s, pressMul: p}; }

async function batch(seeds, o){
  const parts = Array.from({length: WORKERS}, () => []);
  seeds.forEach((s, i) => parts[i % WORKERS].push(s));
  const out = [];
  let done = 0;
  const t0 = Date.now();
  await Promise.all(parts.filter(p => p.length).map(p => new Promise((res, rej) => {
    const w = new Worker(fileURLToPath(import.meta.url), {workerData: {harness: true, seeds: p, opt: o}});
    w.on("message", m => {
      out.push(m); done++;
      if (!QUIET && (done % 10 === 0 || done === seeds.length)) process.stdout.write(`  ${done}/${seeds.length} matches, ${Math.round((Date.now() - t0)/1000)} s\n`);
    });
    w.on("error", rej);
    w.on("exit", c => c === 0 ? res() : rej(new Error("worker exit " + c)));
  })));
  out.sort((a, b) => a.seed - b.seed);
  return out;
}

const seeds = Array.from({length: N}, (_, i) => FROM + i);
const t0 = Date.now();
console.log(`harness: ${N} matches from seed ${FROM}, speed ${SPEED}, ${WORKERS} workers`);
const list = await batch(seeds, opt);
const errs = list.filter(m => m.error);
if (errs.length){ console.log(`${errs.length} matches failed; first:\n${errs[0].error}`); }
const ok = list.filter(m => !m.error);
const R = H.aggregate(ok);
// simStep cost, timed alone on this thread (2.3 WP-E: in Node on the container)
if (TIMING > 0){
  const tl = [];
  // one match first, untimed: this thread's code is compiled (JIT) before the clock runs
  H.runOne(configFor(FROM + TIMING, opt));
  for (let i = 0; i < TIMING; i++) tl.push(H.runOne(configFor(FROM + i, opt), {now: () => performance.now()}));
  R.stepMean = tl.reduce((a, m) => a + m.stepMean, 0)/tl.length;
  R.stepMax = Math.max(...tl.map(m => m.stepMax));
  R.stepP99 = Math.max(...tl.map(m => m.stepP99));
  R.stepP999 = Math.max(...tl.map(m => m.stepP999 || 0));
  // determinism: the timed runs give the batch's hashes again
  R.determinism = tl.every((m, i) => ok.find(x => x.seed === FROM + i) ? ok.find(x => x.seed === FROM + i).hash === m.hash : true);
}
const checks = H.checkReport(R);
if (R.determinism != null) checks.push({name: 'same seed, same event log (two runs in Node)', value: R.determinism, lo: true, hi: true, pass: R.determinism});
const out = {about: "WP-E harness (qa/harness.mjs): DESIGN 2.3 WP-E bands", when: new Date().toISOString(), n: ok.length, speed: SPEED, tempo: opt.tempo || TEMPO[SPEED],
  seconds: Math.round((Date.now() - t0)/1000), report: R, checks};
if (arg("fit-ratings", false)){ out.fitRatings = H.fitRatings(ok); console.log("fit-ratings:", JSON.stringify(out.fitRatings)); }
fs.mkdirSync(path.join(ROOT, "qa", "out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa", "out", "harness.json"), JSON.stringify(out, null, 1));
const fmt = v => v == null ? "-" : typeof v === 'number' ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(3)) : String(v);
for (const c of checks) console.log(`${c.pass ? "ok  " : "FAIL"} ${c.name}: ${fmt(c.value)}  [${fmt(c.lo)} .. ${fmt(c.hi)}]`);
console.log(`me by archetype: ${JSON.stringify(Object.fromEntries(Object.entries(R.me).map(([k, m]) => [k, {n: m.n, touches: +m.touches.toFixed(1), shots: +m.shots.toFixed(2), def: +m.defActs.toFixed(1), gap: Math.round(m.gapP95), trust: +m.trust.toFixed(2), rating: +m.rating.toFixed(2), posDisc: +m.pd.toFixed(2), judged: +m.trustJ.toFixed(2)}])))}`);
for (const [k, m] of Object.entries(R.me)) console.log(`  ${k} moments a match: ${JSON.stringify(m.moments)}`);
if (R.ratingBy) console.log(`starters' ratings by archetype: ${JSON.stringify(R.ratingBy)}`);
if (R.assertSeeds && R.assertSeeds.length) console.log(`seeds with a failed assert: ${R.assertSeeds.join(", ")}`);
console.log(`kicks: ${JSON.stringify(R.kinds)} controlled ${fmt(R.ctlSec)} s`);
console.log(`other: passes ${fmt(R.passes)} ok ${fmt(R.passesOk)} reds ${fmt(R.reds)} pens ${fmt(R.pens)} restarts ${fmt(R.restarts)} through ${R.through} sides on ${R.sidesOn} off ${R.sidesOff} prefCaps ${R.prefCaps} restartWorst ${fmt(R.restartWorst)}${R.stepP99 != null ? ` step p99 ${R.stepP99} p99.9 ${R.stepP999} ms` : ""}`);
const failed = checks.filter(c => !c.pass).length;
console.log(`harness: ${checks.length - failed} of ${checks.length} checks pass, ${Math.round((Date.now() - t0)/1000)} s`);
process.exit(failed && !arg("fit-ratings", false) && !arg("fit-tempo", false) ? 1 : 0);
}
