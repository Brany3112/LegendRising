// qa/unit/cagespec.mjs: js/life/football/cagespec.js under plain node: the cages' sizes, a fence at least as tall as
// the roof, inward-facing fence and roof normals, the goal ends of each kind, the clipped markings and the flags of the
// draw spec, the cone anchors, and areaPitchOf generalised (SIM-1).
// Owner: P3-A (Training Mode, Phase 3). Contract: BUILD-PLAN Phase 3 P3-A acceptance "qa/unit/cagespec.mjs".
//
//   node qa/unit/cagespec.mjs   exits 1 on any failed check; writes qa/out/unit-cagespec.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {CAGES, CAGE_KINDS, CAGE_CATEGORIES, FENCE_BODY, cagePitch, cageDraw, cageFence, cageAnchors, cageSpawn,
  cageWorldBox, areaPitchOf, goalsLawOf, inCage} from "../../js/life/football/cagespec.js";
import {FIFA, PITCHES} from "../../js/life/football/pitchspec.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const res = {name: "unit-cagespec", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// (U28 part F: and a cage for each real pitch type)
check(CAGE_KINDS.join() === "full,half,onegoal,futsal,five,seven,nine,compact,wide,large", "the kinds: Full, Half and One goal, and futsal, 5, 7 and 9 a side, Compact, Wide and Large", CAGE_KINDS);

for (const k of CAGE_KINDS){
  const s = cagePitch(k), F = cageFence(k), a = CAGES[k].area;
  // sizes
  const want = {full: [105, 68], half: [52.5, 68], onegoal: [30, 44], futsal: [40, 20], five: [37, 27], seven: [55, 37], nine: [73, 46], compact: [100, 64], wide: [105, 72], large: [110, 75]}[k];
  check(near(s.L, want[0]) && near(s.Wd, want[1]), `${k}: the area is ${want[0]} x ${want[1]}`, [s.L, s.Wd]);
  check(near(s.frame.cx, (a.x0 + a.x1)/2) && near(s.frame.cz, (a.z0 + a.z1)/2), `${k}: the spec's frame is centred on the area, in the whole pitch's frame`, s.frame);
  // the fence and the roof
  const fence = s.colliders.boards.filter(b => b.part === 'fence'), roof = s.colliders.boards.filter(b => b.part === 'roof');
  check(fence.length === 4 && roof.length === 1, `${k}: four fence planes and a roof`, {fence: fence.length, roof: roof.length});
  const fh = Math.min(...fence.map(b => b.bounds.y1)), rh = roof[0].bounds.y0;
  check(fh >= rh - 1e-9 && near(rh, F.h), `${k}: the fence is at least as tall as the roof (${F.h} m)`, {fence: fh, roof: rh});
  // inward normals: the area's centre (local 0, 1, 0) lies on the positive side of every plane
  const inward = s.colliders.boards.every(b => b.n[0]*0 + b.n[1]*1 + b.n[2]*0 - b.d > 0);
  check(inward, `${k}: every fence and roof normal faces into the cage`);
  check(roof[0].n[1] < -0.99 && !roof[0].quad, `${k}: the roof faces down and has no edge capsule`);
  check(fence.every(b => Math.abs(b.n[1]) < 1e-9), `${k}: the fence planes are vertical`);
  // the fence is outside the lines and the nets
  check(F.hx >= s.hx + FIFA.netDepth + 1 && F.hz >= s.hz + 2, `${k}: the fence clears the nets and the touchlines`, {F, hx: s.hx, hz: s.hz});
  check(near(s.runoff.hx, F.hx - FENCE_BODY) && near(s.runoff.hz, F.hz - FENCE_BODY), `${k}: the run-off ends a body's width inside the fence`, s.runoff);
  // goal ends
  const ends = s.goals.map(g => g.end).sort();
  // ((U28 part F) a pitch type's cage is the whole of its pitch, as the Full one is)
  const whole = k === 'full' || !!CAGES[k].type, BL = CAGES[k].base ? CAGES[k].base.L : FIFA.L, BW = CAGES[k].base ? CAGES[k].base.Wd : FIFA.Wd;
  const wantEnds = whole ? [-1, 1] : [1];
  check(ends.join() === wantEnds.join() && s.area.ends.join() === wantEnds.join(), `${k}: goals at ${wantEnds.join(" and ")}`, ends);
  check(s.colliders.nets.length === wantEnds.length && s.colliders.posts.length === 2*wantEnds.length && s.colliders.bars.length === wantEnds.length,
    `${k}: posts, bars and nets only at the real goals`);
  check(goalsLawOf(s) === (whole ? 2 : 1), `${k}: laws.goals ${whole ? 2 : 1}`, goalsLawOf(s));
  // the real goal is on the whole pitch's goal line, the mouth centred across
  const g = s.goals.find(x => x.end === 1);
  check(near(s.frame.cx + g.lineX, BL/2) && near(s.frame.cz, 0), `${k}: the +x goal stands on the whole pitch's goal line`, s.frame.cx + g.lineX);
  check(s.areas.box.every(b => b.end === 1 || whole) && s.spots.penalty.length === wantEnds.length, `${k}: penalty areas and spots only at real goal ends`);
  // the draw spec
  const D = cageDraw(k);
  const inside = l => l.type === 'seg' ? [[l.x0, l.z0], [l.x1, l.z1]] : [[l.cx + l.r*Math.cos(l.a0), l.cz + l.r*Math.sin(l.a0)], [l.cx + l.r*Math.cos(l.a1), l.cz + l.r*Math.sin(l.a1)]];
  const tol = FIFA.line/2 + 1e-3;
  const allIn = D.lines.every(l => inside(l).every(([x, z]) => Math.abs(x) <= s.hx + tol && Math.abs(z) <= s.hz + tol));
  check(allIn && D.lines.length > 0, `${k}: every marking drawn is clipped to the area`, D.lines.length);
  const flagsWant = whole ? 4 : {half: 2, onegoal: 0}[k];
  check(D.flags.length === flagsWant && D.flags.every(f => near(Math.abs(f.x + D.base.ox), BL/2) && near(Math.abs(f.z + D.base.oz), BW/2)),
    `${k}: corner flags only at the real corners (${flagsWant})`, D.flags);
  check(near(D.fence.h, F.h) && D.grass.hx >= F.hx && D.grass.hz >= F.hz, `${k}: the grass reaches the fence`);
  const fullTouch = D.lines.filter(l => l.tag === 'touch');
  if (k === 'half'){
    const hw = D.lines.filter(l => l.tag === 'halfway'), circ = D.lines.filter(l => l.tag === 'circle');
    check(hw.length === 1 && near(hw[0].x0 + D.base.ox, 0), "half: the halfway line on its edge is kept", hw);
    const span = circ.reduce((t, c) => t + (c.a1 - c.a0), 0);
    check(circ.length >= 1 && near(span, Math.PI, 0.03), "half: half of the centre circle is drawn", span);
    check(D.spots.centre && D.spots.penalty.length === 1, "half: the centre spot and one penalty spot");
    check(fullTouch.every(l => near(Math.abs(l.x1 - l.x0), 52.5 + FIFA.line/2, 0.01)), "half: the touchlines are cut at the halfway line (meeting its strip)", fullTouch.map(l => l.x1 - l.x0));
  }
  if (k === 'onegoal'){
    check(!D.spots.centre && D.spots.penalty.length === 1, "one goal: no centre spot, one penalty spot");
    check(!D.lines.some(l => l.tag === 'halfway' || l.tag === 'circle' || l.tag === 'corner'), "one goal: no halfway line, circle or corner arcs");
    check(D.lines.filter(l => l.tag === 'box').length === 3 && D.lines.filter(l => l.tag === 'arc').length === 1, "one goal: the whole penalty area and its arc");
    check(fullTouch.length === 0, "one goal: no touchline inside the area");
  }
  // anchors and spawn
  const A = cageAnchors(k), B = cageWorldBox(k);
  check(CAGE_CATEGORIES.every(c => Array.isArray(A[c]) && A[c].length === 1), `${k}: one cone anchor per category`, Object.keys(A));
  const pts = CAGE_CATEGORIES.map(c => A[c][0]);
  check(pts.every(p => inCage(k, p.x, p.z, 0.5) && p.z > a.z1 + 0.5), `${k}: the cones stand inside the fence, off the field`, pts);
  check(JSON.stringify(cageAnchors(k)) === JSON.stringify(A), `${k}: the anchors are the same every time`);
  const sp = cageSpawn(k);
  check(inCage(k, sp.x, sp.z, 1) && Math.abs(sp.x - s.frame.cx) < 1e-9, `${k}: you come in inside the cage`, sp);
  check(near(B.x1 - B.x0, 2*F.hx) && near(B.z1 - B.z0, 2*F.hz), `${k}: the world box is the fence`, B);
}

