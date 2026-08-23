/* ============================================================
 * 6ball GARBAGE PHYSICAL CONTACT HOLD v3
 *
 * The main garbage contact network intentionally keeps each live ball on its
 * authored Y trajectory and repairs contact horizontally.  In a dense staggered
 * STRAIGHT landing that can become geometrically impossible: a moving upper ball
 * may already be tangent to a settled neighbour on one side and to a wall row on
 * the other, leaving no horizontal solution at the current Y.
 *
 * Real ball physics does not force the centre through that contact.  Downward
 * progress pauses.  This late GARBAGE-only layer therefore activates only when
 * the authoritative horizontal network reports failure and gives live balls the
 * minimum upward-in-time contact hold needed to restore non-penetration.
 *
 * Invariants:
 * - X is never changed here.
 * - logical board cells are never changed here.
 * - existing/frozen/finished garbage is fixed.
 * - a live ball may move only upward relative to this frame's free trajectory,
 *   and never above its authored position one physics frame earlier.
 * - same-height contacts remain the horizontal solver's responsibility.
 * - exact tangency is legal.
 * ============================================================ */
(function installGarbagePhysicalContactHoldV3(){
    if(typeof window==="undefined"||window.__sixBallGarbageRigidRowContactV1)return;
    if(typeof resolveVisualContacts!=="function")return;

    window.__sixBallGarbageRigidRowContactV1=true;

    const baseResolveVisualContactsContactHoldV3=resolveVisualContacts;
    const H=typeof HEX_ROW_H==="number"?HEX_ROW_H:Math.sqrt(3)/2;
    const FRAME=typeof PHYSICS_FRAME==="number"?PHYSICS_FRAME:1/120;
    const MIN_DIST=1.0;
    const LEGAL_DIST=0.9995;
    const SAME_Y_EPS=1e-8;
    const EPS=1e-9;
    const SOLVE_TOL=1e-8;
    const MAX_PASSES=256;

    function garbagePhase(g){
        return !!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"&&Array.isArray(g.board)&&g.vis);
    }

    function frozenIds(board){
        const out=new Set();
        const cached=board?.__hexGarbageFrozenIds;
        if(cached instanceof Set)for(const id of cached)out.add(id);
        return out;
    }

    function hasLivePath(ball){return Array.isArray(ball?.fallPath)&&ball.fallPath.length>0;}

    function entries(g){
        const out=[];
        const seen=new Set();
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball||seen.has(ball))continue;
            seen.add(ball);
            const v=g.vis.get(ball.id);
            if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
            out.push({ball,v,x,y});
        }
        return out;
    }

    function liveEntries(g,all){
        const frozen=frozenIds(g.board);
        return all.filter(q=>q.ball.isGarbage&&!q.ball.garbagePhaseFrozen&&!frozen.has(q.ball.id)&&hasLivePath(q.ball));
    }

    function physicalDistance(a,b){
        return Math.hypot((a.v.x-b.v.x)*.5,(a.v.y-b.v.y)*H);
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

    function predictedPoint(g,q,t){
        if(typeof pileFlowPositionAt!=="function")return null;
        try{
            const p=pileFlowPositionAt(g,q.ball,Math.max(0,t));
            if(Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1]))return p;
        }catch(_){ }
        return null;
    }

    function requiredYRows(a,b){
        const dx=Math.abs((a.v.x-b.v.x)*.5);
        if(dx>=MIN_DIST-EPS)return 0;
        return Math.sqrt(Math.max(0,MIN_DIST*MIN_DIST-dx*dx))/H;
    }

    function buildVariables(g,live){
        const clock=Math.max(0,Number(g.pileFlowClock)||0);
        const prevTime=Math.max(0,clock-FRAME);
        const vars=[];
        const byId=new Map();

        for(const q of live){
            const prev=predictedPoint(g,q,prevTime);
            // The correction is a contact hold, never an upward bounce.  One
            // frame of authored travel is the maximum amount that may be undone.
            const lower=prev&&Number.isFinite(prev[1])?Math.min(0,prev[1]-q.v.y):0;
            const index=vars.length;
            vars.push({q,lower,upper:0,pref:0,d:0,prevY:prev?.[1]});
            byId.set(q.ball.id,index);
        }
        return{vars,byId};
    }

    function pushConstraint(list,a,b,c,meta){
        if(Number.isFinite(c))list.push({a,b,c,meta});
    }

    // Constraints use d[a] - d[b] <= c.  The final variable is fixed at zero.
    // Because d<=0, satisfying an upper-vs-lower contact naturally rewinds only
    // the upper body's downward progress.
    function buildConstraints(all,live,vars,byId){
        const fixed=vars.length;
        const constraints=[];
        const liveIds=new Set(live.map(q=>q.ball.id));
        let sameHeightIllegal=null;

        for(let i=0;i<vars.length;i++){
            pushConstraint(constraints,i,fixed,0,{kind:"no_downward_push",id:vars[i].q.ball.id});
            pushConstraint(constraints,fixed,i,-vars[i].lower,{kind:"one_frame_rewind",id:vars[i].q.ball.id});
        }

        for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
            const a=all[i],b=all[j];
            if(!liveIds.has(a.ball.id)&&!liveIds.has(b.ball.id))continue;

            const req=requiredYRows(a,b);
            if(req<=EPS)continue;

            const ai=byId.has(a.ball.id)?byId.get(a.ball.id):fixed;
            const bi=byId.has(b.ball.id)?byId.get(b.ball.id):fixed;
            if(ai===fixed&&bi===fixed)continue;

            const dy=b.v.y-a.v.y;
            if(Math.abs(dy)<=SAME_Y_EPS){
                if(physicalDistance(a,b)<LEGAL_DIST-SOLVE_TOL){
                    sameHeightIllegal={ids:[a.ball.id,b.ball.id],distance:physicalDistance(a,b)};
                }
                continue;
            }

            if(dy>0){
                // a is above b:
                // (a.y + da) + req <= (b.y + db)
                // da - db <= (b.y - a.y) - req
                pushConstraint(constraints,ai,bi,dy-req,{kind:"vertical_pair",ids:[a.ball.id,b.ball.id],upper:a.ball.id,lower:b.ball.id,req});
            }else{
                pushConstraint(constraints,bi,ai,(-dy)-req,{kind:"vertical_pair",ids:[a.ball.id,b.ball.id],upper:b.ball.id,lower:a.ball.id,req});
            }
        }

        return{constraints,fixed,sameHeightIllegal};
    }

    function project(values,lower,upper,pref,q){
        const violation=(values[q.a]-values[q.b])-q.c;
        if(violation<=SOLVE_TOL)return 0;

        const downA=Math.max(0,values[q.a]-lower[q.a]);
        const upB=Math.max(0,upper[q.b]-values[q.b]);
        if(downA+upB<violation-SOLVE_TOL)return Infinity;

        const lo=Math.max(0,violation-upB);
        const hi=Math.min(violation,downA);
        if(lo>hi+SOLVE_TOL)return Infinity;

        const pA=values[q.a]-pref[q.a];
        const pB=values[q.b]-pref[q.b];
        let takeA=(pA+pB+violation)*.5;
        takeA=Math.max(lo,Math.min(hi,takeA));
        const takeB=violation-takeA;
        values[q.a]-=takeA;
        values[q.b]+=takeB;
        return violation;
    }

    function solve(vars,built){
        const fixed=built.fixed;
        const lower=vars.map(v=>v.lower).concat([0]);
        const upper=vars.map(v=>v.upper).concat([0]);
        const pref=vars.map(v=>v.pref).concat([0]);
        const values=pref.slice();
        let infeasible=false,passes=0;

        for(;passes<MAX_PASSES;passes++){
            let maxViolation=0;
            for(const q of built.constraints){
                const r=project(values,lower,upper,pref,q);
                if(r===Infinity){infeasible=true;break;}
                maxViolation=Math.max(maxViolation,r);
            }
            values[fixed]=0;
            if(infeasible||maxViolation<=SOLVE_TOL)break;
        }

        let maxViolation=0,failedConstraint=null;
        if(!infeasible){
            for(const q of built.constraints){
                const v=values[q.a]-values[q.b]-q.c;
                if(v>maxViolation){maxViolation=v;failedConstraint=q;}
            }
            if(maxViolation>1e-6)infeasible=true;
        }
        return{ok:!infeasible,values:values.slice(0,vars.length),passes:passes+1,maxViolation,failedConstraint};
    }

    function snapshotYs(live){return new Map(live.map(q=>[q.ball.id,{y:q.v.y,vy:q.v.vy}]));}
    function restoreYs(live,snapshot){
        for(const q of live){const s=snapshot.get(q.ball.id);if(s){q.v.y=s.y;q.v.vy=s.vy;}}
    }

    function apply(vars,values){
        let changed=0,totalHold=0,maxHold=0;
        const held=[];
        for(let i=0;i<vars.length;i++){
            const dy=values[i];
            if(dy>=-EPS)continue;
            const q=vars[i].q;
            q.v.y+=dy;
            // Remove the blocked part of this frame's downward velocity rather
            // than preserving an impossible penetration speed.
            if(Number.isFinite(q.v.vy))q.v.vy=Math.max(0,q.v.vy+dy/Math.max(EPS,FRAME));
            changed++;totalHold+=-dy;maxHold=Math.max(maxHold,-dy);
            held.push({id:q.ball.id,dy,prevY:vars[i].prevY,newY:q.v.y});
        }
        return{changed,totalHold,maxHold,held};
    }

    resolveVisualContacts=function(g){
        const result=baseResolveVisualContactsContactHoldV3(g);
        if(!garbagePhase(g))return result;

        const baseState=window.__sixBallLastGarbageConstraintSolve||null;
        let all=entries(g);
        let live=liveEntries(g,all);
        const before=minIncomingDistance(all,live);

        if(!live.length||baseState?.ok!==false){
            window.__sixBallLastGarbageRigidRowContactV1={active:false,reason:"base_solver_ok",before:before.min,beforePair:before.pair,at:Date.now()};
            return result;
        }

        const snapshot=snapshotYs(live);
        const builtVars=buildVariables(g,live);
        const built=buildConstraints(all,live,builtVars.vars,builtVars.byId);

        if(built.sameHeightIllegal){
            window.__sixBallLastGarbageRigidRowContactV1={
                active:true,ok:false,reason:"same_height_requires_horizontal_solution",
                before:before.min,beforePair:before.pair,sameHeightIllegal:built.sameHeightIllegal,at:Date.now()
            };
            return result;
        }

        const solved=solve(builtVars.vars,built);
        if(!solved.ok){
            window.__sixBallLastGarbageRigidRowContactV1={
                active:true,ok:false,reason:"one_frame_vertical_hold_infeasible",
                before:before.min,beforePair:before.pair,passes:solved.passes,maxViolation:solved.maxViolation,
                failedConstraint:solved.failedConstraint?.meta||null,
                bounds:builtVars.vars.map(v=>({id:v.q.ball.id,lower:v.lower,prevY:v.prevY,y:v.q.v.y})),at:Date.now()
            };
            return result;
        }

        const movement=apply(builtVars.vars,solved.values);
        all=entries(g);live=liveEntries(g,all);
        const after=minIncomingDistance(all,live);

        if(Number.isFinite(after.min)&&after.min<LEGAL_DIST-SOLVE_TOL){
            restoreYs(live,snapshot);
            window.__sixBallLastGarbageRigidRowContactV1={
                active:true,ok:false,reason:"post_hold_overlap",before:before.min,beforePair:before.pair,
                after:after.min,afterPair:after.pair,movement,passes:solved.passes,at:Date.now()
            };
            return result;
        }

        window.__sixBallLastGarbageRigidRowContactV1={
            active:true,ok:true,mode:"physical_vertical_contact_hold",
            before:before.min,beforePair:before.pair,after:after.min,afterPair:after.pair,
            movement,passes:solved.passes,maxViolation:solved.maxViolation,at:Date.now()
        };
        if(movement.changed){
            window.__sixBallGarbageRigidRowContactCorrections=(window.__sixBallGarbageRigidRowContactCorrections||0)+movement.changed;
        }
        return result;
    };

    window.__sixBallGarbageRigidRowContactVersion="garbage-physical-contact-hold-v3";
})();
