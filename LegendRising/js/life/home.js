/* ============ LIFE: the neighbourhood ============
   A few streets of brick blocks. Only one door in the whole street is yours: the block on the near
   side, flat number on the mailbox in the lobby, up the stairs, your floor, your door. */
import {THREE, W, LH, box, cyl, blob, solid, floor, ramp, spot, wall, textTex, label, part, boxPart, lmat, reseed, rnd, pick, finishBatches, lightSrc, rbox} from "./build.js";
import {ensureHome, unread, owed} from "./rent.js";
import {frame, rb, cy, worldPt, tree as propTree, streetLamp, car as propCar, bin, bollard, planter, bench as propBench, PC} from "./props.js";
import {miniMarket, workplace} from "./shops.js";
import {fillFridge} from "./fridge.js";

const C = {
  brick:[0xa8392f, 0x92442f, 0xb8603c, 0x8c3a33, 0xc0ae8a, 0x7d8a94],
  trim:0x3b3431, plinth:0xb7b5ae, frame:0xf0eee8, glass:0x2a3846, sill:0xc9c4b8, roof:0x4a4746, coping:0x2f2b29,
  door:0x2a2b2f, garage:0x2e3135, metal:0x8f979e, darkMetal:0x4b5258,
  green:0x5f806b, cream:0xe3dbc8, ceiling:0xdcd8cf, step:0x9a968e, closet:0x7c6a55, lino:0x7a6650,
  wood:0x8b5a2b, wood2:0x6b4422, blanket:0x2f6a3b, white:0xf3f3ef, fridge:0xe9ddb0, handle:0x4a3324, fabric:0x8b8273
};
const BLD = {x0:-14, x1:0, z0:-9, z1:3};
const H4 = 4*LH;
/* the four flats on every floor: front two look onto the street, back two onto the yard */
export const APT = {
  1:{x0:-13.75, x1:-7.1,  door:-10.4, wz:-2.1, ext:2.75,  s:1},
  2:{x0:-6.9,   x1:-0.25, door:-3.6,  wz:-2.1, ext:2.75,  s:1},
  3:{x0:-9.625, x1:-5.1,  door:-6.0,  wz:-4.2, ext:-8.75, s:-1},
  4:{x0:-4.9,   x1:-0.25, door:-1.5,  wz:-4.2, ext:-8.75, s:-1}
};
const winsOf = d => { const a = APT[d], w = a.x1 - a.x0; return [a.x0 + w*.3, a.x0 + w*.7]; };

const G = () => (typeof S !== "undefined" ? S : null);
let ctx = null, H = null;
export const HOME = {door:null, entrance:null, fridge:null, curtains:[], light:null, bed:null, mailTex:null, clock:null};

/* ================= facades ================= */
export function facer(face, b){
  switch (face){
    case "+z": return {len:b.x1 - b.x0, box:(s0, s1, y0, y1, d0, d1, c, o) => box(b.x0 + s0, y0, b.z1 + d0, b.x0 + s1, y1, b.z1 + d1, c, o), at:(s, d) => [b.x0 + s, b.z1 + d]};
    case "-z": return {len:b.x1 - b.x0, box:(s0, s1, y0, y1, d0, d1, c, o) => box(b.x1 - s1, y0, b.z0 - d1, b.x1 - s0, y1, b.z0 - d0, c, o), at:(s, d) => [b.x1 - s, b.z0 - d]};
    case "+x": return {len:b.z1 - b.z0, box:(s0, s1, y0, y1, d0, d1, c, o) => box(b.x1 + d0, y0, b.z1 - s1, b.x1 + d1, y1, b.z1 - s0, c, o), at:(s, d) => [b.x1 + d, b.z1 - s]};
    case "-x": return {len:b.z1 - b.z0, box:(s0, s1, y0, y1, d0, d1, c, o) => box(b.x0 - d1, y0, b.z0 + s0, b.x0 - d0, y1, b.z0 + s1, c, o), at:(s, d) => [b.x0 - d, b.z0 + s]};
  }
}
export function decoWin(f, s, y, lit){
  const w = 1.1, h = 1.45, b = y + .9, t = b + h, fr = .08;
  f.box(s - w/2, s + w/2, b, t, -.02, .012, C.glass, {key:lit ? "lit" : "plain", jit:.2, ao:false});
  f.box(s - w/2, s - w/2 + fr, b, t, 0, .07, C.frame, {jit:0, ao:false});
  f.box(s + w/2 - fr, s + w/2, b, t, 0, .07, C.frame, {jit:0, ao:false});
  f.box(s - w/2 + fr, s + w/2 - fr, t - fr, t, 0, .07, C.frame, {jit:0, ao:false});
  f.box(s - w/2 + fr, s + w/2 - fr, b, b + fr, 0, .07, C.frame, {jit:0, ao:false});
  f.box(s - .03, s + .03, b + fr, t - fr, 0, .06, C.frame, {jit:0, ao:false});
  f.box(s - w/2 + fr, s - .03, b + h*.64, b + h*.64 + .05, 0, .055, C.frame, {jit:0, ao:false});
  f.box(s + .03, s + w/2 - fr, b + h*.64, b + h*.64 + .05, 0, .055, C.frame, {jit:0, ao:false});
  f.box(s - w/2 - .08, s + w/2 + .08, b - .09, b, 0, .15, C.sill, {ao:false});
  f.box(s - w/2 - .1, s + w/2 + .1, t, t + .17, 0, .05, C.trim, {ao:false});
}
function doorDeco(f, s, glassy){
  f.box(s - .62, s + .62, 0, 2.32, -.02, .03, glassy ? 0x33414d : C.door, {ao:false});
  if (glassy) f.box(s - .5, s + .5, .9, 2.2, .03, .04, 0x7f98aa, {key:"glass", ao:false});
  f.box(s - .72, s - .62, 0, 2.42, 0, .08, C.trim); f.box(s + .62, s + .72, 0, 2.42, 0, .08, C.trim);
  f.box(s - .72, s + .72, 2.32, 2.42, 0, .08, C.trim);
  f.box(s - .95, s + .95, 2.55, 2.66, 0, .8, C.coping, {ao:false});                    // the little canopy
  f.box(s - .95, s + .95, 0, .13, 0, .55, C.step);
  f.box(s + .35, s + .42, 1.0, 1.12, .03, .09, C.metal, {ao:false});                     // handle
}
function garageDeco(f, s0, s1){
  f.box(s0, s1, 0, 2.6, -.02, .03, C.garage, {ao:false});
  for (let y = .2; y < 2.6; y += .22) f.box(s0, s1, y, y + .025, .03, .045, 0x1f2124, {ao:false, jit:0});
  f.box(s0 - .1, s0, 0, 2.7, 0, .08, C.trim); f.box(s1, s1 + .1, 0, 2.7, 0, .08, C.trim); f.box(s0 - .1, s1 + .1, 2.6, 2.7, 0, .08, C.trim);
}
function ladder(f, s, h){
  for (const k of [-.24, .24]) f.box(s + k - .03, s + k + .03, 1.4, h + .9, .18, .24, C.darkMetal, {ao:false});
  for (let y = 1.6; y < h + .9; y += .32) f.box(s - .24, s + .24, y, y + .035, .19, .23, C.darkMetal, {ao:false, jit:0});
  for (let y = 2.4; y < h; y += 2.4) f.box(s - .26, s + .26, y, y + .04, 0, .22, C.darkMetal, {ao:false});
}
export function roofTop(b, h){
  box(b.x0, h, b.z0, b.x1, h + .06, b.z1, C.roof, {ao:false});
  const t = .3, p = .75;
  box(b.x0, h, b.z0, b.x1, h + p, b.z0 + t, C.trim); box(b.x0, h, b.z1 - t, b.x1, h + p, b.z1, C.trim);
  box(b.x0, h, b.z0, b.x0 + t, h + p, b.z1, C.trim); box(b.x1 - t, h, b.z0, b.x1, h + p, b.z1, C.trim);
  box(b.x0 - .05, h + p, b.z0 - .05, b.x1 + .05, h + p + .08, b.z0 + t + .05, C.coping, {ao:false});
  box(b.x0 - .05, h + p, b.z1 - t - .05, b.x1 + .05, h + p + .08, b.z1 + .05, C.coping, {ao:false});
  box(b.x0 - .05, h + p, b.z0, b.x0 + t + .05, h + p + .08, b.z1, C.coping, {ao:false});
  box(b.x1 - t - .05, h + p, b.z0, b.x1 + .05, h + p + .08, b.z1, C.coping, {ao:false});
  const cx = (b.x0 + b.x1)/2, cz = (b.z0 + b.z1)/2;
  // roof hatch hut, an air-con box, a vent and maybe a dish
  box(cx - 1.2, h, cz - 1, cx + .6, h + 2.1, cz + .8, C.trim);
  box(cx - .4, h, cz + .8, cx + .3, h + 1.8, cz + .82, C.door, {ao:false});
  const ax = b.x0 + 1.6 + rnd()*2, az = b.z0 + 1.4;
  box(ax - .5, h, az - .35, ax + .5, h + .7, az + .35, 0xb9bec2);
  cyl(ax, h + .7, az, .26, .02, 0x2a2d30, {seg:12});
  cyl(b.x1 - 1.5, h, cz + 1.5, .09, 1.2, C.darkMetal, {seg:8});
  if (rnd() < .7){
    const dx = b.x1 - 2.2, dz = b.z1 - 1.6;
    cyl(dx, h, dz, .04, 1.1, C.metal, {seg:6});
    cyl(dx, h + 1.25, dz, .38, .06, 0xd8dcdf, {seg:14, rx:-1.1});
  }
}
/* a block nobody lets you into */
function block(b, face, color, o = {}){
  const h = (o.floors || 4)*LH;
  box(b.x0, 0, b.z0, b.x1, h, b.z1, color, {solid:true});
  const f = facer(face, b), len = f.len;
  facadeDeco(f, len, h, o);
  // the sides get a couple of windows too, and some have the fire ladder
  if (o.sides !== false){
    for (const side of sideFaces(face)){
      const g = facer(side, b), sl = g.len;
      for (let L = 1; L < (o.floors || 4); L++) for (const s of [sl*.35, sl*.7]) decoWin(g, s, L*LH, rnd() < .25);
      pilasters(g, sl, h);
      if (rnd() < .5) ladder(g, sl*.15, h);
    }
  }
  roofTop(b, h);
  // its front door is locked, and it tells you so
  if (o.doorAt != null){
    const [x, z] = f.at(o.doorAt, .2);
    spot({x, y:1.2, z, aim:[[x - .8, 0, z - .8], [x + .8, 2.4, z + .8]], label:"Front door", hint:"Locked — you don't live here", hold:.15,
      run:() => ctx.note("Locked. You don't live in this block.")});
  }
}
const sideFaces = face => face[1] === "z" ? ["+x", "-x"] : ["+z", "-z"];
export function pilasters(f, len, h){
  f.box(0, .38, 0, h, 0, .07, C.trim); f.box(len - .38, len, 0, h, 0, .07, C.trim);
  f.box(0, len, 0, .45, 0, .05, C.plinth, {ao:false});
  f.box(-.02, len + .02, h - .22, h, 0, .12, C.trim, {ao:false});
}
function facadeDeco(f, len, h, o){
  pilasters(f, len, h);
  const floors = o.floors || 4;
  const per = Math.max(2, Math.round(len/3.4));
  const xs = o.wins || Array.from({length:per}, (_, i) => len*(i + .5)/per);
  for (let L = 1; L < floors; L++) for (const s of xs){
    if (o.skip && o.skip(L, s)) continue;
    decoWin(f, s, L*LH, rnd() < .3);
  }
  const door = o.doorAt != null ? o.doorAt : len*.3;
  if (!o.noDoor) doorDeco(f, door, o.glassDoor);
  if (o.garage !== false){ const g0 = len*.62, g1 = Math.min(len - .8, g0 + 3.4); garageDeco(f, g0, g1); }
  if (o.groundWin !== false) decoWin(f, len*.1 + .7, 0, false);
}

