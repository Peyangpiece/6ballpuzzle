/* =============================================================
 * ボール描画
 *   旧HEXDROPのガラス玉デザインをスプライトシートから復元。
 *   物理・アニメーション処理は変更せず、描画素材だけ旧版へ戻す。
 * ============================================================= */
const BALL_SHEET_PARTS = (typeof window!=="undefined" && window.__HEX_BALL_SHEET_PARTS) || [];
const BALL_SHEET_SRC = BALL_SHEET_PARTS.length ? "data:image/webp;base64," + BALL_SHEET_PARTS.join("") : "";
const BALL_SHEET_IMG = (() => {
    if (typeof Image === "undefined" || !BALL_SHEET_SRC) return null;
    const im = new Image();
    im.decoding = "async";
    im.src = BALL_SHEET_SRC;
    return im;
})();
const BALL_SHEET_CELL = 72;
const imgReady = () => !!(BALL_SHEET_IMG && BALL_SHEET_IMG.complete && BALL_SHEET_IMG.naturalWidth >= BALL_SHEET_CELL*5);
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
        ctx.drawImage(BALL_SHEET_IMG, ci * BALL_SHEET_CELL, 0, BALL_SHEET_CELL, BALL_SHEET_CELL, cx - w / 2, cy - h / 2 + yShift, w, h);
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
