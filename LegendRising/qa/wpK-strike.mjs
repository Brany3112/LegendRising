// qa/wpK-strike.mjs: strikes on the new football moves (DESIGN 2.4 WP-K acceptance, 3.5.7, QA 4.2 shoot and pass).
// Owner: WP-K (Stage P2). Contracts 1.4.18 (moves.js planStrike, the 'strike' mode, EV), 3.5.6 and 3.5.9 (tiers).
//
// 200 seeded strikes per kind (instep, side, chip, lofted, volley, side volley, half volley; and the A1.5 hooks rabona,
// scissor and overhead bicycle, reported apart) at approach speeds 0 to 7 m/s, spread over tiers T0 to T3 (every speed
// band at every tier: the k-th strike runs at band (k + k/4) mod 8 of eight, so T0's jumps see the fast run-ups too). Each:
// a body runs at the ball (the root moved as an owner moves it, straight to where planStrike says it stands at the
// plant), the gait is handed the run-up's footprints by runupStep, the strike starts on the plant's footfall with a
// scheduled contact (a countdown st.tc, as view.js passes it, 0.85 to 1.2 of the clip's own contact time) and the root
// slows by strikeRoot. Measured:
//   1. EV.CONTACT's time (h.ev.t, the clip's own clock) within 1 ms of the requested contact, at every tier; with
//      moveEvents called after animateHuman (the tier hook, as human.js will call a mode's .events), it also arrives
//      on the frame the contact falls in;
//   2. the plant foot comes down within 3 cm of planStrike's plant (the gait's footfall, or the clip's own plant step
//      for a strike from a stand);
//   3. the striking face of the foot within 0.12 m of the ball's centre at the contact whenever the plan was feasible
//      and the clip reached its contact pose on time (reachErr 0), measured at T0 and T1 (posed every call) with the
//      frame split at the contact instant;
//   4. no bone turns more than 0.35 rad between two frames at 60 Hz (T0, full poses every frame).
//
//   QA_PORT=8769 node qa/wpK-strike.mjs [--n 200] [--sheets] [--dbg kind:i:x]   exits 1 on any failed check; writes
//   qa/out/wpK-strike.json (--dbg: one strike's frames, for working on it)
//   (--sheets: contact sheets qa/out/wpK-strike-<kind>-<view>.png, from the side, the front and first person)
import fs from "node:fs";
import path from "node:path";
import {openKit, savePng, OUT} from "./wpK-lib.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg("--n", 200), SHEETS = process.argv.includes("--sheets"), DBG = arg("--dbg", "");
const KINDS = ["instep", "side", "chip", "lofted", "volley", "sidevolley", "halfvolley"];
const HOOKS = ["rabona", "scissor", "bicycle"];
const res = {name: "wpK-strike", n: N, checks: [], kinds: {}, ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
};

