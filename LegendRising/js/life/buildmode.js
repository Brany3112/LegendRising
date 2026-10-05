/* ============ LIFE: build mode ============
   B in your own flat. You step out of yourself: the camera goes up over the room, the ceiling is cut away (the near
   plane does it), and the mouse is a pointer again. Pick what to put down — a box in your hand or in a pocket — and a
   ghost of it follows the pointer over the floor: green where it fits, red where it does not (in a wall, in the
   bathroom, in the way of the door, in another piece). Click to put it down; R or the wheel turns it a quarter turn.
   Click something already standing in the room to pick it up and move it; X packs it back into a box. B or Esc and
   you are back in your own eyes. Everything you put down is saved where you put it (S.home.fx.furn). */
import {THREE, W} from "./build.js";
import {placed, placePiece, removePiece, footprint, pieceModel, flatOf} from "./furniture.js";
import * as INV from "./inv.js";

const G = () => (typeof S !== "undefined" ? S : null);
export const BM = {on:false};
let H = null;               // the world's handles (world.js): {cam, scene, canvas, P, note, persist, done}
let ui = null, ghost = null, sel = null, cur = {x:0, z:0, ok:false}, ry = 0, focus = {x:0, z:0}, mouse = {x:0, y:0, has:false}, hover = null;
const _r = new THREE.Raycaster(), _v = new THREE.Vector2(), _pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _hit = new THREE.Vector3();

export function buildInit(host){ H = host; }
// are you standing in your own flat (the only place build mode works)?
export function inOwnFlat(P){
  const F = flatOf(); if (!F || !H || H.zone() !== "home") return false;
  const z0 = Math.min(F.A.wz, F.A.ext), z1 = Math.max(F.A.wz, F.A.ext);
  return P.x > F.A.x0 && P.x < F.A.x1 && P.z > z0 && P.z < z1 && Math.abs(P.feet - F.base) < .6;
}
const boxes = () => { const c = INV.carry(); return [["hand", c.hand], [0, c.slots[0]], [1, c.slots[1]]].filter(([, it]) => it && it.id === "box" && FURN[it.fid]); };

export function buildEnter(){
  const P = H.P;
  if (BM.on) return;
  if (!inOwnFlat(P)){ H.note("Build mode works in your own flat. Bring the boxes home and press B there."); return; }
  BM.on = true; sel = null; ry = 0; hover = null;
  const F = flatOf();
  focus.x = (F.A.x0 + F.A.x1)/2; focus.z = F.A.wz + F.s*F.Dp*.55;
  document.exitPointerLock && document.exitPointerLock();
  document.body.classList.add("building");
  ui = document.getElementById("lifeBuild");
  if (!ui){ ui = document.createElement("div"); ui.id = "lifeBuild"; ui.className = "lf-build"; document.getElementById("lifeRoot").appendChild(ui); }
  ui.classList.add("on");
  const cv = H.canvas();
  cv.addEventListener("mousemove", onMove); cv.addEventListener("mousedown", onDown); cv.addEventListener("wheel", onWheel, {passive:false}); cv.addEventListener("contextmenu", noMenu);
  const first = boxes()[0]; if (first) choose(first[0]);
  render();
}
export function buildExit(){
  if (!BM.on) return;
  BM.on = false;
  dropGhost();
  if (sel && sel.q){ placePiece(sel.q.p); }          // a piece picked up and not put down: back where it was
  sel = null;
  const cv = H.canvas();
  cv.removeEventListener("mousemove", onMove); cv.removeEventListener("mousedown", onDown); cv.removeEventListener("wheel", onWheel); cv.removeEventListener("contextmenu", noMenu);
  document.body.classList.remove("building");
  if (ui) ui.classList.remove("on");
  H.done();
}
const noMenu = e => e.preventDefault();

