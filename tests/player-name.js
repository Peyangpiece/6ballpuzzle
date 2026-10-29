// Player names (public/app-player-name-v1.js): offensive nicknames are refused
// when typed and replaced by "Player" when they arrive from the network, the
// first launch asks for a nickname once, and the layer loads before Net.
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const PUBLIC = path.join(__dirname, "..", "public");
const read = f => fs.readFileSync(path.join(PUBLIC, f), "utf8");

const ctx = {};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(read("app-player-name-v1.js") + "\nthis.HexPlayerName=HexPlayerName;", ctx);
const N = ctx.HexPlayerName;

// Ordinary names, including ones that contain a refused word only by accident.
for (const ok of ["Taro", "はなこ", "ドロップ王", "Player", "grape", "skill", "peacock", "Sussex", "class", "Dickens", "あいう123", "しねま"]) {
  assert(N.check(ok).ok, ok + " must be allowed");
}
// Refused words, also when disguised by case, width, katakana, spacing, symbols or digits.
for (const bad of ["fuck", "FUCK you", "ｆｕｃｋ", "f.u.c.k", "sh1t", "b!tch", "a55", "rape", "Sex",
                   "ちんこ", "チンコ", "ﾁﾝｺ", "ち ん こ", "死ね", "しね", "殺す", "運営", "公式アカ", "www.example", "admin"]) {
  const c = N.check(bad);
  assert(!c.ok && c.reason === "blocked", bad + " must be refused: " + JSON.stringify(c));
}
// Cleaning: control and invisible characters go, spaces collapse, 12 characters at most.
assert.strictEqual(N.check("  Ta​ro\u0007  ").name, "Taro");
assert.strictEqual(N.check("a   b").name, "a b");
assert.strictEqual(N.check("123456789012345").name, "123456789012");
assert.strictEqual(N.check("   ").reason, "empty");
// Names from the network.
assert.strictEqual(N.display("Hanako"), "Hanako");
assert.strictEqual(N.display("ﾏﾝｺ"), "Player");
assert.strictEqual(N.display(""), "Player");
assert.strictEqual(N.display(null), "Player");

// Wiring.
const index = read("index.html");
assert(index.indexOf('"app-player-name-v1.js"') >= 0 && index.indexOf('"app-player-name-v1.js"') < index.indexOf('"app-15.js"'), "the name layer loads before Net (app-15.js)");
const app15 = read("app-15.js");
assert(app15.includes("name: HexPlayerName.display(foe.name)"), "the opponent's name passes the filter");
assert(app15.includes("name: HexPlayerName.display(v.name)"), "ranking names pass the filter");
const app16 = read("app-16.js");
assert(/const saveProfile=useCallback\(\(\)=>\{const c=HexPlayerName\.check\(profileDraft\);if\(c\.reason==="blocked"\)\{setNameErr\(NAME_BLOCKED\);return;\}/.test(app16), "the profile refuses a blocked nickname");
assert(app16.includes('hexReadStored("hexdrop_name_prompted","")!=="1"') && app16.includes('hexStoreMenuPref("hexdrop_name_prompted","1")'), "the first-launch prompt is shown once");
assert(app16.includes("home,nameDialog,"), "the first-launch prompt is rendered on the home screen");
assert(read("app-account-delete-v1.js").includes('"hexdrop_name_prompted"'), "deleting the account asks for a nickname again");
console.log("player name PASS");
