// js/life/football/bridge.js: the one football module that reads and writes the classic game state: S (the career),
// the classic world W of js/world.js (clubs, players, fixtures; never the 3D scene's W of build.js, which this module
// does not import), MT (the match mirror the rest of the game reads) and the classic functions of js/*.js. It builds
// the simulation's configuration from a fixture, keeps MT current while the match runs, writes the crash-recovery
// checkpoint, applies the judgement of the player's decisions, and at full time hands the result to the world
// (finaliseMatch with fixed ratings) and to the career (match.js matchRewards).
// Owner: WP-E. Contract DESIGN 1.4.16 (bridge); behaviour 3.4.2 to 3.4.5; S.life.inMatch of 1.7.
//
// Not a pure module: it is the boundary. The classic scripts' top-level bindings (S, W, MT and their functions) are
// read by name; every optional helper is behind a typeof guard, so the module also loads in a page or a test that
// only has part of the game.

import {createMatch, TEMPO, HALF_REAL, CALIBRATED} from "./sim.js";
import {attrsForPlayer, attrsForAI} from "./attrs.js";
import {makePitch} from "./pitchspec.js";
import {countersAll, ratingsAll, rateAgent, deriveMy, teamStats, goalLists, highlights, minuteOf, minsOn} from "./events.js";
import {judgeDecision} from "./judge.js";
import {hashStr} from "./rng.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const has = name => typeof globalThis[name] === "function";

// the bridge's numbers
export const BRIDGE = Object.freeze({
  CHEM_CAP: 4,                    // the judge moves chemistry by at most this much in one match, either way
  BENCH: 7,                       // substitutes named
  NAT_SHAPE: ["GK", "LB", "CB", "CB", "RB", "CM", "CDM", "CM", "LW", "ST", "RW"],   // nations play 4-3-3 (3.2.2)
  ROLL: [1.25, 1.18, 1.12, 1.06, 1.0],                                            // grass by stadium tier (worse pitches hold the ball)
  NERVES_CAP: 0.45
});
// a world player's position code as a slot it is familiar with (positions.js POSITIONS keys)
const SLOT_OF_POS = {GK: "GK", DF: "CB", CM: "CM", CAM: "CAM", LW: "LW", RW: "RW", ST: "ST"};

/* ---------- the player's numbers on the day ---------- */

// The player's effective skills (1.4.16): S.skills less the crowd's nerves and tired legs (at most 45%), composure
// exempt. S.skills itself is never touched, so a level-up during the match is kept (the old matchSkillsOn/Off pair
// restored a copy taken at kick-off over it). The rule is career.js effSkills (1.4.19, one implementation); the copy
// below only serves a page or a test that loads the bridge without career.js.
export function effSkills(){
  if (has("effSkills")) return globalThis.effSkills();
  const out = {};
  const sk = (typeof S !== "undefined" && S && S.skills) || {};
  const m = typeof MT !== "undefined" && MT ? MT : {};
  const hit = Math.min(BRIDGE.NERVES_CAP, (+m.nerves || 0) + (+m.tired || 0));
  for (const k of Object.keys(sk)) out[k] = k === "composure" ? sk[k] : Math.max(5, Math.round(sk[k]*(1 - hit)));
  return out;
}

/* ---------- the configuration ---------- */

