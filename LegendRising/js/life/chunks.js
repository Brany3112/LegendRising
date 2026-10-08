/* ============ LIFE: static geometry in chunks, and fixed parts and signs merged ============
   Owner: WP-A (DESIGN 1.2 chunks.js, 3.9.2, 2.3 WP-A).
   finishBatches (build.js) hands over the place's batches: per material key, indexed vertices and the pieces poured
   into it. Each key becomes ONE batched mesh (three.js BatchedMesh) holding one instance per (tile, layer, band):
     tiles   16 m squares of the ground plan, aligned to W.bounds; a piece goes to the tile holding the centre of its
             bounding box, and one more than 36 m across (72 with 48 m tiles) goes to an instance of its own that is
             always drawn. 16 m, not the 24 of DESIGN 3.9.2: a room, a stairwell or a shop front is then a box of its
             own, which the occlusion test and the order of the batches below need (24 m tiles left the home lobby at
             an overdraw of 2.0 to 2.3, qa/wpA-overdraw.mjs)
     layers  0 the main pieces, 1 the detail: pieces under 0.8 m across (not floors, not lamps or anything that glows),
             drawn only within the preset's detailDist
     bands   storeys: 4 m slices of height by the centre of the piece, and one more for pieces taller than 6 m (a
             facade's full height), so the floors above a ceiling or a window's head are boxes of their own that the
             occlusion test below can leave out
   Every instance is frustum culled on its own, in the main pass and in the shadow pass, left out of the main pass
   when the walls in front of it hide it (see "what the walls hide"), and the rest are drawn front to back (what you
   are standing in first, so the depth test rejects what is behind it), all of a key in one draw call where the
   browser has WEBGL_multi_draw (without it, one per visible tile, and the tiles are 48 m). The batches themselves are
   drawn front to back too, not by material (see "the order of the batches").
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
const DETAIL = .8, BAND = 4, MCELL = 8, GROUND_Y = .1;
// what the probes read (perf.js): the batched meshes of the place, their instances, vertex bytes, the atlases
export const CH = {meshes:[], tile:16, instances:0, verts:0, bytes:0, multiDraw:null, cullT:0};
// a new place: the last one's batches are gone with its scene; anything of it that was merged is put back on the
// camera's layer first (a mesh some module keeps and shows again in the next place must not stay hidden)
export function resetChunks(){
  CH.meshes = []; CH.instances = CH.verts = CH.bytes = 0;
  for (const it of MG.items.values()) it.o.layers.set(0);
  resetMerge();
  occReset();
}
const gp = () => (typeof GFX === "object" && GFX && GFX.P) || null;

export function finishChunks(batches){
  const b = W.bounds || {x0:-40, x1:40, z0:-40, z1:40};
  if (CH.multiDraw == null && RT.renderer) CH.multiDraw = !!RT.renderer.extensions.has("WEBGL_multi_draw");
  const TILE = CH.tile = CH.multiDraw === false ? 48 : 16, GIANT = 1.5*Math.max(24, TILE);
  const ntx = Math.max(1, Math.ceil((b.x1 - b.x0)/TILE)), ntz = Math.max(1, Math.ceil((b.z1 - b.z0)/TILE));
  const tileOf = (v, v0, n) => Math.max(0, Math.min(n - 1, Math.floor((v - v0)/TILE)));
  for (const [key, B] of batches){
    if (!B.pieces.length) continue;
    const base = key.split("|")[0], far = key.endsWith("|far"), noDetail = GLOWS.has(base) || FLOORS.has(base);
    // the groups: one per (tile, layer, band), plus one for the giants
    const groups = new Map();
    for (const pc of B.pieces){
      const dx = pc.x1 - pc.x0, dz = pc.z1 - pc.z0, dy = pc.y1 - pc.y0;
      let gk;
      if (Math.max(dx, dz) > GIANT) gk = "giant";
      else gk = `${tileOf((pc.x0 + pc.x1)/2, b.x0, ntx)},${tileOf((pc.z0 + pc.z1)/2, b.z0, ntz)},${!noDetail && Math.hypot(dx, dy, dz) < DETAIL ? 1 : 0},${dy > 1.5*BAND ? "t" : Math.max(0, Math.floor((pc.y0 + pc.y1)/2/BAND))}`;
      let g = groups.get(gk); if (!g){ g = {key:gk, pieces:[], nv:0, ni:0, x0:Infinity, x1:-Infinity, y0:Infinity, y1:-Infinity, z0:Infinity, z1:-Infinity}; groups.set(gk, g); }
      g.pieces.push(pc); g.nv += pc.nv; g.ni += pc.ni;
      g.x0 = Math.min(g.x0, pc.x0); g.x1 = Math.max(g.x1, pc.x1); g.y0 = Math.min(g.y0, pc.y0); g.y1 = Math.max(g.y1, pc.y1); g.z0 = Math.min(g.z0, pc.z0); g.z1 = Math.max(g.z1, pc.z1);
    }
    let NV = 0, NI = 0; for (const g of groups.values()){ NV += g.nv; NI += g.ni; }
    const m = mat(base, far ? {vertexColors:true, far:true} : {vertexColors:true});
    const bm = new THREE.BatchedMesh(groups.size, NV, NI, m);
    const inst = [], box = [], mi = CH.meshes.length, solid = occluder(base, far, m);
    for (const g of groups.values()){
      const geo = groupGeometry(B, g);
      const gid = bm.addGeometry(geo), iid = bm.addInstance(gid);
      const parts = g.key.split(",");
      const it = {iid, giant:g.key === "giant", layer:g.key === "giant" ? 0 : +parts[2], vis:true, x0:g.x0, x1:g.x1, y0:g.y0, y1:g.y1, z0:g.z0, z1:g.z1};
      inst.push(it); box[iid] = it;
      if (solid && !it.layer) occCollect(geo, mi, it);
      geo.dispose();
    }
    if (solid) for (const q of B.occ) occExtra(q, mi);
    if (key === "lit") W.lit = m;
    W.mats[key] = m;
    // floors and ground never throw a shadow onto anything, so they are left out of the shadow pass
    bm.castShadow = base !== "glass" && base !== "lit" && !FLOORS.has(base); bm.receiveShadow = base !== "glass";
    bm.name = "batch:" + key;
    bm.userData.inst = inst; bm.userData.key = key; bm.userData.box = box;
    // a batch that only lies on the ground (grass, the pitch, paths, the yard's asphalt) hides nothing but the ground
    // under it: drawn after every other opaque batch (opaqueSort), the topmost first, and strictly in front (a layer under
    // another fails the depth test even where the two meet at equal depth far off)
    const top = inst.reduce((t, it) => Math.max(t, it.y1), -Infinity);
    if (top <= GROUND_Y){ bm.userData.ground = top; m.depthFunc = THREE.LessDepth; }
    bm.customSort = occSort;
    const ga = bm.geometry;
    bm.userData.tris = {pos:ga.attributes.position.array, index:ga.index.array};
    W.scene.add(bm);
    CH.meshes.push(bm); CH.instances += inst.length; CH.verts += NV; CH.bytes += NV*(B.tex ? 28 : 20) + NI*(NV > 65535 ? 4 : 2);
  }
  occPack();
  sortHook(W.scene);
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

/* ---------- what the walls hide ----------
   A tile behind a wall is in the view's frustum all the same: from the home lobby the whole street and the blocks
   across it are, and they are most of the triangles drawn there. Every frame, before the first batch is drawn with
   the world's camera, the opaque faces of the static batches near you (walls, floors, ceilings, roofs: triangles of
   at least OCC_AREA square metres, within OCC_RANGE and big enough from where you stand to cover a cell) are drawn
   into a small depth picture (OW x OH cells), each cell only when the face covers all of it, at the face's furthest
   depth over the cell. A batch instance (a tile, storey band and key; see finishChunks) is then left out of that
   frame's draw when every cell its bounding box covers on screen holds a face nearer than the nearest corner of the
   box. Two triangles of one flat quad count as the quad, and a wall's rows across its columns (build.js wall) are
   added, so the seams inside a wall do not read as holes. Both sides of the test err towards drawing: a cell partly
   covered counts as open, a box is measured by its outer rectangle and its nearest corner, a face is used only from
   the side it is drawn from, glass, glowing panes and anything see-through never hide anything, and neither do the
   parts that can move (they are not in the batches). Nothing is ever left out that a pixel of could show (qa/
   wpA-occlusion.mjs draws every view with and without the test and compares). The shadow pass is untouched (it draws
   with the light's camera), and so is any other camera */
