// Behaviour of the online layer (Net in public/app-15.js and the handshake of
// public/app-online-v2.js) against an in-memory stand-in for the Realtime
// Database: listeners, transactions, onDisconnect, .info/connected and writes
// that the rules would refuse.
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const read = f => fs.readFileSync(path.join(__dirname, "..", "public", f), "utf8");
const app14 = read("app-14.js"), app15 = read("app-15.js"), online = read("app-online-v2.js");
// The handshake wrapper is the first IIFE of app-online-v2.js.
const handshake = online.slice(0, online.indexOf("\n})();") + "\n})();".length);
const constants = /const BANDW = [^\n]*\n/.exec(app14)[0] + /const bandOf = [^\n]*\n/.exec(app14)[0] + /const eloDelta = [^\n]*\n/.exec(app14)[0];

function fakeFirebase() {
  const tree = {}, listeners = [], log = [], disconnects = [];
  const parts = p => String(p || "").split("/").filter(Boolean);
  const getAt = p => { let n = tree; for (const k of parts(p)) { if (n == null || typeof n !== "object") return null; n = n[k]; } return n === undefined ? null : n; };
  const clean = v => { if (v && typeof v === "object") { if (v[".sv"] === "timestamp") return Date.now(); const o = {}; for (const k of Object.keys(v)) { const c = clean(v[k]); if (c !== null && c !== undefined) o[k] = c; } return Object.keys(o).length ? o : null; } return v === undefined ? null : v; };
  const setAt = (p, v) => { const ks = parts(p); v = clean(v); if (!ks.length) { for (const k of Object.keys(tree)) delete tree[k]; Object.assign(tree, v || {}); return; } let n = tree; for (const k of ks.slice(0, -1)) { if (n[k] == null || typeof n[k] !== "object") n[k] = {}; n = n[k]; } if (v === null) delete n[ks[ks.length - 1]]; else n[ks[ks.length - 1]] = v; };
  const snap = (p) => { const v = getAt(p); const copy = v === null ? null : JSON.parse(JSON.stringify(v)); return { val: () => copy, exists: () => copy !== null }; };
  const notify = () => { for (const l of listeners.slice()) { const cur = JSON.stringify(getAt(l.path)); if (cur === l.last) continue; l.last = cur; l.cb(snap(l.path)); } };
  const F = {
    tree, log, disconnects, deny: null, delay: 0, getAt, setAt: (p, v) => { setAt(p, v); notify(); },
    initializeApp: () => ({}), getAuth: () => ({}), getDatabase: () => ({}),
    ref: (db, p) => ({ path: p || "" }),
    serverTimestamp: () => ({ ".sv": "timestamp" }),
    get: async (r) => snap(r.path),
    async write(kind, r, changes) {
      log.push({ kind, path: r.path, paths: Object.keys(changes) });
      if (F.delay) await new Promise(res => setTimeout(res, F.delay));
      if (F.deny && Object.keys(changes).some(p => F.deny(p, changes[p], kind))) { const e = new Error("PERMISSION_DENIED: Permission denied"); e.code = "PERMISSION_DENIED"; throw e; }
      for (const p of Object.keys(changes)) setAt(p, changes[p]);
      notify();
    },
    set: (r, v) => F.write("set", r, { [r.path]: v }),
    remove: (r) => F.write("remove", r, { [r.path]: null }),
    update: (r, v) => { const ch = {}; for (const k of Object.keys(v)) ch[(r.path ? r.path + "/" : "") + k] = v[k]; return F.write("update", r, ch); },
    push: (r, v) => { const key = "push" + (++F.pushes); const p = { key, then: undefined }; if (v !== undefined) return F.write("push", r, { [r.path + "/" + key]: v }).then(() => p); return p; },
    pushes: 0,
    onValue: (r, cb, errCb, opts) => { const l = { path: r.path, cb, last: undefined }; listeners.push(l); const un = () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); }; if (opts && opts.onlyOnce) { cb(snap(r.path)); un(); return un; } Promise.resolve().then(() => { if (listeners.includes(l) && l.last === undefined) { l.last = JSON.stringify(getAt(l.path)); cb(snap(l.path)); } }); return un; },
    off: (r) => { for (let i = listeners.length - 1; i >= 0; i--) if (listeners[i].path === r.path) listeners.splice(i, 1); },
    listenersAt: (p) => listeners.filter(l => l.path === p).length,
    runTransaction: async (r, fn) => { const next = fn(getAt(r.path) === null ? null : JSON.parse(JSON.stringify(getAt(r.path)))); if (next === undefined) return { committed: false, snapshot: snap(r.path) }; await F.write("transaction", r, { [r.path]: next }); return { committed: true, snapshot: snap(r.path) }; },
    onDisconnect: (r) => ({ set: (v) => { disconnects.push({ path: r.path, op: "set", v }); return Promise.resolve(); }, remove: () => { disconnects.push({ path: r.path, op: "remove" }); return Promise.resolve(); }, cancel: () => { disconnects.push({ path: r.path, op: "cancel" }); return Promise.resolve(); } })
  };
  return F;
}

