// Realtime Database security rules contract, executed against the Firebase
// emulator.  Run via:  npm run test:rules   (needs Java + firebase-tools).
// Every scenario mirrors a real client flow in public/app-15.js / app-16.js.
const path = require("path"), fs = require("fs");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");

const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9000";
const [emuHost, emuPort] = host.split(":");
const rules = fs.readFileSync(path.join(__dirname, "..", "firebase", "database.rules.json"), "utf8");
const clientSrc = fs.readFileSync(path.join(__dirname, "..", "public", "app-14.js"), "utf8");
const eloDelta = new Function(/const eloDelta = \(mine, foe, win\) => [^;]*;/.exec(clientSrc)[0] + "return eloDelta;")();
// What F.serverTimestamp() sends: the server fills in its own time.
const SERVER_TIMESTAMP = { ".sv": "timestamp" };
let passed = 0, failed = 0;
// A settlement as the client writes it (Net.applyRating): the profile fields
// and matches/{mid}/settled/{uid} in one multi-path update.
function settle(db, uid, patch) {
  const u = {};
  for (const k of Object.keys(patch)) u["users/" + uid + "/" + k] = patch[k];
  if (typeof patch.lastMatch === "string") u["matches/" + patch.lastMatch + "/settled/" + uid] = true;
  return db.ref().update(u);
}
async function ok(label, p) { try { await assertSucceeds(p); passed++; console.log("  ok   " + label); } catch (e) { failed++; console.log("  FAIL " + label + " :: " + (e && e.message || e).split("\n")[0]); } }
async function deny(label, p) { try { await assertFails(p); passed++; console.log("  ok   " + label + " (denied)"); } catch (e) { failed++; console.log("  FAIL " + label + " :: expected denial"); } }

