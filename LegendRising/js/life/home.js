/* ============ LIFE: the neighbourhood ============
   A few streets of brick blocks. Only one door in the whole street is yours: the block on the near
   side, flat number on the mailbox in the lobby, up the stairs, your floor, your door. */
import {THREE, W, LH, box, cyl, blob, solid, floor, spot, wall, textTex, label, labels, part, boxPart, boxGeo, mergeGeos, mat, lmat, reseed, rnd, pick, finishBatches, lightSrc, rbox, beam, extrude, flight, stringer, doorway, slab, roundedBoxGeo, addGeo, tex} from "./build.js";
import {ensureHome, unread, owed} from "./rent.js";
import {onYou} from "./inv.js";
import {frame, rb, cy, worldPt, tree as propTree, streetLamp, bin, bollard, planter, bench as propBench, ball as propBall, PC} from "./props.js";
import {miniMarket} from "./shops.js";
import {jobUnit, TX} from "./units.js";
import {barbershop} from "./barber.js";
import {furnitureStore} from "./store.js";
import {extendStreets, parked} from "./roads.js";
import {fillFridge} from "./fridge.js";
import {furnish, pieceOf, bedTierNow, footprint, powerOn} from "./furniture.js";
import {deliveryPoint} from "./parcels.js";
import {car as carModel} from "./cars.js";
import {pedestrians, VIEW} from "./npc.js";
import {SG} from "./core/collide.js";

const C = {
  brick:[0xb04a3c, 0x9c4e38, 0xc06a44, 0x96463c, 0xd2c09a, 0x8d9aa4],
  trim:0x3b3431, stone:0xddd6c8, plinth:0xa29d94, frame:0xf3f1ec, glass:0x3a4a58, sill:0xd6d0c2, roof:0x5a5d61, coping:0x4f555b,
  door:0x2a2b2f, garage:0x3a3e43, metal:0x8f979e, darkMetal:0x4b5258, blind:0xd8d0bc,
  green:0x5f806b, cream:0xece4d0, ceiling:0xe6e2da, step:0xb4afa6, closet:0x7c6a55, lino:0x7a6650,
  wood:0x8b5a2b, wood2:0x6b4422, blanket:0x2f6a3b, white:0xf3f3ef, fridge:0xe9ddb0, handle:0x4a3324, fabric:0x8b8273
};
// the reds are brick; the sand and the grey are rendered
const wallTex = c => c === C.brick[4] || c === C.brick[5] ? "paint" : "brick";
const BLD = {x0:-14, x1:0, z0:-9, z1:3};
const H4 = 4*LH;
const G0 = .27;                   // the ground floor of your block: one step up from the pavement
const LOBBY_WIN = [-7.65, -6.55, .9, 2.35];
/* the four flats on every floor: front two look onto the street, back two onto the yard */
export const APT = {
  1:{x0:-13.75, x1:-7.1,  door:-10.4, wz:-2.1, ext:2.75,  s:1},
  2:{x0:-6.9,   x1:-0.25, door:-3.6,  wz:-2.1, ext:2.75,  s:1},
  3:{x0:-9.625, x1:-5.1,  door:-6.4,  wz:-4.2, ext:-8.75, s:-1},   // the narrow one: the door kept clear of the fridge
  4:{x0:-4.9,   x1:-0.25, door:-1.5,  wz:-4.2, ext:-8.75, s:-1}
};
const winsOf = d => { const a = APT[d], w = a.x1 - a.x0; return [a.x0 + w*.3, a.x0 + w*.7]; };

const G = () => (typeof S !== "undefined" ? S : null);
let ctx = null, H = null;
export const HOME = {door:null, entrance:null, fridge:null, curtains:[], light:null, bed:null, mailTex:null, clock:null, street:null, mirror:null, pane:null, plate:null, slam:null, win:null, flat:null};

/* ================= facades =================
   A facade is dressed in layers that stand a few centimetres proud of the wall, so nothing shares a face with
   anything else: a darker base course, light stone round the corners, a band over the shops, window surrounds
   with a sill and a lintel, a cornice, and a parapet with a metal coping that overhangs on both sides. */
export function facer(face, b){
  switch (face){
    case "+z": return {len:b.x1 - b.x0, box:(s0, s1, y0, y1, d0, d1, c, o) => box(b.x0 + s0, y0, b.z1 + d0, b.x0 + s1, y1, b.z1 + d1, c, o), at:(s, d) => [b.x0 + s, b.z1 + d]};
    case "-z": return {len:b.x1 - b.x0, box:(s0, s1, y0, y1, d0, d1, c, o) => box(b.x1 - s1, y0, b.z0 - d1, b.x1 - s0, y1, b.z0 - d0, c, o), at:(s, d) => [b.x1 - s, b.z0 - d]};
    case "+x": return {len:b.z1 - b.z0, box:(s0, s1, y0, y1, d0, d1, c, o) => box(b.x1 + d0, y0, b.z1 - s1, b.x1 + d1, y1, b.z1 - s0, c, o), at:(s, d) => [b.x1 + d, b.z1 - s]};
    case "-x": return {len:b.z1 - b.z0, box:(s0, s1, y0, y1, d0, d1, c, o) => box(b.x0 - d1, y0, b.z0 + s0, b.x0 - d0, y1, b.z0 + s1, c, o), at:(s, d) => [b.x0 - d, b.z0 + s]};
  }
}
// a horizontal band along a facade, broken where there are openings (gaps: [[s0, s1]])
function band(f, s0, s1, y0, y1, d0, d1, c, gaps = [], o = {ao:false}){
  let cur = s0;
  for (const [g0, g1] of gaps.slice().sort((p, q) => p[0] - q[0])){ if (g0 > cur) f.box(cur, Math.min(g0, s1), y0, y1, d0, d1, c, o); cur = Math.max(cur, g1); }
  if (s1 > cur) f.box(cur, s1, y0, y1, d0, d1, c, o);
}
export function decoWin(f, s, y, lit){
  const w = 1.1, h = 1.45, b = y + .9, t = b + h, fr = .07, O = {jit:0, ao:false};
  // the pane: glossy dark glass, or a lit room at night; now and then a blind half down behind it
  f.box(s - w/2 + .03, s + w/2 - .03, b + .03, t - .03, .004, .014, lit ? 0x3a4a58 : C.glass, {key:lit ? "lit" : "gloss", jit:.25, ao:false});
  if (rnd() < .45){ const bl = h*(.15 + rnd()*.5); f.box(s - w/2 + fr, s + w/2 - fr, t - fr - bl, t - fr, .014, .02, rnd() < .5 ? C.blind : 0xe9e6de, O); }
  // the frame, a mullion and a transom
  f.box(s - w/2, s - w/2 + fr, b, t, 0, .06, C.frame, O); f.box(s + w/2 - fr, s + w/2, b, t, 0, .06, C.frame, O);
  f.box(s - w/2 + fr, s + w/2 - fr, t - fr, t, 0, .06, C.frame, O); f.box(s - w/2 + fr, s + w/2 - fr, b, b + fr, 0, .06, C.frame, O);
  f.box(s - .03, s + .03, b + fr, t - fr, 0, .05, C.frame, O);
  f.box(s - w/2 + fr, s + w/2 - fr, b + h*.66, b + h*.66 + .045, 0, .045, C.frame, O);
  // the stone surround: jambs, a sill with a drip, a lintel
  f.box(s - w/2 - .1, s - w/2, b, t, 0, .035, C.stone, O); f.box(s + w/2, s + w/2 + .1, b, t, 0, .035, C.stone, O);
  f.box(s - w/2 - .16, s + w/2 + .16, b - .07, b, 0, .14, C.sill, O);
  f.box(s - w/2 - .14, s + w/2 + .14, b - .1, b - .07, .02, .12, C.sill, Object.assign({shade:.85}, O));
  f.box(s - w/2 - .14, s + w/2 + .14, t, t + .18, 0, .05, C.stone, O);
}
// a door you are not let through: lining, a glazed or panelled leaf, a canopy, and a stone step you can stand on
function doorDeco(f, s, glassy){
  const O = {jit:0, ao:false};
  f.box(s - .6, s + .6, G0, 2.42, .004, .025, glassy ? 0x33414d : C.door, O);
  if (glassy) f.box(s - .48, s + .48, .95, 2.25, .025, .031, 0x7f98aa, {key:"glass", ao:false});
  else { f.box(s - .48, s + .48, 1.45, 2.25, .025, .035, 0x3a3d42, O); f.box(s - .48, s + .48, .5, 1.3, .025, .035, 0x3a3d42, O); }
  f.box(s - .74, s - .6, 0, 2.56, 0, .07, C.stone, O); f.box(s + .6, s + .74, 0, 2.56, 0, .07, C.stone, O);
  f.box(s - .74, s + .74, 2.42, 2.56, 0, .07, C.stone, O);
  rboxF(f, s, 2.82, .55, 2.3, .14, 1.1, C.coping);                                        // the canopy
  f.box(s - .7, s + .7, 2.80, 2.82, .2, .9, 0xfff3d6, {key:"lamp", ao:false});            // set into its underside
  f.box(s + .38, s + .44, .98, 1.14, .025, .06, C.metal, {key:"metal", ao:false});           // handle
  stepF(f, s - 1.05, s + 1.05, 0, 1.0, G0);
}
// a rounded slab on a facade (canopies), centred at s, d out from the wall
function rboxF(f, s, y, d, w, h, depth, c, o = {}){
  const [x0, z0] = f.at(s - w/2, 0), [x1, z1] = f.at(s + w/2, depth), cx = (x0 + x1)/2, cz = (z0 + z1)/2;
  const xw = Math.abs(x1 - x0), zw = Math.abs(z1 - z0);
  rbox(cx, y, cz, xw, h, zw, Math.min(.05, h/2 - .01), c, Object.assign({jit:0}, o));
}
// a stone step in front of a door, with the floor you stand on
function stepF(f, s0, s1, d0, d1, top){
  // the tread stops at the nosing, and under the nosing the riser is cut down to meet it: no two faces share a plane
  f.box(s0, s1, 0, top, d0, d1 - .03, C.step, {tex:"concrete", jit:0, ao:false});
  f.box(s0, s1, 0, top - .03, d1 - .03, d1, C.step, {tex:"concrete", jit:0, ao:false});
  f.box(s0 - .02, s1 + .02, top - .03, top, d1 - .03, d1 + .02, 0xc7c2b8, {ao:false, jit:0});
  const [x0, z0] = f.at(s0, d0), [x1, z1] = f.at(s1, d1);
  floor(x0, x1, z0, z1, top);
}
function garageDeco(f, s0, s1){
  const O = {ao:false, jit:0};
  f.box(s0, s1, 0, 2.6, .004, .022, C.garage, O);
  for (let y = .22; y < 2.6; y += .22) f.box(s0, s1, y, y + .025, .022, .032, 0x2a2d31, O);
  f.box(s0 - .12, s0, 0, 2.72, 0, .07, C.stone, O); f.box(s1, s1 + .12, 0, 2.72, 0, .07, C.stone, O); f.box(s0 - .12, s1 + .12, 2.6, 2.72, 0, .07, C.stone, O);
  f.box(s0 + .2, s0 + .5, 2.66, 2.72, .07, .12, 0xfff3d6, {key:"lamp", ao:false});
}
function ladder(f, s, h){
  for (const k of [-.24, .24]) f.box(s + k - .03, s + k + .03, 2.4, h + .9, .18, .24, C.darkMetal, {ao:false, key:"metal"});
  for (let y = 2.6; y < h + .9; y += .32) f.box(s - .24, s + .24, y, y + .035, .19, .23, C.darkMetal, {ao:false, jit:0, key:"metal"});
  for (let y = 2.8; y < h; y += 2.4) f.box(s - .26, s + .26, y, y + .04, 0, .22, C.darkMetal, {ao:false, key:"metal"});
}
// a downpipe from the gutter to the ground, with its hopper and brackets
export function downpipe(f, s, h){
  const [x, z] = f.at(s, .1);
  cyl(x, .1, z, .05, h - .25, C.coping, {seg:8, key:"metal"});
  cyl(x, 0, z, .07, .12, C.coping, {seg:8, key:"metal"});
  f.box(s - .12, s + .12, h - .35, h - .15, 0, .22, C.coping, {key:"metal", ao:false});
  for (let y = 1.6; y < h - .5; y += 2.4) f.box(s - .07, s + .07, y, y + .05, 0, .16, C.coping, {key:"metal", ao:false});
  const [ax, az] = f.at(s - .08, 0), [bx, bz] = f.at(s + .08, .17);        // you brush past it, not through it
  solid(ax, bx, az, bz, 0, h);
}
/* the flat roof: a membrane, a parapet in the wall's own finish, a metal coping overhanging both faces, and the
   things that live on roofs — the stair hut, a lift room, air-con units, vents, maybe a dish */
export function roofTop(b, h, o = {}){
  const wc = o.wall == null ? C.stone : o.wall, wt = o.tex || "paint", p = o.parapet || .7, t = .25;
  box(b.x0 + t, h, b.z0 + t, b.x1 - t, h + .06, b.z1 - t, C.roof, {tex:"concrete", ao:false, jit:0});
  const W_ = {tex:wt, ao:false, jit:0};
  box(b.x0, h, b.z0, b.x1, h + p, b.z0 + t, wc, W_); box(b.x0, h, b.z1 - t, b.x1, h + p, b.z1, wc, W_);
  box(b.x0, h, b.z0 + t, b.x0 + t, h + p, b.z1 - t, wc, W_); box(b.x1 - t, h, b.z0 + t, b.x1, h + p, b.z1 - t, wc, W_);
  const cp = {ao:false, key:"metal", jit:0}, k = .06;
  box(b.x0 - k, h + p, b.z0 - k, b.x1 + k, h + p + .06, b.z0 + t + .03, C.coping, cp);
  box(b.x0 - k, h + p, b.z1 - t - .03, b.x1 + k, h + p + .06, b.z1 + k, C.coping, cp);
  box(b.x0 - k, h + p, b.z0 + t + .03, b.x0 + t + .03, h + p + .06, b.z1 - t - .03, C.coping, cp);
  box(b.x1 - t - .03, h + p, b.z0 + t + .03, b.x1 + k, h + p + .06, b.z1 - t - .03, C.coping, cp);
  if (o.bare) return;
  const cx = (b.x0 + b.x1)/2, cz = (b.z0 + b.z1)/2, big = (b.x1 - b.x0) > 9 && (b.z1 - b.z0) > 7;
  if (big){
    // the stair hut: rendered, a flat lid, a door and a little light
    rbox(cx - .3, h, cz - .1, 2.0, 2.3, 1.9, .06, C.stone, {tex:"paint"});
    rbox(cx - .3, h + 2.3, cz - .1, 2.2, .12, 2.1, .04, C.coping, {key:"metal"});
    box(cx - .7, h, cz + .85, cx + .05, h + 1.95, cz + .87, C.door, {ao:false});
    box(cx - .55, h + 2.05, cz + .85, cx - .2, h + 2.12, cz + .9, 0xfff3d6, {key:"lamp", ao:false});
  }
  // air-con units with a fan grille
  const n = big ? 2 : 1;
  for (let i = 0; i < n; i++){
    const ax = b.x0 + 1.4 + i*1.3 + rnd()*.6, az = b.z0 + 1.2;
    rbox(ax, h + .06, az, 1.0, .62, .62, .05, 0xc9cdd0, {key:"metal"});
    cyl(ax, h + .68, az, .24, .015, 0x2a2d30, {seg:14});
    rbox(ax, h + .06, az, 1.06, .08, .68, .02, 0x6b7076);
  }
  // vents and a soil stack
  for (const [vx, vz] of [[b.x1 - 1.5, cz + 1.4], [b.x0 + 2.2, b.z1 - 1.3]]){ cyl(vx, h, vz, .09, .9, C.darkMetal, {seg:8, key:"metal"}); cyl(vx, h + .9, vz, .15, .06, C.darkMetal, {seg:8}); }
  if (rnd() < .7){
    const dx = b.x1 - 2.2, dz = b.z1 - 1.6;
    cyl(dx, h, dz, .04, 1.1, C.metal, {seg:6});
    cyl(dx, h + 1.25, dz, .38, .06, 0xd8dcdf, {seg:14, rx:-1.1});
  }
}
/* a block nobody lets you into */
export function block(b, face, color, o = {}){
  const floors = o.floors || 4, h = floors*LH, tx = wallTex(color);
  // the mass, with its vertical edges softened a touch
  rbox((b.x0 + b.x1)/2, 0, (b.z0 + b.z1)/2, b.x1 - b.x0, h, b.z1 - b.z0, .06, color, {solid:true, tex:tx, jit:.04});
  const f = facer(face, b), len = f.len;
  facadeDeco(f, len, h, Object.assign({balc:rnd() < .5}, o));
  // the sides get a couple of windows too, and some have the fire ladder
  if (o.sides !== false){
    for (const side of sideFaces(face)){
      const g = facer(side, b), sl = g.len;
      for (let L = 1; L < floors; L++) for (const s of [sl*.35, sl*.7]) decoWin(g, s, L*LH, rnd() < .25);
      pilasters(g, sl, h);
      if (rnd() < .5) ladder(g, sl*.15, h);
    }
  }
  roofTop(b, h, {wall:color, tex:tx});
  // its front door is locked, and it tells you so
  if (o.doorAt != null){
    const [x, z] = f.at(o.doorAt, .2);
    spot({x, y:1.2, z, aim:[[x - .8, 0, z - .8], [x + .8, 2.4, z + .8]], label:o.doorLabel || "Front door", hint:o.doorHint || "Locked — you don't live here", hold:.15,
      run:() => ctx.note(o.doorNote || "Locked. You don't live in this block.")});
  }
}
const sideFaces = face => face[1] === "z" ? ["+x", "-x"] : ["+z", "-z"];
// the frame of a facade: stone at the corners, a base course (broken at doors), a cornice under the parapet
export function pilasters(f, len, h, gaps = []){
  const O = {ao:false, jit:0};
  f.box(0, .36, .55, h - .4, 0, .04, C.stone, O); f.box(len - .36, len, .55, h - .4, 0, .04, C.stone, O);
  band(f, 0, len, 0, .55, 0, .06, C.plinth, gaps, {tex:"concrete", ao:false, jit:0});
  band(f, -.02, len + .02, .55, .6, 0, .09, C.stone, gaps);
  f.box(-.06, len + .06, h - .4, h - .28, 0, .1, C.stone, O);
  f.box(-.1, len + .1, h - .28, h - .16, 0, .16, C.stone, O);
}
function facadeDeco(f, len, h, o){
  const floors = o.floors || 4;
  const per = Math.max(2, Math.round(len/3.4));
  const xs = o.wins || Array.from({length:per}, (_, i) => len*(i + .5)/per);
  const door = o.doorAt != null ? o.doorAt : len*.3;
  const g0 = len*.62, g1 = Math.min(len - .8, g0 + 3.4);
  const gaps = [...(o.noDoor ? [] : [[door - 1.1, door + 1.1]]), ...(o.garage !== false ? [[g0 - .14, g1 + .14]] : []), ...(o.gaps || [])];
  pilasters(f, len, h, gaps);
  // a band over the ground floor
  f.box(.36, len - .36, LH - .2, LH - .05, 0, .08, C.stone, {ao:false, jit:0});
  for (let L = 1; L < floors; L++) xs.forEach((s, i) => {
    if (o.skip && o.skip(L, s)) return;
    decoWin(f, s, L*LH, rnd() < .3);
    if (o.balc && i % 2 === 1 && !o.skip) balcony(f, s, L*LH);
  });
  if (!o.noDoor) doorDeco(f, door, o.glassDoor);
  if (o.garage !== false) garageDeco(f, g0, g1);
  if (o.groundWin !== false) decoWin(f, len*.1 + .7, 0, false);
  for (const s of [.18, len - .18]) downpipe(f, s, h);
}
// a balcony: a slab on brackets, a solid front in the wall's trim colour and a slim metal rail
function balcony(f, s, y){
  const w = 2.4, d = 1.05, O = {ao:false, jit:0};
  f.box(s - w/2, s + w/2, y - .06, y + .1, 0, d, C.stone, O);
  f.box(s - w/2, s + w/2, y + .1, y + .95, d - .06, d, 0xe9e4d8, {tex:"paint", ao:false, jit:0});
  for (const e of [-1, 1]) f.box(s + e*w/2 - (e > 0 ? .06 : 0), s + e*w/2 + (e < 0 ? .06 : 0), y + .1, y + .95, 0, d - .06, 0xe9e4d8, {tex:"paint", ao:false, jit:0});
  const R = {key:"metal", ao:false, jit:0};
  f.box(s - w/2 - .02, s + w/2 + .02, y + .95, y + 1.0, d - .08, d + .02, C.coping, R);
  f.box(s - w/2 - .02, s - w/2 + .08, y + .95, y + 1.0, 0, d - .08, C.coping, R); f.box(s + w/2 - .08, s + w/2 + .02, y + .95, y + 1.0, 0, d - .08, C.coping, R);
  f.box(s - w/2 + .1, s + w/2 - .1, y - .12, y - .06, 0, d - .1, C.stone, Object.assign({shade:.85}, O));
}

