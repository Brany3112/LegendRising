/* ============ Training Mode: the admin panel ============
   Owner: P5-B (Training Mode Phase 5: Free Play and the admin panel). Contract: BUILD-PLAN Phase 5 "Contracts" (admin.js
   listens for the window event 'train:admin' {open} and exports adminOpen(), adminClose() and adminSection(id); the
   runner's applyLive, queueChange and RUN.pending; freeplay's spawnBall(o); the schema fields me.height and
   me.prefFoot) and P5-B work items; TRAINING-SPEC 0 (Numpad 1 or Ctrl+Shift+1, never while typing, Training only) and
   4 (Player: attributes, height, physical traits, reset, presets; Stamina: infinite on/off, restore, set a value; AI:
   attacker and defender averages, the keeper's attributes, active counts where allowed; Ball: spawn or reset, reset
   position, reset scenario, ball options; Scenario and Match: restart, replay last, back to configuration, back to
   hub, reset half, reset match; the formula tunables. Live where safe, otherwise at the next safe state with a note).

   The panel is a sheet on the page's own sheet layer (#sheetRoot, kind 'trainadmin', laid out like the hub), so the
   rest of Training already knows what to do while it is up: the pause card waits under it (quick.js), a scenario that
   plays is held (the runner does not step), the pointer is free and no key reaches the game. Closing it lets play go
   on and takes the pointer back (the pause card comes up instead if the browser refuses the pointer, as on Resume).
   Esc, the cross, the backdrop and Close close it; P5-A's key layer (keys.js) sends 'train:admin' on Numpad 1 or
   Ctrl+Shift+1.

   Every control changes the real thing it names, through the systems that already exist:
     live       attributes (sim.js setAttrs: the same levelling and the mover profile worked out again), the preferred
                foot (agent.js agentFoot), stamina (stamina.js stamInfinite, stamRestore, stamSetBreath), the keeper's
                set (at.gk, which the keeper reads when he acts), the tunables (tune.js TUNE, read at call time), the
                ball put back where the setup placed it. Each goes through the runner's applyLive (between two steps)
                and is also written into the scenario's setup snapshot and its configuration, so Restart, Replay Last
                and Back to Configuration keep it.
     queued     anything that rebuilds the participants: the height (the body is built again), the NPC averages (their
                attribute vectors are made at spawn), the counts and the out-of-play law. They go to the runner's
                queueChange and apply at its next restart, with the note it shows (RUN.pending).
   A control that would change nothing is not shown: no height without the schema field that carries it, no counts or
   averages for a scenario without a configuration, no ball spawn outside Free Play, no match resets outside Full
   Match. The panel never touches the career. */
import {RUN, onRunner, restart, replay, stopScenario, setPaused, applyLive, queueChange, dropChange} from "./runner.js";
import * as QK from "./quick.js";
import {openHub, hubOpen, hubCategory} from "./hub.js";
import {openPresets, presetsOpen} from "./presetui.js";
import {configOpen} from "./configui.js";
import {describe} from "./presets.js";
import {inTraining} from "./sandbox.js";
import {registerType, typeOf, validate, allowed, counts, labelOf, relevant, VERSION, OUT_NAMES} from "./config.js";
import {editorHTML, editorClick, editorInput, skillName} from "./attredit.js";
import {attrsForTraining, EDIT_SKILLS, GK_KEYS, cleanSkills, ATTR_MIN, ATTR_MAX} from "../football/attrs.js";
import {TUNE, TUNE_KEYS, tuneSet, tuneReset} from "../football/tune.js";
import {stamInfinite, stamRestore, stamSetBreath} from "../stamina.js";
import {setAttrs} from "../football/sim.js";
import {agentFoot, footCode} from "../football/agent.js";
import {ballKick} from "../football/ball.js";
import {clearCtl, liveRoll} from "../football/rules.js";
import {viewPreStep} from "../football/view.js";
import {refreshPred} from "../football/actions.js";
import {controlRelease} from "../football/control.js";
import {FLAGS} from "../core/state.js";

const KIND = "trainadmin";
const R = 0.11;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
const copy = o => o == null ? o : JSON.parse(JSON.stringify(o));
const isObj = o => !!o && typeof o === "object" && !Array.isArray(o);

/* ---------- the sections ---------- */
export const SECTIONS = Object.freeze([
  Object.freeze({id:"player", name:"Player"}),
  Object.freeze({id:"stamina", name:"Stamina"}),
  Object.freeze({id:"ai", name:"AI"}),
  Object.freeze({id:"ball", name:"Ball"}),
  Object.freeze({id:"scenario", name:"Scenario"}),
  Object.freeze({id:"tune", name:"Tunables"})
]);
// the tunables in the groups tune.js lists them in (the first key of each group)
const TUNE_GROUPS = Object.freeze([["MAP_STR_POW", "How the duel stats come from the skills"], ["DUEL_WIN", "First to the ball"], ["C_CTRL", "Control zone and first touch"],
  ["S_STR", "Shielding"], ["TR_0", "Tackling"]]);

// the admin's own state. inf: infinite stamina for you (kept over restarts and scenarios until Training is left);
// ms: the simulation the session settings were last applied to; spawn: Free Play's spawn options
const AD = {open:false, sec:"player", msg:"", inf:false, ms:null, spawn:{y:R, v:0}, key:null, obs:null, hub:null, paused:false, start:null};