/* ---------- areaPitchOf: the training ground's areas as trainspec.areaPitch made them ---------- */
{
  const GP = PITCHES.ground;
  const whole = areaPitchOf(GP, null);
  check(whole.goals.length === 2 && near(whole.frame.cz, GP.cz), "areaPitchOf(ground, null): the whole training pitch, both goals");
  const halfArea = {x0: 0, x1: GP.L/2, z0: -GP.Wd/2, z1: GP.Wd/2};
  const h = areaPitchOf(GP, halfArea);
  check(h.goals.length === 1 && h.goals[0].end === 1 && near(h.frame.cx, GP.cx + GP.L/4) && near(h.frame.cz, GP.cz), "a half of the training ground: one goal, frame in its world", h.frame);
  const side = areaPitchOf(GP, {x0: 12, x1: 32, z0: -22.5, z1: -7.5});
  check(side.goals.length === 0 && side.area.ends.length === 0, "an area off the goal lines has no goal");
  check(side.runoff.hx <= 10 + 2 + 1e-9, "the default run-off is 2 m round the area", side.runoff);
  let threw = false; try { areaPitchOf(GP, {x0: 1, x1: 1, z0: 0, z1: 3}); } catch(e){ threw = true; }
  check(threw, "an empty area is an error");
}

// the Full cage draws every marking of a whole pitch (computed against cageDraw's own source pitch)
{
  const D = cageDraw('full');
  const tags = {};
  for (const l of D.lines) tags[l.tag] = (tags[l.tag] || 0) + 1;
  check(tags.touch === 2 && tags.goal === 2 && tags.halfway === 1 && tags.circle === 1 && tags.box === 6 && tags.six === 6 && tags.arc === 2 && tags.corner === 4,
    "full: two touchlines, two goal lines, the halfway line, the circle, both areas, both arcs, four corner arcs", tags);
}

fs.mkdirSync(path.join(ROOT, "qa", "out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa", "out", "unit-cagespec.json"), JSON.stringify(res, null, 1));
console.log(`${res.checks.filter(c => c.pass).length}/${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
