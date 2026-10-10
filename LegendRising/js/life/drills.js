/* ============ LIFE: practice in the gym ============
   Owner: WP-I (Stage 2). Contract: DESIGN 1.4.1 (the mode drill and its host), 2.4 WP-I.
   In the gym each set is a run of reps you time, and your body does the work. Everything is worth more fresh and
   fed, and less when you are spent. The football itself (the drills on the pitch, the team session, the first day's
   lessons) is played on the match simulation in first person: js/life/football/training.js, with the same ball,
   actions, AI and controls as a match. This file keeps the gym and the drill card both of them show (#lifeDrill). */
import {THREE, W} from "./build.js";
import {barbell, dumbbell} from "./gymclub.js";
import {plyoPath} from "./human.js";
import {ballMesh} from "./football/pitchmesh.js";

const G = () => (typeof S !== "undefined" ? S : null);
/* ---------- the overlay every drill shares ---------- */
function hudEl(){ return document.getElementById("lifeDrill"); }
export function hudSet(d, o = {}){
  const el = hudEl(); if (!el) return;
  clearTimeout(hudClose._t);
  if (!el.dataset.on || !el.querySelector(".dr-card")){
    el.innerHTML = `<div class="dr-card"><div class="dr-top"><b class="dr-title"></b><span class="dr-reps"></span></div><div class="dr-pips"></div><div class="dr-hint"></div></div>
      <div class="dr-result"></div><div class="dr-power"><i></i><span>POWER</span></div><div class="dr-timing"><div class="dr-zone"></div><div class="dr-mark"></div></div>`;
    el.dataset.on = "1";
    requestAnimationFrame(() => el.classList.add("on"));
  } else el.classList.add("on");
  el.querySelector(".dr-title").textContent = d.title;
  el.querySelector(".dr-reps").textContent = `${Math.min(d.rep + 1, d.reps)} / ${d.reps}`;
  el.querySelector(".dr-pips").innerHTML = Array.from({length:d.reps}, (_, i) => `<i class="${i < d.scores.length ? (d.scores[i] >= .7 ? "hi" : d.scores[i] >= .35 ? "mid" : "lo") : i === d.rep ? "now" : ""}"></i>`).join("");
  if (o.hint != null) el.querySelector(".dr-hint").textContent = o.hint;
}
export function hudResult(text, sub, good){
  const el = hudEl(), r = el && el.querySelector(".dr-result"); if (!r) return;
  r.className = `dr-result ${good ? "good" : "bad"}`; r.innerHTML = `<b>${text}</b>${sub ? `<span>${sub}</span>` : ""}`;
  void r.offsetWidth; r.classList.add("show");
  clearTimeout(hudResult._t); hudResult._t = setTimeout(() => r.classList.remove("show"), 1300);
}
export function hudPower(p){ const el = hudEl(), b = el && el.querySelector(".dr-power"); if (!b) return; b.classList.toggle("show", p != null); if (p != null) b.querySelector("i").style.width = (p*100).toFixed(0) + "%"; }
export function hudTiming(show, zone, mark){
  const el = hudEl(), t = el && el.querySelector(".dr-timing"); if (!t) return;
  t.classList.toggle("show", !!show);
  if (!show) return;
  const z = t.querySelector(".dr-zone"); z.style.left = ((zone.c - zone.w/2)*100) + "%"; z.style.width = (zone.w*100) + "%";
  t.querySelector(".dr-mark").style.left = (mark*100) + "%";
}
export function hudClose(){ const el = hudEl(); if (!el) return; el.classList.remove("on"); clearTimeout(hudClose._t); hudClose._t = setTimeout(() => { if (!el.classList.contains("on")){ el.innerHTML = ""; delete el.dataset.on; } }, 350); }

/* What a first-person drill draws is made once and compiled when you arrive at the ground (world.js warm draws this
   group once, hidden), so starting a drill never compiles a shader in the middle of play: the one ball look of every
   pitch (pitchmesh.js ballMesh) with its blob. The bodies are prebuilt by human.js */
export function drillWarmup(){
  const g = new THREE.Group();
  g.add(ballMesh({shadow:true}).mesh);
  return g;
}

