// qa/serve.mjs: the static file server every QA script runs the game from.
// Owner: I0 (DESIGN 2.1, harness contract 2.0).
//
// It serves the repository this file sits in (resolved from its own location, so a worktree serves its own files),
// with the right MIME types, no caching, and the query string ignored (index.html asks for every script with ?v=).
// GET /__qa_root answers with the absolute root, so a test can tell whether a server already on its port is serving
// this tree or another one.
//
//   CLI:     QA_PORT=8769 node qa/serve.mjs          (or: node qa/serve.mjs 8769)
//   module:  import {ensureServer} from "./serve.mjs"; await ensureServer(port);
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PORT = +(process.env.QA_PORT || 8765);
export const HOST = "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
  ".wasm": "application/wasm", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".mp4": "video/mp4", ".webm": "video/webm"
};
export const mimeOf = file => MIME[path.extname(file).toLowerCase()] || "application/octet-stream";

function handler(root){
  return (req, res) => {
    const head = {"Cache-Control": "no-store", "Access-Control-Allow-Origin": "*"};
    if (req.method !== "GET" && req.method !== "HEAD"){ res.writeHead(405, head); res.end(); return; }
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, "http://x").pathname); }
    catch(e){ res.writeHead(400, head); res.end("bad request"); return; }
    if (rel === "/__qa_root"){ res.writeHead(200, {...head, "Content-Type": "text/plain; charset=utf-8"}); res.end(root); return; }
    let file = path.resolve(root, "." + rel);
    if (file !== root && !file.startsWith(root + path.sep)){ res.writeHead(403, head); res.end("forbidden"); return; }
    fs.stat(file, (err, st) => {
      if (!err && st.isDirectory()){ file = path.join(file, "index.html"); try { st = fs.statSync(file); } catch(e){ err = e; } }
      if (err || !st.isFile()){ res.writeHead(404, {...head, "Content-Type": "text/plain; charset=utf-8"}); res.end("not found: " + rel); return; }
      res.writeHead(200, {...head, "Content-Type": mimeOf(file), "Content-Length": st.size});
      if (req.method === "HEAD"){ res.end(); return; }
      fs.createReadStream(file).on("error", () => res.destroy()).pipe(res);
    });
  };
}

// start a server; resolves with the http.Server once it is listening
export function serve({port = PORT, root = ROOT, host = HOST} = {}){
  return new Promise((resolve, reject) => {
    const srv = http.createServer(handler(root));
    srv.once("error", reject);
    srv.listen(port, host, () => { srv.off("error", reject); resolve(srv); });
  });
}

// what is answering on the port: the root it serves, "" for a server that is not one of these, null for nothing
export function probe(port = PORT, host = HOST, ms = 1500){
  return new Promise(resolve => {
    const req = http.get({host, port, path: "/__qa_root", timeout: ms}, res => {
      let body = ""; res.setEncoding("utf8");
      res.on("data", c => body += c);
      res.on("end", () => resolve(res.statusCode === 200 ? body : ""));
    });
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.on("error", () => resolve(null));
  });
}

// make sure this tree is being served on the port. Starts a server in this process when nothing answers (it does
// not keep the process alive by itself: unref'd). Refuses a port that is serving another tree, since every result
// would then describe somebody else's files.
export async function ensureServer(port = PORT, root = ROOT){
  const got = await probe(port);
  if (got === root) return {started: false, server: null, port, root};
  if (got != null) throw new Error(`port ${port} is already serving ${got ? got : "something that is not qa/serve.mjs"}, not ${root}. Set QA_PORT to a free port.`);
  let server;
  try { server = await serve({port, root}); }
  catch(e){
    // two scripts racing for the same free port: the other one won, and that is fine if it serves this tree
    if (e && e.code === "EADDRINUSE" && await probe(port) === root) return {started: false, server: null, port, root};
    throw e;
  }
  server.unref();
  return {started: true, server, port, root};
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain){
  const port = +(process.argv[2] || PORT);
  const srv = await serve({port});
  console.log(`serving ${ROOT} on http://${HOST}:${port}/ (pid ${process.pid})`);
  const stop = () => srv.close(() => process.exit(0));
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
}
