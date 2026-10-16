// qa/tr6-receive-anim.mjs: Ball Receiving and First Touch in the browser: the receive animation against the real ball,
// the feeder's first balls, and the receive presets.
// Owner: P6-A (Training Mode Phase 6). Contract: BUILD-PLAN P6-A acceptance "qa/tr6-receive-anim.mjs"; TRAINING-SPEC 4
// (presets for every scenario, kept across sessions, the setup only) and 5 (Ball Receiving and First Touch: the
// animations, never an animation where the ball is not, no excessive locking).
//
// In Training (entered by a real click on the title's Training button, the receiving drills started from the hub by
// real clicks and then one after another through the runner), each drill played on the real simulation with its real
// feed, the bodies posed by view.js and moves.js as in play (the page frozen and stepped at 120 frames a second, your
// whole body drawn as a replay draws it):
//   1. at every contact, the contact part (the inside of the foot, the sole, the thigh, the chest) is within 0.12 m of
//      the ball (the simulation's own contact point: where the touch was put on it);
//   2. at least one adjustment footfall (the clip's PLANT, C.data.steps) when the ball is off the line;
//   3. no clip starts with the ball's contact point more than R + 0.3 m from the body (R: zone.js R for it there), and
//      the part is the simulation's (the touch event's part);
//   4. input is never locked more than 0.35 s after the contact: the receive clip hands the body back within 0.35 s of
//      the simulation's touch, and a real W pressed at the touch moves the player (his mover's target) within 0.35 s;
//   5. a contact sheet per drill (qa/out/tr6-anim-<drill>-<moment>.png: as it comes, the contact, after);
//   6. the feeder's first ball: for a ground pass, a driven pass, a cross and a loft from the configured passer (a
//      team-mate), the launch speed is within 2% and the apex within 5 cm of the configured launch (feeder.js plan()),
//      and the ball leaves the passer's foot at his strike's contact (the striking part within 0.12 m of the ball);
//   7. presets (spec 4): a named 'receive' preset with non-default values (a moving receiver, a bouncing ball from the
//      left at 14 m/s, a defender at 3 m, then a shot) saved by real typing and clicks, the page reloaded, loaded by a
//      real click: the configuration is identical, and the activation's RUN.digest() equals that of the saved setup;
//   8. the career save is never written (the write spy), and no console or page error.
//
//   QA_PORT=8890 node qa/tr6-receive-anim.mjs        exits 1 on any failed check; writes qa/out/tr6-receive-anim.json
import {report, freeze, unfreeze, snap} from "./lib.mjs";
import {trainLaunch, enterByButton, trainWrites, v2Writes, careerSnapshot, careerDiff, clickReal, assertVisible, pressReal, lockPointer, frames, hubUp} from "./tr4b-lib.mjs";

