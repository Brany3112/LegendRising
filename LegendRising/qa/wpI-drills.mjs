// qa/wpI-drills.mjs: the drills on the pitch are played on the match simulation (DESIGN 2.4 WP-I acceptance: "shoot,
// pass, head and intercept drills each complete a rep with zero console errors"; one ball integrator).
// An input bot plays each drill through control.js (the same input a person gives): it stands on the drill's marker,
// presses E (the station's spot), and plays every go: aim at the goal and strike when the ball is at its feet
// (shoot), turn to a team-mate and tap the pass button (pass), jump into the cross (head), step into the passing lane
// (intercept). Each drill must decide at least one go (the first rep) with no console or page error; the screenshots
// (qa/out/wpI-drill-<kind>-*.png) are taken in first person during the go.
// Owner: WP-I (Stage P2).
//
//   node qa/wpI-drills.mjs [shoot pass head intercept duel setpiece]
import fs from "node:fs";
import path from "node:path";
import {launch, career, freeze, stepN, snap, report, expect, ROOT} from "./lib.mjs";

const kinds = process.argv.slice(2).filter(a => !a.startsWith("-"));
const KINDS = kinds.length ? kinds : ["shoot", "pass", "head", "intercept"];
const res = {drills:[], errors:[], grep:null};

// one ball integrator (DESIGN D4, 2.4): no stepBall in js/life, ballStep defined only in football/ball.js
function grepOneBall(){
  const out = {stepBall:[], ballStepDefs:[]};
  const walk = d => { for (const f of fs.readdirSync(d)){ const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith(".js")){
    const src = fs.readFileSync(p, "utf8"), rel = path.relative(ROOT, p);
    if (/\bstepBall\b/.test(src)) out.stepBall.push(rel);
    if (/\bfunction\s+ballStep\b|\bballStep\s*[:=]\s*(?:function\b|\()/.test(src)) out.ballStepDefs.push(rel);
  } } };
  walk(path.join(ROOT, "js", "life"));
  return out;
}

