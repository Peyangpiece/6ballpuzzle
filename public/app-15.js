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
    // Lobby times are in server time (this device's clock plus the offset the
    // server reports): "is this entry older than 20 s" then means the same on
    // every device, and matches what the rules compute from their own clock.
    serverOffset: 0,
    serverNow() { return Date.now() + (Number(this.serverOffset) || 0); },
    async syncClock() {
        const F = this.fb;
        try {const snap = await new Promise((res) => {const to = setTimeout(() => res(null), 3000);F.onValue(F.ref(this.db, ".info/serverTimeOffset"), (v) => { clearTimeout(to); res(v); }, () => { clearTimeout(to); res(null); }, { onlyOnce: true });});this.serverOffset = snap ? Number(snap.val()) || 0 : 0;}
        catch (_) { this.serverOffset = 0; }
    },
    // A refused or failed transaction counts as "not taken" / "not placed": the
    // search goes on to the next band or round instead of ending with an error.
    async claim(band) {
        const F = this.fb;let taken = null;
        try {
            const res = await F.runTransaction(F.ref(this.db, "lobby/" + band + "/waiting"), (cur) => {taken = null;if (!cur || cur.uid === this.uid) return;if (this.serverNow() - (cur.ts || 0) > STALE_MS) return null;taken = { uid: cur.uid, name: cur.name, rating: cur.rating, trophies: cur.trophies, icon: cur.icon };return null;});
            return res.committed ? taken : null;
        } catch (_) { return null; }
    },
    async putWaiting(band) {
        const F = this.fb, ref = F.ref(this.db, "lobby/" + band + "/waiting");
        try {
            const res = await F.runTransaction(ref, (cur) => {if (cur && cur.uid !== this.uid && this.serverNow() - (cur.ts || 0) <= STALE_MS) return;return { uid: this.uid, name: this.profile.name, rating: this.profile.rating, trophies: this.leaderboardEntry().trophies, icon: this.leaderboardEntry().icon, ts: this.serverNow() };});
            // A closed tab or a killed app must not stay in the lobby for 20 s.
            if (res.committed) { try { F.onDisconnect(ref).remove(); } catch (_) { } }
            return res.committed;
        } catch (_) { return false; }
    },
    // Leaves the lobby. Resolves true when this player's entry was still there
    // (nobody had taken it).
    async clearWaiting() {if (this.waitingBand == null || !this.fb) return false;const F = this.fb, band = this.waitingBand, ref = F.ref(this.db, "lobby/" + band + "/waiting");this.waitingBand = null;try { F.onDisconnect(ref).cancel(); } catch (_) { }try {const res = await F.runTransaction(ref, (cur) => (cur && cur.uid === this.uid ? null : undefined));return !!(res && res.committed);} catch (_) { return false; }},
    // Each caller removes only its own listener (F.off(ref) would remove them all).
    waitPairing(ms) {const F = this.fb, r = F.ref(this.db, "pairings/" + this.uid);return new Promise((resolve) => {let un = null, done = false;const end = (v) => {if (done) return;done = true;clearTimeout(to);try { if (un) un(); } catch (_) { }resolve(v);};const to = setTimeout(() => end(null), ms);un = F.onValue(r, (s) => {const v = s.val();if (typeof v === "string") end(v);}, () => end(null));if (done) { try { un(); } catch (_) { } }});},
    // The match this player was paired into, if any; the pairing is consumed.
    async takePairing(waitMs = 0) {
        const F = this.fb, r = F.ref(this.db, "pairings/" + this.uid);let id = null;
        try { const s = await F.get(r); if (typeof s.val() === "string") id = s.val(); } catch (_) { }
        if (!id && waitMs > 0) id = await this.waitPairing(waitMs);
        if (id) await F.remove(r).catch(() => { });
        return id;
    },
    async cancelMatchmaking() {try {await this.clearWaiting();if (this.fb && this.uid) await this.fb.remove(this.fb.ref(this.db, "pairings/" + this.uid));}catch (e) {}},
    async findMatch(onProgress, signal) {
        await this.connect();const F = this.fb, myBand = bandOf(this.profile.rating), started = Date.now();
        await this.syncClock();
        // A pairing left from an earlier search (cancelled or closed just as an
        // opponent took the entry) points at a match nobody is in: joining it
        // waited 20 s and failed. Start clean.
        await F.remove(F.ref(this.db, "pairings/" + this.uid)).catch(() => { });
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
            // Leave the lobby before taking someone else's entry. Two players who
            // each kept waiting while claiming the other ended up in two different
            // matches, and both timed out. If the entry is already gone, an opponent
            // took it and the pairing is on its way: join that match.
            if (this.waitingBand != null) {const mine = await this.clearWaiting();const paired = mine ? null : await this.takePairing(1200);if (paired) return this.join(paired);}
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
        await this.connect();const F = this.fb;let code = "";await this.syncClock();
        const roomData = () => ({ hostUid: this.uid, hostName: this.profile.name, hostRating: this.profile.rating, hostTrophies: this.leaderboardEntry().trophies, hostIcon: this.leaderboardEntry().icon, createdAt: this.serverNow(), matchId: null });
        for (let i = 0; i < 12; i++) {const c = String(Math.floor(100000 + Math.random() * 900000));let res = null;try { res = await F.runTransaction(F.ref(this.db, "rooms/" + c), (cur) => cur == null || this.serverNow() - (cur.createdAt || 0) > 1800000 ? roomData() : undefined); } catch (_) { }if (res && res.committed) {code = c;break;}}
        if (!code) throw new Error("ルームコードを発行できませんでした");
        const roomRef = F.ref(this.db, "rooms/" + code);F.onDisconnect(roomRef).remove();const self = this;
        let closed = false, un = null;
        return {code,
            // Resolves with the match once a guest has joined. Rejects when joining
            // that match fails (the guest left again), instead of waiting for ever
            // on a room that no longer exists. If the room disappears while waiting
            // (the connection dropped while the code was being shared, and
            // onDisconnect removed it), it is opened again under the same code.
            wait: () => new Promise((resolve, reject) => {
                let revived = 0;
                un = F.onValue(roomRef, async (s) => {
                    if (closed) return;const v = s.val();
                    if (v && v.matchId) {closed = true;try { un(); } catch (_) { }await F.remove(roomRef).catch(() => { });try { resolve(await self.join(v.matchId)); } catch (e) { reject(e); }return;}
                    if (v === null) {
                        if (++revived > 5) {closed = true;try { un(); } catch (_) { }reject(new Error("ルームが閉じられました。もう一度作成してください"));return;}
                        try { await F.set(roomRef, roomData()); if (!closed) F.onDisconnect(roomRef).remove(); }
                        catch (_) {if (!closed) {closed = true;try { un(); } catch (_e) { }reject(new Error("ルームが閉じられました。もう一度作成してください"));}}
                    }
                }, (err) => {if (!closed) { closed = true; reject(err); }});
            }),
            cancel: async () => {closed = true;try { if (un) un(); } catch (_) { }try { F.onDisconnect(roomRef).cancel(); } catch (_) { }await F.remove(roomRef).catch(() => { });}};
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
        const m = snap.val();const myIndex = m.players[0].uid === this.uid ? 0 : 1;const foeIndex = myIndex === 0 ? 1 : 0;const foe = m.players[foeIndex];const connRef = F.ref(this.db, base + "/players/" + myIndex + "/connected");await F.set(connRef, true);F.onDisconnect(connRef).set(false);
        // Presence for the whole match. onDisconnect fires once, so after a short
        // network drop (Wi-Fi to mobile data) "connected" stayed false and the
        // opponent's 5 s grace timer could never be cancelled: every reconnect
        // was a loss. Each time the socket comes back, the handler is armed again
        // and the flag restored. A hidden tab or backgrounded app does not run
        // the game (it is driven by animation frames), so it counts as away:
        // the opponent sees the notice and wins after the grace time instead of
        // waiting for a board that cannot move.
        let left = false, lastAwayAt = 0;
        const present = () => !(typeof document !== "undefined" && document.hidden);
        const assertPresence = () => {lastAwayAt = Date.now();if (left || finished) return;try { F.onDisconnect(connRef).set(false); } catch (_) { }F.set(connRef, present()).catch(() => { });};
        let infoUn = null, socketDown = false;
        try { infoUn = F.onValue(F.ref(this.db, ".info/connected"), (s) => {if (s.val() !== true) { socketDown = true; lastAwayAt = Date.now(); return; }if (!socketDown) return;socketDown = false;assertPresence();}); } catch (_) { }
        const onVisibility = () => assertPresence();
        if (typeof document !== "undefined" && document.addEventListener) document.addEventListener("visibilitychange", onVisibility);
        const stopPresence = () => {left = true;try { if (infoUn) infoUn(); } catch (_) { }if (typeof document !== "undefined" && document.removeEventListener) document.removeEventListener("visibilitychange", onVisibility);};F.set(F.ref(this.db, base + "/players/" + myIndex + "/joinedAt"), Date.now()).catch(() => { }); // write-once proof of participation; results and ratings require it from both players
        const events = {};const refs = [];let finished = false, discTimer = null, lastSent = 0, timer = null, pending = null, foeEverConnected = false;
        const stateRef = F.ref(this.db, base + "/state/" + foeIndex);F.onValue(stateRef, (s) => {const v = s.val();if (!v) return;if (events.onOpponentState) events.onOpponentState({ board: v.board, incoming: v.incoming || 0, alive: v.alive !== false, piece:v.piece||null, fx:v.fx||null });});refs.push(stateRef);
        const atkRef = F.ref(this.db, base + "/attacks/" + myIndex);const seen = {};F.onValue(atkRef, (s) => {const v = s.val() || {};for (const k in v) {if (seen[k]) continue;seen[k] = 1;if (events.onAttack) events.onAttack({ n: v[k].n || 0, shapes: Array.isArray(v[k].shapes) ? v[k].shapes.filter((w) => WAZA[w]) : [] });}});refs.push(atkRef);
        const foeConnRef = F.ref(this.db, base + "/players/" + foeIndex + "/connected");F.onValue(foeConnRef, (s) => {const c = s.val() === true;if(c)foeEverConnected=true;if (events.onConnection) events.onConnection(c);if (discTimer) {clearTimeout(discTimer);discTimer = null;}if (!c && foeEverConnected && !finished) discTimer = setTimeout(() => { if (!finished) handle.reportResult(true, "disconnect"); }, GRACE_MS);});refs.push(foeConnRef);
        const resRef = F.ref(this.db, base + "/result");F.onValue(resRef, (s) => {const v = s.val();if (!v || finished) return;const mine = v[myIndex], theirs = v[foeIndex];if (mine) {finished = true;if (events.onFinish) events.onFinish(mine.win, mine.reason);} else if (theirs) {finished = true;
            // The only honest way to report one's own win is the opponent's
            // disconnect, after 5 s without them. A win reported against a player
            // who is still playing and has been connected and on screen all along
            // is disputed: this side reports a win too, and the rules settle
            // nothing for a match with two winners (neither rating moves).
            const steady = present() && Date.now() - lastAwayAt > GRACE_MS + 3000;
            if (theirs.win === true && steady && typeof events.canContest === "function" && events.canContest()) {F.set(F.ref(this.db, base + "/result/" + myIndex), { win: true, reason: "contested", ts: Date.now() }).catch(() => { });if (events.onFinish) events.onFinish(false, "contested");}
            else if (events.onFinish) events.onFinish(!theirs.win, theirs.reason);}});refs.push(resRef);
        const self = this;const flush = () => {if (!pending) return;const p = pending;pending = null;lastSent = Date.now();F.set(F.ref(self.db, base + "/state/" + myIndex), { board: p.b, incoming: p.inc, alive: p.alive, piece:p.piece, fx:p.fx, ts: Date.now() }).catch(() => { });};
        const handle = {matchId, seed: m.meta.seed, myIndex, ranked: m.meta.ranked !== false, events,opponent: { uid: foe.uid, name: HexPlayerName.display(foe.name), rating: foe.rating, trophies: Math.max(0, Number(foe.trophies) || 0), icon: typeof foe.icon === "string" ? foe.icon : "initial" },
            sendBoard(board, incoming, alive, piece=null, fx=null) {pending = { b: board, inc: incoming, alive, piece, fx };const wait = SNAP_MS - (Date.now() - lastSent);if (wait <= 0) flush();else if (!timer) timer = setTimeout(() => { timer = null; flush(); }, wait);},
            sendAttack(n, shapes = []) {if (n > 0 || shapes.length) F.push(F.ref(self.db, base + "/attacks/" + foeIndex), { n, shapes, ts: Date.now() }).catch(() => { });},
            // The result is shown at once; the write follows (the client sends its
            // writes in order, so the rating update that finish() starts next is
            // checked by the rules after this result). Waiting for the write left a
            // dead board with no result while offline, and its late callback could
            // end a match started in the meantime.
            async reportResult(win, reason) {if (finished) return;finished = true;const written = F.set(F.ref(self.db, base + "/result/" + myIndex), { win, reason, ts: Date.now() }).catch(() => { });if (events.onFinish) events.onFinish(win, reason);await written;},
            leave() {finished = true;stopPresence();if (discTimer) clearTimeout(discTimer);if (timer) clearTimeout(timer);for (const r of refs) F.off(r);F.set(connRef, false).catch(() => { });}}
        ;return handle;
    },
    // Trophies (HexTrophies, app-trophies-v1.js) move in the same write as the
    // match result, so the rules can check the step against lastResult; the
    // Elo rating keeps working underneath for matchmaking.
    lastTrophyDelta: 0,
    syncTrophies() { if (typeof HexTrophies !== "undefined") HexTrophies.set(this.profile); },
    leaderboardEntry() { return { name: this.profile.name, rating: Number(this.profile.rating) || 1000, trophies: Math.max(0, Number(this.profile.trophies) || 0), icon: (this.profile.equip && this.profile.equip.icon) || "initial" }; },
    // The settlement write. With the match id it is one multi-path update: the
    // profile fields and matches/{mid}/settled/{uid}, the write-once marker the
    // rules require so that a match is settled once per player (without it the
    // same win could be applied again and again). Rules from before the marker
    // refuse that path; then the profile alone is written, as before, and the
    // marker is not tried again in this session.
    settledMarker: null,
    async writeSettlement(patch, matchId) {
        const F = this.fb, base = "users/" + this.uid;
        if (typeof matchId === "string" && matchId && this.settledMarker !== false) {
            const all = { ["matches/" + matchId + "/settled/" + this.uid]: true };
            for (const k of Object.keys(patch)) all[base + "/" + k] = patch[k];
            try { await F.update(F.ref(this.db), all); this.settledMarker = true; return true; }
            catch (_) { if (this.settledMarker === true) return false; }
        }
        try { await F.update(F.ref(this.db, base), patch); if (typeof matchId === "string" && matchId && this.settledMarker === null) this.settledMarker = false; return true; }
        catch (_) { return false; }
    },
    async applyRating(win, foeRating, ranked, matchId = null) {if (this.ratingAuthority === "server" && this.fb && this.uid && typeof matchId === "string" && matchId) return this.awaitServerRating(matchId);
        const before = { rating: Number(this.profile.rating) || 0, wins: Number(this.profile.wins) || 0, losses: Number(this.profile.losses) || 0, trophies: Math.max(0, Number(this.profile.trophies) || 0), best: Number(this.profile.best) || 0 };
        let delta = ranked === false ? 0 : eloDelta(this.profile.rating, foeRating, win);this.profile.rating = Math.max(0, this.profile.rating + delta);this.profile.wins += win ? 1 : 0;this.profile.losses += win ? 0 : 1;
        const t0 = Math.max(0, Number(this.profile.trophies) || 0), td = ranked === false || typeof HexTrophies === "undefined" ? 0 : HexTrophies.delta(t0, win);
        this.profile.trophies = t0 + td;this.profile.best = Math.max(Number(this.profile.best) || 0, this.profile.trophies);this.lastTrophyDelta = td;this.syncTrophies();
        if (this.fb && this.uid) {const F = this.fb;const patch = {rating: this.profile.rating, wins: this.profile.wins,losses: this.profile.losses, trophies: this.profile.trophies, best: this.profile.best, updatedAt: F.serverTimestamp()};if (typeof matchId === "string" && matchId) { patch.lastMatch = matchId; patch.lastResult = win ? "win" : "loss"; }
            // A refused settlement (both players reported a win, or the match was
            // settled already) changed nothing on the server: take the numbers back,
            // then read the stored profile, so the screen and later searches use what
            // the server holds (a local-only rating made the rules refuse the lobby).
            if (!(await this.writeSettlement(patch, matchId))) {Object.assign(this.profile, before);await this.reloadProfile();delta = (Number(this.profile.rating) || 0) - before.rating;this.lastTrophyDelta = Math.max(0, Number(this.profile.trophies) || 0) - before.trophies;this.syncTrophies();}
            await F.set(F.ref(this.db, "leaderboard/" + this.uid), this.leaderboardEntry()).catch(() => { });}return delta;}
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
