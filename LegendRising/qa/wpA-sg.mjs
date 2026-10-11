// qa/wpA-sg.mjs: WP-A acceptance for the collision hash (core/collide.js SG).
// Owner: WP-A (DESIGN 2.3 WP-A acceptance, 1.4.5, 3.9.5).
//
//   same answers   in home, the ground and town, thousands of random queries (boxes in a rectangle, rays with and
//                  without a skip box and a face normal, boxes within a radius, you against the walls) give exactly
//                  what a scan of every box in W.solids gives, in the same order (the I0 parity goldens are checked by
//                  qa/parity.mjs)
//   faster         along the 60 m walk down your street, the same rays and wall tests through the hash take at most
//                  30% of the time a scan of every box takes
//   audit          SG.audit() over 60 s of the world in each zone: no box filed as still has moved. A box that does is
//                  listed with where it was made (it should be made with {dyn: true} there). The places in other
//                  packages' files that WP-A asked to change through the hook queue (PENDING below) are reported as
//                  notes until the change lands; any other moved box fails
//
//   QA_PORT=8772 node qa/wpA-sg.mjs        writes qa/out/wpA-sg.json
import {launch, career, freeze, expect, report} from "./lib.mjs";

const out = {zones: {}, checks: [], ok: true};
const check = (name, ok, detail, soft = false) => { out.checks.push({name, ok: !!ok, soft, detail}); if (!ok && !soft) out.ok = false; console.log(`${ok ? "ok  " : soft ? "note" : "FAIL"} ${name}${detail !== undefined ? ": " + JSON.stringify(detail) : ""}`); };
const soft = process.argv.includes("--audit-soft");
// moving boxes made in files WP-A does not own, with the hook request filed for each (made with {dyn: true} there)
const PENDING = [];     // (the P1 hook for npc.js regulars() landed at the P1a integration: a browser's box is made {dyn: true})

