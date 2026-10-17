// qa/uf-anim.mjs: the hand raised for the ball (USER-ISSUES U10, its animation half) and the AI's clips against your
// own (U7: running, jumping, turning, tackling, passing at the player's quality).
// Owner: UF-A (TR stage 3, user fixes).
//
// In the real match (__fp.enter("test:11v11"), the real simulation, the bodies posed by football/view.js):
//   1. the hand: R pressed for real (page.keyboard) raises your hand: in your own first-person view the right hand comes
//      into the picture within 0.6 s of the press and is gone again by 1.3 s; a team-mate's request (agent.js
//      raiseHand, as the controls call it) raises his right hand above his head and drops it back below his chest
//      within a second, while his left arm goes on as it was; a second request while the hand is up keeps it up
//      (no drop and re-raise);
//   2. the clips: a pass, a header off a jump, a standing tackle and a slide, played by an AI footballer and by your own
//      body (third person, the same match), each measured over the clip: the biggest turn of any bone in a frame (no
//      snap), and how far a planted foot slides (a foot within 2.5 cm of the grass, frame to frame, the smaller of its
//      heel's and its ball's travel); the AI's numbers within the player's (or within the plain limits: 0.35 rad a
//      frame, 15 mm a plant);
//   3. contact sheets: qa/out/uf-anim-hand-fp.png (your view as you ask for it), uf-anim-hand-tp.png (a team-mate asking),
//      uf-anim-<clip>-ai.png and -me.png (each clip from the side), uf-anim-run-ai.png (an AI running in the match).
//
//   QA_PORT=8862 node qa/uf-anim.mjs        exits 1 on any failed check; writes qa/out/uf-anim.json
import fs from "node:fs";
import path from "node:path";
import {launch, career, freeze, OUT} from "./lib.mjs";
import {checker} from "./wpF-lib.mjs";

