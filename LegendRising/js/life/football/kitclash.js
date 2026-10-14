// js/life/football/kitclash.js: two kits on one pitch never the same or close colours (USER-ISSUES U11).
// Owner: UF-B (Training Mode and football rework, stage TR-3+U, user fixes). Contract: USER-ISSUES.md U11 (a perceptual
// colour distance, CIEDE2000, on the primary and secondary colours; the away side changes to its alternate kit when
// the two are close, and to a generated contrasting kit when that is still close; both keepers checked against both
// teams and the referee; every match: career, training, full match).
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no Math.random; the maths comes from detmath.js so
// Node and every browser agree to the bit.
//
//   resolveKits({home: [shirt, shorts], away: [shirt, shorts]}) -> {home, away, gk: [homeKeeper, awayKeeper], ref,
//     awayChange: "own" | "alt" | "generated", d: {kits, gk, ref}}
//     colours are any CSS colour the game uses (#rgb, #rrggbb, hsl(), rgb()) or a 0xRRGGBB number; out come "#rrggbb"
//   kitDelta(a, b) -> {shirt, shorts, sum}: the CIEDE2000 distances of two kits
//   kitsClash(a, b) -> true when two outfield kits would be hard to tell apart on the pitch
//   deltaE(c1, c2) -> CIEDE2000 between two colours; de00(lab1, lab2) the same on L*a*b*; lab(c) -> [L, a, b] (D65)

import {pow, atan2, sin, cos, exp, PI} from "./detmath.js";

// the thresholds (CIEDE2000 units: about 2.3 is a just noticeable difference; at 25 and more two colours read as
// different colours at a glance; at 40 and more as different families)
export const KIT_SHIRT_MIN = 30;    // the two shirts, the colour you read a player by
export const KIT_SUM_MIN = 40;      // shirts plus shorts: two kits that only just differ in the shirt must differ in the shorts too
export const GK_MIN = 22;           // a keeper against every outfield colour, the other keeper and the referee
export const REF_MIN = 22;          // the referee against every kit colour and both keepers

