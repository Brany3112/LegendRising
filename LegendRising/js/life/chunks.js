/* ============ LIFE: static geometry in chunks, and fixed parts and signs merged ============
   Owner: WP-A (DESIGN 1.2 chunks.js, 3.9.2, 2.3 WP-A).
   finishBatches (build.js) hands over the place's batches: per material key, indexed vertices and the pieces poured
   into it. Each key becomes ONE batched mesh (three.js BatchedMesh) holding one instance per (tile, layer):
     tiles   24 m squares of the ground plan, aligned to W.bounds; a piece goes to the tile holding the centre of its
             bounding box, and one more than 1.5 tiles across goes to an instance of its own that is always drawn
     layers  0 the main pieces, 1 the detail: pieces under 0.8 m across (not floors, not lamps or anything that glows),
             drawn only within the preset's detailDist
   Every instance is frustum culled on its own, in the main pass and in the shadow pass, and the visible ones are
   drawn front to back (what you are standing in first, so the depth test rejects what is behind it), all of a key in
   one draw call where the browser has WEBGL_multi_draw (without it, one per visible tile, and the tiles are 48 m).
   Four times a second the tiles further than the draw distance (the fog's end plus P.drawPad, or P.drawDist) and the
   detail beyond P.detailDist are switched off.
   The vertices are compact: position as float, the normal as four signed bytes, the colour (with its contact shadow)
   as four bytes, uv only for printed keys: 20 or 28 bytes a vertex instead of 44. The camera's ray grid
   (collide.js camGridBuild) reads the triangles from the batch's own arrays, already in world space.

   Fixed parts and signs: see "fixed parts and signs, merged" below. */
import {THREE, W, mat, matClass, FLOORS} from "./build.js";
import {RT} from "./core/state.js";
import {SCHED} from "./core/sched.js";

const GLOWS = new Set(["lit", "lamp", "lampB", "street", "neon", "screen"]);
const DETAIL = .8;
// what the probes read (perf.js): the batched meshes of the place, their instances, vertex bytes, the atlases
export const CH = {meshes:[], tile:24, instances:0, verts:0, bytes:0, multiDraw:null, cullT:0};
export function resetChunks(){ CH.meshes = []; CH.instances = CH.verts = CH.bytes = 0; resetMerge(); }
const gp = () => (typeof GFX === "object" && GFX && GFX.P) || null;

