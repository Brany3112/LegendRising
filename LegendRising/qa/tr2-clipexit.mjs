// qa/tr2-clipexit.mjs: back on the feet after a clip (BUILD-PLAN P2-B acceptance, MV-6; TRAINING-SPEC 2: "no
// snapping"). Owner: P2-B (TR stage 2).
//
// A match body runs in at 3.4 m/s, then plays a strike, a pass, a header and a tackle (moves.js clips, the states
// view.js passes) while its root goes on 0, 1.0 or 2.0 m over the clip's length (a body in a match keeps moving while
// it kicks),
// then goes back to locomotion at the speed its root has (the gait's gaitPlace from the clip's drawn feet, human.js).
// On the first locomotion frame:
//   - the gait's root speed (G.v) is within 20% of the root's own (within 0.1 m/s of a root standing still);
//   - no leg bone (the hips and both legs) turns more than 0.25 rad in a frame, on that frame and the next (the largest
//     turn over the 20 frames after is reported);
//   - a foot the gait has planted moves <= 10 mm from where the clip last drew it.
//
//   QA_PORT=8841 node qa/tr2-clipexit.mjs     exits 1 on any failed check; writes qa/out/tr2-clipexit.json
import {launch, career, freeze, report} from "./lib.mjs";

const res = {name: "tr2-clipexit", checks: [], ok: true, runs: {}};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};

