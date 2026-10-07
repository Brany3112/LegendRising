// qa/wpA-sched.mjs: WP-A acceptance for the update scheduler's tiers (core/sched.js SCHED).
// Owner: WP-A (DESIGN 1.4.3, 3.9.4, 2.3 WP-A).
//
// Actors placed round the camera on Low (animNear 12, animMid 35, hiddenHz 5, staticHz 5), out on your street:
//   tiers   5 m ahead T1, 25 m ahead T2, 60 m ahead T3, 6 m behind T4; a match body 5 m ahead T0 and 60 m ahead
//           never slower than T2; your own body T0; a body hidden behind a wall T4 (one cached ray)
//   rates   over 2 s at 60 fps: T1 thinks every frame, T2 at 10 Hz, T3 at 5 Hz, T4 at hiddenHz; a static actor is
//           posed at staticHz while in view and asked when() once a second
//   cover   with the screen covered (the fade, or an opaque overlay through screenCover) every actor is T4
//
//   QA_PORT=8772 node qa/wpA-sched.mjs        writes qa/out/wpA-sched.json
import {launch, career, freeze, expect, report} from "./lib.mjs";

const out = {checks: [], ok: true};
const check = (name, ok, detail) => { out.checks.push({name, ok: !!ok, detail}); if (!ok) out.ok = false; console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail !== undefined ? ": " + JSON.stringify(detail) : ""}`); };

const {page, close, errors} = await launch({gfx: "low", seed: 4});
try {
  await career(page, {zone: "home", min: 12*60});
  await freeze(page);
  const r = await page.evaluate(async () => {
    const L = __life, {SCHED} = await import("./js/life/core/sched.js");
    L.FADE.v = 0; L.FADE.boot = false;
    for (const k in L.keys) L.keys[k] = false;
    // out on the street, looking east along it (yaw -pi/2 faces +x)
    L.place({x: -20, z: 4.6, y: .12, yaw: -Math.PI/2}); L.P.pitch = 0;
    L.stepN(5); L.renderer().render(L.scene(), L.cam);
    const P = L.P, fx = 1, fz = 0, A = {};
    const mk = (id, ahead, side, kind = "npc", extra = {}) => {
      const pos = {x: P.x + fx*ahead + fz*side, y: P.feet, z: P.z + fz*ahead - fx*side};
      const c = A[id] = {think: 0, anim: 0, tiers: [], when: 0};
      return SCHED.actor(Object.assign({id, kind, pos: () => pos, think: () => { c.think++; }, anim: (dt, tier) => { c.anim++; c.tiers.push(tier); }}, extra));
    };
    const hs = [mk("near", 5, 0), mk("mid", 25, 0), mk("far", 60, 0), mk("behind", -6, 0), mk("matchNear", 5, .5, "match"), mk("matchFar", 60, .5, "match"),
      mk("me", 0, 0, "me"), mk("static", 7, 0, "static", {when: () => { A.static.when++; return true; }})];
    L.stepN(120);
    const res = {tiers: {}, think: {}, anim: {}};
    hs.forEach(h => { res.tiers[h.id] = SCHED.tierOf(h); res.think[h.id] = A[h.id].think; res.anim[h.id] = A[h.id].anim; });
    res.when = A.static.when;
    // covered: every actor T4
    for (const id in A) A[id].tiers.length = 0;
    L.FADE.v = 1; L.stepN(10); L.FADE.v = 0;
    res.covered = Object.keys(A).filter(id => A[id].tiers.length).map(id => A[id].tiers[A[id].tiers.length - 1]);
    // an opaque overlay says so (quality.js screenCover): the same
    const Qm = await import("./js/life/core/quality.js");
    for (const id in A) A[id].tiers.length = 0;
    Qm.screenCover(true, "qa"); L.stepN(10);
    res.overlay = {covered: Qm.isScreenCovered(), tiers: Object.keys(A).filter(id => A[id].tiers.length).map(id => A[id].tiers[A[id].tiers.length - 1])};
    Qm.screenCover(false, "qa"); res.overlay.after = Qm.isScreenCovered();
    for (const h of hs) SCHED.remove(h);
    // occlusion: a body 4 m behind the bedroom wall you face
    L.enterZone("home", "bed"); L.FADE.v = 0; L.stepN(5); L.renderer().render(L.scene(), L.cam);
    const C = await import("./js/life/core/collide.js"), yaw = P.yaw, dx = -Math.sin(yaw), dz = -Math.cos(yaw);
    const wall = C.camCast(P.x, P.eye, P.z, dx, 0, dz, 30);
    const at = {x: P.x + dx*(wall + 4), y: P.feet, z: P.z + dz*(wall + 4)};
    const oc = {tiers: []};
    const h = SCHED.actor({id: "occluded", kind: "npc", pos: () => at, anim: (dt, t) => oc.tiers.push(t)});
    L.stepN(90);
    SCHED.remove(h);
    res.occluded = {wall: +wall.toFixed(2), last: oc.tiers.slice(-5)};
    return res;
  });
  out.result = r;
  const t = r.tiers;
  check("tiers by distance and view", t.near === 1 && t.mid === 2 && t.far === 3 && t.behind === 4, t);
  check("match bodies: T0 near, never slower than T2 in view", t.matchNear === 0 && t.matchFar === 2, {near: t.matchNear, far: t.matchFar});
  check("your own body is T0", t.me === 0, t.me);
  const th = r.think;
  // 120 frames = 2 s
  check("T1 thinks every frame", th.near >= 118, th.near);
  check("T2 thinks at 10 Hz", th.mid >= 17 && th.mid <= 22, th.mid);
  check("T3 thinks at 5 Hz", th.far >= 8 && th.far <= 12, th.far);
  check("T4 thinks at hiddenHz (5 on Low)", th.behind >= 8 && th.behind <= 12, th.behind);
  check("static: posed at staticHz in view, when() once a second", r.anim.static >= 8 && r.anim.static <= 12 && r.when >= 2 && r.when <= 3, {anim: r.anim.static, when: r.when});
  check("covered: every actor is T4", r.covered.length > 0 && r.covered.every(x => x === 4), r.covered);
  check("an opaque overlay (screenCover) covers like the fade, and lifts", r.overlay.covered && !r.overlay.after && r.overlay.tiers.length > 0 && r.overlay.tiers.every(x => x === 4), r.overlay);
  check("a body behind a wall is T4", r.occluded.last.length > 0 && r.occluded.last.every(x => x === 4), r.occluded);
  check("no errors", errors.length === 0, errors.slice(0, 5));
} finally { await close(); }
report("wpA-sched", out);
console.log(out.ok ? "wpA-sched: pass" : "wpA-sched: FAIL");
expect(out.ok, "wpA-sched failed");
