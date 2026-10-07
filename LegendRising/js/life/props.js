/* ============ LIFE: things that furnish the world ============
   Benches, cones, balls, mannequins, goals with real nets, lockers, boards, desks and screens, a
   vending machine, trees, cars and street lamps. Everything is a few rounded or tapered shapes, so
   it reads as a made object rather than a grey cube, and almost all of it is poured into the shared
   batches so a whole training ground stays a handful of draw calls. */
import {THREE, W, addGeo, roundedBoxGeo, roundSeg, solid, textTex, label, mat, lightSrc, pool, halo, netTex, part, lmat} from "./build.js";

export const PC = {white:0xf2f1ec, offwhite:0xe6e2d8, dark:0x2b2f34, steel:0x8f979e, darkSteel:0x4b5258, wood:0x9a6b42, woodDark:0x6b4a2c,
  orange:0xf07a22, yellow:0xf2c230, lime:0xc8f060, blue:0x2c66b8, red:0xc8463a, green:0x3f8a48, teal:0x2f8f86, black:0x1d1f22};

/* ---------- a frame: place parts relative to a prop's own origin and rotation ---------- */
export function frame(x, z, ry = 0, y = 0){ return {x, y, z, ry, c:Math.cos(ry), s:Math.sin(ry)}; }
const _m = new THREE.Matrix4(), _r = new THREE.Matrix4();
// put a geometry (built round its own centre) at a local position in the frame
function put(f, g, lx, ly, lz, color, o = {}){
  if (o.rx) g.rotateX(o.rx); if (o.rz) g.rotateZ(o.rz); if (o.ry) g.rotateY(o.ry);
  g.rotateY(f.ry);
  g.translate(f.x + lx*f.c + lz*f.s, f.y + ly, f.z - lx*f.s + lz*f.c);
  addGeo(g, color, Object.assign({ao:false}, o));
}
// rounded box, bottom at ly (or centred on ly with o.center); any tilt turns it about its own middle
export function rb(f, lx, ly, lz, w, h, d, r, color, o = {}){
  const g = roundedBoxGeo(w, h, d, r, o.seg || 1);
  put(f, g, lx, o.center ? ly : ly + h/2, lz, color, o);
}
// cylinder (or cone), bottom at ly unless turned on its side, then ly is the axis (fewer sides on Low: build.js roundSeg)
export function cy(f, lx, ly, lz, rt, rb_, h, color, o = {}){
  const g = new THREE.CylinderGeometry(rt, rb_, h, roundSeg(o.seg || 12, Math.max(rt, rb_)), 1, !!o.open);
  if (!o.rx && !o.rz) g.translate(0, h/2, 0);
  put(f, g, lx, ly, lz, color, o);
}
export function sph(f, lx, ly, lz, r, color, o = {}){
  const ws = roundSeg(o.ws || 12, r), hs = Math.max(3, Math.min(o.hs || 8, Math.ceil(ws*2/3)));
  const g = o.detail != null ? new THREE.IcosahedronGeometry(r, o.detail) : new THREE.SphereGeometry(r, ws, hs);
  if (o.sx || o.sy || o.sz) g.scale(o.sx || 1, o.sy || 1, o.sz || 1);
  put(f, g, lx, ly, lz, color, o);
}
// a solid in the frame's own axes: w along local x, d along local z, centred at (lx, lz). Turned by a quarter turn it is
// one box; turned by any other angle the footprint is cut into short pieces along its length, each boxed round where
// it really is, so a board set at an angle blocks along its whole length without a fat square round it
export function fsolid(f, lx, lz, w, d, y0, y1){
  const cx = f.x + lx*f.c + lz*f.s, cz = f.z - lx*f.s + lz*f.c, ac = Math.abs(f.c), as = Math.abs(f.s);
  if (ac < 1e-3 || as < 1e-3){
    const ww = as > .5 ? d : w, dd = as > .5 ? w : d;
    return solid(cx - ww/2, cx + ww/2, cz - dd/2, cz + dd/2, f.y + y0, f.y + y1);
  }
  // the long axis is cut into n pieces about as long as the short one is wide
  const alongX = w >= d, L = alongX ? w : d, Sh = alongX ? d : w, n = Math.max(1, Math.min(12, Math.ceil(L/Math.max(Sh, .15))));
  const out = [];
  for (let i = 0; i < n; i++){
    const t = -L/2 + L*(i + .5)/n, pw = alongX ? L/n : w, pd = alongX ? d : L/n;
    const px = cx + (alongX ? t*f.c : t*f.s), pz = cz + (alongX ? -t*f.s : t*f.c);
    const hx = (Math.abs(pw*f.c) + Math.abs(pd*f.s))/2, hz = (Math.abs(pw*f.s) + Math.abs(pd*f.c))/2;
    out.push(solid(px - hx, px + hx, pz - hz, pz + hz, f.y + y0, f.y + y1));
  }
  return out.length === 1 ? out[0] : out;
}
export function worldPt(f, lx, lz){ return [f.x + lx*f.c + lz*f.s, f.z - lx*f.s + lz*f.c]; }

