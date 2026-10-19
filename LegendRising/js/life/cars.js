/* ============ LIFE: cars ============
   Owner: WP-A from Stage 1 (DESIGN 3.9.2, 2.3 WP-A: fewer draw calls for the cars that move).
   Low-poly, rounded, readable cars in three shapes (a boxy hatchback, a wedge of a sports coupé and a big old muscle
   car with a blower through its bonnet), each a side profile pushed out to the car's width with soft bevels, a glass
   house on top, real wheels with rims, lamps. Built once as a list of pieces in the car's own frame (nose at local +x,
   standing on y = 0), each piece tagged with what it is made of; then either
   · bakeCar(kind, color, x, z, ry): poured into the zone's static batches (build.js addGeo): a parked car costs no
     draw calls of its own, however many line the streets; or
   · car(kind, color) -> THREE.Group: a car that can come and go (one parked across your front door, the squad's cars
     leaving the training ground). Its pieces are poured by the same batch keys a baked car uses (paint, gloss, metal,
     plain), the colour in each vertex, so the body is at most four meshes; the lamps are one mesh whose glow takes the
     colour of each lamp; each wheel is one mesh so it can turn. About nine draw calls instead of twenty, and the same
     look as the parked ones. .userData.lamps(on) switches the lamps, .userData.size = [length, height, width]. A car
     standing still for a while is merged with the other fixed parts of the place (chunks.js) until it moves. */
import {THREE, roundedBoxGeo, roundSeg, lowPoly, mat, lmat, addGeo, textTex} from "./build.js";

const KINDS = {
  // side profiles: [x, y] round the body from the front bumper, length along x (front +x), height y; then glass
  hatch:{L:3.9, W:1.72, wheel:.31, wx:[1.25, -1.2], body:[[1.95, .3], [1.98, .58], [1.85, .72], [.75, .82], [.55, .84], [-1.75, .86], [-1.95, .78], [-1.97, .32], [-1.8, .2], [1.8, .2]],
    cabin:[[.62, .84], [.08, 1.38], [-1.45, 1.42], [-1.82, .88]], roof:0},
  sport:{L:4.3, W:1.86, wheel:.33, wx:[1.38, -1.3], body:[[2.15, .26], [2.18, .48], [1.95, .62], [.95, .74], [-1.2, .8], [-1.95, .86], [-2.15, .74], [-2.16, .3], [-1.98, .2], [1.98, .2]],
    cabin:[[.82, .74], [.1, 1.16], [-.85, 1.18], [-1.62, .84]], spoiler:true},
  muscle:{L:4.6, W:1.9, wheel:.35, wx:[1.5, -1.42], body:[[2.3, .3], [2.32, .62], [2.15, .78], [.6, .86], [-1.55, .88], [-2.25, .86], [-2.32, .7], [-2.3, .32], [-2.1, .22], [2.1, .22]],
    cabin:[[.42, .86], [-.18, 1.3], [-1.08, 1.32], [-1.6, .9]], blower:true, stripes:true}
};
function profileGeo(pts, width, bevel){
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) sh.lineTo(p[0], p[1]); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, {depth:width - bevel*2, bevelEnabled:true, bevelThickness:bevel, bevelSize:bevel*.8, bevelSegments:lowPoly() ? 1 : 2, curveSegments:1});
  g.translate(0, 0, -(width - bevel*2)/2);
  return g;
}
/* what each piece is made of: the batch key it joins (a parked car's static batch, or a moving car's mesh of that key)
   and its colour there (none: the car's own colour) */
