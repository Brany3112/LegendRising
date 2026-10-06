// js/life/football/events.js: the match's record. Every gameplay event goes into one log (ms.events) with its time,
// half, match second and minute; a small tracker follows the chain of play as it is logged (which pass found its man,
// which was cut out, which shot was saved, which pass made a chance, who lost the ball before a shot) and writes the
// answers onto the events themselves. Everything the game shows afterwards is read from this log: the player's numbers
// (deriveMy fills MT.my), the team stats, the goal lists for the world, every player's rating, the highlights.
// Owner: WP-E. Contract DESIGN 1.4.15 (Ev, deriveMy, teamStats, goalLists, rateAgent, highlights); rating 1.5.8;
// behaviour 3.2.11.
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no Math.random.

import {hypot} from "./detmath.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const PASS_KINDS = new Set(['pass', 'through', 'cross', 'lob', 'throw', 'goalkick', 'punt', 'roll', 'header']);
export const isPassIntent = k => PASS_KINDS.has(k);

/* ---------- the log ---------- */

// the match minute shown for a time in a half: 1 to 45 (46 to 90), held at 45 (90) through added time
export function minuteOf(ms, sec = ms.clock.sec, half = ms.half){
  const m = Math.floor(sec/60) + 1, cap = 45;
  return (half - 1)*45 + Math.min(m, cap);
}
export function addedOf(ms, sec = ms.clock.sec){
  return sec >= 2700 ? Math.floor((sec - 2700)/60) + 1 : 0;
}

// Log an event (1.4.15 Ev): {id, t, half, sec, min, kind, team, agent, x, z, ...extra}. Returns it; the tracker below
// reads it, and subscribers receive it when the step ends.
export function logEv(ms, kind, team, agent, x, z, extra){
  const ev = {id: ms.events.length, t: ms.t, half: ms.half, sec: ms.clock.sec, min: minuteOf(ms), kind, team, agent, x, z};
  // how far up the pitch it happened for the team it belongs to (team frame u, DESIGN 1.1)
  if (team >= 0 && x != null) ev.u = Math.round((ms.dirs[team]*x + ms.spec.hx)*100)/100;
  if (extra) for (const k in extra) ev[k] = extra[k];
  ms.events.push(ev);
  return ev;
}

/* ---------- the chain of play (3.2.11 attribution) ---------- */

export function createChain(){
  return {
    pass: null,                  // a pass in flight or not yet resolved (its kick event)
    shot: null,                  // a shot not yet resolved
    lastPass: [null, null],      // each team's last completed pass (assists, key passes)
    oppTouch: [true, true],      // has the other team touched it deliberately since that pass?
    ctl: {agent: -1, team: -1, t: -9, since: -9, x: 0, z: 0},   // the last controlled touch
    turnover: [null, null],      // each team's last loss of the ball: {agent, t, x, z} (errors)
    spell: -1,                   // the agent of the current spell of touches (touch counting)
    passRun: [0, 0], seqs: [0, 0],   // passes in the current possession, sequences of 5 or more
    possT: [0, 0], lastPossT: 0
  };
}

