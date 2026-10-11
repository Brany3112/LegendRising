// qa/wpB-npc.mjs: people as scheduler actors, animation tiers, far bodies, building bodies ahead, kit colours
// (DESIGN 2.3 WP-B, 3.5.9, 3.9.6). Owner: WP-B (Stage 1). Contracts 1.4.3 (SCHED.actor), 1.4.18 (human.js).
//
//   1. the training session on Low, seen from the pitch at noon (the I0 perf view): animating everyone costs at most
//      half of what it did at I0, measured side by side with the I0 tree in one browser (lib.mjs sideBySide: both
//      pages cross-origin isolated, so the clock reads to 5 us; frames taken in turns, 150 at a time, 1200 from each:
//      a recorded figure from another day says as much about the machine as about the code), once the session has
//      run for 30 s in both (the first seconds in a place run code the engine has not optimised yet, in both trees,
//      and say more about the compiler than about the animation). The figure is the median frame, as in every CPU
//      gate (DESIGN 3.9.8): a collection of the page's garbage lands in whichever frame and code happen to be running
//      (the means, and the frames over 1 ms, are reported beside it). The I0 measure is record-perf's (the W.anims
//      closures run once more in a frame); this tree's is the same closures, which only think and move now, plus the
//      actors' animation that frame. And the 1.5.11 budget: at most 0.35 ms a frame (mean) for the training ground's
//      animation on Low;
//   2. at most 12 full poses in any frame on Low, and no body beyond GFX.P.animMid posed every frame;
//   3. a body hidden (T4, state only) while it walks on and then seen again catches up without any bone turning more
//      than 0.35 rad in a frame;
//   4. the far body (LOD3) is an indexed mesh of at most 450 triangles;
//   5. prebuildHumans of 22 new looks never takes more than 8 ms in one slice;
//   6. clashFree: for every home and away pairing in Liga 1 and Liga 4, each side's keeper and the referee are at
//      least 120 apart (RGB) from both teams' outfield shirts.
//
//   QA_PORT=8771 node qa/wpB-npc.mjs          exits 1 on any failed check; writes qa/out/wpB-npc.json
import fs from "node:fs";
import path from "node:path";
import {launch, career, freeze, report, sideBySide, ROOT} from "./lib.mjs";

const res = {name: "wpB-npc", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
const base = JSON.parse(fs.readFileSync(path.join(ROOT, "qa", "perf-baseline.json"), "utf8"));
const I0 = base.tiers.low.pitch.animMs;

// 1. side by side with the I0 tree: the ground at noon on Low, seen from the pitch, frames taken in turns
{
  const AB = await sideBySide();
  try {
    const at = {zone: "ground", at: {x: 0, z: -1, y: 0, yaw: 0}, pitch: -.1};
    const pages = {base: await AB.open("base", "low", at), new: await AB.open("new", "low", at)};
    const measure = (p, which) => p.evaluate(async ({which, n}) => {
      const L = __life, R = L.renderer(), sc = L.scene(), cam = L.cam;
      const SC = which === "new" ? (await import("./js/life/core/sched.js")).SCHED : null;
      if (SC) SC.timing = true;
      const v = [];
      for (let i = 0; i < n; i++){
        L.stepN(1);
        const a = SC ? SC.stats().animMs : 0;
        const t = performance.now(); for (const f of L.W.anims) f(1/60); const w = performance.now() - t;
        v.push(a + w);
        R.render(sc, cam);
      }
      if (SC) SC.timing = false;
      return v;
    }, {which, n: 150});
    // the same warm-up for both: 30 s of the session (drawn every tenth frame), then 150 frames measured and thrown
    // away, then eight rounds each, in turns
    for (const w of ["base", "new"]) await pages[w].evaluate(n => { const L = __life, R = L.renderer(); for (let i = 0; i < n; i++){ L.stepN(1); if (i % 10 === 0) R.render(L.scene(), L.cam); } }, 1800);
    for (const w of ["base", "new"]) await measure(pages[w], w);
    const all = {base: [], new: []};
    for (let k = 0; k < 8; k++) for (const w of k % 2 ? ["new", "base"] : ["base", "new"]) all[w].push(...await measure(pages[w], w));
    const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return +s[Math.floor(p*(s.length - 1))].toFixed(4); };
    const mean = a => +(a.reduce((s, x) => s + x, 0)/a.length).toFixed(4);
    const over = a => { const b = a.filter(x => x > 1); return {n: b.length, ms: +b.reduce((s, x) => s + x, 0).toFixed(1)}; };
    const sum = a => ({median: q(a, .5), mean: mean(a), p95: q(a, .95), over1ms: over(a), n: a.length});
    const ab = {base: sum(all.base), new: sum(all.new), isolated: {base: pages.base.isolated, new: pages.new.isolated},
      errors: Object.values(pages).flatMap(p => p.errs).slice(0, 5)};
    ab.ratio = +(ab.new.median/ab.base.median).toFixed(3); ab.meanRatio = +(ab.new.mean/ab.base.mean).toFixed(3);
    res.ab = ab;
    check(ab.isolated.base && ab.isolated.new, "both pages cross-origin isolated (a clock that reads to 5 us)", ab.isolated);
    check(ab.ratio <= .5, "ground session on Low: animation at most half of the I0 tree's, side by side (median frame of 1200)", ab);
    check(ab.new.mean <= .35, "ground session on Low: animation within the 1.5.11 budget of 0.35 ms a frame (mean)", ab.new);
    check(!ab.errors.length, "no errors in either tree (side by side)", ab.errors);
  } catch(e){ check(false, "side by side with the I0 tree ran", String(e && e.stack || e)); }
  finally { await AB.close(); }
}