const {page, close} = await launch({gfx: "low", seed: 1, w: 320, h: 240});
try {
  await career(page, {zone: "ground", min: 7*60 + 40});
  await freeze(page);
  const out = await page.evaluate(async () => {
    const H = await import("./js/life/human.js"); await import("./js/life/moves.js");
    const L = window.__life, scene = L.scene(), B = H.BONE;
    const V = new (L.cam.position.constructor)();
    const LEGS = [B.hips, B.thL, B.shL, B.ftL, B.toL, B.thR, B.shR, B.ftR, B.toR];
    const dt = 1/60, res = {};
    const CLIPS = {
      strike: (x, z, tc) => ({mode: "strike", kind: "instep", side: "R", ball: {x: x + .1, y: .11, z: z + .9}, dir: {x: 0, z: 1}, power: .8, tc}),
      pass: (x, z, tc) => ({mode: "strike", kind: "side", side: "R", ball: {x: x + .1, y: .11, z: z + .8}, dir: {x: 0, z: 1}, power: .5, tc}),
      header: (x, z, tc) => ({mode: "header", take: "stand", jump: .3, ball: {x, y: 1.85, z: z + .3}, dir: {x: 0, z: 1}, tc}),
      tackle: (x, z, tc) => ({mode: "tackle", kind: "stand", side: "R", target: {x: x + .15, z: z + .9}, tc})
    };
    // (each clip's own length first, standing: the root's travel is spread over exactly that)
    const LEN = {};
    for (const clip of Object.keys(CLIPS)){
      const h = H.human(H.lookFor("footballer", 30, {kit: ["#2c66b8", "#ffffff"], number: 7})); scene.add(h.g);
      h.g.position.set(-8, 0, -24);
      for (let i = 0; i < 30; i++) H.animateHuman(h, dt, {mode: "move", speed: 0});
      let k = 0;
      for (; k < 150; k++){ const st = CLIPS[clip](-8, -24, Math.max(0, .25 - k*dt)); if (H.animateHuman(h, dt, st).mask & H.EV.END) break; }
      LEN[clip] = (k + 1)*dt;
      scene.remove(h.g); h.dispose();
    }
    let n = 0;
    for (const clip of Object.keys(CLIPS)) for (const travel of [0, 1, 2]){
      const h = H.human(H.lookFor("footballer", 31 + n++, {kit: ["#2c66b8", "#ffffff"], number: 7})); scene.add(h.g);
      let x = -6 + n*.01, z = -24;
      const root = {x, z};
      const mv = (v, i) => { root.x = x; root.z = z; h.g.position.set(x, 0, z); h.g.rotation.y = 0; H.ANIM.frame++; H.ANIM.fpu = 0; return H.animateHuman(h, dt, {mode: "move", speed: v, intent: v, root}); };
      for (let i = 0; i < 90; i++){ const v = 3.4*Math.min(1, i/30); z += v*dt; mv(v, i); }
      // the clip: its contact 0.25 s on; the root goes on `travel` metres over it (its length found from its END)
      const tc0 = .25, T = LEN[clip], vClip = travel/T;
      let k = 0, ended = false;
      for (; k < 150 && !ended; k++){
        z += vClip*dt; h.g.position.set(x, 0, z); root.x = x; root.z = z;
        const st = CLIPS[clip](x, z + vClip*Math.max(0, tc0 - k*dt), Math.max(0, tc0 - k*dt));
        st.root = root;
        H.ANIM.frame++; H.ANIM.fpu = 0;
        const ev = H.animateHuman(h, dt, st);
        if (ev.mask & H.EV.END) ended = true;
      }
      h.g.updateMatrixWorld(true);
      const prevQ = h.bones.map(b => b.quaternion.clone());
      const ank = s => { V.set(0, 0, 0).applyMatrix4(h.bones[s ? B.ftR : B.ftL].matrixWorld); return {x: V.x, y: V.y, z: V.z}; };
      const ank0 = [ank(0), ank(1)];
      // back to locomotion at the root's own speed
      const rows = [];
      for (let i = 0; i < 21; i++){
        z += vClip*dt;
        mv(vClip, i);
        h.g.updateMatrixWorld(true);
        const G = h.gait;
        let jb = 0, jw = -1;
        for (const b of LEGS){ const a = prevQ[b].angleTo(h.bones[b].quaternion); if (a > jb){ jb = a; jw = b; } }
        for (let b = 0; b < h.bones.length; b++) prevQ[b].copy(h.bones[b].quaternion);
        const row = {i, Gv: +G.v.toFixed(3), Gvs: +G.vs.toFixed(3), jump: +jb.toFixed(4), jumpB: jw, state: G.state, down: G.feet.map(f => f.down ? 1 : 0), roll: G.feet.map(f => +f.roll.toFixed(3)), need: G.feet.map(f => +(f.need || 0).toFixed(3))};
        if (i === 0) row.planted = [0, 1].filter(s => G.feet[s].down).map(s => { const a = ank(s); return +(Math.hypot(a.x - ank0[s].x, a.y - ank0[s].y, a.z - ank0[s].z)*1000).toFixed(2); });
        rows.push(row);
      }
      res[`${clip} ${travel} m`] = {vRoot: +vClip.toFixed(3), clipLen: +T.toFixed(3), travel: +(vClip*k*dt).toFixed(3), clipFrames: k, ended, rows};
      scene.remove(h.g); h.dispose();
    }
    return res;
  });
  res.runs = out;
  for (const [key, r] of Object.entries(out)){
    const f = r.rows[0];
    check(r.ended, `${key}: the clip ran to its end`, r.clipFrames);
    const ok = r.vRoot < .05 ? Math.abs(f.Gv) <= .1 : Math.abs(f.Gv - r.vRoot) <= .2*r.vRoot;
    check(ok, `${key}: on the first locomotion frame the gait's root speed is within 20% of the root's`, {Gv: f.Gv, root: r.vRoot});
    // (on the first locomotion frame and the next; over the 20 frames after, reported: the gait's own first step is
    // under way by then, its knee folding at up to 18 rad/s as any swing's may)
    const j2 = Math.max(r.rows[0].jump, r.rows[1].jump), at2 = r.rows[0].jump >= r.rows[1].jump ? r.rows[0] : r.rows[1];
    check(j2 <= .25, `${key}: no leg bone turns more than 0.25 rad in a frame`, {max: j2, bone: at2.jumpB, frame: at2.i, max20: Math.max(...r.rows.map(x => x.jump))});
    const pm = Math.max(0, ...f.planted);
    check(pm <= 10, `${key}: a planted foot moves <= 10 mm on the first locomotion frame`, {mm: f.planted});
  }
} catch(e){ check(false, "ran", String(e && e.stack || e)); }
if (page.errors.length) check(false, "no console or page errors", page.errors.slice(0, 5));
report("tr2-clipexit", res);
await close();
process.exit(res.ok ? 0 : 1);