/* ================= your block ================= */
function twoTone(axis, fixed, a, b, base, top, holes = []){
  const lo = base + 1.15;
  wall(axis, fixed, a, b, base, lo, .02, C.green, holes, {solid:false, jit:.03, ao:false});
  wall(axis, fixed, a, b, lo, top, .02, C.cream, holes, {solid:false, jit:.03, ao:false});
}
function myBlock(F, D){
  const brick = C.brick[0];
  const doorHole = (x, base) => [x - .5, x + .5, base, base + 2.1];
  const winHoles = (L, side) => (L === F && ((side === "front" && D <= 2) || (side === "back" && D >= 3)))
    ? winsOf(D).map(x => [x - .55, x + .55, L*LH + .9, L*LH + 2.35]) : [];
  for (let L = 0; L < 4; L++){
    const y0 = L*LH, y1 = y0 + LH;
    wall("x", 2.875, -14, 0, y0, y1, .25, brick, [...(L === 0 ? [[-10.2, -8.8, 0, 2.3]] : []), ...winHoles(L, "front")]);
    wall("x", -8.875, -14, 0, y0, y1, .25, brick, winHoles(L, "back"));
    wall("z", -13.875, -8.75, 2.75, y0, y1, .25, brick);
    wall("z", -0.125, -8.75, 2.75, y0, y1, .25, brick);
  }
  // outside: the same dress as every other block, minus the windows that are really yours
  const ff = facer("+z", BLD), fb = facer("-z", BLD);
  const myWin = new Set(winsOf(D).map(x => x.toFixed(2)));
  facadeDeco(ff, 14, H4, {wins:[...winsOf(1), ...winsOf(2)].map(x => x + 14), doorAt:4.5, glassDoor:true, groundWin:true, noDoor:true,
    skip:(L, s) => L === F && D <= 2 && myWin.has((s - 14).toFixed(2))});
  // entrance frame and canopy around the real door
  ff.box(3.7, 3.8, 0, 2.42, 0, .08, C.trim); ff.box(5.2, 5.3, 0, 2.42, 0, .08, C.trim); ff.box(3.7, 5.3, 2.32, 2.42, 0, .08, C.trim);
  ff.box(3.4, 5.6, 2.55, 2.66, 0, .9, C.coping, {ao:false});
  box(-10.2, 0, 2.75, -10.16, 2.3, 3, 0xd8d3c8, {ao:false}); box(-8.84, 0, 2.75, -8.8, 2.3, 3, 0xd8d3c8, {ao:false});
  box(-10.2, 2.26, 2.75, -8.8, 2.3, 3, 0xd8d3c8, {ao:false}); box(-10.2, 0, 2.75, -8.8, .02, 3, 0x8d8a84, {ao:false});
  box(-10.9, 2.66, 3.6, -8.1, 2.68, 3.62, 0xf2e6bf, {key:"lamp", ao:false});
  const bw = [...winsOf(3), ...winsOf(4), -12.75];
  for (let L = 1; L < 4; L++) for (const x of bw){
    if (L === F && D >= 3 && myWin.has(x.toFixed(2))) continue;
    decoWin(fb, 0 - x, L*LH, rnd() < .25);
  }
  pilasters(fb, 14, H4);
  for (const side of ["+x", "-x"]){ const g = facer(side, BLD); pilasters(g, 12, H4); if (side === "-x") ladder(g, 2, H4); }
  roofTop(BLD, H4);
  // the real windows of your flat
  for (const x of winsOf(D)){
    if (D <= 2) realWin(x, F*LH, 3, 1); else realWin(x, F*LH, -9, -1);
  }

  // slabs: a hole in each one for the stairs
  for (let L = 1; L <= 4; L++){
    const y = L*LH;
    box(-13.75, y - .25, -4, -0.25, y, 2.75, C.ceiling, {ao:false});
    box(-9.875, y - .25, -8.75, -0.25, y, -4, C.ceiling, {ao:false});
    if (L === 4) box(-13.75, y - .25, -8.75, -9.875, y, -4, C.ceiling, {ao:false});
    if (L < 4){ floor(-13.75, -0.25, -4, 2.75, y); floor(-9.875, -0.25, -8.75, -4, y); }
  }
  // lobby floor and walls
  box(-13.75, 0, -8.75, -6.1, .02, 2.75, 0xffffff, {tex:"terrazzo", ao:false, jit:0});
  twoTone("x", 2.74, -13.75, -6.1, 0, 2.95, [[-10.2, -8.8, 0, 2.3]]);
  twoTone("z", -13.74, -4, 2.75, 0, 2.95);
  twoTone("z", -6.11, -8.75, 2.75, 0, 2.95);
  twoTone("x", -8.74, -9.625, -6.1, 0, 2.95);
  twoTone("z", -9.615, -8.75, -4, 0, 2.95);
  box(-6.1, 0, -8.75, -5.9, LH, 2.75, C.cream, {solid:true});              // the garage behind the lobby
  // the stairs: two flights a floor, round a middle wall
  box(-11.85, 0, -7, -11.65, H4 - .25, -4, C.cream, {solid:true});
  box(-9.875, 0, -8.75, -9.625, H4 - .25, -4, C.cream, {solid:true});
  box(-11.65, 0, -7, -9.875, 1.55, -4.02, C.closet, {solid:true});       // a cupboard under the first flight
  box(-13.75, 0, -8.75, -9.875, 1.3, -7, C.closet, {solid:true});
  for (let L = 0; L < 4; L++){
    const base = L*LH, top = base + LH - .25;
    twoTone("z", -13.74, -8.75, -4, base, base + LH);
    twoTone("x", -8.74, -13.75, -9.875, base, base + LH);
    twoTone("z", -9.885, -8.75, -4, base, base + LH);
    twoTone("z", -11.86, -7, -4, base, base + LH); twoTone("z", -11.64, -7, -4, base, base + LH);
    if (L > 0) twoTone("z", -13.74, -4, -2.31, base, top);
    if (L === 3) continue;
    for (let k = 0; k < 8; k++){
      const t1 = base + (k + 1)*.2;
      box(-13.75, t1 - .3, -4 - (k + 1)*.375, -11.85, t1, -4 - k*.375, C.step, {ao:false, jit:.04});
      const t2 = base + 1.6 + (k + 1)*.2;
      box(-11.65, t2 - .3, -7 + k*.375, -9.875, t2, -7 + (k + 1)*.375, C.step, {ao:false, jit:.04});
    }
    box(-13.75, base + 1.6 - .3, -8.75, -9.875, base + 1.6, -7, C.step, {ao:false});
    ramp(-13.75, -11.85, -7, -4, "z", -4, -7, base, base + 1.6);
    ramp(-11.65, -9.875, -7, -4, "z", -7, -4, base + 1.6, base + 3.2);
    floor(-13.75, -9.875, -8.75, -7, base + 1.6);
    box(-12.2, base + 1.6 + 2.3, -8.74, -11.3, base + 1.6 + 2.36, -8.6, 0xfff3d6, {key:"lamp", ao:false});
  }
  box(-13.75, 3*LH + .95, -4.05, -11.85, 3*LH + 1.02, -3.95, C.darkMetal, {solid:true});   // the rail at the top
  solid(-13.75, -11.85, -4.06, -3.94, 3*LH, 3*LH + 1.1);
  for (const x of [-13.6, -12.8, -12, -11.9]) box(x - .02, 3*LH, -4.02, x + .02, 3*LH + .95, -3.98, C.darkMetal, {ao:false});

  // the corridors on floors 1–3
  for (let L = 1; L < 4; L++){
    const base = L*LH, top = base + LH - .25;
    box(-13.75, base, -4, -0.25, base + .02, -2.3, C.lino, {ao:false});
    wall("x", -2.2, -13.75, -0.25, base, top, .2, C.cream, [doorHole(-10.4, base), doorHole(-3.6, base)]);
    wall("x", -4.1, -9.625, -0.25, base, top, .2, C.cream, [doorHole(-6.0, base), doorHole(-1.5, base)]);
    wall("z", -7, -2.1, 2.75, base, top, .2, C.cream);
    wall("z", -5, -8.75, -4.2, base, top, .2, C.cream);
    twoTone("x", -2.31, -13.75, -0.25, base, top, [doorHole(-10.4, base), doorHole(-3.6, base)]);
    twoTone("x", -3.99, -9.625, -0.25, base, top, [doorHole(-6.0, base), doorHole(-1.5, base)]);
    twoTone("z", -0.26, -3.99, -2.31, base, top);
    for (const x of [-11.5, -6.5, -2]) box(x - .3, top - .06, -3.3, x + .3, top, -3, 0xfff3d6, {key:"lamp", ao:false});
    lightSrc({x:-7, y:top - .3, z:-3.1, color:0xfff0d0, intensity:5, distance:9, indoor:true});
    for (let d = 1; d <= 4; d++){
      if (L === F && d === D) continue;
      staticDoor(L, d);
    }
  }
}
/* a window that is really a hole in the wall, with glass you can see through */
function realWin(x, base, face, s){
  const b = base + .9, t = b + 1.45, w = 1.1, h = w/2, zo = face, zi = face - s*.25, zm = face - s*.11;
  const Zs = (d0, d1) => { const a = zo - s*d0, c = zo - s*d1; return [Math.min(a, c), Math.max(a, c)]; };   // d measured inwards from the outside face
  const bx = (x0, x1, y0, y1, d0, d1, c, key) => { const [a, c2] = Zs(d0, d1); box(x0, y0, a, x1, y1, c2, c, {ao:false, jit:0, key}); };
  // outside: white frame, sill and the dark lintel (no two pieces share a face, so nothing flickers)
  bx(x - h, x - h + .08, b, t, -.06, 0, C.frame); bx(x + h - .08, x + h, b, t, -.06, 0, C.frame);
  bx(x - h + .08, x + h - .08, t - .08, t, -.06, 0, C.frame); bx(x - h + .08, x + h - .08, b, b + .06, -.06, 0, C.frame);
  bx(x - h - .08, x + h + .08, b - .09, b, -.15, 0, C.sill);
  bx(x - h - .1, x + h + .1, t, t + .17, -.05, 0, C.trim);
  // the reveal: the cut edges of the wall, plastered
  bx(x - h - .02, x - h + .03, b + .03, t - .03, 0, .275, 0xd8d3c8); bx(x + h - .03, x + h + .02, b + .03, t - .03, 0, .275, 0xd8d3c8);
  bx(x - h - .02, x + h + .02, t - .03, t + .02, 0, .275, 0xd8d3c8);
  bx(x - h - .02, x + h + .02, b - .02, b + .03, 0, .11 - .035, 0xe9e6de);
  // the window itself, set in the middle of the wall, dark like a newer frame
  const ib = (x0, x1, y0, y1) => bx(x0, x1, y0, y1, .11 - .035, .11 + .035, 0x2e3237);
  ib(x - h + .03, x - h + .11, b + .035, t - .03); ib(x + h - .11, x + h - .03, b + .035, t - .03);
  ib(x - h + .11, x + h - .11, t - .11, t - .03); ib(x - h + .11, x + h - .11, b + .035, b + .11);
  ib(x - .035, x + .035, b + .11, t - .11);
  bx(x - h + .11, x - .035, b + .11, t - .11, .108, .112, 0xa9c2d2, "glass");
  bx(x + .035, x + h - .11, b + .11, t - .11, .108, .112, 0xa9c2d2, "glass");
  // the window board inside, a little wider than the hole
  bx(x - h - .08, x + h + .08, b - .04, b + .035, .11 + .035, .25 + .24, 0xece9e2);
  bx(x - h - .08, x + h + .08, b - .12, b - .04, .25 + .2, .25 + .24, 0xe2ded6);
}
function plate(text, x, y, z, ry){ label(plateTex(text), x, y, z, .16, .08, ry); }
const DOOR_COL = [0x6e4b34, 0x7a3a2e, 0x5b6168, 0x5a4636, 0x3f4a3e];
function staticDoor(L, d){
  const a = APT[d], base = L*LH, z = d <= 2 ? -2.2 : -4.1, side = d <= 2 ? -1 : 1;
  const col = DOOR_COL[(L*4 + d*3) % DOOR_COL.length];
  box(a.door - .5, base, z - .03, a.door + .5, base + 2.1, z + .03, col, {solid:true, ao:false});
  for (const dz of [-.06, .06]) box(a.door + .32, base + 1.0, z + dz - .015, a.door + .4, base + 1.06, z + dz + .015, C.metal, {ao:false});
  frameAround(a.door, base, z, side);
  plate(`${L}0${d}`, a.door, base + 1.62, z + side*.032, side < 0 ? Math.PI : 0);
  const zz = z + side*.4;
  spot({x:a.door, y:base + 1.2, z:zz, aim:[[a.door - .55, base, Math.min(z, zz)], [a.door + .55, base + 2.2, Math.max(z, zz)]],
    label:`Flat ${L}0${d}`, hint:"Not yours — locked", hold:.15, run:() => ctx.note(`Locked. Somebody else lives at ${L}0${d}.`)});
}
function frameAround(x, base, z, side){
  const z0 = z + side*.1, z1 = z + side*.14, zz = [Math.min(z0, z1), Math.max(z0, z1)];
  box(x - .6, base, zz[0], x - .5, base + 2.2, zz[1], C.trim, {ao:false});
  box(x + .5, base, zz[0], x + .6, base + 2.2, zz[1], C.trim, {ao:false});
  box(x - .6, base + 2.1, zz[0], x + .6, base + 2.2, zz[1], C.trim, {ao:false});
}