/* ================= your block ================= */
// a painted wall skin: a green oil-paint dado and cream above, the way every Romanian stairwell is painted
// side (±1, the room's side): the 3 cm line stands proud of the skins on the room side and is buried 5 mm in the wall
// behind; given the side, that buried face is left out, so it never shows through a thin wall seen edge-on
function twoTone(axis, fixed, a, b, base, top, holes = [], ends, side){
  const lo = base + 1.15, P = {solid:false, jit:0, ao:false, tex:"paint", ends};
  wall(axis, fixed, a, b, base, lo, .02, C.green, holes, P);
  wall(axis, fixed, a, b, lo, top, .02, C.cream, holes, P);
  wall(axis, fixed, a, b, lo - .02, lo + .02, .03, 0x4c6a57, holes, {solid:false, jit:0, ao:false, ends, back:side ? -side : 0});   // the line between them
}
// the stairwell: x from the west wall to the east wall, the open well between the flights
const ST = {w:-13.75, e:-9.875, f1:[-13.73, -11.99], well:[-11.99, -11.64], f2:[-11.64, -9.895], front:-4, mid:-7, back:-8.75};
function myBlock(F, D){
  const brick = C.brick[0], BT = {tex:"brick"};
  const winHoles = (L, side) => (L === F && ((side === "front" && D <= 2) || (side === "back" && D >= 3)))
    ? winsOf(D).map(x => [x - .55, x + .55, L*LH + .9, L*LH + 2.35]) : [];
  // the stairwell windows sit at landing height, half a storey up
  const stairWin = L => [0, 1, 2].map(k => [-13.3, -12.2, k*LH + 1.6 + 1.0, k*LH + 1.6 + 2.45]);
  const ENT = [-10.25, -8.75, G0, G0 + 2.35];
  // each outer wall in one piece from the ground to the roof: a joint at every storey would be a face seen edge-on
  // right behind the paint inside, and would show through it as a dashed line
  const Ls = [0, 1, 2, 3];
  wall("x", 2.875, -14, 0, 0, H4, .25, brick, [ENT, LOBBY_WIN, ...Ls.flatMap(L => winHoles(L, "front"))], BT);
  wall("x", -8.875, -14, 0, 0, H4, .25, brick, [...Ls.flatMap(L => winHoles(L, "back")), ...stairWin(0)], BT);
  wall("z", -13.875, -8.75, 2.75, 0, H4, .25, brick, [], BT);
  wall("z", -0.125, -8.75, 2.75, 0, H4, .25, brick, [], BT);
  // outside: the same dress as every other block, minus the windows that are really yours
  const ff = facer("+z", BLD), fb = facer("-z", BLD);
  const myWin = new Set(winsOf(D).map(x => x.toFixed(2)));
  facadeDeco(ff, 14, H4, {wins:[...winsOf(1), ...winsOf(2)].map(x => x + 14), doorAt:4.5, glassDoor:true, groundWin:true, noDoor:true, gaps:[[3.0, 6.0]],
    skip:(L, s) => L === F && D <= 2 && myWin.has((s - 14).toFixed(2))});
  entrance();
  const bw = [...winsOf(3), ...winsOf(4)];
  for (let L = 1; L < 4; L++) for (const x of bw){
    if (L === F && D >= 3 && myWin.has(x.toFixed(2))) continue;
    decoWin(fb, 0 - x, L*LH, rnd() < .25);
  }
  pilasters(fb, 14, H4);
  for (const side of ["+x", "-x"]){ const g = facer(side, BLD); pilasters(g, 12, H4); if (side === "-x") ladder(g, 2, H4); }
  for (const s of [.18, 13.82]) downpipe(fb, s, H4);
  roofTop(BLD, H4, {wall:brick, tex:"brick"});
  // the lobby's own window, to the right of the door from the street (the one to climb through when the door's blocked)
  realWin((LOBBY_WIN[0] + LOBBY_WIN[1])/2, 0, 3, 1, false);
  // the real windows of your flat, and of the stairwell
  winsOf(D).forEach((x, i) => { if (D <= 2) realWin(x, F*LH, 3, 1, i === 0); else realWin(x, F*LH, -9, -1, i === 0); });
  for (let k = 0; k < 3; k++) realWin(-12.75, k*LH + 1.6 + .1, -9, -1);

  // slabs: a hole in each one for the stairs; the underside is the ceiling of the storey below. Each stops 2 cm short
  // of the front wall's inner face (2.75), so no face of it lies in that plane right behind the brick (the rooms' skins
  // cover the hair of a gap from inside)
  const FW = 2.73;
  for (let L = 1; L <= 4; L++){
    const y = L*LH, CL = {ao:false, jit:0, tex:"paint"};
    slab(L === 4 ? [[-13.75, -8.75], [-0.25, -8.75], [-0.25, FW], [-13.75, FW]]
      : [[-9.875, -8.75], [-0.25, -8.75], [-0.25, FW], [-13.75, FW], [-13.75, -4], [-9.875, -4]], y - .25, y, C.ceiling, CL);
    if (L < 4){ floor(-13.75, -0.25, -4, 2.75, y + .02); floor(-9.875, -0.25, -8.75, -4, y + .02); }   // you stand on the lino and the boards, not under them
  }
  // the lobby: one step up from the street, terrazzo, the walls painted
  box(-13.75, 0, -4, -6.1, G0, 2.75, 0xffffff, {tex:"terrazzo", ao:false, jit:0}); floor(-13.75, -6.1, -4, 2.75, G0);
  box(-9.625, 0, -8.75, -6.1, G0, -4, 0xffffff, {tex:"terrazzo", ao:false, jit:0}); floor(-9.625, -6.1, -8.75, -4, G0);
  box(-13.75, 0, -8.75, -9.625, G0 - .01, -4, C.step, {ao:false, jit:0});
  box(ST.w, 0, ST.mid + 7*.375, ST.f1[1], G0, ST.front, 0xffffff, {tex:"terrazzo", ao:false, jit:0}); floor(ST.w, ST.f1[1], ST.mid + 7*.375, ST.front, G0);
  twoTone("x", 2.74, -13.75, -6.1, G0, 2.95, [ENT, LOBBY_WIN], 0, -1);
  twoTone("z", -13.74, -4, 2.75, G0, 2.95, [], -1, 1);          // closed at -4: the stair's thinner skin carries on from there
  twoTone("z", -6.11, -8.75, 2.75, G0, 2.95, [], 0, -1);
  twoTone("x", -8.74, -9.625, -6.1, G0, 2.95, [], 0, 1);
  twoTone("z", -9.615, -8.75, -4, G0, 2.95, [], 0, 1);
  solid(-6.1, -5.9, -8.75, 2.75, 0, LH);          // the garage behind the lobby: the lobby's skin is its face, so no faces of its own
  skirting("x", 2.74 - .01, -13.75, -6.1, G0, -1, [[ENT[0] - .1, ENT[1] + .1]]);
  skirting("z", -13.74 + .01, -4, 2.75, G0, 1); skirting("z", -6.11 - .01, -8.75, 2.75, G0, -1);
  skirting("x", -8.74 + .01, -9.625, -6.1, G0, 1); skirting("z", -9.615 + .01, -8.75, -4, G0, 1);
  stairs();

  // the corridors on floors 1–3
  for (let L = 1; L < 4; L++){
    const base = L*LH, top = base + LH - .25;
    box(-13.75, base, -4, -0.25, base + .02, -2.3, C.lino, {ao:false, jit:0});
    twoTone("z", -13.74, -4, -2.31, base, top, [], -1, 1);
    const hf = [1, 2].map(d => [APT[d].door - .5, APT[d].door + .5, base, base + 2.1]), hb = [3, 4].map(d => [APT[d].door - .5, APT[d].door + .5, base, base + 2.1]);
    wall("x", -2.2, -13.75, -0.25, base, top, .2, C.cream, hf, {tex:"paint"});
    wall("x", -4.1, -9.625, -0.25, base, top, .2, C.cream, hb, {tex:"paint"});
    // the party walls between the flats: only ever seen from inside your own flat, where its wallpaper covers them, so
    // they are kept as what you bump into and not drawn — drawn, their faces run edge-on up to the front and back walls
    // and showed through the brick from the street as dashed lines
    solid(-7.125, -6.875, -2.1, 2.75, base, top); solid(-5.125, -4.875, -8.75, -4.2, base, top);      // (out to the skins on both faces)
    twoTone("x", -2.31, -13.75, -0.25, base, top, hf, 0, -1);
    twoTone("x", -3.99, ST.e - .016, -0.25, base, top, hb, -1, 1);          // on round the end of the stairwell wall to the stair
    twoTone("z", -0.26, -3.99, -2.31, base, top, [], 0, -1);
    skirting("x", -2.32, -13.75, -0.25, base + .02, -1, hf.map(h => [h[0] - .08, h[1] + .08]));
    skirting("x", -3.98, ST.e - .016, -0.25, base + .02, 1, hb.map(h => [h[0] - .08, h[1] + .08]));
    skirting("z", -0.27, -3.99, -2.31, base + .02, -1); skirting("z", -13.73, -3.99, -2.31, base + .02, 1);
    for (const x of [-11.5, -6.5, -2]){ rbox(x, top - .05, -3.15, .6, .05, .3, .02, 0xfff3d6, {key:"lampB"}); rbox(x, top - .02, -3.15, .66, .02, .36, .01, C.darkMetal); }
    lightSrc({x:-7, y:top - .3, z:-3.1, color:0xfff0d0, intensity:5, distance:9, indoor:true, on:powerOn});
    const nb = D === 1 ? 3 : D === 2 ? 4 : D === 3 ? 1 : 2, onb = G().onb || {};
    const slamDue = !onb.slam && G().flags && !G().flags.ApartmentTutorialCompleted;
    for (let d = 1; d <= 4; d++){
      if (L === F && d === D) continue;
      if (L === F && d === nb && slamDue){ neighbourDoor(L, d); continue; }
      staticDoor(L, d);
    }
    // the corridor face of your own door's opening
    if (L === F) doorway("x", APT[D].wz - APT[D].s*.1, APT[D].door - .5, APT[D].door + .5, base, 2.1, .2, {faces:[-APT[D].s], color:0x4a3f36, proud:.05, sill:base + .024, sillColor:0x9a958c});
  }
}
// skirting along a wall face, broken at openings. side: which way the room is (+1/−1 along the other axis)
function skirting(axis, fixed, a, b, base, side, gaps = []){
  const c = 0x3e4a43, h = .1, d = .018;
  let cur = a;
  const run = (s0, s1) => { if (s1 - s0 < .01) return;
    if (axis === "x") box(s0, base, Math.min(fixed, fixed + side*d), s1, base + h, Math.max(fixed, fixed + side*d), c, {ao:false, jit:0});
    else box(Math.min(fixed, fixed + side*d), base, s0, Math.max(fixed, fixed + side*d), base + h, s1, c, {ao:false, jit:0}); };
  for (const [g0, g1] of gaps.slice().sort((p, q) => p[0] - q[0])){ run(cur, Math.min(g0, b)); cur = Math.max(cur, g1); }
  run(cur, b);
}
/* the way in: a stone landing a step up from the pavement, a lined opening, a canopy with a light under it */
function entrance(){
  const x0 = -10.25, x1 = -8.75, z = 2.875;
  // the landing and its step (the pavement is at .12, the lobby at G0)
  rbox(-9.5, 0, 3.55, 2.9, G0 - .03, 1.1, .03, C.step, {tex:"concrete", jit:0});      // the block stops under the stone cap: one top, not two
  box(-10.95, G0 - .03, 3.0, -8.05, G0, 4.12, 0xc9c4ba, {ao:false, jit:0});
  floor(-10.95, -8.05, 3.0, 4.1, G0); floor(x0, x1, 2.7, 3.05, G0);            // and across the threshold
  rbox(-9.5, G0, 2.15, 1.3, .006, .8, .004, 0x3a3631, {jit:0});                    // a doormat inside
  doorway("x", z, x0, x1, G0, 2.35, .25, {color:0x2b3036, arch:.1, proud:.04, sill:G0 + .012, sillColor:0x9a958c, key:"metal"});
  // the canopy: a slim slab on two steel brackets, lit from beneath
  rbox(-9.5, 2.88, 3.6, 3.0, .14, 1.3, .05, C.coping, {key:"metal"});
  lightSrc({x:-9.5, y:2.7, z:3.7, color:0xffe2b0, intensity:4, distance:6, on:powerOn});
  box(-10.0, 2.86, 3.62, -9.0, 2.88, 3.72, 0xfff1d0, {key:"lampB", ao:false, jit:0});
  for (const x of [-10.75, -8.25]) beam(x, 3.75, 3.0, x, 3.0, 4.15, .03, .03, C.coping, {key:"metal"});     // tie rods to the wall
  // a house number and a buzzer panel
  const t = textTex(128, 64, g => { g.fillStyle = "#1d2328"; g.fillRect(0, 0, 128, 64); g.fillStyle = "#f2efe6"; g.font = "bold 40px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("14", 64, 34); });
  // on the brick between the door's architrave (top 2.72) and the canopy (2.88), flat on the wall
  label(t, -9.5, 2.797, 3.006, .28, .14, 0);
  box(-8.6, 1.2, 3.0, -8.4, 1.55, 3.04, 0x9aa1a7, {key:"metal", ao:false});
  for (let i = 0; i < 6; i++) box(-8.56, 1.26 + i*.045, 3.04, -8.44, 1.29 + i*.045, 3.046, 0x2a2e33, {ao:false, jit:0});
}
/* the stairs: a dog-leg of two flights a storey round an open well, landings half way, terrazzo treads with a
   dark non-slip strip, a steel balustrade with a timber rail on the well side and a rail on the wall */
function stairs(){
  const S_ = ST, rail = 0x6b4a2c, steel = 0x3c4248, gray = {ao:false, jit:0};
  // the walls of the stairwell: one skin of paint from the bottom to the top, so no seam runs through a flight
  box(S_.w, 0, S_.back, S_.w + .01, H4 - .25, S_.front, C.cream, {tex:"paint", ao:false, jit:0});
  box(S_.e - .01, 0, S_.back, S_.e, H4 - .25, S_.front, C.cream, {tex:"paint", ao:false, jit:0});
  wall("x", S_.back + .005, S_.w, S_.e, 0, H4 - .25, .01, C.cream, [0, 1, 2].map(k => [-13.3, -12.2, k*LH + 2.6, k*LH + 4.05]), {solid:false, tex:"paint", jit:0});
  box(-9.875, 0, -8.75, -9.625, H4 - .25, -4, C.cream, {solid:true, tex:"paint", ao:false});
  // the well: too narrow to stand in, so it is solid from the bottom to the top
  solid(S_.well[0], S_.well[1], S_.mid, S_.front, 0, H4);
  for (let L = 0; L < 3; L++){
    const base = L*LH, land = base + 1.6, y0 = L ? base : G0;
    // landing: a slab with a terrazzo top and a nosing on the edge over the well
    box(S_.w + .01, land - .25, S_.back + .01, S_.e - .01, land - .02, S_.mid, C.ceiling, {tex:"paint", ao:false, jit:0});
    box(S_.w + .01, land - .02, S_.back + .01, S_.e - .01, land, S_.mid, 0xffffff, {tex:"terrazzo", ao:false, jit:0});
    floor(S_.w, S_.e, S_.back, S_.mid, land);
    box(S_.well[0], land - .035, S_.mid, S_.well[1], land + .002, S_.mid + .03, 0xe4dfd6, {tex:"terrazzo", ao:false, jit:0});
    // the two flights
    // the same going (.375) on every flight; the ground floor is a step higher, so its first flight is a tread shorter
    const o1 = {axis:"z", a0:L ? S_.front : S_.mid + 7*.375, a1:S_.mid, s0:S_.f1[0], s1:S_.f1[1], y0, y1:land, n:L ? 9 : 8, solidBase:L === 0};
    const o2 = {axis:"z", a0:S_.mid, a1:S_.front, s0:S_.f2[0], s1:S_.f2[1], y0:land, y1:base + LH, n:9};
    const f1 = flight(o1), f2 = flight(o2);
    // wall strings and, on the well side, a steel stringer
    stringer(o1, f1, S_.w + .01, S_.f1[0], 0xd9d4ca, .08, .02);
    stringer(o2, f2, S_.f2[1], S_.e - .01, 0xd9d4ca, .08, .02);
    // (painted steel: a bare metal finish has next to no diffuse colour, and these faces look across the well, lit
    // only from the side by the landing lights, so by night they would go flat black)
    stringer(o1, f1, S_.f1[1], S_.f1[1] + .05, 0x464d55, .1, .03, {key:"paint"});
    stringer(o2, f2, S_.f2[0] - .05, S_.f2[0], 0x464d55, .1, .03, {key:"paint"});
    // the green dado follows each flight up the wall it runs along, and runs level round the landing
    dado(o1, f1, S_.w + .01, S_.w + .016, land, L ? null : {a:S_.front, y:G0 + 1.15}); dado(o2, f2, S_.e - .016, S_.e - .01, land);
    box(S_.w, land - .2, S_.back + .01, S_.e, land + 1.0, S_.back + .016, C.green, {tex:"paint", ao:false, jit:0});
    box(S_.w, land + .98, S_.back + .016, S_.e, land + 1.02, S_.back + .02, 0x4c6a57, gray);
    // balustrades on the well side, rails on the walls
    balustrade(o1, f1, S_.f1[1] + .025, rail, steel);
    balustrade(o2, f2, S_.f2[0] - .025, rail, steel);
    wallRail(o1, f1, S_.w + .075, S_.w); wallRail(o2, f2, S_.e - .075, S_.e);
    // across the end of the well on the landing, and on the floor above
    railAcross(S_.f1[1] + .025, S_.f2[0] - .025, S_.mid + .02, land, rail, steel, false);
    if (L < 2) railAcross(S_.f1[1] + .025, S_.f2[0] - .025, S_.front + .03, base + LH, rail, steel, false);
    // two wall lights on the landing, one each side of the well (on the back wall by the east flight, on the west
    // wall by the west one), so each flight's well face is lit from across the well rather than edge-on from over it
    rbox(-10.6, land + 2.2, S_.back + .07, .5, .12, .12, .04, 0xfff3d6, {key:"lampB"});
    rbox(S_.w + .07, land + 2.2, -7.9, .12, .12, .5, .04, 0xfff3d6, {key:"lampB"});
    lightSrc({x:-10.6, y:land + 2.05, z:-8.35, color:0xffe8c8, intensity:4.5, distance:8, indoor:true, on:powerOn});
    lightSrc({x:S_.w + .4, y:land + 2.05, z:-7.9, color:0xffe8c8, intensity:4.5, distance:8, indoor:true, on:powerOn});
  }
  // under the second flight: a store cupboard with a door, closed off from the well
  const P = [[S_.mid, 0], [S_.mid, 1.6 + .178 - .32], [S_.front, LH - .32], [S_.front, 0]];
  extrude("z", P, S_.well[0] + .05, S_.f2[0], C.cream, {tex:"paint", jit:0});
  wall("x", S_.front - .05, S_.well[0] + .05, S_.e, 0, LH - .36, .1, C.cream, [[-11.25, -10.45, G0, G0 + 1.95]], {tex:"paint"});
  // its lobby face painted and skirted like the rest of the lobby, on across the end of the stairwell wall and round
  // the corner, where the side wall's skin and skirting butt into it
  const CB = [[-11.25, -10.45, G0, G0 + 1.95]];
  twoTone("x", S_.front + .01, S_.well[0] + .05, -9.605, G0, LH - .36, CB, true, 1);
  skirting("x", S_.front + .02, S_.well[0] + .05, -9.587, G0, 1, [[CB[0][0] - .08, CB[0][1] + .08]]);
  doorway("x", S_.front - .05, -11.25, -10.45, G0, 1.95, .1, {faces:[1], color:0xf0eee8});
  box(-11.22, G0, S_.front - .07, -10.48, G0 + 1.92, S_.front - .03, 0x8a7a64, {solid:true, ao:false, jit:0});
  box(-10.61, G0 + .92, S_.front - .03, -10.56, G0 + 1.06, S_.front - .018, C.metal, {key:"metal", ao:false, jit:0});   // a rose and a lever
  box(-10.72, G0 + .975, S_.front - .018, -10.565, G0 + 1.0, S_.front + .006, C.metal, {key:"metal", ao:false, jit:0});
  // the top floor: the stairs stop, so a balustrade closes the hole over the last flight
  const top = 3*LH;
  railAcross(S_.w + .04, S_.f2[0] - .025, S_.front + .03, top, rail, steel, true);
  solid(S_.w, S_.well[1], S_.front - .02, S_.front + .08, top, top + 1.1);
}
// the green band that climbs with a flight, from below its string to a metre over the nosings. foot: {a, y} carries
// the lobby's level band (top at y) on from a, and the band turns up the stair where the slope rises past it
function dado(o, f, s0, s1, land, foot){
  const uq = foot ? Math.max(-.3, (foot.y - 1.0 - o.y0 - f.r)*f.g/f.r) : -.3;
  const edge = dy => foot ? [[foot.a, foot.y - 1.0 + dy], [f.A(uq), foot.y - 1.0 + dy]] : [[f.A(-.3), f.pitch(-.3) + dy]];
  const P = [foot ? [foot.a, o.y0] : [f.A(-.3), f.pitch(-.3) - .35], ...edge(1.0), [f.A(f.L), o.y1 + 1.0], [f.A(f.L), o.y1 - .35]];
  if (o.a1 === ST.mid) P.splice(P.length - 1, 0, [ST.back + .01, land + 1.0], [ST.back + .01, land - .35]);
  else { const lo = P.shift(); P.unshift([ST.back + .01, land - .35], [ST.back + .01, land + 1.0]); P.push(lo); }   // round the outline in order: the low foot point closes it
  extrude("z", P, s0, s1, C.green, {tex:"paint", jit:0});
  const Q = [...edge(.98), [f.A(f.L), o.y1 + .98], [f.A(f.L), o.y1 + 1.02], ...edge(1.02).reverse()];
  extrude("z", Q, s0 + (s0 < -11 ? .006 : -.009), s1 + (s0 < -11 ? .009 : -.006), 0x4c6a57, {jit:0});   // 1 mm proud of the strings each side
}
// balusters on the stringer, a timber handrail on top, newel posts at both ends
function balustrade(o, f, x, rail, steel){
  const A = f.A, hr = .92;
  for (let k = 0; k < f.n - 1; k++) for (const q of [.3, .75]){
    const u = k*f.g + q*f.g, yb = f.pitch(u) + .1, yt = f.pitch(u) + hr - .03;
    box(x - .009, yb, A(u) - .009, x + .009, yt, A(u) + .009, steel, {key:"metal", ao:false, jit:0});
  }
  const u0 = -.02, u1 = f.L;
  beam(x, f.pitch(u0) + hr, A(u0), x, f.pitch(u1) + hr, A(u1), .06, .045, rail, {r:.015});
  beam(x, f.pitch(u0) + hr - .05, A(u0), x, f.pitch(u1) + hr - .05, A(u1), .03, .02, steel, {key:"metal"});
  for (const [u, y] of [[u0, o.y0], [u1, o.y1]]) rbox(x, y, A(u), .07, f.pitch(u) + hr - y + .04, .07, .012, steel, {key:"metal"});
}
// a level balustrade across an opening (the end of the well, the top floor)
function railAcross(xa, xb, z, y, rail, steel, posts = true){
  const hr = .95;
  for (let x = xa + .1; x < xb - .05; x += .12) box(x - .009, y, z - .009, x + .009, y + hr - .03, z + .009, steel, {key:"metal", ao:false, jit:0});
  beam(xa, y + hr, z, xb, y + hr, z, .06, .045, rail, {r:.015});
  box(Math.min(xa, xb), y + hr - .07, z - .012, Math.max(xa, xb), y + hr - .05, z + .012, steel, {key:"metal", ao:false, jit:0});
  if (posts) for (const x of [xa, xb]) rbox(x, y, z, .07, hr + .04, .07, .012, steel, {key:"metal"});
}
// a round rail on brackets along the wall side of a flight
function wallRail(o, f, x, wx){
  const A = f.A, hr = .9, u0 = -.1, u1 = f.L + .1;
  beam(x, f.pitch(u0) + hr, A(u0), x, f.pitch(u1) + hr, A(u1), .045, .045, 0x6b4a2c, {round:true, seg:8});
  for (const u of [.3, f.L/2, f.L - .3]){ const y = f.pitch(u) + hr - .05; beam(wx, y, A(u), x, y, A(u), .02, .02, 0x3c4248, {key:"metal"}); }
}
/* a window that is really a hole in the wall, with glass you can see through. b0: the sill's height over base */
function realWin(x, base, face, s, mine){
  const b = base + .9, t = b + 1.45, w = 1.1, h = w/2, zo = face, zi = face - s*.25, zm = face - s*.11;
  const Zs = (d0, d1) => { const a = zo - s*d0, c = zo - s*d1; return [Math.min(a, c), Math.max(a, c)]; };   // d measured inwards from the outside face
  const bx = (x0, x1, y0, y1, d0, d1, c, key) => { const [a, c2] = Zs(d0, d1); box(x0, y0, a, x1, y1, c2, c, {ao:false, jit:0, key}); };
  // outside: a white frame, a stone sill with a drip, a stone lintel (no two pieces share a face, so nothing flickers)
  bx(x - h, x - h + .08, b, t, -.06, 0, C.frame); bx(x + h - .08, x + h, b, t, -.06, 0, C.frame);
  bx(x - h + .08, x + h - .08, t - .08, t, -.06, 0, C.frame); bx(x - h + .08, x + h - .08, b, b + .06, -.06, 0, C.frame);
  bx(x - h - .16, x + h + .16, b - .07, b, -.14, 0, C.sill); bx(x - h - .14, x + h + .14, b - .1, b - .07, -.12, -.02, C.sill);
  bx(x - h - .14, x + h + .14, t, t + .18, -.05, 0, C.stone);
  bx(x - h - .1, x - h, b, t, -.035, 0, C.stone); bx(x + h, x + h + .1, b, t, -.035, 0, C.stone);
  // the reveal: the cut edges of the wall, plastered
  bx(x - h - .02, x - h + .03, b + .03, t - .03, 0, .275, 0xd8d3c8); bx(x + h - .03, x + h + .02, b + .03, t - .03, 0, .275, 0xd8d3c8);
  bx(x - h - .02, x + h + .02, t - .03, t + .02, 0, .275, 0xd8d3c8);
  bx(x - h - .02, x + h + .02, b - .02, b + .03, 0, .11 - .035, 0xe9e6de);
  // the window itself, set in the middle of the wall, dark like a newer frame
  const ib = (x0, x1, y0, y1) => bx(x0, x1, y0, y1, .11 - .035, .11 + .035, 0x2e3237);
  ib(x - h + .03, x - h + .11, b + .035, t - .03); ib(x + h - .11, x + h - .03, b + .035, t - .03);
  ib(x - h + .11, x + h - .11, t - .11, t - .03); ib(x - h + .11, x + h - .11, b + .035, b + .11);
  ib(x - .035, x + .035, b + .11, t - .11);
  if (mine){ const [z0, z1] = Zs(.108, .112); HOME.pane = paneOf(x - h + .11, x - .035, b + .11, t - .11, z0, z1, s); }
  else bx(x - h + .11, x - .035, b + .11, t - .11, .108, .112, 0xa9c2d2, "glass");
  bx(x + .035, x + h - .11, b + .11, t - .11, .108, .112, 0xa9c2d2, "glass");
  // the window board inside, a little wider than the hole, standing out over the radiator (14 cm off the wall) and no
  // further; it is solid, so you stand at it rather than in it
  bx(x - h - .08, x + h + .08, b - .04, b + .035, .11 + .035, .25 + .16, 0xece9e2);
  bx(x - h - .08, x + h + .08, b - .12, b - .04, .25 + .12, .25 + .16, 0xe2ded6);
  { const [z0, z1] = Zs(.25, .25 + .16); solid(x - h - .08, x + h + .08, z0, z1, b - .12, b + .035); }
}
function plate(text, x, y, z, ry){ label(plateTex(text), x, y, z, .16, .08, ry); }
const DOOR_COL = [0x6e4b34, 0x7a3a2e, 0x5b6168, 0x5a4636, 0x3f4a3e];
// somebody else's front door: lined opening, a panelled leaf, a lever handle, a peephole and a brass number
function staticDoor(L, d){
  const a = APT[d], base = L*LH, z = d <= 2 ? -2.2 : -4.1, side = d <= 2 ? -1 : 1;
  const col = DOOR_COL[(L*4 + d*3) % DOOR_COL.length], O = {ao:false, jit:0};
  doorway("x", z, a.door - .5, a.door + .5, base, 2.1, .2, {faces:[side], color:0x4a3f36, proud:.05, sill:base + .024, sillColor:0x9a958c});
  box(a.door - .47, base + .026, z - .025, a.door + .47, base + 2.07, z + .025, col, {solid:true, ao:false});
  for (const [y0, y1] of [[.25, .95], [1.15, 1.9]]) box(a.door - .34, base + y0, z + side*.025, a.door + .34, base + y1, z + side*.033, col, Object.assign({shade:1.12}, O));
  const fz = z + side*.025;
  box(a.door + .3, base + .96, Math.min(fz, fz + side*.012), a.door + .36, base + 1.12, Math.max(fz, fz + side*.012), C.metal, {key:"metal", ao:false});
  box(a.door + .2, base + 1.0, Math.min(fz + side*.012, fz + side*.04), a.door + .36, base + 1.03, Math.max(fz + side*.012, fz + side*.04), C.metal, {key:"metal", ao:false});
  cyl(a.door, base + 1.5, fz + side*.006, .012, .012, C.metal, {seg:8, rx:Math.PI/2, key:"metal"});
  plate(`${L}0${d}`, a.door, base + 1.68, z + side*.038, side < 0 ? Math.PI : 0);
  const zz = z + side*.4;
  spot({x:a.door, y:base + 1.2, z:zz, aim:[[a.door - .55, base, Math.min(z, zz)], [a.door + .55, base + 2.2, Math.max(z, zz)]],
    label:`Flat ${L}0${d}`, hint:"Not yours — locked", hold:.15, run:() => ctx.note(`Locked. Somebody else lives at ${L}0${d}.`)});
}

/* ================= doors that open ================= */
function plateTex(text){
  return textTex(96, 48, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#d9b46a"); gr.addColorStop(1, "#9c7a3c");
    g.fillStyle = gr; g.fillRect(0, 0, w, h); g.strokeStyle = "#5d4520"; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
    g.fillStyle = "#2a1f10"; g.font = "bold 30px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, w/2, h/2 + 2);
  });
}
/* a leaf that swings about a hinge (a door, a fridge door) kept solid wherever it stands: n short thin boxes laid
   along it from the hinge to its free edge, moved as it turns, so it blocks only where it really is at every angle —
   and it never swings into you: a turn that would bring the leaf into the space you stand in is held back until you
   step clear (you can't end up inside a door, and the camera never sees through one). Each turn asks for the sun's
   shadows to be redrawn, and once more when it comes to rest. */
// the player's collision body (world.js): a square R either side of where you stand, from .42 over your feet to 1.75
const BODY_R = .26, BODY_LO = .42, BODY_HI = 1.75, LEAF_T = .03;
export function leafGuard(hx, hz, len, y0, y1, n = 10, pad = .035){
  const sols = Array.from({length:n}, () => { const q = solid(0, 0, 0, 0, y0, y1); q.off = true; return q; });
  let ux = 1, uz = 0, on = false, rest = 0;
  // the box that piece i of a leaf pointing along (vx, vz) blocks: exactly what set() lays down
  const piece = (vx, vz, i, q) => {
    const ax = hx + vx*len*i/n, az = hz + vz*len*i/n, bx = hx + vx*len*(i + 1)/n, bz = hz + vz*len*(i + 1)/n;
    q.x0 = Math.min(ax, bx) - LEAF_T; q.x1 = Math.max(ax, bx) + LEAF_T; q.z0 = Math.min(az, bz) - LEAF_T; q.z1 = Math.max(az, bz) + LEAF_T;
    return q;
  };
  const tmp = {x0:0, x1:0, z0:0, z1:0};
  const G = {sols,
    // would a leaf pointing along (vx, vz) stand in the space you occupy? Every box the leaf would lay down at that
    // angle is tested against your real body — the square the player's collision uses — with pad to spare
    // how far the leaf pointing along (vx, vz) would stand clear of your body: the gap between the nearest box it
    // lays down and your square (negative: it would be in you). Infinity when you are not in its world or its height
    // closed: {s, upTo} — the box a door blocks its frame with once it is within upTo of shut (hingedDoor): from
    // there on it is part of what the leaf puts in your way, so it is counted too (a = the leaf's angle, when known)
    closed:null,
    clearance(vx, vz, a){
      if (VIEW.scene !== W.scene) return Infinity;
      // where your feet are: VIEW.feet from the player controller; only if it never gave one, the floor under you
      // (your eyes' height above it depends on how tall you made yourself, so it can't be taken off a fixed eye height)
      let feet = VIEW.feet;
      if (feet == null || !isFinite(feet)){ feet = 0; for (const f of W.floors) if (f.h > feet && f.h <= VIEW.y - .9 && VIEW.x >= f.x0 && VIEW.x <= f.x1 && VIEW.z >= f.z0 && VIEW.z <= f.z1) feet = f.h; }
      if (feet + BODY_HI <= y0 || feet + BODY_LO >= y1) return Infinity;
      const x0 = VIEW.x - BODY_R, x1 = VIEW.x + BODY_R, z0 = VIEW.z - BODY_R, z1 = VIEW.z + BODY_R;
      let c = Infinity;
      for (let i = 0; i < n; i++){
        const q = piece(vx, vz, i, tmp);
        c = Math.min(c, Math.max(q.x0 - x1, x0 - q.x1, q.z0 - z1, z0 - q.z1));
      }
      const k = G.closed;
      if (k && a != null && a <= k.upTo) c = Math.min(c, Math.max(k.s.x0 - x1, x0 - k.s.x1, k.s.z0 - z1, z0 - k.s.z1));
      return c;
    },
    // would a leaf pointing along (vx, vz) stand in the space you occupy (or within pad of it)?
    hitsYou(vx, vz){ return G.clearance(vx, vz) < pad; },
    // how far the leaf may turn from angle a0 toward a1 (dirOf(a) → its direction): all the way, unless on the way it
    // would come within pad of you — then up to you and no further. Already closer than pad, it may only move so as
    // not to come any closer; a leaf already in you is never held, so you can't be trapped. The sweep is walked in
    // small steps, so a hard drag can't jump the leaf through you
    reach(a0, a1, dirOf){
      const cl = a => { const [x, z] = dirOf(a); return G.clearance(x, z, a); };
      const c0 = cl(a0);
      if (c0 < 0) return a1;
      const lim = Math.min(pad, c0) - 1e-7, hit = a => cl(a) < lim;      // no creeping in a hair at a time
      const k = Math.max(1, Math.ceil(Math.abs(a1 - a0)/.04));
      let prev = a0;
      for (let j = 1; j <= k; j++){
        const a = a0 + (a1 - a0)*j/k;
        if (!hit(a)){ prev = a; continue; }
        let lo = prev, hi = a;
        for (let i = 0; i < 8; i++){ const m = (lo + hi)/2; if (hit(m)) hi = m; else lo = m; }
        return lo;
      }
      return a1;
    },
    set(vx, vz, show, dt = 1/60){
      const moved = Math.abs(vx - ux) + Math.abs(vz - uz) > 1e-5 || show !== on;
      ux = vx; uz = vz; on = show;
      sols.forEach((q, i) => {
        q.off = !show; if (!show) return;
        piece(vx, vz, i, q);
      });
      if (moved){ W.shadowDirty = true; rest = .35; } else if (rest > 0 && (rest -= dt) <= 0) W.shadowDirty = true;
    }
  };
  return G;
}
/* a door you open by pressing E, or by grabbing it with the mouse and dragging, like a real one.
   o: hingeX, z, base, width, height, into (+1 = swings towards +z), dir (+1: the leaf runs from the hinge
   towards +x, −1 towards −x), color, glass, label, plate. Closed, it blocks the opening; open, it blocks only
   where the leaf really stands (leafGuard), so you can neither walk through it nor be stopped by a door that is not there. */
export function hingedDoor(o){
  const dir = o.dir || 1, T = .05;
  const g = new THREE.Group(); g.position.set(o.hingeX, o.base, o.z);
  // the leaf and its raised panels are one mesh, the roses and levers on both faces another; a glazed door is a frame
  // round a real pane, not a slab with glass laid over it
  const wood = [], brass = [], W_ = o.width, H_ = o.height;
  if (o.glass){
    const st = .14, rail = .16, gb = H_*.33, gt = H_*.88;
    wood.push(boxGeo(st, H_, T, st/2, H_/2, 0), boxGeo(st, H_, T, W_ - st/2, H_/2, 0));
    wood.push(boxGeo(W_ - 2*st, gb, T, W_/2, gb/2, 0), boxGeo(W_ - 2*st, H_ - gt, T, W_/2, (H_ + gt)/2, 0));
  } else {
    wood.push(boxGeo(W_, H_, T, W_/2, H_/2, 0));
    for (const dz of [-1, 1]) for (const [h0, h1] of [[.12, .45], [.55, .9]]) wood.push(boxGeo(W_ - .24, H_*(h1 - h0), .008, W_/2, H_*(h0 + h1)/2, dz*(T/2 + .004)));
  }
  for (const dz of [-1, 1]){
    brass.push(boxGeo(.05, .16, .012, W_ - .12, 1.02, dz*(T/2 + .006)));
    brass.push(boxGeo(.13, .024, .024, W_ - .17, 1.06, dz*(T/2 + .012 + .012)));
  }
  const leaf = part(mergeGeos(wood), o.color, {cast:true});
  g.add(leaf, part(mergeGeos(brass), C.metal, {mat:{metalness:.7, roughness:.35}}));
  if (o.glass){ const pane = boxPart(W_ - .26, H_*.55 + .02, .012, 0x9fb7c6, W_/2, (H_*.33 + H_*.88)/2, 0, {mat:{transparent:true, opacity:.32, roughness:.08, metalness:.1, depthWrite:false}}); pane.renderOrder = 2; g.add(pane); }
  if (o.plate){
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(.16, .08), mat({map:plateTex(o.plate), roughness:1}));
    // on the face of the raised panel (which stands 8 mm proud of the leaf), on the outside of the door
    pm.position.set(W_/2, 1.62, -o.into*dir*(T/2 + .013)); pm.rotation.y = o.into*dir > 0 ? Math.PI : 0;
    g.add(pm); var plateMesh = pm;
  }
  W.scene.add(g);
  const xa = dir > 0 ? o.hingeX : o.hingeX - W_, xb = dir > 0 ? o.hingeX + W_ : o.hingeX;
  const sol = solid(xa, xb, o.z - .06, o.z + .06, o.base, o.base + H_);
  const guard = leafGuard(o.hingeX, o.z, W_, o.base, o.base + H_), SHUT = .08;
  guard.closed = {s:sol, upTo:SHUT};
  const base = dir > 0 ? 0 : Math.PI, spin = dir > 0 ? -o.into : o.into;
  const at = a => { const r = base + spin*a; return [Math.cos(r), -Math.sin(r)]; };
  // turn the leaf to a, unless that would swing it into you
  const turnTo = a => { D.a = guard.reach(D.a, a, at); };
  const D = {g, a:0, target:0, sol, leaf, dragging:false, rate:6, plate:typeof plateMesh === "undefined" ? null : plateMesh, get open(){ return D.a > .4; },
    toggle(){ D.target = D.a > .4 ? 0 : 1.65; }};
  W.anims.push(dt => {
    if (Math.abs(D.target - D.a) > 1e-4) turnTo(D.a + (D.target - D.a)*(1 - Math.exp(-D.rate*dt)));
    g.rotation.y = base + spin*D.a;
    // the closed box stays until the leaf is clear of the frame; the leaf's own boxes take over as soon as it moves
    sol.off = D.a > SHUT;
    const [ux, uz] = at(D.a);
    guard.set(ux, uz, D.a > .01, dt);
  });
  const box3 = new THREE.Box3();
  // a locked door (o.locked: your own, once you have a lock that works and have turned it) does not open
  const shut = () => !!(o.locked && o.locked());
  let rattled = 0;
  const rattle = () => { const t = performance.now(); if (t - rattled > 1200){ rattled = t; if (window.lifeNote) window.lifeNote("It's locked. Press F to unlock it."); } };
  if (!o.noSpot) spot({kind:"drag", label:o.label || "Door", get hint(){ return shut() ? "Locked · F to unlock" : D.open ? "Close the door" : "Open the door"; }, y:o.base + 1.2,
    aim:() => { g.updateMatrixWorld(); box3.setFromObject(leaf); box3.expandByScalar(.06); return [box3.min.toArray(), box3.max.toArray()]; },
    spin, get angle(){ return D.a; }, toggle:() => { if (shut()) return rattle(); D.toggle(); },
    drag(da){ if (shut()){ rattle(); return; } turnTo(Math.max(0, Math.min(1.75, D.a + da))); D.target = D.a; },
    hinge(){ return g.getWorldPosition(new THREE.Vector3()); },
    edge(){ g.updateMatrixWorld(); return g.localToWorld(new THREE.Vector3(W_*.95, 1.0, 0)); }});
  return D;
}

