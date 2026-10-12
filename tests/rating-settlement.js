// Server-side settlement must agree with the client Elo formula and be
// symmetric, idempotent-by-construction and safe on malformed input.
const assert = require("assert"), fs = require("fs"), path = require("path");
const { eloDelta, computeSettlement, K } = require("../firebase/functions/settle.js");
const client = fs.readFileSync(path.join(__dirname, "../public/app-14.js"), "utf8");
const clientElo = new Function(/const eloDelta = \(mine, foe, win\) => [^;]*;/.exec(client)[0] + "return eloDelta;")();
assert.strictEqual(K, 32);
for (let a = 0; a <= 3000; a += 125) for (let b = 0; b <= 3000; b += 125) for (const w of [true, false]) assert.strictEqual(eloDelta(a, b, w), clientElo(a, b, w), `elo mismatch ${a} ${b} ${w}`);
const match = { meta: { seed: 1, ranked: true }, players: { 0: { uid: "A", name: "a", rating: 1000 }, 1: { uid: "B", name: "b", rating: 1000 } }, result: { 0: { win: true, reason: "x", ts: 1 } } };
const s = computeSettlement(match, "0", { A: 1000, B: 1000 });
assert.deepStrictEqual([s.winnerIndex, s.loserIndex, s.ranked], [0, 1, true]);
assert.strictEqual(s.updates.A.delta, 16); assert.strictEqual(s.updates.B.delta, -16);
assert.strictEqual(s.updates.A.rating, 1016); assert.strictEqual(s.updates.B.rating, 984);
// loser reporting their own loss settles the same way
const m2 = { ...match, result: { 1: { win: false, reason: "dead", ts: 1 } } };
assert.deepStrictEqual(computeSettlement(m2, "1", { A: 1000, B: 1000 }).updates, s.updates);
// unranked (room) match: no rating movement but still a win/loss
const m3 = { ...match, meta: { seed: 1, ranked: false } };
const s3 = computeSettlement(m3, "0", { A: 1200, B: 900 });
assert.strictEqual(s3.updates.A.delta, 0); assert.strictEqual(s3.updates.B.delta, 0); assert.strictEqual(s3.updates.A.win, true);
// missing ratings default to 1000, rating never drops below 0
const s4 = computeSettlement(match, "0", { A: 5 });
assert.strictEqual(s4.updates.B.rating, 1000 + eloDelta(1000, 5, false));
assert.strictEqual(computeSettlement({ ...match, result: { 1: { win: true, reason: "", ts: 1 } } }, "1", { A: 0, B: 2000 }).updates.A.rating, 0);
// malformed input never settles
assert.strictEqual(computeSettlement(null, "0", {}), null);
assert.strictEqual(computeSettlement({ ...match, result: {} }, "0", {}), null);
assert.strictEqual(computeSettlement({ ...match, players: { 0: { uid: "A" }, 1: { uid: "A" } } }, "0", {}), null);
assert.strictEqual(computeSettlement({ ...match, result: { 0: { win: "yes" } } }, "0", {}), null);
console.log("rating settlement PASS");
