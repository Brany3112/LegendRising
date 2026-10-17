/* ============ Training Mode: the quick menu and the pause card ============
   Owner: P4-B (Training Mode Phase 4: presets, quick menu and pause card, reset and replay, pitch switching).
   Contract: BUILD-PLAN Phase 4 "Contracts (P4-B stubs them)", quick.js (addItem({id, label, run, group}),
   quickOpen(), quickClose()) and P4-B work item 3; TRAINING-SPEC 4 (a quick menu: Restart Current Scenario, Replay
   Last Scenario, Return to Configuration, Return to Hub; in Full Match also Reset Current Half and Reset Match, clearly
   told apart). INF-10 (no pause in drills: Esc and losing the pointer ended them).

   While a scenario plays, Esc and the pointer being let go (alt-tab, a click outside) open this card instead of
   ending it: the runner hands training.js a pause callback through its host (runner.js setPauseMenu, HOST.pause), so
   no career code imports this module, and the career's drills and lessons keep what they always did.
   The card is the match's card layer (fphud.js hudOverlay, the half-time card's pattern: a page-level layer above the
   black cover, #lifeFade), drawn with the pointer free. While it is up the simulation does not step (runner.js
   RUN.paused, on top of the world's own pause on a lost pointer) and no key reaches the game: Backspace still restarts
   (G0 lead confirmation), everything else is held back, and every held control is let go (control.js controlRelease)
   so nothing is stuck down when play goes on. Resume takes the pointer back on its own click (the gesture the browser
   asks for); if the browser refuses, the card comes back. A Training sheet already up (the presets, the
   configuration) keeps the card waiting until it goes.
   The items come in groups: 'scenario' (the four of the spec) and 'match', the slot Phase 8 fills with Reset Current
   Half and Reset Match through addItem, under a heading of its own so the two kinds of reset are never mixed up.
   Return to Configuration hands the scenario's current configuration to its own configure(config) when it has one,
   else to whoever listens for 'train:configure' {id, type, category, config} (P4-A's configuration sheet, which calls
   preventDefault), else the hub opens on its category.

   P8-B (Training Mode Phase 8, Full Match): the match's own pause card. A Full Match plays the real match (its 'match'
   mode), not one of the runner's scenarios; when its pointer is let go the controller asks its host for a card
   (controller.js host.pause) and fullmatch.js answers with matchCard(on, {title, preset}): the same card, its Resume and
   the 'match' group's items. An item may ask for a confirmation (item.confirm: the question): its first click shows the
   question with Yes and Cancel, the Yes runs it. The 'scenario' group's items show only while a scenario plays. */
import {RUN, restart, replay, stopScenario, setPauseMenu, setPaused, onRunner} from "./runner.js";
import {openHub, hubOpen} from "./hub.js";
import {hudOverlay} from "../football/fphud.js";
import {controlRelease} from "../football/control.js";
import {pushInput, popInput} from "../core/modes.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
const copy = o => o == null ? o : JSON.parse(JSON.stringify(o));

/* ---------- the items ---------- */
export const GROUPS = Object.freeze([
  Object.freeze({id:"scenario", label:"This scenario"}),
  Object.freeze({id:"match", label:"The match", note:"Reset Current Half plays this half again from its kick-off. Reset Match starts the whole match again."})
]);
const ITEMS = [];
/* item = {id, label, run(), group: 'scenario' | 'match', when?(run) -> bool (shown only then), hint?, order?}. A second
   item with the same id replaces the first. Returns a function that takes it away */