(async () => {
  const env = await initializeTestEnvironment({ projectId: "demo-6ball", database: { rules, host: emuHost, port: Number(emuPort) } });
  await env.clearDatabase();
  const A = env.authenticatedContext("uidA").database(), B = env.authenticatedContext("uidB").database(), C = env.authenticatedContext("uidC").database();
  const anon = env.unauthenticatedContext().database();
  const profile = uid => ({ name: "P-" + uid, rating: 1000, wins: 0, losses: 0, updatedAt: Date.now() });

  console.log("users");
  await deny("unauthenticated read users", anon.ref("users/uidA").get());
  await ok("A creates own profile", A.ref("users/uidA").set(profile("uidA")));
  await ok("B creates own profile", B.ref("users/uidB").set(profile("uidB")));
  await deny("A cannot create B profile", A.ref("users/uidC").set(profile("uidC")));
  await deny("initial rating must be 1000", C.ref("users/uidC").set({ ...profile("uidC"), rating: 2500 }));
  await deny("unknown field rejected", A.ref("users/uidA").update({ admin: true }));
  await ok("A renames self (client nickname flow)", A.ref("users/uidA").update({ name: "Alice", updatedAt: Date.now() }));
  await deny("name too long", A.ref("users/uidA").update({ name: "x".repeat(40), updatedAt: Date.now() }));
  await deny("rating change without a finished match", A.ref("users/uidA").update({ rating: 1016, wins: 1, losses: 0, updatedAt: Date.now() }));

  console.log("matches");
  const mid = "m1";
  const match = { meta: { seed: 123, ranked: true, createdAt: Date.now() }, players: { 0: { uid: "uidA", name: "Alice", rating: 1000, connected: false }, 1: { uid: "uidB", name: "Bob", rating: 1000, connected: false } } };
  await deny("C cannot create a match between A and B", C.ref("matches/" + mid).set(match));
  await deny("match must record the opponent's true rating", B.ref("matches/" + mid).set({ ...match, players: { 0: { ...match.players[0], rating: 1900 }, 1: match.players[1] } }));
  await deny("match must record the creator's true rating", B.ref("matches/" + mid).set({ ...match, players: { 0: match.players[0], 1: { ...match.players[1], rating: 100 } } }));
  await ok("B (a player) creates the match", B.ref("matches/" + mid).set(match));
  await ok("A records joinedAt", A.ref("matches/" + mid + "/players/0/joinedAt").set(Date.now()));
  await deny("joinedAt is write-once", A.ref("matches/" + mid + "/players/0/joinedAt").set(Date.now() + 1));
  await deny("A cannot forge B's joinedAt", A.ref("matches/" + mid + "/players/1/joinedAt").set(Date.now()));
  await deny("no result before both players joined", A.ref("matches/" + mid + "/result/0").set({ win: true, reason: "foe-dead", ts: Date.now() }));
  await ok("B records joinedAt", B.ref("matches/" + mid + "/players/1/joinedAt").set(Date.now()));
  await deny("match cannot be overwritten", A.ref("matches/" + mid).set(match));
  await deny("C cannot read the match", C.ref("matches/" + mid).get());
  await ok("A reads the match", A.ref("matches/" + mid).get());
  await ok("A marks own connected", A.ref("matches/" + mid + "/players/0/connected").set(true));
  await deny("A cannot mark B connected", A.ref("matches/" + mid + "/players/1/connected").set(true));
  await ok("A writes own state", A.ref("matches/" + mid + "/state/0").set({ board: "x", incoming: 0, alive: true, ts: Date.now() }));
  await deny("A cannot write B state", A.ref("matches/" + mid + "/state/1").set({ board: "x", ts: Date.now() }));
  await ok("A attacks B", A.ref("matches/" + mid + "/attacks/1").push({ n: 19, shapes: ["STRAIGHT"], ts: Date.now() }));
  await deny("A cannot attack self", A.ref("matches/" + mid + "/attacks/0").push({ n: 19, shapes: [], ts: Date.now() }));
  await deny("attack above board capacity", A.ref("matches/" + mid + "/attacks/1").push({ n: 999, shapes: [], ts: Date.now() }));
  await deny("attack with unknown shape", A.ref("matches/" + mid + "/attacks/1").push({ n: 6, shapes: ["NUKE"], ts: Date.now() }));
  await deny("C cannot attack", C.ref("matches/" + mid + "/attacks/1").push({ n: 6, shapes: [], ts: Date.now() }));
  await deny("A cannot write B result", A.ref("matches/" + mid + "/result/1").set({ win: false, reason: "x", ts: Date.now() }));
  await ok("A reports own result", A.ref("matches/" + mid + "/result/0").set({ win: true, reason: "foe-dead", ts: Date.now() }));
  await deny("result is write-once", A.ref("matches/" + mid + "/result/0").set({ win: true, reason: "again", ts: Date.now() }));

  console.log("rating");
  await deny("rating without lastResult", settle(A, "uidA", { rating: 1016, wins: 1, losses: 0, lastMatch: mid, updatedAt: Date.now() }));
  await deny("rating with the wrong delta (+15)", settle(A, "uidA", { rating: 1015, wins: 1, losses: 0, lastMatch: mid, lastResult: "win", updatedAt: Date.now() }));
  await deny("rating with the wrong delta (+17)", settle(A, "uidA", { rating: 1017, wins: 1, losses: 0, lastMatch: mid, lastResult: "win", updatedAt: Date.now() }));
  await deny("winner cannot claim a loss", settle(A, "uidA", { rating: 984, wins: 0, losses: 1, lastMatch: mid, lastResult: "loss", updatedAt: Date.now() }));
  await deny("wins must follow the outcome", settle(A, "uidA", { rating: 1016, wins: 0, losses: 0, lastMatch: mid, lastResult: "win", updatedAt: Date.now() }));
  await ok("A applies the exact +16 after match m1", settle(A, "uidA", { rating: 1016, wins: 1, losses: 0, lastMatch: mid, lastResult: "win", updatedAt: Date.now() }));
  await deny("same match cannot be applied twice", settle(A, "uidA", { rating: 1032, wins: 2, losses: 0, lastMatch: mid, lastResult: "win", updatedAt: Date.now() }));
  await deny("rating change without a real match", settle(A, "uidA", { rating: 1500, wins: 1, losses: 0, lastMatch: "m-none", lastResult: "win", updatedAt: Date.now() }));
  await deny("lastMatch must reference a finished match with A", C.ref("users/uidC").set(profile("uidC")).then(() => settle(C, "uidC", { rating: 1016, wins: 1, losses: 0, lastMatch: mid, lastResult: "win", updatedAt: Date.now() })));
  await deny("loser cannot claim a win", settle(B, "uidB", { rating: 1016, wins: 1, losses: 0, lastMatch: mid, lastResult: "win", updatedAt: Date.now() }));
  await deny("losses cannot jump", settle(B, "uidB", { rating: 984, wins: 0, losses: 5, lastMatch: mid, lastResult: "loss", updatedAt: Date.now() }));
  await ok("B applies the exact -16 after match m1", settle(B, "uidB", { rating: 984, wins: 0, losses: 1, lastMatch: mid, lastResult: "loss", updatedAt: Date.now() }));

  console.log("leaderboard");
  await ok("A publishes own leaderboard entry", A.ref("leaderboard/uidA").set({ name: "Alice", rating: 1016 }));
  await deny("leaderboard rating must equal profile rating", A.ref("leaderboard/uidA").set({ name: "Alice", rating: 9999 }));
  await deny("B cannot write A entry", B.ref("leaderboard/uidA").set({ name: "Alice", rating: 1016 }));
  await ok("anyone signed-in reads leaderboard", C.ref("leaderboard").get());
  await deny("anonymous cannot read leaderboard", anon.ref("leaderboard").get());

  console.log("lobby / pairings / rooms");
  await ok("A waits in band 10", A.ref("lobby/10/waiting").set({ uid: "uidA", name: "Alice", rating: 1016, ts: Date.now() }));
  await deny("B cannot impersonate A in lobby", B.ref("lobby/10/waiting").set({ uid: "uidA", name: "Alice", rating: 1016, ts: Date.now() }));
  await ok("B claims (clears) the waiting slot", B.ref("lobby/10/waiting").set(null));
  const mid2 = "m2";
  await ok("B creates match m2 with host A", B.ref("matches/" + mid2).set({ meta: { seed: 1, ranked: true, createdAt: Date.now() }, players: { 0: { uid: "uidA", name: "Alice", rating: 1016, connected: false }, 1: { uid: "uidB", name: "Bob", rating: 984, connected: false } } }));
  await ok("B pairs host A to m2", B.ref("pairings/uidA").set(mid2));
  await deny("C cannot pair A to m2", C.ref("pairings/uidA").set(mid2));
  await deny("B cannot read A pairing", B.ref("pairings/uidA").get());
  await ok("A reads own pairing", A.ref("pairings/uidA").get());
  await ok("A clears own pairing", A.ref("pairings/uidA").set(null));
  await ok("A creates room 123456", A.ref("rooms/123456").set({ hostUid: "uidA", hostName: "Alice", hostRating: 1016, createdAt: Date.now(), matchId: null }));
  await deny("B cannot create a room as A", B.ref("rooms/222222").set({ hostUid: "uidA", hostName: "Alice", hostRating: 1016, createdAt: Date.now(), matchId: null }));
  const mid3 = "m3";
  await ok("B creates room match m3", B.ref("matches/" + mid3).set({ meta: { seed: 2, ranked: false, createdAt: Date.now() }, players: { 0: { uid: "uidA", name: "Alice", rating: 1016, connected: false }, 1: { uid: "uidB", name: "Bob", rating: 984, connected: false } } }));
  await deny("C cannot attach a match to A's room", C.ref("rooms/123456").update({ matchId: mid3 }));
  await ok("B joins room with m3", B.ref("rooms/123456").update({ matchId: mid3 }));
  await deny("room cannot be re-joined", C.ref("rooms/123456").update({ matchId: mid3 }));
  await deny("B cannot delete A's room", B.ref("rooms/123456").set(null));
  await ok("A deletes own room", A.ref("rooms/123456").set(null));

  console.log("unranked room match, contradictory results, Elo parity sweep");
  const admin = fn => env.withSecurityRulesDisabled(ctx => fn(ctx.database()));
  await admin(db => db.ref("users/uidB/lastMatch").set(null));
  await ok("B joins room match m3", B.ref("matches/" + mid3 + "/players/1/joinedAt").set(Date.now()));
  await ok("A joins room match m3", A.ref("matches/" + mid3 + "/players/0/joinedAt").set(Date.now()));
  await ok("B reports m3 loss", B.ref("matches/" + mid3 + "/result/1").set({ win: false, reason: "dead", ts: Date.now() }));
  await deny("unranked: rating must not move", settle(A, "uidA", { rating: 1032, wins: 2, losses: 0, lastMatch: mid3, lastResult: "win", updatedAt: Date.now() }));
  await ok("unranked: win counted, rating unchanged", settle(A, "uidA", { rating: 1016, wins: 2, losses: 0, lastMatch: mid3, lastResult: "win", updatedAt: Date.now() }));
  await ok("unranked: loss counted for B", settle(B, "uidB", { rating: 984, wins: 0, losses: 2, lastMatch: mid3, lastResult: "loss", updatedAt: Date.now() }));
  const mid5 = "m5";
  await ok("A creates m5", A.ref("matches/" + mid5).set({ meta: { seed: 5, ranked: true, createdAt: Date.now() }, players: { 0: { uid: "uidA", name: "Alice", rating: 1016, connected: false }, 1: { uid: "uidB", name: "Bob", rating: 984, connected: false } } }));
  await ok("A joins m5", A.ref("matches/" + mid5 + "/players/0/joinedAt").set(Date.now()));
  await ok("B joins m5", B.ref("matches/" + mid5 + "/players/1/joinedAt").set(Date.now()));
  await ok("A claims m5 win", A.ref("matches/" + mid5 + "/result/0").set({ win: true, reason: "foe-dead", ts: Date.now() }));
  await ok("B also claims m5 win (contradiction)", B.ref("matches/" + mid5 + "/result/1").set({ win: true, reason: "foe-dead", ts: Date.now() }));
  await deny("contradictory results settle nobody (B)", settle(B, "uidB", { rating: 984 + eloDelta(984, 1016, true), wins: 1, losses: 2, lastMatch: mid5, lastResult: "win", updatedAt: Date.now() }));
  await deny("contradictory results settle nobody (A)", settle(A, "uidA", { rating: 1016 + eloDelta(1016, 984, true), wins: 3, losses: 0, lastMatch: mid5, lastResult: "win", updatedAt: Date.now() }));
  let seed = 20261012; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let sweepOk = 0, sweepDenied = 0;
  for (let i = 0; i < 40; i++) {
    const m = Math.floor(rnd() * 4001), f = Math.floor(rnd() * 4001), w = rnd() < 0.5;
    const X = "sx" + i, Y = "sy" + i, mid = "sweep" + i;
    await admin(async db => {
      await db.ref("users/" + X).set({ name: X, rating: m, wins: 0, losses: 0, updatedAt: 1 });
      await db.ref("users/" + Y).set({ name: Y, rating: f, wins: 0, losses: 0, updatedAt: 1 });
      await db.ref("matches/" + mid).set({ meta: { seed: i, ranked: true, createdAt: 1 }, players: { 0: { uid: X, name: X, rating: m, connected: true, joinedAt: 1 }, 1: { uid: Y, name: Y, rating: f, connected: true, joinedAt: 1 } }, result: { 0: { win: w, reason: "t", ts: 1 } } });
    });
    const cx = env.authenticatedContext(X).database(), cy = env.authenticatedContext(Y).database();
    const dx = eloDelta(m, f, w), dy = eloDelta(f, m, !w);
    const rx = Math.max(0, m + dx), ry = Math.max(0, f + dy);
    const wrongX = rx + (rx < 4000 ? 1 : -1), wrongY = ry + (ry < 4000 ? 1 : -1);
    try { await assertFails(settle(cx, X, { rating: wrongX, wins: w ? 1 : 0, losses: w ? 0 : 1, lastMatch: mid, lastResult: w ? "win" : "loss", updatedAt: 2 })); sweepDenied++; } catch (e) { failed++; console.log(`  FAIL sweep ${i} accepted wrong X rating ${wrongX} (m=${m} f=${f} w=${w})`); }
    try { await assertSucceeds(settle(cx, X, { rating: rx, wins: w ? 1 : 0, losses: w ? 0 : 1, lastMatch: mid, lastResult: w ? "win" : "loss", updatedAt: 2 })); sweepOk++; } catch (e) { failed++; console.log(`  FAIL sweep ${i} rejected correct X rating ${rx} (m=${m} f=${f} w=${w})`); }
    try { await assertFails(settle(cy, Y, { rating: wrongY, wins: w ? 0 : 1, losses: w ? 1 : 0, lastMatch: mid, lastResult: w ? "loss" : "win", updatedAt: 2 })); sweepDenied++; } catch (e) { failed++; console.log(`  FAIL sweep ${i} accepted wrong Y rating ${wrongY}`); }
    try { await assertSucceeds(settle(cy, Y, { rating: ry, wins: w ? 0 : 1, losses: w ? 1 : 0, lastMatch: mid, lastResult: w ? "loss" : "win", updatedAt: 2 })); sweepOk++; } catch (e) { failed++; console.log(`  FAIL sweep ${i} rejected correct Y rating ${ry} (m=${m} f=${f} w=${w})`); }
  }
  passed += sweepOk + sweepDenied;
  console.log(`  ok   Elo parity sweep: ${sweepOk} exact settlements accepted, ${sweepDenied} off-by-one settlements denied`);

  console.log("trophies, best, equipped items");
  {
    const D = env.authenticatedContext("uidD").database(), E = env.authenticatedContext("uidE").database();
    await deny("a new profile starts at 0 trophies", D.ref("users/uidD").set({ ...profile("uidD"), trophies: 50, best: 50 }));
    await ok("D creates a profile with 0 trophies", D.ref("users/uidD").set({ ...profile("uidD"), trophies: 0, best: 0 }));
    await ok("E creates a profile without trophies (older client)", E.ref("users/uidE").set(profile("uidE")));
    await deny("trophies cannot move without a match", D.ref("users/uidD").update({ trophies: 10, best: 10 }));
    const t1 = "mT1", players = { 0: { uid: "uidD", name: "D", rating: 1000, trophies: 0, icon: "initial", connected: false }, 1: { uid: "uidE", name: "E", rating: 1000, trophies: 0, icon: "initial", connected: false } };
    await deny("a match must record the true trophies", D.ref("matches/" + t1).set({ meta: { seed: 1, ranked: true, createdAt: Date.now() }, players: { ...players, 1: { ...players[1], trophies: 900 } } }));
    await deny("a match must record the equipped icon", D.ref("matches/" + t1).set({ meta: { seed: 1, ranked: true, createdAt: Date.now() }, players: { ...players, 0: { ...players[0], icon: "crown" } } }));
    await ok("D creates ranked match mT1 with trophies and icons", D.ref("matches/" + t1).set({ meta: { seed: 1, ranked: true, createdAt: Date.now() }, players }));
    await ok("D joins mT1", D.ref("matches/" + t1 + "/players/0/joinedAt").set(Date.now()));
    await ok("E joins mT1", E.ref("matches/" + t1 + "/players/1/joinedAt").set(Date.now()));
    await ok("D reports the mT1 win", D.ref("matches/" + t1 + "/result/0").set({ win: true, reason: "foe-dead", ts: Date.now() }));
    const won = { rating: 1016, wins: 1, losses: 0, lastMatch: t1, lastResult: "win", updatedAt: Date.now() };
    await deny("win below 300 is +10, not +20", settle(D, "uidD", { ...won, trophies: 20, best: 20 }));
    await deny("best follows trophies", settle(D, "uidD", { ...won, trophies: 10, best: 50 }));
    await ok("D wins: +10 trophies", settle(D, "uidD", { ...won, trophies: 10, best: 10 }));
    const lost = { rating: 984, wins: 0, losses: 1, lastMatch: t1, lastResult: "loss", updatedAt: Date.now() };
    await deny("a loss below 300 costs nothing", settle(E, "uidE", { ...lost, trophies: 0 - 4 }));
    await ok("E loses below 300: still 0", settle(E, "uidE", { ...lost, trophies: 0, best: 0 }));
    await deny("trophies cannot move again for the same match", D.ref("users/uidD").update({ trophies: 20, best: 20, updatedAt: Date.now() }));
    await deny("best never goes down", D.ref("users/uidD").update({ best: 0 }));
    await deny("icon not unlocked yet (star at 50)", D.ref("users/uidD/equip/icon").set("star"));
    // Bands above 300 and 1000.
    await admin(db => db.ref("users/uidD").update({ trophies: 300, best: 300 }));
    await admin(db => db.ref("users/uidE").update({ trophies: 1000, best: 1000 }));
    const t2 = "mT2";
    await ok("D creates mT2", D.ref("matches/" + t2).set({ meta: { seed: 2, ranked: true, createdAt: Date.now() }, players: { 0: { uid: "uidD", name: "D", rating: 1016, trophies: 300, icon: "initial", connected: false }, 1: { uid: "uidE", name: "E", rating: 984, trophies: 1000, icon: "initial", connected: false } } }));
    await ok("D joins mT2", D.ref("matches/" + t2 + "/players/0/joinedAt").set(Date.now()));
    await ok("E joins mT2", E.ref("matches/" + t2 + "/players/1/joinedAt").set(Date.now()));
    await ok("E reports the mT2 win", E.ref("matches/" + t2 + "/result/1").set({ win: true, reason: "foe-dead", ts: Date.now() }));
    const dLost = { rating: 1016 + eloDelta(1016, 984, false), wins: 1, losses: 1, lastMatch: t2, lastResult: "loss", updatedAt: Date.now() };
    await deny("a loss at 300 is -4, not 0", settle(D, "uidD", { ...dLost, trophies: 300, best: 300 }));
    await ok("D loses at 300: -4", settle(D, "uidD", { ...dLost, trophies: 296, best: 300 }));
    const eWon = { rating: 984 + eloDelta(984, 1016, true), wins: 1, losses: 1, lastMatch: t2, lastResult: "win", updatedAt: Date.now() };
    await deny("a win at 1000 is +6, not +8", settle(E, "uidE", { ...eWon, trophies: 1008, best: 1008 }));
    await ok("E wins at 1000: +6", settle(E, "uidE", { ...eWon, trophies: 1006, best: 1006 }));
    console.log("equipped items");
    await ok("D equips the pastel balls (300, kept after dropping to 296)", D.ref("users/uidD/equip/ball").set("pastel"));
    await ok("D equips the star icon (50)", D.ref("users/uidD/equip/icon").set("star"));
    await deny("D cannot equip the neon balls (800)", D.ref("users/uidD/equip/ball").set("neon"));
    await deny("unknown item", D.ref("users/uidD/equip/fx").set("rainbow"));
    await deny("unknown slot", D.ref("users/uidD/equip/hat").set("star"));
    await ok("E equips the crown (1000)", E.ref("users/uidE/equip/icon").set("crown"));
    await deny("E cannot equip another player's slot", E.ref("users/uidD/equip/icon").set("initial"));
    console.log("trophy leaderboard");
    await ok("D publishes trophies and icon", D.ref("leaderboard/uidD").set({ name: "D", rating: 1016 + eloDelta(1016, 984, false), trophies: 296, icon: "star" }));
    await deny("leaderboard trophies must equal the profile", D.ref("leaderboard/uidD").set({ name: "D", rating: 1016 + eloDelta(1016, 984, false), trophies: 2000, icon: "star" }));
    await deny("leaderboard icon must be the equipped one", D.ref("leaderboard/uidD").set({ name: "D", rating: 1016 + eloDelta(1016, 984, false), trophies: 296, icon: "crown" }));
    await ok("D changes the icon on the entry after equipping", D.ref("users/uidD/equip/icon").set("initial").then(() => D.ref("leaderboard/uidD/icon").set("initial")));
    await ok("ranking query by trophies", C.ref("leaderboard").orderByChild("trophies").limitToLast(50).get());
  }

  console.log("daily points, streak, shop, daily ranking");
  {
    const G = env.authenticatedContext("uidG").database(), H = env.authenticatedContext("uidH").database();
    const TODAY = Math.floor((Date.now() + 32400000) / 86400000);
    await ok("G creates a profile", G.ref("users/uidG").set(profile("uidG")));
    await deny("points cannot appear without a daily claim", G.ref("users/uidG").update({ points: 100 }));
    await deny("a claim must be for today", G.ref("users/uidG").update({ points: 50, dailyDay: TODAY - 1, streak: 1 }));
    await deny("a claim gives at least 30", G.ref("users/uidG").update({ points: 10, dailyDay: TODAY, streak: 1 }));
    await deny("a claim gives at most 100 without the streak bonus", G.ref("users/uidG").update({ points: 101, dailyDay: TODAY, streak: 1 }));
    await deny("the first streak day is 1", G.ref("users/uidG").update({ points: 70, dailyDay: TODAY, streak: 5 }));
    await ok("G claims today's points", G.ref("users/uidG").update({ points: 70, dailyDay: TODAY, streak: 1 }));
    await deny("a second claim on the same day", G.ref("users/uidG").update({ points: 140, dailyDay: TODAY, streak: 1 }));
    await deny("the claimed day cannot be removed", G.ref("users/uidG/dailyDay").remove());
    await deny("points cannot grow afterwards", G.ref("users/uidG").update({ points: 1000 }));
    await admin(db => db.ref("users/uidG").update({ dailyDay: TODAY - 1, streak: 6, points: 0 }));
    await deny("the streak continues from yesterday (6 + 1)", G.ref("users/uidG").update({ points: 100, dailyDay: TODAY, streak: 1 }));
    await ok("7th day in a row: up to 100 + 100", G.ref("users/uidG").update({ points: 200, dailyDay: TODAY, streak: 7 }));
    await admin(db => db.ref("users/uidG").update({ dailyDay: TODAY - 3, streak: 9, points: 0 }));
    await deny("a missed day: the streak restarts and no bonus", G.ref("users/uidG").update({ points: 200, dailyDay: TODAY, streak: 1 }));
    await ok("a missed day: streak 1", G.ref("users/uidG").update({ points: 100, dailyDay: TODAY, streak: 1 }));
    console.log("shop");
    await admin(db => db.ref("users/uidG/points").set(1000));
    await deny("an item without paying (points untouched)", G.ref("users/uidG").update({ lastPurchase: "icon_moon", "owned/icon_moon": true }));
    await deny("an item for less than its price", G.ref("users/uidG").update({ points: 900, lastPurchase: "icon_moon", "owned/icon_moon": true }));
    await deny("a road item is not for sale", G.ref("users/uidG").update({ points: 900, lastPurchase: "icon_star", "owned/icon_star": true }));
    await deny("an unknown item", G.ref("users/uidG").update({ points: 900, lastPurchase: "icon_dragon", "owned/icon_dragon": true }));
    await ok("G buys the moon icon (300)", G.ref("users/uidG").update({ points: 700, lastPurchase: "icon_moon", "owned/icon_moon": true }));
    await deny("the same item twice", G.ref("users/uidG").update({ points: 400, lastPurchase: "icon_moon", "owned/icon_moon": true }));
    await deny("points cannot go below 0", G.ref("users/uidG").update({ points: -800, lastPurchase: "ball_metal", "owned/ball_metal": true }));
    await ok("G buys the sakura icon (400)", G.ref("users/uidG").update({ points: 300, lastPurchase: "icon_sakura", "owned/icon_sakura": true }));
    await ok("G equips an owned shop icon", G.ref("users/uidG/equip/icon").set("moon"));
    await deny("G cannot equip a shop icon not owned", G.ref("users/uidG/equip/icon").set("comet"));
    await deny("H cannot buy for G", H.ref("users/uidG").update({ points: 0, lastPurchase: "icon_comet", "owned/icon_comet": true }));
    console.log("daily ranking");
    await ok("G posts today's score", G.ref("daily/" + TODAY + "/uidG").set({ name: "G", score: 500, icon: "moon" }));
    await deny("the score cannot go down", G.ref("daily/" + TODAY + "/uidG").set({ name: "G", score: 400, icon: "moon" }));
    await ok("a better score replaces it", G.ref("daily/" + TODAY + "/uidG").set({ name: "G", score: 640, icon: "moon" }));
    await deny("only today's ranking", G.ref("daily/" + (TODAY - 1) + "/uidG").set({ name: "G", score: 10, icon: "moon" }));
    await deny("the icon must be the equipped one", G.ref("daily/" + TODAY + "/uidG").set({ name: "G", score: 700, icon: "crown" }));
    await deny("H cannot post for G", H.ref("daily/" + TODAY + "/uidG").set({ name: "G", score: 9999, icon: "moon" }));
    await ok("signed-in players read today's ranking", H.ref("daily/" + TODAY).orderByChild("score").limitToLast(10).get());
    await deny("anonymous cannot read the ranking", anon.ref("daily/" + TODAY).get());
  }

  console.log("server rating authority (config/ratingAuthority = 'server')");
  await deny("clients cannot write config", A.ref("config/ratingAuthority").set("client"));
  await env.withSecurityRulesDisabled(ctx => ctx.database().ref("config/ratingAuthority").set("server"));
  await ok("signed-in clients read the authority flag", A.ref("config/ratingAuthority").get());
  const mid4 = "m4";
  await ok("A creates match m4", A.ref("matches/" + mid4).set({ meta: { seed: 4, ranked: true, createdAt: Date.now() }, players: { 0: { uid: "uidA", name: "Alice", rating: 1016, connected: false }, 1: { uid: "uidB", name: "Bob", rating: 984, connected: false } } }));
  await ok("A joins m4", A.ref("matches/" + mid4 + "/players/0/joinedAt").set(Date.now()));
  await ok("B joins m4", B.ref("matches/" + mid4 + "/players/1/joinedAt").set(Date.now()));
  await ok("A reports m4 result", A.ref("matches/" + mid4 + "/result/0").set({ win: true, reason: "foe-dead", ts: Date.now() }));
  await deny("server mode: client cannot move its rating even for a real match", settle(A, "uidA", { rating: 1032, wins: 2, losses: 0, lastMatch: mid4, lastResult: "win", updatedAt: Date.now() }));
  await deny("server mode: client cannot bump wins", A.ref("users/uidA").update({ wins: 3, updatedAt: Date.now() }));
  await deny("server mode: client cannot bump wins even with a new match", settle(A, "uidA", { wins: 3, lastMatch: mid4, lastResult: "win", updatedAt: Date.now() }));
  await deny("server mode: client cannot write a settlement", A.ref("matches/" + mid4 + "/settlement/uidA").set({ delta: 16, rating: 1032, wins: 2, losses: 0 }));
  await ok("server mode: nickname edits still work", A.ref("users/uidA").update({ name: "Alice2", updatedAt: Date.now() }));
  await ok("server mode: leaderboard mirror with the stored rating still works", A.ref("leaderboard/uidA").set({ name: "Alice2", rating: 1016 }));
  await env.withSecurityRulesDisabled(ctx => ctx.database().ref("matches/" + mid4 + "/settlement/uidA").set({ delta: 16, rating: 1032, wins: 2, losses: 0 }));
  await ok("server mode: player reads own settlement", A.ref("matches/" + mid4 + "/settlement/uidA").get());
  await deny("server mode: outsider cannot read a settlement", C.ref("matches/" + mid4 + "/settlement/uidA").get());

  console.log("forged matches, repeated settlement, lobby and room hardening");
  {
    const F1 = env.authenticatedContext("uidHF").database(), G1 = env.authenticatedContext("uidHG").database();
    await admin(db => db.ref("config/ratingAuthority").remove()); // back to client settlement after the server-mode scenarios
    await ok("F creates a profile", F1.ref("users/uidHF").set({ ...profile("uidHF"), trophies: 0, best: 0 }));
    await ok("G creates a profile", G1.ref("users/uidHG").set({ ...profile("uidHG"), trophies: 0, best: 0 }));
    const pl = { 0: { uid: "uidHG", name: "G", rating: 1000, trophies: 0, icon: "initial", connected: false }, 1: { uid: "uidHF", name: "F", rating: 1000, trophies: 0, icon: "initial", connected: false } };
    const meta = { seed: 9, ranked: true, createdAt: Date.now() };
    // One account must not be able to make a finished match on its own: the
    // creating write covers the whole match, so everything that proves the
    // other player took part has to be absent from it.
    await deny("a match cannot be created with the opponent's joinedAt filled in", F1.ref("matches/forge1").set({ meta, players: { 0: { ...pl[0], joinedAt: 1 }, 1: pl[1] } }));
    await deny("a match cannot be created with the creator's own joinedAt", F1.ref("matches/forge1").set({ meta, players: { 0: pl[0], 1: { ...pl[1], joinedAt: 1 } } }));
    await deny("a match cannot be created with a result", F1.ref("matches/forge1").set({ meta, players: pl, result: { 1: { win: true, reason: "x", ts: 1 } } }));
    await deny("a match cannot be created with both joinedAt and a result (forged win)", F1.ref("matches/forge1").set({ meta, players: { 0: { ...pl[0], joinedAt: 1 }, 1: { ...pl[1], joinedAt: 1 } }, result: { 1: { win: true, reason: "x", ts: 1 } } }));
    await deny("a match cannot be created with the opponent marked connected", F1.ref("matches/forge1").set({ meta, players: { 0: { ...pl[0], connected: true }, 1: pl[1] } }));
    await deny("a match cannot be created with a settlement (server mode would skip it)", F1.ref("matches/forge1").set({ meta, players: pl, settlement: { state: "claimed" } }));
    await deny("a match cannot be created with a settled marker", F1.ref("matches/forge1").set({ meta, players: pl, settled: { uidHF: true } }));
    await deny("a match cannot be created with state or attacks", F1.ref("matches/forge1").set({ meta, players: pl, state: { 0: { ts: 1 } } }));
    await deny("unknown fields in a match are rejected", F1.ref("matches/forge1").set({ meta, players: pl, junk: "x".repeat(1000) }));
    await deny("unknown fields in match meta are rejected", F1.ref("matches/forge1").set({ meta: { ...meta, junk: 1 }, players: pl }));
    await deny("unknown fields in a match player are rejected", F1.ref("matches/forge1").set({ meta, players: { 0: pl[0], 1: { ...pl[1], junk: 1 } } }));
    await ok("the honest creation write still works", F1.ref("matches/real1").set({ meta: { seed: 9, ranked: true, createdAt: SERVER_TIMESTAMP }, players: pl }));
    await ok("F joins", F1.ref("matches/real1/players/1/joinedAt").set(Date.now()));
    await ok("G joins", G1.ref("matches/real1/players/0/joinedAt").set(Date.now()));
    await ok("G reports the loss", G1.ref("matches/real1/result/0").set({ win: false, reason: "dead", ts: Date.now() }));
    const winF = { rating: 1016, wins: 1, losses: 0, trophies: 10, best: 10, lastMatch: "real1", lastResult: "win", updatedAt: Date.now() };
    await deny("a settlement without the match's settled marker is rejected", F1.ref("users/uidHF").update(winF));
    await deny("the settled marker cannot be written on its own", F1.ref("matches/real1/settled/uidHF").set(true));
    await deny("G cannot write F's settled marker", G1.ref("matches/real1/settled/uidHF").set(true));
    await ok("F settles the win (profile and marker in one write)", settle(F1, "uidHF", winF));
    // The same match again, by every route that used to work.
    await deny("the same match cannot be settled twice", settle(F1, "uidHF", { ...winF, rating: 1032, wins: 2, trophies: 20, best: 20 }));
    await deny("lastMatch cannot be removed (it would reopen the match)", F1.ref("users/uidHF/lastMatch").remove());
    await deny("lastMatch cannot be removed together with other fields", settle(F1, "uidHF", { lastMatch: null, updatedAt: Date.now() }));
    await admin(db => db.ref("users/uidHF/lastMatch").remove());
    await deny("even with lastMatch gone, a settled match stays settled", settle(F1, "uidHF", { ...winF, rating: 1032, wins: 2, trophies: 20, best: 20 }));
    await deny("the settled marker cannot be removed", F1.ref("matches/real1/settled/uidHF").remove());
    await ok("G settles the loss once", settle(G1, "uidHG", { rating: 984, wins: 0, losses: 1, trophies: 0, best: 0, lastMatch: "real1", lastResult: "loss", updatedAt: Date.now() }));
    await deny("an outsider cannot settle someone else's match", settle(C, "uidC", { rating: 1016, wins: 1, losses: 0, lastMatch: "real1", lastResult: "win", updatedAt: Date.now() }));

    // Lobby: an entry must be the writer's own true data, and a fresh entry of another player cannot be replaced.
    await deny("lobby entry with a false rating", F1.ref("lobby/6/waiting").set({ uid: "uidHF", name: "F", rating: 3000, ts: Date.now() }));
    await deny("lobby entry with a name longer than a match accepts", F1.ref("lobby/6/waiting").set({ uid: "uidHF", name: "x".repeat(25), rating: 1016, ts: Date.now() }));
    await deny("lobby entry with unknown fields", F1.ref("lobby/6/waiting").set({ uid: "uidHF", name: "F", rating: 1016, ts: Date.now(), junk: "x".repeat(1000) }));
    await deny("lobby band outside 0..19", F1.ref("lobby/55/waiting").set({ uid: "uidHF", name: "F", rating: 1016, ts: Date.now() }));
    await ok("F waits in band 6", F1.ref("lobby/6/waiting").set({ uid: "uidHF", name: "F", rating: 1016, trophies: 10, icon: "initial", ts: Date.now() }));
    await deny("G cannot replace F's fresh lobby entry", G1.ref("lobby/6/waiting").set({ uid: "uidHG", name: "G", rating: 984, ts: Date.now() }));
    await ok("F refreshes the own entry", F1.ref("lobby/6/waiting").set({ uid: "uidHF", name: "F", rating: 1016, trophies: 10, icon: "initial", ts: Date.now() }));
    await admin(db => db.ref("lobby/6/waiting/ts").set(Date.now() - 60000));
    await ok("G replaces F's stale lobby entry", G1.ref("lobby/6/waiting").set({ uid: "uidHG", name: "G", rating: 984, ts: Date.now() }));
    await ok("G leaves the lobby", G1.ref("lobby/6/waiting").remove());

    // Pairings: an existing pairing cannot be overwritten (it would break a starting match).
    await ok("F creates match real2 with host G", F1.ref("matches/real2").set({ meta, players: { 0: { uid: "uidHG", name: "G", rating: 984, trophies: 0, icon: "initial", connected: false }, 1: { uid: "uidHF", name: "F", rating: 1016, trophies: 10, icon: "initial", connected: false } } }));
    await ok("F pairs host G to real2", F1.ref("pairings/uidHG").set("real2"));
    await ok("F creates match real3 with host G", F1.ref("matches/real3").set({ meta, players: { 0: { uid: "uidHG", name: "G", rating: 984, trophies: 0, icon: "initial", connected: false }, 1: { uid: "uidHF", name: "F", rating: 1016, trophies: 10, icon: "initial", connected: false } } }));
    await deny("an existing pairing cannot be overwritten", F1.ref("pairings/uidHG").set("real3"));
    await ok("G clears the pairing", G1.ref("pairings/uidHG").remove());

    // Rooms: true host data, no junk, no dates in the future; an old room can still be joined while its host waits.
    await deny("room with a false host rating", F1.ref("rooms/654321").set({ hostUid: "uidHF", hostName: "F", hostRating: 3000, createdAt: Date.now(), matchId: null }));
    await deny("room dated far in the future (a code held for ever)", F1.ref("rooms/654321").set({ hostUid: "uidHF", hostName: "F", hostRating: 1016, createdAt: 9e15, matchId: null }));
    await deny("room with unknown fields", F1.ref("rooms/654321").set({ hostUid: "uidHF", hostName: "F", hostRating: 1016, createdAt: Date.now(), junk: "x".repeat(1000) }));
    await ok("F creates room 654321", F1.ref("rooms/654321").set({ hostUid: "uidHF", hostName: "F", hostRating: 1016, hostTrophies: 10, hostIcon: "initial", createdAt: Date.now(), matchId: null }));
    await admin(db => db.ref("rooms/654321/createdAt").set(Date.now() - 3600000));
    await ok("G creates the room match", G1.ref("matches/roomOld").set({ meta: { seed: 3, ranked: false, createdAt: Date.now() }, players: { 0: { uid: "uidHF", name: "F", rating: 1016, trophies: 10, icon: "initial", connected: false }, 1: { uid: "uidHG", name: "G", rating: 984, trophies: 0, icon: "initial", connected: false } } }));
    await ok("G joins a room that is older than 30 minutes (its host is still waiting)", G1.ref("rooms/654321").update({ matchId: "roomOld" }));
    await ok("F removes the room", F1.ref("rooms/654321").remove());
    await ok("F creates room 654322", F1.ref("rooms/654322").set({ hostUid: "uidHF", hostName: "F", hostRating: 1016, createdAt: Date.now(), matchId: null }));
    await deny("G cannot take over a room that is still fresh", G1.ref("rooms/654322").set({ hostUid: "uidHG", hostName: "G", hostRating: 984, createdAt: Date.now(), matchId: null }));
    await admin(db => db.ref("rooms/654322/createdAt").set(Date.now() - 3600000));
    await ok("G takes over a room code that expired", G1.ref("rooms/654322").set({ hostUid: "uidHG", hostName: "G", hostRating: 984, createdAt: Date.now(), matchId: null }));
    await ok("G removes the room", G1.ref("rooms/654322").remove());
  }

  console.log("account deletion");
  await deny("B cannot delete A's leaderboard entry", B.ref("leaderboard/uidA").remove());
  await deny("B cannot delete A's profile", B.ref("users/uidA").remove());
  await ok("A deletes own leaderboard entry", A.ref("leaderboard/uidA").remove());
  await ok("A deletes own profile", A.ref("users/uidA").remove());
  await ok("a deleted account starts over at the starting values", A.ref("users/uidA").set(profile("uidA")));

  await env.cleanup();
  console.log(`\nfirebase rules: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
