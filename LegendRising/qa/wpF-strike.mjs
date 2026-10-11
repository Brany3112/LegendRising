// qa/wpF-strike.mjs: first-person striking (addendum A1.7) on the real controls, the real simulation and the real HUD.
// Owner: WP-F2 (Stage P2b). Contracts DESIGN 1.6 (controls), 1.5.3 (strikes), 1.5.9 (camera), 1.5.10 (HUD), 3.1.7;
// addendum A1.7 (it wins over D10's "the reticle never sways").
//
//   - the reticle: its sway grows with poor Finishing, under pressure (less with Composure), with the breath gone and
//     on the weak foot; it moves smoothly (never more than a step's worth of its own amplitude), and a shot goes where
//     the reticle was at the release (strike.js's deviation comes on top);
//   - the wind-up: the charge fills while held, the first-person body draws the kicking foot back (measured on the
//     bones), the power arc shows round the reticle; held past full it trembles, turns red and the shot rises;
//   - the rhythm: running, a strike released in the stride lands on the support foot's plant (its contact at the
//     plant's time, inside the reach window) and is cleaner than one released out of it;
//   - the body shape through the release, each a real launch parameter: a tap is a placed side-foot (finesse, softer),
//     a full wind-up is power, a sweep curls it the way the mouse went (the spin), a lift chips it (High contact,
//     backspin), a flick down dips it (Low contact, topspin), looking low on goal drives it low; passes and crosses the
//     same (a sweep curls a pass, a lift lofts it);
//   - the feedback: the line on how it was struck, a hit-stop for a clean strike (the time-scale, never 0), the head
//     following the ball (on top of the look, which does not move), a big chance easing time during the wind-up;
//   - the 2.4 WP-F timing: contact at most 11 steps after the release with the ball at the feet;
//   - screenshots of each shot mid wind-up and at contact, the reticle under pressure and when tired, a pass and a cross.
//
//   QA_PORT=8771 node qa/wpF-strike.mjs [--no-shots]      exits 1 on any failed check; writes qa/out/wpF-strike.json
import fs from "node:fs";
import path from "node:path";
import {launch, career, freeze, OUT} from "./lib.mjs";
import {checker} from "./wpF-lib.mjs";