export function finishChunks(batches){
  const b = W.bounds || {x0:-40, x1:40, z0:-40, z1:40};
  if (CH.multiDraw == null && RT.renderer) CH.multiDraw = !!RT.renderer.extensions.has("WEBGL_multi_draw");
  const TILE = CH.tile = CH.multiDraw === false ? 48 : 24;
  const ntx = Math.max(1, Math.ceil((b.x1 - b.x0)/TILE)), ntz = Math.max(1, Math.ceil((b.z1 - b.z0)/TILE));
  const tileOf = (v, v0, n) => Math.max(0, Math.min(n - 1, Math.floor((v - v0)/TILE)));
  for (const [key, B] of batches){
    if (!B.pieces.length) continue;
    const base = key.split("|")[0], far = key.endsWith("|far"), noDetail = GLOWS.has(base) || FLOORS.has(base);
    // the groups: one per (tile, layer), plus one for the giants
    const groups = new Map();
    for (const pc of B.pieces){
      const dx = pc.x1 - pc.x0, dz = pc.z1 - pc.z0, dy = pc.y1 - pc.y0;
      let gk;
      if (Math.max(dx, dz) > 1.5*TILE) gk = "giant";
      else gk = `${tileOf((pc.x0 + pc.x1)/2, b.x0, ntx)},${tileOf((pc.z0 + pc.z1)/2, b.z0, ntz)},${!noDetail && Math.hypot(dx, dy, dz) < DETAIL ? 1 : 0}`;
      let g = groups.get(gk); if (!g){ g = {key:gk, pieces:[], nv:0, ni:0, x0:Infinity, x1:-Infinity, y0:Infinity, y1:-Infinity, z0:Infinity, z1:-Infinity}; groups.set(gk, g); }
      g.pieces.push(pc); g.nv += pc.nv; g.ni += pc.ni;
      g.x0 = Math.min(g.x0, pc.x0); g.x1 = Math.max(g.x1, pc.x1); g.y0 = Math.min(g.y0, pc.y0); g.y1 = Math.max(g.y1, pc.y1); g.z0 = Math.min(g.z0, pc.z0); g.z1 = Math.max(g.z1, pc.z1);
    }
    let NV = 0, NI = 0; for (const g of groups.values()){ NV += g.nv; NI += g.ni; }
    const m = mat(base, far ? {vertexColors:true, far:true} : {vertexColors:true});
    const bm = new THREE.BatchedMesh(groups.size, NV, NI, m);
    const inst = [];
    for (const g of groups.values()){
      const geo = groupGeometry(B, g);
      const gid = bm.addGeometry(geo), iid = bm.addInstance(gid);
      const parts = g.key.split(",");
      inst.push({iid, giant:g.key === "giant", layer:g.key === "giant" ? 0 : +parts[2], vis:true, x0:g.x0, x1:g.x1, y0:g.y0, y1:g.y1, z0:g.z0, z1:g.z1});
      geo.dispose();
    }
    if (key === "lit") W.lit = m;
    W.mats[key] = m;
    // floors and ground never throw a shadow onto anything, so they are left out of the shadow pass
    bm.castShadow = base !== "glass" && base !== "lit" && !FLOORS.has(base); bm.receiveShadow = base !== "glass";
    bm.name = "batch:" + key;
    bm.userData.inst = inst; bm.userData.key = key;
    const ga = bm.geometry;
    bm.userData.tris = {pos:ga.attributes.position.array, index:ga.index.array};
    W.scene.add(bm);
    CH.meshes.push(bm); CH.instances += inst.length; CH.verts += NV; CH.bytes += NV*(B.tex ? 28 : 20) + NI*(NV > 65535 ? 4 : 2);
  }
  scan(true);
  SCHED.task({id:"chunks", hz:4, run:cull});
  cull();
}
// one tile's geometry, from the batch's arrays: compact attributes and a local index
function groupGeometry(B, g){
  const nv = g.nv, pos = new Float32Array(nv*3), nor = new Int8Array(nv*4), col = new Uint8Array(nv*4), uv = B.tex ? new Float32Array(nv*2) : null;
  const idx = nv > 65535 ? new Uint32Array(g.ni) : new Uint16Array(g.ni);
  let v = 0, k = 0;
  const q8 = x => Math.max(-127, Math.min(127, Math.round(x*127))), u8 = x => Math.max(0, Math.min(255, Math.round(x*255)));
  for (const pc of g.pieces){
    const shift = v - pc.v0;
    for (let i = 0; i < pc.nv; i++){
      const s = (pc.v0 + i)*3, d = v + i;
      pos[d*3] = B.pos[s]; pos[d*3 + 1] = B.pos[s + 1]; pos[d*3 + 2] = B.pos[s + 2];
      nor[d*4] = q8(B.nor[s]); nor[d*4 + 1] = q8(B.nor[s + 1]); nor[d*4 + 2] = q8(B.nor[s + 2]); nor[d*4 + 3] = 0;
      col[d*4] = u8(B.col[s]); col[d*4 + 1] = u8(B.col[s + 1]); col[d*4 + 2] = u8(B.col[s + 2]); col[d*4 + 3] = 255;
      if (uv){ const t = (pc.v0 + i)*2; uv[d*2] = B.uv[t]; uv[d*2 + 1] = B.uv[t + 1]; }
    }
    for (let i = 0; i < pc.ni; i++) idx[k++] = B.idx[pc.i0 + i] + shift;
    v += pc.nv;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nor, 4, true));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 4, true));
  if (uv) geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}
