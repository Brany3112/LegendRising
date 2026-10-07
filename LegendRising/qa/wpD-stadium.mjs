// qa/wpD-stadium.mjs: the stadium zone, its pitch and its crowd, measured from the built scene.
// Owner: WP-D (pitch mesh, stadium, crowd, audio). Contract: DESIGN 2.3 WP-D acceptance, 1.1 (goal geometry), 1.4.17,
// 3.3, 1.5.11 (the stadium budget on Low).
//
//   node qa/wpD-stadium.mjs            every check below, on Low (QA_GFX to change), writes qa/out/wpD-stadium.json
//   node qa/wpD-stadium.mjs --only dims,walk
//
// Checks:
//   dims     the built pitch (tier 2): inner goal width 7.32 +-0.01 and bar underside 2.44 +-0.01 from the goal frames'
//            vertices; post centres on the goal line; the markings found by casting rays down onto the line mesh: the
//            penalty area 16.5 x 40.32, the goal area 5.5 x 18.32, the penalty spot 11.0 from the goal line, the centre
//            circle 9.15, the touchlines 105 x 68 (outer edges); the crossbar underside seen from the penalty spot at
//            eye height 1.68 between 3.9 and 4.1 degrees over the horizon (a ray search against the frames' mesh)
//   nets     the nets' material: transparent false, alphaTest > 0, depthWrite true (and double sided)
//   mats     every lit mesh material in the stadium carries userData.spec (made by mat(), so a preset change can make
//            it again); the crowd's shaders are the allowed exception
//   api      what the match drives the place through works: the crowd's excitement, a goal and its clock, the bench's
//            substitutes, a spare ball taken off its cone and put back, the scoreboard, the crowd's density, the spawns
//            and the bounds of DESIGN 3.3.1
//   crowd    on Low the crowd of every tier (0 to 4) is at most 8 draws; seats and fans in the expected ranges
//   load     the dummy load (judge graft): tier 2 on Low, 25 human() bodies jogging laps with animateHuman, the ball and
//            the crowd, seen from the centre spot facing a goal: at most 70 draw calls and 150k triangles, no point
//            light lit, no shadow pass (with the stadium's own light and shadow rules of sky.setContext when the sky
//            has them; before that the base renderer's shadow map is reported); the frame time against the ground
//            zone's at the same preset is recorded for WP-QA
//   build    zone build time against the ground zone's, the same session: at most 1.5 times
//   walk     with body() from the dressing room spawn through the tunnel to the centre spot: within 1.2 times the
//            straight-line time, never stuck on the way
import {launch, career, freeze, stepN, report, expect} from "./lib.mjs";

const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const ONLY = opt("--only") ? opt("--only").split(",") : null, want = k => !ONLY || ONLY.includes(k);
const gfx = process.env.QA_GFX || "low";
const res = {gfx, checks: {}, ok: false, errors: []};
const fail = (k, msg) => { res.checks[k] = Object.assign(res.checks[k] || {}, {ok: false}); (res.checks[k].why = res.checks[k].why || []).push(msg); };
const pass = (k, data) => { res.checks[k] = Object.assign({ok: true}, res.checks[k] || {}, data); if (res.checks[k].why) res.checks[k].ok = false; };
const OPTS = tier => ({tier, crowd: [600, 4200, 21000, 41000, 70000][tier], cap: [900, 6000, 28000, 50000, 82000][tier],
  kits: {home: ["#c8202a", "#ffffff"], away: ["#1f4fb0", "#ffffff"]}, clubs: {home: "Steaua Dumbrava", away: "Rapid Lunca"}});

