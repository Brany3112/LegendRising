// qa/unit/trainconfig.mjs: Training Mode's shared configuration (js/life/train/config.js) and its teams
// (js/life/train/teams.js) under plain node: every field validates and clamps; garbage, partial and old input give safe
// defaults; the keeper is never a role; the relevance table of each type; no decorative setting (every field shown,
// changed from its default to another allowed value, changes cfgFromConfig's output); onside starts over 200 seeded
// configs; the wall in the defenders' six; never more than 13 agents and never fewer than 1 on my side; the ball's
// launch (speed within 2%, apex by ballPredict within 5 cm, no launch no velocity).
// Owner: P4-A (Training Mode Phase 4). Contract: BUILD-PLAN P4-A acceptance "qa/unit/trainconfig.mjs"; TRAINING-SPEC
// 0, 2 and 4; G0 decisions (d), (e) and (h). P11-A runs it again over every type registered by then.
//
//   node qa/unit/trainconfig.mjs   exits 1 on any failed check; writes qa/out/unit-trainconfig.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import * as C from "../../js/life/train/config.js";
import {cfgFromConfig, setupFromConfig} from "../../js/life/train/teams.js";
import {EDIT_SKILLS, gkEditKeys, ATTR_PRESETS} from "../../js/life/football/attrs.js";
import {RULES} from "../../js/life/football/rules.js";
import {cagePitch} from "../../js/life/football/cagespec.js";
import {createBall, createBallWorld, ballPredict} from "../../js/life/football/ball.js";
import {mulberry32} from "../../js/life/football/rng.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const res = {name: "unit-trainconfig", checks: [], ok: true, log: {}};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const copy = v => JSON.parse(JSON.stringify(v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const TYPES = C.types();

/* ---------- every field validates and clamps ---------- */
{
  const bad = [];
  for (const t of TYPES){
    const S = C.typeOf(t);
    const c = C.validate(t, {attackers: 40, defenders: -9, wall: 99, attAvg: 400, defAvg: -5, me: {passing: 250, power: -3, curve: "x", heading: 12.6},
      gk: {reflex: 0, dive: 1000}, role: "striker", possession: "everyone", pitch: "moon", out: "maybe", keeper: "yes", mates: 7,
      positions: {me: {slot: "GK", dx: 999, dz: -999}, att: [{slot: "ZZ", dx: "far"}]},
      ball: {at: {x: 900, y: -4, z: "q"}, launch: {kind: "rocket", target: {x: 1e6, y: 1e6, z: 1e6}, speed: 900, curl: 7}}});
    const inR = (v, a, b) => Number.isFinite(v) && v >= a && v <= b;
    if (!S.match){
      if (!inR(c.attackers, 0, 6) || !inR(c.defenders, 0, 6) || !inR(c.wall, 0, 6) || c.wall + c.defenders > 6) bad.push([t, "counts", c.attackers, c.defenders, c.wall]);
    }
    if (!inR(c.attAvg, 1, 99) || !inR(c.defAvg, 1, 99) || c.attAvg !== 99 || c.defAvg !== 1) bad.push([t, "averages", c.attAvg, c.defAvg]);
    for (const k of EDIT_SKILLS) if (!Number.isInteger(c.me[k]) || !inR(c.me[k], 1, 99)) bad.push([t, "me", k, c.me[k]]);
    if (c.me.passing !== 99 || c.me.power !== 1 || c.me.heading !== 13) bad.push([t, "me clamps", c.me.passing, c.me.power, c.me.heading]);
    if (c.gk.reflex !== 1 || c.gk.dive !== 99) bad.push([t, "gk clamps", c.gk]);
    if (!S.roles.includes(c.role)) bad.push([t, "role", c.role]);
    if (!C.POSSESSION.includes(c.possession) || !C.PITCHES.includes(c.pitch) || !C.OUTS.includes(c.out)) bad.push([t, "enums", c.possession, c.pitch, c.out]);
    if (typeof c.keeper !== "boolean" || typeof c.mates !== "boolean") bad.push([t, "bools"]);
    if (c.positions.me.slot === "GK" || Math.abs(c.positions.me.dx) > C.OFFSET_MAX.dx || Math.abs(c.positions.me.dz) > C.OFFSET_MAX.dz) bad.push([t, "positions", c.positions.me]);
    if (!C.SLOTS.includes(c.positions.att[0].slot) || c.positions.att[0].dx !== 0) bad.push([t, "npc position", c.positions.att[0]]);
    if (c.ball.at && (Math.abs(c.ball.at.x) > C.BALL_BOX.x || c.ball.at.y < 0.11 || !Number.isFinite(c.ball.at.z))) bad.push([t, "ball.at", c.ball.at]);
    if (c.ball.launch){
      const L = c.ball.launch;
      if (!C.LAUNCH_KINDS.includes(L.kind) || L.speed > C.LAUNCH_SPEED.max || Math.abs(L.curl) > 1 || Math.abs(L.target.x) > C.BALL_BOX.x || L.target.y > C.BALL_BOX.y) bad.push([t, "launch", L]);
    }
    if (!S.fields.includes("launch") && c.ball.launch) bad.push([t, "launch on a type without it"]);
  }
  check(bad.length === 0, "every field validates and clamps, for every type", bad.slice(0, 5));
  // a type's own options validate the same way
  C.registerType("qa-opts", {name: "QA", options: {reps: {kind: "int", min: 1, max: 9, def: 3, label: "Goes"}, side: {kind: "enum", values: [{v: "l", label: "Left"}, {v: "r", label: "Right"}]},
    fast: {kind: "bool"}, gap: {kind: "num", min: 0.5, max: 4, def: 1}}});
  const o = C.validate("qa-opts", {opts: {reps: 40, side: "up", fast: "true", gap: -2, nope: 1}}).opts;
  check(same(o, {reps: 9, side: "l", fast: true, gap: 0.5}), "a type's own options clamp, check their values and drop unknown ones", o);
}