const OCC_AREA = .3, OCC_RANGE = 48, OCC_SIZE = .02, OW = 64, OH = 36, BW = OW >> 2, BH = OH >> 2;
export const OC = {on:true, n:0, pts:null, nv:null, ctr:null, mi:null, inst:null, tmp:null, buf:new Float32Array(OW*OH), blk:new Float32Array(BW*BH),
  e:new Float64Array(16), fp:new Float64Array(24), frame:-1, cam:null, r:null, near:.05, used:0, tested:0, culled:0, culledTris:0, ms:0};
const occTmp = () => ({pts:[], nv:[], ctr:[], mi:[], inst:[]});
function occReset(){ OC.n = 0; OC.pts = OC.nv = OC.ctr = OC.mi = OC.inst = null; OC.tmp = occTmp(); OC.frame = -1; OC.cam = OC.r = null; }
occReset();
// can a key's faces hide what is behind them? Opaque, not glass, not a glowing pane, not the far skyline
const occluder = (base, far, m) => !far && base !== "glass" && !GLOWS.has(base) && !m.transparent && !(m.alphaTest > 0) && m.opacity >= 1 && !m.alphaMap;
/* the big faces of one tile's geometry (world space already). Two triangles in a row that share an edge and lie in
   one plane as a convex quad (the side of a box, a wall, a slab) are kept as that quad: a cell along its diagonal is
   covered by the quad, never by either half */
