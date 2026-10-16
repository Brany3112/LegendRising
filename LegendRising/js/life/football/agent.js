// js/life/football/agent.js: one body on the pitch. The agent record every simulated footballer, keeper and official
// is (its mover, stamina pool, gait clock, attributes, intent and executing action), the capsules its body is made of,
// the shoulder-to-shoulder separation that keeps bodies apart (and staggers the one that loses a heavy duel), and the
// reach heights the ball prediction is read against.
// Owner: WP-E (match simulation). Contract DESIGN 1.4.13 (Agent, capsules, separate); constants 1.5.2 (stagger);
// behaviour 3.2.1 step 5 and 3.2.5 (duels). P2b-A (Training Mode and football rework, Phase 2b; TRAINING-SPEC 3) adds
// intent.shield and the possession fields (shield, chal, recoverT, duelOn/duelT, chalOn/chalRoll, pushT/pushOn, zLB/zIn/zD).
// UF-A (TR-3 user fixes, USER-ISSUES U10) adds handUp and raiseHand (the hand raised for the ball).
// P5-B (Training Mode Phase 5, the admin panel; TRAINING-SPEC 4 "Player: attributes, physical traits") adds footCode,
// agentAttrs and agentFoot: a body's attributes and preferred foot changed while it plays, with everything worked out
// from them at creation worked out again (its mover profile, its reaction time, its stamina skill).
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no Math.random. Lengths in metres, pitch-local
// frame of DESIGN 1.1 (x along the length, z across, yaw 0 faces -Z).
//
//   const a = createAgent({id: 3, pid: 812, team: 0, slot: 'CB', arch: 'DF', at, x: -30, z: 8, yaw: Math.PI/2});
//   separate(ms.agents, 1/60);

import {createMover, moverParams} from "../mover.js";
import {createStam} from "../stamina.js";
import {createGait} from "../gaitcore.js";
import {hypot} from "./detmath.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// 1.4.13 and 3.2.5 numbers
export const AGENT = Object.freeze({
  SEP_R: 0.30,             // shoulder radius for separation (two bodies keep 0.60 m apart)
  STAGGER_V: 3.0,          // closing speed (m/s) above which the weaker side of a collision staggers
  PUSH_HEAVY: 0.3,         // the heavier momentum takes this share of the push, the lighter 1 - it
  MASS: 75,                // kg; momentum is mass x scale x speed
  REACH: {feet: 0.6, chest: 1.45, head: 2.1, hands: 2.4}   // reachY for firstReach (3.1.2), x scale
});

// the preferred foot as the agent keeps it: 'L', 'R' or 'B' (from 'Left', 'Right', 'Both' or the letters)
export const footCode = f => f === 'Left' || f === 'L' ? 'L' : f === 'Both' || f === 'B' ? 'B' : 'R';

