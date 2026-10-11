// qa/wpA-occlusion.mjs: WP-A acceptance for the occlusion test of the static batches (chunks.js "what the walls hide").
// Owner: WP-A (DESIGN 3.9.2, 1.5.11, 2.3 WP-A).
//
// From each life view, turned round in six steps and tilted up and down, the same frame is drawn twice, with the
// occlusion test off and on, and read back:
//   identical   no pixel differs (the test only ever leaves out what no pixel could show), apart from cracks: a pixel
//               where the full draw shows something far away through a seam the rasterizer leaves open between a
//               wall's triangles. A differing pixel counts as a crack when the first opaque surface the exact geometry
//               has on its ray (three.js Raycaster through the pixel's centre) is drawn in the cut picture; when that
//               surface is an instance the test left out, the test was wrong there and it fails. Cracks are reported
//   saving      indoors (bedroom, lobby) the test leaves out at least a quarter of the triangles over the turn
//   cost        the depth picture is reported (median and worst milliseconds per frame)
// On Low at 1280 x 720 for every view, and on High (standard materials, shadows) for the two indoor views.
//
//   QA_PORT=8772 node qa/wpA-occlusion.mjs        writes qa/out/wpA-occlusion.json
import {launch, career, freeze, expect, report} from "./lib.mjs";

const out = {checks: [], ok: true, views: {}};
const check = (name, ok, detail, soft = false) => { out.checks.push({name, ok: !!ok, soft, detail}); if (!ok && !soft) out.ok = false; console.log(`${ok ? "ok  " : soft ? "note" : "FAIL"} ${name}${detail !== undefined ? ": " + JSON.stringify(detail) : ""}`); };
const ZONES = {home: ["bedroom", "lobby", "street", "park"], ground: ["yard", "pitch"], town: ["town-road"]};
const INDOOR = new Set(["bedroom", "lobby"]);

async function run(tier, zones, turns){
  const {page, close, errors} = await launch({gfx: tier, seed: 1, query: "perf=1"});
  try {
    await career(page, {zone: "home", min: 12*60});
    await freeze(page);
    // (__perf.setView enters the view's zone first when you are elsewhere)
    for (const views of Object.values(zones)){
      for (const view of views){
        const r = await page.evaluate(async ([view, turns]) => {
          const L = __life, R = L.renderer(), sc = L.scene(), ch = await import("./js/life/chunks.js");
          L.FADE.v = 0; L.FADE.boot = false;
          __perf.setView(view);
          for (let i = 0; i < 10; i++){ L.stepN(1); R.render(sc, L.cam); }
          const gl = R.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, a = new Uint8Array(w*h*4), b = new Uint8Array(w*h*4);
          const yaw0 = L.P.yaw, pitch0 = L.P.pitch, res = {diff: 0, cracks: 0, off: 0, on: 0, ms: [], frames: 0, wrong: []};
          const T = await import("./vendor/three.module.js"), rc = new T.Raycaster(), ndc = new T.Vector2();
          const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
          for (let t = 0; t < turns; t++){
            L.P.yaw = yaw0 + t*Math.PI*2/turns; L.P.pitch = [0, .45, -.45][t % 3]; L.stepN(1);
            ch.OC.on = false; R.info.reset(); R.render(sc, L.cam); res.off += R.info.render.triangles; gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, a);
            ch.OC.on = true; R.info.reset(); R.render(sc, L.cam); res.on += R.info.render.triangles; gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b);
            res.ms.push(ch.OC.ms);
            // the instances the cut picture drew (the batched meshes keep the last main-pass list)
            const drawn = new Map();
            sc.traverse(o => { if (o.isBatchedMesh && o.userData.box){ const d = o._indirectTexture.image.data, set = new Set(); for (let k = 0; k < o._multiDrawCount; k++) set.add(d[k]); drawn.set(o, set); } });
            let looked = 0;
            for (let i = 0; i < a.length; i += 4){
              if (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2]) continue;
              if (++looked > 120){ res.diff++; continue; }
              const x = (i >> 2) % w, y = h - 1 - ((i >> 2)/w | 0);
              ndc.set((x + .5)/w*2 - 1, 1 - (y + .5)/h*2); rc.setFromCamera(ndc, L.cam);
              const hit = rc.intersectObjects(sc.children, true).find(q => q.object.material && !q.object.material.transparent && q.object.material.visible !== false && shown(q.object));
              const set = hit && hit.object.isBatchedMesh ? drawn.get(hit.object) : null;
              if (hit && !(set && hit.batchId != null && !set.has(hit.batchId))){ res.cracks++; continue; }
              res.diff++;
              if (res.wrong.length < 5) res.wrong.push({x, y, off: [a[i], a[i + 1], a[i + 2]], on: [b[i], b[i + 1], b[i + 2]], first: hit ? `${hit.object.name || hit.object.type}#${hit.batchId} at ${hit.distance.toFixed(2)} m` : "nothing"});
            }
            res.frames++;
          }
          L.P.yaw = yaw0; L.P.pitch = pitch0; ch.OC.on = true;
          const s = res.ms.slice().sort((x, y) => x - y);
          return {diff: res.diff, cracks: res.cracks, wrong: res.wrong, frames: res.frames, trisOff: res.off, trisOn: res.on, saved: +(1 - res.on/Math.max(1, res.off)).toFixed(3), ms: {median: +s[s.length >> 1].toFixed(2), max: +s[s.length - 1].toFixed(2)}, faces: ch.OC.n};
        }, [view, turns]);
        out.views[`${tier} ${view}`] = r;
        check(`${tier} ${view}: the pictures with and without the test are identical but for cracks`, r.diff === 0, {differingPixels: r.diff, cracks: r.cracks, frames: r.frames, wrong: r.wrong});
        if (INDOOR.has(view)) check(`${tier} ${view}: at least a quarter of the triangles left out over the turn`, r.saved >= .25, {saved: r.saved, off: r.trisOff, on: r.trisOn});
        else check(`${tier} ${view}: triangles left out over the turn`, true, {saved: r.saved, off: r.trisOff, on: r.trisOn});
        check(`${tier} ${view}: the depth picture's cost (ms per frame)`, true, r.ms);
      }
    }
    check(`${tier}: no errors`, errors.length === 0, errors.slice(0, 5));
  } finally { await close(); }
}
await run("low", ZONES, 6);
await run("high", {home: ["bedroom", "lobby"]}, 3);
report("wpA-occlusion", out);
console.log(out.ok ? "wpA-occlusion: pass" : "wpA-occlusion: FAIL");
expect(out.ok, "wpA-occlusion failed");
