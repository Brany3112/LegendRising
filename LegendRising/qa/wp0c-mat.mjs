// qa/wp0c-mat.mjs: material routing (DESIGN 2.2 WP-0C, 3.9.1 "rematerialize(scene) from userData.spec").
// Owner: WP-0C.
//
// Three checks, all on High (localStorage freyaFootball.gfx = "high"), at 1280 x 720, noon, with the RAF loop frozen:
//   lint     no `new MeshStandardMaterial` outside build.js, human.js, sky.js and football/crowd.js: every lit material
//            comes from mat() (the same gate as qa/lint-rules.json "standard-material-routing", on at WP-0C's merge)
//   spec     in home, ground and town every mesh material of a class the presets choose between (Standard, Lambert,
//            Phong, Physical) carries userData.spec, the human body's shared material aside (human.js, its own path);
//            so do the pieces built on demand (cars, the bus, gym bars and bells, the things you carry, furniture
//            models). Each spec is plain data and makes the material again: remat() on High gives the same material,
//            and High to Low to High gives back what High built (roughness and metalness come back from the spec);
//            on Medium it is Standard exactly for the kinds in GFX_PRESETS.medium.standardKinds and Lambert otherwise;
//            a whole scene rematerialised to Low and back draws the same picture
//   views    the fixed High views below, each drawn from the canvas alone (no HUD), against the same views drawn by
//            the tree before the change: at most 0.5% of pixels may differ by more than 8/255 in any channel
//
//   node qa/wp0c-mat.mjs --base <git ref>    every check, the reference views drawn from that commit first (the
//                                            stage base: c7d4760), exported with git archive into a temporary folder
//                                            with this script copied in and served on QA_PORT + 1
//   node qa/wp0c-mat.mjs --before <dir>      every check, the views compared with <dir>
//   node qa/wp0c-mat.mjs                     every check; the views are compared with qa/out/wp0c-before when that
//                                            exists, and only captured (into qa/out/wp0c-after) when it does not
//                                            (a capture left from an older tree also holds every later change to the
//                                            picture, the sun's path and the sky among them: to check one change alone,
//                                            use --base with the commit before it)
//   node qa/wp0c-mat.mjs --capture <dir>     only draw the views of this tree into <dir>/<view>.png
//   node qa/wp0c-mat.mjs --only lint,spec    a subset
//   node qa/wp0c-mat.mjs --capture <dir> --gfx low      the views on another tier, to look at (nothing is checked)
//   node qa/wp0c-mat.mjs --compare <dirA> <dirB>        two captures side by side
// Writes qa/out/wp0c-mat.json.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {launch, career, freeze, ROOT, OUT, PORT, report} from "./lib.mjs";

const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const ONLY = opt("--only") ? opt("--only").split(",") : null, want = k => !ONLY || ONLY.includes(k);
const MAX_SHARE = .005, MAX_DELTA = 8;
const GFX_TIER = opt("--gfx") || "high";      // --capture only: the tier to draw the views on (the checks are on High)

// the views: where you stand and look (pitch: up is positive), and what is set down in front of you for the picture
// (spawn, in metres right, up and ahead of your eye; the same in every tree, so the reference has it too)
export const VIEWS = [
  {name: "bedroom", zone: "home", at: "bed", look: "pane", bulb: true, pitch: .02},
  {name: "lobby-things", zone: "home", at: {x: -9.5, z: -1, y: .12, yaw: Math.PI}, pitch: -.12, spawn: "things"},
  {name: "street-cars", zone: "home", at: {x: 3, z: 10, y: .12, yaw: Math.PI/2}, pitch: -.04, spawn: "cars"},
  {name: "store-screens", zone: "home", at: {x: -23.5, z: -5.5, y: .12, yaw: Math.PI}, pitch: -.1, spawn: "screens"},
  {name: "gym-bells", zone: "ground", at: "gym", pitch: -.12, spawn: "bells"},
  {name: "town-houses", zone: "town", at: {x: 0, z: 24, y: .12, yaw: Math.PI}, pitch: .12},
  {name: "flat-door", zone: "home", at: "plate", lock: true, pitch: -.12}
];

