function normalizePileBallPhysics(ball){
    if(!ball||typeof ball!=="object")return;

    ball.rigid=false;
    ball.fixedGarbage=false;

    ball.shapeHeld=false;
    ball.shapeGroupId=0;
    ball.shapeOrientation="";
    ball.shapeRole=-1;

    ball.slopeRigidGroupId=0;
    ball.slopeRigidRole=-1;
    ball.slopeRigidOrientation="";
    ball.slopeRigidActive=false;

    ball.forceSplit=false;
    ball.fallBias=0;
    ball.fallBiasTTL=0;

    // All landing-triplet visual gates are also invalid after a ball joins the
    // pile. Leaving any of these alive can create a one-segment wait even
    // though the physical ball itself is already independent.
    ball.visualTripletId=0;
    ball.visualTripletOrientation="";
    ball.visualTripletRole=-1;
    ball.visualReleaseGroupId=0;
    ball.visualReleaseOrientation="";
    ball.visualReleaseGateRoles=[];
    ball.visualPreReleaseRemaining=0;
    ball.visualSyncSplitGroup=0;
    ball.visualSyncSplitStage=0;

    // Pile motion is determined only by the live contact solver.
    // Keep momentum/rollDir because these describe ordinary single-ball motion,
    // not rigidity.
}

function stripFinishedTripletRigidity(g){
    const groups=slopeRigidGroups(g.board);

    for(const members of groups.values()){
        // A partial old group can never remain a rigid pile object.
        if(members.length!==3){
            for(const m of members)
                normalizePileBallPhysics(m.ball);
            continue;
        }

        // Logical board positions are committed before their visual path
        // finishes. A group with any pending fallPath is still an in-flight
        // falling object, never accumulated pile.
        const visuallyInFlight=members.some(m=>
            Array.isArray(m.ball.fallPath) &&
            m.ball.fallPath.length>0
        );

        if(visuallyInFlight)
            continue;

        const c=rigidBodyContinuation(
            g.board,members
        );

        // Common rigid motion still exists -> this is still the currently
        // falling/rolling 3-ball piece, not accumulated pile.
        if(c.move)
            continue;

        // No common rigid displacement means the triplet has reached pile
        // state (or a real differential break). From this exact point onward
        // the three balls are permanently ordinary independent pile balls.
        for(const m of members)
            normalizePileBallPhysics(m.ball);
    }
}

function normalizeAllNonActivePileBalls(g){
    stripFinishedTripletRigidity(g);

    // Garbage is never allowed to own rigidity metadata after materialization.
    for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball||typeof ball!=="object")continue;

        if(ball.isGarbage){
            normalizePileBallPhysics(ball);
            ball.isGarbage=true; // identity/appearance only; no physics meaning.
        }else if(!ball.slopeRigidGroupId){
            ball.rigid=false;
            ball.fixedGarbage=false;
        }
    }
}

function releaseSettledConstraints(g, reason="clear_release") {
    // Only a currently moving intact 3-ball drop may keep slopeRigidGroupId.
    // Any triplet whose common rigid motion has ended is now accumulated pile
    // and permanently loses all rigidity metadata.
    normalizeAllNonActivePileBalls(g);

    for (let y=0;y<ROWS;y++) for (let x=0;x<W2;x++) {
        const v=valid(x,y)?g.board[y][x]:null;
        if(!v||typeof v!=="object")continue;

        v.fallBias=0;
        v.fallBiasTTL=0;
        v.forceSplit=false;
        v.fixedGarbage=false;

        // The ONLY allowed board rigidity is an intact triplet that still has
        // a legal common rigid-body continuation.
        v.rigid=!!v.slopeRigidGroupId;
    }

    if(g.physicsWatch){
        g.physicsWatch.lastSig="";
        g.physicsWatch.repeats=0;
        g.physicsWatch.steps=0;
    }
    return reason;
}

