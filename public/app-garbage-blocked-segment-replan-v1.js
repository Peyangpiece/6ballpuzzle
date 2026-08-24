/* ============================================================
 * 6ball GARBAGE BLOCKED-SEGMENT REPLAN v1
 *
 * The continuous garbage compiler commits logical destinations before the
 * presentation path has finished.  A later garbage ball can settle beside an
 * already-authored ROLL/FOLLOW segment and make that segment physically
 * impossible even though its old destination still exists on the logical board.
 *
 * Contact finalizers must not solve that by tunnelling or by a multi-cell X
 * teleport.  When a residual overlap proves that a LIVE garbage segment is now
 * blocked by a SETTLED body, rewind that one ball to the segment's authored
 * lattice start, restore that start as its logical position, cancel the stale
 * path, and invalidate the continuous compile so ordinary garbage physics can
 * plan again from the real contact state.
 *
 * This layer is deliberately narrow:
 * - GARBAGE phase only;
 * - exactly one side of the bad pair must still have a fallPath;
 * - the blocker must be settled/frozen/non-moving;
 * - the segment start must be an empty valid lattice cell;
 * - the segment start must itself be non-overlapping with every other body;
 * - vertical FREE_FALL segments are not rewound here (their blocker is handled
 *   by the contact-hold layers).
 * ============================================================ */
