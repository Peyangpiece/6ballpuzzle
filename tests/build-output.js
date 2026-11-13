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
assert(/\/\*\n(?:\s+[^\n]+\n)*\s+Strict-Transport-Security: max-age=\d+/.test(headers) && /X-Content-Type-Options: nosniff/.test(headers), "every response carries HSTS and nosniff");
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
// What the game can show offline is precached: every skin, avatar icon, sound, the logo and the font.
for (const a of fs.readdirSync(path.join(out, "assets")).filter(f => /\.(png|svg|mp3|wav)$/.test(f) && !/bgm/.test(f))) assert(precache.includes("/assets/" + a), "service worker must precache /assets/" + a);
assert(precache.some(p => /^\/assets\/fonts\/.*\.woff2$/.test(p)), "service worker must precache the UI font");
for (const p of precache) assert(fs.existsSync(path.join(out, p === "/" ? "index.html" : p)), "precached file missing from dist: " + p);
// The cache name must change when an unhashed precached file changes (same name, new content).
{
  const version = (dir) => /const VERSION="([^"]+)"/.exec(fs.readFileSync(path.join(dir, "sw.js"), "utf8"))[1];
  const out2 = fs.mkdtempSync(path.join(os.tmpdir(), "6ball-dist-"));
  const icon = path.join(root, "public/icons/favicon-32.png"), original = fs.readFileSync(icon);
  try {
    fs.writeFileSync(icon, Buffer.concat([original, Buffer.from([0])]));
    execFileSync(process.execPath, [path.join(root, "tools/build.js")], { cwd: root, env: { ...process.env, DIST_DIR: out2 }, stdio: "pipe" });
  } finally { fs.writeFileSync(icon, original); }
  assert.notStrictEqual(version(out2), version(out), "a changed icon under the same name must produce a new service worker version");
  fs.rmSync(out2, { recursive: true, force: true });
}
// Service worker behaviour, run against a fake Cache Storage and network.
const swRun = (async () => {
  const vm = require("vm"), origin = "https://game.test";
  const store = new Map(), handlers = {}, net = { online: true, log: [] };
  const key = (req, o) => { const u = new URL(typeof req === "string" ? req : req.url, origin); return o && o.ignoreSearch ? u.origin + u.pathname : u.href; };
  class FakeResponse { constructor(body, init = {}) { this.body = body; this.ok = init.ok !== false; this.type = init.type || "basic"; this.redirected = !!init.redirected; } clone() { return this; } static error() { return new FakeResponse("", { ok: false, type: "error" }); } }
  class FakeRequest { constructor(url, init = {}) { this.url = new URL(url, origin).href; this.method = init.method || "GET"; this.mode = init.mode || "no-cors"; this.cache = init.cache || "default"; this.headers = { has: h => !!(init.headers && init.headers[h]) }; } }
  const cacheApi = (name) => ({
    addAll: async (reqs) => { for (const r of reqs) { assert.strictEqual(r.cache, "reload", "precache must bypass the HTTP cache"); store.get(name).set(key(r), new FakeResponse("precached " + new URL(r.url).pathname)); } },
    put: async (r, res) => { store.get(name).set(key(r), res); }
  });
  const caches = {
    open: async (name) => { if (!store.has(name)) store.set(name, new Map()); return cacheApi(name); },
    keys: async () => [...store.keys()],
    delete: async (name) => store.delete(name),
    match: async (r, o) => { for (const m of store.values()) for (const [k, v] of m) if ((o && o.ignoreSearch ? key(k, o) : k) === key(r, o)) return v; return undefined; }
  };
  const fetchFake = async (r) => { net.log.push(new URL(r.url).pathname); if (!net.online) throw new TypeError("offline"); return new FakeResponse("network " + new URL(r.url).pathname + new URL(r.url).search); };
  const self = { addEventListener: (t, f) => { handlers[t] = f; }, skipWaiting: async () => {}, clients: { claim: async () => {} } };
  vm.runInNewContext(sw, { self, caches, fetch: fetchFake, URL, Request: FakeRequest, Response: FakeResponse, location: { origin }, Promise });
  const lifecycle = async (type) => { let p; handlers[type]({ waitUntil: (q) => { p = q; } }); await p; };
  // Returns the body the worker answered with, or null when it left the request to the browser.
  const request = async (url, init) => { let p = null; handlers.fetch({ request: new FakeRequest(url, init), respondWith: (q) => { p = q; } }); if (!p) return null; const res = await p; await new Promise(r => setImmediate(r)); return res.body; };
  store.set("6ball-oldversion", new Map());
  await lifecycle("install"); await lifecycle("activate");
  assert.deepStrictEqual([...store.keys()].length, 1, "activation must delete older caches");
  const nav = { mode: "navigate" };
  assert.strictEqual(await request("/", nav), "network /", "online launch must come from the network");
  // The privacy policy (or any other page) must never replace the cached shell.
  assert.strictEqual(await request("/privacy.html", nav), null, "other pages must be left to the browser");
  assert.strictEqual(await request("/privacy", nav), null, "other pages must be left to the browser");
  net.online = false;
  assert.strictEqual(await request("/", nav), "network /", "offline launch must show the last game shell");
  assert.strictEqual(await request("/?room=123456", nav), "network /", "an invitation link opened offline must show the game shell");
  assert.strictEqual(await request(manifest.bundle), "precached " + manifest.bundle, "the bundle must be served from the cache offline");
  assert.strictEqual(await request("/assets/menu-confirm-42.mp3?v=2"), "precached /assets/menu-confirm-42.mp3", "versioned asset URLs must hit the precache offline");
  net.online = true; net.log.length = 0;
  assert.strictEqual(await request("/assets/6ball-battle-bgm.m4a"), null, "the BGM must not go through the cache");
  assert.strictEqual(await request("/assets/menu-confirm-42.mp3", { headers: { range: "bytes=0-" } }), null, "range requests must not go through the cache");
  for (const p of ["/deploy-sha.txt", "/build.json", "/sw.js", "/app-01.js?v=dev", "/privacy.html"]) assert.strictEqual(await request(p), null, p + " must not be cached by the worker");
  assert.strictEqual(await request("https://other.test/x.js"), null, "other origins must be left alone");
  assert.deepStrictEqual(net.log, [], "requests the worker ignores must not be fetched by it");
})();
// CPU AI worker: one hashed bundle, named in index.html and precached for offline AI matches.
assert(/^\/js\/ai-worker\.[0-9a-f]{12}\.min\.js$/.test(manifest.aiWorker) && fs.existsSync(path.join(out, manifest.aiWorker)), "AI worker bundle must ship content-hashed");
assert(html.includes(`window.__sixBallAiWorkerUrl="${manifest.aiWorker}"`), "index.html must name the AI worker bundle");
assert(precache.includes(manifest.aiWorker), "service worker must precache the AI worker");
assert(!fs.existsSync(path.join(out, "ai-worker.js")), "the development worker loader must not ship");
assert(/serviceWorker\.register\("\/sw\.js"\)/.test(html), "index.html must register the service worker");
swRun.then(() => {
fs.rmSync(out, { recursive: true, force: true });
console.log(`build output PASS (${manifest.files.length} scripts, ${manifest.rawBytes} -> ${manifest.minBytes} bytes, dist ${(total / 1048576).toFixed(1)} MB)`);
}).catch(e => { console.error(e && e.stack || e); process.exit(1); });
