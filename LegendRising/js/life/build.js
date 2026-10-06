/* ============ LIFE: the builder ============
   Owner: WP-0C (materials, Stage 0), WP-A from Stage 1 (DESIGN 1.4.4, 3.9.1 to 3.9.3, 2.3 WP-A).
   Everything that never moves is poured into batches, one per material, with the colour baked into each vertex;
   chunks.js turns each into one batched mesh of 24 m tiles, each tile culled on its own and drawn front to back,
   so a whole street is still only a few draw calls while what is behind you or far off costs nothing. Things that
   move (doors, the curtain, the food in the fridge) are ordinary meshes of their own. */
import * as THREE from "../../vendor/three.module.js";
// the walls' boxes are registered by core/collide.js (solid, with {dyn: true} for a box that moves, so the index
// keeps it apart), and a new place empties the scheduler's tasks (core/sched.js). Both import W from here: neither
// reads it while the modules load, so the cycle is safe
import {solid, SG} from "./core/collide.js";
import {SCHED} from "./core/sched.js";
import {finishChunks, resetChunks} from "./chunks.js";
export { THREE, solid };

export const LH = 3.2;            // one storey, floor to floor
export const W = {
  scene: null,
  solids: [],                     // boxes you cannot walk through: {x0,x1,z0,z1,y0,y1,off}
  floors: [],                     // flat things you can stand on: {x0,x1,z0,z1,h}
  ramps: [],                      // stairs: {x0,x1,z0,z1,axis,a0,a1,h0,h1}
  spots: [],                      // things you can use
  anims: [],                      // little things that move every frame
  bounds: {x0:-40, x1:40, z0:-40, z1:40},
  lit: null,                      // the material of windows that glow at night
  mats: {},                       // batch materials by key, so the time of day can turn lamps and signs up and down
  lights: [],                     // light sources: {x,y,z,color,intensity,distance,indoor,on()}: a few real lights follow you between them
  pools: [],                      // soft pools of light on the ground under street lamps, faded in at night: [x, y, z, r]
  halos: [],                      // the glow round lamp heads: [x, y, z, size]
  zone: ""
};
/* ---------- materials (WP-0C, DESIGN 2.2 and 3.9.1) ----------
   Every lit material in the world is made by mat(), so a change of graphics preset can make it again:
     mat("glass")                        the look a batch key stands for (MAT_KEYS, or "t:<texture>"), as finishBatches uses
     mat("glass", {vertexColors:true})   that look with these options over it
     mat({color, roughness, ...})        exactly these options. o.kind says what the material is where the options alone
                                         do not (a screen is {kind:"screen", map, emissiveMap, ...})
   The preset in force (GFX.P.material) picks each material's class: "lambert" everywhere (Low), "standard" everywhere
   (High), or "mixed" (Medium): Standard for the kinds in P.standardKinds (gloss, metal, paint, glass, screens), Lambert
   for the rest. Far skyline pieces (addGeo o.far) are drawn unlit on Low (P.skylineBasic).
   Each material carries userData.spec = {kind, key, o, tint, far}, plain data (it survives Material.clone()):
     kind  what a preset picks the class by: "plain", "tex" (printed), "glow" (lamps, lit windows, signs, LEDs), "gloss",
           "metal", "paint", "glass" or "screen"
     key   the batch key it was made from, or null
     o     the options it was asked for, roughness and metalness included (Lambert has neither, so a material made on Low
           comes back as it should on High), with colours as numbers and without textures, which stay on the material
     tint  screens and neon: the emissive light is tinted by the vertex colour
     far   a skyline piece
   remat(m) makes a material again from its spec for the preset in force (quality.js rematerialize). */
