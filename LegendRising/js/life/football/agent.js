// js/life/football/agent.js: one body on the pitch. The agent record every simulated footballer, keeper and official
// is (its mover, stamina pool, gait clock, attributes, intent and executing action), the capsules its body is made of,
// the shoulder-to-shoulder separation that keeps bodies apart (and staggers the one that loses a heavy duel), and the
// reach heights the ball prediction is read against.
// Owner: WP-E (match simulation). Contract DESIGN 1.4.13 (Agent, capsules, separate); constants 1.5.2 (stagger);
// behaviour 3.2.1 step 5 and 3.2.5 (duels).
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
    name: o.name || '', number: o.number || 0, foot: o.prefFoot === 'Left' || o.prefFoot === 'L' ? 'L' : o.prefFoot === 'Both' ? 'B' : 'R',
    m: createMover({x: o.x || 0, z: o.z || 0, yaw: o.yaw || 0}),
    prm: moverParams({pace: at.pace, dribbling: at.dribbling}, "football", o.items || {}),
    st: createStam({stamina: at.stamina != null ? at.stamina : 50, energy, fatigue: o.fatigue || 0}),
    g: createGait(),
    y: 0, vy: 0,
    look: {yaw: o.yaw || 0, pitch: 0},
    at, energy, energy0: energy, fatigue: o.fatigue || 0,
    intent: {dx: 0, dz: 0, gait: 'jog', face: null, strafe: false, speedCap: Infinity, action: null},
    act: null,
    state: role === 'player' ? 'idle' : 'idle', stateT: 0, cooldown: 0,
    onPitch: o.onPitch !== false, booked: 0, sentOff: false, injured: false,
    anchor: {u: 0, w: 0}, task: {press: 0, mark: -1, run: null},
    brain: {next: 0, pending: false, last: null},
    on: [],
    // additions (not in the 1.4.13 shape): steering target, tiredness factors, the body record for the ball world,
    // where the step started (the no-teleport assert), per-agent accumulators the event log cannot give
    tgt: {x: o.x || 0, z: o.z || 0, gait: 'jog', face: null, speedCap: Infinity, stop: 0.25, strafe: false},
    fac: null, eF: 1,
    body: {id: o.id, team: o.team != null ? o.team : -1, x: o.x || 0, z: o.z || 0, h: o.scale || 1, vx: 0, vz: 0, y: 0, vy: 0, seg: null, ghost: false},
    x0: o.x || 0, z0: o.z || 0,
    acc: {dist: 0, sprints: 0, sprintOn: false, oop: 0, oopFar: 0, drain: 0, mins: 0},
    touchFoot: 0, strides: 0, footN: 0, drib: null, ctl: false, plan: null, set: null, wall: false,
    perceived: 0, callT: -99, calls: 0, lastCall: -99, chalT: -99, gk: null, react: 0.2, cool: {tackle: 0, call: 0, header: 0}
  };
  a.react = 0.25 - 0.0015*clamp(at.interception != null ? at.interception : 50, 0, 99);
  return a;
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
// are skipped. Returns the number of staggers.
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
          if (out) out.push(loser.id, loser === a ? b.id : a.id);
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