function releaseAllRigidity(g, reason="fallback") {
    g.activeCluster = null;
    g.landingSpecial = null;
    for (let y=0;y<ROWS;y++) for (let x=0;x<W2;x++) {
        const v=valid(x,y)?g.board[y][x]:null;
        if (v && typeof v === "object") {
            normalizePileBallPhysics(v);
        }
    }
    if (!g.physicsWatch) g.physicsWatch={lastSig:"",repeats:0,steps:0,fallbacks:0};
    g.physicsWatch.lastSig="";
    g.physicsWatch.repeats=0;
    g.physicsWatch.steps=0;
    g.physicsWatch.fallbacks=(g.physicsWatch.fallbacks||0)+1;
    return reason;
}
function physicsSafetyCheck(g, moved, context="SETTLE") {
    if (!g.physicsWatch) g.physicsWatch={lastSig:"",repeats:0,steps:0,fallbacks:0};
    const w=g.physicsWatch;
    const sig=physicsSignature(g);
    if (sig===w.lastSig) w.repeats++; else w.repeats=0;
    w.lastSig=sig;
    w.steps++;

    // 特殊制御が長く続く、同じ配置を反復する、または異常に多くステップを消費したら完全解放。
    const clusterTooLong = !!(g.activeCluster && ((g.activeCluster.moves||0)>6 || (g.activeCluster.stable||0)>3));
    const specialTooLong = !!(g.landingSpecial && ((g.landingSpecial.steps||0)>5 || (g.landingSpecial.bottomMoves||0)>ROWS+2));
    const stalled = moved && w.repeats>=2;
    const runaway = w.steps > ROWS*W2;
    if (clusterTooLong || specialTooLong || stalled || runaway) {
        releaseAllRigidity(g, context+":unstable");
        return true;
    }
    if (!moved && !g.activeCluster && !g.landingSpecial) {
        w.steps=0; w.repeats=0; w.lastSig=sig;
    }
    return false;
}

function findGroups(b) {
    const seen = Array.from({ length: ROWS }, () => Array(W2).fill(false));
    const out = [];
    for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < W2; x++) {
            if (!valid(x, y) || b[y][x] === null || seen[y][x])
                continue;
            const color = getC(b[y][x]);
            const st = [[x, y]];
            const cells = [];
            seen[y][x] = true;
            while (st.length) {
                const [cx, cy] = st.pop();
                cells.push([cx, cy]);
                for (const [dx, dy] of DIRS) {
                    const nx = cx + dx, ny = cy + dy;
                    if (valid(nx, ny) && !seen[ny][nx] && getC(b[ny][nx]) === color) {
                        seen[ny][nx] = true;
                        st.push([nx, ny]);
                    }
                }
            }
            if (cells.length >= CLEAR_MIN)
                out.push({ color, cells });
        }
    return out;
}
function classify(cells) {
    if (cells.length < 6)
        return null;
    const key = new Set(cells.map(([x, y]) => x + "," + y));
    const has = (x, y) => key.has(x + "," + y);
    const hasPatternAt = (ax, ay, pat) => pat.every(([dx, dy]) => has(ax + dx, ay + dy));
    // 連結数が7以上でも、その中に6球の技形状が含まれていれば必ず検出する。
    for (const w of WAZA_PRIORITY) {
        if (w === "STRAIGHT") {
            for (const [x, y] of cells)
                for (const [dx, dy] of [[2, 0], [1, 1], [1, -1]]) {
                    let ok = true;
                    for (let i = 0; i < 6; i++)
                        if (!has(x + dx * i, y + dy * i)) {
                            ok = false;
                            break;
                        }
                    if (ok)
                        return w;
                }
            continue;
        }
        const pat = GARBAGE_SHAPES[w];
        if (!pat)
            continue;
        for (const [x, y] of cells) {
            // pattern の各点が anchor になり得るよう逆算して探索する。
            for (const [px, py] of pat)
                if (hasPatternAt(x - px, y - py, pat))
                    return w;
        }
    }
    return null;
}
function resolveInstant(b) {
    let chain = 0, garbage = 0;
    for (let guard = 0; guard < 40; guard++) {
        settleAll(b);
        const groups = findGroups(b);
        if (!groups.length)
            break;
        chain++;
        const kill = new Set(), killColors = new Set();
        for (const g of groups) {
            const w = classify(g.cells);
            if (w) {
                garbage += WAZA[w].garbage;
                killColors.add(g.color);
            }
            for (const [x, y] of g.cells)
                kill.add(x + "," + y);
        }
        if (killColors.size)
            for (let y = 0; y < ROWS; y++)
                for (let x = 0; x < W2; x++)
                    if (valid(x, y) && b[y][x] !== null && killColors.has(getC(b[y][x])))
                        kill.add(x + "," + y);
        for (const k of kill) {
            const [x, y] = k.split(",").map(Number);
            b[y][x] = null;
        }
    }
    return { chain, garbage };
}
/* =============================================================
 * ピース: 三角形の重心まわりに 60° 回転
 *   偶数 rot = ▼ (上に2つ・下に1つ)  : 時計回り順 [TL, TR, B]
 *   奇数 rot = ▲ (上に1つ・下に2つ)  : 時計回り順 [T, BR, BL]
 *   どちらも (x,y)-(x+2,y) のペアを共有し、頂点だけが上下に入れ替わる。
 *   → 水平方向の中心は不変、垂直方向のブレは 1/3 行のみ。
 * ============================================================= */
