/* ============================================================
 * 6ball GARBAGE DEEP CONTACT RESCUE v2.1
 *
 * Last-resort GARBAGE-only contact projection for dense staggered landings.
 * Ordinary contact solving, monotonic protection and persistent path-time hold
 * run first. This layer activates only if a real overlap still survives.
 *
 * Resolution order:
 *  1. Hold a visually-upper live incoming ball upward when contact blocks fall.
 *  2. If vertical hold cannot solve the contact, minimally separate live garbage
 *     horizontally and propagate that displacement only through bodies in the
 *     same physical-height corridor. Unrelated rows do not participate.
 *
 * Invariants:
 * - existing/frozen/completed bodies never move;
 * - logical cells, fallPath data, pivots/supports and authored times never change;
 * - vertical rescue only removes downward progress;
 * - horizontal rescue moves only live garbage and stays inside board bounds;
 * - local physical X order cannot be crossed through another nearby body;
 * - a trial commits only when every incoming contact is legal afterwards.
 * ============================================================ */
(function installGarbageDeepContactRescueV21(){
    if(typeof window==="undefined"||window.__sixBallGarbageDeepContactHoldV1)return;
    if(typeof resolveVisualContacts!=="function")return;

    window.__sixBallGarbageDeepContactHoldV1=true;

    const baseResolve=resolveVisualContacts;
    const H=typeof HEX_ROW_H==="number"?HEX_ROW_H:Math.sqrt(3)/2;
    const LEGAL_DIST=.9995;
    const TARGET_DIST=.9998;
    const EPS=1e-9;
    const X_MARGIN=2e-6;
    const MAX_PASSES=128;
    const MAX_HORIZONTAL_PASSES=256;
    const MAX_TOTAL_HOLD_ROWS=2.25;
    const MAX_HORIZONTAL_SHIFT_PER_BALL=4.0;

    function garbagePhase(g){
        return !!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"&&Array.isArray(g.board)&&g.vis);
    }
    function frozenIds(board){
        const out=new Set(),cached=board?.__hexGarbageFrozenIds;
        if(cached instanceof Set)for(const id of cached)out.add(id);
        return out;
    }
    function hasLivePath(ball){return Array.isArray(ball?.fallPath)&&ball.fallPath.length>0;}
    function entries(g){
        const out=[],seen=new Set();
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball||seen.has(ball))continue;
            seen.add(ball);
            const v=g.vis.get(ball.id);
            if(v&&Number.isFinite(v.x)&&Number.isFinite(v.y))out.push({ball,v,x,y});
        }
        return out;
    }
    function liveSet(g,all){
        const frozen=frozenIds(g.board),ids=new Set();
        for(const q of all)if(q.ball.isGarbage&&!q.ball.garbagePhaseFrozen&&!frozen.has(q.ball.id)&&hasLivePath(q.ball))ids.add(q.ball.id);
        return ids;
    }
    function liveEntries(all,liveIds){return all.filter(q=>liveIds.has(q.ball.id));}
    function distance(a,b){return Math.hypot((a.v.x-b.v.x)*.5,(a.v.y-b.v.y)*H);}
    function worstIncoming(all,liveIds){
        let worst=null;
        for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
            const a=all[i],b=all[j];
            if(!liveIds.has(a.ball.id)&&!liveIds.has(b.ball.id))continue;
            const d=distance(a,b);
            if(d<LEGAL_DIST-EPS&&(!worst||d<worst.d))worst={a,b,d};
        }
        return worst;
    }
    function requiredRowSeparation(a,b){
        const dx=Math.abs((a.v.x-b.v.x)*.5);
        if(dx>=TARGET_DIST-EPS)return 0;
        return Math.sqrt(Math.max(0,TARGET_DIST*TARGET_DIST-dx*dx))/H;
    }
    function requiredXSeparation(a,b){
        const dy=Math.abs((a.v.y-b.v.y)*H);
        if(dy>=TARGET_DIST-EPS)return 0;
        return 2*Math.sqrt(Math.max(0,TARGET_DIST*TARGET_DIST-dy*dy));
    }
    function chooseUpper(pair,liveIds){
        const {a,b}=pair,dy=a.v.y-b.v.y;
        if(Math.abs(dy)<=1e-8)return null;
        const upper=dy<0?a:b,lower=dy<0?b:a;
        return liveIds.has(upper.ball.id)?{upper,lower}:null;
    }
    function holdForPair(pair,liveIds,heldRows){
        const chosen=chooseUpper(pair,liveIds);
        if(!chosen)return{ok:false,reason:"horizontal_required"};
        const {upper,lower}=chosen,req=requiredRowSeparation(upper,lower);
        if(req<=EPS)return{ok:true,changed:false};
        let need=req-Math.max(0,lower.v.y-upper.v.y);
        if(need<=EPS)return{ok:true,changed:false};
        need+=2e-6;
        const used=heldRows.get(upper.ball.id)||0,remaining=Math.max(0,MAX_TOTAL_HOLD_ROWS-used);
        if(remaining<=EPS)return{ok:false,reason:"deep_hold_budget_exhausted",id:upper.ball.id};
        const shift=Math.min(need,remaining);
        upper.v.y-=shift;
        if(Number.isFinite(upper.v.vy))upper.v.vy=0;
        heldRows.set(upper.ball.id,used+shift);
        return{ok:shift+EPS>=need,changed:shift>EPS,id:upper.ball.id,shift};
    }

    function xSnapshot(live){return new Map(live.map(q=>[q.ball.id,q.v.x]));}
    function restoreX(live,snap){for(const q of live){const x=snap.get(q.ball.id);if(Number.isFinite(x))q.v.x=x;}}
    function orderRanks(live,snap){
        const sorted=live.slice().sort((a,b)=>(snap.get(a.ball.id)-snap.get(b.ball.id))||(a.ball.id-b.ball.id));
        return new Map(sorted.map((q,i)=>[q.ball.id,i]));
    }
    function inBounds(x){return Number.isFinite(x)&&x>=-EPS&&x<=W2-1+EPS;}
    function shiftBudgetOk(q,snap,target){
        const origin=snap.get(q.ball.id);
        return Number.isFinite(origin)&&Math.abs(target-origin)<=MAX_HORIZONTAL_SHIFT_PER_BALL+EPS;
    }
    function chooseSide(pair,dir,liveIds,ranks){
        const a=pair.a,b=pair.b;
        if(dir>0){
            if(a.v.x<b.v.x-EPS)return liveIds.has(b.ball.id)?{move:b,other:a}:null;
            if(b.v.x<a.v.x-EPS)return liveIds.has(a.ball.id)?{move:a,other:b}:null;
            if(liveIds.has(a.ball.id)&&!liveIds.has(b.ball.id))return{move:a,other:b};
            if(liveIds.has(b.ball.id)&&!liveIds.has(a.ball.id))return{move:b,other:a};
            if(liveIds.has(a.ball.id)&&liveIds.has(b.ball.id))return (ranks.get(a.ball.id)>ranks.get(b.ball.id))?{move:a,other:b}:{move:b,other:a};
        }else{
            if(a.v.x<b.v.x-EPS)return liveIds.has(a.ball.id)?{move:a,other:b}:null;
            if(b.v.x<a.v.x-EPS)return liveIds.has(b.ball.id)?{move:b,other:a}:null;
            if(liveIds.has(a.ball.id)&&!liveIds.has(b.ball.id))return{move:a,other:b};
            if(liveIds.has(b.ball.id)&&!liveIds.has(a.ball.id))return{move:b,other:a};
            if(liveIds.has(a.ball.id)&&liveIds.has(b.ball.id))return (ranks.get(a.ball.id)<ranks.get(b.ball.id))?{move:a,other:b}:{move:b,other:a};
        }
        return null;
    }

    function directionalHorizontalTrial(g,seedPair,liveIds,dir){
        let all=entries(g);
        const live=liveEntries(all,liveIds),snap=xSnapshot(live),ranks=orderRanks(live,snap);
        const liveById=new Map(live.map(q=>[q.ball.id,q]));
        let pushes=0;
        const moving=new Set();

        function fail(reason){restoreX(live,snap);return{ok:false,reason};}
        function verticallyRelevant(a,b){return Math.abs((a.v.y-b.v.y)*H)<TARGET_DIST-EPS;}

        function moveLocal(q,target){
            if(!q||!liveIds.has(q.ball.id))return{ok:false,reason:"fixed_local_block"};
            const current=q.v.x;
            if(dir>0&&target<=current+EPS)return{ok:true};
            if(dir<0&&target>=current-EPS)return{ok:true};
            if(!inBounds(target)||!shiftBudgetOk(q,snap,target))return{ok:false,reason:"wall_or_budget_block"};
            if(moving.has(q.ball.id))return{ok:false,reason:"local_order_cycle"};
            moving.add(q.ball.id);

            const scan=entries(g).filter(o=>o.ball.id!==q.ball.id&&verticallyRelevant(q,o)&&(
                dir>0?(o.v.x>current+EPS&&o.v.x<target-EPS):(o.v.x<current-EPS&&o.v.x>target+EPS)
            )).sort((a,b)=>dir>0?a.v.x-b.v.x:b.v.x-a.v.x);

            for(const obstacle of scan){
                if(!liveIds.has(obstacle.ball.id)){moving.delete(q.ball.id);return{ok:false,reason:"fixed_crossing_block"};}
                const liveObstacle=liveById.get(obstacle.ball.id)||obstacle;
                const r=moveLocal(liveObstacle,target);
                if(!r.ok){moving.delete(q.ball.id);return r;}
            }
            q.v.x=target;pushes++;
            moving.delete(q.ball.id);
            return{ok:true};
        }

        const seed=chooseSide(seedPair,dir,liveIds,ranks);
        if(!seed)return fail("fixed_blocks_direction");
        const seedReq=requiredXSeparation(seed.move,seed.other);
        if(seedReq<=EPS)return fail("no_horizontal_requirement");
        let target=seed.other.v.x+dir*(seedReq+X_MARGIN);
        if(dir>0)target=Math.max(seed.move.v.x,target);else target=Math.min(seed.move.v.x,target);
        let moved=moveLocal(seed.move,target);
        if(!moved.ok)return fail(moved.reason);

        for(let pass=0;pass<MAX_HORIZONTAL_PASSES;pass++){
            all=entries(g);
            const overlap=worstIncoming(all,liveIds);
            if(!overlap){
                const positions=new Map(live.map(q=>[q.ball.id,q.v.x]));
                let cost=0,maxShift=0;
                for(const q of live){const dx=q.v.x-snap.get(q.ball.id);cost+=dx*dx;maxShift=Math.max(maxShift,Math.abs(dx));}
                restoreX(live,snap);
                return{ok:true,dir,positions,cost,maxShift,pushes,passes:pass+1};
            }
            const side=chooseSide(overlap,dir,liveIds,ranks);
            if(!side)return fail("fixed_contact_chain_block");
            const req=requiredXSeparation(side.move,side.other);
            if(req<=EPS)return fail("unresolvable_vertical_geometry");
            target=side.other.v.x+dir*(req+X_MARGIN);
            if(dir>0)target=Math.max(side.move.v.x,target);else target=Math.min(side.move.v.x,target);
            if(Math.abs(target-side.move.v.x)<=EPS)return fail("horizontal_no_progress");
            moved=moveLocal(side.move,target);
            if(!moved.ok)return fail(moved.reason);
        }
        return fail("horizontal_pass_limit");
    }

    function horizontalRescue(g,pair,liveIds){
        const trials=[];
        for(const dir of [-1,1]){const r=directionalHorizontalTrial(g,pair,liveIds,dir);if(r.ok)trials.push(r);}
        if(!trials.length)return{ok:false,reason:"no_horizontal_chain_solution"};
        trials.sort((a,b)=>a.cost-b.cost||a.maxShift-b.maxShift||a.pushes-b.pushes);
        const best=trials[0],live=liveEntries(entries(g),liveIds);
        for(const q of live){const x=best.positions.get(q.ball.id);if(Number.isFinite(x))q.v.x=x;}
        return{ok:true,changed:true,dir:best.dir,cost:best.cost,maxShift:best.maxShift,pushes:best.pushes,passes:best.passes};
    }

    function solve(g){
        let all=entries(g);const liveIds=liveSet(g,all);
        if(!liveIds.size)return{ok:true,changed:0,verticalChanges:0,horizontalChanges:0,passes:0,min:null,pair:null,held:[],horizontal:[]};
        const heldRows=new Map(),horizontal=[];
        let changed=0,verticalChanges=0,horizontalChanges=0,passes=0,failure=null;
        for(;passes<MAX_PASSES;passes++){
            all=entries(g);const worst=worstIncoming(all,liveIds);if(!worst)break;
            const v=holdForPair(worst,liveIds,heldRows);
            if(v.ok&&v.changed){changed++;verticalChanges++;continue;}
            const h=horizontalRescue(g,worst,liveIds);
            if(h.ok&&h.changed){changed++;horizontalChanges++;horizontal.push({pair:[worst.a.ball.id,worst.b.ball.id],distance:worst.d,...h});continue;}
            failure={reason:h.reason||v.reason||"no_contact_progress",verticalReason:v.reason||null,pair:[worst.a.ball.id,worst.b.ball.id],distance:worst.d,id:v.id||null};
            break;
        }
        all=entries(g);const final=worstIncoming(all,liveIds);
        return{ok:!final,changed,verticalChanges,horizontalChanges,passes,min:final?final.d:null,pair:final?[final.a.ball.id,final.b.ball.id]:null,failure,held:[...heldRows].map(([id,rows])=>({id,rows})),horizontal};
    }

    resolveVisualContacts=function(g){
        const result=baseResolve(g);if(!garbagePhase(g))return result;
        const all=entries(g),liveIds=liveSet(g,all),before=worstIncoming(all,liveIds);
        if(!before){window.__sixBallLastGarbageDeepContactHoldV1={active:false,ok:true,at:Date.now()};return result;}
        const info=solve(g);
        window.__sixBallLastGarbageDeepContactHoldV1={active:true,before:before.d,beforePair:[before.a.ball.id,before.b.ball.id],...info,at:Date.now()};
        if(info.changed)window.__sixBallGarbageDeepContactCorrections=(window.__sixBallGarbageDeepContactCorrections||0)+info.changed;
        if(info.horizontalChanges)window.__sixBallGarbageEmergencyHorizontalCorrections=(window.__sixBallGarbageEmergencyHorizontalCorrections||0)+info.horizontalChanges;
        return result;
    };

    window.__sixBallGarbageDeepContactHoldVersion="garbage-deep-contact-rescue-v2.1";
})();
