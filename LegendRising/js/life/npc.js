/* ============ LIFE: people ============
   Your team-mates out on the training pitch, the coach with his clipboard, the manager in his office, the
   woman behind the till. The bodies, faces, clothes and movement live in human.js (see its header for the
   look schema, lookFor(), human(), animateHuman() and playerRig()); this file puts them to work, and keeps
   the older person()/animate() calls working. */
import {THREE, W, solid} from "./build.js";
import {human, animateHuman, lookFor, playerRig, hashStr, rng, CONTACT, BONE} from "./human.js";
export {human, animateHuman, lookFor, playerRig, CONTACT, BONE};

const col = c => c == null ? null : typeof c === "number" ? c : new THREE.Color().setStyle(String(c)).getHex();

// the old call: a footballer-ish person from a few colours, feet at the origin, facing +z
export function person(o = {}){
  const sd = Math.abs(o.seed | 0);
  const look = o.look || lookFor(o.long ? "coach" : "footballer", sd, {kit:[col(o.shirt) ?? 0x2c66b8, col(o.shorts) ?? 0xf2f2ee, col(o.socks) ?? col(o.shirt) ?? 0x2c66b8]});
  if (o.skin != null) look.skin = col(o.skin);
  if (o.hair != null) look.hairColor = col(o.hair);
  if (o.boots != null) look.outfit.shoes = col(o.boots);
  if (o.scale) look.height = o.scale;
  if (o.long && !o.look){ look.outfit = {type:"tracksuit", shirt:col(o.shirt) ?? 0x1b2633, trousers:col(o.shorts) ?? 0x1b2633, trim:0xf2f2ee}; look.props = []; }
  const h = human(look, o.opts);
  h.legs = [h.bones[BONE.thL], h.bones[BONE.thR]]; h.arms = [h.bones[BONE.uaL], h.bones[BONE.uaR]]; h.body = h.bones[BONE.spine]; h.hips = h.bones[BONE.hips];
  return h;
}
// the old call: "run" (speed is a multiple of a 3.4 m/s jog), "kick" (p.kick 0..1), "stretch", "idle" — or any animateHuman mode
export function animate(p, dt, mode, speed = 1){
  if (mode === "run") return animateHuman(p, dt, {mode:"move", speed:3.4*speed});
  if (mode === "kick") return animateHuman(p, dt, {mode:"kick", t:Math.min(1, p.kick || 0)});
  return animateHuman(p, dt, mode);
}

/* ---------- the training session on the pitch ----------
   Two pairs passing (one pair in bibs): pass, the ball rolls across, a first touch to stop it, a touch to set
   it, and back — the ball leaves the boot at the moment of contact. Three running laps who stride out down the
   far side, the keeper stretching by the touchline, and the coach with his clipboard. */