/* ---------- garbage, partial and old input ---------- */
{
  const bad = [];
  for (const t of TYPES){
    const d = C.defaults(t);
    for (const g of [null, undefined, 42, "x", [], [1, 2], true, {}, {v: 0}, {v: 99, junk: {a: 1}}, {attackers: "many", me: "strong", positions: 5, ball: "here", opts: []}]){
      const c = C.validate(t, g);
      if (!same(c, d)) bad.push([t, JSON.stringify(g)]);
    }
    // partial: one field set, the rest the defaults
    const p = C.validate(t, {keeper: !d.keeper});
    const want = copy(d); if (!(C.typeOf(t).fixed.keeper != null)) want.keeper = !d.keeper;
    const pc = C.validate(t, want);
    if (!same(p, pc)) bad.push([t, "partial"]);
    // unknown keys dropped, and nothing kept but the schema
    const u = C.validate(t, Object.assign(copy(d), {hack: 1, __proto__x: 2}));
    if ("hack" in u || "__proto__x" in u) bad.push([t, "unknown key kept"]);
    const keys = Object.keys(u).sort().join();
    if (keys !== "attAvg,attackers,ball,defAvg,defenders,gk,keeper,mates,me,offside,opps,opts,out,pitch,positions,possession,role,seed,v,wall") bad.push([t, "keys", keys]);
  }
  check(bad.length === 0, "garbage, partial and old input give the type's safe defaults; unknown keys are dropped", bad.slice(0, 6));
  // an old configuration (an earlier shape: counts as strings, no version, the keeper set without distribution)
  const old = C.validate("attacking", {attackers: "3", defenders: "2", gk: {reflex: 70, dive: 70, handling: 70, posit: 70}});
  check(old.attackers === 3 && old.defenders === 2 && old.gk.reflex === 70 && old.gk.distrib === ATTR_PRESETS.average && old.v === C.VERSION, "an old configuration is read safely", {a: old.attackers, d: old.defenders, gk: old.gk});
}

