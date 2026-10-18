// qa/tr3-leak.mjs: nothing piles up across places and Training sessions, and nothing is drawn under Training's own
// opaque sheets while every reveal still works (browser).
//   - 10 home/ground round trips: renderer.info textures and geometries back to the first trip's figures (+0): the
//     batched meshes' own data textures are disposed with their place (perf-1);
//   - meshes the merge has seen that are no longer in the scene: 0 (perf-2, MG.still and MG.items pruned);
//   - 10 Training enter/exit cycles: renderer.info textures and geometries back to the first cycle's (+0), and the
//     scheduler's tasks, the window's listeners and the DOM back to theirs;
//   - perf-4: with screenCover(true, 'test') up and no reveal pending, renderer.info.render.frame does not advance over
//     120 frames, and it does again on the first frame after screenCover(false, 'test'); a revealAfterFrames(2) started
//     while the overlay is up still resolves within 3 frames; with no overlay, a revealAfterFrames(2) under the full
//     black fade resolves after exactly 2 drawn frames, as on the base.
// Owner: P3-A (Training Mode, Phase 3). Contract: BUILD-PLAN P3-A acceptance "qa/tr3-leak.mjs" (perf-1, perf-2, perf-4).
//
//   QA_PORT=8860 node qa/tr3-leak.mjs        exits 1 on any failed check; writes qa/out/tr3-leak.json
import {launch, career, freeze, report} from "./lib.mjs";

const res = {name: "tr3-leak", checks: [], ok: true, rows: {}};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};
// listeners added to window and document, counted from the page's first script on
async function countListeners(context){
  await context.addInitScript(() => {
    // (live listeners by target and type: an add of one already there, or a remove of one not there, changes nothing)
    const live = window.__listeners = new Map();
    const key = (t, type, fn, o) => { const c = typeof o === "boolean" ? o : !!(o && o.capture); return [t === window ? "window" : "document", type, c ? "c" : "b"]; };
    for (const T of [Window.prototype, Document.prototype]){
      const a = T.addEventListener, r = T.removeEventListener;
      T.addEventListener = function(type, fn, o){
        const k = key(this, type, fn, o).join(":"); let set = live.get(k); if (!set) live.set(k, set = new Set()); set.add(fn);
        return a.apply(this, arguments);
      };
      T.removeEventListener = function(type, fn, o){
        const k = key(this, type, fn, o).join(":"), set = live.get(k); if (set) set.delete(fn);
        return r.apply(this, arguments);
      };
    }
  });
}
const sample = page => page.evaluate(() => {
  const L = window.__life, r = L.renderer();
  return {tex: r.info.memory.textures, geo: r.info.memory.geometries, zone: L.LIFE.zone};
});

/* ---------- home and ground: the batched meshes' textures (perf-1) and the merge's books (perf-2) ---------- */
{
  const {page, close, errors} = await launch({gfx: "low", seed: 4});
  try {
    await career(page, {zone: "ground"});
    await freeze(page);
    const rows = [];
    for (let i = 0; i < 10; i++){
      for (const z of ["home", "ground"]){
        await page.evaluate(z => { const L = window.__life; L.enterZone(z); L.stepN(3); L.renderer().render(L.scene(), L.cam); }, z);
        rows.push(Object.assign({trip: i + 1}, await sample(page)));
      }
    }
    res.rows.zones = rows;
    const h = rows.filter(r => r.zone === "home"), g = rows.filter(r => r.zone === "ground");
    check(h[9].tex === h[0].tex && h[9].geo === h[0].geo, "10 home round trips: textures and geometries back to the first trip's (+0)", {first: h[0], last: h[9]});
    check(g[9].tex === g[0].tex && g[9].geo === g[0].geo, "10 ground round trips: textures and geometries back to the first trip's (+0)", {first: g[0], last: g[9]});
    // the merge: a mesh seen moving, then taken out of the scene, is forgotten at the next scan
    const mg = await page.evaluate(() => {
      const L = window.__life;
      // a copy of a mesh the merge has taken (so one it would take), moving: the merge's scans keep seeing it move
      const src = [...L.MG.items.keys()].find(o => o.parent === L.scene());
      const m = src ? src.clone() : null;
      if (!m) return {skip: true};
      m.layers.set(0);
      L.scene().add(m);
      for (let i = 0; i < 4; i++){ m.position.x += .5; m.updateMatrixWorld(); L.stepN(320); }
      const seen = L.MG.still.has(m) || L.MG.items.has(m);
      L.scene().remove(m);
      L.stepN(320);
      const inScene = o => { for (let p = o; p; p = p.parent) if (p === L.scene()) return true; return false; };
      let out = 0;
      for (const o of L.MG.still.keys()) if (!inScene(o)) out++;
      for (const o of L.MG.items.keys()) if (!inScene(o)) out++;
      return {seen, out, still: L.MG.still.size, items: L.MG.items.size};
    });
    check(!mg.skip && mg.seen && mg.out === 0, "a moving mesh the merge has seen, once out of the scene, is forgotten: none outside the scene", mg);
    check(errors.length === 0, "home and ground: no console or page error", errors.slice(0, 3));
  } finally { await close(); }
}

