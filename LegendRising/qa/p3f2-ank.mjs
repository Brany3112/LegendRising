import {openKit} from "./wpK-lib.mjs";
const K = await openKit();
const out = await K.page.evaluate(async () => {
  const {H, M, THREE} = K;
  const dt = 1/60;
  const at = (h, i) => { h.g.updateMatrixWorld(true); return h.bones[i].getWorldPosition(new THREE.Vector3()); };
  K.clear();
  const h = K.body("footballer", 3); h.g.position.set(0, 0, 0); h.g.rotation.y = Math.PI/2;
  for (let i = 0; i < 60; i++) H.animateHuman(h, dt, {mode: "move", speed: 0}, {tier: 0});
  const G = h.gait, kq = i => 2*Math.atan2(Math.hypot(h.pose[i*4], h.pose[i*4+1], h.pose[i*4+2]), Math.abs(h.pose[i*4+3]));
  return {ankY: h.D.ankY, sc: h.scale, groundAt: !!h.groundAt, feet: G.feet.map(f => ({y: f.y, roll: f.roll, x: f.x, z: f.z})), aL: at(h, H.BONE.ftL).y, aR: at(h, H.BONE.ftR).y, kL: kq(13), kR: kq(17), hy: h.pose[81], hip: at(h, H.BONE.hips).y, hipY: h.D.hipY, kneeY: h.D.kneeY};
});
console.log(JSON.stringify(out));
await K.close();