const LOOK = {
  paint:{key:"paint"},
  stripe:{key:"paint"},
  glass:{key:"gloss", c:0x1c252e},
  dark:{key:"plain", c:0x1d1f22},
  chrome:{key:"metal", c:0xc9cdd1},
  tyre:{key:"plain", c:0x17181a},
  rim:{key:"metal"},
  head:{key:"gloss", c:0xf2eee0}, tail:{key:"gloss", c:0xa5221b}, ind:{key:"gloss", c:0xe0963a}
};
// the pieces of a car: [{geo, look, color, wheel}] in its own frame
function pieces(kind, color, o){
  const K = KINDS[kind] || KINDS.hatch, W = K.W, L2 = K.L/2, P = [];
  const put = (geo, look, x = 0, y = 0, z = 0, c = color) => { geo.translate(x, y, z); P.push({geo, look, color:c}); return geo; };
  put(profileGeo(K.body, W, .08), "paint");
  put(profileGeo(K.cabin, W - .14, .07), "glass");
  // the roof skin over the glass: a thin body-colour band round the cabin's top
  const top = K.cabin.slice(1, 3), rx0 = top[1][0], rx1 = top[0][0], ry = Math.max(top[0][1], top[1][1]);
  put(roundedBoxGeo(rx1 - rx0 + .06, .06, W - .12, .03, 1), "paint", (rx0 + rx1)/2, ry + .01, 0);
  // bumpers, sills, grille
  put(roundedBoxGeo(.12, .16, W - .04, .05, 1), "dark", L2 - .02, .28, 0);
  put(roundedBoxGeo(.12, .16, W - .04, .05, 1), "dark", -L2 + .02, .3, 0);
  for (const s of [1, -1]) put(roundedBoxGeo(K.L - 1.2, .08, .04, .02, 1), "dark", 0, .24, s*(W/2 - .01));
  put(roundedBoxGeo(.04, .12, W*.42, .02, 1), "dark", L2 + .02, .5, 0);
  for (const s of [1, -1]){
    put(roundedBoxGeo(.05, .1, .3, .03, 1), "head", L2 - .04, .55, s*(W/2 - .28));
    put(roundedBoxGeo(.05, .05, .1, .02, 1), "ind", L2 - .05, .42, s*(W/2 - .14));
    put(roundedBoxGeo(.05, .1, .34, .03, 1), "tail", -L2 + .04, .62, s*(W/2 - .26));
    // door lines and a handle, mirrors
    put(new THREE.BoxGeometry(.012, .42, .004), "dark", .45, .58, s*(W/2 + .002));
    put(new THREE.BoxGeometry(.012, .42, .004), "dark", -.7, .6, s*(W/2 + .002));
    put(roundedBoxGeo(.12, .03, .03, .012, 1), "chrome", .1, .72, s*(W/2 + .01));
    put(roundedBoxGeo(.1, .07, .1, .02, 1), "paint", K.cabin[0][0] - .05, K.cabin[0][1] + .1, s*(W/2 + .05));
  }
  if (K.spoiler){ put(roundedBoxGeo(.24, .04, W - .1, .015, 1), "paint", -L2 + .1, 1.02, 0); for (const s of [1, -1]) put(new THREE.BoxGeometry(.05, .16, .04), "dark", -L2 + .14, .92, s*(W/2 - .3)); }
  if (K.blower){ put(roundedBoxGeo(.42, .2, .5, .05, 1), "chrome", 1.0, .88, 0); put(roundedBoxGeo(.3, .12, .42, .04, 1), "dark", 1.0, 1.02, 0); }
  if (K.stripes && o.stripe !== false) for (const z of [-.18, .18]) put(new THREE.BoxGeometry(K.L - .5, .012, .16), "stripe", -.02, .885, z, o.stripe || 0xd8261f);
  // the wheels, in arches cut dark into the body: a tyre, a rim, five spokes each side (on Low fewer sides, and the
  // spokes only on the outer face: the inner one is hidden under the body)
  const rim = o.rim || 0xb9bec2, r = K.wheel, wd = .22, outerOnly = lowPoly();
  for (const x of K.wx) for (const s of [1, -1]){
    put(new THREE.CylinderGeometry(r + .07, r + .07, .02, roundSeg(16, r + .07), 1, false, 0, Math.PI).rotateX(Math.PI/2).rotateZ(Math.PI/2), "dark", x, r + .02, s*(W/2 + .003));
    const wz = s*(W/2 - .1), wheel = [];
    wheel.push({geo:new THREE.CylinderGeometry(r, r, wd, roundSeg(18, r)).rotateX(Math.PI/2), look:"tyre"});
    wheel.push({geo:new THREE.CylinderGeometry(r*.62, r*.62, wd + .02, roundSeg(12, r*.62)).rotateX(Math.PI/2), look:"rim", color:rim});
    for (let i = 0; i < 5; i++) for (const f of outerOnly ? [s] : [1, -1]) wheel.push({geo:new THREE.BoxGeometry(r*.12, r*1.1, .02).rotateZ(i/5*Math.PI*2).translate(0, 0, f*(wd/2 + .012)), look:"dark"});
    P.push({wheel, at:[x, r, wz]});
  }
  return {P, K};
}
/* a parked car, for good: poured into the static batches at (x, z), turned ry. Returns its size [L, H, W]. */
const _m = new THREE.Matrix4(), _w = new THREE.Matrix4(), _q = new THREE.Quaternion(), _y = new THREE.Vector3(0, 1, 0);
export function bakeCar(kind, color, x, z, ry, o = {}){
  const {P, K} = pieces(kind, color, o);
  _m.compose(new THREE.Vector3(x, o.y || .01, z), _q.setFromAxisAngle(_y, ry), new THREE.Vector3(1, 1, 1));
  const pour = (geo, look, c, m) => { const L = LOOK[look]; addGeo(geo, L.c != null ? L.c : c, {matrix:m, key:L.key, ao:false, jit:0}); };
  for (const p of P){
    if (p.wheel){ _w.copy(_m).multiply(new THREE.Matrix4().makeTranslation(p.at[0], p.at[1], p.at[2])); for (const q of p.wheel) pour(q.geo, q.look, q.color || 0, _w); }
    else pour(p.geo, p.look, p.color, _m);
  }
  return [K.L + .1, 1.45, K.W + .1];
}
/* several placed geometries as one, each coloured: a position and normal and colour per vertex, so pieces of
   different colours share one material (vertexColors) */