const gfxP = () => (typeof GFX === "object" && GFX && GFX.P) || null;
// the class the preset in force picks for a kind of surface (DESIGN 1.4.4 `material`): true for Lambert
export function lambertFor(kind){
  const P = gfxP();
  if (!P) return false;
  return P.material === "lambert" || (P.material === "mixed" && !(P.standardKinds || []).includes(kind));
}
// "basic" (unlit), "lambert" or "standard": the class a spec is made in under the preset in force
export function matClass(spec){
  const P = gfxP();
  if (spec && spec.far && P && P.skylineBasic) return "basic";
  return lambertFor(spec ? spec.kind : "plain") ? "lambert" : "standard";
}
const CLS_TAG = {basic:"B", lambert:"L", standard:"S"};
const tagOf = m => m.isMeshStandardMaterial ? "S" : m.isMeshBasicMaterial ? "B" : "L";
export const MAT_KINDS = ["plain", "tex", "glow", "gloss", "metal", "paint", "glass", "screen"];
// one material per kind of surface: matte for most things, glossy for glass, paint and metal, glowing for lamps
const MAT_KEYS = {
  plain:{kind:"plain", o:{}},
  glass:{kind:"glass", o:{transparent:true, opacity:.3, depthWrite:false, roughness:.06, metalness:.1, envMapIntensity:1.6}},
  lit:{kind:"glow", o:{emissive:0xffcf8a, emissiveIntensity:0, roughness:.2}},
  lamp:{kind:"glow", o:{emissive:0xfff2d0, emissiveIntensity:1.1, roughness:.4}},
  lampB:{kind:"glow", o:{emissive:0xfff2d0, emissiveIntensity:1.1, roughness:.4}},        // your own block's, which go out in a power cut
  street:{kind:"glow", o:{emissive:0xffe2a8, emissiveIntensity:.2, roughness:.4}},
  neon:{kind:"glow", tint:true, o:{emissive:0xffffff, emissiveIntensity:.5, roughness:.3}},
  screen:{kind:"screen", tint:true, o:{emissive:0xffffff, emissiveIntensity:.85, roughness:.25}},
  metal:{kind:"metal", o:{roughness:.34, metalness:.75}},
  paint:{kind:"paint", o:{roughness:.3, metalness:.25, envMapIntensity:1.3}},
  gloss:{kind:"gloss", o:{roughness:.42}}
};
const keyLook = key => key.startsWith("t:") ? {kind:"tex", o:{map:tex(key.slice(2)), roughness:key === "t:shopfloor" ? .5 : .92}} : MAT_KEYS[key] || MAT_KEYS.plain;
// screens, signs and neon glow in their own colour: the emissive light is tinted by the vertex colour
const tint = sh => { sh.fragmentShader = sh.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;"); };
/* Lambert lit per vertex (Low: P.material "lambert"): the light falling on each vertex (the sun or moon, the sky's
   hemisphere, the real point lights) is worked out once per vertex and blended across the face, instead of once per
   pixel. The scenery is flat-faced, so sunlight and skylight look the same; a lamp's pool on a big wall is softer.
   Per pixel only the texture, the vertex colour and the fog remain, which is what a weak GPU can afford at 60 fps */
const VLIT_V = `
  {
    vec3 vlN = normalize(transformedNormal), vlP = mvPosition.xyz, vlD = vec3(0.0), vlI = getAmbientLightIrradiance(ambientLightColor);
    IncidentLight vlL;
    #if NUM_POINT_LIGHTS > 0
    #pragma unroll_loop_start
    for (int i = 0; i < NUM_POINT_LIGHTS; i ++){ getPointLightInfo(pointLights[ i ], vlP, vlL); vlD += saturate(dot(vlN, vlL.direction))*vlL.color; }
    #pragma unroll_loop_end
    #endif
    #if NUM_DIR_LIGHTS > 0
    #pragma unroll_loop_start
    for (int i = 0; i < NUM_DIR_LIGHTS; i ++){ getDirectionalLightInfo(directionalLights[ i ], vlL); vlD += saturate(dot(vlN, vlL.direction))*vlL.color; }
    #pragma unroll_loop_end
    #endif
    #if NUM_HEMI_LIGHTS > 0
    #pragma unroll_loop_start
    for (int i = 0; i < NUM_HEMI_LIGHTS; i ++){ vlI += getHemisphereLightIrradiance(hemisphereLights[ i ], vlN); }
    #pragma unroll_loop_end
    #endif
    #if defined( USE_LIGHT_PROBES )
    vlI += getLightProbeIrradiance(lightProbe, vlN);
    #endif
    vLitD = vlD; vLitI = vlI;
  }`;
function vlit(sh){
  sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n#include <lights_pars_begin>\nvarying vec3 vLitD;\nvarying vec3 vLitI;")
    .replace("#include <fog_vertex>", "#include <fog_vertex>" + VLIT_V);
  sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vLitD;\nvarying vec3 vLitI;")
    .replace("#include <lights_fragment_begin>", "reflectedLight.directDiffuse += vLitD*BRDF_Lambert(material.diffuseColor);\n\treflectedLight.indirectDiffuse += vLitI*BRDF_Lambert(material.diffuseColor);")
    .replace("#include <lights_fragment_maps>", "").replace("#include <lights_fragment_end>", "");
}
/* a merged page's glow scale (chunks.js): the pieces on one page glow at different strengths, so the page glows at the
   strongest and each vertex's colour alpha scales it down; the alpha does not touch the surface's own opacity */
function escale(sh){
  sh.fragmentShader = sh.fragmentShader.replace("#include <color_fragment>", "#if defined( USE_COLOR_ALPHA )\n\tdiffuseColor.rgb *= vColor.rgb;\n#elif defined( USE_COLOR )\n\tdiffuseColor.rgb *= vColor;\n#endif")
    .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n#if defined( USE_COLOR_ALPHA )\n\ttotalEmissiveRadiance *= vColor.a;\n#endif");
}
/* the shader hooks a material gets from its spec and class (v: lit per vertex, t: tinted glow, e: glow scale), one
   function per combination with its own program cache key; marked, so remat never carries them to another class */
const HOOKS = {};
function hookFor(k){
  if (!k) return null;
  if (HOOKS[k]) return HOOKS[k];
  const f = sh => { if (k.includes("v")) vlit(sh); if (k.includes("t")) tint(sh); if (k.includes("e")) escale(sh); };
  const key = () => "mat-hook:" + k;
  f.__mat = key.__mat = true;
  return (HOOKS[k] = {f, key});
}
const vertexLit = () => { const P = gfxP(); return !!P && P.material === "lambert"; };
const _kc = new THREE.Color();
const hexOf = v => _kc.set(v).getHex();
// what the options say a material is, when the caller does not
function kindOf(o){
  if (o.transparent && o.opacity != null && o.opacity < 1 && !o.map) return "glass";
  if (o.emissiveMap || (o.emissive != null && hexOf(o.emissive) !== 0)) return "glow";
  if ((o.metalness || 0) >= .35) return "metal";
  if (o.map) return "tex";
  if (o.roughness != null && o.roughness < .5) return (o.metalness || 0) > .05 ? "paint" : "gloss";
  return "plain";
}
// the options as plain data: colours as numbers; textures, defaults (null) and anything else that is not data left out
function specOpts(o){
  const r = {};
  for (const k in o){
    const v = o[k];
    if (v == null || typeof v === "function" || v.isTexture) continue;
    if (v.isColor) r[k] = v.getHex();
    else if (typeof v !== "object") r[k] = v;
  }
  return r;
}
const MAT_STD = ["roughness", "metalness", "envMapIntensity"];      // what only the Standard class is made with
const MAT_LIT = ["emissive", "emissiveMap", "emissiveIntensity"];     // and what the unlit class has no use for
function makeMat(spec, o){
  let m;
  const cls = matClass(spec);
  if (cls === "basic"){
    const q = Object.assign({}, o); for (const k of MAT_STD.concat(MAT_LIT)) delete q[k];
    m = new THREE.MeshBasicMaterial(q);
  } else if (cls === "lambert"){
    const q = Object.assign({}, o); for (const k of MAT_STD) delete q[k];
    m = new THREE.MeshLambertMaterial(q);
  } else m = new THREE.MeshStandardMaterial(Object.assign({roughness:.86, metalness:0}, o));
  const h = hookFor((cls === "lambert" && vertexLit() ? "v" : "") + (spec.tint ? "t" : "") + (spec.escale ? "e" : ""));
  if (h){ m.onBeforeCompile = h.f; m.customProgramCacheKey = h.key; }
  m.userData.spec = spec;
  return m;
}
export function mat(a = {}, b = null){
  let key = null, kind, tint = false, o;
  if (typeof a === "string"){
    const L = keyLook(a);
    key = a; kind = (b && b.kind) || L.kind; tint = !!L.tint; o = Object.assign({}, L.o, b);
  } else { o = Object.assign({}, a); kind = o.kind || kindOf(o); }
  const far = !!o.far, esc = !!o.escale;
  delete o.kind; delete o.far; delete o.escale;
  const spec = {kind, key, o:specOpts(o), tint};
  if (far) spec.far = true;
  if (esc) spec.escale = true;
  return makeMat(spec, o);
}
// what code may change on a material while it is in use, carried over when it is made again
const MAT_LIVE = ["transparent", "opacity", "alphaTest", "alphaHash", "side", "depthWrite", "depthTest", "colorWrite", "visible", "toneMapped", "fog",
  "vertexColors", "flatShading", "wireframe", "blending", "polygonOffset", "polygonOffsetFactor", "polygonOffsetUnits", "emissiveIntensity", "name",
  "map", "emissiveMap", "alphaMap", "lightMap", "aoMap", "bumpMap", "normalMap", "displacementMap", "envMap"];
const MATC_KEY = new WeakMap();      // an lmat material to its cache key, so remat can put the new one in its place
/* m made again from its spec, of the class the preset in force picks (DESIGN 3.9.1: quality.js rematerialize calls it
   once per distinct material, so what was shared stays shared, then disposes the old ones). What changed since m was
   made comes with it: the options it was made with are read back from m where its class has them (a Lambert material
   has no roughness: that comes from the spec), its colours, textures and MAT_LIVE are copied, and so are its own
   onBeforeCompile and userData. The new material takes m's place in W.mats, W.lit and lmat's cache. A material
   without a spec is returned as it is. */
export function remat(m){
  const sp = m && m.userData && m.userData.spec;
  if (!sp) return m;
  const o = {}, lam = !m.isMeshStandardMaterial, basic = !!m.isMeshBasicMaterial;
  for (const k in sp.o) o[k] = k in m && !(lam && MAT_STD.includes(k)) && !(basic && MAT_LIT.includes(k)) && !(m[k] && m[k].isColor) ? m[k] : sp.o[k];
  const n = makeMat(sp, o);
  for (const k of MAT_LIVE) if (k in m && k in n) n[k] = m[k];
  for (const k of ["color", "emissive"]) if (m[k] && m[k].isColor && n[k]) n[k].copy(m[k]);
  // a shader hook of its own (not one its class gave it) comes along
  if (Object.prototype.hasOwnProperty.call(m, "onBeforeCompile") && !m.onBeforeCompile.__mat && !n.onBeforeCompile.__mat) n.onBeforeCompile = m.onBeforeCompile;
  if (Object.prototype.hasOwnProperty.call(m, "customProgramCacheKey") && !m.customProgramCacheKey.__mat && !n.customProgramCacheKey.__mat) n.customProgramCacheKey = m.customProgramCacheKey;
  n.userData = Object.assign({}, m.userData, {spec:sp});
  for (const k in W.mats) if (W.mats[k] === m) W.mats[k] = n;
  if (W.lit === m) W.lit = n;
  // lmat's cache is keyed by class: the new material is filed under its own class
  const ck = MATC_KEY.get(m);
  if (ck != null){
    if (MATC.get(ck) === m) MATC.delete(ck);
    const nk = tagOf(n) + ck.slice(1);
    MATC.set(nk, n); MATC_KEY.set(n, nk);
  }
  return n;
}
// the cached moving-part materials no one is drawing right now, made again too (map: old to new, filled in)
export function rematCache(map){
  for (const m of [...MATC.values()]) if (!map.has(m)) map.set(m, remat(m));
  return map;
}

/* ---------- a tiny seeded random, so the same career always gets the same street ---------- */
let seed = 1;
export function reseed(s){ seed = (s >>> 0) || 1; }
export function rnd(){ seed = (seed*1664525 + 1013904223) >>> 0; return seed/4294967296; }
export const pick = a => a[Math.floor(rnd()*a.length)];

/* ---------- procedural textures ---------- */
const TEX = {};
function canvas(w, h){ const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; }
function noise(g, w, h, n, a, dark = true){
  for (let i = 0; i < n; i++){
    const v = dark ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${Math.random()*a})`;
    g.fillRect(Math.random()*w, Math.random()*h, 1 + Math.random()*2, 1 + Math.random()*2);
  }
}
// soft blots drawn at every wrapped position, so the picture tiles without a seam
function blots(g, s, n, r0, r1, rgb, a){
  for (let i = 0; i < n; i++){
    const x = Math.random()*s, y = Math.random()*s, r = r0 + Math.random()*(r1 - r0), al = Math.random()*a;
    for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]){
      const cx = x + ox, cy = y + oy; if (cx + r < 0 || cx - r > s || cy + r < 0 || cy - r > s) continue;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, `rgba(${rgb},${al})`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr; g.fillRect(cx - r, cy - r, 2*r, 2*r);
    }
  }
}
// texture filtering per preset (P.anisotropy: 1 on Low, 2 on Medium, 4 on High)
const aniso = () => { const P = gfxP(); return P ? P.anisotropy || 1 : 4; };
function finish(c, per){
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso(); t.userData.per = per;            // metres one copy of the picture covers
  return t;
}
const MAKERS = {
  planks(){ const [c, g] = canvas(256, 256);
    for (let i = 0; i < 8; i++){
      const y = i*32, base = 92 + Math.random()*26;
      g.fillStyle = `rgb(${base + 34},${base},${base - 34})`; g.fillRect(0, y, 256, 32);
      for (let k = 0; k < 14; k++){ g.fillStyle = `rgba(60,35,15,${Math.random()*.12})`; g.fillRect(0, y + Math.random()*32, 256, 1); }
      g.fillStyle = "rgba(25,14,6,.75)"; g.fillRect(0, y, 256, 2);
      const cut = (i*97) % 256; g.fillRect(cut, y, 2, 32);
    }
    g.fillStyle = "rgba(30,20,10,.18)"; g.beginPath(); g.ellipse(170, 130, 60, 34, .3, 0, 7); g.fill();   // worn
    noise(g, 256, 256, 900, .18); return finish(c, 2.2); },
  paper(){ const [c, g] = canvas(256, 256);
    // a quiet striped wallpaper with a small sprig in the light stripes: warm, clean, no stains
    g.fillStyle = "#ece4cf"; g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 64){ g.fillStyle = "rgba(170,145,100,.09)"; g.fillRect(x, 0, 32, 256);
      g.fillStyle = "rgba(140,112,68,.2)"; g.fillRect(x + 31, 0, 1.5, 256); g.fillRect(x + 62.5, 0, 1.5, 256); }
    g.fillStyle = "rgba(150,120,76,.13)";
    for (let y = 16; y < 256; y += 32) for (let x = 48; x < 256; x += 64){ const yy = y + (x % 128 > 64 ? 16 : 0); g.beginPath(); g.moveTo(x, yy - 4); g.lineTo(x + 3, yy); g.lineTo(x, yy + 4); g.lineTo(x - 3, yy); g.fill(); }
    noise(g, 256, 256, 1200, .05); return finish(c, 1.6); },
  // the wallpaper a new career moves in with: old, yellowed, water-stained, torn off in strips to the grey plaster
  paperTorn(){ const [c, g] = canvas(256, 256);
    g.fillStyle = "#d3c49c"; g.fillRect(0, 0, 256, 256);
    // the ghost of an old pattern
    g.fillStyle = "rgba(120,95,55,.12)";
    for (let y = 8; y < 256; y += 28) for (let x = 10; x < 256; x += 36){ g.beginPath(); g.arc(x + (y % 56 ? 18 : 0), y, 4, 0, 7); g.fill(); }
    blots(g, 256, 7, 18, 46, "120,85,40", .32);              // water stains
    blots(g, 256, 5, 8, 20, "70,60,30", .25);
    // strips torn away: ragged grey plaster with a shadow under the curling edge
    const tear = (x, y, w, h) => {
      g.fillStyle = "#9b978c"; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k <= 8; k++) g.lineTo(x + w*k/8 + (Math.random() - .5)*6, y + (Math.random() - .5)*6);
      for (let k = 8; k >= 0; k--) g.lineTo(x + w*k/8 + (Math.random() - .5)*8, y + h + (Math.random() - .5)*10);
      g.closePath(); g.fill();
      g.fillStyle = "rgba(60,50,30,.35)"; g.fillRect(x - 2, y - 3, w + 4, 3);
      g.fillStyle = "rgba(240,230,200,.5)"; g.fillRect(x + w*.2, y + h - 2, w*.5, 3);
    };
    tear(30, 40, 26, 70); tear(150, 120, 34, 96); tear(200, 10, 20, 40); tear(80, 190, 40, 50);
    for (let i = 0; i < 120; i++){ g.fillStyle = `rgba(40,60,30,${Math.random()*.35})`; g.fillRect(Math.random()*256, 220 + Math.random()*36, 2, 2); }   // mould low down
    noise(g, 256, 256, 2500, .1); return finish(c, 1.6); },
  paperCream(){ const [c, g] = canvas(256, 256);
    g.fillStyle = "#efe6d2"; g.fillRect(0, 0, 256, 256);
    g.fillStyle = "rgba(175,150,105,.12)";
    for (let y = 0; y < 256; y += 32) for (let x = 0; x < 256; x += 32){ g.beginPath(); g.moveTo(x + 16, y + 6); g.lineTo(x + 22, y + 16); g.lineTo(x + 16, y + 26); g.lineTo(x + 10, y + 16); g.fill(); }
    noise(g, 256, 256, 900, .04); return finish(c, 1.4); },
  paperSage(){ const [c, g] = canvas(256, 256);
    g.fillStyle = "#a9b89a"; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "rgba(240,245,230,.35)"; g.lineWidth = 2;
    for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64){ g.beginPath(); g.arc(x + 32, y + 32, 18, 0, 7); g.stroke(); g.beginPath(); g.moveTo(x + 32, y + 14); g.lineTo(x + 32, y + 50); g.stroke(); }
    noise(g, 256, 256, 900, .05); return finish(c, 1.6); },
  paperNavy(){ const [c, g] = canvas(256, 256);
    g.fillStyle = "#33415c"; g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 32){ g.fillStyle = "rgba(220,200,140,.55)"; g.fillRect(x + 14, 0, 3, 256); g.fillStyle = "rgba(255,255,255,.06)"; g.fillRect(x, 0, 12, 256); }
    noise(g, 256, 256, 900, .06); return finish(c, 1.6); },
  tiles(){ const [c, g] = canvas(256, 256);
    g.fillStyle = "#8b9299"; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++){ const v = 214 + Math.random()*20; g.fillStyle = `rgb(${v},${v + 3},${v + 6})`; g.fillRect(x*32 + 1.5, y*32 + 1.5, 29, 29); }
    noise(g, 256, 256, 500, .1); return finish(c, 1.2); },
  terrazzo(){ const [c, g] = canvas(256, 256);
    // fine chips in a warm grey ground, poured without joints, so the same stone serves floors, landings and treads
    g.fillStyle = "#b3ada3"; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++){ const v = 120 + Math.random()*110, sz = 1 + Math.random()*2.2; g.fillStyle = `rgba(${v},${v - 5},${v - 12},.55)`; g.fillRect(Math.random()*256, Math.random()*256, sz, sz); }
    noise(g, 256, 256, 1500, .06); return finish(c, 1.6); },
  asphalt(){ const [c, g] = canvas(256, 256);
    g.fillStyle = "#3a3e43"; g.fillRect(0, 0, 256, 256);
    noise(g, 256, 256, 5000, .3); noise(g, 256, 256, 2500, .08, false);
    g.strokeStyle = "rgba(15,15,18,.5)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(20, 200); g.lineTo(80, 170); g.lineTo(110, 190); g.stroke();
    return finish(c, 6); },
  slabs(){ const [c, g] = canvas(256, 256);
    g.fillStyle = "#5d636a"; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++){ const v = 140 + Math.random()*22; g.fillStyle = `rgb(${v},${v + 2},${v + 5})`; g.fillRect(x*64 + 2, y*64 + 2, 60, 60); }
    noise(g, 256, 256, 2200, .16); return finish(c, 3); },
  grass(){ const [c, g] = canvas(256, 256);
    g.fillStyle = "#4b7a3f"; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3500; i++){ const v = Math.random(); g.fillStyle = v < .5 ? "rgba(40,80,30,.5)" : "rgba(110,150,70,.35)"; g.fillRect(Math.random()*256, Math.random()*256, 1, 3); }
    return finish(c, 4); },
  pitch(){ const [c, g] = canvas(512, 512);
    // mown stripes, a little uneven, with worn patches where the drills happen
    for (let i = 0; i < 8; i++){ g.fillStyle = i % 2 ? "#3e8a49" : "#479850"; g.fillRect(0, i*64, 512, 64); }
    for (let i = 0; i < 9000; i++){ g.fillStyle = Math.random() < .55 ? "rgba(20,60,20,.22)" : "rgba(120,180,90,.14)"; g.fillRect(Math.random()*512, Math.random()*512, 1, 2 + Math.random()*2); }
    for (let i = 0; i < 6; i++){ const gr = g.createRadialGradient(80 + i*70, 120 + (i*137) % 300, 4, 80 + i*70, 120 + (i*137) % 300, 46);
      gr.addColorStop(0, "rgba(120,110,60,.16)"); gr.addColorStop(1, "rgba(120,110,60,0)"); g.fillStyle = gr; g.fillRect(0, 0, 512, 512); }
    return finish(c, 20); },
  rubber(){ const [c, g] = canvas(128, 128);
    g.fillStyle = "#4a5056"; g.fillRect(0, 0, 128, 128); noise(g, 128, 128, 1400, .25, false); return finish(c, 1.5); },
  concrete(){ const [c, g] = canvas(256, 256);
    g.fillStyle = "#9a9892"; g.fillRect(0, 0, 256, 256); noise(g, 256, 256, 4200, .12); noise(g, 256, 256, 1600, .08, false);
    g.strokeStyle = "rgba(40,40,40,.28)"; g.lineWidth = 2; g.strokeRect(1, 1, 254, 254);
    return finish(c, 4); },
  path(){ const [c, g] = canvas(256, 256);
    g.fillStyle = "#7f7c76"; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++){ const v = 150 + Math.random()*24, o = y % 2 ? 32 : 0;
      g.fillStyle = `rgb(${v},${v - 4},${v - 10})`; g.fillRect(((x*64 + o) % 256) + 2, y*32 + 2, 60, 28); if (o && x === 3) g.fillRect(2, y*32 + 2, 28, 28); }
    noise(g, 256, 256, 2400, .14); return finish(c, 2.4); },
  rubberFloor(){ const [c, g] = canvas(256, 256);
    g.fillStyle = "#33363a"; g.fillRect(0, 0, 256, 256); noise(g, 256, 256, 3000, .25, false);
    for (let i = 0; i < 900; i++){ g.fillStyle = Math.random() < .5 ? "rgba(90,160,150,.5)" : "rgba(200,210,90,.35)"; g.fillRect(Math.random()*256, Math.random()*256, 1.5, 1.5); }
    g.strokeStyle = "rgba(0,0,0,.45)"; g.lineWidth = 2; g.strokeRect(0, 0, 256, 256); return finish(c, 1); },
  turf(){ const [c, g] = canvas(256, 256);
    g.fillStyle = "#3f8a48"; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5000; i++){ g.fillStyle = Math.random() < .5 ? "rgba(30,80,35,.35)" : "rgba(110,170,90,.25)"; g.fillRect(Math.random()*256, Math.random()*256, 1, 2); }
    return finish(c, 3); },
  carpet(){ const [c, g] = canvas(128, 128);
    g.fillStyle = "#2c3846"; g.fillRect(0, 0, 128, 128); noise(g, 128, 128, 2400, .18); noise(g, 128, 128, 800, .06, false); return finish(c, 1.5); },
  shopfloor(){ const [c, g] = canvas(256, 256);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++){ const v = (x + y) % 2 ? 222 : 206; g.fillStyle = `rgb(${v},${v - 2},${v - 8})`; g.fillRect(x*64, y*64, 64, 64); }
    g.strokeStyle = "rgba(90,90,90,.25)"; for (let i = 0; i <= 4; i++){ g.beginPath(); g.moveTo(i*64, 0); g.lineTo(i*64, 256); g.moveTo(0, i*64); g.lineTo(256, i*64); g.stroke(); }
    noise(g, 256, 256, 900, .06); return finish(c, 2.4); },
  paint(){ const [c, g] = canvas(256, 256);
    // painted plaster, indoors and out: the faint stipple and clouding a roller leaves, nothing more
    g.fillStyle = "#f4f3ef"; g.fillRect(0, 0, 256, 256);
    blots(g, 256, 24, 20, 64, "120,110,95", .04); blots(g, 256, 16, 16, 50, "255,255,255", .06);
    noise(g, 256, 256, 2600, .04); noise(g, 256, 256, 1200, .05, false);
    return finish(c, 2.2); },
  brick(){ const [c, g] = canvas(256, 256);
    // stretcher bond: light mortar, each brick a slightly different tone, a shaded lower edge
    g.fillStyle = "#f3f0ea"; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 16; y++){
      const tones = [0, 1, 2, 3].map(() => [200 + Math.random()*28, (Math.random() - .5)*12]);
      for (let x = -1; x < 4; x++){
        const bx = x*64 + (y % 2 ? 32 : 0), by = y*16, [v, t] = tones[(x + 4) % 4];
        g.fillStyle = `rgb(${v + t},${v - 2},${v - 4 - t})`; g.fillRect(bx + 1.5, by + 1.5, 61, 13);
        g.fillStyle = "rgba(0,0,0,.08)"; g.fillRect(bx + 1.5, by + 12.5, 61, 2);
        g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(bx + 1.5, by + 1.5, 61, 1.5);
      }
    }
    noise(g, 256, 256, 3000, .07); return finish(c, 1.1); },
  panel(){ const [c, g] = canvas(256, 256);
    // tongue-and-groove boards, oiled, with a little grain
    for (let i = 0; i < 8; i++){
      const v = 202 + Math.random()*26; g.fillStyle = `rgb(${v},${v - 20},${v - 44})`; g.fillRect(i*32, 0, 32, 256);
      for (let k = 0; k < 10; k++){ g.fillStyle = `rgba(90,58,26,${Math.random()*.1})`; g.fillRect(i*32 + Math.random()*30, 0, 1, 256); }
      g.fillStyle = "rgba(40,24,10,.42)"; g.fillRect(i*32, 0, 2, 256); g.fillStyle = "rgba(255,240,220,.14)"; g.fillRect(i*32 + 2, 0, 1, 256);
    }
    noise(g, 256, 256, 800, .05); return finish(c, 1.6); },
  cladding(){ const [c, g] = canvas(256, 256);
    // standing-seam metal sheet: a crisp rib every half metre
    g.fillStyle = "#e9eaea"; g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 64){
      g.fillStyle = "rgba(255,255,255,.75)"; g.fillRect(x, 0, 3, 256); g.fillStyle = "rgba(0,0,0,.24)"; g.fillRect(x + 3, 0, 4, 256);
      g.fillStyle = "rgba(0,0,0,.06)"; g.fillRect(x + 7, 0, 12, 256);
    }
    noise(g, 256, 256, 1200, .035); return finish(c, 2); }
};
export function tex(name){ return TEX[name] || (TEX[name] = MAKERS[name]()); }
// a goal net or a wire fence: lines on a clear background, cut out with alphaTest
export function netTex(cell = 16, line = 2, col = "#f4f4f0"){
  const k = `net:${cell}:${line}:${col}`; if (TEX[k]) return TEX[k];
  const [c, g] = canvas(128, 128);
  g.strokeStyle = col; g.lineWidth = line;
  for (let i = 0; i <= 128; i += cell){ g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso();
  return (TEX[k] = t);
}

/* ---------- the batches ----------
   Per material key: vertices (position, normal, colour; uv only for printed keys), an index, and the pieces (one per
   addGeo call: where its vertices and indices start, and its bounding box), from which chunks.js cuts the tiles. A
   piece keeps its geometry's own index where it has one; one without (an extrusion, a wall with open ends, a faceted
   piece) has its identical vertices merged */
const batches = new Map();
function batch(key){
  let b = batches.get(key);
  if (!b){ b = {key, pos:[], nor:[], col:[], uv:[], idx:[], pieces:[], tex:key.startsWith("t:")}; batches.set(key, b); }
  return b;
}
const _c = new THREE.Color();
// identical vertices of an unindexed piece, found through a small open-addressed table (exact float equality)
const DD = {tab:new Int32Array(1024), f:new Float32Array(1), u:null};
DD.u = new Uint32Array(DD.f.buffer);
const fbits = v => { DD.f[0] = v; return DD.u[0]; };
function dedupe(p, n, count, map){
  let size = 1024; while (size < count*2) size <<= 1;
  if (DD.tab.length < size) DD.tab = new Int32Array(size);
  const tab = DD.tab, mask = size - 1;
  tab.fill(-1, 0, size);
  let uniq = 0;
  const first = new Int32Array(count);
  for (let i = 0; i < count; i++){
    const o = i*3;
    let h = (Math.imul(fbits(p[o]), 73856093) ^ Math.imul(fbits(p[o + 1]), 19349663) ^ Math.imul(fbits(p[o + 2]), 83492791) ^ Math.imul(fbits(n[o]), 2654435761) ^ Math.imul(fbits(n[o + 1]), 40503) ^ fbits(n[o + 2])) & mask;
    for (;;){
      const j = tab[h];
      if (j < 0){ tab[h] = i; map[i] = uniq; first[uniq++] = i; break; }
      const q = j*3;
      if (p[q] === p[o] && p[q + 1] === p[o + 1] && p[q + 2] === p[o + 2] && n[q] === n[o] && n[q + 1] === n[o + 1] && n[q + 2] === n[o + 2]){ map[i] = map[j]; break; }
      h = (h + 1) & mask;
    }
  }
  return first.subarray(0, uniq);
}
/* pour a geometry (already where it belongs, or with a matrix) into its batch. o.far: a skyline piece, drawn unlit
   on Low */
export function addGeo(geo, color, o = {}){
  let g = geo;
  if (o.flat && geo.index) g = geo.toNonIndexed();
  if (o.matrix) g.applyMatrix4(o.matrix);
  if (o.flat) g.computeVertexNormals();            // non-indexed: every face its own normal, the faceted low-poly look
  const key = (o.key || (o.tex ? "t:" + o.tex : "plain")) + (o.far ? "|far" : "");
  const b = batch(key);
  const p = g.attributes.position.array, n = g.attributes.normal.array, gi = g.index ? g.index.array : null, cnt = g.attributes.position.count;
  _c.set(color);
  const j = 1 + (rnd() - .5)*(o.jit == null ? .07 : o.jit);
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 1; i < p.length; i += 3){ if (p[i] < y0) y0 = p[i]; if (p[i] > y1) y1 = p[i]; }
  const ao = o.ao !== false && (y1 - y0) > .35;
  const per = o.tex ? tex(o.tex).userData.per : 1;
  if (globalThis.__zf){ const ni = gi ? g.toNonIndexed() : g; zfLog(ni.attributes.position.array, ni.attributes.normal.array, key, _c.getHex()); if (ni !== g) ni.dispose(); }
  // the vertices this piece keeps, and how its triangles index them
  let verts, remap = null;
  if (gi) verts = null;
  else { remap = new Int32Array(cnt); verts = dedupe(p, n, cnt, remap); }
  const v0 = b.pos.length/3, i0 = b.idx.length, nv = verts ? verts.length : cnt;
  let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
  for (let k = 0; k < nv; k++){
    const i = (verts ? verts[k] : k)*3;
    const x = p[i], y = p[i+1], z = p[i+2], nx = n[i], ny = n[i+1], nz = n[i+2];
    b.pos.push(x, y, z); b.nor.push(nx, ny, nz);
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (z < bz0) bz0 = z; if (z > bz1) bz1 = z;
    // a little contact shadow at the foot of anything tall
    const f = (ao && y - y0 < .01 && Math.abs(ny) < .5 ? .72 : 1)*j*(o.shade || 1);
    b.col.push(_c.r*f, _c.g*f, _c.b*f);
    if (b.tex){
      if (o.tex){
        const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
        if (ay >= ax && ay >= az) b.uv.push(x/per, z/per);
        else if (ax >= az) b.uv.push(z/per, y/per);
        else b.uv.push(x/per, y/per);
      } else b.uv.push(0, 0);
    }
  }
  if (gi) for (let k = 0; k < gi.length; k++) b.idx.push(v0 + gi[k]);
  else for (let k = 0; k < cnt; k++) b.idx.push(v0 + remap[k]);
  b.pieces.push({v0, nv, i0, ni:b.idx.length - i0, x0:bx0, x1:bx1, y0, y1, z0:bz0, z1:bz1});
  if (g !== geo) g.dispose();
  geo.dispose();
}
/* ---------- a z-fighting finder for development: set window.__zf = [] before a zone is built, then call
   zfReport(). Every axis-aligned triangle is logged with its plane; two pieces whose faces look the same way, lie in
   the same plane and overlap fight for the same pixels: they flicker as the camera moves. ---------- */
let zfSrc = 0;
function zfLog(p, n, key, col){
  const src = ++zfSrc, L = globalThis.__zf;
  // where it came from: the first stack frame outside this file (dev only)
  const at = globalThis.__zfStack ? ((new Error().stack || "").split("\n").find(l => /\.js/.test(l) && !/build\.js/.test(l)) || "").replace(/.*\/js\//, "").replace(/\)$/, "") : "";
  for (let i = 0; i < p.length; i += 9){
    // the face's own normal (a rounded box's vertex normals lean at its edges)
    const ux = p[i+3] - p[i], uy = p[i+4] - p[i+1], uz = p[i+5] - p[i+2], vx = p[i+6] - p[i], vy = p[i+7] - p[i+1], vz = p[i+8] - p[i+2];
    let nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx; const nl = Math.hypot(nx, ny, nz); if (nl < 1e-9) continue;
    nx /= nl; ny /= nl; nz /= nl; if (nx*n[i] + ny*n[i+1] + nz*n[i+2] < 0){ nx = -nx; ny = -ny; nz = -nz; }
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    const a = ay > .999 ? 1 : ax > .999 ? 0 : az > .999 ? 2 : -1; if (a < 0) continue;
    const u = (a + 1) % 3, v = (a + 2) % 3, sg = (a === 0 ? nx : a === 1 ? ny : nz) > 0 ? 1 : -1;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let k = 0; k < 9; k += 3){ const pu = p[i + k + u], pv = p[i + k + v]; if (pu < u0) u0 = pu; if (pu > u1) u1 = pu; if (pv < v0) v0 = pv; if (pv > v1) v1 = pv; }
    L.push({src, at, key, col, a, sg, d:p[i + a], u0, u1, v0, v1});
  }
}
export function zfReport(tol = 2e-4, minArea = 4e-4){
  const L = globalThis.__zf || [], groups = new Map(), out = [], seen = new Set();
  for (const t of L){ const g = `${t.a}${t.sg}:${Math.round(t.d/tol)}`; (groups.get(g) || groups.set(g, []).get(g)).push(t); }
  for (const [, ts] of groups){
    if (ts.length < 2) continue;
    for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++){
      const A = ts[i], B = ts[j]; if (A.src === B.src || Math.abs(A.d - B.d) > tol) continue;
      const w = Math.min(A.u1, B.u1) - Math.max(A.u0, B.u0), h = Math.min(A.v1, B.v1) - Math.max(A.v0, B.v0);
      if (w <= 1e-3 || h <= 1e-3 || w*h < minArea) continue;
      const k = A.src < B.src ? `${A.src}-${B.src}` : `${B.src}-${A.src}`; if (seen.has(k)) continue; seen.add(k);
      const ax = "xyz"[A.a], U = "xyz"[(A.a + 1) % 3], V = "xyz"[(A.a + 2) % 3];
      out.push({plane:`${A.sg > 0 ? "+" : "-"}${ax}=${A.d.toFixed(3)}`, at:`${U} ${Math.max(A.u0, B.u0).toFixed(2)}..${Math.min(A.u1, B.u1).toFixed(2)}, ${V} ${Math.max(A.v0, B.v0).toFixed(2)}..${Math.min(A.v1, B.v1).toFixed(2)}`,
        a:`${A.key} #${A.col.toString(16)}`, b:`${B.key} #${B.col.toString(16)}`, same:A.key === B.key && A.col === B.col, area:+(w*h).toFixed(3), from:A.at + " | " + B.at});
    }
  }
  return out.sort((p, q) => (p.same - q.same) || q.area - p.area);
}
export function box(x0, y0, z0, x1, y1, z1, color, o = {}){
  if (x1 < x0) [x0, x1] = [x1, x0]; if (y1 < y0) [y0, y1] = [y1, y0]; if (z1 < z0) [z0, z1] = [z1, z0];
  const g = new THREE.BoxGeometry(Math.max(.001, x1 - x0), Math.max(.001, y1 - y0), Math.max(.001, z1 - z0));
  if (o.ry){ g.rotateY(o.ry); }
  g.translate((x0 + x1)/2, (y0 + y1)/2, (z0 + z1)/2);
  addGeo(g, color, o);
  if (o.solid) solid(x0, x1, z0, z1, y0, y1);
  return {x0, x1, y0, y1, z0, z1};
}
export function cyl(x, y, z, r, h, color, o = {}){
  const g = new THREE.CylinderGeometry(o.rt == null ? r : o.rt, r, h, o.seg || 10, 1, !!o.open);
  if (o.rx) g.rotateX(o.rx); if (o.rz) g.rotateZ(o.rz); if (o.ry) g.rotateY(o.ry);
  g.translate(x, y + (o.rx || o.rz ? 0 : h/2), z);
  addGeo(g, color, Object.assign({ao:false}, o));
}
export function blob(x, y, z, r, color, o = {}){        // a low-poly ball: tree tops, bushes
  const g = new THREE.IcosahedronGeometry(r, o.detail || 0);
  if (o.sy) g.scale(1, o.sy, 1);
  g.translate(x, y, z); addGeo(g, color, Object.assign({ao:false}, o));
}
const roundMin = () => { const P = gfxP(); return P && P.tier === "low" ? .05 : .016; };
/* a box with its edges and corners rounded off. Built from a segmented cube whose outer rows are pushed
   out onto quarter circles, so it costs a few dozen triangles and reads as a soft, made object. */
