// js/life/football/tactics.js: where a team stands. Each team plays its real formation: every slot has an anchor in
// the team frame (DESIGN 1.1), and five times a second the shape around the ball is worked out: the phase (with the
// ball, without it, or the transition after it changes hands), the defensive line, the length and width, the role
// modifiers (overlapping full-backs, wingers holding the width, the striker on the last line, the ten between the
// lines, the holding midfielder screening), and, without the ball, who presses, who covers and who marks whom. Also
// the club's style (from its name, fixed), the value surface the carrier reads, and the one-line scenario that
// describes what is going on.
// Owner: WP-E. Contract DESIGN 1.4.14 (teamShape, assignDefence, clubStyle, xT); behaviour 3.2.2, 3.2.5, 3.2.9
// (situation lines); cadence 1.5.6.
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no Math.random.

import {hashStr} from "./rng.js";
import {xgGeo} from "./judge.js";
import {hypot} from "./detmath.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a)*t;

// js/data/positions.js POSITIONS, the coordinates only (x 0..100 left to right, y 0..100 own goal to theirs) and the
// line each slot belongs to. The simulation is pure, so it keeps its own copy of the numbers (bridge.js passes the
// slots; positions.js stays the source for the career screens). qa/unit/sim.mjs checks the two agree.
export const SLOT_POS = Object.freeze({
  GK: {x: 50, y: 6, line: 'GK'}, LB: {x: 14, y: 24, line: 'DF'}, CB: {x: 50, y: 20, line: 'DF'}, RB: {x: 86, y: 24, line: 'DF'},
  LWB: {x: 10, y: 40, line: 'DF'}, RWB: {x: 90, y: 40, line: 'DF'}, CDM: {x: 50, y: 36, line: 'CM'}, LM: {x: 14, y: 56, line: 'FWD'},
  CM: {x: 50, y: 50, line: 'CM'}, RM: {x: 86, y: 56, line: 'FWD'}, CAM: {x: 50, y: 65, line: 'CAM'}, LW: {x: 16, y: 76, line: 'FWD'},
  RW: {x: 84, y: 76, line: 'FWD'}, LF: {x: 32, y: 84, line: 'FWD'}, CF: {x: 50, y: 80, line: 'FWD'}, RF: {x: 68, y: 84, line: 'FWD'},
  ST: {x: 50, y: 90, line: 'FWD'}
});
const FULLBACK = new Set(['LB', 'RB', 'LWB', 'RWB']);
const WINGER = new Set(['LW', 'RW', 'LM', 'RM']);
const STRIKER = new Set(['ST', 'CF', 'LF', 'RF']);

// 3.2.2 numbers
export const TAC = Object.freeze({
  TIGHT_U: 0.40,
  CROSS_DROP: [38, 14, 15, 25, 11],   // the ball within 38 m of goal and more than 14 m wide: the line no higher than 15 m
                                      // (11 m with the ball within 25 m)
  LINE_OUT: [0.55, 8, 14, 52], LINE_IN: [0.65, 18, 22, 70],
  LEN_OUT: 30, LEN_IN: 45, WID_OUT: 38, WID_IN: 60, BALL_SHIFT: 0.35,
  TRANSITION: 2.5, BLEND: 1.5, OVERLAP: 8, WING_HOLD: 4, ST_OFF: 0.6, AM_OFF: 4, DM_SCREEN: 6,
  COUNTER_PRESS: 3, PRESS_STOP: 1.6, COVER: 7, MARK_GAP: 1.8
});

// A club's style from its name (3.2.2): line -6..6 m, press -1..1, width -4..4 m, directness 0.35..0.65. Frozen at
// kick-off.
export function clubStyle(name){
  const h = hashStr("tac:" + (name || ""));
  const f = k => ((h >>> (k*8)) & 255)/255;
  return {lineBias: Math.round((f(0)*12 - 6)*10)/10, pressBias: Math.round((f(1)*2 - 1)*100)/100,
    widthBias: Math.round((f(2)*8 - 4)*10)/10, directness: Math.round((0.35 + f(3)*0.3)*100)/100};
}

