/* ============================================================
 * 6ball GARBAGE DEEP CONTACT RESCUE v2.3
 *
 * Last-resort GARBAGE-only contact projection for dense staggered landings.
 * Ordinary contact solving, monotonic protection and persistent path-time hold
 * run first. This layer activates only if a real overlap still survives.
 *
 * v2.3 adds one final authoritative invariant: a live garbage ball may not walk
 * horizontally away from the X corridor authored by its remaining fallPath.
 * Earlier contact layers can make a small local correction, but repeating that
 * correction every frame must not accumulate into a board-wide teleport.
 *
 * Resolution order:
 *  0. Clamp only runaway LIVE garbage X back into its remaining authored path
 *     envelope (logical X + all remaining segment from/to X, with 1 lattice of
 *     physical contact margin).
 *  1. If a live FOLLOW_SUPPORT segment overlaps a support explicitly named by
 *     that segment, keep the follower on the physically-above tangent side of
 *     that support. A completed/fixed support is never moved sideways to make
 *     room for its own follower.
 *  2. Otherwise hold a visually-upper live incoming ball upward when contact
 *     blocks fall.
 *  3. Only if vertical contact cannot solve the pair, minimally separate live
 *     garbage horizontally inside the same physical-height corridor AND inside
 *     the authored X envelope.
 *
 * Invariants:
 * - existing/frozen/completed bodies never move;
 * - logical cells, fallPath data, pivots/supports and authored times never change;
 * - vertical rescue only removes downward progress;
 * - horizontal rescue moves only live garbage and stays inside board bounds;
 * - local physical X order cannot be crossed through another nearby body;
 * - no live garbage can accumulate horizontal correction beyond its authored
 *   remaining path corridor;
 * - a trial commits only when every incoming contact is legal afterwards.
 * ============================================================ */
