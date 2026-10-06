/* ============ LIFE: what is in your flat ============
   Every piece of furniture in your flat is one of these: a bed, a fridge, a table, a chair... each of a tier (game.js
   FURN), standing where it was put. S.home.fx.furn is the list: {id, x, z, ry} — x and z in metres from the flat's
   corner (its west wall, its corridor wall), ry its turn in quarter turns' worth of radians. A piece with no place yet
   gets its usual one when the flat is built. furnish() puts the lot in the room; every piece is an object of its own
   (never poured into the static batches), so build mode can take one out and put it somewhere else. */
import {THREE, W, part, roundedBoxGeo, mergeGeos, mat, lmat, solid, spot, textTex, label, lightSrc} from "./build.js";
import {fillFridge} from "./fridge.js";
import {leafGuard} from "./home.js";

const G = () => (typeof S !== "undefined" ? S : null);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* ---------- a little kit for building a piece: parts of one colour (and finish) are merged into one mesh ---------- */
const FIN = {metal:{metalness:.7, roughness:.32}, gloss:{roughness:.25}, matte:{roughness:.92}, glass:{transparent:true, opacity:.35, roughness:.05, metalness:.1},
  lamp:{emissive:0xfff2d0, emissiveIntensity:.7}, led:{emissive:0xdff4ff, emissiveIntensity:.9}, fabric:{roughness:.95}, steel:{metalness:.55, roughness:.38}};
function kit(){
  const parts = new Map();
  const put = (c, g, o) => { const k = c + "|" + (o.fin || ""); if (!parts.has(k)) parts.set(k, {c, fin:o.fin, list:[]}); parts.get(k).list.push(g); };
  const turn = (g, o) => { if (o.rx) g.rotateX(o.rx); if (o.rz) g.rotateZ(o.rz); if (o.ry) g.rotateY(o.ry); return g; };
  return {
    // a rounded box, bottom at y (centred on it with o.center)
    rb(x, y, z, w, h, d, r, c, o = {}){ const g = turn(roundedBoxGeo(w, h, d, Math.max(.0015, Math.min(r, w/2 - .001, h/2 - .001, d/2 - .001)), o.seg || 1), o); g.translate(x, o.center ? y : y + h/2, z); put(c, g, o); },
    cy(x, y, z, rt, rb, h, c, o = {}){ const g = new THREE.CylinderGeometry(rt, rb, h, o.seg || 12); if (!o.rx && !o.rz) g.translate(0, h/2, 0); turn(g, o).translate(x, y, z); put(c, g, o); },
    sp(x, y, z, r, c, o = {}){ const g = new THREE.SphereGeometry(r, o.ws || 12, o.hs || 8); if (o.sx || o.sy || o.sz) g.scale(o.sx || 1, o.sy || 1, o.sz || 1); turn(g, o).translate(x, y, z); put(c, g, o); },
    geo(g, c, o = {}){ put(c, g, o); },
    build(group = new THREE.Group()){
      for (const {c, fin, list} of parts.values()){ const m = part(mergeGeos(list), c, {cast:fin !== "glass", mat:FIN[fin] || {}}); m.receiveShadow = true; group.add(m); }
      parts.clear(); return group;
    }
  };
}
// a sticker / label on a canvas, as a thin plane facing +z
function decal(tex, w, h, x, y, z){ const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat({map:tex, transparent:true, roughness:.8})); m.position.set(x, y, z); return m; }

/* ================= the beds =================
   Built round their middle, standing on y = 0, the head at local +z. w: width, len: length. */
