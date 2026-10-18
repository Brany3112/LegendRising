// js/life/football/judge.js: how good a place to shoot from is, how good a team-mate is as a pass, the record of a
// decision the player made with the ball and what the dressing room made of it. Ported from the 2D engine's decide.js
// (xgAt, mateQ, MATE_STATE, judgeMoment) to the pitch frame and to live geometry, and made pure: judgeDecision returns
// the changes, bridge.js applies them through chemAdd, trait and trustAdd.
// Owner: WP-E. Contract DESIGN 1.4.15 (xgAt, mateQ, MATE_STATE, decisionRecord, judgeDecision); behaviour 3.2.11
// (judgement) and 3.2.3 (the value surface uses xgAt).
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no Math.random.

import {FIFA} from "./pitchspec.js";
import {exp, atan2, hypot} from "./detmath.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// team-mate states and what each is worth as a pass (decide.js MATE_STATE factors)
export const MATE_STATE = Object.freeze({open: 1, space: 1, better: 1.06, run: 0.86, marked: 0.5, held: 0.26});
const OPEN_STATES = new Set(["open", "space", "better", "run"]);

// The chance of a goal from a point with nothing in the way (decide.js xgAt): the angle the mouth subtends times
// exp(-d/22), clamped to 0.01..0.85. dGoal: metres from the goal line (at least 0.6 counts), lat: metres off the centre.
export function xgGeo(dGoal, lat){
  const dy = Math.max(0.6, dGoal), hw = FIFA.goalW/2, d = hypot(lat, dy);
  const ang = Math.abs(atan2(hw - lat, dy) - atan2(-hw - lat, dy));
  return clamp(ang*1.25*exp(-d/22), 0.01, 0.85);
}

// xG of a shot by `team` from (x, z) (pitch frame), with the bodies between the ball and the goal: each opponent
// within 1.0 m of the line to the goal centre (and in front of the ball) takes 0.32 off, down to 0.22 of the open
// value (decide.js). ignore: an agent id left out (the shooter's own marker when asked about a pass).
export function xgAt(ms, team, x, z, ignore = -1){
  const dir = ms.dirs[team], gx = dir*ms.spec.hx;
  const q = xgGeo(dir*(gx - x), dir*z);
  let block = 0;
  const vx = gx - x, vz = -z, L2 = vx*vx + vz*vz || 1;
  const ag = ms.agents;
  for (let i = 0; i < ag.length; i++){
    const o = ag[i];
    if (o.team === team || o.team < 0 || !o.onPitch || o.id === ignore) continue;
    const ox = o.m.x - x, oz = o.m.z - z;
    const t = (ox*vx + oz*vz)/L2;
    if (t <= 0.02 || t > 1) continue;
    const px = ox - vx*t, pz = oz - vz*t;
    if (px*px + pz*pz < 1.0) block += o.isGK ? 0.16 : 0.32;
  }
  return q*Math.max(0.22, 1 - block);
}

// the nearest opponent of `team` to (x, z): {d, id}
export function nearestOpp(ms, team, x, z, out = {d: Infinity, id: -1}){
  out.d = Infinity; out.id = -1;
  const ag = ms.agents;
  for (let i = 0; i < ag.length; i++){
    const o = ag[i];
    if (o.team === team || o.team < 0 || !o.onPitch) continue;
    const d = hypot(o.m.x - x, o.m.z - z);
    if (d < out.d){ out.d = d; out.id = o.id; }
  }
  return out;
}
// is the lane from (x0, z0) to (x1, z1) free of opponents of `team` within `w` metres?
export function laneOpen(ms, team, x0, z0, x1, z1, w = 1.1){
  const vx = x1 - x0, vz = z1 - z0, L2 = vx*vx + vz*vz || 1;
  const ag = ms.agents;
  for (let i = 0; i < ag.length; i++){
    const o = ag[i];
    if (o.team === team || o.team < 0 || !o.onPitch) continue;
    const ox = o.m.x - x0, oz = o.m.z - z0, t = (ox*vx + oz*vz)/L2;
    if (t <= 0.03 || t >= 0.97) continue;
    const px = ox - vx*t, pz = oz - vz*t;
    if (px*px + pz*pz < w*w) return false;
  }
  return true;
}

