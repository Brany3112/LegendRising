/* ============ Football: the match HUD ============
   Owner: WP-F (Stage P2). Contract: DESIGN 1.4.17 (fphud.js: hudInit, hudFrame, hudNotice, hudScenario, hudDispose),
   1.5.10 (the match HUD), 1.6 (H hides the hints, Tab the overview); addendum A1.3 (the fatigue vignette), A1.4 (the
   broadcast-style match HUD and its settings), A1.2 (the speed lines), A1.5 (the timing ring).

   Broadcast style, out of the way: thin lines, the teams' colours, condensed numerals, springy motion.
     top left      the scorebug: the two sides' short names in their colours, the score, the clock in whole minutes
                   with +N in added time, a card pip per booking of yours, the offside pip (Auto, On, Off)
     centre        the crosshair (4 px, where you look); the closing timing ring of a volley and the bench's hold-E
                   ring round it; a tiny glyph of what you can do now
     reticle       (A1.7, WP-F2) where a strike would go now: your look plus its sway (Finishing, Composure under
                   pressure, breath, the weak foot), on the goal mouth or the grass; it pulses as your support foot
                   plants (the rhythm to release on). While you wind up a thin power arc runs round it with the sweet
                   spot for the distance (a pass's sweet zone), the contact pips and the curl glyph; it turns red held
                   past full. After your strike a short line under it says how you struck it
     lower left    the stamina: a bright breath fill over the darker cap (the late match), faint while full, brighter
                   while it drains, a heartbeat when low; the energy line under it
     bottom right  the hints (a key and a verb, three at most; a key alone after five uses; H hides them): the shield
                   (C) when a man is on you, the shoulder check (V), and why a press came to nothing (P2b-B)
     top centre    the scenario line; event cards (a goal, offside, a card) just under it
     edges         team-mates' calls (a chevron, or a tick at the edge when he is off screen), the ball when it is
                   off screen and near, the speed lines and the fatigue vignette
     Tab held      the overview radar; a small radar always on when the setting asks for it
     the warm-up   (WP-W1, addendum A1.8) the set's panel top right (the exercise, what to do, its time, a dot per
                   exercise), the exercise's own guide round the crosshair (the beat ring, the beat strip, the depth
                   gauge, the pendulum, the circle, the balance dot, the Go call, the pass marker over the coach), the
                   pops (Good, Perfect, Streak x5), the coaches' and team-mates' lines as subtitles, the rating card; at
                   the scorebug's foot a small Warm mark with the boost and its minutes left (On fire after a goal)
   Text is written at most ten times a second and only when it changes; the arcs and rings are transforms and dash
   offsets updated per frame. Settings (this device's, control.js SET): HUD scale, opacity, a colour-blind palette,
   each element hidden on its own.
   P6-B (Training Mode Phase 6, BUILD-PLAN P6-B work item 6b; TRAINING-SPEC 2, subtle team-mate calls): a call tag on
   the screen edge is only as wide as its chevron (the name shows when he is in view).
   UF2-A (stage UF2, USER-ISSUES U18 to U20; the same HUD for a match, a training session, the first day's lessons and
   Training Mode):
     the meter     one bar just under the crosshair (above it when the ball would be under it: the HUD never covers
                   the ball) while a shot or a pass is held: it fills as the button is held, the sweet spot marked on it
                   (control.js CTRL.meter: the power for the distance, the weight for a pass), green while the fill is
                   in it; let go and it holds a moment on where you released, saying Clean when that was in it. It
                   replaces the thin arc round the reticle and the contact pips
     the kick type a small list in the right edge above the hints, always there: Chip, Curl, Normal, Placed, Driven,
                   the one you will strike with lit (control.js KICKS, the mouse wheel or 1, 2, 3 change it before the
                   kick), with a short "scroll to change" until you have used it a few times
     the settings  an Assists row (On, Low, Off: control.js SET.assist) */
import {SET, KICKS} from "./control.js";
import {RT} from "../core/state.js";
import {FX} from "./matchcam.js";
import {minuteOf} from "./events.js";
import {wrapA, yawOf} from "./pitchspec.js";
import {tipFSDue, tipFSShown} from "../core/keylock.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));

// the elements a player may hide one by one (A1.4)
export const HUD_PARTS = Object.freeze({score:"Scorebug", stamina:"Stamina", hints:"Control hints", calls:"Team-mates' calls", cards:"Event cards", scenario:"Scenario line", glyph:"Action glyph", fx:"Speed lines and vignette", kick:"Kick type"});