/* ================= doors that open ================= */
function plateTex(text){
  return textTex(96, 48, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#d9b46a"); gr.addColorStop(1, "#9c7a3c");
    g.fillStyle = gr; g.fillRect(0, 0, w, h); g.strokeStyle = "#5d4520"; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
    g.fillStyle = "#2a1f10"; g.font = "bold 30px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, w/2, h/2 + 2);
  });
}
/* a door you open by pressing E, or by grabbing it with the mouse and dragging, like a real one */
export function hingedDoor(o){
  // o: hingeX, z, base, width, height, into (+1 = swings towards +z), color, glass, label, plate, handles
  const g = new THREE.Group(); g.position.set(o.hingeX, o.base, o.z);
  const leaf = boxPart(o.width, o.height, .05, o.color, o.width/2, o.height/2, 0, {cast:false});
  g.add(leaf);
  if (o.glass){ g.add(boxPart(o.width - .3, o.height*.55, .052, 0x9fb7c6, o.width/2, o.height*.6, 0, {mat:{transparent:true, opacity:.45}})); }
  else { for (const dz of [-.027, .027]) g.add(boxPart(o.width - .24, o.height*.36, .006, o.color, o.width/2, o.height*.7, dz, {mat:{color:o.color}})); }
  for (const dz of [-.05, .05]) g.add(boxPart(.14, .04, .03, C.metal, o.width - .16, 1.02, dz));
  for (const dz of [-.035, .035]) g.add(boxPart(.06, .14, .012, C.metal, o.width - .12, 1.02, dz));
  if (o.plate){
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(.16, .08), new THREE.MeshLambertMaterial({map:plateTex(o.plate)}));
    pm.position.set(o.width/2, 1.62, -o.into*.027); pm.rotation.y = o.into > 0 ? Math.PI : 0;
    g.add(pm);
  }
  W.scene.add(g);
  const sol = solid(o.hingeX, o.hingeX + o.width, o.z - .06, o.z + .06, o.base, o.base + o.height);
  const D = {g, a:0, target:0, sol, leaf, dragging:false, get open(){ return D.a > .4; },
    toggle(){ D.target = D.a > .4 ? 0 : 1.65; }};
  W.anims.push(dt => {
    D.a += (D.target - D.a)*(1 - Math.exp(-6*dt));
    g.rotation.y = -o.into*D.a;
    sol.off = D.a > .25;
  });
  const box3 = new THREE.Box3();
  spot({kind:"drag", label:o.label || "Door", get hint(){ return D.open ? "Close the door" : "Open the door"; }, y:o.base + 1.2,
    aim:() => { g.updateMatrixWorld(); box3.setFromObject(leaf); box3.expandByScalar(.06); return [box3.min.toArray(), box3.max.toArray()]; },
    spin:-o.into, get angle(){ return D.a; }, toggle:() => D.toggle(),
    drag(da){ D.a = Math.max(0, Math.min(1.75, D.a + da)); D.target = D.a; },
    hinge(){ return g.getWorldPosition(new THREE.Vector3()); },
    edge(){ g.updateMatrixWorld(); return g.localToWorld(new THREE.Vector3(o.width*.95, 1.0, 0)); }});
  return D;
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
  // walls: tired wallpaper
  wall("x", Z(.012), X(2.1), X(Wd), base, top, .02, 0xffffff, [[A.door - .5, A.door + .5, base, base + 2.1]], P.paper);
  wall("x", Z(Dp - .012), X(0), X(Wd), base, top, .02, 0xffffff, winsOf(D).map(x => [x - .55, x + .55, base + .9, base + 2.35]), P.paper);
  wall("z", X(.012), ...zr(2.3, Dp), base, top, .02, 0xffffff, [], P.paper);
  wall("z", X(Wd - .012), ...zr(0, Dp), base, top, .02, 0xffffff, [], P.paper);
  // the bathroom: two thin walls and a doorway
  wall("x", Z(2.25), X(0), X(2.1), base, top, .1, 0xd8cfb8, [[X(.55), X(1.45), base, base + 2.0]], {tex:"paper", jit:0});
  wall("z", X(2.05), ...zr(0, 2.3), base, top, .1, 0xd8cfb8, [], {tex:"paper", jit:0});
  wall("x", Z(.012), X(0), X(2.0), base, base + 1.6, .02, 0xffffff, [], P.tile);
  wall("z", X(.012), ...zr(0, 2.2), base, base + 1.6, .02, 0xffffff, [], P.tile);
  wall("z", X(1.99), ...zr(0, 2.2), base, base + 1.6, .02, 0xffffff, [], P.tile);
  wall("x", Z(2.19), X(0), X(2.0), base, base + 1.6, .02, 0xffffff, [[X(.55), X(1.45), base, base + 2.0]], P.tile);
  wall("x", Z(.012), X(0), X(2.0), base + 1.6, top, .02, 0xffffff, [], P.paper);
  wall("z", X(.012), ...zr(0, 2.2), base + 1.6, top, .02, 0xffffff, [], P.paper);
  wall("z", X(1.99), ...zr(0, 2.2), base + 1.6, top, .02, 0xffffff, [], P.paper);
  wall("x", Z(2.19), X(0), X(2.0), base + 1.6, top, .02, 0xffffff, [[X(.55), X(1.45), base, base + 2.0]], P.paper);
  // skirting boards round the room
  const sk = 0x5b3b22, SK = {ao:false, jit:.03};
  lb(2.1, du - .5, .02, .045, 0, .09, sk, SK); lb(du + .5, Wd, .02, .045, 0, .09, sk, SK);
  lb(0, Wd, Dp - .045, Dp - .02, 0, .09, sk, SK);
  lb(.02, .045, 2.3, Dp, 0, .09, sk, SK); lb(Wd - .045, Wd - .02, 0, Dp, 0, .09, sk, SK);
  // bath, toilet, sink and a mirror
  // the bath across the far end, the toilet on the left, the sink on the right: a clear path between
  lb(.05, 1.95, .05, .8, 0, .56, C.white, {solid:true});
  lb(.13, 1.87, .13, .72, .5, .565, 0xa9c4cf, {ao:false, jit:0});
  cyl(X(1.75), base + .62, Z(.09), .03, .12, C.metal, {seg:6});
  lb(.03, .25, 1.05, 1.55, .38, .95, C.white, {solid:true});
  cyl(X(.36), base, Z(1.3), .17, .42, C.white, {seg:12, rt:.2});
  cyl(X(.37), base + .42, Z(1.3), .2, .03, 0xe6e6e0, {seg:12});
  solid(...[X(.03), X(.56)], ...zr(1.08, 1.52), base, base + .45);
  lb(1.58, 1.98, 1.2, 1.68, .8, .9, C.white, {solid:true});
  cyl(X(1.82), base, Z(1.44), .08, .8, C.white, {seg:8});
  lb(1.975, 1.985, 1.24, 1.64, 1.15, 1.7, 0xbfd3dc, {ao:false, jit:0});
  lb(1.9, 1.98, 1.38, 1.5, .9, 1.02, C.metal, {ao:false});
  hingedDoor({hingeX:X(.55), z:Z(2.25), base, width:.9, height:2.0, into:-s, color:0xe6e1d6, label:"Bathroom"});
  lb(.9, 1.2, 1.0, 1.3, 2.7, 2.72, 0xfff3d6, {key:"lamp", ao:false});

  // the room: a table and a chair by the wall, a radiator under the window, a rug
  const tv0 = Dp - 1.65, tv1 = Dp - 1.05;
  lb(.12, .95, tv0, tv1, .72, .76, 0x9a6b42);
  for (const [u, v] of [[.16, tv0 + .04], [.88, tv0 + .04], [.16, tv1 - .07], [.88, tv1 - .07]]) lb(u, u + .05, v, v + .05, 0, .72, 0x6b4a2c);
  solid(X(.12), X(.95), ...zr(tv0, tv1), base, base + .76);
  cyl(X(.4), base + .76, Z(tv0 + .3), .045, .1, 0xe8e2d6, {seg:10});
  cyl(X(.7), base + .76, Z(tv0 + .25), .13, .015, 0xf0eee8, {seg:14});
  const cu0 = 1.02, cu1 = 1.45, cv0 = tv0 + .08, cv1 = tv0 + .52;
  lb(cu0, cu1, cv0, cv1, .43, .47, 0x7a5233);
  for (const [u, v] of [[cu0, cv0], [cu1 - .04, cv0], [cu0, cv1 - .04], [cu1 - .04, cv1 - .04]]) lb(u, u + .04, v, v + .04, 0, .43, 0x5b3d24);
  lb(cu1 - .05, cu1, cv0, cv1, .47, .92, 0x7a5233);
  solid(X(cu0), X(cu1), ...zr(cv0, cv1), base, base + .9);
  lb(.3, 2.0, Dp - 2.1, Dp - .7, .02, .028, 0x7b3b33, {ao:false, jit:0});
  const [w1] = winsOf(D);
  const ru = w1 - A.x0;
  lb(ru - .45, ru + .45, Dp - .14, Dp - .05, .16, .7, 0xe7e4dc);
  for (let k = -.4; k <= .41; k += .1) lb(ru + k - .012, ru + k + .012, Dp - .145, Dp - .14, .18, .68, 0xc9c6bd, {ao:false, jit:0});

  // the light: a bare bulb on a flex, and a switch by the door
  const bu = Wd*.55, bv = Dp*.55;
  cyl(X(bu), top - .5, Z(bv), .006, .5, 0x1c1c1c, {seg:4});
  cyl(X(bu), top - .04, Z(bv), .06, .04, 0xe8e4da, {seg:10});
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.055, 10, 8), new THREE.MeshStandardMaterial({color:0xfff6e0, emissive:0xffd590, emissiveIntensity:0}));
  bulb.position.set(X(bu), top - .58, Z(bv)); W.scene.add(bulb);
  const lamp = lightSrc({x:X(bu), y:top - .7, z:Z(bv), color:0xffd8a0, intensity:7, distance:11, decay:1.4, indoor:true, on:() => !!(G() && G().home && G().home.light)});
  const su = du + .78 < Wd - .2 ? du + .78 : du - .78;
  lb(su - .05, su + .05, .02, .035, 1.18, 1.32, 0xf2efe6, {ao:false});
  HOME.light = {
    set(on){ const h = G().home; h.light = on; bulb.material.emissiveIntensity = on ? 2.2 : 0; },
    get on(){ return !!G().home.light; }
  };
  HOME.light.set(G().home.light);
  spot({x:X(su), y:base + 1.25, z:Z(.04), aim:[[X(su) - .2, base + 1.0, Math.min(Z(0), Z(.3))], [X(su) + .2, base + 1.5, Math.max(Z(0), Z(.3))]],
    label:"Light switch", get hint(){ return HOME.light.on ? "Turn the light off" : "Turn the light on"; }, hold:.08,
    run:() => HOME.light.set(!HOME.light.on)});

  // windows: one curtain each, sliding left to open and right to close
  HOME.curtains = winsOf(D).map((x, i) => curtain(x, base, A.ext, s, i));

  // the bed (upgradable) against the side wall, the fridge beside the door
  HOME.bed = {u:Wd, v:Dp, X, Z, base, s, group:null, sol:solid(X(Wd - 1.15), X(Wd - .1), ...zr(Dp - 2.15, Dp - .1), base, base + .6)};
  makeBed();
  spot({x:X(Wd - .6), y:base + .6, z:Z(Dp - 1.1), aim:[[Math.min(X(Wd - 1.5), X(Wd)), base, zr(Dp - 2.15, Dp - .1)[0]], [X(Wd), base + .9, zr(Dp - 2.15, Dp - .1)[1]]],
    label:"Bed", get hint(){ const m = ctx.minute() % 1440; return m >= 19*60 || m < 5*60 ? "Sleep · wake tomorrow at 7:00 AM" : "Have a nap · 2 hours"; }, hold:1.2,
    run:() => ctx.sleep()});
  // a hot bath takes the ache out of your legs
  spot({aim:[[Math.min(X(.05), X(1.95)), base, Math.min(Z(.05), Z(.8))], [Math.max(X(.05), X(1.95)), base + .6, Math.max(Z(.05), Z(.8))]],
    x:X(1), z:Z(.45), label:"Bath", hint:"Hot bath · 30 min · eases fatigue", hold:.5, run:() => ctx.bath()});
  // the laptop on the table: your stats, your week, your career
  const lt = frame(X(.53), Z(tv0 + .3), s > 0 ? Math.PI : 0, base + .76);
  rb(lt, 0, 0, 0, .36, .018, .25, .008, 0x2b2f34, {key:"metal"});
  rb(lt, 0, .012, -.115, .36, .23, .012, .008, 0x2b2f34, {key:"metal", rx:-.28});
  const scr = textTex(256, 160, g => { const gr = g.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, "#14243a"); gr.addColorStop(1, "#0a1220"); g.fillStyle = gr; g.fillRect(0, 0, 256, 160);
    g.fillStyle = "#c8f060"; g.font = "bold 20px sans-serif"; g.fillText("CLUB PORTAL", 16, 32); g.fillStyle = "rgba(255,255,255,.75)"; g.font = "14px sans-serif";
    for (let i = 0; i < 4; i++){ g.fillRect(16, 52 + i*24, 90 + (i*37) % 110, 8); } });
  const [lsx, lsz] = worldPt(lt, 0, -.105);
  const lsm = label(scr, lsx, base + .76 + .125, lsz, .32, .2, lt.ry, {glow:.9, rough:.2}); lsm.rotateX(-.28);
  spot({aim:[[X(.53) - .25, base + .7, Math.min(Z(tv0 + .05), Z(tv0 + .55))], [X(.53) + .25, base + 1.05, Math.max(Z(tv0 + .05), Z(tv0 + .55))]],
    label:"Laptop", hint:"Check your stats, your week and your career", hold:.2, run:() => ctx.computer("home")});
  fridge(X, Z, base, Wd, s);

  // your front door, from both sides
  const into = s;
  HOME.door = hingedDoor({hingeX:A.door - .5, z:A.wz - s*.1, base, width:1.0, height:2.1, into, color:0x6e4b34, label:`Flat ${G().home.apt}`, plate:G().home.apt});
  frameAround(A.door, base, A.wz - s*.1, -s);

  // a clock on the wall that tells the time you live by
  const ct = textTex(128, 128, () => {});
  HOME.clock = {tex:ct, last:-1};
  const cm = label(ct, X(.013 + .002), base + 2.1, Z(Dp - 1.35), .34, .34, s > 0 ? Math.PI/2 : Math.PI/2, {transparent:true});
  cm.rotation.y = Math.PI/2;
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
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({color:C.fabric, side:THREE.DoubleSide}));
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

