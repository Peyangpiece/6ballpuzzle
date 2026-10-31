// Trophies (public/app-trophies-v1.js): the steps, leagues, road and items, and
// that the database rules (tools/trophy-rules.js), the server settlement
// (firebase/functions/settle.js) and the client settlement (Net.applyRating)
// all use the same numbers.
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const ROOT = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
// Values from the vm context are compared as JSON (other realm).
const same = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m);

const { expected, FILE, loadTrophies } = require("../tools/trophy-rules.js");
const T = loadTrophies();
const settle = require("../firebase/functions/settle.js");

// Steps: +10/0 below 300, +8/-4 below 1000, +6/-6 from 1000; never below 0.
for (const [t, w, l] of [[0, 10, 0], [299, 10, 0], [300, 8, -4], [999, 8, -4], [1000, 6, -6], [4000, 6, -6]]) {
  assert.strictEqual(T.delta(t, true), w, "win at " + t);
  assert.strictEqual(T.delta(t, false), l, "loss at " + t);
  assert.strictEqual(settle.trophyDelta(t, true), w, "server win at " + t);
  assert.strictEqual(settle.trophyDelta(t, false), l, "server loss at " + t);
  assert(t + T.delta(t, false) >= 0);
}
assert.strictEqual(read(FILE.replace(ROOT + path.sep, "")), expected(), "firebase/database.rules.json is out of date: run node tools/trophy-rules.js");
const rules = JSON.parse(read("firebase/database.rules.json")).rules;
assert.deepStrictEqual(rules.leaderboard[".indexOn"], ["rating", "trophies"], "the ranking query orders by trophies");

// Server settlement carries trophies.
const match = { meta: { ranked: true }, players: { 0: { uid: "a" }, 1: { uid: "b" } }, result: { 0: { win: true } } };
const out = settle.computeSettlement(match, "0", { a: 1000, b: 1000 }, { a: 1000, b: 290 });
assert.deepStrictEqual([out.updates.a.trophies, out.updates.a.trophyDelta, out.updates.b.trophies, out.updates.b.trophyDelta], [1006, 6, 290, 0]);
const room = settle.computeSettlement({ ...match, meta: { ranked: false } }, "0", { a: 1000, b: 1000 }, { a: 500, b: 500 });
assert.deepStrictEqual([room.updates.a.trophies, room.updates.b.trophies], [500, 500], "room matches do not move trophies");

// Leagues and the road.
same(T.LEAGUES.map(l => l.min), [0, 300, 600, 1000, 1500, 2200]);
assert.strictEqual(T.league(0).id, "BRONZE");
assert.strictEqual(T.league(299).id, "BRONZE");
assert.strictEqual(T.league(300).id, "SILVER");
assert.strictEqual(T.league(5000).id, "MASTER");
assert.strictEqual(T.nextLeague(299).id, "SILVER");
assert.strictEqual(T.nextLeague(5000), null);
const ids = T.ITEMS.map(i => i.slot + ":" + i.id);
assert.strictEqual(new Set(ids).size, ids.length, "item ids are unique per slot");
for (const slot of Object.keys(T.DEFAULTS)) assert(T.item(slot, T.DEFAULTS[slot]).min === 0, "the default " + slot + " is free");
const road = T.road();
assert(road.every((s, i) => !i || road[i - 1].min <= s.min), "the road is in trophy order");
assert.strictEqual(road.filter(s => s.kind === "item").length, T.ITEMS.filter(i => i.min > 0).length);
// Every item has its artwork: icon badges, ball images, clear-effect styles.
for (const it of T.ITEMS) {
  if (it.slot === "icon" && it.id !== "initial") assert(T.iconSrc(it.id) === "assets/icon-" + it.id + ".png" && fs.existsSync(path.join(ROOT, "public", T.iconSrc(it.id))), "icon badge " + it.id);
  if (it.slot === "ball" && it.id !== "glass") for (const c of ["red", "blue", "green", "yellow", "purple"]) assert(fs.existsSync(path.join(ROOT, "public/assets/ball-" + it.id + "-" + c + ".png")), "ball image " + it.id + "-" + c);
  if (it.slot === "fx" && it.id !== "spark") assert(read("public/app-clear-all-ball-fx.js").includes('"' + it.id + '"'), "clear effect style " + it.id);
}

// Local state: equipping needs the unlock; a lower count keeps unlocked items.
{
  const store = new Map();
  const ctx = { localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) }, window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(read("public/app-trophies-v1.js") + "\nthis.HexTrophies=HexTrophies;", ctx);
  const H = ctx.HexTrophies;
  assert.strictEqual(H.state().trophies, 0);
  assert.strictEqual(H.equip("icon", "star"), false, "locked at 0");
  H.set({ trophies: 296, best: 320 });
  assert.strictEqual(H.state().league.id, "BRONZE");
  assert.strictEqual(H.equip("icon", "bolt"), true, "200 is below best 320");
  assert.strictEqual(H.equip("ball", "pastel"), true, "300 is below best 320");
  assert.strictEqual(H.equip("ball", "neon"), false, "800 is above best");
  assert.strictEqual(ctx.window.__hexClearFxStyle, "spark");
  H.equip("fx", "color");
  assert.strictEqual(ctx.window.__hexClearFxStyle, "color");
  assert.deepStrictEqual(JSON.parse(store.get("hexdrop_trophies_v1")).equip, { icon: "bolt", ball: "pastel", fx: "color" });
  // A different account (lower best) drops what it has not unlocked.
  H.set({ trophies: 0, best: 0, equip: { icon: "bolt" } });
  same(H.state().equip, { icon: "initial", ball: "glass", fx: "spark" });
}

// Client settlement writes trophies in the same update as the match result.
const app15 = read("public/app-15.js");
assert(/const patch = \{rating: this\.profile\.rating, wins: this\.profile\.wins,losses: this\.profile\.losses, trophies: this\.profile\.trophies, best: this\.profile\.best/.test(app15), "trophies are written with lastMatch");
assert(app15.includes("HexTrophies.delta(t0, win)"));
const index = read("public/index.html");
assert(index.indexOf('"app-trophies-v1.js"') > index.indexOf('"app-menu-ui.js"') && index.indexOf('"app-trophies-v1.js"') < index.indexOf('"app-native-v1.js"'), "trophies load after the menu helpers, before the native bridge");
console.log("trophies PASS");