const D = {root:null, el:{}, cfg:null, txt:{}, t:0, tText:0, calls:[], cards:[], scen:null, scenT:-99, lastScen:-99, notice:null,
  tab:false, hidden:false, arcShown:0, staminaShown:0, drainT:0, lastB:100, chargeA:0, lastCharge:null, lastP:0, ring:0,
  retA:0, kickSeq:-1, slineT:0, desat:0};

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
    <div class="fp-warm"><i></i><b></b><span></span></div>
    <div class="fp-scen" data-part="scenario"></div>
    <div class="fp-cards" data-part="cards"></div>
    <div class="fp-cross">
      <i class="fp-dot"></i>
      <svg class="fp-hold" viewBox="-40 -40 80 80" aria-hidden="true">
        <circle class="fp-ring" r="17"/>
        <circle class="fp-ring-win" r="17"/>
      </svg>
      <span class="fp-glyph" data-part="glyph"></span>
    </div>
    <div class="fp-ret" data-part="reticle">
      <svg class="fp-arc" viewBox="-40 -40 80 80" aria-hidden="true">
        <circle class="fp-ret-c" r="7"/>
        <g class="fp-arcg">
          <circle class="fp-arc-bg" r="${ARC_R}"/>
          <circle class="fp-arc-sweet" r="${ARC_R}"/>
          <circle class="fp-arc-fill" r="${ARC_R}"/>
          <line class="fp-arc-tick" x1="${ARC_R - 4}" y1="0" x2="${ARC_R + 4}" y2="0"/>
        </g>
      </svg>
      <div class="fp-contact"><i></i><i></i><i></i></div><span class="fp-curl">&#x293A;</span>
    </div>
    <div class="fp-sline"></div>
    <div class="fp-meter" aria-hidden="true"><span class="fp-meter-lab"></span><div class="fp-meter-bar"><i class="fp-meter-sweet"></i><i class="fp-meter-fill"></i><i class="fp-meter-rel"></i></div><b class="fp-meter-say"></b></div>
    <div class="fp-kick" data-part="kick"><b class="fp-kick-h">Kick</b><ol>${KICKS.map(k => `<li data-k="${k.id}"><i></i>${esc(k.label)}</li>`).join("")}</ol><span class="fp-kick-tip">Scroll to change</span></div>
    <div class="fp-stam" data-part="stamina"><div class="fp-stam-bar"><i class="fp-cap"></i><i class="fp-breath"></i></div><div class="fp-energy"><i></i></div></div>
    <div class="fp-hints" data-part="hints"></div>
    <div class="fp-calls" data-part="calls"></div>
    <div class="fp-ballmark"></div>
    <div class="fp-goal" style="${GOAL_CSS}"><b style="${GOAL_B}"></b><i style="${GOAL_I}"></i></div>
    <div class="fp-goalc" style="${GOALC_CSS}"><i style="${GOALC_I}"></i><b style="${GOALC_B}"></b></div>
    <canvas class="fp-radar" width="210" height="140"></canvas>
    <div class="fp-wu"><div class="fp-wu-head"><b class="fp-wu-name"></b><span class="fp-wu-n"></span></div><div class="fp-wu-how"></div><div class="fp-wu-bar"><i></i></div><div class="fp-wu-dots"></div></div>
    <div class="fp-wu-w"></div>
    <div class="fp-pops"></div>
    <div class="fp-say"><b></b><span></span></div>`;
  host.appendChild(r);
  // the cards (pause, half time, full time, the bench skip, an interrupted match) are not in the HUD's own layer: they
  // sit over the whole page (fp.css #fpOverlay), above the black cover (#lifeFade) a card is shown over, so a card is
  // always seen and can be clicked (MF-1)
  const ov = document.createElement("div");
  ov.id = "fpOverlay"; ov.className = "fp-overlay";
  document.body.appendChild(ov);
  const q = s => r.querySelector(s);
  Object.assign(D.el, {vig:q(".fp-vig"), lines:q(".fp-lines"), bug:q(".fp-bug"), hs:q(".fp-hs"), as:q(".fp-as"), sh:q(".fp-sh"), sa:q(".fp-sa"),
    min:q(".fp-min"), add:q(".fp-add"), off:q(".fp-off"), bk:q(".fp-bk"), scen:q(".fp-scen"), cards:q(".fp-cards"), cross:q(".fp-cross"),
    arc:q(".fp-arc"), arcFill:q(".fp-arc-fill"), arcSweet:q(".fp-arc-sweet"), arcTick:q(".fp-arc-tick"), ring:q(".fp-ring"), ringWin:q(".fp-ring-win"),
    hold:q(".fp-hold"), ret:q(".fp-ret"), retC:q(".fp-ret-c"), arcBg:q(".fp-arc-bg"), arcG:q(".fp-arcg"), sline:q(".fp-sline"),
    contact:q(".fp-contact"), curl:q(".fp-curl"), glyph:q(".fp-glyph"), stam:q(".fp-stam"), cap:q(".fp-cap"), breath:q(".fp-breath"),
    energy:q(".fp-energy i"), hints:q(".fp-hints"), calls:q(".fp-calls"), ball:q(".fp-ballmark"), radar:q(".fp-radar"), overlay:ov,
    warm:q(".fp-warm"), warmB:q(".fp-warm b"), warmS:q(".fp-warm span"), wu:q(".fp-wu"), wuName:q(".fp-wu-name"), wuN:q(".fp-wu-n"), wuHow:q(".fp-wu-how"),
    goal:q(".fp-goal"), goalB:q(".fp-goal b"), goalC:q(".fp-goalc"), goalCI:q(".fp-goalc i"), goalCB:q(".fp-goalc b"),
    wuBar:q(".fp-wu-bar i"), wuDots:q(".fp-wu-dots"), wuW:q(".fp-wu-w"), pops:q(".fp-pops"), say:q(".fp-say"), sayB:q(".fp-say b"), sayS:q(".fp-say span"),
    meter:q(".fp-meter"), meterLab:q(".fp-meter-lab"), meterSweet:q(".fp-meter-sweet"), meterFill:q(".fp-meter-fill"), meterRel:q(".fp-meter-rel"), meterSay:q(".fp-meter-say"),
    kick:q(".fp-kick"), kickItems:[...r.querySelectorAll(".fp-kick li")], kickTip:q(".fp-kick-tip")});
  const sides = [q(".fp-home i"), q(".fp-away i")];
  sides[0].style.background = cfg.home.kit[0]; sides[1].style.background = cfg.away.kit[0];
  D.el.hs.textContent = cfg.home.short; D.el.as.textContent = cfg.away.short;
  // the power arc: 300 degrees of a circle round the reticle, open at the bottom, filling clockwise from the lower left
  D.arcC = 2*Math.PI*ARC_R; D.arcLen = D.arcC*ARC_SPAN/360;
  D.el.arcBg.style.strokeDasharray = `${D.arcLen.toFixed(2)} ${D.arcC.toFixed(2)}`;
  for (const p of [D.el.arcFill, D.el.arcSweet]){ p.style.strokeDasharray = `0 ${D.arcC.toFixed(2)}`; }
  D.ringLen = 2*Math.PI*17;
  D.el.ring.style.strokeDasharray = `${D.ringLen} ${D.ringLen}`;
  D.txt = {}; D.calls = []; D.cards = []; D.scen = null; D.notice = null; D.hintsSet = null; D.retA = 0; D.kickSeq = -1; D.slineT = 0; D.desat = 0;
  D.pops = []; D.sayT = 0; D.wuKind = null; D.wuEl = {};
  D.meterA = 0; D.meterHold = 0; D.meterSeq = -1; D.meterUp = false; D.kickShown = -1; D.kickFlash = 0;
  applySettings();
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
  // the Control hints setting (3.4.7): the starting state; H still shows or hides them for the moment
  if (D.hintsSet !== SET.hints){ D.hintsSet = SET.hints; D.hidden = !SET.hints; }
  r.classList.toggle("fp-nohints", D.hidden);
}
export function hudDispose(){
  if (D.root && D.root.parentNode) D.root.parentNode.removeChild(D.root);
  const ov = D.el.overlay; if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
  if (D.desat){ D.desat = 0; const cv = RT.renderer && RT.renderer.domElement; if (cv) cv.style.filter = ""; }
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
// the cards on screen taken away at once (the second half starting: the first half's ones are old news)
export function hudClearCards(){
  if (!D.root) return;
  for (const c of D.cards) c.n.remove();
  D.cards.length = 0;
}
// the scenario line (3.2.9): one line, fading after 4 s, at most one new one per 20 s of real time
export function hudScenario(text){
  if (!D.root || !text) return;
  const now = performance.now();
  if (now - D.lastScen < 20000) return;
  D.lastScen = now; D.scenT = now;
  D.el.scen.textContent = text; D.el.scen.classList.remove("in"); void D.el.scen.offsetWidth; D.el.scen.classList.add("in");
}
// your own call for the ball (R, U10): what you shouted, under the crosshair for a moment, so a press is seen to count
export function hudCallMe(how){
  if (!D.root) return;
  const E = D.el;
  put("sline", E.sline, how === "behind" ? "In behind!" : "Here!");
  E.sline.classList.remove("in"); void E.sline.offsetWidth; E.sline.classList.add("in"); D.slineT = 1.1;
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
   hudFrame(ms, me, ctrl, dt, s) (1.4.17): the match, your agent (or null off the pitch), control.js CTRL and the
   frame's dt; s, optional, is the caller's view of the rest (kept by the caller, filled in place each frame):
   s = {B, cap, energy, hints: [{key, verb}], aim: {x, y, z}, target agent,
   proj(x, y, z) -> {x, y, on}, w, h, yaw, offPip: 'onside' | 'near' | 'off' | null, cards, rate (bench fast-forward),
   cam: {x, z}, sweet: {lo, hi} (pass charge units) | null, tick (shot power units) | null, glyph: '', offX: the offside
   line's x for the overview | null, hold: 0 to 1 while E is held on the bench (the ring fills) | null } */
const S_DEF = {B:null, hints:null, proj:null, w:0, h:0, yaw:0, cam:{x:0, z:0}, offPip:null, offX:null, cards:0, sweet:null, tick:null, glyph:"", hold:null};
export function hudFrame(ms, me, ctrl, dt, s = S_DEF){
  if (!D.root || !ms) return;
  s.ms = ms; s.me = me; s.ctrl = ctrl; s.dt = dt;
  dt = dt || 0;
  const E = D.el, now = performance.now();
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
  // the fx: speed lines and the fatigue vignette (A1.2, A1.3), and the grey of an empty tank on the picture itself
  E.lines.style.opacity = (FX.lines*.8 + (FX.topT > 0 ? .25*FX.topT/.35 : 0)).toFixed(3);
  const vig = FX.vig*(.78 + .22*FX.pulse);
  E.vig.style.opacity = vig.toFixed(3);
  desaturate(SET.hide && SET.hide.fx ? 0 : FX.desat);
  // the reticle (A1.7): where a strike would go now, on screen
  const ret = s.ctrl && s.ctrl.ret, ch = s.ctrl && s.ctrl.charge;
  const rp = ret && ret.on && s.proj ? s.proj(ret.x, ret.y, ret.z) : null, retOn = !!(rp && rp.front);
  D.retA = retOn ? Math.min(1, D.retA + dt/.15) : Math.max(0, D.retA - dt/.3);
  if (retOn){
    const x = clamp(rp.x, 12, (s.w || innerWidth) - 12), y = clamp(rp.y, 12, (s.h || innerHeight) - 12);
    E.ret.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }
  E.ret.style.opacity = (D.retA*(ch ? 1 : .55)).toFixed(3);
  // its pulse on your support foot's plant (the rhythm to release on), red when held past full
  const over = s.ctrl && s.ctrl.wind ? s.ctrl.wind.over : 0;
  E.retC.setAttribute("r", (7 + 2.5*(ret ? ret.beat : 0)).toFixed(2));
  E.retC.classList.toggle("over", over > .05);
  // (the charge, for the curl glyph: the meter below shows the power and the sweet spot, UF2-A)
  if (ch && (ch.kind === "shot" || ch.kind === "pass" || ch.kind === "throw")){ D.chargeA = Math.min(1, D.chargeA + dt/.12); D.lastCharge = ch.kind; D.lastP = ch.p; }
  else D.chargeA = Math.max(0, D.chargeA - dt/.45);
  E.arcG.style.opacity = "0";
  if (slow){ E.contact.className = "fp-contact"; E.curl.classList.toggle("on", !!(s.ctrl && (s.ctrl.finesse || (KICKS[s.ctrl.kick] || {}).id === "curl") && D.chargeA > .05)); }
  meterFrame(s, dt, over);
  kickFrame(s, dt, slow);
  // the line on how you struck it (A1.7): your own kick, the moment it is logged
  strikeLine(s.ms, s.me, dt);
  // the timing ring (A1.5) and the bench's hold-E ring, round the crosshair: the timing ring closes on the moment the
  // ball will be met (the window is its width); E held on the bench fills it
  const R = s.ctrl && s.ctrl.ring;
  if (s.hold != null){
    E.ring.style.strokeDashoffset = String((D.ringLen*(1 - clamp(s.hold, 0, 1))).toFixed(2)); E.ring.style.opacity = "1";
    E.ringWin.style.opacity = "0"; E.ring.classList.remove("now"); E.hold.classList.add("on");
  } else if (R){
    const k = clamp(R.tc/.9, 0, 1), w = clamp(R.w/.9, 0, 1);
    E.ring.style.strokeDashoffset = String((D.ringLen*(1 - k)).toFixed(2)); E.ring.style.opacity = "1";
    E.ringWin.style.strokeDasharray = `${(D.ringLen*w).toFixed(2)} ${D.ringLen}`; E.ringWin.style.opacity = ".9";
    E.ring.classList.toggle("now", Math.abs(R.tc - (s.ringAt || .2)) < R.w/2); E.hold.classList.add("on");
  } else { E.ring.style.opacity = "0"; E.ringWin.style.opacity = "0"; E.hold.classList.remove("on"); }
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
  // the hints (bottom right): three at most, the key alone after five uses (the Control hints setting looked at
  // here too, so a change made from any pause card applies wherever the HUD is: a match or first-person training)
  if (slow && D.hintsSet !== SET.hints) applySettings();
  if (slow){
    const hs = (s.hints || []).slice(0, 3).map(h => `<div><kbd>${esc(h.key)}</kbd>${h.verb ? `<span>${esc(h.verb)}</span>` : ""}</div>`).join("");
    putH("hints", E.hints, hs);
  }
  // the one-time full-screen tip (P2b-B): asked for by control.js the first time you shield; shown once on this device
  // (core/keylock.js keeps that it was, in its own localStorage key) and never while you are in full screen already
  if (s.ctrl && s.ctrl.tipFS){
    s.ctrl.tipFS = false;
    if (tipFSDue()){ tipFSShown(); hudNotice("info", "Tip: play in full screen", "C shields the ball. In full screen, Ctrl does too."); }
  }
  // the scenario line fades after 4 s
  if (D.scenT > 0 && now - D.scenT > 4000){ E.scen.classList.remove("in"); D.scenT = 0; }
  // the event cards
  for (let i = D.cards.length - 1; i >= 0; i--){ const c = D.cards[i]; if (now > c.until){ c.n.classList.add("out"); const n = c.n; setTimeout(() => n.remove(), 400); D.cards.splice(i, 1); } }
  // the calls: a chevron over the caller, or a tick at the screen's edge on his bearing
  callsFrame(s, now);
  // the ball off screen and within 30 m: a small glyph at the edge on its bearing
  ballMark(s);
  // where you are sent (the fourth official when you are called on, U2): a tag over him, and a compass arrow
  goalMark(s, dt);
  // the overview (Tab held) or the small radar (the setting)
  if (D.tab || SET.radar) radar(s, D.tab);
  // the warm-up (A1.8): its panel and guide, the pops, the lines, the Warm mark
  warmFrame(s, dt, now, slow);
}
// the power arc's circle (A1.7): its radius, the angle it starts at (SVG degrees, clockwise from three o'clock) and its span
const ARC_R = 18, ARC_START = 120, ARC_SPAN = 300;
// the picture greyed a little near an empty tank (A1.3, A1.6): a CSS filter on the canvas, set only when it changes
function desaturate(v){
  const k = Math.round(clamp(v || 0, 0, 1)*50)/50;
  if (k === D.desat) return;
  D.desat = k;
  const cv = RT.renderer && RT.renderer.domElement;
  if (cv) cv.style.filter = k > 0 ? `saturate(${(1 - k).toFixed(2)})` : "";
}
// the short line on how you struck it (A1.7), from your own kick event: how clean, then what you did with it
const Q_LINE = [[.8, "Sweet contact."], [.55, "Decent contact."], [.3, "Not clean."], [0, "Snatched at it."]];
export function strikeText(ev){
  if (!ev) return "";
  if (ev.whiff) return "Air kick. The ball wasn't there.";
  if (ev.scuff) return "Scuffed it.";
  const sh = String(ev.shape || ""), q = ev.strike != null ? +ev.strike : 1, shot = ev.intent === "shot";
  // (UF2-A: a release in the meter's sweet spot is a clean strike, and the line says so first)
  const first = /clean/.test(sh) ? "Clean strike!" : (Q_LINE.find(r => q >= r[0]) || Q_LINE[3])[1];
  let then = "";
  if (/over/.test(sh)) then = "Leaned back on it.";
  else if (/chip/.test(sh)) then = "Chipped.";
  else if (/dip/.test(sh)) then = "Topspin on it, it'll dip.";
  else if (/curl/.test(sh)) then = shot ? "Curled." : "Bent round.";
  else if (/placed/.test(sh)) then = "Side-footed, placed.";
  else if (/driven/.test(sh)) then = shot ? "Driven, low and hard." : "Zipped along the grass.";
  else if (/low/.test(sh)) then = "Kept it low.";
  else if (/power/.test(sh)) then = "Hit with everything.";
  else if (/lofted/.test(sh)) then = "Lofted.";
  else if ((ev.rhythm || 0) > .5) then = "Off your stride.";
  // (an ordinary pass says nothing unless something went wrong with it)
  if (!shot && !then && q >= .55 && !/clean/.test(sh)) return "";
  return then ? first + " " + then : first;
}
function strikeLine(ms, me, dt){
  const E = D.el;
  if (ms && ms.kick && ms.kick.seq !== D.kickSeq){
    D.kickSeq = ms.kick.seq;
    const t = me && ms.kick.agent === me.id && ms.kick.ev && ms.kick.ev.shape ? strikeText(ms.kick.ev) : "";
    if (t){ put("sline", E.sline, t); E.sline.classList.add("in"); D.slineT = 2.4; }
  }
  if (D.slineT > 0 && (D.slineT -= dt) <= 0) E.sline.classList.remove("in");
}
/* ---------- the meter and the kick type (UF2-A, U18 to U20) ---------- */
// the meter: a bar just under the crosshair while a shot or a pass is held (control.js CTRL.meter), above it when the
// ball would be under it; held a moment after the release on where you let go, saying Clean when it was in the spot
const METER_W = 132, METER_H = 26, METER_OFF = 40;
function meterFrame(s, dt, over){
  const E = D.el, c = s.ctrl, M = c && c.meter;
  if (!E.meter || !M) return;
  const C = c.clean;
  if (C && C.seq !== D.meterSeq){
    // a release: the meter holds on it (a tap has nothing to show)
    if (D.meterSeq >= 0 && D.meterA > .05 && C.p > 0){ D.meterHold = .7; D.meterRelP = C.p; D.meterOk = !!C.ok; }
    D.meterSeq = C.seq;
  }
  const on = !!M.on;
  if (on){ D.meterA = Math.min(1, D.meterA + dt/.1); D.meterHold = 0; D.meterKind = M.kind; D.meterLo = M.lo; D.meterHi = M.hi; D.meterP = M.p; }
  else if (D.meterHold > 0) D.meterHold -= dt;
  else D.meterA = Math.max(0, D.meterA - dt/.25);
  E.meter.style.opacity = D.meterA.toFixed(3);
  if (D.meterA <= 0) return;
  const lo = clamp(D.meterLo || 0, 0, 1), hi = clamp(D.meterHi || 0, 0, 1), p = clamp(on ? M.p : D.meterRelP != null ? D.meterRelP : D.meterP || 0, 0, 1);
  E.meterSweet.style.left = (lo*100).toFixed(1) + "%"; E.meterSweet.style.width = (Math.max(0, hi - lo)*100).toFixed(1) + "%";
  E.meterFill.style.transform = `scaleX(${p.toFixed(4)})`;
  const inSweet = p >= lo && p <= hi, bad = over > .05 || (D.meterKind === "shot" && p > .92);
  E.meter.classList.toggle("sweet", on ? inSweet : !!D.meterOk);
  E.meter.classList.toggle("over", on && bad);
  E.meterRel.style.left = (p*100).toFixed(1) + "%"; E.meterRel.style.opacity = on ? "0" : "1";
  put("meterLab", E.meterLab, D.meterKind === "pass" ? "Weight" : "Power");
  put("meterSay", E.meterSay, on ? "" : D.meterOk ? "Clean" : "");
  // (under the crosshair, or over it when the ball is there: the HUD never covers the ball)
  const w = s.w || innerWidth, h = s.h || innerHeight, k = SET.hudScale || 1, cx = w/2, below = h/2 + METER_OFF*k;
  let up = false;
  const b = s.ms && s.ms.ball && s.proj ? s.proj(s.ms.ball.p.x, s.ms.ball.p.y, s.ms.ball.p.z) : null;
  if (b && b.front && Math.abs(b.x - cx) < (METER_W/2 + 26)*k && Math.abs(b.y - below) < (METER_H/2 + 26)*k) up = true;
  if (up !== D.meterUp){ D.meterUp = up; E.meter.classList.toggle("up", up); }
}
// the kick type, always in its corner: the one you will strike with lit, a short flash when it changes
function kickFrame(s, dt, slow){
  const E = D.el, c = s.ctrl;
  if (!E.kick || !c) return;
  if (c.kick !== D.kickShown){
    if (D.kickShown >= 0) D.kickFlash = .6;
    D.kickShown = c.kick;
    E.kickItems.forEach((li, i) => li.classList.toggle("on", i === c.kick));
  }
  if (D.kickFlash > 0){ D.kickFlash -= dt; if (D.kickFlash <= 0) E.kick.classList.remove("flash"); else E.kick.classList.add("flash"); }
  if (slow) E.kickTip.style.display = (c.uses && (c.uses.contact || 0) >= 3) ? "none" : "";
}
function callsFrame(s, now){
  const E = D.el, ms = s.ms;
  for (let i = D.calls.length - 1; i >= 0; i--){
    const c = D.calls[i], a = ms.agents[c.agent];
    if (now > c.until || !a){ if (c.el) c.el.remove(); D.calls.splice(i, 1); continue; }
    if (!c.el){ c.el = document.createElement("div"); c.el.className = "fp-call"; c.el.innerHTML = `<b>${esc(c.name)}</b><i></i>`; E.calls.appendChild(c.el); }
    const p = s.proj ? s.proj(a.m.x, 2.15*(a.scale || 1), a.m.z) : null;
    // ((P6-B) on the edge only the chevron shows, so the tag is only as wide as it: a rotated 80 px label box would
    // stand up as a long bar pointing at him)
    if (p && p.on){ c.el.classList.remove("edge"); c.el.style.width = c.el.style.marginLeft = ""; c.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`; }
    else { c.el.style.width = "16px"; c.el.style.marginLeft = "-8px"; edgePlace(c.el, s, a.m.x, a.m.z, "edge", p); }
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
// where you are sent (U2): s.goal = {x, y, z, label} or null. A tag with the name and a chevron over the spot while it
// is on screen, and a compass at the top of the screen whose arrow turns to it (0 straight ahead) with the distance,
// so the way there reads wherever you look. Styled inline: the HUD's stylesheet needs nothing new
const GOAL_CSS = "position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;width:160px;margin:-46px 0 0 -80px;" +
  "opacity:0;pointer-events:none;will-change:transform";
