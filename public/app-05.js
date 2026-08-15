function createEngine(seed, opts = {}) {
    var _a, _b;
    const g = {
        seed,
        rng: mulberry32(seed),
        aiRng: mulberry32((seed ^ 0x41A7C15D) >>> 0),
        fxRng: mulberry32((seed ^ 0x9E3779B9) >>> 0),
        board: newBoard(), nextId: 1,
        queue: [], piece: null, pieceVX: SPAWN_X, pieceVY: -2,
        rotAnim: { p: 1, dir: 1, dx: 0, dy: 0 }, freeX: null, dragging: false,
        activeCluster: null, landingSpecial: null, // legacy fields; always kept null in parity mode
        physicsWatch: { lastSig: "", repeats: 0, steps: 0, fallbacks: 0 },
        ver: 0,
        state: "READY", phase: null, stateT: 0,
        dropT: 0, dropInterval: (_a = opts.dropInterval) !== null && _a !== void 0 ? _a : DROP_INTERVAL, soft: false, fastForward: false, fastForwardCarry: 0,
        lockT: 0, hardDropAnim: null, lockResets: 0,
        incoming: 0, incomingShapes: [], sendBuffer: 0, sendShapes: [], garbShapes: [], garbBlocked: false, garbDone: false, garbLeft: 0, garbageBatchPrepared: false, garbageAnimDuration: 2.45, garbageSeq: 0, garbagePlans: [], activeGarbagePacks: [], garbageClock: 0, garbageMaterializeIndex: 0, garbageNextBallAt: 0, garbageWatchdogLimit: 6,
        chain: 0, clearing: null, holdT: 0,
        pileFlowClock: 0,
        vis: new Map(), events: [],
        stats: { maxChain: 0, cleared: 0, score: 0, waza: { STRAIGHT: 0, PYRAMID: 0, HEXAGON: 0 } },
        scoreDisp: 0,
        fx: { toasts: [], shake: 0, sink: 0, warn: 0, fastPulse: 0, sparks: [], rings: [] },
        gameOverOverflow: [], gameOverReason: null, rigidSlideDir: 0, rigidSlideSteps: 0,
        ai: null, alive: true, offset: (_b = opts.offset) !== null && _b !== void 0 ? _b : false,
    };
    for (let i = 0; i < 3; i++)
        g.queue.push(makeSet(g));
    return g;
}
const mkBall = (g, c) => ({ id: g.nextId++, c });
const setVis = (g, ball, x, y, vy = 0) => g.vis.set(ball.id, { x, y, vy, sq: 0 });
const emit = (g, e) => g.events.push(e);
function spawn(g) {
    const colors = g.queue.shift();
    g.queue.push(makeSet(g));
    g.piece = { x: SPAWN_X, y: -2, rot: 0, colors };
    g.pieceVX = SPAWN_X;
    g.pieceVY = -2;
    g.rotAnim = { p: 1, dir: 1, dx: 0, dy: 0 };
    g.freeX = null;
    g.dragging = false;
    g.activeCluster = null;
    g.landingSpecial = null;
    g.physicsWatch = { lastSig: "", repeats: 0, steps: 0, fallbacks: (g.physicsWatch?.fallbacks || 0) };
    g.dropT = 0;
    g.lockT = 0;
    g.lockResets = 0;
    g.garbDone = false;
    g.garbLeft = 0;
    g.garbShapes = [];
    g.garbagePlans = [];
    g.activeGarbagePacks = [];
    g.garbageClock = 0;
    g.garbageMaterializeIndex = 0;
    g.garbageNextBallAt = 0;
    g.garbageWatchdogLimit = 6;
    g.garbBlocked = false;
    g.garbageBatchPrepared = false;
    g.garbageSeq = 0;
    g.activeCluster = null;
    g.landingSpecial = null;
    g.chain = 0;
    g.state = "PLAYING";
    g.phase = null;
    if (g.ai) {
        g.ai.target = null;
        const aiLevel = Math.max(1, Math.min(5, Number(g.ai.level) || 1));
        g.ai.level = aiLevel;
        g.ai.thinkT = AI_PARAMS[aiLevel].think * (0.7 + g.aiRng() * 0.6);
        g.ai.actT = 0;
    }
}
function die(g, overflowCells = null, reason = "LIMIT") {
    g.state = "GAMEOVER";
    g.alive = false;
    if (Array.isArray(overflowCells))
        g.gameOverOverflow = overflowCells.map((v) => Array.isArray(v) ? [...v] : v);
    else
        g.gameOverOverflow = [];
    g.gameOverReason = reason;
    g.piece = null;
    g.hardDropAnim = null;
    g.activeCluster = null;
    g.landingSpecial = null;
    g.rigidSlideDir = 0;
    g.rigidSlideSteps = 0;
    // GAME OVERでは盤面を動かさず、はみ出した状態をそのまま表示する。
    g.fx.shake = 0;
    g.fx.sink = 0;
}
/* いまの回転・高さで置ける anchor x の範囲 */
function legalXRange(g) {
    const p = g.piece;
    let lo = null, hi = null;
    for (let x = 0; x < W2; x++) {
        if (((x - p.x) & 1) !== 0)
            continue;
        if (!pieceFits(g.board, { ...p, x }))
            continue;
        if (lo === null)
            lo = x;
        hi = x;
    }
    return [lo === null ? p.x : lo, hi === null ? p.x : hi];
}
/* 論理位置を targetX に最も近い合法セルへ寄せる */
function setColumn(g, targetX) {
    if (g.state !== "PLAYING" || !g.piece)
        return false;
    const want = Math.round((targetX - g.piece.x) / 2) * 2 + g.piece.x;
    if (want === g.piece.x)
        return false;
    const dir = Math.sign(want - g.piece.x);
    let moved = false;
    while (g.piece.x !== want) {
        const q = { ...g.piece, x: g.piece.x + dir * 2 };
        if (!pieceFits(g.board, q))
            break;
        g.piece = q;
        moved = true;
    }
    if (moved) {
        emit(g, { t: "move" });
        if (g.lockT > 0 && g.lockResets < 12) {
            g.lockT = 0;
            g.lockResets++;
        }
    }
    return moved;
}
const move = (g, d) => {
    if (!g.piece)
        return false;
    const r = setColumn(g, g.piece.x + d * 2);
    g.freeX = g.piece.x; // キー操作は格子基準に戻す
    return r;
};
/* ドラッグ中の自由位置。描画はここ、論理は最寄り格子に吸着 */
function setFreeX(g, fx) {
    if (g.state !== "PLAYING" || !g.piece)
        return;
    const [lo, hi] = legalXRange(g);
    g.freeX = Math.max(lo, Math.min(hi, fx));
    setColumn(g, g.freeX);
}