/* ---------- the runner's admin API (P5-A) ---------- */
// a change safe mid-play, run between two simulation steps (the runner's applyLive)
function live(fn){
  if (!RUN.ms) return false;
  applyLive(fn);
  return true;
}
// a change held until the next safe state ({key, label, apply(config)}): the runner's queueChange, which shows its
// note (RUN.pending). A later change with the same key replaces the earlier one
const queue = ch => queueChange(ch);
const pending = () => Array.isArray(RUN.pending) ? RUN.pending : [];

/* ---------- what is playing ---------- */
const typedRun = run => !!(run && run.sc && typeOf(run.sc.type) && isObj(run.config) && run.config.v === VERSION);
const meAgent = () => { const ms = RUN.ms; return ms && ms.me >= 0 ? ms.agents[ms.me] : null; };
const keepers = ms => ms ? ms.agents.filter(a => a.isGK && a.role === "player" && a.onPitch) : [];
const FOOT_NAME = Object.freeze({R:"Right", L:"Left", B:"Both"});
// the look editor's height range, as a whole-body scale (daily.js LOOK_OPT, a classic script's global), in metres
// (a 1.80 m body at scale 1, as the look editor shows it)
const BASE_H = 1.8;
function heightRange(){
  let r = [0.92, 1.08];
  try { if (typeof LOOK_OPT !== "undefined" && LOOK_OPT.height && LOOK_OPT.height.length === 2) r = LOOK_OPT.height; } catch(e){}
  return [Math.round(r[0]*BASE_H*100), Math.round(r[1]*BASE_H*100)];
}
// whether the configuration carries the height and the preferred foot (P5-A's schema fields): without them a height
// set here would reach nothing, so it is not offered
function schemaHas(field, v){
  try { const c = validate("player", {me:{[field]:v}}); return !!(c && c.me && c.me[field] === v); } catch(e){ return false; }
}
const heightOK = () => schemaHas("height", 1.9);
const footInConfig = () => schemaHas("prefFoot", "Left");

// my skills as they are now: the playing agent's (the editor's 15), else the last ones the panel set
function mySkills(){
  const a = meAgent();
  if (a && a.at) return cleanSkills(a.at, null);
  return null;
}
const myFoot = () => { const a = meAgent(); return a ? FOOT_NAME[a.foot] || "Right" : null; };
function myHeight(){
  const run = RUN.cur, a = meAgent();
  const h = run && isObj(run.config) && isObj(run.config.me) && Number.isFinite(+run.config.me.height) ? +run.config.me.height : null;
  if (h) return Math.round(h*100);
  return a ? Math.round((a.scale || 1)*BASE_H*100) : null;
}

/* ---------- the changes ---------- */
// my attributes, live: the agent gets them now, the setup and the configuration keep them
function setMe(skills){
  const s = cleanSkills(skills, null);
  live(ms => { const a = ms.agents[ms.me]; if (a) setAttrs(ms, a, attrsForTraining(s)); });
  if (RUN.setup && RUN.setup.me) RUN.setup.me.at = attrsForTraining(s);
  const run = RUN.cur;
  if (typedRun(run)) run.config.me = Object.assign({}, run.config.me, s);
}
// my preferred foot, live (the next touch or strike; one already under way keeps its side), kept for the restarts
function setFoot(f){
  const name = FOOT_NAME[footCode(f)];
  live(ms => { const a = ms.agents[ms.me]; if (a) agentFoot(a, name); });
  if (RUN.setup && RUN.setup.me) RUN.setup.me.foot = name;
  const run = RUN.cur;
  if (run && isObj(run.config) && isObj(run.config.me)) run.config.me.prefFoot = name;
  return name;
}
// my height, at the next restart (the body and its capsules are built again there: P5-A's runner and pool)
function setHeight(cm){
  const [lo, hi] = heightRange();
  const v = clamp(Math.round(+cm), lo, hi), m = Math.round(v)/100;
  // (set back to the height you play at now: nothing waits for the restart any more)
  const a = meAgent(), now = a ? Math.round((a.scale || 1)*BASE_H*100) : null;
  if (v === now){
    dropChange("me.height");
    return v;
  }
  queue({key:"me.height", label:`Height ${v} cm`, apply(c){ if (!isObj(c.me)) c.me = {}; c.me.height = m; }});
  return v;
}
// the keeper's attributes, live (he reads at.gk when he acts)
function setKeeper(gk){
  const g = cleanSkills(gk, null, GK_KEYS);
  live(ms => { for (const a of keepers(ms)) a.at.gk = Object.assign({}, a.at.gk || {}, g); });
  const K = RUN.setup && RUN.setup.keeper;
  if (K){ K.at = K.at || {}; K.at.gk = Object.assign({}, K.at.gk || {}, g); }
  const run = RUN.cur;
  if (typedRun(run)) run.config.gk = Object.assign({}, run.config.gk, g);
}
const COUNT_NAME = {attackers:["attacker", "attackers"], defenders:["defender", "defenders"]};
function queueField(key, v){
  const run = RUN.cur; if (!typedRun(run)) return false;
  let label;
  if (key === "attackers" || key === "defenders") label = `${v} ${COUNT_NAME[key][v === 1 ? 0 : 1]}`;
  else if (key === "attAvg" || key === "defAvg") label = `${labelOf(run.sc.type, key)} ${v}`;
  else if (key === "out") label = v === "stop" ? "the ball going out stops play" : "the ball bounces back off the fence";
  else label = `${key} ${v}`;
  queue({key, label, apply(c){ c[key] = v; }});
  return true;
}
// stamina, live, for you. Infinite is a session setting: it is put on every simulation you play until you turn it off
function setInfinite(on){
  AD.inf = !!on;
  live(ms => { const a = ms.agents[ms.me]; if (a) stamInfinite(a.st, AD.inf); });
}
const restoreBreath = () => live(ms => { const a = ms.agents[ms.me]; if (a) stamRestore(a.st); });
const setBreath = pct => live(ms => { const a = ms.agents[ms.me]; if (a) stamSetBreath(a.st, clamp(+pct, 0, 100)); });
// the ball where the setup placed it, with the setup's own launch (the runner's way: at rest there, then the launch
// played through ball.js ballKick, a kick from outside the play), nobody on it
function resetBall(){
  const s = RUN.setup && RUN.setup.ball; if (!s) return false;
  const myTeam = RUN.setup.myTeam;
  return live(ms => {
    const b = ms.ball;
    // (nobody has it: out of a keeper's hands or anyone's feet; its net contact and dead-ball roll cleared)
    clearCtl(ms);
    for (const a of ms.agents) if (a.drib) a.drib = null;
    b.p.x = s.x; b.p.y = Math.max(R, s.y); b.p.z = s.z; b.v.x = b.v.y = b.v.z = 0; b.w.x = b.w.y = b.w.z = 0;
    b.holder = -1; b.sleep = false; b.still = 0; b.knuck = null; b.dragMul = 1; b.pendN = 0; b.grounded = b.p.y <= R + 0.02; b.inField = null;
    if (b.netSide) b.netSide.fill(0);
    b.netHit = false; b.netQ = 0; b.netAny = false;
    b.state = s.free ? "free" : "dead";
    liveRoll(b);
    // play goes on from here: a restart that was waiting (the ball out, with play stopping for it) is over
    if (ms.restart || ms.phase !== "live"){ ms.restart = null; ms.phase = "live"; for (const a of ms.agents){ a.set = null; a.wall = false; } }
    if (Math.hypot(s.vx, s.vy, s.vz) > 1e-9){
      const kind = s.kind === "cross" || s.kind === "loft" ? "cross" : "pass";
      ballKick(b, {x:s.vx, y:s.vy, z:s.vz}, {x:s.wx || 0, y:s.wy || 0, z:s.wz || 0}, {agent:-1, team:myTeam, kind, t:ms.t});
    }
    refreshPred(ms);
    // (the view is told it was put there: no streak drawn from where it was)
    const T = RUN.T; if (T && T.V) viewPreStep(T.V, ms);
  });
}
/* Free Play's ball (freeplay.js spawnBall(o), P5-A): one ball in front of you. Its spawn height and speed are Free
   Play's own options (config opts.spawnY in metres, opts.spawnV in m/s): set here, they are what Q uses from then on,
   live, and the configuration keeps them (a preset saved from Back to Configuration has them) */
