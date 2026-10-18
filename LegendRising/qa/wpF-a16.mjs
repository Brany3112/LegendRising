// qa/wpF-a16.mjs: the fixes of addendum A1.6 that are not the bench's (the bench's are in qa/wpF-match.mjs).
// Owner: WP-F2 (Stage P2b). Contracts DESIGN 1.4.7 (stamina), 1.5.2, 1.5.10, 1.6, 3.1.6; addendum A1.3, A1.6.
//
//   - fatigue you can see: the vignette reads clearly from 40 breath down (on screen at 30), and near empty the picture
//     itself is greyed (a saturate filter on the canvas, gone again once the breath is back);
//   - a tired player holding sprint at a speed fatigue caps under the run speed keeps draining breath (it used to
//     count as a jog and fill back up); letting go of Shift recovers it;
//   - the late-match cap falls gradually over a whole match, by the Stamina stat (a normal match shows it), and is
//     lower for a low-stamina player than a high-stamina one;
//   - "Control hints" Off hides the hints (fp-nohints), On shows them again;
//   - a key let go while Ctrl, Alt or Meta is held is still let go (only presses with a modifier are ignored).
//
//   QA_PORT=8771 node qa/wpF-a16.mjs        exits 1 on any failed check; writes qa/out/wpF-a16.json
import path from "node:path";
import {launch, career, freeze, OUT} from "./lib.mjs";
import {checker} from "./wpF-lib.mjs";

