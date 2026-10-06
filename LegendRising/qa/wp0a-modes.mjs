// qa/wp0a-modes.mjs: WP-0A acceptance for the mode registry, the input router, the clock, saving and the boot cover.
// Owner: WP-0A (DESIGN 2.2 WP-0A acceptance; contracts 1.4.1, 1.4.20, 3.7.1).
//
//   static   world.js at most 650 lines, at most 6 lines naming DRILL, no em dash (U+2014) in world.js or js/life/core,
//            and nothing left of the lifeDream hook
//   frozen   a test mode with clock 'frozen' entered for 600 steps leaves S.life.min unchanged (plain life, same steps,
//            moves it), save() returns without writing (deferred) and persistNow() writes once
//   input    a pushed handler that consumes keydown blocks the life handler, popping restores it; a mode's own input
//            comes before life's
//   gating   the drill, cine and build modes: their flags, no aiming, the key-hint timer paused in a cinematic, Escape
//            gives a drill up, a zone change ends a drill
//   clock    setClockScale slows the passive clock; running charges the clock's run rate when the day has one
//   events   onbEmit 'zone' on a zone change and 'aim' when what you aim at changes
//   hud      the multi-line prompt (spot.lines), the breath arc shown short of breath and hidden at full
//   text     the trust chips print the real delta with a real minus sign
//   boot     startLife covers the screen before #lifeRoot shows, the first drawn frames are covered, the cover lifts
//            after them; a boot plan with cover keeps it; revealAfterFrames resolves after presented frames
//   hooks    the __life additions of 1.4.20
import fs from "node:fs";
import path from "node:path";
import {launch, career, freeze, unfreeze, report, ROOT} from "./lib.mjs";

