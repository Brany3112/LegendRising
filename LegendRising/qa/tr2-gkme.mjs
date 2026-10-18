// qa/tr2-gkme.mjs: the player is never the keeper (Node, the real simulation, 30 seeds).
// Owner: P2-A (TR-2, Phase 2). Contract: BUILD-PLAN P2-A acceptance (qa/tr2-gkme.mjs: GK-1); TRAINING-SPEC section 0
// (the goalkeeper is always AI: never selectable, never switchable into).
//
// A league match with you at the back (the harness's configuration, a defender, you at the keys: meAI off), live for a
// second, then your keeper is sent off (and, in a second pass, hurt with no change left). Over 30 seeds: you are never
// made the keeper (isGK), ms.gks never points at you, somebody else goes in goal when an outfield man is left, and your
// intent is never overwritten by the keeper's brain (you hold W up the pitch for 3 s and your intent is yours each step).
//
//   node qa/tr2-gkme.mjs      exits 1 on any failed check; writes qa/out/tr2-gkme.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {configFor} from "./harness.mjs";
import {createMatch, simStep} from "../js/life/football/sim.js";
import {bookAgent} from "../js/life/football/rules.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const res = {name: "tr2-gkme", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};

function trial(seed, how){
  const cfg = configFor(seed, {arch: "DF"}); cfg.meAI = false; cfg.htAuto = true;
  if (how === "injury") cfg.rules = Object.assign({}, cfg.rules, {subs: 0});
  const ms = createMatch(cfg);
  if (ms.me < 0) return null;
  let guard = 0;
  while (ms.phase !== "live" && guard++ < 6000) simStep(ms);
  for (let k = 0; k < 60; k++) simStep(ms);
  const me = ms.agents[ms.me], t = me.team, gk = ms.agents[ms.gks[t]];
  if (how === "red") bookAgent(ms, gk, "red", "probe");
  else {
    // hurt with no change left (laws.subs 0): he walks off and his side fills the gap (rules.js injure, shortHanded)
    gk.injured = true;
    ms.subs.plan.push({team: t, out: gk.id, inPick: null, why: "injury", stage: "wait", t: ms.t, none: true});
  }
  const dir = ms.dirs[t];
  let meGK = false, gksMe = false, overwritten = 0, steps = 0;
  for (let k = 0; k < 180; k++){
    me.intent.dx = dir; me.intent.dz = 0; me.intent.gait = "run";
    simStep(ms); steps++;
    if (me.isGK) meGK = true;
    if (ms.gks[t] === ms.me) gksMe = true;
    if (Math.abs(me.intent.dx - dir) > 1e-9 || Math.abs(me.intent.dz) > 1e-9) overwritten++;
  }
  const keeper = ms.gks[t] >= 0 ? ms.agents[ms.gks[t]] : null;
  const newGK = !!keeper && keeper.id !== gk.id && keeper.isGK && !keeper.isMe && keeper.onPitch;
  return {seed, how, slot: me.slot, meGK, gksMe, overwritten, steps, newGK, newSlotWas: keeper ? keeper.slot : null};
}

for (const how of ["red", "injury"]){
  const rows = [];
  for (let s = 1; s <= 30; s++){ const r = trial(s, how); if (r) rows.push(r); }
  const bad = rows.filter(r => r.meGK || r.gksMe);
  check(rows.length >= 25 && !bad.length, `keeper ${how === "red" ? "sent off" : "hurt with no change left"}: you are never made the keeper and ms.gks never points at you (${rows.length} seeds)`, bad.slice(0, 3));
  const ow = rows.filter(r => r.overwritten);
  check(!ow.length, `keeper ${how === "red" ? "sent off" : "hurt with no change left"}: your intent is never overwritten (3 s of W held, every seed)`, ow.slice(0, 3));
  const none = rows.filter(r => !r.newGK);
  check(!none.length, `keeper ${how === "red" ? "sent off" : "hurt with no change left"}: an AI team-mate goes in goal instead`, none.slice(0, 3));
}

fs.mkdirSync(path.join(ROOT, "qa/out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa/out/tr2-gkme.json"), JSON.stringify(res, null, 1));
console.log(`tr2-gkme: ${res.checks.filter(c => c.pass).length} of ${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