const {check, done} = checker("wpF-a16");
const {page, close} = await launch({gfx: "low", seed: 7});
let ok = false;
try {
  await career(page, {zone: "ground", min: 15*60});
  await freeze(page);
  await page.evaluate(() => {
    const L = window.__life, F = window.__fp;
    window.__t = {
      enter(name, o){ if (F.state) F.exit(); F.enter("test:" + name, o || {}); L.stepN(2); return F.ms; },
      key(k, down){ F.input({type: down ? "keydown" : "keyup", key: k}); },
      steps(n){ for (let i = 0; i < n; i++) L.stepN(1); }
    };
  });

  // ---- 1. the vignette from 40 down, the grey near empty
  const S1 = await page.evaluate(() => {
    const T = window.__t, F = window.__fp, L = window.__life;
    T.enter("stamina");
    const me = F.me(), vig = () => +document.querySelector("#fpHud .fp-vig").style.opacity, cv = L.renderer().domElement;
    const at = B => { for (let i = 0; i < 90; i++){ me.st.B = B; T.steps(1); } return {vig: vig(), filter: cv.style.filter}; };
    const r = {b60: at(60), b38: at(38), b30: at(30), b15: at(15), b4: at(4)};
    r.back = at(90);
    return r;
  });
  check(S1.b60.vig === 0 && S1.b38.vig > .02 && S1.b30.vig >= .2 && S1.b15.vig > S1.b30.vig && S1.b4.vig > .6, "the fatigue vignette reads clearly from 40 breath down", S1);
  check(/saturate\(0\.\d+\)/.test(S1.b4.filter) && !S1.b30.filter && !S1.back.filter, "near empty the picture is greyed (the desaturation applied), and comes back", {b30: S1.b30.filter, b4: S1.b4.filter, back: S1.back.filter});
  await page.evaluate(() => { const T = window.__t, F = window.__fp; const me = F.me(); for (let i = 0; i < 60; i++){ me.st.B = 6; T.steps(1); } window.__life.renderer().render(window.__life.scene(), window.__life.cam); });
  await page.screenshot({path: path.join(OUT, "wpF-a16-tired.png"), timeout: 180000});

  // ---- 2. holding sprint, capped under the run speed by fatigue, keeps draining
  const S2 = await page.evaluate(() => {
    // (a player of low Sprint Speed: tired, his sprint is capped under his run speed)
    const T = window.__t, F = window.__fp, L = window.__life, ms = T.enter("stamina", {me: {pace: 30, sprintSpeed: 30, acceleration: 30}}), me = F.me();
    ms.ball.p.x = 40; ms.ball.p.z = 30; ms.poss.ctl = -1;
    L.P.yaw = -Math.PI/2; me.m.x = me.x0 = -45; me.m.z = me.z0 = 0; me.st.B = 4;
    T.key("w", true); T.key("shift", true);
    const B0 = me.st.B; let vmax = 0, rose = false, last = me.st.B;
    for (let i = 0; i < 240; i++){ T.steps(1); if (me.m.x > 45){ me.m.x = me.x0 = -45; } if (i > 60){ vmax = Math.max(vmax, me.m.speed); if (me.st.B > last + 1e-9) rose = true; } last = me.st.B; }
    const held = {B0, B: me.st.B, vmax, run: me.prm.run, rose};
    T.key("shift", false);
    for (let i = 0; i < 120; i++){ T.steps(1); if (me.m.x > 45){ me.m.x = me.x0 = -45; } }
    T.key("w", false);
    return {held, after: me.st.B};
  });
  check(S2.held.vmax < S2.held.run && !S2.held.rose && S2.held.B < S2.held.B0, "a tired player holding sprint below the run speed keeps draining breath", S2.held);
  check(S2.after > S2.held.B + 2, "letting go of Shift lets it come back", {held: S2.held.B, after: S2.after});

  // ---- 3. the late-match cap falls gradually over a whole match, by the Stamina stat
  const S3 = await page.evaluate(() => {
    const T = window.__t, F = window.__fp, out = {};
    for (const stamina of [30, 90]){
      T.enter("11v11", {me: {stamina}, seed: 5});
      const ms = F.ms, me = F.me(), caps = [];
      for (const sec of [900, 2700, 4200, 5300]){ F.headless(sec); const a = ms.agents[me.id]; caps.push({sec, cap: +a.st.cap.toFixed(1), energy: +a.energy.toFixed(1), on: a.onPitch}); }
      out[stamina] = caps;
    }
    F.exit();
    return out;
  });
  const end = s => S3[s][S3[s].length - 1], mono = s => S3[s].every((c, i) => !i || c.cap <= S3[s][i - 1].cap + 1e-9);
  check(mono(30) && mono(90) && end(30).cap < 96 && S3[30][0].cap > end(30).cap + 2, "the cap falls gradually over the match (a normal match shows it)", S3);
  check(end(30).cap < end(90).cap - 1, "and further for a low-stamina player than a high-stamina one", {stamina30: end(30), stamina90: end(90)});

  // ---- 4. Control hints Off hides them; On shows them
  const S4 = await page.evaluate(() => {
    const T = window.__t; T.enter("stamina"); T.steps(10);
    const hud = document.getElementById("fpHud"), shown = () => getComputedStyle(hud.querySelector(".fp-hints")).display !== "none" && hud.querySelector(".fp-hints").children.length > 0;
    const on0 = shown();
    window.fpSet("hints", false); T.steps(10);
    const off = {cls: hud.classList.contains("fp-nohints"), shown: shown()};
    // (and a fresh HUD, a match entered with the setting off)
    T.enter("stamina"); T.steps(10);
    const off2 = {cls: document.getElementById("fpHud").classList.contains("fp-nohints"), shown: getComputedStyle(document.querySelector("#fpHud .fp-hints")).display !== "none"};
    window.fpSet("hints", true); T.steps(10);
    return {on0, off, off2, on1: getComputedStyle(document.querySelector("#fpHud .fp-hints")).display !== "none"};
  });
  check(S4.on0 && S4.off.cls && !S4.off.shown && S4.off2.cls && !S4.off2.shown && S4.on1, "Control hints Off hides the hints (fp-nohints); On shows them", S4);

  // ---- 5. a key let go with a modifier held is let go; a press with one does nothing
  const S5 = await page.evaluate(() => {
    const T = window.__t, F = window.__fp; T.enter("stamina");
    const ev = (type, key, mod) => window.dispatchEvent(new KeyboardEvent(type, Object.assign({key, bubbles: true, cancelable: true}, mod ? {[mod]: true} : {})));
    const r = {};
    for (const mod of ["ctrlKey", "altKey", "metaKey"]){
      ev("keydown", "w"); T.steps(1); const held = !!F.ctrl.held.w;
      ev("keyup", "w", mod); T.steps(1);
      ev("keydown", "d", mod); T.steps(1);
      r[mod] = {held, released: !F.ctrl.held.w, pressIgnored: !F.ctrl.held.d};
      ev("keyup", "d");
    }
    return r;
  });
  check(Object.values(S5).every(x => x.held && x.released && x.pressIgnored), "a key let go with Ctrl, Alt or Meta held is let go; a press with one is ignored", S5);
  check(page.errors.length === 0, "zero console and page errors", page.errors.slice(0, 5));
  ok = true;
} catch (e){ console.log("FAILED", e.stack || e.message); check(false, "the run finished", String(e.message)); }
await close();
process.exit(done() && ok ? 0 : 1);
