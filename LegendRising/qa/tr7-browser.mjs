// qa/tr7-browser.mjs: the browser part of P7-B's acceptance scripts (qa/tr7-corner.mjs, qa/tr7-throw.mjs and
// qa/tr7-penalty.mjs call browserPart(type) after their Node part). In the real page, Training entered by the title's
// button:
//   - the type's drills are in the hub's Set Pieces category;
//   - presets: a named preset of the type (non-default settings), saved by real typing and clicks, survives a reload
//     and loads by a real click: the configuration is identical, and the activation's RUN.digest() equals that of the
//     saved setup's activation (but for the HUD's line naming the preset);
//   - corner: the instant replay plays the last corner, and the next go starts in the same state as the first (digest);
//   - throw: the thrower holds the drawn ball in both hands up to the release, within 0.15 m of the middle of his
//     hands at the release frame, and the ball leaves the hands after it;
//   - penalty: retry (the runner's restart) restores the setup: the digest after a decided go and its retry equals the
//     activation's;
//   - the career save is never written and there is no console or page error.
// The simulation is stepped frozen (lib.mjs freeze, __life.stepN), so nothing depends on the machine's speed.
// Owner: P7-B (Training Mode Phase 7).
import {freeze, unfreeze} from "./lib.mjs";
import {trainLaunch, enterByButton, trainWrites, v2Writes, careerSnapshot, careerDiff, clickReal} from "./tr4b-lib.mjs";
import {checker} from "./wpF-lib.mjs";

const IDS = {corner:["corner-take", "corner-box", "corner-target", "corner-edge", "corner-short", "corner-defend"],
  throw:["throw-take", "throw-receive", "throw-run", "throw-mark", "throw-support"], penalty:["pen-take", "pen-empty", "pen-follow", "pen-defend"]};
const MAIN = {corner:"corner-box", throw:"throw-receive", penalty:"pen-follow"};
const NAMES = {corner:"Corner", throw:"Throw-in", penalty:"Penalty"};
// the presets' non-default settings (BUILD-PLAN P7-B: corner side, taker, receiver, marking and counts; throw location,
// thrower, receiver, counts; penalty AI taker, keeper off, keeper attributes)
const PRESET = {
  corner:{name:"Far post from the right", cfg:{role:"attacker", attackers:5, defenders:3, opts:{side:"right", zone:"far", marking:"zonal", delivery:"mixed"}}},
  throw:{name:"Down the right line", cfg:{role:"receiver", attackers:3, defenders:2, opts:{side:"right", along:18, to:"space"}}},
  penalty:{name:"Their keeper off", cfg:{role:"attacker", attackers:3, defenders:2, keeper:false, gk:{reflex:88, dive:84, handling:80, posit:86, distrib:60}}}
};

const HELPERS = async () => {
  const Rn = window.__trainRun, C = window.__trainConfig, L = window.__life, RM = await import("/js/life/train/runner.js");
  window.__t7 = {
    cfg(type, over){ const c = C.defaults(type); for (const [k, v] of Object.entries(over || {})) if (k === "opts") Object.assign(c.opts, v); else c[k] = v; return C.validate(type, c); },
    start(id, cfg){ if (Rn.RUN.cur) Rn.stopScenario("restart"); return Rn.startScenario(id, cfg); },
    ready(){ const R = Rn.RUN; return !!R.cur && !R.switching && !!R.T && !!R.T.V; },
    // every activation and restart: its digest, the moment the runner tells its listeners
    watch(){ window.__qaDig = []; if (!window.__qaOff) window.__qaOff = RM.onRunner(() => { const R = Rn.RUN; if (R.cur && R.T && R.T.V) window.__qaDig.push({starts:R.starts, restarts:R.restarts, d:Rn.digest(), runner:JSON.parse(JSON.stringify(Rn.digestState().runner))}); }); },
    step(n){ Rn.setPaused(false); for (let i = 0; i < n; i++) L.stepN(1, 1/60); }
  };
};
// the digests of two activations the same but for the HUD's preset line
function sameDigest(a, b, allowHud = true){
  if (!a || !b) return {ok:false, why:"missing"};
  if (a.d.hash === b.d.hash) return {ok:true};
  const parts = a.d.parts.filter((p, i) => p !== b.d.parts[i]);
  const diffs = [], walk = (x, y, at) => { if (JSON.stringify(x) === JSON.stringify(y)) return; if (x && y && typeof x === "object" && typeof y === "object"){ for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], at + "." + k); } else diffs.push([at, x, y]); };
  walk(a.runner, b.runner, "runner");
  const onlyHud = allowHud && parts.every(p => p.startsWith("runner:")) && diffs.every(([at]) => /^runner\.hud\b/.test(at));
  return {ok:onlyHud, parts, diffs:diffs.slice(0, 6)};
}

