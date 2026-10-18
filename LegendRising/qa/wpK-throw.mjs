// qa/wpK-throw.mjs: the throw-in on the new moves (DESIGN 2.4 WP-K acceptance, 3.5.7).
// Owner: WP-K (Stage P2). Contracts 1.4.18 (moves.js, the 'throwin' mode), 3.5.6 (the plant pass), 3.5.9 (tiers).
//
// A standing throw-in (st = {mode: 'throwin'}, 1.0 s) on 40 seeded bodies at tiers T0 to T3 and frame steps of 1/30 to
// 1/144 s. Measured:
//   1. both feet stay where they stood: each ankle (from the bones) drifts less than 3 mm over the whole clip (T0, T1:
//      the tiers that pose every frame);
//   2. EV.RELEASE at 0.62 of the 1.0 s clip: h.ev.t within 1 ms of 0.62 at every tier (with moveEvents called after
//      animateHuman, the tier hook, at T2 and T3).
//
//   QA_PORT=8769 node qa/wpK-throw.mjs [--sheets]   exits 1 on any failed check; writes qa/out/wpK-throw.json
//   (--sheets: the throw from the side and through the thrower's eyes, qa/out/wpK-throw-*.png)
import fs from "node:fs";
import path from "node:path";
import {openKit, savePng, OUT} from "./wpK-lib.mjs";

const SHEETS = process.argv.includes("--sheets");
const res = {name: "wpK-throw", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};

const K = await openKit();
try {
  const out = await K.page.evaluate(async () => {
    const {H, M} = K;
    const res = {drift: 0, driftN: 0, rel: [], relErr: 0, missing: 0};
    const steps = [1/30, 1/60, 1/90, 1/144];
    for (let i = 0; i < 40; i++){
      K.clear();
      const tier = i % 4, dt = steps[(i >> 2) % 4];
      const h = K.body("footballer", 1 + (i % 9));
      h.g.position.set(3 + i*.1, 0, -2 + (i % 5)*.3); h.g.rotation.y = i*.7;
      const o = {tier};
      for (let k = 0; k < 30; k++) H.animateHuman(h, 1/60, "idle", {tier: 0});
      const st = {mode: "throwin"};
      h.g.updateMatrixWorld(true);
      const ank = () => [H.BONE.ftL, H.BONE.ftR].map(b => h.bones[b].getWorldPosition(new K.THREE.Vector3()));
      let a0 = null, T = 0, rel = null;
      while (T < 1.05){
        const e = H.animateHuman(h, dt, st, o);
        if (tier >= 2) M.moveEvents(h, st);
        T += dt;
        const ev = h.ev;
        if (rel == null && (ev.mask & 16)) rel = ev.t;
        if (tier <= 1){
          h.g.updateMatrixWorld(true);
          const a = ank();
          if (!a0) a0 = a;
          else for (let j = 0; j < 2; j++) res.drift = Math.max(res.drift, a[j].distanceTo(a0[j]));
          res.driftN++;
        }
      }
      if (rel == null) res.missing++;
      else { res.rel.push(rel); res.relErr = Math.max(res.relErr, Math.abs(rel - .62)); }
    }
    return res;
  });
  res.out = out;
  check(out.driftN > 0 && out.drift < .003, "both feet drift less than 3 mm through the throw (T0, T1)", {max_m: +out.drift.toFixed(5), frames: out.driftN});
  check(out.missing === 0 && out.relErr <= .001, "EV.RELEASE at 0.62 of the 1.0 s clip, within 1 ms, at tiers T0 to T3", {max_s: +out.relErr.toFixed(5), missing: out.missing, n: out.rel.length});
  if (SHEETS){
    const urls = await K.page.evaluate(async () => {
      const {H} = K, list = [];
      K.clear();
      const h = K.body("footballer", 5);
      h.g.position.set(0, 0, 0); h.g.rotation.y = Math.PI/2;
      for (let k = 0; k < 20; k++) H.animateHuman(h, 1/60, "idle");
      const side = K.sheet(160, 220, 9), fp = K.sheet(200, 150, 9);
      const fpb = K.body("footballer", 5, {}, {fp: true});
      fpb.g.position.set(20, 0, 0); fpb.g.rotation.y = Math.PI/2;
      for (let k = 0; k < 20; k++) H.animateHuman(fpb, 1/60, "idle");
      for (let f = 0; f <= 66; f++){
        H.animateHuman(h, 1/60, {mode: "throwin"});
        H.animateHuman(fpb, 1/60, {mode: "throwin"});
        if (f % 6 === 0){
          const t = (f/60).toFixed(2);
          // the ball between the palms until the release, then on its way
          const put = b => { const l = K.M.partPoint(b, "handL"), r = K.M.partPoint(b, "handR"); K.ball.position.set((l.x + r.x)/2, (l.y + r.y)/2 + .06, (l.z + r.z)/2); };
          put(h); if (f > 38) K.ball.position.x += (f - 38)/60*8;
          side.shot(K.view(h, "side", {d: 3.6, ty: 1.1}), t);
          put(fpb); if (f > 38) K.ball.position.x += (f - 38)/60*8;
          fp.shot(K.view(fpb, "fp", {pitch: .05}), t);
        }
      }
      list.push(["side", side.url()], ["fp", fp.url()]);
      return list;
    });
    for (const [nm, u] of urls) savePng(u, `wpK-throw-${nm}.png`);
  }
  if (K.errors.length) check(false, "no page errors", K.errors.slice(0, 5));
} finally {
  await K.close();
}
fs.writeFileSync(path.join(OUT, "wpK-throw.json"), JSON.stringify(res, null, 1));
console.log(res.ok ? "wpK-throw: all checks pass" : "wpK-throw: FAILED");
process.exit(res.ok ? 0 : 1);
