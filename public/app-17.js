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
    return React.createElement(HexMenuShell, { title: "ルームを作成", back: onCancel, wide: false },
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
    return React.createElement(HexMenuShell, { title: "ルームに参加", back: onCancel, wide: false },
        React.createElement(HexPanel, { accent: "violet", className: "p-6 text-center" },
            React.createElement("div", { className: "text-[11px] font-black tracking-[.2em] text-white/65 mb-2" }, "ROOM CODE ", code.slice(0, 3), " ", code.slice(3)),
            React.createElement(RoomSpinner, { label: "ホストと接続しています…" }),
            React.createElement("button", { onClick: onCancel, className: "mt-4 rounded-xl px-5 py-2.5 text-xs font-black text-white/75", style: { border: "1px solid rgba(255,255,255,.16)", background: "rgba(255,255,255,.04)" } }, "キャンセル")));
}

// ---------------------------------------------------------------------------
// Tutorial (HOME → チュートリアル). Step-by-step rules and controls, shown
// outside the match so nothing covers the boards during play.
const HEX_TUTORIAL_DONE_KEY = "hexdrop_tutorial_done";
const HEX_BALL_SRC = ["/assets/ball-red.png", "/assets/ball-blue.png", "/assets/ball-green.png", "/assets/ball-yellow.png", "/assets/ball-purple.png"];
// Balls on the game's lattice: x in half-ball steps, y in rows (row pitch = √3/2 · d).
function TutBalls({ cells, d = 34, label }) {
    const maxX = Math.max(...cells.map(c => c[0])), maxY = Math.max(...cells.map(c => c[1]));
    return React.createElement("div", { role: "img", "aria-label": label || "", className: "relative shrink-0", style: { width: maxX * d / 2 + d, height: maxY * d * 0.866 + d } },
        cells.map(([x, y, ci, dim], i) => React.createElement("img", { key: i, src: HEX_BALL_SRC[ci], alt: "", draggable: false, style: { position: "absolute", left: x * d / 2, top: y * d * 0.866, width: d, height: d, opacity: dim ? 0.28 : 1, filter: dim ? "grayscale(.6)" : "drop-shadow(0 0 6px rgba(255,255,255,.25))" } })));
}
const shapeCells = (pts, ci) => pts.map(([x, y]) => [x, y, ci]);
function hexTutorialSteps() {
    const kind = hexInputKind();
    const kindName = kind === "touch" ? "タッチ" : kind === "pad" ? "コントローラー" : "キーボード";
    return [
        { title: "6ballへようこそ", art: React.createElement(TutBalls, { cells: [[1, 0, 0], [0, 1, 3], [2, 1, 1]], d: 54, label: "3個1組の三角ピース" }),
          body: ["上から落ちてくる、3個1組の三角ピースを積んでいきます。", "同じ色の球をつなげて消し、技で相手を攻撃します。", "球が盤面からあふれた方の負けです。"] },
        { title: `操作（${kindName}）`, art: null, rows: HEX_CONTROL_GUIDES[kind],
          body: ["ほかの入力方法の操作は、ホームの「遊び方」で確認できます。"] },
        { title: "6個つなげて消す", art: React.createElement(TutBalls, { cells: [[2, 0, 3, 1], [4, 0, 2, 1], [1, 1, 0], [3, 1, 0], [5, 1, 0], [0, 2, 0], [2, 2, 0], [4, 2, 0], [6, 2, 1, 1]], label: "つながった6個の赤い球" }),
          body: ["同じ色の球が6個以上つながると消えます。", "となり合っていればつながりです（ななめも含みます）。", "消えた後に落ちた球がまたつながると連鎖になります。"] },
        { title: "技を作る", art: React.createElement("div", { className: "flex flex-wrap items-end justify-center gap-5" },
            [["ストレート", "19個", shapeCells([[0, 0], [2, 0], [4, 0], [6, 0], [8, 0], [10, 0]], 3)],
             ["ピラミッド", "24個", shapeCells(GARBAGE_SHAPES.PYRAMID, 2)],
             ["ヘキサゴン", "36個", shapeCells(GARBAGE_SHAPES.HEXAGON, 1)]].map(([name, n, cells]) =>
                React.createElement("div", { key: name, className: "flex flex-col items-center gap-1.5" }, React.createElement(TutBalls, { cells, d: 24, label: name }),
                    React.createElement("div", { className: "text-[12px] font-black text-white" }, name), React.createElement("div", { className: "text-[11px] text-white/65" }, "おじゃま ", n)))),
          body: ["つなげた6個が一直線・三角形・六角形になると「技」です。", "技を作ると、その色の球が盤面からすべて消えます。", "相手におじゃま球を送れるのは技だけです。"] },
        { title: "おじゃま球に注意", art: React.createElement("div", { className: "px-5 py-2 text-center", style: { background: "rgba(60,6,20,.82)", border: "2px solid #FF5A72" } },
            React.createElement("div", { className: "text-[13px] font-black", style: { color: "rgba(255,220,228,.95)" } }, "おじゃま"), React.createElement("div", { className: "text-[22px] font-black", style: { color: "#FF8A9C" } }, "×24")),
          body: ["攻撃を受けると盤面の上が赤く光り、届く数が「つぎ」の下の「おじゃま」に出ます。", "少し後に、おじゃま球が上から降ってきます。", "先に技を決めて、相手の盤面をあふれさせましょう。"] },
        { title: "準備完了！", art: React.createElement(TutBalls, { cells: shapeCells(GARBAGE_SHAPES.HEXAGON, 4), d: 40, label: "ヘキサゴン" }), final: true,
          body: ["次は実際に動かして覚えましょう。5つの短いレッスンがあります。", "対戦中は画面中央上のボタンでポーズできます" + (kind === "keys" ? "（Esc / P キーでも可）。" : kind === "pad" ? "（＋ボタンでも可）。" : "。")] }
    ];
}
function HexTutorial({ onExit, onPractice, onVsAi, onShowHelp }) {
    const steps = useRef(hexTutorialSteps()).current;
    const [i, setI] = useState(0);
    const step = steps[i], last = i === steps.length - 1;
    useEffect(() => { if (last) { try { localStorage.setItem(HEX_TUTORIAL_DONE_KEY, "1"); } catch (_) {} } }, [last]);
    useEffect(() => {
        const key = (e) => { if (e.key === "ArrowRight") { e.preventDefault(); setI(v => Math.min(steps.length - 1, v + 1)); } else if (e.key === "ArrowLeft") { e.preventDefault(); setI(v => Math.max(0, v - 1)); } else if (e.key === "Escape") { e.preventDefault(); onExit(); } };
        window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
    }, []);
    const navBtn = { minHeight: 44 };
    return React.createElement(HexMenuShell, { title: "チュートリアル", back: onExit, wide: true },
        React.createElement(HexPanel, { accent: "gold", className: "p-4 sm:p-5" },
            React.createElement("div", { className: "flex items-center gap-5 flex-wrap justify-center", style: { minHeight: 150 }, "aria-live": "polite" },
                step.art && React.createElement("div", { className: "flex justify-center shrink-0", style: { minWidth: 150 } }, step.art),
                React.createElement("div", { className: "flex-1 min-w-[240px]" },
                    React.createElement("div", { className: "text-lg font-black text-white mb-2" }, step.title),
                    step.rows && React.createElement("dl", { className: "grid gap-1.5 mb-2" }, step.rows.map(([k, v]) => React.createElement("div", { key: k, className: "flex gap-3 text-[13px] leading-relaxed" }, React.createElement("dt", { className: "shrink-0 font-black text-cyan-100", style: { width: "8em" } }, k), React.createElement("dd", { className: "flex-1 min-w-0 text-white/85" }, v)))),
                    step.body.map((t, k) => React.createElement("p", { key: k, className: "text-[13px] leading-relaxed text-white/85" }, t)),
                    step.final && React.createElement("div", { className: "mt-3 flex flex-wrap gap-2" },
                        React.createElement("button", { onClick: onPractice, className: "rounded-xl px-5 text-sm font-black text-[#061016]", style: { ...navBtn, background: "#FFD36A" } }, "プレイで練習する"),
                        React.createElement("button", { onClick: onVsAi, className: "rounded-xl px-4 text-sm font-black text-white/85 border border-white/20 bg-white/5", style: navBtn }, "AIと対戦する"),
                        React.createElement("button", { onClick: onShowHelp, className: "rounded-xl px-4 text-sm font-black text-white/85 border border-white/20 bg-white/5", style: navBtn }, "操作一覧を見る"))))),
        React.createElement("div", { className: "mt-3 flex items-center justify-between gap-3" },
            React.createElement("button", { onClick: () => setI(v => Math.max(0, v - 1)), disabled: i === 0, className: "rounded-xl px-5 text-sm font-black text-white/85 border border-white/20 bg-white/5 disabled:opacity-30", style: navBtn }, "前へ"),
            React.createElement("div", { className: "flex gap-1.5", "aria-hidden": "true" }, steps.map((_, k) => React.createElement("span", { key: k, className: "block rounded-full", style: { width: k === i ? 18 : 7, height: 7, background: k === i ? "#FFD36A" : "rgba(255,255,255,.3)", transition: "width .2s ease" } }))),
            last ? React.createElement("button", { onClick: onExit, className: "rounded-xl px-5 text-sm font-black text-white/85 border border-white/20 bg-white/5", style: navBtn }, "ホームへ")
                : React.createElement("button", { onClick: () => setI(v => Math.min(steps.length - 1, v + 1)), className: "rounded-xl px-5 text-sm font-black text-[#061016]", style: { ...navBtn, background: "#FFD36A" } }, "次へ")));
}