const _f = new Float64Array(12);
function occCollect(geo, mi, it){
  const p = geo.attributes.position.array, ix = geo.index.array, T = OC.tmp;
  const nrm = (a, b, c, o) => { const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    o[0] = uy*vz - uz*vy; o[1] = uz*vx - ux*vz; o[2] = ux*vy - uy*vx; return Math.hypot(o[0], o[1], o[2]); };
  const n1 = [0, 0, 0], n2 = [0, 0, 0], q = [0, 0, 0, 0];
  for (let k = 0; k < ix.length; k += 3){
    const t = [ix[k], ix[k + 1], ix[k + 2]];
    const l1 = nrm(t[0]*3, t[1]*3, t[2]*3, n1);
    if (l1 < 1e-9) continue;
    let nv = 3, area = l1/2;
    q[0] = t[0]; q[1] = t[1]; q[2] = t[2];
    if (k + 5 < ix.length){
      const u = [ix[k + 3], ix[k + 4], ix[k + 5]];
      // the edge of the first triangle the second one runs the other way along
      for (let e = 0; e < 3 && nv === 3; e++){
        const a = t[e], b = t[(e + 1) % 3], c = t[(e + 2) % 3];
        for (let f = 0; f < 3; f++){
          if (u[f] !== b || u[(f + 1) % 3] !== a) continue;
          const d = u[(f + 2) % 3], l2 = nrm(b*3, a*3, d*3, n2);
          if (l2 < 1e-9 || (n1[0]*n2[0] + n1[1]*n2[1] + n1[2]*n2[2])/(l1*l2) < .9999) break;
          // the quad c, a, d, b: convex when every corner turns the same way as the face
          const Q = [c, a, d, b];
          let convex = true;
          for (let m = 0; m < 4 && convex; m++){
            const i0 = Q[(m + 3) % 4]*3, i1 = Q[m]*3, i2 = Q[(m + 1) % 4]*3;
            const ax = p[i1] - p[i0], ay = p[i1 + 1] - p[i0 + 1], az = p[i1 + 2] - p[i0 + 2], bx = p[i2] - p[i1], by = p[i2 + 1] - p[i1 + 1], bz = p[i2 + 2] - p[i1 + 2];
            if ((ay*bz - az*by)*n1[0] + (az*bx - ax*bz)*n1[1] + (ax*by - ay*bx)*n1[2] < -1e-9) convex = false;
          }
          if (convex){ nv = 4; area += l2/2; q[0] = c; q[1] = a; q[2] = d; q[3] = b; }
          break;
        }
      }
    }
    if (nv === 4) k += 3;
    if (area < OCC_AREA) continue;
    let mx = 0, my = 0, mz = 0;
    for (let v = 0; v < nv; v++){ const i = q[v]*3; _f[v*3] = p[i]; _f[v*3 + 1] = p[i + 1]; _f[v*3 + 2] = p[i + 2]; mx += p[i]/nv; my += p[i + 1]/nv; mz += p[i + 2]/nv; }
    if (nv === 3){ _f[9] = _f[6]; _f[10] = _f[7]; _f[11] = _f[8]; }
    let r = 0; for (let v = 0; v < nv; v++) r = Math.max(r, Math.hypot(_f[v*3] - mx, _f[v*3 + 1] - my, _f[v*3 + 2] - mz));
    for (let v = 0; v < 12; v++) T.pts.push(_f[v]);
    T.nv.push(nv); T.ctr.push(mx, my, mz, r); T.mi.push(mi); T.inst.push(it);
  }
}
// a face given only for the test (build.js wall: a row across a wall's columns), seen from both sides
const ALWAYS = {vis:true};
function occExtra(q, mi){
  const T = OC.tmp;
  let mx = 0, my = 0, mz = 0; for (let v = 0; v < 4; v++){ mx += q[v*3]/4; my += q[v*3 + 1]/4; mz += q[v*3 + 2]/4; }
  let r = 0; for (let v = 0; v < 4; v++) r = Math.max(r, Math.hypot(q[v*3] - mx, q[v*3 + 1] - my, q[v*3 + 2] - mz));
  for (let v = 0; v < 12; v++) T.pts.push(q[v]);
  T.nv.push(4 | 8); T.ctr.push(mx, my, mz, r); T.mi.push(mi); T.inst.push(ALWAYS);
}
function occPack(){
  const T = OC.tmp; OC.n = T.mi.length;
  OC.pts = new Float32Array(T.pts); OC.nv = Uint8Array.from(T.nv); OC.ctr = new Float32Array(T.ctr); OC.mi = Uint16Array.from(T.mi); OC.inst = T.inst;
  OC.tmp = occTmp();
}
const _vp = new THREE.Matrix4();
const PX = new Float64Array(6), PY = new Float64Array(6), PW = new Float64Array(6), SX = new Float64Array(6), SY = new Float64Array(6), SQ = new Float64Array(6);
const EA = new Float64Array(6), EB = new Float64Array(6), EC = new Float64Array(6), XS = new Float64Array(4), YS = new Float64Array(4), WS = new Float64Array(4);
// the depth picture for this frame and camera (once per render)
function occFrame(cam){
  const rend = RT.renderer, f = rend ? rend.info.render.frame : 0;
  if (OC.frame === f && OC.cam === cam && OC.r === rend) return;
  const t0 = performance.now();
  OC.frame = f; OC.cam = cam; OC.r = rend; OC.near = cam.near; OC.used = OC.tested = OC.culled = OC.culledTris = 0;
  const e = _vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements, E = OC.e;
  for (let i = 0; i < 16; i++) E[i] = e[i];
  // the view's six planes (inside: a*x + b*y + c*z + d >= 0): the last row of the matrix plus or minus each other row
  const F = OC.fp;
  for (let r = 0, p = 0; r < 3; r++) for (let sg = 1; sg >= -1; sg -= 2, p += 4){
    F[p] = E[3] + sg*E[r]; F[p + 1] = E[7] + sg*E[4 + r]; F[p + 2] = E[11] + sg*E[8 + r]; F[p + 3] = E[15] + sg*E[12 + r];
  }
  const buf = OC.buf; buf.fill(Infinity);
  const me = cam.matrixWorld.elements, cx = me[12], cy = me[13], cz = me[14];
  const T = OC.pts, NV = OC.nv, C = OC.ctr, MI = OC.mi, IN = OC.inst, near = cam.near;
  for (let i = 0, n = OC.n; i < n; i++){
    // (near enough, and big enough from here to cover a whole cell: a cell is about 0.04 rad across)
    const c = i*4, dx = C[c] - cx, dy = C[c + 1] - cy, dz = C[c + 2] - cz, d2 = dx*dx + dy*dy + dz*dz, r = C[c + 3], rr = OCC_RANGE + r;
    if (d2 > rr*rr || r*r < d2*OCC_SIZE*OCC_SIZE || !IN[i].vis) continue;
    const bm = CH.meshes[MI[i]]; if (!bm || !bm.visible || !bm.material.visible) continue;
    const a = i*12, nv = NV[i] & 7, side = NV[i] & 8 ? THREE.DoubleSide : bm.material.side;
    for (let v = 0; v < nv; v++){
      const x = T[a + v*3], y = T[a + v*3 + 1], z = T[a + v*3 + 2];
      XS[v] = E[0]*x + E[4]*y + E[8]*z + E[12]; YS[v] = E[1]*x + E[5]*y + E[9]*z + E[13]; WS[v] = E[3]*x + E[7]*y + E[11]*z + E[15];
    }
    occFace(nv, side, near);
  }
  // the furthest depth in each block of 4 x 4 cells (open cells are Infinity)
  const blk = OC.blk;
  for (let bj = 0; bj < BH; bj++) for (let bi = 0; bi < BW; bi++){
    let m = 0;
    for (let j = bj*4; j < bj*4 + 4; j++) for (let k = j*OW + bi*4, e2 = k + 4; k < e2; k++) if (buf[k] > m) m = buf[k];
    blk[bj*BW + bi] = m;
  }
  OC.ms = performance.now() - t0;
}
// one face (XS, YS, WS: nv corners in clip space): cut at the near plane, then filled into the cells it covers whole
function occFace(nv, side, near){
  let m = 0;
  for (let i = 0; i < nv; i++){
    const j = i + 1 === nv ? 0 : i + 1, wi = WS[i], wj = WS[j], ini = wi > near, inj = wj > near;
    if (ini){ PX[m] = XS[i]; PY[m] = YS[i]; PW[m] = wi; m++; }
    if (ini !== inj){ const t = (near - wi)/(wj - wi); PX[m] = XS[i] + (XS[j] - XS[i])*t; PY[m] = YS[i] + (YS[j] - YS[i])*t; PW[m] = near; m++; }
  }
  if (m < 3) return;
  let A = 0;
  for (let k = 0; k < m; k++){ SX[k] = (PX[k]/PW[k]*.5 + .5)*OW; SY[k] = (PY[k]/PW[k]*.5 + .5)*OH; SQ[k] = 1/PW[k]; }
  for (let k = 0; k < m; k++){ const l = k + 1 === m ? 0 : k + 1; A += SX[k]*SY[l] - SX[l]*SY[k]; }
  // (counter-clockwise on screen is the front: a face drawn from one side only hides nothing seen from the other)
  if (Math.abs(A) < 1e-9 || (side === THREE.FrontSide && A < 0) || (side === THREE.BackSide && A > 0)) return;
  if (A < 0) for (let k = 0, l = m - 1; k < l; k++, l--){ let t = SX[k]; SX[k] = SX[l]; SX[l] = t; t = SY[k]; SY[k] = SY[l]; SY[l] = t; t = SQ[k]; SQ[k] = SQ[l]; SQ[l] = t; }
  OC.used++;
  occFill(m);
}
/* a convex counter-clockwise polygon (SX, SY, SQ = 1/w; m corners) into the cells it covers whole: row by row, the
   run of cells inside every edge at the cell's worst corner, each at the polygon's furthest depth over the cell (1/w
   is a plane over the screen: its least value over a cell is at a corner) */