// the draw and detail distances: tiles and detail out of range are switched off (four times a second)
function cull(){
  const cam = RT.cam; if (!cam || !CH.meshes.length) return;
  const P = gp(), fogFar = RT.SKY && RT.SKY.K ? RT.SKY.K.fogFar : 260;
  const draw = !P ? Infinity : P.drawDist === Infinity ? Infinity : P.drawDist || fogFar + (P.drawPad || 0);
  const detail = P ? P.detailDist : Infinity;
  const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
  for (const bm of CH.meshes){
    for (const it of bm.userData.inst){
      if (it.giant) continue;
      const dx = Math.max(it.x0 - cx, 0, cx - it.x1), dy = Math.max(it.y0 - cy, 0, cy - it.y1), dz = Math.max(it.z0 - cz, 0, cz - it.z1);
      const vis = Math.hypot(dx, dy, dz) <= (it.layer ? detail : draw);
      if (vis !== it.vis){ it.vis = vis; bm.setVisibleAt(it.iid, vis); }
    }
  }
  CH.cullT++;
}

/* ---------- fixed parts and signs, merged ----------
   Doors, furniture, fittings, shop shelves and printed signs are meshes of their own (they can move, open, be picked
   up or be redrawn), one draw call each. Most of them, most of the time, do none of that: those are merged. Every mesh
   that has stood still in the same place with the same look for a while (or since the place was built) joins a
   batched mesh with the others that share its kind of material (class, texture, glow, shadows), its colour baked
   into its vertices, cut into the same 24 m tiles; printed canvases are packed into atlas pages of at most 2048 x 2048
   first. The original stays where it is, on a camera layer nothing draws (HIDE): it keeps its parent, its transform
   and its material, so whatever owns it can still move it, hide it, recolour it, redraw its picture or take it away.
   Every frame each merged original is checked against how it was merged (its place in the world, its parents, its
   visibility, its material and colours, its geometry, its picture); the moment any of that changes it leaves the
   merge, back on the camera's layer, drawn as itself, and may join again once it has stood still for SCAN_EVERY
   seconds or more. A change of graphics preset unmerges everything and merges it again (quality.js) */
const HIDE = 30, ATLAS = 2048, PAD = 4, SCAN_EVERY = 5, MAX_V = 6000;
const NO_MAPS = ["normalMap", "bumpMap", "aoMap", "lightMap", "alphaMap", "envMap", "roughnessMap", "metalnessMap", "displacementMap", "specularMap", "clearcoatMap"];
export const MG = {pages:new Map(), items:new Map(), still:new Map(), t:0, scanT:0, merged:0, evicted:0, rebuilds:0};
function resetMerge(){ MG.pages = new Map(); MG.items = new Map(); MG.still = new Map(); MG.t = MG.scanT = 0; MG.merged = MG.evicted = MG.rebuilds = 0; }
const isAtlasTex = t => !!t && t.isCanvasTexture && !t.userData.per && t.image && t.image.width <= ATLAS - 2*PAD && t.image.height <= ATLAS - 2*PAD
  && t.repeat.x === 1 && t.repeat.y === 1 && !t.offset.x && !t.offset.y && !t.rotation && t.wrapS === THREE.ClampToEdgeWrapping && t.wrapT === THREE.ClampToEdgeWrapping;
