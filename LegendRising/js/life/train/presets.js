/* ============ Training Mode: presets ============
   Owner: P4-B (Training Mode Phase 4: presets, quick menu and pause card, reset and replay, pitch switching).
   Contract: BUILD-PLAN Phase 4 "Contracts (P4-B stubs them)", presets.js (list, save, overwrite, saveAs, remove, load)
   and P4-B work item 1; TRAINING-SPEC 4 (presets for every scenario, Free Play and Full Match: Save with a name, Load
   from a list with enough to tell them apart, Edit and overwrite, Save as new, Delete; kept across sessions in the
   game's storage, separated by scenario type, validated so old or incomplete presets load safely; configuration only,
   never runtime state) and 1 (Training never writes the career). INF-9.

   The store is one localStorage key, freyaFootball.trainPresets (never the career save, never in S, never synced to
   the cloud):
     {v: STORE_V, byType: {type: [{id, name, created, updated, config}]}}
   A record holds a configuration and nothing else: every config is passed through config.js validate(type, config)
   on the way in and again on the way out, so a preset saved by an older build, a hand-edited one or a half-written
   one comes back as a safe configuration of its type (defaults for what is missing, values clamped, unknown keys
   dropped). Records with no usable id, a type that is not a plain name, or garbage in place of a record are dropped
   when read. The store has a size cap (LIMITS.bytes) and a cap per type (LIMITS.perType); a save over either is
   refused with a plain sentence and nothing is written.

   list(type)                    -> the type's records, newest first, each with what the Load list shows:
                                    {id, type, name, created, updated, counts: '3v2', att, def, keeper, pitch, pitchName}
   save(type, name, config)      -> {ok, rec, why}: a new record
   overwrite(id, config)         -> {ok, rec, why}: the record's config replaced (its name and created kept)
   saveAs(id, name, config?)     -> {ok, rec, why}: a second record with a new id and name, fresh created and updated,
                                    from config or else the source's own config; the source is left byte-identical
   rename(id, name)              -> {ok, rec, why}
   remove(id)                    -> true when it was there
   load(id)                      -> {id, type, name, config} with the config validated afresh, or null
   get(id)                       -> the stored record (a copy) with its type, or null
   Storage and the clock can be swapped for tests (useStorage, useClock); nothing here touches the DOM. */
import {validate} from "./config.js";

export const KEY = "freyaFootball.trainPresets";
export const STORE_V = 1;
export const LIMITS = Object.freeze({perType:60, bytes:300000, name:40});
const PITCH_NAMES = Object.freeze({full:"Full", half:"Half", onegoal:"One goal"});
const TYPE_RE = /^[A-Za-z0-9_-]{1,40}$/;

const ENV = {storage:null, now:() => Date.now(), seq:0};
// the storage the presets live in (localStorage in the game; a stand-in in the unit tests)
export function useStorage(s){ ENV.storage = s || null; }
export function useClock(fn){ ENV.now = typeof fn === "function" ? fn : () => Date.now(); }
const store = () => ENV.storage || (typeof localStorage !== "undefined" ? localStorage : null);

const isObj = o => !!o && typeof o === "object" && !Array.isArray(o);
const clone = o => JSON.parse(JSON.stringify(o));
const cleanName = (n, d = "Preset") => { const s = String(n == null ? "" : n).replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, LIMITS.name); return s || d; };
const time = (t, d) => Number.isFinite(+t) && +t > 0 ? Math.round(+t) : d;
const safeValidate = (type, cfg) => { try { return validate(type, isObj(cfg) ? cfg : {}); } catch(e){ return null; } };

/* ---------- reading ----------
   The raw store, migrated to the current shape. Older shapes: v 0 or no v with byType (the same records), or a plain
   array of records that each carry their type. A store written by a newer build than this one is read for listing
   but never written over (ro). */
