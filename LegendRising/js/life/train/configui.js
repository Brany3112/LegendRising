/* ============ Training Mode: the configuration sheet ============
   Owner: P4-A (Training Mode Phase 4: configuration and attributes). Contract: BUILD-PLAN P4-A work item 2 (the sheet,
   built from rows, showing only relevant fields, with a live count preview; screenCover(true, 'trainconfig') while it
   is open); TRAINING-SPEC 4 (shared configuration: my role, initial possession, counts, team-mates and opponents on or
   off, the AI keeper, starting positions, attributes, ball placement and flight, scenario options; only relevant
   settings; every setting changes the real configuration) and 8 (nothing runs behind it).

   openConfig({type, title, config, onStart(config), onBack(), startLabel}) puts the sheet up for a configuration of
   a type (config.js). Each row is a field config.js relevant() lists for the configuration as it is now, so turning
   opponents off takes their count, average and positions away at once; each choice offers exactly config.js
   allowed(). Every change goes through config.validate, and the line at the top says who will be on the pitch and any
   limit the change ran into. The attributes are attredit.js's. Start hands the configuration on (the hub starts the
   scenario with it); Back, Esc or the cross go back without starting.

   While it is up the 3D view is covered (quality.js screenCover: the world skips drawing it, P3-A perf-4), the pointer
   is free, and nothing typed in it reaches the game: its keys stop at the window before any game listener. The sheet
   is a layer of its own (#trainCfg), so the title's sheet code (js/ui/main.js) is not touched. */
import {screenCover} from "../core/quality.js";
import {validate, relevant, allowed, participants, counts, countLine, labelOf, typeOf, FIELDS, SLOTS, ROLE_NAMES, ROLE_SLOT,
  POSSESSION_NAMES, PITCH_NAMES, OUT_NAMES, LAUNCH_KINDS, LAUNCH_NAMES} from "./config.js";
import {editorHTML, editorClick, editorInput, editorSync} from "./attredit.js";
import {setupFromConfig} from "./teams.js";
import {cagePitch} from "../football/cagespec.js";
import {openPresets} from "./presetui.js";

const CF = {open:false, type:null, title:"", cfg:null, notes:[], onStart:null, onBack:null, startLabel:"Start", root:null, key:null};
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
const copy = v => JSON.parse(JSON.stringify(v));
const r2 = v => Math.round(v*100)/100;
const ATTR_KEYS = ["me", "gk", "attAvg", "defAvg"];

/* ---------- values on buttons: a type letter and the value ---------- */
const enc = v => typeof v === "boolean" ? "b:" + v : typeof v === "number" ? "n:" + v : "s:" + v;
const dec = s => { const t = String(s || ""), k = t.slice(0, 2), v = t.slice(2); return k === "b:" ? v === "true" : k === "n:" ? +v : v; };

/* ---------- the rows ---------- */
const NAMES = {role:ROLE_NAMES, possession:POSSESSION_NAMES, pitch:PITCH_NAMES, out:OUT_NAMES};
const seg = (k, values, cur, nameOf) => `<div class="seg wrap" role="group" aria-label="${esc(labelOf(CF.type, k))}">${values.map(v =>
  `<button type="button" data-cf="set" data-k="${k}" data-v="${esc(enc(v))}" aria-pressed="${v === cur}">${esc(nameOf(v))}</button>`).join("")}</div>`;
const onOff = v => v ? "On" : "Off";
const field = (k, body, help) => `<div class="tcfg-row" data-cf-row="${k}"><div class="tcfg-label"><b>${esc(labelOf(CF.type, k))}</b>${help ? `<span class="muted small">${esc(help)}</span>` : ""}</div><div class="tcfg-ctl">${body}</div></div>`;
const numIn = (path, v, label, unit = "m") => `<label class="tcfg-num"><span class="muted small">${esc(label)}</span><input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" maxlength="7" data-cf-in="${path}" value="${v}" aria-label="${esc(label)}"><span class="muted small">${unit}</span></label>`;

