function Matching({ onMatched, onCancel, onError }) {
    const [phase, setPhase] = useState("connect");
    const [waited, setWaited] = useState(0);
    const [spread, setSpread] = useState(0);
    const [foe, setFoe] = useState(null);
    const sig = useRef({ cancelled: false });
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                await Net.connect();
                if (!alive) return;
                setPhase("search");
                const match = await Net.findMatch((ms, sp) => {if (!alive) return;setWaited(ms);setSpread(sp);}, sig.current);
                if (!alive) {match.leave();return;}
                setFoe(match.opponent);setPhase("found");setTimeout(() => { if (alive) onMatched(match); }, 1400);
            } catch (e) {
                const msg = (e && e.message) || String(e);
                if (alive && msg !== "cancelled") onError(msg);
            }
        })();
        return () => { alive = false; sig.current.cancelled = true; Net.cancelMatchmaking(); };
    }, []);
    return (React.createElement(Screen, null,
        React.createElement("div", { className: "flex flex-col items-center" },
            phase !== "found" ? (React.createElement(React.Fragment, null,
                React.createElement("div", { className: "w-12 h-12 rounded-full border-4 border-white/15 animate-spin mb-5", style: { borderTopColor: "#2FE3F5" } }),
                React.createElement("div", { className: "font-bold text-white/80" }, phase === "connect" ? "サーバーに接続中…" : "対戦相手を探しています…"),
                React.createElement("div", { className: "text-[11px] text-white/60 mt-1 tabular-nums" }, Math.floor(waited / 1000), " 秒"))) : (React.createElement(React.Fragment, null,
                React.createElement("div", { className: "text-[12px] tracking-[0.25em] font-bold text-white/60 mb-3" }, "対戦相手"),
                React.createElement("div", { className: "w-16 h-16 rounded-full mb-3", style: { background: "linear-gradient(135deg,#FF7AC6,#FFC46B)", boxShadow: "0 0 26px #FF3EA588" } }),
                React.createElement("div", { className: "text-xl font-extrabold text-white" }, foe.name),
                React.createElement("div", { className: "text-4xl font-extrabold text-white/20 my-4" }, "VS"))),
            phase === "search" && waited >= 30000 && React.createElement("div", { className: "mt-3 max-w-xs text-center text-xs leading-relaxed text-white/55" }, "対戦できる相手がまだ見つかりません。レートの近い順から探す範囲を広げています。"),
            phase !== "found" && React.createElement("button", { onClick: onCancel, className: "mt-5 rounded-xl px-6 py-2.5 text-sm font-black text-white/80", style: { border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.06)" } }, "キャンセル"))));
}

// Turn a thrown network error into a sentence a player can act on. Messages
// the client writes itself are already Japanese; Firebase codes are mapped.
function hexFriendlyNetError(msg) {
    const m = String(msg || "");
    if (!m) return "オンライン対戦を開始できませんでした。通信環境を確認して、もう一度お試しください。";
    if (/permission[_ ]denied/i.test(m)) return "サーバーに接続を拒否されました。時間をおいてもう一度お試しください。";
    if (/network|offline|failed to fetch|unavailable/i.test(m) || /Firebase SDK|Firebaseへ接続|Firebase接続なし/.test(m)) return "サーバーに接続できません。インターネット接続を確認してください。";
    if (/^[\x20-\x7e]+$/.test(m)) return "オンライン対戦を開始できませんでした（" + m.slice(0, 80) + "）。もう一度お試しください。";
    return m.replace(/:\s*$/, "") + "。";
}
function RoomSpinner({ label }) {
    return React.createElement("div", { className: "flex items-center justify-center gap-3 py-2", role: "status" },
        React.createElement("div", { className: "w-5 h-5 rounded-full border-2 border-white/15 animate-spin", style: { borderTopColor: "#9B6DFF" }, "aria-hidden": "true" }),
        React.createElement("div", { className: "text-sm font-bold text-white/80" }, label));
}
// Host side of a private room: issue a code on the server, then wait for a
// guest to join it. Leaving the screen withdraws the room.
function RoomHost({ onMatched, onCancel, onError }) {
    const [code, setCode] = useState("");
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        let alive = true, room = null;
        (async () => {
            try {
                room = await Net.hostRoom();
                if (!alive) { room.cancel(); return; }
                setCode(room.code);
                const match = await room.wait();
                if (!alive) { match.leave(); return; }
                onMatched(match);
            } catch (e) { if (alive) onError((e && e.message) || String(e)); }
        })();
        return () => { alive = false; if (room) room.cancel(); };
    }, []);
    const copy = () => { try { navigator.clipboard.writeText(code).then(() => setCopied(true), () => {}); } catch (_) {} };
    return React.createElement(HexMenuShell, { title: "ルームを作成", eyebrow: "PRIVATE ROOM // HOST", back: onCancel, wide: false },
        React.createElement(HexPanel, { accent: "violet", className: "p-6 text-center" },
            React.createElement("div", { className: "text-[11px] font-black tracking-[.2em] text-white/65" }, "ROOM CODE"),
            code ? React.createElement(React.Fragment, null,
                React.createElement("div", { className: "my-2 font-black tracking-[.24em] tabular-nums text-white select-all", style: { fontSize: "clamp(30px,5vw,44px)", textShadow: "0 0 24px rgba(155,109,255,.35)", userSelect: "text", WebkitUserSelect: "text" }, "aria-label": "ルームコード " + code.split("").join(" ") }, code.slice(0, 3), " ", code.slice(3)),
                React.createElement("div", { className: "text-xs text-white/60 mb-3" }, "このコードを友だちに伝えてください。相手が参加すると自動で始まります。"),
                React.createElement("button", { onClick: copy, className: "mb-4 rounded-xl px-4 py-2 text-xs font-black text-white/85", style: { border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.06)" } }, copied ? "コピーしました" : "コードをコピー"),
                React.createElement(RoomSpinner, { label: "相手の参加を待っています…" }))
                : React.createElement(RoomSpinner, { label: "ルームを準備しています…" }),
            React.createElement("button", { onClick: onCancel, className: "mt-4 rounded-xl px-5 py-2.5 text-xs font-black text-white/75", style: { border: "1px solid rgba(255,255,255,.16)", background: "rgba(255,255,255,.04)" } }, "キャンセル")));
}
// Guest side: join an existing room by its six-digit code.
function RoomJoin({ code, onMatched, onCancel, onError }) {
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const match = await Net.joinRoomCode(code);
                if (!alive) { match.leave(); return; }
                onMatched(match);
            } catch (e) { if (alive) onError((e && e.message) || String(e)); }
        })();
        return () => { alive = false; };
    }, []);
    return React.createElement(HexMenuShell, { title: "ルームに参加", eyebrow: "PRIVATE ROOM // GUEST", back: onCancel, wide: false },
        React.createElement(HexPanel, { accent: "violet", className: "p-6 text-center" },
            React.createElement("div", { className: "text-[11px] font-black tracking-[.2em] text-white/65 mb-2" }, "ROOM CODE ", code.slice(0, 3), " ", code.slice(3)),
            React.createElement(RoomSpinner, { label: "ホストと接続しています…" }),
            React.createElement("button", { onClick: onCancel, className: "mt-4 rounded-xl px-5 py-2.5 text-xs font-black text-white/75", style: { border: "1px solid rgba(255,255,255,.16)", background: "rgba(255,255,255,.04)" } }, "キャンセル")));
}