/* =============================== gym sets =============================== */
const SETS = {
  squat:{title:"Squat rack", main:"power", side:["jumping", .3], bob:"dip"},
  dumbbell:{title:"Dumbbells", main:"power", side:["stamina", .2], bob:"curl"},
  plyo:{title:"Plyo boxes", main:"jumping", side:["power", .35], bob:"hop"},
  ladder:{title:"Sprint ladder", main:"pace", side:["dribbling", .3], bob:"run"},
  treadmill:{title:"Treadmill", main:"stamina", side:["pace", .25], bob:"run"},
  bike:{title:"Exercise bike", main:"stamina", side:["pace", .35], bob:"run"}
};
/* Where each set is done and how it is filmed: where you stand (x, z, facing yaw), the equipment, and the camera's place
   in your own frame (right, up, back; back is negative, so in front of you), looking at a point in the same frame. */
const NEAR = (list, P) => list.reduce((a, b) => Math.hypot(b[0] - P.x, b[1] - P.z) < Math.hypot(a[0] - P.x, a[1] - P.z) ? b : a);
/* the piece you are at: the nearest of its kind in this gym (gymclub.js puts each one in W.stations), with how the set
   is filmed for it; a gym built before stations (none listed) falls back to the club gym's own places */
const CAMS = {squat:{cam:[1.9, 1.35, -2.5], at:[0, 1.0, 0]}, dumbbell:{cam:[1.5, 1.4, -2.3], at:[0, 1.1, 0]}, plyo:{cam:[1.5, 1.75, 2.6], at:[0, 1.0, .5]},
  ladder:{cam:[2.4, 1.6, 1.0], at:[0, .9, 1.8]}, treadmill:{cam:[1.7, 1.55, 2.1], at:[0, 1.15, 0]}, bike:{cam:[1.9, 1.3, -1.2], at:[0, .95, .1]}};