/* ---------- lint ---------- */
function lint(){
  const allowed = new Set(["js/life/build.js", "js/life/human.js", "js/life/sky.js", "js/life/football/crowd.js"]);
  const files = [], walk = d => { for (const e of fs.readdirSync(d, {withFileTypes: true})){ const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (f.endsWith(".js")) files.push(f); } };
  walk(path.join(ROOT, "js"));
  const hits = [];
  for (const f of files){
    const rel = path.relative(ROOT, f).split(path.sep).join("/");
    if (allowed.has(rel)) continue;
    // comments blanked (a line comment, or the inside of a block comment), so only code can match
    let inBlock = false;
    fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      let code = "";
      for (let k = 0; k < line.length; k++){
        if (inBlock){ if (line[k] === "*" && line[k + 1] === "/"){ inBlock = false; k++; } continue; }
        if (line[k] === "/" && line[k + 1] === "*"){ inBlock = true; k++; continue; }
        if (line[k] === "/" && line[k + 1] === "/" && !/["'`]/.test(line.slice(0, k).replace(/(["'`])(?:\\.|(?!\1).)*\1/g, ""))) break;
        code += line[k];
      }
      if (/\bnew\s+(?:THREE\s*\.\s*)?MeshStandardMaterial\b/.test(code)) hits.push(`${rel}:${i + 1}`);
    });
  }
  return {ok: hits.length === 0, files: files.length, hits};
}

/* ---------- in the page ---------- */
// you at the view, what it asks for set down in front of you, a few frames lived, nothing drawn yet
async function setView(view){
  const L = window.__life, P = L.P;
  for (const k in L.keys) L.keys[k] = false;
  S.life.min = 12*60;
  // a bulb in the light of your flat, switched on
  if (S.home && S.home.fx){ S.home.fx.bulb = !!view.bulb; S.home.light = !!view.bulb; }
  // the new lock on your door, locked: its light shows red
  if (S.home && S.home.fx && view.lock){ S.home.fx.lock = "new"; S.home.fx.locked = true; }
  L.enterZone(view.zone, typeof view.at === "string" && view.at !== "gym" && view.at !== "plate" ? view.at : "bus");
  let at = view.at;
  if (at === "plate"){
    // in the corridor, 80 cm from the number plate on your flat's door, facing it, the lock in sight
    const pm = L.HOME.door && L.HOME.door.plate;
    if (!pm) throw new Error("no number plate on your door");
    pm.updateWorldMatrix(true, false);
    const p = pm.getWorldPosition(new pm.position.constructor()), n = pm.getWorldDirection(new pm.position.constructor());
    at = {x: p.x + n.x*.8 + n.z*.15, z: p.z + n.z*.8 - n.x*.15, y: p.y - 1.62 + .026, yaw: Math.atan2(n.x, n.z)};
  }
  if (at === "gym"){
    // three metres in front of the first squat rack of the club's gym, facing it
    const st = (L.W.stations.squat || [])[0];
    if (!st) throw new Error("no squat rack at the ground");
    const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw);
    at = {x: st.x - fx*3.2 + fz*.7, z: st.z - fz*3.2 - fx*.7, y: 0, yaw: st.yaw};
  }
  if (typeof at === "object") L.place(at);
  if (view.look === "pane" && L.HOME.pane){
    // turned to your window: the pane, the curtains either side
    const q = L.HOME.pane, cx = (q.x0 + q.x1)/2 + .5;
    P.yaw = Math.atan2(-(cx - P.x), -(q.z - P.z));
  }
  P.pitch = view.pitch || 0;
  const sc = L.scene(), fw = {x: -Math.sin(P.yaw), z: -Math.cos(P.yaw)}, rt = {x: Math.cos(P.yaw), z: -Math.sin(P.yaw)};
  const put = (o, r, u, a, turn = 0) => { o.position.set(P.x + rt.x*r + fw.x*a, P.feet + u, P.z + rt.z*r + fw.z*a); o.rotation.y = P.yaw + turn; o.userData.wp0c = true; sc.add(o); return o; };
  if (view.spawn === "things"){
    const INV = await import("/js/life/inv.js");
    const list = [{id: "plate", text: "12"}, {id: "bulb"}, {id: "paper", col: 0xd8c8a8}, {id: "bag"}, {id: "box", dims: [.5, .35, .4], label: "Wardrobe"}];
    list.forEach((it, i) => { const m = INV.itemMesh(it); put(m, -.9 + i*.45, 1.15 - (it.id === "box" ? .35 : 0), 1.4, Math.PI + .4); if (it.id === "paper") m.rotation.z = Math.PI/2; });
  } else if (view.spawn === "cars"){
    const C = await import("/js/life/cars.js");
    const a = put(C.car("hatch", 0x2c66b8), -3.5, 0, 9, Math.PI/2), b = put(C.car("hatch", 0xc9a24a), 3.5, 0, 11, -Math.PI/2);
    b.userData.lamps(true);
    put(C.bus(), 0, 0, 20, Math.PI/2);
    for (const o of [a, b]) for (const w of o.userData.wheels) w.rotation.z = .3;
  } else if (view.spawn === "screens"){
    const F = await import("/js/life/furniture.js");
    const ids = Object.keys(FURN), pick = kind => ids.find(id => FURN[id].kind === kind);
    const tv = F.pieceModel(pick("tv")), lap = F.pieceModel(pick("laptop")), fr = F.pieceModel(ids.filter(id => FURN[id].kind === "fridge").pop());
    put(tv.g, -.7, .1, 2.2); put(lap.g, .45, .75, 1.6); put(fr.g, 1.4, 0, 2.6, -.5);
  } else if (view.spawn === "bells"){
    const G = await import("/js/life/gymclub.js");
    put(G.dumbbell(0xe2722e), -.35, .9, 1.4, .3); put(G.dumbbell(), .35, .9, 1.4, -.2);
    put(G.barbell(1), 0, .55, 2.0, .1);
  }
  L.stepN(30);
  return {zone: L.LIFE.zone, at: [P.x, P.feet, P.z, P.yaw, P.pitch].map(v => +v.toFixed(3))};
}
// (the shadows redrawn for this very frame: with the loop frozen a plain needsUpdate is only a request to WP-A's shadow
// scheduler (quality.js gateShadows), granted on a later frame that never comes, and the map would be the one left from
// before the view was set. force() is the scheduler's own grant for a frame drawn out of turn)
function drawView(){
  const L = window.__life, R = L.renderer(), SK = L.sky && L.sky(), sh = SK && SK.shadow;
  if (sh && sh.force) sh.force(); else R.shadowMap.needsUpdate = true;
  R.render(L.scene(), L.cam);
  return R.domElement.toDataURL("image/png");
}

