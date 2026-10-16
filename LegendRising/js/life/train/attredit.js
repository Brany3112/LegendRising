/* ============ Training Mode: the attribute editor ============
   Owner: P4-A (Training Mode Phase 4: configuration and attributes). Contract: BUILD-PLAN P4-A work item 3;
   TRAINING-SPEC 4 (attribute editor: the real attributes with their names and ranges; individual edits, current values,
   min and max, reset, the Low, Average, High and Max presets; NPC averages with modest reproducible variation; changes
   affect real behaviour) and G0 decisions (e) my attributes start from the held career's skills, else Average, and (f)
   NPCs vary by their role's profile plus up to 6 either way; lead confirmation: the presets are 35, 55, 75 and 99.

   The editor is part of the configuration sheet (configui.js draws it in and hands it the sheet's clicks and typed
   values). It edits a configuration (config.js) and nothing else:
     me          the 15 career skills (attrs.js EDIT_SKILLS, their names from the career's own list, js/data/game.js
                 SKILLS), 1 to 99, each with its current value, its range, and a reset to its default; the Low,
                 Average, High and Max presets set them all; the values the game works out from them (pace, ball
                 control, agility, strength, balance, defensive awareness: attrs.js derive, the same chain the career
                 uses) are shown read-only and follow every edit
     gk          the keeper's own set (attrs.js gkEditKeys: distribution only once it does something, GK_DISTRIB_LIVE)
     attAvg      the attacking side's computer players' average, defAvg the defending side's
   A typed value is taken on Enter (or when the field is left): a number is rounded and kept to 1..99, anything else
   leaves the old value. Everything here is plain functions of a configuration, so the sheet and the tests use the same
   ones. */
import {EDIT_SKILLS, ATTR_MIN, ATTR_MAX, ATTR_PRESETS, DERIVED_KEYS, gkEditKeys, derivedOf, presetSkills} from "../football/attrs.js";
import {defaults, validate, labelOf} from "./config.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
const copy = v => JSON.parse(JSON.stringify(v));

// the names the player knows (the career's skill list when it is loaded: js/data/game.js SKILLS, a classic script's
// global; the same words here otherwise)
const SKILL_FALLBACK = Object.freeze({power:"Shot power", aero:"Clean strike", curve:"Curve", accuracy:"Accuracy", passing:"Passing",
  passacc:"Pass accuracy", acceleration:"Acceleration", sprintSpeed:"Sprint speed", dribbling:"Dribbling", stamina:"Stamina",
  composure:"Composure", tackling:"Tackling", interception:"Interception", jumping:"Jumping", heading:"Heading"});
export function skillName(k){
  try {
    if (typeof SKILLS !== "undefined" && Array.isArray(SKILLS)){ const r = SKILLS.find(s => s[0] === k); if (r) return r[1]; }
  } catch(e){}
  return SKILL_FALLBACK[k] || k;
}
export const GK_NAMES = Object.freeze({reflex:"Reflexes", dive:"Diving", handling:"Handling", posit:"Positioning", distrib:"Distribution"});
export const DERIVED_NAMES = Object.freeze({pace:"Pace", ctrl:"Ball control", agility:"Agility", strength:"Strength", balance:"Balance", defAware:"Defensive awareness"});
export const PRESETS = Object.freeze([["low", "Low"], ["average", "Average"], ["high", "High"], ["max", "Max"]]);
// G0 decision (f), in plain words: what the averages mean for each player
export const VARIATION_LINE = "Players vary by role, plus up to 6 either way.";

/* ---------- reading and setting a value by its path ('me.<skill>', 'gk.<key>', 'attAvg', 'defAvg') ---------- */
export function attrPaths(){
  return [...EDIT_SKILLS.map(k => "me." + k), ...gkEditKeys().map(k => "gk." + k), "attAvg", "defAvg"];
}
export function getAttr(cfg, path){
  const [a, b] = path.split(".");
  return b ? cfg[a][b] : cfg[a];
}
function setIn(cfg, path, v){
  const c = copy(cfg), [a, b] = path.split(".");
  if (b) c[a][b] = v; else c[a] = v;
  return c;
}
// a typed value: a number rounded and kept to 1..99; anything that is not a number keeps the old one
export function parseAttr(text, old){
  const s = String(text == null ? "" : text).trim();
  if (!/^[-+]?\d+(\.\d+)?$/.test(s)) return old;
  const v = Math.round(+s);
  return Number.isFinite(v) ? clamp(v, ATTR_MIN, ATTR_MAX) : old;
}
// the configuration with one value typed in
export function typeAttr(type, cfg, path, text){
  if (!attrPaths().includes(path)) return cfg;
  const v = parseAttr(text, getAttr(cfg, path));
  return validate(type, setIn(cfg, path, v));
}
// one value back to its default (the others stay)
export function resetAttr(type, cfg, path){
  if (!attrPaths().includes(path)) return cfg;
  return validate(type, setIn(cfg, path, getAttr(defaults(type), path)));
}
// a preset on a whole set: which = 'me' or 'gk', level = 'low' | 'average' | 'high' | 'max'
export function presetAttrs(type, cfg, which, level){
  if (!ATTR_PRESETS[level]) return cfg;
  const c = copy(cfg);
  if (which === "me") c.me = Object.assign({}, c.me, presetSkills(level));
  else if (which === "gk") Object.assign(c.gk, presetSkills(level, gkEditKeys()));
  else return cfg;
  return validate(type, c);
}
// a whole set back to its defaults
export function resetSet(type, cfg, which){
  const d = defaults(type), c = copy(cfg);
  // (my height and preferred foot are not this editor's: they stay as they are)
  if (which === "me"){
    const keep = {};
    for (const k of ["height", "prefFoot"]) if (c.me && c.me[k] != null) keep[k] = c.me[k];
    c.me = Object.assign({}, d.me, keep);
  }
  else if (which === "gk") c.gk = d.gk;
  else return cfg;
  return validate(type, c);
}