(function installGarbageBlockedSegmentReplanV1(){
    if(typeof window==="undefined"||window.__sixBallGarbageBlockedSegmentReplanV1)return;
    if(typeof resolveVisualContacts!=="function")return;
    window.__sixBallGarbageBlockedSegmentReplanV1=true;

    const baseResolve=resolveVisualContacts;
    const H=typeof HEX_ROW_H==="number"?HEX_ROW_H:Math.sqrt(3)/2;
    const LEGAL_DIST=.9995;
    const EPS=1e-9;
    const MAX_REPLANS_PER_PASS=4;

    function garbagePhase(g){return !!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"&&Array.isArray(g.board)&&g.vis);}
    function livePath(ball){return Array.isArray(ball?.fallPath)&&ball.fallPath.length>0;}
    function frozenIds(board){const out=new Set(),cached=board?.__hexGarbageFrozenIds;if(cached instanceof Set)for(const id of cached)out.add(id);return out;}
    function isLiveGarbage(g,q){const frozen=frozenIds(g.board);return !!(q?.ball?.isGarbage&&!q.ball.garbagePhaseFrozen&&!frozen.has(q.ball.id)&&livePath(q.ball));}
    function entries(g){
        const out=[],seen=new Set();
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;if(!ball||seen.has(ball))continue;seen.add(ball);
            const v=g.vis.get(ball.id);if(v&&Number.isFinite(v.x)&&Number.isFinite(v.y))out.push({ball,v,x,y});
        }
        return out;
    }
    function distAt(ax,ay,b){return Math.hypot((ax-b.v.x)*.5,(ay-b.v.y)*H);}
    function distance(a,b){return distAt(a.v.x,a.v.y,b);}
    function worstIncoming(g){
        const all=entries(g),liveIds=new Set(all.filter(q=>isLiveGarbage(g,q)).map(q=>q.ball.id));let worst=null;
        for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
            if(!liveIds.has(all[i].ball.id)&&!liveIds.has(all[j].ball.id))continue;
            const d=distance(all[i],all[j]);if(d<LEGAL_DIST-EPS&&(!worst||d<worst.d))worst={a:all[i],b:all[j],d};
        }
        return worst;
    }
    function headSegment(ball){return livePath(ball)?ball.fallPath[0]:null;}
    function latticeStart(seg){
        const x=Number(seg?.from?.[0]),y=Number(seg?.from?.[1]);
        if(!Number.isInteger(x)||!Number.isInteger(y)||!valid(x,y))return null;
        return{x,y};
    }
    function rewindableKind(seg){
        const k=String(seg?.kind||"");
        return k!=="FREE_FALL"&&k!=="WALL_FREE_FALL";
    }
    function startSafe(g,ball,start){
        for(const q of entries(g)){
            if(q.ball.id===ball.id)continue;
            if(distAt(start.x,start.y,q)<LEGAL_DIST-EPS)return false;
        }
        return true;
    }
    function findBoardCell(g,ball){
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y)&&g.board[y][x]===ball)return{x,y};
        return null;
    }
    function clearMotionVisual(v,start){
        v.x=start.x;v.y=start.y;
        if(Number.isFinite(v.vx))v.vx=0;
        if(Number.isFinite(v.vy))v.vy=0;
        if("motionSpeed" in v)v.motionSpeed=0;
        if("speed" in v)v.speed=0;
        if("pileFlow" in v)v.pileFlow=false;
        if("arc" in v)v.arc=null;
    }
    function relocate(g,q,start){
        const current=findBoardCell(g,q.ball);if(!current)return{ok:false,reason:"logical_cell_missing"};
        const occupant=g.board?.[start.y]?.[start.x]||null;
        if(occupant&&occupant!==q.ball)return{ok:false,reason:"segment_start_occupied",occupant:occupant.id};
        if(!startSafe(g,q.ball,start))return{ok:false,reason:"segment_start_not_safe"};

        if(current.x!==start.x||current.y!==start.y){
            if(g.board[current.y]?.[current.x]===q.ball)g.board[current.y][current.x]=null;
            g.board[start.y][start.x]=q.ball;
        }
        q.ball.fallPath=[];
        if("activeFall" in q.ball)q.ball.activeFall=null;
        if("falling" in q.ball)q.ball.falling=false;
        clearMotionVisual(q.v,start);

        delete g.__garbageContinuousCompiledVersion;
        delete g.__garbageContinuousCompiled;
        delete g.__garbageTemporalSafetyV2CompiledVersion;
        delete g.__garbageTemporalDeferredCompiledVersion;
        return{ok:true,from:[current.x,current.y],to:[start.x,start.y]};
    }
    function attemptOne(g,pair){
        const aLive=isLiveGarbage(g,pair.a),bLive=isLiveGarbage(g,pair.b);
        if(aLive===bLive)return{ok:false,reason:aLive?"both_live":"neither_live"};
        const live=aLive?pair.a:pair.b,blocker=aLive?pair.b:pair.a;
        if(isLiveGarbage(g,blocker))return{ok:false,reason:"blocker_still_live"};
        const seg=headSegment(live.ball);if(!seg)return{ok:false,reason:"head_segment_missing"};
        if(!rewindableKind(seg))return{ok:false,reason:"vertical_segment"};
        const start=latticeStart(seg);if(!start)return{ok:false,reason:"invalid_segment_start"};
        const moved=relocate(g,live,start);
        return{...moved,ball:live.ball.id,blocker:blocker.ball.id,kind:seg.kind||null,distance:pair.d};
    }

    resolveVisualContacts=function(g){
        const result=baseResolve(g);if(!garbagePhase(g))return result;
        const actions=[];let failure=null;
        for(let i=0;i<MAX_REPLANS_PER_PASS;i++){
            const pair=worstIncoming(g);if(!pair)break;
            const r=attemptOne(g,pair);actions.push(r);
            if(!r.ok){failure=r;break;}
        }
        const final=worstIncoming(g);
        window.__sixBallLastGarbageBlockedSegmentReplanV1={
            active:actions.some(a=>a.ok),actions,failure,
            finalDistance:final?.d??null,
            finalPair:final?[final.a.ball.id,final.b.ball.id]:null,
            at:Date.now()
        };
        if(actions.some(a=>a.ok))window.__sixBallGarbageBlockedSegmentReplans=(window.__sixBallGarbageBlockedSegmentReplans||0)+actions.filter(a=>a.ok).length;
        return result;
    };

    window.__sixBallGarbageBlockedSegmentReplanVersion="garbage-blocked-segment-replan-v1";
})();
