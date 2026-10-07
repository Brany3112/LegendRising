// qa/wpA-parity.mjs: the WP-0A parity goldens on WP-A's world, with three.js's draws from the random stream counted.
// Owner: WP-A (DESIGN 2.3 WP-A acceptance: "parity goldens of WP-0A still pass (the hash returns the same hits as the
// linear scan)").
//
// three.js gives every geometry, texture, material and object it makes an id drawn from Math.random. WP-A builds a
// place into other objects than before (batched tiles, merged parts, atlas pages), so a zone build draws a different
// number of values from the seeded stream, and whatever draws from it afterwards sees other values: in the ground
// script the shooting drill shuffles its targets with Math.random, so qa/parity.mjs sees another target there and
// everything after it differs, though not one step of movement or collision has changed. This script:
//   1. counts the values a zone build draws, in the I0 tree (git archive of --base, default c7d4760, the tree the
//      goldens were recorded on, served to the same browser from disk) and in this tree, from the same career and seed;
//   2. replays the I0 recorder script (qa/record-traj.mjs) on this tree with the stream moved on, right after the
//      build, by the difference (the values the I0 build drew and this one did not);
//   3. compares every recorded number with qa/golden/traj-<zone>.json as qa/parity.mjs does: all within 1e-6.
// So the trajectories, the camera and both bodies match the goldens exactly; only the ids three.js takes differ.
//
//   QA_PORT=8772 node qa/wpA-parity.mjs [--zones ground] [--base <git ref>]      writes qa/out/wpA-parity.json
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {launch, career, freeze, expect, report, ROOT, OUT, BASE as ORIGIN_URL} from "./lib.mjs";
import {SCRIPTS, GOLDEN, TOL, recordZone, compare} from "./record-traj.mjs";

const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const REF = opt("--base", "c7d4760"), ZONES = opt("--zones", Object.keys(SCRIPTS).join(",")).split(",");
const out = {base: REF, zones: {}, checks: [], ok: true};
const check = (name, ok, detail) => { out.checks.push({name, ok: !!ok, detail}); if (!ok) out.ok = false; console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail !== undefined ? ": " + JSON.stringify(detail) : ""}`); };

// the I0 tree, exported once into qa/out (shared with qa/wpA-ab.mjs)
const BASE = path.join(OUT, `ab-base-${REF}`);
if (!fs.existsSync(path.join(BASE, "index.html"))){
  fs.mkdirSync(BASE, {recursive: true});
  const top = path.dirname(ROOT), sub = path.basename(ROOT), tar = path.join(OUT, `ab-base-${REF}.tar`);
  execFileSync("git", ["archive", "--format=tar", "-o", tar, REF, sub], {cwd: top});
  execFileSync("tar", ["-xf", tar, "-C", BASE, "--strip-components=1"]);
  fs.rmSync(tar);
}
const MIME = {".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png"};

// the draws a zone build makes, in a page standing in the career (after __qa.seed, as the recorder does)
const countBuild = (page, cfg) => page.evaluate(cfg => {
  const L = window.__life;
  for (const k in L.keys) L.keys[k] = false;
  S.life.min = cfg.minute;
  window.__qa.seed(cfg.rseed);
  const orig = Math.random; let n = 0;
  Math.random = function(){ n++; return orig(); };
  try { L.enterZone(cfg.zone, cfg.at); } finally { Math.random = orig; }
  return n;
}, cfg);

for (const zone of ZONES){
  const cfg = SCRIPTS[zone]; if (!cfg){ check(`${zone}: a recorder script`, false, zone); continue; }
  const res = {};
  // 1. the I0 tree's build, served from disk under /__i0/ through the same harness (seeded stream, frozen loop)
  {
    const L = await launch({gfx: "low", seed: cfg.seed});
    try {
      await L.context.route(u => new URL(String(u)).pathname.startsWith("/__i0/"), route => {
        const p = decodeURIComponent(new URL(route.request().url()).pathname).slice("/__i0".length), f = path.join(BASE, p === "/" ? "/index.html" : p);
        fs.readFile(f, (e, d) => e ? route.fulfill({status: 404, body: ""}) : route.fulfill({status: 200, body: d, contentType: MIME[path.extname(f)] || "application/octet-stream"}));
      });
      await L.page.goto(ORIGIN_URL + "__i0/index.html");
      await L.page.waitForFunction(() => typeof newCareer === "function" && typeof window.startLife === "function" && !!window.__life, null, {timeout: 60000});
      await freeze(L.page);
      await career(L.page, {zone: cfg.zone, min: cfg.minute, frames: 0});
      res.drawsI0 = await countBuild(L.page, cfg);
    } finally { await L.close(); }
  }
  // 2. this tree's build
  {
    const L = await launch({gfx: "low", seed: cfg.seed});
    try { await freeze(L.page); await career(L.page, {zone: cfg.zone, min: cfg.minute, frames: 0}); res.drawsNow = await countBuild(L.page, cfg); }
    finally { await L.close(); }
  }
  res.shift = res.drawsI0 - res.drawsNow;
  // 3. the recorder script on this tree, the stream moved on by the difference right after the build
  {
    const L = await launch({gfx: "low", seed: cfg.seed});
    try {
      await freeze(L.page);
      await career(L.page, {zone: cfg.zone, min: cfg.minute, frames: 0});
      await L.page.evaluate(shift => { const life = window.__life, orig = life.enterZone; let once = true;
        life.enterZone = function(...args){ const r = orig.apply(this, args); if (once){ once = false; for (let i = 0; i < shift; i++) Math.random(); } return r; }; }, Math.max(0, res.shift));
      if (res.shift < 0) throw new Error(`this tree's build draws ${-res.shift} more values than the I0 tree's: the stream cannot be moved back`);
      const rec = await recordZone(L.page, zone);
      const c = compare(rec, JSON.parse(fs.readFileSync(GOLDEN(zone), "utf8")), TOL);
      Object.assign(res, {ok: c.ok && !L.errors.length, values: c.n, maxErr: c.maxErr, worst: c.worst, bad: c.bad, errors: L.errors.slice(0, 3)});
    } catch(e){ res.ok = false; res.errors = [String(e && e.message || e)]; }
    finally { await L.close(); }
  }
  out.zones[zone] = res;
  check(`${zone}: every recorded value matches the golden (stream moved on by ${res.shift} draws: the I0 build ${res.drawsI0}, this one ${res.drawsNow})`, res.ok,
    {values: res.values, maxErr: res.maxErr, worst: res.worst, errors: res.errors});
}
report("wpA-parity", out);
console.log(out.ok ? "wpA-parity: pass" : "wpA-parity: FAIL");
expect(out.ok, "wpA-parity failed");
