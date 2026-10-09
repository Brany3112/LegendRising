/* ============ LIFE: little hands-on jobs ============
   The things you do with your hands that are not a drill: screwing a bulb in, and (jobs.js) the work you do on a
   shift. While one is going the world holds still around you: the mouse and the keys go to it, not to looking about
   or walking. start(spec) runs one; spec is
     {title, hint, html (the card's insides), move(mx, my), down(button), up(button), key(k, down), update(dt), cancel()}
   and it ends when it calls end(result). Esc always gives up (spec.cancel).
   Owner: WP-H (Stage 1), WP-H2 (Stage 2). Contract: DESIGN 3.7.5 (H9: the screw-in hint, word for word). */
export const MINI = {on:null};
const root = () => document.getElementById("lifeMini");

export function startMini(spec){
  if (MINI.on) return null;
  let el = root();
  if (!el){ el = document.createElement("div"); el.id = "lifeMini"; el.className = "lf-mini"; document.getElementById("lifeRoot").appendChild(el); }
  el.innerHTML = `<div class="mg-card${spec.wide ? " wide" : ""}"><div class="mg-head"><b>${spec.title || ""}</b><span>${spec.hint || ""}</span></div><div class="mg-body">${spec.html || ""}</div>
    <div class="mg-foot"><span>${spec.foot || "Esc to stop"}</span></div></div>`;
  el.classList.add("on");
  document.body.classList.add("mini");
  // a job you do with the pointer (clicking things on the card) gives the mouse back to you; Esc then closes it
  if (spec.free && document.exitPointerLock) document.exitPointerLock();
  const M = {spec, el, t:0, done:false,
    end(result){
      if (M.done) return; M.done = true; MINI.on = null;
      el.classList.remove("on"); document.body.classList.remove("mini");
      if (spec.finish) spec.finish(result);
      if (spec.free && window.lifeRelock) setTimeout(() => window.lifeRelock(), 30);
    }};
  MINI.on = M;
  if (spec.init) spec.init(el.querySelector(".mg-body"), M);
  return M;
}
export function miniInput(type, a, b){
  const M = MINI.on; if (!M) return false;
  const s = M.spec;
  if (type === "move" && s.move) s.move(a, b, M);
  if (type === "down" && s.down) s.down(a, M);
  if (type === "up" && s.up) s.up(a, M);
  if (type === "key"){
    if (a === "escape" && b){ if (s.cancel) s.cancel(M); M.end(null); return true; }
    if (s.key) s.key(a, b, M);
  }
  return true;
}
export function miniStep(dt){ const M = MINI.on; if (M && M.spec.update){ M.t += dt; M.spec.update(dt, M); } }

/* ---------- screwing something in: turn the mouse round and round, clockwise ----------
   Every bit of the way your mouse turns clockwise (the direction it moves in swinging round) turns the thing in;
   anticlockwise backs it out a little. Space taps work too, for a trackpad. turns: how many full turns it takes. */
export function screwIn(o){
  const need = (o.turns || 3)*Math.PI*2;
  let got = 0, last = null, spin = 0;
  const draw = M => {
    const b = M.el.querySelector(".mg-body"); if (!b) return;
    const k = Math.min(1, got/need);
    b.querySelector(".sc-ring").style.setProperty("--k", k.toFixed(3));
    b.querySelector(".sc-ico").style.transform = `rotate(${(spin*180/Math.PI).toFixed(1)}deg)`;
    b.querySelector(".sc-pct").textContent = Math.round(k*100) + "%";
  };
  return startMini({title:o.title || "Screw it in", hint:o.hint || "Move the mouse in clockwise circles, or tap Space",
    html:`<div class="sc"><div class="sc-ring"><div class="sc-ico">${o.icon || "💡"}</div></div><div class="sc-pct">0%</div><div class="sc-arrows">↻</div></div>`,
    init:(b, M) => draw(M),
    move(mx, my, M){
      const len = Math.hypot(mx, my); if (len < 2.5) return;
      const a = Math.atan2(my, mx);
      if (last != null){
        let d = a - last; while (d > Math.PI) d -= 2*Math.PI; while (d < -Math.PI) d += 2*Math.PI;
        if (Math.abs(d) < 1.2){ const step = d > 0 ? d : d*.5; got = Math.max(0, got + step); spin += step; if (o.turn) o.turn(got/need, step); draw(M); }
      }
      last = a;
      if (got >= need) M.end(true);
    },
    key(k, down, M){ if (k === " " && down){ got += Math.PI/6; spin += Math.PI/6; if (o.turn) o.turn(got/need, Math.PI/6); draw(M); if (got >= need) M.end(true); } },
    cancel:() => { if (o.cancel) o.cancel(); },
    finish:r => { if (r && o.done) o.done(); }});
}
