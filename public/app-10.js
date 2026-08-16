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

function drawGarbageBubbleBall(ctx,cx,cy,d,ci,age){
    const grow=HEX_GARBAGE_BUBBLE_DURATION,pop=HEX_GARBAGE_BUBBLE_POP_DURATION;
    if(age<grow){
        const t=Math.max(0,Math.min(1,age/grow)),ease=1-Math.pow(1-t,3),pulse=1+.1*Math.sin(Math.PI*t);
        const r=d*.56*ease*pulse;
        ctx.save();
        ctx.globalCompositeOperation="screen";
        const bg=ctx.createRadialGradient(cx-r*.28,cy-r*.34,r*.04,cx,cy,Math.max(1,r));
        bg.addColorStop(0,"rgba(255,255,255,.42)");bg.addColorStop(.45,"rgba(154,238,255,.17)");bg.addColorStop(1,"rgba(100,206,255,.025)");
        ctx.fillStyle=bg;ctx.beginPath();ctx.arc(cx,cy,Math.max(.5,r),0,TAU);ctx.fill();
        ctx.globalAlpha=.2+.65*ease;ctx.strokeStyle="#E9FBFF";ctx.lineWidth=Math.max(1,d*(.045-.02*t));ctx.shadowColor="#8CEFFF";ctx.shadowBlur=d*.32;
        ctx.beginPath();ctx.arc(cx,cy,Math.max(.5,r),0,TAU);ctx.stroke();
        ctx.globalAlpha=.65*ease;ctx.fillStyle="#FFFFFF";ctx.beginPath();ctx.ellipse(cx-r*.31,cy-r*.34,Math.max(.5,r*.13),Math.max(.5,r*.07),-.65,0,TAU);ctx.fill();
        ctx.restore();
        drawBall(ctx,cx,cy,d,ci,{alpha:Math.min(1,t*1.7),scale:.12+.88*ease,aura:.18+.35*t});
        return;
    }
    drawBall(ctx,cx,cy,d,ci,{alpha:1,scale:1,aura:age<grow+pop?.24:0});
    if(age<grow+pop){
        const t=(age-grow)/pop;
        ctx.save();ctx.globalAlpha=(1-t)*.75;ctx.strokeStyle="#ECFDFF";ctx.lineWidth=Math.max(1,d*.04*(1-t));ctx.shadowColor="#8CEFFF";ctx.shadowBlur=d*.26;
        ctx.beginPath();ctx.arc(cx,cy,d*(.52+.42*t),0,TAU);ctx.stroke();ctx.restore();
    }
}

function drawFormationEffects(ctx,g,pos,D){
    for(const fx of g.fx.formations||[]){
        if(!fx?.cells?.length||fx.life<=0)continue;
        const t=Math.max(0,Math.min(1,1-fx.life/fx.max)),charge=Math.min(1,t/.42),fade=Math.min(1,fx.life/(fx.max*.28));
        const pts=fx.cells.map(([x,y])=>pos(x,y)),cx=pts.reduce((n,p)=>n+p[0],0)/pts.length,cy=pts.reduce((n,p)=>n+p[1],0)/pts.length;
        const radius=Math.max(D*1.05,...pts.map(p=>Math.hypot(p[0]-cx,p[1]-cy)+D*.55));
        ctx.save();ctx.globalCompositeOperation="screen";
        const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,radius*1.45);glow.addColorStop(0,fx.tint+"99");glow.addColorStop(.46,fx.tint+"38");glow.addColorStop(1,fx.tint+"00");
        ctx.globalAlpha=(.35+.4*charge)*fade;ctx.fillStyle=glow;ctx.beginPath();ctx.arc(cx,cy,radius*1.45,0,TAU);ctx.fill();
        for(const p of pts){ctx.globalAlpha=(.2+.8*Math.sin(Math.PI*Math.min(1,t/.7)))*fade;ctx.strokeStyle="#FFFFFF";ctx.lineWidth=D*(.12-.065*t);ctx.shadowColor=fx.tint;ctx.shadowBlur=D*(.55+.35*charge);ctx.beginPath();ctx.arc(p[0],p[1],D*(.5+.16*charge),0,TAU);ctx.stroke();}
        const sides=fx.w==="PYRAMID"?3:6,start=fx.w==="PYRAMID"?(fx.pointDown?Math.PI/2:-Math.PI/2):-Math.PI/2+t*.2;
        for(let ring=0;ring<(fx.w==="HEXAGON"?3:2);ring++){
            const rr=radius*(.86+ring*.16+charge*.1);ctx.globalAlpha=(.92-ring*.22)*fade;ctx.strokeStyle=ring===0?"#FFFFFF":fx.tint;ctx.lineWidth=Math.max(1,D*(.095-ring*.02)*(1-.45*t));ctx.shadowColor=fx.tint;ctx.shadowBlur=D*(fx.w==="HEXAGON"?.75:.55);
            ctx.beginPath();for(let i=0;i<=sides;i++){const a=start+i*TAU/sides,x=cx+Math.cos(a)*rr,y=cy+Math.sin(a)*rr;(i?ctx.lineTo(x,y):ctx.moveTo(x,y));}ctx.stroke();
        }
        ctx.restore();
    }
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
            for(let by=boardScanMin(g.board);by<ROWS;by++)for(let bx=0;bx<W2;bx++){
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
        for (let by = boardScanMin(g.board); by < ROWS; by++) for (let bx = 0; bx < W2; bx++) {
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
