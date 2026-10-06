// js/life/football/detmath.js: transcendental functions that give the same bits in every JavaScript engine.
// Owner: WP-C (created with the ball, strike and touch models). Serves determinism rule D6 (DESIGN 0.1) and the
// "same event-log hash in Node versus Chromium" acceptance of 2.3 WP-E (to be added to the module list of 1.2).
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no randomness.
//
// Why: ECMAScript leaves Math.sin, Math.cos, Math.pow, Math.exp, Math.log, Math.atan2, Math.hypot and the rest
// "implementation-approximated", and engines do differ (Node 22 and Chromium 141 disagree in the last bits of sin, cos
// and pow), so a simulation that calls them cannot replay the same match in the harness and in the browser. Everything
// here is built from + - * / and Math.sqrt (all correctly rounded by IEEE 754, so identical everywhere), exact power of
// two scaling through the bits of a double, and polynomials whose coefficients are computed the same way at load.
// Accuracy is within a few units in the last place of the engine's own functions (qa/unit/detmath.mjs).
//
//   import {sin, cos, exp, log, pow, atan2, hypot} from "./detmath.js";

const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
F64[0] = 1;
const HI = U32[1] === 0x3ff00000 ? 1 : 0, LO = 1 - HI;      // which word holds the sign and exponent

export const PI = 3.141592653589793, HALF_PI = 1.5707963267948966;

// 1/n! for the series, computed by repeated division (the same rounding in every engine)
const IF = [1];
for (let n = 1; n <= 26; n++) IF.push(IF[n - 1]/n);

// 2^k as a double, for k in -1022..1023
function pow2(k){
  U32[LO] = 0; U32[HI] = (k + 1023) << 20;
  return F64[0];
}

/* ---------- exp and log ---------- */

// ln 2 split so that k*LN2_HI is exact for any exponent k (fdlibm's ln2_hi and ln2_lo)
const LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10, LOG2E = 1.4426950408889634;

export function exp(x){
  if (x !== x) return NaN;
  if (x > 709.782712893384) return Infinity;
  if (x < -745.1332191019412) return 0;
  const k = Math.floor(x*LOG2E + 0.5);
  const r = (x - k*LN2_HI) - k*LN2_LO;                      // |r| <= 0.35
  // Taylor to r^14/14!: the remainder is under 1e-18 of the result
  let p = IF[14];
  for (let n = 13; n >= 0; n--) p = p*r + IF[n];
  if (k > 1023) return p*pow2(1023)*pow2(k - 1023);
  if (k < -1021) return p*pow2(k + 54)*pow2(-54);
  return p*pow2(k);
}

const SQRT2 = 1.4142135623730951;
// 2/(2k+1) for log's atanh series
const LG = [];
for (let k = 1; k <= 12; k++) LG.push(2/(2*k + 1));

export function log(x){
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  let e = 0;
  if (x < 2.2250738585072014e-308){ x *= 18014398509481984; e = -54; }     // subnormal: scale by 2^54 first
  F64[0] = x;
  const hi = U32[HI];
  e += (hi >>> 20) - 1023;
  U32[HI] = (hi & 0x000fffff) | 0x3ff00000;
  let m = F64[0];                                           // the mantissa in [1, 2)
  if (m > SQRT2){ m *= 0.5; e++; }
  // log(m) = 2 atanh(s) with s = f/(2 + f), f = m - 1 (exact), |s| <= 0.1716: log = f - s(f - R)
  const f = m - 1, s = f/(2 + f), z = s*s;
  let R = LG[11];
  for (let k = 10; k >= 0; k--) R = R*z + LG[k];
  R *= z;
  return (e*LN2_LO + (f - s*(f - R))) + e*LN2_HI;
}

// x^y. Integer exponents up to 64 by repeated squaring; otherwise exp(y log x) for positive x
export function pow(x, y){
  if (y === 0) return 1;
  if (x !== x || y !== y) return NaN;
  if (x === 1) return 1;
  const yi = Math.floor(y);
  if (yi === y && Math.abs(y) <= 64){
    let n = Math.abs(y), b = x, out = 1;
    while (n > 0){ if (n & 1) out *= b; b *= b; n = Math.floor(n/2); }
    return y < 0 ? 1/out : out;
  }
  if (x === 0) return y > 0 ? 0 : Infinity;
  if (x < 0) return yi === y ? (yi%2 ? -1 : 1)*pow(-x, y) : NaN;
  if (x === Infinity) return y > 0 ? Infinity : 0;
  return exp(y*log(x));
}

/* ---------- sin, cos, tan ---------- */

// pi/2 split: the first 33 bits (so n*PIO2_1 is exact for |n| < 2^20) and the rest
const PIO2_1 = 1.57079632673412561417e+00, PIO2_1T = 6.07710050650619224932e-11, TWO_OVER_PI = 0.6366197723675814;

