// qa/unit/pitchspec.mjs: js/life/football/pitchspec.js under plain node.
// Owner: WP-0D, contracts DESIGN 1.1 and 1.4.9; acceptance 2.2 WP-0D (pitch geometry, training frame).
//
//   node qa/unit/pitchspec.mjs  exits 1 on any failed check; writes qa/out/unit-pitchspec.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {FIFA, PITCHES, BOARDS, makePitch, makeFrame, pitchOf, toLocal, toTeam, anchorOf, inBox, inSix, side, half, onField,
  dirOf, yawOf, wrapA} from "../../js/life/football/pitchspec.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const res = {name: "unit-pitchspec", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const r3 = v => Math.round(v*1000)/1000;

const P = makePitch();
const hl = FIFA.line/2;
const segs = tag => P.lines.filter(l => l.type === 'seg' && l.tag === tag);
const arcs = tag => P.lines.filter(l => l.type === 'arc' && l.tag === tag);

// goal line: outer edge at 52.50 (its strip is 52.38..52.50)
{
  const g = P.goals.find(g => g.end === 1), gm = P.goals.find(g => g.end === -1);
  const gl = segs('goal'), glx = gl.map(s => Math.abs(s.x0) + hl);
  check(near(g.lineX, 52.5) && near(gm.lineX, -52.5), "goal line outer edge at x = +-52.50", [g.lineX, gm.lineX]);
  check(gl.length === 2 && glx.every(x => near(x, 52.5)) && gl.every(s => s.x0 === s.x1), "goal line markings: strips 52.38 to 52.50", gl.map(s => s.x0));
  const posts = P.colliders.posts;
  const ok = posts.length === 4 && posts.every(p => near(Math.abs(p.x), 52.44) && near(Math.abs(p.z), 3.72) && p.r === 0.06 && p.y0 === 0 && near(p.y1, 2.5));
  check(ok, "post centres at x = +-52.44, z = +-3.72, radius 0.06, y 0 to 2.50", posts.map(p => [r3(p.x), r3(p.z)]));
  check(P.goals.every(g => g.post.every(p => near(Math.abs(p.x), 52.44) && near(Math.abs(p.z), 3.72))), "goal records carry the same post centres");
  check(P.goals.every(g => near(g.mouthHalf, 3.66) && near(g.barY, 2.5)), "goal mouth half-width 3.66 between the inner faces, bar centre 2.50 (underside 2.44)");
  const bars = P.colliders.bars;
  check(bars.length === 2 && bars.every(b => near(Math.abs(b.x), 52.44) && near(b.z0, -3.72) && near(b.z1, 3.72) && near(b.y - b.r, 2.44)), "crossbar from z -3.72 to 3.72, underside 2.44");
  check(near(P.goalX, 52.61) && near(P.touchZ, 34.11), "goal and out crossings at x = +-52.61, z = +-34.11", [P.goalX, P.touchZ]);
}

