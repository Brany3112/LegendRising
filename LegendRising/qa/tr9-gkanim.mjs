// qa/tr9-gkanim.mjs: the keeper's animation in Training Mode (P9-A, TRAINING-SPEC 6 goalkeeper animations; BUILD-PLAN P9-A
// acceptance), in the real page, stepped frozen. Shot sets against an AI keeper (your strikes from the edge of the box
// to every part of the goal, crosses for him to claim or punch, balls rolled at him to gather):
//   - walking, repositioning and shuffling: his feet planted (the gait, with the ready stance over it) in at least 40% of
//     the frames he moves;
//   - catch, collect, punch and tip are all used across the sets, and each claim, collect, spread and punch state shows
//     its pose (gkcatch, gkcollect, gkpunch, gktip) within 2 frames of it beginning;
//   - his throw and his roll (gkthrow, gkroll) played at least 10 times each across seeds, the drawn ball in his hand to
//     the release and the clip's release within 1 frame of the act's;
//   - a dive lands, he gets up and is back in his ready stance within bounds (4 s);
//   - no teleport: his drawn body never moves more than 0.5 m in a frame.
//
//   node qa/tr9-gkanim.mjs          exits 1 on any failed check
import {freeze, unfreeze} from "./lib.mjs";
import {trainLaunch, enterByButton} from "./tr4b-lib.mjs";
import {checker} from "./wpF-lib.mjs";

