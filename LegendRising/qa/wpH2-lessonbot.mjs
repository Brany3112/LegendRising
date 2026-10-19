// qa/wpH2-lessonbot.mjs: an input bot that plays the first day's six lessons through control.js, the input a person
// gives (the same bot as qa/wpI-lessons.mjs, WP-I's acceptance, kept here as a helper the first-day suites share).
// Owner: WP-H2 (Stage 2). Contract: DESIGN 3.6.3, 4.9 ("the lessons run on the match controls").
//
//   import {playLessons} from "./wpH2-lessonbot.mjs";
//   const r = await playLessons(page, {onLesson: async n => snap(...)});   // {lessons: [n...], steps}
// The lessons must already have been started (firstday.js G9 starts them as you reach the coach); it plays until the
// first day's training is over (S.flags.GameplayTutorialCompleted with no run left) or maxSteps evaluations.
export async function playLessons(page, {maxSteps = 40*60*2, onLesson = null} = {}){
  const seen = new Set();
  let steps = 0;
  for (let s = 0; s < maxSteps; s++){
    steps++;
    const st = await page.evaluate(() => {
      const L = window.__life, TR = window.__train;
      if (window.__qaLessons && window.__qaLessons.done != null) return {over:true};
      if (S.flags && S.flags.GameplayTutorialCompleted && !(window.__train && window.__train.RUN.cur)) return {over:true};
      if (!TR || !TR.RUN.cur) return {wait:true};
      const run = TR.RUN.cur, T = TR.T, TS = TR.TS;
      const Ls = run.L || TS.LESSONS[run.i];
      // the walk over: the bot is where it would walk to
      if (!T && run.state === "walk" && Ls){
        const p = Ls.start || (Ls.area ? {x:(Ls.area.x0 + Ls.area.x1)/2, z:(Ls.area.z0 + Ls.area.z1)/2} : {x:-6, z:0});
        const w = {x:p.x + TS.GP.cx, z:p.z + TS.GP.cz};
        if (Math.hypot(L.P.x - w.x, L.P.z - w.z) > 1) L.place({x:w.x, z:w.z, y:0, yaw:-Math.PI/2});
        L.stepN(30);
        return {walk:Ls.n};
      }
      if (!T){ L.stepN(30); return {wait:true}; }
      const ms = T.ms, me = T.me, b = ms.ball.p, inp = TR.input, C = TR.CTRL;
      const yawTo = (x, z) => Math.atan2(-(x - me.m.x), -(z - me.m.z));
      const key = (k, on) => { if (!!C.held[k === " " ? "space" : k] !== on) inp({type:on ? "keydown" : "keyup", key:k}); };
      const tap = btn => { inp({type:"down", button:btn}); inp({type:"up", button:btn}); };
      const B = T.bot = T.bot || {t:0, lmbT:-1, phase:"out", contact:-1};
      B.t += .5;
      const near = Math.hypot(b.x - me.m.x, b.z - me.m.z), mine = ms.poss.ctl === me.id;
      switch (Ls.kind){
        case "move": {
          const c = {x:Ls.cone.x - T.ac.x, z:Ls.cone.z - T.ac.z}, s0 = {x:Ls.start.x - T.ac.x, z:Ls.start.z - T.ac.z};
          if (B.phase === "out" && Math.hypot(me.m.x - c.x, me.m.z - c.z) < 1.2) B.phase = "back";
          if (B.phase === "back" && me.st.B < 68) B.phase = "rest";
          if (B.phase === "out"){ L.P.yaw = yawTo(c.x, c.z); key("w", true); key("shift", false); }
          else if (B.phase === "back"){ L.P.yaw = yawTo(s0.x - 20, s0.z); key("w", true); key("shift", true); }
          else { key("w", false); key("shift", false); }
          break;
        }
        case "receive":
          if (ms.ball.state === "free" && !mine){ L.P.yaw = yawTo(b.x, b.z); key("w", near < 4); }
          else key("w", false);
          break;
        case "call": case "position": case "ssg": {
          if (mine){
            key("w", false);
            const calls = ms.events.slice(T.evFrom).filter(e => e.kind === "call" && e.team === me.team && e.agent !== me.id);
            const to = calls.length ? ms.agents[calls[calls.length - 1].agent] : ms.agents.filter(o => o.team === me.team && o !== me && o.onPitch && !o.isGK).sort((p, q) => (Math.hypot(p.m.x - me.m.x, p.m.z - me.m.z) - Math.hypot(q.m.x - me.m.x, q.m.z - me.m.z)))[0];
            const gx = ms.dirs[me.team]*ms.spec.hx;
            if (Ls.kind === "ssg" && Math.abs(gx - me.m.x) < 16){ L.P.yaw = yawTo(gx, 0); if (!C.lmb) inp({type:"down", button:0}); else inp({type:"up", button:0}); }
            else if (to){ L.P.yaw = yawTo(to.m.x, to.m.z); L.P.pitch = -.2; tap(2); }
          } else if (Ls.kind === "position" && !T.bot.anchor){
            const a = TS.shapeAnchor(TS.SLOT_POS.ST, Ls.dir);
            T.bot.anchor = {x:a.x - T.ac.x, z:a.z - T.ac.z};
          } else if (Ls.kind === "position"){
            const a = T.bot.anchor, d = Math.hypot(a.x - me.m.x, a.z - me.m.z);
            if (d > .8 && ms.t < 12){ L.P.yaw = yawTo(a.x, a.z); key("w", true); key("shift", d > 4); }
            else { key("w", false); key("shift", false); if (ms.ball.state === "free") L.P.yaw = yawTo(b.x, b.z); }
          } else if (ms.ball.state === "free" || ms.poss.ctl >= 0){
            L.P.yaw = yawTo(b.x, b.z); key("w", near > 1);
          } else key("w", false);
          break;
        }
        case "shoot": {
          const gx = ms.dirs[me.team]*ms.spec.hx;
          // low until a low one has gone in on target, then high (1 and 3 set the contact)
          if (B.contact !== (B.lowDone ? 1 : -1)){ B.contact = B.lowDone ? 1 : -1; inp({type:"keydown", key:B.contact < 0 ? "1" : "3"}); inp({type:"keyup", key:B.contact < 0 ? "1" : "3"}); }
          const ks = ms.events.slice(T.evFrom).filter(e => e.kind === "kick" && e.agent === me.id && (e.res === "goal" || e.res === "saved"));
          if (ks.some(e => e.contact < 0)) B.lowDone = true;
          if (mine || near < 1.2 && ms.ball.state === "free"){
            L.P.yaw = yawTo(gx, 1.2); L.P.pitch = B.contact > 0 ? .12 : 0;
            if (B.lmbT < 0){ inp({type:"down", button:0}); B.lmbT = B.t; }
            else if (B.t - B.lmbT >= 1){ inp({type:"up", button:0}); B.lmbT = -1; }
          } else if (ms.ball.state === "free" && near < 10){ L.P.yaw = yawTo(b.x, b.z); key("w", false); }
          break;
        }
      }
      L.stepN(30);
      return {n:Ls.n, kind:Ls.kind, tries:run.tries, live:true};
    });
    if (st.over) break;
    if (st.live && !seen.has(st.n) && st.tries === 0){
      const t = await page.evaluate(() => window.__train.T ? window.__train.T.t : 0);
      if (t > 3){ seen.add(st.n); if (onLesson) await onLesson(st.n); }
    }
  }
  return {lessons: [...seen], steps};
}
