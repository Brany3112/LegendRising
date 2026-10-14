// js/life/football/cagespec.js: Training Mode's cages as numbers. A cage is a fenced pitch for practice, never a
// stadium: the Full cage is a whole 105 x 68 pitch, the Half cage one half of it with its goal, and the One-goal cage a
// small area in front of one goal. Each is a part of the real pitch (makePitch, the same world units and geometry as a
// match) played as a pitch of its own: the lines the ball goes out over are the area's edges, only a real goal of the
// whole pitch is a goal, and a fence as tall as the roof (with a roof) closes it in, so the ball comes back off it.
// Owner: P3-A (Training Mode, Phase 3: sandbox world and cages). Contract: BUILD-PLAN Phase 3 "Contracts (P3-A stubs
// them)", cagespec.js; TRAINING-SPEC 0 (cages Full / Half / One-goal, fenced, the ball rebounds) and 4 (cage pitches in
// the same units and pitchspec geometry as matches, low-poly fencing, rebound physics). INF-3, INF-7 and SIM-1.
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no Math.random. Trigonometry from detmath.js.
//
// Frames. The cage zone's world is the whole pitch's frame: the centre spot at the world origin, X along the length
// (the One-goal and Half cages are at the +X goal), Z across. An area {x0, x1, z0, z1} is in that frame. The spec a
// cage plays on (cagePitch) has its own frame centred on the area (spec.frame.cx, cz), as every PitchSpec does.

import {makePitch, plane, FIFA} from "./pitchspec.js";
import {sin, cos, atan2, PI} from "./detmath.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// the whole pitch a cage is cut from (the cage zone's world: frame at the origin)
export const CAGE_BASE = Object.freeze({L: FIFA.L, Wd: FIFA.Wd, cx: 0, cz: 0});

/* The three kinds, in the whole pitch's frame:
     area     the part of the pitch played on (its edges are its lines)
     fence    how far the fence stands outside the area's lines: behind a goal end past the net (2 m deep) and a
              stride, along the other edges a little run-off (players and the ball live in it; the ball comes back)
     h        the fence's height, and the roof's: a fence lower than the roof lets a lofted ball out through the gap
              (verified with ball.js, traininginfra.md section 4), so they are one height
   The One-goal area holds the whole penalty area and its arc (the arc's far point is 52.5 - 11 - 9.15 = 32.35). */
export const CAGE_KINDS = Object.freeze(['full', 'half', 'onegoal']);
export const CAGES = Object.freeze({
  full: Object.freeze({name: "Full pitch", area: Object.freeze({x0: -FIFA.L/2, x1: FIFA.L/2, z0: -FIFA.Wd/2, z1: FIFA.Wd/2}), fence: Object.freeze({x: 4, z: 3}), h: 14}),
  half: Object.freeze({name: "Half pitch", area: Object.freeze({x0: 0, x1: FIFA.L/2, z0: -FIFA.Wd/2, z1: FIFA.Wd/2}), fence: Object.freeze({x: 4, z: 3}), h: 12}),
  onegoal: Object.freeze({name: "One goal", area: Object.freeze({x0: FIFA.L/2 - 30, x1: FIFA.L/2, z0: -22, z1: 22}), fence: Object.freeze({x: 4, z: 3}), h: 8})
});
// the fence's restitution: a tight wire mesh gives a ball back more softly than an advertising board (0.5)
export const FENCE_E = 0.4;
// how far inside the fence a player's centre stays (his half-width and a little): the movers' run-off ends here
export const FENCE_BODY = 0.35;

export const cageKind = kind => CAGES[kind] ? kind : 'full';

/* ---------- a part of a pitch as a pitch of its own (SIM-1, generalised) ----------
   base = {L, Wd, cx, cz} (a pitch and where its frame sits in its zone's world), area = {x0, x1, z0, z1} in the base
   pitch's own frame, or null for the whole of it. o.roll: the grass; o.runoff {hx, hz}: how far round the area the
   movers may go (default 2 m, never past the base's own run-off); o.boards: makePitch boards for the area.
   An end of the area is a real goal when it lies on one of the base's goal lines and the area is centred across the
   pitch and wide enough for the goal: only then does a goal stand in it (posts, bar, net), otherwise a ball over it
   is simply out. The penalty and goal areas of an end with no goal are left out too. spec.area keeps the area (its
   x0..x1 in the base frame are where rules.js finds the real halfway line, OFF-1), its real ends and the base. */
