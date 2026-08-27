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

// Both local engines share the same requestAnimationFrame thread. During a
// received garbage sequence the target board previously ran the legacy visual
// integrator four times for every 120 Hz physics tick. A PYRAMID/HEXAGON chain
// therefore consumed enough main-thread time to make the *other* player's
// ordinary active triplet look frozen even though its logical engine was fine.
const __hexdropVisualSubstepCount=visualSubstepCount;
visualSubstepCount=function(g){
    if(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE")return 1;
    return __hexdropVisualSubstepCount(g);
};

// Individual garbage hand-off invariant: a falling centre may only enter a
// logical lattice cell at the same physical height or BELOW its continuous
// contact point. The old same-column search walked upward through occupied
// cells, so a ball already rendered around y=10 could be registered at y=8;
// because garbage is never allowed to move upward, that mismatch could never
// heal and eventually produced exact visual overlap with another gridified
// ball. Search only the one-diameter neighbourhood below the contact point.
// If no safe cell exists yet, return null and leave this one ball airborne for
// the next 120 Hz frame. No sibling is affected.
const __hexdropLegacyGarbageSingleLogicalCell=hexGarbageSingleLogicalCell;
hexGarbageSingleLogicalCell=function(g,x,visualY){
    if(!g||!Number.isFinite(x)||!Number.isFinite(visualY))return null;
    const firstY=Math.max(BOARD_MIN_ROW,Math.ceil(visualY-1e-7));
    const lastY=Math.min(ROWS-1,firstY+2);
    let best=null;
    for(let y=firstY;y<=lastY;y++){
        if(y+1e-7<visualY)continue;
        for(let dx=-2;dx<=2;dx++){
            const cx=x+dx;
            if(!valid(cx,y)||g.board[y][cx])continue;
            const realDist=Math.hypot((cx-x)*.5,(y-visualY)*HEX_ROW_H);
            if(realDist>1.000001)continue;
            if(!visualPointSafe(g,-1,cx,y,HEX_MIN_DIST))continue;
            const score=realDist+Math.abs(dx)*1e-5+(y-visualY)*1e-6;
            if(!best||score<best.score-1e-12||(Math.abs(score-best.score)<=1e-12&&cx<best.x))best={x:cx,y,score};
        }
    }
    return best?{x:best.x,y:best.y}:null;
};

// "Garbage does not collide with garbage while airborne" applies only while
// both balls are still airborne packets. The instant one ball has gridified it
// is an ordinary accumulated pile ball, so a later airborne sibling may touch
// that settled/gridified ball and only THAT sibling may then gridify. Airborne
// packs are not present in g.vis/g.board, so simply considering every board
// ball here gives the intended distinction without packet-to-packet collision.
const __hexdropLegacyGarbageBallContactY=hexGarbageBallContactY;
hexGarbageBallContactY=function(g,pack,index){
    if(!pack?.pat?.[index])return Infinity;
    const [dx,dy]=pack.pat[index],px=pack.ax+dx,H=HEX_ROW_H;
    let limit=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/H-dy;
    for(const [id,ov] of g.vis.entries()){
        if(!ov||!Number.isFinite(ov.x)||!Number.isFinite(ov.y))continue;
        const obstacle=hexGarbageBoardBallById(g,id);
        if(!obstacle)continue;
        const hx=Math.abs((px-ov.x)*.5);
        if(hx>=1-1e-10)continue;
        const vertical=Math.sqrt(Math.max(0,1-hx*hx))/H;
        limit=Math.min(limit,ov.y-dy-vertical);
    }
    return limit;
};

// Compute the active garbage lattice sequence in a single board scan. This is
// called several times in a GARBAGE frame, so avoid the previous double scan.
function __hexdropGarbageMotionQueue(g){
    let minSeq=Infinity;
    const queued=new Set(),entries=[];
    if(!g||g.state!=="RESOLVING"||g.phase!=="GARBAGE")return{minSeq,queued};
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        const seg=ball&&Array.isArray(ball.fallPath)&&ball.fallPath.length?ball.fallPath[0]:null;
        const seq=Number(seg?.motionSeq)||0;
        if(seq>0){entries.push({id:ball.id,isGarbage:!!ball.isGarbage,seq});minSeq=Math.min(minSeq,seq);}
    }
    if(Number.isFinite(minSeq))for(const e of entries)if(e.isGarbage&&e.seq>minSeq)queued.add(e.id);
    return{minSeq,queued};
}

