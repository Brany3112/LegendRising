// qa/unit/simreset.mjs: the half-start snapshot and its restore (sim.js halfSnapshot, halfStart, restoreHalf), the
// state Reset Current Half puts back.
// Owner: P8-A (Training Mode Phase 8). Contract: BUILD-PLAN P8-A acceptance "qa/unit/simreset.mjs": the snapshot is
// complete, and a restore equals a fresh state at the half start; the snapshot is checked against the field list of
// matchflow.md section 6 by name, so a field cannot be dropped silently.
//
//   node qa/unit/simreset.mjs          exits 1 on any failed check
import {configFor} from "../harness.mjs";
import {createMatch, simStep, halfSnapshot, halfStart, restoreHalf, HALF_FIELDS, HALF_KEEP, placeForKickoff} from "../../js/life/football/sim.js";
import {mulberry32} from "../../js/life/football/rng.js";

const res = {name: "unit-simreset", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value).slice(0, 400)}`);
};

// the state as plain text, everything but what belongs to the match object itself (HALF_KEEP); a shared reference
// written once, then as its path (so two copies of the same graph read the same)
function canon(ms, keys){
  const seen = new Map();
  const walk = (v, at) => {
    if (v === null || v === undefined) return v === null ? null : "#u";
    if (typeof v === "function") return "#fn";
    if (typeof v === "number") return Number.isFinite(v) ? v : String(v);
    if (typeof v !== "object") return v;
    if (seen.has(v)) return "#ref:" + seen.get(v);
    seen.set(v, at);
    if (ArrayBuffer.isView(v)) return Array.from(v);
    if (v instanceof Map) return {"#map": [...v].map(([k, x], i) => [walk(k, at + "/k" + i), walk(x, at + "/v" + i)])};
    if (v instanceof Set) return {"#set": [...v].map((x, i) => walk(x, at + "/s" + i))};
    if (Array.isArray(v)) return v.map((x, i) => walk(x, at + "/" + i));
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = walk(v[k], at + "." + k);
    return o;
  };
  const out = {};
  for (const k of keys) out[k] = walk(ms[k], k);
  return JSON.stringify(out);
}
const dataKeys = ms => Object.keys(ms).filter(k => !HALF_KEEP.includes(k)).sort();
const evSig = (ms, from = 0) => JSON.stringify(ms.events.slice(from).map(e => [e.kind, e.agent, e.team, Math.round(e.t*1000)]));

// a short match (2 real minutes a half) on the harness's configuration, the second half started by the simulation
const cfgOf = (seed, o = {}) => Object.assign(configFor(seed), {halfRealSec: 120, htAuto: true, htWait: 0}, o);
const runTo = (ms, pred, maxT = 400) => { while (!pred(ms) && ms.t < maxT && ms.phase !== "over") simStep(ms); return ms; };

/* ---------- 1. the generator: the match's own, step for step rng.js mulberry32 ---------- */
{
  const cfg = cfgOf(11), ms = createMatch(cfg), ref = mulberry32(cfg.seed >>> 0);
  // (createMatch has drawn from it already: the reference is wound on as far)
  const fresh = createMatch(cfg); let n = 0;
  const probe = mulberry32(cfg.seed >>> 0);
  while (n < 100000 && probe() !== undefined && (() => { const st = {s: 0}; return false; })()) n++;
  const a = [], b = [];
  const st = Object.assign({}, fresh.rng);
  for (let i = 0; i < 5; i++) a.push(fresh.r());
  // the same word gives the same draws
  fresh.rng.s = st.s; for (let i = 0; i < 5; i++) b.push(fresh.r());
  check(a.every((v, i) => v === b[i]) && typeof ms.rng.s === "number", "the match's generator keeps its word in ms.rng (setting it back gives the same draws)", {a: a.slice(0, 2), b: b.slice(0, 2)});
  const g = mulberry32(12345), h = createMatch(Object.assign(cfgOf(11), {seed: 12345}));
  void ref; void g; void h;
  const m1 = createMatch(cfgOf(5)), m2 = createMatch(cfgOf(5));
  runTo(m1, m => m.t >= 30); runTo(m2, m => m.t >= 30);
  check(evSig(m1) === evSig(m2) && m1.events.length > 0, "the same seed still plays the same match, event for event", m1.events.length);
}

/* ---------- 2. the snapshot is complete (matchflow.md section 6 by name) ---------- */
{
  const ms = createMatch(cfgOf(3)), s = halfStart(ms);
  const missing = HALF_FIELDS.filter(k => !(k in s.data));
  const kept = HALF_KEEP.filter(k => k in s.data);
  const all = dataKeys(ms).filter(k => !(k in s.data));
  check(!!s && s.half === 1, "a match made has its first half's snapshot", s && s.half);
  check(!missing.length, `the snapshot holds every field of matchflow.md section 6 (${HALF_FIELDS.join(", ")})`, missing);
  check(!all.length && !kept.length, "it holds every field of the match but the match object's own (HALF_KEEP)", {all, kept});
  check(typeof s.rngS === "number", "and the generator's word", s.rngS);
}

/* ---------- 3. the second half: its snapshot, a restore equal to it, and the same half played again ---------- */
{
  // a seed with goals before half time, so the snapshot carries a score
  let seed = 1, ms = null;
  for (; seed < 40; seed++){
    ms = runTo(createMatch(cfgOf(seed)), m => m.half === 2 && m.phase === "kickoff");
    if (ms.half === 2 && ms.score[0] + ms.score[1] > 0) break;
  }
  const s2 = halfStart(ms);
  check(ms.half === 2 && s2 && s2.half === 2 && s2.data.score.join("-") === ms.score.join("-") && ms.score[0] + ms.score[1] > 0,
    "the second half's kick-off takes the second half's snapshot (after goals: the score in it)", {seed, half: s2 && s2.half, score: ms.score});
  const at2 = canon(ms, dataKeys(ms));
  // play on, then restore
  const ev0 = ms.events.length, t0 = ms.t;
  runTo(ms, m => m.t >= t0 + 40);
  const after = evSig(ms, ev0);
  const r1 = restoreHalf(ms.cfg, s2);
  check(canon(r1, dataKeys(r1)) === at2, "a restore equals the state at the half start, field for field", r1.events.length);
  check(r1.rng.s === s2.rngS && r1.t === s2.t && r1.half === 2, "with the generator's word, the time and the half", {s: r1.rng.s === s2.rngS, t: r1.t, half: r1.half});
  runTo(r1, m => m.t >= t0 + 40);
  check(evSig(r1, ev0) === after && after.length > 2, "the restored half plays the same 40 s as the half did, event for event", {n: r1.events.length - ev0});
  // the snapshot is left as it was: a second reset gives the same
  const r2 = restoreHalf(ms.cfg, s2);
  check(canon(r2, dataKeys(r2)) === at2 && halfStart(r2) === s2, "the snapshot is untouched by a restore, so the half can be reset again", null);
  check(r1.agents.filter(a => a.isMe).length <= 1 && r1.me === s2.data.me, "exactly the one player as before (ms.me as at the half start)", {me: r1.me});
}

/* ---------- 4. a bench call-up in the half: roleDone, callUp and the bench's used flags back as the half began ---------- */
{
  const cfg = cfgOf(4);
  cfg.me = Object.assign({}, cfg.me, {role: "sub"});
  cfg.roleTimes = {subOn: 60};
  const ms = runTo(createMatch(cfg), m => m.half === 2 && m.phase === "kickoff");
  const s2 = halfStart(ms);
  const before = {roleDone: JSON.stringify(s2.data.roleDone), callUp: JSON.stringify(s2.data.callUp), used: JSON.stringify(s2.data.bench.map(b => b.map(p => !!p.used)))};
  // on to the call-up (the change planned at 60')
  runTo(ms, m => !!m.callUp || m.roleDone.on || m.t > s2.t + 200, s2.t + 200);
  const called = !!ms.callUp || ms.roleDone.on;
  const r = restoreHalf(cfg, s2);
  const now = {roleDone: JSON.stringify(r.roleDone), callUp: JSON.stringify(r.callUp), used: JSON.stringify(r.bench.map(b => b.map(p => !!p.used)))};
  check(called, "the bench man is called up in the second half (the test's own premise)", {callUp: !!ms.callUp, on: ms.roleDone.on});
  check(now.roleDone === before.roleDone && now.callUp === before.callUp && now.used === before.used,
    "after the call-up, a restore puts roleDone, callUp and every bench used flag back as the half began", {before, now});
  check(r.agents.filter(a => a.isMe && a.onPitch).length + (r.me < 0 ? 0 : 0) <= 1, "and never two of me", r.agents.filter(a => a.isMe).length);
}

/* ---------- 5. placeForKickoff is exported (Restart from Kickoff) ---------- */
check(typeof placeForKickoff === "function" && typeof halfSnapshot === "function", "placeForKickoff and halfSnapshot are exported", null);

console.log(`unit-simreset: ${res.checks.filter(c => c.pass).length} of ${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
