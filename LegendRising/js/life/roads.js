/* ============ LIFE: the rest of your street ============
   The road across the end of your street, both ways from the junction. North — the first left, walking down from
   your block — is Strada Morii: flats, the Neighbourhood Store, and up on the right the IronWorks gym. South is
   Bulevardul Gării: more flats, a little park, a car park and, a fair walk from home, the City Courier depot. Blocks
   line both sides; anything between them is fenced, so the only way along is the pavement. */
import {THREE, W, box, rbox, solid, floor, spot, label, textTex, lightSrc, pool, reseed, rnd, pick} from "./build.js";
import {frame, rb, cy, streetLamp, bin, bench as propBench, tree as propTree, bush, PC} from "./props.js";
import {block, fence, tree} from "./home.js";
import {jobUnit, TX} from "./units.js";
import {bakeCar, carPaint, CAR_KINDS} from "./cars.js";
import {privateGym} from "./gymclub.js";

const BRICK = [0x9b4a36, 0xb5593d, 0xa8462f, 0xc48a5e, 0xd9cfbf, 0xb9b2a4];
// a car parked at the kerb, for good: baked into the street's own batches (cars.js), solid to walk into.
// i picks its paint (and its shape, unless kind says); y: what it stands on (a drive, the road)
export function parked(x, z, ry, i, kind, y = .01){
  const [L, , Wd] = bakeCar(kind || CAR_KINDS[i % CAR_KINDS.length], carPaint(i), x, z, ry, {y});
  const along = Math.abs(Math.cos(ry)) > .5;
  solid(x - (along ? L : Wd)/2, x + (along ? L : Wd)/2, z - (along ? Wd : L)/2, z + (along ? Wd : L)/2, 0, y + 1.4);
}
export function extendStreets(ctx){
  reseed(4242);
  /* ---------- Strada Morii, to the north ---------- */
  // west: a long block behind the Mini Market, the Neighbourhood Store, flats at the end
  block({x0:18, x1:31, z0:-26, z1:-5.6}, "+x", BRICK[0], {doorAt:5.5, floors:5});
  fence(31, -31.5, 31.1, -26);
  jobUnit("store", TX("+x", 25, -38), ctx, {floors:2, brick:BRICK[1], zone:"home"});
  fence(31, -46, 31.1, -44.5);
  block({x0:18, x1:31, z0:-61.8, z1:-46}, "+x", BRICK[3], {doorAt:4, floors:4});
  // east: the IronWorks gym (gymclub.js) and flats up to the end
  privateGym(ctx);
  fence(45, -31.5, 45.1, -30.2);
  block({x0:45, x1:59, z0:-61.8, z1:-31.5}, "-x", BRICK[4], {doorAt:9, floors:5});
  // trees in front of the fences, lamps along both pavements, parked cars along the kerb
  for (const z of [-28.8, -45.3]) tree(32.4, z);
  for (const z of [-20, -38, -54]) streetLamp(32.6, z, 1, .12, -Math.PI/2);
  for (const z of [-28, -46]) streetLamp(43.4, z, 1, .12, Math.PI/2);
  parked(35.1, -22, Math.PI/2, 1); parked(40.9, -40, -Math.PI/2, 4); parked(35.1, -52, Math.PI/2, 7);
  bin(32.2, -14, 0, .12); bin(44, -34, 0, .12);
  // a street sign where the roads meet
  roadSign(32.5, -3.5, "STRADA MORII", "Neighbourhood Store · IronWorks Gym ↑");

  /* ---------- Bulevardul Gării, to the south ---------- */
  block({x0:18, x1:31, z0:29, z1:48}, "+x", BRICK[2], {doorAt:7, floors:4});
  // the park: grass, paths, trees, benches, behind a low railing with a gate in it
  park(ctx, 18, 31, 49, 69);
  block({x0:18, x1:31, z0:70, z1:93.6}, "+x", BRICK[5], {doorAt:12, floors:5});
  block({x0:45, x1:59, z0:32, z1:52}, "-x", BRICK[1], {doorAt:8, floors:4});
  // the car park, fenced round its back and sides
  carPark(45, 59, 53, 73);
  jobUnit("courier", TX("-x", 51, 81), ctx, {floors:1, brick:0x6a7178, zone:"home"});
  fence(45, 87.5, 45.1, 93.6);
  for (const z of [44, 62, 77]) streetLamp(32.6, z, 1, .12, -Math.PI/2);
  for (const z of [35, 56, 90]) streetLamp(43.4, z, 1, .12, Math.PI/2);
  parked(35.1, 40, Math.PI/2, 2); parked(40.9, 58, -Math.PI/2, 5); parked(35.1, 86, Math.PI/2, 8, "muscle");
  roadSign(43.7, 30.5, "BULEVARDUL GĂRII", "Park · Car park · City Courier ↓");
}
// a park: grass, a gravel path, trees, benches, a railing along the pavement with a gate
function park(ctx, x0, x1, z0, z1){
  box(x0, 0, z0, x1, .05, z1, 0xffffff, {tex:"grass", ao:false, jit:0});
  box(x0 + 2, .05, z0 + 1, x1 - .1, .07, z0 + 3, 0xc9b99a, {tex:"path", ao:false, jit:0});
  box(x0 + 5, .05, z0 + 3, x0 + 7, .07, z1 - 1, 0xc9b99a, {tex:"path", ao:false, jit:0});
  floor(x0, x1, z0, z1, .05);
  for (const [x, z, s] of [[x0 + 2.5, z0 + 7, 1.1], [x0 + 10, z0 + 9, .95], [x0 + 3, z0 + 15, 1.2], [x0 + 10.5, z0 + 16, 1], [x0 + 9, z0 + 4.8, .8]]) propTree(x, z, s);
  for (const [x, z] of [[x0 + 1.4, z0 + 11], [x0 + 11.6, z0 + 12.5]]) bush(x, z, 1.1);
  propBench(x0 + 7.6, z0 + 10, -Math.PI/2, 2, {}); propBench(x0 + 7.6, z0 + 15, -Math.PI/2, 2, {});
  spot({x:x0 + 7.6, z:z0 + 10, y:.6, r:1.6, near:true, label:"Park bench", hint:"Sit down and let time pass", hold:.2, run:() => ctx.wait("park")});
  // the railing along the pavement (a gate at the path), the back and sides fenced
  for (const [a, b] of [[z0, z0 + 1], [z0 + 3, z1]]){ box(x1 - .05, .05, a, x1 + .05, 1.0, b, 0x2a2e33, {key:"metal", solid:true, ao:false}); for (let z = a; z <= b; z += 1.2) box(x1 - .04, 1.0, z - .03, x1 + .04, 1.1, z + .03, 0x2a2e33, {key:"metal", ao:false}); }
  fence(x0, z0, x0 + .1, z1); fence(x0, z0 - .05, x1, z0); fence(x0, z1, x1, z1 + .05);
  lightSrc({x:x0 + 6, y:3.5, z:(z0 + z1)/2, color:0xffd9a0, intensity:6, distance:12});
}
// a car park off the pavement: tarmac, white bays, a few cars, fenced at the back and sides
function carPark(x0, x1, z0, z1){
  box(x0, 0, z0, x1, .015, z1, 0xffffff, {tex:"asphalt", ao:false, jit:0}); floor(x0, x1, z0, z1, .015);
  for (let z = z0 + 1; z < z1 - 1; z += 2.8) box(x1 - 5.2, .016, z - .05, x1 - .3, .02, z + .05, 0xe9e7df, {ao:false, jit:0});
  let i = 0;
  for (let z = z0 + 2.4; z < z1 - 2; z += 2.8){ if (rnd() < .6) parked(x1 - 2.8, z, Math.PI, 10 + i++); }
  fence(x0, z0, x1, z0 + .1); fence(x0, z1 - .1, x1, z1); fence(x1 - .1, z0, x1, z1);
  const t = textTex(256, 128, g => { g.fillStyle = "#1d6fc4"; g.fillRect(0, 0, 256, 128); g.fillStyle = "#fff"; g.font = "bold 90px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("P", 70, 66); g.font = "bold 26px sans-serif"; g.fillText("RESIDENTS", 170, 52); g.fillText("ONLY", 170, 84); });
  cy(frame(x0 + .4, z0 + .6), 0, 0, 0, .04, .04, 2.6, 0x3b4146, {seg:8, key:"metal"});
  label(t, x0 + .3, 2.4, z0 + .6, .9, .45, -Math.PI/2, {rough:.5}); label(t, x0 + .5, 2.4, z0 + .6, .9, .45, Math.PI/2, {rough:.5});
}
// a street name on a post at the corner: white letters on blue, the way they are here, and what is down that road
export function roadSign(x, z, name, sub){
  cy(frame(x, z), 0, .12, 0, .04, .04, 2.6, 0x3b4146, {seg:8, key:"metal"});
  const t = textTex(512, 160, g => {
    g.fillStyle = "#1f4a8a"; g.fillRect(0, 0, 512, 160); g.strokeStyle = "#fff"; g.lineWidth = 6; g.strokeRect(8, 8, 496, 144);
    g.fillStyle = "#fff"; g.font = "800 56px 'Barlow Condensed', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(name, 256, 62);
    g.font = "600 24px 'Barlow', sans-serif"; g.fillStyle = "rgba(255,255,255,.85)"; g.fillText(sub, 256, 116);
  });
  for (const r of [0, Math.PI]) label(t, x, 2.45, z + (r ? -.012 : .012), 1.1, .34, r, {rough:.5});
  box(x - .57, 2.27, z - .01, x + .57, 2.63, z + .01, 0x1f4a8a, {ao:false, jit:0});
}
