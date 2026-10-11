/* ============ LIFE: the end of the day at the training centre ============
   At four o'clock (daily.js SESSION.end) the session ends and the squad goes home, the way people do: off the pitch
   along the touchline, up the walk between the gym and the clubhouse, and then either round to their cars (reverse
   parked in the bays, nose to the gate), which pull out through the vehicle gate onto the road and away, or out of
   the front gate to the stop on the road, where the Line 14 bus pulls in for them and goes. The cars of anyone
   already gone are gone when you arrive; a car whose driver you never saw walk over leaves on time all the same.
   At five the centre closes (world.js sends you home); on a match day the squad's cars stay.
   departures(o) is set up by ground.js; o.session is the squad (npc.js teamSession), which hands its people over.
   WP-B (Stage 1, DESIGN 3.5.1, 3.5.3): the people walking off are scheduler actors like everyone else (npc.js actor()),
   their legs measuring how far they really go, and they keep to the same guard round you as the squad on the pitch
   (npc.js into(), follow(): never a step into you, a body you bump into that never closes round you). */
import {THREE, W, solid} from "./build.js";
import {VIEW} from "./human.js";
import {SG} from "./core/collide.js";
import {actor, into, follow, youTracker} from "./npc.js";
import {car, bus, carPaint, CAR_KINDS} from "./cars.js";

const G = () => (typeof S !== "undefined" ? S : null);
const wrapA = a => { while (a > Math.PI) a -= Math.PI*2; while (a < -Math.PI) a += Math.PI*2; return a; };
// the way out of the ground: the walk up between the gym and the clubhouse, the car park, the gates, the road
export const EXIT = {walkX:15.2, pitchZ:-4.6, yardZ:18.6, gate:{x:24, z:29.6}, front:{x:-11, z:29.6}, stop:{x:-12.6, z:30.6}, laneW:32.5, laneE:35.5,
  bays:[20.55, 23.25, 25.95, 28.65], bayZ:21.5};

/* a vehicle along a path: a centripetal Catmull-Rom curve through the points, at a speed that builds up and eases
   off (o.vmax(u) along it), the body turned along the curve and the wheels rolling; it waits for you if you are in
   front of it. Its solid goes with it. */
function driveOf(g, pts, o = {}){
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], 0, p[1])), false, "centripetal");
  const len = curve.getLength(), [L, , Wd] = g.userData.size, P = new THREE.Vector3(), T = new THREE.Vector3();
  const st = {s:0, v:0, done:false, len};
  const place = () => {
    const u = Math.min(1, st.s/len); curve.getPointAt(u, P); curve.getTangentAt(u, T);
    g.position.x = P.x; g.position.z = P.z; g.rotation.y = Math.atan2(-T.z, T.x);
    if (o.sol){
      const c = Math.abs(Math.cos(g.rotation.y)), sn = Math.abs(Math.sin(g.rotation.y)), hx = c*L/2 + sn*Wd/2, hz = sn*L/2 + c*Wd/2;
      o.sol.x0 = P.x - hx; o.sol.x1 = P.x + hx; o.sol.z0 = P.z - hz; o.sol.z1 = P.z + hz;
    }
  };
  place();
  return {st, curve, step(dt){
    if (st.done) return;
    const u = st.s/len, vmax = o.vmax ? o.vmax(u) : 8;
    // somebody (you) just in front of the bonnet: it stops and waits
    const nx = g.position.x + Math.cos(g.rotation.y)*(L/2 + 1.6), nz = g.position.z - Math.sin(g.rotation.y)*(L/2 + 1.6);
    const blocked = Math.hypot(VIEW.x - nx, VIEW.z - nz) < 1.9;
    const want = blocked ? 0 : vmax;
    st.v = st.v < want ? Math.min(want, st.v + (o.acc || 2.2)*dt) : Math.max(want, st.v - 5*dt);
    st.s = Math.min(len, st.s + st.v*dt);
    place();
    for (const w of g.userData.wheels) w.rotation.z -= st.v*dt/g.userData.wheelR;
    if (st.s >= len) st.done = true;
  }};
}
/* somebody walking a few straight legs (corners eased by turning as they go), at a walk; they stop for you and never
   step into you. me: where you are this step (npc.js youTracker()). The body is drawn by the scheduler from h.ast */
