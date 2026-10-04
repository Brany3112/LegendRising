/* ============ LIFE: the training ground ============
   The yard you get off the bus in, a gym under a canopy (bike, weights, treadmill), the training
   pitch, the stand with the tunnel, and the stop for the bus home. */
import {THREE, W, box, cyl, blob, solid, floor, spot, wall, textTex, label, addGeo, reseed, pick, finishBatches} from "./build.js";
import {facer, decoWin, pilasters, roofTop, tree, lampPost, busStop, hingedDoor} from "./home.js";

const M = {metal:0xa9b0b6, dark:0x3d4248, steel:0x5d656c, red:0xc9542f, black:0x1d1f22, white:0xf1f1ec};
let ctx = null;

/* ---------- the gym: a proper room, like the reference — treadmills, a rack, dumbbells, a sprint ladder ---------- */
const GY = {wall:0xd9d2c4, floor:0xbdb6aa, mat1:0x3a3b3d, mat2:0x4b4c4e, deck:0x45474a, belt:0x2f3032, grey:0xa5aba7, dark:0x3a3c3e, teal:0x2f8f86};
function tilted(w, h, d, rx, x, y, z, c, key){
  const g = new THREE.BoxGeometry(w, h, d); g.rotateX(rx); g.translate(x, y, z); addGeo(g, c, {ao:false, key});
}
function treadmill(x, z){
  box(x - .46, 0, z - .85, x + .46, .24, z + 1.05, GY.deck);
  box(x - .37, .24, z - .7, x + .37, .25, z + 1.0, GY.belt, {ao:false, jit:0});
  box(x - .46, .24, z - 1.05, x + .46, .36, z - .7, 0x55585a);
  for (const dx of [-.37, .37]) box(x + dx - .035, .36, z - .98, x + dx + .035, 1.32, z - .9, GY.grey);
  tilted(.98, .44, .12, -.45, x, 1.42, z - .97, GY.dark);
  tilted(.82, .32, .02, -.45, x, 1.43, z - .9, 0x1b1e20);
  for (const dx of [-.37, .37]) cyl(x + dx, 1.05, z - .62, .022, .5, GY.grey, {seg:6, rx:Math.PI/2});
  solid(x - .47, x + .47, z - 1.06, z + 1.06, 0, 1.4);
}
function rack(x, z){
  // the squat rack with its bar, a plate tree, a flat bench and a bar on the floor
  box(x - .8, 0, z - .45, x + .8, .06, z + .45, GY.dark);
  for (const dx of [-.6, .6]){
    box(x + dx - .04, .06, z - .04, x + dx + .04, 2.05, z + .04, GY.grey);
    box(x + dx - .04, 1.36, z - .14, x + dx + .04, 1.42, z - .04, GY.grey);
  }
  cyl(x, 1.47, z - .1, .022, 2.0, 0xc9cdd0, {seg:8, rz:Math.PI/2});
  for (const dx of [-.78, .78]) cyl(x + dx, 1.47, z - .1, .23, .06, dx < 0 ? GY.teal : 0x2b2c2e, {seg:14, rz:Math.PI/2});
  const tx = x - 1.7;
  cyl(tx, 0, z, .05, 1.3, GY.grey, {seg:8}); box(tx - .35, 0, z - .35, tx + .35, .05, z + .35, GY.dark);
  for (const [y, r] of [[.45, .25], [.95, .2]]){ cyl(tx, y, z + .08, r, .05, 0x2b2c2e, {seg:14, rx:Math.PI/2}); cyl(tx, y, z + .08, .05, .1, GY.grey, {seg:6, rx:Math.PI/2}); }
  box(x - .17, .42, z - 2.6, x + .17, .52, z - 1.4, 0x2a2b2d);
  for (const dz of [-2.5, -1.5]) box(x - .14, 0, z + dz - .04, x + .14, .42, z + dz + .04, GY.grey);
  cyl(x - .4, .23, z - 3.3, .022, 1.9, 0xc9cdd0, {seg:8, rz:Math.PI/2});
  for (const dx of [-1.15, .35]) cyl(x + dx, .23, z - 3.3, .23, .07, 0x2b2c2e, {seg:14, rz:Math.PI/2});
  solid(x - .85, x + .85, z - .5, z + .5, 0, 2); solid(tx - .35, tx + .35, z - .35, z + .35, 0, 1.3); solid(x - .2, x + .2, z - 2.65, z - 1.35, 0, .55);
}
function dumbbells(x, z){
  for (const dx of [-.75, .75]) for (const dz of [-.25, .25]) box(x + dx - .03, 0, z + dz - .03, x + dx + .03, .85, z + dz + .03, 0x2a2b2d);
  box(x - .85, .8, z - .3, x + .85, .84, z + .1, GY.grey); box(x - .85, .42, z - .25, x + .85, .46, z + .25, GY.grey);
  const ends = [0xe2722e, 0xe0a52e, GY.teal, 0x2b2c2e, 0xe2722e];
  for (let i = 0; i < 5; i++){
    const xx = x - .6 + i*.3;
    for (const [y, zz] of [[.9, -.1], [.52, 0]]){
      cyl(xx, y, zz + z, .018, .2, 0x9aa0a4, {seg:6, rx:Math.PI/2});
      for (const e of [-.1, .1]) cyl(xx, y, zz + z + e, .06, .06, ends[(i + (y > .7 ? 0 : 2)) % 5], {seg:6, rx:Math.PI/2});
    }
  }
  solid(x - .9, x + .9, z - .35, z + .35, 0, .95);
}
function ladderDrill(x, z0, z1){
  box(x - 1.4, .02, z0, x + 1.4, .035, z1, 0x3f8d4a, {ao:false, jit:0});
  for (let z = z0 + .8; z < z0 + 5.5; z += .5) box(x - .5, .036, z, x + .5, .04, z + .05, 0xf1f1ec, {ao:false, jit:0});
  for (const dx of [-.5, .5]) box(x + dx - .025, .036, z0 + .8, x + dx + .025, .04, z0 + 5.3, 0xf1f1ec, {ao:false, jit:0});
  for (let i = 0; i < 4; i++){ const zz = z0 + 6.2 + i*.9, xx = x + (i % 2 ? .6 : -.6); cyl(xx, .035, zz, .12, .3, 0xf07a22, {seg:8, rt:.02}); }
}
function gym(){
  const x0 = -13, x1 = 13, z0 = 4, z1 = 16, H = 4.2;
  box(x0, 0, z0, x1, .03, z1, GY.floor, {ao:false, jit:0});
  // walls: big windows on both long sides, a door in the middle facing the yard
  const win = (a0, a1) => [a0, a1, .8, 3.4];
  wall("x", z1 - .125, x0, x1, 0, H, .25, GY.wall, [win(-11.5, -2.5), [-.8, .8, 0, 2.5], win(2.5, 11.5)]);
  wall("x", z0 + .125, x0, x1, 0, H, .25, GY.wall, [win(-11.5, -2.5), win(2.5, 11.5)]);
  wall("z", x0 + .125, z0, z1, 0, H, .25, GY.wall);
  wall("z", x1 - .125, z0, z1, 0, H, .25, GY.wall);
  for (const zz of [z0 + .125, z1 - .125]) for (const [a0, a1] of [[-11.5, -2.5], [2.5, 11.5]]){
    box(a0, .8, zz - .02, a1, 3.4, zz + .02, 0xa9c2d2, {key:"glass", ao:false, jit:0});
    for (let k = 0; k <= 4; k++){ const xx = a0 + (a1 - a0)*k/4; box(xx - .05, .8, zz - .06, xx + .05, 3.4, zz + .06, 0x9aa0a4, {ao:false, jit:0}); }
    for (const y of [.8, 2.1, 3.35]) box(a0, y, zz - .06, a1, y + .06, zz + .06, 0x9aa0a4, {ao:false, jit:0});
  }
  box(x0 - .1, H, z0 - .1, x1 + .1, H + .3, z1 + .1, 0x5d646b);
  box(x0, H - .02, z0, x1, H, z1, 0xe8e3d8, {ao:false});
  for (const x of [-8, 0, 8]) box(x - 1.2, H - .06, 9.7, x + 1.2, H - .02, 10.3, 0xfff6e0, {key:"lamp", ao:false});
  const l = new THREE.PointLight(0xfff0d8, 10, 22, 1.4); l.position.set(0, H - .4, 10); W.scene.add(l);
  hingedDoor({hingeX:-.8, z:z1 - .125, base:0, width:1.6, height:2.5, into:-1, color:0x46505a, glass:true, label:"Gym door"});
  // power: mats, the rack and the dumbbells
  for (let i = 0; i < 8; i++) for (let j = 0; j < 9; j++) box(-12.6 + i, .03, 5 + j, -11.6 + i, .045, 6 + j, (i + j) % 2 ? GY.mat1 : GY.mat2, {ao:false, jit:0});
  rack(-9.5, 13.4); dumbbells(-6, 14.9);
  spot({aim:[[-11.5, 0, 9.9], [-7.6, 2.2, 14]], x:-9.5, z:12, label:"Squat rack", hint:"Train power · 90 minutes", run:() => ctx.train("Squat rack", "power")});
  spot({aim:[[-7, 0, 14.4], [-5, 1.1, 15.4]], x:-6, z:14.9, label:"Dumbbells", hint:"Train power · 90 minutes", run:() => ctx.train("Dumbbells", "power")});
  // pace: a sprint ladder and cones on a strip of turf
  ladderDrill(0, 4.6, 15.4);
  spot({aim:[[-1.4, 0, 4.6], [1.4, 1.2, 15.4]], x:0, z:10, label:"Sprint ladder", hint:"Train pace · 90 minutes", run:() => ctx.train("Sprint ladder", "pace")});
  // stamina: three treadmills in a row
  for (const x of [5.5, 8, 10.5]){
    treadmill(x, 10);
    spot({aim:[[x - .5, 0, 8.9], [x + .5, 1.7, 11.1]], x, z:10, label:"Treadmill", hint:"Train stamina · 90 minutes", run:() => ctx.train("Treadmill", "stamina")});
  }
  for (const [t, x, z] of [["POWER", -9, 9], ["PACE", 0, 9], ["STAMINA", 8, 7.6]]){ sign(t, x, 3.55, z, 1.8, 0); sign(t, x, 3.55, z - .01, 1.8, Math.PI); }
  sign("GYM", 0, 3.0, z1 + .02, 1.6, 0);
}
function sign(text, x, y, z, w = 1.6, ry = 0){
  const t = textTex(256, 64, g => {
    g.fillStyle = "#14202c"; g.fillRect(0, 0, 256, 64); g.fillStyle = "#c8f060"; g.fillRect(0, 58, 256, 6);
    // the words always fit inside the sign, however long they are
    let fs = 30; g.font = `bold ${fs}px sans-serif`;
    const tw = g.measureText(text).width; if (tw > 224){ fs = Math.floor(fs*224/tw); g.font = `bold ${fs}px sans-serif`; }
    g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 128, 30);
  });
  return label(t, x, y, z, w, w/4, ry);
}
function goal(x, z, dir){
  const w = 5, h = 2, d = 1.4;
  for (const dz of [-w/2, w/2]) cyl(x, 0, z + dz, .06, h, M.white, {seg:8});
  cyl(x, h, z, .06, w + .12, M.white, {seg:8, rx:Math.PI/2});
  for (const dz of [-w/2, w/2]) box(x + dir*d - .03, 0, z + dz - .03, x + dir*d + .03, h*.8, z + dz + .03, M.white);
  box(x + dir*d - .02, 0, z - w/2, x + dir*d + .02, h*.8, z + w/2, 0xffffff, {key:"glass", ao:false});
  box(Math.min(x, x + dir*d), h - .02, z - w/2, Math.max(x, x + dir*d), h, z + w/2, 0xffffff, {key:"glass", ao:false});
  solid(Math.min(x, x + dir*d), Math.max(x, x + dir*d), z - w/2 - .1, z + w/2 + .1, 0, 2);
}
function pitchLines(){
  const L = (x0, z0, x1, z1) => box(x0, .012, z0, x1, .016, z1, 0xf1f4ee, {ao:false, jit:0});
  const x0 = -20, x1 = 20, z0 = -26, z1 = -4, t = .1;
  L(x0, z0, x1, z0 + t); L(x0, z1 - t, x1, z1); L(x0, z0, x0 + t, z1); L(x1 - t, z0, x1, z1); L(-t/2, z0, t/2, z1);
  const ring = new THREE.RingGeometry(3.9, 4.0, 48); ring.rotateX(-Math.PI/2); ring.translate(0, .014, -15);
  addGeo(ring, 0xf1f4ee, {ao:false, jit:0});
  for (const sx of [-1, 1]){ L(sx*20 - (sx > 0 ? 4 : 0), -21, sx*20 + (sx < 0 ? 4 : 0), -20.9); L(sx*20 - (sx > 0 ? 4 : 0), -9.1, sx*20 + (sx < 0 ? 4 : 0), -9); L(sx*16 - t/2, -21, sx*16 + t/2, -9); }
  for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]){ cyl(cx, 0, cz, .02, 1.4, M.white, {seg:5}); box(cx, 1.15, cz, cx + .3, 1.38, cz + .02, 0xe8462e, {ao:false}); }
}
function stand(clubName){
  // stepped terraces with seats, a roof and the club's name
  for (let r = 0; r < 6; r++){
    const z0 = -29 - r*.8, y = .1 + r*.45;
    box(-26, 0, z0 - .8, 26, y + .45, z0, 0x9a978f, {ao:false});
    for (let x = -25.6; x < 25.6; x += .55) box(x, y + .45, z0 - .55, x + .42, y + .62, z0 - .2, (Math.floor(x/.55) + r) % 7 === 0 ? 0xf2f2ee : 0x1f5fb0, {ao:false, jit:.05});
  }
  box(-26, 0, -34.8, 26, 6.4, -33.8, 0x6d737a);
  for (const x of [-25, -12, 12, 25]) cyl(x, 0, -33.6, .12, 6.8, M.steel, {seg:8});
  box(-26.5, 6.8, -35, 26.5, 7.0, -28.5, 0x3b4249);
  box(-26.5, 6.3, -28.6, 26.5, 6.8, -28.4, 0x14202c, {ao:false});
  const t = textTex(1024, 64, g => {
    g.fillStyle = "#14202c"; g.fillRect(0, 0, 1024, 64); g.fillStyle = "#fff"; g.font = "bold 40px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(clubName.toUpperCase() + "  ·  TRAINING CENTRE", 512, 34);
  });
  label(t, 0, 6.55, -28.35, 16, 1.0, 0);
  solid(-26, 26, -35, -28.6, 0, 7);
  // the tunnel comes out of the middle of the stand
  box(-3.6, 0, -31.5, 3.6, 3.9, -27.4, 0x2c3238, {solid:true});
  box(-2.4, 0, -27.44, 2.4, 2.8, -27.38, 0x0b0d10, {ao:false, jit:0});
  box(-3.8, 3.9, -31.6, 3.8, 4.15, -27.1, 0x1c2126, {ao:false});
  box(-2.0, 2.9, -27.37, 2.0, 2.95, -27.33, 0xfff1c8, {key:"lamp", ao:false});
  sign("PLAYERS' TUNNEL", 0, 3.4, -27.33, 3.4);
  for (const dx of [-2.6, 2.6]) box(dx - .08, 0, -27.36, dx + .08, 2.9, -27.3, 0xc8f060, {ao:false});
}
function clubhouse(){
  const b = {x0:18, x1:29, z0:3, z1:17};
  box(b.x0, 0, b.z0, b.x1, 6.4, b.z1, 0xd9d3c4, {solid:true, tex:"plaster"});
  const f = facer("-x", b);
  pilasters(f, 14, 6.4);
  for (const s of [2.5, 5.5, 8.5, 11.5]) decoWin(f, s, 3.2, false);
  for (const s of [2.5, 11.5]) decoWin(f, s, 0, false);
  f.box(6, 8, 0, 2.4, -.02, .03, 0x2f3a44, {ao:false}); f.box(5.7, 8.3, 2.5, 2.62, 0, 1.0, 0x1c2126, {ao:false});
  roofTop(b, 6.4);
  sign("CLUBHOUSE", 17.95, 2.9, 10, 2.4, -Math.PI/2);
}
function fenceLine(x0, z0, x1, z1){
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len/2.5));
  for (let i = 0; i <= n; i++){ const t = i/n, x = x0 + (x1 - x0)*t, z = z0 + (z1 - z0)*t; box(x - .05, 0, z - .05, x + .05, 2.2, z + .05, 0x3d4347, {ao:false}); }
  const lo = [Math.min(x0, x1) - .02, Math.min(z0, z1) - .02], hi = [Math.max(x0, x1) + .02, Math.max(z0, z1) + .02];
  box(lo[0], .05, lo[1], hi[0], 2.1, hi[1], 0x7d8a8f, {key:"glass", ao:false, jit:0});
  box(lo[0], 2.1, lo[1], hi[0], 2.16, hi[1], 0x3d4347, {ao:false});
  solid(lo[0], hi[0], lo[1], hi[1], 0, 2.2);
}
function seat(x, z){
  for (let k = 0; k < 3; k++) box(x - 1.6, .45 + k*.0, z - .25 + k*.17, x + 1.6, .5, z - .12 + k*.17, 0x8a6240);
  box(x - 1.6, .62, z + .26, x + 1.6, .9, z + .32, 0x8a6240);
  for (const dx of [-1.4, 1.4]) box(x + dx - .05, 0, z - .25, x + dx + .05, .9, z + .32, 0x3b4146);
  solid(x - 1.6, x + 1.6, z - .3, z + .35, 0, .9);
}