export function areaPitchOf(base, area, o = {}){
  const B = Object.assign({L: FIFA.L, Wd: FIFA.Wd, cx: 0, cz: 0}, base || {});
  const a = area || {x0: -B.L/2, x1: B.L/2, z0: -B.Wd/2, z1: B.Wd/2};
  const L = a.x1 - a.x0, Wd = a.z1 - a.z0, mx = (a.x0 + a.x1)/2, mz = (a.z0 + a.z1)/2;
  if (!(L > 0) || !(Wd > 0)) throw new Error("areaPitchOf: an area needs a length and a width");
  const spec = makePitch({L, Wd, cx: B.cx + mx, cz: B.cz + mz, roll: o.roll != null ? o.roll : 1.1, boards: o.boards || null});
  const baseRun = {hx: B.L/2 + 5, hz: B.Wd/2 + 4};
  spec.runoff = o.runoff ? {hx: o.runoff.hx, hz: o.runoff.hz}
    : {hx: Math.min(L/2 + 2, baseRun.hx - Math.abs(mx)), hz: Math.min(Wd/2 + 2, baseRun.hz - Math.abs(mz))};
  const goalFits = Math.abs(mz) < 1e-6 && Wd/2 >= FIFA.goalW/2 + FIFA.postR + 1;
  const real = end => goalFits && Math.abs(mx + end*L/2 - end*B.L/2) < 1e-6;
  const keep = q => real(q.end);
  spec.goals = spec.goals.filter(keep);
  spec.colliders.posts = spec.colliders.posts.filter(keep);
  spec.colliders.bars = spec.colliders.bars.filter(keep);
  spec.colliders.nets = spec.colliders.nets.filter(keep);
  spec.areas.box = spec.areas.box.filter(keep);
  spec.areas.six = spec.areas.six.filter(keep);
  spec.spots.penalty = spec.spots.penalty.filter(keep);
  spec.spareCones = [];
  spec.area = {x0: a.x0, x1: a.x1, z0: a.z0, z1: a.z1, ends: [-1, 1].filter(real), base: {L: B.L, Wd: B.Wd}};
  return spec;
}
// the laws.goals of an area spec: 2 both ends are goals, 1 only the +x end, 0 none (rules.js goalCounts)
export function goalsLawOf(spec){
  const e = spec.area ? spec.area.ends : [-1, 1];
  return e.length === 2 ? 2 : e.length === 1 && e[0] === 1 ? 1 : 0;
}

/* ---------- the fence and the roof as ball colliders ----------
   Four vertical planes at the fence (normals pointing in), as tall as the roof, and one horizontal plane for the roof
   (normal pointing down), in the spec's (area's) own frame, as spec.colliders.boards: ball.js meets them as boards
   (createBallWorld, boardsHitQ). part 'fence' and 'roof'; restitution FENCE_E. */
export function fencePlanes(hx, hz, h, e = FENCE_E){
  const out = [];
  const sides = [
    {side: 'z+', n: [0, 0, -1], q: [[-hx, 0, hz], [hx, 0, hz], [hx, h, hz], [-hx, h, hz]]},
    {side: 'z-', n: [0, 0, 1], q: [[-hx, 0, -hz], [hx, 0, -hz], [hx, h, -hz], [-hx, h, -hz]]},
    {side: 'x+', n: [-1, 0, 0], q: [[hx, 0, -hz], [hx, 0, hz], [hx, h, hz], [hx, h, -hz]]},
    {side: 'x-', n: [1, 0, 0], q: [[-hx, 0, -hz], [-hx, 0, hz], [-hx, h, hz], [-hx, h, -hz]]}
  ];
  for (const s of sides) out.push(plane(s.n, s.q[0], s.q, {e, side: s.side, part: 'fence'}));
  // the roof has no top edge to round off: no quad is kept (ball.js adds an edge capsule only for a quad)
  const roof = plane([0, -1, 0], [0, h, 0], [[-hx, h, -hz], [hx, h, -hz], [hx, h, hz], [-hx, h, hz]], {e, part: 'roof'});
  delete roof.quad;
  out.push(roof);
  return out;
}

