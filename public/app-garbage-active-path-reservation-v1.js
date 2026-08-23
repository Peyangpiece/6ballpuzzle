/* ============================================================
 * 6ball GARBAGE ACTIVE-PATH RESERVATION v1
 *
 * Root guard for cross-spawn garbage trajectory collisions.
 *
 * app-garbage-continuous-v1 reserves cells/edges while ONE logical compile is
 * running, but that reservation context is intentionally local to the update.
 * A later garbage spawn can therefore plan through a cell that an older ball
 * has already reserved in a still-running fallPath. The logical destinations
 * are different at rest, yet their visual trajectories can occupy the same
 * contact region at the same time.
 *
 * Before each GARBAGE update this layer snapshots every already-scheduled
 * fallPath segment whose end time is still in the future. While the new logical
 * compile runs, a move by another ball is rejected if it enters an endpoint,
 * edge or midpoint reserved by one of those active paths. Both endpoints of an
 * active segment are reserved until the segment ends, so a following ball does
 * not enter the pivot/contact cell while the older ball is still leaving it.
 *
 * A rejected move remains at its current logical cell and is retried on a later
 * update after the active reservation expires. No existing trajectory timing is
 * rewritten, no internal segment wait is inserted, and ordinary-piece physics
 * is untouched.
 * ============================================================ */
