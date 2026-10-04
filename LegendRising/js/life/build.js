/* ============ LIFE: the builder ============
   Everything that never moves is poured into a handful of big meshes (one per material), with the
   colour baked into each vertex. A whole street is then only a few draw calls, which is what lets
   a laptop's built-in graphics hold 60 fps. Things that move — doors, the curtain, the food in the
   fridge — are ordinary meshes of their own. */
import * as THREE from "../../vendor/three.module.js";
export { THREE };

export const LH = 3.2;            // one storey, floor to floor
export const W = {
  scene: null,
  solids: [],                     // boxes you cannot walk through: {x0,x1,z0,z1,y0,y1,off}
  floors: [],                     // flat things you can stand on: {x0,x1,z0,z1,h}
  ramps: [],                      // stairs: {x0,x1,z0,z1,axis,a0,a1,h0,h1}
  spots: [],                      // things you can use
  anims: [],                      // little things that move every frame
  bounds: {x0:-40, x1:40, z0:-40, z1:40},
  lit: null,                      // the material of windows that glow at night
  mats: {},                       // batch materials by key, so the time of day can turn lamps and signs up and down
  lights: [],                     // light sources: {x,y,z,color,intensity,distance,indoor,on()} — a few real lights follow you between them
  pools: [],                      // soft pools of light on the ground under street lamps, faded in at night
  zone: ""
};
// High graphics light everything physically; Low keeps the cheaper Lambert look
const lowGfx = () => typeof GFX !== "undefined" && GFX.low;
export function mat(o = {}){
  if (lowGfx()){
    const m = Object.assign({}, o); delete m.roughness; delete m.metalness; delete m.envMapIntensity;
    return new THREE.MeshLambertMaterial(m);
  }
  return new THREE.MeshStandardMaterial(Object.assign({roughness:.86, metalness:0}, o));
}

/* ---------- a tiny seeded random, so the same career always gets the same street ---------- */
let seed = 1;
export function reseed(s){ seed = (s >>> 0) || 1; }
export function rnd(){ seed = (seed*1664525 + 1013904223) >>> 0; return seed/4294967296; }
export const pick = a => a[Math.floor(rnd()*a.length)];