let FREE = null;
const SPAWN = Object.freeze({Y_MAX:2.5, V_MAX:20});
const freeplayOn = () => !!(RUN.cur && RUN.cur.sc && RUN.cur.sc.category === "freeplay");
const freeOpts = () => freeplayOn() && isObj(RUN.cur.config) && isObj(RUN.cur.config.opts) ? RUN.cur.config.opts : null;
function spawnNow(){
  const o = freeOpts();
  return {y:o && Number.isFinite(+o.spawnY) ? +o.spawnY : AD.spawn.y, v:o && Number.isFinite(+o.spawnV) ? +o.spawnV : AD.spawn.v};
}
function setSpawn(y, v){
  AD.spawn.y = clamp(y, R, SPAWN.Y_MAX); AD.spawn.v = clamp(v, 0, SPAWN.V_MAX);
  const o = freeOpts();
  if (o){ o.spawnY = AD.spawn.y; o.spawnV = AD.spawn.v; }
}
function spawnBall(){
  if (!freeplayOn()) return false;
  FREE = FREE || import("./freeplay.js");
  const o = spawnNow();
  FREE.then(m => { if (typeof m.spawnBall === "function" && freeplayOn()) m.spawnBall({y:o.y, v:o.v}); }, e => console.error(e));
  return true;
}

/* ---------- the session settings on every new simulation (a start, a restart, a replay) ---------- */
function onSim(){
  const ms = RUN.ms;
  if (!RUN.cur){ AD.ms = null; return; }
  if (!ms || ms === AD.ms) return;
  AD.ms = ms;
  const a = ms.agents[ms.me];
  if (a){
    if (AD.inf) stamInfinite(a.st, true);
    // (the foot set here, kept by the setup when the runner does not carry it into the agent itself)
    const f = RUN.setup && RUN.setup.me && RUN.setup.me.foot;
    if (f && footCode(f) !== a.foot) agentFoot(a, f);
  }
  if (AD.open) draw();
}

/* ---------- the markup ---------- */
const btn = (ad, label, o = {}) => `<button class="btn sm${o.main ? "" : " ghost"}" data-ad="${ad}"${o.v != null ? ` data-v="${esc(o.v)}"` : ""}${o.k ? ` data-k="${esc(o.k)}"` : ""}${o.on ? ` aria-pressed="true"` : ""}${o.off ? " disabled" : ""}${o.title ? ` title="${esc(o.title)}"` : ""}>${esc(label)}</button>`;
const num = (id, v, o = {}) => `<input class="tad-in" id="${id}" data-adin="${esc(o.k || id)}" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" maxlength="8" value="${esc(v)}" aria-label="${esc(o.label || id)}">`;
const seg = (ad, cur, list) => `<div class="seg tad-seg" role="group">${list.map(([v, n]) => `<button class="${v === cur ? "on" : ""}" data-ad="${ad}" data-v="${esc(v)}"${v === cur ? ` aria-pressed="true"` : ""}>${esc(n)}</button>`).join("")}</div>`;
const row = (name, ctl, help = "") => `<div class="tad-row"><div class="tad-label"><b>${esc(name)}</b>${help ? `<span class="muted small">${esc(help)}</span>` : ""}</div><div class="tad-ctl">${ctl}</div></div>`;
const nothing = what => `<p class="muted tad-none">Nothing is playing right now. Start something from the hub or a cone and ${esc(what)} here.</p>`;