function whoName(p, i, c){
  if (p.key === "me") return "You";
  return p.mine ? `Team-mate ${i}` : `Opponent ${i}`;
}
function positionsHTML(c){
  const list = participants(CF.type, c);
  let nMate = 0, nOpp = 0;
  const rows = list.map(p => {
    const i = p.key === "me" ? 0 : p.mine ? ++nMate : ++nOpp;
    const [grp, idx] = p.key === "me" ? ["me", null] : p.key.split(".");
    const spot = grp === "me" ? c.positions.me : c.positions[grp][+idx];
    const path = grp === "me" ? "positions.me" : `positions.${grp}.${idx}`;
    const opts = (grp === "me" ? [["", `Your role's (${ROLE_SLOT[c.role] || "CM"})`]] : []).concat(SLOTS.map(s => [s, s]));
    return `<div class="tcfg-pos" data-cf-pos="${p.key}"><b>${esc(whoName(p, i, c))}</b>
      <select data-cf-in="${path}.slot" aria-label="${esc(whoName(p, i, c))}: position">${opts.map(([v, n]) => `<option value="${v}"${v === spot.slot ? " selected" : ""}>${esc(n)}</option>`).join("")}</select>
      ${numIn(path + ".dx", spot.dx, "Forward")}${numIn(path + ".dz", spot.dz, "Across")}</div>`;
  }).join("");
  return `<div class="tcfg-poslist">${rows}</div>`;
}
function ballHTML(c){
  const at = c.ball.at;
  const mode = seg("ball.mode", ["feet", "placed"], at ? "placed" : "feet", v => v === "feet" ? "At the feet of whoever starts with it" : "Placed");
  return mode + (at ? `<div class="tcfg-nums">${numIn("ball.at.x", at.x, "Forward")}${numIn("ball.at.z", at.z, "Across")}${numIn("ball.at.y", at.y, "Height")}</div>` : "");
}
function launchHTML(c){
  const L = c.ball.launch;
  const mode = seg("launch.kind", ["none", ...LAUNCH_KINDS], L ? L.kind : "none", v => v === "none" ? "None" : LAUNCH_NAMES[v]);
  return mode + (L ? `<div class="tcfg-nums">${numIn("ball.launch.target.x", L.target.x, "To, forward")}${numIn("ball.launch.target.z", L.target.z, "To, across")}${numIn("ball.launch.target.y", L.target.y, "To, height")}
    ${numIn("ball.launch.speed", L.speed, "Speed", "m/s")}${numIn("ball.launch.curl", L.curl, "Curl, -1 to 1", "")}</div>` : "");
}
function optHTML(k, o, c){
  const v = c.opts[k], vals = allowed(CF.type, c, "opt." + k);
  if (o.kind === "bool") return seg("opt." + k, [true, false], v, onOff);
  if (o.kind === "enum") return seg("opt." + k, vals, v, x => (o.values.find(y => y.v === x) || {}).label || String(x));
  if (vals && vals.length <= 12) return seg("opt." + k, vals, v, String);
  return `<div class="tcfg-nums">${numIn("opts." + k, v, o.label || k, o.unit || "")}</div>`;
}
function rowHTML(k, c){
  const S = typeOf(CF.type), F = FIELDS[k] || {};
  if (k.startsWith("opt.")){ const o = S.options[k.slice(4)]; return `<div class="tcfg-row" data-cf-row="${k}"><div class="tcfg-label"><b>${esc(o.label || k.slice(4))}</b>${o.help ? `<span class="muted small">${esc(o.help)}</span>` : ""}</div><div class="tcfg-ctl">${optHTML(k.slice(4), o, c)}</div></div>`; }
  switch (k){
    case "role": case "possession": case "pitch": case "out": return field(k, seg(k, allowed(CF.type, c, k), c[k], v => NAMES[k][v] || v), F.help);
    case "mates": case "opps": case "keeper": case "offside": return field(k, seg(k, [true, false], c[k], onOff), F.help);
    case "attackers": case "defenders": case "wall": return field(k, seg(k, allowed(CF.type, c, k), c[k], String), F.help);
    case "positions": return field(k, positionsHTML(c), F.help);
    case "ball": return field(k, ballHTML(c), "Where it starts, in metres from the middle of the pitch: forward is toward the goal the attackers attack.");
    case "launch": return field(k, launchHTML(c), "How it is played in at the start, from where it is placed to a point you choose.");
  }
  return "";
}
function previewHTML(c){
  const n = counts(CF.type, c), meAtt = n.meSide === "att";
  const who = typeOf(CF.type).match ? "Eleven against eleven, both keepers on"
    : `${countLine(CF.type, c)}. ${n.agents} on the pitch with you, ${meAtt ? "attacking" : "defending"}${n.wall ? `, ${n.wall} of them in the wall` : ""}.`;
  return `<p class="tcfg-preview" data-cf-preview><b>${esc(who)}</b></p>`;
}
const notesHTML = () => `<div class="tcfg-notes" data-cf-notes aria-live="polite">${CF.notes.map(t => `<p class="small">${esc(t)}</p>`).join("")}</div>`;
function bodyHTML(){
  const c = CF.cfg, keys = relevant(CF.type, c);
  const rows = keys.filter(k => !ATTR_KEYS.includes(k)).map(k => rowHTML(k, c)).join("");
  return `<h2>${esc(CF.title)}</h2><p class="muted">Set it up the way you want it. Only what this one uses is here.</p>
    ${previewHTML(c)}${notesHTML()}
    <div class="tcfg-rows">${rows}</div>
    ${editorHTML(CF.type, c, keys.filter(k => ATTR_KEYS.includes(k)))}
    <div class="th-foot tcfg-foot"><button type="button" class="btn ghost" data-cf="back">Back to hub</button>
      <button type="button" class="btn ghost" data-cf="presets">Presets</button><span class="grow"></span>
      <button type="button" class="btn" data-cf="start">${esc(CF.startLabel)}</button></div>`;
}

