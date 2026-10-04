"use strict";
/* ============ FEEDBACK: what just happened, at the size it deserves ============
   · bottom left — small progress: a skill or the day job gaining experience, a bar that visibly fills
   · centre      — the moments that matter: a skill point, a level, a promotion, match day
   · top right   — money, which counts up or down to its new value with a chip for the change
   Every card is temporary. Nothing here stays on screen once it has said what it came to say. */
const FEED = {
  cards:new Map(), queue:[], showing:false, raf:null,
  money:{shown:null, from:0, to:0, t0:0, dur:650},
  live(){
    const r = document.getElementById("lifeRoot");
    return !!r && r.style.display !== "none" && document.body.classList.contains("life") && !document.body.classList.contains("in-match");
  },
  el(id){ return document.getElementById(id); },

  /* ---------- bottom left: experience bars ---------- */
  // before = {v, xp, need} from just before the experience was added
  skill(k, gain, before){
    const v1 = S.skills[k], xp1 = S.skillXp[k] || 0, need1 = skillNeed(k), ups = Math.max(0, v1 - before.v);
    this.bar("sk:" + k, {title:skillName(k), gain, from:before.v >= 99 ? 1 : before.xp/before.need, to:v1 >= 99 ? 1 : xp1/need1,
      wraps:ups, cur:xp1, need:need1, foot:`Level ${v1}`, kind:"skill", max:v1 >= 99});
  },
  job(gain, before){
    const js = jobState(), {job, rank} = myJob(), top = jobIsTop(), need = jobNeed();
    const promoted = before && before.rank && before.rank.name !== rank.name;
    this.bar("job", {title:job.name, gain, unit:"XP", from:before ? before.pct : js.xp/need, to:top ? 1 : js.xp/need,
      wraps:promoted ? 1 : 0, cur:js.xp, need, foot:rank.name, kind:"job", max:top});
  },
  bar(key, o){
    if (!this.live()) return;
    const box = this.el("lifeFeed"); if (!box) return;
    let c = this.cards.get(key);
    if (!c || !c.node.isConnected){
      const node = document.createElement("div");
      node.className = `fd-card ${o.kind || ""}`;
      node.innerHTML = `<div class="fd-top"><span class="fd-ico">${o.kind === "job" ? "€" : "▲"}</span><b class="fd-title"></b><em class="fd-gain"></em></div>
        <div class="fd-bar"><i></i></div><div class="fd-sub"><span class="fd-num"></span><span class="fd-foot"></span></div>`;
      box.appendChild(node);
      this.trim(box, 3);
      requestAnimationFrame(() => node.classList.add("in"));
      c = {node, pct:clamp(o.from, 0, 1), gain:0, gainShown:0, wraps:0};
      this.cards.set(key, c);
    }
    c.target = clamp(o.to, 0, 1); c.wraps += o.wraps || 0; c.gain += o.gain; c.cur = o.cur; c.need = o.need; c.max = o.max;
    c.node.querySelector(".fd-title").textContent = String(o.title || "").toUpperCase();
    c.node.querySelector(".fd-foot").textContent = o.foot || "";
    c.t = performance.now(); c.node.classList.remove("out");
    c.node.classList.remove("bump"); void c.node.offsetWidth; c.node.classList.add("bump");
    this.kick();
  },
  dropNode(n){
    if (!n || n.dataset.leaving) return;
    for (const [k, c] of this.cards) if (c.node === n) this.cards.delete(k);
    n.dataset.leaving = "1";
    n.classList.add("out"); setTimeout(() => n.remove(), 420);
  },
  // keep at most `max` cards in a corner; the ones already sliding out do not count
  trim(box, max){
    const alive = Array.from(box.children).filter(n => !n.dataset.leaving);
    for (let i = 0; i < alive.length - max; i++) this.dropNode(alive[i]);
  },
  kick(){ if (!this.raf) this.raf = requestAnimationFrame(t => this.frame(t)); },
  frame(t){
    this.raf = null;
    let busy = false;
    const dt = Math.min(.05, (t - (this.last || t))/1000); this.last = t;
    for (const [k, c] of this.cards){
      // the bar runs towards its target, wrapping round once for every level gained on the way
      let anim = false;
      const goal = c.wraps > 0 ? 1 : c.target, sp = 1.1;
      if (Math.abs(goal - c.pct) > .002){ c.pct += Math.sign(goal - c.pct)*Math.min(Math.abs(goal - c.pct), sp*dt); anim = true; }
      else if (c.wraps > 0){ c.wraps--; c.pct = 0; c.node.classList.remove("lvl"); void c.node.offsetWidth; c.node.classList.add("lvl"); anim = true; }
      if (c.gainShown < c.gain){ c.gainShown = Math.min(c.gain, c.gainShown + Math.max(1, c.gain*dt*2.4)); anim = true; }
      c.node.querySelector(".fd-bar i").style.width = (c.max ? 100 : c.pct*100).toFixed(1) + "%";
      c.node.querySelector(".fd-gain").textContent = `+${Math.round(c.gainShown)} XP`;
      // while a level is still rolling over, the count follows the bar; once it settles it shows the real figure
      const shown = anim ? Math.round(c.pct*c.need) : Math.round(c.cur);
      c.node.querySelector(".fd-num").textContent = c.max ? "Maxed" : `${clamp(shown, 0, c.need)} / ${c.need} XP`;
      if (!anim && t - c.t > 4200){ this.dropNode(c.node); continue; }
      busy = true;
    }
    if (this.moneyFrame(t)) busy = true;
    if (busy) this.kick();
  },
  // one-line chips in the same corner for small career news: "Team Chemistry +1", "Manager trust −2"
  chip(text, kind){
    if (!this.live()){ if (kind !== "quiet") toast(text, kind === "bad" ? "bad" : kind === "good" ? "good" : ""); return; }
    const box = this.el("lifeFeed"); if (!box) return;
    const n = document.createElement("div");
    n.className = `fd-chip ${kind || ""}`; n.textContent = text;
    box.appendChild(n);
    this.trim(box, 4);
    requestAnimationFrame(() => n.classList.add("in"));
    setTimeout(() => this.dropNode(n), 3600);
  },

  /* ---------- centre: the moments that matter, one at a time ---------- */
  center(title, sub, o){
    o = o || {};
    if (!this.live()){ toast(`${title}${sub ? " — " + sub : ""}`, o.kind === "bad" ? "bad" : "gold"); return; }
    // the same news twice in a row is said once
    if (this.queue.some(q => q.title === title && q.sub === sub)) return;
    this.queue.push({title, sub, kind:o.kind || "", icon:o.icon || "", ms:o.ms || 2700});
    if (!this.showing) this.next();
  },
  next(){
    const q = this.queue.shift(), box = this.el("lifeCenter");
    if (!q || !box){ this.showing = false; return; }
    this.showing = true;
    const n = document.createElement("div");
    n.className = `lfc ${q.kind}`;
    n.innerHTML = `${q.icon ? `<div class="lfc-ico">${esc(q.icon)}</div>` : ""}<div class="lfc-title">${esc(q.title)}</div>${q.sub ? `<div class="lfc-sub">${esc(q.sub)}</div>` : ""}`;
    box.appendChild(n);
    requestAnimationFrame(() => n.classList.add("in"));
    setTimeout(() => { n.classList.add("out"); setTimeout(() => { n.remove(); this.next(); }, 420); }, q.ms);
  },

  /* ---------- top right: money that counts ---------- */
  moneySync(silent){
    const el = this.el("lifeMoney"); if (!el || !S) return;
    const target = Math.round(S.money);
    if (this.money.shown == null || silent){ this.money.shown = target; this.money.to = target; el.textContent = euroFull(target); return; }
    if (target === this.money.to) return;
    const delta = target - this.money.to;
    this.money.from = this.money.shown; this.money.to = target; this.money.t0 = performance.now();
    el.classList.remove("up", "down"); void el.offsetWidth; el.classList.add(delta > 0 ? "up" : "down");
    const chips = this.el("lifeMoneyChips");
    if (chips && Math.abs(delta) >= 1){
      const c = document.createElement("div");
      c.className = `mchip ${delta > 0 ? "up" : "down"}`;
      c.textContent = delta > 0 ? `+${euroFull(delta)} earned` : `−${euroFull(-delta)}`;
      chips.appendChild(c); while (chips.children.length > 2) chips.firstElementChild.remove();
      requestAnimationFrame(() => c.classList.add("in"));
      setTimeout(() => { c.classList.add("out"); setTimeout(() => c.remove(), 400); }, 2400);
    }
    this.kick();
  },
  moneyFrame(t){
    const m = this.money, el = this.el("lifeMoney");
    if (!el || m.shown === m.to) return false;
    const k = clamp((t - m.t0)/m.dur, 0, 1), e = 1 - Math.pow(1 - k, 3);
    m.shown = k >= 1 ? m.to : Math.round(m.from + (m.to - m.from)*e);
    el.textContent = euroFull(m.shown);
    return m.shown !== m.to;
  },
  reset(){
    this.cards.clear(); this.queue = []; this.showing = false; this.money.shown = null;
    for (const id of ["lifeFeed", "lifeCenter", "lifeMoneyChips"]){ const e = this.el(id); if (e) e.innerHTML = ""; }
  }
};
// €1,245 — the money in the corner is always the exact figure
function euroFull(n){ n = Math.round(n || 0); return (n < 0 ? "−" : "") + "€" + Math.abs(n).toLocaleString("en-GB"); }