function rotationPosePoints(fromPiece,toPiece,dir,t){
    t=Math.max(0,Math.min(1,t));

    // Mirror the renderer exactly: the logical piece is already at toPiece,
    // while t=0 visually represents fromPiece.
    const cells=pieceCells(toPiece);
    const dOff=dispOff(toPiece.rot);
    const pts=cells.map(([x,y])=>[
        latticeRealX(x),
        cellCenterYNorm(y+dOff)
    ]);

    const gx=(pts[0][0]+pts[1][0]+pts[2][0])/3;
    const gy=(pts[0][1]+pts[1][1]+pts[2][1])/3;

    const before=centroidOf(fromPiece);
    const after=centroidOf(toPiece);
    const k=1-smoothRotationT(t);
    const ang=-k*(dir>0?1:-1)*(TAU/6);
    const ca=Math.cos(ang),sa=Math.sin(ang);

    const ox=k*(before[0]-after[0])*0.5;
    const oy=k*(before[1]-after[1])*HEX_ROW_H;

    return pts.map(([px0,py0])=>{
        const ax=px0-gx,ay=py0-gy;
        return [
            gx+ax*ca-ay*sa+ox,
            gy+ax*sa+ay*ca+oy
        ];
    });
}

function rotationSweepSafe(board,fromPiece,toPiece,dir){
    const MIN_D=0.9995;
    const LEFT=0;
    const RIGHT=latticeRealX(W2-1);

    // Reject whole-piece upward kicks. Rotation itself may move individual
    // vertices upward around the centroid, but the body center never jumps up.
    if(centroidOf(toPiece)[1] < centroidOf(fromPiece)[1]-1e-9)
        return false;

    // Dense 60° sweep, including endpoints.
    for(let i=0;i<=48;i++){
        const t=i/48;
        const pts=rotationPosePoints(fromPiece,toPiece,dir,t);

        for(const [px,py] of pts){
            if(px<LEFT-1e-8||px>RIGHT+1e-8)
                return false;
            if(py>FLOOR_CENTER_N+1e-8)
                return false;

            for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
                if(!valid(x,y)||!board[y][x])continue;
                const q=normPoint(x,y);
                if(Math.hypot(px-q[0],py-q[1])<MIN_D)
                    return false;
            }
        }

        // The three active balls must also remain mutually tangent/non-overlapping.
        for(let a=0;a<pts.length;a++)for(let b=a+1;b<pts.length;b++){
            if(Math.hypot(
                pts[a][0]-pts[b][0],
                pts[a][1]-pts[b][1]
            )<MIN_D)
                return false;
        }
    }

    return true;
}