export async function browserPart(type){
  const {check, done} = checker("tr7-" + type + "-browser");
  const t = await trainLaunch({seed:7});
  const page = t.page;
  try {
    const careerBefore = await careerSnapshot(page);
    await enterByButton(page);
    await page.evaluate(HELPERS);
    await page.evaluate(() => window.__trainHub.closeHub());
    const ids = await page.evaluate(() => window.__trainRun.scenariosOf("setpieces").map(s => s.id));
    check(IDS[type].every(id => ids.includes(id)), `the ${NAMES[type].toLowerCase()} drills are in the hub's Set Pieces category`, ids);

    /* ---------- presets: save, reload, load ---------- */
    const P = PRESET[type];
    const C1 = await page.evaluate(([ty, o]) => window.__t7.cfg(ty, o), [type, P.cfg]);
    const def = await page.evaluate(([ty]) => window.__t7.cfg(ty, null), [type]);
    check(JSON.stringify(C1) !== JSON.stringify(def), "the preset's configuration has non-default values", C1.opts);
    await page.evaluate(() => window.__t7.watch());
    await page.evaluate(([id, c]) => window.__t7.start(id, c), [MAIN[type], C1]);
    await page.waitForFunction(() => window.__t7.ready() && window.__qaDig.length > 0, null, {timeout:120000});
    const dig0 = await page.evaluate(() => Object.assign({cfg:window.__trainRun.RUN.cur.config}, window.__qaDig[0]));
    await page.evaluate(() => window.__trainRun.stopScenario("restart"));
    await page.evaluate(([ty, nm, c, id]) => window.__trainPresetUI.openPresets({type:ty, typeName:nm, config:c, scenarioId:id}), [type, NAMES[type], C1, MAIN[type]]);
    await page.waitForFunction(() => !!document.querySelector("#sheetRoot.open .tp") && window.__trainPresetUI.presetsOpen(), null, {timeout:15000});
    await clickReal(page, "#tpName");
    await page.keyboard.press("Control+A");
    await page.keyboard.type(P.name, {delay:15});
    await clickReal(page, '#sheetRoot [data-tp="save"]');
    await page.waitForFunction(() => document.querySelectorAll("#sheetRoot .tp-row").length >= 1, null, {timeout:10000});
    const meta = await page.evaluate(() => [...document.querySelectorAll("#sheetRoot .tp-row")].map(r => ({name:r.querySelector(".tp-name").textContent, meta:r.querySelector(".tp-meta").textContent})));
    await clickReal(page, '#sheetRoot .th-foot [data-tp="close"]');
    await page.waitForFunction(() => !window.__trainPresetUI.presetsOpen(), null, {timeout:10000});
    await page.reload();
    await page.waitForFunction(() => typeof newCareer === "function" && !!window.__life && document.readyState !== "loading", null, {timeout:60000});
    await enterByButton(page);
    await page.evaluate(HELPERS);
    await page.evaluate(() => window.__trainHub.closeHub());
    await page.evaluate(([ty, nm, id]) => window.__trainPresetUI.openPresets({type:ty, typeName:nm, config:null, scenarioId:id}), [type, NAMES[type], MAIN[type]]);
    await page.waitForFunction(() => !!document.querySelector("#sheetRoot.open .tp") && document.querySelectorAll("#sheetRoot .tp-row").length >= 1, null, {timeout:15000});
    const rows = await page.evaluate(() => [...document.querySelectorAll("#sheetRoot .tp-row")].map(r => ({id:r.dataset.row, name:r.querySelector(".tp-name").textContent})));
    const row = rows.find(r => r.name === P.name);
    check(!!row, "after a reload the preset is in the Load list", rows);
    check(meta.length >= 1 && meta[0].meta.length > 0, "the Load list says what the preset is", meta);
    if (row){
      await page.evaluate(() => window.__t7.watch());
      await clickReal(page, `#sheetRoot [data-row="${row.id}"] [data-tp="load"]`);
      await page.waitForFunction(() => window.__t7.ready() && window.__qaDig.length > 0, null, {timeout:120000});
      const dig1 = await page.evaluate(() => Object.assign({cfg:window.__trainRun.RUN.cur.config, preset:window.__trainRun.RUN.cur.preset}, window.__qaDig[0]));
      check(JSON.stringify(dig1.cfg) === JSON.stringify(C1) && JSON.stringify(dig0.cfg) === JSON.stringify(C1), "Load starts the drill with exactly the saved configuration", {preset:dig1.preset});
      const sd = sameDigest(dig0, dig1);
      check(sd.ok, "the loaded preset's activation digest (RUN.digest) equals the saved setup's (but for the HUD's preset line)", sd);
    }

    /* ---------- the type's own check ---------- */
    await freeze(page);
    if (type === "corner"){
      // a corner with its replay on: the go decided, the replay played, then the next go in the activation's state
      const C2 = await page.evaluate(() => window.__t7.cfg("corner", {role:"attacker", opts:{replay:true}}));
      await page.evaluate(() => window.__t7.watch());
      await page.evaluate(([c]) => window.__t7.start("corner-box", c), [C2]);
      await page.waitForFunction(() => window.__t7.ready() && window.__qaDig.length > 0, null, {timeout:120000});
      // (stepped frozen up to the replay; the replay itself runs on drawn frames, so it plays in real time)
      const R = await page.evaluate(() => {
        const Rn = window.__trainRun;
        for (let i = 0; i < 60*60 && !Rn.replaying() && Rn.RUN.restarts < 1; i++) window.__t7.step(1);
        return {replayed:Rn.replaying(), verdict:Rn.RUN.T && Rn.RUN.T.results.length ? Rn.RUN.T.results[0] : null};
      });
      await unfreeze(page);
      const t0 = Date.now();
      await page.waitForFunction(() => window.__trainRun.RUN.restarts >= 1, null, {timeout:60000}).catch(() => null);
      Object.assign(R, await page.evaluate(() => ({restarts:window.__trainRun.RUN.restarts, replays:window.__trainRun.RUN.replays})), {realS:+((Date.now() - t0)/1000).toFixed(1)});
      R.frames = R.realS*60;
      await freeze(page);
      check(R.replayed && R.replays >= 1 && R.realS > 1, "the instant replay plays the corner when the go is decided (and then the next go starts)", R);
      const digs = await page.evaluate(() => window.__qaDig);
      const first = digs[0], again = digs.find(d => d.restarts >= 1);
      const sd = sameDigest(first, again, false);
      check(R.restarts >= 1 && sd.ok, "after the replay the next corner starts in the same state as the first (RUN.digest equal)", Object.assign({restarts:R.restarts}, sd));
    } else if (type === "throw"){
      const C2 = await page.evaluate(() => window.__t7.cfg("throw", {role:"receiver"}));
      await page.evaluate(([c]) => window.__t7.start("throw-receive", c), [C2]);
      await page.waitForFunction(() => window.__t7.ready(), null, {timeout:120000});
      const H = await page.evaluate(async () => {
        const HB = await import("/js/life/human.js"), Rn = window.__trainRun, T = Rn.RUN.T, V = T.V, scene = window.__life.scene();
        const v1 = {x:0, y:0, z:0}, rows = [];
        const Vec = window.__life.cam.position.constructor, a1 = new Vec(), a2 = new Vec();
        for (let i = 0; i < 60*12; i++){
          window.__t7.step(1);
          const ms = T.ms, R0 = ms.restart, tkId = R0 && R0.kind === "throw" ? R0.taker : rows.length ? rows[rows.length - 1].tk : -1;
          if (tkId < 0) continue;
          const a = ms.agents[tkId], Rr = V.rec[tkId]; if (!Rr || !Rr.h) continue;
          scene.updateMatrixWorld(true);
          const h = Rr.h, bp = V.ball.mesh.getWorldPosition(new Vec()), hl = h.bones[HB.BONE.haL].getWorldPosition(a1), hr = h.bones[HB.BONE.haR].getWorldPosition(a2);
          const mid = {x:(hl.x + hr.x)/2, y:(hl.y + hr.y)/2, z:(hl.z + hr.z)/2};
          const act = a.act && a.act.kind === "throw" ? a.act : null;
          rows.push({i, tk:tkId, held:ms.ball.state === "held" && ms.ball.holder === tkId, act:act ? {t:act.t, done:act.done} : null, free:ms.ball.state === "free",
            dMid:Math.hypot(bp.x - mid.x, bp.y - mid.y, bp.z - mid.z), y:bp.y});
          if (rows.length > 2 && rows[rows.length - 1].free && rows.filter(r => r.free).length > 6) break;
        }
        void v1;
        return rows;
      });
      const relIdx = H.findIndex(r => r.free), rel = relIdx > 0 ? H[relIdx - 1] : null, pre = H.filter(r => r.act && !r.act.done && !r.free);
      const after = relIdx >= 0 ? H[Math.min(H.length - 1, relIdx + 3)] : null;
      check(pre.length > 10, "the thrower holds the ball through his throw", {frames:pre.length});
      check(!!rel && rel.dMid <= 0.15, "at the release the drawn ball is within 0.15 m of the middle of his hands", rel ? {dMid:+rel.dMid.toFixed(3), y:+rel.y.toFixed(2)} : null);
      check(pre.every(r => r.dMid <= 0.15), "up to the release the ball stays in his hands (within 0.15 m every frame)", {worst:+Math.max(0, ...pre.map(r => r.dMid)).toFixed(3)});
      check(!!after && after.dMid > 0.15, "after the release the ball leaves his hands", after ? {dMid:+after.dMid.toFixed(3)} : null);
    } else {
      // retry: the go decided (the next go is the runner's restart), and its state equals the activation's
      const C2 = await page.evaluate(() => window.__t7.cfg("penalty", {role:"attacker", attackers:3, defenders:2}));
      await page.evaluate(() => window.__t7.watch());
      await page.evaluate(([c]) => window.__t7.start("pen-follow", c), [C2]);
      await page.waitForFunction(() => window.__t7.ready() && window.__qaDig.length > 0, null, {timeout:120000});
      const R = await page.evaluate(() => { const Rn = window.__trainRun; for (let i = 0; i < 60*40 && Rn.RUN.restarts < 1; i++) window.__t7.step(1); return {restarts:Rn.RUN.restarts, verdict:Rn.RUN.T && Rn.RUN.T.results[0] || null}; });
      // and a retry asked for by hand (Backspace's restart) mid-go
      await page.evaluate(() => { window.__t7.step(90); window.__trainRun.restart(); });
      const digs = await page.evaluate(() => window.__qaDig);
      const first = digs[0], auto = digs.find(d => d.restarts === 1), hand = digs.find(d => d.restarts === 2);
      const s1 = sameDigest(first, auto, false), s2 = sameDigest(first, hand, false);
      check(R.restarts >= 1 && s1.ok && s2.ok, "retry restores the setup: after a decided go and after a retry mid-go, RUN.digest equals the activation's", {R, auto:s1, hand:s2});
    }
    await unfreeze(page);
    await page.evaluate(() => { if (window.__trainRun.RUN.cur) window.__trainRun.stopScenario("quit"); });

    /* ---------- the career and the console ---------- */
    check(!(await trainWrites(page)).length && !(await v2Writes(page)).length, "the write spy logs no freyaFootball.v2 write", await v2Writes(page));
    check(careerDiff(careerBefore, await careerSnapshot(page)).length === 0, "the career diff is empty");
  } catch(e){ check(false, "ran", String(e && e.stack || e)); }
  check(!page.errors.length, "zero console and page errors", page.errors.slice(0, 5));
  const ok = done();
  await t.close();
  return ok;
}
