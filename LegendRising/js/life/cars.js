/* ============ LIFE: cars ============
   Low-poly, rounded, readable cars in three shapes — a boxy hatchback, a wedge of a sports coupé and a big old muscle
   car with a blower through its bonnet — each a side profile pushed out to the car's width with soft bevels, a glass
   house on top, real wheels with rims, lamps that glow at night. They are objects of their own (a group), so a car can
   come and go: one parked across your front door, the squad's cars leaving the training ground.
   car(kind, color, o) → THREE.Group, nose at local +x, standing on y = 0; .userData.size = [length, height, width]. */
import {THREE, part, roundedBoxGeo, mergeGeos, lmat} from "./build.js";

const KINDS = {
  // side profiles: [x, y] round the body from the front bumper, length along x (front +x), height y; then glass
  hatch:{L:3.9, W:1.72, wheel:.31, wx:[1.25, -1.2], body:[[1.95, .3], [1.98, .58], [1.85, .72], [.75, .82], [.55, .84], [-1.75, .86], [-1.95, .78], [-1.97, .32], [-1.8, .2], [1.8, .2]],
    cabin:[[.62, .84], [.08, 1.38], [-1.45, 1.42], [-1.82, .88]], roof:0},
  sport:{L:4.3, W:1.86, wheel:.33, wx:[1.38, -1.3], body:[[2.15, .26], [2.18, .48], [1.95, .62], [.95, .74], [-1.2, .8], [-1.95, .86], [-2.15, .74], [-2.16, .3], [-1.98, .2], [1.98, .2]],
    cabin:[[.82, .74], [.1, 1.16], [-.85, 1.18], [-1.62, .84]], spoiler:true},
  muscle:{L:4.6, W:1.9, wheel:.35, wx:[1.5, -1.42], body:[[2.3, .3], [2.32, .62], [2.15, .78], [.6, .86], [-1.55, .88], [-2.25, .86], [-2.32, .7], [-2.3, .32], [-2.1, .22], [2.1, .22]],
    cabin:[[.42, .86], [-.18, 1.3], [-1.08, 1.32], [-1.6, .9]], blower:true, stripes:true}
};
const GLASS = () => lmat(0x24303a, {roughness:.08, metalness:.4});
function profileGeo(pts, width, bevel){
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) sh.lineTo(p[0], p[1]); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, {depth:width - bevel*2, bevelEnabled:true, bevelThickness:bevel, bevelSize:bevel*.8, bevelSegments:2, curveSegments:1});
  g.translate(0, 0, -(width - bevel*2)/2);
  return g;
}
function wheel(r, wd, rim){
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, wd, 18), lmat(0x17181a, {roughness:.9})); tyre.rotation.x = Math.PI/2; g.add(tyre);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r*.62, r*.62, wd + .02, 12), lmat(rim, {metalness:.8, roughness:.3})); hub.rotation.x = Math.PI/2; g.add(hub);
  for (let i = 0; i < 5; i++){ const sp = new THREE.Mesh(new THREE.BoxGeometry(r*.12, r*1.1, .02), lmat(0x2a2d31)); sp.rotation.z = i/5*Math.PI*2; sp.position.z = wd/2 + .012; g.add(sp); const sp2 = sp.clone(); sp2.position.z = -wd/2 - .012; g.add(sp2); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
export function car(kind = "hatch", color = 0x2c66b8, o = {}){
  const K = KINDS[kind] || KINDS.hatch, g = new THREE.Group(), W = K.W;
  const paint = lmat(color, {metalness:.35, roughness:.32}), dark = lmat(0x1d1f22, {roughness:.6}), chrome = lmat(0xc9cdd1, {metalness:.85, roughness:.25});
  const body = new THREE.Mesh(profileGeo(K.body, W, .08), paint); body.castShadow = true; body.receiveShadow = true; g.add(body);
  const cab = new THREE.Mesh(profileGeo(K.cabin, W - .14, .07), GLASS()); cab.castShadow = true; g.add(cab);
  // the pillars and the roof skin over the glass: a thin body-colour band round the cabin's top
  const top = K.cabin.slice(1, 3), rx0 = top[1][0], rx1 = top[0][0], ry = Math.max(top[0][1], top[1][1]);
  const roof = new THREE.Mesh(roundedBoxGeo(rx1 - rx0 + .06, .06, W - .12, .03, 1), paint); roof.position.set((rx0 + rx1)/2, ry + .01, 0); roof.castShadow = true; g.add(roof);
  // bumpers, sills, grille, lamps
  const add = (geo, m, x, y, z) => { const mm = new THREE.Mesh(geo, m); mm.position.set(x, y, z); mm.castShadow = true; g.add(mm); return mm; };
  const L2 = K.L/2;
  add(roundedBoxGeo(.12, .16, W - .04, .05, 1), dark, L2 - .02, .28, 0);
  add(roundedBoxGeo(.12, .16, W - .04, .05, 1), dark, -L2 + .02, .3, 0);
  add(roundedBoxGeo(K.L - 1.2, .08, .04, .02, 1), dark, 0, .24, W/2 - .01); add(roundedBoxGeo(K.L - 1.2, .08, .04, .02, 1), dark, 0, .24, -W/2 + .01);
  add(roundedBoxGeo(.04, .12, W*.42, .02, 1), dark, L2 + .02, .5, 0);
  const head = new THREE.MeshStandardMaterial({color:0xfff6dc, emissive:0xfff0c8, emissiveIntensity:.25, roughness:.2});
  const tail = new THREE.MeshStandardMaterial({color:0xc8261f, emissive:0xff2a1a, emissiveIntensity:.35, roughness:.3});
  const ind = new THREE.MeshStandardMaterial({color:0xf2a43a, emissive:0xf2a43a, emissiveIntensity:.15, roughness:.3});
  for (const s of [1, -1]){
    add(roundedBoxGeo(.05, .1, .3, .03, 1), head, L2 - .04, .55, s*(W/2 - .28));
    add(roundedBoxGeo(.05, .05, .1, .02, 1), ind, L2 - .05, .42, s*(W/2 - .14));
    add(roundedBoxGeo(.05, .1, .34, .03, 1), tail, -L2 + .04, .62, s*(W/2 - .26));
    // door lines and a handle, mirrors
    add(new THREE.BoxGeometry(.012, .42, .004), dark, .45, .58, s*(W/2 + .002));
    add(new THREE.BoxGeometry(.012, .42, .004), dark, -.7, .6, s*(W/2 + .002));
    add(roundedBoxGeo(.12, .03, .03, .012, 1), chrome, .1, .72, s*(W/2 + .01));
    add(roundedBoxGeo(.1, .07, .1, .02, 1), paint, K.cabin[0][0] - .05, K.cabin[0][1] + .1, s*(W/2 + .05));
  }
  if (K.spoiler){ add(roundedBoxGeo(.24, .04, W - .1, .015, 1), paint, -L2 + .1, 1.02, 0); for (const s of [1, -1]) add(new THREE.BoxGeometry(.05, .16, .04), dark, -L2 + .14, .92, s*(W/2 - .3)); }
  if (K.blower){ add(roundedBoxGeo(.42, .2, .5, .05, 1), chrome, 1.0, .88, 0); add(roundedBoxGeo(.3, .12, .42, .04, 1), dark, 1.0, 1.02, 0); }
  if (K.stripes && o.stripe !== false){ const sm = lmat(o.stripe || 0xd8261f, {roughness:.35}); for (const z of [-.18, .18]) add(new THREE.BoxGeometry(K.L - .5, .012, .16), sm, -.02, .885, z); }
  // the wheels, in arches cut dark into the body
  for (const x of K.wx) for (const s of [1, -1]){
    add(new THREE.CylinderGeometry(K.wheel + .07, K.wheel + .07, .02, 16, 1, false, 0, Math.PI).rotateX(Math.PI/2).rotateZ(Math.PI/2), dark, x, K.wheel + .02, s*(W/2 + .003));
    const w = wheel(K.wheel, .22, o.rim || 0xb9bec2); w.position.set(x, K.wheel, s*(W/2 - .1)); g.add(w);
  }
  g.userData.size = [K.L + .1, 1.45, W + .1];
  g.userData.lamps = [head, tail];
  return g;
}
export const CAR_KINDS = Object.keys(KINDS);
const PAINT = [0xd8d6cf, 0x2f3a2f, 0x8a2b2b, 0x3b5b7a, 0x1d1f22, 0xc9a24a, 0x5a6b78, 0xe2722e, 0x2d6f4a, 0x7a2f5a];
export function carPaint(i){ return PAINT[((i % PAINT.length) + PAINT.length) % PAINT.length]; }
