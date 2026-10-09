/* ============ LIFE: the training ground ============
   Off the bus at the gate. Ahead, the gym; to the right, the clubhouse with the dressing room, the
   staff office and the computer that knows everything about you; beyond them the training pitch,
   the stand and the tunnel you walk out of on match day. From ten to five on a training day the
   squad is out there working, and being among them is how a dressing room comes to trust you. */
import {THREE, W, box, rbox, cyl, solid, floor, ramp, spot, wall, textTex, label, labels, addGeo, reseed, pick, rnd, finishBatches, lightSrc, mat, part, doorway, extrude, beam, onBegin} from "./build.js";
import {RT} from "./core/state.js";
import {facer, decoWin, pilasters, roofTop, busStop, hingedDoor, leafGuard} from "./home.js";
import {frame, rb, cy, sph, fsolid, worldPt, PC, cone, marker, ball, ballBag, bench, dugout, floodlight,
  waterCooler, bottle, kitBag, bibs, kitHamper, lockers, shelfUnit, tacticsBoard, noticeBoard, desk, monitor, chair, vending, vendTex, plyoBox, bike,
  tree, bush, hedge, streetLamp, bin, sign, wireFence, parkingBays, planter} from "./props.js";
import {teamSession, staffer} from "./npc.js";
import {cabinet} from "./props.js";
import {fillFridge, FRIDGE_OPEN} from "./fridge.js";
import {rack, dumbbellRack, plyoBoxes, ladderLane, treadmill, spinBike, barbell, dumbbell} from "./gymclub.js";
export {barbell, dumbbell};
import {deliveryPoint, POINT_NAME} from "./parcels.js";
import {departures, EXIT} from "./leave.js";
import {bakeCar, CAR_KINDS} from "./cars.js";
import {buildPitchMesh, ballMesh as ballLook} from "./football/pitchmesh.js";
import {GP, groundPitch, meshTierFor, wornFor, DRILLS, toWorld, SESSION_PLAN_MINS} from "./football/trainspec.js";

let ctx = null;
const G = () => (typeof S !== "undefined" ? S : null);
export const GROUND = {fridge:null, session:null, tier:3, pitch:null, spec:null, tunnel:null};
/* the training pitch (DESIGN 3.6.1): 72 x 48 with full-size goals and markings, its frame at (0, -28) so the near
   touchline stays at z = -4 and the pitch grows north. Its numbers come from pitchspec.js through trainspec.js (GP);
   the spec itself (with the grass's rolling deceleration for the club's tier) is made in buildGround: GROUND.spec */
export const PITCH = {L:GP.L, Wd:GP.Wd, cx:GP.cx, cz:GP.cz, x0:GP.cx - GP.L/2, x1:GP.cx + GP.L/2, z0:GP.cz - GP.Wd/2, z1:GP.cz + GP.Wd/2, goalW:7.32, goalH:2.44};
// the assistant coach's post: on the near touchline, between the dugouts' east end and the drill stations
const trainAssist = {x:14.5, z:-2.9, ry:Math.PI};
// where the stand's front wall is (it was 1.6 m behind the old far touchline; now 4 m behind the new one) and the tunnel
const STAND_Z = PITCH.z0 - 4, TUNNEL = {x:0, z:STAND_Z + 1.8};

// what the coach's spot says: the session's length from the plan it runs (trainspec.js), or that today's is done
export function sessionHint(){
  const s = G(), ss = s && s.life && s.life.att && s.life.att.sess;
  return ss && ss.done ? "Done for today" : `Join the team session · ${SESSION_PLAN_MINS} min · once a day`;
}