/* ---------- pitch-side ---------- */
export function cone(x, z, color = PC.orange, s = 1){
  const f = frame(x, z);
  cy(f, 0, 0, 0, .19*s, .2*s, .025, color, {seg:14});
  cy(f, 0, .025, 0, .025*s, .12*s, .28*s, color, {seg:12});
  cy(f, 0, .12*s, 0, .085*s, .1*s, .05*s, PC.white, {seg:12});
}
export function marker(x, z, color = PC.yellow){ const f = frame(x, z); cy(f, 0, 0, 0, .1, .14, .05, color, {seg:12}); }
// a match ball: white, with the dark panels that make it read as a ball from across the pitch
export function ball(x, y, z, r = .11){
  const f = frame(x, z, 0, y);
  sph(f, 0, 0, 0, r, PC.white, {detail:1, key:"gloss"});
  const dirs = [[0, 1, 0], [.89, .45, 0], [-.45, .45, .77], [-.45, .45, -.77], [.3, -.6, .74], [-.7, -.55, -.2]];
  for (const [a, b, c] of dirs){
    const g = new THREE.CylinderGeometry(r*.36, r*.36, r*.05, 5);
    const n = new THREE.Vector3(a, b, c).normalize();
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n));
    g.translate(n.x*r*.98, n.y*r*.98, n.z*r*.98);
    put(f, g, 0, 0, 0, 0x22262c);
  }
}
export function ballBag(x, z, ry = 0){
  const f = frame(x, z, ry);
  rb(f, 0, 0, 0, .7, .5, .5, .18, 0x1f3a2a, {seg:2});
  rb(f, 0, .48, 0, .74, .06, .54, .03, 0x14261b);
  for (const [lx, lz] of [[-.18, -.08], [.16, .07], [0, .12]]){ const [bx, bz] = worldPt(f, lx, lz); ball(bx, .6, bz); }
  fsolid(f, 0, 0, .74, .54, 0, .6);
}
// a free-kick wall dummy: one smooth moulded figure (head, neck, shoulders, a chest tapering to the hips), flat
// front to back the way the plastic ones are, on a sprung pole in a heavy round base
let DUMMY = null;
export function mannequin(x, z, ry = 0, color = PC.yellow){
  const f = frame(x, z, ry);
  // a heavy base, small enough that a row of them set 62 cm apart stand clear of each other
  cy(f, 0, 0, 0, .25, .285, .05, PC.dark, {seg:16});
  cy(f, 0, .05, 0, .17, .23, .04, 0x3a3f45, {seg:16});
  cy(f, 0, .09, 0, .032, .032, .42, PC.darkSteel, {seg:8, key:"metal"});
  for (let i = 0; i < 4; i++) cy(f, 0, .14 + i*.07, 0, .045, .045, .025, PC.darkSteel, {seg:8, key:"metal"});     // the spring
  if (!DUMMY){
    const P = [[0, .5], [.1, .5], [.16, .56], [.175, .66], [.16, .82], [.15, .92], [.17, 1.06], [.205, 1.2], [.225, 1.32], [.215, 1.39],
      [.17, 1.44], [.075, 1.49], [.062, 1.54], [.075, 1.58], [.102, 1.64], [.114, 1.71], [.104, 1.79], [.07, 1.85], [0, 1.875]];
    DUMMY = new THREE.LatheGeometry(P.map(([r, y]) => new THREE.Vector2(r, y)), 12);
    DUMMY.scale(1, 1, .56);
  }
  put(f, DUMMY.clone(), 0, 0, 0, color, {flat:true, key:"gloss"});
  fsolid(f, 0, 0, .5, .5, 0, 1.85);
}
export function bench(x, z, ry = 0, len = 2.4, o = {}){
  const f = frame(x, z, ry, o.y || 0), wood = o.wood || PC.wood, legs = o.legs || PC.darkSteel;
  for (let i = 0; i < 3; i++) rb(f, 0, .42, -.16 + i*.13, len, .045, .11, .02, wood, {jit:.06});
  if (o.back !== false){ for (let i = 0; i < 2; i++) rb(f, 0, .62 + i*.16, .3, len, .11, .04, .018, wood, {jit:.06, rx:-.12}); }
  for (const s of [-1, 1]){
    rb(f, s*(len/2 - .18), 0, 0, .06, .44, .44, .02, legs, {key:"metal"});
    if (o.back !== false) rb(f, s*(len/2 - .18), .42, .32, .05, .5, .05, .02, legs, {key:"metal", rx:-.12});
  }
  fsolid(f, 0, .02, len, .5, 0, o.back !== false ? .95 : .48);
}
export function goal(x, z, dir, w = 6, h = 2.2, depth = 1.6){
  // dir: which way the net runs back from the goal line (+1 = towards +x)
  const f = frame(x, z, dir > 0 ? Math.PI/2 : -Math.PI/2);
  // in the frame, the goal mouth runs along local x and the net back along local z
  for (const s of [-1, 1]) cy(f, s*w/2, 0, 0, .06, .06, h, PC.white, {seg:12, key:"gloss"});
  cy(f, 0, h, 0, .06, .06, w + .12, PC.white, {seg:12, rz:Math.PI/2, key:"gloss"});
  for (const s of [-1, 1]){
    cy(f, s*w/2, h, depth*.3, .03, .03, depth*.62, PC.offwhite, {seg:6, rx:Math.PI/2 - .45});
    cy(f, s*w/2, .02, depth/2, .03, .03, depth, PC.offwhite, {seg:6, rx:Math.PI/2});
  }
  cy(f, 0, .03, depth, .03, .03, w, PC.offwhite, {seg:6, rz:Math.PI/2});
  // the net: three cut-out planes, sagging a touch
  const m = mat({map:netTex(12, 1.8), transparent:true, alphaTest:.02, side:THREE.DoubleSide, roughness:.9, depthWrite:false});
  const mk = (gw, gh, rep) => { const g = new THREE.PlaneGeometry(gw, gh, 8, 4); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i)*rep[0], uv.getY(i)*rep[1]); return g; };
  const add = (g, px, py, pz, rx, ry) => {
    const n = new THREE.Mesh(g, m); n.rotation.set(rx, ry, 0, "YXZ");
    const [wx, wz] = worldPt(f, px, pz); n.position.set(wx, py, wz); n.rotation.y += f.ry; W.scene.add(n); return n;
  };
  const backH = h*.95, slope = Math.hypot(depth, h - backH);
  const back = mk(w, backH, [w*3, backH*3]); add(back, 0, backH/2, depth, 0, 0);
  const roof = mk(w, slope, [w*3, slope*3]); add(roof, 0, h - (h - backH)/2, depth/2, -Math.PI/2 + Math.atan2(h - backH, depth), 0);
  for (const s of [-1, 1]){
    const g = new THREE.BufferGeometry();
    const P = [0, 0, 0, 0, h, 0, 0, backH, depth, 0, 0, 0, 0, backH, depth, 0, 0, depth];
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 0, h*3, depth*3, backH*3, 0, 0, depth*3, backH*3, depth*3, 0], 2));
    g.computeVertexNormals();
    const n = new THREE.Mesh(g, m); const [wx, wz] = worldPt(f, s*w/2, 0); n.position.set(wx, 0, wz); n.rotation.y = f.ry; W.scene.add(n);
  }
  // solid where the frame and the net really are, the mouth left open: the posts, the crossbar (from its underside
  // up), the two side nets with their stanchions, and the back net
  fsolid(f, -w/2, 0, .16, .16, 0, h + .07); fsolid(f, w/2, 0, .16, .16, 0, h + .07);
  fsolid(f, 0, 0, w + .16, .16, h - .07, h + .1);
  for (const s of [-1, 1]) fsolid(f, s*w/2, depth/2, .1, depth + .06, 0, h + .07);
  fsolid(f, 0, depth, w + .1, .1, 0, h + .07);
}
export function cornerFlag(x, z){
  const f = frame(x, z);
  cy(f, 0, 0, 0, .02, .02, 1.5, PC.white, {seg:6});
  // the flag, from both sides: the same triangle twice in its own place, once wound each way (put() moves the
  // geometry it is given into the world, so each side is made fresh rather than cloned from a placed one)
  const tri = P => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals(); return g; };
  put(f, tri([0, 1.48, 0, .36, 1.36, 0, 0, 1.22, 0]), 0, 0, 0, 0xe8462e);
  put(f, tri([0, 1.48, 0, 0, 1.22, 0, .36, 1.36, 0]), 0, 0, 0, 0xe8462e);
  solid(x - .05, x + .05, z - .05, z + .05, 0, 1.5);
}
export function dugout(x, z, ry, len = 5, seat = PC.blue){
  const f = frame(x, z, ry);
  rb(f, 0, 0, 0, len + .3, .1, 1.5, .03, 0x6d737a);
  rb(f, 0, 0, .7, len + .3, 2.2, .08, .03, 0x3b434b);
  for (const s of [-1, 1]) rb(f, s*(len/2 + .1), 0, .1, .08, 2.2, 1.3, .03, 0x3b434b);
  // a curved clear roof
  for (let i = 0; i < 6; i++){
    const a = i/5, lz = .7 - a*1.3, ly = 2.2 + Math.sin(a*Math.PI*.5)*.0 - a*a*.45;
    rb(f, 0, ly, lz, len + .3, .03, .27, .01, 0x9fb7c6, {key:"glass"});
  }
  for (let i = 0; i < Math.floor(len/.55); i++){
    const lx = -len/2 + .32 + i*.55;
    rb(f, lx, .42, .32, .46, .08, .42, .05, seat, {key:"gloss"});
    rb(f, lx, .5, .52, .46, .5, .07, .04, seat, {key:"gloss", rx:-.1});
  }
  rb(f, 0, 0, .32, len, .42, .3, .02, 0x4b5258);
  // the shelter from the back of its back wall (.74) to the front edge of its side panels (−.55), a hair over each
  fsolid(f, 0, .1, len + .4, 1.32, 0, 2.3);
}
export function floodlight(x, z, aimX, aimZ, h = 13){
  const f = frame(x, z, Math.atan2(aimX - x, aimZ - z));
  cy(f, 0, 0, 0, .14, .22, h, 0x8a9198, {seg:10, key:"metal"});
  rb(f, 0, h - .2, 0, 2.2, .9, .4, .12, 0x3b4249, {rx:-.55, key:"metal"});
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) rb(f, -.7 + i*.7, h + .02 - j*.36, .2 - j*.2, .56, .3, .05, .06, 0xfff4d8, {rx:-.55, key:"street"});
  solid(x - .3, x + .3, z - .3, z + .3, 0, h);
}