// The value surface (3.2.3): xT(u, w) = 0.8 xg(u, w) + 0.02 (u/L)^2, in the team frame of a pitch of length L and
// width Wd. xg is the open-goal model of judge.js with nothing in the way.
export function xT(u, w, L = 105, Wd = 68){
  return 0.8*xgGeo(L - u, w - Wd/2) + 0.02*(u/L)*(u/L);
}

// the slot's depth from the back line (0) to the front (1)
export function depthOf(slot){
  const p = SLOT_POS[slot] || SLOT_POS.CM;
  if (slot === 'GK') return -0.5;
  return clamp((p.y - 22)/(90 - 22), 0, 1);
}

// a team's runtime shape record (one per team in ms.tm)
export function createShape(style, slots){
  return {phase: 'outPoss', poss: false, changeT: -99, line: 30, lineOpp: 70, oppMid: 55, len: TAC.LEN_OUT, wid: TAC.WID_OUT,
    ballU: 52, ballW: 34, style, slots, press: [], cover: -1, marks: new Map(), counterT: -99, counter: [], lastT: -1};
}

// Team shape (3.2.2), 5 Hz: phase, line, length, width, every outfield agent's anchor and its role modifiers.
export function teamShape(ms, team){
  const tm = ms.tm[team], spec = ms.spec, L = spec.L, Wd = spec.Wd, dir = ms.dirs[team], st = tm.style, tempo = ms.cfg.tempo || {};
  // at a restart the shape is taken from the spot (not from a ball still being fetched) and the side with the restart
  // has the ball
  const R0 = ms.restart && !ms.restart.taken ? ms.restart : null;
  const b = R0 ? R0.spot : ms.ball.p, bu = dir*b.x + L/2, bw = dir*b.z + Wd/2;
  const poss = R0 ? R0.team === team : ms.poss.team === team;
  if (poss !== tm.poss){ tm.poss = poss; tm.changeT = ms.t; }
  tm.phase = ms.t - tm.changeT < TAC.TRANSITION ? 'transition' : poss ? 'inPoss' : 'outPoss';
  tm.ballU = bu; tm.ballW = bw;
  // the late-game shifts (3.2.2): losing after 75 minutes push on, winning after 80 sit in
  const min = ms.half === 2 ? 45 + ms.clock.sec/60 : ms.clock.sec/60;
  const diff = ms.score[team] - ms.score[1 - team];
  let lineAdj = st.lineBias || 0;
  if (ms.half === 2 && diff < 0 && min >= 75) lineAdj += 4;
  if (ms.half === 2 && diff > 0 && min >= 80) lineAdj -= 4;
  tm.lateShot = ms.half === 2 && diff < 0 && min >= 75 ? 1.3 : 1;
  tm.latePress = ms.half === 2 && diff < 0 && min >= 75 ? 0.3 : 0;
  tm.lateDirect = ms.half === 2 && diff > 0 && min >= 80 ? -0.1 : 0;
  const k = TAC[poss ? 'LINE_IN' : 'LINE_OUT'];
  // the field length the formula's numbers are for is 105; a smaller pitch scales them
  const sL = L/105, sW = Wd/68;
  tm.line = clamp(k[0]*bu + (k[1] + lineAdj)*sL, k[2]*sL, k[3]*sL);
  // a cross coming: with the ball wide in his own final third the back line drops to the edge of the box to defend
  // the space a cross is aimed at (the line formula alone would leave the six-yard box empty)
  if (!poss && bu < TAC.CROSS_DROP[0]*sL && Math.abs(bw - Wd/2) > TAC.CROSS_DROP[1]*sW) tm.line = Math.min(tm.line, (bu < TAC.CROSS_DROP[3]*sL ? TAC.CROSS_DROP[4] : TAC.CROSS_DROP[2])*sL);
  tm.len = (poss ? TAC.LEN_IN : TAC.LEN_OUT)*sL;
  tm.wid = clamp(((poss ? TAC.WID_IN : TAC.WID_OUT) + (st.widthBias || 0))*sW, 20*sW, Wd - 4);
  // the opponents' last line (their second-last body, keeper counted) and midfield, in this team's frame
  let a1 = -1, a2 = -1, midSum = 0, midN = 0;
  for (const o of ms.agents){
    if (o.team !== 1 - team || !o.onPitch || o.role !== 'player') continue;
    const u = dir*o.m.x + L/2;
    if (u > a1){ a2 = a1; a1 = u; } else if (u > a2) a2 = u;
    if (!o.isGK && (o.slotLine === 'CM' || o.slotLine === 'CAM')){ midSum += u; midN++; }
  }
  tm.lineOpp = a2 > 0 ? a2 : L*0.7;
  tm.oppMid = midN ? midSum/midN : (tm.lineOpp + bu)/2;
  // anchors
  const blend = clamp((ms.t - tm.changeT)/TAC.BLEND, 0, 1);
  for (const a of ms.agents){
    if (a.team !== team || !a.onPitch || a.role !== 'player' || a.isGK) continue;
    const slot = a.slot, p = SLOT_POS[slot] || SLOT_POS.CM;
    const w0 = (a.baseX != null ? a.baseX : p.x)/100*Wd, d = depthOf(slot);
    let u = tm.line + d*tm.len;
    let w = Wd/2 + (w0 - Wd/2)*tm.wid/Wd + (bw - Wd/2)*TAC.BALL_SHIFT;
    if (poss){
      if (STRIKER.has(slot)) u = Math.max(u, tm.lineOpp - TAC.ST_OFF*sL - (slot === 'ST' ? 0 : 2*sL));
      if (slot === 'CAM') u = clamp(tm.oppMid - TAC.AM_OFF*sL + 2*sL, tm.line + 10*sL, tm.lineOpp - 6*sL);
      if (WINGER.has(slot)){ const side = w0 < Wd/2 ? -1 : 1; w = side < 0 ? lerp(w, TAC.WING_HOLD*sW, 0.7) : lerp(w, Wd - TAC.WING_HOLD*sW, 0.7); u = Math.max(u, tm.lineOpp - 10*sL); }
      if (FULLBACK.has(slot)){
        const side = w0 < Wd/2 ? -1 : 1, ballSide = (bw - Wd/2)*side > 4*sW;
        // overlap when the ball is on his side and his winger has come inside
        const wing = ms.agents.find(o => o.team === team && o.onPitch && WINGER.has(o.slot) && (SLOT_POS[o.slot].x < 50) === (side < 0));
        const inside = wing && Math.abs((dir*wing.m.z + Wd/2) - Wd/2) < Wd/2 - 12*sW;
        if (ballSide && (inside || !wing)) u += TAC.OVERLAP*sL;
      }
      if (slot === 'CDM') u = Math.min(u, tm.line + TAC.DM_SCREEN*sL + 6*sL);
      // nobody but a runner stands offside: hold at the line
      u = Math.min(u, tm.lineOpp - 0.3);
    } else {
      if (slot === 'CDM') u = tm.line + TAC.DM_SCREEN*sL;
      if (STRIKER.has(slot)) u = Math.min(u, Math.max(tm.line + tm.len, bu + 8*sL));
    }
    u = clamp(u, 3, L - 2); w = clamp(w, 2, Wd - 2);
    // the transition blend: anchors move to the new shape over 1.5 s
    if (blend < 1 && a.anchor.set){ a.anchor.u = lerp(a.anchor.u, u, Math.max(0.25, blend)); a.anchor.w = lerp(a.anchor.w, w, Math.max(0.25, blend)); }
    else { a.anchor.u = u; a.anchor.w = w; a.anchor.set = true; }
  }
  tm.lastT = ms.t;
}

