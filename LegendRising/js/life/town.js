/* ============ LIFE: Dumbrava ============
   The town an hour and twenty minutes up the line from Valea Albă. Strada Mare runs through it: on its north side the
   better jobs — the Sports Centre, the Youth Academy, the Photo Studio and Cut & Grade — round a little square where
   the bus stops, and Casa Nova, the big furniture showroom (tiers 3 to 6). South of the road is Arini: small detached
   houses with yards and fences and driveways, a quiet street running down between them. */
import {THREE, W, LH, box, rbox, cyl, solid, floor, spot, label, textTex, lightSrc, pool, reseed, rnd, pick, finishBatches, extrude, mat} from "./build.js";
import {frame, rb, cy, fsolid, worldPt, streetLamp, bin, bench as propBench, tree as propTree, bush, hedge, planter, PC} from "./props.js";
import {busStop, fence, tree, block} from "./home.js";
import {jobUnit, TX, HOOD, TOWN} from "./units.js";
import {parked, roadSign} from "./roads.js";
import {showroom} from "./store.js";
import {pedestrians} from "./npc.js";

let ctx = null;
export const TOWNZ = {street:null};
const HOUSE_COL = [0xefe3c8, 0xe9d8a6, 0xcfdde6, 0xf0cdb4, 0xf4f1ea, 0xd9e2c4, 0xe8c9c0];
const ROOF_COL = [0x9a3b2a, 0x7a4a32, 0x5a3b2e, 0x8a2f2a, 0x4a4f55];
// the town hall's weekday hours, as its door says them
const TOWN_HALL = {open:8*60, close:16*60};

/* a detached house on its lot. The lot's frame: x across the frontage, z back from the pavement (0 at the pavement's
   edge, the lot 14 deep); turned to face its street (face: the way the front looks). */