/* ---------- the gym ---------- */
const GY = {wall:0xe1dbcf, dark:0x2b2f34, grey:0xa5aba7, teal:0x2f8f86};
// (the equipment itself, the racks, dumbbells, plyo boxes, sprint lane, treadmills and bikes, is gymclub.js, in six tiers)
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
  // a dark stripe along the walls (broken at the door), and a lime one at eye level: the club's colours inside
  box(x0 + .25, .03, z0 + .26, x1 - .25, .5, z0 + .28, 0x2b2f34, {ao:false, jit:0});
  box(x0 + .25, .03, z1 - .28, -.9, .5, z1 - .26, 0x2b2f34, {ao:false, jit:0}); box(.9, .03, z1 - .28, x1 - .25, .5, z1 - .26, 0x2b2f34, {ao:false, jit:0});
  box(x0 + .26, .03, z0 + .25, x0 + .28, .5, z1 - .25, 0x2b2f34, {ao:false, jit:0}); box(x1 - .28, .03, z0 + .25, x1 - .26, .5, z1 - .25, 0x2b2f34, {ao:false, jit:0});
  box(x0 + .25, 3.45, z0 + .25, x0 + .28, 3.55, z1 - .25, 0xc8f060, {ao:false}); box(x1 - .28, 3.45, z0 + .25, x1 - .25, 3.55, z1 - .25, 0xc8f060, {ao:false});
  // the roof: a slim overhanging slab with a metal edge, and plant on top
  rbox(0, H, 10, x1 - x0 + .5, .32, z1 - z0 + .5, .06, 0x3b4249, {key:"metal"});
  box(x0 + .25, H - .02, z0 + .25, x1 - .25, H, z1 - .25, 0xe8e3d8, {ao:false, tex:"paint"});
  for (const [ax, az] of [[-8, 8], [-5.6, 8], [7, 12]]){ rbox(ax, H + .32, az, 1.6, .9, 1.0, .06, 0xc9cdd0, {key:"metal"}); cyl(ax, H + 1.22, az, .38, .02, 0x2a2d30, {seg:14}); }
  for (const x of [-8, 0, 8]) for (const z of [7, 13]) rbox(x, H - .08, z, 2.6, .06, .5, .03, 0xfff6e0, {key:"lamp"});
  for (const x of [-8, 0, 8]) lightSrc({x, y:H - .5, z:10, color:0xfff2dc, intensity:10, distance:14, indoor:true});
  // the door: lined, glass, with a canopy and a light over it
  doorway("x", z1 - .125, -.8, .8, 0, 2.5, .25, {color:0x2b3036, arch:.08, proud:.06, sill:.04, sillColor:0x8d8a84, key:"metal"});
  hingedDoor({hingeX:-.77, z:z1 - .125, base:.042, width:1.54, height:2.43, into:-1, color:0x3d4a56, glass:true, label:"Gym door"});
  rbox(0, 2.66, z1 + .6, 2.6, .12, 1.25, .04, 0x3b4249, {key:"metal"});
  box(-.45, 2.64, z1 + .55, .45, 2.66, z1 + .65, 0xfff1d0, {key:"lamp", ao:false, jit:0});
  lightSrc({x:0, y:2.5, z:z1 + .7, color:0xffe8c8, intensity:4, distance:6});
  // the kit is as good as the club can afford (clubFacTier: from a rusting Liga 4 shed to an elite academy)
  const t = GROUND.tier;
  // power corner: the rack, dumbbells, plyo boxes
  rack(-9.6, 6.8, t);
  dumbbellRack(-12.25, 10.2, Math.PI/2, t);
  plyoBoxes(-7.5, 13.6, t, 1);
  spot({aim:[[-10.5, 0, 6.1], [-8.7, 2.2, 8.6]], x:-9.6, z:7.6, label:"Squat rack", hint:"Strength set · power · 45 min", run:() => ctx.reps("squat")});
  spot({aim:[[-12.6, 0, 9.2], [-11.7, 1.1, 11.2]], x:-12, z:10.2, label:"Dumbbells", hint:"Strength set · power · 45 min", run:() => ctx.reps("dumbbell")});
  spot({aim:[[-9.1, 0, 13.2], [-5.9, .9, 14.0]], x:-7.5, z:13.6, label:"Plyo boxes", hint:"Jump set · jumping · 45 min", run:() => ctx.reps("plyo")});
  // pace: the sprint lane
  ladderLane(0, 4.6, 15.2, t);
  spot({aim:[[-1.3, 0, 4.6], [1.3, 1.0, 12.6]], x:0, z:8, label:"Sprint ladder", hint:"Speed set · pace · 45 min", run:() => ctx.reps("ladder")});
  // stamina: treadmills facing the window, a bike
  for (const x of [5.4, 7.6, 9.8]){
    // at the bottom tier one of them has given up
    const broken = t <= 2 && x === 9.8;
    treadmill(x, 6.9, t, {broken});
    spot({aim:[[x - .5, 0, 5.8], [x + .5, 1.7, 8.0]], x, z:7.2, label:"Treadmill", hint:broken ? "Out of order. It has been for months" : "Endurance run · stamina · 45 min", run:() => broken ? ctx.note("OUT OF ORDER. The tape on the sign has gone yellow.") : ctx.reps("treadmill")});
  }
  spinBike(5.6, 10.8, 0, t); spinBike(7.6, 10.8, 0, t);
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
  // solid where it stands when open, and it stops short of you instead of swinging through you
  const guard = leafGuard(hx, hz, .8, 0, 1.95, 8), dirOf = a => [Math.cos(f.ry - a), -Math.sin(f.ry - a)];
  const turnTo = a => { D.a = guard.reach(D.a, a, dirOf); };
  W.anims.push(dt => {
    if (Math.abs(D.target - D.a) > 1e-4) turnTo(D.a + (D.target - D.a)*(1 - Math.exp(-7*dt)));
    g.rotation.y = f.ry - D.a;
    const [ux, uz] = dirOf(D.a); guard.set(ux, uz, D.a > .06, dt);
  });
  const box3 = new THREE.Box3();
  spot({kind:"drag", label:"Fridge", get hint(){ return D.a > FRIDGE_OPEN ? "Close it" : "Open it · your food lives here and at home"; }, y:1,
    aim:() => { g.updateMatrixWorld(); box3.setFromObject(g); box3.expandByScalar(.03); return [box3.min.toArray(), box3.max.toArray()]; },
    spin:-1, get angle(){ return D.a; }, toggle(){ D.target = D.a > .5 ? 0 : 1.7; },
    drag(da){ turnTo(Math.max(0, Math.min(1.9, D.a - da))); D.target = D.a; },
    hinge(){ return g.getWorldPosition(new THREE.Vector3()); },
    edge(){ g.updateMatrixWorld(); return g.localToWorld(new THREE.Vector3(.75, 1, 0)); }});
  const items = new THREE.Group(); W.scene.add(items);
  const slots = y => [-.22, 0, .22].map(lx => worldPt(f, lx, .12));
  const [ex0, ez0] = worldPt(f, -.35, .3), [ex1, ez1] = worldPt(f, .35, -.25);
  // the club's own fridge keeps what the club's facilities can (the training centre's tier); you put food in from in front of it
  const [fx, fz] = worldPt(f, 0, .8);
  (W.fridges || (W.fridges = [])).push({x:fx, z:fz, y:0, name:"the gym fridge", mult:() => clubFridgeMult()});
  // its food is worth what the club's fridge keeps of it (the training centre is never in a power cut: its own supply)
  GROUND.fridge = {group:items, ctx, open:() => D.a > FRIDGE_OPEN, ry:f.ry, src:() => ({keep:clubFridgeMult(), powerCut:false}),
    shelves:[{y:.24, kind:"food", slots:slots()}, {y:.66, kind:"food", slots:slots()}, {y:1.08, kind:"drink", slots:slots()}, {y:1.5, kind:"drink", slots:slots()}],
    across:[-.045, 0], emptyAim:[[Math.min(ex0, ex1), .1, Math.min(ez0, ez1)], [Math.max(ex0, ex1), 1.8, Math.max(ez0, ez1)]]};
  fillFridge(GROUND.fridge);
}
export function refreshGymFridge(){ if (GROUND.fridge) fillFridge(GROUND.fridge); }

/* ---------- the pitch ----------
   The grass, the markings, the goals and their nets are pitchmesh.js's, from the one spec the ball plays on (DESIGN
   3.6.1): what you see is what the ball hits. The club's tier says how the grass looks (meshTierFor) and how worn the
   goalmouths are (wornFor), and how fast the ball rolls on it (trainspec.js rollFor). */