export function roundedBoxGeo(w, h, d, r, seg = 1){
  r = Math.max(0, Math.min(r, w/2 - 1e-3, h/2 - 1e-3, d/2 - 1e-3));
  // a rounding under a couple of centimetres is invisible past arm's length: a plain box is 12 triangles, not 108.
  // Low draws any rounding under 5 cm square (made when a place is built: a change of preset shows from the next place)
  if (r < roundMin()) return new THREE.BoxGeometry(w, h, d);
  const s = seg*2 + 1, g = new THREE.BoxGeometry(1, 1, 1, s, s, s);
  const p = g.attributes.position, n = g.attributes.normal;
  const half = [w/2, h/2, d/2], inner = [w/2 - r, h/2 - r, d/2 - r], P = [0, 0, 0], Q = [0, 0, 0];
  for (let i = 0; i < p.count; i++){
    const c = [p.getX(i), p.getY(i), p.getZ(i)];
    for (let a = 0; a < 3; a++){
      const k = Math.round((c[a] + .5)*s);
      P[a] = k <= seg ? -half[a] + r*(k/seg) : inner[a] + r*((k - seg - 1)/seg);
      Q[a] = Math.max(-inner[a], Math.min(inner[a], P[a]));
    }
    let vx = P[0] - Q[0], vy = P[1] - Q[1], vz = P[2] - Q[2];
    const L = Math.hypot(vx, vy, vz);
    if (L > 1e-6){ vx /= L; vy /= L; vz /= L; p.setXYZ(i, Q[0] + vx*r, Q[1] + vy*r, Q[2] + vz*r); n.setXYZ(i, vx, vy, vz); }
    else p.setXYZ(i, P[0], P[1], P[2]);
  }
  return g;
}
// a rounded box poured into the batches. x/z are the centre, y0 the bottom.
export function rbox(x, y0, z, w, h, d, r, color, o = {}){
  const g = roundedBoxGeo(w, h, d, r, o.seg || 1);
  if (o.rx) g.rotateX(o.rx); if (o.rz) g.rotateZ(o.rz); if (o.ry) g.rotateY(o.ry);
  g.translate(x, y0 + h/2, z);
  addGeo(g, color, Object.assign({ao:false}, o));
  if (o.solid) solid(x - w/2, x + w/2, z - d/2, z + d/2, y0, y0 + h);
}
/* a bar from one point to another (a handrail, a pipe, a bracket), w wide and h deep, its sides kept level
   (o.round: a round bar of diameter w; o.r: rounded edges) */
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3(), _bm = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0);
export function beam(x0, y0, z0, x1, y1, z1, w, h, color, o = {}){
  _bz.set(x1 - x0, y1 - y0, z1 - z0); const L = _bz.length(); if (L < 1e-4) return; _bz.divideScalar(L);
  if (Math.abs(_bz.y) > .999) _bx.set(1, 0, 0); else _bx.crossVectors(_up, _bz).normalize();
  _by.crossVectors(_bz, _bx);
  const g = o.round ? new THREE.CylinderGeometry(w/2, w/2, L, o.seg || 8).rotateX(Math.PI/2) : o.r ? roundedBoxGeo(w, h, L, o.r) : new THREE.BoxGeometry(w, h, L);
  g.applyMatrix4(_bm.makeBasis(_bx, _by, _bz).setPosition((x0 + x1)/2, (y0 + y1)/2, (z0 + z1)/2));
  addGeo(g, color, Object.assign({ao:false}, o));
}
/* a side profile pushed out sideways: pts are [a, y] in world units, where a runs along `axis` ("z" or "x");
   the shape is extruded across the other horizontal axis from s0 to s1. Stairs, stringers, sloped dados. */
