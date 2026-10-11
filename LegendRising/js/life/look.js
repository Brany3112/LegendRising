/* ============ LIFE: you ============
   Your look (S.player.look, kept and checked in daily.js) turned into a body for the character system — your casual
   clothes at home and on the street, the club's training kit with your number at the ground — and the little studio
   that shows it to you while you change it: one small WebGL canvas of its own, so it works on the creation screen
   before the world has ever been drawn, and is thrown away (context and all) the moment it is not on screen. */
import {THREE} from "./build.js";
import {human, animateHuman, lookFor, hashStr} from "./human.js";

const G = () => (typeof S !== "undefined" ? S : null);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const nz = (v, d) => typeof v === "number" && isFinite(v) ? v : d;

// your club's colours, or a plain blue and white while you have no club
export function kitColours(){
  try { const c = typeof myClub === "function" && myClub(); if (c && typeof kitOf === "function"){ const k = kitOf(c.nm); if (k && k[0] && k[1]) return k; } } catch(e){}
  return ["#2c66b8", "#ffffff"];
}
// a light inner top under a dark jacket, a dark one under a light jacket
const innerFor = c => { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255; return .3*r + .59*g + .11*b > 140 ? 0x24262b : 0xeeece6; };
/* the look the character system draws, for your look `pl` dressed for `kind`: "casual" | "training" | "kit".
   o: {kit:[shirt, shorts], number, age, seed} (defaults from the career) */
export function bodyLook(pl, kind = "casual", o = {}){
  const s = G(), L = typeof lookSane === "function" ? lookSane(pl, "player") : pl;
  const seed = o.seed != null ? o.seed : hashStr(String((s && s.cid) || "player")) % 100000;
  const look = {role:"player", sex:"m", age:clamp(Math.round(nz(o.age, s && s.player ? nz(s.player.age, 17) : 17)), 16, 44), skin:L.skin, height:L.height, build:L.build,
    hair:L.hair, hairColor:L.hairColor, beard:L.beard, eyes:L.eyes, receding:0, face:Object.assign({}, L.face), props:[], seed};
  if (kind === "training" || kind === "kit"){
    const kit = o.kit || kitColours(), number = clamp(Math.round(nz(o.number, s && s.player ? nz(+s.player.number, 9) : 9)), 1, 99);
    look.outfit = lookFor("footballer", seed, {kit:[kit[0], kit[1], kit[0]], number, training:kind === "training"}).outfit;
  } else {
    look.outfit = {type:L.top, shirt:L.topCol, inner:innerFor(L.topCol), legwear:L.legs, trousers:L.legCol, shorts:L.legCol,
      socks:0xf2f2ee, shoes:L.shoeCol, sole:L.shoeCol === 0xf0f0ec ? 0xdcdcd6 : 0xeeeeea};
  }
  return look;
}
const keyOf = look => JSON.stringify(look);

