var bootMsg=document.getElementById("bootMsg");function fail(m){if(bootMsg)bootMsg.textContent=m;}window.addEventListener("error",function(e){fail("エラー: "+(e&&e.message?e.message:e)+"\n"+(e.filename||""));});


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

/* =============================================================
 * HEXDROP unified physics 2026-08
 * Single source of truth for normal balls, pile balls and materialized garbage.
 * Legacy split/slope/wave/pile-rigidity definitions have been removed from the
 * runtime.  Logical state remains hex-lattice based; render motion is continuous.
 * ============================================================= */
const PHYS_MIN_DIST = 0.99935;
const PHYS_COLLISION_SAMPLES = 28;
const PHYS_SCHEDULE_STEP = 1 / 240;
let LIVE_MOTION_SEQ = 1;
let PHYS_ACTION_SEQ = 1;

function normPoint(x,y){ return [latticeRealX(x), cellCenterYNorm(y)]; }
function physicsDistanceGrid(ax,ay,bx,by){
    return Math.hypot((ax-bx)*0.5,(ay-by)*HEX_ROW_H);
}
function physicsCellBall(b,x,y,ignoreIds=null){
    if(!valid(x,y))return null;
    const q=b[y][x];
    if(!q)return null;
    if(ignoreIds && ignoreIds.has(q.id))return null;
    return q;
}
function physicsCellOpen(b,x,y,ignoreIds=null){
    return valid(x,y) && !physicsCellBall(b,x,y,ignoreIds);
}
function physicsExternalSupports(b,x,y,ignoreIds=null){
    const out=[];
    for(const dx of [-1,1]){
        const sx=x+dx,sy=y+1;
        const ball=physicsCellBall(b,sx,sy,ignoreIds);
        if(ball)out.push({dx,x:sx,y:sy,ball});
    }
    const below=physicsCellBall(b,x,y+2,ignoreIds);
    if(below)out.push({dx:0,x,y:y+2,ball:below,direct:true});
    return out;
}
function lowerContactSupportCount(b,x,y){
    if(!valid(x,y)||!b[y][x])return 0;
    let n=0;
    for(const dx of [-1,1]) if(physicsCellBall(b,x+dx,y+1)) n++;
    return n;
}
function physicsPreference(ball,b,x,y,ignoreIds=null){
    let dir=Math.sign(ball?.lastMoveDir || ball?.momentumX || ball?.subCellBias || 0);
    const score=(d)=>{
        let cx=x+d,cy=y+1,s=0;
        if(!physicsCellOpen(b,cx,cy,ignoreIds))return -999;
        for(let k=0;k<8;k++){
            s++;
            const dl=physicsCellOpen(b,cx-1,cy+1,ignoreIds);
            const dr=physicsCellOpen(b,cx+1,cy+1,ignoreIds);
            const dv=physicsCellOpen(b,cx,cy+2,ignoreIds);
            if(dl&&dr&&dv){cy+=2;continue;}
            if(dl&&!dr){cx-=1;cy+=1;continue;}
            if(dr&&!dl){cx+=1;cy+=1;continue;}
            break;
        }
        return s;
    };
    const sl=score(-1),sr=score(1);
    if(sr>sl)return 1;
    if(sl>sr)return -1;
    return dir||-1;
}

/* Independent-ball natural motion.  No shape-specific branch exists here. */
function naturalMotion(b,x,y,ignoreIds=null){
    if(!valid(x,y))return null;
    const ball=b[y][x];
    if(!ball)return null;
    const lv=valid(x-1,y+1),rv=valid(x+1,y+1);
    const lo=lv && physicsCellOpen(b,x-1,y+1,ignoreIds);
    const ro=rv && physicsCellOpen(b,x+1,y+1,ignoreIds);
    const bv=valid(x,y+2);
    const bo=bv && physicsCellOpen(b,x,y+2,ignoreIds);
    const leftSupport=lv ? physicsCellBall(b,x-1,y+1,ignoreIds) : null;
    const rightSupport=rv ? physicsCellBall(b,x+1,y+1,ignoreIds) : null;
    const direct= bv ? physicsCellBall(b,x,y+2,ignoreIds) : null;

    if(lo && ro && bo){
        return {x,y,tx:x,ty:y+2,dx:0,dy:2,kind:'FREE_FALL',pivot:null,topPivot:null,
            supportIds:[],ball};
    }

    if(lo && !ro){
        const pivot=rightSupport?[x+1,y+1]:null;
        return {x,y,tx:x-1,ty:y+1,dx:-1,dy:1,kind:pivot?'ROLL_LEFT':'WALL_FALL_LEFT',
            pivot,topPivot:null,supportIds:rightSupport?[rightSupport.id]:[],ball};
    }
    if(ro && !lo){
        const pivot=leftSupport?[x-1,y+1]:null;
        return {x,y,tx:x+1,ty:y+1,dx:1,dy:1,kind:pivot?'ROLL_RIGHT':'WALL_FALL_RIGHT',
            pivot,topPivot:null,supportIds:leftSupport?[leftSupport.id]:[],ball};
    }

    // On the top of one convex support, both diagonal exits are open.
    if(lo && ro && (!bo || direct)){
        const dir=physicsPreference(ball,b,x,y,ignoreIds);
        const tx=x+dir,ty=y+1;
        if(physicsCellOpen(b,tx,ty,ignoreIds)){
            return {x,y,tx,ty,dx:dir,dy:1,kind:direct?'TOP_ROLL':'FLOOR_SPREAD',
                pivot:null,topPivot:direct?[x,y+2]:null,
                supportIds:direct?[direct.id]:[],ball};
        }
    }

    return null;
}
function settleStep(b,x,y){
    const m=naturalMotion(b,x,y,null);
    return m?[m.tx,m.ty]:null;
}
function unstableFrozenBalls(b){
    const out=[];
    for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
        if(!valid(x,y)||!b[y][x])continue;
        if(naturalMotion(b,x,y,null))out.push({x,y,ball:b[y][x]});
    }
    return out;
}

function physicsGroupMap(b){
    const groups=new Map();
    for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
        if(!valid(x,y))continue;
        const ball=b[y][x];
        const gid=ball?.motionGroupId||0;
        if(!gid)continue;
        if(!groups.has(gid))groups.set(gid,[]);
        groups.get(gid).push({ball,x,y,role:ball.motionGroupRole??-1});
    }
    return groups;
}
function clearMotionGroupBall(ball){
    if(!ball||typeof ball!=='object')return;
    ball.motionGroupId=0;
    ball.motionGroupRole=-1;
    ball.motionGroupKind='';
    ball.motionGroupSize=0;
    ball.rigid=false;
}
function normalizePileBallPhysics(ball){
    if(!ball||typeof ball!=='object')return;
    clearMotionGroupBall(ball);
}
function normalizeAllNonActivePileBalls(g){
    if(!g?.board)return;
    for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball||typeof ball!=='object')continue;
        ball.rigid=!!ball.motionGroupId;
    }
}
function releaseSettledConstraints(g,reason='release'){
    normalizeAllNonActivePileBalls(g);
    return reason;
}
function releaseAllRigidity(g,reason='release_all'){
    if(!g?.board)return reason;
    for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(ball)normalizePileBallPhysics(ball);
    }
    return reason;
}
function physicsSignature(gOrBoard){
    const b=Array.isArray(gOrBoard)?gOrBoard:gOrBoard?.board;
    if(!b)return '';
    const a=[];
    for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
        const v=valid(x,y)?b[y][x]:null;
        if(v)a.push(v.id+'@'+x+','+y);
    }
    return a.join('|');
}

function physicsMotionSig(m){ return m?m.dx+','+m.dy:'REST'; }
function physicsTargetAdjacent(ax,ay,bx,by){ return Math.abs(physicsDistanceGrid(ax,ay,bx,by)-1)<1e-6; }
function physicsPairAction(b,members,ignoreIds){
    if(members.length!==2)return null;
    const [a,z]=members;
    const ma=naturalMotion(b,a.x,a.y,ignoreIds);
    const mz=naturalMotion(b,z.x,z.y,ignoreIds);
    if(ma&&mz&&ma.dx===mz.dx&&ma.dy===mz.dy){
        return {type:'translate',members,motions:[ma,mz],score:ma.dy+mz.dy};
    }
    // One member may act as a real pivot while the other lowers its center.
    if(ma&&!mz && physicsTargetAdjacent(ma.tx,ma.ty,z.x,z.y)){
        return {type:'pairPivot',members,motions:[{...ma,pivot:[z.x,z.y],topPivot:null,kind:'PAIR_PIVOT'},null],
            moving:a,pivot:z,score:ma.dy+0.25};
    }
    if(mz&&!ma && physicsTargetAdjacent(mz.tx,mz.ty,a.x,a.y)){
        return {type:'pairPivot',members,motions:[null,{...mz,pivot:[a.x,a.y],topPivot:null,kind:'PAIR_PIVOT'}],
            moving:z,pivot:a,score:mz.dy+0.25};
    }
    return null;
}
function physicsChooseTripletPair(b,members,ignoreIds){
    const cand=[];
    for(let i=0;i<3;i++)for(let j=i+1;j<3;j++){
        const pair=[members[i],members[j]];
        const action=physicsPairAction(b,pair,ignoreIds);
        if(action)cand.push({pair,action});
    }
    if(!cand.length)return null;
    const groupBias=Math.sign(members.reduce((s,m)=>s+(m.ball.lastMoveDir||m.ball.momentumX||m.ball.subCellBias||0),0));
    cand.sort((A,B)=>{
        if(B.action.score!==A.action.score)return B.action.score-A.action.score;
        if(groupBias){
            const ca=A.pair.reduce((s,m)=>s+m.x,0)/2;
            const cb=B.pair.reduce((s,m)=>s+m.x,0)/2;
            const ga=members.reduce((s,m)=>s+m.x,0)/3;
            const da=groupBias*(ca-ga), db=groupBias*(cb-ga);
            if(db!==da)return db-da;
        }
        return A.pair[0].ball.id-B.pair[0].ball.id;
    });
    return cand[0];
}

function physicsMoveDescriptor(move){
    if(!move)return null;
    return {
        x:move.x,y:move.y,tx:move.tx,ty:move.ty,
        pivot:move.pivot||null,topPivot:move.topPivot||null,kind:move.kind||'',
        movingSupportId:move.movingSupportId||0,
        movingSupportMotion:move.movingSupportMotion?physicsMoveDescriptor(move.movingSupportMotion):null
    };
}
function physicsPathPoint(move,t){
    t=Math.max(0,Math.min(1,t));
    const sx=move.x,sy=move.y,tx=move.tx,ty=move.ty;
    const start=normPoint(sx,sy),end=normPoint(tx,ty);

    // If the support itself moves in this same physical event, roll relative to
    // that moving center instead of orbiting its stale lattice position. This
    // is the key to linked pile collapse without overlap or wave waiting.
    if(move.movingSupportMotion){
        const sm=move.movingSupportMotion;
        const supportStart=normPoint(sm.x,sm.y),supportEnd=normPoint(sm.tx,sm.ty);
        const supportNow=physicsPathPoint(sm,t);
        let a0=Math.atan2(start[1]-supportStart[1],start[0]-supportStart[0]);
        let a1=Math.atan2(end[1]-supportEnd[1],end[0]-supportEnd[0]);
        let da=a1-a0;while(da>Math.PI)da-=TAU;while(da<-Math.PI)da+=TAU;
        const a=a0+da*t;
        return [supportNow[0]+Math.cos(a),supportNow[1]+Math.sin(a)];
    }

    // A direct-below convex support is first contacted by free fall and only
    // then becomes a rolling pivot.  Treat this as one continuous event so the
    // rendered center never teleports onto the unit circle.
    if(move.topPivot && !move.pivot){
        const pc=normPoint(move.topPivot[0],move.topPivot[1]);
        const contact=[pc[0],pc[1]-1];
        const fallDist=Math.max(0,contact[1]-start[1]);
        const fallT=Math.sqrt(Math.max(0,2*fallDist/Math.max(1e-6,GRAV)));
        const a0=-Math.PI/2;
        const a1=Math.atan2(end[1]-pc[1],end[0]-pc[0]);
        let da=a1-a0; while(da>Math.PI)da-=TAU; while(da<-Math.PI)da+=TAU;
        const arcT=Math.abs(da)/Math.max(1e-6,SLIDE_SPEED);
        const total=Math.max(1e-9,fallT+arcT),elapsed=t*total;
        if(fallT>1e-9 && elapsed<=fallT){
            const q=Math.max(0,Math.min(1,elapsed/fallT));
            const qq=q*q;
            return [start[0]+(contact[0]-start[0])*qq,start[1]+(contact[1]-start[1])*qq];
        }
        const q=arcT<=1e-9?1:Math.max(0,Math.min(1,(elapsed-fallT)/arcT));
        const a=a0+da*q;
        return [pc[0]+Math.cos(a),pc[1]+Math.sin(a)];
    }

    if(move.pivot){
        const pc=normPoint(move.pivot[0],move.pivot[1]);
        const a0=Math.atan2(start[1]-pc[1],start[0]-pc[0]);
        const a1=Math.atan2(end[1]-pc[1],end[0]-pc[0]);
        let da=a1-a0; while(da>Math.PI)da-=TAU; while(da<-Math.PI)da+=TAU;
        const a=a0+da*t;
        return [pc[0]+Math.cos(a),pc[1]+Math.sin(a)];
    }
    const q=(move.kind==='FREE_FALL'||Math.abs(ty-sy)>=2)?t*t:t;
    return [start[0]+(end[0]-start[0])*q,start[1]+(end[1]-start[1])*q];
}
function physicsMoveWithinBounds(move){
    if(!valid(move.tx,move.ty))return false;
    const left=latticeRealX(0)-1e-7,right=latticeRealX(W2-1)+1e-7;
    for(let i=0;i<=PHYS_COLLISION_SAMPLES;i++){
        const [x,y]=physicsPathPoint(move,i/PHYS_COLLISION_SAMPLES);
        if(x<left||x>right||y>FLOOR_CENTER_N+1e-7)return false;
    }
    return true;
}
function physicsMovesOverlap(a,z){
    for(let i=0;i<=PHYS_COLLISION_SAMPLES;i++){
        const t=i/PHYS_COLLISION_SAMPLES;
        const A=physicsPathPoint(a,t),Z=physicsPathPoint(z,t);
        if(Math.hypot(A[0]-Z[0],A[1]-Z[1])<PHYS_MIN_DIST)return true;
    }
    return false;
}
function physicsMoveHitsStationary(move,b,movingIds){
    for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
        if(!valid(x,y))continue;
        const q=b[y][x]; if(!q||movingIds.has(q.id)||q.id===move.ball.id)continue;
        const P=normPoint(x,y);
        for(let i=1;i<=PHYS_COLLISION_SAMPLES;i++){
            const A=physicsPathPoint(move,i/PHYS_COLLISION_SAMPLES);
            if(Math.hypot(A[0]-P[0],A[1]-P[1])<PHYS_MIN_DIST)return true;
        }
    }
    return false;
}