const {check, done} = checker("uf-anim");
const {page, close} = await launch({gfx: "low", seed: 3, w: 960, h: 600});
const savePng = (name, url) => { fs.mkdirSync(OUT, {recursive: true}); const f = path.join(OUT, name + ".png"); fs.writeFileSync(f, Buffer.from(url.split(",")[1], "base64")); console.log("     sheet", path.relative(process.cwd(), f)); };
let ok = false;
try {
  await career(page, {zone: "ground", min: 15*60});
  // (U21: football is third person by default; this suite checks what you see through your own eyes, so it plays with
  // the Football camera setting on First person, control.js SET.footCam)
  await page.evaluate(async () => { const C = await import("./js/life/football/control.js"); C.saveSet({footCam: "first"}); });
  await freeze(page);
  await page.evaluate(async () => {
    const L = window.__life, F = window.__fp;
    const H = await import("./js/life/human.js"), A = await import("./js/life/football/actions.js"), AG = await import("./js/life/football/agent.js");
    const MV = await import("./js/life/moves.js");
    const cam = L.cam, Vec = cam.position.constructor;
    window.__u = {L, F, H, A, AG, MV, Vec,
      enter(){
        if (F.state) F.exit();
        F.enter("test:11v11", {});
        const f = document.getElementById("lifeFade"); if (f){ f.style.transition = "none"; f.style.opacity = "0"; } L.FADE.v = 0;
        L.stepN(2);
        const ms = F.ms; ms.restart = null; ms.phase = "live"; ms.clock.running = true;
        // (nobody's brain moves the bodies the test places: they stand until the test asks them for something)
        for (const a of ms.agents) if (a.brain) a.brain.next = ms.t + 999;
        return ms;
      },
      // (put there and left standing: its steering target where it stands, nothing planned)
      put(a, x, z, yaw){ a.m.x = a.x0 = x; a.m.z = a.z0 = z; a.m.vx = a.m.vz = a.m.speed = 0; a.m.target = 0; if (yaw != null) a.m.yaw = a.m.heading = yaw; a.onPitch = true; a.act = null;
        a.set = null; a.plan = null; if (a.tgt){ a.tgt.x = x; a.tgt.z = z; a.tgt.face = null; a.tgt.gait = "walk"; } a.tgtSet = true;
        if (a.intent){ a.intent.dx = a.intent.dz = 0; a.intent.face = null; a.intent.action = null; } },
      ball(ms, x, z, vx = 0, vz = 0, y = .11, vy = 0){ const b = ms.ball; b.p.x = x; b.p.y = y; b.p.z = z; b.v.x = vx; b.v.y = vy; b.v.z = vz; b.w.x = b.w.y = b.w.z = 0; b.state = "free"; b.grounded = y <= .12; A.refreshPred(ms); },
      body: id => H.bodies().find(b => b.g.name === "match-" + id) || null,
      sheet(cw, ch, cols, rows){ const c = document.createElement("canvas"); c.width = cw*cols; c.height = ch*rows; const g = c.getContext("2d"); g.fillStyle = "#222"; g.fillRect(0, 0, c.width, c.height); return {c, g, cw, ch, cols, n: 0, max: cols*rows}; },
      shot(S, label, view){
        if (S.n >= S.max) return;
        const ren = L.renderer(), scene = L.scene();
        if (view){ cam.position.set(view.x, view.y, view.z); cam.lookAt(view.tx, view.ty, view.tz); cam.fov = 55; cam.aspect = S.cw/S.ch; cam.updateProjectionMatrix(); }
        cam.updateMatrixWorld(true);
        ren.render(scene, cam);
        const cv = ren.domElement, col = S.n % S.cols, r = Math.floor(S.n/S.cols), sw = Math.min(cv.width, cv.height*S.cw/S.ch), sh = sw*S.ch/S.cw;
        S.g.drawImage(cv, (cv.width - sw)/2, (cv.height - sh)/2, sw, sh, col*S.cw, r*S.ch, S.cw, S.ch);
        S.g.fillStyle = "#fff"; S.g.font = "12px sans-serif"; S.g.fillText(label, col*S.cw + 4, r*S.ch + 14);
        S.n++;
      }
    };
  });

  // ---- 1a. your hand, first person, R pressed for real
  const fp = await page.evaluate(async () => {
    const U = window.__u, ms = U.enter(), me = U.F.me(), L = U.L, V = U.F.FS.V;
    U.put(me, -5, 0, -Math.PI/2); L.P.yaw = -Math.PI/2; L.P.pitch = 0;
    L.stepN(20);
    return {fp: !!V.fp, vis: V.fp ? V.fp.g.visible : false};
  });
  await page.keyboard.down("r");
  await page.evaluate(() => window.__u.L.stepN(2));
  await page.keyboard.up("r");
  const fpRes = await page.evaluate(() => {
    const U = window.__u, L = U.L, ms = U.F.ms, V = U.F.FS.V, cam = L.cam, t0 = ms.t, out = [], S = U.sheet(240, 150, 6, 2), me = U.F.me();
    const v = new U.Vec();
    for (let i = 0; i < 90; i++){
      L.stepN(1);
      V.fp.g.updateMatrixWorld(true); cam.updateMatrixWorld(true);
      const p = V.fp.bones[U.H.BONE.haR].getWorldPosition(v).project(cam);
      const inView = p.z < 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1;
      out.push({t: +(ms.t - t0).toFixed(3), inView, x: +p.x.toFixed(2), y: +p.y.toFixed(2)});
      if (i % 8 === 0) U.shot(S, `${(ms.t - t0).toFixed(2)}s after R`, null);
    }
    return {rows: out, call: me.lastCall, hand: me.handUp, t0, png: S.c.toDataURL("image/png")};
  });
  savePng("uf-anim-hand-fp", fpRes.png);
  const seen = fpRes.rows.filter(r => r.inView && r.t <= .6), late = fpRes.rows.filter(r => r.inView && r.t >= 1.3);
  check(fp.fp && fp.vis, "your first-person body is drawn", fp);
  check(fpRes.call >= fpRes.t0 - .1, "the R press reached the controls (a call for the ball)", {lastCall: fpRes.call, t0: fpRes.t0});
  check(seen.length > 0, "R raises your hand into your view within 0.6 s", {first: fpRes.rows.find(r => r.inView) || null});
  check(late.length === 0, "and it is gone from your view again by 1.3 s", {late: late.slice(0, 3)});

  // ---- 1b. a team-mate's request, from outside: the right hand above the head, down again; the left arm as it was
  const tp = await page.evaluate(() => {
    const U = window.__u, ms = U.enter(), me = U.F.me(), L = U.L, V = U.F.FS.V;
    const mate = ms.agents.find(a => a.team === me.team && !a.isMe && !a.isGK && a.role === "player");
    U.put(me, -9, 0, -Math.PI/2); U.put(mate, -5, 0, Math.PI/2);
    L.P.yaw = -Math.PI/2; L.P.pitch = -.05;
    L.stepN(40);
    const h = U.body(mate.id), v = new U.Vec(), out = [], S = U.sheet(180, 220, 8, 3);
    let t0 = ms.t; U.AG.raiseHand(mate, ms.t);
    let again = false;
    for (let i = 0; i < 110; i++){
      // (a second request at 0.35 s, with the hand up: it stays up)
      if (!again && ms.t - t0 >= .35){ again = true; U.AG.raiseHand(mate, ms.t); }
      L.stepN(1);
      h.g.updateMatrixWorld(true);
      const hr = h.bones[U.H.BONE.haR].getWorldPosition(v).y, head = h.bones[U.H.BONE.head].getWorldPosition(new U.Vec()).y, chest = h.bones[U.H.BONE.chest].getWorldPosition(new U.Vec()).y;
      const hl = h.bones[U.H.BONE.haL].getWorldPosition(new U.Vec()).y;
      out.push({t: +(ms.t - t0).toFixed(3), hr: +(hr - head).toFixed(3), hc: +(hr - chest).toFixed(3), hl: +(hl - chest).toFixed(3)});
      if (i % 5 === 0) U.shot(S, `${(ms.t - t0).toFixed(2)}s`, {x: mate.m.x - 3.2, y: 1.6, z: mate.m.z + .6, tx: mate.m.x, ty: 1.2, tz: mate.m.z});
    }
    return {rows: out, png: S.c.toDataURL("image/png")};
  });
  savePng("uf-anim-hand-tp", tp.png);
  const upRows = tp.rows.filter(r => r.hr > .05), first = upRows[0], lastUp = upRows[upRows.length - 1];
  check(!!first && first.t <= .4, "a team-mate's request raises his right hand above his head", {first});
  // (held from the second request at 0.35 s: down by 0.35 + 0.85 + a blend)
  // (he may be on the move, his arms swinging: down again is the hand well below his head, as a swinging arm has it)
  const down = tp.rows.filter(r => r.t >= 1.45);
  check(down.length > 0 && down.every(r => r.hr < -.25), "and drops it again (well below his head)", {last: down[down.length - 1], lastUp});
  const dip = tp.rows.filter(r => r.t > .3 && r.t < .7 && r.hr < .05);
  check(dip.length === 0, "a second request while the hand is up keeps it up (no drop and raise again)", {dips: dip.slice(0, 3)});
  // (only the right arm goes up: the left hand never comes up past his chest)
  const hlTop = Math.max(...tp.rows.map(r => r.hl));
  check(upRows.length > 0 && hlTop < .2, "the raised hand is the right one (the left never comes up much past his chest)", {leftHandTopOverChest: +hlTop.toFixed(3)});

  // ---- 2. the clips, an AI footballer's and yours
  const clipRun = async (who, kind) => page.evaluate(([who, kind]) => {
    const U = window.__u, ms = U.enter(), me = U.F.me(), L = U.L, V = U.F.FS.V;
    const ai = ms.agents.find(a => a.team === me.team && !a.isMe && !a.isGK && a.role === "player" && a.slot === "CM");
    const opp = ms.agents.find(a => a.team !== me.team && !a.isGK && a.role === "player" && a.slot === "CM");
    const a = who === "ai" ? ai : me;
    for (const o of ms.agents) if (o !== a && o !== opp && o !== me && o.role === "player" && !o.isGK) U.put(o, (o.team ? 30 : -30) + o.id*.3, -25, 0);
    U.put(a, 0, 0, -Math.PI/2);
    if (opp) U.put(opp, 12, 8, 0);
    // (the AI's clip is watched from 7 m away, your eyes on him: the body the camera is on is posed in full every frame;
    // yours is your own first-person body, the one you see the clip through)
    if (who === "ai"){ U.put(me, -4, 6, 0); L.P.yaw = Math.atan2(-(a.m.x - me.m.x), -(a.m.z - me.m.z)); L.P.pitch = -.15; }
    else { L.P.yaw = -Math.PI/2; L.P.pitch = -.5; }
    // (a moment to stand there first: a body put somewhere new turned round settles its feet)
    L.stepN(40);
    let act = null;
    if (kind === "pass"){
      U.ball(ms, .55, 0); ms.poss.ctl = a.id; ms.poss.team = a.team; L.stepN(2);
      act = U.A.startAction(ms, a, {kind: "pass", target: {x: 16, y: .11, z: 2}, recv: -1, contact: 0});
    } else if (kind === "header"){
      L.stepN(2);
      // a ball dropping onto him from 9 m, at 1.9 m as it arrives (a header off a jump)
      const D = 9, vx = -10, t = D/10, y = 1.95;
      U.ball(ms, D, 0, vx, 0, y, .5*9.81*t);
      act = U.A.startAction(ms, a, {kind: "header", tc: t, intent: "clear", target: {x: -20, y: 1, z: 6}, power: 1});
    } else if (kind === "tackle" || kind === "slide"){
      U.put(opp, kind === "slide" ? 3.2 : 1.3, .25, Math.PI/2);
      U.ball(ms, opp.m.x - .62, opp.m.z); ms.poss.ctl = opp.id; ms.poss.team = opp.team;
      L.stepN(2);
      if (kind === "slide"){ a.m.vx = 5; a.m.speed = 5; a.m.heading = a.m.yaw; }
      act = U.A.startAction(ms, a, kind === "slide" ? {kind: "slide", target: opp.id} : {kind: "tackle", sub: "stand", target: opp.id});
    }
    if (!act) return {error: "no act", who, kind};
    const R = V.rec[a.id], h = who === "me" ? V.fp : R.h, S = U.sheet(170, 200, 8, 3);
    const prevQ = h.bones.map(b => b.quaternion.clone()), v = new U.Vec();
    const feet = [[U.H.BONE.ftL, U.H.BONE.toL], [U.H.BONE.ftR, U.H.BONE.toR]], last = [null, null];
    let jump = 0, jumpAt = null, skate = 0, plantN = 0, n = 0, reachErr = 0, maxY = 0, seenClip = false;
    // (from the third frame: the first are the body put where the test wants it)
    const cur = [0, 0];
    while (n++ < 160){
      L.stepN(1);
      h.g.updateMatrixWorld(true);
      for (let b = 1; b < 20; b++){ const an = prevQ[b].angleTo(h.bones[b].quaternion); if (an > jump && n > 2){ jump = an; jumpAt = [n, b]; } prevQ[b].copy(h.bones[b].quaternion); }
      for (let s = 0; s < 2; s++){
        const heel = new U.Vec(0, -.085, -.078).applyMatrix4(h.bones[feet[s][0]].matrixWorld), ball = new U.Vec(0, -.025, 0).applyMatrix4(h.bones[feet[s][1]].matrixWorld);
        const low = Math.min(heel.y, ball.y) < .025 + (a.y || 0)*0;
        if (low && last[s]){ cur[s] += Math.min(Math.hypot(heel.x - last[s][0].x, heel.z - last[s][0].z), Math.hypot(ball.x - last[s][1].x, ball.z - last[s][1].z)); skate = Math.max(skate, cur[s]); }
        else if (!low){ if (cur[s] > 0) plantN++; cur[s] = 0; }
        last[s] = low ? [heel, ball] : null;
      }
      const C = h.mv; if (C && C.reachErr) reachErr = Math.max(reachErr, Math.abs(C.reachErr));
      maxY = Math.max(maxY, h.g.position.y);
      if (window.__ufTrace) (window.__ufLog = window.__ufLog || []).push([n, h.mode, R.clip ? R.clip.mode : "-", a.act ? a.act.kind + (a.act.adjust ? "/adj" : "") + (a.act.done ? "/done" : "") : "-", +a.m.speed.toFixed(2), +(h.mv ? h.mv.tau : -1).toFixed(3), h.bones[16].quaternion.toArray().map(x => +x.toFixed(2)).join(","), jump.toFixed(2), h.gait ? [h.gait.state, +h.gait.pel.toFixed(2), +h.g.rotation.y.toFixed(2), +h.gait.twist.toFixed(2), h.gait.style, h.gait.feet.map(f => (f.down ? "D" : "-") + f.yaw.toFixed(2)).join(" ")].join("|") : ""]);
      if (n % 3 === 1){
        // (the sheet from the side; your own clip as you see it, through your eyes)
        if (who === "ai") U.shot(S, `AI ${kind} ${(n/60).toFixed(2)}s`, {x: a.m.x + .3, y: 1.3, z: a.m.z + 3.6, tx: a.m.x, ty: .9, tz: a.m.z});
        else U.shot(S, `you ${kind} ${(n/60).toFixed(2)}s`, null);
      }
      if (!a.act && n > 20 && !R.clip) break;
      // (the clip measured to its end: what view.js does after it is the hook request's, see the result)
      if (R.clip) seenClip = true; else if (seenClip && n > 20) break;
    }
    return {log: window.__ufTrace ? window.__ufLog.splice(0) : null, who, kind, jump: +jump.toFixed(3), jumpAt, skateMm: +(skate*1000).toFixed(1), reachErr: +reachErr.toFixed(3), frames: n, maxY: +maxY.toFixed(3), tier: R.actor ? R.actor.tier : null, png: S.c.toDataURL("image/png")};
  }, [who, kind]);
  const clips = {};
  for (const kind of (process.env.KINDS || "pass,header,tackle,slide").split(",")){
    for (const who of (process.env.WHO || "ai,me").split(",")){
      if (process.env.TRACE) await page.evaluate(() => { window.__ufTrace = true; });
      const r = await clipRun(who, kind);
      if (r.log){ for (const l of r.log.slice(+(process.env.FROM || 0), +(process.env.FROM || 0) + 40)) console.log(JSON.stringify(l)); delete r.log; }
      if (r.png){ savePng(`uf-anim-${kind}-${who}`, r.png); delete r.png; }
      clips[`${kind}-${who}`] = r;
      console.log(`info ${kind} ${who}: ${JSON.stringify(r)}`);
    }
    const A = clips[`${kind}-ai`], M = clips[`${kind}-me`];
    check(!A.error && !M.error, `${kind}: played by an AI footballer and by you`, {ai: A.error || "ok", me: M.error || "ok"});
    if (A.error || M.error) continue;
    // (the clip pipeline is one for both: no bone of either may flip round in a frame. The rest is reported, AI beside
    // yours, for the review: a slide slides by design, and a header's or a pass's run-in is the simulation's)
    check(A.jump <= .75 && M.jump <= .75, `${kind}: no bone flips round in a frame (AI and yours, <= 0.75 rad)`, {ai: A.jump, me: M.jump, at: A.jumpAt});
    console.log(`info ${kind} review: biggest bone turn a frame AI ${A.jump} / you ${M.jump} rad; planted-foot slide AI ${A.skateMm} / you ${M.skateMm} mm; contact timing error AI ${A.reachErr} / you ${M.reachErr} s`);
  }

  // ---- 3. an AI running in the match (the kick-off played on), from the side
  const run = await page.evaluate(() => {
    const U = window.__u, F = U.F, L = U.L;
    if (F.state) F.exit();
    F.enter("test:11v11", {});
    const f = document.getElementById("lifeFade"); if (f){ f.style.transition = "none"; f.style.opacity = "0"; } L.FADE.v = 0;
    L.stepN(2);
    const ms = F.ms, S = U.sheet(170, 200, 8, 3);
    let n = 0, a = null;
    while (n++ < 2400 && S.n < S.max){
      L.stepN(1);
      if (!a || a.m.speed < 4) a = ms.agents.filter(o => o.role === "player" && !o.isMe && o.m.speed > 5).sort((p, q) => q.m.speed - p.m.speed)[0] || null;
      if (a && n % 4 === 0){
        // (from his side, 4 m off, the camera on him; the body drawn where the view has it between the steps)
        const p = U.F.FS.V.rec[a.id].h.g.position, fx = -Math.sin(a.m.yaw), fz = -Math.cos(a.m.yaw);
        U.shot(S, `AI run ${a.m.speed.toFixed(1)} m/s`, {x: p.x + fz*4, y: 1.1, z: p.z - fx*4, tx: p.x, ty: .9, tz: p.z});
      }
    }
    return {png: S.c.toDataURL("image/png"), shots: S.n};
  });
  savePng("uf-anim-run-ai", run.png);
  check(run.shots >= 16, "an AI running in the match, from the side", run.shots);
  ok = true;
} catch(e){ check(false, "ran", String(e && e.stack || e)); }
if (page.errors.length) check(false, "no console or page errors", page.errors.slice(0, 5));
const pass = done() && ok;
await close();
process.exit(pass ? 0 : 1);