const lookOf = mt => `${mt.color ? mt.color.getHex() : 0}|${mt.emissive ? mt.emissive.getHex() : 0}|${mt.emissiveIntensity}|${mt.opacity}|${mt.visible}|${mt.version}`;
function eligible(o){
  if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.isBatchedMesh || o.userData.keep || o.userData.noMerge || o.layers.mask !== 1 || o.renderOrder) return false;
  const m = o.material;
  if (!m || Array.isArray(m) || !m.userData || !m.userData.spec || m.userData.spec.tint || m.transparent || m.wireframe || !m.visible) return false;
  if (!(m.isMeshLambertMaterial || m.isMeshStandardMaterial || m.isMeshBasicMaterial) || m.isMeshPhysicalMaterial) return false;
  for (const k of NO_MAPS) if (m[k]) return false;
  if (Object.prototype.hasOwnProperty.call(m, "onBeforeCompile") && !m.onBeforeCompile.__mat) return false;
  if (m.emissiveMap && m.emissiveMap !== m.map) return false;
  const g = o.geometry;
  if (!g || !g.attributes.position || !g.attributes.normal || g.morphAttributes.position || g.attributes.position.count > MAX_V) return false;
  if (g.drawRange.start || g.drawRange.count !== Infinity) return false;
  if (m.map && !g.attributes.uv) return false;
  if (m.vertexColors && !g.attributes.color) return false;
  return true;
}
// a printed canvas whose quad uses all of it (uv inside 0..1): it can go on an atlas page
function atlasable(o){
  const t = o.material.map; if (!isAtlasTex(t)) return false;
  const u = o.geometry.attributes.uv;
  for (let i = 0; i < u.count; i++){ const x = u.getX(i), y = u.getY(i); if (x < -1e-4 || x > 1 + 1e-4 || y < -1e-4 || y > 1 + 1e-4) return false; }
  return true;
}
/* what a mesh must share with the others on its page: the class its material is drawn in, its texture (or "atlas"),
   faces, cut-out, flat shading, glow colour (its strength is per vertex), the surface (roughness, metal), shadows
   (only while there are any), depth and polygon offset, fog and tone mapping, and the material's shader hooks */