/* ---------- the keeper is never a role ---------- */
{
  const bad = [];
  if (C.ROLES.some(r => /keep|gk|goal/i.test(r))) bad.push("ROLES");
  for (const t of TYPES){
    if (C.typeOf(t).roles.some(r => /keep|gk|goal/i.test(r))) bad.push([t, "roles"]);
    for (const r of ["keeper", "goalkeeper", "gk", "GK"]) if (C.validate(t, {role: r}).role === r) bad.push([t, r]);
    if ((C.allowed(t, C.defaults(t), "role") || []).some(r => /keep|gk|goal/i.test(r))) bad.push([t, "allowed"]);
    if (C.validate(t, {positions: {me: {slot: "GK"}}}).positions.me.slot === "GK") bad.push([t, "slot GK"]);
    // my agent is never the keeper
    const r = cfgFromConfig(t, C.defaults(t), 1);
    for (const tm of r.cfg.teams) for (const p of tm.players) if (p.isMe && p.isGK) bad.push([t, "me as keeper"]);
  }
  let thrown = false; try { C.registerType("qa-keeper", {roles: ["keeper"]}); } catch(e){ thrown = true; }
  check(bad.length === 0 && thrown && !C.SLOTS.includes("GK"), "the keeper is never a role, never my slot, and a type cannot offer him", bad);
}

/* ---------- the relevance table ---------- */
{
  const want = {
    freeplay: "pitch,mates,opps,keeper,out,positions,me",
    attacking: "pitch,role,mates,opps,attackers,defenders,keeper,possession,out,positions,ball,me,attAvg,defAvg,gk",
    defending: "pitch,mates,opps,attackers,keeper,possession,out,positions,ball,me,attAvg,gk",
    receiving: "pitch,mates,opps,attackers,keeper,possession,out,positions,ball,launch,me,attAvg",
    scenarios: "pitch,role,mates,opps,attackers,defenders,keeper,possession,offside,out,positions,ball,me,attAvg,defAvg,gk",
    setpieces: "pitch,role,mates,opps,keeper,possession,out,positions,ball,me,gk",
    freekick: "pitch,role,mates,opps,defenders,wall,keeper,possession,out,positions,ball,me,defAvg,gk",
    fullmatch: "role,me,attAvg,defAvg,gk"
  };
  const bad = [];
  for (const [t, w] of Object.entries(want)){ const got = C.relevant(t, C.defaults(t)).join(); if (got !== w) bad.push([t, got]); }
  check(bad.length === 0, "the relevance table of each type's defaults", bad);
  // what follows from a choice: opponents off takes their count, their average and the keeper's set stays with the keeper
  const v = [
    ["attacking", {opps: false}, k => !k.includes("defenders") && !k.includes("defAvg") && k.includes("gk")],
    ["attacking", {mates: false}, k => !k.includes("attackers") && !k.includes("attAvg")],
    ["attacking", {keeper: false}, k => !k.includes("gk") && k.includes("keeper")],
    ["freeplay", {mates: true}, k => k.includes("attackers") && k.includes("attAvg")],
    ["freeplay", {opps: true, keeper: true}, k => k.includes("defenders") && k.includes("defAvg") && k.includes("gk")],
    ["defending", {mates: true}, k => k.includes("defenders") && k.includes("defAvg")],
    ["freekick", {opps: false}, k => !k.includes("wall") && !k.includes("defenders")],
    ["fullmatch", {opps: false, keeper: false}, k => k.join() === want.fullmatch]
  ];
  const bad2 = v.filter(([t, o, f]) => !f(C.relevant(t, Object.assign(C.defaults(t), o)))).map(([t, o]) => [t, o, C.relevant(t, Object.assign(C.defaults(t), o)).join()]);
  check(bad2.length === 0, "relevance follows the configuration (a side off hides its count and its average)", bad2);
  // a fixed field is never shown and always its fixed value
  const fm = C.validate("fullmatch", {pitch: "half", out: "rebound", offside: false, keeper: false});
  check(fm.pitch === "full" && fm.out === "stop" && fm.offside && fm.keeper, "Full Match always plays on the full pitch with the real laws", {pitch: fm.pitch, out: fm.out, offside: fm.offside, keeper: fm.keeper});
}

