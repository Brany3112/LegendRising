// qa/trlib.mjs: real-input helpers every Training Mode and football rework test shares (BUILD-PLAN section 0, "QA
// conventions": cards, buttons and keys are pressed for real, with page.mouse at the element's on-screen box or with
// page.keyboard, under pointer lock where the game holds the pointer; element.click() is not acceptance evidence).
// Owner: P2-A (TR-2, Phase 2). Contract: BUILD-PLAN P2-A "New files" (clickReal, assertVisible, pressReal, cpuMs);
// TRAINING-SPEC section 2 (half time traced in real use).
//
//   import {clickReal, assertVisible, pressReal, cpuMs, lockPointer, boxOf} from "./trlib.mjs";
//   const v = await assertVisible(page, '.fp-overlay.ht button[data-ht="go"]');   // {ok, why, ...}
//   await clickReal(page, '.fp-overlay.ht button[data-ht="go"]');                 // page.mouse at the box centre
//   const ms = await cpuMs(page, () => page.evaluate(() => window.__life.stepN(60)));

// the element's on-screen box (the first match of the selector, or null)
export async function boxOf(page, selector){
  return page.evaluate(sel => {
    const el = document.querySelector(sel); if (!el) return null;
    const r = el.getBoundingClientRect();
    return {x: r.left + r.width/2, y: r.top + r.height/2, left: r.left, top: r.top, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight};
  }, selector);
}

// Is the element what a user sees and hits? At its centre the topmost element is it (or inside it), it lies wholly
// inside the viewport, the black cover (#lifeFade) is not opaque above it (or sits under it), and the screenshot of
// its box has some non-black pixels. Resolves {ok, why, box, top, fade, lum}.
// the element come to rest: a card springs in (fp.css fpIn), so it is measured once no animation runs on it or on what
// holds it, after real frames (a page whose own requestAnimationFrame is stopped by lib.mjs freeze() still has the
// browser's frames, __qa.realRAF, which move the animations on)
export async function settle(page, selector, ms = 2500){
  return page.evaluate(([sel, ms]) => new Promise(res => {
    const raf = window.__qa && window.__qa.realRAF ? window.__qa.realRAF : requestAnimationFrame, t0 = performance.now();
    const busy = el => { for (let n = el; n; n = n.parentElement) if (n.getAnimations && n.getAnimations().some(a => a.playState === "running" && (a.effect && a.effect.getComputedTiming().iterations !== Infinity))) return true; return false; };
    const tick = () => { const el = document.querySelector(sel); if (!el || !busy(el) || performance.now() - t0 > ms) return res(!!el); raf(() => raf(tick)); };
    raf(() => raf(tick));
  }), [selector, ms]);
}
export async function assertVisible(page, selector, {pixels = true} = {}){
  await settle(page, selector);
  const box = await boxOf(page, selector);
  if (!box) return {ok: false, why: "no such element", box: null};
  const info = await page.evaluate(([sel, x, y]) => {
    const el = document.querySelector(sel), top = document.elementFromPoint(x, y);
    const fe = document.getElementById("lifeFade"), cs = fe ? getComputedStyle(fe) : null;
    // the stacking order the cover and the element's own layer have: the cover above only matters when it is above it
    const layer = e => { for (let n = e; n && n !== document.body; n = n.parentElement){ const z = getComputedStyle(n).zIndex; if (getComputedStyle(n).position !== "static" && z !== "auto") return +z; } return 0; };
    const fadeOp = cs ? +cs.opacity : 0, fadeZ = cs ? +cs.zIndex || 0 : 0, elZ = layer(el);
    return {hit: !!top && (top === el || el.contains(top)), top: top ? (top.id ? "#" + top.id : top.tagName.toLowerCase()) + (typeof top.className === "string" && top.className ? "." + top.className.trim().split(/\s+/).join(".") : "") : null,
      fadeOp, fadeZ, elZ, coverAbove: fadeOp > .5 && fadeZ >= elZ};
  }, [selector, box.x, box.y]);
  const inside = box.left >= 0 && box.top >= 0 && box.left + box.w <= box.vw + .5 && box.top + box.h <= box.vh + .5 && box.w > 0 && box.h > 0;
  let lum = null;
  if (pixels && inside){
    const png = await page.screenshot({clip: {x: Math.max(0, box.left), y: Math.max(0, box.top), width: Math.max(1, Math.min(box.w, box.vw - box.left)), height: Math.max(1, Math.min(box.h, box.vh - box.top))}, timeout: 120000});
    lum = await page.evaluate(async b64 => {
      const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const g = c.getContext("2d"); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let lit = 0, max = 0;
      for (let i = 0; i < d.length; i += 4){ const l = .3*d[i] + .59*d[i + 1] + .11*d[i + 2]; if (l > 24) lit++; if (l > max) max = l; }
      return {lit: lit/(d.length/4), max};
    }, png.toString("base64"));
  }
  const why = !info.hit ? `covered at its centre by ${info.top}` : !inside ? "not wholly inside the viewport" : info.coverAbove ? "under the black cover" :
    lum && lum.lit < .02 ? "its pixels are black" : "";
  return {ok: !why, why, box, top: info.top, fade: info.fadeOp, coverAbove: info.coverAbove, lum};
}