function playerHTML(){
  const run = RUN.cur, sk = mySkills();
  if (!run || !sk) return nothing("you can change your attributes, height and foot");
  const out = [];
  const foot = myFoot();
  out.push(row("Preferred foot", seg("foot", foot, [["Right", "Right"], ["Left", "Left"], ["Both", "Both"]]), "Your next touch or strike uses it."));
  if (heightOK()){
    const [lo, hi] = heightRange(), h = myHeight();
    out.push(row("Height", `<div class="tad-h"><input type="range" class="tad-range" id="tadH" data-adrange="height" min="${lo}" max="${hi}" step="1" value="${h}" aria-label="Height in centimetres">
      <span class="tad-hv" id="tadHv">${h} cm</span>${btn("height", "Set")}</div>`, "Your whole body scales with it: reach, headers, your eyes and your stride. Height applies on restart."));
  }
  out.push(`<div class="tad-ed" data-ted="me">${editorHTML("player", {me:sk}, ["me"])}</div>`);
  out.push(`<div class="row wrap gap8 tad-btns">${btn("pdefault", "Reset you", {title:"Your attributes and foot back to how this scenario started them"})}${btn("ppresets", "Player presets")}</div>`);
  return out.join("");
}
function staminaHTML(){
  const a = meAgent();
  if (!a) return nothing("you can change your stamina");
  const pct = Math.round(a.st.B), cap = Math.round(a.st.cap);
  return [
    row("Your breath now", `<span class="tad-big" id="tadB">${pct}</span><span class="muted small"> of ${cap}</span>`),
    row("Infinite stamina", seg("inf", AD.inf ? "on" : "off", [["on", "On"], ["off", "Off"]]), "Your breath stays full however much you sprint."),
    row("Restore", btn("restore", "Back to full"), "Breath straight back to its top."),
    row("Set your breath", `${num("tadSetB", pct, {k:"breath", label:"Breath, 0 to 100"})}${btn("setb", "Set")}`, "0 to 100. Under 35 you start to slow down.")
  ].join("");
}
function aiHTML(){
  const run = RUN.cur, ms = RUN.ms;
  if (!run || !ms) return nothing("you can change the computer's players");
  const out = [];
  if (typedRun(run)){
    const type = run.sc.type, c = run.config, rel = relevant(type, c), n = counts(type, c);
    for (const k of ["attackers", "defenders"]){
      if (!rel.includes(k)) continue;
      const vals = allowed(type, c, k) || [];
      out.push(row(labelOf(type, k), seg("count:" + k, String(c[k]), vals.map(v => [String(v), String(v)])), "Applies on restart."));
    }
    for (const k of ["attAvg", "defAvg"]){
      if (!rel.includes(k) && !(k === "attAvg" ? n.npcAtt > 0 : n.npcDef > 0)) continue;
      out.push(row(labelOf(type, k), `${num("tad-" + k, c[k], {k, label:labelOf(type, k) + ", " + ATTR_MIN + " to " + ATTR_MAX})}${btn("avg", "Set", {k})}`,
        "Each player varies by role, plus up to 6 either way. Applies on restart."));
    }
  }
  const K = keepers(ms)[0];
  if (K){
    const gk = cleanSkills(K.at.gk || {}, null, GK_KEYS);
    out.push(`<div class="tad-ed" data-ted="gk">${editorHTML("player", {gk}, ["gk"])}</div><p class="muted small">The keeper's changes take effect at once.</p>`);
  }
  if (!out.length) out.push(`<p class="muted tad-none">There are no computer players in this one to change.</p>`);
  return out.join("");
}
function ballHTML(){
  const run = RUN.cur;
  if (!run) return nothing("you can reset or spawn the ball");
  const out = [];
  if (freeplayOn()){
    out.push(row("Spawn a ball", btn("spawn", "Spawn or reset", {main:true}), "One ball in front of you, as Q does."));
    const sp = spawnNow();
    out.push(row("Spawn height", `${num("tadSpH", sp.y.toFixed(2), {k:"spawnH", label:"Spawn height in metres"})}<span class="muted small"> m</span>${btn("spawnopt", "Set")}`, `0.11 is on the grass. Up to ${SPAWN.Y_MAX} m. Q uses it too.`));
    out.push(row("Spawn speed", `${num("tadSpV", sp.v.toFixed(1), {k:"spawnV", label:"Spawn speed in metres a second"})}<span class="muted small"> m/s</span>${btn("spawnopt", "Set")}`, `0 is at rest. Up to ${SPAWN.V_MAX}, played toward you.`));
  }
  out.push(row("Reset position", btn("resetball", "Ball back to the start"), "Where this scenario puts it, with the same flight."));
  out.push(row("Reset scenario", btn("restart", "Restart Current Scenario"), "Everything back to how this go started."));
  if (typedRun(run) && relevant(run.sc.type, run.config).includes("out")){
    out.push(row("When the ball leaves the pitch", seg("out", run.config.out, [["rebound", OUT_NAMES.rebound], ["stop", OUT_NAMES.stop]]), "Applies on restart."));
  }
  return out.join("");
}
function scenarioHTML(){
  const run = RUN.cur;
  if (!run) return `${nothing("you can restart or replay it")}<div class="row wrap gap8 tad-btns">${btn("hub", "Back to Hub")}</div>`;
  const b = [btn("restart", "Restart Current Scenario", {main:true})];
  if (RUN.last) b.push(btn("replay", "Replay Last Scenario"));
  b.push(btn("config", "Back to Configuration"), btn("hub", "Back to Hub"));
  // Full Match's own resets (quick.js group 'match', Phase 8): shown only where they are offered
  let match = "";
  if (typeof QK.runItem === "function"){
    const its = QK.items().filter(it => it.group === "match");
    if (its.length) match = `<div class="tad-match"><div class="eyebrow">The match</div><div class="row wrap gap8">${its.map(it => btn("qitem", it.label, {v:it.id})).join("")}</div></div>`;
  }
  return `<p class="muted small">${esc(run.sc.name)}${run.preset ? ` · Preset: ${esc(run.preset.name)}` : ""}</p><div class="row wrap gap8 tad-btns">${b.join("")}</div>${match}`;
}
const fmt = v => { const r = Math.round(v*1000)/1000; return String(r); };
function tuneHTML(){
  const groups = [];
  let cur = null;
  for (const k of TUNE_KEYS){
    const g = TUNE_GROUPS.find(x => x[0] === k);
    if (g || !cur){ cur = {name:g ? g[1] : "", keys:[]}; groups.push(cur); }
    cur.keys.push(k);
  }
  const changed = TUNE_KEYS.filter(k => TUNE[k].value !== TUNE[k].def).length;
  return `<div class="row wrap gap8 tad-btns">${btn("tunereset", "Reset all to defaults", {off:!changed})}<span class="muted small">${changed ? `${changed} changed from the defaults` : "All at their defaults"}. They apply at once, here and in every scenario, until you leave Training.</span></div>
    ${groups.map(g => `<section class="tad-tg"><h4>${esc(g.name)}</h4>${g.keys.map(k => { const e = TUNE[k];
      return `<div class="tad-tr${e.value !== e.def ? " changed" : ""}" data-tk="${k}"><label class="tad-tl" for="tadT-${k}">${esc(e.label)} <span class="muted small">${k}</span></label>
        ${num("tadT-" + k, fmt(e.value), {k:"tune:" + k, label:e.label + ", " + fmt(e.min) + " to " + fmt(e.max)})}
        <span class="muted small tad-rg">${fmt(e.min)} to ${fmt(e.max)}</span>${btn("tunedef", "Reset", {k, off:e.value === e.def, title:"Back to " + fmt(e.def)})}</div>`; }).join("")}</section>`).join("")}`;
}
function html(){
  const notes = pending().map(c => c && c.label).filter(Boolean);
  const body = {player:playerHTML, stamina:staminaHTML, ai:aiHTML, ball:ballHTML, scenario:scenarioHTML, tune:tuneHTML}[AD.sec]();
  return `<div class="th tad" data-sec="${AD.sec}"><h2>Admin</h2><p class="muted small">Changes take effect at once where that's safe. The rest wait for the next restart, and are listed here until then.</p>
    <nav class="tad-tabs" role="tablist">${SECTIONS.map(s => `<button class="btn sm${s.id === AD.sec ? "" : " ghost"}" role="tab" aria-selected="${s.id === AD.sec}" data-ad="sec" data-v="${s.id}">${esc(s.name)}</button>`).join("")}</nav>
    <div class="tad-pending" role="status"${notes.length ? "" : " hidden"}>${notes.length ? `Applies on restart: ${esc(notes.join(", "))}` : ""}</div>
    <p class="muted small tad-msg" role="status">${esc(AD.msg)}</p>
    <div class="tad-body">${body}</div>
    <div class="th-foot"><span class="muted small grow">Numpad 1 or Ctrl+Shift+1 opens and closes this.</span><button class="btn ghost" data-ad="close">Close</button></div></div>`;
}
function draw(focus = null){
  const r = document.getElementById("sheetRoot"); if (!r || !AD.open) return;
  const sh = r.querySelector(".sheet");
  const keep = sh ? sh.scrollTop : 0;
  const inner = `${html()}<button class="sheet-x" data-ad="close" aria-label="Close">✕</button>`;
  if (sh && r.dataset.kind === KIND && sh.querySelector(".tad")){ r.classList.add("still"); sh.innerHTML = inner; sh.scrollTop = keep; }
  else r.innerHTML = `<div class="sheet-back" data-ad="close"></div><div class="sheet glass tad-sheet">${inner}</div>`;
  const f = focus && r.querySelector(focus);
  if (f) try { f.focus(); if (f.select) f.select(); } catch(e){}
}
const say = (t, focus = null) => { AD.msg = t || ""; draw(focus); };