/* ---------- no decorative setting ---------- */
// every field shown for a configuration, changed to each other value it may take, changes cfgFromConfig's output
function variants(t, c, key){
  const out = [], set = (label, f) => { const n = copy(c); f(n); out.push([label, n]); };
  const vals = C.allowed(t, c, key);
  if (vals) for (const v of vals){ if (key.startsWith("opt.")){ if (v !== c.opts[key.slice(4)]) set(`${key}=${v}`, n => { n.opts[key.slice(4)] = v; }); } else if (v !== c[key]) set(`${key}=${v}`, n => { n[key] = v; }); }
  if (key === "me") for (const k of EDIT_SKILLS) set(`me.${k}`, n => { n.me[k] = n.me[k] > 50 ? 20 : 90; });
  if (key === "gk") for (const k of gkEditKeys()) set(`gk.${k}`, n => { n.gk[k] = n.gk[k] > 50 ? 20 : 90; });
  if (key === "attAvg" || key === "defAvg") set(key, n => { n[key] = n[key] > 50 ? 25 : 85; });
  if (key === "positions") for (const p of C.participants(t, c)){
    const [g, i] = p.key === "me" ? ["me", null] : p.key.split("."), spot = n => g === "me" ? n.positions.me : n.positions[g][+i];
    set(`${p.key}.slot`, n => { spot(n).slot = p.slot === "CM" ? "CAM" : "CM"; });
    set(`${p.key}.dx`, n => { spot(n).dx = -3; });
    set(`${p.key}.dz`, n => { spot(n).dz = 3; });
  }
  if (key === "ball"){
    if (c.ball.at){ set("ball.at=feet", n => { n.ball.at = null; }); set("ball.at.x", n => { n.ball.at.x += 2; }); set("ball.at.z", n => { n.ball.at.z += 2; }); set("ball.at.y", n => { n.ball.at.y = 1; }); }
    else set("ball.at=placed", n => { n.ball.at = {x: 3, y: 0.11, z: 4}; });
  }
  if (key === "launch"){
    if (c.ball.launch){
      set("launch=none", n => { n.ball.launch = null; });
      for (const k of C.LAUNCH_KINDS) if (k !== c.ball.launch.kind) set(`launch.kind=${k}`, n => { n.ball.launch.kind = k; });
      set("launch.speed", n => { n.ball.launch.speed += 4; });
      set("launch.curl", n => { n.ball.launch.curl = 0.5; });
      set("launch.target.x", n => { n.ball.launch.target.x += 3; });
      set("launch.target.z", n => { n.ball.launch.target.z += 3; });
      set("launch.target.y", n => { n.ball.launch.target.y = 1.2; });
    } else set("launch=pass", n => { n.ball.launch = {kind: "pass", target: {x: 6, y: 0.11, z: 0}, speed: 14, curl: 0}; });
  }
  return out;
}
{
  const bad = [], tried = {};
  let n = 0;
  for (const t of TYPES){
    if (t.startsWith("qa-")) continue;
    // the defaults, and a fuller configuration of the type, so a field hidden by the defaults is tried too
    const fuller = C.validate(t, Object.assign(C.defaults(t), {mates: true, opps: true, keeper: true, attackers: 3, defenders: 2}));
    for (const base of [C.defaults(t), fuller]){
      const ref = JSON.stringify(cfgFromConfig(t, base, 7));
      for (const key of C.relevant(t, base)){
        const vs = variants(t, base, key);
        if (!vs.length) bad.push([t, key, "no variant"]);
        for (const [label, v] of vs){
          n++; tried[t] = (tried[t] || 0) + 1;
          if (JSON.stringify(cfgFromConfig(t, v, 7)) === ref) bad.push([t, label]);
        }
      }
    }
  }
  res.log.decorative = {tried, total: n};
  check(bad.length === 0 && n > 300, `no decorative setting: ${n} changes of a shown field, each changes cfgFromConfig's output`, bad.slice(0, 10));
}