/* ================= the first morning's damage =================
   The left pane of your flat's first window is a mesh of its own, in one of three states (S.home.win): whole, smashed
   by a football (jagged teeth of glass left in the frame), and a day later taped over with plastic sheeting. */
const PANE_MAT = () => mat({color:0x9fb7c6, transparent:true, opacity:.34, roughness:.06, metalness:.1, depthWrite:false, side:THREE.DoubleSide});
function paneOf(x0, x1, y0, y1, z0, z1, s){
  const g = new THREE.Group(), zc = (z0 + z1)/2, P = {x0, x1, y0, y1, z:zc, s, g, state:""};
  W.scene.add(g);
  P.set = state => {
    if (P.state === state) return; P.state = state;
    while (g.children.length){ const c = g.children.pop(); c.geometry && c.geometry.dispose(); c.material && (c.material.map && c.material.map.dispose(), c.material.dispose()); }
    if (state === "ok"){ const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), PANE_MAT()); m.position.set((x0 + x1)/2, (y0 + y1)/2, zc); m.renderOrder = 2; g.add(m); }
    else if (state === "broken"){
      // teeth of glass round the frame, the middle gone
      const w = x1 - x0, h = y1 - y0, v = [], r = (k => () => { k = (k*16807) % 2147483647; return k/2147483647; })(97);
      const tooth = (ax, ay, bx, by, cx, cy) => v.push(ax, ay, zc, bx, by, zc, cx, cy, zc);
      const n = 5;
      for (let i = 0; i < n; i++){
        const a = x0 + w*i/n, b = x0 + w*(i + 1)/n, m = (a + b)/2 + (r() - .5)*w/n*.6;
        tooth(a, y0, b, y0, m, y0 + h*(.08 + r()*.22)); tooth(b, y1, a, y1, m, y1 - h*(.06 + r()*.18));
      }
      for (let i = 0; i < 4; i++){
        const a = y0 + h*i/4, b = y0 + h*(i + 1)/4, m = (a + b)/2 + (r() - .5)*h/4*.5;
        tooth(x0, b, x0, a, x0 + w*(.1 + r()*.25), m); tooth(x1, a, x1, b, x1 - w*(.08 + r()*.22), m);
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(v, 3)); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, PANE_MAT()); m.material.opacity = .78; m.material.color.setHex(0xd6e4ec); m.renderOrder = 2; g.add(m);
    } else {
      // plastic sheeting pulled over the hole and taped round the frame, a little slack, catching the light
      const w = x1 - x0, h = y1 - y0, cv = document.createElement("canvas"); cv.width = 128; cv.height = 192;
      const c = cv.getContext("2d"); c.fillStyle = "rgba(232,238,241,.8)"; c.fillRect(0, 0, 128, 192);
      c.strokeStyle = "rgba(255,255,255,.55)"; c.lineWidth = 2;
      for (let i = 0; i < 9; i++){ c.beginPath(); const yy = 10 + i*21; c.moveTo(0, yy); c.bezierCurveTo(40, yy + 14, 80, yy - 12, 128, yy + 6); c.stroke(); }
      c.fillStyle = "rgba(176,138,82,.95)"; c.fillRect(0, 0, 128, 12); c.fillRect(0, 180, 128, 12); c.fillRect(0, 0, 12, 192); c.fillRect(116, 0, 12, 192);
      c.fillRect(30, 0, 14, 40); c.fillRect(86, 152, 14, 40);
      // and a cross of tape over the middle, where the ball went through
      c.save(); c.translate(64, 96); for (const a of [.55, -.55]){ c.save(); c.rotate(a); c.fillRect(-80, -6, 160, 12); c.restore(); } c.restore();
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const geo = new THREE.PlaneGeometry(w, h, 6, 8), pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++){ const px = pos.getX(i)/w + .5, py = pos.getY(i)/h + .5, edge = Math.min(px, 1 - px, py, 1 - py); pos.setZ(i, -s*Math.min(.035, edge*.12)*(1 + .4*Math.sin(px*9 + py*7))); }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat({map:tex, transparent:true, roughness:.35, metalness:0, side:THREE.DoubleSide, depthWrite:false}));
      m.position.set((x0 + x1)/2, (y0 + y1)/2, zc); if (s < 0) m.rotation.y = Math.PI; m.renderOrder = 2; g.add(m);
    }
  };
  return P;
}
// the window as it should be now: smashed for a day, then plastic for good
export function winRefresh(){
  const h = G() && G().home, P = HOME.pane; if (!h || !P) return;
  const w = h.win || {state:"ok"};
  if (w.state === "broken" && typeof absNow === "function" && absNow() - (w.at || 0) >= 1440) w.state = "plastic";
  P.set(w.state === "broken" ? "broken" : w.state === "plastic" ? "plastic" : "ok");
}
/* The number on your door. It is on the corridor face of the leaf; a neighbour slamming their door on the first
   morning shakes it off, and from then on it drops off every time your door is opened or closed — and you pick it
   up (a left click: it goes in your hand, inv.js) and put it back (click the door with it in your hand).
   S.home.plate: "door" | "floor" | "carried" (on you, or wherever you dropped it); plateAt where it lies. */