/* ▼ 固定。時計回り順 [TL, TR, B]。
   120° 回転はセル集合を保存するため、重心がそのまま回転軸になる。
   （60° 回転は正三角格子では必ず 2 球が固定されるので採用しない） */
/* 60°×6状態。偶数=▼[TL,TR,B] / 奇数=▲[T,BR,BL]（いずれも時計回り順）。
   セル自体は 2 球が共有されるが、描画側で重心まわりの回転として補間するため
   見た目は三角形が中心で回る。 */
function pieceSlots(rot, x, y) {
    return (rot & 1) === 0
        ? [[x, y], [x + 2, y], [x + 1, y + 1]]
        : [[x + 1, y - 1], [x + 2, y], [x, y]];
}
function pieceCells(p) {
    const { x, y, rot, colors } = p;
    return pieceSlots(rot, x, y).map(([cx, cy], i) => [cx, cy, colors[(i - (rot >> 1) + 3) % 3]]);
}
/* ▼と▲は本来の重心が 1/3 行ずれる。描画時にこの量だけ補正すると
   6 状態すべての重心が一致し、回転軸が動かなくなる。 */
const dispOff = (rot) => ((rot & 1) === 0 ? -1 / 3 : 1 / 3);
/* 表示上の重心（セル座標系）。補正後は常に (x+1, y) になる */
function centroidOf(p) { return [p.x + 1, p.y]; }
/* 重心（実座標・ボール直径単位） */
function pieceFits(board, p) {
    for (const [x, y] of pieceCells(p)) {
        if (x < 0 || x >= W2 || y >= ROWS)
            return false;
        if (!parityOK(x, y))
            return false;
        if (y >= 0 && board[y][x] !== null)
            return false;
    }
    return true;
}
const KICKS = [[0, 0], [2, 0], [-2, 0], [1, 1], [-1, 1], [1, -1], [-1, -1], [0, 2], [4, 0], [-4, 0]];
/* 旧「分裂後の最終位置」予測。物理テスト用に残すが、
   本家の落下位置影には使わない。本家の影は3球形状を保った最初の接触位置。 */
function dropPiece(board, p) {
    const q = { ...p };
    while (pieceFits(board, { ...q, y: q.y + 2 }))
        q.y += 2;
    return q;
}
/* 本家型「落下位置の影」。
   hardDrop() と同じ dropPiece() を唯一の位置計算として共有する。
   分裂・settle後の位置ではなく、3球が形を保ったまま最初に接触する位置を返す。 */
