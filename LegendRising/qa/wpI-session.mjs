// qa/wpI-session.mjs: the team session (DESIGN 2.4 WP-I acceptance: "team session joinable once a day; trust +0.2 to
// 0.4 once, chemistry once; session XP 60 to 90; a start at 15:45 refused with the 3.8 line; Esc keeps the blocks and a
// rejoin resumes the next block"), and the squad lent to it (3.6.2: borrowed people never over 6 m/s, given back
// before they go home, none stuck over the session).
// An input bot plays the blocks through control.js: it chases a loose ball, passes to the nearest team-mate when it has
// it, and shoots in the finishing block. Between blocks it is placed where it would have walked to. It plays the first
// block, leaves the second with Esc, joins again (the second block comes next), and plays the session out.
// Owner: WP-I (Stage P2).
//
//   node qa/wpI-session.mjs
import {launch, career, freeze, snap, report, expect} from "./lib.mjs";

const res = {late:null, first:null, second:null, again:null, rewards:null, squad:null, errors:[]};
const check = (ok, what, got) => { if (!ok) res.errors.push(`${what}: ${JSON.stringify(got)}`); };

// the coach's spot, pressed (E) where he stands
const useCoach = page => page.evaluate(async () => {
  const L = window.__life, sp = L.spots.find(s => s.label === "Coach");
  if (!sp) return {error:"no coach spot", note:""};
  L.place({x:sp.x, z:sp.z + 1.5, y:0, yaw:0}); L.stepN(5);
  const nt = document.getElementById("lifeNote"); if (nt) nt.textContent = "";
  L.use(sp);
  for (let i = 0; i < 600 && !(window.__train && window.__train.RUN.cur) && !(document.getElementById("lifeNote") || {}).textContent; i++){ await new Promise(r => setTimeout(r, 25)); L.stepN(1); }
  return {note:(document.getElementById("lifeNote") || {}).textContent || "", on:!!(window.__train && window.__train.RUN.cur)};
});

