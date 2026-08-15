
const { useRef, useEffect, useState, useCallback } = React;
/* =============================================================
 * HEXDROP v5 (仮称)
 *  盤面 : ハニカム / doubled-x / 10列 × 12行  (有効セル ⇔ x+y が奇数)
 *  回転 : 三角形の重心まわり。60°ごとに頂点が上下反転し、色が巡る
 *  操作 : ドラッグで無段階スライド / 左右タップで回転 / 下部タップで落下
 *  横画面専用
 * ============================================================= */
/* 横は 12マス と 11マス が交互。doubled-x で 0..22 の 23 スロット。
   1段目(y=0) が 12マス。行数は奇数にして最下段も 12マスにしてある。 */
const W2 = 23, ROWS = 13, CLEAR_MIN = 6, TAU = Math.PI * 2;

// --- Canonical honeycomb / floor geometry ---
// All physics + rendering must derive from these values.
// Normalized unit = one ball diameter.
const BALL_RADIUS_N = 0.5;
const HEX_ROW_H = Math.sqrt(3) / 2;           // exact vertical center spacing
const BOARD_TOP_CENTER_N = BALL_RADIUS_N;      // first row center from board top
const BOARD_FLOOR_N = 1 + (ROWS - 1) * HEX_ROW_H; // floor line from board top
const FLOOR_CENTER_N = BOARD_FLOOR_N - BALL_RADIUS_N;
const FLOOR_EPS = 1e-7;

const cellCenterYNorm = (row) => BOARD_TOP_CENTER_N + row * HEX_ROW_H;
const ballBottomYNorm = (row) => cellCenterYNorm(row) + BALL_RADIUS_N;
const touchesFloorRow = (row) => Math.abs(ballBottomYNorm(row) - BOARD_FLOOR_N) <= FLOOR_EPS;
const latticeRealX = (x) => x * 0.5;

const parityOK = (x, y) => (((x + y) & 1) === 0);
const DIRS = [[2, 0], [1, 1], [-1, 1], [-2, 0], [-1, -1], [1, -1]];
const COLORS = [
    { base: "#FF3B4D", hi: "#FFC8CC", lo: "#7E0E1B", glow: "#FF6E7C", sym: "star" },
    { base: "#2E86FF", hi: "#BEDCFF", lo: "#0C3781", glow: "#63ABFF", sym: "wave" },
    { base: "#2FD36E", hi: "#BCF8D2", lo: "#0C6234", glow: "#5FEF98", sym: "cross" },
    { base: "#FFB020", hi: "#FFE9B8", lo: "#8A5602", glow: "#FFCB5F", sym: "bar" },
    { base: "#B255F0", hi: "#E9CCFF", lo: "#511D8C", glow: "#CE8AFF", sym: "arc" },
];
const WAZA = {
    // おじゃま単位: Straight=23球を1セット、Pyramid=6球形状×4セット、Hexagon=6球形状×6セット
    STRAIGHT: { jp: "ストレート", garbage: 23, packs: 1, hold: 0.55, tint: "#A8FFCF" },
    PYRAMID: { jp: "ピラミッド", garbage: 24, packs: 4, hold: 0.7, tint: "#FF9AD5" },
    HEXAGON: { jp: "ヘキサゴン", garbage: 36, packs: 6, hold: 0.95, tint: "#FFD86B" },
};
/* 技は「個数」ではなく「形」を送る。全座標は doubled-x 格子上の相対座標。 */
const GARBAGE_SHAPES = {
    // STRAIGHTだけは盤面幅いっぱいの2段: 1段目12球 + 2段目11球 = 23球。
    STRAIGHT: [
        [0,0],[2,0],[4,0],[6,0],[8,0],[10,0],[12,0],[14,0],[16,0],[18,0],[20,0],[22,0],
        [1,1],[3,1],[5,1],[7,1],[9,1],[11,1],[13,1],[15,1],[17,1],[19,1],[21,1]
    ],
    PYRAMID: [[2, 0], [1, 1], [3, 1], [0, 2], [2, 2], [4, 2]],
    HEXAGON: [[1, 0], [3, 0], [0, 1], [4, 1], [1, 2], [3, 2]],
};
const WAZA_PRIORITY = ["HEXAGON", "PYRAMID", "STRAIGHT"];
const mulberry32 = (a) => () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
/* =============================================================
 * サウンド（合成音・外部素材なし）
 * ============================================================= */
