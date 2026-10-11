// qa/wpH-boot.mjs: a New Game opens straight into the film, never on the flat (DESIGN 4.9 "immediate intro", 2.3 WP-H
// acceptance "boot cover", "order", "save gating", 3.7.1, 3.7.2).
// Owner: WP-H (Stage 1).
//
//   node qa/wpH-boot.mjs            exits 1 on any failed check, console error or page error; writes qa/out/wpH-boot.json
//                                   and screenshots qa/out/wpH-boot-*.png
//
// From the title screen, New Game is clicked for real. A hook on requestAnimationFrame records, after every frame the
// world presents, the opacity of #lifeFade and the camera's owner: until the film's first shot has faded in, every
// presented frame must be covered (opacity >= 0.98) or drawn by the camera owner cine, and no frame may ever be drawn
// by life-fp before the film is over (no glimpse of the flat, the bed or the HUD). The film is watched to its line
// "It's got character...", which must come before the creation screen; a reload on the creation screen leaves no save
// written and New Game starts again; then creation ("That's me") and the offers, and back in the world the body is the
// one created (its look's shape key equals bodyLook(S.player.look)'s). Continue of a career is covered too: no frame
// before the reveal shows anything but black.
import {launch, snap, report, expect} from "./lib.mjs";

const out = {checks: [], ok: false};
const check = (what, ok, detail) => { out.checks.push({what, ok: !!ok, detail}); console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${detail !== undefined ? "  " + JSON.stringify(detail).slice(0, 300) : ""}`); };

// after each animation frame of the page: what was on screen (the world's own frame counter tells a presented frame)
function frameHook(){
  const log = window.__frames = [];
  const raf = window.requestAnimationFrame.bind(window);
  let last = -1;
  window.requestAnimationFrame = cb => raf(t => {
    cb(t);
    const L = window.__life; if (!L) return;
    const n = L.presented; if (n === last || n === 0) return; last = n;
    const f = document.getElementById("lifeFade"), op = f ? +getComputedStyle(f).opacity : 0;
    log.push({n, op, owner: L.camera.top(), cine: document.body.classList.contains("cine"), life: document.body.classList.contains("life"), hud: !!document.querySelector("#lifeRoot .hud-tl") && getComputedStyle(document.querySelector("#lifeRoot .hud-tl")).opacity, t: performance.now()});
  });
}

const {page, context, close} = await launch({gfx: "low", seed: 3});
await context.addInitScript(frameHook);
try {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => typeof window.startLife === "function" && !!window.__life && !!document.querySelector(".slot.empty"), null, {timeout: 90000});
  const t0 = Date.now();
  await page.locator(".slot.empty").first().click();
  // black at once
  const black = await page.evaluate(() => !!document.querySelector(".onb-black"));
  check("New Game paints a black page at once", black);
  // the film: wait for its first line
  await page.waitForFunction(() => { const b = document.querySelector("#cineSub.on b"); return !!b && b.textContent === "Uncle Nelu"; }, null, {timeout: 240000, polling: 100});
  await snap(page, "wpH-boot-1-aerial");
  const early = await page.evaluate(() => window.__frames.slice());
  const firstShown = early.findIndex(f => f.op < .98);
  check("every frame before the reveal is covered or drawn by cine", early.every(f => f.op >= .98 || f.owner === "cine"), early.slice(0, 6));
  check("no frame of the flat (life-fp) before the film", early.every(f => f.owner !== "life-fp"), early.filter(f => f.owner === "life-fp").slice(0, 3));
  check("the first visible frame is the film's", firstShown >= 0 && early[firstShown].owner === "cine", early[firstShown]);
  // a frame or two into the window shot, the kick, the pavement
  await page.waitForFunction(() => { const p = document.querySelector("#cineSub.on p"); return !!p && /rent and bills/.test(p.textContent); }, null, {timeout: 240000, polling: 100});
  await page.waitForTimeout(1500);
  await snap(page, "wpH-boot-2-window");
  await page.waitForFunction(() => { const b = document.querySelector("#cineSub.on b"); return !!b && b.textContent === "Voice from the street"; }, null, {timeout: 240000, polling: 100});
  await snap(page, "wpH-boot-3-smash");
  await page.waitForFunction(() => { const p = document.querySelector("#cineSub.on p"); return !!p && /It's got character/.test(p.textContent); }, null, {timeout: 240000, polling: 100});
  await page.waitForTimeout(1200);
  await snap(page, "wpH-boot-4-uncle");
  const atLine = await page.evaluate(() => ({create: !!document.querySelector(".page.create"), made: S.flags.CharacterCreated}));
  check("creation has not started before the uncle's line", !atLine.create && atLine.made === false, atLine);
  // the creation screen comes after it
  await page.waitForSelector(".page.create", {timeout: 240000});
  const cr = await page.evaluate(() => ({h1: document.querySelector(".page.create h1").textContent, btn: [...document.querySelectorAll(".page.create .cc-foot .btn")].map(b => b.textContent), slot: localStorage.getItem(slotKey(SLOT)), flags: Object.assign({}, S.flags), ball: (S.drops || []).filter(d => d.item && d.item.id === "ball").length, win: S.home.win.state}));
  check("creation reads 'Who are you?' with 'That's me'", cr.h1 === "Who are you?" && cr.btn.includes("That's me"), cr);
  check("nothing is saved before the character exists", !cr.slot, cr.slot ? cr.slot.length : 0);
  check("the window is broken and the ball lies in the flat", cr.win === "broken" && cr.ball === 1, {win: cr.win, ball: cr.ball});
  await snap(page, "wpH-boot-5-create");
  // reload on the creation screen: still nothing saved, and New Game is there again
  await page.reload();
  await page.waitForFunction(() => typeof window.startLife === "function" && !!document.querySelector(".slot.empty"), null, {timeout: 90000});
  const after = await page.evaluate(() => ({slot: localStorage.getItem(slotKey(SLOT)), empty: !!document.querySelector(".slot.empty")}));
  check("a reload during creation writes no save and leaves New Game", !after.slot && after.empty, after);
  // and again, this time to the end: skip the film (Tab), make the player, sign
  await page.locator(".slot.empty").first().click();
  await page.waitForFunction(() => !!document.querySelector("#cineSub.on"), null, {timeout: 240000});
  await page.keyboard.press("Tab");
  await page.waitForSelector(".page.create", {timeout: 240000});
  await page.fill("#nm", "Andrei Popa");
  await page.locator(".cc-foot .btn", {hasText: "That's me"}).click();
  await page.waitForSelector(".offer .btn", {timeout: 60000});
  const off = await page.evaluate(() => ({h1: document.querySelector(".page h1").textContent, lede: document.querySelector(".page .lede").textContent}));
  check("offers read as written", off.h1 === "Three Liga 4 clubs want to see you. Pick one." && off.lede === "Your keypad phone only lets you take a basic deal. You can negotiate once you own a smartphone.", off);
  await snap(page, "wpH-boot-6-offers");
  const n0 = await page.evaluate(() => window.__frames.length);
  await page.locator(".offer .btn").first().click();
  await page.waitForFunction(() => { const p = document.querySelector("#cineSub.on p"); return !!p && /Good choice/.test(p.textContent); }, null, {timeout: 240000, polling: 100});
  await page.waitForTimeout(800);
  await snap(page, "wpH-boot-7-lastlines");
  const back = await page.evaluate(n => window.__frames.slice(n), n0);
  check("back from the offers: covered until cine draws, never life-fp", back.every(f => (f.op >= .98 || f.owner === "cine") && f.owner !== "life-fp"), back.slice(0, 4));
  await page.waitForFunction(() => S.flags.FirstTimeIntroductionCompleted === true && !document.body.classList.contains("cine"), null, {timeout: 240000, polling: 200});
  // (the objective is drawn by the step runner's next tick: waited for, not a fixed sleep, so a busy machine still passes)
  await page.waitForFunction(() => /^Go up to flat/.test((document.querySelector("#onbGoal.on span") || {}).textContent || ""), null, {timeout: 60000, polling: 100}).catch(() => {});
  const done = await page.evaluate(() => {
    const L = window.__life, me = L.ME.tp, pl = S.player.look, K = ["hair", "hairColor", "beard", "skin", "build", "height"];
    return {owner: L.camera.top(), step: S.onb.step, saved: !!localStorage.getItem(slotKey(SLOT)), goal: (document.querySelector("#onbGoal.on span") || {}).textContent || "",
      body: me && me.look ? K.map(k => me.look[k]) : null, want: K.map(k => pl[k]), owned: JSON.stringify(S.player.owned)};
  });
  check("control returns in your own eyes with the first objective", done.owner === "life-fp" && done.step === "H1" && /^Go up to flat \d0\d, floor \d$/.test(done.goal), done);
  check("the body in the world is the one created", !!done.body && JSON.stringify(done.body) === JSON.stringify(done.want), {body: done.body, want: done.want});
  check("the career is saved once it exists", done.saved);
  await snap(page, "wpH-boot-8-control");
  // Continue: the career comes back at the bed, and nothing is shown until two frames have been drawn behind the cover
  await page.evaluate(() => saveNow());
  await page.reload();
  await page.waitForFunction(() => typeof window.startLife === "function" && !!window.__life && !!document.querySelector(".slot-main"), null, {timeout: 90000});
  await page.locator(".slot-main").first().click();
  await page.waitForFunction(() => window.__frames.length >= 4, null, {timeout: 120000, polling: 100});
  const cont = await page.evaluate(() => ({frames: window.__frames.slice(0, 4), step: S.onb.step, film: S.flags.FirstTimeIntroductionCompleted}));
  check("Continue: the first two frames are drawn behind the cover", cont.frames.slice(0, 2).every(f => f.op >= .98), cont.frames);
  check("Continue: no film again, the first day goes on", cont.film === true && cont.step !== "intro" && cont.step !== "done", cont);
  await page.waitForTimeout(1500);
  await snap(page, "wpH-boot-9-continue");
  out.ms = Date.now() - t0;
} catch(e){ out.error = String(e && e.stack || e); console.log(out.error); }
finally {
  out.errors = page.errors.slice();
  out.ok = !out.error && !out.errors.length && out.checks.every(c => c.ok);
  if (out.errors.length) console.log("errors:\n  " + out.errors.join("\n  "));
  report("wpH-boot", out);
  await close();
}
console.log(out.ok ? "wpH-boot: pass" : "wpH-boot: FAIL");
process.exit(out.ok ? 0 : 1);
