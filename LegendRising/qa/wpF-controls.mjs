// qa/wpF-controls.mjs: the match controls and the camera (DESIGN 2.4 WP-F acceptance; 1.5.2, 1.5.3, 1.5.9, 1.6).
// Owner: WP-F (Stage P2).
//
// On the test fixtures of the real simulation (__fp.enter("test:<name>")), with the inputs the bot sends through
// __fp.input (the same path the router gives the keys and the mouse):
//   - a 6 s sprint drains B monotonically; with B < 20 top speed is <= 92% of fresh; B rises within 0.6 s of letting go
//     of Shift;
//   - with the ball at the feet, LMB held 0.6 s and released: contact <= 11 steps (0.18 s) after the release; with the
//     ball 1.5 m away: a stride adjust of <= 0.35 s, then contact or a scuff, and a kick event is always logged;
//   - a tapped pass over 10 to 40 m arrives at 8 to 10 m/s;
//   - per-frame camera rotation from kicks <= 0.6 degrees, total offset <= 3 degrees;
//   - no mouse input for 10 s while dribbling: P.pitch unchanged exactly (no auto pitch);
//   - every key of 1.6 dispatched as a KeyboardEvent has defaultPrevented === true; keys with Ctrl or Alt do nothing;
//   - receiving: the mean first-touch resting distance from 12 m/s passes is >= 1.1 m at control 30 and <= 0.5 m at 90
//     (how far the ball rolls on from where it was touched, cushioned standing: 1.5.3).
//
//   QA_PORT=8770 node qa/wpF-controls.mjs        exits 1 on any failed check; writes qa/out/wpF-controls.json
import {launch, career, freeze} from "./lib.mjs";
import {checker} from "./wpF-lib.mjs";

