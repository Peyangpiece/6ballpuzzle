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
assert(src.includes("Net.applyRating(win,match.opponent?.rating??r,match.ranked,match.matchId)"), "App must pass the match id to applyRating");
// The rating is settled when the match ends, not inside the 4 s delay before the result screen (closing the app in between skipped a loss).
assert(src.indexOf("settling=Promise.resolve().then(()=>Net.applyRating(") > 0 && src.indexOf("settling=Promise.resolve().then(()=>Net.applyRating(") < src.indexOf("RESULT_REVEAL_DELAY_MS);}, []);"), "finish() must start the rating settlement before the result delay");
assert(/setTimeout\(async \(\) => \{if \(m === "ONLINE" && match\) \{let delta=0;try\{delta=await settling;/.test(src), "the result screen waits for the settlement started earlier");
// Only the handshake's own listener may be removed: F.off(ref) also removed Net.join()'s disconnect listener.
const online = fs.readFileSync(path.join(__dirname, "../public/app-online-v2.js"), "utf8");
assert(!/F\.off\(\s*foeConnRef\s*\)/.test(online) && /unsubscribe=F\.onValue\(\s*foeConnRef/.test(online), "the handshake must unsubscribe its own listener, not every listener on the opponent's connected flag");
// Presence is re-asserted after a reconnect and a hidden tab counts as away.
assert(net.includes('".info/connected"') && net.includes("assertPresence") && net.includes('"visibilitychange"'), "join must keep the connected flag true across reconnects and mark a hidden tab as away");
// A daily or tutorial run left through the pause menu must not follow into the next match.
assert(/const beginOnline = useCallback\(\(match, kind = "RANKED"\) => \{[^\n]*dailyRef\.current = null;setDaily\(null\);/.test(src), "an online match must clear the daily state");
assert(/onQuit: \(\) => \{runRef\.current = false;setPauseOpen\(false\);[^\n]*tutorialRef\.current = null;setTut\(null\);dailyRef\.current = null;setDaily\(null\);/.test(src), "quitting through the pause menu must clear the tutorial and daily state");
assert(src.includes("if (matchRef.current !== match) {"), "a result of a match that was left must not end the current game");
console.log("online attack sanitization PASS");