const BED_LOOK = {
  1:{w:.9, len:1.95}, 2:{w:1.0, len:2.0}, 3:{w:1.0, len:2.0}, 4:{w:1.4, len:2.0}, 5:{w:1.6, len:2.05}, 6:{w:1.8, len:2.1}
};
export function bedModel(tier){
  const K = kit(), {w, len} = BED_LOOK[tier], g = new THREE.Group();
  if (tier === 1){
    // a thin, tired mattress straight on the floor: stained, a flat pillow, a thin grey blanket kicked into a heap
    K.rb(0, 0, 0, w, .15, len, .05, 0xcfc4a8, {seg:2, fin:"fabric"});
    for (const [x, z, r] of [[-.18, -.3, .16], [.22, .25, .11], [.05, -.65, .09]]) K.cy(x, .151, z, r, r*1.05, .002, 0xb5a582, {seg:10});
    K.rb(.02, .15, len/2 - .28, .58, .08, .32, .04, 0xe1d8bf, {fin:"fabric", ry:.08});
    K.rb(-.06, .15, -.3, w - .02, .05, .9, .03, 0x6f7275, {fin:"fabric", ry:-.06});
    K.rb(.18, .19, -.18, .5, .1, .4, .05, 0x666a6e, {fin:"fabric", ry:.4});
    K.rb(-.2, .17, -.5, .45, .08, .35, .04, 0x5f6366, {fin:"fabric", ry:-.3});
    return {g:K.build(g), w, len, h:.3};
  }
  const P = {2:{wood:0x8a5a35, dark:0x5e3c23, mat:.14, blanket:0x7a4b3b}, 3:{wood:0x8a5a35, dark:0x5e3c23, mat:.2, blanket:0x5a6b78},
    4:{wood:0x3b3f45, dark:0x2c2f33, mat:.22, blanket:0x2d4058}, 5:{wood:0x6f7c80, dark:0x3a3d40, mat:.26, blanket:0xeeece6}, 6:{wood:0x4a3426, dark:0x2b1f17, mat:.3, blanket:0xf4f2ec}}[tier];
  const top = .42 + P.mat;
  if (tier <= 4){
    // turned posts with a cap, side rails, a foot rail, a shaped headboard
    for (const [x, z, h] of [[-w/2, len/2, 1.05], [w/2, len/2, 1.05], [-w/2, -len/2, .78], [w/2, -len/2, .78]]){
      K.cy(x, 0, z, .042, .048, h, P.dark, {seg:10}); K.sp(x, h + .01, z, .05, P.dark, {ws:10, hs:6});
    }
    for (const x of [-w/2, w/2]) K.rb(x, .25, 0, .06, .18, len - .08, .02, P.wood);
    K.rb(0, .42, -len/2, w - .06, .16, .05, .02, P.wood);
    const sh = new THREE.Shape(); sh.moveTo(-w/2 + .04, 0); sh.lineTo(-w/2 + .04, .5); sh.quadraticCurveTo(0, .8, w/2 - .04, .5); sh.lineTo(w/2 - .04, 0); sh.lineTo(-w/2 + .04, 0);
    K.geo(new THREE.ExtrudeGeometry(sh, {depth:.05, bevelEnabled:true, bevelThickness:.012, bevelSize:.012, bevelSegments:1, curveSegments:8}).translate(0, .42, len/2 - .05), P.wood);
  } else {
    // an upholstered base on short feet, and a tall padded headboard (buttoned on the king)
    K.rb(0, .08, 0, w + .06, .34, len + .04, .05, P.wood, {seg:2, fin:"fabric"});
    for (const x of [-w/2, w/2]) for (const z of [-len/2, len/2]) K.cy(x, 0, z, .03, .025, .08, P.dark, {seg:8});
    const hb = tier === 6 ? 1.35 : 1.15;
    K.rb(0, .1, len/2 + .06, w + .18, hb, .12, .05, P.wood, {seg:2, fin:"fabric"});
    if (tier === 6) for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) K.sp(-w/2 + .15 + c*(w - .3)/4, .65 + r*.22, len/2, .018, P.dark, {ws:6, hs:4});
  }
  K.rb(0, .42, 0, w - .08, P.mat, len - .1, .05, 0xe9e4d6, {seg:2, fin:"fabric"});
  // the bedding: a blanket or duvet over the top and down the sides, folded back under the pillows
  K.rb(0, top - .005, -len*.12, w + .04, .05 + (tier >= 5 ? .04 : 0), len*.74, .025, P.blanket, {fin:"fabric"});
  for (const x of [-(w/2 + .005), w/2 + .005]) K.rb(x, top - .23, -len*.12, .03, .28, len*.74, .012, P.blanket, {fin:"fabric"});
  K.rb(0, top - .23, -len/2 - .005, w + .04, .26, .03, .012, P.blanket, {fin:"fabric"});
  K.rb(0, top + .005, len*.25 + .02, w + .04, .07, .16, .03, P.blanket, {fin:"fabric"});
  if (tier >= 5) K.rb(0, top + .05, -len*.36, w + .06, .03, .45, .015, tier === 6 ? 0x7a2f2f : 0x34506a, {fin:"fabric"});     // a throw across the foot
  const pil = tier >= 4 ? [-.25*w, .25*w] : [0], pw = tier >= 4 ? w*.42 : .62;
  for (const x of pil) K.rb(x, top + .02, len/2 - .32, pw, .12, .36, .05, 0xf1eee6, {fin:"fabric"});
  if (tier === 6) for (const x of [-.22*w, .22*w]) K.rb(x, top + .1, len/2 - .5, w*.3, .1, .14, .04, 0xc9a24a, {fin:"fabric", rx:-.4});
  return {g:K.build(g), w:tier >= 5 ? w + .06 : w, len:tier >= 5 ? len + .16 : len, h:tier >= 5 ? 1.5 : 1.05};
}

/* ================= the fridges =================
   Built round their middle, standing on y = 0, the doors on the front (local +z). Each door: its hinge side (+1 on the
   right as you face it, −1 on the left), its span across (x0–x1) and up (y0–y1). shelves: where the food stands inside
   (y, kind, slots in the fridge's own frame), behind the door(s) that open them. */