const Sfx = {
    ctx: null, master: null, enabled: true, haptics: true,
    init() {
        if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return;
        this.ctx = new C();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.26;
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -18; comp.knee.value = 18; comp.ratio.value = 3.2;
        comp.attack.value = 0.003; comp.release.value = 0.16;
        this.master.connect(comp); comp.connect(this.ctx.destination);
    },
    tone({ f = 440, f2 = null, d = 0.1, type = "sine", v = 1, delay = 0, attack = 0.004 }) {
        if (!this.enabled || !this.ctx) return;
        const t0 = this.ctx.currentTime + delay;
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(Math.max(20, f), t0);
        if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + d);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
        o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + d + 0.03);
    },
    noise({ d = 0.12, v = 0.18, f = 1200, q = 0.7, delay = 0 }) {
        if (!this.enabled || !this.ctx) return;
        const t0 = this.ctx.currentTime + delay;
        const n = Math.max(1, Math.floor(this.ctx.sampleRate * d));
        const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), ch = buf.getChannelData(0);
        for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.8);
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = f; lp.Q.value = q;
        const g = this.ctx.createGain(); g.gain.value = v;
        src.connect(lp); lp.connect(g); g.connect(this.master); src.start(t0);
    },
    blip(f, delay = 0, v = 0.06) {
        this.tone({ f, f2: f * 1.07, d: 0.055, type: "square", v, delay, attack: 0.002 });
        this.tone({ f: f * 2, f2: f * 1.92, d: 0.04, type: "sine", v: v * 0.33, delay });
    },
    // 深いメカニカルキーボードの「コトッ / thock」を模したオリジナル合成音。
    // 低域の胴鳴り + 短いキー接触音 + ごく短い底打ちノイズを重ねる。
    keyThock(vol = 1) {
        this.tone({ f: 126, f2: 92, d: 0.085, type: "sine", v: 0.105 * vol, attack: 0.0015 });
        this.tone({ f: 218, f2: 172, d: 0.052, type: "triangle", v: 0.050 * vol, attack: 0.001 });
        this.noise({ d: 0.028, v: 0.055 * vol, f: 760, q: 1.25 });
        this.tone({ f: 74, f2: 61, d: 0.11, type: "sine", v: 0.045 * vol, delay: 0.009, attack: 0.002 });
    },
    vib(p) {
        if (!this.haptics) return;
        try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* 非対応端末 */ }
    },
    play(ev, vol = 1) {
        // 原作音源は使用せず、短く明瞭なアーケード系SEのタイミング/手触りへ寄せた合成音。
        switch (ev.t) {
            case "move":
                // 小さく乾いたスライド音。高音の電子音を避け、操作音を落ち着かせる。
                this.tone({ f: 238, f2: 205, d: 0.038, type: "triangle", v: 0.028 * vol, attack: 0.001 });
                this.noise({ d: 0.018, v: 0.018 * vol, f: 1100, q: 0.8 });
                break;
            case "rotate":
                this.keyThock(vol);
                if (vol > 0.9) this.vib(5);
                break;
            case "land":
                this.tone({ f: 148, f2: 92, d: 0.10, type: "sine", v: 0.115 * vol, attack: 0.0015 });
                this.tone({ f: 286, f2: 214, d: 0.052, type: "triangle", v: 0.033 * vol, attack: 0.001 });
                this.noise({ d: 0.035, v: 0.045 * vol, f: 680, q: 1.0 });
                if (vol > 0.9) this.vib(7);
                break;
            case "drop":
                this.tone({ f: 310, f2: 108, d: 0.13, type: "triangle", v: 0.072 * vol, attack: 0.0015 });
                this.tone({ f: 115, f2: 78, d: 0.15, type: "sine", v: 0.048 * vol, attack: 0.002 });
                this.noise({ d: 0.045, v: 0.038 * vol, f: 930, q: 0.9 });
                if (vol > 0.9) this.vib(10);
                break;
            case "clear": { 
                const step = Math.min(7, Math.max(0, (ev.chain || 1) - 1));
                const root = 622 * Math.pow(1.075, step);
                [1, 1.26, 1.5].forEach((r, i) => this.blip(root * r, i * 0.036, (0.055 + step * 0.004) * vol));
                this.tone({ f: root / 2, f2: root * 0.72, d: 0.12, type: "sine", v: 0.05 * vol });
                if (vol > 0.9) this.vib(step >= 2 ? [0, 12, 24, 12] : 10);
                break;
            }
            case "waza": {
                const seq = {
                    STRAIGHT: [659, 784, 988],
                    PYRAMID: [523, 659, 784, 1047],
                    HEXAGON: [392, 523, 659, 784, 988, 1319],
                }[ev.w] || [523, 659, 784];
                seq.forEach((f, i) => { this.blip(f, i * 0.043, 0.075 * vol); this.tone({ f: f / 2, d: 0.13, type: "sine", v: 0.025 * vol, delay: i * 0.043 }); });
                this.tone({ f: 118, f2: 62, d: 0.34, type: "sine", v: 0.13 * vol });
                this.noise({ d: 0.09, v: 0.055 * vol, f: 1800, delay: 0.03 });
                if (vol > 0.9) this.vib(ev.w === "HEXAGON" ? [0, 32, 22, 32, 22, 60] : [0, 20, 22, 38]);
                break;
            }
            case "fast":
                // 早送り開始: 短い低域クリック。物理状態には一切触れない。
                this.tone({ f: 182, f2: 146, d: 0.045, type: "triangle", v: 0.038 * vol, attack: 0.001 });
                this.noise({ d: 0.016, v: 0.016 * vol, f: 900, q: 0.8 });
                if (vol > 0.9) this.vib(4);
                break;
            case "garbage":
                this.tone({ f: 170, f2: 72, d: 0.28, type: "triangle", v: 0.12 * vol });
                this.noise({ d: 0.24, v: 0.17 * vol, f: 620 });
                if (vol > 0.9) this.vib([0, 45, 24, 52]);
                break;
            case "win":
                [659, 784, 988, 1319].forEach((f, i) => this.blip(f, i * 0.075, 0.08));
                this.vib([0, 24, 30, 24, 30, 65]);
                break;
            case "lose":
                [440, 370, 311, 220].forEach((f, i) => this.tone({ f, f2: f * 0.92, d: 0.22, type: "triangle", v: 0.075, delay: i * 0.085 }));
                this.vib([0, 90]);
                break;
            default: break;
        }
    },
};
/* 2026-08 rigidity rework: settled balls have zero artificial rigidity; only geometric support can stop them. */

