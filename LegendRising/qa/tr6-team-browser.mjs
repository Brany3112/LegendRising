// qa/tr6-team-browser.mjs: the team scenarios in the real game, with real input.
// Owner: P6-B (Training Mode Phase 6). Contract: BUILD-PLAN P6-B acceptance "qa/tr6-team-browser.mjs"; TRAINING-SPEC 2
// (team-mate calls subtle: small name tags, audio, no giant arrows; offside), 4 (presets for every scenario) and 5
// (Attacking, Defending, Match scenarios; instant replay).
//   - input bots play two scenarios of each category, each started from the hub by real clicks (Attacking, then the
//     drill's Start), under pointer lock, with real keys (W and Shift held, A or D, a left click), then Backspace starts
//     it again and Esc's pause card takes it back to the hub (a real click on Return to Hub);
//   - a real R press while I am open and onside makes the AI carrier pass to me within 2 s, in at least 4 of 5 tries;
//   - presets: for 'attacking', 'defending' and 'scenarios', a named preset with non-default counts, keeper, role and
//     objective saved by real typing and clicks, the page reloaded, loaded from the hub's Presets: the same
//     configuration, and the activation's RUN.digest() equal to the saved setup's (the Training HUD's preset line apart:
//     it names the preset), and to a load of it before the reload, exactly;
//   - instant replay: a goal scored in Attacking is played back from the replay cameras (the simulation held), Space
//     skips it, and the next go starts;
//   - a scripted offside (my pass to a team-mate standing past their line) shows the offside notice on the Training HUD;
//   - calls: an AI team-mate's call shows a .fp-call with his name, within 160 x 48 px, over him (or on the edge on his
//     bearing), gone within 2 s; the spoken call fires with speech on (an audio spy) and not with it off; no HUD
//     marker over 64 px points at a player or the ball;
//   - the career untouched (write spy, career diff), and no console or page error.
//
//   QA_PORT=8891 node qa/tr6-team-browser.mjs          exits 1 on any failed check; writes qa/out/tr6-team-browser.json
import {report, snap} from "./lib.mjs";
import {trainLaunch, enterByButton, trainWrites, careerSnapshot, careerDiff, clickReal, assertVisible, pressReal, lockPointer, hubUp, frames} from "./tr4b-lib.mjs";

