// qa/unit/attrs.mjs: Training Mode's attributes (js/life/football/attrs.js, P4-A additions) under plain node: the derived
// values recompute; the presets; NPCs from the training seed (same seed same players, another seed others); a side's
// mean equals its average within 1; every NPC skill within 6 of average plus its role's profile before the clamps (the
// measured range at average 50 logged); the editor's floor; my default attributes from a held career.
// Owner: P4-A (Training Mode Phase 4). Contract: BUILD-PLAN P4-A acceptance "qa/unit/attrs.mjs"; TRAINING-SPEC 4 (NPC
// averages with modest reproducible variation); G0 decisions (e) and (f); ATTR-1.
//
//   node qa/unit/attrs.mjs   exits 1 on any failed check; writes qa/out/unit-attrs.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {attrsForAI, attrsForTraining, attrsForPlayer, derivedOf, presetSkills, cleanSkills, PROFILE, ARCH_OF_POS, SKILL_KEYS, EDIT_SKILLS,
  DERIVED_KEYS, ATTR_PRESETS, GK_KEYS, GK_DISTRIB_LIVE, gkEditKeys} from "../../js/life/football/attrs.js";
import {cfgFromConfig, npcId, posOfSlot} from "../../js/life/train/teams.js";
import * as C from "../../js/life/train/config.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const res = {name: "unit-attrs", checks: [], ok: true, log: {}};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

/* ---------- derived values recompute ---------- */
{
  const base = presetSkills("average"), d0 = derivedOf(base);
  const more = Object.assign({}, base, {dribbling: 90}), d1 = derivedOf(more);
  const a = attrsForTraining(more);
  const ctrl = 0.65*90 + 0.2*55 + 0.15*55, agility = (55 + 90)/2;
  check(DERIVED_KEYS.join() === "pace,ctrl,agility,strength,balance,defAware", "the editor's derived values are pace, ball control, agility, strength, balance and defensive awareness", DERIVED_KEYS);
  check(near(a.ctrl, ctrl) && near(a.agility, agility) && d1.ctrl > d0.ctrl && d1.agility > d0.agility && d1.balance > d0.balance && d1.pace === d0.pace,
    "derived values recompute from an edit (dribbling 55 to 90: ball control, agility and balance up, pace the same)", {d0, d1});
  const s = derivedOf(Object.assign({}, base, {power: 90, tackling: 90, interception: 90, acceleration: 80, sprintSpeed: 90}));
  check(s.strength > d0.strength && s.defAware > d0.defAware && near(s.pace, 85, 0.06), "strength from shot power, defensive awareness from interception and tackling, pace the mean of both speeds", s);
  // the same chain as a career's: attrsForTraining is attrsForPlayer on the raw values (no effSkill, no boots)
  const p = attrsForPlayer(more, {}, {});
  check(SKILL_KEYS.concat(DERIVED_KEYS, ["acceleration", "sprintSpeed", "passAcc", "vision", "decision"]).every(k => near(p[k], a[k])), "attrsForTraining is the career's attrsForPlayer chain on raw values");
}

/* ---------- presets ---------- */
{
  const ok = Object.entries({low: 35, average: 55, high: 75, max: 99}).every(([k, v]) => ATTR_PRESETS[k] === v && EDIT_SKILLS.every(s => presetSkills(k)[s] === v) && GK_KEYS.every(s => presetSkills(k, GK_KEYS)[s] === v));
  check(ok && EDIT_SKILLS.length === 15, "the presets: Low 35, Average 55, High 75, Max 99, over the 15 skills and the keeper's set", ATTR_PRESETS);
  const c = cleanSkills({passing: 0, power: 140, curve: "x", heading: 44.4}, presetSkills("average"));
  check(c.passing === 1 && c.power === 99 && c.curve === 55 && c.heading === 44, "editor values are whole numbers from 1 to 99", c);
  // (P9-B wired gk.distrib into the keeper's distribution, and the integration turned GK_DISTRIB_LIVE on: the editor shows it)
  check(GK_DISTRIB_LIVE === true && gkEditKeys().join() === "reflex,dive,handling,posit,distrib", "distribution is in the editor now that it does something (GK_DISTRIB_LIVE)", gkEditKeys());
}

