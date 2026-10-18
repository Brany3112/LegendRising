// qa/wpA-presets.mjs: WP-A acceptance for applying graphics presets at run time.
// Owner: WP-A (DESIGN 2.3 WP-A acceptance, 1.4.4, 3.9.1).
//
//   sequence   in the world at home, the preset goes Low, High, Medium, Low (setGfx, as the Settings buttons do):
//              the canvas is replaced exactly twice (antialiasing changed twice), every shader program compiled
//              during the changes is compiled while the screen is covered (FADE.v >= 0.98), no console or page errors
//   same look  after the sequence, the bedroom view on Low matches a fresh boot on Low (pixels differing by more than
//              8/255 in any channel: at most 1%)
//   state      after each change: the renderer's antialiasing, shadow map, real point-light pool and material class
//              are the preset's
//
//   QA_PORT=8772 node qa/wpA-presets.mjs        writes qa/out/wpA-presets.json and qa/out/wpA-presets-{after,fresh}.png
import fs from "node:fs";
import path from "node:path";
import {launch, career, freeze, expect, report, OUT} from "./lib.mjs";

const out = {checks: [], ok: true};
const check = (name, ok, detail) => { out.checks.push({name, ok: !!ok, detail}); if (!ok) out.ok = false; console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail !== undefined ? ": " + JSON.stringify(detail) : ""}`); };

// the bedroom view, drawn once by hand at noon after the world has settled, as a PNG data URL
async function capture(page){
  await freeze(page);
  return page.evaluate(() => {
    const L = __life;
    for (const k in L.keys) L.keys[k] = false;
    S.life.min = 12*60; L.LIFE.min = 12*60;
    __perf.setView("bedroom");
    L.FADE.v = 0; L.FADE.boot = false;
    L.stepN(150);
    const R = L.renderer(); R.render(L.scene(), L.cam);
    return R.domElement.toDataURL("image/png");
  });
}

const A = await launch({gfx: "low", seed: 3, query: "perf=1"});
let after = null;
try {
  await career(A.page, {zone: "home", at: "bed", min: 12*60});
  // watch the renderers: every one the world makes, and every program compiled by it (render, compile, compileAsync)
  await A.page.evaluate(() => {
    const W_ = window.__wpa = {renderers: [], compiles: [], tick: 0};
    const watch = () => {
      const r = __life.renderer();
      if (r && !W_.renderers.includes(r)){
        W_.renderers.push(r);
        for (const k of ["render", "compile", "compileAsync"]){
          const f = r[k].bind(r);
          r[k] = (...a) => {
            const before = r.info.programs.length, fade = __life.FADE.v, res = f(...a);
            const note = () => { const n = r.info.programs.length; if (n > before) W_.compiles.push({via: k, fade, fadeAfter: __life.FADE.v, before, after: n, frame: W_.tick}); };
            if (res && res.then) res.then(note); else note();
            return res;
          };
        }
      }
      W_.tick++;
      requestAnimationFrame(watch);
    };
    watch();
  });
  const Q = "./js/life/core/quality.js";
  const state = () => A.page.evaluate(async (Q) => {
    const q = await import(Q), L = __life, r = L.renderer(), sky = L.sky();
    let lam = 0, std = 0; L.scene().traverse(o => { if (o.isBatchedMesh && o.name.startsWith("batch:")){ if (o.material.isMeshLambertMaterial) lam++; else if (o.material.isMeshStandardMaterial) std++; } });
    return {tier: GFX.tier, applied: q.RQ.P && q.RQ.P.tier, busy: q.RQ.busy, pending: q.RQ.pending, recreated: q.RQ.recreated, swaps: q.RQ.swaps,
      aa: r.getContextAttributes().antialias, shadowMap: r.shadowMap.enabled, pool: sky.pool.length, lambert: lam, standard: std,
      canvases: document.querySelectorAll("#lifeRoot canvas").length, env: !!L.scene().environment};
  }, Q);
  const settle = async () => {
    for (let i = 0; i < 400; i++){
      const s = await state();
      if (!s.busy && !s.pending && s.applied === s.tier) return s;
      await A.page.waitForTimeout(100);
    }
    return state();
  };
  const want = {low: {aa: false, shadowMap: false, pool: 2, lambert: true}, medium: {aa: true, shadowMap: true, pool: 4}, high: {aa: true, shadowMap: true, pool: 8, standard: true}};
  for (const tier of ["high", "medium", "low"]){
    await A.page.evaluate(t => setGfx(t), tier);
    const s = await settle();
    const w = want[tier];
    check(`${tier}: applied`, s.applied === tier && s.aa === w.aa && s.shadowMap === w.shadowMap && s.pool === w.pool && (!w.lambert || s.standard === 0) && (!w.standard || s.lambert === 0), s);
    await A.page.waitForTimeout(600);
  }
  const W_ = await A.page.evaluate(() => ({renderers: window.__wpa.renderers.length, compiles: window.__wpa.compiles}));
  const fin = await state();
  check("the canvas is replaced exactly twice", fin.recreated === 2 && W_.renderers === 3, {recreated: fin.recreated, renderers: W_.renderers});
  const open = W_.compiles.filter(c => c.fade < .98 && c.via === "render");
  check("every program compiles while the screen is covered", open.length === 0, {compiles: W_.compiles.length, uncovered: open.slice(0, 5)});
  after = await capture(A.page);
  check("no errors during the changes", A.errors.length === 0, A.errors.slice(0, 5));
} finally { await A.close(); }

const B = await launch({gfx: "low", seed: 3, query: "perf=1"});
let fresh = null;
try {
  await career(B.page, {zone: "home", at: "bed", min: 12*60});
  fresh = await capture(B.page);
  check("no errors on a fresh boot", B.errors.length === 0, B.errors.slice(0, 5));
  // compare the two pictures in the page (no image library in node)
  const diff = await B.page.evaluate(async ([a, b]) => {
    const img = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
    const [ia, ib] = await Promise.all([img(a), img(b)]);
    const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height), c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, w, h).data;
    g.clearRect(0, 0, w, h); g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, w, h).data;
    let n = 0; for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) > 8 || Math.abs(da[i + 1] - db[i + 1]) > 8 || Math.abs(da[i + 2] - db[i + 2]) > 8) n++;
    return {w, h, same: ia.width === ib.width && ia.height === ib.height, frac: n/(w*h)};
  }, [after, fresh]);
  check("the scene looks the same as a fresh boot on Low", diff.same && diff.frac <= .01, diff);
} finally { await B.close(); }

fs.mkdirSync(OUT, {recursive: true});
if (after) fs.writeFileSync(path.join(OUT, "wpA-presets-after.png"), Buffer.from(after.split(",")[1], "base64"));
if (fresh) fs.writeFileSync(path.join(OUT, "wpA-presets-fresh.png"), Buffer.from(fresh.split(",")[1], "base64"));
report("wpA-presets", out);
console.log(out.ok ? "wpA-presets: pass" : "wpA-presets: FAIL");
expect(out.ok, "wpA-presets failed");