export function addItem(item){
  if (!item || typeof item.id !== "string" || typeof item.run !== "function") throw new Error("addItem: an item needs an id and run()");
  const it = Object.freeze({id:item.id, label:String(item.label || item.id), run:item.run, group:GROUPS.some(g => g.id === item.group) ? item.group : "scenario", confirm:item.confirm ? String(item.confirm) : "",
    when:typeof item.when === "function" ? item.when : null, hint:item.hint ? String(item.hint) : "", order:Number.isFinite(+item.order) ? +item.order : ITEMS.length*10});
  removeItem(it.id);
  ITEMS.push(it);
  ITEMS.sort((a, b) => a.order - b.order);
  if (Q.open && Q.drawn) draw();
  return () => removeItem(it.id);
}
export function removeItem(id){ const i = ITEMS.findIndex(x => x.id === id); if (i >= 0) ITEMS.splice(i, 1); }
const shown = () => ITEMS.filter(it => { try { return !it.when || !!it.when(RUN.cur); } catch(e){ console.error(e); return false; } });
export const items = () => shown().map(it => ({id:it.id, label:it.label, group:it.group, confirm:it.confirm}));
// run a shown item by its id, as a click on the card would (the admin panel's Scenario section); false when not shown
export function runItem(id){
  const it = shown().find(x => x.id === id);
  if (!it) return false;
  try { it.run(RUN.cur); } catch(e){ console.error(e); }
  return true;
}

/* ---------- the card ---------- */
const Q = {open:false, drawn:false, el:null, inp:null, obs:null, lockErr:null, lockOk:null, match:null, confirm:null};
// (a sheet is up, or the presets' sheet is on its way up: it slides in on the next frame)
// (the hub counts from the moment it opens: its sheet slides in a frame later, and a card drawn in that frame would sit
// over the hub and take its clicks)
const sheetUp = () => { const r = document.getElementById("sheetRoot"); return !!r && (r.classList.contains("open") || r.dataset.kind === "trainpreset" || hubOpen()); };

function html(){
  const run = RUN.cur, M = Q.match, list = shown();
  // (a confirmation asked for: the question and its two answers in the card's place)
  const ask = Q.confirm ? list.find(it => it.id === Q.confirm) : null;
  if (ask) return `<div class="fp-box fp-cardbox" tabindex="-1"><div class="fp-box-foot row gap8 center"><button class="btn" data-q="yes">Yes, ${esc(ask.label.toLowerCase())}</button><button class="btn ghost" data-q="cancel">Cancel</button></div>
    <div class="fp-box-body"><div class="eyebrow">${esc(ask.label)}</div><h2>Are you sure?</h2><p>${esc(ask.confirm)}</p></div></div>`;
  const title = M ? M.title : run.sc.name, presetName = M ? M.preset : run.preset ? run.preset.name : null;
  const groups = GROUPS.map(g => {
    const its = list.filter(it => it.group === g.id); if (!its.length) return "";
    return `<div class="fp-qgroup" data-group="${g.id}"><div class="eyebrow">${esc(g.label)}</div>
      <div class="row wrap gap8 center">${its.map(it => `<button class="btn ghost" data-q="${esc(it.id)}"${it.hint ? ` title="${esc(it.hint)}"` : ""}>${esc(it.label)}</button>`).join("")}</div>
      ${g.note && g.id !== "scenario" ? `<p class="muted small">${esc(g.note)}</p>` : ""}</div>`;
  }).join("");
  const preset = presetName ? `Preset: ${esc(presetName)}` : "No preset";
  return `<div class="fp-box fp-cardbox" tabindex="-1"><div class="fp-box-foot row gap8 center"><button class="btn" data-q="resume">Resume</button></div>
    <div class="fp-box-body"><div class="eyebrow">Paused</div><h2>${esc(title)}</h2><p class="muted small">${preset}</p>${groups}
    ${M ? "" : `<p class="muted small">Backspace restarts from here too.</p>`}</div></div>`;
}
function draw(){
  const o = hudOverlay(html(), "card");
  if (!o) return false;
  if (Q.el !== o){ if (Q.el) Q.el.removeEventListener("click", click); o.addEventListener("click", click); Q.el = o; }
  Q.drawn = true;
  const box = o.querySelector(".fp-cardbox");
  if (box && !box.contains(document.activeElement)) try { box.focus({preventScroll:true}); } catch(e){}
  return true;
}
// no key reaches the game while the card is up; Backspace restarts, as it does in play
function input(ev){
  if (!Q.open) return false;
  if (ev.type === "lock") return false;
  if (ev.type === "keydown"){
    if (ev.prevent && (ev.key === "escape" || ev.key === "backspace" || ev.key === "tab" || ev.key === " ")) ev.prevent();
    if (ev.key === "backspace" && !ev.repeat && !Q.match) act("restart");
  }
  return true;
}
// a Training sheet over the game (the presets, the configuration): the card waits until it goes
function watchSheet(on){
  if (!on){ if (Q.obs){ Q.obs.disconnect(); Q.obs = null; } return; }
  if (Q.obs || typeof MutationObserver !== "function") return;
  const r = document.getElementById("sheetRoot"); if (!r) return;
  Q.obs = new MutationObserver(() => { if (Q.open && !Q.drawn && !sheetUp()){ watchSheet(false); draw(); } });
  Q.obs.observe(r, {attributes:true, attributeFilter:["class", "data-kind"]});
}

