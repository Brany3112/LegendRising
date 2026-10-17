/* ============ Training Mode: Full Match ============
   Owner: P8-B (Training Mode Phase 8: Full Match in Training Mode). Contract: BUILD-PLAN P8-B work items and the Phase 8
   contract (P8-A: FP.enterTraining, FP.resetMatch, FP.resetHalf, FP.restartKickoff, registerBench, the training host,
   pool.js matchBodies and poolTrim); TRAINING-SPEC 0 (Full Match is 11 v 11; the keeper is always the computer's) and 5
   (Full Match: the real match system; from the kick-off or from the bench through the real substitution; team and role
   from the configuration; Reset Match, Reset Current Half, Restart from Kickoff, Return to Hub; never the career).

   The real match (football/controller.js, its 'match' mode) played in Training's Full cage: the configuration is config
   type 'fullmatch' (config.js: my role, both teams' averages, the opponents' keeper; the pitch and the laws fixed: the
   full pitch, real lines and restarts) with this module's own options (registered here, registerType: config.js is not
   edited): where I start (the kick-off or the bench), the minute I come on, the length of a half, and my position. It
   gets presets like every scenario (presetui.js, type 'fullmatch').
   matchConfigOf(config) -> the createMatch cfg: teams.js cfgFromConfig (the two XIs, my record in my role's slot) with
   my position moved to the one chosen, a bench of five a side (one keeper among them), the half's length in real time,
   and the real match's five changes. The keeper is never mine: the role picker offers no GK (config.js roles), my
   position never the GK slot (SLOTS), and a bench start puts me on the bench as an outfield substitute.
   The training host (P8-A's contract) is built here from the sandbox: my look (the pool's: the created character in my
   bib), the bibs as kits, the pool's bodies, the device's notes and pointer, the quick menu's card as the pause card,
   and the way back to the hub when the match is over. Nothing of the career is called.
   The hub lists two entries (hub.js registerEntry): from the kick-off and from the bench. The quick menu's 'match'
   group gets Reset Current Half, Reset Match (each with its confirmation), Restart from Kickoff and Return to Hub; the
   admin panel's Scenario and Match section shows the same items. */
import {registerType, validate, ROLE_SLOT, SLOTS} from "./config.js";
import {cfgFromConfig} from "./teams.js";
import {matchBodies, poolTrim, poolMeLook, KITS} from "./pool.js";
import {CAGE, cageEnter} from "./cage.js";
import {RUN} from "./runner.js";
import {registerEntry, openHub} from "./hub.js";
import {addItem, matchCard} from "./quick.js";
import {FP} from "../football/controller.js";
import {attrsForAI} from "../football/attrs.js";
import {mode, modeArg, enterMode, revealAfterFrames} from "../core/modes.js";
import {FADE} from "../core/state.js";

export const TYPE = "fullmatch";
export const HALF_MINUTES = Object.freeze([3, 5, 10, 15, 20]);
const BENCH_SLOTS = Object.freeze(["GK", "CB", "CM", "LW", "ST"]);
const ARCH = Object.freeze({GK:"GK", CB:"DF", LB:"DF", RB:"DF", LWB:"DF", RWB:"DF", CDM:"CM", CM:"CM", LM:"W", RM:"W", CAM:"AM", LW:"W", RW:"W", LF:"ST", CF:"ST", RF:"ST", ST:"ST"});
const POS = Object.freeze({GK:"GK", CB:"DF", LB:"DF", RB:"DF", LWB:"DF", RWB:"DF", CDM:"CM", CM:"CM", LM:"LW", RM:"RW", CAM:"CAM", LW:"LW", RW:"RW", LF:"ST", CF:"ST", RF:"ST", ST:"ST"});

