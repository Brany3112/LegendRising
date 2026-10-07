// qa/record-traj.mjs: the golden trajectories of the life world, and the scripts that make them.
// Owner: I0 (DESIGN 2.1). WP-0A's qa/parity.mjs replays these exact scripts through recordFresh() and compares with
// compare(); the integrator re-records after WP-B (movement changes on purpose) and after WP-I (new ground layout).
//
// Each zone gets a 25 s scripted input sequence (1500 steps of 1/60 s) with Math.random seeded and the RAF loop frozen
// (20 s at I0; since WP-B's life body walks at the LIFE profile's 1.7 m/s, DESIGN 1.5.2, the scripts take longer and
// the goldens re-recorded at the P1a integration give every segment its 25 s):
//   home   walk from the bed to the flat door, open it with E, run and sprint down the corridor, walk down two flights
//          of stairs, run back along the floor below, a step to each side, a few steps backwards
//   ground a lap of the training pitch at a run building into a sprint, then the shooting drill and one shot
//   town   a walk out of the bus shelter and along the pavement, into third person, a run down the side street, a
//          walk on and back, a step to each side
// The keys go in through __life.keys (and real keydown events for taps such as E and V); looking is a write to P.yaw
// and P.pitch, exactly what a mouse move does (world.js look()). The script steers towards waypoints, so the same
// script still walks the same route after a deliberate change to movement.
// Every 10 steps it stores P (x, y = feet, z, yaw, pitch, vx, vz, plus eye, speed, sprint), the camera position and
// quaternion, and the bone quaternions of both bodies (ME.tp, the one others see, and ME.fp, the first-person one)
// with each body's root position and yaw.
//
//   node qa/record-traj.mjs                 record every zone twice, require identical results, write the goldens
//   node qa/record-traj.mjs --check         record once and compare with the goldens (tolerance 1e-6)
//   node qa/record-traj.mjs --zones home    only these zones
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {launch, career, freeze, ROOT} from "./lib.mjs";

export const STEPS = 1500, EVERY = 10, DT = 1/60, TOL = 1e-6;
export const GOLDEN = zone => path.join(ROOT, "qa", "golden", `traj-${zone}.json`);

// seed: the page's Math.random from launch (it decides the career: the club, the flat); rseed: Math.random again,
// right before the zone is rebuilt for the recording; minute: the clock (it does not run while the script steps)
export const SCRIPTS = {
  home: {zone: "home", seed: 1, rseed: 101, minute: 12*60, at: "bed", expect: {apt: "304"},
    segs: [
      {go: [-1.5, -5.15], tol: .2, max: 240},               // from the bed to the flat door, walking
      {face: [-1.5, -3.0], max: 60},
      {tap: "e"},                                            // open it
      {wait: 36},
      {go: [-1.5, -3.15], tol: .25, max: 180},              // out into the corridor
      {go: [-8.8, -3.15], run: true, tol: .4, max: 150},    // run, building into a sprint, towards the stairs
      {go: [-10.75, -3.7], tol: .25, max: 120},
      {go: [-10.75, -7.55], tol: .25, max: 240, pitch: -.35},   // down the first flight
      {go: [-12.85, -7.6], tol: .25, max: 120},
      {go: [-12.85, -3.4], tol: .25, max: 240, pitch: -.35},    // and the second, to the floor below
      {go: [-2.2, -3.15], run: true, tol: .4, max: 240, pitch: 0},   // back along that corridor at a run
      {go: [-5.0, -3.15], tol: .3, max: 240},                // a walk back
      {hold: "a", n: 40}, {hold: "d", n: 40},                // a step to each side
      {hold: "s", n: 70},                                    // backwards
      {go: [-7.5, -3.15], run: true, tol: .4, max: 150}      // and off at a run again
    ]},
  ground: {zone: "ground", seed: 1, rseed: 202, minute: 9*60 + 30, at: {x: -2, z: -6, y: 0, yaw: -Math.PI/2},
    segs: [
      {go: [12, -7], run: true, tol: .6, max: 240},          // the lap: up the near side at a run
      {go: [13, -23], run: true, tol: .6, max: 240},         // sprinting up the far wing
      {go: [-3, -24], run: true, tol: .6, max: 240},         // across the far end
      {go: [-8.4, -15.4], tol: .3, max: 300},                // walk to the shooting drill
      {face: [-21.5, -15], max: 60},
      {tap: "e"},                                            // start the drill (it places you at its spot)
      {wait: 30},
      {face: "drill", max: 60},                              // aim at the drill's target
      {drill: "down"}, {wait: 36}, {drill: "up"},            // hold for power, release: one shot
      {wait: 240}
    ]},
  town: {zone: "town", seed: 1, rseed: 303, minute: 12*60, at: "bus",
    segs: [
      {go: [-12, 8.7], tol: .25, max: 120},                  // out of the bus shelter
      {go: [-6.2, 8.7], tol: .3, max: 300},                  // along the pavement
      {go: [-5.3, 13], tol: .3, max: 180},                   // round the corner
      {tap: "v"},                                            // third person
      {wait: 20},
      {go: [-5.3, 30], run: true, tol: .5, max: 300},        // a run down the side street
      {go: [-5.3, 36], tol: .3, max: 240},                   // walking on
      {face: [-5.3, 20], max: 90},
      {go: [-5.3, 24], tol: .3, max: 420},                   // and back up the street
      {hold: "a", n: 30}, {hold: "d", n: 30}                 // a step to each side, seen from behind
    ]}
};

