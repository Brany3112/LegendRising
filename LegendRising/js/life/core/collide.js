/* ============ LIFE core: collision and rays ============
   Owner: WP-0A moves it here, WP-A implements the spatial hash. Contract: DESIGN 1.4.5, 3.9.5, 2.2 WP-0A, 2.3 WP-A.
   Walls are boxes (W.solids). You are a circle of radius R between your knees and the top of your head. The camera's
   rays meet the boxes and the drawn geometry of the place (a triangle grid built once per zone).

   SG is the one way into the boxes: a hash of 2 m cells over the place's ground plan. A box that never moves is filed
   in every cell its footprint covers when the place is built (SG.build, from camGridBuild); a box that moves (a door's
   leaf guard, a person, a car, the bus: made with solid(..., {dyn: true})) is kept on a short list that every query
   looks through, and so is any box bigger than 16 m (a hall's floor slab), which would otherwise sit in hundreds of
   cells. A query only meets the boxes in the cells it touches (2 to 8 instead of the 450 a whole street has).
   What a query finds is exactly what the old scan of every box found, in the same order: the candidates are handed
   over in the order the boxes were made (W.solids order), and a ray that meets two boxes at the same distance reports
   the one made first. So nothing that collides behaves any differently, only faster.
   A box filed as still that is moved after all (one made without {dyn: true}) is not lost: its corners are properties
   that notice the move, take the box out of the cells and put it on the moving list for good, and SG.audit() names it
   (?perf=1), so the code that made it can say {dyn: true}. */
import {THREE, W} from "../build.js";
import {P, RT, FLAGS} from "./state.js";

export const R = .26;           // your radius

/* ---------- the boxes ---------- */
const CELL = 2, BIG = 16, MARGIN = 8;
let SEQ = 0;
// a box: its corners can be read and written like plain numbers; a write that moves a box filed in the cells moves it
// to the list of moving boxes (see above)
class Box {
  constructor(x0, x1, z0, z1, y0, y1, dyn){
    this._x0 = x0; this._x1 = x1; this._z0 = z0; this._z1 = z1; this._y0 = y0; this._y1 = y1;
    this.off = false; this.dyn = !!dyn; this.seq = ++SEQ; this._m = 0; this._h = 0;
  }
  get x0(){ return this._x0; } set x0(v){ if (v !== this._x0){ this._x0 = v; if (this._h) moved(this); } }
  get x1(){ return this._x1; } set x1(v){ if (v !== this._x1){ this._x1 = v; if (this._h) moved(this); } }
  get z0(){ return this._z0; } set z0(v){ if (v !== this._z0){ this._z0 = v; if (this._h) moved(this); } }
  get z1(){ return this._z1; } set z1(v){ if (v !== this._z1){ this._z1 = v; if (this._h) moved(this); } }
  get y0(){ return this._y0; } set y0(v){ this._y0 = v; }
  get y1(){ return this._y1; } set y1(v){ this._y1 = v; }
  toJSON(){ return {x0:this._x0, x1:this._x1, z0:this._z0, z1:this._z1, y0:this._y0, y1:this._y1, off:this.off, dyn:this.dyn}; }
}
// a filed box has moved: out of the cells (it is skipped there from now on) and onto the moving list
function moved(s){
  s._h = 0; s.dyn = true; SG.dyn.push(s);
  if (SG.moved.length < 200) SG.moved.push(s);
}
const box2 = (s, x0, z0, x1, z1) => !(s._x1 < x0 || s._x0 > x1 || s._z1 < z0 || s._z0 > z1);
const bySeq = (a, b) => a.seq - b.seq;
// candidate lists, one per level of nesting (a query's callback may itself query)
const CAND = [[], [], [], []];
let depth = 0;
// what the probes count (perf.js): rays cast, boxes tested by them, queries made
export const SGSTAT = {rays:0, tests:0, queries:0};

