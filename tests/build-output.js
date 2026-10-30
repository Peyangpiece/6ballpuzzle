// Production build contract: dist/ must be a faithful, cache-safe, CDN-free
// rendition of public/.  Builds into a temp dir so it never touches dist/.
const fs = require("fs"), path = require("path"), os = require("os"), assert = require("assert");
const { execFileSync } = require("child_process");
const root = path.join(__dirname, "..");
const out = fs.mkdtempSync(path.join(os.tmpdir(), "6ball-dist-"));
execFileSync(process.execPath, [path.join(root, "tools/build.js")], { cwd: root, env: { ...process.env, DIST_DIR: out }, stdio: "pipe" });
const html = fs.readFileSync(path.join(out, "index.html"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(out, "build.json"), "utf8"));
const srcHtml = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const order = JSON.parse(/var files=(\[[\s\S]*?\]);/.exec(srcHtml)[1]);
assert.deepStrictEqual(manifest.files, order, "bundle order must equal the index.html loader order");
assert(!/cdn\.|jsdelivr|unpkg|tailwindcss\.com/.test(html), "dist index.html must not reference CDNs");
assert(!/loadCurrentGameBuild|document\.write/.test(html), "dist index.html must not contain the dev loader");
for (const key of ["bundle", "css", "react", "reactDom"]) {
  assert(html.includes(manifest[key]), `index.html must reference ${key} ${manifest[key]}`);
  assert(fs.existsSync(path.join(out, manifest[key])), `${manifest[key]} must exist`);
  assert(/\.[0-9a-f]{12}\./.test(manifest[key]), `${key} must be content-hashed`);
}
assert(fs.existsSync(path.join(out, manifest.bundle + ".map")), "source map must ship");
assert(/^[0-9a-f]{40}\n$/.test(fs.readFileSync(path.join(out, "deploy-sha.txt"), "utf8")), "deploy-sha.txt must hold the commit sha");
assert(!fs.readdirSync(out).some(f => /^(app-|controls-).*\.js$/.test(f)), "individual runtime scripts must not ship");
const headers = fs.readFileSync(path.join(out, "_headers"), "utf8");
assert(/\/js\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/.test(headers), "hashed js must be immutable-cached");
assert(/\/index\.html\n\s+Cache-Control: no-cache/.test(headers), "index.html must not be cached");
assert(manifest.minBytes < manifest.rawBytes * 0.6, "minification must shrink the runtime by >40%");
// Keep the markers the orientation gate test checks for.
for (const marker of ['id="orientationGate"', "__hexLandscapeRequired=true", "__tryMountHexdrop"]) assert(html.includes(marker), "dist index.html lost " + marker);
// Every asset referenced from the bundle must exist in dist.
const bundle = fs.readFileSync(path.join(out, manifest.bundle), "utf8");
const refs = new Set([...bundle.matchAll(/\/assets\/([A-Za-z0-9_.-]+\.(?:png|jpg|mp3|ogg|m4a|wav))/g)].map(m => m[1]));
for (const a of refs) assert(fs.existsSync(path.join(out, "assets", a)), "referenced asset missing from dist: " + a);
assert(!refs.has("6ball-battle-bgm.mp3"), "the 21 MB MP3 must no longer be referenced");
let total = 0; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else total += fs.statSync(p).size; } })(out);
assert(total < 20 * 1024 * 1024, "dist exceeds 20 MB: " + total);
// Installable PWA: manifest icons exist, the service worker precaches the shell but not the BGM.
const webManifest = JSON.parse(fs.readFileSync(path.join(out, "manifest.webmanifest"), "utf8"));
for (const size of ["192x192", "512x512"]) assert(webManifest.icons.some(i => i.sizes === size && fs.existsSync(path.join(out, i.src))), "manifest icon missing: " + size);
assert(webManifest.icons.some(i => i.purpose === "maskable"), "a maskable icon is required for Android");
assert(/rel="apple-touch-icon"/.test(html) && fs.existsSync(path.join(out, "icons/apple-touch-icon.png")), "iOS home-screen icon missing");
// AdMob checks app-ads.txt at the site root (the iOS app's ads, docs/IOS.md).
assert(/^google\.com, pub-\d{16}, DIRECT, f08c47fec0942fa0$/m.test(fs.readFileSync(path.join(out, "app-ads.txt"), "utf8")), "app-ads.txt must ship with the AdMob publisher line");
const sw = fs.readFileSync(path.join(out, "sw.js"), "utf8");
const precache = JSON.parse(/const PRECACHE=(\[[^\]]*\]);/.exec(sw)[1]);
for (const key of ["bundle", "css", "react", "reactDom"]) assert(precache.includes(manifest[key]), "service worker must precache " + key);
assert(precache.includes("/") && !precache.some(p => /bgm/.test(p)), "precache the shell, never the BGM");
assert(/\/sw\.js\n\s+Cache-Control: no-cache/.test(headers), "sw.js must not be cached");
// CPU AI worker: one hashed bundle, named in index.html and precached for offline AI matches.
assert(/^\/js\/ai-worker\.[0-9a-f]{12}\.min\.js$/.test(manifest.aiWorker) && fs.existsSync(path.join(out, manifest.aiWorker)), "AI worker bundle must ship content-hashed");
assert(html.includes(`window.__sixBallAiWorkerUrl="${manifest.aiWorker}"`), "index.html must name the AI worker bundle");
assert(precache.includes(manifest.aiWorker), "service worker must precache the AI worker");
assert(!fs.existsSync(path.join(out, "ai-worker.js")), "the development worker loader must not ship");
assert(/serviceWorker\.register\("\/sw\.js"\)/.test(html), "index.html must register the service worker");
fs.rmSync(out, { recursive: true, force: true });
console.log(`build output PASS (${manifest.files.length} scripts, ${manifest.rawBytes} -> ${manifest.minBytes} bytes, dist ${(total / 1048576).toFixed(1)} MB)`);
