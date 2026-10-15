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
   is paused (the mode pauses on the pointer going). Esc or the cross closes it; Exit to title leaves Training. Back in
   the cage with nothing playing, Esc with the pointer free (so Esc twice while you look about) opens it again, and a
   line at the bottom edge says so (thud.js thudIdle).

   (P4-A, work item 6) Configure opens the configuration sheet (configui.js) for any scenario whose type config.js
   knows, in the hub's place, the pointer staying free in between; its Start starts the scenario with what was set
   there, and the hub's own Start uses the same configuration (startScenario(id, config)). What was set is kept for
   each scenario while you stay in Training (scenarioConfig, setScenarioConfig; presets that last are P4-B's). */
import {screenCover} from "../core/quality.js";
import {CATEGORIES, categoryOf, scenariosOf, scenario, startScenario, stopScenario, restart, replay, RUN, onRunner} from "./runner.js";
import {exitTraining, inTraining} from "./sandbox.js";
import {mode} from "../core/modes.js";
import {thudIdle} from "./thud.js";
import {typeOf, validate, defaults} from "./config.js";
import {openConfig, configOpen} from "./configui.js";

const HUB = {open:false, cat:null, key:null, release:true, cfg:new Map()};
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
    if ((configurable(s) || s.configure) && !other) btns.push(`<button class="btn sm ghost" data-th="config" data-id="${s.id}">Configure</button>`);
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
  idle();
}
// the hub goes (its own buttons, Esc, the cross, the backdrop: main.js closeSheet tells it). release: give the pointer
// back to the game (false when the configuration sheet comes up in its place: the pointer stays free)
export function closeHub(release = true){
  if (!HUB.open) return;
  HUB.release = release;
  // the sheet goes too, even when its slide-in has not happened yet (main.js closeSheet cancels that)
  const r = document.getElementById("sheetRoot");
  if (typeof closeSheet === "function" && r && r.dataset.kind === "trainhub" && (r.classList.contains("open") || r.firstChild)) closeSheet();
  hubClosed();
}
function hubClosed(){
  if (!HUB.open) return;
  const release = HUB.release !== false;
  HUB.open = false; HUB.release = true;
  if (HUB.key){ removeEventListener("keydown", HUB.key, true); HUB.key = null; }
  screenCover(false, "trainhub");
  if (release && window.lifeModalSet) window.lifeModalSet(false);
  idle();
}
// the line on how to get the hub back: only in the cage with nothing playing and neither sheet up
const idle = () => thudIdle(inTraining() && !HUB.open && !configOpen() && !RUN.cur);
// Esc in the cage, the pointer already free and nothing playing: the hub again (a running scenario's Esc is its own,
// the train mode's, which opens the hub on its way out; the hub's own Esc, which closes it, has already been handled)
function cageKey(e){
  if (e.key !== "Escape" || e.repeat || e.defaultPrevented || HUB.open || configOpen() || RUN.cur || !inTraining() || mode() !== "trainsb") return;
  if (document.pointerLockElement || document.querySelector("#sheetRoot.open")) return;
  e.preventDefault();
  openHub();
}
export const hubOpen = () => HUB.open;
export const hubCategory = () => HUB.cat;
const redraw = () => { if (HUB.open && typeof openSheet === "function") openSheet("trainhub"); };

/* ---------- each scenario's configuration (P4-A) ----------
   A scenario whose type config.js knows (registerType) has a configuration: its own starting values (the scenario's
   config, over the type's defaults), then whatever the sheet last set for it in this visit, all through
   config.validate. A scenario of a type config.js does not know keeps its own config as it is. */
const configurable = sc => !!(sc && typeOf(sc.type));
export function scenarioConfig(id){
  const sc = scenario(id); if (!sc) return null;
  if (!configurable(sc)) return sc.config ? JSON.parse(JSON.stringify(sc.config)) : {};
  return validate(sc.type, HUB.cfg.get(id) || sc.config || defaults(sc.type));
}
export function setScenarioConfig(id, config){
  const sc = scenario(id); if (!configurable(sc)) return null;
  const c = validate(sc.type, config);
  HUB.cfg.set(id, c);
  return c;
}
// the configuration sheet for a scenario, with its configuration now (or the one given): Start starts it with what was
// set there, Back comes back to the hub on its category. The hub goes first and the pointer stays free
export function configureScenario(id, config = null){
  const sc = scenario(id); if (!sc) return false;
  if (!configurable(sc)){ if (sc.configure){ closeHub(); sc.configure(); return true; } return false; }
  if (RUN.cur && RUN.cur.id !== id) return false;
  openConfig({type:sc.type, title:sc.name, config:config || scenarioConfig(id),
    onStart:c => { setScenarioConfig(id, c); if (RUN.cur && RUN.cur.id === id) stopScenario("config"); if (!startScenario(id, scenarioConfig(id))) openHub(sc.category); },
    onBack:() => openHub(sc.category)});
  closeHub(false);
  idle();
  return true;
}

// a scenario from the hub: the hub goes, then it starts with its configuration
function start(id){
  const sc = scenario(id); if (!sc) return;
  closeHub();
  if (!startScenario(id, scenarioConfig(id))) openHub(sc.category);
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
  else if (what === "config") configureScenario(id);
  else if (what === "exit"){ closeHub(); exitTraining(); }
}

if (typeof window !== "undefined"){
  window.trainHubHTML = html;
  window.trainHubClosed = hubClosed;
  const root = document.getElementById("sheetRoot");
  if (root) root.addEventListener("click", click);
  // a registration, a start or a stop while it is up: drawn again in place
  onRunner(() => { redraw(); idle(); });
  addEventListener("keydown", cageKey);
  // Esc out of a scenario: the hub, on that scenario's category
  addEventListener("train:scenario", e => { const d = e.detail || {}; if (d.reason === "quit") openHub(d.category); });
  addEventListener("train:exit", () => { if (HUB.open) closeHub(); HUB.cat = null; HUB.cfg.clear(); thudIdle(false); });
  window.__trainHub = {openHub, closeHub, hubOpen, hubCategory, configureScenario, scenarioConfig, setScenarioConfig};
}