const K = await openKit();
try {
  for (const kind of [...KINDS, ...HOOKS]){
    const t0 = Date.now();
    if (DBG && !DBG.startsWith(kind + ":") && !DBG.startsWith("all")) continue;
    const r = await K.page.evaluate(async ({kind, N, DBG}) => {
      const {H, M} = K;
      if (DBG.includes(":norate")) M.RATE.max = 1e9;
      let seed = 0x9e3779b9 ^ kind.length*7919 ^ kind.charCodeAt(0)*131;
      const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };
      const K0 = M.KINDS[kind];
      const out = {timing: [], plant: [], reach: [], jump: [], late: 0, infeasible: 0, errs: []};
      K.clear();
      for (let i = 0; i < N; i++){
        const tier = i % 4, v = Math.min(7, ((i + (i >> 2)) % 8)/7*7*(.85 + .3*rnd())), side = rnd() < .5 ? "L" : "R";
        const h = K.body("footballer", 1 + (i % 9));
        // the approach along +X from the origin; the aim within 35 degrees of it
        const ay = (rnd()*2 - 1)*35*Math.PI/180, aim = {x: Math.cos(ay), z: Math.sin(ay)};
        const by = K0.air ? (kind === "bicycle" ? 1.55 + .3*rnd() : kind === "scissor" ? .75 + .3*rnd() : kind === "sidevolley" ? .45 + .4*rnd() : kind === "halfvolley" ? .2 + .1*rnd() : .35 + .5*rnd()) : .11;
        const dist = v < .5 ? .8 + .3*rnd() : 5 + v*1.1 + 2*rnd();
        const ball = {x: dist, y: by, z: (rnd()*2 - 1)*.3};
        let x = 0, z = 0, yaw = Math.PI/2;
        h.g.position.set(x, 0, z); h.g.rotation.y = yaw;
        const dt = 1/60, o = {tier};
        for (let k = 0; k < 20; k++) H.animateHuman(h, dt, "idle", o);
        let T = 0;
        // the run: up to speed over 0.8 s straight along +X, then toward the plant
        let plan = null, planted = null, sp = 0;
        const step = (st) => { const e = H.animateHuman(h, dt, st, o); T += dt; return e; };
        let guard = 0;
        if (v >= .5){
          while (!planted && guard++ < 600){
            // (the owner's mover: up to speed, then easing toward the run-up's own speed so the plant lands on its spot)
            const tgt = plan && plan.speed ? Math.max(.6*v, Math.min(1.35*v, plan.speed)) : v;
            if (!(plan && plan.hold)) sp = Math.max(sp - 15*dt, Math.min(tgt, sp + 15*dt));
            let dx = 1, dz = 0;
            if (plan){ const ddx = plan.root.x - x, ddz = plan.root.z - z, dl = Math.hypot(ddx, ddz); if (dl > 1e-3){ dx = ddx/dl; dz = ddz/dl; } }
            x += dx*sp*dt; z += dz*sp*dt;
            const want = Math.atan2(dx, dz); yaw += Math.max(-6*dt, Math.min(6*dt, ((want - yaw + 3*Math.PI) % (2*Math.PI)) - Math.PI));
            h.g.position.set(x, 0, z); h.g.rotation.y = yaw;
            if (!plan && Math.hypot(ball.x - x, ball.z - z) < Math.max(2.6, 2.4 + v*.9) && h.gait.vs > .4) plan = M.planStrike(h, ball, kind, side, aim, .8);
            if (plan){ const r = M.runupStep(h, plan); if (r){ planted = r; break; } }
            step({mode: "move", speed: sp, intent: sp});
            if (tier === 0){ if (out.runQ){ const j = K.boneJump(h, out.runQ); out.runJ = Math.max(out.runJ || 0, j.m); } out.runQ = K.boneQ(h); }
            if (plan && DBG.startsWith(kind + ":" + i + ":")) (out.dlog = out.dlog || []).push(["run", +T.toFixed(3), plan.k, "root", +x.toFixed(3), +z.toFixed(3), "rp", +plan.root.x.toFixed(3), +plan.root.z.toFixed(3), "vs", +h.gait.vs.toFixed(2), "sp", +sp.toFixed(2), "phi", +h.gait.phi.toFixed(3), plan.hold ? "HOLD" : "", h.gait.feet.map(f => f.down ? "down" : f.sw.kind + ":" + f.sw.u.toFixed(2) + ":" + f.sw.x1.toFixed(3) + "," + f.sw.z1.toFixed(3)).join(" ")]);
            if (plan && h.gait.falls.length) (plan.log = plan.log || []).push(h.gait.falls.map(fl => fl.side + "@" + fl.x.toFixed(2) + "," + fl.z.toFixed(2)).join(" ") + " i" + plan.i);
          }
          // the footfall that ended the run happened in the last call: its place against the plan's
          const diag = () => JSON.stringify({v: +v.toFixed(2), n: plan && plan.n, scale: plan && +plan.scale.toFixed(2), feas: plan && plan.feasible, plant: plan && [+plan.plant.x.toFixed(2), +plan.plant.z.toFixed(2)], steps: plan && plan.steps.map(p => p.side + "@" + p.x.toFixed(2) + "," + p.z.toFixed(2)), log: plan && plan.log});
          if (planted && !planted.last){ const e = Math.hypot(planted.x - plan.plant.x, planted.z - plan.plant.z); out.plant.push(e); if (e > .03 && out.errs.length < 8) out.diag = (out.diag || []).concat([`plant ${i}: ${e.toFixed(3)} ${diag()}`]); }
          if (!planted){ out.errs.push(`${kind} ${i}: never planted ${diag()}`); K.clear(); continue; }
        } else {
          plan = M.planStrike(h, ball, kind, side, aim, .8);
        }
        // the strike: the contact requested 0.85 to 1.2 of the clip's own time after the plant (a stand: after its step)
        // (a run-up hands its last step to the clip: the swing time left is the clip's plant step)
        const pre = v >= .5 ? (planted && planted.last ? planted.pre : 0) : plan.pre || 0, tcReq = pre + K0.contact*(.85 + .35*rnd());
        const Tstart = T, ctAbs = Tstart + tcReq;
        const st = {mode: "strike", kind, side, ball, dir: aim, power: .8, plant: plan.plant, tc: tcReq};
        if (v >= .5) st.pre = pre;
        const x0 = x, z0 = z, rootAt = plan.root;
        let plantDue = false, jAt = null, prevQ = null, gotC = null, frameOfC = -1, reach = null, maxJ = 0, f = 0, plantErr = null;
        h.evLog = [];
        const startSp = v >= .5 ? sp : 0;
        if (DBG.startsWith(kind + ":" + i + ":") || DBG === kind + ":" + i){ const T2 = h.te; (out.dlog = out.dlog || []).push(["loco", [12,13,14,16,17,18].map(b => [T2[b*3],T2[b*3+1],T2[b*3+2]].map(w => +w.toFixed(2)).join(",")).join(" | "), JSON.stringify(h.gait.feet.map(f => [f.down, f.sw && f.sw.u]))]); }
        let tt = 0;
        while (tt < K0.dur + .1 + pre){
          // split the step at the contact so the pose there can be measured
          let d = dt, split = false;
          if (gotC == null && T + d > ctAbs - 1e-9 && T < ctAbs - 1e-6){ d = ctAbs - T; split = true; }
          // the root: from a stand it is carried to its plant place over the plant step; a run slows by strikeRoot
          if (v < .5){ const u = Math.min(1, (tt + d)/Math.max(.05, plan.tPlant || .05)), e = u*u*(3 - 2*u); x = x0 + (rootAt.x - x0)*e; z = z0 + (rootAt.z - z0)*e; }
          else { const s2 = startSp*M.strikeRoot(tt - pre, K0.contact); x += Math.sin(yaw)*s2*d; z += Math.cos(yaw)*s2*d; }
          h.g.position.set(x, 0, z);
          st.tc = ctAbs - (T + d);
          const e = H.animateHuman(h, d, st, o);
          M.moveEvents(h, st);
          T += d; tt += d; f++;
          if ((e.mask & 8) && gotC == null){ gotC = e.t; frameOfC = T; }
          if ((e.mask & 2) && (v < .5 || (planted && planted.last))) plantDue = true;
          if (plantDue && plantErr == null && h.mv && h.mv.feet && h.mv.feet[side === "L" ? 1 : 0].down && h.mv.tau >= -(h.mv.back || 0) - 1e-6){
            // the plant step's own landing (a stand's, or a run-up's last step taken over by the clip): where the clip
            // put the support foot (the first pose after it)
            // (the drawn foot: its ankle from the bones, flat on its footprint)
            const fb = h.bones[side === "L" ? H.BONE.ftR : H.BONE.ftL]; h.g.updateMatrixWorld(true);
            const pa = fb.getWorldPosition(new K.THREE.Vector3()); plantErr = Math.hypot(pa.x - plan.plant.x, pa.z - plan.plant.z);
            if (plantErr > .03 && (out.diag || []).length < 10) out.diag = (out.diag || []).concat([`plantD ${i}: ${plantErr.toFixed(3)} v ${v.toFixed(2)} tier ${tier} pre ${pre.toFixed(2)} tau ${h.mv.tau.toFixed(3)} ankle ${[pa.x, pa.y, pa.z].map(q => q.toFixed(2))} plant ${[plan.plant.x, plan.plant.z].map(q => q.toFixed(2))} root ${[x, z].map(q => q.toFixed(2))} rp ${[plan.root.x, plan.root.z].map(q => q.toFixed(2))}`]);
          }
          if (split && tier <= 1){
            const pt = M.partPoint(h, K0.part, side), dd = pt.distanceTo(new K.THREE.Vector3(ball.x, ball.y, ball.z));
            const clip = M.clipOf(h);
            reach = {d: dd, feasible: plan.feasible && clip.reachErr === 0};
            if (reach.feasible && dd > .12 && (out.diag || []).length < 8) out.diag = (out.diag || []).concat([`reach ${i}: ${dd.toFixed(3)} v ${v.toFixed(2)} tier ${tier} side ${side} ball ${JSON.stringify(ball)} pt ${[pt.x, pt.y, pt.z].map(q => q.toFixed(3))} pre ${pre.toFixed(2)}`]);
          }
          if (DBG.startsWith(kind + ":" + i + ":") || DBG === kind + ":" + i){ const T2 = h.te, q = h.mv; (out.dlog = out.dlog || []).push([+tt.toFixed(3), +q.tau.toFixed(3), [60,61,62].map(k => +T2[k].toFixed(3)).join(",") + " P " + [80,81,82].map(k => +h.pose[k].toFixed(3)).join(",") + " Q17 " + [68,69,70,71].map(k => +h.pose[k].toFixed(2)).join(","), [12,13,14,16,17,18].map(b => [T2[b*3],T2[b*3+1],T2[b*3+2]].map(w => +w.toFixed(2)).join(",")).join(" | "), (() => { h.g.updateMatrixWorld(true); return ["ftL", "ftR"].map(n => { const p = h.bones[H.BONE[n]].getWorldPosition(new K.THREE.Vector3()); return n + " " + [p.x, p.y, p.z].map(w => w.toFixed(3)).join(","); }).join(" "); })(), (q.feet || []).map(f => f.w + ":" + f.kb.toFixed(2) + ":" + [f.x, f.y, f.z].map(w => w.toFixed(2)).join(",") + " y" + f.yaw.toFixed(2) + " p" + f.pitch.toFixed(2)).join("  ")]); }
          if (tier === 0 && !split && d === dt){
            if (prevQ && (DBG.startsWith(kind + ":" + i + ":"))){ const jj = K.boneJump(h, prevQ); (out.dlog = out.dlog || []).push(["J", +tt.toFixed(3), +h.mv.tau.toFixed(3), jj.at, +jj.m.toFixed(2)]); }
            if (prevQ){ const j = K.boneJump(h, prevQ); if (j.m > maxJ){ maxJ = j.m; jAt = [+tt.toFixed(3), j.at, h.mv && h.mv.feet ? h.mv.feet.map(f => f.w).join("") : ""]; } }
            prevQ = K.boneQ(h);
          } else if (tier === 0) prevQ = K.boneQ(h);
        }
        if ((v < .5 || (planted && planted.last)) && plantErr != null) out.plant.push(plantErr);
        if (gotC == null) out.errs.push(`${kind} ${i}: no contact event`);
        else {
          out.timing.push(Math.abs(Tstart + gotC - ctAbs));
          // delivered on the frame the contact fell in (the split frame ends exactly on it)
          if (Math.abs(frameOfC - ctAbs) > 1e-6 && frameOfC - ctAbs > dt + 1e-6) out.late++;
        }
        if (reach){ if (reach.feasible) out.reach.push(reach.d); else out.infeasible++; }
        if (tier === 0){ out.jump.push(maxJ); if (maxJ > .3505 && (out.diag || []).length < 8) out.diag = (out.diag || []).concat([`jump ${i}: ${maxJ.toFixed(2)} at ${JSON.stringify(jAt)} v ${v.toFixed(2)} pre ${pre.toFixed(2)}`]); }
        K.clear();
      }
      if (DBG && !DBG.startsWith("all")) return {dlog: out.dlog};
      K.clear();
      const q = (a, p) => { const b = [...a].sort((u, w) => u - w); return b.length ? b[Math.min(b.length - 1, Math.floor(p*b.length))] : null; };
      return {n: N, timingMax: Math.max(0, ...out.timing), timingN: out.timing.length, late: out.late,
        plantMax: Math.max(0, ...out.plant), plantP95: q(out.plant, .95), plantN: out.plant.length,
        reachMax: Math.max(0, ...out.reach), reachP95: q(out.reach, .95), reachN: out.reach.length, infeasible: out.infeasible,
        runJump: out.runJ || 0, jumpMax: Math.max(0, ...out.jump), jumpP95: q(out.jump, .95), jumpN: out.jump.length, errs: out.errs.slice(0, 5), nErr: out.errs.length, diag: (out.diag || []).slice(0, 4)};
    }, {kind, N, DBG});
    if (DBG && !DBG.startsWith("all")){ for (const l of r.dlog || []) console.log(JSON.stringify(l)); continue; }
    res.kinds[kind] = r;
    const hook = HOOKS.includes(kind) ? " (A1.5 hook)" : "";
    console.log(`${kind}: ${((Date.now() - t0)/1000).toFixed(1)} s`, JSON.stringify(r));
    const r4 = v => Math.round(v*1e4)/1e4;
    check(r.nErr === 0 && r.timingN === N, `${kind}${hook}: every strike plants and makes contact`, {errs: r.errs, n: r.timingN});
    check(r.timingMax <= .001, `${kind}${hook}: EV.CONTACT within 1 ms of the requested contact at tiers T0 to T3`, {max_s: r4(r.timingMax)});
    check(r.late === 0, `${kind}${hook}: with the tier hook (moveEvents) the contact arrives on its own frame`, {late: r.late});
    check(r.plantMax <= .03, `${kind}${hook}: the plant foot comes down within 3 cm of the plan`, {max_m: r4(r.plantMax), p95: r4(r.plantP95), n: r.plantN});
    check(r.reachN > 0 && r.reachMax <= .12, `${kind}${hook}: the striking face within 0.12 m of the ball's centre at contact when feasible (T0, T1)`, {max_m: r4(r.reachMax), p95: r4(r.reachP95), n: r.reachN, infeasible: r.infeasible});
    check(r.jumpMax <= .35, `${kind}${hook}: no bone turns more than 0.35 rad between frames (T0)`, {max_rad: r4(r.jumpMax), p95: r4(r.jumpP95), n: r.jumpN});
  }
  if (SHEETS){
    for (const kind of [...KINDS, ...HOOKS]){
      const urls = await K.page.evaluate(async (kind) => {
        const {H, M} = K; K.clear();
        const K0 = M.KINDS[kind], out = [];
        for (const view of ["side", "front", "fp"]){
          const h = K.body("footballer", 5, {}, {fp: view === "fp"});
          let x = -6, z = 0, yaw = Math.PI/2, sp = 0; h.g.position.set(x, 0, z); h.g.rotation.y = yaw;
          for (let k = 0; k < 20; k++) H.animateHuman(h, 1/60, "idle");
          const by = K0.air ? (kind === "bicycle" ? 1.7 : kind === "scissor" ? .9 : kind === "sidevolley" ? .7 : .6) : kind === "halfvolley" ? .25 : .11;
          const ball = {x: 0, y: by, z: .1}; K.ball.position.set(ball.x, ball.y, ball.z);
          const aim = {x: 1, z: 0}, v = 4;
          let plan = null, planted = null;
          const S = K.sheet(200, view === "fp" ? 170 : 250, 10);
          let f = 0;
          const shot = () => { if (f++ % 3 === 0) S.shot(view === "fp" ? K.view(h, "fp", {pitch: .62}) : K.view(h, view, {cx: x, cz: z}), ""); };
          for (let g = 0; g < 400 && !planted; g++){
            sp = Math.min(v, sp + 9/60);
            let dx = 1, dz = 0;
            if (plan){ const ddx = plan.root.x - x, ddz = plan.root.z - z, dl = Math.hypot(ddx, ddz); if (dl > 1e-3){ dx = ddx/dl; dz = ddz/dl; } }
            x += dx*sp/60; z += dz*sp/60; h.g.position.set(x, 0, z);
            if (!plan && Math.hypot(ball.x - x, ball.z - z) < 3.2) plan = M.planStrike(h, ball, kind, "R", aim, .85);
            if (plan){ const r = M.runupStep(h, plan); if (r){ planted = r; break; } }
            H.animateHuman(h, 1/60, {mode: "move", speed: sp, intent: sp});
            if (Math.hypot(ball.x - x, ball.z - z) < 4.5) shot();
          }
          let tt = 0;
          const pre = planted.last ? planted.pre : 0;
          const st = {mode: "strike", kind, side: "R", ball, dir: aim, power: .85, plant: plan.plant, pre};
          while (tt < K0.dur + pre + .25){
            x += Math.sin(h.g.rotation.y)*sp*M.strikeRoot(tt - pre, K0.contact)/60; z += Math.cos(h.g.rotation.y)*sp*M.strikeRoot(tt - pre, K0.contact)/60; h.g.position.set(x, 0, z);
            H.animateHuman(h, 1/60, st); tt += 1/60; shot();
          }
          out.push([view, S.url()]);
          h.g.parent.remove(h.g);
        }
        return out;
      }, kind);
      for (const [view, u] of urls) savePng(u, `wpK-strike-${kind}-${view}.png`);
      console.log("sheets:", kind);
    }
  }
  if (K.errors.length) check(false, "no page errors", K.errors.slice(0, 5));
} finally {
  await K.close();
}
fs.writeFileSync(path.join(OUT, "wpK-strike.json"), JSON.stringify(res, null, 1));
console.log(res.ok ? "wpK-strike: all checks pass" : "wpK-strike: FAILED");
process.exit(res.ok ? 0 : 1);