function makeNet(uid, F) {
  const doc = { hidden: false, handlers: {}, addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); }, removeEventListener(t, f) { this.handlers[t] = (this.handlers[t] || []).filter(x => x !== f); }, fire(t) { for (const f of (this.handlers[t] || []).slice()) f(); } };
  const win = { FB: F, addEventListener() {}, removeEventListener() {} };
  const ctx = vm.createContext({ window: win, document: doc, console, setTimeout, clearTimeout, Promise, Date, Math, JSON, Object, Number, String, Array, Error,
    WAZA: { STRAIGHT: {}, PYRAMID: {}, HEXAGON: {} }, HexPlayerName: { display: n => String(n || "Player") },
    HexTrophies: { set() {}, delta: (t, win) => (t < 300 ? (win ? 10 : 0) : t < 1000 ? (win ? 8 : -4) : (win ? 6 : -6)) } });
  vm.runInContext(constants + app15 + "\nthis.Net = Net;", ctx);
  vm.runInContext(handshake, ctx);
  const Net = ctx.Net;
  Net.fb = F; Net.db = {}; Net.uid = uid; Net.connect = async () => uid;
  return { Net, doc, win };
}
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const profile = (name, extra) => ({ name, rating: 1000, wins: 0, losses: 0, trophies: 0, best: 0, ...extra });
function seedMatch(F, mid, opts = {}) {
  F.setAt("users/me", profile("Me")); F.setAt("users/foe", profile("Foe"));
  F.setAt("matches/" + mid, { meta: { seed: 7, ranked: opts.ranked !== false, createdAt: 1 }, players: { 0: { uid: "foe", name: "Foe", rating: 1000, connected: !!opts.foeConnected }, 1: { uid: "me", name: "Me", rating: 1000, connected: false } } });
}