const _col = new THREE.Color();
function colored(list){
  const P = [], N = [], C = [];
  for (const {geo, color} of list){
    const g = geo.index ? geo.toNonIndexed() : geo;
    _col.set(color);
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i += 3){ P.push(p[i], p[i + 1], p[i + 2]); N.push(n[i], n[i + 1], n[i + 2]); C.push(_col.r, _col.g, _col.b); }
    if (g !== geo) g.dispose(); geo.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
// the shared material of a batch key with the colour in the vertices (one per key for every moving car and the bus)
const keyMat = key => lmat(0xffffff, Object.assign({vertexColors:true, kind:{paint:"paint", gloss:"gloss", metal:"metal", plain:"plain"}[key]},
  {paint:{roughness:.3, metalness:.25}, gloss:{roughness:.42}, metal:{roughness:.34, metalness:.75}, plain:{}}[key]));
const LAMP = {head:0xfff6dc, tail:0xc8261f, ind:0xf2a43a};          // the lamps' own colours (their glow is tinted by them)
/* the lamps of one car: one mesh, its glow tinted by each lamp's own colour ("neon": the emissive light is multiplied
   by the vertex colour); on, the head and tail lamps light up together */
function lampMesh(list){
  const m = mat("neon", {vertexColors:true, emissiveIntensity:.1, roughness:.25});
  const mesh = new THREE.Mesh(colored(list), m); mesh.castShadow = false; mesh.receiveShadow = true;
  return mesh;
}
/* a car that can come and go: its body by batch key, its lamps as one mesh, a group per wheel (spin it:
   .userData.wheels), lamps it can switch on */
export function car(kind = "hatch", color = 0x2c66b8, o = {}){
  const {P, K} = pieces(kind, color, o), g = new THREE.Group(), byKey = new Map(), lamps = [];
  const wheels = [];
  for (const p of P){
    if (p.wheel){
      const w = new THREE.Group(), list = p.wheel.map(q => { const L = LOOK[q.look]; return {geo:q.geo, color:L.c != null ? L.c : q.color || 0}; });
      const mesh = new THREE.Mesh(colored(list), keyMat("plain")); mesh.castShadow = true; w.add(mesh);
      w.position.set(p.at[0], p.at[1], p.at[2]); g.add(w); wheels.push(w);
      continue;
    }
    if (LAMP[p.look]){ lamps.push({geo:p.geo, color:LAMP[p.look]}); continue; }
    const L = LOOK[p.look], key = L.key;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({geo:p.geo, color:L.c != null ? L.c : p.color});
  }
  for (const [key, list] of byKey){ const mesh = new THREE.Mesh(colored(list), keyMat(key)); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); }
  const lm = lampMesh(lamps); g.add(lm);
  g.userData.size = [K.L + .1, 1.45, K.W + .1];
  g.userData.wheels = wheels; g.userData.wheelR = K.wheel;
  // headlights and tail lights on (driving at night) or off (parked)
  g.userData.lamps = on => { lm.material.emissiveIntensity = on ? 2 : .1; };
  g.userData.dispose = () => { lm.material.dispose(); g.traverse(c => { if (c.isMesh) c.geometry.dispose(); }); };
  return g;
}
export const CAR_KINDS = Object.keys(KINDS);
const PAINT = [0xd8d6cf, 0x2f3a2f, 0x8a2b2b, 0x3b5b7a, 0x1d1f22, 0xc9a24a, 0x5a6b78, 0xe2722e, 0x2d6f4a, 0x7a2f5a];
export function carPaint(i){ return PAINT[((i % PAINT.length) + PAINT.length) % PAINT.length]; }

/* the Line 14 bus: a long white box with the city's blue along its skirt, a dark band of windows, the doors on its
   kerb side (local +z), the number and where it is going lit over the windscreen; one mesh per material, the wheels
   separate so they turn. Nose at local +x, as a car's. */
