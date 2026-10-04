"use strict";
/* ============ CANVAS + DRAWING ============ */
const VIEW = {x0:-3, x1:71, y0:-11, y1:45};
let cv = null, cx = null, scale = 1, offX = 0, offY = 0, DPR = 1, TOPM = 80, NEED_DRAW = true, BGC = null;
// On phones the whole pitch is far too small, so the camera zooms in and follows the play.
let ZOOM = false, CAM = {x:34, y:20}, CAMT = {x:34, y:20};
const LAYER = {x0:-9, y0:-14, x1:77, y1:52};       // world area pre-rendered into the background layer

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
  if (ZOOM){
    const viewW = aspect < .8 ? 34 : aspect < 1.1 ? 42 : 50;     // metres across the screen
    scale = cv.width/viewW;
    CAM.x = CAMT.x; CAM.y = CAMT.y; applyCam();
  } else {
    const vw = VIEW.x1-VIEW.x0, vh = VIEW.y1-VIEW.y0;
    scale = Math.min(cv.width/vw, cv.height/vh);
    offX = (cv.width - vw*scale)/2 - VIEW.x0*scale;
    offY = (cv.height - vh*scale)/2 - VIEW.y0*scale;
  }
  // top of the free pitch area = just under the score banner (whatever size it is on this screen)
  const sb = document.querySelector(".scorebug");
  const sbBot = sb ? sb.getBoundingClientRect().bottom - r.top : 70;
  TOPM = (sbBot + 6)*DPR;
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
  const cx_ = clamp(CAM.x, LAYER.x0 + halfW, LAYER.x1 - halfW), cy_ = clamp(CAM.y, LAYER.y0 + halfH, LAYER.y1 - halfH);
  offX = cv.width/2 - cx_*scale; offY = cv.height/2 - cy_*scale;
}
// follow the ball, looking a little towards the goal so you can see where you're going
function camFollow(dt){
  if (!ZOOM) return;
  let bx = 34, by = 20;
  if (REP){ const f = REP.frames[Math.min(REP.frames.length - 1, Math.floor(REP.i))]; if (f){ bx = f.b[0]; by = f.b[1]; } }
  else if (M){ bx = M.ball.x; by = M.ball.y; if (M.phase === "dribble" || M.phase === "rebound"){ bx += M.p.vx*.35; by += M.p.vy*.35; } }
  CAMT.x = bx*.75 + 34*.25; CAMT.y = Math.min(by, by*.72 + 4);
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
function drawMan(x, y, col, col2, label, me){
  const c = cx, r = .55*scale;
  c.fillStyle = "rgba(0,0,0,.28)"; c.beginPath(); c.ellipse(sx(x)+r*.25, sy(y)+r*.35, r, r*.6, 0, 0, 7); c.fill();
  c.fillStyle = col; c.beginPath(); c.arc(sx(x), sy(y), r, 0, 7); c.fill();
  c.lineWidth = Math.max(1.5, r*.22); c.strokeStyle = col2; c.stroke();
  if (me){ c.strokeStyle = "#ffd75a"; c.lineWidth = Math.max(2, r*.18); c.beginPath(); c.arc(sx(x), sy(y), r*1.45, 0, 7); c.stroke(); }
  if (label){ c.fillStyle = col2; c.font = `700 ${Math.max(9, r*.95)}px "Barlow Condensed", sans-serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(label, sx(x), sy(y)+1); }
}
function drawBall(b){
  const c = cx;
  c.fillStyle = "rgba(0,0,0,.35)"; c.beginPath(); c.ellipse(sx(b.x), sy(b.y), .3*scale, .18*scale, 0, 0, 7); c.fill();
  const r = Math.max(3, (.26 + (b.z-BR)*.05)*scale);
  c.fillStyle = "#fff"; c.strokeStyle = "#222"; c.lineWidth = 1;
  c.beginPath(); c.arc(sx(b.x), sy(b.y - (b.z-BR)*.55), r, 0, 7); c.fill(); c.stroke();
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
function drawPowerBar(pw, label){
  const c = cx, w = Math.min(cv.width*.46, 520*DPR), h = Math.max(26*DPR, w*.1), x = (cv.width - w)/2, y = cv.height - h - 34*DPR;
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
  const c = cx, [o1, o2] = MT.oppKit, [m1, m2] = MT.myKit;
  if (M.att && !M.att.gone){
    // his legs are the thing you must not catch — shown as a soft shape under him
    if (M.phase === "steal"){
      const l = worldToScreen(M.att.x, M.att.y, 0), R = (1.05 - (S.skills.tackling || 20)*.004)*scale;
      c.fillStyle = "rgba(255,90,96,.16)"; c.beginPath(); c.arc(l.x, l.y, R, 0, 7); c.fill();
      c.strokeStyle = "rgba(255,90,96,.5)"; c.lineWidth = 2*DPR; c.stroke();
    }
    drawMan(M.att.x, M.att.y, o1, o2, "", false);
  }
  if (M.rival) drawMan(M.rival.x, M.rival.y, o1, o2, "", false);
  if (M.recv) drawMan(M.recv.x, M.recv.y, o1, o2, "", false);
  const jz = M.jumped ? M.jumped.z : 0;
  drawMan(M.p.x, M.p.y - jz*.35, m1, m2, String(S.player.number), true);
  drawBall(M.ball);
}
function drawDefendOverlay(){
  const c = cx;
  if (M.phase === "jockey" || M.phase === "steal"){
    // how hard you are making it for him
    const w = 150*DPR, x = cv.width/2 - w/2, y = TOPM + 48*DPR;
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
  const c = cx, b = M.ball, A_ = M.aim, bs = worldToScreen(b.x, b.y, b.z), ang = A_.ang + A_.swayAng, pw = A_.power;
  // aim arrow: dotted path ahead of the ball, longer with more power
  // arrow grows with power but always stays on screen (clipped at a margin from every edge)
  // the arrow is as long as the ball will travel, so a throw draws a short one and a shot a long one
  let len = (5 + pw*(M.throwIn ? 15 : (typeof passMode === "function" && passMode()) ? 30 : 24))*scale;
  const m = 34*DPR, dx = Math.cos(ang), dy = Math.sin(ang);
  const room = Math.min(dx > 0 ? (cv.width - m - bs.x)/dx : dx < 0 ? (m - bs.x)/dx : 1e9, dy > 0 ? (cv.height - m - bs.y)/dy : dy < 0 ? (TOPM + 44*DPR - bs.y)/dy : 1e9);
  len = Math.max(18*DPR, Math.min(len, room));
  const ex = bs.x + dx*len, ey = bs.y + dy*len;
  c.setLineDash([7*DPR, 7*DPR]); c.strokeStyle = "rgba(255,255,255,.9)"; c.lineWidth = 2.5*DPR;
  c.beginPath(); c.moveTo(bs.x, bs.y); c.lineTo(ex, ey); c.stroke(); c.setLineDash([]);
  const hl = 12*DPR; c.fillStyle = "rgba(255,255,255,.95)";
  c.beginPath(); c.moveTo(ex + Math.cos(ang)*hl, ey + Math.sin(ang)*hl); c.lineTo(ex + Math.cos(ang + 2.5)*hl, ey + Math.sin(ang + 2.5)*hl); c.lineTo(ex + Math.cos(ang - 2.5)*hl, ey + Math.sin(ang - 2.5)*hl); c.closePath(); c.fill();
  // where your finger is pulling from: a faint tether only while dragging
  if (inp.down && pw > 0){ c.strokeStyle = "rgba(255,255,255,.25)"; c.lineWidth = 1.5*DPR; c.beginPath(); c.moveTo(inp.sx, inp.sy); c.lineTo(inp.x, inp.y); c.stroke(); c.fillStyle = "rgba(255,255,255,.5)"; c.beginPath(); c.arc(inp.x, inp.y, 7*DPR, 0, 7); c.fill(); }
  drawPowerBar(pw);
  if (M.moving){
    const f = clamp(1 - M.phaseT/M.aimLimit, 0, 1);
    c.fillStyle = "rgba(0,0,0,.35)"; c.fillRect(cv.width/2 - 70*DPR, TOPM + 32*DPR, 140*DPR, 6*DPR);
    c.fillStyle = f < .3 ? "#ef5a60" : "#ffd75a"; c.fillRect(cv.width/2 - 70*DPR, TOPM + 32*DPR, 140*DPR*f, 6*DPR);
  }
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
  dribble: "Hold and drag where you want the ball to go · D: shoot · S: pass",
  jockey: "Move to stay in front of him — wait for the heavy touch",
  steal: "Swipe through the ball, not through his legs",
  read: "Move into the lane and cut it out",
  aerial: "Hold to load the jump · let go to leap",
  aim: "Drag back from the ball to aim and set power · release to lock it in",
  contact: "Click where your boot hits the ball",
  rebound: "It's loose — get there first!",
  kick: "", flight: "", done: "", ai: "", aipass: ""
};
function draw2DScene(){
  const c = cx, [o1, o2] = MT.oppKit, [m1, m2] = MT.myKit;
  for (const w of M.wall) drawMan(w.x, w.y, o1, o2, "", false);
  if (M.mates) for (const t of M.mates){
    const call = t.role === M.call;
    if (call){ const pulse = 1 + .15*Math.sin(performance.now()/160); c.strokeStyle = "rgba(255,215,90,.9)"; c.lineWidth = 3*DPR; c.beginPath(); c.arc(sx(t.x), sy(t.y), .55*scale*1.9*pulse, 0, 7); c.stroke(); }
    drawMan(t.x, t.y, m1, m2, "", false);
    c.fillStyle = call ? "#ffd75a" : "rgba(255,255,255,.9)"; c.font = font(800, call ? 15 : 13); c.textAlign = "center"; c.textBaseline = "bottom";
    c.fillText(`${t.role} · ${t.name}`, sx(t.x), sy(t.y) - .9*scale);
  }
  for (const d of M.defs){ c.globalAlpha = d.stun > 0 ? .5 : 1; drawMan(d.x, d.y, o1, o2, "", false); c.globalAlpha = 1; }
  drawMan(M.gk.x, M.gk.y, "#e3f030", "#1b1b1b", "1", false);
  drawMan(M.p.x, M.p.y, m1, m2, String(S.player.number), true);
  if (M.trail.length > 1){
    c.strokeStyle = "rgba(255,255,255,.35)"; c.lineWidth = 2*DPR; c.beginPath();
    M.trail.forEach((t, i) => { const X = sx(t.x), Y = sy(t.y - (t.z-BR)*.55); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.stroke();
  }
  drawBall(M.ball);
}
function drawOverlay(){
  const c = cx;
  if ((M.phase === "dribble" || M.phase === "rebound") && inp.down){
    const bs = worldToScreen(M.ball.x, M.ball.y, M.ball.z);
    c.strokeStyle = "rgba(255,215,90,.85)"; c.lineWidth = 2*DPR;
    c.beginPath(); c.arc(inp.x, inp.y, 12*DPR, 0, 7); c.stroke();
    c.setLineDash([5*DPR, 6*DPR]); c.beginPath(); c.moveTo(bs.x, bs.y); c.lineTo(inp.x, inp.y); c.stroke(); c.setLineDash([]);
  }
  if (M.phase === "aim") drawAimStage();
  if (M.phase === "contact") drawContactStage();
  if (DEFEND_PHASES[M.phase]) drawDefendOverlay();
  if (!M.throwIn && (M.phase === "kick" || M.phase === "flight" || M.phase === "done")) drawMiniContact();
  c.textAlign = "left"; c.textBaseline = "top"; c.font = font(700, 15);
  const hint = M.throwIn && M.phase === "aim" ? "Drag back from the thrower to aim and set the weight · release to throw" : (HINT[M.phase] || "");
  const txt = `${M.info ? M.info + " · " : ""}${hint}`;
  if (txt){ c.fillStyle = "rgba(0,0,0,.5)"; roundRect(c, (cv.width - c.measureText(txt).width)/2 - 10*DPR, TOPM, c.measureText(txt).width + 20*DPR, 26*DPR, 9*DPR); c.fill(); }
  c.textAlign = "center"; c.fillStyle = "rgba(255,255,255,.95)"; c.fillText(txt, cv.width/2, TOPM + 5*DPR); c.textAlign = "left";
  if (M.phase === "dribble"){
    const f = clamp(1 - M.t/M.limit, 0, 1);
    c.fillStyle = "rgba(0,0,0,.35)"; c.fillRect(cv.width/2 - 70*DPR, TOPM + 32*DPR, 140*DPR, 6*DPR);
    c.fillStyle = f < .3 ? "#ef5a60" : "#ffd75a"; c.fillRect(cv.width/2 - 70*DPR, TOPM + 32*DPR, 140*DPR*f, 6*DPR);
  }
  if (M.flash){
    const life = M.flash.life, pop = 1 + Math.max(0, life - 1)*1.5;
    c.globalAlpha = clamp(life*1.5, 0, 1); c.textAlign = "center"; c.textBaseline = "middle";
    c.font = font(800, 46*pop); c.lineWidth = 6*DPR; c.strokeStyle = "rgba(0,0,0,.55)";
    const fy = M.phase === "contact" ? cv.height*.12 : cv.height*.42;
    c.strokeText(M.flash.t, cv.width/2, fy); c.fillStyle = "#ffd75a"; c.fillText(M.flash.t, cv.width/2, fy); c.globalAlpha = 1;
  }
}
function lerpFrames(f, g, t){
  if (!g) return f;
  const pair = (A, B) => A && B ? A.map((v, i) => typeof v === "number" && typeof B[i] === "number" ? v + (B[i] - v)*t : v) : A;
  const list = (A, B) => (A || []).map((row, i) => pair(row, B && B[i]));
  return {b:pair(f.b, g.b), p:pair(f.p, g.p), c:pair(f.c, g.c), g:pair(f.g, g.g), d:list(f.d, g.d), m:list(f.m, g.m), w:list(f.w, g.w)};
}
function drawReplayScene(f){
  if (!f || !MT) return;
  const c = cx, [o1, o2] = MT.oppKit, [m1, m2] = MT.myKit;
  for (const w of f.w) drawMan(w[0], w[1], o1, o2, "", false);
  for (const d of f.d){ c.globalAlpha = d[2] ? .5 : 1; drawMan(d[0], d[1], o1, o2, "", false); c.globalAlpha = 1; }
  for (const t of f.m){ drawMan(t[0], t[1], m1, m2, "", false);
    c.fillStyle = "rgba(255,255,255,.85)"; c.font = font(700, 12); c.textAlign = "center"; c.textBaseline = "bottom"; c.fillText(t[2], sx(t[0]), sy(t[1]) - .9*scale); }
  drawMan(f.g[0], f.g[1], "#e3f030", "#1b1b1b", "1", false);
  if (f.c) drawMan(f.c[0], f.c[1], m1, m2, "", false);
  drawMan(f.p[0], f.p[1], m1, m2, String(S.player.number), true);
  drawBall({x:f.b[0], y:f.b[1], z:f.b[2]});
}
function drawReplayHud(){
  const c = cx, f = Math.min(1, REP.i/Math.max(1, REP.frames.length - 1));
  c.fillStyle = "rgba(0,0,0,.35)"; c.fillRect(cv.width*.25, cv.height - 26*DPR, cv.width*.5, 4*DPR);
  c.fillStyle = "#ffd75a"; c.fillRect(cv.width*.25, cv.height - 26*DPR, cv.width*.5*f, 4*DPR);
  c.textAlign = "center"; c.textBaseline = "top"; c.font = font(800, 20); c.fillStyle = "rgba(255,255,255,.92)";
  c.fillText("REPLAY", cv.width/2, TOPM + 34*DPR);
}
function draw(dt){
  if (!cx) return;
  camFollow(dt || 1/60);
  drawPitch();
  if (REP){
    const i = Math.min(REP.frames.length - 1, Math.floor(REP.i));       // smooth playback between snapshots
    drawReplayScene(lerpFrames(REP.frames[i], REP.frames[i + 1], REP.i - i));
    drawReplayHud(); return;
  }
  if (M && MT) (DEFEND_PHASES[M.phase] && M.att !== undefined || DEFEND_PHASES[M.phase]) ? drawDefendScene() : draw2DScene();
  if (MT) drawChant();
  if (M && MT) drawOverlay();
}