// penalty area: front 36.0, sides +-20.16; goal area: front 47.0, sides +-9.16; spot 41.5; arc half-angle 53.05
{
  const bx = P.areas.box.find(b => b.end === 1), bxm = P.areas.box.find(b => b.end === -1);
  check(near(bx.front, 36.0) && near(bxm.front, -36.0) && near(bx.z1, 20.16) && near(bx.z0, -20.16), "penalty area front at x = +-36.0, sides at z = +-20.16", [bx.front, bxm.front, bx.z1]);
  const bl = segs('box');
  const fronts = bl.filter(s => s.x0 === s.x1), sides = bl.filter(s => s.z0 === s.z1);
  check(fronts.length === 2 && fronts.every(s => near(Math.abs(s.x0) - hl, 36.0) && near(s.z1, 20.16)), "penalty area front line strip 36.0 to 36.12 (inside the area)", fronts.map(s => s.x0));
  check(sides.length === 4 && sides.every(s => near(Math.abs(s.z0) + hl, 20.16) && near(Math.min(Math.abs(s.x0), Math.abs(s.x1)), 36.0)), "penalty area side line strips 20.04 to 20.16");
  const sx = P.areas.six.find(b => b.end === 1);
  check(near(sx.front, 47.0) && near(sx.z1, 9.16), "goal area front at x = +-47.0, sides at z = +-9.16", [sx.front, sx.z1]);
  const pens = P.spots.penalty;
  check(pens.length === 2 && near(pens.find(p => p.end === 1).x, 41.5) && near(pens.find(p => p.end === -1).x, -41.5) && pens.every(p => p.z === 0 && near(p.r, 0.11)), "penalty spots at x = +-41.5, radius 0.11", pens.map(p => p.x));
  check(near(P.spots.centre.r, 0.15) && P.spots.centre.x === 0, "centre spot radius 0.15");
  const deg = P.arcHalf*180/Math.PI;
  check(Math.abs(deg - 53.05) <= 0.01, "penalty arc half-angle 53.05 degrees", +deg.toFixed(4));
  const pa = arcs('arc');
  check(pa.length === 2 && pa.every(a => near(a.a1 - a.a0, 2*P.arcHalf) && near(a.r + hl, 9.15)), "penalty arc lines: radius 9.15 to the outer edge, 2 x 53.05 degrees");
  // the arc's ends meet the penalty area's front line and the whole arc is outside the area
  for (const a of pa){
    const end = a.cx > 0 ? 1 : -1;
    let inside = 0;
    for (let i = 0; i <= 50; i++){
      const t = a.a0 + (a.a1 - a.a0)*i/50, x = a.cx + a.r*Math.cos(t);
      if (end*x > 36.0 + FIFA.line + 1e-9) inside++;
    }
    const xe = a.cx + (a.r + hl)*Math.cos(a.a0);
    check(inside === 0 && near(Math.abs(xe), 36.0, 1e-9), `penalty arc at end ${end} stays outside the area and ends on its line`, r3(xe));
  }
  const cc = arcs('circle')[0];
  check(cc && near(cc.r + hl, 9.15) && cc.cx === 0 && near(cc.a1 - cc.a0, 2*Math.PI), "centre circle radius 9.15 to the outer edge");
  const corners = arcs('corner');
  let cornersOk = corners.length === 4;
  for (const c of corners){
    const mid = (c.a0 + c.a1)/2, mx = c.cx + c.r*Math.cos(mid), mz = c.cz + c.r*Math.sin(mid);
    cornersOk = cornersOk && near(c.r + hl, 1.0) && Math.abs(mx) < P.hx && Math.abs(mz) < P.hz && near(c.a1 - c.a0, Math.PI/2);
  }
  check(cornersOk, "corner arcs radius 1.0 to the outer edge, each a quarter circle into the field");
}

// every marking lies inside the field of play
{
  // the corners of every strip (a segment's strip reaches hl either side of its centre line, its ends are flush; an
  // arc's strip reaches hl either side radially) must lie within |x| <= hx, |z| <= hz
  let worst = 0;
  const edge = (x, z) => { worst = Math.max(worst, Math.abs(x) - P.hx, Math.abs(z) - P.hz); };
  for (const l of P.lines){
    if (l.type === 'seg'){
      const L = Math.hypot(l.x1 - l.x0, l.z1 - l.z0), nx = -(l.z1 - l.z0)/L*hl, nz = (l.x1 - l.x0)/L*hl;
      for (const [x, z] of [[l.x0, l.z0], [l.x1, l.z1]]){ edge(x + nx, z + nz); edge(x - nx, z - nz); }
    } else {
      for (let i = 0; i <= 64; i++){
        const t = l.a0 + (l.a1 - l.a0)*i/64, c = Math.cos(t), s = Math.sin(t);
        edge(l.cx + (l.r + hl)*c, l.cz + (l.r + hl)*s); edge(l.cx + (l.r - hl)*c, l.cz + (l.r - hl)*s);
      }
    }
  }
  check(worst <= 1e-9, "every marking strip lies inside the field (outer edges on the boundary)", r3(worst));
  const t = segs('touch');
  check(t.length === 2 && t.every(s => near(Math.abs(s.z0) + hl, 34) && near(s.x0, -52.5) && near(s.x1, 52.5)), "touchlines: outer edge at z = +-34, full length");
  check(segs('halfway').length === 1, "one halfway line");
}

