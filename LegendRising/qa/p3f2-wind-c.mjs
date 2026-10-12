// temporary probe (P3a fix round 2): let go into a slow walk (a stride adjust): the hand-over to locomotion
import {openKit} from "./wpK-lib.mjs";
const K = await openKit();
const vEnd = +(process.argv[2] || .7), turn = +(process.argv[3] || 0);
const out = await K.page.evaluate(async ([vEnd, turn]) => {
  const {H, M, THREE} = K;
  const dt = 1/60, R = {};
  const at = (h, i) => { h.g.updateMatrixWorld(true); return h.bones[i].getWorldPosition(new THREE.Vector3()); };
  K.clear();
  const h = K.body("footballer", 3); h.g.position.set(0, 0, 0); h.g.rotation.y = Math.PI/2;
  const loco = {mode: "move", speed: 0};
  for (let i = 0; i < 40; i++) H.animateHuman(h, dt, loco, {tier: 0});
  const wind = {p: 0, over: 0, side: "R", kind: "shot"}, rec = {};
  for (let f = 0; f < 60; f++){ wind.p = Math.min(1, f/50); H.animateHuman(h, dt, M.windHold(wind, 0, rec, dt) || loco, {tier: 0}); }
  let x = 0, prevQ = K.boneQ(h); const per = [];
  for (let f = 0; f < 30; f++){
    const v = vEnd*Math.min(1, (f + 1)/12); x += v*dt; h.g.position.x = x; h.g.rotation.y += turn*dt;
    let st = M.windHold(null, v, rec, dt);
    if (!st){ loco.speed = v; loco.upper = null; st = loco; }
    H.animateHuman(h, dt, st, {tier: 0});
    const j = K.boneJump(h, prevQ); prevQ = K.boneQ(h);
    const F = h.mv && h.mv.feet, d = h.mv && h.mv.data;
    const G = h.gait, kq = i => 2*Math.atan2(Math.hypot(h.pose[i*4], h.pose[i*4+1], h.pose[i*4+2]), Math.abs(h.pose[i*4+3]));
    const aL = at(h, H.BONE.ftL), aR = at(h, H.BONE.ftR), hp = at(h, H.BONE.hips);
    const extra = ` kL${kq(13).toFixed(2)} kR${kq(17).toFixed(2)} thL${kq(12).toFixed(2)} thR${kq(16).toFixed(2)} ftR${kq(18).toFixed(2)} aL(${aL.x.toFixed(3)},${aL.y.toFixed(3)},${aL.z.toFixed(3)}) aR(${aR.x.toFixed(3)},${aR.y.toFixed(3)},${aR.z.toFixed(3)}) hipW${hp.y.toFixed(3)}`;
    per.push(`${f}:${st.mode[0]} ${+j.m.toFixed(2)}@${j.at}${extra} hy${h.pose[81].toFixed(3)} hx${h.pose[80].toFixed(3)} hz${h.pose[82].toFixed(3)}` + (st.mode === "strike" ? ` k${d.k.toFixed(2)} step${d.step ? 1 : 0} w${F[0].w.toFixed(2)}` : ` g${G.state} f0${G.feet[0].down ? "d" : "s" + G.feet[0].sw.u.toFixed(2)} f1${G.feet[1].down ? "d" : "s" + G.feet[1].sw.u.toFixed(2)}`));
  }
  return per;
}, [vEnd, turn]);
console.log(out.join("\n"));
console.log("errors", K.errors);
await K.close();
