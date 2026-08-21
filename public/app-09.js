function visualSubstepCount(g){
    // Scheduled pile/garbage motion is analytic absolute-time motion and needs no
    // numerical substepping. Legacy contact paths retain four substeps for the
    // collision clamp. The previous unconditional 16x loop was the dominant
    // cost during mass collapses (up to 3840 full visual scans/sec for two boards).
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const c=valid(x,y)?g.board[y][x]:null;
        if(!c||!Array.isArray(c.fallPath)||!c.fallPath.length)continue;
        const seg=c.fallPath[0];
        if(!seg?.pileFlow)return LEGACY_VISUAL_SUBSTEPS;
    }
    return 1;
}
function stepEngine(g, dt) {
    var _a, _b;
    g.stateT += dt;
    g.fx.shake = 0;
    g.fx.warn = pendingIncomingCount(g) > 0 ? Math.min(1, g.fx.warn + dt * 4) : Math.max(0, g.fx.warn - dt * 4);
    g.fx.fastPulse = Math.max(0, (g.fx.fastPulse || 0) - dt * 7);
    g.fx.toasts = g.fx.toasts.filter((t) => (t.life -= dt) > 0);
    g.fx.rings = g.fx.rings.filter((r) => (r.life -= dt) > 0);
    g.fx.formations = (g.fx.formations || []).filter((f) => (f.life -= dt) > 0);
    g.fx.incomingPreviews = (g.fx.incomingPreviews || []).filter((f) => (f.life -= dt) > 0);
    g.fx.hardDrops = (g.fx.hardDrops || []).filter((f) => (f.life -= dt) > 0);
    g.fx.sparks = g.fx.sparks.filter((s) => { s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 12 * dt; return s.life > 0; });
    // Visual integration is adaptive. Scheduled pile flow is evaluated from its
    // absolute clock in one pass; only legacy collision-gated paths use a few
    // substeps. Logical physics time and final cells are unchanged.
    const visualSteps=visualSubstepCount(g);
    const visualDt=dt/visualSteps;
    for (let _vs=0; _vs<visualSteps; _vs++) updateVisuals(g,visualDt);
    resolveVisualContacts(g);
    // スコアは滑らかに追いつかせる
    g.scoreDisp += (g.stats.score - g.scoreDisp) * Math.min(1, 6 * dt);
    if (g.stats.score - g.scoreDisp < 1)
        g.scoreDisp = g.stats.score;
    // Once either player loses, the surviving board is held exactly as it was
    // in the capture while the defeated board performs its grayscale sink.
    // Advancing the winner here used to spawn/drop another set during the
    // 4.25-second result lead-in.
    if (g.matchFrozen)
        return;
    if (g.state === "GAMEOVER") {
        // 終了後は物理・描画位置を動かさず、負けた瞬間の盤面を保持する。
        g.fx.sink = 0;
        return;
    }
    if (g.state === "READY") {
        // In a local CPU match both engines advance through READY, but the
        // reference has one centred intro cue, not a quieter duplicate from
        // the opponent simulation.
        if(g.introCue===0&&g.stateT>=READY_RULE_BEGIN){if(!g.ai)emit(g,{t:"ready"});g.introCue=1;}
        if(g.introCue===1&&g.stateT>=READY_START_BEGIN){if(!g.ai)emit(g,{t:"start"});g.introCue=2;}
        if (g.stateT >= READY_DURATION) spawn(g);
        return;
    }
    if (g.state === "RESOLVING") {
        if (g.phase === "SETTLE") {
            enforceParityPhysicsMode(g);

            // Never advance logical physics while the previous motion batch is
            // still being shown. This prevents future logical positions from
            // becoming obstacles to current animation.
            const pending=pendingFallPathCount(g);
            if(pending>0 || !nearlySettled(g,SETTLE_TOL)){
                g.stateT=0;
                return;
            }

            releaseSettledConstraints(g,"SETTLE_INCREMENTAL");

            if(hasLegalGravityMove(g.board)){
                const moved=settlePass(g.board);
                physicsSafetyCheck(g,moved,"SETTLE_INCREMENTAL");
                if(moved){
                    g.balanceWait=0;
                    g.ver++;
                    g.stateT=0;
                    return;
                }
            }

            if(boardHasIllegalFloat(g.board)){
                // If every canonical move has already failed the exact target
                // and sweep checks, the remaining contact network is a true
                // collision-balanced arch. Confirm it for a short fixed window
                // instead of looping SETTLE forever when a gap is present.
                g.balanceWait=(g.balanceWait||0)+dt;
                if(g.balanceWait<.12){g.stateT=0;return;}
                markCollisionBalancedGaps(g.board);

                /*
                 * This exact logical board has now completed the
                 * collision-balance confirmation window with no
                 * legal gravity event.
                 *
                 * CHECK must not immediately reject the exact same
                 * board again as illegalFloat, otherwise:
                 *
                 * SETTLE -> confirm -> CHECK -> SETTLE
                 *
                 * loops forever.
                 */
                if(!hasLegalGravityMove(g.board)){
                    g.__sixBallConfirmedEquilibriumSig =
                        physicsSignature(g);
                }
            }

            g.balanceWait=0;
            normalizeAllNonActivePileBalls(g);
            g._pileFlowBallById=null;
            g.phase="CHECK";
            g.stateT=0;
            return;
        }
        if (g.phase === "CHECK") {
            /*
             * A board that SETTLE has already confirmed as a
             * no-event collision equilibrium is quiescent as long
             * as its logical board signature has not changed.
             *
             * This is NOT a shape exception.
             * Any later placement / clear / garbage / collapse
             * changes physicsSignature(), automatically invalidating
             * this checkpoint.
             */
            const checkSig = physicsSignature(g);
            const legalNow = hasLegalGravityMove(g.board);

            const confirmedEquilibrium =
                !legalNow &&
                !!g.__sixBallConfirmedEquilibriumSig &&
                g.__sixBallConfirmedEquilibriumSig === checkSig;

            if (
                legalNow ||
                (
                    !confirmedEquilibrium &&
                    boardHasIllegalFloat(g.board)
                )
            ) {
                g.phase = "SETTLE";
                g.stateT = 0;
                return;
            }
            const groups = findGroups(g.board);
            if (!groups.length) {
                if (!g.garbDone && (g.incomingShapes.length > 0 || g.incoming > 0)) {
                    // 技由来は形状キューを優先。旧通信互換の数値おじゃまは従来方式で処理。
                    g.garbShapes = g.incomingShapes.splice(0, 8);
                    if (!g.garbShapes.length && g.incoming > 0) {
                        g.garbLeft = Math.min(g.incoming, 40);
                        g.incoming -= g.garbLeft;
                    }
                    g.garbDone = true;
                    g.garbBlocked = false;
                    g.garbageBatchPrepared = false;
                    g.garbageSeq = 0;
                    emit(g, { t: "garbage" });
                    g.phase = "GARBAGE";
                    g.stateT = 0;
                    return;
                }
                // The limit is evaluated only at the quiescent checkpoint:
                // all falling paths, garbage and chain clears have finished.
                refreshBoardScanMin(g.board);
                const overflow=boardOverflowCells(g.board);
                if(overflow.length){die(g,overflow,"LIMIT");return;}
                spawn(g);
                return;
            }
            g.chain++;
            g.stats.maxChain = Math.max(g.stats.maxChain, g.chain);
            const kill = new Set(), killColors = new Set(), waza = [],wazaFx=[];
            for (const grp of groups) {
                const w = classify(grp.cells);
                if (w) {
                    waza.push(w);
                    wazaFx.push({w,cells:grp.cells.map(c=>[...c]),color:grp.color});
                    killColors.add(grp.color);
                }
                for (const [x, y] of grp.cells)
                    kill.add(x + "," + y);
            }
            if (killColors.size)
                for (let y = BOARD_MIN_ROW; y < ROWS; y++)
                    for (let x = 0; x < W2; x++)
                        if (valid(x, y) && g.board[y][x] && killColors.has(g.board[y][x].c))
                            kill.add(x + "," + y);
            const ids = new Set(), cells = [];
            for (const k of kill) {
                const [x, y] = k.split(",").map(Number);
                const cell = g.board[y][x];
                if (cell) {
                    ids.add(cell.id);
                    cells.push([x, y, cell.c, cell.id]);
                }
            }
            g.clearing = { ids, cells, waza, committed: false, ghosts: [] };
            // Accumulated pile is always independent single-ball physics.
            normalizeAllNonActivePileBalls(g);
            releaseSettledConstraints(g, "CLEAR_ARM");
            g.holdT = waza.length ? Math.max(...waza.map((w) => WAZA[w].hold)) : 0.4;
            g.phase = "CLEAR";
            g.stateT = 0;
            g.fx.shake = 0;
            emit(g, { t: "clear", chain: g.chain });
            if (g.chain >= 2)
                g.fx.toasts.push({ text: `${g.chain} CHAIN`, life: 0.9, max: 0.9, big: Math.min(1, g.chain / 6), tint: "#8CE9FF" });
            for (const w of waza) {
                g.stats.waza[w] = (g.stats.waza[w] || 0) + 1;
                emit(g, { t: "waza", w });
                g.fx.toasts.push({ text: WAZA[w].jp+"!", life: 1.25, max: 1.25, big: 0.45, waza:true, tint: WAZA[w].tint });
            }
            for(const wf of wazaFx){
                const rows=new Map();for(const[,y]of wf.cells)rows.set(y,(rows.get(y)||0)+1);
                const ys=[...rows.keys()].sort((a,b)=>a-b),pointDown=wf.w==="PYRAMID"&&rows.get(ys[0])>rows.get(ys[ys.length-1]);
                const max=WAZA[wf.w].fx;
                const tint=COLORS[wf.color]?.glow||WAZA[wf.w].tint;
                g.fx.formations.push({w:wf.w,cells:wf.cells,tint,life:max,max,pointDown});
            }
            return;
        }
        if (g.phase === "CLEAR") {
            if (!g.clearing) { g.phase = "SETTLE"; g.stateT = 0; return; }

            // 本家寄せ:
            // 消去演出が完全終了するまで「透明になりつつある球」を支持物として残さない。
            // 描画上フェードへ入る瞬間に論理セルを消し、その同じフレームから上の球を重力へ解放。
            const releaseAt = g.holdT * CLEAR_SUPPORT_RELEASE_RATIO;
            if (!g.clearing.committed && g.stateT >= releaseAt) {
                let send = 0;
                const attackShapes = [];
                for (const w of g.clearing.waza) {
                    send += WAZA[w].garbage;
                    const packs = WAZA[w]?.packs ?? 4;
                    for (let i = 0; i < packs; i++) attackShapes.push(w);
                }
                if (g.offset && send > 0 && g.incoming > 0) {
                    const c = Math.min(send, g.incoming);
                    g.incoming -= c;
                    send -= c;
                }
                if (send > 0) {
                    g.sendBuffer += send;
                    g.sendShapes.push(...attackShapes);
                }

                const nCells = g.clearing.cells.length;
                const gained = nCells * 10 * g.chain + g.clearing.waza.reduce((a, w) => a + WAZA[w].garbage * 30, 0);
                g.stats.score += gained;

                // 消去球はghostとして残し、支持判定からだけ外す。
                // これにより上の球は即落下でき、消去演出自体は最後まで自然にフェードする。
                g.clearing.ghosts = g.clearing.cells.map(([x,y,c,id]) => ({x,y,c,id}));
                clearBoardEquilibriumLocks(g.board);g.balanceWait=0;
                for (const [x, y, c] of g.clearing.cells) {
                    g.board[y][x] = null;
                    g.stats.cleared++;
                    for (let i = 0; i < 7; i++) {
                        const a = g.fxRng() * TAU, sp = 1.5 + g.fxRng() * 4;
                        g.fx.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, life: 0.3 + g.fxRng() * 0.25, max: 0.55, c });
                    }
                }
                g.clearing.committed = true;

                releaseSettledConstraints(g, "CLEAR_SUPPORT_RELEASE");

                // Reference-style accumulated-pile collapse:
                // compile the entire legal contact trajectory now, then let
                // each ball play it continuously with its own momentum.
                const clearFlow=prepareContinuousPileFlow(
                    g,"clear_support_loss"
                );
                physicsSafetyCheck(
                    g,clearFlow.moved,"POST_CLEAR_CONTINUOUS_FLOW"
                );
                // stateTはリセットしない。消去FXと崩落を同時進行させる。
            }

            if (g.stateT >= g.holdT) {
                g.clearing = null;
                g.phase = "SETTLE";
                g.stateT = 0;
            }
            return;
        }
        if (g.phase === "GARBAGE") {
            // 通常ピースはこのフェーズ中スポーンしない。
            if (!g.garbageBatchPrepared) {
                prepareGarbageBatch(g);
                g.stateT=0;
                return;
            }
            updateGarbagePacks(g,dt);
            if (garbageBatchDone(g)) {
                finishGarbageVisuals(g);
                g.garbShapes=[];
                g.garbLeft=0;
                g.garbagePlans=[];
                g.activeGarbagePacks=[];
                g.garbageBatchPrepared=false;
                g.phase="CHECK";
                g.stateT=0;
                return;
            }
            // 最終保険。パックが何らかの理由で進めない時だけ現在盤面へ合法に再計画し、停止を避ける。
            if (g.stateT >= Math.max(GARBAGE_VISUAL_MAX, g.garbageWatchdogLimit || 0)) {
                // 最終保険でも未開始の形状セットを一括実体化しない。
                // 既に0.5秒間隔で開始済みなのに接触確定だけが詰まったセットを、1セットだけ救済する。
                const stuckPlan=g.garbagePlans.find(p=>!p.landed && p._started);
                if (stuckPlan) {
                    if(materializeGarbagePack(g,stuckPlan)||g.garbBlocked)stuckPlan.landed=true;
                }
                if (g.garbLeft>0 && g.garbageClock + 1e-9 >= g.garbageNextBallAt) {
                    // 旧数値互換おじゃまの救済も1回につき1球だけ投入する。
                    const placed=garbageBall(g);
                    if (placed>0) {
                        g.garbLeft-=1;
                        g.garbageNextBallAt=g.garbageClock+HEX_GARBAGE_SHAPE_INTERVAL;
                        settlePass(g.board);
                    }
                }
                if (garbageVisualsDone(g)) {
                    g.garbShapes=[]; g.garbLeft=0; g.garbagePlans=[]; g.activeGarbagePacks=[];
                    g.garbageBatchPrepared=false; g.phase="CHECK"; g.stateT=0;
                }
            }
            return;
        }
    }
    if (g.state === "PLAYING" && g.piece) {
        if (g.ai) {
            stepAI(g, dt);
            // AI may hard-drop/lock the piece inside stepAI. Never continue this frame
            // with a stale null piece; this was the CPU-freeze/crash path.
            if (g.state !== "PLAYING" || !g.piece) return;
        }
        // 高速落下は「通常落下時計 dropT の進み」だけを速くする。
        // interval自体は常に同じなので、ON/OFF時に落下進捗率が再解釈されず、
        // 球が沈む/浮く/上へ戻る現象を構造的に防ぐ。
        const iv = g.dropInterval;
        const dropTimeScale = g.fastForward ? FAST_DROP_MULTIPLIER : 1;
        g.dropT += dt * dropTimeScale;
        while (g.dropT >= iv && pieceFits(g.board, { ...g.piece, y: g.piece.y + 2 })) {
            g.dropT -= iv;
            g.piece = { ...g.piece, y: g.piece.y + 2 };
            g.lockT = 0;
        }
        if (!pieceFits(g.board, { ...g.piece, y: g.piece.y + 2 })) {
            const dx=(Number.isFinite(g.pieceVX)?g.pieceVX:g.piece.x)-g.piece.x;
            const contactFrac=safeActiveFallOffset(g,pieceCells(g.piece),dx,dispOff(g.piece.rot),2);
            const contactClock=iv*Math.max(0,Math.min(2,contactFrac))/2;
            // Continue through the open fraction, then hold exactly at first
            // contact for the short alignment window seen in the capture.
            if(g.dropT+1e-10>=contactClock){
                g.dropT=contactClock;
                g.rigidSlideDir = 0;
                g.rigidSlideSteps = 0;
                g.lockT += dt;
                if (g.lockT >= CONTACT_LOCK_DELAY)lock(g, 3);
            }else g.lockT=0;
        } else {
            g.lockT = 0;
            g.rigidSlideDir = 0;
            g.rigidSlideSteps = 0;
        }
    }
}
/* =============================================================
 * AI
 * ============================================================= */