function occFill(m){
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let k = 0; k < m; k++){ if (SX[k] < x0) x0 = SX[k]; if (SX[k] > x1) x1 = SX[k]; if (SY[k] < y0) y0 = SY[k]; if (SY[k] > y1) y1 = SY[k]; }
  const i0 = Math.max(0, Math.ceil(x0)), i1 = Math.min(OW, Math.floor(x1)) - 1, j0 = Math.max(0, Math.ceil(y0)), j1 = Math.min(OH, Math.floor(y1)) - 1;
  if (i0 > i1 || j0 > j1) return;
  for (let k = 0; k < m; k++){
    const l = k + 1 === m ? 0 : k + 1;
    EA[k] = SY[k] - SY[l]; EB[k] = SX[l] - SX[k]; EC[k] = -(EA[k]*SX[k] + EB[k]*SY[k]);
  }
  // the depth plane, from the best-shaped corner triangle
  let bd = 0, bk = 1;
  for (let k = 1; k + 1 < m; k++){ const d = (SX[k] - SX[0])*(SY[k + 1] - SY[0]) - (SX[k + 1] - SX[0])*(SY[k] - SY[0]); if (d > bd){ bd = d; bk = k; } }
  if (bd <= 1e-12) return;
  const xa = SX[0], ya = SY[0], qa = SQ[0], xb = SX[bk], yb = SY[bk], qb = SQ[bk], xc = SX[bk + 1], yc = SY[bk + 1], qc = SQ[bk + 1];
  const Qa = ((qb - qa)*(yc - ya) - (qc - qa)*(yb - ya))/bd, Qb = ((xb - xa)*(qc - qa) - (xc - xa)*(qb - qa))/bd, Qc = qa - Qa*xa - Qb*ya;
  const oqx = Qa > 0 ? 0 : 1, oqy = Qb > 0 ? 0 : 1, buf = OC.buf;
  for (let j = j0; j <= j1; j++){
    let lo = i0, hi = i1;
    for (let k = 0; k < m && lo <= hi; k++){
      const a = EA[k], yy = j + (EB[k] > 0 ? 0 : 1), r = -(EB[k]*yy + EC[k]);
      if (a > 0){ const v = Math.ceil(r/a); if (v > lo) lo = v; }
      else if (a < 0){ const v = Math.floor(r/a) - 1; if (v < hi) hi = v; }
      else if (r > 0) hi = -1;
    }
    for (let i = lo; i <= hi; i++){
      const q = Qa*(i + oqx) + Qb*(j + oqy) + Qc; if (q <= 0) continue;
      const w = 1/q, k = j*OW + i;
      if (w < buf[k]) buf[k] = w;
    }
  }
}
// is a box hidden in this frame's picture? (b: x0..x1, y0..y1, z0..z1)
function occHidden(b){ return occBox(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, 3); }
/* a box is hidden when it lies wholly outside one of the view's planes (a tighter test than three.js's sphere: a
   storey band above your ceiling is outside the top of the view), or when it lies in front of the camera and every
   cell of its outer rectangle holds a face nearer than its nearest corner. One that reaches round the camera is cut
   in two along its longest side (up to depth times) and is hidden only if both halves are */