// (the start and the minute, the half's length, my position: Full Match's own options)
registerType(TYPE, {options:{
  start:{kind:"enum", label:"Where you start", help:"There's no warm-up in Training: from the bench, you're called on at the minute you set.",
    values:[{v:"kickoff", label:"On the pitch, from the kick-off"}, {v:"bench", label:"On the bench"}], def:"kickoff"},
  subMin:{kind:"int", label:"The minute you come on", min:46, max:85, step:1, def:60, when:c => c.opts.start === "bench"},
  half:{kind:"enum", label:"Length of a half", help:"In real minutes.", values:HALF_MINUTES.map(v => ({v, label:`${v} minutes`})), def:10},
  slot:{kind:"enum", label:"Your position", help:"Never in goal: the keeper is always the computer's.", values:[{v:"", label:"Your role's"}, ...SLOTS.map(v => ({v, label:v}))], def:""}
}});

/* ---------- the createMatch cfg ---------- */
function benchOf(t, avg, seed){
  return BENCH_SLOTS.map((slot, i) => {
    const pid = 70000 + t*100 + i;
    return {pid, name:`Sub ${t ? "B" : "A"}${i + 1}`, number:12 + i, slot, arch:ARCH[slot], isGK:slot === "GK", scale:1, energy:100, fatigue:0, prefFoot:"Right",
      at:attrsForAI({id:`fm${seed >>> 0}:${t}:${i}`, ovr:avg, pos:POS[slot]}, {training:true})};
  });
}
export function matchConfigOf(config){
  const c = validate(TYPE, config);
  const cfg = cfgFromConfig(TYPE, c).cfg;
  // my position: the slot chosen, swapped with the man who had it (or mine changed when the shape has no such slot)
  const want = c.opts.slot && SLOTS.includes(c.opts.slot) ? c.opts.slot : ROLE_SLOT[c.role] || "CM";
  const XI = cfg.teams[0].players, me = XI.find(p => p.isMe);
  if (me && me.slot !== want){
    const other = XI.find(p => !p.isMe && p.slot === want);
    if (other){ other.slot = me.slot; other.arch = ARCH[me.slot] || other.arch; }
    me.slot = want; me.arch = ARCH[want] || me.arch;
  }
  cfg.me = Object.assign({}, cfg.me, {slot:want});
  cfg.teams[0].bench = benchOf(0, c.attAvg, cfg.seed);
  cfg.teams[1].bench = benchOf(1, c.defAvg, cfg.seed);
  cfg.teams[0].name = "You"; cfg.teams[0].short = "YOU"; cfg.teams[1].name = "Them"; cfg.teams[1].short = "THM";
  cfg.halfRealSec = (HALF_MINUTES.includes(+c.opts.half) ? +c.opts.half : 10)*60;
  cfg.rules = Object.assign({}, cfg.rules, {subs:5});
  return cfg;
}

/* ---------- the match ---------- */
const FM = {on:false, config:null, preset:null, prev:null, prevArg:null, starting:false, entry:null};
export const fmRunning = () => FM.on && !!FP.state;
// the training host (P8-A's contract)
function host(){
  return {
    look:() => poolMeLook(),
    kits:() => ({home:KITS.mine, away:KITS.theirs}),
    bodies:ms => matchBodies(ms, 0),
    kickoff:() => 0, now:() => 0,
    note:t => { if (t && window.lifeNote) window.lifeNote(t); },
    relock:() => { if (typeof window.lifeRelock === "function") window.lifeRelock(); },
    speed:() => 2, setSpeed:() => {},
    // the pointer let go: the quick menu's card, with the match's own items
    pause:on => matchCard(on, {title:"Full Match", preset:FM.preset ? FM.preset.name : null}),
    // the full-time card's Continue: back to the hub
    ended:() => backToHub()
  };
}
/* a Full Match with this configuration (from the hub, the configuration sheet or a preset): on the Full cage (built
   first under the fade when another is up). Returns true when it is playing or will be once the cage is up */
