/* ============ Football: the match HUD ============
   Owner: WP-F (Stage P2). Contract: DESIGN 1.4.17 (fphud.js: hudInit, hudFrame, hudNotice, hudScenario, hudDispose),
   1.5.10 (the match HUD), 1.6 (H hides the hints, Tab the overview); addendum A1.3 (the fatigue vignette), A1.4 (the
   broadcast-style match HUD and its settings), A1.2 (the speed lines), A1.5 (the timing ring).

   Broadcast style, out of the way: thin lines, the teams' colours, condensed numerals, springy motion.
     top left      the scorebug: the two sides' short names in their colours, the score, the clock in whole minutes
                   with +N in added time, a card pip per booking of yours, the offside pip (Auto, On, Off)
     centre        the crosshair (4 px, always where you aim: it never sways); while you charge a shot or a pass the
                   power arc round its bottom with the sweet spot for the distance; the contact pips and the curl
                   glyph; the closing timing ring of a volley; a tiny glyph of what you can do now
     lower left    the stamina: a bright breath fill over the darker cap (the late match), faint while full, brighter
                   while it drains, a heartbeat when low; the energy line under it
     bottom right  the hints (a key and a verb, three at most; a key alone after five uses; H hides them)
     top centre    the scenario line; event cards (a goal, offside, a card) just under it
     edges         team-mates' calls (a chevron, or a tick at the edge when he is off screen), the ball when it is
                   off screen and near, the speed lines and the fatigue vignette
     Tab held      the overview radar; a small radar always on when the setting asks for it
   Text is written at most ten times a second and only when it changes; the arcs and rings are transforms and dash
   offsets updated per frame. Settings (this device's, control.js SET): HUD scale, opacity, a colour-blind palette,
   each element hidden on its own. */
import {SET} from "./control.js";
import {FX} from "./matchcam.js";
import {minuteOf} from "./events.js";
import {wrapA, yawOf} from "./pitchspec.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));

// the elements a player may hide one by one (A1.4)
export const HUD_PARTS = Object.freeze({score:"Scorebug", stamina:"Stamina", hints:"Control hints", calls:"Team-mates' calls", cards:"Event cards", scenario:"Scenario line", glyph:"Action glyph", fx:"Speed lines and vignette"});

const D = {root:null, el:{}, cfg:null, txt:{}, t:0, tText:0, calls:[], cards:[], scen:null, scenT:-99, lastScen:-99, notice:null,
  tab:false, hidden:false, arcShown:0, staminaShown:0, drainT:0, lastB:100, chargeA:0, lastCharge:null, lastP:0, ring:0};