function station(kind, P){
  const list = W.stations && W.stations[kind];
  if (list && list.length){
    const s = list.reduce((a, b) => Math.hypot(b.x - P.x, b.z - P.z) < Math.hypot(a.x - P.x, a.z - P.z) ? b : a);
    return Object.assign({y:0}, CAMS[kind], s);
  }
  switch (kind){
    case "squat": return {x:-9.6, z:6.75, yaw:Math.PI, y:0, cam:[1.9, 1.35, -2.5], at:[0, 1.0, 0]};
    case "dumbbell": return {x:-11.05, z:10.2, yaw:-Math.PI/2, y:0, cam:[1.5, 1.4, -2.3], at:[0, 1.1, 0]};
    case "plyo": return {x:-7.5, z:12.7, yaw:Math.PI, y:0, box:.6, cam:[1.5, 1.75, 2.6], at:[0, 1.0, .5]};
    case "ladder": return {x:0, z:5.3, yaw:Math.PI, y:.04, len:6.8, cam:[2.4, 1.6, 1.0], at:[0, .9, 1.8]};
    case "treadmill": { const [x] = NEAR([[5.4, 7.2], [7.6, 7.2], [9.8, 7.2]], P); return {x, z:7.35, yaw:0, y:.255, cam:[1.7, 1.55, 2.1], at:[0, 1.15, 0]}; }
    case "bike": { const [x] = NEAR([[5.6, 10.8], [7.6, 10.8]], P); return {x:x + .14, z:10.8, yaw:Math.PI/2, y:0, cam:[1.9, 1.3, -1.2], at:[0, .95, .1]}; }
  }
  return {x:P.x, z:P.z, yaw:P.yaw, y:0, cam:[1.6, 1.4, -2.4], at:[0, 1, 0]};
}
// how a rep goes with how well you timed it: perfect, good, sloppy, missed
const GRADE = q => q >= .9 ? "perfect" : q >= .55 ? "good" : q > 0 ? "sloppy" : "miss";
const REP = {   // seconds a rep takes, by grade
  squat:{perfect:1.0, good:1.2, sloppy:1.5, miss:2.4}, dumbbell:{perfect:.85, good:1.0, sloppy:1.2, miss:1.4},
  plyo:{perfect:2.5, good:2.6, sloppy:2.8, miss:2.5}, ladder:{perfect:1.15, good:1.45, sloppy:1.9, miss:2.6},
  treadmill:{perfect:1.6, good:1.6, sloppy:1.6, miss:1.8}, bike:{perfect:1.4, good:1.4, sloppy:1.5, miss:1.7}
};
export function startReps(kind, H){
  const s = G(), set = SETS[kind];
  // the set is seen from beside you: your body does the work (human.js: squat, curl, plyo, bike, running), and how well
  // you time each rep is how it looks: a deep clean squat or a grinding one, a stuck landing or a clipped box
  const D = {kind, H, rep:0, reps:6, scores:[], xp:0, phase:"go", t:0, title:set.title, objs:[], allowMove:false, lockLook:true, hideBody:true};
  const sk = s.skills[set.main] || 30;
  const zone = () => ({c:.5 + Math.sin(D.rep*1.9)*.18, w:Math.max(.09, .2 + sk/700 - D.rep*.012)*(.7 + .3*trainEff())});
  D.z = zone(); D.m = 0; D.dir = 1;
  const speed = () => .75 + D.rep*.09;
  const st = station(kind, H.P), sin = Math.sin(st.yaw), cos = Math.cos(st.yaw);
  // tired old kit is worth less than good kit (GYM_XP, by the gym's tier)
  const kitXP = typeof GYM_XP === "object" && st.tier ? GYM_XP[Math.max(1, Math.min(6, st.tier)) - 1] : 1;
  // your frame: forward is where you face (-sin, -cos), right is (cos, -sin)
  const W2 = (r, f) => [st.x + r*cos - f*sin, st.z - r*sin - f*cos];
  H.place({x:st.x, z:st.z, y:0, yaw:st.yaw});
  const A = {grade:"good", k:0, ph:0, side:1, pos:0, dirL:1, run:0, step:0};
  // the bike you are on: its cranks turn with your feet
  if (kind === "bike" && W.bikes && W.bikes.length) A.bike = W.bikes.reduce((a, b) => Math.hypot(b.x - st.x, b.z - st.z) < Math.hypot(a.x - st.x, a.z - st.z) ? b : a);
  // the props: the rack's own bar off its hooks, or a pair of dumbbells from the rack
  const sc = H.scene();
  let bar = null, bells = null;
  if (kind === "squat"){ bar = st.bar || barbell(); if (!bar.parent) sc.add(bar); }
  if (kind === "dumbbell"){ bells = [dumbbell(st.color || 0xe2722e), dumbbell(st.color || 0xe2722e)]; bells.forEach(b => sc.add(b)); }
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _o = new THREE.Vector3();
  D.props = h => {
    const hl = h.bones[8], hr = h.bones[11];            // the hands (human.js BONE.haL, haR)
    if (bar){ hl.getWorldPosition(_a); hr.getWorldPosition(_b); bar.position.copy(_a).add(_b).multiplyScalar(.5); bar.position.y += .02;
      bar.rotation.set(0, Math.atan2(-(_b.z - _a.z), _b.x - _a.x), 0); }
    if (bells) [hl, hr].forEach((bn, i) => { bn.getWorldQuaternion(_q); _o.set(0, -.075, .01).applyQuaternion(_q); bn.getWorldPosition(bells[i].position).add(_o); bells[i].quaternion.copy(_q); });
  };
  // the shot: beside you, easing after you (the sprint lane moves)
  const camPos = new THREE.Vector3(), camAt = new THREE.Vector3(); let camInit = false;
  D.view = (dt, cam) => {
    const along = kind === "ladder" ? A.pos : 0;
    const fx = -sin, fz = -cos, rx = cos, rz = -sin;
    const ox = st.x + fx*along, oz = st.z + fz*along;
    const want = _a.set(ox + rx*st.cam[0] - fx*st.cam[2], st.cam[1] + (st.y || 0), oz + rz*st.cam[0] - fz*st.cam[2]);
    const look = _b.set(ox + rx*st.at[0] + fx*st.at[2], st.at[1] + (st.y || 0) + (kind === "plyo" ? A.lift*.6 : 0), oz + rz*st.at[0] + fz*st.at[2]);
    if (!camInit){ camPos.copy(want); camAt.copy(look); camInit = true; }
    const k = 1 - Math.exp(-6*dt); camPos.lerp(want, k); camAt.lerp(look, k);
    cam.position.copy(camPos); cam.lookAt(camAt);
  };
  A.lift = 0;
  // what the body is doing this frame
  D.pose = dt => {
    const g = A.grade, animT = D.phase === "anim" ? Math.min(1, D.t/REP[kind][g]) : 0, base = {x:st.x, z:st.z, y:st.y || 0, yaw:st.yaw, air:true};
    if (kind === "squat"){
      // down and up; a missed rep grinds at the bottom, shaking, before it comes up
      let k = 0, wob = 0;
      if (D.phase === "anim"){
        k = g === "miss" ? kf3(animT, [[0, 0], [.25, 1], [.7, .85], [1, 0]]) : kf3(animT, [[0, 0], [.45, g === "perfect" ? 1.05 : g === "good" ? .9 : .65], [1, 0]]);
        wob = g === "miss" ? (animT > .2 && animT < .75 ? 1 : 0) : g === "sloppy" ? .5 : 0;
      }
      return Object.assign(base, {mode:"squat", k, wob});
    }
    if (kind === "dumbbell"){
      let k = 0;
      if (D.phase === "anim") k = (g === "miss" ? .45 : g === "sloppy" ? .8 : 1)*Math.sin(Math.min(1, animT)*Math.PI);
      return Object.assign(base, {mode:"curl", k, side:A.side, sway:g === "sloppy" ? 1 : g === "miss" ? .6 : 0});
    }
    if (kind === "plyo"){
      // the whole rep is one movement: up onto the box (or not), stand tall, step back down and walk back to the mark;
      // the next jump is only offered once you are standing on it again
      const fail = g === "miss", t = D.phase === "anim" ? animT : 0, p = plyoPath(t, fail);
      A.lift = Math.min(1, p.up);
      const [x, z] = W2(0, p.fwd);
      return Object.assign(base, {mode:"plyo", t, fail, box:st.box, x, z, y:p.up*st.box});
    }
    if (kind === "ladder"){
      // quick feet down the ladder; a good rep flies, a missed one stutters and nearly trips
      const v = D.phase === "anim" ? ({perfect:6.2, good:5, sloppy:3.6, miss:2.6})[g]*(g === "miss" ? (.6 + .4*Math.abs(Math.sin(D.t*5))) : 1) : 0;
      A.pos = Math.max(0, Math.min(st.len, A.pos + A.dirL*v*dt));
      const yaw = A.dirL > 0 ? st.yaw : st.yaw + Math.PI;
      const [x, z] = W2(0, A.pos);
      return Object.assign(base, {mode:v > .05 ? "move" : "idle", speed:v, x, z, yaw, air:false});
    }
    if (kind === "treadmill"){
      // the belt runs at a jog; a rep is a burst, faster for a good one, a stumble for a miss
      const burst = D.phase === "anim" ? ({perfect:7.2, good:6, sloppy:4.6, miss:3})[g]*Math.sin(Math.min(1, animT)*Math.PI) : 0;
      const v = 2.6 + Math.max(0, burst - 2.6*Math.sin(Math.min(1, animT)*Math.PI));
      A.run = v;
      return Object.assign(base, {mode:"move", speed:v, dir:0});
    }
    if (kind === "bike"){
      const cad = 7 + (D.phase === "anim" ? ({perfect:9, good:6.5, sloppy:3.5, miss:1})[g]*Math.sin(Math.min(1, animT)*Math.PI) : 0);
      A.ph += cad*dt;
      if (A.bike) A.bike.set(A.ph);
      return Object.assign(base, {mode:"bike", ph:A.ph, seat:.86, crankY:.36, crankZ:.16, crankR:A.bike ? A.bike.r : .16, barY:1.08, barZ:.6});
    }
    return Object.assign(base, {mode:"idle"});
  };
  D.update = dt => {
    D.t += dt;
    if (D.phase === "go"){
      D.m += D.dir*speed()*dt;
      if (D.m > 1){ D.m = 1; D.dir = -1; } if (D.m < 0){ D.m = 0; D.dir = 1; }
      hudTiming(true, D.z, D.m);
    }
    if (D.phase === "anim"){
      const dur = REP[kind][A.grade];
      if (D.t >= dur){
        D.rep++; if (kind === "dumbbell") A.side = -A.side; if (kind === "ladder"){ A.dirL = -A.dirL; }
        if (D.rep >= D.reps) return finish();
        D.z = zone(); D.phase = "go"; D.t = 0; hudSet(D);
      }
    }
  };
  const press = () => {
    if (D.phase !== "go") return;
    const off = Math.abs(D.m - D.z.c), half = D.z.w/2;
    const q = off <= half ? .55 + .45*(1 - off/half) : off <= half*2 ? .25 : 0;
    let x = trainXP(set.main, (4 + 10*q)*kitXP); if (set.side && q > 0) x += trainXP(set.side[0], (1 + 3*q)*set.side[1]*3*kitXP);
    D.xp += x; D.scores.push(q);
    A.grade = GRADE(q);
    const words = {squat:["Deep and clean", "Good rep", "Half a rep", "Grinding it out"], dumbbell:["Perfect curl", "Good rep", "Swinging it", "Couldn't lift it"],
      plyo:["Stuck the landing", "Up and on", "Heavy landing", "Clipped the box"], ladder:["Lightning feet", "Quick feet", "Sloppy feet", "Tripped up"],
      treadmill:["Flying", "Strong burst", "Labouring", "Stumbled"], bike:["Spinning", "Strong push", "Heavy legs", "Legs gone"]}[kind];
    const gi = ["perfect", "good", "sloppy", "miss"].indexOf(A.grade);
    hudResult(words ? words[gi] : (q >= .9 ? "Perfect rep" : q >= .55 ? "Good rep" : q > 0 ? "Sloppy" : "Missed it"), `+${x} XP`, q >= .55);
    if (A.grade === "perfect") H.shakeCam && H.shakeCam(.012, .2);
    D.phase = "anim"; D.t = 0; hudSet(D); hudTiming(false);
  };
  const cleanup = () => {
    if (bar && bar === st.bar && bar.userData.home){ bar.position.copy(bar.userData.home); bar.rotation.set(0, 0, 0); }
    else if (bar) sc.remove(bar);
    if (bells) bells.forEach(b => sc.remove(b));
    // you step away from the equipment, facing it
    const [x, z] = W2(0, kind === "squat" ? 1.2 : kind === "treadmill" ? -1.2 : kind === "bike" ? -.9 : kind === "ladder" ? A.pos : -.3);
    H.place({x, z, y:0, yaw:kind === "squat" ? st.yaw + Math.PI : st.yaw});
  };
  const finish = () => {
    D.phase = "done"; hudTiming(false);
    const avg = D.scores.reduce((a, b) => a + b, 0)/Math.max(1, D.scores.length);
    exert(8, 7); s.today.trainMin += 45; H.pass(45, "train");
    cleanup(); hudClose(); H.bob(0); H.endDrill();
    if (typeof FEED === "object") FEED.center(`${set.title} · set done`, `${Math.round(avg*100)}% · +${D.xp} XP`, {kind:"drill", icon:"✓", ms:2200});
    if (typeof save === "function") save();
  };
  D.input = (type, k) => {
    if (D.phase === "done") return;
    if (type === "down" && (k === "mouse" || k === " " || k === "e")) press();
    if (type === "down" && k === "escape"){
      D.phase = "done"; hudTiming(false); hudClose(); H.bob(0); cleanup();
      const done = D.scores.length; if (done){ exert(done*1.2, done); s.today.trainMin += done*7; H.pass(done*7, "train"); }
      H.endDrill(); H.note(done ? `Stopped after ${done} reps. You keep the ${D.xp} XP.` : "Set cancelled.");
    }
  };
  hudSet(D, {hint:`Press Space, E or click when the marker is in the green${st.tier ? ` · tier ${st.tier} kit · ${Math.round(kitXP*100)}% XP` : ""}`});
  return D;
}
const kf3 = (t, K) => { if (t <= K[0][0]) return K[0][1]; for (let i = 1; i < K.length; i++) if (t <= K[i][0]){ const u = (t - K[i - 1][0])/(K[i][0] - K[i - 1][0]), e = u*u*(3 - 2*u); return K[i - 1][1] + (K[i][1] - K[i - 1][1])*e; } return K[K.length - 1][1]; };