function pitch(tier){
  const spec = GROUND.spec = groundPitch(tier);
  // the grass reaches the near walkway (z -0.4) and the stand's front wall (STAND_Z + .4) and 5 m past each goal line
  const near = -.4 - PITCH.cz, far = PITCH.cz - (STAND_Z + .4), hz = Math.min(near, far);
  GROUND.pitch = buildPitchMesh(spec, {tier:meshTierFor(tier), worn:wornFor(tier), stripes:tier >= 5 ? 12 : tier >= 3 ? 10 : 0, cones:false,
    grass:{hx:PITCH.L/2 + 5, hz}});
  return spec;
}
// the board by each drill's marker: what it is, and how you start it
function drillBoard(x, z, ry, title, sub){
  const f = frame(x, z, ry);
  for (const s of [-1, 1]) rb(f, s*.42, 0, 0, .05, 1.0, .05, .02, PC.darkSteel, {rx:s*0});
  const t = textTex(512, 256, g => {
    g.fillStyle = "#14202c"; g.fillRect(0, 0, 512, 256); g.fillStyle = "#c8f060"; g.fillRect(0, 0, 512, 10);
    // every line measured and set no wider than the board (456 px between the margins): a long title shrinks to fit,
    // a long line under it breaks onto two before it would have to shrink much
    const MAX = 456, font = (wt, px, fam) => `${wt} ${px}px ${fam}`;
    const fit = (text, wt, px, fam) => { g.font = font(wt, px, fam); const tw = g.measureText(text).width; if (tw > MAX){ px = Math.floor(px*MAX/tw); g.font = font(wt, px, fam); } return px; };
    const BC = `"Barlow Condensed", "Arial Narrow", sans-serif`, BA = `"Barlow", sans-serif`;
    g.fillStyle = "#c8f060"; fit("DRILL STATION", 800, 30, BC); g.fillText("DRILL STATION", 28, 58);
    g.fillStyle = "#fff"; fit(title.toUpperCase(), 800, 60, BC); g.fillText(title.toUpperCase(), 28, 124);
    g.fillStyle = "#b9c7d6"; g.font = font(600, 28, BA);
    if (g.measureText(sub).width <= MAX) g.fillText(sub, 28, 180);
    else {
      const w = sub.split(" ");
      let k = w.length - 1; while (k > 1 && g.measureText(w.slice(0, k).join(" ")).width > MAX) k--;
      const l1 = w.slice(0, k).join(" "), l2 = w.slice(k).join(" ");
      const px = Math.min(fit(l1, 600, 25, BA), fit(l2, 600, 25, BA));
      g.font = font(600, px, BA); g.fillText(l1, 28, 164); g.fillText(l2, 28, 192);
    }
    g.fillStyle = "#c8f060"; fit("Stand on the marker · press E", 700, 26, BA); g.fillText("Stand on the marker · press E", 28, 236);
  });
  const [wx, wz] = worldPt(f, 0, .03);
  rb(f, 0, .55, -.01, 1.0, .5, .04, .02, 0x1b2026);
  label(t, wx, .8, wz, .96, .48, ry, {rough:.5});
  fsolid(f, 0, 0, 1, .2, 0, 1.1);
}
/* the drill stations (trainspec.js DRILLS): a marker on the grass where you start, a board beside it, a ball bag by
   the coach's feeding spot. The drills are played on the match simulation (training.js), so everything they need (the
   keeper, the team-mates, the ball) comes with the drill; here is only what stays out on the pitch */
export const STATION_AT = {};
function drillStations(){
  for (const k of Object.keys(DRILLS)){
    const D = DRILLS[k], p = toWorld(D.spot.x, D.spot.z), b = toWorld(D.board.x, D.board.z);
    drillBoard(b.x, b.z, Math.atan2(p.x - b.x, p.z - b.z), D.label, D.sub);              // (facing its marker)
    marker(p.x, p.z, PC.lime);
    STATION_AT[k] = {x:p.x, z:p.z};
    if (D.feed && D.feed.from){ const q = toWorld(D.feed.from.x, D.feed.from.z); ballBag(q.x + .9, q.z + .4, .4); }
    spot({x:p.x, z:p.z, y:.6, r:1.6, near:true, label:D.label, hint:D.hint, run:() => ctx.drill(k)});
  }
  // the odd cone and ball left lying about after the morning, off the drills' ground
  for (const [x, z] of [[-33, -6], [-33, -8], [-31, -6], [-31, -8], [33, -50]]) cone(x, z, PC.orange, .8);
  ball(-2.4, .11, -45.4); ball(30.8, .11, -6.7);
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
    const z0 = -56.4 - r*.8, y = .1 + r*.45;
    box(-26, 0, z0 - .8, 26, y + .45, z0, 0x9a978f, {ao:false, tex:"concrete", jit:.02});
    for (let x = -25.6; x < 25.6; x += .55){
      if (Math.abs(x + .21) < 3.8) continue;                      // the tunnel mouth
      const c = (Math.floor((x + 26)/.55) + r) % 9 === 0 ? 0xf2f2ee : 0x1f5fb0;
      seat(x, y + .45, z0 - .42, c);
    }
  }
  // the ends: a concrete wall that follows the rake, with a glass wind screen above it
  for (const [a, b_] of [[-26.3, -26], [26, 26.3]]){
    extrude("z", [[-56, 0], [-56, 1.15], [-61.2, 3.5], [-61.2, 0]], a, b_, 0x8f8c85, {tex:"concrete", jit:0});
    extrude("z", [[-56, 1.15], [-56, 2.2], [-61.2, 6.4], [-61.2, 3.5]], a + .13, b_ - .13, 0x9fb7c6, {key:"glass", jit:0});
    solid(a, b_, -62.2, -56, 0, 7);
  }
  // the front wall along the pitch, with advertising boards: four designs printed on one sheet, one mesh for them all
  const club = clubName.split(" ")[0].toUpperCase();
  const ADS = [["#1f5fb0", "#ffffff", "#c8f060", "RISE  ·  TRAIN  ·  REPEAT"], ["#f2f2ee", "#1f6f43", "#1f6f43", "MINI MARKET  ·  OPEN 24/7"],
    ["#c8f060", "#14202c", "#14202c", "CITY BUS  ·  LINE 14"], ["#14202c", "#ffffff", "#c8f060", `${club} ACADEMY`]];
  const adT = textTex(1024, 928, g => ADS.forEach(([bg, fg, ac, s], i) => {
    const y = i*232; g.fillStyle = bg; g.fillRect(0, y, 1024, 232);
    g.fillStyle = ac; g.fillRect(0, y + 196, 1024, 14); g.fillRect(40, y + 52, 14, 110);
    let fs = 104; g.font = `800 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`; const tw = g.measureText(s).width;
    if (tw > 880){ fs = Math.floor(fs*880/tw); g.font = `800 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`; }
    g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(s, 532, y + 110);
  }));
  const ads = [];
  for (const [a, b_] of [[-26, -3.6], [3.6, 26]]){
    box(a, 0, -56.35, b_, 1.0, -56, 0x8f8c85, {tex:"concrete", ao:false, jit:0});
    for (let x = a + .2; x < b_ - 3; x += 3.3){
      const k = Math.floor((x + 26)/3.3) % 4;
      box(x - .03, .17, -56, x + 3.13, .93, -55.97, 0x23292f, {key:"metal", ao:false, jit:0});
      ads.push({x:x + 1.55, y:.55, z:-55.965, w:3.1, h:.7, uv:[0, k/4, 1, (k + 1)/4]});
    }
  }
  labels(adT, ads, {glow:.35, rough:.5});
  box(-26, 0, -62.2, 26, 6.4, -61.2, 0x5d636a, {tex:"concrete", ao:false});
  for (const x of [-25, -12.5, 0, 12.5, 25]) cyl(x, 0, -61, .12, 6.8, 0x8a9198, {seg:10, key:"metal"});
  rbox(0, 6.75, -59.15, 53, .25, 6.6, .08, 0x2f363d, {key:"metal"});
  box(-26.5, 6.3, -56, 26.5, 6.8, -55.8, 0x14202c, {ao:false});
  // the name along the fascia, shrunk to fit however long the club's name is
  const t = textTex(2048, 86, g => {
    const s = clubName.toUpperCase() + "  ·  TRAINING CENTRE"; let fs = 58;
    g.fillStyle = "#14202c"; g.fillRect(0, 0, 2048, 86); g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `800 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`; const tw = g.measureText(s).width;
    if (tw > 1940){ fs = Math.floor(fs*1940/tw); g.font = `800 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`; }
    g.fillText(s, 1024, 46);
  });
  label(t, 0, 6.55, -55.75, 24, 1.0, 0, {glow:.4});
  solid(-26, 26, -62.4, -56, 0, 7);
  // the tunnel comes out of the middle of the stand: two cheeks and a lintel round a lit recess, double doors at the back
  const TN = 0x6e747a, TC = {tex:"concrete", ao:false, jit:0};
  box(-3.6, 0, -58.9, -2.4, 3.9, -54.8, TN, TC); box(2.4, 0, -58.9, 3.6, 3.9, -54.8, TN, TC);
  // (each cheek solid in two pieces, so the front one is small enough for the squad's lap to see it and run round it)
  for (const [a, b_] of [[-3.6, -2.4], [2.4, 3.6]]){ solid(a, b_, -58.9, -56, 0, 3.9); solid(a, b_, -56, -54.8, 0, 3.9); }
  box(-2.4, 2.8, -58.9, 2.4, 3.9, -54.8, TN, TC);
  box(-2.4, 0, -58.9, 2.4, 2.8, -56, 0x5c6268, Object.assign({solid:true}, TC));
  box(-2.4, 0, -56, 2.4, .02, -54.8, 0xffffff, {tex:"rubberFloor", ao:false, jit:0});
  box(-1.5, .02, -56, 1.5, 2.4, -55.96, 0x1b1f23, {ao:false, jit:0});
  for (const s_ of [-1, 1]){
    box(s_ > 0 ? .03 : -1.45, .04, -55.96, s_ > 0 ? 1.45 : -.03, 2.36, -55.94, 0x4b5258, {key:"metal", ao:false, jit:0});
    box(s_ > 0 ? .25 : -1.25, 1.0, -55.94, s_ > 0 ? 1.25 : -.25, 1.06, -55.9, 0xc9cdd1, {key:"metal", ao:false, jit:0});
    box(s_ > 0 ? .2 : -1.3, 1.5, -55.94, s_ > 0 ? 1.3 : -.2, 2.2, -55.935, 0x9fb7c6, {key:"glass", ao:false, jit:0});
  }
  rbox(0, 2.74, -55.4, 3.6, .05, .14, .02, 0xfff1c8, {key:"lamp"});
  lightSrc({x:0, y:2.3, z:-55.2, color:0xfff1c8, intensity:7, distance:6, indoor:true});            // the strip really lights the recess
  rbox(0, 3.9, -56.75, 7.6, .25, 4.5, .08, 0x1c2126);
  rbox(0, 2.9, -54.76, 4.0, .05, .06, .02, 0xfff1c8, {key:"lamp"});
  sign("PLAYERS' TUNNEL", 0, 3.4, -54.73, 0, 3.4);
  for (const dx of [-2.6, 2.6]) rbox(dx, 0, -54.73, .16, 2.9, .06, .03, 0xc8f060, {key:"neon", solid:true});
  solid(-1.5, 1.5, -56, -55.9, 0, 2.4);                   // the doors and their push bars
  lightSrc({x:0, y:2.6, z:-54, color:0xfff1c8, intensity:6, distance:8, indoor:true});
}