function sigOf(o, atlas){
  const m = o.material, sh = !!(RT.renderer && RT.renderer.shadowMap.enabled), hk = m.customProgramCacheKey && m.customProgramCacheKey.__mat ? m.customProgramCacheKey() : "";
  return [m.type, atlas ? "atlas" : m.map ? m.map.uuid : "-", m.side, m.alphaTest || 0, m.flatShading ? 1 : 0, m.emissiveMap ? 1 : 0, glowOf(m) > 0 ? m.emissive.getHex() : 0,
    0, m.roughness == null ? -1 : m.roughness, m.metalness == null ? -1 : m.metalness, m.envMapIntensity == null ? -1 : m.envMapIntensity,
    sh && o.castShadow ? 1 : 0, sh && o.receiveShadow ? 1 : 0, m.polygonOffset ? `${m.polygonOffsetFactor},${m.polygonOffsetUnits}` : 0, m.depthWrite ? 1 : 0, m.depthTest ? 1 : 0,
    m.toneMapped ? 1 : 0, m.fog ? 1 : 0, matClass(m.userData.spec), hk.replace(/e$/, "")].join("|");
}
// how strongly a material glows (0: not at all)
const glowOf = m => m.emissive && m.emissive.getHex() !== 0 ? (m.emissiveIntensity == null ? 1 : m.emissiveIntensity) : 0;
function chainOf(o){ const c = []; for (let a = o; a && a !== W.scene; a = a.parent) c.push([a, a.parent]); return c; }
// put one mesh into the merge (initial: the place is being built, and is warmed up after: its pages are ready at once)
function join(o, initial = true){
  const atlas = atlasable(o), sig = sigOf(o, atlas);
  o.updateWorldMatrix(true, false);
  const m = o.material;
  const it = {o, sig, atlas, chain:chainOf(o), mw:o.matrixWorld.clone(), mat:m, look:lookOf(m), geo:o.geometry, gver:o.geometry.attributes.position.version,
    map:m.map || null, mver:m.map ? m.map.version : 0, page:null, place:null};
  let page = null;
  if (atlas){
    const im = m.map.image;
    let at = null;
    for (const pg of MG.pages.values()) if (pg.sig === sig && (at = shelf(pg, im.width + 2*PAD, im.height + 2*PAD))){ page = pg; break; }
    if (!page){ page = newPage(sig, o, initial); at = shelf(page, im.width + 2*PAD, im.height + 2*PAD); }
    it.place = {x:at.x + PAD, y:at.y + PAD, w:im.width, h:im.height};
    drawInto(page, im, it.place);
  } else page = MG.pages.get(sig) || newPage(sig, o, initial);
  it.page = page; page.items.add(it); page.dirty = true;
  MG.items.set(o, it); MG.still.delete(o); MG.merged++;
  // (a page made during play is compiled out of sight first: its pieces stay as they are until it is ready)
  if (page.ready) o.layers.set(HIDE);
}
function newPage(sig, o, ready = true){
  const m = o.material, sp = m.userData.spec, atlas = sig.split("|")[1] === "atlas";
  const pg = {sig, key:sig + (atlas ? "#" + MG.pages.size : ""), items:new Set(), mesh:null, mat:null, tex:null, canvas:null, H:4, sx:0, sy:0, rowH:0, dirty:true, atlas, ready};
  // (the class of the page's material is the one its pieces are drawn in under the preset in force: their kind)
  const opts = {kind:sp.kind, color:0xffffff, vertexColors:true, side:m.side, alphaTest:m.alphaTest || 0, flatShading:!!m.flatShading, toneMapped:m.toneMapped, fog:m.fog,
    depthWrite:m.depthWrite, depthTest:m.depthTest, polygonOffset:!!m.polygonOffset, polygonOffsetFactor:m.polygonOffsetFactor, polygonOffsetUnits:m.polygonOffsetUnits};
  if (m.roughness != null) opts.roughness = m.roughness;
  if (m.metalness != null) opts.metalness = m.metalness;
  if (m.envMapIntensity != null) opts.envMapIntensity = m.envMapIntensity;
  if (m.emissive){ opts.emissive = glowOf(m) > 0 ? m.emissive.getHex() : 0; opts.emissiveIntensity = glowOf(m); opts.escale = true; }
  if (atlas){
    pg.canvas = document.createElement("canvas"); pg.canvas.width = ATLAS; pg.canvas.height = 4;
    pg.tex = new THREE.CanvasTexture(pg.canvas); pg.tex.colorSpace = THREE.SRGBColorSpace; pg.tex.anisotropy = m.map.anisotropy;
    opts.map = pg.tex; if (m.emissiveMap) opts.emissiveMap = pg.tex;
  } else if (m.map){ opts.map = m.map; if (m.emissiveMap) opts.emissiveMap = m.map; }
  pg.mat = mat(opts);
  MG.pages.set(pg.key, pg);
  return pg;
}
// a place on an atlas page: shelves, left to right, a new shelf when a row is full; null when the page is full
function shelf(pg, w, h){
  if (!pg.atlas) return null;
  if (pg.sx + w > ATLAS){ pg.sx = 0; pg.sy += pg.rowH; pg.rowH = 0; }
  if (pg.sy + h > ATLAS) return null;
  const at = {x:pg.sx, y:pg.sy};
  pg.sx += w; pg.rowH = Math.max(pg.rowH, h);
  return at;
}
// a picture onto its page, with its edges repeated into the padding so mipmaps never bleed a neighbour in
function drawInto(pg, im, {x, y, w, h}){
  const need = Math.min(ATLAS, Math.ceil((y + h + PAD)/64)*64);
  if (need > pg.canvas.height){
    const old = pg.canvas, c = document.createElement("canvas"); c.width = ATLAS; c.height = need;
    if (old.height > 4) c.getContext("2d").drawImage(old, 0, 0);
    pg.canvas = c; pg.tex.image = c;
    pg.tex.dispose();                          // a new size: the renderer allocates it afresh
    // the uv of every picture already on the page depends on its height
    for (const it of pg.items) pg.dirty = true;
  }
  const g = pg.canvas.getContext("2d");
  g.clearRect(x - PAD, y - PAD, w + 2*PAD, h + 2*PAD);
  g.drawImage(im, x, y);
  g.drawImage(im, 0, 0, w, 1, x, y - PAD, w, PAD); g.drawImage(im, 0, h - 1, w, 1, x, y + h, w, PAD);
  g.drawImage(pg.canvas, x, y - PAD, 1, h + 2*PAD, x - PAD, y - PAD, PAD, h + 2*PAD); g.drawImage(pg.canvas, x + w - 1, y - PAD, 1, h + 2*PAD, x + w, y - PAD, PAD, h + 2*PAD);
  pg.H = pg.canvas.height; pg.tex.needsUpdate = true; pg.dirty = true;
}
// take one mesh out of the merge: drawn as itself again
function leave(it){
  it.o.layers.set(0);
  it.page.items.delete(it); it.page.dirty = true;
  MG.items.delete(it.o); MG.evicted++;
}
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Color(), _nm = new THREE.Matrix3();
/* a page's batched mesh, made again from its items (one instance per 24 m tile). A page made during play is compiled
   first (compileAsync: the driver may do it in parallel), out of sight, and only then takes its pieces' place */