// a kick (pass, shot, cross, clear, throw, keeper's distribution, header) by agent a: resolves an open pass of his
// team as completed (he played it on first time), opens a pass or a shot
// A shot's end. On target is what the keeper had to deal with: a goal or a save (a block, the woodwork and a miss are
// not), counted when it is known, as the statistics count it.
export function shotRes(ms, shot, res){
  shot.res = res;
  if (res === 'goal' || res === 'saved') ms.stats.onTarget[shot.team]++;
}
export function chainKick(ms, ev){
  const ch = ms.chain, team = ev.team;
  if (ch.pass && ch.pass.team === team && ch.pass.agent !== ev.agent && !ch.pass.res) resolvePass(ms, ch.pass, 'ok', ev.agent);
  spellTouch(ms, ev.agent);
  // a shot still open when the ball is kicked again is over: it was blocked or went nowhere near
  if (ch.shot && !ch.shot.res && ev.intent !== 'shot' && !(ev.intent === 'header' && ev.atGoal)){
    shotRes(ms, ch.shot, ch.shot.blockedBy != null ? 'blocked' : 'wide'); ch.shot = null;
  }
  if (ev.intent === 'shot' || ev.intent === 'header' && ev.atGoal){
    if (ch.shot && !ch.shot.res) shotRes(ms, ch.shot, 'blocked');
    ch.shot = ev;
    ev.res = null;
    // a key pass: the team's last completed pass within 8 s, no opponent control since
    const lp = ch.lastPass[team];
    if (lp && !ch.oppTouch[team] && ev.t - lp.t <= 8 && lp.agent !== ev.agent) lp.kp = true;
    // an error: the shooting team won the ball from a player in his own half within 8 s
    const to = ch.turnover[1 - team];
    if (to && ev.t - to.t <= 8 && !to.used && to.own){ to.used = true; const e = ms.events[to.ev]; if (e) e.err = true; }
    return;
  }
  if (PASS_KINDS.has(ev.intent) || ev.intent === 'clear'){
    if (ch.pass && !ch.pass.res) resolvePass(ms, ch.pass, 'lost', -1);
    ch.pass = ev; ev.res = null;
  }
}
function resolvePass(ms, pev, res, by){
  pev.res = res; pev.by = by;
  const team = pev.team;
  if (res === 'ok'){
    ms.chain.lastPass[team] = pev; ms.chain.oppTouch[team] = false;
    if (ms.stats) ms.stats.passesOk[team]++;
    if (by >= 0 && by === ms.me && pev.agent !== by){ ms.pref.received++; ms.pref.log.push({t: ms.t, k: 'r'}); }
    ms.chain.passRun[team]++;
    if (ms.chain.passRun[team] === 5) ms.chain.seqs[team]++;
    const by2 = ms.agents[by];
    pev.long = hypot((by2 ? by2.m.x : pev.x) - pev.x, (by2 ? by2.m.z : pev.z) - pev.z) >= 25 || pev.dist >= 25;
  }
  if (ms.chain.pass === pev) ms.chain.pass = null;
}

