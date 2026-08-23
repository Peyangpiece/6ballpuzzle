/* ============================================================
 * 6ball GARBAGE MIN-DISPLACEMENT CROSSING v1
 *
 * Final post-pass for residual dense garbage contacts.
 *
 * The base authoritative layer already protects the frozen pile, preserves the
 * analytic Y/path timeline and resolves almost every live/live contact. The
 * remaining hard case is a moving outsider touching a wall-anchored tangent
 * row: pair-by-pair correction can oscillate because every row member is also
 * exactly touching its neighbour.
 *
 * This layer solves that residual contact as ONE horizontal interaction band.
 * Starting from the overlap, every live ball close enough in Y that horizontal
 * motion could ever make the pair touch is included before solving. The current
 * left-to-right order is tried first. If that order is impossible, each member
 * of the seed overlap is removed and reinserted at every possible position in
 * the band. This is the smallest non-convex order search needed to represent a
 * real trajectory crossing without attempting a factorial permutation search.
 *
 * For every candidate order, all fixed-support-safe corridor combinations are
 * evaluated and the legal result with minimum total squared horizontal
 * displacement is selected. Reordering is only a tie-break penalty after
 * displacement, so a crossing is never preferred when the current order is
 * already physically legal at lower cost.
 *
 * Only visual X of live incoming garbage is changed. Logical cells, visual Y,
 * path timing, segment metadata, settled/frozen balls and ordinary physics are
 * untouched. Exact tangency is legal.
 * ============================================================ */