/* the floodlights at night (DESIGN 3.9.3): no point lights over the pitch, the sky's flood key light in the sun's place
   instead, the way the stadium does it. It stands for the four masts' banks at once, from the stand's side and high up,
   so a spot one bank cannot see is still lit by the others (shadow), and the stand's roof, which the lamps look over,
   throws no shadow across the grass (top). A poor club runs half its lamps, and those not so bright. The light goes
   off again as the next place is built (onBegin), before that place can turn its own on */
let KEYED = false;
onBegin(() => { if (KEYED){ KEYED = false; if (RT.SKY && RT.SKY.setNightKey) RT.SKY.setNightKey(false); } });
function floodKey(tier){
  if (!RT.SKY || !RT.SKY.setNightKey) return;
  RT.SKY.setNightKey(true, {dir:[.16, 1, -.42], intensity:[.85, 1.0, 1.2, 1.35, 1.5, 1.65][Math.max(1, Math.min(6, tier)) - 1], color:0xf2f5ff, shadow:.5, top:6.6});
  KEYED = true;
}

/* ---------- the clubhouse: dressing room, staff office and the stats computer ---------- */
function clubhouse(clubName){
  const b = {x0:18, x1:30, z0:3, z1:17}, H = 6.4, g0 = 3.2;
  // on a match day everyone stays for the evening; otherwise they're gone before the centre shuts at five
  const md = typeof todaysFixture === "function" && !!todaysFixture(), until = m => md ? 21*60 + 30 : m;
  const outer = 0xe4ddd0, inner = 0xe9e4d8, PL = {tex:"paint"}, PT = PL;
  // the outside: two floors, the upstairs offices are not yours to go in
  box(b.x0, g0, b.z0, b.x1, H, b.z1, outer, {solid:true, tex:"paint", ao:false});
  // a string course at the first floor, round all four sides: it covers the joint between the ground-floor walls and
  // the block above (its top and bottom faces are buried in the block and the ceiling slab)
  box(b.x0 - .03, g0 - .08, b.z0 - .03, b.x1 + .03, g0 + .06, b.z1 + .03, 0xcdc4b4, {tex:"paint", ao:false, jit:0});
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
  deliveryCounter();
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
  // two showers against the wall to the office: a tiled tray, a pipe up the wall and a head on an arm
  box(23.4, .02, 9.55, 26.8, .045, 10.38, 0xffffff, {tex:"tiles", ao:false, jit:0});
  for (const x of [24.3, 25.9]){
    cyl(x, .9, 10.34, .016, 1.25, 0xb9bec2, {seg:8, key:"metal"});
    box(x - .02, 2.12, 10.12, x + .02, 2.16, 10.36, 0xb9bec2, {key:"metal", ao:false});
    cyl(x, 2.06, 10.1, .07, .05, 0xd5d9dc, {seg:12, key:"metal"});
    box(x - .05, 1.15, 10.3, x + .05, 1.3, 10.38, 0xd5d9dc, {key:"metal", ao:false});
  }
  spot({aim:[[23.5, 0, 9.5], [26.7, 2.2, 10.4]], label:"Showers", get hint(){ return `Shower · 10 min · ${typeof odorLabel === "function" ? odorLabel() : "clean"} now`; }, hold:.3, run:() => ctx.shower()});
  // the staff who look after you here: the physio by the ice bath and the kit man sorting the bibs, in the day
  const kit = typeof kitOf === "function" && typeof myClub === "function" && myClub() ? kitOf(myClub().nm) : ["#2c66b8", "#ffffff"];
  staffer(29.25, 10.0, -Math.PI*.78, {role:"physio", seed:12, kit, when:m => m >= 8*60 + 30 && m < until(16*60 + 45), minute:ctx.minute});
  // the kit man at his laundry trolley in the corner by the window, sorting the bibs into it (a counter-high top, so
  // he stands at it with his head up rather than bowing over a bench)
  kitHamper(23.3, 4.95, 0);
  // (the hamper's near rail is at z 4.69: he stands a hand's width off it, his hands on the rail)
  staffer(23.3, 4.48, 0, {role:"kitman", seed:15, kit, pose:{mode:"counter", counter:.84, reach:.25}, when:m => m >= 7*60 + 30 && m < until(16*60 + 30), minute:ctx.minute});
  noticeBoard(22.645, 1.55, 5.2, Math.PI/2, [["TODAY", "Shirts on pegs", "boots outside!"], ["RECOVERY", "Ice bath 20 min", "after every session"], ["KIT", "Bibs in the wash", "basket please"], ["SQUAD", "Team photo", "Friday 9:30"]]);
  lightSrc({x:26.2, y:2.7, z:6.8, color:0xf2f6ff, intensity:8, distance:10, indoor:true});
  for (const z of [5, 8.5]) rbox(26.2, g0 - .3, z, 3, .05, .4, .02, 0xf6f8ff, {key:"lamp"});
  // the staff office
  // the desk faces the door; his screen and keyboard face him, on the far side of it (z 15.25–15.95)
  const od = desk(26.6, 15.6, 0, 1.8, 0x6b4a2c);
  const osc = textTex(256, 160, g => { g.fillStyle = "#101820"; g.fillRect(0, 0, 256, 160); g.fillStyle = "#4ea8ff"; for (let i = 0; i < 6; i++) g.fillRect(16, 20 + i*22, 60 + (i*53) % 160, 10); });
  monitor(od, -.1, .77, -.12, osc, .5);
  rb(od, -.1, .77, .2, .42, .018, .14, .006, 0x1d1f22);                       // the keyboard
  chair(26.6, 16.22, Math.PI);
  chair(26.0, 14.6, 0); chair(27.2, 14.6, 0);
  tacticsBoard(23.6, 15.2, Math.PI/2, "THIS WEEK");
  const sh = shelfUnit(29.45, 13.8, -Math.PI/2, 2.4, 1.8, 0x4b5258);
  for (let i = 0; i < 4; i++) cy(sh, -.9 + i*.6, .98, 0, .1, .07, .32, 0xd9b45a, {seg:10, key:"metal"});
  for (let i = 0; i < 3; i++) rb(sh, -.8 + i*.8, 1.6, 0, .3, .2, .25, .02, [0xc8463a, 0x2c66b8, 0x3f8a48][i]);
  // the manager keeps office hours: in before the squad, gone before the centre shuts at five (never while you're looking)
  // sat at his desk (the seat top at .5, the desk's near edge .27 ahead of the seat's middle), at his keyboard
  const boss = staffer(26.6, 16.22, Math.PI, {role:"manager", seed:4, hair:0x9a9a9a, pose:{mode:"typing", seat:.5, desk:.77, reach:.4}, when:m => m >= 7*60 + 45 && m < until(16*60 + 50), minute:ctx.minute});
  spot({aim:[[26, .8, 15.9], [27.2, 2, 16.7]], x:26.6, z:15.2, when:() => boss.g.visible, label:"The manager", get hint(){ return `${typeof roleOutlook === "function" ? roleOutlook() : ""} · open the hub (Q) to talk to him`; }, hold:.2,
    run:() => ctx.note(`The manager looks up from his screen. “${(G() && G().trust >= 25) ? "Keep doing what you are doing." : (G() && G().trust >= 8) ? "Train hard, be on time, and you'll get your minutes." : "I need to see more from you in training."}”`)});
  lightSrc({x:26.2, y:2.7, z:13.6, color:0xfff0d8, intensity:7, distance:9, indoor:true});
  lightSrc({x:20.3, y:2.7, z:10, color:0xfff0d8, intensity:7, distance:10, indoor:true});
  for (const z of [6, 10, 14]) rbox(20.4, g0 - .3, z, .5, .05, 1.6, .02, 0xfff6e0, {key:"lamp"});
}