const {page, close} = await launch({gfx, seed: 5});
const enter = (tier, at = "dressing") => page.evaluate(({o, at}) => { const t = performance.now(); window.__life.enterZone("stadium", at, o); return performance.now() - t; }, {o: OPTS(tier), at});
try {
  await career(page, {zone: "ground", min: 15*60});
  await freeze(page);
  await page.evaluate(async () => { window.__WPD = {S: await import("/js/life/football/stadium.js"), B: await import("/js/life/build.js"), C: await import("/js/life/football/crowd.js"),
    H: await import("/js/life/human.js"), PM: await import("/js/life/football/pitchmesh.js")}; });

  /* ---------- build time (first, while the caches are as a player would have them) ---------- */
  if (want("build")){
    const t = [];
    t.push(["stadium", await enter(2)]);
    t.push(["ground", await page.evaluate(() => { const t0 = performance.now(); window.__life.enterZone("ground", "bus"); return performance.now() - t0; })]);
    t.push(["stadium", await enter(2)]);
    t.push(["ground", await page.evaluate(() => { const t0 = performance.now(); window.__life.enterZone("ground", "bus"); return performance.now() - t0; })]);
    t.push(["stadium", await enter(2)]);
    const st = t.filter(x => x[0] === "stadium").map(x => x[1]), gr = t.filter(x => x[0] === "ground").map(x => x[1]);
    const med = a => a.slice().sort((p, q) => p - q)[a.length >> 1];
    const ratio = med(st.slice(1))/med(gr);
    res.checks.build = {runs: t.map(([z, ms]) => [z, +ms.toFixed(0)]), stadiumMs: +med(st.slice(1)).toFixed(0), groundMs: +med(gr).toFixed(0), firstStadiumMs: +st[0].toFixed(0), ratio: +ratio.toFixed(2)};
    if (ratio > 1.5) fail("build", `the stadium builds in ${ratio.toFixed(2)} times the ground's time (at most 1.5)`); else pass("build");
    console.log(`build: stadium ${res.checks.build.stadiumMs} ms (first ${res.checks.build.firstStadiumMs}), ground ${res.checks.build.groundMs} ms, ratio ${ratio.toFixed(2)}`);
  } else await enter(2);

  /* ---------- the pitch's dimensions, from the built meshes ---------- */
  if (want("dims")){
    const d = await page.evaluate(() => {
      const {S, B} = window.__WPD, THREE = B.THREE, P = S.STADIUM.pitch, out = {};
      const pos = P.frames.geometry.attributes.position;
      for (const e of [-1, 1]){
        let inner = Infinity, under = Infinity, postX = [];
        for (let i = 0; i < pos.count; i++){
          const x = pos.getX(i)*e, y = pos.getY(i), z = Math.abs(pos.getZ(i));
          // a post's surface (the round post runs from the grass to over the bar: its rings are at its two ends)
          if (x > 52.3 && x < 52.6 && y > -.01 && y < 2.3 && z > 3.4 && z < 4){ inner = Math.min(inner, z); postX.push(x); }
          // the bar's surface: under 2.7 m, across the mouth
          if (x > 52.3 && x < 52.6 && z < 4 && y > 2.3 && y < 2.7) under = Math.min(under, y);
        }
        const cx = (Math.min(...postX) + Math.max(...postX))/2;
        out["end" + e] = {innerWidth: +(2*inner).toFixed(4), barUnderside: +under.toFixed(4), postCentreX: +cx.toFixed(4)};
      }
      // the markings: rays straight down onto the line mesh, swept across where each edge should be
      // (every layer: a still mesh may be drawn from a merged page, its own copy kept on a hidden layer)
      const rc = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3();
      rc.layers.enableAll();
      const lines = P.lines; lines.updateMatrixWorld(true);
      const hitAt = (x, z) => { o.set(x, 1, z); rc.set(o, down); return rc.intersectObject(lines, false).length > 0; };
      // the covered stretch [a, b] along a sweep (x varies when axis "x"), stepping 2 mm
      const sweep = (axis, fixed, a0, a1) => { let lo = null, hi = null; for (let v = a0; v <= a1; v += .002){ const h = axis === "x" ? hitAt(v, fixed) : hitAt(fixed, v); if (h){ if (lo === null) lo = v; hi = v; } } return lo === null ? null : [+lo.toFixed(3), +hi.toFixed(3)]; };
      out.boxFront = sweep("x", 10, 35.5, 36.5);        // the penalty area's front line, away from the arc
      out.boxSide = sweep("z", 45, 19.6, 20.6);
      out.sixFront = sweep("x", 5, 46.5, 47.5);
      out.sixSide = sweep("z", 50, 8.6, 9.6);
      out.spot = sweep("x", 0, 41, 42);
      out.circle = sweep("x", 0, 8.6, 9.6);
      out.touch = sweep("z", 10, 33.5, 34.5);
      out.goalLine = sweep("x", 25, 52, 53);
      // the crossbar's underside from the penalty spot, at eye height: the lowest elevation that meets the frames
      const fr = P.frames; fr.updateMatrixWorld(true);
      const eye = new THREE.Vector3(41.5, 1.68, 0), dir = new THREE.Vector3();
      const hits = deg => { const a = deg*Math.PI/180; dir.set(Math.cos(a), Math.sin(a), 0); rc.set(eye, dir); rc.far = 11.6; return rc.intersectObject(fr, false).length > 0; };
      let lo = 3, hi = 5; for (let i = 0; i < 30; i++){ const m = (lo + hi)/2; if (hits(m)) hi = m; else lo = m; }
      out.barAngle = +hi.toFixed(3);
      out.spec = {hx: S.STADIUM.spec.hx, hz: S.STADIUM.spec.hz, roll: S.STADIUM.spec.roll, boards: S.STADIUM.spec.colliders.boards.length};
      return out;
    });
    res.checks.dims = d;
    const near = (v, t, tol) => v != null && Math.abs(v - t) <= tol;
    for (const e of ["end-1", "end1"]){
      if (!near(d[e].innerWidth, 7.32, .01)) fail("dims", `${e}: inner goal width ${d[e].innerWidth}`);
      if (!near(d[e].barUnderside, 2.44, .01)) fail("dims", `${e}: bar underside ${d[e].barUnderside}`);
      if (!(d[e].postCentreX >= 52.38 && d[e].postCentreX <= 52.50)) fail("dims", `${e}: post centre x ${d[e].postCentreX} is not on the goal line [52.38, 52.50]`);
    }
    // outer edges: the line lies inside the area it bounds
    const edge = (r, outer, side, name) => { if (!r) return fail("dims", `${name}: no line found`); const v = side > 0 ? r[1] : r[0]; if (!near(v, outer, .01)) fail("dims", `${name}: outer edge ${v}, wanted ${outer}`); if (!near(r[1] - r[0], .12, .012)) fail("dims", `${name}: line ${(r[1] - r[0]).toFixed(3)} m wide`); };
    edge(d.boxFront, 36.0, -1, "penalty area front (16.5 from the goal line)");
    edge(d.boxSide, 20.16, 1, "penalty area side (40.32 wide)");
    edge(d.sixFront, 47.0, -1, "goal area front (5.5)");
    edge(d.sixSide, 9.16, 1, "goal area side (18.32 wide)");
    edge(d.circle, 9.15, 1, "centre circle (9.15)");
    edge(d.touch, 34.0, 1, "touchline (68 wide)");
    edge(d.goalLine, 52.5, 1, "goal line (105 long)");
    if (!d.spot || !near((d.spot[0] + d.spot[1])/2, 41.5, .01)) fail("dims", `penalty spot centre ${d.spot && ((d.spot[0] + d.spot[1])/2).toFixed(3)} (11.0 from the goal line is 41.5)`);
    if (!(d.barAngle >= 3.9 && d.barAngle <= 4.1)) fail("dims", `the bar's underside is ${d.barAngle} degrees up from the spot (3.9 to 4.1)`);
    if (d.spec.hx !== 52.5 || d.spec.hz !== 34 || Math.abs(d.spec.roll - 1.10) > 1e-9) fail("dims", `spec ${JSON.stringify(d.spec)}`);
    if (!res.checks.dims.why) pass("dims");
    console.log(`dims: goal ${d["end1"].innerWidth} x ${d["end1"].barUnderside}, box ${JSON.stringify(d.boxFront)} / ${JSON.stringify(d.boxSide)}, spot ${JSON.stringify(d.spot)}, circle ${JSON.stringify(d.circle)}, bar angle ${d.barAngle}  ${res.checks.dims.ok ? "ok" : "FAIL"}`);
  }

  /* ---------- the nets ---------- */
  if (want("nets")){
    const n = await page.evaluate(() => { const m = window.__WPD.S.STADIUM.pitch.netMesh.material; return {transparent: m.transparent, alphaTest: m.alphaTest, depthWrite: m.depthWrite, side: m.side, type: m.type, spec: !!m.userData.spec}; });
    res.checks.nets = n;
    if (n.transparent !== false || !(n.alphaTest > 0) || n.depthWrite !== true || n.side !== 2) fail("nets", JSON.stringify(n)); else pass("nets");
    console.log(`nets: ${JSON.stringify(n)}`);
  }

  /* ---------- materials through mat() ---------- */
  if (want("mats")){
    const m = await page.evaluate(() => {
      const bad = new Map(); let n = 0;
      window.__life.scene().traverse(o => {
        if (!o.isMesh || o.isSkinnedMesh) return;
        for (const mt of [].concat(o.material)){
          if (!mt || mt.isShaderMaterial || mt.isMeshBasicMaterial || mt.isSpriteMaterial || mt.isLineBasicMaterial || mt.isPointsMaterial) continue;
          n++;
          if (!mt.userData || !mt.userData.spec) bad.set(o.name || o.type, (bad.get(o.name || o.type) || 0) + 1);
        }
      });
      return {materials: n, missing: [...bad.entries()]};
    });
    res.checks.mats = m;
    if (m.missing.length) fail("mats", `materials with no spec: ${JSON.stringify(m.missing)}`); else pass("mats");
    console.log(`mats: ${m.materials} lit materials, ${m.missing.length} without a spec`);
  }

  /* ---------- what the match drives the place through ---------- */
  if (want("api")){
    const a = await page.evaluate(() => {
      const {S} = window.__WPD, ST = S.STADIUM, c = ST.crowd, L = window.__life, out = {};
      // the crowd worked up, a goal at the east end, the clock and the light
      ST.excite(.9); c.goal(1); L.stepN(30);
      const m = c.meshes.filter(x => x.material.uniforms && x.material.uniforms.uExcite);
      out.excite = m.length ? m[0].material.uniforms.uExcite.value : null;
      out.goalEnd = m.length ? m[0].material.uniforms.uGoalEnd.value : null;
      out.time = m.length ? +m[0].material.uniforms.uTime.value.toFixed(3) : null;
      // three substitutes left on the home bench
      out.bench = c.setBench("home", 3);
      // the spare balls: one taken off its cone and put back
      const k = ST.cones[0]; out.cones = ST.cones.length; out.take = k.take(); out.takeAgain = k.take(); out.put = k.put();
      // the scoreboard
      const v0 = ST.board.tex.version; ST.score({hs: 2, as: 1, min: 67}); out.board = ST.board.tex.version > v0;
      // fewer billboards (adaptive quality) and back
      c.density(.5); c.density(1);
      out.spawns = Object.keys(ST.spawns).sort().join(",");
      out.bounds = JSON.stringify(L.bounds);
      return out;
    });
    res.checks.api = a;
    if (a.excite !== .9 || a.goalEnd !== 1 || !(a.time > 0)) fail("api", `crowd uniforms ${JSON.stringify(a)}`);
    if (a.bench !== 3) fail("api", `bench ${a.bench}`);
    if (a.cones !== 8 || !a.take || a.takeAgain || !a.put) fail("api", `cones ${JSON.stringify(a)}`);
    if (!a.board) fail("api", "the scoreboard did not redraw");
    if (a.spawns !== "benchAway,benchHome,dressing,exit,fourth,tunnelDoor,tunnelMouth") fail("api", `spawns ${a.spawns}`);
    if (a.bounds !== JSON.stringify({x0: -64, x1: 64, z0: -80, z1: 50})) fail("api", `bounds ${a.bounds}`);
    if (!res.checks.api.why) pass("api");
    console.log(`api: ${JSON.stringify(a)}`);
  }

  /* ---------- the crowd on every tier ---------- */
  if (want("crowd")){
    const out = [];
    for (let tier = 0; tier <= 4; tier++){
      await enter(tier);
      const s = await page.evaluate(() => window.__WPD.S.STADIUM.crowd.stats());
      out.push(Object.assign({tier}, s));
      console.log(`crowd: tier ${tier}: ${s.seats} seats, ${s.fans} fans, ${s.draws} draws (${s.kind})`);
      if (gfx === "low" && s.draws > 8) fail("crowd", `tier ${tier}: the crowd is ${s.draws} draws on Low (at most 8)`);
      const target = [300, 6000, 28000, 50000, 82000][tier];
      if (tier > 0 && (s.seats < target*.7 || s.seats > target*1.3)) fail("crowd", `tier ${tier}: ${s.seats} seats built for a ${target}-seat ground`);
      if (s.fans <= 0) fail("crowd", `tier ${tier}: nobody in the stands`);
    }
    res.checks.crowd = Object.assign(res.checks.crowd || {}, {tiers: out});
    if (!res.checks.crowd.why) pass("crowd");
  }

  /* ---------- the dummy load ---------- */
  if (want("load")){
    await enter(2);
    const L = await page.evaluate(async () => {
      const {S, H, PM} = window.__WPD, L = window.__life, R = L.renderer(), scene = L.scene(), cam = L.cam, gl = R.getContext();
      // 25 bodies jogging laps round the pitch, at their own places on two loops
      const bodies = [];
      for (let i = 0; i < 25; i++){
        const kit = i < 12 ? ["#c8202a", "#ffffff"] : i < 24 ? ["#1f4fb0", "#ffffff"] : ["#20242a", "#20242a"];
        const h = H.human(H.lookFor(i === 24 ? "referee" : "footballer", 300 + i, {kit, number: (i % 11) + 1}));
        scene.add(h.g);
        bodies.push({h, a: i/25*Math.PI*2, r: i % 2 ? [38, 24] : [30, 18], v: 3.6 + (i % 5)*.15});
      }
      const ball = PM.ballMesh(); scene.add(ball.mesh);
      const sky = L.sky(), stadiumRules = !!(sky && sky.setContext);
      // the centre spot, eyes 1.68 m up, facing the east goal
      const look = () => { cam.position.set(0, 1.68, 0); cam.rotation.set(0, -Math.PI/2, 0, "YXZ"); cam.updateMatrixWorld(true); };
      let shadowRenders = 0;
      const sm = R.shadowMap, orig = sm.render.bind(sm);
      sm.render = function(lights, sc, c){ if (sm.enabled && (sm.autoUpdate || sm.needsUpdate) && lights.some(l => l.castShadow)) shadowRenders++; return orig(lights, sc, c); };
      const frame = dt => {
        for (const b of bodies){
          b.a += b.v*dt/((b.r[0] + b.r[1])/2);
          const x = Math.cos(b.a)*b.r[0], z = Math.sin(b.a)*b.r[1], dx = -Math.sin(b.a)*b.r[0], dz = Math.cos(b.a)*b.r[1];
          b.h.g.position.set(x, 0, z); b.h.g.rotation.y = Math.atan2(dx, dz);
          H.animateHuman(b.h, dt, {mode: "move", speed: b.v});
        }
        const t = performance.now()/1000;
        ball.mesh.position.set(Math.cos(t)*6, .11 + Math.abs(Math.sin(t*2))*1.5, Math.sin(t)*4);
        S.STADIUM.crowd.update(dt);
        look();
      };
      const px = new Uint8Array(4);
      const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      // four seconds of the world first: whatever real lights the last place left lit have faded out (the sky hands
      // them over smoothly, never cutting one)
      for (let i = 0; i < 240; i++){ L.stepN(1); frame(1/60); if (i % 20 === 0) R.render(scene, cam); }
      sync();
      shadowRenders = 0;
      const calls = [], tris = [], ms = [];
      R.info.autoReset = true;
      for (let i = 0; i < 60; i++){
        const t0 = performance.now();
        frame(1/60); R.render(scene, cam); sync();
        ms.push(performance.now() - t0); calls.push(R.info.render.calls); tris.push(R.info.render.triangles);
      }
      sm.render = orig;
      let lit = 0, pts = 0; scene.traverse(o => { if (o.isPointLight){ pts++; if (o.visible && o.intensity > 1e-3) lit++; } });
      const med = a => a.slice().sort((p, q) => p - q)[a.length >> 1];
      for (const b of bodies) b.h.dispose(); scene.remove(ball.mesh);
      return {calls: Math.max(...calls), tris: Math.max(...tris), medianMs: +med(ms).toFixed(2), pointLights: pts, litPointLights: lit,
        shadowMap: R.shadowMap.enabled, shadowRenders, stadiumRules, pool: sky && sky.pool ? sky.pool.length : null, crowd: S.STADIUM.crowd.stats()};
    });
    // the ground zone at the same preset, the same camera kind of view (its pitch from the stand side), for the record
    const G = await page.evaluate(() => {
      const L = window.__life; L.enterZone("ground", "tunnel"); L.stepN(5);
      const R = L.renderer(), scene = L.scene(), cam = L.cam, gl = R.getContext(), px = new Uint8Array(4), ms = [];
      for (let i = 0; i < 20; i++){ L.stepN(1); R.render(scene, cam); }
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      for (let i = 0; i < 60; i++){ const t0 = performance.now(); L.stepN(1); R.render(scene, cam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ms.push(performance.now() - t0); }
      return {medianMs: +ms.slice().sort((p, q) => p - q)[30].toFixed(2), calls: R.info.render.calls, tris: R.info.render.triangles};
    });
    L.ground = G; L.frameRatio = +(L.medianMs/Math.max(.01, G.medianMs)).toFixed(2);
    res.checks.load = L;
    if (L.calls > 70) fail("load", `${L.calls} draw calls (at most 70)`);
    if (L.tris > 150000) fail("load", `${L.tris} triangles (at most 150k)`);
    if (L.litPointLights > 0) fail("load", `${L.litPointLights} point lights lit`);
    if (L.stadiumRules){
      if (L.pool > 0 && gfx !== "high") fail("load", `${L.pool} real point lights in the sky's pool`);
      if (gfx === "low" && (L.shadowMap && L.shadowRenders > 0)) fail("load", `${L.shadowRenders} shadow passes on Low`);
    } else L.note = "the sky has no stadium light rules yet (WP-A): its shadow map is the base renderer's; the stadium adds no light of its own";
    if (!res.checks.load.why) pass("load");
    console.log(`load: ${L.calls} calls, ${L.tris} triangles, ${L.litPointLights}/${L.pointLights} point lights lit, shadow passes ${L.shadowRenders} (map ${L.shadowMap ? "on" : "off"}), ${L.medianMs} ms a frame against the ground's ${G.medianMs} ms (x${L.frameRatio})${L.note ? "; " + L.note : ""}`);
  }

  /* ---------- the walk out ---------- */
  if (want("walk")){
    await enter(2, "dressing");
    const w = await page.evaluate(() => {
      const L = window.__life, P = L.P;
      L.place({x: 0, z: -74, y: 0, yaw: Math.PI}); P.pitch = 0;
      for (const k in L.keys) L.keys[k] = false;
      L.keys.w = true;
      let n = 0, vmax = 0, stuck = 0, minX = 0, maxX = 0;
      const z0 = P.z;
      while (P.z < 0 && n < 60*90){
        L.stepN(1); n++;
        const v = Math.hypot(P.vx, P.vz); vmax = Math.max(vmax, v);
        if (n > 60 && P.speed < .3) stuck++;
        minX = Math.min(minX, P.x); maxX = Math.max(maxX, P.x);
      }
      L.keys.w = false;
      return {frames: n, seconds: +(n/60).toFixed(2), from: z0, to: +P.z.toFixed(2), x: +P.x.toFixed(3), vmax: +vmax.toFixed(3), stuckFrames: stuck, drift: [+minX.toFixed(3), +maxX.toFixed(3)]};
    });
    const straight = 74/Math.max(.1, w.vmax);
    w.straightSeconds = +straight.toFixed(2); w.ratio = +(w.seconds/straight).toFixed(3);
    res.checks.walk = w;
    if (w.to < 0) fail("walk", `never reached the centre spot: stopped at z ${w.to}`);
    if (w.ratio > 1.2) fail("walk", `took ${w.seconds} s, ${w.ratio} times the straight line's ${w.straightSeconds} s`);
    if (w.stuckFrames > 0) fail("walk", `stuck for ${w.stuckFrames} frames on the way`);
    if (!res.checks.walk.why) pass("walk");
    console.log(`walk: dressing room to the centre spot in ${w.seconds} s (straight line ${w.straightSeconds} s, x${w.ratio}), stuck ${w.stuckFrames}`);
  }

  res.errors = page.errors.slice();
  res.ok = Object.values(res.checks).every(c => c.ok !== false) && !page.errors.length;
} catch(e){ res.errors.push(String(e && e.stack || e)); res.ok = false; }
finally { await close(); }
report("wpD-stadium", res);
for (const [k, c] of Object.entries(res.checks)) if (c.ok === false) console.log(`FAIL ${k}: ${(c.why || []).join("; ")}`);
if (res.errors.length) console.log("errors:\n" + res.errors.join("\n"));
console.log(res.ok ? "wpD-stadium: ok" : "wpD-stadium: FAILED");
process.exit(res.ok ? 0 : 1);