/* =============================================================
 * 盤面
 * ============================================================= */
const valid = (x, y) => y >= 0 && y < ROWS && x >= 0 && x < W2 && parityOK(x, y);
const newBoard = () => Array.from({ length: ROWS }, () => Array(W2).fill(null));
const getC = (v) => (v == null ? null : typeof v === "number" ? v : v.c);
function floorPackingScore(b, tx, ty) {
    if (ty !== ROWS - 1) return 0;
    let score = 0;
    for (const nx of [tx - 2, tx + 2]) {
        if (nx >= 0 && nx < W2 && b[ty][nx] !== null) score++;
    }
    if (tx <= 0 || tx >= W2 - 1) score += 0.5;
    return score;
}
function settleStep(b,x,y){
    // Original-footage local contact solver. No future-hole lookahead.
    if(!valid(x,y)||b[y][x]==null)return null;
    const ball=b[y][x];

    // A landed ball is never rigidly attached to another ball.
    // Old valleyBottomId links could freeze one-contact balls into impossible towers.
    // Clear legacy links and always resolve support from the current board geometry.
    if (ball && ball.valleyBottomId) ball.valleyBottomId = 0;

    const empty=(tx,ty)=>valid(tx,ty)&&b[ty][tx]===null;
    const l=empty(x-1,y+1), r=empty(x+1,y+1);

    // Same-row contacts matter only when paired with the opposite lower support.
    // In that geometry the ball already has two contacts and cannot roll through
    // either support without penetration.
    const sideL=valid(x-2,y)&&b[y][x-2]!==null;
    const sideR=valid(x+2,y)&&b[y][x+2]!==null;

    if(l&&r&&empty(x,y+2))return[x,y+2];

    // lower-right support + same-row left contact => stable wedge
    if(l&&!r){
        if(sideL)return null;
        return[x-1,y+1];
    }

    // lower-left support + same-row right contact => stable wedge
    if(r&&!l){
        if(sideR)return null;
        return[x+1,y+1];
    }

    if(!l&&!r)return null;

    // Final step into the floor: pack against an existing floor ball before
    // carrying the previous outward roll direction into a second extra slide.
    if (y + 1 === ROWS - 1 && l && r) {
        const sl=floorPackingScore(b,x-1,y+1);
        const sr=floorPackingScore(b,x+1,y+1);
        if(sl>sr)return[x-1,y+1];
        if(sr>sl)return[x+1,y+1];
    }

    // Exact top contact: resolve using motion at the contact, not remote board geometry.
    const fb=Math.sign(ball?.fallBias||0);
    if(fb)return[x+fb,y+1];
    const md=Math.sign(ball?.rollDir||ball?.momentumX||0);
    if(md)return[x+md,y+1];
    const sb=Math.sign(ball?.subCellBias||0);
    if(sb)return[x+sb,y+1];

    // Mathematical unstable equilibrium: deterministic epsilon only.
    return[x-1,y+1];
}