/* the staff delivery counter (DESIGN 3.8.7): in the clubhouse lobby under the south window, between the planter and
   the west door, where the couriers leave Foodies bags for the players. A counter-high top (0.79 m) on metal legs
   with a shelf under it, the sign over it, three places for bags facing the way in. The door's approach (z 9.3 to 10.9)
   stays clear, and nothing of the session ever comes in here */
function deliveryCounter(){
  const x = 18.55, z = 6.0, L = 1.5, D = .52;
  rbox(x, .75, z, D, .04, L, .015, 0xb5895a);                                                  // the top
  rbox(x, .25, z, D - .06, .03, L - .08, .01, 0x8f979e, {key:"metal"});                       // the shelf under it
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) rbox(x + dx*(D/2 - .04), 0, z + dz*(L/2 - .04), .04, .75, .04, .01, 0x3b4249, {key:"metal"});
  rbox(x - D/2 + .03, .3, z, .02, .42, L - .1, .01, 0x2b3036);                                 // a modesty panel at the back
  solid(18.29, 18.81, 5.25, 6.75, 0, .8);
  sign("STAFF · DELIVERIES", 18.3, 2.66, z, Math.PI/2, 1.5);
  deliveryPoint("ground", POINT_NAME.ground, [[x, .79, 5.55, Math.PI/2], [x, .79, 6.0, Math.PI/2], [x, .79, 6.45, Math.PI/2]]);
}

