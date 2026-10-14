// qa/tr3b-lib.mjs: helpers the Phase 3 Training tests of P3-B share (tr3-hub, tr3-cones, tr3-runner).
// Owner: P3-B (TR-3). Contract: BUILD-PLAN section 0 "Definition of done" item 7 (the career is never written while
// Training runs) and "QA conventions" (real input, visibility). Uses lib.mjs's storageSpy, careerSnapshot and
// careerDiff when lib.mjs has them (P3-A adds them); the stand-ins below do the same over the same keys otherwise.
//
//   const t = await trainLaunch({seed: 3});          // a page on the title, with the write spy and the title spies on
//   await enterByButton(t.page);                      // a real click on the title's Training button: the hub is up
import * as LIB from "./lib.mjs";
import {clickReal, assertVisible, lockPointer, pressReal, settle} from "./trlib.mjs";

export {clickReal, assertVisible, lockPointer, pressReal, settle};
const CAREER = /^freyaFootball\.v2(\.slot\d+|\.meta\d+|\.one)?$/;

// the write spy (DoD 7): every setItem, removeItem and clear, with whether Training was on (train:enter to train:exit)
function spyInit(){
  const log = window.__qaWrites = [];
  let on = false;
  addEventListener("train:enter", () => { on = true; }, true);
  addEventListener("train:exit", () => { setTimeout(() => { on = false; }, 0); }, true);
  const P = Storage.prototype, wrap = name => { const f = P[name]; P[name] = function(k){ try { log.push({op: name, key: name === "clear" ? "*" : String(k), t: performance.now(), training: on}); } catch(e){} return f.apply(this, arguments); }; };
  wrap("setItem"); wrap("removeItem"); wrap("clear");
}
// the listener and timer counters (10 enter/exit cycles add none): net listeners on window, document and body, and
// the intervals and timeouts still pending
function countInit(){
  const C = window.__qaCount = {listeners: 0, timers: new Set(), intervals: new Set()};
  for (const T of [EventTarget.prototype]){
    const add = T.addEventListener, rem = T.removeEventListener, seen = new WeakMap();
    T.addEventListener = function(type, fn, o){
      if (fn && (this === window || this === document || this === document.body)){
        const cap = !!(o === true || (o && o.capture)), k = type + (cap ? "!" : "");
        let m = seen.get(this); if (!m){ m = new Map(); seen.set(this, m); }
        let s = m.get(k); if (!s){ s = new Set(); m.set(k, s); }
        if (!s.has(fn)){ s.add(fn); C.listeners++; }
      }
      return add.apply(this, arguments);
    };
    T.removeEventListener = function(type, fn, o){
      if (fn && (this === window || this === document || this === document.body)){
        const cap = !!(o === true || (o && o.capture)), m = seen.get(this), s = m && m.get(type + (cap ? "!" : ""));
        if (s && s.delete(fn)) C.listeners--;
      }
      return rem.apply(this, arguments);
    };
  }
  const st = window.setTimeout, ct = window.clearTimeout, si = window.setInterval, ci = window.clearInterval;
  window.setTimeout = function(fn, ms, ...a){ let id; id = st.call(window, (...x) => { C.timers.delete(id); if (typeof fn === "function") fn(...x); }, ms, ...a); C.timers.add(id); return id; };
  window.clearTimeout = function(id){ C.timers.delete(id); return ct.call(window, id); };
  window.setInterval = function(...a){ const id = si.apply(window, a); C.intervals.add(id); return id; };
  window.clearInterval = function(id){ C.intervals.delete(id); return ci.call(window, id); };
}
// the title's career starts, counted (A.continue, A.newGame): a Training test must never see one
async function spyTitle(page){
  await page.evaluate(() => {
    if (window.__qaStarts) return;
    const s = window.__qaStarts = {continue: 0, newGame: 0};
    for (const k of ["continue", "newGame"]){ const f = A[k]; A[k] = function(){ s[k]++; return f.apply(this, arguments); }; }
  });
}