function physicsCollectPlan(b){
    const groups=physicsGroupMap(b);
    const groupedIds=new Set();
    const metaOps=[];
    const actions=[];

    for(const [gid,members] of groups){
        for(const m of members)groupedIds.add(m.ball.id);
        const kind=members[0]?.ball?.motionGroupKind||'';
        const expected=kind==='pair'?2:3;
        if(members.length!==expected){ metaOps.push({type:'release',members}); continue; }
        const ignore=new Set(members.map(m=>m.ball.id));
        if(kind==='pair'){
            const pa=physicsPairAction(b,members,ignore);
            if(pa){ actions.push({id:PHYS_ACTION_SEQ++,groupId:gid,groupKind:'pair',...pa}); }
            else metaOps.push({type:'release',members});
            continue;
        }
        const moves=members.map(m=>naturalMotion(b,m.x,m.y,ignore));
        if(moves.every(Boolean) && moves.every(m=>m.dx===moves[0].dx&&m.dy===moves[0].dy)){
            actions.push({id:PHYS_ACTION_SEQ++,groupId:gid,groupKind:'triplet',type:'translate',members,motions:moves,score:moves[0].dy*3});
            continue;
        }
        if(moves.every(m=>!m)){ metaOps.push({type:'release',members}); continue; }
        const chosen=physicsChooseTripletPair(b,members,ignore);
        if(chosen){
            const pairIds=new Set(chosen.pair.map(m=>m.ball.id));
            metaOps.push({type:'splitPair',members,pair:chosen.pair,single:members.find(m=>!pairIds.has(m.ball.id))});
        }else metaOps.push({type:'release',members});
    }

    // Metadata changes are physical events but have no visual pause. settleAll
    // immediately recomputes and appends the resulting continuous motion.
    if(metaOps.length)return {metaOps,actions:[]};

    for(let y=ROWS-1;y>=0;y--)for(let x=0;x<W2;x++){
        if(!valid(x,y))continue;
        const ball=b[y][x]; if(!ball||groupedIds.has(ball.id))continue;
        const m=naturalMotion(b,x,y,null);
        if(m)actions.push({id:PHYS_ACTION_SEQ++,groupId:0,groupKind:'single',type:'single',members:[{ball,x,y}],motions:[m],score:m.dy});
    }

    actions.sort((A,B)=>{
        const ay=Math.max(...A.members.map(m=>m.y)),by=Math.max(...B.members.map(m=>m.y));
        if(by!==ay)return by-ay;
        if(B.members.length!==A.members.length)return B.members.length-A.members.length;
        return A.id-B.id;
    });

    // Event-driven resolution: commit exactly one collision-safe logical event,
    // then recompute all supports before selecting the next.  Rendering may overlap
    // successive events, so this does not create a visible settle wave; it removes
    // the stale-support assumption caused by moving many unrelated lattice actions
    // against the same pre-event board snapshot.
    for(const a of actions){
        const moveList=a.motions.filter(Boolean);
        if(!moveList.length)continue;
        const ownIds=new Set(a.members.map(m=>m.ball.id));
        const localTargets=new Set();
        let ok=true;
        for(const m of moveList){
            if(!physicsMoveWithinBounds(m)){ok=false;break;}
            const key=m.tx+','+m.ty;
            if(localTargets.has(key)){ok=false;break;}
            localTargets.add(key);
            if(physicsCellBall(b,m.tx,m.ty,ownIds)){ok=false;break;}
        }
        if(!ok)continue;
        const movingIds=new Set(moveList.map(m=>m.ball.id));
        for(const m of moveList){if(physicsMoveHitsStationary(m,b,movingIds)){ok=false;break;}}
        if(!ok)continue;
        for(let i=0;i<moveList.length&&!ok;i++)for(let j=i+1;j<moveList.length;j++){
            if(physicsMovesOverlap(moveList[i],moveList[j])){ok=false;break;}
        }
        if(!ok)continue;
        return {metaOps:[],actions:[a]};
    }
    return {metaOps:[],actions:[]};
}

function physicsApplyMetaOps(ops){
    for(const op of ops){
        if(op.type==='release'){
            for(const m of op.members)clearMotionGroupBall(m.ball);
        }else if(op.type==='splitPair'){
            const gid=Math.min(...op.pair.map(m=>m.ball.id));
            for(const m of op.members)clearMotionGroupBall(m.ball);
            op.pair.forEach((m,i)=>{
                m.ball.motionGroupId=gid; m.ball.motionGroupKind='pair';
                m.ball.motionGroupRole=i; m.ball.motionGroupSize=2; m.ball.rigid=true;
            });
        }
    }
}
function physicsCurrentSupportIds(b,x,y,ignoreIds=null){
    const ids=[];
    for(const dx of [-1,1]){
        const q=physicsCellBall(b,x+dx,y+1,ignoreIds); if(q)ids.push(q.id);
    }
    const q=physicsCellBall(b,x,y+2,ignoreIds); if(q)ids.push(q.id);
    return [...new Set(ids)];
}
function physicsRefreshSupportMemory(b){
    for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
        if(!valid(x,y))continue;
        const ball=b[y][x]; if(!ball)continue;
        const ignore=ball.motionGroupId?new Set((physicsGroupMap(b).get(ball.motionGroupId)||[]).map(m=>m.ball.id)):null;
        ball._physicsSupportMemory=physicsCurrentSupportIds(b,x,y,ignore);
    }
}
function physicsApplyActions(b,actions){
    if(!actions.length)return false;
    const seq=LIVE_MOTION_SEQ++;
    const allMoves=[];
    for(const a of actions){
        a.motions.forEach(m=>{if(m)allMoves.push({action:a,move:m});});
    }
    for(const {move} of allMoves) b[move.y][move.x]=null;
    for(const {action,move} of allMoves){
        if(b[move.ty][move.tx]!==null){ b[move.y][move.x]=move.ball; continue; }
        b[move.ty][move.tx]=move.ball;
        const ball=move.ball;
        if(!Array.isArray(ball.fallPath))ball.fallPath=[];
        const releasedBy=(move.kind==='FREE_FALL' && Array.isArray(ball._physicsSupportMemory))
            ? ball._physicsSupportMemory.slice() : [];
        ball.fallPath.push({
            from:[move.x,move.y],to:[move.tx,move.ty],pivot:move.pivot||null,topPivot:move.topPivot||null,
            kind:move.kind,physicsSeq:seq,physicsActionId:action.id,
            supportIds:Array.isArray(move.supportIds)?move.supportIds.slice():[],releasedByIds:releasedBy,
            movingSupportId:move.movingSupportId||0,
            movingSupportMotion:move.movingSupportMotion?physicsMoveDescriptor(move.movingSupportMotion):null,
            motionGroupId:action.groupId||0
        });
        const d=Math.sign(move.dx||0);
        if(d){ ball.lastMoveDir=d; ball.momentumX=d; ball.subCellBias=d; }
        else if(move.dy>=2){ ball.lastMoveDir=0; }
    }
    physicsRefreshSupportMemory(b);
    return true;
}
function settlePass(b,preview=false){
    const plan=physicsCollectPlan(b);
    if(plan.metaOps.length){
        if(!preview)physicsApplyMetaOps(plan.metaOps);
        return true;
    }
    if(!plan.actions.length)return false;
    if(preview)return true;
    return physicsApplyActions(b,plan.actions);
}
const settleAll=(b)=>{
    physicsRefreshSupportMemory(b);
    const cap=ROWS*W2*10;
    for(let i=0;i<cap;i++){
        if(!settlePass(b,false))break;
    }
    return !settlePass(b,true);
};
const hasLegalGravityMove=(b)=>settlePass(b,true);
function boardHasIllegalFloat(b){ return settlePass(b,true); }
function physicsDeferredEntryY(y){ let yy=y; while(yy<0)yy+=2; return yy; }
function physicsInjectDeferredOverflow(g){
    const pending=Array.isArray(g.deferredOverflowPhysics)?g.deferredOverflowPhysics:[];
    if(!pending.length)return {moved:false,blocked:false};
    const remaining=[]; let injected=0;
    for(const q of pending){
        const yy=physicsDeferredEntryY(q.y);
        if(yy<ROWS && valid(q.x,yy) && g.board[yy][q.x]===null){
            const ball=mkBall(g,q.c); normalizePileBallPhysics(ball);
            g.board[yy][q.x]=ball; setVis(g,ball,q.x,q.y,0);
            ball.fallPath=[{from:[q.x,q.y],to:[q.x,yy],pivot:null,topPivot:null,kind:'DEFERRED_REENTRY',
                physicsSeq:LIVE_MOTION_SEQ++,physicsActionId:PHYS_ACTION_SEQ++,supportIds:[],releasedByIds:[],motionGroupId:0}];
            injected++;
        }else remaining.push(q);
    }
    g.deferredOverflowPhysics=remaining;
    g.gameOverOverflow=remaining.map(q=>[q.x,q.y,q.c]);
    if(injected){prepareContinuousPileFlow(g,'deferred_overflow_reentry');return {moved:true,blocked:remaining.length>0};}
    return {moved:false,blocked:remaining.length>0};
}

