// Google sign-in flow (public/app-google-login.js) against a fake Firebase SDK:
// - the popup is requested synchronously in the click when Firebase is set up
//   (browsers block a popup opened after awaited work);
// - a Google account that already belongs to a player is signed in with the
//   credential from the first popup, never with a second popup;
// - a new users/ record starts at the values the database rules accept.
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const PUBLIC = path.join(__dirname, "..", "public");
const read = f => fs.readFileSync(path.join(PUBLIC, f), "utf8");

function fakeFirebase(db) {
  const calls = [];
  const auth = { currentUser: null };
  class GoogleAuthProvider {
    setCustomParameters(p) { this.params = p; }
    static credentialFromError(err) { return err.credential || null; }
  }
  const F = {
    calls, auth,
    initializeApp: () => ({}), getAuth: () => auth, getDatabase: () => ({}),
    onAuthStateChanged: (a, cb) => { setTimeout(() => cb(a.currentUser), 0); return () => {}; },
    signInAnonymously: async a => { a.currentUser = { uid: "anon1", isAnonymous: true }; return { user: a.currentUser }; },
    GoogleAuthProvider,
    linkWithPopup: (user, provider) => { calls.push(["linkWithPopup", user.uid]); return F.linkResult(user, provider); },
    signInWithPopup: (a, provider) => { calls.push(["signInWithPopup"]); a.currentUser = { uid: "google1", isAnonymous: false, displayName: "Taro" }; return Promise.resolve({ user: a.currentUser }); },
    signInWithCredential: (a, cred) => { calls.push(["signInWithCredential", cred.id]); a.currentUser = { uid: "google1", isAnonymous: false, displayName: "Taro" }; return Promise.resolve({ user: a.currentUser }); },
    ref: (_, p) => p,
    get: async p => ({ exists: () => p in db, val: () => db[p] }),
    set: async (p, v) => { calls.push(["set", p, v]); db[p] = v; },
    update: async (p, v) => { db[p] = { ...(db[p] || {}), ...v }; },
    serverTimestamp: () => 1
  };
  return F;
}

function load(F) {
  const ctx = { console, setTimeout, clearTimeout };
  ctx.window = ctx; ctx.FB = F;
  vm.createContext(ctx);
  vm.runInContext(read("app-14.js").match(/const FIREBASE_CONFIG = \{[^}]*\};/)[0], ctx);
  vm.runInContext(read("app-15.js") + "\nthis.Net=Net;", ctx);
  vm.runInContext(read("app-google-login.js"), ctx);
  return ctx.Net;
}

(async () => {
  // 1. Guest linked to a new Google account: popup in the click, guest record kept.
  {
    const db = { "users/anon1": { name: "Player", rating: 1040, wins: 2, losses: 1 } };
    const F = fakeFirebase(db), Net = load(F);
    await Net.connect();
    F.linkResult = user => { user.isAnonymous = false; user.displayName = "Taro"; return Promise.resolve({ user }); };
    const pending = Net.loginWithGoogle();
    assert.deepStrictEqual(F.calls.map(c => c[0]), ["linkWithPopup"], "the popup must be requested in the click itself");
    const user = await pending;
    assert.strictEqual(user.uid, "anon1");
    assert.strictEqual(Net.profile.rating, 1040, "the linked guest keeps its record");
  }
  // 2. Google account already used by a player: no second popup.
  {
    const db = { "users/anon1": { name: "Player", rating: 1000, wins: 0, losses: 0 }, "users/google1": { name: "Taro", rating: 1210, wins: 9, losses: 4 } };
    const F = fakeFirebase(db), Net = load(F);
    await Net.connect();
    F.linkResult = () => Promise.reject(Object.assign(new Error("in use"), { code: "auth/credential-already-in-use", credential: { id: "cred1" } }));
    const user = await Net.loginWithGoogle();
    const names = F.calls.map(c => c[0]);
    assert(!names.includes("signInWithPopup"), "a second popup would be blocked: " + names);
    assert.deepStrictEqual(F.calls.find(c => c[0] === "signInWithCredential"), ["signInWithCredential", "cred1"]);
    assert.strictEqual(user.uid, "google1");
    assert.strictEqual(Net.uid, "google1");
    assert.strictEqual(Net.profile.rating, 1210, "the existing player's record is loaded");
  }
  // 3. A Google account with no record yet starts at the rules' starting values.
  {
    const db = { "users/anon1": { name: "Player", rating: 1080, wins: 3, losses: 0 } };
    const F = fakeFirebase(db), Net = load(F);
    await Net.connect();
    F.linkResult = () => Promise.reject(Object.assign(new Error("in use"), { code: "auth/credential-already-in-use", credential: { id: "cred2" } }));
    await Net.loginWithGoogle();
    const created = F.calls.find(c => c[0] === "set" && c[1] === "users/google1");
    assert(created, "a record is created for the Google account");
    assert.strictEqual(created[2].rating, 1000);
    assert.strictEqual(created[2].wins, 0);
    assert.strictEqual(created[2].losses, 0);
  }
  // 4. Other errors still reach the caller; before Firebase is set up the flow still works.
  {
    const F = fakeFirebase({}), Net = load(F);
    await Net.connect();
    F.linkResult = () => Promise.reject(Object.assign(new Error("blocked"), { code: "auth/popup-blocked" }));
    await assert.rejects(Net.loginWithGoogle(), e => e.code === "auth/popup-blocked");
    const F2 = fakeFirebase({}), Net2 = load(F2);
    const user = await Net2.loginWithGoogle();
    assert.strictEqual(user.uid, "google1");
  }
  // The SDK loader exports what the flow uses.
  const loader = read("index.html");
  for (const name of ["GoogleAuthProvider", "linkWithPopup", "signInWithPopup", "signInWithCredential"])
    assert(loader.includes(name + ":u." + name), "index.html must export " + name);
  // Messages for the failures a player can act on.
  const menu = read("app-menu-ui.js");
  assert(/function hexGoogleLoginError\(code\)/.test(menu) && /auth\/popup-blocked/.test(menu), "popup-blocked has its own message");
  console.log("google login PASS");
})().catch(e => { console.error("google login FAIL:", e && e.stack || e); process.exit(1); });