// the shape a side lines up in: a club's own (positions.js), a nation's 4-3-3
function shapeOf(f, sideId){
  if (f.kind === "N" || !has("formationSlots")) return BRIDGE.NAT_SHAPE.slice();
  const c = W.clubs[sideId];
  return c ? formationSlots(c) : BRIDGE.NAT_SHAPE.slice();
}
// XI to slots, greedy by posFamiliarity (3.2.2): the player in the slot the club gives him, then every pair best first
function assignSlots(xi, slots, meSlot){
  const n = Math.min(xi.length, slots.length), slotOf = new Array(xi.length).fill(null), taken = new Set();
  const meI = xi.findIndex(p => p && p.me);
  if (meI >= 0 && meSlot){ const j = slots.indexOf(meSlot); if (j >= 0){ slotOf[meI] = meSlot; taken.add(j); } }
  const fam = (p, s) => has("posFamiliarity") ? posFamiliarity(SLOT_OF_POS[p.pos] || p.pos, s) : (SLOT_OF_POS[p.pos] === s ? 1 : 0.3);
  const pairs = [];
  for (let i = 0; i < xi.length; i++){
    if (slotOf[i] || !xi[i]) continue;
    for (let j = 0; j < slots.length; j++) if (!taken.has(j)) pairs.push({i, j, q: fam(xi[i], slots[j])});
  }
  pairs.sort((a, b) => b.q - a.q || a.j - b.j || a.i - b.i);
  for (const p of pairs){
    if (slotOf[p.i] || taken.has(p.j)) continue;
    slotOf[p.i] = slots[p.j]; taken.add(p.j);
  }
  for (let i = 0; i < n; i++) if (!slotOf[i]) slotOf[i] = slots.find((s, j) => !taken.has(j) && (taken.add(j), true)) || "CM";
  return slotOf;
}
const archOfSlot = slot => slot === "GK" ? "GK" : has("archOf") ? archOf(slot) : ({LB: "DF", CB: "DF", RB: "DF", LWB: "DF", RWB: "DF", CDM: "CM", CM: "CM", CAM: "AM", LM: "W", RM: "W", LW: "W", RW: "W", LF: "ST", RF: "ST", CF: "ST", ST: "ST"}[slot] || "CM");
const nameOf = p => p.me ? ((S.player && S.player.name) || "You") : has("pname") ? pname(p) : String(p.id);
const footOf = foot => foot === "L" || foot === "Left" ? "Left" : foot === "B" || foot === "Both" ? "Both" : "Right";

// one side's team record for the simulation
function sideTeam(f, M, sideId, xi, isUs, kit){
  const slots = shapeOf(f, sideId);
  const meSlot = isUs && S.player ? S.player.teamPos : null;
  const slotOf = assignSlots(xi, slots, meSlot);
  const name = has("sideName") ? sideName(f, M.home === isUs ? "h" : "a") : (isUs ? M.nameUs : M.nameThem);
  const players = xi.map((p, i) => {
    const slot = slotOf[i] || "CM", me = !!p.me;
    return {pid: p.id, name: me ? S.player.name : nameOf(p), number: p.no || i + 1, slot, arch: archOfSlot(slot), isGK: slot === "GK", isMe: me,
      at: me ? attrsForPlayer(effSkills(), S.items || {}, S.traits || {}) : attrsForAI({id: p.id, ovr: p.ovr, pos: p.pos}),
      energy: me ? clamp(+S.energy || 0, 0, 100) : 100, fatigue: me ? clamp(+S.fatigue || 0, 0, 100) : 0,
      prefFoot: me ? footOf(S.player.foot) : "Right", items: me ? S.items || null : null};
  });
  // the bench: a keeper and the best of the rest of the squad
  const inXI = new Set(xi.map(p => p.id));
  let pool = f.kind === "N" ? (has("natSquad") ? natSquad(sideId) : []) : (has("squadOf") ? squadOf(sideId) : []);
  pool = pool.filter(p => p && !inXI.has(p.id) && !p.inj);
  const gk = pool.filter(p => p.pos === "GK").sort((a, b) => b.ovr - a.ovr)[0];
  const rest = pool.filter(p => p.pos !== "GK").sort((a, b) => b.ovr - a.ovr).slice(0, BRIDGE.BENCH - (gk ? 1 : 0));
  const bench = (gk ? [gk] : []).concat(rest).map((p, i) => {
    const slot = SLOT_OF_POS[p.pos] || "CM";
    return {pid: p.id, name: nameOf(p), number: p.no || 12 + i, slot, arch: archOfSlot(slot), isGK: slot === "GK",
      isMe: !!p.me, at: p.me ? attrsForPlayer(effSkills(), S.items || {}, S.traits || {}) : attrsForAI({id: p.id, ovr: p.ovr, pos: p.pos}), energy: 100};
  });
  return {name, short: String(name || "").slice(0, 3).toUpperCase(), kit: kit || null, formation: slots, players, bench,
    ovr: xi.reduce((s, p) => s + (+p.ovr || 0), 0)/Math.max(1, xi.length)};
}

// the seed of a fixture (D6): hashStr(f.key + "|" + S.cid + "|" + S.life.day), so the same fixture of the same career on
// the same day replays the same match
export function seedOf(f){
  return hashStr(`${f.key}|${S && S.cid != null ? S.cid : ""}|${S && S.life ? S.life.day : 0}`);
}

