// iOS app bridge (public/app-native-v1.js) against a fake Capacitor runtime and
// a fake Firebase SDK. In a browser the layer must do nothing; in the app it
// routes haptics, Game Center, native Apple/Google sign-in and Firebase Auth.
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const PUBLIC = path.join(__dirname, "..", "public");
const read = f => fs.readFileSync(path.join(PUBLIC, f), "utf8");

function fakeFirebase(db) {
  const calls = [];
  const auth = { currentUser: null };
  class GoogleAuthProvider { setCustomParameters() {} static credential(idToken, accessToken) { return { provider: "google", idToken, accessToken }; } static credentialFromError() { return null; } }
  class OAuthProvider { constructor(id) { this.id = id; } credential(o) { return { provider: this.id, ...o }; } static credentialFromError(err) { return err.pending || null; } }
  const F = {
    calls, auth, GoogleAuthProvider, OAuthProvider, indexedDBLocalPersistence: "idb",
    initializeApp: () => ({}),
    getAuth: () => { calls.push(["getAuth"]); return auth; },
    initializeAuth: (app, o) => { calls.push(["initializeAuth", o.persistence]); return auth; },
    getDatabase: () => ({}),
    onAuthStateChanged: (a, cb) => { setTimeout(() => cb(a.currentUser), 0); return () => {}; },
    signInAnonymously: async a => { a.currentUser = { uid: "anon1", isAnonymous: true }; return { user: a.currentUser }; },
    linkWithCredential: async (u, cred) => { calls.push(["linkWithCredential", cred]); if (F.linkFails) throw Object.assign(new Error("in use"), { code: "auth/credential-already-in-use", pending: { provider: "apple.com", pendingFromError: true } }); u.isAnonymous = false; return { user: u }; },
    signInWithCredential: async (a, cred) => { calls.push(["signInWithCredential", cred]); a.currentUser = { uid: "apple1", isAnonymous: false, displayName: "Hanako" }; return { user: a.currentUser }; },
    ref: (_, p) => p,
    get: async p => ({ exists: () => p in db, val: () => db[p] }),
    set: async (p, v) => { db[p] = v; },
    update: async (p, v) => { db[p] = { ...(db[p] || {}), ...v }; },
    serverTimestamp: () => 1
  };
  return F;
}

function load({ native, responses = {}, debugBuild = false }) {
  const nativeCalls = [], later = [], listeners = {};
  const F = fakeFirebase({ "users/apple1": { name: "Hanako", rating: 1300, wins: 4, losses: 1 } });
  // Timers longer than a second (start-up work, safety timeouts) wait in `later`.
  const ctx = { console, setTimeout: (f, ms) => (ms > 1000 ? (later.push(f), 0) : setTimeout(f, ms)), clearTimeout, navigator: {}, FB: F };
  ctx.window = ctx;
  if (debugBuild) ctx.__dropBallDebugBuild = true;
  if (native) {
    ctx.Capacitor = {
      isNativePlatform: () => true,
      addListener: (plugin, event, f) => { (listeners[plugin + "." + event] = listeners[plugin + "." + event] || []).push(f); },
      nativePromise: (plugin, method, options) => {
        nativeCalls.push([plugin, method, options]);
        const r = responses[plugin + "." + method];
        if (r !== undefined) return typeof r === "function" ? r(options) : Promise.resolve(r);
        if (plugin === "GameCenter" && method === "signIn") return Promise.resolve({ authenticated: true });
        if (plugin === "FirebaseAuthentication" && method === "signInWithApple") return Promise.resolve({ credential: { providerId: "apple.com", idToken: "apple-id-token", nonce: "raw-nonce" } });
        if (plugin === "FirebaseAuthentication" && method === "signInWithGoogle") return Promise.resolve({ credential: { providerId: "google.com", idToken: "g-id", accessToken: "g-access" } });
        return Promise.resolve({});
      }
    };
  }
  vm.createContext(ctx);
  vm.runInContext(read("app-14.js").match(/const FIREBASE_CONFIG = \{[^}]*\};/)[0], ctx);
  vm.runInContext(read("app-15.js") + "\nthis.Net=Net;", ctx);
  vm.runInContext(read("app-google-login.js"), ctx);
  // The match record helper of app-menu-ui.js, as the bridge sees it.
  vm.runInContext("var recorded=[];function hexRecordMatch(a){recorded.push(a);return{ok:true};}", ctx);
  // The settled rating of a ranked match, as app-15.js leaves it on the profile.
  vm.runInContext("Net.applyRating=async function(win){this.profile.rating=1216;return 16;};", ctx);
  vm.runInContext(read("app-native-v1.js"), ctx);
  const fire = (key, data) => { for (const f of listeners[key] || []) f(data); };
  const runLater = () => { for (const f of later.splice(0)) f(); };
  return { ctx, F, nativeCalls, Net: ctx.Net, fire, runLater };
}
const tick = () => new Promise(r => setTimeout(r, 10));