export function extrude(axis, pts, s0, s1, color, o = {}){
  const sh = new THREE.Shape(pts.map(([a, y]) => new THREE.Vector2(a, y)));
  const g = new THREE.ExtrudeGeometry(sh, {depth:Math.abs(s1 - s0), bevelEnabled:false, curveSegments:1});
  const lo = Math.min(s0, s1), hi = Math.max(s0, s1);
  // local x → along the profile, local y → up, local z → across (kept right-handed so no face turns inside out)
  if (axis === "z") _bm.makeBasis(_bx.set(0, 0, 1), _by.set(0, 1, 0), _bz.set(-1, 0, 0)).setPosition(hi, 0, 0);
  else _bm.makeBasis(_bx.set(1, 0, 0), _by.set(0, 1, 0), _bz.set(0, 0, 1)).setPosition(0, 0, lo);
  g.applyMatrix4(_bm);
  addGeo(g, color, Object.assign({ao:false}, o));
}
/* a slab cut to a plan outline (pts: [x, z] corners), y0 → y1: one piece with no inner seams, where boxes laid side by
   side would leave a joint across a ceiling */
export function slab(pts, y0, y1, color, o = {}){
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z))), {depth:y1 - y0, bevelEnabled:false, curveSegments:1});
  g.rotateX(-Math.PI/2); g.translate(0, y0, 0);
  addGeo(g, color, Object.assign({ao:false}, o));
}
/* a flight of stairs as it is really built: a sloped concrete flight (soffit underneath), treads with a nosing,
   risers, a non-slip strip, and under it all the ramp you actually walk on, laid just below the nosings.
   o: axis ("z"/"x", the way it climbs), a0 (foot of the first riser) → a1 (the last riser, at the top),
   s0 → s1 (across), y0 → y1, n risers, solidBase (sits on the ground: no soffit). Returns the pitch helpers. */