/* ---------- choosing what to put down ---------- */
function choose(slot){
  dropGhost();
  if (sel && sel.q){ placePiece(sel.q.p); }
  const it = slot === "hand" ? INV.carry().hand : INV.carry().slots[slot];
  if (!it || it.id !== "box" || !FURN[it.fid]){ sel = null; render(); return; }
  sel = {slot, it, id:it.fid};
  makeGhost(it.fid);
  render();
}
function pickUp(q){
  dropGhost();
  if (sel && sel.q) placePiece(sel.q.p);
  removePiece(q);
  sel = {q, id:q.p.id};
  ry = q.p.ry;
  makeGhost(q.p.id);
  render();
}
const GOOD = new THREE.MeshBasicMaterial({color:0x6fe08a, transparent:true, opacity:.5, depthWrite:false}), BAD = new THREE.MeshBasicMaterial({color:0xff5a5f, transparent:true, opacity:.5, depthWrite:false});
function makeGhost(id){
  const m = pieceModel(id); if (!m) return;
  m.g.traverse(o => { if (o.isMesh){ o.material = GOOD; o.castShadow = false; } });
  ghost = m; H.scene().add(m.g);
}
function dropGhost(){ if (ghost){ H.scene().remove(ghost.g); ghost.g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); ghost = null; } }

/* ---------- where it may go ----------
   Inside the room's walls (past the skirting), out of the bathroom, clear of the swing of the front door and of the
   radiator under each window, and clear of every other piece — except a rug, which anything can stand on, and a laptop,
   which wants a table top (or the floor). */
function rules(id, x, z, r){
  const F = flatOf(), A = F.A, f = FURN[id], m = ghost;
  const b = footprint(x, z, r, m.w, m.len);
  const u0 = b.x0 - A.x0, u1 = b.x1 - A.x0, v0 = Math.min((b.z0 - A.wz)*F.s, (b.z1 - A.wz)*F.s), v1 = Math.max((b.z0 - A.wz)*F.s, (b.z1 - A.wz)*F.s);
  const Wd = A.x1 - A.x0, du = A.door - A.x0;
  if (u0 < .04 || u1 > Wd - .04 || v0 < .04 || v1 > F.Dp - .05) return "Against the wall — not in it";
  if (u0 < 2.15 && v0 < 2.35) return "That's the bathroom";
  if (!m.flat && u1 > du - .62 && u0 < du + .62 && v0 < 1.1) return "It would block the front door";
  for (const wx of winsOf(A)){ const ru = wx - A.x0; if (!m.flat && u1 > ru - .48 && u0 < ru + .48 && v1 > F.Dp - .17) return "In the way of the radiator"; }
  for (const q of placed){
    if (q.model.flat || m.flat) continue;
    if (f.kind === "laptop" && q.model.top) continue;           // a laptop on a table is where it belongs
    if (q.f.kind === "laptop" && m.top) continue;               // and a table can go under a laptop already there
    const o = footprint(q.wx, q.wz, q.p.ry, q.model.w, q.model.len);
    if (b.x1 > o.x0 + .01 && b.x0 < o.x1 - .01 && b.z1 > o.z0 + .01 && b.z0 < o.z1 - .01) return `In the way of the ${q.f.name.toLowerCase()}`;
  }
  return null;
}
const winsOf = A => { const w = A.x1 - A.x0; return [A.x0 + w*.3, A.x0 + w*.7]; };
// pull it flush against a wall when it is near one, on a 5 cm grid otherwise
function snap(x, z, r){
  const F = flatOf(), A = F.A, m = ghost;
  x = Math.round(x/.05)*.05; z = Math.round(z/.05)*.05;
  const b = footprint(x, z, r, m.w, m.len), hw = (b.x1 - b.x0)/2, hd = (b.z1 - b.z0)/2;
  const zw = A.wz + F.s*.05, ze = A.ext - F.s*.06, zlo = Math.min(zw, ze), zhi = Math.max(zw, ze);
  if (b.x0 - A.x0 < .25) x = A.x0 + .05 + hw;
  if (A.x1 - b.x1 < .25) x = A.x1 - .05 - hw;
  if (b.z0 - zlo < .25) z = zlo + hd;
  if (zhi - b.z1 < .25) z = zhi - hd;
  return [x, z];
}

