/* ============================================================
 * 6ball GARBAGE PERSISTENT CONTACT HOLD v4
 *
 * The horizontal-only garbage contact network is authoritative while it has a
 * feasible answer.  In a dense staggered landing there are frames where no X
 * placement can keep every live ball outside every neighbour.  Real gravity
 * does not teleport the blocked ball back onto its free-fall clock on the next
 * frame: contact consumes time.  The previous one-frame visual correction did
 * exactly that reset and the overlap returned one frame later.
 *
 * v4 stores that lost path time per live garbage ball.  The normal pile-flow
 * visual updater is evaluated at (wall clock - accumulated contact delay), so a
 * physically blocked ball resumes from the point at which contact actually left
 * it.  No authored segment timestamp is rewritten.
 *
 * Invariants:
 * - the existing/frozen pile never moves;
 * - X is changed only by the existing authoritative horizontal solver;
 * - logical board cells, pivots, support metadata and fallPath timestamps are
 *   never rewritten here;
 * - contact may only remove downward progress, never add downward motion;
 * - each correction may rewind at most one effective physics frame;
 * - accumulated delay is permanent elapsed contact time, not a sticky bond: once
 *   contact releases, effective path time advances 1:1 with wall time again.
 * ============================================================ */
(function installGarbagePersistentContactHoldV4(){
    if(typeof window==="undefined"||window.__sixBallGarbageRigidRowContactV1)return;
    if(typeof resolveVisualContacts!=="function")return;

    window.__sixBallGarbageRigidRowContactV1=true;

    const baseResolve=resolveVisualContacts;
    const baseUpdateScheduled=
        typeof updateScheduledPileFlowVisual==="function"
            ?updateScheduledPileFlowVisual
            :null;

    const H=typeof HEX_ROW_H==="number"?HEX_ROW_H:Math.sqrt(3)/2;
    const FRAME=typeof PHYSICS_FRAME==="number"?PHYSICS_FRAME:1/120;
    const LEGAL_DIST=.9995;
    const CONTACT_DIST=.9998;
    const EPS=1e-9;
    const SOLVE_TOL=1e-8;
    const SAME_Y_EPS=1e-8;
    const MAX_PASSES=256;

    // WeakMap keeps contact history engine-local without becoming gameplay state.
    const delayStateByGame=new WeakMap();

    function garbagePhase(g){
        return !!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"&&Array.isArray(g.board)&&g.vis);
    }

    function frozenIds(board){
        const out=new Set();
        const cached=board?.__hexGarbageFrozenIds;
        if(cached instanceof Set)for(const id of cached)out.add(id);
        return out;
    }

    function livePath(ball){
        return Array.isArray(ball?.fallPath)&&ball.fallPath.length>0;
    }

    function gameDelayMap(g,create=true){
        let map=delayStateByGame.get(g);
        if(!map&&create){map=new Map();delayStateByGame.set(g,map);}
        return map||null;
    }

    function delayRecord(g,id,create=true){
        const map=gameDelayMap(g,create);
        if(!map)return null;
        let r=map.get(id);
        if(!r&&create){r={delay:0,lastAddedClock:-Infinity};map.set(id,r);}
        return r||null;
    }

    function currentDelay(g,ball){
        return Math.max(0,Number(delayRecord(g,ball?.id,false)?.delay)||0);
    }

    function clearDelay(g,id){
        gameDelayMap(g,false)?.delete(id);
    }

    // Persistent path-time delay must be applied BEFORE app-07 removes completed
    // segments.  Temporarily substituting the per-ball effective clock lets the
    // original updater remain the single authority for interpolation, segment
    // completion, speed and gravity state.
    if(baseUpdateScheduled){
        updateScheduledPileFlowVisual=function(g,cell,v,dt){
            if(!garbagePhase(g)||!cell?.isGarbage){
                return baseUpdateScheduled(g,cell,v,dt);
            }

            const frozen=frozenIds(g.board);
            if(cell.garbagePhaseFrozen||frozen.has(cell.id)||!livePath(cell)){
                clearDelay(g,cell.id);
                return baseUpdateScheduled(g,cell,v,dt);
            }

            const delay=currentDelay(g,cell);
            if(delay<=EPS)return baseUpdateScheduled(g,cell,v,dt);

            const wallClock=Number(g.pileFlowClock)||0;
            const effectiveClock=Math.max(0,wallClock-delay);
            g.pileFlowClock=effectiveClock;
            try{
                const result=baseUpdateScheduled(g,cell,v,dt);
                if(!livePath(cell))clearDelay(g,cell.id);
                return result;
            }finally{
                g.pileFlowClock=wallClock;
            }
        };
    }

    function entries(g){
        const out=[];
        const seen=new Set();
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball||seen.has(ball))continue;
            seen.add(ball);
            const v=g.vis.get(ball.id);
            if(v&&Number.isFinite(v.x)&&Number.isFinite(v.y))out.push({ball,v,x,y});
        }
        return out;
    }

    function liveEntries(g,all){
        const frozen=frozenIds(g.board);
        return all.filter(q=>
            q.ball.isGarbage&&
            !q.ball.garbagePhaseFrozen&&
            !frozen.has(q.ball.id)&&
            livePath(q.ball)
        );
    }

    function distance(a,b){
        return Math.hypot((a.v.x-b.v.x)*.5,(a.v.y-b.v.y)*H);
    }

    function minIncoming(all,live){
        const ids=new Set(live.map(q=>q.ball.id));
        let min=Infinity,pair=null;
        for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
            if(!ids.has(all[i].ball.id)&&!ids.has(all[j].ball.id))continue;
            const d=distance(all[i],all[j]);
            if(d<min){min=d;pair=[all[i].ball.id,all[j].ball.id];}
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

    function effectiveClock(g,q){
        return Math.max(0,(Number(g.pileFlowClock)||0)-currentDelay(g,q.ball));
    }

    function requiredY(a,b){
        const dx=Math.abs((a.v.x-b.v.x)*.5);
        if(dx>=CONTACT_DIST-EPS)return 0;
        return Math.sqrt(Math.max(0,CONTACT_DIST*CONTACT_DIST-dx*dx))/H;
    }

    function variables(g,live){
        const vars=[];
        const byId=new Map();
        for(const q of live){
            const effectiveNow=effectiveClock(g,q);
            const prevT=Math.max(0,effectiveNow-FRAME);
            const p=predicted(g,q,prevT);
            let lower=0;
            if(p&&Number.isFinite(p[1])){
                lower=Math.min(0,p[1]-q.v.y);
            }else{
                lower=-Math.max(0,Number(q.v.vy)||0)*FRAME;
            }
            const index=vars.length;
            vars.push({q,lower,upper:0,prevY:p?.[1],effectiveNow});
            byId.set(q.ball.id,index);
        }
        return{vars,byId};
    }

    function add(list,a,b,c,meta){
        if(Number.isFinite(c))list.push({a,b,c,meta});
    }

    // Difference constraints are d[a] - d[b] <= c, where d<=0 is an
    // upward-in-time hold for that frame.  The last variable is a fixed support.
    function constraints(all,live,vars,byId){
        const fixed=vars.length;
        const list=[];
        const liveIds=new Set(live.map(q=>q.ball.id));
        let sameHeightIllegal=null;

        for(let i=0;i<vars.length;i++){
            add(list,i,fixed,0,{kind:"no_downward",id:vars[i].q.ball.id});
            add(list,fixed,i,-vars[i].lower,{kind:"one_effective_frame",id:vars[i].q.ball.id});
        }

        for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
            const a=all[i],b=all[j];
            if(!liveIds.has(a.ball.id)&&!liveIds.has(b.ball.id))continue;

            const req=requiredY(a,b);
            if(req<=EPS)continue;

            const ai=byId.has(a.ball.id)?byId.get(a.ball.id):fixed;
            const bi=byId.has(b.ball.id)?byId.get(b.ball.id):fixed;
            if(ai===fixed&&bi===fixed)continue;

            const dy=b.v.y-a.v.y;
            if(Math.abs(dy)<=SAME_Y_EPS){
                if(distance(a,b)<LEGAL_DIST-SOLVE_TOL){
                    sameHeightIllegal={ids:[a.ball.id,b.ball.id],distance:distance(a,b)};
                }
                continue;
            }

            if(dy>0){
                add(list,ai,bi,dy-req,{
                    kind:"pair",upper:a.ball.id,lower:b.ball.id,
                    req,distance:distance(a,b)
                });
            }else{
                add(list,bi,ai,-dy-req,{
                    kind:"pair",upper:b.ball.id,lower:a.ball.id,
                    req,distance:distance(a,b)
                });
            }
        }
        return{list,fixed,sameHeightIllegal};
    }

    function project(values,lower,upper,q){
        const violation=values[q.a]-values[q.b]-q.c;
        if(violation<=SOLVE_TOL)return 0;

        const canA=Math.max(0,values[q.a]-lower[q.a]);
        const canB=Math.max(0,upper[q.b]-values[q.b]);
        if(canA+canB<violation-SOLVE_TOL)return Infinity;

        // Prefer holding the upper body.  The lower body can only give back a
        // hold already accumulated during this same solve; it is never pushed
        // below its free trajectory.
        const takeA=Math.max(0,Math.min(canA,violation));
        const takeB=violation-takeA;
        if(takeB>canB+SOLVE_TOL)return Infinity;

        values[q.a]-=takeA;
        values[q.b]+=takeB;
        return violation;
    }

    function solve(vars,built){
        const lower=vars.map(v=>v.lower).concat([0]);
        const upper=vars.map(v=>v.upper).concat([0]);
        const values=new Array(vars.length+1).fill(0);
        let failed=null,passes=0;

        for(;passes<MAX_PASSES;passes++){
            let maxViolation=0;
            for(const q of built.list){
                const r=project(values,lower,upper,q);
                if(r===Infinity){
                    failed={...q,violation:values[q.a]-values[q.b]-q.c};
                    break;
                }
                maxViolation=Math.max(maxViolation,r);
            }
            values[built.fixed]=0;
            if(failed||maxViolation<=SOLVE_TOL)break;
        }

        if(!failed){
            for(const q of built.list){
                const v=values[q.a]-values[q.b]-q.c;
                if(v>1e-6){failed={...q,violation:v};break;}
            }
        }
        return{ok:!failed,values:values.slice(0,vars.length),passes:passes+1,failed};
    }

    function snapshot(live){
        return new Map(live.map(q=>[q.ball.id,{y:q.v.y,vy:q.v.vy}]));
    }

    function restore(live,saved){
        for(const q of live){
            const p=saved.get(q.ball.id);
            if(p){q.v.y=p.y;q.v.vy=p.vy;}
        }
    }

    // Convert the current geometric hold back into lost path time so the next
    // update resumes from the corrected physical state instead of from wall time.
    function registerPersistentDelay(g,v,dy){
        if(!(dy<-EPS))return 0;
        const q=v.q;
        const wallClock=Number(g.pileFlowClock)||0;
        const record=delayRecord(g,q.ball.id,true);
        if(Math.abs(record.lastAddedClock-wallClock)<=EPS)return 0;

        const effectiveNow=Math.max(0,wallClock-record.delay);
        const targetY=q.v.y+dy;
        const loT=Math.max(0,effectiveNow-FRAME);
        const hiT=effectiveNow;
        const pLo=predicted(g,q,loT);
        const pHi=predicted(g,q,hiT);
        let extra=0;

        if(
            pLo&&pHi&&
            Number.isFinite(pLo[1])&&Number.isFinite(pHi[1])&&
            pHi[1]>=pLo[1]-EPS
        ){
            if(targetY<=pLo[1]+EPS){
                extra=effectiveNow-loT;
            }else if(targetY<pHi[1]-EPS){
                let lo=loT,hi=hiT;
                for(let i=0;i<28;i++){
                    const mid=(lo+hi)*.5;
                    const p=predicted(g,q,mid);
                    if(!p||!Number.isFinite(p[1]))break;
                    if(p[1]<targetY)lo=mid;
                    else hi=mid;
                }
                extra=Math.max(0,effectiveNow-hi);
            }
        }

        if(extra<=EPS){
            const vy=Math.max(1e-6,Number(q.v.vy)||0);
            extra=Math.min(FRAME,Math.max(0,(-dy)/vy));
        }

        // Never invent more than one physics frame of lost time in one solve.
        extra=Math.min(FRAME,Math.max(0,extra));
        record.delay+=extra;
        record.lastAddedClock=wallClock;
        record.lastHoldRows=-dy;
        record.lastTargetY=targetY;
        return extra;
    }

    function apply(g,vars,values){
        let changed=0,totalHold=0,maxHold=0,totalDelayAdded=0;
        const held=[];
        for(let i=0;i<vars.length;i++){
            const dy=values[i];
            if(dy>=-EPS)continue;
            const q=vars[i].q;
            const speedBefore=Math.max(0,Number(q.v.vy)||0);
            const addedDelay=registerPersistentDelay(g,vars[i],dy);
            q.v.y+=dy;
            if(Number.isFinite(q.v.vy)){
                q.v.vy=Math.max(0,q.v.vy+dy/Math.max(EPS,FRAME));
            }
            changed++;
            totalHold+=-dy;
            maxHold=Math.max(maxHold,-dy);
            totalDelayAdded+=addedDelay;
            held.push({
                id:q.ball.id,dy,addedDelay,
                delay:currentDelay(g,q.ball),
                speedBefore,prevY:vars[i].prevY,newY:q.v.y
            });
        }
        return{changed,totalHold,maxHold,totalDelayAdded,held};
    }

    function delaySummary(g,live){
        return live
            .map(q=>({id:q.ball.id,delay:currentDelay(g,q.ball)}))
            .filter(q=>q.delay>EPS);
    }

    resolveVisualContacts=function(g){
        const result=baseResolve(g);
        if(!garbagePhase(g))return result;

        const baseState=window.__sixBallLastGarbageConstraintSolve||null;
        let all=entries(g);
        let live=liveEntries(g,all);
        const before=minIncoming(all,live);

        if(!live.length||baseState?.ok!==false){
            window.__sixBallLastGarbageRigidRowContactV1={
                active:false,reason:"base_solver_ok",
                before:before.min,beforePair:before.pair,
                delays:delaySummary(g,live),at:Date.now()
            };
            return result;
        }

        const saved=snapshot(live);
        const builtVars=variables(g,live);
        const built=constraints(all,live,builtVars.vars,builtVars.byId);

        if(built.sameHeightIllegal){
            window.__sixBallLastGarbageRigidRowContactV1={
                active:true,ok:false,reason:"same_height_horizontal_required",
                before:before.min,beforePair:before.pair,
                sameHeightIllegal:built.sameHeightIllegal,
                delays:delaySummary(g,live),at:Date.now()
            };
            return result;
        }

        const solved=solve(builtVars.vars,built);
        if(!solved.ok){
            window.__sixBallLastGarbageRigidRowContactV1={
                active:true,ok:false,reason:"persistent_vertical_hold_infeasible",
                before:before.min,beforePair:before.pair,
                passes:solved.passes,failed:solved.failed?.meta||null,
                delays:delaySummary(g,live),at:Date.now()
            };
            return result;
        }

        const movement=apply(g,builtVars.vars,solved.values);
        all=entries(g);
        live=liveEntries(g,all);
        const after=minIncoming(all,live);

        if(Number.isFinite(after.min)&&after.min<LEGAL_DIST-SOLVE_TOL){
            restore(live,saved);
            // The current-frame geometry was not accepted, so its newly
            // registered delay must not survive.  Rebuild each affected record
            // by subtracting exactly what this failed attempt added.
            for(const h of movement.held){
                const r=delayRecord(g,h.id,false);
                if(r){r.delay=Math.max(0,r.delay-h.addedDelay);r.lastAddedClock=-Infinity;}
            }
            window.__sixBallLastGarbageRigidRowContactV1={
                active:true,ok:false,reason:"post_persistent_hold_overlap",
                before:before.min,beforePair:before.pair,
                after:after.min,afterPair:after.pair,movement,
                delays:delaySummary(g,live),at:Date.now()
            };
            return result;
        }

        window.__sixBallLastGarbageRigidRowContactV1={
            active:true,ok:true,mode:"persistent_physical_contact_hold",
            before:before.min,beforePair:before.pair,
            after:after.min,afterPair:after.pair,
            movement,passes:solved.passes,
            delays:delaySummary(g,live),at:Date.now()
        };
        if(movement.changed){
            window.__sixBallGarbageRigidRowContactCorrections=
                (window.__sixBallGarbageRigidRowContactCorrections||0)+movement.changed;
        }
        return result;
    };

    window.__sixBallGarbagePersistentContactDelay=true;
    window.__sixBallGarbageRigidRowContactVersion="garbage-persistent-contact-hold-v4";
})();
