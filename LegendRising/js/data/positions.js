"use strict";
/* ============ POSITIONS ============
   The seventeen places on a pitch, the shapes a club lines up in, and how a player's preferred position is fitted
   into a shape that may not have it. Everything that asks "where does he play?" goes through here: the creation
   screen's pitch, the club's lineup, the manager's office, the match.

   x runs from the left touchline (0) to the right (100), y from your own goal line (0) to theirs (100).
   arch: the match archetype (POS in game.js: what a game asks of you), world: the squad role (PPOS in career.js),
   line: the line of a lineup it is picked for. A keeper has no archetype: the match has no keeper's job yet. */
const POSITIONS = {
  GK:  {name:"Goalkeeper",            x:50, y:6,  arch:null, world:"GK",  line:"GK"},
  LB:  {name:"Left back",             x:14, y:24, arch:"DF", world:"DF",  line:"DF"},
  CB:  {name:"Centre back",           x:50, y:20, arch:"DF", world:"DF",  line:"DF"},
  RB:  {name:"Right back",            x:86, y:24, arch:"DF", world:"DF",  line:"DF"},
  LWB: {name:"Left wing-back",        x:10, y:40, arch:"DF", world:"DF",  line:"DF"},
  RWB: {name:"Right wing-back",       x:90, y:40, arch:"DF", world:"DF",  line:"DF"},
  CDM: {name:"Defensive midfielder",  x:50, y:36, arch:"CM", world:"CM",  line:"CM"},
  LM:  {name:"Left midfielder",       x:14, y:56, arch:"W",  world:"LW",  line:"FWD"},
  CM:  {name:"Central midfielder",    x:50, y:50, arch:"CM", world:"CM",  line:"CM"},
  RM:  {name:"Right midfielder",      x:86, y:56, arch:"W",  world:"RW",  line:"FWD"},
  CAM: {name:"Attacking midfielder",  x:50, y:65, arch:"AM", world:"CAM", line:"CAM"},
  LW:  {name:"Left winger",           x:16, y:76, arch:"W",  world:"LW",  line:"FWD"},
  RW:  {name:"Right winger",          x:84, y:76, arch:"W",  world:"RW",  line:"FWD"},
  LF:  {name:"Left forward",          x:32, y:84, arch:"ST", world:"LW",  line:"FWD"},
  CF:  {name:"Centre forward",        x:50, y:80, arch:"ST", world:"ST",  line:"FWD"},
  RF:  {name:"Right forward",         x:68, y:84, arch:"ST", world:"RW",  line:"FWD"},
  ST:  {name:"Striker",               x:50, y:90, arch:"ST", world:"ST",  line:"FWD"}
};
const POSITION_ORDER = ["GK", "LB", "CB", "RB", "LWB", "RWB", "CDM", "LM", "CM", "RM", "CAM", "LW", "RW", "LF", "CF", "RF", "ST"];
// what a coach plays you at when your own spot is not in his shape, best first (anything not listed: nearest on the pitch)
const POS_NEAR = {
  ST:["CF", "LF", "RF", "CAM", "LW", "RW"],        CF:["ST", "CAM", "LF", "RF", "CM"],
  LF:["LW", "ST", "CF", "LM"],                     RF:["RW", "ST", "CF", "RM"],
  LW:["LM", "LF", "LWB", "RW", "CAM"],              RW:["RM", "RF", "RWB", "LW", "CAM"],
  CAM:["CM", "CF", "LW", "RW", "ST"],               CM:["CDM", "CAM", "LM", "RM"],
  CDM:["CM", "CB", "CAM"],                          LM:["LW", "LWB", "CM", "LB"],
  RM:["RW", "RWB", "CM", "RB"],                     LWB:["LB", "LM", "LW", "CB"],
  RWB:["RB", "RM", "RW", "CB"],                     LB:["LWB", "CB", "LM"],
  RB:["RWB", "CB", "RM"],                           CB:["CDM", "LB", "RB"],
  GK:[]
};
/* The shapes, keeper first, back to front, left to right within a line. A club keeps one shape (from its name, so
   it costs nothing in the save); a lineup is picked line by line from it. */