function occBox(x0, y0, z0, x1, y1, z1, depth){
  const F = OC.fp;
  for (let p = 0; p < 24; p += 4){
    const a = F[p], b = F[p + 1], c = F[p + 2];
    if (a*(a > 0 ? x1 : x0) + b*(b > 0 ? y1 : y0) + c*(c > 0 ? z1 : z0) + F[p + 3] < 0) return true;
  }
  const E = OC.e, near = OC.near;
  let minW = Infinity, sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity;
  for (let k = 0; k < 8; k++){
    const x = k & 1 ? x1 : x0, y = k & 2 ? y1 : y0, z = k & 4 ? z1 : z0;
    const w = E[3]*x + E[7]*y + E[11]*z + E[15];
    if (w <= near){
      if (!depth) return false;                          // reaching round the camera: drawn
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
      if (dx >= dy && dx >= dz){ const m = (x0 + x1)/2; return occBox(x0, y0, z0, m, y1, z1, depth - 1) && occBox(m, y0, z0, x1, y1, z1, depth - 1); }
      if (dz >= dy){ const m = (z0 + z1)/2; return occBox(x0, y0, z0, x1, y1, m, depth - 1) && occBox(x0, y0, m, x1, y1, z1, depth - 1); }
      const m = (y0 + y1)/2; return occBox(x0, y0, z0, x1, m, z1, depth - 1) && occBox(x0, m, z0, x1, y1, z1, depth - 1);
    }
    const X = (E[0]*x + E[4]*y + E[8]*z + E[12])/w, Y = (E[1]*x + E[5]*y + E[9]*z + E[13])/w;
    if (X < sx0) sx0 = X; if (X > sx1) sx1 = X; if (Y < sy0) sy0 = Y; if (Y > sy1) sy1 = Y; if (w < minW) minW = w;
  }
  const i0 = Math.max(0, Math.floor((sx0*.5 + .5)*OW)), i1 = Math.min(OW - 1, Math.floor((sx1*.5 + .5)*OW));
  const j0 = Math.max(0, Math.floor((sy0*.5 + .5)*OH)), j1 = Math.min(OH - 1, Math.floor((sy1*.5 + .5)*OH));
  if (i0 > i1 || j0 > j1) return false;                    // off the screen yet not outside a plane: drawn
  const lim = minW - .05, buf = OC.buf, blk = OC.blk;
  for (let bj = j0 >> 2; bj <= j1 >> 2; bj++) for (let bi = i0 >> 2; bi <= i1 >> 2; bi++){
    if (blk[bj*BW + bi] < lim) continue;
    const ia = Math.max(i0, bi*4), ib = Math.min(i1, bi*4 + 3), ja = Math.max(j0, bj*4), jb = Math.min(j1, bj*4 + 3);
    for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) if (!(buf[j*OW + i] < lim)) return false;
  }
  return true;
}
const byNear = (a, b) => a.z - b.z, byFar = (a, b) => b.z - a.z;
/* the batched meshes' customSort (three.js calls it with the instances the frustum kept, before every draw of the
   mesh, in the shadow pass too): with the world's camera, the hidden ones are dropped; then front to back (opaque) or
   back to front (see-through), as three.js would sort them */
