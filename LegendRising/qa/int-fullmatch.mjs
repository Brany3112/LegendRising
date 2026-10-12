// qa/int-fullmatch.mjs: one whole first-person match played live, from the training ground's tunnel to walking back
// out of it, nothing headless. Owner: the integrator (Stage P2b); DESIGN 3.4.1 to 3.4.3, 4.8 (the match day end to end).
//
// A career at the ground at kick-off minus 60 walks into the tunnel; the travel card, the dressing room, the walk-out
// and the kick-off follow (wpF-lib toKickoff). Then a bot at the keys plays all of it through the match's own fixed
// steps (your input first, then the simulation, as live play runs them) with a whole world frame (camera, view, HUD,
// the day's phases) after every 10 of them, so 90 minutes take minutes rather than hours under SwiftShader: it follows
// the ball, shoots when it has the ball within 25 m of goal, passes it on otherwise, takes its own restarts, the
// half-time card's "Second half" and the full-time card's "Continue". Checked:
//   - the match reaches full time live (never __fp.headless), through half time and the change of ends;
//   - you were on the ball: kicks of yours in the event log, and the match's own minutes for you;
//   - finaliseMatch applied (the fixture done, MT.my populated), S.life.inMatch cleared, control back at the ground;
//   - the player's displacement per frame never exceeds vmax*dt + 0.01 outside a fade;
//   - zero console and page errors.
//
//   - (P2-A) the half-time and full-time cards are pressed as a player presses them: the pointer held from the kick-off
//     (a real click on the 3D view), each card's button seen (assertVisible: on top at its centre, not under the black
//     cover, not black) and clicked with the real mouse at its on-screen box.
//
//   QA_PORT=8765 node qa/int-fullmatch.mjs      exits 1 on any failed check; writes qa/out/int-fullmatch.json
import {openDay, checker} from "./wpF-lib.mjs";
import {freeze, unfreeze} from "./lib.mjs";
import {clickReal, assertVisible, lockPointer} from "./trlib.mjs";