// one slice of play by the bot (30 steps); returns where the run is
const PLAY = (opts) => {
  const L = window.__life, TR = window.__train, Q = window.__qaSq;
  // the squad's lent bodies: speed and stuck checks (life positions, between and after the blocks)
  const sess = L.GROUND.session;
  // (a body away in a block is drawn by the block's view, and moves on the simulation's own limits)
  if (sess && sess.actors) for (const ac of sess.actors) for (const h of Array.isArray(ac.P) ? ac.P : [ac.P]){
    const g = h.g, id = g.uuid, p = Q.last[id];
    if (ac.away){ Q.lent[id] = true; Q.last[id] = null; continue; }
    if (!Q.lent[id] || !g.visible){ Q.last[id] = null; continue; }
    // (over the world's own frames since the last look: other steps, a rejoin's, may have come between)
    if (p && L.frames > p.f){ const v = Math.hypot(g.position.x - p.x, g.position.z - p.z)/((L.frames - p.f)/60); if (v > Q.vmax){ Q.vmax = v; Q.who = {kind:ac.kind, homing:!!ac.homing, from:p, to:{x:g.position.x, z:g.position.z}, run:TR && TR.RUN.cur ? TR.RUN.cur.state : "none", min:window.__life.LIFE.min}; } }
    Q.last[id] = {x:g.position.x, z:g.position.z, f:L.frames};
  }
  if (!TR || !TR.RUN.cur){ L.stepN(30); return {over:true}; }
  const run = TR.RUN.cur, T = TR.T;
  if (!T){
    if (run.state === "walk" && run.item){
      const it = run.item, TS = TR.TS;
      const c = it.area ? {x:(it.area.x0 + it.area.x1)/2, z:(it.area.z0 + it.area.z1)/2} : {x:-6, z:0};
      const w = {x:c.x + TS.GP.cx, z:c.z + TS.GP.cz};
      if (Math.hypot(L.P.x - w.x, L.P.z - w.z) > 1) L.place({x:w.x, z:w.z, y:0, yaw:-Math.PI/2});
    }
    L.stepN(30);
    return {walk:true, i:run.i};
  }
  const ms = T.ms, me = T.me, b = ms.ball.p, inp = TR.input, C = TR.CTRL;
  const yawTo = (x, z) => Math.atan2(-(x - me.m.x), -(z - me.m.z));
  const key = (k, on) => { if (!!C.held[k] !== on) inp({type:on ? "keydown" : "keyup", key:k}); };
  const B = T.bot = T.bot || {t:0, l:-1};
  B.t += .5;
  const mine = ms.poss.ctl === me.id, near = Math.hypot(b.x - me.m.x, b.z - me.m.z);
  if (mine){
    key("w", false);
    const gx = ms.dirs[me.team]*ms.spec.hx;
    if (run.B && run.B.kind === "finishing" || Math.abs(gx - me.m.x) < 14 && T.spec.goals.length){
      L.P.yaw = yawTo(gx, 0);
      if (B.l < 0){ inp({type:"down", button:0}); B.l = B.t; } else if (B.t - B.l >= 1){ inp({type:"up", button:0}); B.l = -1; }
    } else {
      const mates = ms.agents.filter(o => o.team === me.team && o !== me && o.onPitch && !o.isGK);
      mates.sort((p, q) => Math.hypot(p.m.x - me.m.x, p.m.z - me.m.z) - Math.hypot(q.m.x - me.m.x, q.m.z - me.m.z));
      if (mates[0]){ L.P.yaw = yawTo(mates[0].m.x, mates[0].m.z); L.P.pitch = -.2; inp({type:"down", button:2}); inp({type:"up", button:2}); }
    }
  } else if (near < 25){ L.P.yaw = yawTo(b.x, b.z); key("w", near > 1.2); key("shift", near > 8); }
  else { key("w", false); key("shift", false); }
  L.stepN(30);
  // (the block may have ended in those steps: then it is the walk to the next one)
  return TR.T === T ? {play:true, i:run.i, block:run.B && run.B.kind, t:T.t} : {walk:true, i:run.i};
};

{
  // a start at 15:45: refused with the line
  const {page, close} = await launch({gfx:"low", seed:11});
  try {
    await career(page, {zone:"ground", min:15*60 + 45, pos:"CM"});
    await freeze(page);
    const r = await useCoach(page);
    res.late = r;
    check(!r.on && r.note === "The session's nearly over. Join them tomorrow at 10:00 AM.", "a start at 15:45", r);
  } catch(e){ res.errors.push("late: " + (e && e.stack || e)); }
  finally { res.errors.push(...page.errors); await close(); }
}

