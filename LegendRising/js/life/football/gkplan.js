// js/life/football/gkplan.js: the maths of a keeper's dive, a jump and a slide, shared by the keeper's brain (the
// simulation moves his body and his hands with it) and his animation (gkmoves.js poses the same body along the same
// curves), so a save on screen is the save the simulation made.
// Owner: WP-E (keeper). Contract DESIGN 1.4.14 (planDive, diveRoot, jumpRoot, slideRoot, handsAt); numbers 1.5.4
// (keeper caps) and 3.5.8 (kinds, phases, launch); behaviour 3.2.6.
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no Math.random.
//
// A dive is a ballistic flight of the keeper's centre of mass: a load (power step) of tLoad seconds, then a launch v
// chosen so that a hand, reaching up to 1.10 x scale from the centre of mass, meets the ball at the planned point when
// it gets there: v = (C - C0 - g t^2/2)/t with t = tc - tLoad, C the centre-of-mass target. The launch is clamped by
// the keeper's caps (lateral 3.4 + 0.03 dive m/s, vertical by kind); a clamped launch cannot reach and the plan says so
// (feasible false, err the miss in metres): the outcome and the animation are the same maths.

import {dirOf} from "./pitchspec.js";
import {hypot} from "./detmath.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };
const G = 9.81;

// 1.5.4 and 3.5.8 numbers
export const GKP = Object.freeze({
  REACH: 1.10,           // hand reach from the centre of mass, x scale
  COM: 0.90,             // centre-of-mass height in the ready stance, x scale
  LIE: 0.25,             // centre-of-mass height lying on the ground, x scale
  STAND: 0.6,            // lateral offset up to which the save is made standing
  COLLAPSE_LAT: 1.2,     // a low ball nearer than this is a collapse
  LOW_Y: 0.35, MID_Y: 1.1, HIGH_Y: 2.6,
  LAT0: 3.4, LAT_K: 0.03,            // lateral launch cap 3.4 + 0.03 dive
  VY: {low: 0.6, mid: 1.4, high0: 2.4, highK: 0.01, collapse: 0.3, stand: 0},
  SLIDE: 0.15,           // ground slide after landing (s)
  STAND_V: 2.5,          // how fast a standing keeper shifts across
  HAND_GAP: 0.09,        // palms behind the ball, this far apart
  READY: {lat: 0.28, up: 0.10, fwd: 0.32}   // hands in the ready stance, from the centre of mass (x scale)
});

