/* ============ Training Mode: the configuration ============
   Owner: P4-A (Training Mode Phase 4: configuration and attributes). Contract: BUILD-PLAN Phase 4 "Contracts (P4-A
   stubs them)", config.js (registerType, defaults, validate, relevant, VERSION and the shared schema) and P4-A work
   item 1; TRAINING-SPEC 0 (up to 6 attackers against 6 defenders plus an optional AI keeper; the keeper is always AI
   and never a role), 4 (shared configuration, only relevant settings shown, every setting changes the real setup) and
   G0 decisions (d) the free-kick wall counts in the defenders' 6, (e) my attributes start from the held career's
   skills, else the editor's Average preset, and (h) me counted in my side's 6.

   A configuration is plain data, the same for every scenario type:
     v           VERSION
     role        my role: 'attacker' | 'taker' | 'receiver' | 'support' | 'defender' (never the keeper)
     possession  who has the ball at the start: 'me' | 'mates' | 'opps' | 'loose'
     attackers   0..6 outfield players on the attacking side, me included when I attack (then at least 1)
     defenders   0..6 on the defending side, me included when I defend (then at least 1), the wall included
     wall        0..6 wall players (free kicks), counted in the defenders' 6
     mates, opps team-mates on / opponents on (off: nobody on that side but me, and the keeper when he is on)
     keeper      the AI keeper on / off (he keeps the goal the attackers attack)
     offside     the offside law on / off
     positions   {me: {slot, dx, dz}, att: [6 x {slot, dx, dz}], def: [6 x {slot, dx, dz}]}: a formation slot and an
                 offset in metres (dx toward the goal attacked, dz across) for every participant
     me          my 15 skills (attrs.js EDIT_SKILLS), 1..99
     attAvg      the attacking NPCs' average, 1..99; defAvg the defending NPCs'
     gk          the keeper's set {reflex, dive, handling, posit, distrib}, 1..99
     ball        {at: {x, y, z} | null (null: at the feet of whoever has it), launch: null | {kind: 'pass' | 'driven' |
                 'cross' | 'loft', target: {x, y, z}, speed, curl}}, in the cage pitch's own frame (pitch-local
                 metres, +x the goal attacked)
     out         out of play: 'rebound' off the cage, or 'stop' for the restart
     pitch       'full' | 'half' | 'onegoal'
     opts        the type's own options (registerType)
   A type says which of these it uses and may fix some (Full Match: always the full pitch). validate() gives a safe
   copy of anything: defaults for what is missing or bad, values clamped, unknown keys dropped, the limits kept with a
   note saying what was changed. relevant() is what the configuration sheet shows (configui.js). teams.js turns a
   configuration into the simulation's setup. Nothing here touches the DOM, so the unit tests run it under node. */
import {EDIT_SKILLS, GK_KEYS, ATTR_MIN, ATTR_MAX, ATTR_PRESETS, presetSkills, cleanSkills} from "../football/attrs.js";

export const VERSION = 1;
export const ROLES = Object.freeze(["attacker", "taker", "receiver", "support", "defender"]);
export const ROLE_NAMES = Object.freeze({attacker:"Attacker", taker:"Taker", receiver:"Receiver", support:"Support", defender:"Defender"});
export const POSSESSION = Object.freeze(["me", "mates", "opps", "loose"]);
export const PITCHES = Object.freeze(["full", "half", "onegoal"]);
export const PITCH_NAMES = Object.freeze({full:"Full", half:"Half", onegoal:"One goal"});
export const OUTS = Object.freeze(["rebound", "stop"]);
export const LAUNCH_KINDS = Object.freeze(["pass", "driven", "cross", "loft"]);
// the formation slots a participant can take (tactics.js SLOT_POS, the keeper's left out: he is never a role)
export const SLOTS = Object.freeze(["LB", "CB", "RB", "LWB", "RWB", "CDM", "LM", "CM", "RM", "CAM", "LW", "RW", "LF", "CF", "RF", "ST"]);
// the hard limits (TRAINING-SPEC 0, G0 h): 6 outfield players a side, me included, plus one AI keeper
export const MAX_SIDE = 6, MAX_AGENTS = 13;
export const OFFSET_MAX = Object.freeze({dx:40, dz:30});
export const LAUNCH_SPEED = Object.freeze({min:3, max:36});

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const isObj = o => !!o && typeof o === "object" && !Array.isArray(o);
const numOr = (v, d) => v != null && v !== "" && typeof v !== "boolean" && Number.isFinite(+v) ? +v : d;
const intIn = (v, a, b, d) => clamp(Math.round(numOr(v, d)), a, b);
const boolOr = (v, d) => typeof v === "boolean" ? v : v === "true" || v === 1 ? true : v === "false" || v === 0 ? false : d;
const oneOf = (v, list, d) => list.includes(v) ? v : d;
const r3 = v => Math.round(v*1000)/1000;

