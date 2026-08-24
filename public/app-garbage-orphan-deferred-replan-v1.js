/* ============================================================
 * 6ball GARBAGE ORPHAN DEFERRED REPLAN v1
 *
 * A temporally-deferred FOLLOW_SUPPORT segment is allowed to wait while its
 * support is still moving.  If the support has finished and the segment remains
 * unscheduled for a real grace period, the old kinematic dependency is stale.
 * Replaying that old event forever can deadlock the garbage batch.
 *
 * This final update wrapper does NOT touch newly-deferred segments.  It tracks
 * each deferred head segment by object identity and only recovers it after it has
 * remained continuously deferred for STALE_WAIT seconds with every referenced
 * support settled.  Recovery rewinds that one garbage ball to the authored FROM
 * lattice point, cancels the stale path, and invalidates the garbage compile so
 * ordinary physics replans on the next update.
 * ============================================================ */
(function installGarbageOrphanDeferredReplanV1(){
    if(typeof window==="undefined"||window.__sixBallGarbageOrphanDeferredReplanV1)return;
    if(typeof updateGarbagePacks!=="function")return;
    window.__sixBallGarbageOrphanDeferredReplanV1=true;

    const baseUpdate=updateGarbagePacks;
    const H=typeof HEX_ROW_H==="number"?HEX_ROW_H:Math.sqrt(3)/2;
    const LEGAL_DIST=.9995;
    const STALE_WAIT=.50;
    const START_MATCH_DIST=.03;
    const EPS=1e-9;
    const firstSeen=new WeakMap();

    function garbagePhase(g){return !!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"&&Array.isArray(g.board)&&g.vis);}
    function livePath(b){return Array.isArray(b?.fallPath)&&b.fallPath.length>0;}
    function boardEntries(g){
        const out=[],seen=new Set();
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const b=valid(x,y)?g.board[y][x]:null;if(!b||seen.has(b))continue;seen.add(b);
            const v=g.vis.get(b.id);out.push({b,v,x,y});
        }
        return out;
    }
    function supportIds(seg){
        const out=[];
        if(Array.isArray(seg?.followSupportIds))for(const id of seg.followSupportIds)if(id!==undefined&&id!==null&&id!==0&&!out.includes(id))out.push(id);
        const m=seg?.movingSupportId;if(m!==undefined&&m!==null&&m!==0&&!out.includes(m))out.push(m);
        return out;
    }
    function startPoint(seg){
        const x=Number(seg?.from?.[0]),y=Number(seg?.from?.[1]);
        return Number.isInteger(x)&&Number.isInteger(y)&&valid(x,y)?{x,y}:null;
    }
    function physicalDist(a,b){return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*H);}
    function safeStart(g,ball,start,entries){
        for(const q of entries){
            if(q.b===ball||!q.v||!Number.isFinite(q.v.x)||!Number.isFinite(q.v.y))continue;
            if(physicalDist([start.x,start.y],[q.v.x,q.v.y])<LEGAL_DIST-EPS)return false;
        }
        return true;
    }
    function invalidateCompile(g){
        delete g.__garbageContinuousCompiledVersion;
        delete g.__garbageContinuousCompiled;
        delete g.__garbageTemporalSafetyV2CompiledVersion;
        delete g.__garbageTemporalDeferredCompiledVersion;
    }
    function recover(g,q,start){
        const occupant=g.board?.[start.y]?.[start.x]||null;
        if(occupant&&occupant!==q.b)return{ok:false,reason:"start_occupied",occupant:occupant.id};
        const entries=boardEntries(g);if(!safeStart(g,q.b,start,entries))return{ok:false,reason:"start_not_safe"};
        if(q.x!==start.x||q.y!==start.y){
            if(g.board[q.y]?.[q.x]===q.b)g.board[q.y][q.x]=null;
            g.board[start.y][start.x]=q.b;
        }
        const oldPath=q.b.fallPath;
        q.b.fallPath=[];
        if("activeFall" in q.b)q.b.activeFall=null;
        if("falling" in q.b)q.b.falling=false;
        if(q.v){
            q.v.x=start.x;q.v.y=start.y;
            if(Number.isFinite(q.v.vx))q.v.vx=0;
            if(Number.isFinite(q.v.vy))q.v.vy=0;
            if("motionSpeed" in q.v)q.v.motionSpeed=0;
            if("speed" in q.v)q.v.speed=0;
            if("pileFlow" in q.v)q.v.pileFlow=false;
            if("arc" in q.v)q.v.arc=null;
        }
        invalidateCompile(g);
        return{ok:true,oldLogical:[q.x,q.y],to:[start.x,start.y],oldPathLength:oldPath.length};
    }
    function scan(g){
        const now=Math.max(0,Number(g.pileFlowClock)||0),entries=boardEntries(g),byId=new Map(entries.map(q=>[q.b.id,q]));
        const actions=[],waiting=[];
        for(const q of entries){
            if(!q.b?.isGarbage||!livePath(q.b))continue;
            const seg=q.b.fallPath[0];
            if(!seg?.__garbageTemporalDeferredV2||Number.isFinite(seg.pileFlowStart)||Number.isFinite(seg.pileFlowEnd)||String(seg.kind)!=="FOLLOW_SUPPORT")continue;
            let born=firstSeen.get(seg);if(!Number.isFinite(born)){born=now;firstSeen.set(seg,born);}
            const age=Math.max(0,now-born),ids=supportIds(seg),supports=ids.map(id=>byId.get(id)?.b||null);
            const allSettled=ids.length>0&&supports.every(Boolean)&&supports.every(b=>!livePath(b));
            waiting.push({id:q.b.id,age,supports:ids,allSettled});
            if(age<STALE_WAIT-EPS||!allSettled)continue;
            const start=startPoint(seg),vis=q.v&&Number.isFinite(q.v.x)&&Number.isFinite(q.v.y)?[q.v.x,q.v.y]:null;
            if(!start||!vis||physicalDist(vis,[start.x,start.y])>START_MATCH_DIST)continue;
            const r=recover(g,q,start);actions.push({id:q.b.id,age,supports:ids,kind:seg.kind,...r});
            if(r.ok)break; // one physical replan per frame; let ordinary physics settle the new state first
        }
        if(actions.some(a=>a.ok))window.__sixBallGarbageOrphanDeferredRecoveries=(window.__sixBallGarbageOrphanDeferredRecoveries||0)+1;
        window.__sixBallLastGarbageOrphanDeferredReplanV1={actions,waiting,at:Date.now()};
        return actions.some(a=>a.ok)?1:0;
    }

    updateGarbagePacks=function(g,dt){
        const result=baseUpdate(g,dt);
        if(garbagePhase(g))scan(g);
        return result;
    };

    window.__sixBallGarbageOrphanDeferredReplanVersion="garbage-orphan-deferred-replan-v1";
})();