(async () => {
  // Browser: nothing changes.
  {
    const { ctx, nativeCalls } = load({ native: false });
    assert.strictEqual(ctx.DropBallNative, undefined, "no native bridge in a browser");
    assert.strictEqual(ctx.navigator.vibrate, undefined, "navigator.vibrate untouched in a browser");
    assert.strictEqual(nativeCalls.length, 0);
  }
  const { ctx, F, nativeCalls, Net } = load({ native: true });
  const calls = (plugin, method) => nativeCalls.filter(c => c[0] === plugin && c[1] === method);
  // Haptics through navigator.vibrate (the existing 振動 setting path).
  assert.strictEqual(typeof ctx.navigator.vibrate, "function");
  ctx.navigator.vibrate(8); ctx.navigator.vibrate(25); ctx.navigator.vibrate([40, 30, 40]);
  assert.deepStrictEqual(calls("Haptics", "impact").map(c => c[2].style), ["LIGHT", "MEDIUM", "HEAVY"]);
  // Achievements from the match record.
  const out = vm.runInContext("hexRecordMatch({cpuLevel:3,win:true,summary:{wazaTotal:2,waza:{STRAIGHT:1,PYRAMID:0,HEXAGON:1},maxChain:5}})", ctx);
  assert.deepStrictEqual(Object.assign({}, out), { ok: true }, "the original record helper still runs and returns");
  await tick();
  const unlocked = calls("GameCenter", "unlockAchievement").map(c => c[2].achievementID).sort();
  assert.deepStrictEqual(unlocked, ["dropball.ai_3", "dropball.chain_3", "dropball.chain_5", "dropball.first_win", "dropball.hexagon", "dropball.waza_first"]);
  // Firebase Auth in WKWebView: initializeAuth with IndexedDB, never getAuth's popup resolver.
  await Net.connect();
  assert(F.calls.some(c => c[0] === "initializeAuth" && c[1] === "idb"), "initializeAuth with IndexedDB persistence");
  assert(!F.calls.some(c => c[0] === "getAuth"), "getAuth hangs in WKWebView");
  // Apple sign-in links the guest account with the native credential.
  await Net.loginWithApple();
  const apple = calls("FirebaseAuthentication", "signInWithApple");
  assert.strictEqual(apple.length, 1);
  assert.strictEqual(apple[0][2].skipNativeAuth, true);
  const link = F.calls.find(c => c[0] === "linkWithCredential");
  assert.deepStrictEqual(Object.assign({}, link[1]), { provider: "apple.com", idToken: "apple-id-token", rawNonce: "raw-nonce" });
  // An Apple account that already has a player signs in with the pending credential.
  {
    const s = load({ native: true });
    await s.Net.connect();
    s.F.linkFails = true;
    const user = await s.Net.loginWithApple();
    const signIn = s.F.calls.find(c => c[0] === "signInWithCredential");
    assert(signIn && signIn[1].pendingFromError, "uses the credential from the error");
    assert.strictEqual(user.uid, "apple1");
    assert.strictEqual(s.Net.profile.rating, 1300, "the existing player's record is loaded");
  }
  // Google sign-in uses the native sheet too.
  {
    const s = load({ native: true });
    await s.Net.connect();
    await s.Net.loginWithGoogle();
    const link = s.F.calls.find(c => c[0] === "linkWithCredential");
    assert.deepStrictEqual(Object.assign({}, link[1]), { provider: "google", idToken: "g-id", accessToken: "g-access" });
  }
  // Rating leaderboard after a ranked match.
  assert.strictEqual(await Net.applyRating(true, 1200, true, "m1"), 16, "the settlement result is returned unchanged");
  await tick();
  const score = calls("GameCenter", "submitScore");
  assert.deepStrictEqual(Object.assign({}, score[score.length - 1][2]), { leaderboardID: "dropball.rating", score: 1216 });
  const after = calls("GameCenter", "unlockAchievement").map(c => c[2].achievementID);
  assert(after.includes("dropball.online_win") && after.includes("dropball.rating_1200"));
  const before = score.length;
  await Net.applyRating(false, 1200, false, "room");
  await tick();
  assert.strictEqual(calls("GameCenter", "submitScore").length, before, "unranked matches are not submitted");
  // Re-authentication for account deletion goes through the native sheet.
  assert.strictEqual(typeof ctx.DropBallNative.reauthenticate, "function");
  // Ads: consent form, then the tracking prompt, then a test interstitial
  // (no AdMob ad unit yet), shown when leaving every third result screen.
  {
    const s = load({ native: true, responses: {
      "Store.owned": { productIDs: [] },
      "AdMob.requestConsentInfo": { status: "REQUIRED", isConsentFormAvailable: true, canRequestAds: false },
      "AdMob.showConsentForm": { status: "OBTAINED", canRequestAds: true },
      "AdMob.trackingAuthorizationStatus": { status: "notDetermined" },
      "Store.purchase": { owned: true }
    } });
    const adCalls = () => s.nativeCalls.filter(c => c[0] === "AdMob" || c[0] === "Store").map(c => c[0] + "." + c[1]);
    s.runLater(); await tick(); await tick();
    assert.deepStrictEqual(adCalls(), ["Store.owned", "AdMob.requestConsentInfo", "AdMob.showConsentForm", "AdMob.trackingAuthorizationStatus", "AdMob.requestTrackingAuthorization", "AdMob.initialize", "AdMob.prepareInterstitial"]);
    const prep = s.nativeCalls.find(c => c[1] === "prepareInterstitial")[2];
    assert.strictEqual(prep.adId, "ca-app-pub-3691106434438760/4546044730", "the AdMob ad unit in a release build");
    assert.strictEqual(prep.isTesting, false);
    const bgm = { paused: false, pauses: 0, plays: 0, pause() { this.paused = true; this.pauses++; }, play() { this.paused = false; this.plays++; return Promise.resolve(); } };
    s.ctx.Bgm = { audio: bgm };
    const Ads = s.ctx.DropBallAds;
    assert.strictEqual(await Ads.afterMatch(), false);
    assert.strictEqual(await Ads.afterMatch(), false);
    let shown = null;
    Ads.afterMatch().then(v => { shown = v; });
    await tick();
    assert(adCalls().includes("AdMob.showInterstitial"), "the third match shows the ad");
    assert.strictEqual(shown, null, "the next screen waits until the ad is closed");
    assert.strictEqual(bgm.pauses, 1, "the native BGM pauses under the ad");
    assert.strictEqual(await Ads.afterMatch(), false, "a second tap while the ad is open shows nothing more");
    s.fire("AdMob.interstitialAdDismissed");
    await tick();
    assert.strictEqual(shown, true);
    assert.strictEqual(bgm.plays, 1, "and plays again afterwards");
    assert.strictEqual(adCalls().filter(c => c === "AdMob.prepareInterstitial").length, 2, "the next ad is loaded");
    // "広告を削除": no more ads.
    await Ads.purchase();
    assert.strictEqual(Ads.state().removed, true);
    for (let i = 0; i < 6; i++) assert.strictEqual(await Ads.afterMatch(), false);
    assert.strictEqual(adCalls().filter(c => c === "AdMob.showInterstitial").length, 1);
  }
  // A player who bought "広告を削除" sees no consent form, prompt or ad.
  {
    const s = load({ native: true, responses: { "Store.owned": { productIDs: ["app.dropball.game.removeads"] } } });
    s.runLater(); await tick(); await tick();
    assert(!s.nativeCalls.some(c => c[0] === "AdMob"), "AdMob is never started");
    assert.strictEqual(s.ctx.DropBallAds.state().removed, true);
  }
  // A debug build (Xcode's Run) asks for Google's test ads.
  {
    const s = load({ native: true, debugBuild: true, responses: { "Store.owned": { productIDs: [] }, "AdMob.requestConsentInfo": { status: "NOT_REQUIRED", canRequestAds: true }, "AdMob.trackingAuthorizationStatus": { status: "denied" } } });
    s.runLater(); await tick(); await tick();
    const prep = s.nativeCalls.find(c => c[1] === "prepareInterstitial")[2];
    assert.strictEqual(prep.adId, "ca-app-pub-3940256099942544/4411468910");
    assert.strictEqual(prep.isTesting, true);
    assert(!s.nativeCalls.some(c => c[1] === "requestTrackingAuthorization"), "no prompt once the player has answered");
  }
  // Consent refused (EU): no ad requests.
  {
    const s = load({ native: true, responses: {
      "Store.owned": { productIDs: [] },
      "AdMob.requestConsentInfo": { status: "REQUIRED", isConsentFormAvailable: true, canRequestAds: false },
      "AdMob.showConsentForm": { status: "OBTAINED", canRequestAds: false }
    } });
    s.runLater(); await tick(); await tick();
    assert(!s.nativeCalls.some(c => c[1] === "initialize" || c[1] === "prepareInterstitial" || c[1] === "requestTrackingAuthorization"));
  }
  // Wiring.
  const index = read("index.html");
  for (const name of ["initializeAuth", "indexedDBLocalPersistence", "OAuthProvider", "linkWithCredential", "reauthenticateWithCredential"]) assert(index.includes(name + ":u." + name), "index.html must export " + name);
  assert(index.indexOf('"app-native-v1.js"') > index.indexOf('"app-menu-ui.js"') && index.indexOf('"app-native-v1.js"') < index.indexOf('"app-16.js"'), "the bridge loads after the record helpers and before the app");
  assert(!/gstatic\.com\/firebasejs/.test(index), "the Firebase SDK ships with the app (no remote code)");
  const swift = fs.readFileSync(path.join(__dirname, "..", "ios/App/App/DropBallNative.swift"), "utf8");
  for (const m of ["signIn", "submitScore", "unlockAchievement", "showLeaderboard"]) assert(swift.includes(`CAPPluginMethod(name: "${m}"`), "GameCenter." + m + " is exposed");
  for (const m of ["product", "purchase", "owned", "restore"]) assert(swift.includes(`CAPPluginMethod(name: "${m}"`), "Store." + m + " is exposed");
  assert(swift.includes("registerPluginInstance(StorePlugin())"), "the Store plugin is registered");
  const plist = fs.readFileSync(path.join(__dirname, "..", "ios/App/App/Info.plist"), "utf8");
  for (const key of ["GADApplicationIdentifier", "NSUserTrackingUsageDescription", "cstr6suwn9.skadnetwork"]) assert(plist.includes(key), "Info.plist needs " + key);
  assert(plist.includes("<string>ca-app-pub-3691106434438760~2668362996</string>"), "the AdMob app ID, not Google's test one");
  assert(/#if DEBUG[\s\S]*__dropBallDebugBuild=true[\s\S]*#endif/.test(swift), "debug builds ask for test ads");
  // The result screen asks for an ad before leaving; settings offer the purchase.
  const app16 = read("app-16.js");
  assert(/onNext:\(\)=>hexLeaveResult\(/.test(app16) && /onExit:\(\)=>hexLeaveResult\(/.test(app16), "both result buttons go through hexLeaveResult");
  assert(app16.includes("React.createElement(HexAdsSettings,null)"), "settings show 広告を削除 in the app");
  console.log("native bridge PASS");
})().catch(e => { console.error("native bridge FAIL:", e && e.stack || e); process.exit(1); });