/* ---------- the pointer ---------- */
function onMove(e){ const r = H.canvas().getBoundingClientRect(); mouse.x = (e.clientX - r.left)/r.width*2 - 1; mouse.y = -((e.clientY - r.top)/r.height*2 - 1); mouse.has = true; }
function onWheel(e){ e.preventDefault(); turn(e.deltaY > 0 ? 1 : -1); }
function turn(d){ ry = ((ry + d*Math.PI/2) % (Math.PI*2) + Math.PI*2) % (Math.PI*2); }
function onDown(e){
  if (e.button === 2){ turn(1); return; }
  if (e.button !== 0) return;
  if (ghost && sel){ put(); return; }
  if (hover) pickUp(hover);
}
function put(){
  const F = flatOf();
  if (!cur.ok){ H.note(cur.why || "It doesn't fit there."); return; }
  const fx = G().home.fx, f = FURN[sel.id];
  const p = sel.q ? sel.q.p : {id:sel.id};
  p.x = +(cur.x - F.A.x0).toFixed(3); p.z = +(cur.z - F.A.wz).toFixed(3); p.ry = ry;
  let gone = null;
  if (!sel.q){
    // a new bed or fridge takes the old one's place: the old one goes down to the bins
    if (f.kind === "bed" || f.kind === "fridge"){
      const old = placed.find(q => q.f.kind === f.kind);
      if (old){ gone = old.f.name; removePiece(old); fx.furn = fx.furn.filter(x => x !== old.p); }
    }
    fx.furn.push(p);
    if (sel.slot === "hand") INV.release(); else INV.removeWhere(it => it === sel.it);
  }
  dropGhost();
  placePiece(p);
  sel = null;
  H.note(gone ? `Done. The old ${gone.toLowerCase()} goes down to the bins.` : `${f.name} — set up.`);
  if (typeof FEED === "object") FEED.chip(`${f.name} placed`, "good");
  H.persist(true);
  const next = boxes()[0]; if (next) choose(next[0]); else render();
}
// X on a piece: back into a box, into your hands or a pocket (never the bed or the fridge: you need those)
function pack(q){
  if (!q) return;
  if (q.f.kind === "bed" || q.f.kind === "fridge") return H.note("You need a bed and a fridge. Buy a better one to replace it.");
  const it = {id:"box", fid:q.p.id, name:`${q.f.name} (boxed)`, dims:q.f.box, label:q.f.name};
  if (!INV.stow(it)) return H.note("Your hands and pockets are full.");
  removePiece(q); const fx = G().home.fx; fx.furn = fx.furn.filter(x => x !== q.p);
  H.note(`${q.f.name} packed back into its box.`); H.persist(true); render();
}
export function buildKey(k){
  if (k === "b" || k === "escape") return buildExit();
  if (k === "r") return turn(1);
  if (k === "1" || k === "2"){ const s = +k - 1; if (INV.carry().slots[s] && INV.carry().slots[s].id === "box") choose(s); return; }
  if (k === "h" || k === "e"){ const h = INV.carry().hand; if (h && h.id === "box") choose("hand"); return; }
  if (k === "x"){ if (hover && !ghost) pack(hover); return; }
}
export function buildPan(keys, dt){
  const F = flatOf(); if (!F) return;
  const sp = 3*dt;
  if (keys.w) focus.z -= sp; if (keys.s) focus.z += sp; if (keys.a) focus.x -= sp; if (keys.d) focus.x += sp;
  focus.x = Math.max(F.A.x0, Math.min(F.A.x1, focus.x));
  const z0 = Math.min(F.A.wz, F.A.ext), z1 = Math.max(F.A.wz, F.A.ext); focus.z = Math.max(z0, Math.min(z1, focus.z));
}