/* ---------- the gym and the dressing room ---------- */
export function waterCooler(x, z, ry = 0){
  const f = frame(x, z, ry);
  rb(f, 0, 0, 0, .36, .95, .36, .06, PC.offwhite, {seg:2});
  rb(f, 0, .55, .17, .2, .14, .04, .02, 0x3c4248);
  cy(f, 0, .95, 0, .15, .15, .42, 0x8cc4e8, {seg:16, key:"glass"});
  cy(f, 0, 1.37, 0, .06, .15, .08, 0x8cc4e8, {seg:16, key:"glass"});
  for (let i = 0; i < 3; i++) cy(f, .26, .02 + i*.08, -.1, .035, .03, .08, PC.white, {seg:8});
  fsolid(f, 0, 0, .4, .4, 0, 1.4);
}
export function bottle(x, y, z, color = 0x2f8f86){
  const f = frame(x, z, 0, y);
  cy(f, 0, 0, 0, .035, .035, .2, color, {seg:10, key:"gloss"});
  cy(f, 0, .2, 0, .02, .03, .04, 0xf2f2ee, {seg:8});
}
export function kitBag(x, z, ry = 0, color = 0x1f2e4a){
  const f = frame(x, z, ry);
  rb(f, 0, 0, 0, .78, .34, .34, .14, color, {seg:2});
  rb(f, 0, .32, 0, .5, .05, .05, .02, PC.dark, {rx:0});
  rb(f, .2, .1, .172, .25, .12, .01, .01, PC.lime);
}
export function bibs(x, y, z, ry = 0, color = 0xd8ff3a){
  const f = frame(x, z, ry, y);
  for (let i = 0; i < 4; i++) rb(f, (i - 1.5)*.04, i*.02, (i % 2)*.03, .42, .02, .32, .01, color, {key:"gloss"});
}
// the kit man's laundry trolley: a steel frame on four castors round a canvas bag, bibs folded on top (.84 m high)
export function kitHamper(x, z, ry = 0, color = 0xd8ff3a, bag = 0x2a3442){
  const f = frame(x, z, ry), W_ = .74, D_ = .52, H_ = .84;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]){
    cy(f, sx*(W_/2 - .05), 0, sz*(D_/2 - .05), .035, .035, .03, PC.dark, {seg:10, rx:Math.PI/2});          // a castor
    cy(f, sx*(W_/2 - .05), .07, sz*(D_/2 - .05), .012, .012, H_ - .08, PC.darkSteel, {seg:6, key:"metal"});    // an upright
  }
  rb(f, 0, .1, 0, W_ - .06, .03, D_ - .06, .012, PC.darkSteel, {key:"metal"});
  for (const sz of [-1, 1]) rb(f, 0, H_ - .03, sz*(D_/2 - .05), W_ - .06, .025, .025, .01, PC.darkSteel, {key:"metal"});
  for (const sx of [-1, 1]) rb(f, sx*(W_/2 - .05), H_ - .03, 0, .025, .025, D_ - .06, .01, PC.darkSteel, {key:"metal"});
  // the bag hangs inside the frame, a little slack: wider at the top than at the bottom
  const g = roundedBoxGeo(W_ - .12, H_ - .2, D_ - .12, .05, 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++){ const k = .9 + .1*(p.getY(i)/(H_ - .2) + .5); p.setX(i, p.getX(i)*k); p.setZ(i, p.getZ(i)*k); }
  put(f, g, 0, .14 + (H_ - .2)/2, 0, bag);
  for (let i = 0; i < 3; i++) rb(f, -.12 + i*.11, H_ - .05 + i*.02, (i % 2)*.05 - .02, .34, .025, .26, .01, i === 1 ? 0xff6a3a : color, {key:"gloss", ry:(i - 1)*.2});
  fsolid(f, 0, 0, W_, D_, 0, H_);
}
export function lockers(x, z, ry, n = 6, color = 0x2c66b8){
  const f = frame(x, z, ry), w = .52;
  for (let i = 0; i < n; i++){
    const lx = (i - (n - 1)/2)*w;
    rb(f, lx, 0, 0, w - .02, 1.95, .5, .03, color, {key:"metal"});
    rb(f, lx, 1.55, .252, .3, .03, .01, .005, 0x1c2c4a);
    rb(f, lx, 1.48, .252, .3, .03, .01, .005, 0x1c2c4a);
    rb(f, lx + .17, .95, .255, .04, .14, .02, .01, PC.steel, {key:"metal"});
    rb(f, lx, 1.72, .253, .16, .07, .01, .01, PC.offwhite);
  }
  rb(f, 0, 1.95, -.02, n*w + .06, .06, .56, .02, 0x22262b);
  fsolid(f, 0, 0, n*w, .55, 0, 2);
}
export function shelfUnit(x, z, ry, w = 1.6, h = 1.8, color = PC.darkSteel){
  const f = frame(x, z, ry);
  for (const s of [-1, 1]) rb(f, s*(w/2 - .03), 0, 0, .05, h, .45, .015, color, {key:"metal"});
  for (let i = 0; i < 4; i++) rb(f, 0, .08 + i*(h - .1)/3, 0, w, .03, .45, .01, color, {key:"metal"});
  fsolid(f, 0, 0, w, .45, 0, h);
  return f;
}
// a whiteboard on its stand with the week's shape drawn on it
export function tacticsBoard(x, z, ry, title = "SATURDAY"){
  const f = frame(x, z, ry);
  for (const s of [-1, 1]){ rb(f, s*.85, 0, 0, .05, 1.85, .05, .02, PC.steel, {key:"metal"}); rb(f, s*.85, 0, 0, .05, .04, .5, .02, PC.dark); }
  rb(f, 0, .8, 0, 1.86, 1.06, .05, .03, 0xdadde0);
  const t = textTex(512, 288, g => {
    g.fillStyle = "#f6f7f5"; g.fillRect(0, 0, 512, 288);
    g.strokeStyle = "#3f8a48"; g.lineWidth = 4; g.strokeRect(18, 18, 476, 252); g.beginPath(); g.moveTo(256, 18); g.lineTo(256, 270); g.stroke();
    g.beginPath(); g.arc(256, 144, 34, 0, 7); g.stroke(); g.strokeRect(18, 92, 50, 104); g.strokeRect(444, 92, 50, 104);
    const dot = (x, y, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); };
    for (const [x, y] of [[60, 144], [120, 64], [120, 120], [120, 168], [120, 224], [190, 96], [190, 144], [190, 192], [235, 144], [290, 110], [290, 178]]) dot(x, y, "#2c66b8");
    for (const [x, y] of [[330, 80], [340, 200], [380, 144], [300, 144]]) dot(x, y, "#c8463a");
    g.strokeStyle = "#1b1f24"; g.lineWidth = 3; g.setLineDash([8, 6]);
    for (const [a, b, c, d] of [[190, 96, 290, 110], [235, 144, 300, 70], [190, 192, 300, 230]]){ g.beginPath(); g.moveTo(a, b); g.quadraticCurveTo((a + c)/2, b - 30, c, d); g.stroke(); }
    g.setLineDash([]); g.fillStyle = "#1b1f24"; g.font = "bold 22px sans-serif"; g.fillText(title, 28, 46);
  });
  const [wx, wz] = worldPt(f, 0, .03); label(t, wx, f.y + 1.33, wz, 1.76, .99, f.ry, {rough:.35});
  fsolid(f, 0, 0, 1.8, .5, 0, 1.9);
}
// the training centre's board: the session's hours and a league match day's times come from daily.js (SESSION,
// sessionHours, KICKOFF), so the board always says what the game does
function boardNotes(){
  const hours = typeof sessionHours === "function" ? sessionHours() : fmtRange(SESSION.start, SESSION.end);
  const kick = KICKOFF.L[1];
  return [["TRAINING", hours, "Monday to Friday,", "not on match days"], ["MATCH DAY", `Report by ${fmtTime(kick - 60)}`, `Kick-off ${fmtTime(kick)}`],
    ["PHYSIO", "Ice baths in the", "dressing room"], ["LOST", "Black shin pads", "ask Gigi"]];
}
export function noticeBoard(x, y, z, ry, lines){
  const t = textTex(512, 320, g => {
    g.fillStyle = "#b98a55"; g.fillRect(0, 0, 512, 320);
    for (let i = 0; i < 2600; i++){ g.fillStyle = `rgba(${Math.random() < .5 ? "90,60,30" : "220,180,120"},.25)`; g.fillRect(Math.random()*512, Math.random()*320, 2, 2); }
    g.strokeStyle = "#5b3d22"; g.lineWidth = 14; g.strokeRect(0, 0, 512, 320);
    const notes = lines || boardNotes();
    const pos = [[24, 22, 200, 150, "#fffdf3"], [244, 30, 236, 120, "#fff4b8"], [40, 190, 190, 110, "#dff3ff"], [262, 168, 210, 124, "#ffe2e2"]];
    notes.forEach((n, i) => { const [x, y, w, h, c] = pos[i % pos.length];
      g.save(); g.translate(x + w/2, y + h/2); g.rotate((i % 2 ? 1 : -1)*.03); g.fillStyle = c; g.fillRect(-w/2, -h/2, w, h);
      g.fillStyle = "#c8463a"; g.beginPath(); g.arc(0, -h/2 + 10, 6, 0, 7); g.fill();
      g.fillStyle = "#222"; g.font = "bold 22px sans-serif"; g.fillText(n[0], -w/2 + 12, -h/2 + 42);
      g.font = "17px sans-serif"; for (let k = 1; k < n.length; k++) g.fillText(n[k], -w/2 + 12, -h/2 + 42 + k*24);
      g.restore(); });
  });
  label(t, x, y, z, 1.6, 1.0, ry, {rough:.9});
}
export function desk(x, z, ry, w = 1.4, color = 0xb5895a){
  const f = frame(x, z, ry);
  rb(f, 0, .72, 0, w, .05, .7, .02, color, {jit:.03});
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cy(f, sx*(w/2 - .08), 0, sz*.28, .025, .025, .72, PC.darkSteel, {seg:8, key:"metal"});
  fsolid(f, 0, 0, w, .7, 0, .77);
  return f;
}
// a monitor with something on its screen; screenTex is a canvas texture
export function monitor(f, lx, ly, lz, screenTex, w = .62){
  const h = w*.6;
  rb(f, lx, ly, lz, .22, .015, .16, .01, PC.dark);
  rb(f, lx, ly, lz - .02, .04, .18, .03, .01, PC.dark);
  rb(f, lx, ly + .14, lz, w + .03, h + .03, .035, .015, 0x16181b);
  const [wx, wz] = worldPt(f, lx, lz + .019);
  const m = label(screenTex, wx, f.y + ly + .14 + (h + .03)/2, wz, w, h, f.ry, {glow:.95, rough:.2});
  return m;
}
export function chair(x, z, ry, color = 0x23272c){
  const f = frame(x, z, ry);
  cy(f, 0, 0, 0, .26, .26, .03, PC.dark, {seg:5});
  cy(f, 0, .03, 0, .025, .025, .4, PC.steel, {seg:8, key:"metal"});
  rb(f, 0, .43, 0, .46, .07, .44, .03, color, {seg:2});
  rb(f, 0, .5, -.21, .44, .5, .05, .03, color, {seg:2, rx:.08});
  fsolid(f, 0, 0, .5, .5, 0, .9);
}
// a bistro chair: a round dished seat on four splayed legs, two uprights and a curved back rail. Faces +z in its frame
// (the back is at −z); the seat top is at .475. Returns the seat height for the sit contract.
export function cafeChair(x, z, ry, color = 0x9a6b42, frameCol = PC.dark){
  const f = frame(x, z, ry);
  cy(f, 0, .43, 0, .205, .19, .045, color, {seg:14});
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]){
    const g = new THREE.CylinderGeometry(.013, .011, .45, 6), a = .08;
    g.rotateZ(-sx*a); g.rotateX(sz*a); put(f, g, sx*.15, .215, sz*.15, frameCol, {key:"metal"});
  }
  for (const sx of [-1, 1]){ const g = new THREE.CylinderGeometry(.012, .012, .44, 6); g.rotateX(-.12); put(f, g, sx*.15, .69, -.165, frameCol, {key:"metal"}); }
  // the back rail: a band bent round the sitter's back
  const arc = new THREE.CylinderGeometry(.24, .24, .09, 12, 1, true, Math.PI*.72, Math.PI*.56);
  arc.rotateX(-.12); put(f, arc, 0, .84, .03, color, {});
  const arc2 = new THREE.CylinderGeometry(.23, .23, .09, 12, 1, true, Math.PI*.72, Math.PI*.56);
  arc2.scale(-1, 1, 1); arc2.rotateX(-.12); put(f, arc2, 0, .84, .03, color, {shade:.8, flat:true});        // its inside face (mirrored: wound inward)
  fsolid(f, 0, 0, .44, .44, 0, .9);
  return .475;
}
export function vending(x, z, ry, tex){
  const f = frame(x, z, ry);
  rb(f, 0, 0, 0, .9, 1.9, .75, .05, 0xc8463a, {seg:2, key:"paint"});
  rb(f, -.1, .5, .372, .58, 1.25, .01, .01, 0x0e1116);
  const [wx, wz] = worldPt(f, -.1, .38); label(tex, wx, f.y + 1.12, wz, .56, 1.2, f.ry, {glow:.9, rough:.15});
  rb(f, .32, .9, .376, .12, .3, .02, .01, 0x2b2f34);
  rb(f, -.1, .14, .376, .5, .16, .02, .02, 0x1b1d20);
  fsolid(f, 0, 0, .92, .78, 0, 1.9);
}
export function vendTex(){
  return textTex(256, 512, g => {
    const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, "#1a2840"); gr.addColorStop(1, "#0b1220"); g.fillStyle = gr; g.fillRect(0, 0, 256, 512);
    const cols = ["#1f6fd1", "#cf2f36", "#2fa86a", "#f2c230", "#8a4fd1"];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++){
      const x = 18 + c*58, y = 26 + r*92;
      g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(x - 6, y + 60, 54, 6);
      g.fillStyle = cols[(r + c) % cols.length]; g.fillRect(x + 6, y, 30, 58);
      g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(x + 9, y + 4, 5, 50);
    }
    g.fillStyle = "#c8f060"; g.font = "bold 22px sans-serif"; g.fillText("REFUEL", 70, 500);
  });
}
// a plyometric box, for jump work
export function plyoBox(x, z, ry, h = .6, color = 0x2b2f34){
  const f = frame(x, z, ry);
  rb(f, 0, 0, 0, .75, h, .6, .05, color, {seg:2});
  rb(f, 0, h - .02, 0, .7, .03, .55, .02, 0xc8f060);
  fsolid(f, 0, 0, .75, .6, 0, h);
}
/* a spin bike. The rider sits at the back (local +x) facing the bars (−x); the flywheel is at the front under the bars,
   and the cranks turn on a bottom bracket below and just ahead of the saddle. The cranks and the pedals are moving
   parts of their own (W.bikes), turned by whoever rides it: the feet go forward over the top, as on a real bike.
   o.tier (1–6): how worn it is: chipped paint and a rusty frame at the bottom, polished at the top */
