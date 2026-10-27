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
let passed = 0, failed = 0;
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
  await deny("rating without lastResult", A.ref("users/uidA").update({ rating: 1016, wins: 1, losses: 0, lastMatch: mid, updatedAt: Date.now() }));
  await deny("rating with the wrong delta (+15)", A.ref("users/uidA").update({ rating: 1015, wins: 1, losses: 0, lastMatch: mid, lastResult: "win", updatedAt: Date.now() }));
  await deny("rating with the wrong delta (+17)", A.ref("users/uidA").update({ rating: 1017, wins: 1, losses: 0, lastMatch: mid, lastResult: "win", updatedAt: Date.now() }));
  await deny("winner cannot claim a loss", A.ref("users/uidA").update({ rating: 984, wins: 0, losses: 1, lastMatch: mid, lastResult: "loss", updatedAt: Date.now() }));
  await deny("wins must follow the outcome", A.ref("users/uidA").update({ rating: 1016, wins: 0, losses: 0, lastMatch: mid, lastResult: "win", updatedAt: Date.now() }));
  await ok("A applies the exact +16 after match m1", A.ref("users/uidA").update({ rating: 1016, wins: 1, losses: 0, lastMatch: mid, lastResult: "win", updatedAt: Date.now() }));
  await deny("same match cannot be applied twice", A.ref("users/uidA").update({ rating: 1032, wins: 2, losses: 0, lastMatch: mid, lastResult: "win", updatedAt: Date.now() }));
  await deny("rating change without a real match", A.ref("users/uidA").update({ rating: 1500, wins: 1, losses: 0, lastMatch: "m-none", lastResult: "win", updatedAt: Date.now() }));
  await deny("lastMatch must reference a finished match with A", C.ref("users/uidC").set(profile("uidC")).then(() => C.ref("users/uidC").update({ rating: 1016, wins: 1, losses: 0, lastMatch: mid, lastResult: "win", updatedAt: Date.now() })));
  await deny("loser cannot claim a win", B.ref("users/uidB").update({ rating: 1016, wins: 1, losses: 0, lastMatch: mid, lastResult: "win", updatedAt: Date.now() }));
  await deny("losses cannot jump", B.ref("users/uidB").update({ rating: 984, wins: 0, losses: 5, lastMatch: mid, lastResult: "loss", updatedAt: Date.now() }));
  await ok("B applies the exact -16 after match m1", B.ref("users/uidB").update({ rating: 984, wins: 0, losses: 1, lastMatch: mid, lastResult: "loss", updatedAt: Date.now() }));

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
  await deny("unranked: rating must not move", A.ref("users/uidA").update({ rating: 1032, wins: 2, losses: 0, lastMatch: mid3, lastResult: "win", updatedAt: Date.now() }));
  await ok("unranked: win counted, rating unchanged", A.ref("users/uidA").update({ rating: 1016, wins: 2, losses: 0, lastMatch: mid3, lastResult: "win", updatedAt: Date.now() }));
  await ok("unranked: loss counted for B", B.ref("users/uidB").update({ rating: 984, wins: 0, losses: 2, lastMatch: mid3, lastResult: "loss", updatedAt: Date.now() }));
  const mid5 = "m5";
  await ok("A creates m5", A.ref("matches/" + mid5).set({ meta: { seed: 5, ranked: true, createdAt: Date.now() }, players: { 0: { uid: "uidA", name: "Alice", rating: 1016, connected: false }, 1: { uid: "uidB", name: "Bob", rating: 984, connected: false } } }));
  await ok("A joins m5", A.ref("matches/" + mid5 + "/players/0/joinedAt").set(Date.now()));
  await ok("B joins m5", B.ref("matches/" + mid5 + "/players/1/joinedAt").set(Date.now()));
  await ok("A claims m5 win", A.ref("matches/" + mid5 + "/result/0").set({ win: true, reason: "foe-dead", ts: Date.now() }));
  await ok("B also claims m5 win (contradiction)", B.ref("matches/" + mid5 + "/result/1").set({ win: true, reason: "foe-dead", ts: Date.now() }));
  await deny("contradictory results settle nobody (B)", B.ref("users/uidB").update({ rating: 984 + eloDelta(984, 1016, true), wins: 1, losses: 2, lastMatch: mid5, lastResult: "win", updatedAt: Date.now() }));
  await deny("contradictory results settle nobody (A)", A.ref("users/uidA").update({ rating: 1016 + eloDelta(1016, 984, true), wins: 3, losses: 0, lastMatch: mid5, lastResult: "win", updatedAt: Date.now() }));
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
    try { await assertFails(cx.ref("users/" + X).update({ rating: wrongX, wins: w ? 1 : 0, losses: w ? 0 : 1, lastMatch: mid, lastResult: w ? "win" : "loss", updatedAt: 2 })); sweepDenied++; } catch (e) { failed++; console.log(`  FAIL sweep ${i} accepted wrong X rating ${wrongX} (m=${m} f=${f} w=${w})`); }
    try { await assertSucceeds(cx.ref("users/" + X).update({ rating: rx, wins: w ? 1 : 0, losses: w ? 0 : 1, lastMatch: mid, lastResult: w ? "win" : "loss", updatedAt: 2 })); sweepOk++; } catch (e) { failed++; console.log(`  FAIL sweep ${i} rejected correct X rating ${rx} (m=${m} f=${f} w=${w})`); }
    try { await assertFails(cy.ref("users/" + Y).update({ rating: wrongY, wins: w ? 0 : 1, losses: w ? 1 : 0, lastMatch: mid, lastResult: w ? "loss" : "win", updatedAt: 2 })); sweepDenied++; } catch (e) { failed++; console.log(`  FAIL sweep ${i} accepted wrong Y rating ${wrongY}`); }
    try { await assertSucceeds(cy.ref("users/" + Y).update({ rating: ry, wins: w ? 0 : 1, losses: w ? 1 : 0, lastMatch: mid, lastResult: w ? "loss" : "win", updatedAt: 2 })); sweepOk++; } catch (e) { failed++; console.log(`  FAIL sweep ${i} rejected correct Y rating ${ry} (m=${m} f=${f} w=${w})`); }
  }
  passed += sweepOk + sweepDenied;
  console.log(`  ok   Elo parity sweep: ${sweepOk} exact settlements accepted, ${sweepDenied} off-by-one settlements denied`);

  console.log("server rating authority (config/ratingAuthority = 'server')");
  await deny("clients cannot write config", A.ref("config/ratingAuthority").set("client"));
  await env.withSecurityRulesDisabled(ctx => ctx.database().ref("config/ratingAuthority").set("server"));
  await ok("signed-in clients read the authority flag", A.ref("config/ratingAuthority").get());
  const mid4 = "m4";
  await ok("A creates match m4", A.ref("matches/" + mid4).set({ meta: { seed: 4, ranked: true, createdAt: Date.now() }, players: { 0: { uid: "uidA", name: "Alice", rating: 1016, connected: false }, 1: { uid: "uidB", name: "Bob", rating: 984, connected: false } } }));
  await ok("A joins m4", A.ref("matches/" + mid4 + "/players/0/joinedAt").set(Date.now()));
  await ok("B joins m4", B.ref("matches/" + mid4 + "/players/1/joinedAt").set(Date.now()));
  await ok("A reports m4 result", A.ref("matches/" + mid4 + "/result/0").set({ win: true, reason: "foe-dead", ts: Date.now() }));
  await deny("server mode: client cannot move its rating even for a real match", A.ref("users/uidA").update({ rating: 1032, wins: 2, losses: 0, lastMatch: mid4, lastResult: "win", updatedAt: Date.now() }));
  await deny("server mode: client cannot bump wins", A.ref("users/uidA").update({ wins: 3, updatedAt: Date.now() }));
  await deny("server mode: client cannot bump wins even with a new match", A.ref("users/uidA").update({ wins: 3, lastMatch: mid4, lastResult: "win", updatedAt: Date.now() }));
  await deny("server mode: client cannot write a settlement", A.ref("matches/" + mid4 + "/settlement/uidA").set({ delta: 16, rating: 1032, wins: 2, losses: 0 }));
  await ok("server mode: nickname edits still work", A.ref("users/uidA").update({ name: "Alice2", updatedAt: Date.now() }));
  await ok("server mode: leaderboard mirror with the stored rating still works", A.ref("leaderboard/uidA").set({ name: "Alice2", rating: 1016 }));
  await env.withSecurityRulesDisabled(ctx => ctx.database().ref("matches/" + mid4 + "/settlement/uidA").set({ delta: 16, rating: 1032, wins: 2, losses: 0 }));
  await ok("server mode: player reads own settlement", A.ref("matches/" + mid4 + "/settlement/uidA").get());
  await deny("server mode: outsider cannot read a settlement", C.ref("matches/" + mid4 + "/settlement/uidA").get());

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
