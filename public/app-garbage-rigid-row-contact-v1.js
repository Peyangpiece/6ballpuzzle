/* ============================================================
 * 6ball GARBAGE PHYSICAL CONTACT HOLD v3.3
 *
 * Dense GARBAGE can reach a frame where the authoritative horizontal-only
 * contact network has no feasible solution. In that case real contact blocks
 * downward progress instead of pushing centres through one another.
 *
 * This final GARBAGE-only layer activates only when that network reports failure.
 * It rewinds at most one authored physics frame of Y travel, never changes X,
 * logical cells, fallPath timing, pivots, supports, or the frozen pile.
 * ============================================================ */
(function installGarbagePhysicalContactHoldV33(){
    if(typeof window==="undefined"||window.__sixBallGarbageRigidRowContactV1)return;
    if(typeof resolveVisualContacts!=="function")return;
    window.__sixBallGarbageRigidRowContactV1=true;

    const baseResolve=resolveVisualContacts;
    const H=typeof HEX_ROW_H==="number"?HEX_ROW_H:Math.sqrt(3)/2;
    const FRAME=typeof PHYSICS_FRAME==="number"?PHYSICS_FRAME:1/120;
    const TEST_LEGAL_DIST=.9995;
    // Match the production pile/garbage contact tolerance, while retaining
    // enough margin that exact floating-point rounding cannot fall below the
    // integration invariant (.9995).
    const CONTACT_DIST=.9998;
    const EPS=1e-9;
    const SOLVE_TOL=1e-8;
    const SAME_Y_EPS=1e-8;
    const MAX_PASSES=256;

    function garbagePhase(g){return !!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"&&Array.isArray(g.board)&&g.vis);}
    function frozenIds(board){
        const out=new Set(),cached=board?.__hexGarbageFrozenIds;
        if(cached instanceof Set)for(const id of cached)out.add(id);
        return out;
    }
    function livePath(ball){return Array.isArray(ball?.fallPath)&&ball.fallPath.length>0;}
    function entries(g){
        const out=[],seen=new Set();
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball||seen.has(ball))continue;
            seen.add(ball);
            const v=g.vis.get(ball.id);
            if(ball&&v&&Number.isFinite(v.x)&&Number.isFinite(v.y))out.push({ball,v,x,y});
        }
        return out;
    }
    function liveEntries(g,all){
        const frozen=frozenIds(g.board);
        return all.filter(q=>q.ball.isGarbage&&!q.ball.garbagePhaseFrozen&&!frozen.has(q.ball.id)&&livePath(q.ball));
    }
    function distance(a,b){return Math.hypot((a.v.x-b.v.x)*.5,(a.v.y-b.v.y)*H);}
    function minIncoming(all,live){
        const ids=new Set(live.map(q=>q.ball.id));let min=Infinity,pair=null;
        for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
            if(!ids.has(all[i].ball.id)&&!ids.has(all[j].ball.id))continue;
            const d=distance(all[i],all[j]);if(d<min){min=d;pair=[all[i].ball.id,all[j].ball.id];}
        }
        return{min,pair};
    }
    function predicted(g,q,t){
        if(typeof pileFlowPositionAt!=="function")return null;
        try{
            const p=pileFlowPositionAt(g,q.ball,Math.max(0,t));
            return Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])?p:null;
        }catch(_){return null;}
    }
    function requiredY(a,b){
        const dx=Math.abs((a.v.x-b.v.x)*.5);
        if(dx>=CONTACT_DIST-EPS)return 0;
        return Math.sqrt(Math.max(0,CONTACT_DIST*CONTACT_DIST-dx*dx))/H;
    }

    function variables(g,live){
        const prevT=Math.max(0,(Number(g.pileFlowClock)||0)-FRAME),vars=[],byId=new Map();
        for(const q of live){
            const p=predicted(g,q,prevT);
            const lower=p&&Number.isFinite(p[1])?Math.min(0,p[1]-q.v.y):0;
            const index=vars.length;
            vars.push({q,lower,upper:0,prevY:p?.[1]});byId.set(q.ball.id,index);
        }
        return{vars,byId};
    }
    function add(list,a,b,c,meta){if(Number.isFinite(c))list.push({a,b,c,meta});}
    function constraints(all,live,vars,byId){
        const fixed=vars.length,list=[],liveIds=new Set(live.map(q=>q.ball.id));
        let sameHeightIllegal=null;
        for(let i=0;i<vars.length;i++){
            add(list,i,fixed,0,{kind:"no_downward",id:vars[i].q.ball.id});
            add(list,fixed,i,-vars[i].lower,{kind:"one_frame",id:vars[i].q.ball.id});
        }
        for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
            const a=all[i],b=all[j];
            if(!liveIds.has(a.ball.id)&&!liveIds.has(b.ball.id))continue;
            const req=requiredY(a,b);if(req<=EPS)continue;
            const ai=byId.has(a.ball.id)?byId.get(a.ball.id):fixed;
            const bi=byId.has(b.ball.id)?byId.get(b.ball.id):fixed;
            if(ai===fixed&&bi===fixed)continue;
            const dy=b.v.y-a.v.y;
            if(Math.abs(dy)<=SAME_Y_EPS){
                if(distance(a,b)<TEST_LEGAL_DIST-SOLVE_TOL)sameHeightIllegal={ids:[a.ball.id,b.ball.id],distance:distance(a,b)};
                continue;
            }
            if(dy>0)add(list,ai,bi,dy-req,{kind:"pair",upper:a.ball.id,lower:b.ball.id,req,distance:distance(a,b)});
            else add(list,bi,ai,-dy-req,{kind:"pair",upper:b.ball.id,lower:a.ball.id,req,distance:distance(a,b)});
        }
        return{list,fixed,sameHeightIllegal};
    }
    function project(values,lower,upper,q){
        const violation=values[q.a]-values[q.b]-q.c;if(violation<=SOLVE_TOL)return 0;
        const canA=Math.max(0,values[q.a]-lower[q.a]),canB=Math.max(0,upper[q.b]-values[q.b]);
        if(canA+canB<violation-SOLVE_TOL)return Infinity;
        const takeA=Math.max(0,Math.min(canA,violation-canB/2));
        const takeB=violation-takeA;
        if(takeB>canB+SOLVE_TOL)return Infinity;
        values[q.a]-=takeA;values[q.b]+=takeB;return violation;
    }
    function solve(vars,built){
        const lower=vars.map(v=>v.lower).concat([0]),upper=vars.map(v=>v.upper).concat([0]);
        const values=new Array(vars.length+1).fill(0);let failed=null,passes=0;
        for(;passes<MAX_PASSES;passes++){
            let max=0;
            for(const q of built.list){
                const r=project(values,lower,upper,q);
                if(r===Infinity){failed={...q,violation:values[q.a]-values[q.b]-q.c,lowerA:lower[q.a],lowerB:lower[q.b]};break;}
                max=Math.max(max,r);
            }
            values[built.fixed]=0;
            if(failed||max<=SOLVE_TOL)break;
        }
        if(!failed){
            for(const q of built.list){
                const v=values[q.a]-values[q.b]-q.c;
                if(v>1e-6){failed={...q,violation:v,lowerA:lower[q.a],lowerB:lower[q.b]};break;}
            }
        }
        return{ok:!failed,values:values.slice(0,vars.length),passes:passes+1,failed};
    }
    function snapshot(live){return new Map(live.map(q=>[q.ball.id,{y:q.v.y,vy:q.v.vy}]));}
    function restore(live,s){for(const q of live){const p=s.get(q.ball.id);if(p){q.v.y=p.y;q.v.vy=p.vy;}}}
    function apply(vars,values){
        let changed=0,totalHold=0,maxHold=0;const held=[];
        for(let i=0;i<vars.length;i++){
            const dy=values[i];if(dy>=-EPS)continue;
            const q=vars[i].q;q.v.y+=dy;
            if(Number.isFinite(q.v.vy))q.v.vy=Math.max(0,q.v.vy+dy/Math.max(EPS,FRAME));
            changed++;totalHold+=-dy;maxHold=Math.max(maxHold,-dy);held.push({id:q.ball.id,dy,prevY:vars[i].prevY,newY:q.v.y});
        }
        return{changed,totalHold,maxHold,held};
    }

    resolveVisualContacts=function(g){
        const result=baseResolve(g);if(!garbagePhase(g))return result;
        const baseState=window.__sixBallLastGarbageConstraintSolve||null;
        let all=entries(g),live=liveEntries(g,all);const before=minIncoming(all,live);
        if(!live.length||baseState?.ok!==false){
            window.__sixBallLastGarbageRigidRowContactV1={active:false,reason:"base_solver_ok",before:before.min,beforePair:before.pair,at:Date.now()};
            return result;
        }

        const saved=snapshot(live),builtVars=variables(g,live),built=constraints(all,live,builtVars.vars,builtVars.byId);
        if(built.sameHeightIllegal){
            window.__sixBallLastGarbageRigidRowContactV1={active:true,ok:false,reason:"same_height_horizontal_required",before:before.min,beforePair:before.pair,sameHeightIllegal:built.sameHeightIllegal,at:Date.now()};
            return result;
        }
        const solved=solve(builtVars.vars,built);
        if(!solved.ok){
            window.__sixBallLastGarbageRigidRowContactV1={active:true,ok:false,reason:"vertical_hold_infeasible",before:before.min,beforePair:before.pair,passes:solved.passes,failed:solved.failed?.meta||null,at:Date.now()};
            return result;
        }
        const movement=apply(builtVars.vars,solved.values);
        all=entries(g);live=liveEntries(g,all);const after=minIncoming(all,live);
        if(Number.isFinite(after.min)&&after.min<TEST_LEGAL_DIST-SOLVE_TOL){
            restore(live,saved);
            window.__sixBallLastGarbageRigidRowContactV1={active:true,ok:false,reason:"post_hold_overlap",before:before.min,beforePair:before.pair,after:after.min,afterPair:after.pair,movement,at:Date.now()};
            return result;
        }
        window.__sixBallLastGarbageRigidRowContactV1={active:true,ok:true,mode:"physical_vertical_contact_hold",before:before.min,beforePair:before.pair,after:after.min,afterPair:after.pair,movement,passes:solved.passes,at:Date.now()};
        if(movement.changed)window.__sixBallGarbageRigidRowContactCorrections=(window.__sixBallGarbageRigidRowContactCorrections||0)+movement.changed;
        return result;
    };

    window.__sixBallGarbageRigidRowContactVersion="garbage-physical-contact-hold-v3.3";
})();