export function teamSession(o){
  // o: {kit:[a,b], when:() => bool, centre:{x,z}, coach:{x,z,ry}, ballMesh:() => Mesh, lap?:[{x,z}...]}
  const root = new THREE.Group(); W.scene.add(root);
  const [a, b] = o.kit || ["#2c66b8", "#ffffff"];
  const base = hashStr(String(a) + String(b)) % 100000, r = rng(base + 11);
  const nums = [2, 3, 4, 5, 6, 7, 8, 10, 11, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 26, 27, 28];
  for (let i = nums.length - 1; i > 0; i--){ const j = Math.floor(r()*(i + 1)); [nums[i], nums[j]] = [nums[j], nums[i]]; }
  let k = 0;
  const player = extra => human(lookFor("footballer", base + 31*(++k), Object.assign({kit:[a, b, a], number:nums[k]}, extra)));
  const actors = [];
  // the passing pairs, facing each other
  const pairs = [[{x:o.centre.x - 9, z:o.centre.z - 3}, {x:o.centre.x - 1, z:o.centre.z - 3}, false], [{x:o.centre.x + 2, z:o.centre.z + 3}, {x:o.centre.x + 10, z:o.centre.z + 3}, "#d8ff3a"]];
  for (const [p1, p2, bib] of pairs){
    const P = [player({bib, training:!!bib}), player({bib, training:!!bib})];
    P[0].g.position.set(p1.x, 0, p1.z); P[1].g.position.set(p2.x, 0, p2.z);
    P[0].g.rotation.y = Math.atan2(p2.x - p1.x, p2.z - p1.z); P[1].g.rotation.y = Math.atan2(p1.x - p2.x, p1.z - p2.z);
    root.add(P[0].g, P[1].g);
    const ball = o.ballMesh(); root.add(ball);
    actors.push({kind:"pair", P, ball, who:0, st:"pass", t:r()*.5, at:null, to:null, roll:0, ax:new THREE.Vector3()});
  }
  // three running laps together
  const lap = (o.lap || [{x:-18, z:-6}, {x:18, z:-6}, {x:18, z:-25}, {x:-18, z:-25}]).map(p => ({x:p.x, z:p.z}));
  // a side of the loop that runs past the coach is moved in, so the group runs in front of him rather than through him
  const cx = lap.reduce((s, p) => s + p.x, 0)/lap.length, cz = lap.reduce((s, p) => s + p.z, 0)/lap.length;
  lap.forEach((p, i) => { const q = lap[(i + 1) % lap.length], dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz) || 1;
    const t = Math.max(0, Math.min(1, ((o.coach.x - p.x)*dx + (o.coach.z - p.z)*dz)/(L*L))), d = Math.hypot(p.x + dx*t - o.coach.x, p.z + dz*t - o.coach.z);
    if (d < 3){ let nx = -dz/L, nz = dx/L; if ((cx - p.x)*nx + (cz - p.z)*nz < 0){ nx = -nx; nz = -nz; } const push = 3 - d + .4; p.x += nx*push; p.z += nz*push; q.x += nx*push; q.z += nz*push; } });
  const segs = lap.map((p, i) => { const q = lap[(i + 1) % lap.length]; return {p, q, len:Math.hypot(q.x - p.x, q.z - p.z), yaw:Math.atan2(q.x - p.x, q.z - p.z)}; });
  const total = segs.reduce((s, q) => s + q.len, 0);
  for (let i = 0; i < 3; i++){
    const P = player({});
    root.add(P.g);
    actors.push({kind:"lap", P, d:i*1.3 + (i === 2 ? 1.1 : 0), side:[0, .9, -.9][i], v:3.3, yaw:null, pace:3.25 + i*.12});
  }
  // the keeper stretching by the touchline, out of the coach's way
  const gk = human(lookFor("goalkeeper", base + 7, {kit:[a, b]}));
  gk.g.position.set(o.centre.x - 3.5, 0, o.centre.z + 8.2); gk.g.rotation.y = Math.PI*.85; root.add(gk.g);
  actors.push({kind:"stretch", P:gk});
  // and the coach watching it all
  const coach = human(lookFor("coach", base + 3, {kit:[a, b]}), {cast:false});
  coach.g.position.set(o.coach.x, 0, o.coach.z); coach.g.rotation.y = o.coach.ry || 0;
  root.add(coach.g);
  const coachSolid = solid(o.coach.x - .35, o.coach.x + .35, o.coach.z - .35, o.coach.z + .35, 0, 1.9);
  const tmp = new THREE.Vector3();
  // a spot by a player's right foot, d metres in front of him
  const footSpot = (P, d, out) => { const y = P.g.rotation.y; return out.set(P.g.position.x + Math.sin(y)*d - Math.cos(y)*.12, .11, P.g.position.z + Math.cos(y)*d + Math.sin(y)*.12); };
  const rollBall = (ac, from, to) => {
    const d = tmp.subVectors(to, from), L = d.length(); if (L < 1e-5) return;
    ac.ax.set(d.z, 0, -d.x).normalize(); ac.ball.rotateOnWorldAxis(ac.ax, L/.11);
  };
  const PASS = .75, TRAP = .7, SET = .6, SPEED = 7.5;
  const pa = new THREE.Vector3(), pb = new THREE.Vector3();
  let on = null;
  W.anims.push(dt => {
    const now = !!o.when();
    if (now !== on){ on = now; root.visible = now; coachSolid.off = !now; }
    if (!now) return;
    for (const ac of actors){
      if (ac.kind === "pair"){
        const A = ac.P[ac.who], Bp = ac.P[1 - ac.who];
        ac.t += dt;
        const old = pa.copy(ac.ball.position);
        if (ac.st === "pass"){
          const t = ac.t/PASS;
          animateHuman(A, dt, {mode:"pass", t:Math.min(1, t)});
          if (t < CONTACT.pass) footSpot(A, .34, ac.ball.position);
          else {
            if (!ac.at){ ac.at = footSpot(A, .34, new THREE.Vector3()); ac.to = footSpot(Bp, .3, new THREE.Vector3()); ac.fly = ac.at.distanceTo(ac.to)/SPEED; ac.ft = 0; }
            ac.ft += dt; const f = Math.min(1, ac.ft/ac.fly);
            ac.ball.position.lerpVectors(ac.at, ac.to, f);
            // the receiver times his first touch to meet it
            const left = ac.fly - ac.ft;
            if (left < TRAP*CONTACT.trap){ ac.st = "trap"; ac.t = TRAP*CONTACT.trap - left; }
          }
          if (ac.st === "pass") animateHuman(Bp, dt, "idle");
        } else if (ac.st === "trap"){
          const t = ac.t/TRAP;
          animateHuman(Bp, dt, {mode:"trap", t:Math.min(1, t)}); animateHuman(A, dt, "idle");
          if (t < CONTACT.trap){ ac.ft += dt; ac.ball.position.lerpVectors(ac.at, ac.to, Math.min(1, ac.ft/ac.fly)); }
          else ac.ball.position.lerp(footSpot(Bp, .3, pb), 1 - Math.exp(-12*dt));
          if (t >= 1){ ac.st = "set"; ac.t = 0; ac.at = null; }
        } else if (ac.st === "set"){
          const t = ac.t/SET;
          animateHuman(Bp, dt, {mode:"pass", t:Math.min(1, t), amp:.45}); animateHuman(A, dt, "idle");
          // a short touch out of the feet, ready to play it back
          if (t > CONTACT.pass) ac.ball.position.lerp(footSpot(Bp, .34, pb), 1 - Math.exp(-6*dt));
          if (t >= 1.25){ ac.st = "pass"; ac.t = 0; ac.who = 1 - ac.who; }
        }
        rollBall(ac, old, ac.ball.position);
      } else if (ac.kind === "lap"){
        // where along the loop he is; down the far side they stride out
        const d0 = ((ac.d % total) + total) % total;
        let d = d0, i = 0; while (d > segs[i].len){ d -= segs[i].len; i = (i + 1) % segs.length; }
        const sg = segs[i], target = i === 2 ? ac.pace + 2.6 : ac.pace;
        ac.v += (target - ac.v)*(1 - Math.exp(-.9*dt));
        ac.d += ac.v*dt;
        const f = d/sg.len, ux = (sg.q.x - sg.p.x)/sg.len, uz = (sg.q.z - sg.p.z)/sg.len;
        ac.P.g.position.set(sg.p.x + (sg.q.x - sg.p.x)*f - uz*ac.side, 0, sg.p.z + (sg.q.z - sg.p.z)*f + ux*ac.side);
        if (ac.yaw == null) ac.yaw = sg.yaw;
        let dy = sg.yaw - ac.yaw; while (dy > Math.PI) dy -= Math.PI*2; while (dy < -Math.PI) dy += Math.PI*2;
        ac.yaw += dy*(1 - Math.exp(-5*dt)); ac.P.g.rotation.y = ac.yaw;
        animateHuman(ac.P, dt, {mode:"move", speed:ac.v});
      } else animateHuman(ac.P, dt, "stretch");
    }
    animateHuman(coach, dt, "clipboard");
  });
  return {root, coach, actors};
}