const res = {play:[], call:null, presets:{}, replay:null, offside:null, calls:null, speech:null, markers:null, career:null, errors:[], console:[]};
const check = (ok, what, got) => { if (!ok) res.errors.push(`${what}: ${JSON.stringify(got).slice(0, 1500)}`); console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok ? "" : ": " + JSON.stringify(got).slice(0, 600)}`); };
const wait = (page, fn, arg, t = 60000) => page.waitForFunction(fn, arg, {timeout:t});

// the speech spy (before the page's scripts): a voice to speak with, and every utterance counted
function speechSpy(){
  const said = window.__qaSaid = [];
  const fake = {getVoices:() => [{name:"qa", lang:"en-GB"}], speak:u => { said.push({text:u && u.text, t:performance.now()}); }, cancel(){}, pause(){}, resume(){},
    addEventListener(){}, removeEventListener(){}, speaking:false, pending:false, paused:false, onvoiceschanged:null};
  try { Object.defineProperty(window, "speechSynthesis", {value:fake, configurable:true}); } catch(e){ window.speechSynthesis = fake; }
  // (the headless browser may have no utterance to make: a stand-in with the fields audio.js sets)
  if (typeof window.SpeechSynthesisUtterance !== "function") window.SpeechSynthesisUtterance = function(text){ this.text = text; this.volume = 1; this.rate = 1; this.pitch = 1; };
}

const st = page => page.evaluate(() => {
  const R = window.__trainRun, run = R.RUN.cur, ms = R.RUN.ms;
  const me = ms ? ms.agents[ms.me] : null;
  return {id:run ? run.id : null, state:run ? run.state : null, starts:R.RUN.starts, restarts:R.RUN.restarts, replays:R.RUN.replays, paused:R.RUN.paused,
    t:ms ? ms.t : null, step:ms ? ms.step : null, me:me ? {x:me.m.x, z:me.m.z, speed:me.m.speed} : null, hud:(document.getElementById("trainHud") || {}).textContent || "",
    hub:window.__trainHub.hubOpen(), lock:!!document.pointerLockElement};
});
async function toHubCategory(page, cat){
  if (!(await page.evaluate(() => window.__trainHub.hubOpen()))){
    // nothing plays and the pointer is free: Esc opens the hub (hub.js cageKey)
    await page.evaluate(() => { if (document.pointerLockElement) document.exitPointerLock(); });
    await page.waitForTimeout(200);
    await pressReal(page, "Escape");
    await hubUp(page);
  }
  const on = await page.evaluate(() => window.__trainHub.hubCategory());
  if (on !== cat){
    if (on){ await scrollReal(page, '#sheetRoot [data-th="back"]'); await clickReal(page, '#sheetRoot [data-th="back"]'); await wait(page, () => !window.__trainHub.hubCategory(), null, 10000); }
    await scrollReal(page, `#sheetRoot [data-th="cat"][data-id="${cat}"]`);
    await clickReal(page, `#sheetRoot [data-th="cat"][data-id="${cat}"]`);
    await wait(page, c => window.__trainHub.hubCategory() === c, cat, 10000);
  }
}
// a row of a long list brought into view the player's way: the mouse wheel over the sheet until it is on screen
async function scrollReal(page, sel){
  for (let k = 0; k < 40; k++){
    const r = await page.evaluate(sel => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(), s = document.querySelector("#sheetRoot .sheet");
      const sb = s ? s.getBoundingClientRect() : {top:0, bottom:innerHeight, left:0, width:innerWidth}; const foot = document.querySelector("#sheetRoot .th-foot"), fb = foot && !foot.contains(e) && getComputedStyle(foot).position === "sticky" ? foot.getBoundingClientRect().top : Infinity;
      return {top:b.top, bottom:b.bottom, min:Math.max(0, sb.top) + 8, max:Math.min(innerHeight, sb.bottom, fb) - 8, x:sb.left + sb.width/2}; }, sel);
    if (!r) return false;
    if (r.top >= r.min && r.bottom <= r.max) return true;
    await page.mouse.move(r.x, (r.min + r.max)/2);
    await page.mouse.wheel(0, r.bottom > r.max ? 240 : -240);
    await page.waitForTimeout(80);
  }
  return false;
}
async function startFromHub(page, cat, id){
  await toHubCategory(page, cat);
  const sel = `#sheetRoot [data-th="start"][data-id="${id}"]`;
  await scrollReal(page, sel);
  const v = await assertVisible(page, sel);
  if (!v.ok) throw new Error(`Start of ${id} is not visible: ${v.why}`);
  await clickReal(page, sel);
  await wait(page, id => window.__trainRun.RUN.cur && window.__trainRun.RUN.cur.id === id && window.__trainRun.RUN.ms && window.__trainRun.RUN.ms.step > 2, id, 120000);
  const lk = await lockPointer(page);
  if (!lk) throw new Error("no pointer lock");
  // (the pointer lock click lands as a press in the game: let it pass)
  await page.waitForTimeout(150);
}
// the pause card's Return to Hub, by real keys and clicks
async function backToHub(page){
  await pressReal(page, "Escape");
  await wait(page, () => { const o = document.getElementById("fpOverlay"); return !!o && o.classList.contains("on") && !!o.querySelector('[data-q="hub"]'); }, null, 15000);
  await clickReal(page, '#fpOverlay [data-q="hub"]');
  await wait(page, () => !window.__trainRun.RUN.cur && window.__trainHub.hubOpen(), null, 30000);
}