const {check, done} = checker("tr9-gkanim");
const t = await trainLaunch({seed: 12});
const page = t.page;
const ready = async () => { await unfreeze(page); await page.waitForFunction(() => { const R = window.__trainRun.RUN; return !!R.cur && !R.switching && !!R.T && !!R.T.V; }, null, {timeout: 120000}); await freeze(page); };
try {
  await enterByButton(page);
  await page.evaluate(() => window.__trainHub.closeHub());
  await page.evaluate(async () => {
    const L = window.__life, HM = await import("/js/life/human.js"), AC = await import("/js/life/football/actions.js"), GB = await import("/js/life/football/gkbrain.js"), MV = await import("/js/life/moves.js");
    window.__g9 = {L, HM, AC, GB, MV};
  });
  const sc = await page.evaluate(() => { const s = window.__trainRun.scenariosOf("attacking").find(x => (x.config || {}).keeper); return s ? s.id : "att-midfield"; });
  const S = {moveFrames:0, planted:0, used:{gkcatch:0, gkcollect:0, gkpunch:0, gktip:0, gkdive:0}, states:[], late:[], dives:0, back:[], tele:0, teleMax:0, acts:{gkthrow:0, gkroll:0}, far:[], rel:[]};
  for (let seed = 1; seed <= 26; seed++){
    // (the crosses' seeds (k 3 and 4, below) with four defenders: the drill's own two and the crowd a punch needs)
    const crowd = seed % 6 === 3 || seed % 6 === 4 ? {defenders:4} : {};
    await page.evaluate(([id, seed, crowd]) => { const R = window.__trainRun; if (R.RUN.cur) R.stopScenario("restart"); R.startScenario(id, Object.assign({}, R.scenario(id).config, {seed, keeper:true}, crowd)); }, [sc, seed, crowd]);
    await ready();
    const r = await page.evaluate(seed => {
      const G9 = window.__g9, L = G9.L, R0 = window.__trainRun.RUN.cur, Tn = R0.T, ms = Tn.ms, V = Tn.V, AC = G9.AC, me = ms.agents[ms.me];
      const gk = ms.agents.find(a => a.isGK && a.onPitch); if (!gk) return null;
      ms.meAI = false; V.fpOn = false;
      const Rg = V.rec[gk.id], out = {moveFrames:0, planted:0, used:{}, states:[], late:[], dives:0, back:[], tele:0, teleMax:0, dist:null};
      const gx = ms.dirs[ms.agents[ms.me].team]*ms.spec.hx;
      let prev = null, prevPos = null, diveAt = -1, msRef = ms;
      const pending = [];
      const frame = () => {
        L.stepN(1);
        // (a go's restart puts everyone back where they start: a cut, not a teleport)
        if (Tn.ms !== msRef){ msRef = Tn.ms; prevPos = null; if (diveAt >= 0) out.cut = (out.cut || 0) + 1; diveAt = -1; }
        const h = Rg.h, g = gk.gk || {};
        if (!h || !h.posed || Rg.hidden) return;
        // planted while he moves
        if (gk.m.speed > .3 && !gk.act && (g.state === "reposition" || g.state === "shuffle" || g.state === "ready")){ out.moveFrames++; if (h.mode === "loco" && h.gait && (h.gait.feet[0].down || h.gait.feet[1].down)) out.planted++; }
        if (h.mode) out.used[h.mode] = (out.used[h.mode] || 0) + 1;
        for (let i = (out.evAt || 0); i < Tn.ms.events.length; i++){ const e = Tn.ms.events[i]; if (e.kind === "save" && e.agent === gk.id) out.used["save:" + e.outcome] = (out.used["save:" + e.outcome] || 0) + 1; }
        out.evAt = Tn.ms.events.length;
        // a state beginning: its pose within 2 frames
        const want = {claim:["gkcatch", "gkpunch"], spread:["gkcollect"]};
        if (g.state !== prev && want[g.state]) pending.push({st:g.state, ok:want[g.state], left:3});
        if (g.state === "hold" && prev && prev !== "hold" && prev !== "dive" && prev !== "catch" && prev !== "ground" && prev !== "getUp" && prev !== "claim" && !g.plan) pending.push({st:"collect", ok:["gkcollect", "gkcatch"], left:3});
        for (const p of pending){ if (p.left <= 0) continue; if (p.ok.includes(h.mode)){ out.states.push(p.st); p.left = -1; } else if (--p.left === 0) out.late.push({st:p.st, mode:h.mode}); }
        // a dive: back to his ready stance within 4 s
        if (g.state === "dive" && prev !== "dive"){ out.dives++; diveAt = ms.t; }
        if (diveAt >= 0 && (h.mode === "gkready" || h.mode === "gkset" || h.mode === "loco") && g.state !== "dive" && g.state !== "ground" && g.state !== "getUp"){ out.back.push(+(ms.t - diveAt).toFixed(2)); diveAt = -1; }
        prev = g.state;
        const p = h.g.position;
        // (a far body is drawn less often than every frame, its level of detail: a move is spread over the frames since it
        // was last drawn; the go's first frames, its bodies put where they start, are a cut)
        const moved = prevPos && (p.x !== prevPos.x || p.z !== prevPos.z);
        if (prevPos && !moved){ prevPos.idle = (prevPos.idle || 0) + 1; return; }
        if (prevPos && Tn.ms.t > .25){ const d = Math.hypot(p.x - prevPos.x, p.z - prevPos.z)/((prevPos.idle || 0) + 1); if (d > out.teleMax) out.teleMax = d; if (d > .5){ out.tele++; (out.teleAt || (out.teleAt = [])).push({d:+d.toFixed(2), state:g.state, mode:h.mode, prev:prevPos.mode, t:+Tn.ms.t.toFixed(2)}); } }
        prevPos = {x:p.x, z:p.z, mode:h.mode};
      };
      const ballAt = (x, y, z, vx = 0, vy = 0, vz = 0) => { const b = ms.ball; b.state = "free"; b.p.x = x; b.p.y = y; b.p.z = z; b.v.x = vx; b.v.y = vy; b.v.z = vz; b.w.x = b.w.y = b.w.z = 0; b.sleep = false; ms.poss.ctl = -1; ms.restart = null; ms.phase = "live"; AC.refreshPred(ms); };
      const dir = Math.sign(gx) || 1;
      // the sets: strikes from about 16 m at every part of the goal, crosses into the six-yard box, balls rolled at him
      const k = seed % 6;
      for (let rep = 0; rep < 3; rep++){
        const z0 = ((seed + rep) % 5 - 2)*4;
        if (k < 3){
          // a strike of yours: the ball at your feet 16 m out, struck at a corner, high or low, or at him
          me.m.x = gx - dir*16; me.m.z = z0; me.x0 = me.m.x; me.z0 = me.m.z;
          ballAt(me.m.x + dir*.55, .11, me.m.z);
          for (let i = 0; i < 6; i++) frame();
          const tz = [-3.2, 3.2, 0, -2, 2][(seed + rep) % 5], ty = [.4, 2.1, 1.2, 1.9, .3][(seed*3 + rep) % 5];
          AC.startAction(ms, me, {kind:"shot", target:{x:gx, y:ty, z:tz}, power:.75 + .05*(rep % 3), contact:0});
        } else if (k < 5){
          // a cross of yours from wide into the six-yard box: his to claim or punch
          const sd = rep % 2 ? 1 : -1;
          me.m.x = gx - dir*12; me.m.z = sd*22; me.x0 = me.m.x; me.z0 = me.m.z;
          ballAt(me.m.x + dir*.3, .11, me.m.z - sd*.5);
          for (let i = 0; i < 6; i++) frame();
          // (a crowd under it, four men in the six-yard box: his to punch as often as to claim)
          // (gkbrain.js punches a claim with GK.PUNCH_N men within GK.PUNCH_R m of where he meets it. The drill has two
          // defenders of its own, so these seeds start with four (crowd, above); each is held on his spot (brain.js
          // drillMove 'stand'), else they ran off before the ball came down and no cross was ever punched)
          const tx = gx - dir*(3 + rep), tz = -sd*(rep - 1);
          ms.agents.filter(o => o !== me && o.onPitch && !o.isGK).slice(0, 4).forEach((o, i) => { o.m.x = tx + (i % 2 ? .9 : -.9); o.m.z = tz + (i < 2 ? .9 : -.9); o.x0 = o.m.x; o.z0 = o.m.z; o.m.vx = o.m.vz = 0; if (!("dr0" in o)) o.dr0 = o.drill; o.drill = {behave:"stand", x:o.m.x, z:o.m.z}; });
          AC.startAction(ms, me, {kind:"cross", target:{x:tx, y:2.4, z:tz}, contact:1});
        } else {
          // a ball rolled at him from 14 m: his to gather
          ballAt(gx - dir*14, .11, z0*.3, dir*9, 0, 0);
        }
        for (let i = 0; i < 60*5.5; i++) frame();
      }
      // (the crowd let go again: his distribution below has them as his back line)
      for (const o of ms.agents) if ("dr0" in o){ o.drill = o.dr0; delete o.dr0; }
      return out;
    }, seed);
    if (!r) continue;
    S.moveFrames += r.moveFrames; S.planted += r.planted;
    for (const [m, n] of Object.entries(r.used)) S.used[m] = (S.used[m] || 0) + n;
    S.states.push(...r.states); S.late.push(...r.late); S.dives += r.dives; S.back.push(...r.back); S.tele += r.tele; S.teleMax = Math.max(S.teleMax, r.teleMax); S.cut = (S.cut || 0) + (r.cut || 0); if (r.teleAt) (S.teleAt || (S.teleAt = [])).push(...r.teleAt);
    // the distribution: the ball put in his hands, his throw or roll
    const d = await page.evaluate(() => {
      const G9 = window.__g9, L = G9.L, Tn = window.__trainRun.RUN.cur.T, ms = Tn.ms, V = Tn.V;
      const gk = ms.agents.find(a => a.isGK && a.onPitch); if (!gk) return null;
      // (his team-mates in a back line's slots and places, so he has someone to throw or roll to: tr9-anim's way)
      // (every other seed only centre-backs, close and clear, for his roll)
      const rollSeed = (window.__g9.n = (window.__g9.n || 0) + 1) % 2 === 0;
      const mates = ms.agents.filter(a => a.team === gk.team && !a.isGK && a.onPitch), dirG = gk.m.x > 0 ? -1 : 1, slots = rollSeed ? ["CB"] : ["LB", "CB", "RB", "CB"];
      mates.forEach((a, i) => { a.slot = slots[i % slots.length]; a.m.x = gk.m.x + dirG*(rollSeed ? 9 + 2*i : 12 + 6*(i % 2)); a.m.z = rollSeed ? (i % 2 ? 1 : -1)*(3 + 2*i) : (i % 2 ? 1 : -1)*(6 + 8*(i % 3)); a.x0 = a.m.x; a.z0 = a.m.z; a.m.vx = a.m.vz = 0; });
      for (const o of ms.agents) if (o.team !== gk.team && o.onPitch && !o.isGK){ o.m.x = gk.m.x + dirG*40; o.x0 = o.m.x; }
      // (and on those seeds a good distributor: a roll is only for a pass he is sure of, gkbrain.js DIST)
      if (rollSeed && gk.at && gk.at.gk) gk.at.gk.distrib = 90;
      // (a drill's players have a drill's first touch: brain.js passModel rates a pass to one no higher than about 0.8, under
      // the roll's need, gkbrain.js DIST.ROLL_NEED; on these seeds his centre-backs are sure of their touch, HOOKS.md)
      if (rollSeed) for (const a of mates) a.at = Object.assign({}, a.at, {ctrl:97, agility:95, composure:97});
      const b = ms.ball; b.state = "free"; b.p.x = gk.m.x; b.p.y = 1.0; b.p.z = gk.m.z; b.v.x = b.v.y = b.v.z = 0; ms.poss.ctl = -1; ms.phase = "live"; ms.restart = null;
      G9.GB.gkCollect(ms, gk); gk.gk.holdT = .5;
      const R = V.rec[gk.id];
      let act = null, relF = -1, clipF = -1, far = 0;
      for (let f = 0; f < 300; f++){
        L.stepN(1);
        if (gk.act && (gk.act.kind === "gkthrow" || gk.act.kind === "gkroll") && !act) act = gk.act;
        if (!act) continue;
        if (relF < 0 && act.done) relF = f;
        if (clipF < 0 && R && (R.lastEv & G9.HM.EV.RELEASE)) clipF = f;
        if (!act.done && b.state === "held" && R && !R.hidden){ L.scene().updateMatrixWorld(true); const hp = G9.MV.handBall(R.h, -1, {x:0, y:0, z:0}), bp = V.ball.mesh.position; if (hp) far = Math.max(far, Math.hypot(hp.x - bp.x, hp.y - bp.y, hp.z - bp.z)); }
        if (relF >= 0 && clipF >= 0) break;
      }
      return act ? {kind:act.kind, far, rel:relF >= 0 && clipF >= 0 ? clipF - relF : null} : null;
    });
    if (d){ S.acts[d.kind]++; S.far.push(+d.far.toFixed(3)); S.rel.push(d.rel); }
  }
  const share = S.moveFrames ? S.planted/S.moveFrames : 0;
  check(S.moveFrames > 50 && share >= .4, "walking, repositioning and shuffling: his feet planted in at least 40% of the frames he moves", {share:+share.toFixed(3), frames:S.moveFrames});
  // (a tip over is a dive's outcome as often as its own pose: either counts; the punch is his clip, gkpunch)
  check(S.used.gkcatch > 0 && S.used.gkcollect > 0 && S.used.gkpunch > 0 && (S.used.gktip > 0 || S.used["save:tip"] > 0), "catch, collect, punch and tip all used across the sets", S.used);
  check(S.states.length > 0 && S.late.length === 0, "each claim, collect, spread and punch state shows its pose within 2 frames", {shown:S.states.length, late:S.late.slice(0, 5)});
  check(S.acts.gkthrow >= 10 && S.acts.gkroll >= 10, "his throw and his roll each played at least 10 times across seeds", S.acts);
  check(S.far.length > 0 && S.far.every(d => d <= .15) && S.rel.every(d => d != null && Math.abs(d) <= 1), "the drawn ball in his hand to the release (0.15 m), the clip's release within 1 frame of the act's", {far:Math.max(...S.far), rel:S.rel.filter(d => d == null || Math.abs(d) > 1).slice(0, 5)});
  // (a dive the go's own restart cut short is not counted)
  check(S.dives > 0 && S.back.length >= S.dives - (S.cut || 0) - 1 && S.back.every(s => s <= 4), "a dive lands, he gets up and is back in his ready stance within 4 s", {dives:S.dives, cut:S.cut || 0, back:S.back.slice(0, 10)});
  check(S.tele === 0, "no teleport: his drawn body never moves more than 0.5 m in a frame", {count:S.tele, max:+S.teleMax.toFixed(3), at:(S.teleAt || []).slice(0, 6)});
} catch(e){ check(false, "ran", String(e && e.stack || e)); }
check(!page.errors.length, "zero console and page errors", page.errors.slice(0, 5));
await t.close();
process.exit(done() ? 0 : 1);