// my side ('att' or 'def') for a role
export const sideOf = role => role === "defender" ? "def" : "att";

/* ---------- the fields every type draws from ----------
   key -> {label, help}: what the configuration sheet calls it (configui.js) */
export const FIELDS = Object.freeze({
  role:{label:"Your role", help:"What you do in it. The keeper is always the computer's."},
  possession:{label:"Who starts with the ball"},
  attackers:{label:"Attackers", help:"Outfield players on the attacking side. You count as one when you attack."},
  defenders:{label:"Defenders", help:"Outfield players on the defending side. You count as one when you defend."},
  wall:{label:"Players in the wall", help:"They count toward the defenders' six."},
  mates:{label:"Team-mates"},
  opps:{label:"Opponents"},
  keeper:{label:"Goalkeeper", help:"Always played by the computer."},
  offside:{label:"Offside"},
  positions:{label:"Starting positions"},
  me:{label:"Your attributes"},
  attAvg:{label:"Attackers' average"},
  defAvg:{label:"Defenders' average"},
  gk:{label:"Goalkeeper's attributes"},
  ball:{label:"Ball"},
  launch:{label:"Ball's flight"},
  out:{label:"When the ball leaves the pitch"},
  pitch:{label:"Pitch"}
});
// the fields a type uses when it does not say (the wall, the ball's flight and the offside law are for the types that ask)
const DEFAULT_FIELDS = Object.freeze(["role", "possession", "attackers", "defenders", "mates", "opps", "keeper", "positions", "me", "attAvg", "defAvg", "gk", "ball", "out", "pitch"]);
// fields every type has
const ALWAYS = Object.freeze(["me"]);

// the default slots: mine by role, the attacking NPCs' and the defending NPCs' in order
export const ROLE_SLOT = Object.freeze({attacker:"ST", taker:"CM", receiver:"CAM", support:"CM", defender:"CB"});
const ATT_SLOTS = Object.freeze(["LW", "RW", "CAM", "CF", "CM", "CDM"]);
const DEF_SLOTS = Object.freeze(["CB", "LB", "RB", "CDM", "CM", "CB"]);

// my attributes by default (G0 decision e): the held career's skills when a career is held aside (career.js
// heldSkills, a frozen copy of effSkills() taken at the hold), else the editor's Average preset
export function defaultMe(){
  const held = typeof globalThis.heldSkills === "function" ? globalThis.heldSkills() : null;
  return held ? cleanSkills(held, presetSkills("average")) : presetSkills("average");
}

function baseDefaults(){
  return {
    v:VERSION, role:"attacker", possession:"me", attackers:1, defenders:1, wall:0, mates:true, opps:true, keeper:true, offside:false,
    positions:{me:{slot:"", dx:0, dz:0}, att:ATT_SLOTS.map(slot => ({slot, dx:0, dz:0})), def:DEF_SLOTS.map(slot => ({slot, dx:0, dz:0}))},
    me:defaultMe(), attAvg:60, defAvg:60, gk:presetSkills(60, GK_KEYS),
    ball:{at:null, launch:null}, out:"rebound", pitch:"half", opts:{}
  };
}

