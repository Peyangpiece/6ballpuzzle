/* =============================================================
 * ボール描画キャッシュ
 *   各色の球を起動時に1回だけオフスクリーンCanvasへ描き、ゲーム中はdrawImageで再利用する。
 *   毎フレームの球ごとのグラデーション生成を避け、大量崩落時の描画負荷を抑える。
 * ============================================================= */
function makeBallSprite(ci){
    if(typeof document==="undefined")return null;
    const S=144,cv=document.createElement("canvas");cv.width=S;cv.height=S;
    const c=cv.getContext("2d"),col=COLORS[ci],cx=S/2,cy=S/2,r=S*0.46;
    const g=c.createRadialGradient(cx-r*0.34,cy-r*0.38,r*0.04,cx,cy,r);
    g.addColorStop(0,col.hi);g.addColorStop(0.34,col.base);g.addColorStop(0.78,col.base);g.addColorStop(1,col.lo);
    c.fillStyle=g;c.beginPath();c.arc(cx,cy,r,0,TAU);c.fill();
    c.lineWidth=S*0.035;c.strokeStyle="rgba(255,255,255,.28)";c.stroke();
    const shine=c.createRadialGradient(cx-r*.32,cy-r*.36,0,cx-r*.32,cy-r*.36,r*.38);
    shine.addColorStop(0,"rgba(255,255,255,.72)");shine.addColorStop(1,"rgba(255,255,255,0)");
    c.fillStyle=shine;c.beginPath();c.arc(cx-r*.30,cy-r*.35,r*.36,0,TAU);c.fill();
    c.save();c.translate(cx,cy);c.strokeStyle="rgba(255,255,255,.78)";c.fillStyle="rgba(255,255,255,.72)";c.lineWidth=S*.055;c.lineCap="round";c.lineJoin="round";
    const rr=S*.18;
    switch(col.sym){
        case "star":{c.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,q=i%2?rr*.45:rr;const x=Math.cos(a)*q,y=Math.sin(a)*q;i?c.lineTo(x,y):c.moveTo(x,y);}c.closePath();c.fill();break;}
        case "wave":{c.beginPath();c.moveTo(-rr,rr*.15);c.bezierCurveTo(-rr*.55,-rr*.55,-rr*.15,-rr*.55,0,rr*.05);c.bezierCurveTo(rr*.2,rr*.65,rr*.65,rr*.6,rr,-rr*.05);c.stroke();break;}
        case "cross":{c.beginPath();c.moveTo(-rr,0);c.lineTo(rr,0);c.moveTo(0,-rr);c.lineTo(0,rr);c.stroke();break;}
        case "bar":{c.beginPath();c.moveTo(-rr,0);c.lineTo(rr,0);c.stroke();break;}
        case "arc":{c.beginPath();c.arc(0,rr*.28,rr,Math.PI*1.1,Math.PI*1.9);c.stroke();break;}
    }
    c.restore();
    return cv;
}
const BALL_IMG=COLORS.map((_,i)=>makeBallSprite(i));
const imgReady=(i)=>!!BALL_IMG[i];
function drawBall(ctx, cx, cy, d, ci, o = {}) {
    const { alpha = 1, scale = 1, sq = 0, aura = 0, ring = 0 } = o;
    const w = d * scale * (1 + sq * 0.45);
    const h = d * scale * (1 - sq * 0.6);
    if (w <= 1.2 || alpha <= 0.01)
        return;
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
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = alpha;
    }
    if (imgReady(ci)) {
        ctx.drawImage(BALL_IMG[ci], cx - w / 2, cy - h / 2 + yShift, w, h);
    } else {
        ctx.fillStyle=col.base;ctx.beginPath();ctx.ellipse(cx,cy+yShift,w/2,h/2,0,0,TAU);ctx.fill();
    }
    if (ring > 0) {
        ctx.globalAlpha = alpha * ring * 0.75;
        ctx.beginPath();
        ctx.ellipse(cx, cy + yShift, w * 0.6, h * 0.6, 0, 0, TAU);
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = w * 0.14;
        ctx.stroke();
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
