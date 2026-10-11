// qa/wpI-layout.mjs: the training ground's pitch, measured in the built scene (DESIGN 2.4 WP-I acceptance: "measured
// pitch 72x48, goals 7.32x2.44 inner, box 16.5x40.32, spot 11 m, near touchline z=-4; spawns and W.places for the yard,
// gym, clubhouse, bus stop and exits unchanged; W.bounds = {x0:-42, x1:42, z0:-64, z1:29.3}").
// The lines and the goal frames are read from their meshes' vertices in world space (pitchmesh.js pitch-lines and
// pitch-frames), not from the spec they were built from.
// Owner: WP-I (Stage P2).
//
//   node qa/wpI-layout.mjs
import {launch, career, freeze, report, expect} from "./lib.mjs";

const res = {m:null, errors:[]};
const near = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) res.errors.push(`${what}: ${a.toFixed(3)} (want ${b} within ${tol})`); };
const {page, close} = await launch({gfx:"low", seed:3});
try {
  await career(page, {zone:"ground", min:11*60, pos:"ST"});
  const spawnAt = await page.evaluate(() => ({x:window.__life.P.x, z:window.__life.P.z}));
  await freeze(page);
  res.m = await page.evaluate(() => {
    const L = window.__life, scene = L.scene();
    const pts = name => {
      const out = [];
      scene.traverse(o => {
        if (o.name !== name || !o.geometry) return;
        o.updateMatrixWorld(true);
        const p = o.geometry.attributes.position, e = o.matrixWorld.elements;
        for (let i = 0; i < p.count; i++){
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          out.push([e[0]*x + e[4]*y + e[8]*z + e[12], e[1]*x + e[5]*y + e[9]*z + e[13], e[2]*x + e[6]*y + e[10]*z + e[14]]);
        }
      });
      return out;
    };
    const lines = pts("pitch-lines"), frames = pts("pitch-frames");
    const lo = (a, k) => Math.min(...a.map(p => p[k])), hi = (a, k) => Math.max(...a.map(p => p[k]));
    // the lines: their outer edges, the line width off them (the touchline's inner edge is the line that matters)
    const xs = lines.map(p => p[0]), zs = lines.map(p => p[2]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const cx = (x0 + x1)/2, cz = (z0 + z1)/2;
    // the east box line: the vertices of a line running across the pitch (constant x) between the goal line and the spot
    const east = lines.filter(p => p[0] - cx > 14 && p[0] - cx < 24);
    const xsE = [...new Set(east.map(p => +(p[0] - cx).toFixed(2)))].sort((a, b) => a - b);
    // the box's front line is the one with the widest z spread among those
    let box = null;
    for (const x of xsE){
      const on = east.filter(p => Math.abs(p[0] - cx - x) < .011);
      const w = Math.max(...on.map(p => p[2])) - Math.min(...on.map(p => p[2]));
      if (!box || w > box.w) box = {x, w};
    }
    // the penalty spot: line vertices near the axis between the box and the goal
    const spot = lines.filter(p => Math.abs(p[2] - cz) < .3 && p[0] - cx > 22 && p[0] - cx < 28);
    const spotX = spot.length ? spot.reduce((s, p) => s + p[0] - cx, 0)/spot.length : NaN;
    // the east goal frame: its posts' inner faces (the rings at their feet; a post is a cylinder with vertices only at
    // its ends) and the bar's underside
    const g = frames.filter(p => p[0] - cx > 35.5 && p[0] - cx < 36.5 && Math.abs(p[2] - cz) < 5);
    const posts = g.filter(p => p[1] < .001);
    const inner = Math.min(...posts.filter(p => p[2] > cz).map(p => p[2])) - Math.max(...posts.filter(p => p[2] < cz).map(p => p[2]));
    const bar = g.filter(p => Math.abs(p[2] - cz) < 3.8 && p[1] > 2);
    const barLow = bar.length ? Math.min(...bar.map(p => p[1])) : NaN;
    const place = n => { const p = L.W.places.find(q => q.name === n); return p ? {x:p.x, z:p.z} : null; };
    const spotOf = l => { const s = L.spots.find(q => q.label === l); return s ? {x:s.x, z:s.z} : null; };
    return {lines:{x0, x1, z0, z1}, cx, cz, box, spotX, inner, barLow, bounds:L.bounds,
      places:{gym:place("Gym"), club:place("Clubhouse"), bus:place("Bus stop")},
      spots:{bus:spotOf("Bus stop · Training Centre"), bench:spotOf("Bench"), computer:spotOf("Club computer"), squat:spotOf("Squat rack")}};
  });
  // the lines lie inside the field's edge (the outer edge of a touchline is the edge of the pitch, as the laws have it)
  const m = res.m, LW = .12;
  console.log(JSON.stringify(m));
  near(m.lines.x1 - m.lines.x0, 72, .03, "pitch length");
  near(m.lines.z1 - m.lines.z0, 48, .03, "pitch width");
  near(m.lines.z1, -4, .03, "near touchline z");
  near(m.cx, 0, .05, "pitch centre x");
  near(36 - m.box.x - LW/2, 16.5, .08, "box depth");
  near(m.box.w, 40.32, .08, "box width");
  near(36 - m.spotX, 11, .1, "penalty spot");
  near(m.inner, 7.32, .03, "goal inner width");
  near(m.barLow, 2.44, .03, "goal inner height");
  const b = m.bounds;
  if (!(b.x0 === -42 && b.x1 === 42 && b.z0 === -64 && b.z1 === 29.3)) res.errors.push("W.bounds " + JSON.stringify(b));
  // unchanged from before the relayout (ground.js at the stage's start)
  const same = (p, x, z, what) => { if (!p || Math.abs(p.x - x) > 1e-6 || Math.abs(p.z - z) > 1e-6) res.errors.push(`${what} moved: ${JSON.stringify(p)} (was ${x}, ${z})`); };
  same(m.places.gym, 0, 16.9, "the Gym place"); same(m.places.club, 17.6, 10.1, "the Clubhouse place"); same(m.places.bus, -14, 24.6, "the Bus stop place");
  same(m.spots.bus, -14, 24.8, "the bus stop"); same(m.spots.computer, 21.2, 14.2, "the club computer"); same(m.spots.squat, -9.6, 7.6, "the squat rack");
  same(spawnAt, -14, 23.2, "the bus spawn");
} catch(e){ res.errors.push("wpI-layout: " + (e && e.stack || e)); }
finally {
  res.errors.push(...page.errors);
  report("wpI-layout", res);
  await close();
}
expect(!res.errors.length, res.errors.join("\n"));
console.log("wpI-layout: pass");