function rotate(g, dir) {
    if (g.state !== "PLAYING" || !g.piece)
        return false;
    const nr = (g.piece.rot + (dir > 0 ? 1 : 5)) % 6; // 1 タップ 60°
    const fromPiece={...g.piece};
    const before = centroidOf(fromPiece);
    for (const [kx, ky] of KICKS) {
        const q = { ...fromPiece, rot: nr, x: fromPiece.x + kx, y: fromPiece.y + ky };
        if (!pieceFits(g.board, q))
            continue;
        if(!rotationSweepSafe(g.board,fromPiece,q,dir))
            continue;
        const after = centroidOf(q);
        g.piece = q;
        g.rotAnim = { p: 0, dir: dir > 0 ? 1 : -1, dx: before[0] - after[0], dy: before[1] - after[1] };
        emit(g, { t: "rotate" });
        if (g.lockT > 0 && g.lockResets < 12) {
            g.lockT = 0;
            g.lockResets++;
        }
        return true;
    }
    return false;
}

// 操作中の3球が斜面の狭い隙間に触れた時、すぐロックして分解せず、
// 3球の形を保ったまま斜め下へ進める経路があるなら先にそちらへ滑らせる。
const HARD_DROP_FRAMES=5;
const HARD_DROP_FPS=30;
const HARD_DROP_VISUAL_TIME=HARD_DROP_FRAMES/HARD_DROP_FPS;
function hardDrop(g){
    if(g.state!=="PLAYING"||!g.piece||g.hardDropAnim)return;
    const target=dropPiece(g.board,g.piece);
    if(target.y===g.piece.y){emit(g,{t:"drop"});lock(g,5);return;}
    g.hardDropAnim={
        t:0,dur:HARD_DROP_VISUAL_TIME,
        fromY:g.piece.y+activeDropFraction(g),
        target:{...target}
    };
    g.dropT=0;
    emit(g,{t:"drop"});
}
function lock(g, vy = 2) {

    // 自由位置が中心よりどちら側にあったかを、格子吸着の前に保存する。
    // ▲（上に凸）の三角形が裂ける時だけ、この情報を2:1の分裂方向に使う。
    const preSnapX = g.freeX != null ? g.freeX : g.piece.x;
    const splitOffset = preSnapX - g.piece.x;
    const splitRot = g.piece.rot;

    // 操作中は freeX で無段階に見せるが、着地時は必ず最寄りの合法列へ確定する。
    if (g.freeX != null) setColumn(g, g.freeX);
    g.activeCluster = null;

    let lockedCells = pieceCells(g.piece);
    // 1球ずつ置いてから失敗すると三角形が欠けるため、3球すべてを先に検証する。
    // 上限を越えた場合は、はみ出したピース全体を GAME OVER 表示用に保持する。
    let invalidLock = lockedCells.some(([x, y]) => y < 0 || !valid(x, y) || g.board[y][x] !== null);
    if (invalidLock) {
        // LIMIT判定の直前に論理盤面を完全安定化。
        // 浮遊/対称停止が崩れれば、同じピースを改めて最下点まで落として再判定する。
        const beforeLimit = physicsSignature(g);
        settleAll(g.board);
        if (physicsSignature(g) !== beforeLimit || boardHasIllegalFloat(g.board)) {
            g.piece = dropPiece(g.board, g.piece);
        }
        const retryCells = pieceCells(g.piece);
        invalidLock = retryCells.some(([x,y]) => y < 0 || !valid(x,y) || g.board[y][x] !== null);
        if (invalidLock) {
            die(g, retryCells.map(([x,y,c]) => [x,y,c]), "LIMIT");
            return;
        }
    }
    lockedCells = pieceCells(g.piece);
    const made = [];
    for (let role = 0; role < lockedCells.length; role++) {
        const [x, y, c] = lockedCells[role];
        const ball = mkBall(g, c);
        // Preserve infinitesimal left/right placement from continuous control.
        // It is only consulted when both slide directions are otherwise exactly equal.
        ball.subCellBias = Math.abs(splitOffset) > 1e-5 ? Math.sign(splitOffset) : 0;
        ball.momentumX = ball.subCellBias;

        // Preserve how the triplet reached contact. Straight-slope motion in
        // the reference keeps part of the impact speed instead of resetting to
        // the ordinary 5-frame slide.
        ball.slopeImpactFast = (vy || 0) >= 4.5;
        ball.slopeImpactVy = Math.max(RELEASE_INITIAL_VY, vy || 0);

        g.board[y][x] = ball;
        made.push({ ball, role, x, y });
        // 操作中ピース→盤面球の受け渡しで位置を作り直さない。
        // 接触フレームの格子中心をそのまま初期描画位置にし、
        // その後の移動は settleAll() が作る fallPath だけに任せる。
        // 旧0.4行の「再落下」補正は、着地直後の浮き直し/二段落下を生むため廃止。
        // Original-footage handoff:
        // the rigid active triplet loses rigidity at this exact contact/split moment,
        // but its motion must not be reset to zero.
        // Independent gravity/contact animation starts from the same position with
        // the measured release velocity already present.
        setVis(g, ball, x, y, Math.max(RELEASE_INITIAL_VY, vy || 0));
        {
            const vv=g.vis.get(ball.id);
            vv.motionSpeed=Math.max(RELEASE_INITIAL_VY, vy || 0);
            vv.justReleased=true;
        }
    }

    // 着地した瞬間から「積もった球」として扱う。
    // ここでは剛性クラスター/landingSpecialを一切残さず、通常重力へ即時解放する。
    // 方向バイアスは分裂方向を自然に選ぶための短時間ヒントだけに留め、剛体拘束には使わない。
    const shapeGroupId = made.length ? made[0].ball.id : 0;
    const shapeOrientation = ((splitRot & 1) === 0) ? "down" : "up";
    for(const m of made){
        m.ball.shapeGroupId=0;
        m.ball.shapeOrientation="";
        m.ball.shapeRole=m.role;
        // Immutable visual staging metadata. Logical shapeHold may be released immediately
        // after the condition is satisfied, but the renderer still needs to know which
        // three balls belonged to the same placed triplet.
        // Visual-only identity. This does NOT restore rigid/split logic.
        // It is used only to synchronize the two upper balls of a flat ▼ split.
        m.ball.visualTripletId=shapeGroupId;
        m.ball.visualTripletOrientation=shapeOrientation;
        m.ball.visualTripletRole=m.role;
        m.ball.shapeHeld=false;

        // Slope-rigid identity survives ordinary SETTLE cleanup.
        // It is released only after the intact triplet reaches a true flat surface.
        m.ball.slopeRigidGroupId=shapeGroupId;
        m.ball.slopeRigidOrientation=shapeOrientation;
        m.ball.slopeRigidRole=m.role;
        m.ball.slopeRigidActive=true;
        m.ball.rigid=true;

        // No orientation-specific split command. Contact geometry alone decides motion.
        m.ball.forceSplit=false;
        m.ball.fallBias=0;
        m.ball.fallBiasTTL=0;
    }
    g.activeCluster = null;
    g.landingSpecial = null;
    for (const m of made) {
        // Keep the newly placed triplet rigid while it is unsupported/on an incline.
        m.ball.rigid = true;
        m.ball.fixedGarbage = false;
    }

    // The triplet stays rigid through free fall / incline contact and is released
    // only when advanceSlopeRigidGroups() recognizes a true flat landing surface.
    // From this point onward every ball is an ordinary independent body.
    // settleAll() decides the split/slide strictly from live contacts and gravity.
    // 着地と同じフレームで通常重力を解き、必要なスライド/分裂を即開始する。
    // settleAll は各球の fallPath を記録するため、描画はその経路を滑らかに追従する。
    const beforeImmediateSettle = physicsSignature(g);
    const immediateMoved = settlePass(g.board);
    if(immediateMoved) g.ver++;

    // Split timing is determined by the contact solver only.

    g.piece = null; g.hardDropAnim = null; g.freeX = null; g.dragging = false; g.ver++;
    emit(g, { t: "land" });
    g.state = "RESOLVING"; g.phase = "SETTLE"; g.stateT = 0;
    if (immediateMoved && g.physicsWatch) {
        g.physicsWatch.lastSig = physicsSignature(g);
        g.physicsWatch.repeats = 0;
        g.physicsWatch.steps = 0;
    }
}
const TOPS = (() => { const a = []; for (let x = 0; x < W2; x++)
    if (valid(x, 0))
        a.push(x); return a; })();