export function flight(o){
  const n = o.n, r = (o.y1 - o.y0)/n, L = Math.abs(o.a1 - o.a0), g = L/(n - 1), dir = Math.sign(o.a1 - o.a0);
  const tt = .035, no = .03, th = o.th || .3, A = u => o.a0 + dir*u;
  const pitch = u => o.y0 + r + u*r/g;                          // the line through the nosings
  const us = Math.max(.01, (th - r)*g/r);                       // where the soffit meets the floor below
  const P = [[A(0), o.y0]];
  for (let i = 0; i < n; i++){ P.push([A(i*g), o.y0 + (i + 1)*r - tt]); if (i < n - 1) P.push([A((i + 1)*g), o.y0 + (i + 1)*r - tt]); }
  if (o.solidBase) P.push([A(L), o.y0]); else P.push([A(L), o.y1 - th], [A(us), o.y0]);
  extrude(o.axis, P, o.s0, o.s1, o.body || 0xe9e4d8, {tex:o.bodyTex || "paint", jit:0});
  const B = (u0, u1, y0, y1, c, op) => o.axis === "z" ? box(o.s0, y0, A(u0), o.s1, y1, A(u1), c, op) : box(A(u0), y0, o.s0, A(u1), y1, o.s1, c, op);
  const T = {tex:o.treadTex || "terrazzo", ao:false, jit:.02};
  for (let k = 0; k < n; k++){
    const top = o.y0 + (k + 1)*r;
    // the riser under this tread, a thin facing plate, and the tread itself with its nosing proud of it
    B(k*g - .012, k*g, top - r, top - tt, o.riser || 0xe4dfd6, {tex:o.treadTex || "terrazzo", ao:false, jit:.02});
    if (k < n - 1){
      B(k*g - no, (k + 1)*g, top - tt, top, o.tread || 0xffffff, T);
      B(k*g - no + .025, k*g - no + .065, top, top + .003, o.strip || 0x4a4f55, {ao:false, jit:0});
    } else B(k*g - no, k*g, top - tt, top, o.tread || 0xffffff, T);
  }
  if (o.ramp !== false){
    const [x0, x1] = [o.s0, o.s1];
    if (o.axis === "z") ramp(x0, x1, A(0), A(L), "z", A(0), A(L), o.y0 + r - .02, o.y1 - .02);
    else ramp(A(0), A(L), x0, x1, "x", A(0), A(L), o.y0 + r - .02, o.y1 - .02);
  }
  return {r, g, L, n, A, pitch, us, th, no};
}
/* a stringer, a wall string or a dado band that follows a flight (f from flight()): a plate between `below`
   under the soffit and `above` over the nosing line, at s0 → s1 across */
