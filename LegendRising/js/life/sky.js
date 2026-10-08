/* ============ LIFE: the sky, the sun and the lights ============
   Owner: WP-A from Stage 1 (DESIGN 1.4.4, 3.3.4, 3.9.1, 3.9.3, 2.3 WP-A).
   One procedural sky dome drawn every frame from a handful of colours that move with the clock:
   night, first light, sunrise, morning, midday, afternoon, golden hour, sunset, dusk, evening. Nothing
   ever switches: every colour, the sun's height and warmth, the clouds, the stars and the street
   lamps are blended between those keyframes, so a sunset is a sunset and morning creeps up.
   The dome is drawn last of everything solid, at the far plane: wherever a wall or the ground is in front of it the
   depth test throws its pixels away before they are shaded, so indoors it costs next to nothing.

   The graphics preset (GFX.P) decides the rest, and applyPreset() puts a new one into effect (quality.js calls it
   behind a fade, since most of it recompiles shaders):
     real lights   a pool of P.nReal point lights (2 on Low, 4 on Medium, 8 on High in the life zones; 0, 0 and 2 in a
                   stadium), handed to the sources that matter most where you are and faded in and out so none pops.
                   Which sources may have one: by day out of doors only rooms' lights within 10 m; at night the street's
                   within 14 m (Low), 24 m (Medium) or any (High), and indoors on Low only the room's own
     shadows       one light casts them (the sun by day, the moon at night, or a stadium's flood key light): a box of
                   P.shadow.life.half metres round you, moved on a grid of P.shadow.life.grid metres; none on Low (people
                   have blob shadows instead). Every redraw goes through SHADOW, the one shadow scheduler: at most one a
                   frame, at most P.shadow.life.hz a second (half a second apart at night), none while the screen is
                   covered and none within 0.1 s of a place being warmed up. The light turns only when its shadows are
                   redrawn, so a shadow never creeps away from what casts it
     reflections   an environment map baked from the sky (P.env: PMREM of 32 or 64, every everyH game hours), none on
                   Low
     the sky       P.dome segments, P.skyOct cloud octaves (0: one cheap band of cloud), fog per P.fog, the camera's far
                   plane at the fog's end plus a margin
   Lamp pools on the ground and the halos round lamp heads are one instanced mesh each per place, hidden by day and
   faded in at dusk; halos fade out beyond P.haloMax. */
import {THREE, W, poolMat, haloMat, glowMeshes} from "./build.js";
import {RT, FADE} from "./core/state.js";

// [hour, sky top, horizon, hemisphere sky, hemisphere ground, sun colour, sun strength, hemi strength,
//  cloud colour, stars, lamps, exposure, env strength]
const KEYS = [
  [0,    0x02050e, 0x0b1426, 0x2c3e62, 0x0a0b0e, 0x9fb6ff, .34, .6,  0x111a2c, 1,   1,  1.25, .22],
  [4.6,  0x040a1a, 0x16203a, 0x30436a, 0x0b0c10, 0x9fb6ff, .3,  .62, 0x161e33, .85, 1,  1.25, .24],
  [5.7,  0x182a55, 0xb46a74, 0x7a86a8, 0x24201e, 0xff9a6a, .4,  1.0, 0xb9808c, .25, .7, 1.18, .32],
  [6.7,  0x4874b8, 0xf2b48a, 0xc8c4cc, 0x5c5040, 0xffc28a, 1.3, 1.6, 0xf7c4a4, 0,   0,  1.08, .5],
  [8.5,  0x3c7ed6, 0xcfe1f1, 0xdde4ec, 0x8a7e68, 0xfff0d8, 2.5, 1.95, 0xffffff, 0,  0,  1.0,  .6],
  [12,   0x2d72d8, 0xbad7f2, 0xe2e8ef, 0x8e826c, 0xfffaf0, 3.0, 2.1, 0xffffff, 0,   0,  .98,  .62],
  [15.5, 0x3877d0, 0xd3dfe8, 0xe0e4ea, 0x8c8068, 0xffefd2, 2.7, 2.0, 0xfffaf2, 0,   0,  1.0,  .6],
  [17.6, 0x4c70b6, 0xf3c692, 0xe0d4cc, 0x846c52, 0xffd29a, 2.0, 1.7, 0xffe1bf, 0,   .15, 1.03, .52],
  [18.8, 0x394e8e, 0xff8d55, 0xb8a4ac, 0x5c4638, 0xff7a3c, 1.1, 1.25, 0xff9c6e, 0,  .5, 1.08, .42],
  [19.6, 0x1c245e, 0xa65468, 0x706a90, 0x26202a, 0xff6a50, .25, .85, 0x6b4b70, .2,  .9, 1.15, .32],
  [20.6, 0x0a1233, 0x2b2e57, 0x3a4a72, 0x0e0e14, 0xa4b8ff, .26, .68, 0x232845, .7,  1,  1.22, .26],
  [22,   0x03060f, 0x0d1628, 0x2c3e62, 0x0a0b0e, 0x9fb6ff, .34, .6,  0x121a2d, 1,   1,  1.25, .22],
  [24,   0x02050e, 0x0b1426, 0x2c3e62, 0x0a0b0e, 0x9fb6ff, .34, .6,  0x111a2c, 1,   1,  1.25, .22]
];
const smooth = t => t*t*(3 - 2*t);
const INDOOR_BOUNCE = 0xe2dfd8;          // daylight bounced round a room: neutral, a touch warm
const _a = new THREE.Color(), _b = new THREE.Color();
function lerpHex(out, h1, h2, t){ _a.setHex(h1); _b.setHex(h2); return out.copy(_a).lerp(_b, t); }