// The agent record (1.4.13). o = {id, pid, team, slot, arch, isGK, isMe, role, scale, at, energy, x, z, yaw, items,
// name, number, prefFoot}. prm is the FOOTBALL mover profile for the agent's pace and dribbling (grip boots for the
// player); officials run on a plain profile. The stamina pool starts full to the cap the match energy allows.
export function createAgent(o){
  const at = o.at || {};
  const role = o.role || 'player';
  const energy = o.energy != null ? +o.energy : 100;
  const a = {
    id: o.id, pid: o.pid != null ? o.pid : -1, team: o.team != null ? o.team : -1, slot: o.slot || '', arch: o.arch || 'CM',
    isGK: !!o.isGK, isMe: !!o.isMe, role, scale: o.scale || 1,
    name: o.name || '', number: o.number || 0, foot: footCode(o.prefFoot),
    m: createMover({x: o.x || 0, z: o.z || 0, yaw: o.yaw || 0}),
    prm: moverParams(prmSkills(at), "football", o.items || {}),
    // (the items his mover profile was made with: agentAttrs makes it again with the same ones)
    items: o.items || null,
    st: createStam({stamina: at.stamina != null ? at.stamina : 50, energy, fatigue: o.fatigue || 0}),
    g: createGait(),
    y: 0, vy: 0,
    look: {yaw: o.yaw || 0, pitch: 0},
    at, energy, energy0: energy, fatigue: o.fatigue || 0,
    // (shield: the intent to shield the ball, P2b-A contract: control.js writes it for the player, brain.js for the AI)
    intent: {dx: 0, dz: 0, gait: 'jog', face: null, strafe: false, speedCap: Infinity, action: null, shield: false},
    act: null,
    state: role === 'player' ? 'idle' : 'idle', stateT: 0, cooldown: 0,
    onPitch: o.onPitch !== false, booked: 0, sentOff: false, injured: false,
    anchor: {u: 0, w: 0}, task: {press: 0, mark: -1, run: null},
    brain: {next: 0, pending: false, last: null},
    on: [],          // [[start, end | null]] in match seconds (the clock's running total, 1.4.13): the minutes
    onT: [],         // the same intervals in simulation seconds (ms.t): event times, real-time gaps
    // additions (not in the 1.4.13 shape): steering target, tiredness factors, the body record for the ball world,
    // where the step started (the no-teleport assert), per-agent accumulators the event log cannot give
    tgt: {x: o.x || 0, z: o.z || 0, gait: 'jog', face: null, speedCap: Infinity, stop: 0.25, strafe: false},
    fac: null, eF: 1,
    body: {id: o.id, team: o.team != null ? o.team : -1, x: o.x || 0, z: o.z || 0, h: o.scale || 1, vx: 0, vz: 0, y: 0, vy: 0, seg: null, ghost: false},
    x0: o.x || 0, z0: o.z || 0,
    acc: {dist: 0, sprints: 0, sprintOn: false, oop: 0, oopFar: 0, drain: 0, mins: 0},
    touchFoot: 0, strides: 0, footN: 0, drib: null, ctl: false, plan: null, set: null, wall: false,
    perceived: 0, callT: -99, calls: 0, lastCall: -99, callCut: -99, chalT: -99, gk: null, react: 0.2, cool: {tackle: 0, call: 0, header: 0},
    // (UF-A, U10: when he last raised his hand for the ball, in simulation seconds: raiseHand)
    handUp: -99,
    // what the match sets on an agent later, declared here so that every agent keeps one shape: the step reads these
    // for all 25 bodies, and agents that grew them in different orders turned every one of those reads into a slow,
    // allocating lookup (3.9.6). Each starts as what it read as before it was first set.
    slotLine: undefined, baseX: null, diveMoved: false, slideMoved: false, cornerRole: null, fkRole: null, wasOn: false,
    tgtSet: false, ctlT: undefined, hold: null, lastChoice: undefined, pendKick: null, nudgeT: undefined, invT: undefined,
    noTouch: undefined, roll: 0, marker: undefined, leaving: false, exit: null, subbedOff: false, penSide: undefined,
    koMate: undefined,
    // P2b-A (spec 3): the shield's resolved state (actions.js shieldStep), the open shield challenge on him ({by, t,
    // open}: sim.js), the time he is up again after a slide, the 50/50 engagement he is in (the controller's id and when
    // it was rolled), the shield challenge he is making (the shielder's id, when he rolled it), his time pushing a
    // shielder from behind, and the race's lower bound (zone.js)
    shield: null, chal: null, recoverT: 0, duelOn: -1, duelT: -99, chalOn: -1, chalRoll: -99, pushT: 0, pushOn: -1, zLB: 0, zIn: false, zD: 0,
    // the agent's own facing vector for faceTo() in the per-step code (one object reused, not a new one a step)
    faceV: {x: 0, z: 0}
  };
  a.react = reactOf(at);
  return a;
}
const prmSkills = at => ({pace: at.pace, dribbling: at.dribbling, acceleration: at.acceleration, sprintSpeed: at.sprintSpeed, agility: at.agility});
const reactOf = at => 0.25 - 0.0015*clamp(at.interception != null ? at.interception : 50, 0, 99);