/* ---------- the studio ---------- */
let BLOB = null;
function blobTex(){
  if (BLOB) return BLOB;
  const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d"), g = x.createRadialGradient(64, 64, 4, 64, 64, 63);
  g.addColorStop(0, "rgba(0,0,0,.55)"); g.addColorStop(.5, "rgba(0,0,0,.28)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  BLOB = c; return c;
}
// the camera for each view: [yaw of the body, height looked at (× body height), how much of the body fits]
const VIEWS = {front:[0, .53, 1], side:[Math.PI/2, .53, 1], back:[Math.PI, .53, 1], face:[.35, .91, .2]};
function studio(){
  const cv = document.createElement("canvas"); cv.className = "lk-canvas"; cv.setAttribute("aria-label", "Preview of your player");
  const R = new THREE.WebGLRenderer({canvas:cv, antialias:true, alpha:true, powerPreference:"low-power"});
  R.setClearColor(0x000000, 0); R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
  const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(24, 1, .05, 30);
  sc.add(new THREE.HemisphereLight(0xe4ecff, 0x3a3226, 1.35));
  const key = new THREE.DirectionalLight(0xfff1df, 2.3); key.position.set(2.2, 4, 3.4); sc.add(key);
  const rim = new THREE.DirectionalLight(0xbcd4ff, 1.4); rim.position.set(-3, 2.6, -3.2); sc.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, .45); fill.position.set(-3, 1.2, 2.5); sc.add(fill);
  const tex = new THREE.CanvasTexture(blobTex()), floorM = new THREE.MeshBasicMaterial({map:tex, transparent:true, depthWrite:false});
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI/2), floorM); floor.position.y = .002; sc.add(floor);
  const turn = new THREE.Group(); sc.add(turn);
  const st = {cv, R, sc, cam, h:null, key:"", yaw:-.35, want:null, spin:.45, idleT:0, view:"front", camY:.95, camD:4, fit:1, aimY:.53, raf:0, last:0, gone:0, dead:false,
    drag:null, w:0, ht:0};
  const size = () => {
    const p = cv.parentNode; if (!p) return;
    const w = Math.max(1, p.clientWidth), h = Math.max(1, p.clientHeight);
    if (w === st.w && h === st.ht) return;
    st.w = w; st.ht = h; R.setPixelRatio(Math.min(2, devicePixelRatio || 1)); R.setSize(w, h, false); cam.aspect = w/h; cam.updateProjectionMatrix();
  };
  // drag to turn the body; the arrow keys turn it too when the canvas has focus
  cv.tabIndex = 0;
  cv.addEventListener("pointerdown", e => { st.drag = {x:e.clientX, id:e.pointerId}; try { cv.setPointerCapture(e.pointerId); } catch(_){} st.want = null; st.idleT = 3.5; });
  cv.addEventListener("pointermove", e => { if (!st.drag || e.pointerId !== st.drag.id) return; st.yaw += (e.clientX - st.drag.x)*.012; st.drag.x = e.clientX; st.idleT = 3.5; });
  const up = e => { if (st.drag && e.pointerId === st.drag.id) st.drag = null; };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("keydown", e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight"){ e.preventDefault(); st.want = null; st.yaw += e.key === "ArrowLeft" ? -.3 : .3; st.idleT = 3.5; } });
  const frame = t => {
    if (st.dead) return;
    st.raf = requestAnimationFrame(frame);
    // gone from the page (the panel closed, the screen changed): let it all go
    if (!cv.isConnected){ if (++st.gone > 2) dispose(); return; }
    st.gone = 0;
    const dt = Math.min(.05, Math.max(0, (t - st.last)/1000 || 0)); st.last = t;
    size();
    if (st.want != null){
      let d = st.want - st.yaw; d -= Math.round(d/(2*Math.PI))*2*Math.PI;
      st.yaw += d*(1 - Math.exp(-9*dt)); if (Math.abs(d) < .002){ st.yaw = st.want; st.want = null; st.idleT = 4; }
    } else if (!st.drag){ if ((st.idleT -= dt) <= 0) st.yaw += st.spin*dt; }
    turn.rotation.y = st.yaw;
    const v = VIEWS[st.view] || VIEWS.front, H = 1.8*(st.h ? st.h.scale : 1);
    st.aimY += (v[1] - st.aimY)*(1 - Math.exp(-8*dt)); st.fit += (v[2] - st.fit)*(1 - Math.exp(-8*dt));
    // fit the body (or the head) in the frame, whichever way the canvas is shaped
    const tall = H*st.fit*1.12 + .16, wide = Math.max(.9, H*.5)*Math.max(st.fit, .38), vf = Math.tan(cam.fov*Math.PI/360);
    const d = Math.max(tall/2/vf, wide/2/(vf*cam.aspect)) + .3;
    cam.position.set(0, H*st.aimY + d*.08, d); cam.lookAt(0, H*st.aimY, 0);
    if (st.h) animateHuman(st.h, dt, st.view === "face" ? {mode:"idle", look:0} : "idle");
    R.render(sc, cam);
  };
  function set(look){
    const k = keyOf(look);
    if (k === st.key) return;
    st.key = k;
    const old = st.h;
    try { st.h = human(look, {track:false, lod:false}); } catch(e){ console.error(e); st.h = old; return; }
    st.h.near.frustumCulled = false; turn.add(st.h.g);
    animateHuman(st.h, 0, "idle"); st.h.bw = 1;
    if (old) old.dispose();
  }
  function view(name){ st.view = VIEWS[name] ? name : "front"; st.want = VIEWS[st.view][0]; st.idleT = 6; }
  function dispose(){
    if (st.dead) return; st.dead = true;
    cancelAnimationFrame(st.raf);
    if (st.h){ st.h.dispose(); st.h = null; }
    floor.geometry.dispose(); floorM.dispose(); tex.dispose();
    R.dispose(); try { R.forceContextLoss(); } catch(e){}
    if (cv.parentNode) cv.parentNode.removeChild(cv);
    if (CUR === api) CUR = null;
  }
  const api = {cv, set, view, dispose, get dead(){ return st.dead; }, st};
  st.raf = requestAnimationFrame(frame);
  return api;
}
/* One studio at a time, moved into whatever element asks for it (the creation screen redraws itself on every
   click; the canvas, its context and the body survive that). mount(el, look) shows it there; it lets itself go
   when it is no longer in the page, or on unmount(). */
let CUR = null;
export const LookPreview = {
  mount(el, look, view){
    if (!el) return null;
    if (!CUR || CUR.dead) CUR = studio();
    if (CUR.cv.parentNode !== el) el.appendChild(CUR.cv);
    if (look) CUR.set(look);
    if (view) CUR.view(view);
    return CUR;
  },
  // pl: your look (S.player.look shape), kind: "casual" | "training", o: bodyLook's options (kit, number, age, seed)
  show(el, pl, kind, view, o){ return LookPreview.mount(el, bodyLook(pl, kind || "casual", o || {}), view); },
  update(pl, kind, o){ if (CUR && !CUR.dead) CUR.set(bodyLook(pl, kind || "casual", o || {})); },
  view(name){ if (CUR && !CUR.dead) CUR.view(name); },
  unmount(){ if (CUR) CUR.dispose(); CUR = null; },
  get live(){ return !!(CUR && !CUR.dead); }
};
window.LookPreview = LookPreview;