function landingShadowCells(g) {
    if (!g || g.state !== "PLAYING" || !g.piece) return null;
    const p = dropPiece(g.board, g.piece);
    const cs = pieceCells(p);
    if (cs.length !== 3 || cs.some(([x,y]) => y < 0 || !valid(x,y))) return null;
    return cs;
}
function landingShadowVisualCells(g) {
    const cs = landingShadowCells(g);
    if (!cs || !g?.piece) return null;

    const dxGrid = (Number.isFinite(g.pieceVX) ? g.pieceVX : g.piece.x) - g.piece.x;

    // Detect whether the target is a pure first-layer landing.
    // If no settled ball constrains the landing before the floor,
    // use exact lattice/floor placement instead of sub-cell continuous Y.
    let constrainedByBall = false;

    for (const [sx0, sy] of cs) {
        const sx = sx0 + dxGrid;
        const sxN = latticeRealX(sx);
        const syN = cellCenterYNorm(sy);

        for (let by=0; by<ROWS; by++) for (let bx=0; bx<W2; bx++) {
            if (!valid(bx,by)) continue;
            const b = g.board[by][bx];
            if (!b) continue;

            const bxN = latticeRealX(bx);
            const byN = cellCenterYNorm(by);
            const ddx = Math.abs(sxN - bxN);
            if (ddx >= 1 - 1e-9) continue;

            const verticalContact = Math.sqrt(Math.max(0, 1 - ddx*ddx));
            const contactDown = (byN - syN) - verticalContact;
            const floorDown = FLOOR_CENTER_N - syN;

            if (contactDown >= -1e-8 && contactDown < floorDown - 1e-8) {
                constrainedByBall = true;
                break;
            }
        }
        if (constrainedByBall) break;
    }

    if (!constrainedByBall) {
        // First layer:
        // snap the rigid 3-ball ghost so the physically lowest ball center
        // sits exactly on the floor center-line. No sub-cell Y interpolation.
        let lowest = -Infinity;
        for (const [,sy] of cs) lowest = Math.max(lowest, cellCenterYNorm(sy));
        const downN = FLOOR_CENTER_N - lowest;
        const rowOffset = downN / HEX_ROW_H;

        // First layer must show the ACTUAL snapped landing column, not the
        // continuous drag X. This keeps ▲ and ▼ aligned to the same floor
        // lattice and removes the old half-cell horizontal offset.
        return cs.map(([x,y,c]) => [x, y + rowOffset, c]);
    }

    // Higher layers: continuous circle-contact shadow.
    let maxDownN = Infinity;

    for (const [sx, sy] of cs) {
        const syN = cellCenterYNorm(sy);
        maxDownN = Math.min(maxDownN, FLOOR_CENTER_N - syN);
    }

    for (const [sx0, sy] of cs) {
        const sx = sx0 + dxGrid;
        const sxN = latticeRealX(sx);
        const syN = cellCenterYNorm(sy);

        for (let by=0; by<ROWS; by++) for (let bx=0; bx<W2; bx++) {
            if (!valid(bx,by)) continue;
            const b = g.board[by][bx];
            if (!b) continue;

            const bxN = latticeRealX(bx);
            const byN = cellCenterYNorm(by);
            const ddx = Math.abs(sxN - bxN);
            if (ddx >= 1 - 1e-9) continue;

            const verticalContact = Math.sqrt(Math.max(0, 1 - ddx*ddx));
            const d = (byN - syN) - verticalContact;
            if (d >= -1e-8) maxDownN = Math.min(maxDownN, Math.max(0,d));
        }
    }

    if (!Number.isFinite(maxDownN)) maxDownN = 0;
    maxDownN = Math.max(0, maxDownN);
    const rowOffset = maxDownN / HEX_ROW_H;

    return cs.map(([x,y,c]) => [x + dxGrid, y + rowOffset, c]);
}

/* =============================================================
 * エンジン
 * ============================================================= */
// 2026-08-14 supplied original-game footage, clean fall segment.
// IMPORTANT: the active triplet advances y += 2 per logical drop step.
// Pixel travel per step is therefore 2 * ballDiameter * HEX_ROW_H, not one ball diameter.
const REFERENCE_FALL_PX_PER_SEC = 36.239736692842548;
const REFERENCE_BALL_PX = 63.399999999999999;
const REFERENCE_ACTIVE_STEP_PX = 2 * REFERENCE_BALL_PX * HEX_ROW_H;
const DROP_INTERVAL = REFERENCE_ACTIVE_STEP_PX / REFERENCE_FALL_PX_PER_SEC;
// 本家の下入力は「ゲーム全体の早送り」ではなく、落下中3球だけの高速落下。
const FAST_DROP_MULTIPLIER = 5.8;
// Do not switch the active interval at runtime. Fast-drop scales dropT advancement only.
const LONG_PRESS_MS = 260;
// Supplied original footage, unsupported green ball after HEXAGON clear:
// diameter≈63.4px, vertical acceleration≈1335.85px/s².
// Converted into lattice-row coordinates using HEX_ROW_H.
const GRAV = 24.329692506794245;
const RELEASE_INITIAL_VY = 3.788971974109861;
// Supplied original footage: one 60° contact slide ≈5 frames @30fps.
const REFERENCE_SLIDE_FRAMES = 5;
const REFERENCE_VIDEO_FPS = 30;
const GAME_FPS = 120;
const GAME_FRAME = 1 / GAME_FPS;
const PHYSICS_HZ = 120;
const PHYSICS_FRAME = 1 / PHYSICS_HZ;
const SLIDE_60_DURATION = REFERENCE_SLIDE_FRAMES / REFERENCE_VIDEO_FPS; // ordinary 60° contact slide
const SLIDE_SPEED = (Math.PI / 3) / SLIDE_60_DURATION;

