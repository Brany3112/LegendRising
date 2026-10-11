/* ============ Football: the sound of a match ============
   Owner: WP-D (pitch mesh, stadium, crowd, audio). Contract: DESIGN 1.4.17 (audio.js: AUD), spec 3.3.6; the volume
   and speech settings of 1.6 (localStorage "freyaFootball.ctrl": {volume, speech}).

   Every sound is made here with WebAudio, from oscillators and noise: there is no audio file anywhere.
     AUD.init()            asks for sound. The AudioContext is only made once the page has had a user gesture (the
                           click that locks the pointer, a key): before that init() quietly waits for one, so the
                           browser never has a context it refuses to start (and never warns about one)
     AUD.resume()          wakes the context after the page was hidden or the match was left
     AUD.cue(name, pos, gain)   one sound, at a point in the world (x, y, z) or, with pos null, in your head:
                           whistleShort, whistleLong, whistleTriple, kick, bounce, post, net, board, crowdOoh, crowdRoar,
                           crowdGroan
     AUD.crowd(level, excite)   the crowd's bed of noise: level 0..1 from the attendance, excite 0..1 swells it
     AUD.call(name, pos, voiceSeed)   a team-mate's "hey!" from his head (an HRTF panner), and his name said by the
                           browser's speech voice when the setting allows and there is one
     AUD.listener(pos, yaw) where your ears are (every frame, from the camera)
     AUD.dispose()         everything stops; the context sleeps until the next init()
   At most 12 sounds play at once: a new one stops the oldest. With no audio at all (no WebAudio, or no gesture yet)
   every call does nothing, and the match goes on with what you can see. */

const CTRL_KEY = "freyaFootball.ctrl", MAX_VOICES = 12;
export const CUES = ["whistleShort", "whistleLong", "whistleTriple", "kick", "bounce", "post", "net", "board", "crowdOoh", "crowdRoar", "crowdGroan"];
function settings(){
  try { return Object.assign({volume:.8, speech:true}, JSON.parse(localStorage.getItem(CTRL_KEY) || "{}") || {}); }
  catch(e){ return {volume:.8, speech:true}; }
}
// a small seeded value from an integer, for voices and the crowd's chorus
const hash = n => { let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0)/4294967296; };

/* ---------- the synthesis: each cue builds its own nodes into `out` from time t ----------
   (c is any BaseAudioContext, so the same code renders offline for the tests: AUD.render) */
function noiseBuffer(c, seconds = 2){
  const n = Math.floor(c.sampleRate*seconds), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  let s = 22222;
  for (let i = 0; i < n; i++){ s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = s/2147483648 - 1; }
  return b;
}
const NOISE = new WeakMap();
const noiseOf = c => NOISE.get(c) || (NOISE.set(c, noiseBuffer(c)), NOISE.get(c));
function env(c, t, peak, a, hold, rel){
  const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(.0005, t + a + hold + rel); return g;
}
function osc(c, type, f, t, end){ const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(end); return o; }
function noise(c, t, end, off = 0){ const s = c.createBufferSource(); s.buffer = noiseOf(c); s.loop = true; s.start(t, off % 1.9); s.stop(end); return s; }
function filt(c, type, f, q = 1){ const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }

// the referee's whistle: two partials (2.8 and 3.1 kHz) warbled by the pea at 30 Hz, a little breath through it
function whistle(c, out, t, g, blasts){
  let end = t;
  for (const [t0, d] of blasts){
    const s = t + t0, e = s + d;
    const amp = c.createGain(); amp.gain.setValueAtTime(0, s); amp.gain.linearRampToValueAtTime(g*.32, s + .012);
    amp.gain.setValueAtTime(g*.32, e - .05); amp.gain.linearRampToValueAtTime(0, e);
    const trill = c.createGain(); trill.gain.value = .55;
    const lfo = osc(c, "triangle", 30, s, e), depth = c.createGain(); depth.gain.value = .45; lfo.connect(depth); depth.connect(trill.gain);
    const fm = c.createGain(); fm.gain.value = 70; lfo.connect(fm);
    for (const [f, k] of [[2800, 1], [3100, .6]]){ const o = osc(c, "sine", f, s, e), gk = c.createGain(); gk.gain.value = k; fm.connect(o.frequency); o.connect(gk); gk.connect(trill); }
    const br = noise(c, s, e, s), bp = filt(c, "bandpass", 3000, 4), bg = c.createGain(); bg.gain.value = .12; br.connect(bp); bp.connect(bg); bg.connect(trill);
    trill.connect(amp); amp.connect(out);
    end = Math.max(end, e);
  }
  return end;
}
const SYN = {
  whistleShort:(c, out, t, g) => whistle(c, out, t, g, [[0, .25]]),
  whistleLong:(c, out, t, g) => whistle(c, out, t, g, [[0, .9]]),
  whistleTriple:(c, out, t, g) => whistle(c, out, t, g, [[0, .35], [.5, .35], [1.0, .35]]),
  // boot on ball: a 120 to 60 Hz thump and a 4 ms click, louder the harder it is struck
  kick(c, out, t, g){
    const o = osc(c, "sine", 120, t, t + .18); o.frequency.exponentialRampToValueAtTime(60, t + .09);
    const e = env(c, t, .9*g, .003, .01, .14); o.connect(e); e.connect(out);
    const n = noise(c, t, t + .03, t*7), hp = filt(c, "highpass", 1800, .7), ce = env(c, t, .55*g, .0008, .002, .006); n.connect(hp); hp.connect(ce); ce.connect(out);
    return t + .2;
  },
  // the ball on the grass: a low, soft thump
  bounce(c, out, t, g){
    const o = osc(c, "sine", 85, t, t + .16); o.frequency.exponentialRampToValueAtTime(48, t + .08);
    const e = env(c, t, .6*g, .004, .005, .11); o.connect(e); e.connect(out);
    const n = noise(c, t, t + .08, t*3), lp = filt(c, "lowpass", 320, .7), ne = env(c, t, .25*g, .002, .004, .05); n.connect(lp); lp.connect(ne); ne.connect(out);
    return t + .18;
  },
  // into the advertising boards: the thump, a slap, and the panel's wooden ring at 180 Hz
  board(c, out, t, g){
    SYN.bounce(c, out, t, g*.9);
    const r = osc(c, "sine", 180, t, t + .3), re = env(c, t, .35*g, .003, .01, .22); r.connect(re); re.connect(out);
    const n = noise(c, t, t + .25, t*5), bp = filt(c, "bandpass", 180, 7), ne = env(c, t, .5*g, .002, .01, .18); n.connect(bp); bp.connect(ne); ne.connect(out);
    const s = noise(c, t, t + .04, t*11), hp = filt(c, "highpass", 900, .7), se = env(c, t, .3*g, .001, .004, .02); s.connect(hp); hp.connect(se); se.connect(out);
    return t + .32;
  },
  // a post or the bar: three inharmonic partials ringing out over 0.6 s, the higher ones dying first
  post(c, out, t, g){
    [[520, .5, .6], [1310, .3, .45], [2250, .2, .3]].forEach(([f, k, d]) => { const o = osc(c, "sine", f, t, t + d + .05), e = env(c, t, k*g, .002, .0, d); o.connect(e); e.connect(out); });
    const n = noise(c, t, t + .02, t*13), hp = filt(c, "highpass", 2500, .7), ce = env(c, t, .35*g, .001, .002, .01); n.connect(hp); hp.connect(ce); ce.connect(out);
    return t + .66;
  },
  // into the net: a band-passed swish falling over 0.4 s
  net(c, out, t, g){
    const n = noise(c, t, t + .45, t*17), bp = filt(c, "bandpass", 1900, 1.3);
    bp.frequency.setValueAtTime(1900, t); bp.frequency.exponentialRampToValueAtTime(700, t + .4);
    const e = env(c, t, .45*g, .03, .06, .3); n.connect(bp); bp.connect(e); e.connect(out);
    return t + .45;
  },
  crowdOoh:(c, out, t, g) => chorus(c, out, t, g, {f1:360, f2:880, a:.35, hold:.35, rel:.7, glide:[1, 1.12, .95], noise:.25}),
  crowdRoar:(c, out, t, g) => chorus(c, out, t, g, {f1:780, f2:1250, a:.15, hold:1.2, rel:1.0, glide:[1, 1.18, 1.05], noise:.6}),
  crowdGroan:(c, out, t, g) => chorus(c, out, t, g, {f1:560, f2:980, a:.3, hold:.5, rel:.8, glide:[1.08, 1, .82], noise:.3})
};
/* many voices on one vowel: a dozen detuned sawtooths between 130 and 260 Hz and a wash of noise, through the vowel's
   two formants, swelling and dying away (an ooh, a roar, a groan) */