const checks = [];
const check = (name, ok, detail) => {
  checks.push({name, ok: !!ok, detail});
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail !== undefined ? ": " + (typeof detail === "string" ? detail : JSON.stringify(detail)) : ""}`);
};

/* ---------- static ---------- */
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const world = read("js/life/world.js");
const wLines = world.split("\n").length - (world.endsWith("\n") ? 1 : 0);
check("world.js is at most 650 lines", wLines <= 650, `${wLines} lines`);
const drillLines = world.split("\n").filter(l => l.includes("DRILL")).length;
check("at most 6 lines of world.js name DRILL", drillLines <= 6, `${drillLines}`);
const core = fs.readdirSync(path.join(ROOT, "js/life/core")).filter(f => f.endsWith(".js")).map(f => "js/life/core/" + f);
const dashes = ["js/life/world.js", ...core].map(f => [f, (read(f).match(/\u2014/g) || []).length]).filter(([, n]) => n);
check("no em dash in world.js or js/life/core", !dashes.length, dashes.length ? dashes : `${core.length + 1} files`);
const heads = core.filter(f => !/Owner: WP-/.test(read(f).slice(0, 600)) || !/Contract: DESIGN/.test(read(f).slice(0, 600)));
check("every core module names its owner and contract in its header", !heads.length, heads.length ? heads : `${core.length} modules`);
check("the lifeDream hook is gone", ![world, ...core.map(read)].some(s => s.includes("lifeDream")));

/* ---------- in the page ---------- */
const {page, close} = await launch({gfx: "low", seed: 5});
try {
  await career(page, {zone: "home", at: "bed", min: 12*60});
  await freeze(page);

  // frozen mode, saves deferred
  const fz = await page.evaluate(async () => {
    const L = __life, out = {}, key = slotKey(SLOT);
    const realMode = window.lifeMode; window.lifeMode = () => "hand";      // the passive clock runs with the phone in your hand
    let writes = 0;
    const set0 = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, v){ if (k === key) writes++; return set0.call(this, k, v); };
    try {
      let t0 = S.life.day*1440 + S.life.min;
      L.stepN(600);
      out.lifeMins = S.life.day*1440 + S.life.min - t0;
      L.modes.register("qa-frozen", {enter(){}, exit(){}, flags:{clock:"frozen", saves:"defer"}});
      L.modes.enterMode("qa-frozen");
      out.mode = L.modes.mode(); out.cls = document.body.classList.contains("mode-qa-frozen");
      t0 = S.life.day*1440 + S.life.min;
      L.stepN(600);
      out.frozenMins = S.life.day*1440 + S.life.min - t0;
      // whatever save the career's own start left pending lands first (career.js save() waits 800 ms, then for an idle moment)
      await new Promise(r => setTimeout(r, 2500));
      writes = 0;
      out.saveRet = save();
      out.due = L.save.due;
      L.stepN(200);                                              // the loop's quiet-moment flush must wait too
      await new Promise(r => setTimeout(r, 1500));               // and no timer of save() lands later
      out.writesAfterSave = writes;
      L.modes.persistNow();
      out.writesAfterPersist = writes;
      out.dueAfter = L.save.due;
      L.modes.exitMode();
      out.modeAfter = L.modes.mode(); out.clsAfter = document.body.classList.contains("mode-qa-frozen");
    } finally { window.lifeMode = realMode; Storage.prototype.setItem = set0; }
    return out;
  });
  check("plain life: 600 steps move the clock", fz.lifeMins > 4, `${fz.lifeMins.toFixed(3)} game minutes`);
  check("frozen mode entered with its body class", fz.mode === "qa-frozen" && fz.cls, fz);
  check("frozen mode: 600 steps leave S.life.min unchanged", fz.frozenMins === 0, `${fz.frozenMins}`);
  check("frozen mode: save() returns without writing (deferred)", fz.saveRet === true && fz.due && fz.writesAfterSave === 0, `returned ${fz.saveRet}, due ${fz.due}, ${fz.writesAfterSave} writes`);
  check("persistNow() writes once", fz.writesAfterPersist === 1 && !fz.dueAfter, `${fz.writesAfterPersist} writes`);
  check("exitMode() is back in life", fz.modeAfter === "life" && !fz.clsAfter);

  // the input router
  const ir = await page.evaluate(() => {
    const L = __life, out = {}, view = () => S.life.view === "tp" ? "tp" : "fp", v0 = view();
    let seen = 0;
    const h = ev => { if (ev.type === "keydown" && ev.key === "v"){ seen++; return true; } return false; };
    L.modes.pushInput(h);
    L.keysDown(["v"]); L.keysUp(["v"]);
    out.blocked = {seen, view:view(), v0};
    L.modes.popInput(h);
    L.keysDown(["v"]); L.keysUp(["v"]);
    out.restored = {seen, view:view(), v0};
    if (view() !== v0){ L.keysDown(["v"]); L.keysUp(["v"]); }
    // a mode's own input comes before life's, after anything pushed
    let modeSaw = 0;
    L.modes.register("qa-input", {enter(){}, exit(){}, input:ev => { if (ev.type === "keydown" && ev.key === "v"){ modeSaw++; return true; } return false; }});
    L.modes.enterMode("qa-input");
    L.keysDown(["v"]); L.keysUp(["v"]);
    out.mode = {modeSaw, view:view(), v0};
    L.modes.exitMode();
    // and a held key goes into keys through the life handler
    L.keysDown(["w"]); out.w = !!L.keys.w; L.keysUp(["w"]); out.wUp = !!L.keys.w;
    return out;
  });
  check("a pushed handler that consumes keydown blocks the life handler", ir.blocked.seen === 1 && ir.blocked.view === ir.blocked.v0, ir.blocked);
  check("popping it restores the life handler", ir.restored.seen === 1 && ir.restored.view !== ir.restored.v0, ir.restored);
  check("a mode's own input comes before life's", ir.mode.modeSaw === 1 && ir.mode.view === ir.mode.v0, ir.mode);
  check("held keys reach keys through the router", ir.w && !ir.wUp, ir);

  // cinematic: frozen clock, no aiming, the key-hint timer paused, the HUD's mode class; then life again
  const cn = await page.evaluate(() => {
    const L = __life, out = {}, kh = () => document.getElementById("lifeKeys").classList.contains("faded");
    document.getElementById("lifeKeys").classList.remove("faded"); L.keysT = 15;
    L.cineBegin({me:"hide"});
    out.mode = L.modes.mode(); out.flags = Object.assign({}, L.modes.flags()); out.top = L.cam.top();
    L.stepN(900);                                               // 15 s: the hints would have faded
    out.heldInCine = L.held; out.keysT = L.keysT; out.fadedInCine = kh(); out.cls = document.body.classList.contains("mode-cine");
    L.cineEnd();
    out.modeAfter = L.modes.mode(); out.topAfter = L.cam.top();
    L.stepN(600);                                               // 10 s more in life: they fade
    out.fadedAfter = kh();
    return out;
  });
  check("cine: mode, frozen clock, locked movement, no aiming, camera owner cine", cn.mode === "cine" && cn.flags.clock === "frozen" && cn.flags.movement === "locked" && cn.flags.targeting === false && cn.top === "cine" && cn.heldInCine === null && cn.cls, {mode: cn.mode, top: cn.top, clock: cn.flags.clock});
  check("cine: the key-hint timer is paused", !cn.fadedInCine && Math.abs(cn.keysT - 15) < 1e-9, `keysT ${cn.keysT}`);
  check("after cineEnd: life, life-fp owns the camera, the hint timer runs again", cn.modeAfter === "life" && cn.topAfter === "life-fp" && cn.fadedAfter, cn);

  // the drill mode at the training ground
  const dr = await page.evaluate(() => {
    const L = __life, out = {};
    S.energy = 90; S.fatigue = 10;
    L.enterZone("ground", "bus");
    L.ctx.drill("shoot");
    out.mode = L.modes.mode(); out.flags = Object.assign({}, L.modes.flags()); out.drill = !!L.drill;
    L.stepN(3);
    out.held = L.held; out.top = L.cam.top();
    L.keysDown(["Escape"]); L.keysUp(["Escape"]);
    out.after = {mode:L.modes.mode(), drill:!!L.drill};
    L.ctx.drill("shoot"); L.stepN(2);
    out.again = L.modes.mode();
    L.enterZone("ground", "bus");                               // a zone change gives it up
    out.afterZone = {mode:L.modes.mode(), drill:!!L.drill, drillY:L.P.drillY};
    return out;
  });
  check("drill: mode drill with the clock its own, saves deferred, no third person, paused on unlock", dr.mode === "drill" && dr.drill && dr.flags.clock === "own" && dr.flags.saves === "defer" && dr.flags.tp === false && dr.flags.pauseOnUnlock === true, {mode: dr.mode, flags: dr.flags});
  check("drill: nothing is aimed at, your eyes own the camera (no shot of its own)", dr.held === null && dr.top === "life-fp", {held: dr.held, top: dr.top});
  check("drill: Escape gives it up and you are back in life", dr.after.mode === "life" && !dr.after.drill, dr.after);
  check("drill: a zone change ends it", dr.again === "drill" && dr.afterZone.mode === "life" && !dr.afterZone.drill && dr.afterZone.drillY === 0, dr.afterZone);

  // the clock's rate and what running costs
  const ck = await page.evaluate(() => {
    const L = __life, out = {};
    const realMode = window.lifeMode; window.lifeMode = () => "hand";
    const dp0 = window.dailyPass, acts = {};
    window.dailyPass = function(m, act){ acts[act] = (acts[act] || 0) + m; return dp0.apply(this, arguments); };
    try {
      L.enterZone("ground", {x:0, z:-10, y:0, yaw:Math.PI/2});
      L.stepN(30);
      let t0 = S.life.day*1440 + S.life.min; L.stepN(600); out.normal = S.life.day*1440 + S.life.min - t0;
      L.modes.setClockScale(() => .2);
      t0 = S.life.day*1440 + S.life.min; L.stepN(600); out.slow = S.life.day*1440 + S.life.min - t0;
      L.modes.setClockScale(null);
      // a sprint across the pitch, with no rate for running in the day yet, then with one
      for (const k in acts) delete acts[k];
      L.keys.w = L.keys.shift = true; L.stepN(150); L.keys.w = L.keys.shift = false; L.stepN(60);
      out.noRun = Object.assign({}, acts); out.mode1 = L.P.moveMode;
      L.place({x:0, z:-10, y:0, yaw:Math.PI/2});
      ACT.run = Object.assign({}, ACT.walk);
      for (const k in acts) delete acts[k];
      L.keys.w = L.keys.shift = true; L.stepN(150); L.keys.w = L.keys.shift = false; L.stepN(30);
      out.withRun = Object.assign({}, acts);
      delete ACT.run;
    } finally { window.lifeMode = realMode; window.dailyPass = dp0; L.keys.w = L.keys.shift = false; }
    return out;
  });
  check("setClockScale(0.2) slows the passive clock to a fifth", ck.normal > 4 && Math.abs(ck.slow/ck.normal - .2) < .02, {normal: ck.normal, slow: ck.slow});
  check("running: walking pace while the day has no run rate", !ck.noRun.run && ck.noRun.walk > 0, ck.noRun);
  check("running: the clock charges ACT.run once the day has it", ck.withRun.run > 0, ck.withRun);

  // the first day's listener: 'zone' and 'aim'
  const ev = await page.evaluate(() => {
    const L = __life, seen = [], prev = window.lifeOnb;
    window.lifeOnb = (e, d) => { seen.push([e, d && (d.zone || d.label || null)]); if (prev) prev(e, d); };
    try {
      L.enterZone("ground", {x:-8.4, z:-15.2, y:0, yaw:Math.PI/2});
      L.stepN(2);
    } finally { window.lifeOnb = prev; }
    return {seen, held:L.held && L.held.label};
  });
  check("onbEmit('zone') on a zone change", ev.seen.some(([e, z]) => e === "zone" && z === "ground"), ev.seen);
  check("onbEmit('aim') when what you aim at changes", ev.seen.some(([e, l]) => e === "aim" && l && l === ev.held), {held: ev.held, seen: ev.seen});

  // the HUD: lines under the prompt, the breath arc
  const hu = await page.evaluate(() => {
    const L = __life, P = L.P, out = {};
    L.place({x:0, z:-12, y:0, yaw:0});
    const sp = {x:0, z:-12.6, y:1.2, r:2, label:"QA spot", hint:"Tap E", get lines(){ return ["First line", "Second line"]; }, run(){}};
    L.W.spots.push(sp);
    L.stepN(2);
    const el = document.querySelector("#lifePrompt .lp-lines");
    out.held = L.held === sp; out.lines = el ? [...el.children].map(s => s.textContent) : null;
    L.W.spots.splice(L.W.spots.indexOf(sp), 1);
    L.hud.breath(40, 90);
    const br = document.querySelector("#lifeRoot .lf-breath");
    out.short = br ? br.style.opacity : null;
    L.hud.breath(90, 90);
    out.full = br ? br.style.opacity : null;
    return out;
  });
  check("a spot's lines are shown under the prompt", hu.held && JSON.stringify(hu.lines) === JSON.stringify(["First line", "Second line"]), hu);
  check("the breath arc shows short of breath and hides at full", hu.short === "1" && hu.full === "0", hu);

  // the trust chips say the real change, with a real minus
  const tx = await page.evaluate(() => {
    const chips = [], c0 = FEED.chip;
    FEED.chip = (t, k) => { chips.push(t); };
    try {
      dailyEmit("late", {d:-3, min:620});
      dailyEmit("settled", {d:1.2, k:"good", chem:0});
      dailyEmit("settled", {d:-1, k:"early", chem:0});
      dailyEmit("settled", {d:-8, k:"absent+habit", chem:0});
    } finally { FEED.chip = c0; }
    return chips;
  });
  check("trust chips print the real delta", JSON.stringify(tx) === JSON.stringify(["Late for training · Manager trust −3", "Full session · Manager trust +1.2", "Left training early · Manager trust −1", "Missed training · Manager trust −8"]), tx);

  // the boot cover, in real frames
  await unfreeze(page);
  const bt = await page.evaluate(async () => {
    const L = __life, out = {}, fade = document.getElementById("lifeFade"), root = document.getElementById("lifeRoot");
    const frames = n => new Promise(r => { const p0 = L.presented, go = () => L.presented >= p0 + n ? r() : requestAnimationFrame(go); requestAnimationFrame(go); });
    const wait = ms => new Promise(r => setTimeout(r, ms));
    // a covered start: the fade is up before the world shows, and the first frames drawn are behind it
    // (the loop the harness froze and let go again is let run out first: one loop from here on)
    stopLife(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    root.style.display = "none"; fade.style.transition = "none"; fade.style.opacity = "0";
    let atShow = null;
    const mo = new MutationObserver(() => { if (atShow === null && root.style.display === "block") atShow = fade.style.opacity; });
    mo.observe(root, {attributes:true, attributeFilter:["style"]});
    const samples = [];
    const p0 = L.presented;
    startLife({zone:"home", at:"bed"});
    await new Promise(r => { let n = 0; const s = () => { samples.push([L.presented - p0, L.fade]); if (++n < 90) requestAnimationFrame(s); else r(); }; requestAnimationFrame(s); });
    mo.disconnect();
    await wait(700);
    out.atShow = atShow; out.samples = samples; out.after = L.fade; out.boot = L.FADE.boot;
    // a boot plan that covers keeps the cover until it lifts it itself
    stopLife();
    L.modes.bootPlan(() => ({zone:"home", at:"bed", cover:true}));
    startLife();
    await frames(20); await wait(700);
    out.planCovered = L.fade; out.planCine = document.body.classList.contains("cine");
    const t0 = L.presented;
    const got = await L.modes.revealAfterFrames(2);
    out.revealAfter = L.presented - t0; out.revealOwner = got;
    L.modes.bootPlan(null); document.body.classList.remove("cine");
    fade.style.transition = "opacity 200ms ease"; fade.style.opacity = "0";
    await wait(400);
    return out;
  });
  const firstDrawn = bt.samples.filter(([n]) => n >= 1 && n <= 2);
  check("startLife covers the screen before #lifeRoot shows", bt.atShow === "1", `opacity ${bt.atShow}`);
  check("the first frames drawn are behind the cover", firstDrawn.length > 0 && firstDrawn.every(([, f]) => f >= .98), firstDrawn);
  check("the cover lifts after the frames", bt.after < .02 && bt.boot === false, `opacity ${bt.after}`);
  check("a boot plan with cover keeps it", bt.planCovered >= .98 && bt.planCine, {covered: bt.planCovered, cine: bt.planCine});
  check("revealAfterFrames(2) resolves after two presented frames, naming the owner", bt.revealAfter >= 2 && bt.revealAfter <= 4 && bt.revealOwner === "life-fp", {frames: bt.revealAfter, owner: bt.revealOwner});

  // the __life additions of 1.4.20
  const hk = await page.evaluate(() => {
    const L = __life;
    return {stepN:typeof L.stepN, keysDown:typeof L.keysDown, keysUp:typeof L.keysUp, modes:["mode", "enterMode", "exitMode", "flags"].every(k => typeof L.modes[k] === "function"),
      sched:typeof L.sched.task === "function" && typeof L.sched.stats === "function", camTop:L.cam.top(), kicks:typeof L.cam.kicks, gfx:typeof L.gfx.apply === "function" && "P" in L.gfx,
      HOLD:!!L.HOLD && "sp" in L.HOLD, presented:typeof L.presented, fade:typeof L.fade, tiers:L.sched.stats().tiers.length};
  });
  check("__life has the 1.4.20 additions", hk.stepN === "function" && hk.keysDown === "function" && hk.keysUp === "function" && hk.modes && hk.sched && hk.camTop === "life-fp" && hk.kicks === "object" && hk.gfx && hk.HOLD && hk.presented === "number" && hk.fade === "number" && hk.tiers === 5, hk);
  check("no console or page errors", !page.errors.length, page.errors);
} catch(e){
  check("the script ran to the end", false, String(e && e.stack || e));
} finally {
  await close();
}
const ok = checks.every(c => c.ok);
report("wp0a-modes", {ok, checks});
console.log(ok ? "wp0a-modes: pass" : "wp0a-modes: FAIL");
process.exit(ok ? 0 : 1);
