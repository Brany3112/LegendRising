/* ============ LIFE: the training ground ============
   Off the bus at the gate. Ahead, the gym; to the right, the clubhouse with the dressing room, the
   staff office and the computer that knows everything about you; beyond them the training pitch,
   the stand and the tunnel you walk out of on match day. From ten to five on a training day the
   squad is out there working, and being among them is how a dressing room comes to trust you. */
import {THREE, W, box, rbox, cyl, solid, floor, ramp, spot, wall, textTex, label, addGeo, reseed, pick, rnd, finishBatches, lightSrc, mat, part, doorway, extrude, beam} from "./build.js";
import {facer, decoWin, pilasters, roofTop, busStop, hingedDoor} from "./home.js";
import {frame, rb, cy, sph, fsolid, worldPt, PC, cone, marker, ball, ballBag, mannequin, bench, goal, cornerFlag, dugout, floodlight,
  waterCooler, bottle, kitBag, bibs, lockers, shelfUnit, tacticsBoard, noticeBoard, desk, monitor, chair, vending, vendTex, plyoBox, bike,
  tree, bush, hedge, streetLamp, bin, car, sign, wireFence, parkingBays, planter} from "./props.js";
import {teamSession, staffer} from "./npc.js";
import {cabinet} from "./props.js";
import {fillFridge} from "./fridge.js";

let ctx = null;
const G = () => (typeof S !== "undefined" ? S : null);
export const GROUND = {fridge:null, session:null};
// the pitch, and where each drill happens on it
export const PITCH = {x0:-21.5, x1:21.5, z0:-26, z1:-4, cz:-15, goalW:6, goalH:2.2};
export const DRILLS = {
  shoot:{x:-9.5, z:-15, yaw:Math.PI/2, label:"Shooting accuracy", sub:"Five shots at a target in the goal"},
  pass:{x:0, z:-15, yaw:0, label:"Passing accuracy", sub:"Hit the rings around the centre circle"},
  head:{x:15, z:-13.5, yaw:-Math.PI/2, label:"Heading drill", sub:"Time the jump, head it at the target"},
  intercept:{x:5.5, z:-7.6, yaw:-Math.PI/2, label:"Interception drill", sub:"Read the ball machine and cut the pass out"}
};
export const RINGS = [[-9, -8.5], [9.5, -21.5], [-11, -22], [10, -9.2], [-3.5, -23.5], [4, -6.8]];