export function startFullMatch(config, o = {}){
  if (FM.starting || FP.state || RUN.cur || RUN.switching) return false;
  const c = validate(TYPE, config);
  FM.config = c; FM.preset = o.preset && o.preset.name ? {id:o.preset.id || null, name:String(o.preset.name)} : null;
  FM.prev = mode(); FM.prevArg = modeArg();
  const go = () => {
    FM.starting = false;
    const ok = FP.enterTraining(matchConfigOf(c), {zone:"cage", kind:"full", start:c.opts.start, subOn:c.opts.subMin, host:host()});
    FM.on = !!ok;
    return ok;
  };
  if (CAGE.kind !== "full"){
    FM.starting = true;
    cageEnter("full").then(cg => { if (cg) go(); else FM.starting = false; });
    return true;
  }
  return go();
}
/* back to the hub (Return to Hub, the full-time card's Continue): under the black fade the match ends, the pool goes
   back to the drill's 14, you are back walking in the cage, and the hub comes up on Full Match */
export function backToHub(){
  const o = document.getElementById("lifeFade");
  if (o){ o.style.transition = "none"; o.style.opacity = "1"; }
  FADE.v = 1;
  matchCard(false);
  if (FP.state) FP.exit();
  FM.on = false;
  poolTrim();
  if (FM.prev && FM.prev !== "life" && mode() === "life") enterMode(FM.prev, FM.prevArg);
  revealAfterFrames(2).then(() => { if (FADE.boot) return; if (o){ o.style.transition = "opacity 250ms ease"; o.style.opacity = "0"; } FADE.v = 0; });
  openHub(TYPE);
  return true;
}

/* ---------- the hub's entries ---------- */
export const ENTRIES = Object.freeze([
  {id:"fm-kickoff", name:"Full Match from the kick-off", desc:"Eleven against eleven on the full pitch, with real lines, restarts, half time and full time.",
    config:{opts:{start:"kickoff"}}},
  {id:"fm-bench", name:"Full Match from the bench", desc:"Start as a substitute. You're called on at the minute you set and go on through the fourth official.",
    config:{opts:{start:"bench", subMin:60}}}
].map(e => Object.freeze(e)));
for (const e of ENTRIES) registerEntry({id:e.id, category:"fullmatch", type:TYPE, name:e.name, desc:e.desc, config:validate(TYPE, e.config),
  start:(config, o) => startFullMatch(config, o), playing:() => fmRunning(), end:() => backToHub()});

/* ---------- the quick menu's (and the admin panel's) match items ---------- */
const playing = () => fmRunning();
// (the card stays until the pointer is back: the controller takes it down then, host.pause(false))
const after = () => { if (typeof window.lifeRelock === "function") window.lifeRelock(); };
addItem({id:"fm-half", label:"Reset Current Half", group:"match", order:110, when:playing,
  confirm:"Play this half again from its kick-off? Everything that has happened in it goes.", hint:"This half again from its kick-off",
  run(){ FP.resetHalf(); after(); }});
addItem({id:"fm-match", label:"Reset Match", group:"match", order:120, when:playing,
  confirm:"Start the whole match again from the first kick-off? The score and the clock go back to 0.", hint:"The whole match from the start",
  run(){ FP.resetMatch(); after(); }});
addItem({id:"fm-kickoff", label:"Restart from Kickoff", group:"match", order:130, when:playing, hint:"The clock and the score as they are, both teams lined up again",
  run(){ FP.restartKickoff(); after(); }});
addItem({id:"fm-hub", label:"Return to Hub", group:"match", order:140, when:playing, hint:"Stop the match and pick something else",
  run(){ backToHub(); }});

// Training left mid-match: the match goes with it
if (typeof addEventListener === "function") addEventListener("train:exit", () => { if (FM.on || FP.state){ matchCard(false); if (FP.state) FP.exit(); FM.on = false; try { poolTrim(); } catch(e){ console.error(e); } } });

// tests (DESIGN 1.4.20 style)
if (typeof window !== "undefined") window.__trainFull = {TYPE, ENTRIES, HALF_MINUTES, matchConfigOf, startFullMatch, backToHub, fmRunning, host};