function rebuild(pg){
  if (!pg.ready){ if (!pg.compiling) compilePage(pg); return; }
  pg.dirty = false; MG.rebuilds++;
  if (pg.mesh){ if (pg.mesh.parent) pg.mesh.parent.remove(pg.mesh); pg.mesh.dispose(); pg.mesh = null; }
  if (!pg.items.size) return;
  W.scene.add(pg.mesh = makeMesh(pg));
}
function compilePage(pg){
  const r = RT.renderer;
  if (!r || !r.compileAsync || !pg.items.size){ pg.ready = true; return; }
  pg.compiling = true;
  const bm = makeMesh(pg);
  r.compileAsync(bm, RT.cam, W.scene).catch(() => {}).then(() => {
    bm.dispose();
    pg.compiling = false;
    if (MG.pages.get(pg.key) !== pg) return;                // the place changed meanwhile
    pg.ready = true;
    for (const it of pg.items) it.o.layers.set(HIDE);
    rebuild(pg);
  });
}
function makeMesh(pg){
  const b = W.bounds || {x0:-40, x1:40, z0:-40, z1:40}, TILE = CH.tile;
  const tiles = new Map(), cnt = it => { const g = it.o.geometry; return [g.attributes.position.count, g.index ? g.index.count : g.attributes.position.count]; };
  for (const it of pg.items){
    const e = it.mw.elements, k = `${Math.floor((e[12] - b.x0)/TILE)},${Math.floor((e[14] - b.z0)/TILE)}`;
    (tiles.get(k) || tiles.set(k, []).get(k)).push(it);
  }
  let NV = 0, NI = 0;
  for (const it of pg.items){ const [a, c] = cnt(it); NV += a; NI += c; }
  const hasUV = !!pg.mat.map, bm = new THREE.BatchedMesh(tiles.size, NV, NI, pg.mat);
  let glow = 0; for (const it of pg.items) glow = Math.max(glow, glowOf(it.mat));
  if (pg.mat.emissive) pg.mat.emissiveIntensity = glow;
  for (const list of tiles.values()){
    let nv = 0, ni = 0; for (const it of list){ const [a, c] = cnt(it); nv += a; ni += c; }
    const pos = new Float32Array(nv*3), nor = new Int8Array(nv*4), col = new Uint8Array(nv*4), uv = hasUV ? new Float32Array(nv*2) : null, idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let v = 0, k = 0;
    for (const it of list){
      const g = it.o.geometry, pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv, ca = g.attributes.color, ix = g.index, M = it.mw;
      _nm.getNormalMatrix(M);
      if (it.mat.color) _c.copy(it.mat.color); else _c.setRGB(1, 1, 1);
      const flip = M.determinant() < 0, cr = _c.r, cg = _c.g, cb = _c.b, vc = !!(ca && it.mat.vertexColors), ga = glow > 0 ? Math.round(glowOf(it.mat)/glow*255) : 255;
      for (let i = 0; i < pa.count; i++){
        const d = v + i;
        _p.fromBufferAttribute(pa, i).applyMatrix4(M); pos[d*3] = _p.x; pos[d*3 + 1] = _p.y; pos[d*3 + 2] = _p.z;
        _n.fromBufferAttribute(na, i).applyMatrix3(_nm).normalize();
        nor[d*4] = Math.round(_n.x*127); nor[d*4 + 1] = Math.round(_n.y*127); nor[d*4 + 2] = Math.round(_n.z*127);
        const vr = vc ? ca.getX(i) : 1, vg = vc ? ca.getY(i) : 1, vb = vc ? ca.getZ(i) : 1;
        col[d*4] = Math.round(Math.min(1, cr*vr)*255); col[d*4 + 1] = Math.round(Math.min(1, cg*vg)*255); col[d*4 + 2] = Math.round(Math.min(1, cb*vb)*255); col[d*4 + 3] = ga;
        if (uv){
          let u = ua.getX(i), w = ua.getY(i);
          if (it.place){ const P = it.place; u = (P.x + u*P.w)/ATLAS; w = 1 - (P.y + (1 - w)*P.h)/pg.H; }
          uv[d*2] = u; uv[d*2 + 1] = w;
        }
      }
      const n = ix ? ix.count : pa.count;
      for (let i = 0; i < n; i += 3){
        const a = ix ? ix.getX(i) : i, b2 = ix ? ix.getX(i + 1) : i + 1, c = ix ? ix.getX(i + 2) : i + 2;
        idx[k++] = v + a; idx[k++] = v + (flip ? c : b2); idx[k++] = v + (flip ? b2 : c);
      }
      v += pa.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("normal", new THREE.BufferAttribute(nor, 4, true));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 4, true)); if (uv) geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    bm.addInstance(bm.addGeometry(geo)); geo.dispose();
  }
  const s = pg.sig.split("|");
  bm.castShadow = s[11] === "1"; bm.receiveShadow = s[12] === "1";
  bm.name = "merged:" + (pg.atlas ? "atlas" : s[0]); bm.userData.noRays = true; bm.userData.merged = true;
  return bm;
}
// has a merged mesh changed since it was merged?
function changed(it){
  const o = it.o;
  for (let i = 0; i < it.chain.length; i++){ const c = it.chain[i]; if (c[0].parent !== c[1] || !c[0].visible) return true; }
  if (o.material !== it.mat || o.geometry !== it.geo || o.geometry.attributes.position.version !== it.gver || lookOf(o.material) !== it.look) return true;
  if (it.map && (o.material.map !== it.map || it.map.version !== it.mver)) return true;
  const a = o.matrixWorld.elements, b = it.mw.elements;
  for (let i = 0; i < 16; i++) if (Math.abs(a[i] - b[i]) > 1e-6) return true;
  return false;
}
// a mesh standing still: the same matrix and look as at the last scan
const stillKey = o => { o.updateWorldMatrix(true, false); return o.matrixWorld.elements.join(",") + "|" + lookOf(o.material) + "|" + o.geometry.uuid + "|" + o.geometry.attributes.position.version; };
// look for meshes to merge: initial (the place has just been built): every eligible one; otherwise those that have not
// changed since the last scan
function scan(initial){
  if (!W.scene) return;
  const walk = o => {
    if (o.isBatchedMesh || o.isSkinnedMesh || o.userData.keep || !o.visible) return;
    if (o.isMesh && !MG.items.has(o) && eligible(o)){
      if (initial) join(o, true);
      else { const k = stillKey(o), was = MG.still.get(o); if (was === k) join(o, false); else MG.still.set(o, k); }
    }
    for (const c of o.children) walk(c);
  };
  for (const c of W.scene.children) walk(c);
  for (const pg of MG.pages.values()) if (pg.dirty) rebuild(pg);
}
// every frame: what changed leaves; every SCAN_EVERY seconds, what has stood still joins
function mergeStep(dt){
  MG.t += dt;
  let out = false;
  for (const it of MG.items.values()) if (changed(it)){ leave(it); out = true; }
  if (out) for (const pg of MG.pages.values()) if (pg.dirty) rebuild(pg);
  if ((MG.scanT += dt) >= SCAN_EVERY){ MG.scanT = 0; scan(false); }
}
// everything back as itself (a preset change: the merged materials are made again), and merged again
export function unmergeAll(){
  for (const it of MG.items.values()) it.o.layers.set(0);
  for (const pg of MG.pages.values()){ if (pg.mesh){ if (pg.mesh.parent) pg.mesh.parent.remove(pg.mesh); pg.mesh.dispose(); } if (pg.mat) pg.mat.dispose(); if (pg.tex) pg.tex.dispose(); }
  resetMerge();
}
export function mergeAll(){ scan(true); }
SCHED.task({id:"merge", kind:"keep", when:() => !!W.scene && CH.meshes.length > 0, run:mergeStep});
