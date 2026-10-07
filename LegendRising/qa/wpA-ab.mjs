// qa/wpA-ab.mjs: WP-A acceptance for the time ratios, measured side by side with the tree before the rework.
// Owner: WP-A (DESIGN 2.3 WP-A acceptance, 1.5.11 "relative SwiftShader targets", 3.9.8).
//
// SwiftShader's milliseconds follow the machine's load: qa/perf.mjs divides by times recorded on another day
// (qa/perf-baseline.json), so a busy machine can fail a ratio that holds. Here both trees run in one browser at the
// same moment: this tree and the base tree (git archive of --base, by default c7d4760, the I0 tree the baseline was
// recorded from) are served to the browser from disk (no second server or port), each opened at the same view, and
// their frames are taken in turns, so whatever else the machine is doing weighs on both alike.
//   render   this tree on Low draws a frame (render plus a one-pixel read that waits for the GPU) in at most 50% of
//            the base tree's time on Low, and at most 35% of the base tree's time on High
//   rays     the camera collision along the 60 m scripted walk (qa/record-perf.mjs WALK, down your street): from a point
//            every 5 m, 1000 rays from the eye in a fan (camCast, 3 m each), in at most 30% of the base tree's time
//            (best of three); the same fan from each view's own eye is reported
//   step     a world step with nothing drawn (stepN(1): movement, people, clock, sky) costs no more than 10% over the
//            base tree's
//
//   node qa/wpA-ab.mjs                                   every life view (bedroom, lobby, street, park, yard, pitch, town-road)
//   node qa/wpA-ab.mjs --views bedroom,yard --rounds 4 --base <git ref>
// Writes qa/out/wpA-ab.json.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {expect, report, ROOT, OUT, PORT} from "./lib.mjs";

process.env.PLAYWRIGHT_BROWSERS_PATH ||= "/opt/pw-browsers";
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || "/opt/node22/lib/node_modules/playwright/index.mjs");
const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const REF = opt("--base", "c7d4760"), VIEWS = opt("--views", "bedroom,lobby,street,park,yard,pitch,town-road").split(","), ROUNDS = +opt("--rounds", 6);
const out = {base: REF, checks: [], ok: true, views: {}};
const check = (name, ok, detail, soft = false) => { out.checks.push({name, ok: !!ok, soft, detail}); if (!ok && !soft) out.ok = false; console.log(`${ok ? "ok  " : soft ? "note" : "FAIL"} ${name}${detail !== undefined ? ": " + JSON.stringify(detail) : ""}`); };

// the base tree, exported once into qa/out
const BASE = path.join(OUT, `ab-base-${REF}`);
if (!fs.existsSync(path.join(BASE, "index.html"))){
  fs.mkdirSync(BASE, {recursive: true});
  const top = path.dirname(ROOT), sub = path.basename(ROOT), tar = path.join(OUT, `ab-base-${REF}.tar`);
  execFileSync("git", ["archive", "--format=tar", "-o", tar, REF, sub], {cwd: top});
  execFileSync("tar", ["-xf", tar, "-C", BASE, "--strip-components=1"]);
  fs.rmSync(tar);
}
const ROOTS = {base: BASE, new: ROOT};
const MIME = {".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2"};
const ORIGIN = `http://127.0.0.1:${PORT}`;
// the views (the same as js/life/perf.js VIEWS, which the base tree does not have)
const PLACES = {bedroom: {zone: "home", at: "bed", pitch: -.08}, lobby: {zone: "home", at: {x: -9.5, z: -1, y: .12, yaw: Math.PI}, pitch: 0},
  street: {zone: "home", at: {x: 3, z: 10, y: .12, yaw: Math.PI/2}, pitch: 0}, park: {zone: "home", at: {x: 24, z: 52.8, y: .12, yaw: Math.PI}, pitch: -.05},
  yard: {zone: "ground", at: {x: 0, z: 22, y: 0, yaw: 0}, pitch: 0}, pitch: {zone: "ground", at: {x: 0, z: -1, y: 0, yaw: 0}, pitch: -.1},
  "town-road": {zone: "town", at: {x: 0, z: 4, y: .12, yaw: Math.PI/2}, pitch: 0}};
const CAREER_AT = Date.UTC(2026, 9, 5, 8, 0, 0);

