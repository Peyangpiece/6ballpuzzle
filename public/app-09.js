function visualSubstepCount(g){
    // Scheduled pile/garbage motion is analytic absolute-time motion and needs no
    // numerical substepping. Legacy contact paths retain four substeps for the
    // collision clamp. The previous unconditional 16x loop was the dominant
    // cost during mass collapses (up to 3840 full visual scans/sec for two boards).
    for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
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
    g.fx.sparks = g.fx.sparks.filter((s) => { s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 12 * dt; return s.life > 0; });
    // Visual integration is adaptive. Scheduled pile flow is evaluated from its
    // absolute clock in one pass; only legacy collision-gated paths use a few
    // substeps. Logical physics time and final cells are unchanged.
    const visualSteps=visualSubstepCount(g);
    const visualDt=dt/visualSteps;
    for (let _vs=0; _vs<visualSteps; _vs++) updateVisuals(g,visualDt);
    // fall-path rendering already follows legal lattice moves; avoid post-step lateral pushback that can deadlock moving packs.
    // preventVisualOverlap(g);
    // スコアは滑らかに追いつかせる
    g.scoreDisp += (g.stats.score - g.scoreDisp) * Math.min(1, 6 * dt);
    if (g.stats.score - g.scoreDisp < 1)
        g.scoreDisp = g.stats.score;
    if (g.state === "GAMEOVER") {
        // 終了後は物理・描画位置を動かさず、負けた瞬間の盤面を保持する。
        g.fx.sink = 0;
        return;
    }
    if (g.state === "READY") {
        if (g.stateT >= GAME_FRAME) spawn(g);
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
                    g.ver++;
                    g.stateT=0;
                    return;
                }
            }

            if(boardHasIllegalFloat(g.board)){
                // Unsupported state must remain in SETTLE; do not spawn/check.
                g.stateT=0;
                return;
            }

            normalizeAllNonActivePileBalls(g);
            g._pileFlowBallById=null;
            g.phase="CHECK";
            g.stateT=0;
            return;
        }
        if (g.phase === "CHECK") {
            // Absolute invariant: no next piece / game-over decision while an unsupported ball is frozen.
            if (boardHasIllegalFloat(g.board) || hasLegalGravityMove(g.board)) {
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
                spawn(g);
                return;
            }
            g.chain++;
            g.stats.maxChain = Math.max(g.stats.maxChain, g.chain);
            const kill = new Set(), killColors = new Set(), waza = [];
            for (const grp of groups) {
                const w = classify(grp.cells);
                if (w) {
                    waza.push(w);
                    killColors.add(grp.color);
                }
                for (const [x, y] of grp.cells)
                    kill.add(x + "," + y);
            }
            if (killColors.size)
                for (let y = 0; y < ROWS; y++)
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
                g.fx.toasts.push({ text: WAZA[w].jp, life: 1.05, max: 1.05, big: w === "HEXAGON" ? 1 : w === "PYRAMID" ? 0.62 : 0.32, tint: WAZA[w].tint });
                g.fx.rings.push({ life: 0.65, max: 0.65, tint: WAZA[w].tint });
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
            if (g.stateT > (g.garbageWatchdogLimit || GARBAGE_VISUAL_MAX)) {
                // Watchdogも1球ずつ投入する。タイマーが詰まった場合だけ、1更新につき1球進める。
                const pendingPlan=g.garbagePlans.find(p=>!p.landed);
                if (pendingPlan) {
                    pendingPlan._started=true;
                    pendingPlan.y=pendingPlan.targetY;
                    if (materializeGarbagePack(g,pendingPlan)) pendingPlan.landed=true;
                    else { pendingPlan.landed=true; g.garbBlocked=true; }
                    g.garbageNextBallAt=g.garbageClock+GARBAGE_PACK_INTERVAL;
                    g.stateT=0;
                    return;
                }
                if (g.garbLeft>0) {
                    const placed=garbageBall(g);
                    if (placed) g.garbLeft-=1;
                    else { g.incoming+=g.garbLeft; g.garbLeft=0; g.garbBlocked=true; }
                    g.garbageNextBallAt=g.garbageClock+GARBAGE_PACK_INTERVAL;
                    g.stateT=0;
                    return;
                }
                finishGarbageVisuals(g);
                g.garbShapes=[];
                g.garbLeft=0;
                g.garbagePlans=[];
                g.activeGarbagePacks=[];
                g.garbageBatchPrepared=false;
                g.phase="CHECK";
                g.stateT=0;
            }
            return;
        }
        return;
    }
    if (g.state === "PLAYING") {
        // hard dropは入力時の fromY から targetY までを映像基準時間で補間してから lock。
        if(g.hardDropAnim){
            g.hardDropAnim.t += dt;
            if(g.hardDropAnim.t >= g.hardDropAnim.dur){
                g.piece={...g.hardDropAnim.target};
                g.pieceVY=g.piece.y;
                g.hardDropAnim=null;
                g.dropT=0;
                lock(g,5);
            }
            return;
        }
        if (g.piece) {
            if (pieceFits(g.board, { ...g.piece, y: g.piece.y + 2 })) {
                g.lockT = 0;
                // 下入力は通常落下3球だけを高速化する。解決中の物理は加速しない。
                // dt remains fixed. Only how quickly the active triplet reaches the next drop step changes.
                g.dropT += dt * (g.fastForward ? FAST_DROP_MULTIPLIER : 1);
                while (g.dropT >= g.dropInterval && pieceFits(g.board, { ...g.piece, y: g.piece.y + 2 })) {
                    g.dropT -= g.dropInterval;
                    g.piece.y += 2;
                }
            }
            else {
                g.dropT = 0;
                g.lockT += dt;
                if (g.lockT >= CONTACT_LOCK_DELAY)
                    lock(g, 3.4);
            }
        }
        return;
    }
}
/* =============================================================
 * AI
 * ============================================================= */
