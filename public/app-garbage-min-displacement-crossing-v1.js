/* ============================================================
 * 6ball GARBAGE ACTIVE-PATH + LOCAL CONTACT GUARD v1.8
 *
 * A. Reserve every still-active garbage fallPath across later spawn/compile
 *    updates so a new logical move cannot claim another ball's active endpoint,
 *    edge or midpoint.
 *
 * B. If a residual visual overlap remains, perform only an ORDER-PRESERVING,
 *    LOCAL horizontal projection.  A contact fallback is not allowed to move a
 *    ball through unrelated live balls or teleport a seed to the other side of
 *    the board.  If the current X order has no local feasible solution, this
 *    layer reports failure and lets later physical hold/contact layers solve the
 *    blocked fall in Y/time instead.
 *
 * Existing/frozen pile balls, visual Y, authored path timing, ordinary pieces,
 * logical cells, pivots and support metadata are never rewritten here.
 * ============================================================ */
(function(){
    if(typeof window==="undefined"||window.__sixBallGarbageMinDisplacementCrossingV1)return;
    if(typeof resolveVisualContacts!=="function"||typeof updateGarbagePacks!=="function"||typeof hexPhysApplyEvent!=="function")return;

    const baseResolveVisualContacts=resolveVisualContacts;
    const baseUpdateGarbagePacks=updateGarbagePacks;
    const H=typeof HEX_ROW_H==="number"?HEX_ROW_H:Math.sqrt(3)/2;
    const MIN_DIST=1.0;
    const OVERLAP_LIMIT=.9995;
    const EPS=1e-9;
    const FEAS_EPS=1e-7;
    const MAX_BAND_PASSES=16;
    const MAX_LOCAL_SHIFT=1.0;

    function garbagePhase(g){return !!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"&&g.board&&g.vis);}
    function hasLivePath(ball){return Array.isArray(ball?.fallPath)&&ball.fallPath.length>0;}
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
    function boardEntries(g){
        const out=[];
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            const v=ball&&g.vis.get(ball.id);
            if(ball&&v&&Number.isFinite(v.x)&&Number.isFinite(v.y))out.push({ball,v,x,y});
        }
        return out;
    }

    /* ---------------- active fallPath reservation ---------------- */
    function addOwner(map,key,id){if(!map.has(key))map.set(key,new Set());map.get(key).add(id);}
    function ownedByOther(map,key,id){
        const owners=map.get(key);if(!owners||!owners.size)return false;
        for(const owner of owners)if(owner!==id)return true;
        return false;
    }
    function activeReservations(g){
        const cells=new Map(),edges=new Map(),midpoints=new Map();
        const clock=Math.max(0,Number(g?.pileFlowClock)||0);
        let balls=0,segments=0;
        if(!Array.isArray(g?.board))return{cells,edges,midpoints,balls,segments,clock};
        const seen=new Set();
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball||seen.has(ball)||!ball.isGarbage||!hasLivePath(ball))continue;
            seen.add(ball);
            const id=ball.id!==undefined&&ball.id!==null?"id:"+String(ball.id):ball;
            let activeForBall=false;
            for(const seg of ball.fallPath){
                if(!seg?.from||!seg?.to)continue;
                const start=Number(seg.pileFlowStart),end=Number(seg.pileFlowEnd);
                if(!Number.isFinite(start)||!Number.isFinite(end)||end<=clock+EPS)continue;
                const sx=Number(seg.from[0]),sy=Number(seg.from[1]),tx=Number(seg.to[0]),ty=Number(seg.to[1]);
                if(![sx,sy,tx,ty].every(Number.isFinite))continue;
                addOwner(cells,coordKey(sx,sy),id);addOwner(cells,coordKey(tx,ty),id);
                addOwner(edges,edgeKey(sx,sy,tx,ty),id);addOwner(edges,reverseEdgeKey(sx,sy,tx,ty),id);
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
            const move=event[i];if(!knownMove(move)){accepted.push(move);continue;}
            const id=moveId(move,i),sx=Number(move.x),sy=Number(move.y),tx=Number(move.tx),ty=Number(move.ty);
            if(ownedByOther(res.cells,coordKey(tx,ty),id)||ownedByOther(res.edges,edgeKey(sx,sy,tx,ty),id)||ownedByOther(res.midpoints,midpointKey(sx,sy,tx,ty),id)){
                stats.rejected++;stats.blockedIds.add(String(move.ball.id));continue;
            }
            accepted.push(move);
        }
        let changed=true;
        while(changed){
            changed=false;
            const moving=new Set(accepted.filter(knownMove).map(m=>m.ball)),next=[];
            for(const move of accepted){
                if(!knownMove(move)){next.push(move);continue;}
                const occupied=occupantAt(board,move.tx,move.ty);
                if(occupied&&occupied!==move.ball&&!moving.has(occupied)){
                    stats.rejected++;stats.blockedIds.add(String(move.ball.id));changed=true;continue;
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
        const res=activeReservations(g);if(!res.segments)return baseUpdateGarbagePacks(g,dt);
        const originalApply=hexPhysApplyEvent,stats={accepted:0,rejected:0,blockedIds:new Set()};
        hexPhysApplyEvent=function(board,event){return originalApply(board,filterAgainstActive(board,event,res,stats));};
        let result;try{result=baseUpdateGarbagePacks(g,dt);}finally{hexPhysApplyEvent=originalApply;}
        if(stats.rejected>0)delete g.__garbageContinuousCompiledVersion;
        const info={activeBalls:res.balls,activeSegments:res.segments,clock:res.clock,accepted:stats.accepted,rejected:stats.rejected,blockedIds:[...stats.blockedIds],at:Date.now()};
        window.__sixBallLastGarbageActivePathReservationV1=info;
        if(stats.rejected)window.__sixBallGarbageActivePathRejections=(window.__sixBallGarbageActivePathRejections||0)+stats.rejected;
        return result;
    };

    /* ---------------- local order-preserving contact fallback ---------------- */
    function frozenIds(board){
        const out=new Set(),cached=board?.__hexGarbageFrozenIds;
        if(cached instanceof Set)for(const id of cached)out.add(id);
        return out;
    }
    function liveEntries(g,all){
        const frozen=frozenIds(g.board);
        return all.filter(q=>q.ball.isGarbage&&!q.ball.garbagePhaseFrozen&&!frozen.has(q.ball.id)&&hasLivePath(q.ball));
    }
    function fixedEntries(g,all){
        const liveIds=new Set(liveEntries(g,all).map(q=>q.ball.id));
        return all.filter(q=>!liveIds.has(q.ball.id));
    }
    function physicalDistance(a,b,ax=a.v.x,bx=b.v.x){return Math.hypot((ax-bx)*.5,(a.v.y-b.v.y)*H);}
    function requiredX(a,b){
        const dy=(a.v.y-b.v.y)*H;if(Math.abs(dy)>=MIN_DIST)return 0;
        return 2*Math.sqrt(Math.max(0,MIN_DIST*MIN_DIST-dy*dy));
    }
    function worstLivePair(live){
        let worst=null;
        for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){
            const d=physicalDistance(live[i],live[j]);
            if(d<OVERLAP_LIMIT&&(!worst||d<worst.d))worst={i,j,d,a:live[i],b:live[j]};
        }
        return worst;
    }
    function minIncomingDistance(all,live){
        const ids=new Set(live.map(q=>q.ball.id));let min=Infinity,pair=null;
        for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
            if(!ids.has(all[i].ball.id)&&!ids.has(all[j].ball.id))continue;
            const d=physicalDistance(all[i],all[j]);if(d<min){min=d;pair=[all[i].ball.id,all[j].ball.id];}
        }
        return{min,pair};
    }
    function allowedIntervals(live,fixed){
        const forbidden=[];
        for(const support of fixed){
            if(!support||support.ball.id===live.ball.id)continue;
            const dy=(live.v.y-support.v.y)*H;if(Math.abs(dy)>=MIN_DIST)continue;
            const radial=2*Math.sqrt(Math.max(0,MIN_DIST*MIN_DIST-dy*dy));
            const lo=Math.max(0,support.v.x-radial),hi=Math.min(W2-1,support.v.x+radial);
            if(lo<hi-EPS)forbidden.push({lo,hi});
        }
        forbidden.sort((a,b)=>a.lo-b.lo||a.hi-b.hi);
        const merged=[];
        for(const f of forbidden){const last=merged[merged.length-1];if(!last||f.lo>last.hi+EPS)merged.push({...f});else last.hi=Math.max(last.hi,f.hi);}
        const base=[];let cursor=0;
        for(const f of merged){if(f.lo>cursor+EPS)base.push({lo:cursor,hi:f.lo});cursor=Math.max(cursor,f.hi);}
        if(cursor<W2-1-EPS)base.push({lo:cursor,hi:W2-1});
        if(!merged.length)base.push({lo:0,hi:W2-1});

        const localLo=Math.max(0,live.v.x-MAX_LOCAL_SHIFT),localHi=Math.min(W2-1,live.v.x+MAX_LOCAL_SHIFT),allowed=[];
        for(const q of base){const lo=Math.max(q.lo,localLo),hi=Math.min(q.hi,localHi);if(lo<=hi+FEAS_EPS)allowed.push({lo,hi});}
        return allowed;
    }
    function interactionBand(live,seedA,seedB){
        const byId=new Map(live.map(q=>[q.ball.id,q])),ids=new Set([seedA.ball.id,seedB.ball.id]),queue=[seedA.ball.id,seedB.ball.id];
        while(queue.length){
            const a=byId.get(queue.shift());if(!a)continue;
            for(const b of live){if(ids.has(b.ball.id))continue;if(requiredX(a,b)>EPS){ids.add(b.ball.id);queue.push(b.ball.id);}}
        }
        return live.filter(q=>ids.has(q.ball.id));
    }
    function baseOrder(component){return component.slice().sort((a,b)=>a.v.x-b.v.x||a.x-b.x||a.ball.id-b.ball.id);}
    function reqMatrix(order){
        const n=order.length,req=Array.from({length:n},()=>Array(n).fill(0));
        for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)req[i][j]=requiredX(order[i],order[j]);
        return req;
    }
    function verify(order,req,x){
        for(let i=0;i<order.length;i++){
            if(!Number.isFinite(x[i])||x[i]<-FEAS_EPS||x[i]>W2-1+FEAS_EPS||Math.abs(x[i]-order[i].v.x)>MAX_LOCAL_SHIFT+FEAS_EPS)return false;
            for(let j=i+1;j<order.length;j++)if(req[i][j]>0&&x[j]-x[i]<req[i][j]-FEAS_EPS)return false;
        }
        return true;
    }
    function leftWitness(order,corridors,req){
        const n=order.length,x=new Array(n),chosen=new Array(n);
        for(let j=0;j<n;j++){
            let need=0;for(let i=0;i<j;i++)if(req[i][j]>0)need=Math.max(need,x[i]+req[i][j]);
            let d=null;for(const q of corridors[j])if(q.hi>=need-FEAS_EPS){d=q;break;}
            if(!d)return null;chosen[j]=d;x[j]=Math.max(d.lo,need);if(x[j]>d.hi+FEAS_EPS)return null;
        }
        for(let i=n-1;i>=0;i--){
            const d=chosen[i];let hi=d.hi;for(let j=i+1;j<n;j++)if(req[i][j]>0)hi=Math.min(hi,x[j]-req[i][j]);
            if(hi<d.lo-FEAS_EPS)return null;const target=Math.max(d.lo,Math.min(hi,order[i].v.x));if(target>x[i])x[i]=target;
        }
        return verify(order,req,x)?x:null;
    }
    function rightWitness(order,corridors,req){
        const n=order.length,x=new Array(n),chosen=new Array(n);
        for(let i=n-1;i>=0;i--){
            let hi=W2-1;for(let j=i+1;j<n;j++)if(req[i][j]>0)hi=Math.min(hi,x[j]-req[i][j]);
            let d=null;for(let k=corridors[i].length-1;k>=0;k--){const q=corridors[i][k];if(q.lo<=hi+FEAS_EPS){d=q;break;}}
            if(!d)return null;chosen[i]=d;x[i]=Math.min(d.hi,hi);if(x[i]<d.lo-FEAS_EPS)return null;
        }
        for(let j=0;j<n;j++){
            const d=chosen[j];let lo=d.lo;for(let i=0;i<j;i++)if(req[i][j]>0)lo=Math.max(lo,x[i]+req[i][j]);
            if(lo>d.hi+FEAS_EPS)return null;const target=Math.max(lo,Math.min(d.hi,order[j].v.x));if(target<x[j])x[j]=target;
        }
        return verify(order,req,x)?x:null;
    }
    function metrics(order,x){
        let cost=0,totalShift=0,maxShift=0;
        for(let i=0;i<order.length;i++){const d=x[i]-order[i].v.x;cost+=d*d;totalShift+=Math.abs(d);maxShift=Math.max(maxShift,Math.abs(d));}
        return{cost,totalShift,maxShift};
    }
    function solveBand(component,fixed,seedIds){
        const order=baseOrder(component),baseIds=order.map(q=>q.ball.id),corridors=order.map(q=>allowedIntervals(q,fixed));
        if(corridors.some(q=>!q.length))return{ok:false,reason:"local_corridor_infeasible",baseOrder:baseIds,chosenOrder:baseIds,seedIds:seedIds.slice(),reorderCount:0,orderCandidates:1};
        const req=reqMatrix(order),witnesses=[];
        const l=leftWitness(order,corridors,req);if(l)witnesses.push(l);
        const r=rightWitness(order,corridors,req);if(r)witnesses.push(r);
        if(!witnesses.length)return{ok:false,reason:"order_preserving_local_infeasible",baseOrder:baseIds,chosenOrder:baseIds,seedIds:seedIds.slice(),reorderCount:0,orderCandidates:1,corridorCounts:corridors.map(q=>q.length)};
        let best=null;
        for(const x of witnesses){const m=metrics(order,x);if(!best||m.cost<best.cost)best={x:x.slice(),...m};}
        let changed=0;for(let i=0;i<order.length;i++)if(Math.abs(best.x[i]-order[i].v.x)>EPS){order[i].v.x=best.x[i];changed++;}
        return{ok:true,baseOrder:baseIds,chosenOrder:baseIds,seedIds:seedIds.slice(),seedPriority:seedIds.slice(),reorderCount:0,changed,maxShift:best.maxShift,totalShift:best.totalShift,cost:best.cost,corridorCounts:corridors.map(q=>q.length),orderCandidates:1,chosenWitnesses:witnesses.length,orderStats:[{order:baseIds,inversions:0,feasible:true,cost:best.cost,witnesses:witnesses.length}]};
    }
    function repairResidualCrossings(g){
        if(!garbagePhase(g))return 0;
        let totalChanged=0,totalShift=0,maxShift=0;const solved=[];let failure=null;
        for(let pass=0;pass<MAX_BAND_PASSES;pass++){
            const all=boardEntries(g),live=liveEntries(g,all),worst=worstLivePair(live);if(!worst)break;
            const component=interactionBand(live,worst.a,worst.b),fixed=fixedEntries(g,all),seedIds=[worst.a.ball.id,worst.b.ball.id],result=solveBand(component,fixed,seedIds);
            solved.push({pass,seed:seedIds,seedDistance:worst.d,...result});
            if(!result.ok||!result.changed){failure=result;break;}
            totalChanged+=result.changed;totalShift+=result.totalShift||0;maxShift=Math.max(maxShift,result.maxShift||0);
        }
        const all=boardEntries(g),live=liveEntries(g,all),final=minIncomingDistance(all,live);
        const info={changed:totalChanged,totalShift,maxShift,bands:solved,failure,finalMinDistance:Number.isFinite(final.min)?final.min:null,finalPair:final.pair,ok:!Number.isFinite(final.min)||final.min>=OVERLAP_LIMIT,activePath:window.__sixBallLastGarbageActivePathReservationV1||null,orderPreserving:true,maxLocalShift:MAX_LOCAL_SHIFT,at:Date.now()};
        window.__sixBallLastGarbageMinDisplacementRepair=info;
        if(totalChanged)window.__sixBallGarbageMinDisplacementRepairs=(window.__sixBallGarbageMinDisplacementRepairs||0)+totalChanged;
        if(window.__sixBallLastGarbageConstraintSolve&&typeof window.__sixBallLastGarbageConstraintSolve==="object")window.__sixBallLastGarbageConstraintSolve.postMinDisplacement=info;
        return totalChanged;
    }

    resolveVisualContacts=function(g){const result=baseResolveVisualContacts(g);if(garbagePhase(g))repairResidualCrossings(g);return result;};

    window.__sixBallGarbageActivePathReservationV1=true;
    window.__sixBallGarbageActivePathReservationVersion="garbage-active-path-reservation-v1.0";
    window.__sixBallGarbageMinDisplacementCrossingV1=true;
    window.__sixBallGarbageMinDisplacementCrossingVersion="garbage-active-path-min-displacement-v1.8-order-preserving";
})();
