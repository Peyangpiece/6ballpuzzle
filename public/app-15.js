const Net = {
    fb: null, app: null, auth: null, db: null, uid: null,
    profile: { name: "Player", rating: 1000, wins: 0, losses: 0 },
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
        return this.uid;
    },
    bands(b, spread) {const out = [b];for (let d = 1; d <= spread; d++) {if (b - d >= 0) out.push(b - d);if (b + d <= 19) out.push(b + d);}return out;},
    async claim(band) {
        const F = this.fb;let taken = null;
        const res = await F.runTransaction(F.ref(this.db, "lobby/" + band + "/waiting"), (cur) => {taken = null;if (!cur || cur.uid === this.uid) return;if (Date.now() - (cur.ts || 0) > STALE_MS) return null;taken = { uid: cur.uid, name: cur.name, rating: cur.rating };return null;});
        return res.committed ? taken : null;
    },
    async putWaiting(band) {
        const F = this.fb;const res = await F.runTransaction(F.ref(this.db, "lobby/" + band + "/waiting"), (cur) => {if (cur && cur.uid !== this.uid && Date.now() - (cur.ts || 0) <= STALE_MS) return;return { uid: this.uid, name: this.profile.name, rating: this.profile.rating, ts: Date.now() };});return res.committed;
    },
    async clearWaiting() {if (this.waitingBand == null || !this.fb) return;const F = this.fb, band = this.waitingBand;this.waitingBand = null;await F.runTransaction(F.ref(this.db, "lobby/" + band + "/waiting"), (cur) => (cur && cur.uid === this.uid ? null : undefined)).catch(() => { });},
    waitPairing(ms) {const F = this.fb, r = F.ref(this.db, "pairings/" + this.uid);return new Promise((resolve) => {const to = setTimeout(() => { F.off(r); resolve(null); }, ms);F.onValue(r, (s) => {const v = s.val();if (typeof v === "string") {clearTimeout(to);F.off(r);resolve(v);}});});},
    async cancelMatchmaking() {try {await this.clearWaiting();if (this.fb && this.uid) await this.fb.remove(this.fb.ref(this.db, "pairings/" + this.uid));}catch (e) {}},
    async findMatch(onProgress, signal) {
        await this.connect();const F = this.fb, myBand = bandOf(this.profile.rating), started = Date.now();
        for (let round = 0;; round++) {
            if (signal && signal.cancelled) {await this.cancelMatchmaking();throw new Error("cancelled");}
            const spread = Math.min(4, Math.floor(round / 2));if (onProgress) onProgress(Date.now() - started, spread);
            for (const b of this.bands(myBand, spread)) {
                const host = await this.claim(b);if (!host) continue;
                const matchId = F.push(F.ref(this.db, "matches")).key;const seed = Math.floor(Math.random() * 0x7fffffff);
                await F.set(F.ref(this.db, "matches/" + matchId), {meta: { seed, ranked: true, createdAt: F.serverTimestamp() },players: {0: { uid: host.uid, name: host.name, rating: host.rating, connected: false },1: { uid: this.uid, name: this.profile.name, rating: this.profile.rating, connected: false }}});
                await F.set(F.ref(this.db, "pairings/" + host.uid), matchId);return this.join(matchId);
            }
            if (await this.putWaiting(myBand)) {this.waitingBand = myBand;const matchId = await this.waitPairing(WAIT_MS);if (matchId) {await this.clearWaiting();await F.remove(F.ref(this.db, "pairings/" + this.uid)).catch(() => { });return this.join(matchId);}}
            await new Promise((r) => setTimeout(r, 250));
        }
    },
    async createRoom() {
        await this.connect();const F = this.fb;let code = "";
        for (let i = 0; i < 12; i++) {const c = String(Math.floor(100000 + Math.random() * 900000));const res = await F.runTransaction(F.ref(this.db, "rooms/" + c), (cur) => cur == null || Date.now() - (cur.createdAt || 0) > 1800000 ? { hostUid: this.uid, hostName: this.profile.name, hostRating: this.profile.rating, createdAt: Date.now(), matchId: null } : undefined);if (res.committed) {code = c;break;}}
        if (!code) throw new Error("ルームコードを発行できませんでした");
        const roomRef = F.ref(this.db, "rooms/" + code);F.onDisconnect(roomRef).remove();const self = this;
        return {code,wait: () => new Promise((resolve) => {F.onValue(roomRef, async (s) => {const v = s.val();if (v && v.matchId) {F.off(roomRef);await F.remove(roomRef).catch(() => { });resolve(await self.join(v.matchId));}});}),cancel: async () => { F.off(roomRef); await F.remove(roomRef).catch(() => { }); }};
    },
    async joinRoom(code) {
        await this.connect();const F = this.fb;const roomRef = F.ref(this.db, "rooms/" + code);const snap = await F.get(roomRef);
        if (!snap.exists()) throw new Error("その部屋は見つかりません");
        const room = snap.val();if (room.hostUid === this.uid) throw new Error("自分の部屋には入れません");if (room.matchId) throw new Error("その部屋はすでに埋まっています");
        const matchId = F.push(F.ref(this.db, "matches")).key;const seed = Math.floor(Math.random() * 0x7fffffff);
        await F.set(F.ref(this.db, "matches/" + matchId), {meta: { seed, ranked: false, createdAt: F.serverTimestamp() },players: {0: { uid: room.hostUid, name: room.hostName, rating: room.hostRating, connected: false },1: { uid: this.uid, name: this.profile.name, rating: this.profile.rating, connected: false }}});await F.update(roomRef, { matchId });return this.join(matchId);
    },
    async join(matchId) {
        const F = this.fb, base = "matches/" + matchId;const snap = await F.get(F.ref(this.db, base));if (!snap.exists()) throw new Error("対戦データが見つかりません");
        const m = snap.val();const myIndex = m.players[0].uid === this.uid ? 0 : 1;const foeIndex = myIndex === 0 ? 1 : 0;const foe = m.players[foeIndex];const connRef = F.ref(this.db, base + "/players/" + myIndex + "/connected");await F.set(connRef, true);F.onDisconnect(connRef).set(false);
        const events = {};const refs = [];let finished = false, discTimer = null, lastSent = 0, timer = null, pending = null;
        const stateRef = F.ref(this.db, base + "/state/" + foeIndex);F.onValue(stateRef, (s) => {const v = s.val();if (!v) return;if (events.onOpponentState) events.onOpponentState({ board: v.board, incoming: v.incoming || 0, alive: v.alive !== false, piece:v.piece||null, fx:v.fx||null });});refs.push(stateRef);
        const atkRef = F.ref(this.db, base + "/attacks/" + myIndex);const seen = {};F.onValue(atkRef, (s) => {const v = s.val() || {};for (const k in v) {if (seen[k]) continue;seen[k] = 1;if (events.onAttack) events.onAttack({ n: v[k].n || 0, shapes: Array.isArray(v[k].shapes) ? v[k].shapes.filter((w) => WAZA[w]) : [] });}});refs.push(atkRef);
        const foeConnRef = F.ref(this.db, base + "/players/" + foeIndex + "/connected");F.onValue(foeConnRef, (s) => {const c = s.val() === true;if (events.onConnection) events.onConnection(c);if (discTimer) {clearTimeout(discTimer);discTimer = null;}if (!c && !finished) discTimer = setTimeout(() => { if (!finished) handle.reportResult(true, "disconnect"); }, GRACE_MS);});refs.push(foeConnRef);
        const resRef = F.ref(this.db, base + "/result");F.onValue(resRef, (s) => {const v = s.val();if (!v || finished) return;const mine = v[myIndex], theirs = v[foeIndex];if (mine) {finished = true;if (events.onFinish) events.onFinish(mine.win, mine.reason);} else if (theirs) {finished = true;if (events.onFinish) events.onFinish(!theirs.win, theirs.reason);}});refs.push(resRef);
        const self = this;const flush = () => {if (!pending) return;const p = pending;pending = null;lastSent = Date.now();F.set(F.ref(self.db, base + "/state/" + myIndex), { board: p.b, incoming: p.inc, alive: p.alive, piece:p.piece, fx:p.fx, ts: Date.now() }).catch(() => { });};
        const handle = {matchId, seed: m.meta.seed, myIndex, ranked: m.meta.ranked !== false, events,opponent: { uid: foe.uid, name: foe.name, rating: foe.rating },
            sendBoard(board, incoming, alive, piece=null, fx=null) {pending = { b: board, inc: incoming, alive, piece, fx };const wait = SNAP_MS - (Date.now() - lastSent);if (wait <= 0) flush();else if (!timer) timer = setTimeout(() => { timer = null; flush(); }, wait);},
            sendAttack(n, shapes = []) {if (n > 0 || shapes.length) F.push(F.ref(self.db, base + "/attacks/" + foeIndex), { n, shapes, ts: Date.now() }).catch(() => { });},
            async reportResult(win, reason) {if (finished) return;finished = true;await F.set(F.ref(self.db, base + "/result/" + myIndex), { win, reason, ts: Date.now() }).catch(() => { });if (events.onFinish) events.onFinish(win, reason);},
            leave() {finished = true;if (discTimer) clearTimeout(discTimer);if (timer) clearTimeout(timer);for (const r of refs) F.off(r);F.set(connRef, false).catch(() => { });}}
        ;return handle;
    },
    async applyRating(win, foeRating, ranked) {const delta = ranked === false ? 0 : eloDelta(this.profile.rating, foeRating, win);this.profile.rating = Math.max(0, this.profile.rating + delta);this.profile.wins += win ? 1 : 0;this.profile.losses += win ? 0 : 1;if (this.fb && this.uid) {const F = this.fb;await F.update(F.ref(this.db, "users/" + this.uid), {rating: this.profile.rating, wins: this.profile.wins,losses: this.profile.losses, updatedAt: F.serverTimestamp()}).catch(() => { });await F.set(F.ref(this.db, "leaderboard/" + this.uid), { name: this.profile.name, rating: this.profile.rating }).catch(() => { });}return delta;}
};