/* ---------- the gym ---------- */
const GY = {wall:0xe1dbcf, dark:0x2b2f34, grey:0xa5aba7, teal:0x2f8f86};
function treadmill(x, z){
  const f = frame(x, z);
  rb(f, 0, 0, .1, .92, .24, 1.9, .08, 0x45474a, {seg:2});
  rb(f, 0, .24, .15, .74, .015, 1.7, .01, 0x26282a);
  for (const s of [-1, 1]) rb(f, s*.37, .2, -.86, .07, 1.15, .07, .03, GY.grey, {key:"metal", rz:-s*.04});
  rb(f, 0, 1.28, -.92, .98, .42, .12, .06, GY.dark, {rx:.45, seg:2});
  rb(f, 0, 1.36, -.86, .66, .26, .02, .02, 0x2f6f9a, {rx:.45, key:"screen"});
  for (const s of [-1, 1]) cy(f, s*.37, 1.05, -.6, .022, .022, .5, GY.grey, {seg:8, rx:Math.PI/2, key:"metal"});
  fsolid(f, 0, .05, .94, 2.1, 0, 1.4);
}
function rack(x, z){
  const f = frame(x, z);
  rb(f, 0, 0, 0, 1.6, .06, .95, .02, GY.dark);
  for (const s of [-1, 1]){ rb(f, s*.6, .06, -.25, .09, 2.1, .09, .02, GY.grey, {key:"metal"}); rb(f, s*.6, .06, .25, .09, 2.1, .09, .02, GY.grey, {key:"metal"}); rb(f, s*.6, 2.12, 0, .09, .07, .6, .02, GY.grey, {key:"metal"}); }
  cy(f, 0, 1.45, -.1, .022, .022, 2.0, 0xc9cdd0, {seg:8, rz:Math.PI/2, key:"metal"});
  for (const s of [-1, 1]) cy(f, s*.78, 1.45, -.1, .23, .23, .06, s < 0 ? GY.teal : 0x2b2c2e, {seg:18, rz:Math.PI/2});
  rb(f, 0, .42, 1.55, .34, .1, 1.2, .04, 0x2a2b2d, {seg:2});
  for (const dz of [1.1, 2.0]) rb(f, 0, 0, dz, .26, .42, .07, .02, GY.grey, {key:"metal"});
  fsolid(f, 0, 0, 1.7, 1.0, 0, 2.2); fsolid(f, 0, 1.55, .4, 1.25, 0, .55);
}
function dumbbellRack(x, z, ry){
  const f = frame(x, z, ry);
  for (const s of [-1, 1]) rb(f, s*.85, 0, 0, .06, .85, .5, .02, 0x2a2b2d, {key:"metal"});
  rb(f, 0, .78, -.08, 1.8, .04, .38, .02, GY.grey, {key:"metal"}); rb(f, 0, .4, .02, 1.8, .04, .44, .02, GY.grey, {key:"metal"});
  const ends = [0xe2722e, 0xe0a52e, GY.teal, 0x2b2c2e, 0xc8463a];
  for (let i = 0; i < 6; i++) for (const [y, zz] of [[.87, -.08], [.49, .02]]){
    const lx = -.72 + i*.29;
    cy(f, lx, y, zz, .018, .018, .2, 0x9aa0a4, {seg:6, rx:Math.PI/2, key:"metal"});
    for (const e of [-.1, .1]) rb(f, lx, y - .06, zz + e, .12, .12, .05, .025, ends[(i + (y > .7 ? 0 : 2)) % 5], {center:false});
  }
  fsolid(f, 0, 0, 1.8, .55, 0, .95);
}
function ladderDrill(x, z0, z1){
  box(x - 1.3, .025, z0, x + 1.3, .04, z1, 0xffffff, {tex:"turf", ao:false, jit:0});
  for (let z = z0 + .6; z < z1 - 2.6; z += .5) box(x - .45, .041, z, x + .45, .046, z + .05, 0xf2f2ee, {ao:false, jit:0});
  for (const dx of [-.45, .45]) box(x + dx - .025, .041, z0 + .6, x + dx + .025, .046, z1 - 2.6, 0xf2f2ee, {ao:false, jit:0});
  for (let i = 0; i < 4; i++) cone(x + (i % 2 ? .55 : -.55), z1 - 2.2 + i*.5, PC.orange, .7);
}
function gym(){
  const x0 = -13, x1 = 13, z0 = 4, z1 = 16, H = 4.2;
  box(x0, 0, z0, x1, .03, z1, 0xffffff, {tex:"rubberFloor", ao:false, jit:0});
  floor(x0 + .25, x1 - .25, z0 + .25, z1 - .25, .03);
  const win = (a0, a1) => [a0, a1, .8, 3.4], door = [-.8, .8, 0, 2.5], PT = {tex:"paint"};
  // the walls: painted inside; outside a skin of standing-seam cladding over a concrete plinth
  wall("x", z1 - .125, x0, x1, 0, H, .25, GY.wall, [win(-11.5, -2.5), door, win(2.5, 11.5)], PT);
  wall("x", z0 + .125, x0, x1, 0, H, .25, GY.wall, [win(-11.5, -2.5), win(2.5, 11.5)], PT);
  wall("z", x0 + .125, z0, z1, 0, H, .25, GY.wall, [], PT);
  wall("z", x1 - .125, z0, z1, 0, H, .25, GY.wall, [], PT);
  const CL = {solid:false, tex:"cladding", jit:0}, PL = {solid:false, tex:"concrete", jit:0}, clad = 0x5d6b78;
  wall("x", z1 + .01, x0 - .02, x1 + .02, .5, H, .02, clad, [win(-11.5, -2.5), [-.88, .88, 0, 2.58], win(2.5, 11.5)], CL);
  wall("x", z0 - .01, x0 - .02, x1 + .02, .5, H, .02, clad, [win(-11.5, -2.5), win(2.5, 11.5)], CL);
  wall("z", x0 - .01, z0 - .02, z1 + .02, .5, H, .02, clad, [], CL); wall("z", x1 + .01, z0 - .02, z1 + .02, .5, H, .02, clad, [], CL);
  wall("x", z1 + .03, x0 - .04, x1 + .04, 0, .5, .06, 0xa9a59d, [[-.88, .88, 0, 2.58]], PL); wall("x", z0 - .03, x0 - .04, x1 + .04, 0, .5, .06, 0xa9a59d, [], PL);
  wall("z", x0 - .03, z0 - .04, z1 + .04, 0, .5, .06, 0xa9a59d, [], PL); wall("z", x1 + .03, z0 - .04, z1 + .04, 0, .5, .06, 0xa9a59d, [], PL);
  for (const zz of [z0 + .125, z1 - .125]) for (const [a0, a1] of [[-11.5, -2.5], [2.5, 11.5]]){
    box(a0, .8, zz - .02, a1, 3.4, zz + .02, 0xa9c2d2, {key:"glass", ao:false, jit:0});
    for (let k = 0; k <= 4; k++){ const xx = a0 + (a1 - a0)*k/4; rbox(xx, .8, zz, .1, 2.6, .16, .03, 0x3d434a, {key:"metal"}); }
    for (const y of [.8, 3.34]) rbox((a0 + a1)/2, y, zz, a1 - a0, .07, .18, .02, 0x3d434a, {key:"metal"});
    rbox((a0 + a1)/2, .74, zz + (zz > 10 ? .1 : -.1), a1 - a0 + .2, .06, .2, .02, 0xc7c2b8);         // the sill outside
  }
  // a dark stripe along the walls (broken at the door), and a lime one at eye level — the club's colours inside
  box(x0 + .25, .03, z0 + .26, x1 - .25, .5, z0 + .28, 0x2b2f34, {ao:false, jit:0});
  box(x0 + .25, .03, z1 - .28, -.9, .5, z1 - .26, 0x2b2f34, {ao:false, jit:0}); box(.9, .03, z1 - .28, x1 - .25, .5, z1 - .26, 0x2b2f34, {ao:false, jit:0});
  box(x0 + .26, .03, z0 + .25, x0 + .28, .5, z1 - .25, 0x2b2f34, {ao:false, jit:0}); box(x1 - .28, .03, z0 + .25, x1 - .26, .5, z1 - .25, 0x2b2f34, {ao:false, jit:0});
  box(x0 + .25, 3.45, z0 + .25, x0 + .28, 3.55, z1 - .25, 0xc8f060, {ao:false}); box(x1 - .28, 3.45, z0 + .25, x1 - .25, 3.55, z1 - .25, 0xc8f060, {ao:false});
  // the roof: a slim overhanging slab with a metal edge, and plant on top
  rbox(0, H, 10, x1 - x0 + .5, .32, z1 - z0 + .5, .06, 0x3b4249, {key:"metal"});
  box(x0, H - .02, z0, x1, H, z1, 0xe8e3d8, {ao:false, tex:"paint"});
  for (const [ax, az] of [[-8, 8], [-5.6, 8], [7, 12]]){ rbox(ax, H + .32, az, 1.6, .9, 1.0, .06, 0xc9cdd0, {key:"metal"}); cyl(ax, H + 1.22, az, .38, .02, 0x2a2d30, {seg:14}); }
  for (const x of [-8, 0, 8]) for (const z of [7, 13]) rbox(x, H - .08, z, 2.6, .06, .5, .03, 0xfff6e0, {key:"lamp"});
  for (const x of [-8, 0, 8]) lightSrc({x, y:H - .5, z:10, color:0xfff2dc, intensity:10, distance:14, indoor:true});
  // the door: lined, glass, with a canopy and a light over it
  doorway("x", z1 - .125, -.8, .8, 0, 2.5, .25, {color:0x2b3036, arch:.08, proud:.06, sill:.04, sillColor:0x8d8a84, key:"metal"});
  hingedDoor({hingeX:-.77, z:z1 - .125, base:.042, width:1.54, height:2.43, into:-1, color:0x3d4a56, glass:true, label:"Gym door"});
  rbox(0, 2.66, z1 + .6, 2.6, .12, 1.25, .04, 0x3b4249, {key:"metal"});
  box(-.45, 2.64, z1 + .55, .45, 2.66, z1 + .65, 0xfff1d0, {key:"lamp", ao:false, jit:0});
  lightSrc({x:0, y:2.5, z:z1 + .7, color:0xffe8c8, intensity:4, distance:6});
  // power corner: the rack, dumbbells, plyo boxes
  rack(-9.6, 6.8);
  dumbbellRack(-12.25, 10.2, Math.PI/2);
  for (const [i, h] of [[0, .45], [1, .6], [2, .75]]) plyoBox(-8.6 + i*1.1, 13.6, 0, h);
  spot({aim:[[-10.5, 0, 6.1], [-8.7, 2.2, 8.6]], x:-9.6, z:7.6, label:"Squat rack", hint:"Strength set · power · 45 min", run:() => ctx.reps("squat")});
  spot({aim:[[-12.6, 0, 9.2], [-11.7, 1.1, 11.2]], x:-12, z:10.2, label:"Dumbbells", hint:"Strength set · power · 45 min", run:() => ctx.reps("dumbbell")});
  spot({aim:[[-9.1, 0, 13.2], [-5.9, .9, 14.0]], x:-7.5, z:13.6, label:"Plyo boxes", hint:"Jump set · jumping · 45 min", run:() => ctx.reps("plyo")});
  // pace: the sprint lane
  ladderDrill(0, 4.6, 15.2);
  spot({aim:[[-1.3, 0, 4.6], [1.3, 1.0, 12.6]], x:0, z:8, label:"Sprint ladder", hint:"Speed set · pace · 45 min", run:() => ctx.reps("ladder")});
  // stamina: treadmills facing the window, a bike
  for (const x of [5.4, 7.6, 9.8]){
    treadmill(x, 6.9);
    spot({aim:[[x - .5, 0, 5.8], [x + .5, 1.7, 8.0]], x, z:7.2, label:"Treadmill", hint:"Endurance run · stamina · 45 min", run:() => ctx.reps("treadmill")});
  }
  bike(5.6, 10.8, 0); bike(7.6, 10.8, 0);
  spot({aim:[[4.9, 0, 10.4], [8.4, 1.2, 11.2]], x:6.6, z:10.8, label:"Exercise bike", hint:"Intervals · stamina and pace · 45 min", run:() => ctx.reps("bike")});
  // the refreshment corner: the fridge for your food, a vending machine, water, and a bench to wait on
  gymFridge(12.25, 14.6);
  vending(12.25, 12.75, -Math.PI/2, vendTex());
  spot({aim:[[11.7, 0, 12.3], [12.8, 1.9, 13.2]], label:"Vending machine", hint:"Drinks and snacks · pay by card", hold:.2, run:() => ctx.vend()});
  waterCooler(12.4, 11.3, -Math.PI/2);
  spot({aim:[[12.1, 0, 11.0], [12.7, 1.4, 11.6]], label:"Water cooler", hint:"A cup of water · −2 fatigue", hold:.2, run:() => ctx.water()});
  bench(9.3, 15.35, 0, 2.6);
  spot({x:9.3, y:.8, z:15, r:1.8, aim:[[8, 0, 14.9], [10.6, 1, 15.7]], near:true, label:"Bench", hint:"Sit down and let time pass", run:() => ctx.wait("gym")});
  kitBag(4.2, 15.2, .2, 0x1f2e4a); bottle(10.4, .45, 15.3);
  // signs hanging over each corner
  for (const [t, x, z] of [["POWER", -9.4, 9.2], ["PACE", 0, 13.6], ["STAMINA", 7.6, 9.0], ["JUMP", -7.4, 12.2]]){ sign(t, x, 3.55, z, 0, 1.6, {double:true}); cy(frame(x - .6, z), 0, 3.75, 0, .01, .01, .45, 0x3b4249, {seg:4}); cy(frame(x + .6, z), 0, 3.75, 0, .01, .01, .45, 0x3b4249, {seg:4}); }
  sign("LEGENDS ARE BUILT HERE", 0, 3.3, z0 + .27, 0, 4.6, {bar:"#c8f060"});
  sign("GYM", 0, 3.15, z1 + .06, 0, 1.6);
}
// the glass-door fridge in the gym. Same food as at home.
function gymFridge(x, z){
  const f = frame(x, z, -Math.PI/2);
  cabinet(f, .8, 1.95, .7, 0xdfe3e6);
  rb(f, 0, .06, -.29, .7, 1.8, .02, .01, 0xf6f8fa, {key:"lamp"});
  for (let i = 0; i < 4; i++) rb(f, 0, .22 + i*.42, 0, .72, .02, .6, .01, 0xd5e2e6, {key:"glass"});
  rb(f, 0, 1.82, .352, .6, .1, .01, .01, 0x1f6fd1);
  fsolid(f, 0, 0, .8, .7, 0, 1.95);
  // the door: glass in a frame, hinged on the left as you face it
  const g = new THREE.Group(); const [hx, hz] = worldPt(f, -.4, .36); g.position.set(hx, 0, hz); g.rotation.y = f.ry;
  const frm = mat({color:0xcfd5da, roughness:.35, metalness:.6}), gl = mat({color:0xbcd6e6, transparent:true, opacity:.28, roughness:.05, metalness:.1});
  const add = (w, h, d, px, py, m) => { const mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mm.position.set(px, py, 0); g.add(mm); return mm; };
  add(.8, .06, .04, .4, .06, frm); add(.8, .06, .04, .4, 1.89, frm); add(.05, 1.85, .04, .025, .97, frm); add(.05, 1.85, .04, .775, .97, frm);
  add(.7, 1.77, .01, .4, .97, gl); add(.03, .5, .05, .72, 1.0, frm);
  W.scene.add(g);
  const D = {a:0, target:0};
  W.anims.push(dt => { D.a += (D.target - D.a)*(1 - Math.exp(-7*dt)); g.rotation.y = f.ry - D.a; });
  const box3 = new THREE.Box3();
  spot({kind:"drag", label:"Fridge", get hint(){ return D.a > .5 ? "Close it" : "Open it · your food lives here and at home"; }, y:1,
    aim:() => { g.updateMatrixWorld(); box3.setFromObject(g); box3.expandByScalar(.03); return [box3.min.toArray(), box3.max.toArray()]; },
    spin:-1, get angle(){ return D.a; }, toggle(){ D.target = D.a > .5 ? 0 : 1.7; },
    drag(da){ D.a = Math.max(0, Math.min(1.9, D.a - da)); D.target = D.a; },
    hinge(){ return g.getWorldPosition(new THREE.Vector3()); },
    edge(){ g.updateMatrixWorld(); return g.localToWorld(new THREE.Vector3(.75, 1, 0)); }});
  const items = new THREE.Group(); W.scene.add(items);
  const slots = y => [-.22, 0, .22].map(lx => worldPt(f, lx, .12));
  const [ex0, ez0] = worldPt(f, -.35, .3), [ex1, ez1] = worldPt(f, .35, -.25);
  GROUND.fridge = {group:items, ctx, open:() => D.a > 1.0, ry:f.ry,
    shelves:[{y:.24, kind:"food", slots:slots()}, {y:.66, kind:"food", slots:slots()}, {y:1.08, kind:"drink", slots:slots()}, {y:1.5, kind:"drink", slots:slots()}],
    across:[-.045, 0], emptyAim:[[Math.min(ex0, ex1), .1, Math.min(ez0, ez1)], [Math.max(ex0, ex1), 1.8, Math.max(ez0, ez1)]]};
  fillFridge(GROUND.fridge);
}
export function refreshGymFridge(){ if (GROUND.fridge) fillFridge(GROUND.fridge); }