function findGroups(b) {
    const seen=Array.from({length:ROWS},()=>Array(W2).fill(false));
    const out=[];
    for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
        if(!valid(x,y)||!b[y][x]||seen[y][x])continue;
        const color=getC(b[y][x]),st=[[x,y]],cells=[]; seen[y][x]=true;
        while(st.length){
            const [cx,cy]=st.pop(); cells.push([cx,cy]);
            for(const [dx,dy] of DIRS){
                const nx=cx+dx,ny=cy+dy;
                if(valid(nx,ny)&&!seen[ny][nx]&&getC(b[ny][nx])===color){seen[ny][nx]=true;st.push([nx,ny]);}
            }
        }
        if(cells.length>=CLEAR_MIN)out.push({color,cells});
    }
    if(!out.length){b.__hexGarbageColorSequence=false;b.__hexGarbageColorCurrent=null;return out;}
    const colors=[...new Set(out.map(g=>g.color))];
    const garbageGroups=out.filter(grp=>grp.cells.some(([x,y])=>!!b[y][x]?.isGarbage));
    if(colors.length>1 && (garbageGroups.length||b.__hexGarbageColorSequence)){
        const chosen=(b.__hexGarbageColorCurrent!=null&&colors.includes(b.__hexGarbageColorCurrent))
            ? b.__hexGarbageColorCurrent : (garbageGroups[0]?.color ?? colors[0]);
        b.__hexGarbageColorSequence=true; b.__hexGarbageColorCurrent=null;
        return out.filter(g=>g.color===chosen);
    }
    return out;
}
function classify(cells) {
    if(!Array.isArray(cells)||cells.length<6)return null;
    const key=new Set(cells.map(([x,y])=>x+','+y));
    const contained=(pat)=>{
        if(!pat)return false;
        for(const [x,y] of cells)for(const [px,py] of pat){
            const ax=x-px,ay=y-py;
            if(pat.every(([dx,dy])=>key.has((ax+dx)+','+(ay+dy))))return true;
        }
        return false;
    };
    const inverted=[[0,0],[2,0],[4,0],[1,1],[3,1],[2,2]];
    if(contained(GARBAGE_SHAPES.HEXAGON))return 'HEXAGON';
    if(contained(GARBAGE_SHAPES.PYRAMID)||contained(inverted))return 'PYRAMID';
    for(const [x,y] of cells)for(const [dx,dy] of [[2,0],[1,1],[1,-1]]){
        let ok=true; for(let i=0;i<6;i++)if(!key.has((x+dx*i)+','+(y+dy*i))){ok=false;break;}
        if(ok)return 'STRAIGHT';
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
        gameOverOverflow: [], gameOverReason: null,
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
    if(Array.isArray(g.deferredOverflowPhysics)&&g.deferredOverflowPhysics.length){
        const r=physicsInjectDeferredOverflow(g);
        if(r.moved){g.state='RESOLVING';g.phase='SETTLE';g.stateT=0;return;}
        if(r.blocked){die(g,g.deferredOverflowPhysics.map(q=>[q.x,q.y,q.c]),'LIMIT');return;}
    }
    g.gameOverOverflow=[];

    const colors = g.queue.shift();
    g.queue.push(makeSet(g));
    g.piece = { x: SPAWN_X, y: -2, rot: 0, colors };
    g.pieceVX = SPAWN_X;
    g.pieceVY = -2;
    g.rotAnim = { p: 1, dir: 1, dx: 0, dy: 0 };
    g.freeX = null;
    g.dragging = false;
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
    if(!g?.piece)return;
    const preSnapX=g.freeX!=null?g.freeX:g.piece.x;
    const splitOffset=preSnapX-g.piece.x;
    if(g.freeX!=null)setColumn(g,g.freeX);

    // Let the existing pile finish its complete logical collapse before any
    // LIMIT decision.  No visual wave wait is introduced here.
    settleAll(g.board);
    g.piece=dropPiece(g.board,g.piece);
    let cells=pieceCells(g.piece);
    const overlap=cells.some(([x,y])=>y>=0&&(!valid(x,y)||g.board[y][x]!==null));
    if(overlap){ die(g,cells.map(([x,y,c])=>[x,y,c]),'LIMIT'); return; }

    const above=cells.filter(([,y])=>y<0);
    if(above.length){
        const inside=cells.filter(([,y])=>y>=0);
        if(inside.some(([x,y])=>!valid(x,y)||g.board[y][x]!==null)){
            die(g,cells.map(([x,y,c])=>[x,y,c]),'LIMIT'); return;
        }
        for(const [x,y,c] of inside){
            const ball=mkBall(g,c); normalizePileBallPhysics(ball);
            ball.lastMoveDir=Math.sign(splitOffset||0); ball.momentumX=ball.lastMoveDir; ball.subCellBias=ball.lastMoveDir;
            g.board[y][x]=ball; setVis(g,ball,x,y,Math.max(RELEASE_INITIAL_VY,vy||0));
        }
        if(!Array.isArray(g.deferredOverflowPhysics))g.deferredOverflowPhysics=[];
        g.deferredOverflowPhysics.push(...above.map(([x,y,c])=>({x,y,c})));
        g.gameOverOverflow=g.deferredOverflowPhysics.map(q=>[q.x,q.y,q.c]);
        g.piece=null; g.hardDropAnim=null; g.freeX=null; g.dragging=false;
        g.state='RESOLVING'; g.phase='SETTLE'; g.stateT=0; emit(g,{t:'land'});
        prepareContinuousPileFlow(g,'deferred_limit_settle'); g.ver++;
        return;
    }

    const made=[];
    for(let role=0;role<cells.length;role++){
        const [x,y,c]=cells[role],ball=mkBall(g,c);
        ball.lastMoveDir=Math.sign(splitOffset||0); ball.momentumX=ball.lastMoveDir; ball.subCellBias=ball.lastMoveDir;
        g.board[y][x]=ball; setVis(g,ball,x,y,Math.max(RELEASE_INITIAL_VY,vy||0));
        made.push({ball,x,y,role});
    }
    const gid=made[0]?.ball?.id||0;
    const orientation=(g.piece.rot&1)?'up':'down';
    for(const m of made){
        // Only the new solver's transient motion group exists.
        normalizePileBallPhysics(m.ball);
        m.ball.motionGroupId=gid; m.ball.motionGroupKind='triplet'; m.ball.motionGroupRole=m.role;
        m.ball.motionGroupSize=3; m.ball.rigid=true; m.ball.tripletOrientation=orientation;
        m.ball.lastMoveDir=Math.sign(splitOffset||0); m.ball.momentumX=m.ball.lastMoveDir; m.ball.subCellBias=m.ball.lastMoveDir;
    }
    g.piece=null; g.hardDropAnim=null; g.freeX=null; g.dragging=false; g.ver++;
    emit(g,{t:'land'}); g.state='RESOLVING'; g.phase='SETTLE'; g.stateT=0;
    prepareContinuousPileFlow(g,'piece_lock');
}
const TOPS = (() => { const a = []; for (let x = 0; x < W2; x++)
    if (valid(x, 0))
        a.push(x); return a; })();
/* おじゃま落下は1ターンの解決後に開始し、すべて1球ずつ0.6秒間隔で投入する。 */
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
   形状セット同士の投入開始間隔は0.6秒。
   出現〜盤面進入までは形を維持し、最初の接触後は通常堆積球と同じ物理へ解放する。 */
const GARBAGE_PACK_INTERVAL = 0.6;
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

function prepareGarbageBatch(g) {
    if (g.garbageBatchPrepared) return;
    g.garbageBatchPrepared=true;
    g.garbageClock=0;
    g.garbageSeq=0;
    g.garbageMaterializeIndex=0;
    g.garbagePlans=[];
    g.activeGarbagePacks=[];

    const pending=g.garbShapes.splice(0);
    const shadow=cloneBoardForGarbagePlan(g.board);
    const fullShapePlans=[];
    for (let i=0;i<pending.length;i++) {
        const plan=chooseGarbagePlan(g,shadow,pending[i],i);
        if (!plan) {
            g.garbBlocked=true;
            g.incomingShapes.unshift(...pending.slice(i));
            break;
        }
        reserveGarbagePlan(shadow,plan,-100000-i*100);
        fullShapePlans.push(plan);
    }

    // 形状1セットを1個のおじゃまとして、そのまま落下プランへ入れる。
    // PYRAMID/HEXAGONは6球の塊を崩さず、各セットを0.6秒間隔で開始する。
    // STRAIGHTは23球（12+11）全体を1セットとして一度に開始する。
    let packSeq=0;
    for (const shape of fullShapePlans) {
        g.garbagePlans.push({
            ...shape,
            seq:packSeq,
            delay:packSeq*GARBAGE_PACK_INTERVAL,
            y:GARBAGE_START_Y,
            vy:0,
            landed:false,
            _started:false
        });
        packSeq++;
    }

    g.garbageSeq=packSeq;
    // 実時間の次回投入時刻。フレーム落ち後も複数セットを同時catch-upしない。
    g.garbageNextBallAt=0;
    // 長い攻撃でも旧4.2秒強制投入が割り込まないよう、形状セット数に応じて監視時間を延長。
    g.garbageWatchdogLimit=Math.max(6,(packSeq+g.garbLeft)*GARBAGE_PACK_INTERVAL+6);
    g.ver++;
}
function materializeGarbagePack(g, pack) {
    // 計画時と盤面が変わっていたら、現在盤面で同型の最深合法位置を再探索。
    let ay=(pack.fixedTarget && shapeFitsAt(g.board,pack.pat,pack.ax,pack.targetY))
        ? pack.targetY
        : deepestRigidAnchor(g.board,pack.pat,pack.ax);
    if (ay===null) {
        // 横方向も最寄りから再探索。無理なら上限到達としてゲームオーバー判定へ。
        let best=null;
        for (let ax=0;ax<W2;ax++) {
            const yy=deepestRigidAnchor(g.board,pack.pat,ax);
            if (yy===null) continue;
            const d=Math.abs(ax-pack.ax);
            if (!best || d<best.d) best={ax,ay:yy,d};
        }
        if (!best) { g.garbBlocked=true; return false; }
        pack.ax=best.ax; ay=best.ay;
    }
    pack.targetY=ay;
    for (let i=0;i<pack.pat.length;i++) {
        const [dx,dy]=pack.pat[i];
        const x=pack.ax+dx, y=ay+dy;
        const ball=mkBall(g,pack.colors[i]);
        ball.isGarbage=true;
        ball.garbageType=pack.type;
        normalizePileBallPhysics(ball);
        ball.isGarbage=true;
        ball.garbageType=pack.type;
        g.board[y][x]=ball;
        // 接触瞬間の形状位置から通常球物理へつなぐ。上空から論理セルへワープさせない。
        setVis(g,ball,x,y,0);
    }
    // ここが「最初の接触」。この瞬間から全て通常の堆積球物理。
    normalizeAllNonActivePileBalls(g);

    // Once materialized, garbage is literally pile physics. No pack rigidity,
    // no bulk 0.12s synchronization and no garbage-only settle timing.
    prepareContinuousPileFlow(
        g,"garbage_materialize"
    );
    return true;
}
function updateGarbagePacks(g, dt) {
    g.garbageClock += dt;

    // 形状由来のおじゃまは「形状1セット」ずつ。
    // フレーム落ち後もcatch-up投入はせず、実際に1セットを開始した時刻から次の0.6秒を数える。
    const nextPlan=g.garbagePlans.find(p=>!p._started);
    if (nextPlan && g.garbageClock + 1e-9 >= g.garbageNextBallAt) {
        nextPlan._started=true;
        nextPlan.actualStartTime=g.garbageClock;
        g.activeGarbagePacks.push(nextPlan);
        g.garbageNextBallAt=g.garbageClock+GARBAGE_PACK_INTERVAL;
    }

    for (const p of g.activeGarbagePacks) {
        if (p.landed) continue;
        p.vy += GRAV*dt;
        p.y += p.vy*dt;
        if (p.y >= p.targetY) {
            p.y=p.targetY;
            p.vy=0;
            // 同時フレームで複数が到達しても、投入順を越えて確定させない。
            const earlierPending=g.activeGarbagePacks.some(q=>q.seq<p.seq && !q.landed);
            if (!earlierPending) {
                if (materializeGarbagePack(g,p)) p.landed=true;
                else { p.landed=true; g.garbBlocked=true; }
            }
        }
    }

    // 旧数値互換おじゃまは従来どおり1球を1個として、同じ0.6秒間隔。1更新で複数球を生成しない。
    const shapesDone=g.garbagePlans.every(p=>p.landed);
    if (shapesDone && g.garbLeft>0 && g.garbageClock + 1e-9 >= g.garbageNextBallAt) {
        const placed=garbageBall(g);
        if (!placed) {
            g.garbBlocked=true;
            g.incoming+=g.garbLeft;
            g.garbLeft=0;
        } else {
            g.garbLeft-=1;
            g.garbageNextBallAt=g.garbageClock+GARBAGE_PACK_INTERVAL;

            normalizeAllNonActivePileBalls(g);
            prepareContinuousPileFlow(
                g,"numeric_garbage"
            );
        }
    }
}
function garbageBatchDone(g) {
    return g.garbagePlans.every(p=>p.landed) && g.garbLeft===0 && garbageVisualsDone(g);
}
function finishGarbageVisuals(g) {
    // 特別な補間は無い。通常物理の現在位置をそのまま維持する。
}

// Continuous visual collision gate: never let an animated ball enter another ball.
// Unlike the old post-collision pushback, this clamps the current segment before contact,
// so there is no lateral kick, oscillation, or easing-like correction.

/* =============================================================
 * Unified motion scheduler / renderer.
 * There is no wave completion gate.  settleAll first compiles the entire
 * logical collapse; these trajectories are then scheduled on one time axis.
 * ============================================================= */
function physicsSegmentDuration(seg){
    const [sx,sy]=seg.from,[tx,ty]=seg.to;
    if(seg.topPivot&&!seg.pivot){
        const pc=normPoint(seg.topPivot[0],seg.topPivot[1]);
        const a=normPoint(sx,sy),z=normPoint(tx,ty);
        const contactY=pc[1]-1;
        const fallDist=Math.max(0,contactY-a[1]);
        const fallT=Math.sqrt(Math.max(0,2*fallDist/Math.max(1e-6,GRAV)));
        const a0=-Math.PI/2,a1=Math.atan2(z[1]-pc[1],z[0]-pc[0]);
        let da=a1-a0;while(da>Math.PI)da-=TAU;while(da<-Math.PI)da+=TAU;
        const arcT=Math.abs(da)/Math.max(1e-6,SLIDE_SPEED);
        return Math.max(1/120,fallT+arcT);
    }
    if(seg.pivot){
        const pc=normPoint(seg.pivot[0],seg.pivot[1]),a=normPoint(sx,sy),z=normPoint(tx,ty);
        const a0=Math.atan2(a[1]-pc[1],a[0]-pc[0]),a1=Math.atan2(z[1]-pc[1],z[0]-pc[0]);
        let da=a1-a0;while(da>Math.PI)da-=TAU;while(da<-Math.PI)da+=TAU;
        return Math.max(1/120,Math.abs(da)/SLIDE_SPEED);
    }
    const dist=Math.hypot((tx-sx)*0.5,(ty-sy)*HEX_ROW_H);
    if(Math.abs(ty-sy)>=2||Math.abs(tx-sx)<1e-9){
        return Math.max(1/120,Math.sqrt(Math.max(1e-6,2*dist/Math.max(1e-6,GRAV))));
    }
    return Math.max(1/120,dist/Math.max(1e-6,SLIDE_SPEED));
}
function physicsSegmentRenderPoint(seg,t){
    t=Math.max(0,Math.min(1,t));
    const move={x:seg.from[0],y:seg.from[1],tx:seg.to[0],ty:seg.to[1],pivot:seg.pivot,topPivot:seg.topPivot,kind:seg.kind,
        movingSupportId:seg.movingSupportId||0,movingSupportMotion:seg.movingSupportMotion||null};
    const P=physicsPathPoint(move,t);
    return [P[0]/0.5,(P[1]-BOARD_TOP_CENTER_N)/HEX_ROW_H];
}
function physicsBallById(g,id){
    for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b?.id===id)return b;}
    return null;
}
function physicsPathPositionAt(ball,time){
    const p=Array.isArray(ball?.fallPath)?ball.fallPath:[];
    if(!p.length)return null;
    let fallback=p[0].from;
    for(const s of p){
        if(!s.motionScheduled){return fallback;}
        if(time<s.motionStart)return fallback;
        if(time<=s.motionEnd){const q=(time-s.motionStart)/Math.max(1e-9,s.motionDuration);return physicsSegmentRenderPoint(s,q);}
        fallback=s.to;
    }
    return fallback;
}
function physicsScheduleBatchSafe(g,batch,start,duration){
    const memberIds=new Set(batch.map(q=>q.ball.id));
    const all=[];
    for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b&&!memberIds.has(b.id))all.push({ball:b,x,y});}
    const samples=Math.max(48,Math.min(144,Math.ceil(duration*720)));
    for(let i=0;i<=samples;i++){
        const time=start+duration*(i/samples);
        const pts=batch.map(q=>({id:q.ball.id,p:physicsSegmentRenderPoint(q.seg,(time-start)/duration)}));
        for(let a=0;a<pts.length;a++)for(let z=a+1;z<pts.length;z++){
            if(physicsDistanceGrid(pts[a].p[0],pts[a].p[1],pts[z].p[0],pts[z].p[1])<PHYS_MIN_DIST)return false;
        }
        for(const q of pts)for(const other of all){
            const op=physicsPathPositionAt(other.ball,time)||[other.x,other.y];
            if(physicsDistanceGrid(q.p[0],q.p[1],op[0],op[1])<PHYS_MIN_DIST)return false;
        }
    }
    return true;
}
function physicsSchedulePaths(g,reason='physics'){
    const fresh=[];
    for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball||!Array.isArray(ball.fallPath))continue;
        for(const seg of ball.fallPath)if(!seg.motionScheduled)fresh.push({ball,seg});
    }
    if(!fresh.length)return {balls:0,segments:0};
    // Same-action segments and moving-support dependents form one continuous
    // motion component. They receive one start time/duration, so tangent
    // contacts stay tangent while the support itself moves.
    const parent=fresh.map((_,i)=>i);
    const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
    const join=(a,b)=>{a=root(a);b=root(b);if(a!==b)parent[b]=a;};
    const byAction=new Map(),byBallSeq=new Map();
    fresh.forEach((q,i)=>{
        const ak=(q.seg.physicsSeq||0)+'|'+(q.seg.physicsActionId||('single-'+q.ball.id));
        if(byAction.has(ak))join(i,byAction.get(ak));else byAction.set(ak,i);
        byBallSeq.set(q.ball.id+'|'+(q.seg.physicsSeq||0),i);
    });
    fresh.forEach((q,i)=>{
        if(!q.seg.movingSupportId)return;
        const j=byBallSeq.get(q.seg.movingSupportId+'|'+(q.seg.physicsSeq||0));
        if(j!==undefined)join(i,j);
    });
    const groups=new Map();
    fresh.forEach((q,i)=>{const k=root(i);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(q);});
    const ordered=[...groups.values()].sort((a,b)=>(a[0].seg.physicsSeq||0)-(b[0].seg.physicsSeq||0));
    // Preserve causal event ordering without creating a stop-and-go wave.
    // A later logical event may overlap an earlier one, but it may not begin
    // before every batch of the earlier event has at least begun.
    let currentSeq=null,seqStartFloor=g.pileFlowClock||0,seqMaxStart=seqStartFloor;
    for(const batch of ordered){
        const batchSeq=batch[0].seg.physicsSeq||0;
        if(currentSeq===null)currentSeq=batchSeq;
        else if(batchSeq>currentSeq){seqStartFloor=seqMaxStart;currentSeq=batchSeq;seqMaxStart=seqStartFloor;}
        let earliest=Math.max(g.pileFlowClock||0,seqStartFloor);
        let duration=Math.max(...batch.map(q=>physicsSegmentDuration(q.seg)),1/120);
        for(const q of batch){
            const path=q.ball.fallPath,idx=path.indexOf(q.seg);
            if(idx>0&&Number.isFinite(path[idx-1]?.motionEnd))earliest=Math.max(earliest,path[idx-1].motionEnd);
            const deps=[...(q.seg.releasedByIds||[]),...(q.seg.supportIds||[])];
            for(const id of deps){
                const sb=physicsBallById(g,id),sp=Array.isArray(sb?.fallPath)?sb.fallPath:[];
                const active=sp.find(s=>s.motionScheduled&&Number.isFinite(s.motionStart));
                if(active)earliest=Math.max(earliest,active.motionStart+Math.min(0.045,active.motionDuration*0.20));
            }
        }
        let start=earliest,safe=physicsScheduleBatchSafe(g,batch,start,duration),guard=0;
        while(!safe&&guard++<480){start+=PHYS_SCHEDULE_STEP;safe=physicsScheduleBatchSafe(g,batch,start,duration);}
        if(!safe){
            // Serialize behind every already scheduled motion. This is not a
            // settle wave: only the display start time changes, while the full
            // logical collapse was already solved. It guarantees that an
            // animation is never forced through another ball.
            let horizon=start;
            for(let yy=0;yy<ROWS;yy++)for(let xx=0;xx<W2;xx++){
                const other=valid(xx,yy)?g.board[yy][xx]:null;
                for(const s of (Array.isArray(other?.fallPath)?other.fallPath:[]))
                    if(s.motionScheduled&&Number.isFinite(s.motionEnd))horizon=Math.max(horizon,s.motionEnd+PHYS_SCHEDULE_STEP);
            }
            start=horizon; safe=physicsScheduleBatchSafe(g,batch,start,duration);
        }
        if(!safe){
            // A path that is still unsafe against fully settled geometry is a
            // solver invariant failure. Never render an overlap. Leave it
            // unscheduled and expose diagnostics instead of forcing motion.
            g.physicsInvariantError='unsafe_motion_path';
            for(const q of batch)q.seg.motionBlocked=true;
            continue;
        }
        for(const q of batch){
            q.seg.motionScheduled=true;q.seg.motionStart=start;q.seg.motionDuration=duration;q.seg.motionEnd=start+duration;q.seg.motionReason=reason;
        }
        seqMaxStart=Math.max(seqMaxStart,start);
    }
    return {balls:new Set(fresh.map(q=>q.ball.id)).size,segments:fresh.length};
}
function prepareContinuousPileFlow(g,reason='physics'){
    normalizeAllNonActivePileBalls(g);
    const before=physicsSignature(g);
    settleAll(g.board);
    const tagged=physicsSchedulePaths(g,reason);
    const moved=before!==physicsSignature(g)||tagged.segments>0;
    if(moved)g.ver++;
    g._settleCompiled=true;
    return {moved,...tagged};
}
function updateScheduledPileFlowVisual(g,cell,v,dt){
    const path=Array.isArray(cell.fallPath)?cell.fallPath:null;
    if(!path||!path.length)return false;
    // Consume every already-finished segment in the same render call.
    while(path.length && path[0].motionScheduled && g.pileFlowClock>=path[0].motionEnd-1e-10){
        v.x=path[0].to[0];v.y=path[0].to[1];path.shift();
    }
    if(!path.length){delete cell.fallPath;v.vy=0;v.motionSpeed=0;return true;}
    const seg=path[0];
    if(!seg.motionScheduled)physicsSchedulePaths(g,'late_schedule');
    if(g.pileFlowClock<seg.motionStart)return true;
    const q=(g.pileFlowClock-seg.motionStart)/Math.max(1e-9,seg.motionDuration);
    const oldX=v.x,oldY=v.y; const [nx,ny]=physicsSegmentRenderPoint(seg,q);
    v.x=nx;v.y=ny;
    v.motionSpeed=Math.hypot((v.x-oldX)*0.5,(v.y-oldY)*HEX_ROW_H)/Math.max(1e-9,dt);
    v.vy=Math.max(0,(v.y-oldY)/Math.max(1e-9,dt));
    return true;
}
function liveSegDuration(seg){return physicsSegmentDuration(seg);}
function liveSegPoint(seg,t){return physicsSegmentRenderPoint(seg,t);}
function collectLiveMotionBatch(g){return null;}
function visualPointSafe(g,id,x,y,minDist=PHYS_MIN_DIST){
    const X=latticeRealX(x),Y=cellCenterYNorm(y);
    for(let yy=0;yy<ROWS;yy++)for(let xx=0;xx<W2;xx++){
        const c=valid(xx,yy)?g.board[yy][xx]:null;if(!c||c.id===id)continue;
        const v=g.vis.get(c.id);const px=v?latticeRealX(v.x):latticeRealX(xx),py=v?cellCenterYNorm(v.y):cellCenterYNorm(yy);
        if(Math.hypot(X-px,Y-py)<minDist)return false;
    }
    return true;
}
function visualSegmentSafe(g,id,ox,oy,nx,ny,minDist=PHYS_MIN_DIST){
    for(let i=1;i<=20;i++){const t=i/20;if(!visualPointSafe(g,id,ox+(nx-ox)*t,oy+(ny-oy)*t,minDist))return false;}return true;
}
function clampVisualSegment(g,id,ox,oy,nx,ny){return [nx,ny,1];}