// runs in the page, all in one synchronous call, so nothing asynchronous (a timer, a frame) can land in the middle
function runInPage({name, cfg, STEPS, EVERY, DT}){
  const L = window.__life, P = L.P, keys = L.keys;
  const r9 = v => Math.round(v*1e9)/1e9;
  const wrap = a => { a = (a + Math.PI) % (2*Math.PI); return a < 0 ? a + Math.PI : a - Math.PI; };
  const yawOf = (dx, dz) => Math.atan2(-dx, -dz);
  const key = (type, k) => dispatchEvent(new KeyboardEvent(type, {key: k, bubbles: true}));
  // a fresh start: the clock, the random stream, no keys held, the zone rebuilt, you placed
  for (const k in keys) keys[k] = false;
  S.life.min = cfg.minute;
  window.__qa.seed(cfg.rseed);
  L.enterZone(cfg.zone, cfg.at);
  if (cfg.expect && cfg.expect.apt && S.home.apt !== cfg.expect.apt) throw new Error(`traj ${name}: the career's flat is ${S.home.apt}, the script was written for ${cfg.expect.apt}`);
  const TURN = 6, PITCH = 2;                      // rad/s, how fast the script looks round
  const segs = cfg.segs, marks = [], samples = [], input = {keys: [], taps: [], look: []};
  let si = 0, ss = 0, release = null, lastKeys = "";
  const look = (yawT, pitchT) => {
    let dy = 0, dp = 0;
    if (yawT != null){ const e = wrap(yawT - P.yaw); dy = Math.max(-TURN*DT, Math.min(TURN*DT, e)); }
    if (pitchT != null){ const e = pitchT - P.pitch; dp = Math.max(-PITCH*DT, Math.min(PITCH*DT, e)); }
    if (dy || dp){ P.yaw += dy; P.pitch += dp; input.look.push([k, dy, dp]); }
  };
  const bones = h => { const o = []; if (h) for (const b of h.bones) o.push(r9(b.quaternion.x), r9(b.quaternion.y), r9(b.quaternion.z), r9(b.quaternion.w)); return o; };
  const root = h => h ? [r9(h.g.position.x), r9(h.g.position.y), r9(h.g.position.z), r9(h.g.rotation.y)] : [];
  const sample = () => {
    const c = L.cam, ME = L.ME;
    samples.push({k, P: [P.x, P.feet, P.z, P.yaw, P.pitch, P.vx, P.vz, P.eye, P.speed, P.sprint].map(r9),
      cam: [c.position.x, c.position.y, c.position.z, c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w].map(r9),
      tp: bones(ME.tp), fp: bones(ME.fp), root: root(ME.tp).concat(root(ME.fp))});
  };
  let k = 0;
  sample();
  for (k = 1; k <= STEPS; k++){
    if (release){ key("keyup", release); release = null; }
    keys.w = keys.a = keys.s = keys.d = keys.shift = false;
    for (let guard = 0; guard < 6 && si < segs.length; guard++){
      const g = segs[si];
      if (ss === 0) marks.push([si, k]);
      let done = false;
      if (g.go){
        const dx = g.go[0] - P.x, dz = g.go[1] - P.z, d = Math.hypot(dx, dz);
        if (d < (g.tol || .3) || ss >= (g.max || 240)) done = true;
        else {
          const want = yawOf(dx, dz);
          look(want, g.pitch != null ? g.pitch : null);
          keys.w = Math.abs(wrap(want - P.yaw)) < .6; keys.shift = !!g.run;
        }
      } else if (g.face){
        // a point [x, z], a yaw, or "drill": the running drill's target, in yaw and pitch
        const t = g.face === "drill" ? L.drill && L.drill.tgt : null;
        const want = t ? yawOf(t.x - P.x, t.z - P.z) : Array.isArray(g.face) ? yawOf(g.face[0] - P.x, g.face[1] - P.z) : g.face;
        const pitchT = t ? Math.atan2(t.y - P.eye, Math.hypot(t.x - P.x, t.z - P.z)) : g.pitch != null ? g.pitch : null;
        if ((Math.abs(wrap(want - P.yaw)) < .01 && (pitchT == null || Math.abs(pitchT - P.pitch) < .01)) || ss >= (g.max || 60)) done = true; else look(want, pitchT);
      } else if (g.tap){
        key("keydown", g.tap); release = g.tap; input.taps.push([k, g.tap]); done = "now";
      } else if (g.drill){
        L.drillInput(g.drill, "mouse"); input.taps.push([k, "drill-" + g.drill]); done = "now";
      } else if (g.hold){
        if (ss >= g.n) done = true; else { keys[g.hold] = true; keys.shift = !!g.run; }
      } else if (g.wait != null){
        if (ss >= g.wait) done = true;
      }
      if (done === "now"){ si++; ss = 0; break; }       // a tap takes up its step
      if (done){ si++; ss = 0; continue; }               // a finished segment hands the step to the next one
      ss++; break;
    }
    const ks = Object.keys(keys).filter(q => keys[q]).sort().join(",");
    if (ks !== lastKeys){ input.keys.push([k, ks]); lastKeys = ks; }
    L.step(DT);
    if (k % EVERY === 0) sample();
  }
  if (release) key("keyup", release);
  for (const q in keys) keys[q] = false;
  return {zone: cfg.zone, steps: STEPS, every: EVERY, dt: DT, seed: cfg.seed, rseed: cfg.rseed, minute: cfg.minute,
    apt: S.home && S.home.apt, finished: si >= segs.length, marks, input, samples};
}