// the spec checks over the zone you are in (and, once, the pieces built on demand)
async function specCheck(withBuilt){
  const L = window.__life, sc = L.scene();
  const B = await import("/js/life/build.js"), H = await import("/js/life/human.js");
  const KINDS = B.MAT_KINDS || [];
  const lit = m => !!(m && (m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshPhysicalMaterial));
  const humanBody = o => { for (let p = o; p; p = p.parent) if (p.userData && p.userData.human) return true; return false; };
  const res = {mats: 0, meshes: 0, missing: [], bad: [], kinds: {}, built: 0, remat: {same: 0, diff: []}, cycle: {same: 0, diff: []},
    medium: {lambert: 0, standard: 0, diff: []}};
  const where = o => { const n = []; for (let p = o; p && p !== sc; p = p.parent) n.push(p.name || p.type); return n.slice(0, 3).join("<") + ` @${o.getWorldPosition(new B.THREE.Vector3()).toArray().map(v => v.toFixed(1)).join(",")}`; };
  const seen = new Map();
  const visit = (o, tag) => {
    if (!o.isMesh || humanBody(o)) return;
    res.meshes++;
    for (const m of [].concat(o.material)){
      if (!lit(m) || m === H.humanMaterial()) continue;
      if (seen.has(m)) continue;
      seen.set(m, tag + " " + where(o));
      res.mats++;
      const sp = m.userData && m.userData.spec;
      if (!sp){ res.missing.push(`${m.type} ${seen.get(m)}`); continue; }
      res.kinds[sp.kind] = (res.kinds[sp.kind] || 0) + 1;
      let json = null; try { json = JSON.stringify(sp); } catch(e){}
      if (!KINDS.includes(sp.kind) || !sp.o || typeof sp.o !== "object" || !json || /isTexture|"uuid"/.test(json)) res.bad.push(`${m.type} ${seen.get(m)}: ${json && json.slice(0, 160)}`);
    }
  };
  sc.traverse(o => visit(o, "scene"));
  if (withBuilt){
    // what is built only when it is needed: every one of them goes through mat() too
    const C = await import("/js/life/cars.js"), G = await import("/js/life/gymclub.js"), INV = await import("/js/life/inv.js"), F = await import("/js/life/furniture.js");
    const made = [C.car("hatch", 0x2c66b8), C.bus(), G.barbell(1), G.barbell(4), G.dumbbell()];
    for (const id of Object.keys(INV.ITEMS)) made.push(INV.itemMesh({id, text: "7", dims: [.5, .4, .4], label: "Box", col: 0xd8c8a8}));
    for (const id of Object.keys(FURN)){ const p = F.pieceModel(id); if (p) made.push(p.g); }
    res.built = made.length;
    for (const g of made) g.traverse(o => visit(o, "built"));
  }
  // remat: the same material again from its spec, under the same preset, and High to Low to High
  const P = ["type", "color", "emissive", "emissiveIntensity", "roughness", "metalness", "envMapIntensity", "opacity", "transparent", "side", "depthWrite",
    "alphaTest", "vertexColors", "map", "emissiveMap", "flatShading", "polygonOffset", "polygonOffsetFactor", "polygonOffsetUnits", "toneMapped", "blending"];
  const val = (m, k) => { const v = m[k]; return v && v.isColor ? v.getHexString() : v && v.isTexture ? "tex:" + v.uuid : v; };
  const diff = (a, b) => P.filter(k => (k in a || k in b) && val(a, k) !== val(b, k)).map(k => `${k}: ${val(a, k)} / ${val(b, k)}`);
  const lowWas = GFX.low;
  for (const [m, tag] of seen){
    if (!m.userData.spec) continue;
    const r = B.remat(m), d = diff(m, r);
    if (d.length) res.remat.diff.push(`${tag}: ${d.join("; ")}`); else res.remat.same++;
    // (Low is the Low preset object since WP-A, DESIGN 1.4.4: every 3D module reads GFX.P, the flag GFX.low only follows it)
    const Plow = GFX.P; GFX.low = true; GFX.P = GFX_PRESETS.low; const lo = B.remat(m); GFX.low = lowWas; GFX.P = Plow;
    const hi = B.remat(lo), d2 = lo.isMeshLambertMaterial ? diff(m, hi) : ["Low made " + lo.type];
    if (d2.length) res.cycle.diff.push(`${tag}: ${d2.join("; ")}`); else res.cycle.same++;
    // Medium (1.4.4 material "mixed"): Standard for the kinds in its standardKinds, Lambert for the rest
    const Pwas = GFX.P, MED = GFX_PRESETS.medium; GFX.P = MED; const md = B.remat(m); GFX.P = Pwas;
    const wantStd = MED.standardKinds.includes(m.userData.spec.kind);
    if (!!md.isMeshStandardMaterial !== wantStd) res.medium.diff.push(`${tag}: ${m.userData.spec.kind} made ${md.type}`);
    else res.medium[wantStd ? "standard" : "lambert"]++;
    for (const x of [r, lo, hi, md]) x.dispose();
  }
  res.remat.diff = res.remat.diff.slice(0, 12); res.cycle.diff = res.cycle.diff.slice(0, 12); res.medium.diff = res.medium.diff.slice(0, 12);
  return res;
}
// every distinct material in the scene swapped for its remat() on Low and then again on High (shared ones staying
// shared, as quality.js rematerialize will), the frame drawn again
async function rematScene(){
  const L = window.__life, sc = L.scene(), B = await import("/js/life/build.js"), lowWas = GFX.low, Pwas = GFX.P;
  const pass = low => {
    GFX.low = low; GFX.P = low ? GFX_PRESETS.low : Pwas; const map = new Map(); let n = 0;
    sc.traverse(o => {
      if (!o.isMesh || !o.material) return;
      const one = m => { if (!m || !m.userData || !m.userData.spec) return m; if (!map.has(m)){ map.set(m, B.remat(m)); n++; } return map.get(m); };
      o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
    });
    for (const k in L.W.mats) if (map.has(L.W.mats[k])) L.W.mats[k] = map.get(L.W.mats[k]);
    for (const m of map.keys()) m.dispose();
    GFX.low = lowWas; GFX.P = Pwas; return n;
  };
  return {low: pass(true), high: pass(false)};
}