// sin and cos on [-pi/4, pi/4] by their Taylor series (to r^17 and r^18: remainders under 1e-19)
function kSin(r){
  const z = r*r;
  let p = -IF[17];
  p = p*z + IF[15]; p = p*z - IF[13]; p = p*z + IF[11]; p = p*z - IF[9]; p = p*z + IF[7]; p = p*z - IF[5]; p = p*z + IF[3];
  return r - r*z*p;
}
function kCos(r){
  const z = r*r, hz = 0.5*z, w = 1 - hz;
  let p = IF[18];
  p = p*z - IF[16]; p = p*z + IF[14]; p = p*z - IF[12]; p = p*z + IF[10]; p = p*z - IF[8]; p = p*z + IF[6]; p = p*z - IF[4];
  return w + (((1 - w) - hz) - z*z*p);
}
// the quadrant and the reduced argument of x
let RQ = 0;
function reduce(x){
  const n = Math.floor(x*TWO_OVER_PI + 0.5);
  RQ = ((n%4) + 4)%4;
  return (x - n*PIO2_1) - n*PIO2_1T;
}

export function sin(x){
  if (x !== x || x === Infinity || x === -Infinity) return NaN;
  if (Math.abs(x) < 7.450580596923828e-9) return x;
  const r = reduce(x);
  return RQ === 0 ? kSin(r) : RQ === 1 ? kCos(r) : RQ === 2 ? -kSin(r) : -kCos(r);
}
export function cos(x){
  if (x !== x || x === Infinity || x === -Infinity) return NaN;
  if (Math.abs(x) < 7.450580596923828e-9) return 1;
  const r = reduce(x);
  return RQ === 0 ? kCos(r) : RQ === 1 ? -kSin(r) : RQ === 2 ? -kCos(r) : kSin(r);
}
export function tan(x){
  if (x !== x || x === Infinity || x === -Infinity) return NaN;
  const r = reduce(x), s = kSin(r), c = kCos(r);
  return RQ%2 === 0 ? s/c : -c/s;
}

/* ---------- atan, atan2, asin, acos ---------- */

// (-1)^k/(2k+1) for atan's series
const AT = [];
for (let k = 0; k <= 12; k++) AT.push((k%2 ? -1 : 1)/(2*k + 1));

export function atan(x){
  if (x !== x) return NaN;
  if (x === Infinity) return HALF_PI;
  if (x === -Infinity) return -HALF_PI;
  let a = Math.abs(x);
  if (a < 7.450580596923828e-9) return x;
  const inv = a > 1;
  if (inv) a = 1/a;
  // halve the angle twice (tan(t/2) = tan t/(1 + sqrt(1 + tan^2 t))): |a| <= tan(pi/16) = 0.199
  a = a/(1 + Math.sqrt(1 + a*a));
  a = a/(1 + Math.sqrt(1 + a*a));
  const z = a*a;
  let p = AT[12];
  for (let k = 11; k >= 1; k--) p = p*z + AT[k];
  let t = 4*(a + a*z*p);
  if (inv) t = HALF_PI - t;
  return x < 0 ? -t : t;
}

export function atan2(y, x){
  if (x !== x || y !== y) return NaN;
  if (y === 0){
    // the signs of zero, as the standard function
    if (x > 0 || (x === 0 && 1/x > 0)) return y;
    return 1/y < 0 ? -PI : PI;
  }
  if (x === 0) return y > 0 ? HALF_PI : -HALF_PI;
  if (x === Infinity) return y === Infinity ? PI/4 : y === -Infinity ? -PI/4 : y > 0 ? 0 : -0;
  if (x === -Infinity) return y === Infinity ? 3*PI/4 : y === -Infinity ? -3*PI/4 : y > 0 ? PI : -PI;
  if (y === Infinity) return HALF_PI;
  if (y === -Infinity) return -HALF_PI;
  const t = atan(Math.abs(y/x));
  if (x > 0) return y > 0 ? t : -t;
  return y > 0 ? PI - t : t - PI;
}

export function asin(x){
  if (!(x >= -1 && x <= 1)) return NaN;
  return atan2(x, Math.sqrt((1 - x)*(1 + x)));
}
export function acos(x){
  if (!(x >= -1 && x <= 1)) return NaN;
  return atan2(Math.sqrt((1 - x)*(1 + x)), x);
}

/* ---------- lengths ---------- */

// the length of (a, b) or (a, b, c): the plain square root of the sum of squares (Math.hypot's extra care against
// overflow is not needed at the sizes of a pitch, and its result is engine-defined)
export function hypot(a, b, c){
  return c === undefined ? Math.sqrt(a*a + b*b) : Math.sqrt(a*a + b*b + c*c);
}
