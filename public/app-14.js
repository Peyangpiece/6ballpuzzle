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
            const [px, py] = pos(drawVX, drawVY);
            if(cell.isGarbage&&Number.isFinite(v.garbageBubbleT))drawGarbageBubbleBall(ctx,px,py,D,cell.c,v.garbageBubbleT);
            else drawBall(ctx, px, py, D, cell.c, { alpha, scale, sq: v.sq, ring });
        }
    if (g.clearing && g.clearing.committed && Array.isArray(g.clearing.ghosts)) {
        const k = Math.min(1, g.stateT / Math.max(0.001, g.holdT));
        const cv = clearVisualState(k);
        for (const gh of g.clearing.ghosts) {const [px,py] = pos(gh.x, gh.y);drawBall(ctx, px, py, D, gh.c, {alpha:cv.alpha, scale:cv.scale, sq:0, ring:1});}
    }
    drawFormationEffects(ctx,g,pos,D);
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
        const dx = g.pieceVX - g.piece.x;const pulse = 0.75 + 0.25 * Math.sin(t * 7);const cells = pieceCells(g.piece);let dOff = dispOff(g.piece.rot),frac;
        if(g.hardDropAnim){const hk=Math.min(1,(g.hardDropAnim.t+renderLead)/Math.max(.001,g.hardDropAnim.dur));const vy=g.hardDropAnim.fromY+(g.hardDropAnim.target.y-g.hardDropAnim.fromY)*hk;frac=vy-g.piece.y;dOff*=1-smoothRotationT(hk);}else{const blocked=!pieceFits(g.board,{...g.piece,y:g.piece.y+2}),align=blocked?Math.max(0,1-Math.min(1,(g.lockT+renderLead)/LANDING_ALIGN_DURATION)):1;dOff*=align;const rawFrac=activeDropFraction(g,renderLead);frac=safeActiveFallOffset(g,cells,dx,dOff,rawFrac);}
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
const VALID_CELLS = (() => {const a = [];for (let y = BOARD_MIN_ROW; y < ROWS; y++) for (let x = 0; x < W2; x++) if (valid(x, y)) a.push([x, y]);return a;})();
function snapshotOf(g) {let s = "";for (const [x, y] of VALID_CELLS) {const c = g.board[y][x];s += String.fromCharCode(48 + (c ? c.c + 1 : 0));}return s;}
function applySnapshot(g, str) {if (typeof str !== "string" || str.length !== VALID_CELLS.length)return;for (let i = 0; i < VALID_CELLS.length; i++) {const [x, y] = VALID_CELLS[i], v = str.charCodeAt(i) - 48;const cur = g.board[y][x];if (v <= 0) {if (cur) g.board[y][x] = null;continue;}const c = v - 1;if (cur && cur.c === c)continue;const b = mkBall(g, c);g.board[y][x] = b;noteBoardCell(g.board,y,b);setVis(g, b, x, y, 0);}refreshBoardScanMin(g.board);}
function stepNetView(g, dt) {g.stateT += dt;g.fx.shake = 0;g.fx.warn = pendingIncomingCount(g) > 0 ? Math.min(1, g.fx.warn + dt * 4) : Math.max(0, g.fx.warn - dt * 4);g.fx.fastPulse = Math.max(0, (g.fx.fastPulse || 0) - dt * 7);g.fx.toasts = g.fx.toasts.filter((t) => (t.life -= dt) > 0);g.fx.rings = g.fx.rings.filter((r) => (r.life -= dt) > 0);g.fx.formations=(g.fx.formations||[]).filter((f)=>(f.life-=dt)>0);g.fx.sparks = g.fx.sparks.filter((s) => { s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 12 * dt; return s.life > 0; });for (let _vs = 0; _vs < 4; _vs++) updateVisuals(g, dt * 0.25);if (!g.alive)g.fx.sink = 0;}