// a deliberate controlled touch (a reception, a collection, an interception, a tackle that keeps the ball, a keeper's
// catch) by agent a: resolves the open pass, counts the touch, moves possession
export function chainControl(ms, a, how, ev){
  const ch = ms.chain, team = a.team;
  const p = ch.pass;
  if (p && !p.res){
    if (p.team === team) resolvePass(ms, p, p.agent === a.id ? 'lost' : 'ok', a.id);
    else { resolvePass(ms, p, 'int', a.id); if (ev) ev.intercept = p.id; }
  }
  if (ch.shot && !ch.shot.res && ch.shot.team !== team){
    // the defending side has it: a shot that was not on target and did not go out was blocked or cleared
    shotRes(ms, ch.shot, how === 'save' || how === 'catch' ? 'saved' : 'blocked');
    ch.shot = null;
  }
  if (team !== ch.ctl.team && ch.ctl.team >= 0){
    ch.oppTouch[ch.ctl.team] = true;
    // the losing side's last controller lost it (dispossessed, or his touch let him down)
    const prev = ms.agents[ch.ctl.agent];
    if (prev && ms.t - ch.ctl.t < 2.0 && prev.team === ch.ctl.team && how !== 'save'){
      const u = ms.dirs[prev.team]*ch.ctl.x + ms.spec.hx;
      const lost = logEv(ms, 'lost', prev.team, prev.id, ch.ctl.x, ch.ctl.z, {to: a.id});
      ch.turnover[prev.team] = {agent: prev.id, t: ms.t, x: ch.ctl.x, z: ch.ctl.z, own: u < ms.spec.L*0.5, ev: lost.id, used: false};
    }
    ch.passRun[ch.ctl.team] = 0;
  }
  if (team !== ch.ctl.team) ch.passRun[team] = 0;
  ch.ctl.agent = a.id; ch.ctl.team = team; ch.ctl.t = ms.t; ch.ctl.x = a.m.x; ch.ctl.z = a.m.z;
  spellTouch(ms, a.id);
}
// the controller still has it (a dribble touch): keeps the record current
export function chainKeep(ms, a){
  const c = ms.chain.ctl;
  if (c.agent === a.id){ c.t = ms.t; c.x = a.m.x; c.z = a.m.z; }
  spellTouch(ms, a.id);
}
function spellTouch(ms, id){
  const ch = ms.chain;
  if (ch.spell !== id){ ch.spell = id; const a = ms.agents[id]; if (a) a.acc.touches = (a.acc.touches || 0) + 1; }
}
// any other touch (a deflection, a block): ends the current spell, and an opponent's block of a pass is an interception
export function chainTouch(ms, a, how, ev){
  const ch = ms.chain;
  if (how === 'block' || how === 'deflect'){
    const p = ch.pass;
    if (p && !p.res && p.team !== a.team && how === 'block'){ resolvePass(ms, p, 'int', a.id); if (ev) ev.intercept = p.id; }
    if (ch.shot && !ch.shot.res && ch.shot.team !== a.team && !a.isGK){ ch.shot.blockedBy = a.id; }
  }
  spellTouch(ms, a.id);
}
// the ball went out: an open pass failed, an open shot missed
export function chainOut(ms, line, lastTeam){
  const ch = ms.chain;
  if (ch.pass && !ch.pass.res) resolvePass(ms, ch.pass, ch.pass.team === lastTeam || lastTeam < 0 ? 'out' : 'ok', -1);
  if (ch.shot && !ch.shot.res){ shotRes(ms, ch.shot, ch.shot.blockedBy != null ? 'blocked' : ch.shot.wood ? 'wood' : 'wide'); ch.shot = null; }
  ch.spell = -1;
  for (const t of [0, 1]) ch.passRun[t] = 0;
}
// a goal: the open shot scored; the assist is the scorer's team's last completed pass with no deliberate opponent
// touch since, by someone else
export function chainGoal(ms, team, scorer){
  const ch = ms.chain;
  let shot = ch.shot && ch.shot.team === team && !ch.shot.res ? ch.shot : null;
  if (shot) shotRes(ms, shot, 'goal');
  if (ch.shot && ch.shot !== shot && !ch.shot.res) shotRes(ms, ch.shot, 'blocked');
  ch.shot = null;
  if (ch.pass && !ch.pass.res) resolvePass(ms, ch.pass, ch.pass.team === team ? 'ok' : 'int', scorer);
  const lp = ch.lastPass[team];
  let assister = -1;
  if (lp && !ch.oppTouch[team] && lp.agent !== scorer && ms.t - lp.t <= 20){ assister = lp.agent; lp.assist = true; }
  for (const t of [0, 1]){ ch.lastPass[t] = null; ch.oppTouch[t] = true; ch.passRun[t] = 0; }
  ch.spell = -1;
  return {shot, assister};
}
export function chainSave(ms, gk, outcome){
  const ch = ms.chain;
  if (ch.shot && !ch.shot.res && ch.shot.team !== gk.team){
    shotRes(ms, ch.shot, ch.shot.onTarget ? 'saved' : 'wide');
    ch.shot.savedBy = gk.id; ch.shot.saveHow = outcome;
    // a parry or a tip that still goes in is the shooter's goal (rules.goalScored reads this)
    ch.saved = {shot: ch.shot, t: ms.t};
    if (outcome !== 'catch' && outcome !== 'claim') ch.shot = null;
  }
  spellTouch(ms, gk.id);
}
export function chainWood(ms, part){
  const ch = ms.chain;
  if (ch.shot && !ch.shot.res) ch.shot.wood = part;
}
export function chainOffside(ms){
  const ch = ms.chain;
  if (ch.pass && !ch.pass.res) resolvePass(ms, ch.pass, 'off', -1);
  ch.spell = -1;
}
export function chainDead(ms){
  const ch = ms.chain;
  if (ch.shot && !ch.shot.res){ shotRes(ms, ch.shot, ch.shot.blockedBy != null ? 'blocked' : 'wide'); ch.shot = null; }
  if (ch.pass && !ch.pass.res) resolvePass(ms, ch.pass, 'lost', -1);
}

/* ---------- counters (3.2.11) ---------- */

function blank(){
  return {goals: 0, ownGoals: 0, assists: 0, shots: 0, onTarget: 0, sot: 0, soff: 0, blocked: 0, bcm: 0, xg: 0,
    long: 0, fk: 0, pen: 0, curl: 0, headGoals: 0,
    passAtt: 0, pc: 0, pf: 0, spass: 0, lpass: 0, kp: 0, crosses: 0, crossOk: 0,
    drb: 0, dis: 0, tkl: 0, tklAtt: 0, int: 0, aw: 0, al: 0, fouls: 0, fouled: 0, yellows: 0, red: 0, offs: 0,
    beaten: 0, err: 0, saves: 0, claims: 0, punches: 0, conceded: 0, touches: 0, clear: 0, blocks: 0,
    distance: 0, sprints: 0, posDisc: 0, mins: 0, defActs: 0};
}