let BUS_SIGN = null;
export function bus(){
  const g = new THREE.Group(), L = 11.4, Wd = 2.5, H = 3.05, r = .48, byKey = new Map(), lamps = [];
  const add = (geo, key, color, x, y, z) => { geo.translate(x, y, z); if (!byKey.has(key)) byKey.set(key, []); byKey.get(key).push({geo, color}); };
  const C = {white:0xeceff1, blue:0x1d6fc4, glass:0x1c252e, dark:0x1d1f22, door:0x2a3440};
  add(roundedBoxGeo(L, H - .38, Wd, .16, 2), "paint", C.white, 0, .38 + (H - .38)/2, 0);
  add(roundedBoxGeo(L + .02, .5, Wd + .02, .1, 1), "paint", C.blue, 0, .62, 0);
  add(new THREE.BoxGeometry(L - 1.3, 1.1, Wd + .03), "gloss", C.glass, -.35, 2.0, 0);
  add(new THREE.BoxGeometry(.05, 1.55, Wd - .24), "gloss", C.glass, L/2 + .005, 1.95, 0);
  add(new THREE.BoxGeometry(.05, .9, Wd - .3), "gloss", C.glass, -L/2 - .005, 2.05, 0);
  for (const x of [L/2 - 1.4, -.6]) add(new THREE.BoxGeometry(1.15, 2.25, .04), "gloss", C.door, x, 1.5, Wd/2 + .005);
  add(roundedBoxGeo(L - .4, .14, Wd - .3, .06, 1), "paint", C.white, 0, H + .07, 0);
  add(roundedBoxGeo(.16, .26, Wd - .1, .06, 1), "plain", C.dark, L/2 + .02, .45, 0); add(roundedBoxGeo(.16, .26, Wd - .1, .06, 1), "plain", C.dark, -L/2 - .02, .45, 0);
  for (const x of [L/2 - 2.1, -L/2 + 2.6]) for (const s of [1, -1]) add(new THREE.CylinderGeometry(r + .08, r + .08, .02, 16, 1, false, 0, Math.PI).rotateX(Math.PI/2).rotateZ(Math.PI/2), "plain", C.dark, x, r + .03, s*(Wd/2 + .004));
  for (const [key, list] of byKey){ const mesh = new THREE.Mesh(colored(list), keyMat(key)); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); }
  // the destination board over the windscreen
  if (!BUS_SIGN){ BUS_SIGN = textTex(512, 96, c => { c.fillStyle = "#0b0d10"; c.fillRect(0, 0, 512, 96); c.fillStyle = "#ffb43a"; c.font = "800 62px 'Barlow Condensed', sans-serif"; c.textBaseline = "middle"; c.fillText("14", 22, 52); c.font = "700 40px 'Barlow Condensed', sans-serif"; c.fillText(`${PLACES.city.toUpperCase()} · ${PLACES.town.toUpperCase()}`, 108, 52); }); BUS_SIGN.userData.keep = true; }
  const sm = mat({map:BUS_SIGN, emissive:0xffffff, emissiveMap:BUS_SIGN, emissiveIntensity:.9, roughness:.4});
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(Wd - .5, .34), sm); sign.position.set(L/2 + .035, 2.83, 0); sign.rotation.y = Math.PI/2; g.add(sign);
  for (const s of [1, -1]){
    lamps.push({geo:roundedBoxGeo(.06, .18, .34, .04, 1).translate(L/2 + .03, .82, s*(Wd/2 - .32)), color:LAMP.head});
    lamps.push({geo:roundedBoxGeo(.06, .3, .2, .04, 1).translate(-L/2 - .03, .95, s*(Wd/2 - .2)), color:LAMP.tail});
  }
  const lm = lampMesh(lamps); g.add(lm);
  const wheels = [];
  for (const x of [L/2 - 2.1, -L/2 + 2.6]) for (const s of [1, -1]){
    const w = new THREE.Group();
    const mesh = new THREE.Mesh(colored([{geo:new THREE.CylinderGeometry(r, r, .32, 18).rotateX(Math.PI/2), color:0x17181a}, {geo:new THREE.CylinderGeometry(r*.55, r*.55, .34, 10).rotateX(Math.PI/2), color:0xb9bec2}]), keyMat("plain"));
    mesh.castShadow = true; w.add(mesh);
    w.position.set(x, r, s*(Wd/2 - .16)); g.add(w); wheels.push(w);
  }
  g.userData.size = [L + .1, H, Wd + .1]; g.userData.wheels = wheels; g.userData.wheelR = r;
  g.userData.lamps = on => { lm.material.emissiveIntensity = on ? 2 : .1; };
  g.userData.dispose = () => { lm.material.dispose(); sm.dispose(); g.traverse(c => { if (c.isMesh) c.geometry.dispose(); }); };
  return g;
}
