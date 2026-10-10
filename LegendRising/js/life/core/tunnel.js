/* ============ LIFE core: the tunnel to the match ============
   Owner: WP-0A moves it here, WP-F owns it from Stage 2. Contract: DESIGN 1.2 (tunnel.js: matchToday, tunnel(),
   toMatch(), lifeAfterMatch()), 1.4.1 (the tunnel flag), 1.4.16 (toMatch calls FP.enter), 3.4.1 (the match-day window),
   3.4.4 (the interrupted match played out on the next load), 2.2 WP-0A, 2.4 WP-F.
   Walking up to the tunnel at the training ground on a match day: the bar shows what is on, the screen darkens as you
   come, and the match starts when you reach it (football/controller.js FP.enter). Back from the final whistle, you walk
   out of it. This file is also the career's side of the match day for the controller (fpHost): the fixture, the
   line-up and role (match.js matchSetup), the clock, the cards, your kit, the way back. The football modules touch no
   classic global; what the match needs of the career comes through here and through bridge.js. */
import {G, LIFE, P, FADE, sync} from "./state.js";
import {note, clockText} from "./hud.js";
import {modeFlags, mode, persistNow} from "./modes.js";
import {SCHED} from "./sched.js";
import {timeLapse} from "./acts.js";
import {matchFatigue, matchIntensity} from "../stamina.js";
import {bodyLook} from "../look.js";
import {FP, fpHost, recoverCheck} from "../football/controller.js";
import {GROUND} from "../ground.js";

// info: today's match as matchToday() last said; go: you have walked in and the match is starting; quiet: just back
// from full time, so the bar keeps quiet until you leave the tunnel's reach (or step back into its mouth)
export const TUN = {info:null, go:false, age:0, quiet:false};
let H = null;            // world.js: {stop(), resumeLife(), place(p)}
export function tunnelInit(host){ H = host; }

