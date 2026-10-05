/* ============ LIFE: the barber ============
   Fade & Co., the ground floor of the block across the road from yours (flats above, like everywhere else): a dark
   shopfront with a striped pole by the door (at the east end, clear of the bus shelter), a black-and-white chequered floor, three red leather chairs facing
   three lit mirrors, a counter of products under each, a trolley of clippers and scissors, a shelf of tubs and
   bottles, a bench to wait on by the window and the till by the door. Sit in a chair and the barber's book opens
   (js/ui/barber.js). The barber is in from opening to closing. */
import {LH, box, wall, floor, spot, label, textTex, lightSrc, pool, reseed, rnd, pick, doorway} from "./build.js";
import {frame, rb, cy, sph, fsolid, worldPt, PC} from "./props.js";
import {staffer} from "./npc.js";
import {facer, decoWin, pilasters, roofTop, downpipe} from "./home.js";

const G = () => (typeof S !== "undefined" ? S : null);
const FL = .12;                                  // the shop floor is level with the pavement: no step at the door
export const BARBER_B = {x0:0, x1:14, z0:17, z1:29};
const CHAIRS = [3.4, 6.8, 10.2];

// shelves of tubs and bottles (pomade, wax, tonic, shampoo)
function products(f, lx, y, w, seed){
  reseed(seed);
  const cols = [0x1f2a36, 0xc9a23e, 0x8a2f2a, 0xe9e6de, 0x2f6b5a, 0x3a3f46, 0xb76a3a];
  let x = -w/2 + .06;
  while (x < w/2 - .1){
    const c = pick(cols), r = .028 + rnd()*.022, h = .06 + rnd()*.16;
    if (rnd() < .45){ cy(f, lx + x + r, y, 0, r*1.15, r*1.15, Math.min(h, .07), c, {seg:10}); cy(f, lx + x + r, y + Math.min(h, .07), 0, r*1.18, r*1.18, .012, 0x15171a, {seg:10}); }
    else { cy(f, lx + x + r, y, 0, r*.85, r, h, c, {seg:8, key:"gloss"}); cy(f, lx + x + r, y + h, 0, r*.35, r*.35, .03, 0x15171a, {seg:6}); }
    x += r*2 + .02;
  }
}
// the barber's chair: a chrome pump base, red leather seat, back and headrest, chrome arms and a footrest. Faces +z.
function barberChair(x, z){
  const f = frame(x, z, 0, FL), leather = 0x7a1f22, chrome = 0xc9ced3;
  cy(f, 0, 0, 0, .3, .32, .05, chrome, {seg:16, key:"metal"});
  cy(f, 0, .05, 0, .065, .075, .34, chrome, {seg:12, key:"metal"});
  rb(f, 0, .38, 0, .5, .06, .5, .02, 0x2a2d31);
  rb(f, 0, .43, .02, .54, .12, .52, .05, leather, {seg:2});
  rb(f, 0, .5, -.25, .52, .66, .1, .05, leather, {seg:2, rx:-.16});
  rb(f, 0, 1.18, -.33, .3, .16, .09, .04, leather, {seg:2, rx:-.16});
  for (const s of [-1, 1]){
    rb(f, s*.31, .62, .02, .07, .05, .46, .02, leather);
    cy(f, s*.31, .43, .2, .015, .015, .19, chrome, {seg:6, key:"metal"});
  }
  // the footrest, out in front on two chrome struts
  rb(f, 0, .16, .46, .44, .03, .16, .01, chrome, {key:"metal"});
  for (const s of [-1, 1]) rb(f, s*.17, .17, .3, .03, .03, .26, .01, chrome, {key:"metal", rx:.5});
  fsolid(f, 0, 0, .66, .7, FL, FL + 1.2);
}
// a station on the back wall: a mirror in a dark frame with a light over it, a counter with drawers, things on it
function station(x, i){
  const wz = BARBER_B.z0 + 7.2;                  // the back wall's face
  box(x - .6, FL + .95, wz - .05, x + .6, FL + 2.25, wz, 0x1c1d20, {ao:false, jit:0});
  box(x - .53, FL + 1.02, wz - .06, x + .53, FL + 2.18, wz - .05, 0x9fb3bd, {key:"gloss", ao:false, jit:0});
  box(x - .55, FL + 2.31, wz - .09, x + .55, FL + 2.36, wz, 0xfff3d6, {key:"lamp", ao:false, jit:0});
  const f = frame(x, wz - .24, 0, FL);
  rb(f, 0, 0, 0, 1.3, .84, .44, .02, 0x2b2420, {jit:.03});
  rb(f, 0, .84, .01, 1.36, .04, .48, .015, 0xe9e6de, {key:"gloss"});
  for (const s of [-1, 0, 1]) rb(f, s*.42, .58, .224, .36, .02, .01, .004, 0x8a7a64);
  products(f, -.2, .88, .7, 40 + i);
  // the comb jar of blue disinfectant, and a towel folded at the end
  cy(f, .45, .88, -.02, .045, .045, .2, 0x3a7fc0, {seg:10, key:"glass"});
  for (let k = 0; k < 3; k++) rb(f, .45 + (k - 1)*.012, 1.0, -.02, .008, .16, .008, .002, 0x1f2226);
  rb(f, .5, .88, .14, .22, .05, .14, .02, 0xf2f1ec);
  fsolid(f, 0, 0, 1.36, .48, FL, FL + .9);
}
// a trolley of tools: clippers, trimmers, scissors, a comb, a spray bottle
function trolley(x, z){
  const f = frame(x, z, .3, FL), chrome = 0xb9bec4;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cy(f, sx*.16, .03, sz*.13, .012, .012, .78, chrome, {seg:6, key:"metal"});
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) sph(f, sx*.16, .025, sz*.13, .025, 0x1c1d20);
  for (const y of [.3, .78]) rb(f, 0, y, 0, .38, .025, .32, .01, 0x2b2f34);
  rb(f, -.08, .805, -.02, .06, .04, .17, .02, 0x15171a, {ry:.2});          // clippers
  rb(f, .07, .805, -.05, .04, .03, .13, .015, 0xc9a23e, {ry:-.3});         // trimmers
  rb(f, .03, .805, .09, .14, .006, .02, .003, 0xd8dcdf, {key:"metal", ry:.5});   // scissors
  rb(f, -.04, .805, .1, .12, .004, .025, .002, 0x1f2226);                  // comb
  cy(f, .12, .805, .08, .028, .028, .14, 0x2f6b5a, {seg:8, key:"gloss"}); cy(f, .12, .945, .08, .012, .012, .03, 0x15171a, {seg:6});
  fsolid(f, 0, 0, .4, .34, FL, FL + .85);
}
// the striped pole by the door: red, white and blue bands in a glass tube with chrome caps
function pole(x, z){
  const f = frame(x, z, 0, 0), cols = [0xc0262d, 0xf2f0ea, 0x2c4f9e, 0xf2f0ea];
  rb(f, 0, 1.55, .09, .1, .9, .06, .02, 0x2a2e33, {key:"metal"});
  for (let i = 0; i < 7; i++) cy(f, 0, 1.6 + i*.1, 0, .055, .055, .1, cols[i % 4], {seg:12, key:i % 2 ? "plain" : "lamp"});
  cy(f, 0, 1.58, 0, .07, .075, .04, 0xc9ced3, {seg:12, key:"metal"});
  cy(f, 0, 2.3, 0, .075, .07, .04, 0xc9ced3, {seg:12, key:"metal"});
  sph(f, 0, 2.36, 0, .06, 0xc9ced3, {key:"metal"});
}
function priceBoard(x, y, z, ry){
  const rows = typeof barberMenu === "function" ? barberMenu("hair").filter(o => !o.x).slice(0, 4).concat(barberMenu("beard").slice(1, 3)) : [];
  const t = textTex(320, 420, g => {
    g.fillStyle = "#15171a"; g.fillRect(0, 0, 320, 420);
    g.strokeStyle = "#c9a23e"; g.lineWidth = 4; g.strokeRect(10, 10, 300, 400);
    g.fillStyle = "#c9a23e"; g.textAlign = "center"; g.font = `800 40px "Barlow Condensed", sans-serif`; g.fillText("PRICES", 160, 62);
    g.font = `600 22px "Barlow", sans-serif`; g.textAlign = "left";
    rows.forEach((o, i) => { g.fillStyle = "#e9e6de"; g.fillText(o.n, 30, 120 + i*44); g.textAlign = "right"; g.fillText("€" + o.price, 290, 120 + i*44); g.textAlign = "left"; });
    g.fillStyle = "#8f8b85"; g.font = `500 16px "Barlow", sans-serif`; g.fillText("Ask about the barber's own cuts", 30, 390);
  });
  label(t, x, y, z, .62, .82, ry, {glow:.55, rough:.6});
}