// every agent's counters from the log and the agents' accumulators: [c per agent index]
export function countersAll(ms){
  const C = ms.agents.map(() => blank());
  const get = id => (id >= 0 && id < C.length ? C[id] : null);
  for (const ev of ms.events){
    const c = get(ev.agent);
    switch (ev.kind){
      case 'kick': {
        if (!c || ev.whiff || ev.void) break;
        if (ev.intent === 'shot' || ev.intent === 'header' && ev.atGoal){
          c.shots++; c.xg += ev.xg || 0;
          if (ev.res === 'goal'){ c.onTarget++; }
          else {
            if (ev.res === 'saved') { c.onTarget++; c.sot++; } else c.soff++;
            if (ev.res === 'blocked') c.blocked++;
            if ((ev.xg || 0) >= 0.35) c.bcm++;
          }
        } else if (PASS_KINDS.has(ev.intent) && ev.intent !== 'goalkick' && ev.intent !== 'punt' && !(ev.intent === 'header' && !ev.recv)){
          c.passAtt++;
          if (ev.intent === 'cross') c.crosses++;
          if (ev.res === 'ok'){ c.pc++; if (ev.long) c.lpass++; else c.spass++; if (ev.intent === 'cross') c.crossOk++; }
          else if (ev.res) c.pf++;
          if (ev.kp) c.kp++;
        } else if (ev.intent === 'clear') c.clear++;
        if (ev.err) c.err++;
        break;
      }
      case 'goal': {
        if (ev.ownGoal){ const s = get(ev.scorer); if (s) s.ownGoals++; break; }
        const s = get(ev.scorer);
        if (s){
          s.goals++;
          const st = ev.style || {};
          if (st.dist >= 20) s.long++;
          if (st.fk) s.fk++;
          if (st.pen) s.pen++;
          if (st.curl) s.curl++;
          if (st.header) s.headGoals++;
        }
        const a = get(ev.assister);
        if (a) a.assists++;
        break;
      }
      case 'lost': if (c){ c.dis++; if (ev.err) c.err++; } break;
      case 'dribble': if (c){ c.drb++; const b = get(ev.beat); if (b) b.beaten++; } break;
      case 'tackle': if (c){ c.tklAtt++; if (ev.won) { c.tkl++; c.defActs++; } } break;
      case 'touch':
        if (c && ev.intercept != null){ c.int++; c.defActs++; }
        if (c && ev.how === 'block'){ c.blocks++; c.defActs++; }
        break;
      case 'aerial': { const w = get(ev.winner), l = get(ev.loser); if (w){ w.aw++; w.defActs += ev.def === w ? 1 : 0; } if (l) l.al++; break; }
      case 'foul': if (c) c.fouls++; { const v = get(ev.on); if (v) v.fouled++; } break;
      case 'card': if (c){ if (ev.color === 'red') c.red++; else c.yellows++; } break;
      case 'offside': if (c) c.offs++; break;
      case 'save':
        if (c && !ev.void){
          if (ev.outcome === 'claim' || ev.outcome === 'punch'){ if (ev.outcome === 'claim') c.claims++; else c.punches++; }
          else if (ev.onTarget !== false) c.saves++;
        }
        break;
    }
  }
  // aerials won count as defensive actions for anyone in his own half
  for (const ev of ms.events) if (ev.kind === 'aerial'){
    const w = get(ev.winner), a = ms.agents[ev.winner];
    if (w && a && ms.dirs[a.team]*ev.x < 0) w.defActs++;
  }
  // goals conceded while on the pitch (keepers and the clean sheet term)
  for (const ev of ms.events) if (ev.kind === 'goal'){
    for (const a of ms.agents){
      if (a.team !== 1 - ev.team || a.role !== 'player') continue;
      if (onAt(a, ev.t)) C[a.id].conceded++;
    }
  }
  for (const a of ms.agents){
    const c = C[a.id];
    c.touches = a.acc.touches || 0;
    c.distance = Math.round(a.acc.dist);
    c.sprints = a.acc.sprints;
    c.posDisc = a.acc.oop > 0 ? a.acc.oopFar/a.acc.oop : 0;
    c.mins = minsOn(ms, a);
  }
  return C;
}
// was the agent on the pitch at time t (a.on holds [start, end] pairs in sim seconds)
function onAt(a, t){
  for (const iv of a.on) if (t >= iv[0] && (iv[1] == null || t <= iv[1])) return true;
  return false;
}
// match minutes on the pitch, from the agent's intervals (sim seconds) and the match's own clock: minutes are match
// minutes (the clock's rate), so a full game is 90 whatever the half length
export function minsOn(ms, a){
  let s = 0;
  for (const iv of a.on){ const e = iv[1] == null ? ms.t : iv[1]; s += Math.max(0, e - iv[0]); }
  const full = ms.cfg.halfRealSec*2;
  return clamp(Math.round(90*s/Math.max(1, full)), 0, 90);
}