/* ---------- onside starts ---------- */
{
  const B = RULES.OFF.body, eps = RULES.OFF.eps;
  const offsideOf = (s, spec) => {
    const half = -(spec.area.x0 + spec.area.x1)/2;
    const atk = s.myTeam === 0 ? [s.me, ...s.mates] : [...s.opps];
    const def = (s.myTeam === 0 ? [...s.opps] : [s.me, ...s.mates]).concat(s.keeper ? [s.keeper] : []).map(p => p.x + B).sort((a, b) => b - a);
    const line = Math.max(def.length >= 2 ? def[1] : def.length ? def[0] : half, s.ball.x);
    return atk.filter(p => p.x + B > line + eps && p.x + B > half + 0.06).map(p => ({slot: p.slot, x: p.x, line}));
  };
  const r = mulberry32(4242), pick = a => a[Math.floor(r()*a.length)];
  let off = 0, moved = 0, notes = 0;
  const worst = [];
  for (let i = 0; i < 200; i++){
    const pitch = pick(C.PITCHES), role = pick(["attacker", "support", "defender", "receiver"]);
    const cfg = {role, pitch, offside: true, mates: r() < 0.8, opps: r() < 0.9, keeper: r() < 0.7, attackers: 1 + Math.floor(r()*6), defenders: Math.floor(r()*7),
      possession: pick(C.POSSESSION), positions: {me: {slot: pick(C.SLOTS), dx: Math.round(r()*40 - 10), dz: Math.round(r()*20 - 10)},
        att: Array.from({length: 6}, () => ({slot: pick(C.SLOTS), dx: Math.round(r()*40 - 10), dz: Math.round(r()*20 - 10)})),
        def: Array.from({length: 6}, () => ({slot: pick(C.SLOTS), dx: Math.round(r()*20 - 10), dz: Math.round(r()*20 - 10)}))}};
    const spec = cagePitch(cfg.pitch), s = setupFromConfig("scenarios", cfg, {spec, seed: i + 1});
    const o = offsideOf(s, spec);
    if (o.length){ off++; if (worst.length < 3) worst.push(o); }
    if (s.notes.some(t => /offside/.test(t))){ moved++; notes += s.notes.length; }
  }
  res.log.onside = {configs: 200, offside: off, moved};
  check(off === 0 && moved > 10, `onside starts: 200 seeded configs with offside on, none starts offside (${moved} had someone moved back, with a note)`, worst);
  // one placed offside comes back on the line, and the sheet is told who
  const spec = cagePitch("half");
  const base = {role: "attacker", pitch: "half", offside: true, mates: true, opps: true, keeper: true, attackers: 2, defenders: 2, possession: "me",
    positions: {att: [{slot: "ST", dx: 14, dz: 0}]}};
  const s = setupFromConfig("scenarios", base, {spec, seed: 3});
  const defs = [...s.opps, s.keeper].map(p => p.x).sort((a, b) => b - a), lineX = Math.max(defs[1], s.ball.x - B);
  const mate = s.mates[0];
  check(Math.abs(mate.x - lineX) < 0.05 && s.notes.some(t => /team-mate at ST started offside/.test(t)) && offsideOf(s, spec).length === 0,
    "a team-mate placed offside comes back onto the line, and the note says which one", {x: mate.x, line: lineX, notes: s.notes});
  // with offside off nobody is moved
  const s2 = setupFromConfig("attacking", Object.assign({}, base, {offside: true}), {spec, seed: 3});
  check(s2.mates[0].x > lineX + 1 && !s2.notes.some(t => /offside/.test(t)), "a type without the offside law moves nobody", {x: s2.mates[0].x});
}

