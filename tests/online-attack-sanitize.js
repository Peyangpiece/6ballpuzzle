// The online attack consumer must clamp hostile payloads before they reach
// the garbage queue (defence in depth next to firebase/database.rules.json).
const fs = require("fs"), path = require("path"), assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "../public/app-16.js"), "utf8");
assert(src.includes("const ATTACK_MAX_BALLS = 120;"), "attack cap constant missing");
assert(/match\.events\.onAttack = \(atk\) => \{const n = sanitizeAttackCount\(/.test(src), "onAttack must sanitize the count");
assert(src.includes("const shapes = sanitizeAttackShapes("), "onAttack must sanitize the shapes");
// Evaluate the helpers in isolation with the production WAZA table.
const WAZA = { STRAIGHT: {}, PYRAMID: {}, HEXAGON: {} };
const helpers = /const ATTACK_MAX_BALLS[\s\S]*?function sanitizeAttackShapes[^\n]*\n/.exec(src)[0];
const { sanitizeAttackCount, sanitizeAttackShapes } = new Function("WAZA", helpers + "return {sanitizeAttackCount, sanitizeAttackShapes};")(WAZA);
assert.strictEqual(sanitizeAttackCount(19), 19);
assert.strictEqual(sanitizeAttackCount(19.9), 19);
assert.strictEqual(sanitizeAttackCount(99999), 120);
assert.strictEqual(sanitizeAttackCount(-5), 0);
assert.strictEqual(sanitizeAttackCount("abc"), 0);
assert.strictEqual(sanitizeAttackCount(Infinity), 0);
assert.deepStrictEqual(sanitizeAttackShapes(["HEXAGON", "NUKE", 5, "PYRAMID"]), ["HEXAGON", "PYRAMID"]);
assert.deepStrictEqual(sanitizeAttackShapes("HEXAGON"), []);
assert.strictEqual(sanitizeAttackShapes(new Array(50).fill("STRAIGHT")).length, 8);
const net = fs.readFileSync(path.join(__dirname, "../public/app-15.js"), "utf8");
assert(net.includes("async applyRating(win, foeRating, ranked, matchId = null)"), "applyRating must accept the match id");
assert(net.includes("patch.lastMatch = matchId; patch.lastResult = win ? \"win\" : \"loss\";"), "applyRating must record lastMatch and lastResult for the rules");
assert(net.includes('"/players/" + myIndex + "/joinedAt"'), "join must record the write-once joinedAt proof of participation");
assert(src.includes("Net.applyRating(win,match.opponent?.rating||r,match.ranked,match.matchId)"), "App must pass the match id to applyRating");
console.log("online attack sanitization PASS");
