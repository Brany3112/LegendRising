// qa/wpD-audio.mjs: the match's sound, every cue made by WebAudio from nothing.
// Owner: WP-D (pitch mesh, stadium, crowd, audio). Contract: DESIGN 1.4.17 (AUD), 3.3.6, 2.3 WP-D acceptance.
//
//   node qa/wpD-audio.mjs        writes qa/out/wpD-audio.json, exits 1 on a failed check
//
// Checks:
//   defer    AUD.init() before any user gesture makes no AudioContext, waits for one, and the page logs no warning or
//            error about audio; the first gesture (a click, as the pointer-lock click is) makes the context
//   cues     every cue, the crowd's bed and a team-mate's call play once there is a context; at most 12 sounds at once;
//            each cue rendered offline is a real sound (not silence) of about the length the design gives it
//   files    no audio file is ever asked for (no request for an audio type or extension), and no file of WP-D's
//            loads one (no new Audio(, no decodeAudioData, no fetch, no audio extension in the source)
//   speech   the call's spoken name follows the setting: off in freyaFootball.ctrl means no speech
import fs from "node:fs";
import path from "node:path";
import {launch, ROOT, BASE, report} from "./lib.mjs";

const res = {checks: {}, ok: false, errors: []};
const fail = (k, msg) => { res.checks[k] = Object.assign(res.checks[k] || {}, {ok: false}); (res.checks[k].why = res.checks[k].why || []).push(msg); };
const done = (k, data) => { res.checks[k] = Object.assign({ok: true}, res.checks[k] || {}, data); if (res.checks[k].why) res.checks[k].ok = false; };