// a row of a long sheet brought into view the player's way: the mouse wheel over the sheet until the element is wholly
// on screen and nothing covers its centre (TR-6 integration: the hub's lists grew with the Phase 6 drills, so a row
// registered last can start below the fold). Resolves false when there is no such element or it never comes into view
export async function scrollReal(page, sel, {tries = 40} = {}){
  for (let k = 0; k < tries; k++){
    const r = await page.evaluate(sel => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(), s = document.querySelector("#sheetRoot .sheet");
      const sb = s ? s.getBoundingClientRect() : {top: 0, bottom: innerHeight, left: 0, width: innerWidth}; const foot = document.querySelector("#sheetRoot .th-foot"), fb = foot && !foot.contains(e) && getComputedStyle(foot).position === "sticky" ? foot.getBoundingClientRect().top : Infinity;
      return {top: b.top, bottom: b.bottom, min: Math.max(0, sb.top) + 8, max: Math.min(innerHeight, sb.bottom, fb) - 8, x: sb.left + sb.width/2, hit: (h => !!h && (h === e || e.contains(h)))(document.elementFromPoint(b.left + b.width/2, b.top + b.height/2))}; }, sel);
    if (!r) return false;
    if (r.top >= r.min && r.bottom <= r.max && r.hit) return true;
    await page.mouse.move(r.x, (r.min + r.max)/2);
    await page.mouse.wheel(0, r.bottom > r.max ? 240 : -240);
    await page.waitForTimeout(80);
  }
  return false;
}

// a real click on the element's centre (page.mouse: move, down, up), as a hand would make it. Throws when there is none
export async function clickReal(page, selector, {button = "left", hold = 60} = {}){
  await settle(page, selector);
  const box = await boxOf(page, selector);
  if (!box) throw new Error(`clickReal: no element ${selector}`);
  await page.mouse.move(box.x, box.y, {steps: 2});
  await page.mouse.down({button});
  if (hold) await page.waitForTimeout(hold);
  await page.mouse.up({button});
  return box;
}

// a real key press (page.keyboard), held for `hold` ms
export async function pressReal(page, key, {hold = 40} = {}){
  await page.keyboard.down(key);
  if (hold) await page.waitForTimeout(hold);
  await page.keyboard.up(key);
}

// the pointer locked on the game's canvas the way a player does it: a real click on the 3D view (world.js locks on a
// click of the canvas). Resolves the id of the element holding the lock, or null
export async function lockPointer(page, {x = null, y = null, tries = 3} = {}){
  // (already held: no click, which under pointer lock would be a left-button press in the game)
  const held = await pointerLocked(page);
  if (held) return held;
  for (let i = 0; i < tries; i++){
    const at = await page.evaluate(() => ({w: innerWidth, h: innerHeight}));
    await page.mouse.click(x != null ? x : Math.round(at.w*.5), y != null ? y : Math.round(at.h*.62));
    for (let k = 0; k < 20; k++){
      const id = await page.evaluate(() => document.pointerLockElement ? document.pointerLockElement.id || "?" : null);
      if (id) return id;
      await page.waitForTimeout(25);
    }
  }
  return null;
}
export function pointerLocked(page){ return page.evaluate(() => document.pointerLockElement ? document.pointerLockElement.id || "?" : null); }

// the page's main-thread CPU time (ms) spent while fn runs: CDP Performance.getMetrics ThreadTime (under SwiftShader
// wall time also counts the wait on the GPU process, perf-3 correction)
export async function cpuMs(page, fn){
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable", {timeDomain: "threadTicks"});
  const tt = async () => { const m = await cdp.send("Performance.getMetrics"); const r = m.metrics.find(x => x.name === "ThreadTime"); return r ? r.value*1000 : NaN; };
  const t0 = await tt();
  const out = await fn();
  const t1 = await tt();
  await cdp.detach().catch(() => {});
  return {ms: t1 - t0, out};
}