function walkerOf(h, pts, o = {}){
  const st = {i:0, v:0, done:false, wait:0};
  const g = h.g, sol = o.sol, walk = {mode:"move", speed:0}, stand = {mode:"idle"};
  h.ast = stand;
  return {st, h, step(dt, me){
    if (st.done){ h.ast = stand; return; }
    const [tx, tz] = pts[st.i], dx = tx - g.position.x, dz = tz - g.position.z, d = Math.hypot(dx, dz);
    if (d < .25){ if (++st.i >= pts.length){ st.done = true; h.ast = stand; return; } }
    const ahead = me.here && Math.hypot(me.x - (g.position.x + Math.sin(g.rotation.y)*.7), me.z - (g.position.z + Math.cos(g.rotation.y)*.7)) < .75;
    const want = ahead ? 0 : (o.speed || 1.35);
    st.v += (want - st.v)*(1 - Math.exp(-4*dt));
    if (d > 1e-3){
      const yaw = Math.atan2(dx, dz); g.rotation.y += wrapA(yaw - g.rotation.y)*(1 - Math.exp(-7*dt));
      const k = Math.min(d, st.v*dt), f = Math.max(0, Math.cos(wrapA(yaw - g.rotation.y)));
      const nx = g.position.x + dx/d*k*f, nz = g.position.z + dz/d*k*f;
      // (a step that would take them nearer you is not taken: they stand until you move)
      if (!into(me, nx, nz, g.position.x, g.position.z)){ g.position.x = nx; g.position.z = nz; } else st.v = 0;
    }
    walk.speed = st.v; h.ast = walk;
    if (sol) follow(sol, me, g.position.x, g.position.z, 0, true, 1.8);
  }};
}
// is the straight leg from a to b clear of everything solid standing on the ground (people's own bodies aside)?
function legClear(a, b, skip){
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])/.3));
  for (let i = 0; i <= n; i++){
    const x = a[0] + (b[0] - a[0])*i/n, z = a[1] + (b[1] - a[1])*i/n;
    let hit = false;                                                     // (only the boxes near: the solids hash, DESIGN 3.9.5)
    SG.each(x - .3, z - .3, x + .3, z + .3, q => !(q.off || skip.has(q) || q.y0 > 1.5 || q.y1 < .15) && x + .3 > q.x0 && x - .3 < q.x1 && z + .3 > q.z0 && z - .3 < q.z1 && (hit = true));
    if (hit) return false;
  }
  return true;
}
/* the way off the pitch from where somebody stands: to the near touchline, along it to the walk, up the walk; then
   to a car's door, or out of the front gate to the stop */
function routeFrom(x, z, to, skip){
  let sx = Math.max(-19, Math.min(19, x)), first = [sx, EXIT.pitchZ];
  // straight across to the touchline, unless something is in the way: then a little to one side
  if (z < EXIT.pitchZ - .3 && !legClear([x, z], first, skip)){
    for (const off of [1, -1, 2, -2, 3, -3]){ const p = [sx + off, EXIT.pitchZ]; if (legClear([x, z], p, skip)){ first = p; break; } }
  }
  const pts = z < EXIT.pitchZ - .3 ? [first] : [];
  pts.push([EXIT.walkX, EXIT.pitchZ], [EXIT.walkX, EXIT.yardZ]);
  if (to.car != null){ const bx = to.car - 1.38; pts.push([17.6, 25.6], [bx, 25.6], [bx, EXIT.bayZ + .9]); }
  else pts.push([-11, 21.6], [-11, 28.4], [EXIT.front.x - 1, 30.4], [EXIT.stop.x + to.queue*.75, EXIT.stop.z]);
  return pts;
}

