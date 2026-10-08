// qa/unit/sim.mjs: the match simulation as a whole under plain node: the slot coordinates agree with the career's
// positions.js, the same seed replays the same match, a match runs to full time with every assert quiet, the bridge
// builds its configuration without touching the career's skills, a level-up gained during a match survives
// bridge.finish (the career.js:189-194 regression of matchSkillsOn/Off), and the checkpoint and resume records.
// Owner: WP-E. Contract DESIGN 1.4.13, 1.4.16, 1.7 (S.life.inMatch); acceptance 2.3 WP-E (qa/unit/sim.mjs).
//
//   node qa/unit/sim.mjs     exits 1 on any failed check; writes qa/out/unit-sim.json
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
import {configFor} from "../harness.mjs";
import {createMatch, simStep, runHeadless, on, matchSec} from "../../js/life/football/sim.js";
import {SLOT_POS} from "../../js/life/football/tactics.js";
import {logHash, countersAll} from "../../js/life/football/events.js";
import * as B from "../../js/life/football/bridge.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const res = {name: "unit-sim", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};

/* ---------- the slot coordinates are the career's ---------- */
{
  const src = fs.readFileSync(path.join(ROOT, "js/data/positions.js"), "utf8") + "\n;this.__P = POSITIONS;";
  const ctx = vm.createContext({});
  vm.runInContext(src, ctx);
  const P = ctx.__P, bad = [];
  for (const [k, p] of Object.entries(P)){
    const s = SLOT_POS[k];
    if (!s || s.x !== p.x || s.y !== p.y || s.line !== p.line) bad.push(k);
  }
  for (const k of Object.keys(SLOT_POS)) if (!P[k]) bad.push("extra " + k);
  check(bad.length === 0, "tactics.SLOT_POS matches js/data/positions.js POSITIONS (x, y, line) slot for slot", bad);
}

/* ---------- the same seed, the same match ---------- */
{
  const run = () => { const ms = createMatch(configFor(7)); while (ms.t < 90) simStep(ms); return {hash: logHash(ms), n: ms.events.length, t: ms.t}; };
  const a = run(), b = run();
  check(a.hash === b.hash && a.n === b.n && a.n > 20, "the same seed gives the same event log twice (90 s of play)", a);
  const c = (() => { const ms = createMatch(configFor(8)); while (ms.t < 90) simStep(ms); return logHash(ms); })();
  check(c !== a.hash, "a different seed gives a different match");
}

/* ---------- a whole match ---------- */
let full = null;
{
  const ms = createMatch(configFor(3));
  const seen = {};
  on(ms, '*', ev => { seen[ev.kind] = (seen[ev.kind] || 0) + 1; });
  const r = runHeadless(ms);
  full = ms;
  const kinds = ['kick', 'touch', 'possession', 'out', 'whistle', 'restart'];
  check(r.done && ms.phase === 'over' && ms.half === 2, "runHeadless plays it to full time", {phase: ms.phase, steps: r.steps});
  check(kinds.every(k => seen[k] > 0), "subscribers ('*') hear every kind of event as the steps end", seen);
  check(ms.asserts.teleport === 0 && ms.asserts.ballJump === 0, "no agent or ball moved further in a step than its speed allows", {teleport: ms.asserts.teleport, ballJump: ms.asserts.ballJump, maxAgent: Math.round(ms.asserts.maxAgent*1000)/1000});
  const C = countersAll(ms), starters = ms.agents.filter(a => a.role === 'player' && a.on.length && a.on[0][0] < 1);
  check(starters.length === 22 && starters.every(a => C[a.id].mins >= 1), "22 starters with their minutes", starters.length);
  const wh = ms.events.filter(e => e.kind === 'whistle' && (e.why === 'ht' || e.why === 'ft')).map(e => e.why);
  check(wh.join() === 'ht,ft' && ms.clock.sec >= 2700, "the clock ran both halves to their added time (whistles ht, ft)", {whistles: wh, sec: Math.round(ms.clock.sec)});
}