/* ---------- someone at work: behind a counter, at a desk, in the office ---------- */
const JOB_ROLE = {cafe:"barista", store:"shopkeeper", courier:"courier", gym:"gym", academy:"coach", photo:"office", video:"office"};
const POSE = {manager:{mode:"counter", counter:.8, reach:.4}, shopkeeper:{mode:"counter", counter:1.04, reach:.34}, barista:{mode:"counter", counter:1.04, reach:.4}, gym:{mode:"counter", counter:1.1, reach:.3},
  coach:{mode:"clipboard"}, office:{mode:"idle", arms:"behind"}, courier:{mode:"idle", arms:"hips"}};
function roleOf(o){
  if (o.role) return o.role;
  if (W.zone === "ground") return "manager";
  if (o.seed === 11) return "shopkeeper";
  const id = typeof jobState === "function" ? (jobState() || {}).id : "";
  return JOB_ROLE[id] || "shopkeeper";
}
// o: {role, look, pose (an animateHuman state), seed, shirt (the uniform's colour), hair, y}
export function staffer(x, z, ry, o = {}){
  const role = roleOf(o);
  let look = o.look;
  if (!look){
    const sh = col(o.shirt), out = {};
    if (sh != null){
      if (role === "manager") out.shirt = sh;
      else if (role === "shopkeeper" || role === "barista") out.apron = sh;
      else if (role !== "coach") out.shirt = sh;
    }
    look = lookFor(role, o.seed ?? 5, {outfit:out});
    if (o.hair != null) look.hairColor = col(o.hair);
  }
  const h = human(look, {cast:true});
  h.g.position.set(x, o.y || 0, z); h.g.rotation.y = ry;
  W.scene.add(h.g);
  // shop counters stand in front of the till workers; elsewhere they simply stand about
  let st = o.pose || POSE[role] || {mode:"idle"};
  if (!o.pose && st.mode === "counter" && role === "shopkeeper" && o.seed !== 11 && W.zone !== "ground") st = {mode:"idle", arms:"behind"};
  W.anims.push(dt => animateHuman(h, dt, st));
  solid(x - .3, x + .3, z - .3, z + .3, o.y || 0, (o.y || 0) + 1.9);
  return h;
}