export function stringer(o, f, s0, s1, color, above = .1, below = .03, op = {}){
  const P = [[f.A(-f.no - .04), o.y0], [f.A(-f.no - .04), f.pitch(-f.no - .04) + above], [f.A(f.L), o.y1 + above]];
  if (o.solidBase || op.toFloor) P.push([f.A(f.L), o.y0]);
  else P.push([f.A(f.L), o.y1 - f.th - below], [f.A(Math.max(.01, (f.th + below - f.r)*f.g/f.r)), o.y0]);
  extrude(o.axis, P, s0, s1, color, Object.assign({jit:0}, op));
}
/* the reveal of a window opening: the cut edges of the wall lined all round (sides, head and a sill board) */
export function reveal(axis, fixed, a0, a1, y0, y1, t, color, o = {}){
  const e = t/2 + (o.over || .02), T = {ao:false, jit:0, key:o.key}, lt = .03;
  const B = (s0, s1, h0, h1, f0, f1, c) => axis === "x" ? box(s0, h0, fixed + f0, s1, h1, fixed + f1, c, T) : box(fixed + f0, h0, s0, fixed + f1, h1, s1, c, T);
  B(a0, a0 + lt, y0, y1, -e, e, color); B(a1 - lt, a1, y0, y1, -e, e, color);
  B(a0, a1, y1 - lt, y1, -e, e, color); B(a0 - .04, a1 + .04, y0, y0 + lt, -e - .03, e + .03, o.sill || color);
}
/* the lining of a door opening: jambs and a head over the cut edges of the wall, an architrave on each face that
   stands proud of any wallpaper or paint skin, and a flush threshold: nothing across the opening that sticks up.
   axis/fixed/t describe the wall (as for wall()); a0 → a1 the hole, base → base + h its height */
export function doorway(axis, fixed, a0, a1, base, h, t, o = {}){
  const c = o.color == null ? 0xf0eee8 : o.color, ar = o.arch == null ? .07 : o.arch, d = o.proud || .035, T = {ao:false, jit:0, key:o.key};
  const B = (s0, s1, y0, y1, f0, f1, col) => axis === "x" ? box(s0, y0, fixed + f0, s1, y1, fixed + f1, col, T) : box(fixed + f0, y0, s0, fixed + f1, y1, s1, col, T);
  const lt = o.lining == null ? .03 : o.lining;
  // the lining runs on through any paint or paper skin to a clear step (9 mm) inside the architraves: a hairline step
  // breaks up into dashes at a distance, a real one reads as a crisp return. A metal frame is one dark section: there
  // the return would only catch the sky as a broken bright line, so the lining runs flush with the architraves
  const e = t/2 + (ar ? (o.key === "metal" ? d : d - .009) : .025);
  if (lt){ B(a0, a0 + lt, base, base + h, -e, e, c); B(a1 - lt, a1, base, base + h, -e, e, c); B(a0 + lt, a1 - lt, base + h - lt, base + h, -e, e, c); }
  for (const s of o.faces || [-1, 1]){
    if (!ar) break;
    const f0 = s*t/2, f1 = s*(t/2 + d);
    B(a0 - ar, a0, base, base + h + ar, f0, f1, c); B(a1, a1 + ar, base, base + h + ar, f0, f1, c);
    B(a0 - ar, a1 + ar, base + h, base + h + ar, f0, f1, c);
  }
  if (o.sill != null) B(a0 + lt, a1 - lt, base, o.sill, -t/2, t/2, o.sillColor || 0x8d8a84);
  return {a0:a0 + lt, a1:a1 - lt, h:h - lt};
}
// a light source: the nearest few to you are real lights, the rest just glow
export function lightSrc(o){ const l = Object.assign({color:0xfff0d8, intensity:6, distance:12, decay:1.6, indoor:false}, o); W.lights.push(l); return l; }
/* Soft pools of light on the ground under street lamps and the glow round a lamp's head: one instanced mesh each for
   the whole place (two draw calls however many lamps), made when the sky first asks for them (glowMeshes). The sky
   fades them in at dusk and hides them by day; a halo fades out beyond the preset's haloMax and in the fog */
