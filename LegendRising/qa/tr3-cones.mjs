// qa/tr3-cones.mjs: the category cones (BUILD-PLAN P3-B acceptance).
// Owner: P3-B (TR-3). Contract: TRAINING-SPEC 4 (physical cones per category, opened through the existing interaction
// system at sensible distances, at fixed places, one scenario at a time) and 0 (the pitch kind can change).
// A key-driven bot (real W presses, the world stepped frame by frame) walks up to each cone: the prompt shows inside
// its radius and not beyond it, and a real E opens that category in the hub.
//
//   node qa/tr3-cones.mjs
import {report, expect, freeze, unfreeze} from "./lib.mjs";
import {trainLaunch, enterByButton, hubState, hubUp, pressReal} from "./tr3b-lib.mjs";

const res = {walk: [], reload: null, busy: null, kinds: [], change: null, errors: []};
const check = (ok, what, got) => { if (!ok) res.errors.push(`${what}: ${JSON.stringify(got)}`); console.log(`${ok ? "ok  " : "FAIL"} ${what}`); };
const NAMES = {setpieces: "Set Pieces", attacking: "Attacking", defending: "Defending", receiving: "Ball Receiving and First Touch", scenarios: "Match Scenarios", fullmatch: "Full Match", freeplay: "Free Play"};