function lotTX(face, x0, z0){
  // th turns the lot so that its back (local +z) runs away from the street: the front looks the other way, at it
  const th = {"-z":0, "+x":-Math.PI/2, "+z":Math.PI, "-x":Math.PI/2}[face], c = Math.round(Math.cos(th)), s = Math.round(Math.sin(th));
  const p = (x, z) => [x0 + x*c + z*s, z0 - x*s + z*c];
  return {p, th, box(xa, y0, za, xb, y1, zb, col, o){ const [a, b] = p(xa, za), [d, e] = p(xb, zb); return box(Math.min(a, d), y0, Math.min(b, e), Math.max(a, d), y1, Math.max(b, e), col, o); },
    solid(xa, xb, za, zb, y0, y1){ const [a, b] = p(xa, za), [d, e] = p(xb, zb); return solid(Math.min(a, d), Math.max(a, d), Math.min(b, e), Math.max(b, e), y0, y1); },
    floor(xa, xb, za, zb, h){ const [a, b] = p(xa, za), [d, e] = p(xb, zb); floor(Math.min(a, d), Math.max(a, d), Math.min(b, e), Math.max(b, e), h); },
    f(x, z, r = 0, y = 0){ const [a, b] = p(x, z); return frame(a, b, r + th, y); }};
}
function house(T, w, i){
  reseed(900 + i*37);
  const col = HOUSE_COL[i % HOUSE_COL.length], roof = ROOF_COL[(i*3) % ROOF_COL.length], d0 = 5.5, d1 = 12.5, h = 2*2.9, HW = 7.6;
  // the drive down one side, the house beside it, its door next to the drive and the gate in line with the door
  const side = i % 2 ? -1 : 1, dx = side*(w/2 - 1.6);
  const hx0 = side > 0 ? dx - 1.6 - HW : dx + 1.6, hx1 = hx0 + HW, door = side > 0 ? hx1 - 1.6 : hx0 + 1.6;
  // the yard: grass, a path from the gate to the door, the drive
  T.box(-w/2, 0, 0, w/2, .05, 14, 0xffffff, {tex:"grass", ao:false, jit:0}); T.floor(-w/2, w/2, 0, 14, .05);
  T.box(door - .6, .05, 0, door + .6, .07, d0, 0xd8d2c4, {tex:"slabs", ao:false, jit:0});
  T.box(dx - 1.4, .05, 0, dx + 1.4, .065, d1 - .2, 0xc4c1b9, {tex:"concrete", ao:false, jit:0});
  // the house: two storeys, a pitched roof over it, a door with a little canopy, windows front and side
  T.box(hx0, 0, d0, hx1, h, d1, col, {solid:true, tex:"paint", jit:.03});
  T.box(hx0 - .05, 0, d0 - .05, hx1 + .05, .5, d1 + .05, 0x9a958c, {tex:"concrete", ao:false, jit:0});
  const rid = (hx0 + hx1)/2, sp = hx1 - hx0;
  {
    const pts = [[-sp/2 - .35, 0], [0, 1.9], [sp/2 + .35, 0], [sp/2 + .35, -.12], [0, 1.78], [-sp/2 - .35, -.12]];
    const g = new THREE.Shape(); g.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) g.lineTo(q[0], q[1]); g.closePath();
    const geo = new THREE.ExtrudeGeometry(g, {depth:d1 - d0 + .7, bevelEnabled:false}); geo.translate(0, 0, -(d1 - d0 + .7)/2);
    const m = new THREE.Mesh(geo, mat({color:roof, roughness:.85, side:THREE.DoubleSide}));
    const [cx, cz] = T.p(rid, (d0 + d1)/2); m.position.set(cx, h, cz); m.rotation.y = T.th; m.castShadow = true; m.receiveShadow = true; W.scene.add(m);
    const tri = new THREE.Shape(); tri.moveTo(-sp/2, 0); tri.lineTo(0, 1.8); tri.lineTo(sp/2, 0); tri.closePath();
    for (const zz of [d0, d1]){ const tg = new THREE.Mesh(new THREE.ShapeGeometry(tri), mat({color:col, roughness:.9, side:THREE.DoubleSide}));
      const [tx, tz] = T.p(rid, zz); tg.position.set(tx, h, tz); tg.rotation.y = T.th; W.scene.add(tg); }
    T.box(hx1 - 1.4, h + .6, d0 + 2.2, hx1 - .9, h + 2.3, d0 + 2.8, 0x8a5a45, {tex:"brick", ao:false});
  }
  T.box(door - .5, .5, d0 - .06, door + .5, 2.6, d0, 0x5a3b2a, {ao:false, jit:0});
  T.box(door - .65, 2.6, d0 - .7, door + .65, 2.72, d0, 0x3b4249, {key:"metal", ao:false});
  T.box(door - .8, .05, d0 - .9, door + .8, .5, d0, 0xb4afa6, {tex:"concrete", ao:false, jit:0}); T.floor(door - .8, door + .8, d0 - .9, d0, .5);
  for (const [wx, wy] of [[door - side*2.3, 1.1], [door, 3.9], [door - side*2.3, 3.9], [door - side*4.6, 3.9]]){
    if (wx - .7 < hx0 || wx + .7 > hx1) continue;
    T.box(wx - .6, wy, d0 - .07, wx + .6, wy + 1.2, d0 - .01, 0x2b3a48, {key:"glass", ao:false, jit:0});
    T.box(wx - .68, wy - .08, d0 - .1, wx + .68, wy, d0, 0xe9e6de, {ao:false, jit:0});
    T.box(wx - .04, wy, d0 - .08, wx + .04, wy + 1.2, d0 - .02, 0xf2f0ea, {ao:false, jit:0});
  }
  // the garage at the drive's end, a car on the drive now and then
  T.box(dx - 1.5, 0, d1, dx + 1.5, 2.6, 14, col, {solid:true, tex:"paint", jit:.03});
  T.box(dx - 1.25, .05, d1 - .03, dx + 1.25, 2.3, d1, 0x6a7178, {ao:false, jit:0});
  if (rnd() < .65){ const [px, pz] = T.p(dx, d1 - 3.2); parked(px, pz, T.th + Math.PI/2, 20 + i); }
  // a picket fence along the pavement, open at the gate and the drive; bushes; a mailbox on a post
  const gaps = [[door - .8, door + .8], [dx - 1.5, dx + 1.5]].sort((a, b) => a[0] - b[0]);
  let x = -w/2;
  const picket = (xa, xb) => { if (xb - xa < .3) return; T.box(xa, .05, .02, xb, .95, .1, 0xf2f0ea, {solid:true, ao:false, jit:0}); for (let q = xa; q < xb - .05; q += .14) T.box(q, .95, .03, q + .07, 1.08, .09, 0xf2f0ea, {ao:false, jit:0}); };
  for (const [a, b] of gaps){ if (a > x) picket(x, a); x = Math.max(x, b); }
  picket(x, w/2);
  for (const [bx, bz] of [[-side*(w/2 - 1), 3], [-side*(w/2 - 1.2), 9.5]]){ const [a, b] = T.p(bx, bz); bush(a, b, .9 + rnd()*.3, .05); }
  const mb = T.f(door + side*1.1, .5); cy(mb, 0, 0, 0, .04, .04, 1.0, 0x3b4146, {seg:6}); rb(mb, 0, 1.0, 0, .22, .2, .36, .04, [0xc8463a, 0x2c66b8, 0x3f8a48][i % 3]);
  // the sides and the back of the lot: a tall timber fence
  fenceT(T, -w/2, 0, -w/2, 14); fenceT(T, w/2, 0, w/2, 14); fenceT(T, -w/2, 14, w/2, 14);
}
function fenceT(T, xa, za, xb, zb){ const [a, b] = T.p(xa, za), [c, d] = T.p(xb, zb); fence(Math.min(a, c), Math.min(b, d), Math.max(a, c) + (a === c ? .1 : 0), Math.max(b, d) + (b === d ? .1 : 0), .05); }