const res = {drills: {}, feeds: {}, lock: null, preset: null, errors: []};
const check = (ok, what, got) => { if (!ok) res.errors.push(`${what}: ${JSON.stringify(got).slice(0, 1500)}`); console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok ? "" : ": " + JSON.stringify(got).slice(0, 600)}`); };
const ONLY = process.env.ONLY || "";
const r3 = v => Math.round(v*1000)/1000;

// the page's helpers: the drills' configurations, a start through the runner, the frozen stepping with its readings
const HELPERS = async () => {
  const RC = await import("/js/life/train/receive.js");
  await import("/js/life/train/scen-receive.js");
  const MV = await import("/js/life/moves.js"), Z = await import("/js/life/football/zone.js"), A = await import("/js/life/football/actions.js"), CT = await import("/js/life/football/control.js");
  // (a ball off his line: the player steps across to where it will pass, as a player would: W A S D for the way to it)
  const steer = (ms, me) => {
    const Q = {x:0, y:0, z:0}, P = window.__life.P;
    let best = null;
    for (let i = 1; i <= 45; i++){ A.predAt(ms, i/30, Q); const d = Math.hypot(Q.x - me.m.x, Q.z - me.m.z); if (!best || d < best.d) best = {d, x:Q.x, z:Q.z, t:i/30}; }
    for (const k of ["w", "a", "s", "d"]) CT.CTRL.held[k] = false;
    if (!best || best.d < .45 || best.t < .12 || ms.poss.ctl === me.id) return;
    const dx = best.x - me.m.x, dz = best.z - me.m.z, l = Math.hypot(dx, dz), fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = -fz, rz = fx;
    const fw = (dx*fx + dz*fz)/l, rt = (dx*rx + dz*rz)/l;
    if (fw > .38) CT.CTRL.held.w = true; else if (fw < -.38) CT.CTRL.held.s = true;
    if (rt > .38) CT.CTRL.held.d = true; else if (rt < -.38) CT.CTRL.held.a = true;
  };
  const L = window.__life, Rn = window.__trainRun, r3 = v => Math.round(v*1000)/1000;
  const T6 = window.__t6 = {RC, MV, Z,
    cfg(id, extra){ return RC.drillConfig(id, extra || null); },
    // a drill started through the runner on the cage there is (a restart of whatever plays)
    start(id, cfg){
      if (Rn.RUN.cur) Rn.stopScenario("restart");
      return Rn.startScenario(id, cfg);
    },
    ready(){ const R = Rn.RUN; return !!R.cur && !R.switching && !!R.T && !!R.T.V && !R.paused; },
    // your whole body drawn (as a replay draws it), so the clip is posed on the body the tests measure
    whole(){ const V = Rn.RUN.T.V; V.fpOn = false; if (V.fp) V.fp.g.visible = false; },
    look(px, pz, ox, oy, oz, ty = .8){ const T = Rn.RUN.T, F = T.F, c = L.cam; c.position.set(px + F.cx + ox, oy, pz + F.cz + oz); c.lookAt(px + F.cx, ty, pz + F.cz); c.updateMatrixWorld(true); },
    /* step the frozen page until something happens (or n frames): what = 'clip' (the receive clip starts), 'contact'
       (its contact), 'after' (0.2 s after the contact), 'end' (the clip handed back and the go decided, or max) */
    run(what, max = 1200){
      const T = Rn.RUN.T, ms = () => Rn.RUN.T.ms, me = () => Rn.RUN.T.me, V = T.V, rec = () => V.rec[me().id];
      const S = T6.S || (T6.S = {});
      for (let i = 0; i < max; i++){
        if (T6.steer && !S.touch) steer(ms(), me());
        L.stepN(1, 1/120);
        const R = rec(), c = R && R.clip && R.clip.mode === "receive" ? R.clip : null, C = R && R.h.mv, m = me(), M = ms();
        if (c && !S.clip){
          // the clip's start: its contact point against the body, and R for the ball there
          const RA = {m:{x:m.m.x, z:m.m.z, yaw:m.m.yaw, vx:m.m.vx, vz:m.m.vz}, at:m.at, scale:m.scale || 1, fac:m.fac, y:0, st:m.st};
          const r = Z.R(RA, {p:{x:c.ball.x, y:c.ball.y, z:c.ball.z}, v:M.ball.v}, M, {angle:false});
          S.clip = {t:M.t, part:c.part, side:c.side, dStart:c.dStart, rStart:c.rStart, rNow:r, dNow:Math.hypot(c.ball.x - m.m.x, c.ball.z - m.m.z), ball:[c.ball.x, c.ball.y, c.ball.z].map(r3)};
          if (what === "clip") return S;
        }
        // the simulation's touch: its moment and point
        if (!S.touch){
          for (let k = S.ev || 0; k < M.events.length; k++){
            const e = M.events[k];
            if (e.kind === "touch" && e.how === "control" && e.agent === m.id){ S.touch = {t:e.t, x:e.x, z:e.z, part:e.part, q:e.quality}; break; }
          }
          S.ev = M.events.length;
        }
        if (c && C && C.key === "receive" && C.contactDone && !S.contact){
          const pn = c.part === "chest" ? "chest" : c.part === "thigh" ? "thigh" : c.part === "sole" ? "sole" : "inside";
          const p = MV.partPoint(R.h, pn, c.side);
          // (in the cage's frame: the bodies are drawn at the frame's offset)
          const ox = V.ox || 0, oz = V.oz || 0;
          const b = {x:c.ball.x + ox, y:c.ball.y, z:c.ball.z + oz};
          S.contact = {t:M.t, part:c.part, done:!!c.done, d:r3(Math.hypot(p.x - b.x, p.y - b.y, p.z - b.z)), p:[p.x - ox, p.y, p.z - oz].map(r3), b:[c.ball.x, c.ball.y, c.ball.z].map(r3),
            reachErr:C.reachErr, steps:C.data.steps || 0, step:!!C.data.step, tau:r3(C.tau), tgt:C.data.tx != null ? [C.data.tx, C.data.ty, C.data.tz].map(r3) : null};
          if (what === "contact") return S;
        }
        if (S.contact && C && C.data) S.steps = Math.max(S.steps || 0, C.data.steps || 0);
        if (S.contact && !S.after && M.t >= S.contact.t + .2){ S.after = true; if (what === "after") return S; }
        if (S.touch && !S.released && !(c && R.h.mode === "receive")){ S.released = {t:M.t, dt:r3(M.t - S.touch.t)}; }
        const G = window.__trainReceive.go();
        if (G && G.verdict && !S.verdict) S.verdict = {ok:G.verdict.ok, why:G.verdict.why, text:G.verdict.text};
        if (what === "end" && S.verdict && (S.released || !S.touch) && (!S.touch || S.contact)) return S;
      }
      return S;
    },
    reset(){ T6.S = null; T6.steer = false; for (const k of ["w", "a", "s", "d"]) CT.CTRL.held[k] = false; },
    me(){ const m = Rn.RUN.T.me; return {x:m.m.x, z:m.m.z}; }
  };
};

const t = await trainLaunch({seed: 8});
const {page} = t;
const pageErr = [];
page.on("pageerror", e => pageErr.push(String(e)));
page.on("console", m => { if (m.type() === "error") pageErr.push(m.text()); });
const ready = () => page.waitForFunction(() => window.__t6 && window.__t6.ready(), null, {timeout: 120000});

try {
  const careerBefore = await careerSnapshot(page);
  await enterByButton(page);
  await page.evaluate(HELPERS);
  // ---------- the hub: the receiving drills listed, the first started by real clicks ----------
  await clickReal(page, '#sheetRoot [data-th="cat"][data-id="receiving"]');
  await page.waitForFunction(() => !!document.querySelector('#sheetRoot [data-th="start"][data-id="receive-feet"]'), null, {timeout: 15000});
  const listed = await page.evaluate(() => [...document.querySelectorAll("#sheetRoot .th-sc b")].map(e => e.textContent));
  check(listed.length >= 30 && listed.includes("Chest control") && listed.includes("Header to control") && listed.includes("While shielding"), "the hub lists the receiving drills (every variant of spec 5)", listed.length);
  const sv = await assertVisible(page, '#sheetRoot [data-th="start"][data-id="receive-feet"]');
  check(sv.ok, "the first drill's Start is visible", sv);
  await clickReal(page, '#sheetRoot [data-th="start"][data-id="receive-feet"]');
  await ready();
  check(!!(await lockPointer(page)), "the pointer is locked on the game", null);
  await frames(page, 4);
  const hud = await page.evaluate(() => { const e = document.getElementById("trainHud"); return e ? e.textContent.replace(/\s+/g, " ") : ""; });
  check(/Ground pass to your feet/.test(hud) && /Receiver/.test(hud), "the Training HUD names the drill and your role", hud);

  // ---------- 1 to 5: the receive animation on the real ball ----------
  const DRILLS = [
    ["feet", "receive-feet", null], ["left", "receive-left", null], ["adjust", "receive-adjust", {steer: true}], ["slow", "receive-slow", null],
    ["thigh", "receive-thigh", null], ["chest", "receive-chest", null], ["footair", "receive-footair", {steer: true}],
    ["jog", "receive-jog", {keys: ["w"]}], ["sprint", "receive-sprint", {keys: ["w", "shift"]}]
  ];
  for (const [name, id, o] of DRILLS){
    if (ONLY && !name.includes(ONLY)) continue;
    await page.evaluate(([id]) => { window.__t6.reset(); window.__t6.start(id, window.__t6.cfg(id)); }, [id]);
    await ready();
    await lockPointer(page);
    await freeze(page);
    await page.evaluate(([st]) => { window.__t6.whole(); window.__t6.steer = !!st; }, [!!(o && o.steer)]);
    // (the run of a moving drill: its keys held as the player's would be, looking along the run)
    if (o && o.keys) await page.evaluate(async keys => { const CT = await import("/js/life/football/control.js"); for (const k of keys) CT.CTRL.held[k] = true; window.__life.P.yaw = -Math.PI/2; }, o.keys);
    let S = await page.evaluate(() => window.__t6.run("clip", 1600));
    const shot = async m => {
      await page.evaluate(() => { const T6 = window.__t6, p = T6.me(); T6.look(p.x, p.z, 2.6, 1.5, 2.6); });
      await snap(page, `tr6-anim-${name}-${m}`);
    };
    if (S.clip){
      await page.evaluate(() => window.__t6.run("none", 18));
      await shot("comes");
      S = await page.evaluate(() => window.__t6.run("contact", 600));
      await shot("contact");
      S = await page.evaluate(() => window.__t6.run("after", 200));
      await shot("after");
    }
    S = await page.evaluate(() => window.__t6.run("end", 1600));
    if (o && o.keys) await page.evaluate(async keys => { const CT = await import("/js/life/football/control.js"); for (const k of keys) CT.CTRL.held[k] = false; }, o.keys);
    await unfreeze(page);
    res.drills[name] = S;
    console.log(`  ${name}: ${JSON.stringify({clip: S.clip, contact: S.contact, touch: S.touch, released: S.released, steps: S.steps, verdict: S.verdict})}`);
  }
  const D = Object.entries(res.drills);
  const withTouch = D.filter(([, S]) => S.touch);
  check(withTouch.length >= Math.min(D.length, 7), "the drills' balls are taken by the receiver (the simulation's touch)", D.map(([n, S]) => [n, !!S.touch]));
  const far = withTouch.filter(([, S]) => !S.contact || !(S.contact.d <= .12));
  check(withTouch.length && !far.length, "at every contact the contact part is within 0.12 m of the ball (the simulation's own contact point)", withTouch.map(([n, S]) => [n, S.contact && S.contact.part, S.contact && S.contact.d, S.contact && S.contact.done]));
  const off = D.filter(([n]) => n === "adjust" || n === "footair");
  check(off.length && off.every(([, S]) => (S.steps || 0) >= 1), "a ball off the line gets at least one adjustment footfall (the support foot's plant)", off.map(([n, S]) => [n, S.steps]));
  const starts = D.filter(([, S]) => S.clip);
  check(starts.length && starts.every(([, S]) => S.clip.dStart <= S.clip.rStart + .3), "no clip starts with the ball's contact point more than R + 0.3 m from the body", starts.map(([n, S]) => [n, r3(S.clip.dStart), r3(S.clip.rStart)]));
  const partOk = withTouch.filter(([, S]) => S.contact && S.touch && ({inside: "foot", sole: "foot", air: "foot", thigh: "thigh", chest: "chest"})[S.contact.part] === S.touch.part);
  check(partOk.length === withTouch.length, "the clip's part is the part the simulation took the ball with", withTouch.map(([n, S]) => [n, S.contact && S.contact.part, S.touch.part]));
  const rel = withTouch.filter(([, S]) => S.released && S.released.dt <= .35 + 1e-6);
  check(rel.length === withTouch.length, "the receive clip hands the body back within 0.35 s of the touch", withTouch.map(([n, S]) => [n, S.released && S.released.dt]));

  // ---------- 4b: a real W pressed at the touch moves the player within 0.35 s ----------
  if (!ONLY || ONLY.includes("lock")){
    await page.evaluate(() => { window.__t6.reset(); window.__t6.start("receive-feet", window.__t6.cfg("receive-feet")); });
    await ready();
    await lockPointer(page);
    await page.waitForFunction(() => { const M = window.__trainRun.RUN.T.ms, me = window.__trainRun.RUN.T.me; return M.events.some(e => e.kind === "touch" && e.how === "control" && e.agent === me.id); }, null, {timeout: 60000, polling: "raf"});
    const t0 = await page.evaluate(() => { const M = window.__trainRun.RUN.T.ms, me = window.__trainRun.RUN.T.me, e = M.events.find(e => e.kind === "touch" && e.how === "control" && e.agent === me.id); return {touch: e.t, now: M.t}; });
    await page.keyboard.down("w");
    const tPress = await page.evaluate(() => window.__trainRun.RUN.T.ms.t);
    await page.waitForFunction(() => window.__trainRun.RUN.T.me.m.target > 0.5, null, {timeout: 30000, polling: "raf"}).catch(() => {});
    const t1 = await page.evaluate(() => ({t: window.__trainRun.RUN.T.ms.t, target: window.__trainRun.RUN.T.me.m.target}));
    await page.keyboard.up("w");
    res.lock = {touch: t0.touch, pressAt: tPress, movedAt: t1.t, target: t1.target, sinceTouch: r3(t1.t - t0.touch), sincePress: r3(t1.t - tPress)};
    check(t1.target > 0.5 && t1.t - tPress <= .35, "a real W pressed at the touch moves the player within 0.35 s (nothing holds him in the touch)", res.lock);
  }

  // ---------- 6: the feeder's first ball, from a passer ----------
  if (!ONLY || ONLY.includes("feed")){
    const FEEDS = [["pass", {opts: {delivery: "ground", speed: 13}}], ["driven", {opts: {delivery: "driven", speed: 20}}], ["cross", {opts: {delivery: "aerial", height: .75}}], ["loft", {opts: {delivery: "aerial", height: 1.25}}]];
    for (const [kind, extra] of FEEDS){
      await page.evaluate(([extra]) => { window.__t6.reset(); window.__t6.start("receive-feet", window.__t6.cfg("receive-feet", Object.assign({mates: true}, extra))); }, [extra]);
      await ready();
      await lockPointer(page);
      await freeze(page);
      const F = await page.evaluate(() => {
        const T6 = window.__t6, Rn = window.__trainRun, L = window.__life, T = Rn.RUN.T, V = T.V, MV = T6.MV;
        let at = null, G = null;
        for (let i = 0; i < 1800; i++){
          L.stepN(1, 1/120);
          G = window.__trainReceive.go();
          if (!G || G.passer < 0) continue;
          const R2 = V.rec[G.passer], C = R2 && R2.h.mv;
          if (!at && C && C.key === "strike" && C.contactDone && R2.clip){
            const k = MV.kindOf(R2.clip.kind), part = MV.KINDS[k].part, p = MV.partPoint(R2.h, part, R2.clip.side);
            const ox = V.ox || 0, oz = V.oz || 0, b = G.feed.f.from;
            const pa = T.ms.agents[G.passer];
            at = {d: Math.hypot(p.x - ox - b.x, p.y - b.y, p.z - oz - b.z), part, kind: R2.clip.kind, side: R2.clip.side, p: [p.x - ox, p.y, p.z - oz], b: [b.x, b.y, b.z], body: [pa.m.x, pa.m.z], tau: C.tau, cball: R2.clip.ball, mode: R2.h.mode};
          }
          if (G.feed.landed && at) break;
        }
        const P = G && G.feed.plan, K = G && G.feed.kick;
        return {at, plan: P && {speed: P.speed, apex: P.apex}, kick: K && {agent: K.agent, speed: K.speed, intent: K.intent}, apex: G && G.feed.apex, passer: G && G.passer, landed: G && G.feed.landed};
      });
      await unfreeze(page);
      res.feeds[kind] = F;
      console.log(`  feed ${kind}: ${JSON.stringify(F)}`);
    }
    const Fs = Object.entries(res.feeds);
    check(Fs.length === 4 && Fs.every(([, F]) => F.kick && F.kick.agent === F.passer && F.passer >= 0), "each first ball is struck by the configured passer himself (his own kick, not the coach's)", Fs.map(([k, F]) => [k, F.kick, F.passer]));
    check(Fs.every(([, F]) => F.kick && F.plan && Math.abs(F.kick.speed - F.plan.speed) <= .02*F.plan.speed), "the launch speed is within 2% of the configured launch", Fs.map(([k, F]) => [k, F.kick && F.kick.speed, F.plan && r3(F.plan.speed)]));
    check(Fs.every(([, F]) => F.plan && F.landed && Math.abs(F.apex - F.plan.apex) <= .05), "the apex is within 5 cm of the configured launch's", Fs.map(([k, F]) => [k, F.apex && r3(F.apex), F.plan && r3(F.plan.apex)]));
    check(Fs.every(([, F]) => F.at && F.at.d <= .12), "the ball leaves the passer's foot at his strike's contact (the striking part within 0.12 m of it)", Fs.map(([k, F]) => [k, F.at && r3(F.at.d), F.at && F.at.part]));
  }

  // ---------- 7: a receive preset, saved, reloaded and loaded by real clicks ----------
  if (!ONLY || ONLY.includes("preset")){
    const C1 = await page.evaluate(() => window.__t6.cfg("receive-feet", {opps: true, keeper: true, opts: {move: "jog", delivery: "lowBounce", from: "left", speed: 14, pressure: "behind", defDist: 3, then: "shoot"}}));
    const def = await page.evaluate(() => window.__t6.cfg("receive-feet"));
    check(JSON.stringify(C1) !== JSON.stringify(def) && C1.opts.speed === 14 && C1.opts.defDist === 3 && C1.opts.from === "left" && C1.opts.delivery === "lowBounce" && C1.opts.move === "jog" && C1.opts.then === "shoot" && C1.opps,
      "the preset's configuration has the non-default values (moving, bouncing from the left at 14 m/s, a defender at 3 m, then a shot)", C1.opts);
    // the digest of the saved setup's activation
    await page.evaluate(([c]) => { window.__t6.reset(); window.__t6.start("receive-feet", c); }, [C1]);
    await ready();
    const dig0 = await page.evaluate(() => { const R = window.__trainRun; return {d: R.digest(), cfg: R.RUN.cur.config}; });
    await page.evaluate(() => window.__trainRun.stopScenario("restart"));
    // Save, by real typing and clicks, in the presets sheet of the receive drills
    await page.evaluate(([c]) => window.__trainPresetUI.openPresets({type: "receive", typeName: "Ball Receiving and First Touch", config: c, scenarioId: "receive-feet"}), [C1]);
    await page.waitForFunction(() => !!document.querySelector("#sheetRoot.open .tp") && window.__trainPresetUI.presetsOpen(), null, {timeout: 15000});
    await clickReal(page, "#tpName");
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Bouncer from the left", {delay: 15});
    await clickReal(page, '#sheetRoot [data-tp="save"]');
    await page.waitForFunction(() => document.querySelectorAll("#sheetRoot .tp-row").length >= 1, null, {timeout: 10000});
    const meta = await page.evaluate(() => [...document.querySelectorAll("#sheetRoot .tp-row")].map(r => ({name: r.querySelector(".tp-name").textContent, meta: r.querySelector(".tp-meta").textContent})));
    await clickReal(page, '#sheetRoot .th-foot [data-tp="close"]');
    await page.waitForFunction(() => !window.__trainPresetUI.presetsOpen(), null, {timeout: 10000});
    // a reload: into Training again by the button, the preset loaded by a real click
    await page.reload();
    await page.waitForFunction(() => typeof newCareer === "function" && !!window.__life && document.readyState !== "loading", null, {timeout: 60000});
    await enterByButton(page);
    await page.evaluate(HELPERS);
    await page.evaluate(() => window.__trainHub.closeHub());
    await page.evaluate(() => window.__trainPresetUI.openPresets({type: "receive", typeName: "Ball Receiving and First Touch", config: null, scenarioId: "receive-feet"}));
    await page.waitForFunction(() => !!document.querySelector("#sheetRoot.open .tp") && document.querySelectorAll("#sheetRoot .tp-row").length >= 1, null, {timeout: 15000});
    const rows = await page.evaluate(() => [...document.querySelectorAll("#sheetRoot .tp-row")].map(r => ({id: r.dataset.row, name: r.querySelector(".tp-name").textContent})));
    const row = rows.find(r => r.name === "Bouncer from the left");
    check(!!row, "after a reload the preset is in the Load list", rows);
    if (row){
      await clickReal(page, `#sheetRoot [data-row="${row.id}"] [data-tp="load"]`);
      await page.waitForFunction(() => { const R = window.__trainRun.RUN; return !!R.cur && !R.switching && !!R.T && !!R.T.V; }, null, {timeout: 120000});
      const dig1 = await page.evaluate(() => { const R = window.__trainRun; return {d: R.digest(), cfg: R.RUN.cur.config, preset: R.RUN.cur.preset}; });
      res.preset = {meta, same: JSON.stringify(dig1.cfg) === JSON.stringify(C1), digest: [dig0.d && dig0.d.hash, dig1.d && dig1.d.hash], parts: dig0.d && dig1.d ? dig0.d.parts.filter((p, i) => p !== dig1.d.parts[i]) : null, preset: dig1.preset};
      check(res.preset.same && JSON.stringify(dig0.cfg) === JSON.stringify(C1), "Load starts the drill with exactly the saved configuration", res.preset);
      check(dig0.d && dig1.d && dig0.d.hash === dig1.d.hash, "the loaded preset's activation digest (RUN.digest) equals the saved setup's", res.preset);
      check(meta.length && /From the left|from the left/.test(meta[0].meta) && /14 m\/s/.test(meta[0].meta), "the Load list says what the preset is (where from, how, how hard)", meta);
    }
  }

  // ---------- 8: the career ----------
  check(!(await trainWrites(page)).length && !(await v2Writes(page)).length, "the write spy logs no freyaFootball.v2 write", await v2Writes(page));
  const careerAfter = await careerSnapshot(page);
  check(careerDiff(careerBefore, careerAfter).length === 0, "the career diff is empty", careerDiff(careerBefore, careerAfter));
} catch(e){ res.errors.push("tr6-receive-anim: " + (e && e.stack || e)); console.log("ERROR", e && e.stack || e); }
finally {
  res.errors.push(...pageErr.map(x => "page: " + x));
  check(!pageErr.length, "zero console and page errors", pageErr.slice(0, 5));
  report("tr6-receive-anim", res);
  await t.close();
}
process.exit(res.errors.length ? 1 : 0);