function plateSetup(D, F, A){
  const h = G().home, pm = D.plate; if (!pm) return;
  pm.material.side = THREE.DoubleSide;
  const local = pm.position.clone(), rotY = pm.rotation.y, floorY = F*LH + .021, out = -A.s;
  // carried off and since lost track of (an older save, or a drop that went missing): it is back on the floor
  if (h.plate === "carried" && !onYou("plate") && !G().drops.some(d => d.item && d.item.id === "plate")) h.plate = "floor";
  const PL = HOME.plate = {mesh:pm, state:h.plate === "floor" ? "floor" : h.plate === "carried" ? "carried" : "door", busy:false, D};
  const toFloor = (x, z, r) => { W.scene.attach(pm); pm.position.set(x, floorY + .004, z); pm.rotation.set(-Math.PI/2, 0, r); };
  if (PL.state === "carried"){ W.scene.attach(pm); pm.visible = false; }
  if (PL.state === "floor"){
    const at = h.plateAt || {x:A.door + .3, z:A.wz - A.s*.1 + out*.45, r:.4};
    toFloor(at.x, at.z, at.r);
  }
  // off the door, tumbling into the corridor, flat on the lino
  PL.fall = (o = {}) => {
    if (PL.state !== "door" || PL.busy) return;
    PL.busy = true; PL.state = "falling";
    D.g.updateMatrixWorld(true); W.scene.attach(pm);
    const v = new THREE.Vector3((Math.random() - .5)*.5, .6 + (o.hard ? .5 : 0), out*(.55 + Math.random()*.4)), spin = new THREE.Vector3(3 + Math.random()*4, Math.random()*3, 2 + Math.random()*3);
    let t = 0, bounced = false;
    W.anims.push(function fallStep(dt){
      if (PL.state !== "falling") return;
      t += dt; v.y -= 9.8*dt;
      pm.position.addScaledVector(v, dt);
      pm.rotation.x += spin.x*dt; pm.rotation.y += spin.y*dt; pm.rotation.z += spin.z*dt;
      if (pm.position.y <= floorY + .02 && v.y < 0){
        if (!bounced && v.y < -1.2){ bounced = true; v.y *= -.28; v.x *= .5; v.z *= .5; spin.multiplyScalar(.4); return; }
        const r = Math.random()*Math.PI*2; toFloor(pm.position.x, pm.position.z, r);
        PL.state = "floor"; PL.busy = false; h.plate = "floor"; h.plateAt = {x:+pm.position.x.toFixed(3), z:+pm.position.z.toFixed(3), r:+r.toFixed(3)};
        if (window.lifeOnb) window.lifeOnb("plateFell");
      }
    });
  };
  PL.slot = () => { D.g.updateMatrixWorld(true); return D.g.localToWorld(local.clone()); };
  // pick it up from the floor
  const bb = () => { const p = pm.position; return [[p.x - .14, p.y - .02, p.z - .14], [p.x + .14, p.y + .1, p.z + .14]]; };
  spot({kind:"pick", label:`Room number · ${h.apt}`, hint:"Left click to pick it up", aim:bb, when:() => PL.state === "floor",
    pick(){
      PL.state = "carried"; h.plate = "carried"; delete h.plateAt; pm.visible = false;
      return {id:"plate", text:h.apt, hint:`Put it back on your door: aim at the door and click.`};
    }});
  // and back on the door, where it belongs
  spot({kind:"place", takes:"plate", label:`Your door · ${h.apt}`, hint:"Click to put the number back on", get aim(){ const p = PL.slot(); return [[p.x - .3, p.y - .3, p.z - .3], [p.x + .3, p.y + .3, p.z + .3]]; },
    place(c, at){
      // from your hand to the door
      if (at) pm.position.copy(at);
      pm.visible = true;
      PL.state = "fixing"; const from = pm.position.clone(), q0 = pm.quaternion.clone(), to = PL.slot();
      D.g.updateMatrixWorld(true); const q1 = new THREE.Quaternion(); D.g.getWorldQuaternion(q1); q1.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)));
      let t = 0;
      W.anims.push(function fixStep(dt){
        if (PL.state !== "fixing") return;
        t = Math.min(1, t + dt/.32); const e = t*t*(3 - 2*t);
        pm.position.lerpVectors(from, PL.slot(), e); pm.quaternion.slerpQuaternions(q0, q1, e);
        if (t >= 1){
          D.g.attach(pm); pm.position.copy(local); pm.rotation.set(0, rotY, 0);
          PL.state = "door"; h.plate = "door"; delete h.plateAt;
          // a little flash of the brass, so you see it took
          pm.material.emissive = new THREE.Color(0xffd27a); pm.material.emissiveIntensity = 1.2;
          let k = 0; W.anims.push(function glow(dt2){ if (k > 1) return; k += dt2/.6; pm.material.emissiveIntensity = Math.max(0, 1.2*(1 - k)); });
          if (typeof FEED === "object") FEED.chip(`Room number ${h.apt} is back on the door`, "good");
          if (window.lifeOnb) window.lifeOnb("plateFixed");
        }
      });
    }});
  // every time the door is opened or closed, it falls off again. (It is meant to. Do not fix this.)
  let was = D.open;
  W.anims.push(() => { const o = D.open; if (o !== was){ was = o; if (PL.state === "door") PL.fall(); } });
}
/* ---------- the lock on your door ----------
   A new career's lock is broken: the door shuts but never locks. A new one (Mobila Bună, by the till) is fitted by
   clicking the door with it in your hand; after that F at the door, shut, locks it and unlocks it — the thumb-turn
   on the inside turns over and a little light by the keyhole shows red (locked) or green. S.home.fx.lock, .locked */