function occSort(list, camera){
  const box = this.userData.box;
  if (OC.on && OC.n && box && camera === RT.cam && !camera.isArrayCamera){
    occFrame(camera);
    let k = 0;
    for (let i = 0; i < list.length; i++){
      const it = list[i], b = box[it.index];
      OC.tested++;
      if (b && occHidden(b)){ OC.culled++; OC.culledTris += it.count/3; continue; }
      list[k++] = it;
    }
    list.length = k;
  }
  list.sort(this.material.transparent ? byFar : byNear);
}

/* ---------- the order of the batches ----------
   three.js draws the opaque objects material by material and only then by depth, so the batches of the room you
   stand in were drawn after whatever of the rest of the place had an earlier material, and every pixel of a room was
   shaded three or four times over (DESIGN 1.5.11: an overdraw of 2.0 at most in the bedroom and the lobby). The
   renderer sorts them front to back instead (opaqueSort, which quality.js gives every renderer it makes): a batched
   mesh by the nearest of its instances that are switched on and in view (its distance from the camera to the box: 0
   for the tiles you stand in), and of two as near, the one whose nearest box ends nearer first (the room's own walls,
   floor and furniture before the tile and storey around them); anything else by its depth. Each batch's place is
   worked out once a render, the first time the sort asks for it, for the camera that render is for (the scene tells
   us which, sortHook). The materials changed between draws this costs are a few dozen a frame. The batches that only
   lie on the ground come after every other opaque thing (the sky still comes after them), the highest layer first: nothing stands below the ground, so
   it never hides anything, while everything standing on it hides some of it, and the pitch on the grass hides the
   grass under it (out of doors the ground under the pitch, the paths and the buildings was shaded twice over) */
