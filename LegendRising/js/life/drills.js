/* ============ LIFE: practice ============
   Training you actually do. On the pitch you take the shot, play the pass, time the header and
   read the ball machine yourself — how close you get is what you learn. In the gym each set is a
   run of reps you time. Everything is worth more fresh and fed, and less when you are spent. */
import {THREE, W} from "./build.js";
import {DRILLS, RINGS, PITCH, ballMesh} from "./ground.js";
import {CONTACT} from "./human.js";

const G = () => (typeof S !== "undefined" ? S : null);
const GRAV = 9.81;
const rand = (a, b) => a + Math.random()*(b - a);
const fwd = (yaw, pitch) => new THREE.Vector3(-Math.sin(yaw)*Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw)*Math.cos(pitch));
const PRAISE = q => q >= .9 ? "Perfect" : q >= .7 ? "Great" : q >= .45 ? "Good" : q > .15 ? "Close" : "Missed";

/* ---------- the overlay every drill shares ---------- */
function hudEl(){ return document.getElementById("lifeDrill"); }
function hudSet(d, o = {}){
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
function hudResult(text, sub, good){
  const el = hudEl(), r = el && el.querySelector(".dr-result"); if (!r) return;
  r.className = `dr-result ${good ? "good" : "bad"}`; r.innerHTML = `<b>${text}</b>${sub ? `<span>${sub}</span>` : ""}`;
  void r.offsetWidth; r.classList.add("show");
  clearTimeout(hudResult._t); hudResult._t = setTimeout(() => r.classList.remove("show"), 1300);
}
function hudPower(p){ const el = hudEl(), b = el && el.querySelector(".dr-power"); if (!b) return; b.classList.toggle("show", p != null); if (p != null) b.querySelector("i").style.width = (p*100).toFixed(0) + "%"; }
function hudTiming(show, zone, mark){
  const el = hudEl(), t = el && el.querySelector(".dr-timing"); if (!t) return;
  t.classList.toggle("show", !!show);
  if (!show) return;
  const z = t.querySelector(".dr-zone"); z.style.left = ((zone.c - zone.w/2)*100) + "%"; z.style.width = (zone.w*100) + "%";
  t.querySelector(".dr-mark").style.left = (mark*100) + "%";
}
function hudClose(){ const el = hudEl(); if (!el) return; el.classList.remove("on"); clearTimeout(hudClose._t); hudClose._t = setTimeout(() => { if (!el.classList.contains("on")){ el.innerHTML = ""; delete el.dataset.on; } }, 350); }

/* ---------- a ball in flight ---------- */
function stepBall(b, dt){
  const v = b.v, sp = v.length();
  v.addScaledVector(v, -.011*sp*dt);
  v.y -= GRAV*dt;
  b.m.position.addScaledVector(v, dt);
  if (b.m.position.y < .11){
    b.m.position.y = .11;
    // a real landing bounces and loses some pace; a ball already rolling just keeps rolling
    if (v.y < -1.2){ v.y = -v.y*.42; v.x *= .86; v.z *= .86; if (v.y < .8) v.y = 0; }
    else if (v.y < 0) v.y = 0;
    if (v.y === 0){ const hs = Math.hypot(v.x, v.z); if (hs > 0){ const k = Math.max(0, hs - 2.4*dt)/hs; v.x *= k; v.z *= k; } }
  }
  b.m.rotation.x += v.z*dt*5; b.m.rotation.z -= v.x*dt*5;
}
/* The drills' own materials are made once and kept (never disposed), and the world draws a set of these props when
   you arrive at the ground (drillWarmup) — so starting a drill never compiles a shader in the middle of play. */
let MATS = null;
function mats(){
  if (MATS) return MATS;
  const keep = m => { m.userData.keep = true; return m; };
  const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"), gr = x.createRadialGradient(32, 32, 1, 32, 32, 31);
  gr.addColorStop(0, "rgba(0,0,0,.6)"); gr.addColorStop(.6, "rgba(0,0,0,.25)"); gr.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const st = new THREE.CanvasTexture(c); st.userData.per = 1;
  MATS = {ring:keep(new THREE.MeshBasicMaterial({color:0xc8f060, toneMapped:false})),
    disc:keep(new THREE.MeshBasicMaterial({color:0xc8f060, transparent:true, opacity:.22, depthWrite:false, toneMapped:false})),
    lamp:keep(new THREE.MeshBasicMaterial({color:0xff5a4a, toneMapped:false})),
    shadow:keep(new THREE.MeshBasicMaterial({map:st, transparent:true, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2}))};
  return MATS;
}
// a glowing target ring
function ringMesh(r = .45, flat = false){
  const g = new THREE.Group(), M = mats();
  const t = new THREE.Mesh(new THREE.TorusGeometry(r, .04, 8, 40), M.ring), d = new THREE.Mesh(new THREE.CircleGeometry(r, 32), M.disc);
  g.add(t, d);
  if (flat){ g.rotation.x = -Math.PI/2; }
  return g;
}
// the ball's shadow: a soft disc that follows it over the grass (the sun's shadow map is not redrawn for a ball in flight)
function ballShadow(){ const m = new THREE.Mesh(new THREE.PlaneGeometry(.42, .42).rotateX(-Math.PI/2), mats().shadow); m.renderOrder = 1; return m; }
function shadowFollow(sh, b){ const y = b.position.y; sh.position.set(b.position.x, .012, b.position.z); const k = 1/(1 + Math.max(0, y - .11)*.6); sh.scale.setScalar(1.6 - k*.6); sh.visible = b.visible; sh.material.opacity = .9*k; }
export function drillWarmup(){
  const g = new THREE.Group();
  g.add(ringMesh(.42), ringMesh(.9, true), new THREE.Mesh(new THREE.SphereGeometry(.12, 12, 8), mats().lamp), ballShadow());
  return g;
}
// where the ball sits at your feet: in front of the right boot, where the instep meets it (metres, scaled by your height)
const AT_FOOT = {ahead:.42, right:.13};

/* =============================== the drills =============================== */
export function startDrill(kind, H){
  const s = G();
  const D = {kind, H, rep:0, reps:kind === "pass" || kind === "intercept" ? 6 : 5, scores:[], xp:0, phase:"ready", t:0, objs:[], allowMove:kind === "intercept"};
  const spot = DRILLS[kind];
  D.title = spot.label;
  H.place({x:spot.x, z:spot.z, y:0, yaw:spot.yaw});
  H.P.pitch = kind === "head" ? .12 : kind === "pass" ? -.12 : -.02;
  const add = o => { W.scene.add(o); D.objs.push(o); return o; };
  D.ball = {m:add(ballMesh()), v:new THREE.Vector3()};
  D.ball.m.castShadow = false;
  const bsh = add(ballShadow());
  const sc = () => (H.scale ? H.scale() : 1);
  const resetBall = () => {
    const f = fwd(H.P.yaw, 0), a = AT_FOOT.ahead*sc(), r = AT_FOOT.right*sc();
    D.ball.m.position.set(H.P.x + f.x*a - f.z*r, .11, H.P.z + f.z*a + f.x*r); D.ball.v.set(0, 0, 0);
  };
  /* your body strikes the ball: while you hold for power the leg draws back; on release the strike plays and the ball
     leaves the boot at the moment of contact (human.js CONTACT), with the aim and power you released with */
  const strike = (mode, dur) => ({
    charge(p){ if (!D.kick) H.act({mode, t:.3*Math.min(1, p*1.6)}); },
    go(launch){ D.kick = {mode, t:H.actT ? Math.max(.12, Math.min(.3, H.actT())) : .3, dur, launch, done:false}; },
    step(dt){
      const k = D.kick; if (!k) return;
      k.t = Math.min(1, k.t + dt/k.dur); H.act({mode, t:k.t});
      if (!k.done && k.t >= CONTACT[mode]){ k.done = true; k.launch(); }
      if (k.t >= 1){ D.kick = null; H.act(null); }
    },
    idle(){ if (!D.kick) H.act(null); }
  });
  const award = (list, q) => { let x = 0; for (const [k, base, per] of list) x += trainXP(k, base + per*q); D.xp += x; return x; };
  const finishRep = (q, text, sub) => {
    D.scores.push(q); D.phase = "result"; D.t = 0;
    hudResult(text, sub, q >= .45);
    hudSet(D);
  };
  const setHint = h => hudSet(D, {hint:h});

  const KICK = strike(kind === "pass" ? "pass" : "kick", kind === "pass" ? .75 : .9);
  /* ----- shooting ----- */
  if (kind === "shoot"){
    const gx = PITCH.x0, cz = PITCH.cz, hw = PITCH.goalW/2, gh = PITCH.goalH;
    const ring = add(ringMesh(.42)); ring.rotation.y = Math.PI/2;
    const zones = [[-2, .5], [2, .5], [-2, 1.65], [2, 1.65], [0, .5], [-1.1, 1.2], [1.1, 1.2]].sort(() => Math.random() - .5);
    const newRep = () => { resetBall(); const [z, y] = zones[D.rep % zones.length]; D.tgt = new THREE.Vector3(gx + .05, y, cz + z); ring.position.copy(D.tgt); D.phase = "aim"; D.power = 0; D.crossed = false;
      setHint("Aim with the mouse · hold the left button or Space for power · release to shoot"); };
    D.newRep = newRep;
    D.update = dt => {
      D.t += dt;
      // your aim drifts a little: less with better accuracy, more when you are tired
      const amp = (1 - s.skills.accuracy/120)*.014*(1 + s.fatigue/90);
      const sw = Math.sin(D.t*1.7)*amp + Math.sin(D.t*2.9 + 1)*amp*.5, swp = Math.cos(D.t*1.3)*amp*.6;
      H.P.yaw += sw - (D.sw || 0); H.P.pitch += swp - (D.swp || 0); D.sw = sw; D.swp = swp;
      ring.children[0].scale.setScalar(1 + Math.sin(D.t*5)*.04);
      if (D.phase === "aim" && D.charging){ D.power = Math.min(1, D.power + dt/0.95); hudPower(D.power); KICK.charge(D.power); }
      else if (D.phase === "aim") KICK.idle();
      KICK.step(dt); shadowFollow(bsh, D.ball.m);
      if (D.phase === "flight"){
        const b = D.ball, px = b.m.position.x;
        stepBall(b, dt);
        if (!D.crossed && px > gx && b.m.position.x <= gx){
          D.crossed = true;
          const z = b.m.position.z, y = b.m.position.y, inFrame = Math.abs(z - cz) < hw - .11 && y < gh - .11;
          const frame = !inFrame && Math.abs(z - cz) < hw + .15 && y < gh + .15;
          const d = Math.hypot(z - D.tgt.z, y - D.tgt.y);
          let q = inFrame ? (d < .3 ? 1 : Math.max(0, 1 - (d - .3)/1.5)) : frame ? .18 : 0;
          if (inFrame){ b.v.multiplyScalar(.25); }
          else if (frame){ b.v.x = Math.abs(b.v.x)*.5; b.v.z *= -.4; }
          const x = award([["accuracy", 5, 16], ["power", 2, 4*D.shotPower], ...(D.shotPower > .75 && inFrame ? [["aero", 3, 3]] : [])], q);
          finishRep(q, inFrame ? `${PRAISE(q)} · ${d.toFixed(2)} m off` : frame ? "Off the frame" : (y > gh ? "Over the bar" : "Wide"), `+${x} XP`);
        }
        if (b.m.position.x < gx - 1.5){ b.v.set(0, Math.min(0, b.v.y), 0); }
        if (D.t > 3.2 && !D.crossed){ D.crossed = true; finishRep(0, "Not enough on it", "+0 XP"); }
      }
      if (D.phase === "result" && D.t > 1.4) nextRep();
    };
    D.shoot = () => {
      if (D.phase !== "aim" || D.power < .06){ D.charging = false; D.power = 0; hudPower(null); KICK.idle(); return; }
      D.charging = false; hudPower(null);
      const dir = fwd(H.P.yaw, H.P.pitch + .06), sp = 11 + D.power*19, pw = D.power;
      D.phase = "strike";
      KICK.go(() => { D.ball.v.copy(dir).multiplyScalar(sp); D.shotPower = pw; D.phase = "flight"; D.t = 0; });
    };
  }

  /* ----- passing ----- */
  if (kind === "pass"){
    const order = RINGS.slice().sort(() => Math.random() - .5);
    const ring = add(ringMesh(.9, true));
    const newRep = () => { resetBall(); const [x, z] = order[D.rep % order.length]; D.tgt = new THREE.Vector3(x, .03, z); ring.position.set(x, .04, z); D.phase = "aim"; D.power = 0;
      setHint("Turn to the lit ring · look up to lift it · hold for weight · release to pass"); };
    D.newRep = newRep;
    D.update = dt => {
      D.t += dt;
      const amp = (1 - s.skills.passacc/120)*.01*(1 + s.fatigue/90), sw = Math.sin(D.t*1.5)*amp;
      H.P.yaw += sw - (D.sw || 0); D.sw = sw;
      ring.scale.setScalar(1 + Math.sin(D.t*4)*.05);
      if (D.phase === "aim" && D.charging){ D.power = Math.min(1, D.power + dt/1.25); hudPower(D.power); KICK.charge(D.power); }
      else if (D.phase === "aim") KICK.idle();
      KICK.step(dt); shadowFollow(bsh, D.ball.m);
      if (D.phase === "flight"){
        const b = D.ball; stepBall(b, dt);
        const stopped = b.v.lengthSq() < .04 && b.m.position.y <= .111;
        const out = Math.abs(b.m.position.x) > 30 || b.m.position.z > 2 || b.m.position.z < -30;
        if (stopped || out || D.t > 6){
          const d = Math.hypot(b.m.position.x - D.tgt.x, b.m.position.z - D.tgt.z);
          const q = out ? 0 : Math.max(0, Math.min(1, 1 - (d - .35)/3.2));
          const toBall = Math.hypot(b.m.position.x - D.from.x, b.m.position.z - D.from.z), toTgt = Math.hypot(D.tgt.x - D.from.x, D.tgt.z - D.from.z);
          const why = q >= .9 ? "On the money" : toBall > toTgt + 1.2 ? "Overhit" : toBall < toTgt - 1.2 ? "Underhit" : "Off line";
          const x = award([["passacc", 5, 16], ["passing", 2, 6]], q);
          finishRep(q, q >= .9 ? why : `${why} · ${d.toFixed(1)} m`, `+${x} XP`);
        }
      }
      if (D.phase === "result" && D.t > 1.2) nextRep();
    };
    D.shoot = () => {
      if (D.phase !== "aim" || D.power < .06){ D.charging = false; D.power = 0; hudPower(null); KICK.idle(); return; }
      D.charging = false; hudPower(null);
      // the rings sit 9–13 m out: about a third to a half of the bar along the ground
      const loft = Math.max(0, Math.min(.75, H.P.pitch + .12)), dir = fwd(H.P.yaw, loft), sp = 4 + D.power*11;
      D.phase = "strike";
      KICK.go(() => { D.ball.v.copy(dir).multiplyScalar(sp); D.from = D.ball.m.position.clone(); D.phase = "flight"; D.t = 0; });
    };
  }

  /* ----- heading ----- */
  if (kind === "head"){
    const gx = PITCH.x1, cz = PITCH.cz, hw = PITCH.goalW/2, gh = PITCH.goalH;
    const ring = add(ringMesh(.45)); ring.rotation.y = -Math.PI/2;
    const machine = new THREE.Vector3(19.1, 1.2, -23.8);
    D.ball.m.position.copy(machine);
    const zones = [[-2, .6], [2, .6], [-1.8, 1.6], [1.8, 1.6], [0, 1.2]].sort(() => Math.random() - .5);
    const newRep = () => {
      const [z, y] = zones[D.rep % zones.length]; D.tgt = new THREE.Vector3(gx - .05, y, cz + z); ring.position.copy(D.tgt);
      D.phase = "wait"; D.t = 0; D.charge = 0; D.jump = null; D.hit = false; D.contact = null; H.act(null);
      D.ball.m.position.copy(machine); D.ball.v.set(0, 0, 0); D.ball.m.visible = true;
      setHint("Hold Space or the left button to load the jump · let go to leap · look where you want to head it");
    };
    D.newRep = newRep;
    const head = () => (H.P.eyeH || 1.62) + .1 + (D.jump ? D.jump.h : 0);
    D.update = dt => {
      D.t += dt;
      if (D.charging && !D.jump) D.charge = Math.min(1, D.charge + dt/.6);
      hudPower(D.charging && !D.jump ? D.charge : null);
      shadowFollow(bsh, D.ball.m);
      // the body: crouches as you load the jump, then the header itself, timed to the leap (contact near the top)
      if (D.jump){
        const j = D.jump; j.t += dt; j.h = Math.max(0, j.v0*j.t - .5*GRAV*j.t*j.t);
        if (j.t > .1 && j.h <= 0){ j.h = 0; if (!D.hit && D.phase !== "fly") j.done = true; }
        H.jump(j.h);
        const air = 2*j.v0/GRAV, k = Math.min(1, j.t/(air + .25));
        H.act(k < 1 ? {mode:"header", t:.25 + .75*k} : null);
      } else H.act(D.charging ? {mode:"header", t:.2*Math.min(1, D.charge*1.5)} : null);
      if (D.phase === "wait" && D.t > .9){
        // lobbed in from the corner to land on your head if you get up for it
        const T = 1.35, tgt = new THREE.Vector3(H.P.x, 2.28, H.P.z), dx = tgt.clone().sub(machine);
        D.ball.v.set(dx.x/T, (dx.y + .5*GRAV*T*T)/T, dx.z/T); D.phase = "lob"; D.t = 0;
      }
      if (D.phase === "lob"){
        const b = D.ball; b.v.y -= GRAV*dt; b.m.position.addScaledVector(b.v, dt);
        const hd = Math.hypot(b.m.position.x - H.P.x, b.m.position.z - H.P.z);
        const dy = b.m.position.y - head();
        if (hd < .55 && Math.abs(dy) < .32 + s.skills.heading*.0015){
          // met it: it goes where you are looking, with what you put into the jump
          const timing = Math.max(0, 1 - Math.abs(dy)/.34);
          const dir = fwd(H.P.yaw, H.P.pitch - .04), sp = 9 + s.skills.heading*.06 + D.charge*3;
          b.v.copy(dir).multiplyScalar(sp);
          D.phase = "fly"; D.hit = true; D.timing = timing; D.t = 0;
        } else if (b.m.position.y < .2 || (hd < .4 && dy < -.5)){ D.ball.m.visible = b.m.position.y > .2; const x = award([["jumping", 1, 0]], 0); finishRep(0, D.jump ? "Mistimed" : "You never got up", `+${x} XP`); }
      }
      if (D.phase === "fly"){
        const b = D.ball, px = b.m.position.x; stepBall(b, dt);
        if (px < gx && b.m.position.x >= gx){
          const z = b.m.position.z, y = b.m.position.y, inFrame = Math.abs(z - cz) < hw - .11 && y < gh - .11;
          const d = Math.hypot(z - D.tgt.z, y - D.tgt.y), aim = inFrame ? Math.max(0, 1 - (d - .3)/1.6) : 0;
          if (inFrame) b.v.multiplyScalar(.25);
          const q = D.timing*.45 + aim*.55;
          const x = award([["heading", 5, 14], ["jumping", 2, 7*D.timing]], q);
          finishRep(q, inFrame ? `${PRAISE(q)} · ${d.toFixed(2)} m off` : "Off target", `+${x} XP`);
        } else if (D.t > 2.4 && D.phase === "fly"){ const x = award([["heading", 3, 0], ["jumping", 1, 6*D.timing]], D.timing*.3); finishRep(D.timing*.3, "Met it, but off target", `+${x} XP`); }
      }
      if (D.phase === "result" && D.t > 1.4){ H.jump(0); nextRep(); }
    };
    D.shoot = () => {
      if (D.jump || (D.phase !== "lob" && D.phase !== "wait")){ D.charging = false; return; }
      D.charging = false;
      const c = Math.max(.15, D.charge);
      D.jump = {t:0, h:0, v0:2.1 + c*2.4 + s.skills.jumping*.012};
    };
  }

  /* ----- interception ----- */
  if (kind === "intercept"){
    const machine = new THREE.Vector3(12.1, .11, -7.6);
    const gates = [-5.6, -7.6, -9.6];
    const lamp = add(new THREE.Mesh(new THREE.SphereGeometry(.12, 12, 8), mats().lamp));
    D.moveBox = {x0:3.6, x1:6.4, z0:-10.6, z1:-4.6};
    const newRep = () => {
      D.phase = "tell"; D.t = 0; D.gate = gates[Math.floor(Math.random()*3)] + rand(-.3, .3);
      lamp.position.set(-1.5, .55, D.gate); lamp.visible = true;
      D.ball.m.position.copy(machine); D.ball.v.set(0, 0, 0);
      setHint("Watch the red light: that is where the pass is going · move with A and D · get in the lane");
    };
    D.newRep = newRep;
    D.update = dt => {
      D.t += dt;
      lamp.material.color.setHex(Math.sin(D.t*16) > 0 ? 0xff5a4a : 0x6a1f1a);
      shadowFollow(bsh, D.ball.m);
      if (D.trap != null){ D.trap = Math.min(1, D.trap + dt/.6); H.act(D.trap < 1 ? {mode:"trap", t:D.trap} : null); if (D.trap >= 1) D.trap = null; }
      if (D.phase === "tell" && D.t > .75 - Math.min(.3, D.rep*.04)){
        const sp = rand(8.5, 11) + D.rep*.4, dx = new THREE.Vector3(-1.5 - machine.x, 0, D.gate - machine.z).normalize();
        D.ball.v.copy(dx).multiplyScalar(sp); D.phase = "pass"; D.t = 0; lamp.visible = false;
      }
      if (D.phase === "pass"){
        const b = D.ball, px = b.m.position.x; stepBall(b, dt);
        if (px > H.P.x && b.m.position.x <= H.P.x){
          const d = Math.abs(b.m.position.z - H.P.z), reach = .72 + s.skills.interception*.005;
          if (d < reach){
            const q = Math.max(.35, 1 - d/reach*.65);
            // cut out at your feet: the ball dies under your boot on the side it came
            b.v.set(0, 0, 0); b.m.position.set(H.P.x - .42, .11, H.P.z + Math.max(-.2, Math.min(.2, b.m.position.z - H.P.z))); D.trap = 0;
            const x = award([["interception", 6, 14], ["tackling", 1, 3], ["pace", 1, 1]], q);
            finishRep(q, q > .8 ? "Read it perfectly" : "Got a foot to it", `+${x} XP`);
          } else {
            const x = award([["interception", 1, 0]], 0);
            finishRep(0, d < reach + .6 ? "A step short" : "Through you", `+${x} XP`);
          }
        }
      }
      if (D.phase === "result" && D.t > 1.1) nextRep();
    };
    D.shoot = () => {};
  }

  const nextRep = () => {
    D.rep++;
    if (D.rep >= D.reps) return finish();
    D.newRep(); hudSet(D);
  };
  const finish = () => {
    D.phase = "done";
    const avg = D.scores.reduce((a, b) => a + b, 0)/Math.max(1, D.scores.length);
    exert(6, 5);
    s.today.trainMin += 30;
    H.pass(30, "train");
    endDrill(D);
    if (typeof FEED === "object") FEED.center(`${D.title} complete`, `${Math.round(avg*100)}% average · +${D.xp} XP`, {kind:"drill", icon:"✓", ms:2400});
    if (typeof save === "function") save();
  };
  D.finish = finish;
  D.input = (type, k) => {
    if (D.phase === "done") return;
    if (type === "down" && (k === "mouse" || k === " ")){ if (kind === "intercept") return; D.charging = true; }
    if (type === "up" && (k === "mouse" || k === " ")){ if (D.charging || kind === "head") D.shoot(); }
    if (type === "down" && k === "escape"){ quitDrill(D); }
  };
  hudSet(D, {hint:""});
  D.newRep(); hudSet(D);
  return D;
}
function endDrill(D){
  hudPower(null); hudTiming(false); hudClose();
  for (const o of D.objs){ W.scene.remove(o); o.traverse(n => { if (n.geometry) n.geometry.dispose(); }); }
  D.H.jump(0); D.H.act(null);
  D.H.endDrill();
}
// leaving early: you keep what you earned, and the time you spent
function quitDrill(D){
  if (D.phase === "done") return;
  D.phase = "done";
  const done = D.scores.length;
  if (done){ exert(done, done); G().today.trainMin += done*5; D.H.pass(done*5, "train"); }
  endDrill(D);
  D.H.note(done ? `Stopped after ${done} of ${D.reps}. You keep the ${D.xp} XP.` : "Drill cancelled.");
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
export function startReps(kind, H){
  const s = G(), set = SETS[kind];
  // the set is lived through the camera (a dip, a hop, a run on the spot): your own body would only get in the way of it
  const D = {kind, H, rep:0, reps:6, scores:[], xp:0, phase:"go", t:0, title:set.title, objs:[], allowMove:false, lockLook:true, hideBody:true};
  const sk = s.skills[set.main] || 30;
  const zone = () => ({c:.5 + Math.sin(D.rep*1.9)*.18, w:Math.max(.09, .2 + sk/700 - D.rep*.012)*(.7 + .3*trainEff())});
  D.z = zone(); D.m = 0; D.dir = 1;
  const speed = () => .75 + D.rep*.09;
  D.update = dt => {
    D.t += dt;
    if (D.phase === "go"){
      D.m += D.dir*speed()*dt;
      if (D.m > 1){ D.m = 1; D.dir = -1; } if (D.m < 0){ D.m = 0; D.dir = 1; }
      hudTiming(true, D.z, D.m);
      if (set.bob === "run") H.bob(Math.sin(D.t*11)*.03);
    }
    if (D.phase === "anim"){
      const k = Math.min(1, D.t/.55), y = set.bob === "dip" ? -Math.sin(k*Math.PI)*.38 : set.bob === "hop" ? Math.sin(k*Math.PI)*.55 : set.bob === "curl" ? -Math.sin(k*Math.PI)*.08 : Math.sin(D.t*11)*.04;
      H.bob(y);
      if (k >= 1){ H.bob(0); D.rep++; if (D.rep >= D.reps) return finish(); D.z = zone(); D.phase = "go"; D.t = 0; hudSet(D); }
    }
  };
  const press = () => {
    if (D.phase !== "go") return;
    const off = Math.abs(D.m - D.z.c), half = D.z.w/2;
    const q = off <= half ? .55 + .45*(1 - off/half) : off <= half*2 ? .25 : 0;
    let x = trainXP(set.main, 4 + 10*q); if (set.side && q > 0) x += trainXP(set.side[0], (1 + 3*q)*set.side[1]*3);
    D.xp += x; D.scores.push(q);
    hudResult(q >= .9 ? "Perfect rep" : q >= .55 ? "Good rep" : q > 0 ? "Sloppy" : "Missed it", `+${x} XP`, q >= .55);
    D.phase = "anim"; D.t = 0; hudSet(D);
  };
  const finish = () => {
    D.phase = "done"; hudTiming(false);
    const avg = D.scores.reduce((a, b) => a + b, 0)/Math.max(1, D.scores.length);
    exert(8, 7); s.today.trainMin += 45; H.pass(45, "train");
    hudClose(); H.bob(0); H.endDrill();
    if (typeof FEED === "object") FEED.center(`${set.title} · set done`, `${Math.round(avg*100)}% · +${D.xp} XP`, {kind:"drill", icon:"✓", ms:2200});
    if (typeof save === "function") save();
  };
  D.input = (type, k) => {
    if (D.phase === "done") return;
    if (type === "down" && (k === "mouse" || k === " " || k === "e")) press();
    if (type === "down" && k === "escape"){
      D.phase = "done"; hudTiming(false); hudClose(); H.bob(0);
      const done = D.scores.length; if (done){ exert(done*1.2, done); s.today.trainMin += done*7; H.pass(done*7, "train"); }
      H.endDrill(); H.note(done ? `Stopped after ${done} reps. You keep the ${D.xp} XP.` : "Set cancelled.");
    }
  };
  hudSet(D, {hint:"Press Space, E or click when the marker is in the green"});
  return D;
}

/* =============================== the team session =============================== */
const SESSION_SKILLS = {ST:["accuracy", "power", "heading", "pace"], W:["dribbling", "pace", "passacc", "accuracy"], AM:["passing", "passacc", "curve", "dribbling"],
  CM:["passing", "stamina", "interception", "tackling"], DF:["tackling", "interception", "heading", "passacc"]};
export function startSession(H){
  const s = G(), list = SESSION_SKILLS[s.player.pos] || SESSION_SKILLS.ST;
  const D = {kind:"session", H, t:0, xp:0, phase:"go", title:"Team session", objs:[], allowMove:false, lockLook:false, ticks:0, reps:6, rep:0, scores:[]};
  const drills = ["Rondo", "Pattern play", "Small-sided game", "Finishing", "Shape work", "Cool down"];
  D.update = dt => {
    if (D.phase !== "go") return;
    D.t += dt;
    const tick = Math.floor(D.t/1.1);
    while (D.ticks < tick && D.ticks < 6){
      const k = list[D.ticks % list.length];
      D.xp += trainXP(k, 7 + Math.random()*5);
      H.pass(15, "train");
      D.ticks++; D.rep = D.ticks; D.scores.push(.8);
      hudSet(D, {hint:drills[Math.min(5, D.ticks)] + " · being out there with the lads · Esc to step out"});
    }
    if (D.ticks >= 6 && D.phase === "go"){
      D.phase = "done";
      exert(12, 10);
      s.today.trainMin += 90; s.today.sessions++;
      // the dressing room notices who puts the work in; you will see it in the numbers later
      chemAdd(1.2*(1 - s.chem/130)); s.life.att.chem += 1.2; trustAdd(.4);
      hudClose(); H.endDrill();
      if (typeof FEED === "object") FEED.center("Session done", `+${D.xp} XP · the lads saw you put the work in`, {kind:"drill", icon:"✓", ms:2400});
      if (typeof save === "function") save();
    }
  };
  D.input = (type, k) => {
    if (type !== "down" || k !== "escape" || D.phase !== "go") return;
    // walking off early: you keep what you did, the extra chemistry only comes from seeing it through
    D.phase = "done";
    const done = D.ticks;
    if (done){ exert(done*2, done*1.6); s.today.trainMin += done*15; }
    hudClose(); H.endDrill();
    H.note(done ? `You left the session early. You keep the ${D.xp} XP.` : "You stepped out before it got going.");
    if (typeof save === "function") save();
  };
  hudSet(D, {hint:drills[0] + " · being out there with the lads · Esc to step out"});
  return D;
}
