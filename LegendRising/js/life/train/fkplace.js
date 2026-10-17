/* ============ Training Mode: the free kick's placement (build mode) ============
   Owner: P7-A (Training Mode Phase 7: free kicks build mode and set-piece AI). Contract: BUILD-PLAN P7-A work items 2
   to 4 (place the ball, place the wall independently, confirm and start); TRAINING-SPEC 4 (configure, place, confirm,
   start) and 5 (Free kicks).

   Every free kick scenario (scen-freekick.js FREEKICKS) is registered here with the placement in front of its go. When
   it starts (from the configuration sheet, a preset, Replay Last), the simulation is held (runner.js setPaused), the
   pointer is let go, and a card comes up over the pitch, the 3D view left showing:
     Step 2, the ball: its distance and angle from the goal, only valid places (outside the penalty area, inside the
       lines: scen-freekick.js ballSpot), with a live "Distance to goal" as it moves; a ring on the grass marks the
       preview. Confirm Ball Position puts the real ball there.
     Step 3, the wall: on or off, its size, its distance from the ball, its offset across and its alignment, with a
       live "Distance from ball" (and the ball's own distance); the preview is a ring for each man, the confirmed wall
       the men themselves. Confirm Wall Position moves them. Nothing done to the wall ever moves the confirmed ball.
     Step 4: Adjust Placement opens both again; Start Free Kick (only once both are confirmed) lets play go.
   A confirm goes through the runner's own way of changing a running scenario (queueChange, then restart: a new start
   from the changed configuration, its setup made again, the same pooled bodies), so the configuration (and a preset
   saved from it) holds exactly what was placed. Retries of a started free kick go straight to the kick; the pause
   card's Adjust Free Kick Placement brings the card back.

   Its keys stop here while it is up (nothing reaches the game). Esc and Back to settings return to the configuration
   sheet. The rings are a few small meshes, made when the card comes up and disposed when it goes. */
import {THREE, W} from "../build.js";
import {registerScenario, RUN, restart, setPaused, queueChange, stopScenario} from "./runner.js";
import {configureScenario} from "./hub.js";
import {addItem, quickClose} from "./quick.js";
import {allowed} from "./config.js";
import {FK, FREEKICKS, ALIGN_NAMES, scenarioOf, uiOf, placeState, previewBall, confirmBall, previewWall, confirmWall, adjust, canStart, measures, applyPlace} from "./scen-freekick.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
const f1 = v => v == null ? "none" : (+v).toFixed(1) + " m";
const FKS = {run:null, S:null, keep:null, root:null, key:null, marks:null, open:false, note:""};

/* ---------- the scenarios, the placement in front of each go ---------- */
function gate(T, run){
  if (run.fkGo) return true;
  if (FKS.run === run) return false;
  FKS.run = run;
  const keep = FKS.keep && FKS.keep.id === run.id ? FKS.keep.S : null;
  FKS.keep = null;
  FKS.S = keep || placeState(run.config, T.spec);
  FKS.S.spec = T.spec;
  if (keep) FKS.S.maxWall = Math.max(...allowed("freekick", run.config, "wall"));
  openCard();
  return false;
}
for (const d of FREEKICKS){
  const base = scenarioOf(d);
  registerScenario(Object.assign({}, base, {
    step:(T, run) => { if (run && gate(T, run)) base.step(T, run); },
    judge:(T, run) => run && run.fkGo ? base.judge(T, run) : null,
    ui:(T, run) => {
      const u = uiOf(run && run.setup);
      if (run && !run.fkGo) return {lines:["Place the ball, then the wall. Start when both are confirmed."], keys:null};
      return u;
    }}));
}
// the pause card: the placement again (the go stops; Start plays from the new places)
addItem({id:"fk-adjust", label:"Adjust Free Kick Placement", group:"scenario", order:25,
  when:run => !!run && !!run.sc && run.sc.type === "freekick" && !!run.fkGo,
  run(run){ quickClose(); run.fkGo = false; FKS.run = null; FKS.keep = {id:run.id, S:Object.assign(placeState(run.config, run.T.spec), {spec:run.T.spec})}; restart(); }});