/* ---------- the sources ---------- */
{
  const files = ["js/life/football/audio.js", "js/life/football/stadium.js", "js/life/football/crowd.js", "js/life/football/pitchmesh.js"];
  const bad = [];
  for (const f of files){
    const src = fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    for (const [re, what] of [[/new\s+Audio\s*\(/, "new Audio("], [/decodeAudioData/, "decodeAudioData"], [/\bfetch\s*\(/, "fetch("], [/\.(mp3|ogg|wav|m4a|aac|flac|opus)\b/i, "an audio file extension"], [/XMLHttpRequest/, "XMLHttpRequest"]])
      if (re.test(src)) bad.push(`${f}: ${what}`);
  }
  res.checks.files = {sources: files.length, found: bad};
  if (bad.length) fail("files", bad.join("; "));
}

const {browser, close} = await launch({gfx: "low", seed: 2});
const warnings = [], requests = [];
// a context of its own, never touched by a test call before the check: the test's calls into a page count as a user
// gesture to the browser (and that stays with the page), so the sound is asked for by a script of the page itself, as
// it loads. Requests off this server are answered empty, as lib.mjs does
const context = await browser.newContext({viewport: {width: 1280, height: 720}});
await context.route(url => !String(url).startsWith(BASE), route => {
  const u = route.request().url();
  route.fulfill({status: 200, body: "", contentType: /\.css|fonts\.googleapis/.test(u) ? "text/css" : /\.m?js(\?|$)/.test(u) ? "text/javascript" : "text/plain"});
});
const page = await context.newPage();
page.errors = [];
page.on("pageerror", e => page.errors.push("pageerror: " + (e && e.message)));
page.on("console", m => { if (m.type() === "warning" || m.type() === "error") warnings.push(`${m.type()}: ${m.text()}`); if (m.type() === "error") page.errors.push("console.error: " + m.text()); });
page.on("request", r => { const u = r.url(); if (r.resourceType() === "media" || /\.(mp3|ogg|wav|m4a|aac|flac|opus)(\?|$)/i.test(u)) requests.push(u); });
try {
  /* ---------- before a gesture ---------- */
  // (the page says on its console when it is done: the test must not call into it before then, or that call would be
  // the gesture)
  // (imported once the document is parsed, so through the page's import map as the game imports it: imported before
  // the map is read, the page would warn that the map's entry for audio.js conflicts with a module already resolved)
  await context.addInitScript(() => {
    const go = () => import("/js/life/football/audio.js").then(m => {
      const A = m.AUD, act = navigator.userActivation ? navigator.userActivation.hasBeenActive : null;
      const r = A.init(), s = A.state();
      // nothing plays, nothing throws
      const cue = A.cue("kick", null, 1), call = A.call("Popescu", {x: 0, y: 1.7, z: 3}, 3), bed = A.crowd(.6, .2);
      A.listener({x: 0, y: 1.7, z: 0}, 0);
      window.__AUD = A; window.__pre = {activated: act, init: r, state: s, cue, call, bed};
      console.log("wpd-audio-ready");
    });
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go, {once: true}); else go();
  });
  const ready = page.waitForEvent("console", {predicate: m => m.text() === "wpd-audio-ready", timeout: 60000});
  await page.goto(BASE + "index.html", {waitUntil: "commit"});
  await ready;
  const before = await page.evaluate(() => window.__pre);
  await page.waitForTimeout(300);
  res.checks.defer = {before, warningsBefore: warnings.slice()};
  if (before.activated) fail("defer", "the page counted as activated before any gesture: the check means nothing");
  if (before.init !== false || before.state.ctx) fail("defer", `init() before a gesture made a context: ${JSON.stringify(before.state)}`);
  if (!before.state.armed) fail("defer", "init() before a gesture is not waiting for one");
  if (before.cue || before.call || before.bed) fail("defer", "a sound claimed to play with no context");
  if (warnings.length) fail("defer", `the page logged: ${warnings.join(" | ")}`);
  /* ---------- the gesture ---------- */
  await page.mouse.click(5, 5);
  await page.waitForFunction(() => window.__AUD.state().ctx, null, {timeout: 10000}).catch(() => {});
  const after = await page.evaluate(async () => { const s = window.__AUD.state(); return s; });
  res.checks.defer.after = after;
  if (!after.ctx) fail("defer", "the first gesture made no context");
  if (after.armed) fail("defer", "still waiting for a gesture after one");
  if (!res.checks.defer.why) done("defer");
  console.log(`defer: before a gesture ${JSON.stringify(before.state)}, after one ${JSON.stringify(after)}; page warnings ${warnings.length}`);

  /* ---------- playing ---------- */
  const play = await page.evaluate(async () => {
    const A = window.__AUD, names = ["whistleShort", "whistleLong", "whistleTriple", "kick", "bounce", "post", "net", "board", "crowdOoh", "crowdRoar", "crowdGroan"];
    const out = {played: {}, voicesMax: 0};
    A.listener({x: 0, y: 1.7, z: 0}, 0);
    for (const n of names){ out.played[n] = A.cue(n, n === "kick" ? {x: 2, y: .1, z: -3} : null, .8); out.voicesMax = Math.max(out.voicesMax, A.state().voices); }
    for (let i = 0; i < 20; i++){ A.cue("kick", {x: i, y: .1, z: 0}, .5); out.voicesMax = Math.max(out.voicesMax, A.state().voices); }
    out.call = A.call("Popescu", {x: 6, y: 1.75, z: -4}, 11);
    out.bed = A.crowd(.7, .3);
    out.state = A.state();
    out.ctxState = out.state.state;
    out.unknown = A.cue("trumpet", null, 1);
    await new Promise(r => setTimeout(r, 400));
    A.dispose();
    out.afterDispose = A.state();
    return out;
  });
  // offline renders: each cue's samples, its peak and how long it sounds
  const offline = await page.evaluate(async () => {
    const A = window.__AUD, out = {};
    for (const n of ["whistleShort", "whistleLong", "whistleTriple", "kick", "bounce", "post", "net", "board", "crowdOoh", "crowdRoar", "crowdGroan", "call"]){
      const d = await A.render(n, 4, 22050);
      if (!d){ out[n] = null; continue; }
      let peak = 0, sum = 0, last = 0;
      for (let i = 0; i < d.length; i++){ const v = Math.abs(d[i]); peak = Math.max(peak, v); sum += v*v; if (v > .002) last = i; }
      out[n] = {peak: +peak.toFixed(4), rms: +Math.sqrt(sum/d.length).toFixed(5), seconds: +(last/22050).toFixed(3), finite: d.every(Number.isFinite)};
    }
    return out;
  });
  res.checks.cues = {play, offline};
  for (const [n, ok] of Object.entries(play.played)) if (!ok) fail("cues", `${n} did not play`);
  if (play.voicesMax > 12) fail("cues", `${play.voicesMax} sounds at once (at most 12)`);
  if (!play.call) fail("cues", "the call did not play");
  if (!play.bed || !play.state.bed) fail("cues", "the crowd's bed did not start");
  if (play.unknown) fail("cues", "an unknown cue claimed to play");
  if (play.afterDispose.bed) fail("cues", "the bed went on after dispose()");
  // how long each should sound (DESIGN 3.3.6), with room for the release
  const LEN = {whistleShort: [.2, .4], whistleLong: [.8, 1.05], whistleTriple: [1.25, 1.5], kick: [.05, .25], bounce: [.05, .25], post: [.3, .75], net: [.25, .5], board: [.12, .4],
    crowdOoh: [.6, 1.6], crowdRoar: [1.4, 2.6], crowdGroan: [.7, 1.8], call: [.15, .35]};
  for (const [n, r] of Object.entries(offline)){
    if (!r){ fail("cues", `${n}: no offline render`); continue; }
    if (!r.finite || r.peak < .01) fail("cues", `${n}: silent or broken (${JSON.stringify(r)})`);
    if (r.peak > 1.5) fail("cues", `${n}: peaks at ${r.peak}`);
    const [a, b] = LEN[n]; if (r.seconds < a || r.seconds > b) fail("cues", `${n}: sounds for ${r.seconds} s (expected ${a} to ${b})`);
  }
  if (!res.checks.cues.why) done("cues");
  console.log(`cues: ${Object.values(play.played).filter(Boolean).length}/11 played live, ${play.voicesMax} at most at once, context ${play.ctxState}; offline: ${Object.entries(offline).map(([n, r]) => `${n} ${r ? r.seconds + "s" : "none"}`).join(", ")}`);

  /* ---------- speech follows the setting ---------- */
  const sp = await page.evaluate(async () => {
    const A = window.__AUD, said = [];
    const real = window.speechSynthesis;
    const fake = {getVoices: () => [{name: "x"}], speak: u => said.push(u.text), cancel(){}};
    Object.defineProperty(window, "speechSynthesis", {configurable: true, get: () => fake});
    A.init();
    localStorage.setItem("freyaFootball.ctrl", JSON.stringify({speech: false}));
    A.call("Ionescu", {x: 1, y: 1.7, z: 1}, 2);
    await new Promise(r => setTimeout(r, 300));
    const off = said.length;
    localStorage.setItem("freyaFootball.ctrl", JSON.stringify({speech: true}));
    A.call("Ionescu", {x: 1, y: 1.7, z: 1}, 2);
    await new Promise(r => setTimeout(r, 300));
    Object.defineProperty(window, "speechSynthesis", {configurable: true, get: () => real});
    localStorage.removeItem("freyaFootball.ctrl");
    A.dispose();
    return {off, on: said.length - off, said};
  });
  res.checks.speech = sp;
  if (sp.off !== 0) fail("speech", "the name was spoken with speech off");
  if (sp.on !== 1 || sp.said[sp.said.length - 1] !== "Ionescu") fail("speech", `with speech on the name was not spoken once (${JSON.stringify(sp)})`);
  if (!res.checks.speech.why) done("speech");

  res.checks.files.requests = requests.slice();
  if (requests.length) fail("files", `audio files asked for: ${requests.join(", ")}`);
  if (!res.checks.files.why) done("files");
  console.log(`files: ${res.checks.files.found.length} loaders in the sources, ${requests.length} audio requests`);
  res.errors = page.errors.slice();
  res.ok = Object.values(res.checks).every(c => c.ok !== false) && !page.errors.length;
} catch(e){ res.errors.push(String(e && e.stack || e)); res.ok = false; }
finally { await close(); }
report("wpD-audio", res);
for (const [k, c] of Object.entries(res.checks)) if (c.ok === false) console.log(`FAIL ${k}: ${(c.why || []).join("; ")}`);
if (res.errors.length) console.log("errors:\n" + res.errors.join("\n"));
console.log(res.ok ? "wpD-audio: ok" : "wpD-audio: FAILED");
process.exit(res.ok ? 0 : 1);