function chorus(c, out, t, g, o){
  const dur = o.a + o.hold + o.rel, end = t + dur + .05;
  const sum = c.createGain(); sum.gain.value = 1;
  for (let i = 0; i < 12; i++){
    const f = 130 + 130*hash(i*31 + 7), s = osc(c, "sawtooth", f*o.glide[0], t, end), k = c.createGain();
    s.frequency.linearRampToValueAtTime(f*o.glide[1], t + o.a + o.hold*.5); s.frequency.linearRampToValueAtTime(f*o.glide[2], t + dur);
    k.gain.value = .045; s.connect(k); k.connect(sum);
  }
  const n = noise(c, t, end, t*19), nk = c.createGain(); nk.gain.value = o.noise; n.connect(nk); nk.connect(sum);
  const e = env(c, t, g*.5, o.a, o.hold, o.rel);
  for (const [f, q, k] of [[o.f1, 3.5, 1], [o.f2, 5, .6]]){ const bp = filt(c, "bandpass", f, q), kg = c.createGain(); kg.gain.value = k; sum.connect(bp); bp.connect(kg); kg.connect(e); }
  e.connect(out);
  return end;
}
// a team-mate's "hey!": a sawtooth at his own pitch (140 to 220 Hz by his voice seed) through 700 Hz and 1200 Hz
// formants, a breath of "h" in front, a quarter of a second
function hey(c, out, t, g, seed){
  const f0 = 140 + 80*hash(seed | 0), end = t + .3;
  const s = osc(c, "sawtooth", f0*.92, t + .03, end); s.frequency.linearRampToValueAtTime(f0*1.12, t + .1); s.frequency.linearRampToValueAtTime(f0*.95, t + .28);
  const e = env(c, t + .03, g*.9, .02, .12, .1);
  for (const [f, q, k] of [[700, 4, 1], [1200, 6, .7]]){ const bp = filt(c, "bandpass", f, q), kg = c.createGain(); kg.gain.value = k; s.connect(bp); bp.connect(kg); kg.connect(e); }
  const h = noise(c, t, t + .06, seed*.37), hb = filt(c, "bandpass", 1600, 1.5), he = env(c, t, g*.35, .01, .02, .03); h.connect(hb); hb.connect(he); he.connect(out);
  e.connect(out);
  return end;
}