(async () => {
  // ---- settlement: the profile and the match's settled marker in one write
  {
    const F = fakeFirebase(), { Net } = makeNet("me", F);
    F.setAt("users/me", profile("Me")); Net.profile = profile("Me");
    const delta = await Net.applyRating(true, 1000, true, "m1");
    assert.strictEqual(delta, 16, "an even match won is +16");
    const w = F.log.find(l => l.kind === "update" && l.paths.includes("matches/m1/settled/me"));
    assert(w && w.path === "" && w.paths.includes("users/me/rating") && w.paths.includes("users/me/lastMatch") && w.paths.includes("users/me/lastResult"), "the settlement is one multi-path write with the settled marker");
    assert.strictEqual(F.getAt("matches/m1/settled/me"), true);
    assert.deepStrictEqual([F.getAt("users/me/rating"), F.getAt("users/me/wins"), F.getAt("users/me/trophies"), F.getAt("users/me/lastMatch"), F.getAt("users/me/lastResult")], [1016, 1, 10, "m1", "win"]);
    assert.strictEqual(F.getAt("leaderboard/me/rating"), 1016, "the leaderboard entry follows");
    // A refused settlement (two winners, or already settled) leaves the server as it was: the local numbers must follow it.
    F.deny = (p) => p.startsWith("users/me/") || p.startsWith("matches/");
    Net.lastTrophyDelta = 0;
    const d2 = await Net.applyRating(true, 1000, true, "m2");
    assert.strictEqual(d2, 0, "a refused settlement reports no rating change");
    assert.deepStrictEqual([Net.profile.rating, Net.profile.wins, Net.profile.trophies, Net.lastTrophyDelta], [1016, 1, 10, 0], "a refused settlement leaves the local profile at the server's values");
    assert(!F.log.some(l => l.kind === "update" && l.path === "users/me" && l.paths.includes("users/me/lastMatch")), "with the marker accepted once, the profile-only write is not tried");
  }
  // ---- rules from before the marker: fall back to the profile-only write, and remember it
  {
    const F = fakeFirebase(), { Net } = makeNet("me", F);
    F.setAt("users/me", profile("Me")); Net.profile = profile("Me");
    F.deny = (p) => /^matches\/[^/]+\/settled\//.test(p);
    assert.strictEqual(await Net.applyRating(false, 1000, true, "m1"), -16);
    assert.strictEqual(F.getAt("users/me/rating"), 984, "the rating is still written under rules without the marker");
    assert.strictEqual(F.getAt("matches/m1/settled/me"), null);
    const before = F.log.length;
    await Net.applyRating(true, 1000, true, "m2");
    assert(!F.log.slice(before).some(l => l.paths.some(p => p.includes("/settled/"))), "the marker is not tried again in the same session");
    assert.strictEqual(F.getAt("users/me/lastMatch"), "m2");
  }
  // ---- join(): result at once, presence across reconnects, hidden tab, dispute
  {
    const F = fakeFirebase(), { Net, doc } = makeNet("me", F);
    seedMatch(F, "m1", { foeConnected: true });
    F.setAt(".info/connected", true);
    const match = await Net.join("m1");
    assert.strictEqual(F.getAt("matches/m1/players/1/connected"), true);
    assert(Number.isFinite(F.getAt("matches/m1/players/1/joinedAt")), "joinedAt is recorded");
    const conn = []; match.events.onConnection = c => conn.push(c);
    await tick();
    // The handshake must leave Net.join()'s own listener on the opponent's connected flag in place.
    assert.strictEqual(F.listenersAt("matches/m1/players/0/connected"), 1, "the disconnect listener survives the handshake");
    F.setAt("matches/m1/players/0/connected", false); await tick();
    assert.strictEqual(conn[conn.length - 1], false, "the opponent's disconnect is noticed");
    F.setAt("matches/m1/players/0/connected", true); await tick();
    assert.strictEqual(conn[conn.length - 1], true, "and the reconnect cancels it");
    // A socket drop: the server's onDisconnect set connected=false; coming back restores it and arms the handler again.
    const armed = () => F.disconnects.filter(d => d.path === "matches/m1/players/1/connected" && d.op === "set" && d.v === false).length;
    const armedBefore = armed();
    F.setAt(".info/connected", false); F.setAt("matches/m1/players/1/connected", false); await tick();
    F.setAt(".info/connected", true); await tick();
    assert.strictEqual(F.getAt("matches/m1/players/1/connected"), true, "connected is true again after a reconnect");
    assert.strictEqual(armed(), armedBefore + 1, "onDisconnect is armed again after a reconnect");
    // A hidden tab does not run the game: it counts as away.
    doc.hidden = true; doc.fire("visibilitychange"); await tick();
    assert.strictEqual(F.getAt("matches/m1/players/1/connected"), false, "a hidden tab is marked away");
    doc.hidden = false; doc.fire("visibilitychange"); await tick();
    assert.strictEqual(F.getAt("matches/m1/players/1/connected"), true, "and present again when it returns");
    // Just back from being away: a win the opponent reports is accepted (they may have waited the 5 s).
    let finished = null; match.events.onFinish = (w, r) => { finished = [w, r]; }; match.events.canContest = () => true;
    F.setAt("matches/m1/result/0", { win: true, reason: "disconnect", ts: 1 }); await tick();
    assert.deepStrictEqual(finished, [false, "disconnect"], "a disconnect win right after an absence is accepted");
    assert.strictEqual(F.getAt("matches/m1/result/1"), null, "and not disputed");
    // After leaving, nothing is written any more.
    match.leave(); await tick(); const n = F.log.length;
    F.setAt(".info/connected", false); F.setAt(".info/connected", true); doc.fire("visibilitychange"); await tick();
    assert.strictEqual(F.log.length, n, "no presence writes after leave()");
    assert.strictEqual(F.getAt("matches/m1/players/1/connected"), false, "leave() marks this side as gone");
  }
  {
    // Steady presence and still playing: a reported win is disputed, so the rules settle nothing.
    const F = fakeFirebase(), { Net } = makeNet("me", F);
    seedMatch(F, "m2", { foeConnected: true }); F.setAt(".info/connected", true);
    const match = await Net.join("m2"); await tick();
    let finished = null; match.events.onFinish = (w, r) => { finished = [w, r]; }; match.events.canContest = () => true;
    F.setAt("matches/m2/result/0", { win: true, reason: "foe-dead", ts: 1 }); await tick();
    assert.deepStrictEqual(finished, [false, "contested"], "a win reported against a player who is still playing is disputed");
    assert.strictEqual(F.getAt("matches/m2/result/1/win"), true, "the disputing side reports a win too (two winners settle nothing)");
    assert.strictEqual(F.getAt("matches/m2/result/1/reason"), "contested");
  }
  {
    // The usual end: the opponent reports the own loss; no dispute.
    const F = fakeFirebase(), { Net } = makeNet("me", F);
    seedMatch(F, "m3", { foeConnected: true }); F.setAt(".info/connected", true);
    const match = await Net.join("m3"); await tick();
    let finished = null; match.events.onFinish = (w, r) => { finished = [w, r]; }; match.events.canContest = () => true;
    F.setAt("matches/m3/result/0", { win: false, reason: "dead", ts: 1 }); await tick();
    assert.deepStrictEqual(finished, [true, "dead"]);
    assert.strictEqual(F.getAt("matches/m3/result/1"), null);
  }
  {
    // reportResult shows the result at once; the write follows (offline it never came, and the board stayed dead).
    const F = fakeFirebase(), { Net } = makeNet("me", F);
    seedMatch(F, "m4", { foeConnected: true }); F.setAt(".info/connected", true);
    const match = await Net.join("m4"); await tick();
    let finished = null; match.events.onFinish = (w, r) => { finished = [w, r]; };
    F.delay = 50;
    const pending = match.reportResult(false, "dead");
    assert.deepStrictEqual(finished, [false, "dead"], "onFinish does not wait for the write");
    assert.strictEqual(F.getAt("matches/m4/result/1"), null);
    await pending; F.delay = 0;
    assert.strictEqual(F.getAt("matches/m4/result/1/win"), false, "the result is written");
  }
  {
    // The handshake waits for the opponent, then removes only its own listener.
    const F = fakeFirebase(), { Net } = makeNet("me", F);
    seedMatch(F, "m5", { foeConnected: false }); F.setAt(".info/connected", true);
    const joining = Net.join("m5"); await tick(5);
    F.setAt("matches/m5/players/0/connected", true);
    const match = await joining; await tick();
    assert.strictEqual(F.listenersAt("matches/m5/players/0/connected"), 1, "after the handshake, exactly the match's disconnect listener is left");
    const conn = []; match.events.onConnection = c => conn.push(c);
    F.setAt("matches/m5/players/0/connected", false); await tick();
    assert.deepStrictEqual(conn, [false], "the player who joined first still sees the opponent leave");
    match.leave();
  }
  // ---- matchmaking
  {
    const F = fakeFirebase(), { Net } = makeNet("me", F);
    F.setAt("users/me", profile("Me")); F.setAt("users/host", profile("Host")); Net.profile = profile("Me");
    F.setAt(".info/serverTimeOffset", 0); F.setAt(".info/connected", true);
    // A pairing left from an earlier search points at a match nobody is in.
    F.setAt("pairings/me", "deadMatch");
    F.setAt("lobby/6/waiting", { uid: "host", name: "Host", rating: 1000, trophies: 0, icon: "initial", ts: Date.now() });
    // The host answers its pairing by connecting.
    const origWrite = F.write;
    F.write = async (kind, r, changes) => { await origWrite(kind, r, changes); if (changes["pairings/host"]) setTimeout(() => F.setAt("matches/" + changes["pairings/host"] + "/players/0/connected", true), 5); };
    const match = await Net.findMatch(null, { cancelled: false });
    assert.strictEqual(F.getAt("pairings/me"), null, "a stale pairing is removed when a search starts");
    assert.strictEqual(match.opponent.name, "Host");
    assert.strictEqual(F.getAt("lobby/6/waiting"), null, "the host's lobby entry was claimed");
    const m = F.getAt("matches/" + match.matchId);
    assert(m && m.players[0].uid === "host" && m.players[1].uid === "me" && !m.players[0].joinedAt && !m.result && m.players[0].connected === true, "the claimer creates the match without anything that proves the host took part");
    match.leave();
  }
  {
    // Waiting in the lobby: the entry is removed if this client disconnects, in server time, and a refused transaction does not end the search.
    const F = fakeFirebase(), { Net } = makeNet("me", F);
    Net.profile = profile("Me"); Net.serverOffset = 120000;
    assert.strictEqual(await Net.putWaiting(6), true);
    assert(Math.abs(F.getAt("lobby/6/waiting/ts") - (Date.now() + 120000)) < 2000, "lobby time is server time");
    assert(F.disconnects.some(d => d.path === "lobby/6/waiting" && d.op === "remove"), "the lobby entry is removed on disconnect");
    Net.waitingBand = 6;
    assert.strictEqual(await Net.clearWaiting(), true, "clearWaiting reports that the own entry was still there");
    assert(F.disconnects.some(d => d.path === "lobby/6/waiting" && d.op === "cancel"), "leaving the lobby cancels the disconnect handler");
    Net.waitingBand = 6;
    assert.strictEqual(await Net.clearWaiting(), false, "an entry that is gone was taken by an opponent");
    F.deny = () => true;
    assert.strictEqual(await Net.putWaiting(6), false, "a refused lobby write is not an error");
    F.setAt("lobby/7/waiting", { uid: "x", name: "X", rating: 1000, ts: Date.now() + 120000 });
    assert.strictEqual(await Net.claim(7), null, "a refused claim is not an error");
    F.deny = null;
    F.setAt("pairings/me", "mX");
    assert.strictEqual(await Net.takePairing(), "mX"); assert.strictEqual(F.getAt("pairings/me"), null, "a pairing is consumed when taken");
    const waiting = Net.takePairing(200); await tick(20); F.setAt("pairings/me", "mY");
    assert.strictEqual(await waiting, "mY", "takePairing waits for a pairing that is on its way");
    assert.strictEqual(F.listenersAt("pairings/me"), 0, "waitPairing removes its listener");
  }
  // ---- rooms
  {
    const F = fakeFirebase(), { Net } = makeNet("me", F);
    F.setAt("users/me", profile("Me")); Net.profile = profile("Me"); F.setAt(".info/serverTimeOffset", 0);
    const room = await Net.createRoom();
    assert(/^\d{6}$/.test(room.code) && F.getAt("rooms/" + room.code + "/hostUid") === "me");
    const waiting = room.wait(); let outcome = null; waiting.then(m => { outcome = ["ok", m]; }, e => { outcome = ["err", e.message]; });
    await tick();
    // The connection dropped while the code was being shared: onDisconnect removed the room. It is opened again.
    F.setAt("rooms/" + room.code, null); await tick(5);
    assert.strictEqual(F.getAt("rooms/" + room.code + "/hostUid"), "me", "a room that disappears while its host waits is opened again under the same code");
    assert.strictEqual(outcome, null);
    // A guest attaches a match that cannot be joined (they left again): the host gets an error instead of waiting for ever.
    F.setAt("rooms/" + room.code + "/matchId", "missing"); await tick(5);
    assert(outcome && outcome[0] === "err" && /見つかりません/.test(outcome[1]), "a failed join ends the wait with an error: " + JSON.stringify(outcome));
    assert.strictEqual(F.getAt("rooms/" + room.code), null);
    // Cancel: the room goes and is not revived.
    const room2 = await Net.createRoom(); const w2 = room2.wait(); w2.catch(() => {}); await tick();
    await room2.cancel(); await tick(5);
    assert.strictEqual(F.getAt("rooms/" + room2.code), null, "a cancelled room is not opened again");
  }
  console.log("online net PASS");
})().catch(e => { console.error("online net FAIL:", e && e.stack || e); process.exit(1); });