export function buildTown(c){
  ctx = c;
  reseed(31337);
  W.bounds = {x0:-63.6, x1:63.6, z0:-15.6, z1:57.6};
  // the ground, Strada Mare, its pavements and kerbs, the side street down into Arini
  box(-90, -.2, -40, 90, 0, 90, 0xffffff, {tex:"grass", ao:false, jit:0});
  box(-66, 0, 0, 66, .01, 8, 0xffffff, {tex:"asphalt", ao:false, jit:0});
  box(-4, 0, 8, 4, .01, 58, 0xffffff, {tex:"asphalt", ao:false, jit:0});
  const pave = (x0, x1, z0, z1, k = [x0, x1, z0, z1]) => { box(k[0], 0, k[2], k[1], .12, k[3], 0xffffff, {tex:"slabs", ao:false, jit:0}); floor(x0, x1, z0, z1, .12); };
  pave(-66, 66, -3, 0, [-66, 66, -3, -.18]);
  pave(-66, -4, 8, 11, [-66, -4, 8.18, 11]); pave(4, 66, 8, 11, [4, 66, 8.18, 11]);
  pave(-7, -4, 11, 58, [-7, -4.18, 11, 58]); pave(4, 7, 11, 58, [4.18, 7, 11, 58]);
  const K = 0xc4c1b9, KO = {ao:false, jit:0, tex:"concrete"};
  box(-66, 0, -.18, 66, .124, 0, K, KO); box(-66, 0, 8, -4, .124, 8.18, K, KO); box(4, 0, 8, 66, .124, 8.18, K, KO);
  box(-4.18, 0, 8, -4, .124, 58, K, KO); box(4, 0, 8, 4.18, .124, 58, K, KO);
  for (let x = -64; x < 64; x += 4) if (x + 2 < -5 || x > 5) box(x, .012, 3.93, x + 2, .016, 4.07, 0xe9e7df, {ao:false, jit:0});
  for (let z = 12; z < 56; z += 4) box(-.07, .012, z, .07, .016, z + 2, 0xe9e7df, {ao:false, jit:0});
  for (let x = -3.5; x < 4; x += .9) box(x, .012, .3, x + .5, .016, 7.7, 0xeceae2, {ao:false, jit:0});       // a zebra at the corner

  /* ---------- the north side: the jobs, the square, the showroom ---------- */
  jobUnit("gym", TX("+z", -50, -9), ctx, {floors:1, brick:0x5a6b78, zone:"town"});
  jobUnit("academy", TX("+z", -32, -9), ctx, {floors:0, brick:0xd9cfbf, zone:"town"});
  jobUnit("photo", TX("+z", 14, -9), ctx, {floors:2, brick:0xb5593d, zone:"town"});
  jobUnit("edit", TX("+z", 32, -9), ctx, {floors:2, brick:0x6a5a7a, zone:"town"});
  showroom(ctx, {x0:41, x1:61, z0:-15, z1:-3});
  for (const [x0, x1] of [[-43.5, -38.5], [20.5, 25.5], [38.5, 41]]){ fence(x0, -3.1, x1, -3.0); }
  fence(-66, -3.1, -56.5, -3.0); fence(61, -3.1, 66, -3.0);
  // the square in front of the stop: paving, benches, trees in planters, a statue of somebody's grandfather
  // (its sides are the shops' own walls, its back the town hall: the two gaps beside that are fenced)
  box(-25.5, .12, -15, 7.5, .14, -3, 0xffffff, {tex:"slabs", ao:false, jit:0}); floor(-25.5, 7.5, -15, -3, .14);
  fence(-25.5, -15.1, -24, -15, .14); fence(6, -15.1, 7.5, -15, .14);
  { const f = frame(-9, -9); rb(f, 0, .14, 0, 2.2, .6, 2.2, .1, 0xb4afa6, {tex:"concrete"}); rb(f, 0, .74, 0, 1.2, 1.4, 1.2, .08, 0x9a958c); cy(f, 0, 2.14, 0, .25, .32, 1.6, 0x4a5a4a, {seg:10, key:"metal"}); cy(f, 0, 3.74, 0, .18, .22, .45, 0x4a5a4a, {seg:10, key:"metal"}); fsolid(f, 0, 0, 2.2, 2.2, 0, 2.5);
    const t = textTex(256, 64, g => { g.fillStyle = "#9a958c"; g.fillRect(0, 0, 256, 64); g.fillStyle = "#2a2e33"; g.font = "bold 22px Georgia, serif"; g.textAlign = "center"; g.fillText("ION ARINEANU · 1921–1988", 128, 40); });
    label(t, -9, 1.3, -8.39, 1.1, .28, 0, {rough:.8}); }
  for (const x of [-20, 2]){ planter(x, -6, 1.6, .14); }
  for (const [x, z] of [[-20, -11], [2, -11]]) tree(x, z, .9);
  propBench(-15, -4.4, Math.PI, 2.2, {y:.14}); propBench(-3, -4.4, Math.PI, 2.2, {y:.14});
  const sq = textTex(512, 128, g => { g.fillStyle = "#1f4a8a"; g.fillRect(0, 0, 512, 128); g.strokeStyle = "#fff"; g.lineWidth = 5; g.strokeRect(7, 7, 498, 114); g.fillStyle = "#fff"; g.font = "800 50px 'Barlow Condensed', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(`PIAȚA ${HOOD.toUpperCase()}`, 256, 50); g.font = "600 22px 'Barlow', sans-serif"; g.fillText(`${TOWN} · Strada Mare`, 256, 98); });
  cy(frame(-24.8, -3.6), 0, .14, 0, .04, .04, 2.5, 0x3b4146, {seg:8, key:"metal"}); label(sq, -24.8, 2.4, -3.59, 1.1, .28, 0, {rough:.5}); label(sq, -24.8, 2.4, -3.61, 1.1, .28, Math.PI, {rough:.5});
  // the town hall closes the square at the back; behind the shops, the rest of the town against the sky
  block({x0:-24, x1:6, z0:-36, z1:-15}, "+z", 0xe8dcc0, {doorAt:15, floors:3, doorLabel:`Primăria ${TOWN}`, doorHint:`The town hall · open weekdays, ${fmtRange(TOWN_HALL.open, TOWN_HALL.close)}`, doorNote:"The town hall. Nothing for you in there today, unless you fancy queueing for a form."});
  { const t = textTex(1024, 128, g => { g.fillStyle = "#e8dcc0"; g.fillRect(0, 0, 1024, 128); g.fillStyle = "#3b3a36"; g.font = "700 64px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(`PRIMĂRIA ${TOWN.toUpperCase()}`, 512, 68); });
    label(t, -9, 8.6, -14.94, 9, 1.1, 0, {rough:.8}); }
  reseed(31338);
  for (const [x, z, w, d, h] of [[-80, -60, 18, 14, 12], [-52, -58, 16, 12, 9], [-20, -62, 22, 12, 15], [14, -56, 16, 14, 9], [40, -60, 18, 12, 12], [70, -40, 14, 18, 9],
    [-84, 20, 14, 16, 9], [78, 18, 14, 18, 12], [-40, 76, 18, 12, 9], [10, 80, 22, 12, 12], [52, 74, 16, 12, 9]]){
    const c = pick([0xd9cfbf, 0xc48a5e, 0xb0a490, 0xe8dcc0, 0x9b6a58]);
    rbox(x + w/2, 0, z + d/2, w, h, d, .1, c, {tex:"paint", jit:.05});
    for (let y = 2.2; y + 1.2 < h - .3; y += 3.2) box(x - .02, y, z + .8, x + w + .02, y + 1.2, z + d - .8, 0x3a4652, {key:"gloss", ao:false, jit:.1});
    box(x - .2, h, z - .2, x + w + .2, h + .5, z + d + .2, pick(ROOF_COL), {ao:false, jit:.05});
  }
  // the bus stop on the south side, facing the square
  busStop(-12, 9.4);
  spot({x:-12, y:1.2, z:9.6, r:2.6, aim:[[-13.8, 0, 8.6], [-10.2, 2.7, 10.9]], near:true, label:"Bus stop · Dumbrava", hint:"Line 14 · Valea Albă, the training centre", hold:.4, run:() => ctx.busMenu()});

  /* ---------- Arini: the houses ---------- */
  let n = 0;
  for (const x of [-52, -40, -28, -16, 16, 28, 40, 52]) house(lotTX("-z", x, 11), 12, n++);
  for (const z of [31.5, 42.5, 53]) house(lotTX("+x", -7, z), 11, n++);
  for (const z of [31.5, 42.5, 53]) house(lotTX("-x", 7, z), 11, n++);
  // the corners where the side street meets the road: hedges
  hedge(-9.6, 11.6, -9.6, 25); hedge(9.6, 11.6, 9.6, 25);
  fence(-7, 57.6, 7, 57.7);
  fence(-66, 25, -58, 25.1); fence(58, 25, 66, 25.1); fence(-66, 8, -65.9, 25); fence(65.9, 8, 66, 25); fence(-66, -3, -65.9, 8); fence(65.9, -3, 66, 8);
  roadSign(-6.6, 11.6, "STRADA ARINILOR", `${HOOD} · houses 1–14`);
  // lamps, bins, a few cars at the kerb
  // (none in front of a door, a gate or a drive)
  for (const x of [-56, -41, -16, 23, 40, 58]) streetLamp(x, -2.6, 1, .12, Math.PI);
  for (const x of [-55, -31, -8, 14, 34, 54]) streetLamp(x, 10.6, -1, .12, 0);
  for (const z of [20, 45.5]) streetLamp(-6.6, z, 1, .12, -Math.PI/2);
  for (const z of [28, 44]) streetLamp(6.6, z, 1, .12, Math.PI/2);
  bin(-30, 10.5, 0, .12); bin(24, -2.6, 0, .12);
  parked(-36, 1.1, 0, 3); parked(46, 6.9, Math.PI, 6, "sport"); parked(-2.9, 34, Math.PI/2, 9); parked(2.9, 48, -Math.PI/2, 12, "muscle");
  finishBatches();
  // people out and about: along Strada Mare and down into Arini
  // (the south side keeps to the kerb half of the pavement, in front of the bus shelter)
  TOWNZ.street = pedestrians({zone:"town", minute:ctx.minute, seed:777, max:5, count:m => { const h = m/60; return h < 6 ? 0 : h < 8 ? 2 : h < 20 ? 4 : h < 22 ? 2 : 0; }, routes:[
    [[-60, -1.4], [60, -1.4], [60, 8.7], [-60, 8.7]],
    [[-5.6, 12], [-5.6, 56], [5.6, 56], [5.6, 12]]]});
  // the places the compass knows here (the jobs and Casa Nova put themselves on it)
  W.places.push({name:"Bus stop", kind:"bus", x:-12, z:9.4}, {name:`Piața ${HOOD}`, kind:"square", x:-9, z:-6, at:`in Piața ${HOOD}`, b:{x0:-25.5, x1:7.5, z0:-15, z1:-3}});
  return {bus:{x:-12, z:10.0, y:.12, yaw:0}};               // off the bus, looking across the road at the square
}
