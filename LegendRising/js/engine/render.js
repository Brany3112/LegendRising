"use strict";
/* ============ CANVAS + DRAWING ============ */
const VIEW = {x0:-3, x1:71, y0:-11, y1:45};
let cv = null, cx = null, scale = 1, offX = 0, offY = 0, DPR = 1, TOPM = 80, NEED_DRAW = true, BGC = null;
// the band under the score banner where the hint and the clock bar sit: the goal (net, crossbar, the keeper's head)
// is always drawn below it. HUDB: its reserved bottom; HUDB_S: the same, eased, when the hint takes more lines.
let HUDB = 120, HUDB_S = 120, HINT_B = 120;
const NET_TOP = -2.6;                                 // the back of the net and the keeper's head, in pitch metres
// On phones the whole pitch is far too small, so the camera zooms in and follows the play.
let ZOOM = false, CAM = {x:34, y:20}, CAMT = {x:34, y:20};
const LAYER = {x0:-9, y0:-20, x1:77, y1:52};       // world area pre-rendered into the background layer
const CAM_TOP = -14;                                 // a following camera looks no further up than this, unless the goal needs it

function setupCanvas(){
  cv = $("#pitch"); try{ cx = cv.getContext("2d"); }catch(e){ cx = null; }
  resize();
  cv.addEventListener("pointerdown", onDown);
  cv.addEventListener("pointermove", onMove);
  cv.addEventListener("pointerup", onUp);
  cv.addEventListener("pointercancel", onUp);
}
function resize(){
  if (!cv) return;
  const r = cv.getBoundingClientRect(); DPR = GFX.low ? 1 : Math.min(1.5, window.devicePixelRatio || 1); NEED_DRAW = true; BGC = null;
  cv.width = Math.max(1, r.width*DPR); cv.height = Math.max(1, r.height*DPR);
  const cssW = r.width, aspect = cv.width/cv.height;
  ZOOM = cssW < 900 || aspect < 1.25;                 // phones and narrow windows
  // top of the free pitch area = just under the score banner (whatever size it is on this screen)
  const sb = document.querySelector(".scorebug");
  const sbBot = sb ? sb.getBoundingClientRect().bottom - r.top : 70;
  TOPM = (sbBot + 6)*DPR;
  HUDB = HUDB_S = HINT_B = TOPM + 44*DPR;              // one line of hint and the clock bar under it
  if (ZOOM){
    const viewW = aspect < .8 ? 34 : aspect < 1.1 ? 42 : 50;     // metres across the screen
    scale = cv.width/viewW;
    CAM.x = CAMT.x; CAM.y = CAMT.y; applyCam();
  } else {
    // the whole pitch fits, the stands share what is left, and the goal stays clear of the band under the banner
    const vw = VIEW.x1-VIEW.x0, vh = VIEW.y1-VIEW.y0, gap = 4*DPR;
    scale = Math.min(cv.width/vw, cv.height/vh, (cv.height - HUDB - gap)/(VIEW.y1 - NET_TOP));
    offX = (cv.width - vw*scale)/2 - VIEW.x0*scale;
    offY = Math.max((cv.height - vh*scale)/2 - VIEW.y0*scale, HUDB + gap - NET_TOP*scale);
  }
  // everything that floats over the pitch starts below the score banner, so nothing ever covers it
  const scr = document.querySelector(".match-screen");
  if (scr) scr.style.setProperty("--sb-bottom", Math.round(sbBot + 8) + "px");
}
// view-independent helpers used by the engine
function screenToWorld(px, py){ return {x:wx(px), y:wy(py)}; }
function worldToScreen(x, y, z){ return {x:sx(x), y:sy(y - (z-BR)*.55)}; }
function pullToAngle(px, py){ return Math.atan2(-py, -px); }
window.addEventListener("resize", resize);
const sx = x => offX + x*scale, sy = y => offY + y*scale;
function applyCam(){
  const halfW = cv.width/2/scale, halfH = cv.height/2/scale;
  // up by the goal the camera may rise a little higher than usual, so the net drops below the hint band
  const goalLo = NET_TOP - (HUDB_S + 4*DPR - cv.height/2)/scale;
  const lo = Math.max(LAYER.y0 + halfH, Math.min(CAM_TOP + halfH, goalLo));
  const cx_ = clamp(CAM.x, LAYER.x0 + halfW, LAYER.x1 - halfW), cy_ = clamp(CAM.y, lo, Math.max(lo, LAYER.y1 - halfH));
  offX = cv.width/2 - cx_*scale; offY = cv.height/2 - cy_*scale;
}
// follow the ball, looking a little towards the goal so you can see where you're going
function camFollow(dt){
  if (!ZOOM) return;
  let bx = 34, by = 20;
  if (REP){ const f = REP.frames[Math.min(REP.frames.length - 1, Math.floor(REP.i))]; if (f){ bx = f.b[0]; by = f.b[1]; } }
  else if (M){ bx = M.ball.x; by = M.ball.y; if (M.phase === "dribble" || M.phase === "rebound"){ bx += M.p.vx*.35; by += M.p.vy*.35; } }
  CAMT.x = bx*.75 + 34*.25; CAMT.y = Math.min(by, by*.72 + 4);
  HUDB_S += (HUDB - HUDB_S)*Math.min(1, dt*6);                  // a hint that grows a line eases the goal down
  const k = Math.min(1, dt*4.5);
  CAM.x += (CAMT.x - CAM.x)*k; CAM.y += (CAMT.y - CAM.y)*k;
  applyCam();
}
const wx = px => (px - offX)/scale, wy = py => (py - offY)/scale;
function toCanvas(e){ const r = cv.getBoundingClientRect(); return {x:(e.clientX-r.left)*cv.width/r.width, y:(e.clientY-r.top)*cv.height/r.height}; }
const font = (w, px) => `${w} ${px*DPR}px "Barlow Condensed", "Arial Narrow", sans-serif`;