/* ---------- open and close ---------- */
/* the panel up, on a section (or the one it was last on). Training only; not over the configuration or presets sheet
   (they have the same settings, and their fields take the keys). Returns true when it is up */
export function adminOpen(sec = null){
  if (sec && SECTIONS.some(s => s.id === sec)) AD.sec = sec;
  if (AD.open){ draw(); return true; }
  if (!inTraining() || configOpen() || presetsOpen()) return false;
  const r = document.getElementById("sheetRoot"); if (!r) return false;
  AD.msg = "";
  // the hub gives way (it is told it went) and comes back after
  AD.hub = hubOpen() ? {cat:hubCategory()} : null;
  if (r.dataset.kind === "trainhub" && typeof window.trainHubClosed === "function") window.trainHubClosed();
  AD.open = true;
  r.dataset.kind = KIND; r.classList.remove("still");
  draw();
  // (open at once: the pause card, which comes up when the pointer goes, waits for an open sheet)
  r.classList.add("open");
  // a scenario playing is held while the panel is up. The pause card stays down; if it was already up it steps aside
  // (quick.js: a sheet over it) and comes back when the panel goes
  AD.paused = !!(RUN.cur && RUN.paused);
  if (RUN.cur){ setPaused(true); controlRelease(); if (QK.quickIsOpen()) QK.quickOpen(); }
  if (window.lifeModalSet) window.lifeModalSet(true);
  r.addEventListener("click", click);
  r.addEventListener("keydown", keydown);
  r.addEventListener("change", change);
  r.addEventListener("input", slide);
  AD.key = e => { if (e.key === "Escape" && AD.open && !tutUp()){ e.preventDefault(); e.stopPropagation(); adminClose(); } };
  addEventListener("keydown", AD.key, true);
  // another sheet put up in its place (the presets): the panel is gone
  if (typeof MutationObserver === "function"){
    AD.obs = new MutationObserver(() => { if (AD.open && (r.dataset.kind !== KIND || !r.classList.contains("open"))) gone(); });
    AD.obs.observe(r, {attributes:true, attributeFilter:["class", "data-kind"]});
  }
  told(true);
  return true;
}
const tutUp = () => { const t = document.getElementById("tutRoot"); return !!(t && t.classList.contains("on")); };
function gone(){
  if (!AD.open) return false;
  AD.open = false;
  const r = document.getElementById("sheetRoot");
  if (AD.obs){ AD.obs.disconnect(); AD.obs = null; }
  if (r){ r.removeEventListener("click", click); r.removeEventListener("keydown", keydown); r.removeEventListener("change", change); r.removeEventListener("input", slide); }
  if (AD.key){ removeEventListener("keydown", AD.key, true); AD.key = null; }
  AD.msg = "";
  told(false);
  return true;
}
function takeDown(){
  const r = document.getElementById("sheetRoot");
  if (r && r.dataset.kind === KIND){ r.classList.remove("open"); r.dataset.kind = ""; setTimeout(() => { if (!r.classList.contains("open") && !r.dataset.kind) r.innerHTML = ""; }, 300); }
}
/* the panel down. play: go on playing (the default: the scenario it held plays on and the pointer is asked back, from
   the click or key that closed it); false when something else takes over (a scenario action, the presets) */