const {page, close} = await launch({gfx:"low", seed:12});
try {
  await career(page, {zone:"ground", min:10*60 + 20, pos:"CM"});
  await freeze(page);
  const before = await page.evaluate(() => { window.__qaSq = {last:{}, lent:{}, vmax:0}; return {trust:S.trust, chem:S.chem, attChem:S.life.att.chem || 0, sess:JSON.parse(JSON.stringify(S.life.att.sess || null))}; });
  // join, play the first block out, leave the second with Esc a little way in
  let r = await useCoach(page);
  check(r.on, "the session starts at 10:20", r);
  let shotTaken = false;
  for (let s = 0; s < 4000; s++){
    const st = await page.evaluate(PLAY);
    if (st.over) break;
    if (st.play && !shotTaken && st.t > 20){ shotTaken = true; await snap(page, `wpI-session-${st.block}`); }
    if (st.play && st.i === 1 && st.t > 15){
      // Esc (the train mode's own key: quit)
      await page.evaluate(() => window.__life.keysDown(["Escape"]));
      await page.evaluate(() => { window.__life.stepN(10); window.__life.keysUp(["Escape"]); });
      const still = await page.evaluate(() => !!(window.__train.RUN.cur));
      if (still) await page.evaluate(() => { const r = window.__train.RUN.cur; if (r && r.quit) r.quit(); window.__life.stepN(10); });
      break;
    }
  }
  res.first = await page.evaluate(() => ({last:window.__train.RUN.last, sess:JSON.parse(JSON.stringify(S.life.att.sess)), mode:window.__life.modes.mode(), note:(document.getElementById("lifeNote") || {}).textContent || ""}));
  check(res.first.sess.blocks === 1 && !res.first.sess.done, "Esc in the second block keeps the first", res.first.sess);
  // join again: the second block is next
  await page.evaluate(() => window.__life.stepN(120));
  r = await useCoach(page);
  const nextIs = await page.evaluate(() => { const c = window.__train.RUN.cur; return c ? {blocks:c.blocks, B:c.B && c.B.kind} : null; });
  check(r.on && nextIs && nextIs.blocks[0] === 1, "the rejoin resumes the next block", nextIs);
  const shots = new Set();
  for (let s = 0; s < 20000; s++){
    const st = await page.evaluate(PLAY);
    if (st.over) break;
    if (st.play && st.t > 20 && !shots.has(st.block)){ shots.add(st.block); await snap(page, `wpI-session-${st.block}`); }
  }
  res.second = await page.evaluate(() => ({last:window.__train.RUN.last, sess:JSON.parse(JSON.stringify(S.life.att.sess)), trust:S.trust, chem:S.chem, attChem:S.life.att.chem || 0, sessions:S.today.sessions}));
  const xpRaw = (res.first.last ? res.first.last.xpRaw : 0) + (res.second.last ? res.second.last.xpRaw : 0);
  res.rewards = {trust:res.second.trust - before.trust, chem:res.second.chem - before.chem, attChem:res.second.attChem - before.attChem, xpRaw,
    xpGiven:(res.first.last ? res.first.last.xp : 0) + (res.second.last ? res.second.last.xp : 0)};
  console.log("session:", JSON.stringify(res.rewards), JSON.stringify(res.second.sess));
  check(res.second.sess.done && res.second.sess.blocks === 4, "the session done", res.second.sess);
  check(res.rewards.trust >= .2 - 1e-9 && res.rewards.trust <= .4 + 1e-9, "trust +0.2 to 0.4", res.rewards.trust);
  check(res.rewards.attChem > 0, "chemistry once", res.rewards);
  check(xpRaw >= 60 - 1e-6 && xpRaw <= 90 + 1e-6, "session XP 60 to 90", xpRaw);
  // once a day: the coach says so, and nothing more is given
  r = await useCoach(page);
  const after = await page.evaluate(() => ({trust:S.trust, chem:S.life.att.chem || 0}));
  res.again = {r, after};
  check(!r.on && r.note === "You've done today's session. The coach wants you fresh tomorrow.", "a second session the same day", r);
  check(after.trust === res.second.trust && after.chem === res.second.attChem, "rewards once", after);
  // the squad: never over 6 m/s; given back, and home with the rest at the session's end
  await page.evaluate(() => { const L = window.__life; L.place({x:-14, z:20, y:0, yaw:0}); L.stepN(30); });
  for (let k = 0; k < 40; k++) await page.evaluate(PLAY);
  res.squad = await page.evaluate(() => {
    const sess = window.__life.GROUND.session, acts = sess && sess.actors ? sess.actors : [];
    return {vmax:window.__qaSq.vmax, who:window.__qaSq.who || "", away:acts.filter(a => a.away).length, homing:acts.filter(a => a.homing).length, n:acts.length};
  });
  check(res.squad.vmax <= 6.05, "the squad never over 6 m/s", res.squad);
  check(res.squad.away === 0 && res.squad.homing === 0, "every lent body given back and home", res.squad);
} catch(e){ res.errors.push("wpI-session: " + (e && e.stack || e)); }
finally {
  res.errors.push(...page.errors);
  report("wpI-session", res);
  await close();
}
expect(!res.errors.length, res.errors.join("\n"));
console.log("wpI-session: pass");