/* ---------- ratings (1.5.8) ---------- */

// counter keys of the rating, the archetypes, and the committed tables (the harness refits E and R0: --fit-ratings)
const ARCHS = ['ST', 'W', 'AM', 'CM', 'DF'];
export const RATE = {
  R0: 6.25,
  W: {
    pc: {ST: .015, W: .015, AM: .02, CM: .02, DF: .015}, pf: -.05, kp: .15, sot: .10, soff: -.04, bcm: -.25, drb: .12,
    dis: -.08, tkl: {ST: .22, W: .22, AM: .25, CM: .34, DF: .42}, int: {ST: .10, W: .10, AM: .10, CM: .12, DF: .14},
    aw: {ST: .06, W: .06, AM: .06, CM: .06, DF: .10}, al: {ST: -.04, W: -.04, AM: -.04, CM: -.04, DF: -.08}, fouls: -.08,
    offs: -.05, beaten: {ST: -.12, W: -.12, AM: -.12, CM: -.12, DF: -.18}, err: -.5
  },
  E: {
    pc: {ST: 12, W: 18, AM: 24, CM: 30, DF: 26}, pf: {ST: 5, W: 6, AM: 6, CM: 5, DF: 4}, kp: {ST: 1.0, W: 1.4, AM: 1.8, CM: 1.0, DF: 0.3},
    sot: {ST: 1.5, W: 0.9, AM: 0.9, CM: 0.4, DF: 0.15}, soff: {ST: 1.6, W: 1.0, AM: 1.0, CM: 0.6, DF: 0.3}, bcm: {ST: 0, W: 0, AM: 0, CM: 0, DF: 0},
    drb: {ST: 1.0, W: 2.0, AM: 1.6, CM: 0.9, DF: 0.3}, dis: {ST: 2.5, W: 2.5, AM: 2.2, CM: 1.4, DF: 0.6},
    tkl: {ST: 0.5, W: 1.0, AM: 1.2, CM: 2.2, DF: 2.4}, int: {ST: 0.3, W: 0.5, AM: 0.7, CM: 1.6, DF: 2.0},
    aw: {ST: 2.5, W: 0.8, AM: 0.6, CM: 1.2, DF: 3.0}, al: {ST: 2.5, W: 1.0, AM: 0.8, CM: 1.2, DF: 2.0},
    fouls: {ST: 1.2, W: 1.0, AM: 1.2, CM: 1.4, DF: 1.3}, offs: {ST: 0.8, W: 0.4, AM: 0.3, CM: 0.1, DF: 0.05},
    beaten: {ST: 0.5, W: 1.0, AM: 1.0, CM: 1.2, DF: 1.0}, err: {ST: 0, W: 0, AM: 0, CM: 0, DF: 0}, saves: {GK: 3.0}
  },
  G: {ST: 1.15, W: 1.10, AM: 1.0, CM: 1.0, DF: 1.25, GK: 1.25},
  A: {ST: 0.8, W: 0.95, AM: 1.05, CM: 1.05, DF: 1.0, GK: 1.0},
  CS: {ST: 0, W: 0, AM: 0.1, CM: 0.3, DF: 0.7, GK: 0.8}
};
const wOf = (k, arch) => { const w = RATE.W[k]; return typeof w === 'number' ? w : w[arch === 'GK' ? 'DF' : arch]; };
const eOf = (k, arch) => { const e = RATE.E[k]; if (!e) return 0; return typeof e === 'number' ? e : (e[arch === 'GK' ? 'DF' : arch] || 0); };