function migrate(raw){
  if (Array.isArray(raw)){
    const byType = {};
    for (const r of raw) if (isObj(r) && typeof r.type === "string") (byType[r.type] || (byType[r.type] = [])).push(r);
    return {v:STORE_V, byType, ro:false};
  }
  if (!isObj(raw)) return {v:STORE_V, byType:{}, ro:false};
  const v = Number.isFinite(+raw.v) ? +raw.v : 0;
  const byType = isObj(raw.byType) ? raw.byType : isObj(raw.presets) ? raw.presets : {};
  return {v:STORE_V, byType, ro:v > STORE_V};
}
// a record made safe for its type, or null when nothing usable is there
function cleanRecord(type, r, now){
  if (!isObj(r)) return null;
  const id = typeof r.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(r.id) ? r.id : null;
  if (!id) return null;
  const config = safeValidate(type, r.config);
  if (!config) return null;
  const created = time(r.created, now), updated = Math.max(created, time(r.updated, created));
  return {id, name:cleanName(r.name), created, updated, config};
}
function read(){
  const S = store(), now = ENV.now();
  let raw = null;
  try { const s = S ? S.getItem(KEY) : null; raw = s ? JSON.parse(s) : null; } catch(e){ raw = null; }
  const m = migrate(raw), out = {v:STORE_V, byType:{}, ro:m.ro};
  const seen = new Set();
  for (const [type, list] of Object.entries(m.byType)){
    if (!TYPE_RE.test(type) || !Array.isArray(list)) continue;
    const keep = [];
    for (const r of list){ const c = cleanRecord(type, r, now); if (c && !seen.has(c.id)){ seen.add(c.id); keep.push(c); } }
    if (keep.length) out.byType[type] = keep.slice(0, LIMITS.perType);
  }
  return out;
}
// the store written back (only what a record is: no runtime state, no flags). Returns null or why it was refused
function write(st){
  if (st.ro) return "These presets were saved by a newer version of the game, so they can't be changed here.";
  const S = store(); if (!S) return "There's nowhere to keep presets in this browser.";
  const out = {v:STORE_V, byType:{}};
  for (const [type, list] of Object.entries(st.byType)) if (list.length) out.byType[type] = list.map(r => ({id:r.id, name:r.name, created:r.created, updated:r.updated, config:r.config}));
  const s = JSON.stringify(out);
  if (s.length > LIMITS.bytes) return "That's more presets than there's room for. Delete one you don't need and try again.";
  try { S.setItem(KEY, s); } catch(e){ return "The browser wouldn't save it (its storage may be full)."; }
  return null;
}
const find = (st, id) => {
  for (const [type, list] of Object.entries(st.byType)){ const i = list.findIndex(r => r.id === id); if (i >= 0) return {type, list, i, rec:list[i]}; }
  return null;
};
function newId(st){
  let id;
  do { id = "p" + ENV.now().toString(36) + (++ENV.seq).toString(36); } while (find(st, id));
  return id;
}

/* ---------- what the Load list shows ---------- */
// the counts a configuration puts on the pitch: attackers v defenders (the wall stands with the defenders, G0 d; with
// team-mates off my side is me alone, with opponents off the other side is empty, G0 h)
export function summary(type, config){
  const c = isObj(config) ? config : {};
  const meDef = c.role === "defender";
  let att = Math.max(0, c.attackers | 0), def = Math.max(0, (c.defenders | 0) + (c.wall | 0));
  if (c.mates === false){ if (meDef) def = Math.min(def, 1); else att = Math.min(att, 1); }
  if (c.opps === false){ if (meDef) att = 0; else def = c.wall | 0; }
  return {type, counts:`${att}v${def}`, att, def, keeper:!!c.keeper, pitch:c.pitch || null, pitchName:PITCH_NAMES[c.pitch] || ""};
}
const view = (type, r) => Object.assign({id:r.id, name:r.name, created:r.created, updated:r.updated}, summary(type, r.config));