const FR = {
  1:{w:.62, d:.62, h:1.42, body:0xe6dcc0, fin:"", doors:[{hinge:1, x0:-.31, x1:.31, y0:.06, y1:1.36, name:"Fridge"}], inner:0xcfc8b4, lamp:0xe8e0c0,
    shelves:[{y:.08, kind:"food"}, {y:.5, kind:"food"}, {y:.92, kind:"drink"}]},
  2:{w:.7, d:.68, h:1.64, body:0xf2f2ee, fin:"gloss", doors:[{hinge:1, x0:-.35, x1:.35, y0:.07, y1:1.09, name:"Fridge"}, {hinge:1, x0:-.35, x1:.35, y0:1.14, y1:1.6, name:"Freezer"}],
    inner:0xf2f2ee, lamp:0xf5f5f0, shelves:[{y:.08, kind:"food"}, {y:.58, kind:"drink"}]},
  3:{w:.62, d:.66, h:1.85, body:0xf7f7f4, fin:"gloss", doors:[{hinge:1, x0:-.31, x1:.31, y0:.7, y1:1.82, name:"Fridge"}, {hinge:1, x0:-.31, x1:.31, y0:.06, y1:.66, name:"Freezer"}],
    inner:0xf4f6f6, lamp:0xf7fbff, shelves:[{y:.72, kind:"food"}, {y:1.12, kind:"food"}, {y:1.48, kind:"drink"}]},
  4:{w:.7, d:.7, h:1.9, body:0xb9bec2, fin:"steel", doors:[{hinge:1, x0:-.35, x1:.35, y0:.74, y1:1.86, name:"Fridge"}, {hinge:1, x0:-.35, x1:.35, y0:.06, y1:.7, name:"Freezer"}],
    inner:0xeef1f3, lamp:0xf2f8ff, shelves:[{y:.76, kind:"food"}, {y:1.16, kind:"food"}, {y:1.52, kind:"drink"}]},
  5:{w:.9, d:.72, h:1.88, body:0xaab0b5, fin:"steel", doors:[{hinge:-1, x0:-.45, x1:-.005, y0:.06, y1:1.84, name:"Freezer"}, {hinge:1, x0:.005, x1:.45, y0:.06, y1:1.84, name:"Fridge"}],
    inner:0xeef1f3, lamp:0xf2f8ff, shelves:[{y:.3, kind:"food", side:1}, {y:.72, kind:"food", side:1}, {y:1.14, kind:"drink", side:1}, {y:1.5, kind:"drink", side:1}]},
  6:{w:.92, d:.74, h:1.92, body:0x1d2126, fin:"gloss", glass:true, doors:[{hinge:-1, x0:-.46, x1:-.005, y0:.72, y1:1.88, name:"Fridge"}, {hinge:1, x0:.005, x1:.46, y0:.72, y1:1.88, name:"Fridge"}, {hinge:1, x0:-.46, x1:.46, y0:.06, y1:.68, name:"Freezer"}],
    inner:0x2a2f35, lamp:0xd8ecff, shelves:[{y:.74, kind:"food"}, {y:1.12, kind:"food"}, {y:1.48, kind:"drink"}]}
};
export function fridgeLook(tier){ return FR[tier]; }
function fridgeBody(tier){
  const L = FR[tier], K = kit(), {w, d, h} = L, fin = L.fin, b = L.body, fz = d/2;
  // the cabinet: sides, back and top, a dark kick plinth, the lit inside
  K.rb(-w/2 + .025, 0, 0, .05, h - .06, d, .018, b, {fin});
  K.rb(w/2 - .025, 0, 0, .05, h - .06, d, .018, b, {fin});
  K.rb(0, 0, -d/2 + .02, w - .04, h - .06, .04, .015, b, {fin});
  K.rb(0, h - .07, 0, w + .01, .07, d + .01, .028, b, {fin, seg:2});
  K.rb(0, 0, .02, w - .1, .06, d - .1, .02, 0x34363a);
  K.rb(0, .06, -d/2 + .045, w - .1, h - .14, .01, .004, L.lamp, {fin:tier === 6 ? "led" : "lamp"});
  K.rb(0, .06, 0, w - .1, .02, d - .1, .005, L.inner);
  for (const sh of L.shelves) if (sh.y > .1) K.rb(sh.side ? w/4 : 0, sh.y - .02, -.02, sh.side ? w/2 - .07 : w - .1, .015, d - .14, .004, tier === 1 ? 0xbdb6a2 : 0xd5e2e6, {fin:tier === 1 ? "" : "glass"});
  if (L.doors.length > 1 && L.doors[0].y1 < L.doors[1].y0 + .01 || tier === 3 || tier === 4 || tier === 6){ const y = tier === 2 ? 1.1 : tier === 6 ? .68 : tier >= 3 ? .66 : 0; if (y) K.rb(0, y, 0, w - .06, .045, d - .06, .01, b, {fin}); }
  if (tier === 5) K.rb(0, .06, 0, .02, h - .14, d - .08, .005, b, {fin});      // the wall between the two sides
  if (tier === 1){
    // rust where the paint has gone at the bottom and the corners, and a wheezing old compressor grille at the back
    for (const [x, y, ww, hh] of [[-.2, .02, .18, .06], [.22, .05, .1, .1], [-.31, .3, .02, .25], [.31, .7, .02, .18]]) K.rb(x, y, fz + .001, ww, hh, .004, .002, 0x8a4a22);
    for (let i = 0; i < 6; i++) K.rb(0, .2 + i*.1, -d/2 - .012, w*.7, .012, .012, .004, 0x3b3b3b);
  }
  const g = K.build();
  return g;
}
function fridgeDoor(tier, dd){
  const L = FR[tier], K = kit(), wv = dd.x1 - dd.x0, hh = dd.y1 - dd.y0, b = L.body, fin = L.fin;
  // the door hangs from its hinge: the leaf runs from 0 back across to -hinge·wv (the door group sits at the hinge)
  const cx = -dd.hinge*wv/2;
  if (L.glass){
    K.rb(cx, 0, .025, wv - .004, hh - .006, .05, .016, 0x2a2f35, {fin:"metal"});
    K.rb(cx, .05, .052, wv - .08, hh - .1, .004, .002, 0x101418, {fin:"gloss"});
  } else K.rb(cx, 0, .025, wv - .004, hh - .006, .05, .016, b, {fin, seg:2});
  K.rb(cx, .03, .002, wv - .06, hh - .06, .004, .002, L.inner);
  // the handle near the free edge
  const free = -dd.hinge*(wv - .07), hy = dd.name === "Freezer" && dd.y0 < .5 ? hh - .12 : dd.name === "Freezer" ? .18 : hh*.6;
  if (tier === 1){ K.rb(free, hh*.55, .06, .03, .12, .03, .008, 0xb9bec2, {fin:"metal"}); K.rb(-dd.hinge*wv*.4, hh*.35, .052, .14, .11, .004, .02, 0xd2c6a6); }
  else if (tier >= 4){ K.cy(free, hy - .25, .085, .012, .012, Math.min(.5, hh*.6), 0xd5d9dc, {fin:"metal", seg:8}); for (const k of [-1, 1]) K.cy(free, hy - .25 + (Math.min(.5, hh*.6)/2) + k*(Math.min(.5, hh*.6)/2 - .03), .066, .008, .008, .036, 0xd5d9dc, {fin:"metal", seg:6, rx:Math.PI/2}); }
  else { const hl = dd.name === "Fridge" ? .34 : .22; K.cy(free, hy - hl/2, .083, .011, .011, hl, 0xb9bec2, {fin:"metal", seg:8}); for (const k of [-1, 1]) K.cy(free, hy + k*(hl/2 - .03), .066, .008, .008, .036, 0xb9bec2, {fin:"metal", seg:6, rx:Math.PI/2}); }
  const grp = new THREE.Group(), leaf = K.build(new THREE.Group());
  leaf.position.y = dd.y0; grp.add(leaf);
  if (tier === 6 && dd.hinge > 0 && dd.name === "Fridge"){
    const t = textTex(128, 96, gg => { gg.fillStyle = "#0b1622"; gg.fillRect(0, 0, 128, 96); gg.fillStyle = "#6fd0ff"; gg.font = "bold 26px sans-serif"; gg.textAlign = "center"; gg.fillText("3°C", 64, 44); gg.font = "14px sans-serif"; gg.fillStyle = "#9fb6c8"; gg.fillText("FRESH · 110%", 64, 72); });
    const sc = decal(t, .16, .12, -wv*.3, dd.y0 + hh*.7, .056); sc.material.emissive = new THREE.Color(0xffffff); sc.material.emissiveMap = t; sc.material.emissiveIntensity = .9; grp.add(sc);
  }
  if (tier === 5 && dd.hinge < 0){ const K2 = kit(); K2.rb(-wv/2, hh*.55, .052, .2, .26, .02, .02, 0x2a2e33, {fin:"metal"}); grp.add(K2.build()); grp.children[grp.children.length - 1].position.y = dd.y0; }
  return {grp, leaf, wv, hh};
}

