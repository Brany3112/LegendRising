// temporary probe (P3a fix round 2): leaving a held wind-up without a strike, and a change of striking foot mid-hold
import {openKit} from "./wpK-lib.mjs";
const K = await openKit();
const out = await K.page.evaluate(async () => {
  const {H, M, THREE} = K;
  const dt = 1/60, R = {};
  const at = (h, i) => { h.g.updateMatrixWorld(true); return h.bones[i].getWorldPosition(new THREE.Vector3()); };
  const scenario = (name, speedAfter, tier = 0, cancel = true) => {
    K.clear();
    const h = K.body("footballer", 3); h.g.position.set(0, 0, 0); h.g.rotation.y = Math.PI/2;
    const loco = {mode: "move", speed: 0};
    for (let i = 0; i < 40; i++) H.animateHuman(h, dt, loco, {tier});
    const wind = {p: 0, over: 0, side: "R", kind: "shot"}, rec = {}, up = {};
    let x = 0, prevQ = K.boneQ(h), foot = at(h, H.BONE.ftR);
    for (let f = 0; f < 60; f++){ wind.p = Math.min(1, f/50); const st = M.windHold(wind, 0, rec, dt) || loco; H.animateHuman(h, dt, st, {tier}); prevQ = K.boneQ(h); foot = at(h, H.BONE.ftR); }
    let worst = 0, wat = null, wf = 0, fat = null, sw = null;
    for (let f = 0; f < 60; f++){
      const v = speedAfter*Math.min(1, (f + 1)/6);
      x += v*dt; h.g.position.x = x;
      if (cancel) wind.p = 0;
      let st = M.windHold(wind, v, rec, dt);
      if (!st){ loco.speed = v; loco.upper = M.windUpper(wind, v, up); st = loco; if (sw == null) sw = f; }
      H.animateHuman(h, dt, st, {tier});
      const j = K.boneJump(h, prevQ); prevQ = K.boneQ(h);
      const fp = at(h, H.BONE.ftR), fd = fp.distanceTo(foot); foot = fp;
      if (j.m > worst){ worst = j.m; wat = [f, j.at, st.mode]; }
      if (fd > wf){ wf = fd; fat = [f, st.mode]; }
    }
    R[name] = {worst: +worst.toFixed(3), at: wat, footMax: +wf.toFixed(3), footAt: fat, switchAt: sw};
  };
  scenario("cancel_standing", 0);
  scenario("cancel_walk_into_jog", 2.5);
  scenario("held_then_run", 3.5, 0, false);
  scenario("held_then_run_1.8", 1.8, 0, false);
  scenario("cancel_standing_tier1", 0, 1);
  // a change of striking foot mid-hold
  for (const kind of ["shot", "pass"]){
    K.clear();
    const h = K.body("footballer", 3); h.g.position.set(0, 0, 0); h.g.rotation.y = Math.PI/2;
    const loco = {mode: "move", speed: 0};
    for (let i = 0; i < 40; i++) H.animateHuman(h, dt, loco, {tier: 0});
    const wind = {p: 0, over: 0, side: "R", kind}, rec = {};
    let prevQ = K.boneQ(h), worst = 0, wat = null, kneeL = 0;
    for (let f = 0; f < 140; f++){
      wind.p = Math.min(1, f/50); if (f >= 50) wind.side = "L";
      const st = M.windHold(wind, 0, rec, dt) || loco;
      H.animateHuman(h, dt, st, {tier: 0});
      const j = K.boneJump(h, prevQ); prevQ = K.boneQ(h);
      if (f >= 45 && j.m > worst){ worst = j.m; wat = [f, j.at]; }
    }
    const kn = at(h, H.BONE.shL), kr = at(h, H.BONE.shR);
    R["swap_" + kind] = {worst: +worst.toFixed(3), at: wat, side: h.mv.data.side, k: +h.mv.data.k.toFixed(3), kneeL: +kn.y.toFixed(3), kneeR: +kr.y.toFixed(3)};
  }
  return R;
});
for (const [k, v] of Object.entries(out)) console.log(k, JSON.stringify(v));
console.log("errors", K.errors);
await K.close();