/* ---------- colours ---------- */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const hex2 = v => { const s = Math.round(clamp(v, 0, 1)*255).toString(16); return s.length < 2 ? "0" + s : s; };
// [r, g, b] in 0..1 from any colour the game uses (null when it cannot be read)
export function rgb(c){
  if (typeof c === "number" && isFinite(c)) return [((c >> 16) & 255)/255, ((c >> 8) & 255)/255, (c & 255)/255];
  if (Array.isArray(c) && c.length >= 3) return [+c[0], +c[1], +c[2]];
  if (typeof c !== "string") return null;
  const s = c.trim().toLowerCase();
  let m = /^#([0-9a-f]{6})$/.exec(s);
  if (m){ const v = parseInt(m[1], 16); return [((v >> 16) & 255)/255, ((v >> 8) & 255)/255, (v & 255)/255]; }
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  if (m) return [parseInt(m[1] + m[1], 16)/255, parseInt(m[2] + m[2], 16)/255, parseInt(m[3] + m[3], 16)/255];
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(s);
  if (m) return [+m[1]/255, +m[2]/255, +m[3]/255];
  m = /^hsla?\(\s*([\d.]+)(?:deg)?\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/.exec(s);
  if (m){
    const H = (+m[1]%360)/360, S_ = +m[2]/100, L = +m[3]/100;
    const q = L < .5 ? L*(1 + S_) : L + S_ - L*S_, p = 2*L - q;
    const f = t => { t = (t + 1)%1; return t < 1/6 ? p + (q - p)*6*t : t < .5 ? q : t < 2/3 ? p + (q - p)*(2/3 - t)*6 : p; };
    return [f(H + 1/3), f(H), f(H - 1/3)];
  }
  return null;
}
export function hexOf(c){ const v = rgb(c); return v ? "#" + hex2(v[0]) + hex2(v[1]) + hex2(v[2]) : null; }

// sRGB (D65) to CIE L*a*b*
const lin = u => u <= .04045 ? u/12.92 : pow((u + .055)/1.055, 2.4);
const fLab = t => t > 216/24389 ? pow(t, 1/3) : (24389/27*t + 16)/116;
export function lab(c){
  const v = rgb(c); if (!v) return null;
  const r = lin(v[0]), g = lin(v[1]), b = lin(v[2]);
  const X = (.4124564*r + .3575761*g + .1804375*b)/.95047, Y = .2126729*r + .7151522*g + .0721750*b, Z = (.0193339*r + .1191920*g + .9503041*b)/1.08883;
  const fx = fLab(X), fy = fLab(Y), fz = fLab(Z);
  return [116*fy - 16, 500*(fx - fy), 200*(fy - fz)];
}

// CIEDE2000 (Sharma, Wu and Dalal 2005), kL = kC = kH = 1
const DEG = PI/180, P25_7 = 6103515625;     // 25^7
export function deltaE(c1, c2){ const A = lab(c1), B = lab(c2); return A && B ? de00(A, B) : 0; }
// the same on two L*a*b* triples (the published test pairs are given in L*a*b*)
export function de00(A, B){
  const [L1, a1, b1] = A, [L2, a2, b2] = B;
  const C1 = Math.sqrt(a1*a1 + b1*b1), C2 = Math.sqrt(a2*a2 + b2*b2), Cb = (C1 + C2)/2;
  const Cb7 = pow(Cb, 7), G = .5*(1 - Math.sqrt(Cb7/(Cb7 + P25_7)));
  const ap1 = (1 + G)*a1, ap2 = (1 + G)*a2;
  const Cp1 = Math.sqrt(ap1*ap1 + b1*b1), Cp2 = Math.sqrt(ap2*ap2 + b2*b2);
  const hue = (b, a) => { if (a === 0 && b === 0) return 0; const h = atan2(b, a)/DEG; return h < 0 ? h + 360 : h; };
  const hp1 = hue(b1, ap1), hp2 = hue(b2, ap2);
  const dLp = L2 - L1, dCp = Cp2 - Cp1;
  let dhp = 0;
  if (Cp1*Cp2 !== 0){ dhp = hp2 - hp1; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dHp = 2*Math.sqrt(Cp1*Cp2)*sin(dhp*DEG/2);
  const Lbp = (L1 + L2)/2, Cbp = (Cp1 + Cp2)/2;
  let hbp = hp1 + hp2;
  if (Cp1*Cp2 !== 0){ if (Math.abs(hp1 - hp2) > 180) hbp = hbp < 360 ? (hbp + 360)/2 : (hbp - 360)/2; else hbp = hbp/2; }
  const T = 1 - .17*cos((hbp - 30)*DEG) + .24*cos(2*hbp*DEG) + .32*cos((3*hbp + 6)*DEG) - .20*cos((4*hbp - 63)*DEG);
  const dTheta = 30*exp(-((hbp - 275)/25)*((hbp - 275)/25));
  const Cbp7 = pow(Cbp, 7), RC = 2*Math.sqrt(Cbp7/(Cbp7 + P25_7));
  const l50 = (Lbp - 50)*(Lbp - 50), SL = 1 + .015*l50/Math.sqrt(20 + l50), SC = 1 + .045*Cbp, SH = 1 + .015*Cbp*T;
  const RT = -sin(2*dTheta*DEG)*RC;
  const x = dLp/SL, y = dCp/SC, z = dHp/SH;
  return Math.sqrt(x*x + y*y + z*z + RT*y*z);
}
const dE = deltaE;

/* ---------- kits ---------- */
// a kit is [shirt, shorts] (a third entry, the socks, rides along untouched)
const kitOk = k => Array.isArray(k) && rgb(k[0]) && rgb(k[1] != null ? k[1] : k[0]);
const norm = (k, fb) => { const x = kitOk(k) ? k : fb; return [hexOf(x[0]), hexOf(x[1] != null ? x[1] : x[0])].concat(x.length > 2 && rgb(x[2]) ? [hexOf(x[2])] : []); };
export function kitDelta(a, b){
  const shirt = dE(a[0], b[0]), shorts = dE(a[1], b[1]);
  return {shirt, shorts, sum: shirt + shorts};
}
export function kitsClash(a, b){ const d = kitDelta(a, b); return d.shirt < KIT_SHIRT_MIN || d.sum < KIT_SUM_MIN; }

// the generated kits' shirts and shorts, and the keepers' and the referee's usual colours, in the order of preference
const GEN_SHIRTS = ["#f2f2ee", "#15161a", "#f2d53c", "#1fa2c4", "#f07a1a", "#2f9e44", "#d02b2b", "#1d2a6b", "#e84393", "#7a3fb0", "#8a8f96"];
const GEN_SHORTS = ["#f2f2ee", "#15161a", "#1d2a6b"];
const GK_COLS = ["#2f9e44", "#f2c230", "#f07a1a", "#24262b", "#7a3fb0", "#1fa2c4", "#e84393", "#d8ff3a", "#8a8f96", "#f2f2ee", "#d02b2b"];
const REF_COLS = ["#1c1d21", "#f2d53c", "#e84393", "#d8ff3a", "#1fa2c4", "#f07a1a", "#2f9e44", "#7a3fb0", "#8a8f96", "#f2f2ee"];

// the first colour of `cands` at least `min` from every colour in `avoid`; failing that, the one furthest from them
function pickClear(cands, avoid, min){
  let best = cands[0], bd = -1;
  for (const c of cands){
    let m = Infinity; for (const a of avoid) m = Math.min(m, dE(c, a));
    if (m >= min) return {c, d: m};
    if (m > bd){ bd = m; best = c; }
  }
  return {c: best, d: bd};
}
// the shorts for a generated shirt: the away side's own colours first (it stays their kit as far as it can), then
// white, black, navy; the one that reads against the shirt and keeps the pair clear of the home kit
function shortsFor(shirt, own, home){
  const cands = own.concat(GEN_SHORTS);
  let best = null, bs = -1;
  for (const s of cands){
    const self = dE(s, shirt);
    if (self < 25) continue;
    const d = kitDelta(home, [shirt, s]);
    const score = Math.min(d.sum - KIT_SUM_MIN, 40) + Math.min(self, 40)*.25;
    if (d.sum >= KIT_SUM_MIN) return s;
    if (score > bs){ bs = score; best = s; }
  }
  return best || (dE(shirt, "#f2f2ee") > dE(shirt, "#15161a") ? "#f2f2ee" : "#15161a");
}

// the kits of one match, resolved: the home side keeps its kit; the away side wears its own, else its alternate (its
// colours the other way round: the change strip the game's clubs have always had, util.js awayKit), else a generated
// kit in the colour furthest from the home kit. Then each keeper and the referee get a colour clear of all of it.
export function resolveKits(kits = {}){
  const home = norm(kits.home, ["#2c66b8", "#ffffff"]);
  const own = norm(kits.away, ["#c8463a", "#ffffff"]);
  let away = own, awayChange = "own";
  if (kitsClash(home, own)){
    const alt = [own[1], own[0]].concat(own.slice(2));
    if (dE(alt[0], alt[1]) >= 12 && !kitsClash(home, alt)){ away = alt; awayChange = "alt"; }
    else {
      // the generated kit: the shirt furthest from both home colours (ties to the preference order), the shorts to go
      const sh = pickClear(GEN_SHIRTS, [home[0], home[1]], 45).c;
      away = [sh, shortsFor(sh, [own[1], own[0]], home)];
      awayChange = "generated";
    }
  }
  const kitCols = [home[0], home[1], away[0], away[1]];
  // the referee first (black when it can be), then the keepers clear of every kit, the referee and each other
  const ref = pickClear(REF_COLS, kitCols, REF_MIN).c;
  const g0 = pickClear(GK_COLS, kitCols.concat([ref]), GK_MIN).c;
  const g1 = pickClear(GK_COLS, kitCols.concat([ref, g0]), GK_MIN).c;
  const d = {kits: kitDelta(home, away), gk: Math.min(minTo(g0, kitCols.concat([ref, g1])), minTo(g1, kitCols.concat([ref, g0]))), ref: minTo(ref, kitCols.concat([g0, g1]))};
  return {home, away, gk: [g0, g1], ref, awayChange, d};
}
const minTo = (c, list) => { let m = Infinity; for (const x of list) m = Math.min(m, dE(c, x)); return m; };
