/* ============ LIFE: cars ============
   Low-poly, rounded, readable cars in three shapes — a boxy hatchback, a wedge of a sports coupé and a big old muscle
   car with a blower through its bonnet — each a side profile pushed out to the car's width with soft bevels, a glass
   house on top, real wheels with rims, lamps. Built once as a list of pieces in the car's own frame (nose at local +x,
   standing on y = 0), each piece tagged with what it is made of; then either
   · bakeCar(kind, color, x, z, ry) — poured into the zone's static batches (build.js addGeo): a parked car costs no
     draw calls of its own, however many line the streets; or
   · car(kind, color) → THREE.Group — a car that can come and go (one parked across your front door, the squad's cars
     leaving the training ground): one mesh per material, the wheels separate so they can turn, its own lamps that
     can be switched on (.userData.lamps(on)). .userData.size = [length, height, width]. */
import {THREE, roundedBoxGeo, mergeGeos, lmat, addGeo, textTex} from "./build.js";

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
  const g = new THREE.ExtrudeGeometry(sh, {depth:width - bevel*2, bevelEnabled:true, bevelThickness:bevel, bevelSize:bevel*.8, bevelSegments:2, curveSegments:1});
  g.translate(0, 0, -(width - bevel*2)/2);
  return g;
}
/* what each piece is made of: for a moving car, the material (lmat: shared between cars of a colour); for a parked one,
   the static batch it joins (key) and its colour there */