/* ---------- the bridge against a stand-in career (the classic globals it reads, the functions it calls) ---------- */
{
  // a minimal career world: what bridge.js reads by name, and what it calls behind its typeof guards
  const skills = {power: 60, aero: 50, curve: 55, accuracy: 62, passing: 58, passacc: 57, pace: 70, dribbling: 66, stamina: 61, composure: 54,
    tackling: 40, interception: 42, jumping: 50, heading: 48};
  const cfg0 = configFor(5);
  const meTeam = cfg0.me.team, oppTeam = 1 - meTeam;
  const pl = {};
  for (const t of [0, 1]) for (const p of cfg0.teams[t].players.concat(cfg0.teams[t].bench)) pl[p.pid] = {id: p.pid, ovr: p.ovr || 50, pos: p.isGK ? 'GK' : 'CM', no: p.number, me: !!p.isMe};
  const mePid = cfg0.teams[meTeam].players.find(p => p.isMe).pid;
  globalThis.S = {cid: "unit", skills: Object.assign({}, skills), traits: {team: 50, conf: 50, dec: 50, risk: 50}, items: {}, energy: 90, fatigue: 10, trust: 20, chem: 50,
    speed: 2, player: {name: "Unit Player", foot: "Right", teamPos: cfg0.teams[meTeam].players.find(p => p.isMe).slot}, life: {}, meId: mePid, level: 4, sp: 0};
  globalThis.W = {players: pl, season: 1, done: {}, clubs: {}};
  const xi = t => cfg0.teams[t].players.map(p => pl[p.pid]);
  globalThis.MT = {f: {key: "U1", kind: "L"}, home: meTeam === 0, usId: 1, themId: 2, usXI: xi(meTeam), themXI: xi(oppTeam), role: "starter",
    nameUs: "Us", nameThem: "Them", myKit: null, oppKit: null, stad: {tier: 2, crowd: 5000}, nerves: 0.1, tired: 0.05, my: {}, score: [0, 0], usGoals: [], themGoals: []};
  let finalised = null, rewarded = null;
  globalThis.finaliseMatch = (f, hx, ax, hG, aG, fixed) => { finalised = {f, hx: hx.length, ax: ax.length, hG, aG, fixed}; W.done[f.key] = {hg: hG.length, ag: aG.length}; return {motm: -1, rt: fixed}; };
  globalThis.matchRewards = (M, rating, out) => { rewarded = {rating, out}; return {rating, xp: 30}; };
  const before = JSON.stringify(S.skills);
  const eff = B.effSkills();
  const cfg = B.matchConfig(MT.f, MT, {seed: 99});
  check(JSON.stringify(S.skills) === before, "effSkills and matchConfig read the skills and never change them");
  check(eff.pace === Math.max(5, Math.round(70*(1 - 0.15))) && eff.composure === 54, "effective skills: nerves and tired legs off everything but composure", {pace: eff.pace, composure: eff.composure});
  check(cfg.seed === 99 && cfg.teams.length === 2 && cfg.teams[meTeam].players.some(p => p.isMe) && cfg.me.team === meTeam, "the configuration: both sides, the player in his side", {me: cfg.me.team});
  const ms = createMatch(Object.assign(cfg, {meAI: true, htAuto: true}));
  const off = B.attach(ms, on);
  runHeadless(ms, 30*60);
  // the checkpoint (1.7)
  const rec = B.checkpoint(ms);
  const keys = ['v', 'fkey', 'cid', 'seed', 'half', 'sec', 'step', 'score', 'goals', 'my', 'role', 'on', 'energy', 'fatigueAcc', 'booked', 'subsUsed', 'late', 'ts'];
  check(rec && keys.every(k => k in rec) && S.life.inMatch === rec && rec.fkey === "U1" && rec.v === 1, "checkpoint writes S.life.inMatch with every field of 1.7", rec && Object.keys(rec));
  check(B.resumeInfo() === rec, "resumeInfo gives the interrupted match back while its fixture is not done");
  const rcfg = B.matchConfig(MT.f, MT, {resume: rec});
  check(rcfg.seed === ((rec.seed + rec.step) >>> 0) && rcfg.resume.score.join() === rec.score.join() && rcfg.resume.sec === rec.sec, "the resume configuration: the seed moved on by the step, the score and the clock of the checkpoint", {seed: rcfg.seed});
  // a level-up while the match is on (the career's skillXP crossing a level): the bridge must keep it
  S.skills.pace += 1; S.level += 1;
  runHeadless(ms);
  const fin = B.finish(ms);
  off();
  check(S.skills.pace === 71 && S.level === 5, "a level-up gained during the match survives bridge.finish", {pace: S.skills.pace, level: S.level});
  check(finalised && Object.keys(finalised.fixed).length >= 22 && finalised.fixed[mePid] === fin.rating, "finaliseMatch gets every rating fixed, the player's among them", finalised && Object.keys(finalised.fixed).length);
  check(rewarded && rewarded.rating === fin.rating && !("inMatch" in S.life) && MT.label === "FT" && MT.score.length === 2, "matchRewards gets the player's rating; the checkpoint is cleared; MT is at full time", {rating: fin.rating});
  for (const k of ['S', 'W', 'MT', 'finaliseMatch', 'matchRewards']) delete globalThis[k];
}

