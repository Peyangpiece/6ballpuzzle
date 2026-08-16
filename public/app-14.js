function drawSide(ctx, g, L, side, t, label, sub, big, renderLead=0) {
    const { D, X, Y, BW, BH } = L;
    // Centre the lattice when the neon frame contains a small side gutter.
    const ox = X + (BW - (W2 - 1) * D * 0.5) / 2, oy = Y + D / 2;
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
    ctx.fillStyle = "rgba(6,5,20,0.24)";
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
    ctx.rect(X, Y - D * 2.7, BW, BH + D * 2.7);
    ctx.clip();
    if (Array.isArray(g.activeGarbagePacks)) {
        for (const pack of g.activeGarbagePacks) {
            if (!pack || pack.landed || !pack._started) continue;
            for (let i=0;i<pack.pat.length;i++) {
                const [dx,dy]=pack.pat[i];
                const [px,py]=pos(pack.ax+dx, pack.y+dy);
                drawGarbageBubbleBall(ctx,px,py,D,pack.colors[i],Math.max(0,pack.bubbleT||0));
            }
        }
    }
    for (let y = boardScanMin(g.board); y < ROWS; y++)
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
            let [px, py] = pos(drawVX, drawVY);
            let deathAlpha=1;
            if(g.state==="GAMEOVER"){
                const delay=Math.max(0,(ROWS-1-y)*.075),dk=Math.max(0,Math.min(1,(g.stateT-.48-delay)/1.85));
                deathAlpha=1-dk;py+=D*1.45*dk*dk;ctx.filter="grayscale(1) brightness(.82) contrast(.92)";
            }
            if(cell.isGarbage&&Number.isFinite(v.garbageBubbleT))drawGarbageBubbleBall(ctx,px,py,D,cell.c,v.garbageBubbleT);
            else drawBall(ctx, px, py, D, cell.c, { alpha:alpha*deathAlpha, scale, sq: v.sq, ring });
            ctx.filter="none";
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
    // Technique glyphs intentionally extend above and slightly beyond the
    // neon playfield in the reference. Draw them after releasing the board
    // clip; balls and ordinary sparks remain clipped.
    drawFormationEffects(ctx,g,pos,D);
    if (g.state === "PLAYING" && g.piece) {
        const shadowCells = landingShadowVisualCells(g);
        if (shadowCells) {const safeShadowPx=rigidShadowPixelPlacement(g,shadowCells,pos,D,X,Y,BW,BH);for(const [spx,spy,sc] of safeShadowPx) drawLandingShadowBall(ctx,spx,spy,D,sc);}
    }
    if ((g.state === "PLAYING" || g.state === "NET") && g.piece) {
        const dx = g.pieceVX - g.piece.x;const pulse = 0.75 + 0.25 * Math.sin(t * 7);const cells = pieceCells(g.piece);let dOff = dispOff(g.piece.rot),frac;
        if(g.state==="NET"){frac=Number.isFinite(g.netPieceFrac)?g.netPieceFrac:0;}
        else if(g.hardDropAnim){const hk=Math.min(1,(g.hardDropAnim.t+renderLead)/Math.max(.001,g.hardDropAnim.dur));const vy=g.hardDropAnim.fromY+(g.hardDropAnim.target.y-g.hardDropAnim.fromY)*hk;frac=vy-g.piece.y;dOff*=1-smoothRotationT(hk);}else{const blocked=!pieceFits(g.board,{...g.piece,y:g.piece.y+2}),align=blocked?Math.max(0,1-Math.min(1,(g.lockT+renderLead)/LANDING_ALIGN_DURATION)):1;dOff*=align;const rawFrac=activeDropFraction(g,renderLead);frac=safeActiveFallOffset(g,cells,dx,dOff,rawFrac);}
        const pts = cells.map(([x, y]) => pos(x + dx, y + frac + dOff));
        const gx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;const gy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
        const ra = g.rotAnim;const renderRotP=Math.min(1,ra.p+renderLead/ROTATE_VISUAL_TIME);const k = renderRotP < 1 ? 1 - smoothRotationT(renderRotP) : 0;const ang = -k * ra.dir * (TAU / 6);const ca = Math.cos(ang), sa = Math.sin(ang);const ox2 = k * (ra.dx || 0) * D * 0.5;const oy2 = k * (ra.dy || 0) * D * HEX_ROW_H;
        const renderPts = pts.map((pt) => {let px = pt[0], py = pt[1];if (k) {const ax = px - gx, ay = py - gy;px = gx + ax * ca - ay * sa + ox2;py = gy + ax * sa + ay * ca + oy2;}return [px, py];});
        const lift=0;
        if(g.hardDropAnim){
            const top=Math.min(...renderPts.map(p=>p[1]))-D*2.8,bottom=Math.max(...renderPts.map(p=>p[1]))+D*.4;
            ctx.save();ctx.globalCompositeOperation="screen";const beam=ctx.createLinearGradient(0,top,0,bottom);beam.addColorStop(0,"rgba(255,255,255,0)");beam.addColorStop(.58,"rgba(225,242,255,.13)");beam.addColorStop(1,"rgba(255,255,255,.52)");ctx.fillStyle=beam;ctx.shadowColor="#FFFFFF";ctx.shadowBlur=D*.8;ctx.fillRect(gx-D*.72,top,D*1.44,bottom-top);ctx.restore();
            for(let tr=1;tr<=4;tr++){const a=(5-tr)/5,trailY=D*(.30+tr*.24);renderPts.forEach((pt,i)=>drawBall(ctx,pt[0],pt[1]+lift-trailY,D,cells[i][2],{alpha:.07*a,scale:.96,aura:0}));}
        }
        renderPts.forEach((pt, i) => drawBall(ctx, pt[0], pt[1] + lift, D, cells[i][2], { aura: pulse * (big ? 1 : 0.5) }));
    }
    for (const r of g.fx.rings) {const k = 1 - r.life / r.max;ctx.save();ctx.globalAlpha = (1 - k) * 0.85;ctx.strokeStyle = r.tint;ctx.lineWidth = 7 * (1 - k) + 1;ctx.shadowColor = r.tint;ctx.shadowBlur = 26;ctx.beginPath();ctx.arc(X + BW / 2, Y + BH / 2, 24 + k * BW * 0.8, 0, TAU);ctx.stroke();ctx.restore();}
    drawIncomingPreviews(ctx,g,L);
    const nw = 128, nh = 106;const nx0 = side === 0 ? X - nw + 5 : X + BW - 5, ny0 = 35;
    ctx.save();ctx.strokeStyle = "rgba(255,255,255,0.5)";ctx.lineWidth = 2;ctx.fillStyle = "rgba(255,255,255,0.05)";ctx.beginPath();ctx.rect(nx0, ny0, nw, nh);ctx.fill();ctx.stroke();
    // The reference keeps both NEXT windows empty throughout READY. They are
    // populated on the same frame that the first active triplets appear.
    const nd = 42, ncx = nx0 + nw / 2, ncy = ny0 + nh / 2, q = g.state === "READY" ? null : g.queue[0];
    if (q) {drawBall(ctx, ncx - nd * 0.5, ncy - nd * 0.42, nd, q[0], {});drawBall(ctx, ncx + nd * 0.5, ncy - nd * 0.42, nd, q[1], {});drawBall(ctx, ncx, ncy + nd * 0.42, nd, q[2], {});}
    ctx.font = "900 17px ui-sans-serif, system-ui, sans-serif";ctx.fillStyle = "rgba(255,255,255,0.94)";ctx.textAlign = "center";ctx.textBaseline = "top";ctx.fillText("つぎ", ncx, ny0 + nh + 7);ctx.restore();
    const avx=side===0?44:VW-44,avy=36;
    ctx.save();ctx.beginPath();ctx.arc(avx,avy,25,0,TAU);ctx.fillStyle=side===0?"#A9F68A":"#747C89";ctx.fill();ctx.lineWidth=2;ctx.strokeStyle="rgba(255,255,255,.88)";ctx.stroke();ctx.beginPath();ctx.arc(avx,avy-5,7,0,TAU);ctx.fillStyle="rgba(25,24,38,.72)";ctx.fill();ctx.beginPath();ctx.ellipse(avx,avy+11,13,8,0,Math.PI,TAU);ctx.fill();ctx.font="900 8px ui-sans-serif,system-ui,sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle="#FFFFFF";ctx.fillText((label||"").slice(0,7),avx,avy+31);ctx.restore();
    for (const t2 of g.fx.toasts) {const k = t2.life / t2.max;const size = t2.waza ? 40 : 28+t2.big*38;ctx.save();ctx.globalAlpha = Math.min(1, k * 3);ctx.font = `900 ${size * (1 + (1 - k) * 0.08)}px ui-sans-serif, system-ui, sans-serif`;ctx.textAlign = "center";ctx.textBaseline = "middle";ctx.lineJoin="round";ctx.strokeStyle="rgba(0,0,0,.68)";ctx.lineWidth=t2.waza?7:4;ctx.shadowColor = t2.tint;ctx.shadowBlur = 24;const ty=t2.waza?Y+BH+48:Y+BH*(t2.sub?0.58:0.44)-(1-k)*26;ctx.strokeText(t2.text,X+BW/2,ty);ctx.fillStyle = "#FFFFFF";ctx.fillText(t2.text, X + BW / 2,ty);ctx.restore();}
    ctx.restore();
}
function drawMatchIntro(ctx,g){
    if(g.state!=="READY")return;
    // A short black-to-board reveal separates the menu from the match.
    if(g.stateT<READY_FADE_IN_DURATION){ctx.save();ctx.globalAlpha=1-Math.min(1,g.stateT/READY_FADE_IN_DURATION);ctx.fillStyle="#000000";ctx.fillRect(0,0,VW,VH);ctx.restore();}
    let text="",begin=0,end=0;
    if(g.stateT>=READY_RULE_BEGIN&&g.stateT<READY_RULE_END){text="同じ色を6つつなげよう！";begin=READY_RULE_BEGIN;end=READY_RULE_END;}
    else if(g.stateT>=READY_START_BEGIN&&g.stateT<READY_START_END){text="スタート！";begin=READY_START_BEGIN;end=READY_START_END;}
    if(!text)return;
    const edge=Math.min(g.stateT-begin,end-g.stateT),a=Math.min(1,Math.max(0,edge)/.18),cx=VW/2,cy=400;
    ctx.save();ctx.globalAlpha=a;ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.font=`900 ${text==="スタート！"?56:42}px ui-sans-serif,system-ui,sans-serif`;
    ctx.lineJoin="round";ctx.lineWidth=text==="スタート！"?10:8;ctx.strokeStyle="rgba(0,0,0,.78)";ctx.shadowColor="#FFFFFF";ctx.shadowBlur=13;
    ctx.strokeText(text,cx,cy);ctx.fillStyle="#FFFFFF";ctx.fillText(text,cx,cy);ctx.restore();
}
function renderScene(ctx, me, foe, orbs, t, labels, dropFlash, helpAlpha = 1, renderLead=0) {drawBackground(ctx,t,me,foe);drawSide(ctx,me,ME,0,t,labels.me,labels.meSub,true,renderLead);drawSide(ctx,foe,FOE,1,t,labels.foe,labels.foeSub,true,renderLead);drawAttackFlights(ctx,orbs);drawMatchIntro(ctx,me);}
const SPACE_BG = "radial-gradient(1000px 500px at 20% 15%, #3C1D7A55, transparent 60%)," + "radial-gradient(900px 500px at 85% 30%, #0E5A7A55, transparent 60%)," + "radial-gradient(900px 600px at 50% 100%, #7A1E5844, transparent 60%)," + "linear-gradient(180deg,#080617 0%,#100B2B 55%,#060512 100%)";
function Neon({ children, onClick, tone = "cyan", disabled }) {
    const c = tone === "cyan" ? "#2FE3F5" : tone === "pink" ? "#FF3EA5" : "#B9C4E8";const [hover, setHover] = useState(false);const [down, setDown] = useState(false);
    return (React.createElement("button", { onClick: onClick, disabled: disabled, onPointerEnter: () => setHover(true), onPointerLeave: () => { setHover(false); setDown(false); }, onPointerDown: () => setDown(true), onPointerUp: () => setDown(false), className: "w-full rounded-2xl py-3.5 font-extrabold tracking-wide disabled:opacity-30 relative overflow-hidden", style: {color:c,border:`1.5px solid ${c}${hover ? "" : "aa"}`,background:`linear-gradient(160deg, rgba(255,255,255,${hover ? 0.13 : 0.07}), rgba(255,255,255,0.02))`,backdropFilter:"blur(14px)",WebkitBackdropFilter:"blur(14px)",boxShadow:down?`0 0 10px ${c}44, inset 0 2px 10px rgba(0,0,0,.45)`:`0 8px 22px rgba(0,0,0,.45), 0 0 ${hover ? 30 : 16}px ${c}55, inset 0 1px 0 rgba(255,255,255,.28)`,textShadow:`0 0 14px ${c}cc`,transform:down?"translateY(2px) scale(.985)":hover?"translateY(-1px)":"none",transition:"transform .12s cubic-bezier(.2,.8,.3,1), box-shadow .18s ease, background .18s ease"} }, children));
}
function Screen({ children, title, back }) {
    const [shown, setShown] = useState(false);useEffect(() => { const t = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(t); }, []);
    return (React.createElement("div", { className: "absolute inset-0 z-20 flex flex-col items-center justify-center font-sans overflow-y-auto", style: {background:SPACE_BG,opacity:shown?1:0,transform:shown?"none":"scale(1.015)",transition:"opacity .28s ease, transform .28s cubic-bezier(.2,.8,.3,1)",paddingTop:"max(20px, env(safe-area-inset-top))",paddingBottom:"max(20px, env(safe-area-inset-bottom))",paddingLeft:"max(20px, env(safe-area-inset-left))",paddingRight:"max(20px, env(safe-area-inset-right))"} },React.createElement("div", { className: "w-full max-w-sm flex flex-col" },(title || back) && (React.createElement("div", { className: "flex items-center gap-3 mb-5" },back && React.createElement("button", { onClick: back, className: "w-9 h-9 rounded-xl text-white/70 border border-white/20 bg-white/5" }, "←"),React.createElement("div", { className: "font-extrabold text-white/90 tracking-wide" }, title))),children)));
}
function ResultOverlay({win,onNext,onExit}){
    const [phase,setPhase]=useState(0);
    useEffect(()=>{const a=requestAnimationFrame(()=>setPhase(1)),b=setTimeout(()=>setPhase(2),240),c=setTimeout(()=>setPhase(3),520);return()=>{cancelAnimationFrame(a);clearTimeout(b);clearTimeout(c);};},[]);
    const card=(winner,left)=>React.createElement("div",{className:"relative flex-1 h-[68vh] flex flex-col items-center justify-center",style:{maxWidth:"42vw"}},
        winner&&React.createElement("div",{className:"absolute w-56 h-56 rounded-full",style:{opacity:phase>=3?.72:0,transform:`scale(${phase>=3?1:.22}) rotate(${phase>=3?18:0}deg)`,transition:"opacity .28s ease, transform .46s cubic-bezier(.18,.82,.22,1)",background:"repeating-conic-gradient(from 0deg,rgba(255,255,255,.92) 0deg,rgba(255,255,255,.92) 7deg,transparent 7deg,transparent 31deg)",filter:"blur(1px)",maskImage:"radial-gradient(circle,transparent 0 23%,#000 25% 68%,transparent 70%)",WebkitMaskImage:"radial-gradient(circle,transparent 0 23%,#000 25% 68%,transparent 70%)"}}),
        winner&&React.createElement("div",{className:"absolute top-[20%] text-4xl",style:{opacity:phase>=3?1:0,transform:`translateY(${phase>=3?0:12}px) scale(${phase>=3?1:.6})`,transition:"opacity .25s ease, transform .35s cubic-bezier(.18,.82,.22,1)",filter:"drop-shadow(0 0 14px #FFF36B)"}},"♛"),
        React.createElement("div",{className:"relative w-16 h-16 rounded-full border-4 flex items-center justify-center text-3xl font-black",style:{opacity:phase>=1?1:0,transform:`scale(${phase>=1?1:.18})`,transition:"opacity .2s ease, transform .34s cubic-bezier(.15,.9,.2,1.18)",color:winner?"#5b4210":"#D6D8E0",borderColor:winner?"#FFF36B":"#D6D8E0",background:winner?"radial-gradient(circle at 35% 30%,#FFF8A8,#E7A914 72%)":"linear-gradient(145deg,#88909D,#424854)",boxShadow:winner?"0 0 0 7px #FFD83B55,0 0 34px #FFF36B88":"0 0 20px #FFFFFF22"}},winner?"★":"●"),
        React.createElement("div",{className:"mt-4 text-5xl font-black tracking-tight text-white",style:{opacity:phase>=2?1:0,transform:`translateY(${phase>=2?0:10}px)`,transition:"opacity .25s ease, transform .3s ease",textShadow:"0 4px 0 #111,0 0 18px #FFFFFF44"}},winner?"Winner!":"Lose..."),
        winner&&React.createElement("div",{className:"mt-1 text-2xl text-[#FFF36B] tracking-[.5em]",style:{opacity:phase>=3?1:0,transition:"opacity .25s ease"}},"♛—♛")
    );
    return React.createElement("div",{className:"absolute inset-0 z-20 flex flex-col items-center justify-center",style:{background:phase?"rgba(38,0,43,.64)":"rgba(38,0,43,0)",backdropFilter:`blur(${phase?6:0}px)`,WebkitBackdropFilter:`blur(${phase?6:0}px)`,transition:"background .3s ease, backdrop-filter .3s ease"}},
        React.createElement("div",{className:"w-full px-[10vw] flex items-center justify-between gap-[8vw]"},card(!!win,true),card(!win,false)),
        React.createElement("div",{className:"absolute right-6 bottom-5 flex gap-8 text-white font-extrabold"},
            React.createElement("button",{onClick:onExit,className:"px-4 py-2 rounded-xl bg-black/25 border border-white/15"},"○○ ヒント"),
            React.createElement("button",{onClick:onNext,className:"px-5 py-2 rounded-xl bg-black/25 border border-white/15"},"○○ つぎへ")
        )
    );
}
const FIREBASE_CONFIG = {apiKey:"AIzaSyAanVETIredUVH1slS8OtIMSPdOn91u2HM",authDomain:"ballpuzzle-8cc87.firebaseapp.com",databaseURL:"https://ballpuzzle-8cc87-default-rtdb.asia-southeast1.firebasedatabase.app",projectId:"ballpuzzle-8cc87",storageBucket:"ballpuzzle-8cc87.firebasestorage.app",messagingSenderId:"114162791129",appId:"1:114162791129:web:14a0fc04ca3c6f5d9f84c8"};
const BANDW = 150, STALE_MS = 20000, WAIT_MS = 1600, SNAP_MS = 200, GRACE_MS = 5000;
const bandOf = (r) => Math.max(0, Math.min(19, Math.floor(r / BANDW)));
const eloDelta = (mine, foe, win) => Math.round(32 * ((win ? 1 : 0) - 1 / (1 + Math.pow(10, (foe - mine) / 400))));
const VALID_CELLS = (() => {const a = [];for (let y = BOARD_MIN_ROW; y < ROWS; y++) for (let x = 0; x < W2; x++) if (valid(x, y)) a.push([x, y]);return a;})();
function snapshotOf(g) {let s = "";for (const [x, y] of VALID_CELLS) {const c = g.board[y][x];s += String.fromCharCode(48 + (c ? c.c + 1 : 0));}return s;}
function remotePieceVisualSources(g){
    if(!g?.piece)return[];
    const dx=(Number.isFinite(g.pieceVX)?g.pieceVX:g.piece.x)-g.piece.x;
    const frac=Number.isFinite(g.netPieceFrac)?g.netPieceFrac:0;
    const off=dispOff(g.piece.rot);
    return pieceCells(g.piece).map(([x,y,c])=>({c,x:x+dx,y:y+frac+off,active:true}));
}
function applySnapshot(g, str) {
    if (typeof str !== "string" || str.length !== VALID_CELLS.length)return;
    const targets=VALID_CELLS.map(([x,y],i)=>({x,y,c:str.charCodeAt(i)-49}));
    const keep=new Set(),pool=[];
    for(const t of targets){
        const cur=g.board[t.y][t.x];
        if(t.c>=0&&cur&&cur.c===t.c){keep.add(cur.id);continue;}
        if(cur){const v=g.vis.get(cur.id);pool.push({ball:cur,c:cur.c,x:v?.x??t.x,y:v?.y??t.y,active:false});}
    }
    pool.push(...remotePieceVisualSources(g));
    for(const [x,y] of VALID_CELLS){const cur=g.board[y][x];if(cur&&!keep.has(cur.id))g.board[y][x]=null;}
    const used=new Set();
    for(const t of targets){
        if(t.c<0)continue;
        const cur=g.board[t.y][t.x];if(cur&&cur.c===t.c)continue;
        let best=-1,bestD=Infinity;
        for(let j=0;j<pool.length;j++){
            if(used.has(j)||pool[j].c!==t.c)continue;
            const d=Math.hypot((pool[j].x-t.x)*.5,(pool[j].y-t.y)*HEX_ROW_H);
            if(d<bestD){bestD=d;best=j;}
        }
        let b;
        if(best>=0){
            used.add(best);const src=pool[best];
            b=src.ball||mkBall(g,t.c);
            hexPhysClearGroupBall(b);delete b.fallPath;
            if(src.active)setVis(g,b,src.x,src.y,Math.max(0,REFERENCE_FALL_PX_PER_SEC/REFERENCE_BALL_PX));
        }else{
            b=mkBall(g,t.c);setVis(g,b,t.x,t.y,0);
        }
        g.board[t.y][t.x]=b;noteBoardCell(g.board,t.y,b);
    }
    refreshBoardScanMin(g.board);
}
function pieceSnapshotOf(g){
    if(!g?.piece)return null;
    let frac=activeDropFraction(g);
    if(g.hardDropAnim){const h=g.hardDropAnim,k=Math.min(1,h.t/Math.max(.001,h.dur));frac=h.fromY+(h.target.y-h.fromY)*k-g.piece.y;}
    return{x:g.piece.x,y:g.piece.y,r:g.piece.rot,c:g.piece.colors.slice(0,3),vx:Number.isFinite(g.pieceVX)?+g.pieceVX.toFixed(3):g.piece.x,f:+frac.toFixed(3),m:pieceFits(g.board,{...g.piece,y:g.piece.y+2})?1:0,s:g.fastForward?FAST_DROP_MULTIPLIER:1,q:(g.queue[0]||[]).slice(0,3)};
}
function remoteFxSnapshotOf(g){
    const f=(g?.fx?.formations||[])[0],toast=(g?.fx?.toasts||[]).find(t=>t.waza);
    const garbage=(g?.activeGarbagePacks||[]).filter(p=>p&&p._started&&!p.landed).map(p=>({type:p.type,seq:p.seq,pat:p.pat.map(q=>q.slice(0,2)),ax:p.ax,y:+p.y.toFixed(3),vy:+(p.vy||0).toFixed(3),bubbleT:+(p.bubbleT||0).toFixed(3),colors:p.colors.slice()}));
    return{f:f?{w:f.w,cells:f.cells.slice(0,24),tint:f.tint,life:+f.life.toFixed(2),max:f.max,pointDown:!!f.pointDown}:null,t:toast?{text:toast.text,life:+toast.life.toFixed(2),max:toast.max,tint:toast.tint,waza:true,big:toast.big||.45}:null,g:garbage};
}
function applyRemoteVisualState(g,st){
    const p=st?.piece;
    if(p&&Array.isArray(p.c)&&p.c.length===3&&p.c.every(c=>Number.isInteger(c)&&c>=0&&c<COLORS.length)){
        const old=g.piece?{...g.piece}:null;
        const oldVX=Number.isFinite(g.pieceVX)?g.pieceVX:(old?.x??(+p.x||0));
        const oldVY=old?(old.y+(Number.isFinite(g.netPieceFrac)?g.netPieceFrac:0)):(Number.isFinite(+p.y)?+p.y:-2);
        const next={x:+p.x||0,y:Number.isFinite(+p.y)?+p.y:-2,rot:(+p.r||0)%6,colors:p.c.slice(0,3)};
        const rawY=next.y+(Number.isFinite(+p.f)?+p.f:0);
        const sameDrop=!!old&&old.colors.join(",")===next.colors.join(",")&&rawY>=oldVY-1;
        g.piece=next;
        if(sameDrop){
            g.netPieceVisualX=oldVX;g.netPieceVisualY=oldVY;
            const lead=(p.m?1:0)*(2/DROP_INTERVAL)*(Number.isFinite(+p.s)?Math.max(1,+p.s):1)*(SNAP_MS/1000);
            g.netPieceTargetX=Number.isFinite(+p.vx)?+p.vx:next.x;
            g.netPieceTargetY=rawY+lead;
            g.netPieceBlendLeft=SNAP_MS/1000;
            const delta=(next.rot-old.rot+6)%6;
            if(delta===1||delta===5){const before=centroidOf(old),after=centroidOf(next);g.rotAnim={p:0,dir:delta===1?1:-1,dx:before[0]-after[0],dy:before[1]-after[1]};}
        }else{
            g.netPieceVisualX=Number.isFinite(+p.vx)?+p.vx:next.x;g.netPieceVisualY=rawY;
            g.netPieceTargetX=g.netPieceVisualX;g.netPieceTargetY=rawY;g.netPieceBlendLeft=0;g.rotAnim={p:1,dir:1,dx:0,dy:0};
        }
        g.pieceVX=g.netPieceVisualX;g.netPieceFrac=g.netPieceVisualY-next.y;
        if(Array.isArray(p.q)&&p.q.length===3)g.queue[0]=p.q.slice(0,3);
    }else{g.piece=null;g.netPieceFrac=0;g.netPieceBlendLeft=0;}
    const fx=st?.fx;
    if(fx?.f)g.fx.formations=[{...fx.f,cells:(fx.f.cells||[]).map(c=>c.slice(0,2))}];else g.fx.formations=[];
    if(fx?.t){const incoming=g.fx.toasts.filter(t=>!t.waza);g.fx.toasts=[...incoming,{...fx.t}];}else g.fx.toasts=g.fx.toasts.filter(t=>!t.waza);
    const oldPacks=new Map((g.activeGarbagePacks||[]).map(q=>[q.type+":"+q.seq,q]));
    g.activeGarbagePacks=(fx?.g||[]).map(q=>{
        const old=oldPacks.get(q.type+":"+q.seq);
        return{...q,_started:true,landed:false,y:old?.y??q.y,vy:old?.vy??q.vy,bubbleT:old?.bubbleT??q.bubbleT,netY:q.y,netVy:q.vy,netBubbleT:q.bubbleT};
    });
}
function stepNetPieceMotion(g,dt){
    if(!g.piece||!Number.isFinite(g.netPieceTargetX)||!Number.isFinite(g.netPieceTargetY))return;
    const left=Math.max(dt,g.netPieceBlendLeft||dt),k=Math.min(1,dt/left);
    g.netPieceVisualX+=(g.netPieceTargetX-g.netPieceVisualX)*k;
    const ny=g.netPieceVisualY+(g.netPieceTargetY-g.netPieceVisualY)*k;
    g.netPieceVisualY=Math.max(g.netPieceVisualY,ny);
    g.netPieceBlendLeft=Math.max(0,(g.netPieceBlendLeft||0)-dt);
    g.pieceVX=g.netPieceVisualX;g.netPieceFrac=g.netPieceVisualY-g.piece.y;
}
function stepNetGarbageMotion(g,dt){
    for(const p of g.activeGarbagePacks||[]){
        const prevAge=Math.max(p.bubbleT||0,p.netBubbleT||0),nextAge=prevAge+dt;
        p.bubbleT=nextAge;
        const fallDt=Math.max(0,nextAge-HEX_GARBAGE_BUBBLE_DURATION)-Math.max(0,prevAge-HEX_GARBAGE_BUBBLE_DURATION);
        if(fallDt<=1e-12)continue;
        const vy=Math.max(p.vy||0,p.netVy||0),y=Math.max(p.y||GARBAGE_START_Y,p.netY||GARBAGE_START_Y);
        p.y=y+vy*fallDt+.5*GRAV*fallDt*fallDt;
        p.vy=vy+GRAV*fallDt;
    }
}
function stepNetView(g, dt) {g.stateT += dt;stepNetPieceMotion(g,dt);stepNetGarbageMotion(g,dt);g.fx.shake = 0;g.fx.warn = pendingIncomingCount(g) > 0 ? Math.min(1, g.fx.warn + dt * 4) : Math.max(0, g.fx.warn - dt * 4);g.fx.fastPulse = Math.max(0, (g.fx.fastPulse || 0) - dt * 7);g.fx.toasts = g.fx.toasts.filter((t) => (t.life -= dt) > 0);g.fx.rings = g.fx.rings.filter((r) => (r.life -= dt) > 0);g.fx.formations=(g.fx.formations||[]).filter((f)=>(f.life-=dt)>0);g.fx.incomingPreviews=(g.fx.incomingPreviews||[]).filter((f)=>(f.life-=dt)>0);g.fx.sparks = g.fx.sparks.filter((s) => { s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 12 * dt; return s.life > 0; });const n=visualSubstepCount(g),h=dt/n;for(let i=0;i<n;i++)updateVisuals(g,h);if (!g.alive)g.fx.sink = 0;}
