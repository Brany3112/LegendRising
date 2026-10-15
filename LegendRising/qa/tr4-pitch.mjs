// qa/tr4-pitch.mjs: pitch switching when a scenario starts.
// Owner: P4-B (TR-4). Contract: BUILD-PLAN P4-B acceptance "qa/tr4-pitch.mjs" and work item 6; TRAINING-SPEC 0 (the
// user picks Full, Half or One goal) and 8 (no rebuilt bodies, nothing accumulating).
//
// Three test scenarios whose configurations ask for the Full, Half and One-goal pitch are started from the hub with real
// clicks on their Start buttons, three round trips; each is left with Esc and the pause card's Return to Hub (real
// key and click). The cage follows the configuration, the cones follow the cage, the pool is never rebuilt, and the
// renderer's memory is back at each kind's first value on every trip.
//
//   node qa/tr4-pitch.mjs
import {report, expect, snap} from "./lib.mjs";
import {trainLaunch, enterByButton, trainWrites, careerSnapshot, careerDiff, clickReal, pressReal, closeHubReal, cardUp} from "./tr4b-lib.mjs";

const res = {trips: [], errors: []};
const check = (ok, what, got) => { if (!ok) res.errors.push(`${what}: ${JSON.stringify(got).slice(0, 1500)}`); console.log(`${ok ? "ok  " : "FAIL"} ${what}`); };
const GOALS = {full: 2, half: 1, onegoal: 1};

const t = await trainLaunch({seed: 6});
const {page} = t;
try {
  await enterByButton(page);
  const careerBefore = await careerSnapshot(page);
  await page.evaluate(() => {
    const R = window.__trainRun;
    const build = (cfg, env) => { const hx = env.spec.hx; return {myTeam: 0, role: "Attacker", seed: 9, laws: {out: "rebound"},
      me: {slot: "CM", x: hx - 20, z: 0, yaw: -Math.PI/2}, mates: [{slot: "LW", x: hx - 18, z: -8, yaw: -Math.PI/2}], opps: [{slot: "CB", x: hx - 10, z: 0, yaw: Math.PI/2}],
      keeper: {side: "theirs", x: hx - 1.2, z: 0, yaw: Math.PI/2}, ball: {x: hx - 19, y: .11, z: 0}}; };
    for (const k of ["full", "half", "onegoal"]) R.registerScenario({id: "qa-pitch-" + k, category: "attacking", name: "Pitch " + k, desc: "A test scenario", config: {pitch: k}, build});
  });
  const base = await page.evaluate(async () => { const H = await import("/js/life/human.js"), PL = await import("/js/life/train/pool.js"); return {bodies: H.bodies().length, poolIds: H.bodies().filter(PL.pooled).map(h => h.id).sort((a, b) => a - b).join(), pool: window.__trainRun.poolStats().size}; });
  const first = {};
  for (let trip = 0; trip < 4; trip++){
    for (const kind of ["full", "half", "onegoal"]){
      // the hub on Attacking, Start by a real click
      await page.evaluate(() => window.__trainHub.openHub("attacking"));
      await page.waitForFunction(() => !!document.querySelector('#sheetRoot.open [data-th="start"]'), null, {timeout: 20000});
      await clickReal(page, `#sheetRoot [data-th="start"][data-id="qa-pitch-${kind}"]`);
      await page.waitForFunction(k => !!window.__trainRun.RUN.cur && window.__trainRun.RUN.cur.id === "qa-pitch-" + k && !window.__trainRun.RUN.pending, kind, {timeout: 60000});
      // a few frames drawn on the new cage
      await page.evaluate(() => new Promise(r => { let n = 0; const f = () => { if (++n >= 20) r(); else window.__qa.realRAF(f); }; window.__qa.realRAF(f); }));
      const s = await page.evaluate(async () => {
        const C = await import("/js/life/train/cage.js"), H = await import("/js/life/human.js"), PL = await import("/js/life/train/pool.js"), L = window.__life, m = L.renderer().info.memory;
        const cones = window.__trainCones.cones(), anchors = Object.entries(C.CAGE.anchors).flatMap(([cat, l]) => l.map(a => ({cat, x: a.x, z: a.z})));
        const at = cones.every(c => anchors.some(a => a.cat === c.cat && Math.abs(a.x - c.x) < 1e-6 && Math.abs(a.z - c.z) < 1e-6)) && cones.length === anchors.length && cones.length > 0;
        return {kind: C.CAGE.kind, goals: C.CAGE.goalEnds.length, cones: at, nCones: cones.length, bodies: H.bodies().length, poolIds: H.bodies().filter(PL.pooled).map(h => h.id).sort((a, b) => a - b).join(), pool: window.__trainRun.poolStats().size,
          geo: m.geometries, tex: m.textures, specKind: window.__trainRun.RUN.cur.kind};
      });
      s.trip = trip; s.want = kind;
      if (trip === 1) first[kind] = {geo: s.geo, tex: s.tex};
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
  await closeHubReal(page);
  const T = res.trips;
  check(T.every(s => s.kind === s.want && s.specKind === s.want), "CAGE.kind matches the configured pitch at every start", T.map(s => [s.want, s.kind]));
  check(T.every(s => s.goals === GOALS[s.want]), "the goal count matches the kind (Full 2, Half 1, One goal 1)", T.map(s => [s.want, s.goals]));
  check(T.every(s => s.cones), "the cones sit at the new cage's anchors", T.map(s => [s.want, s.cones, s.nCones]));
  // (your own walking body is made again with every new place, core/me.js through world.js enterZone: the count stays)
  check(T.every(s => s.bodies === base.bodies && s.poolIds === base.poolIds && s.pool === base.pool), "bodies() unchanged, and the pool's own bodies are the same ones: never rebuilt", {base, trips: T.map(s => [s.bodies, s.poolIds])});
  // (the first trip makes what the view makes once and keeps, the markers drawn on first use: the kinds' first values are
  // taken on the second, then three more round trips must come back to them)
  check(T.filter(s => s.trip >= 1).every(s => s.geo === first[s.want].geo && s.tex === first[s.want].tex), "after 3 round trips, renderer.info geometries and textures are back at each kind's first value", T.map(s => [s.want, s.geo, s.tex]));
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