export function bike(x, z, ry, o = {}){
  const f = frame(x, z, ry), t = o.tier || 3, old = t <= 2;
  const fr = old ? 0x5a5650 : t >= 5 ? 0x24272b : 0x3a3c3e, acc = old ? 0x6d7f7a : t >= 5 ? 0xc8f060 : PC.teal;
  const tube = (x0, y0, x1, y1, w, c = fr, oo = {}) => { const dx = x1 - x0, dy = y1 - y0; rb(f, (x0 + x1)/2, (y0 + y1)/2, oo.z || 0, Math.hypot(dx, dy) + w*.6, w, oo.d || w, w*.45, c, Object.assign({center:true, rz:Math.atan2(dy, dx)}, oo)); };
  // the feet and the beam between them
  rb(f, -.5, 0, 0, .1, .07, .56, .03, PC.dark); rb(f, .48, 0, 0, .1, .07, .56, .03, PC.dark);
  rb(f, -.01, .03, 0, 1.0, .07, .1, .03, PC.dark);
  // the frame: the stem up to the bars, a down tube to the bottom bracket, the seat tube up to the saddle, a strut behind
  tube(-.44, .06, -.46, 1.0, .07); tube(-.44, .62, -.02, .36, .065); tube(-.02, .36, .17, .78, .065); tube(.46, .07, .07, .56, .055);
  // the flywheel at the front, in a guard, with its hub
  cy(f, -.25, .42, 0, .23, .23, .045, acc, {seg:22, rx:Math.PI/2, key:t >= 4 ? "metal" : undefined});
  cy(f, -.25, .42, 0, .06, .06, .07, 0x1d1f22, {seg:12, rx:Math.PI/2});
  rb(f, -.25, .42, .045, .5, .5, .015, .2, fr, {center:true});
  // the saddle on its post, the bars with grips and a little console
  rb(f, .17, .79, 0, .27, .055, .16, .025, PC.black);
  tube(-.46, 1.0, -.36, 1.07, .05);
  rb(f, -.38, 1.05, 0, .07, .045, .54, .02, PC.steel, {key:"metal"});
  for (const s of [-1, 1]) rb(f, -.47, 1.05, s*.24, .16, .05, .05, .02, 0x1b1e20);
  rb(f, -.47, 1.1, 0, .07, .1, .14, .02, 0x1b1e20, {rz:.5});
  // the bottom bracket the cranks turn on
  cy(f, -.02, .36, 0, .045, .045, .2, 0x1d1f22, {seg:12, rx:Math.PI/2});
  if (old){                                  // tape on the saddle, rust round the feet
    rb(f, .17, .845, 0, .1, .01, .17, .004, 0x8a8a7a);
    for (const lx of [-.5, .48]) rb(f, lx, .07, 0, .08, .012, .4, .004, 0x7a4a2a);
  }
  fsolid(f, -.02, 0, 1.12, .56, 0, 1.1);
  // the moving parts: two crank arms on one spindle (left arm up, right down), each with a pedal that stays level
  const [bx, bz] = worldPt(f, -.02, 0), CR = .16;
  const crank = new THREE.Group(); crank.position.set(bx, f.y + .36, bz); crank.rotation.y = ry;
  const armM = lmat(0x2b2f34, {metalness:.6, roughness:.4}), pedM = lmat(0x1b1e20, {roughness:.7});
  const pedals = [];
  for (const s of [1, -1]){
    const arm = new THREE.Mesh(roundedBoxGeo(.035, CR + .04, .022, .01, 1), armM); arm.position.set(0, s*CR/2, s*.115); arm.castShadow = true; crank.add(arm);
    const p = new THREE.Group(); p.position.set(0, s*CR, s*.15);
    const pm = new THREE.Mesh(roundedBoxGeo(.1, .026, .075, .008, 1), pedM); pm.castShadow = true; p.add(pm);
    crank.add(p); pedals.push(p);
  }
  W.scene.add(crank);
  // a: the angle of the left pedal from the top, increasing forward (towards the bars)
  const B = {x, z, ry, crank, r:CR, set(a){ crank.rotation.z = a; for (const p of pedals) p.rotation.z = -a; }};
  B.set(.6); (W.bikes || (W.bikes = [])).push(B);
  return B;
}

