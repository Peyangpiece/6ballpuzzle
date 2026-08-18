/* Simultaneous current-batch garbage motion.
 *
 * app-08 integrates ordinary single-ball paths sequentially inside one 120 Hz
 * frame. Two incoming garbage balls that are already tangent and both still
 * moving can therefore deadlock: the first sees the second at its PREVIOUS
 * frame position, clamps, then the second sees the first and clamps as well.
 *
 * During the integration of one frame, other current-batch garbage balls that
 * also still have fallPath are not treated as stationary obstacles. All of
 * them advance on their canonical paths, then the ordinary contact resolver
 * sees their common end-of-frame positions and enforces separation. Settled
 * garbage and the pre-batch frozen pile remain full collision obstacles.
 *
 * A second guard fixes the final few pixels of a canonical arc. app-08 resets
 * arc progress whenever its end-point completion is clamped once. With several
 * tangent moving garbage balls this can repeat forever at the exact same point.
 * If a motionSeq=0 arc is already within a tiny physical distance of its own
 * canonical `to` cell and that endpoint is safe against every STATIC obstacle,
 * finish only that existing segment. This is not a push/re-route: the position
 * used is the solver-authored fallPath endpoint itself.
 */
(function installGarbageSimultaneousMotion(){
    if(typeof window==="undefined"||window.__hexGarbageSimultaneousMotion)return;
    window.__hexGarbageSimultaneousMotion=true;

    const ARC_FINISH_EPS=0.040;
    const STATIC_MIN_DIST=0.999999;

    function boardEntryById(g,id){
        if(!g?.board)return null;
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const b=valid(x,y)?g.board[y][x]:null;
            if(b?.id===id)return{ball:b,x,y,v:g.vis.get(id)};
        }
        return null;
    }
    function ballById(g,id){return boardEntryById(g,id)?.ball||null;}
    function activeCurrentGarbage(ball){
        return !!ball?.isGarbage&&!ball.garbagePhaseFrozen&&
            Array.isArray(ball.fallPath)&&ball.fallPath.length>0;
    }
    function physicalDist(ax,ay,bx,by){
        return Math.hypot((ax-bx)*0.5,(ay-by)*HEX_ROW_H);
    }
    function samePhysicalPoint(a,b,eps=1e-6){
        return Array.isArray(a)&&Array.isArray(b)&&physicalDist(a[0],a[1],b[0],b[1])<=eps;
    }

    const baseVisualPointSafe=visualPointSafe;
    visualPointSafe=function(g,id,x,y,minDist=STATIC_MIN_DIST){
        if(!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"))
            return baseVisualPointSafe(g,id,x,y,minDist);
        const moving=ballById(g,id);
        if(!activeCurrentGarbage(moving))return baseVisualPointSafe(g,id,x,y,minDist);

        const hidden=[];
        // Hide only other moving members of THIS incoming phase. A ball whose
        // path has completed is already part of the receiving pile and must
        // block normally. Original frozen pile balls always block normally.
        for(const [oid,ov] of g.vis.entries()){
            if(oid===id||!ov)continue;
            const other=ballById(g,oid);
            if(!activeCurrentGarbage(other))continue;
            hidden.push([oid,ov]);
        }
        if(!hidden.length)return baseVisualPointSafe(g,id,x,y,minDist);
        for(const [oid] of hidden)g.vis.delete(oid);
        try{return baseVisualPointSafe(g,id,x,y,minDist);}
        finally{for(const [oid,ov] of hidden)g.vis.set(oid,ov);}
    };

    function endpointSafeAgainstStatic(g,entry,seg){
        if(!entry?.v||!Array.isArray(seg?.to))return false;
        const [tx,ty]=seg.to;
        const maxY=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H;
        if(ty>maxY+1e-7)return false;
        for(const [oid,ov] of g.vis.entries()){
            if(oid===entry.ball.id||!ov||!Number.isFinite(ov.x)||!Number.isFinite(ov.y))continue;
            const other=ballById(g,oid);
            if(!other)continue;
            // Peers with a live path are integrated in this same 120 Hz frame.
            // Their old visual centre must not make the canonical endpoint look
            // blocked. They are checked together by resolveVisualContacts after.
            if(activeCurrentGarbage(other))continue;
            // A pivot support is supposed to be exactly one radius from the
            // moving ball through the arc; never reject its tangent endpoint.
            if(Array.isArray(seg.pivot)&&samePhysicalPoint([ov.x,ov.y],seg.pivot))continue;
            const d=physicalDist(tx,ty,ov.x,ov.y);
            if(d<STATIC_MIN_DIST-1e-7)return false;
        }
        return true;
    }
    function clearSegmentVisualState(v){
        if(!v)return;
        delete v._segKey;delete v._segP;delete v._segStartVisualY;
        delete v._segAngle;delete v._segProgress;delete v._segArcTotal;
        delete v._segStartAngle;delete v._segTargetAngle;delete v._segDir;
        delete v._pendingPathComplete;
    }
    function finishNearCanonicalArcs(g){
        if(!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"))return 0;
        let finished=0;
        const entries=[];
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(ball)entries.push({ball,x,y,v:g.vis.get(ball.id)});
        }
        for(const entry of entries){
            const {ball,v}=entry;
            if(!activeCurrentGarbage(ball)||!v)continue;
            const seg=ball.fallPath[0];
            // The reproduced deadlock is the generic motionSeq=0 circular arc.
            // Restrict the completion guard to that exact class; free-fall and
            // other straight segments retain the ordinary collision integrator.
            if(!seg?.pivot||seg.topPivot||Number(seg.motionSeq)!==0||!Array.isArray(seg.to))continue;
            const remain=physicalDist(v.x,v.y,seg.to[0],seg.to[1]);
            if(remain>ARC_FINISH_EPS+1e-10)continue;
            if(!endpointSafeAgainstStatic(g,entry,seg))continue;

            v.x=seg.to[0];
            v.y=Math.max(v.y,seg.to[1]);
            ball.fallPath.shift();
            clearSegmentVisualState(v);
            const next=ball.fallPath[0];
            if(next){
                v.vy=Math.max(0.0001,v.vy||0);
                v.motionSpeed=Math.max(0.0001,v.motionSpeed||0,next.pivot?SLIDE_SPEED:0);
            }else{
                delete ball.fallPath;
                v.vy=0;
                v.motionSpeed=0;
            }
            finished++;
        }
        return finished;
    }

    // Run the tiny canonical-endpoint completion after the ordinary integrator,
    // before the caller's normal resolveVisualContacts pass.
    const baseUpdateVisuals=updateVisuals;
    updateVisuals=function(g,dt){
        const r=baseUpdateVisuals(g,dt);
        finishNearCanonicalArcs(g);
        return r;
    };

    window.__hexGarbageMovingPeersAreSimultaneous=true;
    window.__hexGarbageFinishNearCanonicalArcs=finishNearCanonicalArcs;
    window.__hexGarbageCanonicalArcDeadlockFixed=true;
})();