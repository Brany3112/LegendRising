/* ============ Football: replays ============
   Owner: WP-F (Stage P2). Contract: DESIGN 1.4.17 (replay.js: recInit, rec, clip, play, keep), 1.3 (the camera owner
   replay, priority 95), 3.4.3 (a 6 s goal replay at the restart from two broadcast cameras, Esc skips it; up to six
   highlight clips on the full-time card).

   A ring of snapshots on simulation time (20 a second, the last 12 seconds): where every body stands, which way it
   faces, how fast it goes, the clip it is in (the view's own state for it), and the ball. A clip is a copy of a stretch
   of the ring; playing it hands the view (view.js viewSource) the snapshot of the moment, interpolated, so the same
   bodies are drawn from the record while the simulation waits, and the camera owner replay frames it: first from high
   on the side of the main stand, then from behind the goal. Nothing in the simulation changes while one plays.
   (The design names CINE for replays; CINE runs as a mode of its own and would end the match mode, so a replay is its
   own camera owner on the stack instead, the one 1.3 gives it.) */
import {camPush, camPop} from "../core/camera.js";
import {viewSource} from "./view.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const R = {hz:20, n:0, size:0, buf:[], head:0, count:0, lastT:-1, kept:[], V:null, play:null};

// the ring: hz snapshots a second for `seconds`
export function recInit(ms, hz = 20, seconds = 12, V = null){
  R.hz = hz; R.size = Math.ceil(hz*seconds); R.buf = new Array(R.size); R.head = 0; R.count = 0; R.lastT = -1; R.kept = []; R.V = V; R.play = null;
  for (let i = 0; i < R.size; i++) R.buf[i] = {t:0, ball:{x:0, y:0, z:0}, ballHidden:false, agents:[]};
}
// one snapshot when it is due (call after each fixed step; cheap when not due)
export function rec(ms){
  if (!R.size || ms.t - R.lastT < 1/R.hz - 1e-6) return;
  R.lastT = ms.t;
  const s = R.buf[R.head];
  s.t = ms.t; s.ball.x = ms.ball.p.x; s.ball.y = ms.ball.p.y; s.ball.z = ms.ball.p.z; s.ballHidden = false;
  const V = R.V, n = ms.agents.length;
  while (s.agents.length < n) s.agents.push({x:0, z:0, y:0, yaw:0, speed:0, on:false, mode:"move", st:null, cid:0});
  s.agents.length = n;
  for (let i = 0; i < n; i++){
    const a = ms.agents[i], q = s.agents[i];
    q.x = a.m.x; q.z = a.m.z; q.y = a.y || 0; q.yaw = a.m.yaw; q.speed = a.m.speed; q.on = !!(a.onPitch || a.leaving) && a.role !== "off";
    const RC = V && V.rec[i];
    const c = RC && RC.clip && RC.clip.mode && RC.clip.mode !== "move" ? RC.clip : null;
    if (c){
      q.mode = c.mode; q.cid = c.id;
      // the clip's own numbers (not its objects' identity): enough to pose it again
      const st = q.st || (q.st = {});
      for (const k in st) st[k] = undefined;
      for (const k of ["mode", "kind", "side", "power", "curl", "lowHigh", "take", "jump", "part", "cushion", "style", "outcome", "at", "run", "groupY"]) if (c[k] !== undefined) st[k] = c[k];
      if (c.plan) st.plan = c.plan;
      if (c.ball) st.ball = {x:c.ball.x, y:c.ball.y, z:c.ball.z};
      if (c.dir) st.dir = typeof c.dir === "object" ? {x:c.dir.x, z:c.dir.z} : c.dir;
      if (c.target) st.target = {x:c.target.x, z:c.target.z};
      st.tc = c.tc != null ? c.tc : 0;
    } else { q.mode = "move"; q.cid = 0; }
  }
  R.head = (R.head + 1) % R.size; R.count = Math.min(R.size, R.count + 1);
}
// a copy of the ring from simulation time t0 to t1 (as much of it as is still there)
export function clip(t0, t1){
  const out = [];
  for (let k = R.count; k >= 1; k--){
    const s = R.buf[(R.head - k + R.size) % R.size];
    if (s.t < t0 - 1e-6 || s.t > t1 + 1e-6) continue;
    out.push({t:s.t, ball:{x:s.ball.x, y:s.ball.y, z:s.ball.z}, ballHidden:false,
      agents:s.agents.map(q => ({x:q.x, z:q.z, y:q.y, yaw:q.yaw, speed:q.speed, on:q.on, mode:q.mode, cid:q.cid, st:q.st && q.mode !== "move" ? Object.assign({}, q.st) : null}))});
  }
  return {frames:out, t0:out.length ? out[0].t : t0, t1:out.length ? out[out.length - 1].t : t1};
}
// keep a clip for the full-time card (at most `max`; the newest kept)
export function keep(c, label, o = {}){
  if (!c || !c.frames.length) return null;
  const k = Object.assign({clip:c, label}, o);
  R.kept.push(k);
  while (R.kept.length > (o.max || 8)) R.kept.shift();
  return k;
}
export const kept = () => R.kept.slice();