// nets: four panels per goal, normals unit and pointing into the goal; a ball inside is on the positive side of all
{
  let ok = true;
  for (const net of P.colliders.nets){
    const e = net.end;
    check(net.planes.length === 4, `net ${e}: back, roof and two sides`);
    const inside = [e*53.4, 1.0, 0];
    for (const pl of net.planes){
      const l = Math.hypot(...pl.n), s = pl.n[0]*inside[0] + pl.n[1]*inside[1] + pl.n[2]*inside[2] - pl.d;
      ok = ok && near(l, 1, 1e-12) && s > 0;
    }
    const back = net.planes.find(p => p.part === 'back');
    ok = ok && near(Math.abs(back.d), 54.44) && near(back.bounds.y1, 1.9) && near(Math.abs(back.bounds.x0), 54.44);
    const roof = net.planes.find(p => p.part === 'roof');
    ok = ok && roof.n[1] < 0;
    // the roof passes through the bar and the back top
    const onRoof = ([x, y, z]) => near(roof.n[0]*x + roof.n[1]*y + roof.n[2]*z - roof.d, 0, 1e-9);
    ok = ok && onRoof([e*52.44, 2.5, 0]) && onRoof([e*54.44, 1.9, 1]);
    // behind the back of the net is on the negative side of the back panel
    ok = ok && back.n[0]*e*55 - back.d < 0;
  }
  check(ok, "net panels: back at x = +-54.44 (2.0 m behind the posts, 1.90 high), roof from the bar to the back top, normals inward");
}

// boards
{
  const none = makePitch();
  check(Array.isArray(none.colliders.boards) && none.colliders.boards.length === 0, "no boards unless asked");
  const S = makePitch({boards: true});
  const b = S.colliders.boards;
  check(b.length === 5 && b.every(p => p.e === BOARDS.e && near(p.bounds.y1, 0.9) && -p.d > 0), "stadium boards: 0.9 m planes facing the pitch on all four sides, restitution 0.5", b.map(p => [p.side, p.d]));
  check(b.some(p => p.side === 'z+' && near(p.bounds.z0, 38)) && b.some(p => p.side === 'x-' && near(p.bounds.x0, -57.5)), "boards at z = +-38.0 and x = +-57.5");
  // (DESIGN 1.1, 3.3.1: the stadium's near-side boards stop from x = -14 to 14, in front of the dugouts, for the ball too)
  const near0 = b.filter(p => p.side === 'z-');
  check(near0.length === 2 && near(near0[0].bounds.x0, -57.5) && near(near0[0].bounds.x1, -14) && near(near0[1].bounds.x0, 14) && near(near0[1].bounds.x1, 57.5),
    "the stadium layout leaves the dugout gap (x -14 to 14) in the z = -38 boards", near0.map(p => [p.bounds.x0, p.bounds.x1]));
  check(makePitch({boards: {gaps: []}}).colliders.boards.length === 4, "boards with no gaps asked for: four whole sides");
  const G = makePitch({boards: {gaps: [{side: 'z-', a0: -12, a1: 12}]}});
  const zm = G.colliders.boards.filter(p => p.side === 'z-');
  check(zm.length === 2 && near(zm[0].bounds.x1, -12) && near(zm[1].bounds.x0, 12), "a gap in front of the dugouts splits that board in two");
}

// frames: the stadium is the world; the training ground's touchlines are at world z = -4 and -52
{
  const T = makePitch(PITCHES.ground);
  const near1 = T.frame.toWorld(0, -T.hz).z, far1 = T.frame.toWorld(0, T.hz).z;
  check(T.L === 72 && T.Wd === 48, "training pitch 72 x 48");
  check(near(Math.max(near1, far1), -4) && near(Math.min(near1, far1), -52), "training frame touchlines at world z -4 and -52", [near1, far1]);
  check(near(T.goals[1].lineX, 36) && T.colliders.posts.every(p => near(Math.abs(p.x), 35.94) && near(Math.abs(p.z), 3.72)), "training goals full size on x = +-36");
  check(near(T.areas.box[1].front, 19.5) && T.areas.box[1].z1 < T.hz, "training penalty area fits (front 19.5, sides inside the touchlines)");
  const S = pitchOf('stadium');
  check(S.frame.cx === 0 && S.frame.cz === 0 && S.L === 105 && S.Wd === 68, "stadium frame is the world, 105 x 68");
  const F = makeFrame({cx: 3, cz: -28});
  let rt = true;
  for (const [x, z] of [[0, 0], [10, -5], [-36, 24]]){ const w = F.toWorld(x, z), l = F.toLocal(w.x, w.z); rt = rt && near(l.x, x) && near(l.z, z); }
  check(rt, "frame toWorld and toLocal are inverse");
  check(near(T.runoff.hx, 41) && near(T.runoff.hz, 28), "run-off bounds L/2 + 5 and Wd/2 + 4", T.runoff);
}

