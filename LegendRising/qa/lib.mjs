// qa/lib.mjs: the browser harness every QA script shares.
// Owner: I0 (DESIGN 2.0 "Test harness"); WP-0B extends it.
//
//   const {page, close} = await launch({gfx: "low", seed: 7});
//   await career(page, {zone: "ground"});      // a signed career standing in the world, two frames presented
//   await freeze(page);                         // the RAF loop stops; the test steps the world itself
//   await stepN(page, 120);
//   await snap(page, "ground-after");           // qa/out/ground-after.png
//   expect(page.errors.length === 0, page.errors.join("\n"));
//   await close();
//
// The port is QA_PORT (default 8765); a server for this tree is started in-process when nothing answers on it.
import fs from "node:fs";
import path from "node:path";
import {ensureServer, ROOT, HOST} from "./serve.mjs";

process.env.PLAYWRIGHT_BROWSERS_PATH ||= "/opt/pw-browsers";
const {chromium} = await import("/opt/node22/lib/node_modules/playwright/index.mjs");

export {ROOT};
export const PORT = +(process.env.QA_PORT || 8765);
export const BASE = `http://${HOST}:${PORT}/`;
export const OUT = path.join(ROOT, "qa", "out");
export const ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-precise-memory-info"];

// runs in the page before any of its scripts, on every navigation: a seeded Math.random (the project's mulberry32,
// the same generator as human.js rng()), the graphics setting, and a requestAnimationFrame that freeze() can stop
function pageInit({seed, gfx}){
  const mulberry32 = a => { let s = (a >>> 0) || 0x9e3779b9;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0)/4294967296; }; };
  let rnd = mulberry32(seed);
  Math.random = () => rnd();
  const raf = window.requestAnimationFrame.bind(window), caf = window.cancelAnimationFrame.bind(window);
  const qa = window.__qa = {
    seed(n){ rnd = mulberry32(n); },
    frozen: false, queue: new Map(), nextId: 1e9,
    // the page's real requestAnimationFrame, for the harness's own waits while the page's is stopped
    realRAF: raf
  };
  window.requestAnimationFrame = cb => {
    if (!qa.frozen) return raf(cb);
    const id = qa.nextId++; qa.queue.set(id, cb); return id;
  };
  window.cancelAnimationFrame = id => { if (qa.queue.has(id)) qa.queue.delete(id); else caf(id); };
  try { if (gfx) localStorage.setItem("freyaFootball.gfx", gfx); } catch(e){}
}

// a browser on the game. Resolves {browser, context, page, errors, close}; page.errors collects every console error
// and uncaught page error. Requests outside this server (web fonts, the online backend) are answered empty, so a run
// never depends on the network.
export async function launch({gfx = "low", query = "", w = 1280, h = 720, seed = 1, headless = true} = {}){
  const srv = await ensureServer(PORT);
  const browser = await chromium.launch({headless, args: ARGS});
  const context = await browser.newContext({viewport: {width: w, height: h}});
  await context.addInitScript(pageInit, {seed, gfx});
  await context.route(url => !String(url).startsWith(BASE), route => {
    const u = route.request().url();
    route.fulfill({status: 200, body: "", contentType: /\.css|fonts\.googleapis/.test(u) ? "text/css" : /\.m?js(\?|$)/.test(u) ? "text/javascript" : "text/plain"});
  });
  const page = await context.newPage();
  const errors = page.errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + (e && e.message) + "\n" + String(e && e.stack || "").split("\n").slice(1, 5).join("\n")));
  page.on("console", m => { if (m.type() === "error") errors.push("console.error: " + m.text() + (m.location() && m.location().url ? `  (${m.location().url}:${m.location().lineNumber})` : "")); });
  page.on("crash", () => errors.push("page crashed"));
  await page.goto(BASE + "index.html" + (query ? "?" + String(query).replace(/^\?/, "") : ""));
  await page.waitForFunction(() => typeof newCareer === "function" && typeof window.startLife === "function" && !!window.__life, null, {timeout: 60000});
  const close = async () => {
    await browser.close().catch(() => {});
    if (srv.started) await new Promise(r => srv.server.close(() => r()));
  };
  return {browser, context, page, errors, close};
}

