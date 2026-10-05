/* ============ LIFE: a shift at work ============
   Clocking in starts the work itself, and you do it: a run of your job's own task, one after another — coffees to
   the ticket at the café, a basket through the till and the right change at the store, the shortest round of drops
   for the courier, members at the sports centre's desk, the free player for the academy's kids, the shot at the
   photo studio, cuts on the beat in the edit suite. Each task scores 0–1 (and, where it is a matter of getting on
   with it, how quickly you did it). The clock moves on by each task's share of the shift — less when you are quick,
   more when you dawdle — so a good worker clocks off early. At the end the score sets the pay (70–125% of the shift's
   rate, plus tips where there are customers) and the job XP (40–140%, a little more for speed). Esc clocks you out
   early, paid for what you did. The tasks get harder as you go up a job's ranks.
   runShift(plan, h): plan from daily.js shiftPlan; h: {pass(mins), minute(), clock(), done(result)}. */
import {startMini} from "./mini.js";

const clamp01 = v => Math.max(0, Math.min(1, v));
const mean = a => a.length ? a.reduce((s, v) => s + v, 0)/a.length : 0;
// how quickly a task was done: at half its par time or quicker, full marks; slower costs, down to a floor
const quick = (t, par) => Math.max(.55, Math.min(1, 1.15 - .3*t/par));
const VERDICT = s => s >= .9 ? ["Perfect", "perfect"] : s >= .7 ? ["Good", "good"] : s >= .45 ? ["OK", "ok"] : ["Poor", "poor"];
const euro = c => "€" + (c/100).toFixed(2);
const NAMES = ["Ioana", "Mihai", "Elena", "Andrei", "Maria", "Radu", "Ana", "Vlad", "Irina", "Dan", "Cristina", "Alex", "Sorin", "Bianca", "Tudor", "Oana", "Paul", "Diana"];
const SURN = ["P.", "M.", "D.", "S.", "C.", "B.", "R.", "T.", "G.", "N."];

