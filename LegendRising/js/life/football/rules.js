// js/life/football/rules.js: the referee and his assistants. Who has the ball, offside (Law 11: the snapshot at the
// kick, the offence at involvement, the flag's delay, the borderline error), the ball out of play and goals (own goals
// and deflections attributed), every restart (kick-off, throw-in, goal kick, corner, free kick, penalty, dropped ball)
// with one live ball and spare balls on cones (a ball is only ever moved by a body carrying, throwing or kicking it),
// fouls from contact, cards, advantage, the clock and stoppage time, the end of each half, substitutions and injuries.
// Owner: WP-E. Contract DESIGN 1.4.14 (refStep, onKick, onTouch, startRestart, restartReady, offsidePosition,
// bookAgent); numbers 1.5.5 (timings), 1.5.7 (offside); behaviour 3.2.7 to 3.2.10.
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no Math.random (the match RNG ms.r decides the
// assistant's borderline error, injuries and the like).

import {ballHold, ballRelease, ballStep, createBallWorld, rollSpeedFor, rollDistance, BALL} from "./ball.js";
import {inBox} from "./pitchspec.js";
import {solveStrike} from "./strike.js";
import {logEv, chainControl, chainOut, chainGoal, chainOffside, chainDead, minuteOf, onSec} from "./events.js";
import {xT, noteTurnover, SLOT_POS, depthOf} from "./tactics.js";
import {createAgent} from "./agent.js";
import {hypot, sin, cos} from "./detmath.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const R = BALL.R;

// 1.5.5, 1.5.7, 3.2.8 to 3.2.10 numbers
export const RULES = Object.freeze({
  LIMIT: {throw: 6, goalkick: 7, corner: 8, free: 8, freeWall: 14, indirect: 8, penalty: 12, kickoff: 15, kickoff0: 25, drop: 6},
  SLOW: 8,                                   // a restart slower than this (real s) adds 10 s of stoppage
  STOP: {goal: 30, sub: 30, injury: 45, card: 15, slow: 10},
  ADDED: [[1, 4], [1, 6]],
  HALF_CAP: 20,                              // real seconds past added time at most
  OFF: {body: 0.25, eps: 0.01, flag0: 0.35, flagK: 0.4, whistle: 0.25, border: 0.2, errP: 0.15, near: 1.5},
  ADV: {xt: 0.08, signal: 2},
  CARD: {yellow: 0.6, red: 0.92, tactical: 0.15, injury: 0.85, injuryP: 0.08, dogsoV: 3},
  SPARE_NEAR: 6,                             // the game ball is used if it lies this close to the spot
  CARRY: 3.6, CARRY_FAR: 7,                  // a ball carried in the hands: a jog near the spot, a run further out
  SERVE: 20,                                 // a ball further than this from the spot is served to the taker
  SERVE_ROLL: 15,                            // served along the grass up to this far, in the air beyond
  SERVE_MAX: 38,                             // the longest serve (carried closer first)
  PLACE_MAX: 50,                             // a team-mate carries the ball this far to put it on the spot for a specialist
  WALL_D: 9.15, WALL_GAP: 0.62, WALL_POST: 0.6, WALL_JUMP: 0.6,
  READY_D: 2, CELEBRATE: 3,
  TAKER_AT: 2.6, SPRINT_D: 20, HURRY: 8,     // the taker is at the ball within TAKER_AT (his run-up spot is 1.8 m back at most);
                                             // he sprints to a spot further than SPRINT_D; a ball further than HURRY is sprinted for
  HANDOVER: 10,                              // past the restart's limit, a taker still further than this (m) from the ball leaves
                                             // it to the man nearest it (3.2.8: the AI takes it from where everyone is)
  SUBS: 5,
  THROW_FB: 10,                              // a full-back takes his side's throw-in when within this much of the winger's distance
  SERVE_MEET: 1.2,                           // seconds a served ball costs beyond its flight: meeting it and carrying it in
  NEAR_SLOW: 1.5, NEAR_T: 0.6, NEAR_V: 1.2,  // a man this near the ball he is fetching (or the spot he is carrying it to) for
                                             // longer than this without getting there walks the rest, at this speed at most
  BOX_EDGE: [18.5, 22],                      // at a set piece into the box, its edge counts: 18.5 m out, 22 m across
  FLYING: 10,                                // a dead ball in the air faster than this (m/s) is let go when a spare is to hand
  DEAD_ROLL: 4.0                             // a dead ball rolls on against this (m/s2): the ball boys, the boards and the
                                             // players stop it (the grass's own value again once it is back in play)
});

/* The laws a match is played to (1.4.13 cfg.rules), read once at kick-off into ms.rules (lawsOf). cfg.mode gives the
   defaults: a match ('match') plays every law with five changes a side; a training block (the partial simulations of
   3.6.2: any other mode of MODES) plays without offside, cards, changes, half time or added time unless its own rules
   ask for them. A law switched off:
     offside   no snapshot at a kick, so nobody is ever flagged (offsidePosition still answers, for the HUD's pip)
     cards     fouls are given and never booked
     subs      the changes a side may make (0: none; an injured man walks off and is not replaced)
     halfTime  one period: the end of the first half is full time
     stoppage  no added time: a half ends at 45:00, by the same end-of-half rule as after added time
     restarts  no set pieces: a ball out of play or a foul restarts with a kick-in (an indirect free kick from where
               it happened, inside the field, no wall, no penalty); a kick-off stays a kick-off
     goals     2: both goals count; 1: only the goal at the +x end; 0: neither (a ball into a goal that does not count
               is out over the goal line) */
export const MODES = Object.freeze(['match', 'rondo', 'ssg', 'pattern', 'finishing', 'drill', 'lesson']);
export const LAWS = Object.freeze({
  match: Object.freeze({offside: true, cards: true, subs: RULES.SUBS, halfTime: true, stoppage: true, restarts: true, goals: 2}),
  training: Object.freeze({offside: false, cards: false, subs: 0, halfTime: false, stoppage: false, restarts: true, goals: 2})
});
export function lawsOf(cfg = {}){
  const mode = cfg.mode == null ? 'match' : cfg.mode;
  if (!MODES.includes(mode)) throw new Error(`createMatch: unknown mode "${mode}" (one of ${MODES.join(', ')})`);
  const base = mode === 'match' ? LAWS.match : LAWS.training, r = cfg.rules || {}, out = {mode};
  for (const k of Object.keys(base)){
    const v = r[k];
    out[k] = v == null ? base[k] : k === 'subs' || k === 'goals' ? Math.max(0, Math.round(+v || 0)) : !!v;
  }
  out.goals = Math.min(2, out.goals);
  return Object.freeze(out);
}
const laws = ms => ms.rules || LAWS.match;
// one law of the match (lawsOf's keys), for the brains: is offside played, are there set pieces
export const lawOf = (ms, k) => laws(ms)[k];
// does a ball over the goal line at this end, in the mouth, count as a goal (laws.goals)
export const goalCounts = (ms, end) => { const g = laws(ms).goals; return g >= 2 || (g === 1 && end > 0); };

// a dead ball rolls against RULES.DEAD_ROLL (its own grass value kept in deadRoll0 until it is back in play)
function deadRoll(b){ if (b.deadRoll0 == null){ b.deadRoll0 = b.rollDecel; b.rollDecel = Math.max(b.rollDecel, RULES.DEAD_ROLL); } }
export function liveRoll(b){ if (b.deadRoll0 != null){ b.rollDecel = b.deadRoll0; b.deadRoll0 = null; } }

/* ---------- possession ---------- */

// the agent now in control of the ball (a reception, a collection, a tackle that keeps it, a keeper's catch)
export function setCtl(ms, a){
  const P = ms.poss;
  if (P.team !== a.team){
    if (P.team >= 0){
      // how many of the new side are ahead of the ball (a counter needs three)
      let ahead = 0;
      const bu = ms.dirs[a.team]*ms.ball.p.x;
      for (const o of ms.agents) if (o.team === a.team && o.onPitch && !o.isGK && ms.dirs[a.team]*o.m.x > bu + 2) ahead++;
      logEv(ms, 'possession', a.team, a.id, a.m.x, a.m.z, {from: P.team, to: a.team, ahead});
      noteTurnover(ms, P.team);
    }
    P.team = a.team; P.since = ms.t;
  }
  P.ctl = a.id; P.agent = a.id;
}
// nobody in control: a loose ball (the team keeps possession for the shape until the other side touches it)
export function clearCtl(ms){ ms.poss.ctl = -1; }

/* ---------- offside (3.2.7, 1.5.7) ---------- */

// Is attacker (of team passerTeam) in an offside position now? Body point 0.25 m toward the goal line he attacks;
// offside when that point is past both the second-last opponent's (keeper counted) and the ball by more than 0.01 m
// and in the opponents' half. margin: metres past the line (negative: onside by that much).
export function offsidePosition(ms, attacker, passerTeam = attacker.team){
  const dir = ms.dirs[passerTeam], L = ms.spec.L, B = RULES.OFF.body;
  const ua = dir*attacker.m.x + L/2 + B;
  let o1 = -1e9, o2 = -1e9;
  for (const o of ms.agents){
    if (o.team !== 1 - passerTeam || !o.onPitch || o.role !== 'player') continue;
    const u = dir*o.m.x + L/2 + B;
    if (u > o1){ o2 = o1; o1 = u; } else if (u > o2) o2 = u;
  }
  const bu = dir*ms.ball.p.x + L/2;
  const line = Math.max(o2 > -1e8 ? o2 : L/2, bu);
  const margin = ua - line;
  const off = margin > RULES.OFF.eps && ua > L/2 + 0.06;
  return {off, margin: off ? margin : Math.min(margin, ua - L/2), line};
}

// The snapshot (3.2.7) at the contact of every kick by the attacking team except goal kicks, throw-ins and corners:
// every team-mate of the kicker offside at that moment, or within 0.2 m of the line (the assistant can err either way)
export function onKick(ms, ev){
  const O = ms.offside;
  O.set.clear(); O.passer = -1;
  if (ev.noOffside || !laws(ms).offside) return;
  const team = ev.team;
  O.snap = ms.step; O.t = ms.t; O.passer = ev.agent; O.team = team;
  for (const a of ms.agents){
    if (a.team !== team || !a.onPitch || a.id === ev.agent || a.role !== 'player') continue;
    const p = offsidePosition(ms, a, team);
    if (p.off || Math.abs(p.margin) < RULES.OFF.border) O.set.set(a.id, p.off ? p.margin : p.margin);
  }
  if (O.set.size) ev.offSnap = Array.from(O.set.keys());
}

// A touch (3.2.7 involvement and reset, possession). how: 'control' | 'dribble' | 'deflect' | 'block' | 'save' |
// 'tackle' | 'header' | 'kick'. A player in the snapshot who plays the ball (deflections included), or is within
// 1.5 m of it while an opponent within 1.5 m plays it, is involved: the flag goes up after its delay. A deliberate
// opponent touch (not a deflection or a save) resets the snapshot. The contract's form, onTouch(ms, ev) (1.4.14), takes
// the event the touch logged: its agent, and its how (a 'touch' event's own, else the event's kind: a 'kick' or a
// 'save'). The simulation's own callers pass the agent and the how they already hold: onTouch(ms, a, how, ev).
export function onTouch(ms, a, how, ev = null){
  if (a && !a.m && a.agent != null){
    ev = a; a = ms.agents[ev.agent]; if (!a) return;
    how = ev.how || (ev.kind === 'kick' || ev.kind === 'save' ? ev.kind : 'control');
  }
  const O = ms.offside;
  if (O.set.size && !O.pending){
    if (a.team === O.team && O.set.has(a.id)){
      involve(ms, a, O.set.get(a.id));
    } else if (a.team === O.team){
      // an onside team-mate plays it: the phase that pass began is over (the next kick takes a new snapshot)
      if (how !== 'deflect' && how !== 'block') O.set.clear();
    } else if (a.team !== O.team){
      // an opponent plays at it with an offside attacker challenging within 1.5 m
      const b = ms.ball.p;
      for (const [id, m] of O.set){
        const o = ms.agents[id];
        if (!o || hypot(o.m.x - b.x, o.m.z - b.z) > RULES.OFF.near || hypot(a.m.x - b.x, a.m.z - b.z) > RULES.OFF.near) continue;
        if (m > RULES.OFF.eps){ involve(ms, o, m); break; }
      }
      if (!O.pending && how !== 'deflect' && how !== 'save' && how !== 'block') O.set.clear();
    }
  }
  // advantage: the fouled side lost it before the advantage came good: the free kick is given after all
  const AV = ms.advantage;
  if (AV && a.team !== AV.team && how !== 'deflect' && ms.t < AV.until){
    ms.advantage = null;
    whistleFoul(ms, AV.foul);
  }
}
function involve(ms, a, margin){
  const O = ms.offside;
  // the assistant's call: certain beyond 0.2 m, a seeded mistake within it (both ways)
  let called = margin > RULES.OFF.eps;
  if (Math.abs(margin) < RULES.OFF.border){
    const pErr = RULES.OFF.errP*(1 - Math.abs(margin)/RULES.OFF.border);
    if (ms.r() < pErr) called = !called;
  }
  O.set.clear();
  if (!called) return;
  const delay = RULES.OFF.flag0 + RULES.OFF.flagK*(1 - clamp(margin, 0, 1));
  O.pending = {who: a.id, margin, t: ms.t, flagAt: ms.t + delay, whistleAt: ms.t + delay + RULES.OFF.whistle, x: a.m.x, z: a.m.z,
    passer: O.passer, team: a.team, flagged: false};
}

/* ---------- the ball out of play, goals ---------- */

// the team defending the goal at an end (-1 or +1)
export const defenderOf = (ms, end) => ms.dirs[0] === -end ? 0 : 1;

// ball.js 'out' {line, end, x, z, t}
export function ballOut(ms, d){
  if (ms.phase !== 'live') return;
  const b = ms.ball, last = b.last.team;
  b.state = 'dead';
  logEv(ms, 'out', last, b.last.agent, d.x, d.z, {line: d.line, lastTeam: last});
  chainOut(ms, d.line, last);
  ms.offside.set.clear();
  if (ms.offside.pending && !ms.offside.pending.flagged) ms.offside.pending = null;
  const spec = ms.spec;
  if (d.line === 'touch'){
    const team = last >= 0 ? 1 - last : 0;
    const x = clamp(d.x, -spec.hx + 0.5, spec.hx - 0.5), z = (d.z > 0 ? 1 : -1)*(spec.hz - 0.05);
    startRestart(ms, 'throw', team, {x, z});
  } else {
    const end = d.end, def = defenderOf(ms, end), side = d.z > 0 ? 1 : -1;
    if (last === def){
      startRestart(ms, 'corner', 1 - def, {x: end*(spec.hx - 0.4), z: side*(spec.hz - 0.4)});
    } else startRestart(ms, 'goalkick', def, {x: end*(spec.hx - 3.5), z: side*5.5});
  }
  clearCtl(ms);
}

// ball.js 'goal' {end, x, y, z, t}
export function goalScored(ms, d){
  if (ms.phase !== 'live') return;
  // a goal that is not in use (laws.goals): the ball has gone out over the goal line
  if (!goalCounts(ms, d.end)){ ballOut(ms, {line: 'goal', end: d.end, x: d.x, z: d.z, t: d.t}); return; }
  const b = ms.ball;
  b.state = 'dead';
  const team = ms.dirs[0] === d.end ? 0 : 1, def = 1 - team;
  // a goal inside the flag's delay is disallowed: the offside is given
  const pend = ms.offside.pending;
  if (pend && pend.team === team){
    logEv(ms, 'goal', team, -1, d.x, d.z, {disallowed: true, why: 'offside'});
    offsideCall(ms);
    return;
  }
  // a goal while advantage is being played: the advantage came good
  ms.advantage = null;
  const last = b.last, ch = ms.chain;
  let scorer = last.agent, ownGoal = false;
  let shot = ch.shot && ch.shot.team === team && !ch.shot.res ? ch.shot : null;
  // a save that did not keep it out (parried or tipped in, the keeper's touch the last): the shooter's goal, no save
  const sv = ch.saved;
  if (!shot && sv && sv.shot.team === team && last.kind === 'save' && last.team === def && ms.t - sv.t < 3){
    shot = sv.shot;
    if (shot.res === 'saved'){ ms.stats.saves[def] = Math.max(0, ms.stats.saves[def] - 1); ms.stats.onTarget[team] = Math.max(0, ms.stats.onTarget[team] - 1); }
    shot.res = null; ch.shot = shot;
    for (let i = ms.events.length - 1; i >= 0 && ms.events[i].t >= sv.t - 1e-9; i--){ const e = ms.events[i]; if (e.kind === 'save' && e.shot === shot.id) e.void = 'goal'; }
  }
  ch.saved = null;
  if (last.team === def){
    // a deflected shot on target is the shooter's; a defender's deliberate touch that turned it in is an own goal
    const deflected = last.kind === 'deflect' || last.kind === 'save' || last.kind === 'block';
    if (shot && (shot.onTarget || deflected)) scorer = shot.agent;
    else ownGoal = true;
  } else if (shot && last.agent !== shot.agent && last.kind === 'deflect') scorer = last.agent;
  const r = chainGoal(ms, team, scorer);
  const sc = ms.agents[scorer], s = r.shot || shot;
  const style = s ? {dist: Math.round(s.dist || 0), curl: !!s.finesse || Math.abs(s.curl || 0) > 0.3, fk: !!s.fk, pen: !!s.pen,
    header: s.intent === 'header'} : {dist: 0};
  ms.score[team]++;
  ms.stats.goals[team]++;
  const ev = logEv(ms, 'goal', team, scorer, d.x, d.z, {scorer, assister: ownGoal ? -1 : r.assister, ownGoal, shotEv: s ? s.id : -1,
    style, scorerName: sc ? sc.name : ''});
  ms.goalEv = ev;
  ms.stoppage[ms.half - 1] += RULES.STOP.goal;
  ms.offside.set.clear(); ms.offside.pending = null;
  clearCtl(ms);
  ms.phase = 'goal'; ms.goalT = ms.t;
  startRestart(ms, 'kickoff', def, {x: 0, z: 0}, {after: true});
  ms.phase = 'goal';
}

/* ---------- restarts (3.2.8) ---------- */

// Begin a restart. kind: 'kickoff' | 'throw' | 'goalkick' | 'corner' | 'free' | 'indirect' | 'penalty' | 'drop'.
// Chooses the taker and the ball (the game ball within 6 m of the spot, else the nearest spare on a cone), and who
// fetches it; the clock keeps running (1.5.5).
export function startRestart(ms, kind, team, spot, opt = {}){
  // no set pieces (laws.restarts): every restart but a kick-off is a kick-in from where it happened (an indirect free
  // kick with no wall and no set-piece line-up: R0.kickIn)
  const kickIn = !laws(ms).restarts && kind !== 'kickoff';
  if (kickIn){
    kind = 'indirect';
    spot = {x: clamp(spot.x, -ms.spec.hx + 0.5, ms.spec.hx - 0.5), z: clamp(spot.z, -ms.spec.hz + 0.5, ms.spec.hz - 0.5)};
  }
  const prev = ms.restart;
  if (prev && prev.kind !== kind) endRestartBookkeeping(ms, prev);
  chainDead(ms);
  if (ms.advantage){ const AV = ms.advantage; ms.advantage = null; if (AV.foul && !AV.foul.booked) bookFoul(ms, AV.foul); }
  const b = ms.ball;
  if (b.state === 'free') b.state = 'dead';
  deadRoll(b);
  // anyone holding the ball (a keeper) lets the hands go of it
  if (b.state === 'held' && kind !== 'goalkick') b.state = 'dead';
  // what everyone was doing stops with the whistle; a keeper's dive and a header already off the ground finish their
  // flight (it can no longer touch the ball: done), so nobody is left hanging in the air through the dead ball
  for (const a of ms.agents){
    if (a.act && a.act.kind !== 'dive' && a.role === 'player'){
      if (a.act.kind === 'header' && (a.act.air || a.act.dive && a.act.t >= a.act.jumpAt)) a.act.done = true;
      else { a.act = null; a.y = 0; a.vy = 0; }
    }
    a.drib = null; a.plan = null;
  }
  clearCtl(ms);
  const wall = kind === 'free' && isFKWallZone(ms, team, spot);
  const limit = kind === 'kickoff' ? (opt.first ? RULES.LIMIT.kickoff0 : RULES.LIMIT.kickoff) : kind === 'free' && wall ? RULES.LIMIT.freeWall : RULES.LIMIT[kind] || 8;
  const R0 = ms.restart = {kind, team, spot: {x: spot.x, z: spot.z}, taker: -1, fetcher: -1, ballFrom: 'game', spare: -1,
    ready: false, t0: ms.t, limit, stage: 'fetch', wall: [], noOff: kind === 'goalkick' || kind === 'throw' || kind === 'corner',
    first: !!opt.first, after: !!opt.after, placed: false, foul: opt.foul || null, offender: opt.offender != null ? opt.offender : -1,
    taken: false, lowerT: 0, tTake: -1, carrier: -1, kickIn, nearT: 0};
  R0.taker = pickTaker(ms, kind, team, spot);
  R0.special = kind === 'free' && hypot(ms.dirs[team]*ms.spec.hx - spot.x, spot.z) < 35;
  chooseSource(ms, R0);
  ms.phase = kind === 'kickoff' ? 'kickoff' : 'restart';
  if (kind === 'corner') ms.stats.corners[team]++;
  ms.checkpointDue = true;
  logEv(ms, 'whistle', team, -1, spot.x, spot.z, {why: kind === 'kickoff' ? (opt.first ? 'ko' : 'restart') : 'stop', rk: kind});
  return R0;
}
function endRestartBookkeeping(ms, R0){ R0.done = true; }

function isFKWallZone(ms, team, spot){
  const dir = ms.dirs[team], gx = dir*ms.spec.hx, d = hypot(gx - spot.x, spot.z);
  return d < 32;
}

// The restart's taker (3.2.8): kick-off the centre forward; throw-in the nearest full-back or winger on that side (or
// the nearest player, or the player himself when he is nearest and within 10 m); goal kick the keeper; corners and
// free kicks near goal the best curve + accuracy in the side (the player if he is the best, or trusted and within 2
// points); penalties the best accuracy + composure (the same rule at trust 50); anything else the nearest.
function pickTaker(ms, kind, team, spot){
  const ag = ms.agents.filter(a => a.team === team && a.onPitch && a.role === 'player' && !a.sentOff && !a.leaving && !a.injured);
  if (!ag.length) return -1;
  const near = list => { let best = null, bd = Infinity; for (const a of list){ const d = hypot(a.m.x - spot.x, a.m.z - spot.z); if (d < bd){ bd = d; best = a; } } return best; };
  const me = ms.me >= 0 ? ms.agents[ms.me] : null, trust = ms.cfg.me ? ms.cfg.me.trust || 0 : 0;
  const best = (key, need) => {
    const out = ag.filter(a => !a.isGK);
    let top = null, tv = -1;
    for (const a of out){ const v = key(a.at); if (v > tv){ tv = v; top = a; } }
    if (me && me.team === team && out.includes(me)){
      const mv = key(me.at);
      if (top === me || (trust >= need && mv >= tv - 2)) return me;
    }
    return top;
  };
  let t = null;
  if (kind === 'kickoff'){
    t = ag.find(a => a.slot === 'ST' || a.slot === 'CF') || ag.find(a => a.slotLine === 'FWD') || near(ag.filter(a => !a.isGK));
  } else if (kind === 'goalkick') t = ag.find(a => a.isGK) || near(ag);
  else if (kind === 'throw'){
    const side = spot.z > 0 ? 1 : -1;
    const wide = ag.filter(a => !a.isGK && /^(LB|RB|LWB|RWB|LM|RM|LW|RW)$/.test(a.slot) && (ms.dirs[team]*side > 0 ? /R/.test(a.slot) : /L/.test(a.slot)));
    // the full-back on that side takes it when he is not much further away than the winger (he comes up for it)
    const fb = near(wide.filter(a => /^(LB|RB|LWB|RWB)$/.test(a.slot))), nw0 = near(wide), no = near(ag.filter(a => !a.isGK));
    const df = fb ? hypot(fb.m.x - spot.x, fb.m.z - spot.z) : Infinity, dw0 = nw0 ? hypot(nw0.m.x - spot.x, nw0.m.z - spot.z) : Infinity;
    const nw = fb && df <= dw0 + RULES.THROW_FB ? fb : nw0;
    const dw = nw ? hypot(nw.m.x - spot.x, nw.m.z - spot.z) : Infinity, dn = no ? hypot(no.m.x - spot.x, no.m.z - spot.z) : Infinity;
    t = nw && dw <= dn + 10 ? nw : no;
    // the player takes it when he is his side's nearest man to it and within 10 m (3.2.8), and so does the harness's
    // stand-in for him (DESIGN 3.2.12: a winger's throw-ins beyond the oracle's rate are counted apart instead)
    if (me && me.team === team && me === no && hypot(me.m.x - spot.x, me.m.z - spot.z) < 10) t = me;
  } else if (kind === 'corner') t = best(at => at.curve + at.accuracy, 40);
  else if (kind === 'penalty') t = best(at => at.accuracy + at.composure, 50);
  else if (kind === 'free'){
    const dir = ms.dirs[team], d = hypot(dir*ms.spec.hx - spot.x, spot.z);
    t = d < 35 ? best(at => at.curve + at.accuracy, 40) : near(ag.filter(a => !a.isGK));
    if (d > 70) t = near(ag.filter(a => !a.isGK)) || near(ag);       // deep in his own half: the nearest outfield man
  } else t = near(ag.filter(a => !a.isGK)) || near(ag);
  return t ? t.id : -1;
}

// where the ball for the restart comes from, and who fetches it. The game ball when it rests within 6 m of the spot;
// otherwise the ball (the game ball where it will stop, or a spare on a cone) that gets to the spot soonest: the time
// the quickest team-mate needs to reach it, plus carrying it in (within SERVE m) or serving it to the taker along the
// grass (a long way: kicked through the air).
function chooseSource(ms, R0){
  const b = ms.ball, sp = R0.spot;
  R0.ballFrom = 'game'; R0.spare = -1;
  if (b.state === 'held' && R0.kind === 'goalkick' && b.holder === R0.taker){ R0.stage = 'carry'; R0.fetcher = R0.taker; return; }
  // the game ball already on the spot (a kick-off at the centre, a ball that stopped where the foul was)
  const still = hypot(b.v.x, b.v.y, b.v.z) < 0.3 && b.p.y < R + 0.05;
  if (still && hypot(b.p.x - sp.x, b.p.z - sp.z) < 0.4 && R0.kind !== 'throw'){
    R0.stage = 'wait'; R0.placed = true; R0.fetcher = R0.taker;
    return;
  }
  // where the game ball will come to rest (dead balls roll on until the boards or the grass stop them); a ball that
  // went over the boards into the stand is nobody's to fetch
  const rest = restOf(ms, b);
  let best = reachable(ms, rest.x, rest.z) ? sourceCost(ms, R0, rest.x, rest.z) : {t: Infinity, who: -1};
  R0.src = rest;
  // a game ball still flying away fast (struck as the whistle went) is nobody's to chase while a spare is to hand: it
  // only counts again if it comes down near (reconsiderSource)
  if (flyingAway(b) && hypot(rest.x - sp.x, rest.z - sp.z) > RULES.SPARE_NEAR) best = {t: Infinity, who: best.who};
  if (hypot(rest.x - sp.x, rest.z - sp.z) > RULES.SPARE_NEAR || best.t === Infinity){
    for (let i = 0; i < ms.spares.length; i++){
      const q = ms.spares[i];
      if (q.state !== 'cone') continue;
      const c = sourceCost(ms, R0, q.ball.p.x, q.ball.p.z);
      if (c.t + 0.3 < best.t || best.t === Infinity && c.t < Infinity){ best = c; R0.ballFrom = 'spare'; R0.spare = i; R0.src = {x: q.ball.p.x, z: q.ball.p.z}; }
    }
  }
  R0.fetcher = best.who >= 0 ? best.who : R0.taker;
}
// a dead ball still in the air and fast (struck as the whistle went)
const flyingAway = b => b.p.y > R + 0.2 && hypot(b.v.x, b.v.z) > RULES.FLYING;
// the time to carry a ball d metres in the hands (a jog near the spot, a run further out)
const carryT = d => d <= 6 ? d/RULES.CARRY : 6/RULES.CARRY + (d - 6)/RULES.CARRY_FAR;
// can a player get to a ball there: inside the boards (a ball resting against them included), not over them
const reachable = (ms, x, z) => Math.abs(x) <= ms.spec.runoff.hx + 0.05 && Math.abs(z) <= ms.spec.runoff.hz + 0.05;
// a restart whose taker is a specialist (or the keeper, or the centre forward): he goes to the spot and the ball is
// brought to him; any other restart is taken by whoever gets there with it
const fixedTaker = R0 => R0.kind === 'corner' || R0.kind === 'penalty' || R0.kind === 'goalkick' || R0.kind === 'kickoff' || R0.special;
// a served ball's time in the air over d metres: thrown or kicked flat, at 1.3 times the 45-degree speed, so it comes
// down into the taker's arms at chest height (1.15 s over 16 m, 2.2 s over 38 m in the match's ball world)
const serveFlight = d => 0.37 + 0.0487*Math.max(4, d);
const serveSpeed = d => Math.min(26, Math.sqrt(9.81*Math.max(4, d)/0.9397)*1.3);
// the seconds the taker needs to cover s metres of his way to the spot, tkD metres long: a sprint while more than
// SPRINT_D metres are left, a run to the last 8 m, then a jog (the gaits restartStep gives him)
function wayT(tk, tkD, s){
  const vS = 0.9*tk.prm.sprint, vR = 0.9*tk.prm.run, vJ = 0.9*(tk.prm.jog || tk.prm.run*0.7);
  let t = 0, at = tkD, left = Math.max(0, s);
  const seg = (lo, v) => { if (left <= 0 || at <= lo) return; const d = Math.min(left, at - lo); t += d/Math.max(2, v); left -= d; at -= d; };
  seg(RULES.SPRINT_D, vS); seg(8, vR); seg(0, vJ);
  return t + left/Math.max(2, vJ);
}
// the time a served ball takes to reach the spot (rolled within 15 m, thrown or kicked up in the air beyond; carried
// to within the longest serve first)
const serveT = d => d <= 3 ? 0 : d <= RULES.SERVE_ROLL ? 0.6 + (Math.sqrt(9 + 2.2*d) - 3)/1.1 + 0.4
  : Math.max(0, d - RULES.SERVE_MAX)/RULES.CARRY_FAR + 0.6 + serveFlight(Math.min(d, RULES.SERVE_MAX)) + 0.4;
// the quickest way a ball at (x, z) gets to the restart spot: {t, who}
function sourceCost(ms, R0, x, z){
  const sp = R0.spot, tk = ms.agents[R0.taker], far = hypot(x - sp.x, z - sp.z), fixed = fixedTaker(R0);
  const tkD = tk ? hypot(tk.m.x - sp.x, tk.m.z - sp.z) : 0;
  const tkRun = tk ? tkD/Math.max(3, tkD > RULES.SPRINT_D ? 0.9*tk.prm.sprint : tk.prm.run) : 0;
  let who = -1, best = Infinity;
  for (const a of ms.agents){
    if (a.team !== R0.team || !a.onPitch || a.role !== 'player' || a.sentOff || a.leaving || a.injured) continue;
    const isTk = a.id === R0.taker;
    if (a.isMe && !ms.meAI && !isTk) continue;
    // the keeper fetches only for his own restarts and from his own net after a goal
    if (a.isGK && !isTk && !(R0.kind === 'kickoff' && hypot(a.m.x - x, a.m.z - z) < 12)) continue;
    const tf = hypot(a.m.x - x, a.m.z - z)/Math.max(3, a.prm.run);
    let t;
    if (far <= RULES.SERVE && (isTk || !fixed)) t = tf + carryT(far);              // he brings it in himself
    else if (isTk && fixed) continue;                                              // a specialist waits at the spot for it
    else {
      // served to the taker (and caught: 0.8 s more), or for a specialist on his way, put on the spot for him
      // (a served ball still has to be met where it comes down and carried in: SERVE_MEET more)
      const ball = tf + Math.min(serveT(far) + 0.8 + RULES.SERVE_MEET, fixed && !a.isGK && far <= RULES.PLACE_MAX ? carryT(far) + 0.6 : Infinity);
      t = fixed ? Math.max(ball, tkRun) + 0.1*ball : ball;
    }
    if (isTk) t -= 0.3;
    if (t < best){ best = t; who = a.id; }
  }
  return {t: best, who};
}
// where a ball will stop: on the grass, the closed form of its roll; in the air, the path cache's last sample when it
// is fresh, else where it lands and a roll on from there. The boards stop it.
function restOf(ms, b){
  const sp = hypot(b.v.x, b.v.z);
  if (sp < 0.5) return {x: b.p.x, z: b.p.z};
  // (a ball already over the boards is not stopped by them: it stays out of reach)
  const ro = ms.spec.runoff, over = Math.abs(b.p.x) > ro.hx + R || Math.abs(b.p.z) > ro.hz + R;
  const inB = q => { if (!over){ q.x = clamp(q.x, -ro.hx + R, ro.hx - R); q.z = clamp(q.z, -ro.hz + R, ro.hz - R); } return q; };
  if (b.p.y < R + 0.05 && Math.abs(b.v.y) < 0.5){
    const s = rollDistance(sp, 0, b.rollDecel || 1.1, b.dragMul || 1);
    return inB({x: b.p.x + b.v.x/sp*s, z: b.p.z + b.v.z/sp*s});
  }
  if (ms.predN > 0 && ms.t - ms.predT < 0.6){
    const o = 4*(ms.predN - 1);
    return {x: ms.pred[o], z: ms.pred[o + 2]};
  }
  // in the air: where it lands, then the roll on the grass (what a bounce leaves of the pace)
  let x = b.p.x, z = b.p.z, vx = b.v.x, vz = b.v.z;
  if (b.p.y > R + 0.05 || b.v.y > 0.3){
    const tl = (b.v.y + Math.sqrt(b.v.y*b.v.y + 2*9.81*Math.max(0, b.p.y - R)))/9.81;
    x += vx*tl; z += vz*tl; vx *= 0.6; vz *= 0.6;
  }
  const v = hypot(vx, vz), dec = b.rollDecel || 1.1, ds = v*v/(2*dec)*0.85;
  return v > 1e-3 ? {x: x + vx/v*ds, z: z + vz/v*ds} : {x, z};
}
// the source and its fetcher worked out again while the game ball still rolls: a switch only for a second's gain
function reconsiderSource(ms, R0){
  const b = ms.ball;
  if (R0.ballFrom === 'game'){ const r = restOf(ms, b); R0.src = r; }
  const cur = R0.ballFrom === 'spare' ? ms.spares[R0.spare].ball.p : R0.src;
  // (the game ball flying away fast far from the spot is given up for any spare to hand)
  const gone = R0.ballFrom === 'game' && flyingAway(b) && hypot(cur.x - R0.spot.x, cur.z - R0.spot.z) > RULES.SPARE_NEAR;
  let best = reachable(ms, cur.x, cur.z) && !gone ? sourceCost(ms, R0, cur.x, cur.z) : {t: Infinity, who: -1}, from = R0.ballFrom, spare = R0.spare, src = {x: cur.x, z: cur.z};
  const cands = [];
  // (the game ball while it still flies away fast is no candidate: where it ends up is not known yet)
  if (R0.ballFrom !== 'game' && !flyingAway(b)){ const r = restOf(ms, b); if (hypot(r.x - R0.spot.x, r.z - R0.spot.z) < 40 && reachable(ms, r.x, r.z)) cands.push({x: r.x, z: r.z, i: -1}); }
  for (let i = 0; i < ms.spares.length; i++){ const q = ms.spares[i]; if (q.state === 'cone' && i !== R0.spare) cands.push({x: q.ball.p.x, z: q.ball.p.z, i}); }
  // a fetcher within 8 m of a ball that is (nearly) still keeps going for it: switching then costs more than it saves;
  // a spare on its cone is only given up for a clear two seconds
  const fc = ms.agents[R0.fetcher], curV = R0.ballFrom === 'spare' ? 0 : hypot(b.v.x, b.v.z);
  if (fc && best.t < Infinity && curV < 2 && hypot(fc.m.x - cur.x, fc.m.z - cur.z) < 8) return;
  const gain = R0.ballFrom === 'spare' && best.t < Infinity ? 2 : ms.t - R0.t0 > 2 ? 1.5 : 1;
  for (const c of cands){
    const e = sourceCost(ms, R0, c.x, c.z);
    if (e.t + gain < best.t || best.t === Infinity && e.t < Infinity){ best = e; from = c.i >= 0 ? 'spare' : 'game'; spare = c.i; src = {x: c.x, z: c.z}; }
  }
  R0.ballFrom = from; R0.spare = spare; R0.src = src;
  if (best.who >= 0) R0.fetcher = best.who;
}
// the nearest team-mate to the spot other than the fetcher: he takes a ball served to him
function spotTaker(ms, R0, not){
  let best = null, bd = Infinity;
  for (const a of ms.agents){
    if (a.team !== R0.team || !a.onPitch || a.role !== 'player' || a.sentOff || a.leaving || a.injured || a.isGK || a.id === not) continue;
    if (a.isMe && !ms.meAI) continue;
    const d = hypot(a.m.x - R0.spot.x, a.m.z - R0.spot.z);
    if (d < bd){ bd = d; best = a; }
  }
  return best;
}

// the live ball becomes the spare picked up from a cone; the old game ball stays where it is as a loose spare
function takeSpare(ms, i){
  const s = ms.spares[i], old = ms.ball;
  s.state = 'live';
  const j = ms.spares.findIndex(q => q.ball === old);
  if (j >= 0) ms.spares[j].state = 'loose';
  else ms.spares.push({ball: old, cone: -1, state: 'loose'});
  if (old.state !== 'held') old.state = 'dead';
  ms.ball = s.ball;
  ms.ball.state = 'dead';
  ms.ballSwap = ms.step;
}

// the hands of an agent carrying the ball: in front of the chest, or above the head for a throw-in
function handsOf(a, high, out){
  const m = a.m, s = a.scale || 1, fx = -sin(m.yaw), fz = -cos(m.yaw);
  out.x = m.x + fx*0.28*s; out.z = m.z + fz*0.28*s; out.y = (high ? 2.0 : 1.05)*s + (a.y || 0);
  return out;
}
const HD = {x: 0, y: 0, z: 0};
// keep a held ball at its holder's hands for the end of this step (ballStep moves it by its velocity)
export function holdAt(ms, a, high = false, h = 1/60){
  const b = ms.ball, p = handsOf(a, high, HD), m = a.m;
  // where the hands will be at the end of this step; the ball goes there at its own (bounded) speed, so the velocity
  // it carries is the motion it makes: lifted to the hands over a few frames, never a jump
  const tx = p.x + m.vx*h, ty = p.y, tz = p.z + m.vz*h;
  let dx = tx - b.p.x, dy = ty - b.p.y, dz = tz - b.p.z;
  const lim = (hypot(m.vx, m.vz) + 3.5)*h, d = hypot(dx, dy, dz);
  if (d > lim){ const k = lim/d; dx *= k; dy *= k; dz *= k; }
  ballHold(b, {id: a.id, team: a.team, x: b.p.x, y: b.p.y, z: b.p.z, vx: dx/h, vy: dy/h, vz: dz/h, t: ms.t});
}

// One step of the restart's procedure: fetch, serve, collect, carry, place, wait. The taker and the fetcher get their
// movement targets here (a.set); everyone else's set-piece spot comes from tactics (restartShape). Sets R.ready when
// the taker is at the ball and the others are within 2 m of their spots, or at the restart's time limit.
export function restartStep(ms, h){
  const R0 = ms.restart;
  if (!R0 || R0.taken) return;
  const b = ms.ball, tk = ms.agents[R0.taker];
  if (!tk || !tk.onPitch || tk.leaving || tk.injured && !tk.isMe){
    // a new taker; a ball the old one had (in his hands, or on its way to him) is put down and fetched again
    R0.taker = pickTaker(ms, R0.kind, R0.team, R0.spot);
    if (R0.stage === 'collect' || (R0.stage === 'carry' || R0.stage === 'place') && R0.carrier < 0){
      if (b.state === 'held'){ ballRelease(b, null, {x: 0, y: 0, z: 0}, null); b.state = 'dead'; }
      R0.stage = 'fetch';
      chooseSource(ms, R0);
    }
    return;
  }
  // the man fetching or carrying the ball for it is hurt or going off: he puts the ball down where he is, and it is
  // fetched again by somebody else
  const gone = id => { const g = ms.agents[id]; return id >= 0 && id !== R0.taker && (!g || !g.onPitch || g.leaving || g.injured || g.sentOff); };
  if (gone(R0.carrier) || (R0.stage === 'fetch' || R0.stage === 'serve') && gone(R0.fetcher)){
    if (b.state === 'held'){ ballRelease(b, null, {x: 0, y: 0, z: 0}, null); b.state = 'dead'; }
    R0.carrier = -1; R0.stage = 'fetch';
    chooseSource(ms, R0);
    return;
  }
  const el = ms.t - R0.t0;
  const sp = R0.spot;
  // while somebody else gets the ball (or places it for him), the taker makes his way to the spot
  const away = (R0.stage === 'fetch' || R0.stage === 'serve') && R0.fetcher !== R0.taker || R0.carrier >= 0 && R0.carrier !== R0.taker;
  if (away && !(tk.isMe && !ms.meAI)){
    const dt = hypot(tk.m.x - sp.x, tk.m.z - sp.z);
    tk.set = {x: sp.x, z: sp.z, gait: dt > RULES.SPRINT_D ? 'sprint' : dt > 8 ? 'run' : 'jog', stop: 0.6, role: 'toSpot'};
  }
  switch (R0.stage){
    case 'fetch': {
      // the ball's rest point moves while it rolls: the ball and who fetches it are worked out again every half second
      // (a change only for a clear gain)
      if (ms.step % 30 === 0 && (el < 6 || R0.ballFrom === 'game' && !reachable(ms, b.p.x, b.p.z))) reconsiderSource(ms, R0);
      const f = ms.agents[R0.fetcher] || tk;
      const src = R0.ballFrom === 'spare' ? ms.spares[R0.spare].ball : b;
      const sv = hypot(src.v.x, src.v.z), lead = Math.min(1, sv/4);
      const d = hypot(f.m.x - src.p.x, f.m.z - src.p.z);
      // he hurries for it: a quick restart is his side's to take. (Circling it: a man who has been within NEAR_SLOW m of
      // it for NEAR_T s without getting it slows to a walk, as his turn round it at a run can be wider than his reach.)
      R0.nearT = d < RULES.NEAR_SLOW ? R0.nearT + h : 0;
      const slow = R0.nearT > RULES.NEAR_T;
      f.set = {x: src.p.x + src.v.x*lead*0.5, z: src.p.z + src.v.z*lead*0.5, gait: slow ? 'walk' : d > RULES.HURRY ? 'sprint' : 'run', stop: 0.3, role: 'fetch', speedCap: slow ? RULES.NEAR_V : Infinity};
      if (d < 0.65 && sv < 3.5 && src.p.y < 1.4){
        if (R0.ballFrom === 'spare') takeSpare(ms, R0.spare);
        holdAt(ms, f, false, h);
        const far = hypot(f.m.x - sp.x, f.m.z - sp.z);
        R0.carrier = -1;
        if (!fixedTaker(R0) && f !== tk){
          // whoever has it takes it when he is near the spot, or when carrying it there is no slower than serving it
          // to the taker (who may still be a long way off); otherwise he serves it to the taker
          const tkD = hypot(tk.m.x - sp.x, tk.m.z - sp.z), viaServe = Math.max(serveT(far) + 0.8, wayT(tk, tkD, tkD));
          if ((far <= RULES.SERVE || carryT(far) <= viaServe + 0.5) && !(tk.isMe && !ms.meAI)) R0.taker = f.id;
        } else if (!fixedTaker(R0) && far > RULES.SERVE){
          // the taker himself went a long way for it: the nearest man to the spot takes it, served to him, when that
          // is clearly quicker than carrying it back
          const t2 = spotTaker(ms, R0, f.id);
          if (t2){
            const d2 = hypot(t2.m.x - sp.x, t2.m.z - sp.z);
            if (Math.max(serveT(far) + 0.8, wayT(t2, d2, d2)) + 1 < carryT(far)){ R0.taker = t2.id; R0.fetcher = f.id; }
          }
        } else if (fixedTaker(R0) && f !== tk && !f.isGK && !(tk.isMe && !ms.meAI)){
          // the specialist is on his way: the team-mate with the ball puts it on the spot for him when that is no
          // slower than serving it to him (he would arrive before it anyway)
          const cT = carryT(far) + 0.6, tkT = hypot(tk.m.x - sp.x, tk.m.z - sp.z)/Math.max(3, 0.9*tk.prm.sprint);
          if (far <= RULES.SERVE || far <= RULES.PLACE_MAX && tkT >= cT - 1.0) R0.carrier = f.id;
        }
        R0.stage = R0.taker === f.id || R0.carrier >= 0 ? 'carry' : 'serve';
        R0.serveT = ms.t; R0.nearT = 0;
      }
      break;
    }
    case 'serve': {
      // the fetcher sends the ball to the taker: an underarm throw on a short way, a kick on a long one (dead ball)
      const f = ms.agents[R0.fetcher];
      if (!f){ R0.stage = 'fetch'; break; }
      holdAt(ms, f, false, h);
      const hx = ms.spec.hx;
      // a ball fetched out of the net is carried out of the goal before it is sent anywhere
      if (Math.abs(f.m.x) > hx - 0.3 && Math.abs(f.m.z) < 3.66 + 0.4){
        const gx = Math.sign(f.m.x)*(hx - 2.5);
        f.set = {x: gx, z: clamp(f.m.z, -2.5, 2.5), gait: 'run', stop: 0.3, role: 'serve', speedCap: RULES.CARRY_FAR};
        R0.serveT = ms.t;
        break;
      }
      // to the taker at the spot: thrown when he will be there 0.7 s before it arrives. A taker still a long way off
      // has it brought to the spot instead when carrying it is no slower than waiting for him (put there for a
      // specialist by the man who fetched it, or taken by him); otherwise the fetcher holds it until the taker is
      // near enough. Only for the player, or from the keeper, is it served at him where he will be on his way (a ball
      // served at a running man is too often missed).
      const td = hypot(tk.m.x - sp.x, tk.m.z - sp.z), atHim = tk.isMe && !ms.meAI || f.isGK;
      let ax = sp.x, az = sp.z, d = hypot(ax - f.m.x, az - f.m.z), hold = false;
      if (td > 0.5 && !atHim){
        const dS = Math.min(d, RULES.SERVE_MAX), more = Math.max(0, d - RULES.SERVE_MAX)/RULES.CARRY_FAR;
        const tBall = Math.max(0, 0.6 - (ms.t - (R0.serveT || 0))) + (dS <= RULES.SERVE_ROLL ? serveT(dS) - 1.0 : serveFlight(dS)) + more;
        const tTk = wayT(tk, td, td) + 0.7;
        if (tTk > tBall){
          if (carryT(d) + 0.6 <= tTk + 0.8){
            if (fixedTaker(R0)) R0.carrier = f.id; else R0.taker = f.id;
            R0.stage = 'carry';
            break;
          }
          hold = true;
        }
      }
      if (td > 0.5 && atHim && wayT(tk, td, td) > 0.4){
        // the point of his way he reaches 0.7 s before the ball does, time to pull up and turn to it (a few bisections
        // on the length of way covered)
        const left = Math.max(0, 0.6 - (ms.t - (R0.serveT || 0)));
        const arr = s => { const px = tk.m.x + (sp.x - tk.m.x)*s/td, pz = tk.m.z + (sp.z - tk.m.z)*s/td, dd = hypot(px - f.m.x, pz - f.m.z);
          return left + (dd <= RULES.SERVE_ROLL ? serveT(dd) - 1.0 : serveFlight(Math.min(dd, RULES.SERVE_MAX))); };
        let lo = 0, hi = td;
        if (wayT(tk, td, td) + 0.7 > arr(td)){
          for (let it = 0; it < 8; it++){ const s = 0.5*(lo + hi); if (wayT(tk, td, s) + 0.7 <= arr(s)) lo = s; else hi = s; }
          ax = tk.m.x + (sp.x - tk.m.x)*lo/td; az = tk.m.z + (sp.z - tk.m.z)*lo/td;
          d = hypot(ax - f.m.x, az - f.m.z);
        }
      }
      const tx = ax - f.m.x, tz = az - f.m.z;
      d = d || 1;
      // from behind the goal line, a serve that would go through the goal frame goes round it: a step to the side first
      if (Math.abs(f.m.x) > hx && Math.abs(ax) < hx){
        const k = (Math.sign(f.m.x)*hx - f.m.x)/(ax - f.m.x || 1e-9), zc = f.m.z + (az - f.m.z)*k;
        if (Math.abs(zc) < 3.66 + 0.8){
          f.set = {x: f.m.x, z: (f.m.z >= 0 ? 1 : -1)*Math.max(5.5, Math.abs(f.m.z) + 1), gait: 'run', stop: 0.3, role: 'serve', speedCap: RULES.CARRY_FAR};
          R0.serveT = ms.t;
          break;
        }
      }
      // too far to serve: he runs it closer first
      if (d > RULES.SERVE_MAX){
        f.set = {x: ax, z: az, gait: d > RULES.SERVE_MAX + 10 ? 'sprint' : 'run', stop: 0.3, role: 'serve', speedCap: RULES.CARRY_FAR, face: {x: tx/d, z: tz/d}};
        R0.serveT = ms.t;
        break;
      }
      f.set = {x: f.m.x, z: f.m.z, face: {x: tx/d, z: tz/d}, gait: 'walk', stop: 5, role: 'serve'};
      if (hold) R0.serveT = Math.max(R0.serveT || 0, ms.t - 0.6);
      else if (ms.t - (R0.serveT || 0) > 0.6){
        if (d <= RULES.SERVE_ROLL){
          // bowled along the grass so it reaches the taker at a jogging pace (a short underarm drop first)
          const sp0 = Math.min(24, rollSpeedFor(Math.max(1, d - 1), 3.0, b.rollDecel));
          ballRelease(b, null, {x: tx/d*sp0, y: -2.0, z: tz/d*sp0}, null);
        } else {
          // a long way: thrown or kicked flat to him, to come down into his arms at chest height
          const L = solveStrike({from: {x: b.p.x, y: b.p.y, z: b.p.z}, target: {x: ax, y: 1.1, z: az}, speed: serveSpeed(d), contact: 0, curl: 0, foot: 'R',
            kind: 'throw', rollDecel: b.rollDecel});
          ballRelease(b, null, L.v, L.w);
        }
        b.state = 'dead'; b.last.agent = f.id; b.last.team = f.team;
        R0.stage = 'collect';
      }
      break;
    }
    case 'collect': {
      // the taker meets the served ball where it is heading (a ball in the air: where it comes down to chest height)
      // and catches it, or picks it up once a rolling ball is slow
      const v = hypot(b.v.x, b.v.z);
      let tx, tz;
      if (b.p.y > 0.4 || b.v.y > 0.5){
        const tc = (b.v.y + Math.sqrt(Math.max(0, b.v.y*b.v.y + 2*9.81*Math.max(0, b.p.y - 1.1))))/9.81;
        tx = b.p.x + b.v.x*tc; tz = b.p.z + b.v.z*tc;
      } else if (v > 1){
        // a rolling ball: step into its path, at the nearest point of it ahead of the ball
        const ux = b.v.x/v, uz = b.v.z/v, along = Math.max(0.5, (tk.m.x - b.p.x)*ux + (tk.m.z - b.p.z)*uz);
        tx = b.p.x + ux*along; tz = b.p.z + uz*along;
      } else { tx = b.p.x; tz = b.p.z; }
      const dd = hypot(tk.m.x - b.p.x, tk.m.z - b.p.z);
      tk.set = {x: tx, z: tz, gait: hypot(tx - tk.m.x, tz - tk.m.z) > RULES.HURRY ? 'sprint' : 'run', stop: 0.3, role: 'collect', face: {x: b.p.x - tk.m.x, z: b.p.z - tk.m.z}};
      // in the air he reaches for it (arms out: 1.1 m); off the grass it has to be at his feet
      const catchable = b.p.y > 0.3 ? b.p.y < 2.2 && v < 20 : v < 8;
      if (dd < (b.p.y > 0.5 ? 1.1 : 0.9) && catchable){ holdAt(ms, tk, false, h); R0.stage = 'carry'; }
      break;
    }
    case 'carry': {
      // the taker, or the team-mate placing it for him
      const cr = R0.carrier >= 0 && ms.agents[R0.carrier] ? ms.agents[R0.carrier] : tk;
      holdAt(ms, cr, R0.kind === 'throw', h);
      // walk the ball to the spot: stand just short of it, so the hands are over it
      const ux = sp.x - cr.m.x, uz = sp.z - cr.m.z, ul = hypot(ux, uz);
      if (ul > 0.6 || !R0.standAt){ const k = ul > 1e-6 ? 0.28/ul : 0; R0.standAt = {x: sp.x - ux*k, z: sp.z - uz*k}; }
      // (past the restart's limit he runs it in, however near; going round and round the spot, he walks it in: NEAR_T)
      R0.nearT = ul < RULES.NEAR_SLOW ? R0.nearT + h : 0;
      const slow = R0.nearT > RULES.NEAR_T;
      cr.set = {x: R0.standAt.x, z: R0.standAt.z, gait: slow ? 'walk' : ul > 10 ? 'sprint' : 'run', stop: 0.1, role: 'carry',
        speedCap: slow ? RULES.NEAR_V : ul > 6 || el > R0.limit ? RULES.CARRY_FAR : RULES.CARRY, face: ul > 0.05 ? {x: ux/ul, z: uz/ul} : null};
      const d = hypot(b.p.x - sp.x, b.p.z - sp.z);
      if (d < 0.55 && cr.m.speed < 1.5){
        if (R0.kind === 'throw'){ R0.stage = 'wait'; R0.placed = true; }
        else R0.stage = 'place';
      }
      break;
    }
    case 'place': {
      // lower the ball onto the spot (at most 1.5 m/s across and 2.4 m/s down, twice that past the restart's limit), then
      // let go: it rests there, dead, until kicked
      const cr = R0.carrier >= 0 && ms.agents[R0.carrier] ? ms.agents[R0.carrier] : tk;
      cr.set = {x: cr.m.x, z: cr.m.z, gait: 'walk', stop: 9, role: 'place'};
      let dx = sp.x - b.p.x, dz = sp.z - b.p.z, dy = R - b.p.y;
      const hurry = el > R0.limit ? 2 : 1, dh = hypot(dx, dz), lh = 1.5*hurry*h, lv = 2.4*hurry*h;
      if (dh > lh){ dx *= lh/dh; dz *= lh/dh; }
      if (dy < -lv) dy = -lv;
      if (dh < 0.02 && b.p.y - R < 0.005){
        ballRelease(b, {x: b.p.x, y: R, z: b.p.z}, {x: 0, y: 0, z: 0}, null);
        b.state = 'dead'; b.last.agent = -1;
        R0.spot.x = b.p.x; R0.spot.z = b.p.z;
        R0.stage = 'wait'; R0.placed = true;
        if (R0.carrier >= 0){ const c = ms.agents[R0.carrier]; if (c) c.set = null; R0.carrier = -1; }
      } else ballHold(b, {id: cr.id, team: cr.team, x: b.p.x, y: b.p.y, z: b.p.z, vx: dx/h, vy: dy/h, vz: dz/h, t: ms.t});
      break;
    }
    case 'wait': {
      if (R0.kind === 'throw') holdAt(ms, tk, true, h);
      // everyone at his spot, or the clock says go; never before the taker is at the ball
      let ready = el >= 0.8;
      if (R0.kind !== 'throw' && hypot(tk.m.x - b.p.x, tk.m.z - b.p.z) > RULES.TAKER_AT) ready = false;
      if (ready) for (const a of ms.agents){
        if (!a.onPitch || a.role !== 'player' || a === tk || a.leaving || a.isGK || a.isMe && !ms.meAI) continue;
        if (a.set && hypot(a.m.x - a.set.x, a.m.z - a.set.z) > RULES.READY_D){ ready = false; break; }
      }
      // the player as a taker: the AI does not take it for him (3.2.8: "Take it." at 12 s, a team-mate at 25 s)
      if (tk.isMe && !ms.meAI){
        if (el >= 25){ const alt = pickTaker(ms, R0.kind, R0.team, R0.spot); if (alt >= 0 && alt !== tk.id){ R0.taker = alt; R0.stage = 'fetch'; R0.fetcher = alt; } }
        R0.ready = true;
        break;
      }
      const tkD = hypot(tk.m.x - b.p.x, tk.m.z - b.p.z), tkAt = R0.kind === 'throw' || tkD <= RULES.TAKER_AT;
      if (ready || el >= R0.limit && tkAt){ R0.ready = true; R0.stage = 'go'; }
      else if (el >= R0.limit && R0.kind !== 'throw' && R0.kind !== 'penalty' && tkD > RULES.HANDOVER){
        // the limit is up and the taker (a specialist from the far side of the pitch) is still a long way off: the
        // nearest man to the ball takes it from where everyone is (3.2.8), a keeper only for a goal kick
        let alt = null, ad = tkD;
        for (const a of ms.agents){
          if (a.team !== R0.team || !a.onPitch || a.role !== 'player' || a.sentOff || a.leaving || a.injured || (a.isMe && !ms.meAI)) continue;
          if (a.isGK !== (R0.kind === 'goalkick')) continue;
          const d = hypot(a.m.x - b.p.x, a.m.z - b.p.z);
          if (d < ad){ ad = d; alt = a; }
        }
        if (alt){ tk.set = null; R0.taker = alt.id; R0.shapeStep = -99; }
      }
      break;
    }
    case 'go':
      if (R0.kind === 'throw') holdAt(ms, tk, true, h);
      R0.ready = true;
      break;
  }
}

// is the restart ready to be taken (taker at the ball, the others set, or the limit reached)
export function restartReady(ms){ return !!(ms.restart && ms.restart.ready && !ms.restart.taken); }

// the restart was taken (the taker's kick or throw): play is live
export function restartTaken(ms, ev){
  const R0 = ms.restart;
  if (!R0) return;
  R0.taken = true;
  liveRoll(ms.ball);
  const took = ms.t - R0.t0;
  if (took > RULES.SLOW && R0.kind !== 'kickoff') ms.stoppage[ms.half - 1] += RULES.STOP.slow;
  const fu = ms.dirs[R0.team]*R0.spot.x + ms.spec.hx;
  ms.restartLog.push({kind: R0.kind, took, limit: R0.limit, t: ms.t, final: fu > 2*ms.spec.L/3});
  // a set piece into the box (a corner, a free kick in the final third): who of the side is in the box or on its edge
  // attacking it (RULES.BOX_EDGE m from the goal line), and who of the other side is there defending it
  let box = null, dbox = null;
  if ((R0.kind === 'corner' || R0.kind === 'free' || R0.kind === 'indirect') && fu > 2*ms.spec.L/3){
    const end = ms.dirs[R0.team], gx = end*ms.spec.hx;
    box = []; dbox = [];
    for (const a of ms.agents){
      if (!a.onPitch || a.role !== 'player' || a.id === R0.taker || a.isGK || Math.abs(gx - a.m.x) > RULES.BOX_EDGE[0] || Math.abs(a.m.z) > RULES.BOX_EDGE[1]) continue;
      if (a.team === R0.team) box.push(a.id); else if (a.team === 1 - R0.team) dbox.push(a.id);
    }
  }
  logEv(ms, 'restart', R0.team, R0.taker, R0.spot.x, R0.spot.z, {rk: R0.kind, taker: R0.taker, took: Math.round(took*100)/100, box, dbox});
  if (ev){ ev.rk = R0.kind; if (R0.kind === 'free' || R0.kind === 'indirect') ev.fk = true; if (R0.kind === 'penalty') ev.pen = true; }
  ms.restart = null;
  ms.phase = 'live';
  for (const a of ms.agents){ a.set = null; a.wall = false; a.cornerRole = null; a.fkRole = null; }
}

/* ---------- fouls, cards, advantage (3.2.9) ---------- */

// A foul from a tackle's contact (touch.js tackleOutcome): severity from the closing speed, from behind and a slide.
// Cards: yellow above 0.6 or for a tactical foul that stops an attack worth xT > 0.15; red for denying an obvious
// goal-scoring opportunity or above 0.92; a second yellow is red. Advantage when the fouled side keeps the ball and the
// play is worth xT >= 0.08. In the offender's own penalty area it is a penalty.
export function foul(ms, fouler, victim, severity, x, z, opt = {}){
  if (ms.phase !== 'live') return null;
  const team = victim.team, dir = ms.dirs[team], L = ms.spec.L, Wd = ms.spec.Wd;
  const u = dir*x + L/2, w = dir*z + Wd/2, val = xT(u, w, L, Wd);
  const f = {fouler: fouler.id, victim: victim.id, severity, x, z, team, slide: !!opt.slide, t: ms.t, card: null, booked: false};
  // the card (none when cards are not shown: laws.cards)
  const dogso = isDogso(ms, fouler, victim);
  if (laws(ms).cards){
    if (severity > RULES.CARD.red || dogso) f.card = 'red';
    else if (severity > RULES.CARD.yellow || (val > RULES.CARD.tactical && opt.tactical !== false && severity > 0.35)) f.card = 'yellow';
  }
  ms.stats.fouls[fouler.team]++;
  const pen = inBox(ms.spec, dir, x, z);
  // advantage: the fouled side still has it and the play is worth something
  const keep = ms.poss.ctl >= 0 && ms.agents[ms.poss.ctl].team === team && ms.poss.ctl !== victim.id || (ms.poss.ctl === victim.id && victim.m.stagger <= 0 && !opt.down);
  const adv = !pen && keep && val >= RULES.ADV.xt && !dogso;
  const ev = logEv(ms, 'foul', fouler.team, fouler.id, x, z, {on: victim.id, severity: Math.round(severity*100)/100, adv, pen});
  f.ev = ev.id;
  // injury (3.2.9): a bad foul can injure
  if (severity > RULES.CARD.injury && ms.r() < RULES.CARD.injuryP) injure(ms, victim);
  if (adv){
    ms.advantage = {foul: f, team, until: ms.t + RULES.ADV.signal};
    return f;
  }
  whistleFoul(ms, f);
  return f;
}
// a foul given: the card now and the free kick (or penalty)
function whistleFoul(ms, f){
  if (!f.booked) bookFoul(ms, f);
  const team = f.team, dir = ms.dirs[team];
  ms.offside.set.clear(); ms.offside.pending = null;
  if (laws(ms).restarts && inBox(ms.spec, dir, f.x, f.z)){
    const pen = ms.spec.spots.penalty.find(p => p.end === dir);
    startRestart(ms, 'penalty', team, {x: pen.x, z: pen.z}, {foul: f});
  } else {
    const x = clamp(f.x, -ms.spec.hx + 0.5, ms.spec.hx - 0.5), z = clamp(f.z, -ms.spec.hz + 0.5, ms.spec.hz - 0.5);
    startRestart(ms, 'free', team, {x, z}, {foul: f});
  }
}
function bookFoul(ms, f){
  f.booked = true;
  const a = ms.agents[f.fouler];
  if (a && f.card) bookAgent(ms, a, f.card, 'foul');
}
// obvious goal-scoring opportunity: the fouled attacker within 30 m of goal, on the ball (or a stride from it) and
// going at goal, with no other defender between him and the goal (the keeper does not count as covering)
function isDogso(ms, fouler, victim){
  const team = victim.team, dir = ms.dirs[team], gx = dir*ms.spec.hx, m = victim.m, b = ms.ball.p;
  const d = hypot(gx - m.x, m.z);
  if (d > 30) return false;
  if (ms.poss.team !== team) return false;
  if (ms.poss.ctl !== victim.id && hypot(b.x - m.x, b.z - m.z) > 1.5) return false;
  const toward = ((gx - m.x)*m.vx + (0 - m.z)*m.vz)/(d || 1);
  if (toward < RULES.CARD.dogsoV) return false;
  for (const o of ms.agents){
    if (o.team !== fouler.team || o === fouler || !o.onPitch || o.isGK) continue;
    if (dir*(o.m.x - m.x) > 0 && hypot(o.m.x - m.x, o.m.z - m.z) < d) return false;
  }
  return true;
}

// Book an agent (1.4.14): yellow, red, second yellow is red (nothing when cards are not shown: laws.cards). A red card
// sends him off (he walks to the nearest touchline). The player's cards also go to the career through bridge.bookPlayer (subscribers of 'card').
export function bookAgent(ms, a, color, reason){
  if (!laws(ms).cards) return;
  let c = color;
  if (c === 'yellow' && a.booked >= 1) c = 'red2';
  if (c === 'yellow'){ a.booked = 1; ms.stats.yellows[a.team]++; }
  else { a.sentOff = true; ms.stats.reds[a.team]++; if (c === 'red2') ms.stats.yellows[a.team]++; sendOff(ms, a); }
  ms.stoppage[ms.half - 1] += RULES.STOP.card;
  logEv(ms, 'card', a.team, a.id, a.m.x, a.m.z, {color: c === 'red2' ? 'red' : c, second: c === 'red2', reason});
}
// a body walking off at the nearest touchline point (a red card, an injury, a substitution)
export function walkOff(ms, a){
  a.leaving = true; a.task.press = 0; a.task.mark = -1; a.plan = null; a.drib = null;
  const side = a.m.z >= 0 ? 1 : -1;
  a.exit = {x: clamp(a.m.x, -ms.spec.hx + 1, ms.spec.hx - 1), z: side*(ms.spec.hz + 1.2)};
  if (ms.poss.ctl === a.id) clearCtl(ms);
}
function sendOff(ms, a){
  walkOff(ms, a);
  shortHanded(ms, a);
}
// a man who leaves and is not replaced (a red card, an injury with no change left): his side fills the gap
function shortHanded(ms, a){
  if (ms.poss.ctl === a.id) clearCtl(ms);
  // the team drops a forward into the gap, if he was not one
  if (a.slotLine !== 'FWD' && !a.isGK){
    let fwd = null;
    for (const o of ms.agents) if (o.team === a.team && o.onPitch && !o.leaving && o.slotLine === 'FWD' && (!fwd || depthOf(o.slot) > depthOf(fwd.slot))) fwd = o;
    if (fwd){ fwd.slot = a.slot; fwd.slotLine = a.slotLine; fwd.baseX = a.baseX; }
  }
  if (a.isGK){
    // somebody has to go in goal: the nearest defender
    let d = null;
    for (const o of ms.agents) if (o.team === a.team && o.onPitch && !o.leaving && !o.isGK && o.slotLine === 'DF' && (!d || o.id < d.id)) d = o;
    if (d){ d.isGK = true; d.slot = 'GK'; d.slotLine = 'GK'; d.at = Object.assign({}, d.at, {gk: {reflex: 35, dive: 35, handling: 35, posit: 35, distrib: d.at.passing}}); ms.gks[a.team] = d.id; }
  }
}
// an injury (3.2.9): he plays no further part and walks off at the nearest touchline point at once (subStep), and a
// substitute comes on at halfway once he is off; with no change left (all made, or laws.subs 0) nobody replaces him and
// his side fills the gap as for a red card. The bridge records the player's own injury.
function injure(ms, a){
  a.injured = true;
  logEv(ms, 'injury', a.team, a.id, a.m.x, a.m.z, {});
  ms.stoppage[ms.half - 1] += RULES.STOP.injury;
  if (!planSub(ms, a.team, a.id, 'injury') && !ms.subs.plan.some(p => p.out === a.id))
    ms.subs.plan.push({team: a.team, out: a.id, inPick: null, why: 'injury', stage: 'wait', t: ms.t, none: true});
}

/* ---------- offside signal ---------- */

function offsideCall(ms){
  const P = ms.offside.pending;
  ms.offside.pending = null; ms.offside.set.clear();
  if (!P) return;
  const off = ms.agents[P.who];
  ms.stats.offsides[P.team]++;
  // play after the offence does not count: a shot struck between it and the whistle is no shot, and no save
  const voided = new Set();
  for (let i = ms.events.length - 1; i >= 0 && ms.events[i].t >= P.t; i--){
    const e = ms.events[i];
    if (e.kind === 'kick' && e.team === P.team && !e.whiff && !e.void && (e.intent === 'shot' || e.atGoal)){
      e.void = 'offside'; voided.add(e.id);
      if (e.res === 'saved' && e.onTarget) ms.stats.saves[1 - P.team] = Math.max(0, ms.stats.saves[1 - P.team] - 1);
      ms.stats.shots[P.team]--; if (e.res === 'saved') ms.stats.onTarget[P.team]--;
      if (!e.res) e.res = 'off';
    }
  }
  for (let i = ms.events.length - 1; i >= 0 && ms.events[i].t >= P.t; i--){ const e = ms.events[i]; if (e.kind === 'save' && voided.has(e.shot)) e.void = 'offside'; }
  if (ms.chain.shot && voided.has(ms.chain.shot.id)) ms.chain.shot = null;
  logEv(ms, 'offside', P.team, P.who, P.x, P.z, {margin: Math.round(P.margin*100)/100, passer: P.passer, passerName: (ms.agents[P.passer] || {}).name || ''});
  chainOffside(ms);
  if (ms.ball.state === 'free') ms.ball.state = 'dead';
  startRestart(ms, 'indirect', 1 - P.team, {x: clamp(P.x, -ms.spec.hx + 0.5, ms.spec.hx - 0.5), z: clamp(P.z, -ms.spec.hz + 0.5, ms.spec.hz - 0.5)},
    {offender: off ? off.id : -1});
}

/* ---------- substitutions (3.2.9) ---------- */

// the changes a side may still plan (laws.subs, less those made and those planned)
function subsLeft(ms, team){
  let n = laws(ms).subs - ms.subs.used[team];
  for (const p of ms.subs.plan) if (p.team === team && !p.none) n--;
  return n;
}
// the player waits on the bench for a planned call (3.4.2) that has not come yet
function callPending(ms, team){
  const rt = ms.cfg.roleTimes || {};
  return !!rt.subOn && !ms.roleDone.on && ms.me < 0 && !!ms.cfg.me && ms.cfg.me.team === team && ms.bench[team].some(p => p.isMe && !p.used);
}
// plan a substitution: out (an agent id) for the best bench player for his slot (or inPick); done at the next
// stoppage. A change the manager chooses (why 'tactical') keeps one change back while the player's planned call is to
// come; an injury may use it. False when no change is left or that man is already coming off.
export function planSub(ms, team, outId, why = 'tactical', inPick = null){
  if (ms.subs.plan.some(p => p.out === outId)) return false;
  if (subsLeft(ms, team) <= (why === 'tactical' && callPending(ms, team) ? 1 : 0)) return false;
  ms.subs.plan.push({team, out: outId, inPick, why, stage: 'wait', t: ms.t});
  return true;
}

// at a stoppage the outgoing man walks to the nearest touchline point; once he is off, the substitute comes on at
// halfway (a body that enters from the bench, never moved anywhere else)
function subStep(ms){
  const dead = ms.phase === 'restart' || ms.phase === 'kickoff' || ms.phase === 'goal';
  for (const p of ms.subs.plan){
    const a = ms.agents[p.out];
    if (!a){ p.stage = 'done'; continue; }
    // the man taking the restart, or bringing the ball for it, finishes that first
    const R0 = ms.restart, busy = !!R0 && !R0.taken && (a.id === R0.taker || a.id === R0.fetcher || a.id === R0.carrier) && !a.injured;
    // (an injured man does not wait for a stoppage: he cannot play on)
    if (p.stage === 'wait' && (dead && !busy || a.injured)){
      p.stage = 'off';
      if (a.onPitch && !a.leaving) walkOff(ms, a);
      if (p.none) shortHanded(ms, a);
    }
    if (p.stage === 'off' && !a.onPitch){
      // he is off: the substitute enters at the halfway line on the bench side (nobody when no change was left, or
      // nobody is left on the bench: his side plays a man short)
      const pick = p.none ? null : p.inPick || bestBench(ms, p.team, a);
      if (!pick && !p.none) shortHanded(ms, a);
      if (pick){
        const sub = enterSub(ms, p.team, pick, a);
        logEv(ms, 'sub', p.team, sub.id, sub.m.x, sub.m.z, {out: a.id, in: sub.id, outName: a.name, inName: sub.name});
        ms.subs.used[p.team]++;
        ms.stoppage[ms.half - 1] += RULES.STOP.sub;
        ms.checkpointDue = true;
      }
      p.stage = 'done';
    }
  }
  ms.subs.plan = ms.subs.plan.filter(p => p.stage !== 'done');
  // bodies walking off: off the pitch once over the touchline
  for (const a of ms.agents){
    if (!a.onPitch || !a.leaving || !a.exit) continue;
    if (Math.abs(a.m.z) > ms.spec.hz + 0.6){
      a.onPitch = false; a.leaving = false;
      const iv = a.on[a.on.length - 1]; if (iv && iv[1] == null) iv[1] = onSec(ms);
      const ivT = a.onT[a.onT.length - 1]; if (ivT && ivT[1] == null) ivT[1] = ms.t;
      a.subbedOff = true;
      if (ms.poss.ctl === a.id) clearCtl(ms);
    }
  }
}
// the bench player the manager sends on for out: never the player himself, who comes on only by his own planned call
// (roleSubs hands him to planSub as its inPick)
function bestBench(ms, team, out){
  const bench = ms.bench[team];
  let best = null, bv = -1;
  for (const p of bench){
    if (p.used || p.isMe) continue;
    const fit = p.isGK === !!out.isGK ? 1 : 0;
    const v = fit*100 + (p.slot === out.slot ? 10 : 0) + (p.at ? (p.at.pace + p.at.passing)/20 : 0) + (p.ovr || 0)/10;
    if (v > bv){ bv = v; best = p; }
  }
  return best;
}
// a bench player enters: a new agent at the halfway line, bench side
function enterSub(ms, team, p, out){
  p.used = true;
  const side = ms.cfg.benchSide != null ? ms.cfg.benchSide : 1;
  const id = ms.agents.length;
  const a = createAgent({id, pid: p.pid, team, slot: out.slot, arch: p.arch || out.arch, isGK: !!out.isGK, isMe: !!p.isMe,
    scale: p.scale || 1, at: p.at, energy: p.energy != null ? p.energy : 100, x: (team === 0 ? -1 : 1)*2.5, z: side*(ms.spec.hz + 0.9),
    yaw: side > 0 ? 0 : Math.PI, name: p.name, number: p.number, items: p.items, prefFoot: p.prefFoot});
  a.slotLine = out.slotLine || (SLOT_POS[out.slot] || {}).line;
  a.baseX = out.baseX != null ? out.baseX : null;
  a.on.push([onSec(ms), null]); a.onT.push([ms.t, null]);
  a.anchor.u = out.anchor.u; a.anchor.w = out.anchor.w; a.anchor.set = true;
  ms.agents.push(a);
  if (p.isMe){ ms.me = id; a.isMe = true; }
  if (out.isGK) ms.gks[team] = id;
  return a;
}

// AI substitutions (3.2.9): a side losing after 60 minutes takes off its most tired, least effective outfield player;
// at most 5 a side
function aiSubs(ms){
  const min = minuteOf(ms);
  if (ms.half < 2 || min < 60) return;
  for (const team of [0, 1]){
    const diff = ms.score[team] - ms.score[1 - team];
    const due = ms.subs.nextAt[team] || 60;
    if (min < due || ms.subs.used[team] >= laws(ms).subs) continue;
    ms.subs.nextAt[team] = min + 8;
    if (diff >= 0 && min < 70) continue;
    let worst = null, wv = Infinity;
    for (const a of ms.agents){
      if (a.team !== team || !a.onPitch || a.isGK || a.leaving || a.isMe || a.onT[0][0] > 1) continue;
      const v = a.energy*(0.5 + (a.acc.touches || 0)/30);
      if (v < wv){ wv = v; worst = a; }
    }
    if (worst) planSub(ms, team, worst.id, 'tactical');
  }
}

// the player's planned role (3.4.2): on as a substitute at subOn (match minutes, 1.4.13 roleTimes), off at subOff
// (unless he is playing well). The call ('Get ready, you're going on', ms.callUp) is made only once his change is
// planned: when the manager already means to take that man off, the player is the one who goes on for him; when every
// change left is planned, a tactical one not yet made gives way to his; when all have been made, he stays on the bench
// with no call. A call that cannot be planned yet is tried again at the next check.
function roleSubs(ms){
  const rt = ms.cfg.roleTimes || {};
  const min = minuteOf(ms);
  const meTeam = ms.cfg.me ? ms.cfg.me.team : -1;
  if (meTeam < 0) return;
  if (rt.subOn && !ms.roleDone.on && min >= rt.subOn && ms.me < 0){
    const mb = ms.bench[meTeam].find(p => p.isMe && !p.used);
    // the man he replaces: whoever plays his slot, else the most tired outfield player
    let out = mb ? ms.agents.find(a => a.team === meTeam && a.onPitch && !a.leaving && a.slot === mb.slot) : null;
    if (mb && !out){ let wv = Infinity; for (const a of ms.agents) if (a.team === meTeam && a.onPitch && !a.isGK && !a.leaving && a.energy < wv){ wv = a.energy; out = a; } }
    if (!mb || !out) ms.roleDone.on = true;
    else {
      const theirs = ms.subs.plan.find(p => p.team === meTeam && p.out === out.id);
      let ok = false;
      if (theirs){ theirs.inPick = mb; theirs.why = 'role'; ok = true; }
      else {
        ok = planSub(ms, meTeam, out.id, 'role', mb);
        if (!ok){
          const i = ms.subs.plan.findIndex(p => p.team === meTeam && p.why === 'tactical' && p.stage === 'wait');
          if (i >= 0){ ms.subs.plan.splice(i, 1); ok = planSub(ms, meTeam, out.id, 'role', mb); }
        }
      }
      if (ok){ ms.roleDone.on = true; ms.callUp = {t: ms.t, out: out.id}; }
      else if (ms.subs.used[meTeam] >= laws(ms).subs) ms.roleDone.on = true;
    }
  }
  if (rt.subOff && !ms.roleDone.off && min >= rt.subOff && ms.me >= 0){
    ms.roleDone.off = true;
    const me = ms.agents[ms.me];
    const live = ms.liveRating ? ms.liveRating(me) : 6.5;
    if (live < 7.3 && me.onPitch) planSub(ms, meTeam, me.id, 'role');
  }
}

/* ---------- the clock, stoppage, the end of a half (1.5.5, 3.2.10) ---------- */

// One step of the referee (3.2.1 step 7): clock and stoppage, the end of the half, offside signals, advantage expiry,
// substitutions, spare balls returning to their cones.
export function refStep(ms, h){
  const C = ms.clock;
  if (C.running){
    C.sec += h*C.rate;
    if (C.sec >= 2700 && !C.addedSet){
      const [lo, hi] = RULES.ADDED[ms.half - 1];
      C.addedSet = true;
      C.added = laws(ms).stoppage ? clamp(Math.round(ms.stoppage[ms.half - 1]/60), lo, hi) : 0;
      if (C.added) logEv(ms, 'added', -1, -1, 0, 0, {mins: C.added});
    }
  }
  // the offside flag and whistle
  const P = ms.offside.pending;
  if (P){
    if (!P.flagged && ms.t >= P.flagAt){ P.flagged = true; logEv(ms, 'flag', P.team, P.who, P.x, P.z, {margin: Math.round(P.margin*100)/100}); }
    if (ms.t >= P.whistleAt && ms.phase === 'live') offsideCall(ms);
  }
  // advantage: once the signal has run its two seconds the foul is booked at the next stoppage
  if (ms.advantage && ms.t >= ms.advantage.until){ const AV = ms.advantage; ms.advantage = null; ms.pendingBook.push(AV.foul); }
  if (ms.pendingBook.length && ms.phase !== 'live'){ for (const f of ms.pendingBook) if (!f.booked) bookFoul(ms, f); ms.pendingBook.length = 0; }
  // the goal celebration: the kick-off restart's fetch is already under way
  if (ms.phase === 'goal' && ms.t - ms.goalT >= RULES.CELEBRATE) ms.phase = 'kickoff';
  // possession time
  if (ms.phase === 'live' && ms.poss.team >= 0) ms.stats.possSec[ms.poss.team] += h;
  // the end of the half: added time is up; at the first dead ball, or a change of possession outside a final third,
  // or 20 real seconds later at most
  if (C.running && C.addedSet && C.sec >= 2700 + C.added*60){
    if (!ms.halfEnd) ms.halfEnd = {t: ms.t, poss: ms.poss.team};
    const dead = ms.phase !== 'live';
    const b = ms.ball.p, inMiddle = Math.abs(b.x) < ms.spec.hx/3;
    const change = ms.poss.team !== ms.halfEnd.poss && inMiddle;
    if (dead || change || ms.t - ms.halfEnd.t >= RULES.HALF_CAP) endHalf(ms);
  }
  subStep(ms);
  if (ms.phase !== 'halftime' && ms.phase !== 'fulltime' && ms.phase !== 'over'){
    if (ms.step % 60 === 7){ aiSubs(ms); roleSubs(ms); }
  }
  // loose spare balls: rest them in a quiet world, and return them to a cone once nobody can see it happen
  for (const s of ms.spares){
    if (s.state !== 'loose') continue;
    if (s.ball.v.x || s.ball.v.y || s.ball.v.z || !s.ball.grounded) ballStep(s.ball, ms.quiet, h);
    const me = ms.me >= 0 ? ms.agents[ms.me] : null;
    const far = me ? hypot(me.m.x - s.ball.p.x, me.m.z - s.ball.p.z) > 20 : true;
    const unseen = ms.cfg.visible ? !ms.cfg.visible(s.ball.p.x, s.ball.p.y, s.ball.p.z) : true;
    if (far && unseen && s.ball.v.x === 0 && s.ball.v.z === 0){
      const cone = nearestEmptyCone(ms, s.ball.p.x, s.ball.p.z);
      if (cone >= 0){
        const c = ms.spec.spareCones[cone];
        s.ball.p.x = c.x; s.ball.p.y = R; s.ball.p.z = c.z; s.cone = cone; s.state = 'cone';
      }
    }
  }
}
function nearestEmptyCone(ms, x, z){
  let best = -1, bd = Infinity;
  ms.spec.spareCones.forEach((c, i) => {
    if (ms.spares.some(s => s.cone === i && (s.state === 'cone'))) return;
    const d = hypot(c.x - x, c.z - z);
    if (d < bd){ bd = d; best = i; }
  });
  return best;
}

function endHalf(ms){
  const C = ms.clock;
  C.running = false;
  ms.halfEnd = null;
  ms.restart = null;
  if (ms.ball.state === 'free') ms.ball.state = 'dead';
  clearCtl(ms);
  chainDead(ms);
  for (const a of ms.agents){ a.act = a.act && a.act.kind === 'dive' ? a.act : null; a.drib = null; }
  ms.checkpointDue = true;
  // (one period when there is no half time: laws.halfTime)
  if (ms.half === 1 && laws(ms).halfTime){
    logEv(ms, 'whistle', -1, -1, 0, 0, {why: 'ht'});
    ms.phase = 'halftime'; ms.htT = ms.t;
  } else {
    logEv(ms, 'whistle', -1, -1, 0, 0, {why: 'ft'});
    ms.phase = 'fulltime'; ms.ftT = ms.t;
  }
}
