// qa/wpI-squad.mjs: the squad lent to a drill when the session ends (DESIGN 2.4 WP-I acceptance, 3.6.2: "borrowed
// people are released before the departure hand-off"). A drill that needs team-mates is started just before the
// session's end; the clock is then moved past it. The drill must stop, every lent body be given back (visible, not
// away) before leave.js takes the squad home, and the game go on in ordinary life with no console or page error.
// Owner: WP-I (Stage P2).
//
//   node qa/wpI-squad.mjs
import {launch, career, freeze, report, expect} from "./lib.mjs";

const res = {start:null, end:null, errors:[]};
const check = (ok, what, got) => { if (!ok) res.errors.push(`${what}: ${JSON.stringify(got)}`); };
const {page, close} = await launch({gfx:"low", seed:31});
try {
  await career(page, {zone:"ground", min:15*60 + 50, pos:"CM"});
  await freeze(page);
  res.start = await page.evaluate(async () => {
    const L = window.__life, M = await import("./js/life/football/trainspec.js"), D = M.DRILLS.pass;
    L.place({x:D.spot.x + M.GP.cx, z:D.spot.z + M.GP.cz, y:0, yaw:0}); L.stepN(20);
    const sp = L.spots.find(s => s.label === D.label); L.use(sp);
    for (let i = 0; i < 600 && !(window.__train && window.__train.RUN.cur); i++){ await new Promise(r => setTimeout(r, 25)); L.stepN(1); }
    // into the drill (the squad comes over), a few seconds of it
    for (let i = 0; i < 60 && !(window.__train.T); i++) L.stepN(30);
    L.stepN(120);
    const sess = L.GROUND.session;
    return {on:!!window.__train.RUN.cur, train:L.modes.mode(), away:sess.actors.filter(a => a.away).length};
  });
  check(res.start.on && res.start.away > 0, "the drill runs with the squad lent", res.start);
  // the session's end: the clock past 16:00
  res.end = await page.evaluate(() => {
    const L = window.__life, sess = L.GROUND.session;
    let leftAway = -1;
    // (the moment leave.js is handed the squad, how many were still lent)
    const leave = sess.leave;
    sess.leave = list => { leftAway = sess.actors.filter(a => a.away).length; return leave(list); };
    S.life.min = 16*60 + 1; L.LIFE.min = 16*60 + 1;
    for (let i = 0; i < 20; i++) L.stepN(30);
    return {run:!!window.__train.RUN.cur, mode:L.modes.mode(), leftAway, left:!!sess.left, away:sess.actors.filter(a => a.away).length,
      hidden:sess.actors.reduce((n, a) => n + (Array.isArray(a.P) ? a.P : [a.P]).filter(h => !h.g.visible).length, 0)};
  });
  check(!res.end.run && res.end.mode === "life", "the drill stops at the session's end", res.end);
  check(res.end.left && res.end.leftAway === 0 && res.end.away === 0, "every lent body given back before they go home", res.end);
  console.log(JSON.stringify(res));
} catch(e){ res.errors.push("wpI-squad: " + (e && e.stack || e)); }
finally {
  res.errors.push(...page.errors);
  report("wpI-squad", res);
  await close();
}
expect(!res.errors.length, res.errors.join("\n"));
console.log("wpI-squad: pass");