const AI_PARAMS = {
    1: { beam: 1, think: 1.45, slip: 0.32, delay: 0.18 },
    2: { beam: 1, think: 1.00, slip: 0.18, delay: 0.13 },
    3: { beam: 1, think: 0.70, slip: 0.08, delay: 0.10 },
    4: { beam: 2, think: 0.42, slip: 0.02, delay: 0.072 },
    5: { beam: 3, think: 0.24, slip: 0.00, delay: 0.052 },
};
function dangerHeight(b) {
    let top = ROWS;
    for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < W2; x++)
            if (valid(x, y) && b[y][x] !== null)
                top = Math.min(top, y);
    return top === ROWS ? 99 : top;
}
function heuristic(b, rr, incoming, level) {
    let n = 0, sumY = 0, danger = 0, edge = 0;
    for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < W2; x++) {
            if (!valid(x, y) || b[y][x] === null)
                continue;
            n++;
            sumY += y;
            danger += Math.max(0, 4 - y) * 2.5;
            edge += (x < 3 || x > W2 - 4) ? 0.15 : 0;
        }
    const dangerPenalty = level <= 1 ? 4 : level === 2 ? 9 : level === 3 ? 18 : level === 4 ? 24 : 32;
    const attackWeight = level <= 1 ? 2 : level === 2 ? 4 : level === 3 ? 7 : level === 4 ? 9 : 11;
    const chainWeight = level <= 1 ? 18 : level === 2 ? 28 : level === 3 ? 42 : level === 4 ? 55 : 70;
    return rr.garbage * attackWeight + rr.chain * chainWeight + (n ? sumY / n : ROWS) * 1.5 - danger * dangerPenalty - edge - incoming * (level >= 4 ? 1.6 : level === 3 ? 0.9 : 0.35);
}
function allPlacements(g, colors, cap = 999) {
    const arr = [];
    for (let r = 0; r < 6; r++) {
        for (let x = -2; x < W2 + 2; x++) {
            const p0 = { x, y: -2, rot: r, colors };
            if (!pieceFits(g.board, p0))
                continue;
            const p = dropPiece(g.board, p0);
            if (pieceCells(p).some(([, y]) => y < 0))
                continue;
            arr.push(p);
        }
    }
    if (arr.length <= cap)
        return arr;
    const out = [];
    const step = arr.length / cap;
    for (let i = 0; i < cap; i++)
        out.push(arr[Math.floor(i * step)]);
    return out;
}
function bestMove(g, level = 3) {
    level = Math.max(1, Math.min(5, Number(level) || 3));
    const prm = AI_PARAMS[level] || AI_PARAMS[3];
    const ps = allPlacements(g, g.piece.colors, level <= 1 ? 8 : level === 2 ? 14 : level === 3 ? 24 : level === 4 ? 36 : 48);
    if (!ps.length)
        return null;
    let scored = [];
    for (const p of ps) {
        const b = g.board.map((r) => r.map((v) => v ? { ...v } : null));
        let id = 800000;
        for (const [x, y, c] of pieceCells(p))
            b[y][x] = { id: id++, c };
        const rr = resolveInstant(b);
        let s = heuristic(b, rr, g.incoming, level);
        if (prm.beam >= 2 && g.queue[0]) {
            const ng = { board: b, piece: { x: SPAWN_X, y: -2, rot: 0, colors: g.queue[0] } };
            const p2s = [];
            for (let r = 0; r < 6; r++)
                for (let x = 0; x < W2; x++) {
                    const p0 = { x, y: -2, rot: r, colors: g.queue[0] };
                    if (!pieceFits(b, p0))
                        continue;
                    const q = dropPiece(b, p0);
                    if (!pieceCells(q).some(([, yy]) => yy < 0))
                        p2s.push(q);
                }
            let best2 = -1e9;
            const secondCap = level === 4 ? 12 : 22;
            const list2 = p2s.length > secondCap ? p2s.filter((_, i) => i % Math.ceil(p2s.length / secondCap) === 0) : p2s;
            for (const p2 of list2) {
                const b2 = b.map((r) => r.map((v) => v ? { ...v } : null));
                let id2 = 900000;
                for (const [x, y, c] of pieceCells(p2))
                    b2[y][x] = { id: id2++, c };
                const r2 = resolveInstant(b2);
                best2 = Math.max(best2, heuristic(b2, r2, g.incoming, level));
            }
            if (best2 > -1e8)
                s += (level === 4 ? 0.25 : 0.38) * best2;
        }
        scored.push([s, p]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    let choice = scored[0];
    if (prm.slip > 0 && g.aiRng() < prm.slip) {
        const pool = Math.min(scored.length, level === 1 ? 6 : 3);
        choice = scored[Math.floor(g.aiRng() * pool)];
    }
    return choice[1];
}
function stepAI(g, dt) {
    if (!g.ai || g.state !== "PLAYING" || !g.piece)
        return;
    const prm = AI_PARAMS[g.ai.level] || AI_PARAMS[3];
    if (!g.ai.target) {
        g.ai.thinkT -= dt;
        if (g.ai.thinkT <= 0) {
            g.ai.target = bestMove(g, g.ai.level);
            g.ai.actT = prm.delay * (0.65 + g.aiRng() * 0.7);
        }
        return;
    }
    g.ai.actT -= dt;
    if (g.ai.actT > 0)
        return;
    g.ai.actT = prm.delay * (0.7 + g.aiRng() * 0.65);
    if (g.piece.rot !== g.ai.target.rot) {
        const cw = (g.ai.target.rot - g.piece.rot + 6) % 6;
        rotate(g, cw <= 3 ? 1 : -1);
        return;
    }
    if (g.piece.x !== g.ai.target.x) {
        move(g, Math.sign(g.ai.target.x - g.piece.x));
        return;
    }
    hardDrop(g);
}
/* =============================================================
 * ゲーム
 * ============================================================= */
function newGame(seed, mode, aiLevel, remoteRole = 0) {
    const baseOpts = { offset: true };
    const a = createEngine(seed, baseOpts), b = createEngine(seed ^ 0xA5A5A5A5, baseOpts);
    a.stateT = b.stateT = 0;
    if (mode === "AI")
        b.ai = { level: aiLevel, target: null, thinkT: 0, actT: 0 };
    return { seed, mode, aiLevel, remoteRole, p: [a, b], over: false, winner: null, sent: [0, 0] };
}
function transfer(game) {
    const [a, b] = game.p;
    for (let i = 0; i < 2; i++) {
        const me = game.p[i], op = game.p[1 - i];
        if (me.sendBuffer > 0) {
            op.incoming += me.sendBuffer;
            game.sent[i] += me.sendBuffer;
            me.sendBuffer = 0;
        }
        if (me.sendShapes.length) {
            op.incomingShapes.push(...me.sendShapes);
            me.sendShapes.length = 0;
        }
    }
    if (!game.over) {
        if (!a.alive && b.alive) {
            game.over = true;
            game.winner = 1;
        }
        else if (!b.alive && a.alive) {
            game.over = true;
            game.winner = 0;
        }
        else if (!a.alive && !b.alive) {
            game.over = true;
            game.winner = -1;
        }
    }
}