function line(x1, y1, x2, y2){ cx.beginPath(); cx.moveTo(sx(x1), sy(y1)); cx.lineTo(sx(x2), sy(y2)); cx.stroke(); }
/* ---------- stadiums: bigger clubs, bigger grounds ---------- */
let STAD_CACHE = null;
function stadiumLayer(){
  if (!MT || !MT.stad) return null;
  const st = MT.stad, key = `${cv.width}x${cv.height}:${st.tier}:${MT.myKit[0]}:${MT.oppKit[0]}:${st.crowd}`;
  if (STAD_CACHE && STAD_CACHE.key === key) return STAD_CACHE.c;
  const c = document.createElement("canvas"); c.width = cv.width; c.height = cv.height;
  const g = c.getContext && c.getContext("2d"); if (!g) return null;
  drawStadiumTo(g, st); STAD_CACHE = {key, c, regions:STAD_REGIONS}; return c;
}
let STAD_REGIONS = [];
function drawStadiumTo(g, st){
  const W_ = cv.width, H = cv.height, t = st.tier, homeKit = MT.home ? MT.myKit : MT.oppKit, awayKit = MT.home ? MT.oppKit : MT.myKit;
  const fill = clamp(st.crowd/(st.cap || 80000), .05, 1), rng = (() => { let x = 1234567 + t*99; return () => (x = (x*16807) % 2147483647)/2147483647; })();
  const top = [0, 0, W_, sy(-4.3)], left = [0, 0, sx(-2.8), H], right = [sx(70.8), 0, W_ - sx(70.8), H];
  // surround: grass, running track or dark apron
  g.fillStyle = ["#2a5f35","#2c6437","#8a4b32","#1d4a2a","#173d23"][t];
  g.fillRect(0, 0, W_, sy(-1.2)); g.fillRect(0, 0, sx(-1.2), H); g.fillRect(sx(69.2), 0, W_ - sx(69.2), H);
  g.fillStyle = "#2f6d3d"; g.fillRect(sx(-1.2), sy(-1.2), sx(69.2) - sx(-1.2), H);
  const regions = t === 0 ? [] : t === 1 ? [top] : [top, left, right];
  STAD_REGIONS = regions.filter(r => r[2] > 6 && r[3] > 6);
  const standCol = ["#3a4048","#4a525c","#5b6470","#20262e","#161b22"][t];
  for (const [x, y, w, h] of STAD_REGIONS){
    g.fillStyle = standCol; g.fillRect(x, y, w, h);
    const horiz = w > h, rowGap = 9*DPR, seat = 7*DPR;
    // terraces: alternating row shading so the stand reads as steps
    for (let a = 0; a < (horiz ? h : w); a += rowGap){
      g.fillStyle = (a/rowGap) % 2 ? "rgba(255,255,255,.035)" : "rgba(0,0,0,.12)";
      horiz ? g.fillRect(x, y + a, w, rowGap) : g.fillRect(x + a, y, rowGap, h);
    }
    // fans seen from above: a shirt in (muted) club colours with a head on top, slightly jittered
    const mute = c => { const v = rgbOf(c); return v ? `rgb(${v.map(q => Math.round((q*.78 + .06)*255)).join(",")})` : c; };
    const shirts = [mute(homeKit[0]), mute(homeKit[0]), mute(homeKit[1]), mute(awayKit[0]), "#5b6572", "#3a3f47", "#8a7f70"];
    const hair = ["#231a14","#3b2a1f","#12100e","#6b4a2e","#b08a5a","#2f2f33"];
    for (let a = rowGap*.5; a < (horiz ? h : w); a += rowGap){
      for (let b = seat*.5; b < (horiz ? w : h); b += seat){
        if (rng() > fill*.9) continue;
        const jx = (rng() - .5)*2*DPR, jy = (rng() - .5)*2*DPR;
        const px = (horiz ? x + b : x + a) + jx, py = (horiz ? y + a : y + b) + jy;
        g.fillStyle = shirts[Math.floor(rng()*(rng() < .7 ? 3 : shirts.length))];
        g.beginPath(); g.ellipse(px, py, 2.9*DPR, 2.3*DPR, 0, 0, 7); g.fill();
        g.fillStyle = hair[Math.floor(rng()*hair.length)];
        g.beginPath(); g.arc(px, py - .6*DPR, 1.35*DPR, 0, 7); g.fill();
      }
    }
    // roof shadow on the outer edge of big grounds
    if (t >= 3){ const gr = horiz ? g.createLinearGradient(0, y, 0, y + h*.5) : (x === 0 ? g.createLinearGradient(x, 0, x + w*.5, 0) : g.createLinearGradient(x + w, 0, x + w*.5, 0));
      gr.addColorStop(0, "rgba(0,0,0,.55)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(x, y, w, h); }
  }
  if (t === 0){
    // local ground: a fence and a few people standing along it
    g.strokeStyle = "rgba(230,230,230,.8)"; g.lineWidth = 2*DPR; g.strokeRect(sx(-2), sy(-3), sx(70) - sx(-2), H);
    const n = Math.min(160, Math.round(st.crowd/4));
    for (let i = 0; i < n; i++){ const side = rng(); let px, py;
      if (side < .5){ px = sx(-1.5) + rng()*(sx(69.5) - sx(-1.5)); py = sy(-3.8) - rng()*6*DPR; } else if (side < .75){ px = sx(-2.6) - rng()*8*DPR; py = sy(-3) + rng()*(H - sy(-3)); } else { px = sx(70.6) + rng()*8*DPR; py = sy(-3) + rng()*(H - sy(-3)); }
      g.fillStyle = rng() < .6 ? homeKit[0] : "#d9d4c7"; g.beginPath(); g.arc(px, py, 2.6*DPR, 0, 7); g.fill(); }
    for (let i = 0; i < 14; i++){ g.fillStyle = "rgba(16,48,24,.9)"; g.beginPath(); g.arc(rng()*W_, rng()*sy(-6), (10 + rng()*16)*DPR, 0, 7); g.fill(); }
  }
  if (t >= 2){
    // advertising boards (LED on the big grounds)
    g.font = `800 ${Math.max(8, .5*scale)}px "Barlow Condensed", sans-serif`; g.textBaseline = "middle";
    const board = (x1, y1, x2, y2) => { const vert = x1 === x2; g.fillStyle = t >= 3 ? "#0b1b33" : "#e9e9e9";
      if (vert) g.fillRect(sx(x1) - .35*scale, sy(y1), .7*scale, sy(y2) - sy(y1)); else g.fillRect(sx(x1), sy(y1) - .35*scale, sx(x2) - sx(x1), .7*scale); };
    board(-1, -3.2, 69, -3.2); board(-2.1, -3, -2.1, 45); board(70.1, -3, 70.1, 45);
    g.fillStyle = t >= 3 ? "#c8f060" : "#1b2a5a"; g.textAlign = "center";
    for (let x = 4; x < 68; x += 16) g.fillText(x % 32 < 16 ? "ENERGY-UP" : "LEGEND RISING", sx(x), sy(-3.2));
  }
  if (t >= 3){
    // floodlight glow in the corners
    for (const [fx, fy] of [[0, 0], [W_, 0], [0, H], [W_, H]]){ const r = Math.max(W_, H)*.35, gr = g.createRadialGradient(fx, fy, 0, fx, fy, r);
      gr.addColorStop(0, `rgba(255,244,210,${t === 4 ? .28 : .18})`); gr.addColorStop(1, "rgba(255,244,210,0)"); g.fillStyle = gr; g.fillRect(0, 0, W_, H); }
  }
}

/* ---------- chants from the stands ----------
   Only where there are actually people: the tiers with stands, and only once the ground is busy enough. */
let CHANT = null, CHANT_T = 0;
function chantText(){
  const cc = (MT.f && MT.f.kind === "L" && W.clubs[MT.f.h] ? W.clubs[MT.f.h].cc : myClub().cc) || "ROU";
  const pool = (CHANTS.common || []).concat(CHANTS[cc] || []);
  const my = MT.my, behind = MT.score[0] < MT.score[1];
  if (my.goals > 0 && Math.random() < .35) pool.push(...CHANTS.goal);
  else if (my.misses > 0 && Math.random() < .2) pool.push(...CHANTS.miss);
  if (behind && Math.random() < .3) pool.push(...CHANTS.losing);
  if (MT.stad.crowd > 40000 && Math.random() < .25) pool.push(...CHANTS.big);
  const full = S.player.name.trim(), bits = full.split(/\s+/);
  const first = bits[0] || full, last = bits.length > 1 ? bits[bits.length - 1] : full;
  return pick(pool).replace(/\{f\}/g, first).replace(/\{l\}/g, last).replace(/\{n\}/g, full).replace(/\{c\}/g, myClub().nm);
}
function updateChant(dt){
  if (!MT || !MT.stad || MT.stad.tier < 1 || MT.stad.crowd < 4000){ CHANT = null; return; }   // no stands, no singing
  CHANT_T -= dt;
  if (CHANT){ CHANT.life -= dt; if (CHANT.life <= 0) CHANT = null; return; }
  if (CHANT_T > 0 || !STAD_REGIONS.length) return;
  const loud = clamp(MT.stad.crowd/70000, .12, 1);
  CHANT_T = rnd(5, 11)/(.5 + loud)*(GFX.low ? 1.5 : 1);
  const [x, y, w, h] = pick(STAD_REGIONS);
  CHANT = {text:chantText(), x:x + w*rnd(.2, .8), y:y + h*rnd(.25, .75), life:3.4, t:0, side:x > cv.width*.5 ? -1 : 1};
}
function drawChant(){
  if (!CHANT) return;
  const c = cx, f = 1 - CHANT.life/3.4;
  const rise = Math.min(1, f*4), fade = CHANT.life < .7 ? CHANT.life/.7 : 1;
  c.save();
  c.globalAlpha = .95*fade*rise;
  c.font = font(700, 13);
  const pad = 9*DPR, tw = c.measureText(CHANT.text).width, bw = tw + pad*2, bh = 23*DPR;
  let bx = clamp(CHANT.x - bw/2, 6*DPR, cv.width - bw - 6*DPR);
  let by = clamp(CHANT.y - 12*DPR - rise*10*DPR, TOPM + 4*DPR, cv.height - bh - 8*DPR);
  // a song from the stand behind the goal keeps out from under the hint: it goes to whichever side has the room
  if (M && HL.lines.length && by < HINT_B && by + bh > TOPM){
    const hl = (cv.width - HL.w)/2 - 16*DPR, hr = (cv.width + HL.w)/2 + 16*DPR;
    if (bx < hr && bx + bw > hl){
      if (hl - bw >= 6*DPR && (CHANT.x < cv.width/2 || cv.width - hr - bw < 6*DPR)) bx = hl - bw;
      else if (cv.width - hr - bw >= 6*DPR) bx = hr;
      else { c.restore(); return; }
    }
  }
  c.fillStyle = "rgba(10,16,26,.9)";
  roundRect(c, bx, by, bw, bh, 8*DPR); c.fill();
  c.strokeStyle = "rgba(255,255,255,.28)"; c.lineWidth = 1.5*DPR; roundRect(c, bx, by, bw, bh, 8*DPR); c.stroke();
  c.beginPath(); c.moveTo(bx + bw*.5 - 5*DPR, by + bh); c.lineTo(bx + bw*.5 + 5*DPR, by + bh); c.lineTo(bx + bw*.5, by + bh + 7*DPR); c.closePath();
  c.fillStyle = "rgba(10,16,26,.9)"; c.fill();
  c.fillStyle = "#eaf2fb"; c.textAlign = "left"; c.textBaseline = "middle";
  c.fillText(CHANT.text, bx + pad, by + bh*.55);
  c.restore();
}
function drawCrowdFx(){
  // camera flashes in the giant arenas
  if (!MT || !MT.stad || MT.stad.tier < 4 || !STAD_REGIONS.length) return;
  for (let i = 0; i < 3; i++){ if (Math.random() > .5) continue; const [x, y, w, h] = pick(STAD_REGIONS);
    const px = x + Math.random()*w, py = y + Math.random()*h, gr = cx.createRadialGradient(px, py, 0, px, py, 7*DPR);
    gr.addColorStop(0, "rgba(255,255,255,.95)"); gr.addColorStop(1, "rgba(255,255,255,0)"); cx.fillStyle = gr; cx.fillRect(px - 7*DPR, py - 7*DPR, 14*DPR, 14*DPR); }
}
// the pitch, stadium, lines and goal never move: draw them once into a cached layer and just copy it each frame
function drawPitch(){
  const key = `${Math.round(scale)}:${cv.width}x${cv.height}:${ZOOM}:${MT && MT.stad ? MT.stad.tier + ":" + MT.stad.crowd + MT.myKit[0] + MT.oppKit[0] : "none"}`;
  if (!BGC || BGC.key !== key){
    const w = Math.ceil((LAYER.x1 - LAYER.x0)*scale), h = Math.ceil((LAYER.y1 - LAYER.y0)*scale);
    const c = document.createElement("canvas"); c.width = ZOOM ? w : cv.width; c.height = ZOOM ? h : cv.height;
    const g = c.getContext && c.getContext("2d");
    if (g){
      const keepC = cx, keepX = offX, keepY = offY, keepW = cv.width, keepH = cv.height;
      cx = g;
      if (ZOOM){ offX = -LAYER.x0*scale; offY = -LAYER.y0*scale; cv = {width:w, height:h, getBoundingClientRect:() => ({left:0, top:0, width:w, height:h})}; }
      drawPitchRaw();
      cx = keepC; offX = keepX; offY = keepY; cv = $("#pitch"); cv.width = keepW; cv.height = keepH;
      BGC = {key, c};
    } else { drawPitchRaw(); return; }
  }
  if (ZOOM) cx.drawImage(BGC.c, sx(LAYER.x0), sy(LAYER.y0)); else cx.drawImage(BGC.c, 0, 0);
  if (!GFX.low) drawCrowdFx();
}
function drawPitchRaw(){
  const c = cx; c.fillStyle = "#2f6d3d"; c.fillRect(0, 0, cv.width, cv.height);
  for (let y = -10, i = 0; y < 60; y += 5, i++) if (i%2 === 0){ c.fillStyle = "#357647"; c.fillRect(0, sy(y), cv.width, 5*scale); }
  const layer = stadiumLayer();
  if (layer){ c.save(); c.beginPath(); c.rect(0, 0, cv.width, cv.height); c.rect(sx(-1.2), sy(-1.2), sx(69.2) - sx(-1.2), cv.height); c.clip("evenodd"); c.drawImage(layer, 0, 0); c.restore(); }
  else { c.fillStyle = "rgba(0,0,0,.12)"; c.fillRect(0, 0, sx(0), cv.height); c.fillRect(sx(68), 0, cv.width - sx(68), cv.height); }
  c.strokeStyle = "rgba(255,255,255,.85)"; c.lineWidth = Math.max(1.2, .12*scale);
  line(0,0,68,0); line(0,0,0,60); line(68,0,68,60);
  c.strokeRect(sx(BOX.x0), sy(0), (BOX.x1-BOX.x0)*scale, BOX.y1*scale);
  c.strokeRect(sx(24.84), sy(0), 18.32*scale, 5.5*scale);
  c.beginPath(); c.arc(sx(34), sy(11), 9.15*scale, .6448, Math.PI-.6448); c.stroke();
  c.fillStyle = "#fff"; c.beginPath(); c.arc(sx(34), sy(11), .2*scale, 0, 7); c.fill();
  c.beginPath(); c.arc(sx(0), sy(0), scale, 0, Math.PI/2); c.stroke();
  c.beginPath(); c.arc(sx(68), sy(0), scale, Math.PI/2, Math.PI); c.stroke();
  c.fillStyle = "rgba(255,255,255,.14)"; c.fillRect(sx(GOAL.L), sy(-2), (GOAL.R-GOAL.L)*scale, 2*scale);
  c.strokeStyle = "rgba(255,255,255,.35)"; c.lineWidth = 1;
  for (let x = GOAL.L; x <= GOAL.R; x += .5) line(x, -2, x, 0);
  for (let y = -2; y <= 0; y += .5) line(GOAL.L, y, GOAL.R, y);
  c.strokeStyle = "#fff"; c.lineWidth = Math.max(2, .16*scale);
  line(GOAL.L, 0, GOAL.L, -2); line(GOAL.R, 0, GOAL.R, -2); line(GOAL.L, -2, GOAL.R, -2);
  c.fillStyle = "#fff"; for (const x of [GOAL.L, GOAL.R]){ c.beginPath(); c.arc(sx(x), sy(0), .14*scale, 0, 7); c.fill(); }
}
/* ---------- footballers ----------
   Everyone on the pitch is a small figure in the style of the 3D cast (js/life/human.js): a shirt with sleeves and a
   collar, shorts, socks and boots, skin and a hairstyle from the same palettes, seeded by the player's id so the same
   man always looks the same (figLookFor draws lookFor's random numbers in lookFor's order). A body is posed in metres
   in its own frame (s: to his right, q: ahead, z: up) and projected the way the pitch is seen — the ground 1:1, heights
   foreshortened — at FIG.kh × life size across and FIG.kv × up, so a man reads on a phone. The legs stride the way he
   is really moving (forwards, back-pedalling, side-stepping) at a cadence that follows his speed, the arms swing
   against them, and standing still brings the feet together. He faces where he runs, or the ball.
   Nothing is allocated per frame: looks and kit colours are cached, motion lives in a WeakMap keyed by the engine's
   own objects (by slot during a replay), and the draw list is a fixed pool sorted back to front. */
const FIG = {kh:2.5, kv:1.22, top:1.78};            // across, up (× scale per metre); top: head height in body metres
const FIG_SKINS = [0xf3d3bb, 0xeac2a4, 0xdcab88, 0xc9926a, 0xb07a55, 0x8f5d3f, 0x6c4531, 0x4e3226];
const FIG_HC = {black:0x15110e, dark:0x2b1d15, brown:0x4a3122, light:0x7a5537, blond:0xb08b58, ginger:0x8f4628, grey:0x8f8b85, white:0xcdcac4};
const FIG_BOOTS = [[0x15161a, 0xf2f2f0], [0xf2f2f0, 0x15161a], [0xd8ff3a, 0x15161a], [0xf06a1e, 0x15161a], [0x2a64d8, 0xf2f2f0], [0xd32f3a, 0xf2f2f0], [0x15161a, 0xd8ff3a]];
// hair as a cap over the scalp: [shift back, shift up, radius, thickness beyond the head] (× head radius) + what hangs
const FIG_HAIR = {short:[.26, .22, .98, .07], fade:[.34, .3, .9, .02], buzz:[.3, .26, .95, 0], messy:[.24, .2, 1, .13], curly:[.22, .2, 1.02, .2],
  afro:[.14, .22, 1.22, .42], long:[.24, .2, 1, .1], ponytail:[.28, .22, .96, .05], bun:[.28, .22, .96, .05], braids:[.26, .22, .98, .06],
  cornrows:[.32, .28, .92, .03], dreads:[.22, .2, 1, .12], horseshoe:[.62, -.12, .9, .02], bald:null};
const FIG_BUILD = {slim:.92, average:1, athletic:1.04, stocky:1.08, muscular:1.11};
function figRng(seed){
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0)/4294967296; };
}
const figHash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const figW = (r, list) => { let tot = 0; for (const e of list) tot += e[1]; let x = r()*tot; for (const e of list){ if ((x -= e[1]) <= 0) return e[0]; } return list[list.length - 1][0]; };
const figSeed = id => typeof id === "number" && isFinite(id) ? id | 0 : figHash(String(id == null ? "x" : id));
// any css colour (#rgb, #rrggbb, hsl(), rgb(), names) → [r, g, b] 0–255, once per colour
const FIG_RGB = new Map(); let FIG_CX = null;
function figRGB(col){
  if (typeof col === "number") return [(col >> 16) & 255, (col >> 8) & 255, col & 255];
  const k = String(col); let v = FIG_RGB.get(k); if (v) return v;
  v = [128, 128, 128];
  if (!FIG_CX){ const t = document.createElement("canvas"); t.width = t.height = 1; FIG_CX = t.getContext && t.getContext("2d"); }
  if (FIG_CX){ FIG_CX.fillStyle = "#808080"; FIG_CX.fillStyle = k; const s = FIG_CX.fillStyle;
    if (s[0] === "#"){ const n = parseInt(s.slice(1, 7), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    else { const m = s.match(/[\d.]+/g); if (m && m.length >= 3) v = [+m[0], +m[1], +m[2]]; } }
  FIG_RGB.set(k, v); return v;
}
const figCss = (v, f = 1, w = 0) => `rgb(${v.map(q => Math.round(clamp((q*f)*(1 - w) + 255*w, 0, 255))).join(",")})`;
const figLum = v => (.3*v[0] + .59*v[1] + .11*v[2])/255;
const figLin = q => { q /= 255; return q <= .04045 ? q/12.92 : Math.pow((q + .055)/1.055, 2.4); };
/* human.js lookFor("footballer" | "goalkeeper", seed, {kit}) reduced to what a match figure shows. It draws the same
   random numbers in the same order (footballers are men in their twenties, so the branches that never fire for them
   still take their number), which keeps a man seeded with his id here the man lookFor makes with that seed. */
function figLookFor(role, seed, kit0){
  const gk = role === "goalkeeper", r = figRng(figHash(role) ^ Math.imul(seed | 0, 2654435761));
  const pick = a => a[Math.floor(r()*a.length) % a.length];
  r();                                                                 // sex: a man
  const age = Math.round(gk ? 19 + 16*r() : 18 + 15*r());
  const tone = Math.floor(r()*FIG_SKINS.length), dark = tone >= 5, mid = tone >= 3 && tone < 5;
  const hairColor = FIG_HC[figW(r, dark ? [["black", .8], ["dark", .2]] : mid ? [["black", .5], ["dark", .4], ["brown", .1]]
    : [["black", .12], ["dark", .3], ["brown", .26], ["light", .15], ["blond", .13], ["ginger", .04]])];
  r();                                                                 // greying: not at his age
  let hair = figW(r, dark ? [["buzz", .2], ["fade", .24], ["short", .08], ["afro", .1], ["curly", .12], ["braids", .05], ["cornrows", .06], ["dreads", .1], ["bald", .05]]
    : [["short", .32], ["fade", .2], ["buzz", .12], ["messy", .14], ["curly", .08], ["long", .05], ["bald", .04], ["dreads", .02], ["ponytail", .03]]);
  if (age > 32 && r() < (age - 30)/40){ r(); if (!["short", "buzz", "fade", "messy"].includes(hair)) hair = "short"; }
  const beard = figW(r, [["", .55], ["stubble", .3], ["beard", .15]]);
  r();                                                                 // eyes
  const build = figW(r, gk ? [["athletic", .5], ["average", .25], ["slim", .1], ["muscular", .15]] : [["athletic", .45], ["slim", .2], ["average", .2], ["muscular", .1], ["stocky", .05]]);
  const height = .95 + .11*r() + (gk ? .03 : 0);
  for (let i = 0; i < 5; i++) r();                                     // face
  const L = {skin:FIG_SKINS[tone], hair, hairColor, beard, build, height};
  if (gk){
    const opts = FIG_GK.filter(c => figKitDist(c, kit0 || "#2c66b8") > .5);
    L.gkShirt = pick(opts); L.boots = pick(FIG_BOOTS); L.glove = pick([0xf2f2ee, 0xd8ff3a, 0xf06a1e]);
  } else L.boots = pick(FIG_BOOTS);
  return L;
}
const FIG_GK = [0x2f9e44, 0xf2c230, 0xf07a1a, 0x24262b, 0x7a3fb0, 0x1fa2c4];
// how far apart two kit colours are (linear rgb, summed), as lookFor measures it
function figKitDist(a, b){ const p = figRGB(a), q = figRGB(b); return Math.abs(figLin(p[0]) - figLin(q[0])) + Math.abs(figLin(p[1]) - figLin(q[1])) + Math.abs(figLin(p[2]) - figLin(q[2])); }
// a look → the colours a figure is painted with (css strings, worked out once)
function figPaint(L, gk){
  const sk = figRGB(L.skin), hc = figRGB(L.hairColor), bt = figRGB(L.boots[0]);
  const P = {skin:figCss(sk), skinD:figCss(sk, .8), hair:figCss(hc), style:FIG_HAIR[L.hair] !== undefined ? L.hair : "short",
    beard:L.beard || "", bw:FIG_BUILD[L.build] || 1, ht:clamp(+L.height || 1, .9, 1.1), boot:figCss(bt), bootS:figCss(figRGB(L.boots[1])), gk:null};
  if (gk){ const g = figRGB(L.gkShirt); P.gk = {shirt:figCss(g), shirtD:figCss(g, .76), shirtL:figCss(g, 1, .16), shorts:"#1c1d21", shortsD:"#141518", sock:figCss(g), trim:"#1c1d21",
    num:figLum(g) > .55 ? "#16181c" : "#f4f4f2", glove:figCss(figRGB(L.glove))}; }
  return P;
}
const FIG_LOOKS = new Map();
function figLook(role, seed, kit0){
  const key = role + ":" + seed + ":" + (role === "goalkeeper" ? kit0 : "");
  let P = FIG_LOOKS.get(key);
  if (!P){ P = figPaint(figLookFor(role, seed, kit0), role === "goalkeeper"); FIG_LOOKS.set(key, P); }
  return P;
}
// you: your own look (S.player.look) in your boots; anything missing falls back to a seeded footballer
function figMine(){
  const L = S.player && S.player.look, seed = figHash(String(S.cid || "player")) % 100000;
  const key = "me:" + seed + ":" + (L ? [L.skin, L.hair, L.hairColor, L.beard, L.build, L.height].join(",") : "");
  let P = FIG_LOOKS.get(key);
  if (!P){
    const d = figLookFor("footballer", seed), ok = (v, f) => v !== undefined && v !== null && f(v);
    if (L && typeof L === "object"){
      const col = v => typeof v === "number" ? isFinite(v) : typeof v === "string" && /^#?[0-9a-f]{6}$/i.test(v);
      const hx = v => typeof v === "number" ? v : parseInt(String(v).replace("#", ""), 16);
      if (ok(L.skin, col)) d.skin = hx(L.skin);
      if (ok(L.hairColor, col)) d.hairColor = hx(L.hairColor);
      if (ok(L.hair, v => FIG_HAIR[v] !== undefined)) d.hair = L.hair;
      if (ok(L.beard, v => ["", "stubble", "beard"].includes(v))) d.beard = L.beard;
      if (ok(L.build, v => FIG_BUILD[v])) d.build = L.build;
      if (ok(L.height, v => isFinite(+v))) d.height = +L.height;
    }
    P = figPaint(d, false); FIG_LOOKS.set(key, P);
  }
  return P;
}
// a kit pair → shirt, its shaded and lit sides, shorts, socks, trim and a number colour that reads on the shirt
const FIG_KITS = new Map(), FIG_KITA = new WeakMap();
function figKit(kit){
  let K = kit && typeof kit === "object" ? FIG_KITA.get(kit) : null;
  if (K && K.a === kit[0] && K.b === kit[1]) return K;
  const a = kit && kit[0] || "#2c66b8", b = kit && kit[1] || "#ffffff", key = a + "|" + b;
  K = FIG_KITS.get(key);
  if (!K){
    const s = figRGB(a), o = figRGB(b), far = Math.abs(figLum(s) - figLum(o)) > .22;
    K = {shirt:figCss(s), shirtD:figCss(s, .76), shirtL:figCss(s, 1, .16), shorts:figCss(o), shortsD:figCss(o, .78), sock:figCss(s), trim:figCss(o),
      num:far ? figCss(o) : (figLum(s) > .55 ? "#16181c" : "#f4f4f2"), a:kit && kit[0], b:kit && kit[1]};
    FIG_KITS.set(key, K);
  }
  if (kit && typeof kit === "object") FIG_KITA.set(kit, K);
  return K;
}
// the men in the match: team-mates by id, the other side by its own XI (the keeper too), wall men after the back line
let FIG_OPP = null;
function figOppIds(){
  if (FIG_OPP && FIG_OPP.mt === MT) return FIG_OPP;
  const xi = MT && Array.isArray(MT.themXI) ? MT.themXI.filter(p => p) : [], out = xi.filter(p => p.pos !== "GK"), gk = xi.find(p => p.pos === "GK");
  const base = figHash(String(MT && MT.nameThem || "them"));
  FIG_OPP = {mt:MT, ids:out.map(p => figSeed(p.id)), gk:gk ? figSeed(gk.id) : base + 7, base};
  return FIG_OPP;
}
const FIG_NUM_OPP = [5, 4, 2, 3, 6, 8, 11, 7, 10, 9, 14, 15, 16, 17, 18];
const FIG_NUM_MATE = {ST:9, LW:11, RW:7, CAM:10, CM:8};
function figOpp(i){ const o = figOppIds(), id = o.ids.length ? o.ids[i % o.ids.length] + (i >= o.ids.length ? 977*Math.floor(i/o.ids.length) : 0) : o.base + 31*(i + 1); return figLook("footballer", id); }
/* their keeper: lookFor picks his shirt to stand out from his own side only; on this pitch he must not wear yours either,
   so a shirt too near your shirt or shorts moves on to the next one in the same list that is far from all three
   (only the paint changes: his face, hair and build stay the man lookFor made) */
function figKeeper(){
  const o = figOppIds(), them = MT && MT.oppKit ? MT.oppKit : ["#2c66b8", "#fff"], us = MT && MT.myKit ? MT.myKit : ["#c0392b", "#fff"];
  const key = "gk:" + o.gk + ":" + them[0] + ":" + us[0] + ":" + us[1];
  let P = FIG_LOOKS.get(key); if (P) return P;
  const L = figLookFor("goalkeeper", o.gk, them[0]), far = c => Math.min(figKitDist(c, them[0]), figKitDist(c, us[0]), figKitDist(c, us[1]));
  if (far(L.gkShirt) <= .5){
    const i0 = Math.max(0, FIG_GK.indexOf(L.gkShirt)); let best = L.gkShirt, bd = far(best);
    for (let k = 1; k < FIG_GK.length; k++){ const c = FIG_GK[(i0 + k) % FIG_GK.length], d = far(c); if (d > .5){ best = c; break; } if (d > bd){ bd = d; best = c; } }
    L.gkShirt = best;
  }
  P = figPaint(L, true); FIG_LOOKS.set(key, P); return P;
}
function figMate(pid, role){
  let id = pid;
  if (id == null && MT && MT.roleNames && MT.roleNames[role]) id = MT.roleNames[role].id;
  return figLook("footballer", id == null ? figHash(String(role)) : figSeed(id));
}
function figMateNum(role){ const n = FIG_NUM_MATE[role] || 14, me = +(S.player && S.player.number); return n === me ? n + 10 : n; }

/* ---------- motion: velocity, facing and the stride, from where the engine put him ---------- */
let FIG_DT = 0;
const FIG_ST = new WeakMap();
function figNewSt(){ return {init:false, x:0, y:0, vx:0, vy:0, a:-Math.PI/2, ph:0, amp:0, run:0, ms:0, mq:1, look:null}; }
function figSt(o){ let s = FIG_ST.get(o); if (!s){ s = figNewSt(); FIG_ST.set(o, s); } return s; }
function figTurn(st, want, rate){ let d = want - st.a; while (d > Math.PI) d -= Math.PI*2; while (d < -Math.PI) d += Math.PI*2; st.a += clamp(d, -rate, rate); }
// watch: a defender or a keeper — when he is backing off he keeps his eyes on the ball instead of turning his back
function figStep(st, x, y, bx, by, watch, face, keeper){
  const dt = FIG_DT, bdx = bx - x, bdy = by - y, bd = Math.hypot(bdx, bdy);
  if (!st.init || Math.abs(x - st.x) + Math.abs(y - st.y) > 4){
    st.init = true; st.x = x; st.y = y; st.vx = st.vy = 0; st.amp = st.run = 0;
    st.a = face != null ? face : bd > .3 ? Math.atan2(bdy, bdx) : -Math.PI/2; return;
  }
  if (dt > 0){ const k = 1 - Math.exp(-dt*10); st.vx += ((x - st.x)/dt - st.vx)*k; st.vy += ((y - st.y)/dt - st.vy)*k; }
  st.x = x; st.y = y;
  if (!(dt > 0)) return;
  const sp = Math.hypot(st.vx, st.vy);
  let want = st.a;
  if (face != null) want = face;
  else if (keeper && bd > .3) want = Math.atan2(bdy, bdx);                       // a keeper never takes his eyes off it
  else if (sp > .9){
    want = Math.atan2(st.vy, st.vx);
    if (watch && bd > .3 && (st.vx*bdx + st.vy*bdy)/(sp*bd) < -.2 && sp < 5.5) want = Math.atan2(bdy, bdx);
  } else if (bd > .35) want = Math.atan2(bdy, bdx);
  figTurn(st, want, 11*dt);
  st.amp += (smoothF(.3, 1.6, sp) - st.amp)*(1 - Math.exp(-dt*9));
  st.run += (smoothF(2.6, 6.5, sp) - st.run)*(1 - Math.exp(-dt*6));
  st.ph = (st.ph + dt*Math.PI*sp/(.45 + .19*Math.max(sp, .6))) % (Math.PI*2);     // a cycle is two steps of .45 + .19·speed metres
  if (sp > .3){
    const fx = Math.cos(st.a), fy = Math.sin(st.a), k = 1 - Math.exp(-dt*12);
    st.mq += ((st.vx*fx + st.vy*fy)/sp - st.mq)*k; st.ms += ((st.vy*fx - st.vx*fy)/sp - st.ms)*k;
  }
}
function smoothF(a, b, x){ const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); }

/* ---------- the draw list ---------- */
const F_ME = 1, F_GK = 2, F_WATCH = 4;
const FIG_POOL = [], FIG_LIST = []; let FIG_N = 0, FIG_BX = 34, FIG_BY = 20;
function figBegin(bx, by, dt){ FIG_N = 0; FIG_BX = bx; FIG_BY = by; FIG_DT = dt; }
// queue a man: st (motion state), feet at x,y; returns his record so a caller can pose him (face, kick, throw, roll)
function figAdd(st, x, y, look, kit, flags, lift, alpha, num){
  let R = FIG_POOL[FIG_N]; if (!R){ R = {}; FIG_POOL[FIG_N] = R; }
  FIG_LIST[FIG_N++] = R;
  R.st = st; R.x = x; R.y = y; R.look = look; R.kit = look.gk || kit; R.flags = flags; R.lift = lift || 0; R.alpha = alpha == null ? 1 : alpha;
  R.num = num || ""; R.face = null; R.pose = 0; R.u = 0; R.roll = 0; R.dive = false; R.vis = true;
  return R;
}
const figOrder = (a, b) => a.y - b.y;
const FIG_SEP = .6;                                   // closer than this (metres) two men are drawn apart

/* ---------- where the ball is drawn ----------
   The men are drawn FIG.kh × life size, the ball at its true place, so a ball at a man's feet has to be drawn in his
   frame or it lands on his shirt. Near a man (within FIG_D1) its offset from him is drawn in his own scale — growing
   from life size × FIG.kh at his boots back to 1:1 at FIG_D1, so it never jumps — and when he faces away from you
   it runs at his stronger foot's side, where it is seen beside his legs instead of behind him. A throw-in is held in
   the thrower's hands. The offsets ease, so a change of carrier never jumps, and everything that marks the ball on
   screen (aim arrow, rings, the drag line) uses ballScreen(), the point where it is drawn. Hit tests that read the
   ball's true place (the tackle) only run while it is loose, when the two are the same. */
const FIG_D0 = .36, FIG_D1 = 1.6, FIG_D2 = 2.4;      // D1: back to life size; D2: out of his reach altogether
const BV = {b:null, ox:0, oy:0, shx:0, shy:0, lx:0, ly:0, held:null, C:null, s:0, q:0, cs:null, sg:0, slow:0};
const BALL_PT = {x:0, y:0};
function figBallPlace(b){
  const KH = FIG.kh, loose = !REP && M && M.phase === "steal", low = b.z - BR < .35;
  let snap = BV.b !== b || Math.abs(b.x - BV.lx) + Math.abs(b.y - BV.ly) > 6 || loose;
  const wasHeld = !!BV.held; BV.b = b; BV.lx = b.x; BV.ly = b.y; BV.held = BV.C = null;
  let tx = 0, ty = 0, tsx = 0, tsy = 0, C = null, cd = FIG_D1;
  for (let i = 0; i < FIG_N; i++){ const R = FIG_LIST[i];
    if (R.pose === 3){ C = R; break; }
    if (low && !loose && R.alpha >= 1){ const d = Math.hypot(b.x - R.x, b.y - R.y); if (d < cd){ cd = d; C = R; } } }
  // the man who had it keeps it a little longer (a long touch ahead of him is still his, and still kept in sight)
  if (!C && low && !loose && BV.cs) for (let i = 0; i < FIG_N; i++){ const R = FIG_LIST[i]; if (R.st === BV.cs && Math.hypot(b.x - R.x, b.y - R.y) < FIG_D2){ C = R; break; } }
  if (C && C.pose === 3){
    // in his hands over his head: the drawn ball sits between them, its shadow on the grass under them
    const u = C.u*C.u; figFrame(C); figP(0, -.06 + .22*u, 2.0 - .1*u); tx = (FPX - sx(b.x))/scale; ty = (FPY - sy(b.y - (b.z - BR)*.55))/scale;
    figP(0, -.06 + .22*u, 0); tsx = (FPX - sx(b.x))/scale; tsy = (FPY - sy(b.y))/scale; BV.held = C; snap = true;
  } else if (C){
    const a = C.st.a, fx = Math.cos(a), fy = Math.sin(a), dx = b.x - C.x, dy = b.y - C.y, d = Math.hypot(dx, dy);
    const fd = d < FIG_D0 ? d*KH : d < FIG_D1 ? FIG_D0*KH + (d - FIG_D0)*(FIG_D1 - FIG_D0*KH)/(FIG_D1 - FIG_D0) : d;
    const ux = d > 1e-4 ? dx/d : fx, uy = d > 1e-4 ? dy/d : fy;
    let ox = ux*fd, oy = uy*fd;                                                  // from his feet, on the screen
    // up the screen from his feet is behind him in the picture: there it goes out beside him, clear of his body
    // (to the side it already leans to, his stronger foot's when it is square behind him; the side is kept until
    // the ball is clearly on the other one, so it never flickers across him)
    const behind = smoothF(-.05, -.35, oy)*(1 - smoothF(FIG_D2 - .5, FIG_D2, d));
    if (behind > 0){
      const foot = C.flags & F_ME && S.player && S.player.foot === "Left" ? -1 : 1;
      if (BV.cs !== C.st || !BV.sg) BV.sg = Math.abs(ox) > .08 ? Math.sign(ox) : (-fy*foot >= 0 ? 1 : -1);
      const clear = (.2*Math.abs(fy)*C.look.bw + .12*Math.abs(fx) + .1)*KH;
      if (ox*BV.sg < -.6*clear) BV.sg = -BV.sg;
      ox += (BV.sg*Math.max(ox*BV.sg, clear) - ox)*behind;
    }
    BV.cs = C.st; BV.C = C; BV.s = (-ox*fy + oy*fx)/KH; BV.q = (ox*fx + oy*fy)/KH;      // and in his body: to his right, ahead
    tx = tsx = C.x + ox - b.x; ty = tsy = C.y + oy - b.y;
  }
  // just out of the hands it eases onto its true flight more gently, so a throw leaves from over his head
  if (wasHeld && !BV.held) BV.slow = .7;
  if (snap){ BV.ox = tx; BV.oy = ty; BV.shx = tsx; BV.shy = tsy; BV.slow = BV.held ? 0 : BV.slow; }
  else if (FIG_DT > 0){ BV.slow = Math.max(0, (BV.slow || 0) - FIG_DT); const k = 1 - Math.exp(-FIG_DT*(BV.slow > 0 ? 5 : 14)); BV.ox += (tx - BV.ox)*k; BV.oy += (ty - BV.oy)*k; BV.shx += (tsx - BV.shx)*k; BV.shy += (tsy - BV.shy)*k; }
}
// the screen point the ball is drawn at (its centre)
function ballScreen(b){
  const ox = b === BV.b ? BV.ox : 0, oy = b === BV.b ? BV.oy : 0;
  BALL_PT.x = sx(b.x + ox); BALL_PT.y = sy(b.y + oy - (b.z - BR)*.55); return BALL_PT;
}
// shadows and rings on the grass first, then the men from the back of the picture to the front, the ball among them
// (a ball on the grass by where it is drawn, one in the hands right after the man holding it, one in the air on top)
function figFlush(ball){
  const c = cx; FIG_LIST.length = FIG_N; FIG_LIST.sort(figOrder);
  const KH = FIG.kh*scale, W_ = cv.width, H_ = cv.height, up = (FIG.top + .35)*FIG.kv*scale;
  for (let i = 0; i < FIG_N; i++){ const R = FIG_LIST[i];
    figStep(R.st, R.x, R.y, FIG_BX, FIG_BY, R.flags & (F_WATCH | F_GK), R.face, R.flags & F_GK);
    // off the screen (most of them when the camera follows the play on a phone): moved, never drawn
    const X = sx(R.x), Y = sy(R.y), top = up + (R.lift + .4)*FIG.kv*scale;
    R.vis = X > -.9*KH && X < W_ + .9*KH && Y > -.45*KH && Y - top < H_;
  }
  // the engine keeps bodies apart; should two still end up on the same spot, they are drawn side by side, never one
  // inside the other (only where they are drawn: their motion above was worked out from where they really are)
  for (let i = 0; i < FIG_N; i++) for (let j = i + 1; j < FIG_N; j++){
    const A_ = FIG_LIST[i], B_ = FIG_LIST[j], dx = B_.x - A_.x, dy = B_.y - A_.y;
    if (Math.abs(dy) >= FIG_SEP || Math.abs(dx) >= FIG_SEP || dx*dx + dy*dy >= FIG_SEP*FIG_SEP) continue;
    const sg = dx > 0 || (dx === 0 && i < j) ? 1 : -1, push = (FIG_SEP - Math.abs(dx))/2;
    A_.x -= sg*push; B_.x += sg*push;
  }
  if (ball) figBallPlace(ball);
  const sh = figShadow(KH);
  for (let i = 0; i < FIG_N; i++){
    const R = FIG_LIST[i]; if (!R.vis) continue;
    const X = sx(R.x), Y = sy(R.y), lift = R.lift;
    c.globalAlpha = R.alpha*(.85 - Math.min(.45, lift*.5));
    if (lift > .02){ const k = 1/(1 + lift*.8); c.drawImage(sh, X - sh.width*k*.5 + .06*KH, Y - sh.height*k*.5 + .05*KH, sh.width*k, sh.height*k); }
    else c.drawImage(sh, Math.round(X - sh.width*.5 + .06*KH), Math.round(Y - sh.height*.5 + .05*KH));
    if (R.flags & F_ME){ c.globalAlpha = R.alpha; c.strokeStyle = "rgba(255,215,90,.92)"; c.lineWidth = Math.max(2*DPR, .07*KH);
      c.beginPath(); c.ellipse(X, Y, .56*KH, .4*KH, 0, 0, 7); c.stroke(); }
  }
  c.globalAlpha = 1;
  if (ball) drawBallShadow(ball);
  const air = !!ball && !BV.held && ball.z - BR > .45, key = ball ? ball.y + BV.oy : 0;
  let ballDone = !ball || air || !!BV.held;
  c.lineCap = "round"; c.lineJoin = "round";
  for (let i = 0; i < FIG_N; i++){ const R = FIG_LIST[i];
    if (!ballDone && key < R.y){ ballDone = true; drawBallBody(ball); }
    if (R.vis) figBody(R);
    if (R === BV.held) drawBallBody(ball);
  }
  c.lineCap = "butt"; c.lineJoin = "miter"; c.globalAlpha = 1;
  if (!ballDone || air) drawBallBody(ball);
  // you: a marker over your head, so you are found at a glance
  for (let i = 0; i < FIG_N; i++){ const R = FIG_LIST[i]; if (!(R.flags & F_ME) || !R.vis) continue;
    const X = sx(R.x), Y = figTopY(R.y, R.lift) - 5*DPR - (R === BV.held ? .45*scale : 0), s = Math.max(4.5*DPR, .16*KH);   // over the ball he holds up
    c.fillStyle = "#ffd75a"; c.strokeStyle = "rgba(20,16,4,.55)"; c.lineWidth = 1.5*DPR;
    c.beginPath(); c.moveTo(X - s, Y - s*1.1); c.lineTo(X + s, Y - s*1.1); c.lineTo(X, Y); c.closePath(); c.stroke(); c.fill(); }
}
// the screen y just above a man's head (for names)
function figTopY(y, lift){ return sy(y) - ((FIG.top + .1 + (lift || 0))*FIG.kv)*scale - .14*FIG.kh*scale; }
// a soft shadow under a man, drawn once at the size it is shown (one per zoom), so each frame only copies it
let FIG_SH = null, FIG_SHK = 0;
function figShadow(KH){
  if (FIG_SH && FIG_SHK === KH) return FIG_SH;
  const w = Math.max(4, Math.round(KH*1.04)), h = Math.max(2, Math.round(KH*.44));
  const c = FIG_SH || document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
  if (g){ g.setTransform(w/64, 0, 0, h/64, 0, 0); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, "rgba(0,0,0,.42)"); gr.addColorStop(.55, "rgba(0,0,0,.24)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  FIG_SHK = KH; return (FIG_SH = c);
}

/* ---------- one man ---------- */
const FIG_F = {ox:0, oy:0, fx:0, fy:-1, rx:1, ry:0, kh:1, kv:1, lift:0, bw:1, ht:1, roll:0, cr:1, sr:0, ol:0, shQ:0, guard:false, div:0, air:false, kickArm:0};
let FPX = 0, FPY = 0;
function figP(s, q, z){
  s *= FIG_F.bw; z *= FIG_F.ht;
  if (FIG_F.roll){ const s2 = s*FIG_F.cr + z*FIG_F.sr; z = z*FIG_F.cr - s*FIG_F.sr; s = s2; }
  FPX = FIG_F.ox + (s*FIG_F.rx + q*FIG_F.fx)*FIG_F.kh; FPY = FIG_F.oy + (s*FIG_F.ry + q*FIG_F.fy)*FIG_F.kh - (z + FIG_F.lift)*FIG_F.kv;
}
const FIG_OL = "rgba(8,14,10,.42)";
function figLine(x1, y1, x2, y2, w, col){ const c = cx; c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
function figLine3(x1, y1, x2, y2, x3, y3, w, col){ const c = cx; c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3); c.stroke(); }
function figDot(x, y, r, col){ const c = cx; c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
// a leg: hip, knee bent forwards by as much as the leg is shorter than straight, ankle, boot along the way he faces
function figLeg(sd, fs, fq, fz, hipZ, lean, K, P){
  const kh = FIG_F.kh, ol = FIG_F.ol;
  figP(sd*.095, lean*.3, hipZ); const hx = FPX, hy = FPY;
  const ax = fs, aq = fq - .02, az = fz + .075;
  const ds = ax - sd*.095, dq = aq - lean*.3, dz = az - hipZ, d = Math.sqrt(ds*ds + dq*dq + dz*dz);
  const bend = Math.sqrt(Math.max(0, .1849 - d*d*.25));                 // two .43 m bones
  figP(sd*.095 + ds*.5, lean*.3 + dq*.5 + bend, hipZ + dz*.5); const kx = FPX, ky = FPY;
  figP(ax, aq, az); const ankx = FPX, anky = FPY;
  figP(ax, aq + .17, fz + .035); const tx = FPX, ty = FPY;
  const sx1 = kx + (ankx - kx)*.18, sy1 = ky + (anky - ky)*.18;      // the sock starts just under the knee
  const mx = hx + (kx - hx)*.55, my = hy + (ky - hy)*.55;
  if (ol){ const c = cx; c.strokeStyle = FIG_OL; c.lineWidth = .12*kh + ol; c.beginPath(); c.moveTo(hx, hy); c.lineTo(kx, ky); c.lineTo(ankx, anky); c.lineTo(tx, ty); c.stroke(); }
  figLine(hx, hy, kx, ky, .13*kh, P.skin);
  figLine(sx1, sy1, ankx, anky, .112*kh, K.sock);
  figLine(ankx, anky, tx, ty, .105*kh, P.boot);
  if (kh > 22*DPR) figLine(ankx + (tx - ankx)*.35, anky + (ty - anky)*.35, ankx + (tx - ankx)*.6, anky + (ty - anky)*.6, .04*kh, P.bootS);
  figLine(hx, hy, mx, my, .18*kh, sd*FIG_F.rx > 0 ? K.shortsD : K.shorts);   // the shorts' leg, darker on the side away from the light
}
// an arm: shoulder → elbow → hand; the sleeve covers the upper arm (all of it for a keeper), then a hand or a glove
function figArm(sd, shQ, ex, eq, ez, hx_, hq, hz, K, P, gk){
  const kh = FIG_F.kh, ol = FIG_F.ol;
  figP(sd*.2, shQ, 1.37); const sx_ = FPX, sy_ = FPY;
  figP(ex, eq, ez); const elx = FPX, ely = FPY;
  figP(hx_, hq, hz); const hdx = FPX, hdy = FPY;
  const mx = sx_ + (elx - sx_)*.62, my = sy_ + (ely - sy_)*.62;
  if (ol) figLine3(sx_, sy_, elx, ely, hdx, hdy, .085*kh + ol, FIG_OL);
  figLine3(sx_, sy_, elx, ely, hdx, hdy, .085*kh, gk ? K.shirt : P.skin);
  if (!gk) figLine(sx_, sy_, mx, my, .115*kh, sd*FIG_F.rx > 0 ? K.shirtD : K.shirt);
  else figLine(sx_, sy_, elx, ely, .1*kh, sd*FIG_F.rx > 0 ? K.shirtD : K.shirt);
  if (gk){ if (ol) figDot(hdx, hdy, .07*kh + ol*.5, FIG_OL); figDot(hdx, hdy, .07*kh, P.gk.glove); }
  else figDot(hdx, hdy, .05*kh, P.skin);
}
// where one arm's elbow and hand are (body frame) for the pose in FIG_F; written into FIG_ARM[sd < 0 ? 0 : 1]
const FIG_ARM = [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]];
function figArmPose(sd, ang, bnd){
  const A = FIG_ARM[sd < 0 ? 0 : 1], shQ = FIG_F.shQ;
  if (FIG_F.guard){
    const up = FIG_F.div > .3;                                            // a keeper set (gloves up and out) or at full stretch (overhead)
    A[0] = sd*(up ? .24 : .3); A[1] = shQ + (up ? .04 : .12); A[2] = up ? 1.6 : 1.22;
    A[3] = sd*(up ? .26 : .34); A[4] = shQ + (up ? .06 : .3); A[5] = up ? 1.86 : 1.28;
  } else if (FIG_F.air){                                                  // in the air: arms out for balance
    A[0] = sd*.33; A[1] = shQ + .04; A[2] = 1.3; A[3] = sd*.4; A[4] = shQ + .12; A[5] = 1.45;
  } else {
    const out = FIG_F.kickArm === sd ? .14 : 0;                           // striking: the arm on the far side goes out wide
    A[0] = sd*(.215 + out); A[1] = shQ + Math.sin(ang)*.27; A[2] = 1.37 - Math.cos(ang)*.27 + out*.4;
    A[3] = sd*(.225 + out*1.6); A[4] = A[1] + Math.sin(ang + bnd)*.25; A[5] = A[2] - Math.cos(ang + bnd)*.25;
  }
}
// is this arm nearer to you than his chest? (then it is drawn over the shirt)
function figArmFront(sd){ const A = FIG_ARM[sd < 0 ? 0 : 1]; return (sd*.2)*FIG_F.ry + ((A[1] + A[4])*.5)*FIG_F.fy > .015; }
function figDrawArm(sd, R, K, P){
  const A = FIG_ARM[sd < 0 ? 0 : 1];
  if (R.pose === 3){ const u = R.u*R.u; figArm(sd, FIG_F.shQ, sd*.27, -.03 + .12*u, 1.67 - .04*u, sd*.125, -.06 + .22*u, 1.95 - .1*u, K, P, !!P.gk); }   // both hands on the ball over his head, elbows out; u: the throw coming forward
  else figArm(sd, FIG_F.shQ, A[0], A[1], A[2], A[3], A[4], A[5], K, P, !!P.gk);
}
// his frame: feet on the grass at R, facing his heading, upright (figBody adds the roll of a dive or a stumble)
function figFrame(R){
  const P = R.look, a = R.st.a, fx = Math.cos(a), fy = Math.sin(a);
  FIG_F.ox = sx(R.x); FIG_F.oy = sy(R.y); FIG_F.fx = fx; FIG_F.fy = fy; FIG_F.rx = -fy; FIG_F.ry = fx; FIG_F.kh = FIG.kh*scale; FIG_F.kv = FIG.kv*scale;
  FIG_F.bw = P.bw; FIG_F.ht = P.ht; FIG_F.lift = R.lift; FIG_F.roll = 0; FIG_F.cr = 1; FIG_F.sr = 0;
  FIG_F.ol = GFX.low || FIG_F.kh < 14*DPR ? 0 : Math.max(1, .022*FIG_F.kh);
}
function figBody(R){
  const c = cx, st = R.st, P = R.look, K = R.kit, gk = !!P.gk;
  figFrame(R);
  const fx = FIG_F.fx, fy = FIG_F.fy;
  const sp = Math.hypot(st.vx, st.vy), amp = st.amp, run = st.run, ph = st.ph;
  // a keeper going full length: the whole body rolls over towards the ball, lifted off the floor
  let roll = R.roll, divK = 0;
  if (gk && R.dive){ const side = st.vx*FIG_F.rx + st.vy*FIG_F.ry; divK = smoothF(2.4, 4.2, Math.abs(side)); roll += Math.sign(side)*divK*1.2; }
  FIG_F.roll = roll; FIG_F.cr = Math.cos(roll); FIG_F.sr = Math.sin(roll); if (roll) FIG_F.lift += Math.abs(FIG_F.sr)*.16;
  if (R.pose !== 1) st.bQ = null;
  c.globalAlpha = R.alpha;
  // ---- the pose, in his own frame: feet swing along the way he is moving (ms: to his right, mq: ahead)
  const SA = (.15 + .17*run)*amp, ms = st.ms, mq = st.mq;
  const offL = Math.sin(ph)*SA, offR = -offL, lft = (.05 + .13*run)*amp;
  let lS = -.11 + ms*offL, lQ = mq*offL, lZ = Math.max(0, Math.cos(ph))*lft;
  let rS = .11 + ms*offR, rQ = mq*offR, rZ = Math.max(0, -Math.cos(ph))*lft;
  let hipZ = .93 - .05*run*amp + .022*amp*Math.abs(Math.cos(ph)), lean = mq*.11*run*amp;
  let swing = (.32 + .5*run)*amp, bend = .28 + .95*run*amp;
  let aL = -Math.sin(ph)*swing;
  FIG_F.guard = gk && (divK > .3 || sp < 2.2); FIG_F.div = divK; FIG_F.air = R.lift > .05 && !roll && R.pose !== 3; FIG_F.kickArm = 0;
  if (FIG_F.air){ lS = -.1; rS = .1; lQ = rQ = -.06; lZ = rZ = .2; hipZ = .9; }                       // knees up
  else if (FIG_F.guard && divK <= .3){ lS = -.17; rS = .17; lQ = rQ = .02; hipZ = .86; lean = .06; }   // set: feet apart, knees bent
  if (R.pose === 1){
    // the strike: the plant foot beside the ball, the other one swinging through it
    // (bS, bQ: the ball where it is drawn in his frame, kept from before it left his boot for the follow-through)
    const u = R.u, side = S.player && S.player.foot === "Left" ? -1 : 1, sw = smoothF(0, 1, Math.min(u, 1)), ft = u > 1 ? Math.min(1, u - 1) : 0;
    if (u <= 1 || st.bQ == null){ const on = BV.C === R; st.bS = on ? clamp(BV.s, -.4, .4) : .16*side; st.bQ = on ? clamp(BV.q, .1, .6) : .3; }
    const kS = st.bS - .06*side, kQ = st.bQ - .5 + .58*sw - .1*ft, kZ = .06 + .14*Math.sin(Math.PI*Math.min(u, 1)) + .22*ft;
    const pS = st.bS - side*.24, pQ = st.bQ - .1;                                                 // the standing foot beside the ball
    if (side > 0){ rS = kS; rQ = kQ; rZ = kZ; lS = pS; lQ = pQ; lZ = 0; } else { lS = kS; lQ = kQ; lZ = kZ; rS = pS; rQ = pQ; rZ = 0; }
    lean = .05; aL = side*.5; bend = .5; hipZ = .9; FIG_F.kickArm = -side;
  }
  // stepping into the strike: the whole of him moves up to the ball, and settles back after the follow-through
  const adv0 = st.adv || 0, advT = R.pose === 1 ? Math.max(0, st.bQ - .3)*smoothF(0, .8, Math.min(R.u, 1)) : 0;
  st.adv = R.pose === 1 ? advT : adv0*Math.exp(-FIG_DT*6);
  if (st.adv > .002){ FIG_F.ox += fx*st.adv*FIG_F.kh; FIG_F.oy += fy*st.adv*FIG_F.kh; if (R.pose === 1){ lQ -= st.adv; rQ -= st.adv; } }
  FIG_F.shQ = lean;
  figArmPose(-1, aL, bend); figArmPose(1, -aL, bend);
  const frontL = R.pose === 3 || figArmFront(-1), frontR = R.pose === 3 || figArmFront(1);
  // ---- legs, the far one first; arms behind the body
  if (lS*FIG_F.ry + lQ*fy <= rS*FIG_F.ry + rQ*fy){ figLeg(-1, lS, lQ, lZ, hipZ, lean, K, P); figLeg(1, rS, rQ, rZ, hipZ, lean, K, P); }
  else { figLeg(1, rS, rQ, rZ, hipZ, lean, K, P); figLeg(-1, lS, lQ, lZ, hipZ, lean, K, P); }
  if (!frontL) figDrawArm(-1, R, K, P);
  if (!frontR) figDrawArm(1, R, K, P);
  const kh = FIG_F.kh, ol = FIG_F.ol;
  // ---- long hair hangs down his back: behind the shirt when he faces you
  if (fy > 0) figHang(P, lean);
  // ---- shorts, trunk, shoulders
  figP(-.1, lean*.3, hipZ - .01); const s1x = FPX, s1y = FPY; figP(.1, lean*.3, hipZ - .01); const s2x = FPX, s2y = FPY;
  figP(0, lean*.45, 1.0); const wx_ = FPX, wy_ = FPY; figP(0, lean*.9, 1.27); const chx = FPX, chy = FPY;
  figP(-.175, lean, 1.37); const shLx = FPX, shLy = FPY; figP(.175, lean, 1.37); const shRx = FPX, shRy = FPY;
  const hxW = Math.sqrt(Math.pow(.155*P.bw*fy, 2) + Math.pow(.105*fx, 2))*kh;      // the trunk's width as seen from here
  if (ol){ figLine(s1x, s1y, s2x, s2y, .2*kh + ol, FIG_OL); figLine(wx_, wy_, chx, chy, hxW*2 + ol, FIG_OL); figLine(shLx, shLy, shRx, shRy, .15*kh + ol, FIG_OL); }
  figLine(s1x, s1y, s2x, s2y, .2*kh, K.shorts);
  figLine(wx_, wy_, chx, chy, hxW*2, K.shirt);
  if (!GFX.low) figLine(wx_ + hxW*.5, wy_, chx + hxW*.5, chy, hxW, K.shirtD);                       // the side away from the light
  figLine(shLx, shLy, shRx, shRy, .15*kh, K.shirtL);
  // the number on his back, squeezed as he turns side-on
  const back = -fy;
  if (R.num && back > .2 && hxW > 3*DPR){
    c.setTransform(Math.min(1, .35 + back*.7), 0, 0, 1, (wx_ + chx)*.5 - fx*.05*kh, (wy_ + chy)*.5 + .02*kh);
    c.font = figNumFont(kh); c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = K.num;
    c.fillText(R.num, 0, 0); c.setTransform(1, 0, 0, 1, 0, 0);
  }
  // collar and neck
  figP(0, lean*1.02, 1.4); const nx = FPX, ny = FPY; figP(0, lean*1.05 + .01, 1.52); const nx2 = FPX, ny2 = FPY;
  if (ol) figLine(nx, ny, nx2, ny2, .085*kh + ol, FIG_OL);
  figLine(nx, ny, nx2, ny2, .085*kh, P.skinD);
  c.strokeStyle = K.trim; c.lineWidth = Math.max(1, .026*kh); c.beginPath(); c.ellipse(nx, ny + .01*kh, .068*kh, .05*kh, 0, 0, 7); c.stroke();
  // arms in front, then the head
  if (frontL) figDrawArm(-1, R, K, P);
  if (frontR) figDrawArm(1, R, K, P);
  if (fy <= 0) figHang(P, lean);
  figHead(R, P, lean, fx, fy);
  c.globalAlpha = 1;
}
// the head: skin, then the hair as a cap clipped to the scalp (and a beard), tufts or a bun, and eyes when he faces you
function figHead(R, P, lean, fx, fy){
  const c = cx, kh = FIG_F.kh, ol = FIG_F.ol, HS = FIG_HAIR[P.style];
  figP(0, lean*1.1 + .015, 1.63); const hx = FPX, hy = FPY, Rh = .122*kh;
  if (ol) figDot(hx, hy, Rh + ol*.5, FIG_OL);
  figDot(hx, hy, Rh, P.skin);
  const bx = -fx, by = -fy;                                           // the back of his head, on screen
  if (HS){ c.globalAlpha = R.alpha*(P.style === "buzz" ? .72 : 1); figLens(hx + bx*Rh*HS[0], hy + by*Rh*HS[0] - Rh*HS[1], Rh*HS[2], hx, hy, Rh*(1 + HS[3]), P.hair); c.globalAlpha = R.alpha; }
  if (P.beard && fy > -.3){ c.globalAlpha = R.alpha*(P.beard === "beard" ? .85 : .32); figLens(hx + fx*Rh*.42, hy + fy*Rh*.25 + Rh*.66, Rh*.56, hx, hy, Rh, P.hair); c.globalAlpha = R.alpha; }
  if (P.style === "messy" || P.style === "curly"){ const t = P.style === "curly" ? .3 : .24; figDot(hx + bx*Rh*.2 - Rh*.4, hy + by*Rh*.2 - Rh*.92, Rh*t, P.hair); figDot(hx + bx*Rh*.2 + Rh*.35, hy + by*Rh*.2 - Rh*.95, Rh*t, P.hair); }
  if (P.style === "bun") figDot(hx + bx*Rh*.5, hy + by*Rh*.5 - Rh*.95, Rh*.42, P.hair);
  if (!GFX.low && Rh > 3.2*DPR && fy > -.15){
    const er = Math.max(.7*DPR, Rh*.11);
    for (let sd = -1; sd <= 1; sd += 2){
      const ex = fx*.83 - fy*sd*.56, ey = fy*.83 + fx*sd*.56;          // the eye's direction on the ground
      if (ey < -.1) continue;
      figDot(hx + ex*Rh*.62, hy + ey*Rh*.32 + Rh*.12, er, "#1b1410");
    }
  }
}
// fill the part of circle 1 that lies inside circle 2 (hair on a scalp, a beard on a jaw) — two arcs, no clipping
function figLens(x1, y1, r1, x2, y2, r2, col){
  const c = cx, dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
  c.fillStyle = col; c.beginPath();
  if (d <= Math.abs(r1 - r2) || d < 1e-6){ const inner = r1 < r2; c.arc(inner ? x1 : x2, inner ? y1 : y2, inner ? r1 : r2, 0, 7); c.fill(); return; }
  if (d >= r1 + r2) return;
  const al = Math.atan2(dy, dx), a = (r1*r1 - r2*r2 + d*d)/(2*d), be = Math.acos(clamp(a/r1, -1, 1)), ga = Math.acos(clamp((d - a)/r2, -1, 1));
  c.arc(x1, y1, r1, al - be, al + be, false); c.arc(x2, y2, r2, al + Math.PI - ga, al + Math.PI + ga, false); c.closePath(); c.fill();
}
let FIG_NF = {kh:0, f:""};
function figNumFont(kh){ if (FIG_NF.kh !== kh){ FIG_NF.kh = kh; FIG_NF.f = `800 ${(.27*kh).toFixed(1)}px "Barlow Condensed", "Arial Narrow", sans-serif`; } return FIG_NF.f; }
// what hangs from the back of the head: long hair, a ponytail, braids or dreads
function figHang(P, lean){
  const st = P.style; if (st !== "long" && st !== "ponytail" && st !== "braids" && st !== "dreads") return;
  figP(0, lean*1.1 - .07, 1.62); const ax = FPX, ay = FPY;
  figP(0, lean*1.1 - .12, st === "ponytail" ? 1.42 : 1.36); const bx = FPX, by = FPY;
  const kh = FIG_F.kh;
  if (st === "long" || st === "ponytail") figLine(ax, ay, bx, by, (st === "long" ? .2 : .09)*kh, P.hair);
  else for (let i = -1; i <= 1; i++){ const o = i*.06*kh*Math.abs(FIG_F.fy) + i*.02*kh; figLine(ax + o, ay, bx + o*1.15, by, .045*kh, P.hair); }
}

/* ---------- the ball: its shadow goes down with the grass, the ball where figBallPlace put it ---------- */
function drawBallShadow(b){
  const c = cx, ox = b === BV.b ? BV.shx : 0, oy = b === BV.b ? BV.shy : 0;
  c.fillStyle = "rgba(0,0,0,.35)"; c.beginPath(); c.ellipse(sx(b.x + ox), sy(b.y + oy), .3*scale, .18*scale, 0, 0, 7); c.fill();
}
function drawBallBody(b){
  const c = cx, r = Math.max(3, (.26 + (b.z-BR)*.05)*scale), p = ballScreen(b);
  c.fillStyle = "#fff"; c.strokeStyle = "#222"; c.lineWidth = 1;
  c.beginPath(); c.arc(p.x, p.y, r, 0, 7); c.fill(); c.stroke();
}

/* ---------- the 3D ball for stage 2 ---------- */
const ICO = (() => { const t = (1+Math.sqrt(5))/2;
  return [[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]]
    .map(a => { const l = Math.hypot(...a); return a.map(v => v/l); }); })();
function rotP([x,y,z], ax, ay){
  let c = Math.cos(ax), s = Math.sin(ax); [y, z] = [y*c - z*s, y*s + z*c];
  c = Math.cos(ay); s = Math.sin(ay); [x, z] = [x*c + z*s, -x*s + z*c];
  return [x, y, z];
}
function drawBigBall(X, Y, R, rot){
  const c = cx;
  c.save();
  c.fillStyle = "rgba(0,0,0,.35)"; c.beginPath(); c.ellipse(X + R*.15, Y + R*1.05, R*.9, R*.18, 0, 0, 7); c.fill();
  c.beginPath(); c.arc(X, Y, R, 0, 7); c.clip();
  const g = c.createRadialGradient(X - R*.35, Y - R*.4, R*.1, X, Y, R);
  g.addColorStop(0, "#ffffff"); g.addColorStop(.72, "#e6eaee"); g.addColorStop(1, "#9aa3ab");
  c.fillStyle = g; c.fillRect(X-R, Y-R, 2*R, 2*R);
  for (const v of ICO){
    const [x, y, z] = rotP(v, rot, rot*.37 + .5);
    if (z <= 0) continue;
    const px = X + x*R, py = Y - y*R, s = R*.3, rl = Math.hypot(x, y) || 1, nx = x/rl, ny = -y/rl;
    c.beginPath();
    for (let k = 0; k < 5; k++){
      const a = k*Math.PI*2/5 + rot*.5; let lx = Math.cos(a)*s, ly = Math.sin(a)*s;
      const along = lx*nx + ly*ny;                    // foreshorten towards the rim
      lx -= along*nx*(1-z); ly -= along*ny*(1-z);
      k ? c.lineTo(px+lx, py+ly) : c.moveTo(px+lx, py+ly);
    }
    c.closePath(); c.fillStyle = `rgba(28,34,40,${.35 + .6*z})`; c.fill();
  }
  const rim = c.createRadialGradient(X, Y, R*.55, X, Y, R);
  rim.addColorStop(0, "rgba(0,0,0,0)"); rim.addColorStop(1, "rgba(0,0,0,.35)");
  c.fillStyle = rim; c.fillRect(X-R, Y-R, 2*R, 2*R);
  c.restore();
  c.strokeStyle = "rgba(0,0,0,.4)"; c.lineWidth = 2*DPR; c.beginPath(); c.arc(X, Y, R, 0, 7); c.stroke();
}
function drawContactStage(){
  const c = cx, g = contactGeom(), R = g.R;
  c.fillStyle = `rgba(6,14,22,${.72*g.k})`; c.fillRect(0, 0, cv.width, cv.height);
  c.globalAlpha = g.k;
  drawBigBall(g.x, g.y, R, g.rot);
  // guides
  c.strokeStyle = "rgba(255,255,255,.18)"; c.lineWidth = 1.5*DPR; c.setLineDash([6*DPR, 6*DPR]);
  c.beginPath(); c.moveTo(g.x - R, g.y); c.lineTo(g.x + R, g.y); c.moveTo(g.x, g.y - R); c.lineTo(g.x, g.y + R); c.stroke();
  c.setLineDash([]);
  c.fillStyle = "rgba(255,255,255,.8)"; c.font = font(600, 14); c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText("top: low and dipping", g.x, g.y - R - 14*DPR);
  c.fillText("bottom: lift", g.x, g.y + R + 14*DPR);
  c.textAlign = "right"; c.fillText("curl right", g.x - R - 10*DPR, g.y);
  c.textAlign = "left"; c.fillText("curl left", g.x + R + 10*DPR, g.y);
  if (inp.hx !== null){
    c.strokeStyle = "#ffd75a"; c.lineWidth = 2*DPR;
    c.beginPath(); c.arc(inp.hx, inp.hy, 9*DPR, 0, 7); c.moveTo(inp.hx-15*DPR, inp.hy); c.lineTo(inp.hx+15*DPR, inp.hy); c.moveTo(inp.hx, inp.hy-15*DPR); c.lineTo(inp.hx, inp.hy+15*DPR); c.stroke();
  }
  if (M.moving){
    const f = clamp(1 - M.phaseT/M.contactLimit, 0, 1);
    c.strokeStyle = f < .3 ? "#ef5a60" : "#ffd75a"; c.lineWidth = 5*DPR;
    c.beginPath(); c.arc(g.x, g.y, R + 22*DPR, -Math.PI/2, -Math.PI/2 + f*Math.PI*2); c.stroke();
  }
  c.textAlign = "left"; c.textBaseline = "top"; c.fillStyle = "#fff"; c.font = font(700, 16);
  c.fillText(`Power ${Math.round(M.lock.power*100)}% · ${M.moving ? "moving ball — be quick" : "dead ball"}`, 12*DPR, 34*DPR);
  c.globalAlpha = 1;
}
// power bar: segmented, white -> green in the middle -> red when maxed, with a glowing rounded frame
function barColor(t){
  const W_ = [255,255,255], G = [120,230,70], R = [240,40,40];
  const c = t < .5 ? W_.map((v,i) => lerp(v, G[i], t/.5)) : G.map((v,i) => lerp(v, R[i], (t-.5)/.5));
  return `rgb(${c.map(Math.round).join(",")})`;
}
function powerBarGeom(){ const w = Math.min(cv.width*.46, 520*DPR), h = Math.max(26*DPR, w*.1); return {w, h, x:(cv.width - w)/2, y:cv.height - h - 34*DPR}; }
// the bar with its frame and the label over it, as [x0, y0, x1, y1]
function powerBarRect(){ const g = powerBarGeom(); return [g.x - 6*DPR, g.y - 30*DPR, g.x + g.w + 6*DPR, g.y + g.h + 6*DPR]; }
function drawPowerBar(pw, label){
  const c = cx, {w, h, x, y} = powerBarGeom();
  const n = 10, pad = h*.18, iw = w - pad*2, ih = h - pad*2, cw = iw/n;
  c.save();
  c.fillStyle = "rgba(0,0,0,.72)"; roundRect(c, x - 6*DPR, y - 6*DPR, w + 12*DPR, h + 12*DPR, h*.35); c.fill();
  const fr = c.createLinearGradient(x, 0, x + w, 0); fr.addColorStop(0, "#ff5a4a"); fr.addColorStop(.5, "#c8f060"); fr.addColorStop(1, "#8ef07a");
  // glow: a few soft strokes (much cheaper than canvas shadowBlur every frame)
  if (!GFX.low) for (const [lw, a] of [[10, .07], [6, .12]]){ c.globalAlpha = a; c.strokeStyle = "#a8ff78"; c.lineWidth = lw*DPR; roundRect(c, x, y, w, h, h*.28); c.stroke(); }
  c.globalAlpha = 1; c.strokeStyle = fr; c.lineWidth = 2.5*DPR;
  roundRect(c, x, y, w, h, h*.28); c.stroke();
  const filled = pw*n;
  for (let i = 0; i < n; i++){
    const f = clamp(filled - i, 0, 1); if (f <= 0) break;
    const g = c.createLinearGradient(x + pad + i*cw, 0, x + pad + (i+1)*cw, 0);
    g.addColorStop(0, barColor(i/n)); g.addColorStop(1, barColor((i+1)/n));
    c.fillStyle = g; c.fillRect(x + pad + i*cw, y + pad, cw*f, ih);
    c.strokeStyle = "rgba(0,0,0,.55)"; c.lineWidth = 1*DPR; c.strokeRect(x + pad + i*cw, y + pad, cw, ih);
  }
  c.fillStyle = "#fff"; c.font = font(800, 16); c.textAlign = "center"; c.textBaseline = "bottom";
  c.fillText(label || `POWER ${Math.round(pw*100)}%`, cv.width/2, y - 10*DPR);
  c.restore();
}
function roundRect(c, x, y, w, h, r){ c.beginPath(); c.moveTo(x+r, y); c.arcTo(x+w, y, x+w, y+h, r); c.arcTo(x+w, y+h, x, y+h, r); c.arcTo(x, y+h, x, y, r); c.arcTo(x, y, x+w, y, r); c.closePath(); }
/* ---------- defending: the man on the ball, the window, the jump ---------- */
function drawDefendScene(){
  const c = cx, ok = figKit(MT.oppKit), mk = figKit(MT.myKit);
  figBegin(M.ball.x, M.ball.y, FRAME_DT);
  if (M.att && !M.att.gone){
    // his legs are the thing you must not catch — shown as a soft shape under him
    if (M.phase === "steal"){
      const l = worldToScreen(M.att.x, M.att.y, 0), R = (1.05 - (S.skills.tackling ? effSkill("tackling") : 20)*.004)*scale;
      c.fillStyle = "rgba(255,90,96,.16)"; c.beginPath(); c.arc(l.x, l.y, R, 0, 7); c.fill();
      c.strokeStyle = "rgba(255,90,96,.5)"; c.lineWidth = 2*DPR; c.stroke();
    }
    figAdd(figSt(M.att), M.att.x, M.att.y, figOppL(M.att, 9), ok, 0, 0, 1, String(FIG_NUM_OPP[9]));
  }
  if (M.rival) figAdd(figSt(M.rival), M.rival.x, M.rival.y, figOppL(M.rival, 10), ok, F_WATCH, 0, 1, String(FIG_NUM_OPP[10]));
  if (M.recv) figAdd(figSt(M.recv), M.recv.x, M.recv.y, figOppL(M.recv, 8), ok, F_WATCH, 0, 1, String(FIG_NUM_OPP[8]));
  figAdd(figSt(M.p), M.p.x, M.p.y, figMineL(M.p), mk, F_ME | F_WATCH, M.jumped ? Math.max(0, M.jumped.z) : 0, 1, String(S.player.number));
  figFlush(M.ball);
}
// a man's look, worked out once and kept with his motion
function figOppL(o, i){ const st = figSt(o); return st.look || (st.look = figOpp(i)); }
function figMineL(o){ const st = figSt(o); return st.look || (st.look = figMine()); }
function figMateL(t){ const st = figSt(t); return st.look || (st.look = figMate(t.pid, t.role)); }
function figKeeperL(o){ const st = figSt(o); return st.look || (st.look = figKeeper()); }
function drawDefendOverlay(){
  const c = cx;
  if (M.phase === "jockey" || M.phase === "steal"){
    // how hard you are making it for him
    // at the bottom, where the power bar sits when you strike it: the top of the picture is the goal's
    const w = Math.min(180*DPR, cv.width*.5), x = cv.width/2 - w/2, y = cv.height - 46*DPR;
    c.fillStyle = "rgba(0,0,0,.4)"; roundRect(c, x, y, w, 8*DPR, 4*DPR); c.fill();
    c.fillStyle = M.press > .6 ? "#c8f060" : M.press > .3 ? "#ffd75a" : "#8fa6bd";
    roundRect(c, x, y, w*clamp(M.press, 0, 1), 8*DPR, 4*DPR); c.fill();
    c.fillStyle = "rgba(255,255,255,.75)"; c.font = font(700, 11); c.textAlign = "center";
    c.fillText("PRESSURE", cv.width/2, y - 4*DPR);
  }
  if (M.phase === "steal"){
    // the window closing on the loose ball
    const b = worldToScreen(M.ball.x, M.ball.y, M.ball.z);
    const f = clamp(1 - M.winT/M.window, 0, 1);
    c.strokeStyle = `rgba(200,240,96,${.35 + .5*f})`; c.lineWidth = 3.5*DPR;
    c.beginPath(); c.arc(b.x, b.y, (14 + 30*f)*DPR, 0, 7); c.stroke();
    if (inp.down){
      c.strokeStyle = "rgba(255,255,255,.9)"; c.lineWidth = 3*DPR; c.setLineDash([6*DPR, 6*DPR]);
      c.beginPath(); c.moveTo(inp.sx, inp.sy); c.lineTo(inp.x, inp.y); c.stroke(); c.setLineDash([]);
    }
  }
  if (M.phase === "read"){
    const a = worldToScreen(M.ball.x, M.ball.y, 0), t = worldToScreen(M.recv.x, M.recv.y, 0);
    c.strokeStyle = "rgba(255,215,90,.45)"; c.lineWidth = 2*DPR; c.setLineDash([8*DPR, 8*DPR]);
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(t.x, t.y); c.stroke(); c.setLineDash([]);
  }
  if (M.phase === "aerial"){
    // the charge you are holding, and how far off the floor it will take you
    const w = 22*DPR, h = 132*DPR, x = cv.width - 54*DPR, y = cv.height/2 - h/2;
    c.fillStyle = "rgba(0,0,0,.45)"; roundRect(c, x, y, w, h, 11*DPR); c.fill();
    const p = clamp(M.charge, 0, 1);
    c.fillStyle = p > .82 ? "#c8f060" : p > .5 ? "#ffd75a" : "#48f0dd";
    roundRect(c, x, y + h*(1 - p), w, h*p, 11*DPR); c.fill();
    c.fillStyle = "rgba(255,255,255,.8)"; c.font = font(700, 11); c.textAlign = "center";
    c.fillText("JUMP", x + w/2, y - 6*DPR);
    const bs = worldToScreen(M.ball.x, M.ball.y, 0);
    const drop = clamp(M.ball.z/9.5, 0, 1);
    c.strokeStyle = `rgba(255,255,255,${.25 + .5*(1 - drop)})`; c.lineWidth = 2.5*DPR;
    c.beginPath(); c.arc(bs.x, bs.y, (10 + 40*drop)*DPR, 0, 7); c.stroke();
  }
}
function drawAimStage(){
  const c = cx, b = M.ball, A_ = M.aim, bs = ballScreen(b), ang = A_.ang + A_.swayAng, pw = A_.power;
  // aim arrow: dotted path ahead of the ball, longer with more power
  // arrow grows with power but always stays on screen (clipped at a margin from every edge)
  // the arrow is as long as the ball will travel, so a throw draws a short one and a shot a long one
  let len = (5 + pw*(M.throwIn ? 15 : (typeof passMode === "function" && passMode()) ? 30 : 24))*scale;
  const m = 34*DPR, dx = Math.cos(ang), dy = Math.sin(ang);
  const room = Math.min(dx > 0 ? (cv.width - m - bs.x)/dx : dx < 0 ? (m - bs.x)/dx : 1e9, dy > 0 ? (cv.height - m - bs.y)/dy : dy < 0 ? (HINT_B + 8*DPR - bs.y)/dy : 1e9);
  len = Math.max(18*DPR, Math.min(len, room));
  const ex = bs.x + dx*len, ey = bs.y + dy*len;
  c.setLineDash([7*DPR, 7*DPR]); c.strokeStyle = "rgba(255,255,255,.9)"; c.lineWidth = 2.5*DPR;
  c.beginPath(); c.moveTo(bs.x, bs.y); c.lineTo(ex, ey); c.stroke(); c.setLineDash([]);
  const hl = 12*DPR; c.fillStyle = "rgba(255,255,255,.95)";
  c.beginPath(); c.moveTo(ex + Math.cos(ang)*hl, ey + Math.sin(ang)*hl); c.lineTo(ex + Math.cos(ang + 2.5)*hl, ey + Math.sin(ang + 2.5)*hl); c.lineTo(ex + Math.cos(ang - 2.5)*hl, ey + Math.sin(ang - 2.5)*hl); c.closePath(); c.fill();
  // where your finger is pulling from: a faint tether only while dragging
  if (inp.down && pw > 0){ c.strokeStyle = "rgba(255,255,255,.25)"; c.lineWidth = 1.5*DPR; c.beginPath(); c.moveTo(inp.sx, inp.sy); c.lineTo(inp.x, inp.y); c.stroke(); c.fillStyle = "rgba(255,255,255,.5)"; c.beginPath(); c.arc(inp.x, inp.y, 7*DPR, 0, 7); c.fill(); }
  drawPowerBar(pw);
  if (M.moving) drawClockBar(clamp(1 - M.phaseT/M.aimLimit, 0, 1));
}
function drawMiniContact(){
  if (!M.contact) return;
  const c = cx, R = 26*DPR, X = cv.width - R - 14*DPR, Y = cv.height - R - 14*DPR;
  drawBigBall(X, Y, R, .35);
  c.fillStyle = "#ef5a60"; c.beginPath();
  c.arc(X + clamp(M.contact.u, -1.1, 1.1)*R, Y + clamp(M.contact.v, -1.1, 1.1)*R, 4*DPR, 0, 7); c.fill();
}
const DEFEND_PHASES = {jockey:1, steal:1, read:1, aerial:1};
const HINT = {
  dribble: "Hold and drag where you want the ball to go · D: shoot · S: options",
  decide: "Choose: press 1–4 or click an option",
  jockey: "Move to stay in front of him — wait for the heavy touch",
  steal: "Swipe through the ball, not through his legs",
  read: "Move into the lane and cut it out",
  aerial: "Hold to load the jump · let go to leap",
  aim: "Drag back from the ball to aim and set power · release to lock it in",
  contact: "Click where your boot hits the ball",
  rebound: "It's loose — get there first!",
  kick: "", flight: "", done: "", ai: "", aipass: ""
};
const MATE_TAG_COL = {open:"#5fd47a", better:"#ffd75a", run:"#48d0f0", marked:"#ffb04a", held:"#ff5a5f"};
function draw2DScene(){
  const c = cx, ok = figKit(MT.oppKit), mk = figKit(MT.myKit), b = M.ball;
  figBegin(b.x, b.y, FRAME_DT);
  for (let i = 0; i < M.wall.length; i++){ const w = M.wall[i]; figAdd(figSt(w), w.x, w.y, figOppL(w, i + 4), ok, F_WATCH, 0, 1, String(FIG_NUM_OPP[(i + 4) % FIG_NUM_OPP.length])); }
  if (M.mates) for (const t of M.mates){
    if (t.role === M.call){ const pulse = 1 + .15*Math.sin(performance.now()/160); c.strokeStyle = "rgba(255,215,90,.9)"; c.lineWidth = 3*DPR; c.beginPath(); c.arc(sx(t.x), sy(t.y), .55*scale*1.9*pulse, 0, 7); c.stroke(); }
    figAdd(figSt(t), t.x, t.y, figMateL(t), mk, 0, 0, 1, String(figMateNum(t.role)));
  }
  for (let i = 0; i < M.defs.length; i++){ const d = M.defs[i];
    const R = figAdd(figSt(d), d.x, d.y, figOppL(d, i), ok, F_WATCH, 0, d.stun > 0 ? .5 : 1, String(FIG_NUM_OPP[i % FIG_NUM_OPP.length]));
    if (d.stun > 0) R.roll = (i % 2 ? .28 : -.28)*Math.min(1, d.stun*2);          // beaten: off balance
  }
  figAdd(figSt(M.gk), M.gk.x, M.gk.y, figKeeperL(M.gk), ok, F_GK | F_WATCH, 0, 1, "1").dive = !!M.shot && (M.phase === "flight" || M.phase === "done");
  figPoseMe(figAdd(figSt(M.p), M.p.x, M.p.y, figMineL(M.p), mk, F_ME, 0, 1, String(S.player.number)));
  if (M.trail.length > 1){
    c.strokeStyle = "rgba(255,255,255,.35)"; c.lineWidth = 2*DPR; c.beginPath();
    M.trail.forEach((t, i) => { const X = sx(t.x), Y = sy(t.y - (t.z-BR)*.55); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.stroke();
  }
  figFlush(b);
  // each team-mate's name, and how free he is while it matters, in one tag under his own feet
  const tags = M.phase === "dribble" || M.phase === "decide" || M.phase === "aim";
  figTagsBegin(M.p.x, M.p.y, b);
  if (M.mates) for (const t of M.mates){
    const st = tags && t.st && typeof MATE_STATE === "object" ? MATE_STATE[t.st] : null;
    figTag(`${t.role} · ${t.name}`, st ? st.label : "", st ? MATE_TAG_COL[st.cls] || "#fff" : "", t.x, t.y, t.role === M.call, mk);
  }
}
/* a man's tag, under his feet: on the grass below a figure there is nothing of his own marker's to sit on (heads are
   up the screen, and markers stand goal-side, up the screen), so it reads as his. A pill in the dark with an edge in
   his shirt colour, the name, and a coloured state chip when there is one; the man you are calling for gets a gold
   edge and a bigger name. A tag never covers you, the ball or another tag: then it goes over his head instead. */
const FIG_TAGR = []; let FIG_TAGN = 0;
function figTagRect(x0, y0, x1, y1){ let r = FIG_TAGR[FIG_TAGN]; if (!r){ r = [0, 0, 0, 0]; FIG_TAGR[FIG_TAGN] = r; } r[0] = x0; r[1] = y0; r[2] = x1; r[3] = y1; FIG_TAGN++; }
// what tags must keep clear of: you (head to boots) and the ball where it is drawn
function figTagsBegin(px, py, ball){
  FIG_TAGN = 0; const KH = FIG.kh*scale, X = sx(px), Y = sy(py);
  figTagRect(X - .55*KH, figTopY(py, 0) - 12*DPR, X + .55*KH, Y + .45*KH);
  if (ball){ const p = ballScreen(ball), r = Math.max(3, .26*scale) + 3*DPR; figTagRect(p.x - r, p.y - r, p.x + r, p.y + r); }
  if (!M || REP) return;
  // what sits over the picture — the decision cards (and their heading), the power bar and its label while you aim,
  // the action buttons — is out of bounds too: a tag under them goes to one side or over his head
  if (M.phase === "aim"){ const r = powerBarRect(); figTagRect(r[0], r[1], r[2], r[3]); }
  const cr = cv.getBoundingClientRect();
  const dom = el => { if (!el || !el.offsetParent) return; const dr = el.getBoundingClientRect(); if (dr.width < 1 || dr.height < 1) return;
    figTagRect((dr.left - cr.left)*DPR, (dr.top - cr.top)*DPR, (dr.right - cr.left)*DPR, (dr.bottom - cr.top)*DPR); };
  if (M.phase === "decide") dom(document.getElementById("decide"));
  const ar = document.getElementById("actrow"); if (ar && getComputedStyle(ar).visibility !== "hidden" && ar.offsetHeight) dom(ar);
}
function figTagFree(x, y, w, h){ for (let i = 0; i < FIG_TAGN; i++){ const r = FIG_TAGR[i]; if (x < r[2] && x + w > r[0] && y < r[3] && y + h > r[1]) return false; } return true; }
function figTag(name, label, col, wx_, wy_, call, K){
  const c = cx, KH = FIG.kh*scale, h = (call ? 20 : 18)*DPR, pad = 7*DPR, gap = 6*DPR, X = sx(wx_), Y = sy(wy_);
  // a man off the picture gets a marker on its edge pointing out to him, never a tag pinned beside someone else
  // (up under the scorebug and the hint counts as off: a tag there would be read through the hint's words)
  if (X < 0 || X > cv.width || Y + .3*KH < HUDB || figTopY(wy_, 0) > cv.height) return figEdgeTag(name, call, K, X, Y - .4*KH);
  c.font = font(800, call ? 14 : 12); const nw = c.measureText(name).width;
  let lw = 0; if (label){ c.font = font(800, 11); lw = c.measureText(label).width + 10*DPR; }
  const w = nw + pad*2 + (label ? lw + gap - pad*.5 : 0), cxm = v => Math.round(clamp(v, 4*DPR, cv.width - w - 4*DPR));
  // under him, centred; or still under him but hanging off to one side; or else over his head
  // (a tag that would run off the bottom of the picture goes over his head at once)
  let x = cxm(X - w/2), y = Math.round(Y + .3*KH);
  const up = Math.round(figTopY(wy_, 0) - h - 2*DPR), below = y + h <= cv.height - 2*DPR;
  if (!below && up >= HUDB) y = up;
  else if (!figTagFree(x, y, w, h)){
    const r = cxm(X - .45*KH), l = cxm(X + .45*KH - w);
    if (figTagFree(r, y, w, h)) x = r; else if (figTagFree(l, y, w, h)) x = l; else if (up >= HUDB && figTagFree(x, up, w, h)) y = up;
  }
  figTagRect(x, y, x + w, y + h);
  if (y > cv.height || y + h < 0) return;
  c.fillStyle = "rgba(6,12,20,.8)"; roundRect(c, x, y, w, h, h/2); c.fill();
  c.strokeStyle = call ? "#ffd75a" : K ? K.shirt : "rgba(255,255,255,.4)"; c.lineWidth = (call ? 2 : 1.5)*DPR; roundRect(c, x, y, w, h, h/2); c.stroke();
  c.textAlign = "left"; c.textBaseline = "middle";
  c.font = font(800, call ? 14 : 12); c.fillStyle = call ? "#ffd75a" : "rgba(255,255,255,.94)"; c.fillText(name, x + pad, y + h/2 + .5*DPR);
  if (label){ const lx = x + pad + nw + gap, lh = h - 6*DPR;
    c.fillStyle = col; c.globalAlpha = .18; roundRect(c, lx, y + 3*DPR, lw, lh, lh/2); c.fill(); c.globalAlpha = 1;
    c.font = font(800, 11); c.fillStyle = col; c.fillText(label, lx + 5*DPR, y + h/2 + .5*DPR); }
}
// the edge marker: a smaller, dimmer pill with a dashed edge, on the side of the picture he is off (or just under the
// hint when he is up under the scorebug), with an arrow at its end pointing straight out to him. It steps along that
// edge until it covers no one — you, the ball, another tag, or any man on the pitch — or else it is left out
function figManFree(x, y, w, h){
  if (!M || REP) return true;
  const KH = FIG.kh*scale;
  const hit = o => { if (!o || o.gone) return false; const X = sx(o.x); return x < X + .32*KH && x + w > X - .32*KH && y < sy(o.y) + .12*KH && y + h > figTopY(o.y, 0); };
  if (hit(M.p) || hit(M.gk)) return false;
  if (M.mates) for (const t of M.mates) if (hit(t)) return false;
  if (M.defs) for (const d of M.defs) if (hit(d)) return false;
  return true;
}
function figEdgeTag(name, call, K, X, Y){
  const c = cx, h = 17*DPR, pad = 6*DPR, aw = 11*DPR, m = 4*DPR;
  c.font = font(800, 11); const nw = c.measureText(name).width, w = nw + pad*2 + aw;
  const top = Math.max(m, HUDB + 2*DPR), bot = cv.height - h - m;
  if (bot <= top) return;
  // which way he is: off a side, or above / below the picture
  const a = X < 0 ? Math.PI : X > cv.width ? 0 : Y < cv.height/2 ? -Math.PI/2 : Math.PI/2;
  const x0 = clamp(X - w/2, m, cv.width - w - m), y0 = clamp(Y - h/2, top, bot);
  const ok = (xx, yy) => figTagFree(xx, yy, w, h) && figManFree(xx, yy, w, h);
  let x = Math.round(x0), y = Math.round(y0);
  if (!ok(x, y)){
    // it slides along its own edge: up and down the side he is off, or across the top or the bottom, then (top and
    // bottom only) a row further in
    let found = false;
    if (a === 0 || a === Math.PI){
      const st = h + 3*DPR;
      for (let k = 1; k <= 16 && !found; k++){
        const dn = Math.round(y0 + k*st), up = Math.round(y0 - k*st);
        if (dn <= bot && ok(x, dn)){ y = dn; found = true; } else if (up >= top && ok(x, up)){ y = up; found = true; }
      }
    } else {
      const st = 12*DPR, rows = [y0, a < 0 ? y0 + h + 3*DPR : y0 - h - 3*DPR];
      for (const yr of rows){ if (found || yr < top || yr > bot) continue;
        for (let k = 0; k <= 40 && !found; k++){
          const r = Math.round(x0 + k*st), l = Math.round(x0 - k*st), yy = Math.round(yr);
          if (r <= cv.width - w - m && ok(r, yy)){ x = r; y = yy; found = true; } else if (l >= m && ok(l, yy)){ x = l; y = yy; found = true; }
          if (r > cv.width - w - m && l < m) break;
        }
      }
    }
    if (!found) return;                                             // nowhere clear: better no marker than a wrong one
  }
  figTagRect(x, y, x + w, y + h);
  const right = a === 0, ax = right ? x + w - pad*.55 - aw/2 : x + pad*.55 + aw/2, ay = y + h/2;
  const ca = Math.cos(a), sa = Math.sin(a), r = aw*.44;
  c.globalAlpha = .92;
  c.fillStyle = "rgba(6,12,20,.74)"; roundRect(c, x, y, w, h, h/2); c.fill();
  c.setLineDash([3*DPR, 3*DPR]); c.strokeStyle = call ? "#ffd75a" : K ? K.shirt : "rgba(255,255,255,.4)"; c.lineWidth = 1.25*DPR;
  roundRect(c, x, y, w, h, h/2); c.stroke(); c.setLineDash([]);
  c.fillStyle = call ? "#ffd75a" : "rgba(255,255,255,.92)";
  c.beginPath(); c.moveTo(ax + ca*r, ay + sa*r); c.lineTo(ax - ca*r*.6 - sa*r*.8, ay - sa*r*.6 + ca*r*.8); c.lineTo(ax - ca*r*.6 + sa*r*.8, ay - sa*r*.6 - ca*r*.8); c.closePath(); c.fill();
  c.textAlign = "left"; c.textBaseline = "middle"; c.fillStyle = call ? "#ffd75a" : "rgba(255,255,255,.88)";
  c.fillText(name, right ? x + pad : x + pad + aw, y + h/2 + .5*DPR);
  c.globalAlpha = 1;
}
// you: lined up behind the ball you face where you aim, you strike through it, you throw it in from over your head
function figPoseMe(R){
  const ph = M.phase, aimA = M.aim ? M.aim.ang + (M.aim.swayAng || 0) : null, lockA = M.lock ? M.lock.ang : aimA;
  if (M.throwIn && (ph === "aim" || ph === "contact" || ph === "kick")){                       // in his hands until it is launched
    R.pose = 3; R.face = ph === "kick" ? lockA : aimA; R.u = ph === "kick" ? clamp((M.kickT || 0)/.24, 0, 1) : 0; return; }
  if ((ph === "aim" || ph === "contact") && aimA != null) R.face = aimA;
  else if (ph === "kick" && M.kickT != null && !M.throwIn){ R.pose = 1; R.u = clamp(M.kickT/.24, 0, 1); R.face = lockA; }
  else if ((ph === "flight" || ph === "done") && M.kickT != null && M.kickT < .6 && M.shot && !M.shot.ai && !M.throwIn){ R.pose = 1; R.u = 1 + clamp((M.kickT - .24)/.36, 0, 1); R.face = lockA; }
}
// the hint under the banner: what this moment is, then what to do. One line when it fits; otherwise it breaks at
// its own separators (and between words if one part is still too long) and the box grows to hold the lines.
const HL = {lines:[], px:15, w:0, h:0, key:""};
function hintLayout(){
  const hint = M.throwIn && M.phase === "aim" ? "Drag back from the thrower to aim and set the weight · release to throw"
    : M.phase === "aim" && passMode() && !M.corner ? "Drag back to aim and set the weight · release · D to shoot instead" : (HINT[M.phase] || "");
  const parts = [M.info, hint].filter(Boolean).join(" · ").split(" · ").filter(Boolean);
  const key = parts.join("|") + "@" + cv.width;
  if (HL.key === key) return HL;
  const c = cx, maxW = cv.width - 44*DPR;
  HL.key = key; HL.lines = []; HL.w = 0;
  if (parts.length){
    let px = 15; c.font = font(700, px);
    let one = parts.join(" · ");
    if (c.measureText(one).width > maxW){ px = 14; c.font = font(700, px); }
    if (c.measureText(one).width <= maxW) HL.lines = [one];
    else {
      // pack whole parts onto lines; a part longer than a line is broken between words
      let cur = "";
      const push = t => { if (cur && c.measureText(cur + " · " + t).width <= maxW) cur += " · " + t; else { if (cur) HL.lines.push(cur); cur = t; } };
      for (const p of parts){
        if (c.measureText(p).width <= maxW){ push(p); continue; }
        if (cur){ HL.lines.push(cur); cur = ""; }
        for (const w of p.split(" ")){ if (cur && c.measureText(cur + " " + w).width > maxW){ HL.lines.push(cur); cur = w; } else cur = cur ? cur + " " + w : w; }
      }
      if (cur) HL.lines.push(cur);
    }
    HL.px = px; c.font = font(700, px);
    for (const l of HL.lines) HL.w = Math.max(HL.w, c.measureText(l).width);
  }
  HL.h = HL.lines.length ? (HL.lines.length*(HL.px + 5) + 9)*DPR : 0;
  return HL;
}
function drawHint(L){
  if (!L.lines.length) return;
  const c = cx, lh = (L.px + 5)*DPR;
  c.fillStyle = "rgba(0,0,0,.5)"; roundRect(c, (cv.width - L.w)/2 - 10*DPR, TOPM, L.w + 20*DPR, L.h, 9*DPR); c.fill();
  c.font = font(700, L.px); c.textAlign = "center"; c.textBaseline = "top"; c.fillStyle = "rgba(255,255,255,.95)";
  L.lines.forEach((l, i) => c.fillText(l, cv.width/2, TOPM + 5*DPR + i*lh));
  c.textAlign = "left";
}
// how long you have left, just under the hint
function drawClockBar(f){
  const c = cx, y = HINT_B - 10*DPR;
  c.fillStyle = "rgba(0,0,0,.35)"; c.fillRect(cv.width/2 - 70*DPR, y, 140*DPR, 6*DPR);
  c.fillStyle = f < .3 ? "#ef5a60" : "#ffd75a"; c.fillRect(cv.width/2 - 70*DPR, y, 140*DPR*f, 6*DPR);
}
function drawOverlay(){
  const c = cx;
  // lay the hint out first: the clock bar and the aim arrow keep clear of it, and the camera keeps the goal under it
  hintLayout();
  HINT_B = TOPM + Math.max(26*DPR, HL.h) + 16*DPR;
  HUDB = Math.max(TOPM + 44*DPR, HINT_B);
  if ((M.phase === "dribble" || M.phase === "rebound") && inp.down){
    const bs = ballScreen(M.ball);
    c.strokeStyle = "rgba(255,215,90,.85)"; c.lineWidth = 2*DPR;
    c.beginPath(); c.arc(inp.x, inp.y, 12*DPR, 0, 7); c.stroke();
    c.setLineDash([5*DPR, 6*DPR]); c.beginPath(); c.moveTo(bs.x, bs.y); c.lineTo(inp.x, inp.y); c.stroke(); c.setLineDash([]);
  }
  if (M.phase === "decide"){ c.fillStyle = "rgba(6,12,22,.18)"; c.fillRect(0, 0, cv.width, cv.height); }
  if (M.phase === "aim") drawAimStage();
  if (M.phase === "contact") drawContactStage();
  if (DEFEND_PHASES[M.phase]) drawDefendOverlay();
  if (!M.throwIn && (M.phase === "kick" || M.phase === "flight" || M.phase === "done")) drawMiniContact();
  drawHint(HL);
  if (M.phase === "dribble") drawClockBar(clamp(1 - M.t/M.limit, 0, 1));
  if (M.flash && typeof M.flash.t === "string" && M.flash.t) drawFlash(M.flash);
}
/* the flash ("Options!", "Skinned him!"): a short word across the pitch. It is placed, each frame, where it covers
   none of what you must read: you, the ball and every name tag, the decision cards and the power bar — and, if it
   can, none of the other men either. It looks under the hint and above the cards or the power bar, along the middle
   first and then to either side, and at a smaller size when the full one fits nowhere; it glides when it moves. Where
   nothing is clear of you, the ball and the tags, it is not drawn at all: the word is a flourish, they are the game */
const FLASH_AV = []; let FLASH_AVN = 0;
function flashAvoid(x0, y0, x1, y1, wt){ let r = FLASH_AV[FLASH_AVN]; if (!r){ r = [0, 0, 0, 0, 0]; FLASH_AV[FLASH_AVN] = r; } r[0] = x0; r[1] = y0; r[2] = x1; r[3] = y1; r[4] = wt; FLASH_AVN++; }
function flashMan(o){ if (!o || o.gone) return; const KH = FIG.kh*scale, X = sx(o.x); flashAvoid(X - .4*KH, figTopY(o.y, 0), X + .4*KH, sy(o.y) + .15*KH, 1); }
// what a box (centre x, y; half width hw, height th) covers: [of you / the ball / tags / cards, of the other men]
function flashCover(x, y, hw, th){
  let hard = 0, soft = 0; const x0 = x - hw, x1 = x + hw, y0 = y - th/2, y1 = y + th/2;
  for (let i = 0; i < FLASH_AVN; i++){ const r = FLASH_AV[i];
    const ox = Math.min(x1, r[2]) - Math.max(x0, r[0]), oy = Math.min(y1, r[3]) - Math.max(y0, r[1]);
    if (ox > 0 && oy > 0){ if (r[4] >= 8) hard += ox*oy; else soft += ox*oy; } }
  return [hard, soft];
}
function drawFlash(f){
  const c = cx, life = f.life, pop = 1 + Math.max(0, life - 1)*.8, maxW = cv.width - 32*DPR;
  const px0 = clamp(cv.height/DPR*.07, 24, 34);                  // a short screen (a phone on its side) gets a smaller word
  c.font = font(800, px0); const tw0 = c.measureText(f.t).width;
  const fit = tw0*1.16 > maxW ? maxW/(tw0*1.16) : 1;            // a long one on a phone: smaller, never off the sides
  FLASH_AVN = 0;
  if (M.phase === "contact"){ f.k = 1; f.x = cv.width/2; f.y = Math.max(cv.height*.12, HUDB + px0*fit*.58*DPR + 6*DPR); f.show = true; }
  else {
    for (let i = 0; i < FIG_TAGN; i++){ const r = FIG_TAGR[i]; flashAvoid(r[0], r[1], r[2], r[3], 8); }   // you, the ball, the tags, the cards, the bar
    if (M.mates) for (const t of M.mates) flashMan(t);
    if (M.defs) for (const d of M.defs) flashMan(d);
    flashMan(M.gk); flashMan(M.att); flashMan(M.rival); flashMan(M.recv);
    const KH = FIG.kh*scale, X = sx(M.p.x); flashAvoid(X - .45*KH, figTopY(M.p.y, 0) - 4*DPR, X + .45*KH, sy(M.p.y) + .2*KH, 8);
    const b = ballScreen(M.ball); flashAvoid(b.x - 10*DPR, b.y - 10*DPR, b.x + 10*DPR, b.y + 10*DPR, 8);
    const dc = M.phase === "decide" && document.getElementById("decide");
    if (dc && dc.offsetParent){                                   // the cards and their heading: under the picture, or in a side column
      const cr = cv.getBoundingClientRect(), dr = dc.getBoundingClientRect();
      flashAvoid((dr.left - cr.left)*DPR, (dr.top - cr.top)*DPR - 30*DPR, (dr.right - cr.left)*DPR, (dr.bottom - cr.top)*DPR, 8);
    }
    if (M.phase === "aim"){ const r = powerBarRect(); flashAvoid(r[0], r[1], r[2], r[3], 8); }
    const lo = cv.height - 64*DPR, hi = HUDB + 6*DPR, prefY = cv.height*.36, mx = cv.width/2, step = 6*DPR;
    // the size it had stays the most it can have, so a word never swells again as the men move
    let best = null;
    for (const k of [1, .8, .64]){
      if (f.k != null && k > f.k + 1e-6) continue;
      const th = px0*fit*k*1.16*DPR + 8*DPR, hw = tw0*fit*k*.58 + 8*DPR, xs = [mx];
      for (let d = cv.width/10; mx + d + hw <= cv.width - 8*DPR; d += cv.width/10) xs.push(mx - d, mx + d);
      for (const x of xs) for (let y = hi + th/2; y + th/2 <= lo || y === hi + th/2; y += step){
        const [hard, soft] = flashCover(x, y, hw, th);
        const sc = (hard > 0 ? 1e9 + hard : 0) + soft*40 + Math.abs(y - prefY)*.5 + Math.abs(x - mx)*.8;
        if (!best || sc < best.sc) best = {sc, x, y, k, hard, soft};
        if (y + th/2 > lo) break;
      }
      if (best && best.hard === 0 && best.soft === 0) break;     // clear of everyone at this size
    }
    if (!best || best.hard > 0){ f.show = false; return; }        // nowhere clear of you, the ball and the tags
    // it stays where it is while that is as clear as the best place (and not much further from the middle); it glides
    // to a new place when the way there crosses no one, and otherwise goes there at once
    const th = px0*fit*best.k*1.16*DPR + 8*DPR, hw = tw0*fit*best.k*.58 + 8*DPR;
    const here = f.show && f.k === best.k && Number.isFinite(f.x) && Number.isFinite(f.y) ? flashCover(f.x, f.y, hw, th) : null;
    const hereSc = here ? (here[0] > 0 ? 1e9 : 0) + here[1]*40 + Math.abs(f.y - prefY)*.5 + Math.abs(f.x - mx)*.8 : 1e18;
    if (hereSc > best.sc + 24*DPR){
      let clear = !!here && FRAME_DT > 0;
      for (let i = 1; i <= 6 && clear; i++){ const q = i/6, cv_ = flashCover(f.x + (best.x - f.x)*q, f.y + (best.y - f.y)*q, hw, th); if (cv_[0] > 0 || cv_[1] > 0) clear = false; }
      if (clear){ const g = Math.min(1, FRAME_DT*10); f.x += (best.x - f.x)*g; f.y += (best.y - f.y)*g; }
      else { f.x = best.x; f.y = best.y; }
    }
    f.k = best.k; f.show = true;
  }
  if (!Number.isFinite(f.x) || !Number.isFinite(f.y)){ f.x = cv.width/2; f.y = cv.height*.36; }
  c.globalAlpha = clamp(life*1.8, 0, 1); c.textAlign = "center"; c.textBaseline = "middle";
  c.font = font(800, px0*fit*f.k*pop); c.lineWidth = 5*DPR*f.k; c.strokeStyle = "rgba(0,0,0,.55)";
  c.strokeText(f.t, f.x, f.y); c.fillStyle = "#ffd75a"; c.fillText(f.t, f.x, f.y); c.globalAlpha = 1;
  c.textAlign = "left";
}
function lerpFrames(f, g, t){
  if (!g) return f;
  const pair = (A, B) => A && B ? A.map((v, i) => typeof v === "number" && typeof B[i] === "number" ? v + (B[i] - v)*t : v) : A;
  const list = (A, B) => (A || []).map((row, i) => pair(row, B && B[i]));
  return {b:pair(f.b, g.b), p:pair(f.p, g.p), c:pair(f.c, g.c), g:pair(f.g, g.g), d:list(f.d, g.d), m:list(f.m, g.m), w:list(f.w, g.w)};
}
// a replay has no engine objects to hang motion on, so each slot keeps its own (fresh for every replay)
let REP_ST = null;
function repSt(list, i){ let s = list[i]; if (!s){ s = figNewSt(); list[i] = s; } return s; }
const REP_BALL = {x:0, y:0, z:0};
function drawReplayScene(f){
  if (!f || !MT) return;
  const c = cx, ok = figKit(MT.oppKit), mk = figKit(MT.myKit);
  if (!REP_ST || REP_ST.rep !== REP) REP_ST = {rep:REP, p:figNewSt(), g:figNewSt(), c:figNewSt(), d:[], w:[], m:{}};
  REP_BALL.x = f.b[0]; REP_BALL.y = f.b[1]; REP_BALL.z = f.b[2];
  figBegin(f.b[0], f.b[1], FRAME_DT);
  const L = REP_ST;
  for (let i = 0; i < f.w.length; i++){ const w = f.w[i], s = repSt(L.w, i); figAdd(s, w[0], w[1], s.look || (s.look = figOpp(i + 4)), ok, F_WATCH, 0, 1, String(FIG_NUM_OPP[(i + 4) % FIG_NUM_OPP.length])); }
  for (let i = 0; i < f.d.length; i++){ const d = f.d[i], s = repSt(L.d, i); figAdd(s, d[0], d[1], s.look || (s.look = figOpp(i)), ok, F_WATCH, 0, d[2] ? .5 : 1, String(FIG_NUM_OPP[i % FIG_NUM_OPP.length])); }
  for (const t of f.m){ const s = L.m[t[2]] || (L.m[t[2]] = figNewSt()); figAdd(s, t[0], t[1], s.look || (s.look = figMate(null, t[2])), mk, 0, 0, 1, String(figMateNum(t[2]))); }
  figAdd(L.g, f.g[0], f.g[1], L.g.look || (L.g.look = figKeeper()), ok, F_GK | F_WATCH, 0, 1, "1").dive = f.b[1] < 9 && Math.hypot(f.b[0] - f.g[0], f.b[1] - f.g[1]) < 5;
  if (f.c) figAdd(L.c, f.c[0], f.c[1], L.c.look || (L.c.look = figMate(null, "CAM")), mk, 0, 0, 1, "");
  figAdd(L.p, f.p[0], f.p[1], L.p.look || (L.p.look = figMine()), mk, F_ME, 0, 1, String(S.player.number));
  figFlush(REP_BALL);
  figTagsBegin(f.p[0], f.p[1], REP_BALL);
  for (const t of f.m) figTag(t[2], "", "", t[0], t[1], false, mk);
}
function drawReplayHud(){
  const c = cx, f = Math.min(1, REP.i/Math.max(1, REP.frames.length - 1));
  c.fillStyle = "rgba(0,0,0,.35)"; c.fillRect(cv.width*.25, cv.height - 26*DPR, cv.width*.5, 4*DPR);
  c.fillStyle = "#ffd75a"; c.fillRect(cv.width*.25, cv.height - 26*DPR, cv.width*.5*f, 4*DPR);
  // the replay banner over the pitch says REPLAY (and what it is, and Skip): nothing more is written on the canvas
  // (only without that banner, which only the engine's own tests do, does the canvas say it)
  if (!document.querySelector("#ov.rep:not([hidden])")){
    c.textAlign = "center"; c.textBaseline = "top"; c.font = font(800, 20); c.fillStyle = "rgba(255,255,255,.92)";
    c.fillText("REPLAY", cv.width/2, TOPM + 6*DPR);
  }
}
let FRAME_DT = 0;                                   // this frame's step, for the men's strides (0: a redraw, nothing moved)
function draw(dt){
  if (!cx) return;
  FRAME_DT = dt > 0 && dt < .5 ? dt : 0;
  camFollow(dt || 1/60);
  drawPitch();
  if (REP){
    const i = Math.min(REP.frames.length - 1, Math.floor(REP.i));       // smooth playback between snapshots
    drawReplayScene(lerpFrames(REP.frames[i], REP.frames[i + 1], REP.i - i));
    drawReplayHud(); return;
  }
  FIG_TAGN = 0;                                       // this frame's tags (a defending moment draws none)
  if (M && MT) (DEFEND_PHASES[M.phase] && M.att !== undefined || DEFEND_PHASES[M.phase]) ? drawDefendScene() : draw2DScene();
  if (MT) drawChant();
  if (M && MT) drawOverlay();
}