// pitch position of a team-frame point
export function teamToPitch(ms, team, u, w, out = {x: 0, z: 0}){
  const dir = ms.dirs[team];
  out.x = dir*(u - ms.spec.L/2); out.z = dir*(w - ms.spec.Wd/2);
  return out;
}

// Pressing, cover and marking (3.2.5), 5 Hz, for the team without the ball. Writes a.task = {press: 0 | 1 | 2, mark,
// run} on every outfield agent: press 1 is the presser (lowest time to the ball, approach to 1.6 m then jockey), press
// 2 the cover (6 to 8 m behind on the goal side), mark the opponent he picks up (greedy, as the 2D engine's markUp,
// against the threats in his own half weighted by distance and their value). The counter-press: the two nearest a
// turnover press for 3 s when the club presses.
export function assignDefence(ms, team){
  const tm = ms.tm[team], L = ms.spec.L, Wd = ms.spec.Wd, dir = ms.dirs[team];
  for (const a of ms.agents) if (a.team === team && a.role === 'player'){ a.task.press = 0; a.task.mark = -1; a.task.markTight = false; }
  tm.marks.clear();
  if (ms.poss.team === team && ms.poss.ctl >= 0) return;
  if (ms.phase !== 'live') return;
  const b = ms.ball.p, carrier = ms.poss.ctl >= 0 ? ms.agents[ms.poss.ctl] : null;
  const st = tm.style, pressMul = (ms.cfg.tempo && ms.cfg.tempo.pressMul) || 1;
  // own-frame ball position: how high up the pitch the opponents have it
  const bu = dir*b.x + L/2;
  const pressing = (st.pressBias || 0) + (tm.latePress || 0);
  // the press zone: everywhere in his own half, up to the opponents' third for a pressing side
  const zone = (0.62 + 0.18*clamp(pressing, -1, 1))*L*clamp(pressMul, 0.8, 1.4);
  // candidates by a quick time to the ball: distance over his top speed, plus a turn
  let best = null, bestT = Infinity, second = null, secondT = Infinity;
  for (const a of ms.agents){
    if (a.team !== team || !a.onPitch || a.role !== 'player' || a.isGK || a.sentOff) continue;
    const m = a.m, d = hypot(b.x - m.x, b.z - m.z);
    const t = d/(a.prm.sprint*0.9) + 0.15;
    if (t < bestT){ second = best; secondT = bestT; best = a; bestT = t; }
    else if (t < secondT){ second = a; secondT = t; }
  }
  if (best && (bu < zone || ms.t - tm.counterT < TAC.COUNTER_PRESS || bestT < 1.2)) best.task.press = 1;
  if (second && best && best.task.press === 1) second.task.press = 2;
  tm.press = [best ? best.id : -1, second ? second.id : -1];
  tm.counterOn = ms.t - tm.counterT < TAC.COUNTER_PRESS && pressing > 0;
  if (tm.counterOn && second) second.task.press = 1;
  // marking: the remaining back line and midfield against threats in their own half (and a striker who drops)
  const defs = [], threats = [];
  for (const a of ms.agents){
    if (a.team !== team || !a.onPitch || a.role !== 'player' || a.isGK || a.task.press) continue;
    if (a.slotLine === 'DF' || a.slotLine === 'CM') defs.push(a);
  }
  for (const o of ms.agents){
    if (o.team !== 1 - team || !o.onPitch || o.role !== 'player' || o.isGK || o === carrier) continue;
    const u = dir*o.m.x + L/2;        // the threat's position in the marking team's frame (low u: near our goal)
    if (u > L*0.62) continue;
    const val = xT(L - u, Wd - (dir*o.m.z + Wd/2), L, Wd);
    threats.push({o, val});
  }
  const pairs = [];
  for (const d of defs) for (const t of threats){
    const dist = hypot(d.m.x - t.o.m.x, d.m.z - t.o.m.z);
    pairs.push({d, o: t.o, q: dist/(1 + 6*t.val)});
  }
  pairs.sort((p, q) => p.q - q.q || p.d.id - q.d.id || p.o.id - q.o.id);
  const done = new Set(), taken = new Set();
  for (const p of pairs){
    if (done.has(p.d.id) || taken.has(p.o.id) || p.q > 14) continue;
    done.add(p.d.id); taken.add(p.o.id);
    p.d.task.mark = p.o.id; tm.marks.set(p.d.id, p.o.id);
    // tight within 42 m of his own goal (or on the man about to receive), a zone with a pull toward the man further out
    p.d.task.markTight = dir*p.o.m.x + L/2 < L*TAC.TIGHT_U;
  }
}