// " · 2–1" for a game already played today, from the world's results
function playedScore(f){ const w = typeof gameWorld === "function" ? gameWorld() : null, d = w && w.done && w.done[f.key]; return d && d.hg != null ? ` · ${d.hg}–${d.ag}` : ""; }
export function matchToday(){
  try {
    const me = meP(), f = todaysFixture();
    if (!f){
      const done = todaysFixture(true), n = nextFixture();
      if (done) return {ok:false, why:`Today's game is done${playedScore(done)}. ${n ? `Next: ${dayName(fixtureSlot(n).wd)} ${clockText(fixtureSlot(n).min)} vs ${oppName(n)}.` : "The bus home is by the gate."}`};
      return {ok:false, why:n ? `No match today. Next: ${dayName(fixtureSlot(n).wd)} ${clockText(fixtureSlot(n).min)} vs ${oppName(n)}.` : "No match today."};
    }
    const ko = fixtureSlot(f).min, label = `${sideName(f, "h")}  vs  ${sideName(f, "a")}`;
    if (me.inj > 0) return {ok:false, why:"You're injured. You'll watch this one from the stand.", label};
    const ban = G().ban || 0;
    if (ban > 0) return {ok:false, why:`You're suspended. ${ban} more match${ban === 1 ? "" : "es"} to sit out.`, label};
    if (LIFE.min < ko - TUNNEL_OPEN) return {ok:false, why:`Kick-off is at ${clockText(ko)}. The tunnel opens at ${clockText(ko - TUNNEL_OPEN)}.`, label, early:true};
    if (LIFE.min > ko + 25) return {ok:false, why:"Too late. The game has kicked off without you.", label};
    return {ok:true, label, f};
  } catch(e){ return {ok:false, why:"No match today."}; }
}
// every frame at the ground. active: false while a mode keeps the tunnel shut (a drill, a cinematic): the bar goes
// where the players' tunnel is at the training ground (ground.js GROUND.tunnel: its spot, the line you cross into it,
// how wide its mouth is); the old ground's numbers until the ground has been built
const OLD_TUNNEL = {x:0, z:-27.2, spawnZ:-27.2, trigger:-26.75, half:2.3};
const tunnelSpec = () => GROUND.tunnel || OLD_TUNNEL;
export function tunnel(active = modeFlags().tunnel){
  const bar = document.getElementById("lifeMatch"), fadeEl = document.getElementById("lifeFade");
  const T = tunnelSpec(), d = Math.hypot(P.x - T.x, P.z - T.z);
  // just back from full time (lifeAfterMatch, which leaves you on the tunnel's spot): quiet until you leave the
  // tunnel's reach or step back into its mouth
  if (TUN.quiet && (d > 11 || (P.z < T.z - .8 && Math.abs(P.x - T.x) < T.half))) TUN.quiet = false;
  if (!active || d > 11 || TUN.go || TUN.quiet){ if (bar) bar.classList.remove("on"); if (!TUN.go && fadeEl.dataset.tun){ fadeEl.style.opacity = "0"; FADE.v = 0; delete fadeEl.dataset.tun; } TUN.info = null; return; }
  if (!TUN.info || ++TUN.age > 45){ TUN.info = matchToday(); TUN.age = 0; }
  const info = TUN.info;
  bar.classList.add("on");
  bar.classList.toggle("off", !info.ok);
  bar.querySelector("b").textContent = info.label || (info.ok ? "" : "The tunnel is closed");
  // (where the match is and how long the trip takes, before you commit to it: 3.4.1)
  bar.querySelector("span").textContent = info.ok ? (meHome(info.f) ? "Head to the match · home, 15 minutes" : "Head to the match · away, 45 minutes on the team bus") : info.why;
  const p = info.ok ? Math.max(0, Math.min(1, 1 - (d - .4)/10)) : 0;
  bar.querySelector("i").style.width = (p*100).toFixed(1) + "%";
  if (info.ok){
    const op = Math.max(0, (3.2 - d)/3.2)*.55;
    FADE.boot = false;
    fadeEl.style.transition = "none"; fadeEl.style.opacity = String(op); fadeEl.dataset.tun = "1"; FADE.v = op;
    if (P.z < T.trigger && Math.abs(P.x - T.x) < T.half){ TUN.go = true; bar.classList.remove("on"); toMatch(); }
  }
}
export function toMatch(){
  const info = matchToday();
  if (!info.ok){ TUN.go = false; return note(info.why); }
  const o = document.getElementById("lifeFade");
  o.style.transition = "opacity .9s ease"; o.style.opacity = "1"; FADE.v = 1;
  LIFE.matchEnd = fixtureSlot(info.f).min + MATCH_LEN;
  // the match day in the stadium (football/controller.js): the travel card, the dressing room, the walk-out, the
  // match, the way back out of this tunnel (lifeAfterMatch). If it cannot start, you are not left in the dark
  setTimeout(() => {
    let ok = false;
    try { ok = FP.enter(info.f); } catch(e){ console.error(e); ok = false; }
    if (!ok){
      const T = tunnelSpec();
      TUN.go = false; H.place({x:T.x, z:T.spawnZ + 6, y:0, yaw:Math.PI});
      o.style.transition = "opacity .8s ease"; o.style.opacity = "0"; FADE.v = 0; delete o.dataset.tun;
      note("The match couldn't start. Open the hub (Q) to see what's on.");
    }
  }, 950);
}