/* ---------- the types ----------
   registerType(type, schema): schema = {
     name, fields: [field keys it uses] (DEFAULT_FIELDS if left out), roles: [the roles it offers] (all if left out),
     fixed: {key: value} (fields it fixes: not shown, always this value), defaults: {key: value} (its own starting values),
     match: true for an eleven-a-side match (Full Match: the counts are 11 v 11 and the averages are the two teams'),
     labels: {field: label} (its own words for a field),
     options: {key: {label, kind: 'int' | 'num' | 'bool' | 'enum', min, max, step, values: [{v, label}], def,
               when(config) -> bool (shown only then; always if left out), help}}
   }
   A second registration of a type adds to it (a later phase's scenario module adds its options; config.js is never
   edited for that). Returns the schema as kept. */
const TYPES = new Map();
export function registerType(type, schema = {}){
  if (typeof type !== "string" || !type) throw new Error("registerType: a type needs a name");
  const prev = TYPES.get(type);
  const fields = schema.fields ? [...new Set([...ALWAYS, ...schema.fields])] : prev ? prev.fields : [...DEFAULT_FIELDS];
  for (const f of fields) if (!FIELDS[f]) throw new Error(`registerType: "${type}" names an unknown field "${f}"`);
  const roles = (schema.roles || (prev ? prev.roles : ROLES)).filter(r => ROLES.includes(r));
  if (!roles.length) throw new Error(`registerType: "${type}" offers no role (the keeper is never one)`);
  const options = Object.assign({}, prev ? prev.options : {});
  for (const [k, o] of Object.entries(schema.options || {})){
    if (!o || !["int", "num", "bool", "enum"].includes(o.kind)) throw new Error(`registerType: option "${k}" of "${type}" needs a kind`);
    if (o.kind === "enum" && !(o.values && o.values.length)) throw new Error(`registerType: option "${k}" of "${type}" lists no values`);
    options[k] = Object.freeze(Object.assign({}, o));
  }
  const s = Object.freeze({type, name:String(schema.name || (prev && prev.name) || type), fields:Object.freeze(fields), roles:Object.freeze(roles),
    match:schema.match != null ? !!schema.match : !!(prev && prev.match), labels:Object.freeze(Object.assign({}, prev ? prev.labels : {}, schema.labels || {})),
    fixed:Object.freeze(Object.assign({}, prev ? prev.fixed : {}, schema.fixed || {})),
    defaults:Object.freeze(Object.assign({}, prev ? prev.defaults : {}, schema.defaults || {})), options:Object.freeze(options)});
  TYPES.set(type, s);
  return s;
}
export const typeOf = type => TYPES.get(type) || null;
export const labelOf = (type, k) => { const S = TYPES.get(type); return (S && S.labels[k]) || (FIELDS[k] ? FIELDS[k].label : k); };
export const types = () => [...TYPES.keys()];
const schemaOf = type => TYPES.get(type) || TYPES.get("freeplay") || registerType("freeplay", {});
const uses = (S, k) => S.fields.includes(k);

// the starting configuration of a type (a fresh copy)
export const defaults = type => validate(type, defaultsRaw(schemaOf(type)));

/* ---------- validation ----------
   validate(type, anything, notes?) -> a safe configuration of that type. Every field from the input when it is good,
   else the type's default; numbers clamped; enums checked; unknown keys dropped; the type's fixed fields forced; the
   counts kept within the limits (my side at least 1, each side at most 6 with the wall in the defenders', 13 agents
   at most). notes (an array, optional) gets one plain sentence for every limit it had to apply. */