/* ---------- pictures ---------- */
const png = url => Buffer.from(url.split(",")[1], "base64");
// share of pixels differing by more than MAX_DELTA/255 in any channel, worked out in a page (no PNG decoder here)
async function compare(page, a, b){
  return page.evaluate(async ({a, b, D}) => {
    const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const [A, B] = await Promise.all([load(a), load(b)]);
    if (A.width !== B.width || A.height !== B.height) return {share: 1, why: `size ${A.width}x${A.height} / ${B.width}x${B.height}`};
    const px = img => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
    const p = px(A), q = px(B); let n = 0, max = 0;
    for (let i = 0; i < p.length; i += 4){
      const d = Math.max(Math.abs(p[i] - q[i]), Math.abs(p[i + 1] - q[i + 1]), Math.abs(p[i + 2] - q[i + 2]));
      if (d > D) n++; if (d > max) max = d;
    }
    return {share: n/(p.length/4), over: n, max};
  }, {a: "data:image/png;base64," + a.toString("base64"), b: "data:image/png;base64," + b.toString("base64"), D: MAX_DELTA});
}

async function captureAll(dir, {checks = false} = {}){
  fs.mkdirSync(dir, {recursive: true});
  const out = {views: [], spec: {}, rematScene: null, errors: []};
  const {page, close} = await launch({gfx: checks ? "high" : GFX_TIER, seed: 1});
  try {
    await freeze(page);
    await career(page, {zone: "home", min: 12*60, frames: 0});
    for (const v of VIEWS){
      const where = await page.evaluate(setView, v);
      const url = await page.evaluate(drawView);
      fs.writeFileSync(path.join(dir, v.name + ".png"), png(url));
      out.views.push({name: v.name, ...where});
      console.log(`${v.name}: drawn (${where.zone} at ${where.at.join(", ")})`);
    }
    if (checks){
      let built = true;
      for (const zone of ["home", "ground", "town"]){
        await page.evaluate(setView, {zone, at: "bus"});
        out.spec[zone] = await page.evaluate(specCheck, built); built = false;
      }
      // a whole scene rematerialised to Low and back draws what High built (after the views, which it must not touch)
      const v = VIEWS[0];
      await page.evaluate(setView, v);
      const a = png(await page.evaluate(drawView)), n = await page.evaluate(rematScene), b = png(await page.evaluate(drawView));
      out.rematScene = {view: v.name, ...n, ...(await compare(page, a, b))};
      fs.writeFileSync(path.join(dir, v.name + "-remat.png"), b);
    }
  } catch(e){ page.errors.push("wp0c: " + (e && e.stack || e)); }
  finally { out.errors = page.errors.slice(); await close(); }
  return out;
}