const LOOK = {
  paint:{m:c => lmat(c, {metalness:.35, roughness:.32}), key:"paint"},
  stripe:{m:c => lmat(c, {roughness:.35}), key:"paint"},
  glass:{m:() => lmat(0x24303a, {roughness:.08, metalness:.4}), key:"gloss", c:0x1c252e},
  dark:{m:() => lmat(0x1d1f22, {roughness:.6}), key:"plain", c:0x1d1f22},
  chrome:{m:() => lmat(0xc9cdd1, {metalness:.85, roughness:.25}), key:"metal", c:0xc9cdd1},
  tyre:{m:() => lmat(0x17181a, {roughness:.9}), key:"plain", c:0x17181a},
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
  // the wheels, in arches cut dark into the body: a tyre, a rim, five spokes each side
  const rim = o.rim || 0xb9bec2, r = K.wheel, wd = .22;
  for (const x of K.wx) for (const s of [1, -1]){
    put(new THREE.CylinderGeometry(r + .07, r + .07, .02, 16, 1, false, 0, Math.PI).rotateX(Math.PI/2).rotateZ(Math.PI/2), "dark", x, r + .02, s*(W/2 + .003));
    const wz = s*(W/2 - .1), wheel = [];
    wheel.push({geo:new THREE.CylinderGeometry(r, r, wd, 18).rotateX(Math.PI/2), look:"tyre"});
    wheel.push({geo:new THREE.CylinderGeometry(r*.62, r*.62, wd + .02, 12).rotateX(Math.PI/2), look:"rim", color:rim});
    for (let i = 0; i < 5; i++) for (const f of [1, -1]) wheel.push({geo:new THREE.BoxGeometry(r*.12, r*1.1, .02).rotateZ(i/5*Math.PI*2).translate(0, 0, f*(wd/2 + .012)), look:"dark"});
    P.push({wheel, at:[x, r, wz]});
  }
  return {P, K};
}
const lookMat = (look, color) => look === "rim" ? lmat(color, {metalness:.8, roughness:.3}) : LOOK[look].m(color);
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
/* a car that can come and go: one mesh per material, a group per wheel (spin it: .userData.wheels), lamps of its own */
export function car(kind = "hatch", color = 0x2c66b8, o = {}){
  const {P, K} = pieces(kind, color, o), g = new THREE.Group(), by = new Map();
  const head = new THREE.MeshStandardMaterial({color:0xfff6dc, emissive:0xfff0c8, emissiveIntensity:.08, roughness:.2});
  const tail = new THREE.MeshStandardMaterial({color:0xc8261f, emissive:0xff2a1a, emissiveIntensity:.12, roughness:.3});
  const ind = lmat(0xf2a43a, {roughness:.3});
  const matOf = (look, c) => look === "head" ? head : look === "tail" ? tail : look === "ind" ? ind : lookMat(look, c);
  const add = (geo, m) => { if (!by.has(m)) by.set(m, []); by.get(m).push(geo); };
  const wheels = [];
  for (const p of P){
    if (!p.wheel){ add(p.geo, matOf(p.look, p.color)); continue; }
    const w = new THREE.Group(), wb = new Map();
    for (const q of p.wheel){ const m = matOf(q.look, q.color); if (!wb.has(m)) wb.set(m, []); wb.get(m).push(q.geo); }
    for (const [m, list] of wb){ const mesh = new THREE.Mesh(mergeGeos(list), m); mesh.castShadow = true; w.add(mesh); }
    w.position.set(p.at[0], p.at[1], p.at[2]); g.add(w); wheels.push(w);
  }
  for (const [m, list] of by){ const mesh = new THREE.Mesh(mergeGeos(list), m); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); }
  g.userData.size = [K.L + .1, 1.45, K.W + .1];
  g.userData.wheels = wheels; g.userData.wheelR = K.wheel;
  // headlights and tail lights on (driving at night) or off (parked)
  g.userData.lamps = on => { head.emissiveIntensity = on ? 2.2 : .08; tail.emissiveIntensity = on ? 1.6 : .12; };
  g.userData.dispose = () => { head.dispose(); tail.dispose(); g.traverse(c => { if (c.isMesh) c.geometry.dispose(); }); };
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
  const g = new THREE.Group(), L = 11.4, Wd = 2.5, H = 3.05, by = new Map(), r = .48;
  const M = {white:lmat(0xeceff1, {roughness:.4, metalness:.2}), blue:lmat(0x1d6fc4, {roughness:.4, metalness:.2}), glass:lmat(0x1c252e, {roughness:.1, metalness:.4}),
    dark:lmat(0x1d1f22, {roughness:.6}), door:lmat(0x2a3440, {roughness:.2, metalness:.3}), rim:lmat(0xb9bec2, {metalness:.8, roughness:.3}), tyre:lmat(0x17181a, {roughness:.9})};
  const add = (geo, m, x, y, z) => { geo.translate(x, y, z); if (!by.has(m)) by.set(m, []); by.get(m).push(geo); };
  add(roundedBoxGeo(L, H - .38, Wd, .16, 2), M.white, 0, .38 + (H - .38)/2, 0);
  add(roundedBoxGeo(L + .02, .5, Wd + .02, .1, 1), M.blue, 0, .62, 0);
  add(new THREE.BoxGeometry(L - 1.3, 1.1, Wd + .03), M.glass, -.35, 2.0, 0);
  add(new THREE.BoxGeometry(.05, 1.55, Wd - .24), M.glass, L/2 + .005, 1.95, 0);
  add(new THREE.BoxGeometry(.05, .9, Wd - .3), M.glass, -L/2 - .005, 2.05, 0);
  for (const x of [L/2 - 1.4, -.6]) add(new THREE.BoxGeometry(1.15, 2.25, .04), M.door, x, 1.5, Wd/2 + .005);
  add(roundedBoxGeo(L - .4, .14, Wd - .3, .06, 1), M.white, 0, H + .07, 0);
  add(roundedBoxGeo(.16, .26, Wd - .1, .06, 1), M.dark, L/2 + .02, .45, 0); add(roundedBoxGeo(.16, .26, Wd - .1, .06, 1), M.dark, -L/2 - .02, .45, 0);
  for (const x of [L/2 - 2.1, -L/2 + 2.6]) for (const s of [1, -1]) add(new THREE.CylinderGeometry(r + .08, r + .08, .02, 16, 1, false, 0, Math.PI).rotateX(Math.PI/2).rotateZ(Math.PI/2), M.dark, x, r + .03, s*(Wd/2 + .004));
  for (const [m, list] of by){ const mesh = new THREE.Mesh(mergeGeos(list), m); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); }
  // the destination board over the windscreen
  if (!BUS_SIGN){ BUS_SIGN = textTex(512, 96, c => { c.fillStyle = "#0b0d10"; c.fillRect(0, 0, 512, 96); c.fillStyle = "#ffb43a"; c.font = "800 62px 'Barlow Condensed', sans-serif"; c.textBaseline = "middle"; c.fillText("14", 22, 52); c.font = "700 40px 'Barlow Condensed', sans-serif"; c.fillText(`${PLACES.city.toUpperCase()} · ${PLACES.town.toUpperCase()}`, 108, 52); }); BUS_SIGN.userData.keep = true; }
  const sm = new THREE.MeshStandardMaterial({map:BUS_SIGN, emissive:0xffffff, emissiveMap:BUS_SIGN, emissiveIntensity:.9, roughness:.4});
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(Wd - .5, .34), sm); sign.position.set(L/2 + .035, 2.83, 0); sign.rotation.y = Math.PI/2; g.add(sign);
  const head = new THREE.MeshStandardMaterial({color:0xfff6dc, emissive:0xfff0c8, emissiveIntensity:.1, roughness:.2});
  const tail = new THREE.MeshStandardMaterial({color:0xc8261f, emissive:0xff2a1a, emissiveIntensity:.15, roughness:.3});
  for (const s of [1, -1]){
    const hl = new THREE.Mesh(roundedBoxGeo(.06, .18, .34, .04, 1), head); hl.position.set(L/2 + .03, .82, s*(Wd/2 - .32)); g.add(hl);
    const tl = new THREE.Mesh(roundedBoxGeo(.06, .3, .2, .04, 1), tail); tl.position.set(-L/2 - .03, .95, s*(Wd/2 - .2)); g.add(tl);
  }
  const wheels = [];
  for (const x of [L/2 - 2.1, -L/2 + 2.6]) for (const s of [1, -1]){
    const w = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, .32, 18).rotateX(Math.PI/2), M.tyre); t.castShadow = true; w.add(t);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(r*.55, r*.55, .34, 10).rotateX(Math.PI/2), M.rim); w.add(h);
    w.position.set(x, r, s*(Wd/2 - .16)); g.add(w); wheels.push(w);
  }
  g.userData.size = [L + .1, H, Wd + .1]; g.userData.wheels = wheels; g.userData.wheelR = r;
  g.userData.lamps = on => { head.emissiveIntensity = on ? 2.2 : .1; tail.emissiveIntensity = on ? 1.6 : .15; };
  g.userData.dispose = () => { head.dispose(); tail.dispose(); sm.dispose(); g.traverse(c => { if (c.isMesh) c.geometry.dispose(); }); };
  return g;
}
