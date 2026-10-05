/* ============ LIFE: the sky, the sun and the lights ============
   One procedural sky dome drawn every frame from a handful of colours that move with the clock:
   night, first light, sunrise, morning, midday, afternoon, golden hour, sunset, dusk, evening. Nothing
   ever switches — every colour, the sun's height and warmth, the clouds, the stars and the street
   lamps are blended between those keyframes, so a sunset is a sunset and morning creeps up.

   The same sky is what the shiny things reflect: an environment map is baked from it every few
   in-game minutes. Real point lights are expensive, so there are only a few (eight), and they follow you
   between the lamps, bulbs and shop lights you are actually near, fading in and out so none of them pops.

   Frame pacing: nothing here may cost a frame. The sun's shadow map covers the whole zone from a fixed
   centre, so walking never forces it to be redrawn — only the sun moving does (see shade()), and the sun's light
   direction moves in the same steps as its shadows, so a shadow never creeps away from what casts it. Things that
   move and throw a shadow can ask for a redraw with W.shadowDirty = true (the world does it at most 5× a second). The
   reflection map is a tiny cube of the sky dome filtered into one render target that is reused for good,
   so the materials that read it never see a new texture (which would send every one of them back through
   the shader cache). */
import {THREE, W, poolMat, haloMat} from "./build.js";

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
const FRAG = `uniform vec3 uTop, uHor, uGround, uSun, uSunCol, uMoon, uCloud;
uniform float uStars, uTime, uCover, uSunUp, uOct;
varying vec3 vDir;
float hash(vec3 p){ p = fract(p*.3183099 + .1); p *= 17.; return fract(p.x*p.y*p.z*(p.x + p.y + p.z)); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 5; i++){ if (float(i) >= uOct) break; v += a*vnoise(p); p = p*2.03 + 17.1; a *= .5; } return v; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHor, uTop, pow(clamp(h, 0., 1.), .5));
  col = mix(col, uGround, smoothstep(.0, -.22, h));
  // the sun: a hard disc, a soft halo and a wide warm glow that is strongest low in the sky
  float sd = max(dot(d, uSun), 0.);
  col += uSunCol*(smoothstep(.9993, .9997, sd)*6.*uSunUp + pow(sd, 32.)*.55 + pow(sd, 5.)*.18*(1. - .5*uSunUp));
  // stars, only above the horizon and only once the light has gone
  if (uStars > .01 && h > 0.){
    vec3 sp = floor(d*420.);
    float s = step(.9965, hash(sp))*hash(sp + 3.7);
    float tw = .6 + .4*sin(uTime*3. + hash(sp)*40.);
    col += vec3(.85, .9, 1.)*s*tw*uStars*smoothstep(0., .25, h);
  }
  // the moon
  float md = dot(d, uMoon);
  col += vec3(.92, .95, 1.)*smoothstep(.99935, .9996, md)*uStars*1.4 + vec3(.25, .3, .42)*pow(max(md, 0.), 80.)*.5*uStars;
  // clouds on a plane above you, lit from the sun's side
  if (h > 0.){
    vec2 uv = d.xz/(h + .16)*1.3 + vec2(uTime*.006, uTime*.0025);
    float c = fbm(uv*1.4);
    c = smoothstep(.62 - uCover*.28, .95, c)*smoothstep(0., .28, h);
    vec3 cc = mix(uCloud*.82, uCloud*1.12 + uSunCol*.18, pow(sd, 3.));
    col = mix(col, cc, c*.78);
  }
  gl_FragColor = vec4(col, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createSky(renderer){
  const uni = {uTop:{value:new THREE.Color()}, uHor:{value:new THREE.Color()}, uGround:{value:new THREE.Color(0x101418)},
    uSun:{value:new THREE.Vector3(0, 1, 0)}, uSunCol:{value:new THREE.Color()}, uMoon:{value:new THREE.Vector3(0, -1, 0)},
    uCloud:{value:new THREE.Color()}, uStars:{value:0}, uTime:{value:0}, uCover:{value:.45}, uSunUp:{value:1}, uOct:{value:5}};
  const skyMat = new THREE.ShaderMaterial({uniforms:uni, vertexShader:VERT, fragmentShader:FRAG, side:THREE.BackSide, depthWrite:false, fog:false});
  skyMat.userData.keep = true;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(360, 32, 18), skyMat);
  dome.frustumCulled = false; dome.renderOrder = -10; dome.userData.keep = true;
  // a second copy of the sky lives in its own little scene, for baking reflections
  const envScene = new THREE.Scene(), envDome = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), skyMat);
  envScene.add(envDome);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const cubeRT = new THREE.WebGLCubeRenderTarget(64, {type:THREE.HalfFloatType, generateMipmaps:false});
  const cubeCam = new THREE.CubeCamera(.1, 100, cubeRT);
  let envRT = null, envAt = -999;

  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.bias = -.0004; sun.shadow.normalBias = .03; sun.shadow.radius = 2.5;   // vogel-disk PCF: soft edge instead of stair-steps
  const hemi = new THREE.HemisphereLight(0xc4dcff, 0x9a9184, 1);
  // the real lights: eight (five on Low) handed out to the sources that matter most where you are (see lights())
  const NREAL = typeof GFX !== "undefined" && GFX.low ? 5 : 8;
  const pool = Array.from({length:NREAL}, () => { const l = new THREE.PointLight(0xffe0b0, 0, 12, 1.6); l.userData.src = null; l.userData.cur = 0; return l; });
  const fog = new THREE.Fog(0xc8d8e8, 60, 260);
  const K = {night:0, lamps:0, exposure:1, env:.5, sunUp:1, cover:0};
  const dir = new THREE.Vector3(), moonDir = new THREE.Vector3(), tmp = new THREE.Color();
  const shadowAt = {key:"", d:new THREE.Vector3(0, -2, 0)}, shadowDir = new THREE.Vector3(0, 1, 0), mid = {x:0, z:0, half:46};
  let assignT = 0, shadowSize = 0, shadeT = 0, shadeForce = true, cut = Infinity, band = 8;
  const SHADOW_HALF = 30, _eye = new THREE.Vector3(), _zero = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _look = new THREE.Matrix4();
  const _rt = new THREE.Vector3(), _upv = new THREE.Vector3(), _c0 = new THREE.Vector3();

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

  return {
    attach(scene){
      scene.add(dome, sun, sun.target, hemi, ...pool);
      scene.fog = fog; scene.background = null;
      shadowAt.key = ""; envAt = -999;
    },
    // h: hour of the day (fractional). real: seconds since the last frame, for the clouds and stars. cover: how much
    // of the sky over you is roofed over (0 out in the open, 1 indoors)
    update(h, focus, real, cover = 0){
      const k = sample(h);
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
      uni.uOct.value = typeof GFX !== "undefined" && GFX.low ? 3 : 5;
      // one shadow-casting light: the sun by day, the moon by night, faded through zero as they swap
      // (where it shines from is set in refresh(), in step with its shadow map)
      const useSun = up > -.02, L = useSun ? dir : moonDir;
      const swap = Math.max(0, Math.min(1, (useSun ? up : moonDir.y)*7));
      shadowDir.copy(L);
      sun.intensity = k.sunI*swap;
      sun.color.copy(uni.uSunCol.value);
      hemi.intensity = k.hemiI;
      fog.color.copy(uni.uHor.value).multiplyScalar(.92);
      fog.near = 50 + k.env*50; fog.far = 180 + k.env*130;
      K.night = k.stars; K.lamps = k.lamps; K.exposure = k.exposure; K.env = k.env; K.sunUp = uni.uSunUp.value; K.cover = cover;
      // the things that glow: every lamp in the zone glows and throws its pool of light on the ground, however far away
      // it is, so a street at night reads as lit end to end; the real lights (lights()) only add the light close to you
      if (W.lit) W.lit.emissiveIntensity = k.lamps*1.25;
      if (W.mats.street) W.mats.street.emissiveIntensity = .15 + k.lamps*2.6;
      if (W.mats.neon) W.mats.neon.emissiveIntensity = .55 + k.lamps*1.6;
      const pm = poolMat(); if (pm) pm.opacity = k.lamps*.72;
      const hm = haloMat(); if (hm) hm.opacity = k.lamps*.9;
      for (const f of (W.glows || [])) f(k);
      return k;
    },
    // called a few times a second at most: shadows, reflections and which lamps are real
    refresh(renderer, scene, h, focus, force){
      const size = typeof GFX !== "undefined" && GFX.low ? 1024 : 2048;
      if (size !== shadowSize){
        shadowSize = size; sun.shadow.mapSize.set(size, size);
        if (sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map = null; }
        force = true;
      }
      /* the shadow area follows you: 60 m across, so a shadow-map texel is under 3 cm (a whole-zone frustum made it
         5–7 cm, and every edge — a step, a kerb, a canopy — came out as a crawling staircase). It moves on a 4 m grid,
         so it is redrawn only when you have walked a fair way, and shade() snaps its centre to whole texels so the
         edges stay put between redraws. Casters further off still throw their shadows in: the light's depth range
         reaches 240 m back towards the sun. */
      const fx = focus ? focus.x : 0, fz = focus ? focus.z : 0, gx = Math.round(fx/4)*4, gz = Math.round(fz/4)*4;
      const key = `${gx},${gz}`;
      if (key !== shadowAt.key){
        shadowAt.key = key; mid.x = gx; mid.z = gz; mid.half = SHADOW_HALF;
        const c = sun.shadow.camera; c.left = -mid.half; c.right = mid.half; c.top = mid.half; c.bottom = -mid.half; c.near = 1; c.far = 240; c.updateProjectionMatrix();
        shadeForce = true;
      }
      if (force) shadeForce = true;
      // reflections follow the sky every nine minutes of game time
      if (!(typeof GFX !== "undefined" && GFX.low) && (force || Math.abs(h - envAt) > .15)){
        envAt = h;
        cubeCam.update(renderer, envScene);
        envRT = pmrem.fromCubemap(cubeRT.texture, envRT);
        scene.environment = envRT.texture;
      } else if (typeof GFX !== "undefined" && GFX.low) scene.environment = null;
      scene.environmentIntensity = K.env;
      renderer.toneMappingExposure = K.exposure;
    },
    /* every frame: redraw the sun's (or the moon's) shadows once it has moved far enough for them to step visibly,
       and turn the light with them, never ahead of them. How far that is depends on how high it is: a shadow's
       tip moves by about height·dθ/sin²(elevation), so at noon a third of a degree moves a façade's shadow a few
       centimetres, while at sunset the same step would throw it a metre or two. The step is set to keep the tip of
       a ten-metre wall's shadow within ~20 cm (a third of a degree at most), and the redraws come at most five
       times a second (twice on Low) — at sunset, a cheap depth pass of the zone every few frames; at midday, one
       every few seconds. */
    shade(renderer, real){
      shadeT -= real || 0;
      const low = typeof GFX !== "undefined" && GFX.low, e = Math.max(.05, shadowDir.y);
      const step = Math.max(low ? .0015 : .0004, Math.min(.006, .02*e*e));
      if (!shadeForce && (shadeT > 0 || shadowAt.d.angleTo(shadowDir) <= step)) return false;
      shadeForce = false; shadeT = low ? .5 : .2;
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
      renderer.shadowMap.needsUpdate = true;
      return true;
    },
    /* Hand the real lights to the sources that matter most where you are, and fade them so none of them ever pops.
       Every source is ranked by its distance from you (a room's own lights count for more while you are indoors, the
       street's while you are out); the first N get a real light. Each one's brightness falls off smoothly towards the
       distance of the first source that did NOT get one (cut), and is nothing at it — so when two sources swap places
       across that line, the one handing its light over is already dark and the one taking it starts dark: lamps come
       up and go down gradually as you walk, never one by one. */
    lights(dt, focus){
      assignT -= dt;
      const fx = focus ? focus.x : 0, fy = focus ? focus.y : 1.6, fz = focus ? focus.z : 0;
      const dist = l => Math.hypot(l.x - fx, (l.y - fy)*.5, l.z - fz) + (l.indoor ? (K.cover > .5 ? -3 : 5) : (K.cover > .5 ? 5 : 0));
      if (assignT <= 0){
        assignT = .2;
        const live = W.lights.filter(l => (l.on ? l.on() : true) && (l.indoor || K.lamps > .02) && !l.dead);
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
    get K(){ return K; }, sun, hemi
  };
}