function doorLock(D, A, base, s){
  const fx = G().home.fx, W_ = .94, T = .05, out = -s;              // the corridor face of the leaf is on the -s side
  const g = new THREE.Group(); D.g.add(g);
  const brass = lmat(0xb38c3e, {metalness:.7, roughness:.35}), old = lmat(0x6e5a3a, {metalness:.4, roughness:.7}), chrome = lmat(0xd5d9dc, {metalness:.85, roughness:.22}), dark = lmat(0x1d1f22);
  const ledM = mat({color:0x2a2d30, emissive:0x55ff6a, emissiveIntensity:0, roughness:1});
  const parts = {old:new THREE.Group(), neu:new THREE.Group()};
  for (const side of [1, -1]){
    const z = side*(T/2 + .006);
    // the old one: a dull escutcheon round an empty, wrenched hole
    const e = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .008, 14).rotateX(Math.PI/2), old); e.position.set(W_ - .12, 1.3, z); parts.old.add(e);
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(.011, .011, .01, 10).rotateX(Math.PI/2), dark); hole.position.set(W_ - .12, 1.3, z + side*.003); parts.old.add(hole);
    // the new one: a chrome deadlock, a keyhole outside, a thumb-turn inside, and the light
    const n = new THREE.Mesh(roundedBoxGeo(.07, .11, .014, .008, 1), chrome); n.position.set(W_ - .12, 1.3, z); parts.neu.add(n);
    if (side === out){ const k = new THREE.Mesh(new THREE.BoxGeometry(.008, .028, .006), dark); k.position.set(W_ - .12, 1.29, z + side*.009); parts.neu.add(k);
      const led = new THREE.Mesh(new THREE.SphereGeometry(.006, 8, 6), ledM); led.position.set(W_ - .12, 1.335, z + side*.008); parts.neu.add(led); }
    else { const t = new THREE.Mesh(roundedBoxGeo(.016, .05, .016, .006, 1), brass); t.position.set(W_ - .12, 1.29, z + side*.012); parts.neu.add(t); parts.turn = t;
      const led = new THREE.Mesh(new THREE.SphereGeometry(.006, 8, 6), ledM); led.position.set(W_ - .12, 1.34, z + side*.008); parts.neu.add(led); }
  }
  g.add(parts.old, parts.neu);
  const show = () => {
    const isNew = fx.lock === "new";
    parts.old.visible = !isNew; parts.neu.visible = isNew;
    if (parts.turn) parts.turn.rotation.z = fx.locked ? Math.PI/2 : 0;
    ledM.emissive.setHex(fx.locked ? 0xff3a2a : 0x55ff6a); ledM.emissiveIntensity = isNew ? 1.4 : 0;
  };
  show(); HOME.lockShow = show;
  // your door's state for the thieves: open or shut, as you left it
  W.anims.push(() => { const o = D.a > .3; if (o !== !!fx.doorOpen){ fx.doorOpen = o; if (o && fx.locked) fx.locked = false; } });
  // fitting the new lock: click the door with it in your hand
  const box3 = new THREE.Box3();
  spot({kind:"place", takes:"lock", label:`Your door · ${G().home.apt}`, hint:"Click to fit the new lock · about 20 min", when:() => fx.lock !== "new",
    aim:() => { D.g.updateMatrixWorld(); box3.setFromObject(D.leaf); box3.expandByScalar(.1); return [box3.min.toArray(), box3.max.toArray()]; },
    place(it){
      ctx.timeLapse(20, "work", k => k < .4 ? "Taking out the old lock" : "Fitting the new one", () => {
        fx.lock = "new"; fx.locked = false; show();
        if (typeof FEED === "object") FEED.chip("New lock fitted", "good");
        ctx.note("New lock fitted. Shut the door and press F to lock it — and again to unlock it.");
        ctx.persist(true);
      }, {icon:"🔒", dur:2.4});
    }});
}
// F at your door: lock it or unlock it (it has to be shut, and it needs a lock that works)
export function lockKey(P){
  const D = HOME.door, F = HOME.flat; if (!D || !F) return false;
  const A = F.A, dx = A.door - P.x, dz = (A.wz - F.s*.1) - P.z;
  if (Math.abs(P.feet - F.base) > .7 || Math.hypot(dx, dz) > 1.7) return false;
  const fx = G().home.fx;
  if (fx.lock !== "new"){ ctx.note("The lock's broken — the door shuts but it won't lock. Mobila Bună sells new ones, by the till."); return true; }
  if (D.a > .08){ ctx.note("Shut the door first."); return true; }
  fx.locked = !fx.locked; if (HOME.lockShow) HOME.lockShow();
  if (typeof FEED === "object") FEED.chip(fx.locked ? "Door locked" : "Door unlocked", fx.locked ? "good" : "");
  ctx.note(fx.locked ? "Click-clunk. Locked." : "Unlocked.");
  if (typeof save === "function") save();
  return true;
}

/* the neighbour across the corridor, door ajar on the first morning, until it is slammed (intro.js calls HOME.slam) */
function neighbourDoor(L, d){
  const a = APT[d], base = L*LH, z = a.wz - a.s*.1, side = d <= 2 ? -1 : 1, col = DOOR_COL[(L*4 + d*3) % DOOR_COL.length];
  doorway("x", d <= 2 ? -2.2 : -4.1, a.door - .5, a.door + .5, base, 2.1, .2, {faces:[side], color:0x4a3f36, proud:.05, sill:base + .024, sillColor:0x9a958c});
  // the dark of their hall, seen through the gap
  box(a.door - .55, base, Math.min(z + a.s*.12, z + a.s*1.3), a.door + .55, base + 2.2, Math.max(z + a.s*.12, z + a.s*1.3), 0x0d0d0f, {ao:false, jit:0});
  const N = hingedDoor({hingeX:a.door - .47, z, base:base + .026, width:.94, height:2.044, into:a.s, color:col, plate:`${L}0${d}`, noSpot:true});
  N.a = N.target = .5;
  HOME.slam = () => { N.rate = 30; N.target = 0; W.shadowDirty = true; };
  spot({x:a.door, y:base + 1.2, z:z - a.s*.5, aim:[[a.door - .55, base, Math.min(z, z - a.s*.5)], [a.door + .55, base + 2.2, Math.max(z, z - a.s*.5)]],
    label:`Flat ${L}0${d}`, hint:"Not yours — locked", hold:.15, run:() => ctx.note(`Locked. Somebody else lives at ${L}0${d}.`)});
}