/* おじゃま落下は1ターンの解決後に開始し、すべて1球ずつ0.5秒間隔で投入する。 */
function armGarbageVisual(g, ball, startX, startY) {
    // おじゃまも通常球と同じ自由落下描画へ渡す。開始時の座標だけ技形状を維持する。
    const v = g.vis.get(ball.id);
    if (!v) return;
    v.x = startX;
    v.y = startY;
    v.vy = 0;
    v.garbAnim = null;
}
function garbageVisualsDone(g) {
    return nearlySettled(g, 0.06);
}
/* 旧数値おじゃま互換。必ず1回につき1球だけ投入し、その後は通常球と同じ重力へ解放する。 */
function garbageBall(g) {
    const free = TOPS.filter((x) => g.board[0][x] === null);
    if (!free.length) return 0;
    const idx = Math.floor(g.rng() * free.length);
    const x = free[idx];
    const ball = mkBall(g, Math.floor(g.rng() * COLORS.length));
    ball.isGarbage=true;
    normalizePileBallPhysics(ball);
    ball.isGarbage=true;
    g.board[0][x]=ball;
    setVis(g, ball, x, -4.2, 0);
    armGarbageVisual(g, ball, x, -4.2);
    g.fx.shake = 0;
    g.ver++;
    return 1;
}
// 技由来のおじゃまは「形状1セット」を1個として数える。
// 例: PYRAMID完成時はピラミッド形状4個、HEXAGON完成時はヘキサゴン形状6個、STRAIGHTは23球形状1個。
const pendingIncomingCount = (g) =>
    g.incoming +
    g.incomingShapes.length +
    g.garbShapes.length +
    (g.garbagePlans || []).filter(p=>!p.landed).length +
    g.garbLeft;