export const SG = {
  rev:-1, dyn:[], big:[], moved:[], cells:null, nx:0, nz:0, x0:0, z0:0, mark:0, buildMs:0,
  // a new place is being built (build.js begin): nothing is filed until it is finished
  reset(){ SG.cells = null; SG.dyn = []; SG.big = []; SG.moved = []; SG.rev = -1; },
  // file the boxes of a freshly built place: every still box in the cells its footprint covers, the moving and the
  // very big ones on their lists
  build(solids = W.solids, bounds = W.bounds){
    const t0 = performance.now();
    for (const s of SG.dyn) s._h = 0;
    SG.rev = W.solidsRev || 0;
    const b = bounds || {x0:-40, x1:40, z0:-40, z1:40};
    SG.x0 = b.x0 - MARGIN; SG.z0 = b.z0 - MARGIN;
    SG.nx = Math.max(1, Math.ceil((b.x1 - b.x0 + 2*MARGIN)/CELL)); SG.nz = Math.max(1, Math.ceil((b.z1 - b.z0 + 2*MARGIN)/CELL));
    SG.cells = new Array(SG.nx*SG.nz).fill(null);
    SG.dyn = []; SG.big = []; SG.moved = [];
    for (const s of solids) file(s);
    SG.buildMs = performance.now() - t0;
  },
  // after furniture is moved or build mode changed the room (solidsChanged): filed again
  sync(){ if (SG.cells && SG.rev !== (W.solidsRev || 0)) SG.build(W.solids, W.bounds); },
  // every box whose footprint meets [x0, x1] x [z0, z1], once each, in the order they were made; fn(s) returning true
  // stops
  each(x0, z0, x1, z1, fn){
    if (SG.rev !== (W.solidsRev || 0)) SG.sync();
    SGSTAT.queries++;
    const c = CAND[depth] || (CAND[depth] = []); c.length = 0;
    if (!SG.cells){ for (const s of W.solids) if (box2(s, x0, z0, x1, z1)) c.push(s); }
    else {
      const m = ++SG.mark, NX = SG.nx;
      const ix0 = cx(x0), ix1 = cx(x1), iz0 = cz(z0), iz1 = cz(z1);
      for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++){
        const L = SG.cells[iz*NX + ix]; if (!L) continue;
        for (let k = 0; k < L.length; k++){ const s = L[k]; if (s._m === m || !s._h) continue; s._m = m; if (box2(s, x0, z0, x1, z1)) c.push(s); }
      }
      for (const L of [SG.big, SG.dyn]) for (let k = 0; k < L.length; k++){ const s = L[k]; if (s._m === m) continue; s._m = m; if (box2(s, x0, z0, x1, z1)) c.push(s); }
      if (c.length > 1) c.sort(bySeq);
    }
    depth++;
    try { for (let k = 0; k < c.length; k++) if (fn(c[k])) return; }
    finally { depth--; c.length = 0; }
  },
  /* the distance along a ray (unit direction) to the first box it meets, up to len. skip: a box [min, max] whose
     overlapping boxes are not tested (the furniture a spot is part of); a box the ray starts inside is not tested
     either. out (Float32Array(3), optional): the unit normal of the face hit, facing against the ray.
     The ray walks the 2 m cells it crosses on the ground plan (Amanatides and Woo) and stops at the first cell that
     starts beyond the nearest hit so far */
  ray(ox, oy, oz, dx, dy, dz, len, skip = null, out = null){
    if (SG.rev !== (W.solidsRev || 0)) SG.sync();
    SGSTAT.rays++;
    RAY.best = len; RAY.hit = null;
    RAY.ox = ox; RAY.oy = oy; RAY.oz = oz; RAY.ix = 1/(dx || 1e-12); RAY.iy = 1/(dy || 1e-12); RAY.iz = 1/(dz || 1e-12); RAY.skip = skip;
    if (!SG.cells){ for (const s of W.solids) slab(s); }
    else {
      const m = ++SG.mark; RAY.m = m;
      for (const L of [SG.big, SG.dyn]) for (let k = 0; k < L.length; k++){ const s = L[k]; s._m = m; slab(s); }
      const NX = SG.nx, NZ = SG.nz;
      let ix = Math.floor((ox - SG.x0)/CELL), iz = Math.floor((oz - SG.z0)/CELL);
      const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
      const tdx = Math.abs(CELL/(dx || 1e-12)), tdz = Math.abs(CELL/(dz || 1e-12));
      let tx = Math.abs(dx) < 1e-12 ? Infinity : (SG.x0 + (ix + (dx > 0 ? 1 : 0))*CELL - ox)/dx;
      let tz = Math.abs(dz) < 1e-12 ? Infinity : (SG.z0 + (iz + (dz > 0 ? 1 : 0))*CELL - oz)/dz;
      let t = 0;
      // (a ray from outside the grid is walked from where it is: cells off the grid are empty)
      for (let guard = 0; guard < 4096 && t <= RAY.best; guard++){
        if (ix >= 0 && ix < NX && iz >= 0 && iz < NZ){
          const L = SG.cells[iz*NX + ix];
          if (L) for (let k = 0; k < L.length; k++){ const s = L[k]; if (s._m === m || !s._h) continue; s._m = m; slab(s); }
        } else if ((ix < 0 && dx <= 0) || (ix >= NX && dx >= 0) || (iz < 0 && dz <= 0) || (iz >= NZ && dz >= 0)) break;
        if (tx <= tz){ t = tx; tx += tdx; ix += sx; } else { t = tz; tz += tdz; iz += sz; }
      }
    }
    const hit = RAY.hit;
    if (out && hit){
      // the face: the slab the ray entered last
      const ix = RAY.ix, iy = RAY.iy, iz = RAY.iz;
      const tx = Math.min((hit._x0 - ox)*ix, (hit._x1 - ox)*ix), ty = Math.min((hit._y0 - oy)*iy, (hit._y1 - oy)*iy), tz = Math.min((hit._z0 - oz)*iz, (hit._z1 - oz)*iz);
      out[0] = out[1] = out[2] = 0;
      if (tx >= ty && tx >= tz) out[0] = dx > 0 ? -1 : 1; else if (ty >= tz) out[1] = dy > 0 ? -1 : 1; else out[2] = dz > 0 ? -1 : 1;
    }
    return RAY.best;
  },
  // is any box within r of the point?
  anyWithin(x, y, z, r){
    let found = false;
    const r2 = r*r;
    SG.each(x - r, z - r, x + r, z + r, s => {
      if (s.off) return false;
      const ex = Math.max(s._x0 - x, 0, x - s._x1), ey = Math.max(s._y0 - y, 0, y - s._y1), ez = Math.max(s._z0 - z, 0, z - s._z1);
      return (found = ex*ex + ey*ey + ez*ez <= r2);
    });
    return found;
  },
  // the boxes filed as still that have moved since the place was built (they should have been made {dyn: true})
  audit(){ return SG.moved.slice(); }
};
const cx = x => Math.max(0, Math.min(SG.nx - 1, Math.floor((x - SG.x0)/CELL)));
const cz = z => Math.max(0, Math.min(SG.nz - 1, Math.floor((z - SG.z0)/CELL)));
// file one box: in the cells of its footprint, or on the moving or the big list
function file(s){
  if (!SG.cells) return;
  if (s.dyn){ s._h = 0; SG.dyn.push(s); return; }
  if (Math.max(s._x1 - s._x0, s._z1 - s._z0) > BIG){ s._h = 0; SG.big.push(s); return; }
  const NX = SG.nx, ix1 = cx(s._x1), iz1 = cz(s._z1);
  for (let iz = cz(s._z0); iz <= iz1; iz++) for (let ix = cx(s._x0); ix <= ix1; ix++){
    const i = iz*NX + ix; (SG.cells[i] || (SG.cells[i] = [])).push(s);
  }
  s._h = 1;
}
// the ray in flight, and the slab test of one box against it
const RAY = {best:0, hit:null, ox:0, oy:0, oz:0, ix:0, iy:0, iz:0, skip:null, m:0};
function slab(s){
  if (s.off) return;
  SGSTAT.tests++;
  const ox = RAY.ox, oy = RAY.oy, oz = RAY.oz, skip = RAY.skip;
  if (skip && s._x0 < skip[1][0] && s._x1 > skip[0][0] && s._y0 < skip[1][1] && s._y1 > skip[0][1] && s._z0 < skip[1][2] && s._z1 > skip[0][2]) return;
  if (ox > s._x0 && ox < s._x1 && oy > s._y0 && oy < s._y1 && oz > s._z0 && oz < s._z1) return;
  const ix = RAY.ix, iy = RAY.iy, iz = RAY.iz;
  let a = (s._x0 - ox)*ix, b = (s._x1 - ox)*ix, t0 = Math.min(a, b), t1 = Math.max(a, b);
  a = (s._y0 - oy)*iy; b = (s._y1 - oy)*iy; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
  a = (s._z0 - oz)*iz; b = (s._z1 - oz)*iz; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
  if (t0 <= t1 && t1 > 0 && t0 >= 0 && (t0 < RAY.best || (t0 === RAY.best && RAY.hit && s.seq < RAY.hit.seq))){ RAY.best = t0; RAY.hit = s; }
}
// a box you cannot walk through. dyn: it moves (a door's leaf guard, a person, a car); build.js re-exports this
export function solid(x0, x1, z0, z1, y0 = 0, y1 = 3, {dyn = false} = {}){
  const s = new Box(Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1), y0, y1, dyn);
  W.solids.push(s);
  file(s);
  return s;
}
// the room's boxes changed for good (furniture taken away, build mode): the index is brought up to date
export function solidsChanged(){ W.solidsRev = (W.solidsRev || 0) + 1; SG.sync(); }