/* ================= your flat ================= */
function myFlat(F, D){
  const A = APT[D], base = F*LH, s = A.s, Wd = A.x1 - A.x0, Dp = Math.abs(A.ext - A.wz), top = base + LH - .25;
  const X = u => A.x0 + u, Z = v => A.wz + s*v;
  const lb = (u0, u1, v0, v1, y0, y1, c, o) => box(X(u0), base + y0, Z(v0), X(u1), base + y1, Z(v1), c, o);
  const zr = (v0, v1) => [Math.min(Z(v0), Z(v1)), Math.max(Z(v0), Z(v1))];
  const du = A.door - A.x0;
  const P = {paper:{solid:false, tex:"paper", ao:false, jit:0}, tile:{solid:false, tex:"tiles", ao:false, jit:0}};
  // floor: worn planks, tiles in the bathroom
  lb(0, Wd, 0, Dp, 0, .02, 0xffffff, {tex:"planks", ao:false, jit:0});
  lb(0, 2.05, 0, 2.25, .021, .03, 0xffffff, {tex:"tiles", ao:false, jit:0});
  // walls: a warm striped wallpaper
  wall("x", Z(.012), X(2.1), X(Wd), base, top, .02, 0xffffff, [[A.door - .5, A.door + .5, base, base + 2.1]], P.paper);
  wall("x", Z(Dp - .012), X(0), X(Wd), base, top, .02, 0xffffff, winsOf(D).map(x => [x - .55, x + .55, base + .9, base + 2.35]), P.paper);
  wall("z", X(.012), ...zr(2.3, Dp), base, top, .02, 0xffffff, [], P.paper);
  wall("z", X(Wd - .012), ...zr(0, Dp), base, top, .02, 0xffffff, [], P.paper);
  // the bathroom: two thin walls and a doorway
  wall("x", Z(2.25), X(0), X(2.1), base, top, .1, 0xffffff, [[X(.55), X(1.45), base, base + 2.0]], {tex:"paper", jit:0});
  wall("z", X(2.05), ...zr(0, 2.3), base, top, .1, 0xffffff, [], {tex:"paper", jit:0});
  wall("x", Z(.012), X(0), X(2.0), base, base + 1.6, .02, 0xffffff, [], P.tile);
  wall("z", X(.012), ...zr(0, 2.2), base, base + 1.6, .02, 0xffffff, [], P.tile);
  wall("z", X(1.99), ...zr(0, 2.2), base, base + 1.6, .02, 0xffffff, [], P.tile);
  wall("x", Z(2.19), X(0), X(2.0), base, base + 1.6, .02, 0xffffff, [[X(.55), X(1.45), base, base + 2.0]], P.tile);
  wall("x", Z(.012), X(0), X(2.0), base + 1.6, top, .02, 0xffffff, [], P.paper);
  wall("z", X(.012), ...zr(0, 2.2), base + 1.6, top, .02, 0xffffff, [], P.paper);
  wall("z", X(1.99), ...zr(0, 2.2), base + 1.6, top, .02, 0xffffff, [], P.paper);
  wall("x", Z(2.19), X(0), X(2.0), base + 1.6, top, .02, 0xffffff, [[X(.55), X(1.45), base, base + 2.0]], P.paper);
  // skirting boards round the room, stopping at each architrave
  const sk = 0x5b3b22, SK = {ao:false, jit:.03};
  lb(2.1, du - .57, .022, .045, .02, .11, sk, SK); lb(du + .57, Wd - .022, .022, .045, .02, .11, sk, SK);
  lb(.022, Wd - .022, Dp - .045, Dp - .022, .02, .11, sk, SK);
  lb(.022, .045, 2.3, Dp - .045, .02, .11, sk, SK); lb(Wd - .045, Wd - .022, .045, Dp - .045, .02, .11, sk, SK);
  lb(.045, .48, 2.3, 2.323, .02, .11, sk, SK); lb(1.52, 2.1, 2.3, 2.323, .02, .11, sk, SK);
  lb(2.1, 2.123, .022, 2.3, .02, .11, sk, SK);
  // bath, toilet, sink and a mirror: enamel and porcelain with soft edges, a chrome tap
  // fr(u, v, y): a frame at a point of the flat (turned with the world, so a span along v is a depth along z)
  const fr = (u, v, y = 0) => frame(X(u), Z(v), 0, base + y), vc = (v0, v1) => (v0 + v1)/2;
  // the bath across the far end, the toilet on the left, the sink on the right: a clear path between
  rb(fr(1, .425), 0, 0, 0, 1.9, .565, .75, .06, C.white, {seg:2, key:"gloss"});
  rb(fr(1, .425), 0, .5, 0, 1.72, .07, .57, .05, 0xdde8ec, {key:"gloss"});                       // the tub, filled to just under the rim
  rb(fr(1, .425), 0, .51, 0, 1.6, .052, .47, .04, 0xa9c4cf, {key:"glass"});                      // the water, 8 mm under the tub's top
  solid(X(.05), X(1.95), ...zr(.05, .8), base, base + .56);
  cy(fr(1.75, .09), 0, .58, 0, .022, .026, .1, C.metal, {seg:8, key:"metal"});
  rb(fr(1.75, .14), 0, .66, 0, .04, .03, .12, .015, C.metal, {key:"metal"});
  // the toilet: a cistern against the wall, a pedestal, a bowl with its seat
  rb(fr(.14, 1.3), 0, .38, 0, .2, .52, .46, .04, C.white, {seg:2, key:"gloss"});
  rb(fr(.14, 1.3), 0, .9, 0, .23, .04, .49, .02, 0xf4f4f0, {key:"gloss"});
  cy(fr(.36, 1.3), 0, 0, 0, .15, .12, .34, C.white, {seg:14, key:"gloss"});
  cy(fr(.36, 1.3), 0, .34, 0, .2, .16, .07, C.white, {seg:16, key:"gloss"});
  cy(fr(.37, 1.3), 0, .41, 0, .205, .205, .025, 0xe6e6e0, {seg:16});
  solid(...[X(.03), X(.56)], ...zr(1.08, 1.52), base, base + .45);
  // the sink on its pedestal, the tap, and the mirror over it
  rb(fr(1.78, 1.44), 0, .78, 0, .4, .12, .48, .045, C.white, {seg:2, key:"gloss"});
  rb(fr(1.76, 1.44), 0, .86, 0, .28, .045, .34, .04, 0xe2e9ec, {key:"gloss"});
  cy(fr(1.82, 1.44), 0, 0, 0, .07, .1, .78, C.white, {seg:12, key:"gloss"});
  solid(X(1.58), X(1.98), ...zr(1.2, 1.68), base, base + .9);
  cy(fr(1.93, 1.44), 0, .9, 0, .016, .02, .11, C.metal, {seg:8, key:"metal"});
  rb(fr(1.88, 1.44), 0, .99, 0, .1, .025, .03, .012, C.metal, {key:"metal"});
  mirror(fr(1.965, 1.44), X, Z, base);
  // the bathroom door: lined, a marble threshold, hung on the sink side so it opens clear of the toilet
  doorway("x", Z(2.25), X(.55), X(1.45), base, 2.0, .1, {proud:.05, sill:base + .034, sillColor:0xe8e4dc});
  hingedDoor({hingeX:X(1.42), dir:-1, z:Z(2.25), base:base + .036, width:.84, height:1.934, into:-s, color:0xe6e1d6, label:"Bathroom"});
  lb(.85, 1.25, .95, 1.35, LH - .28, LH - .25, 0xfff3d6, {key:"lampB", ao:false});

  // the radiator under the window (the room's furniture is yours: furniture.js puts it where you put it)
  const [w1] = winsOf(D);
  const ru = w1 - A.x0;
  lb(ru - .45, ru + .45, Dp - .14, Dp - .05, .16, .7, 0xe7e4dc);
  for (const k of [-.36, .36]) lb(ru + k - .02, ru + k + .02, Dp - .1, Dp - .06, .02, .16, 0xc9c6bd, {ao:false, jit:0});
  for (let k = -.4; k <= .41; k += .1) lb(ru + k - .012, ru + k + .012, Dp - .145, Dp - .14, .18, .68, 0xc9c6bd, {ao:false, jit:0});

  // the light: a flex from the ceiling and a bakelite lamp holder — with a bare bulb in it once you have bought one and
  // screwed it in (a new career's flat has none) — and a switch by the door
  const bu = Wd*.55, bv = Dp*.55, fx = G().home.fx;
  cyl(X(bu), top - .5, Z(bv), .006, .5, 0x1c1c1c, {seg:4});
  cyl(X(bu), top - .04, Z(bv), .06, .04, 0xe8e4da, {seg:10});
  cyl(X(bu), top - .565, Z(bv), .021, .07, 0x1d1b19, {seg:10});
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.055, 10, 8), mat({color:0xfff6e0, emissive:0xffd590, emissiveIntensity:0, roughness:1}));
  bulb.scale.set(1, 1.15, 1); bulb.position.set(X(bu), top - .62, Z(bv)); W.scene.add(bulb);
  const lit = () => { const h = G() && G().home; return !!(h && h.light && h.fx && h.fx.bulb && powerOn()); };
  const lamp = lightSrc({x:X(bu), y:top - .7, z:Z(bv), color:0xffd8a0, intensity:7, distance:11, decay:1.4, indoor:true, on:lit});
  const su = du + .78 < Wd - .2 ? du + .78 : du - .78;
  lb(su - .05, su + .05, .02, .035, 1.18, 1.32, 0xf2efe6, {ao:false});
  HOME.light = {
    set(on){ const h = G().home; h.light = on; this.show(); },
    show(){ bulb.visible = !!G().home.fx.bulb; bulb.material.emissiveIntensity = lit() ? 2.2 : 0; },
    get on(){ return !!G().home.light; }, bulb
  };
  HOME.light.show();
  W.anims.push(() => { const e = lit() ? 2.2 : 0; if (bulb.material.emissiveIntensity !== e || bulb.visible !== !!fx.bulb) HOME.light.show(); });
  spot({x:X(su), y:base + 1.25, z:Z(.04), aim:[[X(su) - .2, base + 1.0, Math.min(Z(0), Z(.3))], [X(su) + .2, base + 1.5, Math.max(Z(0), Z(.3))]],
    label:"Light switch", get hint(){ return !G().home.fx.bulb ? "There's no bulb in the light" : !powerOn() ? "No power in the block today" : HOME.light.on ? "Turn the light off" : "Turn the light on"; }, hold:.08,
    run:() => {
      HOME.light.set(!HOME.light.on);
      if (!G().home.fx.bulb) ctx.note("Click. Nothing. There's no bulb in the light — the furniture store next to your block sells them for €3.");
      else if (!powerOn()) ctx.note("Click. Nothing. The power's off in the whole block today.");
    }});
  // the empty holder: with a bulb in your hand, click it to screw the bulb in
  const sy = top - .6;
  spot({kind:"place", takes:"bulb", label:"Light fitting", hint:"Click to screw the bulb in", when:() => !G().home.fx.bulb,
    aim:[[X(bu) - .16, sy - .14, Z(bv) - .16], [X(bu) + .16, sy + .12, Z(bv) + .16]],
    place(it){
      bulb.visible = true; bulb.position.y = sy - .05; bulb.rotation.y = 0;
      ctx.screw({title:"Screw in the bulb", icon:"💡", turns:2.5,
        turn:(k, d) => { bulb.rotation.y += d*.6; bulb.position.y = sy - .05 + .03*Math.min(1, k); },
        done:() => {
          const h = G().home; h.fx.bulb = true; h.light = true; bulb.position.set(X(bu), top - .62, Z(bv)); HOME.light.show();
          if (typeof FEED === "object") FEED.chip("Bulb in · the light works", "good");
          ctx.note("Let there be light. Don't leave it on when you go out — it's on the electricity bill.");
          if (typeof save === "function") save();
        },
        cancel:() => { bulb.visible = false; ctx.giveBack(it); }});
    }});

  // windows: one curtain each, sliding left to open and right to close
  HOME.curtains = winsOf(D).map((x, i) => curtain(x, base, A.ext, s, i));

  // what is in the room: the bed, the fridge and whatever else you have bought, each where you put it
  HOME.flat = {A, base, s, Wd, Dp, X, Z, F, D};
  furnish(HOME.flat, ctx);
  // the walls take new wallpaper: with a roll in your hand, click any wall of the room
  const zr2 = (v0, v1) => [Math.min(Z(v0), Z(v1)), Math.max(Z(v0), Z(v1))];
  for (const [a, b] of [[[X(2.1), base + .15, zr2(0, .06)[0]], [X(Wd), base + 2.8, zr2(0, .06)[1]]], [[X(0), base + .15, zr2(Dp - .06, Dp)[0]], [X(Wd), base + 2.8, zr2(Dp - .06, Dp)[1]]],
    [[X(0), base + .15, zr2(2.3, Dp)[0]], [X(.06), base + 2.8, zr2(2.3, Dp)[1]]], [[X(Wd - .06), base + .15, zr2(0, Dp)[0]], [X(Wd), base + 2.8, zr2(0, Dp)[1]]]])
    spot({kind:"place", takes:"paper", label:"Wall", hint:"Click to hang the new wallpaper · about 1½ hours", aim:[a, b], place(it){ hangPaper(it); }});
  // a hot bath takes the ache out of your legs
  spot({aim:[[Math.min(X(.05), X(1.95)), base, Math.min(Z(.05), Z(.8))], [Math.max(X(.05), X(1.95)), base + .6, Math.max(Z(.05), Z(.8))]],
    x:X(1), z:Z(.45), label:"Bath", get hint(){ return `Shower · 10 min · ${typeof odorLabel === "function" ? odorLabel() : "clean"} now`; }, hold:.3, run:() => ctx.shower(),
    long:{time:1.5, label:"a hot bath · 30 min · clean, and eases fatigue", run:() => ctx.bath()}});

  // your front door, from both sides
  const into = s;
  HOME.door = hingedDoor({hingeX:A.door - .47, z:A.wz - s*.1, base:base + .026, width:.94, height:2.044, into, color:0x6e4b34, label:`Flat ${G().home.apt}`, plate:G().home.apt,
    locked:() => { const fx = G().home.fx; return fx.lock === "new" && !!fx.locked; }});
  doorLock(HOME.door, A, base, s);
  plateSetup(HOME.door, F, A);
  // the football that came in through the window on the first morning, where it rolled to a stop
  if (G().home.win && G().home.win.state !== "ok"){ const [w0] = winsOf(D); propBall(w0 + .35, base + .13, Z(Dp - .75)); }
  doorway("x", A.wz - s*.1, A.door - .5, A.door + .5, base, 2.1, .2, {faces:[s], lining:0, proud:.05, color:0xf0eee8});

  // a clock on the wall that tells the time you live by
  const ct = textTex(128, 128, () => {});
  HOME.clock = {tex:ct, last:-1};
  const cm = label(ct, X(.03), base + 2.1, Z(Dp - 1.35), .34, .34, Math.PI/2, {transparent:true});
  cm.rotation.y = Math.PI/2;
}
/* the bathroom mirror over the sink: a slim rounded frame, the glass, a little shelf under it. Looking into it is
   where you change how you look (ctx.look, when the world offers it) */
function mirror(f, X, Z, base){
  rb(f, 0, 1.12, 0, .036, .62, .46, .017, 0xd9dcde, {seg:2, key:"metal"});
  rb(f, -.022, 1.15, 0, .004, .56, .4, 0, 0xdfe9ee, {key:"gloss"});
  // the glass: a cool, glossy pane with two soft diagonal glints across it (the stylised way a mirror reads)
  for (const [dz, dy, w] of [[-.05, 1.5, .05], [.04, 1.4, .025]]){
    const g = new THREE.BoxGeometry(.002, .5, w); g.rotateX(.62); g.translate(-.025, 0, 0);
    const pos = g.attributes.position; for (let i = 0; i < pos.count; i++) pos.setY(i, Math.max(-.27, Math.min(.27, pos.getY(i))));
    addGeo(g.translate(f.x, base + dy, f.z + dz), 0xf6fbff, {key:"gloss", ao:false, jit:0});
  }
  rb(f, -.03, 1.06, 0, .1, .02, .4, .008, 0xf2f2ee, {key:"gloss"});
  cy(f, -.05, 1.08, .12, .025, .022, .09, 0x6fa7c9, {seg:10});
  const [x, z] = [f.x, f.z];
  HOME.mirror = spot({x:x - .6, y:base + 1.45, z, r:1.8, aim:[[x - .06, base + 1.1, z - .24], [x + .02, base + 1.76, z + .24]], label:"Mirror", hint:"Change your look", hold:.2,
    run:() => { if (ctx.look) ctx.look(); else ctx.note("You look fine. Ready for training."); }});
}
function drawClock(){
  const c = HOME.clock; if (!c) return;
  const m = Math.floor(ctx.minute()); if (m === c.last) return; c.last = m;
  const g = c.tex.image.getContext("2d"), w = 128;
  g.clearRect(0, 0, w, w);
  g.fillStyle = "#f4f0e6"; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill();
  g.strokeStyle = "#2b2b2b"; g.lineWidth = 6; g.stroke();
  for (let i = 0; i < 12; i++){ const a = i/12*Math.PI*2; g.lineWidth = 3; g.beginPath(); g.moveTo(64 + Math.sin(a)*46, 64 - Math.cos(a)*46); g.lineTo(64 + Math.sin(a)*52, 64 - Math.cos(a)*52); g.stroke(); }
  const hh = (m/60) % 12, mm = m % 60;
  const hand = (a, l, wd) => { g.lineWidth = wd; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.sin(a)*l, 64 - Math.cos(a)*l); g.stroke(); };
  hand(hh/12*Math.PI*2, 28, 6); hand(mm/60*Math.PI*2, 42, 4);
  c.tex.needsUpdate = true;
}

function curtain(x, base, ext, s, i){
  const zIn = ext - s*.31;
  cyl(x, base + 2.56, zIn, .015, 1.9, C.darkMetal, {seg:6, rz:Math.PI/2});
  box(x - .97, base + 2.54, Math.min(zIn, ext), x - .93, base + 2.58, Math.max(zIn, ext), C.darkMetal, {ao:false}); box(x + .93, base + 2.54, Math.min(zIn, ext), x + .97, base + 2.58, Math.max(zIn, ext), C.darkMetal, {ao:false});
  box(x - .97, base + 2.5, zIn - .02, x - .93, base + 2.6, zIn + .02, C.darkMetal, {ao:false});
  box(x + .93, base + 2.5, zIn - .02, x + .97, base + 2.6, zIn + .02, C.darkMetal, {ao:false});
  const g = new THREE.PlaneGeometry(1.3, 1.78, 30, 1);
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++){ const x = p.getX(k); p.setZ(k, Math.sin(x*19)*.024 + Math.sin(x*7.3 + 1)*.012); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat({color:C.fabric, side:THREE.DoubleSide, roughness:1}));
  m.position.set(x, base + 2.55 - .89, zIn); W.scene.add(m);
  const left = s;      // looking out of the window, your left is +x at the front and −x at the back
  const st = G().home.curtains;
  const Cn = {t:st[i] ? 1 : 0, get closed(){ return !!G().home.curtains[i]; }, toggle(){ G().home.curtains[i] = !G().home.curtains[i]; }};
  const apply = () => {
    const sc = .26 + .74*Cn.t;
    m.scale.x = sc;
    m.position.x = x + left*(1 - Cn.t)*(.55 + .65*.26);
  };
  apply();
  W.anims.push(dt => {
    const tg = Cn.closed ? 1 : 0;
    if (Math.abs(tg - Cn.t) > .001){ Cn.t += (tg - Cn.t)*(1 - Math.exp(-6*dt)); apply(); }
  });
  spot({x, y:base + 1.6, z:zIn, aim:[[x - .85, base + .8, Math.min(zIn, zIn - s*.4)], [x + .85, base + 2.6, Math.max(zIn, ext)]],
    label:"Curtain", get hint(){ return Cn.closed ? "Open the curtain" : "Close the curtain"; }, hold:.12, run:() => Cn.toggle()});
  return Cn;
}

/* ---------- the wallpaper: the flat's walls all share one texture (the "t:paper" batch), so a new one is a new map ---------- */
const PAPER_TEX = {torn:"paperTorn", stripe:"paper", cream:"paperCream", sage:"paperSage", navy:"paperNavy"};
const PAPER_NAME = {torn:"the old torn wallpaper", stripe:"striped wallpaper", cream:"cream wallpaper", sage:"sage wallpaper", navy:"navy stripe wallpaper"};
export function applyPaper(){ const m = W.mats["t:paper"]; if (!m) return; m.map = tex(PAPER_TEX[G().home.fx.paper] || "paper"); m.needsUpdate = true; }
function hangPaper(it){
  const want = it.paper || "cream";
  ctx.timeLapse(90, "work", k => k < .3 ? "Stripping the old paper" : k < .55 ? "Pasting" : "Hanging the new wallpaper, strip by strip", () => {
    G().home.fx.paper = want; applyPaper();
    if (typeof FEED === "object") FEED.chip("New wallpaper up", "good");
    ctx.note(`Done — ${PAPER_NAME[want]} all round. It looks like somebody lives here now.`);
    ctx.persist(true);
  }, {icon:"🧻", dur:3.2});
}

/* ---------- the bed and the fridge: furniture.js (the tier of each is the one standing in your flat) ---------- */
export function bedTier(){ return bedTierNow(); }
export function refreshFridge(){ const q = pieceOf("fridge"); if (q && q.fridge) fillFridge(q.fridge.fill); }

/* ---------- the mailboxes in the lobby ---------- */
function mailboxes(){
  const h = G().home;
  reseed(h.seed + 7);
  const pool = typeof NAMES !== "undefined" && NAMES.RO ? NAMES.RO : {f:["Ion","Maria"], l:["Popescu","Ionescu"]};
  const names = {};
  for (let f = 1; f <= 3; f++) for (let d = 1; d <= 4; d++) names[`${f}0${d}`] = rnd() < .12 ? "" : `${pick(pool.f)[0]}. ${pick(pool.l)}`;
  names[h.apt] = G().player.name;
  // the cabinet, screwed to the lobby's east wall (its skin is at −6.12), the boxes' fronts facing into the lobby
  rbox(-6.185, .98, -.4, .13, 1.11, 2.48, .02, 0x5a3f28, {seg:2});
  rbox(-6.195, 2.09, -.4, .15, .05, 2.56, .02, 0x3f2c1c);
  solid(-6.27, -6.1, -1.68, .88, .98, 2.14);          // you stand in front of it, not in it
  const t = textTex(1024, 448, () => {});
  HOME.mailTex = {tex:t, names};
  drawMail();
  const m = label(t, -6.258, 1.535, -.4, 2.4, 1.05, -Math.PI/2);
  m.material.emissive = new THREE.Color(0x000000);
  const c = h.door - 1, r = h.floor - 1;
  const z0 = -1.6 + c*.6, y0 = 2.05 - (r + 1)*.35;
  // aimed at from the lobby, yours stands a few centimetres proud of the cabinet's own box, so it is what you look
  // at whenever you look at it (the cabinet is solid: you stand at least 26 cm off its face, x −6.36)
  mailGlow(-6.262, y0, z0);
  spot({x:-6.4, y:y0 + .17, z:z0 + .3, aim:[[-6.34, y0, z0], [-6.1, y0 + .35, z0 + .6]],
    label:`Your mailbox · ${h.apt}`, get hint(){ const n = unread(), o = owed(); return n ? `${n} new letter${n > 1 ? "s" : ""}` : o ? `You owe €${o}` : "Nothing new"; }, hold:.3,
    run:() => ctx.openMail()});
  spot({x:-6.4, y:1.5, z:-.4, aim:[[-6.28, .98, -1.64], [-6.1, 2.1, .84]], label:"Mailboxes", hint:"Find your name on one of them", hold:.2,
    run:() => ctx.note(`Yours is the one that says ${G().player.name} · ${h.apt}.`)});
}
/* your box glows yellow while there is post in it you have not read: a lit frame round its door and a soft halo on
   the cabinet, breathing slowly; it goes out the moment you have opened the box and read what was in it */