/* ---------- 10 Training enter/exit cycles ---------- */
{
  const {page, close, errors, context} = await launch({gfx: "low", seed: 6});
  try {
    await countListeners(context);
    await page.reload();
    await page.waitForFunction(() => typeof window.__life === "object" && document.readyState !== "loading", null, {timeout: 120000});
    const rows = [];
    for (let i = 0; i < 10; i++){
      await page.evaluate(async () => { const m = await import("/js/life/train/sandbox.js"); await m.enterTraining({kind: "full"}); });
      await page.waitForFunction(() => window.__life.LIFE.zone === "cage" && window.__life.presented > 0, null, {timeout: 60000});
      const inside = await sample(page);
      await page.evaluate(() => import("/js/life/train/sandbox.js").then(m => m.exitTraining()));
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => {
        const L = window.__life, r = L.renderer(), S2 = L.sched;
        const tasks = S2 && S2.tasks ? (S2.tasks.size != null ? S2.tasks.size : S2.tasks.length) : null;
        return {tex: r.info.memory.textures, geo: r.info.memory.geometries, nodes: document.getElementsByTagName("*").length,
          listeners: window.__listeners ? [...window.__listeners.values()].reduce((t, x) => t + x.size, 0) : null,
          byType: window.__listeners ? Object.fromEntries([...window.__listeners].map(([k, v]) => [k, v.size])) : null, tasks, spots: L.spots.length, solids: L.solids.length, running: L.LIFE.running};
      });
      rows.push({cycle: i + 1, inside, after});
    }
    res.rows.training = rows;
    const a = rows[0], z = rows[9];
    check(z.inside.tex === a.inside.tex && z.inside.geo === a.inside.geo, "10 Training cycles: textures and geometries in the cage back to the first cycle's (+0)", {first: a.inside, last: z.inside});
    check(z.after.tex === a.after.tex && z.after.geo === a.after.geo, "and on the title after each exit (+0)", {first: a.after, last: z.after});
    // The title's own start handler (ui/main.js titleIntro: a capture keydown on window) is added again each time the
    // title is drawn and only goes when a key is pressed on it; P3-B's TITLE_OFF (BUILD-PLAN P3-B work item 1) takes
    // it down. It is counted apart, so this check is about what the sandbox itself adds
    const TITLE = "window:keydown:c", grew = {};
    for (const k of new Set([...Object.keys(a.after.byType), ...Object.keys(z.after.byType)])){ const d = (z.after.byType[k] || 0) - (a.after.byType[k] || 0); if (d) grew[k] = d; }
    const own = Object.entries(grew).filter(([k]) => k !== TITLE);
    check(own.length === 0, "window and document listeners: +0 over 10 cycles (the title's own start handler apart)", {grew});
    res.titleListener = {grew: grew[TITLE] || 0, note: "ui/main.js titleIntro adds a window keydown (capture) per title render: P3-B TITLE_OFF"};
    check(z.after.nodes === a.after.nodes, "DOM nodes: +0 over 10 cycles", {first: a.after.nodes, last: z.after.nodes});
    check(z.after.tasks === a.after.tasks && !z.after.running && z.after.spots === 0, "scheduled tasks back, the loop stopped, no spot left", {first: a.after, last: z.after});
    check(errors.length === 0, "Training cycles: no console or page error", errors.slice(0, 3));
  } finally { await close(); }
}

