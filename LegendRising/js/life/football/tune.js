// js/life/football/tune.js: the tunables of the control zone, the race to the ball, the shield and the tackle. Every
// constant of TRAINING-SPEC section 3 lives here with its starting value, its range and a label, so the admin panel
// (Phase 5, P5-B) can change it at run time; the engine reads TUNE.<KEY>.value at call time, never a copy.
// Owner: P2b-A (Training Mode and football rework, Phase 2b). Contract: BUILD-PLAN Phase 2b "tune.js"; TRAINING-SPEC
// section 3 (formulas and starting values) and Gate G0 (the lead's readings of fatigue, the 50/50 duel and the shield
// challenge).
//
// Pure module (DESIGN 1.2, marked P): no THREE, no DOM, no globals, no Math.random. The values are run time only: they
// are never written into a save (S) and a reload starts from the defaults.
//
//   import {TUNE, tuneGet, tuneSet, tuneReset} from "./tune.js";
//   const k = TUNE.DUEL_K.value;        // or tuneGet('DUEL_K')
//   tuneSet('DUEL_K', 10);              // clamped to the entry's range; returns the value kept
//   tuneReset();                        // every entry back to its default (tuneReset('DUEL_K') for one)

// [key, default, min, max, label]. Groups follow the spec's order.
const LIST = [
  // the stat mapping (attrs.js derive): the spec's Strength, Balance and DefAwareness from the real skills
  ['MAP_STR_POW', 0.75, 0, 1, 'Strength: share of Shot power'],
  ['MAP_STR_JMP', 0.25, 0, 1, 'Strength: share of Jumping'],
  ['MAP_BAL_AGI', 0.4, 0, 1, 'Balance: share of Agility'],
  ['MAP_BAL_CTL', 0.3, 0, 1, 'Balance: share of Ball control'],
  ['MAP_BAL_POW', 0.3, 0, 1, 'Balance: share of Shot power'],
  ['MAP_DEF_INT', 0.6, 0, 1, 'Defensive awareness: share of Interception'],
  ['MAP_DEF_CMP', 0.25, 0, 1, 'Defensive awareness: share of Composure'],
  ['MAP_DEF_TKL', 0.15, 0, 1, 'Defensive awareness: share of Tackling'],

  // first to the ball
  ['DUEL_WIN', 0.15, 0, 0.6, 'Arrivals this close (s) become a 50/50'],
  ['DUEL_K', 8, 2, 30, '50/50: rating points per logistic unit'],
  ['DUEL_LO', 0.05, 0, 0.5, '50/50: lowest win chance'],
  ['DUEL_HI', 0.90, 0.5, 1, '50/50: highest win chance'],
  ['DUEL_LOCK', 0.3, 0, 1.5, 'The loser of a 50/50 cannot touch it for (s)'],
  ['RACE_HORIZON', 3, 0.5, 3, 'How far ahead the race looks (s)'],
  ['CTL_FAR', 3.5, 1, 8, 'A ball this far from its controller is loose (m)'],

  // control zone and first touch
  ['C_CTRL', 0.55, 0, 1, 'Control rating: share of Ball control'],
  ['C_AGI', 0.20, 0, 1, 'Control rating: share of Agility'],
  ['C_CMP', 0.15, 0, 1, 'Control rating: share of Composure'],
  ['C_BAL', 0.10, 0, 1, 'Control rating: share of Balance'],
  ['VC0', 8, 0, 20, 'Comfortable ball speed at rating 0 (m/s)'],
  ['VC1', 10, 0, 20, 'Comfortable ball speed added at rating 1 (m/s)'],
  ['R0', 0.9, 0.3, 2, 'Control radius scale (m)'],
  ['R_A', 0.6, 0, 2, 'Control radius at rating 0 (share)'],
  ['R_B', 0.8, 0, 2, 'Control radius added at rating 1 (share)'],
  ['FS_DIV', 8, 1, 30, 'Radius falls by half this much over the comfortable speed (m/s)'],
  ['FH_Y0', 0.4, 0.1, 1, 'Foot height: full radius below (m)'],
  ['FH_Y1', 1.4, 0.8, 2, 'Highest control by the body; a header above (m)'],
  ['FH_MIN', 0.6, 0.1, 1, 'Radius share at the top of the body'],
  ['FA_MIN', 0.4, 0, 1, 'Radius share with the ball behind (floor)'],
  ['FA_0', 0.7, 0, 1, 'Radius share across the body'],
  ['FA_K', 0.3, 0, 1, 'Radius share the facing adds'],
  ['FF_0', 0.85, 0, 1, 'Radius share out of breath'],
  ['FF_K', 0.15, 0, 1, 'Radius share breath adds'],
  ['Q_C', 1.2, 0, 2, 'Touch quality per control rating'],
  ['Q_V', 0.04, 0, 0.2, 'Touch quality lost per m/s over the comfortable speed'],
  ['Q_P', 0.2, 0, 1, 'Touch quality lost under full pressure'],
  ['Q_B', 0.1, 0, 1, 'Touch quality lost out of breath'],
  ['TD_0', 0.6, 0.2, 1.5, 'Touch distance of a perfect touch (m)'],
  ['TD_K', 0.8, 0, 2, 'Touch distance added by a poor touch (m)'],
  ['HEAVY_Q', 0.3, 0, 1, 'A touch under this quality is heavy'],
  ['RECV_DV', 10, 0, 30, 'A team-mate controls a ball up to this much over the comfortable speed (m/s)'],
  ['INT_DV', 4, 0, 20, 'A player going for a ball controls an interception this much faster (m/s)'],

  // shield
  ['S_STR', 0.45, 0, 1, 'Shield rating: share of Strength'],
  ['S_CTRL', 0.35, 0, 1, 'Shield rating: share of Ball control'],
  ['S_BAL', 0.20, 0, 1, 'Shield rating: share of Balance'],
  ['D_TKL', 0.45, 0, 1, 'Challenge rating: share of Tackling'],
  ['D_STR', 0.30, 0, 1, 'Challenge rating: share of Strength'],
  ['D_DEF', 0.25, 0, 1, 'Challenge rating: share of Defensive awareness'],
  ['SH_K', 8, 2, 30, 'Shield: rating points per logistic unit'],
  ['SH_LO', 0.05, 0, 0.5, 'Shield: lowest chance the defender wins'],
  ['SH_HI', 0.90, 0.5, 1, 'Shield: highest chance the defender wins'],
  ['SH_BEHIND', 0.6, 0, 1, 'Shield: challenge from behind (share)'],
  ['SH_SIDE', 1.0, 0, 1.5, 'Shield: challenge from the side (share)'],
  ['SH_SPEED', 0.6, 0.2, 1, 'Shielding speed (share of jog)'],
  ['SH_BALL', 0.55, 0.3, 1, 'Shielding: the ball this far on the far side (m)'],
  ['SH_B0', 0.5, 0, 5, 'Shielding breath cost a second'],
  ['SH_BK', 0.06, 0, 0.5, 'Extra breath a second per point the defender is stronger'],
  ['SH_NEAR', 2.0, 0.5, 4, 'Shielding counts a defender this close (m)'],
  ['CHAL_R', 0.8, 0.4, 1.5, 'Shield challenge: contact range (m)'],
  ['CHAL_V', 0.5, 0, 3, 'Shield challenge: closing speed toward the ball (m/s)'],
  ['CHAL_GAP', 0.8, 0.1, 3, 'Shield challenge: seconds before the next one'],
  ['CHAL_POKE', 3.0, 0.5, 6, 'Shield challenge: speed the ball is poked loose (m/s)'],
  ['PUSH_RATE', 0.35, 0, 3, 'Pushing from behind: fouls a second after PUSH_T'],
  ['PUSH_T', 3, 0.5, 10, 'Pushing from behind: seconds to the full foul rate'],

  // tackle
  ['TR_0', 0.95, 0.5, 1.5, 'Standing tackle reach at tackling 0 (m)'],
  ['TR_K', 0.25, 0, 1, 'Standing tackle reach added at tackling 99 (m)'],
  ['POKE_DR', 0.10, 0, 0.5, 'A toe poke reaches this much further (m)'],
  ['SL_R0', 1.6, 0.5, 3, 'Slide reach standing (m)'],
  ['SL_RK', 0.9, 0, 3, 'Slide reach added at top speed (m)'],
  ['SL_MU', 0.55, 0.1, 1.5, 'Slide grass friction'],
  ['T_TKL', 0.50, 0, 1, 'Tackle rating: share of Tackling'],
  ['T_STR', 0.25, 0, 1, 'Tackle rating: share of Strength'],
  ['T_DEF', 0.25, 0, 1, 'Tackle rating: share of Defensive awareness'],
  ['CT_CTRL', 0.50, 0, 1, 'Control against a tackle: share of Ball control'],
  ['CT_AGI', 0.30, 0, 1, 'Control against a tackle: share of Agility'],
  ['CT_BAL', 0.20, 0, 1, 'Control against a tackle: share of Balance'],
  ['TK_K', 8, 2, 30, 'Tackle: rating points per logistic unit'],
  ['TK_LO', 0.05, 0, 0.5, 'Tackle: lowest win chance'],
  ['TK_HI', 0.92, 0.5, 1, 'Tackle: highest win chance'],
  ['TM_OK', 0.08, 0, 0.3, 'Tackle timing: perfect within (s)'],
  ['TM_BAD', 0.3, 0.1, 1, 'Tackle timing: worst at (s)'],
  ['TM_MIN', 0.3, 0, 1, 'Tackle timing: share when worst'],
  ['TA_FRONT', 1.0, 0, 1.5, 'Tackle from the front (share)'],
  ['TA_SIDE', 0.9, 0, 1.5, 'Tackle from the side (share)'],
  ['TA_BEHIND', 0.5, 0, 1.5, 'Tackle from behind (share)'],
  ['TF_BEHIND', 0.3, 0, 1, 'Foul chance of a tackle from behind'],
  ['TF_LATE', 0.3, 0, 1, 'Foul chance of a tackle at the worst timing'],
  ['REC_0', 0.45, 0, 2, 'Recovery after a slide (s)'],
  ['REC_K', 0.6, 0, 2, 'Recovery added at agility 0 (s)'],
  ['REC_MISS', 1.6, 1, 4, 'Recovery after a missed slide (times)']
];

export const TUNE = {};
for (const [k, def, min, max, label] of LIST) TUNE[k] = {value: def, def, min, max, label};
Object.freeze(TUNE);   // the entries stay; their values change

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// the value of one tunable (undefined for an unknown key)
export function tuneGet(k){ const e = TUNE[k]; return e ? e.value : undefined; }
// set one tunable, clamped to its range; returns the value kept (undefined for an unknown key or a non-number)
export function tuneSet(k, v){
  const e = TUNE[k], n = +v;
  if (!e || !Number.isFinite(n)) return undefined;
  e.value = clamp(n, e.min, e.max);
  return e.value;
}
// every tunable (or one) back to its default
export function tuneReset(k){
  if (k != null){ const e = TUNE[k]; if (e) e.value = e.def; return; }
  for (const e of Object.values(TUNE)) e.value = e.def;
}
// the keys in their listed order (for a panel)
export const TUNE_KEYS = Object.freeze(LIST.map(x => x[0]));
