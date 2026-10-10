// qa/wpH2-hud.mjs: the first day's HUD on every screen it is played on, and the first day's clock (DESIGN 3.7.4,
// 2.4 WP-H2; the P1 leftovers: a phone on its side, the compass at 390 px wide, the clock's pace).
// Owner: WP-H2 (Stage 2).
//
//   node qa/wpH2-hud.mjs        exits 1 on any failed check, console error or page error; writes qa/out/wpH2-hud.json
//                               and qa/out/wpH2-hud-<w>x<h>.png
//
// A career on the first morning (8:00 AM, outside its block) with an objective, a line being said by the uncle and a
// how-to with a key in it, all up at once, at 1280x720, 1366x768, 1920x1080, 844x390 (a phone on its side) and
// 390x844 (upright). Nothing may overlap: the clock, the money, the need bars, the compass and its markers, the
// objective, the line being said, the how-to and the pockets each keep their own place, and all of them stay on screen.
// Then the clock: stepped at 60 frames a second, the first day passes 6 game minutes a real minute standing still
// and about 10 on the move (DESIGN 3.7.4: 6 to 10), at home and at the training centre; after the first day it is the
// usual 30 and 51.
import {launch, report, freeze, CAREER_AT} from "./lib.mjs";

const out = {checks: [], ok: false, sizes: {}};
const check = (what, ok, detail) => { out.checks.push({what, ok: !!ok, detail}); console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${detail !== undefined ? "  " + JSON.stringify(detail).slice(0, 300) : ""}`); };
const SIZES = [[1280, 720], [1366, 768], [1920, 1080], [844, 390], [390, 844]];
const errors = [];

async function dayOne(page){
  await page.evaluate(now => {
    const real = Date.now; Date.now = () => now;
    try { careerShell(); applyCreation({name: "Andrei Popa", number: 9, pos: "ST", pref: "ST", foot: "Right", nat: "RO", alloc: Object.fromEntries(SKILLS.map(([k]) => [k, 0])), pts: 30}); document.body.classList.add("life"); A.sign(0); } finally { Date.now = real; }
    S.home.win = {state: "broken", at: absNow()}; S.home.ballPending = true;
    S.flags.FirstTimeIntroductionCompleted = true; S.onb = {v: 2, step: "H1", seen: {}};
    window.startLife({zone: "home", at: {x: -9.5, z: 5.3, y: .12, yaw: -1.16}});
  }, CAREER_AT);
  await page.waitForFunction(() => window.__life.presented >= 2, null, {timeout: 120000});
  await freeze(page);
}

try {
  for (const [w, h] of SIZES){
    const {page, close} = await launch({gfx: "low", seed: 11, w, h});
    try {
      await dayOne(page);
      await page.evaluate(async () => {
        const fd = await import("./js/life/firstday.js"), L = window.__life;
        L.stepN(30);
        fd.speak("Uncle Nelu", "The furniture shop next to your block sells them. They're €3. Go grab one.");
        fd.hint(`<span>Your hands only carry one thing at a time. The two slots at the bottom are your pockets. Press <kbd>1</kbd>.</span>`, 60000);
        L.stepN(110);
        L.renderer().render(L.scene(), L.cam);
      });
      await page.screenshot({path: `qa/out/wpH2-hud-${w}x${h}.png`, timeout: 180000});
      const r = await page.evaluate(() => {
        const box = e => { if (!e) return null; const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? {l: b.left, t: b.top, r: b.right, b: b.bottom} : null; };
        const q = s => box(document.querySelector(s));
        const marks = [...document.querySelectorAll("#lifeCompass .cp-mk")].filter(e => +getComputedStyle(e).opacity > .05).map(box).filter(Boolean);
        return {W: innerWidth, H: innerHeight, compass: q("#lifeCompass"), clock: q("#lifeRoot .hud-clock"), ctx: q("#lifeRoot .hud-ctx"), money: q("#lifeRoot .hud-money"), needs: q("#lifeRoot .hud-needs"),
          goal: q("#onbGoal.on"), say: q("#onbSay.on"), hint: q("#onbHint.on"), inv: q("#lifeInv"), marks};
      });
      out.sizes[`${w}x${h}`] = r;
      const hit = (a, b, m = 2) => a && b && a.l < b.r - m && b.l < a.r - m && a.t < b.b - m && b.t < a.b - m;
      const on = a => a && a.l >= -1 && a.t >= -1 && a.r <= r.W + 1 && a.b <= r.H + 1;
      const pairs = [["compass", "clock"], ["compass", "ctx"], ["compass", "money"], ["compass", "needs"], ["goal", "clock"], ["goal", "ctx"], ["goal", "needs"], ["goal", "compass"],
        ["goal", "say"], ["goal", "hint"], ["say", "needs"], ["say", "hint"], ["say", "inv"], ["say", "clock"], ["hint", "inv"], ["hint", "needs"], ["say", "compass"]];
      const bad = pairs.filter(([a, b]) => hit(r[a], r[b])).map(p => p.join("/"));
      // the compass's markers: clear of the bars, the objective and the line
      for (const m of r.marks) for (const k of ["needs", "goal", "say", "clock", "money"]) if (hit(m, r[k])) bad.push(`marker/${k}`);
      const missing = ["compass", "clock", "money", "needs", "goal", "say", "hint", "inv"].filter(k => !r[k]);
      const off = ["compass", "clock", "money", "needs", "goal", "say", "hint", "inv"].filter(k => r[k] && !on(r[k]));
      check(`${w}x${h}: the clock, money, bars, compass, objective, line, how-to and pockets all show, on screen, none over another`, !bad.length && !missing.length && !off.length, {bad: [...new Set(bad)], missing, off});
      errors.push(...page.errors);
    } finally { await close(); }
  }

  // the clock, at 60 frames a second
  const {page, close} = await launch({gfx: "low", seed: 12});
  try {
    await dayOne(page);
    const rate = await page.evaluate(() => {
      const cv = document.getElementById("lifeCanvas"); Object.defineProperty(document, "pointerLockElement", {configurable: true, get: () => cv});
      const L = __life, out = {};
      const run = (frames, move) => {
        if (move) dispatchEvent(new KeyboardEvent("keydown", {key: "w", bubbles: true}));
        const m0 = S.life.min;
        for (let i = 0; i < frames; i++){ L.stepN(1, 1/60); if (move && (i + 1) % 50 === 0) L.P.yaw += Math.PI; }
        const m1 = S.life.min;
        if (move) dispatchEvent(new KeyboardEvent("keyup", {key: "w", bubbles: true}));
        L.stepN(30, 1/60);
        return +((m1 - m0)/(frames/60)*60).toFixed(2);
      };
      out.homeIdle = run(1200, false); out.homeMove = run(1200, true); out.slowHome = window.lifeFirstDay.slow();
      // at the training centre with the tour to do
      const seen = S.onb.seen; for (let i = 1; i <= 21; i++) seen["H" + i] = true; seen.G1 = true; seen.metCoach = true;
      S.life.min = 10*60; L.enterZone("ground", "bus"); L.stepN(30);
      out.cur = window.lifeFirstDay.currentId(); out.slowGround = window.lifeFirstDay.slow();
      out.groundIdle = run(1200, false);
      // after the first day: the usual clock
      for (const k in S.flags) S.flags[k] = true; S.onb.step = "done"; L.stepN(5);
      out.doneIdle = run(600, false); out.slowDone = window.lifeFirstDay.slow();
      return out;
    });
    out.clock = rate;
    check("the first day at home: 6 game minutes a real minute standing still", Math.abs(rate.homeIdle - 6) < .3 && rate.slowHome, rate);
    check("  and 6 to 10 on the move", rate.homeMove >= 6 && rate.homeMove <= 10.5, rate);
    check("the first day at the training centre, on the tour (G2): the same slow clock", rate.cur === "G2" && rate.slowGround && Math.abs(rate.groundIdle - 6) < .3, rate);
    check("after the first day: the usual 30 a real minute", Math.abs(rate.doneIdle - 30) < 1 && !rate.slowDone, rate);
    errors.push(...page.errors);
  } finally { await close(); }
  check("no console or page errors", errors.length === 0, errors.slice(0, 5));
} catch(e){
  check("the run finished", false, String(e && e.stack || e).slice(0, 600));
} finally {
  out.ok = out.checks.every(c => c.ok);
  report("wpH2-hud", out);
  console.log(out.ok ? "wpH2-hud: pass" : "wpH2-hud: FAIL");
  process.exit(out.ok ? 0 : 1);
}
