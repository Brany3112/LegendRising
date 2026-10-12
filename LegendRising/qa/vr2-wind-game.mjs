// verifier probe (in game): the finishing drill, the ball at your feet; wind up (LMB held) standing, then
// (A) run off with it still held (W), or (B) be dispossessed: the charge drops, or (C) release with the ball a
// stride away (a stride adjust). Your third-person body (posed in full, V.fpOn false) is measured frame by frame:
// the largest bone turn in one 60 Hz frame and the kicking foot's travel in one frame.
import {launch, career, freeze, snap} from "./lib.mjs";
const scen = process.argv[2] || "A";
const {page, close} = await launch({gfx: "low", seed: 21});
try {
  await career(page, {zone: "ground", min: 11*60, pos: "ST"});
  await freeze(page);
  const r = await page.evaluate(async scen => {
    const THREE = await import("./vendor/three.module.js");
    const L = window.__life, D = (await import("./js/life/football/trainspec.js")).DRILLS.shoot;
    L.place({x: D.spot.x, z: D.spot.z - 28, y: 0, yaw: -Math.PI/2}); L.stepN(20);
    L.use(L.spots.find(s => s.label === D.label));
    for (let i = 0; i < 400 && !(window.__train && window.__train.RUN.cur); i++) await new Promise(r => setTimeout(r, 25));
    const TR = window.__train;
    for (let i = 0; i < 2400; i++){
      L.stepN(1);
      const T = TR.T; if (!T) continue;
      if (T.ms.poss.ctl === T.me.id && Math.hypot(T.ms.ball.v.x, T.ms.ball.v.z) < 1 && T.me.m.speed < .5) break;
    }
    const T = TR.T; if (!T) return {error: "no drill"};
    T.V.fpOn = false;
    const Rr = T.V.rec[T.ms.me];
    const q = () => Rr.h.bones.map(b => b.quaternion.clone());
    const footW = () => { Rr.h.g.updateMatrixWorld(true); return Rr.h.bones[18].getWorldPosition(new THREE.Vector3()); };
    L.P.pitch = -0.6;
    TR.input({type: "down", button: 0});
    let prev = null, pf = null; const log = [];
    const meas = (tag, n, each) => {
      for (let i = 0; i < n; i++){
        if (each) each(i);
        L.stepN(1);
        const cq = q(), fw = footW();
        let m = 0, at = -1;
        if (prev) cq.forEach((x, k) => { const a = x.angleTo(prev[k]); if (a > m){ m = a; at = k; } });
        const fd = pf ? fw.distanceTo(pf) : 0;
        const c = Rr.clip;
        log.push({tag, i, jump: +m.toFixed(3), bone: at, foot: +fd.toFixed(3), clip: c ? (c.hold != null ? "hold" : c.mode) : "loco", sp: +T.me.m.speed.toFixed(2), wind: +TR.CTRL.wind.p.toFixed(2)});
        prev = cq; pf = fw;
      }
    };
    meas("hold", 50);
    if (scen === "A"){ TR.input({type: "keydown", key: "w"}); meas("run", 60); TR.input({type: "keyup", key: "w"}); }
    if (scen === "B"){
      // dispossessed: the ball taken off you (the opponents' keeper's team gets it), the charge drops as play turns
      const opp = T.ms.agents.find(a => a.team !== T.me.team && a.onPitch);
      T.ms.poss.ctl = opp ? opp.id : -1; T.ms.poss.team = opp ? opp.team : 1 - T.me.team;
      meas("lost", 30);
    }
    if (scen === "C"){
      // the ball nudged a stride ahead, then let go
      T.ms.ball.p.x += -Math.sin(T.me.m.yaw)*1.3; T.ms.ball.p.z += -Math.cos(T.me.m.yaw)*1.3;
      TR.input({type: "up", button: 0}); meas("release", 50);
    }
    TR.input({type: "up", button: 0});
    const worst = log.slice(1).reduce((a, x) => x.jump > a.jump ? x : a, {jump: 0});
    return {worst, around: log.filter(x => Math.abs(x.i - worst.i) <= 2 && x.tag === worst.tag), clips: [...new Set(log.map(x => x.tag + ":" + x.clip))]};
  }, scen);
  console.log(scen, JSON.stringify(r));
  await snap(page, "vr2-wind-game-" + scen);
  console.log("errors", page.errors.slice(0, 5));
} finally { await close(); }
