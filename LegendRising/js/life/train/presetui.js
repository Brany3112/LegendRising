/* ============ Training Mode: the presets sheet ============
   Owner: P4-B (Training Mode Phase 4: presets, quick menu and pause card, reset and replay, pitch switching).
   Contract: BUILD-PLAN P4-B work items 2 and 7; TRAINING-SPEC 4 (Save with a name; Load from a list that says enough
   to tell them apart; Edit and overwrite, asking first; Save as new; Delete, asking first) and 8 (nothing drawn
   behind a sheet).

   openPresets({type, typeName?, config?, scenarioId?, onLoad?, onClose?}) puts the presets of a scenario type up as a
   sheet (the page's own sheet layer, #sheetRoot, with the hub's row styles; the sheet a Training sheet was in, the
   hub's, is told it has gone). config is the setup you have now: with it you can save it under a name, overwrite a
   preset with it, or save it as a new preset next to one. Each row of the list (newest first) gives the name, the type,
   the counts ("3 v 2"), the keeper, the pitch and when it was last changed, and Load, Overwrite, Save as new and
   Delete. Load hands the preset's configuration to onLoad(config, {id, name}) (the configuration sheet, P4-A), or,
   with no onLoad, starts scenarioId with it, named on the Training HUD. Overwrite and Delete ask first (main.js
   confirmBox); No keeps the preset as it was.
   While it is up the 3D view is covered (quality.js screenCover 'trainpreset': nothing is drawn behind it), the
   pointer is free and keys typed into the name fields never reach the game (world.js skips keys typed into a field).
   Esc, the cross, the backdrop and Done close it; onClose() then takes over (the sheet it came from opens again),
   else the hub comes back if it was up, else you are back in the cage.
   It also tells the runner which preset a started configuration is (runner.js setPresetLookup: the stored one that is
   that configuration exactly), so a scenario started from a loaded preset that was not changed is named after it. */
import {screenCover} from "../core/quality.js";
import {FLAGS} from "../core/state.js";
import {list, load, save, overwrite, saveAs, remove, matching, LIMITS} from "./presets.js";
import {RUN, startScenario, setPresetLookup} from "./runner.js";
import {openHub, hubOpen, hubCategory} from "./hub.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
const copy = o => o == null ? o : JSON.parse(JSON.stringify(o));
const KIND = "trainpreset";
const PS = {open:false, o:null, msg:"", asFor:null, key:null, obs:null, hub:null, raf:0};

// "15 Oct, 14:05" (today: "today, 14:05")
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function whenText(t, now = Date.now()){
  const d = new Date(t), n = new Date(now), hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const today = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  return today ? `today, ${hm}` : `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== n.getFullYear() ? " " + d.getFullYear() : ""}, ${hm}`;
}
// what a row says about a preset: the type, the counts, the keeper, the pitch, when it was last changed
export function rowMeta(r, typeName){
  const parts = r.detail ? [typeName || r.type, r.detail] : [typeName || r.type, `${r.att} v ${r.def}`, r.keeper ? "Keeper on" : "Keeper off"];
  if (r.pitchName) parts.push(r.pitchName);
  parts.push(`Updated ${whenText(r.updated)}`);
  return parts.join(" · ");
}