function mailGlow(x, y0, z0){
  const g = new THREE.Group(), y1 = y0 + .35, z1 = z0 + .6, t = .022, fm = new THREE.MeshBasicMaterial({color:0xffd84a, transparent:true, opacity:.95, toneMapped:false});
  for (const [ya, yb, za, zb] of [[y0 - t, y0, z0 - t, z1 + t], [y1, y1 + t, z0 - t, z1 + t], [y0, y1, z0 - t, z0], [y0, y1, z1, z1 + t]]){
    const m = new THREE.Mesh(new THREE.BoxGeometry(.012, yb - ya, zb - za), fm); m.position.set(x - .004, (ya + yb)/2, (za + zb)/2); g.add(m);
  }
  const cv = document.createElement("canvas"); cv.width = cv.height = 128; const c = cv.getContext("2d"), gr = c.createRadialGradient(64, 64, 10, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,214,80,.7)"); gr.addColorStop(.55, "rgba(255,200,60,.25)"); gr.addColorStop(1, "rgba(255,190,40,0)"); c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv), hm = new THREE.MeshBasicMaterial({map:tex, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, toneMapped:false});
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1.15, .85), hm); halo.rotation.y = -Math.PI/2; halo.position.set(x - .006, (y0 + y1)/2, (z0 + z1)/2); g.add(halo);
  g.visible = false; W.scene.add(g);
  let t0 = 0, chk = 0;
  W.anims.push(dt => {
    t0 += dt;
    if ((chk -= dt) <= 0){ chk = .4; g.visible = unread() > 0; }
    if (g.visible){ const k = .65 + .35*Math.sin(t0*3); fm.opacity = .7 + .3*k; hm.opacity = k; }
  });
}
export function drawMail(){
  const M = HOME.mailTex; if (!M) return;
  const h = G().home, g = M.tex.image.getContext("2d"), cw = 256, ch = 149;
  g.fillStyle = "#3b2a1a"; g.fillRect(0, 0, 1024, 448);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++){
    const x = c*cw, y = r*ch, apt = `${r + 1}0${c + 1}`, mine = apt === h.apt;
    const gr = g.createLinearGradient(x, y, x, y + ch); gr.addColorStop(0, "#b58e55"); gr.addColorStop(1, "#7d5c2e");
    g.fillStyle = gr; g.fillRect(x + 6, y + 6, cw - 12, ch - 12);
    g.strokeStyle = "#3a2810"; g.lineWidth = 3; g.strokeRect(x + 6, y + 6, cw - 12, ch - 12);
    g.fillStyle = "#1b130a"; g.fillRect(x + 40, y + 22, cw - 80, 10);                       // the slot
    g.fillStyle = "#efe6cf"; g.fillRect(x + 30, y + 52, cw - 60, 66);
    g.strokeStyle = "#8a7550"; g.lineWidth = 2; g.strokeRect(x + 30, y + 52, cw - 60, 66);
    g.fillStyle = "#1d1a14"; g.textAlign = "center"; g.textBaseline = "middle";
    const nm = M.names[apt] || "—";
    g.font = `${mine ? "bold " : ""}24px Georgia, serif`;
    g.fillText(nm.length > 16 ? nm.slice(0, 15) + "…" : nm, x + cw/2, y + 72);
    g.font = "bold 26px Georgia, serif"; g.fillText(apt, x + cw/2, y + 102);
    g.fillStyle = "#d9b46a"; g.beginPath(); g.arc(x + cw - 26, y + ch/2 + 10, 7, 0, 7); g.fill();
    if (mine && unread()){ g.fillStyle = "#e23b2e"; g.fillRect(x + cw - 54, y + 12, 40, 22); g.fillStyle = "#fff"; g.font = "bold 14px sans-serif"; g.fillText("POST", x + cw - 34, y + 24); }
  }
  M.tex.needsUpdate = true;
}

/* ---------- the notice board, next to the mailboxes ----------
   A cork board with whatever is going on in the block pinned to it (events.js: thieves about, a power cut, a car
   across the door), and the usual house rules when nothing is. E on it reads it properly. */
const HOUSE_RULES = [["Bins", "Bins go out Thursday night. Not before."], ["Quiet hours", "10 PM to 7 AM. This means you, 302."], ["Stairs", "Bikes do not live on the stairs."]];
function noticeBoard(){
  const x = -6.13, z0 = 1.05, z1 = 2.4, y0 = 1.15, y1 = 2.15, zc = (z0 + z1)/2;
  rbox(x - .02, y0 - .05, zc, .04, y1 - y0 + .1, z1 - z0 + .1, .015, 0x5a3f28);
  const t = textTex(768, 576, () => {});
  HOME.notices = {tex:t, key:""};
  const m = label(t, x - .045, (y0 + y1)/2, zc, z1 - z0, y1 - y0, -Math.PI/2);
  drawNotices();
  spot({aim:[[x - .3, y0, z0], [x, y1, z1]], label:"Notice board", get hint(){ const n = lifeEventsToday().length; return n ? `${n} notice${n > 1 ? "s" : ""} for today · read it` : "House rules · read it"; }, hold:.2,
    run:() => openNotices()});
}
function noticeList(){
  const list = typeof lifeEventsToday === "function" ? lifeEventsToday().map(ev => ({warn:true, title:eventText(ev), text:LIFE_EVENTS[ev.id].sub, until:ev.to})) : [];
  return list.concat(HOUSE_RULES.map(([t, d]) => ({title:t, text:d})));
}
export function drawNotices(){
  const N = HOME.notices; if (!N) return;
  const list = noticeList(), key = list.map(n => n.title).join("|");
  if (key === N.key) return; N.key = key;
  const g = N.tex.image.getContext("2d"), W_ = 768, H_ = 576;
  g.fillStyle = "#b98f5e"; g.fillRect(0, 0, W_, H_);
  for (let i = 0; i < 900; i++){ g.fillStyle = `rgba(${90 + Math.random()*60},${60 + Math.random()*40},30,.25)`; g.fillRect(Math.random()*W_, Math.random()*H_, 2, 2); }
  const papers = list.slice(0, 4);
  papers.forEach((n, i) => {
    const big = n.warn, w = big ? 700 : 330, h = big ? 150 : 150, x = big ? 34 : 34 + (i % 2)*360, y = 30 + i*(big ? 170 : 0) + (big ? 0 : 0);
    const yy = big ? 30 + i*172 : 30 + papers.filter(p => p.warn).length*172 + Math.floor((i - papers.filter(p => p.warn).length)/2)*170;
    const xx = big ? 34 : 34 + ((i - papers.filter(p => p.warn).length) % 2)*360;
    g.save(); g.translate(xx + w/2, yy + h/2); g.rotate((i % 2 ? -1 : 1)*.012); g.translate(-w/2, -h/2);
    g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(5, 6, w, h);
    g.fillStyle = big ? "#fff7d8" : "#f4f1e8"; g.fillRect(0, 0, w, h);
    if (big){ g.fillStyle = "#c8261f"; g.fillRect(0, 0, w, 10); }
    g.fillStyle = big ? "#a8231c" : "#1d2328"; g.font = `800 ${big ? 30 : 26}px "Barlow Condensed", sans-serif`; g.textAlign = "left";
    const wrap = (txt, max, lh, y0, font) => { g.font = font; let line = "", y = y0; for (const w2 of txt.split(" ")){ const t2 = (line + " " + w2).trim(); if (g.measureText(t2).width > max){ g.fillText(line, 16, y); line = w2; y += lh; } else line = t2; } g.fillText(line, 16, y); return y; };
    const ty = wrap(n.title, w - 32, 32, 44, `800 ${big ? 30 : 26}px "Barlow Condensed", sans-serif`);
    g.fillStyle = "#3a3f45"; wrap(n.text, w - 32, 22, ty + 28, `500 ${big ? 19 : 18}px "Barlow", sans-serif`);
    g.fillStyle = "#c8261f"; g.beginPath(); g.arc(w/2, 8, 7, 0, 7); g.fill();
    g.restore();
  });
  N.tex.needsUpdate = true;
}
function openNotices(){
  const list = noticeList(), esc2 = t => String(t).replace(/[&<>"]/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;"}[c]));
  if (typeof lpShow !== "function"){ ctx.note(list.map(n => n.title).join(" · ")); return; }
  lpShow("notices", `<div class="nb-panel">${typeof lpHead === "function" ? lpHead("Notice board", "The lobby") : "<h3>Notice board</h3>"}
    <div class="nb-list">${list.map(n => `<div class="nb-item${n.warn ? " warn" : ""}"><b>${esc2(n.title)}</b><p>${esc2(n.text)}</p>${n.warn && n.until != null ? `<em>${n.until > G().life.day ? `Until ${dayName((G().life.wd + n.until - G().life.day) % 7)}` : "Today only"}</em>` : ""}</div>`).join("")}</div>
    <div class="gd-foot"><button class="btn" onclick="lpClose()">OK</button></div></div>`);
}

/* ---------- a car across your front door (events.js "blocked") ----------
   Parked half up on the pavement with its nose against the door, from the morning until the evening of the day the
   notice says. While it is there the lobby window is the way in and out: hold E at it to climb through. */
function blockedCar(){
  const c = carModel("hatch", 0x7a2f2f);
  c.position.set(-9.5, .13, 3.05 + c.userData.size[0]/2); c.rotation.set(-.055, -Math.PI/2, 0);       // nose to the wall, front wheels up on the step
  W.scene.add(c);
  const sz = c.userData.size, sol = solid(-9.5 - sz[2]/2, -9.5 + sz[2]/2, 3.0, 3.05 + sz[0], 0, 1.5);
  const on = () => typeof lifeEventOn === "function" && lifeEventOn("blocked");
  let shown = null;
  const set = v => { if (v === shown) return; shown = v; c.visible = v; sol.off = !v; W.shadowDirty = true; };
  set(on());
  W.anims.push(() => {
    const want = on();
    // never appears on top of you: it waits till you are out of its way
    if (want && !shown && VIEW.x > sol.x0 - .4 && VIEW.x < sol.x1 + .4 && VIEW.z > sol.z0 - .4 && VIEW.z < sol.z1 + .4) return;
    set(want);
  });
  // the window, from both sides
  const wx = (LOBBY_WIN[0] + LOBBY_WIN[1])/2;
  const climb = into => ctx.fade(() => {
    ctx.place(into ? {x:wx, z:2.15, y:G0, yaw:0} : {x:wx, z:3.75, y:.12, yaw:Math.PI});
    ctx.note(into ? "In through the lobby window. Not elegant, but you're in." : "Out through the lobby window, past the car. Somebody's going to get a note on their windscreen.");
  }, 900);
  const blk = () => on();
  spot({aim:[[LOBBY_WIN[0], LOBBY_WIN[2], 2.45], [LOBBY_WIN[1], LOBBY_WIN[3], 2.9]], label:"Lobby window", get hint(){ return blk() ? "The car's blocking the door — hold E to climb out" : "A window onto the street"; }, hold:.2,
    run:() => ctx.note(blk() ? "Hold E to climb out through the window." : "It only opens a crack. Use the door."),
    long:{time:1.4, label:"climb out", run:() => { if (blk()) climb(false); else ctx.note("It only opens a crack. Use the door."); }}});
  spot({aim:[[LOBBY_WIN[0], LOBBY_WIN[2], 2.95], [LOBBY_WIN[1], LOBBY_WIN[3], 3.35]], label:"Lobby window", get hint(){ return blk() ? "Your way in today — hold E to climb in" : "Your block's lobby"; }, hold:.2,
    run:() => ctx.note(blk() ? "Hold E to climb in through the window." : "That's the lobby. The door's right there."),
    long:{time:1.4, label:"climb in", run:() => { if (blk()) climb(true); else ctx.note("That's the lobby. The door's right there."); }}});
}

/* the delivery table: where couriers leave what you ordered (parcels.js) — in the lobby, to the right of the door as
   you look out, against the front wall, with a sign over it */
function deliveryTable(){
  const x0 = -13.05, x1 = -11.55, z0 = 2.2, z1 = 2.7, y = G0, top = y + .78;
  rbox((x0 + x1)/2, top - .04, (z0 + z1)/2, x1 - x0, .04, z1 - z0, .015, 0x8a5a35);
  rbox((x0 + x1)/2, top - .14, (z0 + z1)/2, x1 - x0 - .1, .1, z1 - z0 - .08, .012, 0x6e4529);
  for (const [x, z] of [[x0 + .05, z0 + .05], [x1 - .05, z0 + .05], [x0 + .05, z1 - .05], [x1 - .05, z1 - .05]]) rbox(x, y, z, .045, .74, .045, .01, 0x5e3c23);
  solid(x0, x1, z0, z1, y, top);
  const t = textTex(512, 120, g => {
    g.fillStyle = "#1f3a5a"; g.fillRect(0, 0, 512, 120); g.fillStyle = "#f2c230"; g.fillRect(0, 0, 512, 10);
    g.fillStyle = "#fff"; g.font = "800 46px 'Barlow Condensed', 'Arial Narrow', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("DELIVERIES · LIVRĂRI", 256, 52);
    g.font = "600 20px 'Barlow', sans-serif"; g.fillStyle = "rgba(255,255,255,.8)"; g.fillText("Couriers leave parcels here", 256, 94);
  });
  label(t, (x0 + x1)/2, y + 1.62, 2.731, 1.0, .235, Math.PI, {glow:.25});
  const yy = top + .002, zc = (z0 + z1)/2;
  deliveryPoint("home", "the delivery table in your lobby", [[x0 + .32, yy, zc, .25], [(x0 + x1)/2, yy, zc, -.15], [x1 - .32, yy, zc, .35]]);
}