const SORT = {cam:null, stamp:0, fr:new THREE.Frustum(), m:new THREE.Matrix4(), bx:new THREE.Box3(), x:0, y:0, z:0};
function sortHook(scene){
  if (!scene || scene.userData.batchSort) return;
  scene.userData.batchSort = true;
  const prev = scene.onBeforeRender;
  scene.onBeforeRender = function(renderer, sc, camera, rt){
    prev.call(this, renderer, sc, camera, rt);
    SORT.cam = camera; SORT.stamp++;
    SORT.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    SORT.fr.setFromProjectionMatrix(SORT.m);
    const e = camera.matrixWorld.elements; SORT.x = e[12]; SORT.y = e[13]; SORT.z = e[14];
  };
}
// a batched mesh's place in the order this render: [the distance to its nearest box in view, where that box ends]
function batchPlace(o){
  const u = o.userData;
  if (u.sortStamp === SORT.stamp) return;
  u.sortStamp = SORT.stamp; u.sortNear = Infinity; u.sortFar = Infinity;
  const box = u.box; if (!box) return;
  const px = SORT.x, py = SORT.y, pz = SORT.z, bx = SORT.bx;
  let best = Infinity, far = Infinity;
  for (let i = 0; i < box.length; i++){
    const b = box[i];
    if (!b || b.vis === false) continue;
    const dx = Math.max(b.x0 - px, 0, px - b.x1), dy = Math.max(b.y0 - py, 0, py - b.y1), dz = Math.max(b.z0 - pz, 0, pz - b.z1);
    const d = dx*dx + dy*dy + dz*dz;
    if (d > best) continue;
    const fx = Math.max(px - b.x0, b.x1 - px), fy = Math.max(py - b.y0, b.y1 - py), fz = Math.max(pz - b.z0, b.z1 - pz), f = fx*fx + fy*fy + fz*fz;
    if (d === best && f >= far) continue;
    bx.min.set(b.x0, b.y0, b.z0); bx.max.set(b.x1, b.y1, b.z1);
    if (!SORT.fr.intersectsBox(bx)) continue;
    best = d; far = f;
  }
  if (best < Infinity){ u.sortNear = Math.sqrt(best); u.sortFar = Math.sqrt(far); }
}
const placeNear = it => { const o = it.object; if (SORT.cam && o.isBatchedMesh && o.userData.box){ batchPlace(o); return o.userData.sortNear; } return it.z; };
const placeFar = it => { const o = it.object; return SORT.cam && o.isBatchedMesh && o.userData.box ? o.userData.sortFar : it.z; };
const groundOf = it => { const g = it.object.userData.ground; return g == null ? Infinity : g; };
export function opaqueSort(a, b){
  if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
  if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
  const ga = groundOf(a), gb = groundOf(b);
  if (ga !== gb) return ga > gb ? -1 : 1;
  const na = placeNear(a), nb = placeNear(b);
  if (na !== nb) return na < nb ? -1 : 1;
  const fa = placeFar(a), fb = placeFar(b);
  if (fa !== fb) return fa < fb ? -1 : 1;
  if (a.material.id !== b.material.id) return a.material.id - b.material.id;
  return a.z - b.z || a.id - b.id;
}