export function runShift(plan, h){
  const js = jobState(), id = js.id, G = GAMES[id] || GAMES.cafe, rank = js.r, {job, rank:rk} = myJob();
  const N = Math.max(3, Math.round(plan.hours*G.perHour)), per = plan.hours*60/N;
  let seed = ((window.__jobSeed != null ? window.__jobSeed : Date.now()) & 0x7fffffff) >>> 0;
  const R = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed/4294967296; };
  const st = {i:0, scores:[], mins:0, tips:0, taskT:0, cur:null, over:false, result:null, start:h.minute(), wait:false};
  let body = null, M = null;
  const $ = s => body.querySelector(s);
  const paySoFar = () => Math.round(plan.pay*(st.scores.length/N)*(.7 + .55*mean(st.scores)) + st.tips);
  const head = () => {
    $(".jb-n").innerHTML = `<b>${Math.min(st.i + 1, N)}</b> / ${N} ${G.unit}`;
    $(".jb-clock").textContent = h.clock();
    const q = mean(st.scores);
    $(".jb-perf i").style.width = (st.scores.length ? q*100 : 0).toFixed(0) + "%";
    $(".jb-perf b").textContent = st.scores.length ? `${Math.round(q*100)}%` : "–";
    $(".jb-pay").textContent = `€${paySoFar()}`;
  };
  const next = () => {
    if (M.done) return;
    if (st.i >= N || h.minute() >= 23*60) return wrap(st.i < N);
    st.taskT = 0; st.wait = false;
    const area = $(".jb-area"); area.innerHTML = ""; $(".jb-ask").innerHTML = ""; $(".jb-verdict").className = "jb-verdict";
    st.cur = G.task(area, {rank, R, i:st.i, ask:html => { $(".jb-ask").innerHTML = html; }, done:(score, x) => taskDone(score, x || {})});
    head();
  };
  const taskDone = (score, x) => {
    if (!st.cur || st.wait) return;
    const cur = st.cur, par = cur.par || 6, t = x.t != null ? x.t : st.taskT, timed = cur.timed !== false;
    const s = clamp01(timed ? score*quick(t, par) : score);
    st.wait = true;
    st.scores.push(s);
    // the clock: this task's share of the shift, less for quick work, more for slow
    const mins = per*(timed ? Math.max(.7, Math.min(1.35, .55 + .45*t/par)) : 1);
    st.mins += mins; h.pass(mins);
    let tip = 0;
    if (G.tips && s >= .85){ tip = Math.round(plan.pay/N*(.15 + .2*R())*100)/100; st.tips += tip; }
    const [v, cls] = VERDICT(s), vd = $(".jb-verdict");
    vd.innerHTML = `<b>${v}</b>${x.why ? `<span>${x.why}</span>` : ""}${tip ? `<em>+€${tip.toFixed(2)} tip</em>` : ""}`;
    vd.className = `jb-verdict on ${cls}`;
    head();
    setTimeout(() => { st.cur = null; st.i++; next(); }, x.hold || 850);
  };
  // the shift's account: what you did, how well, what it pays
  const settle = early => {
    const done = st.scores.length, q = mean(st.scores), frac = done/N;
    const pay = done ? Math.max(1, Math.round(plan.pay*frac*(.7 + .55*q) + st.tips)) : 0;
    const speed = done ? Math.max(.85, Math.min(1.2, per*done/Math.max(1, st.mins))) : 1;
    const xp = plan.xp && done ? Math.max(1, Math.round(plan.xp*frac*(.4 + q)*speed)) : 0;
    st.result = {done, N, q, pay, tips:Math.round(st.tips), xp, mins:st.mins, hours:st.mins/60, nominal:plan.hours*60, early, speed, start:st.start, end:h.minute(), unit:G.unit};
    return st.result;
  };
  const wrap = closing => {
    st.over = true; st.cur = null;
    const r = settle(false), [v, cls] = VERDICT(r.q), diff = Math.round(r.nominal - r.mins);
    const grade = r.q >= .9 ? "A great shift" : r.q >= .7 ? "A good shift" : r.q >= .45 ? "A steady shift" : "A rough shift";
    $(".jb-task").innerHTML = `<div class="jb-res">
      <div class="jb-grade ${cls}">${grade}</div>
      <div class="jb-rows">
        <div><span>${G.unit[0].toUpperCase() + G.unit.slice(1)}</span><b>${r.done} / ${r.N}</b></div>
        <div><span>Performance</span><b>${Math.round(r.q*100)}% · ${v}</b></div>
        <div><span>Clocked</span><b>${fmtTime(r.start)} → ${fmtTime(r.end)}</b><em>${closing ? "closing time" : diff > 4 ? `${diff} min early — quick work` : diff < -4 ? `${-diff} min over` : "right on time"}</em></div>
        <div><span>Pay</span><b>€${r.pay}</b><em>${r.tips ? `with €${r.tips} in tips` : `${Math.round((.7 + .55*r.q)*100)}% of the rate`}</em></div>
        <div><span>Job XP</span><b>${r.xp ? "+" + r.xp : "—"}</b><em>${r.xp ? (r.speed > 1.03 ? "a bonus for speed" : "") : "top of the ladder"}</em></div>
      </div>
      <button class="btn jb-off">Clock off <kbd>Enter</kbd></button></div>`;
    $(".jb-off").addEventListener("click", () => M.end(true));
    head(); $(".jb-n").innerHTML = `<b>${r.done}</b> / ${N} ${G.unit}`;
  };
  M = startMini({title:G.title, hint:G.hint(rank), wide:true, free:true, foot:"Esc — clock out early (you're paid for what you've done)",
    html:`<div class="jb">
      <div class="jb-top"><span class="jb-ico">${job.icon}</span><div class="jb-who"><b>${job.name}</b><span>${rk.name}</span></div>
        <div class="jb-stats"><span class="jb-n"></span><span class="jb-clock"></span><span class="jb-perf"><span><i></i></span><b></b></span><span class="jb-pay"></span></div></div>
      <div class="jb-task"><div class="jb-ask"></div><div class="jb-area"></div><div class="jb-verdict"></div></div></div>`,
    init(b, m){ body = b; M = m; next(); },
    update(dt){ if (!st.over && st.cur && !st.wait){ st.taskT += dt; if (st.cur.update) st.cur.update(dt); } },
    key(k, down){
      if (st.over){ if (down && (k === "enter" || k === " " || k === "e")) M.end(true); return; }
      if (st.cur && !st.wait && st.cur.key) st.cur.key(k, down);
    },
    up(){ if (st.cur && st.cur.release) st.cur.release(); },
    cancel(){ if (!st.result) settle(true); },
    finish(){ if (!st.result) settle(true); h.done(st.result); }});
  if (!M) return null;
  window.__job = {st, M, get cur(){ return st.cur; }};
  return M;
}

