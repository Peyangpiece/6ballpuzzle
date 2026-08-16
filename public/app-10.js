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
        const age=fx.max-fx.life,t=Math.max(0,Math.min(1,age/fx.max));
        const pts=fx.cells.map(([x,y])=>pos(x,y)),cx=pts.reduce((n,p)=>n+p[0],0)/pts.length,cy=pts.reduce((n,p)=>n+p[1],0)/pts.length;
        const radius=Math.max(D*(fx.w==="PYRAMID"?4.1:3.7),...pts.map(p=>Math.hypot(p[0]-cx,p[1]-cy)+D*2.7));
        ctx.save();ctx.globalCompositeOperation="screen";
        // The six triggering balls first turn into brilliant white rings.
        const ballFlash=Math.max(0,1-age/.92);
        if(ballFlash>0)for(const p of pts){ctx.globalAlpha=Math.min(1,ballFlash*1.7);ctx.strokeStyle="#FFFFFF";ctx.lineWidth=D*.13;ctx.shadowColor=fx.tint;ctx.shadowBlur=D*.8;ctx.beginPath();ctx.arc(p[0],p[1],D*(.5+.1*(1-ballFlash)),0,TAU);ctx.stroke();}

        let vertices=[];
        if(fx.w==="STRAIGHT"){
            let a=pts[0],b=pts[0],best=-1;
            for(const p of pts)for(const q of pts){const d=Math.hypot(p[0]-q[0],p[1]-q[1]);if(d>best){best=d;a=p;b=q;}}
            const dx=(b[0]-a[0])/Math.max(1,best),dy=(b[1]-a[1])/Math.max(1,best);
            vertices=[[a[0]-dx*D*1.1,a[1]-dy*D*1.1],[b[0]+dx*D*1.1,b[1]+dy*D*1.1]];
        }else{
            const sides=fx.w==="PYRAMID"?3:6;
            const start=fx.w==="PYRAMID"?(fx.pointDown?Math.PI/2:-Math.PI/2):-Math.PI/2;
            vertices=Array.from({length:sides},(_,i)=>[cx+Math.cos(start+i*TAU/sides)*radius,cy+Math.sin(start+i*TAU/sides)*radius]);
            vertices.push(vertices[0]);
        }
        const trace=(width,alpha,color)=>{ctx.beginPath();vertices.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.globalAlpha=alpha;ctx.shadowColor=fx.tint;ctx.shadowBlur=D*.72;ctx.stroke();};
        // Construction rays, then the large filled flash seen in the captures.
        if(age<.86)trace(Math.max(1,D*.045),Math.min(1,age/.18),fx.tint);
        if(age>=.68&&age<1.18){const flash=Math.sin(Math.PI*(age-.68)/.5);if(fx.w!=="STRAIGHT"){ctx.beginPath();vertices.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.globalAlpha=.34*flash;ctx.fillStyle=fx.tint;ctx.shadowColor=fx.tint;ctx.shadowBlur=D*1.7;ctx.fill();}trace(D*(.06+.12*flash),.95*flash,"#FFFFFF");}
        // The solid geometry dissolves into stable sparkling edge particles.
        if(age>=1.04){const fade=Math.min(1,(age-1.04)/.3)*Math.min(1,fx.life/.45);for(let e=0;e<vertices.length-1;e++){const a=vertices[e],b=vertices[e+1],n=fx.w==="STRAIGHT"?32:18;for(let i=0;i<=n;i++){const u=i/n,jitter=Math.sin(i*12.9898+e*7.13)*D*.025,px=a[0]+(b[0]-a[0])*u,py=a[1]+(b[1]-a[1])*u;ctx.globalAlpha=fade*(.48+.5*Math.sin(age*10+i*1.7+e));ctx.fillStyle=i%5===0?"#FFFFFF":fx.tint;ctx.shadowColor=fx.tint;ctx.shadowBlur=D*.35;ctx.beginPath();ctx.arc(px+jitter,py-jitter,D*(i%5===0?.055:.038),0,TAU);ctx.fill();}}}
        ctx.restore();
    }
}

function drawIncomingPreviews(ctx,g,L){
    const list=g.fx.incomingPreviews||[];
    for(let k=0;k<list.length;k++){
        const fx=list[k],appear=Math.min(1,(fx.max-fx.life)/.22),fade=Math.min(1,fx.life/.35),shapes=fx.shapes?.length?fx.shapes:["PYRAMID"];
        const d=23,cols=Math.min(3,shapes.length),rows=Math.ceil(shapes.length/cols),packW=82,packH=58;
        const totalW=cols*packW,totalH=rows*packH,baseX=L.X+L.BW/2-totalW/2,baseY=Math.max(-8,L.Y-34-totalH-k*12);
        ctx.save();ctx.globalCompositeOperation="screen";ctx.globalAlpha=appear*fade;ctx.strokeStyle=fx.tint||"#8CFFB1";ctx.lineWidth=3;ctx.shadowColor=fx.tint||"#8CFFB1";ctx.shadowBlur=13;
        for(let s=0;s<shapes.length;s++){
            const pat=GARBAGE_SHAPES[shapes[s]]||GARBAGE_SHAPES.PYRAMID,c=s%cols,r=Math.floor(s/cols),ox=baseX+c*packW+packW/2,oy=baseY+r*packH+9;
            const minX=Math.min(...pat.map(p=>p[0])),maxX=Math.max(...pat.map(p=>p[0])),minY=Math.min(...pat.map(p=>p[1]));
            const sample=pat.length>7?pat.filter((_,i)=>i%Math.max(1,Math.floor(pat.length/7))===0).slice(0,7):pat;
            for(const [x,y] of sample){const px=ox+(x-(minX+maxX)/2)*d*.5,py=oy+(y-minY)*d*HEX_ROW_H;ctx.beginPath();ctx.arc(px,py,d*.42,0,TAU);ctx.stroke();}
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