function updateVisuals(g, dt) {
    g.pileFlowClock=(g.pileFlowClock||0)+dt;
    const alive=new Set();
    for(let y=ROWS-1;y>=0;y--)for(let x=0;x<W2;x++){
        const cell=valid(x,y)?g.board[y][x]:null;if(!cell)continue;
        alive.add(cell.id);
        let v=g.vis.get(cell.id);
        if(!v){
            const first=Array.isArray(cell.fallPath)&&cell.fallPath.length?cell.fallPath[0]:null;
            v={x:first?.from?.[0]??x,y:first?.from?.[1]??y,vy:0,sq:0,motionSpeed:0};g.vis.set(cell.id,v);
        }
        if(Array.isArray(cell.fallPath)&&cell.fallPath.length){
            updateScheduledPileFlowVisual(g,cell,v,dt);
        }else{
            // Logical and visual states coincide at rest. No easing tail and no upward repair.
            v.x=x;v.y=y;v.vy=0;v.motionSpeed=0;
        }
        v.sq=(v.sq||0)-(v.sq||0)*Math.min(1,16*dt);
    }
    for(const id of Array.from(g.vis.keys()))if(!alive.has(id))g.vis.delete(id);
    if(g.rotAnim.p<1)g.rotAnim.p=Math.min(1,g.rotAnim.p+dt/ROTATE_VISUAL_TIME);
    if(g.piece){
        if(g.freeX!=null)g.pieceVX=g.freeX;
        else{
            const dx=g.piece.x-g.pieceVX;
            if(Math.abs(dx)<=PIECE_SNAP_SPEED*dt)g.pieceVX=g.piece.x;
            else g.pieceVX+=Math.sign(dx)*PIECE_SNAP_SPEED*dt;
        }
        g.pieceVY+=(g.piece.y-g.pieceVY)*Math.min(1,18*dt);
    }
}

function preventVisualOverlap(g) {
    const items=[];
    for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
        const c=valid(x,y)?g.board[y][x]:null;
        if(!c)continue;
        const v=g.vis.get(c.id);
        if(v)items.push({id:c.id,tx:x,ty:y,v});
    }

    const MIN=1.0005;
    const H=HEX_ROW_H;
    const floorMax=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/H;

    // Position-based collision constraints.
    // Horizontal separation is preferred because it never creates a visual "hop".
    // Gaps are allowed; penetration is not.
    for(let pass=0;pass<32;pass++){
        let changed=false;

        for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
            const a=items[i],b=items[j];
            let dx=(a.v.x-b.v.x)*0.5;
            let dy=(a.v.y-b.v.y)*H;
            let d=Math.hypot(dx,dy);
            if(d>=MIN-1e-7)continue;

            changed=true;
            const overlap=MIN-d;

            // If horizontal component exists, separate along horizontal component only.
            // This preserves gravity direction and cannot lift either ball.
            if(Math.abs(dx)>1e-5){
                const dir=Math.sign(dx);
                // Each visual moves half the missing real distance.
                const gridShift=overlap; // normalized half-shift / 0.5 => overlap
                a.v.x+=dir*gridShift;
                b.v.x-=dir*gridShift;
            }else{
                // Same X: deterministic left/right split by id.
                const dir=(a.id<b.id)?-1:1;
                const gridShift=overlap+0.0005;
                a.v.x+=dir*gridShift;
                b.v.x-=dir*gridShift;
            }

            // Position projection is a collision correction, not a stop event.
            // Keep both balls' incoming momentum while either is still in motion.
            if (!(g._visualMovingIds && g._visualMovingIds.has(a.id))) {
                a.v.vy=0; a.v.motionSpeed=0;
            }
            if (!(g._visualMovingIds && g._visualMovingIds.has(b.id))) {
                b.v.vy=0; b.v.motionSpeed=0;
            }
        }

        if(!changed)break;
    }

// Visual-path deadlock recovery shared by player and CPU.
// The logical board is already a legal, non-overlapping lattice state; if rendering cannot
// consume its path, discard only the stale visual route and snap visuals to that exact state.
// This prevents one side from freezing forever without changing game physics or board results.
function pendingFallPathCount(g) {
    let n = 0;
    for (let y=0;y<ROWS;y++) for (let x=0;x<W2;x++) {
        const c = valid(x,y) ? g.board[y][x] : null;
        if (c && Array.isArray(c.fallPath)) n += c.fallPath.length;
    }
    return n;
}

function forceSyncVisualsToLogical(g, reason = "SETTLE_WATCHDOG") {
    // 最終安全弁でも瞬間ワープさせない。
    // staleなfallPathだけ捨て、現在の表示位置は保持する。
    // 次のupdateVisualsで合法な論理セルへ重力/一定速横補正で自然に追いつかせる。
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < W2; x++) {
        const cell = valid(x, y) ? g.board[y][x] : null;
        if (!cell) continue;
        if (Array.isArray(cell.fallPath)) delete cell.fallPath;
        let v = g.vis.get(cell.id);
        if (!v) {
            v = { x, y, vy: 0, sq: 0 };
            g.vis.set(cell.id, v);
        }
        delete v._segKey;
        delete v._segP;
        delete v.garbAnim;
        // x/yは変更しない。重力に逆らう上方向snapは禁止。
    }
                    if (!g.physicsWatch) g.physicsWatch = { lastSig: "", repeats: 0, steps: 0, fallbacks: 0 };
    g.physicsWatch.fallbacks = (g.physicsWatch.fallbacks || 0) + 1;
    g.physicsWatch.lastReason = reason;
    g.ver++;
}