/* ---------- outdoors ---------- */
export function tree(x, z, s = 1, tint = 0){
  const f = frame(x, z);
  // a street tree is crowned up: the lowest leaves well over a tall man's head, so nobody walks through the canopy
  cy(f, 0, 0, 0, .09*s, .16*s, 2.6*s, 0x5b4330, {seg:7, flat:true});
  const cols = [0x3f7a3a, 0x4a8740, 0x356b34, 0x5a9446], c = cols[(tint + Math.floor(Math.abs(x*7 + z*3))) % cols.length];
  sph(f, 0, 3.4*s, 0, 1.2*s, c, {detail:1, flat:true, sy:1.05});
  sph(f, .55*s, 3.0*s, .25*s, .8*s, c, {detail:1, flat:true});
  sph(f, -.5*s, 3.1*s, -.3*s, .78*s, c, {detail:1, flat:true});
  sph(f, .1*s, 4.1*s, -.15*s, .72*s, c, {detail:1, flat:true});
  solid(x - .2*s, x + .2*s, z - .2*s, z + .2*s, 0, 2.5*s);
}
export function bush(x, z, s = 1, y = 0){
  const f = frame(x, z, 0, y), c = [0x3f7a3a, 0x4a8740, 0x527f3c][Math.floor(Math.abs(x*3 + z*5)) % 3];
  sph(f, 0, .35*s, 0, .55*s, c, {detail:1, flat:true, sy:.75});
  sph(f, .45*s, .3*s, .1*s, .38*s, c, {detail:1, flat:true, sy:.8});
  sph(f, -.4*s, .28*s, -.1*s, .4*s, c, {detail:1, flat:true, sy:.8});
  solid(x - .75*s, x + .75*s, z - .45*s, z + .45*s, y, y + .7*s);
}
export function hedge(x0, z0, x1, z1, h = 1.1){
  const len = Math.hypot(x1 - x0, z1 - z0), f = frame((x0 + x1)/2, (z0 + z1)/2, Math.atan2(x1 - x0, z1 - z0) - Math.PI/2);
  rb(f, 0, 0, 0, len, h, .8, .3, 0x3d7438, {seg:2, flat:true});
  solid(Math.min(x0, x1) - .4, Math.max(x0, x1) + .4, Math.min(z0, z1) - .4, Math.max(z0, z1) + .4, 0, h);
}
// a modern street lamp. dir: which way the arm reaches (in z)
// a street lamp on the pavement, its head reaching out over the road: towards −z (dir 1) or +z (dir −1), or any way
// with ry (−π/2: towards +x, π/2: towards −x)
export function streetLamp(x, z, dir = 1, y = 0, ry){
  const f = frame(x, z, ry != null ? ry : dir > 0 ? 0 : Math.PI, y);
  cy(f, 0, 0, 0, .1, .13, .35, 0x2f3438, {seg:10});
  cy(f, 0, .35, 0, .055, .075, 5.0, 0x3b4146, {seg:10, key:"metal"});
  for (let i = 0; i < 5; i++){ const a = i/4*Math.PI/2; cy(f, 0, 5.3 + Math.sin(a)*.3, -(.3 - Math.cos(a)*.3), .045, .045, .2, 0x3b4146, {seg:8, rx:a}); }
  rb(f, 0, 5.52, -.95, .26, .1, .8, .05, 0x2a2e31, {key:"metal"});
  rb(f, 0, 5.49, -1.0, .2, .03, .6, .02, 0xfff1c8, {key:"street"});
  const [lx, lz] = worldPt(f, 0, -1.0);
  lightSrc({x:lx, y:y + 5.3, z:lz, color:0xffd9a0, intensity:14, distance:16, decay:1.5});
  pool(lx, lz, 4.4, y + .03);
  halo(lx, y + 5.42, lz, 1.5);
  solid(x - .14, x + .14, z - .14, z + .14, y, y + 5);
}
export function bollard(x, z, y = 0){ const f = frame(x, z, 0, y); cy(f, 0, 0, 0, .09, .11, .9, 0x2f3438, {seg:10}); cy(f, 0, .72, 0, .1, .1, .06, 0xd8dcd6, {seg:10}); solid(x - .12, x + .12, z - .12, z + .12, y, y + .9); }
export function bin(x, z, ry = 0, y = 0){
  const f = frame(x, z, ry, y);
  rb(f, 0, 0, 0, .5, .9, .45, .08, 0x2f5d3a, {seg:2, key:"paint"});
  rb(f, 0, .9, 0, .54, .06, .49, .03, 0x1f3a25);
  fsolid(f, 0, 0, .54, .49, 0, .96);
}
export function planter(x, z, w = 1.4, y = 0){
  const f = frame(x, z, 0, y);
  rb(f, 0, 0, 0, w, .5, .6, .06, 0x8a8780, {seg:1, flat:false, tex:"concrete"});
  rb(f, 0, .44, 0, w - .1, .05, .5, .02, 0x4a3a2c);
  bush(x, z, .7*w/1.4, y + .2);       // the shrub's own solid covers what spills over the sides
  solid(x - w/2, x + w/2, z - .3, z + .3, y, y + .5);
}
export function car(x, z, ry, color){
  const f = frame(x, z, ry);
  rb(f, 0, .22, 0, 4.1, .62, 1.76, .22, color, {seg:2, key:"paint"});
  rb(f, -.25, .8, 0, 2.3, .58, 1.56, .22, color, {seg:2, key:"paint"});
  rb(f, -.25, .84, 0, 2.18, .5, 1.6, .18, 0x1f2a34, {seg:1, key:"glass"});
  rb(f, 2.03, .52, 0, .06, .14, 1.4, .03, 0xf4f0d8, {key:"lamp"});
  rb(f, -2.03, .55, 0, .06, .12, 1.4, .03, 0xa52a2a);
  rb(f, 2.04, .28, 0, .08, .16, 1.6, .05, 0x1d1f22); rb(f, -2.04, .28, 0, .08, .16, 1.6, .05, 0x1d1f22);
  for (const [wx, wz] of [[1.3, .82], [-1.3, .82], [1.3, -.82], [-1.3, -.82]]){
    cy(f, wx, .33, wz, .33, .33, .24, 0x1c1d1f, {seg:14, rx:Math.PI/2});
    cy(f, wx, .33, wz + Math.sign(wz)*.02, .19, .19, .24, 0xb9bec2, {seg:10, rx:Math.PI/2, key:"metal"});
  }
  const hw = Math.abs(Math.cos(ry)) > .5 ? 2.1 : .9, hd = Math.abs(Math.cos(ry)) > .5 ? .9 : 2.1;
  solid(x - hw, x + hw, z - hd, z + hd, 0, 1.5);
}
// an open-fronted cabinet (a fridge body, a display case): back, sides, top and bottom, so what is inside shows
export function cabinet(f, w, h, d, color, o = {}){
  const t = o.t || .04;
  rb(f, 0, 0, -d/2 + t/2, w, h, t, .015, color, {key:o.key || "metal"});
  for (const s of [-1, 1]) rb(f, s*(w/2 - t/2), 0, 0, t, h, d, .015, color, {key:o.key || "metal"});
  rb(f, 0, h - t, 0, w, t, d, .015, color, {key:o.key || "metal"});
  rb(f, 0, 0, 0, w, .06, d, .015, o.base || 0x2b2f34);
  fsolid(f, 0, 0, w, d, 0, h);
}
export function sign(text, x, y, z, ry = 0, w = 1.6, o = {}){
  const bg = o.bg || "#14202c", fg = o.fg || "#ffffff", bar = o.bar || "#c8f060";
  const t = textTex(512, 128, g => {
    g.fillStyle = bg; g.fillRect(0, 0, 512, 128); g.fillStyle = bar; g.fillRect(0, 116, 512, 12);
    let fs = 64; g.font = `800 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    const tw = g.measureText(text).width; if (tw > 460){ fs = Math.floor(fs*460/tw); g.font = `800 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`; }
    g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 256, 60);
  });
  const f = frame(x, z, ry, y - w/8);
  if (o.double){
    // hung in the middle of a room: one panel with the words on both faces
    rb(f, 0, -.02, 0, w + .06, w/4 + .04, .04, .015, 0x1b2026);
    const [ax, az] = worldPt(f, 0, .022), [bx, bz] = worldPt(f, 0, -.022);
    label(t, bx, y, bz, w, w/4, ry + Math.PI, {glow:o.glow || 0, rough:.5});
    return label(t, ax, y, az, w, w/4, ry, {glow:o.glow || 0, rough:.5});
  }
  rb(f, 0, -.02, -.035, w + .06, w/4 + .04, .05, .02, 0x1b2026);
  const [wx, wz] = worldPt(f, 0, .0);
  return label(t, wx, y, wz, w, w/4, ry, {glow:o.glow || 0, rough:.5});
}
// a wire fence with posts, cut-out mesh between them
export function wireFence(x0, z0, x1, z1, h = 2.2){
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len/2.6));
  for (let i = 0; i <= n; i++){ const t = i/n, x = x0 + (x1 - x0)*t, z = z0 + (z1 - z0)*t; cy(frame(x, z), 0, 0, 0, .045, .05, h, 0x3d4347, {seg:8, key:"metal"}); }
  const m = mat({map:netTex(10, 1.4, "#5d666c"), transparent:true, alphaTest:.02, side:THREE.DoubleSide, roughness:.6, metalness:.4, depthWrite:false});
  m.map = m.map.clone(); m.map.repeat.set(len*1.5, h*1.5); m.map.needsUpdate = true;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(len, h - .1), m);
  p.position.set((x0 + x1)/2, h/2, (z0 + z1)/2); p.rotation.y = Math.atan2(-(z1 - z0), x1 - x0);
  W.scene.add(p);
  cy(frame((x0 + x1)/2, (z0 + z1)/2, Math.atan2(x1 - x0, z1 - z0)), 0, h - .03, 0, .03, .03, len, 0x3d4347, {seg:6, rx:Math.PI/2, key:"metal"});
  solid(Math.min(x0, x1) - .06, Math.max(x0, x1) + .06, Math.min(z0, z1) - .06, Math.max(z0, z1) + .06, 0, h);
}
export function parkingBays(x0, z0, n, w = 2.6, d = 5, dirZ = 1){
  for (let i = 0; i <= n; i++){
    const x = x0 + i*w;
    addGeo(new THREE.BoxGeometry(.1, .01, d).translate(x, .025, z0 + dirZ*d/2), 0xeeeeea, {ao:false, jit:0});
  }
  addGeo(new THREE.BoxGeometry(n*w, .01, .1).translate(x0 + n*w/2, .025, z0), 0xeeeeea, {ao:false, jit:0});
}