(function installGarbageDeepContactRescueV23(){
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
    const MAX_AUTHORED_X_MARGIN=1.0;

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

    function authoredXEnvelope(q){
        let minX=Number(q?.x),maxX=Number(q?.x);
        if(!Number.isFinite(minX)){minX=Number(q?.v?.x)||0;maxX=minX;}
        for(const seg of q?.ball?.fallPath||[]){
            const fx=Number(seg?.from?.[0]),tx=Number(seg?.to?.[0]);
            if(Number.isFinite(fx)){minX=Math.min(minX,fx);maxX=Math.max(maxX,fx);}
            if(Number.isFinite(tx)){minX=Math.min(minX,tx);maxX=Math.max(maxX,tx);}
        }
        return{
            lo:Math.max(0,minX-MAX_AUTHORED_X_MARGIN),
            hi:Math.min(W2-1,maxX+MAX_AUTHORED_X_MARGIN),
            minX,maxX
        };
    }
    function clampRunawayPathX(all,liveIds){
        let changed=0,maxCorrection=0,totalCorrection=0;
        const corrections=[];
        for(const q of all){
            if(!liveIds.has(q.ball.id)||!Number.isFinite(q.v.x))continue;
            const env=authoredXEnvelope(q);
            const before=q.v.x;
            const after=Math.max(env.lo,Math.min(env.hi,before));
            if(Math.abs(after-before)<=EPS)continue;
            q.v.x=after;
            const correction=Math.abs(after-before);
            changed++;maxCorrection=Math.max(maxCorrection,correction);totalCorrection+=correction;
            corrections.push({id:q.ball.id,before,after,logicalX:q.x,envelope:[env.lo,env.hi],authored:[env.minX,env.maxX]});
        }
        return{changed,maxCorrection,totalCorrection,corrections};
    }

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

    function segmentNamesSupport(seg,supportId){
        if(!seg||supportId===undefined||supportId===null)return false;
        if(Number(seg.movingSupportId)===Number(supportId))return true;
        return Array.isArray(seg.followSupportIds)&&seg.followSupportIds.some(id=>Number(id)===Number(supportId));
    }
    function activeSupportSegment(g,ball,supportId){
        const path=Array.isArray(ball?.fallPath)?ball.fallPath:[];
        const clock=Math.max(0,Number(g?.pileFlowClock)||0);
        for(const seg of path){
            if(!segmentNamesSupport(seg,supportId))continue;
            const start=Number(seg.pileFlowStart),end=Number(seg.pileFlowEnd);
            if(Number.isFinite(start)&&Number.isFinite(end)&&clock+EPS>=start&&clock<=end+EPS)return seg;
        }
        const head=path[0];
        return segmentNamesSupport(head,supportId)?head:null;
    }
    function explicitSupportFollower(g,pair,liveIds){
        const candidates=[[pair.a,pair.b],[pair.b,pair.a]];
        for(const [follower,support] of candidates){
            if(!liveIds.has(follower.ball.id))continue;
            const seg=activeSupportSegment(g,follower.ball,support.ball.id);
            if(seg)return{follower,support,seg};
        }
        return null;
    }
    function applyUpwardHold(q,need,heldRows,reason,extra={}){
        need=Math.max(0,Number(need)||0);
        if(need<=EPS)return{ok:true,changed:false,id:q.ball.id,reason,...extra};
        need+=2e-6;
        const used=heldRows.get(q.ball.id)||0;
        const remaining=Math.max(0,MAX_TOTAL_HOLD_ROWS-used);
        if(remaining<=EPS)return{ok:false,reason:"deep_hold_budget_exhausted",id:q.ball.id,...extra};
        const shift=Math.min(need,remaining);
        q.v.y-=shift;
        if(Number.isFinite(q.v.vy))q.v.vy=0;
        heldRows.set(q.ball.id,used+shift);
        return{ok:shift+EPS>=need,changed:shift>EPS,id:q.ball.id,shift,reason,...extra};
    }
    function holdExplicitSupport(g,pair,liveIds,heldRows){
        const rel=explicitSupportFollower(g,pair,liveIds);
        if(!rel)return null;
        const {follower,support,seg}=rel;
        const req=requiredRowSeparation(follower,support);
        if(req<=EPS)return{ok:true,changed:false,id:follower.ball.id,reason:"explicit_support_tangent_already_horizontal"};
        const allowedMaxY=support.v.y-req;
        const need=follower.v.y-allowedMaxY;
        return applyUpwardHold(follower,need,heldRows,"explicit_support_vertical_hold",{
            supportId:support.ball.id,
            movingSupportId:Number(seg.movingSupportId)||0,
            supportIds:Array.isArray(seg.followSupportIds)?seg.followSupportIds.slice():[],
            requiredRows:req,
            targetY:allowedMaxY
        });
    }
    function chooseUpper(pair,liveIds){
        const {a,b}=pair,dy=a.v.y-b.v.y;
        if(Math.abs(dy)<=1e-8)return null;
        const upper=dy<0?a:b,lower=dy<0?b:a;
        return liveIds.has(upper.ball.id)?{upper,lower}:null;
    }
    function holdForPair(g,pair,liveIds,heldRows){
        const supportHold=holdExplicitSupport(g,pair,liveIds,heldRows);
        if(supportHold)return supportHold;
        const chosen=chooseUpper(pair,liveIds);
        if(!chosen)return{ok:false,reason:"horizontal_required"};
        const {upper,lower}=chosen,req=requiredRowSeparation(upper,lower);
        if(req<=EPS)return{ok:true,changed:false};
        const need=req-Math.max(0,lower.v.y-upper.v.y);
        return applyUpwardHold(upper,need,heldRows,"generic_vertical_hold");
    }

    function xSnapshot(live){return new Map(live.map(q=>[q.ball.id,q.v.x]));}
    function restoreX(live,snap){for(const q of live){const x=snap.get(q.ball.id);if(Number.isFinite(x))q.v.x=x;}}
    function orderRanks(live,snap){
        const sorted=live.slice().sort((a,b)=>(snap.get(a.ball.id)-snap.get(b.ball.id))||(a.ball.id-b.ball.id));
        return new Map(sorted.map((q,i)=>[q.ball.id,i]));
    }
    function inBounds(x){return Number.isFinite(x)&&x>=-EPS&&x<=W2-1+EPS;}
    function shiftBudgetOk(q,snap,target){
        const origin=snap.get(q.ball.id),env=authoredXEnvelope(q);
        return Number.isFinite(origin)&&
            Math.abs(target-origin)<=MAX_HORIZONTAL_SHIFT_PER_BALL+EPS&&
            target>=env.lo-EPS&&target<=env.hi+EPS;
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
            if(!inBounds(target)||!shiftBudgetOk(q,snap,target))return{ok:false,reason:"wall_or_authored_budget_block"};
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
        if(explicitSupportFollower(g,pair,liveIds))return{ok:false,reason:"explicit_support_blocks_horizontal_rescue"};
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
        if(!liveIds.size)return{ok:true,changed:0,verticalChanges:0,horizontalChanges:0,supportChanges:0,passes:0,min:null,pair:null,held:[],horizontal:[]};
        const heldRows=new Map(),horizontal=[];
        let changed=0,verticalChanges=0,horizontalChanges=0,supportChanges=0,passes=0,failure=null;
        for(;passes<MAX_PASSES;passes++){
            all=entries(g);const worst=worstIncoming(all,liveIds);if(!worst)break;
            const v=holdForPair(g,worst,liveIds,heldRows);
            if(v.ok&&v.changed){
                changed++;verticalChanges++;
                if(v.reason==="explicit_support_vertical_hold")supportChanges++;
                continue;
            }
            const h=horizontalRescue(g,worst,liveIds);
            if(h.ok&&h.changed){changed++;horizontalChanges++;horizontal.push({pair:[worst.a.ball.id,worst.b.ball.id],distance:worst.d,...h});continue;}
            failure={reason:h.reason||v.reason||"no_contact_progress",verticalReason:v.reason||null,pair:[worst.a.ball.id,worst.b.ball.id],distance:worst.d,id:v.id||null,supportId:v.supportId||null};
            break;
        }
        all=entries(g);const final=worstIncoming(all,liveIds);
        return{ok:!final,changed,verticalChanges,horizontalChanges,supportChanges,passes,min:final?final.d:null,pair:final?[final.a.ball.id,final.b.ball.id]:null,failure,held:[...heldRows].map(([id,rows])=>({id,rows})),horizontal};
    }

    resolveVisualContacts=function(g){
        const result=baseResolve(g);if(!garbagePhase(g))return result;
        let all=entries(g),liveIds=liveSet(g,all);
        const envelope=clampRunawayPathX(all,liveIds);
        if(envelope.changed){all=entries(g);liveIds=liveSet(g,all);}
        const before=worstIncoming(all,liveIds);
        if(!before){
            window.__sixBallLastGarbageDeepContactHoldV1={active:envelope.changed>0,ok:true,mode:envelope.changed?"authored_x_envelope":"clear",envelope,at:Date.now()};
            if(envelope.changed)window.__sixBallGarbageAuthoredXCorrections=(window.__sixBallGarbageAuthoredXCorrections||0)+envelope.changed;
            return result;
        }
        const info=solve(g);
        window.__sixBallLastGarbageDeepContactHoldV1={active:true,before:before.d,beforePair:[before.a.ball.id,before.b.ball.id],envelope,...info,at:Date.now()};
        if(envelope.changed)window.__sixBallGarbageAuthoredXCorrections=(window.__sixBallGarbageAuthoredXCorrections||0)+envelope.changed;
        if(info.changed)window.__sixBallGarbageDeepContactCorrections=(window.__sixBallGarbageDeepContactCorrections||0)+info.changed;
        if(info.supportChanges)window.__sixBallGarbageExplicitSupportHolds=(window.__sixBallGarbageExplicitSupportHolds||0)+info.supportChanges;
        if(info.horizontalChanges)window.__sixBallGarbageEmergencyHorizontalCorrections=(window.__sixBallGarbageEmergencyHorizontalCorrections||0)+info.horizontalChanges;
        return result;
    };

    window.__sixBallGarbageExplicitSupportHold=true;
    window.__sixBallGarbageAuthoredXPathEnvelope=true;
    window.__sixBallGarbageDeepContactHoldVersion="garbage-deep-contact-rescue-v2.3-authored-x-envelope";
})();
