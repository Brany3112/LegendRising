// temporary probe (P3a fix round 2): baselines for the run-off after a hold
import {openKit} from "./wpK-lib.mjs";
const K = await openKit();
const out = await K.page.evaluate(async () => {
  const {H, M, THREE} = K;
  const dt = 1/60, R = {};
  // pure locomotion: standing, then 0 to 3.5 m/s over 6 frames
  for (const v0 of [3.5, 2.5]){
    K.clear();
    const h = K.body("footballer", 3); h.g.position.set(0, 0, 0); h.g.rotation.y = Math.PI/2;
    const loco = {mode: "move", speed: 0};
    for (let i = 0; i < 100; i++) H.animateHuman(h, dt, loco, {tier: 0});
    let x = 0, prevQ = K.boneQ(h), worst = 0, wat = null; const per = [];
    for (let f = 0; f < 60; f++){
      const v = v0*Math.min(1, (f + 1)/6); x += v*dt; h.g.position.x = x; loco.speed = v;
      H.animateHuman(h, dt, loco, {tier: 0});
      const j = K.boneJump(h, prevQ); prevQ = K.boneQ(h); per.push(+j.m.toFixed(3));
      if (j.m > worst){ worst = j.m; wat = [f, j.at]; }
    }
    R["loco_" + v0] = {worst: +worst.toFixed(3), at: wat, per: per.slice(0, 40).join(" ")};
  }
  // the hold let go on the run, frame by frame
  {
    K.clear();
    const h = K.body("footballer", 3); h.g.position.set(0, 0, 0); h.g.rotation.y = Math.PI/2;
    const loco = {mode: "move", speed: 0};
    for (let i = 0; i < 40; i++) H.animateHuman(h, dt, loco, {tier: 0});
    const wind = {p: 0, over: 0, side: "R", kind: "shot"}, rec = {}, up = {};
    for (let f = 0; f < 60; f++){ wind.p = Math.min(1, f/50); H.animateHuman(h, dt, M.windHold(wind, 0, rec, dt) || loco, {tier: 0}); }
    let x = 0, prevQ = K.boneQ(h); const per = [];
    for (let f = 0; f < 40; f++){
      const v = 3.5*Math.min(1, (f + 1)/6); x += v*dt; h.g.position.x = x;
      let st = M.windHold(wind, v, rec, dt);
      if (!st){ loco.speed = v; loco.upper = M.windUpper(wind, v, up); st = loco; }
      H.animateHuman(h, dt, st, {tier: 0});
      const j = K.boneJump(h, prevQ); prevQ = K.boneQ(h); per.push(`${st.mode[0]}${+j.m.toFixed(2)}@${j.at}`);
    }
    R.hold_run = per.join(" ");
  }
  return R;
});
for (const [k, v] of Object.entries(out)) console.log(k, JSON.stringify(v));
console.log("errors", K.errors);
await K.close();
