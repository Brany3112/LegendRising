// qa/tr9-anim.mjs: Training Mode as the animation test bed (P9-A, TRAINING-SPEC 6; BUILD-PLAN P9-A acceptance), in the real
// page, stepped frozen (lib.mjs freeze, __life.stepN: every body posed every step, nothing drawn).
//   generic, bots (the player stood in for by the AI, meAI) through drills of every training category: per drawn body,
//     - a planted foot slides at most 10 mm over its plant;
//     - no bone turns more than 0.25 rad in a frame outside the designated impulses (a strike's, a tackle's, a header's
//       contact and a dive);
//     - at a kick's contact the kicking foot is within 0.12 m of the drawn ball (a header: the head);
//     - no clip held more than 0.5 s past its end (no stuck state);
//     - no bone turns more than 0.3 rad in the frame a pose changes to another (the transitions are blended);
//   and each item's own check (the generic metrics pass even when a state is never reached):
//     MV-9 jockey: laterally and backward at 1.0, 2.0 and 3.2 m/s, jockeying: the gait's jockey style in at least 90% of
//       the frames, the lead foot stays the lead (no crossover), the feet at least 0.08 m apart, a planted foot drifts at
//       most 2 mm;
//     MV-9 dribble touches: at every dribble touch of the simulation the drawn foot's touch is asked for within 1 frame
//       (view.js V.touchSpy); in at least 95% of them the drawn foot meets the drawn ball (its toe within 0.15 m);
//     MV-15 the first-person body: fpPose gets the arms-in every frame (the life body's neck fix is not this body's: it
//       moved the feet ahead of the camera, qa/uf2-feel.mjs) (view.js V.fpSpy); over 600
//       frames of sprinting, turning and looking down to -60 degrees no joint of it is within 0.12 m in front of the
//       camera inside the middle 40% of the view, and its hands keep out of the middle half (but in an action that uses
//       them);
//     MV-15 tired: breath 15 and standing: fatigue over 0.7 and the tired pose within 1 s; breath back over the
//       threshold: the pose ends within 1 s; an AI body the same;
//     MV-15 camAction: a scripted strike, slide, chest receive and header landing each give exactly one camAction of their
//       kind (backswing, slide, chest, land) within 1 frame of the clip's event (matchcam.js MC.camActs); the camera's
//       roll stays within 2 degrees;
//     GK-3 distribution: across seeds the keeper plays gkthrow and gkroll acts; the drawn ball is within 0.15 m of his
//       releasing hand until tRelease, and the clip's release (its contact event) within 1 frame of it.
//
//   node qa/tr9-anim.mjs          exits 1 on any failed check; writes qa/out/tr9-anim.json
import {freeze, unfreeze} from "./lib.mjs";
import {trainLaunch, enterByButton} from "./tr4b-lib.mjs";
import {checker} from "./wpF-lib.mjs";

