// verifier probe (P3a round 2): leaving a held wind-up without a strike (the charge dropped, or speeding up past
// the hysteresis line while it is held) with the exact state objects view.js gives: per-frame bone turns and the
// kicking foot's travel per frame after the switch. Baseline: a normal strike clip running to its end into loco.
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
    for (let f = 0; f < 60; f++){ wind.p = Math.min(1, f/50); const st = M.windHold(wind, 0, rec) || loco; H.animateHuman(h, dt, st, {tier}); prevQ = K.boneQ(h); foot = at(h, H.BONE.ftR); }
    const frames = [];
    for (let f = 0; f < 30; f++){
      const v = speedAfter*Math.min(1, (f + 1)/6);
      x += v*dt; h.g.position.x = x;
      if (cancel) wind.p = 0;
      let st = M.windHold(wind, v, rec);
      if (!st){ loco.speed = v; loco.upper = M.windUpper(wind, v, up); st = loco; }
      H.animateHuman(h, dt, st, {tier});
      const j = K.boneJump(h, prevQ); prevQ = K.boneQ(h);
      const fp = at(h, H.BONE.ftR), fd = fp.distanceTo(foot) - 0; foot = fp;
      if (f < 12) frames.push({f, st: st.mode, jump: +j.m.toFixed(3), bone: j.at, footMove: +fd.toFixed(3)});
    }
    R[name] = frames;
  };
  scenario("cancel_standing", 0);
  scenario("cancel_walk_into_jog", 2.5);
  scenario("held_then_run", 3.5, 0, false);
  scenario("cancel_standing_tier1", 0, 1);
  // baseline: an ordinary strike clip from standing to its end, then loco
  {
    K.clear();
    const h = K.body("footballer", 3); h.g.position.set(0, 0, 0); h.g.rotation.y = Math.PI/2;
    const loco = {mode: "move", speed: 0};
    for (let i = 0; i < 40; i++) H.animateHuman(h, dt, loco, {tier: 0});
    const ball = {x: .55, y: .11, z: -.12};
    const st = {mode: "strike", kind: "instep", side: "R", ball, dir: {x: 1, z: 0}, power: .8, tc: .35, id: "base1"};
    let prevQ = K.boneQ(h), worst = 0, wat = null;
    for (let f = 0; f < 120; f++){
      st.tc = Math.max(0, .35 - f*dt);
      const s = f < 70 ? st : loco;
      H.animateHuman(h, dt, s, {tier: 0}); M.moveEvents(h, s);
      const j = K.boneJump(h, prevQ); prevQ = K.boneQ(h);
      if (j.m > worst){ worst = j.m; wat = [f, j.at, s.mode]; }
    }
    R.baseline_strike_to_loco = {worst: +worst.toFixed(3), at: wat};
  }
  return R;
});
for (const [k, v] of Object.entries(out)) console.log(k, JSON.stringify(v));
console.log("errors", K.errors);
await K.close();