// Later logical sequences remain visually stationary until the currently
// earliest lattice move has completed. Only already-gridified garbage is held;
// airborne siblings are not board balls and continue their free fall.
const __hexdropUpdateVisualsBeforeGarbageQueueGate=updateVisuals;
updateVisuals=function(g,dt){
    const {queued}=__hexdropGarbageMotionQueue(g);
    const held=[];
    if(queued.size){
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball||!queued.has(ball.id))continue;
            const v=g.vis.get(ball.id);
            if(!v)continue;
            held.push({
                ball,
                visual:{...v},
                path:ball.fallPath.map(seg=>({
                    ...seg,
                    from:Array.isArray(seg?.from)?[...seg.from]:seg?.from,
                    to:Array.isArray(seg?.to)?[...seg.to]:seg?.to,
                    pivot:Array.isArray(seg?.pivot)?[...seg.pivot]:seg?.pivot,
                    topPivot:Array.isArray(seg?.topPivot)?[...seg.topPivot]:seg?.topPivot,
                    followSupportIds:Array.isArray(seg?.followSupportIds)?[...seg.followSupportIds]:seg?.followSupportIds
                }))
            });
        }
    }

    __hexdropUpdateVisualsBeforeGarbageQueueGate(g,dt);

    for(const h of held){
        const v=g.vis.get(h.ball.id);
        if(v){
            for(const k of Object.keys(v))delete v[k];
            Object.assign(v,h.visual);
            v.vy=0;
            v.motionSpeed=0;
        }
        h.ball.fallPath=h.path;
    }
};

// Queued garbage is a fixed waiting obstacle. A garbage ball whose lattice path
// has fully completed is also fixed once its rendered Y has reached the logical
// row: its X is restored to the exact lattice centre and may no longer accumulate
// horizontal drift from later contact projections. Active/earlier balls absorb
// the correction instead. This preserves the rule that gridified balls never
// overlap while avoiding any upward Y correction.
const __hexdropResolveVisualContactsBeforeGarbageQueueGate=resolveVisualContacts;
resolveVisualContacts=function(g){
    const {queued}=__hexdropGarbageMotionQueue(g);
    const settled=new Set();

    if(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"){
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball?.isGarbage||Array.isArray(ball.fallPath)&&ball.fallPath.length)continue;
            const v=g.vis.get(ball.id);
            if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
            if(Math.abs(v.y-y)<=.02){
                v.x=x;
                if(v.y<=y+1e-9)v.y=y;
                v.vy=0;
                v.motionSpeed=0;
                settled.add(ball.id);
            }
        }
    }

    const fixed=new Set([...queued,...settled]);
    if(!fixed.size){
        __hexdropResolveVisualContactsBeforeGarbageQueueGate(g);
        return;
    }

    const savedMoving=g._visualMovingIds;
    const savedPaths=[];
    const forcedMoving=new Set();
    const heldVisual=[];

    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball)continue;
        if(fixed.has(ball.id)){
            const v=g.vis.get(ball.id);
            if(v)heldVisual.push({v,snapshot:{...v}});
            savedPaths.push({ball,path:ball.fallPath});
            ball.fallPath=[];
        }else{
            forcedMoving.add(ball.id);
        }
    }

    g._visualMovingIds=forcedMoving;
    __hexdropResolveVisualContactsBeforeGarbageQueueGate(g);

    for(const h of heldVisual){
        for(const k of Object.keys(h.v))delete h.v[k];
        Object.assign(h.v,h.snapshot);
        h.v.vy=0;
        h.v.motionSpeed=0;
    }
    for(const s of savedPaths)s.ball.fallPath=s.path;
    g._visualMovingIds=savedMoving;
};

// Network packets arrive at a much lower cadence than the 120 Hz game loop.
// Advance the opponent's airborne garbage with the same capture-derived
// absolute free-fall law used by the authoritative engine. Snapshot values
// remain a monotone lower bound, so packet refreshes never pull a shape upward.
stepNetGarbageMotion=function(g,dt){
    for(const p of g.activeGarbagePacks||[]){
        const snapshotAge=Number.isFinite(p.netBubbleT)?p.netBubbleT:(p.bubbleT||0);
        if(!Number.isFinite(p._netGarbageLead))p._netGarbageLead=0;
        p._netGarbageLead=Math.min(SNAP_MS/1000+.04,p._netGarbageLead+Math.max(0,dt));
        const age=Math.max(p.bubbleT||0,snapshotAge+p._netGarbageLead);
        p.bubbleT=age;
        if(age<=HEX_GARBAGE_BUBBLE_DURATION+1e-12){
            p.y=Math.max(GARBAGE_START_Y,Number.isFinite(p.netY)?p.netY:GARBAGE_START_Y);
            p.vy=0;
            continue;
        }
        const flightAge=age-HEX_GARBAGE_BUBBLE_DURATION;
        const referenceY=GARBAGE_START_Y+(HEX_GARBAGE_FLIGHT_V0*flightAge+.5*GRAV*flightAge*flightAge)/HEX_ROW_H;
        const snapshotY=Number.isFinite(p.netY)?p.netY:GARBAGE_START_Y;
        p.y=Math.max(Number.isFinite(p.y)?p.y:GARBAGE_START_Y,snapshotY,referenceY);
        p.vy=Math.max(Number.isFinite(p.netVy)?p.netVy:0,HEX_GARBAGE_FLIGHT_V0+GRAV*flightAge);
    }
};

window.__mountHexdrop = function () { ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App)); };