// New attributes for a body that is already playing (P5-B, the admin panel's live edits): the record's at replaced,
// and what createAgent worked out from it made again the same way: the mover profile (its pace, acceleration, sprint
// speed and agility, with the items he plays in; the bounds it was given are kept), the reaction time, and the stamina
// skill the pool reads. A keeper's own set (at.gk) is kept when the new record has none. Everything else that reads
// the attributes (the touch, the strike, the duels, the AI) reads a.at when it acts, so it follows at once. The body's
// movement state, breath and plans are left as they are: play goes on from where it is.
export function agentAttrs(a, at){
  if (!a || !at || typeof at !== 'object') return a;
  if (at.gk == null && a.at && a.at.gk) at.gk = a.at.gk;
  const bounds = a.prm ? a.prm.bounds : null;
  a.at = at;
  if (a.role === 'player') a.prm = Object.assign(moverParams(prmSkills(at), "football", a.items || {}), {bounds});
  a.react = reactOf(at);
  if (a.st) a.st.stamina = at.stamina != null ? at.stamina : 50;
  return a;
}
// the preferred foot changed while he plays (P5-B): touch.js and the strike read a.foot when they pick a side, so the
// next touch or strike uses it; an action already under way keeps the side it stored
export function agentFoot(a, f){
  if (a) a.foot = footCode(f);
  return a ? a.foot : 'R';
}

// UF-A (USER-ISSUES U10): the hand raised for the ball. Every request for the pass (the player's R, whether or not the
// call itself is taken, and the AI's calls) raises the caller's hand at simulation time t; football/view.js plays the
// raise and the drop from it (moves.js 'upper:hand': up in 0.2 s, held, down by 0.85 s), on his body for everyone to
// see, in third person and in a replay, and in your own first-person view. A request while the hand is still up keeps
// it up rather than starting it again from the bottom. Returns the time the gesture counts from.
export const HAND_T = Object.freeze({UP: 0.2, HOLD: 0.5, END: 0.85});
export function raiseHand(a, t){
  if (!a || !(t >= 0)) return a ? a.handUp : -99;
  const k = t - (a.handUp != null ? a.handUp : -99), H = HAND_T;
  if (k >= 0 && k < H.UP){ /* on its way up: it goes on up */ }
  else if (k >= H.UP && k <= H.HOLD) a.handUp = t - H.UP;                       // up: held up from now
  else if (k > H.HOLD && k < H.END){
    // on its way down: back up from the height it has come down to (the rise is a smoothstep over UP)
    const u = (k - H.HOLD)/(H.END - H.HOLD), r = 1 - u*u*(3 - 2*u);
    let lo = 0, hi = 1;
    for (let i = 0; i < 12; i++){ const m = (lo + hi)/2; if (m*m*(3 - 2*m) < r) lo = m; else hi = m; }
    a.handUp = t - H.UP*(lo + hi)/2;
  } else a.handUp = t;
  return a.handUp;
}

// the body's capsules (1.4.13), scaled by its height: torso, legs and head, measured up from the root (a.y)
export function capsules(a){
  const s = a.scale || 1, y = a.y || 0;
  return {torso: {y0: y + 0.85*s, y1: y + 1.5*s, r: 0.25*s}, legs: {y0: y, y1: y + 0.85*s, r: 0.16*s}, head: {y: y + 1.66*s, r: 0.12*s}};
}