// The simulation's configuration (1.4.16) from a fixture and the MT of match.js matchSetup. opts = {seed, resume
// (S.life.inMatch of a checkpoint), visible, benchSide}. Home is team 0. The tempo and the half length come from
// S.speed, Standard when that setting is not calibrated yet (D3).
export function matchConfig(f, M = MT, opts = {}){
  const speed = CALIBRATED[S.speed] ? S.speed : 2;
  const usTeam = M.home ? 0 : 1;
  const homeXI = M.home ? M.usXI : M.themXI, awayXI = M.home ? M.themXI : M.usXI;
  const homeId = M.home ? M.usId : M.themId, awayId = M.home ? M.themId : M.usId;
  const kits = M.home ? [M.myKit, M.oppKit] : [M.oppKit, M.myKit];
  const teams = [sideTeam(f, M, homeId, homeXI, M.home, kits[0]), sideTeam(f, M, awayId, awayXI, !M.home, kits[1])];
  const meP0 = teams[usTeam].players.find(p => p.isMe) || teams[usTeam].bench.find(p => p.isMe);
  // a substitute starts on the bench: the man in his slot plays until the call (sim.js benchMe)
  const role = M.role || "starter";
  // the planned changes (the call off the bench, the rotation's early exit); none when the match is being played out
  // after a crash: the player counts as substituted at the checkpoint and stays off (3.4.4, sim.js applyResume)
  const roleTimes = {};
  if (!opts.resume && role === "rotation" && M.subOff) roleTimes.subOff = M.subOff;
  if (!opts.resume && (role === "sub" || role === "cameo") && M.subOn) roleTimes.subOn = M.subOn;
  const tier = M.stad ? clamp(M.stad.tier | 0, 0, 4) : 2;
  const seed = opts.seed != null ? opts.seed >>> 0 : seedOf(f);
  const cfg = {seed, mode: "match", spec: makePitch({boards: true, roll: BRIDGE.ROLL[tier]}), halfRealSec: HALF_REAL[speed], tempo: Object.assign({}, TEMPO[speed]),
    teams, me: {team: usTeam, slot: meP0 ? meP0.slot : null, prefFoot: footOf(S.player && S.player.foot), chem: +S.chem || 0, trust: +S.trust || 0,
      traits: Object.assign({}, S.traits || {}), staminaF: has("staminaF") ? staminaF() : null, role},
    rules: {offside: true, cards: true, subs: 5}, roleTimes, friendly: f.kind === "F", fkey: f.key,
    ovr: [Math.round(teams[0].ovr*10)/10, Math.round(teams[1].ovr*10)/10]};
  if (opts.benchSide != null) cfg.benchSide = opts.benchSide;
  // the wall clock the headless runs are time-sliced by (sim.runHeadless): the page's, handed in from here
  if (typeof performance !== "undefined" && performance.now) cfg.now = () => performance.now();
  if (opts.visible) cfg.visible = opts.visible;
  if (opts.resume){
    // crash recovery (3.4.4): the score, the goals and the clock of the checkpoint, the seed moved on by its step
    const r = opts.resume;
    cfg.seed = (r.seed + (r.step || 0)) >>> 0;
    cfg.resume = {score: (r.score || [0, 0]).slice(), goals: r.goals || {home: [], away: []}, half: r.half || 1, sec: r.sec || 0,
      total: r.tot != null ? r.tot : null, subsUsed: (r.subsUsed || [0, 0]).slice(), counters: r.counters || null, on: r.on || [],
      my: r.my || null, mins: r.mins || 0};
  }
  return cfg;
}

/* ---------- while it runs ---------- */

// MT kept current for the rest of the game (awards, feed, phone): the score, the minute, both goal lists and the
// stat rows, from the events as they come (subscribe it with sim.on(ms, '*', liveMirror))
export function liveMirror(ms, ev){
  if (typeof MT === "undefined" || !MT) return;
  const us = MT.home ? 0 : 1;
  MT.minute = minuteOf(ms);
  MT.label = `${MT.minute}'`;
  if (ev && ev.kind === "goal" && !ev.disallowed){
    const pid = id => { const a = ms.agents[id]; return a && a.pid != null ? a.pid : -1; };
    const g = {s: ev.ownGoal ? -1 : pid(ev.scorer), a: ev.assister >= 0 ? pid(ev.assister) : -1, min: ev.min};
    (ev.team === us ? MT.usGoals : MT.themGoals).push(g);
  }
  MT.score = [ms.score[us], ms.score[1 - us]];
  const st = ms.stats;
  MT.stats = {shots: [st.shots[us], st.shots[1 - us]], corners: [st.corners[us], st.corners[1 - us]],
    cards: [st.yellows[us] + st.reds[us], st.yellows[1 - us] + st.reds[1 - us]]};
}