/* ---------- procedural textures ---------- */
const TEX = {};
function canvas(w, h){ const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; }
function noise(g, w, h, n, a, dark = true){
  for (let i = 0; i < n; i++){
    const v = dark ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${Math.random()*a})`;
    g.fillRect(Math.random()*w, Math.random()*h, 1 + Math.random()*2, 1 + Math.random()*2);
  }
}
function finish(c, per){
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4; t.userData.per = per;            // metres one copy of the picture covers
  return t;
}
const MAKERS = {
  planks(){ const [c, g] = canvas(256, 256);
    for (let i = 0; i < 8; i++){
      const y = i*32, base = 92 + Math.random()*26;
      g.fillStyle = `rgb(${base + 34},${base},${base - 34})`; g.fillRect(0, y, 256, 32);
      for (let k = 0; k < 14; k++){ g.fillStyle = `rgba(60,35,15,${Math.random()*.12})`; g.fillRect(0, y + Math.random()*32, 256, 1); }
      g.fillStyle = "rgba(25,14,6,.75)"; g.fillRect(0, y, 256, 2);
      const cut = (i*97) % 256; g.fillRect(cut, y, 2, 32);
    }
    g.fillStyle = "rgba(30,20,10,.18)"; g.beginPath(); g.ellipse(170, 130, 60, 34, .3, 0, 7); g.fill();   // worn
    noise(g, 256, 256, 900, .18); return finish(c, 2.2); },
  paper(){ const [c, g] = canvas(256, 256);
    g.fillStyle = "#a9a888"; g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 32){ g.fillStyle = "rgba(70,72,50,.16)"; g.fillRect(x, 0, 3, 256); g.fillStyle = "rgba(255,250,220,.08)"; g.fillRect(x + 14, 0, 4, 256); }
    for (let y = 8; y < 256; y += 32) for (let x = 16; x < 256; x += 32){ g.fillStyle = "rgba(90,88,60,.18)"; g.beginPath(); g.ellipse(x, y + (x % 64 ? 16 : 0), 3, 6, 0, 0, 7); g.fill(); }
    for (let i = 0; i < 3; i++){ const gr = g.createRadialGradient(40 + i*90, 30 + i*50, 4, 40 + i*90, 30 + i*50, 50);
      gr.addColorStop(0, "rgba(120,90,40,.22)"); gr.addColorStop(1, "rgba(120,90,40,0)"); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
    noise(g, 256, 256, 1600, .12); return finish(c, 2.4); },
  tiles(){ const [c, g] = canvas(256, 256);
    g.fillStyle = "#8b9299"; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++){ const v = 214 + Math.random()*20; g.fillStyle = `rgb(${v},${v + 3},${v + 6})`; g.fillRect(x*32 + 1.5, y*32 + 1.5, 29, 29); }
    noise(g, 256, 256, 500, .1); return finish(c, 1.2); },
  terrazzo(){ const [c, g] = canvas(256, 256);
    g.fillStyle = "#a59f95"; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++){ const v = 60 + Math.random()*170; g.fillStyle = `rgba(${v},${v - 6},${v - 14},.8)`; g.fillRect(Math.random()*256, Math.random()*256, 2 + Math.random()*3, 2 + Math.random()*3); }
    g.strokeStyle = "rgba(40,35,30,.35)"; g.lineWidth = 2; g.strokeRect(0, 0, 256, 256);
    return finish(c, 1.6); },
  asphalt(){ const [c, g] = canvas(256, 256);
    g.fillStyle = "#3a3e43"; g.fillRect(0, 0, 256, 256);
    noise(g, 256, 256, 5000, .3); noise(g, 256, 256, 2500, .08, false);
    g.strokeStyle = "rgba(15,15,18,.5)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(20, 200); g.lineTo(80, 170); g.lineTo(110, 190); g.stroke();
    return finish(c, 6); },
  slabs(){ const [c, g] = canvas(256, 256);
    g.fillStyle = "#5d636a"; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++){ const v = 140 + Math.random()*22; g.fillStyle = `rgb(${v},${v + 2},${v + 5})`; g.fillRect(x*64 + 2, y*64 + 2, 60, 60); }
    noise(g, 256, 256, 2200, .16); return finish(c, 3); },
  grass(){ const [c, g] = canvas(256, 256);
    g.fillStyle = "#4b7a3f"; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3500; i++){ const v = Math.random(); g.fillStyle = v < .5 ? "rgba(40,80,30,.5)" : "rgba(110,150,70,.35)"; g.fillRect(Math.random()*256, Math.random()*256, 1, 3); }
    return finish(c, 4); },
  pitch(){ const [c, g] = canvas(512, 512);
    // mown stripes, a little uneven, with worn patches where the drills happen
    for (let i = 0; i < 8; i++){ g.fillStyle = i % 2 ? "#3e8a49" : "#479850"; g.fillRect(0, i*64, 512, 64); }
    for (let i = 0; i < 9000; i++){ g.fillStyle = Math.random() < .55 ? "rgba(20,60,20,.22)" : "rgba(120,180,90,.14)"; g.fillRect(Math.random()*512, Math.random()*512, 1, 2 + Math.random()*2); }
    for (let i = 0; i < 6; i++){ const gr = g.createRadialGradient(80 + i*70, 120 + (i*137) % 300, 4, 80 + i*70, 120 + (i*137) % 300, 46);
      gr.addColorStop(0, "rgba(120,110,60,.16)"); gr.addColorStop(1, "rgba(120,110,60,0)"); g.fillStyle = gr; g.fillRect(0, 0, 512, 512); }
    return finish(c, 20); },
  rubber(){ const [c, g] = canvas(128, 128);
    g.fillStyle = "#4a5056"; g.fillRect(0, 0, 128, 128); noise(g, 128, 128, 1400, .25, false); return finish(c, 1.5); },
  concrete(){ const [c, g] = canvas(256, 256);
    g.fillStyle = "#9a9892"; g.fillRect(0, 0, 256, 256); noise(g, 256, 256, 4200, .12); noise(g, 256, 256, 1600, .08, false);
    g.strokeStyle = "rgba(40,40,40,.28)"; g.lineWidth = 2; g.strokeRect(1, 1, 254, 254);
    return finish(c, 4); },
  path(){ const [c, g] = canvas(256, 256);
    g.fillStyle = "#7f7c76"; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++){ const v = 150 + Math.random()*24, o = y % 2 ? 32 : 0;
      g.fillStyle = `rgb(${v},${v - 4},${v - 10})`; g.fillRect(((x*64 + o) % 256) + 2, y*32 + 2, 60, 28); if (o && x === 3) g.fillRect(2, y*32 + 2, 28, 28); }
    noise(g, 256, 256, 2400, .14); return finish(c, 2.4); },
  rubberFloor(){ const [c, g] = canvas(256, 256);
    g.fillStyle = "#33363a"; g.fillRect(0, 0, 256, 256); noise(g, 256, 256, 3000, .25, false);
    for (let i = 0; i < 900; i++){ g.fillStyle = Math.random() < .5 ? "rgba(90,160,150,.5)" : "rgba(200,210,90,.35)"; g.fillRect(Math.random()*256, Math.random()*256, 1.5, 1.5); }
    g.strokeStyle = "rgba(0,0,0,.45)"; g.lineWidth = 2; g.strokeRect(0, 0, 256, 256); return finish(c, 1); },
  turf(){ const [c, g] = canvas(256, 256);
    g.fillStyle = "#3f8a48"; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5000; i++){ g.fillStyle = Math.random() < .5 ? "rgba(30,80,35,.35)" : "rgba(110,170,90,.25)"; g.fillRect(Math.random()*256, Math.random()*256, 1, 2); }
    return finish(c, 3); },
  carpet(){ const [c, g] = canvas(128, 128);
    g.fillStyle = "#2c3846"; g.fillRect(0, 0, 128, 128); noise(g, 128, 128, 2400, .18); noise(g, 128, 128, 800, .06, false); return finish(c, 1.5); },
  shopfloor(){ const [c, g] = canvas(256, 256);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++){ const v = (x + y) % 2 ? 222 : 206; g.fillStyle = `rgb(${v},${v - 2},${v - 8})`; g.fillRect(x*64, y*64, 64, 64); }
    g.strokeStyle = "rgba(90,90,90,.25)"; for (let i = 0; i <= 4; i++){ g.beginPath(); g.moveTo(i*64, 0); g.lineTo(i*64, 256); g.moveTo(0, i*64); g.lineTo(256, i*64); g.stroke(); }
    noise(g, 256, 256, 900, .06); return finish(c, 2.4); },
  plaster(){ const [c, g] = canvas(256, 256);
    g.fillStyle = "#d9d3c4"; g.fillRect(0, 0, 256, 256); noise(g, 256, 256, 2500, .08);
    const gr = g.createLinearGradient(0, 200, 0, 256); gr.addColorStop(0, "rgba(80,70,50,0)"); gr.addColorStop(1, "rgba(80,70,50,.25)"); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    return finish(c, 3); }
};
export function tex(name){ return TEX[name] || (TEX[name] = MAKERS[name]()); }
// a goal net or a wire fence: lines on a clear background, cut out with alphaTest
export function netTex(cell = 16, line = 2, col = "#f4f4f0"){
  const k = `net:${cell}:${line}:${col}`; if (TEX[k]) return TEX[k];
  const [c, g] = canvas(128, 128);
  g.strokeStyle = col; g.lineWidth = line;
  for (let i = 0; i <= 128; i += cell){ g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (TEX[k] = t);
}

/* ---------- the batches ---------- */
const batches = new Map();
function batch(key){
  let b = batches.get(key);
  if (!b){ b = {pos:[], nor:[], col:[], uv:[]}; batches.set(key, b); }
  return b;
}
const _c = new THREE.Color(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m3 = new THREE.Matrix3();
/* pour a geometry (already where it belongs, or with a matrix) into its batch */
export function addGeo(geo, color, o = {}){
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (o.matrix) g.applyMatrix4(o.matrix);
  if (o.flat) g.computeVertexNormals();            // non-indexed: every face its own normal — the faceted low-poly look
  const key = o.key || (o.tex ? "t:" + o.tex : "plain");
  const b = batch(key);
  const p = g.attributes.position.array, n = g.attributes.normal.array;
  _c.set(color);
  const j = 1 + (rnd() - .5)*(o.jit == null ? .07 : o.jit);
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 1; i < p.length; i += 3){ if (p[i] < y0) y0 = p[i]; if (p[i] > y1) y1 = p[i]; }
  const ao = o.ao !== false && (y1 - y0) > .35;
  const per = o.tex ? tex(o.tex).userData.per : 1;
  for (let i = 0; i < p.length; i += 3){
    const x = p[i], y = p[i+1], z = p[i+2], nx = n[i], ny = n[i+1], nz = n[i+2];
    b.pos.push(x, y, z); b.nor.push(nx, ny, nz);
    // a little contact shadow at the foot of anything tall
    const f = (ao && y - y0 < .01 && Math.abs(ny) < .5 ? .72 : 1)*j*(o.shade || 1);
    b.col.push(_c.r*f, _c.g*f, _c.b*f);
    if (o.tex){
      const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
      if (ay >= ax && ay >= az) b.uv.push(x/per, z/per);
      else if (ax >= az) b.uv.push(z/per, y/per);
      else b.uv.push(x/per, y/per);
    } else b.uv.push(0, 0);
  }
  if (g !== geo) g.dispose();
  geo.dispose();
}
export function box(x0, y0, z0, x1, y1, z1, color, o = {}){
  if (x1 < x0) [x0, x1] = [x1, x0]; if (y1 < y0) [y0, y1] = [y1, y0]; if (z1 < z0) [z0, z1] = [z1, z0];
  const g = new THREE.BoxGeometry(Math.max(.001, x1 - x0), Math.max(.001, y1 - y0), Math.max(.001, z1 - z0));
  if (o.ry){ g.rotateY(o.ry); }
  g.translate((x0 + x1)/2, (y0 + y1)/2, (z0 + z1)/2);
  addGeo(g, color, o);
  if (o.solid) solid(x0, x1, z0, z1, y0, y1);
  return {x0, x1, y0, y1, z0, z1};
}
export function cyl(x, y, z, r, h, color, o = {}){
  const g = new THREE.CylinderGeometry(o.rt == null ? r : o.rt, r, h, o.seg || 10, 1, !!o.open);
  if (o.rx) g.rotateX(o.rx); if (o.rz) g.rotateZ(o.rz); if (o.ry) g.rotateY(o.ry);
  g.translate(x, y + (o.rx || o.rz ? 0 : h/2), z);
  addGeo(g, color, Object.assign({ao:false}, o));
}
export function blob(x, y, z, r, color, o = {}){        // a low-poly ball: tree tops, bushes
  const g = new THREE.IcosahedronGeometry(r, o.detail || 0);
  if (o.sy) g.scale(1, o.sy, 1);
  g.translate(x, y, z); addGeo(g, color, Object.assign({ao:false}, o));
}
/* a box with its edges and corners rounded off. Built from a segmented cube whose outer rows are pushed
   out onto quarter circles, so it costs a few dozen triangles and reads as a soft, made object. */
export function roundedBoxGeo(w, h, d, r, seg = 1){
  r = Math.max(0, Math.min(r, w/2 - 1e-3, h/2 - 1e-3, d/2 - 1e-3));
  if (r <= 2e-3) return new THREE.BoxGeometry(w, h, d);
  const s = seg*2 + 1, g = new THREE.BoxGeometry(1, 1, 1, s, s, s);
  const p = g.attributes.position, n = g.attributes.normal;
  const half = [w/2, h/2, d/2], inner = [w/2 - r, h/2 - r, d/2 - r], P = [0, 0, 0], Q = [0, 0, 0];
  for (let i = 0; i < p.count; i++){
    const c = [p.getX(i), p.getY(i), p.getZ(i)];
    for (let a = 0; a < 3; a++){
      const k = Math.round((c[a] + .5)*s);
      P[a] = k <= seg ? -half[a] + r*(k/seg) : inner[a] + r*((k - seg - 1)/seg);
      Q[a] = Math.max(-inner[a], Math.min(inner[a], P[a]));
    }
    let vx = P[0] - Q[0], vy = P[1] - Q[1], vz = P[2] - Q[2];
    const L = Math.hypot(vx, vy, vz);
    if (L > 1e-6){ vx /= L; vy /= L; vz /= L; p.setXYZ(i, Q[0] + vx*r, Q[1] + vy*r, Q[2] + vz*r); n.setXYZ(i, vx, vy, vz); }
    else p.setXYZ(i, P[0], P[1], P[2]);
  }
  return g;
}
// a rounded box poured into the batches. x/z are the centre, y0 the bottom.
export function rbox(x, y0, z, w, h, d, r, color, o = {}){
  const g = roundedBoxGeo(w, h, d, r, o.seg || 1);
  if (o.rx) g.rotateX(o.rx); if (o.rz) g.rotateZ(o.rz); if (o.ry) g.rotateY(o.ry);
  g.translate(x, y0 + h/2, z);
  addGeo(g, color, Object.assign({ao:false}, o));
  if (o.solid) solid(x - w/2, x + w/2, z - d/2, z + d/2, y0, y0 + h);
}
// a light source: the nearest few to you are real lights, the rest just glow
export function lightSrc(o){ const l = Object.assign({color:0xfff0d8, intensity:6, distance:12, decay:1.6, indoor:false}, o); W.lights.push(l); return l; }
// a soft pool of light on the ground (street lamps at night)
let POOL_MAT = null;
export function pool(x, z, r = 3.2, y = .03){
  if (!POOL_MAT){
    const [c, g] = canvas(128, 128), gr = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,226,170,.85)"); gr.addColorStop(.45, "rgba(255,214,150,.35)"); gr.addColorStop(1, "rgba(255,210,140,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    POOL_MAT = new THREE.MeshBasicMaterial({map:t, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, opacity:0, toneMapped:false});
    POOL_MAT.userData.keep = true;
  }
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), POOL_MAT);
  m.rotation.x = -Math.PI/2; m.position.set(x, y, z); m.renderOrder = 2;
  W.scene.add(m); W.pools.push(m);
  return m;
}
export const poolMat = () => POOL_MAT;
export function solid(x0, x1, z0, z1, y0 = 0, y1 = 3){
  const s = {x0:Math.min(x0, x1), x1:Math.max(x0, x1), z0:Math.min(z0, z1), z1:Math.max(z0, z1), y0, y1, off:false};
  W.solids.push(s); return s;
}
export function floor(x0, x1, z0, z1, h){ W.floors.push({x0:Math.min(x0, x1), x1:Math.max(x0, x1), z0:Math.min(z0, z1), z1:Math.max(z0, z1), h}); }
/* a flight of stairs you walk up as a smooth slope; the steps you see are drawn separately */
export function ramp(x0, x1, z0, z1, axis, a0, a1, h0, h1){ W.ramps.push({x0:Math.min(x0, x1), x1:Math.max(x0, x1), z0:Math.min(z0, z1), z1:Math.max(z0, z1), axis, a0, a1, h0, h1}); }
export function spot(o){
  // defaults are filled in place so that getters (a hint that changes, a door's angle) stay live
  if (o.r == null) o.r = 2.4; if (o.hold == null) o.hold = .35; if (o.y == null) o.y = 1.2;
  W.spots.push(o); return o;
}

/* a wall with holes in it (doors, windows): along x or z, from a to b, between heights y0 and y1 */
export function wall(axis, fixed, a, b, y0, y1, t, color, holes = [], o = {}){
  holes = holes.slice().sort((p, q) => p[0] - q[0]);
  const seg = (s0, s1, h0, h1) => {
    if (s1 - s0 < .005 || h1 - h0 < .005) return;
    if (axis === "x") box(s0, h0, fixed - t/2, s1, h1, fixed + t/2, color, Object.assign({solid:true}, o));
    else box(fixed - t/2, h0, s0, fixed + t/2, h1, s1, color, Object.assign({solid:true}, o));
  };
  let cur = a;
  for (const [h0a, h1a, hy0, hy1] of holes){
    seg(cur, h0a, y0, y1);
    seg(h0a, h1a, y0, hy0);          // under the hole
    seg(h0a, h1a, hy1, y1);          // over it
    cur = h1a;
  }
  seg(cur, b, y0, y1);
}

/* ---------- writing on things ---------- */
export function textTex(w, h, draw){
  const [c, g] = canvas(w, h); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
export function label(texture, x, y, z, w, h, ry = 0, o = {}){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    mat({map:texture, transparent:!!o.transparent, alphaTest:o.alphaTest || 0, emissive:o.glow ? 0xffffff : 0x000000, emissiveMap:o.glow ? texture : null, emissiveIntensity:o.glow || 0, roughness:o.rough == null ? .7 : o.rough}));
  if (o.glow) m.userData.glow = o.glow;
  m.position.set(x, y, z); m.rotation.y = ry; W.scene.add(m); return m;
}

/* ---------- moving things ---------- */
const MATC = new Map();
export function lmat(color, o = {}){
  const k = color + JSON.stringify(o);
  if (!MATC.has(k) || MATC.get(k).userData.low !== lowGfx()){ const m = mat(Object.assign({color}, o)); m.userData.low = lowGfx(); m.userData.keep = true; MATC.set(k, m); }
  return MATC.get(k);
}
export function part(geo, color, o = {}){
  const m = new THREE.Mesh(geo, o.material || lmat(color, o.mat || {}));
  m.castShadow = !!o.cast; m.receiveShadow = true;
  return m;
}
export function boxPart(w, h, d, color, x = 0, y = 0, z = 0, o = {}){
  const m = part(new THREE.BoxGeometry(w, h, d), color, o); m.position.set(x, y, z); return m;
}

/* ---------- start and finish a place ---------- */
export function begin(scene){
  W.scene = scene;
  W.solids.length = 0; W.floors.length = 0; W.ramps.length = 0; W.spots.length = 0; W.anims.length = 0;
  W.lights.length = 0; W.pools.length = 0; W.mats = {}; W.lit = null; W.ticks = [];
  batches.clear();
}
const FLOORS = new Set(["t:grass", "t:pitch", "t:asphalt", "t:slabs", "t:planks", "t:tiles", "t:terrazzo", "t:concrete", "t:path", "t:rubberFloor", "t:turf", "t:carpet", "t:shopfloor", "t:rubber"]);
export function finishBatches(){
  for (const [key, b] of batches){
    if (!b.pos.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(b.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(b.col, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
    g.computeBoundingSphere();
    let m;
    // one material per kind of surface: matte for most things, glossy for glass, paint and metal, glowing for lamps
    if (key === "glass") m = mat({vertexColors:true, transparent:true, opacity:.3, depthWrite:false, roughness:.06, metalness:.1, envMapIntensity:1.6});
    else if (key === "lit"){ m = mat({vertexColors:true, emissive:0xffcf8a, emissiveIntensity:0, roughness:.2}); W.lit = m; }
    else if (key === "lamp") m = mat({vertexColors:true, emissive:0xfff2d0, emissiveIntensity:1.1, roughness:.4});
    else if (key === "street") m = mat({vertexColors:true, emissive:0xffe2a8, emissiveIntensity:.2, roughness:.4});
    else if (key === "neon") m = mat({vertexColors:true, emissive:0xffffff, emissiveIntensity:.5, roughness:.3});
    else if (key === "screen") m = mat({vertexColors:true, emissive:0xffffff, emissiveIntensity:.85, roughness:.25});
    else if (key === "metal") m = mat({vertexColors:true, roughness:.34, metalness:.75});
    else if (key === "paint") m = mat({vertexColors:true, roughness:.3, metalness:.25, envMapIntensity:1.3});
    else if (key === "gloss") m = mat({vertexColors:true, roughness:.42});
    else if (key.startsWith("t:")) m = mat({vertexColors:true, map:tex(key.slice(2)), roughness:key === "t:shopfloor" ? .5 : .92});
    else m = mat({vertexColors:true});
    W.mats[key] = m;
    const mesh = new THREE.Mesh(g, m);
    // floors and ground never throw a shadow onto anything, so they are left out of the shadow pass
    mesh.castShadow = key !== "glass" && key !== "lit" && !FLOORS.has(key); mesh.receiveShadow = key !== "glass";
    W.scene.add(mesh);
  }
  batches.clear();
}