/* おじゃま仕様:
   STRAIGHT=23球(1段目12 + 2段目11)を1セット同時落下。
   PYRAMID=6球のピラミッド形状×4セット。
   HEXAGON=6球のヘキサゴン形状×6セット。
   形状セット同士の投入開始間隔は0.5秒。
   出現〜盤面進入までは形を維持し、最初の接触後は通常堆積球と同じ物理へ解放する。 */
const GARBAGE_PACK_INTERVAL = 0.5;
const GARBAGE_START_Y = -6.2;

function cloneBoardForGarbagePlan(board) {
    return board.map(row => row.map(v => v ? { id:v.id, c:getC(v) } : null));
}
function shapeFitsAt(board, pat, ax, ay) {
    for (const [dx,dy] of pat) {
        const x=ax+dx, y=ay+dy;
        if (!valid(x,y) || board[y][x] !== null) return false;
    }
    return true;
}
function deepestRigidAnchor(board, pat, ax) {
    let ay=0;
    if (!shapeFitsAt(board,pat,ax,ay)) return null;
    while (shapeFitsAt(board,pat,ax,ay+2)) ay+=2;
    return ay;
}
function chooseGarbagePlan(g, board, type, seq) {
    const pat=GARBAGE_SHAPES[type];
    if (!pat || !WAZA[type]) return null;
    const minX=Math.min(...pat.map(([x])=>x));
    const maxX=Math.max(...pat.map(([x])=>x));
    const candidates=[];
    for (let ax=-minX; ax<=W2-1-maxX; ax++) {
        const ay=deepestRigidAnchor(board,pat,ax);
        if (ay===null) continue;
        candidates.push({ax,ay,shapeCenter:ax+(minX+maxX)/2});
    }
    if (!candidates.length) return null;
    const packCount=WAZA[type].packs||1;
    const lane=seq%packCount;
    const centers=candidates.map(c=>c.shapeCenter);
    const minC=Math.min(...centers), maxC=Math.max(...centers);
    // 映像上の印象に合わせ、端へ散らし切らず中央70%程度で交互に配る。
    const frac=packCount<=1?0.5:0.16+0.68*(lane/(packCount-1));
    const wanted=minC+(maxC-minC)*frac;
    candidates.sort((a,b)=>Math.abs(a.shapeCenter-wanted)-Math.abs(b.shapeCenter-wanted) || a.ax-b.ax);
    const best=candidates[0];
    let colors;
    if (type === "STRAIGHT") {
        // 上段12球と下段11球で対応する斜め列を同色にする。
        // 上段 i (x=2i) と下段 i (x=2i+1) が同色で連続して見える。
        const offset=Math.floor(g.rng()*COLORS.length);
        const upper=Array.from({length:12},(_,i)=>(offset+i)%COLORS.length);
        colors=pat.map(([dx,dy])=>{
            if (dy===0) return upper[Math.max(0,Math.min(11,Math.round(dx/2)))];
            if (dy===1) return upper[Math.max(0,Math.min(10,Math.round((dx-1)/2)))];
            return upper[0];
        });
    } else {
        colors=pat.map((_,i)=>(Math.floor(g.rng()*COLORS.length)+i)%COLORS.length);
    }
    return {type, pat, ax:best.ax, targetY:best.ay, startY:GARBAGE_START_Y, delay:0, colors, seq, y:GARBAGE_START_Y, vy:0, landed:false};
}
function reserveGarbagePlan(board, plan, tempIdBase) {
    for (let i=0;i<plan.pat.length;i++) {
        const [dx,dy]=plan.pat[i];
        board[plan.targetY+dy][plan.ax+dx]={id:tempIdBase-i,c:plan.colors[i]};
    }
    // 接触後は通常球になるので、次パックの計画も「前パックが通常重力で落ち着いた後」の盤面を基準にする。
    settleAll(board);
}