// record one zone on a page that has a career in it (frozen, so the world only moves when the script steps it)
export async function recordZone(page, name){
  const cfg = SCRIPTS[name];
  return page.evaluate(runInPage, {name, cfg, STEPS, EVERY, DT});
}

// a fresh browser, frozen before the career starts so no real frame ever runs, the career, the recording
export async function recordFresh(name, {gfx = "low"} = {}){
  const cfg = SCRIPTS[name];
  const {page, close} = await launch({gfx, seed: cfg.seed});
  try {
    await freeze(page);
    await career(page, {zone: cfg.zone, min: cfg.minute, frames: 0});
    const rec = await recordZone(page, name);
    rec.errors = page.errors.slice();
    return rec;
  } finally { await close(); }
}

// every recorded number of a against b: {ok, n, maxErr, worst: {path, a, b}}; structure differences fail outright
export function compare(a, b, tol = TOL){
  let n = 0, maxErr = 0, worst = null, bad = null;
  const walk = (x, y, p) => {
    if (bad) return;
    if (typeof x === "number" && typeof y === "number"){
      n++; const e = Math.abs(x - y);
      if (!(e <= maxErr)){ maxErr = Number.isNaN(e) ? Infinity : e; worst = {path: p, a: x, b: y}; }
      return;
    }
    if (Array.isArray(x) && Array.isArray(y)){ if (x.length !== y.length){ bad = {path: p, why: `length ${x.length} vs ${y.length}`}; return; } x.forEach((v, i) => walk(v, y[i], p + "[" + i + "]")); return; }
    if (x && y && typeof x === "object" && typeof y === "object"){
      const ks = new Set([...Object.keys(x), ...Object.keys(y)]);
      for (const k of ks) if (k !== "errors") walk(x[k], y[k], p + "." + k);
      return;
    }
    if (x !== y) bad = {path: p, why: `${JSON.stringify(x)} vs ${JSON.stringify(y)}`};
  };
  walk(a, b, "");
  return {ok: !bad && maxErr <= tol, n, maxErr, worst, bad};
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain){
  const arg = process.argv.slice(2), check = arg.includes("--check");
  const zi = arg.indexOf("--zones"), zones = zi >= 0 ? arg[zi + 1].split(",") : Object.keys(SCRIPTS);
  let fail = 0;
  for (const z of zones){
    const t0 = Date.now();
    const a = await recordFresh(z);
    if (a.errors.length){ console.log(`${z}: page errors\n  ${a.errors.join("\n  ")}`); fail++; continue; }
    if (!a.finished) console.log(`${z}: warning, the script did not reach its last segment (marks ${JSON.stringify(a.marks)})`);
    if (check){
      const g = JSON.parse(fs.readFileSync(GOLDEN(z), "utf8")), c = compare(a, g);
      console.log(`${z}: ${c.ok ? "matches" : "DIFFERS FROM"} the golden over ${c.n} values, max error ${c.maxErr}${c.worst && !c.ok ? ` at ${c.worst.path} (${c.worst.a} vs ${c.worst.b})` : ""}${c.bad ? `, ${c.bad.path}: ${c.bad.why}` : ""} (${((Date.now() - t0)/1000).toFixed(0)} s)`);
      if (!c.ok) fail++;
      continue;
    }
    const b = await recordFresh(z), c = compare(a, b, 0);
    console.log(`${z}: two recordings ${c.ok ? "identical" : "DIFFER"} over ${c.n} values${c.ok ? "" : `, max ${c.maxErr} at ${c.worst && c.worst.path}${c.bad ? `, ${c.bad.path}: ${c.bad.why}` : ""}`} (${((Date.now() - t0)/1000).toFixed(0)} s)`);
    if (!c.ok){ fail++; continue; }
    delete a.errors;
    fs.mkdirSync(path.dirname(GOLDEN(z)), {recursive: true});
    fs.writeFileSync(GOLDEN(z), JSON.stringify(a) + "\n");
    console.log(`  wrote ${path.relative(ROOT, GOLDEN(z))} (${a.samples.length} samples, finished ${a.finished}, marks ${a.marks.map(m => m.join("@")).join(" ")})`);
  }
  process.exit(fail ? 1 : 0);
}
