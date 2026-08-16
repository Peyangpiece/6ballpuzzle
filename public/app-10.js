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
        const pts=fx.cells.map(([x,y])=>pos(x,y)),sourceCx=pts.reduce((n,p)=>n+p[0],0)/pts.length,sourceCy=pts.reduce((n,p)=>n+p[1],0)/pts.length;
        const boardTopCenterY=pos(0,0)[1],cx=sourceCx;
        // The capture's large technique glyph is staged in the open upper
        // playfield rather than wrapped tightly around the six cleared balls.
        const cy=fx.w==="PYRAMID"?boardTopCenterY+D*3.7:fx.w==="HEXAGON"?boardTopCenterY+D*2.45:sourceCy;
        const radius=D*(fx.w==="PYRAMID"?4.1:3.75);
        ctx.save();ctx.globalCompositeOperation="screen";
        // The six triggering balls first turn into brilliant white rings.
        const ballFlash=Math.max(0,1-age/.92);
        if(ballFlash>0)for(const p of pts){ctx.globalAlpha=Math.min(1,ballFlash*1.7);ctx.strokeStyle="#FFFFFF";ctx.lineWidth=D*.13;ctx.shadowColor=fx.tint;ctx.shadowBlur=D*.8;ctx.beginPath();ctx.arc(p[0],p[1],D*(.5+.1*(1-ballFlash)),0,TAU);ctx.stroke();}

        let vertices=[],edges=[];
        if(fx.w==="STRAIGHT"){
            let a=pts[0],b=pts[0],best=-1;
            for(const p of pts)for(const q of pts){const d=Math.hypot(p[0]-q[0],p[1]-q[1]);if(d>best){best=d;a=p;b=q;}}
            const dx=(b[0]-a[0])/Math.max(1,best),dy=(b[1]-a[1])/Math.max(1,best);
            const s=[a[0]-dx*D*3.35,a[1]-dy*D*3.35],z=[b[0]+dx*D*3.35,b[1]+dy*D*3.35],nx=-dy*D*.34,ny=dx*D*.34;
            vertices=[s,z];edges=[[[s[0]+nx,s[1]+ny],[z[0]+nx,z[1]+ny]],[[s[0]-nx,s[1]-ny],[z[0]-nx,z[1]-ny]]];
        }else{
            const sides=fx.w==="PYRAMID"?3:6;
            const start=fx.w==="PYRAMID"?(fx.pointDown?Math.PI/2:-Math.PI/2):-Math.PI/2;
            vertices=Array.from({length:sides},(_,i)=>[cx+Math.cos(start+i*TAU/sides)*radius,cy+Math.sin(start+i*TAU/sides)*radius]);
            if(fx.w==="HEXAGON"){
                // The reference hexagon is a slowly turning wireframe solid,
                // not a stationary flat six-sided outline.
                const hexTurn=Math.max(0,age-.42)*.72,squeeze=.82+.18*Math.abs(Math.cos(hexTurn)),skew=Math.sin(hexTurn)*.2;
                vertices=vertices.map(([x,y])=>[cx+(x-cx)*squeeze+(y-cy)*skew,cy+(y-cy)]);
            }
            for(let i=0;i<sides;i++)edges.push([vertices[i],vertices[(i+1)%sides]]);
            if(fx.w==="PYRAMID"){
                const baseMid=[(vertices[1][0]+vertices[2][0])/2,(vertices[1][1]+vertices[2][1])/2];edges.push([vertices[0],baseMid]);
            }else{
                const inner=vertices.map(p=>[cx+(p[0]-cx)*.51,cy+(p[1]-cy)*.51]);
                for(let i=0;i<6;i++){edges.push([inner[i],inner[(i+1)%6]]);edges.push([vertices[i],inner[i]]);}
                edges.push([inner[0],inner[3]],[inner[1],inner[4]],[inner[2],inner[5]]);
            }
        }
        const trace=(width,alpha,color,list=edges)=>{ctx.beginPath();for(const [a,b]of list){ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);}ctx.strokeStyle=color;ctx.lineWidth=width;ctx.globalAlpha=alpha;ctx.shadowColor=fx.tint;ctx.shadowBlur=D*.72;ctx.stroke();};
        // Construction rays, then the large filled flash seen in the captures.
        if(age<.86)trace(Math.max(1,D*.045),Math.min(1,age/.18),fx.tint);
        if(age>=.68&&age<1.18){
            const flash=Math.sin(Math.PI*(age-.68)/.5);
            if(fx.w!=="STRAIGHT"){
                ctx.beginPath();vertices.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.globalAlpha=.34*flash;ctx.fillStyle=fx.tint;ctx.shadowColor=fx.tint;ctx.shadowBlur=D*1.7;ctx.fill();
            }else{
                // The straight capture has a broad solid light blade before
                // it breaks into edge particles, not merely a thin outline.
                trace(D*1.34,.36*flash,fx.tint);trace(D*.72,.34*flash,"#FFFFFF");
            }
            trace(D*(.06+.12*flash),.95*flash,"#FFFFFF");
        }
        // The solid geometry dissolves into stable sparkling edge particles.
        if(age>=1.04){
            const fade=Math.min(1,(age-1.04)/.3)*Math.min(1,fx.life/.18),n=fx.w==="STRAIGHT"?130:fx.w==="HEXAGON"?36:90,flow=fx.w==="STRAIGHT"?age*.035:fx.w==="HEXAGON"?age*.014:0;
            // Dense reference trails are drawn in two batched paths. This
            // keeps hundreds of glowing motes smooth on mobile without doing
            // a separate fill and shadow pass for every particle.
            for(let white=0;white<2;white++){
                ctx.beginPath();
                for(let e=0;e<edges.length;e++){const [a,b]=edges[e];for(let i=0;i<=n;i++){
                    if((i%7===0)!==!!white)continue;
                    const u=(i/n+flow)%1,jitter=Math.sin(i*12.9898+e*7.13+age*2.1)*D*.034,px=a[0]+(b[0]-a[0])*u,py=a[1]+(b[1]-a[1])*u,r=D*(white?.07:.044);
                    ctx.moveTo(px+jitter+r,py-jitter);ctx.arc(px+jitter,py-jitter,r,0,TAU);
                }}
                ctx.globalAlpha=fade*(white?.94:.74+.18*Math.sin(age*9.5));ctx.fillStyle=white?"#FFFFFF":fx.tint;ctx.shadowColor=fx.tint;ctx.shadowBlur=D*(white?.52:.42);ctx.fill();
            }
        }
        ctx.restore();
    }
}