// a team-mate's state as the live geometry shows it: held (an opponent within 0.8 m), marked (within 2 m), making a
// run (over 4 m/s toward their goal), a better angle than the carrier's, in space (nobody within 6 m), or open
const NO = {d: 0, id: -1};
export function mateState(ms, carrier, mate){
  const team = mate.team, dir = ms.dirs[team], m = mate.m;
  const n = nearestOpp(ms, team, m.x, m.z, NO);
  if (n.d < 0.8) return 'held';
  if (n.d < 2.0) return 'marked';
  if (m.speed > 4 && dir*m.vx > 0.6*m.speed) return 'run';
  const c = carrier.m;
  if (xgAt(ms, team, m.x, m.z) > 1.2*xgAt(ms, team, c.x, c.z) + 0.02) return 'better';
  return n.d > 6 ? 'space' : 'open';
}

// how good a pass to `mate` is from the carrier (decide.js mateQ): xG where he is, by his state, the lane and the
// distance (clamp(1.12 - d/45, 0.5, 1))
export function mateQ(ms, carrier, mate, state = null){
  const c = carrier.m, m = mate.m, d = hypot(m.x - c.x, m.z - c.z);
  const st = state || mateState(ms, carrier, mate);
  const lane = laneOpen(ms, carrier.team, c.x, c.z, m.x, m.z, 1.1) ? 1 : 0.35;
  return xgAt(ms, mate.team, m.x, m.z)*(MATE_STATE[st] || 1)*lane*clamp(1.12 - d/45, 0.5, 1);
}

// The record of a decision the player made with the ball (3.2.11): what he chose and how good it was against his
// options at that instant. chosen = {choice: 'shoot'|'pass'|'dribble'|'cross'|'clear'|'hold', recv: agent id | -1}.
// Returns {choice, chosenQ, shotQ, bestQ, bestOpen, bestName, chosenState, chosenName, ctx, t, agent, recv}.
export function decisionRecord(ms, a, chosen){
  const team = a.team, dir = ms.dirs[team], c = a.m;
  const shotQ = xgAt(ms, team, c.x, c.z);
  let best = null, bestQ = 0, bestSt = '';
  let chosenQ = 0, chosenState = '', chosenName = '';
  const ag = ms.agents;
  for (let i = 0; i < ag.length; i++){
    const m = ag[i];
    if (m.team !== team || m === a || !m.onPitch || m.isGK) continue;
    const st = mateState(ms, a, m), q = mateQ(ms, a, m, st);
    if (q > bestQ){ bestQ = q; best = m; bestSt = st; }
    if (chosen.recv === m.id){ chosenQ = q; chosenState = st; chosenName = m.name; }
  }
  const choice = chosen.choice || 'pass';
  if (choice === 'shoot') chosenQ = shotQ;
  else if (choice !== 'pass' && choice !== 'cross') chosenQ = shotQ*0.9;
  const u = dir*c.x + ms.spec.hx, wide = Math.abs(c.z) > ms.spec.hz - 18;
  const ctx = u > 0.66*ms.spec.L && wide ? 'cross' : u < 0.55*ms.spec.L ? 'construction' : 'open';
  return {choice, chosenQ, shotQ, bestQ, bestOpen: OPEN_STATES.has(bestSt), bestName: best ? best.name : '',
    chosenState, chosenName, ctx, t: ms.t, agent: a.id, recv: chosen.recv != null ? chosen.recv : -1, setPiece: chosen.setPiece || null};
}