// a turnover: the side that lost it may counter-press
export function noteTurnover(ms, lostTeam){ ms.tm[lostTeam].counterT = ms.t; }

/* ---------- the scenario line (3.2.9) ---------- */

// One line describing what is going on around the player, or null. Describes, never creates: each condition is read
// from the state; the caller shows at most one line per 20 s of real time (ms.sitT keeps the last).
export function situation(ms, me){
  const a = ms.agents[me];
  if (!a || !a.onPitch) return null;
  const team = a.team, dir = ms.dirs[team], L = ms.spec.L, Wd = ms.spec.Wd, tm = ms.tm[team], opp = ms.tm[1 - team];
  const b = ms.ball.p, bu = dir*b.x + L/2;
  const R = ms.restart;
  if (R && R.kind === 'penalty') return R.team === team ? "Penalty to us." : "Penalty to them.";
  // a counter: our side just won it with three or more attackers ahead of the ball
  if (ms.poss.team === team && ms.t - tm.changeT < 3){
    let ahead = 0;
    for (const o of ms.agents) if (o.team === team && o.onPitch && !o.isGK && dir*o.m.x + L/2 > bu + 2) ahead++;
    if (ahead >= 3){ const side = dir*b.z > 0 ? "right" : "left"; return `Counter attack. Support on the ${side}.`; }
  }
  const forward = a.arch === 'ST' || a.arch === 'W';
  if (forward && L - opp.line > 40*L/105 && ms.poss.team === team) return "Their line is high. Time your run.";
  // the last outfield defender
  if (ms.poss.team === 1 - team && !a.isGK){
    let lower = 0;
    const ua = dir*a.m.x + L/2;
    for (const o of ms.agents) if (o.team === team && o.onPitch && !o.isGK && o !== a && dir*o.m.x + L/2 < ua) lower++;
    if (lower === 0 && ua < L*0.5) return "You're the last man. Stay goal side.";
  }
  if (R && R.kind === 'corner') return R.team === team ? "Corner. Attack the near post." : "Corner against. Pick up your man.";
  if (R && R.kind === 'free' && R.team === team){
    const dg = hypot(dir*L/2 - R.spot.x, R.spot.z);
    if (dg < 30) return "Free kick in a good spot.";
  }
  if ((tm.style.pressBias || 0) > 0 && ms.poss.team === 1 - team && bu > L*0.66) return "We're pressing high. Close down the nearest man.";
  if (ms.poss.team === team && L - opp.line < 25*L/105) return "They're sitting deep. Be patient.";
  const min = ms.half === 2 ? 45 + ms.clock.sec/60 : ms.clock.sec/60;
  const diff = ms.score[team] - ms.score[1 - team];
  if (ms.half === 2 && min >= 85){ if (diff < 0) return "Not long left. We need a goal."; if (diff > 0) return "Hold on to it. Keep it simple."; }
  // a winger free on a side
  if (ms.poss.team === team){
    for (const o of ms.agents){
      if (o.team !== team || !o.onPitch || o === a || !WINGER.has(o.slot)) continue;
      let free = true;
      for (const q of ms.agents) if (q.team === 1 - team && q.onPitch && hypot(q.m.x - o.m.x, q.m.z - o.m.z) < 10){ free = false; break; }
      if (free){ const side = dir*o.m.z > 0 ? "right" : "left"; return `Your winger is free on the ${side}.`; }
    }
  }
  return null;
}