// a signed career standing in the 3D world. Before WP-H lands this is the legacy path: newCareer(CR), and with
// onb "done" (the default) every first-day flag set and the dream marked done (any other onb leaves the old first-day
// introduction to start by itself); offer `club` signed; then the calendar is slept forward to `day`, the clock set to
// `min`, and startLife({zone, at}). Waits until `frames` frames have been presented (pass 0 for a page that was
// frozen first: nothing is presented until the test draws). Resolves the career's summary.
// The career is created at a fixed wall-clock moment (CAREER_AT): its id (S.cid) is the time in base 36 plus random
// digits, and the id seeds your body's look (look.js bodyLook), so with the seeded Math.random the same seed gives the
// same career, body and all.
export const CAREER_AT = Date.UTC(2026, 9, 5, 8, 0, 0);
export async function career(page, {pos = "ST", club = 0, day = 1, min = 9*60 + 30, zone = "ground", at = null, onb = "done", name = "Test Player", frames = 2, timeout = 120000} = {}){
  const info = await page.evaluate(({pos, club, day, min, zone, at, onb, name, now}) => {
    const realNow = Date.now; Date.now = () => now;
    try {
      CR = {name, number: 9, pos, pref: pos, foot: "Right", nat: "RO", alloc: Object.fromEntries(SKILLS.map(([k]) => [k, 0])), pts: 30};
      newCareer(CR);
      if (onb === "done"){ for (const k in S.flags) S.flags[k] = true; S.tutDone = true; S.onb = {stage: "done"}; }
      // A.sign walks a new career into the city itself unless the body is already in it: this call places it instead
      document.body.classList.add("life");
      A.sign(Math.max(0, Math.min(S.offerSet.list.length - 1, club)));
    } finally { Date.now = realNow; }
    // the play-time clock started inside newCareer took its first reading at that fixed moment: start it afresh
    clearInterval(PLAY_T); PLAY_T = null; startPlayClock();
    while (S.life.day < day){ S.life.min = 23*60; sleepNight(2); startNewDay(); }
    S.life.min = min;
    window.startLife(at ? {zone, at} : {zone});
    return {cid: S.cid, club: W.clubs[meP().club].nm, day: S.life.day, min: S.life.min, zone: LIFE.zone, pos: S.player.pos, pref: S.player.pref};
  }, {pos, club, day, min, zone, at, onb, name, now: CAREER_AT});
  if (frames > 0) await page.waitForFunction(n => window.__life && window.__life.presented >= n, frames, {timeout});
  return info;
}

// stop the page's RAF loop: from here the test drives the world with stepN. Waits two real frames so that a frame the
// loop had already asked for has run (and asked again, into the stopped queue).
export async function freeze(page){
  await page.evaluate(() => new Promise(r => { window.__qa.frozen = true; window.__qa.realRAF(() => window.__qa.realRAF(() => r())); }));
}
// let the page's RAF run again, handing it what it asked for while frozen
export async function unfreeze(page){
  await page.evaluate(() => { const qa = window.__qa; qa.frozen = false; const q = [...qa.queue.values()]; qa.queue.clear(); for (const cb of q) requestAnimationFrame(cb); });
}

// n frames of the world with nothing drawn (__life.stepN), at a fixed dt
export async function stepN(page, n, dt = 1/60){
  return page.evaluate(([n, dt]) => window.__life.stepN(n, dt), [n, dt]);
}

// reseed the page's Math.random
export async function seed(page, n){ await page.evaluate(n => window.__qa.seed(n), n); }

// a screenshot to qa/out/<name>.png. A frozen page draws the current state first, since nothing else will
export async function snap(page, name){
  fs.mkdirSync(OUT, {recursive: true});
  await page.evaluate(() => { const L = window.__life; if (window.__qa.frozen && L && L.renderer() && L.LIFE.running) L.renderer().render(L.scene(), L.cam); });
  const file = path.join(OUT, name.replace(/[^\w.-]+/g, "_") + ".png");
  await page.screenshot({path: file, timeout: 180000});      // SwiftShader composites the blurred HUD slowly
  return file;
}

export function expect(cond, msg){ if (!cond) throw new Error(msg || "expectation failed"); }

// write qa/out/<name>.json (the per-script report run.mjs and the integrator read)
export function report(name, data){
  fs.mkdirSync(OUT, {recursive: true});
  const file = path.join(OUT, name + ".json");
  fs.writeFileSync(file, JSON.stringify(data, null, 1));
  return file;
}