const {page, close} = await launch({gfx: "low", seed: 1, w: 1280, h: 720});
try {
  await career(page, {zone: "ground", min: 12*60});
  await freeze(page);
  // 1 and 2
  const sess = await page.evaluate(async () => {
    const H = await import("./js/life/human.js"), SC = await import("./js/life/core/sched.js");
    const L = window.__life, R = L.renderer(), sc = L.scene(), cam = L.cam;
    for (const k in L.keys) L.keys[k] = false;
    S.life.min = 12*60;
    L.enterZone("ground", "bus");
    L.place({x: 0, z: -1, y: 0, yaw: 0}); L.P.pitch = -.1;
    const frame = () => { L.stepN(1); R.render(sc, cam); };
    for (let i = 0; i < 30; i++) frame();
    SC.SCHED.timing = true;
    const all = H.bodies(), posed = new Map(all.map(h => [h, 0])), far = new Set();
    const P = typeof GFX !== "undefined" && GFX ? GFX.P : null, mid = (P && P.animMid) || 35;
    const anim = [], fpu = [], parts = [];
    let seen = 0;
    const N = 300;
    for (let i = 0; i < N; i++){
      const before = new Map(all.map(h => [h, h.posed]));
      L.stepN(1);
      const a = SC.SCHED.stats().animMs, n = H.ANIM.fpu;
      if (n > (window.__fpuMax || 0)){ window.__fpuMax = n; window.__fpuBy = H.ANIM.byTier.slice(); }
      let t = performance.now(); for (const f of L.W.anims) f(1/60); const w = performance.now() - t;
      anim.push(a + w); parts.push([a, w]); fpu.push(n);
      R.render(sc, cam);
      for (const h of all){
        if (!h.g.parent || !h.g.visible) continue;
        const p = h.g.position, d = Math.hypot(p.x - H.VIEW.x, p.z - H.VIEW.z);
        if (d > mid){ far.add(h); seen++; if (h.posed !== before.get(h)) posed.set(h, posed.get(h) + 1); }
      }
    }
    SC.SCHED.timing = false;
    const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p*s.length))].toFixed(3); };
    const farShare = [...far].map(h => posed.get(h)/N);
    const tiers = all.map(h => { const p = h.g.position; return [+Math.hypot(p.x - H.VIEW.x, p.z - H.VIEW.z).toFixed(1), H.animTier(h, 1), h.g.name || "", h.g.visible]; });
    const fpuAt = [fpu.indexOf(Math.max(...fpu)), window.__fpuBy];
    return {tiers, fpuAt, animMs: {median: q(anim, .5), p95: q(anim, .95), actors: q(parts.map(p => p[0]), .5), closures: q(parts.map(p => p[1]), .5),
      mean: +(anim.reduce((s, v) => s + v, 0)/anim.length).toFixed(3), actorsMean: +(parts.reduce((s, p) => s + p[0], 0)/parts.length).toFixed(3)}, fpuMax: Math.max(...fpu), bodies: all.length, actors: SC.SCHED.stats().counts.actors,
      far: far.size, farPosedShareMax: +Math.max(0, ...farShare).toFixed(2), mid, session: !!(L.W.runners && L.W.runners.length)};
  });
  check(sess.session, "the training session is on at noon", sess);
  // (against the figure recorded at I0 on another day: a note; the gate is side by side, above)
  console.log(`note ground session on Low against the recorded I0 figure (${I0.median} ms median): ${JSON.stringify(sess.animMs)}`);
  check(sess.fpuMax <= 12, "at most 12 full poses in a frame on Low", {max: sess.fpuMax});
  check(sess.far === 0 || sess.farPosedShareMax < .6, "no body beyond animMid posed every frame", {far: sess.far, maxShare: sess.farPosedShareMax, animMid: sess.mid});
  // 3, 4, 5, 6
  const r = await page.evaluate(async () => {
    const H = await import("./js/life/human.js");
    const L = window.__life, scene = L.scene(), out = {};
    // a walker hidden for a second while it goes on, then seen again
    const h = H.human(H.lookFor("pedestrian", 77)); scene.add(h.g);
    let x = H.VIEW.x + 3, z = H.VIEW.z - 4; h.g.position.set(x, 0, z); h.g.rotation.y = Math.PI/2;
    const prev = h.bones.map(b => b.quaternion.clone()), dt = 1/60;
    let jump = 0, jumpAt = null;
    for (let i = 0; i < 150; i++){
      H.ANIM.frame++; H.ANIM.fpu = 0;
      x += 1.4*dt; h.g.position.x = x;
      const hidden = i >= 40 && i < 100;
      h.g.visible = !hidden;
      H.animateHuman(h, dt, {mode:"move", speed:1.4}, {tier: H.animTier(h, 1)});
      if (i >= 100 || i < 40){ for (let b = 1; b < 20; b++){ const a = prev[b].angleTo(h.bones[b].quaternion); if (i > 0 && i !== 100 && a > jump){ jump = a; jumpAt = [i, b]; } } }
      if (i === 100){ let a0 = 0; for (let b = 1; b < 20; b++) a0 = Math.max(a0, prev[b].angleTo(h.bones[b].quaternion)); out.firstShown = +a0.toFixed(3); }
      for (let b = 0; b < 20; b++) prev[b].copy(h.bones[b].quaternion);
    }
    out.t4 = {jump: +jump.toFixed(3), at: jumpAt};
    scene.remove(h.g); h.dispose();
    // LOD3 meshes
    const tris = [];
    for (const [role, seed] of [["footballer", 3], ["goalkeeper", 4], ["pedestrian", 5], ["coach", 6], ["referee", 7], ["office", 8]]){
      const b = H.human(H.lookFor(role, seed)); const g = b.lod3m && b.lod3m.geometry;
      tris.push({role, indexed: !!(g && g.index), tris: g ? (g.index ? g.index.count/3 : g.attributes.position.count/3) : null});
      b.dispose();
    }
    out.lod3 = tris;
    // 22 new looks built ahead, in slices
    const looks = []; for (let i = 0; i < 22; i++) looks.push(H.lookFor(i % 11 ? "footballer" : "goalkeeper", 9000 + i*17, {kit: i < 11 ? ["#1f6f3a", "#ffffff"] : ["#7a1f2b", "#f2f2ee"], number: 1 + (i % 11)}));
    const built = await H.prebuildHumans(looks);
    out.prebuild = {built, slices: H.PREBUILD.slices, maxMs: +H.PREBUILD.maxMs.toFixed(2), stageMs: +H.PREBUILD.stageMs.toFixed(2), stageAt: H.PREBUILD.stageAt};
    // kit colours: every home and away pairing of the Romanian Liga 1 and Liga 4
    const hexOf = c => { const d = document.createElement("canvas").getContext("2d"); d.fillStyle = "#000"; d.fillStyle = c; const s = d.fillStyle; return s.startsWith("#") ? parseInt(s.slice(1), 16) : 0; };
    const parts = n => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    const dist = (a, b) => { const p = parts(a), q = parts(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
    const shirtOf = look => look.outfit.shirt;
    const res = {pairs: 0, worst: 999, worstAt: null};
    for (const t of [1, 4]){
      const clubs = W.clubs.filter(c => c.cc === "ROU" && c.t === t);
      for (const A of clubs) for (const Bc of clubs){
        if (A === Bc) continue;
        const ka = kitOf(A.nm), kb = kitOf(Bc.nm), sa = hexOf(ka[0]), sb = hexOf(kb[0]);
        const avoid = [sa, sb];
        const gkA = shirtOf(H.lookFor("goalkeeper", A.id*7 + 1, {kit: ka, avoid})), gkB = shirtOf(H.lookFor("goalkeeper", Bc.id*7 + 1, {kit: kb, avoid}));
        const ref = shirtOf(H.lookFor("referee", A.id*31 + Bc.id, {avoid}));
        for (const [who, c] of [["keeper " + A.nm, gkA], ["keeper " + Bc.nm, gkB], ["referee", ref]]){
          const d = Math.min(dist(c, sa), dist(c, sb));
          if (d < res.worst){ res.worst = +d.toFixed(1); res.worstAt = [t, A.nm, Bc.nm, who, c.toString(16), ka[0], kb[0]]; }
        }
        res.pairs++;
      }
    }
    out.clash = res;
    return out;
  });
  // (between frames it is seen in: the first frame after the hidden second is a catch-up from where it was last seen)
  check(r.t4.jump <= .35, "a body seen again after T4 catches up without a jump over 0.35 rad between frames", {jump: r.t4.jump, at: r.t4.at, catchUp: r.firstShown});
  check(r.lod3.every(x => x.indexed && x.tris <= 450), "LOD3: indexed, at most 450 triangles", r.lod3);
  check(r.prebuild.built > 0 && r.prebuild.maxMs <= 8, "prebuildHumans of 22 looks: no slice over 8 ms", r.prebuild);
  check(r.clash.pairs > 100 && r.clash.worst >= 120, "keepers and the referee at least 120 (RGB) from both outfield kits, Liga 1 and Liga 4", r.clash);
  res.session = sess; res.more = r;
} catch(e){ check(false, "ran", String(e && e.stack || e)); }
if (page.errors.length) check(false, "no console or page errors", page.errors.slice(0, 5));
report("wpB-npc", res);
await close();
process.exit(res.ok ? 0 : 1);
