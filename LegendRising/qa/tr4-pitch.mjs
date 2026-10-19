// qa/tr4-pitch.mjs: pitch switching when a scenario starts.
// Owner: P4-B (TR-4). Contract: BUILD-PLAN P4-B acceptance "qa/tr4-pitch.mjs" and work item 6; TRAINING-SPEC 0 (the
// user picks Full, Half or One goal) and 8 (no rebuilt bodies, nothing accumulating).
//
// Three test scenarios whose configurations ask for the Full, Half and One-goal pitch are started from the hub with real
// clicks on their Start buttons, three round trips; each is left with Esc and the pause card's Return to Hub (real
// key and click). The cage follows the configuration, the cones follow the cage, the pool is never rebuilt, and the
// renderer's memory is back at each kind's first value on every trip. Then (TR-4 fix round 2) a scenario that comes up
// while the hub is up waits under it, and closing the hub by a click leaves the pause card clickable.
//
//   node qa/tr4-pitch.mjs
import {report, expect, snap} from "./lib.mjs";
import {trainLaunch, enterByButton, trainWrites, careerSnapshot, careerDiff, clickReal, pressReal, closeHubReal, cardUp, scrollReal} from "./tr4b-lib.mjs";

const res = {trips: [], errors: []};
const check = (ok, what, got) => { if (!ok) res.errors.push(`${what}: ${JSON.stringify(got).slice(0, 1500)}`); console.log(`${ok ? "ok  " : "FAIL"} ${what}`); };
// (U28 part F: and every real pitch type, a whole pitch with both goals)
const KINDS = ["full", "half", "onegoal", "futsal", "five", "seven", "nine", "compact", "wide", "large"];
const GOALS = {full: 2, half: 1, onegoal: 1, futsal: 2, five: 2, seven: 2, nine: 2, compact: 2, wide: 2, large: 2};