// A rating (1.5.8). c: the counters; arch: ST|W|AM|CM|DF|GK; ctx = {mins, res: 'W'|'D'|'L', conceded, role:
// 'starter'|'sub'|'cameo'|...}. One decimal, 3 to 10.
export function rateAgent(c, arch, ctx){
  const m = clamp((ctx.mins || 0)/90, 0.1, 1);
  const A = arch === 'GK' ? 'GK' : ARCHS.includes(arch) ? arch : 'CM';
  let r = RATE.R0;
  const keys = A === 'GK' ? ['pc', 'pf', 'err', 'fouls'] : Object.keys(RATE.W);
  for (const k of keys) r += wOf(k, A)*((c[k] || 0) - eOf(k, A)*m);
  if (A === 'GK'){
    r += 0.25*((c.saves || 0) - 3.0*m) + 0.05*((c.claims || 0) + (c.punches || 0));
  }
  r += (c.goals || 0)*(RATE.G[A] || 1) + (c.assists || 0)*(RATE.A[A] || 1);
  r += ctx.res === 'W' ? 0.30 : ctx.res === 'L' ? -0.20 : 0;
  const k = ctx.conceded || 0;
  r += (RATE.CS[A] || 0)*(k === 0 ? 1 : k === 1 ? 0.2 : -0.35*(k - 1))*m;
  r -= 0.25*(c.yellows || 0) + 1.4*(c.red || 0);
  if (ctx.role === 'sub' || ctx.role === 'cameo' || ctx.sub) r = 6 + (r - 6)*0.9;
  return Math.round(clamp(r, 3, 10)*10)/10;
}

// every player's rating: {[agent id]: rating}, with the result from his team's side and the goals conceded while he was
// on. C: countersAll(ms) (computed here when not given)
export function ratingsAll(ms, C = null){
  C = C || countersAll(ms);
  const out = {};
  for (const a of ms.agents){
    if (a.role !== 'player' || !a.on.length) continue;
    const c = C[a.id], my = ms.score[a.team], th = ms.score[1 - a.team];
    const res = my > th ? 'W' : my < th ? 'L' : 'D';
    const sub = a.on[0][0] > 1 || a.subbedOff;
    out[a.id] = rateAgent(c, a.isGK ? 'GK' : a.arch, {mins: c.mins, res, conceded: c.conceded, sub, role: a.isMe ? ms.cfg.me && ms.cfg.me.role : null});
  }
  return out;
}

/* ---------- what the game reads ---------- */

// MT.my for an agent (1.4.15): every key the 2D match kept, plus the new ones
export function deriveMy(ms, agentId, C = null){
  C = C || countersAll(ms);
  const c = C[agentId] || blank();
  return {goals: c.goals, assists: c.assists, dribbles: c.drb, shots: c.shots, onTarget: c.onTarget, lost: c.dis,
    misses: c.shots - c.goals, long: c.long, fk: c.fk, curl: c.curl, pen: c.pen, spass: c.spass, lpass: c.lpass,
    passAtt: c.passAtt, tackles: c.tkl, fouls: c.fouls, headers: c.aw, cards: c.yellows, beaten: c.beaten,
    offsides: c.offs, interceptions: c.int, kp: c.kp, aerialsWon: c.aw, aerialsLost: c.al, touches: c.touches,
    distance: c.distance, sprints: c.sprints, xg: Math.round(c.xg*100)/100, errors: c.err,
    posDisc: Math.round(c.posDisc*100)/100, mins: c.mins, red: c.red, saves: c.saves, crosses: c.crosses, blocks: c.blocks,
    clearances: c.clear, defActs: c.defActs + c.blocks};
}

// the full-time numbers per team (index 0 home, 1 away)
export function teamStats(ms){
  const s = ms.stats, P = s.possSec, tot = P[0] + P[1] || 1;
  return {shots: s.shots.slice(), onTarget: s.onTarget.slice(), corners: s.corners.slice(),
    cards: [s.yellows[0] + s.reds[0], s.yellows[1] + s.reds[1]], yellows: s.yellows.slice(), reds: s.reds.slice(),
    possession: [Math.round(100*P[0]/tot), 100 - Math.round(100*P[0]/tot)], fouls: s.fouls.slice(), offsides: s.offsides.slice(),
    passes: s.passes.slice(), passesOk: s.passesOk.slice(), saves: s.saves.slice()};
}

// goals as the world records them: {home: [{s, a, min}], away: [...]} with W.players ids (an own goal has s = -1)
export function goalLists(ms){
  const out = {home: [], away: []};
  const pid = id => { const a = ms.agents[id]; return a && a.pid != null ? a.pid : -1; };
  for (const ev of ms.events){
    if (ev.kind !== 'goal' || ev.disallowed) continue;
    const g = {s: ev.ownGoal ? -1 : pid(ev.scorer), a: ev.assister >= 0 ? pid(ev.assister) : -1, min: ev.min};
    (ev.team === 0 ? out.home : out.away).push(g);
  }
  if (ms.cfg.resume && ms.cfg.resume.goals){
    const r = ms.cfg.resume.goals;
    out.home = (r.home || []).concat(out.home); out.away = (r.away || []).concat(out.away);
  }
  return out;
}

