/* ============ LIFE: what you carry ============
   Your hand and two pockets. A left click on something you can pick up puts it in your HAND. Pressing 1 or 2 moves
   what is in your hand into that pocket, swapping with whatever was in it; pressing the same key with your hand empty
   takes it back out. G puts down what is in your hand: it flies, bounces and settles where it lands, and stays there
   (in that place, through saves) until you pick it up again. Nothing you carry is ever deleted by the game.
   Some things only travel in your hands (pocket:false): a Foodies bag, a furniture box, the football. A pocket will
   not take them; taking anything out of a pocket always works, so an older save with a bag in one is never stuck.

   S.carry = {hand, slots:[a, b]}, each null or an item {id, ...data}
   S.drops = [{zone, x, y, z, ry, item}]: things lying about in the world

   Owner: WP-G (Stage 1). Contracts: DESIGN 3.8.1 (the football as an item: data and the pocket rule), 3.8.5
   (pockets), 3.7.4 (lifeOnb events "take", "swap", "release"; hand.js sends "throw").
   The world (core/hand.js) draws what is in your hand and throws things; this module is the state, the items' looks
   and the bar along the bottom of the screen. */
import {THREE, part, roundedBoxGeo, mergeGeos, mat, lmat} from "./build.js";
import {ballMesh} from "./ground.js";

const G = () => (typeof S !== "undefined" ? S : null);
const esc = t => String(t).replace(/[&<>"]/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;"}[c]));

/* ---------- the things there are ----------
   name, a small icon for the bar, how it is held (pos: in front of the eye, metres right/up/forward; rot: a tilt),
   and its model. big: carried in both arms, in front of you (a furniture box). pocket:false: hands only. twoHands:
   held in both hands in front of you (the ball). physics: it rolls and bounces as a ball does once it is down
   (core/hand.js; the ball's own integrator arrives with WP-H2). r: the radius it rests on */
const canvasTex = (w, h, draw) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
export const ITEMS = {
  plate:{name:"Room number", icon:"🔢", hold:{pos:[.19, -.19, -.46], rot:[-.25, -.3, 0]}, mesh:it => plateMesh(it.text || "")},
  bulb:{name:"Light bulb", icon:"💡", hold:{pos:[.19, -.17, -.42], rot:[.2, 0, .2]}, mesh:() => bulbMesh()},
  lock:{name:"Door lock", icon:"🔒", hold:{pos:[.19, -.18, -.44], rot:[0, -.5, 0]}, mesh:() => lockMesh()},
  paper:{name:"Wallpaper", icon:"🧻", hold:{pos:[.2, -.2, -.5], rot:[0, 0, 1.2]}, mesh:it => rollMesh(it.col || 0xd8c8a8)},
  bag:{name:"Foodies bag", icon:"🛍", pocket:false, hold:{pos:[.2, -.3, -.5], rot:[0, -.2, 0]}, mesh:() => bagMesh()},
  box:{name:"Furniture box", icon:"📦", big:true, pocket:false, hold:{pos:[0, -.42, -.62], rot:[0, 0, 0]}, mesh:it => boxMesh(it.dims || [.7, .45, .5], it.label || "")},
  tool:{name:"Screwdriver", icon:"🪛", hold:{pos:[.2, -.18, -.42], rot:[.3, 0, .8]}, mesh:() => toolMesh()},
  ball:{name:"Football", icon:"⚽", pocket:false, twoHands:true, physics:true, r:.11, hold:{pos:[0, -.36, -.5], rot:[0, 0, 0]}, mesh:() => ballMesh()}
};
export function itemName(it){ if (!it) return ""; const d = ITEMS[it.id]; return it.name || (d ? d.name : it.id); }
// will it go in a pocket? (bags, boxes and the ball travel in your hands)
export const pocketable = it => !!it && !(ITEMS[it.id] && ITEMS[it.id].pocket === false);
export const POCKET_NO = "That won't fit in a pocket. Carry it in your hands, or press G to put it down.";
const onb = (ev, data) => { if (typeof window !== "undefined" && typeof window.lifeOnb === "function") window.lifeOnb(ev, data); };