// Supplied original footage, straight-slope hard-drop contact:
// the intact triplet completes the visible slope handoff in about 4 source
// frames. Ordinary contact keeps the existing 5-frame reference.
const REFERENCE_SLOPE_HARD_FRAMES = 4;
const SLOPE_HARD_DURATION = REFERENCE_SLOPE_HARD_FRAMES / REFERENCE_VIDEO_FPS;
const SLOPE_NORMAL_DURATION = SLIDE_60_DURATION;
                            // 速度をむやみに上げず、区間境界の停止除去で本家の連続感へ寄せる。
const PIECE_SNAP_SPEED = 14.0; // input/visual catch-up only; physics path itself is unchanged
const CONTACT_LOCK_DELAY = GAME_FRAME; // 60fpsの1フレーム。アニメーション時間は変更しない
const ROTATE_VISUAL_TIME = 0.10; // 60°回転の見た目。入力後の反応を短く保つ。
const smoothRotationT=(t)=>t*t*(3-2*t); // same 0.10s, smoother visual rotation
const activeDropFraction = (g, renderLead = 0) => {
    if (!g || !g.piece) return 0;
    if (!pieceFits(g.board, { ...g.piece, y: g.piece.y + 2 })) return 0;

    // Physics remains fixed at 120Hz, but renderLead predicts only the visible
    // position up to the next physics tick. This removes 120Hz cadence judder on
    // 144Hz/165Hz displays without changing logical timing or collision results.
    const dropTimeScale = g.fastForward ? FAST_DROP_MULTIPLIER : 1;
    const predictedDropT = g.dropT + Math.max(0, renderLead) * dropTimeScale;
    return Math.min(0.999, predictedDropT / g.dropInterval) * 2;
};
// Original HEXAGON footage: supporting balls are nearly gone before the unsupported ball begins to fall.
const CLEAR_SUPPORT_RELEASE_RATIO = 0.90;
// Pile/garbage collapse uses an overlap scheduler instead of fixed bulk steps.
const PILE_FLOW_SCHEDULE_STEP = 1 / 240;
const PILE_FLOW_MIN_WAVE_GAP = 1 / 120;
const PILE_FLOW_MIN_DIST = 0.9998;
// Scheduler collision sampling is adaptive. 144 samples per candidate created large
// main-thread spikes when many balls collapsed at once. 48 is a conservative cap;
// short segments use fewer samples while still checking several points per 120Hz frame.
const PILE_FLOW_COLLISION_SAMPLES = 48;
const PILE_FLOW_COLLISION_MIN_SAMPLES = 12;
const LEGACY_VISUAL_SUBSTEPS = 4;
const MAX_PHYSICS_CATCHUP_STEPS = 8;

const clearVisualState = (k) => {
    k = Math.max(0, Math.min(1, k));
    const scale = Math.max(0.04,
        1 + Math.sin(Math.min(1, k / 0.5) * Math.PI * 0.5) * 0.3
        - Math.max(0, (k - 0.6) / 0.4) * 1.1);
    const alpha = k < 0.62 ? 1 : Math.max(0, 1 - (k - 0.62) / 0.38);
    return { scale, alpha };
};
const GARBAGE_VISUAL_MAX = 4.2; // legacy minimum; actual batch watchdog is extended for 0.5s-per-ball delivery
const SETTLE_VISUAL_WATCHDOG = 1.25; // last-resort only; moving-vs-moving deadlock is prevented before this
const SPAWN_X = 10; // ペア中心が doubled-x 11 = 盤面中央
const makeSet = (g) => [0, 1, 2].map(() => Math.floor(g.rng() * COLORS.length));