/* ---------- you against the walls ----------
   A box you are already inside when a move starts (a door swung shut onto you, a leaf held against you) never blocks
   that move: every such box is ignored, all of them, so no combination of the pieces of a door can pin you. But a move
   may only take you out of them, never deeper in: the depth of each (how far you would have to go to be clear of it,
   the nearest way out) must not grow, so you step out on the side you are mostly on and can never walk on through a
   door you were caught by. */
export const inside = [], insideD = [];
const Q = {x:0, z:0, lo:0, hi:0, hit:null};
const hitTest = s => {
  if (s.off || s._y1 <= Q.lo || s._y0 >= Q.hi) return false;
  if (Q.x + R > s._x0 && Q.x - R < s._x1 && Q.z + R > s._z0 && Q.z - R < s._z1 && !inside.includes(s)){ Q.hit = s; return true; }
  return false;
};
export function hits(x, z){
  Q.x = x; Q.z = z; Q.lo = P.feet + .42; Q.hi = P.feet + 1.75; Q.hit = null;
  SG.each(x - R, z - R, x + R, z + R, hitTest);
  return Q.hit;
}
const depthIn = (s, x, z) => Math.min(x + R - s.x0, s.x1 - x + R, z + R - s.z0, s.z1 - z + R);
const inTest = s => {
  if (s.off || s._y1 <= Q.lo || s._y0 >= Q.hi) return false;
  if (Q.x + R > s._x0 && Q.x - R < s._x1 && Q.z + R > s._z0 && Q.z - R < s._z1){ inside.push(s); insideD.push(depthIn(s, Q.x, Q.z)); }
  return false;
};
// the boxes you are in right now, and how deep
export function findInside(){
  inside.length = insideD.length = 0;
  Q.x = P.x; Q.z = P.z; Q.lo = P.feet + .42; Q.hi = P.feet + 1.75;
  SG.each(P.x - R, P.z - R, P.x + R, P.z + R, inTest);
}
// would being at (x, z) put you deeper into any box you started inside (or back into one you have left)?
function deeper(x, z){
  for (let i = 0; i < inside.length; i++){ const d = depthIn(inside[i], x, z); if (d > 0 && d > insideD[i] + 1e-6) return true; }
  return false;
}
// where you may be at all: the zone's bounds, or the box a drill keeps you in
const bounds = () => FLAGS.drill && FLAGS.drill.moveBox ? FLAGS.drill.moveBox : W.bounds;
export function moveBy(dx, dz){
  const b = bounds();
  findInside();
  // long frames are split so a sprint can never carry you through a thin wall
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz))/.12));
  dx /= n; dz /= n;
  for (let i = 0; i < n; i++){
    if (dx){
      let nx = P.x + dx; const s = hits(nx, P.z);
      if (s){ nx = dx > 0 ? s.x0 - R - 1e-3 : s.x1 + R + 1e-3; if (hits(nx, P.z)) nx = P.x; P.vx = 0; dx = 0; }
      if (inside.length && nx !== P.x && deeper(nx, P.z)){ nx = P.x; P.vx = 0; dx = 0; }
      if (nx < b.x0 || nx > b.x1){ nx = Math.max(b.x0, Math.min(b.x1, nx)); P.vx = 0; }
      if (inside.length) for (let k = 0; k < inside.length; k++) insideD[k] = Math.min(insideD[k], depthIn(inside[k], nx, P.z));
      P.x = nx;
    }
    if (dz){
      let nz = P.z + dz; const s = hits(P.x, nz);
      if (s){ nz = dz > 0 ? s.z0 - R - 1e-3 : s.z1 + R + 1e-3; if (hits(P.x, nz)) nz = P.z; P.vz = 0; dz = 0; }
      if (inside.length && nz !== P.z && deeper(P.x, nz)){ nz = P.z; P.vz = 0; dz = 0; }
      if (nz < b.z0 || nz > b.z1){ nz = Math.max(b.z0, Math.min(b.z1, nz)); P.vz = 0; }
      if (inside.length) for (let k = 0; k < inside.length; k++) insideD[k] = Math.min(insideD[k], depthIn(inside[k], P.x, nz));
      P.z = nz;
    }
  }
}
// are you pressed up against something (a wall, the edge of the zone, a drill's box) on that side?
export function touching(sx, sz){
  const b = bounds();
  if (sx > 0 ? P.x >= b.x1 - 1e-4 : sx < 0 && P.x <= b.x0 + 1e-4) return true;
  if (sz > 0 ? P.z >= b.z1 - 1e-4 : sz < 0 && P.z <= b.z0 + 1e-4) return true;
  findInside();
  const x = P.x + sx*.01, z = P.z + sz*.01;
  return !!hits(x, z) || (inside.length > 0 && deeper(x, z));
}