export function adminClose({play = true} = {}){
  const hub = AD.hub; AD.hub = null;
  if (!gone()) return false;
  takeDown();
  if (!play) return true;
  if (hub && !RUN.cur){ openHub(hub.cat); return true; }
  resume();
  return true;
}
// play on: the scenario the panel held, the pause card it was waiting under, or the cage
function resume(){
  if (RUN.cur){
    FLAGS.modal = false;
    if (AD.paused) return;   // the pause card was up before: it comes back
    if (QK.quickIsOpen()) QK.quickClose({resume:true});
    else { setPaused(false); if (window.lifeRelock) window.lifeRelock(); }
  } else if (window.lifeModalSet) window.lifeModalSet(false);
}
export const adminIsOpen = () => AD.open;
// the panel's state as the key layer reads it (keys.js: Numpad 1 toggles it), and its own changes told to whoever listens
if (typeof window !== "undefined") window.trainAdminOpen = adminIsOpen;
const told = open => { try { dispatchEvent(new CustomEvent("train:admin", {detail:{open, from:"admin"}})); } catch(e){ console.error(e); } };
export function adminSection(id){
  if (!SECTIONS.some(s => s.id === id)) return false;
  AD.sec = id; AD.msg = "";
  if (AD.open) draw();
  return true;
}

/* ---------- the scenario's own actions (the pause card's, the same runner calls) ---------- */
// the panel and the card down, the simulation let go, ready for a restart or a replay
function leaveFor(){
  gone(); takeDown(); AD.hub = null;
  if (QK.quickIsOpen()) QK.quickClose();
  FLAGS.modal = false;
}
const relock = () => { if (window.lifeRelock) window.lifeRelock(); };
function doRestart(){
  if (!RUN.cur) return;
  leaveFor();
  setPaused(false);
  if (restart()) relock(); else setPaused(true);
}
function doReplay(){
  leaveFor();
  const ok = replay();
  if (!ok) return;
  // (on another pitch the cage is built first: the pointer is asked back once it plays)
  const sw = RUN.switching || (RUN.pending && typeof RUN.pending.then === "function" ? RUN.pending : null);
  if (sw) sw.then(r => { if (r) relock(); });
  else { setPaused(false); relock(); }
}
function doConfig(){
  const run = RUN.cur; if (!run) return;
  const sc = run.sc, config = copy(run.config);
  leaveFor();
  stopScenario("config");
  if (sc.configure){ sc.configure(copy(config), {from:"admin"}); return; }
  const ev = new CustomEvent("train:configure", {detail:{id:sc.id, type:sc.type, category:sc.category, config:copy(config)}, cancelable:true});
  dispatchEvent(ev);
  if (!ev.defaultPrevented) openHub(sc.category);
}
function doHub(){
  const run = RUN.cur, cat = run ? run.sc.category : null;
  leaveFor();
  if (run) stopScenario("hub");
  openHub(cat);
}

