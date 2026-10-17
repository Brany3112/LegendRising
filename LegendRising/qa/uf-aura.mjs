// qa/uf-aura.mjs: the team-mate you look at gets a slight red aura (USER-ISSUES U8: "make something that it will be
// easier to notice your teammates, as you look at them they will have a red slight aura around them"). In a live
// test:11v11 match, first person, the pointer locked by a real click: the look on a team-mate near, then on one far
// off, lights him and only him (one halo in the scene, on his body, red pixels round him in the picture, readable at
// range); the look on an opponent, or at nothing, lights nobody. Also two kits that clash are resolved (U11): the
// fixture is entered with a purple home kit and a blue away kit, and the bodies wear the resolved, distinct kits.
// Owner: UF-B (stage TR-3+U). Contract: USER-ISSUES.md U8, U11.
//
//   QA_PORT=8863 node qa/uf-aura.mjs      exits 1 on any failed check; shots in qa/out/uf/
import {openFixture, checker, regionStats} from "./uf-lib.mjs";

const {check, done} = checker("uf-aura");
// (purple against royal blue: the clash the user named)
const KITS = {home: ["#6b1f7a", "#ffffff"], away: ["#1b3fa0", "#ffffff"]};
const T = await openFixture("test:11v11", {seed: 3, kits: KITS});
const {page} = T;
// (U21: football is third person by default; this suite checks what you see through your own eyes, so it plays with
// the Football camera setting on First person, control.js SET.footCam)
await page.evaluate(async () => { const C = await import("./js/life/football/control.js"), M = await import("./js/life/football/matchcam.js"); C.saveSet({footCam: "first"}); M.MC.tpK = 0; });
let ok = false;
// aim the view at an agent's chest (what a mouse move does), after the frames have moved him; returns where he is on screen
const aimAt = id => page.evaluate(id => {
  const F = window.__fp, L = window.__life, P = L.P, a = F.ms.agents[id], R = F.FS.V.rec[id], g = R ? R.h.g.position : {x: a.m.x, y: 0, z: a.m.z};
  const ex = L.cam.position.x, ey = L.cam.position.y, ez = L.cam.position.z;
  P.yaw = Math.atan2(-(g.x - ex), -(g.z - ez)); P.pitch = Math.atan2(g.y + 1.15 - ey, Math.hypot(g.x - ex, g.z - ez));
}, id);
const where = id => page.evaluate(id => {
  const F = window.__fp, L = window.__life, R = F.FS.V.rec[id], g = R.h.g.position.clone(); g.y += 1;
  const v = g.clone().project(L.cam), top = R.h.g.position.clone(); top.y += 2; const t = top.project(L.cam);
  return {x: (v.x + 1)/2*innerWidth, y: (1 - v.y)/2*innerHeight, h: Math.abs((t.y - v.y)/2*innerHeight)*2, d: Math.hypot(g.x - L.cam.position.x, g.z - L.cam.position.z)};
}, id);
const aura = () => page.evaluate(() => { const A = window.__fp.AURA, m = A.mesh; let n = 0; window.__life.scene().traverse(o => { if (o.name === "fp-aura") n++; });
  return {target: A.target, alpha: +A.alpha.toFixed(2), vis: !!(m && m.visible), op: m ? +m.material.opacity.toFixed(2) : 0, n, pos: m ? [+m.position.x.toFixed(1), +m.position.z.toFixed(1)] : null}; });