// The dive for a ball that will be at hit = {x, y, z, t} (t: seconds from now). gk = {x, z, y, yaw, scale, at: {dive,
// reflex}} (at may be the keeper's gk attributes or an Attrs with .gk). Returns {kind: 'stand'|'collapse'|'low'|'mid'|
// 'high', side: -1 | 1, tLoad, v: {x, y, z}, tc, hand: {x, y, z}, feasible, err} plus C0 (the centre of mass at the
// start), tf (flight time to contact), lat (lateral offset, + to his right) and land (time from the start to landing).
export function planDive(gk, hit){
  const s = gk.scale || 1, at = (gk.at && gk.at.gk) || gk.at || {};
  const dive = clamp(at.dive != null ? +at.dive : 50, 0, 99);
  const f = dirOf(gk.yaw || 0), rx = -f.z, rz = f.x;
  const dx = hit.x - gk.x, dz = hit.z - gk.z;
  const lat = dx*rx + dz*rz, dh = hypot(dx, dz);
  const side = lat >= 0 ? 1 : -1;
  const y = hit.y - (gk.y || 0);
  let kind;
  if (dh <= GKP.STAND && y <= 2.1*s) kind = 'stand';
  else if (y < GKP.LOW_Y) kind = Math.abs(lat) < GKP.COLLAPSE_LAT ? 'collapse' : 'low';
  else if (y < GKP.MID_Y) kind = 'mid';
  else kind = 'high';
  const tLoad = kind === 'stand' || kind === 'collapse' ? 0
    : kind === 'high' ? clamp(0.15 - 0.0004*dive, 0.12, 0.15) : clamp(0.15 - 0.0006*dive, 0.10, 0.15);
  const t = Math.max(0, +hit.t || 0), tf = Math.max(0.05, t - tLoad);
  const reach = GKP.REACH*s;
  const C0 = {x: gk.x, y: (gk.y || 0) + GKP.COM*s, z: gk.z};
  // the centre-of-mass target: the hit point drawn back toward the keeper by the hand's reach
  const Dx = hit.x - C0.x, Dy = hit.y - C0.y, Dz = hit.z - C0.z, dist = hypot(Dx, Dy, Dz) || 1e-9;
  const back = Math.min(dist, reach);
  const Cx = hit.x - Dx/dist*back, Cy = Math.max(GKP.LIE*s, hit.y - Dy/dist*back), Cz = hit.z - Dz/dist*back;
  let vx = (Cx - C0.x)/tf, vz = (Cz - C0.z)/tf, vy = (Cy - C0.y)/tf + 0.5*G*tf;
  let clamped = false;
  const latCap = kind === 'stand' ? GKP.STAND_V : GKP.LAT0 + GKP.LAT_K*dive;
  const vh = hypot(vx, vz);
  if (vh > latCap){ vx *= latCap/vh; vz *= latCap/vh; clamped = true; }
  const vyCap = kind === 'high' ? GKP.VY.high0 + GKP.VY.highK*dive : kind === 'mid' ? GKP.VY.mid : kind === 'low' ? GKP.VY.low
    : kind === 'collapse' ? GKP.VY.collapse : GKP.VY.stand;
  if (kind === 'stand'){ vy = 0; }
  else if (vy > vyCap){ vy = vyCap; clamped = true; }
  else if (vy < -3){ vy = -3; clamped = true; }
  const plan = {kind, side, tLoad, v: {x: vx, y: vy, z: vz}, tc: t, hand: {x: 0, y: 0, z: 0}, feasible: true, err: 0,
    C0, tf, lat, scale: s, yaw: gk.yaw || 0, land: 0, hit: {x: hit.x, y: hit.y, z: hit.z}, ground: gk.y || 0};
  // where the centre of mass is at contact, and the hand from there toward the ball
  const Cc = comAt(plan, t, {x: 0, y: 0, z: 0});
  const hx = hit.x - Cc.x, hy = hit.y - Cc.y, hz = hit.z - Cc.z, hd = hypot(hx, hy, hz);
  const k = hd > 1e-9 ? Math.min(hd, reach)/hd : 0;
  plan.hand.x = Cc.x + hx*k; plan.hand.y = Cc.y + hy*k; plan.hand.z = Cc.z + hz*k;
  plan.err = Math.max(0, hd - reach);
  plan.feasible = plan.err <= 0.05 && (!clamped || plan.err <= 0.05);
  plan.land = landTime(plan);
  return plan;
}

// the centre of mass at time t from the start of the plan (no allocation: out is filled)
function comAt(plan, t, out){
  const C0 = plan.C0, s = plan.scale;
  if (plan.kind === 'stand'){
    const tt = Math.min(t, plan.tc);
    out.x = C0.x + plan.v.x*tt; out.y = C0.y; out.z = C0.z + plan.v.z*tt;
    return out;
  }
  const tau = Math.max(0, t - plan.tLoad), tl = landFlight(plan), tt = Math.min(tau, tl);
  out.x = C0.x + plan.v.x*tt; out.z = C0.z + plan.v.z*tt;
  out.y = Math.max(GKP.LIE*s + plan.ground, C0.y + plan.v.y*tt - 0.5*G*tt*tt);
  if (tau > tl){
    // the slide along the ground after landing, slowing to a stop over GKP.SLIDE seconds
    const u = Math.min(tau - tl, GKP.SLIDE), sl = u - 0.5*u*u/GKP.SLIDE;
    out.x += plan.v.x*sl; out.z += plan.v.z*sl;
  }
  if (t < plan.tLoad){
    // the load: a small dip of the centre of mass while the power step is made
    out.y = C0.y - 0.08*s*sstep(0, plan.tLoad, t);
  }
  return out;
}
// flight time (after the load) until the centre of mass is down at lying height
function landFlight(plan){
  if (plan._tl != null) return plan._tl;
  const s = plan.scale, y0 = plan.C0.y, yl = GKP.LIE*s + plan.ground, vy = plan.v.y;
  // y0 + vy t - g t^2/2 = yl, the later root
  const disc = vy*vy + 2*G*(y0 - yl);
  const tl = disc > 0 ? (vy + Math.sqrt(disc))/G : 0.05;
  plan._tl = Math.max(0.05, tl);
  return plan._tl;
}
function landTime(plan){ return plan.kind === 'stand' ? plan.tc : plan.tLoad + landFlight(plan); }