function plateMesh(text){
  const t = canvasTex(128, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#d9b46a"); gr.addColorStop(1, "#a8823e"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#6b4f1e"; g.lineWidth = 5; g.strokeRect(3, 3, w - 6, h - 6); g.fillStyle = "#2a1d0a"; g.font = "bold 40px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, w/2, h/2 + 2); });
  const m = new THREE.Mesh(new THREE.BoxGeometry(.16, .08, .008), [lmat(0xa8823e), lmat(0xa8823e), lmat(0xa8823e), lmat(0xa8823e), mat({map:t, roughness:.35, metalness:.4}), lmat(0x8a6a30)]);
  return m;
}
function bulbMesh(){
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.SphereGeometry(.03, 14, 10), mat({color:0xfff8e8, roughness:.1, transparent:true, opacity:.75, emissive:0x332a10}));
  glass.scale.set(1, 1.15, 1); glass.position.y = .038; g.add(glass);
  g.add(part(new THREE.CylinderGeometry(.013, .017, .02, 12).translate(0, .006, 0), 0xb9bec2, {mat:{metalness:.8, roughness:.3}}));
  for (let i = 0; i < 3; i++) g.add(part(new THREE.TorusGeometry(.0135, .0018, 4, 12).rotateX(Math.PI/2).translate(0, -.002 + i*.006, 0), 0x9aa0a4, {mat:{metalness:.8}}));
  return g;
}
function lockMesh(){
  const g = new THREE.Group();
  g.add(part(roundedBoxGeo(.07, .1, .03, .008, 1), 0xc9a24a, {mat:{metalness:.7, roughness:.3}}));
  g.add(part(new THREE.CylinderGeometry(.012, .012, .036, 12).rotateX(Math.PI/2).translate(0, .015, .0), 0x8f979e, {mat:{metalness:.8}}));
  g.add(part(roundedBoxGeo(.012, .03, .006, .002, 1).translate(0, -.025, .017), 0x2a2e33));
  return g;
}
function rollMesh(col){
  const g = new THREE.Group();
  const t = canvasTex(64, 64, (c, w, h) => { c.fillStyle = "#" + col.toString(16).padStart(6, "0"); c.fillRect(0, 0, w, h); c.fillStyle = "rgba(0,0,0,.12)"; for (let x = 0; x < w; x += 12) c.fillRect(x, 0, 5, h); });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .5, 16), mat({map:t, roughness:.8})));
  g.add(part(new THREE.CylinderGeometry(.014, .014, .502, 8), 0xc8b08a));
  return g;
}
function bagMesh(){
  const g = new THREE.Group();
  const t = canvasTex(128, 128, (c, w, h) => { c.fillStyle = "#c79a5a"; c.fillRect(0, 0, w, h); c.fillStyle = "#e8452f"; c.beginPath(); c.arc(w/2, h*.52, 30, 0, 7); c.fill();
    c.fillStyle = "#fff"; c.font = "bold 22px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("Foodies", w/2, h*.53); });
  const mt = mat({map:t, roughness:.9}), side = lmat(0xb88a4c);
  g.add(new THREE.Mesh(new THREE.BoxGeometry(.24, .28, .14).translate(0, .14, 0), [side, side, side, side, mt, mt]));
  const hm = lmat(0x8a6a3c);
  for (const z of [-.04, .04]) g.add(new THREE.Mesh(new THREE.TorusGeometry(.05, .006, 5, 12, Math.PI).translate(0, .28, z), hm));
  return g;
}
function boxMesh(d, labelText){
  const [w, h, l] = d;
  const t = canvasTex(256, 160, (c, W2, H2) => { c.fillStyle = "#b98d55"; c.fillRect(0, 0, W2, H2); c.fillStyle = "rgba(0,0,0,.08)"; c.fillRect(0, H2*.45, W2, H2*.1);
    c.strokeStyle = "rgba(60,40,20,.5)"; c.lineWidth = 3; c.strokeRect(10, 10, W2 - 20, H2 - 20);
    c.fillStyle = "#3b2a18"; c.font = "bold 26px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(labelText.slice(0, 16).toUpperCase(), W2/2, H2*.3);
    c.font = "bold 18px sans-serif"; c.fillText("THIS WAY UP ↑", W2/2, H2*.75); });
  const face = mat({map:t, roughness:.95}), card = lmat(0xb98d55), tape = lmat(0xd8c49a);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, l).translate(0, h/2, 0), [card, card, card, card, face, face]));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(.06, .004, l + .004).translate(0, h + .002, 0), tape));
  return g;
}
function toolMesh(){
  const g = new THREE.Group();
  g.add(part(new THREE.CylinderGeometry(.014, .016, .09, 8).translate(0, .045, 0), 0xd2402f));
  g.add(part(new THREE.CylinderGeometry(.004, .004, .1, 6).translate(0, .14, 0), 0xb9bec2, {mat:{metalness:.85}}));
  return g;
}
export function itemMesh(it){
  const d = ITEMS[it.id], m = d ? d.mesh(it) : new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .1), lmat(0x888888));
  m.traverse(o => { if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
  m.userData.item = it.id;
  return m;
}

/* ---------- the state ---------- */
export function carry(){
  const s = G(); if (!s) return {hand:null, slots:[null, null]};
  if (!s.carry || typeof s.carry !== "object") s.carry = {hand:null, slots:[null, null]};
  if (!Array.isArray(s.carry.slots)) s.carry.slots = [null, null];
  while (s.carry.slots.length < 2) s.carry.slots.push(null);
  if (!Array.isArray(s.drops)) s.drops = [];
  return s.carry;
}
export const hand = () => carry().hand;
export const holding = id => { const h = hand(); return !!h && (!id || h.id === id); };
// is it anywhere on you (hand or pockets)
export function onYou(id){ const c = carry(); return [c.hand, ...c.slots].some(it => it && it.id === id); }
export function dropsOf(zone){ carry(); return G().drops.filter(d => d.zone === zone); }

const listeners = [];
export function onCarry(fn){ listeners.push(fn); }
function changed(){ render(); for (const f of listeners) try { f(); } catch(e){ console.error(e); } if (typeof save === "function") save(); }

// a new thing in your hand; false (and nothing changes) if your hand is not free
export function take(it){
  const c = carry(); if (c.hand) return false;
  c.hand = it; changed(); pulse("hand");
  onb("take", {id:it && it.id, item:it});
  return true;
}
// what is in your hand leaves it (placed somewhere, eaten, used up); returns it
export function release(){
  const c = carry(), it = c.hand; c.hand = null;
  if (it){ changed(); onb("release", {id:it.id, item:it}); }
  return it;
}
/* 1 or 2: hand and pocket swap. A hands-only thing in your hand never goes into a pocket (what is in the pocket stays
   there too); with your hand empty, taking anything out always works. Returns false and says why when it refuses */
export function swap(i){
  const c = carry(); if (i < 0 || i > 1) return false;
  if (!c.hand && !c.slots[i]){ pulse(i, true); return false; }
  if (c.hand && !pocketable(c.hand)){
    pulse(i, true);
    if (typeof window !== "undefined" && window.lifeNote) window.lifeNote(POCKET_NO);
    return false;
  }
  const h = c.hand; c.hand = c.slots[i]; c.slots[i] = h;
  changed(); pulse(i); pulse("hand");
  onb("swap", {slot:i, hand:c.hand ? c.hand.id : null, pocket:c.slots[i] ? c.slots[i].id : null});
  return true;
}
export function addDrop(d){ carry(); G().drops.push(d); if (typeof save === "function") save(); }
export function removeDrop(d){ const s = G(); s.drops = s.drops.filter(x => x !== d); if (typeof save === "function") save(); }
// every unpaid thing on you (shop items you have picked up but not paid for)
export function unpaid(){ const c = carry(); return [c.hand, ...c.slots].filter(it => it && it.unpaid); }
// take something off you wherever it is (hand first, then pockets)
export function removeWhere(pred){
  const c = carry(); let n = 0;
  if (c.hand && pred(c.hand)){ c.hand = null; n++; }
  for (let i = 0; i < 2; i++) if (c.slots[i] && pred(c.slots[i])){ c.slots[i] = null; n++; }
  if (n) changed();
  return n;
}
// put something on you: the hand if free, else a free pocket (never for a hands-only thing); false if it will not go
export function stow(it){
  const c = carry();
  if (!c.hand){ c.hand = it; changed(); pulse("hand"); return true; }
  if (!pocketable(it)) return false;
  const i = c.slots.findIndex(x => !x); if (i < 0) return false;
  c.slots[i] = it; changed(); pulse(i); return true;
}
// every Foodies bag on you, hand first, then pockets (a bag in a pocket comes from an older save)
export function bagsOnYou(){ const c = carry(); return [c.hand, ...c.slots].filter(it => it && it.id === "bag"); }
// take this very thing off you, wherever it is; true if it was there
export function removeItem(it){ return removeWhere(x => x === it) > 0; }
/* the football as something lying in a zone (DESIGN 3.8.1, 1.7): the intro kick and the home zone's migration put it
   down through this, once (S.home.ballGiven) */
export function ballDrop(zone, x, y, z){
  const s = G(); if (!s) return null;
  carry();
  const d = {zone, x:+(+x).toFixed(3), y:+(+y).toFixed(3), z:+(+z).toFixed(3), ry:0, item:{id:"ball"}};
  s.drops.push(d);
  if (s.home){ s.home.ballGiven = true; delete s.home.ballPending; }
  if (typeof save === "function") save();
  return d;
}

/* ---------- the bar along the bottom of the screen ---------- */
function cellHTML(it, key, big){
  const d = it ? ITEMS[it.id] : null;
  return `<div class="iv-cell${big ? " hand" : ""}${it ? " full" : ""}${it && it.unpaid ? " unpaid" : ""}" data-k="${key}">
    <kbd>${big ? "HAND" : key + 1}</kbd><span class="iv-ico">${it ? (d ? d.icon : "•") : ""}</span>
    <span class="iv-nm">${it ? esc(itemName(it)) : big ? "Empty" : ""}</span>${it && it.unpaid ? `<em>Not paid</em>` : ""}</div>`;
}
export function render(){
  const el = document.getElementById("lifeInv"); if (!el) return;
  const c = carry();
  el.innerHTML = cellHTML(c.slots[0], 0) + cellHTML(c.hand, "hand", true) + cellHTML(c.slots[1], 1) +
    `<div class="iv-keys">${c.hand ? `${pocketable(c.hand) ? `<span><kbd>1</kbd><kbd>2</kbd> pocket</span>` : ""}<span><kbd>G</kbd> put down</span>` : c.slots.some(Boolean) ? `<span><kbd>1</kbd><kbd>2</kbd> take out</span>` : `<span><kbd>LMB</kbd> pick up</span>`}</div>`;
  el.classList.toggle("some", !!(c.hand || c.slots.some(Boolean)));
}
function pulse(k, bad){
  const el = document.querySelector(`#lifeInv .iv-cell[data-k="${k}"]`); if (!el) return;
  el.classList.remove("pulse", "nope"); void el.offsetWidth; el.classList.add(bad ? "nope" : "pulse");
}
