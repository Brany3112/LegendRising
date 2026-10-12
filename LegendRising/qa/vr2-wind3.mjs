// verifier probe: the striking side flipping while the wind-up is held (control.js footNow follows the ball's side
// every step, so a ball drifting past 0.25 m to the weak side flips CTRL.wind.side mid-hold)
import {openKit} from "./wpK-lib.mjs";
const K = await openKit();
const out = await K.page.evaluate(async () => {
  const {H, M, THREE} = K;
  const dt = 1/60;
  K.clear();
  const h = K.body("footballer", 3); h.g.position.set(0, 0, 0); h.g.rotation.y = Math.PI/2;
  const loco = {mode: "move", speed: 0};
  for (let i = 0; i < 40; i++) H.animateHuman(h, dt, loco, {tier: 0});
  const wind = {p: 0, over: 0, side: "R", kind: "shot"}, rec = {};
  let prevQ = K.boneQ(h); const frames = [];
  for (let f = 0; f < 80; f++){
    wind.p = Math.min(1, f/50); if (f >= 50) wind.side = "L";
    const st = M.windHold(wind, 0, rec) || loco;
    H.animateHuman(h, dt, st, {tier: 0});
    const j = K.boneJump(h, prevQ); prevQ = K.boneQ(h);
    if (f >= 48 && f < 56) frames.push({f, id: st.id, side: st.side, jump: +j.m.toFixed(3), bone: j.at});
  }
  return frames;
});
console.log(JSON.stringify(out));
console.log("errors", K.errors);
await K.close();