export function departures(o){
  const s = G(), minute = o.minute, today = s && s.life ? s.life.day : 0;
  const matchDay = typeof todaysFixture === "function" && !!todaysFixture();
  const training = typeof trainingDay === "function" && trainingDay();
  const end = typeof SESSION === "object" ? SESSION.end : 16*60;
  // the squad's cars: as many as there are free bays; each leaves at its own minute (a driver you never saw goes anyway)
  const bays = EXIT.bays.slice(0, o.mine ? 3 : 4);
  const cars = [];
  bays.forEach((bx, i) => {
    const leaves = end + 14 + i*9 + ((today*7 + i*5) % 6);
    if (!matchDay && (!training || minute() >= leaves + 4)) return;          // nobody's car: no session today, or gone already
    const g = car(CAR_KINDS[(today + i) % CAR_KINDS.length], carPaint(i*3 + today), {});
    g.position.set(bx, .01, EXIT.bayZ); g.rotation.y = -Math.PI/2; W.scene.add(g);
    const [L, , Wd] = g.userData.size;
    // (it drives off later: a moving box, DESIGN 1.4.5)
    const sol = solid(bx - Wd/2, bx + Wd/2, EXIT.bayZ - L/2, EXIT.bayZ + L/2, 0, 1.4, {dyn:true});
    cars.push({g, sol, bx, leaves, state:"parked", driver:null, east:(i + today) % 2 === 0, t:0, d:null});
  });
  // the stop on the road outside the front gate, and the bus that calls for whoever is waiting there
  const B = {g:null, d:null, state:"none", t:0, queue:[]};
  const people = [], skip = new Set();
  /* the session ends with you there: its people are handed over, and walk off. The first few take the cars, the rest
     the bus (a car whose driver has gone already goes on its own: see below) */
  if (o.session) o.session.leave = list => {
    const freeCars = cars.filter(c => c.state === "parked" && !c.driver);
    list.forEach((h, k) => {
      const x = h.g.position.x, z = h.g.position.z, c = freeCars[k] || null;
      const to = c ? {car:c.bx} : {queue:B.queue.length + people.filter(p => p.bus).length};
      const sol = solid(x - .25, x + .25, z - .25, z + .25, 0, 1.8, {dyn:true}); skip.add(sol);
      const p = {h, w:walkerOf(h, routeFrom(x, z, to, skip), {sol, speed:1.25 + (k % 3)*.12}), car:c, bus:!c, start:minute() + k*1.1, sol, gone:false};
      if (c) c.driver = p;
      people.push(p);
      actor(h, "leaving", () => !p.gone);
    });
  };
  const track = youTracker();
  W.anims.push(dt => {
    if (!(dt > 0)) return;
    const m = minute(), me = track(dt);
    // the people walking off (standing where they were until their turn to go)
    for (const p of people){
      if (p.gone || m < p.start) continue;
      p.w.step(dt, me);
      if (!p.w.st.done) continue;
      if (p.car){ p.gone = true; p.h.g.visible = false; p.sol.off = true; p.car.state = "starting"; p.car.t = 0; }
      else if (!p.queued){ p.queued = true; B.queue.push(p); }
    }
    // the cars: a driver gets in, the lights come on, and it pulls out of its bay, through the gate and away
    for (const c of cars){
      if (c.state === "parked" && m >= c.leaves && !c.driver && !matchDay){ c.state = "starting"; c.t = 0; }
      if (c.state === "starting"){
        c.t += dt;
        if (c.t > 1.6){
          c.state = "driving"; c.g.userData.lamps(m >= 17*60 + 30 || m < 7*60);
          const west = !c.east, lane = west ? EXIT.laneW : EXIT.laneE, dir = west ? -1 : 1;
          c.d = driveOf(c.g, [[c.bx, EXIT.bayZ], [c.bx, EXIT.bayZ + 3.4], [EXIT.gate.x + (c.bx - EXIT.gate.x)*.25, 27.4], [EXIT.gate.x, EXIT.gate.z + .6], [EXIT.gate.x + dir*1.6, lane - dir*.2], [EXIT.gate.x + dir*7, lane], [dir*95, lane]],
            {sol:c.sol, vmax:u => u < .2 ? 2.6 : u < .26 ? 4 : 11});
        }
      }
      if (c.state === "driving"){
        c.d.step(dt);
        if (c.d.st.done){ c.state = "gone"; c.sol.off = true; W.scene.remove(c.g); c.g.userData.dispose(); }
      }
    }
    // the bus: when the last one walking to it is waiting at the stop (or half past four comes), it pulls in from the east
    const walkingToBus = people.some(p => p.bus && !p.gone && !p.queued);
    if (B.state === "none" && B.queue.length && (!walkingToBus || m >= end + 30)){
      B.g = bus(); W.scene.add(B.g); B.g.position.y = .01; B.g.userData.lamps(m >= 17*60 + 30);
      B.sol = solid(0, 0, 0, 0, 0, 3, {dyn:true}); B.state = "arriving";
      B.d = driveOf(B.g, [[95, EXIT.laneW], [40, EXIT.laneW], [EXIT.stop.x + 2.2, EXIT.laneW]], {sol:B.sol, vmax:u => u < .8 ? 10 : .8 + 9.2*(1 - u)*5});
    }
    if (B.state === "arriving"){ B.d.step(dt); if (B.d.st.done){ B.state = "boarding"; B.t = 0; } }
    if (B.state === "boarding"){
      B.t += dt;
      // they get on one by one, a second or so apart
      if (B.t > .9 && B.queue.length){ const p = B.queue.shift(); p.gone = true; p.h.g.visible = false; p.sol.off = true; B.t = 0; }
      if (!B.queue.length && B.t > 1.4 && !people.some(p => p.bus && !p.gone)){
        B.state = "leaving";
        B.d = driveOf(B.g, [[EXIT.stop.x + 2.2, EXIT.laneW], [EXIT.stop.x - 6, EXIT.laneW], [-95, EXIT.laneW]], {sol:B.sol, vmax:u => 11});
      }
    }
    if (B.state === "leaving"){ B.d.step(dt); if (B.d.st.done){ B.state = "gone"; B.sol.off = true; W.scene.remove(B.g); B.g.userData.dispose(); } }
  });
  return {cars, people, B, get state(){ return {cars:cars.map(c => c.state), people:people.map(p => p.gone ? "gone" : p.queued ? "waiting" : p.w.st.i), bus:B.state}; }};
}