/* ---------- the camera's rays ----------
   Every triangle of the place's fixed geometry (the static batches, read from the CPU copy chunks.js keeps, and the
   other fixed meshes), sorted once into 1 m cells when the place is built, and a ray walks the cells it passes through
   (Amanatides and Woo). Doors and other things that move are not in it: their collision boxes are tested instead. */
export const CG = {tri:null, n:0, x0:0, y0:0, z0:0, nx:0, ny:0, nz:0, start:null, items:null, stamp:null, mark:0};
const CS = 1;
const _I4 = new THREE.Matrix4();
export function camGridBuild(){
  CG.tri = CG.start = CG.items = CG.stamp = null; CG.n = 0;
  try {
    const scene = RT.scene;
    scene.updateMatrixWorld(true);
    const list = [];
    let n = 0;
    for (const o of scene.children){
      if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || (o.userData && o.userData.keep)) continue;
      const m = o.material;
      if (!m || Array.isArray(m) || m.isShaderMaterial || m.blending === THREE.AdditiveBlending) continue;
      // a static batch (chunks.js): its triangles from the CPU copy it keeps, already in world space
      if (o.isBatchedMesh){ const T = o.userData.tris; if (T && !o.userData.noRays){ n += T.index.length/3 | 0; list.push(o); } continue; }
      if (m.isMeshBasicMaterial || !o.geometry || !o.geometry.attributes.position) continue;
      const g = o.geometry; n += (g.index ? g.index.count : g.attributes.position.count)/3 | 0; list.push(o);
    }
    const b = W.bounds;
    CG.x0 = b.x0 - 8; CG.z0 = b.z0 - 8; CG.y0 = -2;
    CG.nx = Math.ceil((b.x1 - b.x0 + 16)/CS); CG.nz = Math.ceil((b.z1 - b.z0 + 16)/CS); CG.ny = 44;
    const T = new Float32Array(n*9), v = new THREE.Vector3();
    let k = 0;
    for (const o of list){
      if (o.isBatchedMesh){
        const {pos, index} = o.userData.tris;
        for (let i = 0; i < index.length; i++){ const j = index[i]*3; T[k++] = pos[j]; T[k++] = pos[j + 1]; T[k++] = pos[j + 2]; }
        continue;
      }
      const g = o.geometry, pos = g.attributes.position, idx = g.index, cnt = idx ? idx.count : pos.count, M = o.matrixWorld, id = M.equals(_I4);
      for (let i = 0; i < cnt; i++){
        v.fromBufferAttribute(pos, idx ? idx.getX(i) : i); if (!id) v.applyMatrix4(M);
        T[k++] = v.x; T[k++] = v.y; T[k++] = v.z;
      }
    }
    CG.tri = T; CG.n = n;
    const NX = CG.nx, NY = CG.ny, NZ = CG.nz, cells = NX*NY*NZ, cnt = new Int32Array(cells + 1);
    const span = (i, f) => {
      const a = i*9;
      const x0 = Math.min(T[a], T[a + 3], T[a + 6]), x1 = Math.max(T[a], T[a + 3], T[a + 6]), y0 = Math.min(T[a + 1], T[a + 4], T[a + 7]), y1 = Math.max(T[a + 1], T[a + 4], T[a + 7]);
      const z0 = Math.min(T[a + 2], T[a + 5], T[a + 8]), z1 = Math.max(T[a + 2], T[a + 5], T[a + 8]);
      const cx0 = Math.max(0, Math.floor((x0 - CG.x0)/CS)), cx1 = Math.min(NX - 1, Math.floor((x1 - CG.x0)/CS));
      const cy0 = Math.max(0, Math.floor((y0 - CG.y0)/CS)), cy1 = Math.min(NY - 1, Math.floor((y1 - CG.y0)/CS));
      const cz0 = Math.max(0, Math.floor((z0 - CG.z0)/CS)), cz1 = Math.min(NZ - 1, Math.floor((z1 - CG.z0)/CS));
      for (let z = cz0; z <= cz1; z++) for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) f((z*NY + y)*NX + x);
    };
    for (let i = 0; i < n; i++) span(i, c => cnt[c + 1]++);
    for (let c = 0; c < cells; c++) cnt[c + 1] += cnt[c];
    const items = new Int32Array(cnt[cells]), fill = cnt.slice(0, cells);
    for (let i = 0; i < n; i++) span(i, c => { items[fill[c]++] = i; });
    CG.start = cnt; CG.items = items; CG.stamp = new Uint32Array(n); CG.mark = 0;
  } catch(e){ console.error(e); CG.tri = null; CG.n = 0; }
  SG.build(W.solids, W.bounds);
}
// is any drawn triangle filed within r of the point? (the cells the sphere's box covers; true errs on the side of
// "maybe", which only means the camera's push rays are cast as they always were)
export function CGnear(x, y, z, r){
  if (!CG.tri) return false;
  const NX = CG.nx, NY = CG.ny, NZ = CG.nz, st = CG.start;
  const x0 = Math.max(0, Math.floor((x - r - CG.x0)/CS)), x1 = Math.min(NX - 1, Math.floor((x + r - CG.x0)/CS));
  const y0 = Math.max(0, Math.floor((y - r - CG.y0)/CS)), y1 = Math.min(NY - 1, Math.floor((y + r - CG.y0)/CS));
  const z0 = Math.max(0, Math.floor((z - r - CG.z0)/CS)), z1 = Math.min(NZ - 1, Math.floor((z + r - CG.z0)/CS));
  for (let k = z0; k <= z1; k++) for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++){ const c = (k*NY + j)*NX + i; if (st[c + 1] > st[c]) return true; }
  return false;
}
/* is the camera at (x, y, z) clear of everything by r? Nothing to push it away from: no box and no filed triangle
   within r (DESIGN 3.9.5, the camera push early out: on an open pitch all of its rays are skipped) */
