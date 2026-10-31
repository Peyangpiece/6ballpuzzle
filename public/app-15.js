// The other player's trophies and icon as their lobby entry or room carried
// them. An entry from a client without trophies (app 1.0) has neither; then
// the match leaves both out instead of guessing (the rules compare them with
// that player's profile).
const trophyFields = (trophies, icon) => Number.isFinite(Number(trophies)) && trophies !== null && trophies !== undefined && typeof icon === "string" ? { trophies: Number(trophies), icon } : {};
const Net = {
    fb: null, app: null, auth: null, db: null, uid: null,
    profile: { name: "Player", rating: 1000, wins: 0, losses: 0, trophies: 0, best: 0 },
    waitingBand: null,
    async sdk() {
        if (this.fb) return this.fb;
        for (let i = 0; i < 120 && !window.FB; i++) await new Promise((r) => setTimeout(r, 100));
        if (!window.FB) throw new Error("Firebase SDK を読み込めませんでした");
        this.fb = window.FB;return this.fb;
    },
    async connect() {
        if (this.uid) return this.uid;
        const F = await this.sdk();this.app = F.initializeApp(FIREBASE_CONFIG);this.auth = F.getAuth(this.app);this.db = F.getDatabase(this.app);await F.signInAnonymously(this.auth);
        this.uid = await new Promise((res) => {const un = F.onAuthStateChanged(this.auth, (u) => { if (u) {un();res(u.uid);} });});
        const snap = await F.get(F.ref(this.db, "users/" + this.uid));
        if (snap.exists()) this.profile = { ...this.profile, ...snap.val() };
        else await F.set(F.ref(this.db, "users/" + this.uid), { ...this.profile, updatedAt: F.serverTimestamp() });
        // Who settles ratings: "client" (default, rules-bounded) or "server"
        // (Cloud Function in firebase/functions; clients only wait and read back).
        try { const cfg = await F.get(F.ref(this.db, "config/ratingAuthority")); this.ratingAuthority = cfg.exists() && cfg.val() === "server" ? "server" : "client"; }
        catch (_) { this.ratingAuthority = "client"; }
        this.syncTrophies();
        return this.uid;
    },
    ratingAuthority: "client",
    async reloadProfile() {
        if (!this.fb || !this.uid) return this.profile;
        const F = this.fb;const snap = await F.get(F.ref(this.db, "users/" + this.uid)).catch(() => null);
        if (snap && snap.exists()) this.profile = { ...this.profile, ...snap.val() };
        this.syncTrophies();
        return this.profile;
    },
    // Server mode: wait for matches/{mid}/settlement/{uid} written by the Cloud
    // Function, then mirror the authoritative profile.  Falls back to a plain
    // profile reload if the function has not answered within the timeout.
    awaitServerRating(matchId, timeoutMs = 10000) {
        const F = this.fb, self = this;const before = Number(this.profile.rating) || 1000, trophiesBefore = Number(this.profile.trophies) || 0;
        const ref = F.ref(this.db, "matches/" + matchId + "/settlement/" + this.uid);
        return new Promise((resolve) => {
            let done = false;
            const finish = async (val) => {if (done) return;done = true;clearTimeout(timer);try { F.off(ref); } catch (_) { }
                if (val && Number.isFinite(Number(val.rating))) {self.profile.rating = Number(val.rating);self.profile.wins = Number(val.wins) || 0;self.profile.losses = Number(val.losses) || 0;
                    if (Number.isFinite(Number(val.trophies))) {self.lastTrophyDelta = Number(val.trophies) - trophiesBefore;self.profile.trophies = Number(val.trophies);self.profile.best = Math.max(Number(self.profile.best) || 0, self.profile.trophies);}
                    self.syncTrophies();resolve(Number(val.delta) || 0);return;}
                await self.reloadProfile();self.lastTrophyDelta = (Number(self.profile.trophies) || 0) - trophiesBefore;self.syncTrophies();resolve((Number(self.profile.rating) || before) - before);};
            const timer = setTimeout(() => finish(null), timeoutMs);
            F.onValue(ref, (s) => { const v = s.val(); if (v) finish(v); }, () => finish(null));
        });
    },
    bands(b, spread) {const out = [b];for (let d = 1; d <= spread; d++) {if (b - d >= 0) out.push(b - d);if (b + d <= 19) out.push(b + d);}return out;},
    async claim(band) {
        const F = this.fb;let taken = null;
        const res = await F.runTransaction(F.ref(this.db, "lobby/" + band + "/waiting"), (cur) => {taken = null;if (!cur || cur.uid === this.uid) return;if (Date.now() - (cur.ts || 0) > STALE_MS) return null;taken = { uid: cur.uid, name: cur.name, rating: cur.rating, trophies: cur.trophies, icon: cur.icon };return null;});
        return res.committed ? taken : null;
    },
    async putWaiting(band) {
        const F = this.fb;const res = await F.runTransaction(F.ref(this.db, "lobby/" + band + "/waiting"), (cur) => {if (cur && cur.uid !== this.uid && Date.now() - (cur.ts || 0) <= STALE_MS) return;return { uid: this.uid, name: this.profile.name, rating: this.profile.rating, trophies: this.leaderboardEntry().trophies, icon: this.leaderboardEntry().icon, ts: Date.now() };});return res.committed;
    },
    async clearWaiting() {if (this.waitingBand == null || !this.fb) return;const F = this.fb, band = this.waitingBand;this.waitingBand = null;await F.runTransaction(F.ref(this.db, "lobby/" + band + "/waiting"), (cur) => (cur && cur.uid === this.uid ? null : undefined)).catch(() => { });},
    waitPairing(ms) {const F = this.fb, r = F.ref(this.db, "pairings/" + this.uid);return new Promise((resolve) => {const to = setTimeout(() => { F.off(r); resolve(null); }, ms);F.onValue(r, (s) => {const v = s.val();if (typeof v === "string") {clearTimeout(to);F.off(r);resolve(v);}});});},
    async cancelMatchmaking() {try {await this.clearWaiting();if (this.fb && this.uid) await this.fb.remove(this.fb.ref(this.db, "pairings/" + this.uid));}catch (e) {}},
    async findMatch(onProgress, signal) {
        await this.connect();const F = this.fb, myBand = bandOf(this.profile.rating), started = Date.now();
        // A transaction starts from the local cache and is abandoned when the
        // update function returns undefined on that first run. A lobby slot is
        // only cached while something listens to it, so without a listener
        // claim() always saw null and never took a waiting host. Keep a listener
        // on every band this search touches (waiting for its first value) and
        // drop them all when the search ends.
        const watched = new Map();
        const watch = (b) => new Promise((res) => {if (watched.has(b)) return res();let first = true;const done = () => { if (first) { first = false; res(); } };const un = F.onValue(F.ref(this.db, "lobby/" + b + "/waiting"), done, done);watched.set(b, un);});
        try {
        for (let round = 0;; round++) {
            if (signal && signal.cancelled) {await this.cancelMatchmaking();throw new Error("cancelled");}
            const spread = Math.min(4, Math.floor(round / 2));if (onProgress) onProgress(Date.now() - started, spread);
            for (const b of this.bands(myBand, spread)) {
                await watch(b);
                const host = await this.claim(b);if (!host) continue;
                const matchId = F.push(F.ref(this.db, "matches")).key;const seed = Math.floor(Math.random() * 0x7fffffff);
                await F.set(F.ref(this.db, "matches/" + matchId), {meta: { seed, ranked: true, createdAt: F.serverTimestamp() },players: {0: { uid: host.uid, name: host.name, rating: host.rating, ...trophyFields(host.trophies, host.icon), connected: false },1: { uid: this.uid, name: this.profile.name, rating: this.profile.rating, trophies: this.leaderboardEntry().trophies, icon: this.leaderboardEntry().icon, connected: false }}});
                await F.set(F.ref(this.db, "pairings/" + host.uid), matchId);return this.join(matchId);
            }
            await watch(myBand);
            if (await this.putWaiting(myBand)) {this.waitingBand = myBand;const matchId = await this.waitPairing(WAIT_MS);if (matchId) {await this.clearWaiting();await F.remove(F.ref(this.db, "pairings/" + this.uid)).catch(() => { });return this.join(matchId);}}
            await new Promise((r) => setTimeout(r, 250));
        }
        } finally { for (const un of watched.values()) { try { un(); } catch (_) { } } }
    },
    async createRoom() {
        await this.connect();const F = this.fb;let code = "";
        for (let i = 0; i < 12; i++) {const c = String(Math.floor(100000 + Math.random() * 900000));const res = await F.runTransaction(F.ref(this.db, "rooms/" + c), (cur) => cur == null || Date.now() - (cur.createdAt || 0) > 1800000 ? { hostUid: this.uid, hostName: this.profile.name, hostRating: this.profile.rating, hostTrophies: this.leaderboardEntry().trophies, hostIcon: this.leaderboardEntry().icon, createdAt: Date.now(), matchId: null } : undefined);if (res.committed) {code = c;break;}}
        if (!code) throw new Error("ルームコードを発行できませんでした");
        const roomRef = F.ref(this.db, "rooms/" + code);F.onDisconnect(roomRef).remove();const self = this;
        return {code,wait: () => new Promise((resolve) => {F.onValue(roomRef, async (s) => {const v = s.val();if (v && v.matchId) {F.off(roomRef);await F.remove(roomRef).catch(() => { });resolve(await self.join(v.matchId));}});}),cancel: async () => { F.off(roomRef); await F.remove(roomRef).catch(() => { }); }};
    },
    async joinRoom(code) {
        await this.connect();const F = this.fb;const roomRef = F.ref(this.db, "rooms/" + code);const snap = await F.get(roomRef);
        if (!snap.exists()) throw new Error("その部屋は見つかりません");
        const room = snap.val();if (room.hostUid === this.uid) throw new Error("自分の部屋には入れません");if (room.matchId) throw new Error("その部屋はすでに埋まっています");
        const matchId = F.push(F.ref(this.db, "matches")).key;const seed = Math.floor(Math.random() * 0x7fffffff);
        await F.set(F.ref(this.db, "matches/" + matchId), {meta: { seed, ranked: false, createdAt: F.serverTimestamp() },players: {0: { uid: room.hostUid, name: room.hostName, rating: room.hostRating, ...trophyFields(room.hostTrophies, room.hostIcon), connected: false },1: { uid: this.uid, name: this.profile.name, rating: this.profile.rating, trophies: this.leaderboardEntry().trophies, icon: this.leaderboardEntry().icon, connected: false }}});await F.update(roomRef, { matchId });return this.join(matchId);
    },
    // Private rooms record players by Firebase auth UID (the rules require
    // players/$i/uid == auth.uid). Ranked matchmaking swaps a per-tab client id
    // into `uid` inside join(), so room joins run with that id set to the UID.
    async hostRoom() {
        const room = await this.createRoom();const self = this, saved = this.onlineClientId;let restored = false;
        const restore = () => { if (!restored) { restored = true; self.onlineClientId = saved; } };
        return {code: room.code,
            wait: async () => { self.onlineClientId = self.uid; try { return await room.wait(); } finally { restore(); } },
            cancel: async () => { restore(); await room.cancel(); }};
    },
    async joinRoomCode(code) {
        await this.connect();const saved = this.onlineClientId;this.onlineClientId = this.uid;
        try { return await this.joinRoom(code); } finally { this.onlineClientId = saved; }
    },
    async join(matchId) {
        const F = this.fb, base = "matches/" + matchId;const snap = await F.get(F.ref(this.db, base));if (!snap.exists()) throw new Error("対戦データが見つかりません");
        const m = snap.val();const myIndex = m.players[0].uid === this.uid ? 0 : 1;const foeIndex = myIndex === 0 ? 1 : 0;const foe = m.players[foeIndex];const connRef = F.ref(this.db, base + "/players/" + myIndex + "/connected");await F.set(connRef, true);F.onDisconnect(connRef).set(false);F.set(F.ref(this.db, base + "/players/" + myIndex + "/joinedAt"), Date.now()).catch(() => { }); // write-once proof of participation; results and ratings require it from both players
        const events = {};const refs = [];let finished = false, discTimer = null, lastSent = 0, timer = null, pending = null, foeEverConnected = false;
        const stateRef = F.ref(this.db, base + "/state/" + foeIndex);F.onValue(stateRef, (s) => {const v = s.val();if (!v) return;if (events.onOpponentState) events.onOpponentState({ board: v.board, incoming: v.incoming || 0, alive: v.alive !== false, piece:v.piece||null, fx:v.fx||null });});refs.push(stateRef);
        const atkRef = F.ref(this.db, base + "/attacks/" + myIndex);const seen = {};F.onValue(atkRef, (s) => {const v = s.val() || {};for (const k in v) {if (seen[k]) continue;seen[k] = 1;if (events.onAttack) events.onAttack({ n: v[k].n || 0, shapes: Array.isArray(v[k].shapes) ? v[k].shapes.filter((w) => WAZA[w]) : [] });}});refs.push(atkRef);
        const foeConnRef = F.ref(this.db, base + "/players/" + foeIndex + "/connected");F.onValue(foeConnRef, (s) => {const c = s.val() === true;if(c)foeEverConnected=true;if (events.onConnection) events.onConnection(c);if (discTimer) {clearTimeout(discTimer);discTimer = null;}if (!c && foeEverConnected && !finished) discTimer = setTimeout(() => { if (!finished) handle.reportResult(true, "disconnect"); }, GRACE_MS);});refs.push(foeConnRef);
        const resRef = F.ref(this.db, base + "/result");F.onValue(resRef, (s) => {const v = s.val();if (!v || finished) return;const mine = v[myIndex], theirs = v[foeIndex];if (mine) {finished = true;if (events.onFinish) events.onFinish(mine.win, mine.reason);} else if (theirs) {finished = true;if (events.onFinish) events.onFinish(!theirs.win, theirs.reason);}});refs.push(resRef);
        const self = this;const flush = () => {if (!pending) return;const p = pending;pending = null;lastSent = Date.now();F.set(F.ref(self.db, base + "/state/" + myIndex), { board: p.b, incoming: p.inc, alive: p.alive, piece:p.piece, fx:p.fx, ts: Date.now() }).catch(() => { });};
        const handle = {matchId, seed: m.meta.seed, myIndex, ranked: m.meta.ranked !== false, events,opponent: { uid: foe.uid, name: HexPlayerName.display(foe.name), rating: foe.rating, trophies: Math.max(0, Number(foe.trophies) || 0), icon: typeof foe.icon === "string" ? foe.icon : "initial" },
            sendBoard(board, incoming, alive, piece=null, fx=null) {pending = { b: board, inc: incoming, alive, piece, fx };const wait = SNAP_MS - (Date.now() - lastSent);if (wait <= 0) flush();else if (!timer) timer = setTimeout(() => { timer = null; flush(); }, wait);},
            sendAttack(n, shapes = []) {if (n > 0 || shapes.length) F.push(F.ref(self.db, base + "/attacks/" + foeIndex), { n, shapes, ts: Date.now() }).catch(() => { });},
            async reportResult(win, reason) {if (finished) return;finished = true;await F.set(F.ref(self.db, base + "/result/" + myIndex), { win, reason, ts: Date.now() }).catch(() => { });if (events.onFinish) events.onFinish(win, reason);},
            leave() {finished = true;if (discTimer) clearTimeout(discTimer);if (timer) clearTimeout(timer);for (const r of refs) F.off(r);F.set(connRef, false).catch(() => { });}}
        ;return handle;
    },
    // Trophies (HexTrophies, app-trophies-v1.js) move in the same write as the
    // match result, so the rules can check the step against lastResult; the
    // Elo rating keeps working underneath for matchmaking.
    lastTrophyDelta: 0,
    syncTrophies() { if (typeof HexTrophies !== "undefined") HexTrophies.set(this.profile); },
    leaderboardEntry() { return { name: this.profile.name, rating: Number(this.profile.rating) || 1000, trophies: Math.max(0, Number(this.profile.trophies) || 0), icon: (this.profile.equip && this.profile.equip.icon) || "initial" }; },
    async applyRating(win, foeRating, ranked, matchId = null) {if (this.ratingAuthority === "server" && this.fb && this.uid && typeof matchId === "string" && matchId) return this.awaitServerRating(matchId);const delta = ranked === false ? 0 : eloDelta(this.profile.rating, foeRating, win);this.profile.rating = Math.max(0, this.profile.rating + delta);this.profile.wins += win ? 1 : 0;this.profile.losses += win ? 0 : 1;
        const t0 = Math.max(0, Number(this.profile.trophies) || 0), td = ranked === false || typeof HexTrophies === "undefined" ? 0 : HexTrophies.delta(t0, win);
        this.profile.trophies = t0 + td;this.profile.best = Math.max(Number(this.profile.best) || 0, this.profile.trophies);this.lastTrophyDelta = td;this.syncTrophies();
        if (this.fb && this.uid) {const F = this.fb;const patch = {rating: this.profile.rating, wins: this.profile.wins,losses: this.profile.losses, trophies: this.profile.trophies, best: this.profile.best, updatedAt: F.serverTimestamp()};if (typeof matchId === "string" && matchId) { patch.lastMatch = matchId; patch.lastResult = win ? "win" : "loss"; }await F.update(F.ref(this.db, "users/" + this.uid), patch).catch(() => { });await F.set(F.ref(this.db, "leaderboard/" + this.uid), this.leaderboardEntry()).catch(() => { });}return delta;}
};
// Trophy ranking: the top players in leaderboard/{uid} ({name, rating,
// trophies, icon}, written after every rated match), most trophies first.
// Equal counts share a rank (1, 2, 2, 4). Entries from before trophies count 0.
Net.fetchLeaderboard = async function (limit = 50) {
    await this.connect();
    const F = this.fb;
    const ref = F.ref(this.db, "leaderboard");
    let snap;
    // The query needs ".indexOn": "trophies" in the database rules; until those
    // rules are deployed, read the whole list and sort it here.
    try { snap = await F.get(F.query(ref, F.orderByChild("trophies"), F.limitToLast(limit))); }
    catch (err) { if (!/index/i.test(String(err?.message || err))) throw err; snap = await F.get(ref); }
    const rows = [];
    snap.forEach((c) => { const v = c.val() || {}; rows.push({ uid: c.key, name: HexPlayerName.display(v.name), rating: Number(v.rating) || 0, trophies: Math.max(0, Number(v.trophies) || 0), icon: typeof v.icon === "string" ? v.icon : "initial" }); });
    rows.sort((a, b) => b.trophies - a.trophies || a.name.localeCompare(b.name));
    rows.length = Math.min(rows.length, limit);
    rows.forEach((r, i) => { r.rank = i && rows[i - 1].trophies === r.trophies ? rows[i - 1].rank : i + 1; });
    return { rows, me: this.uid };
};
