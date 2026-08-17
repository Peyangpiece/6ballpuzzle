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
//
// The collision guard already sweeps each 1/120 s segment continuously with
// 12-48 samples, so repeating the complete board scan four times is redundant
// specifically during GARBAGE. Keep the exact garbage physics/cadence and run
// one visual integration at the fixed 120 Hz step. All non-garbage phases keep
// the validated adaptive substep policy unchanged.
const __hexdropVisualSubstepCount=visualSubstepCount;
visualSubstepCount=function(g){
    if(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE")return 1;
    return __hexdropVisualSubstepCount(g);
};

function __hexdropGarbageMotionQueue(g){
    let minSeq=Infinity;
    const queued=new Set();
    if(!g||g.state!=="RESOLVING"||g.phase!=="GARBAGE")return{minSeq,queued};
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        const seg=ball&&Array.isArray(ball.fallPath)&&ball.fallPath.length?ball.fallPath[0]:null;
        const seq=Number(seg?.motionSeq)||0;
        if(seq>0)minSeq=Math.min(minSeq,seq);
    }
    if(!Number.isFinite(minSeq))return{minSeq,queued};
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball?.isGarbage||!Array.isArray(ball.fallPath)||!ball.fallPath.length)continue;
        const seq=Number(ball.fallPath[0]?.motionSeq)||0;
        if(seq>minSeq)queued.add(ball.id);
    }
    return{minSeq,queued};
}

// Logical garbage settling assigns a strict motionSeq to every lattice move.
// Later sequences must not start while an earlier sequence is still crossing
// the same cells. Freeze only queued, already-gridified garbage; airborne
// siblings are not board balls and are therefore untouched by this gate.
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

// A queued garbage ball is a fixed waiting obstacle, not an active mover.
// Without this guard the final contact projection gradually pushed the waiting
// ball away from its safe hand-off point even though updateVisuals restored it
// every frame. Temporarily classify every non-queued board ball as movable and
// queued balls as immovable, then restore the normal motion metadata. This
// makes the active/earlier ball avoid the queue rather than displacing it.
const __hexdropResolveVisualContactsBeforeGarbageQueueGate=resolveVisualContacts;
resolveVisualContacts=function(g){
    const {queued}=__hexdropGarbageMotionQueue(g);
    if(!queued.size){
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
        if(queued.has(ball.id)){
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

    // The generic solver splits stationary/stationary penetration. Restore the
    // queued centers exactly so even a queued/queued numerical contact cannot
    // cause queue drift; non-queued balls keep their projected correction.
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