/* ---------- the bed: an old wooden one, and better ones from the Mall ---------- */
export function bedTier(){ const s = G(); return s && s.items ? (s.items.bed2 ? 2 : s.items.mattress ? 1 : 0) : 0; }
function makeBed(){
  const B = HOME.bed; if (!B) return;
  if (B.group){ W.scene.remove(B.group); B.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  const tier = bedTier(); B.tier = tier;
  const g = new THREE.Group(), w = tier === 2 ? 1.4 : 1.0, len = 2.0;
  const wood = tier === 2 ? 0x3b3f45 : C.wood, dark = tier === 2 ? 0x2c2f33 : C.wood2;
  const add = m => { m.castShadow = true; g.add(m); return m; };
  const post = (x, z, h) => add(boxPart(.1, h, .1, dark, x, h/2, z));
  // head at local +z
  post(-w/2, len/2, 1.05); post(w/2, len/2, 1.05); post(-w/2, -len/2, .78); post(w/2, -len/2, .78);
  for (const x of [-w/2, w/2]) add(boxPart(.06, .18, len, wood, x, .34, 0));
  add(boxPart(w, .16, .06, wood, 0, .5, -len/2));
  const sh = new THREE.Shape(); sh.moveTo(-w/2, 0); sh.lineTo(-w/2, .5); sh.quadraticCurveTo(0, .78, w/2, .5); sh.lineTo(w/2, 0); sh.lineTo(-w/2, 0);
  const hg = new THREE.ExtrudeGeometry(sh, {depth:.05, bevelEnabled:false});
  const head = add(part(hg, wood)); head.position.set(0, .42, len/2 - .05);
  const mattress = tier >= 1 ? .2 : .14;
  add(boxPart(w - .08, mattress, len - .1, 0xe9e4d6, 0, .42 + mattress/2, 0));
  const blanket = tier === 2 ? 0x2d4058 : tier === 1 ? 0x5a6b78 : C.blanket;
  const bt = .42 + mattress;
  add(boxPart(w + .04, .05, len*.74, blanket, 0, bt + .02, -len*.12));
  for (const x of [-(w/2 + .02), w/2 + .02]) add(boxPart(.02, .28, len*.74, blanket, x, bt - .1, -len*.12));
  add(boxPart(w + .04, .26, .02, blanket, 0, bt - .1, -len/2 - .01 + .0));
  const pil = tier === 2 ? [-.33, .33] : [0];
  for (const x of pil) add(boxPart(tier === 2 ? .55 : .62, .12, .36, 0xf1eee6, x, bt + .07, len/2 - .32));
  g.position.set(B.X(B.u - w/2 - .12), B.base, B.Z(B.v - 1.12));
  if (B.s < 0) g.rotation.y = Math.PI;
  W.scene.add(g); B.group = g;
  B.sol.x0 = B.X(B.u - w - .14); B.w = w;
}

/* ---------- the fridge: drag the doors open, take what you bought ---------- */
function fridge(X, Z, base, Wd, s){
  const u0 = Wd - .68, u1 = Wd, v0 = 1.2, v1 = 1.9;
  const lb = (a0, a1, b0, b1, y0, y1, c, o = {}) => box(X(a0), base + y0, Z(b0), X(a1), base + y1, Z(b1), c, Object.assign({ao:false}, o));
  lb(u1 - .05, u1, v0, v1, 0, 1.62, C.fridge);
  lb(u0, u1, v0, v0 + .04, 0, 1.62, C.fridge); lb(u0, u1, v1 - .04, v1, 0, 1.62, C.fridge);
  lb(u0, u1, v0, v1, 1.57, 1.62, C.fridge); lb(u0, u1, v0, v1, 0, .07, 0x3a3a3a);
  lb(u0, u1, v0, v1, 1.1, 1.14, C.fridge);
  lb(u1 - .06, u1 - .05, v0 + .04, v1 - .04, .07, 1.57, 0xf5f5f0, {key:"lamp"});          // the inside lights up
  lb(u0 + .02, u1 - .06, v0 + .04, v0 + .05, .07, 1.57, 0xf2f2ee); lb(u0 + .02, u1 - .06, v1 - .05, v1 - .04, .07, 1.57, 0xf2f2ee);
  lb(u0 + .02, u1 - .06, v0 + .04, v1 - .04, .07, .08, 0xeeeeea);
  lb(u0 + .04, u1 - .06, v0 + .04, v1 - .04, .55, .57, 0xd5e2e6);
  lb(u0 + .04, u1 - .06, v0 + .04, v1 - .04, 1.14, 1.15, 0xeeeeea);
  solid(X(u0 - .02), X(u1), Math.min(Z(v0), Z(v1)), Math.max(Z(v0), Z(v1)), base, base + 1.62);
  const doors = [[.07, 1.09, "Fridge"], [1.14, 1.6, "Freezer"]].map(([y0, y1, name]) => {
    const g = new THREE.Group(); g.position.set(X(u0), base, Z(v1));
    const h = y1 - y0, wv = v1 - v0;
    const leaf = boxPart(.05, h, wv, C.fridge, -.025, y0 + h/2, -s*wv/2, {cast:false}); g.add(leaf);
    g.add(boxPart(.008, h - .04, wv - .04, 0xf2f2ee, .002, y0 + h/2, -s*wv/2));            // the inside of the door
    const hy = name === "Fridge" ? y1 - .4 : y0 + .22;
    g.add(boxPart(.035, .3, .045, C.handle, -.07, hy, -s*(wv - .08)));
    g.add(boxPart(.03, .03, .045, C.handle, -.04, hy + .14, -s*(wv - .08)));
    g.add(boxPart(.03, .03, .045, C.handle, -.04, hy - .14, -s*(wv - .08)));
    W.scene.add(g);
    const Dd = {g, leaf, a:0, target:0, name};
    const box3 = new THREE.Box3();
    W.anims.push(dt => { Dd.a += (Dd.target - Dd.a)*(1 - Math.exp(-7*dt)); g.rotation.y = s*Dd.a; });
    spot({kind:"drag", label:name, get hint(){ return Dd.a > .5 ? "Close it" : "Open it"; }, y:base + y0 + h/2,
      aim:() => { g.updateMatrixWorld(); box3.setFromObject(leaf); box3.expandByScalar(.03); return [box3.min.toArray(), box3.max.toArray()]; },
      spin:s, get angle(){ return Dd.a; }, toggle(){ Dd.target = Dd.a > .5 ? 0 : 1.75; },
      drag(da){ Dd.a = Math.max(0, Math.min(1.9, Dd.a + da)); Dd.target = Dd.a; },
      hinge(){ return g.getWorldPosition(new THREE.Vector3()); },
      edge(){ g.updateMatrixWorld(); return g.localToWorld(new THREE.Vector3(-.05, y0 + h/2, -s*wv*.95)); }
    });
    return Dd;
  });
  const items = new THREE.Group(); W.scene.add(items);
  HOME.fridge = {doors, items, X, Z, base, u0, u1, v0, v1, s};
  refreshFridge();
}
export function refreshFridge(){
  const F = HOME.fridge; if (!F) return;
  if (!F.fill){
    const open = () => F.doors[0].a > 1.0;
    const at = (u, v) => [F.X(u), F.Z(v)];
    const slots = y => [0, 1].flatMap(row => [0, 1, 2].map(col => at(F.u0 + .2 + row*.2, F.v0 + .14 + col*.19)));
    const lo = [Math.min(F.X(F.u0), F.X(F.u1)) - .01, F.base + .07, Math.min(F.Z(F.v0), F.Z(F.v1))], hi = [Math.max(F.X(F.u0), F.X(F.u1)), F.base + 1.1, Math.max(F.Z(F.v0), F.Z(F.v1))];
    F.fill = {group:F.items, open, ctx, shelves:[{y:F.base + .08, kind:"food", slots:slots()}, {y:F.base + .58, kind:"drink", slots:slots()}], across:[0, .045], emptyAim:[lo, hi]};
  }
  fillFridge(F.fill);
}

/* ---------- the mailboxes in the lobby ---------- */
function mailboxes(){
  const h = G().home;
  reseed(h.seed + 7);
  const pool = typeof NAMES !== "undefined" && NAMES.RO ? NAMES.RO : {f:["Ion","Maria"], l:["Popescu","Ionescu"]};
  const names = {};
  for (let f = 1; f <= 3; f++) for (let d = 1; d <= 4; d++) names[`${f}0${d}`] = rnd() < .12 ? "" : `${pick(pool.f)[0]}. ${pick(pool.l)}`;
  names[h.apt] = G().player.name;
  // the cabinet on the lobby wall
  box(-6.34, .98, -1.64, -6.1, 2.09, .84, 0x5a3f28, {ao:false});
  box(-6.36, 2.09, -1.68, -6.1, 2.14, .88, 0x3f2c1c, {ao:false});
  const t = textTex(1024, 448, () => {});
  HOME.mailTex = {tex:t, names};
  drawMail();
  const m = label(t, -6.345, 1.535, -.4, 2.4, 1.05, -Math.PI/2);
  m.material.emissive = new THREE.Color(0x000000);
  const c = h.door - 1, r = h.floor - 1;
  const z0 = -1.6 + c*.6, y0 = 2.05 - (r + 1)*.35;
  spot({x:-6.4, y:y0 + .17, z:z0 + .3, aim:[[-6.9, y0, z0], [-6.1, y0 + .35, z0 + .6]],
    label:`Your mailbox · ${h.apt}`, get hint(){ const n = unread(), o = owed(); return n ? `${n} new letter${n > 1 ? "s" : ""}` : o ? `You owe €${o}` : "Nothing new"; }, hold:.3,
    run:() => ctx.openMail()});
  spot({x:-6.4, y:1.5, z:-.4, aim:[[-6.9, .98, -1.64], [-6.1, 2.1, .84]], label:"Mailboxes", hint:"Find your name on one of them", hold:.2,
    run:() => ctx.note(`Yours is the one that says ${G().player.name} · ${h.apt}.`)});
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

/* ================= the streets ================= */
function streets(){
  // roads, pavements, kerbs and markings
  box(-60, -.2, -60, 80, 0, 80, 0xffffff, {tex:"grass", ao:false, jit:0});
  box(-34, 0, 6, 46, .01, 14, 0xffffff, {tex:"asphalt", ao:false, jit:0});
  box(34, 0, -12, 42, .011, 32, 0xffffff, {tex:"asphalt", ao:false, jit:0});
  const pave = (x0, x1, z0, z1) => { box(x0, 0, z0, x1, .12, z1, 0xffffff, {tex:"slabs", ao:false, jit:0}); floor(x0, x1, z0, z1, .12); };
  pave(-34, 34, 3, 6); pave(-34, 31, 14, 17); pave(31, 34, -12, 6); pave(42, 45, -12, 32); pave(31, 34, 14, 32);
  box(-34, 0, 3, 46, .02, 3.02, 0x8d8f91, {ao:false});
  for (let x = -32; x < 33; x += 4) box(x, .012, 9.93, x + 2, .016, 10.07, 0xe9e7df, {ao:false, jit:0});
  for (let z = -10; z < 31; z += 4) box(37.93, .013, z, 38.07, .017, z + 2, 0xe9e7df, {ao:false, jit:0});
  for (let x = -1; x < 7; x += .9) box(x, .012, 6.3, x + .5, .016, 13.7, 0xeceae2, {ao:false, jit:0});   // zebra to the stop
  // the other blocks on your side and across the road
  const near = [[-31, -16]], far = [[-31, -17], [-15, -2], [0, 14], [16, 30]];
  near.forEach(([x0, x1], i) => block({x0, x1, z0:-9, z1:3}, "+z", C.brick[(i + 1) % C.brick.length], {doorAt:(x1 - x0)*.3}));
  far.forEach(([x0, x1], i) => block({x0, x1, z0:17, z1:29}, "-z", C.brick[(i + 3) % C.brick.length], {doorAt:(x1 - x0)*.3, floors:i === 2 ? 3 : 4}));
  [[-6, 7], [9, 21], [23, 32]].forEach(([z0, z1], i) => block({x0:45, x1:57, z0, z1}, "-x", C.brick[(i + 2) % C.brick.length], {doorAt:(z1 - z0)*.4}));
  // far away blocks so the sky has an edge
  for (const [x, z, w, d, h] of [[-50, -30, 14, 12, 15], [-20, -32, 16, 12, 18], [10, -34, 14, 12, 15], [40, -30, 14, 12, 21], [-48, 40, 14, 12, 18], [0, 44, 18, 12, 15], [62, 18, 12, 18, 18], [-52, 10, 12, 18, 15]])
    box(x, 0, z, x + w, h, z + d, pick([0x8b5a4a, 0x9a8e7e, 0x7b8691, 0xa3593f]), {ao:false});
  // fences closing the gaps between blocks, and the ends of the streets
  const fence = (x0, z0, x1, z1) => {
    box(x0, 0, z0, x1, 1.9, z1, 0x5f666c, {solid:true, ao:false});
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len/1.6);
    for (let i = 0; i <= n; i++){ const t = i/n, x = x0 + (x1 - x0)*t, z = z0 + (z1 - z0)*t; box(x - .05, 0, z - .05, x + .05, 2.0, z + .05, 0x3d4347, {ao:false}); }
  };
  for (const [x0, x1] of [[-16, -14], [0, 2], [15, 17.5], [30, 31]]) fence(x0, 2.9, x1, 3.0);
  for (const [x0, x1] of [[-17, -15], [-2, 0], [14, 16]]) fence(x0, 17, x1, 17.1);
  fence(-33.2, 3, -33.1, 17);
  barrier(31, -6.2, 45, -6.0); barrier(31, 29.4, 45, 29.6);
  fence(-31, 17, -34, 17.1); fence(30, 17, 31, 17.1); fence(-34, 2.9, -31, 3);
  // trees, street lamps, bins and bollards
  for (const x of [-26, -12, 10, 20]) tree(x, 15.6);
  for (const x of [-22, -4.5, 16.2]) tree(x, 5.3);
  for (const z of [-2, 22]) tree(43.6, z);
  for (const x of [-30, -18, -4, 12, 26]) streetLamp(x, 14.4, 1);
  for (const x of [-24, 0, 18, 31.6]) streetLamp(x, 5.6, -1);
  bin(-7.6, 3.6, 0); bin(16.6, 3.6, 0); bin(8, 16.6, Math.PI);
  for (const x of [19.5, 21.8]) bollard(x, 5.5);
  planter(-1.2, 3.8, 1.6);
  // parked cars
  propCar(-24, 7.1, 0, 0x8a2b2b); propCar(-12, 12.9, Math.PI, 0x3b5b7a); propCar(9.5, 7.1, 0, 0xd8d6cf); propCar(36, 20, Math.PI/2, 0x2f3a2f);
  // the bus stop across the road
  busStop(3, 15.2);
}
function barrier(x0, z0, x1, z1){
  box(x0, 0, z0, x1, 1.6, z1, 0x5f666c, {solid:true, ao:false});
  for (let x = x0; x < x1 - .4; x += .8) box(x, .65, z0 - .03, x + .4, .95, z1 + .03, x % 1.6 < .8 ? 0xd23c2c : 0xf2f0ea, {ao:false, jit:0});
}
export function tree(x, z, s){
  propTree(x, z, s || 1);
  rbox(x, .12, z, 1.3, .02, 1.3, .3, 0x4a3a2c, {jit:0});
}
export function lampPost(x, z, dir){ streetLamp(x, z, dir, .12); }
function car(x, z, ry, color){
  const g = new THREE.Group();
  const add = (m) => { m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  add(boxPart(4.1, .62, 1.72, color, 0, .62, 0));
  add(boxPart(2.2, .55, 1.56, color, -.2, 1.2, 0));
  add(boxPart(2.1, .46, 1.58, 0x25303a, -.2, 1.2, 0));
  add(boxPart(.06, .14, 1.5, 0xf4f0d8, 2.06, .7, 0)); add(boxPart(.06, .14, 1.5, 0xa52a2a, -2.06, .72, 0));
  for (const [wx, wz] of [[1.3, .86], [-1.3, .86], [1.3, -.86], [-1.3, -.86]]){
    const w = add(part(new THREE.CylinderGeometry(.33, .33, .24, 12), 0x1c1d1f)); w.rotation.x = Math.PI/2; w.position.set(wx, .33, wz);
  }
  g.position.set(x, 0, z); g.rotation.y = ry; W.scene.add(g);
  const hw = Math.abs(Math.cos(ry)) > .5 ? 2.1 : .9, hd = Math.abs(Math.cos(ry)) > .5 ? .9 : 2.1;
  solid(x - hw, x + hw, z - hd, z + hd, 0, 1.5);
}
export function busStop(x, z, o = {}){
  const dz = o.flip ? -1 : 1;     // the shelter's back is towards +z unless flipped
  const zb = z + dz*1.2;
  for (const px of [x - 1.7, x + 1.7]) box(px - .05, .12, zb - .05, px + .05, 2.6, zb + .05, 0x3b4146, {ao:false});
  for (const px of [x - 1.7, x + 1.7]) box(px - .05, .12, z - dz*.1 - .05, px + .05, 2.6, z - dz*.1 + .05, 0x3b4146, {ao:false});
  box(x - 1.65, .5, Math.min(zb, zb + dz*.02), x + 1.65, 2.3, Math.max(zb, zb + dz*.02), 0x9fb7c6, {key:"glass", ao:false, jit:0});
  box(x - 1.9, 2.6, Math.min(zb + dz*.2, z - dz*.35), x + 1.9, 2.72, Math.max(zb + dz*.2, z - dz*.35), 0x2a2f33, {ao:false});
  box(x - 1.3, .12, Math.min(zb - dz*.45, zb - dz*.05), x + 1.3, .55, Math.max(zb - dz*.45, zb - dz*.05), 0x6b4f3a);
  solid(x - 1.8, x + 1.8, Math.min(zb - .1, zb + .1), Math.max(zb - .1, zb + .1), 0, 2.6);
  const sx = x + 2.4;
  cyl(sx, .12, z, .05, 2.9, 0x3b4146, {seg:8});
  const t = textTex(128, 128, (g) => {
    g.fillStyle = "#1d6fc4"; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill();
    g.strokeStyle = "#fff"; g.lineWidth = 6; g.stroke(); g.fillStyle = "#fff"; g.font = "bold 42px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("BUS", 64, 66);
  });
  label(t, sx, 2.8, z - dz*.06, .55, .55, o.flip ? 0 : Math.PI);
  label(t, sx, 2.8, z + dz*.06, .55, .55, o.flip ? Math.PI : 0);
  solid(sx - .1, sx + .1, z - .1, z + .1, 0, 3);
}

/* ================= put it all together ================= */
export function buildHome(c){
  ctx = c;
  H = ensureHome();
  reseed(H.seed);
  W.bounds = {x0:-32.8, x1:44.6, z0:-8.7, z1:29.2};
  streets();
  reseed(H.seed + 3);
  myBlock(H.floor, H.door);
  myFlat(H.floor, H.door);
  mailboxes();
  // the way in
  HOME.entrance = hingedDoor({hingeX:-10.2, z:2.875, base:0, width:1.4, height:2.3, into:-1, color:0x2f3a44, glass:true, label:"Your block"});
  // a lamp in the lobby
  lightSrc({x:-10, y:2.6, z:-1, color:0xffe2b0, intensity:9, distance:9, indoor:true});
  box(-10.3, 2.9, -1.3, -9.7, 2.95, -.7, 0xfff3d6, {key:"lamp", ao:false});
  spot({x:3, y:1.2, z:15.4, r:2.6, aim:[[1.2, 0, 14.6], [4.8, 2.7, 16.8]], near:true, label:"Bus stop", hint:"Bus to the training ground · 40 min", hold:3, run:() => ctx.bus("ground")});
  reseed(H.seed + 11);
  miniMarket(ctx);
  workplace(ctx);
  finishBatches();
  const A = APT[H.door], Wd = A.x1 - A.x0, Dp = Math.abs(A.ext - A.wz);
  const base = H.floor*LH;
  return {
    bed:{x:A.x0 + Wd - (HOME.bed.w || 1) - .65, z:A.wz + A.s*(Dp - 1.5), y:base, yaw:A.s > 0 ? 0 : Math.PI},
    bus:{x:3, z:15.6, y:.12, yaw:0}
  };
}
export function homeTick(){ drawClock(); }
export function resetHome(){ for (const k of Object.keys(HOME)) HOME[k] = k === "curtains" ? [] : null; }
export function homeRefresh(){
  refreshFridge();
  if (HOME.bed && HOME.bed.tier !== bedTier()) makeBed();
  drawMail();
}