// Everything the career hears while the match runs, wired to the simulation's events: the MT mirror, the player's
// cards (bookPlayer), the judgement of his decisions (the 'verdict' events, judged here once), and his injury
// (meP().inj, 1 to 3 weeks). Returns the function that unhooks them. sub: sim.js on.
export function attach(ms, sub){
  const offs = [];
  offs.push(sub(ms, '*', ev => liveMirror(ms, ev)));
  const mine = ev => { const a = ms.agents[ev.agent]; return !!(a && a.isMe); };
  offs.push(sub(ms, 'card', ev => { if (mine(ev)) bookPlayer(ev.color === 'red' ? 'red' : 'yellow'); }));
  offs.push(sub(ms, 'verdict', ev => { if (mine(ev)){ const j = judge(ev.rec, ev.res); ev.applied = {chem: j.chem, trust: j.trust}; } }));
  offs.push(sub(ms, 'injury', ev => {
    if (!mine(ev) || !has("meP")) return;
    const p = meP();
    if (p) p.inj = has("ri") ? ri(1, 3) : 2;
    if (typeof MT !== "undefined" && MT) MT.injuredOff = true;
  }));
  return () => { for (const f of offs) if (f) f(); };
}

// the player's agent: on the pitch, gone off, or still on the bench
function meAgent(ms){
  if (ms.me >= 0) return ms.agents[ms.me];
  if (ms.resumedMe != null) return ms.agents[ms.resumedMe];
  return ms.agents.find(a => a.isMe) || null;
}
// his on-pitch intervals in match minutes (a.on is in match seconds: 1.4.13)
function onMinutes(ms, a){
  if (!a) return [];
  return a.on.map(iv => [Math.round(iv[0]/60), Math.round((iv[1] == null ? ms.clock.total : iv[1])/60)]);
}

// The checkpoint (3.4.4, 1.7): S.life.inMatch from the state now; the caller saves straight after (persistNow) at a
// dead ball. Returns the record.
export function checkpoint(ms){
  const f = MT && MT.f;
  if (!f || !S.life) return null;
  const C = countersAll(ms), me = meAgent(ms), c = me ? C[me.id] : null;
  const rs = ms.cfg.resume;
  const rec = {v: 1, fkey: f.key, cid: S.cid != null ? S.cid : null, seed: ms.cfg.seed >>> 0, half: ms.half, sec: Math.round(ms.clock.sec*100)/100,
    tot: Math.round(ms.clock.total*100)/100, step: ms.step,
    score: ms.score.slice(), goals: goalLists(ms), my: me ? deriveMy(ms, me.id, C) : null, counters: c ? Object.assign({}, c) : (rs && rs.counters) || null,
    role: MT.role || "starter", on: me ? onMinutes(ms, me) : [], mins: c ? c.mins : 0, energy: me ? Math.round(me.energy*10)/10 : +S.energy || 0,
    fatigueAcc: me ? Math.round(me.acc.drain*100)/100 : 0, booked: me ? (me.booked || 0) + (me.sentOff ? 1 : 0) : 0, subsUsed: ms.subs.used.slice(), late: !!MT.late,
    ts: Date.now()};
  S.life.inMatch = rec;
  ms.checkpointDue = false;
  return rec;
}

// the interrupted match, when there is one to finish (3.4.4): the record, or null
export function resumeInfo(){
  const r = typeof S !== "undefined" && S && S.life ? S.life.inMatch : null;
  if (!r) return null;
  if (typeof W !== "undefined" && W && W.done && W.done[r.fkey]) return null;
  return r;
}

/* ---------- the player's decisions ---------- */

// The judgement of one decision (3.2.11): judge.js, then the chemistry (at most 4 either way over the match), the
// traits and the manager's trust. Returns the judgement.
export function judge(rec, result){
  const j = judgeDecision(rec, result);
  if (typeof MT !== "undefined" && MT){
    const used = MT.chemJ || 0, room = j.chem > 0 ? BRIDGE.CHEM_CAP - used : -BRIDGE.CHEM_CAP - used;
    const chem = j.chem > 0 ? Math.min(j.chem, Math.max(0, room)) : Math.max(j.chem, Math.min(0, room));
    j.chem = Math.round(chem*100)/100;
    MT.chemJ = used + j.chem;
    MT.chemD = (MT.chemD || 0) + j.chem;
  }
  if (j.chem && has("chemAdd")) chemAdd(j.chem);
  if (has("trait")) for (const k of Object.keys(j.traits || {})) if (j.traits[k]) trait(k, j.traits[k]);
  if (j.trust && has("trustAdd")) trustAdd(j.trust);
  return j;
}