const t = await trainLaunch({seed: 6});
const {page} = t;
try {
  await enterByButton(page);
  const careerBefore = await careerSnapshot(page);
  await page.evaluate(KINDS => {
    const R = window.__trainRun;
    const build = (cfg, env) => { const hx = env.spec.hx; return {myTeam: 0, role: "Attacker", seed: 9, laws: {out: "rebound"},
      me: {slot: "CM", x: hx - 20, z: 0, yaw: -Math.PI/2}, mates: [{slot: "LW", x: hx - 18, z: -8, yaw: -Math.PI/2}], opps: [{slot: "CB", x: hx - 10, z: 0, yaw: Math.PI/2}],
      keeper: {side: "theirs", x: hx - 1.2, z: 0, yaw: Math.PI/2}, ball: {x: hx - 19, y: .11, z: 0}}; };
    for (const k of KINDS) R.registerScenario({id: "qa-pitch-" + k, category: "attacking", name: "Pitch " + k, desc: "A test scenario", config: {pitch: k}, build});
  }, KINDS);
  const base = await page.evaluate(async () => { const H = await import("/js/life/human.js"), PL = await import("/js/life/train/pool.js"); return {bodies: H.bodies().length, poolIds: H.bodies().filter(PL.pooled).map(h => h.id).sort((a, b) => a - b).join(), pool: window.__trainRun.poolStats().size}; });
  // (every geometry the renderer has uploaded and not let go, with where it was made: a leak is one kept alive outside
  // the scene, or the scene's own count growing; renderer.info also counts a mesh first drawn on a later trip)
  await page.evaluate(async () => {
    const {THREE} = await import("/js/life/build.js");
    const G = THREE.BufferGeometry.prototype, live = window.__geoLive = new Map(), NL = String.fromCharCode(10);
    const sa = G.setAttribute; G.setAttribute = function(n, a){ if (!this.__born) this.__born = new Error().stack.split(NL).slice(2, 6).map(x => x.trim().replace(/https?:[/][/][^/]+/, "")).join(" | "); return sa.call(this, n, a); };
    const ae = G.addEventListener; G.addEventListener = function(t, f){ if (t === "dispose" && /onGeometryDispose/.test(f.name || "")) live.set(this, (this.type || "") + " " + (this.name || "") + " @ " + (this.__born || "?")); return ae.call(this, t, f); };
    const re = G.removeEventListener; G.removeEventListener = function(t, f){ if (t === "dispose") live.delete(this); return re.call(this, t, f); };
    window.__geoNow = () => { const inScene = new Set(); window.__life.scene().traverse(o => { if (o.geometry) inScene.add(o.geometry); }); const out = []; for (const [g, v] of live) if (!inScene.has(g) && !/pitchmesh[.]js.*blobGeo|blobGeo.*pitchmesh/.test(v)) out.push(v); return {scene: inScene.size, out}; };
  });
  const first = {};
  for (let trip = 0; trip < 4; trip++){
    for (const kind of KINDS){
      // the hub on Attacking, Start by a real click
      await page.evaluate(() => window.__trainHub.openHub("attacking"));
      await page.waitForFunction(() => !!document.querySelector('#sheetRoot.open [data-th="start"]'), null, {timeout: 20000});
      await scrollReal(page, `#sheetRoot [data-th="start"][data-id="qa-pitch-${kind}"]`);
      await clickReal(page, `#sheetRoot [data-th="start"][data-id="qa-pitch-${kind}"]`);
      await page.waitForFunction(k => !!window.__trainRun.RUN.cur && window.__trainRun.RUN.cur.id === "qa-pitch-" + k && !window.__trainRun.RUN.switching, kind, {timeout: 60000});
      // a few frames drawn on the new cage
      await page.evaluate(() => new Promise(r => { let n = 0; const f = () => { if (++n >= 20) r(); else window.__qa.realRAF(f); }; window.__qa.realRAF(f); }));
      const s = await page.evaluate(async () => {
        const C = await import("/js/life/train/cage.js"), H = await import("/js/life/human.js"), PL = await import("/js/life/train/pool.js"), L = window.__life, m = L.renderer().info.memory;
        const cones = window.__trainCones.cones(), anchors = Object.entries(C.CAGE.anchors).flatMap(([cat, l]) => l.map(a => ({cat, x: a.x, z: a.z})));
        const at = cones.every(c => anchors.some(a => a.cat === c.cat && Math.abs(a.x - c.x) < 1e-6 && Math.abs(a.z - c.z) < 1e-6)) && cones.length === anchors.length && cones.length > 0;
        return {kind: C.CAGE.kind, goals: C.CAGE.goalEnds.length, cones: at, nCones: cones.length, bodies: H.bodies().length, poolIds: H.bodies().filter(PL.pooled).map(h => h.id).sort((a, b) => a - b).join(), pool: window.__trainRun.poolStats().size,
          geo: m.geometries, tex: m.textures, specKind: window.__trainRun.RUN.cur.kind, live: window.__geoNow()};
      });
      s.trip = trip; s.want = kind;
      if (trip === 1) first[kind] = {geo: s.geo, tex: s.tex, scene: s.live.scene};
      res.trips.push(s);
      if (trip === 0) await snap(page, "tr4-pitch-" + kind);
      // out: Esc, then the pause card's Return to Hub
      await pressReal(page, "Escape");
      await cardUp(page);
      await clickReal(page, '#fpOverlay [data-q="hub"]');
      await page.waitForFunction(() => !window.__trainRun.RUN.cur && window.__trainHub.hubOpen(), null, {timeout: 20000});
      const after = await page.evaluate(async () => (await import("/js/life/train/cage.js")).CAGE.kind);
      s.hubKeeps = after === kind;
    }
  }
  // a scenario that comes up while the hub is up (a pitch switch with the hub opened during it, as Esc does there):
  // held under the hub, then the hub closed by a real click on its cross. The pause card comes up with the pointer free,
  // so a real click on Resume plays on
  await scrollReal(page, '#sheetRoot [data-th="start"][data-id="qa-pitch-full"]');
  await clickReal(page, '#sheetRoot [data-th="start"][data-id="qa-pitch-full"]');
  await page.evaluate(() => window.__trainHub.openHub());
  await page.waitForFunction(() => !!window.__trainRun.RUN.cur && !window.__trainRun.RUN.switching, null, {timeout: 60000});
  await page.waitForTimeout(800);
  const held = await page.evaluate(() => ({paused: window.__trainRun.RUN.paused, hub: window.__trainHub.hubOpen(), card: document.getElementById("fpOverlay").classList.contains("on")}));
  check(held.paused && held.hub && !held.card, "a scenario that starts under the hub is held, with no pause card over the hub", held);
  await clickReal(page, "#sheetRoot .sheet-x");
  await cardUp(page);
  await page.waitForTimeout(400);
  const lockUnderCard = await page.evaluate(() => !!document.pointerLockElement);
  check(!lockUnderCard, "the hub closed by a click: the pause card is up and the pointer stays free", {lock: lockUnderCard});
  await clickReal(page, '#fpOverlay [data-q="resume"]');
  await page.waitForFunction(() => !window.__trainRun.RUN.paused && !window.__trainQuick.quickIsOpen(), null, {timeout: 10000}).catch(() => {});
  const resumed = await page.evaluate(() => ({paused: window.__trainRun.RUN.paused, quick: window.__trainQuick.quickIsOpen()}));
  check(!resumed.paused && !resumed.quick, "then a real click on Resume plays on", resumed);
  // the hub opened over a scenario that plays: no pause card drawn over it (it would take the hub's clicks), and a real
  // click on the hub's End it ends the scenario
  await page.evaluate(() => window.__trainHub.openHub());
  await page.waitForFunction(() => !!document.querySelector('#sheetRoot.open [data-th="end"]'), null, {timeout: 20000});
  await page.waitForTimeout(400);
  const over = await page.evaluate(() => document.getElementById("fpOverlay").classList.contains("on"));
  await clickReal(page, '#sheetRoot [data-th="end"]');
  await page.waitForFunction(() => !window.__trainRun.RUN.cur, null, {timeout: 10000}).catch(() => {});
  const ended = await page.evaluate(() => !window.__trainRun.RUN.cur && window.__trainHub.hubOpen());
  check(!over && ended, "with the hub over a playing scenario no card covers it, and its End it works by a real click", {over, ended});
  await closeHubReal(page);
  const T = res.trips;
  check(T.every(s => s.kind === s.want && s.specKind === s.want), "CAGE.kind matches the configured pitch at every start", T.map(s => [s.want, s.kind]));
  check(T.every(s => s.goals === GOALS[s.want]), "the goal count matches the kind (Full 2, Half 1, One goal 1)", T.map(s => [s.want, s.goals]));
  check(T.every(s => s.cones), "the cones sit at the new cage's anchors", T.map(s => [s.want, s.cones, s.nCones]));
  // (your own walking body is made again with every new place, core/me.js through world.js enterZone: the count stays)
  check(T.every(s => s.bodies === base.bodies && s.poolIds === base.poolIds && s.pool === base.pool), "bodies() unchanged, and the pool's own bodies are the same ones: never rebuilt", {base, trips: T.map(s => [s.bodies, s.poolIds])});
  // (the first trip makes what the view makes once and keeps, the markers drawn on first use: the kinds' first values are
  // taken on the second, then three more round trips must come back to them)
  check(T.filter(s => s.trip >= 1).every(s => s.live.scene === first[s.want].scene && !s.live.out.length && s.tex === first[s.want].tex), "after 3 round trips, no geometry is kept alive outside the scene, the scene's own geometries and renderer.info's textures are back at each kind's first value", T.map(s => [s.want, s.live.scene, s.live.out.slice(0, 3), s.tex, s.geo]));
  check(T.every(s => s.hubKeeps), "Return to Hub does not switch the cage back", T.map(s => s.hubKeeps));
  check(!(await trainWrites(page)).length, "no career key written while Training ran", await trainWrites(page));
  const careerAfter = await careerSnapshot(page);
  check(careerDiff(careerBefore, careerAfter).length === 0, "the career diff is empty", careerDiff(careerBefore, careerAfter));
} catch(e){ res.errors.push("tr4-pitch: " + (e && e.stack || e)); }
finally {
  res.errors.push(...page.errors.map(x => "page: " + x));
  report("tr4-pitch", res);
  await t.close();
}
expect(!res.errors.length, res.errors.join("\n"));
console.log("tr4-pitch: pass");