// cfg = {home:{short, kit:[shirt, shorts]}, away:{...}, us: 0 | 1, pip: 'auto' | 'on' | 'off' (the setting resolved),
// project(x, y, z) -> {x, y, on} (screen px), cards: number (the player's bookings)}
export function hudInit(cfg){
  hudDispose();
  D.cfg = cfg;
  const host = document.getElementById("lifeRoot") || document.body;
  const r = D.root = document.createElement("div");
  r.id = "fpHud"; r.className = "fp-hud";
  r.innerHTML = `
    <div class="fp-fx"><div class="fp-vig"></div><div class="fp-lines"></div></div>
    <div class="fp-bug" data-part="score">
      <div class="fp-side fp-home"><i></i><b class="fp-hs"></b></div>
      <div class="fp-sc"><span class="fp-sh">0</span><em>-</em><span class="fp-sa">0</span></div>
      <div class="fp-side fp-away"><b class="fp-as"></b><i></i></div>
      <div class="fp-clock"><b class="fp-min">0'</b><span class="fp-add"></span></div>
      <div class="fp-pips"><span class="fp-off" title="Offside line"></span><span class="fp-bk"></span></div>
    </div>
    <div class="fp-scen" data-part="scenario"></div>
    <div class="fp-cards" data-part="cards"></div>
    <div class="fp-cross">
      <i class="fp-dot"></i>
      <svg class="fp-arc" viewBox="-40 -40 80 80" aria-hidden="true">
        <path class="fp-arc-bg" d="M -26 6 A 26 26 0 0 0 26 6"/>
        <path class="fp-arc-sweet" d="M -26 6 A 26 26 0 0 0 26 6"/>
        <path class="fp-arc-fill" d="M -26 6 A 26 26 0 0 0 26 6"/>
        <line class="fp-arc-tick" x1="0" y1="22" x2="0" y2="31"/>
        <circle class="fp-ring" r="17"/>
        <circle class="fp-ring-win" r="17"/>
      </svg>
      <div class="fp-contact"><i></i><i></i><i></i></div><span class="fp-curl">&#x293A;</span>
      <span class="fp-glyph" data-part="glyph"></span>
    </div>
    <div class="fp-stam" data-part="stamina"><div class="fp-stam-bar"><i class="fp-cap"></i><i class="fp-breath"></i></div><div class="fp-energy"><i></i></div></div>
    <div class="fp-hints" data-part="hints"></div>
    <div class="fp-calls" data-part="calls"></div>
    <div class="fp-ballmark"></div>
    <canvas class="fp-radar" width="210" height="140"></canvas>
    <div class="fp-overlay"></div>`;
  host.appendChild(r);
  const q = s => r.querySelector(s);
  Object.assign(D.el, {vig:q(".fp-vig"), lines:q(".fp-lines"), bug:q(".fp-bug"), hs:q(".fp-hs"), as:q(".fp-as"), sh:q(".fp-sh"), sa:q(".fp-sa"),
    min:q(".fp-min"), add:q(".fp-add"), off:q(".fp-off"), bk:q(".fp-bk"), scen:q(".fp-scen"), cards:q(".fp-cards"), cross:q(".fp-cross"),
    arc:q(".fp-arc"), arcFill:q(".fp-arc-fill"), arcSweet:q(".fp-arc-sweet"), arcTick:q(".fp-arc-tick"), ring:q(".fp-ring"), ringWin:q(".fp-ring-win"),
    contact:q(".fp-contact"), curl:q(".fp-curl"), glyph:q(".fp-glyph"), stam:q(".fp-stam"), cap:q(".fp-cap"), breath:q(".fp-breath"),
    energy:q(".fp-energy i"), hints:q(".fp-hints"), calls:q(".fp-calls"), ball:q(".fp-ballmark"), radar:q(".fp-radar"), overlay:q(".fp-overlay")});
  const sides = [q(".fp-home i"), q(".fp-away i")];
  sides[0].style.background = cfg.home.kit[0]; sides[1].style.background = cfg.away.kit[0];
  D.el.hs.textContent = cfg.home.short; D.el.as.textContent = cfg.away.short;
  D.arcLen = D.el.arcFill.getTotalLength ? D.el.arcFill.getTotalLength() : 81.7;
  for (const p of [D.el.arcFill, D.el.arcSweet]){ p.style.strokeDasharray = `${D.arcLen} ${D.arcLen}`; p.style.strokeDashoffset = String(D.arcLen); }
  D.ringLen = 2*Math.PI*17;
  D.el.ring.style.strokeDasharray = `${D.ringLen} ${D.ringLen}`;
  applySettings();
  D.txt = {}; D.calls = []; D.cards = []; D.scen = null; D.notice = null; D.hidden = !SET.hints;
  return r;
}
// the settings (scale, opacity, palette, what is hidden): read from control.js SET when they change
export function applySettings(){
  const r = D.root; if (!r) return;
  r.style.setProperty("--fp-scale", String(SET.hudScale || 1));
  r.style.setProperty("--fp-op", String(SET.hudOpacity == null ? 1 : SET.hudOpacity));
  r.classList.toggle("fp-cb", SET.palette === "cb");
  for (const k of Object.keys(HUD_PARTS)) r.classList.toggle("fp-no-" + k, !!(SET.hide && SET.hide[k]));
  r.classList.toggle("fp-radar-on", !!SET.radar);
}
export function hudDispose(){
  if (D.root && D.root.parentNode) D.root.parentNode.removeChild(D.root);
  D.root = null; D.el = {}; D.txt = {}; D.cfg = null;
}
export const hudRoot = () => D.root;
const put = (k, el, s) => { if (D.txt[k] !== s){ D.txt[k] = s; el.textContent = s; } };
const putH = (k, el, s) => { if (D.txt[k] !== s){ D.txt[k] = s; el.innerHTML = s; } };

/* ---------- the notices: event cards (goal, offside, a card, a sub, half time) ----------
   kind: 'goal' | 'offside' | 'card' | 'red' | 'sub' | 'info' | 'whistle'; text: the line. A card stays 3.5 s (a goal
   5 s), springs in, at most two at once */