/* ================= the small furniture ================= */
function tableModel(){
  const K = kit(), WD = 0x9a6b42, WD2 = 0x6b4a2c, w = .83, d = .6;
  K.rb(0, .72, 0, w, .04, d, .018, WD); K.rb(0, .64, 0, w - .1, .08, d - .1, .016, WD2);
  for (const [x, z] of [[-w/2 + .065, -d/2 + .065], [w/2 - .065, -d/2 + .065], [-w/2 + .065, d/2 - .065], [w/2 - .065, d/2 - .065]]) K.cy(x, 0, z, .024, .017, .72, WD2, {seg:8});
  K.cy(.3, .76, -.16, .045, .045, .1, 0xe8e2d6, {seg:10});
  return {g:K.build(), w, len:d, h:.76, top:.76};
}
function chairModel(){
  // the seat faces local +z (you sit looking that way)
  const K = kit(), c0 = 0x7a5233, c1 = 0x5b3d24;
  K.rb(0, .43, 0, .43, .045, .44, .02, c0);
  for (const [x, z] of [[-.18, .18], [.18, .18], [-.18, -.18], [.18, -.18]]) K.cy(x, 0, z, .019, .015, .43, c1, {seg:8});
  for (const x of [-.18, .18]) K.cy(x, .43, -.19, .021, .017, .5, c1, {seg:8});
  for (const y of [.62, .8]) K.rb(0, y, -.19, .4, .09, .025, .012, c0);
  return {g:K.build(), w:.43, len:.44, h:.93};
}
function laptopModel(){
  // the screen at the back (local −z), facing +z
  const K = kit();
  K.rb(0, 0, 0, .36, .018, .25, .008, 0x2b2f34, {fin:"metal"});
  K.rb(0, .012, -.115, .36, .23, .012, .008, 0x2b2f34, {fin:"metal", rx:-.28});
  const g = K.build();
  const scr = textTex(256, 160, gg => { const gr = gg.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, "#14243a"); gr.addColorStop(1, "#0a1220"); gg.fillStyle = gr; gg.fillRect(0, 0, 256, 160);
    gg.fillStyle = "#c8f060"; gg.font = "bold 20px sans-serif"; gg.fillText("CLUB PORTAL", 16, 32); gg.fillStyle = "rgba(255,255,255,.75)"; for (let i = 0; i < 4; i++) gg.fillRect(16, 52 + i*24, 90 + (i*37) % 110, 8); });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(.32, .2), mat({kind:"screen", map:scr, emissive:0xffffff, emissiveMap:scr, emissiveIntensity:.9, roughness:.2}));
  m.position.set(0, .125, -.105); m.rotation.x = -.28; g.add(m);
  return {g, w:.36, len:.3, h:.26, small:true};
}
function sofaModel(){
  const K = kit(), c = 0x5a6b7a, c2 = 0x4a5a68, w = 1.5, d = .82;
  K.rb(0, .12, .02, w, .3, d - .04, .06, c2, {fin:"fabric", seg:2});
  for (const x of [-.36, .36]) K.rb(x, .42, .06, .7, .14, d - .2, .06, c, {fin:"fabric", seg:2});
  K.rb(0, .42, -d/2 + .11, w - .04, .48, .2, .07, c, {fin:"fabric", seg:2});
  for (const x of [-w/2 + .08, w/2 - .08]) K.rb(x, .12, 0, .16, .52, d, .06, c2, {fin:"fabric", seg:2});
  for (const x of [-w/2 + .1, w/2 - .1]) for (const z of [-d/2 + .1, d/2 - .1]) K.cy(x, 0, z, .025, .02, .12, 0x2b2f34, {seg:8});
  K.rb(-.45, .56, -d/2 + .26, .36, .3, .1, .05, 0xc9a24a, {fin:"fabric", rx:-.3});
  return {g:K.build(), w, len:d, h:.9};
}
function wardrobeModel(){
  const K = kit(), c = 0xb08a5e, c2 = 0x8a6a44, w = 1.0, d = .58, h = 2.0;
  K.rb(0, 0, 0, w, h, d, .02, c);
  K.rb(0, h, 0, w + .03, .04, d + .03, .015, c2);
  for (const x of [-w/4, w/4]){ K.rb(x, .1, d/2, w/2 - .02, h - .16, .015, .006, c2); K.cy(x + (x < 0 ? .2 : -.2), 1.0, d/2 + .03, .012, .012, .2, 0xc9a24a, {fin:"metal", seg:6}); }
  return {g:K.build(), w, len:d, h};
}
function shelfModel(){
  const K = kit(), c = 0x8a6a44, w = .8, d = .32, h = 1.6;
  for (const x of [-w/2 + .02, w/2 - .02]) K.rb(x, 0, 0, .03, h, d, .008, c);
  for (let i = 0; i < 5; i++) K.rb(0, .05 + i*.38, 0, w - .02, .025, d, .006, c);
  const cols = [0xc8463a, 0x2c66b8, 0xf2c230, 0x3f9a52, 0xe6e2d8];
  for (let i = 0; i < 9; i++) K.rb(-w/2 + .08 + (i % 5)*.12, .075 + Math.floor(i/5)*.38, 0, .05, .22 + (i % 3)*.03, .2, .004, cols[i % 5]);
  K.cy(.2, .835, 0, .05, .06, .16, 0xc9a24a, {fin:"metal", seg:10});
  return {g:K.build(), w, len:d, h};
}
function rugModel(){ const K = kit(); K.rb(0, .02, 0, 1.7, .008, 1.2, .004, 0x7b3b33, {fin:"fabric"}); K.rb(0, .0215, 0, 1.4, .008, .9, .004, 0xa3574a, {fin:"fabric"}); return {g:K.build(), w:1.7, len:1.2, h:.03, flat:true}; }
function plantModel(){
  const K = kit();
  K.cy(0, 0, 0, .16, .12, .3, 0xb8643a, {seg:12}); K.cy(0, .29, 0, .17, .17, .03, 0x8a4a2a, {seg:12});
  for (let i = 0; i < 7; i++){ const a = i/7*Math.PI*2; K.sp(Math.cos(a)*.12, .55 + (i % 3)*.12, Math.sin(a)*.12, .13, [0x3f7a3a, 0x4a8740, 0x356b34][i % 3], {ws:7, hs:5}); }
  return {g:K.build(), w:.4, len:.4, h:.9};
}
function lampModel(){
  const K = kit();
  K.cy(0, 0, 0, .16, .18, .03, 0x2b2f34, {seg:16}); K.cy(0, .03, 0, .015, .015, 1.45, 0x2b2f34, {fin:"metal", seg:8});
  K.cy(0, 1.42, 0, .14, .22, .26, 0xf2ead8, {seg:16});
  return {g:K.build(), w:.36, len:.36, h:1.7, light:{y:1.45}};
}
function tvModel(){
  const K = kit(), w = 1.1;
  K.rb(0, 0, 0, w, .45, .4, .02, 0x3b3f45);
  K.rb(0, .45, -.05, .3, .04, .2, .01, 0x1d1f22); K.rb(0, .49, -.05, .06, .12, .04, .01, 0x1d1f22);
  K.rb(0, .6, -.05, w - .05, .58, .05, .01, 0x111316, {fin:"gloss"});
  const g = K.build();
  const t = textTex(256, 144, gg => { const gr = gg.createLinearGradient(0, 0, 256, 144); gr.addColorStop(0, "#1f6f43"); gr.addColorStop(1, "#0d2a1a"); gg.fillStyle = gr; gg.fillRect(0, 0, 256, 144);
    gg.strokeStyle = "rgba(255,255,255,.7)"; gg.lineWidth = 3; gg.strokeRect(30, 20, 196, 104); gg.beginPath(); gg.moveTo(128, 20); gg.lineTo(128, 124); gg.stroke(); gg.beginPath(); gg.arc(128, 72, 20, 0, 7); gg.stroke(); });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w - .1, .52), mat({kind:"screen", map:t, emissive:0xffffff, emissiveMap:t, emissiveIntensity:.8, roughness:.2}));
  m.position.set(0, .89, -.022); g.add(m);
  return {g, w, len:.4, h:1.2};
}
export function pieceModel(id){
  const f = typeof FURN === "object" ? FURN[id] : null; if (!f) return null;
  switch (f.kind){
    case "bed": return bedModel(f.tier);
    case "fridge": { const L = FR[f.tier], g = fridgeBody(f.tier); return {g, w:L.w, len:L.d, h:L.h, fridge:L}; }
    case "table": return tableModel();
    case "chair": return chairModel();
    case "laptop": return laptopModel();
    case "sofa": return sofaModel();
    case "wardrobe": return wardrobeModel();
    case "shelf": return shelfModel();
    case "rug": return rugModel();
    case "plant": return plantModel();
    case "lamp": return lampModel();
    case "tv": return tvModel();
  }
  return null;
}