/* ---------- the card ---------- */
function rootEl(){
  if (FKS.root && FKS.root.isConnected) return FKS.root;
  const r = document.createElement("div");
  r.id = "fkPlace"; r.className = "fkp-layer";
  r.setAttribute("role", "dialog"); r.setAttribute("aria-label", "Free kick placement");
  r.addEventListener("click", click);
  r.addEventListener("input", input);
  document.body.appendChild(r);
  FKS.root = r;
  return r;
}
const seg = (k, vals, cur, name, dis) => `<div class="seg wrap" role="group">${vals.map(v => `<button type="button" data-fkp="set" data-k="${k}" data-v="${esc(String(v))}" aria-pressed="${v === cur}"${dis ? " disabled" : ""}>${esc(name(v))}</button>`).join("")}</div>`;
const range = (k, min, max, step, v, label, dis) => `<label class="fkp-range"><span>${esc(label)}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-fkp-in="${k}" aria-label="${esc(label)}"${dis ? " disabled" : ""}><output data-fkp-val="${k}"></output></label>`;
function html(){
  const S = FKS.S, M = measures(S), b = S.ball, w = S.wall;
  const ballOpen = !S.ballOk, wallOpen = S.ballOk;
  const ang = Math.abs(b.ang) < 0.5 ? "straight on" : `${Math.round(Math.abs(b.ang))} degrees ${b.ang > 0 ? "right" : "left"}`;
  const step = !S.ballOk ? 2 : !S.wallOk ? 3 : 4;
  const sizes = []; for (let i = 0; i <= S.maxWall; i++) sizes.push(i);
  return `<div class="fkp glass">
    <h3>Free kick: placement</h3>
    <div class="fkp-body">
    <ol class="fkp-steps"><li class="${step === 2 ? "on" : "done"}">Ball</li><li class="${step === 3 ? "on" : step > 3 ? "done" : ""}">Wall</li><li class="${step === 4 ? "on" : ""}">Start</li></ol>
    <section class="fkp-sec${ballOpen ? " on" : " done"}">
      <h4>The ball${S.ballOk ? " <span class=\"fkp-ok\">confirmed</span>" : ""}</h4>
      ${ballOpen ? range("dist", FK.DMIN, FK.DMAX, 0.1, b.dist, "Distance", false) + range("ang", -FK.AMAX, FK.AMAX, 1, b.ang, "Angle", false) : ""}
      <p class="fkp-read">Distance to goal: <b data-fkp-out="ballGoal">${f1(M.ballGoal)}</b> <span class="muted" data-fkp-out="ang">${esc(ang)}</span></p>
      ${ballOpen ? `<p class="muted small">Only places a free kick can be taken from: outside the penalty area, inside the lines.</p>
      <button type="button" class="btn" data-fkp="confirmBall">Confirm Ball Position</button>` : ""}
    </section>
    <section class="fkp-sec${S.wallOk ? " done" : wallOpen ? " on" : " off"}">
      <h4>The wall${S.wallOk ? " <span class=\"fkp-ok\">confirmed</span>" : ""}</h4>
      ${seg("on", [true, false], w.on, v => v ? "Wall up" : "No wall", !wallOpen)}
      <div class="fkp-row"><span>Players in it</span>${seg("n", sizes, w.n, String, !wallOpen || !w.on)}</div>
      ${range("wdist", FK.WDMIN, FK.WDMAX, 0.05, w.dist, "Distance from the ball", !wallOpen || !w.on)}
      ${range("woff", -FK.WOFF, FK.WOFF, 0.05, w.off, "Offset across", !wallOpen || !w.on)}
      ${seg("align", ["post", "centre"], w.align, v => ALIGN_NAMES[v], !wallOpen || !w.on)}
      <p class="fkp-read">Distance from ball: <b data-fkp-out="wallBall">${M.wallBall == null ? "no wall" : f1(M.wallBall)}</b> <span class="muted">Ball to goal: <b data-fkp-out="ballGoal2">${f1(M.ballGoal)}</b></span></p>
      <p class="muted small">${S.ballOk ? "The rings on the grass are the preview. Confirm puts the wall there." : "Confirm the ball first."}</p>
      <button type="button" class="btn" data-fkp="confirmWall"${wallOpen && !S.wallOk ? "" : " disabled"}>Confirm Wall Position</button>
    </section>
    </div>
    <p class="fkp-note small" data-fkp-out="note" aria-live="polite">${esc(FKS.note)}</p>
    <div class="fkp-foot">
      <button type="button" class="btn ghost" data-fkp="back">Back to settings</button>
      <button type="button" class="btn ghost" data-fkp="adjust"${S.ballOk ? "" : " disabled"}>Adjust Placement</button>
      <span class="grow"></span>
      <button type="button" class="btn" data-fkp="start" aria-disabled="${!canStart(S)}"${canStart(S) ? "" : " data-blocked=\"1\""}>Start Free Kick</button>
    </div></div>`;
}
function draw(){ const r = rootEl(); r.innerHTML = html(); vals(); marks(); }
// the live readings and the slider values, in place (a slider being dragged is never redrawn under the pointer)
function vals(){
  const r = FKS.root, S = FKS.S; if (!r || !S) return;
  const M = measures(S), set = (k, t) => { const e = r.querySelector(`[data-fkp-out="${k}"]`); if (e) e.textContent = t; };
  set("ballGoal", f1(M.ballGoal)); set("ballGoal2", f1(M.ballGoal)); set("wallBall", M.wallBall == null ? "no wall" : f1(M.wallBall));
  const a = S.ball.ang; set("ang", Math.abs(a) < 0.5 ? "straight on" : `${Math.round(Math.abs(a))} degrees ${a > 0 ? "right" : "left"}`);
  const out = (k, t) => { const e = r.querySelector(`[data-fkp-val="${k}"]`); if (e) e.textContent = t; };
  out("dist", S.ball.dist.toFixed(1) + " m"); out("ang", Math.round(S.ball.ang) + "°"); out("wdist", S.wall.dist.toFixed(2) + " m"); out("woff", (S.wall.off > 0 ? "+" : "") + S.wall.off.toFixed(2) + " m");
}
function input(e){
  const t = e.target, k = t && t.dataset ? t.dataset.fkpIn : null; if (!k || !FKS.S) return;
  const v = +t.value;
  const was = FKS.S.wallOk;
  if (k === "dist" || k === "ang") previewBall(FKS.S, k === "dist" ? {dist:v} : {ang:v});
  else if (k === "wdist") previewWall(FKS.S, {dist:v});
  else if (k === "woff") previewWall(FKS.S, {off:v});
  // (a confirmed wall changed: its step is open again, the card says so)
  if (was && !FKS.S.wallOk) draw(); else { vals(); marks(); }
}
function click(e){
  const b = e.target.closest ? e.target.closest("[data-fkp]") : null; if (!b || !FKS.S) return;
  const S = FKS.S, what = b.dataset.fkp;
  FKS.note = "";
  if (what === "set"){
    const k = b.dataset.k, v = b.dataset.v;
    if (k === "on") previewWall(S, {on:v === "true"});
    else if (k === "n") previewWall(S, {n:+v});
    else if (k === "align") previewWall(S, {align:v});
    draw();
  }
  else if (what === "confirmBall"){ if (confirmBall(S)) commit(); }
  else if (what === "confirmWall"){ if (confirmWall(S)) commit(); }
  else if (what === "adjust"){ adjust(S); draw(); }
  else if (what === "start") start();
  else if (what === "back") back();
}
// a confirm: the placement into the configuration, and the scenario started again from it (the card stays up)
function commit(){
  const run = RUN.cur; if (!run || run !== FKS.run) return;
  const S = FKS.S;
  queueChange({key:"fk-place", label:"Free kick placement", apply:c => applyPlace(c, S)});
  FKS.keep = {id:run.id, S};
  FKS.run = null;
  marksClear();
  restart();
}
function start(){
  const run = RUN.cur, S = FKS.S;
  if (!canStart(S)){ FKS.note = !S.ballOk ? "Confirm the ball's position first." : "Confirm the wall's position first."; const n = FKS.root && FKS.root.querySelector('[data-fkp-out="note"]'); if (n) n.textContent = FKS.note; return false; }
  if (!run || run !== FKS.run) return false;
  S.go = true; run.fkGo = true;
  closeCard(true);
  setPaused(false);
  return true;
}
function back(){
  const run = RUN.cur; if (!run) { closeCard(true); return; }
  const id = run.id, cfg = JSON.parse(JSON.stringify(run.config));
  closeCard(false);
  stopScenario("config");
  configureScenario(id, cfg);
}
function onKey(e){
  if (!FKS.open) return;
  e.stopPropagation();
  if (e.type === "keydown" && e.key === "Escape"){ e.preventDefault(); back(); }
}
function openCard(){
  setPaused(true);
  if (!FKS.open){
    FKS.open = true;
    if (window.lifeModalSet) window.lifeModalSet(true);
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch(e){ /* nothing held */ }
    FKS.key = onKey;
    addEventListener("keydown", FKS.key, true); addEventListener("keyup", FKS.key, true);
  }
  draw();
}
function closeCard(release = true){
  marksClear();
  if (FKS.key){ removeEventListener("keydown", FKS.key, true); removeEventListener("keyup", FKS.key, true); FKS.key = null; }
  if (FKS.root){ FKS.root.remove(); FKS.root = null; }
  const was = FKS.open;
  FKS.open = false;
  if (was && release && window.lifeModalSet) window.lifeModalSet(false);
}