/* ---------- every frame: the camera over the room, the ghost under the pointer ---------- */
export function buildStep(dt, cam){
  const F = flatOf(); if (!F) return;
  // straight down over the room, a touch tilted so things read as things; the near plane cuts the ceiling away
  const h = 6.2, back = 1.6;
  cam.position.set(focus.x, F.base + h, focus.z + back);
  cam.lookAt(focus.x, F.base, focus.z - .2);
  const want = h - 2.55;
  if (Math.abs(cam.near - want) > .01){ cam.near = want; cam.fov = 58; cam.updateProjectionMatrix(); }
  cam.updateMatrixWorld();
  if (!mouse.has) return;
  _v.set(mouse.x, mouse.y); _r.setFromCamera(_v, cam);
  _pl.constant = -F.base;
  if (!_r.ray.intersectPlane(_pl, _hit)) return;
  if (ghost && sel){
    const [x, z] = snap(_hit.x, _hit.z, ry);
    const why = rules(sel.id, x, z, ry);
    cur = {x, z, ok:!why, why};
    let y = F.base;
    if (FURN[sel.id].kind === "laptop"){
      for (const q of placed) if (q.model.top){ const o = footprint(q.wx, q.wz, q.p.ry, q.model.w, q.model.len); if (x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1) y = F.base + q.model.top; }
    }
    ghost.g.position.set(x, y, z); ghost.g.rotation.y = ry;
    const mt = cur.ok ? GOOD : BAD; ghost.g.traverse(o => { if (o.isMesh && o.material !== mt) o.material = mt; });
    hint(cur.ok ? `Click to put it here · R or the wheel turns it` : cur.why);
  } else {
    // nothing chosen: what is under the pointer can be picked up and moved
    hover = null;
    for (const q of placed){ const o = footprint(q.wx, q.wz, q.p.ry, q.model.w, q.model.len); if (_hit.x > o.x0 && _hit.x < o.x1 && _hit.z > o.z0 && _hit.z < o.z1 && (!hover || hover.model.flat)) hover = q; }
    hint(hover ? `${hover.f.name} · click to move it${hover.f.kind === "bed" || hover.f.kind === "fridge" ? "" : " · X to pack it into its box"}` : boxes().length ? "Pick a box below — or click a piece in the room to move it" : "Click a piece in the room to move it");
  }
}
function hint(t){ const el = ui && ui.querySelector(".bm-hint"); if (el && el.textContent !== t) el.textContent = t; }
function render(){
  if (!ui) return;
  const c = INV.carry(), cell = (slot, it, key) => {
    const ok = it && it.id === "box" && FURN[it.fid], on = sel && !sel.q && sel.slot === slot;
    return `<button class="bm-cell${on ? " on" : ""}${ok ? "" : " empty"}" ${ok ? `onclick="lifeBuildChoose('${slot}')"` : "disabled"}><kbd>${key}</kbd><span>${ok ? "📦" : ""}</span><b>${ok ? FURN[it.fid].name : it ? "—" : "Empty"}</b></button>`;
  };
  ui.innerHTML = `<div class="bm-top"><b>BUILD MODE</b><span class="bm-hint"></span></div>
    <div class="bm-bar">${cell(0, c.slots[0], "1")}${cell("hand", c.hand, "H")}${cell(1, c.slots[1], "2")}</div>
    <div class="bm-keys"><span><kbd>LMB</kbd> place / move</span><span><kbd>R</kbd> or wheel · turn</span><span><kbd>X</kbd> pack into a box</span><span><kbd>WASD</kbd> look around</span><span><kbd>B</kbd> / <kbd>Esc</kbd> done</span></div>`;
}
window.lifeBuildChoose = s => choose(s === "hand" ? "hand" : +s);