/* ================= the flat: where each piece goes =================
   FL: {A, base, s, Wd, Dp, X(u), Z(v)} from home.js. A piece's place: (x, z) = (A.x0 + p.x, A.wz + p.z), turned by p.ry. */
let FL = null, CTX = null;
export const placed = [];        // what is standing in the flat now: {p, f, model, g, solids, spots, anims, ...}
export function flatOf(){ return FL; }
// the usual place for a piece, in the flat's own terms
function usual(p, m){
  const {Wd, Dp, s} = FL, k = FURN[p.id].kind, at = (u, v, ry) => ({x:u, z:s*v, ry});
  const tv0 = Dp - 1.65, tv1 = Dp - 1.05;
  switch (k){
    case "bed": return at(Wd - m.w/2 - .12, Dp - m.len/2 - .12, s > 0 ? 0 : Math.PI);
    case "fridge": return at(Wd - m.len/2 - .005, 1.55, -Math.PI/2);
    case "table": return at(.535, (tv0 + tv1)/2, 0);
    case "chair": return at(1.235, tv0 + .3, -Math.PI/2);
    case "laptop": return at(.53, tv0 + .3, Math.PI/2);
    case "sofa": return at(Wd*.55, Dp - .55, s > 0 ? Math.PI : 0);
    case "wardrobe": return at(2.75, 2.6, s > 0 ? 0 : Math.PI);
    case "rug": return at(1.15, Dp - 1.4, 0);
    default: return at(Wd*.5, Dp*.6, 0);
  }
}
// the box a piece of footprint w × len stands in, turned by ry (a quarter turn swaps the sides)
export function footprint(x, z, ry, w, len){
  const q = Math.round(ry/(Math.PI/2)) & 1, hw = (q ? len : w)/2, hd = (q ? w : len)/2;
  return {x0:x - hw, x1:x + hw, z0:z - hd, z1:z + hd};
}
// what stands where the laptop would go: the top of a table under it, else the floor
function surfaceAt(x, z, self){
  for (const q of placed){
    if (q === self || !q.model.top) continue;
    const b = footprint(q.wx, q.wz, q.p.ry, q.model.w, q.model.len);
    if (x > b.x0 - .02 && x < b.x1 + .02 && z > b.z0 - .02 && z < b.z1 + .02) return q.model.top;
  }
  return 0;
}
export function furnish(F, ctx){
  FL = F; CTX = ctx; placed.length = 0;
  const fx = G().home.fx;
  // big things first, so a laptop knows which table it is on
  const order = p => FURN[p.id] && FURN[p.id].kind === "laptop" ? 1 : 0;
  for (const p of fx.furn.slice().sort((a, b) => order(a) - order(b))) placePiece(p);
}
export function placePiece(p){
  const f = FURN[p.id]; if (!f) return null;
  const m = pieceModel(p.id); if (!m) return null;
  if (p.x == null || p.z == null || p.ry == null) Object.assign(p, usual(p, m));
  const {A, base} = FL, wx = A.x0 + p.x, wz = A.wz + p.z;
  const g = m.g; g.position.set(wx, base, wz); g.rotation.y = p.ry;
  const q = {p, f, model:m, g, wx, wz, solids:[], spots:[], anims:[], lights:[]};
  placed.push(q);
  if (f.kind === "laptop"){ const y = surfaceAt(wx, wz, q); g.position.y = base + y; q.y = y; }
  W.scene.add(g);
  const b = footprint(wx, wz, p.ry, m.w, m.len);
  if (!m.flat && !m.small) q.solids.push(solid(b.x0, b.x1, b.z0, b.z1, base, base + Math.min(m.h, 1.9)));
  const on = KIND[f.kind]; if (on) on(q, b);
  return q;
}
// take a piece out of the room again (build mode): its meshes, its collision, what you could do with it
export function removePiece(q){
  if (q.remove) q.remove();
  W.scene.remove(q.g); q.g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  for (const s of q.solids){ s.off = true; const i = W.solids.indexOf(s); if (i >= 0) W.solids.splice(i, 1); }
  W.spots = W.spots.filter(sp => !q.spots.includes(sp));
  for (const a of q.anims){ const i = W.anims.indexOf(a); if (i >= 0) W.anims.splice(i, 1); }
  for (const l of q.lights){ l.dead = true; const i = W.lights.indexOf(l); if (i >= 0) W.lights.splice(i, 1); }
  const i = placed.indexOf(q); if (i >= 0) placed.splice(i, 1);
}
const addSpot = (q, o) => { const sp = spot(o); q.spots.push(sp); return sp; };

