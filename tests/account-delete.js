// Account deletion (public/app-account-delete-v1.js) against a fake Firebase SDK:
// - the player's users/ and leaderboard/ records and the Firebase account are
//   deleted, and the game records on this device are cleared (settings stay);
// - a Google account is asked to sign in again in the click itself, before
//   any awaited work (a later popup is blocked);
// - when Firebase refuses without a fresh sign-in, the data is still gone,
//   the account is signed out and the caller learns why;
// - in the iOS app the native bridge signs in again instead of a popup.
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const PUBLIC = path.join(__dirname, "..", "public");
const read = f => fs.readFileSync(path.join(PUBLIC, f), "utf8");

function fakeFirebase(db, user, { deleteError } = {}) {
  const calls = [];
  const auth = { currentUser: user };
  class GoogleAuthProvider { setCustomParameters() {} }
  const F = {
    calls, auth,
    initializeApp: () => ({}), getAuth: () => auth, getDatabase: () => ({}),
    onAuthStateChanged: (a, cb) => { setTimeout(() => cb(a.currentUser), 0); return () => {}; },
    signInAnonymously: async a => { a.currentUser = { uid: "anon9", isAnonymous: true }; return { user: a.currentUser }; },
    GoogleAuthProvider,
    reauthenticateWithPopup: (u) => { calls.push(["reauthenticateWithPopup", u.uid]); return Promise.resolve(); },
    deleteUser: async u => { calls.push(["deleteUser", u.uid]); if (deleteError) throw Object.assign(new Error("x"), { code: deleteError }); auth.currentUser = null; },
    signOut: async () => { calls.push(["signOut"]); auth.currentUser = null; },
    ref: (_, p) => p,
    get: async p => ({ exists: () => p in db, val: () => db[p] }),
    set: async (p, v) => { db[p] = v; },
    // A multi-path update on the root (ref "" / undefined): each key is a full path.
    update: async (p, v) => { if (!p) { calls.push(["rootUpdate", Object.keys(v).length]); for (const k of Object.keys(v)) { if (v[k] === null) delete db[k]; else db[k] = v[k]; } return; } db[p] = { ...(db[p] || {}), ...v }; },
    remove: async p => { calls.push(["remove", p]); delete db[p]; },
    serverTimestamp: () => 1
  };
  return F;
}

function load(F, native, extra) {
  const store = new Map([["hexdrop_rating", "1210"], ["hexdrop_wins", "9"], ["hexdrop_nickname", "Taro"], ["hexdrop_cpu_record", "{}"], ["hexdrop_bgm_volume", "40"], ["hexdrop_tutorial_done", "1"]]);
  const ctx = { console, setTimeout, clearTimeout, localStorage: { removeItem: k => store.delete(k), getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) } };
  ctx.window = ctx; ctx.FB = F;
  if (native) ctx.DropBallNative = native;
  vm.createContext(ctx);
  vm.runInContext(read("app-14.js").match(/const FIREBASE_CONFIG = \{[^}]*\};/)[0], ctx);
  if (extra) vm.runInContext(extra + "\nthis.HexDaily=HexDaily;", ctx);
  vm.runInContext(read("app-15.js") + "\nthis.Net=Net;", ctx);
  vm.runInContext(read("app-google-login.js"), ctx);
  vm.runInContext(read("app-account-delete-v1.js"), ctx);
  return { Net: ctx.Net, store };
}