// Network packets arrive at a much lower cadence than the 120 Hz game loop.
// Advance the opponent's airborne garbage with the same capture-derived
// absolute free-fall law used by the authoritative engine. Snapshot values
// remain a monotone lower bound, so packet refreshes never pull a shape upward.
stepNetGarbageMotion=function(g,dt){
    for(const p of g.activeGarbagePacks||[]){
        const snapshotAge=Number.isFinite(p.netBubbleT)?p.netBubbleT:(p.bubbleT||0);
        if(!Number.isFinite(p._netGarbageLead))p._netGarbageLead=0;
        p._netGarbageLead=Math.min(SNAP_MS/1000+.04,p._netGarbageLead+Math.max(0,dt));
        const age=Math.max(p.bubbleT||0,snapshotAge+p._netGarbageLead);
        p.bubbleT=age;
        if(age<=HEX_GARBAGE_BUBBLE_DURATION+1e-12){
            p.y=Math.max(GARBAGE_START_Y,Number.isFinite(p.netY)?p.netY:GARBAGE_START_Y);
            p.vy=0;
            continue;
        }
        const flightAge=age-HEX_GARBAGE_BUBBLE_DURATION;
        const referenceY=GARBAGE_START_Y+(HEX_GARBAGE_FLIGHT_V0*flightAge+.5*GRAV*flightAge*flightAge)/HEX_ROW_H;
        const snapshotY=Number.isFinite(p.netY)?p.netY:GARBAGE_START_Y;
        p.y=Math.max(Number.isFinite(p.y)?p.y:GARBAGE_START_Y,snapshotY,referenceY);
        p.vy=Math.max(Number.isFinite(p.netVy)?p.netVy:0,HEX_GARBAGE_FLIGHT_V0+GRAV*flightAge);
    }
};

window.__mountHexdrop = function () { ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App)); };
