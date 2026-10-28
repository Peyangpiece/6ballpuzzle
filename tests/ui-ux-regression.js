// UI/UX regressions from the 2026-10-14 audit: private rooms really use the
// network, result buttons say what they do, settings / help / pause are
// reachable, colour symbols draw, and network errors stay specific.
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const PUBLIC = path.join(__dirname, "..", "public");
const read = f => fs.readFileSync(path.join(PUBLIC, f), "utf8");
const app14 = read("app-14.js"), app16 = read("app-16.js"), app17 = read("app-17.js"), controls = read("controls-v7.js");

(async () => {
  // --- Rooms run join() with the auth UID, then restore the per-tab client id.
  const ctx = vm.createContext({ window: {}, console });
  vm.runInContext(read("app-15.js") + "\nthis.Net = Net;", ctx);
  const Net = ctx.Net;
  Net.uid = "authA"; Net.onlineClientId = "c_tab"; Net.connect = async () => "authA";
  Net.createRoom = async () => ({ code: "123456", wait: async () => ({ idDuringJoin: Net.onlineClientId }), cancel: async () => {} });
  const host = await Net.hostRoom();
  assert.strictEqual(host.code, "123456");
  assert.strictEqual(Net.onlineClientId, "c_tab", "client id must not change before waiting");
  const hosted = await host.wait();
  assert.strictEqual(hosted.idDuringJoin, "authA", "host join must use the auth UID that the rules check");
  assert.strictEqual(Net.onlineClientId, "c_tab", "client id restored after host join");
  const host2 = await Net.hostRoom();
  const pending = host2.wait();
  assert.strictEqual(Net.onlineClientId, "authA");
  await host2.cancel();
  assert.strictEqual(Net.onlineClientId, "c_tab", "cancelling a room restores the client id");
  void pending;
  Net.joinRoom = async () => ({ idDuringJoin: Net.onlineClientId });
  assert.strictEqual((await Net.joinRoomCode("123456")).idDuringJoin, "authA", "guest join must use the auth UID");
  assert.strictEqual(Net.onlineClientId, "c_tab");
  Net.joinRoom = async () => { throw new Error("その部屋は見つかりません"); };
  await assert.rejects(Net.joinRoomCode("000000"), /見つかりません/);
  assert.strictEqual(Net.onlineClientId, "c_tab", "client id restored after a failed join");

  // --- Specific, actionable network errors.
  const c17 = vm.createContext({ window: {}, React: {}, console });
  vm.runInContext(app17 + "\nthis.f = hexFriendlyNetError;", c17);
  const f = c17.f;
  assert.strictEqual(f("その部屋は見つかりません"), "その部屋は見つかりません。");
  assert(/拒否/.test(f("マッチング待機情報を書き込めません: PERMISSION_DENIED")));
  assert(/インターネット/.test(f("Firebase SDK を読み込めませんでした")));
  assert(/もう一度/.test(f("")));

  // --- Playable tutorial lessons: goals and retries from engine events.
  const ct = vm.createContext({ window: {}, React: {}, console, SPAWN_X: 9, pendingIncomingCount: g => g.pending || 0 });
  vm.runInContext(app17 + "\nthis.L = HEX_TUTORIAL_LESSONS; this.obs = hexTutorialObserve; this.tr = hexTutorialTracker;", ct);
  const play = (lesson, frames) => { const t = ct.tr(); let r = null; for (const f of frames) { const g = { queue: [], piece: f.piece || null, pieceVX: f.vx ?? 9, events: f.ev || [], state: f.state || "PLAYING", pending: f.pending || 0 }; r = ct.obs(g, lesson, t) || r; if (r) break; } return r; };
  assert.strictEqual(ct.L.length, 5, "five lessons");
  assert.strictEqual(play(0, [{ piece: {}, vx: 9, ev: [{ t: "land" }] }]), null, "dropping without moving does not pass lesson 1");
  assert.strictEqual(play(0, [{ piece: {}, vx: 11 }, { ev: [{ t: "land" }] }]), "success", "moving then dropping passes lesson 1");
  assert.strictEqual(play(1, [{ ev: [{ t: "rotate" }] }, { ev: [{ t: "land" }] }]), "success", "rotating then dropping passes lesson 2");
  assert.strictEqual(play(2, [{ ev: [{ t: "land" }, { t: "clear" }] }]), "success", "a clear passes lesson 3");
  assert(/^retry:/.test(play(3, [{ ev: [{ t: "land" }, { t: "clear" }] }])), "a clear without a technique retries lesson 4");
  assert.strictEqual(play(3, [{ ev: [{ t: "land" }, { t: "clear" }, { t: "waza", w: "PYRAMID" }] }]), "success", "a technique passes lesson 4");
  assert.strictEqual(play(4, [{ ev: [{ t: "land" }, { t: "garbage" }], state: "RESOLVING", pending: 6 }]), null, "lesson 5 waits for the garbage to land");
  assert.strictEqual(play(4, [{ ev: [{ t: "land" }, { t: "garbage" }], state: "RESOLVING", pending: 6 }, { state: "PLAYING", pending: 0 }]), "success", "lesson 5 passes once the garbage has landed");
  assert(/else if \(!tutorialRef\.current\) stepEngine\(foe, h\)/.test(app16), "the tutorial must not simulate an opponent");
  assert(/onPractice:\(\)=>\{initUiAudio\(\);startTutorial\(0\);\}/.test(app16), "the tutorial cards lead into the playable lessons");

  // --- Ball and background drawing (app-10.js), in the production physics stack.
  const { ctx: game } = require("./v1303-plan-group-smoke.js");
  // A canvas context that records every call; gradients are inert objects.
  const recCtx = (extra = {}) => {
    const ops = [];
    const c = new Proxy(Object.assign({ globalAlpha: 1, filter: "none", ops }, extra), {
      get(t, k) {
        if (k in t) return t[k];
        if (typeof k !== "string") return undefined;
        return (...a) => { ops.push(k); return /Gradient$/.test(k) ? { addColorStop() {} } : undefined; };
      }
    });
    return c;
  };
  const symbolOps = c => { const i = c.ops.indexOf("translate"); return i < 0 ? null : c.ops.slice(i).join(","); };
  // Colour symbols are drawn only when enabled, one shape per colour, after the ball.
  game.__sixBallColorSymbols = false;
  const off = recCtx(); game.drawBall(off, 10, 10, 40, 0, {});
  assert(off.ops.length > 0, "the ball itself must still be drawn");
  assert.strictEqual(symbolOps(off), null, "no symbol while the setting is off");
  game.__sixBallColorSymbols = true;
  const shapes = new Set();
  for (let ci = 0; ci < 5; ci++) { const k = recCtx(); game.drawBall(k, 10, 10, 40, ci, {}); const sym = symbolOps(k); assert(sym && sym.includes("fill"), "symbol for colour " + ci); shapes.add(sym); }
  assert.strictEqual(shapes.size, 5, "each colour needs a distinct symbol");
  const tiny = recCtx(); game.drawBall(tiny, 10, 10, 8, 0, {}); assert.strictEqual(symbolOps(tiny), null, "no symbol on tiny previews");
  game.__sixBallColorSymbols = false;

  // Mobile performance: the static background is a CSS layer.
  vm.runInContext("getStaticBackgroundCanvas=()=>({toDataURL:()=>'data:image/png;base64,AAA'});", game);
  const plain = recCtx({ canvas: {} }); game.drawBackground(plain, 0);
  assert(!plain.ops.includes("clearRect") && /drawImage|fillRect/.test(plain.ops[0]), "an unmarked canvas keeps the full background");
  const layered = recCtx({ canvas: { __sixBallBgLayer: true } }); game.drawBackground(layered, 0);
  assert.strictEqual(layered.ops[0], "clearRect", "a marked canvas is cleared first");
  assert(!layered.ops.includes("drawImage"), "a marked canvas must not redraw the static background");
  assert.strictEqual(game.__sixBallStaticBackgroundUrl(), "data:image/png;base64,AAA");

  // Defeat animation: a filtered ball draw uses a cached filtered sprite (one filter pass per colour).
  const sprites = [];
  game.document.createElement = () => { const c = { width: 0, height: 0, filterDraws: 0 }; c.getContext = () => ({ set filter(v) { c.filter = v; }, get filter() { return c.filter || "none"; }, drawImage() { c.filterDraws++; } }); sprites.push(c); return c; };
  vm.runInContext("BALL_IMG[0]={complete:true,naturalWidth:64,naturalHeight:64};", game);
  const drawn = [];
  const ctx2 = { filter: "none", globalAlpha: 1, drawImage: (img, x, y, w, h) => drawn.push({ img, filter: ctx2.filter, w }) };
  game.drawBall(ctx2, 10, 10, 40, 0, {});
  assert.strictEqual(sprites.length, 0, "unfiltered balls keep the normal drawing");
  ctx2.filter = "grayscale(1)";
  for (let i = 0; i < 5; i++) game.drawBall(ctx2, 10, 10, 40, 0, {});
  assert.strictEqual(sprites.length, 1, "one cached sprite per colour and filter");
  assert.strictEqual(sprites[0].filterDraws, 1, "the filter is applied to the sprite once");
  assert(drawn.length === 6 && drawn.slice(1).every(d => d.filter === "none" && d.w === 40 && sprites.includes(d.img)), "cached sprite drawn without a live filter");
  assert.strictEqual(ctx2.filter, "grayscale(1)", "the caller's filter is restored");
  assert(/backgroundImage: `url\(\$\{bgLayerUrl\}\)`/.test(app16) && /cv\.__sixBallBgLayer = !!bgLayerUrl/.test(app16), "the App shows the static background behind the canvas");

  // --- Source contracts for the audited defects.
  assert(!/startMatch\(\s*"FRIEND"/.test(app16), "rooms must not start a local CPU match");
  assert(/beginOnline\(match,"ROOM"\)/.test(app16), "rooms must start a networked match");
  assert(/Net\.hostRoom\(\)/.test(app17) && /Net\.joinRoomCode\(code\)/.test(app17), "room screens must use the network API");
  // Ranked matchmaking (2026-10-16): the rules permit only the lobby/pairings
  // scheme keyed by the account uid, and a transaction only sees a lobby slot
  // while something listens to it.
  assert(!/"online(Queue|Pairings|Claims)/.test(read("app-online-v2.js")), "ranked matchmaking must use the lobby/pairings paths the database rules permit");
  assert(/F\.onValue\(F\.ref\(this\.db, "lobby\/" \+ b \+ "\/waiting"\)/.test(read("app-15.js")), "matchmaking keeps a listener on each lobby slot so claim() transactions start from the server value");
  assert(!app14.includes("○○"), "result buttons must not show placeholder glyphs");
  assert(app14.includes('"メニューへ"') && /nextLabel\|\|"もう一度"/.test(app14), "result buttons say what they do");
  assert(/aiLevel<5\?"次のレベルへ":"もう一度"/.test(app16) && /const lv=aiLevel\+1;startMatch\("CPU",lv,/.test(app16), "a CPU win offers the next level, the top level and a loss replay the same one");
  assert(!/onClick:onExit[^)]*"[^"]*ヒント/.test(app14), "the exit button must not be labelled as a hint");
  assert(/\["SETTINGS","設定"/.test(app16) && /\["HELP","遊び方"/.test(app16), "settings and help must be reachable from HOME");
  assert(app16.includes("HexPauseMenu") && app14.includes("降参してメニューへ"), "leaving a match goes through the pause / quit dialog");
  assert(!/HexControlGuide|helpRef|noteControl/.test(app16 + app14), "no control guide may cover the boards during a match");
  assert(/setScreen\("TUTORIAL"\)/.test(app16) && /screen==="TUTORIAL"&&React\.createElement\(HexTutorial/.test(app16), "the tutorial must be reachable from HOME");
  assert(/function HexTutorial\(/.test(app17) && /hexdrop_tutorial_done/.test(app17), "tutorial component must exist and remember completion");
  assert(/half:p\.x>=ME\.X\+ME\.BW\/2/.test(controls), "tap rotation is relative to the player's own board");
  assert(/!window\.__sixBallPaused/.test(controls), "touch input is ignored while paused");
  assert(!app14.includes('slice(0,7)'), "player names must not be cut to 7 characters");
  assert(app16.includes('e.key === "ArrowDown"'), "keyboard needs a soft drop");
  assert(!/reportResult\(false, "resign"\);matchRef\.current\.leave\(\)/.test(app16), "resigning must not leave before finish() records the loss");
  assert(/matchGenRef\.current === gen\) setScreen\("RESULT"\)/.test(app16), "a stale result must not cover the menu or a newer match");
  // --- Phone behaviour (2026-10-14 mobile audit).
  assert(/if \(scr !== "GAME" && scr !== "RESULT"\) \{ pausedSig = ""; return; \}/.test(app16), "nothing may be simulated or drawn behind the menus");
  assert(/if \(pausedSig === sig\) return;/.test(app16), "a paused match is drawn once, not every frame");
  assert(/window\.innerWidth < window\.innerHeight;if \(away && stateRef\.current\.screen === "GAME" && !matchRef\.current/.test(app16), "rotating to portrait pauses an offline match");
  assert(/history\.pushState\(\{ sixball: 1 \}/.test(app16) && /addEventListener\("popstate"/.test(app16), "the phone back button must navigate inside the app");
  assert(/navigator\.wakeLock\.request\("screen"\)/.test(app16), "the screen stays on while playing or waiting");
  assert(/typeof navigator\.vibrate==="function"\)&&React\.createElement\(HexSettingToggle,\{label:"振動"/.test(app16), "the vibration setting is hidden where it cannot work");
  assert(/ctx\.font=`900 28px \$\{F\}`/.test(app14) && app14.includes('"800 24px ui-sans-serif, system-ui, sans-serif"'), "HUD text is large enough at phone scale");
  assert(!/おじゃま予告/.test(app14 + app17), "badge and tutorial texts agree on 「おじゃま」");
  // BGM starts when the match screen is shown; it recognises that screen by the pause button.
  const bgmSrc = read("app-bgm-local.js");
  assert(bgmSrc.includes(`button[aria-label="ポーズメニューを開く"]`) && app16.includes('"aria-label": "ポーズメニューを開く"'), "BGM match detection must follow the in-game pause button");
  // Icons: no SVG favicon that would win over the logo icons.
  const indexHtml = read("index.html");
  assert(!/rel="icon" href="data:image\/svg/.test(indexHtml) && /rel="apple-touch-icon" sizes="180x180"/.test(indexHtml), "home-screen icons must be the logo PNGs");
  // Every layer that recognises the match by the old "✕" button must also accept the pause button.
  for (const f of fs.readdirSync(PUBLIC).filter(f => /\.js$/.test(f))) {
    const src = read(f);
    if (/textContent\|\|""\)\.trim\(\)==="✕"/.test(src)) assert(src.includes('button[aria-label="ポーズメニューを開く"]'), f + " detects the match only by the removed ✕ button");
  }
  // --- Match records: bests and per-CPU-level wins/losses/streaks, shown on the result screen.
  {
    const store = new Map();
    const rc = vm.createContext({ console, window: {}, localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)) } });
    vm.runInContext(read("app-menu-ui.js") + "\nthis.api={hexRecordMatch,hexCpuRecord,hexBests,hexMatchSummary,hexFormatTime};", rc);
    const { hexRecordMatch, hexCpuRecord, hexBests, hexMatchSummary, hexFormatTime } = rc.api;
    const sum = (o) => hexMatchSummary({ stats: { time: 0, maxChain: 0, cleared: 0, waza: {}, ...o } });
    const s1 = sum({ time: 120, maxChain: 2, cleared: 30, waza: { PYRAMID: 1 } });
    assert.strictEqual(s1.wazaTotal, 1);
    let r = hexRecordMatch({ cpuLevel: 3, win: true, summary: s1 });
    assert.deepStrictEqual([...r.newBests], [], "the first match sets bests without announcing them");
    assert(r.firstWin && r.level.w === 1 && r.level.streak === 1, "first win against a level");
    r = hexRecordMatch({ cpuLevel: 3, win: true, summary: sum({ time: 90, maxChain: 3, cleared: 20, waza: { HEXAGON: 1 } }) });
    assert(!r.firstWin && r.level.streak === 2 && r.level.best === 2);
    assert.deepStrictEqual([...r.newBests].sort(), ["fastestWin", "maxChain"], "only improved bests are announced");
    r = hexRecordMatch({ cpuLevel: 3, win: false, summary: sum({ time: 60, cleared: 50 }) });
    assert(r.level.streak === 0 && r.level.l === 1 && r.level.best === 2, "a loss ends the streak but keeps the best streak");
    assert.deepStrictEqual([...r.newBests], ["cleared"], "a loss can still set a best, but never the fastest win");
    assert.strictEqual(hexBests().fastestWin, 90);
    r = hexRecordMatch({ cpuLevel: 0, win: true, summary: s1 });
    assert.strictEqual(r.level, null, "online matches do not touch the CPU record");
    assert.strictEqual(hexBests().games, 4);
    assert.deepStrictEqual({ ...hexCpuRecord()[3] }, { w: 2, l: 1, streak: 0, best: 2 });
    store.set("hexdrop_cpu_record", "{broken"); store.set("hexdrop_bests", "null");
    assert.strictEqual(hexCpuRecord()[5].w, 0, "a broken record reads as empty");
    assert.strictEqual(hexBests().games, 0);
    assert.strictEqual(hexFormatTime(95.4), "1:35");
  }
  assert(/me\.stats\.time = \(me\.stats\.time \|\| 0\) \+ h/.test(app16), "match time is counted while the player's game runs");
  assert(/hexRecordMatch\(\{ cpuLevel: m === "CPU" \? lv : 0, win, summary \}\)/.test(app16) && /summary:result\?\.summary,progress:result\?\.progress/.test(app16), "finished matches are recorded and passed to the result screen");
  assert(/summary&&React\.createElement\(ResultSummary,/.test(app14), "the result screen shows the match summary");
  assert(/cpuRecord\[lv\]\.w\?\{text:"勝利"/.test(app16) && /data-hex-cpu-progress/.test(app16), "the CPU list shows which levels were beaten");
  console.log("ui-ux regression PASS");
})().catch(e => { console.error("ui-ux regression FAIL:", e && e.stack || e); process.exit(1); });