const browser = await chromium.launch({headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]});
async function open(which, gfx, v){
  const ctx = await browser.newContext({viewport: {width: 1280, height: 720}});
  await ctx.addInitScript(({gfx}) => {
    let s = 1; Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0)/4294967296; };
    window.__qa = {frozen: true}; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => window.__qa.frozen ? 0 : raf(cb);
    try { localStorage.setItem("freyaFootball.gfx", gfx); } catch(e){}
  }, {gfx});
  // every request answered from disk: /base/... from the base tree, /new/... from this one, anything else empty
  await ctx.route("**/*", route => {
    const u = new URL(route.request().url()), m = /^\/(base|new)(\/.*)$/.exec(decodeURIComponent(u.pathname));
    // (the online backend, web fonts: answered empty, as qa/lib.mjs does)
    if (u.origin !== ORIGIN || !m) return route.fulfill({status: 200, body: "", contentType: /\.m?js(\?|$)/.test(u.pathname) || /firebase/.test(u.href) ? "text/javascript" : /\.css|fonts/.test(u.href) ? "text/css" : "text/plain"});
    const f = path.join(ROOTS[m[1]], m[2] === "/" ? "/index.html" : m[2]);
    fs.readFile(f, (e, d) => e ? route.fulfill({status: 404, body: ""}) : route.fulfill({status: 200, body: d, contentType: MIME[path.extname(f)] || "application/octet-stream", headers: {"Cache-Control": "no-store"}}));
  });
  const page = await ctx.newPage(); page.errs = [];
  page.on("pageerror", e => page.errs.push(e.message)); page.on("console", m => { if (m.type() === "error") page.errs.push(m.text()); });
  await page.goto(`${ORIGIN}/${which}/index.html`);
  await page.waitForFunction(() => typeof newCareer === "function" && typeof window.startLife === "function" && !!window.__life, null, {timeout: 120000});
  await page.evaluate(({v, now}) => {
    const realNow = Date.now; Date.now = () => now;
    CR = {name: "Test Player", number: 9, pos: "ST", pref: "ST", foot: "Right", nat: "RO", alloc: Object.fromEntries(SKILLS.map(([k]) => [k, 0])), pts: 30};
    newCareer(CR); for (const k in S.flags) S.flags[k] = true; S.tutDone = true; S.onb = {stage: "done"};
    document.body.classList.add("life"); A.sign(0); Date.now = realNow;
    S.life.min = 12*60; window.startLife({zone: v.zone});
    const L = __life; L.enterZone(v.zone, typeof v.at === "string" ? v.at : "bus"); if (typeof v.at === "object") L.place(v.at); L.P.pitch = v.pitch;
    if (L.FADE) { L.FADE.v = 0; L.FADE.boot = false; }
    for (let i = 0; i < 12; i++){ L.stepN(1); L.renderer().render(L.scene(), L.cam); }
  }, {v, now: CAREER_AT});
  page.ctx = ctx;
  return page;
}
const frame = p => p.evaluate(() => { const L = __life, R = L.renderer(), gl = R.getContext(), px = new Uint8Array(4); const t = performance.now(); R.render(L.scene(), L.cam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t; });
const rays = p => p.evaluate(() => { const L = __life, P = L.P; let best = Infinity;
  for (let r = 0; r < 5; r++){ const t = performance.now(); for (let i = 0; i < 1000; i++){ const k = i*2.399; L.camCast(P.x, P.eye, P.z, Math.cos(k), Math.sin(i*.7)*.4, Math.sin(k), 3); } best = Math.min(best, performance.now() - t); }
  return best; });
const steps = p => p.evaluate(() => { const L = __life, ms = []; for (let i = 0; i < 10; i++){ const t = performance.now(); L.stepN(1); ms.push(performance.now() - t); } return ms; });
const med = x => { const s = x.slice().sort((p, q) => p - q); return s.length ? s[s.length >> 1] : NaN; };

try {
  for (const view of VIEWS){
    const v = PLACES[view]; if (!v){ check(`${view}: a known view`, false, view); continue; }
    const pages = {newLow: await open("new", "low", v), baseLow: await open("base", "low", v), baseHigh: await open("base", "high", v)};
    const t = {newLow: [], baseLow: [], baseHigh: []}, r = {new: [], base: []}, s = {new: [], base: []};
    for (let k = 0; k < ROUNDS; k++){
      const order = k % 2 ? ["baseLow", "newLow"] : ["newLow", "baseLow"];
      for (const n of order) for (let i = 0; i < 3; i++) t[n].push(await frame(pages[n]));
      if (k < 3){ t.newLow.push(await frame(pages.newLow)); t.baseHigh.push(await frame(pages.baseHigh)); t.newLow.push(await frame(pages.newLow)); }
      r.new.push(await rays(pages.newLow)); r.base.push(await rays(pages.baseLow));
      s.new.push(...await steps(pages.newLow)); s.base.push(...await steps(pages.baseLow));
    }
    const res = {newLow: +med(t.newLow).toFixed(1), baseLow: +med(t.baseLow).toFixed(1), baseHigh: +med(t.baseHigh).toFixed(1),
      raysNew: +Math.min(...r.new).toFixed(2), raysBase: +Math.min(...r.base).toFixed(2), stepNew: +med(s.new).toFixed(3), stepBase: +med(s.base).toFixed(3),
      errors: Object.values(pages).flatMap(p => p.errs).slice(0, 5)};
    res.lowRatio = +(res.newLow/res.baseLow).toFixed(3); res.highRatio = +(res.newLow/res.baseHigh).toFixed(3);
    res.rayRatio = +(res.raysNew/res.raysBase).toFixed(3); res.stepRatio = +(res.stepNew/res.stepBase).toFixed(3);
    out.views[view] = res;
    console.log(`${view}: Low ${res.newLow} ms against base Low ${res.baseLow} and base High ${res.baseHigh}; rays ${res.raysNew} against ${res.raysBase} ms; step ${res.stepNew} against ${res.stepBase} ms`);
    check(`low ${view}: render at most 50% of the base tree's Low`, res.lowRatio <= .5, {ratio: res.lowRatio});
    check(`low ${view}: render at most 35% of the base tree's High`, res.highRatio <= .35, {ratio: res.highRatio});
    check(`${view}: 1000 camera rays from this view's eye, against the base tree`, true, {ratio: res.rayRatio}, true);
    check(`${view}: a world step costs at most 10% over the base tree's`, res.stepRatio <= 1.1, {ratio: res.stepRatio});
    check(`${view}: no errors in either tree`, !res.errors.length, res.errors);
    for (const p of Object.values(pages)) await p.ctx.close();
  }
  // the camera collision along the scripted walk
  {
    const W = {zone: "home", at: {x: -27, z: 4.6, y: .12, yaw: -Math.PI/2}, pitch: 0};
    const pages = {new: await open("new", "low", W), base: await open("base", "low", W)};
    const walk = p => p.evaluate(() => { const L = __life, P = L.P; let total = 0;
      for (let x = -27; x <= 33; x += 5){
        L.place({x, z: 4.6, y: .12, yaw: -Math.PI/2}); L.stepN(1);
        let best = Infinity;
        for (let r = 0; r < 3; r++){ const t = performance.now(); for (let i = 0; i < 1000; i++){ const k = i*2.399; L.camCast(P.x, P.eye, P.z, Math.cos(k), Math.sin(i*.7)*.4, Math.sin(k), 3); } best = Math.min(best, performance.now() - t); }
        total += best;
      }
      return total; });
    const t = {new: [], base: []};
    for (let k = 0; k < 3; k++) for (const n of k % 2 ? ["base", "new"] : ["new", "base"]) t[n].push(await walk(pages[n]));
    const res = {new: +Math.min(...t.new).toFixed(2), base: +Math.min(...t.base).toFixed(2), errors: Object.values(pages).flatMap(p => p.errs).slice(0, 5)};
    res.ratio = +(res.new/res.base).toFixed(3);
    out.walk = res;
    console.log(`walk: camera rays ${res.new} ms against ${res.base} ms`);
    check("the 60 m walk: camera rays at most 30% of the base tree's time", res.ratio <= .3, {ratio: res.ratio});
    check("the 60 m walk: no errors in either tree", !res.errors.length, res.errors);
    for (const p of Object.values(pages)) await p.ctx.close();
  }
} finally { await browser.close(); }
report("wpA-ab", out);
console.log(out.ok ? "wpA-ab: pass" : "wpA-ab: FAIL");
expect(out.ok, "wpA-ab failed");