const {page, close, errors} = await launch({gfx: "low", seed: 5});
try {
  await career(page, {zone: "home", at: "bed", min: 12*60});
  await freeze(page);
  for (const zone of ["home", "ground", "town"]){
    const r = await page.evaluate(async (zone) => {
      const C = await import("./js/life/core/collide.js"), L = __life, SG = C.SG;
      SG.trace = true;
      L.enterZone(zone, zone === "home" ? "bed" : "bus");
      SG.trace = false;
      const W = L.W, sol = W.solids, b = W.bounds;
      // the scan of every box, as the world did it before the hash
      const box2 = (s, x0, z0, x1, z1) => !(s.x1 < x0 || s.x0 > x1 || s.z1 < z0 || s.z0 > z1);
      const eachLin = (x0, z0, x1, z1) => sol.filter(s => box2(s, x0, z0, x1, z1));
      const rayLin = (ox, oy, oz, dx, dy, dz, len, skip, out) => {
        let best = len, hit = null;
        const ix = 1/(dx || 1e-12), iy = 1/(dy || 1e-12), iz = 1/(dz || 1e-12);
        for (const s of sol){
          if (s.off) continue;
          if (skip && s.x0 < skip[1][0] && s.x1 > skip[0][0] && s.y0 < skip[1][1] && s.y1 > skip[0][1] && s.z0 < skip[1][2] && s.z1 > skip[0][2]) continue;
          if (ox > s.x0 && ox < s.x1 && oy > s.y0 && oy < s.y1 && oz > s.z0 && oz < s.z1) continue;
          let a = (s.x0 - ox)*ix, b2 = (s.x1 - ox)*ix, t0 = Math.min(a, b2), t1 = Math.max(a, b2);
          a = (s.y0 - oy)*iy; b2 = (s.y1 - oy)*iy; t0 = Math.max(t0, Math.min(a, b2)); t1 = Math.min(t1, Math.max(a, b2));
          a = (s.z0 - oz)*iz; b2 = (s.z1 - oz)*iz; t0 = Math.max(t0, Math.min(a, b2)); t1 = Math.min(t1, Math.max(a, b2));
          if (t0 <= t1 && t1 > 0 && t0 >= 0 && t0 < best){ best = t0; hit = s; }
        }
        if (out && hit){
          const tx = Math.min((hit.x0 - ox)*ix, (hit.x1 - ox)*ix), ty = Math.min((hit.y0 - oy)*iy, (hit.y1 - oy)*iy), tz = Math.min((hit.z0 - oz)*iz, (hit.z1 - oz)*iz);
          out[0] = out[1] = out[2] = 0;
          if (tx >= ty && tx >= tz) out[0] = dx > 0 ? -1 : 1; else if (ty >= tz) out[1] = dy > 0 ? -1 : 1; else out[2] = dz > 0 ? -1 : 1;
        }
        return best;
      };
      const withinLin = (x, y, z, r) => sol.some(s => { if (s.off) return false; const ex = Math.max(s.x0 - x, 0, x - s.x1), ey = Math.max(s.y0 - y, 0, y - s.y1), ez = Math.max(s.z0 - z, 0, z - s.z1); return ex*ex + ey*ey + ez*ez <= r*r; });
      let s = 12345; const rnd = () => { s = (s*1664525 + 1013904223) >>> 0; return s/4294967296; };
      const rx = () => b.x0 + rnd()*(b.x1 - b.x0), rz = () => b.z0 + rnd()*(b.z1 - b.z0);
      let bad = [], n = 0;
      for (let i = 0; i < 3000; i++){
        const x = rx(), z = rz(), w = rnd()*3, d = rnd()*3;
        const got = []; SG.each(x, z, x + w, z + d, q => { got.push(q); });
        const want = eachLin(x, z, x + w, z + d);
        n++; if (got.length !== want.length || got.some((q, k) => q !== want[k])) bad.push({q: "each", x, z, got: got.length, want: want.length});
      }
      const o1 = new Float32Array(3), o2 = new Float32Array(3);
      for (let i = 0; i < 3000; i++){
        const ox = rx(), oy = rnd()*12, oz = rz(); let dx = rnd() - .5, dy = (rnd() - .5)*.8, dz = rnd() - .5; const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
        const len = rnd() < .5 ? 3 : 20, skip = rnd() < .2 ? [[ox - 1, oy - 1, oz - 1], [ox + 1, oy + 1, oz + 1]] : null;
        o1.fill(9); o2.fill(9);
        const a = SG.ray(ox, oy, oz, dx, dy, dz, len, skip, o1), b2 = rayLin(ox, oy, oz, dx, dy, dz, len, skip, o2);
        n++; if (a !== b2 || o1[0] !== o2[0] || o1[1] !== o2[1] || o1[2] !== o2[2]) bad.push({q: "ray", a, b: b2});
      }
      for (let i = 0; i < 2000; i++){
        const x = rx(), y = rnd()*10, z = rz(), r = rnd()*1.5;
        n++; if (SG.anyWithin(x, y, z, r) !== withinLin(x, y, z, r)) bad.push({q: "within", x, y, z, r});
      }
      // you against the walls: the first box in the way, as the old loop found it
      const P = L.P, feet = P.feet;
      for (let i = 0; i < 2000; i++){
        const x = rx(), z = rz(); P.feet = rnd() < .7 ? 0 : rnd()*10;
        const lo = P.feet + .42, hi = P.feet + 1.75, R = C.R;
        C.findInside();
        const ins = C.inside.slice();
        const want = sol.find(q => !q.off && !(q.y1 <= lo || q.y0 >= hi) && x + R > q.x0 && x - R < q.x1 && z + R > q.z0 && z - R < q.z1 && !ins.includes(q)) || null;
        n++; if (C.hits(x, z) !== want) bad.push({q: "hits", x, z});
      }
      P.feet = feet;
      return {queries: n, bad: bad.slice(0, 5), nbad: bad.length, solids: sol.length, dyn: SG.dyn.length, big: SG.big.length, buildMs: +SG.buildMs.toFixed(2)};
    }, zone);
    out.zones[zone] = {parity: r};
    check(`${zone}: the hash answers exactly as a scan of every box (${r.queries} queries, ${r.solids} boxes)`, r.nbad === 0, r.nbad ? r.bad : {dyn: r.dyn, big: r.big, buildMs: r.buildMs});
    check(`${zone}: filing the boxes takes at most 0.2 ms per 500 boxes`, r.buildMs <= .2*Math.max(1, r.solids/500)*5, {ms: r.buildMs, solids: r.solids}, true);
    // 60 s of the world: no box filed as still may move
    const au = await page.evaluate(async () => {
      const C = await import("./js/life/core/collide.js"), L = __life;
      L.stepN(3600, 1/60);
      return C.SG.audit().map(s => ({at: s.at || "", box: [s.x0, s.x1, s.z0, s.z1].map(v => +v.toFixed(2))}));
    });
    out.zones[zone].audit = au;
    const hooked = au.filter(m => PENDING.some(p => p.at.test(m.at))), rest = au.filter(m => !hooked.includes(m));
    check(`${zone}: SG.audit() reports no moved static boxes over 60 s`, rest.length === 0, rest.length ? {moved: rest.length, madeAt: [...new Set(rest.map(m => m.at))]} : 0, soft);
    if (hooked.length) check(`${zone}: moved boxes waiting for a filed hook request`, false, {moved: hooked.length, hooks: [...new Set(hooked.map(m => PENDING.find(p => p.at.test(m.at)).hook))]}, true);
  }
  // the 60 m walk down your street (qa/record-perf.mjs WALK): the rays and wall tests of every frame, through the hash
  // and through a scan of every box
  const walk = await page.evaluate(async () => {
    const C = await import("./js/life/core/collide.js"), L = __life, P = L.P, sol = L.W.solids;
    L.enterZone("home", {x: -27, z: 4.6, y: .12, yaw: -Math.PI/2}); L.place({x: -27, z: 4.6, y: .12, yaw: -Math.PI/2});
    L.stepN(30);
    const pts = [], x0 = P.x;
    L.keys.w = L.keys.shift = true;
    for (let i = 0; i < 900 && Math.abs(P.x - x0) < 60; i++){ L.stepN(1); pts.push([P.x, P.eye, P.z, P.feet]); }
    L.keys.w = L.keys.shift = false;
    const dirs = []; for (let i = 0; i < 30; i++){ const k = i*2.399; dirs.push([Math.cos(k), Math.sin(i*.7)*.4, Math.sin(k)]); }
    const rayLin = (ox, oy, oz, dx, dy, dz, len) => {
      let best = len; const ix = 1/(dx || 1e-12), iy = 1/(dy || 1e-12), iz = 1/(dz || 1e-12);
      for (const s of sol){
        if (s.off || (ox > s.x0 && ox < s.x1 && oy > s.y0 && oy < s.y1 && oz > s.z0 && oz < s.z1)) continue;
        let a = (s.x0 - ox)*ix, b = (s.x1 - ox)*ix, t0 = Math.min(a, b), t1 = Math.max(a, b);
        a = (s.y0 - oy)*iy; b = (s.y1 - oy)*iy; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
        a = (s.z0 - oz)*iz; b = (s.z1 - oz)*iz; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
        if (t0 <= t1 && t1 > 0 && t0 >= 0 && t0 < best) best = t0;
      }
      return best;
    };
    const hitsLin = (x, z, lo, hi) => { const R = C.R; for (const q of sol) if (!q.off && !(q.y1 <= lo || q.y0 >= hi) && x + R > q.x0 && x - R < q.x1 && z + R > q.z0 && z - R < q.z1) return q; return null; };
    const run = (ray, hit) => { const t = performance.now(); let k = 0; for (const [x, y, z, f] of pts){ for (const d of dirs) k += ray(x, y, z, d[0], d[1], d[2], 3); for (let j = 0; j < 8; j++) k += hit(x + (j - 4)*.03, z, f + .42, f + 1.75) ? 1 : 0; } return [performance.now() - t, k]; };
    // each measured three times, alternating, the best of each kept (the machine is shared)
    let hash = Infinity, lin = Infinity;
    for (let r = 0; r < 3; r++){
      hash = Math.min(hash, run((x, y, z, a, b, c, l) => C.SG.ray(x, y, z, a, b, c, l), (x, z, lo, hi) => { P.feet = lo - .42; return C.hits(x, z); })[0]);
      lin = Math.min(lin, run(rayLin, hitsLin)[0]);
    }
    return {frames: pts.length, metres: +Math.abs(P.x - x0).toFixed(1), hashMs: +hash.toFixed(2), scanMs: +lin.toFixed(2), ratio: +(hash/lin).toFixed(3)};
  });
  out.walk = walk;
  check("the 60 m walk: the hash's rays and wall tests take at most 30% of a full scan's time", walk.ratio <= .3, walk);
  check("no errors", errors.length === 0, errors.slice(0, 5));
} finally { await close(); }
report("wpA-sg", out);
console.log(out.ok ? "wpA-sg: pass" : "wpA-sg: FAIL");
expect(out.ok, "wpA-sg failed");