/* ---------- seeded NPCs ---------- */
{
  const side = (seed, avg, slots = ["LW", "RW", "CAM", "CF", "CM", "CDM"]) => slots.map((slot, i) => attrsForAI({id: npcId(seed, "att", i), ovr: avg, pos: posOfSlot(slot), slot}, {training: true}));
  const a = side(11, 60), b = side(11, 60), c = side(12, 60);
  check(JSON.stringify(a) === JSON.stringify(b), "the same training seed gives the same players");
  const diff = a.filter((p, i) => SKILL_KEYS.some(k => p[k] !== c[i][k])).length;
  check(diff === 6, "another seed gives other players", {differ: diff});
  // through the configuration: the same seed, the same cfg; another seed, other NPC attributes
  const cfg = C.validate("attacking", {attackers: 3, defenders: 3});
  const r1 = cfgFromConfig("attacking", cfg, 5), r2 = cfgFromConfig("attacking", cfg, 5), r3 = cfgFromConfig("attacking", cfg, 6);
  const npcs = r => r.cfg.teams.flatMap(t => t.players.filter(p => !p.isMe)).map(p => p.at);
  check(JSON.stringify(r1) === JSON.stringify(r2) && JSON.stringify(npcs(r1)) !== JSON.stringify(npcs(r3)), "cfgFromConfig: same seed same players, another seed others");

  // the mean and the spread (G0 f): per player and skill |value - (average + profile)| <= 6 before the clamps
  let worst = 0, lo = 99, hi = 1, meanBad = [];
  const slots = ["LB", "CB", "RB", "LWB", "RWB", "CDM", "LM", "CM", "RM", "CAM", "LW", "RW", "LF", "CF", "RF", "ST"];
  for (let seed = 1; seed <= 40; seed++){
    for (const avg of [50]){
      const ps = slots.map((slot, i) => ({slot, arch: ARCH_OF_POS[posOfSlot(slot)], a: attrsForAI({id: npcId(seed, "def", i), ovr: avg, pos: posOfSlot(slot), slot}, {training: true})}));
      let sum = 0, n = 0;
      for (const p of ps){
        for (const k of [...SKILL_KEYS.filter(k => k !== "pace"), "acceleration", "sprintSpeed"]){
          const prof = PROFILE[p.arch][k === "acceleration" || k === "sprintSpeed" ? "pace" : k];
          // (a skill is a whole number: it is checked against average plus profile rounded the same way)
          worst = Math.max(worst, Math.abs(p.a[k] - Math.round(avg + prof)));
          lo = Math.min(lo, p.a[k]); hi = Math.max(hi, p.a[k]);
        }
        for (const k of SKILL_KEYS){ sum += p.a[k]; n++; }
      }
      if (Math.abs(sum/n - avg) > 1) meanBad.push([seed, sum/n]);
    }
  }
  res.log.spreadAt50 = {min: lo, max: hi, worstFromProfile: worst};
  console.log(`     measured at average 50 over 640 players: skills from ${lo} to ${hi}; the furthest from average plus profile (rounded) ${worst}`);
  check(worst <= 6, "every NPC skill is within 6 of average plus its role's profile (both whole numbers) before the clamps", {worst});
  check(meanBad.length === 0, "a side's mean skill equals its average within 1", meanBad.slice(0, 3));
  // the editor's floor: an average of 5 gives a side of fives, not of twenties (a career's AI keeps its floor of 20)
  const low = attrsForAI({id: npcId(1, "att", 0), ovr: 5, pos: "CM"}, {training: true}), car = attrsForAI({id: "career-1", ovr: 5, pos: "CM"});
  check(Math.min(...SKILL_KEYS.map(k => low[k])) < 15 && Math.min(...SKILL_KEYS.map(k => car[k])) >= 20, "the training floor goes down to the editor's range; a career's AI players are unchanged", {training: Math.min(...SKILL_KEYS.map(k => low[k])), career: Math.min(...SKILL_KEYS.map(k => car[k]))});
  // the keeper: his set as configured
  const k = cfgFromConfig("attacking", C.validate("attacking", {keeper: true, gk: {reflex: 91, dive: 12, handling: 40, posit: 77}}), 3);
  const gk = k.cfg.teams[1].players.find(p => p.isGK).at.gk;
  check(gk.reflex === 91 && gk.dive === 12 && gk.handling === 40 && gk.posit === 77, "the keeper's attributes are the configured set", gk);
}

/* ---------- my attributes by default (G0 decision e) ---------- */
{
  const held = {power: 61, aero: 44, curve: 50, accuracy: 70, passing: 66, passacc: 58, acceleration: 72, sprintSpeed: 80, dribbling: 63, stamina: 55, composure: 47, tackling: 30, interception: 35, jumping: 52, heading: 41};
  globalThis.heldSkills = () => held;
  const d = C.defaults("attacking"), r = cfgFromConfig("attacking", d, 1);
  delete globalThis.heldSkills;
  const me = r.cfg.teams[r.cfg.me.team].players.find(p => p.isMe).at;
  check(EDIT_SKILLS.every(k => d.me[k] === held[k]) && EDIT_SKILLS.every(k => me[k] === held[k]), "with a held career the default 'my attributes' equal heldSkills(), and reach my agent", d.me);
  const none = C.defaults("attacking").me;
  check(EDIT_SKILLS.every(k => none[k] === 55), "with no career, the Average preset");
}

fs.mkdirSync(path.join(ROOT, "qa/out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa/out/unit-attrs.json"), JSON.stringify(res, null, 1));
console.log(res.ok ? "unit-attrs: all checks passed" : "unit-attrs: FAILED");
process.exit(res.ok ? 0 : 1);