function lowerContactSupportCount(b, x, y) {
    if (touchesFloorRow(y)) return 2;
    let n = 0;
    for (const dx of [-1, 1]) {
        const tx=x+dx, ty=y+1;
        if (!valid(tx,ty) || b[ty][tx] !== null) n++;
    }

    // One lower support plus the opposite same-row contact is a genuine
    // two-contact stable wedge.
    if(n===1){
        const sideL=valid(x-2,y)&&b[y][x-2]!==null;
        const sideR=valid(x+2,y)&&b[y][x+2]!==null;
        if(sideL||sideR)n++;
    }
    return n;
}
function unstableFrozenBalls(b) {
    const out=[];
    for (let y=0;y<ROWS;y++) for (let x=0;x<W2;x++) {
        if (!valid(x,y) || !b[y][x]) continue;
        if (touchesFloorRow(y)) continue;

        const ball=b[y][x];


        if (ball && ball.valleyBottomId) ball.valleyBottomId = 0;

        const step=settleStep(b,x,y);
        const contacts=lowerContactSupportCount(b,x,y);
        if (!step && contacts < 2) out.push({x,y,id:ball.id,contacts});
    }
    return out;
}
function isHexagonCenterHole(b,cx,cy){
    if(!valid(cx,cy)||b[cy][cx]!==null)return false;
    const ring=[[cx-2,cy],[cx+2,cy],[cx-1,cy-1],[cx+1,cy-1],[cx-1,cy+1],[cx+1,cy+1]];
    for(const [x,y] of ring)if(!valid(x,y)||!b[y][x])return false;
    return true;
}
function boardHasIntentionalHexagonHole(b){
    for(let y=1;y<ROWS-1;y++)for(let x=2;x<W2-2;x++)
        if(isHexagonCenterHole(b,x,y))return true;
    return false;
}

function boardHasIllegalFloat(b) {
    return unstableFrozenBalls(b).length > 0;
}