function html(){
  const o = PS.o, rows = list(o.type), canSave = !!o.config;
  const head = `<h2>Presets</h2><p class="muted">${esc(o.typeName)}: setups you've saved to come back to. Only the setup is kept, never how a go went.</p>`;
  const saveRow = canSave ? `<div class="th-sc tp-save"><div><b>Save the setup you have now</b><span class="muted small">Give it a name you'll know it by.</span></div>
      <div class="th-btns"><input id="tpName" class="tp-in" type="text" maxlength="${LIMITS.name}" placeholder="Name" autocomplete="off" aria-label="Preset name">
      <button class="btn sm" data-tp="save">Save</button></div></div>` : "";
  const msg = `<p class="muted small tp-msg" role="status">${esc(PS.msg)}</p>`;
  const body = rows.length ? `<div class="th-list tp-list">${rows.map(r => {
    const as = PS.asFor === r.id;
    const btns = as ? `<input id="tpAsName" class="tp-in" type="text" maxlength="${LIMITS.name}" placeholder="New name" autocomplete="off" aria-label="Name for the new preset" value="${canSave ? "" : esc(r.name + " copy")}">
        <button class="btn sm" data-tp="ascopy" data-id="${r.id}">Save copy</button><button class="btn sm ghost" data-tp="ascancel">Cancel</button>`
      : `<button class="btn sm" data-tp="load" data-id="${r.id}">Load</button>${canSave ? `<button class="btn sm ghost" data-tp="over" data-id="${r.id}">Overwrite</button>` : ""}
        <button class="btn sm ghost" data-tp="as" data-id="${r.id}">Save as new</button><button class="btn sm ghost" data-tp="del" data-id="${r.id}">Delete</button>`;
    return `<div class="th-sc tp-row" data-row="${r.id}"><div><b class="tp-name">${esc(r.name)}</b><span class="muted small tp-meta">${esc(rowMeta(r, o.typeName))}</span></div>
      <div class="th-btns">${btns}</div></div>`;
  }).join("")}</div>` : `<p class="muted small th-none">No presets for this yet.</p>`;
  return `<div class="th tp">${head}${saveRow}${msg}${body}
    <div class="th-foot"><span class="grow"></span><button class="btn ghost" data-tp="close">Done</button></div></div>`;
}
function draw(focus = null){
  const r = document.getElementById("sheetRoot"); if (!r || !PS.open) return;
  const typed = r.querySelector("#tpName"), keep = typed ? typed.value : "";
  const inner = `<div class="sheet-back" data-tp="close"></div><div class="sheet glass">${html()}<button class="sheet-x" data-tp="close" aria-label="Close">✕</button></div>`;
  const sh = r.querySelector(".sheet");
  if (sh && r.dataset.kind === KIND && sh.querySelector(".tp")){ r.classList.add("still"); sh.innerHTML = `${html()}<button class="sheet-x" data-tp="close" aria-label="Close">✕</button>`; }
  else r.innerHTML = inner;
  const n = r.querySelector("#tpName"); if (n && keep) n.value = keep;
  const f = focus && r.querySelector(focus);
  if (f) try { f.focus(); if (f.select) f.select(); } catch(e){}
}
const say = t => { PS.msg = t || ""; draw(); };

/* ---------- open and close ---------- */
export function openPresets(o = {}){
  if (!o || typeof o.type !== "string" || !o.type) return false;
  const r = document.getElementById("sheetRoot"); if (!r) return false;
  const was = PS.open;
  PS.o = {type:o.type, typeName:String(o.typeName || o.type), config:o.config ? copy(o.config) : null, scenarioId:o.scenarioId || null,
    onLoad:typeof o.onLoad === "function" ? o.onLoad : null, onClose:typeof o.onClose === "function" ? o.onClose : null};
  PS.msg = ""; PS.asFor = null;
  // the hub's sheet gives way (it is told it went, as main.js openSheet tells it); it comes back after, unless the
  // caller takes over
  PS.hub = !was && hubOpen() ? {cat:hubCategory()} : was ? PS.hub : null;
  if (!was && r.dataset.kind === "trainhub" && typeof window.trainHubClosed === "function") window.trainHubClosed();
  PS.open = true;
  r.dataset.kind = KIND; r.classList.remove("still");
  draw();
  if (!was){
    screenCover(true, KIND);
    if (window.lifeModalSet) window.lifeModalSet(true);
    if (PS.raf) cancelAnimationFrame(PS.raf);
    // (a sheet closed just before this one empties the layer a moment later unless it is open by then, main.js
    // closeSheet: drawn again here if that happened)
    PS.raf = requestAnimationFrame(() => { PS.raf = 0; if (!PS.open) return; if (!r.querySelector(".tp")) draw(); r.classList.add("open"); });
    r.addEventListener("click", click);
    r.addEventListener("keydown", enter);
    PS.key = e => { if (e.key === "Escape" && PS.open && !tutUp()){ e.preventDefault(); e.stopPropagation(); closePresets(); } };
    addEventListener("keydown", PS.key, true);
    // another sheet put up in its place: this one is gone (nothing of it is kept)
    if (typeof MutationObserver === "function"){
      PS.obs = new MutationObserver(() => { if (PS.open && (r.dataset.kind !== KIND || (!r.classList.contains("open") && !PS.raf))) gone(); });
      PS.obs.observe(r, {attributes:true, attributeFilter:["class", "data-kind"]});
    }
  }
  return true;
}
const tutUp = () => { const t = document.getElementById("tutRoot"); return !!(t && t.classList.contains("on")); };
// taken down (its own close, or another sheet over it): the cover, the listeners and the modal flag go
function gone(){
  if (!PS.open) return null;
  PS.open = false;
  const r = document.getElementById("sheetRoot");
  if (PS.raf){ cancelAnimationFrame(PS.raf); PS.raf = 0; }
  if (PS.obs){ PS.obs.disconnect(); PS.obs = null; }
  if (r){ r.removeEventListener("click", click); r.removeEventListener("keydown", enter); }
  if (PS.key){ removeEventListener("keydown", PS.key, true); PS.key = null; }
  screenCover(false, KIND);
  const o = PS.o; PS.o = null; PS.asFor = null; PS.msg = "";
  return o;
}
/* closed by you (Done, Esc, the cross, the backdrop) or after a Load: then (unless started) the sheet it came from */
export function closePresets({started = false} = {}){
  const r = document.getElementById("sheetRoot");
  const hub = PS.hub; PS.hub = null;
  const o = gone(); if (!o) return false;
  if (r && r.dataset.kind === KIND){ r.classList.remove("open"); r.dataset.kind = ""; setTimeout(() => { if (!r.classList.contains("open") && !r.dataset.kind) r.innerHTML = ""; }, 300); }
  if (started) return true;
  if (o.onClose){ try { o.onClose(); } catch(e){ console.error(e); } return true; }
  if (hub){ openHub(hub.cat); return true; }
  // back in the cage: the pointer comes back, unless a scenario is paused under the sheet (its pause card is next)
  if (RUN.cur) FLAGS.modal = false;
  else if (window.lifeModalSet) window.lifeModalSet(false);
  return true;
}
export const presetsOpen = () => PS.open;