const GOAL_B = "font:700 13px/1.2 'Barlow Condensed',sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#fff;" +
  "background:rgba(14,18,24,.72);border:1px solid rgba(200,240,96,.85);border-radius:3px;padding:2px 8px;white-space:nowrap";
const GOAL_I = "width:0;height:0;margin-top:3px;border-left:8px solid transparent;border-right:8px solid transparent;border-top:10px solid #c8f060";
const GOALC_CSS = "position:absolute;left:50%;top:64px;display:flex;align-items:center;gap:8px;transform:translateX(-50%);opacity:0;" +
  "pointer-events:none;background:rgba(14,18,24,.6);border-radius:16px;padding:4px 12px 4px 6px";
const GOALC_I = "display:block;width:20px;height:22px;background:#c8f060;clip-path:polygon(50% 0, 95% 100%, 50% 74%, 5% 100%);will-change:transform";
const GOALC_B = "font:700 13px/1 'Barlow Condensed',sans-serif;letter-spacing:.05em;color:#fff;white-space:nowrap";
function goalMark(s, dt){
  const E = D.el, g = s.goal;
  if (!E.goal) return;
  if (!g){
    if (D.txt.goalOn){ D.txt.goalOn = 0; E.goal.style.opacity = "0"; E.goalC.style.opacity = "0"; }
    return;
  }
  D.txt.goalOn = 1;
  const d = Math.hypot(g.x - s.cam.x, g.z - s.cam.z);
  put("goalB", E.goalB, g.label || "Here");
  const p = s.proj ? s.proj(g.x, g.y != null ? g.y : 2.2, g.z) : null;
  if (p && p.on){ E.goal.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`; E.goal.style.opacity = "1"; }
  else E.goal.style.opacity = "0";
  // the compass: the bearing from where you look (0 ahead, + to the left), the arrow turned to it
  const b = wrapA(yawOf(g.x - s.cam.x, g.z - s.cam.z) - (s.yaw || 0));
  E.goalCI.style.transform = `rotate(${(-b).toFixed(3)}rad)`;
  put("goalCB", E.goalCB, `${g.label || "Here"}  ${d < 1.5 ? "here" : Math.round(d) + " m"}`);
  E.goalC.style.opacity = "1";
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

/* ---------- the warm-up (WP-W1, addendum A1.8) ----------
   s.warm (warmup.js warmHud): {name, how, i, n, sub: 'intro'|'go'|'outro', t, dur, streak, w: the guide's state, tab,
   scores}; s.warmIcon: {all, left (minutes), mins, fire, wait} | null. hudPop and hudSay are called as things happen */
const POP_MS = {rating:4200, great:1800, set:1500, streak:1500, info:1700, go:900};
export function hudPop(text, kind = "good", sub = ""){
  if (!D.root) return;
  const n = document.createElement("div");
  n.className = `fp-pop fp-pop-${kind}`;
  n.innerHTML = `<b>${esc(text)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}`;
  D.el.pops.appendChild(n);
  void n.offsetWidth; n.classList.add("in");
  D.pops.push({n, until:performance.now() + (POP_MS[kind] || 1000)});
  while (D.pops.length > 4){ const o = D.pops.shift(); o.n.remove(); }
}
// a line said to you (the coaches) or shouted from the bench (a team-mate): a subtitle under the middle of the view
export function hudSay(who, text, mate = false){
  if (!D.root) return;
  const E = D.el;
  // (a shout from the bench never talks over a coach who is still being read)
  if (mate && D.sayT > 1.6 && !E.say.classList.contains("mate")) return;
  E.sayB.textContent = who ? who + ":" : ""; E.sayS.textContent = text;
  E.say.classList.toggle("mate", !!mate);
  E.say.classList.remove("in"); void E.say.offsetWidth; E.say.classList.add("in");
  D.sayT = mate ? 2.6 : 4.8;
}
// the line on screen taken away (it no longer holds: you came on)
export function hudSayOff(){ if (!D.root) return; D.sayT = 0; D.el.say.classList.remove("in"); }
function warmFrame(s, dt, now, slow){
  const E = D.el, W = s.warm || null;
  // the pops float up and go
  for (let i = D.pops.length - 1; i >= 0; i--){ const p = D.pops[i]; if (now > p.until){ p.n.classList.add("out"); const n = p.n; setTimeout(() => n.remove(), 350); D.pops.splice(i, 1); } }
  if (D.sayT > 0 && (D.sayT -= dt) <= 0) E.say.classList.remove("in");
  // the Warm mark: the boost and its minutes left, fading as they run down; On fire after a goal or an assist
  const I = s.warmIcon || null;
  if (slow){
    if (I){
      put("warmB", E.warmB, I.fire ? "On fire" : `Warm +${I.all}`);
      put("warmS", E.warmS, `${Math.max(0, Math.ceil(I.wait ? I.mins : I.left))}'`);
      E.warm.className = "fp-warm on" + (I.fire ? " fire" : "") + (I.wait ? " wait" : "");
      E.warm.style.opacity = (I.wait ? .9 : .4 + .6*clamp(I.left/Math.max(1, I.mins), 0, 1)).toFixed(2);
    } else if (D.txt.warmB !== null){ D.txt.warmB = null; E.warm.className = "fp-warm"; }
  }
  // the set's panel
  E.wu.classList.toggle("on", !!W);
  if (!W){ if (D.wuKind){ D.wuKind = null; E.wuW.innerHTML = ""; E.wuW.className = "fp-wu-w"; D.wuEl = {}; } return; }
  if (slow){
    put("wuName", E.wuName, W.name); put("wuN", E.wuN, `${W.i + 1} of ${W.n}`); put("wuHow", E.wuHow, W.how);
    let dots = "";
    for (let i = 0; i < W.n; i++){ const sc = W.scores[i]; dots += `<i class="${i === W.i ? "now" : sc == null ? "" : sc >= .72 ? "hi" : sc >= .42 ? "mid" : "lo"}"></i>`; }
    putH("wuDots", E.wuDots, dots);
  }
  E.wuBar.style.transform = `scaleX(${(W.sub === "go" ? clamp(1 - W.t/W.dur, 0, 1) : W.sub === "intro" ? 1 : 0).toFixed(3)})`;
  // the guide round the crosshair
  const w = W.w, kind = w ? w.kind : null;
  if (kind !== D.wuKind){
    D.wuKind = kind; E.wuW.className = "fp-wu-w" + (kind ? " k-" + kind : ""); E.wuW.innerHTML = kind ? WIDGET[kind] : ""; D.wuEl = {}; D.beatPool = [];
    for (const el of E.wuW.querySelectorAll("[data-w]")) D.wuEl[el.dataset.w] = el;
  }
  if (!w) return;
  const G = D.wuEl, px = v => v.toFixed(1) + "px";
  switch (kind){
    case "beat": {
      // the approach ring closes on the target ring as the next footfall comes; the target flashes as a foot lands
      const k = clamp(w.next, 0, 1.4);
      G.ap.setAttribute("r", (16 + 34*k).toFixed(1)); G.ap.style.opacity = (.25 + .6*(1 - k/1.4)).toFixed(2);
      G.tg.style.strokeWidth = (2 + 3*w.flash).toFixed(2); G.tg.style.opacity = (.55 + .45*w.flash).toFixed(2);
      break;
    }
    case "strip": {
      // the beats slide in from the right to the hit line; A for the left leg, D for the right; the kicks in amber
      // (a pool of beat marks made as they are first needed and moved in place: no markup rebuilt a frame)
      const pool = D.beatPool;
      let n = 0;
      for (const b of w.beats){
        const x = 34 + (b.t - w.t)*150; if (x < 0 || x > 340 || b.done) continue;
        let m = pool[n];
        if (!m){ const el = document.createElement("i"); G.beats.appendChild(el); m = pool[n] = {el, c: "", t: "", on: true}; }
        const c = b.s > 0 ? (b.kick ? "l kick" : "l") : (b.kick ? "r kick" : "r"), t = b.s > 0 ? "A" : "D";
        if (m.c !== c){ m.c = c; m.el.className = c; }
        if (m.t !== t){ m.t = t; m.el.textContent = t; }
        if (!m.on){ m.on = true; m.el.hidden = false; }
        m.el.style.transform = `translateX(${x.toFixed(1)}px)`;
        n++;
      }
      for (let i = n; i < pool.length; i++) if (pool[i].on){ pool[i].on = false; pool[i].el.hidden = true; }
      put("wuKick", G.lab, w.kick ? "Butt kicks" : "High knees");
      break;
    }
    case "gauge":
      G.knob.style.transform = `translateY(${px(170*(1 - clamp(w.v, 0, 1)))})`;
      G.band.style.transform = `translateY(${px(170*(1 - w.target) - 170*w.band/2)})`; G.band.style.height = px(170*w.band);
      G.ghost.style.transform = `translateY(${px(170*(1 - w.target))})`;
      break;
    case "pend":
      G.guide.style.transform = `rotate(${(clamp(w.guide, -1.2, 1.2)*55).toFixed(1)}deg)`;
      G.me.style.transform = `rotate(${(clamp(w.v, -1.2, 1.2)*55).toFixed(1)}deg)`;
      break;
    case "circle":
      G.dot.setAttribute("cx", (70*clamp(w.x, -1.6, 1.6)).toFixed(1)); G.dot.setAttribute("cy", (70*clamp(w.y, -1.6, 1.6)).toFixed(1));
      trailPoints(G.trail, w.trail);
      break;
    case "balance": {
      const d = Math.hypot(w.x, w.y);
      G.dot.style.transform = `translate(${px(52*w.x)}, ${px(52*w.y)})`;
      G.dot.className = "dot " + (d < .3 ? "in" : d < .6 ? "near" : "out");
      break;
    }
    case "go":
      G.go.style.opacity = w.show.toFixed(2); G.go.style.transform = `scale(${(1 + .25*w.show).toFixed(3)})`;
      put("wuRt", G.rt, w.rt != null ? `Reaction ${w.rt.toFixed(2)} s` : "Wait for the call");
      break;
    case "juggle": put("wuTouch", G.n, `Touches ${w.touches}`); break;
    case "pass": {
      const p = w.at && s.proj ? s.proj(w.at.x, 2.15, w.at.z) : null;
      if (p && p.on){ G.mk.style.opacity = "1"; G.mk.style.transform = `translate(${px(p.x)}, ${px(p.y)})`; }
      else G.mk.style.opacity = "0";
      G.mk.classList.toggle("open", w.open >= 0);
      G.fill.style.transform = `scaleX(${(w.open >= 0 ? 1 - w.open : 0).toFixed(3)})`;
      break;
    }
  }
}
// the hip circles' trail onto its polyline: the points of the list moved in place, one added or taken away as the
// trail grows or shrinks (no points string built a frame)
function trailPoints(line, trail){
  const pts = line.points, svg = line.ownerSVGElement;
  if (!pts || !svg){ line.setAttribute("points", trail.map(p => `${(70*p[0]).toFixed(1)},${(70*p[1]).toFixed(1)}`).join(" ")); return; }
  while (pts.numberOfItems > trail.length) pts.removeItem(pts.numberOfItems - 1);
  while (pts.numberOfItems < trail.length) pts.appendItem(svg.createSVGPoint());
  for (let i = 0; i < trail.length; i++){ const q = pts.getItem(i); q.x = 70*trail[i][0]; q.y = 70*trail[i][1]; }
}
// the guides' markup (built once per exercise, moved by transforms each frame)
const WIDGET = {
  beat:`<svg class="w-beat" viewBox="-60 -60 120 120"><circle data-w="tg" class="tg" r="16"/><circle data-w="ap" class="ap" r="40"/></svg>`,
  strip:`<div class="w-strip"><div class="w-hit"></div><div data-w="beats" class="w-beats"></div><span data-w="lab" class="w-lab"></span></div>`,
  gauge:`<div class="w-gauge"><i data-w="band" class="band"></i><i data-w="ghost" class="ghost"></i><i data-w="knob" class="knob"></i></div>`,
  pend:`<div class="w-pend"><div class="arc"></div><i data-w="guide" class="guide"><b></b></i><i data-w="me" class="me"><b></b></i></div>`,
  circle:`<svg class="w-circle" viewBox="-115 -115 230 230"><circle class="ring" r="70"/><polyline data-w="trail" class="trail" points=""/><circle data-w="dot" class="dot" r="6"/></svg>`,
  balance:`<div class="w-bal"><i class="zone2"></i><i class="zone"></i><i data-w="dot" class="dot"></i></div>`,
  go:`<div class="w-go"><b data-w="go">GO!</b><span data-w="rt"></span></div>`,
  juggle:`<div class="w-jug"><span data-w="n"></span></div>`,
  pass:`<div data-w="mk" class="w-pass"><i><b data-w="fill"></b></i><span>Now!</span></div>`
};

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
  // (UF2-A: how much the game helps you: the first touch, the pass's aim and the meter's sweet spot)
  rows.push(["Assists", seg("assist", [["on", "On"], ["low", "Low"], ["off", "Off"]], SET.assist)]);
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
