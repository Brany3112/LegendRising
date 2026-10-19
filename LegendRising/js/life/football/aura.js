/* ============ Football: the team-mate you look at ============
   Owner: UF-B (Training Mode and football rework, stage TR-3+U, user fixes). Contract: USER-ISSUES.md U8 (when you look
   at a team-mate he gets a slight red aura, a soft outline or rim glow, subtle, readable at distance, cheap to draw;
   still red against a red kit, as a soft outline).

   One quad, one draw: a soft red halo the shape of a standing body (a capsule's edge, bright at its rim and fading out
   and in), turned to the camera and set just behind the man, so his own body covers its middle and what shows is a
   glow round his outline. Who: the team-mate on the pitch nearest the middle of your view, within LOOK_DEG of it (a
   little more for a man close by, whose body is wide on screen), kept while he stays within KEEP_DEG; it fades in and
   out over FADE s. At range the halo keeps a minimum size on screen, so a man 40 m away still reads.

   auraInit(scene) once a match; auraFrame(dt, cam, ms, me, posOf) every frame (posOf(id, out) -> out {x, y, z}: where
   the view draws that agent, or null when it is hidden); auraDispose(). AURA.target: the agent it is on (-1 none),
   AURA.alpha: how far it has faded in (tests). */
import {THREE} from "../build.js";

export const AURA = {target: -1, alpha: 0, mesh: null, scene: null, pick: -1, pickT: 0};
const LOOK_DEG = 6.5, KEEP_DEG = 10, FADE = .18, PICK_HOLD = .12, RANGE = 70;
const COLOR = 0xff2a2a, OPACITY = .62;
const H = 2.05, W = 1.05;                     // the halo's size round a man of 1.8 m: a little wider and taller than him
const MIN_PX = 26;                            // its height on screen at the least (px), so it reads at distance

// the halo's picture: a capsule's rim (64 x 128), its alpha a ring round the capsule's edge, soft both ways
function haloTexture(){
  const w = 64, h = 128, c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d"), img = g.createImageData(w, h), d = img.data;
  // the capsule: a vertical segment from y 0.27 to 0.77 of the height (the head to the knees), radius 0.17 of the height
  const ax = .5, ay0 = .25, ay1 = .78, r = .17, rim = .055;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
    const u = (x + .5)/w*(W/H), v = (y + .5)/h, cx = ax*(W/H), cy = Math.max(ay0, Math.min(ay1, v));
    const dist = Math.hypot(u - cx, v - cy) - r;
    // bright at the edge (dist 0), fading over rim outward, and over twice that inward (his body covers the middle)
    const k = dist >= 0 ? Math.exp(-(dist/rim)*(dist/rim)) : Math.exp(-(dist/(2.2*rim))*(dist/(2.2*rim)))*.85;
    const o = (y*w + x)*4;
    d[o] = 255; d[o + 1] = 255; d[o + 2] = 255; d[o + 3] = Math.round(255*Math.max(0, Math.min(1, k)));
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}

export function auraInit(scene){
  auraDispose();
  if (!scene) return;
  const mat = new THREE.MeshBasicMaterial({map: haloTexture(), color: COLOR, transparent: true, opacity: 0, depthWrite: false, depthTest: true, fog: false, toneMapped: false});
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
  m.name = "fp-aura"; m.visible = false; m.renderOrder = 1; m.frustumCulled = false; m.userData.noMerge = true;
  scene.add(m);
  AURA.mesh = m; AURA.scene = scene; AURA.target = -1; AURA.alpha = 0; AURA.pick = -1; AURA.pickT = 0;
}
export function auraDispose(){
  const m = AURA.mesh;
  if (m){ if (m.parent) m.parent.remove(m); m.geometry.dispose(); if (m.material.map) m.material.map.dispose(); m.material.dispose(); }
  AURA.mesh = null; AURA.scene = null; AURA.target = -1; AURA.alpha = 0; AURA.pick = -1;
}

const _f = new THREE.Vector3(), _c = new THREE.Vector3(), _p = {x: 0, y: 0, z: 0}, _q = {x: 0, y: 0, z: 0};
// the angle (degrees) between where you look and a point, and its distance, written into one reused object (this runs
// for every team-mate on every frame of a match: nothing is allocated)
const _A = {deg: 0, d: 0};
function angleTo(cam, x, y, z){
  const dx = x - _c.x, dy = y - _c.y, dz = z - _c.z, d = Math.hypot(dx, dy, dz) || 1e-6;
  _A.deg = Math.acos(Math.max(-1, Math.min(1, (dx*_f.x + dy*_f.y + dz*_f.z)/d)))*180/Math.PI; _A.d = d;
  return _A;
}
export function auraFrame(dt, cam, ms, me, posOf){
  const m = AURA.mesh;
  if (!m || !cam) return;
  cam.getWorldDirection(_f); cam.getWorldPosition(_c);
  // who you look at: the team-mate nearest the middle of the view, within LOOK_DEG (wider for a man close by)
  let best = -1, bd = Infinity;
  if (ms && me && me.onPitch){
    for (const a of ms.agents){
      if (a === me || a.team !== me.team || !a.onPitch || a.role !== "player" || a.leaving || a.sentOff) continue;
      const p = posOf(a.id, _p); if (!p) continue;
      const s = a.scale || 1, A = angleTo(cam, p.x, p.y + 1.15*s, p.z);
      if (A.d > RANGE) continue;
      const wide = Math.atan2(.45*s, A.d)*180/Math.PI;
      const lim = (a.id === AURA.target ? KEEP_DEG : LOOK_DEG) + wide;
      if (A.deg < lim && A.deg - wide < bd){ bd = A.deg - wide; best = a.id; }
    }
  }
  // (a man the look only passes over is not lit: he has to stay the nearest for a moment)
  if (best !== AURA.pick){ AURA.pick = best; AURA.pickT = 0; } else AURA.pickT += dt;
  // (a new man not held long enough yet: what is lit stays lit)
  const want = best === AURA.target ? best : best < 0 ? -1 : AURA.pickT >= PICK_HOLD ? best : AURA.target;
  if (want !== AURA.target){
    // fade the old one out before the new one comes in
    AURA.alpha = Math.max(0, AURA.alpha - dt/FADE);
    if (AURA.alpha <= 0) AURA.target = want;
  } else if (want >= 0) AURA.alpha = Math.min(1, AURA.alpha + dt/FADE);
  else AURA.alpha = Math.max(0, AURA.alpha - dt/FADE);
  const a = AURA.target >= 0 && ms ? ms.agents[AURA.target] : null, p = a ? posOf(a.id, _q) : null;
  if (!a || !p || AURA.alpha <= 0){ m.visible = false; m.material.opacity = 0; return; }
  // just behind him as you see him, turned to you; at range never smaller than MIN_PX tall on screen
  const s = a.scale || 1, cy = p.y + .98*s;
  const dx = p.x - _c.x, dz = p.z - _c.z, dl = Math.hypot(dx, dz) || 1;
  const d = Math.hypot(dx, cy - _c.y, dz);
  const pxPerM = cam.isPerspectiveCamera ? (innerHeight/2)/Math.tan(cam.fov*Math.PI/360)/Math.max(.5, d) : 100;
  const k = Math.max(s, MIN_PX/(H*pxPerM));
  m.position.set(p.x + dx/dl*.32, cy, p.z + dz/dl*.32);
  m.quaternion.copy(cam.quaternion);
  m.scale.set(k, k, 1);
  m.material.opacity = OPACITY*AURA.alpha;
  m.visible = true;
}