/* ---------- the API ---------- */
export function list(type){
  const st = read(), l = st.byType[type] || [];
  return l.map(r => view(type, r)).sort((a, b) => b.updated - a.updated || b.created - a.created || (a.id < b.id ? 1 : -1));
}
export const types = () => Object.keys(read().byType);
export function get(id){
  const f = find(read(), id);
  return f ? Object.assign({type:f.type}, clone(f.rec)) : null;
}
export function load(id){
  const f = find(read(), id);
  if (!f) return null;
  return {id:f.rec.id, type:f.type, name:f.rec.name, config:safeValidate(f.type, f.rec.config)};
}
export function save(type, name, config){
  if (!TYPE_RE.test(String(type))) return {ok:false, why:"That isn't a scenario type presets can be kept for."};
  const st = read(), l = st.byType[type] || (st.byType[type] = []);
  if (l.length >= LIMITS.perType) return {ok:false, why:`You can keep up to ${LIMITS.perType} presets for this. Delete one first.`};
  const cfg = safeValidate(type, config); if (!cfg) return {ok:false, why:"That configuration couldn't be read."};
  const now = ENV.now();
  const rec = {id:newId(st), name:cleanName(name), created:now, updated:now, config:cfg};
  l.push(rec);
  const why = write(st);
  return why ? {ok:false, why} : {ok:true, rec:Object.assign({type}, clone(rec))};
}
export function overwrite(id, config){
  const st = read(), f = find(st, id);
  if (!f) return {ok:false, why:"That preset isn't there any more."};
  const cfg = safeValidate(f.type, config); if (!cfg) return {ok:false, why:"That configuration couldn't be read."};
  f.rec.config = cfg; f.rec.updated = Math.max(f.rec.created, ENV.now());
  const why = write(st);
  return why ? {ok:false, why} : {ok:true, rec:Object.assign({type:f.type}, clone(f.rec))};
}
export function saveAs(id, name, config = null){
  const st = read(), f = find(st, id);
  if (!f) return {ok:false, why:"That preset isn't there any more."};
  if (f.list.length >= LIMITS.perType) return {ok:false, why:`You can keep up to ${LIMITS.perType} presets for this. Delete one first.`};
  const cfg = safeValidate(f.type, config != null ? config : f.rec.config); if (!cfg) return {ok:false, why:"That configuration couldn't be read."};
  const now = ENV.now();
  const rec = {id:newId(st), name:cleanName(name, f.rec.name + " copy"), created:now, updated:now, config:cfg};
  f.list.push(rec);
  const why = write(st);
  return why ? {ok:false, why} : {ok:true, rec:Object.assign({type:f.type}, clone(rec))};
}
export function rename(id, name){
  const st = read(), f = find(st, id);
  if (!f) return {ok:false, why:"That preset isn't there any more."};
  f.rec.name = cleanName(name, f.rec.name); f.rec.updated = Math.max(f.rec.created, ENV.now());
  const why = write(st);
  return why ? {ok:false, why} : {ok:true, rec:Object.assign({type:f.type}, clone(f.rec))};
}
export function remove(id){
  const st = read(), f = find(st, id);
  if (!f) return false;
  f.list.splice(f.i, 1);
  if (!f.list.length) delete st.byType[f.type];
  return !write(st);
}
// the stored record whose configuration is this one exactly (the Training HUD names a scenario started from a preset
// that was loaded and not changed since), or null
export function matching(type, config){
  const l = read().byType[type]; if (!l || !isObj(config)) return null;
  const want = JSON.stringify(safeValidate(type, config));
  let best = null;
  for (const r of l) if (JSON.stringify(r.config) === want && (!best || r.updated > best.updated)) best = r;
  return best ? {id:best.id, name:best.name} : null;
}

// tests (DESIGN 1.4.20 style)
if (typeof window !== "undefined") window.__trainPresets = {KEY, STORE_V, LIMITS, list, types, get, load, save, overwrite, saveAs, rename, remove, matching, summary};