/* tol = 0 で完全一致、0.4 程度なら「だいたい追いついた」判定 */
function nearlySettled(g, tol) {
    for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < W2; x++) {
            const cell = valid(x, y) ? g.board[y][x] : null;
            if (!cell)
                continue;
            const v = g.vis.get(cell.id);
            if (Array.isArray(cell.fallPath) && cell.fallPath.length) return false;
            if (v && (Math.abs(v.y - y) > tol || Math.abs(v.x - x) > tol)) return false;
        }
    return true;
}
const SETTLE_TOL = 0.34;

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
            if(!g._settleCompiled){
                prepareContinuousPileFlow(g,'settle_phase');
            }
            // Logical collapse is already complete.  Only its continuous render
            // trajectory remains; no additional settle wave is generated here.
            if(pendingFallPathCount(g)>0 || !nearlySettled(g,SETTLE_TOL)){
                g.stateT=0;
                return;
            }
            // A last same-frame verification is allowed, but if motion exists it
            // is compiled all the way to stability immediately, never one cell/wave.
            if(hasLegalGravityMove(g.board)){
                const flow=prepareContinuousPileFlow(g,'settle_verify');
                if(flow.moved){g.stateT=0;return;}
            }
            normalizeAllNonActivePileBalls(g);
            g._settleCompiled=false;
            g.phase='CHECK';g.stateT=0;
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
            if (!g.clearing) { g._settleCompiled=false; g.phase = "SETTLE"; g.stateT = 0; return; }

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
                // 既に0.6秒間隔で開始済みなのに接触確定だけが詰まったセットを、1セットだけ救済する。
                const stuckPlan=g.garbagePlans.find(p=>!p.landed && p._started);
                if (stuckPlan) {
                    materializeGarbagePack(g,stuckPlan);
                    stuckPlan.landed=true;
                }
                if (g.garbLeft>0 && g.garbageClock + 1e-9 >= g.garbageNextBallAt) {
                    // 旧数値互換おじゃまの救済も1回につき1球だけ投入する。
                    const placed=garbageBall(g);
                    if (placed) {
                        g.garbLeft-=1;
                        g.garbageNextBallAt=g.garbageClock+GARBAGE_PACK_INTERVAL;
                        prepareContinuousPileFlow(g,"garbage_watchdog");
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
        if (g.hardDropAnim) {
            g.hardDropAnim.t += dt;
            if (g.hardDropAnim.t >= g.hardDropAnim.dur) {
                g.piece = {...g.hardDropAnim.target};
                g.hardDropAnim = null;
                lock(g,5);
            }
            return;
        }
        // 高速落下は「通常落下時計 dropT の進み」だけを速くする。
        // interval自体は常に同じなので、ON/OFF時に落下進捗率が再解釈されず、
        // 球が沈む/浮く/上へ戻る現象を構造的に防ぐ。
        const iv = g.dropInterval;
        const dropTimeScale = g.fastForward ? FAST_DROP_MULTIPLIER : 1;
        g.dropT += dt * dropTimeScale;
        while (g.dropT >= iv) {
            g.dropT -= iv;
            if (pieceFits(g.board, { ...g.piece, y: g.piece.y + 2 })) {
                g.piece = { ...g.piece, y: g.piece.y + 2 };
                g.lockT = 0;
            }
            else
                break;
        }
        if (!pieceFits(g.board, { ...g.piece, y: g.piece.y + 2 })) {
            g.dropT = 0;
            // 本家寄せ:
            // 操作中ピースだけを「剛体のまま1フレーム単位で斜面移動」させない。
            // 接触後は短いロック猶予だけを置き、盤面球へ移行した直後から
            // 通常球と同じ重力・円弧スライド・分裂へ一本化する。
                                    g.lockT += dt;
            if (g.lockT >= CONTACT_LOCK_DELAY)
                lock(g, 3);
        } else {
            g.lockT = 0;
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

const toColors = (b) => b.map((r) => r.map((v) => getC(v)));
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
                    if (valid(nx, ny) && !seen[ny][nx] && b[ny][nx] === c) {
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
    const b = cb.map((r) => r.slice());
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
const ME = { D: 44, X: 178, Y: 86 };
const FOE = { D: 29, X: 822, Y: 86 }; // opponent board +20.8% for better battle readability
ME.BW = ME.D * 12;
ME.BH = ME.D * BOARD_FLOOR_N;
FOE.BW = FOE.D * 12;
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

/* =============================================================
 * ボール描画
 *   旧HEXDROPのPNGボール画像（赤・青・緑・黄・紫）を復元。
 *   画像はブラウザがデコード・キャッシュし、毎フレームはdrawImageのみ。
 * ============================================================= */
const BALL_SRC = [
    "assets/ball-red.png",
    "assets/ball-blue.png",
    "assets/ball-green.png",
    "assets/ball-yellow.png",
    "assets/ball-purple.png",
];
const BALL_IMG = BALL_SRC.map((src) => {
    if (typeof Image === "undefined") return null;
    const im = new Image();
    im.decoding = "async";
    im.src = src;
    return im;
});
const imgReady = (i) => {
    const im = BALL_IMG[i];
    return !!(im && im.complete && im.naturalWidth > 0);
};
function drawBall(ctx, cx, cy, d, ci, o = {}) {
    const { alpha = 1, scale = 1, sq = 0, aura = 0, ring = 0 } = o;
    const w = d * scale * (1 + sq * 0.45);
    const h = d * scale * (1 - sq * 0.6);
    if (w <= 1.2 || alpha <= 0.01) return;
    const col = COLORS[ci];
    ctx.save();
    ctx.globalAlpha = alpha;
    const yShift = (w - h) * 0.5;
    if (aura > 0) {
        ctx.globalAlpha = alpha * 0.5 * aura;
        const R = w * (1.05 + aura * 0.35);
        const ag = ctx.createRadialGradient(cx, cy, w * 0.3, cx, cy, R);
        ag.addColorStop(0, col.glow + "aa");
        ag.addColorStop(0.5, col.glow + "44");
        ag.addColorStop(1, col.glow + "00");
        ctx.fillStyle = ag;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
        ctx.globalAlpha = alpha;
    }
    if (imgReady(ci)) {
        ctx.drawImage(BALL_IMG[ci], cx - w / 2, cy - h / 2 + yShift, w, h);
    } else {
        const g = ctx.createRadialGradient(cx - w * 0.17, cy - h * 0.2, w * 0.03, cx, cy, w * 0.55);
        g.addColorStop(0, col.hi); g.addColorStop(0.4, col.base); g.addColorStop(1, col.lo);
        ctx.beginPath(); ctx.ellipse(cx, cy + yShift, w / 2, h / 2, 0, 0, TAU);
        ctx.fillStyle = g; ctx.fill();
    }
    if (ring > 0) {
        ctx.globalAlpha = alpha * ring * 0.75;
        ctx.beginPath(); ctx.ellipse(cx, cy + yShift, w * 0.6, h * 0.6, 0, 0, TAU);
        ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = w * 0.14; ctx.stroke();
    }
    ctx.restore();
}

function rigidShadowPixelPlacement(g, shadowCells, pos, D, X, Y, BW, BH) {
    if(!shadowCells||!shadowCells.length)return [];
    const pts=shadowCells.map(([sx,sy,sc])=>{const [px,py]=pos(sx,sy);return {px,py,sc};});
    const floorCenter=Y+BH-D*0.5;
    let dy=0;
    const deepest=Math.max(...pts.map(p=>p.py));
    if(deepest+dy>floorCenter)dy=floorCenter-deepest;
    for(let pass=0;pass<4;pass++){
        let changed=false;
        for(const gp of pts){
            const gx=gp.px,gy=gp.py+dy;
            for(let by=0;by<ROWS;by++)for(let bx=0;bx<W2;bx++){
                if(!valid(bx,by))continue;
                const cell=g.board[by][bx];if(!cell)continue;
                const vv=g.vis.get(cell.id)||{x:bx,y:by};
                const [bpX,bpY]=pos(vv.x,vv.y);
                const dx=Math.abs(gx-bpX);if(dx>=D-1e-6)continue;
                const vert=Math.sqrt(Math.max(0,D*D-dx*dx));
                const ceiling=bpY-vert;
                if(gy>ceiling+1e-6){dy-=gy-ceiling;changed=true;}
            }
        }
        if(!changed)break;
    }
    const finalDeepest=Math.max(...pts.map(p=>p.py+dy));
    if(finalDeepest>floorCenter)dy-=finalDeepest-floorCenter;
    return pts.map(p=>[p.px,p.py+dy,p.sc]);
}
function drawLandingShadowBall(ctx, cx, cy, d, ci) {
    drawBall(ctx, cx, cy, d, ci, {alpha:0.28,scale:1.0,aura:0,ring:0,sq:0});
}
let STATIC_BG_CANVAS=null;
function getStaticBackgroundCanvas(){
    if(STATIC_BG_CANVAS)return STATIC_BG_CANVAS;
    if(typeof document==="undefined")return null;
    const cv=document.createElement("canvas");
    cv.width=VW;cv.height=VH;
    const c=cv.getContext("2d");
    const g=c.createLinearGradient(0,0,0,VH);
    g.addColorStop(0,"#080617");g.addColorStop(0.55,"#100B2B");g.addColorStop(1,"#060512");
    c.fillStyle=g;c.fillRect(0,0,VW,VH);
    for(const [x,y,col,r] of [[280,200,"#3C1D7A",380],[1000,260,"#0E5A7A",320],[560,660,"#7A1E58",400]]){
        const rg=c.createRadialGradient(x,y,0,x,y,r);rg.addColorStop(0,col+"55");rg.addColorStop(1,col+"00");c.fillStyle=rg;c.fillRect(x-r,y-r,r*2,r*2);
    }
    STATIC_BG_CANVAS=cv;return cv;
}
function drawBackground(ctx,t){
    const bg=getStaticBackgroundCanvas();if(bg)ctx.drawImage(bg,0,0,VW,VH);else{ctx.fillStyle="#080617";ctx.fillRect(0,0,VW,VH);}
    for(const s of STARS){ctx.globalAlpha=s.a*(0.55+0.45*Math.sin(t*1.6+s.p));ctx.fillStyle="#EAF3FF";ctx.fillRect(s.x,s.y,s.s,s.s);}
    ctx.globalAlpha=1;
}
function safeActiveFallOffset(g, cells, dx, dOff, desired) {
    if (!g || !g.board) return desired;
    const H = HEX_ROW_H;
    let safe = desired;
    const R = 0.998;
    for (let i = 0; i < cells.length; i++) {
        const ax = (cells[i][0] + dx) * 0.5;
        const ay0 = (cells[i][1] + dOff) * H;
        for (let by = 0; by < ROWS; by++) for (let bx = 0; bx < W2; bx++) {
            const bc = valid(bx, by) ? g.board[by][bx] : null;
            if (!bc) continue;
            const bv = g.vis.get(bc.id);
            const bxx = ((bv ? bv.x : bx) * 0.5);
            const byy = ((bv ? bv.y : by) * H);
            const hx = Math.abs(ax - bxx);
            if (hx >= R) continue;
            const vertical = Math.sqrt(Math.max(0, R * R - hx * hx));
            const ceilingY = byy - vertical;
            const off = (ceilingY - ay0) / H;
            if (off < safe) safe = off;
        }
    }
    return Math.max(0, Math.min(desired, safe));
}

function drawSide(ctx, g, L, side, t, label, sub, big, renderLead=0) {
    const { D, X, Y, BW, BH } = L;
    const ox = X + D / 2, oy = Y + D / 2;
    const pos = (x, y) => [ox + x * D * 0.5, oy + y * D * HEX_ROW_H];
    const renderPileMemo=renderLead>1e-7?new Map():null;
    ctx.save();
    ctx.save();
    ctx.shadowColor = "#FFFFFF";
    ctx.shadowBlur = 12;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = big ? 3.5 : 2;
    ctx.beginPath();
    ctx.moveTo(X - 4, Y - 10);
    ctx.lineTo(X + BW + 4, Y - 10);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(X, Y, BW, BH);
    ctx.fillStyle = "rgba(10,8,26,0.5)";
    ctx.fill();
    ctx.shadowColor = NEON[side];
    ctx.shadowBlur = 18;
    ctx.strokeStyle = NEON[side];
    ctx.lineWidth = big ? 3 : 2;
    ctx.stroke();
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.restore();
    if (g.fx.warn > 0) {
        ctx.save();
        ctx.globalAlpha = g.fx.warn * (0.22 + 0.18 * Math.sin(t * 9));
        const wg = ctx.createLinearGradient(0, Y, 0, Y + BH * 0.45);
        wg.addColorStop(0, "#FF3B4E");
        wg.addColorStop(1, "#FF3B4E00");
        ctx.fillStyle = wg;
        ctx.fillRect(X, Y, BW, BH * 0.45);
        ctx.restore();
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(X, Y - 2, BW, BH + 2);
    ctx.clip();
    if (Array.isArray(g.activeGarbagePacks)) {
        for (const pack of g.activeGarbagePacks) {
            if (!pack || pack.landed || !pack._started) continue;
            for (let i=0;i<pack.pat.length;i++) {
                const [dx,dy]=pack.pat[i];
                const [px,py]=pos(pack.ax+dx, pack.y+dy);
                drawBall(ctx,px,py,D,pack.colors[i],{alpha:1,scale:1,sq:0,ring:0});
            }
        }
    }
    for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < W2; x++) {
            const cell = valid(x, y) ? g.board[y][x] : null;
            if (!cell) continue;
            const v = g.vis.get(cell.id) || { x, y, sq: 0 };
            let drawVX=v.x, drawVY=v.y;
            if(renderPileMemo && v.pileFlow && Array.isArray(cell.fallPath)){
                const rp=pileFlowPositionAt(g,cell,(g.pileFlowClock||0)+renderLead,0,null,renderPileMemo);
                if(Number.isFinite(rp?.[0])&&Number.isFinite(rp?.[1])){drawVX=rp[0];drawVY=Math.max(v.y,rp[1]);}
            }
            let alpha = 1, scale = 1, ring = 0;
            if (g.clearing && g.clearing.ids.has(cell.id)) {
                const k = Math.min(1, g.stateT / g.holdT);
                const cv = clearVisualState(k);scale = cv.scale;alpha = cv.alpha;ring = 1;
            }
            const [px, py] = pos(drawVX, drawVY);
            drawBall(ctx, px, py, D, cell.c, { alpha, scale, sq: v.sq, ring });
        }
    if (g.clearing && g.clearing.committed && Array.isArray(g.clearing.ghosts)) {
        const k = Math.min(1, g.stateT / Math.max(0.001, g.holdT));
        const cv = clearVisualState(k);
        for (const gh of g.clearing.ghosts) {const [px,py] = pos(gh.x, gh.y);drawBall(ctx, px, py, D, gh.c, {alpha:cv.alpha, scale:cv.scale, sq:0, ring:1});}
    }
    for (const s of g.fx.sparks) {
        const k = Math.max(0, s.life / s.max);const [px, py] = pos(s.x, s.y);ctx.globalAlpha = k;ctx.beginPath();ctx.arc(px, py, D * 0.1 * (0.4 + k), 0, TAU);ctx.fillStyle = COLORS[s.c].glow;ctx.fill();ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (g.state === "GAMEOVER") {
        ctx.save();ctx.shadowColor = "#FF3B4E";ctx.shadowBlur = big ? 22 : 14;ctx.strokeStyle = "rgba(255,59,78,0.98)";ctx.lineWidth = big ? 5 : 3;ctx.beginPath();ctx.moveTo(X - 7, Y - 10);ctx.lineTo(X + BW + 7, Y - 10);ctx.stroke();ctx.restore();
        if (Array.isArray(g.gameOverOverflow)) for (const item of g.gameOverOverflow) {const [x, y, c] = item;const [px, py] = pos(x, y);drawBall(ctx, px, py, D, c, { alpha: 1, scale: 1, sq: 0, ring: 1 });}
        ctx.save();ctx.textAlign = "center";ctx.textBaseline = "middle";ctx.font = `900 ${big ? 20 : 12}px ui-sans-serif, system-ui`;ctx.fillStyle = "#FFD9DE";ctx.shadowColor = "#FF3B4E";ctx.shadowBlur = 18;ctx.fillText("LIMIT OVER", X + BW / 2, Y + (big ? 18 : 11));ctx.restore();
    }
    if (g.state === "PLAYING" && g.piece) {
        const shadowCells = landingShadowVisualCells(g);
        if (shadowCells) {const safeShadowPx=rigidShadowPixelPlacement(g,shadowCells,pos,D,X,Y,BW,BH);for(const [spx,spy,sc] of safeShadowPx) drawLandingShadowBall(ctx,spx,spy,D,sc);}
    }
    if (g.state === "PLAYING" && g.piece) {
        const dx = g.pieceVX - g.piece.x;const pulse = 0.75 + 0.25 * Math.sin(t * 7);const cells = pieceCells(g.piece);const dOff = dispOff(g.piece.rot);let frac;
        if(g.hardDropAnim){const hk=Math.min(1,(g.hardDropAnim.t+renderLead)/Math.max(.001,g.hardDropAnim.dur));const vy=g.hardDropAnim.fromY+(g.hardDropAnim.target.y-g.hardDropAnim.fromY)*hk;frac=vy-g.piece.y;}else{const rawFrac=activeDropFraction(g,renderLead);frac=safeActiveFallOffset(g,cells,dx,dOff,rawFrac);}
        const pts = cells.map(([x, y]) => pos(x + dx, y + frac + dOff));
        const gx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;const gy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
        const ra = g.rotAnim;const renderRotP=Math.min(1,ra.p+renderLead/ROTATE_VISUAL_TIME);const k = renderRotP < 1 ? 1 - smoothRotationT(renderRotP) : 0;const ang = -k * ra.dir * (TAU / 6);const ca = Math.cos(ang), sa = Math.sin(ang);const ox2 = k * (ra.dx || 0) * D * 0.5;const oy2 = k * (ra.dy || 0) * D * HEX_ROW_H;
        const renderPts = pts.map((pt) => {let px = pt[0], py = pt[1];if (k) {const ax = px - gx, ay = py - gy;px = gx + ax * ca - ay * sa + ox2;py = gy + ax * sa + ay * ca + oy2;}return [px, py];});
        const lift=0;
        if(g.hardDropAnim) for(let tr=1;tr<=4;tr++){const a=(5-tr)/5, trailY=D*(.30+tr*.24);renderPts.forEach((pt,i)=>drawBall(ctx,pt[0],pt[1]+lift-trailY,D,cells[i][2],{alpha:.07*a,scale:.96,aura:0}));}
        renderPts.forEach((pt, i) => drawBall(ctx, pt[0], pt[1] + lift, D, cells[i][2], { aura: pulse * (big ? 1 : 0.5) }));
    }
    for (const r of g.fx.rings) {const k = 1 - r.life / r.max;ctx.save();ctx.globalAlpha = (1 - k) * 0.85;ctx.strokeStyle = r.tint;ctx.lineWidth = 7 * (1 - k) + 1;ctx.shadowColor = r.tint;ctx.shadowBlur = 26;ctx.beginPath();ctx.arc(X + BW / 2, Y + BH / 2, 24 + k * BW * 0.8, 0, TAU);ctx.stroke();ctx.restore();}
    const nw = big ? 128 : 72, nh = big ? 106 : 60;const nx0 = big ? X - nw - 26 : X + BW + 14, ny0 = Y;
    ctx.save();ctx.strokeStyle = "rgba(255,255,255,0.5)";ctx.lineWidth = 2;ctx.fillStyle = "rgba(255,255,255,0.05)";ctx.beginPath();ctx.rect(nx0, ny0, nw, nh);ctx.fill();ctx.stroke();
    const nd = big ? 42 : 23, ncx = nx0 + nw / 2, ncy = ny0 + nh / 2, q = g.queue[0];
    if (q) {drawBall(ctx, ncx - nd * 0.5, ncy - nd * 0.42, nd, q[0], {});drawBall(ctx, ncx + nd * 0.5, ncy - nd * 0.42, nd, q[1], {});drawBall(ctx, ncx, ncy + nd * 0.42, nd, q[2], {});}
    ctx.font = `800 ${big ? 17 : 12}px ui-sans-serif, system-ui, sans-serif`;ctx.fillStyle = "rgba(255,255,255,0.78)";ctx.textAlign = "center";ctx.textBaseline = "top";ctx.fillText("NEXT", ncx, ny0 + nh + 7);ctx.restore();
    ctx.save();ctx.font = `700 ${big ? 20 : 15}px ui-sans-serif, system-ui, sans-serif`;ctx.textAlign = "left";ctx.textBaseline = "alphabetic";ctx.fillStyle = "rgba(255,255,255,0.85)";ctx.fillText(label, X, Y - 26);
    if (pendingIncomingCount(g) > 0) {ctx.font = `800 ${big ? 26 : 18}px ui-sans-serif, system-ui, sans-serif`;ctx.textAlign = "right";ctx.shadowColor = "#FF3B4E";ctx.shadowBlur = 18;ctx.fillStyle = "#FF6272";ctx.fillText("▼ " + pendingIncomingCount(g), X + BW, Y - 26);}
    ctx.restore();
    for (const t2 of g.fx.toasts) {const k = t2.life / t2.max;const size = (big ? 28 : 16) + t2.big * (big ? 38 : 18);ctx.save();ctx.globalAlpha = Math.min(1, k * 2.4);ctx.font = `800 ${size * (1 + (1 - k) * 0.15)}px ui-sans-serif, system-ui, sans-serif`;ctx.textAlign = "center";ctx.textBaseline = "middle";ctx.shadowColor = t2.tint;ctx.shadowBlur = 24;ctx.fillStyle = "#FFFFFF";ctx.fillText(t2.text, X + BW / 2, Y + BH * (t2.sub ? 0.58 : 0.44) - (1 - k) * 26);ctx.restore();}
    if (g.state === "READY") {ctx.save();ctx.font = `800 ${big ? 48 : 26}px ui-sans-serif, system-ui, sans-serif`;ctx.textAlign = "center";ctx.textBaseline = "middle";ctx.shadowColor = NEON[side];ctx.shadowBlur = 20;ctx.fillStyle = "#FFFFFF";ctx.fillText(g.stateT < 0.55 ? "READY" : "GO!", X + BW / 2, Y + BH / 2);ctx.restore();}
    ctx.restore();
}
function renderScene(ctx, me, foe, orbs, t, labels, dropFlash, helpAlpha = 1, renderLead=0) {drawBackground(ctx, t);drawSide(ctx, me, ME, 0, t, labels.me, labels.meSub, true,renderLead);drawSide(ctx, foe, FOE, 1, t, labels.foe, labels.foeSub, false,renderLead);}
const SPACE_BG = "radial-gradient(1000px 500px at 20% 15%, #3C1D7A55, transparent 60%)," + "radial-gradient(900px 500px at 85% 30%, #0E5A7A55, transparent 60%)," + "radial-gradient(900px 600px at 50% 100%, #7A1E5844, transparent 60%)," + "linear-gradient(180deg,#080617 0%,#100B2B 55%,#060512 100%)";
function Neon({ children, onClick, tone = "cyan", disabled }) {
    const c = tone === "cyan" ? "#2FE3F5" : tone === "pink" ? "#FF3EA5" : "#B9C4E8";const [hover, setHover] = useState(false);const [down, setDown] = useState(false);
    return (React.createElement("button", { onClick: onClick, disabled: disabled, onPointerEnter: () => setHover(true), onPointerLeave: () => { setHover(false); setDown(false); }, onPointerDown: () => setDown(true), onPointerUp: () => setDown(false), className: "w-full rounded-2xl py-3.5 font-extrabold tracking-wide disabled:opacity-30 relative overflow-hidden", style: {color:c,border:`1.5px solid ${c}${hover ? "" : "aa"}`,background:`linear-gradient(160deg, rgba(255,255,255,${hover ? 0.13 : 0.07}), rgba(255,255,255,0.02))`,backdropFilter:"blur(14px)",WebkitBackdropFilter:"blur(14px)",boxShadow:down?`0 0 10px ${c}44, inset 0 2px 10px rgba(0,0,0,.45)`:`0 8px 22px rgba(0,0,0,.45), 0 0 ${hover ? 30 : 16}px ${c}55, inset 0 1px 0 rgba(255,255,255,.28)`,textShadow:`0 0 14px ${c}cc`,transform:down?"translateY(2px) scale(.985)":hover?"translateY(-1px)":"none",transition:"transform .12s cubic-bezier(.2,.8,.3,1), box-shadow .18s ease, background .18s ease"} }, children));
}
function Screen({ children, title, back }) {
    const [shown, setShown] = useState(false);useEffect(() => { const t = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(t); }, []);
    return (React.createElement("div", { className: "absolute inset-0 z-20 flex flex-col items-center justify-center font-sans overflow-y-auto", style: {background:SPACE_BG,opacity:shown?1:0,transform:shown?"none":"scale(1.015)",transition:"opacity .28s ease, transform .28s cubic-bezier(.2,.8,.3,1)",paddingTop:"max(20px, env(safe-area-inset-top))",paddingBottom:"max(20px, env(safe-area-inset-bottom))",paddingLeft:"max(20px, env(safe-area-inset-left))",paddingRight:"max(20px, env(safe-area-inset-right))"} },React.createElement("div", { className: "w-full max-w-sm flex flex-col" },(title || back) && (React.createElement("div", { className: "flex items-center gap-3 mb-5" },back && React.createElement("button", { onClick: back, className: "w-9 h-9 rounded-xl text-white/70 border border-white/20 bg-white/5" }, "←"),React.createElement("div", { className: "font-extrabold text-white/90 tracking-wide" }, title))),children)));
}
const FIREBASE_CONFIG = {apiKey:"AIzaSyAanVETIredUVH1slS8OtIMSPdOn91u2HM",authDomain:"ballpuzzle-8cc87.firebaseapp.com",databaseURL:"https://ballpuzzle-8cc87-default-rtdb.asia-southeast1.firebasedatabase.app",projectId:"ballpuzzle-8cc87",storageBucket:"ballpuzzle-8cc87.firebasestorage.app",messagingSenderId:"114162791129",appId:"1:114162791129:web:14a0fc04ca3c6f5d9f84c8"};
const BANDW = 150, STALE_MS = 20000, WAIT_MS = 1600, SNAP_MS = 200, GRACE_MS = 5000;
const bandOf = (r) => Math.max(0, Math.min(19, Math.floor(r / BANDW)));
const eloDelta = (mine, foe, win) => Math.round(32 * ((win ? 1 : 0) - 1 / (1 + Math.pow(10, (foe - mine) / 400))));
const VALID_CELLS = (() => {const a = [];for (let y = 0; y < ROWS; y++) for (let x = 0; x < W2; x++) if (valid(x, y)) a.push([x, y]);return a;})();
function snapshotOf(g) {let s = "";for (const [x, y] of VALID_CELLS) {const c = g.board[y][x];s += String.fromCharCode(48 + (c ? c.c + 1 : 0));}return s;}
function applySnapshot(g, str) {if (typeof str !== "string" || str.length !== VALID_CELLS.length)return;for (let i = 0; i < VALID_CELLS.length; i++) {const [x, y] = VALID_CELLS[i], v = str.charCodeAt(i) - 48;const cur = g.board[y][x];if (v <= 0) {if (cur) g.board[y][x] = null;continue;}const c = v - 1;if (cur && cur.c === c)continue;const b = mkBall(g, c);g.board[y][x] = b;setVis(g, b, x, y, 0);}}
function stepNetView(g, dt) {g.stateT += dt;g.fx.shake = 0;g.fx.warn = pendingIncomingCount(g) > 0 ? Math.min(1, g.fx.warn + dt * 4) : Math.max(0, g.fx.warn - dt * 4);g.fx.fastPulse = Math.max(0, (g.fx.fastPulse || 0) - dt * 7);g.fx.toasts = g.fx.toasts.filter((t) => (t.life -= dt) > 0);g.fx.rings = g.fx.rings.filter((r) => (r.life -= dt) > 0);g.fx.sparks = g.fx.sparks.filter((s) => { s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 12 * dt; return s.life > 0; });for (let _vs = 0; _vs < 4; _vs++) updateVisuals(g, dt * 0.25);if (!g.alive)g.fx.sink = 0;}

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
        const stateRef = F.ref(this.db, base + "/state/" + foeIndex);F.onValue(stateRef, (s) => {const v = s.val();if (!v) return;if (events.onOpponentState) events.onOpponentState({ board: v.board, incoming: v.incoming || 0, alive: v.alive !== false });});refs.push(stateRef);
        const atkRef = F.ref(this.db, base + "/attacks/" + myIndex);const seen = {};F.onValue(atkRef, (s) => {const v = s.val() || {};for (const k in v) {if (seen[k]) continue;seen[k] = 1;if (events.onAttack) events.onAttack({ n: v[k].n || 0, shapes: Array.isArray(v[k].shapes) ? v[k].shapes.filter((w) => WAZA[w]) : [] });}});refs.push(atkRef);
        const foeConnRef = F.ref(this.db, base + "/players/" + foeIndex + "/connected");F.onValue(foeConnRef, (s) => {const c = s.val() === true;if (events.onConnection) events.onConnection(c);if (discTimer) {clearTimeout(discTimer);discTimer = null;}if (!c && !finished) discTimer = setTimeout(() => { if (!finished) handle.reportResult(true, "disconnect"); }, GRACE_MS);});refs.push(foeConnRef);
        const resRef = F.ref(this.db, base + "/result");F.onValue(resRef, (s) => {const v = s.val();if (!v || finished) return;const mine = v[myIndex], theirs = v[foeIndex];if (mine) {finished = true;if (events.onFinish) events.onFinish(mine.win, mine.reason);} else if (theirs) {finished = true;if (events.onFinish) events.onFinish(!theirs.win, theirs.reason);}});refs.push(resRef);
        const self = this;const flush = () => {if (!pending) return;const p = pending;pending = null;lastSent = Date.now();F.set(F.ref(self.db, base + "/state/" + myIndex), { board: p.b, incoming: p.inc, alive: p.alive, ts: Date.now() }).catch(() => { });};
        const handle = {matchId, seed: m.meta.seed, myIndex, ranked: m.meta.ranked !== false, events,opponent: { uid: foe.uid, name: foe.name, rating: foe.rating },
            sendBoard(board, incoming, alive) {pending = { b: board, inc: incoming, alive };const wait = SNAP_MS - (Date.now() - lastSent);if (wait <= 0) flush();else if (!timer) timer = setTimeout(() => { timer = null; flush(); }, wait);},
            sendAttack(n, shapes = []) {if (n > 0 || shapes.length) F.push(F.ref(self.db, base + "/attacks/" + foeIndex), { n, shapes, ts: Date.now() }).catch(() => { });},
            async reportResult(win, reason) {if (finished) return;finished = true;await F.set(F.ref(self.db, base + "/result/" + myIndex), { win, reason, ts: Date.now() }).catch(() => { });if (events.onFinish) events.onFinish(win, reason);},
            leave() {finished = true;if (discTimer) clearTimeout(discTimer);if (timer) clearTimeout(timer);for (const r of refs) F.off(r);F.set(connRef, false).catch(() => { });}}
        ;return handle;
    },
    async applyRating(win, foeRating, ranked) {const delta = ranked === false ? 0 : eloDelta(this.profile.rating, foeRating, win);this.profile.rating = Math.max(0, this.profile.rating + delta);this.profile.wins += win ? 1 : 0;this.profile.losses += win ? 0 : 1;if (this.fb && this.uid) {const F = this.fb;await F.update(F.ref(this.db, "users/" + this.uid), {rating: this.profile.rating, wins: this.profile.wins,losses: this.profile.losses, updatedAt: F.serverTimestamp()}).catch(() => { });await F.set(F.ref(this.db, "leaderboard/" + this.uid), { name: this.profile.name, rating: this.profile.rating }).catch(() => { });}return delta;}
};

function App() {
var _a, _b, _c, _d, _e, _f, _g, _h;
const [screen, setScreen] = useState("HOME");
const [rating, setRating] = useState(1000);
const [record, setRecord] = useState({ w: 0, l: 0 });
const [sound, setSound] = useState(true);
const [haptics, setHaptics] = useState(true);
const [offset, setOffset] = useState(false);
const [mode, setMode] = useState(null);
const [aiLevel, setAiLevel] = useState(1);
const [opp, setOpp] = useState(null);
const [room, setRoom] = useState("");
const [result, setResult] = useState(null);
const [portrait, setPortrait] = useState(false);
const [, force] = useState(0);
const meRef = useRef(null), foeRef = useRef(null), cvRef = useRef(null);
const orbsRef = useRef([]), runRef = useRef(false), dropFlashRef = useRef(0);
const helpRef = useRef({ alpha: (() => { try { return localStorage.getItem("hexdrop_controls_seen") === "1" ? 0 : 1; } catch (_) { return 1; } })(), count: 0, fading: false, forced: 0 });
const matchRef = useRef(null), reportedRef = useRef(false);
const sizeRef = useRef({ scale: 0, dpr: 1, rect: null });
const [netErr, setNetErr] = useState(null);
const [foeConn, setFoeConn] = useState(true);
const stateRef = useRef({ mode, opp, rating });stateRef.current = { mode, opp, rating };
const optRef = useRef({ offset });optRef.current = { offset };
const noteControl = useCallback(() => {const h = helpRef.current;h.count++;if (h.count >= 4 && !h.fading) {h.fading = true;try { localStorage.setItem("hexdrop_controls_seen", "1"); } catch (_) { }}}, []);
useEffect(() => { Sfx.enabled = sound; }, [sound]);
useEffect(() => { Sfx.haptics = haptics; }, [haptics]);
useEffect(() => {const cv = cvRef.current;if (!cv)return;const measure = () => {const r = cv.getBoundingClientRect();sizeRef.current = {scale: r.width > 0 ? r.width / VW : 0,dpr: Math.min(2, window.devicePixelRatio || 1),rect: r};};measure();const ro = new ResizeObserver(measure);ro.observe(cv);window.addEventListener("orientationchange", measure);window.addEventListener("scroll", measure, { passive: true });return () => { ro.disconnect(); window.removeEventListener("orientationchange", measure); window.removeEventListener("scroll", measure); };}, []);
useEffect(() => {const check = () => setPortrait(window.innerHeight > window.innerWidth && window.innerWidth < 900);check();window.addEventListener("resize", check);window.addEventListener("orientationchange", check);return () => { window.removeEventListener("resize", check); window.removeEventListener("orientationchange", check); };}, []);
const startMatch = useCallback((m, lv, o) => {Sfx.init();const seed = (Math.random() * 1e9) | 0;meRef.current = createEngine(seed, { offset: optRef.current.offset });foeRef.current = createEngine(seed, { offset: optRef.current.offset });foeRef.current.ai = { level: lv, target: null, thinkT: 0, actT: 0 };if (matchRef.current) {matchRef.current.leave();matchRef.current = null;}orbsRef.current = [];reportedRef.current = false;try {const seen = localStorage.getItem("hexdrop_controls_seen") === "1";helpRef.current = { alpha: seen ? 0 : 1, count: 0, fading: seen, forced: 0 };} catch (_) { helpRef.current = { alpha: 1, count: 0, fading: false, forced: 0 }; }setMode(m);setAiLevel(lv);setOpp(o);setResult(null);setScreen("GAME");runRef.current = true;}, []);
const finish = useCallback((win) => {Sfx.play({ t: win ? "win" : "lose" }, 1);const { mode: m, opp: o, rating: r } = stateRef.current;const match = matchRef.current;setTimeout(async () => {if (m === "ONLINE" && match) {setResult({ win, delta: 0 });match.leave();matchRef.current = null;} else if (m === "ONLINE") {setResult({ win, delta: 0 });} else setResult({ win, delta: 0 });setScreen("RESULT");}, 2400);}, []);
const beginOnline = useCallback((match) => {Sfx.init();const seed = match.seed >>> 0;meRef.current = createEngine(seed, { offset: optRef.current.offset });const foe = createEngine(seed, { offset: optRef.current.offset });foe.ai = null;foe.piece = null;foe.state = "NET";foeRef.current = foe;orbsRef.current = [];reportedRef.current = false;try {const seen = localStorage.getItem("hexdrop_controls_seen") === "1";helpRef.current = { alpha: seen ? 0 : 1, count: 0, fading: seen, forced: 0 };} catch (_) { helpRef.current = { alpha: 1, count: 0, fading: false, forced: 0 }; }matchRef.current = match;setFoeConn(true);match.events.onOpponentState = (st) => {const g = foeRef.current;if (!g)return;applySnapshot(g, st.board);g.incoming = st.incoming || 0;if (st.alive === false)g.alive = false;};match.events.onAttack = (atk) => {const n = typeof atk === "number" ? atk : ((atk === null || atk === void 0 ? void 0 : atk.n) || 0);const shapes = Array.isArray(atk === null || atk === void 0 ? void 0 : atk.shapes) ? atk.shapes : [];orbsRef.current.push({ side: 1, t: 0, dur: 0.6, n, shapes,tint: shapes.includes("HEXAGON") ? "#FFD86B" : shapes.includes("PYRAMID") ? "#FF9AD5" : "#A8FFCF" });};match.events.onConnection = (c) => setFoeConn(c);match.events.onFinish = (win) => { runRef.current = false; finish(win); };setMode("ONLINE");setAiLevel(0);setOpp({ name: match.opponent.name, rating: match.opponent.rating });setResult(null);setScreen("GAME");runRef.current = true;}, [finish]);
useEffect(() => {
let raf, last = performance.now(), acc = 0, hud = 0, T = 0, netT = 0, lastSnap = "";const FIXED = PHYSICS_FRAME;
const drain = (g, vol) => { for (const e of g.events) Sfx.play(e, vol); g.events.length = 0; };
const loop = (now) => {
raf = requestAnimationFrame(loop);let dt = (now - last) / 1000;last = now;if (dt > 0.1)dt = 0.1;T += dt;dropFlashRef.current = Math.max(0, dropFlashRef.current - dt * 4);
const hh = helpRef.current;if (hh.forced > 0) {hh.forced = Math.max(0, hh.forced - dt);hh.alpha = Math.min(1, hh.alpha + dt * 8);} else if (hh.fading) {hh.alpha = Math.max(0, hh.alpha - dt * 1.7);}
const me = meRef.current, foe = foeRef.current, cv = cvRef.current;if (!me || !foe || !cv)return;const net = matchRef.current;
const advance = (h) => {me.fastForwardCarry = 0;stepEngine(me, h);if (net) stepNetView(foe, h); else stepEngine(foe, h);
if (net) {if (me.sendBuffer > 0 || me.sendShapes.length > 0) {const n = me.sendBuffer, shapes = me.sendShapes.splice(0);me.sendBuffer = 0;net.sendAttack(n, shapes);orbsRef.current.push({ side: 0, t: 0, dur: 0.6, n, shapes,tint: shapes.includes("HEXAGON") ? "#FFD86B" : shapes.includes("PYRAMID") ? "#FF9AD5" : "#A8FFCF" });}foe.sendBuffer = 0;foe.sendShapes.length = 0;} else {[me, foe].forEach((g, i) => {if (g.sendBuffer > 0 || g.sendShapes.length > 0) {const n = g.sendBuffer, shapes = g.sendShapes.splice(0);orbsRef.current.push({ side: i, t: 0, dur: 0.6, n, shapes,tint: shapes.includes("HEXAGON") ? "#FFD86B" : shapes.includes("PYRAMID") ? "#FF9AD5" : "#A8FFCF" });g.sendBuffer = 0;}});}
orbsRef.current = orbsRef.current.filter((o) => {o.t += h;if (o.t >= o.dur) {const tgt = o.side === 0 ? foe : me;if (!(net && o.side === 0)) {if (o.shapes && o.shapes.length)tgt.incomingShapes.push(...o.shapes.filter((w) => WAZA[w]));else tgt.incoming += o.n;}tgt.fx.shake = Math.max(tgt.fx.shake, 0.55);return false;}return true;});};
if (runRef.current) {acc += dt;let guard = 0;while (acc >= FIXED && guard++ < MAX_PHYSICS_CATCHUP_STEPS) {advance(FIXED);acc -= FIXED;if (!net) {if (!me.alive || !foe.alive) {runRef.current = false;finish(me.alive && !foe.alive);break;}} else if (!me.alive) break;}if(acc>=FIXED)acc=Math.min(acc,FIXED);} else advance(dt);
drain(me, 1);drain(foe, 0.32);
if (net) {netT += dt;if (netT >= 0.2) {netT = 0;const snap = snapshotOf(me);if (snap !== lastSnap) {lastSnap = snap;net.sendBoard(snap, pendingIncomingCount(me), me.alive);}}if (!me.alive && !reportedRef.current) {reportedRef.current = true;net.reportResult(false, "dead");}}
const renderLead=runRef.current?Math.min(FIXED,Math.max(0,acc)):0;
const scale = sizeRef.current.scale;if (scale <= 0)return;const dpr = sizeRef.current.dpr;const w = Math.round(VW * scale * dpr), h = Math.round(VH * scale * dpr);if (cv.width !== w || cv.height !== h) {cv.width = w;cv.height = h;}const ctx = cv.getContext("2d");ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);renderScene(ctx, me, foe, orbsRef.current, T, {me: "Player", meSub: "",foe: stateRef.current.opp?.name ?? "CPU",foeSub: stateRef.current.opp?.rating ? `${stateRef.current.opp.rating}` : ""}, dropFlashRef.current, helpRef.current.alpha,renderLead);hud += dt;if (hud > 0.2) {hud = 0;force((x) => x + 1);}
};raf = requestAnimationFrame(loop);return () => cancelAnimationFrame(raf);}, [finish]);
useEffect(() => {const dn = (e) => {const g = meRef.current;if (!g || screen !== "GAME")return;if (["ArrowLeft", "ArrowRight", "ArrowUp", " "].includes(e.key))e.preventDefault();if (e.repeat && e.key !== "ArrowLeft" && e.key !== "ArrowRight")return;if (e.key === "ArrowLeft") { move(g, -1); noteControl(); }else if (e.key === "ArrowRight") { move(g, 1); noteControl(); }else if (e.key === "ArrowUp" || e.key === " ") {dropFlashRef.current = 1;noteControl();hardDrop(g);}else if (e.key === "z" || e.key === "Z") { rotate(g, -1); noteControl(); }else if (e.key === "x" || e.key === "X") { rotate(g, 1); noteControl(); }};const up = () => {};window.addEventListener("keydown", dn);window.addEventListener("keyup", up);return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };}, [screen]);
useEffect(() => {const cv = cvRef.current;if (!cv) return;let dragging=false, startVX=0, moved=false, t0=0, downV=null;let pressActive=false, longActive=false, longTimer=null, bottomPress=false, fastEligible=false;const toVirtual = (e) => {const r=sizeRef.current.rect || cv.getBoundingClientRect();return [(e.clientX-r.left)/r.width*VW, (e.clientY-r.top)/r.height*VH];};const remeasure=()=>{const r=cv.getBoundingClientRect();sizeRef.current={...sizeRef.current,rect:r,scale:r.width>0?r.width/VW:0};};const stopFast=()=>{const g=meRef.current;if (g) g.fastForward=false;longActive=false;if (longTimer) { clearTimeout(longTimer); longTimer=null; }};
const dn=(e)=>{Sfx.init(); remeasure();const g=meRef.current; if(!g) return;const v=toVirtual(e); downV=v;pressActive=true; longActive=false; bottomPress=v[1]>=DROP_ZONE_Y; fastEligible=v[1]>=VH*0.5;t0=performance.now(); moved=false;try{cv.setPointerCapture(e.pointerId);}catch(err){}if(longTimer) clearTimeout(longTimer);if(fastEligible) longTimer=setTimeout(()=>{const gg=meRef.current;if(!pressActive || !fastEligible || !gg || gg.state!=="PLAYING" || !gg.piece) return;longActive=true;if (!gg.fastForward) { emit(gg, { t: "fast" }); noteControl(); }gg.fastForward=true;},LONG_PRESS_MS);if(!bottomPress){dragging=true;startVX=v[0];const startCol=g.piece?g.pieceVX:SPAWN_X;if(g.piece){g.dragging=true;g.freeX=g.pieceVX;}cv._hexStartCol=startCol;} else {dragging=false; g.dragging=false;}};
const mv=(e)=>{const g=meRef.current;if(!g || !dragging || !g.piece) return;const v=toVirtual(e), dx=v[0]-startVX;if(Math.abs(dx)>6 && !moved){ moved=true; noteControl(); }setFreeX(g,(cv._hexStartCol??g.pieceVX)+(dx/ME.D)*2);};
const up=(e)=>{const g=meRef.current;try{cv.releasePointerCapture(e.pointerId);}catch(err){}const wasLong=longActive;pressActive=false;stopFast();if(bottomPress){if(!wasLong && g && g.state==="PLAYING" && g.piece){dropFlashRef.current=1; noteControl(); hardDrop(g);}bottomPress=false; fastEligible=false; dragging=false;return;}bottomPress=false; fastEligible=false;if(!g || !dragging){dragging=false;return;}dragging=false; g.dragging=false;const elapsed=performance.now()-t0;if(!wasLong && !moved && elapsed<350 && g.piece && downV){const px=ME.X+ME.D/2+(g.pieceVX+1)*ME.D*0.5;rotate(g,downV[0]>=px?1:-1); noteControl();}};
cv.addEventListener("pointerdown",dn);cv.addEventListener("pointermove",mv);cv.addEventListener("pointerup",up);cv.addEventListener("pointercancel",up);return()=>{pressActive=false; stopFast();cv.removeEventListener("pointerdown",dn);cv.removeEventListener("pointermove",mv);cv.removeEventListener("pointerup",up);cv.removeEventListener("pointercancel",up);};}, [screen]);
const me = meRef.current;
return (React.createElement("div", { className: "relative w-full h-screen overflow-hidden font-sans", style: { background: "#060512" } },React.createElement("div", { className: "w-full h-full flex items-center justify-center" },React.createElement("canvas", { ref: cvRef, className: "touch-none select-none", style: { width: "min(100vw, calc(100vh * 16 / 9))", aspectRatio: `${VW} / ${VH}` } })),screen === "GAME" && React.createElement("button", { onClick: () => {runRef.current = false;if (matchRef.current) {matchRef.current.reportResult(false, "resign");matchRef.current.leave();matchRef.current = null;}setScreen("HOME");}, className: "absolute top-3 right-3 z-10 w-9 h-9 rounded-xl text-white/60 border border-white/20 bg-black/40" }, "✕"),portrait && React.createElement("div", { className: "absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 px-8 text-center", style: { background: SPACE_BG } },React.createElement("div", { className: "text-5xl" }, "📱"),React.createElement("div", { className: "text-white font-extrabold text-lg" }, "端末を横向きにしてください"),React.createElement("div", { className: "text-white/50 text-sm leading-relaxed" },"このゲームは横画面専用です。",React.createElement("br", null),"画面の自動回転をオンにしてから横に倒してください。")),screen === "HOME" && React.createElement(Screen, null,React.createElement("div", { className: "text-center mb-8" },React.createElement("div", { className: "text-4xl font-extrabold text-white tracking-[0.08em]", style: { textShadow: "0 0 24px #2FE3F5aa" } }, "HEXDROP")),React.createElement("div", { className: "space-y-3" },React.createElement(Neon, { tone: "pink", onClick: () => { Sfx.init(); setScreen("MATCHING"); } }, "オンライン対戦"),React.createElement(Neon, { onClick: () => { Sfx.init(); setScreen("CPU"); } }, "ひとりで遊ぶ"),React.createElement(Neon, { tone: "gray", onClick: () => { Sfx.init(); setScreen("FRIEND"); } }, "フレンド対戦")),netErr && React.createElement("div", { className: "mt-4 rounded-2xl border p-3 text-[11px] leading-relaxed", style: { borderColor: "#FF3EA555", background: "#FF3EA511", color: "#ffb8d6" } },"オンラインに接続できませんでした")),screen === "CPU" && React.createElement(Screen, { title: "ひとりで遊ぶ", back: () => setScreen("HOME") },React.createElement("div", { className: "space-y-2" }, [1, 2, 3, 4, 5].map((lv) => React.createElement("button", { key: lv, onClick: () => startMatch("CPU", lv, { name: `CPU ${AI_PARAMS[lv].name}`, rating: 880 + lv * 130 }), className: "w-full rounded-2xl p-3 flex items-center gap-3 active:scale-[0.98] transition-transform border border-white/15 bg-white/5" },React.createElement("div", { className: "w-8 h-8 rounded-xl font-extrabold flex items-center justify-center text-[#060512] text-sm", style: { background: "#2FE3F5", boxShadow: "0 0 14px #2FE3F588" } }, lv),React.createElement("div", { className: "text-left flex-1 font-bold text-white/90 text-sm" }, AI_PARAMS[lv].name))))),screen === "MATCHING" && React.createElement(Matching, { onMatched: beginOnline, onCancel: () => { Net.cancelMatchmaking(); setScreen("HOME"); }, onError: (m) => { setNetErr(m); setScreen("HOME"); } }),screen === "FRIEND" && React.createElement(Screen, { title: "フレンド対戦", back: () => setScreen("HOME") },React.createElement("div", { className: "space-y-3" },React.createElement(Neon, { tone: "pink", onClick: () => { setRoom(String(Math.floor(100000 + Math.random() * 900000))); setScreen("ROOM"); } }, "部屋をつくる"),React.createElement("div", { className: "rounded-2xl border border-white/15 bg-white/5 p-3" },React.createElement("div", { className: "text-[11px] font-bold text-white/50 mb-2" }, "部屋に入る"),React.createElement("div", { className: "flex gap-2" },React.createElement("input", { value: room, onChange: (e) => setRoom(e.target.value.replace(/\D/g, "").slice(0, 6)), placeholder: "6桁のコード", inputMode: "numeric", className: "flex-1 px-3 py-2.5 rounded-xl bg-black/30 border border-white/15 text-white text-center tracking-[0.3em] font-bold tabular-nums placeholder:text-white/25" }),React.createElement("button", { disabled: room.length !== 6, onClick: () => startMatch("FRIEND", 3, { name: "フレンド", rating }), className: "px-5 rounded-xl font-bold text-[#060512] disabled:opacity-25", style: { background: "#2FE3F5" } }, "入る"))))),screen === "ROOM" && React.createElement(Screen, { title: "部屋をつくった", back: () => setScreen("FRIEND") },React.createElement("div", { className: "rounded-3xl border border-white/15 bg-white/5 p-6 text-center mb-3" },React.createElement("div", { className: "text-[11px] font-bold text-white/40 mb-1" }, "ルームコード"),React.createElement("div", { className: "text-3xl font-extrabold tracking-[0.2em] tabular-nums text-white", style: { textShadow: "0 0 20px #2FE3F5aa" } },room.slice(0, 3)," ",room.slice(3))),React.createElement(Neon, { onClick: () => startMatch("FRIEND", 3, { name: "フレンド", rating }) }, "相手が入室した（模擬）")),screen === "RESULT" && React.createElement(Screen, null,React.createElement("div", { className: "flex flex-col items-center w-full" },React.createElement("div", { className: "text-5xl font-extrabold mb-8", style: { color: result?.win ? "#2FE3F5" : "#FF3EA5", textShadow: `0 0 30px ${result?.win ? "#2FE3F5" : "#FF3EA5"}aa` } }, result?.win ? "WIN" : "LOSE"),React.createElement("div", { className: "w-full space-y-3" },React.createElement(Neon, { tone: "pink", onClick: () => { if (mode === "ONLINE") setScreen("MATCHING"); else startMatch(mode, aiLevel, opp); } }, mode === "ONLINE" ? "次の相手" : "もう一度"),React.createElement(Neon, { tone: "gray", onClick: () => setScreen("HOME") }, "終了"))))));
}

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
                React.createElement("div", { className: "text-[11px] text-white/40 mt-1 tabular-nums" }, Math.floor(waited / 1000), " 秒"))) : (React.createElement(React.Fragment, null,
                React.createElement("div", { className: "text-[10px] tracking-[0.25em] font-bold text-white/40 mb-3" }, "対戦相手"),
                React.createElement("div", { className: "w-16 h-16 rounded-full mb-3", style: { background: "linear-gradient(135deg,#FF7AC6,#FFC46B)", boxShadow: "0 0 26px #FF3EA588" } }),
                React.createElement("div", { className: "text-xl font-extrabold text-white" }, foe.name),
                React.createElement("div", { className: "text-4xl font-extrabold text-white/20 my-4" }, "VS"))),
            React.createElement("button", { onClick: onCancel, className: "mt-4 text-xs text-white/40 underline" }, "キャンセル"))));
}
window.__mountHexdrop = function () { ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App)); };