/* ---------- fixed parts and signs, merged ----------
   Doors, furniture, fittings, shop shelves and printed signs are meshes of their own (they can move, open, be picked
   up or be redrawn), one draw call each. Most of them, most of the time, do none of that: those are merged. Every mesh
   that has stood still in the same place with the same look for a while (or since the place was built) joins a
   batched mesh with the others that share its kind of material (class, texture, glow, shadows), its colour baked
   into its vertices, cut into 8 m cells by storey; printed canvases are packed into atlas pages of at most 2048 x 2048
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
// the same, kept as numbers, for the check every frame (no strings made)
function lookSnap(mt, o = {}){
  o.r = mt.color ? mt.color.r : 0; o.g = mt.color ? mt.color.g : 0; o.b = mt.color ? mt.color.b : 0;
  o.er = mt.emissive ? mt.emissive.r : 0; o.eg = mt.emissive ? mt.emissive.g : 0; o.eb = mt.emissive ? mt.emissive.b : 0;
  o.ei = mt.emissiveIntensity; o.op = mt.opacity; o.vis = mt.visible; o.ver = mt.version;
  return o;
}
const lookSame = (mt, o) => mt.version === o.ver && mt.opacity === o.op && mt.visible === o.vis && mt.emissiveIntensity === o.ei
  && (!mt.color || (mt.color.r === o.r && mt.color.g === o.g && mt.color.b === o.b)) && (!mt.emissive || (mt.emissive.r === o.er && mt.emissive.g === o.eg && mt.emissive.b === o.eb));
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
  const it = {o, sig, atlas, chain:chainOf(o), mw:o.matrixWorld.clone(), mat:m, look:lookSnap(m), geo:o.geometry, gver:o.geometry.attributes.position.version,
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
/* a page's batched mesh, made again from its items (one instance per 8 m cell and storey). A page made during play is compiled
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
  const b = W.bounds || {x0:-40, x1:40, z0:-40, z1:40};
  const tiles = new Map(), cnt = it => { const g = it.o.geometry; return [g.attributes.position.count, g.index ? g.index.count : g.attributes.position.count]; };
  for (const it of pg.items){
    const e = it.mw.elements, k = `${Math.floor((e[12] - b.x0)/MCELL)},${Math.floor((e[14] - b.z0)/MCELL)},${Math.floor(e[13]/BAND)}`;
    (tiles.get(k) || tiles.set(k, []).get(k)).push(it);
  }
  let NV = 0, NI = 0;
  for (const it of pg.items){ const [a, c] = cnt(it); NV += a; NI += c; }
  const hasUV = !!pg.mat.map, bm = new THREE.BatchedMesh(tiles.size, NV, NI, pg.mat);
  let glow = 0; for (const it of pg.items) glow = Math.max(glow, glowOf(it.mat));
  if (pg.mat.emissive) pg.mat.emissiveIntensity = glow;
  const box = [];
  for (const list of tiles.values()){
    let nv = 0, ni = 0; for (const it of list){ const [a, c] = cnt(it); nv += a; ni += c; }
    const bb = {x0:Infinity, x1:-Infinity, y0:Infinity, y1:-Infinity, z0:Infinity, z1:-Infinity};
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
        if (_p.x < bb.x0) bb.x0 = _p.x; if (_p.x > bb.x1) bb.x1 = _p.x; if (_p.y < bb.y0) bb.y0 = _p.y; if (_p.y > bb.y1) bb.y1 = _p.y; if (_p.z < bb.z0) bb.z0 = _p.z; if (_p.z > bb.z1) bb.z1 = _p.z;
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
    box[bm.addInstance(bm.addGeometry(geo))] = bb; geo.dispose();
  }
  bm.userData.box = box; bm.customSort = occSort;
  const s = pg.sig.split("|");
  bm.castShadow = s[11] === "1"; bm.receiveShadow = s[12] === "1";
  bm.name = "merged:" + (pg.atlas ? "atlas" : s[0]); bm.userData.noRays = true; bm.userData.merged = true;
  return bm;
}
// has a merged mesh changed since it was merged?
function changed(it){
  const o = it.o;
  for (let i = 0; i < it.chain.length; i++){ const c = it.chain[i]; if (c[0].parent !== c[1] || !c[0].visible) return true; }
  if (o.material !== it.mat || o.geometry !== it.geo || o.geometry.attributes.position.version !== it.gver || !lookSame(o.material, it.look)) return true;
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