// What everyone made of it (decide.js judgeMoment, made pure). rec from decisionRecord; result = {r: 'goal'|'saved'|
// 'corner'|'post'|'bar'|'blocked'|'miss'|'passOk'|'outplay'|'intercepted'|'lost'|'tackleWin'|'foul'|'beaten', margin
// (metres a missed shot was off), saveQ (how good the save had to be, 0..1), xg, goalAfter (the move ended in a goal),
// lastMan}. Returns {chem, traits: {team, conf, dec, risk}, trust, say}.
export function judgeDecision(rec, result){
  const r = result.r, margin = result.margin || 0, saveQ = result.saveQ || 0;
  let chem = 0, trust = 0, say = "";
  const T = {team: 0, conf: 0, dec: 0, risk: 0};
  const add = (k, d) => { T[k] += d; };
  const passed = r === 'passOk' || r === 'goal' && rec.choice === 'pass';
  if (rec.setPiece && rec.choice === 'shoot'){
    if (r === 'goal'){ chem += 1; add('conf', 1.2); say = rec.setPiece === 'penalty' ? "Cool as you like." : "Unstoppable."; }
    else if (r === 'saved' || r === 'corner'){
      if (saveQ > 0.55){ add('conf', 0.2); say = "Great save. Nothing wrong with that strike."; }
      else { chem -= 0.5; add('conf', -0.4); say = "Too close to the keeper."; }
    } else if (r === 'post' || r === 'bar'){ chem -= 0.3; say = "Inches away."; }
    else if (r === 'blocked'){ chem -= 0.5; say = "Into the wall."; }
    else if (r === 'miss'){
      if (margin < 0.8){ chem -= 0.6; say = "Just wide."; }
      else if (margin < 2.5){ chem -= 1.2; add('conf', -0.5); say = "Not close enough."; }
      else { chem -= 2.2; add('conf', -0.8); add('dec', -0.3); say = "Way off. Somebody else will want this next time."; }
    }
  } else if (rec.choice === 'shoot'){
    const gap = rec.bestQ - rec.shotQ;
    let base = 0;
    if (rec.ctx === 'construction') base = rec.shotQ < 0.1 ? -2.2 : rec.shotQ < 0.2 ? -1.3 : 0;
    else if (gap > 0.12 && rec.bestOpen) base = -(1 + gap*6);
    const mul = r === 'goal' ? 0.12 : (r === 'saved' || r === 'corner') ? (saveQ > 0.55 ? 0.3 : 0.5) : (r === 'post' || r === 'bar') ? 0.5
      : r === 'blocked' ? 0.8 : r === 'miss' ? (margin > 3 ? 1.5 : margin > 1 ? 1.1 : 0.8) : 1;
    if (base < 0){
      chem += base*mul; add('team', -(0.7 + Math.max(0, gap)*2)); add('risk', 0.6);
      if (r !== 'goal'){ add('dec', -0.5); if (rec.ctx === 'construction') trust -= 0.8; }
      say = r === 'goal' ? (rec.ctx === 'construction' ? "Audacious, and it went in. They'll let it go this time." : `It went in, but ${rec.bestName} was free.`)
        : rec.ctx === 'construction' ? "“We were building that. Why shoot from there?”" : `${rec.bestName} was free and he let you know it.`;
    } else {
      add('dec', 0.35);
      if (r === 'goal'){ chem += 0.6; add('conf', 1); say = "Right call, and finished."; }
      else if ((r === 'saved' || r === 'corner') && saveQ > 0.55) say = "Right call. The keeper just did his job.";
    }
    if (r === 'miss' && rec.shotQ > 0.3 && margin > 3){ chem -= 0.8; add('conf', -0.5); if (!say || base >= 0) say = "A big chance, badly missed."; }
  } else if (rec.choice === 'pass' || rec.choice === 'cross'){
    const wrongMan = rec.bestOpen && rec.bestName && rec.chosenName && rec.chosenName !== rec.bestName && rec.chosenQ < rec.bestQ*0.6;
    if (wrongMan){
      chem += passed ? (result.goalAfter ? 0.6 : 0.3) : -0.3; add('dec', -0.4); add('team', 0.2);
      const why = rec.chosenState === 'held' ? "being held" : rec.chosenState === 'marked' ? "marked" : "";
      say = passed ? (result.goalAfter ? `It came off, but ${rec.bestName} was in more space.` : `${rec.bestName} was in more space.`)
        : why ? `${rec.chosenName} was ${why}. ${rec.bestName} was free.` : `${rec.bestName} was the better ball.`;
    } else if (rec.chosenQ >= rec.shotQ - 0.05){
      chem += passed ? 1 + (result.goalAfter ? 1 : 0) : 0.2; add('team', 0.9); add('dec', 0.4);
      say = result.goalAfter ? "Unselfish. The lads love that." : passed ? "Right ball." : "Right idea, the execution let you down.";
    } else if (rec.shotQ > rec.chosenQ + 0.15){
      chem += passed ? 0.4 : 0; add('conf', -0.5); add('dec', -0.3); add('team', 0.3);
      say = "You had the shot on there.";
    } else {
      chem += passed ? 0.5 : -0.2; add('team', 0.4);
      if (r === 'outplay'){ chem -= 0.5; add('dec', -0.2); }
    }
  }
  if (r === 'tackleWin'){ chem += 0.5; add('conf', 0.2); add('dec', 0.15); }
  if (r === 'foul'){ add('risk', 0.5); add('dec', -0.2); }
  if (r === 'lost' && result.lastMan){ chem -= 0.5; add('dec', -0.3); say = say || "You were the last man. That can't happen."; }
  if (r === 'beaten' && result.lastMan) chem -= 0.5;
  chem = Math.round(chem*10)/10;
  return {chem, traits: T, trust, say};
}