export function barbershop(c){
  const ctx = c, b = BARBER_B, floors = 4, H = floors*LH, g0 = 3.2, back = b.z0 + 7.2;
  reseed(4242);
  const brick = 0x7d4a3a, PT = {tex:"paint"};
  // the block over the shop, and its back half on the ground floor
  box(b.x0, g0, b.z0, b.x1, H, b.z1, brick, {solid:true, tex:"brick", ao:false});
  box(b.x0, 0, back + .2, b.x1, g0, b.z1, brick, {solid:true, tex:"brick", ao:false});
  const ff = facer("-z", b);
  for (let L = 1; L < floors; L++) for (const s of [2.2, 5.4, 8.6, 11.8]) decoWin(ff, s, L*LH, rnd() < .3);
  pilasters(ff, 14, H, [[1.05, 13.25]]);
  for (const side of ["+x", "-x"]) pilasters(facer(side, b), 12, H);
  for (const s of [.18, 13.82]) downpipe(ff, s, H);
  roofTop(b, H, {wall:brick, tex:"brick"});
  // the shopfront: a dark frame, the door at the east end, glass the rest of the way
  const fz = b.z0 + .125, door = [11.2, 12.6];
  wall("x", fz, b.x0, b.x1, 0, g0, .25, 0x1f2226, [[door[0], door[1], 0, 2.4], [.9, 10.4, .55, 2.8, "glass"]], {key:"metal"});
  wall("z", b.x0 + .125, b.z0, back + .2, 0, g0, .25, 0xd8d2c4, [], PT);
  wall("z", b.x1 - .125, b.z0, back + .2, 0, g0, .25, 0xd8d2c4, [], PT);
  wall("x", back + .1, b.x0 + .25, b.x1 - .25, 0, g0, .2, 0xd8d2c4, [], PT);
  box(.9, .55, b.z0 + .1, 10.4, 2.8, b.z0 + .14, 0xa9c2d2, {key:"glass", ao:false, jit:0});
  for (const x of [4.06, 7.23]) box(x - .04, .55, b.z0 + .08, x + .04, 2.8, b.z0 + .22, 0x1f2226, {key:"metal", ao:false});
  box(.8, .48, b.z0 - .1, 10.5, .56, b.z0 + .27, 0xc7c2b8, {ao:false, jit:0});           // the window board, in and out
  doorway("x", fz, door[0], door[1], 0, 2.4, .25, {color:0x1f2226, arch:.08, proud:.04, key:"metal", sill:FL, sillColor:0x9a958c});
  floor(door[0], door[1], b.z0 - .05, b.z0 + .3, FL);
  // the floor: black and white squares, the lino the shop stands on
  const nx = 20, nz = 10, x0 = b.x0 + .25, x1 = b.x1 - .25, z0 = b.z0 + .25, z1 = back;
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++){
    const ax = x0 + (x1 - x0)*i/nx, bx = x0 + (x1 - x0)*(i + 1)/nx, az = z0 + (z1 - z0)*k/nz, bz = z0 + (z1 - z0)*(k + 1)/nz;
    box(ax, 0, az, bx, FL, bz, (i + k) % 2 ? 0x1c1d20 : 0xe9e6de, {key:"gloss", ao:false, jit:0});
  }
  floor(x0, x1, z0, z1, FL);
  box(x0, g0 - .05, z0, x1, g0, z1, 0xeeebe4, {ao:false, tex:"paint"});
  // a dark dado round the walls, a brass line over it
  for (const [ax, az, bx, bz] of [[x0, z1 - .02, x1, z1], [x0, z0 + 2.2, x0 + .02, z1], [x1 - .02, z0 + .6, x1, z1]]){
    box(ax, FL, az, bx, FL + 1.0, bz, 0x24302c, {ao:false, jit:0, tex:"paint"});
  }
  box(x0, FL + 1.0, z1 - .03, x1, FL + 1.03, z1, 0xc9a23e, {key:"metal", ao:false, jit:0});
  // the stations, the chairs, the trolleys; a few clippings round the chairs
  CHAIRS.forEach((x, i) => {
    station(x, i); barberChair(x, back - 1.15); trolley(x + .78, back - .95);
    reseed(70 + i);
    for (let k = 0; k < 9; k++){ const a = rnd()*6.28, r = .25 + rnd()*.45; box(x + Math.cos(a)*r - .02, FL + .001, back - 1.15 + Math.sin(a)*r - .01, x + Math.cos(a)*r + .02, FL + .004, back - 1.15 + Math.sin(a)*r + .01, 0x2a211b, {ao:false, jit:0}); }
  });
  // the product shelf on the east wall
  const sf = frame(x1 - .16, z0 + 4.4, -Math.PI/2, FL);
  for (const y of [1.05, 1.42, 1.79]){ rb(sf, 0, y - .03, 0, 2.4, .03, .26, .01, 0x3b2a20); products(sf, 0, y, 2.3, Math.round(y*100)); }
  for (const s of [-1.15, 1.15]) for (const y of [1.0, 1.37, 1.74]) rb(sf, s, y - .03, .1, .03, .06, .03, .005, 0xc9a23e, {key:"metal"});
  // the till by the door, and a bench along the window
  const tf = frame(x1 - .55, z0 + 2.1, -Math.PI/2, FL);
  rb(tf, 0, 0, 0, 1.6, 1.0, .6, .03, 0x2b2420); rb(tf, 0, 1.0, 0, 1.66, .04, .64, .015, 0xe9e6de, {key:"gloss"});
  rb(tf, -.3, 1.04, 0, .3, .1, .26, .02, 0x15171a); rb(tf, -.3, 1.14, -.05, .26, .16, .02, .01, 0x22262b, {rx:-.3});
  products(frame(x1 - .55, z0 + 2.55, -Math.PI/2, FL), 0, 1.04, .5, 77);
  fsolid(tf, 0, 0, 1.66, .64, FL, FL + 1.05);
  const bf = frame(3.4, z0 + .45, 0, FL);
  rb(bf, 0, .42, 0, 3.2, .07, .44, .02, 0x6b4a2c); rb(bf, 0, .49, -.2, 3.2, .45, .05, .02, 0x6b4a2c, {rx:.1});
  for (const s of [-1.45, 0, 1.45]) cy(bf, s, 0, 0, .025, .025, .42, 0x1f2226, {seg:6, key:"metal"});
  fsolid(bf, 0, 0, 3.2, .5, FL, FL + .9);
  priceBoard(x0 + .02, FL + 1.75, z0 + 3.4, Math.PI/2);
  // lights: a pendant over each chair, the mirror strips
  for (const x of CHAIRS){
    const pf = frame(x, back - 1.1, 0, 0);
    cy(pf, 0, g0 - .62, 0, .012, .012, .58, 0x15171a, {seg:6});
    cy(pf, 0, g0 - .82, 0, .07, .24, .2, 0x15171a, {seg:14, key:"metal"});
    cy(pf, 0, g0 - .83, 0, .2, .2, .012, 0xfff3d6, {seg:14, key:"lamp"});
    lightSrc({x, y:g0 - .9, z:back - 1.1, color:0xffe6c4, intensity:5, distance:7, indoor:true});
  }
  lightSrc({x:7, y:2.9, z:z0 + 1.5, color:0xfff0d8, intensity:5, distance:9, indoor:true});
  pool(7, z0 - 1.2, 3.2, .125);
  // the sign and the pole
  box(.3, 2.9, b.z0 - .1, 13.7, 3.5, b.z0, 0x15171a, {ao:false, jit:0});
  const t = textTex(1600, 140, g => {
    g.fillStyle = "#15171a"; g.fillRect(0, 0, 1600, 140); g.fillStyle = "#c9a23e"; g.fillRect(0, 128, 1600, 6);
    g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#f2efe6"; g.font = `800 92px "Barlow Condensed", "Arial Narrow", sans-serif`; g.fillText("FADE & CO.", 960, 66);
    g.fillStyle = "#c9a23e"; g.font = `700 40px "Barlow", sans-serif`; g.fillText("BARBERS · EST. 1987", 360, 70);
  });
  label(t, 7, 3.2, b.z0 - .105, 13.2, 1.155, Math.PI, {glow:.75, rough:.4});
  box(.6, 2.87, b.z0 - .08, 13.4, 2.9, b.z0 - .02, 0xfff1d0, {key:"lamp", ao:false, jit:0});
  pole(13.38, b.z0 - .1);
  // the barber, in while the shop is open
  staffer(CHAIRS[1] + .75, back - 1.6, Math.PI, {role:"barista", seed:58, when:m => typeof barberOpen === "function" ? barberOpen(m) : m >= 540 && m < 1200, minute:ctx.minute});
  // sit in any chair to open the book; the door tells you the hours
  CHAIRS.forEach(x => spot({aim:[[x - .35, FL, back - 1.5], [x + .35, FL + 1.3, back - .8]], x, z:back - 1.6, r:1.5, near:true, label:"Barber's chair",
    get hint(){ const m = ctx.minute(); return typeof barberOpen === "function" && !barberOpen(m) ? "Closed · open 9:00 AM – 8:00 PM" : "Sit down · new hairstyle, beard or colour"; },
    hold:.3, run:() => ctx.barber()}));
  spot({x:(door[0] + door[1])/2, y:1.2, z:b.z0 - .4, r:1.8, near:true, label:"Fade & Co. Barbers", hint:"Open 9:00 AM – 8:00 PM · walk in", hold:.2,
    run:() => ctx.note(typeof barberOpen === "function" && !barberOpen(ctx.minute()) ? "Closed. Fade & Co. opens at 9:00 AM." : "Walk in and take a seat in one of the chairs.")});
  return {door:{x:(door[0] + door[1])/2, z:b.z0 - 1.2}};
}