export function hudNotice(kind, text, sub = ""){
  if (!D.root) return;
  const n = document.createElement("div");
  n.className = `fp-card fp-k-${kind}`;
  n.innerHTML = `<b>${esc(text)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}`;
  D.el.cards.appendChild(n);
  void n.offsetWidth; n.classList.add("in");        // (a reflow, then the class: the transition runs without waiting a frame)
  D.cards.push({n, until:performance.now() + (kind === "goal" ? 5000 : 3500)});
  while (D.cards.length > 2){ const o = D.cards.shift(); o.n.remove(); }
}
// the scenario line (3.2.9): one line, fading after 4 s, at most one new one per 20 s of real time
export function hudScenario(text){
  if (!D.root || !text) return;
  const now = performance.now();
  if (now - D.lastScen < 20000) return;
  D.lastScen = now; D.scenT = now;
  D.el.scen.textContent = text; D.el.scen.classList.remove("in"); void D.el.scen.offsetWidth; D.el.scen.classList.add("in");
}
// a team-mate's call: his name over him (or a tick at the screen's edge on his bearing) for 1.5 s
export function hudCall(agent, name){ if (D.root) D.calls.push({agent, name, until:performance.now() + 1500, el:null}); }
// a card over everything (pause, half time, full time, the bench skip): html, or null to take it down
export function hudOverlay(html, cls = ""){
  const o = D.el.overlay; if (!o) return null;
  if (!html){ o.className = "fp-overlay"; o.innerHTML = ""; D.txt.ov = null; return o; }
  if (D.txt.ov !== html){ D.txt.ov = html; o.innerHTML = html; }
  o.className = "fp-overlay on " + cls;
  return o;
}
export function hudToggleHints(){ D.hidden = !D.hidden; if (D.root) D.root.classList.toggle("fp-nohints", D.hidden); }
export function hudTab(on){ D.tab = !!on; if (D.root) D.root.classList.toggle("fp-tab", D.tab); }
export function hudShow(on){ if (D.root) D.root.classList.toggle("fp-off", !on); }

/* ---------- each frame ----------
   s = {ms, me (agent or null), ctrl (CTRL), dt, B, cap, energy, hints: [{key, verb}], aim: {x, y, z}, target agent,
   proj(x, y, z) -> {x, y, on}, w, h, yaw, offPip: 'onside' | 'near' | 'off' | null, cards, rate (bench fast-forward),
   cam: {x, z}, sweet: {lo, hi} (pass charge units) | null, tick (shot power units) | null, glyph: '' } */