/* ---------- the preview on the grass: a ring for the ball, one for each man of the wall ---------- */
const RING = {geo:null, mat:null, matB:null};
function ringMesh(r, m){ const g = new THREE.RingGeometry(r*0.78, r, 28); g.rotateX(-Math.PI/2); return new THREE.Mesh(g, m); }
function marks(){
  const S = FKS.S, run = FKS.run; if (!S || !run || !run.T || !W.scene) return;
  const F = run.T.F || {cx:0, cz:0}, M = measures(S);
  if (!FKS.marks){
    RING.mat = RING.mat || new THREE.MeshBasicMaterial({color:0xffd75a, transparent:true, opacity:0.85, depthWrite:false});
    RING.matB = RING.matB || new THREE.MeshBasicMaterial({color:0xc8f060, transparent:true, opacity:0.9, depthWrite:false});
    const g = new THREE.Group(); g.name = "fkPlaceMarks";
    g.add(ringMesh(0.42, RING.matB));
    for (let i = 0; i < 6; i++) g.add(ringMesh(0.36, RING.mat));
    W.scene.add(g);
    FKS.marks = g;
  }
  const g = FKS.marks, ball = g.children[0];
  ball.visible = !S.ballOk; ball.position.set(M.ball.x + F.cx, 0.03, M.ball.z + F.cz);
  for (let i = 0; i < 6; i++){
    const m = g.children[i + 1], q = M.wall[i];
    m.visible = !!q && S.ballOk && !S.wallOk;
    if (q) m.position.set(q.x + F.cx, 0.03, q.z + F.cz);
  }
}
function marksClear(){
  const g = FKS.marks; if (!g) return;
  g.parent && g.parent.remove(g);
  for (const m of g.children) m.geometry.dispose();
  FKS.marks = null;
}

// leaving Training or the scenario ending takes the card with it
if (typeof addEventListener === "function"){
  addEventListener("train:exit", () => { FKS.run = null; FKS.keep = null; closeCard(true); });
  addEventListener("train:scenario", e => { const d = e.detail || {}; if (d.state === "stopped" && d.reason !== "restart" && FKS.open){ FKS.run = null; closeCard(d.reason !== "config"); } });
}
// tests (DESIGN 1.4.20 style)
if (typeof window !== "undefined") window.__fkPlace = {FKS, start, back, commit, open:() => FKS.open, state:() => FKS.S,
  ball:(o) => { const ok = previewBall(FKS.S, o); vals(); marks(); return ok; }, wall:(o) => { const ok = previewWall(FKS.S, o); draw(); return ok; },
  confirmBall:() => confirmBall(FKS.S) && (commit(), true), confirmWall:() => confirmWall(FKS.S) && (commit(), true), adjust:() => { adjust(FKS.S); draw(); return true; },
  canStart:() => canStart(FKS.S), measures:() => measures(FKS.S), marks:() => FKS.marks ? FKS.marks.children.filter(m => m.visible).length : 0};
