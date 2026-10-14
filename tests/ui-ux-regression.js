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

  // --- Colour symbols are drawn only when enabled, one shape per colour.
  const calls = [];
  const fakeCtx = () => {
    const ops = [];
    const c = { globalAlpha: 1, ops };
    for (const m of ["save", "restore", "translate", "beginPath", "lineTo", "moveTo", "closePath", "arc", "rect", "stroke", "fill"]) c[m] = (...a) => ops.push(m + (m === "rect" || m === "arc" ? ":" + a.length : ""));
    return c;
  };
  const cs = vm.createContext({ window: { __sixBallColorSymbols: false }, console, drawBall: (...a) => calls.push(a) });
  vm.runInContext(read("app-ui-ux-v1.js") + "\nthis.draw = drawBall;", cs);
  const off = fakeCtx(); cs.draw(off, 10, 10, 40, 0, {});
  assert.strictEqual(calls.length, 1, "base ball must still be drawn");
  assert(!off.ops.includes("fill"), "no symbol while the setting is off");
  cs.window.__sixBallColorSymbols = true;
  const shapes = new Set();
  for (let ci = 0; ci < 5; ci++) { const k = fakeCtx(); cs.draw(k, 10, 10, 40, ci, {}); assert(k.ops.includes("fill"), "symbol for colour " + ci); shapes.add(k.ops.join(",")); }
  assert.strictEqual(shapes.size, 5, "each colour needs a distinct symbol");
  const tiny = fakeCtx(); cs.draw(tiny, 10, 10, 8, 0, {}); assert(!tiny.ops.includes("fill"), "no symbol on tiny previews");

  // --- Source contracts for the audited defects.
  assert(!/startMatch\(\s*"FRIEND"/.test(app16), "rooms must not start a local CPU match");
  assert(/beginOnline\(match,"ROOM"\)/.test(app16), "rooms must start a networked match");
  assert(/Net\.hostRoom\(\)/.test(app17) && /Net\.joinRoomCode\(code\)/.test(app17), "room screens must use the network API");
  assert(!app14.includes("○○"), "result buttons must not show placeholder glyphs");
  assert(app14.includes('"メニューへ"') && /nextLabel\|\|"もう一度"/.test(app14), "result buttons say what they do");
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
  assert(/ctx\.font=`900 28px \$\{F\}`/.test(app14) && app14.includes('"900 30px ui-sans-serif, system-ui, sans-serif"'), "HUD text is large enough at phone scale");
  assert(!/おじゃま予告/.test(app14 + app17), "badge and tutorial texts agree on 「おじゃま」");
  console.log("ui-ux regression PASS");
})().catch(e => { console.error("ui-ux regression FAIL:", e && e.stack || e); process.exit(1); });
