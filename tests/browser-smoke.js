// Real-browser smoke test of the PRODUCTION build (dist/) with Playwright.
//   npm run build && npm run test:browser
// Checks: the page mounts in landscape, is gated in portrait, an AI match
// starts and accepts input, no page/console errors, no CDN requests, the BGM
// is not downloaded before a user gesture, and the hashed bundle is served.
const fs = require("fs"), path = require("path"), assert = require("assert");
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const root = path.join(__dirname, "..");
const distDir = process.env.DIST_DIR || path.join(root, "dist");
const port = Number(process.env.PORT || 8019);
const shots = process.env.REVIEW_OUTPUT || "";
assert(fs.existsSync(path.join(distDir, "index.html")), "dist/index.html missing: run `npm run build` first");
const manifest = JSON.parse(fs.readFileSync(path.join(distDir, "build.json"), "utf8"));

(async () => {
  const server = spawn(process.execPath, [path.join(root, "tools/serve.js"), distDir], { env: { ...process.env, PORT: String(port) }, stdio: "pipe" });
  // Fail loudly if the static server cannot start (for example when the port
  // is taken); an unresolved promise here would otherwise end the process
  // silently with exit code 0.
  await new Promise((resolve, reject) => {
    let err = "";
    server.stdout.once("data", resolve);
    server.stderr.on("data", d => { err += d; });
    server.once("exit", code => reject(new Error(`static server exited with code ${code} before becoming ready on port ${port}: ${err.trim()}`)));
    setTimeout(() => reject(new Error("static server did not start within 15 s")), 15000).unref();
  });
  const url = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
  try {
    // --- portrait is gated
    const portrait = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await portrait.goto(url, { waitUntil: "load" });
    await portrait.waitForTimeout(1500);
    const gated = await portrait.evaluate(() => ({ mounted: window.__hexdropMounted === true, gateHidden: document.getElementById("orientationGate").hidden }));
    assert.strictEqual(gated.mounted, false, "portrait must not mount the game");
    assert.strictEqual(gated.gateHidden, false, "portrait must show the orientation gate");
    await portrait.close();

    // --- launch splash (automated browsers skip it unless ?splash=1): it stays
    // over the mounted menu until its animation has played, then leaves; a tap
    // ends it early.
    for (const tap of [false, true]) {
      const sp = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const spErrors = [];
      sp.on("pageerror", e => spErrors.push(String(e && e.message || e)));
      await sp.goto(url + "?splash=1", { waitUntil: "load" });
      const shown = await sp.evaluate(() => ({ boot: !!document.querySelector("#boot svg.splash"), letters: document.querySelectorAll("#boot .sl").length }));
      assert(shown.boot && shown.letters === 7, "launch splash logo is missing: " + JSON.stringify(shown));
      await sp.waitForFunction(() => window.__hexdropMounted === true, null, { timeout: 15000 });
      const t = await sp.evaluate(() => Date.now() - window.__hexSplashShownAt);
      if (tap) {
        await sp.mouse.click(640, 360);
        await sp.waitForFunction(() => !document.getElementById("boot"), null, { timeout: 1500 });
      } else {
        if (t < 1800) assert(await sp.evaluate(() => !!document.getElementById("boot")), "splash left before its animation played");
        // The splash logo and subtitle glide onto the menu's, which are hidden
        // meanwhile and shown again when the splash is removed.
        await sp.waitForFunction(() => document.getElementById("boot")?.classList.contains("handoff"), null, { timeout: 4000 });
        const left = await sp.evaluate(() => Date.now() - window.__hexSplashShownAt);
        assert(left >= 2300, "splash left after " + left + " ms, before its animation played");
        await sp.waitForFunction(() => !document.getElementById("boot"), null, { timeout: 2000 });
        const menu = await sp.evaluate(() => ({ logo: getComputedStyle(document.querySelector('#root img[src*="drop-ball-logo"]')).visibility, subtitle: [...document.querySelectorAll("#root div")].some(d => !d.children.length && d.textContent === "Connect six." && getComputedStyle(d).visibility === "visible") }));
        assert(menu.logo === "visible" && menu.subtitle, "menu logo or subtitle stayed hidden after the splash: " + JSON.stringify(menu));
      }
      await sp.getByText("AI対戦", { exact: true }).click({ timeout: 5000 });
      assert.deepStrictEqual(spErrors, [], "page errors with the splash: " + spErrors.join(" | "));
      await sp.close();
    }

    // --- landscape: full flow
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const pageErrors = [], consoleErrors = [], requests = [];
    page.on("pageerror", e => pageErrors.push(String(e && e.message || e)));
    page.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("request", r => requests.push(r.url()));
    const badResponses = [];
    page.on("response", r => { if (r.url().startsWith(url) && r.status() >= 400) badResponses.push(r.status() + " " + r.url()); });
    const t0 = Date.now();
    await page.goto(url, { waitUntil: "load" });
    let mounted = false;
    for (let i = 0; i < 60 && !mounted; i++) { mounted = await page.evaluate(() => window.__hexdropMounted === true); if (!mounted) await page.waitForTimeout(250); }
    const mountMs = Date.now() - t0;
    assert(mounted, "game did not mount in landscape");
    assert(requests.some(u => u.includes(manifest.bundle)), "hashed bundle was not requested");
    assert(requests.some(u => u.includes(manifest.css)), "precompiled css was not requested");
    assert(!requests.some(u => /jsdelivr|unpkg|tailwindcss\.com/.test(u)), "a CDN runtime was requested: " + requests.filter(u => /jsdelivr|unpkg|tailwindcss\.com/.test(u)).join(","));
    assert(!requests.some(u => /6ball-battle-bgm\.(ogg|m4a|mp3)/.test(u)), "battle BGM must not download before a user gesture");
    await page.getByText("AI対戦", { exact: true }).waitFor({ timeout: 15000 });
    if (shots) { fs.mkdirSync(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, "dist-home.png") }); }
    await page.getByText("AI対戦", { exact: true }).click();
    await page.getByText("超強い", { exact: true }).waitFor({ timeout: 10000 });
    if (shots) await page.screenshot({ path: path.join(shots, "dist-ai.png") });
    await page.getByText("超強い", { exact: true }).click();
    await page.locator("canvas").waitFor({ timeout: 10000 });
    await page.waitForTimeout(2500);
    assert(requests.some(u => /6ball-battle-bgm\.(ogg|m4a)/.test(u)), "battle BGM should start streaming after the menu gestures");
    // The BGM must actually be audible in a match (not only downloaded): the
    // match-screen detection broke once when the quit button changed.
    const bgmAudible = await page.evaluate(() => { const B = window.Bgm, a = B && B.audio; return !!(B && B.wanted && a && !a.paused && !a.muted && a.volume > 0); });
    assert(bgmAudible, "battle BGM is not audible during the match");
    // Taps on the board must not silence it (each layer once treated an in-match
    // tap as a menu tap and re-primed the BGM muted).
    const box = await page.locator("canvas").boundingBox();
    for (let i = 0; i < 3; i++) { await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5); await page.waitForTimeout(250); }
    const bgmAfterTaps = await page.evaluate(() => { const B = window.Bgm, a = B && B.audio; return !!(B && B.wanted && a && !a.paused && !a.muted && a.volume > 0); });
    assert(bgmAfterTaps, "battle BGM went silent after tapping the board");
    for (let i = 0; i < 24; i++) {
      await page.keyboard.press(i % 2 ? "ArrowLeft" : "ArrowRight");
      await page.keyboard.press("x");
      await page.keyboard.press("Space");
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(1500);
    if (shots) await page.screenshot({ path: path.join(shots, "dist-match.png") });
    // The CPU decides in the AI Web Worker; a broken worker would silently fall
    // back to a much shallower main-thread search.
    const aiAnswers = await page.evaluate(() => window.__sixBallAiWorkerAnswers | 0);
    assert(aiAnswers >= 1, "the CPU AI worker never answered");
    const state = await page.evaluate(() => ({
      canvases: document.querySelectorAll("canvas").length,
      bootError: (document.getElementById("bootMsg") || {}).textContent || "",
      bgm: { src: window.__sixBallGameplayBgmSource, lazy: window.__sixBallGameplayBgmLazy === true, warmed: window.__sixBallGameplayBgmWarmed === true },
      versions: Object.keys(window).filter(k => /^__hex.*Version$|^__sixBall.*Version$/.test(k)).length
    }));
    assert(state.canvases > 0, "gameplay canvas missing");
    assert.strictEqual(state.bootError, "", "startup error shown: " + state.bootError);
    assert(state.bgm.lazy && state.bgm.warmed, "lazy BGM did not warm up after gesture: " + JSON.stringify(state.bgm));
    assert(/\.(ogg|m4a)\?v=/.test(state.bgm.src), "BGM source must be the transcoded file, got " + state.bgm.src);
    const fps = await page.evaluate(() => new Promise(res => { let n = 0; const s = performance.now(); (function f() { n++; if (performance.now() - s < 2000) requestAnimationFrame(f); else res(n / 2); })(); }));
    assert.deepStrictEqual(badResponses, [], "same-origin 4xx/5xx responses: " + badResponses.join(" | "));
    assert(requests.some(u => /menu-confirm-42\.mp3\?v=/.test(u)), "menu click sound was not requested");
    assert.deepStrictEqual(pageErrors, [], "page errors: " + pageErrors.join(" | "));
    const realConsoleErrors = consoleErrors.filter(t => !/favicon|net::ERR_|Firebase SDK load failed/.test(t));
    assert.deepStrictEqual(realConsoleErrors, [], "console errors: " + realConsoleErrors.join(" | "));
    const sameOrigin = requests.filter(u => u.startsWith(url));
    console.log(`browser smoke PASS: mounted in ${mountMs} ms, ${sameOrigin.length} same-origin requests, ${state.versions} layer version markers, ~${fps.toFixed(0)} fps headless`);
  } finally {
    await browser.close();
    server.kill();
  }
})().catch(e => { console.error("browser smoke FAIL:", e && e.stack || e); process.exit(1); });
