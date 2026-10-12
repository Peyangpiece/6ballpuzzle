// The Elo table embedded in firebase/database.rules.json must be exactly what
// tools/elo-rules-table.js generates from the client formula, and that table
// must reproduce the client formula for every integer rating difference.
const assert = require("assert"), fs = require("fs"), path = require("path");
const t = require("../tools/elo-rules-table.js");
const rules = JSON.parse(fs.readFileSync(path.join(__dirname, "../firebase/database.rules.json"), "utf8"));
assert.strictEqual(rules.rules.users.$uid.rating[".validate"], t.ratingValidate(), "rules file is stale: run `node tools/elo-rules-table.js --write`");
const client = fs.readFileSync(path.join(__dirname, "../public/app-14.js"), "utf8");
const clientElo = new Function(/const eloDelta = \(mine, foe, win\) => [^;]*;/.exec(client)[0] + "return eloDelta;")();
const lookup = (iv, d) => { let v = iv[0].value; for (const e of iv) if (d >= e.from) v = e.value; return v; };
const W = t.intervals(true), L = t.intervals(false);
let checked = 0;
for (let d = -4000; d <= 4000; d++) {
  assert.strictEqual(lookup(W, d), clientElo(0, d, true) || 0, "win table mismatch at d=" + d);
  assert.strictEqual(lookup(L, d), clientElo(0, d, false) || 0, "loss table mismatch at d=" + d);
  checked++;
}
assert.strictEqual(lookup(W, 0), 16); assert.strictEqual(lookup(L, 0), -16);
assert.strictEqual(lookup(W, 4000), 32); assert.strictEqual(lookup(L, -4000), -32);
console.log(`rules elo table PASS (${checked} differences, ${W.length}/${L.length} intervals, validate ${t.ratingValidate().length} chars)`);
