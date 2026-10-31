// Trophy ranking (Net.fetchLeaderboard in app-15.js, screen in app-16.js):
// most trophies first, ties share a rank, at most `limit` rows, entries from
// before trophies count 0, works before the ".indexOn" rule is deployed, and
// the home screen links to it.
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const PUBLIC = path.join(__dirname, "..", "public");
const read = f => fs.readFileSync(path.join(PUBLIC, f), "utf8");

function snapshot(obj) {
  return { forEach(fn) { for (const [key, v] of Object.entries(obj)) fn({ key, val: () => v }); } };
}
function load(entries, { indexed }) {
  const F = {
    ref: (_, p) => ({ path: p }),
    query: (ref, ...parts) => ({ path: ref.path, parts }),
    orderByChild: k => ["orderByChild", k], limitToLast: n => ["limitToLast", n],
    get: async q => {
      if (q.parts && !indexed) throw new Error('Index not defined, add ".indexOn": "trophies", for path "/leaderboard", to the rules');
      if (q.parts) {
        assert.deepStrictEqual(q.parts.find(p => p[0] === "orderByChild"), ["orderByChild", "trophies"]);
        const n = q.parts.find(p => p[0] === "limitToLast")[1];
        return snapshot(Object.fromEntries(Object.entries(entries).sort((a, b) => (a[1].trophies || 0) - (b[1].trophies || 0)).slice(-n)));
      }
      return snapshot(entries);
    }
  };
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read("app-player-name-v1.js") + "\nthis.HexPlayerName=HexPlayerName;", ctx);
  vm.runInContext(read("app-14.js").match(/const FIREBASE_CONFIG = \{[^}]*\};/)[0], ctx);
  vm.runInContext(read("app-15.js") + "\nthis.Net=Net;", ctx);
  const Net = ctx.Net;
  Net.connect = async () => { Net.fb = F; Net.db = {}; Net.uid = "me"; return "me"; };
  return Net;
}

(async () => {
  const entries = { a: { name: "A", rating: 900, trophies: 410, icon: "star" }, b: { name: "B", rating: 1300, trophies: 120 }, me: { name: "Me", rating: 1050, trophies: 120 }, c: { name: "C", rating: 2000 }, d: { name: "D", rating: 1000, trophies: 1500, icon: "crown" } };
  for (const indexed of [true, false]) {
    const { rows, me } = await load(entries, { indexed }).fetchLeaderboard(4);
    assert.strictEqual(me, "me");
    assert.deepStrictEqual(Array.from(rows, r => r.uid), ["d", "a", "b", "me"], "highest first, limited (indexed=" + indexed + ")");
    assert.deepStrictEqual(Array.from(rows, r => r.rank), [1, 2, 3, 3], "equal trophies share a rank");
    assert.deepStrictEqual(Array.from(rows, r => r.trophies), [1500, 410, 120, 120], "rows carry trophies");
    assert.deepStrictEqual(Array.from(rows, r => r.icon), ["crown", "star", "initial", "initial"], "rows carry the icon");
  }
  // Names come from other clients: an offensive one is shown as "Player".
  const named = await load({ x: { name: "f.u.c.k", trophies: 300 }, y: { name: "Hanako", trophies: 10 } }, { indexed: true }).fetchLeaderboard(5);
  assert.deepStrictEqual(Array.from(named.rows, r => r.name), ["Player", "Hanako"], "ranking names pass the name filter");
  const app16 = read("app-16.js");
  assert(app16.includes(`["RANKING","ランキング","trophy"]`), "the home screen links to the ranking");
  assert(/const rankingScreen=screen==="RANKING"/.test(app16) && app16.includes("rankingScreen,"), "the ranking screen is rendered");
  assert(read("index.html").includes("limitToLast:d.limitToLast"), "the SDK loader exports the query functions");
  const rules = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "firebase", "database.rules.json"), "utf8"));
  assert.deepStrictEqual(rules.rules.leaderboard[".indexOn"], ["rating", "trophies"], "leaderboard is indexed by trophies");
  console.log("leaderboard PASS");
})().catch(e => { console.error("leaderboard FAIL:", e && e.stack || e); process.exit(1); });