/* ---------- changes ---------- */
function setPath(c, path, v){
  const parts = path.split("."); let o = c;
  for (let i = 0; i < parts.length - 1; i++){ if (o[parts[i]] == null) return; o = o[parts[i]]; }
  o[parts[parts.length - 1]] = v;
}
const getPath = (c, path) => path.split(".").reduce((o, k) => o == null ? o : o[k], c);
// a change taken: the configuration made safe, with a plain note for every limit it ran into, and for anyone the
// starting positions had to move (teams.js: an attacker who would start offside is moved back onto the line), worked
// out on the pitch it will be played on
function apply(next){
  const notes = [];
  CF.cfg = validate(CF.type, next, notes);
  if (!typeOf(CF.type).match){
    try { for (const t of setupFromConfig(CF.type, CF.cfg, {spec:cagePitch(CF.cfg.pitch)}).notes) if (!notes.includes(t)) notes.push(t); }
    catch(e){ console.error(e); }
  }
  CF.notes = notes;
}
// a button's choice
function choose(k, v){
  const c = copy(CF.cfg);
  if (k === "ball.mode") c.ball.at = v === "placed" ? (c.ball.at || {x:0, y:0.11, z:0}) : null;
  else if (k === "launch.kind"){
    if (v === "none") c.ball.launch = null;
    else c.ball.launch = Object.assign({target:{x:6, y:0.11, z:0}, speed:14, curl:0}, c.ball.launch || {}, {kind:v});
  }
  else if (k.startsWith("opt.")) c.opts[k.slice(4)] = v;
  else c[k] = v;
  apply(c);
}
// a typed value or a picked slot: numbers kept to what the field takes (config.validate clamps), anything else keeps
// the old value
function typed(path, raw){
  const c = copy(CF.cfg), old = getPath(c, path);
  let v;
  if (path.endsWith(".slot")) v = raw;
  else {
    const s = String(raw).trim().replace(",", ".");
    v = /^[-+]?\d+(\.\d+)?$/.test(s) ? r2(+s) : old;
  }
  setPath(c, path, v);
  apply(c);
}

/* ---------- drawing ---------- */
function rootEl(){
  if (CF.root && CF.root.isConnected) return CF.root;
  const r = document.createElement("div");
  r.id = "trainCfg";
  r.setAttribute("role", "dialog"); r.setAttribute("aria-modal", "true");
  r.addEventListener("click", click);
  r.addEventListener("change", change);
  (document.body).appendChild(r);
  CF.root = r;
  return r;
}
function draw(){
  const r = rootEl();
  const sheet = r.querySelector(".tcfg");
  const top = sheet ? sheet.scrollTop : 0;
  r.innerHTML = `<div class="sheet-back" data-cf="back"></div><div class="sheet glass tcfg">${bodyHTML()}<button type="button" class="sheet-x" data-cf="back" aria-label="Back to hub">✕</button></div>`;
  const s2 = r.querySelector(".tcfg"); if (s2) s2.scrollTop = top;
}
// what a value left in a field changes, brought up to date in place (a click on its way is not lost to a redraw)
function sync(){
  const r = CF.root; if (!r) return;
  const p = r.querySelector("[data-cf-preview]"); if (p) p.outerHTML = previewHTML(CF.cfg);
  const n = r.querySelector("[data-cf-notes]"); if (n) n.outerHTML = notesHTML();
  for (const inp of r.querySelectorAll("[data-cf-in]")){
    if (inp === document.activeElement || inp.tagName === "SELECT") continue;
    const v = getPath(CF.cfg, inp.dataset.cfIn);
    if (v != null && String(v) !== inp.value) inp.value = String(v);
  }
  editorSync(r, CF.cfg);
}