/* ---------- the career's side of the match day (football/controller.js fpHost) ---------- */
const meHome = f => { const me = meP(); return f.kind === "N" ? f.h === me.nat : f.h === me.club; };
// the drinks you may have with you for half time (S.inv, the one food store)
const DRINKS = ["water", "iso", "drink", "max", "shake"];
fpHost({
  setup(f, o = {}){ return matchSetup(f, {late:!!o.late && !o.resume}); },
  kickoff:f => fixtureSlot(f).min,
  now(){ const s = G(); return s && s.life ? s.life.min : LIFE.min; },
  travel:f => meHome(f) ? 15 : 45,
  place:f => ({from:"Training ground", to:meHome(f) ? "Home ground" : sideName(f, "h")}),
  look(kit, number){ const s = G(); try { return bodyLook(s.player.look, "kit", {kit:kit || (MT && MT.myKit), number}); } catch(e){ console.error(e); return null; } },
  drinks(){ const s = G(); return DRINKS.filter(id => typeof FOOD === "object" && FOOD[id]).map(id => ({id, name:FOOD[id].name, n:(s.inv && s.inv[id]) || 0})); },
  htCard:(M, o) => htCardHTML(M, o),
  ftCard:(M, R) => ftCardHTML(M, R),
  // the league's other results this week, played out now as the 2D match did at full time
  around(f){
    try {
      if (f.kind !== "L") return [];
      const list = fixturesAt(S.week).filter(x => x.kind === "L" && x.lg === f.lg && x.key !== f.key && !W.done[x.key]);
      for (const x of list) simFixture(x);
      return list.map(x => { const d = W.done[x.key]; return d ? {h:W.clubs[x.h].nm, a:W.clubs[x.a].nm, hg:d.hg, ag:d.ag} : null; }).filter(Boolean);
    } catch(e){ console.error(e); return []; }
  },
  // back to the life world: the loop stopped (startLife starts it again), the match mirror let go, what full time
  // held back said, out of this tunnel (3.4.3)
  leave(fatigue){
    H.stop();
    try { MT = null; } catch(e){}
    if (typeof save === "function") save();
    if (typeof flushHeldToasts === "function") flushHeldToasts();
    if (typeof renderHub === "function") try { renderHub(); } catch(e){ console.error(e); }
    window.lifeAfterMatch(fatigue);
  },
  // the first five matches of a career show the offside marker by itself (Auto, 1.5.10)
  early(){ const s = G(); return !!(s && s.careerMy && s.careerMy.apps < 5); },
  fixture(key){ try { return (typeof weekFixtures === "function" ? weekFixtures() : []).find(f => f.key === key) || fixturesAt(S.week).find(f => f.key === key) || null; } catch(e){ return null; } },
  clearInMatch(){ const s = G(); if (s && s.life){ delete s.life.inMatch; persistNow(); } },
  // a match played out after a load: the mirror let go, what it held back said, and the day moved on to the match's
  // end (it happened): you are where full time leaves you, outside the ground's tunnel, with a line saying so (3.4.3)
  afterRecover(f, fatigue = 0){
    try { MT = null; } catch(e){}
    LIFE.matchEnd = fixtureSlot(f).min + MATCH_LEN;
    H.stop();
    if (typeof save === "function") save();
    if (typeof flushHeldToasts === "function") flushHeldToasts();
    if (typeof renderHub === "function") try { renderHub(); } catch(e){ console.error(e); }
    window.lifeAfterMatch(fatigue, "Your last match has been played out, and you're back at the training ground.");
    persistNow();
  },
  timeLapse:(mins, label, done, o) => timeLapse(mins, "idle", label, done, o),
  note:t => note(t),
  relock:() => { if (window.lifeRelock) window.lifeRelock(); },
  // the match length (S.speed: 2 Standard, 1 Long, 4 Short; DESIGN D3)
  speed(){ const s = G(); return s && s.speed ? s.speed : 2; },
  setSpeed(v){ const s = G(); if (!s) return; s.speed = v; if (typeof save === "function") save(); }
});
// an interrupted match is played out on the first quiet second after a load (3.4.4)
SCHED.task({id:"fp-resume", hz:1, kind:"keep", run:() => {
  const s = G();
  if (!s || !s.life || !s.life.inMatch || !LIFE.running || mode() !== "life" || document.body.classList.contains("cine")) return;
  try { recoverCheck(); } catch(e){ console.error(e); }
}});
// the fatigue a 2D match leaves, for its caller in ui/main.js (a classic script): what matchRewards recorded in
// A._matchLegs ({mins, drain}) through the one formula there is (stamina.js matchFatigue, 1.5.2), as bridge.finish
// does for R.fatigue
window.lifeMatchFatigue = legs => legs ? matchFatigue(legs.mins, matchIntensity(legs.drain)) : 0;
// back from the final whistle (DESIGN 3.4.3): out of the tunnel, a couple of hours later, with tired legs. fatigue: the
// number the match adds to S.fatigue (bridge.finish R.fatigue for a 3D match; lifeMatchFatigue above for the 2D one)
window.lifeAfterMatch = (fatigue, lead = "Full time. You walk back out of the tunnel.") => {
  const s = G();
  const end = LIFE.matchEnd || 21*60;
  if (s.life.min < end) dailyPass(end - s.life.min, "match");
  if (+fatigue > 0) S.fatigue = clamp(S.fatigue + +fatigue, 0, 100);
  sync(); LIFE.zone = "ground";
  // you come out standing in the tunnel mouth: its "closed" bar would only tell you what you've just done, so it keeps
  // quiet until you walk off (or back into the mouth); and the line saying where you are waits its turn behind the
  // honour cards and toasts full time brings (ui/main.js holds them until now, then they all land at once)
  TUN.quiet = true;
  if (window.startLife) window.startLife({zone:"ground", at:"tunnel", msg:"", later:`${lead} It's ${clockText()}, and the bus home is by the gate.`});
};