(function(){
    if(typeof window==="undefined"||window.__sixBallGarbageMinDisplacementCrossingV1)return;
    if(typeof resolveVisualContacts!=="function")return;

    const baseResolveVisualContacts=resolveVisualContacts;
    const H=typeof HEX_ROW_H==="number"?HEX_ROW_H:Math.sqrt(3)/2;
    const MIN_DIST=1.0;
    const OVERLAP_LIMIT=0.9995;
    const EPS=1e-9;
    const FEAS_EPS=1e-7;
    const MAX_COMPONENT_PASSES=16;
    const MAX_TOTAL_COMBINATIONS=50000;

    function garbagePhase(g){return !!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"&&g.board&&g.vis);}
    function hasLivePath(ball){return Array.isArray(ball?.fallPath)&&ball.fallPath.length>0;}

    function boardEntries(g){
        const out=[];
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            const v=ball&&g.vis.get(ball.id);
            if(ball&&v&&Number.isFinite(v.x)&&Number.isFinite(v.y))out.push({ball,v,x,y});
        }
        return out;
    }

    function frozenIds(board){
        const out=new Set();
        const cached=board?.__hexGarbageFrozenIds;
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

    function physicalDistance(a,b,ax=a.v.x,bx=b.v.x){
        return Math.hypot((ax-bx)*0.5,(a.v.y-b.v.y)*H);
    }

    function requiredX(a,b){
        const dy=(a.v.y-b.v.y)*H;
        if(Math.abs(dy)>=MIN_DIST)return 0;
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
        const ids=new Set(live.map(q=>q.ball.id));
        let min=Infinity,pair=null;
        for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
            if(!ids.has(all[i].ball.id)&&!ids.has(all[j].ball.id))continue;
            const d=physicalDistance(all[i],all[j]);
            if(d<min){min=d;pair=[all[i].ball.id,all[j].ball.id];}
        }
        return{min,pair};
    }

    function allowedIntervals(live,fixed){
        const forbidden=[];
        for(const support of fixed){
            if(!support||support.ball.id===live.ball.id)continue;
            const dy=(live.v.y-support.v.y)*H;
            if(Math.abs(dy)>=MIN_DIST)continue;
            const radial=2*Math.sqrt(Math.max(0,MIN_DIST*MIN_DIST-dy*dy));
            const lo=Math.max(0,support.v.x-radial);
            const hi=Math.min(W2-1,support.v.x+radial);
            if(lo<hi-EPS)forbidden.push({lo,hi});
        }
        if(!forbidden.length)return[{lo:0,hi:W2-1}];

        forbidden.sort((a,b)=>a.lo-b.lo||a.hi-b.hi);
        const merged=[];
        for(const f of forbidden){
            const last=merged[merged.length-1];
            if(!last||f.lo>last.hi+EPS)merged.push({lo:f.lo,hi:f.hi});
            else last.hi=Math.max(last.hi,f.hi);
        }

        const allowed=[];
        let cursor=0;
        for(const f of merged){
            if(f.lo>cursor+EPS)allowed.push({lo:cursor,hi:f.lo});
            cursor=Math.max(cursor,f.hi);
        }
        if(cursor<W2-1-EPS)allowed.push({lo:cursor,hi:W2-1});
        if(!allowed.length){
            if(merged[0].lo>EPS)return[{lo:0,hi:0}];
            const last=merged[merged.length-1];
            if(last.hi<W2-1-EPS)return[{lo:W2-1,hi:W2-1}];
        }
        return allowed;
    }

    function intervalDistance(d,x){
        if(x<d.lo)return d.lo-x;
        if(x>d.hi)return x-d.hi;
        return 0;
    }

    function interactionBand(live,seedA,seedB){
        const byId=new Map(live.map(q=>[q.ball.id,q]));
        const ids=new Set([seedA.ball.id,seedB.ball.id]);
        const queue=[seedA.ball.id,seedB.ball.id];
        while(queue.length){
            const id=queue.shift();
            const a=byId.get(id);
            if(!a)continue;
            for(const b of live){
                if(ids.has(b.ball.id))continue;
                // If |dy| < one physical diameter, some X positions can make
                // the pair touch. Include it now, even when currently far away.
                if(requiredX(a,b)>EPS){ids.add(b.ball.id);queue.push(b.ball.id);}
            }
        }
        return live.filter(q=>ids.has(q.ball.id));
    }

    function baseOrder(component){
        return component.slice().sort((a,b)=>a.v.x-b.v.x||a.x-b.x||a.ball.id-b.ball.id);
    }

    function candidateOrders(component,seedIds){
        const base=baseOrder(component);
        const result=[];
        const seen=new Set();
        function add(order){
            const key=order.map(q=>q.ball.id).join(",");
            if(seen.has(key))return;
            seen.add(key);result.push(order.slice());
        }
        add(base);
        for(const seedId of seedIds){
            const moving=base.find(q=>q.ball.id===seedId);
            if(!moving)continue;
            const rest=base.filter(q=>q.ball.id!==seedId);
            for(let pos=0;pos<=rest.length;pos++){
                const order=rest.slice();
                order.splice(pos,0,moving);
                add(order);
            }
        }
        return{base,orders:result};
    }

    function inversionCount(order,base){
        const pos=new Map(base.map((q,i)=>[q.ball.id,i]));
        let count=0;
        for(let i=0;i<order.length;i++)for(let j=i+1;j<order.length;j++){
            if(pos.get(order[i].ball.id)>pos.get(order[j].ball.id))count++;
        }
        return count;
    }

    function solveDomains(order,req,domains){
        const n=order.length;
        const x=new Array(n);
        for(let j=0;j<n;j++){
            const d=domains[j];
            let need=d.lo;
            for(let i=0;i<j;i++)if(req[i][j]>0)need=Math.max(need,x[i]+req[i][j]);
            if(need>d.hi+FEAS_EPS)return null;
            x[j]=need;
        }

        for(let i=n-1;i>=0;i--){
            const d=domains[i];
            let maxAllowed=d.hi;
            for(let j=i+1;j<n;j++)if(req[i][j]>0)maxAllowed=Math.min(maxAllowed,x[j]-req[i][j]);
            if(maxAllowed<d.lo-FEAS_EPS)return null;
            const target=Math.max(d.lo,Math.min(maxAllowed,order[i].v.x));
            if(target>x[i])x[i]=target;
        }

        for(let i=0;i<n;i++){
            if(x[i]<domains[i].lo-FEAS_EPS||x[i]>domains[i].hi+FEAS_EPS)return null;
            for(let j=i+1;j<n;j++)if(req[i][j]>0&&x[j]-x[i]<req[i][j]-FEAS_EPS)return null;
        }
        return x;
    }

    function solveBand(component,fixed,seedIds){
        const candidates=candidateOrders(component,seedIds);
        const base=candidates.base;
        const baseIds=base.map(q=>q.ball.id);
        let best=null;
        let totalCombinations=0;
        let exhausted=false;
        const orderStats=[];

        for(const order of candidates.orders){
            if(totalCombinations>=MAX_TOTAL_COMBINATIONS){exhausted=true;break;}
            const corridors=order.map(q=>allowedIntervals(q,fixed).slice().sort((a,b)=>{
                const da=intervalDistance(a,q.v.x),db=intervalDistance(b,q.v.x);
                return da-db||a.lo-b.lo;
            }));
            const orderIds=order.map(q=>q.ball.id);
            const inversions=inversionCount(order,base);
            if(corridors.some(q=>!q.length)){
                orderStats.push({order:orderIds,inversions,feasible:false,reason:"no_fixed_corridor",combinations:0});
                continue;
            }

            const n=order.length;
            const req=Array.from({length:n},()=>Array(n).fill(0));
            for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)req[i][j]=requiredX(order[i],order[j]);

            let orderBest=null;
            let orderCombinations=0;
            const domains=new Array(n);

            function visit(k){
                if(totalCombinations>=MAX_TOTAL_COMBINATIONS){exhausted=true;return;}
                if(k===n){
                    totalCombinations++;orderCombinations++;
                    const x=solveDomains(order,req,domains);
                    if(!x)return;
                    let cost=0,logicalCost=0;
                    for(let i=0;i<n;i++){
                        const d=x[i]-order[i].v.x;
                        cost+=d*d;
                        const l=x[i]-order[i].x;
                        logicalCost+=l*l;
                    }
                    if(!orderBest||cost<orderBest.cost-1e-12||
                       (Math.abs(cost-orderBest.cost)<=1e-12&&logicalCost<orderBest.logicalCost-1e-12)){
                        orderBest={x:x.slice(),cost,logicalCost};
                    }
                    return;
                }
                for(const d of corridors[k]){
                    domains[k]=d;
                    visit(k+1);
                    if(exhausted)return;
                }
            }
            visit(0);

            orderStats.push({order:orderIds,inversions,feasible:!!orderBest,combinations:orderCombinations,cost:orderBest?.cost??null});
            if(orderBest){
                const candidate={order,x:orderBest.x,cost:orderBest.cost,logicalCost:orderBest.logicalCost,inversions,corridorCounts:corridors.map(q=>q.length),orderCombinations};
                if(!best||candidate.cost<best.cost-1e-12||
                   (Math.abs(candidate.cost-best.cost)<=1e-12&&candidate.inversions<best.inversions)||
                   (Math.abs(candidate.cost-best.cost)<=1e-12&&candidate.inversions===best.inversions&&candidate.logicalCost<best.logicalCost-1e-12)){
                    best=candidate;
                }
            }
        }

        if(!best)return{
            ok:false,
            reason:exhausted?"order_search_limit":"order_search_infeasible",
            baseOrder:baseIds,
            seedIds:seedIds.slice(),
            orderCandidates:candidates.orders.length,
            totalCombinations,
            orderStats
        };

        let changed=0,maxShift=0,totalShift=0;
        for(let i=0;i<best.order.length;i++){
            const shift=Math.abs(best.x[i]-best.order[i].v.x);
            if(shift>EPS){best.order[i].v.x=best.x[i];changed++;maxShift=Math.max(maxShift,shift);totalShift+=shift;}
        }
        return{
            ok:true,
            baseOrder:baseIds,
            chosenOrder:best.order.map(q=>q.ball.id),
            seedIds:seedIds.slice(),
            reorderCount:best.inversions,
            changed,maxShift,totalShift,cost:best.cost,
            corridorCounts:best.corridorCounts,
            orderCandidates:candidates.orders.length,
            totalCombinations,
            chosenOrderCombinations:best.orderCombinations,
            exhausted,
            orderStats
        };
    }

    function repairResidualCrossings(g){
        if(!garbagePhase(g))return 0;
        let totalChanged=0,totalShift=0,maxShift=0;
        const solved=[];
        let failure=null;

        for(let pass=0;pass<MAX_COMPONENT_PASSES;pass++){
            const all=boardEntries(g);
            const live=liveEntries(g,all);
            const worst=worstLivePair(live);
            if(!worst)break;
            const component=interactionBand(live,worst.a,worst.b);
            const fixed=fixedEntries(g,all);
            const seedIds=[worst.a.ball.id,worst.b.ball.id];
            const result=solveBand(component,fixed,seedIds);
            solved.push({pass,seed:seedIds,seedDistance:worst.d,...result});
            if(!result.ok||!result.changed){failure=result;break;}
            totalChanged+=result.changed;
            totalShift+=result.totalShift||0;
            maxShift=Math.max(maxShift,result.maxShift||0);
        }

        const all=boardEntries(g);
        const live=liveEntries(g,all);
        const final=minIncomingDistance(all,live);
        const info={
            changed:totalChanged,totalShift,maxShift,
            bands:solved,
            failure,
            finalMinDistance:Number.isFinite(final.min)?final.min:null,
            finalPair:final.pair,
            ok:!Number.isFinite(final.min)||final.min>=OVERLAP_LIMIT,
            at:Date.now()
        };
        window.__sixBallLastGarbageMinDisplacementRepair=info;
        if(totalChanged)window.__sixBallGarbageMinDisplacementRepairs=(window.__sixBallGarbageMinDisplacementRepairs||0)+totalChanged;
        if(window.__sixBallLastGarbageConstraintSolve&&typeof window.__sixBallLastGarbageConstraintSolve==="object"){
            window.__sixBallLastGarbageConstraintSolve.postMinDisplacement=info;
        }
        return totalChanged;
    }

    resolveVisualContacts=function(g){
        const result=baseResolveVisualContacts(g);
        if(garbagePhase(g))repairResidualCrossings(g);
        return result;
    };

    window.__sixBallGarbageMinDisplacementCrossingV1=true;
    window.__sixBallGarbageMinDisplacementCrossingVersion="garbage-min-displacement-crossing-v1.5";
})();