export function buildGround(c){
  ctx = c;
  reseed(77);
  W.bounds = {x0:-29.3, x1:29.3, z0:-28.6, z1:27.3};
  box(-80, -.2, -80, 80, 0, 80, 0xffffff, {tex:"grass", ao:false, jit:0});
  box(-17, 0, 3, 17, .02, 28, 0xffffff, {tex:"slabs", ao:false, jit:0});
  box(-20.5, 0, -26.5, 20.5, .01, -3.5, 0xffffff, {tex:"pitch", ao:false, jit:0});
  pitchLines();
  goal(-20, -15, -1); goal(20, -15, 1);
  gym();
  seat(-9, 20);
  spot({x:-9, y:.8, z:18.8, r:2.2, aim:[[-10.7, 0, 19.6], [-7.3, 1.1, 20.4]], near:true, label:"Bench", hint:"Sit and wait for training", run:() => ctx.bench()});
  const clubName = (typeof myClub === "function" && myClub()) ? myClub().nm : "Legend Rising";
  stand(clubName);
  clubhouse();
  fenceLine(-29.6, 27.6, 29.6, 27.6); fenceLine(-29.6, -28.8, -29.6, 27.6); fenceLine(29.6, -28.8, 29.6, 27.6);
  for (const [x, z] of [[-24, 22], [24, 22], [-26, 0], [26, -2], [-34, 12], [34, 10], [-36, -16], [36, -18]]) tree(x, z);
  for (const [x, z] of [[-16, 6], [16, 6], [-16, 26], [16, 26]]) lampPost(x, z, z > 15 ? 1 : -1);
  busStop(-14, 24.6);
  spot({x:-14, y:1.2, z:24.8, r:2.6, aim:[[-16, 0, 23.9], [-12, 2.7, 26.1]], near:true, label:"Bus stop", hint:"Bus home · 40 minutes", run:() => ctx.bus("home")});
  finishBatches();
  return {bus:{x:-14, z:23.4, y:0, yaw:0}, tunnel:{x:0, z:-20.5, y:0, yaw:Math.PI}};
}