/* ---------- what the club can afford, on show (GROUND.tier, clubFacTier 1–6) ----------
   A poor club's pitch is worn bare in the goalmouths and down the middle; a rich one's is mown in stripes (both drawn
   by pitchmesh.js, see pitch()). The clubhouse goes from damp-stained render,
   a boarded-up window, a tag on the wall and weeds at its foot (1–2) to a glass porch, the club's banner down the front,
   flowers by the door and its name lit (5–6). */
// stains running down from the top of a wall and creeping up from its foot, a little uneven: for the poorer clubs
let GRIME = null, TAG = null;
function grimeTex(){
  if (GRIME) return GRIME;
  reseed(515);
  GRIME = textTex(512, 256, g => {
    for (let i = 0; i < 40; i++){ const x = rnd()*512, w = 4 + rnd()*14, h = 40 + rnd()*150, gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, `rgba(48,44,36,${.22 + rnd()*.2})`); gr.addColorStop(1, "rgba(48,44,36,0)"); g.fillStyle = gr; g.fillRect(x, 0, w, h); }
    const gr = g.createLinearGradient(0, 256, 0, 170); gr.addColorStop(0, "rgba(70,62,44,.45)"); gr.addColorStop(1, "rgba(70,62,44,0)"); g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, 256); for (let x = 0; x <= 512; x += 16) g.lineTo(x, 190 + Math.sin(x*.05)*12 + rnd()*14); g.lineTo(512, 256); g.fill();
    for (let i = 0; i < 26; i++){ const x = rnd()*512, y = rnd()*230, r = 6 + rnd()*20, rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, "rgba(60,56,46,.25)"); rg.addColorStop(1, "rgba(60,56,46,0)"); g.fillStyle = rg; g.fillRect(x - r, y - r, r*2, r*2); }
  });
  GRIME.userData.per = 1;
  return GRIME;
}
function tagTex(){
  if (TAG) return TAG;
  TAG = textTex(512, 192, g => {
    g.lineJoin = "round"; g.font = "italic 900 96px 'Barlow Condensed', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 16; g.strokeStyle = "#1d1f22"; g.strokeText("ULTRAS '98", 256, 96);
    const gr = g.createLinearGradient(0, 40, 0, 150); gr.addColorStop(0, "#ff5aa0"); gr.addColorStop(1, "#7c3aed"); g.fillStyle = gr; g.fillText("ULTRAS '98", 256, 96);
    g.strokeStyle = "#c8f060"; g.lineWidth = 5; g.beginPath(); g.moveTo(60, 160); g.quadraticCurveTo(256, 190, 460, 150); g.stroke();
  });
  TAG.userData.per = 1;
  return TAG;
}
function clubhouseLook(t, clubName){
  const b = {x0:18, x1:30, z0:3, z1:17}, H = 6.4;
  if (t <= 2){
    // damp and dirt down every face
    const G1 = grimeTex(), o = {transparent:true, rough:.95};
    label(G1, b.x0 - .012, H/2, (b.z0 + b.z1)/2, b.z1 - b.z0, H, -Math.PI/2, o);
    label(G1, b.x1 + .012, H/2, (b.z0 + b.z1)/2, b.z1 - b.z0, H, Math.PI/2, o);
    label(G1, (b.x0 + b.x1)/2, H/2, b.z0 - .012, b.x1 - b.x0, H, Math.PI, o);
    label(G1, (b.x0 + b.x1)/2, H/2, b.z1 + .012, b.x1 - b.x0, H, 0, o);
    // the front window by the door boarded up with planks
    for (let i = 0; i < 5; i++){ const z0 = 12.5 + i*.56; rbox(b.x0 - .06, .86, z0 + .26, .04, 1.62, .5, .01, [0x8a6a4a, 0x7a5c3e, 0x94744f][i % 3], {jit:.06}); }
    rbox(b.x0 - .09, 1.3, 13.9, .03, .1, 2.9, .01, 0x6a4f35); rbox(b.x0 - .09, 2.0, 13.9, .03, .1, 2.9, .01, 0x6a4f35);
    // a tag sprayed on the side facing the car park, weeds along the foot of the walls, an old skip
    if (t === 1 || (G() && G().life && G().life.day % 2 === 0)) label(tagTex(), 21.4, 1.5, b.z1 + .02, 2.8, 1.05, 0, {transparent:true, rough:.8});
    reseed(77 + t);
    for (let i = 0; i < 26; i++){ const side = i % 3, x = side === 0 ? b.x0 - .12 : b.x0 + .5 + rnd()*(b.x1 - b.x0 - 1), z = side === 0 ? b.z0 + .5 + rnd()*(b.z1 - b.z0 - 1) : side === 1 ? b.z0 - .1 : b.z1 + .1;
      cyl(x, 0, z, .03 + rnd()*.05, .15 + rnd()*.25, [0x5d7a34, 0x6f8a3a, 0x4f6a2e][i % 3], {seg:5, jit:.1}); }
    rbox(29.6, 0, 1.4, 1.6, .9, 1.1, .04, 0x8a3a24, {key:"metal", solid:true}); rbox(29.6, .9, 1.4, 1.7, .06, 1.2, .02, 0x5a2a1a, {key:"metal"});
    for (const [x, z] of [[28.9, 1.2], [29.3, 1.7], [30.1, 1.2]]) rbox(x, .9, z, .3, .12 + (x*7 % 3)*.06, .25, .03, 0x6b5a44);
  } else if (t >= 5){
    // a glass porch over the door, the club's banner down the front, flowers each side of the door, the name lit
    const kit = typeof kitOf === "function" ? kitOf(clubName) : ["#2c66b8", "#ffffff"];
    const ban = textTex(256, 768, g => { g.fillStyle = kit[0]; g.fillRect(0, 0, 256, 768); g.fillStyle = kit[1]; g.fillRect(0, 0, 256, 18); g.fillRect(0, 750, 256, 18);
      g.beginPath(); g.arc(128, 170, 78, 0, 7); g.fill(); g.fillStyle = kit[0]; g.font = "900 64px 'Barlow Condensed', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(clubName.split(" ").map(w => w[0]).join("").slice(0, 3).toUpperCase(), 128, 174);
      g.fillStyle = kit[1]; g.font = "800 46px 'Barlow Condensed', sans-serif"; const words = clubName.toUpperCase().split(" "); words.slice(0, 4).forEach((w, i) => { let fs = 46; g.font = `800 ${fs}px 'Barlow Condensed', sans-serif`; while (g.measureText(w).width > 230 && fs > 20){ fs -= 2; g.font = `800 ${fs}px 'Barlow Condensed', sans-serif`; } g.fillText(w, 128, 330 + i*80); }); });
    label(ban, b.x0 - .03, 4.2, 4.4, 1.1, 3.3, -Math.PI/2, {rough:.6});
    box(b.x0 - 2.1, 2.66, 8.6, b.x0 - .1, 2.72, 11.6, 0xa9c2d2, {key:"glass", ao:false, jit:0});
    for (const z of [8.6, 11.6]) rbox(b.x0 - 2.05, 0, z, .07, 2.7, .07, .02, 0x2a2e33, {key:"metal", solid:true});
    for (const z of [7.9, 12.3]){ rbox(b.x0 - .55, 0, z, .7, .55, .7, .05, 0x2a2e33, {key:"metal", solid:true});
      for (let i = 0; i < 9; i++){ const a = i*.7, r = .12 + (i % 3)*.08; sph(frame(b.x0 - .55 + Math.cos(a)*r, z + Math.sin(a)*r), 0, .62, 0, .09, [0xd8432f, 0xf2c230, 0xe8e4da, 0x7c3aed][i % 4]); } }
    box(b.x0 - .08, 5.6, 5.0, b.x0 - .04, 5.66, 15.0, 0xfff1d0, {key:"lamp", ao:false, jit:0});
  }
}
// the gym's walls show it too: scuffed and stained at the bottom of the ladder
function gymLook(t){
  if (t > 2) return;
  const G1 = grimeTex(), o = {transparent:true, rough:.95};
  for (const [x, z, w, ry] of [[-6, 4.27, 12, 0], [6, 4.27, 12, 0], [-12.73, 10, 11.4, Math.PI/2], [12.73, 10, 11.4, -Math.PI/2]]){ const m = label(G1, x, 2.0, z, w, 4.0, ry, o); m.material.opacity = t === 1 ? .6 : .4; }
}
/* the road past the ground on the far side of the fence, the vehicle gate out of the car park (its barrier up), and
   the pavement where the bus stops: the way everybody goes home */