(async () => {
  // 1. Guest account: data and account deleted, device records cleared, settings kept.
  {
    const db = { "users/anon1": { name: "Taro", rating: 1210, wins: 9, losses: 2 }, "leaderboard/anon1": { name: "Taro", rating: 1210 } };
    const F = fakeFirebase(db, { uid: "anon1", isAnonymous: true });
    const { Net, store } = load(F);
    await Net.connect();
    await Net.deleteAccount();
    assert(!("users/anon1" in db) && !("leaderboard/anon1" in db), "online records are deleted");
    assert.deepStrictEqual(F.calls.find(c => c[0] === "deleteUser"), ["deleteUser", "anon1"]);
    assert(!F.calls.some(c => c[0] === "reauthenticateWithPopup"), "a guest needs no sign-in");
    for (const k of ["hexdrop_rating", "hexdrop_wins", "hexdrop_nickname", "hexdrop_cpu_record"]) assert(!store.has(k), k + " must be cleared");
    assert.strictEqual(store.get("hexdrop_bgm_volume"), "40", "settings stay");
    assert.strictEqual(Net.uid, null);
  }
  // 2. Google account: the sign-in popup is requested in the click itself, first.
  {
    const user = { uid: "g1", isAnonymous: false, providerData: [{ providerId: "google.com" }] };
    const db = { "users/g1": { name: "Taro", rating: 1000, wins: 0, losses: 0 } };
    const F = fakeFirebase(db, user);
    const { Net } = load(F);
    await Net.connect();
    F.calls.length = 0;
    const pending = Net.deleteAccount();
    assert.deepStrictEqual(F.calls.map(c => c[0]), ["reauthenticateWithPopup"], "the popup must be the first thing the click does");
    await pending;
    assert(F.calls.some(c => c[0] === "deleteUser") && !("users/g1" in db));
  }
  // 3. Firebase wants a fresh sign-in: data gone, signed out, the reason reaches the caller.
  {
    const user = { uid: "g2", isAnonymous: false, providerData: [{ providerId: "google.com" }] };
    const db = { "users/g2": { name: "A", rating: 1000, wins: 0, losses: 0 }, "leaderboard/g2": { name: "A", rating: 1000 } };
    const F = fakeFirebase(db, user, { deleteError: "auth/requires-recent-login" });
    const { Net } = load(F);
    await Net.connect();
    await assert.rejects(Net.deleteAccount(), e => e.code === "auth/requires-recent-login");
    assert(!("users/g2" in db) && !("leaderboard/g2" in db), "the data is deleted even so");
    assert(F.calls.some(c => c[0] === "signOut"), "the account is signed out");
  }
  // 4. iOS app: the native bridge signs in again (Apple or Google), not a popup.
  {
    const user = { uid: "a1", isAnonymous: false, providerData: [{ providerId: "apple.com" }] };
    const F = fakeFirebase({ "users/a1": { name: "A", rating: 1000, wins: 0, losses: 0 } }, user);
    const seen = [];
    const { Net } = load(F, { reauthenticate: u => { seen.push(u.uid); return Promise.resolve(); }, revokeAppleToken: () => { seen.push("revoke:" + F.calls.some(c => c[0] === "deleteUser")); return Promise.resolve(true); } });
    await Net.connect();
    await Net.deleteAccount();
    // Sign in with Apple: the token is revoked after the fresh sign-in and before the account is deleted.
    assert.deepStrictEqual(seen, ["a1", "revoke:false"]);
    assert(!F.calls.some(c => c[0] === "reauthenticateWithPopup"));
  }
  // 5. The daily ranking entries (name and score per day) and a waiting pairing go too.
  {
    const ctxDaily = "const HexDaily={day:()=>20405};";
    const db = { "users/d1": { name: "Dai", rating: 1000, wins: 0, losses: 0 }, "daily/20405/d1": { name: "Dai", score: 900 }, "daily/20399/d1": { name: "Dai", score: 500 }, "daily/20405/other": { name: "X", score: 1 }, "pairings/d1": "m9" };
    const F = fakeFirebase(db, { uid: "d1", isAnonymous: true });
    const { Net, store } = load(F, null, ctxDaily);
    store.set("hexdrop_daily_v1", "{}");
    await Net.connect();
    await Net.deleteAccount();
    assert(!("daily/20405/d1" in db) && !("daily/20399/d1" in db), "the player's daily ranking entries are deleted");
    assert("daily/20405/other" in db, "other players' entries stay");
    assert(!("pairings/d1" in db), "a waiting pairing is removed");
    assert(!store.has("hexdrop_daily_v1"), "the daily record on this device is cleared");
  }
  // Wiring: loader exports, load order, the profile screen offers it.
  const index = read("index.html");
  for (const name of ["deleteUser", "reauthenticateWithPopup", "signOut", "revokeAccessToken"]) assert(index.includes(name + ":u." + name), "index.html must export " + name);
  assert(index.indexOf('"app-account-delete-v1.js"') > index.indexOf('"app-google-login.js"'), "load after the Google login layer");
  const app = read("app-16.js");
  assert(app.includes('"data-hex-account-delete":"1"') && /pending=Net\.deleteAccount\(\)/.test(app), "the profile screen offers account deletion");
  console.log("account delete PASS");
})().catch(e => { console.error("account delete FAIL:", e && e.stack || e); process.exit(1); });
