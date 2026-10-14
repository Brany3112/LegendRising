/* ============ Training Mode: the hub ============
   Owner: P3-B (TR-3, Training Mode Phase 3; P4-A owns it from Phase 4). Contract: BUILD-PLAN P3-B work item 2;
   TRAINING-SPEC 4 (Training Hub: Set Pieces, Attacking, Defending, Ball Receiving and First Touch, Match Scenarios,
   Full Match, Free Play; each with a name, a short description, configuration, Start, reset and back to the hub;
   simple, not a dashboard) and 8 (nothing runs behind it).

   One sheet (js/ui/main.js openSheet kind 'trainhub', whose markup this module writes through window.trainHubHTML):
   the seven categories, then a category's own scenarios as the runner has them registered (runner.js
   registerScenario: a later scenario module needs only its line in index.js, never a change here). A category with
   nothing registered yet shows what it is for and no buttons that would do nothing. While the hub is up the 3D view
   is covered (quality.js screenCover: the world skips drawing it, P3-A perf-4), the pointer is free, and any scenario
   is paused (the mode pauses on the pointer going). Esc or the cross closes it; Exit to title leaves Training. */
import {screenCover} from "../core/quality.js";
import {CATEGORIES, categoryOf, scenariosOf, scenario, startScenario, stopScenario, restart, replay, RUN, onRunner} from "./runner.js";
import {exitTraining} from "./sandbox.js";

const HUB = {open:false, cat:null, key:null};
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));

// the sheet's markup (js/ui/main.js openSheet calls it)
function html(){
  const cur = RUN.cur;
  const running = cur ? `<div class="th-run"><span>Playing now: <b>${esc(cur.sc.name)}</b></span>
      <button class="btn sm ghost" data-th="end">End it</button></div>` : "";
  if (!HUB.cat){
    return `<div class="th"><h2>Training</h2><p class="muted">Practise anything on your own pitch. Nothing here touches your career.</p>${running}
      <div class="th-cats">${CATEGORIES.map(c => {
        const n = scenariosOf(c.id).length;
        return `<button class="opt th-cat" data-th="cat" data-id="${c.id}"><b>${esc(c.name)}</b><span class="muted small">${esc(c.desc)}</span>
          <span class="pill">${n ? `${n} to play` : "Coming soon"}</span></button>`;
      }).join("")}</div>
      <div class="th-foot"><span class="muted small">You can also walk up to a cone on the pitch and press E.</span><span class="grow"></span>
        <button class="btn ghost" data-th="exit">Exit to title</button></div></div>`;
  }
  const c = categoryOf(HUB.cat), list = scenariosOf(c.id), last = RUN.last;
  const rows = list.map(s => {
    const playing = cur && cur.id === s.id, other = cur && !playing;
    const btns = [];
    if (s.configure && !other) btns.push(`<button class="btn sm ghost" data-th="config" data-id="${s.id}">Configure</button>`);
    if (playing) btns.push(`<button class="btn sm" data-th="restart" data-id="${s.id}">Start again</button>`, `<button class="btn sm ghost" data-th="end">End it</button>`);
    else if (!other){
      btns.push(`<button class="btn sm" data-th="start" data-id="${s.id}">Start</button>`);
      if (last && last.id === s.id) btns.push(`<button class="btn sm ghost" data-th="replay" data-id="${s.id}">Replay the last one</button>`);
    }
    return `<div class="th-sc"><div><b>${esc(s.name)}</b><span class="muted small">${esc(s.desc)}</span></div>
      <div class="th-btns">${other ? `<span class="muted small">End or reset the one that's playing first.</span>` : btns.join("")}</div></div>`;
  }).join("");
  return `<div class="th"><h2>${esc(c.name)}</h2><p class="muted">${esc(c.desc)}</p>${running}
    ${rows ? `<div class="th-list">${rows}</div>` : `<p class="muted small th-none">Nothing to play here yet.</p>`}
    <div class="th-foot"><button class="btn ghost" data-th="back">Back to hub</button></div></div>`;
}

// the hub up, on a category (or the categories); the view covered, the pointer free
export function openHub(cat = null){
  HUB.cat = categoryOf(cat) ? cat : null;
  const was = HUB.open;
  HUB.open = true;
  if (!was){
    screenCover(true, "trainhub");
    if (window.lifeModalSet) window.lifeModalSet(true);
    HUB.key = e => { if (e.key === "Escape" && HUB.open){ e.preventDefault(); e.stopPropagation(); closeHub(); } };
    addEventListener("keydown", HUB.key, true);
  }
  if (typeof openSheet === "function") openSheet("trainhub");
}
// the hub goes (its own buttons, Esc, the cross, the backdrop: main.js closeSheet tells it)
export function closeHub(){
  if (!HUB.open) return;
  if (typeof closeSheet === "function" && document.querySelector("#sheetRoot.open")) closeSheet(); else hubClosed();
}
function hubClosed(){
  if (!HUB.open) return;
  HUB.open = false;
  if (HUB.key){ removeEventListener("keydown", HUB.key, true); HUB.key = null; }
  screenCover(false, "trainhub");
  if (window.lifeModalSet) window.lifeModalSet(false);
}
export const hubOpen = () => HUB.open;
export const hubCategory = () => HUB.cat;
const redraw = () => { if (HUB.open && typeof openSheet === "function") openSheet("trainhub"); };

// a scenario from the hub: the hub goes, then it starts (a scenario's own configuration comes with P4; until then its
// defaults)
function start(id){
  const sc = scenario(id); if (!sc) return;
  closeHub();
  if (!startScenario(id, sc.config ? JSON.parse(JSON.stringify(sc.config)) : {})) openHub(sc.category);
}
// what the hub's buttons do (one listener on the sheet, by data-th)
function click(e){
  const b = e.target.closest && e.target.closest("[data-th]"); if (!b || !HUB.open) return;
  const what = b.dataset.th, id = b.dataset.id;
  if (what === "cat"){ HUB.cat = id; redraw(); }
  else if (what === "back"){ HUB.cat = null; redraw(); }
  else if (what === "start") start(id);
  else if (what === "restart"){ closeHub(); restart(); }
  else if (what === "replay"){ closeHub(); if (!replay()) openHub(HUB.cat); }
  else if (what === "end"){ stopScenario("quit"); }
  else if (what === "config"){ const sc = scenario(id); if (sc && sc.configure) sc.configure(); }
  else if (what === "exit"){ closeHub(); exitTraining(); }
}

if (typeof window !== "undefined"){
  window.trainHubHTML = html;
  window.trainHubClosed = hubClosed;
  const root = document.getElementById("sheetRoot");
  if (root) root.addEventListener("click", click);
  // a registration, a start or a stop while it is up: drawn again in place
  onRunner(redraw);
  // Esc out of a scenario: the hub, on that scenario's category
  addEventListener("train:scenario", e => { const d = e.detail || {}; if (d.reason === "quit") openHub(d.category); });
  addEventListener("train:exit", () => { if (HUB.open) closeHub(); HUB.cat = null; });
  window.__trainHub = {openHub, closeHub, hubOpen, hubCategory};
}