/* ---------- what the buttons do ---------- */
function doSave(){
  const o = PS.o, f = document.getElementById("tpName");
  const name = f ? f.value.trim() : "";
  if (!name){ say("Give it a name first."); draw("#tpName"); return; }
  const r = save(o.type, name, o.config);
  if (f) f.value = "";
  say(r.ok ? `Saved as "${r.rec.name}".` : r.why);
}
function doAsCopy(id){
  const o = PS.o, f = document.getElementById("tpAsName");
  const name = f ? f.value.trim() : "";
  if (!name){ say("Give the new preset a name."); return; }
  const r = saveAs(id, name, o.config);
  PS.asFor = null;
  // (with a setup in hand the new preset holds that setup, as Save does; without one it is a copy of the row)
  say(r.ok ? (o.config ? `Saved the setup you have now as a new preset, "${r.rec.name}".` : `Saved a copy as "${r.rec.name}".`) : r.why);
}
function doLoad(id){
  const o = PS.o, L = load(id);
  if (!L){ say("That preset isn't there any more."); return; }
  const preset = {id:L.id, name:L.name};
  if (o.onLoad){
    const cb = o.onLoad;
    PS.o.onClose = null; PS.hub = null;
    closePresets({started:true});
    cb(copy(L.config), preset);
    return;
  }
  if (o.scenarioId){
    PS.hub = null;
    closePresets({started:true});
    if (window.lifeModalSet) window.lifeModalSet(false);
    if (!startScenario(o.scenarioId, L.config, {preset})) openHub();
    return;
  }
  say("There's nothing to load it into here.");
}
const nameOf = id => { const r = list(PS.o.type).find(x => x.id === id); return r ? r.name : "this preset"; };
function ask(title, text, yes){
  if (typeof confirmBox === "function") confirmBox(esc(title), esc(text), yes);
  else yes();
}
function click(e){
  const b = e.target && e.target.closest && e.target.closest("[data-tp]");
  if (!b || !PS.open) return;
  const what = b.dataset.tp, id = b.dataset.id;
  if (what === "close") closePresets();
  else if (what === "save") doSave();
  else if (what === "load") doLoad(id);
  else if (what === "over") ask("Overwrite this preset?", `"${nameOf(id)}" will be replaced with the setup you have now.`, () => { if (!PS.open) return; const r = overwrite(id, PS.o.config); say(r.ok ? `"${r.rec.name}" now has the setup you have.` : r.why); });
  else if (what === "as"){ PS.asFor = id; PS.msg = ""; draw("#tpAsName"); }
  else if (what === "ascopy") doAsCopy(id);
  else if (what === "ascancel"){ PS.asFor = null; draw(); }
  else if (what === "del") ask("Delete this preset?", `"${nameOf(id)}" will be gone for good.`, () => { if (!PS.open) return; const name = nameOf(id); say(remove(id) ? `"${name}" deleted.` : "That preset isn't there any more."); });
}
// Enter in a name field: the button next to it
function enter(e){
  if (e.key !== "Enter" || !PS.open) return;
  if (e.target && e.target.id === "tpName"){ e.preventDefault(); doSave(); }
  else if (e.target && e.target.id === "tpAsName" && PS.asFor){ e.preventDefault(); doAsCopy(PS.asFor); }
}

// the runner names a scenario after the preset its configuration is
setPresetLookup((type, config) => matching(type, config));
if (typeof addEventListener === "function") addEventListener("train:exit", () => { if (PS.open){ PS.hub = null; const o = gone(); if (o) { const r = document.getElementById("sheetRoot"); if (r && r.dataset.kind === KIND){ r.classList.remove("open"); r.dataset.kind = ""; r.innerHTML = ""; } } } });

// tests (DESIGN 1.4.20 style)
if (typeof window !== "undefined") window.__trainPresetUI = {openPresets, closePresets, presetsOpen, whenText, rowMeta};