const {page, close} = await launch({gfx:"low", seed:5});
try {
  res.grep = grepOneBall();
  await career(page, {zone:"ground", min:11*60, pos:"ST"});
  await freeze(page);
  for (const kind of KINDS){
    const r = await page.evaluate(async kind => {
      const L = window.__life, D = await import("./js/life/football/trainspec.js").then(m => m.DRILLS[kind]);
      const w = {x:D.spot.x + 0, z:D.spot.z - 28};
      L.place({x:w.x, z:w.z, y:0, yaw:D.dir > 0 ? -Math.PI/2 : Math.PI/2});
      L.stepN(20);
      // the station's spot: E on the marker
      const sp = L.spots.find(s => s.label === D.label);
      if (!sp) return {kind, error:"no spot " + D.label};
      L.use(sp);
      // (training.js loads on first use)
      for (let i = 0; i < 400 && !(window.__train && window.__train.RUN.cur); i++) await new Promise(r => setTimeout(r, 25));
      if (!window.__train || !window.__train.RUN.cur) return {kind, error:"the drill did not start"};
      return {kind, started:true, mode:L.modes.mode()};
    }, kind);
    if (r.error){ res.errors.push(r.error); res.drills.push(r); continue; }
    // play it: up to 90 s of game time, the bot driving the controls; shots of the first go
    let shots = 0, done = null;
    for (let s = 0; s < 90*60/30 && !done; s++){
      done = await page.evaluate(kind => {
        const L = window.__life, TR = window.__train, T = TR.T, R = TR.RUN;
        if (!R.cur) return {over:true, last:R.last};
        if (T){
          const ms = T.ms, me = T.me, b = ms.ball.p, inp = TR.input, C = TR.CTRL;
          const yawTo = (x, z) => Math.atan2(-(x - me.m.x), -(z - me.m.z));
          const near = Math.hypot(b.x - me.m.x, b.z - me.m.z);
          const key = (k, on) => { if (!!C.held[k] !== on) inp({type:on ? "keydown" : "keyup", key:k}); };
          T.bot = T.bot || {t:0, lmb:0, rmb:0, jumped:-9};
          const B = T.bot; B.t += 1/60*30;
          if (kind === "shoot" || kind === "setpiece"){
            const gx = ms.dirs[me.team]*ms.spec.hx;
            L.P.yaw = yawTo(gx, 1.5*Math.sin(B.t)); L.P.pitch = .03;
            if (ms.poss.ctl === me.id || (ms.restart && ms.restart.taker === me.id && near < 1.4)){
              if (!B.lmb){ inp({type:"down", button:0}); B.lmb = B.t; }
              else if (B.t - B.lmb > .4){ inp({type:"up", button:0}); B.lmb = 0; }
            } else if (near < 6 && ms.ball.state === "free"){ L.P.yaw = yawTo(b.x, b.z); }
            if (kind === "setpiece" && ms.restart && ms.restart.taker === me.id && near > 1.2){ L.P.yaw = yawTo(b.x, b.z); key("w", true); } else key("w", false);
          } else if (kind === "pass"){
            if (ms.poss.ctl === me.id){
              const mate = ms.agents.find(o => o.team === me.team && o !== me && o.onPitch && o.role === "player");
              if (mate){ L.P.yaw = yawTo(mate.m.x, mate.m.z); L.P.pitch = -.2; }
              if (!B.rmb){ inp({type:"down", button:2}); B.rmb = B.t; } else if (B.t - B.rmb > .1){ inp({type:"up", button:2}); B.rmb = 0; }
            } else if (ms.ball.state === "free") L.P.yaw = yawTo(b.x, b.z);
          } else if (kind === "head"){
            const gx = ms.dirs[me.team]*ms.spec.hx;
            if (ms.ball.state === "free" && b.y > 1 && near < 9 && B.t - B.jumped > 2){ L.P.yaw = yawTo(gx, 0); inp({type:"keydown", key:" "}); inp({type:"keyup", key:" "}); B.jumped = B.t; }
            else if (ms.ball.state === "free" && near < 25) L.P.yaw = yawTo(b.x, b.z);
          } else if (kind === "intercept" || kind === "duel"){
            // into the lane: towards where the ball will be in half a second
            const px = b.x + ms.ball.v.x*.5, pz = b.z + ms.ball.v.z*.5;
            L.P.yaw = yawTo(px, pz);
            key("w", Math.hypot(px - me.m.x, pz - me.m.z) > .8);
            if (kind === "duel" && near < 1.5 && ms.poss.ctl !== me.id && ms.poss.ctl >= 0){ inp({type:"down", button:0}); inp({type:"up", button:0}); }
          }
        }
        L.stepN(30);
        return null;
      }, kind);
      if (!done && shots < 3 && s % 40 === 12){
        const live = await page.evaluate(() => !!(window.__train && window.__train.T && window.__train.T.feed == null));
        if (live){ await snap(page, `wpI-drill-${kind}-${shots}`); shots++; }
      }
    }
    // let a drill still running end (Esc keeps what was done)
    const fin = done || await page.evaluate(() => { const R = window.__train.RUN; if (R.cur && R.cur.quit) R.cur.quit(); window.__life.stepN(10); return {over:true, last:R.last, quit:true}; });
    const last = fin.last || {};
    const row = {kind, results:last.results || [], done:last.done || 0, xp:last.xp || 0, quit:!!fin.quit, errors:page.errors.length};
    res.drills.push(row);
    console.log(`${kind}: ${row.done} go${row.done === 1 ? "" : "es"} decided ${JSON.stringify(row.results.map(v => v.why || (v.ok ? "ok" : "no")))}, ${row.xp} XP${row.quit ? " (stopped)" : ""}, ${page.errors.length} errors so far`);
    if (!row.done) res.errors.push(`${kind}: no go was decided`);
    await page.evaluate(() => window.__life.stepN(120));
  }
} catch(e){ res.errors.push("wpI-drills: " + (e && e.stack || e)); }
finally {
  res.errors.push(...page.errors);
  report("wpI-drills", res);
  await close();
}
if (res.grep.stepBall.length) res.errors.push("stepBall still in " + res.grep.stepBall.join(", "));
if (res.grep.ballStepDefs.join() !== "js/life/football/ball.js") res.errors.push("ballStep is defined in " + res.grep.ballStepDefs.join(", "));
expect(!res.errors.length, res.errors.join("\n"));
console.log("wpI-drills: pass");