/* ---------- the pitch ---------- */
function pitchLines(){
  const L = (x0, z0, x1, z1) => box(Math.min(x0, x1), .012, Math.min(z0, z1), Math.max(x0, x1), .016, Math.max(z0, z1), 0xf4f6f0, {ao:false, jit:0});
  const {x0, x1, z0, z1} = PITCH, t = .1;
  L(x0, z0, x1, z0 + t); L(x0, z1 - t, x1, z1); L(x0, z0, x0 + t, z1); L(x1 - t, z0, x1, z1); L(-t/2, z0, t/2, z1);
  const ring = (r, cx, cz, a0 = 0, a1 = Math.PI*2) => { const g = new THREE.RingGeometry(r - .05, r + .05, 56, 1, a0, a1 - a0); g.rotateX(-Math.PI/2); g.translate(cx, .014, cz); addGeo(g, 0xf4f6f0, {ao:false, jit:0}); };
  ring(4.2, 0, PITCH.cz);
  for (const s of [-1, 1]){
    const gx = s > 0 ? x1 : x0, bx = gx - s*8, sx = gx - s*3;
    L(gx, -23, bx, -22.9); L(gx, -7.1, bx, -7); L(bx - t/2, -23, bx + t/2, -7);         // the penalty area
    L(gx, -19, sx, -18.9); L(gx, -11.1, sx, -11); L(sx - t/2, -19, sx + t/2, -11);      // the six-yard box
    const pg = new THREE.CircleGeometry(.14, 12); pg.rotateX(-Math.PI/2); pg.translate(gx - s*6, .015, PITCH.cz); addGeo(pg, 0xf4f6f0, {ao:false, jit:0});
    ring(3.4, gx - s*6, PITCH.cz, s > 0 ? Math.PI*.5 + .95 : -Math.PI*.5 + .95, s > 0 ? Math.PI*1.5 - .95 : Math.PI*.5 - .95);
  }
  const cs = new THREE.CircleGeometry(.14, 12); cs.rotateX(-Math.PI/2); cs.translate(0, .015, PITCH.cz); addGeo(cs, 0xf4f6f0, {ao:false, jit:0});
  for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) cornerFlag(cx, cz);
}
// the targets for the passing drill, painted rings with a disc in the middle
function rings(){
  for (const [x, z] of RINGS){
    for (const [r, c] of [[1.3, 0xffffff], [.8, 0xd8ff3a]]){ const g = new THREE.RingGeometry(r - .06, r, 40); g.rotateX(-Math.PI/2); g.translate(x, .017, z); addGeo(g, c, {ao:false, jit:0}); }
    const d = new THREE.CircleGeometry(.3, 24); d.rotateX(-Math.PI/2); d.translate(x, .018, z); addGeo(d, 0xd8ff3a, {ao:false, jit:0});
  }
}
function ballMachine(x, z, ry){
  const f = frame(x, z, ry);
  rb(f, 0, 0, 0, .9, .5, .7, .08, 0x2b2f34, {seg:2});
  for (const s of [-1, 1]) cy(f, s*.36, .14, -.25, .14, .14, .08, 0x1b1d20, {seg:14, rz:Math.PI/2});
  rb(f, 0, .5, 0, .6, .4, .5, .1, 0xc8463a, {seg:2, key:"paint"});
  cy(f, 0, .8, .15, .12, .12, .4, 0x3b4249, {seg:14, rx:Math.PI/2 - .3, key:"metal"});
  cy(f, 0, .9, -.15, .22, .16, .3, 0x3b4249, {seg:12, open:false});
  for (let i = 0; i < 4; i++){ const [bx, bz] = worldPt(f, (i % 2 - .5)*.14, -.15 + (i > 1 ? .1 : -.05)); ball(bx, 1.2, bz); }
  fsolid(f, 0, 0, .95, .75, 0, 1.2);
}
function drillBoard(x, z, ry, title, sub){
  const f = frame(x, z, ry);
  for (const s of [-1, 1]) rb(f, s*.42, 0, 0, .05, 1.0, .05, .02, PC.darkSteel, {rx:s*0});
  const t = textTex(512, 256, g => {
    g.fillStyle = "#14202c"; g.fillRect(0, 0, 512, 256); g.fillStyle = "#c8f060"; g.fillRect(0, 0, 512, 10);
    g.fillStyle = "#c8f060"; g.font = `800 30px "Barlow Condensed", sans-serif`; g.fillText("DRILL STATION", 28, 58);
    g.fillStyle = "#fff"; g.font = `800 60px "Barlow Condensed", sans-serif`; g.fillText(title.toUpperCase(), 28, 128);
    g.fillStyle = "#b9c7d6"; g.font = `600 28px "Barlow", sans-serif`; g.fillText(sub, 28, 186);
    g.fillStyle = "#c8f060"; g.font = `700 26px "Barlow", sans-serif`; g.fillText("Stand on the marker · press E", 28, 230);
  });
  const [wx, wz] = worldPt(f, 0, .03);
  rb(f, 0, .55, -.01, 1.0, .5, .04, .02, 0x1b2026);
  label(t, wx, .8, wz, .96, .48, ry, {rough:.5});
  fsolid(f, 0, 0, 1, .2, 0, 1.1);
}
function drillStations(){
  const D = DRILLS;
  // shooting: mannequins as a wall, a ball bag, a keeper dummy in the goal
  for (const k of [-1, 0, 1]) mannequin(-15.5, -17.6 + k*.62, Math.PI/2, PC.yellow);
  ballBag(-8.2, -12.6, .4);
  for (let i = 0; i < 5; i++){ const a = i/5*Math.PI*2; ball(-9.5 + Math.cos(a)*.6, .11, -16.6 + Math.sin(a)*.3); }
  drillBoard(-8.6, -11.4, Math.PI*.15, D.shoot.label, D.shoot.sub);
  marker(D.shoot.x, D.shoot.z, PC.lime);
  spot({x:D.shoot.x, z:D.shoot.z, y:.6, r:1.6, near:true, label:D.shoot.label, hint:"Five shots · accuracy and shot power · 30 min", run:() => ctx.drill("shoot")});
  // passing: the rings round the centre circle
  rings();
  ballBag(1.2, -13.6, -.3);
  drillBoard(2.4, -11.6, -Math.PI*.1, D.pass.label, D.pass.sub);
  marker(D.pass.x, D.pass.z, PC.lime);
  spot({x:D.pass.x, z:D.pass.z, y:.6, r:1.6, near:true, label:D.pass.label, hint:"Six passes · pass accuracy and passing · 30 min", run:() => ctx.drill("pass")});
  // heading: a ball machine lobbing them in from the corner
  ballMachine(19.4, -24.2, -Math.PI*.75);
  drillBoard(13.6, -10.4, -Math.PI*.2, D.head.label, D.head.sub);
  marker(D.head.x, D.head.z, PC.lime);
  spot({x:D.head.x, z:D.head.z, y:.6, r:1.6, near:true, label:D.head.label, hint:"Five headers · heading and jumping · 30 min", run:() => ctx.drill("head")});
  // interception: the passing machine along the near touchline, cone gates behind you
  ballMachine(12.5, -7.6, -Math.PI/2);
  for (const z of [-5.6, -7.6, -9.6]){ cone(-1.5, z - .55, PC.orange, .8); cone(-1.5, z + .55, PC.orange, .8); }
  drillBoard(7.4, -4.9, 0, D.intercept.label, D.intercept.sub);
  marker(D.intercept.x, D.intercept.z, PC.lime);
  spot({x:D.intercept.x, z:D.intercept.z, y:.6, r:1.6, near:true, label:D.intercept.label, hint:"Six passes to read · interception · 30 min", run:() => ctx.drill("intercept")});
  // the odd cone and ball left lying about after the morning
  for (const [x, z] of [[-17, -9], [-17, -11], [-15, -9], [-15, -11], [18, -8.5]]) cone(x, z, PC.orange, .8);
  ball(-6.4, .11, -20.4); ball(6.8, .11, -18.7);
}
// one moulded stadium seat, side on: a pan with a lip and a raked back (twenty triangles, shared by every seat)
let SEAT = null;
function seat(x, y, z, c){
  if (!SEAT){
    const sh = new THREE.Shape([[.16, 0], [.16, .07], [-.06, .09], [-.1, .42], [-.15, .42], [-.15, 0]].map(([a, b]) => new THREE.Vector2(a, b)));
    SEAT = new THREE.ExtrudeGeometry(sh, {depth:.44, bevelEnabled:false, curveSegments:1}).rotateY(-Math.PI/2);
  }
  addGeo(SEAT.clone().translate(x + .43, y, z), c, {key:"gloss", ao:false});
}
function stand(clubName){
  // stepped terraces with moulded seats, a roof on steel posts and the club's name along the fascia
  for (let r = 0; r < 6; r++){
    const z0 = -29 - r*.8, y = .1 + r*.45;
    box(-26, 0, z0 - .8, 26, y + .45, z0, 0x9a978f, {ao:false, tex:"concrete", jit:.02});
    for (let x = -25.6; x < 25.6; x += .55){
      if (Math.abs(x + .21) < 3.8) continue;                      // the tunnel mouth
      const c = (Math.floor((x + 26)/.55) + r) % 9 === 0 ? 0xf2f2ee : 0x1f5fb0;
      seat(x, y + .45, z0 - .42, c);
    }
  }
  // the ends: a concrete wall that follows the rake, with a glass wind screen above it
  for (const [a, b_] of [[-26.3, -26], [26, 26.3]]){
    extrude("z", [[-28.6, 0], [-28.6, 1.15], [-33.8, 3.5], [-33.8, 0]], a, b_, 0x8f8c85, {tex:"concrete", jit:0});
    extrude("z", [[-28.6, 1.15], [-28.6, 2.2], [-33.8, 6.4], [-33.8, 3.5]], a + .13, b_ - .13, 0x9fb7c6, {key:"glass", jit:0});
    solid(a, b_, -34.8, -28.6, 0, 7);
  }
  // the front wall along the pitch, with advertising boards
  for (const [a, b_] of [[-26, -3.6], [3.6, 26]]){
    box(a, 0, -28.95, b_, 1.0, -28.6, 0x8f8c85, {tex:"concrete", ao:false, jit:0});
    for (let x = a + .2; x < b_ - 3; x += 3.3) box(x, .2, -28.6, x + 3.1, .9, -28.57, [0x1f5fb0, 0xf2f2ee, 0xc8f060, 0x14202c][Math.floor((x + 26)/3.3) % 4], {key:"screen", ao:false, jit:0});
  }
  box(-26, 0, -34.8, 26, 6.4, -33.8, 0x5d636a, {tex:"concrete", ao:false});
  for (const x of [-25, -12.5, 0, 12.5, 25]) cyl(x, 0, -33.6, .12, 6.8, 0x8a9198, {seg:10, key:"metal"});
  rbox(0, 6.75, -31.75, 53, .25, 6.6, .08, 0x2f363d, {key:"metal"});
  box(-26.5, 6.3, -28.6, 26.5, 6.8, -28.4, 0x14202c, {ao:false});
  const t = textTex(1024, 64, g => {
    g.fillStyle = "#14202c"; g.fillRect(0, 0, 1024, 64); g.fillStyle = "#fff"; g.font = `800 42px "Barlow Condensed", sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(clubName.toUpperCase() + "  ·  TRAINING CENTRE", 512, 34);
  });
  label(t, 0, 6.55, -28.35, 16, 1.0, 0, {glow:.4});
  solid(-26, 26, -35, -28.6, 0, 7);
  // the tunnel comes out of the middle of the stand: two cheeks and a lintel round a lit recess, double doors at the back
  const TN = 0x6e747a, TC = {tex:"concrete", ao:false, jit:0};
  box(-3.6, 0, -31.5, -2.4, 3.9, -27.4, TN, Object.assign({solid:true}, TC)); box(2.4, 0, -31.5, 3.6, 3.9, -27.4, TN, Object.assign({solid:true}, TC));
  box(-2.4, 2.8, -31.5, 2.4, 3.9, -27.4, TN, TC);
  box(-2.4, 0, -31.5, 2.4, 2.8, -28.6, 0x5c6268, Object.assign({solid:true}, TC));
  box(-2.4, 0, -28.6, 2.4, .02, -27.4, 0xffffff, {tex:"rubberFloor", ao:false, jit:0});
  box(-1.5, .02, -28.6, 1.5, 2.4, -28.56, 0x1b1f23, {ao:false, jit:0});
  for (const s_ of [-1, 1]){
    box(s_ > 0 ? .03 : -1.45, .04, -28.56, s_ > 0 ? 1.45 : -.03, 2.36, -28.54, 0x4b5258, {key:"metal", ao:false, jit:0});
    box(s_ > 0 ? .25 : -1.25, 1.0, -28.54, s_ > 0 ? 1.25 : -.25, 1.06, -28.5, 0xc9cdd1, {key:"metal", ao:false, jit:0});
    box(s_ > 0 ? .2 : -1.3, 1.5, -28.54, s_ > 0 ? 1.3 : -.2, 2.2, -28.535, 0x9fb7c6, {key:"glass", ao:false, jit:0});
  }
  rbox(0, 2.74, -28.0, 3.6, .05, .14, .02, 0xfff1c8, {key:"lamp"});
  lightSrc({x:0, y:2.3, z:-27.8, color:0xfff1c8, intensity:7, distance:6, indoor:true});            // the strip really lights the recess
  rbox(0, 3.9, -29.35, 7.6, .25, 4.5, .08, 0x1c2126);
  rbox(0, 2.9, -27.36, 4.0, .05, .06, .02, 0xfff1c8, {key:"lamp"});
  sign("PLAYERS' TUNNEL", 0, 3.4, -27.33, 0, 3.4);
  for (const dx of [-2.6, 2.6]) rbox(dx, 0, -27.33, .16, 2.9, .06, .03, 0xc8f060, {key:"neon"});
  lightSrc({x:0, y:2.6, z:-26.6, color:0xfff1c8, intensity:6, distance:8, indoor:true});
}

/* ---------- the clubhouse: dressing room, staff office and the stats computer ---------- */
function clubhouse(clubName){
  const b = {x0:18, x1:30, z0:3, z1:17}, H = 6.4, g0 = 3.2;
  const outer = 0xe4ddd0, inner = 0xe9e4d8, PL = {tex:"paint"}, PT = PL;
  // the outside: two floors, the upstairs offices are not yours to go in
  box(b.x0, g0, b.z0, b.x1, H, b.z1, outer, {solid:true, tex:"paint", ao:false});
  wall("z", b.x0 + .125, b.z0, b.z1, 0, g0, .25, outer, [[9.3, 10.9, 0, 2.5], [4.6, 7.2, .9, 2.4], [12.6, 15.2, .9, 2.4]], PL);
  wall("z", b.x1 - .125, b.z0, b.z1, 0, g0, .25, outer, [], PL);
  wall("x", b.z0 + .125, b.x0, b.x1, 0, g0, .25, outer, [[25, 28, .9, 2.4]], PL);
  wall("x", b.z1 - .125, b.x0, b.x1, 0, g0, .25, outer, [[25, 28, .9, 2.4]], PL);
  for (const [a0, a1] of [[4.6, 7.2], [12.6, 15.2]]){
    box(b.x0 + .1, .9, a0, b.x0 + .14, 2.4, a1, 0xa9c2d2, {key:"glass", ao:false, jit:0});
    for (const z of [a0 + .04, (a0 + a1)/2, a1 - .04]) box(b.x0 + .06, .9, z - .04, b.x0 + .18, 2.4, z + .04, 0x2f353b, {key:"metal", ao:false});
    box(b.x0 - .14, .83, a0 - .08, b.x0 + .02, .9, a1 + .08, 0xc7c2b8, {ao:false, jit:0});
  }
  for (const zz of [b.z0 + .12, b.z1 - .14]){
    box(25, .9, zz, 28, 2.4, zz + .02, 0xa9c2d2, {key:"glass", ao:false, jit:0});
    for (const x of [25.04, 26.5, 27.96]) box(x - .04, .9, zz - .04, x + .04, 2.4, zz + .06, 0x2f353b, {key:"metal", ao:false});
  }
  const f = facer("-x", b);
  pilasters(f, 14, H, [[6.2, 8.0]]);
  pilasters(facer("+x", b), 14, H); pilasters(facer("+z", b), 12, H); pilasters(facer("-z", b), 12, H);
  for (const s of [2.5, 5.5, 8.5, 11.5]) decoWin(f, s, 3.2, false);
  for (const side of ["+z", "-z"]){ const g = facer(side, b); for (const s of [3, 6, 9]) decoWin(g, s, 3.2, false); }
  // the way in: a lined doorway, a deep canopy on two posts, a light under it
  doorway("z", b.x0 + .125, 9.3, 10.9, 0, 2.5, .25, {color:0x2b3036, arch:.08, proud:.05, sill:.024, sillColor:0x8d8a84, key:"metal"});
  rbox(b.x0 - .75, 2.62, 10.1, 1.6, .1, 2.9, .04, 0x3b4249, {key:"metal"});
  for (const z of [8.85, 11.35]) rbox(b.x0 - 1.4, 0, z, .08, 2.62, .08, .03, 0x3b4249, {key:"metal", solid:true});
  box(b.x0 - .85, 2.6, 9.6, b.x0 - .65, 2.62, 10.6, 0xfff1d0, {key:"lamp", ao:false, jit:0});
  lightSrc({x:b.x0 - .8, y:2.45, z:10.1, color:0xffe8c8, intensity:4, distance:6});
  roofTop(b, H, {wall:outer, tex:"paint", parapet:.6});
  sign("CLUBHOUSE", b.x0 - .05, 3.0, 6.0, -Math.PI/2, 2.4);
  // inside
  box(b.x0 + .25, 0, b.z0 + .25, b.x1 - .25, .02, b.z1 - .25, 0xffffff, {tex:"terrazzo", ao:false, jit:0});
  floor(b.x0 + .25, b.x1 - .25, b.z0 + .25, b.z1 - .25, .02);
  box(b.x0 + .25, g0 - .25, b.z0 + .25, b.x1 - .25, g0, b.z1 - .25, 0xeeebe4, {ao:false, tex:"paint"});
  // the inside faces of the outer walls, painted
  const SK = {solid:false, ao:false, jit:0, tex:"paint"};
  wall("z", b.x0 + .26, b.z0 + .25, b.z1 - .25, 0, g0 - .25, .02, inner, [[9.3, 10.9, 0, 2.5], [4.6, 7.2, .9, 2.4], [12.6, 15.2, .9, 2.4]], SK);
  wall("x", b.z0 + .26, b.x0 + .25, 22.4, 0, g0 - .25, .02, inner, [], SK); wall("x", b.z1 - .26, b.x0 + .25, 22.4, 0, g0 - .25, .02, inner, [], SK);
  wall("z", 22.5, b.z0 + .25, b.z1 - .25, 0, g0 - .25, .2, inner, [[8.3, 9.7, 0, 2.2], [11.4, 12.8, 0, 2.2]], PT);
  wall("x", 10.5, 22.6, b.x1 - .25, 0, g0 - .25, .2, inner, [], PT);
  for (const [a0, a1] of [[8.3, 9.7], [11.4, 12.8]]) doorway("z", 22.5, a0, a1, 0, 2.2, .2, {color:0x6b4a2c, proud:.04, sill:.024, sillColor:0x9a958c});
  // the dressing room is tiled to shoulder height, the office panelled in oak below a dado rail
  const TL = {solid:false, ao:false, jit:0, tex:"tiles"}, PN = {solid:false, ao:false, jit:0, tex:"panel"};
  wall("z", 22.61, b.z0 + .25, 10.4, .02, 1.6, .02, 0xffffff, [[8.3, 9.7, 0, 2.2]], TL);
  wall("z", b.x1 - .26, b.z0 + .25, 10.4, .02, 1.6, .02, 0xffffff, [], TL);
  wall("x", b.z0 + .26, 22.6, b.x1 - .25, .02, 1.6, .02, 0xffffff, [[25, 28, .9, 2.4]], TL);
  wall("x", 10.39, 22.6, b.x1 - .25, .02, 1.6, .02, 0xffffff, [], TL);
  for (const [a, z0_, z1_, ax] of [["z", 22.61, 10.61, b.z1 - .25], ["z", b.x1 - .26, 10.61, b.z1 - .25]]) wall(a, z0_, z1_, ax, .02, 1.1, .02, 0xc9a77c, a === "z" && z0_ === 22.61 ? [[11.4, 12.8, 0, 2.2]] : [], PN);
  wall("x", 10.61, 22.6, b.x1 - .25, .02, 1.1, .02, 0xc9a77c, [], PN);
  wall("x", b.z1 - .26, 22.6, b.x1 - .25, .02, 1.1, .02, 0xc9a77c, [[25, 28, .9, 2.4]], PN);
  for (const [a, fx, a0, a1, holes] of [["z", 22.625, 10.61, b.z1 - .25, [[11.32, 12.88, 0, 2.3]]], ["z", b.x1 - .275, 10.61, b.z1 - .25, []], ["x", 10.625, 22.6, b.x1 - .25, []], ["x", b.z1 - .275, 22.6, b.x1 - .25, [[25, 28, 0, 2.4]]]])
    wall(a, fx, a0, a1, 1.1, 1.15, .03, 0x6b4a2c, holes, {solid:false, ao:false, jit:0});
  wall("z", b.x1 - .26, b.z0 + .25, 10.4, 1.6, g0 - .25, .02, inner, [], SK); wall("x", b.z0 + .26, 22.6, b.x1 - .25, 1.6, g0 - .25, .02, inner, [[25, 28, .9, 2.4]], SK);
  wall("z", b.x1 - .26, 10.6, b.z1 - .25, 1.1, g0 - .25, .02, inner, [], SK); wall("x", b.z1 - .26, 22.6, b.x1 - .25, 1.1, g0 - .25, .02, inner, [[25, 28, .9, 2.4]], SK);
  // the lobby: the computer, the notice board, the league table, water
  const dk = desk(21.7, 14.2, -Math.PI/2, 1.5, 0xb5895a);
  const scr = textTex(512, 320, g => {
    const gr = g.createLinearGradient(0, 0, 0, 320); gr.addColorStop(0, "#14243a"); gr.addColorStop(1, "#0a1220"); g.fillStyle = gr; g.fillRect(0, 0, 512, 320);
    g.fillStyle = "#c8f060"; g.font = `800 34px "Barlow Condensed", sans-serif`; g.fillText("CLUB PORTAL", 24, 50);
    g.fillStyle = "rgba(255,255,255,.8)"; g.font = `600 20px "Barlow", sans-serif`; g.fillText("Player login · stats · schedule", 24, 84);
    for (let i = 0; i < 5; i++){ g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(24, 110 + i*38, 464, 26); g.fillStyle = ["#c8f060", "#4ea8ff", "#ffd75a", "#5fd47a", "#ff8a5a"][i]; g.fillRect(24, 110 + i*38, 120 + i*61, 26); }
  });
  monitor(dk, 0, .77, -.05, scr, .66);
  chair(21.0, 14.2, Math.PI/2);
  rb(dk, .45, .77, .1, .42, .02, .14, .01, 0x23272b);
  spot({aim:[[21.4, .7, 13.7], [22.1, 1.3, 14.7]], x:21.2, z:14.2, r:1.6, near:true, label:"Club computer", hint:"Your stats, skills, schedule and career", hold:.2, run:() => ctx.computer("club")});
  noticeBoard(22.38, 1.55, 4.6, -Math.PI/2);
  const tbl = textTex(512, 320, g => {
    g.fillStyle = "#14202c"; g.fillRect(0, 0, 512, 320); g.fillStyle = "#c8f060"; g.font = `800 30px "Barlow Condensed", sans-serif`; g.fillText("THE LEAGUE", 22, 42);
    let rows = [];
    try { const GW = gameWorld(), c = myClub(), L = GW.leagues[c.lg]; rows = sortTab(L.tab).slice(0, 8).map((cid, i) => [i + 1, GW.clubs[cid].nm, L.tab[cid][6], cid === c.id]); } catch(e){ console.warn(e); }
    rows.forEach(([n, nm, pts, me], i) => { g.fillStyle = me ? "rgba(200,240,96,.18)" : "rgba(255,255,255,.04)"; g.fillRect(16, 58 + i*31, 480, 27);
      g.fillStyle = me ? "#c8f060" : "#e6edf4"; g.font = `600 19px "Barlow", sans-serif`; g.fillText(`${n}. ${nm}`.slice(0, 34), 26, 78 + i*31); g.fillText(String(pts), 460, 78 + i*31); });
  });
  label(tbl, 22.38, 1.6, 6.95, 1.4, .88, -Math.PI/2, {rough:.4});
  waterCooler(18.7, 16.3, Math.PI);
  bench(18.75, 12.1, -Math.PI/2, 2.0);
  planter(19.2, 3.9, 1.0);
  // the dressing room: lockers round the walls, benches down the middle, an ice bath in the corner
  lockers(26.2, 3.5, 0, 7, 0x2c66b8);
  lockers(29.45, 6.6, -Math.PI/2, 5, 0x2c66b8);
  for (const z of [6.0, 8.4]) bench(26.0, z, 0, 3.4, {back:false, wood:0xb5895a});
  for (const [x, z] of [[24.4, 4.4], [27.5, 4.3]]) kitBag(x, z, .1, 0x1f2e4a);
  bibs(26.8, .47, 6.0, .2, 0xd8ff3a); bibs(25.0, .47, 8.4, -.3, 0xff6a3a);
  const ib = frame(28.6, 9.2);
  rb(ib, 0, 0, 0, 1.5, .62, .95, .2, 0xe6ebee, {seg:2, key:"gloss"});
  rb(ib, 0, .5, 0, 1.3, .06, .75, .1, 0x8fd0e8, {key:"glass"});
  fsolid(ib, 0, 0, 1.5, .95, 0, .62);
  spot({aim:[[27.8, 0, 8.7], [29.4, .9, 9.7]], label:"Ice bath", hint:"20 min · cold, but your legs will thank you", hold:.5, run:() => ctx.iceBath()});
  noticeBoard(22.645, 1.55, 5.2, Math.PI/2, [["TODAY", "Shirts on pegs", "boots outside!"], ["RECOVERY", "Ice bath 20 min", "after every session"], ["KIT", "Bibs in the wash", "basket please"], ["SQUAD", "Team photo", "Friday 9:30"]]);
  lightSrc({x:26.2, y:2.7, z:6.8, color:0xf2f6ff, intensity:8, distance:10, indoor:true});
  for (const z of [5, 8.5]) rbox(26.2, g0 - .3, z, 3, .05, .4, .02, 0xf6f8ff, {key:"lamp"});
  // the staff office
  const od = desk(26.6, 15.6, Math.PI, 1.8, 0x6b4a2c);
  const osc = textTex(256, 160, g => { g.fillStyle = "#101820"; g.fillRect(0, 0, 256, 160); g.fillStyle = "#4ea8ff"; for (let i = 0; i < 6; i++) g.fillRect(16, 20 + i*22, 60 + (i*53) % 160, 10); });
  monitor(od, -.4, .77, .05, osc, .5);
  chair(26.0, 14.6, 0); chair(27.2, 14.6, 0);
  tacticsBoard(23.6, 15.2, Math.PI/2, "THIS WEEK");
  const sh = shelfUnit(29.45, 13.8, -Math.PI/2, 2.4, 1.8, 0x4b5258);
  for (let i = 0; i < 4; i++) cy(sh, -.9 + i*.6, .98, 0, .1, .07, .32, 0xd9b45a, {seg:10, key:"metal"});
  for (let i = 0; i < 3; i++) rb(sh, -.8 + i*.8, 1.6, 0, .3, .2, .25, .02, [0xc8463a, 0x2c66b8, 0x3f8a48][i]);
  staffer(26.6, 16.3, Math.PI, {shirt:0x1b2633, long:true, seed:4, hair:0x9a9a9a});
  spot({aim:[[26, .8, 15.9], [27.2, 2, 16.7]], x:26.6, z:15.2, label:"The manager", get hint(){ return `${typeof roleOutlook === "function" ? roleOutlook() : ""} · open the hub (Q) to talk to him`; }, hold:.2,
    run:() => ctx.note(`The manager looks up from his screen. “${(G() && G().trust >= 25) ? "Keep doing what you are doing." : (G() && G().trust >= 8) ? "Train hard, be on time, and you'll get your minutes." : "I need to see more from you in training."}”`)});
  lightSrc({x:26.2, y:2.7, z:13.6, color:0xfff0d8, intensity:7, distance:9, indoor:true});
  lightSrc({x:20.3, y:2.7, z:10, color:0xfff0d8, intensity:7, distance:10, indoor:true});
  for (const z of [6, 10, 14]) rbox(20.4, g0 - .3, z, .5, .05, 1.6, .02, 0xfff6e0, {key:"lamp"});
}

export function buildGround(c){
  ctx = c;
  reseed(77);
  W.bounds = {x0:-31.3, x1:31.3, z0:-28.6, z1:29.3};
  box(-90, -.2, -90, 90, 0, 90, 0xffffff, {tex:"grass", ao:false, jit:0});
  // paths: the yard, a walk to the clubhouse, the car park, and a strip by the pitch
  box(-17, 0, 16, 17, .02, 29.4, 0xffffff, {tex:"path", ao:false, jit:0});
  box(13, 0, 3, 18, .021, 29.4, 0xffffff, {tex:"path", ao:false, jit:0});
  box(-22, 0, -3.6, 22, .019, 4, 0xffffff, {tex:"concrete", ao:false, jit:0});
  box(18.5, 0, 18.5, 31.4, .02, 29.4, 0xffffff, {tex:"asphalt", ao:false, jit:0});
  box(-23, 0, -27.2, 23, .01, -2.8, 0xffffff, {tex:"pitch", ao:false, jit:0});
  parkingBays(19.2, 19, 4, 2.7, 5, 1);
  pitchLines();
  goal(PITCH.x0, PITCH.cz, -1, PITCH.goalW, PITCH.goalH);
  goal(PITCH.x1, PITCH.cz, 1, PITCH.goalW, PITCH.goalH);
  dugout(-8, -2.1, 0, 5, 0x1f5fb0); dugout(8, -2.1, 0, 5, 0x6d737a);
  for (const [x, z] of [[-24.5, -28.4], [24.5, -28.4], [-24.5, -.5], [24.5, -.5]]) floodlight(x, z, 0, PITCH.cz);
  // the floodlights light the pitch once it gets dark
  for (const [x, z] of [[-12, -12], [12, -18], [-12, -20], [12, -9]]) lightSrc({x, y:11, z, color:0xf4f6ff, intensity:46, distance:34, decay:1.2});
  gym();
  drillStations();
  // the bench in the yard, for waiting out the morning
  bench(-9, 20, 0, 2.6);
  spot({x:-9, y:.8, z:19.2, r:2.2, aim:[[-10.4, 0, 19.6], [-7.6, 1.1, 20.5]], near:true, label:"Bench", hint:"Sit down and let time pass", run:() => ctx.wait("yard")});
  bin(-6.7, 20.2, 0); planter(-12, 16.8, 1.6); planter(12, 16.8, 1.6); bin(2.2, 16.6, 0);
  // Sheffield stands for the players' bikes by the gym door
  for (let i = 0; i < 4; i++){ const x = 4.4 + i*.9, z0 = 16.7, z1 = 17.5;
    for (const z of [z0, z1]) beam(x, 0, z, x, .78, z, .05, .05, 0x8f979e, {round:true, seg:6, key:"metal"});
    beam(x, .8, z0, x, .8, z1, .05, .05, 0x8f979e, {round:true, seg:6, key:"metal"}); }
  solid(4.3, 7.2, 16.65, 17.55, 0, .82);
  const clubName = (typeof myClub === "function" && myClub()) ? myClub().nm : "Legend Rising";
  stand(clubName);
  clubhouse(clubName);
  // fences, the gate by the bus stop, hedges along them
  wireFence(-31.6, 29.6, -18, 29.6); wireFence(-10, 29.6, 31.6, 29.6);
  wireFence(-31.6, -28.8, -31.6, 29.6); wireFence(31.6, -28.8, 31.6, 29.6);
  for (const s of [-1, 1]){ rbox(s > 0 ? -10 : -18, 0, 29.6, .5, 2.8, .5, .08, 0x3b4249, {solid:true}); }
  sign(`${clubName.toUpperCase()} · TRAINING CENTRE`, -14, 3.1, 29.75, Math.PI, 7.6);
  rbox(-14, 2.6, 29.6, 8.6, .14, .3, .05, 0x2a3036);
  hedge(-29.5, 27.8, -20, 27.8); hedge(-6, 27.8, 11, 27.8);
  for (const [x, z] of [[-26, 22], [-27.5, 12], [-27, 2], [27, 1.5], [-36, -16], [36, -18], [-38, 10], [38, 12], [-20, 36], [4, 38], [24, 36]]) tree(x, z, .9 + ((x*z) % 3 + 3) % 3*.12);
  for (const [x, z] of [[-29, 18], [-29.4, 7.5], [14.6, 26.8], [-16.5, 26.6]]) bush(x, z, 1);
  for (const [x, z, d] of [[-16, 6, -1], [16, 6, -1], [-16, 26, 1], [9, 26, 1], [17.4, 18, 1], [-24.5, 10, 1]]) streetLamp(x, z, d);
  // the car park, and your own car if you have one
  sign("PLAYERS & STAFF PARKING", 24.6, 2.2, 18.2, 0, 3.2, {bar:"#4ea8ff"});
  for (const x of [23.1, 26.1]) rbox(x, 0, 18.15, .08, 2.0, .08, .02, 0x3b4249, {key:"metal", solid:true});
  car(20.55, 21.5, Math.PI/2, 0x2f3a46); car(25.95, 21.6, Math.PI/2, 0xd8d6cf);
  const ct = typeof carTier === "function" && G() ? carTier() : 0;
  if (ct) car(28.65, 21.5, Math.PI/2, [0, 0x5a6a7a, 0x22303d, 0xc8202a][ct]);
  // low warehouses and houses beyond the fence, so the world goes on past the gate
  for (const [x, z, w, d, h, c] of [[-44, 34, 16, 10, 6, 0x8b8f94], [-22, 40, 14, 9, 8, 0xa3593f], [6, 41, 18, 9, 7, 0x9a8e7e], [30, 38, 14, 10, 9, 0x7b8691],
    [-46, -6, 10, 18, 7, 0x8b5a4a], [46, -4, 10, 20, 6, 0x9a8e7e], [-30, -48, 30, 10, 10, 0x7b8691], [24, -48, 24, 10, 12, 0x8b8f94]])
    rbox(x, 0, z, w, h, d, .2, c);
  busStop(-14, 24.6, {y:.02});
  spot({x:-14, y:1.2, z:24.8, r:2.6, aim:[[-16, 0, 23.9], [-12, 2.7, 26.1]], near:true, label:"Bus stop", hint:"Bus home · 40 min", run:() => ctx.bus("home")});
  // the squad, out on the pitch during the session
  const kit = typeof kitOf === "function" && myClub && myClub() ? kitOf(myClub().nm) : ["#2c66b8", "#ffffff"];
  GROUND.session = teamSession({kit, when:() => typeof sessionOn === "function" && G() && sessionOn(),
    centre:{x:-11, z:-14}, coach:{x:-6, z:-5.4, ry:Math.PI}, ballMesh:ballMesh,
    lap:[{x:-20.4, z:-5}, {x:20.4, z:-5}, {x:20.4, z:-25.2}, {x:-20.4, z:-25.2}]});
  spot({x:-6, y:1.2, z:-5.4, r:2.2, near:true, when:() => typeof sessionOn === "function" && sessionOn(), label:"Coach", hint:"Join the team session · 90 min", run:() => ctx.session()});
  finishBatches();
  return {bus:{x:-14, z:23.2, y:0, yaw:0}, tunnel:{x:0, z:-25.2, y:0, yaw:Math.PI}};
}
// a match ball as a moving mesh, for drills and the squad
let BALLTEX = null;
export function ballMesh(){
  if (!BALLTEX){
    BALLTEX = textTex(256, 128, g => {
      g.fillStyle = "#f4f4f0"; g.fillRect(0, 0, 256, 128);
      g.fillStyle = "#1e2228";
      for (let i = 0; i < 12; i++){ const x = (i % 6)*44 + (i > 5 ? 22 : 0), y = i > 5 ? 86 : 38; g.beginPath();
        for (let k = 0; k < 5; k++){ const a = k/5*Math.PI*2 - Math.PI/2; const px = x + Math.cos(a)*13, py = y + Math.sin(a)*13*(i > 5 ? .9 : 1); k ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); g.fill(); }
    });
    BALLTEX.userData.per = 1;
  }
  const m = new THREE.Mesh(new THREE.SphereGeometry(.11, 18, 12), mat({map:BALLTEX, roughness:.45}));
  m.castShadow = true; m.material.userData.keep = false;
  return m;
}
