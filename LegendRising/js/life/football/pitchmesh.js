/* ============ Football: the pitch you see ============
   Owner: WP-D (pitch mesh, stadium, crowd, audio). Contract: DESIGN 1.4.17 (pitchmesh.js), spec 3.3.3; every number
   comes from pitchspec.js (DESIGN 1.1 and 1.4.9), never from here, so what you see is what the ball collides with.

   buildPitchMesh(spec, {tier, worn, stripes, cones, grass, extra, solids}) draws a pitch made by makePitch():
     grass     one mesh: mowing bands (stripes, 8.75 m each on a 105 m pitch) and wear in the goalmouths, the penalty
               spots, the centre circle and the assistants' runs, all in vertex colours over a fine grass texture
     lines     one mesh: the 0.12 m strips of the spec, every one inside the area it bounds (arcs at 64 segments a full
               circle), 4 mm up with polygonOffset so they never fight the grass; plus o.extra segments (the technical
               areas a stadium paints in front of its dugouts)
     frames    one mesh for both goals and the corner flags: round posts and bar (post centres 7.44 apart, bar centre
               2.50 high, so the mouth is 7.32 x 2.44 between the inner faces), the net's stanchions, the flags
     nets      one alpha-tested mesh for both goals (a 12 cm mesh, alphaTest 0.5, not transparent, depthWrite on,
               double sided), its back at 2.0 m and 1.90 m high as the colliders are; hand-drawn mipmaps keep the cords
               visible far away instead of fading out
     cones     spare balls on cones (D14): one instanced mesh of cones and one of balls; take(i) and put(i) hide and
               show the ball on a cone when a taker picks it up or a ball is put back
   Player solids (o.solids, default true): the posts, the side and back nets, the corner flags. The ball never uses
   these: its colliders are spec.colliders.

   ballMesh({shadow}) -> {mesh, shadow}: the one ball look (moved from ground.js ballMesh), with a soft blob on the
   ground under it instead of a sun shadow (the shadow map is not redrawn for a moving ball).

   Every lit material comes from mat() (build.js), so a change of graphics preset makes it again. */