/* ---------- a substitute's interrupted match (3.4.4, D15): after the crash nobody plays him, nothing is made up ---------- */
{
  const cfg0 = configFor(7);
  const meTeam = cfg0.me.team, oppTeam = 1 - meTeam;
  const pl = {};
  for (const t of [0, 1]) for (const p of cfg0.teams[t].players.concat(cfg0.teams[t].bench)) pl[p.pid] = {id: p.pid, ovr: p.ovr || 50, pos: p.isGK ? 'GK' : 'CM', no: p.number, me: !!p.isMe};
  const mePid = cfg0.teams[meTeam].players.find(p => p.isMe).pid;
  globalThis.S = {cid: "unit-sub", skills: {power: 55, aero: 50, curve: 50, accuracy: 55, passing: 55, passacc: 55, pace: 60, dribbling: 55, stamina: 60, composure: 50,
    tackling: 45, interception: 45, jumping: 50, heading: 50}, traits: {team: 50, conf: 50, dec: 50, risk: 50}, items: {}, energy: 90, fatigue: 10, trust: 20, chem: 50,
    speed: 2, player: {name: "Unit Sub", foot: "Right", teamPos: cfg0.teams[meTeam].players.find(p => p.isMe).slot}, life: {}, meId: mePid, level: 4, sp: 0};
  globalThis.W = {players: pl, season: 1, done: {}, clubs: {}};
  // the squads the bench is picked from (bridge sideTeam: squadOf)
  const squad = t => cfg0.teams[t].players.concat(cfg0.teams[t].bench).map(p => pl[p.pid]);
  globalThis.squadOf = id => squad(id === 1 ? meTeam : oppTeam);
  const xi = t => cfg0.teams[t].players.map(p => pl[p.pid]);
  const mt = () => ({f: {key: "U2", kind: "L"}, home: meTeam === 0, usId: 1, themId: 2, usXI: xi(meTeam), themXI: xi(oppTeam), role: "sub", subOn: 60,
    nameUs: "Us", nameThem: "Them", myKit: null, oppKit: null, stad: {tier: 2, crowd: 5000}, nerves: 0, tired: 0, my: {}, score: [0, 0], usGoals: [], themGoals: []});
  globalThis.MT = mt();
  let finalised = null, rewarded = null;
  globalThis.finaliseMatch = (f, hx, ax, hG, aG, fixed) => { finalised = {hx: hx.map(p => p.id), ax: ax.map(p => p.id), fixed}; return {motm: -1, rt: fixed}; };
  globalThis.matchRewards = (M, rating) => { rewarded = {rating, on: M.on}; return {rating}; };
  const cfg = B.matchConfig(MT.f, MT, {seed: 77});
  check(cfg.roleTimes.subOn === 60, "a substitute's match plans his call (roleTimes.subOn)", cfg.roleTimes);
  const ms = createMatch(Object.assign(cfg, {meAI: true, htAuto: true}));
  check(ms.me < 0 && ms.bench[meTeam].some(p => p.isMe && !p.used), "he starts on the bench");
  runHeadless(ms, 30*60);
  const rec30 = JSON.parse(JSON.stringify(B.checkpoint(ms)));
  runHeadless(ms, 72*60);
  const meNow = ms.me >= 0 ? ms.agents[ms.me] : null;
  check(meNow && meNow.onPitch, "the planned call brings him on in the uninterrupted match", {me: ms.me});
  const rec72 = JSON.parse(JSON.stringify(B.checkpoint(ms)));
  check(rec30.on.length === 0 && rec30.counters === null, "the checkpoint at 30': still on the bench, no counters", {on: rec30.on, counters: rec30.counters});
  check(rec72.on.length === 1 && rec72.on[0][0] >= 59 && rec72.on[0][0] <= 70 && rec72.on[0][1] >= 70 && rec72.on[0][1] <= 73 && rec72.counters && rec72.counters.mins > 0,
    "the checkpoint at 72': on from his call, in match minutes (MT.on never runs past the clock)", {on: rec72.on, mins: rec72.counters && rec72.counters.mins});
  const resumeRun = rec => {
    globalThis.MT = mt(); S.life = {inMatch: rec};
    const rc = B.matchConfig(MT.f, MT, {resume: rec});
    const r = createMatch(Object.assign(rc, {meAI: true, htAuto: true}));
    runHeadless(r);
    const asMe = r.agents.filter(a => a.isMe).length;
    const evMe = r.events.filter(e => e.agent != null && e.agent >= 0 && r.agents[e.agent] && r.agents[e.agent].isMe).length;
    finalised = null; rewarded = null;
    const fin = B.finish(r);
    return {r, rc, asMe, evMe, fin};
  };
  // resumed while he was still on the bench: never brought on, so no rating at all
  {
    const {r, rc, asMe, evMe, fin} = resumeRun(rec30);
    check(!rc.roleTimes.subOn && r.phase === 'over' && r.me < 0 && asMe === 0 && evMe === 0,
      "resumed at 30' from the bench: his call is dropped and nobody plays him in the remainder", {roleTimes: rc.roleTimes, me: r.me, asMe, evMe});
    check(fin.rating === null && rewarded && rewarded.rating === null && finalised && !(mePid in finalised.fixed) && !finalised.hx.concat(finalised.ax).includes(mePid),
      "resumed at 30' from the bench: no rating is made up (null to matchRewards), no appearance in the world's line-ups", {rating: fin.rating, fixed: finalised && finalised.fixed[mePid]});
  }
  // resumed after he came on: off at the checkpoint, rated on what he did before it
  {
    const {r, asMe, evMe, fin} = resumeRun(rec72);
    check(r.phase === 'over' && r.me < 0 && asMe === 0 && evMe === 0, "resumed at 72' after his call: substituted at the checkpoint, nobody plays him in the remainder", {me: r.me, asMe, evMe});
    check(typeof fin.rating === 'number' && rewarded.rating === fin.rating && finalised.fixed[mePid] === fin.rating && finalised[meTeam === 0 ? 'hx' : 'ax'].includes(mePid)
      && JSON.stringify(rewarded.on) === JSON.stringify(rec72.on), "resumed at 72': his rating from the checkpoint's counters, in the world's line-up, his minutes from the checkpoint",
      {rating: fin.rating, on: rewarded.on});
  }
  for (const k of ['S', 'W', 'MT', 'finaliseMatch', 'matchRewards', 'squadOf']) delete globalThis[k];
}

fs.mkdirSync(path.join(ROOT, "qa", "out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa", "out", "unit-sim.json"), JSON.stringify(res, null, 1));
console.log(`${res.checks.filter(c => c.pass).length}/${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