// team frame, helpers, yaw convention
{
  let ok = true;
  for (const dir of [1, -1]) for (const [u, w] of [[0, 0], [105, 68], [30, 10]]){
    const p = toLocal(dir, u, w, 105, 68), q = toTeam(dir, p.x, p.z, 105, 68);
    ok = ok && near(q.u, u) && near(q.w, w);
  }
  check(ok, "toLocal and toTeam are inverse for both directions");
  const own = toLocal(1, 0, 34, 105, 68), left = toLocal(1, 50, 0, 105, 68);
  check(near(own.x, -52.5) && left.z < 0, "dir +1: u = 0 is the own goal line at x = -52.5; facing +X, left is -Z");
  const a = anchorOf({x: 50, y: 10}, 105, 68);
  check(near(a.u, 10.5) && near(a.w, 34), "formation anchor from js/data/positions.js percentages");
  check(inBox(P, 1, 40, 0) && !inBox(P, 1, 35.9, 0) && !inBox(P, 1, 40, 20.2) && inBox(P, 1, 36.0, 20.16) && inBox(P, -1, -50, -3) && !inBox(P, -1, 50, 0), "inBox includes its lines and nothing else");
  check(inSix(P, 1, 50, 9.0) && !inSix(P, 1, 46.9, 0), "inSix");
  check(side(P, -0.01) === -1 && side(P, 0) === 1 && half(P, 0.05) === 0 && half(P, 0.07) === 1 && half(P, -0.07) === -1, "side and half (the halfway line is neither half)");
  check(onField(P, 52.5, 34) && !onField(P, 52.51, 0), "onField with the lines");
  const d0 = dirOf(0);
  check(near(d0.x, 0) && near(d0.z, -1), "yaw 0 faces -Z");
  let yawOk = true;
  for (let y = -3.1; y < 3.1; y += 0.37){ const d = dirOf(y); yawOk = yawOk && near(wrapA(yawOf(d.x, d.z) - y), 0, 1e-12); }
  check(yawOk, "yawOf inverts dirOf");
  const r0 = dirOf(0 - Math.PI/2), rx = dirOf(yawOf(1, 0) - Math.PI/2);
  check(near(r0.x, 1) && near(rx.z, 1), "facing -Z the right is +X; facing +X the right is +Z");
  check(near(wrapA(3*Math.PI), -Math.PI) || near(wrapA(3*Math.PI), Math.PI), "wrapA folds into [-pi, pi)");
  let wrapOk = true;
  for (let a = -20; a < 20; a += 0.731){ const w = wrapA(a); wrapOk = wrapOk && w >= -Math.PI && w < Math.PI && near(Math.cos(w), Math.cos(a), 1e-9) && near(Math.sin(w), Math.sin(a), 1e-9); }
  check(wrapOk, "wrapA keeps the angle and lands in [-pi, pi)");
}

// the same input gives the same spec
{
  const strip = o => JSON.parse(JSON.stringify(o));
  check(JSON.stringify(strip(makePitch({boards: true}))) === JSON.stringify(strip(makePitch({boards: true}))), "makePitch is deterministic");
}

// purity (DESIGN 1.2, P)
{
  const code = fs.readFileSync(path.join(ROOT, "js/life/football/pitchspec.js"), "utf8").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
  const bad = [/Math\.random/, /\bS\./, /\bMT\b/, /\bA\./, /\bwindow\./, /\bdocument\./, /\bTHREE\b/, /\bMath\.(?:sin|cos|tan|asin|acos|atan2?|exp|expm1|log(?:1p|2|10)?|pow|hypot|cbrt|sinh|cosh|tanh)\(/].filter(re => re.test(code)).map(String);
  // the only import allowed is detmath.js, the engine-independent maths every pure module shares (D6)
  const imports = [...code.matchAll(/^\s*import[^"']*["']([^"']+)["']/gm)].map(x => x[1]);
  check(!bad.length && imports.every(s => s === "./detmath.js"), "pitchspec.js is pure, imports only detmath.js and calls no engine-approximated Math function", {bad, imports});
}

fs.mkdirSync(path.join(ROOT, "qa/out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa/out/unit-pitchspec.json"), JSON.stringify(res, null, 1));
console.log(res.ok ? "pitchspec: pass" : "pitchspec: FAIL");
process.exit(res.ok ? 0 : 1);