import {THREE, W, mat, textTex, solid} from "../build.js";
import {FIFA} from "./pitchspec.js";
import {mulberry32} from "./rng.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };
// a smooth, seeded value per point for the grass's small variations (no Math.random: the same pitch every time)
const hash2 = (x, z) => { let h = Math.imul((x*73.13 | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((z*91.7 | 0) + 0x632be5ab, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); return ((h ^ (h >>> 15)) >>> 0)/4294967296; };

// how worn each tier's pitch is, from a local ground's bald goalmouths to a giant arena's carpet (DESIGN 3.3.2)
export const WEAR = [.95, .7, .42, .22, .1];
// the grass's own green per tier: a local ground's tired, yellowing grass to the deep green of a giant arena
const GREEN = [[.36, .5, .2], [.3, .5, .2], [.25, .5, .2], [.22, .5, .21], [.2, .5, .2]];

/* ---------- the textures ---------- */
const TX = {};
function anis(){ return typeof GFX !== "undefined" && GFX && GFX.P && GFX.P.anisotropy ? GFX.P.anisotropy : 4; }
// fine grass: blades and clumps in grey, so the vertex colours give the green and the bands; tiles without a seam
function grassTex(){
  if (TX.grass) return TX.grass;
  const r = mulberry32(5150);
  const t = textTex(256, 256, g => {
    g.fillStyle = "#dcdcdc"; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9000; i++){
      const x = r()*256, y = r()*256, v = r();
      g.fillStyle = v < .5 ? `rgba(70,70,70,${.12 + r()*.14})` : `rgba(255,255,255,${.1 + r()*.16})`;
      g.fillRect(x, y, 1, 2 + r()*3);
      if (x < 4) g.fillRect(x + 256, y, 1, 3); if (y > 250) g.fillRect(x, y - 256, 1, 3);
    }
    for (let i = 0; i < 40; i++){
      const x = r()*256, y = r()*256, rad = 6 + r()*14, a = .05 + r()*.06;
      for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]){
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        gr.addColorStop(0, `rgba(60,60,60,${a})`); gr.addColorStop(1, "rgba(60,60,60,0)");
        g.fillStyle = gr; g.fillRect(x + ox - rad, y + oy - rad, rad*2, rad*2);
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = anis(); t.userData.per = 2.4;
  return (TX.grass = t);
}
/* the net: one cord grid of 12 cm cells, drawn again for every mip level by hand. The automatic mipmaps would average
   the thin cords away (an alpha-tested net then vanishes a few metres off); here a cord stays at least one texel wide
   while the cells are at least 3 texels, and below that the level is a sparse dither, so a far net reads as the light
   haze a real one is */
function netTex(){
  if (TX.net) return TX.net;
  const S0 = 128, CELLS = 8, levels = [];
  const r = mulberry32(7);
  for (let s = S0; s >= 1; s >>= 1){
    const c = document.createElement("canvas"); c.width = c.height = s;
    const g = c.getContext("2d"), cell = s/CELLS;
    g.clearRect(0, 0, s, s);
    if (cell >= 3){
      const w = Math.max(1, Math.round(cell*.14));
      g.fillStyle = "#ffffff";
      for (let i = 0; i < CELLS; i++){ const p = Math.round(i*cell); g.fillRect(p, 0, w, s); g.fillRect(0, p, s, w); }
    } else {
      // cords narrower than a texel: about a third of the texels lit, scattered evenly
      const img = g.createImageData(s, s);
      for (let i = 0; i < s*s; i++){ const on = ((i*7 + (i/s | 0)*3) % 9) < 3 || r() < .04; img.data[i*4] = img.data[i*4 + 1] = img.data[i*4 + 2] = 255; img.data[i*4 + 3] = on ? 255 : 0; }
      g.putImageData(img, 0, 0);
    }
    levels.push(c);
  }
  const t = new THREE.Texture(levels[0]);
  t.mipmaps = levels; t.generateMipmaps = false;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anis();
  t.userData.per = .96; t.userData.keep = true; t.needsUpdate = true;
  return (TX.net = t);
}
// the match ball's panels (as ground.js has always drawn them)
function ballTex(){
  if (TX.ball) return TX.ball;
  const t = textTex(256, 128, g => {
    g.fillStyle = "#f4f4f0"; g.fillRect(0, 0, 256, 128);
    g.fillStyle = "#1e2228";
    for (let i = 0; i < 12; i++){ const x = (i % 6)*44 + (i > 5 ? 22 : 0), y = i > 5 ? 86 : 38; g.beginPath();
      for (let k = 0; k < 5; k++){ const a = k/5*Math.PI*2 - Math.PI/2; const px = x + Math.cos(a)*13, py = y + Math.sin(a)*13*(i > 5 ? .9 : 1); k ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); g.fill(); }
  });
  t.userData.per = 1;
  return (TX.ball = t);
}

/* ---------- geometry helpers ---------- */
// a list of triangles (positions, normals, colours, uvs) poured into one indexed geometry
function Builder(){
  const P = [], N = [], C = [], U = [], I = [];
  return {
    P, N, C, U, I,
    v(x, y, z, nx, ny, nz, r = 1, g = 1, b = 1, u = 0, w = 0){ P.push(x, y, z); N.push(nx, ny, nz); C.push(r, g, b); U.push(u, w); return P.length/3 - 1; },
    tri(a, b, c){ I.push(a, b, c); },
    quad(a, b, c, d){ I.push(a, b, c, a, c, d); },
    // a geometry of THREE's own, already placed, with one colour
    add(geo, col){
      const g = geo, p = g.attributes.position, n = g.attributes.normal, base = P.length/3;
      for (let i = 0; i < p.count; i++){ P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i)); C.push(col[0], col[1], col[2]); U.push(0, 0); }
      if (g.index) for (let i = 0; i < g.index.count; i++) I.push(base + g.index.getX(i));
      else for (let i = 0; i < p.count; i++) I.push(base + i);
      geo.dispose();
    },
    geometry(){
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
      g.setIndex(P.length/3 > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      return g;
    }
  };
}
const lin = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
// a round bar from a to b (radius r, seg sides) into a builder
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _Y = new THREE.Vector3(0, 1, 0);
function bar(B, ax, ay, az, bx, by, bz, r, col, seg = 10, caps = false){
  _a.set(ax, ay, az); _b.set(bx, by, bz); _d.subVectors(_b, _a); const L = _d.length(); if (L < 1e-5) return;
  const g = new THREE.CylinderGeometry(r, r, L, seg, 1, !caps);
  _q.setFromUnitVectors(_Y, _d.normalize()); g.applyQuaternion(_q);
  g.translate((ax + bx)/2, (ay + by)/2, (az + bz)/2);
  B.add(g, col);
}

/* ---------- the grass ---------- */
// how worn the grass is at a point (0 none to 1 bare), on a pitch of half length hx: the goalmouths and the six-yard
// lines where the keepers stand, the penalty spots, the centre circle, and the assistants' strips along the touchlines
function wearAt(x, z, hx, hz){
  let w = 0;
  for (const e of [-1, 1]){
    const gx = e*hx, dx = (x - (gx - e*3.2))/4.2, dz = z/6.5;
    w = Math.max(w, 1 - sstep(.35, 1.2, Math.hypot(dx, dz)));                         // the goalmouth
    w = Math.max(w, .55*(1 - sstep(.2, 1, Math.hypot((x - (gx - e*FIFA.spot))/1.6, z/1.6))));   // the penalty spot
    w = Math.max(w, .4*(1 - sstep(.3, 1, Math.hypot((x - (gx - e*5.6))/1.5, z/9))));             // the six-yard line
  }
  w = Math.max(w, .5*(1 - sstep(.3, 1, Math.hypot(x/4.5, z/4.5))));                        // the centre circle
  for (const s of [-1, 1]){
    // an assistant runs each half's touchline, a stride outside it
    const along = s < 0 ? x < 0 : x > 0, off = Math.abs(z - s*(hz + 1.2));
    if (along) w = Math.max(w, .35*(1 - sstep(.3, 1.1, off))*sstep(2, 10, Math.abs(x)));
  }
  return w;
}
function grassMesh(spec, o){
  const {hx, hz, L} = spec, ex = o.grass.hx, ez = o.grass.hz;
  const nb = o.stripes, bw = L/nb, worn = clamp(o.worn, 0, 1), tier = clamp(o.tier | 0, 0, 4);
  const base = GREEN[tier], soil = [.42, .33, .2], dry = [.5, .48, .28];
  // the band edges, carried on past the goal lines into the run-off at the same width
  const xs = [-ex];
  for (let k = -nb; k <= 2*nb; k++){ const e = -hx + k*bw; if (e > -ex + .01 && e < ex - .01) xs.push(e); }
  xs.push(ex);
  const nz = Math.max(8, Math.round(2*ez/1.9)), zs = Array.from({length:nz + 1}, (_, i) => -ez + 2*ez*i/nz);
  const B = Builder(), per = grassTex().userData.per;
  const band = x => Math.floor((x + hx)/bw + 1e-6);
  for (let b = 0; b < xs.length - 1; b++){
    const a0 = xs[b], a1 = xs[b + 1], mid = (a0 + a1)/2, k = band(mid), light = ((k % 2) + 2) % 2 === 0;
    // each band its own patch, so its edges stay sharp; inside, a column every 1.75 m or so carries the wear
    const n = Math.max(1, Math.round((a1 - a0)/1.75)), cols = Array.from({length:n + 1}, (_, i) => a0 + (a1 - a0)*i/n);
    const idx = [];
    for (const x of cols){
      const row = [];
      for (const z of zs){
        const inField = Math.abs(x) <= hx + .5 && Math.abs(z) <= hz + .5;
        const w = worn*wearAt(x, z, hx, hz), nv = hash2(x*1.3, z*1.7), patch = hash2(Math.floor(x/7), Math.floor(z/7));
        // the bands: lighter and darker by the way the mower went; off the field (beyond the lines) a touch duller
        let f = (light ? 1.12 : .88)*(inField ? 1 : .96)*(.94 + .12*nv);
        let c = [base[0], base[1], base[2]];
        // a lower tier's grass is patchy: dry, yellowing patches here and there
        const dryK = (1 - tier/4)*.35*sstep(.55, .95, patch)*worn;
        c = c.map((v, i) => v + (dry[i] - v)*dryK);
        c = c.map((v, i) => v + (soil[i] - v)*Math.min(.85, w*(.75 + .35*nv)));
        f *= 1 - .08*w;
        row.push(B.v(x, 0, z, 0, 1, 0, c[0]*f, c[1]*f, c[2]*f, x/per, z/per));
      }
      idx.push(row);
    }
    for (let i = 0; i < cols.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) B.quad(idx[i][j], idx[i][j + 1], idx[i + 1][j + 1], idx[i + 1][j]);
  }
  const m = new THREE.Mesh(B.geometry(), mat({map:grassTex(), vertexColors:true, roughness:.96, kind:"tex"}));
  m.name = "pitch-grass"; m.receiveShadow = true; m.castShadow = false;
  return m;
}

/* ---------- the markings ---------- */
const LINE_Y = .004, LINE_COL = lin(0xf7f8f3);
function linesMesh(spec, extra){
  const B = Builder(), hw = spec.line/2, c = LINE_COL;
  const strip = (x0, z0, x1, z1) => {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); if (L < 1e-6) return;
    const px = -dz/L*hw, pz = dx/L*hw;
    const a = B.v(x0 + px, LINE_Y, z0 + pz, 0, 1, 0, ...c), b = B.v(x1 + px, LINE_Y, z1 + pz, 0, 1, 0, ...c);
    const d = B.v(x1 - px, LINE_Y, z1 - pz, 0, 1, 0, ...c), e = B.v(x0 - px, LINE_Y, z0 - pz, 0, 1, 0, ...c);
    B.quad(a, b, d, e);
  };
  const arc = (cx, cz, r, a0, a1) => {
    const n = Math.max(6, Math.ceil(64*Math.abs(a1 - a0)/(2*Math.PI)));
    let prev = null;
    for (let i = 0; i <= n; i++){
      const a = a0 + (a1 - a0)*i/n, ca = Math.cos(a), sa = Math.sin(a);
      const o = B.v(cx + ca*(r + hw), LINE_Y, cz + sa*(r + hw), 0, 1, 0, ...c), q = B.v(cx + ca*(r - hw), LINE_Y, cz + sa*(r - hw), 0, 1, 0, ...c);
      if (prev){ B.tri(prev[0], prev[1], q); B.tri(prev[0], q, o); }
      prev = [o, q];
    }
  };
  const disc = (cx, cz, r) => {
    const n = 20, ctr = B.v(cx, LINE_Y, cz, 0, 1, 0, ...c);
    let prev = null, first = null;
    for (let i = 0; i <= n; i++){ const a = -i/n*2*Math.PI, v = i === n ? first : B.v(cx + Math.cos(a)*r, LINE_Y, cz + Math.sin(a)*r, 0, 1, 0, ...c); if (!first) first = v; if (prev != null) B.tri(ctr, prev, v); prev = v; }
  };
  for (const l of spec.lines.concat(extra || [])){
    if (l.type === "arc") arc(l.cx, l.cz, l.r, l.a0, l.a1);
    else if (l.dash){
      // a dashed line (a technical area): dashes of l.dash metres with gaps of the same
      const L = Math.hypot(l.x1 - l.x0, l.z1 - l.z0), n = Math.max(1, Math.floor(L/(2*l.dash)));
      for (let i = 0; i <= n; i++){ const t0 = i*2*l.dash/L, t1 = Math.min(1, t0 + l.dash/L); if (t0 >= 1) break; strip(l.x0 + (l.x1 - l.x0)*t0, l.z0 + (l.z1 - l.z0)*t0, l.x0 + (l.x1 - l.x0)*t1, l.z0 + (l.z1 - l.z0)*t1); }
    } else strip(l.x0, l.z0, l.x1, l.z1);
  }
  disc(spec.spots.centre.x, spec.spots.centre.z, spec.spots.centre.r);
  for (const p of spec.spots.penalty) disc(p.x, p.z, p.r);
  const m = new THREE.Mesh(B.geometry(), mat({color:0xffffff, vertexColors:true, roughness:.85, polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1, kind:"plain"}));
  m.name = "pitch-lines"; m.receiveShadow = true; m.castShadow = false;
  return m;
}

/* ---------- the goals and the corner flags ---------- */
const POST_COL = lin(0xf6f6f2), STAY_COL = lin(0xd9dcde), FLAG_POLE = lin(0xf2f0e8), FLAG_A = lin(0xf2c230), FLAG_B = lin(0xd8432f);
function framesMesh(spec){
  const B = Builder();
  for (const g of spec.goals){
    const e = g.end, px = g.postX, pz = Math.abs(g.post[0].z), r = FIFA.postR, top = g.barY + r;
    const bx = e*(Math.abs(px) + FIFA.netDepth), H = FIFA.netBackH;
    // the posts and the crossbar: round, white, the bar sitting on the posts' tops
    for (const s of [-1, 1]) bar(B, px, 0, s*pz, px, top, s*pz, r, POST_COL, 16, true);
    bar(B, px, g.barY, -pz - r*.5, px, g.barY, pz + r*.5, r, POST_COL, 16, true);
    // the net's frame behind: two back stanchions, the back top bar, the two roof edges and the ground frame
    for (const s of [-1, 1]){
      bar(B, bx, 0, s*pz, bx, H, s*pz, .035, STAY_COL, 8, true);
      bar(B, px, g.barY, s*pz, bx, H, s*pz, .022, STAY_COL, 6);
      bar(B, px + e*.06, .025, s*pz, bx, .025, s*pz, .025, STAY_COL, 6);
    }
    bar(B, bx, H, -pz, bx, H, pz, .028, STAY_COL, 6);
    bar(B, bx, .025, -pz, bx, .025, pz, .025, STAY_COL, 6);
  }
  // the corner flags: a 1.5 m pole on each corner, a flag at the top in two halves of colour
  for (const sx of [-1, 1]) for (const sz of [-1, 1]){
    const x = sx*spec.hx, z = sz*spec.hz, h = FIFA.flagH;
    bar(B, x, 0, z, x, h, z, .016, FLAG_POLE, 6, true);
    // the flag hangs off the pole away from the pitch's middle, both faces
    const fx = x + sx*.02, fz = z + sz*.02, w = .42*Math.SQRT1_2, dx = sx*w, dz = sz*w*.3, y1 = h - .02, y0 = h - .32;
    for (const side of [1, -1]){
      const n = [side*sz*.3, 0, -side*sx];
      const a = B.v(fx, y1, fz, ...n, ...FLAG_A), b = B.v(fx + dx, y1 - .04, fz + dz, ...n, ...FLAG_A), c = B.v(fx + dx, y0 + .02, fz + dz, ...n, ...FLAG_B), d = B.v(fx, y0, fz, ...n, ...FLAG_B);
      if (side > 0) B.quad(a, b, c, d); else B.quad(a, d, c, b);
    }
  }
  const m = new THREE.Mesh(B.geometry(), mat({color:0xffffff, vertexColors:true, roughness:.32, kind:"gloss"}));
  m.name = "pitch-frames"; m.castShadow = true; m.receiveShadow = true;
  return m;
}
/* the nets of both goals as one mesh: back, roof and side panels on the colliders' planes (pitchspec), the back and
   the roof given a small sag where a real net hangs */
function netsMesh(spec){
  const B = Builder(), per = .96, col = [1, 1, 1];
  const panel = (corner, ua, va, nu, nv, sag) => {
    // corner + u*ua + v*va, u and v from 0 to 1, with sag(u, v) -> [dx, dy, dz]
    const [cx, cy, cz] = corner, idx = [];
    const Lu = Math.hypot(...ua), Lv = Math.hypot(...va);
    const n = [ua[1]*va[2] - ua[2]*va[1], ua[2]*va[0] - ua[0]*va[2], ua[0]*va[1] - ua[1]*va[0]], nl = Math.hypot(...n) || 1;
    for (let i = 0; i <= nu; i++){ const row = []; for (let j = 0; j <= nv; j++){
      const u = i/nu, v = j/nv, s = sag ? sag(u, v) : [0, 0, 0];
      row.push(B.v(cx + ua[0]*u + va[0]*v + s[0], cy + ua[1]*u + va[1]*v + s[1], cz + ua[2]*u + va[2]*v + s[2], n[0]/nl, n[1]/nl, n[2]/nl, ...col, u*Lu/per, v*Lv/per));
    } idx.push(row); }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) B.quad(idx[i][j], idx[i + 1][j], idx[i + 1][j + 1], idx[i][j + 1]);
  };
  for (const g of spec.goals){
    const e = g.end, px = g.postX, pz = Math.abs(g.post[0].z), bx = e*(Math.abs(px) + FIFA.netDepth), H = FIFA.netBackH, by = g.barY;
    const bulge = (u, v) => Math.sin(Math.PI*u)*Math.sin(Math.PI*v);
    // back: along z, up to H, bellied out a few centimetres
    panel([bx, 0, -pz], [0, 0, 2*pz], [0, H, 0], 10, 4, (u, v) => [e*.05*bulge(u, Math.min(1, v*1.4)), 0, 0]);
    // roof: from the bar to the back top, sagging down in the middle
    panel([px, by, -pz], [0, 0, 2*pz], [bx - px, H - by, 0], 10, 3, (u, v) => [0, -.07*bulge(u, v), 0]);
    // the sides: a quad from the post's foot to the back's foot, the back's top and the bar's end
    for (const s of [-1, 1]){
      const z = s*pz, a = B.v(px, 0, z, 0, 0, -s, ...col, 0, 0), b = B.v(bx, 0, z, 0, 0, -s, ...col, FIFA.netDepth/per, 0);
      const c = B.v(bx, H, z, 0, 0, -s, ...col, FIFA.netDepth/per, H/per), d = B.v(px, by, z, 0, 0, -s, ...col, 0, by/per);
      B.quad(a, b, c, d);
    }
  }
  const m = new THREE.Mesh(B.geometry(), mat({map:netTex(), color:0xf4f4f0, alphaTest:.5, transparent:false, depthWrite:true, side:THREE.DoubleSide, roughness:.9, kind:"tex"}));
  m.name = "pitch-nets"; m.castShadow = true; m.receiveShadow = false;
  return m;
}