// the reach height of a body part for the prediction (3.1.2): feet 0.6, chest 1.45, head 2.1 plus the jump, keeper
// hands 2.4 plus the dive reach; all x scale
export function reachY(a, part = 'feet'){
  const s = a.scale || 1, R = AGENT.REACH;
  if (part === 'head'){ const j = jumpHeight(a.at && a.at.jumping); return R.head*s + j; }
  if (part === 'hands') return R.hands*s + 0.3;
  return (R[part] || R.feet)*s;
}
// how high a body gets off the ground at full charge (1.5.3 header take-off: v0 = 2.6 + 0.012 jumping): v0^2/(2 g)
export function jumpHeight(jumping = 50){
  const v0 = 2.6 + 0.012*clamp(jumping == null ? 50 : +jumping, 0, 99);
  return v0*v0/(2*9.81);
}

// Separation (3.2.1 step 5): bodies on the pitch closer than two shoulder radii are pushed apart. The push splits 70/30
// by momentum (the heavier body moves 30%), and above 3 m/s of closing speed the lighter one staggers (speed capped at
// 2.0 m/s for 0.35 s, mover.js). A push never moves a body further this step than its top speed allows (the
// no-teleport rule: an overlap left over is resolved over the next steps). Keepers in a dive and bodies off the pitch
// are skipped. Returns the number of staggers; out (an array, optional) receives (loser id, other id, closing speed) for
// each.
export function separate(agents, h, out = null){
  const R2 = 2*AGENT.SEP_R, n = agents.length;
  let staggers = 0;
  for (let i = 0; i < n; i++){
    const a = agents[i];
    if (!a.onPitch || a.role !== 'player' || a.y > 0.4) continue;
    const ma = a.m;
    for (let j = i + 1; j < n; j++){
      const b = agents[j];
      if (!b.onPitch || b.role !== 'player' || b.y > 0.4) continue;
      const mb = b.m, dx = mb.x - ma.x, dz = mb.z - ma.z;
      if (dx > R2 || dx < -R2 || dz > R2 || dz < -R2) continue;
      const d = hypot(dx, dz);
      if (d >= R2) continue;
      let nx, nz;
      if (d > 1e-6){ nx = dx/d; nz = dz/d; } else { nx = a.id < b.id ? 1 : -1; nz = 0; }
      const pen = R2 - d;
      const pa = (a.scale || 1)*ma.speed, pb = (b.scale || 1)*mb.speed;
      const ka = pa > pb ? AGENT.PUSH_HEAVY : pa < pb ? 1 - AGENT.PUSH_HEAVY : 0.5;
      ma.x -= nx*pen*ka; ma.z -= nz*pen*ka;
      mb.x += nx*pen*(1 - ka); mb.z += nz*pen*(1 - ka);
      // closing speed along the line between them
      const close = (ma.vx - mb.vx)*nx + (ma.vz - mb.vz)*nz;
      if (close > AGENT.STAGGER_V){
        const loser = pa > pb ? b : pa < pb ? a : (a.id < b.id ? b : a);
        if (!(loser.m.stagger > 0)){
          loser.m.stagger = loser.prm.staggerT;
          staggers++;
          if (out) out.push(loser.id, loser === a ? b.id : a.id, close);
        }
      }
    }
  }
  // the no-teleport bound: what moverStep and the pushes did this step never exceeds top speed times h
  for (let i = 0; i < n; i++){
    const a = agents[i];
    if (!a.onPitch) continue;
    const m = a.m, ddx = m.x - a.x0, ddz = m.z - a.z0, dd = hypot(ddx, ddz), lim = a.prm.vmax*h;
    if (dd > lim){ const k = lim/dd; m.x = a.x0 + ddx*k; m.z = a.z0 + ddz*k; }
  }
  return staggers;
}

// the record the ball world reads for this body (1.4.10 bodies()): position and velocity at the end of the step, its
// height scale, the jump offset, and a ghost flag for bodies that are not on the pitch
export function bodyRec(a){
  const b = a.body, m = a.m;
  b.x = m.x; b.z = m.z; b.vx = m.vx; b.vz = m.vz; b.h = a.scale || 1; b.y = a.y || 0; b.vy = a.vy || 0;
  b.ghost = !a.onPitch || a.role !== 'player';
  return b;
}