/* ---------- the live context ---------- */
const AU = {ctx:null, master:null, comp:null, wanted:false, armed:false, unavailable:false, voices:[], bed:null, feel:null, lp:null, vol:.8, muffle:0};
const gestured = () => { try { const u = navigator.userActivation; return !!(u && u.hasBeenActive); } catch(e){ return false; } };
function onGesture(){ disarm(); if (AU.wanted) create(); }
function arm(){
  if (AU.armed) return; AU.armed = true;
  for (const ev of ["pointerdown", "keydown", "touchend"]) addEventListener(ev, onGesture, {capture:true, passive:true});
}
function disarm(){
  if (!AU.armed) return; AU.armed = false;
  for (const ev of ["pointerdown", "keydown", "touchend"]) removeEventListener(ev, onGesture, {capture:true});
}
function create(){
  if (AU.ctx) return true;
  const C = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
  if (!C){ AU.unavailable = true; return false; }
  try {
    const c = AU.ctx = new C({latencyHint:"interactive"});
    AU.vol = Math.max(0, Math.min(1, +settings().volume));
    AU.master = c.createGain(); AU.master.gain.value = AU.vol;
    AU.comp = c.createDynamicsCompressor(); AU.comp.threshold.value = -10; AU.comp.ratio.value = 6;
    AU.master.connect(AU.comp); AU.comp.connect(c.destination);
    if (c.state === "suspended") c.resume().catch(() => {});
    return true;
  } catch(e){ AU.ctx = null; AU.unavailable = true; return false; }
}
function prune(){
  const now = AU.ctx.currentTime;
  AU.voices = AU.voices.filter(v => { if (v.end > now) return true; try { v.out.disconnect(); } catch(e){} return false; });
}
function stopVoice(v){
  const now = AU.ctx.currentTime;
  try { v.out.gain.cancelScheduledValues(now); v.out.gain.setTargetAtTime(0, now, .015); } catch(e){}
  setTimeout(() => { try { v.out.disconnect(); } catch(e){} }, 120);
}
// a voice: its own gain (to stop it), through a panner at pos when it has one
function voiceOut(pos, hrtf){
  const c = AU.ctx, out = c.createGain(); out.gain.value = 1;
  if (pos){
    const p = c.createPanner();
    p.panningModel = hrtf ? "HRTF" : "equalpower"; p.distanceModel = "inverse"; p.refDistance = 4; p.maxDistance = 140; p.rolloffFactor = 1.1;
    if (p.positionX){ p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
    out.connect(p); p.connect(AU.master);
  } else out.connect(AU.master);
  return out;
}
function play(build, pos, hrtf){
  if (!AU.ctx || AU.ctx.state === "closed") return false;
  prune();
  while (AU.voices.length >= MAX_VOICES) stopVoice(AU.voices.shift());
  const out = voiceOut(pos, hrtf), t = AU.ctx.currentTime + .005;
  const end = build(AU.ctx, out, t);
  AU.voices.push({out, end:end + .1, t});
  return true;
}
// the crowd's bed: two bands of looped noise, a low rumble and a higher chatter, each breathing slowly
function bedStart(){
  const c = AU.ctx, n = c.createBufferSource(); n.buffer = noiseOf(c); n.loop = true;
  const lo = filt(c, "bandpass", 320, .9), mid = filt(c, "bandpass", 950, 1.1), lp = filt(c, "lowpass", 9000, .5);
  const gLo = c.createGain(), gMid = c.createGain(), level = c.createGain(); gLo.gain.value = .6; gMid.gain.value = .45; level.gain.value = 0;
  for (const [f, g, d] of [[.13, gLo, .18], [.31, gMid, .22]]){ const l = c.createOscillator(), k = c.createGain(); l.frequency.value = f; k.gain.value = d; l.connect(k); k.connect(g.gain); l.start(); AU.bedLfo = (AU.bedLfo || []).concat(l); }
  n.connect(lo); n.connect(mid); lo.connect(gLo); mid.connect(gMid); gLo.connect(lp); gMid.connect(lp); lp.connect(level); level.connect(AU.master);
  n.start();
  AU.bed = {n, lo, mid, lp, level};
}
function bedStop(){
  if (!AU.bed) return;
  const b = AU.bed, now = AU.ctx.currentTime; AU.bed = null;
  b.level.gain.setTargetAtTime(0, now, .3);
  setTimeout(() => { try { b.n.stop(); b.level.disconnect(); for (const l of AU.bedLfo || []) l.stop(); AU.bedLfo = []; } catch(e){} }, 1500);
}

export const AUD = {
  init(){
    AU.wanted = true;
    if (AU.ctx){ if (AU.ctx.state === "suspended") AU.ctx.resume().catch(() => {}); return true; }
    if (AU.unavailable) return false;
    if (!gestured()){ arm(); return false; }
    return create();
  },
  resume(){ if (AU.ctx && AU.ctx.state === "suspended" && AU.wanted) AU.ctx.resume().catch(() => {}); },
  cue(name, pos = null, gain = 1){
    const f = SYN[name]; if (!f || !AU.ctx) return false;
    const g = Math.max(0, Math.min(2, +gain || 0)); if (!g) return false;
    return play((c, out, t) => f(c, out, t, g), pos, false);
  },
  crowd(level01, excite01 = 0){
    if (!AU.ctx) return false;
    const lv = Math.max(0, Math.min(1, +level01 || 0)), ex = Math.max(0, Math.min(1, +excite01 || 0));
    if (lv <= 0){ bedStop(); return true; }
    if (!AU.bed) bedStart();
    const now = AU.ctx.currentTime, b = AU.bed;
    b.level.gain.setTargetAtTime(.32*Math.sqrt(lv)*(1 + 1.3*ex), now, .45);
    b.mid.frequency.setTargetAtTime(950 + 650*ex, now, .6);
    b.lp.frequency.setTargetAtTime(9000 - 8400*AU.muffle, now, .25);
    return true;
  },
  // how muffled the crowd is where you are: 0 out in the bowl, 1 in the dressing room
  muffle(m){ AU.muffle = Math.max(0, Math.min(1, +m || 0)); if (AU.bed) AU.bed.lp.frequency.setTargetAtTime(9000 - 8400*AU.muffle, AU.ctx.currentTime, .25); },
  call(name, pos, voiceSeed = 0){
    const ok = play((c, out, t) => hey(c, out, t, 1, voiceSeed), pos || null, true);
    if (ok && name && settings().speech !== false){
      try {
        const sp = window.speechSynthesis;
        if (sp && sp.getVoices && sp.getVoices().length){
          const u = new SpeechSynthesisUtterance(String(name)); u.volume = .35*AU.vol; u.rate = 1.3; u.pitch = .8 + .5*hash(voiceSeed | 0);
          setTimeout(() => { try { sp.speak(u); } catch(e){} }, 180);
        }
      } catch(e){}
    }
    return ok;
  },
  listener(pos, yaw){
    if (!AU.ctx || !pos) return;
    const L = AU.ctx.listener, fx = -Math.sin(yaw || 0), fz = -Math.cos(yaw || 0);
    if (L.positionX){
      const t = AU.ctx.currentTime;
      L.positionX.setValueAtTime(pos.x, t); L.positionY.setValueAtTime(pos.y, t); L.positionZ.setValueAtTime(pos.z, t);
      L.forwardX.setValueAtTime(fx, t); L.forwardY.setValueAtTime(0, t); L.forwardZ.setValueAtTime(fz, t);
      L.upX.setValueAtTime(0, t); L.upY.setValueAtTime(1, t); L.upZ.setValueAtTime(0, t);
    } else { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fx, 0, fz, 0, 1, 0); }
  },
  /* what you hear of your own running and breathing (addendum A1.2, A1.3), every frame of a match: o = {wind 0..1, the
     rush of air with your share of top speed; breath 0..1, how hard you are breathing; pulse 0..1, the beat when you
     reach your top speed; motion 0..1, the "Camera motion and effects" setting, which scales all of it}. A looped
     noise through two filters: a high hiss for the wind, a breathy band whose level follows the breathing's rhythm. */
  feel(o){
    if (!AU.ctx || AU.ctx.state === "closed" || !o) return false;
    const k = Math.max(0, Math.min(1, o.motion == null ? 1 : +o.motion || 0));
    if (!AU.feel){
      const c = AU.ctx, n = c.createBufferSource(); n.buffer = noiseOf(c); n.loop = true;
      const hp = filt(c, "highpass", 600, .7), bp = filt(c, "bandpass", 420, 1.4), gw = c.createGain(), gb = c.createGain();
      gw.gain.value = 0; gb.gain.value = 0;
      n.connect(hp); hp.connect(gw); gw.connect(AU.master); n.connect(bp); bp.connect(gb); gb.connect(AU.master);
      n.start();
      AU.feel = {n, gw, gb, ph:0, t:c.currentTime, pl:0};
    }
    const F = AU.feel, now = AU.ctx.currentTime, dt = Math.max(0, Math.min(.1, now - F.t)); F.t = now;
    F.gw.gain.setTargetAtTime(.10*k*Math.max(0, Math.min(1, +o.wind || 0)), now, .15);
    const br = Math.max(0, Math.min(1, +o.breath || 0));
    F.ph = (F.ph + dt*(.35 + .9*br)) % 1;
    F.gb.gain.setTargetAtTime(.07*br*Math.pow(Math.sin(F.ph*Math.PI), 2), now, .05);
    // the beat at top speed, once as it arrives
    const pl = +o.pulse || 0;
    if (pl > .9 && F.pl <= .9 && k > 0) AUD.cue("bounce", null, .15*k);
    F.pl = pl;
    return true;
  },
  // the feel channel off (the end of a match, dispose)
  feelOff(){
    const F = AU.feel; if (!F) return;
    AU.feel = null;
    try { F.n.stop(); F.gw.disconnect(); F.gb.disconnect(); } catch(e){}
  },
  // the master volume (0..1), as the settings have it
  volume(v){ AU.vol = Math.max(0, Math.min(1, +v || 0)); if (AU.master) AU.master.gain.setTargetAtTime(AU.vol, AU.ctx.currentTime, .05); return AU.vol; },
  dispose(){
    AU.wanted = false; disarm();
    if (!AU.ctx) return;
    for (const v of AU.voices) stopVoice(v);
    AU.voices = []; bedStop(); AUD.feelOff();
    setTimeout(() => { if (AU.ctx && !AU.wanted && AU.ctx.state === "running") AU.ctx.suspend().catch(() => {}); }, 1600);
  },
  // what is going on, for tests and the settings: {ctx, state, voices, armed, bed}
  state(){ return {ctx:!!AU.ctx, state:AU.ctx ? AU.ctx.state : "none", voices:AU.ctx ? (prune(), AU.voices.length) : 0, armed:AU.armed, bed:!!AU.bed, unavailable:AU.unavailable}; },
  // a cue rendered offline (no context, no gesture needed): resolves its samples, for the tests
  render(name, seconds = 3, sampleRate = 22050){
    const C = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!C) return Promise.resolve(null);
    const c = new C(1, Math.ceil(seconds*sampleRate), sampleRate);
    const out = c.createGain(); out.connect(c.destination);
    if (name === "call") hey(c, out, 0, 1, 7);
    else if (SYN[name]) SYN[name](c, out, 0, 1);
    else return Promise.resolve(null);
    return c.startRendering().then(b => b.getChannelData(0));
  }
};
document.addEventListener("visibilitychange", () => { if (!document.hidden) AUD.resume(); });