/* ---------- playing one ----------
   play(clip, {cams: [{until (0..1 of the clip), pos(ball) -> {x, y, z}, fov}], rate = 1}) -> Promise (true when it
   ran to its end, false when skipped). The controller calls replayStep(dt) every frame while it plays. */
const SRC = {agents:[], ball:{x:0, y:0, z:0}, ballHidden:false};
const OWNER = {id:"replay", priority:95, frame:(dt, cam) => replayCam(cam), fov:() => R.play ? R.play.fov : 50, near:.1};
export function play(c, o = {}){
  stopPlay(false);
  if (!c || c.frames.length < 2) return Promise.resolve(false);
  return new Promise(res => {
    R.play = {c, t:0, dur:c.t1 - c.t0, rate:o.rate || 1, cams:o.cams || [], fov:50, res, look:{x:0, y:0, z:0}};
    camPush(OWNER);
    replayStep(0);
  });
}
export const playing = () => !!R.play;
export function skip(){ stopPlay(false); }
function stopPlay(done){
  const P0 = R.play; if (!P0) return;
  R.play = null;
  camPop("replay");
  if (R.V) viewSource(R.V, null);
  P0.res(done);
}
// one frame of the replay: the snapshot of this moment handed to the view
export function replayStep(dt){
  const P0 = R.play; if (!P0) return;
  P0.t += Math.max(0, dt)*P0.rate;
  if (P0.t >= P0.dur){ stopPlay(true); return; }
  const fr = P0.c.frames, tt = P0.c.t0 + P0.t;
  let i = 0; while (i < fr.length - 2 && fr[i + 1].t < tt) i++;
  const A = fr[i], B = fr[i + 1], k = clamp((tt - A.t)/Math.max(1e-6, B.t - A.t), 0, 1);
  SRC.ball.x = A.ball.x + (B.ball.x - A.ball.x)*k; SRC.ball.y = A.ball.y + (B.ball.y - A.ball.y)*k; SRC.ball.z = A.ball.z + (B.ball.z - A.ball.z)*k;
  const n = A.agents.length;
  while (SRC.agents.length < n) SRC.agents.push({});
  SRC.agents.length = n;
  for (let j = 0; j < n; j++){
    const a = A.agents[j], b = B.agents[j] || a, q = SRC.agents[j];
    q.x = a.x + (b.x - a.x)*k; q.z = a.z + (b.z - a.z)*k; q.y = a.y + (b.y - a.y)*k;
    const dy = ((b.yaw - a.yaw + Math.PI*3)%(Math.PI*2)) - Math.PI;
    q.yaw = a.yaw + dy*k; q.speed = a.speed + (b.speed - a.speed)*k; q.on = a.on;
    const use = k < .5 ? a : b;
    q.mode = use.mode; q.cid = use.cid; q.st = use.st;
  }
  if (R.V) viewSource(R.V, SRC);
  P0.k = P0.t/P0.dur;
  P0.ball = SRC.ball;
}
// the camera of a replay: the shot of this part of the clip, looking at the ball (eased)
function replayCam(cam){
  const P0 = R.play; if (!P0) return;
  const cams = P0.cams, k = P0.k || 0;
  let cs = cams[cams.length - 1];
  for (const c of cams){ if (k <= c.until){ cs = c; break; } }
  if (!cs) return;
  const b = P0.ball || {x:0, y:0, z:0}, p = cs.pos(b);
  const L = P0.look;
  if (P0.lastCam !== cs){ P0.lastCam = cs; L.x = b.x; L.y = b.y; L.z = b.z; }
  L.x += (b.x - L.x)*.2; L.y += (b.y - L.y)*.2; L.z += (b.z - L.z)*.2;
  cam.position.set(p.x, p.y, p.z);
  cam.lookAt(L.x, Math.max(.3, L.y), L.z);
  P0.fov = cs.fov || 40;
}