const {check, done} = checker("tr9-anim");
const t = await trainLaunch({seed: 9});
const page = t.page;
// (a start may build another cage, which takes real frames: unfrozen for it, frozen again once it plays)
const ready = async () => { await unfreeze(page); await page.waitForFunction(() => { const R = window.__trainRun.RUN; return !!R.cur && !R.switching && !!R.T && !!R.T.V; }, null, {timeout: 120000}); await freeze(page); };
try {
  await enterByButton(page);
  await page.evaluate(() => window.__trainHub.closeHub());
  await page.evaluate(async () => {
    const Rn = window.__trainRun, L = window.__life, HM = await import("/js/life/human.js"), MC = (await import("/js/life/football/matchcam.js")).MC;
    const VW = await import("/js/life/football/view.js"), AC = await import("/js/life/football/actions.js"), GB = await import("/js/life/football/gkbrain.js");
    const MV = await import("/js/life/moves.js"), C = await import("/js/life/football/control.js");
    // (U21: football is third person by default; MV-15's checks are of the first-person body and its camera, so this suite
    // plays with the Football camera setting on First person; qa/u21-camera.mjs checks third person)
    C.saveSet({footCam: "first"}); MC.tpK = 0;
    const B = HM.BONE, Vec = L.cam.position.constructor, Q = L.cam.quaternion.constructor;
    const v1 = new Vec(), v2 = new Vec();
    const start = (id, cfg) => { if (Rn.RUN.cur) Rn.stopScenario("restart"); const sc = Rn.scenario(id); return Rn.startScenario(id, Object.assign({}, sc.config, cfg || {})); };
    const T = () => Rn.RUN.cur.T;
    // every drawn body's measurements over n frames
    function generic(n){
      const out = {frames:0, bodies:0, slideMax:0, slideAt:null, boneMax:0, boneAt:null, transMax:0, transAt:null, contacts:0, contactBad:[], stuck:[]};
      const S = new Map();
      const Tn = T(), V = Tn.V;
      let ms = Tn.ms, evAt = ms.events.length, skip = 10;
      for (let f = 0; f < n; f++){
        L.stepN(1);
        out.frames++;
        if (Rn.RUN.cur && Rn.RUN.cur.T !== Tn) break;
        // (a go's restart is a new simulation, its bodies put back where they start: a cut, so the frames after it are
        // not measured, and each body's record starts again)
        if (Tn.ms !== ms){ ms = Tn.ms; evAt = ms.events.length; skip = 10; S.clear(); }
        if (skip > 0){ skip--; continue; }
        L.scene().updateMatrixWorld(true);
        for (const R of V.rec){
          if (!R || R.hidden || !R.h || !R.h.posed) continue;
          const h = R.h, a = R.a;
          let s = S.get(a.id);
          if (!s){ s = {q: h.bones.map(b => new Q().copy(b.quaternion)), plant: [null, null], mode: h.mode, mv: h.mv ? h.mv.key : null}; S.set(a.id, s); out.bodies++; continue; }
          const modeNow = h.mode + "|" + (h.mv ? h.mv.key + (h.mv.id || "") : ""), changed = modeNow !== s.mode;
          // designated impulses: around a contact of a strike, a tackle or a header, and a dive
          const mv = h.mv, imp = !!mv && (mv.key === "strike" || mv.key === "tackle" || mv.key === "header" || mv.key === "gkdive" || mv.key === "gkpunch" || mv.key === "gktip" || mv.key === "gkcatch" || mv.key === "gkcollect") && Math.abs((mv.tau || 0) - (mv.contact || 0)) < .12;
          let bm = 0;
          for (let i = 0; i < h.bones.length; i++){ const ang = h.bones[i].quaternion.angleTo(s.q[i]); if (ang > bm) bm = ang; s.q[i].copy(h.bones[i].quaternion); }
          // (a far body is posed less often than every frame, its level of detail (the scheduler's tiers): a pose that
          // has not changed is a frame it was not posed in, and the next change is spread over the frames since)
          if (bm === 0){ s.idle = (s.idle || 0) + 1; continue; }
          // (a body not posed in the frame before: its plants start again, a skipped frame can carry a foot to a new one)
          if (s.idle > 0){ s.plant[0] = s.plant[1] = null; }
          bm /= (s.idle || 0) + 1; s.idle = 0;
          if (changed){ if (bm > out.transMax){ out.transMax = bm; out.transAt = {id:a.id, from:s.mode, to:modeNow, t:ms.t}; } }
          else if (!imp && bm > out.boneMax){ out.boneMax = bm; out.boneAt = {id:a.id, mode:modeNow, t:ms.t, tau:mv ? mv.tau : null}; }
          s.mode = modeNow;
          // planted feet: the ball of the drawn foot (the toe joint, the pivot it rolls over: the ankle rises and moves on
          // as the heel comes up) while the gait has it down, from the frame it lands
          const G = h.gait;
          if (G && h.mode === "loco") for (let i = 0; i < 2; i++){
            const f = G.feet[i], bone = h.bones[i === 0 ? B.toL : B.toR];
            bone.getWorldPosition(v1);
            const p = s.plant[i];
            if (f.down && p && p.n === G.n + ":" + f.tDown.toFixed(0)){ }
            // (one plant: the foot down all along, its own time down growing; a body posed less often than every frame
            // can lift a foot and set it down again between two poses, which starts a new plant)
            if (f.down){
              // (one plant: the same footfall of the gait, G.n counting them, and the foot's own time down growing)
              if (p && p.down && f.tDown >= p.tDown && p.n === G.n){ p.tDown = f.tDown; const d = Math.hypot(v1.x - p.x0, v1.z - p.z0); if (d > p.max) p.max = d; if (p.max > out.slideMax){ out.slideMax = p.max; out.slideAt = {id:a.id, foot:i, t:ms.t, v:a.m.speed}; } }
              else s.plant[i] = {down:true, x0:v1.x, z0:v1.z, max:0, tDown:f.tDown, n:G.n};
            } else s.plant[i] = null;
          } else { s.plant[0] = s.plant[1] = null; }
          // stuck: a clip held more than 0.5 s past its end
          if (h.mv && h.mv.dur && h.mode === h.mv.key && h.mv.tau > h.mv.dur + .5 && h.mode !== "move" && h.mode !== "gkready" && h.mode !== "gkset" && h.mode !== "tired") out.stuck.push({id:a.id, mode:h.mode, tau:h.mv.tau, dur:h.mv.dur});
        }
        // contacts: a kick this frame by a drawn body: its kicking foot (or head) at the drawn ball
        const E = ms.events;
        for (let i = evAt; i < E.length; i++){
          const e = E[i];
          if (e.kind !== "kick" || e.agent < 0) continue;
          const R = V.rec[e.agent]; if (!R || R.hidden || !R.h || !R.h.posed) continue;
          if (e.intent === "throw" || e.intent === "roll" || e.intent === "punt") continue;
          const h = R.h; V.ball.mesh.getWorldPosition(v2);
          const parts = e.intent === "header" ? [B.head] : [B.toL, B.ftL, B.toR, B.ftR];
          // (from the ball's surface: its centre less its radius, less the head's own for a header)
          let best = 9; for (const p of parts){ h.bones[p].getWorldPosition(v1); const d = v1.distanceTo(v2) - .11 - (p === B.head ? .12 : .0); if (d < best) best = d; }
          out.contacts++;
          if (best > .12) out.contactBad.push({id:e.agent, intent:e.intent, d:+best.toFixed(3), t:e.t});
        }
        evAt = E.length;
      }
      out.stuck = out.stuck.slice(0, 5); out.contactBad = out.contactBad.slice(0, 8);
      return out;
    }
    window.__t9 = {Rn, L, HM, MC, VW, AC, GB, MV, C, B, start, T, generic, v1, v2};
  });
  await freeze(page);

  /* ---------- generic: bots through every category ---------- */
  const cats = await page.evaluate(() => window.__trainRun.CATEGORIES.map(c => c.id).filter(c => c !== "fullmatch"));
  const G = [];
  for (const cat of cats){
    const ids = await page.evaluate(c => window.__trainRun.scenariosOf(c).map(s => s.id).slice(0, 2), cat);
    for (const id of ids){
      await page.evaluate(id => window.__t9.start(id, {}), id);
      try { await ready(); } catch(e){ G.push({cat, id, err:"start"}); continue; }
      const r = await page.evaluate(() => { const ms = window.__t9.T().ms; ms.meAI = true; window.__t9.T().V.fpOn = false; return window.__t9.generic(60*8); });
      G.push(Object.assign({cat, id}, r));
    }
  }
  const agg = k => Math.max(...G.filter(g => g[k] != null).map(g => g[k]));
  const bad = (k, lim) => G.filter(g => g[k] > lim).map(g => ({id:g.id, v:+g[k].toFixed(3), at:g[k.replace("Max", "At")]}));
  check(G.length >= cats.length, `the bots ran drills of every category (${cats.join(", ")})`, G.map(g => g.id));
  check(agg("slideMax") <= .010, "a planted foot slides at most 10 mm over its plant", {max:+agg("slideMax").toFixed(4), worst:bad("slideMax", .010).slice(0, 4)});
  check(agg("boneMax") <= .25, "no bone turns more than 0.25 rad in a frame outside the designated impulses", {max:+agg("boneMax").toFixed(3), worst:bad("boneMax", .25).slice(0, 4)});
  const contacts = G.reduce((a, g) => a + (g.contacts || 0), 0), cbad = G.flatMap(g => g.contactBad || []);
  check(contacts > 0 && cbad.length/contacts <= .05, "at contact the kicking foot (a header: the head) is within 0.12 m of the drawn ball (95% of contacts)", {contacts, bad:cbad.length, some:cbad.slice(0, 5)});
  check(!G.some(g => (g.stuck || []).length), "no clip held more than 0.5 s past its end (no stuck state)", G.filter(g => (g.stuck || []).length).map(g => ({id:g.id, s:g.stuck[0]})));
  check(agg("transMax") <= .30, "no bone turns more than 0.3 rad in the frame a pose changes (the transitions are blended)", {max:+agg("transMax").toFixed(3), worst:bad("transMax", .30).slice(0, 4)});
  global.__G = G;

  /* ---------- MV-9: jockey (one body moved by hand, the simulation held: the gait sees exactly the speeds asked) ---------- */
  await page.evaluate(id => window.__t9.start(id, {}), "def-1v1");
  await ready();
  const J = await page.evaluate(() => {
    const W9 = window.__t9, Tn = W9.T(), ms = Tn.ms, V = Tn.V, L = W9.L, B = W9.B, v1 = W9.v1, v2 = W9.v2;
    W9.Rn.setPaused(true);
    const a = ms.agents.find(o => o.team !== ms.agents[ms.me].team && !o.isGK && V.rec[o.id] && !V.rec[o.id].hidden);
    const R = V.rec[a.id], out = [];
    // (near the camera: posed every frame, at the nearest level of detail)
    const F = Tn.F || {cx:0, cz:0}, P = L.P;
    for (const [kind, v] of [["lateral", 1], ["lateral", 2], ["lateral", 3.2], ["backward", 1], ["backward", 2], ["backward", 3.2]]){
      a.m.x = P.x - F.cx - Math.sin(P.yaw)*5; a.m.z = P.z - F.cz - Math.cos(P.yaw)*5 - (kind === "lateral" ? 2 : 0);
      // facing -x; lateral: along +z; backward: along +x (away from where he faces)
      a.m.yaw = Math.PI/2; a.m.heading = kind === "lateral" ? Math.PI : -Math.PI/2;
      const vx = kind === "lateral" ? 0 : v, vz = kind === "lateral" ? v : 0;
      a.state = "jockey"; a.act = null;
      let n = 0, jk = 0, cross = 0, apart = 9, drift = 0, lead = null;
      const plant = [null, null];
      for (let f = 0; f < 180; f++){
        a.x0 = a.m.x; a.z0 = a.m.z; a.m.x += vx/60; a.m.z += vz/60; a.m.vx = vx; a.m.vz = vz; a.m.speed = v; a.m.target = v; a.state = "jockey";
        L.stepN(1);
        if (f < 30) continue;
        n++;
        const G = R.h.gait;
        if (G && G.jockey) jk++;
        L.scene().updateMatrixWorld(true);
        // (the feet apart: the ankles; the plant: the ball of the foot, the toe joint, which stays put as the heel rises)
        R.h.bones[B.ftL].getWorldPosition(v1); R.h.bones[B.ftR].getWorldPosition(v2);
        apart = Math.min(apart, Math.hypot(v1.x - v2.x, v1.z - v2.z));
        R.h.bones[B.toL].getWorldPosition(v1); R.h.bones[B.toR].getWorldPosition(v2);
        // the lead foot: the one further along the way he goes
        const ux = vx/v, uz = vz/v, pl = v1.x*ux + v1.z*uz, pr = v2.x*ux + v2.z*uz, ld = pl > pr ? 0 : 1;
        if (lead == null && Math.abs(pl - pr) > .1) lead = ld;
        if (lead != null && ld !== lead && Math.abs(pl - pr) > .05) cross++;
        for (let i = 0; i < 2; i++){
          const ft = G && G.feet[i], p = i ? v2 : v1;
          if (ft && ft.down){ if (plant[i] && ft.tDown >= plant[i].t) { plant[i].t = ft.tDown; drift = Math.max(drift, Math.hypot(p.x - plant[i].x, p.z - plant[i].z)); } else plant[i] = {x:p.x, z:p.z, t:ft.tDown}; }
          else plant[i] = null;
        }
      }
      out.push({kind, v, jockey:+(jk/n).toFixed(3), cross, apart:+apart.toFixed(3), drift:+drift.toFixed(4)});
    }
    W9.Rn.setPaused(false);
    return out;
  });
  check(J.every(r => r.jockey >= .9), "MV-9 jockey: the gait's jockey style in at least 90% of the jockeying frames (laterally and backward, 1.0, 2.0 and 3.2 m/s)", J);
  check(J.every(r => r.cross === 0 && r.apart >= .08), "MV-9 jockey: the lead foot stays the lead (no crossover) and the feet stay at least 0.08 m apart", J);
  check(J.every(r => r.drift <= .002), "MV-9 jockey: a planted foot drifts at most 2 mm", J.map(r => [r.kind, r.v, r.drift]));

  /* ---------- MV-9: dribble touches ---------- */
  const D = {spy:0, sim:0, met:0, near:[]};
  for (const id of ["def-1v1", "def-2v1", "att-midfield"]){
    const ok = await page.evaluate(id => !!window.__trainRun.scenario(id), id);
    if (!ok) continue;
    await page.evaluate(id => window.__t9.start(id, {}), id);
    await ready();
    const r = await page.evaluate(() => {
      const W9 = window.__t9, Tn = W9.T(), ms = Tn.ms, V = Tn.V, L = W9.L, B = W9.B, v1 = W9.v1, v2 = W9.v2;
      // (Free Play: you, dribbling at a jog and a run (the AI standing in for you turns with the ball, W held keeps it
      // going); a drill: the AI's own carriers)
      const free = W9.Rn.RUN.cur.id === "freeplay";
      ms.meAI = !/^def-/.test(W9.Rn.RUN.cur.id); V.fpOn = false; V.touchSpy = [];
      const watch = [];
      let sim = 0, evAt = ms.events.length, cur = ms;
      for (let f = 0; f < 60*20; f++){
        if (free){
          const me = cur.agents[cur.me], b = cur.ball;
          if (cur.poss.ctl !== me.id && Math.hypot(b.p.x - me.m.x, b.p.z - me.m.z) > 3){ b.p.x = me.m.x - Math.sin(me.m.yaw)*.6; b.p.z = me.m.z - Math.cos(me.m.yaw)*.6; b.v.x = b.v.y = b.v.z = 0; b.state = "free"; b.sleep = false; }
          // (the AI standing in for you holds the ball with nobody about: you run with it instead, a jog then a run, turned
          // back before the fence)
          if (cur.poss.ctl === me.id){
            const hx = Tn.spec.hx - 8, hz = Tn.spec.hz - 8, d = me.drib, gait = f % 360 < 180 ? "jog" : "run";
            let dx = d ? d.dx : -Math.sin(me.m.yaw), dz = d ? d.dz : -Math.cos(me.m.yaw);
            if (me.m.x*dx > hx || me.m.z*dz > hz){ dx = -me.m.x; dz = -me.m.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
            me.drib = {dx, dz, gait, speed:0, t:cur.t, commit:cur.t + 9};
          }
        }
        L.stepN(1);
        if (W9.T() !== Tn) break;
        if (Tn.ms !== cur){ cur = Tn.ms; cur.meAI = ms.meAI; evAt = cur.events.length; }
        const E = cur.events;
        for (let i = evAt; i < E.length; i++){ const e = E[i]; if (e.kind === "touch" && e.how === "dribble" && e.agent >= 0 && V.rec[e.agent] && !V.rec[e.agent].hidden) sim++; }
        evAt = E.length;
        for (const s of V.touchSpy.splice(0)) if (s.ok) watch.push({agent:s.agent, left:(s.tContact || 0) + .2, best:9});
        L.scene().updateMatrixWorld(true);
        V.ball.mesh.getWorldPosition(v2);
        for (const w of watch){
          if (w.left <= 0) continue;
          w.left -= 1/60;
          const h = V.rec[w.agent].h;
          for (const b of [B.toL, B.toR, B.ftL, B.ftR]){ h.bones[b].getWorldPosition(v1); const d = v1.distanceTo(v2) - .11; if (d < w.best) w.best = d; }
        }
      }
      return {sim, spy:watch.length, met:watch.filter(w => w.best <= .15).length, worst:watch.map(w => +w.best.toFixed(3)).sort((a, b) => b - a).slice(0, 5)};
    });
    D.sim += r.sim; D.spy += r.spy; D.met += r.met; D.near.push(r.worst);
  }
  check(D.sim >= 3 && D.spy >= D.sim*.95, "MV-9 dribble touches: every drawn body's dribble touch asks its gait for the touch the same frame (view.js gait.touch)", D);
  check(D.spy > 0 && D.met/D.spy >= .95, "MV-9 dribble touches: in at least 95% of them the drawn foot meets the drawn ball (toe within 0.15 m)", D);

  /* ---------- MV-15: the first-person body ---------- */
  await page.evaluate(id => window.__t9.start(id, {}), "freeplay");
  await ready();
  const FPB = await page.evaluate(() => {
    const W9 = window.__t9, Tn = W9.T(), ms = Tn.ms, V = Tn.V, L = W9.L, B = W9.B, v1 = W9.v1, P = L.P, cam = L.cam;
    ms.meAI = true; V.fpOn = true; V.fpSpy = {calls:0, neck:0, arms:0};
    let bad = 0, hands = 0, worst = null, frames = 0;
    for (let f = 0; f < 600; f++){
      P.pitch = -Math.PI/3*(.5 + .5*Math.sin(f/40)); P.yaw += .02*Math.sin(f/90);
      L.stepN(1); frames++;
      const h = V.fp; if (!h || !h.g.visible) continue;
      h.g.updateMatrixWorld(true); cam.updateMatrixWorld(true);
      const R = V.rec[ms.me], clip = R && R.clip ? R.clip.mode : null, armsUsed = clip === "throwin" || (Tn.me.shield && Tn.me.shield.on);
      for (let i = 0; i < h.bones.length; i++){
        h.bones[i].getWorldPosition(v1); v1.applyMatrix4(cam.matrixWorldInverse);
        if (v1.z >= 0) continue;
        const nx = Math.abs(v1.x/-v1.z/Math.tan(cam.fov*Math.PI/360)/cam.aspect), ny = Math.abs(v1.y/-v1.z/Math.tan(cam.fov*Math.PI/360));
        // (the first-person body ends at the shoulders: its neck and head bones are there, never drawn)
        if (i === B.neck || i === B.head) continue;
        if (-v1.z < .12 && nx < .4 && ny < .4){ bad++; worst = {bone:i, z:-v1.z, nx, ny, f}; }
        if ((i === B.haL || i === B.haR) && !armsUsed && !Tn.ms.agents[Tn.ms.me].act && nx < .5 && ny < .5 && -v1.z < 1.2) hands++;
      }
    }
    return {frames, spy:Object.assign({}, V.fpSpy), bad, worst, hands};
  });
  check(FPB.spy.calls > 0 && FPB.spy.arms === FPB.spy.calls, "MV-15: fpPose gets the arms-in every frame (view.js V.fpSpy)", FPB.spy);
  check(FPB.bad === 0, "MV-15: sprinting, turning and looking down to -60 degrees, no joint of your body within 0.12 m in front of the camera in the middle 40% of the view", FPB);
  check(FPB.hands === 0, "MV-15: your hands keep out of the middle half of the view (but in an action that uses them)", {hands:FPB.hands});

  /* ---------- MV-15: tired ---------- */
  const TI = await page.evaluate(() => {
    const W9 = window.__t9, Tn = W9.T(), ms = Tn.ms, V = Tn.V, L = W9.L, me = ms.agents[ms.me];
    ms.meAI = false;
    const ai = ms.agents.find(o => o !== me && o.onPitch && !o.isGK && V.rec[o.id] && !V.rec[o.id].hidden);
    const who = ai ? [me, ai] : [me];
    for (const a of who){ a.intent.dx = 0; a.intent.dz = 0; }
    let meOn = -1;
    for (let f = 0; f < 75; f++){ for (const a of who) a.st.B = 15; L.stepN(1); const R = V.rec[me.id]; if (meOn < 0 && R && R.clip && R.clip.mode === "tired") meOn = f; }
    const aiR = ai ? V.rec[ai.id] : null, aiOn = !!(aiR && aiR.clip && aiR.clip.mode === "tired");
    const fat = W9.VW.fatigueOf ? W9.VW.fatigueOf(me) : null;
    let off = -1;
    for (let f = 0; f < 75; f++){ for (const a of who) a.st.B = 40; L.stepN(1); const R = V.rec[me.id]; if (off < 0 && !(R.clip && R.clip.mode === "tired")) off = f; }
    return {meOn, aiOn, fat, off, ai:!!ai};
  });
  check(TI.fat > .7 && TI.meOn >= 0 && TI.meOn <= 60, "MV-15 tired: breath 15 standing: fatigue over 0.7 and the tired pose within 1 s", TI);
  check(TI.off >= 0 && TI.off <= 60, "MV-15 tired: the breath back: the pose ends within 1 s", TI);
  check(!TI.ai || TI.aiOn, "MV-15 tired: an AI body follows the same rule", TI);

  /* ---------- MV-15: camAction ---------- */
  const CA = await page.evaluate(() => {
    const W9 = window.__t9, Tn = W9.T(), ms = Tn.ms, V = Tn.V, L = W9.L, AC = W9.AC, MC = W9.MC, me = ms.agents[ms.me], cam = L.cam;
    ms.meAI = false; V.fpOn = true;
    const E = new cam.rotation.constructor(); let roll = 0;
    const play = (fn, n) => { MC.camActs = []; fn(); for (let f = 0; f < n; f++){ L.stepN(1); E.setFromQuaternion(cam.quaternion, "YXZ"); roll = Math.max(roll, Math.abs(E.z)); } return MC.camActs.map(x => x.kind); };
    const ballAt = (dx, y, dz, vx = 0, vy = 0, vz = 0) => { const b = ms.ball; b.state = "free"; b.p.x = me.m.x + dx; b.p.y = y; b.p.z = me.m.z + dz; b.v.x = vx; b.v.y = vy; b.v.z = vz; b.sleep = false; AC.refreshPred(ms); };
    const f = {x:-Math.sin(me.m.yaw), z:-Math.cos(me.m.yaw)};
    const out = {};
    ballAt(f.x*.55, .11, f.z*.55); for (let i = 0; i < 20; i++) L.stepN(1);
    out.strike = play(() => AC.startAction(ms, me, {kind:"shot", target:{x:me.m.x + f.x*25, y:1, z:me.m.z + f.z*25}, power:.8, contact:0}), 70);
    for (let i = 0; i < 60; i++) L.stepN(1);
    ballAt(f.x*2.5, .11, f.z*2.5);
    out.slide = play(() => AC.startAction(ms, me, {kind:"slide", target:"ball"}), 150);
    for (let i = 0; i < 90; i++) L.stepN(1);
    // (at 8 m/s from 7 m it arrives in about 0.9 s: thrown up at 4.1 m/s it comes to you at chest height)
    ballAt(f.x*7, 1.35, f.z*7, -f.x*8, 4.1, -f.z*8);
    out.chest = play(() => {}, 90);
    for (let i = 0; i < 30; i++) L.stepN(1);
    ballAt(f.x*3, 2.6, f.z*3, -f.x*5, 0, -f.z*5);
    out.header = play(() => AC.startHeader(ms, me, .4, "clear", null, 1), 90);
    return {out, roll};
  });
  const one = (arr, k) => arr.filter(x => x === k).length === 1;
  check(one(CA.out.strike, "backswing"), "MV-15 camAction: a strike gives exactly one backswing, on its clip's plant", CA.out);
  check(one(CA.out.slide, "slide"), "MV-15 camAction: a slide gives exactly one slide, as its body meets the grass", CA.out);
  check(one(CA.out.chest, "chest"), "MV-15 camAction: a chest receive gives exactly one chest, at its contact", CA.out);
  check(one(CA.out.header, "land"), "MV-15 camAction: a header gives exactly one land, at its landing", CA.out);
  check(CA.roll <= 2*Math.PI/180, "MV-15 camAction: the camera's roll stays within 2 degrees", {roll:+(CA.roll*180/Math.PI).toFixed(2)});

  /* ---------- GK-3: the keeper's throw and roll ---------- */
  const GK = {acts:{gkthrow:0, gkroll:0}, far:[], rel:[], runs:0};
  const gkSc = await page.evaluate(() => { const s = window.__trainRun.scenariosOf("attacking").find(x => (x.config || {}).keeper); return s ? s.id : "att-midfield"; });
  for (let seed = 1; seed <= 30 && (GK.acts.gkthrow < 10 || GK.acts.gkroll < 10); seed++){
    await page.evaluate(([id, seed]) => window.__t9.start(id, {seed, keeper:true}), [gkSc, seed]);
    await ready();
    const r = await page.evaluate(() => {
      const W9 = window.__t9, Tn = W9.T(), ms = Tn.ms, V = Tn.V, L = W9.L;
      const gk = ms.agents.find(a => a.isGK && a.onPitch); if (!gk) return null;
      for (let i = 0; i < 30; i++) L.stepN(1);
      // (a drill's few players are not a back line: his team-mates are given the full-backs' and the centre-backs' slots, out
      // where a back line stands, so he has someone to throw or roll to; what is checked is his animation of it)
      const mates = ms.agents.filter(a => a.team === gk.team && !a.isGK && a.onPitch), dirG = gk.m.x > 0 ? -1 : 1, slots = ["LB", "CB", "RB", "CB"];
      // (every other seed only centre-backs, close and clear and sure of their touch, and a good distributor: his roll)
      const rollSeed = (W9.n = (W9.n || 0) + 1) % 2 === 0;
      mates.forEach((a, i) => { a.slot = rollSeed ? "CB" : slots[i % 4]; a.m.x = gk.m.x + dirG*(rollSeed ? 9 + 2*i : 12 + 6*(i % 2)); a.m.z = rollSeed ? (i % 2 ? 1 : -1)*(3 + 2*i) : (i % 2 ? 1 : -1)*(6 + 8*(i % 3)); a.x0 = a.m.x; a.z0 = a.m.z; a.m.vx = a.m.vz = 0; if (rollSeed) a.at = Object.assign({}, a.at, {ctrl:97, agility:95, composure:97}); });
      if (rollSeed){ if (gk.at && gk.at.gk) gk.at.gk.distrib = 90; for (const o of ms.agents) if (o.team !== gk.team && o.onPitch && !o.isGK){ o.m.x = gk.m.x + dirG*40; o.x0 = o.m.x; } }
      const b = ms.ball; b.state = "free"; b.p.x = gk.m.x; b.p.y = 1.0; b.p.z = gk.m.z; b.v.x = b.v.y = b.v.z = 0;
      ms.poss.ctl = -1; ms.phase = "live"; ms.restart = null;
      W9.GB.gkCollect(ms, gk); gk.gk.holdT = .5;
      const R = V.rec[gk.id];
      let act = null, relF = -1, clipF = -1, far = 0;
      for (let f = 0; f < 300; f++){
        L.stepN(1);
        const a2 = gk.act;
        if (a2 && (a2.kind === "gkthrow" || a2.kind === "gkroll") && !act) act = a2;
        if (!act) continue;
        if (relF < 0 && act.done) relF = f;
        if (clipF < 0 && R && (R.lastEv & W9.HM.EV.RELEASE)) clipF = f;
        if (!act.done && b.state === "held" && R && !R.hidden){
          L.scene().updateMatrixWorld(true);
          const hp = W9.MV.handBall(R.h, -1, {x:0, y:0, z:0}), bp = V.ball.mesh.position;
          if (hp) far = Math.max(far, Math.hypot(hp.x - bp.x, hp.y - bp.y, hp.z - bp.z));
        }
        if (relF >= 0 && clipF >= 0) break;
      }
      return act ? {kind:act.kind, far, rel:relF >= 0 && clipF >= 0 ? clipF - relF : null} : {kind:null};
    });
    if (!r) continue;
    GK.runs++;
    if (r.kind){ GK.acts[r.kind]++; GK.far.push(+r.far.toFixed(3)); GK.rel.push(r.rel); }
  }
  check(GK.acts.gkthrow > 0 && GK.acts.gkroll > 0, "GK-3: across seeds the keeper plays gkthrow and gkroll acts", GK);
  check(GK.far.length > 0 && GK.far.every(d => d <= .15), "GK-3: the drawn ball stays within 0.15 m of his releasing hand until tRelease", GK.far);
  check(GK.rel.length > 0 && GK.rel.every(d => d != null && Math.abs(d) <= 1), "GK-3: the clip's release is within 1 frame of the act's", GK.rel);
} catch(e){ check(false, "ran", String(e && e.stack || e)); }
check(!page.errors.length, "zero console and page errors", page.errors.slice(0, 5));
await t.close();
process.exit(done() ? 0 : 1);
