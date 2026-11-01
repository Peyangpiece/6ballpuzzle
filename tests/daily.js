// Daily challenge (public/app-daily-v1.js): the day in Japan time, the seed
// that gives everyone the same pieces, the 20-piece limit, the best of the
// day, and claiming today's points once (streak, bonus) with the numbers the
// database rules check (tools/trophy-rules.js).
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const ROOT = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const { DAILY } = require("../tools/trophy-rules.js");

function load({ profile = {}, now = Date.UTC(2026, 9, 31, 3, 0) } = {}) {
  const store = new Map(), writes = [];
  const RealDate = Date;
  class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const Net = {
    uid: "u1", fb: null, db: {}, profile: { name: "Hanako", trophies: 0, best: 0, equip: { icon: "star" }, ...profile },
    async connect() { return "u1"; }, async reloadProfile() { return this.profile; },
    syncTrophies() { this.synced = (this.synced || 0) + 1; },
    leaderboardEntry() { return { name: this.profile.name, trophies: 0, icon: (this.profile.equip || {}).icon || "initial" }; }
  };
  Net.fb = {
    ref: (_, p) => p, serverTimestamp: () => "ts",
    update: async (p, v) => { writes.push(["update", p, v]); },
    set: async (p, v) => { writes.push(["set", p, v]); }
  };
  const spawned = [];
  const ctx = { console, Date: FakeDate, Math, Net, HexPlayerName: { display: n => n },
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
    React: {}, useState: () => [], useEffect: () => {} };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext("function spawn(g){spawned.push(g.piecesUsed);g.piece={};}", Object.assign(ctx, { spawned }));
  vm.runInContext(read("public/app-daily-v1.js") + "\nthis.HexDaily=HexDaily;", ctx);
  return { D: ctx.HexDaily, ctx, Net, writes, store, spawned };
}

(async () => {
  // Day numbers follow Japan time: 23:59 and 00:00 JST are different days.
  {
    const { D } = load();
    const before = D.day(Date.UTC(2026, 9, 31, 14, 59)), after = D.day(Date.UTC(2026, 9, 31, 15, 0));
    assert.strictEqual(after, before + 1, "the challenge changes at 0:00 JST");
    assert.strictEqual(D.label(after), "11月1日");
    assert.strictEqual(D.seedFor(before), D.seedFor(before), "same day, same seed");
    assert.notStrictEqual(D.seedFor(before), D.seedFor(after), "a new seed every day");
    assert.strictEqual(D.PIECES, 20);
  }
  // Rewards stay inside what the rules accept.
  {
    const { D } = load();
    assert.strictEqual(D.reward(0), DAILY.min);
    assert.strictEqual(D.reward(1e9), DAILY.max);
    assert.strictEqual(D.reward(400), 50);
    assert.strictEqual(D.STREAK_EVERY, DAILY.streakEvery);
    assert.strictEqual(D.STREAK_BONUS, DAILY.streakBonus);
    assert.strictEqual(D.bonus(7), DAILY.streakBonus);
    assert.strictEqual(D.bonus(6), 0);
  }
  // The piece limit: 20 pieces, then challengeDone instead of a 21st.
  {
    const { ctx, spawned } = load();
    const g = { pieceLimit: 20 };
    for (let i = 0; i < 21; i++) vm.runInContext("spawn", ctx)(g);
    assert.strictEqual(g.piecesUsed, 20);
    assert.strictEqual(spawned.length, 20, "no 21st piece");
    assert.strictEqual(g.challengeDone, true);
    const free = {};
    for (let i = 0; i < 30; i++) vm.runInContext("spawn", ctx)(free);
    assert.strictEqual(free.challengeDone, undefined, "other modes are not limited");
  }
  // Best of the day, kept on this device.
  {
    const { D } = load();
    assert.strictEqual(D.record(500).best, 500);
    assert.strictEqual(D.record(300).best, 500);
    assert.strictEqual(D.today().plays, 2);
  }
  // Claiming: once per day, streak from yesterday, the bonus on day 7.
  {
    const { D, Net, writes } = load({ profile: { points: 40 } });
    const today = D.day();
    const c = await D.claim(800);
    assert.strictEqual(c.claimed, true);
    assert.deepStrictEqual([c.gain, c.streak, c.points], [70, 1, 110], "first day: 30 + 800/20 = 70");
    const w = writes.find(x => x[0] === "update");
    assert.strictEqual(w[1], "users/u1");
    assert.deepStrictEqual({ points: w[2].points, dailyDay: w[2].dailyDay, streak: w[2].streak }, { points: 110, dailyDay: today, streak: 1 });
    assert((await D.claim(2000)).claimed === false, "only once per day");
    assert(Net.synced >= 1, "trophy state (points) refreshed");
  }
  {
    const base = load().D.day();
    const { D } = load({ profile: { points: 0, dailyDay: base - 1, streak: 6 } });
    const c = await D.claim(0);
    assert.deepStrictEqual([c.streak, c.gain, c.bonus], [7, 30 + 100, 100], "7th day in a row: +100");
    const { D: D2 } = load({ profile: { points: 0, dailyDay: base - 2, streak: 6 } });
    assert.strictEqual((await D2.claim(0)).streak, 1, "a missed day restarts the streak");
  }
  // The ranking entry carries the name, the best score and the equipped icon.
  {
    const { D, writes } = load();
    await D.submit(1234);
    const w = writes.find(x => x[0] === "set");
    assert.strictEqual(w[1], "daily/" + D.day() + "/u1");
    assert.deepStrictEqual(Object.assign({}, w[2]), { name: "Hanako", score: 1234, icon: "star" });
  }
  // Wiring in the app.
  const app16 = read("public/app-16.js"), index = read("public/index.html");
  assert(/me\.pieceLimit = HexDaily\.PIECES/.test(app16), "the daily mode limits the pieces");
  assert(app16.includes("createEngine(seed, { offset: false, gravityRamp: false })") && app16.includes("HexDaily.seedFor(day)"), "today's seed, no speed-up");
  const daily = read("public/app-daily-v1.js");
  assert(daily.includes('pointerEvents:done?"auto":"none"') && daily.includes('const bs={minHeight:40,pointerEvents:"auto"}') && !daily.includes("style:{minHeight:40}"), "while playing, touches on the panel reach the game; its buttons still take them");
  assert(app16.includes('title:"デイリーチャレンジ"'), "the home screen offers the daily challenge");
  assert(app16.includes("else if (!tutorialRef.current && !dailyRef.current) stepEngine(foe, h);"), "no opponent in the daily challenge");
  assert(index.indexOf('"app-daily-v1.js"') > index.indexOf('"app-trophies-v1.js"') && index.indexOf('"app-daily-v1.js"') > index.indexOf('"app-05.js"'), "the daily layer wraps spawn after the engine");
  console.log("daily PASS");
})().catch(e => { console.error("daily FAIL:", e && e.stack || e); process.exit(1); });