/* ================= the jobs ================= */
const GAMES = {
  /* ---------- the café: the order on the ticket ---------- */
  cafe:{title:"Corner Café", unit:"orders", perHour:3, tips:true,
    hint:r => r < 2 ? "Pull the shots (stop the needle in the green), hold to pour and let go at the line, then serve" : "Make what's on the ticket — you know the recipes by heart now",
    task(area, o){
      const MENU = [
        {n:"Espresso", shots:1, txt:"1 shot"}, {n:"Double espresso", shots:2, txt:"2 shots"},
        {n:"Americano", shots:1, pour:"water", fill:.85, txt:"1 shot · hot water to the line"},
        {n:"Latte", shots:1, pour:"milk", fill:.9, txt:"1 shot · steamed milk to the line"},
        {n:"Cappuccino", shots:1, pour:"milk", fill:.62, foam:true, txt:"1 shot · milk to the line · foam on top"},
        {n:"Flat white", shots:2, pour:"milk", fill:.72, txt:"2 shots · milk to the line"}];
      const pool = o.rank === 0 ? MENU.slice(0, 3) : MENU, d = pool[Math.floor(o.R()*pool.length)];
      o.ask(`<b>${NAMES[Math.floor(o.R()*NAMES.length)]}:</b> “${d.n}, please.”${o.rank < 2 ? `<em>${d.txt}</em>` : ""}`);
      const SHOT = .14, zw = [.26, .2, .15][o.rank], zc = .3 + o.R()*.4, sp = [2.6, 3.2, 3.8][o.rank];
      area.innerHTML = `<div class="cf">
        <div class="cf-cup"><div class="cf-liq"></div><i class="cf-line"></i><div class="cf-foam"></div><span class="cf-spill">Spilt!</span></div>
        <div class="cf-side">
          <div class="cf-meter"><i class="cf-zone" style="left:${(zc - zw/2)*100}%;width:${zw*100}%"></i><i class="cf-needle"></i><span>Pull a shot, then stop the needle in the green</span></div>
          <div class="cf-btns">
            <button data-a="shot">☕ Pull a shot <kbd>Space</kbd></button><button data-a="foam">☁ Foam</button>
            <button data-a="water">💧 Hot water <small>hold</small></button><button data-a="milk">🥛 Steamed milk <small>hold</small></button>
            <button data-a="bin" class="bin">Start again</button><button data-a="serve" class="go">Serve <kbd>Enter</kbd></button>
          </div></div></div>`;
      const q = s => area.querySelector(s);
      if (d.pour) q(".cf-line").style.bottom = (d.fill*100) + "%"; else q(".cf-line").style.display = "none";
      let shots = [], pour = null, level = 0, foam = false, pouring = null, pulling = false, ph = 0;
      const draw = () => {
        const base = Math.min(level, shots.length*SHOT), top = Math.min(1.08, level);
        const col = pour === "milk" ? "#d6b089" : pour === "water" ? "#5a3520" : pour === "mixed" ? "#8a6a52" : "#3a2216";
        q(".cf-liq").style.height = (Math.min(1, top)*100) + "%";
        q(".cf-liq").style.background = `linear-gradient(to top, #2a170d 0, #2a170d ${base/Math.max(.01, top)*100}%, ${col} ${base/Math.max(.01, top)*100}%, ${col} 100%)`;
        q(".cf-foam").style.bottom = (Math.min(1, top)*100) + "%"; q(".cf-foam").classList.toggle("on", foam);
        q(".cf-spill").classList.toggle("on", level > 1.02);
      };
      const meter = on => { pulling = on; q(".cf-meter").classList.toggle("on", on); };
      const shot = () => {
        if (!pulling){ if (shots.length >= 3) return; meter(true); ph = o.R()*6; return; }
        const pos = .5 + .5*Math.sin(ph);
        shots.push(clamp01(1 - Math.abs(pos - zc)/(zw/2)));
        level = Math.max(level, 0) + SHOT; meter(false); draw();
      };
      const serve = () => {
        if (pulling) return;
        const sc = shots.length === d.shots ? 1 : Math.abs(shots.length - d.shots) === 1 ? .4 : 0;
        const sq = shots.length ? mean(shots) : 0;
        const pt = d.pour ? (pour === d.pour ? 1 : 0) : (pour ? 0 : 1);
        const fl = d.pour ? clamp01(1 - Math.abs(level - d.fill)/.16) : (pour ? 0 : 1);
        const fm = !!d.foam === foam ? 1 : .4;
        let s = .3*sc + .15*sq + .2*pt + .25*fl + .1*fm; if (level > 1.02) s *= .6;
        const why = sc < 1 ? `${shots.length} shot${shots.length === 1 ? "" : "s"} — it wanted ${d.shots}` : pt < 1 ? (d.pour ? `that wasn't ${d.pour === "milk" ? "milk" : "water"}` : "it didn't want topping up") : fl < .7 ? (level > d.fill ? "too full" : "not full enough") : sq < .5 ? "a bitter shot" : "";
        o.done(s, {why});
      };
      area.querySelectorAll(".cf-btns button").forEach(b => {
        const a = b.dataset.a;
        if (a === "water" || a === "milk"){
          b.addEventListener("pointerdown", e => { e.preventDefault(); if (pulling) return; pouring = a; b.classList.add("hold"); });
          const stop = () => { pouring = null; b.classList.remove("hold"); };
          b.addEventListener("pointerup", stop); b.addEventListener("pointerleave", stop);
        } else b.addEventListener("click", () => {
          if (a === "shot") shot(); else if (a === "serve") serve(); else if (a === "foam"){ if (!pulling){ foam = true; draw(); } }
          else if (a === "bin"){ shots = []; pour = null; level = 0; foam = false; meter(false); draw(); }
        });
      });
      q(".cf-meter").addEventListener("click", () => { if (pulling) shot(); });
      draw();
      return {par:[10, 9, 8][o.rank],
        update(dt){
          if (pulling){ ph += dt*sp; q(".cf-needle").style.left = ((.5 + .5*Math.sin(ph))*100) + "%"; }
          if (pouring){ level = Math.max(level, shots.length*SHOT) + .36*dt; pour = pour && pour !== pouring ? "mixed" : pouring; draw(); }
        },
        key(k, down){ if (!down) return; if (k === " ") shot(); else if (k === "enter") serve(); },
        release(){ pouring = null; area.querySelectorAll(".cf-btns .hold").forEach(b => b.classList.remove("hold")); },
        get state(){ return {d, shots, pour, level, foam, pulling, zc, zw}; }};
    }},

  /* ---------- the store: through the till, and the right change ---------- */
  store:{title:"Neighbourhood Store · the till", unit:"customers", perHour:2.5, tips:false,
    hint:r => r ? "Scan everything, then count out the change — the till won't do the sum for you" : "Click each item to scan it, then count out the change shown",
    task(area, o){
      const GOODS = [["Bread", "🍞", 120], ["Milk", "🥛", 95], ["Eggs", "🥚", 235], ["Apples", "🍎", 180], ["Cheese", "🧀", 345], ["Pasta", "🍝", 115], ["Coffee", "☕", 460], ["Juice", "🧃", 165],
        ["Crisps", "🥔", 105], ["Chocolate", "🍫", 85], ["Rice", "🍚", 190], ["Tomatoes", "🍅", 210], ["Soap", "🧼", 140], ["Water", "💧", 60], ["Biscuits", "🍪", 125], ["Yoghurt", "🥣", 75]];
      const n = [3, 4, 5][o.rank] + (o.R() < .5 ? 1 : 0), bag = [];
      const left = GOODS.slice(); for (let i = 0; i < n; i++) bag.push(left.splice(Math.floor(o.R()*left.length), 1)[0]);
      const total = bag.reduce((s, g) => s + g[2], 0), note = [500, 1000, 2000, 5000].find(v => v > total) || 10000, due = note - total;
      o.ask(`<b>${NAMES[Math.floor(o.R()*NAMES.length)]}</b> puts ${n} things on the belt.`);
      area.innerHTML = `<div class="till">
        <div class="tl-belt">${bag.map((g, i) => `<button class="tl-item" data-i="${i}"><i>${g[1]}</i><b>${g[0]}</b><span>${euro(g[2])}</span></button>`).join("")}</div>
        <div class="tl-till"><div class="tl-scr"><span>Total</span><b class="tl-total">€0.00</b></div><div class="tl-paid"></div></div>
        <div class="tl-change"><div class="tl-coins">${[1000, 500, 200, 100, 50, 20, 10, 5].map(v => `<button data-v="${v}" class="${v >= 500 ? "note" : "coin"}">${v >= 100 ? "€" + v/100 : v + "c"}</button>`).join("")}</div>
          <div class="tl-tray"><span>Change</span><b class="tl-given">€0.00</b><button class="tl-clear">Clear</button><button class="go tl-give">Give change <kbd>Enter</kbd></button></div></div></div>`;
      const q = s => area.querySelector(s);
      let scanned = 0, sum = 0, given = 0, phase = "scan";
      const ready = () => {
        phase = "change"; area.querySelector(".till").classList.add("pay");
        q(".tl-paid").innerHTML = `Paid with a <b>${euro(note)}</b> note${o.rank === 0 ? ` · change due <b>${euro(due)}</b>` : ""}`;
      };
      area.querySelectorAll(".tl-item").forEach(b => b.addEventListener("click", () => {
        if (b.classList.contains("done")) return;
        b.classList.add("done"); scanned++; sum += bag[+b.dataset.i][2]; q(".tl-total").textContent = euro(sum);
        q(".tl-scr").classList.remove("beep"); void q(".tl-scr").offsetWidth; q(".tl-scr").classList.add("beep");
        if (scanned === n) ready();
      }));
      area.querySelectorAll(".tl-coins button").forEach(b => b.addEventListener("click", () => { if (phase !== "change") return; given += +b.dataset.v; q(".tl-given").textContent = euro(given); }));
      q(".tl-clear").addEventListener("click", () => { given = 0; q(".tl-given").textContent = euro(0); });
      const give = () => {
        if (phase !== "change") return;
        const off = Math.abs(given - due);
        o.done(off === 0 ? 1 : clamp01(1 - off/50)*.6, {why:off === 0 ? "" : `${given > due ? "too much" : "short"} by ${euro(off)} — it was ${euro(due)}`});
      };
      q(".tl-give").addEventListener("click", give);
      return {par:4 + 1.1*n + (o.rank ? 6 : 4), key(k, down){ if (down && k === "enter") give(); }, get state(){ return {bag, total, note, due, given, phase}; }};
    }},

  /* ---------- the courier: the shortest round of drops ---------- */
  courier:{title:"City Courier · dispatch", unit:"runs", perHour:2, tips:false,
    hint:r => "Click the drops in the order you'll ride them — the shortest round trip back to the depot is the best run",
    task(area, o){
      const C = 8, Rw = 5, W0 = 560, H0 = 300, gx = i => 40 + i*(W0 - 80)/(C - 1), gy = j => 30 + j*(H0 - 60)/(Rw - 1);
      const depot = {x:0, y:Rw - 1}, k = [3, 4, 5][o.rank], stops = [];
      while (stops.length < k){
        const s = {x:Math.floor(o.R()*C), y:Math.floor(o.R()*Rw)};
        if ((s.x === depot.x && s.y === depot.y) || stops.some(t => Math.abs(t.x - s.x) + Math.abs(t.y - s.y) < 2)) continue;
        s.id = "ABCDEF"[stops.length]; stops.push(s);
      }
      const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      const len = r => { let d = 0, p = depot; for (const s of r){ d += dist(p, s); p = s; } return d + dist(p, depot); };
      // the best: every order tried (five drops is 120 of them)
      let best = Infinity; const perm = (a, i) => { if (i === a.length){ best = Math.min(best, len(a)); return; } for (let j = i; j < a.length; j++){ [a[i], a[j]] = [a[j], a[i]]; perm(a, i + 1); [a[i], a[j]] = [a[j], a[i]]; } };
      perm(stops.slice(), 0);
      o.ask(`${k} parcels to drop. Plan the run.`);
      area.innerHTML = `<div class="cr"><canvas width="${W0}" height="${H0}"></canvas><div class="cr-foot"><span class="cr-len">Route: 0 blocks</span><button class="cr-undo">Undo</button></div></div>`;
      const cv = area.querySelector("canvas"), g = cv.getContext("2d"), route = [];
      let shown = null;
      const draw = () => {
        g.fillStyle = "#1c2a24"; g.fillRect(0, 0, W0, H0);
        g.fillStyle = "#2c3d35";
        for (let i = 0; i < C - 1; i++) for (let j = 0; j < Rw - 1; j++) g.fillRect(gx(i) + 7, gy(j) + 7, gx(i + 1) - gx(i) - 14, gy(j + 1) - gy(j) - 14);
        g.strokeStyle = "#55665e"; g.lineWidth = 2;
        for (let i = 0; i < C; i++){ g.beginPath(); g.moveTo(gx(i), gy(0)); g.lineTo(gx(i), gy(Rw - 1)); g.stroke(); }
        for (let j = 0; j < Rw; j++){ g.beginPath(); g.moveTo(gx(0), gy(j)); g.lineTo(gx(C - 1), gy(j)); g.stroke(); }
        const path = (r, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.lineJoin = "round"; g.beginPath(); let p = depot; g.moveTo(gx(p.x), gy(p.y));
          for (const s of r){ g.lineTo(gx(s.x), gy(p.y)); g.lineTo(gx(s.x), gy(s.y)); p = s; } g.stroke(); };
        if (shown) path(shown.concat([depot]), "rgba(200,240,96,.55)", 9);
        path(route.length === k ? route.concat([depot]) : route, "#6fb4ff", 4);
        g.fillStyle = "#1d6fc4"; g.fillRect(gx(depot.x) - 13, gy(depot.y) - 13, 26, 26);
        g.fillStyle = "#fff"; g.font = "bold 13px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("HQ", gx(depot.x), gy(depot.y) + 1);
        for (const s of stops){
          const n = route.indexOf(s);
          g.fillStyle = n >= 0 ? "#f2a43a" : "#e2e7ea"; g.beginPath(); g.arc(gx(s.x), gy(s.y), 13, 0, 7); g.fill();
          g.fillStyle = "#14202c"; g.font = "bold 13px sans-serif"; g.fillText(n >= 0 ? String(n + 1) : s.id, gx(s.x), gy(s.y) + 1);
        }
        area.querySelector(".cr-len").textContent = `Route: ${route.length ? len(route) - (route.length < k ? dist(route[route.length - 1], depot) : 0) : 0} blocks${route.length === k ? ` · back to HQ: ${len(route)}` : ""}`;
      };
      const finish = () => {
        const mine = len(route), s = best/mine; shown = null;
        if (mine > best){
          // show the better way round
          let br = null; const pp = (a, i) => { if (i === a.length){ if (len(a) === best && !br) br = a.slice(); return; } for (let j = i; j < a.length; j++){ [a[i], a[j]] = [a[j], a[i]]; pp(a, i + 1); [a[i], a[j]] = [a[j], a[i]]; } };
          pp(stops.slice(), 0); shown = br;
        }
        draw();
        o.done(s, {why:mine === best ? `${mine} blocks — the shortest way round` : `${mine} blocks — ${best} was possible`, hold:1300});
      };
      cv.addEventListener("click", e => {
        if (route.length === k) return;
        const b = cv.getBoundingClientRect(), mx = (e.clientX - b.left)*W0/b.width, my = (e.clientY - b.top)*H0/b.height;
        const s = stops.find(t => Math.hypot(gx(t.x) - mx, gy(t.y) - my) < 20); if (!s) return;
        if (route.includes(s)){ if (route[route.length - 1] === s) route.pop(); draw(); return; }
        route.push(s); draw();
        if (route.length === k) finish();
      });
      area.querySelector(".cr-undo").addEventListener("click", () => { if (route.length < k){ route.pop(); draw(); } });
      draw();
      return {par:5 + 2*k, get state(){ return {stops, best, route, gx, gy, cv}; }, pick:i => { const s = stops[i], b = cv.getBoundingClientRect(); cv.dispatchEvent(new MouseEvent("click", {clientX:b.left + gx(s.x)*b.width/W0, clientY:b.top + gy(s.y)*b.height/H0})); }};
    }},

  /* ---------- the sports centre: the front desk ---------- */
  gym:{title:"Sports Centre · front desk", unit:"members", perHour:4, tips:false,
    hint:r => "Check each card: out of date — renew first; Basic is the gym floor only, classes and the pool are Gold",
    task(area, o){
      const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const today = new Date(2026, 9, 8 + Math.floor(o.R()*16)), gold = o.R() < .45;
      const off = o.R() < .28 ? -1 - Math.floor(o.R()*9) : Math.floor(o.R()*21), exp = new Date(today); exp.setDate(exp.getDate() + off);
      const want = [["the gym floor", "floor"], ["the gym floor", "floor"], ["a spin class", "class"], ["a swim", "pool"]][Math.floor(o.R()*4)];
      const answer = off < 0 ? "renew" : want[1] !== "floor" && !gold ? "gold" : "in";
      const name = `${NAMES[Math.floor(o.R()*NAMES.length)]} ${SURN[Math.floor(o.R()*SURN.length)]}`, hue = Math.floor(o.R()*360);
      const fmt = d => `${d.getDate()} ${MON[d.getMonth()]}`;
      o.ask(`“Hi — here for ${want[0]}.”`);
      area.innerHTML = `<div class="dk-desk">
        <div class="dk-card ${gold ? "gold" : ""}"><div class="dk-av" style="background:hsl(${hue},45%,42%)">${name.split(" ").map(w => w[0]).join("")}</div>
          <div class="dk-info"><b>${name}</b><span class="dk-plan">${gold ? "GOLD" : "BASIC"} MEMBER</span><span>Valid until <b>${fmt(exp)}</b></span></div></div>
        <div class="dk-today">Today<b>${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][today.getDay()]} ${fmt(today)}</b>${o.rank === 0 ? `<small>Basic: gym floor · Gold: classes and the pool · out of date: renew</small>` : ""}</div>
        <div class="dk-btns"><button data-a="in">Let them in <kbd>1</kbd></button><button data-a="renew">Renew first <kbd>2</kbd></button><button data-a="gold">Needs Gold <kbd>3</kbd></button></div></div>`;
      const pickA = a => o.done(a === answer ? 1 : 0, {why:a === answer ? "" : answer === "renew" ? `the card ran out on ${fmt(exp)}` : answer === "gold" ? `${want[0].replace(/^a |^the /, "")} is Gold only` : "they were fine to go in"});
      area.querySelectorAll(".dk-btns button").forEach(b => b.addEventListener("click", () => pickA(b.dataset.a)));
      return {par:[4.5, 4, 3.5][o.rank], key(k, down){ if (down && ["1", "2", "3"].includes(k)) pickA(["in", "renew", "gold"][+k - 1]); }, get state(){ return {answer}; }, pickA};
    }},

  /* ---------- the academy: who's free? ---------- */
  academy:{title:"Youth Academy · the session", unit:"drills", perHour:4, tips:false,
    hint:r => "The kid with the ball needs a pass: click the teammate who's free — nobody near them, nobody in the way",
    task(area, o){
      const W0 = 560, H0 = 320, nR = [3, 4, 5][o.rank];
      let blues, reds, free;
      const segD = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, t = clamp01(((p.x - a.x)*dx + (p.y - a.y)*dy)/(dx*dx + dy*dy)); return Math.hypot(p.x - a.x - t*dx, p.y - a.y - t*dy); };
      const isFree = b => reds.every(r => Math.hypot(r.x - b.x, r.y - b.y) > 56 && segD(r, blues[0], b) > 24);
      for (let n = 0; n < 400; n++){
        const pts = [], ok = p => pts.every(q => Math.hypot(q.x - p.x, q.y - p.y) > 44);
        while (pts.length < 5 + nR){ const p = {x:40 + o.R()*(W0 - 80), y:30 + o.R()*(H0 - 60)}; if (ok(p)) pts.push(p); }
        blues = pts.slice(0, 5); reds = pts.slice(5);
        const f = blues.slice(1).filter(isFree);
        if (f.length === 1){ free = f[0]; break; }
      }
      o.ask("Find the free player.");
      area.innerHTML = `<div class="ac"><canvas width="${W0}" height="${H0}"></canvas></div>`;
      const cv = area.querySelector("canvas"), g = cv.getContext("2d");
      let picked = null;
      const draw = () => {
        g.fillStyle = "#2f7d4a"; g.fillRect(0, 0, W0, H0);
        for (let i = 0; i < 8; i++){ g.fillStyle = i % 2 ? "#2b7444" : "#317f4c"; g.fillRect(i*W0/8, 0, W0/8, H0); }
        g.strokeStyle = "rgba(255,255,255,.7)"; g.lineWidth = 2; g.strokeRect(12, 12, W0 - 24, H0 - 24);
        g.beginPath(); g.moveTo(W0/2, 12); g.lineTo(W0/2, H0 - 12); g.stroke(); g.beginPath(); g.arc(W0/2, H0/2, 40, 0, 7); g.stroke();
        if (picked){ const ok = picked === free; g.strokeStyle = ok ? "#c8f060" : "#ff5a4a"; g.lineWidth = 4; g.setLineDash(ok ? [] : [8, 6]); g.beginPath(); g.moveTo(blues[0].x, blues[0].y); g.lineTo(picked.x, picked.y); g.stroke(); g.setLineDash([]);
          if (!ok){ g.strokeStyle = "#c8f060"; g.lineWidth = 3; g.beginPath(); g.arc(free.x, free.y, 21, 0, 7); g.stroke(); } }
        for (const r of reds){ g.fillStyle = "#d8432f"; g.beginPath(); g.arc(r.x, r.y, 13, 0, 7); g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 2; g.stroke(); }
        blues.forEach((b, i) => { g.fillStyle = "#2c66b8"; g.beginPath(); g.arc(b.x, b.y, 13, 0, 7); g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 2; g.stroke();
          g.fillStyle = "#fff"; g.font = "bold 12px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(i + 6), b.x, b.y + 1); });
        g.fillStyle = "#fff"; g.beginPath(); g.arc(blues[0].x + 14, blues[0].y + 10, 6, 0, 7); g.fill(); g.strokeStyle = "#14202c"; g.lineWidth = 1.5; g.stroke();
      };
      const choose = (b, t) => { if (picked) return; picked = b; draw(); o.done(b === free ? 1 : 0, {t, why:b === free ? "" : "that pass gets cut out", hold:1100}); };
      let T = 0;
      cv.addEventListener("click", e => {
        const bb = cv.getBoundingClientRect(), mx = (e.clientX - bb.left)*W0/bb.width, my = (e.clientY - bb.top)*H0/bb.height;
        const b = blues.slice(1).find(p => Math.hypot(p.x - mx, p.y - my) < 24); if (b) choose(b, T);
      });
      draw();
      return {par:[4, 3.6, 3.2][o.rank], update(dt){ T += dt; }, get state(){ return {blues, reds, free}; }, choose:b => choose(b, T)};
    }},

  /* ---------- the photo studio: the shot ---------- */
  photo:{title:"Photo Studio · the shoot", unit:"sets", perHour:3, tips:false,
    hint:r => "Three frames: click (or Space) when the subject is in the middle of the focus box",
    task(area, o){
      // the subject sweeps across the frame in a figure of eight, through the middle twice a sweep (a little off it
      // now and then: p2) — the skill is the moment
      const W0 = 560, H0 = 315, w = [1.15, 1.5, 1.9][o.rank], p1 = o.R()*6, p2 = (o.R() - .5)*.5, shots = [];
      let t = 0, cool = 0, flash = 0;
      o.ask(["Portrait session", "Match-day action", "The team photo — one at a time", "Product shots for the club shop"][Math.floor(o.R()*4)]);
      area.innerHTML = `<div class="pz"><canvas width="${W0}" height="${H0}"></canvas><div class="pz-strip"><i></i><i></i><i></i></div></div>`;
      const cv = area.querySelector("canvas"), g = cv.getContext("2d");
      const pos = () => ({x:W0/2 + 200*Math.sin(w*t + p1), y:H0/2 + 62*Math.sin(2*(w*t + p1) + p2)});
      const draw = () => {
        const gr = g.createLinearGradient(0, 0, 0, H0); gr.addColorStop(0, "#3a3346"); gr.addColorStop(1, "#1d1a24"); g.fillStyle = gr; g.fillRect(0, 0, W0, H0);
        g.fillStyle = "rgba(255,255,255,.04)"; for (let i = 0; i < 6; i++) g.fillRect(i*W0/6, 0, 2, H0);
        const p = pos();
        g.fillStyle = "#e9c9a8"; g.beginPath(); g.arc(p.x, p.y - 26, 12, 0, 7); g.fill();
        g.fillStyle = "#c8463a"; g.beginPath(); g.ellipse(p.x, p.y + 4, 16, 22, 0, 0, 7); g.fill();
        // the focus box and the frame's thirds
        g.strokeStyle = "rgba(255,255,255,.18)"; g.lineWidth = 1;
        for (const f of [1/3, 2/3]){ g.beginPath(); g.moveTo(W0*f, 0); g.lineTo(W0*f, H0); g.stroke(); g.beginPath(); g.moveTo(0, H0*f); g.lineTo(W0, H0*f); g.stroke(); }
        const d = Math.hypot(p.x - W0/2, p.y - H0/2);
        g.strokeStyle = d < 30 ? "#c8f060" : "#fff"; g.lineWidth = 2.5;
        const bx = W0/2, by = H0/2, s = 38, c = 12;
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]){ g.beginPath(); g.moveTo(bx + sx*s, by + sy*(s - c)); g.lineTo(bx + sx*s, by + sy*s); g.lineTo(bx + sx*(s - c), by + sy*s); g.stroke(); }
        if (flash > 0){ g.fillStyle = `rgba(255,255,255,${flash})`; g.fillRect(0, 0, W0, H0); }
      };
      const shoot = () => {
        if (cool > 0 || shots.length >= 3) return;
        const p = pos(), sc = clamp01(1 - Math.hypot(p.x - W0/2, p.y - H0/2)/100);
        shots.push(sc); cool = .35; flash = .85;
        const cell = area.querySelectorAll(".pz-strip i")[shots.length - 1]; cell.className = VERDICT(sc)[1]; cell.textContent = VERDICT(sc)[0];
        if (shots.length === 3) setTimeout(() => o.done(mean(shots), {why:`${shots.filter(s => s >= .7).length} of 3 in focus`}), 300);
      };
      cv.addEventListener("click", shoot);
      draw();
      return {timed:false, par:6, update(dt){ t += dt; cool -= dt; flash = Math.max(0, flash - dt*3); draw(); }, key(k, down){ if (down && k === " ") shoot(); }, shoot, pos, get state(){ return {shots, t}; }, W0, H0};
    }},

  /* ---------- the edit suite: cut on the beat ---------- */
  edit:{title:"Cut & Grade · the edit", unit:"reels", perHour:2, tips:false,
    hint:r => "The music's beats roll in from the right: press Space (or click) to cut as each one crosses the playhead",
    task(area, o){
      const W0 = 560, H0 = 170, PH = 120, V = 230, n = [6, 7, 8][o.rank], lo = [.5, .44, .38][o.rank], hi = [.85, .76, .68][o.rank];
      const beats = []; let tt = 1.3;
      for (let i = 0; i < n; i++){ beats.push({t:tt, hit:null}); tt += lo + o.R()*(hi - lo); }
      const bars = []; for (let i = 0; i < 260; i++) bars.push(.2 + o.R()*.8);
      const COL = ["#2c66b8", "#c8463a", "#3f9a52", "#f2c230", "#7c3aed", "#1f9a8a"];
      let now = 0, stray = 0, over = false;
      o.ask(["The match highlights", "A player's goal reel", "The club's training video", "A sponsor's thirty seconds"][Math.floor(o.R()*4)]);
      area.innerHTML = `<div class="ed"><canvas width="${W0}" height="${H0}"></canvas><div class="ed-foot"><span class="ed-n">0 / ${n} cuts</span></div></div>`;
      const cv = area.querySelector("canvas"), g = cv.getContext("2d");
      const X = t => PH + V*(t - now);
      const draw = () => {
        g.fillStyle = "#14171c"; g.fillRect(0, 0, W0, H0);
        // the clips between the cuts, the music's waveform under them
        for (let i = 0; i < n; i++){ const a = X(i ? beats[i - 1].t : 0), b = X(beats[i].t); g.fillStyle = COL[i % COL.length] + "55"; g.fillRect(a, 20, b - a - 2, 56); }
        g.fillStyle = "#3a4656";
        for (let i = 0; i < bars.length; i++){ const x = X(i*.06); if (x < -4 || x > W0) continue; const hgt = bars[i]*40; g.fillRect(x, 125 - hgt/2, 3, hgt); }
        for (const b of beats){
          const x = X(b.t); if (x < -20 || x > W0 + 20) continue;
          g.fillStyle = b.hit == null ? (b.t < now - .26 ? "#ff5a4a" : "#fff") : b.hit >= .99 ? "#c8f060" : b.hit > .5 ? "#6fb4ff" : "#f2a43a";
          g.fillRect(x - 1.5, 12, 3, H0 - 24); g.beginPath(); g.moveTo(x, 6); g.lineTo(x + 7, 14); g.lineTo(x, 22); g.lineTo(x - 7, 14); g.fill();
        }
        g.fillStyle = "#c8f060"; g.fillRect(PH - 1.5, 0, 3, H0);
      };
      const cut = () => {
        if (over) return;
        let best = null, bd = 9;
        for (const b of beats) if (b.hit == null){ const d = Math.abs(b.t - now); if (d < bd){ bd = d; best = b; } }
        if (best && bd <= .26){ best.hit = bd <= .06 ? 1 : bd <= .13 ? .75 : .4; } else stray++;
        area.querySelector(".ed-n").textContent = `${beats.filter(b => b.hit != null).length} / ${n} cuts${stray ? ` · ${stray} stray` : ""}`;
      };
      cv.addEventListener("click", cut);
      draw();
      return {timed:false, par:tt, update(dt){
          if (over) return;
          now += dt; draw();
          if (now > beats[n - 1].t + .5){
            over = true;
            const s = clamp01(beats.reduce((a, b) => a + (b.hit || 0), 0)/n - .08*stray), hits = beats.filter(b => b.hit != null).length;
            o.done(s, {why:`${hits} of ${n} on the beat${stray ? `, ${stray} stray cut${stray > 1 ? "s" : ""}` : ""}`});
          }
        }, key(k, down){ if (down && k === " ") cut(); }, cut, get state(){ return {beats, now}; }};
    }}
};
export const JOB_GAMES = GAMES;