const {check, done} = checker("wpF-controls");
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
      btn(b, down){ F.input({type: down ? "down" : "up", button: b}); },
      steps(n){ for (let i = 0; i < n; i++) L.stepN(1); },
      // the simulation's own step count (live play runs a step a frame at 60 Hz)
      sstep: () => F.ms.step,
      kicksBy(id, from){ return F.ms.events.filter(e => e.kind === "kick" && e.agent === id && e.id >= from); }
    };
  });

  // ---- 1. the sprint and the breath (test:stamina: you alone, fresh)
  const S1 = await page.evaluate(() => {
    const T = window.__t, ms = T.enter("stamina"), F = window.__fp, me = F.me();
    ms.ball.p.x = 40; ms.ball.p.z = 30; ms.poss.ctl = -1;
    window.__life.P.yaw = -Math.PI/2;                 // facing +x along the pitch
    me.m.x = me.x0 = -45; me.m.z = me.z0 = 0;
    T.key("w", true); T.key("shift", true);
    const B = [], fresh = me.prm.sprint;
    let mono = true, last = me.st.B;
    for (let i = 0; i < 360; i++){ T.steps(1); B.push(me.st.B); if (me.st.B > last + 1e-9) mono = false; last = me.st.B; if (me.m.x > 45){ me.m.x = me.x0 = -45; } }
    // on until the breath is under 20, then the speed there
    let n = 0; while (me.st.B >= 19 && n++ < 1200){ T.steps(1); if (me.m.x > 45){ me.m.x = me.x0 = -45; } }
    T.steps(30);
    const vLow = me.m.speed, Blow = me.st.B;
    T.key("shift", false);
    const B0 = me.st.B; let rose = null;
    for (let i = 1; i <= 60; i++){ T.steps(1); if (me.st.B > B0 + 1e-6 && rose == null) rose = i/60; if (me.m.x > 45){ me.m.x = me.x0 = -45; } }
    T.key("w", false);
    return {mono, B6: B[B.length - 1], fresh, vLow, Blow, rose};
  });
  check(S1.mono && S1.B6 < 100, "a 6 s sprint drains B monotonically", {mono: S1.mono, after6s: +S1.B6.toFixed(1)});
  check(S1.Blow < 20 && S1.vLow <= .92*S1.fresh, "with B < 20 top speed is <= 92% of fresh", {B: +S1.Blow.toFixed(1), v: +S1.vLow.toFixed(2), fresh: +S1.fresh.toFixed(2), share: +(S1.vLow/S1.fresh).toFixed(3)});
  check(S1.rose != null && S1.rose <= .6, "B rises within 0.6 s of letting go of Shift", S1.rose);

  // ---- 2. a shot with the ball at the feet: contact within 11 steps of the release; camera kicks bounded
  const S2 = await page.evaluate(() => {
    const T = window.__t, ms = T.enter("stamina"), F = window.__fp, me = F.me(), L = window.__life;
    L.P.yaw = -Math.PI/2; L.P.pitch = -.05;
    const from = ms.events.length;
    T.btn(0, true); T.steps(36);
    const rel = T.sstep();
    T.btn(0, false);
    let contact = -1, maxRot = 0, maxOff = 0;
    const off = () => { const M = F.MC.off, K = L.camera.kicks; return {p: M.p + K.p, y: M.y + K.y, r: M.r + K.r}; };
    let prev = off();
    for (let i = 0; i < 90; i++){
      T.steps(1);
      const o = off(), dr = Math.max(Math.abs(o.p - prev.p), Math.abs(o.y - prev.y), Math.abs(o.r - prev.r));
      maxRot = Math.max(maxRot, dr); maxOff = Math.max(maxOff, Math.abs(o.p), Math.abs(o.y), Math.abs(o.r)); prev = o;
      if (contact < 0 && T.kicksBy(me.id, from).length) contact = T.sstep() - rel;
    }
    const k = T.kicksBy(me.id, from)[0];
    return {contact, kick: k ? {intent: k.intent, speed: k.speed, whiff: !!k.whiff} : null, maxRot: maxRot*180/Math.PI, maxOff: maxOff*180/Math.PI};
  });
  check(S2.contact >= 0 && S2.contact <= 11 && S2.kick && S2.kick.intent === "shot" && !S2.kick.whiff, "ball at the feet, LMB 0.6 s: contact <= 11 steps after the release", S2);
  check(S2.maxRot <= .6 && S2.maxOff <= 3, "per-frame camera rotation from kicks <= 0.6 degrees, total offset <= 3 degrees", {perFrame: +S2.maxRot.toFixed(3), total: +S2.maxOff.toFixed(3)});

  // ---- 3. the ball 1.5 m away: a stride adjust of at most 0.35 s, then contact or a scuff; always a kick event
  const S3 = await page.evaluate(() => {
    const T = window.__t, ms = T.enter("stamina"), F = window.__fp, me = F.me(), L = window.__life;
    L.P.yaw = -Math.PI/2;
    ms.ball.p.x = me.m.x + 1.5; ms.ball.p.z = me.m.z + .3;
    const from = ms.events.length;
    T.btn(0, true); T.steps(20); const rel = T.sstep(); T.btn(0, false);
    let at = -1;
    for (let i = 0; i < 60 && at < 0; i++){ T.steps(1); if (T.kicksBy(me.id, from).length) at = T.sstep() - rel; }
    const k = T.kicksBy(me.id, from)[0];
    return {at, secs: at/60, kick: k ? {intent: k.intent, scuff: !!k.scuff, whiff: !!k.whiff} : null};
  });
  check(S3.kick && S3.secs <= .35 + .18 + 2/60, "ball 1.5 m away: a stride adjust of <= 0.35 s, then contact or a scuff, and a kick event is logged", S3);

  // ---- 4. tapped passes over 10 to 40 m arrive at 8 to 10 m/s
  const S4 = await page.evaluate(() => {
    const T = window.__t, out = [];
    for (const d of [10, 18, 26, 34, 40]){
      const ms = T.enter("stamina"), F = window.__fp, me = F.me(), L = window.__life;
      const mate = ms.agents.find(a => a.team === me.team && a.slot === "CM");
      mate.onPitch = true; mate.m.x = mate.x0 = me.m.x + d; mate.m.z = mate.z0 = 0; mate.m.speed = mate.m.vx = mate.m.vz = 0;
      // the crosshair on his feet (a pass to feet: a point clearly ahead of him would be a through ball into space)
      L.P.yaw = -Math.PI/2; L.P.pitch = -Math.atan2(1.68, d);
      T.steps(2);
      // (the pass measured at the point it was weighted for: once it is struck the receiver steps away)

      T.btn(2, true); T.steps(5); T.btn(2, false);
      const tp = F.ctrl.target.point ? {x: F.ctrl.target.point.x, z: F.ctrl.target.point.z} : {x: mate.m.x, z: mate.m.z};
      const b = ms.ball, from = {x: b.p.x, z: b.p.z}, D = Math.hypot(tp.x - from.x, tp.z - from.z);
      let arr = null, kick = null;
      for (let i = 0; i < 600 && arr == null; i++){
        T.steps(1);
        if (!kick){ kick = ms.events.find(e => e.kind === "kick" && e.agent === me.id) || null; if (kick){ from.x = kick.x; from.z = kick.z; mate.onPitch = false; } continue; }
        if (Math.hypot(b.p.x - from.x, b.p.z - from.z) >= Math.hypot(tp.x - from.x, tp.z - from.z)) arr = Math.hypot(b.v.x, b.v.z);
        if (Math.hypot(b.v.x, b.v.z) < .05) break;
      }
      out.push({d, D: +D.toFixed(1), intent: kick && kick.intent, arr: arr == null ? null : +arr.toFixed(2)});
    }
    return out;
  });
  check(S4.every(x => x.arr != null && x.arr >= 8 && x.arr <= 10), "a tapped pass over 10 to 40 m arrives at 8 to 10 m/s", S4);

  // ---- 5. no auto pitch: dribbling 10 s with no mouse input leaves P.pitch exactly as it was
  const S5 = await page.evaluate(() => {
    const T = window.__t, ms = T.enter("stamina"), F = window.__fp, L = window.__life;
    L.P.yaw = -Math.PI/2; L.P.pitch = -.137;
    const p0 = L.P.pitch, y0 = L.P.yaw;
    T.key("w", true);
    let touches = 0; const from = ms.events.length;
    T.steps(600);
    T.key("w", false);
    touches = ms.events.filter(e => e.id >= from && e.kind === "touch" && e.how === "dribble").length;
    return {p0, p1: L.P.pitch, y0, y1: L.P.yaw, touches};
  });
  check(S5.p1 === S5.p0 && S5.touches > 3, "no mouse input for 10 s while dribbling: P.pitch unchanged exactly", S5);

  // ---- 6. the keys: every key of 1.6 has its default stopped; with Ctrl or Alt held a key does nothing
  const S6 = await page.evaluate(() => {
    const T = window.__t; T.enter("11v11");
    const keys = ["w", "a", "s", "d", "Shift", "x", "c", "f", " ", "r", "e", "Tab", "Escape", "h", "1", "2", "3", "q", "v", "g", "b"];
    const notPrevented = [];
    for (const k of keys){
      for (const type of ["keydown", "keyup"]){
        const ev = new KeyboardEvent(type, {key: k, bubbles: true, cancelable: true});
        window.dispatchEvent(ev);
        if (!ev.defaultPrevented) notPrevented.push(type + " " + k);
      }
    }
    const C = window.__fp.ctrl, walk0 = C.walk, contact0 = C.contact;
    for (const [k, m] of [["x", "ctrlKey"], ["x", "altKey"], ["3", "ctrlKey"], ["1", "altKey"]]){
      window.dispatchEvent(new KeyboardEvent("keydown", {key: k, [m]: true, bubbles: true, cancelable: true}));
      window.dispatchEvent(new KeyboardEvent("keyup", {key: k, [m]: true, bubbles: true, cancelable: true}));
    }
    // and through the match's own input, as the router would give it
    window.__fp.input({type: "keydown", key: "x", ctrlKey: true}); window.__fp.input({type: "keydown", key: "3", altKey: true});
    return {notPrevented, walk: [walk0, C.walk], contact: [contact0, C.contact]};
  });
  check(S6.notPrevented.length === 0, "every key of 1.6 dispatched as a KeyboardEvent has defaultPrevented === true", S6.notPrevented);
  check(S6.walk[0] === S6.walk[1] && S6.contact[0] === S6.contact[1], "key events with Ctrl or Alt held trigger no action", S6);

  // ---- 7. receiving: the first touch's resting distance from 12 m/s passes, by Ball Control
  const S7 = await page.evaluate(() => {
    const T = window.__t, res = {};
    for (const ctrl of [30, 90]){
      const ds = [];
      for (let k = 0; k < 10; k++){
        const ms = T.enter("receive", {seed: 11 + k}), F = window.__fp, me = F.me(), L = window.__life;
        me.at.ctrl = ctrl;
        for (const a of ms.agents) if (a !== me && a.role === "player" && !a.isGK) a.onPitch = false;
        L.P.yaw = Math.PI/2; me.m.x = me.x0 = 0; me.m.z = me.z0 = 0; me.m.yaw = me.m.heading = Math.PI/2;
        const b = ms.ball, D = 8, v0 = 13.4, ang = (k - 4.5)*.004;
        b.p.x = -D; b.p.y = .11; b.p.z = 0; b.v.x = v0*Math.cos(ang); b.v.y = 0; b.v.z = v0*Math.sin(ang); b.w.x = b.w.y = b.w.z = 0; b.state = "free";
        b.last.agent = ms.agents.find(a => a.team === me.team && a.slot === "CM").id; b.last.team = me.team; b.last.t = ms.t;
        ms.poss.ctl = -1; ms.poss.team = me.team;
        const from = ms.events.length;
        let touched = null, vIn = 0;
        for (let i = 0; i < 300; i++){
          T.steps(1);
          if (!touched){ const e = ms.events.find(e => e.id >= from && e.kind === "touch" && e.agent === me.id); if (e){ touched = {x: e.x, z: e.z}; vIn = e.vIn; } }
          else if (Math.hypot(b.v.x, b.v.z) < .05) break;
        }
        if (touched) ds.push({d: Math.hypot(b.p.x - touched.x, b.p.z - touched.z), vIn});
      }
      res[ctrl] = {n: ds.length, mean: ds.reduce((s, x) => s + x.d, 0)/Math.max(1, ds.length), vIn: ds.length ? ds[0].vIn : null};
    }
    return res;
  });
  check(S7[30].n >= 8 && S7[30].mean >= 1.1, "first touch from 12 m/s passes at control 30 rests >= 1.1 m away (mean)", S7[30]);
  check(S7[90].n >= 8 && S7[90].mean <= .5, "first touch from 12 m/s passes at control 90 rests <= 0.5 m away (mean)", S7[90]);
  check(page.errors.length === 0, "zero console and page errors", page.errors.slice(0, 5));
  ok = true;
} catch (e){ console.log("FAILED", e.stack || e.message); check(false, "the run finished", String(e.message)); }
await close();
process.exit(done() && ok ? 0 : 1);