function roadOut(){
  box(-95, 0, 31, 95, .012, 37, 0xffffff, {tex:"asphalt", ao:false, jit:0});
  box(-95, 0, 29.75, 95, .1, 31, 0xffffff, {tex:"slabs", ao:false, jit:0});
  box(-95, 0, 30.85, 95, .104, 31.0, 0xc4c1b9, {tex:"concrete", ao:false, jit:0});
  for (let x = -94; x < 94; x += 4) box(x, .013, 33.93, x + 2, .017, 34.07, 0xe9e7df, {ao:false, jit:0});
  box(-15.6, .013, 31.1, -9.4, .017, 33.9, 0xf2c230, {ao:false, jit:0});               // the bus bay marked yellow
  box(-15.5, .0135, 31.2, -9.5, .0175, 33.8, 0x3a3f46, {ao:false, jit:0});
  // the vehicle gate: two posts, the barrier arm raised, a sign
  for (const x of [21.3, 26.7]) rbox(x, 0, 29.6, .32, 1.2, .32, .05, 0x3b4249, {key:"metal", solid:true});
  const arm = frame(21.3, 29.6, 0); rb(arm, 0, 1.15, 0, .26, .3, .26, .04, 0xd8432f, {key:"paint"});
  beam(21.3, 1.3, 29.6, 22.6, 5.6, 29.6, .08, .08, 0xf2f0ea, {key:"paint"});
  for (const k of [.3, .55, .8]){ const x = 21.3 + (22.6 - 21.3)*k, y = 1.3 + (5.6 - 1.3)*k; beam(x - .05, y - .15, 29.6, x + .05, y + .15, 29.6, .085, .085, 0xd8432f, {key:"paint"}); }
}

