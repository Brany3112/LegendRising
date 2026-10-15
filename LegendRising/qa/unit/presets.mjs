// qa/unit/presets.mjs: the Training presets store (js/life/train/presets.js) under plain node.
// Owner: P4-B (TR-4). Contract: BUILD-PLAN P4-B acceptance "qa/unit/presets.mjs"; TRAINING-SPEC 4 (presets for every
// scenario, kept across sessions, separated by type, validated so old or incomplete presets load safely, the setup
// only, never runtime state). Every configuration goes through P4-A's config.js validate.
//
//   node qa/unit/presets.mjs        exits 1 on any failed check; writes qa/out/unit-presets.json
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const res = {name: "unit-presets", checks: [], ok: true};
const check = (pass, name, value) => {
  res.checks.push({name, pass: !!pass, value});
  if (!pass) res.ok = false;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${value === undefined ? "" : ": " + JSON.stringify(value).slice(0, 400)}`);
};

const P = await import(path.join(ROOT, "js/life/train/presets.js"));
const CFG = await import(path.join(ROOT, "js/life/train/config.js"));

// a storage stand-in (localStorage's interface) and a clock that moves on a second a call
class Mem { constructor(){ this.m = new Map(); this.writes = []; } getItem(k){ return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v){ this.writes.push(k); this.m.set(k, String(v)); } removeItem(k){ this.writes.push(k); this.m.delete(k); } clear(){ this.m.clear(); } }
let mem = new Mem(), now = 1760000000000;
P.useStorage(mem); P.useClock(() => (now += 1000));
const fresh = () => { mem = new Mem(); P.useStorage(mem); };
const types = CFG.types ? CFG.types() : [];
const T1 = types.includes("receiving") ? "receiving" : types[0] || "freeplay";
const T2 = types.find(t => t !== T1) || "freeplay";
const deep = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const val = (t, c) => CFG.validate(t, c);

// round trip: the configuration that comes back is the one saved (as validated), and nothing else is kept
{
  fresh();
  const cfg = val(T1, Object.assign(CFG.defaults(T1), {attackers: 3, defenders: 2, keeper: true, pitch: "half"}));
  const r = P.save(T1, "Three against two", cfg);
  check(r.ok && r.rec && typeof r.rec.id === "string", "save gives a record with an id", r);
  const L = P.load(r.rec.id);
  check(L && deep(L.config, cfg) && L.name === "Three against two" && L.type === T1, "round trip: load gives the saved configuration, name and type", L && {name: L.name, type: L.type, same: deep(L.config, cfg)});
  const raw = JSON.parse(mem.getItem(P.KEY));
  check(raw.v === P.STORE_V && Array.isArray(raw.byType[T1]) && raw.byType[T1].length === 1, "the store is {v, byType: {type: [records]}}", raw.v);
  check(Object.keys(raw.byType[T1][0]).sort().join() === "config,created,id,name,updated", "a record holds id, name, created, updated and config only", Object.keys(raw.byType[T1][0]));
  check(mem.writes.every(k => k === P.KEY), "only freyaFootball.trainPresets is ever written", [...new Set(mem.writes)]);
  // runtime state handed in is not kept: a config with an ms, agents or a ball state in it comes back without them
  const r2 = P.save(T1, "With junk", Object.assign({}, cfg, {ms: {t: 3}, agents: [1, 2], T: {}, ballState: {v: 3}}));
  const L2 = P.load(r2.rec.id);
  check(!("ms" in L2.config) && !("agents" in L2.config) && !("T" in L2.config) && !("ballState" in L2.config), "runtime state is never stored (unknown keys dropped)", Object.keys(L2.config));
}

// corrupted JSON, the wrong shape, garbage records
{
  fresh();
  mem.setItem(P.KEY, "{not json");
  check(P.list(T1).length === 0 && P.load("x") === null, "corrupted JSON reads as no presets", P.list(T1));
  const r = P.save(T1, "After the mess", CFG.defaults(T1));
  check(r.ok && P.list(T1).length === 1, "a save after corrupted JSON works (the store is rewritten whole)", P.list(T1).length);
  mem.setItem(P.KEY, JSON.stringify({v: 1, byType: {[T1]: [null, 4, "x", {name: "no id"}, {id: "bad id with spaces", config: {}}, {id: "ok1", name: "Good", config: {attackers: 2}}], "bad type!": [{id: "z1", config: {}}], [T2]: "not a list"}}));
  const l = P.list(T1);
  check(l.length === 1 && l[0].id === "ok1" && l[0].name === "Good", "garbage records, bad ids and bad types are dropped; the good one stays", l);
}

// an old version and missing fields: safe defaults for the type
{
  fresh();
  // the store's own old shapes: no v, a plain list of records each with its type
  mem.setItem(P.KEY, JSON.stringify([{type: T1, id: "old1", name: "Old list", config: {attackers: 2}}]));
  const l0 = P.list(T1);
  check(l0.length === 1 && l0[0].name === "Old list", "an old store (a plain list of records) is read", l0);
  mem.setItem(P.KEY, JSON.stringify({byType: {[T1]: [{id: "old2", name: "Old map", created: 5, config: {v: 0, attackers: 4, defenders: 9, keeper: "yes", pitch: "moon", role: "goalkeeper"}}]}}));
  const L = P.load("old2"), d = CFG.defaults(T1);
  check(!!L && L.config.v === CFG.VERSION, "an old-version configuration comes back at the current version", L && L.config.v);
  check(L.config.defenders <= 6 && L.config.pitch === d.pitch && typeof L.config.keeper === "boolean" && L.config.role !== "goalkeeper",
    "its bad values are made safe: counts clamped, an unknown pitch and a keeper role replaced", {def: L.config.defenders, pitch: L.config.pitch, keeper: L.config.keeper, role: L.config.role});
  check(L.config.attackers === 4, "its good values are kept", L.config.attackers);
  const g = P.get("old2");
  check(g.updated >= g.created && g.created === 5, "missing times are filled in (updated never before created)", g);
  // a record with no config at all, or half of one
  mem.setItem(P.KEY, JSON.stringify({v: 1, byType: {[T1]: [{id: "half1", name: "Half", config: {attackers: 3}}, {id: "none1", name: "None"}]}}));
  const H = P.load("half1"), N = P.load("none1");
  check(!!H && deep(H.config, val(T1, {attackers: 3})), "a partial configuration loads as that plus the type's defaults", H && H.config.attackers);
  check(!!N && deep(N.config, CFG.defaults(T1)), "a record with no configuration loads as the type's defaults", !!N);
  // a store from a newer build is listed but never written over
  mem.setItem(P.KEY, JSON.stringify({v: P.STORE_V + 1, byType: {[T1]: [{id: "new1", name: "Newer", config: {}}]}}));
  const before = mem.getItem(P.KEY), rr = P.save(T1, "x", {});
  check(P.list(T1).length === 1 && !rr.ok && mem.getItem(P.KEY) === before, "a newer build's store is read but never overwritten", rr.why);
}

// unknown keys dropped, separation by type
{
  fresh();
  const a = P.save(T1, "A", CFG.defaults(T1)), b = P.save(T2, "B", CFG.defaults(T2));
  const raw = JSON.parse(mem.getItem(P.KEY));
  raw.byType[T1][0].secret = 1; raw.junk = 2; raw.byType[T1][0].config.zzz = 3;
  mem.setItem(P.KEY, JSON.stringify(raw));
  const g = P.get(a.rec.id);
  check(!("secret" in g) && !("zzz" in g.config), "unknown keys are dropped (record and configuration)", Object.keys(g));
  check(P.list(T1).map(x => x.name).join() === "A" && P.list(T2).map(x => x.name).join() === "B", "presets are separated by type", {[T1]: P.list(T1).map(x => x.name), [T2]: P.list(T2).map(x => x.name)});
  check(P.list("nosuchtype").length === 0, "a type with none lists none", P.list("nosuchtype"));
}

// delete and overwrite
{
  fresh();
  const c1 = val(T1, Object.assign(CFG.defaults(T1), {attackers: 2})), c2 = val(T1, Object.assign(CFG.defaults(T1), {attackers: 5}));
  const a = P.save(T1, "Keep", c1), b = P.save(T1, "Change", c1);
  const before = P.get(b.rec.id), keep = JSON.stringify(P.get(a.rec.id));
  const o = P.overwrite(b.rec.id, c2), after = P.get(b.rec.id);
  check(o.ok && deep(after.config, c2) && after.name === "Change" && after.created === before.created && after.updated > before.updated, "overwrite replaces the configuration, keeps the name and created, moves updated on", {created: [before.created, after.created], updated: [before.updated, after.updated]});
  check(JSON.stringify(P.get(a.rec.id)) === keep, "overwrite leaves the other presets alone", null);
  check(!P.overwrite("nope", c2).ok, "overwriting one that is not there says so", null);
  check(P.remove(a.rec.id) === true && P.get(a.rec.id) === null && P.list(T1).length === 1, "delete takes it away", P.list(T1).length);
  check(P.remove(a.rec.id) === false, "deleting it again does nothing", null);
}

// save as new
{
  fresh();
  const c1 = val(T1, Object.assign(CFG.defaults(T1), {attackers: 2, keeper: false})), c2 = val(T1, Object.assign(CFG.defaults(T1), {attackers: 4, keeper: true}));
  const a = P.save(T1, "Original", c1);
  const srcBytes = JSON.stringify(JSON.parse(mem.getItem(P.KEY)).byType[T1].find(r => r.id === a.rec.id));
  const s = P.saveAs(a.rec.id, "The copy", c2);
  const rows = JSON.parse(mem.getItem(P.KEY)).byType[T1];
  const srcAfter = JSON.stringify(rows.find(r => r.id === a.rec.id)), copy = rows.find(r => r.id === s.rec.id);
  check(s.ok && s.rec.id !== a.rec.id && copy && copy.name === "The copy", "save as new makes a second record with a new id and the new name", s.rec && {id: s.rec.id, name: s.rec.name});
  check(copy.created > a.rec.created && copy.updated === copy.created, "the new record has fresh created and updated", {src: a.rec.created, copy: [copy.created, copy.updated]});
  check(srcAfter === srcBytes, "the source record is left byte-identical", null);
  check(deep(P.load(a.rec.id).config, c1) && deep(P.load(s.rec.id).config, c2), "loading each gives its own configuration", null);
  const s2 = P.saveAs(a.rec.id, "Plain copy");
  check(s2.ok && deep(P.load(s2.rec.id).config, c1), "save as new with no configuration copies the source's", null);
}

// what the Load list shows
{
  fresh();
  const mk = (o, name) => P.save(T1, name, val(T1, Object.assign(CFG.defaults(T1), o)));
  // (team-mates and opponents on, so the counts are the ones set; config.js counts() is what the list must agree with)
  mk({attackers: 3, defenders: 2, keeper: true, pitch: "half", mates: true, opps: true}, "Three v two");
  mk({attackers: 2, defenders: 3, keeper: false, pitch: "full", mates: true, opps: true}, "Two v three");
  mk({attackers: 6, defenders: 6, keeper: true, pitch: "onegoal", mates: true, opps: true}, "Six a side");
  const l = P.list(T1);
  check(l.map(x => x.name).join("|") === "Six a side|Two v three|Three v two", "the list is newest first", l.map(x => x.name));
  const want = {"Three v two": ["3v2", true, "half", "Half"], "Two v three": ["2v3", false, "full", "Full"], "Six a side": ["6v6", true, "onegoal", "One goal"]};
  const ok = l.every(r => { const w = want[r.name]; const c = P.load(r.id).config; return w && r.type === T1 && r.counts === w[0] && r.keeper === w[1] && r.pitch === w[2] && r.pitchName === w[3]
    && r.keeper === c.keeper && r.pitch === c.pitch && r.counts === `${CFG.counts(T1, c).att}v${CFG.counts(T1, c).def}` && Number.isFinite(r.updated) && Number.isFinite(r.created); });
  check(ok && l.every(r => ["id", "name", "type", "counts", "keeper", "pitch", "pitchName", "updated"].every(k => k in r)), "each row has the name, type, counts (3v2), keeper, pitch and updated time, matching the stored configuration", l);
  // team-mates off: my side is me alone; opponents off: nobody on the other side (G0 h)
  const s = P.summary(T1, val(T1, Object.assign(CFG.defaults(T1), {role: "attacker", attackers: 4, defenders: 3, mates: false, opps: false})));
  check(s.counts === "1v0", "counts follow team-mates off and opponents off", s);
}

// limits: names cut to size, empty names named, the per-type cap
{
  fresh();
  const r = P.save(T1, "   ", CFG.defaults(T1)), r2 = P.save(T1, "x".repeat(100), CFG.defaults(T1));
  check(r.rec.name === "Preset" && r2.rec.name.length === P.LIMITS.name, "an empty name becomes Preset, a long one is cut", [r.rec.name, r2.rec.name.length]);
  for (let i = P.list(T1).length; i < P.LIMITS.perType; i++) P.save(T1, "n" + i, CFG.defaults(T1));
  const over = P.save(T1, "one too many", CFG.defaults(T1));
  check(!over.ok && P.list(T1).length === P.LIMITS.perType && /Delete one/.test(over.why), "a type holds at most LIMITS.perType presets and says so", over.why);
  check(mem.getItem(P.KEY).length <= P.LIMITS.bytes, "the store stays under its size cap", mem.getItem(P.KEY).length);
  check(!(over.why + r.rec.name).includes(String.fromCharCode(0x2014)), "no em dash in what it says", null);
}

// matching: the stored preset whose configuration a started one is exactly
{
  fresh();
  const c = val(T1, Object.assign(CFG.defaults(T1), {attackers: 2})), a = P.save(T1, "Mine", c);
  check(P.matching(T1, c) && P.matching(T1, c).name === "Mine", "a configuration loaded from a preset is matched to it", P.matching(T1, c));
  check(P.matching(T1, val(T1, Object.assign({}, c, {attackers: 3}))) === null, "a changed one is not", null);
}

fs.mkdirSync(path.join(ROOT, "qa/out"), {recursive: true});
fs.writeFileSync(path.join(ROOT, "qa/out/unit-presets.json"), JSON.stringify(res, null, 1));
if (!res.ok){ console.error("unit-presets: FAIL"); process.exit(1); }
console.log("unit-presets: pass");