/* ---------- the markup ---------- */
function row(path, name, v, dflt){
  return `<div class="ae-row" data-ae-row="${path}">
    <label class="ae-name" for="ae-${path.replace(".", "-")}">${esc(name)}</label>
    <input class="ae-in" id="ae-${path.replace(".", "-")}" data-ae-in="${path}" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="4" value="${v}" aria-label="${esc(name)}, ${ATTR_MIN} to ${ATTR_MAX}">
    <span class="ae-meter" aria-hidden="true"><i style="width:${v}%"></i></span>
    <span class="ae-range muted small"><span class="ae-min">${ATTR_MIN}</span> to <span class="ae-max">${ATTR_MAX}</span></span>
    <button class="ae-reset btn sm ghost" data-ae="reset" data-k="${path}" title="Back to ${dflt}"${v === dflt ? " disabled" : ""}>Reset</button>
  </div>`;
}
const presetRow = which => `<div class="ae-presets" role="group" aria-label="Set them all">${PRESETS.map(([k, n]) =>
  `<button class="btn sm ghost" data-ae="preset" data-set="${which}" data-level="${k}">${n} <span class="muted">${ATTR_PRESETS[k]}</span></button>`).join("")}
  <button class="btn sm ghost" data-ae="resetset" data-set="${which}">Reset all</button></div>`;
export function derivedHTML(cfg){
  const d = derivedOf(cfg.me);
  return DERIVED_KEYS.map(k => `<span class="ae-d" data-ae-d="${k}"><span class="muted">${esc(DERIVED_NAMES[k])}</span> <b>${Math.round(d[k])}</b></span>`).join("");
}

/* the editor's sections for the fields shown (keys: any of 'me', 'gk', 'attAvg', 'defAvg', in that order) */
export function editorHTML(type, cfg, keys){
  const d = defaults(type), out = [];
  if (keys.includes("attAvg") || keys.includes("defAvg")){
    const rows = ["attAvg", "defAvg"].filter(k => keys.includes(k)).map(k => row(k, labelOf(type, k), cfg[k], d[k])).join("");
    out.push(`<section class="ae-sec" data-ae-sec="npc"><h4>The computer's players</h4>${rows}<p class="muted small ae-var">${VARIATION_LINE}</p></section>`);
  }
  if (keys.includes("me")){
    out.push(`<section class="ae-sec" data-ae-sec="me"><h4>${esc(labelOf(type, "me"))}</h4>${presetRow("me")}
      <div class="ae-rows">${EDIT_SKILLS.map(k => row("me." + k, skillName(k), cfg.me[k], d.me[k])).join("")}</div>
      <div class="ae-derived" aria-label="Worked out from these"><span class="muted small">Worked out from these:</span>${derivedHTML(cfg)}</div></section>`);
  }
  if (keys.includes("gk")){
    out.push(`<section class="ae-sec" data-ae-sec="gk"><h4>${esc(labelOf(type, "gk"))}</h4>${presetRow("gk")}
      <div class="ae-rows">${gkEditKeys().map(k => row("gk." + k, GK_NAMES[k], cfg.gk[k], d.gk[k])).join("")}</div></section>`);
  }
  return out.join("");
}

/* a click inside the editor: the new configuration, or null when the click was not the editor's */
export function editorClick(type, cfg, el){
  const b = el && el.closest ? el.closest("[data-ae]") : null;
  if (!b) return null;
  const what = b.dataset.ae;
  if (what === "reset") return resetAttr(type, cfg, b.dataset.k);
  if (what === "preset") return presetAttrs(type, cfg, b.dataset.set, b.dataset.level);
  if (what === "resetset") return resetSet(type, cfg, b.dataset.set);
  return null;
}
/* a typed value taken (Enter, or the field left): the new configuration, or null when the field is not the editor's */
export function editorInput(type, cfg, input){
  const path = input && input.dataset ? input.dataset.aeIn : null;
  if (!path) return null;
  return typeAttr(type, cfg, path, input.value);
}
/* the editor's live parts brought up to date in place (the field just left shows what was taken, the derived values
   follow), without drawing the sheet again: a click that is on its way is not lost */
export function editorSync(root, cfg){
  for (const inp of root.querySelectorAll("[data-ae-in]")){
    if (inp === document.activeElement) continue;
    const v = getAttr(cfg, inp.dataset.aeIn);
    if (String(v) !== inp.value) inp.value = String(v);
    const m = inp.parentElement && inp.parentElement.querySelector(".ae-meter i");
    if (m) m.style.width = v + "%";
  }
  const d = derivedOf(cfg.me);
  for (const s of root.querySelectorAll("[data-ae-d]")){ const b = s.querySelector("b"); if (b) b.textContent = String(Math.round(d[s.dataset.aeD])); }
}
