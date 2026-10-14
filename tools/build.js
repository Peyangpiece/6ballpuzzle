#!/usr/bin/env node
/* Production build: public/ -> dist/
 *
 * - Reads the runtime load order from the `var files=[...]` array in
 *   public/index.html (that array stays the single source of truth; tests
 *   parse the same array).
 * - Concatenates the scripts in that order, minifies them with esbuild and
 *   writes one content-hashed bundle plus a source map.  Classic scripts
 *   share one global scope, so concatenation preserves the semantics of the
 *   sequential <script> tags (a duplicate top-level const/let would already
 *   have been a SyntaxError in production).
 * - Rewrites index.html to load the bundle, the local React copies and the
 *   precompiled Tailwind CSS (no CDN runtime).
 * - Copies every other static file, writes `_headers` for long-lived caching
 *   of hashed files, and refuses to ship superseded source scripts.
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const esbuild = require("esbuild");

const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const DIST = process.env.DIST_DIR ? path.resolve(process.env.DIST_DIR) : path.join(ROOT, "dist");

function hash(buf) { return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 12); }
function read(p) { return fs.readFileSync(p); }
function readText(p) { return fs.readFileSync(p, "utf8"); }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function copyTree(src, dst, skip) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name), d = path.join(dst, entry.name);
    const rel = path.relative(PUBLIC, s);
    if (skip(rel, entry)) continue;
    if (entry.isDirectory()) { ensureDir(d); copyTree(s, d, skip); }
    else { ensureDir(path.dirname(d)); fs.copyFileSync(s, d); }
  }
}

function loadOrder(indexHtml) {
  const m = /var files=(\[[\s\S]*?\]);/.exec(indexHtml);
  if (!m) throw new Error("public/index.html: `var files=[...]` loader array not found");
  const files = JSON.parse(m[1].replace(/,\s*\]$/, "]"));
  for (const f of files) {
    if (!/^[a-z0-9-]+\.js$/.test(f)) throw new Error("unexpected loader entry " + f);
    if (!fs.existsSync(path.join(PUBLIC, f))) throw new Error("loader references missing file " + f);
  }
  return files;
}

async function main() {
  const t0 = Date.now();
  const indexSrc = readText(path.join(PUBLIC, "index.html"));
  const files = loadOrder(indexSrc);

  // 1. bundle
  let concat = "";
  for (const f of files) {
    concat += `\n;/* ==== ${f} ==== */\n` + readText(path.join(PUBLIC, f)) + "\n;\n";
  }
  const result = await esbuild.transform(concat, {
    minify: true,
    target: ["es2020"],
    sourcemap: "external",
    sourcefile: "6ball.concat.js",
    legalComments: "none",
    logLevel: "warning"
  });
  const jsHash = hash(Buffer.from(result.code));
  const bundleName = `6ball.${jsHash}.min.js`;
  const bundleCode = result.code + `\n//# sourceMappingURL=/js/${bundleName}.map\n`;

  // 2. css
  const cssPath = path.join(PUBLIC, "tailwind.css");
  if (!fs.existsSync(cssPath)) throw new Error("public/tailwind.css missing: run `npm run build:css` first");
  const css = read(cssPath);
  const cssName = `tailwind.${hash(css)}.css`;

  // 3. vendor react (content-hashed path)
  const vendorDir = path.join(PUBLIC, "vendor", "react@18.3.1");
  const react = read(path.join(vendorDir, "react.production.min.js"));
  const reactDom = read(path.join(vendorDir, "react-dom.production.min.js"));
  const reactName = `react.${hash(react)}.min.js`, reactDomName = `react-dom.${hash(reactDom)}.min.js`;

  // 4. rewrite index.html
  let html = indexSrc;
  const replaceOnce = (needle, replacement, label) => {
    const idx = typeof needle === "string" ? html.indexOf(needle) : html.search(needle);
    if (idx < 0) throw new Error("index.html: could not find " + label);
    html = html.replace(needle, replacement);
  };
  replaceOnce(/<script src="\/vendor\/react@18\.3\.1\/react\.production\.min\.js"><\/script>/, `<script src="/vendor/${reactName}"></script>`, "react script tag");
  replaceOnce(/<script src="\/vendor\/react@18\.3\.1\/react-dom\.production\.min\.js"><\/script>/, `<script src="/vendor/${reactDomName}"></script>`, "react-dom script tag");
  replaceOnce(/<link rel="stylesheet" href="\/tailwind\.css">/, `<link rel="stylesheet" href="/css/${cssName}">`, "tailwind stylesheet link");
  replaceOnce(/<script>\s*\(function loadCurrentGameBuild\(\)\{[\s\S]*?\}\)\(\);\s*<\/script>/, `<script src="/js/${bundleName}"></script>`, "game loader block");
  if (/cdn\.tailwindcss\.com|cdn\.jsdelivr\.net|unpkg\.com/.test(html)) throw new Error("index.html still references a CDN runtime");

  // 5. write dist
  fs.rmSync(DIST, { recursive: true, force: true });
  ensureDir(path.join(DIST, "js")); ensureDir(path.join(DIST, "css")); ensureDir(path.join(DIST, "vendor"));
  copyTree(PUBLIC, DIST, (rel, entry) => {
    if (rel === "index.html" || rel === "tailwind.css") return true;
    if (/^(app-.*|controls-.*)\.js$/.test(rel)) return true;          // bundled
    if (rel === "vendor" || rel.startsWith("vendor" + path.sep)) return true; // re-emitted hashed
    if (entry.name.startsWith(".") && entry.name !== ".assetsignore") return true;
    return false;
  });
  fs.writeFileSync(path.join(DIST, "index.html"), html);
  fs.writeFileSync(path.join(DIST, "js", bundleName), bundleCode);
  fs.writeFileSync(path.join(DIST, "js", bundleName + ".map"), result.map);
  fs.writeFileSync(path.join(DIST, "css", cssName), css);
  fs.writeFileSync(path.join(DIST, "vendor", reactName), react);
  fs.writeFileSync(path.join(DIST, "vendor", reactDomName), reactDom);
  fs.writeFileSync(path.join(DIST, "_headers"), [
    "/", "  Cache-Control: no-cache", "",
    "/index.html", "  Cache-Control: no-cache", "",
    "/deploy-sha.txt", "  Cache-Control: no-cache", "",
    "/build.json", "  Cache-Control: no-cache", "",
    "/manifest.webmanifest", "  Cache-Control: no-cache", "",
    "/sw.js", "  Cache-Control: no-cache", "",
    "/icons/*", "  Cache-Control: public, max-age=86400", "",
    "/js/*", "  Cache-Control: public, max-age=31536000, immutable", "",
    "/css/*", "  Cache-Control: public, max-age=31536000, immutable", "",
    "/vendor/*", "  Cache-Control: public, max-age=31536000, immutable", "",
    "/assets/*", "  Cache-Control: public, max-age=86400", "",
    "/*", "  X-Content-Type-Options: nosniff", "  Referrer-Policy: strict-origin-when-cross-origin", ""
  ].join("\n"));
  // Service worker: precache the app shell so AI matches and the tutorial
  // work offline and the app is installable. The battle BGM (9 MB, loaded
  // only after a gesture) and audio range requests are left to the network.
  const assetRefs = [...new Set([...bundleCode.matchAll(/\/assets\/([A-Za-z0-9_.-]+\.(?:png|mp3|wav))/g)].map(m => "/assets/" + m[1]))]
    .filter(p => fs.existsSync(path.join(DIST, p)));
  const icons = fs.readdirSync(path.join(DIST, "icons")).filter(f => f.endsWith(".png")).map(f => "/icons/" + f);
  const precache = ["/", `/js/${bundleName}`, `/css/${cssName}`, `/vendor/${reactName}`, `/vendor/${reactDomName}`, "/manifest.webmanifest", ...icons, ...assetRefs];
  const swVersion = "6ball-" + hash(Buffer.from(JSON.stringify(precache) + jsHash));
  fs.writeFileSync(path.join(DIST, "sw.js"), `/* generated by tools/build.js */
const VERSION=${JSON.stringify(swVersion)};
const PRECACHE=${JSON.stringify(precache)};
self.addEventListener("install",e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(PRECACHE)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("6ball-")&&k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",e=>{
  const r=e.request;if(r.method!=="GET"||r.headers.has("range"))return;
  const u=new URL(r.url);if(u.origin!==location.origin)return;
  if(r.mode==="navigate"){
    // Network first so a new deploy is picked up; the cached shell is the offline fallback.
    e.respondWith(fetch(r).then(res=>{if(res.ok){const copy=res.clone();caches.open(VERSION).then(c=>c.put("/",copy));}return res;}).catch(()=>caches.match("/")));
    return;
  }
  if(/^\\/(deploy-sha\\.txt|build\\.json|sw\\.js)$/.test(u.pathname)||/bgm/.test(u.pathname))return;
  e.respondWith(caches.match(r,{ignoreSearch:true}).then(hit=>hit||fetch(r).then(res=>{if(res.ok&&res.type==="basic"){const copy=res.clone();caches.open(VERSION).then(c=>c.put(r,copy));}return res;})));
});
`);
  // Deployment stamp: the verify step compares this with the pushed commit.
  const sha = process.env.GITHUB_SHA || process.env.WORKERS_CI_COMMIT_SHA || (() => { try { return require("child_process").execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, stdio: "pipe" }).toString().trim(); } catch (_) { return "unknown"; } })();
  fs.writeFileSync(path.join(DIST, "deploy-sha.txt"), sha + "\n");
  const manifest = {
    builtAt: new Date().toISOString(), commit: sha,
    bundle: `/js/${bundleName}`, css: `/css/${cssName}`,
    react: `/vendor/${reactName}`, reactDom: `/vendor/${reactDomName}`,
    files, rawBytes: Buffer.byteLength(concat), minBytes: Buffer.byteLength(bundleCode)
  };
  fs.writeFileSync(path.join(DIST, "build.json"), JSON.stringify(manifest, null, 2));
  console.log(`build ok: ${files.length} scripts -> ${bundleName} (${manifest.rawBytes} -> ${manifest.minBytes} bytes), css ${cssName}, ${Date.now() - t0} ms`);
}

main().catch(err => { console.error(err && err.stack || err); process.exit(1); });