/* ---------- what each kind of piece does ---------- */
const KIND = {
  bed(q, b){
    const t = q.f.tier, base = FL.base;
    addSpot(q, {x:q.wx, y:base + .5, z:q.wz, aim:[[b.x0, base, b.z0], [b.x1, base + (t === 1 ? .45 : .9), b.z1]],
      label:t === 1 ? "Mattress" : "Bed", get hint(){ const m = CTX.minute() % 1440; return m >= 19*60 || m < 5*60 ? "Sleep · wake tomorrow at 7:00 AM" : "Have a nap · 2 hours"; }, hold:1.2,
      run:() => CTX.sleep(), long:{time:2, label:"sleep through the entire day", run:() => CTX.sleepDay()}});
  },
  fridge(q){
    const t = q.f.tier, L = FR[t], base = FL.base, g = q.g, ry = g.rotation.y;
    g.updateMatrixWorld(true);
    const keep = FRIDGE_KEEP[t - 1], keepTxt = `keeps ${Math.round(keep*100)}%`;
    const doors = L.doors.map(dd => {
      const {grp, leaf, wv, hh} = fridgeDoor(t, dd);
      const hx = dd.hinge > 0 ? dd.x1 : dd.x0;
      grp.position.set(hx, 0, L.d/2); g.add(grp);
      const Dd = {grp, leaf, a:0, target:0, dd};
      g.updateMatrixWorld(true);
      // the leaf's direction in the world at angle a: closed it runs back across the front (−hinge along x); it opens
      // outwards, away from the fridge
      const hw = new THREE.Vector3(hx, 0, L.d/2).applyMatrix4(g.matrixWorld);
      const dirOf = a => { const lx = -dd.hinge*Math.cos(a), lz = Math.sin(a); return [lx*Math.cos(ry) + lz*Math.sin(ry), -lx*Math.sin(ry) + lz*Math.cos(ry)]; };
      const guard = leafGuard(hw.x, hw.z, wv, base + dd.y0, base + dd.y1, 7, .085);
      q.solids.push(...guard.sols);
      const turnTo = a => { Dd.a = guard.reach(Dd.a, a, dirOf); };
      const an = dt => {
        if (Math.abs(Dd.target - Dd.a) > 1e-4) turnTo(Dd.a + (Dd.target - Dd.a)*(1 - Math.exp(-7*dt)));
        grp.rotation.y = dd.hinge*Dd.a;
        const [ux, uz] = dirOf(Dd.a); guard.set(ux, uz, Dd.a > .06, dt);
      };
      W.anims.push(an); q.anims.push(an);
      const box3 = new THREE.Box3();
      addSpot(q, {kind:"drag", label:dd.name, get hint(){ return Dd.a > .5 ? "Close it" : `Open it · ${FURN[q.p.id].name.toLowerCase()} · ${keepTxt}`; }, y:base + dd.y0 + hh/2,
        aim:() => { grp.updateMatrixWorld(); box3.setFromObject(leaf); box3.expandByScalar(.03); return [box3.min.toArray(), box3.max.toArray()]; },
        spin:dd.hinge, get angle(){ return Dd.a; }, toggle(){ Dd.target = Dd.a > .5 ? 0 : 1.75; },
        drag(da){ turnTo(Math.max(0, Math.min(1.9, Dd.a + da))); Dd.target = Dd.a; },
        hinge(){ return grp.getWorldPosition(new THREE.Vector3()); },
        edge(){ grp.updateMatrixWorld(); return grp.localToWorld(new THREE.Vector3(-dd.hinge*wv*.95, dd.y0 + hh/2, .05)); }});
      return Dd;
    });
    // the food: on shelves behind the door(s) that open them, seen and taken while one is open
    const items = new THREE.Group(); W.scene.add(items);
    const W4 = (lx, lz) => { const v = new THREE.Vector3(lx, 0, lz).applyMatrix4(g.matrixWorld); return [v.x, v.z]; };
    const shelves = L.shelves.map(sh => {
      const x0 = sh.side ? .05 : -L.w/2 + .12, x1 = L.w/2 - .12, n = sh.side ? 2 : 3;
      const slots = [];
      for (let row = 0; row < 2; row++) for (let c = 0; c < n; c++) slots.push(W4(x0 + (x1 - x0)*(n === 1 ? .5 : c/(n - 1)), L.d/2 - .16 - row*.2));
      return {y:base + sh.y, kind:sh.kind, slots};
    });
    const lo = new THREE.Vector3(-L.w/2, .06, -L.d/2).applyMatrix4(g.matrixWorld), hi = new THREE.Vector3(L.w/2, Math.min(1.3, L.h), L.d/2).applyMatrix4(g.matrixWorld);
    const ax = W4(.045, 0), a0 = W4(0, 0);
    const fill = {group:items, ctx:CTX, open:() => doors.some(D => D.a > 1.0), ry, shelves, across:[ax[0] - a0[0], ax[1] - a0[1]], mult:() => fridgeMult(t),
      emptyAim:[[Math.min(lo.x, hi.x), base + .06, Math.min(lo.z, hi.z)], [Math.max(lo.x, hi.x), base + 1.3, Math.max(lo.z, hi.z)]], label:FURN[q.p.id].name};
    q.fridge = {doors, items, fill, tier:t};
    // where you stand to put food away: in front of it
    const fr = W4(0, L.d/2 + .45); q.front = {x:fr[0], z:fr[1], y:base, name:"your fridge", mult:() => fridgeMult(t)};
    (W.fridges || (W.fridges = [])).push(q.front);
    fillFridge(fill);
    q.remove = () => { W.scene.remove(items); items.traverse(o => { if (o.geometry) o.geometry.dispose(); }); W.spots = W.spots.filter(sp => sp.fridge !== fill); W.fridges = (W.fridges || []).filter(f => f !== q.front); };
  },
  laptop(q){
    const base = FL.base + (q.y || 0);
    addSpot(q, {aim:[[q.wx - .25, base - .05, q.wz - .25], [q.wx + .25, base + .3, q.wz + .25]], label:"Laptop", hint:"Check your stats, your week and your career", hold:.2, run:() => CTX.computer("home")});
  },
  chair(q, b){ addSpot(q, {aim:[[b.x0, FL.base, b.z0], [b.x1, FL.base + .9, b.z1]], label:"Chair", hint:"Sit down and let time pass", hold:.2, run:() => CTX.wait("home")}); },
  sofa(q, b){ addSpot(q, {aim:[[b.x0, FL.base, b.z0], [b.x1, FL.base + .9, b.z1]], label:"Sofa", hint:"Put your feet up and let time pass", hold:.2, run:() => CTX.wait("home")}); },
  tv(q, b){ addSpot(q, {aim:[[b.x0, FL.base, b.z0], [b.x1, FL.base + 1.2, b.z1]], label:"TV", hint:"Watch the highlights and let time pass", hold:.2, run:() => CTX.wait("home")}); },
  wardrobe(q, b){ addSpot(q, {aim:[[b.x0, FL.base, b.z0], [b.x1, FL.base + 2, b.z1]], label:"Wardrobe", hint:"Change what you're wearing", hold:.2, run:() => { if (CTX.look) CTX.look(); }}); },
  lamp(q){
    const base = FL.base, l = lightSrc({x:q.wx, y:base + 1.45, z:q.wz, color:0xffd7a0, intensity:4, distance:6, decay:1.6, indoor:true, on:() => !!(G().home.fx.lampOn && powerOn())});
    q.lights.push(l);
    addSpot(q, {aim:[[q.wx - .25, base, q.wz - .25], [q.wx + .25, base + 1.75, q.wz + .25]], label:"Floor lamp", get hint(){ return G().home.fx.lampOn ? "Switch it off" : "Switch it on"; }, hold:.1,
      run:() => { const fx = G().home.fx; if (!powerOn()) return CTX.note("Nothing. The power's off in the whole block today."); fx.lampOn = !fx.lampOn; }});
  }
};
// how much of its food's goodness the fridge keeps right now (the power off: less again)
export function fridgeMult(t){ return FRIDGE_KEEP[clamp(t, 1, 6) - 1]*(powerOn() ? 1 : .7); }
// is there electricity in your block today? (events.js turns it off for a day now and then)
export function powerOn(){ return !(typeof lifeEventOn === "function" && lifeEventOn("power")); }

/* ---------- reading the flat ---------- */
export const pieceOf = kind => placed.find(q => q.f.kind === kind) || null;
export function bedTierNow(){ const fx = G() && G().home && G().home.fx; const b = fx && fx.furn.find(p => FURN[p.id] && FURN[p.id].kind === "bed"); return b ? FURN[b.id].tier : 1; }
export function fridgeTierNow(){ const fx = G() && G().home && G().home.fx; const b = fx && fx.furn.find(p => FURN[p.id] && FURN[p.id].kind === "fridge"); return b ? FURN[b.id].tier : 1; }