/* ---------- main ---------- */
const res = {ok: false, lint: null, spec: null, views: null, errors: []};
const fails = [];
if (opt("--capture")){
  const dir = path.resolve(opt("--capture")), r = await captureAll(dir);
  console.log(r.errors.length ? "errors:\n  " + r.errors.join("\n  ") : `captured ${r.views.length} views into ${dir}`);
  process.exit(r.errors.length ? 1 : 0);
}
if (opt("--compare")){
  // two captures side by side: node qa/wp0c-mat.mjs --compare <dirA> <dirB>
  const a = path.resolve(opt("--compare")), b = path.resolve(argv[argv.indexOf("--compare") + 2]);
  const {page, close} = await launch({gfx: "low", seed: 1});
  let bad = 0;
  try {
    for (const v of VIEWS){
      const c = await compare(page, fs.readFileSync(path.join(a, v.name + ".png")), fs.readFileSync(path.join(b, v.name + ".png")));
      if (!(c.share <= MAX_SHARE)) bad++;
      console.log(`${v.name}: ${(c.share*100).toFixed(3)}% of pixels over ${MAX_DELTA}/255 (max ${c.max})`);
    }
  } finally { await close(); }
  process.exit(bad ? 1 : 0);
}
// the reference views from another commit: its tree exported into a temporary folder, this script copied in and run there
// with --capture on the next port (a server only ever serves the tree it sits in)
function captureBase(ref, dir){
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wp0c-base-"));
  try {
    // run in the game's folder, git archive takes that folder alone, with the game at the top of the archive
    const tar = execFileSync("git", ["-C", ROOT, "archive", "--format=tar", ref], {maxBuffer: 1 << 30});
    if (!tar.length) throw new Error(`git archive ${ref} gave nothing`);
    execFileSync("tar", ["-x", "-C", tmp], {input: tar, maxBuffer: 1 << 30});
    const root = tmp, me = fileURLToPath(import.meta.url);
    fs.copyFileSync(me, path.join(root, "qa", path.basename(me)));
    const port = +(process.env.QA_BASE_PORT || PORT + 1);
    console.log(`reference: ${ref} drawn on port ${port}`);
    execFileSync(process.execPath, [path.join(root, "qa", path.basename(me)), "--capture", dir], {stdio: "inherit", env: {...process.env, QA_PORT: String(port)}});
  } finally { fs.rmSync(tmp, {recursive: true, force: true}); }
}
if (opt("--base") && want("views")) captureBase(opt("--base"), path.join(OUT, "wp0c-before"));
if (want("lint")){
  res.lint = lint();
  console.log(`lint: ${res.lint.files} files, ${res.lint.hits.length ? "new MeshStandardMaterial at " + res.lint.hits.join(", ") : "every lit material comes from mat()"}`);
  if (!res.lint.ok) fails.push("lint");
}
if (want("spec") || want("views")){
  const after = path.join(OUT, "wp0c-after"), r = await captureAll(after, {checks: want("spec")});
  res.errors = r.errors;
  if (r.errors.length) fails.push("page errors");
  if (want("spec")){
    res.spec = r.spec;
    for (const [zone, s] of Object.entries(r.spec)){
      const ok = !s.missing.length && !s.bad.length && !s.remat.diff.length && !s.cycle.diff.length && !s.medium.diff.length;
      console.log(`spec ${zone}: ${s.mats} lit materials on ${s.meshes} meshes${s.built ? ` (with ${s.built} pieces built on demand)` : ""}, kinds ${JSON.stringify(s.kinds)}; ` +
        `remat same ${s.remat.same}, High to Low to High same ${s.cycle.same}, Medium ${s.medium.lambert} Lambert and ${s.medium.standard} Standard` +
        (s.missing.length ? `\n  no spec (${s.missing.length}): ${s.missing.slice(0, 12).join("\n    ")}` : "") + (s.bad.length ? `\n  bad spec: ${s.bad.slice(0, 8).join("\n    ")}` : "") +
        (s.remat.diff.length ? `\n  remat differs: ${s.remat.diff.join("\n    ")}` : "") + (s.cycle.diff.length ? `\n  High to Low to High differs: ${s.cycle.diff.join("\n    ")}` : "") +
        (s.medium.diff.length ? `\n  Medium class wrong: ${s.medium.diff.join("\n    ")}` : ""));
      if (!ok) fails.push("spec " + zone);
    }
    const rs = r.rematScene;
    if (rs){
      res.rematScene = rs;
      console.log(`remat scene (${rs.view}): ${rs.low} materials to Low, ${rs.high} back to High; ${(rs.share*100).toFixed(3)}% of pixels over ${MAX_DELTA}/255 (max ${rs.max})`);
      if (!(rs.share <= MAX_SHARE) || !(rs.high > 0)) fails.push("remat scene");
    } else fails.push("remat scene not run");
  }
  if (want("views")){
    const before = opt("--before") ? path.resolve(opt("--before")) : path.join(OUT, "wp0c-before");
    if (!fs.existsSync(before)){ console.log(`views: captured into ${path.relative(ROOT, after)}; no reference at ${before} to compare with`); res.views = {captured: after}; }
    else {
      const {page, close} = await launch({gfx: "low", seed: 1});
      try {
        res.views = [];
        for (const v of VIEWS){
          const a = path.join(before, v.name + ".png"), b = path.join(after, v.name + ".png");
          if (!fs.existsSync(a)){ res.views.push({name: v.name, why: "no reference"}); fails.push("view " + v.name); continue; }
          const c = await compare(page, fs.readFileSync(a), fs.readFileSync(b));
          res.views.push({name: v.name, ...c});
          const ok = c.share <= MAX_SHARE;
          console.log(`view ${v.name}: ${(c.share*100).toFixed(3)}% of pixels over ${MAX_DELTA}/255 (max ${c.max})${ok ? "" : " FAIL"}`);
          if (!ok) fails.push("view " + v.name);
        }
      } finally { await close(); }
    }
  }
}
res.ok = fails.length === 0;
res.fails = fails;
report("wp0c-mat", res);
if (res.errors.length) console.log("errors:\n  " + res.errors.join("\n  "));
console.log(res.ok ? "wp0c-mat: pass" : "wp0c-mat: FAIL (" + fails.join(", ") + ")");
process.exit(res.ok ? 0 : 1);