// Up to 6 highlights for the full-time card (3.2.11): goals, big chances, saves, the agent's own key actions.
// [{min, kind, icon, text, t0, t1}] (t0 and t1 in sim seconds, for the replay ring)
export function highlights(ms, agentId){
  const out = [];
  const nm = id => { const a = ms.agents[id]; return a ? a.name || ('#' + a.number) : ''; };
  for (const ev of ms.events){
    let h = null;
    if (ev.kind === 'goal' && !ev.disallowed){
      const mine = ev.scorer === agentId, ast = ev.assister === agentId;
      const st = ev.style || {}, d = Math.round(st.dist || 0);
      const how = st.pen ? "from the spot" : st.fk ? `free kick from ${d}m` : st.header ? "header" : `from ${d}m`;
      h = {kind: mine ? 'goal' : ast ? 'assist' : ev.team === (ms.agents[agentId] || {}).team ? 'teamGoal' : 'conceded',
        icon: mine ? "⚽" : ast ? "🅰" : "•",
        text: ev.ownGoal ? `Own goal by ${nm(ev.scorer)}` : mine ? `Goal, ${how}` : ast ? `Assist for ${nm(ev.scorer)}, ${how}` : `${nm(ev.scorer)} scores, ${how}`,
        pri: mine || ast ? 3 : 2};
    } else if (ev.kind === 'kick' && ev.agent === agentId && !ev.void && (ev.intent === 'shot' || ev.atGoal) && ev.res && ev.res !== 'goal'){
      if ((ev.xg || 0) >= 0.2 || ev.res === 'saved' || ev.res === 'wood')
        h = {kind: 'shot', icon: ev.res === 'saved' ? "🧤" : "✖", text: `Shot from ${Math.round(ev.dist || 0)}m, ${ev.res === 'saved' ? "saved" : ev.res === 'wood' ? "off the woodwork" : ev.res === 'blocked' ? "blocked" : "wide"}`, pri: 2};
    } else if (ev.kind === 'save' && ev.agent === agentId && !ev.void){
      h = {kind: 'save', icon: "🧤", text: "Save", pri: 2};
    } else if (ev.kind === 'tackle' && ev.agent === agentId && ev.won){
      h = {kind: 'tackleWin', icon: "🛡", text: "Won the ball with a tackle", pri: 1};
    } else if (ev.kind === 'dribble' && ev.agent === agentId){
      h = {kind: 'dribble', icon: "↪", text: `Beat ${nm(ev.beat)}`, pri: 1};
    }
    if (h){ h.min = ev.min; h.t0 = Math.max(0, ev.t - 5); h.t1 = ev.t + 2; out.push(h); }
  }
  // the most important six, kept in match order
  const keep = out.map((h, i) => [h, i]).sort((a, b) => b[0].pri - a[0].pri || a[1] - b[1]).slice(0, 6).sort((a, b) => a[1] - b[1]);
  return keep.map(([h]) => { delete h.pri; return h; });
}

// a 32-bit hash of the whole log (determinism checks): every field of every event, numbers by their bits
const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
export function logHash(ms){
  let h = 2166136261;
  const mixU = u => { h = Math.imul(h ^ u, 16777619); };
  const mixN = v => { F64[0] = v; mixU(U32[0]); mixU(U32[1]); };
  const mixS = s => { for (let i = 0; i < s.length; i++) mixU(s.charCodeAt(i)); };
  for (const ev of ms.events){
    const keys = Object.keys(ev).sort();
    for (const k of keys){
      const v = ev[k];
      mixS(k);
      if (typeof v === 'number') mixN(v);
      else if (typeof v === 'string') mixS(v);
      else if (typeof v === 'boolean') mixU(v ? 1 : 2);
      else if (v && typeof v === 'object' && !Array.isArray(v)) for (const kk of Object.keys(v).sort()){ mixS(kk); const w = v[kk]; if (typeof w === 'number') mixN(w); else if (typeof w === 'string') mixS(w); else mixU(w ? 3 : 4); }
    }
  }
  return h >>> 0;
}
