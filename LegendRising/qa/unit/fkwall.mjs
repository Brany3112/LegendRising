// qa/unit/fkwall.mjs: a free kick's wall as Training configures it (brain.js wallSpots): every size 0 to 6, by distance,
// by offset, both alignments, from balls all over the half and the full pitch: equal spacing, the men (capsules of
// AGENT.SEP_R) at least 2r apart, at least 0.5 m from the ball, inside the lines; size 0 (or the wall off) is no wall,
// and a resize puts the men back on the same line.
// Owner: P7-A (Training Mode Phase 7). Contract: BUILD-PLAN P7-A acceptance "qa/unit/fkwall.mjs".
//
//   node qa/unit/fkwall.mjs          exits 1 on any failed check
import {wallSpots, WALL_SPEC} from "../../js/life/football/brain.js";
import {AGENT} from "../../js/life/football/agent.js";
import {RULES} from "../../js/life/football/rules.js";
import {cagePitch} from "../../js/life/football/cagespec.js";

const res = {name:"unit-fkwall", checks:[], ok:true};
const check = (pass, name, value) => {
  res.checks.push({name, pass:!!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value).slice(0, 400)}`);
};
const r = AGENT.SEP_R, EPS = 1e-9;
const hyp = (x, z) => Math.sqrt(x*x + z*z);

// the balls: a grid of distances (12 to 40 m) and angles (-70 to 70 degrees) from the middle of the goal line, plus
// a few right on the touchlines, on both pitches
const balls = [];
for (const kind of ["half", "full"]){
  const spec = cagePitch(kind);
  for (let d = 12; d <= 40; d += 4) for (let a = -70; a <= 70; a += 10){
    const t = a*Math.PI/180, x = spec.hx - d*Math.cos(t), z = Math.max(-spec.hz + 0.5, Math.min(spec.hz - 0.5, d*Math.sin(t)));
    balls.push({kind, spec, p:{x, z}});
  }
  balls.push({kind, spec, p:{x:spec.hx - 6, z:spec.hz - 0.3}}, {kind, spec, p:{x:spec.hx - 6, z:-spec.hz + 0.3}}, {kind, spec, p:{x:spec.hx - 1, z:0}});
}
const dists = [5, 7, 9.15, 10, 12], offs = [-3, -1.5, 0, 1.5, 3], aligns = ["post", "centre"];
let n = 0;
const bad = {count:[], spacing:[], apart:[], ball:[], bounds:[], line:[]};
for (const B of balls){
  const bounds = {hx:B.spec.hx, hz:B.spec.hz};
  for (let size = 0; size <= 6; size++) for (const dist of dists) for (const off of offs) for (const align of aligns){
    const W = wallSpots(B.p, B.spec.hx, {n:size, dist, off, align}, bounds);
    n++;
    const S = W.spots, tag = {kind:B.kind, ball:[+B.p.x.toFixed(2), +B.p.z.toFixed(2)], size, dist, off, align};
    if (S.length !== size) bad.count.push(tag);
    for (let i = 1; i < S.length; i++){
      const g = hyp(S[i].x - S[i - 1].x, S[i].z - S[i - 1].z);
      if (Math.abs(g - RULES.WALL_GAP) > 1e-6) bad.spacing.push(Object.assign({g}, tag));
    }
    for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) if (hyp(S[i].x - S[j].x, S[i].z - S[j].z) < 2*r - EPS) bad.apart.push(tag);
    for (const q of S){
      if (hyp(q.x - B.p.x, q.z - B.p.z) < WALL_SPEC.BALL + r - EPS) bad.ball.push(tag);
      if (Math.abs(q.x) > B.spec.hx - r + EPS || Math.abs(q.z) > B.spec.hz - r + EPS) bad.bounds.push(tag);
    }
    // all on one line (each man's step from the first is a multiple of the across direction)
    for (const q of S){ const ex = q.x - S[0].x, ez = q.z - S[0].z; if (Math.abs(ex*W.pz - ez*W.px) > 1e-6) bad.line.push(tag); }
  }
}
check(!bad.count.length, `every size 0 to 6 gives that many men (${n} walls: ${balls.length} balls x 7 sizes x ${dists.length} distances x ${offs.length} offsets x 2 alignments)`, bad.count.slice(0, 3));
check(!bad.spacing.length, `equal spacing: neighbours exactly ${RULES.WALL_GAP} m apart`, bad.spacing.slice(0, 3));
check(!bad.apart.length, `no two men closer than 2r (${2*r} m): the capsules never overlap`, bad.apart.slice(0, 3));
check(!bad.ball.length, `every man at least 0.5 m plus his shoulder (${WALL_SPEC.BALL + r} m) from the ball`, bad.ball.slice(0, 3));
check(!bad.bounds.length, "every man inside the lines (his shoulder too)", bad.bounds.slice(0, 3));
check(!bad.line.length, "the men stand on one straight line", bad.line.slice(0, 3));

// the distance asked for: in open play (no line nearby) the nearest man is exactly that far from the ball with the
// near-post alignment and no offset; an offset moves the wall across, never nearer
{
  const spec = cagePitch("half"), p = {x:spec.hx - 24, z:4};
  const errs = [];
  for (const dist of [5, 6.5, 9.15, 11, 12]){
    const W = wallSpots(p, spec.hx, {n:4, dist, off:0, align:"post"}, spec);
    const d0 = hyp(W.spots[0].x - p.x, W.spots[0].z - p.z);
    if (Math.abs(d0 - dist) > 1e-6) errs.push({dist, d0});
    for (const off of [-3, 3]){
      const V = wallSpots(p, spec.hx, {n:4, dist, off, align:"post"}, spec);
      const m = Math.min(...V.spots.map(q => hyp(q.x - p.x, q.z - p.z)));
      if (m < dist - 1e-6) errs.push({dist, off, m});
    }
  }
  check(!errs.length, "the first man stands at the distance asked for; an offset never brings the wall nearer the ball", errs.slice(0, 3));
  // the near-post wall's first man is on the line from the ball to just outside the near post
  const W = wallSpots(p, spec.hx, {n:3, dist:9.15, off:0, align:"post"}, spec), post = {x:spec.hx, z:3.66 + RULES.WALL_POST};
  const ux = post.x - p.x, uz = post.z - p.z, cross = (W.spots[0].x - p.x)*uz - (W.spots[0].z - p.z)*ux;
  check(Math.abs(cross) < 1e-6, "near post: the first man on the line from the ball to just outside the near post", +cross.toFixed(9));
  // the centred wall is square across the line to the middle of the goal, its middle on that line
  const C = wallSpots(p, spec.hx, {n:4, dist:9.15, off:0, align:"centre"}, spec);
  const mx = (C.spots[1].x + C.spots[2].x)/2, mz = (C.spots[1].z + C.spots[2].z)/2, vx = spec.hx - p.x, vz = -p.z;
  check(Math.abs((mx - p.x)*vz - (mz - p.z)*vx) < 1e-6, "centre: the wall's middle on the line from the ball to the middle of the goal", null);
  // the offset moves it across, toward the goal's middle for +
  const O = wallSpots(p, spec.hx, {n:1, dist:9.15, off:2, align:"post"}, spec);
  check(Math.abs(O.spots[0].z) < Math.abs(W.spots[0].z), "a + offset moves the wall toward the goal's middle", {plain:W.spots[0].z, off:O.spots[0].z});
}

// size 0 and the wall off are no wall; a resize keeps the line (the first n men of a bigger wall are the smaller one)
{
  const spec = cagePitch("half"), p = {x:spec.hx - 22, z:-5};
  check(wallSpots(p, spec.hx, {n:0, dist:9.15}, spec).spots.length === 0, "size 0: no wall", null);
  check(wallSpots(p, spec.hx, {n:5, on:false, dist:9.15}, spec).spots.length === 0, "the wall off: no wall (its size kept for when it's back)", null);
  let same = true;
  const six = wallSpots(p, spec.hx, {n:6, dist:9.15, align:"post"}, spec).spots;
  for (let k = 1; k <= 6; k++){ const s = wallSpots(p, spec.hx, {n:k, dist:9.15, align:"post"}, spec).spots; s.forEach((q, i) => { if (hyp(q.x - six[i].x, q.z - six[i].z) > 1e-9) same = false; }); }
  check(same, "resizing repositions it sensibly: near post, a smaller wall is the bigger one's first men", null);
  // out of range values are clamped, not trusted
  const W = wallSpots(p, spec.hx, {n:9, dist:0.2, off:50}, spec);
  check(W.spots.length === 6 && W.dist >= WALL_SPEC.DMIN, "out-of-range sizes and distances are clamped (6 men at most, 3 m at least)", {n:W.spots.length, dist:W.dist});
}

console.log(`unit-fkwall: ${res.checks.filter(c => c.pass).length} of ${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