export async function trainLaunch(o = {}){
  const t = await LIB.launch(Object.assign({gfx: "low"}, o));
  if (LIB.storageSpy) await LIB.storageSpy(t.page);
  await t.context.addInitScript(spyInit);
  if (o.count) await t.context.addInitScript(countInit);
  // (the init scripts run on the next navigation: the title again, with them in place)
  await t.page.reload();
  await t.page.waitForFunction(() => typeof newCareer === "function" && typeof window.startLife === "function" && !!window.__life && document.readyState !== "loading", null, {timeout: 60000});
  await spyTitle(t.page);
  return t;
}
export const starts = page => page.evaluate(() => Object.assign({}, window.__qaStarts));
export const v2Writes = page => page.evaluate(src => { const re = new RegExp(src); return (window.__qaWrites || []).filter(w => w.key === "*" || re.test(w.key)); }, CAREER.source);
export const trainWrites = page => page.evaluate(src => { const re = new RegExp(src); return (window.__qaWrites || []).filter(w => w.training && (w.key === "*" || re.test(w.key))); }, CAREER.source);

// the career keys (freyaFootball.v2 and its slots, metas and one) as they are now; and what changed between two
export async function careerSnapshot(page){
  if (LIB.careerSnapshot) return LIB.careerSnapshot(page);
  return page.evaluate(src => { const re = new RegExp(src), o = {}; for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if (re.test(k)) o[k] = localStorage.getItem(k); } return o; }, CAREER.source);
}
export function careerDiff(a, b){
  if (LIB.careerDiff) return LIB.careerDiff(a, b);
  const out = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[k] !== b[k]) out.push(k);
  return out;
}
export const trainKeysNow = page => page.evaluate(() => Object.keys(localStorage).filter(k => /^freyaFootball\.(trainPresets|tipFS)$/.test(k)));

// the title ready for input (its entrance over)
export async function titleReady(page){
  await page.waitForFunction(() => !!document.querySelector(".ts.t-ready"), null, {timeout: 30000});
  await settle(page, ".ts-train");
}
// the hub up: the sheet open on kind trainhub, Training on
export const hubUp = page => page.waitForFunction(() => { const r = document.querySelector("#sheetRoot.open"); return !!r && r.dataset.kind === "trainhub" && !!window.__trainHub && window.__trainHub.hubOpen(); }, null, {timeout: 120000});
export const hubState = page => page.evaluate(() => { const r = document.querySelector("#sheetRoot"); return {open: !!(r && r.classList.contains("open")), kind: r ? r.dataset.kind : null, h2: (document.querySelector("#sheetRoot .th h2") || {}).textContent || null, hub: !!(window.__trainHub && window.__trainHub.hubOpen())}; });
// into Training the player's way: a real click on the title's Training button; resolves once the hub is up
export async function enterByButton(page){
  await titleReady(page);
  const v = await assertVisible(page, ".ts-train");
  if (!v.ok) throw new Error("the Training button is not visible: " + v.why);
  await clickReal(page, ".ts-train");
  await hubUp(page);
  return v;
}
// out of Training the player's way: the hub's Exit to title (the hub opened first with Esc out of the cage if needed)
export async function exitByHub(page){
  const st = await hubState(page);
  if (!st.hub) await page.evaluate(() => window.__trainHub.openHub());
  await hubUp(page);
  await clickReal(page, '#sheetRoot [data-th="exit"]');
  await page.waitForFunction(() => !!document.querySelector(".ts") && !(window.__life && window.__life.LIFE.running), null, {timeout: 60000});
}
// the world's state of Training now
export const trainState = page => page.evaluate(() => ({S: typeof S === "undefined" ? "undef" : S === null ? null : "career", running: !!(window.__life && window.__life.LIFE.running), zone: window.__life ? window.__life.LIFE.zone : null,
  mode: window.__life ? window.__life.modes.mode() : null, classes: [...document.body.classList].filter(c => /^(mode-|fp-|drillview|life$)/.test(c))}));
