// qa/wpH2-ball.mjs: the football in your flat is a real ball (DESIGN 3.8.1, 2.4 WP-H2 acceptance "apartment ball").
// Owner: WP-H2 (Stage 2).
//
//   node qa/wpH2-ball.mjs        exits 1 on any failed check, console error or page error; writes qa/out/wpH2-ball.json
//                                and screenshots qa/out/wpH2-ball-*.png
//
// A career past the film stands in its flat with the football lying where it came to rest. Through the game's own
// input (the view turned at things, the left button, E, 1, G, W) the ball is picked up, refused by a pocket, carried,
// put down with G, kicked with E into a wall, into the fridge and into the open door leaf, walked into (it rolls off
// your feet), dropped onto the flat's floor, the stair landing and the lobby floor (resting on each), and reloaded
// where it rested. The ball the film sends in through the window bounces in and rolls to rest with no pop: every
// frame it moves no further than its speed allows (|v| dt + 1 cm). Every ball step goes through football/ball.js.
import {launch, snap, report, freeze, CAREER_AT} from "./lib.mjs";

const out = {checks: [], ok: false};
const check = (what, ok, detail) => { out.checks.push({what, ok: !!ok, detail}); console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${detail !== undefined ? "  " + JSON.stringify(detail).slice(0, 300) : ""}`); };
const {page, close} = await launch({gfx: "low", seed: 21});

async function botInit(){
  await page.evaluate(async () => {
    const [home, inv, hand, furn, coll, modes] = await Promise.all(["home", "inv", "core/hand", "furniture", "core/collide", "core/modes"].map(m => import(`./js/life/${m}.js`)));
    const L = window.__life, P = L.P, LH = 3.2, R = .11;
    const cv = document.getElementById("lifeCanvas");
    Object.defineProperty(document, "pointerLockElement", {configurable: true, get: () => cv});
    const B = window.__bot = {
      home, inv, hand, furn, coll, modes, P, R, ev: [],
      step(n = 2){ return L.stepN(n, 1/60); },
      place(x, y, z, yaw = P.yaw){ L.place({x, y, z, yaw}); B.step(3); },
      aim(x, y, z){ const dx = x - P.x, dz = z - P.z; P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(y - P.eye, Math.max(.05, Math.hypot(dx, dz))); B.step(2); return L.held ? L.held.label : null; },
      key(k, hold = 2){ dispatchEvent(new KeyboardEvent("keydown", {key: k, bubbles: true})); B.step(hold); dispatchEvent(new KeyboardEvent("keyup", {key: k, bubbles: true})); B.step(2); },
      click(){ dispatchEvent(new MouseEvent("mousedown", {button: 0, bubbles: true})); B.step(1); dispatchEvent(new MouseEvent("mouseup", {button: 0, bubbles: true})); B.step(2); },
      flat(){ const h = S.home, A = home.APT[h.door]; return {h, A, base: h.floor*LH}; },
      live(){ return window.__balls.list[0] || null; },
      ballDrop(){ return (S.drops || []).find(d => d.item && d.item.id === "ball") || null; },
      floorAt(x, y, z){ return coll.surfaceUnder(x, y, z); },
      // the ball's events (bounce, wall, touch) from the life ball world
      listen(){ const bw = window.__balls.world; if (bw.__qa) return; const f = bw.onEvent; bw.onEvent = (t, d) => { B.ev.push({t, x: d.x, y: d.y, z: d.z, speed: d.speed || d.vy || 0}); f(t, d); }; bw.__qa = true; },
      // the live ball stepped frame by frame until it sleeps: the worst excess of a frame's move over |v| dt + 1 cm
      settle(maxSec = 14, watch = null){
        const e = B.live(); if (!e) return {ok: false};
        let worst = -1, frames = 0, path = [];
        for (let i = 0; i < maxSec*60; i++){
          const b = e.b, x0 = b.p.x, y0 = b.p.y, z0 = b.p.z, v0 = Math.hypot(b.v.x, b.v.y, b.v.z);
          B.step(1); frames++;
          const v1 = Math.hypot(b.v.x, b.v.y, b.v.z), d = Math.hypot(b.p.x - x0, b.p.y - y0, b.p.z - z0);
          worst = Math.max(worst, d - (Math.max(v0, v1)/60 + .01));
          if (watch) watch(b);
          if (i % 10 === 0) path.push([+b.p.x.toFixed(2), +b.p.y.toFixed(2), +b.p.z.toFixed(2)]);
          if (b.sleep && i > 5) break;
        }
        const b = e.b, f = B.floorAt(b.p.x, b.p.y - R, b.p.z);
        return {ok: true, worst: +worst.toFixed(4), frames, sleep: b.sleep, p: [+b.p.x.toFixed(3), +b.p.y.toFixed(3), +b.p.z.toFixed(3)], floor: f == null ? null : +f.toFixed(3), onFloor: f != null && Math.abs(b.p.y - R - f) < .012, path: path.slice(-6)};
      },
      // a fresh football lying in this zone (as G would leave one) let go at `at`
      spawn(at){
        for (const d of (S.drops || []).filter(d => d.item && d.item.id === "ball")){ const sp = L.spots.find(s => s.drop === d); if (sp) sp.pick(); }
        const d = {zone: L.LIFE.zone, x: at.x, y: at.y, z: at.z, ry: 0, item: {id: "ball"}};
        inv.addDrop(d);
        return hand.dropSpot(d, inv.itemMesh(d.item), at);
      }
    };
  });
}
const ev = f => page.evaluate(f);

try {
  // a career past the film, in its flat, the football lying where it came in
  await page.evaluate(now => {
    const real = Date.now; Date.now = () => now;
    try {
      careerShell();
      applyCreation({name: "Andrei Popa", number: 9, pos: "ST", pref: "ST", foot: "Right", nat: "RO", alloc: Object.fromEntries(SKILLS.map(([k]) => [k, 0])), pts: 30});
      document.body.classList.add("life");
      A.sign(0);
    } finally { Date.now = real; }
    for (const k in S.flags) S.flags[k] = true; S.tutDone = true; S.onb = {v: 2, step: "done", seen: {}};
    S.home.win = {state: "broken", at: absNow()}; S.home.ballPending = true; S.home.ballGiven = false;
    S.life.min = 12*60;
    window.startLife({zone: "home", at: {x: -9.5, z: 5.3, y: .12, yaw: 0}});
  }, CAREER_AT);
  await page.waitForFunction(() => window.__life.presented >= 2, null, {timeout: 120000});
  await freeze(page);
  await botInit();
  await ev(() => __bot.listen());

  // the football lies in the flat as a live ball, asleep on the floor
  let r = await ev(() => { const B = __bot, {A, base} = B.flat(), d = B.ballDrop(), e = B.live();
    B.place(A.door + .2, base + .02, A.wz + A.s*1.4, A.s > 0 ? Math.PI : 0); B.step(10);
    const f = e && B.floorAt(e.b.p.x, e.b.p.y - B.R, e.b.p.z);
    return {drop: !!d, live: !!e, sleep: e && e.b.sleep, y: e && +e.b.p.y.toFixed(3), floor: f, base, inFlat: e && e.b.p.x > A.x0 && e.b.p.x < A.x1}; });
  check("the football lying in the flat is a live ball, at rest on the floor", r.drop && r.live && r.sleep && r.inFlat && r.floor != null && Math.abs(r.y - .11 - r.floor) < .012, r);

  // aimed at: "Football", "Left click to pick it up · E to kick it"
  r = await ev(() => { const B = __bot, {A} = B.flat(), e = B.live(); B.place(e.b.p.x + .5, e.b.p.y - .11 + .02, e.b.p.z - A.s*.8); const l = B.aim(e.b.p.x, e.b.p.y, e.b.p.z); B.step(3);
    return {label: l, prompt: (document.getElementById("lifePrompt") || {}).textContent || ""}; });
  check("aimed at, it says 'Football' and 'Left click to pick it up · E to kick it'", r.label === "Football" && /Left click to pick it up · E to kick it/.test(r.prompt), r);
  await snap(page, "wpH2-ball-floor");

  // pick it up: in both hands; nothing lying about any more
  r = await ev(() => { const B = __bot; B.click(); B.step(4); return {hand: B.inv.hand() && B.inv.hand().id, drops: (S.drops || []).filter(d => d.item.id === "ball").length, live: window.__balls.list.length}; });
  check("left click picks it up: in your hands, no longer on the floor", r.hand === "ball" && r.drops === 0 && r.live === 0, r);

  // it will not go in a pocket
  r = await ev(() => { const B = __bot; B.key("1"); B.step(3); return {hand: B.inv.hand() && B.inv.hand().id, slots: B.inv.carry().slots.map(x => x && x.id), note: document.getElementById("lifeNote").textContent}; });
  check("1 will not pocket it: 'That won't fit in a pocket. ...'", r.hand === "ball" && !r.slots[0] && /won't fit in a pocket/.test(r.note), r);

  // carried across the flat, held in front of you
  r = await ev(() => { const B = __bot, {A, base} = B.flat(); B.place((A.x0 + A.x1)/2, base + .02, (A.wz + A.ext)/2); B.step(6);
    let held = null; __life.scene().traverse(o => { if (o.userData && o.userData.item === "ball" && o.visible) held = o; });
    return {hand: B.inv.hand() && B.inv.hand().id, held: !!held}; });
  check("carried: still in your hands, drawn in front of you", r.hand === "ball" && r.held, r);
  await snap(page, "wpH2-ball-carried");

  // G puts it down: a live ball again, tossed, bouncing, at rest on the floor, no pop
  r = await ev(() => { const B = __bot, had = B.inv.hand() && B.inv.hand().id; B.P.pitch = -.2; B.key("g", 1); const e = B.live(), v0 = e ? Math.hypot(e.b.v.x, e.b.v.y, e.b.v.z) : 0; const s = B.settle(); s.had = had; s.v0 = +v0.toFixed(2); s.hand = B.inv.hand(); s.drops = (S.drops || []).filter(d => d.item.id === "ball").length; return s; });
  check("G puts it down: tossed, it bounces and comes to rest on the flat's floor", r.ok && r.had === "ball" && r.v0 > 2 && r.sleep && r.onFloor && r.hand === null && r.drops === 1, r);
  check("  and never moves further in a frame than its speed allows (|v| dt + 1 cm)", r.worst <= 0, r.worst);
  r = await ev(() => { const B = __bot, d = B.ballDrop(), e = B.live(); return {d: [d.x, d.y, d.z], b: [+e.b.p.x.toFixed(3), +e.b.p.y.toFixed(3), +e.b.p.z.toFixed(3)]}; });
  check("  at rest, its drop holds where it lies (what a save keeps)", Math.hypot(r.d[0] - r.b[0], r.d[1] - r.b[1], r.d[2] - r.b[2]) < .002, r);

  // E further than 1.1 m: "Get closer to kick it."
  r = await ev(() => { const B = __bot, e = B.live(), b = e.b; B.place(b.p.x + 1.7, b.p.y - .11 + .02, b.p.z); B.aim(b.p.x, b.p.y, b.p.z); const x0 = b.p.x; B.key("e"); return {note: document.getElementById("lifeNote").textContent, moved: Math.abs(b.p.x - x0)}; });
  check("E from 1.7 m: 'Get closer to kick it.' and the ball stays put", r.note === "Get closer to kick it." && r.moved < .001, r);

  // E kicks it into a wall: it comes off it and stays in the flat
  r = await ev(() => {
    const B = __bot, {A, base} = B.flat(), cz = A.wz + A.s*1.2;
    const e = B.spawn({x: (A.x0 + A.x1)/2 - .6, y: base + .3, z: cz}); B.settle(4);
    const b = e.b; B.place(b.p.x + .55, base + .02, b.p.z, Math.PI/2); B.aim(b.p.x, b.p.y, b.p.z);
    B.ev.length = 0; let minX = 99; const x0 = b.p.x;
    B.key("e", 1); const kv = Math.hypot(b.v.x, b.v.z); const s = B.settle(10, b => { minX = Math.min(minX, b.p.x); }); s.kv = +kv.toFixed(2);
    const wall = B.ev.find(v => v.t === "wall");
    return Object.assign(s, {x0, minX: +minX.toFixed(3), x0wall: A.x0, wall: wall ? [+wall.x.toFixed(2), +wall.z.toFixed(2), +wall.speed.toFixed(2)] : null, back: s.p[0] > minX + .05});
  });
  check("E kicks it along the way you face (4.5 m/s), into the wall: it comes off it", Math.abs(r.kv - 4.5) < .3 && r.wall && r.minX > r.x0wall - .01 && r.back, r);
  check("  and rests on the floor again, no pop", r.sleep && r.onFloor && r.worst <= 0, r);
  await snap(page, "wpH2-ball-kicked");

  // into the fridge
  r = await ev(() => {
    const B = __bot, {base} = B.flat(), q = B.furn.pieceOf("fridge");
    const fx = q.front.x, fz = q.front.z, nx = fx - q.wx, nz = fz - q.wz, nl = Math.hypot(nx, nz) || 1, ux = nx/nl, uz = nz/nl;
    const e = B.spawn({x: fx + ux*.9, y: base + .3, z: fz + uz*.9}); B.settle(4);
    const b = e.b; B.place(b.p.x + ux*.5, base + .02, b.p.z + uz*.5); B.aim(b.p.x, b.p.y, b.p.z);
    B.ev.length = 0; let closest = 99;
    B.key("e", 1); const s = B.settle(10, b => { closest = Math.min(closest, (b.p.x - q.wx)*ux + (b.p.z - q.wz)*uz); });
    const hit = B.ev.find(v => v.t === "wall" && Math.hypot(v.x - fx, v.z - fz) < 1);
    return Object.assign(s, {hit: hit ? [+hit.x.toFixed(2), +hit.z.toFixed(2)] : null, closest: +closest.toFixed(3), front: +Math.hypot(fx - q.wx, fz - q.wz).toFixed(3)});
  });
  // (q.front is where you stand to open it, 0.45 m out from its face)
  check("kicked into the fridge: it bounces off the fridge, never into it", r.hit && r.closest > r.front - .45 + .11 - .02, r);
  check("  and comes to rest on the floor", r.sleep && r.onFloor && r.worst <= 0, r);

  // into the open door leaf of your flat
  r = await ev(() => {
    const B = __bot, {A, base} = B.flat(), door = __life.spots.find(s => s.kind === "drag" && /^Flat \d0\d$/.test(s.label));
    if (!door) return {door: false};
    B.place(A.door + .3, base + .02, A.wz + A.s*1.3); B.step(2);
    for (let i = 0; i < 8 && !(door.edge && door.hinge && (() => { const h = door.hinge(), e = door.edge(); return Math.abs(Math.atan2(e.z - h.z, e.x - h.x)) > .7 && Math.abs(Math.atan2(e.z - h.z, e.x - h.x)) < 2.4; })()); i++){ if (door.toggle) door.toggle(); B.step(90); }
    const h = door.hinge(), ed = door.edge();
    const mx = (h.x + ed.x)/2, mz = (h.z + ed.z)/2, ux = ed.x - h.x, uz = ed.z - h.z, ul = Math.hypot(ux, uz), nx = -uz/ul, nz = ux/ul;
    // the side of the leaf with room in front of it
    let sgn = 1; if (B.coll.camCast(mx + nx*.2, base + .3, mz + nz*.2, nx, 0, nz, 1.3) < 1.2) sgn = -1;
    const px = nx*sgn, pz = nz*sgn;
    const e = B.spawn({x: mx + px*.9, y: base + .3, z: mz + pz*.9}); B.settle(4);
    const b = e.b; B.place(b.p.x + px*.5, base + .02, b.p.z + pz*.5); B.aim(b.p.x, b.p.y, b.p.z);
    B.ev.length = 0; let minS = 99;
    B.key("e", 1); const s = B.settle(10, b => { const along = Math.abs((b.p.x - h.x)*ux/ul + (b.p.z - h.z)*uz/ul - ul/2); if (along < ul/2 - .05) minS = Math.min(minS, (b.p.x - mx)*px + (b.p.z - mz)*pz); });
    const hit = B.ev.find(v => v.t === "wall" && Math.hypot(v.x - mx, v.z - mz) < .9);
    return Object.assign(s, {door: true, angle: +Math.atan2(ed.z - h.z, ed.x - h.x).toFixed(2), hit: hit ? [+hit.x.toFixed(2), +hit.z.toFixed(2)] : null, minS: +minS.toFixed(3)});
  });
  check("kicked into the open door leaf: it bounces off the leaf, never through it", r.door && r.hit && r.minS > 0, r);
  check("  and comes to rest on a floor", r.sleep && r.onFloor && r.worst <= 0, r);

  // walking into it pushes it along: it rolls off your feet, a little faster than you walk
  r = await ev(() => {
    const B = __bot, {A, base} = B.flat();
    const e = B.spawn({x: (A.x0 + A.x1)/2, y: base + .3, z: A.wz + A.s*1.1}); B.settle(4);
    const b = e.b, x0 = b.p.x; B.place(b.p.x + 1.2, base + .02, b.p.z, Math.PI/2); B.P.pitch = -.3;
    dispatchEvent(new KeyboardEvent("keydown", {key: "w", bubbles: true}));
    let maxBall = 0, minGap = 99;
    for (let i = 0; i < 80; i++){ B.step(1); maxBall = Math.max(maxBall, Math.hypot(b.v.x, b.v.z)); minGap = Math.min(minGap, Math.hypot(b.p.x - B.P.x, b.p.z - B.P.z)); }
    dispatchEvent(new KeyboardEvent("keyup", {key: "w", bubbles: true}));
    const s = B.settle(8);
    return Object.assign(s, {moved: +(x0 - b.p.x).toFixed(3), maxBall: +maxBall.toFixed(2), minGap: +minGap.toFixed(3)});
  });
  check("walking into it pushes it along ahead of you", r.moved > .4 && r.maxBall > .5 && r.minGap > .2, r);

  // it rests on the flat floor, the stair landing and the lobby floor (let go from 30 cm up)
  r = await ev(() => {
    const B = __bot, out = {}, {A, base} = B.flat();
    const at = {flat: {x: (A.x0 + A.x1)/2 + .4, y: base + .4, z: (A.wz + A.ext)/2}, landing: {x: -11.0, y: 1.6 + .4, z: -7.9}, lobby: {x: -8.6, y: .27 + .4, z: .4}};
    for (const k in at){ B.place(at[k].x + 1.5, at[k].y - .38, at[k].z); B.spawn(at[k]); const s = B.settle(6); out[k] = {sleep: s.sleep, y: s.p[1], floor: s.floor, onFloor: s.onFloor, worst: s.worst}; }
    return out;
  });
  check("it rests on the flat's floor", r.flat.sleep && r.flat.onFloor && Math.abs(r.flat.floor - (await ev(() => __bot.flat().base))) < .1, r.flat);
  check("it rests on the stair landing", r.landing.sleep && r.landing.onFloor && Math.abs(r.landing.floor - 1.6) < .03, r.landing);
  check("it rests on the lobby floor", r.lobby.sleep && r.lobby.onFloor && Math.abs(r.lobby.floor - .27) < .03, r.lobby);

  // back in the flat, at rest; the page is closed and the career continued: the ball is where it was
  const before = await ev(() => { const B = __bot, {A, base} = B.flat(); B.place(A.door + .2, base + .02, A.wz + A.s*1.4); B.spawn({x: (A.x0 + A.x1)/2 - .3, y: base + .5, z: (A.wz + A.ext)/2 + .2}); B.settle(6); __bot.modes.persist(true); const d = B.ballDrop(); return {x: d.x, y: d.y, z: d.z, n: S.drops.filter(x => x.item.id === "ball").length}; });
  await page.reload();
  await page.waitForFunction(() => typeof window.startLife === "function" && !!window.__life && !!document.querySelector(".slot-main"), null, {timeout: 90000});
  await page.locator(".slot-main").first().click();
  await page.waitForFunction(() => window.__life && window.__life.presented >= 2, null, {timeout: 120000});
  await freeze(page);
  await botInit();
  r = await ev(() => { const B = __bot, d = B.ballDrop(), e = B.live(); B.step(30); return {n: S.drops.filter(x => x.item.id === "ball").length, d: d && [d.x, d.y, d.z], b: e && [+e.b.p.x.toFixed(3), +e.b.p.y.toFixed(3), +e.b.p.z.toFixed(3)], sleep: e && e.b.sleep}; });
  check("after a reload the ball is where it came to rest, once", r.n === 1 && r.b && Math.hypot(r.b[0] - before.x, r.b[2] - before.z) < .01 && Math.abs(r.b[1] - before.y) < .012 && r.sleep, {before, after: r});

  // the film's ball: in through the broken window, bouncing in and rolling to rest without a pop
  r = await ev(() => {
    const B = __bot, {A, base} = B.flat();
    for (const d of (S.drops || []).filter(d => d.item && d.item.id === "ball")){ const sp = __life.spots.find(s => s.drop === d); if (sp) sp.pick(); }
    S.home.ballGiven = false;
    B.place(A.door + .2, base + .02, A.wz + A.s*1.4);
    window.lifeOnboard.ballThrough();
    const e = B.live(), p0 = e && [+e.b.p.x.toFixed(2), +e.b.p.y.toFixed(2), +e.b.p.z.toFixed(2)];
    const s = B.settle(14);
    const z0 = Math.min(A.wz, A.ext), z1 = Math.max(A.wz, A.ext);
    return Object.assign(s, {p0, given: S.home.ballGiven, inFlat: s.p[0] > A.x0 && s.p[0] < A.x1 && s.p[2] > z0 && s.p[2] < z1, onFlatFloor: Math.abs(s.p[1] - .11 - base) < .1});
  });
  check("the film's ball comes in through the window and rolls to rest in the flat", r.ok && r.given && r.sleep && r.inFlat && r.onFloor && r.onFlatFloor, r);
  check("  without a pop: every frame |dp| <= |v| dt + 1 cm", r.worst <= 0, r.worst);
  await snap(page, "wpH2-ball-intro-rest");

  check("no console or page errors", page.errors.length === 0, page.errors.slice(0, 5));
} catch(e){
  check("the run finished", false, String(e && e.stack || e).slice(0, 600));
} finally {
  out.ok = out.checks.every(c => c.ok);
  report("wpH2-ball", out);
  console.log(out.ok ? "wpH2-ball: pass" : "wpH2-ball: FAIL");
  await close();
  process.exit(out.ok ? 0 : 1);
}