// a few frames with the look held on him
const hold = async (id, n = 8) => { for (let i = 0; i < n; i++){ await aimAt(id); await T.frames(3); } await aimAt(id); await T.frames(1); };
try {
  check(!!T.lock, "the pointer locked by a real click", T.lock);
  const live = await T.until(() => window.__fp.state === "live" && window.__fp.FS.onPitch, 600);
  check(live >= 0, "a live match, you on the pitch", live);
  // U11: the purple and blue kits were resolved apart, and the bodies wear them
  const k = await page.evaluate(() => {
    const F = window.__fp, K = F.kits, ms = F.ms, V = F.FS.V;
    const shirt = t => { const a = ms.agents.find(x => x.team === t && x.role === "player" && !x.isGK && !x.isMe && x.onPitch); const R = a && V.rec[a.id]; return R ? R.h.look.outfit.shirt : null; };
    return {home: K.home, away: K.away, change: K.change, gk: K.gk, ref: K.ref, homeShirt: shirt(0), awayShirt: shirt(1)};
  });
  check(k.change !== "own" && k.away[0] !== "#1b3fa0", "purple against blue: the away side changed kit (U11)", k);
  check(String(k.homeShirt).toLowerCase() === k.home[0] && String(k.awayShirt).toLowerCase() === k.away[0], "the players wear the resolved kits", {home: k.homeShirt, away: k.awayShirt});
  // the team-mates and the opponents by distance from you
  const ids = await page.evaluate(() => {
    const F = window.__fp, ms = F.ms, me = F.me(), list = [];
    for (const a of ms.agents){ if (a === me || !a.onPitch || a.role !== "player" || a.isGK) continue; list.push({id: a.id, team: a.team, d: Math.hypot(a.m.x - me.m.x, a.m.z - me.m.z)}); }
    return {me: me.team, list: list.sort((a, b) => a.d - b.d)};
  });
  const mates = ids.list.filter(x => x.team === ids.me), opps = ids.list.filter(x => x.team !== ids.me);
  const near = mates.find(x => x.d > 6) || mates[0], far = mates.slice().reverse().find(x => x.d > 30) || mates[mates.length - 1];
  // a team-mate near: lit, and only him
  await hold(near.id);
  let A = await aura();
  check(A.target === near.id && A.vis && A.alpha > .9 && A.n === 1, `looking at a team-mate ${near.d.toFixed(0)} m off: he is lit, one halo in the scene`, A);
  let w = await where(near.id);
  let file = await T.snap("uf-aura-1-near", 150);
  await aimAt(near.id); w = await where(near.id);
  const pad = Math.max(30, w.h*.5);
  let rs = await regionStats(page, file, {x0: w.x - pad, y0: w.y - w.h, x1: w.x + pad, y1: w.y + w.h*.6});
  check(rs.red > .015, "the picture shows red round him", {red: +rs.red.toFixed(3), box: w});
  // a team-mate far off: still lit, and the halo keeps a readable size
  await hold(far.id);
  A = await aura();
  const hpx = await page.evaluate(() => { const A = window.__fp.AURA, m = A.mesh, L = window.__life; if (!m) return 0; const a = m.position.clone(), b = m.position.clone(); a.y -= m.scale.y*1.02; b.y += m.scale.y*1.02; a.project(L.cam); b.project(L.cam); return Math.abs(b.y - a.y)/2*innerHeight; });
  check(A.target === far.id && A.vis && hpx >= 25, `looking at a team-mate ${far.d.toFixed(0)} m off: lit, the halo ${hpx.toFixed(0)} px tall (readable at range)`, Object.assign(A, {hpx}));
  await T.snap("uf-aura-2-far", 150);
  // an opponent: nobody lit
  const opp = opps.find(x => x.d > 6) || opps[0];
  await hold(opp.id, 10);
  A = await aura();
  check(A.target !== opp.id && !(A.vis && A.target >= 0 && (await where(A.target)).d > 0 && A.target !== -1 && Math.abs((await where(A.target)).x - 640) < 80), "looking at an opponent: he is not lit", A);
  // nothing (the sky): nobody lit
  await page.evaluate(() => { window.__life.P.pitch = .9; });
  await T.frames(20);
  A = await aura();
  check(A.target === -1 && !A.vis, "looking at the sky: no halo", A);
  check(page.errors.length === 0, "zero console and page errors", page.errors.slice(0, 5));
  ok = true;
} catch (e){ console.log("FAILED", e.stack || e.message); check(false, "the run finished", String(e.message)); }
await T.close();
process.exit(done() && ok ? 0 : 1);
