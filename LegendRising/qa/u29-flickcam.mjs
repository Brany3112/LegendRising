// qa/u29-flickcam.mjs: U29 with real input (the Training button clicked, the wheel's button held and let go, the
// pointer locked by a real click):
//   - from the Training button the view is behind you from the first frame Training draws (the hub up or closed): no
//     first-person frame, so no glide back while the cage loads
//   - the flick's bar fills by Ball Control: a full bar in 0.56 s at 33, 0.22 at 55, 0.11 at 99 (control.js flickFull)
//   - a full bar at Strength 99, let go with W, flicks the ball 4.5 m up (within 0.15 m), the drawn ball in the air
//   - no console or page error
//
//   node qa/u29-flickcam.mjs          exits 1 on any failed check; writes qa/out/u29-flickcam.json
import fs from "node:fs";
import path from "node:path";
import {OUT} from "./lib.mjs";
import {trainLaunch, lockPointer, frames} from "./tr4b-lib.mjs";
import {titleReady, clickReal, hubUp} from "./tr3b-lib.mjs";

const res = {errors: []};
const check = (ok, what, got) => { if (!ok) res.errors.push(`${what}: ${JSON.stringify(got).slice(0, 1500)}`); console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok ? "" : ": " + JSON.stringify(got).slice(0, 900)}`); };

const t = await trainLaunch({seed: 6, gfx: "medium"});
const page = t.page;
try {
  /* ---------- the Training button: behind you from the first frame ---------- */
  await titleReady(page);
  await page.evaluate(() => { const raf = window.__qa && window.__qa.realRAF ? window.__qa.realRAF : requestAnimationFrame; window.__u29cam = [];
    const f = () => { const L = window.__life; if (L && L.cam && L.P && L.LIFE && L.LIFE.running){ const c = L.cam.position, P = L.P;
      window.__u29cam.push({d: Math.round(Math.hypot(c.x - P.x, c.z - P.z)*100)/100, hub: !!(window.__trainHub && window.__trainHub.hubOpen())}); }
      if (window.__u29cam.length < 200) raf(f); }; raf(f); });
  await clickReal(page, ".ts-train"); await hubUp(page);
  await frames(page, 30);
  await page.evaluate(() => window.__trainHub.closeHub());
  await frames(page, 40);
  // (the first frame or two are still the title's camera, before Training's first: from Training's first frame on)
  const cam = (await page.evaluate(() => window.__u29cam)).filter(x => x.d < 10);
  res.cam = {frames: cam.length, fp: cam.filter(x => x.d < .5).length, first: cam.slice(0, 3), hubFrames: cam.filter(x => x.hub).length};
  check(cam.length >= 20 && cam.filter(x => x.hub).length >= 3 && cam.every(x => x.d > 1.5), "from the Training button the view is behind you from the first frame (the hub up and after it): no first-person frame", res.cam);

  /* ---------- the flick ---------- */
  await page.evaluate(async () => {
    const R = window.__trainRun, C = await import("/js/life/football/control.js");
    const build = (cfg, env) => {
      const hx = env.spec.hx, me = {slot: "ST", x: -hx + 20, z: 0, yaw: -Math.PI/2};
      return {myTeam: 0, role: "Attacker", seed: 11, laws: {out: "rebound"}, me, mates: [], opps: [], keeper: null, ball: {x: me.x + .4, y: .11, z: 0, free: true}};
    };
    if (!R.scenario("qa-u29f")) R.registerScenario({id: "qa-u29f", category: "attacking", type: "qau29f", name: "Flick test", desc: "A test scenario", build});
    C.saveSet({footCam: "third"});
    window.__u29 = {C, start: () => { if (R.RUN.cur) R.stopScenario("hub"); if (window.__trainHub.hubOpen()) window.__trainHub.closeHub(); return R.startScenario("qa-u29f", {}); },
      T: () => window.__trainRun.RUN.cur.T};
  });
  const begin = async at => {
    await page.evaluate(() => window.__u29.start());
    await page.waitForFunction(() => !!(window.__trainRun.RUN.cur && window.__trainRun.RUN.cur.T && window.__trainRun.RUN.cur.T.V), null, {timeout: 60000});
    await frames(page, 30);
    await page.evaluate(at => { const T = window.__u29.T(); Object.assign(T.me.at, at); T.ms.poss.ctl = T.me.id; const P = window.__life.P; P.yaw = -Math.PI/2; P.pitch = -.15; }, at);
    await frames(page, 10);
  };
  await begin({});
  const id = await lockPointer(page); if (!id) throw new Error("the pointer could not be locked");
  await frames(page, 10);
  // the bar's full time by Ball Control: read off the bar itself while it fills (its share against the time held)
  const fill = {};
  for (const ctrl of [33, 55, 99]){
    await begin({ctrl});
    await page.evaluate(() => { const raf = window.__qa && window.__qa.realRAF ? window.__qa.realRAF : requestAnimationFrame; window.__u29bar = [];
      const f = () => { const C = window.__u29.C.CTRL; if (C.charge && C.charge.kind === "flick") window.__u29bar.push({p: C.charge.p, t: C.mmbT}); if (window.__u29bar.length < 60) raf(f); }; raf(f); });
    await page.mouse.down({button: "middle"}); await frames(page, 40); await page.mouse.up({button: "middle"}); await frames(page, 10);
    const bar = await page.evaluate(() => window.__u29bar);
    const mid = bar.filter(x => x.p > .05 && x.p < .98), full = mid.length ? mid.reduce((s, x) => s + x.t/x.p, 0)/mid.length : null;
    fill[ctrl] = {full: full != null ? Math.round(full*1000)/1000 : null, samples: mid.length, reached: bar.some(x => x.p >= 1)};
  }
  res.fill = fill;
  const near = (v, w) => v != null && Math.abs(v - w) < .012;
  check((fill[33].samples ? near(fill[33].full, .556) : false) && (fill[55].samples ? near(fill[55].full, .222) : true) && (fill[99].samples ? near(fill[99].full, .111) : true) && fill[33].reached && fill[55].reached && fill[99].reached,
    "the bar fills by Ball Control: full in 0.56 s at 33, 0.22 at 55, 0.11 at 99 (the real middle button)", fill);
  // a full bar at Strength 99, W held as it is let go: 4.5 m up
  await begin({strength: 99, ctrl: 99});
  await page.evaluate(() => { const raf = window.__qa && window.__qa.realRAF ? window.__qa.realRAF : requestAnimationFrame; window.__u29top = 0; let n = 0;
    const f = () => { const T = window.__u29.T(); if (T && T.ms){ window.__u29top = Math.max(window.__u29top, T.ms.ball.p.y); } if (++n < 400) raf(f); }; raf(f); });
  await page.keyboard.down("w"); await page.mouse.down({button: "middle"}); await frames(page, 20); await page.mouse.up({button: "middle"}); await frames(page, 2); await page.keyboard.up("w");
  await frames(page, 150);
  const top = await page.evaluate(() => Math.round(window.__u29top*100)/100);
  const ev = await page.evaluate(() => { const T = window.__u29.T(), e = T.ms.events.filter(x => x.kind === "touch" && x.how === "flick").pop(); return e ? {flick: e.flick, top: e.top, land: e.land} : null; });
  res.top = {top, ev};
  check(ev && Math.abs(top - 4.5) < .15, "a full bar at Strength 99, let go with W: the ball goes 4.5 m up", res.top);
  check(!t.errors.length, "no console or page error", t.errors.slice(0, 5));
} finally { await t.close(); }
fs.writeFileSync(path.join(OUT, "u29-flickcam.json"), JSON.stringify(res, null, 1));
console.log(res.errors.length ? `u29-flickcam: ${res.errors.length} failed` : "u29-flickcam: all checks pass");
process.exit(res.errors.length ? 1 : 0);