export function camClear(x, y, z, r){ return !SG.anyWithin(x, y, z, r) && !CGnear(x, y, z, r); }
/* the distance along a ray (unit direction) to the first thing it meets, up to len: a box (SG.ray, with skip) or a
   triangle of the drawn geometry. out (Float32Array(3), optional) receives the unit normal of what it hit, facing
   against the ray; it is left alone when nothing is hit */
export function camCast(ox, oy, oz, dx, dy, dz, len, skip = null, out = null){
  let best = SG.ray(ox, oy, oz, dx, dy, dz, len, skip, out), tri = -1;
  if (!CG.tri) return best;
  // the drawn geometry: walk the cells along the ray
  const T = CG.tri, NX = CG.nx, NY = CG.ny, NZ = CG.nz, st = CG.start, it = CG.items, stamp = CG.stamp;
  if (++CG.mark > 4e9){ stamp.fill(0); CG.mark = 1; }
  const mark = CG.mark;
  let cx = Math.floor((ox - CG.x0)/CS), cy = Math.floor((oy - CG.y0)/CS), cz = Math.floor((oz - CG.z0)/CS);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = Math.abs(CS/(dx || 1e-12)), tdy = Math.abs(CS/(dy || 1e-12)), tdz = Math.abs(CS/(dz || 1e-12));
  const nb = (c, o, d, s0) => { const edge = s0 + (c + (d > 0 ? 1 : 0))*CS; return Math.abs(d) < 1e-12 ? Infinity : (edge - o)/d; };
  let tx = nb(cx, ox, dx, CG.x0), ty = nb(cy, oy, dy, CG.y0), tz = nb(cz, oz, dz, CG.z0), t = 0;
  for (let guard = 0; guard < 64 && t <= best; guard++){
    if (cx >= 0 && cx < NX && cy >= 0 && cy < NY && cz >= 0 && cz < NZ){
      const c = (cz*NY + cy)*NX + cx;
      for (let j = st[c], e = st[c + 1]; j < e; j++){
        const i = it[j]; if (stamp[i] === mark) continue; stamp[i] = mark;
        const a = i*9;
        // Moller and Trumbore, both faces
        const e1x = T[a + 3] - T[a], e1y = T[a + 4] - T[a + 1], e1z = T[a + 5] - T[a + 2], e2x = T[a + 6] - T[a], e2y = T[a + 7] - T[a + 1], e2z = T[a + 8] - T[a + 2];
        const px = dy*e2z - dz*e2y, py = dz*e2x - dx*e2z, pz = dx*e2y - dy*e2x, det = e1x*px + e1y*py + e1z*pz;
        if (Math.abs(det) < 1e-10) continue;
        const inv = 1/det, qx = ox - T[a], qy = oy - T[a + 1], qz = oz - T[a + 2], u = (qx*px + qy*py + qz*pz)*inv;
        if (u < 0 || u > 1) continue;
        const rx = qy*e1z - qz*e1y, ry = qz*e1x - qx*e1z, rz = qx*e1y - qy*e1x, w = (dx*rx + dy*ry + dz*rz)*inv;
        if (w < 0 || u + w > 1) continue;
        const h = (e2x*rx + e2y*ry + e2z*rz)*inv;
        if (h > 1e-4 && h < best){ best = h; tri = i; }
      }
    }
    if (tx <= ty && tx <= tz){ t = tx; tx += tdx; cx += sx; } else if (ty <= tz){ t = ty; ty += tdy; cy += sy; } else { t = tz; tz += tdz; cz += sz; }
  }
  if (out && tri >= 0){
    const a = tri*9;
    const e1x = T[a + 3] - T[a], e1y = T[a + 4] - T[a + 1], e1z = T[a + 5] - T[a + 2], e2x = T[a + 6] - T[a], e2y = T[a + 7] - T[a + 1], e2z = T[a + 8] - T[a + 2];
    let nx = e1y*e2z - e1z*e2y, ny = e1z*e2x - e1x*e2z, nz = e1x*e2y - e1y*e2x;
    const L = Math.hypot(nx, ny, nz) || 1, f = nx*dx + ny*dy + nz*dz > 0 ? -1/L : 1/L;
    out[0] = nx*f; out[1] = ny*f; out[2] = nz*f;
  }
  return best;
}
// the floor, step or tread under a point (looking down from 45 cm above it, at most 95 cm), or null
export function surfaceUnder(x, y, z){ const top = y + .45, d = camCast(x, top, z, 0, -1, 0, .95); return d < .95 ? top - d : null; }