let POOL_MAT = null, HALO_MAT = null;
const GLOW = {pools:null, halos:null, dirty:false};
function poolMaterial(){
  if (POOL_MAT) return POOL_MAT;
  const [c, g] = canvas(128, 128), gr = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,226,170,.85)"); gr.addColorStop(.45, "rgba(255,214,150,.35)"); gr.addColorStop(1, "rgba(255,210,140,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.per = 1;
  POOL_MAT = new THREE.MeshBasicMaterial({map:t, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, opacity:0, toneMapped:false});
  POOL_MAT.userData.keep = true;
  return POOL_MAT;
}
const HALO_VERT = `uniform float uMax;
varying vec2 vUv; varying float vFade;
#include <fog_pars_vertex>
void main(){
  mat4 im = mat4(1.);
  #ifdef USE_INSTANCING
  im = instanceMatrix;
  #endif
  vec4 c = modelViewMatrix*im*vec4(0., 0., 0., 1.);
  float s = length(im[0].xyz);
  vec4 mvPosition = c + vec4(position.xy*s, 0., 0.);
  vUv = uv;
  vFade = 1. - smoothstep(uMax*.85, uMax, -c.z);
  gl_Position = projectionMatrix*mvPosition;
  #include <fog_vertex>
}`;
const HALO_FRAG = `uniform sampler2D map; uniform float opacity;
varying vec2 vUv; varying float vFade;
#include <fog_pars_fragment>
void main(){
  vec4 t = texture2D(map, vUv);
  float a = t.a*opacity*vFade;
  #ifdef USE_FOG
  a *= 1. - smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  gl_FragColor = vec4(t.rgb, a);
  #include <colorspace_fragment>
}`;
function haloMaterial(){
  if (HALO_MAT) return HALO_MAT;
  const [c, g] = canvas(64, 64), gr = g.createRadialGradient(32, 32, 1, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,240,210,1)"); gr.addColorStop(.25, "rgba(255,220,160,.55)"); gr.addColorStop(1, "rgba(255,210,140,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.per = 1;
  HALO_MAT = new THREE.ShaderMaterial({uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {map:{value:null}, opacity:{value:0}, uMax:{value:1e6}}]),
    vertexShader:HALO_VERT, fragmentShader:HALO_FRAG, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:true, toneMapped:false});
  HALO_MAT.uniforms.map.value = t;
  HALO_MAT.userData.keep = true;
  return HALO_MAT;
}
export function pool(x, z, r = 3.2, y = .03){ poolMaterial(); const q = [x, y, z, r]; W.pools.push(q); GLOW.dirty = true; return q; }
export function halo(x, y, z, size = 1.4){ haloMaterial(); const q = [x, y, z, size]; W.halos.push(q); GLOW.dirty = true; return q; }
export const poolMat = () => POOL_MAT;
export const haloMat = () => HALO_MAT;
const _gm = new THREE.Matrix4(), _gq = new THREE.Quaternion(), _gs = new THREE.Vector3(), _gp = new THREE.Vector3();
// the place's pools and halos as two instanced meshes, made again when a lamp was added since
export function glowMeshes(){
  if (GLOW.dirty && W.scene){
    GLOW.dirty = false;
    for (const k of ["pools", "halos"]) if (GLOW[k]){ if (GLOW[k].parent) GLOW[k].parent.remove(GLOW[k]); GLOW[k].geometry.dispose(); GLOW[k].dispose(); GLOW[k] = null; }
    if (W.pools.length){
      const geo = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI/2), m = new THREE.InstancedMesh(geo, poolMaterial(), W.pools.length);
      W.pools.forEach(([x, y, z, r], i) => { m.setMatrixAt(i, _gm.compose(_gp.set(x, y, z), _gq.identity(), _gs.set(r, 1, r))); });
      m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); m.renderOrder = 2; m.userData.noRays = true; m.visible = false;
      W.scene.add(m); GLOW.pools = m;
    }
    if (W.halos.length){
      const geo = new THREE.PlaneGeometry(1, 1), m = new THREE.InstancedMesh(geo, haloMaterial(), W.halos.length);
      W.halos.forEach(([x, y, z, s], i) => { m.setMatrixAt(i, _gm.compose(_gp.set(x, y, z), _gq.identity(), _gs.set(s, s, s))); });
      m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); if (m.boundingSphere) m.boundingSphere.radius += 2; m.renderOrder = 3; m.userData.noRays = true; m.visible = false;
      W.scene.add(m); GLOW.halos = m;
    }
  }
  return GLOW;
}
export function floor(x0, x1, z0, z1, h){ W.floors.push({x0:Math.min(x0, x1), x1:Math.max(x0, x1), z0:Math.min(z0, z1), z1:Math.max(z0, z1), h}); }
/* a flight of stairs you walk up as a smooth slope; the steps you see are drawn separately */
export function ramp(x0, x1, z0, z1, axis, a0, a1, h0, h1){ W.ramps.push({x0:Math.min(x0, x1), x1:Math.max(x0, x1), z0:Math.min(z0, z1), z1:Math.max(z0, z1), axis, a0, a1, h0, h1}); }
export function spot(o){
  // defaults are filled in place so that getters (a hint that changes, a door's angle) stay live
  if (o.r == null) o.r = 2.4; if (o.hold == null) o.hold = .35; if (o.y == null) o.y = 1.2;
  W.spots.push(o); return o;
}

/* a wall with holes in it (doors, windows): along x or z, from a to b, between heights y0 and y1. Each piece is
   one flat colour: a contact shadow per piece would show every window as a patch */
export function wall(axis, fixed, a, b, y0, y1, t, color, holes = [], o = {}){
  // the whole wall takes one tone, and every piece reaches 2 mm past each inner cut into its neighbour: where pieces
  // meet there is no hairline crack for whatever is behind to show through, and since the texture is laid by world
  // position and the colour is the same, the overlap draws exactly like one surface
  const j = 1 + (rnd() - .5)*(o.jit == null ? .07 : o.jit), O = Object.assign({ao:false}, o, {jit:0, shade:(o.shade || 1)*j}), e = .002;
  const ai = axis === "x" ? 0 : 2;
  // cut the wall into columns at every hole edge; each column is solid except where some hole passes through it,
  // so holes may share a column (windows stacked up a stairwell) or reach past this storey
  const xs = [...new Set([a, b, ...holes.flatMap(h => [h[0], h[1]])].map(x => Math.max(a, Math.min(b, x))))].sort((p, q) => p - q);
  const cols = [];
  for (let i = 0; i < xs.length - 1; i++){
    const s0 = xs[i], s1 = xs[i + 1], m = (s0 + s1)/2, run = [];
    if (s1 - s0 < .005) continue;
    const cut = holes.filter(h => h[0] < m && h[1] > m).map(h => [Math.max(y0, h[2]), Math.min(y1, h[3])]).filter(h => h[1] > h[0]).sort((p, q) => p[0] - q[0]);
    let y = y0;
    for (const [c0, c1] of cut){ if (c0 - y >= .005) run.push([y, c0]); y = Math.max(y, c1); }
    if (y1 - y >= .005) run.push([y, y1]);
    cols.push({s0, s1, run});
  }
  // the end of a piece is closed only where the next column has a hole beside it (the jamb you see in the opening):
  // anywhere else an end face is seen edge-on right behind a thin skin of paint or paper, wins the depth test along
  // its line and shows through as a dashed seam. A skin (3 cm or less) is never closed at all: its cut edges are
  // always under a lining, an architrave or a window board, where the same thing happens, so a skin is left open
  // along its cuts at the heads and sills of its holes too, and at its two outer ends, which butt into a wall or a
  // lining (o.ends keeps those closed where a skin turns an outside corner: true both, -1 the a end, 1 the b end).
  // o.back (±1) drops the face on that side of the thickness too, where it is buried in the wall behind
  const open = (c, h0, h1) => { let L = [[h0, h1]];
    if (c) for (const [r0, r1] of c.run) L = L.flatMap(([u0, u1]) => r1 <= u0 || r0 >= u1 ? [[u0, u1]] : [[u0, r0], [r1, u1]].filter(([v0, v1]) => v1 - v0 > 1e-4));
    return L; };
  cols.forEach((c, i) => {
    const nLo = cols[i - 1] && cols[i - 1].s1 === c.s0 ? cols[i - 1] : null, nHi = cols[i + 1] && cols[i + 1].s0 === c.s1 ? cols[i + 1] : null;
    for (const [h0, h1] of c.run){
      const p0 = c.s0 > a ? c.s0 - e : c.s0, p1 = c.s1 < b ? c.s1 + e : c.s1, q0 = h0 > y0 ? h0 - e : h0, q1 = h1 < y1 ? h1 + e : h1;
      const g = new THREE.BoxGeometry(p1 - p0, q1 - q0, t);
      if (axis === "z") g.rotateY(-Math.PI/2);
      g.translate(axis === "x" ? (p0 + p1)/2 : fixed, (q0 + q1)/2, axis === "x" ? fixed : (p0 + p1)/2);
      const drop = [nLo && [ai, -1], nHi && [ai, 1], t <= .03 && h0 > y0 && [1, -1], t <= .03 && h1 < y1 && [1, 1],
        t <= .03 && !(o.ends === true || o.ends === -1) && c.s0 === a && [ai, -1], t <= .03 && !(o.ends === true || o.ends === 1) && c.s1 === b && [ai, 1],
        o.back && [2 - ai, o.back]].filter(Boolean);
      addGeo(drop.length ? openEnds(g, drop) : g, color, O);
      for (const [nb, at, sg] of [[nLo, p0, -1], [nHi, p1, 1]]) if (nb && t > .03) for (const [u0, u1] of open(nb, h0, h1)){
        const f = new THREE.PlaneGeometry(t, u1 - u0).rotateY(sg*Math.PI/2);
        if (axis === "z") f.rotateY(-Math.PI/2);
        f.translate(axis === "x" ? at : fixed, (u0 + u1)/2, axis === "x" ? fixed : at);
        addGeo(f, color, O);
      }
      if (o.solid !== false) axis === "x" ? solid(c.s0, c.s1, fixed - t/2, fixed + t/2, h0, h1) : solid(fixed - t/2, fixed + t/2, c.s0, c.s1, h0, h1);
    }
  });
  // a glazed hole (a fifth entry "glass": a shop window, the glass laid in it by whoever cut it) is open to the eye
  // but not to your body: it blocks like the wall round it
  if (o.solid !== false) for (const h of holes) if (h[4] === "glass"){
    const s0 = Math.max(a, h[0]), s1 = Math.min(b, h[1]), q0 = Math.max(y0, h[2]), q1 = Math.min(y1, h[3]);
    if (s1 > s0 && q1 > q0) axis === "x" ? solid(s0, s1, fixed - t/2, fixed + t/2, q0, q1) : solid(fixed - t/2, fixed + t/2, s0, s1, q0, q1);
  }
}
// a box without the faces that look along the given directions: [[axis index (0 x, 1 y, 2 z), sign], ...]
function openEnds(geo, drop){
  const g = geo.toNonIndexed(); geo.dispose();
  const P = g.attributes.position.array, N = g.attributes.normal.array, U = g.attributes.uv.array, p = [], n = [], u = [];
  for (let k = 0; k < P.length/9; k++){
    if (drop.some(([ax, sg]) => N[k*9 + ax]*sg > .5)) continue;
    for (let q = 0; q < 9; q++){ p.push(P[k*9 + q]); n.push(N[k*9 + q]); }
    for (let q = 0; q < 6; q++) u.push(U[k*6 + q]);
  }
  g.dispose();
  const r = new THREE.BufferGeometry();
  r.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); r.setAttribute("normal", new THREE.Float32BufferAttribute(n, 3)); r.setAttribute("uv", new THREE.Float32BufferAttribute(u, 2));
  return r;
}