export function buildGround(c){
  ctx = c;
  // what the club can afford sets the kit, the pitch and the buildings (clubFacTier: a rusting shed to an elite academy)
  const tier = GROUND.tier = typeof clubFacTier === "function" ? clubFacTier() : 3;
  reseed(77);
  // the training centre's fences (DESIGN 3.6.1): the pitch grew north, the yard, gym, clubhouse and car park did not
  W.bounds = {x0:-42, x1:42, z0:-64, z1:29.3};
  // the grass all round, cut away where the pitch's own grass lies (pitchmesh.js), so the two never fight
  const gx = PITCH.L/2 + 5, gz0 = STAND_Z + .4, gz1 = -.4;
  for (const [x0, z0, x1, z1] of [[-90, -90, 90, gz0], [-90, gz1, 90, 90], [-90, gz0, -gx, gz1], [gx, gz0, 90, gz1]]) box(x0, -.2, z0, x1, 0, z1, 0xffffff, {tex:"grass", ao:false, jit:0});
  // paths: the yard, a walk to the clubhouse, the car park, and a strip by the pitch
  box(-17, 0, 16, 17, .02, 29.4, 0xffffff, {tex:"path", ao:false, jit:0});
  box(13, 0, 3, 18, .021, 29.4, 0xffffff, {tex:"path", ao:false, jit:0});
  box(-22, 0, -.4, 22, .019, 4, 0xffffff, {tex:"concrete", ao:false, jit:0});
  box(18.5, 0, 18.5, 31.4, .02, 29.4, 0xffffff, {tex:"asphalt", ao:false, jit:0});
  parkingBays(19.2, 19, 4, 2.7, 5, 1);
  pitch(tier);
  dugout(-8, -2.1, 0, 5, 0x1f5fb0); dugout(8, -2.1, 0, 5, 0x6d737a);
  // the floodlight masts at the four corners, just outside the fences, aimed at the middle
  for (const [x, z] of [[-43.6, STAND_Z + 1.2], [43.6, STAND_Z + 1.2], [-43.6, -1.2], [43.6, -1.2]]) floodlight(x, z, 0, PITCH.cz, 16);
  floodKey(tier);
  gym(); gymLook(tier);
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
  clubhouse(clubName); clubhouseLook(tier, clubName);
  // fences, the gate by the bus stop and the vehicle gate out of the car park, hedges along them; the road beyond
  wireFence(-42.3, 29.6, -18, 29.6); wireFence(-10, 29.6, 21.1, 29.6); wireFence(26.9, 29.6, 42.3, 29.6);
  roadOut();
  wireFence(-42.3, -64.3, -42.3, 29.6); wireFence(42.3, -64.3, 42.3, 29.6); wireFence(-42.3, -64.3, 42.3, -64.3);
  for (const s of [-1, 1]){ rbox(s > 0 ? -10 : -18, 0, 29.6, .5, 2.8, .5, .08, 0x3b4249, {solid:true}); }
  sign(`${clubName.toUpperCase()} · TRAINING CENTRE`, -14, 3.1, 29.75, Math.PI, 7.6);
  rbox(-14, 2.6, 29.6, 8.6, .14, .3, .05, 0x2a3036);
  hedge(-29.5, 27.8, -20, 27.8); hedge(-6, 27.8, 11, 27.8);
  for (const [x, z] of [[-26, 22], [-27.5, 12], [-27, 2], [27, 1.5], [-47, -16], [47, -20], [-47, 10], [47, 12], [-20, 44], [4, 46], [24, 44], [-46, -48], [46, -46], [-30, -70], [10, -71]]) tree(x, z, .9 + ((x*z) % 3 + 3) % 3*.12);
  for (const [x, z] of [[-29, 18], [-29.4, 7.5], [14.6, 26.8], [-16.5, 26.6]]) bush(x, z, 1);
  for (const [x, z, d] of [[-16, 6, -1], [16, 6, -1], [-18.2, 26.4, 1], [9, 26, 1], [17.4, 18, 1], [-24.5, 10, 1]]) streetLamp(x, z, d);
  // the car park: the squad's cars (leave.js: they go home through the vehicle gate after training), and yours, if
  // you have one, in the end bay
  sign("PLAYERS & STAFF PARKING", 24.6, 2.2, 18.2, 0, 3.2, {bar:"#4ea8ff"});
  for (const x of [23.1, 26.1]) rbox(x, 0, 18.15, .08, 2.0, .08, .02, 0x3b4249, {key:"metal", solid:true});
  const ct = typeof carTier === "function" && G() ? carTier() : 0;
  if (ct){ const bx = EXIT.bays[3], sz = bakeCar(["hatch", "hatch", "sport", "muscle"][ct], [0, 0x5a6a7a, 0x22303d, 0xc8202a][ct], bx, EXIT.bayZ, -Math.PI/2); solid(bx - sz[2]/2, bx + sz[2]/2, EXIT.bayZ - sz[0]/2, EXIT.bayZ + sz[0]/2, 0, 1.4); }
  // low warehouses and houses beyond the road, so the world goes on past the gate
  for (const [x, z, w, d, h, c] of [[-44, 44, 16, 10, 6, 0x8b8f94], [-22, 48, 14, 9, 8, 0xa3593f], [6, 49, 18, 9, 7, 0x9a8e7e], [30, 46, 14, 10, 9, 0x7b8691],
    [-52, -6, 10, 18, 7, 0x8b5a4a], [52, -4, 10, 20, 6, 0x9a8e7e], [-30, -76, 30, 10, 10, 0x7b8691], [24, -76, 24, 10, 12, 0x8b8f94]])
    rbox(x, 0, z, w, h, d, .2, c);
  busStop(-14, 24.6, {y:.02});
  spot({x:-14, y:1.2, z:24.8, r:2.6, aim:[[-16, 0, 23.9], [-12, 2.7, 26.1]], near:true, label:"Bus stop · Training Centre", hint:"Line 14 · home, Dumbrava", hold:.4, run:() => ctx.busMenu()});
  // the places the compass knows here
  W.places.push({name:"Training pitch", kind:"train", x:PITCH.cx, z:PITCH.z1 - 6}, {name:"Gym", kind:"gym", x:0, z:16.9}, {name:"Clubhouse", kind:"club", x:17.6, z:10.1},
    {name:"Bus stop", kind:"bus", x:-14, z:24.6});
  // the squad, out on the pitch during the session
  const kit = typeof kitOf === "function" && myClub && myClub() ? kitOf(myClub().nm) : ["#2c66b8", "#ffffff"];
  GROUND.session = teamSession({kit, when:() => typeof sessionOn === "function" && G() && sessionOn(),
    centre:{x:37.5, z:-8}, coach:{x:-6, z:-5.4, ry:Math.PI}, ballMesh:() => ballLook().mesh,
    // the passing pairs, in the middle of the pitch off every drill's ground (npc.js keeps their lanes clear of them)
    pairs:[[toWorld(0, -10), toWorld(5, -6), false], [toWorld(-12, -2), toWorld(-7, 1), "#d8ff3a"]],
    // the lap goes round the outside of the pitch, on the grass: behind both goals, its ends 3.8 m behind the goal
    // lines (the nets end 2 m back), so the runners stay well clear of the goal mouths; along the stand just outside
    // the far touchline (it swings in round the tunnel's cheeks), and back down the near side
    lap:[{x:PITCH.x0 - 3.8, z:PITCH.z1 - 1}, {x:PITCH.x1 + 3.8, z:PITCH.z1 - 1}, {x:PITCH.x1 + 3.8, z:PITCH.z0 - 1.2}, {x:PITCH.x0 - 3.8, z:PITCH.z0 - 1.2}]});
  // and at four, home: walking off to their cars or the bus (leave.js)
  GROUND.leave = departures({minute:ctx.minute, session:GROUND.session, mine:!!ct});
  /* the assistant coach: at his post on the near touchline, between the drills, while the centre is open. He plays the
     balls in for the drills and the lessons (football/training.js lends him: he walks to his spot, plays them with a
     real strike, and walks back when it is over) */
  const AC = trainAssist, ah = staffer(AC.x, AC.z, AC.ry, {role:"coach", seed:21, kit, noSolid:false,
    when:m => m >= (typeof CENTRE === "object" ? CENTRE.open : 6*60) + 45 && m < (typeof CENTRE === "object" ? CENTRE.close : 17*60) - 10, minute:ctx.minute});
  GROUND.assist = {h:ah, x:AC.x, z:AC.z, ry:AC.ry, lend:() => ah.lend(), giveBack:() => ah.giveBack()};
  // the coach: the team session, once a day (3.6.2): "Done for today" once it is
  spot({x:-6, y:1.2, z:-5.4, r:2.2, near:true, when:() => typeof sessionOn === "function" && sessionOn(), label:"Coach",
    get hint(){ return sessionHint(); }, run:() => ctx.session()});
  finishBatches();
  // the players' tunnel: where you come out on a match day, and how far into it the match begins (tunnel.js reads it:
  // within 1.6 m of its line and 1.55 m past this spot)
  GROUND.tunnel = {x:TUNNEL.x, z:TUNNEL.z, spawnZ:TUNNEL.z, trigger:TUNNEL.z - 1.55, half:1.6, mouth:{x:TUNNEL.x, z:STAND_Z}};
  return {bus:{x:-14, z:23.2, y:0, yaw:0}, tunnel:{x:TUNNEL.x, z:TUNNEL.z, y:0, yaw:Math.PI}};
}
