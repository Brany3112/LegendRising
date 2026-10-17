/* ============ Football: the small-sided game's scoreboard ============
   Owner: UF2-B (user fix round 2). Contract: USER-ISSUES.md Round 2 U13 (a small scoreboard, always visible while a
   small-sided game plays: the two sides by name and bib colour, the score, the time left) and U15 (your own side
   obvious: your colour first, marked as yours). Styles: css/train.css, section "small-sided game scoreboard".

   One small panel in the life HUD's top-left column (under the clock and the day's chips, so it never sits over the
   drill card in the middle or the needs on the right), or fixed top-left when that column is not there:

       [ YOU (club colour) 2 - 1 BIBS (bib colour) ]  1:42

   ssgShow({mine: {name, kit}, theirs: {name, kit}, us: 0 | 1, left}) puts it up; ssgFrame(score, left) once a frame
   (score [team 0, team 1] as the simulation keeps it, left: seconds of the game left; the DOM is written only when
   what it shows changes); ssgGoal(team) flashes the side that scored; ssgHide() takes it down. ssgState() is what it
   shows (tests). */

import {clockText} from "./trainspec.js";

const SB = {el:null, us:0, txt:{}, score:[0, 0], left:null, shown:false, flashT:0};
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;"}[c]));
const col = c => typeof c === "number" ? "#" + c.toString(16).padStart(6, "0") : String(c || "#888");

export function ssgShow(o){
  ssgHide();
  if (typeof document === "undefined") return null;
  const d = document.createElement("div");
  d.id = "ssgBoard"; d.className = "ssg-board"; d.setAttribute("role", "status"); d.setAttribute("aria-label", "Score");
  const mine = o.mine || {name:"You", kit:["#2c66b8", "#ffffff"]}, theirs = o.theirs || {name:"Bibs", kit:["#d8ff3a", "#ffffff"]};
  // your side first, whichever way it attacks
  d.innerHTML = `<span class="ssg-side ssg-mine" title="Your team"><i style="background:${esc(col(mine.kit[0]))};border-color:${esc(col(mine.kit[1]))}"></i><b>${esc(mine.name)}</b></span>
    <span class="ssg-score"><span class="ssg-a">0</span><em>-</em><span class="ssg-b">0</span></span>
    <span class="ssg-side ssg-theirs"><b>${esc(theirs.name)}</b><i style="background:${esc(col(theirs.kit[0]))};border-color:${esc(col(theirs.kit[1]))}"></i></span>
    <span class="ssg-time"></span>`;
  const col0 = document.querySelector("#lifeRoot .hud-tl");
  if (col0) col0.appendChild(d); else { d.classList.add("ssg-float"); (document.getElementById("lifeRoot") || document.body).appendChild(d); }
  SB.el = d; SB.us = o.us === 1 ? 1 : 0; SB.score = [-1, -1]; SB.left = null; SB.shown = true; SB.txt = {mine:mine.name, theirs:theirs.name};
  ssgFrame([0, 0], o.left != null ? o.left : null);
  return d;
}

// the score [team 0, team 1] and the seconds left (null: no clock)
export function ssgFrame(score, left){
  const d = SB.el; if (!d) return;
  const a = score[SB.us] | 0, b = score[1 - SB.us] | 0;
  if (a !== SB.score[0] || b !== SB.score[1]){
    SB.score = [a, b];
    d.querySelector(".ssg-a").textContent = String(a);
    d.querySelector(".ssg-b").textContent = String(b);
  }
  const t = left == null ? null : Math.max(0, Math.ceil(left));
  if (t !== SB.left){
    SB.left = t;
    const el = d.querySelector(".ssg-time");
    el.textContent = t == null ? "" : clockText(t);
    el.classList.toggle("low", t != null && t <= 10);
  }
}
// a goal: the side that scored lights up for a moment (team: the simulation's team index)
export function ssgGoal(team){
  const d = SB.el; if (!d) return;
  const k = team === SB.us ? "ssg-for" : "ssg-against";
  d.classList.remove("ssg-for", "ssg-against");
  void d.offsetWidth;
  d.classList.add(k);
  clearTimeout(SB.flashT);
  SB.flashT = setTimeout(() => { if (SB.el === d) d.classList.remove(k); }, 1600);
}
export function ssgHide(){
  clearTimeout(SB.flashT);
  if (SB.el) SB.el.remove();
  SB.el = null; SB.shown = false;
}
// what the board shows (tests): {shown, mine, theirs, score: [yours, theirs], time, visible}
export function ssgState(){
  const d = SB.el;
  if (!d || !d.isConnected) return {shown:false};
  const r = d.getBoundingClientRect();
  return {shown:true, mine:SB.txt.mine, theirs:SB.txt.theirs, score:SB.score.slice(), time:d.querySelector(".ssg-time").textContent,
    box:{x:r.x, y:r.y, w:r.width, h:r.height}, us:SB.us};
}