export function validate(type, src, notes = null){
  const S = schemaOf(type);
  const say = t => { if (notes && !notes.includes(t)) notes.push(t); };
  const o = isObj(src) ? src : {};
  const d = defaultsRaw(S);
  const c = {v:VERSION};
  c.role = oneOf(o.role, S.roles, S.roles.includes(d.role) ? d.role : S.roles[0]);
  c.possession = oneOf(o.possession, POSSESSION, d.possession);
  c.attackers = intIn(o.attackers, 0, MAX_SIDE, d.attackers);
  c.defenders = intIn(o.defenders, 0, MAX_SIDE, d.defenders);
  c.wall = uses(S, "wall") ? intIn(o.wall, 0, MAX_SIDE, d.wall) : 0;
  c.mates = boolOr(o.mates, d.mates);
  c.opps = boolOr(o.opps, d.opps);
  c.keeper = boolOr(o.keeper, d.keeper);
  c.offside = uses(S, "offside") ? boolOr(o.offside, d.offside) : false;
  c.positions = cleanPositions(o.positions, d.positions);
  c.me = cleanSkills(isObj(o.me) ? o.me : null, d.me);
  c.attAvg = intIn(o.attAvg, ATTR_MIN, ATTR_MAX, d.attAvg);
  c.defAvg = intIn(o.defAvg, ATTR_MIN, ATTR_MAX, d.defAvg);
  c.gk = cleanSkills(isObj(o.gk) ? o.gk : null, d.gk, GK_KEYS);
  c.ball = cleanBall(o.ball, d.ball, uses(S, "launch"));
  c.out = oneOf(o.out, OUTS, d.out);
  c.pitch = oneOf(o.pitch, PITCHES, d.pitch);
  c.opts = {};
  const oo = isObj(o.opts) ? o.opts : {};
  for (const [k, def] of Object.entries(S.options)) c.opts[k] = cleanOpt(def, oo[k], d.opts[k]);
  // the type's fixed fields
  for (const [k, v] of Object.entries(S.fixed)) c[k] = JSON.parse(JSON.stringify(v));
  // the limits: my side has me (G0 h), the wall stands in the defenders' 6 (G0 d)
  const mine = sideOf(c.role) === "att" ? "attackers" : "defenders";
  if (c[mine] < 1){ c[mine] = 1; say(`You're one of the ${mine}, so there's at least one.`); }
  if (c.wall + c.defenders > MAX_SIDE){
    const keepD = mine === "defenders" ? 1 : 0;
    if (c.wall > MAX_SIDE - keepD){ c.wall = MAX_SIDE - keepD; }
    c.defenders = Math.max(keepD, MAX_SIDE - c.wall);
    say(`The wall counts toward the defenders' six, so there are now ${c.defenders} defender${c.defenders === 1 ? "" : "s"} besides the wall of ${c.wall}.`);
  }
  // (never reached with each side at most 6 and one keeper, kept as the last word on the limit)
  if (c.attackers + c.defenders + c.wall + (c.keeper ? 1 : 0) > MAX_AGENTS){ c.attackers = Math.min(c.attackers, MAX_AGENTS - c.defenders - c.wall - (c.keeper ? 1 : 0)); say("That was more than 13 players, so there are fewer attackers."); }
  return c;
}
// the type's defaults without a validation round (validate() falls back on these)
function defaultsRaw(S){
  const d = baseDefaults();
  if (!S.roles.includes(d.role)) d.role = S.roles[0];
  const own = S.defaults;
  for (const [k, v] of Object.entries(own)) if (k in d && k !== "opts") d[k] = JSON.parse(JSON.stringify(v));
  for (const [k, o] of Object.entries(S.options)) d.opts[k] = o.def !== undefined ? o.def : o.kind === "bool" ? false : o.kind === "enum" ? o.values[0].v : o.min != null ? o.min : 0;
  if (own.opts) Object.assign(d.opts, own.opts);
  for (const [k, v] of Object.entries(S.fixed)) d[k] = JSON.parse(JSON.stringify(v));
  return d;
}
function cleanSpot(p, d){
  const q = isObj(p) ? p : {};
  return {slot:q.slot === "" ? "" : oneOf(q.slot, SLOTS, d.slot), dx:r3(clamp(numOr(q.dx, d.dx), -OFFSET_MAX.dx, OFFSET_MAX.dx)), dz:r3(clamp(numOr(q.dz, d.dz), -OFFSET_MAX.dz, OFFSET_MAX.dz))};
}
function cleanPositions(p, d){
  const q = isObj(p) ? p : {};
  const list = (a, dl) => dl.map((ds, i) => cleanSpot(Array.isArray(a) ? a[i] : null, ds));
  return {me:cleanSpot(q.me, d.me), att:list(q.att, d.att), def:list(q.def, d.def)};
}
const cleanPt = (p, d, lo = 0.11) => ({x:r3(clamp(numOr(p && p.x, d.x), -60, 60)), y:r3(clamp(numOr(p && p.y, d.y), lo, 12)), z:r3(clamp(numOr(p && p.z, d.z), -40, 40))});
function cleanBall(b, d, launchOn){
  const q = isObj(b) ? b : {};
  const at = q.at === null ? null : isObj(q.at) ? cleanPt(q.at, d.at || {x:0, y:0.11, z:0}) : d.at ? cleanPt(d.at, d.at) : null;
  let launch = null;
  if (launchOn){
    const L = q.launch === null ? null : isObj(q.launch) ? q.launch : d.launch;
    if (isObj(L)){
      const dl = isObj(d.launch) ? d.launch : {kind:"pass", target:{x:0, y:0.11, z:0}, speed:14, curl:0};
      launch = {kind:oneOf(L.kind, LAUNCH_KINDS, dl.kind), target:cleanPt(L.target, dl.target),
        speed:r3(clamp(numOr(L.speed, dl.speed), LAUNCH_SPEED.min, LAUNCH_SPEED.max)), curl:r3(clamp(numOr(L.curl, dl.curl || 0), -1, 1))};
    }
  }
  return {at, launch};
}
function cleanOpt(def, v, d){
  if (def.kind === "bool") return boolOr(v, !!d);
  if (def.kind === "enum"){ const vs = def.values.map(x => x.v); return vs.includes(v) ? v : vs.includes(d) ? d : vs[0]; }
  const lo = def.min != null ? def.min : -1e9, hi = def.max != null ? def.max : 1e9;
  const x = clamp(numOr(v, numOr(d, lo)), lo, hi);
  return def.kind === "int" ? Math.round(x) : r3(x);
}