const VERT = `varying vec3 vDir;
void main(){ vec4 wp = modelMatrix*vec4(position, 1.); vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix*viewMatrix*wp; gl_Position.z = gl_Position.w; }`;
// uOct: cloud octaves (Medium and High). Low (P.skyOct 0) compiles with SKY_LOW: its single band of cloud is the same
// value noise read from a small baked texture (cloudNoise), one fetch a pixel instead of four sine hashes, which halved
// the sky's cost on SwiftShader (the sky is a third of the screen out of doors)
const FRAG = `uniform vec3 uTop, uHor, uGround, uSun, uSunCol, uMoon, uCloud;
uniform float uStars, uTime, uCover, uSunUp, uOct;
uniform sampler2D uNoise;
varying vec3 vDir;
float hash(vec3 p){ p = fract(p*.3183099 + .1); p *= 17.; return fract(p.x*p.y*p.z*(p.x + p.y + p.z)); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 5; i++){ if (float(i) >= uOct) break; v += a*vnoise(p); p = p*2.03 + 17.1; a *= .5; } return v; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHor, uTop, sqrt(clamp(h, 0., 1.)));
  col = mix(col, uGround, smoothstep(.0, -.22, h));
  // the sun: a hard disc, a soft halo and a wide warm glow that is strongest low in the sky (the powers by squaring:
  // a pow() is an exp and a log on every pixel of the sky)
  float sd = max(dot(d, uSun), 0.), s2 = sd*sd, s4 = s2*s2, s8 = s4*s4, s32 = s8*s8*s8*s8;
  col += uSunCol*(smoothstep(.9993, .9997, sd)*6.*uSunUp + s32*.55 + s4*sd*.18*(1. - .5*uSunUp));
  // stars, only above the horizon and only once the light has gone
  if (uStars > .01 && h > 0.){
    vec3 sp = floor(d*420.);
    float s = step(.9965, hash(sp))*hash(sp + 3.7);
    float tw = .6 + .4*sin(uTime*3. + hash(sp)*40.);
    col += vec3(.85, .9, 1.)*s*tw*uStars*smoothstep(0., .25, h);
  }
  // the moon, once the light has gone
  if (uStars > .001){
    float md = dot(d, uMoon);
    col += vec3(.92, .95, 1.)*smoothstep(.99935, .9996, md)*uStars*1.4 + vec3(.25, .3, .42)*pow(max(md, 0.), 80.)*.5*uStars;
  }
  // clouds on a plane above you, lit from the sun's side
  if (h > 0.){
    vec2 uv = d.xz/(h + .16)*1.3 + vec2(uTime*.006, uTime*.0025);
    #ifdef SKY_LOW
    float c = texture2D(uNoise, uv*(.9/64.)).r*.62 + .14;
    #else
    float c = uOct < .5 ? vnoise(uv*.9)*.62 + .14 : fbm(uv*1.4);
    #endif
    c = smoothstep(.62 - uCover*.28, .95, c)*smoothstep(0., .28, h);
    vec3 cc = mix(uCloud*.82, uCloud*1.12 + uSunCol*.18, s2*sd);
    col = mix(col, cc, c*.78);
  }
  gl_FragColor = vec4(col, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const gp = () => (typeof GFX === "object" && GFX && GFX.P) || null;
const tierOf = P => (P && P.tier) || "high";
/* Low's clouds: value noise over a 64 x 64 lattice that repeats, baked once at 4 texels a cell with the shader's own
   smooth interpolation (so the texture's bilinear filter only blends between smooth samples). The lattice values come
   from a fixed integer hash: the same sky every time. */
let NOISE = null;
function cloudNoise(){
  if (NOISE) return NOISE;
  const N = 64, R = 4, S = N*R, lat = new Float32Array(N*N), data = new Uint8Array(S*S*4);
  for (let i = 0; i < N*N; i++){ let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; lat[i] = (h >>> 0)/4294967296; }
  const at = (x, y) => lat[((y + N) % N)*N + ((x + N) % N)], sm = f => f*f*(3 - 2*f);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++){
    const gx = x/R, gy = y/R, ix = Math.floor(gx), iy = Math.floor(gy), fx = sm(gx - ix), fy = sm(gy - iy);
    const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy))*fx, b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1))*fx;
    const v = Math.round((a + (b - a)*fy)*255), k = (y*S + x)*4;
    data[k] = data[k + 1] = data[k + 2] = v; data[k + 3] = 255;
  }
  NOISE = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  NOISE.wrapS = NOISE.wrapT = THREE.RepeatWrapping;
  // (no mipmaps: toward the horizon a mip level would average the noise to grey and the clouds would melt away; read
  // like this it is the same value noise the shader worked out, sample for sample)
  NOISE.magFilter = NOISE.minFilter = THREE.LinearFilter; NOISE.generateMipmaps = false;
  NOISE.needsUpdate = true;
  return NOISE;
}

export function createSky(renderer){
  let P0 = gp();
  const uni = {uTop:{value:new THREE.Color()}, uHor:{value:new THREE.Color()}, uGround:{value:new THREE.Color(0x101418)},
    uSun:{value:new THREE.Vector3(0, 1, 0)}, uSunCol:{value:new THREE.Color()}, uMoon:{value:new THREE.Vector3(0, -1, 0)},
    uCloud:{value:new THREE.Color()}, uStars:{value:0}, uTime:{value:0}, uCover:{value:.45}, uSunUp:{value:1}, uOct:{value:5},
    uNoise:{value:null}};
  const skyMat = new THREE.ShaderMaterial({uniforms:uni, vertexShader:VERT, fragmentShader:FRAG, side:THREE.BackSide, depthWrite:false, fog:false});
  skyMat.userData.keep = true;
  // Low's sky is its own program (SKY_LOW): switched only where a preset is put into effect, behind the fade (its noise
  // baked the first time Low asks for it: Medium and High never need it)
  const setLowSky = P => {
    const low = !!P && !(P.skyOct > 0);
    if (low && !uni.uNoise.value) uni.uNoise.value = cloudNoise();
    if (!!skyMat.defines.SKY_LOW === low) return;
    if (low) skyMat.defines.SKY_LOW = ""; else delete skyMat.defines.SKY_LOW;
    skyMat.needsUpdate = true;
  };
  setLowSky(P0);
  const domeSeg = P => (P && P.dome) || [32, 18];
  let segs = domeSeg(P0);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(360, segs[0], segs[1]), skyMat);
  // last of everything opaque: it sits on the far plane, so anything in front of it rejects its pixels unshaded
  dome.frustumCulled = false; dome.renderOrder = 1e6; dome.userData.keep = true;
  // a second copy of the sky lives in its own little scene, for baking reflections
  const envScene = new THREE.Scene(), envDome = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), skyMat);
  envScene.add(envDome);
  let pmrem = new THREE.PMREMGenerator(renderer), envSize = (P0 && P0.env && P0.env.size) || 64;
  let cubeRT = new THREE.WebGLCubeRenderTarget(envSize, {type:THREE.HalfFloatType, generateMipmaps:false});
  let cubeCam = new THREE.CubeCamera(.1, 100, cubeRT);
  let envRT = null, envAt = -999;

  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.shadow.bias = -.0004; sun.shadow.normalBias = .03; sun.shadow.radius = 2.5;   // vogel-disk PCF: soft edge instead of stair-steps
  const hemi = new THREE.HemisphereLight(0xc4dcff, 0x9a9184, 1);
  // where the sky is: 'life' (home, the ground, town) or 'stadium' (its own light and shadow rules)
  let where = "life", scene0 = null;
  const nRealOf = P => { const n = P && P.nReal; return Math.max(0, Math.min(8, n ? (where === "stadium" ? n.stadium : n.life) : 8)); };
  const mkLight = () => { const l = new THREE.PointLight(0xffe0b0, 0, 12, 1.6); l.userData.src = null; l.userData.cur = 0; return l; };
  let pool = Array.from({length:nRealOf(P0)}, mkLight);
  const fog = new THREE.Fog(0xc8d8e8, 60, 260);
  const K = {night:0, lamps:0, exposure:1, env:.5, sunUp:1, cover:0, fogFar:260};
  const dir = new THREE.Vector3(), moonDir = new THREE.Vector3(), tmp = new THREE.Color();
  const shadowAt = {key:"", d:new THREE.Vector3(0, -2, 0)}, shadowDir = new THREE.Vector3(0, 1, 0), mid = {x:0, z:0, half:30};
  let assignT = 0, shadowSize = 0, cut = Infinity, band = 8, shadeForce = true;
  const _eye = new THREE.Vector3(), _zero = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _look = new THREE.Matrix4();
  const _rt = new THREE.Vector3(), _upv = new THREE.Vector3(), _c0 = new THREE.Vector3();
  // the flood key light of a pitch at night (setNightKey): it takes the sun's place and lifts the hemisphere
  const KEY = {on:false, dir:new THREE.Vector3(.25, 1, .35).normalize(), intensity:1.6, color:0xf4f6ff, hemi:.35};

  /* ---------- the shadow scheduler ----------
     request(why): someone wants the shadows redrawn ('direct': a door, the world; 'sun': the light moved; 'warm';
     'half': a stadium's statics at kick-off and half time);
     granted(): the renderer's needsUpdate, true for the one frame a redraw is allowed; done(): three.js finished one */
  const SH = {on:false, half:30, grid:4, hz:5, size:2048, follow:true, statics:false};
  const SHADOW = {pending:false, grant:false, last:-1e9, t:0, frame:0, grantFrame:-1, fresh:true, warmAt:-1e9, count:0, why:"",
    on(){ return SH.on && !!(RT.renderer && RT.renderer.shadowMap.enabled); },
    rate(){ return K.night > .5 && where === "life" ? .5 : SH.hz; },
    // may a redraw happen this frame?
    may(){
      if (SHADOW.grant || SHADOW.grantFrame === SHADOW.frame) return false;
      if (FADE.v >= .98) return false;
      if (SHADOW.t - SHADOW.warmAt < .1) return false;
      return SHADOW.t - SHADOW.last >= 1/Math.max(.01, SHADOW.rate()) - 1e-6;
    },
    request(why = "direct"){
      if (!SHADOW.on()) return;
      // the first redraw of a new place is its warm-up frame, and a stadium's statics are drawn once per half
      // ('half'): at once, covered or not
      if ((SHADOW.fresh && why !== "sun") || why === "half"){ SHADOW.grant = true; SHADOW.grantFrame = SHADOW.frame; SHADOW.why = "warm"; return; }
      SHADOW.pending = true; SHADOW.why = why;
      if (why !== "sun" && SHADOW.may()) SHADOW.give();
    },
    give(){ SHADOW.grant = true; SHADOW.pending = false; SHADOW.grantFrame = SHADOW.frame; },
    granted(){ return SHADOW.grant; },
    done(){ if (!SHADOW.grant) return; SHADOW.grant = false; SHADOW.last = SHADOW.t; SHADOW.count++; if (SHADOW.fresh || SHADOW.why === "warm"){ SHADOW.fresh = false; SHADOW.warmAt = SHADOW.t; } },
    // a frame drawn out of sight to compile and upload everything (quality.js warmAsync): its shadow pass too
    force(){ if (SHADOW.on()){ SHADOW.grant = true; SHADOW.why = "warm"; } },
    // a new place: its first redraw is the warm-up
    zone(){ SHADOW.fresh = true; SHADOW.pending = false; SHADOW.grant = false; shadowAt.key = ""; },
    tick(dt){ SHADOW.t += dt; SHADOW.frame++; if (SHADOW.pending && SHADOW.why !== "sun" && SHADOW.may()) SHADOW.give(); }
  };

  const SAMPLE = {sunI:0, hemiI:0, stars:0, lamps:0, exposure:1, env:.5};
  function sample(h){
    let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
    const A = KEYS[i], B = KEYS[i + 1], t = smooth(Math.max(0, Math.min(1, (h - A[0])/(B[0] - A[0]))));
    const n = (a, b) => a + (b - a)*t, o = SAMPLE;
    lerpHex(uni.uTop.value, A[1], B[1], t); lerpHex(uni.uHor.value, A[2], B[2], t);
    lerpHex(hemi.color, A[3], B[3], t); lerpHex(hemi.groundColor, A[4], B[4], t);
    lerpHex(tmp, A[5], B[5], t); uni.uSunCol.value.copy(tmp);
    lerpHex(uni.uCloud.value, A[8], B[8], t);
    o.sunI = n(A[6], B[6]); o.hemiI = n(A[7], B[7]); o.stars = n(A[9], B[9]); o.lamps = n(A[10], B[10]); o.exposure = n(A[11], B[11]); o.env = n(A[12], B[12]);
    return o;
  }
  // the sun rises in the east (+x) a little after six and sets in the west before half past seven
  function sunVec(h, out){
    const t = (h - 6.25)/(19.45 - 6.25), a = Math.PI*t;
    return out.set(Math.cos(a), Math.sin(a)*.82, .26).normalize();
  }
  function moonVec(h, out){
    const t = (((h - 19.3) % 24) + 24) % 24/11.4, a = Math.PI*t;
    return out.set(Math.cos(a)*.9, Math.sin(a)*.7, -.35).normalize();
  }
  // the shadow settings of the preset for where the sky is
  function shadowFrom(P){
    const s = P ? (where === "stadium" ? P.shadow && P.shadow.stadium : P.shadow && P.shadow.life) : {size:2048, half:30, grid:4, hz:5};
    SH.on = !!s;
    if (!s){ sun.castShadow = false; return; }
    SH.size = s.size || 2048;
    if (where === "stadium" && s.mode === "statics"){ SH.follow = false; SH.statics = true; SH.half = 80; SH.grid = 1e9; SH.hz = .02; }
    else { SH.follow = true; SH.statics = false; SH.half = s.half || (s.box ? s.box/2 : 30); SH.grid = s.grid || 4; SH.hz = s.hz || 5; }
    sun.castShadow = true;
    shadowAt.key = "";
  }
  shadowFrom(P0);
  // the pool of real lights made again at another size (under the fade: the lit shaders recompile)
  function setRealLights(n){
    n = Math.max(0, Math.min(8, n | 0));
    if (n === pool.length) return;
    const parent = pool.length ? pool[0].parent : scene0;
    for (const l of pool){ if (l.parent) l.parent.remove(l); l.dispose(); }
    pool = Array.from({length:n}, mkLight);
    if (parent) for (const l of pool) parent.add(l);
    assignT = 0;
  }
  function setEnv(P, renderer){
    const e = P && P.env;
    if (!e){ envRT = envRT || null; envAt = -999; return; }
    if (e.size !== envSize){
      envSize = e.size; cubeRT.dispose();
      cubeRT = new THREE.WebGLCubeRenderTarget(envSize, {type:THREE.HalfFloatType, generateMipmaps:false});
      cubeCam = new THREE.CubeCamera(.1, 100, cubeRT);
      envAt = -999;
    }
  }
  function setDome(P){
    const s = domeSeg(P);
    if (s[0] === segs[0] && s[1] === segs[1]) return;
    segs = s; const old = dome.geometry; dome.geometry = new THREE.SphereGeometry(360, s[0], s[1]); old.dispose();
  }

  const api = {
    attach(scene){
      scene0 = scene;
      scene.add(dome, sun, sun.target, hemi, ...pool);
      scene.fog = fog; scene.background = null;
      shadowAt.key = ""; envAt = -999;
    },
    // h: hour of the day (fractional). real: seconds since the last frame, for the clouds and stars. cover: how much
    // of the sky over you is roofed over (0 out in the open, 1 indoors)
    update(h, focus, real, cover = 0){
      const P = gp(), k = sample(h);
      /* Indoors the light from below is not the warm ground of the street but daylight bounced off pale floors and
         walls: a ceiling lit by the street's brown would come out muddy taupe, far darker than the walls under it. So
         under a roof, by day, the hemisphere's ground colour goes over to a neutral bright bounce (none of it at
         night, when the rooms are lit by their own lamps) */
      const day = Math.max(0, Math.min(1, (k.sunI - .4)/2.1)), ind = Math.max(0, Math.min(1, cover))*day;
      if (ind > 0){ _b.setHex(INDOOR_BOUNCE); hemi.groundColor.lerp(_b, ind); }
      uni.uTime.value += real || 0;
      sunVec(h, dir); moonVec(h, moonDir);
      uni.uSun.value.copy(dir); uni.uMoon.value.copy(moonDir);
      const up = dir.y;
      uni.uSunUp.value = Math.max(0, Math.min(1, up*6 + .4));
      uni.uStars.value = k.stars;
      uni.uOct.value = P ? Math.max(0, Math.min(5, P.skyOct)) : 5;
      // one shadow-casting light: the sun by day, the moon by night, faded through zero as they swap (or a pitch's
      // flood key light at night); where it shines from is set in shade(), in step with its shadow map
      const useSun = up > -.02, L = useSun ? dir : moonDir;
      const swap = Math.max(0, Math.min(1, (useSun ? up : moonDir.y)*7));
      const key = KEY.on ? Math.max(0, Math.min(1, (k.lamps - .3)/.4)) : 0;
      if (key > .5) shadowDir.copy(KEY.dir); else shadowDir.copy(L);
      sun.intensity = key > .5 ? KEY.intensity*key : k.sunI*swap*(1 - key);
      if (key > .5) sun.color.setHex(KEY.color); else sun.color.copy(uni.uSunCol.value);
      sun.shadow.intensity = key > .5 ? 1 : swap;
      hemi.intensity = k.hemiI + KEY.hemi*key;
      fog.color.copy(uni.uHor.value).multiplyScalar(.92);
      const f = P && P.fog ? (where === "stadium" ? P.fog.stadium : P.fog.life) : null;
      if (f){ fog.near = f.near + (f.envNear || 0)*k.env; fog.far = f.far + (f.envFar || 0)*k.env; }
      else { fog.near = 50 + k.env*50; fog.far = 180 + k.env*130; }
      K.night = k.stars; K.lamps = k.lamps; K.exposure = k.exposure; K.env = k.env; K.sunUp = uni.uSunUp.value; K.cover = cover; K.fogFar = fog.far;
      // the camera sees as far as the fog lets anything show, and a little more
      const cam = RT.cam;
      if (cam && P){
        const far = P.camFar || fog.far + (P.camFarPad || 0);
        if (Math.abs(cam.far - far) > .5){ cam.far = far; cam.updateProjectionMatrix(); }
      }
      // the things that glow: every lamp in the zone glows and throws its pool of light on the ground, however far away
      // it is, so a street at night reads as lit end to end; the real lights (lights()) only add the light close to you.
      // By day the pools and halos are not drawn at all
      if (W.lit) W.lit.emissiveIntensity = k.lamps*1.25;
      if (W.mats.street) W.mats.street.emissiveIntensity = .15 + k.lamps*2.6;
      if (W.mats.neon) W.mats.neon.emissiveIntensity = .55 + k.lamps*1.6;
      const lit = k.lamps > .02, gm = glowMeshes();
      const pm = poolMat(); if (pm) pm.opacity = k.lamps*.72*(P && P.tier === "low" ? 1.15 : 1);
      const hm = haloMat(); if (hm){ hm.uniforms.opacity.value = k.lamps*.9; hm.uniforms.uMax.value = P && isFinite(P.haloMax) ? P.haloMax : 1e6; }
      if (gm.pools) gm.pools.visible = lit;
      if (gm.halos) gm.halos.visible = lit;
      for (const f of (W.glows || [])) f(k);
      return k;
    },
    // called a few times a second at most: the shadow box, reflections
    refresh(renderer, scene, h, focus, force){
      const P = gp();
      if (SH.on){
        if (SH.size !== shadowSize){
          shadowSize = SH.size; sun.shadow.mapSize.set(shadowSize, shadowSize);
          if (sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map = null; }
          force = true;
        }
        /* the shadow area follows you (SH.half each way, on a grid of SH.grid metres, so it is redrawn only when you
           have walked a fair way, and shade() snaps its centre to whole texels so the edges stay put between redraws);
           in a stadium on Medium it covers the whole bowl, drawn once. Casters further off still throw their shadows
           in: the light's depth range reaches 240 m back towards the sun */
        const fx = focus && SH.follow ? focus.x : 0, fz = focus && SH.follow ? focus.z : 0, g = SH.grid, gx = SH.follow ? Math.round(fx/g)*g : 0, gz = SH.follow ? Math.round(fz/g)*g : 0;
        const key = `${gx},${gz},${SH.half}`;
        if (key !== shadowAt.key){
          shadowAt.key = key; mid.x = gx; mid.z = gz; mid.half = SH.half;
          const c = sun.shadow.camera; c.left = -mid.half; c.right = mid.half; c.top = mid.half; c.bottom = -mid.half; c.near = 1; c.far = 240; c.updateProjectionMatrix();
          shadeForce = true;
        }
        if (force) shadeForce = true;
      }
      // reflections follow the sky every P.env.everyH game hours; none on Low
      const e = P ? P.env : {size:64, everyH:.15};
      if (e && (force || !(FADE.v >= .98 && envRT))){
        if (force || !envRT || Math.abs(h - envAt) > e.everyH){
          envAt = h;
          cubeCam.update(renderer, envScene);
          envRT = pmrem.fromCubemap(cubeRT.texture, envRT);
        }
        scene.environment = envRT ? envRT.texture : null;
      } else if (!e) scene.environment = null;
      scene.environmentIntensity = K.env;
      renderer.toneMappingExposure = K.exposure;
    },
    /* every frame: the shadow scheduler's clock, and a redraw of the sun's (or the moon's) shadows once it has moved
       far enough for them to step visibly; the light turns with them, never ahead of them. How far that is depends on
       how high it is: a shadow's tip moves by about height·dθ/sin²(elevation), so at noon a third of a degree moves a
       façade's shadow a few centimetres, while at sunset the same step would throw it a metre or two. The step keeps
       the tip of a ten-metre wall's shadow within ~20 cm (a third of a degree at most); the scheduler keeps the rate */
    shade(renderer, real){
      SHADOW.tick(real || 0);
      // no shadows (Low): the light simply follows the sun, the moon or the key light, with nothing to keep in step
      if (!SHADOW.on()){
        sun.target.position.set(mid.x, 0, mid.z);
        sun.position.set(mid.x + shadowDir.x*100, shadowDir.y*100, mid.z + shadowDir.z*100);
        return false;
      }
      const e = Math.max(.05, shadowDir.y), low = tierOf(gp()) === "low";
      const step = Math.max(low ? .0015 : .0004, Math.min(.006, .02*e*e));
      if (!shadeForce && shadowAt.d.angleTo(shadowDir) <= step) return false;
      // a redraw the scheduler allows this frame (the first of a new place at once), else try again next frame
      if (!(SHADOW.fresh || SHADOW.may())){ return false; }
      shadeForce = false;
      shadowAt.d.copy(shadowDir);
      // the centre, snapped to whole texels across the light's view, so a redraw never shifts an edge by part of one
      const texel = 2*mid.half/(shadowSize || 2048);
      _eye.set(shadowDir.x, shadowDir.y, shadowDir.z); _look.lookAt(_eye, _zero, _up);
      _rt.setFromMatrixColumn(_look, 0); _upv.setFromMatrixColumn(_look, 1);
      _c0.set(mid.x, 0, mid.z);
      const du = _c0.dot(_rt), dv = _c0.dot(_upv);
      _c0.addScaledVector(_rt, Math.round(du/texel)*texel - du).addScaledVector(_upv, Math.round(dv/texel)*texel - dv);
      sun.target.position.copy(_c0);
      sun.position.set(_c0.x + shadowDir.x*100, _c0.y + shadowDir.y*100, _c0.z + shadowDir.z*100);
      if (SHADOW.fresh){ SHADOW.grant = true; SHADOW.grantFrame = SHADOW.frame; SHADOW.why = "warm"; } else SHADOW.give();
      return true;
    },
    /* Hand the real lights to the sources that matter most where you are, and fade them so none of them ever pops.
       Which sources may have one depends on the preset and the hour (see the top of the file); those are ranked by
       their distance from you (a room's own lights count for more while you are indoors, the street's while you are
       out); the first N get a real light. Each one's brightness falls off smoothly towards the distance of the first
       source that did NOT get one (cut), and is nothing at it: so when two sources swap places across that line, the
       one handing its light over is already dark and the one taking it starts dark. Lamps come up and go down
       gradually as you walk, never one by one */
    lights(dt, focus){
      assignT -= dt;
      const fx = focus ? focus.x : 0, fy = focus ? focus.y : 1.6, fz = focus ? focus.z : 0;
      const dist = l => Math.hypot(l.x - fx, (l.y - fy)*.5, l.z - fz) + (l.indoor ? (K.cover > .5 ? -3 : 5) : (K.cover > .5 ? 5 : 0));
      if (assignT <= 0 && pool.length){
        assignT = .2;
        const tier = tierOf(gp()), night = K.lamps > .02, inside = K.cover > .5;
        const streetR = tier === "low" ? 14 : tier === "medium" ? 24 : Infinity;
        const allowed = l => {
          if (!(l.on ? l.on() : true) || l.dead) return false;
          const d = Math.hypot(l.x - fx, l.z - fz);
          if (l.indoor) return night || inside || d < 10;
          if (!night) return false;
          if (inside && tier === "low") return false;
          return d < streetR;
        };
        const live = W.lights.filter(allowed);
        live.forEach(l => { l._d = dist(l); });
        live.sort((a, b) => a._d - b._d);
        cut = live.length > pool.length ? live[pool.length]._d : Infinity;
        band = Math.max(3, Math.min(9, (isFinite(cut) ? cut : 30)*.5));
        const want = live.slice(0, pool.length);
        // a source keeps its light while it is still wanted. One that is no longer wanted fades its light out first, and
        // only a light that has gone dark is handed to a new source, which then fades it in: nothing is ever cut
        for (const p of pool) p.userData.leaving = !!p.userData.src && !want.includes(p.userData.src);
        const free = pool.filter(p => !p.userData.src || (p.userData.leaving && p.userData.cur < .03)).sort((a, b) => a.userData.cur - b.userData.cur);
        for (const src of want){
          if (pool.some(p => p.userData.src === src)) continue;
          const p = free.shift(); if (!p) break;
          p.userData.src = src; p.userData.leaving = false; p.userData.cur = 0; p.intensity = 0;
          p.position.set(src.x, src.y, src.z); p.color.setHex(src.color); p.distance = src.distance; p.decay = src.decay;
        }
      }
      for (const p of pool){
        const src = p.userData.src;
        let target = 0;
        if (src && !p.userData.leaving && (src.on ? src.on() : true)){
          const d = dist(src), w = isFinite(cut) ? Math.max(0, Math.min(1, (cut - d)/band)) : 1;
          target = src.intensity*(src.indoor ? 1 : K.lamps)*w*w*(3 - 2*w);
        }
        p.userData.cur += (target - p.userData.cur)*Math.min(1, dt*3);
        if (p.userData.leaving && p.userData.cur < .005){ p.userData.src = null; p.userData.leaving = false; p.userData.cur = 0; }
        p.intensity = p.userData.cur;
      }
    },
    // what of a preset is free to change: the dome's segments (the cloud octaves, fog and far plane are read each frame)
    inFrame(P){ setDome(P); },
    // a preset put into effect behind the fade (quality.js): real lights, shadows, reflections and the dome
    applyPreset(P, renderer, scene){
      setLowSky(P);
      setRealLights(nRealOf(P));
      shadowFrom(P);
      setEnv(P, renderer);
      setDome(P);
      if (!(P && P.env) && scene) scene.environment = null;
      envAt = -999;
    },
    // a stadium has its own lights and shadows (DESIGN 1.4.4, 3.3.4): its zone calls this as it is built, behind the fade
    setContext(w){ where = w === "stadium" ? "stadium" : "life"; const P = gp(); setRealLights(nRealOf(P)); shadowFrom(P); },
    // a pitch's floodlights at night: one directional key light from dir (towards the light), in the sun's place
    setNightKey(on, o = {}){
      KEY.on = !!on;
      if (o.dir) KEY.dir.set(o.dir[0], o.dir[1], o.dir[2]).normalize();
      if (o.intensity != null) KEY.intensity = o.intensity;
      if (o.color != null) KEY.color = o.color;
      shadeForce = true;
    },
    // the renderer was made again (quality.js recreateRenderer): the reflection bake starts afresh with it
    rebind(renderer){
      try { pmrem.dispose(); } catch(e){}
      pmrem = new THREE.PMREMGenerator(renderer);
      cubeRT.dispose(); cubeRT = new THREE.WebGLCubeRenderTarget(envSize, {type:THREE.HalfFloatType, generateMipmaps:false});
      cubeCam = new THREE.CubeCamera(.1, 100, cubeRT);
      if (envRT){ envRT.dispose(); envRT = null; }
      envAt = -999; shadowSize = 0; shadowAt.key = "";
      if (sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map = null; }
    },
    get K(){ return K; }, get pool(){ return pool; }, get where(){ return where; }, sun, hemi, dome, shadow:SHADOW
  };
  return api;
}