/* the card up (the pause callback): the simulation held, the pointer let go, the controls let go. Returns true when a
   scenario is playing (the card is up, or waits for a sheet), false when there is nothing to pause */
export function quickOpen(){
  if (!RUN.cur || !RUN.cur.T) return false;
  setPaused(true);
  controlRelease();
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  if (!Q.open){ Q.open = true; Q.inp = input; pushInput(Q.inp); }
  // (a sheet over it: the card, if it was already up, steps aside until the sheet goes)
  if (sheetUp()){ if (Q.drawn) hudOverlay(null); Q.drawn = false; watchSheet(true); return true; }
  if (!Q.drawn) draw();
  return true;
}
/* the card down. resume: play goes on and the pointer is asked back (call it from a click or a key, the gesture the
   browser wants); without it the scenario stays paused (it is being stopped, or something else takes over) */
export function quickClose({resume = false} = {}){
  const was = Q.open;
  if (Q.inp){ popInput(Q.inp); Q.inp = null; }
  watchSheet(false);
  if (Q.el){ Q.el.removeEventListener("click", click); Q.el = null; }
  if (Q.drawn) hudOverlay(null);
  Q.open = false; Q.drawn = false;
  if (resume && RUN.cur){ setPaused(false); relock(); }
  return was;
}
export const quickIsOpen = () => Q.open;

// the pointer back (the world's own lock, world.js lifeRelock); refused, the card comes back
function unwatchLock(){
  if (Q.lockErr){ document.removeEventListener("pointerlockerror", Q.lockErr); Q.lockErr = null; }
  if (Q.lockOk){ document.removeEventListener("pointerlockchange", Q.lockOk); Q.lockOk = null; }
}
function relock(){
  unwatchLock();
  // (a refusal can be the world's first try only: it asks again without the raw-mouse option, world.js lock. The card
  // comes back if, a moment later, the pointer is still not ours)
  Q.lockErr = () => {
    unwatchLock();
    setTimeout(() => { if (RUN.cur && !Q.open && !document.pointerLockElement) quickOpen(); }, 400);
  };
  Q.lockOk = () => { if (document.pointerLockElement) unwatchLock(); };
  document.addEventListener("pointerlockerror", Q.lockErr);
  document.addEventListener("pointerlockchange", Q.lockOk);
  if (typeof window.lifeRelock === "function") window.lifeRelock();
}