function normPoint(x,y){
    return [latticeRealX(x), cellCenterYNorm(y)];
}
function lerp2(a,b,t){
    return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t];
}
function proposalPointAt(p,t){
    const a=normPoint(p.x,p.y), z=normPoint(p.tx,p.ty);
    t=Math.max(0,Math.min(1,t));

    const topPivot =
        p._effectiveTopPivot !== undefined ? p._effectiveTopPivot : p.topPivot;
    const visualPivot =
        p._effectiveVisualPivot !== undefined ? p._effectiveVisualPivot : p.visualPivot;

    // Exact-top contact path:
    // vertical fall -> touch top of support -> roll along support surface.
    if(topPivot){
        const pv=normPoint(topPivot[0],topPivot[1]);
        const contact=[pv[0],pv[1]-1];

        const fallLen=Math.max(0,Math.hypot(contact[0]-a[0],contact[1]-a[1]));
        const a0=-Math.PI/2;
        const a1=Math.atan2(z[1]-pv[1],z[0]-pv[0]);

        let da=a1-a0;
        while(da>Math.PI)da-=TAU;
        while(da<-Math.PI)da+=TAU;

        const fallT=Math.sqrt(
            Math.max(0,2*fallLen/Math.max(0.0001,GRAV))
        );
        const arcT=Math.abs(da)/SLIDE_SPEED;
        const total=Math.max(1e-9,fallT+arcT);
        const cut=fallT/total;

        if(t<=cut && cut>1e-9){
            const q=t/cut;
            const qq=q*q;
            return [
                a[0]+(contact[0]-a[0])*qq,
                a[1]+(contact[1]-a[1])*qq
            ];
        }

        const q=cut>=1-1e-9 ? 1 : (t-cut)/(1-cut);
        const ang=a0+da*Math.max(0,Math.min(1,q));
        return [pv[0]+Math.cos(ang),pv[1]+Math.sin(ang)];
    }

    if(visualPivot){
        const pv=normPoint(visualPivot[0],visualPivot[1]);
        const a0=Math.atan2(a[1]-pv[1],a[0]-pv[0]);
        const a1=Math.atan2(z[1]-pv[1],z[0]-pv[0]);
        let da=a1-a0;
        while(da>Math.PI)da-=TAU;
        while(da<-Math.PI)da+=TAU;
        const ang=a0+da*t;
        const r=Math.hypot(a[0]-pv[0],a[1]-pv[1]);
        return [pv[0]+Math.cos(ang)*r,pv[1]+Math.sin(ang)*r];
    }

    const dx=p.tx-p.x,dy=p.ty-p.y;
    const q=(Math.abs(dy)>=2 || Math.abs(dx)<1e-9) ? t*t : t;
    return lerp2(a,z,q);
}
function proposalsSweepOverlap(a,b){
    // Dense temporal sampling must match the exact visual parameterization.
    const MIN_D=0.9995;
    for(let i=0;i<=64;i++){
        const t=i/64;
        const pa=proposalPointAt(a,t), pb=proposalPointAt(b,t);
        if(Math.hypot(pa[0]-pb[0],pa[1]-pb[1]) < MIN_D) return true;
    }
    return false;
}
function proposalHitsStationaryBall(p,b,movingOrigins,movingTargets){
    // Check the swept path against balls that are NOT moving this pass.
    const MIN_D=0.9995;
    for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
        if(!valid(x,y)||!b[y][x])continue;
        const key=x+","+y;
        if(movingOrigins.has(key)) continue;

        // The actual support of a roll is intentionally touched, not crossed.
        const topPivot =
            p._effectiveTopPivot !== undefined ? p._effectiveTopPivot : p.topPivot;
        const visualPivot =
            p._effectiveVisualPivot !== undefined ? p._effectiveVisualPivot : p.visualPivot;
        const pivot=topPivot||visualPivot||null;
        if(pivot&&pivot[0]===x&&pivot[1]===y)continue;

        const q=normPoint(x,y);
        for(let i=1;i<=64;i++){
            const pt=proposalPointAt(p,i/64);
            if(Math.hypot(pt[0]-q[0],pt[1]-q[1]) < MIN_D) return true;
        }
    }
    return false;
}

function heldShapeGroups(b){
    const mp=new Map();
    for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
        if(!valid(x,y))continue;
        const ball=b[y][x];
        if(!ball || !ball.shapeHeld || !ball.shapeGroupId)continue;
        const gid=ball.shapeGroupId;
        if(!mp.has(gid))mp.set(gid,[]);
        mp.get(gid).push({ball,x,y,role:ball.shapeRole,orientation:ball.shapeOrientation});
    }
    return mp;
}
function clearShapeHold(members){
    for(const m of members){
        m.ball.shapeHeld=false;
        m.ball.shapeGroupId=0;
        m.ball.shapeOrientation="";
    }
}
function withMembersRemoved(b,members,fn){
    const saved=[];
    for(const m of members){
        saved.push([m.x,m.y,b[m.y][m.x]]);
        b[m.y][m.x]=null;
    }
    try{return fn();}
    finally{for(const [x,y,v] of saved)b[y][x]=v;}
}
function groupTranslationSafe(b,members,dx,dy){
    const own=new Set(members.map(m=>m.x+","+m.y));
    const targets=new Set();

    for(const m of members){
        const tx=m.x+dx,ty=m.y+dy;
        if(!valid(tx,ty))return false;
        const key=tx+","+ty;
        if(targets.has(key))return false;
        targets.add(key);

        const occ=b[ty][tx];
        if(occ && !own.has(tx+","+ty))return false;
    }

    // Swept collision against all balls outside this rigid 3-ball group.
    for(const m of members){
        const p={x:m.x,y:m.y,tx:m.x+dx,ty:m.y+dy};
        for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
            if(!valid(x,y)||!b[y][x]||own.has(x+","+y))continue;
            const q=normPoint(x,y);
            for(let i=1;i<=16;i++){
                const pt=proposalPointAt(p,i/16);
                if(Math.hypot(pt[0]-q[0],pt[1]-q[1])<0.9995)return false;
            }
        }
    }
    return true;
}