// the fence of a kind, in its spec's (area's) frame: half-sizes to the fence's inner face, and its height
export function cageFence(kind){
  const K = CAGES[cageKind(kind)], a = K.area;
  return {hx: (a.x1 - a.x0)/2 + K.fence.x, hz: (a.z1 - a.z0)/2 + K.fence.z, h: K.h};
}

/* ---------- the spec a cage plays on ----------
   cagePitch(kind, {roll}) -> a PitchSpec of the area (areaPitchOf over CAGE_BASE), its run-off ending FENCE_BODY inside
   the fence, colliders.boards the fence and roof planes, spec.cage {kind, fence: {hx, hz, h}}. */
export function cagePitch(kind, o = {}){
  const k = cageKind(kind), F = cageFence(k);
  const spec = areaPitchOf(CAGE_BASE, CAGES[k].area, {roll: o.roll, runoff: {hx: F.hx - FENCE_BODY, hz: F.hz - FENCE_BODY}});
  spec.colliders.boards = fencePlanes(F.hx, F.hz, F.h);
  spec.cage = {kind: k, fence: F};
  return spec;
}

/* ---------- clipping the whole pitch's markings into an area (INF-7) ---------- */
// a segment clipped to the box [x0, x1] x [z0, z1] (Liang-Barsky), or null
function clipSeg(l, b){
  let t0 = 0, t1 = 1;
  const dx = l.x1 - l.x0, dz = l.z1 - l.z0;
  const edge = (p, q) => {
    if (p === 0) return q >= 0;
    const r = q/p;
    if (p < 0){ if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  if (!edge(-dx, l.x0 - b.x0) || !edge(dx, b.x1 - l.x0) || !edge(-dz, l.z0 - b.z0) || !edge(dz, b.z1 - l.z0)) return null;
  if (t1 - t0 < 1e-9) return null;
  return {type: 'seg', x0: l.x0 + t0*dx, z0: l.z0 + t0*dz, x1: l.x0 + t1*dx, z1: l.z0 + t1*dz, tag: l.tag};
}
const inBoxP = (x, z, b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
// an arc clipped to the box: the runs of its angle range whose points lie inside, each end found by bisection
function clipArc(l, b){
  const pt = a => ({x: l.cx + l.r*cos(a), z: l.cz + l.r*sin(a)});
  const ins = a => { const p = pt(a); return inBoxP(p.x, p.z, b); };
  const n = 128, out = [], span = l.a1 - l.a0;
  const edge = (lo, hi, inLo) => { for (let i = 0; i < 40; i++){ const m = (lo + hi)/2; if (ins(m) === inLo) lo = m; else hi = m; } return (lo + hi)/2; };
  let prevA = l.a0, prevIn = ins(l.a0), start = prevIn ? l.a0 : null;
  for (let i = 1; i <= n; i++){
    const a = l.a0 + span*i/n, cur = ins(a);
    if (cur !== prevIn){
      const e = edge(prevA, a, prevIn);
      if (cur) start = e;
      else { if (start != null && e - start > 1e-6) out.push({type: 'arc', cx: l.cx, cz: l.cz, r: l.r, a0: start, a1: e, tag: l.tag}); start = null; }
    }
    prevA = a; prevIn = cur;
  }
  if (start != null && l.a1 - start > 1e-6) out.push({type: 'arc', cx: l.cx, cz: l.cz, r: l.r, a0: start, a1: l.a1, tag: l.tag});
  return out;
}

/* cageDraw(kind) -> the draw spec pitchmesh.js buildPitchMesh(spec, {draw}) builds from, in the cage spec's own frame:
     lines   the whole pitch's markings translated into the area's frame and clipped to it (a line on the area's edge,
             the halfway line of the Half cage, is kept; arcs are cut where they leave it)
     spots   {centre (or null), penalty: [...]}: the whole pitch's spots inside the area
     flags   [{x, z, sx, sz}]: corner flags only at the whole pitch's real corners inside the area
     grass   {hx, hz}: the grass to the fence; base {hx, hz, L, ox, oz}: where the whole pitch's mowing bands and wear
             lie relative to the area (ox, oz: the area's centre in the whole pitch's frame)
     fence   {hx, hz, h}: the fence (and roof) to draw
   No goal is listed: the cage spec's own goals (only the real ones) are the ones drawn. */
export function cageDraw(kind){
  const k = cageKind(kind), K = CAGES[k], a = K.area, F = cageFence(k);
  const full = makePitch({L: CAGE_BASE.L, Wd: CAGE_BASE.Wd});
  const mx = (a.x0 + a.x1)/2, mz = (a.z0 + a.z1)/2, tol = FIFA.line/2 + 1e-6;
  const box = {x0: a.x0 - tol, x1: a.x1 + tol, z0: a.z0 - tol, z1: a.z1 + tol};
  const lines = [];
  for (const l of full.lines){
    const parts = l.type === 'arc' ? clipArc(l, box) : [clipSeg(l, box)].filter(Boolean);
    for (const p of parts){
      if (p.type === 'arc'){ p.cx -= mx; p.cz -= mz; }
      else { p.x0 -= mx; p.x1 -= mx; p.z0 -= mz; p.z1 -= mz; }
      lines.push(p);
    }
  }
  const c = full.spots.centre;
  const centre = inBoxP(c.x, c.z, box) ? {x: c.x - mx, z: c.z - mz, r: c.r} : null;
  const penalty = full.spots.penalty.filter(p => inBoxP(p.x, p.z, box)).map(p => ({x: p.x - mx, z: p.z - mz, r: p.r, end: p.end}));
  const flags = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]){
    const x = sx*full.hx, z = sz*full.hz;
    if (inBoxP(x, z, box)) flags.push({x: x - mx, z: z - mz, sx, sz});
  }
  return {kind: k, lines, spots: {centre, penalty}, flags,
    grass: {hx: F.hx + 0.6, hz: F.hz + 0.6},
    base: {hx: full.hx, hz: full.hz, L: full.L, ox: mx, oz: mz},
    fence: {hx: F.hx, hz: F.hz, h: F.h}};
}

/* ---------- the cones' places (BUILD-PLAN P3-B work item 3) ----------
   One cone per Training category at fixed places in the run-off along the +Z touchline (between the line and the
   fence), 4 m apart and centred on the area, each facing the pitch (face: the yaw a person standing at it looking at
   the pitch has; yaw 0 faces -Z). World coordinates of the cage zone. The same numbers every time. */
export const CAGE_CATEGORIES = Object.freeze(['setpieces', 'attacking', 'defending', 'receiving', 'scenarios', 'fullmatch', 'freeplay']);
export function cageAnchors(kind){
  const k = cageKind(kind), a = CAGES[k].area, F = cageFence(k);
  const mx = (a.x0 + a.x1)/2, zLine = a.z1, z = zLine + clamp((F.hz - (a.z1 - a.z0)/2)/2, 1, 2.5);
  const n = CAGE_CATEGORIES.length, gap = 4, out = {};
  CAGE_CATEGORIES.forEach((cat, i) => { out[cat] = [{x: mx + (i - (n - 1)/2)*gap, z, face: 0}]; });
  return out;
}
// where you come into a cage: on the grass just inside the touchline by the cones, facing the pitch (yaw 0 faces -Z)
export function cageSpawn(kind){
  const k = cageKind(kind), a = CAGES[k].area;
  return {x: (a.x0 + a.x1)/2, y: 0, z: a.z1 - 2, yaw: 0};
}
// the world box a cage's fence encloses (the cage zone's frame), for W.bounds and the camera
export function cageWorldBox(kind){
  const k = cageKind(kind), a = CAGES[k].area, F = cageFence(k), mx = (a.x0 + a.x1)/2, mz = (a.z0 + a.z1)/2;
  return {x0: mx - F.hx, x1: mx + F.hx, z0: mz - F.hz, z1: mz + F.hz, h: F.h};
}
// is the world point (x, z) inside a kind's fence (by a margin, metres, inward positive)
export function inCage(kind, x, z, margin = 0){
  const b = cageWorldBox(kind);
  return x >= b.x0 + margin && x <= b.x1 - margin && z >= b.z0 + margin && z <= b.z1 - margin;
}
// the yaw that faces the world direction (dx, dz) (yaw 0 faces -Z), for whatever is placed to face the pitch
export const faceTo = (dx, dz) => atan2(-dx, -dz);
