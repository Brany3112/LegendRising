/* ============ Football: the crowd ============
   Owner: WP-D (pitch mesh, stadium, crowd, audio). Contract: DESIGN 1.4.17 (crowd.js: buildCrowd), spec 3.3.5,
   presets 1.4.4 (GFX.P.crowd), budgets 1.5.11 (Low: the crowd in at most 8 draws), 3.9.

   The people in the stands are pictures, not bodies. Once a session a few seeded fans (lookFor, the same people
   factory everyone in the world comes from) are posed and drawn into an atlas: 8 people x 3 poses (seated, cheering,
   standing on a terrace), front view, orthographic, Lambert, each in a 128 x 256 cell, with an alpha mask and a shirt
   mask (the shirt is drawn in a key colour and picked out), so every fan can wear his own colour. The atlas is drawn
   one person per frame by prebakeCrowd() while a fade is up, or all at once when a crowd is built before that.

   buildCrowd(scene, {stands, attendance, homeShare, kits, preset, bench, seed}) fills the seats a stadium hands it:
     stands      [{id, rows:[{y, runs:[{pts:[[x, z], ...]}]}], away, standing, roofed}]: each row is the line the seats
                 stand on (their feet at y), cut into runs between the aisles, ordered as seen from the pitch
     attendance  0..1 of the seats; homeShare: the share of the fans in home colours (the rest are in the away stand)
     kits        {home:[shirt, ...], away:[shirt, ...]} (css colours, as kitOf/awayKit give them)
     preset      GFX.P (its crowd: {kind:"blocks"} on Low; {kind:"billboards", count} on Medium and High)
     bench       [{x, y, z, side:"home"|"away"}]: the dugout seats, for the substitutes' impostors
   The fans: who sits where is seeded (the same seats fill for the same seed and attendance), thicker in the middle
   blocks and the lower rows when the ground is not full. On Low every row is a textured strip per seating block (one
   draw per stand); on Medium and High the rows nearest the pitch are instanced billboards (the preset's count of quads,
   two people a quad on Medium), the rest strips. Billboards turn about the vertical to face you and are animated on
   the GPU only: a bob of 0.02 + 0.10 excite metres, the cheering frame when hash(seed, floor(2t)) < excite, and after
   a goal the end it was scored at stands up 0.35 exp(-t/6) metres.
   Returns {setExcite(stand, v), goal(end), update(dt, light), setBench(side, n), density(f), stats(), dispose()}.
   setExcite(stand) takes a stand's index or id, or "all". update(dt, light) is called every frame by its zone: light
   is the colour of the light on the stands (THREE.Color or [r, g, b]), worked out from the sky. */
import {THREE} from "../build.js";
import {human, lookFor, animateHuman} from "../human.js";
import {mulberry32, hashStr} from "./rng.js";