/* ---------- the counts ----------
   who a configuration puts on the pitch: {att, def, wall, keeper, mine, theirs, npcAtt, npcDef, agents}. att and def
   are the outfield players actually spawned on each side (team-mates off or opponents off leave only me on mine and
   nobody on theirs), def with the wall; mine and theirs my side's and the other's; agents everyone, the keeper too */
export function counts(type, cfg){
  const c = cfg && cfg.v === VERSION && cfg.positions ? cfg : validate(type, cfg);
  if (schemaOf(type).match) return {att:11, def:11, wall:0, keeper:true, mine:11, theirs:11, npcAtt:10, npcDef:11, agents:22, meSide:"att"};
  const meAtt = sideOf(c.role) === "att";
  let att = c.attackers, def = c.defenders, wall = c.wall;
  if (meAtt){ if (!c.mates) att = 1; if (!c.opps){ def = 0; wall = 0; } }
  else { if (!c.mates){ def = 1; wall = 0; } if (!c.opps) att = 0; }
  const keeper = !!c.keeper;
  const mine = meAtt ? att : def + wall, theirs = meAtt ? def + wall : att;
  return {att, def:def + wall, wall, keeper, mine, theirs, npcAtt:att - (meAtt ? 1 : 0), npcDef:def + wall - (meAtt ? 0 : 1), agents:att + def + wall + (keeper ? 1 : 0), meSide:meAtt ? "att" : "def"};
}
// "3 v 2" with the keeper: what the sheet's live preview and the preset list say
export function countLine(type, cfg){
  const n = counts(type, cfg);
  return `${n.att} v ${n.def}${n.keeper ? " plus a keeper" : ""}`;
}

