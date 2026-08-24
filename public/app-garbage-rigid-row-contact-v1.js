/* ============================================================
 * 6ball GARBAGE CONTACT FINALIZER v5
 *
 * Root rule:
 * - A shaped garbage member that is still travelling on a vertical entry
 *   segment above the board has not physically split yet.  Its X coordinate is
 *   therefore the authored segment X, not a FOLLOW_SUPPORT-derived transient X.
 * - Once real contact has taken the member into board space, ordinary garbage
 *   contact / split physics remains authoritative.
 * - If the horizontal contact solver still has no feasible answer, real contact
 *   may consume path time (vertical hold).  That lost time persists per ball so
 *   the next frame does not teleport the ball back onto its free-fall clock.
 *
 * This layer never changes logical cells, fallPath endpoints/timestamps, pivots,
 * support metadata, the frozen pile, or ordinary-piece physics.
 * ============================================================ */
(function installGarbageContactFinalizerV5(){
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
    const MAX_REWIND=FRAME*4;
    const LEGAL_DIST=.9995;
    const CONTACT_DIST=.9998;
    const EPS=1e-9;
    const SOLVE_TOL=1e-8;
    const SAME_Y_EPS=1e-8;
    const MAX_PASSES=512;

    const delayStateByGame=new WeakMap();

    function garbagePhase(g){
        return !!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"&&Array.isArray(g.board)&&g.vis);
    }
    function frozenIds(board){
        const out=new Set(),cached=board?.__hexGarbageFrozenIds;
        if(cached instanceof Set)for(const id of cached)out.add(id);
        return out;
    }
    function livePath(ball){return Array.isArray(ball?.fallPath)&&ball.fallPath.length>0;}
    function gameDelayMap(g,create=true){
        let map=delayStateByGame.get(g);
        if(!map&&create){map=new Map();delayStateByGame.set(g,map);}
        return map||null;
    }
    function delayRecord(g,id,create=true){
        const map=gameDelayMap(g,create);if(!map)return null;
        let r=map.get(id);
        if(!r&&create){r={delay:0,lastAddedClock:-Infinity};map.set(id,r);}
        return r||null;
    }
    function currentDelay(g,ball){return Math.max(0,Number(delayRecord(g,ball?.id,false)?.delay)||0);}
    function clearDelay(g,id){gameDelayMap(g,false)?.delete(id);}
    function effectiveClockForBall(g,ball){
        return Math.max(0,(Number(g?.pileFlowClock)||0)-currentDelay(g,ball));
    }
    function activeSegment(ball,t){
        const path=Array.isArray(ball?.fallPath)?ball.fallPath:[];
        for(const seg of path){
            if(!seg?.from||!seg?.to)continue;
            const s=Number(seg.pileFlowStart),e=Number(seg.pileFlowEnd);
            if(!Number.isFinite(s)||!Number.isFinite(e))continue;
            if(t+EPS>=s&&t<=e+EPS)return seg;
        }
        return null;
    }
    function isAirborneVerticalEntry(seg){
        if(!seg?.from||!seg?.to||seg.pivot||seg.topPivot)return false;
        if(Math.abs(Number(seg.to[0])-Number(seg.from[0]))>EPS)return false;
        return Number(seg.from[1])<0;
    }
    function restoreAuthoredAirborneX(g,ball,v){
        if(!garbagePhase(g)||!ball?.isGarbage||!v||!livePath(ball))return false;
        if(ball.garbagePhaseFrozen||frozenIds(g.board).has(ball.id))return false;
        const seg=activeSegment(ball,effectiveClockForBall(g,ball));
        if(!isAirborneVerticalEntry(seg))return false;
        const x=Number(seg.from[0]);
        if(!Number.isFinite(x)||Math.abs((Number(v.x)||0)-x)<=EPS)return false;
        v.x=x;
        return true;
    }

    /*
     * FOLLOW_SUPPORT can legitimately move a member after impact.  Before impact,
     * however, a vertical authored entry is still the intact attack shape.  Apply
     * this immediately after the canonical visual update so the transient frame
     * itself cannot compress an airborne row horizontally.
     */
    if(baseUpdateScheduled){
        updateScheduledPileFlowVisual=function(g,cell,v,dt){
            if(!garbagePhase(g)||!cell?.isGarbage)return baseUpdateScheduled(g,cell,v,dt);
            const frozen=frozenIds(g.board);
            if(cell.garbagePhaseFrozen||frozen.has(cell.id)||!livePath(cell)){
                clearDelay(g,cell.id);
                return baseUpdateScheduled(g,cell,v,dt);
            }

            const delay=currentDelay(g,cell);
            const wallClock=Number(g.pileFlowClock)||0;
            let result;
            if(delay>EPS){
                g.pileFlowClock=Math.max(0,wallClock-delay);
                try{result=baseUpdateScheduled(g,cell,v,dt);}
                finally{g.pileFlowClock=wallClock;}
            }else result=baseUpdateScheduled(g,cell,v,dt);

            if(!livePath(cell))clearDelay(g,cell.id);
            else restoreAuthoredAirborneX(g,cell,v);
            return result;
        };
    }

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
        const vars=[],byId=new Map();
        for(const q of live){
            const effectiveNow=effectiveClockForBall(g,q.ball);
            const seg=activeSegment(q.ball,effectiveNow);
            const earliest=Number.isFinite(seg?.pileFlowStart)
                ?Math.max(Number(seg.pileFlowStart),effectiveNow-MAX_REWIND)
                :Math.max(0,effectiveNow-MAX_REWIND);
            const p=predicted(g,q,earliest);
            let lower=0;
            if(p&&Number.isFinite(p[1]))lower=Math.min(0,p[1]-q.v.y);
            else lower=-Math.max(0,Number(q.v.vy)||0)*MAX_REWIND;
            const index=vars.length;
            vars.push({q,lower,upper:0,earliest,effectiveNow});
            byId.set(q.ball.id,index);
        }
        return{vars,byId};
    }
    function add(list,a,b,c,meta){if(Number.isFinite(c))list.push({a,b,c,meta});}
    function constraints(all,live,vars,byId){
        const fixed=vars.length,list=[],liveIds=new Set(live.map(q=>q.ball.id));
        let sameHeightIllegal=null;
        for(let i=0;i<vars.length;i++){
            add(list,i,fixed,0,{kind:"no_downward",id:vars[i].q.ball.id});
            add(list,fixed,i,-vars[i].lower,{kind:"rewind_limit",id:vars[i].q.ball.id});
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
                if(distance(a,b)<LEGAL_DIST-SOLVE_TOL)sameHeightIllegal={ids:[a.ball.id,b.ball.id],distance:distance(a,b)};
                continue;
            }
            if(dy>0)add(list,ai,bi,dy-req,{kind:"pair",upper:a.ball.id,lower:b.ball.id,req,distance:distance(a,b)});
            else add(list,bi,ai,-dy-req,{kind:"pair",upper:b.ball.id,lower:a.ball.id,req,distance:distance(a,b)});
        }
        return{list,fixed,sameHeightIllegal};
    }
    function project(values,lower,upper,q){
        const violation=values[q.a]-values[q.b]-q.c;
        if(violation<=SOLVE_TOL)return 0;
        const canA=Math.max(0,values[q.a]-lower[q.a]);
        const canB=Math.max(0,upper[q.b]-values[q.b]);
        if(canA+canB<violation-SOLVE_TOL)return Infinity;
        const takeA=Math.max(0,Math.min(canA,violation));
        const takeB=violation-takeA;
        if(takeB>canB+SOLVE_TOL)return Infinity;
        values[q.a]-=takeA;values[q.b]+=takeB;return violation;
    }
    function solve(vars,built){
        const lower=vars.map(v=>v.lower).concat([0]);
        const upper=vars.map(v=>v.upper).concat([0]);
        const values=new Array(vars.length+1).fill(0);let failed=null,passes=0;
        for(;passes<MAX_PASSES;passes++){
            let max=0;
            for(const q of built.list){
                const r=project(values,lower,upper,q);
                if(r===Infinity){failed={...q,violation:values[q.a]-values[q.b]-q.c};break;}
                max=Math.max(max,r);
            }
            values[built.fixed]=0;
            if(failed||max<=SOLVE_TOL)break;
        }
        if(!failed){
            for(const q of built.list){
                const v=values[q.a]-values[q.b]-q.c;
                if(v>1e-6){failed={...q,violation:v};break;}
            }
        }
        return{ok:!failed,values:values.slice(0,vars.length),passes:passes+1,failed};
    }
    function snapshot(live){return new Map(live.map(q=>[q.ball.id,{x:q.v.x,y:q.v.y,vy:q.v.vy}]));}
    function restore(live,saved){
        for(const q of live){const p=saved.get(q.ball.id);if(p){q.v.x=p.x;q.v.y=p.y;q.v.vy=p.vy;}}
    }
    function registerPersistentDelay(g,v,dy){
        if(!(dy<-EPS))return 0;
        const q=v.q,wallClock=Number(g.pileFlowClock)||0,record=delayRecord(g,q.ball.id,true);
        if(Math.abs(record.lastAddedClock-wallClock)<=EPS)return 0;
        const effectiveNow=Math.max(0,wallClock-record.delay);
        const targetY=q.v.y+dy;
        const loT=Math.max(v.earliest,0),hiT=effectiveNow;
        const pLo=predicted(g,q,loT),pHi=predicted(g,q,hiT);
        let extra=0;
        if(pLo&&pHi&&Number.isFinite(pLo[1])&&Number.isFinite(pHi[1])&&pHi[1]>=pLo[1]-EPS){
            if(targetY<=pLo[1]+EPS)extra=effectiveNow-loT;
            else if(targetY<pHi[1]-EPS){
                let lo=loT,hi=hiT;
                for(let i=0;i<30;i++){
                    const mid=(lo+hi)*.5,p=predicted(g,q,mid);
                    if(!p||!Number.isFinite(p[1]))break;
                    if(p[1]<targetY)lo=mid;else hi=mid;
                }
                extra=Math.max(0,effectiveNow-hi);
            }
        }
        if(extra<=EPS){
            const vy=Math.max(1e-6,Number(q.v.vy)||0);
            extra=Math.min(MAX_REWIND,Math.max(0,(-dy)/vy));
        }
        extra=Math.min(MAX_REWIND,Math.max(0,extra));
        record.delay+=extra;record.lastAddedClock=wallClock;
        return extra;
    }
    function apply(g,vars,values){
        let changed=0,totalDelayAdded=0;const held=[];
        for(let i=0;i<vars.length;i++){
            const dy=values[i];if(dy>=-EPS)continue;
            const q=vars[i].q,addedDelay=registerPersistentDelay(g,vars[i],dy);
            q.v.y+=dy;
            if(Number.isFinite(q.v.vy))q.v.vy=Math.max(0,q.v.vy+dy/Math.max(EPS,MAX_REWIND));
            changed++;totalDelayAdded+=addedDelay;
            held.push({id:q.ball.id,dy,addedDelay,delay:currentDelay(g,q.ball)});
        }
        return{changed,totalDelayAdded,held};
    }
    function delaySummary(g,live){
        return live.map(q=>({id:q.ball.id,delay:currentDelay(g,q.ball)})).filter(q=>q.delay>EPS);
    }

    resolveVisualContacts=function(g){
        const result=baseResolve(g);if(!garbagePhase(g))return result;
        let all=entries(g),live=liveEntries(g,all);

        let airborneRestored=0;
        for(const q of live)if(restoreAuthoredAirborneX(g,q.ball,q.v))airborneRestored++;
        if(airborneRestored){all=entries(g);live=liveEntries(g,all);}

        const before=minIncoming(all,live);
        if(!live.length||before.min>=LEGAL_DIST-SOLVE_TOL){
            window.__sixBallLastGarbageRigidRowContactV1={
                active:airborneRestored>0,ok:true,
                mode:airborneRestored?"airborne_authored_shape":"base_solver_ok",
                airborneRestored,before:before.min,beforePair:before.pair,
                delays:delaySummary(g,live),at:Date.now()
            };
            return result;
        }

        const saved=snapshot(live),builtVars=variables(g,live),built=constraints(all,live,builtVars.vars,builtVars.byId);
        if(built.sameHeightIllegal){
            window.__sixBallLastGarbageRigidRowContactV1={
                active:true,ok:false,reason:"same_height_horizontal_required",
                airborneRestored,before:before.min,beforePair:before.pair,
                sameHeightIllegal:built.sameHeightIllegal,delays:delaySummary(g,live),at:Date.now()
            };
            return result;
        }
        const solved=solve(builtVars.vars,built);
        if(!solved.ok){
            window.__sixBallLastGarbageRigidRowContactV1={
                active:true,ok:false,reason:"persistent_vertical_hold_infeasible",
                airborneRestored,before:before.min,beforePair:before.pair,
                passes:solved.passes,failed:solved.failed?.meta||null,
                delays:delaySummary(g,live),at:Date.now()
            };
            return result;
        }
        const movement=apply(g,builtVars.vars,solved.values);
        all=entries(g);live=liveEntries(g,all);const after=minIncoming(all,live);
        if(Number.isFinite(after.min)&&after.min<LEGAL_DIST-SOLVE_TOL){
            restore(live,saved);
            for(const h of movement.held){
                const r=delayRecord(g,h.id,false);
                if(r){r.delay=Math.max(0,r.delay-h.addedDelay);r.lastAddedClock=-Infinity;}
            }
            window.__sixBallLastGarbageRigidRowContactV1={
                active:true,ok:false,reason:"post_persistent_hold_overlap",
                airborneRestored,before:before.min,beforePair:before.pair,
                after:after.min,afterPair:after.pair,movement,delays:delaySummary(g,live),at:Date.now()
            };
            return result;
        }
        window.__sixBallLastGarbageRigidRowContactV1={
            active:true,ok:true,mode:"persistent_contact_hold",
            airborneRestored,before:before.min,beforePair:before.pair,
            after:after.min,afterPair:after.pair,movement,passes:solved.passes,
            delays:delaySummary(g,live),at:Date.now()
        };
        if(movement.changed)window.__sixBallGarbageRigidRowContactCorrections=(window.__sixBallGarbageRigidRowContactCorrections||0)+movement.changed;
        return result;
    };

    window.__sixBallGarbageAirborneAuthoredShape=true;
    window.__sixBallGarbagePersistentContactDelay=true;
    window.__sixBallGarbageRigidRowContactVersion="garbage-contact-finalizer-v5";
})();