const SHOTS = !process.argv.includes("--no-shots");
const DIR = path.join(OUT, "wpF-strike");
fs.mkdirSync(DIR, {recursive: true});
const {check, done} = checker("wpF-strike");
const {page, close} = await launch({gfx: "low", seed: 7});
let ok = false;
const snap = async name => {
  if (!SHOTS) return;
  await page.evaluate(() => { const L = window.__life; const f = document.getElementById("lifeFade"); f.style.transition = "none"; f.style.opacity = "0"; L.FADE.v = 0; L.renderer().render(L.scene(), L.cam); });
  await page.screenshot({path: path.join(DIR, name + ".png"), timeout: 180000});
  console.log("shot", name);
};
try {
  await career(page, {zone: "ground", min: 15*60});
  await freeze(page);
  await page.evaluate(() => {
    const L = window.__life, F = window.__fp;
    // a striker d metres out from the goal he attacks, z across, the ball at his feet, looking at a point on the goal
    // mouth (ty high, tz across); the others stay off the pitch unless asked for (a man on him: press metres away)
    window.__s = {
      setup(o = {}){
        if (F.state) F.exit();
        F.enter("test:stamina", {seed: o.seed || 3, me: o.me || null}); L.stepN(2);
        const ms = F.ms, me = F.me(), dir = ms.dirs[me.team], d = o.d != null ? o.d : 20, z = o.z || 0;
        if (o.at) Object.assign(me.at, o.at);
        if (o.foot) me.foot = o.foot;
        me.m.x = me.x0 = dir*(ms.spec.hx - d); me.m.z = me.z0 = z; me.m.vx = me.m.vz = me.m.speed = 0;
        me.m.yaw = me.m.heading = dir > 0 ? -Math.PI/2 : Math.PI/2;
        const lat = o.lat || 0, f = {x: -Math.sin(me.m.yaw), z: -Math.cos(me.m.yaw)};
        ms.ball.p.x = me.m.x + f.x*.62 + (-f.z)*lat; ms.ball.p.z = me.m.z + f.z*.62 + f.x*lat; ms.ball.p.y = .11;
        ms.ball.v.x = ms.ball.v.y = ms.ball.v.z = 0;
        ms.poss.ctl = me.id; ms.poss.team = me.team;
        if (o.press != null){
          const opp = ms.agents.find(a => a.team !== me.team && a.role === "player" && !a.isGK);
          opp.onPitch = true; opp.m.x = opp.x0 = me.m.x + f.x*o.press; opp.m.z = opp.z0 = me.m.z + .9; opp.m.vx = opp.m.vz = opp.m.speed = 0;
        }
        if (o.B != null){ me.st.B = o.B; }
        const gx = dir*ms.spec.hx, ty = o.ty != null ? o.ty : 1.0, tz = o.tz != null ? o.tz : 0;
        L.P.yaw = Math.atan2(-(gx - me.m.x), -(tz - me.m.z));
        L.P.pitch = o.pitch != null ? o.pitch : Math.atan2(ty - 1.68, Math.hypot(gx - me.m.x, tz - me.m.z));
        L.stepN(2);
        if (o.B != null) me.st.B = o.B;
        return {ms, me, dir};
      },
      key(k, down){ F.input({type: down ? "keydown" : "keyup", key: k}); },
      btn(b, down){ F.input({type: down ? "down" : "up", button: b}); },
      move(dx, dy){ F.input({type: "move", dx, dy}); },
      steps(n){ for (let i = 0; i < n; i++) L.stepN(1); },
      // the look into the box: the grass by the penalty spot
      lookBox(){ const ms = F.ms, me = F.me(), dir = ms.dirs[me.team], bx = dir*(ms.spec.hx - 10), bz = 0;
        L.P.yaw = Math.atan2(-(bx - me.m.x), -(bz - me.m.z)); L.P.pitch = Math.atan2(-1.6, Math.hypot(bx - me.m.x, bz - me.m.z)); this.steps(1); },
      kick(from){ const ms = F.ms, me = F.me(); return ms.events.slice(from).find(e => e.kind === "kick" && e.agent === me.id) || null; },
      // hold a button n steps, sweeping (dx, dy a step) over the last g steps, release; the kick event and the step gap
      strike({b = 0, hold = 36, g = 0, dx = 0, dy = 0} = {}){
        const ms = F.ms, from = ms.events.length;
        this.btn(b, true);
        for (let i = 0; i < hold; i++){ if (i >= hold - g) this.move(dx, dy); this.steps(1); }
        const rel = ms.step;
        this.btn(b, false);
        // (the reticle as the release is taken: it is worked out in the step that takes it, before the press is read)
        this.steps(1);
        const ret = {x: F.ctrl.ret.x, y: F.ctrl.ret.y, z: F.ctrl.ret.z};
        let k = this.kick(from);
        for (let i = 0; i < 40 && !k; i++){ this.steps(1); k = this.kick(from); }
        return {k, gap: k ? (k.step != null ? k.step : null) : null, rel, ret, contactStep: ms.step, w: {x: ms.ball.w.x, y: ms.ball.w.y, z: ms.ball.w.z}};
      }
    };
  });

  // ---- 1. the reticle's sway: by Finishing, pressure (and Composure), breath, the weak foot; smooth
  const S1 = await page.evaluate(() => {
    const S = window.__s, F = window.__fp, amp = o => { S.setup(o); S.steps(3); return F.ctrl.ret.a; };
    const base = amp({at: {accuracy: 60, composure: 60}});
    const good = amp({at: {accuracy: 95, composure: 60}}), poor = amp({at: {accuracy: 20, composure: 60}});
    const press = amp({at: {accuracy: 60, composure: 60}, press: 1.0}), pressCalm = amp({at: {accuracy: 60, composure: 99}, press: 1.0});
    const tired = amp({at: {accuracy: 60, composure: 60}, B: 0});
    const weak = amp({at: {accuracy: 60, composure: 60}, foot: "L", lat: .4});
    // smooth: over 2 s of a wind-up the reticle never jumps more than its own amplitude's worth in a step
    S.setup({at: {accuracy: 30, composure: 40}});
    S.btn(0, true);
    let jump = 0, prev = null, a = 0, ys = [];
    for (let i = 0; i < 48; i++){ S.steps(1); const r = F.ctrl.ret; if (prev) jump = Math.max(jump, Math.hypot(r.sy - prev.sy, r.sp - prev.sp)); prev = {sy: r.sy, sp: r.sp}; a = Math.max(a, r.a); ys.push(r.sy); }
    S.btn(0, false); S.steps(30);
    return {base, good, poor, press, pressCalm, tired, weak, jump, a, moved: Math.max(...ys) - Math.min(...ys)};
  });
  check(S1.good < S1.base && S1.base < S1.poor, "the reticle sways less with good Finishing, more with poor", S1);
  check(S1.press > S1.base*1.15 && S1.pressCalm < S1.press, "pressure widens the sway, Composure calms it", {base: S1.base, press: S1.press, calm: S1.pressCalm});
  check(S1.tired > S1.base*1.4, "with the breath gone it sways more", {base: S1.base, tired: S1.tired});
  check(S1.weak > S1.base*1.25, "on the weak foot it sways more", {base: S1.base, weak: S1.weak});
  check(S1.moved > 0 && S1.jump < .25*S1.a, "the sway is smooth (no jump between steps)", {moved: S1.moved, jump: S1.jump, a: S1.a});

  // ---- 2. a shot goes where the reticle was at the release; contact <= 11 steps after it (2.4 WP-F)
  const S2 = await page.evaluate(() => {
    const S = window.__s; S.setup({ty: 1.6, tz: -2.2});
    const r = S.strike({hold: 36});
    return {ret: r.ret, k: r.k && {tx: r.k.tx, ty: r.k.ty, tz: r.k.tz, intent: r.k.intent, shape: r.k.shape}, steps: r.contactStep - r.rel};
  });
  check(S2.k && Math.abs(S2.k.tx - S2.ret.x) < .02 && Math.abs(S2.k.ty - S2.ret.y) < .02 && Math.abs(S2.k.tz - S2.ret.z) < .02, "the shot is aimed where the reticle was at the release", S2);
  check(S2.k && S2.steps <= 11, "contact at most 11 steps after the release with the ball at the feet", S2.steps);

  // ---- 3. the wind-up: the charge, the body's kicking leg cocked in view, the arc; held past full: tremble, red, rising
  const S3 = await page.evaluate(async () => {
    const S = window.__s, F = window.__fp, L = window.__life, THREE = await import("./vendor/three.module.js");
    S.setup({});
    const V = F.FS.V, h = V && V.fp, T = THREE.Vector3;
    // the right leg: the boot's place along your facing relative to the knee (+ ahead), the knee's height, and whether
    // you see the knee and the boot: inside the picture, and the first thing of your own body a ray from the eye meets
    const ray = new THREE.Raycaster();
    const meshes = () => { const out = []; h.g.traverse(o => { if (o.isMesh && o.visible) out.push(o); }); return out; };
    const leg = () => {
      if (!h) return null;
      h.g.updateMatrixWorld(true);
      const at = i => h.bones[i].getWorldPosition(new T());
      const knee = at(17), foot = at(18), yaw = L.P.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const cam = L.cam; cam.updateMatrixWorld(true);
      const seen = p => {
        const q = p.clone().project(cam), inView = q.z < 1 && Math.abs(q.x) < .98 && q.y > -.98 && q.y < .98;
        let clear = null;
        if (inView && ray.set){
          const d = p.clone().sub(cam.position), dist = d.length(); ray.set(cam.position, d.normalize()); ray.near = .05; ray.far = dist + .3;
          const hit = ray.intersectObjects(meshes(), false)[0]; clear = !hit || hit.distance > dist - .2;
        }
        return {inView, clear, sy: +((1 - q.y)*360).toFixed(0)};
      };
      return {back: (foot.x - knee.x)*fx + (foot.z - knee.z)*fz, kneeY: knee.y, knee: seen(knee), foot: seen(foot)};
    };
    const l0 = leg();
    S.btn(0, true); S.steps(30);
    const mid = {p: F.ctrl.wind.p, k: F.MC.wind.k, leg: leg(), dip: F.MC.wind.dip, arc: +getComputedStyle(document.querySelector("#fpHud .fp-arcg")).opacity, ret: +document.querySelector("#fpHud .fp-ret").style.opacity,
      retY: (() => { const m = /translate\([^,]+,\s*([-\d.]+)px/.exec(document.querySelector("#fpHud .fp-ret").style.transform || ""); return m ? +m[1] : null; })()};
    S.steps(60);
    const over = {over: F.ctrl.wind.over, red: document.querySelector("#fpHud .fp-ret-c").classList.contains("over"), y: F.ctrl.ret.y, lean: F.ctrl.ret.sp};
    const from = F.ms.events.length;
    S.btn(0, false);
    let k = null; for (let i = 0; i < 30 && !k; i++){ S.steps(1); k = S.kick(from); }
    S.steps(40);
    const after = {dip: F.MC.wind.dip};
    // looking down at the ball
    S.setup({pitch: -1.0}); S.btn(0, true); S.steps(40);
    const down = leg();
    S.btn(0, false); S.steps(40);
    return {l0, mid, over, after, down, k: k && {ty: k.ty, shape: k.shape, intent: k.intent}, fp: !!h, ray: !!ray.set};
  });
  check(S3.fp && S3.mid.p > .5 && S3.mid.k > .4, "holding the shot fills the charge and the drawn wind-up", {p: S3.mid.p, k: S3.mid.k});
  check(S3.fp && S3.l0 && S3.mid.leg.back < -.1 && S3.mid.leg.back < S3.l0.back - .05 && S3.mid.leg.kneeY > S3.l0.kneeY + .1, "the first-person body cocks the kicking leg: the knee comes up and the boot is drawn back behind it", {before: S3.l0, during: S3.mid.leg});
  check(S3.ray && S3.mid.dip > .2 && S3.mid.retY != null && S3.mid.retY > 12 && S3.after.dip < .01, "looking at goal, the head goes down over the ball while you wind up, the reticle stays in the picture, and it comes back up", {dip: S3.mid.dip, retY: S3.mid.retY, after: S3.after});
  check(S3.mid.leg.knee.inView && S3.mid.leg.knee.clear, "looking at goal, the cocked knee is in view, not hidden by your own body", S3.mid.leg);
  check(S3.down.knee.inView && S3.down.knee.clear && S3.down.foot.inView && S3.down.foot.clear, "looking down at the ball, the knee and the drawn-back boot are both in view", S3.down);
  check(S3.mid.arc > .8 && S3.mid.ret > .8, "the power arc shows round the reticle while winding up", S3.mid);
  check(S3.over.over > .9 && S3.over.red && S3.k && /over/.test(S3.k.shape) && S3.k.ty > 1.6, "held past full: it trembles, turns red, you lean back and the shot rises", {over: S3.over, kick: S3.k});

  // ---- 4. the body shape through the release (each a real launch parameter)
  const S4 = await page.evaluate(() => {
    const S = window.__s, out = {};
    const go = (name, o, setup = {}) => { S.setup(Object.assign({ty: 1.2, tz: 1.5}, setup)); const r = S.strike(o); out[name] = r.k ? {gest: window.__fp.ctrl.gest, shape: r.k.shape, contact: r.k.contact, finesse: r.k.finesse, curl: r.k.curl, speed: r.k.speed, intent: r.k.intent, wy: r.w.y, wx: r.w.x, wz: r.w.z, ty: r.k.ty, tz: r.k.tz} : null; };
    go("power", {hold: 60});
    go("tap", {hold: 6});
    go("curlR", {hold: 36, g: 6, dx: 30});
    go("curlL", {hold: 36, g: 6, dx: -30});
    go("chip", {hold: 36, g: 6, dy: -22});
    go("dip", {hold: 36, g: 6, dy: 22});
    go("low", {hold: 36}, {ty: .3});
    return out;
  });
  check(S4.power && /power/.test(S4.power.shape) && S4.tap && S4.tap.shape === "placed" && S4.tap.finesse && S4.tap.speed < .8*S4.power.speed,
    "a tap is a placed side-foot (finesse, softer); a full wind-up is power", {power: S4.power, tap: S4.tap});
  // (w.y > 0 bends a ball to its left: the sweep to the right bends it right)
  check(S4.curlR && S4.curlL && /curl/.test(S4.curlR.shape) && S4.curlR.finesse && S4.curlR.wy < -5 && S4.curlL.wy > 5,
    "a sweep through the release curls it the way the mouse went (the ball's sidespin)", {right: S4.curlR, left: S4.curlL});
  check(S4.chip && S4.chip.shape === "chip" && S4.chip.contact === 1 && S4.chip.speed < S4.power.speed, "a lift through the release chips it (High contact, backspin, softer)", S4.chip);
  check(S4.dip && /dip/.test(S4.dip.shape) && S4.dip.contact === -1, "a flick down dips it (Low contact: topspin)", S4.dip);
  check(S4.low && /low/.test(S4.low.shape) && S4.low.contact === -1, "looking low on goal drives it low", S4.low);
  check(S4.curlR && Math.abs(S4.curlR.tz - 1.5) < 1.2, "a sweep's aim is taken from before the sweep", {tz: S4.curlR && S4.curlR.tz, wanted: 1.5});

  // ---- 5. passes and crosses: the same language
  const S5 = await page.evaluate(() => {
    const S = window.__s, F = window.__fp, L = window.__life, out = {};
    const mateAt = (dx, dz) => { const ms = F.ms, me = F.me(), m = ms.agents.find(a => a.team === me.team && a.slot === "CM"); m.onPitch = true; m.m.x = m.x0 = me.m.x + dx; m.m.z = m.z0 = me.m.z + dz; m.m.vx = m.m.vz = m.m.speed = 0; return m; };
    const pass = (name, o, setup) => {
      const {me} = S.setup(setup); const dir = F.ms.dirs[me.team]; const m = mateAt(-dir*18, 10);
      L.P.yaw = Math.atan2(-(m.m.x - me.m.x), -(m.m.z - me.m.z)); L.P.pitch = Math.atan2(-1.6, 21) + (o.up || 0); S.steps(2);
      const r = S.strike(Object.assign({b: 2}, o));
      out[name] = r.k ? {intent: r.k.intent, contact: r.k.contact, curl: r.k.curl, shape: r.k.shape, wy: r.w.y} : null;
    };
    pass("plain", {hold: 6}, {d: 30});
    pass("curl", {hold: 20, g: 6, dx: 30}, {d: 30});
    pass("lift", {hold: 20, g: 6, dy: -22}, {d: 30});
    // a cross: from wide, looking into the box, the ball lifted
    S.setup({d: 12, z: 26});
    S.lookBox();
    const r = S.strike({hold: 30, g: 6, dy: -22});
    out.cross = r.k ? {intent: r.k.intent, contact: r.k.contact, shape: r.k.shape} : null;
    return out;
  });
  check(S5.plain && S5.plain.intent === "pass" && S5.curl && S5.curl.intent === "pass" && Math.abs(S5.curl.curl) > .3 && Math.abs(S5.curl.wy) > 3,
    "a sweep through a pass's release curls the pass", {plain: S5.plain, curl: S5.curl});
  check(S5.lift && (S5.lift.intent === "lob" || S5.lift.intent === "cross") && S5.lift.contact === 1, "a lift through a pass's release lofts it", S5.lift);
  check(S5.cross && (S5.cross.intent === "cross" || S5.cross.intent === "lob") && S5.cross.contact === 1, "a cross into the box from wide, lifted", S5.cross);

  // ---- 6. the rhythm: jogging, a release timed so that the support foot's plant comes inside the reach window strikes
  // on that plant; one let go well out of the stride is a forced plant (rhythm 1) and is struck less cleanly. (The ball
  // is put at the feet, rolling with you, as the release is taken: the test is of the stride, not of the dribble)
  const S6 = await page.evaluate(() => {
    const S = window.__s, F = window.__fp, res = {in: [], out: []};
    for (let k = 0; k < 16; k++){
      const want = k % 2 ? "out" : "in";
      const {ms, me} = S.setup({d: 30, seed: 20 + k});
      ms.ball.p.z = me.m.z + 8; ms.poss.ctl = -1;
      S.key("w", true); S.steps(40 + 3*k);
      S.btn(0, true); S.steps(15);
      let r = null;
      for (let i = 0; i < 90; i++){ r = F.rhythm("R"); if (r && r.on && (want === "in" ? r.tp > .13 && r.tp < .175 : r.tp > .32 && r.ts > .2)) break; S.steps(1); }
      const f = {x: -Math.sin(me.m.yaw), z: -Math.cos(me.m.yaw)}, b = ms.ball;
      b.p.x = me.m.x + f.x*.68; b.p.z = me.m.z + f.z*.68; b.p.y = .11; b.v.x = me.m.vx; b.v.z = me.m.vz; b.v.y = 0; b.w.x = b.w.y = b.w.z = 0; b.state = "free";
      ms.poss.ctl = me.id; ms.poss.team = me.team; b.last.agent = me.id; b.last.team = me.team;
      const from = ms.events.length;
      S.btn(0, false); S.steps(1);
      const act = me.act && me.act.kind === "kick" ? {tc: me.act.tc, want: me.act.action.tcWant, rhythm: me.act.action.rhythm || 0, adjust: me.act.adjust} : null;
      let ev = null; for (let i = 0; i < 40 && !ev; i++){ S.steps(1); ev = S.kick(from); }
      S.key("w", false);
      if (ev && act && ev.strike != null) res[want].push({rhythm: act.rhythm, want: act.want, tc: act.tc, strike: ev.strike, at: r && +r.tp.toFixed(3)});
    }
    const mean = a => a.length ? a.reduce((s, r) => s + r.strike, 0)/a.length : null;
    const planted = res.in.filter(r => r.want != null);
    return {nIn: res.in.length, nOut: res.out.length, mIn: mean(res.in), mOut: mean(res.out), rIn: mean(res.in.map(r => ({strike: r.rhythm}))), rOut: mean(res.out.map(r => ({strike: r.rhythm}))),
      planted: planted.length, onPlant: planted.every(r => Math.abs(r.tc - Math.max(.1, Math.min(.18, r.want))) < 1e-6), sample: res.in.slice(0, 3).concat(res.out.slice(0, 3))};
  });
  check(S6.nIn >= 6 && S6.nOut >= 6 && S6.rIn < .05 && S6.rOut > .7, "running, a release in the stride is in rhythm, one out of it is a forced plant", S6);
  check(S6.planted >= 5 && S6.onPlant, "a release whose plant comes inside the window strikes on that plant", {planted: S6.planted, onPlant: S6.onPlant});
  check(S6.mIn != null && S6.mOut != null && S6.mIn > S6.mOut + .1, "a strike in rhythm is cleaner than one out of it", {inRhythm: S6.mIn, outOfIt: S6.mOut});

  // ---- 7. the feedback: the line, the hit-stop, the head following the ball; a big chance eases time while winding up
  const S7 = await page.evaluate(() => {
    const S = window.__s, F = window.__fp, L = window.__life;
    S.setup({d: 22, ty: 1.0, tz: 2});
    const yaw0 = L.P.yaw;
    const from = F.ms.events.length;
    S.btn(0, true); S.steps(40); S.btn(0, false);
    let k = null, ts = 1, minTs = 1;
    for (let i = 0; i < 30 && !k; i++){ S.steps(1); k = S.kick(from); }
    S.steps(1); ts = F.FP.timeScale; minTs = ts;
    for (let i = 0; i < 20; i++){ S.steps(1); minTs = Math.min(minTs, F.FP.timeScale); }
    const line = document.querySelector("#fpHud .fp-sline").textContent, lineOn = document.querySelector("#fpHud .fp-sline").classList.contains("in");
    const fo = {on: F.MC.follow.on, y: F.MC.follow.y, p: F.MC.follow.p};
    // the head comes back a small step a frame, never at once; and so does a turn still large when its time is up
    const Fo = F.MC.follow, turn = () => Math.abs(Fo.y) + Math.abs(Fo.p);
    let jump = 0, prev = turn();
    for (let i = 0; i < 150; i++){ S.steps(1); jump = Math.max(jump, Math.abs(turn() - prev)); prev = turn(); }
    const back = {ts: F.FP.timeScale, follow: F.MC.follow.on, yawSame: L.P.yaw === yaw0, jump, left: turn()};
    Fo.on = true; Fo.t = 1.3 + .5 - .02; Fo.y = .6; Fo.p = -.3; Fo.yaw = L.P.yaw; Fo.pitch = L.P.pitch;
    let bigJump = 0; prev = turn();
    for (let i = 0; i < 90; i++){ S.steps(1); bigJump = Math.max(bigJump, Math.abs(turn() - prev)); prev = turn(); }
    back.bigJump = bigJump; back.bigLeft = turn();
    // a big chance: 10 m out in front of goal, winding up
    S.setup({d: 10, ty: 1.0, tz: 1});
    S.btn(0, true); S.steps(20);
    const big = F.FP.timeScale;
    S.btn(0, false); S.steps(40);
    const after = F.FP.timeScale;
    // a long range one: no easing
    S.setup({d: 34});
    S.btn(0, true); S.steps(20);
    const far = F.FP.timeScale;
    S.btn(0, false); S.steps(40);
    return {strike: k && k.strike, shape: k && k.shape, ts, minTs, line, lineOn, fo, back, big, after, far};
  });
  check(S7.lineOn && S7.line.length > 4 && !/\u2014/.test(S7.line), "a short line on how it was struck", S7.line);
  check(S7.strike >= .75 && S7.minTs < .5 && S7.minTs > 0 && S7.back.ts === 1, "a clean strike holds the world for a blink (hit-stop), never a pause", {strike: S7.strike, ts: S7.ts, min: S7.minTs, back: S7.back.ts});
  check(S7.fo.on && Math.abs(S7.fo.y) + Math.abs(S7.fo.p) > .005 && S7.back.yawSame && !S7.back.follow, "the head follows the ball, on top of the look (which does not move), and comes back", {follow: S7.fo, back: S7.back});
  check(S7.back.jump < .045 && S7.back.left < 1e-3 && S7.back.bigJump < .045 && S7.back.bigLeft < 1e-3, "the head comes back a small step a frame, even from a large turn when its time is up (no jump)", S7.back);
  check(S7.big > 0 && S7.big < 1 && S7.after === 1 && S7.far === 1, "a big chance eases time a little while you wind up (never a pause)", {big: S7.big, after: S7.after, longRange: S7.far});

  // ---- 8. screenshots: each shot mid wind-up and at contact; the reticle under pressure and when tired; a pass, a cross
  if (SHOTS){
    const kinds = [["power", {hold: 60}, {}], ["placed", {hold: 6}, {}], ["curl", {hold: 36, g: 6, dx: 30}, {tz: -2}], ["chip", {hold: 36, g: 6, dy: -22}, {d: 14}], ["dip", {hold: 36, g: 6, dy: 22}, {d: 28, ty: 2.1}]];
    for (const [name, o, setup] of kinds){
      await page.evaluate(([o, setup]) => {
        const S = window.__s; S.setup(Object.assign({d: 20, ty: 1.2, tz: 2}, setup));
        window.__hold = o; S.btn(0, true);
        const pre = Math.max(1, (o.hold || 30) - (o.g || 0) - 2);
        S.steps(Math.min(pre, o.hold > 10 ? o.hold - 4 : o.hold));
      }, [o, setup]);
      await snap(`${name}-windup`);
      await page.evaluate(() => {
        const S = window.__s, F = window.__fp, o = window.__hold, from = F.ms.events.length;
        for (let i = 0; i < (o.g || 0); i++){ S.move(o.dx || 0, o.dy || 0); S.steps(1); }
        S.btn(0, false);
        for (let i = 0; i < 30 && !S.kick(from); i++) S.steps(1);
        S.steps(2);
      });
      await snap(`${name}-contact`);
      await page.evaluate(() => window.__s.steps(25));
      await snap(`${name}-after`);
    }
    // the leg drawn back, looking down at the ball
    await page.evaluate(() => { const S = window.__s; S.setup({pitch: -1.0}); S.btn(0, true); S.steps(40); });
    await snap("windup-look-down");
    await page.evaluate(() => { const S = window.__s; S.btn(0, false); S.steps(30); });
    // under pressure, tired: the reticle wider, the picture vignetted and greyed
    await page.evaluate(() => { const S = window.__s; S.setup({at: {accuracy: 40, composure: 30}, press: 1.0, tz: 2}); S.btn(0, true); S.steps(30); });
    await snap("reticle-pressure");
    await page.evaluate(() => { const S = window.__s; S.btn(0, false); S.steps(30); S.setup({B: 8, tz: -2}); window.__fp.me().st.B = 8; S.btn(0, true); S.steps(30); window.__fp.me().st.B = 8; S.steps(1); });
    await snap("reticle-tired");
    await page.evaluate(() => { const S = window.__s; S.btn(0, false); S.steps(30); });
    // a pass being weighted to a team-mate; a cross from wide
    await page.evaluate(() => {
      const S = window.__s, F = window.__fp, L = window.__life, {me} = S.setup({d: 30}), dir = F.ms.dirs[me.team];
      const m = F.ms.agents.find(a => a.team === me.team && a.slot === "CM"); m.onPitch = true; m.m.x = m.x0 = me.m.x - dir*4; m.m.z = m.z0 = me.m.z + 16;
      L.P.yaw = Math.atan2(-(m.m.x - me.m.x), -(m.m.z - me.m.z)); L.P.pitch = Math.atan2(-1.6, 16); S.steps(2);
      S.btn(2, true); S.steps(22);
    });
    await snap("pass-windup");
    await page.evaluate(() => { const S = window.__s; S.btn(2, false); S.steps(30); S.setup({d: 12, z: 26}); S.lookBox(); S.btn(0, true); S.steps(26); });
    await snap("cross-windup");
    await page.evaluate(() => { const S = window.__s, F = window.__fp, from = F.ms.events.length; for (let i = 0; i < 6; i++){ S.move(0, -22); S.steps(1); } S.btn(0, false); for (let i = 0; i < 30 && !S.kick(from); i++) S.steps(1); S.steps(14); });
    await snap("cross-after");
  }
  check(page.errors.length === 0, "zero console and page errors", page.errors.slice(0, 5));
  ok = true;
} catch (e){ console.log("FAILED", e.stack || e.message); check(false, "the run finished", String(e.message)); }
await close();
process.exit(done() && ok ? 0 : 1);