function drawIncomingPreviews(ctx,g,L){
    const list=g.fx.incomingPreviews||[];
    for(let k=0;k<list.length;k++){
        const fx=list[k],appear=Math.min(1,(fx.max-fx.life)/.22),fade=Math.min(1,fx.life/.35),shapes=fx.shapes?.length?fx.shapes:["PYRAMID"];
        const soloStraight=shapes.length===1&&shapes[0]==="STRAIGHT";
        const d=soloStraight?39:23,cols=soloStraight?1:Math.min(3,shapes.length),rows=Math.ceil(shapes.length/cols),packW=soloStraight?L.BW:82,packH=soloStraight?86:58;
        const totalW=cols*packW,totalH=rows*packH,baseX=L.X+L.BW/2-totalW/2,baseY=Math.max(-8,L.Y-34-totalH-k*12);
        ctx.save();ctx.globalCompositeOperation="screen";ctx.globalAlpha=appear*fade;ctx.strokeStyle=fx.tint||"#8CFFB1";ctx.lineWidth=3;ctx.shadowColor=fx.tint||"#8CFFB1";ctx.shadowBlur=13;
        for(let s=0;s<shapes.length;s++){
            const pat=GARBAGE_SHAPES[shapes[s]]||GARBAGE_SHAPES.PYRAMID,c=s%cols,r=Math.floor(s/cols),ox=baseX+c*packW+packW/2,oy=baseY+r*packH+9;
            const minX=Math.min(...pat.map(p=>p[0])),maxX=Math.max(...pat.map(p=>p[0])),minY=Math.min(...pat.map(p=>p[1]));
            // A straight attack is visibly a complete 10/9 ring lattice in
            // the reference capture. Sampling it down to seven rings made it
            // read as an unrelated small icon.
            const sample=soloStraight?pat:(pat.length>7?pat.filter((_,i)=>i%Math.max(1,Math.floor(pat.length/7))===0).slice(0,7):pat);
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
    // Reference landing guides are dark, hollow silhouettes with only the
    // colour motif/rim visible; they are not translucent full-colour balls.
    drawBall(ctx, cx, cy, d, ci, {alpha:0.105,scale:1.0,aura:0,ring:0,sq:0});
    ctx.save();
    ctx.globalAlpha=.34;ctx.strokeStyle=COLORS[ci].glow;ctx.lineWidth=Math.max(1.2,d*.045);
    ctx.shadowColor=COLORS[ci].glow;ctx.shadowBlur=d*.14;
    ctx.beginPath();ctx.arc(cx,cy,d*.455,0,TAU);ctx.stroke();ctx.restore();
}
let STATIC_BG_CANVAS=null;
const REFERENCE_HORIZON_Y=607;
function getStaticBackgroundCanvas(){
    if(STATIC_BG_CANVAS)return STATIC_BG_CANVAS;
    if(typeof document==="undefined")return null;
    const cv=document.createElement("canvas");
    cv.width=VW;cv.height=VH;
    const c=cv.getContext("2d");
    const g=c.createLinearGradient(0,0,0,VH);
    g.addColorStop(0,"#070616");g.addColorStop(0.56,"#0C0A24");g.addColorStop(.83,"#071225");g.addColorStop(1,"#050611");
    c.fillStyle=g;c.fillRect(0,0,VW,VH);
    for(const [x,y,col,r] of [[280,200,"#3C1D7A",380],[1000,260,"#0E5A7A",320],[560,660,"#7A1E58",400]]){
        const rg=c.createRadialGradient(x,y,0,x,y,r);rg.addColorStop(0,col+"55");rg.addColorStop(1,col+"00");c.fillStyle=rg;c.fillRect(x-r,y-r,r*2,r*2);
    }
    // Coloured star clusters and the glossy horizon/floor are persistent in
    // every gameplay capture. Bake them once so mobile rendering stays cheap.
    const rr=mulberry32(1701),starCols=["#50A8FF","#FF416D","#35F0A0","#BE59FF","#FFFFFF"];
    for(let i=0;i<210;i++){
        const x=rr()*VW,y=18+rr()*(REFERENCE_HORIZON_Y-36),r=.35+rr()*1.5;
        c.globalAlpha=.16+rr()*.58;c.fillStyle=starCols[(rr()*starCols.length)|0];
        c.beginPath();c.arc(x,y,r,0,TAU);c.fill();
    }
    c.globalAlpha=1;
    const hz=c.createLinearGradient(0,REFERENCE_HORIZON_Y-20,0,VH);
    hz.addColorStop(0,"rgba(49,102,158,.10)");hz.addColorStop(.18,"rgba(8,12,31,.62)");hz.addColorStop(1,"rgba(4,5,15,.92)");
    c.fillStyle=hz;c.fillRect(0,REFERENCE_HORIZON_Y-20,VW,VH-REFERENCE_HORIZON_Y+20);
    for(const [x,col] of [[ME.X+ME.BW/2,"#2FE3F5"],[FOE.X+FOE.BW/2,"#FF3EA5"]]){
        const rg=c.createRadialGradient(x,REFERENCE_HORIZON_Y+18,4,x,REFERENCE_HORIZON_Y+48,310);
        rg.addColorStop(0,col+"72");rg.addColorStop(.32,col+"22");rg.addColorStop(1,col+"00");
        c.fillStyle=rg;c.fillRect(x-330,REFERENCE_HORIZON_Y-10,660,VH-REFERENCE_HORIZON_Y+10);
    }
    c.lineCap="round";
    for(let i=0;i<78;i++){
        const y=REFERENCE_HORIZON_Y+6+rr()*(VH-REFERENCE_HORIZON_Y-8),left=rr()<.5;
        const cx=left?ME.X+ME.BW/2:FOE.X+FOE.BW/2,w=18+rr()*210;
        c.globalAlpha=.035+rr()*.18;c.strokeStyle=left?(rr()<.28?"#E9FBFF":"#2FE3F5"):(rr()<.28?"#FFF0FA":"#FF3EA5");
        c.lineWidth=.5+rr()*2.2;c.beginPath();c.moveTo(cx-w/2,y);c.lineTo(cx+w/2,y);c.stroke();
    }
    c.globalAlpha=1;
    STATIC_BG_CANVAS=cv;return cv;
}
function drawBackground(ctx,t,me=null,foe=null){
    const bg=getStaticBackgroundCanvas();if(bg)ctx.drawImage(bg,0,0,VW,VH);else{ctx.fillStyle="#080617";ctx.fillRect(0,0,VW,VH);}
    for(const s of STARS){ctx.globalAlpha=s.a*(0.55+0.45*Math.sin(t*1.6+s.p));ctx.fillStyle="#EAF3FF";ctx.fillRect(s.x,s.y,s.s,s.s);}
    ctx.globalAlpha=1;
    const active=[...(me?.fx?.formations||[]),...(foe?.fx?.formations||[])].sort((a,b)=>(b.life/b.max)-(a.life/a.max))[0];
    const warning=Math.max(me?.fx?.warn||0,foe?.fx?.warn||0);
    if(active||warning>0){
        const tint=active?.tint||"#FF3158",strength=active?Math.min(.19,.07+.13*(active.life/Math.max(.001,active.max))):warning*.09;
        ctx.save();ctx.globalCompositeOperation="screen";ctx.globalAlpha=strength;
        const wash=ctx.createRadialGradient(VW/2,VH*.47,40,VW/2,VH*.47,VW*.64);
        wash.addColorStop(0,tint+"DD");wash.addColorStop(.48,tint+"55");wash.addColorStop(1,tint+"00");
        ctx.fillStyle=wash;ctx.fillRect(0,0,VW,VH);ctx.restore();
    }
}

function drawAttackFlights(ctx,orbs){
    for(const o of orbs||[]){
        const u=Math.max(0,Math.min(1,o.t/Math.max(.001,o.dur))),e=u*u*(3-2*u);
        const from=o.side===0?ME:FOE,to=o.side===0?FOE:ME;
        const sx=from.X+from.BW/2,tx=to.X+to.BW/2,sy=from.Y-34,ty=to.Y-44;
        const x=sx+(tx-sx)*e,y=sy+(ty-sy)*e-Math.sin(Math.PI*e)*86;
        const count=Math.max(3,Math.min(9,(o.shapes?.length||0)+3)),d=15;
        ctx.save();ctx.globalCompositeOperation="screen";ctx.strokeStyle=o.tint||"#B9FFF0";ctx.lineWidth=2.4;ctx.shadowColor=o.tint||"#B9FFF0";ctx.shadowBlur=14;ctx.globalAlpha=Math.sin(Math.PI*Math.min(.98,u))*.9;
        for(let i=0;i<count;i++){const a=i*TAU/count+u*2.2,r=8+(i%3)*7;ctx.beginPath();ctx.arc(x+Math.cos(a)*r,y+Math.sin(a)*r,d*.45,0,TAU);ctx.stroke();}
        ctx.restore();
    }
}