/* ---------- the wall counts in the defenders' six ---------- */
{
  const notes = [];
  const c = C.validate("freekick", {wall: 5, defenders: 4, opps: true}, notes);
  const c2 = C.validate("freekick", {wall: 6, defenders: 6, opps: true});
  const r = cfgFromConfig("freekick", c, 1), theirs = r.cfg.teams[1].players.filter(p => !p.isGK).length;
  check(c.wall + c.defenders === 6 && c2.wall + c2.defenders === 6 && c2.wall === 6 && notes.some(t => /wall counts toward the defenders' six/.test(t)) && theirs === 6,
    "wall plus defenders above 6 is clamped to 6, with a note, and 6 defenders take the pitch", {c: [c.wall, c.defenders], c2: [c2.wall, c2.defenders], notes, theirs});
}

/* ---------- never more than 13 agents, never fewer than 1 on my side ---------- */
{
  const r = mulberry32(99), bad = [];
  let maxA = 0;
  for (let i = 0; i < 600; i++){
    const t = TYPES.filter(x => !C.typeOf(x).match)[i % 7];
    const cfg = {role: C.ROLES[Math.floor(r()*5)], attackers: Math.floor(r()*12) - 3, defenders: Math.floor(r()*12) - 3, wall: Math.floor(r()*10) - 2,
      mates: r() < 0.5, opps: r() < 0.7, keeper: r() < 0.5};
    const c = C.validate(t, cfg), n = C.counts(t, c), out = cfgFromConfig(t, c, i);
    const agents = out.cfg.teams[0].players.length + out.cfg.teams[1].players.length;
    const mine = out.cfg.teams[out.cfg.me.team].players.filter(p => !p.isGK).length;
    maxA = Math.max(maxA, agents);
    if (agents > 13 || n.agents > 13 || agents !== n.agents || mine < 1 || n.mine < 1 || out.cfg.teams.some(tm => tm.players.filter(p => !p.isGK).length > 6)) bad.push([t, cfg, agents, mine]);
  }
  res.log.maxAgents = maxA;
  check(bad.length === 0 && maxA === 13, `600 random configurations: at most 13 agents (the largest had ${maxA}), at most 6 outfield a side, at least 1 on my side`, bad.slice(0, 3));
}

/* ---------- the ball's launch ---------- */
{
  const r = mulberry32(2026), rows = [], bad = [];
  for (let i = 0; i < 20; i++){
    const kind = C.LAUNCH_KINDS[i % 4], pitch = "full", spec = cagePitch(pitch);
    const D = 8 + 17*(i/19), ang = (r() - 0.5)*Math.PI, from = {x: -10 + r()*6, y: 0.11, z: (r() - 0.5)*10};
    const target = {x: from.x + D*Math.cos(ang), y: kind === "cross" ? 1.4 : 0.11, z: from.z + D*Math.sin(ang)};
    const speed = kind === "pass" ? 9 + r()*6 : kind === "driven" ? 18 + r()*6 : kind === "cross" ? 17 + r()*6 : 15 + r()*6;
    const cfg = {pitch, possession: "loose", mates: false, opps: false, keeper: false, ball: {at: from, launch: {kind, target, speed, curl: kind === "cross" ? 0.3 : 0}}};
    const c = C.validate("receiving", cfg), out = cfgFromConfig("receiving", c, i + 1);
    const bi = out.ballInit, v = Math.hypot(bi.v.x, bi.v.y, bi.v.z), want = c.ball.launch.speed;
    // the flight the ball will really fly from ballInit, sampled by ballPredict (30 Hz), up to the moment it reaches its target
    const b = createBall({x: bi.p.x, y: bi.p.y, z: bi.p.z, rollDecel: spec.roll}), bw = createBallWorld({spec});
    b.v.x = bi.v.x; b.v.y = bi.v.y; b.v.z = bi.v.z; b.w.x = bi.w.x; b.w.y = bi.w.y; b.w.z = bi.w.z; b.state = "free"; b.grounded = bi.p.y <= 0.111 && bi.v.y <= 0;
    const N = 240, P = new Float32Array(4*N), cnt = ballPredict(b, bw, P, N, 30);
    const tEnd = Number.isFinite(out.ballInit.tFlight) ? out.ballInit.tFlight : 99;
    let apex = bi.p.y;
    for (let k = 0; k < cnt; k++){ if (P[4*k + 3] > tEnd + 1e-6) break; apex = Math.max(apex, P[4*k + 1]); }
    const row = {kind, D: +D.toFixed(1), speed: +want.toFixed(2), v: +v.toFixed(3), apex: +apex.toFixed(3), want: +(+out.ballInit.apex).toFixed(3), ok: out.ballInit.ok};
    rows.push(row);
    if (Math.abs(v - want) > 0.02*want || Math.abs(apex - out.ballInit.apex) > 0.05) bad.push(row);
  }
  res.log.launch = rows;
  check(bad.length === 0, "20 seeded launches (each kind, 8 to 25 m): launch speed within 2%, apex by ballPredict within 5 cm of the solved one", bad);
  const none = cfgFromConfig("attacking", C.defaults("attacking"), 1).ballInit;
  check(none.v.x === 0 && none.v.y === 0 && none.v.z === 0 && none.w.x === 0 && none.w.y === 0 && none.w.z === 0, "with no launch the ball's velocity and spin are zero", none);
  const rcv = cfgFromConfig("receiving", C.defaults("receiving"), 1).ballInit;
  check(Math.hypot(rcv.v.x, rcv.v.y, rcv.v.z) > 1 && same(rcv.p, C.defaults("receiving").ball.at), "a placed ball starts at the configured point, its launch from there", rcv.p);
}

/* ---------- my attributes by default (G0 decision e) ---------- */
{
  const avg = C.defaults("attacking").me;
  check(EDIT_SKILLS.every(k => avg[k] === ATTR_PRESETS.average), "with no career held, my attributes start at the Average preset", avg);
  const held = {power: 61, aero: 44, curve: 50, accuracy: 70, passing: 66, passacc: 58, acceleration: 72, sprintSpeed: 80, dribbling: 63, stamina: 55, composure: 47, tackling: 30, interception: 35, jumping: 52, heading: 41};
  globalThis.heldSkills = () => held;
  const me = C.defaults("attacking").me;
  const old = {...held}; delete old.acceleration; delete old.sprintSpeed; old.pace = 68;
  globalThis.heldSkills = () => old;
  const me2 = C.defaults("attacking").me;
  delete globalThis.heldSkills;
  check(same(me, held) && me2.acceleration === 68 && me2.sprintSpeed === 68, "with a career held, my attributes start at heldSkills() (an old career's pace for both speeds)", {me, me2: [me2.acceleration, me2.sprintSpeed]});
}

/* ---------- the configuration's seed (G0 decision f) and the wall never holding the ball (TR-4 fix round 1) ---------- */
{
  const base = Object.assign(C.defaults("attacking"), {mates: true, opps: true, attackers: 3, defenders: 3});
  const atOf = s => JSON.stringify([s.mates.map(p => p.at), s.opps.map(p => p.at)]);
  const a1 = setupFromConfig("attacking", C.validate("attacking", Object.assign({}, base, {seed: 7}))), a2 = setupFromConfig("attacking", C.validate("attacking", Object.assign({}, base, {seed: 7})));
  const b = setupFromConfig("attacking", C.validate("attacking", Object.assign({}, base, {seed: 8})));
  check(C.defaults("attacking").seed === 1 && C.validate("attacking", {seed: -4}).seed === 1 && C.validate("attacking", {seed: 1e12}).seed === C.SEED_MAX, "a configuration carries a seed (default 1, clamped)", null);
  check(atOf(a1) === atOf(a2) && atOf(a1) !== atOf(b) && a1.seed === 7, "with no seed handed in, the configuration's own seed is used: the same seed gives the same NPCs, another seed others", {s1: a1.seed, s2: b.seed});
  const fk = C.validate("freekick", {role: "defender", mates: true, opps: true, defenders: 1, wall: 3, possession: "mates"});
  check(!C.allowed("freekick", fk, "possession").includes("mates") && fk.possession === "me" && !C.relevant("freekick", fk).includes("possession") === (C.allowed("freekick", fk, "possession").length <= 1),
    "a defender whose only team-mates are the wall is not offered 'A team-mate' to start with the ball", {allowed: C.allowed("freekick", fk, "possession"), poss: fk.possession});
  const fk2 = C.validate("freekick", {role: "attacker", mates: true, opps: true, attackers: 2, defenders: 0, wall: 3, possession: "opps"});
  check(!C.allowed("freekick", fk2, "possession").includes("opps") && fk2.possession === "loose", "an attacker facing only a wall is not offered 'An opponent'", {allowed: C.allowed("freekick", fk2, "possession"), poss: fk2.possession});
}

fs.mkdirSync(path.join(ROOT, "qa/out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa/out/unit-trainconfig.json"), JSON.stringify(res, null, 1));
console.log(res.ok ? "unit-trainconfig: all checks passed" : "unit-trainconfig: FAILED");
process.exit(res.ok ? 0 : 1);