/* ---------- spare balls on cones ---------- */
let CONE_G = null, BALL_G = null;
function coneGeo(){
  if (CONE_G) return CONE_G;
  const parts = [new THREE.CylinderGeometry(.16, .17, .03, 16).translate(0, .015, 0), new THREE.CylinderGeometry(.045, .13, .3, 14, 1, true).translate(0, .18, 0),
    new THREE.TorusGeometry(.055, .012, 6, 14).rotateX(Math.PI/2).translate(0, .33, 0)];
  const B = Builder(); for (const p of parts) B.add(p, [1, 1, 1]);
  const g = B.geometry(); g.deleteAttribute("color");
  return (CONE_G = g);
}
const ballGeo = () => BALL_G || (BALL_G = new THREE.SphereGeometry(FIFA.ballR, 18, 12));
const CONE_TOP = .33 + FIFA.ballR - .015;
function conesOf(spec, pos){
  const n = pos.length;
  // (each place gets its own copies of the shapes: a place's meshes are disposed with it)
  const cone = new THREE.InstancedMesh(coneGeo().clone(), mat({color:0xf07a22, roughness:.55, kind:"plain"}), n);
  const ball = new THREE.InstancedMesh(ballGeo().clone(), mat({map:ballTex(), roughness:.45, kind:"tex"}), n);
  cone.name = "pitch-cones"; ball.name = "pitch-spares";
  const M = new THREE.Matrix4(), Z = new THREE.Matrix4().makeScale(0, 0, 0);
  const at = i => M.makeRotationY(i*1.7).setPosition(pos[i].x, 0, pos[i].z);
  const list = pos.map((p, i) => {
    cone.setMatrixAt(i, at(i)); ball.setMatrixAt(i, M.makeRotationY(i*2.3).setPosition(p.x, CONE_TOP, p.z));
    const c = {x:p.x, z:p.z, index:i, mesh:cone, ball, has:true,
      // the ball on this cone is taken (a taker carries it off as the live ball) or put back
      take(){ if (!c.has) return false; c.has = false; ball.setMatrixAt(i, Z); ball.instanceMatrix.needsUpdate = true; return true; },
      put(){ if (c.has) return false; c.has = true; ball.setMatrixAt(i, M.makeRotationY(i*2.3).setPosition(p.x, CONE_TOP, p.z)); ball.instanceMatrix.needsUpdate = true; return true; },
      top:{x:p.x, y:CONE_TOP, z:p.z}};
    return c;
  });
  cone.instanceMatrix.needsUpdate = true; ball.instanceMatrix.needsUpdate = true;
  cone.computeBoundingSphere(); ball.computeBoundingSphere();
  cone.castShadow = ball.castShadow = true; cone.receiveShadow = ball.receiveShadow = true;
  return {cone, ball, list};
}