const AI_PARAMS = {
    1: { think: 0.95, act: 0.3, random: 0.75, depth: 0, name: "とてもよわい" },
    2: { think: 0.7, act: 0.22, random: 0.4, depth: 0, name: "よわい" },
    3: { think: 0.5, act: 0.16, random: 0.15, depth: 0, name: "ふつう" },
    4: { think: 0.32, act: 0.11, random: 0.04, depth: 1, name: "つよい" },
    5: { think: 0.18, act: 0.08, random: 0, depth: 1, name: "とてもつよい" },
};

const toColors = (b) => cloneHexGrid(b,v=>getC(v));
function heightOf(b) {
    for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < W2; x++)
            if (valid(x, y) && b[y][x] !== null)
                return ROWS - y;
    return 0;
}
function evalBoard(b, res, level, rnd = Math.random) {
    let s = res.garbage * 280 + res.chain * 40;
    const h = heightOf(b);
    s -= h * h * 2.6;
    if (h > ROWS - 3)
        s -= 1200;
    if (level <= 2)
        return s + rnd() * 30;
    let pair = 0;
    for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < W2; x++) {
            if (!valid(x, y) || b[y][x] === null)
                continue;
            const c = b[y][x];
            for (const [dx, dy] of [[2, 0], [1, 1], [-1, 1]])
                if (valid(x + dx, y + dy) && b[y + dy][x + dx] === c)
                    pair++;
        }
    const seen = Array.from({ length: ROWS }, () => Array(W2).fill(false));
    let near = 0;
    for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < W2; x++) {
            if (!valid(x, y) || b[y][x] === null || seen[y][x])
                continue;
            const c = b[y][x];
            const st = [[x, y]];
            let n = 0;
            seen[y][x] = true;
            while (st.length) {
                const [cx, cy] = st.pop();
                n++;
                for (const [dx, dy] of DIRS) {
                    const nx = cx + dx, ny = cy + dy;
                    if (ny>=0&&valid(nx, ny) && !seen[ny][nx] && b[ny][nx] === c) {
                        seen[ny][nx] = true;
                        st.push([nx, ny]);
                    }
                }
            }
            if (n === 5)
                near++;
        }
    return s + pair * 9 + near * 60;
}
function enumerateMoves(board, colors) {
    const out = [];
    for (let rot = 0; rot < 6; rot++)
        for (let x = 0; x < W2; x++) {
            const p0 = { x, y: -2, rot, colors };
            if (!pieceFits(board, p0))
                continue;
            out.push(dropPiece(board, p0));
        }
    return out;
}
function simulate(cb, p) {
    const b = cloneHexGrid(cb,v=>v);
    for (const [x, y, c] of pieceCells(p)) {
        if (y < 0)
            return null;
        b[y][x] = c;
    }
    return { b, res: resolveInstant(b) };
}
function bestMove(board, colors, next, level, rnd = Math.random) {
    const P = AI_PARAMS[level];
    const moves = enumerateMoves(board, colors);
    if (!moves.length)
        return null;
    if (rnd() < P.random)
        return moves[Math.floor(rnd() * moves.length)];
    const cb = toColors(board);
    const scored = [];
    for (const m of moves) {
        const sim = simulate(cb, m);
        if (sim)
            scored.push({ m, s: evalBoard(sim.b, sim.res, level, rnd), b: sim.b });
    }
    if (!scored.length)
        return moves[0];
    scored.sort((a, z) => z.s - a.s);
    if (P.depth >= 1 && next) {
        const top = scored.slice(0, 8);
        for (const c of top) {
            let best = -1e9;
            for (const mm of enumerateMoves(c.b, next)) {
                const s2 = simulate(c.b, mm);
                if (s2)
                    best = Math.max(best, evalBoard(s2.b, s2.res, level));
            }
            c.s = c.s * 0.55 + best * 0.45;
        }
        top.sort((a, z) => z.s - a.s);
        return top[0].m;
    }
    return scored[0].m;
}
function stepAI(g, dt) {
    const ai = g.ai, P = AI_PARAMS[ai.level];
    if (!g.piece || g.state !== "PLAYING") return;
    if (ai.thinkT > 0) {
        ai.thinkT -= dt;
        return;
    }
    if (!ai.target) {
        ai.target = bestMove(g.board, g.piece.colors, g.queue[0], ai.level, g.aiRng);
        ai.stuck = 0;
        if (!ai.target) {
            hardDrop(g);
            return;
        }
    }
    ai.actT -= dt;
    if (ai.actT > 0) return;
    ai.actT = P.act;
    const t = ai.target;
    if (g.piece.rot !== t.rot) {
        const cw = (t.rot - g.piece.rot + 6) % 6;
        if (!rotate(g, cw <= 3 ? 1 : -1)) {
            // The board/piece height changed after planning and this rotation is no longer legal.
            // Replan instead of retrying forever.
            ai.target = null; ai.stuck = (ai.stuck || 0) + 1; ai.thinkT = Math.min(0.08, P.think * 0.2);
        } else ai.stuck = 0;
        return;
    }
    if (g.piece.x !== t.x) {
        if (!move(g, g.piece.x < t.x ? 1 : -1)) {
            // Same protection for an unreachable horizontal target.
            ai.target = null; ai.stuck = (ai.stuck || 0) + 1; ai.thinkT = Math.min(0.08, P.think * 0.2);
        } else ai.stuck = 0;
        return;
    }
    ai.stuck = 0;
    hardDrop(g);
}
/* =============================================================
 * 描画
 * ============================================================= */
const VW = 1280, VH = 720;
// Measurements from the 1920x1080 reference footage, normalized to 1280x720.
// Both players use the same floor-wide 10/9 alternating playfield and scale.
const ME = { D: 63.4 / 1.5, X: 165, Y: 166 };
const FOE = { D: 63.4 / 1.5, X: 671, Y: 166 };
ME.BW = 444;
ME.BH = ME.D * BOARD_FLOOR_N;
FOE.BW = 444;
FOE.BH = FOE.D * BOARD_FLOOR_N;
const DROP_ZONE_Y = 648;
const NEON = ["#2FE3F5", "#FF3EA5"];
const STARS = (() => {
    const r = mulberry32(7);
    return Array.from({ length: 260 }, () => ({ x: r() * VW, y: r() * VH, s: 0.4 + r() * 1.5, a: 0.25 + r() * 0.6, p: r() * 6.28 }));
})();
/* =============================================================
 * ボールの描画
 *   透明感のあるガラス玉。内部にマーブル模様とモチーフを持つ。
 *   毎フレーム勾配を作ると重いので、色ごとに 1 枚だけ高解像度の
 *   スプライトを作り、以降は drawImage で拡縮して使う。
 * ============================================================= */
