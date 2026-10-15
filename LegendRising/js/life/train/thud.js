/* ============ Training Mode: the Training HUD ============
   Owner: P3-B (TR-3, Training Mode Phase 3). Contract: BUILD-PLAN P3-B work item 7; TRAINING-SPEC 2 (HUD minimal) and
   4 (Training UI: small, shows the scenario, role, counts, keeper, preset, the restart, replay and config controls,
   never covers the ball).

   A small card at the top edge of the screen while a scenario plays: its name, your role, how many a side, whether
   there is a keeper, the preset it came from ("No preset" until presets exist), the keys for starting again and for
   the hub (where Replay and the settings are), and a short line when a go is decided. A hint is shown only for
   something that exists. Each frame it checks where the ball is on screen: if the ball would be under the card, the
   card moves to the other side. Between scenarios, with the hub closed, one line at the bottom edge says how to get
   the hub back and that the cones start things (thudIdle). The match HUD (fphud.js) is the one under it; the two together stay under a tenth of
   a 1280 x 720 screen. */
import {THREE} from "../build.js";
import {RT} from "../core/state.js";

const TH = {el:null, side:"left", noteT:0, info:null};
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;"}[c]));
const _v = new THREE.Vector3();

function el(){
  if (TH.el && TH.el.isConnected) return TH.el;
  const d = document.createElement("div");
  d.id = "trainHud"; d.className = "thud left"; d.setAttribute("aria-live", "polite");
  (document.getElementById("lifeRoot") || document.body).appendChild(d);
  TH.el = d; TH.side = "left";
  return d;
}
/* info = {scenario, role, mine, theirs, keeper, preset, lines?: [extra short lines]} */
export function thudShow(info){
  const d = el(); TH.info = info;
  const side = n => `${n}`;
  d.innerHTML = `<b class="thud-name">${esc(info.scenario)}</b>
    <span class="thud-row">${esc(info.role)} · ${side(info.mine)} v ${side(info.theirs)} · ${info.keeper ? "Keeper on" : "No keeper"}</span>
    <span class="thud-row thud-preset">${esc(info.preset || "No preset")}</span>
    ${(info.lines || []).map(l => `<span class="thud-row">${esc(l)}</span>`).join("")}
    <span class="thud-keys"><kbd>Backspace</kbd> start again · <kbd>Esc</kbd> twice for the hub, to replay it or pick another</span>
    <span class="thud-note" hidden></span>`;
  d.hidden = false;
  TH.noteT = 0;
}
export function thudHide(){
  if (TH.el){ TH.el.remove(); TH.el = null; }
  TH.info = null; TH.noteT = 0;
}
// a short line (how a go went): ok green, else amber; it goes after a couple of seconds
export function thudNotice(text, ok = true){
  const d = TH.el; if (!d) return;
  const n = d.querySelector(".thud-note"); if (!n) return;
  n.textContent = text; n.hidden = false; n.className = "thud-note " + (ok ? "good" : "bad");
  TH.noteT = 2.2;
}
// once a frame while a scenario plays (runner.js): the notice's time, and the card kept off the ball
export function thudFrame(T){
  const d = TH.el; if (!d) return;
  if (TH.noteT > 0 && (TH.noteT -= 1/60) <= 0){ const n = d.querySelector(".thud-note"); if (n) n.hidden = true; }
  const cam = RT.cam, bm = T && T.V && T.V.ball && T.V.ball.mesh;
  if (!cam || !bm) return;
  bm.getWorldPosition(_v); _v.project(cam);
  if (_v.z >= 1 || Math.abs(_v.x) > 1 || Math.abs(_v.y) > 1) return;
  const cv = RT.renderer && RT.renderer.domElement, W = cv ? cv.clientWidth : innerWidth, H = cv ? cv.clientHeight : innerHeight;
  const bx = (_v.x + 1)/2*W, by = (1 - _v.y)/2*H, pad = 24;
  const r = d.getBoundingClientRect();
  const under = (x0, x1) => bx > x0 - pad && bx < x1 + pad && by > r.top - pad && by < r.bottom + pad;
  // (moved only when the ball is under it here and would not be under it on the other side)
  if (under(r.left, r.right) && !under(W - r.right, W - r.left)){
    TH.side = TH.side === "left" ? "right" : "left";
    d.classList.toggle("left", TH.side === "left"); d.classList.toggle("right", TH.side === "right");
  }
}
export const thudSide = () => TH.side;

// in the cage with nothing playing and the hub closed (hub.js says when): one small line on how to get the hub back
// (where Exit to title is) and how to start something from the pitch. Gone as soon as a scenario or the hub is up
let IDLE = null;
export function thudIdle(on){
  if (!on){ if (IDLE){ IDLE.remove(); IDLE = null; } return; }
  if (IDLE && IDLE.isConnected) return;
  const d = IDLE = document.createElement("div");
  d.id = "trainIdle"; d.className = "thud-idle";
  d.innerHTML = `<kbd>Esc</kbd> twice for the Training hub, where you can also leave · or walk up to a cone and press <kbd>E</kbd>`;
  (document.getElementById("lifeRoot") || document.body).appendChild(d);
}