/* ---------- the atlas ---------- */
const CW = 128, CH = 256, NV = 8, NP = 3, AW = CW*NV, AH = CH*NP;
export const CELL = {w:1.1, h:2.2};          // the world size of a cell: a person's feet at its bottom middle
const POSE = {sit:0, cheer:1, stand:2};
const KEY = 0xff00ff;                       // the shirt's key colour, picked out into the shirt mask
// the people: five in their own clothes, one in a club tee, two in training tops (the substitutes are drawn from these)
function variantLook(i){
  if (i >= 6) return lookFor("footballer", 9300 + i, {kit:["#ff00ff", "#23272e"], training:true});
  if (i === 5) return lookFor("fan", 9100 + i, {outfit:{type:"casual", shirt:KEY, collar:"crew", sleeves:"short"}});
  return lookFor("fan", 9100 + i, {outfit:{shirt:KEY}});
}
const BAKE_VERT = `
#include <common>
#include <skinning_pars_vertex>
varying vec3 vCol;
varying vec3 vN;
void main(){
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vN = normalize(transformedNormal);
  vCol = color;
}`;
const BAKE_FRAG = `
varying vec3 vCol;
varying vec3 vN;
void main(){
  vec3 n = normalize(vN);
  float key = max(dot(n, normalize(vec3(.35, .6, .75))), 0.0), sky = .55 + .45*n.y;
  gl_FragColor = vec4(vCol*(.32 + .38*sky + .62*key), 1.0);
  #include <colorspace_fragment>
}`;
const A = {rt:null, scene:null, cam:null, mat:null, next:0, done:false, data:null, mask:null, tex:null, maskTex:null, cells:new Map(), busy:null};
function bakeBegin(renderer){
  if (A.rt) return;
  A.rt = new THREE.WebGLRenderTarget(AW, AH, {depthBuffer:true});
  A.rt.texture.colorSpace = THREE.SRGBColorSpace;
  A.scene = new THREE.Scene();
  // the atlas is lit the same on every preset, whatever the people's own material is: Lambert from a sky above and a
  // key light over the camera's shoulder, worked out in a shader small enough to compile in a moment (a full lit
  // program for a skinned body is a long compile on a weak machine, and this one is used once)
  A.mat = new THREE.ShaderMaterial({vertexColors:true, vertexShader:BAKE_VERT, fragmentShader:BAKE_FRAG});
  A.scene.overrideMaterial = A.mat;
  A.cam = new THREE.OrthographicCamera(-CELL.w/2, CELL.w/2, CELL.h, 0, .1, 20);
  A.cam.position.set(0, 0, 6); A.cam.lookAt(0, 0, 0);
  A.cam.position.set(0, 0, 6); A.cam.updateMatrixWorld();
  A.next = 0;
  const prevRT = renderer.getRenderTarget(), cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
  renderer.setRenderTarget(A.rt); renderer.setClearColor(0x000000, 0); renderer.clear(true, true, true);
  renderer.setRenderTarget(prevRT); renderer.setClearColor(cc, ca);
}
// one person, in the three poses, into its column of the atlas
function bakeOne(renderer, v){
  const h = human(variantLook(v), {track:false, lod:false, cast:false});
  A.scene.add(h.g);
  const prevRT = renderer.getRenderTarget(), auto = renderer.autoClear, cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
  renderer.autoClear = false;
  renderer.setRenderTarget(A.rt);
  for (const [pose, row] of Object.entries(POSE)){
    // a seated fan on a seat 45 cm up, a cheering one at the top of a jump of the arms, a standing one at ease
    if (pose === "sit") animateHuman(h, 2, {mode:"sit", seat:.45});
    else if (pose === "cheer"){ animateHuman(h, 2, "celebrate"); h.at = .3; animateHuman(h, 0, "celebrate"); }
    else animateHuman(h, 2, {mode:"idle", arms:v % 2 ? "behind" : undefined});
    h.g.updateMatrixWorld(true);
    A.rt.viewport.set(v*CW, row*CH, CW, CH); A.rt.scissor.set(v*CW, row*CH, CW, CH); A.rt.scissorTest = true;
    renderer.setRenderTarget(A.rt);
    renderer.setClearColor(0x000000, 0); renderer.clear(true, true, true);
    renderer.render(A.scene, A.cam);
  }
  A.rt.viewport.set(0, 0, AW, AH); A.rt.scissor.set(0, 0, AW, AH); A.rt.scissorTest = false;
  renderer.setRenderTarget(prevRT); renderer.autoClear = auto; renderer.setClearColor(cc, ca);
  A.scene.remove(h.g); h.dispose();
}
// read the atlas back: the shirt pixels become their grey shade, and the shirt mask is made from them
function bakeEnd(renderer){
  const buf = new Uint8Array(AW*AH*4), mask = new Uint8Array(AW*AH);
  renderer.readRenderTargetPixels(A.rt, 0, 0, AW, AH, buf);
  for (let i = 0; i < AW*AH; i++){
    const o = i*4, a = buf[o + 3];
    if (a < 128){ buf[o] = buf[o + 1] = buf[o + 2] = buf[o + 3] = 0; continue; }
    buf[o + 3] = 255;
    const r = buf[o], g = buf[o + 1], b = buf[o + 2], mx = Math.max(r, b);
    if (mx > 18 && g < .32*mx && Math.abs(r - b) < .25*mx){ buf[o] = buf[o + 1] = buf[o + 2] = mx; mask[i] = 255; }
  }
  A.data = buf; A.mask = mask;
  const t = new THREE.DataTexture(buf, AW, AH, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true; t.userData.keep = true;
  const m = new THREE.DataTexture(mask, AW, AH, THREE.RedFormat, THREE.UnsignedByteType);
  m.generateMipmaps = true; m.minFilter = THREE.LinearMipmapLinearFilter; m.magFilter = THREE.LinearFilter; m.needsUpdate = true; m.userData.keep = true;
  A.tex = t; A.maskTex = m;
  A.rt.dispose(); A.rt = null; A.mat.dispose(); A.scene = null; A.done = true;
}
// the whole atlas now (what is left of it)
export function crowdAtlas(renderer){
  if (A.done) return A;
  bakeBegin(renderer);
  while (A.next < NV) bakeOne(renderer, A.next++);
  bakeEnd(renderer);
  return A;
}
// the atlas a person per frame, from a quiet moment (the travel card, a fade): resolves when it is done
export function prebakeCrowd(renderer){
  if (A.done) return Promise.resolve(A);
  if (A.busy) return A.busy;
  A.busy = new Promise(res => {
    const step = () => {
      if (A.done){ res(A); return; }
      bakeBegin(renderer);
      if (A.next < NV) bakeOne(renderer, A.next++);
      if (A.next >= NV && !A.done) bakeEnd(renderer);
      if (A.done) res(A); else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  return A.busy;
}
export const atlasReady = () => A.done;

// a person of the atlas as a canvas (top row first), in a shirt colour: for painting the strips
function cellCanvas(v, pose, tint){
  const key = `${v}:${pose}:${tint}`;
  if (A.cells.has(key)) return A.cells.get(key);
  const c = document.createElement("canvas"); c.width = CW; c.height = CH;
  const g = c.getContext("2d"), img = g.createImageData(CW, CH), col = new THREE.Color(tint);
  // a shirt pixel is its shade times the tint, as the billboards' shader does it in linear light (k^2.2 * t, back to
  // sRGB: k * t^(1/2.2)), a little brighter (1.15) as there
  const kr = 1.15*Math.pow(col.r, 1/2.2), kg = 1.15*Math.pow(col.g, 1/2.2), kb = 1.15*Math.pow(col.b, 1/2.2), row0 = POSE[pose]*CH;
  for (let y = 0; y < CH; y++){
    const src = ((row0 + CH - 1 - y)*AW + v*CW)*4, dst = y*CW*4, msk = (row0 + CH - 1 - y)*AW + v*CW;
    for (let x = 0; x < CW; x++){
      const s = src + x*4, d = dst + x*4;
      if (A.mask[msk + x]){ const k = A.data[s]; img.data[d] = Math.min(255, k*kr); img.data[d + 1] = Math.min(255, k*kg); img.data[d + 2] = Math.min(255, k*kb); }
      else { img.data[d] = A.data[s]; img.data[d + 1] = A.data[s + 1]; img.data[d + 2] = A.data[s + 2]; }
      img.data[d + 3] = A.data[s + 3];
    }
  }
  g.putImageData(img, 0, 0);
  A.cells.set(key, c);
  return c;
}

/* ---------- colours ---------- */
// what fans not in a club shirt wear: dark jackets, greys, denim, the odd bright top
const CASUAL = ["#23262b", "#3a3f46", "#5d636a", "#8a8f96", "#d9d6cf", "#2c3e5c", "#4a5236", "#6e2a2f", "#c9a23e", "#7fa7c9", "#1f2125", "#8e2b2b"];
const css = c => typeof c === "number" ? "#" + c.toString(16).padStart(6, "0") : String(c);
function linRGB(c){ const k = new THREE.Color(); try { k.set(css(c)); } catch(e){ k.set(0x888888); } return [k.r, k.g, k.b]; }

/* ---------- shaders ---------- */
const COMMON = `
uniform float uTime, uExcite, uGoalT, uGoalEnd;
float hsh(float a, float b){ return fract(sin(a*12.9898 + b*78.233)*43758.5453); }`;
const BB_VERT = `${COMMON}
uniform float uPair;
attribute vec4 aSeat;      // x, y (the feet), z, seed
attribute vec4 aInfo;      // variant A, variant B (-1: none), standing (0/1), the side of the halfway line (-1/1)
attribute vec3 aTintA;
attribute vec3 aTintB;
varying vec2 vLoc;
varying vec4 vInfo;
varying vec3 vTintA;
varying vec3 vTintB;
varying float vSeed;
#include <fog_pars_vertex>
void main(){
  vec3 base = aSeat.xyz;
  vec3 tc = cameraPosition - base; tc.y = 0.0;
  float l = length(tc);
  vec3 f = l > 1e-4 ? tc/l : vec3(0.0, 0.0, 1.0);
  vec3 right = vec3(f.z, 0.0, -f.x);
  float w = uPair > 0.5 ? 1.7 : ${CELL.w.toFixed(2)};
  vLoc = vec2(position.x*w, position.y*2.75 - 0.05);
  vec3 p = base + right*vLoc.x + vec3(0.0, vLoc.y, 0.0);
  vec4 mvPosition = viewMatrix*vec4(p, 1.0);
  gl_Position = projectionMatrix*mvPosition;
  vInfo = aInfo; vTintA = aTintA; vTintB = aTintB; vSeed = aSeat.w;
  #include <fog_vertex>
}`;
const BB_FRAG = `${COMMON}
uniform sampler2D uAtlas;
uniform sampler2D uMask;
uniform vec3 uLight;
uniform float uPair;
varying vec2 vLoc;
varying vec4 vInfo;
varying vec3 vTintA;
varying vec3 vTintB;
varying float vSeed;
#include <fog_pars_fragment>
const vec2 CELLM = vec2(${CELL.w.toFixed(2)}, ${CELL.h.toFixed(2)});
const vec2 GRID = vec2(${NV}.0, ${NP}.0);
// one person of a quad: x, y in metres from his feet; returns the colour (alpha 0 where there is nobody)
vec4 person(vec2 q, float seed, float variant, vec3 tint, vec2 gx, vec2 gy){
  float ex = uExcite;
  float bob = (0.02 + 0.10*ex)*(0.5 + 0.5*sin(uTime*(5.0 + 3.0*fract(seed*7.31)) + seed*40.0));
  float since = uTime - uGoalT;
  float stood = (since >= 0.0 && vInfo.w*uGoalEnd > 0.0) ? 0.35*exp(-since/6.0) : 0.0;
  float cheer = hsh(seed, floor(2.0*uTime + seed)) < ex ? 1.0 : 0.0;
  float pose = cheer > 0.5 ? 1.0 : (vInfo.z > 0.5 || stood > 0.12 ? 2.0 : 0.0);
  q.y -= bob + stood;
  vec2 c = vec2(q.x/CELLM.x + 0.5, q.y/CELLM.y);
  if (c.x <= 0.0 || c.x >= 1.0 || c.y <= 0.0 || c.y >= 1.0) return vec4(0.0);
  vec2 uv = vec2((variant + c.x)/GRID.x, (pose + c.y)/GRID.y);
  vec2 sx = gx/(CELLM*GRID), sy = gy/(CELLM*GRID);
  vec4 col = textureGrad(uAtlas, uv, sx, sy);
  // far away the mip levels thin a figure out: the alpha is lifted with the level so a crowd stays a crowd
  float lod = log2(max(max(length(sx*vec2(${AW}.0, ${AH}.0)), length(sy*vec2(${AW}.0, ${AH}.0))), 1.0));
  col.a = min(1.0, col.a*(1.0 + 0.45*lod));
  float m = textureGrad(uMask, uv, sx, sy).r;
  col.rgb = mix(col.rgb, col.rgb*tint*1.15, m)*(0.9 + 0.2*fract(seed*13.7));
  return col;
}
void main(){
  vec2 gx = dFdx(vLoc), gy = dFdy(vLoc);
  vec4 c;
  if (uPair > 0.5){
    vec4 a = person(vLoc + vec2(0.25, 0.0), vSeed, vInfo.x, vTintA, gx, gy);
    vec4 b = vInfo.y >= 0.0 ? person(vLoc - vec2(0.25, 0.0), fract(vSeed*7.13 + 0.31), vInfo.y, vTintB, gx, gy) : vec4(0.0);
    c = b.a >= 0.5 ? b : a;
  } else c = person(vLoc, vSeed, vInfo.x, vTintA, gx, gy);
  if (c.a < 0.5) discard;
  gl_FragColor = vec4(c.rgb*uLight, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
const ST_VERT = `
varying vec2 vUv;
#include <fog_pars_vertex>
void main(){
  vUv = uv;
  vec4 mvPosition = modelViewMatrix*vec4(position, 1.0);
  gl_Position = projectionMatrix*mvPosition;
  #include <fog_vertex>
}`;
const ST_FRAG = `
uniform sampler2D uStrip;
uniform vec3 uLight;
varying vec2 vUv;
#include <fog_pars_fragment>
void main(){
  vec4 c = texture2D(uStrip, vUv);
  if (c.a < 0.5) discard;
  gl_FragColor = vec4(c.rgb*uLight, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/* ---------- the strips: rows of fans painted on one texture ----------
   8 bands of 24 places (12 m of a row), 128 px each: four fill levels in home colours, four in away colours. A block
   of seats takes the band of its own fill. Seated rows (the band 1.5 m up from the feet) and standing ones (a terrace or
   a bank, 2.0 m) each have a texture of their own */
const STRIP = {seats:24, rows:8, w:1024, h:1024, levels:[.3, .55, .8, 1], high:{sit:1.5, stand:2.0}};
function stripTexture(kits, rnd, pose = "sit"){
  const c = document.createElement("canvas"); c.width = STRIP.w; c.height = STRIP.h;
  const g = c.getContext("2d"), slot = STRIP.w/STRIP.seats, bandH = STRIP.h/STRIP.rows, ppm = slot/.5, ppmV = bandH/STRIP.high[pose];
  const pw = CELL.w*ppm, ph = CELL.h*ppmV;
  for (let r = 0; r < STRIP.rows; r++){
    const away = r >= 4, fill = STRIP.levels[r % 4], kit = away ? kits.away : kits.home, top = r*bandH, bottom = top + bandH;
    g.save(); g.beginPath(); g.rect(0, top, STRIP.w, bandH); g.clip();
    for (let s = 0; s < STRIP.seats; s++){
      if (rnd() >= fill) continue;
      const v = Math.floor(rnd()*NV) % NV, tint = rnd() < .62 ? css(kit[0]) : CASUAL[Math.floor(rnd()*CASUAL.length)];
      const img = cellCanvas(v, pose, tint), x = (s + .5)*slot - pw/2 + (rnd() - .5)*4, y = bottom - ph - (rnd()*3);
      for (const ox of [-STRIP.w, 0, STRIP.w]) if (x + ox < STRIP.w && x + ox + pw > 0) g.drawImage(img, x + ox, y, pw, ph);
    }
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 2;
  return t;
}

/* ---------- the seats and who sits in them ---------- */
// every seat of a stand: positions along each run at half a metre, with the run's block and the row's index
function seatsOf(stand){
  const out = [];
  stand.rows.forEach((row, k) => {
    row.runs.forEach((run, b) => {
      const pts = run.pts; let acc = 0;
      const segs = [];
      for (let i = 0; i < pts.length - 1; i++){ const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); segs.push([acc, L]); acc += L; }
      const n = Math.floor(acc/.5 + 1e-6);
      if (!n) return;
      const pad = (acc - n*.5)/2;
      for (let j = 0; j < n; j++){
        const s = pad + .25 + j*.5;
        let i = 0; while (i < segs.length - 1 && s > segs[i][0] + segs[i][1]) i++;
        const t = segs[i][1] > 0 ? (s - segs[i][0])/segs[i][1] : 0;
        const x = pts[i][0] + (pts[i + 1][0] - pts[i][0])*t, z = pts[i][1] + (pts[i + 1][1] - pts[i][1])*t;
        out.push({x, y:row.y, z, k, b, run, s, n, j});
      }
    });
  });
  return out;
}
// which seats are taken: n of them, thicker in the middle of each row and lower down, seeded
function fillSeats(seats, n, rnd){
  if (n <= 0 || !seats.length) return seats.map(() => false);
  if (n >= seats.length) return seats.map(() => true);
  const maxK = Math.max(1, ...seats.map(s => s.k));
  const w = seats.map(s => { const mid = 1 - Math.abs((s.j + .5)/s.n - .5)*2; return (.55 + .9*mid*mid)*(1.25 - .5*s.k/maxK); });
  const r = seats.map(() => rnd());
  // the scale k at which sum(min(1, k w)) = n
  let lo = 0, hi = 50;
  for (let it = 0; it < 40; it++){ const k = (lo + hi)/2; let sum = 0; for (const x of w) sum += Math.min(1, k*x); if (sum < n) lo = k; else hi = k; }
  return w.map((x, i) => r[i] < Math.min(1, hi*x));
}

/* ---------- the crowd ---------- */
export function buildCrowd(scene, o = {}){
  const renderer = o.renderer;
  if (!A.done && renderer) crowdAtlas(renderer);
  const P = o.preset || (typeof GFX !== "undefined" && GFX ? GFX.P : null) || {crowd:{kind:"blocks"}};
  const cp = P.crowd || {kind:"blocks"}, billboards = cp.kind === "billboards" && A.done, pair = billboards && (P.tier === "medium" || cp.pair === true);
  const kits = {home:(o.kits && o.kits.home) || ["#2c66b8", "#ffffff"], away:(o.kits && o.kits.away) || ["#c8463a", "#ffffff"]};
  const rnd = mulberry32(o.seed != null ? o.seed >>> 0 : hashStr("crowd|" + css(kits.home[0]) + "|" + css(kits.away[0])));
  const att = Math.max(0, Math.min(1, o.attendance == null ? .7 : o.attendance)), homeShare = o.homeShare == null ? .8 : o.homeShare;
  const stands = (o.stands || []).map((st, i) => Object.assign({index:i, id:st.id != null ? st.id : i}, st));
  // the seats, and how many of each side's fans there are
  for (const st of stands) st.seats = seatsOf(st);
  const all = stands.reduce((s, st) => s + st.seats.length, 0), fans = Math.round(att*all);
  const awaySeats = stands.filter(s => s.away).reduce((s, st) => s + st.seats.length, 0);
  const awayFans = Math.min(awaySeats, Math.round(fans*(1 - homeShare))), homeFans = Math.min(all - awaySeats, fans - awayFans);
  for (const st of stands){
    const pool = st.away ? awaySeats : all - awaySeats, want = st.away ? awayFans : homeFans;
    st.taken = fillSeats(st.seats, pool ? Math.round(want*st.seats.length/pool) : 0, rnd);
  }
  // who is drawn as a billboard: whole rows, the rows nearest the pitch first, until the preset's count of quads
  const cap = billboards ? Math.max(0, cp.count | 0)*(pair ? 2 : 1) : 0;
  const rowsAll = [];
  for (const st of stands){
    const per = new Array(st.rows.length).fill(0);
    st.seats.forEach((x, i) => { if (st.taken[i]) per[x.k]++; });
    st.rows.forEach((r, k) => rowsAll.push({st, k, n:per[k]}));
  }
  rowsAll.sort((a, b) => a.k - b.k || a.st.index - b.st.index);
  let used = 0;
  for (const r of rowsAll){ r.bb = billboards && used + r.n <= cap; if (r.bb) used += r.n; }
  const bbRow = new Set(rowsAll.filter(r => r.bb).map(r => r.st.index + ":" + r.k));

  // shared uniforms: the clock, the last goal, the atlas
  const U = {uTime:{value:0}, uGoalT:{value:-1e4}, uGoalEnd:{value:0}, uAtlas:{value:A.tex}, uMask:{value:A.maskTex}};
  const stripTex = A.done ? stripTexture(kits, mulberry32(rnd()*4294967296 >>> 0)) : null;
  const standTex = A.done && stands.some(s => s.standing) ? stripTexture(kits, mulberry32(rnd()*4294967296 >>> 0), "stand") : null;
  const meshes = [], mats = [];
  const bbMaterial = (pairQ) => {
    const m = new THREE.ShaderMaterial({uniforms:Object.assign({uExcite:{value:.15}, uLight:{value:new THREE.Color(1, 1, 1)}, uPair:{value:pairQ ? 1 : 0}}, U, THREE.UniformsUtils.clone(THREE.UniformsLib.fog)),
      vertexShader:BB_VERT, fragmentShader:BB_FRAG, fog:true});
    m.userData.crowd = true; mats.push(m); return m;
  };
  const stripMaterial = tex => {
    const m = new THREE.ShaderMaterial({uniforms:Object.assign({uStrip:{value:tex}, uLight:{value:new THREE.Color(1, 1, 1)}}, THREE.UniformsUtils.clone(THREE.UniformsLib.fog)),
      vertexShader:ST_VERT, fragmentShader:ST_FRAG, fog:true});
    m.userData.crowd = true; mats.push(m); return m;
  };
  // the billboards of a list of people: [{x, y, z, seed, va, vb, stand, side, ta:[r, g, b], tb}]
  const bbMesh = (list, pairQ, name) => {
    if (!list.length) return null;
    const g = new THREE.InstancedBufferGeometry();
    g.setIndex([0, 1, 2, 0, 2, 3]); g.setAttribute("position", new THREE.Float32BufferAttribute([-.5, 0, 0, .5, 0, 0, .5, 1, 0, -.5, 1, 0], 3));
    const seat = new Float32Array(list.length*4), info = new Float32Array(list.length*4), ta = new Float32Array(list.length*3), tb = new Float32Array(list.length*3);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    list.forEach((p, i) => {
      seat.set([p.x, p.y, p.z, p.seed], i*4); info.set([p.va, p.vb, p.standing ? 1 : 0, p.x < 0 ? -1 : 1], i*4);
      ta.set(p.ta, i*3); tb.set(p.tb || p.ta, i*3);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    });
    g.setAttribute("aSeat", new THREE.InstancedBufferAttribute(seat, 4));
    g.setAttribute("aInfo", new THREE.InstancedBufferAttribute(info, 4));
    g.setAttribute("aTintA", new THREE.InstancedBufferAttribute(ta, 3));
    g.setAttribute("aTintB", new THREE.InstancedBufferAttribute(tb, 3));
    g.instanceCount = list.length;
    const c = new THREE.Vector3((x0 + x1)/2, (y0 + y1)/2 + 1.2, (z0 + z1)/2);
    g.boundingSphere = new THREE.Sphere(c, Math.hypot(x1 - x0, y1 - y0 + 2.8, z1 - z0)/2 + 1.5);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(x0 - 1, y0 - .1, z0 - 1), new THREE.Vector3(x1 + 1, y1 + 2.8, z1 + 1));
    const m = new THREE.Mesh(g, bbMaterial(pairQ));
    m.name = name; m.castShadow = false; m.receiveShadow = false; m.matrixAutoUpdate = false;
    m.userData.count = list.length;
    scene.add(m); meshes.push(m);
    return m;
  };
  const tintOf = (kit, r) => linRGB(r < .62 ? kit[0] : CASUAL[Math.floor((r*997) % 1*CASUAL.length)]);
  const per = [];
  let bbCount = 0, stripRows = 0, drawn = 0;
  for (const st of stands){
    const kit = st.away ? kits.away : kits.home, people = [], quads = [];
    st.seats.forEach((s, i) => {
      if (!st.taken[i]) return;
      drawn++;
      if (bbRow.has(st.index + ":" + s.k)) people.push({x:s.x, y:s.y, z:s.z, seed:rnd()*97.3, va:Math.floor(rnd()*NV) % NV, ta:tintOf(kit, rnd()), standing:!!st.standing, run:s.run, j:s.j});
    });
    // billboards: one person a quad, or two side by side (Medium)
    let list = people;
    if (pair){
      list = [];
      for (let i = 0; i < people.length; i++){
        const a = people[i], b = people[i + 1];
        if (b && b.run === a.run && b.j === a.j + 1){ list.push({x:(a.x + b.x)/2, y:a.y, z:(a.z + b.z)/2, seed:a.seed, va:a.va, vb:b.va, ta:a.ta, tb:b.ta, standing:a.standing}); i++; }
        else list.push({x:a.x, y:a.y, z:a.z, seed:a.seed, va:a.va, vb:-1, ta:a.ta, tb:a.ta, standing:a.standing});
      }
    } else for (const p of list) p.vb = -1;
    const bb = billboards ? bbMesh(list, pair, `crowd-bb-${st.id}`) : null;
    bbCount += list.length;
    // strips: the rows not drawn as billboards, a quad per run segment, the band of the block's own fill
    const S = [], N = [], UV = [], I = [], runSeats = new Map();
    st.seats.forEach((s, i) => { const l = runSeats.get(s.run); if (l) l.push(i); else runSeats.set(s.run, [i]); });
    if (stripTex) st.rows.forEach((row, k) => {
      if (bbRow.has(st.index + ":" + k)) return;
      stripRows++;
      row.runs.forEach((run) => {
        const idx = runSeats.get(run) || [];
        if (!idx.length) return;
        const fill = idx.reduce((a, i) => a + (st.taken[i] ? 1 : 0), 0)/idx.length;
        if (fill < .12) return;
        const lv = STRIP.levels.reduce((bi, l, i) => Math.abs(l - fill) < Math.abs(STRIP.levels[bi] - fill) ? i : bi, 0);
        const band = (st.away ? 4 : 0) + lv, v1 = 1 - band/STRIP.rows, v0 = 1 - (band + 1)/STRIP.rows;
        const pts = run.pts, u0 = Math.floor(rnd()*STRIP.seats)/STRIP.seats;
        let acc = 0;
        for (let i = 0; i < pts.length - 1; i++){
          const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az); if (L < 1e-4) continue;
          // facing the pitch: the left of the run's direction
          const nx = (bz - az)/L, nz = -(bx - ax)/L, base = S.length/3, ua = u0 + acc/(STRIP.seats*.5), ub = u0 + (acc + L)/(STRIP.seats*.5);
          const top = row.y - .03 + STRIP.high[st.standing ? "stand" : "sit"];
          S.push(ax, row.y - .03, az, bx, row.y - .03, bz, bx, top, bz, ax, top, az);
          for (let q = 0; q < 4; q++) N.push(nx, 0, nz);
          UV.push(ua, v0 + .002, ub, v0 + .002, ub, v1 - .002, ua, v1 - .002);
          I.push(base, base + 2, base + 1, base, base + 3, base + 2);
          acc += L;
        }
      });
    });
    let strip = null;
    if (S.length){
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(S, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2));
      g.setIndex(S.length/3 > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
      g.computeBoundingSphere();
      strip = new THREE.Mesh(g, stripMaterial(st.standing ? standTex : stripTex));
      strip.name = `crowd-strip-${st.id}`; strip.matrixAutoUpdate = false; strip.castShadow = false; strip.receiveShadow = false;
      scene.add(strip); meshes.push(strip);
    }
    per.push({st, bb, strip, excite:.15, shade:st.roofed ? .82 : 1});
  }
  // the substitutes on the benches: seated impostors in their club's training tops
  let benchMesh = null; const benchSeats = {home:[], away:[]};
  if (A.done && o.bench && o.bench.length){
    const list = o.bench.map((b, i) => ({x:b.x, y:b.y, z:b.z, seed:rnd()*97.3, va:6 + (i % 2), vb:-1, ta:linRGB((b.side === "away" ? kits.away : kits.home)[0]), standing:false, side:b.side}));
    benchMesh = bbMesh(list, false, "crowd-bench");
    list.forEach((b, i) => benchSeats[b.side === "away" ? "away" : "home"].push(i));
    if (benchMesh) per.push({st:{index:-1, id:"bench"}, bb:benchMesh, strip:null, excite:.1, shade:.85});
  }
  const _l = new THREE.Color();
  const find = s => s === "all" ? per : per.filter(p => p.st.index === s || p.st.id === s);
  const api = {
    // how worked up a stand is (0 calm to 1 on its feet)
    setExcite(stand, v){ v = Math.max(0, Math.min(1, +v || 0)); for (const p of find(stand)){ p.excite = v; if (p.bb) p.bb.material.uniforms.uExcite.value = v; } },
    // a goal at an end (-1 or +1): that end stands up, and everyone is on their feet a while
    goal(end){ U.uGoalT.value = U.uTime.value; U.uGoalEnd.value = end < 0 ? -1 : 1; },
    // every frame: the clock, and the light on the stands
    update(dt, light){
      U.uTime.value += dt || 0;
      if (light){ if (Array.isArray(light)) _l.setRGB(light[0], light[1], light[2]); else _l.copy(light); }
      else _l.setRGB(1, 1, 1);
      for (const p of per){
        if (p.bb) p.bb.material.uniforms.uLight.value.copy(_l).multiplyScalar(p.shade);
        if (p.strip) p.strip.material.uniforms.uLight.value.copy(_l).multiplyScalar(p.shade);
      }
    },
    // n substitutes sitting on a bench ("home" or "away"); the others have gone to warm up or come on
    setBench(side, n){
      if (!benchMesh) return 0;
      const seats = benchSeats[side === "away" ? "away" : "home"], a = benchMesh.geometry.attributes.aSeat;
      seats.forEach((i, k) => { const b = o.bench[i]; a.array[i*4 + 1] = k < n ? b.y : -50; });
      a.needsUpdate = true;
      return Math.min(n, seats.length);
    },
    // fewer billboards drawn (adaptive quality: 1 all of them, down to a third); the rows furthest back go first
    density(f){
      f = Math.max(.33, Math.min(1, +f || 1));
      for (const p of per) if (p.bb && p.st.index >= 0) p.bb.geometry.instanceCount = Math.max(1, Math.round(p.bb.userData.count*f));
    },
    stats(){ return {seats:all, fans:drawn, billboards:bbCount, stripRows, pair, kind:billboards ? "billboards" : "blocks", draws:meshes.length, meshes:meshes.map(m => m.name)}; },
    meshes,
    dispose(){
      for (const m of meshes){ if (m.parent) m.parent.remove(m); m.geometry.dispose(); m.material.dispose(); }
      meshes.length = 0;
      if (stripTex) stripTex.dispose();
      if (standTex) standTex.dispose();
    }
  };
  // the billboards' order inside each mesh: front rows first, so density() drops the back rows
  return api;
}