const {check, done} = checker("int-fullmatch");
const T = await openDay({gfx: "low", role: "starter", before: 60});
const {page} = T;
let ok = false;
const t0 = Date.now();
const SEL = {ht: '.fp-overlay.ht button[data-ht="go"]', ft: '.fp-overlay.ft button[data-ft="go"]'};
try {
  const s0 = await T.toKickoff();
  check(s0.state === "live", "the kick-off, you at your place", s0.state);
  await T.uncover();
  await unfreeze(page); await page.waitForTimeout(800);
  const lk = await lockPointer(page);
  await freeze(page);
  check(!!lk, "the pointer held from the kick-off (a real click on the 3D view)", lk);
  // The bot at the keys, through the match's own fixed steps (__fp.stepN: your input first, then the simulation, as
  // live play does them; no drawing), with one whole world frame (camera, view, HUD, the match day's phases) after
  // every 10 steps. It chases the ball; with it at your feet it shoots from within 25 m of goal (a held LMB let go)
  // and passes it on otherwise (a tapped RMB); at a restart that is yours it turns to the field and taps RMB. A card up
  // stops it: the half-time card's "Second half" and the full-time card's "Continue" are pressed from outside, with the
  // real mouse.
  const BOT = n => {
    const F = window.__fp, L = window.__life, B = window.__bot;
    const R = window.__fr || (window.__fr = {hold: 0, kicks: 0, frames: 0, steps: 0, restartT: 0});
    const out = {card: null};
    const ht = document.querySelector(".fp-overlay.ht button[data-ht=go]"), ft = document.querySelector(".fp-overlay.ft button[data-ft=go]");
    if (ht){ out.card = "ht"; return out; }
    if (ft){
      // (what the match left on MT for the card, read before Continue hands the day back)
      window.__ftMy = typeof MT !== "undefined" && MT && MT.my ? {mins: MT.my.mins, touches: MT.my.touches, goals: MT.my.goals} : null;
      out.card = "ft"; return out;
    }
    const ms = F.ms;
    if (!ms || F.state !== "live"){ B.frame(1); R.frames++; return out; }
    const me = F.me(), P = L.P;
    if (me && me.onPitch){
      const b = ms.ball.p, gx = ms.dirs[me.team]*ms.spec.hx, dg = Math.hypot(gx - me.m.x, me.m.z);
      const mine = ms.poss.ctl === me.id, myRestart = ms.restart && ms.restart.taker === me.id;
      if (myRestart){
        if (R.hold){ F.input({type: "up", button: 0}); R.hold = 0; }
        F.input({type: "keyup", key: "w"});
        P.yaw = Math.atan2(-(gx - b.x), -(-b.z)); P.pitch = -.25;
        if ((R.restartT += n) > 40){ F.input({type: "down", button: 2}); F.input({type: "up", button: 2}); R.restartT = 0; R.kicks++; }
      } else if (mine && dg < 25){
        P.yaw = Math.atan2(-(gx - P.x), -(0 - P.z)); P.pitch = -.05;
        F.input({type: "keydown", key: "w"});
        if (!R.hold){ F.input({type: "down", button: 0}); R.hold = 1; }
        else if ((R.hold += n) > 36){ F.input({type: "up", button: 0}); R.hold = 0; R.kicks++; }
      } else if (mine){
        P.yaw = Math.atan2(-(gx - P.x)*.7, -(-P.z)); P.pitch = -.2;
        F.input({type: "down", button: 2}); F.input({type: "up", button: 2}); R.kicks++;
      } else {
        if (R.hold){ F.input({type: "up", button: 0}); R.hold = 0; }
        const d = Math.hypot(b.x - P.x, b.z - P.z);
        P.yaw = Math.atan2(-(b.x - P.x), -(b.z - P.z));
        F.input({type: d > .8 ? "keydown" : "keyup", key: "w"});
        F.input({type: d > 12 ? "keydown" : "keyup", key: "shift"});
      }
    }
    R.steps += F.stepN(n);
    B.frame(1); R.frames++;
    return out;
  };
  await page.evaluate(`window.__botStep = ${BOT.toString()}`);
  let last = null, halves = new Set(), cards = {ht: 0, ft: 0};
  for (let chunk = 0; chunk < 6000; chunk++){
    const r = await page.evaluate(() => {
      const out = [];
      for (let i = 0; i < 40; i++){ const x = window.__botStep(10); if (x.card){ out.push(x.card); break; } if (window.__life.modes.mode() === "life") break; }
      const ms = window.__fp.ms, R = window.__fr || {};
      // (why you left the pitch, if you did: a card, an injury, a change)
      if (ms && !window.__offWhy && window.__fp.state === "bench"){
        const id = ms.agents.findIndex(a => a.isMe), me = ms.agents[id];
        window.__offWhy = {min: Math.floor((ms.half - 1)*45 + ms.clock.sec/60), sentOff: !!(me && me.sentOff), injured: !!(me && me.injured), subbedOff: !!(me && me.subbedOff),
          ev: ms.events.filter(e => e.agent === id && (e.kind === "card" || e.kind === "injury")).map(e => e.kind + ":" + (e.color || "")).concat(ms.events.filter(e => e.kind === "sub" && e.out === id).map(() => "sub"))};
      }
      return {card: out, st: window.__fp.state, mode: window.__life.modes.mode(), half: ms ? ms.half : null, phase: ms ? ms.phase : null,
        score: ms ? ms.score.slice() : null, min: ms && ms.clock ? Math.floor((ms.half - 1)*45 + (ms.clock.sec || 0)/60) : null, steps: R.steps, frames: R.frames, off: window.__offWhy || null};
    });
    if (r.off && !last?.off) console.log("  you left the pitch:", JSON.stringify(r.off));
    if (r.half != null) halves.add(r.half);
    for (const c of r.card){
      // the card as a player meets it: seen, the pointer let go, the button clicked for real
      const v = await assertVisible(page, SEL[c]);
      const lock = await page.evaluate(() => document.pointerLockElement ? document.pointerLockElement.id : null);
      check(v.ok && lock === null, `the ${c === "ht" ? "half-time" : "full-time"} card: its button seen and the pointer let go`, {why: v.why, top: v.top, lock});
      await clickReal(page, SEL[c]);
      cards[c]++;
      await page.waitForTimeout(400);
    }
    last = r;
    if (chunk % 20 === 0) console.log(`  ${Math.round((Date.now() - t0)/1000)} s: ${r.st} half ${r.half} ${r.phase} minute ${r.min} score ${r.score} steps ${r.steps} frames ${r.frames}`);
    if (r.mode === "life" && cards.ft) break;
  }
  const frames = last ? last.frames : 0;
  const after = await page.evaluate(({key}) => {
    const L = window.__life, rec = window.__bot.rec;
    let worst = -1, bad = 0;
    rec.forEach(r => { if (r.fade >= .98) return; const ex = r.dx - (r.vmax/60 + .01); if (ex > worst) worst = ex; if (ex > 0) bad++; });
    return {doneKey: !!W.done[key], zone: L.LIFE.zone, mode: L.modes.mode(), inMatch: !!S.life.inMatch, last: S.lastMatch || null,
      my: window.__ftMy || null,
      kicks: (window.__fr || {}).kicks || 0, frames: rec.length, worst, bad};
  }, T.info);
  console.log(`  played ${frames} frames in ${Math.round((Date.now() - t0)/1000)} s; halves ${[...halves]}; cards ${JSON.stringify(cards)}; last ${JSON.stringify(last)}`);
  check(cards.ht === 1 && halves.has(2), "half time: the card, then the second half after the change of ends", {cards, halves: [...halves]});
  check(cards.ft === 1, "full time reached live: the full-time card", cards);
  check(after.kicks > 0, "you were on the ball: kicks of your own", after.kicks);
  check(after.doneKey && !!after.last && !after.inMatch, "finaliseMatch applied: the fixture done, the match on the record, S.life.inMatch cleared", after);
  check(!!(after.my && after.my.mins > 0), "MT.my populated with your minutes", after.my);
  check(after.zone === "ground" && after.mode === "life", "control back at the ground", {zone: after.zone, mode: after.mode});
  check(after.bad === 0, "the player's displacement per frame never exceeds vmax*dt + 0.01 outside a fade", {frames: after.frames, worstExcess: +after.worst.toFixed(4)});
  check(page.errors.length === 0, "zero console and page errors", page.errors.slice(0, 5));
  ok = true;
} catch (e){ console.log("FAILED", e.stack || e.message); check(false, "the run finished", String(e.message)); }
await T.close();
process.exit(done() && ok ? 0 : 1);