const FORMATIONS = {
  "4-3-1-2": ["GK", "LB", "CB", "CB", "RB", "CM", "CDM", "CM", "CAM", "ST", "ST"],
  "4-3-3":   ["GK", "LB", "CB", "CB", "RB", "CM", "CDM", "CM", "LW", "ST", "RW"],
  "4-4-2":   ["GK", "LB", "CB", "CB", "RB", "LM", "CM", "CM", "RM", "ST", "ST"],
  "4-2-3-1": ["GK", "LB", "CB", "CB", "RB", "CDM", "CDM", "LM", "CAM", "RM", "ST"],
  "3-5-2":   ["GK", "CB", "CB", "CB", "LWB", "CM", "CDM", "CM", "RWB", "CF", "ST"],
  "4-3-3 F": ["GK", "LB", "CB", "CB", "RB", "CM", "CDM", "CM", "LF", "CF", "RF"]
};
const FORMATION_KEYS = Object.keys(FORMATIONS);
// a club's shape: fixed by its name (the seeded hash in util.js), the same every time it is asked
function clubFormation(c){
  if (!c) return "4-3-1-2";
  if (c.form && FORMATIONS[c.form]) return c.form;
  const h = typeof hash === "function" ? hash("form:" + c.nm) : 0;
  return FORMATION_KEYS[Math.floor(h*FORMATION_KEYS.length) % FORMATION_KEYS.length];
}
function formationSlots(c){ return FORMATIONS[clubFormation(c)].slice(); }
// how many of a shape go in each line of a lineup: [["GK", 1], ["DF", 4], ...] in the order a lineup is picked
function formationLinesOf(c){
  const n = {};
  for (const s of formationSlots(c)) n[POSITIONS[s].line] = (n[POSITIONS[s].line] || 0) + 1;
  return ["GK", "DF", "CM", "CAM", "FWD"].filter(k => n[k]).map(k => [k, n[k]]);
}
/* How well a player whose position is `pref` fits a slot: 1 his own spot, then down his list of near spots, then
   by distance on the pitch. A keeper only fits in goal, and nobody else does. */
function posFamiliarity(pref, slot){
  if (!POSITIONS[pref] || !POSITIONS[slot]) return 0;
  if (pref === slot) return 1;
  if (pref === "GK" || slot === "GK") return 0;
  const i = (POS_NEAR[pref] || []).indexOf(slot);
  if (i >= 0) return Math.max(.6, .92 - i*.07);
  const a = POSITIONS[pref], b = POSITIONS[slot], d = Math.hypot(a.x - b.x, (a.y - b.y)*1.2);
  return Math.max(.1, .58 - d/220);
}
/* The closest slot to `pref` in `slots` (a shape, or any list of positions). taken: indices already filled, which
   are skipped. Returns {slot, index, fit, natural}, or null when nothing is free. */
function posFit(pref, slots, taken){
  let best = null;
  (slots || []).forEach((s, i) => {
    if (taken && (taken.has ? taken.has(i) : taken.includes(i))) return;
    const f = posFamiliarity(pref, s);
    if (!best || f > best.fit) best = {slot:s, index:i, fit:f, natural:s === pref};
  });
  return best;
}
// a position from an older save, or from anything that only knows the archetype (POS in game.js)
const ARCH_DEFAULT = {ST:"ST", W:"LW", AM:"CAM", CM:"CM", DF:"CB"};
function posOrArch(p){ return POSITIONS[p] ? p : ARCH_DEFAULT[p] || "ST"; }
// the match archetype for a position (a keeper, having no job in a match yet, is played as a defender)
function archOf(p){ const P = POSITIONS[posOrArch(p)]; return (P && P.arch) || "DF"; }
/* Where you play at your club now: your preferred spot fitted into the club's shape, unless the manager has put you
   somewhere else (S.player.asked, the slot he gave you, dropped when you change clubs). Sets S.player.teamPos and
   the archetype the match uses (S.player.pos), and your squad role in the world. Safe to call any time. */
function assignTeamPos(){
  if (typeof S === "undefined" || !S || !S.player) return null;
  const pl = S.player;
  pl.pref = posOrArch(pl.pref || pl.pos);
  const c = typeof myClub === "function" ? myClub() : null;
  const slots = c ? formationSlots(c) : POSITION_ORDER;
  let slot = pl.asked && slots.includes(pl.asked) ? pl.asked : null;
  if (!slot){ const f = posFit(pl.pref, slots); slot = f ? f.slot : pl.pref; }
  pl.teamPos = slot;
  pl.pos = archOf(slot);
  const me = typeof meP === "function" ? meP() : null;
  if (me) me.pos = POSITIONS[slot].world === "GK" ? "DF" : POSITIONS[slot].world;
  return slot;
}
// "Striker" / "Central midfielder (you prefer Attacking midfielder)"
function teamPosText(){
  const pl = S && S.player; if (!pl) return "";
  const t = POSITIONS[pl.teamPos] || POSITIONS[posOrArch(pl.pos)], p = POSITIONS[pl.pref];
  return t ? t.name + (p && pl.pref !== pl.teamPos ? ` (you prefer ${p.name.toLowerCase()})` : "") : "";
}