/* ---------- what the items do ---------- */
function act(id){
  // (the match's card goes when the controller has the pointer back and says so, host.pause(false): asked here, refused,
  // the card stays up, the way out still on it)
  if (id === "resume"){ if (Q.match){ if (typeof window.lifeRelock === "function") window.lifeRelock(); } else quickClose({resume:true}); return; }
  if (id === "cancel"){ Q.confirm = null; draw(); return; }
  if (id === "yes"){ const c = Q.confirm; Q.confirm = null; const it = shown().find(x => x.id === c); if (it) try { it.run(RUN.cur); } catch(e){ console.error(e); } return; }
  const it = shown().find(x => x.id === id);
  if (!it) return;
  if (it.confirm){ Q.confirm = it.id; draw(); return; }
  try { it.run(RUN.cur); } catch(e){ console.error(e); }
}
/* (P8-B) the match's pause card: on, drawn with the match's items (o = {title, preset}); off, taken down. Returns true
   (the card is the host's: the controller draws none of its own) */
export function matchCard(on, o = {}){
  if (on){
    Q.match = {title:String(o.title || "Full Match"), preset:o.preset || null}; Q.confirm = null;
    if (!Q.open){ Q.open = true; Q.inp = input; pushInput(Q.inp); }
    draw();
    return true;
  }
  if (!Q.match) return true;
  if (Q.inp){ popInput(Q.inp); Q.inp = null; }
  if (Q.el){ Q.el.removeEventListener("click", click); Q.el = null; }
  if (Q.drawn) hudOverlay(null);
  Q.open = false; Q.drawn = false; Q.match = null; Q.confirm = null;
  return true;
}
export const matchCardOpen = () => !!Q.match;
function click(e){
  const b = e.target && e.target.closest && e.target.closest("[data-q]");
  if (!b || !Q.open) return;
  e.preventDefault();
  act(b.dataset.q);
}
// the configuration sheet with this configuration: the scenario's own, else whoever listens, else the hub
function openConfig(sc, config){
  if (sc.configure){ sc.configure(copy(config), {from:"pause"}); return; }
  const ev = new CustomEvent("train:configure", {detail:{id:sc.id, type:sc.type, category:sc.category, config:copy(config)}, cancelable:true});
  dispatchEvent(ev);
  if (!ev.defaultPrevented) openHub(sc.category);
}
const scen = run => !!run;
addItem({id:"restart", label:"Restart Current Scenario", group:"scenario", order:10, hint:"Everything back to how this go started", when:scen,
  run(){ quickClose(); setPaused(false); if (restart()) relock(); else setPaused(true); }});
addItem({id:"replay", label:"Replay Last Scenario", group:"scenario", order:20, hint:"The scenario you played before this one, set up as it was",
  when:run => !!run && !!RUN.last,
  run(){
    quickClose();
    const ok = replay();
    if (!ok) return;
    // (on another pitch the cage is built first: the pointer is asked back once it plays)
    if (RUN.switching) RUN.switching.then(r => { if (r) relock(); });
    else { setPaused(false); relock(); }
  }});
addItem({id:"config", label:"Return to Configuration", group:"scenario", order:30, hint:"Stop here and change the setup", when:scen,
  run(run){ const sc = run.sc; quickClose(); stopScenario("config"); openConfig(sc, run.config); }});
addItem({id:"hub", label:"Return to Hub", group:"scenario", order:40, hint:"Stop here and pick something else", when:scen,
  run(run){ const cat = run.sc.category; quickClose(); stopScenario("hub"); openHub(cat); }});

// the runner's pause callback (Esc, the pointer let go)
setPauseMenu(() => quickOpen());
// the scenario stopped under the card (a pitch change, Training left): the card goes with it
onRunner(() => { if (!RUN.cur){ if (Q.open) quickClose(); unwatchLock(); } });
if (typeof addEventListener === "function") addEventListener("train:exit", () => { if (Q.open) quickClose(); });

// tests (DESIGN 1.4.20 style)
if (typeof window !== "undefined") window.__trainQuick = {addItem, removeItem, items, runItem, quickOpen, quickClose, quickIsOpen, GROUPS, matchCard, matchCardOpen};