// a drink at half time, from the player's own stock (S.inv): consume()'s result
export function drink(id){ return has("consume") ? consume(id) : {ok: false, why: "Nothing to drink."}; }

// a card for the player: match.js bookPlayer (the ban, the trust, the news)
export function bookPlayer(kind){ return has("bookPlayer") ? globalThis.bookPlayer(kind) : false; }

/* ---------- full time ---------- */

// Full time (3.4.3): every rating; the world's record of the match (finaliseMatch with the ratings fixed); MT filled
// for the card and the rest of the game; the career's rewards (match.js matchRewards); S.life.inMatch cleared.
// Returns {rating, out (finaliseMatch's result), R (matchRewards' result), highlights}.
export function finish(ms){
  const C = countersAll(ms), RT = ratingsAll(ms, C);
  const us = MT.home ? 0 : 1;
  const me = meAgent(ms);
  const rs = ms.cfg.resume || null;
  // the player: his own counters; after a crash, the counters of the checkpoint (he came off there)
  let myC = me ? C[me.id] : null, rating = me ? RT[me.id] : null;
  if (rs && rs.counters && (!me || !me.on.length)){
    myC = rs.counters;
    const my = ms.score[us], th = ms.score[1 - us];
    const slot = ms.cfg.me && ms.cfg.me.slot;
    rating = rateAgent(myC, me ? me.arch : slot ? archOfSlot(slot) : "CM", {mins: myC.mins, res: my > th ? "W" : my < th ? "L" : "D", conceded: myC.conceded, sub: true});
  }
  if (rating == null) rating = 6.0;
  // the world: both line-ups (with the substitutes who came on), the goals, the ratings fixed
  const xiOf = team => {
    const out = [], seen = new Set();
    for (const a of ms.agents){
      if (a.team !== team || a.role !== "player" || !(a.on.length || (rs && a === me))) continue;
      const p = a.pid != null && W.players ? W.players[a.pid] : null;
      if (p && !seen.has(p.id)){ seen.add(p.id); out.push(p); }
    }
    return out;
  };
  const fixed = {};
  for (const a of ms.agents){ if (a.role === "player" && a.pid != null && RT[a.id] != null) fixed[a.pid] = RT[a.id]; }
  if (me && me.pid != null) fixed[me.pid] = rating;
  const G = goalLists(ms);
  const hx = xiOf(0), ax = xiOf(1);
  const out = has("finaliseMatch") ? finaliseMatch(MT.f, hx, ax, G.home, G.away, fixed) : {motm: -1, rt: fixed};
  // MT for the full-time card and everything that reads it
  MT.score = [ms.score[us], ms.score[1 - us]];
  MT.usGoals = us === 0 ? G.home : G.away; MT.themGoals = us === 0 ? G.away : G.home;
  const ts = teamStats(ms);
  MT.stats = {shots: [ts.shots[us], ts.shots[1 - us]], onTarget: [ts.onTarget[us], ts.onTarget[1 - us]], corners: [ts.corners[us], ts.corners[1 - us]],
    cards: [ts.cards[us], ts.cards[1 - us]], possession: [ts.possession[us], ts.possession[1 - us]], fouls: [ts.fouls[us], ts.fouls[1 - us]],
    offsides: [ts.offsides[us], ts.offsides[1 - us]]};
  MT.my = me && me.on.length ? deriveMy(ms, me.id, C) : (rs && rs.my) || (me ? deriveMy(ms, me.id, C) : MT.my);
  MT.on = rs && rs.on && (!me || !me.on.length) ? rs.on : onMinutes(ms, me);
  MT.minute = 90; MT.label = "FT";
  MT.sentOff = !!(me && me.sentOff);
  // how hard the legs worked: the mean drain per minute on the pitch (1.5.2 fatigue on return)
  const mins = myC ? myC.mins : 0;
  MT.drainPerMin = me && mins > 0 ? me.acc.drain/mins : null;
  MT.highlightsFP = me ? highlights(ms, me.id) : [];
  if (me && me.on.length) S.energy = clamp(Math.round(me.energy*10)/10, 0, 100);
  // the career
  const R = has("matchRewards") ? matchRewards(MT, rating, out) : null;
  if (S.life) delete S.life.inMatch;
  return {rating, out, R, highlights: MT.highlightsFP};
}