export function hudFrame(s){
  if (!D.root || !s.ms) return;
  const ms = s.ms, dt = s.dt || 0, E = D.el, now = performance.now();
  D.t += dt;
  const slow = (D.tText -= dt) <= 0;
  if (slow) D.tText = .1;
  // the scorebug
  if (slow){
    put("sh", E.sh, String(ms.score[0])); put("sa", E.sa, String(ms.score[1]));
    // (before the first whistle the clock reads 0)
    const C = ms.clock, min = C.sec <= 0 && ms.half === 1 ? 0 : minuteOf(ms), added = C.added && C.sec >= 2700 ? C.added : 0;
    const baseMin = ms.half === 1 ? 45 : 90;
    put("min", E.min, added ? `${baseMin}'` : `${Math.min(min, baseMin)}'`);
    put("add", E.add, added ? `+${Math.max(1, Math.min(added, Math.ceil((C.sec - 2700)/60) || 1))}` : "");
    put("bk", E.bk, s.cards ? "▮".repeat(Math.min(2, s.cards)) : "");
    E.bk.className = "fp-bk" + (s.red ? " red" : "");
    const pip = s.offPip;
    E.off.className = "fp-off" + (pip ? " on fp-pip-" + pip : "");
  }
  // the fx: speed lines and the fatigue vignette (A1.2, A1.3)
  E.lines.style.opacity = (FX.lines*.8 + (FX.topT > 0 ? .25*FX.topT/.35 : 0)).toFixed(3);
  const vig = FX.vig*(.75 + .25*FX.pulse);
  E.vig.style.opacity = vig.toFixed(3);
  // the crosshair's power arc (A1.4): only while charging a shot or a pass; the sweet spot from the target distance
  const ch = s.ctrl && s.ctrl.charge;
  if (ch && (ch.kind === "shot" || ch.kind === "pass" || ch.kind === "throw")){
    D.chargeA = Math.min(1, D.chargeA + dt/.12); D.lastCharge = ch.kind; D.lastP = ch.p;
  } else D.chargeA = Math.max(0, D.chargeA - dt/.45);
  E.arc.style.opacity = D.chargeA.toFixed(3);
  const p = ch ? ch.p : D.lastP;
  E.arcFill.style.strokeDashoffset = String((D.arcLen*(1 - clamp(p, 0, 1))).toFixed(2));
  E.arcFill.classList.toggle("over", !!ch && ch.kind === "shot" && p > .92);
  if (s.sweet && ch){
    const a = clamp(s.sweet.lo, 0, 1), b = clamp(s.sweet.hi, 0, 1);
    E.arcSweet.style.strokeDasharray = `0 ${(a*D.arcLen).toFixed(2)} ${((b - a)*D.arcLen).toFixed(2)} ${D.arcLen*2}`;
    E.arcSweet.style.strokeDashoffset = "0"; E.arcSweet.style.opacity = "1";
  } else E.arcSweet.style.opacity = "0";
  if (s.tick != null && ch){
    // the tick on the arc at the power that carries it the distance (the arc runs from the left, round the bottom)
    const ang = Math.PI*(1 - clamp(s.tick, 0, 1)), x = 26*Math.cos(ang), y = 6 + 20*Math.sin(ang);
    E.arcTick.setAttribute("transform", `translate(${x.toFixed(2)} ${(y - 26).toFixed(2)})`);
    E.arcTick.style.opacity = "1";
  } else E.arcTick.style.opacity = "0";
  // the contact pips and the curl glyph while charging
  const ct = s.ctrl ? s.ctrl.contact : 0;
  if (slow){ E.contact.className = "fp-contact c" + (ct + 2) + (D.chargeA > .05 ? " on" : ""); E.curl.classList.toggle("on", !!(s.ctrl && s.ctrl.finesse && D.chargeA > .05)); }
  // the timing ring (A1.5): it closes on the moment the ball will be met; the window is its width
  const R = s.ctrl && s.ctrl.ring;
  if (R){
    const k = clamp(R.tc/.9, 0, 1), w = clamp(R.w/.9, 0, 1);
    E.ring.style.strokeDashoffset = String((D.ringLen*(1 - k)).toFixed(2)); E.ring.style.opacity = "1";
    E.ringWin.style.strokeDasharray = `${(D.ringLen*w).toFixed(2)} ${D.ringLen}`; E.ringWin.style.opacity = ".9";
    E.ring.classList.toggle("now", Math.abs(R.tc - (s.ringAt || .2)) < R.w/2);
  } else { E.ring.style.opacity = "0"; E.ringWin.style.opacity = "0"; }
  if (slow) put("glyph", E.glyph, s.glyph || "");
  // the stamina (A1.4): bright breath over the darker cap; faint while full, brighter while draining, a heartbeat low
  if (s.B != null){
    const B = s.B, cap = s.cap == null ? 100 : s.cap;
    const draining = B < D.lastB - 1e-4; D.lastB = B;
    D.drainT = draining ? .8 : Math.max(0, D.drainT - dt);
    const full = B >= cap*.95;
    const want = full && D.drainT <= 0 ? .22 : D.drainT > 0 ? 1 : .7;
    D.staminaShown += (want - D.staminaShown)*(1 - Math.exp(-6*dt));
    E.stam.style.opacity = D.staminaShown.toFixed(3);
    E.breath.style.transform = `scaleX(${(clamp(B, 0, 100)/100).toFixed(4)})`;
    E.cap.style.transform = `scaleX(${(clamp(cap, 0, 100)/100).toFixed(4)})`;
    if (slow){ E.stam.classList.toggle("low", B < 25); E.stam.classList.toggle("beat", B < 15); }
    if (s.energy != null) E.energy.style.transform = `scaleX(${(clamp(s.energy, 0, 100)/100).toFixed(4)})`;
  }
  // the hints (bottom right): three at most, the key alone after five uses
  if (slow){
    const hs = (s.hints || []).slice(0, 3).map(h => `<div><kbd>${esc(h.key)}</kbd>${h.verb ? `<span>${esc(h.verb)}</span>` : ""}</div>`).join("");
    putH("hints", E.hints, hs);
  }
  // the scenario line fades after 4 s
  if (D.scenT > 0 && now - D.scenT > 4000){ E.scen.classList.remove("in"); D.scenT = 0; }
  // the event cards
  for (let i = D.cards.length - 1; i >= 0; i--){ const c = D.cards[i]; if (now > c.until){ c.n.classList.add("out"); const n = c.n; setTimeout(() => n.remove(), 400); D.cards.splice(i, 1); } }
  // the calls: a chevron over the caller, or a tick at the screen's edge on his bearing
  callsFrame(s, now);
  // the ball off screen and within 30 m: a small glyph at the edge on its bearing
  ballMark(s);
  // the overview (Tab held) or the small radar (the setting)
  if (D.tab || SET.radar) radar(s, D.tab);
}
function callsFrame(s, now){
  const E = D.el, ms = s.ms;
  for (let i = D.calls.length - 1; i >= 0; i--){
    const c = D.calls[i], a = ms.agents[c.agent];
    if (now > c.until || !a){ if (c.el) c.el.remove(); D.calls.splice(i, 1); continue; }
    if (!c.el){ c.el = document.createElement("div"); c.el.className = "fp-call"; c.el.innerHTML = `<b>${esc(c.name)}</b><i></i>`; E.calls.appendChild(c.el); }
    const p = s.proj ? s.proj(a.m.x, 2.15*(a.scale || 1), a.m.z) : null;
    if (p && p.on){ c.el.classList.remove("edge"); c.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`; }
    else edgePlace(c.el, s, a.m.x, a.m.z, "edge", p);
    c.el.style.opacity = Math.min(.6, (c.until - now)/400).toFixed(2);
  }
}
// an element at the screen's edge on the bearing of a point (x, z), rotated to point at it; a point in front of you but
// out of the view (the ball at your feet under a raised look) goes where its projection is, at the bottom or the top
function edgePlace(el, s, x, z, cls, p = null){
  let b = wrapA(yawOf(x - s.cam.x, z - s.cam.z) - s.yaw);         // 0 ahead, + to the left
  const w = s.w, h = s.h, cx = w/2, cy = h/2;
  if (p && p.front){ const qx = p.x - cx, qy = p.y - cy; if (Math.abs(qx) + Math.abs(qy) > 1) b = Math.atan2(-qx, -qy); }
  const dx = -Math.sin(b), dy = -Math.cos(b);
  const k = Math.min(Math.abs((cx - 28)/(dx || 1e-6)), Math.abs((cy - 28)/(dy || 1e-6)));
  el.classList.add(cls);
  el.style.transform = `translate(${(cx + dx*k).toFixed(1)}px, ${(cy + dy*k).toFixed(1)}px) rotate(${(-b).toFixed(3)}rad)`;
}
function ballMark(s){
  const E = D.el, b = s.ms.ball.p;
  const d = Math.hypot(b.x - s.cam.x, b.z - s.cam.z);
  const p = s.proj ? s.proj(b.x, b.y, b.z) : null;
  if (!s.me || !p || p.on || d > 30 || s.ms.ball.state === "held"){ if (D.txt.ball !== 0){ D.txt.ball = 0; E.ball.style.opacity = "0"; } return; }
  D.txt.ball = 1;
  edgePlace(E.ball, s, b.x, b.z, "edge", p);
  E.ball.style.opacity = (.35 + .55*(1 - d/30)).toFixed(2);
}
// the top-down radar: dots, the ball and the offside line, a small corner one or the 40% overview
function radar(s, big){
  const cv = D.el.radar; if (!cv) return;
  const ms = s.ms, spec = ms.spec, W = cv.width, Hh = cv.height, g = cv.getContext("2d");
  const sx = W/(spec.L + 6), sz = Hh/(spec.Wd + 6), ox = W/2, oz = Hh/2;
  g.clearRect(0, 0, W, Hh);
  g.fillStyle = "rgba(20,60,32,.72)"; g.fillRect(0, 0, W, Hh);
  g.strokeStyle = "rgba(255,255,255,.5)"; g.lineWidth = 1;
  g.strokeRect(ox - spec.hx*sx, oz - spec.hz*sz, spec.L*sx, spec.Wd*sz);
  g.beginPath(); g.moveTo(ox, oz - spec.hz*sz); g.lineTo(ox, oz + spec.hz*sz); g.stroke();
  const us = s.me ? s.me.team : D.cfg ? D.cfg.us : 0;
  if (s.offX != null){ g.strokeStyle = "rgba(255,190,70,.8)"; g.beginPath(); g.moveTo(ox + s.offX*sx, oz - spec.hz*sz); g.lineTo(ox + s.offX*sx, oz + spec.hz*sz); g.stroke(); }
  for (const a of ms.agents){
    if (!a.onPitch || a.role !== "player") continue;
    g.fillStyle = a.isMe ? "#ffffff" : D.cfg ? (a.team === 0 ? D.cfg.home.kit[0] : D.cfg.away.kit[0]) : "#ccc";
    g.beginPath(); g.arc(ox + a.m.x*sx, oz + a.m.z*sz, a.isMe ? 3.4 : 2.6, 0, Math.PI*2); g.fill();
    if (a.team !== us){ g.strokeStyle = "rgba(0,0,0,.6)"; g.stroke(); }
  }
  g.fillStyle = "#fff59a"; g.beginPath(); g.arc(ox + ms.ball.p.x*sx, oz + ms.ball.p.z*sz, 2, 0, Math.PI*2); g.fill();
  cv.classList.toggle("big", !!big);
}

/* ---------- the match settings (3.4.7; addendum A1.2 and A1.4) ----------
   This device's settings (control.js SET, localStorage freyaFootball.ctrl), as rows for the pause card and the
   Settings sheet (window.fpSettingsHTML): match length (the calibrated lengths only), mouse sensitivity, invert mouse,
   field of view, camera motion and effects, control hints, offside marker, spoken team-mates' calls, volume, HUD size,
   opacity, the colour-blind palette, the radar, each HUD element on or off. Every control calls window.fpSet(key,
   value). o = {speed: S.speed, lengths: [[speed, label], ...] (the calibrated ones)} */
export function settingsHTML(o = {}){
  const q = v => JSON.stringify(v).replace(/"/g, "&quot;");
  const seg = (k, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<button type="button" aria-pressed="${String(cur) === String(v)}" onclick="fpSet('${k}', ${q(v)})">${esc(l)}</button>`).join("")}</div>`;
  const range = (k, lo, hi, st, v) => `<input type="range" min="${lo}" max="${hi}" step="${st}" value="${v}" aria-label="${esc(k)}" oninput="fpSet('${k}', +this.value)"><span class="fp-set-v" data-k="${k}">${esc(fmtVal(k, v))}</span>`;
  const lengths = o.lengths || [];
  const rows = [];
  if (lengths.length > 1) rows.push(["Match length", seg("speed", lengths, o.speed)]);
  else if (lengths.length === 1) rows.push(["Match length", `<span>${esc(lengths[0][1])}</span>`]);
  rows.push(["Mouse sensitivity", range("sens", .4, 2.5, .05, SET.sens)]);
  rows.push(["Invert mouse", seg("invertY", [[false, "Off"], [true, "On"]], SET.invertY)]);
  rows.push(["Field of view", range("fov", 70, 90, 1, SET.fov)]);
  rows.push(["Camera motion and effects", range("motion", 0, 1, .05, SET.motion)]);
  rows.push(["Control hints", seg("hints", [[true, "On"], [false, "Off"]], SET.hints)]);
  rows.push(["Offside marker", seg("offsidePip", [["auto", "Auto"], ["on", "On"], ["off", "Off"]], SET.offsidePip)]);
  rows.push(["Spoken team-mates' calls", seg("speech", [[true, "On"], [false, "Off"]], SET.speech)]);
  rows.push(["Volume", range("volume", 0, 1, .05, SET.volume)]);
  rows.push(["HUD size", range("hudScale", .75, 1.4, .05, SET.hudScale)]);
  rows.push(["HUD opacity", range("hudOpacity", .35, 1, .05, SET.hudOpacity)]);
  rows.push(["Colours", seg("palette", [["normal", "Standard"], ["cb", "Colour-blind"]], SET.palette)]);
  rows.push(["Radar", seg("radar", [[false, "Off"], [true, "On"]], SET.radar)]);
  const hide = SET.hide || {};
  rows.push(["Show on the HUD", `<div class="seg wrap">${Object.entries(HUD_PARTS).map(([k, l]) => `<button type="button" aria-pressed="${!hide[k]}" onclick="fpSet('hide', '${k}')">${esc(l)}</button>`).join("")}</div>`]);
  return `<div class="fp-set">${rows.map(([l, c]) => `<label>${esc(l)}</label><div class="fp-set-c">${c}</div>`).join("")}</div>`;
}
export function fmtVal(k, v){
  if (k === "sens") return (+v).toFixed(2) + "x";
  if (k === "fov") return Math.round(v) + " degrees";
  return Math.round(v*100) + "%";
}
