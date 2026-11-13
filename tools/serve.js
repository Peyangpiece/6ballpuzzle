// Minimal static server with Range support (needed for <audio>), used by tests.
//   node tools/serve.js [dir] [port]     (PORT in the environment wins)
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.resolve(process.argv[2] || "public");
const port = Number(process.env.PORT || process.argv[3] || 8018);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".wav": "audio/wav", ".woff2": "font/woff2", ".map": "application/json", ".txt": "text/plain; charset=utf-8" };
http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(req.url.split("?")[0]); } catch (_) { res.writeHead(400); return res.end("bad request"); }
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(root, p);
  // Only files inside the served directory (a sibling such as "public-x" shares the prefix).
  if ((file !== root && !file.startsWith(root + path.sep)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("not found"); }
  const size = fs.statSync(file).size, type = types[path.extname(file)] || "application/octet-stream";
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
  if (range && (range[1] || range[2])) {
    // "a-b", "a-" and the suffix form "-n" (the last n bytes).
    let start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    let end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) { res.writeHead(416, { "Content-Range": `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1, "Accept-Ranges": "bytes" });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" });
  fs.createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