const __hexCreateEngineV4=createEngine;
const __hexEngineRegistryV4=[];
createEngine=function(seed,opts={}){const g=__hexCreateEngineV4(seed,opts);__hexEngineRegistryV4.push(g);if(__hexEngineRegistryV4.length>16)__hexEngineRegistryV4.splice(0,__hexEngineRegistryV4.length-16);return g;};
function hexTouchPlayerEngineV4(){for(let i=__hexEngineRegistryV4.length-1;i>=0;i--){const g=__hexEngineRegistryV4[i];if(!g||!g.alive||g.state==="NET"||g.ai)continue;if(g.state==="PLAYING"||g.state==="RESOLVING"||g.state==="READY")return g;}return null;}

/* HEXDROP controls v5.3: iOS-safe game input + drag horizontal + normal-speed single-hold + dual gestures */
(function installHexTouchV5(){
    if(typeof document==="undefined" || window.__hexTouchV5Installed) return;
    window.__hexTouchV5Installed=true;

    const pointers=new Map();
    const singleTimers=new Map();
    const singleRafs=new Map();
    let dual=null;
    let inputGuardRaf=0;

    const SINGLE_HOLD_MS=LONG_PRESS_MS;
    const HOLD_MOVE_SPEED_X=24.4;
    const DUAL_TAP_MAX_MS=320;
    const TAP_MOVE_TOL=24;
    const DRAG_START_TOL=6;

    const isCanvas=(e)=>e?.target && e.target.tagName==="CANVAS";
    const player=()=>typeof hexTouchPlayerEngineV4==="function" ? hexTouchPlayerEngineV4() : null;
    const point=(e,canvas)=>{
        const r=canvas.getBoundingClientRect();
        return {
            x:(e.clientX-r.left)/Math.max(1,r.width)*VW,
            y:(e.clientY-r.top)/Math.max(1,r.height)*VH
        };
    };
    const consume=(e)=>{
        if(e?.cancelable)e.preventDefault();
        e?.stopImmediatePropagation?.();
    };
    const clearSingleTimer=(id)=>{
        const t=singleTimers.get(id);
        if(t){clearTimeout(t);singleTimers.delete(id);}
    };
    const stopSingleRaf=(id)=>{
        const raf=singleRafs.get(id);
        if(raf){cancelAnimationFrame(raf);singleRafs.delete(id);}
    };
    const stopFast=(g)=>{ if(g)g.fastForward=false; };

    const stopAllSingle=()=>{
        for(const id of [...singleTimers.keys()])clearSingleTimer(id);
        for(const id of [...singleRafs.keys()])stopSingleRaf(id);
        for(const r of pointers.values()){
            r.longMove=false;
            r.drag=false;
            if(r.g)r.g.dragging=false;
        }
    };

    function releaseCaptureSoon(rec){
        if(!rec?.canvas)return;
        try{
            if(rec.canvas.hasPointerCapture?.(rec.id))rec.canvas.releasePointerCapture(rec.id);
        }catch(_){}
    }

    function resetAllInputState(reason="reset"){
        if(dual?.timer)clearTimeout(dual.timer);
        dual=null;
        stopAllSingle();
        const engines=new Set();
        for(const rec of pointers.values()){
            if(rec.g)engines.add(rec.g);
            releaseCaptureSoon(rec);
        }
        pointers.clear();
        for(const g of engines){
            stopFast(g);
            g.dragging=false;
        }
        window.__hexLastInputResetV53={reason,at:performance.now()};
    }
    window.__hexResetTouchInput=resetAllInputState;

    function currentFreeX(g){
        if(Number.isFinite(g?.freeX))return g.freeX;
        if(Number.isFinite(g?.pieceVX))return g.pieceVX;
        return Number.isFinite(g?.piece?.x)?g.piece.x:SPAWN_X;
    }

    function instantDropToFloorV5(g){
        if(!g || g.state!=="PLAYING" || !g.piece)return false;
        g.fastForward=false;
        g.dragging=false;
        g.freeX=null;
        g.hardDropAnim=null;
        g.dropT=0;

        const fixedX=g.piece.x;
        const target={...g.piece,x:fixedX};
        while(pieceFits(g.board,{...target,x:fixedX,y:target.y+2}))target.y+=2;
        target.x=fixedX;
        g.pieceVX=fixedX;
        g.freeX=null;
        g.piece={...target};
        emit(g,{t:"drop"});
        lock(g,5);
        return true;
    }
    window.__hexInstantDropV5=instantDropToFloorV5;

    function beginDrag(rec,anchorAtCurrent=false){
        if(!rec || (rec.consumed && !rec.longMove))return false;
        const g=rec.g;
        if(!g || g.state!=="PLAYING" || !g.piece || dual)return false;
        clearSingleTimer(rec.id);
        stopSingleRaf(rec.id);
        rec.longMove=false;
        rec.drag=true;
        rec.consumed=true;
        g.dragging=true;
        if(anchorAtCurrent){
            rec.dragAnchorX=rec.lastX;
            rec.dragBaseX=currentFreeX(g);
        }else{
            rec.dragAnchorX=rec.startX;
            rec.dragBaseX=rec.startFreeX;
        }
        g.freeX=currentFreeX(g);
        return true;
    }

    function updateDrag(rec){
        if(!rec?.drag || dual)return;
        const g=rec.g;
        if(!g || g.state!=="PLAYING" || !g.piece)return;
        const dx=rec.lastX-rec.dragAnchorX;
        setFreeX(g,rec.dragBaseX+(dx/ME.D)*2);
    }

    function startSingleMove(rec){
        if(!rec || rec.consumed || dual || pointers.size!==1)return;
        const g=rec.g;
        if(!g || g.state!=="PLAYING" || !g.piece)return;
        rec.longMove=true;
        rec.consumed=true;
        rec.holdOriginX=rec.lastX;
        rec.holdOriginY=rec.lastY;
        rec.holdX=currentFreeX(g);
        g.dragging=true;
        g.freeX=rec.holdX;

        let last=performance.now();
        const tick=(now)=>{
            if(!pointers.has(rec.id) || dual || !rec.longMove || g.state!=="PLAYING" || !g.piece){
                stopSingleRaf(rec.id);
                if(!rec.drag)g.dragging=false;
                return;
            }
            const dt=Math.min(0.05,Math.max(0,(now-last)/1000));
            last=now;
            rec.holdX+=rec.half*HOLD_MOVE_SPEED_X*dt;
            setFreeX(g,rec.holdX);
            rec.holdX=currentFreeX(g);
            singleRafs.set(rec.id,requestAnimationFrame(tick));
        };
        singleRafs.set(rec.id,requestAnimationFrame(tick));
    }

    function armSingle(rec){
        clearSingleTimer(rec.id);
        singleTimers.set(rec.id,setTimeout(()=>{
            singleTimers.delete(rec.id);
            startSingleMove(rec);
        },SINGLE_HOLD_MS));
    }

    function dualPointersValid(d){
        if(!d || d.ids.length!==2)return false;
        const a=pointers.get(d.ids[0]);
        const b=pointers.get(d.ids[1]);
        return !!a && !!b && a.half!==b.half;
    }

    function startDualIfPossible(){
        if(pointers.size!==2)return false;
        const arr=[...pointers.values()];
        const g=arr[0].g;
        stopAllSingle();
        stopFast(g);

        if(arr[0].half===arr[1].half){
            for(const r of arr)r.consumed=true;
            return false;
        }

        for(const r of arr){
            r.consumed=true;
            r.dual=true;
            r.drag=false;
            r.longMove=false;
        }
        if(g)g.dragging=false;

        dual={ids:arr.map(r=>r.id),g,startedAt:performance.now(),tapEligible:true,fast:false,timer:null};
        dual.timer=setTimeout(()=>{
            if(!dual || !dualPointersValid(dual))return;
            const gg=dual.g;
            if(!gg || gg.state!=="PLAYING" || !gg.piece)return;
            dual.fast=true;
            dual.tapEligible=false;
            if(!gg.fastForward)emit(gg,{t:"fast"});
            gg.fastForward=true;
        },LONG_PRESS_MS);
        return true;
    }

    function purgeDualPointers(d){
        if(!d)return;
        for(const did of d.ids){
            const rec=pointers.get(did);
            clearSingleTimer(did);
            stopSingleRaf(did);
            if(rec){
                rec.consumed=true;
                rec.drag=false;
                rec.longMove=false;
                releaseCaptureSoon(rec);
            }
            pointers.delete(did);
        }
    }

    function finishDual(id,cancelled){
        if(!dual || !dual.ids.includes(id))return false;
        const d=dual;
        if(d.timer)clearTimeout(d.timer);
        d.timer=null;
        const elapsed=performance.now()-d.startedAt;
        const g=d.g;

        if(d.fast)stopFast(g);
        else if(!cancelled && d.tapEligible && elapsed<=DUAL_TAP_MAX_MS)instantDropToFloorV5(g);

        purgeDualPointers(d);
        if(g)g.dragging=false;
        dual=null;
        return true;
    }

    const onDown=(e)=>{
        if(!isCanvas(e))return;
        const g=player();
        if(!g || g.state!=="PLAYING" || !g.piece)return;
        consume(e);

        for(const [,r] of [...pointers]){
            if(!r?.g || r.g.state!=="PLAYING" || !r.g.piece){
                resetAllInputState("stale-before-down");
                break;
            }
        }

        const p=point(e,e.target);
        const rec={
            id:e.pointerId,canvas:e.target,g,
            half:p.x>=VW*0.5?1:-1,
            startX:p.x,startY:p.y,lastX:p.x,lastY:p.y,
            startFreeX:currentFreeX(g),downAt:performance.now(),
            consumed:false,longMove:false,drag:false,dual:false
        };
        pointers.set(e.pointerId,rec);
        try{e.target.setPointerCapture(e.pointerId);}catch(_){}

        if(pointers.size===1)armSingle(rec);
        else if(pointers.size===2)startDualIfPossible();
        else resetAllInputState("too-many-pointers");
    };

    const onMove=(e)=>{
        const r=pointers.get(e.pointerId);
        if(!r)return;
        consume(e);
        const p=point(e,r.canvas);
        r.lastX=p.x;r.lastY=p.y;
        const dx=r.lastX-r.startX;
        const dy=r.lastY-r.startY;
        const dist=Math.hypot(dx,dy);

        if(dual && dual.ids.includes(r.id)){
            if(dist>TAP_MOVE_TOL)dual.tapEligible=false;
            return;
        }

        if(!r.drag && !r.longMove && Math.abs(dx)>=DRAG_START_TOL && Math.abs(dx)>=Math.abs(dy)*0.65){
            beginDrag(r,false);
        }else if(r.longMove){
            const hdx=r.lastX-(r.holdOriginX??r.lastX);
            const hdy=r.lastY-(r.holdOriginY??r.lastY);
            if(Math.abs(hdx)>=DRAG_START_TOL && Math.abs(hdx)>=Math.abs(hdy)*0.65)beginDrag(r,true);
        }
        updateDrag(r);
    };

    const finish=(e,cancelled)=>{
        const r=pointers.get(e.pointerId);
        if(!r)return;
        consume(e);

        if(dual && dual.ids.includes(r.id)){
            finishDual(r.id,cancelled);
            return;
        }

        clearSingleTimer(r.id);
        stopSingleRaf(r.id);
        pointers.delete(r.id);
        releaseCaptureSoon(r);

        if(r.drag || r.longMove)r.g.dragging=false;
        if(!cancelled && !r.consumed && !r.longMove && !r.drag && r.g.state==="PLAYING" && r.g.piece){
            const elapsed=performance.now()-r.downAt;
            const dist=Math.hypot(r.lastX-r.startX,r.lastY-r.startY);
            if(elapsed<360 && dist<TAP_MOVE_TOL)rotate(r.g,r.half>0?1:-1);
        }

        if(pointers.size===0){
            stopFast(r.g);
            stopAllSingle();
            r.g.dragging=false;
        }else{
            for(const rr of pointers.values())rr.consumed=true;
        }
    };

    const cancelBrowserHold=(e)=>{
        const t=e?.target;
        if(t?.tagName==="CANVAS" || t?.closest?.("#root"))consume(e);
    };

    document.addEventListener("pointerdown",onDown,true);
    document.addEventListener("pointermove",onMove,true);
    document.addEventListener("pointerup",e=>finish(e,false),true);
    document.addEventListener("pointercancel",e=>finish(e,true),true);

    document.addEventListener("contextmenu",cancelBrowserHold,true);
    document.addEventListener("selectstart",cancelBrowserHold,true);
    document.addEventListener("dragstart",cancelBrowserHold,true);
    document.addEventListener("gesturestart",cancelBrowserHold,{capture:true,passive:false});
    document.addEventListener("gesturechange",cancelBrowserHold,{capture:true,passive:false});
    document.addEventListener("gestureend",cancelBrowserHold,{capture:true,passive:false});

    document.addEventListener("lostpointercapture",e=>{
        const id=e.pointerId;
        setTimeout(()=>{ if(pointers.has(id))resetAllInputState("lost-pointer-capture"); },0);
    },true);

    window.addEventListener("blur",()=>resetAllInputState("window-blur"),true);
    window.addEventListener("pagehide",()=>resetAllInputState("pagehide"),true);
    document.addEventListener("visibilitychange",()=>{
        if(document.hidden)resetAllInputState("visibility-hidden");
    },true);

    const guard=()=>{
        if(pointers.size){
            const invalid=[...pointers.values()].some(r=>!r.g || r.g.state!=="PLAYING" || !r.g.piece);
            if(invalid)resetAllInputState("engine-state-change");
        }
        inputGuardRaf=requestAnimationFrame(guard);
    };
    inputGuardRaf=requestAnimationFrame(guard);
})();


window.__mountHexdrop = function () { ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App)); };
(function(){try{if(typeof React==="undefined"||typeof ReactDOM==="undefined"){fail("Reactを読み込めませんでした");return;}window.__mountHexdrop();var b=document.getElementById("boot");if(b)b.remove();}catch(err){fail("起動時エラー: "+(err&&err.message?err.message:err));}})();