// ---------------------------------------------------------------------------
// Playable tutorial lessons. Each lesson prepares the player's real engine
// (pre-placed balls, scripted piece colours), tracks engine events, and
// reports "success" or "retry". The instruction panel sits over the empty
// opponent board, so nothing covers the player's own board.
const HEX_RED = 0;
function hexTutPut(g, x, y, c) { const b = mkBall(g, c); g.board[y][x] = b; setVis(g, b, x, y, 0); }
const HEX_TUTORIAL_LESSONS = [
    { title: "動かして落とす", queue: [[1, 2, 3], [3, 4, 1], [2, 1, 4]],
      text: { keys: "← → でピースを左右に動かして、Space（または ↑）で落とそう。", touch: "画面を左右にスワイプしてピースを動かし、2本指タップで落とそう。", pad: "十字キーでピースを左右に動かして、Y（または ↑）で落とそう。" },
      checks: [["moved", "ピースを動かす"], ["landed", "ピースを落とす"]],
      goal: t => t.moved && t.landedAfterMove ? "success" : null },
    { title: "回して落とす", queue: [[4, 1, 2], [2, 3, 4], [1, 4, 3]],
      text: { keys: "Z（左回り）/ X（右回り）でピースを回して、落とそう。", touch: "盤面をタップしてピースを回そう（盤面の左側＝左回り、右側＝右回り）。回したら落とそう。", pad: "A（左回り）/ X（右回り）でピースを回して、落とそう。" },
      checks: [["rotated", "ピースを回す"], ["landedAfterRotate", "ピースを落とす"]],
      goal: t => t.rotated && t.landedAfterRotate ? "success" : null },
    { title: "6個つなげて消す", queue: [[HEX_RED, HEX_RED, HEX_RED]],
      setup: g => { for (const x of [14, 16, 18]) hexTutPut(g, x, 11, HEX_RED); },
      text: { all: "赤いピースを、右下の赤い球のとなりに落とそう。同じ色が6個以上つながると消えます。（ヒント：右に1〜2マス動かす）" },
      checks: [["cleared", "赤を6個以上つなげて消す"]],
      goal: t => t.cleared ? "success" : t.landed >= 3 ? "retry:ピースが赤い球に届きませんでした。もう一度やってみよう。" : null },
    { title: "技を作る", queue: [[HEX_RED, HEX_RED, HEX_RED]],
      setup: g => { for (const x of [12, 14, 16]) hexTutPut(g, x, 11, HEX_RED); },
      text: { all: "赤い3つの上にピースをぴったり乗せて、6個で三角形（ピラミッド）を作ろう。形が合うと「技」になります。（ヒント：右に2マス動かして落とす）" },
      checks: [["waza", "ピラミッドを作る"]],
      goal: t => t.waza ? "success" : t.cleared ? "retry:おしい！三角形にならずに消えました。もう一度。" : t.landed >= 2 ? "retry:もう一度やってみよう。" : null },
    { title: "おじゃま球", queue: [[1, 2, 3], [4, 1, 2], [3, 4, 1]],
      setup: g => { g.incoming = 10; },
      text: { all: "相手から攻撃が来ました！盤面の上が赤く光り、左の「おじゃま」に届く数が出ています。ピースを1つ落とすと、おじゃま球が降ってきます。" },
      checks: [["landed", "ピースを落とす"], ["garbageDone", "おじゃま球が降り終わる"]],
      goal: t => t.garbageDone ? "success" : null }
];
function hexTutorialTracker() { return { moved: false, landed: 0, landedAfterMove: false, rotated: false, landedAfterRotate: false, cleared: false, waza: false, garbage: false, garbageDone: false }; }
// Prepare a fresh engine for lesson i; the piece spawns immediately (no intro).
function hexTutorialSetupEngine(g, i) {
    const L = HEX_TUTORIAL_LESSONS[i];
    if (L.setup) L.setup(g);
    g.queue = [0, 1, 2].map(k => L.queue[k % L.queue.length].slice());
    g.introCue = 2; spawn(g);
}
// Called every frame with the engine's pending events (before they are drained).
function hexTutorialObserve(g, i, t) {
    const L = HEX_TUTORIAL_LESSONS[i];
    g.queue = [0, 1, 2].map(k => L.queue[k % L.queue.length].slice());
    if (g.piece && Math.abs((Number.isFinite(g.pieceVX) ? g.pieceVX : g.piece.x) - SPAWN_X) >= 1.5) t.moved = true;
    for (const e of g.events) {
        if (e.t === "move") t.moved = true;
        else if (e.t === "rotate") t.rotated = true;
        else if (e.t === "land") { t.landed++; if (t.moved) t.landedAfterMove = true; if (t.rotated) t.landedAfterRotate = true; }
        else if (e.t === "clear") t.cleared = true;
        else if (e.t === "waza") t.waza = true;
        else if (e.t === "garbage") t.garbage = true;
    }
    if (t.garbage && g.state === "PLAYING" && pendingIncomingCount(g) === 0) t.garbageDone = true;
    return L.goal(t);
}
// Instruction panel over the opponent board (x 671..1115, y 160..610 of 1280x720).
function HexTutorialPanel({ lesson, tracker, status, message, onNext, onRetry, onExit, onVsAi }) {
    const L = HEX_TUTORIAL_LESSONS[lesson], kind = hexInputKind(), last = lesson === HEX_TUTORIAL_LESSONS.length - 1;
    const text = L.text[kind] || L.text.all;
    const btn = "rounded-xl px-4 text-[13px] font-black";
    return React.createElement("div", { className: "absolute flex flex-col overflow-y-auto", role: "region", "aria-label": "チュートリアルの説明", style: { left: `${671 / 12.8}%`, width: `${444 / 12.8}%`, top: `${160 / 7.2}%`, height: `${450 / 7.2}%`, padding: "clamp(8px,1.4vw,18px)", background: "rgba(8,7,24,.9)", border: "1px solid rgba(255,211,106,.45)", borderRadius: 14 } },
        React.createElement("div", { className: "text-[11px] font-black tracking-[.18em]", style: { color: "#FFD36A" } }, `LESSON ${lesson + 1} / ${HEX_TUTORIAL_LESSONS.length}`),
        React.createElement("div", { className: "text-base font-black text-white mt-0.5" }, L.title),
        React.createElement("p", { className: "mt-1.5 text-[12px] leading-relaxed text-white/85" }, text),
        React.createElement("ul", { className: "mt-2 grid gap-1" }, L.checks.map(([k, label]) => { const done = status === "success" || !!tracker[k]; return React.createElement("li", { key: k, className: "flex items-center gap-2 text-[12px] font-bold", style: { color: done ? "#7DFFB2" : "rgba(255,255,255,.7)" } }, React.createElement("span", { "aria-hidden": "true", className: "inline-flex items-center justify-center rounded-full", style: { width: 16, height: 16, border: `2px solid ${done ? "#7DFFB2" : "rgba(255,255,255,.4)"}`, fontSize: 10 } }, done ? "✓" : ""), label, React.createElement("span", { className: "sr-only" }, done ? "（完了）" : "")); })),
        message && React.createElement("div", { role: "status", className: "mt-2 rounded-lg px-2.5 py-1.5 text-[12px] font-bold", style: { color: status === "success" ? "#061016" : "#ffd2e3", background: status === "success" ? "#7DFFB2" : "rgba(255,62,165,.16)" } }, message),
        React.createElement("div", { className: "mt-auto pt-2 flex flex-wrap gap-2" },
            status === "success" && !last && React.createElement("button", { onClick: onNext, className: btn + " text-[#061016]", style: { minHeight: 40, background: "#FFD36A" } }, "次のレッスンへ"),
            status === "success" && last && React.createElement("button", { onClick: onVsAi, className: btn + " text-[#061016]", style: { minHeight: 40, background: "#FFD36A" } }, "AIと対戦する"),
            status !== "success" && React.createElement("button", { onClick: onRetry, className: btn + " text-white/85 border border-white/20 bg-white/5", style: { minHeight: 40 } }, "やり直す"),
            React.createElement("button", { onClick: onExit, "data-hex-back": "1", className: btn + " text-white/70 border border-white/15", style: { minHeight: 40 } }, last && status === "success" ? "ホームへ" : "やめる")));
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
