/* ============================================================
 * 6ball GARBAGE COUPLED ROW CONTACT v2
 *
 * The authoritative garbage solver can reach a dense STRAIGHT frame where
 * several staggered tangent rows all need a tiny coordinated correction.  A
 * one-pair or one-row fallback cannot solve that state: moving one row while
 * every other live row is treated as fixed can make the admissible interval
 * empty, even though the authored continuous trajectories form a legal tangent
 * lattice.
 *
 * This final GARBAGE-only layer activates ONLY after the authoritative contact
 * network reports failure.  It then solves one scalar horizontal translation
 * per live tangent chain, simultaneously.
 *
 * Invariants:
 * - Y never changes here.
 * - logical board cells never change here.
 * - fallPath timing, pivots and support metadata never change here.
 * - existing/frozen pile balls are fixed.
 * - tangent same-height chains keep their internal spacing exactly.
 * - chain preferences come from the authored pileFlowPositionAt() X at the
 *   current clock, but preferences are never allowed to violate contact.
 * - current/predicted left-right order is preserved, making every contact a
 *   convex difference constraint.
 * ============================================================ */
(function installGarbageCoupledRowContactV2(){
    if(typeof window==="undefined"||window.__sixBallGarbageRigidRowContactV1)return;
    if(typeof resolveVisualContacts!=="function")return;

    window.__sixBallGarbageRigidRowContactV1=true;

    const baseResolveVisualContactsCoupledV2=resolveVisualContacts;
    const H=typeof HEX_ROW_H==="number"?HEX_ROW_H:Math.sqrt(3)/2;
    const MIN_DIST=1.0;
    const LEGAL_DIST=0.9995;
    const SAME_Y_EPS=1e-8;
    const ROW_LINK_MIN=1.999;
    const ROW_LINK_MAX=2.05;
    const EPS=1e-9;
    const SOLVE_TOL=1e-8;
    const MAX_PASSES=512;

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

    function physicalDistance(a,b,ax=a.v.x,bx=b.v.x){
        return Math.hypot((ax-bx)*0.5,(a.v.y-b.v.y)*H);
    }

    function requiredX(a,b){
        const dy=(a.v.y-b.v.y)*H;
        if(Math.abs(dy)>=MIN_DIST-EPS)return 0;
        return 2*Math.sqrt(Math.max(0,MIN_DIST*MIN_DIST-dy*dy));
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

    function predictedX(g,q){
        if(typeof pileFlowPositionAt!=="function")return null;
        try{
            const p=pileFlowPositionAt(g,q.ball,Math.max(0,Number(g.pileFlowClock)||0));
            if(Array.isArray(p)&&Number.isFinite(p[0]))return p[0];
        }catch(_){ }
        return null;
    }

    function median(values){
        const a=values.filter(Number.isFinite).sort((x,y)=>x-y);
        if(!a.length)return 0;
        const m=Math.floor(a.length/2);
        return a.length%2?a[m]:(a[m-1]+a[m])*.5;
    }

    // Return every live ball exactly once.  Same-height neighbours are grouped
    // only when they are already tangent (or microscopically corrected around
    // tangency).  Real gaps and same-row penetrations remain separate variables.
    function tangentChains(live){
        const sorted=live.slice().sort((a,b)=>a.v.y-b.v.y||a.v.x-b.v.x||a.ball.id-b.ball.id);
        const groups=[];
        let level=[];
        let anchor=null;

        function flush(){
            if(!level.length)return;
            level.sort((a,b)=>a.v.x-b.v.x||a.ball.id-b.ball.id);
            let chain=[level[0]];
            for(let i=1;i<level.length;i++){
                const prev=level[i-1],current=level[i];
                const gap=current.v.x-prev.v.x;
                if(gap>=ROW_LINK_MIN-EPS&&gap<=ROW_LINK_MAX+EPS)chain.push(current);
                else{groups.push(chain);chain=[current];}
            }
            groups.push(chain);
            level=[];
        }

        for(const q of sorted){
            if(anchor===null||Math.abs(q.v.y-anchor)<=SAME_Y_EPS){
                level.push(q);
                if(anchor===null)anchor=q.v.y;
            }else{
                flush();
                level=[q];anchor=q.v.y;
            }
        }
        flush();
        return groups;
    }

    function buildVariables(g,live){
        const groups=tangentChains(live);
        const vars=[];
        const byId=new Map();

        for(const members of groups){
            let lower=-Infinity,upper=Infinity;
            const prefSamples=[];
            for(const q of members){
                lower=Math.max(lower,-q.v.x);
                upper=Math.min(upper,(W2-1)-q.v.x);
                const px=predictedX(g,q);
                if(Number.isFinite(px))prefSamples.push(px-q.v.x);
            }
            const pref=Math.max(lower,Math.min(upper,median(prefSamples)));
            const variable={members,lower,upper,pref,d:pref};
            const index=vars.length;
            vars.push(variable);
            for(const q of members)byId.set(q.ball.id,index);
        }
        return{vars,byId};
    }

    function referenceX(g,q){
        const px=predictedX(g,q);
        return Number.isFinite(px)?px:q.v.x;
    }

    function pushConstraint(list,a,b,c,meta){
        if(!Number.isFinite(c))return;
        list.push({a,b,c,meta});
    }

    // Difference constraints use the form d[a] - d[b] <= c.  A final fixed
    // variable with d==0 represents the walls and every non-live support.
    function buildConstraints(g,all,live,vars,byId){
        const fixed=vars.length;
        const constraints=[];

        for(let i=0;i<vars.length;i++){
            pushConstraint(constraints,i,fixed,vars[i].upper,{kind:"wall_right",i});
            pushConstraint(constraints,fixed,i,-vars[i].lower,{kind:"wall_left",i});
        }

        const liveIds=new Set(live.map(q=>q.ball.id));
        let sameVariableIllegal=null;

        for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
            const a=all[i],b=all[j];
            if(!liveIds.has(a.ball.id)&&!liveIds.has(b.ball.id))continue;
            const req=requiredX(a,b);
            if(req<=EPS)continue;

            const ai=byId.has(a.ball.id)?byId.get(a.ball.id):fixed;
            const bi=byId.has(b.ball.id)?byId.get(b.ball.id):fixed;
            if(ai===fixed&&bi===fixed)continue;

            if(ai===bi){
                if(physicalDistance(a,b)<LEGAL_DIST-SOLVE_TOL){
                    sameVariableIllegal={ids:[a.ball.id,b.ball.id],distance:physicalDistance(a,b)};
                }
                continue;
            }

            const ar=ai===fixed?a.v.x:referenceX(g,a);
            const br=bi===fixed?b.v.x:referenceX(g,b);
            let leftA;
            if(Math.abs(ar-br)>1e-7)leftA=ar<br;
            else if(Math.abs(a.v.x-b.v.x)>1e-7)leftA=a.v.x<b.v.x;
            else leftA=(a.x!==b.x)?a.x<b.x:a.ball.id<b.ball.id;

            if(leftA){
                // (a.x + da) + req <= (b.x + db)
                // da - db <= (b.x - a.x) - req
                pushConstraint(constraints,ai,bi,(b.v.x-a.v.x)-req,{kind:"pair",ids:[a.ball.id,b.ball.id],side:"a_left",req});
            }else{
                pushConstraint(constraints,bi,ai,(a.v.x-b.v.x)-req,{kind:"pair",ids:[a.ball.id,b.ball.id],side:"b_left",req});
            }
        }

        return{constraints,fixed,sameVariableIllegal};
    }

    function projectConstraint(values,lower,upper,q){
        const lhs=values[q.a]-values[q.b];
        const violation=lhs-q.c;
        if(violation<=SOLVE_TOL)return 0;

        const downA=Math.max(0,values[q.a]-lower[q.a]);
        const upB=Math.max(0,upper[q.b]-values[q.b]);
        if(downA+upB<violation-SOLVE_TOL)return Infinity;

        const lo=Math.max(0,violation-upB);
        const hi=Math.min(violation,downA);
        if(lo>hi+SOLVE_TOL)return Infinity;

        // Minimise squared displacement from each variable's preferred target
        // for this projection step.
        const pA=values[q.a]-projectConstraint.pref[q.a];
        const pB=values[q.b]-projectConstraint.pref[q.b];
        let takeA=(pA+pB+violation)*.5;
        takeA=Math.max(lo,Math.min(hi,takeA));
        const takeB=violation-takeA;
        values[q.a]-=takeA;
        values[q.b]+=takeB;
        return violation;
    }

    function solveDifferenceSystem(vars,built){
        const n=vars.length+1;
        const fixed=built.fixed;
        const lower=vars.map(v=>v.lower).concat([0]);
        const upper=vars.map(v=>v.upper).concat([0]);
        const pref=vars.map(v=>v.pref).concat([0]);
        const values=pref.slice();
        projectConstraint.pref=pref;

        let passes=0;
        let infeasible=false;
        let maxViolation=Infinity;

        for(;passes<MAX_PASSES;passes++){
            maxViolation=0;
            for(const q of built.constraints){
                const r=projectConstraint(values,lower,upper,q);
                if(r===Infinity){infeasible=true;break;}
                maxViolation=Math.max(maxViolation,r);
            }
            values[fixed]=0;
            if(infeasible||maxViolation<=SOLVE_TOL)break;
        }

        let finalMax=0,failedConstraint=null;
        if(!infeasible){
            for(const q of built.constraints){
                const v=values[q.a]-values[q.b]-q.c;
                if(v>finalMax){finalMax=v;failedConstraint=q;}
            }
            if(finalMax>1e-6)infeasible=true;
        }

        return{ok:!infeasible,values:values.slice(0,vars.length),passes:passes+1,maxViolation:finalMax,failedConstraint};
    }

    function snapshotXs(live){return new Map(live.map(q=>[q.ball.id,q.v.x]));}
    function restoreXs(live,snapshot){for(const q of live){const x=snapshot.get(q.ball.id);if(Number.isFinite(x))q.v.x=x;}}

    function applySolution(vars,values){
        let changed=0,totalShift=0,maxShift=0;
        for(let i=0;i<vars.length;i++){
            const dx=values[i];
            if(Math.abs(dx)<=EPS)continue;
            for(const q of vars[i].members)q.v.x+=dx;
            changed+=vars[i].members.length;
            totalShift+=Math.abs(dx)*vars[i].members.length;
            maxShift=Math.max(maxShift,Math.abs(dx));
        }
        return{changed,totalShift,maxShift};
    }

    function variableSummary(vars,values){
        return vars.map((v,i)=>({
            ids:v.members.map(q=>q.ball.id),
            y:v.members[0]?.v?.y,
            pref:v.pref,
            solved:values?.[i],
            lower:v.lower,upper:v.upper
        }));
    }

    resolveVisualContacts=function(g){
        const result=baseResolveVisualContactsCoupledV2(g);
        if(!garbagePhase(g))return result;

        const baseState=window.__sixBallLastGarbageConstraintSolve||null;
        let all=entries(g);
        let live=liveEntries(g,all);
        const before=minIncomingDistance(all,live);

        // A late coupled correction is deliberately exceptional.  If the main
        // network converged, keep its answer untouched.
        if(!live.length||baseState?.ok!==false){
            window.__sixBallLastGarbageRigidRowContactV1={
                active:false,reason:"base_solver_ok",before:before.min,beforePair:before.pair,at:Date.now()
            };
            return result;
        }

        const snapshot=snapshotXs(live);
        const builtVars=buildVariables(g,live);
        const built=buildConstraints(g,all,live,builtVars.vars,builtVars.byId);

        if(built.sameVariableIllegal){
            window.__sixBallLastGarbageRigidRowContactV1={
                active:true,ok:false,reason:"illegal_inside_rigid_chain",
                before:before.min,beforePair:before.pair,
                sameVariableIllegal:built.sameVariableIllegal,
                variables:variableSummary(builtVars.vars),at:Date.now()
            };
            return result;
        }

        const solved=solveDifferenceSystem(builtVars.vars,built);
        if(!solved.ok){
            window.__sixBallLastGarbageRigidRowContactV1={
                active:true,ok:false,reason:"coupled_constraints_infeasible",
                before:before.min,beforePair:before.pair,
                passes:solved.passes,maxViolation:solved.maxViolation,
                failedConstraint:solved.failedConstraint?.meta||null,
                variables:variableSummary(builtVars.vars,solved.values),at:Date.now()
            };
            return result;
        }

        const movement=applySolution(builtVars.vars,solved.values);
        all=entries(g);live=liveEntries(g,all);
        const after=minIncomingDistance(all,live);

        if(Number.isFinite(after.min)&&after.min<LEGAL_DIST-SOLVE_TOL){
            restoreXs(live,snapshot);
            window.__sixBallLastGarbageRigidRowContactV1={
                active:true,ok:false,reason:"post_verify_overlap",
                before:before.min,beforePair:before.pair,after:after.min,afterPair:after.pair,
                movement,passes:solved.passes,
                variables:variableSummary(builtVars.vars,solved.values),at:Date.now()
            };
            return result;
        }

        window.__sixBallLastGarbageRigidRowContactV1={
            active:true,ok:true,mode:"coupled_difference_projection",
            before:before.min,beforePair:before.pair,
            after:after.min,afterPair:after.pair,
            movement,passes:solved.passes,maxViolation:solved.maxViolation,
            variables:variableSummary(builtVars.vars,solved.values),at:Date.now()
        };
        if(movement.changed){
            window.__sixBallGarbageRigidRowContactCorrections=
                (window.__sixBallGarbageRigidRowContactCorrections||0)+movement.changed;
        }
        return result;
    };

    window.__sixBallGarbageRigidRowContactVersion="garbage-coupled-row-contact-v2";
})();
