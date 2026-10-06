/* ============ LIFE core: the tunnel to the match ============
   Owner: WP-0A moves it here, WP-F owns it from Stage 2. Contract: DESIGN 1.2 (tunnel.js), 1.4.1 (the tunnel flag),
   2.2 WP-0A.
   Walking up to the tunnel at the training ground on a match day: the bar shows what is on, the screen darkens as you
   come, and the match starts when you reach it. Back from the final whistle, you walk out of it. */
import {G, LIFE, P, FADE, sync} from "./state.js";
import {note, clockText} from "./hud.js";
import {modeFlags} from "./modes.js";

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
export function tunnel(active = modeFlags().tunnel){
  const bar = document.getElementById("lifeMatch"), fadeEl = document.getElementById("lifeFade");
  const d = Math.hypot(P.x, P.z + 27.2);
  // just back from full time (lifeAfterMatch): quiet until you leave the tunnel's reach or step back into its mouth
  if (TUN.quiet && (d > 11 || d < 1.4)) TUN.quiet = false;
  if (!active || d > 11 || TUN.go || TUN.quiet){ if (bar) bar.classList.remove("on"); if (!TUN.go && fadeEl.dataset.tun){ fadeEl.style.opacity = "0"; FADE.v = 0; delete fadeEl.dataset.tun; } TUN.info = null; return; }
  if (!TUN.info || ++TUN.age > 45){ TUN.info = matchToday(); TUN.age = 0; }
  const info = TUN.info;
  bar.classList.add("on");
  bar.classList.toggle("off", !info.ok);
  bar.querySelector("b").textContent = info.label || (info.ok ? "" : "The tunnel is closed");
  bar.querySelector("span").textContent = info.ok ? (d < 3 ? "Here we go…" : "Match day · walk into the tunnel") : info.why;
  const p = info.ok ? Math.max(0, Math.min(1, 1 - (d - .4)/10)) : 0;
  bar.querySelector("i").style.width = (p*100).toFixed(1) + "%";
  if (info.ok){
    const op = Math.max(0, (3.2 - d)/3.2)*.55;
    FADE.boot = false;
    fadeEl.style.transition = "none"; fadeEl.style.opacity = String(op); fadeEl.dataset.tun = "1"; FADE.v = op;
    if (P.z < -26.75 && Math.abs(P.x) < 2.3){ TUN.go = true; bar.classList.remove("on"); toMatch(); }
  }
}
export function toMatch(){
  const info = matchToday();
  if (!info.ok){ TUN.go = false; return note(info.why); }
  H.stop();
  const o = document.getElementById("lifeFade");
  o.style.transition = "opacity .9s ease"; o.style.opacity = "1"; FADE.v = 1;
  setTimeout(() => {
    document.getElementById("lifeRoot").style.display = "none";
    LIFE.matchEnd = fixtureSlot(info.f).min + MATCH_LEN;
    try { if (typeof A === "object" && A.playFixture) A.playFixture(info.f); } catch(e){ console.error(e); }
    o.style.transition = "opacity .8s ease"; o.style.opacity = "0"; FADE.v = 0; delete o.dataset.tun;
    // if no match started, never leave you staring at a black screen
    if (!document.body.classList.contains("in-match")){
      TUN.go = false; H.resumeLife(); H.place({x:0, z:-21, y:0, yaw:Math.PI});
      note("The match couldn't start. Open the hub (Q) to see what's on.");
    }
  }, 950);
}
// back from the final whistle: out of the tunnel, a couple of hours later, with tired legs
window.lifeAfterMatch = (played) => {
  const s = G();
  const end = LIFE.matchEnd || 21*60;
  if (s.life.min < end) dailyPass(end - s.life.min, "match");
  if (played) S.fatigue = clamp(S.fatigue + played, 0, 100);
  sync(); LIFE.zone = "ground";
  // you come out standing in the tunnel mouth: its "closed" bar would only tell you what you've just done, so it keeps
  // quiet until you walk off (or back into the mouth); and the line saying where you are waits its turn behind the
  // honour cards and toasts full time brings (ui/main.js holds them until now, then they all land at once)
  TUN.quiet = true;
  if (window.startLife) window.startLife({zone:"ground", at:"tunnel", msg:"", later:`Full time. You walk back out of the tunnel. It's ${clockText()}, and the bus home is by the gate.`});
};