/* ================= the streets ================= */
function streets(){
  // roads, pavements, kerbs and markings
  box(-60, -.2, -80, 90, 0, 112, 0xffffff, {tex:"grass", ao:false, jit:0});
  box(-34, 0, 6, 46, .01, 14, 0xffffff, {tex:"asphalt", ao:false, jit:0});
  // the road across the end of your street runs on both ways now: north up Strada Morii, south down Bulevardul Gării
  box(34, 0, -62, 42, .01, 6, 0xffffff, {tex:"asphalt", ao:false, jit:0}); box(34, 0, 14, 42, .01, 94, 0xffffff, {tex:"asphalt", ao:false, jit:0});
  // each pavement's slabs stop where its kerb begins (k: [x0, x1, z0, z1] of the slab part), so no top lies under a kerb's
  const pave = (x0, x1, z0, z1, k = [x0, x1, z0, z1]) => { box(k[0], 0, k[2], k[1], .12, k[3], 0xffffff, {tex:"slabs", ao:false, jit:0}); floor(x0, x1, z0, z1, .12); };
  pave(-34, 34, 3, 6, [-34, 33.82, 3, 5.82]); pave(-34, 31, 14, 17, [-34, 31, 14.18, 17]); pave(31, 34, -62, 3, [31, 33.82, -62, 3]);
  pave(42, 45, -62, 94, [42.18, 45, -62, 94]); pave(31, 34, 14, 94, [31, 33.82, 14.18, 94]);
  // kerb stones along the road edges: a lighter strip, its top a hair above the slabs
  const K = 0xc4c1b9, KO = {ao:false, jit:0, tex:"concrete"};
  box(-34, 0, 5.82, 34, .124, 6.0, K, KO); box(-34, 0, 14, 33.82, .124, 14.18, K, KO);
  box(33.82, 0, -62, 34, .124, 5.82, K, KO); box(33.82, 0, 14.18, 34, .124, 94, K, KO); box(42, 0, -62, 42.18, .124, 94, K, KO);
  for (let x = -32; x < 33; x += 4) if (x + 2 < -1.2 || x > 7.2) box(x, .012, 9.93, x + 2, .016, 10.07, 0xe9e7df, {ao:false, jit:0});   // broken for the zebra
  for (let z = -60; z < 92; z += 4) if (z + 2 < 6 || z > 14) box(37.93, .012, z, 38.07, .016, z + 2, 0xe9e7df, {ao:false, jit:0});   // and at the junction
  for (let x = -1; x < 7; x += .9) box(x, .012, 6.3, x + .5, .016, 13.7, 0xeceae2, {ao:false, jit:0});   // zebra to the stop
  // the other blocks on your side and across the road
  const far = [[-31, -17], [-15, -2], [0, 14], [16, 30]];
  furnitureStore(ctx);                               // the block to your right as you come out: the furniture store downstairs
  far.forEach(([x0, x1], i) => { if (i !== 2) block({x0, x1, z0:17, z1:29}, "-z", C.brick[(i + 3) % C.brick.length], {doorAt:(x1 - x0)*.3, floors:4}); });
  barbershop(ctx);                                  // the third one across the road: the barber's on its ground floor
  [[-6, 7], [9, 21], [23, 32]].forEach(([z0, z1], i) => block({x0:45, x1:57, z0, z1}, "-x", C.brick[(i + 2) % C.brick.length], {doorAt:(z1 - z0)*.4}));
  // far away blocks so the sky has an edge: a mass, rows of dark windows, a coping
  for (const [x, z, w, d, h] of [[-50, -30, 14, 12, 15], [-20, -32, 16, 12, 18], [-6, -58, 14, 12, 15], [16, -78, 16, 12, 21], [52, -80, 14, 12, 18], [64, -40, 12, 18, 21],
    [-48, 40, 14, 12, 18], [0, 44, 18, 12, 15], [64, 18, 12, 18, 18], [-52, 10, 12, 18, 15], [-4, 74, 16, 12, 18], [62, 64, 12, 18, 15], [28, 104, 18, 12, 18]]){
    const c = pick([0x9b6a58, 0xb0a490, 0x8a96a1, 0xb3694c]);
    rbox(x + w/2, 0, z + d/2, w, h, d, .1, c, {tex:"paint", jit:.05});
    for (let y = 3.9; y + 1.3 < h - .3; y += LH){
      box(x - .02, y, z + .8, x + w + .02, y + 1.3, z + d - .8, 0x3a4652, {key:"gloss", ao:false, jit:.1});
      for (const [za, zb] of [[z - .02, z + .8], [z + d - .8, z + d + .02]]) box(x + .8, y, za, x + w - .8, y + 1.3, zb, 0x3a4652, {key:"gloss", ao:false, jit:.1});
    }
    box(x - .06, h, z - .06, x + w + .06, h + .12, z + d + .06, C.coping, {key:"metal", ao:false, jit:0});
  }
  // timber fences closing the gaps between blocks and the ends of the streets (fence(), below)
  for (const [x0, x1] of [[-16, -14], [0, 2], [15, 17.5], [30, 31]]) fence(x0, 2.9, x1, 3.0);
  for (const [x0, x1] of [[-17, -15], [-2, 0], [14, 16]]) fence(x0, 17, x1, 17.1);
  fence(-33.2, 3, -33.1, 17);
  barrier(31, -61.9, 45, -61.7); barrier(31, 93.6, 45, 93.8);      // where the two roads end
  extendStreets(ctx);
  fence(-31, 17, -34, 17.1); fence(30, 17, 31, 17.1); fence(-34, 2.9, -31, 3);
  // trees, street lamps, bins and bollards, all standing on the pavement
  // (every tree stands in front of a fence or a blank stretch of wall: none in front of a garage, a door, a shop or a
  // drive, and none under a street lamp)
  for (const x of [-32.3, -16, -1, 15]) tree(x, 15.6);
  for (const x of [-32, -15, 16.2]) tree(x, 5.3);
  for (const z of [8, 22]) tree(43.6, z);
  for (const x of [-30, -18, -4, 12, 26]) streetLamp(x, 14.4, 1, .12);
  for (const x of [-24, 0, 18, 31.6]) streetLamp(x, 5.6, -1, .12);
  bin(-11.7, 3.6, 0, .12); bin(16.6, 3.6, 0, .12); bin(8, 16.6, Math.PI, .12);
  for (const x of [19.5, 21.8]) bollard(x, 5.5, .12);
  planter(-.9, 3.8, 1.5, .12);
  propBench(-19.5, 16.2, Math.PI, 2.2, {y:.12});
  // parked cars
  parked(-24, 7.1, 0, 2, "hatch"); parked(-12, 12.9, Math.PI, 3, "sport"); parked(9.5, 7.1, 0, 0, "hatch"); parked(35.1, 20, Math.PI/2, 1, "muscle");
  // the bus stop across the road
  busStop(3, 15.2);
}
// a timber fence: boards, a capping rail, posts
export function fence(x0, z0, x1, z1, y = .12){
  box(x0, y, z0, x1, y + 1.8, z1, 0x8c7458, {solid:true, ao:false, tex:"planks", jit:.04});
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len/2)), ax = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  for (let i = 0; i <= n; i++){ const t = i/n, x = x0 + (x1 - x0)*t, z = z0 + (z1 - z0)*t; rbox(x, y, z, .14, 1.95, .14, .012, 0x4a3a2a, {jit:0}); }   // thicker than the boards, so their faces never meet
  box(x0 - (ax ? 0 : .03), y + 1.8, z0 - (ax ? .03 : 0), x1 + (ax ? 0 : .03), y + 1.85, z1 + (ax ? .03 : 0), 0x4a3a2a, {ao:false, jit:0});
}
function barrier(x0, z0, x1, z1){
  box(x0, 0, z0, x1, 1.1, z1, 0x5f666c, {solid:true, ao:false, key:"metal"});
  for (let x = x0 + .02; x < x1 - .4; x += .8) box(x, .65, z0 - .03, x + .4, .95, z1 + .03, x % 1.6 < .8 ? 0xd23c2c : 0xf2f0ea, {ao:false, jit:0});
  for (let x = x0 + .3; x < x1; x += 2.8) rbox(x, 0, (z0 + z1)/2, .14, 1.15, .3, .03, 0x3d4347, {jit:0});
}
export function tree(x, z, s){
  propTree(x, z, s || 1);
  rbox(x, .12, z, 1.3, .02, 1.3, .3, 0x4a3a2c, {jit:0});
}
export function lampPost(x, z, dir){ streetLamp(x, z, dir, .12); }
// the advert (left, 0–.7) and the timetable (right, top) printed on one canvas
function stopTex(){
  return textTex(512, 512, g => {
    const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, "#1f5fb0"); gr.addColorStop(1, "#0f2c55");
    g.fillStyle = gr; g.fillRect(0, 0, 358, 512);
    g.fillStyle = "#c8f060"; g.beginPath(); g.arc(250, 150, 120, 0, 7); g.fill();
    g.fillStyle = "#f2f2ee"; g.beginPath(); g.arc(250, 150, 52, 0, 7); g.fill();                         // a ball in a lime sun
    g.strokeStyle = "#14202c"; g.lineWidth = 5; g.stroke();
    g.fillStyle = "#14202c"; g.beginPath(); for (let k = 0; k < 5; k++){ const a = k*1.2566 - 1.57; g.lineTo(250 + Math.cos(a)*20, 150 + Math.sin(a)*20); } g.fill();
    g.fillStyle = "#fff"; g.textAlign = "left"; g.textBaseline = "alphabetic";
    g.font = `800 64px "Barlow Condensed", "Arial Narrow", sans-serif`; g.fillText("FUEL", 28, 352); g.fillText("UP.", 28, 414);
    g.fillStyle = "rgba(255,255,255,.8)"; g.font = `600 22px "Barlow", sans-serif`; g.fillText("Recovery drinks", 28, 452); g.fillText("2 for €3 · Mini Market", 28, 480);
    // the timetable: a header and the times, in rows
    g.fillStyle = "#f2f0ea"; g.fillRect(358, 0, 154, 224); g.fillStyle = "#1d6fc4"; g.fillRect(358, 0, 154, 40);
    g.fillStyle = "#fff"; g.font = "bold 22px sans-serif"; g.textAlign = "center"; g.fillText("LINE 14", 435, 28);
    g.fillStyle = "#3a3f45"; g.font = "15px sans-serif";
    ["06:40", "07:20", "08:00", "08:40", "09:20", "10:00", "17:10", "18:30"].forEach((t, i) => { g.textAlign = "left"; g.fillText(t, 370, 64 + i*20); g.fillStyle = "#9aa0a6"; g.fillRect(420, 59 + i*20, 80, 3); g.fillStyle = "#3a3f45"; });
  });
}
export function busStop(x, z, o = {}){
  const dz = o.flip ? -1 : 1, y = o.y == null ? .12 : o.y;     // the shelter's back is towards +z unless flipped
  const zb = z + dz*1.2, zf = z - dz*.15, steel = 0x3b4146, M = {key:"metal"}, GL = {key:"glass", ao:false, jit:0};
  // a steel frame, a framed glass back and glass ends, a slim roof with a strip light under it
  for (const px of [x - 1.75, x + 1.75]) for (const pz of [zb, zf]) rbox(px, y, pz, .08, 2.5, .08, .012, steel, M);
  box(x - 1.71, y + .3, Math.min(zb, zb + dz*.02), x + 1.71, y + 2.2, Math.max(zb, zb + dz*.02), 0x9fb7c6, GL);
  for (const yy of [y + .25, y + 2.2]) box(x - 1.71, yy, zb - .03, x + 1.71, yy + .05, zb + .03, steel, {key:"metal", ao:false});
  for (const px of [x - 1.75, x + 1.75]) box(px - .01, y + .3, Math.min(zb, z + dz*.35), px + .01, y + 2.2, Math.max(zb, z + dz*.35), 0x9fb7c6, GL);
  rbox(x, y + 2.5, (zb + dz*.15 + z - dz*.4)/2, 3.95, .1, Math.abs(zb + dz*.15 - (z - dz*.4)), .04, 0x2a2f33, M);
  box(x - 1.5, y + 2.47, Math.min(zb - dz*.1, z), x + 1.5, y + 2.5, Math.max(zb - dz*.1, z), 0xfff1d0, {key:"lamp", ao:false});
  // a lit advert in the left bay of the back, and a perch bench
  box(x - 1.6, y + .45, Math.min(zb - dz*.04, zb - dz*.07), x - .5, y + 2.0, Math.max(zb - dz*.04, zb - dz*.07), 0x2a2f33, {key:"metal", ao:false, jit:0});
  box(x - 1.65, y + .4, Math.min(zb - dz*.03, zb - dz*.08), x - .45, y + .45, Math.max(zb - dz*.03, zb - dz*.08), steel, {key:"metal", ao:false});
  propBench(x + .35, zb - dz*.42, o.flip ? Math.PI : 0, 2.2, {y, back:false});
  solid(x - 1.8, x + 1.8, Math.min(zb - .1, zb + .1), Math.max(zb - .1, zb + .1), y, y + 2.6);
  for (const px of [x - 1.75, x + 1.75]) solid(px - .06, px + .06, Math.min(zf, zb), Math.max(zf, zb), y, y + 2.6);
  const sx = x + 2.4;
  cyl(sx, y, z, .05, 2.9, 0x3b4146, {seg:8, key:"metal"});
  box(sx - .16, y + 1.3, z - .03, sx + .16, y + 1.75, z + .03, 0x2a2f33, {ao:false, key:"metal"});          // the timetable's case
  // the poster in the advert case and the printed timetable: one sheet, one mesh
  const ry = o.flip ? 0 : Math.PI;
  labels(stopTex(), [{x:x - 1.05, y:y + 1.225, z:zb - dz*.072, w:1.02, h:1.47, ry, uv:[0, 0, .7, 1]},
    {x:sx, y:y + 1.525, z:z - dz*.032, w:.28, h:.41, ry, uv:[.7, 0, 1, .4375]}], {glow:.45, rough:.5});
  const t = textTex(128, 128, (g) => {
    g.fillStyle = "#1d6fc4"; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill();
    g.strokeStyle = "#fff"; g.lineWidth = 6; g.stroke(); g.fillStyle = "#fff"; g.font = "bold 42px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("BUS", 64, 66);
  });
  cyl(sx, y + 2.68, z, .262, .11, 0x2a2f33, {seg:20, rx:Math.PI/2, key:"metal"});                // the disc's rim, between its two faces
  label(t, sx, y + 2.68, z - dz*.06, .55, .55, o.flip ? 0 : Math.PI, {transparent:true, alphaTest:.5});
  label(t, sx, y + 2.68, z + dz*.06, .55, .55, o.flip ? Math.PI : 0, {transparent:true, alphaTest:.5});
  solid(sx - .1, sx + .1, z - .1, z + .1, y, y + 3);
}

/* ================= put it all together ================= */
export function buildHome(c){
  ctx = c;
  H = ensureHome();
  reseed(H.seed);
  W.bounds = {x0:-32.8, x1:58.8, z0:-61.4, z1:93.4};
  streets();
  reseed(H.seed + 3);
  myBlock(H.floor, H.door);
  myFlat(H.floor, H.door);
  mailboxes();
  deliveryTable();
  noticeBoard();
  blockedCar();
  // the way in
  HOME.entrance = hingedDoor({hingeX:-10.22, z:2.875, base:G0 + .014, width:1.44, height:2.306, into:-1, color:0x2f3a44, glass:true, label:"Your block"});
  // lamps in the lobby, flush with the ceiling
  lightSrc({x:-10, y:2.6, z:-1, color:0xffe2b0, intensity:9, distance:9, indoor:true, on:powerOn});
  for (const z of [-1, 1.6]){ rbox(-10, 2.9, z, .5, .05, .5, .02, 0xfff3d6, {key:"lampB"}); rbox(-10, 2.93, z, .56, .02, .56, .01, C.darkMetal); }
  spot({x:3, y:1.2, z:15.4, r:2.6, aim:[[1.2, 0, 14.6], [4.8, 2.7, 16.8]], near:true, label:"Bus stop · Strada Teiului", hint:"Line 14 · the training centre, Dumbrava", hold:.4, run:() => ctx.busMenu()});
  reseed(H.seed + 11);
  miniMarket(ctx);
  // the first job, next door to your block (units.js: the same shop shell as every other workplace)
  jobUnit("cafe", TX("+z", 8.5, -3), ctx, {zone:"home", floors:3, brick:0xa8392f});
  // the places the compass knows on these streets, and the words for being in them (world.js placeName)
  W.places.push({name:"Home", kind:"home", x:-9.5, z:3.6},
    {name:"Mini Market", kind:"shop", x:20.7, z:3.6, at:"in the Mini Market", b:{x0:17.5, x1:30, z0:-5.5, z1:3}},
    {name:"Mobila Bună", kind:"furniture", x:-17.95, z:3.6, at:"in Mobila Bună", b:{x0:-31, x1:-16, z0:-9, z1:3}},
    {name:"Fade & Co.", kind:"barber", x:11.9, z:16.6, at:"at the barber's", b:{x0:0, x1:14, z0:17, z1:24.5}},
    {name:"Bus stop", kind:"bus", x:3, z:15.2},
    {name:"Park", kind:"park", x:31, z:51.5, at:"in the park", b:{x0:18, x1:31, z0:49, z1:69}});
  finishBatches();
  applyPaper();
  winRefresh();
  // people out on the street: an eastern loop over the zebra and back across the junction, a western one that
  // crosses at the quiet end; a handful at the busy times of day, nobody in the small hours
  HOME.street = pedestrians({zone:"home", minute:ctx.minute, seed:H.seed + 500, max:6, count:streetCount, routes:[
    [[1.4, 4.75], [30.8, 4.75], [32.75, 4.95], [32.75, 5.5, 1.4, 1], [32.75, 14.5, 1.4, -1], [30.6, 14.85], [6.3, 14.85], [5.75, 14.62], [1.4, 14.62], [1.1, 14.3, 1.3, 1], [1.1, 5.55, 1.3, -1]],
    [[-1.2, 4.45], [-28.0, 4.45], [-28.7, 5.5, 1.4, 1], [-28.7, 14.5, 1.4, -1], [-28.0, 14.85], [-1.2, 14.85], [-.6, 14.35, 1.2, 1], [-.6, 5.55, 1.2, -1]]]});
  return {
    bed:besideBed(),
    bus:{x:3, z:15.3, y:.12, yaw:0}            // under the shelter roof, clear of the bench behind
  };
}
// where you wake up: beside your bed, on its open side, facing into the room
function besideBed(){
  const F = HOME.flat, q = pieceOf("bed"), base = F.base;
  const cx = F.A.x0 + (F.A.x1 - F.A.x0)/2, cz = F.A.wz + F.s*F.Dp*.6;
  if (!q) return {x:cx, z:cz, y:base, yaw:0};
  const ax = Math.cos(q.p.ry), az = -Math.sin(q.p.ry), off = q.model.w/2 + .55;
  const inFlat = (x, z) => x > F.A.x0 + .35 && x < F.A.x1 - .35 && Math.abs(z - F.A.wz) > 2.4 && Math.abs(z - F.A.wz) < F.Dp - .35;
  const free = (x, z) => { let hit = false; SG.each(x - .26, z - .26, x + .26, z + .26, b => !b.off && b.y1 > base + .4 && b.y0 < base + 1.7 && x + .26 > b.x0 && x - .26 < b.x1 && z + .26 > b.z0 && z - .26 < b.z1 && (hit = true)); return !hit; };
  for (const k of [-1, 1]){
    const x = q.wx + ax*off*k, z = q.wz + az*off*k;
    if (inFlat(x, z) && free(x, z)) return {x, z, y:base, yaw:Math.atan2(-(cx - x), -(cz - z))};
  }
  return {x:cx, z:cz, y:base, yaw:0};
}
// in your flat or not: leaving it starts the thieves' clock (events.js), coming back in is when you find out
let inFlatWas = null;
function flatWatch(){
  const F = HOME.flat; if (!F) return;
  const z0 = Math.min(F.A.wz, F.A.ext), z1 = Math.max(F.A.wz, F.A.ext);
  const inF = VIEW.x > F.A.x0 && VIEW.x < F.A.x1 && VIEW.z > z0 + .15 && VIEW.z < z1 && Math.abs((VIEW.feet || 0) - F.base) < .7;
  if (inFlatWas === null){ inFlatWas = inF; return; }
  if (inF === inFlatWas) return;
  inFlatWas = inF;
  if (!inF){ if (typeof lifeAway === "function") lifeAway(false); }
  else if (typeof lifeTheft === "function"){ const r = lifeTheft("return"); if (r) ctx.robbed(r.lost); }
}
let winT = 0;
export function homeTick(){
  flatWatch();
  // your block's own lamps go dark in a power cut
  const lb = W.mats.lampB; if (lb){ const e = powerOn() ? 1.1 : 0; if (lb.emissiveIntensity !== e) lb.emissiveIntensity = e; } drawClock(); const t = performance.now(); if (t - winT > 2000){ winT = t; winRefresh(); drawNotices(); } }
// how many people are out walking at a minute of the day
function streetCount(m){
  const h = m/60;
  return h < 5.5 ? 0 : h < 6.5 ? 1 : h < 7 ? 2 : h < 9.5 ? 5 : h < 16.5 ? 4 : h < 19.5 ? 6 : h < 21.5 ? 4 : h < 23 ? 2 : 1;
}
export function resetHome(){ for (const k of Object.keys(HOME)) HOME[k] = k === "curtains" ? [] : null; inFlatWas = null; }
export function homeRefresh(){
  refreshFridge(); winRefresh();
  drawMail();
}