/* ---------- relevance ----------
   relevant(type, config) -> the field keys the configuration sheet shows for it now, in the sheet's order, with
   'opt.<key>' for each of the type's own options that applies. A field the type fixes or does not use is never shown;
   a count, an average or the keeper's attributes only when someone they describe is on the pitch. The keeper is never
   a role. */
export function relevant(type, cfg){
  const S = schemaOf(type), c = validate(type, cfg), n = counts(type, c), out = [];
  const show = k => uses(S, k) && !(k in S.fixed);
  if (show("pitch")) out.push("pitch");
  if (show("role") && S.roles.length > 1) out.push("role");
  if (show("mates")) out.push("mates");
  if (show("opps")) out.push("opps");
  const meAtt = n.meSide === "att";
  // a side's count when that side is on: mine with team-mates on, theirs with opponents on
  if (show("attackers") && (meAtt ? c.mates : c.opps)) out.push("attackers");
  if (show("defenders") && (meAtt ? c.opps : c.mates)) out.push("defenders");
  if (show("wall") && (meAtt ? c.opps : c.mates)) out.push("wall");
  if (show("keeper")) out.push("keeper");
  if (show("possession")) out.push("possession");
  if (show("offside")) out.push("offside");
  if (show("out")) out.push("out");
  if (show("positions")) out.push("positions");
  if (show("ball")) out.push("ball");
  if (show("launch")) out.push("launch");
  out.push("me");
  if (show("attAvg") && n.npcAtt > 0) out.push("attAvg");
  if (show("defAvg") && n.npcDef > 0) out.push("defAvg");
  if (show("gk") && n.keeper) out.push("gk");
  for (const [k, o] of Object.entries(S.options)) if (!o.when || o.when(c)) out.push("opt." + k);
  return out;
}

/* ---------- the types Training has from Phase 4 ----------
   The scenario modules of later phases register their own options on these (registerType again adds to a type). */
registerType("freeplay", {name:"Free Play", fields:["mates", "opps", "attackers", "defenders", "keeper", "me", "attAvg", "defAvg", "gk", "out", "pitch", "positions"],
  roles:["attacker"], defaults:{attackers:1, defenders:0, keeper:false, pitch:"full"}});
registerType("attacking", {name:"Attacking", roles:["attacker", "receiver", "support"], defaults:{attackers:2, defenders:2}});
registerType("defending", {name:"Defending", roles:["defender"], defaults:{attackers:1, defenders:1, possession:"opps"}});
registerType("receiving", {name:"Ball Receiving and First Touch", fields:[...DEFAULT_FIELDS, "launch"], roles:["receiver"],
  defaults:{attackers:2, defenders:0, keeper:false, possession:"loose", ball:{at:{x:-6, y:0.11, z:0}, launch:{kind:"pass", target:{x:6, y:0.11, z:0}, speed:14, curl:0}}}});
registerType("scenarios", {name:"Match Scenarios", fields:[...DEFAULT_FIELDS, "offside"], defaults:{attackers:3, defenders:2, offside:true}});
registerType("setpieces", {name:"Set Pieces", roles:["taker", "attacker", "receiver", "support", "defender"], defaults:{role:"taker", attackers:1, defenders:0}});
registerType("freekick", {name:"Free kick", fields:[...DEFAULT_FIELDS, "wall"], roles:["taker", "attacker", "receiver", "support", "defender"],
  defaults:{role:"taker", attackers:1, defenders:0, wall:4}});
registerType("fullmatch", {name:"Full Match", match:true, fields:["role", "me", "attAvg", "defAvg", "gk"], roles:["attacker", "support", "defender"],
  labels:{attAvg:"Your team's average", defAvg:"Opponents' average", gk:"Opponents' keeper"}, fixed:{pitch:"full", out:"stop", offside:true, keeper:true}});

// tests (DESIGN 1.4.20 style)
if (typeof window !== "undefined") window.__trainConfig = {VERSION, registerType, defaults, validate, relevant, counts, countLine, typeOf, types, FIELDS, ROLES, MAX_SIDE, MAX_AGENTS};