/* ---------- the pitch ----------
   spec: a PitchSpec (makePitch). o.tier 0..4 (the grass), o.worn 0..1 (how bare the goalmouths are; WEAR[tier] is a
   stadium's), o.stripes (mowing bands along the length), o.cones (spare balls on spec.spareCones), o.grass {hx, hz}
   (how far the grass reaches, pitch-local; the run-off by default), o.extra (more line segments: {type:'seg', x0, z0,
   x1, z1, dash}), o.solids (the posts, nets and flags block players, default true), o.scene (W.scene).
   Everything is placed in the spec's frame (spec.frame.cx, cz). */
export function buildPitchMesh(spec, o = {}){
  const opt = Object.assign({tier:2, worn:0, stripes:12, cones:true, grass:null, extra:null, solids:true, scene:W.scene}, o);
  opt.grass = opt.grass || {hx:spec.runoff ? spec.runoff.hx : spec.hx + 5, hz:spec.runoff ? spec.runoff.hz : spec.hz + 4};
  const scene = opt.scene, cx = spec.frame ? spec.frame.cx : 0, cz = spec.frame ? spec.frame.cz : 0;
  const put = m => { m.position.set(cx, 0, cz); m.updateMatrix(); m.matrixAutoUpdate = false; scene.add(m); return m; };
  const grass = put(grassMesh(spec, opt));
  const lines = put(linesMesh(spec, opt.extra));
  const frames = put(framesMesh(spec));
  const nets = put(netsMesh(spec));
  let cones = [], coneMesh = null, spareMesh = null;
  if (opt.cones && spec.spareCones && spec.spareCones.length){
    const c = conesOf(spec, spec.spareCones);
    coneMesh = put(c.cone); spareMesh = put(c.ball);
    cones = c.list.map(k => Object.assign(k, {x:k.x + cx, z:k.z + cz, top:{x:k.top.x + cx, y:k.top.y, z:k.top.z + cz}}));
  }
  const solidsMade = [];
  if (opt.solids){
    const S = (x0, x1, z0, z1, y0, y1) => solidsMade.push(solid(x0 + cx, x1 + cx, z0 + cz, z1 + cz, y0, y1));
    for (const g of spec.goals){
      const e = g.end, px = g.postX, pz = Math.abs(g.post[0].z), bx = e*(Math.abs(px) + FIFA.netDepth);
      const xa = Math.min(px, bx), xb = Math.max(px, bx);
      for (const s of [-1, 1]){
        S(px - .08, px + .08, s*pz - .08, s*pz + .08, 0, g.barY + .07);                 // a post
        S(xa, xb, s*pz - .05, s*pz + .05, 0, FIFA.netBackH + .1);                       // a side net
      }
      S(bx - .05, bx + .05, -pz, pz, 0, FIFA.netBackH + .05);                           // the back net
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) S(sx*spec.hx - .05, sx*spec.hx + .05, sz*spec.hz - .05, sz*spec.hz + .05, 0, FIFA.flagH);
  }
  const meshes = [grass, lines, frames, nets, coneMesh, spareMesh].filter(Boolean);
  return {
    grass, lines, frames, goalMeshes:[frames], netMesh:nets, cones, coneMesh, spareMesh, meshes, solids:solidsMade,
    dispose(){ for (const m of meshes){ if (m.parent) m.parent.remove(m); m.geometry.dispose(); m.material.dispose(); } }
  };
}