const t = await trainLaunch({seed:6});
const {page} = t;
await t.context.addInitScript(speechSpy);
page.on("pageerror", e => res.console.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") res.console.push("console: " + m.text()); });
await page.reload();
await page.waitForFunction(() => typeof newCareer === "function" && !!window.__life && document.readyState !== "loading", null, {timeout:60000});
try {
  await enterByButton(page);
  const careerBefore = await careerSnapshot(page);
  // the digest of every start and restart, at the moment the runner tells its listeners
  const digests = async () => page.evaluate(async () => {
    if (window.__qaDig) return;
    const RM = await import("/js/life/train/runner.js"), R = window.__trainRun;
    window.__qaDig = [];
    RM.onRunner(() => { const c = R.RUN.cur; if (c && c.T && c.T.ms && c.T.ms.step === 0) window.__qaDig.push({id:c.id, starts:R.RUN.starts, restarts:R.RUN.restarts, d:R.digest(), config:JSON.parse(JSON.stringify(c.config)), preset:c.preset}); });
  });
  await digests();

  /* ---------- 1. input bots: two scenarios of each category ---------- */
  const PLAY = [["attacking", "att-midfield"], ["attacking", "att-call"], ["defending", "def-1v1"], ["defending", "def-carry"], ["scenarios", "m-2v1"], ["scenarios", "m-overlap"]];
  for (const [cat, id] of PLAY){
    await startFromHub(page, cat, id);
    const s0 = await st(page);
    // the bot: W and Shift held while it turns with the mouse, a step to the side, a left click
    await page.keyboard.down("KeyW"); await page.keyboard.down("ShiftLeft");
    // (held for at least 2 s of play, however slowly this machine draws it)
    for (let k = 0; k < 60; k++){
      await page.mouse.move(640 + (k % 2 ? 40 : -40), 360); await page.waitForTimeout(220);
      const s = await st(page); if (k >= 5 && (s.step - s0.step >= 120 || s.state !== "play")) break;
      // (the pointer let go under load: the pause card is up; a click on the view takes it back, as a player would)
      if (s.paused || !s.lock){ await page.keyboard.up("ShiftLeft"); await page.keyboard.up("KeyW"); if (await page.evaluate(() => !!document.querySelector('#fpOverlay.on [data-q="resume"]'))) await clickReal(page, '#fpOverlay [data-q="resume"]'); await page.waitForTimeout(200); await lockPointer(page); await page.keyboard.down("KeyW"); await page.keyboard.down("ShiftLeft"); }
    }
    await page.keyboard.down(id.startsWith("def") ? "KeyA" : "KeyD"); await page.waitForTimeout(500); await page.keyboard.up(id.startsWith("def") ? "KeyA" : "KeyD");
    await page.mouse.down(); await page.waitForTimeout(120); await page.mouse.up();
    await page.keyboard.up("ShiftLeft"); await page.keyboard.up("KeyW");
    await page.waitForTimeout(400);
    const s1 = await st(page);
    // Backspace: the same go again
    await pressReal(page, "Backspace");
    await wait(page, r => window.__trainRun.RUN.restarts > r || window.__trainRun.RUN.starts > 0 && window.__trainRun.RUN.cur && window.__trainRun.RUN.cur.T.ms.step < 30, s1.restarts, 15000).catch(() => null);
    const s2 = await st(page);
    const moved = s0.me && s1.me ? Math.hypot(s1.me.x - s0.me.x, s1.me.z - s0.me.z) : 0;
    const name = await page.evaluate(id => window.__trainRun.scenario(id).name, id);
    const r = {id, moved:+moved.toFixed(2), steps:s1.step - s0.step, hud:s1.hud.slice(0, 160), restarted:s2.restarts > s1.restarts || (s1.state !== "play" && s2.restarts >= s1.restarts), state:s1.state};
    res.play.push(r);
    check(r.steps > 30 && (moved > 1.5 || s1.state !== "play") && s1.hud.includes(name) && /seconds/.test(s1.hud), `${id}: started from the hub, played with real keys (moved ${r.moved} m), the HUD names it and its objective`, r);
    check(s2.restarts > s1.restarts, `${id}: Backspace starts the go again`, {before:s1.restarts, after:s2.restarts});
    await backToHub(page);
  }

  /* ---------- 2. a real R press: the AI carrier passes to me ---------- */
  {
    await startFromHub(page, "attacking", "att-call");
    const tries = [];
    for (let k = 0; k < 5; k++){
      // the go from its start: Backspace, then R at once
      const n0 = (await st(page)).restarts;
      let ok = false;
      for (let b = 0; b < 3 && !ok; b++){
        if (!(await page.evaluate(() => !!document.pointerLockElement))) await lockPointer(page);
        await pressReal(page, "Backspace");
        ok = await wait(page, n => window.__trainRun.RUN.restarts > n, n0, 30000).then(() => true, () => false);
      }
      if (!ok) throw new Error("Backspace did not restart: " + JSON.stringify(await st(page)) + " " + JSON.stringify(await page.evaluate(() => ({card:!!document.querySelector("#fpOverlay.on"), quick:window.__trainQuick && window.__trainQuick.quickIsOpen()}))));
      await pressReal(page, "KeyR");
      await page.waitForFunction(() => { const ms = window.__trainRun.RUN.ms; const c = ms && ms.events.find(e => e.kind === "call" && e.agent === ms.me); return !!c && (ms.t > c.t + 2.2 || ms.events.some(e => e.kind === "kick" && e.agent >= 0 && e.t >= c.t)); }, null, {timeout:30000}).catch(() => null);
      const r = await page.evaluate(() => {
        const ms = window.__trainRun.RUN.ms, me = ms.me;
        const c = ms.events.find(e => e.kind === "call" && e.agent === me);
        const p = c ? ms.events.find(e => e.kind === "kick" && e.recv === me && e.agent >= 0 && e.t >= c.t - 1e-9 && e.t <= c.t + 2) : null;
        const early = ms.events.find(e => e.kind === "kick" && e.agent >= 0 && (!c || e.t < c.t));
        return {called:!!c, passed:!!p, dt:c && p ? +(p.t - c.t).toFixed(2) : null, early:early ? {recv:early.recv, t:early.t} : null};
      });
      tries.push(r);
    }
    res.call = tries;
    const ok = tries.filter(r => r.called && r.passed).length;
    check(tries.every(r => r.called) && ok >= 4, `a real R press while open and onside: the AI carrier passes to me within 2 s in ${ok} of 5`, tries);
    await backToHub(page);
  }

  /* ---------- 3. calls: the name tag, its size and place, its time; the spoken call on and off; no big markers ---------- */
  {
    const watchCalls = async (secs) => page.evaluate(async secs => {
      const ST = await import("/js/life/core/state.js"), THREE = (await import("/js/life/build.js")).THREE;
      const R = window.__trainRun, out = {calls:[], markers:[]};
      const seen = new Map(), v = new THREE.Vector3();
      const t0 = performance.now();
      // (when each name tag is put in and taken out: the DOM's own record, not the sampling below)
      const life = new Map(), box = document.querySelector(".fp-calls");
      const mo = new MutationObserver(list => { const now = performance.now(); for (const m of list){ for (const n of m.addedNodes) life.set(n, {add:now, rem:null}); for (const n of m.removedNodes){ const L = life.get(n); if (L) L.rem = now; } } });
      if (box) mo.observe(box, {childList:true});
      await new Promise(done => {
        const f = () => {
          const ms = R.RUN.ms, T = R.RUN.T;
          if (ms && T){
            for (const el of document.querySelectorAll(".fp-call")){
              let rec = seen.get(el);
              const ev = [...ms.events].reverse().find(e => e.kind === "call" && e.agent !== ms.me);
              if (!rec){ rec = {first:performance.now(), last:null, name:(el.querySelector("b") || {}).textContent || "", agent:ev ? ev.agent : -1, w:0, h:0, off:[], edge:false}; seen.set(el, rec); out.calls.push(rec); }
              const r = el.getBoundingClientRect();
              rec.w = Math.max(rec.w, r.width); rec.h = Math.max(rec.h, r.height);
              rec.edge = rec.edge || el.classList.contains("edge");
              const a = ms.agents[rec.agent];
              if (a && !el.classList.contains("edge")){
                v.set(a.m.x + T.F.cx, 2.15*(a.scale || 1), a.m.z + T.F.cz).project(ST.RT.cam);
                const cv = ST.RT.renderer.domElement, W = cv.clientWidth, H = cv.clientHeight;
                const px = (v.x + 1)/2*W, py = (1 - v.y)/2*H, cx = r.left + r.width/2, by = r.bottom;
                rec.off.push(Math.round(Math.hypot(px - cx, py - by)));
              }
              rec.alive = true;
            }
            for (const rec of out.calls) if (rec.alive === false && rec.last == null) rec.last = performance.now(); else if (rec.alive) rec.alive = false;
            for (const sel of [".fp-call i", ".fp-ballmark", ".fp-goal", ".fp-goalc"]) for (const el of document.querySelectorAll(sel)){
              const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
              if (r.width && r.height && cs.display !== "none" && cs.visibility !== "hidden" && +cs.opacity > 0) out.markers.push({sel, w:Math.round(r.width), h:Math.round(r.height)});
            }
          }
          if (performance.now() - t0 > secs*1000) done(); else window.__qa.realRAF(f);
        };
        window.__qa.realRAF(f);
      });
      mo.disconnect();
      const els = [...seen.keys()];
      out.calls.forEach((rec, i) => { const L = life.get(els[i]); rec.life = L && L.rem != null ? Math.round(L.rem - L.add) : null; const ms = window.__trainRun.RUN.ms; rec.agentName = ms && ms.agents[rec.agent] ? ms.agents[rec.agent].name : null; });
      out.said = (window.__qaSaid || []).length;
      return out;
    }, secs);
    await page.evaluate(async () => { const C = await import("/js/life/football/control.js"); C.saveSet({speech:true}); Object.assign(C.SET, {speech:true}); });
    await startFromHub(page, "attacking", "att-midfield-mates");
    const said0 = await page.evaluate(() => (window.__qaSaid || []).length);
    const w = await watchCalls(6);
    res.audio = await page.evaluate(async () => { const C = await import("/js/life/football/control.js"); return {utter:typeof SpeechSynthesisUtterance, voices:window.speechSynthesis.getVoices().length, speech:C.SET.speech, ctrl:localStorage.getItem("freyaFootball.ctrl"), act:navigator.userActivation && navigator.userActivation.hasBeenActive}; });
    const calls = w.calls.filter(c => c.name);
    res.calls = {calls:w.calls.slice(0, 6), said:w.said - said0};
    const okCalls = calls.length > 0 && calls.every(c => c.w <= 160 && c.h <= 48 && c.name === c.agentName && (c.edge || c.off.length && Math.max(...c.off) <= 40) && (c.life == null || c.life <= 2000));
    check(okCalls, "an AI team-mate's call shows his name in a .fp-call within 160 x 48 px, over him or on the edge on his bearing, gone within 2 s", res.calls);
    check(w.said - said0 > 0, "the spoken call fires with speech on", {said:w.said - said0});
    const big = w.markers.filter(m => m.w > 64 || m.h > 64);
    res.markers = {n:w.markers.length, big};
    check(!big.length, "no HUD marker over 64 px points at a player or the ball", res.markers);
    await backToHub(page);
    await page.evaluate(async () => { const C = await import("/js/life/football/control.js"); C.saveSet({speech:false}); Object.assign(C.SET, {speech:false}); });
    await startFromHub(page, "attacking", "att-midfield-mates");
    const said1 = await page.evaluate(() => (window.__qaSaid || []).length);
    const w2 = await watchCalls(5);
    res.speech = {on:w.said - said0, off:w2.said - said1, callsOff:w2.calls.length};
    check(w2.calls.length > 0 && w2.said - said1 === 0, "the spoken call stays quiet with speech off (the name tag still shows)", res.speech);
    await page.evaluate(async () => { const C = await import("/js/life/football/control.js"); C.saveSet({speech:true}); Object.assign(C.SET, {speech:true}); });
    await backToHub(page);
  }

  /* ---------- 4. instant replay of a goal ---------- */
  {
    await startFromHub(page, "attacking", "att-keeper");
    const before = await st(page);
    // a scripted goal: the keeper out of the way, the ball struck into the far corner from 7 m (applyLive, between steps)
    await page.evaluate(async () => {
      const B = await import("/js/life/football/ball.js"), R = window.__trainRun;
      R.applyLive(ms => {
        const gk = ms.agents.find(a => a.isGK && a.onPitch); if (gk){ gk.m.x = ms.spec.hx - 1; gk.m.z = 3.4; }
        const b = R.placeBall(ms, {x:ms.spec.hx - 7, y:.11, z:-1}, true);
        B.ballKick(b, {x:24, y:1.2, z:-2.2}, null, {agent:ms.me, team:ms.agents[ms.me].team, kind:"shot", t:ms.t});
        R.ballPlaced(ms);
      });
    });
    await wait(page, () => window.__trainRun.replaying(), null, 30000);
    await page.waitForTimeout(1200);
    const mid = await page.evaluate(async () => {
      const RP = await import("/js/life/football/replay.js"), CAM = await import("/js/life/core/camera.js"), R = window.__trainRun;
      return {playing:RP.playing(), owners:CAM.camOwners(), step:R.RUN.ms.step, replays:R.RUN.replays, state:R.RUN.cur.state};
    });
    await page.waitForTimeout(400);
    const mid2 = await page.evaluate(() => window.__trainRun.RUN.ms.step);
    await pressReal(page, "Space");
    await wait(page, () => !window.__trainRun.replaying() && window.__trainRun.RUN.cur && window.__trainRun.RUN.cur.state === "play", null, 20000);
    const after = await page.evaluate(async () => {
      const CAM = await import("/js/life/core/camera.js"), R = window.__trainRun;
      return {owners:CAM.camOwners(), restarts:R.RUN.restarts, src:!!(R.RUN.T && R.RUN.T.V && R.RUN.T.V.src), state:R.RUN.cur.state};
    });
    res.replay = {before:before.restarts, mid, heldSteps:mid2 - mid.step, after};
    check(mid.playing && mid.owners.includes("replay") && mid.replays >= 1 && mid2 - mid.step <= 4,
      "a goal in Attacking is replayed from the replay cameras while the simulation waits", res.replay);
    check(!after.owners.includes("replay") && !after.src && after.restarts > before.restarts && after.state === "play", "Space skips it and the next go starts, the camera and the view back to the play", res.replay);
    await snap(page, "tr6-replay-after");
    await backToHub(page);
  }

  /* ---------- 5. a scripted offside shows the notice ---------- */
  {
    await startFromHub(page, "scenarios", "m-through");
    await page.evaluate(async () => {
      const A = await import("/js/life/football/actions.js"), R = window.__trainRun;
      R.applyLive(ms => {
        const me = ms.agents[ms.me], mate = ms.agents.find(a => a.team === me.team && !a.isMe && a.role === "player");
        const defs = ms.agents.filter(a => a.team !== me.team && !a.isGK && a.role === "player");
        const line = Math.max(...defs.map(d => d.m.x));
        // my team-mate 5 m past their line, alone; me 9 m behind him with the ball at my feet, facing him
        mate.m.x = line + 5; mate.m.z = 6; mate.m.vx = mate.m.vz = 0; mate.task.run = null;
        me.m.x = mate.m.x - 9; me.m.z = 2; me.m.yaw = me.m.heading = Math.atan2(-(mate.m.x - me.m.x), -(mate.m.z - me.m.z));
        const fx = -Math.sin(me.m.yaw), fz = -Math.cos(me.m.yaw);
        R.placeBall(ms, {x:me.m.x + fx*.45, y:.11, z:me.m.z + fz*.45}, true); R.ballPlaced(ms);
        A.startKick(ms, me, {kind:"pass", target:{x:mate.m.x, y:.11, z:mate.m.z}, recv:mate.id, speed:12, contact:0});
      });
    });
    await wait(page, () => window.__trainRun.RUN.cur && (window.__trainRun.RUN.cur.offNotes || 0) > 0, null, 20000).catch(() => null);
    const o = await page.evaluate(() => ({notes:window.__trainRun.RUN.cur ? window.__trainRun.RUN.cur.offNotes || 0 : 0,
      note:(document.querySelector("#trainHud .thud-note") || {}).textContent || "", ev:window.__trainRun.RUN.ms.events.filter(e => e.kind === "offside").map(e => ({agent:e.agent, margin:e.margin}))}));
    res.offside = o;
    check(o.notes > 0 && /Offside\. Your team-mate was [0-9.]+ m past the last defender\./.test(o.note) && o.ev.length > 0, "a scripted offside shows the offside notice on the Training HUD", o);
    await snap(page, "tr6-offside");
    await backToHub(page);
  }

  /* ---------- 6. presets for attacking, defending and scenarios: save, reload, load ---------- */
  const PRE = [
    ["attacking", "att-midfield", {attackers:3, mates:true, defenders:3, keeper:false, role:"support", opts:{objective:"keep", time:15}}, "Keep ball three"],
    ["defending", "def-1v1", {attackers:2, defenders:2, mates:true, keeper:false, opts:{objective:"clean", time:25}}, "Hold them two"],
    ["scenarios", "m-2v1", {attackers:3, defenders:2, keeper:false, role:"receiver", opts:{objective:"line", time:20, lineD:10}}, "Wing three two"]
  ];
  const saved = {};
  for (const [cat, id, over, name] of PRE){
    await toHubCategory(page, cat);
    const cfg = await page.evaluate(([id, over]) => {
      const H = window.__trainHub, c = H.scenarioConfig(id);
      const m = Object.assign({}, c, over, {opts:Object.assign({}, c.opts, over.opts || {})});
      return H.setScenarioConfig(id, m);
    }, [id, over]);
    // the setup as saved, started once from the hub (its activation digest)
    await scrollReal(page, `#sheetRoot [data-th="start"][data-id="${id}"]`);
    await clickReal(page, `#sheetRoot [data-th="start"][data-id="${id}"]`);
    await wait(page, id => window.__trainRun.RUN.cur && window.__trainRun.RUN.cur.id === id, id, 120000);
    await lockPointer(page);
    const d0 = await page.evaluate(id => [...window.__qaDig].reverse().find(x => x.id === id), id);
    await backToHub(page);
    // Presets (a real click), a name typed, Save
    await scrollReal(page, `#sheetRoot [data-th="presets"][data-id="${id}"]`);
    await clickReal(page, `#sheetRoot [data-th="presets"][data-id="${id}"]`);
    await wait(page, () => !!document.querySelector("#sheetRoot.open .tp") && window.__trainPresetUI.presetsOpen(), null, 15000);
    await clickReal(page, "#tpName");
    await page.keyboard.press("Control+A");
    await page.keyboard.type(name, {delay:15});
    await scrollReal(page, '#sheetRoot [data-tp="save"]');
    await clickReal(page, '#sheetRoot [data-tp="save"]');
    await wait(page, n => [...document.querySelectorAll("#sheetRoot .tp-name")].some(e => e.textContent === n), name, 10000);
    // Load it once now (before the reload), from the list (a real click)
    const row = await page.evaluate(n => [...document.querySelectorAll("#sheetRoot .tp-row")].find(r => r.querySelector(".tp-name").textContent === n).dataset.row, name);
    await scrollReal(page, `#sheetRoot [data-row="${row}"] [data-tp="load"]`);
    await clickReal(page, `#sheetRoot [data-row="${row}"] [data-tp="load"]`);
    await wait(page, id => window.__trainRun.RUN.cur && window.__trainRun.RUN.cur.id === id && window.__trainRun.RUN.cur.preset, id, 120000);
    await lockPointer(page);
    const d1 = await page.evaluate(id => [...window.__qaDig].reverse().find(x => x.id === id && x.preset), id);
    saved[id] = {cfg, d0, d1, name, cat};
    await backToHub(page);
  }
  await page.reload();
  await page.waitForFunction(() => typeof newCareer === "function" && !!window.__life && document.readyState !== "loading", null, {timeout:60000});
  await enterByButton(page);
  await digests();
  for (const [cat, id, , name] of PRE){
    await toHubCategory(page, cat);
    await scrollReal(page, `#sheetRoot [data-th="presets"][data-id="${id}"]`);
    await clickReal(page, `#sheetRoot [data-th="presets"][data-id="${id}"]`);
    await wait(page, () => !!document.querySelector("#sheetRoot.open .tp") && window.__trainPresetUI.presetsOpen(), null, 15000);
    const row = await page.evaluate(n => { const r = [...document.querySelectorAll("#sheetRoot .tp-row")].find(r => r.querySelector(".tp-name").textContent === n); return r ? r.dataset.row : null; }, name);
    if (!row){ check(false, `${cat}: the preset "${name}" is in the Load list after the reload`, null); continue; }
    await scrollReal(page, `#sheetRoot [data-row="${row}"] [data-tp="load"]`);
    await clickReal(page, `#sheetRoot [data-row="${row}"] [data-tp="load"]`);
    await wait(page, id => window.__trainRun.RUN.cur && window.__trainRun.RUN.cur.id === id && window.__trainRun.RUN.cur.preset, id, 120000);
    await lockPointer(page);
    const d2 = await page.evaluate(id => [...window.__qaDig].reverse().find(x => x.id === id && x.preset), id);
    const S = saved[id];
    const parts = d => (d && d.d ? d.d.parts : []).filter(p => !p.startsWith("runner:"));
    const r = {sameConfig:JSON.stringify(d2 && d2.config) === JSON.stringify(S.cfg), digest:d2 && S.d1 && d2.d.hash === S.d1.d.hash,
      setupDigest:JSON.stringify(parts(d2)) === JSON.stringify(parts(S.d0)), preset:d2 && d2.preset, counts:{att:S.cfg.attackers, def:S.cfg.defenders, keeper:S.cfg.keeper, role:S.cfg.role, obj:S.cfg.opts.objective}};
    res.presets[cat] = r;
    check(r.sameConfig && r.digest && r.setupDigest && r.preset && r.preset.name === name,
      `${cat}: a named preset (non-default counts, keeper, role, objective) saved by real typing, reloaded and loaded: the same configuration and the same activation digest`, r);
    await backToHub(page);
  }

  /* ---------- the career untouched; no errors ---------- */
  await page.evaluate(() => { if (window.__trainHub.hubOpen()) window.__trainHub.closeHub(); });
  const careerAfter = await careerSnapshot(page);
  const tw = await trainWrites(page);
  res.career = {writes:tw.length, diff:careerDiff(careerBefore, careerAfter)};
  check(tw.length === 0 && res.career.diff.length === 0, "the career is untouched (write spy, career diff)", res.career);
} catch(e){
  res.errors.push("exception: " + (e && e.stack || e));
  console.log("FAIL exception:", e && e.stack || e);
  try { await snap(page, "tr6-team-browser-fail"); } catch(e2){}
}
const errs = res.console.filter(s => !/favicon|net::ERR/.test(s));
check(errs.length === 0, "no console or page error", errs.slice(0, 10));
await t.close();
report("tr6-team-browser", res);
console.log(`tr6-team-browser: ${res.errors.length ? res.errors.length + " failed" : "all checks pass"}`);
process.exit(res.errors.length ? 1 : 0);
