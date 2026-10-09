// qa/wpK-lib.mjs: the page the WP-K tests run in, and contact sheets of a move.
// Owner: WP-K (Stage P2). Contracts DESIGN 1.4.18 (moves.js, gkmoves.js), 3.5.7, 3.5.8; QA 4.2 and 4.8.
//
// The moves are posed by human.js on bodies made in a bare page of this server (qa/out/wpK-blank.html, written here):
// no career, no world, so a run is quick and the timing is exactly the test's. installKit(page) puts window.K in the
// page: a scene with a pitch-green floor, a ball, a sun, an offscreen renderer and helpers to draw a body from the
// side, from the front or through its own eyes into a contact sheet (K.sheet(...)), which the Node side saves as a PNG.
//
//   import {openKit, savePng} from "./wpK-lib.mjs";
import fs from "node:fs";
import path from "node:path";
import {chromium} from "/opt/node22/lib/node_modules/playwright/index.mjs";
import {ensureServer} from "./serve.mjs";

export const PORT = +(process.env.QA_PORT || 8769);
export const BASE = `http://127.0.0.1:${PORT}/`;
export const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "out");
const ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

export async function openKit(){
  fs.mkdirSync(OUT, {recursive: true});
  fs.writeFileSync(path.join(OUT, "wpK-blank.html"), '<!doctype html><meta charset="utf-8"><title>wpK</title><body style="margin:0;background:#222"></body>');
  const srv = await ensureServer(PORT);
  const browser = await chromium.launch({args: ARGS});
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message + "\n" + String(e.stack || "").split("\n").slice(1, 4).join("\n")));
  page.on("console", m => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
  await page.goto(BASE + "qa/out/wpK-blank.html");
  await installKit(page);
  const close = async () => { await browser.close().catch(() => {}); if (srv.started) await new Promise(r => srv.server.close(() => r())); };
  return {browser, page, errors, close};
}

export function savePng(dataUrl, name){
  const f = path.join(OUT, name);
  fs.writeFileSync(f, Buffer.from(dataUrl.split(",")[1], "base64"));
  return f;
}

async function installKit(page){
  await page.evaluate(async () => {
    const THREE = await import("/vendor/three.module.js");
    const H = await import("/js/life/human.js");
    const M = await import("/js/life/moves.js");
    const GK = await import("/js/life/gkmoves.js");
    const P = await import("/js/life/football/gkplan.js");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9fb8cf);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445533, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(5, 10, 7); scene.add(sun);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({color: 0x4f8a3c}));
    floor.rotation.x = -Math.PI/2; scene.add(floor);
    // a 1 m grid on the grass, so slides and steps can be read
    const grid = new THREE.GridHelper(80, 80, 0x3d6e2e, 0x3d6e2e); grid.position.y = .002; scene.add(grid);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(.11, 16, 12), new THREE.MeshLambertMaterial({color: 0xf4f4f4}));
    scene.add(ball);
    const mark = new THREE.Mesh(new THREE.SphereGeometry(.03, 8, 6), new THREE.MeshBasicMaterial({color: 0xff2020}));
    mark.visible = false; scene.add(mark);
    const canvas = document.createElement("canvas");
    const ren = new THREE.WebGLRenderer({canvas, antialias: false, preserveDrawingBuffer: true});
    const cam = new THREE.PerspectiveCamera(40, 1, .05, 300);
    const K = window.K = {THREE, H, M, GK, P, scene, ball, mark, ren, cam, bodies: []};
    K.body = (role = "footballer", seed = 7, extra = {}, opt = {}) => {
      const look = H.lookFor(role, seed, Object.assign({kit: ["#c0392b", "#ffffff"], number: 9}, extra));
      const h = opt.fp ? H.playerRig(look, {firstPerson: true}) : H.human(look);
      scene.add(h.g); K.bodies.push(h);
      return h;
    };
    K.clear = () => { for (const h of K.bodies){ scene.remove(h.g); if (h.dispose) h.dispose(); } K.bodies.length = 0; };
    // a contact sheet: cells of w x h, cols across; shot(view) renders the scene into the next cell
    K.sheet = (w = 200, hh = 260, cols = 8) => {
      const c = document.createElement("canvas"); c.width = w*cols; c.height = hh;
      const x = c.getContext("2d"); x.fillStyle = "#222"; x.fillRect(0, 0, c.width, c.height);
      const S = {c, x, w, h: hh, cols, n: 0};
      S.shot = (view, label = "") => {
        const row = Math.floor(S.n/cols), col = S.n % cols;
        if ((row + 1)*hh > c.height){
          const old = document.createElement("canvas"); old.width = c.width; old.height = c.height; old.getContext("2d").drawImage(c, 0, 0);
          c.height = (row + 1)*hh; x.fillStyle = "#222"; x.fillRect(0, 0, c.width, c.height); x.drawImage(old, 0, 0);
        }
        ren.setSize(w, hh, false); cam.aspect = w/hh;
        cam.fov = view.fov || 40;
        cam.position.set(view.px, view.py, view.pz); cam.lookAt(view.tx, view.ty, view.tz); cam.updateProjectionMatrix();
        ren.render(scene, cam);
        x.drawImage(canvas, col*w, row*hh);
        if (label){ x.fillStyle = "#fff"; x.font = "12px monospace"; x.fillText(label, col*w + 4, row*hh + 14); }
        S.n++;
      };
      S.url = () => c.toDataURL("image/png");
      return S;
    };
    // views of a body: from its side (its right, or left), from the front, from behind, through its eyes
    K.view = (h, kind, o = {}) => {
      const g = h.g, x = o.cx != null ? o.cx : g.position.x, z = o.cz != null ? o.cz : g.position.z, ry = g.rotation.y;
      const fx = Math.sin(ry), fz = Math.cos(ry), lx = fz, lz = -fx, d = o.d || 4.2, ty = o.ty != null ? o.ty : .9;
      if (kind === "side") return {px: x - lx*d, py: 1.0, pz: z - lz*d, tx: x, ty, tz: z};
      if (kind === "sideL") return {px: x + lx*d, py: 1.0, pz: z + lz*d, tx: x, ty, tz: z};
      if (kind === "front") return {px: x + fx*d, py: 1.1, pz: z + fz*d, tx: x, ty, tz: z};
      if (kind === "back") return {px: x - fx*d + lx*1.2, py: 1.5, pz: z - fz*d + lz*1.2, tx: x + fx, ty: .6, tz: z + fz};
      if (kind === "fp"){
        // the eye: 1.68 of a 1.80 frame up, 0.1 ahead of the neck, looking ahead and down (o.pitch)
        h.g.updateMatrixWorld(true);
        const e = h.bones[H.BONE.neck].localToWorld(new THREE.Vector3(0, .18, .1));
        const p = o.pitch != null ? o.pitch : .55, la = 4;
        return {px: e.x, py: e.y, pz: e.z, tx: e.x + fx*la*Math.cos(p), ty: e.y - la*Math.sin(p), tz: e.z + fz*la*Math.cos(p), fov: 75};
      }
      return {px: x - lx*d, py: 1.0, pz: z - lz*d, tx: x, ty, tz: z};
    };
    // the largest turn of any bone between two snapshots of the bones' local rotations
    K.boneQ = h => h.bones.map(b => b.quaternion.clone());
    K.boneJump = (h, prev) => { let m = 0, at = -1; h.bones.forEach((b, i) => { const a = b.quaternion.angleTo(prev[i]); if (a > m){ m = a; at = i; } }); return {m, at}; };
  });
}