/* ---------- writing on things ----------
   A printed canvas wider than the preset's texScaleOver (1024) is drawn at P.texScale (half size on Low): the drawing
   function is kept, so a change of preset draws it again at the new scale (rescaleTextures). It always draws in its
   own w x h units. */
const SCALED = new Set();
const texScaleFor = w => { const P = gfxP(); return P && w > (P.texScaleOver || 1024) ? (P.texScale || 1) : 1; };
function drawScaled(t){
  const {lw, lh, draw} = t.userData, s = texScaleFor(lw), c = t.image;
  c.width = Math.max(1, Math.round(lw*s)); c.height = Math.max(1, Math.round(lh*s));
  const g = c.getContext("2d"); g.setTransform(s, 0, 0, s, 0, 0); draw(g, lw, lh); g.setTransform(1, 0, 0, 1, 0, 0);
  t.userData.scale = s;
}
export function textTex(w, h, draw){
  const [c] = canvas(w, h), t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso();
  t.userData.lw = w; t.userData.lh = h; t.userData.draw = draw;
  drawScaled(t);
  if (w > 1024){ SCALED.add(t); t.addEventListener("dispose", () => SCALED.delete(t)); }
  return t;
}
/* a preset changed (quality.js, in-frame): big printed canvases drawn again at the new scale, and every canvas
   texture in the scene given the new anisotropy (both re-upload the picture once) */
export function rescaleTextures(P, scene){
  for (const t of SCALED){ if (texScaleFor(t.userData.lw) !== t.userData.scale){ drawScaled(t); t.needsUpdate = true; } }
  const a = P ? P.anisotropy || 1 : 4, seen = new Set();
  const fix = t => { if (t && t.isCanvasTexture && !seen.has(t)){ seen.add(t); if (t.anisotropy !== a){ t.anisotropy = a; t.needsUpdate = true; } } };
  for (const k in TEX) fix(TEX[k]);
  if (scene) scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) { fix(m.map); fix(m.emissiveMap); } });
}
// a printed sign: one quad (while it stands still and its picture is not redrawn, chunks.js draws it from an atlas
// page together with the others)
export function label(texture, x, y, z, w, h, ry = 0, o = {}){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    mat({map:texture, transparent:!!o.transparent, alphaTest:o.alphaTest || 0, emissive:o.glow ? 0xffffff : 0x000000, emissiveMap:o.glow ? texture : null, emissiveIntensity:o.glow || 0, roughness:o.rough == null ? .7 : o.rough}));
  if (o.glow) m.userData.glow = o.glow;
  m.position.set(x, y, z); m.rotation.y = ry; W.scene.add(m);
  return m;
}
/* many printed panels cut from one texture, as one mesh and one draw call: q = [{x, y, z, w, h, ry, uv:[u0, v0, u1, v1]}]
   (uv measured from the canvas's top left) */
export function labels(texture, q, o = {}){
  const P = [], N = [], U = [], I = [], _v = new THREE.Vector3();
  for (const p of q){
    const c = Math.cos(p.ry || 0), s = Math.sin(p.ry || 0), [u0, v0, u1, v1] = p.uv, n = P.length/3;
    for (const [dx, dy, u, v] of [[-p.w/2, -p.h/2, u0, 1 - v1], [p.w/2, -p.h/2, u1, 1 - v1], [p.w/2, p.h/2, u1, 1 - v0], [-p.w/2, p.h/2, u0, 1 - v0]]){
      _v.set(dx*c, dy, -dx*s); P.push(p.x + _v.x, p.y + _v.y, p.z + _v.z); N.push(s, 0, c); U.push(u, v);
    }
    I.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I);
  const m = new THREE.Mesh(g, mat({map:texture, emissive:o.glow ? 0xffffff : 0x000000, emissiveMap:o.glow ? texture : null, emissiveIntensity:o.glow || 0, roughness:o.rough == null ? .7 : o.rough}));
  m.receiveShadow = true; W.scene.add(m); return m;
}

/* ---------- moving things ---------- */
/* the shared material of a moving part, by colour and options, cached by class (the preset in force picks it): a
   change of preset finds the class it wants and makes it once, and quality.js rematerialize files the remade ones */
const MATC = new Map();
export function lmat(color, o = {}){
  const kind = o.kind || kindOf(Object.assign({color}, o));
  const k = CLS_TAG[matClass({kind})] + "|" + color + JSON.stringify(o);
  let c = MATC.get(k);
  if (!c){ c = mat(Object.assign({color}, o)); c.userData.keep = true; MATC.set(k, c); MATC_KEY.set(c, k); }
  return c;
}
export function part(geo, color, o = {}){
  const m = new THREE.Mesh(geo, o.material || lmat(color, o.mat || {}));
  m.castShadow = !!o.cast; m.receiveShadow = true;
  return m;
}
/* several small geometries, already placed, as one: a door's leaf and its mouldings, or its handles, cost one draw
   call between them instead of one each */
export function mergeGeos(list){
  const A = {position:[], normal:[], uv:[]};
  for (const g0 of list){
    const g = g0.index ? g0.toNonIndexed() : g0;
    for (const k in A) if (g.attributes[k]) for (const v of g.attributes[k].array) A[k].push(v);
    if (g !== g0) g.dispose(); g0.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(A.position, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(A.normal, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(A.uv, 2));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
export const boxGeo = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
export function boxPart(w, h, d, color, x = 0, y = 0, z = 0, o = {}){
  const m = part(new THREE.BoxGeometry(w, h, d), color, o); m.position.set(x, y, z); return m;
}

/* ---------- start and finish a place ---------- */
// fn() at the start of every new place (quality.js resets its adaptive quality and the shadow scheduler)
const BEGIN = [];
export function onBegin(fn){ BEGIN.push(fn); return () => { const i = BEGIN.indexOf(fn); if (i >= 0) BEGIN.splice(i, 1); }; }
export function begin(scene){
  W.scene = scene;
  W.solids.length = 0; W.floors.length = 0; W.ramps.length = 0; W.spots.length = 0; W.anims.length = 0;
  W.lights.length = 0; W.pools.length = 0; W.halos.length = 0; W.mats = {}; W.lit = null; W.ticks = []; W.bikes = []; W.fridges = []; W.store = null; W.stations = {}; W.places = [];
  batches.clear();
  GLOW.pools = GLOW.halos = null; GLOW.dirty = false;
  SG.reset(); resetChunks();
  // the last place's scheduled work goes with it; tasks of kind 'keep' (the 'anims' task that runs W.anims) stay
  SCHED.clear();
  for (const fn of BEGIN) try { fn(); } catch(e){ console.error(e); }
}
export const FLOORS = new Set(["t:grass", "t:pitch", "t:asphalt", "t:slabs", "t:planks", "t:tiles", "t:terrazzo", "t:concrete", "t:path", "t:rubberFloor", "t:turf", "t:carpet", "t:shopfloor", "t:rubber"]);
// the place is built: its batches become chunked, indexed batched meshes, and its signs are packed (chunks.js)
export function finishBatches(){
  finishChunks(batches);
  batches.clear();
}
