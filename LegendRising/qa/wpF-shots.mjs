// qa/wpF-shots.mjs: first-person screenshots of a match day (DESIGN 2.4 WP-F; addendum A1.4 match HUD) for review.
// Owner: WP-F (Stage P2).
//
// A career's league match from the tunnel: the kick-off, dribbling, a pass being weighted, a shot being charged, a
// cross, a goal, half time and full time, each a frame of the real renderer with the match HUD over it.
//
//   QA_PORT=8770 node qa/wpF-shots.mjs [--gfx low|high]     writes qa/out/wpF-shots/<gfx>-<scene>.png
import fs from "node:fs";
import path from "node:path";
import {OUT} from "./lib.mjs";
import {openDay} from "./wpF-lib.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const GFX = arg("--gfx", "low");
const DIR = path.join(OUT, "wpF-shots");
fs.mkdirSync(DIR, {recursive: true});
const T = await openDay({gfx: GFX, role: "starter", before: 60});
const shots = [];
const snap = async name => {
  await T.uncover();
  await T.draw(2);
  const file = path.join(DIR, `${GFX}-${name}.png`);
  await T.page.screenshot({path: file, timeout: 180000});
  shots.push(file);
  console.log("shot", file);
};
let ok = false;
try {
  const s0 = await T.toKickoff();
  console.log("state", s0.state);
  // (you look up the pitch, towards the goal you attack, as you would before the whistle)
  await T.page.evaluate(() => { const F = window.__fp, L = window.__life, ms = F.ms, me = F.me(); for (const k of ["w", "shift"]) F.input({type: "keyup", key: k}); if (me){ L.P.yaw = ms.dirs[me.team] > 0 ? -Math.PI/2 : Math.PI/2; L.P.pitch = -.06; } L.stepN(2); });
  await snap("kickoff");

  // the ball at your feet in your own half, running at the defence
  const place = await T.page.evaluate(() => {
    const F = window.__fp, L = window.__life, ms = F.ms, me = F.me();
    ms.phase = "live"; ms.restart = null; ms.clock.running = true;
    const dir = ms.dirs[me.team];
    me.m.x = me.x0 = -dir*6; me.m.z = me.z0 = 4; me.m.vx = me.m.vz = me.m.speed = 0;
    const yaw = dir > 0 ? -Math.PI/2 : Math.PI/2;
    L.P.yaw = me.m.yaw = me.m.heading = yaw; L.P.pitch = -.12;
    const b = ms.ball; b.p.x = me.m.x + dir*.6; b.p.y = .11; b.p.z = me.m.z; b.v.x = b.v.y = b.v.z = 0; b.state = "free"; b.holder = -1;
    ms.poss.ctl = me.id; ms.poss.team = me.team;
    F.input({type: "keydown", key: "w"});
    for (let i = 0; i < 70; i++) L.stepN(1);
    return {dir};
  });
  await snap("dribbling");

  // a pass being weighted: RMB held, the receiver ring under the man in the cone
  await T.page.evaluate(() => {
    const F = window.__fp, L = window.__life, ms = F.ms, me = F.me();
    F.input({type: "keyup", key: "w"});
    const mate = ms.agents.filter(a => a.team === me.team && a !== me && !a.isGK && a.onPitch).sort((a, b) => Math.abs(a.m.z - me.m.z - 12) - Math.abs(b.m.z - me.m.z - 12))[0];
    if (mate){ const dx = mate.m.x - me.m.x, dz = mate.m.z - me.m.z; L.P.yaw = Math.atan2(-dx, -dz); L.P.pitch = -Math.atan2(1.6, Math.hypot(dx, dz)); }
    const b = ms.ball, f = {x: -Math.sin(L.P.yaw), z: -Math.cos(L.P.yaw)};
    b.p.x = me.m.x + f.x*.55; b.p.z = me.m.z + f.z*.55; b.v.x = b.v.z = 0; ms.poss.ctl = me.id; ms.poss.team = me.team;
    F.input({type: "down", button: 2});
    for (let i = 0; i < 22; i++) L.stepN(1);
  });
  await snap("pass");
  await T.page.evaluate(() => { const F = window.__fp, L = window.__life; F.input({type: "up", button: 2}); for (let i = 0; i < 40; i++) L.stepN(1); });

  // a shot being charged from the edge of the box
  await T.page.evaluate(() => {
    const F = window.__fp, L = window.__life, ms = F.ms, me = F.me(), dir = ms.dirs[me.team], gx = dir*ms.spec.hx;
    ms.phase = "live"; ms.restart = null;
    me.m.x = me.x0 = gx - dir*20; me.m.z = me.z0 = -3; me.m.vx = me.m.vz = me.m.speed = 0;
    L.P.yaw = me.m.yaw = me.m.heading = Math.atan2(-(gx - me.m.x), -(0 - me.m.z)); L.P.pitch = -.04;
    const f = {x: -Math.sin(L.P.yaw), z: -Math.cos(L.P.yaw)}, b = ms.ball;
    b.p.x = me.m.x + f.x*.6; b.p.y = .11; b.p.z = me.m.z + f.z*.6; b.v.x = b.v.y = b.v.z = 0; b.state = "free";
    ms.poss.ctl = me.id; ms.poss.team = me.team;
    for (const a of ms.agents) if (a.team !== me.team && !a.isGK && Math.hypot(a.m.x - me.m.x, a.m.z - me.m.z) < 6){ a.m.x += dir*6; a.x0 = a.m.x; }
    F.input({type: "down", button: 0});
    for (let i = 0; i < 26; i++) L.stepN(1);
  });
  await snap("shot");
  await T.page.evaluate(() => { const F = window.__fp, L = window.__life; F.input({type: "up", button: 0}); for (let i = 0; i < 14; i++) L.stepN(1); });
  await snap("shot-struck");

  // a cross from the right, lofted (contact high) towards the far post
  await T.page.evaluate(() => {
    const F = window.__fp, L = window.__life, ms = F.ms, me = F.me(), dir = ms.dirs[me.team], gx = dir*ms.spec.hx;
    ms.phase = "live"; ms.restart = null;
    me.m.x = me.x0 = gx - dir*12; me.m.z = me.z0 = 26; me.m.vx = me.m.vz = me.m.speed = 0;
    const tx = gx - dir*7, tz = -3;
    L.P.yaw = me.m.yaw = me.m.heading = Math.atan2(-(tx - me.m.x), -(tz - me.m.z)); L.P.pitch = -Math.atan2(1.6, Math.hypot(tx - me.m.x, tz - me.m.z));
    const f = {x: -Math.sin(L.P.yaw), z: -Math.cos(L.P.yaw)}, b = ms.ball;
    b.p.x = me.m.x + f.x*.6; b.p.y = .11; b.p.z = me.m.z + f.z*.6; b.v.x = b.v.y = b.v.z = 0; b.state = "free";
    ms.poss.ctl = me.id; ms.poss.team = me.team;
    F.input({type: "keydown", key: "3"}); F.input({type: "keyup", key: "3"});
    F.input({type: "down", button: 0});
    for (let i = 0; i < 24; i++) L.stepN(1);
  });
  await snap("cross");
  await T.page.evaluate(() => { const F = window.__fp, L = window.__life; F.input({type: "up", button: 0}); for (let i = 0; i < 50; i++) L.stepN(1); });
  await snap("cross-flight");

  // a goal: a shot from close in that beats the keeper (the ball rolled in past him), the notice and the crowd
  const goal = await T.page.evaluate(() => {
    const F = window.__fp, L = window.__life, ms = F.ms, me = F.me(), dir = ms.dirs[me.team], gx = dir*ms.spec.hx;
    ms.phase = "live"; ms.restart = null;
    me.m.x = me.x0 = gx - dir*9; me.m.z = me.z0 = 1; me.m.vx = me.m.vz = me.m.speed = 0;
    L.P.yaw = me.m.yaw = me.m.heading = Math.atan2(-(gx - me.m.x), -(0 - me.m.z)); L.P.pitch = -.02;
    const gk = ms.agents[ms.gks[1 - me.team]]; if (gk){ gk.m.z = gk.z0 = 3.2; }
    const b = ms.ball; b.p.x = gx - dir*3; b.p.y = .4; b.p.z = -2.4; b.v.x = dir*16; b.v.y = .5; b.v.z = 0; b.state = "free"; b.holder = -1;
    b.last.agent = me.id; b.last.team = me.team; b.last.t = ms.t; ms.poss.ctl = -1; ms.poss.team = me.team;
    const s0 = ms.score.slice();
    for (let i = 0; i < 70; i++) L.stepN(1);
    return {before: s0, after: ms.score.slice()};
  });
  console.log("goal", JSON.stringify(goal));
  await snap("goal");

  // half time and full time
  await T.page.evaluate(() => {
    const F = window.__fp, L = window.__life;
    F.headless(2699);
    for (let i = 0; i < 6000 && !(F.state === "halftime" && document.querySelector(".fp-overlay.ht")); i++) L.stepN(1);
  });
  await snap("halftime");
  await T.page.evaluate(() => {
    const F = window.__fp, L = window.__life;
    F.halftimeGo();
    for (let i = 0; i < 4; i++) L.stepN(1);
  });
  await T.page.evaluate(() => {
    const F = window.__fp, L = window.__life;
    // (to the last minute headless, then the added time and the whistle live, so the full-time card is drawn)
    F.headless(5399);
    for (let i = 0; i < 40000 && !document.querySelector(".fp-overlay.ft"); i++) L.stepN(1);
  });
  await snap("fulltime");
  ok = true;
} catch (e){ console.log("FAILED", e.stack || e.message); }
console.log("errors:", T.page.errors.slice(0, 6).join("\n") || "none");
await T.close();
process.exit(ok && !T.page.errors.length ? 0 : 1);
