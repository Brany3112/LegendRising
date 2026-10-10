// qa/wpF-lib.mjs: what the WP-F acceptance scripts share: a career on a match day at the training ground, a scripted
// player (a bot at the keys) for the match day, and the checks' bookkeeping.
// Owner: WP-F (Stage P2). Contracts DESIGN 1.4.16 (FP), 1.4.20 (window.__fp), 2.4 WP-F acceptance.
//
//   const T = await openDay({gfx: "low", role: "starter", before: 60});   // a page, a career standing at the tunnel
//   await T.toMatch(); await T.untilState("dressing"); ...
import fs from "node:fs";
import path from "node:path";
import {launch, career, freeze, OUT} from "./lib.mjs";

export function checker(name){
  const res = {name, checks: [], ok: true};
  const check = (pass, what, value) => {
    res.checks.push({name: what, pass: !!pass, value});
    if (!pass) res.ok = false;
    console.log(`${pass ? "ok  " : "FAIL"} ${what}${value === undefined ? "" : ": " + JSON.stringify(value)}`);
  };
  const done = () => {
    fs.mkdirSync(OUT, {recursive: true});
    fs.writeFileSync(path.join(OUT, name + ".json"), JSON.stringify(res, null, 1));
    console.log(`${name}: ${res.checks.filter(c => c.pass).length} of ${res.checks.length} checks pass`);
    return res.ok;
  };
  return {res, check, done};
}

// a career standing at the training ground's tunnel on a match day (a league match), `before` minutes before the
// kick-off. role: "starter" (trust and chemistry high) or "sub" (trust low). Resolves {page, close, info, ...helpers}
export async function openDay({gfx = "low", seed = 7, role = "starter", before = 60, kind = "L", w = 1280, h = 720} = {}){
  const {page, close} = await launch({gfx, seed, w, h});
  await career(page, {zone: "ground", min: 9*60});
  const info = await page.evaluate(({role, before, kind}) => {
    const ok = f => f && (!kind || f.kind === kind);
    let n = 0; while (!ok(todaysFixture()) && n++ < 28){ S.life.min = 23*60; sleepNight(2); startNewDay(); }
    if (role === "starter"){ S.trust = 100; S.chem = 80; } else { S.trust = 0; S.chem = 0; }
    S.fatigue = 0; S.energy = 100;
    const f = todaysFixture(), ko = fixtureSlot(f).min;
    S.life.min = ko - before;
    window.startLife({zone: "ground", at: "tunnel"});
    return {day: S.life.day, ko, key: f.key, kind: f.kind, lg: f.lg, h: f.h, a: f.a, club: meP().club, trust: S.trust};
  }, {role, before, kind});
  await page.waitForFunction(() => window.__life.presented >= 2, null, {timeout: 120000});
  await freeze(page);
  const T = {page, close, info,
    st: () => page.evaluate(() => ({state: window.__fp.state, mode: window.__life.modes.mode(), zone: window.__life.LIFE.zone, min: S.life.min,
      P: [window.__life.P.x, window.__life.P.z], fade: window.__life.FADE.v, top: window.__life.camera.top(), owners: window.__life.camera.owners()})),
    step: (n = 1) => page.evaluate(n => window.__life.stepN(n), n),
    toMatch: () => page.evaluate(() => window.__life.ctx.toMatch()),
    uncover: () => page.evaluate(() => { const f = document.getElementById("lifeFade"); f.style.transition = "none"; f.style.opacity = "0"; window.__life.FADE.v = 0; }),
    draw: (n = 1) => page.evaluate(n => { const L = window.__life; for (let i = 0; i < n; i++) L.stepN(1); L.renderer().render(L.scene(), L.cam); }, n)
  };
  // frames until the match day's state is `want` (or a guard runs out); the 950 ms fade into the tunnel is real time
  T.untilState = async (want, frames = 3000, per = 30) => {
    for (let i = 0; i < frames/per; i++){
      const s = await T.st();
      if (s.state === want) return s;
      await page.waitForTimeout(5);
      await T.step(per);
    }
    return T.st();
  };
  // from the tunnel to the kick-off: into the tunnel, the travel card, the manager and the door, then the bot walks out
  // and to its place and says it is ready. Resolves the state it got to ('live' for a starter, 'bench' for a sub)
  T.toKickoff = async ({sit = true} = {}) => {
    await installBot(page);
    await T.toMatch();
    await page.waitForTimeout(1300);
    await T.untilState("dressing", 6000);
    await page.evaluate(() => { window.__fp.manager(); window.__fp.headOut(); });
    for (let i = 0; i < 2400; i++){
      const r = await page.evaluate(() => {
        const F = window.__fp, sp = F.spot(), P = window.__life.P, st = F.state;
        if (st !== "walkout"){ window.__bot.toward(P.x, P.z); return st; }
        let tx = sp ? sp.x : -10, tz = sp ? sp.z : -36.8;
        if (P.z < -40){ tx = P.x; tz = -38; }
        const d = window.__bot.toward(tx, tz, .35);
        if (sp && d < 1.2){ F.input({type: "keydown", key: "e"}); F.input({type: "keyup", key: "e"}); F.ready(); }
        window.__bot.frame(1);
        return F.state;
      });
      if (r !== "walkout") break;
    }
    const s = await T.st();
    if (s.state === "bench" && sit){ await page.evaluate(() => window.__fp.sitDown("home")); }
    return T.st();
  };
  return T;
}

// the bot in the page: walks you to a point (turning the view to it as a mouse would, W held) a frame at a time;
// returns the per-frame record of where you were. Installed once per page
export async function installBot(page){
  await page.evaluate(() => {
    if (window.__bot) return;
    const L = window.__life, F = window.__fp;
    window.__bot = {
      rec: [],
      // one frame: turn to (tx, tz) and hold W if further than stop; record P and the fade
      toward(tx, tz, stop = .4, run = false){
        const P = L.P, dx = tx - P.x, dz = tz - P.z, d = Math.hypot(dx, dz);
        if (d > stop){ P.yaw = Math.atan2(-dx, -dz); F.input({type: "keydown", key: "w"}); if (run) F.input({type: "keydown", key: "shift"}); }
        else { F.input({type: "keyup", key: "w"}); F.input({type: "keyup", key: "shift"}); }
        return d;
      },
      frame(n = 1){
        for (let i = 0; i < n; i++){
          const P = L.P, x0 = P.x, z0 = P.z;
          L.stepN(1);
          const me = F.me();
          this.rec.push({dx: Math.hypot(P.x - x0, P.z - z0), fade: L.FADE.v, state: F.state, top: L.camera.top(), owners: L.camera.owners().join(","),
            vmax: me && F.FS.onPitch ? me.prm.vmax : F.FS.ownPrm ? F.FS.ownPrm.vmax : 9.5, inMatch: document.body.classList.contains("in-match")});
        }
      }
    };
  });
}