/* ---------- perf-4: nothing drawn under Training's own overlay, every reveal still resolves ---------- */
{
  const {page, close, errors} = await launch({gfx: "low", seed: 7});
  try {
    await page.evaluate(() => import("/js/life/train/sandbox.js").then(m => m.enterTraining({kind: "onegoal"})));
    await page.waitForFunction(() => window.__life.LIFE.zone === "cage" && window.__life.presented > 2, null, {timeout: 60000});
    await page.waitForTimeout(800);                // the entry's own reveal has resolved
    const r = await page.evaluate(() => new Promise(done => {
      const L = window.__life, info = L.renderer().info.render, out = {};
      const frames = () => L.frames;
      const waitFrames = n => new Promise(res => { const f0 = frames(); const tick = () => frames() - f0 >= n ? res() : requestAnimationFrame(tick); requestAnimationFrame(tick); });
      (async () => {
        out.pendingBefore = L.revealPending();
        L.screenCover(true, "test");
        await waitFrames(2);
        const r0 = info.frame, p0 = L.presented, f0 = frames();
        await waitFrames(120);
        out.coveredFrames = frames() - f0; out.renderAdvance = info.frame - r0; out.presentedAdvance = L.presented - p0;
        // a reveal started under the overlay
        const f1 = frames(); let at = -1;
        const rev = L.modes.revealAfterFrames(2).then(() => { at = frames() - f1; });
        await waitFrames(6); await rev;
        out.revealUnder = at;
        out.renderDuringReveal = info.frame - r0 - out.renderAdvance;
        // back to drawing nothing under the overlay once the reveal is done
        const r2 = info.frame; await waitFrames(20); out.afterRevealAdvance = info.frame - r2;
        L.screenCover(false, "test");
        const r3 = info.frame; await waitFrames(1); out.afterOff = info.frame - r3;
        // no overlay: a reveal under the full fade resolves after exactly two drawn frames
        const p4 = L.presented; let drawnAt = -1;
        const rev2 = L.modes.revealAfterFrames(2).then(() => { drawnAt = L.presented - p4; });
        out.fadeV = L.FADE.v;
        await rev2; out.revealFade = drawnAt;
        L.FADE.v = 0; const fe = document.getElementById("lifeFade"); if (fe) fe.style.opacity = "0";
        done(out);
      })();
    }));
    res.rows.perf4 = r;
    check(r.coveredFrames >= 120 && r.renderAdvance === 0 && r.presentedAdvance === 0, "screenCover up, no reveal pending: 120 frames lived, none drawn", r);
    check(r.revealUnder >= 0 && r.revealUnder <= 3, "a revealAfterFrames(2) started under the overlay resolves within 3 frames", r.revealUnder);
    check(r.afterRevealAdvance === 0, "and once it has, nothing is drawn under the overlay again", r.afterRevealAdvance);
    check(r.afterOff >= 1, "the first frame after screenCover(false) is drawn", r.afterOff);
    check(r.fadeV >= .98 && r.revealFade === 2, "no overlay: a reveal under the full black fade resolves after exactly 2 drawn frames", {fade: r.fadeV, drawn: r.revealFade});
    check(errors.length === 0, "perf-4: no console or page error", errors.slice(0, 3));
    await page.evaluate(() => import("/js/life/train/sandbox.js").then(m => m.exitTraining()));
  } finally { await close(); }
}

report("tr3-leak", res);
console.log(`${res.checks.filter(c => c.pass).length}/${res.checks.length} checks pass`);
process.exit(res.ok ? 0 : 1);
