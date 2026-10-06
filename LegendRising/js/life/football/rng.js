// js/life/football/rng.js: seeded random numbers for everything deterministic (the match, training, replays).
// Owner: WP-0D (pure foundations), contract DESIGN 1.4.9; determinism rule D6.
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no Math.random. Every random draw in the football
// code comes from a generator made here and passed in as `r`.
//
//   const r = mulberry32(hashStr(key + "|" + cid + "|" + day));
//   r()                    uniform in [0, 1)
//   gauss(r)               standard normal (Box-Muller; the second value of each pair is kept for the next call)
//   truncNormal(r, s)      normal with standard deviation s before truncation, never beyond 2.5 s
//
// mulberry32 and hashStr are the same algorithms as human.js rng() and hashStr (human.js:81-87); qa/unit/rng.mjs
// checks the first 1000 values of each against the originals.

// mulberry32: identical to human.js rng(seed), including the zero seed being replaced by the golden ratio constant
export function mulberry32(seed){
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0)/4294967296;
  };
}

// FNV-1a over UTF-16 code units, identical to human.js hashStr
export const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

// The cached second normal of each generator. Keyed by the generator itself, so two streams never share a value and
// a stream gives the same sequence whether or not another stream was used in between.
const SPARE = new WeakMap();

// a standard normal draw (mean 0, standard deviation 1) by the Box-Muller transform. Each pair of uniforms
// gives two independent normals: the first is returned, the second is kept for this generator's next call.
export function gauss(r){
  const s = SPARE.get(r);
  if (s !== undefined){ SPARE.delete(r); return s; }
  let u = r();
  while (u <= 1e-300) u = r();                 // log(0) guard: r() can return exactly 0
  const v = r(), m = Math.sqrt(-2*Math.log(u)), a = 2*Math.PI*v;
  SPARE.set(r, m*Math.sin(a));
  return m*Math.cos(a);
}

// a normal draw with standard deviation sigma, resampled until it lies within cap*sigma of zero. A shot or pass
// deviation built on it stays near the intent: never beyond 2.5 sigma with the default cap.
export function truncNormal(r, sigma, cap = 2.5){
  if (!(sigma > 0)) return 0;
  if (!(cap > 0)) return 0;
  let z = gauss(r);
  while (Math.abs(z) > cap) z = gauss(r);
  return z*sigma;
}

// the standard deviation of a unit normal truncated at +-cap, from theory: sqrt(1 - 2 c phi(c)/(2 Phi(c) - 1)).
// Used by the unit test and by anyone who wants a truncated sigma to mean a given spread.
export function truncSd(cap = 2.5){
  const phi = Math.exp(-cap*cap/2)/Math.sqrt(2*Math.PI);
  return Math.sqrt(1 - 2*cap*phi/erf(cap/Math.SQRT2));
}

// error function: the Maclaurin series below 2, the continued fraction of erfc above (both to double precision)
function erf(x){
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  if (x < 2){
    // Maclaurin series converges fast for small x
    let term = x, sum = x;
    for (let n = 1; n < 60; n++){ term *= -x*x/n; const add = term/(2*n + 1); sum += add; if (Math.abs(add) < 1e-17) break; }
    return s*2/Math.sqrt(Math.PI)*sum;
  }
  // continued fraction for erfc at larger x
  let f = 0;
  for (let n = 60; n >= 1; n--) f = n/2/(x + f);
  return s*(1 - Math.exp(-x*x)/Math.sqrt(Math.PI)/(x + f));
}