/* ---------- the ball ----------
   The one ball look (matches, training, the flat): a moving mesh, and a soft blob on the ground under it that shrinks
   and fades as the ball goes up. shadow:false leaves the blob off (a ball in your hands). */
let BLOBG = null, BLOBM = null;
const blobGeo = () => BLOBG || (BLOBG = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI/2));
function blobMat(){
  if (BLOBM) return BLOBM;
  const t = textTex(64, 64, g => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, "rgba(0,0,0,.6)"); gr.addColorStop(.6, "rgba(0,0,0,.3)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  t.userData.per = 1;
  BLOBM = new THREE.MeshBasicMaterial({map:t, transparent:true, depthWrite:false, opacity:.5, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2});
  BLOBM.userData.keep = true;
  return BLOBM;
}
export function ballMesh({shadow = true} = {}){
  const m = new THREE.Mesh(ballGeo().clone(), mat({map:ballTex(), roughness:.45, kind:"tex"}));
  m.name = "ball"; m.castShadow = false; m.receiveShadow = true;
  let b = null;
  if (shadow){
    b = new THREE.Mesh(blobGeo(), blobMat());
    b.name = "ball-blob";
    b.matrixAutoUpdate = false; b.matrixWorldAutoUpdate = false; b.frustumCulled = false; b.renderOrder = 1; b.castShadow = false; b.receiveShadow = false;
    b.userData.keep = true;                      // shared geometry and material: never disposed with the place
    // under the ball, on the ground (y = 0 of the ball's parent's world), whatever the ball's height
    b.onBeforeRender = () => {
      const e = m.matrixWorld.elements, h = Math.max(0, e[13] - FIFA.ballR), k = 1/(1 + h*1.6), s = .34*k + .1;
      b.matrixWorld.makeScale(s, 1, s).setPosition(e[12], .02, e[14]);
    };
    m.add(b);
  }
  return {mesh:m, shadow:b};
}