// The keeper's root at time t of a dive (from its start): x, z on the ground under the centre of mass, y the root's
// rise above standing (negative while low), roll the body's roll toward the dive side (radians, 0 standing, pi/2 lying).
export function diveRoot(plan, t, out = {x: 0, y: 0, z: 0, roll: 0}){
  const c = comAt(plan, t, CT);
  out.x = c.x; out.z = c.z; out.y = c.y - plan.C0.y;
  if (plan.kind === 'stand'){ out.roll = 0; return out; }
  const tau = Math.max(0, t - plan.tLoad), tl = landFlight(plan);
  out.roll = plan.side*(Math.PI/2)*sstep(0, Math.max(0.08, tl), tau);
  return out;
}
const CT = {x: 0, y: 0, z: 0};

// A jump (headers, high catches, the wall): plan = {v0} or {h} (height), optional tLoad. Root rise at time t.
export function jumpRoot(plan, t, out = {y: 0}){
  const v0 = plan.v0 != null ? plan.v0 : Math.sqrt(2*G*Math.max(0, plan.h || 0)), tl = plan.tLoad || 0;
  const tau = t - tl, T = 2*v0/G;
  out.y = tau <= 0 || tau >= T ? 0 : v0*tau - 0.5*G*tau*tau;
  out.vy = tau <= 0 || tau >= T ? 0 : v0 - G*tau;
  out.air = tau > 0 && tau < T;
  return out;
}
// how long a jump of take-off speed v0 stays in the air
export const jumpAir = v0 => 2*v0/G;

// A slide (slide tackles, a keeper's smother): plan = {x, z, dx, dz, v0, decel}. Ground position at time t.
export function slideRoot(plan, t, out = {x: 0, z: 0}){
  const dec = plan.decel || 6, v0 = plan.v0 || 0, tStop = v0/dec, tt = clamp(t, 0, tStop);
  const d = v0*tt - 0.5*dec*tt*tt;
  out.x = plan.x + plan.dx*d; out.z = plan.z + plan.dz*d;
  out.v = t < tStop ? v0 - dec*tt : 0;
  return out;
}

// The two hands at time t of a dive (from its start): spheres of radius 0.11 that travel from the ready stance (in
// front of the chest, 0.28 to each side) to the planned contact point (0.09 apart across the ball's path) by the
// contact time, then stay with the body. steer (optional {x, y, z}) moves the contact point (the late re-read, at most
// 0.35 m).
const HA = [{x: 0, y: 0, z: 0, r: 0.11}, {x: 0, y: 0, z: 0, r: 0.11}];
const HC = {x: 0, y: 0, z: 0};
export function handsAt(plan, t, out = null, steer = null){
  const o = out || [{x: 0, y: 0, z: 0, r: 0.11}, {x: 0, y: 0, z: 0, r: 0.11}];
  const s = plan.scale, f = dirOf(plan.yaw), rx = -f.z, rz = f.x, R = GKP.READY;
  const c = comAt(plan, t, HC);
  const cc = comAt(plan, plan.tc, {x: 0, y: 0, z: 0});
  let hx = plan.hand.x, hy = plan.hand.y, hz = plan.hand.z;
  if (steer){ hx += steer.x || 0; hy += steer.y || 0; hz += steer.z || 0; }
  // the contact offset from the centre of mass, and the ready offset
  const ox = hx - cc.x, oy = hy - cc.y, oz = hz - cc.z;
  const k = sstep(0, Math.max(0.05, plan.tc), t);
  const g = GKP.HAND_GAP/2;
  for (let i = 0; i < 2; i++){
    const sd = i === 0 ? -1 : 1;
    const rdx = sd*R.lat*s*rx + R.fwd*s*f.x, rdy = R.up*s, rdz = sd*R.lat*s*rz + R.fwd*s*f.z;
    const cdx = ox + sd*g*rx, cdy = oy, cdz = oz + sd*g*rz;
    o[i].x = c.x + rdx + (cdx - rdx)*k; o[i].y = c.y + rdy + (cdy - rdy)*k; o[i].z = c.z + rdz + (cdz - rdz)*k;
    o[i].r = 0.11;
  }
  return o;
}
export {HA};