const conesOf = page => page.evaluate(() => window.__trainCones.cones());
let first = null;
{
  const t = await trainLaunch({seed: 12});
  const {page} = t;
  try {
    await enterByButton(page);
    await pressReal(page, "Escape");
    await page.waitForFunction(() => !window.__trainHub.hubOpen(), null, {timeout: 10000});
    first = await conesOf(page);
    check(first.length === 7 && Object.keys(NAMES).every(k => first.some(c => c.cat === k)), "seven cones, one for each category", first);
    await freeze(page);
    for (const c of first){
      // the bot: 4 m out from the cone on the pitch side, facing it; W held (a real key) and the world stepped, until
      // it is 0.6 m from it; where the prompt for this cone came up, and what was shown before
      const r0 = await page.evaluate(c => { const L = window.__life; L.place({x: c.x, y: 0, z: c.z - 4, yaw: Math.PI}); L.P.pitch = -.3; L.stepN(3); return true; }, c);
      await page.keyboard.down("w");
      const seen = await page.evaluate(c => {
        const L = window.__life, out = {first: null, beyond: 0, other: 0, label: null, prompt: null, steps: 0};
        for (let i = 0; i < 600; i++){
          L.stepN(1); out.steps++;
          const d = Math.hypot(L.P.x - c.x, L.P.z - c.z), h = L.held;
          const mine = !!h && h.cat === c.cat;
          if (mine && out.first == null){ out.first = d; out.label = h.label; out.prompt = (document.getElementById("lifePrompt") || {}).textContent || ""; }
          if (mine && d > 1.6 + 1e-6) out.beyond++;
          if (h && h.cat && h.cat !== c.cat && d < 1.2) out.other++;
          if (d < .6) break;
        }
        return out;
      }, c);
      await page.keyboard.up("w");
      // E (a real key) opens that category
      await unfreeze(page);
      await pressReal(page, "e");
      let open = null;
      try { await hubUp(page); open = await hubState(page); } catch(e){ open = await hubState(page); }
      if (open && open.hub){ await pressReal(page, "Escape"); await page.waitForFunction(() => !window.__trainHub.hubOpen(), null, {timeout: 10000}); }
      await freeze(page);
      res.walk.push(Object.assign({cat: c.cat, opened: open && open.h2}, seen));
    }
    check(res.walk.every(w => w.first != null && w.first <= 1.6 + 1e-6 && w.first > 1.2 && w.beyond === 0), "the prompt comes up inside 1.6 m of each cone and never beyond", res.walk);
    check(res.walk.every(w => w.label === NAMES[w.cat] && /See what you can practise here/.test(w.prompt)), "the prompt names the category", res.walk.map(w => [w.label, w.prompt]));
    check(res.walk.every(w => w.opened === NAMES[w.cat]), "E at a cone opens that category in the hub", res.walk.map(w => [w.cat, w.opened]));
    // one scenario at a time: while one plays, another category's cone says to end it first, and opens nothing
    res.busy = await page.evaluate(() => {
      const R = window.__trainRun, L = window.__life;
      R.registerScenario({id: "qa-cones", category: "attacking", name: "Test", desc: "A test scenario", build: () => ({me: {slot: "CM", x: 0, z: 0, yaw: 0}, ball: {x: 0, z: -1}})});
      const ok = R.startScenario("qa-cones", {});
      L.stepN(10);
      const sp = window.__trainCones.spots.find(s => s.cat === "defending");
      const nt = document.getElementById("lifeNote"); if (nt) nt.textContent = "";
      L.use(sp);
      const out = {ok, note: (document.getElementById("lifeNote") || {}).textContent || "", hub: window.__trainHub.hubOpen()};
      R.stopScenario("done");
      L.stepN(5);
      return out;
    });
    check(res.busy.ok && /End or reset this one first/.test(res.busy.note) && !res.busy.hub, "another cone refuses while a scenario plays", res.busy);
    // every other kind of cage: the cones at its anchors, no spot doubled
    await unfreeze(page);
    for (const kind of ["half", "onegoal", "full"]){
      const k = await page.evaluate(async kind => {
        const C = await import("/js/life/train/cage.js");
        await C.cageEnter(kind);
        const cones = window.__trainCones.cones(), A = C.CAGE.anchors;
        let err = 0;
        for (const c of cones){ const a = (A[c.cat] || [])[0]; err = Math.max(err, a ? Math.hypot(a.x - c.x, a.z - c.z) : 99); }
        return {kind, n: cones.length, err, spots: window.__life.spots.filter(s => s.train).length, cage: C.CAGE.kind};
      }, kind);
      res.kinds.push(k);
    }
    check(res.kinds.every(k => k.n === 7 && k.err <= .01 && k.spots === 7 && k.cage === k.kind), "after each pitch change every cone is at the new anchors and no spot is doubled", res.kinds);
    // a pitch change while a scenario plays (runner.js: the change of place ends it): you are back walking in Training's
    // own mode in the new cage, the screen comes back, the world keeps drawing, and the next change and the next
    // scenario work as before
    res.change = await page.evaluate(async () => {
      const C = await import("/js/life/train/cage.js"), R = window.__trainRun, L = window.__life;
      const race = p => Promise.race([p.then(() => "resolved"), new Promise(r => setTimeout(() => r("timeout"), 60000))]);
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const ok = R.startScenario("qa-cones", {}), during = L.modes.mode();
      const r1 = await race(C.cageEnter("half"));
      const p0 = L.presented; await wait(1500);
      const a = {r1, mode: L.modes.mode(), run: !!R.RUN.cur, fade: L.FADE.v, drawn: L.presented - p0, cage: C.CAGE.kind};
      const r2 = await race(C.cageEnter("full"));
      const again = R.startScenario("qa-cones", {}), mode2 = L.modes.mode();
      R.stopScenario("done"); await wait(300);
      return Object.assign(a, {ok, during, r2, again, mode2, after: L.modes.mode(), fade2: L.FADE.v});
    });
    check(res.change.ok && res.change.during === "train" && res.change.r1 === "resolved" && res.change.mode === "trainsb" && !res.change.run
      && res.change.fade === 0 && res.change.drawn > 0 && res.change.cage === "half", "a pitch change while a scenario plays ends it and leaves you walking in the new cage", res.change);
    check(res.change.r2 === "resolved" && res.change.again && res.change.mode2 === "train" && res.change.after === "trainsb" && res.change.fade2 === 0,
      "after it the next pitch change and the next scenario work", res.change);
  } catch(e){ res.errors.push("cones: " + (e && e.stack || e)); }
  finally { res.errors.push(...t.page.errors.map(x => "page: " + x)); await t.close(); }
}
{
  // the same places after a reload
  const t = await trainLaunch({seed: 13});
  try {
    await enterByButton(t.page);
    const again = await conesOf(t.page);
    res.reload = {first, again};
    check(JSON.stringify(first) === JSON.stringify(again), "the cones are in the same places after a reload", res.reload);
  } catch(e){ res.errors.push("reload: " + (e && e.stack || e)); }
  finally { res.errors.push(...t.page.errors.map(x => "page: " + x)); await t.close(); }
}

report("tr3-cones", res);
expect(!res.errors.length, res.errors.join("\n"));
console.log("tr3-cones: pass");