(function(){
    if(typeof window==="undefined"||window.__sixBallGarbageActivePathReservationV1)return;
    if(typeof updateGarbagePacks!=="function"||typeof hexPhysApplyEvent!=="function")return;

    const baseUpdateGarbagePacks=updateGarbagePacks;
    const EPS=1e-9;

    function coordKey(x,y){return String(Number(x))+","+String(Number(y));}
    function edgeKey(x,y,tx,ty){return coordKey(x,y)+">"+coordKey(tx,ty);}
    function reverseEdgeKey(x,y,tx,ty){return coordKey(tx,ty)+">"+coordKey(x,y);}
    function midpointKey(x,y,tx,ty){return String(Number(x)+Number(tx))+","+String(Number(y)+Number(ty));}
    function moveId(move,index){
        const b=move?.ball;
        if(b&&b.id!==undefined&&b.id!==null)return "id:"+String(b.id);
        if(b)return b;
        return "anonymous:"+index;
    }
    function knownMove(move){
        return !!(move&&move.ball&&Number.isFinite(Number(move.x))&&Number.isFinite(Number(move.y))&&Number.isFinite(Number(move.tx))&&Number.isFinite(Number(move.ty)));
    }
    function occupantAt(board,x,y){return board?.[Number(y)]?.[Number(x)]||null;}

    function addOwner(map,key,id){
        if(!map.has(key))map.set(key,new Set());
        map.get(key).add(id);
    }
    function ownedByOther(map,key,id){
        const owners=map.get(key);
        if(!owners||!owners.size)return false;
        for(const owner of owners)if(owner!==id)return true;
        return false;
    }

    function activeReservations(g){
        const cells=new Map(),edges=new Map(),midpoints=new Map();
        const clock=Math.max(0,Number(g?.pileFlowClock)||0);
        let balls=0,segments=0;
        if(!Array.isArray(g?.board))return{cells,edges,midpoints,balls,segments,clock};
        const seen=new Set();

        for(let y=typeof boardScanMin==="function"?boardScanMin(g.board):0;y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=typeof valid==="function"&&valid(x,y)?g.board[y][x]:null;
            if(!ball||seen.has(ball)||!ball.isGarbage||!Array.isArray(ball.fallPath)||!ball.fallPath.length)continue;
            seen.add(ball);
            const id=ball.id!==undefined&&ball.id!==null?"id:"+String(ball.id):ball;
            let activeForBall=false;

            for(const seg of ball.fallPath){
                if(!seg?.from||!seg?.to)continue;
                const start=Number(seg.pileFlowStart),end=Number(seg.pileFlowEnd);
                if(!Number.isFinite(start)||!Number.isFinite(end)||end<=clock+EPS)continue;
                const sx=Number(seg.from[0]),sy=Number(seg.from[1]),tx=Number(seg.to[0]),ty=Number(seg.to[1]);
                if(![sx,sy,tx,ty].every(Number.isFinite))continue;

                addOwner(cells,coordKey(sx,sy),id);
                addOwner(cells,coordKey(tx,ty),id);
                addOwner(edges,edgeKey(sx,sy,tx,ty),id);
                addOwner(edges,reverseEdgeKey(sx,sy,tx,ty),id);
                addOwner(midpoints,midpointKey(sx,sy,tx,ty),id);
                activeForBall=true;segments++;
            }
            if(activeForBall)balls++;
        }
        return{cells,edges,midpoints,balls,segments,clock};
    }

    function filterAgainstActive(board,event,res,stats){
        if(!Array.isArray(event)||!event.some(knownMove))return event;
        const accepted=[];

        for(let i=0;i<event.length;i++){
            const move=event[i];
            if(!knownMove(move)){accepted.push(move);continue;}
            const id=moveId(move,i);
            const sx=Number(move.x),sy=Number(move.y),tx=Number(move.tx),ty=Number(move.ty);
            const target=coordKey(tx,ty);
            const edge=edgeKey(sx,sy,tx,ty);
            const midpoint=midpointKey(sx,sy,tx,ty);

            if(ownedByOther(res.cells,target,id)||ownedByOther(res.edges,edge,id)||ownedByOther(res.midpoints,midpoint,id)){
                stats.rejected++;
                stats.blockedIds.add(String(move.ball.id));
                continue;
            }
            accepted.push(move);
        }

        // If A was accepted only because B was expected to vacate A's target,
        // but B was rejected above, A must wait as well.
        let changed=true;
        while(changed){
            changed=false;
            const moving=new Set(accepted.filter(knownMove).map(m=>m.ball));
            const next=[];
            for(const move of accepted){
                if(!knownMove(move)){next.push(move);continue;}
                const occupied=occupantAt(board,move.tx,move.ty);
                if(occupied&&occupied!==move.ball&&!moving.has(occupied)){
                    stats.rejected++;
                    stats.blockedIds.add(String(move.ball.id));
                    changed=true;
                    continue;
                }
                next.push(move);
            }
            accepted.splice(0,accepted.length,...next);
        }
        stats.accepted+=accepted.filter(knownMove).length;
        return accepted;
    }

    updateGarbagePacks=function(g,dt){
        if(!g||g.phase!=="GARBAGE")return baseUpdateGarbagePacks(g,dt);

        const res=activeReservations(g);
        if(!res.segments)return baseUpdateGarbagePacks(g,dt);

        const originalApply=hexPhysApplyEvent;
        const stats={accepted:0,rejected:0,blockedIds:new Set()};
        hexPhysApplyEvent=function(board,event){
            const filtered=filterAgainstActive(board,event,res,stats);
            return originalApply(board,filtered);
        };

        let result;
        try{
            result=baseUpdateGarbagePacks(g,dt);
        }finally{
            hexPhysApplyEvent=originalApply;
        }

        if(stats.rejected>0){
            // The rejected logical move must be reconsidered after the older
            // visual trajectory advances; do not mark this version permanently
            // compiled.
            delete g.__garbageContinuousCompiledVersion;
        }

        window.__sixBallLastGarbageActivePathReservationV1={
            activeBalls:res.balls,
            activeSegments:res.segments,
            clock:res.clock,
            accepted:stats.accepted,
            rejected:stats.rejected,
            blockedIds:[...stats.blockedIds],
            at:Date.now()
        };
        if(stats.rejected)window.__sixBallGarbageActivePathRejections=(window.__sixBallGarbageActivePathRejections||0)+stats.rejected;
        return result;
    };

    window.__sixBallGarbageActivePathReservationV1=true;
    window.__sixBallGarbageActivePathReservationVersion="garbage-active-path-reservation-v1.0";
})();