/* ---------- the panel's clicks and typed values ---------- */
function editorTarget(el){ const w = el && el.closest ? el.closest("[data-ted]") : null; return w ? w.dataset.ted : null; }
function click(e){
  if (!AD.open) return;
  const t = e.target;
  // the attribute editor's own buttons (reset, the presets, reset all)
  const ted = editorTarget(t);
  if (ted && t.closest("[data-ae]")){
    e.preventDefault();
    if (ted === "me"){ const sk = mySkills(); if (!sk) return; const c = editorClick("player", {me:sk, gk:{}}, t); if (c){ setMe(c.me); say("Your attributes are changed."); } }
    else if (ted === "gk"){ const K = keepers(RUN.ms)[0]; if (!K) return; const c = editorClick("player", {me:{}, gk:cleanSkills(K.at.gk || {}, null, GK_KEYS)}, t); if (c){ setKeeper(c.gk); say("The keeper's attributes are changed."); } }
    return;
  }
  const b = t && t.closest && t.closest("[data-ad]");
  if (!b) return;
  e.preventDefault();
  const what = b.dataset.ad, v = b.dataset.v, k = b.dataset.k;
  if (what === "close") return void adminClose();
  if (what === "sec") return void adminSection(v);
  if (what === "foot"){ const f = setFoot(v); return void say(`Your preferred foot is now ${f.toLowerCase() === "both" ? "both feet" : f.toLowerCase()}.`); }
  if (what === "height"){ const h = document.getElementById("tadH"); const cm = setHeight(h ? h.value : myHeight()), a = meAgent();
    return void say(a && cm === Math.round((a.scale || 1)*BASE_H*100) ? `You're ${cm} cm already.` : `Height ${cm} cm applies on restart.`); }
  if (what === "pdefault") return void resetMe();
  if (what === "ppresets") return void playerPresets();
  if (what === "inf"){ setInfinite(v === "on"); return void say(AD.inf ? "Infinite stamina is on." : "Infinite stamina is off. Your breath drains as usual again."); }
  if (what === "restore"){ restoreBreath(); return void say("Your breath is back to full."); }
  if (what === "setb") return void commitInput(document.getElementById("tadSetB"));
  if (what.startsWith("count:")){ const key = what.slice(6); queueField(key, +v); return void say(`${labelOf(RUN.cur.sc.type, key)}: ${v}. That applies on restart.`); }
  if (what === "avg") return void commitInput(document.getElementById("tad-" + k));
  if (what === "out"){ queueField("out", v); return void say("That applies on restart."); }
  if (what === "spawn"){ spawnBall(); return void say("Here's a ball."); }
  if (what === "spawnopt"){ commitInput(document.getElementById("tadSpH"), false); commitInput(document.getElementById("tadSpV"), false); const sp = spawnNow(); return void say(`New balls come at ${sp.y.toFixed(2)} m and ${sp.v.toFixed(1)} m/s.`); }
  if (what === "resetball"){ resetBall(); return void say("The ball is back where it started."); }
  if (what === "restart") return void doRestart();
  if (what === "replay") return void doReplay();
  if (what === "config") return void doConfig();
  if (what === "hub") return void doHub();
  if (what === "qitem"){ leaveFor(); try { QK.runItem(v); } catch(err){ console.error(err); } return; }
  if (what === "tunereset"){ live(() => tuneReset()); return void say("Every tunable is back to its default."); }
  if (what === "tunedef"){ live(() => tuneReset(k)); return void say(`${TUNE[k].label}: back to ${fmt(TUNE[k].def)}.`); }
}
// a typed value taken (Enter, the field left, or its Set button)
function commitInput(inp, talk = true){
  if (!inp || !AD.open) return;
  const key = inp.dataset.adin, text = String(inp.value).trim(), n = /^[-+]?\d*\.?\d+$/.test(text) ? +text : NaN;
  const focus = "#" + inp.id;
  if (key && key.startsWith("tune:")){
    const tk = key.slice(5), e = TUNE[tk]; if (!e) return;
    if (!Number.isFinite(n)){ inp.value = fmt(e.value); return void (talk && say(`That isn't a number, so ${e.label.toLowerCase()} stays at ${fmt(e.value)}.`)); }
    let kept;
    live(() => { kept = tuneSet(tk, n); });
    if (kept == null) kept = TUNE[tk].value;
    return void (talk && say(kept === n ? `${e.label}: ${fmt(kept)}.` : `${e.label}: ${fmt(kept)}, the nearest it can be.`, focus));
  }
  if (key === "breath"){
    if (!Number.isFinite(n)) return void say("Type a number from 0 to 100.");
    setBreath(n); const a = meAgent();
    return void say(`Your breath is now ${a ? Math.round(a.st.B) : Math.round(clamp(n, 0, 100))}.`, focus);
  }
  if (key === "attAvg" || key === "defAvg"){
    const run = RUN.cur; if (!typedRun(run)) return;
    if (!Number.isFinite(n)) return void say("Type a number from 1 to 99.");
    const v = clamp(Math.round(n), ATTR_MIN, ATTR_MAX);
    queueField(key, v);
    return void say(`${labelOf(run.sc.type, key)}: ${v}. That applies on restart.`, focus);
  }
  if (key === "spawnH" || key === "spawnV"){
    const sp = spawnNow();
    if (Number.isFinite(n)){ if (key === "spawnH") sp.y = n; else sp.v = n; setSpawn(sp.y, sp.v); }
    const now = spawnNow();
    inp.value = key === "spawnH" ? now.y.toFixed(2) : now.v.toFixed(1);
    if (talk) say(`New balls come at ${now.y.toFixed(2)} m and ${now.v.toFixed(1)} m/s.`, focus);
    return;
  }
}
function keydown(e){
  if (e.key !== "Enter" || !AD.open) return;
  const t = e.target;
  if (t && t.dataset && t.dataset.aeIn){
    e.preventDefault();
    const ted = editorTarget(t);
    if (ted === "me"){ const sk = mySkills(); const c = sk && editorInput("player", {me:sk, gk:{}}, t); if (c){ setMe(c.me); say(`${skillName(t.dataset.aeIn.slice(3))}: ${c.me[t.dataset.aeIn.slice(3)]}.`, "#" + t.id); } }
    else if (ted === "gk"){ const K = keepers(RUN.ms)[0]; const c = K && editorInput("player", {me:{}, gk:cleanSkills(K.at.gk || {}, null, GK_KEYS)}, t); if (c){ setKeeper(c.gk); say("The keeper's attributes are changed.", "#" + t.id); } }
    return;
  }
  if (t && t.dataset && t.dataset.adin){ e.preventDefault(); commitInput(t); }
}
// a field left with a new value in it: taken as Enter takes it
function change(e){
  const t = e.target; if (!AD.open || !t || !t.dataset) return;
  if (t.dataset.aeIn || t.dataset.adin) keydown({key:"Enter", target:t, preventDefault(){}});
}
// the height slider's value as it moves
function slide(e){
  const t = e.target;
  if (t && t.dataset && t.dataset.adrange === "height"){ const o = document.getElementById("tadHv"); if (o) o.textContent = `${t.value} cm`; }
}