function click(e){
  if (!CF.open) return;
  const t = e.target;
  const ed = editorClick(CF.type, CF.cfg, t);
  if (ed){ CF.cfg = ed; CF.notes = []; draw(); return; }
  const b = t.closest ? t.closest("[data-cf]") : null; if (!b) return;
  const what = b.dataset.cf;
  if (what === "set"){ choose(b.dataset.k, dec(b.dataset.v)); draw(); }
  else if (what === "back") back();
  else if (what === "start") start();
  else if (what === "presets") presets();
}
// a field left (or a slot picked)
function change(e){
  if (!CF.open) return;
  const t = e.target;
  if (t.dataset.aeIn){ const c = editorInput(CF.type, CF.cfg, t); if (c){ CF.cfg = c; CF.notes = []; sync(); } return; }
  if (t.dataset.cfIn){
    typed(t.dataset.cfIn, t.value);
    // a new slot moves someone: drawn again; a number only needs its field and the preview
    if (t.tagName === "SELECT") draw(); else sync();
  }
}
// the keys while the sheet is up: none reaches the game. Esc goes back, Enter takes a typed value
function onKey(e){
  if (!CF.open) return;
  e.stopPropagation();
  if (e.type !== "keydown") return;
  if (e.key === "Escape"){ e.preventDefault(); back(); return; }
  const t = e.target;
  if (e.key === "Enter" && t && t.tagName === "INPUT" && CF.root && CF.root.contains(t)){
    e.preventDefault();
    if (t.dataset.aeIn){ const c = editorInput(CF.type, CF.cfg, t); if (c){ CF.cfg = c; CF.notes = []; } }
    else if (t.dataset.cfIn) typed(t.dataset.cfIn, t.value);
    const path = t.dataset.aeIn ? "[data-ae-in=\"" + t.dataset.aeIn + "\"]" : "[data-cf-in=\"" + t.dataset.cfIn + "\"]";
    draw();
    // the same field keeps the focus, showing the value taken
    const again = CF.root.querySelector(path); if (again){ again.focus(); again.select && again.select(); }
  }
}

/* ---------- open and close ---------- */
export function openConfig(o = {}){
  const type = typeOf(o.type) ? o.type : "freeplay";
  CF.type = type; CF.title = o.title || typeOf(type).name;
  apply(o.config || null);
  CF.onStart = typeof o.onStart === "function" ? o.onStart : null; CF.onBack = typeof o.onBack === "function" ? o.onBack : null;
  CF.startLabel = o.startLabel || "Start";
  const was = CF.open;
  CF.open = true;
  if (!was){
    screenCover(true, "trainconfig");
    if (window.lifeModalSet) window.lifeModalSet(true);
    CF.key = onKey;
    addEventListener("keydown", CF.key, true);
    addEventListener("keyup", CF.key, true);
  }
  draw();
  CF.root.classList.add("open");
  return true;
}
// the sheet goes. release: give the pointer back to the game (false when another sheet comes up in its place)
export function closeConfig(release = true){
  if (!CF.open) return false;
  CF.open = false;
  if (CF.key){ removeEventListener("keydown", CF.key, true); removeEventListener("keyup", CF.key, true); CF.key = null; }
  if (CF.root){ CF.root.remove(); CF.root = null; }
  screenCover(false, "trainconfig");
  if (release && window.lifeModalSet) window.lifeModalSet(false);
  return true;
}
function back(){
  const fn = CF.onBack;
  // the hub comes up first, so the pointer never comes back in between
  if (fn){ try { fn(); } catch(err){ console.error(err); } closeConfig(false); }
  else closeConfig(true);
}
function start(){
  const fn = CF.onStart, cfg = validate(CF.type, CF.cfg);
  closeConfig(true);
  if (fn) try { fn(cfg); } catch(err){ console.error(err); }
}
// (integrator, P4-B hook) the presets of this type over the sheet, with the setup as it is now: Load brings the sheet
// back with the preset's configuration (Start then plays it, and the runner names it after the preset while it is
// unchanged); Done, Esc or the cross bring the sheet back as it was. Start and Back keep doing what they did
function presets(){
  const o = {type:CF.type, title:CF.title, onStart:CF.onStart, onBack:CF.onBack, startLabel:CF.startLabel};
  const cfg = validate(CF.type, CF.cfg);
  closeConfig(false);
  const again = c => openConfig(Object.assign({}, o, {config:c}));
  if (!openPresets({type:o.type, typeName:typeOf(o.type).name, config:cfg, onLoad:c => again(c), onClose:() => again(cfg)})) again(cfg);
}
export const configOpen = () => CF.open;
export const configNow = () => CF.open ? copy(CF.cfg) : null;
export const configType = () => CF.open ? CF.type : null;

if (typeof window !== "undefined"){
  // leaving Training takes the sheet with it
  addEventListener("train:exit", () => closeConfig(true));
  window.__trainConfigUI = {openConfig, closeConfig, configOpen, configNow, configType};
}