/* ---------- you back to how this scenario started you, and the player presets ---------- */
function resetMe(){
  const run = RUN.cur; if (!run) return;
  const st = AD.start && AD.start.run === run ? AD.start : null;
  setMe(st ? st.me : mySkills());
  setFoot(st ? st.foot : "Right");
  if (st && st.height && heightOK() && st.height !== myHeight()) setHeight(st.height);
  say("You're back to how this scenario started you.");
}
// the player preset's configuration: my attributes, and the height and foot where the configuration carries them
function playerConfig(){
  const me = Object.assign({}, mySkills() || {});
  if (heightOK()){ const h = myHeight(); if (h) me.height = h/100; }
  if (footInConfig()){ const f = myFoot(); if (f) me.prefFoot = f; }
  return validate("player", {me});
}
function playerPresets(){
  if (!RUN.cur) return;
  const cfg = playerConfig();
  gone(); takeDown();
  // (back to the panel as it was: a scenario it held is still its to let go when it closes)
  const was = AD.paused;
  const back = () => { if (adminOpen("player")) AD.paused = was; };
  const ok = openPresets({type:"player", typeName:"Player", config:cfg, onLoad:c => { loadPlayer(c); back(); }, onClose:back});
  if (!ok) back();
}
function loadPlayer(c){
  const me = c && isObj(c.me) ? c.me : {};
  setMe(cleanSkills(me, null));
  if (me.prefFoot) setFoot(me.prefFoot);
  if (heightOK() && Number.isFinite(+me.height)){ const cm = Math.round(+me.height*100); if (cm !== myHeight()) setHeight(cm); }
  AD.msg = "Preset loaded.";
}
// what this scenario started you as (Reset you), kept at each new start
function noteStart(){
  const run = RUN.cur, a = meAgent();
  if (!run || !a){ AD.start = null; return; }
  if (AD.start && AD.start.run === run) return;
  AD.start = {run, id:run.id, me:cleanSkills(a.at, null), foot:FOOT_NAME[a.foot] || "Right", height:myHeight()};
}

/* ---------- the player presets type (presets.js keeps them by type; config.js validates them) ---------- */
registerType("player", {name:"Player", fields:["me"], roles:["attacker"]});
const avgOf = me => Math.round(EDIT_SKILLS.reduce((s, k) => s + (+me[k] || 0), 0)/EDIT_SKILLS.length);
describe("player", c => {
  const me = isObj(c.me) ? c.me : {}, parts = [`Average ${avgOf(me)}`];
  if (Number.isFinite(+me.height) && +me.height > 0) parts.push(`${Math.round(+me.height*100)} cm`);
  if (me.prefFoot) parts.push(me.prefFoot === "Both" ? "Both feet" : `${me.prefFoot} foot`);
  return parts.join(", ");
});

/* ---------- wiring ---------- */
onRunner(() => { onSim(); if (RUN.cur && (!AD.start || AD.start.run !== RUN.cur)) noteStart(); if (!RUN.cur) AD.start = null; });
if (typeof addEventListener === "function"){
  // P5-A's key layer: {open: true} opens it, false closes it, anything else toggles
  addEventListener("train:admin", e => {
    const d = e && e.detail || {};
    if (d.from === "admin") return;
    const want = d.open === true || d.open === false ? d.open : !AD.open;
    if (want) adminOpen(d.section || null); else adminClose();
  });
  // leaving Training: the panel goes, and the session settings with it
  addEventListener("train:exit", () => { if (AD.open){ AD.hub = null; gone(); takeDown(); } AD.inf = false; AD.ms = null; AD.start = null; tuneReset(); });
}

// tests (DESIGN 1.4.20 style)
if (typeof window !== "undefined") window.__trainAdmin = {adminOpen, adminClose, adminSection, adminIsOpen, SECTIONS, state:() => ({open:AD.open, sec:AD.sec, inf:AD.inf, spawn:Object.assign({}, AD.spawn), pending:pending().map(c => c.label), msg:AD.msg})};
