/* ============================================================
 * 6ball FINAL RIGIDITY AUTHORITY v1
 *
 * This is the last ordinary-ball group planner in the runtime.
 * Earlier layers may choose the physical split side or path, but
 * they may not violate these final invariants:
 *
 * 1. A selected three-ball rigid slope event always keeps the
 *    complete triangle, even when a lower-level independent probe
 *    temporarily reports one member as stopped.
 * 2. An explicit upward-convex 2+1 split is never rejoined: a split
 *    on the left keeps the pair on the right, and vice versa.
 * 3. A member with no proposal in the chosen physical event has
 *    reached its position for that event and is detached before
 *    the other members move.
 * 4. A declared moving pair is always normalized to one two-ball
 *    constraint; solo movers always have zero rigidity.
 * 5. If no coordinated plan exists, different independent
 *    directions are released instead of leaving a frozen group.
 *
 * Garbage has its own zero-rigidity pipeline and is never changed
 * here. Preview calls are strictly read-only.
 * ============================================================ */
(function(){
    if(
        typeof window==="undefined" ||
        window.__sixBallFinalRigidityAuthorityV1 ||
        typeof hexPhysPlanGroup!=="function" ||
        typeof hexPhysIndependentMemberMotion!=="function"
    )return;

    window.__sixBallFinalRigidityAuthorityV1=true;

    const basePlanGroup=hexPhysPlanGroup;

    function ordinaryGroup(members){
        return !!(
            Array.isArray(members) &&
            members.length>=2 &&
            members.length<=3 &&
            members.every(m=>m?.ball&&typeof m.ball==="object"&&!m.ball.isGarbage)
        );
    }

    function memberId(value){
        return value?.ball?.id;
    }

    function vectorOf(step){
        if(!step)return null;
        const dx=Number(step.tx)-Number(step.x);
        const dy=Number(step.ty)-Number(step.y);
        return Number.isFinite(dx)&&Number.isFinite(dy)&&(dx||dy)
            ?{dx,dy,key:dx+","+dy}
            :null;
    }

    function sameVector(steps){
        if(!Array.isArray(steps)||!steps.length)return null;
        const first=vectorOf(steps[0]);
        if(!first)return null;
        return steps.every(step=>vectorOf(step)?.key===first.key)
            ?first
            :null;
    }

    function independentMotions(board,members){
        const motions=[];
        for(const member of members){
            try{
                motions.push(hexPhysIndependentMemberMotion(board,members,member)||null);
            }catch(_){
                motions.push(null);
            }
        }
        return motions;
    }

    function clearMember(member){
        if(!member?.ball)return;
        if(typeof hexPhysClearGroupBall==="function"){
            hexPhysClearGroupBall(member.ball);
        }else{
            member.ball.motionGroupId=0;
            member.ball.motionGroupRole=-1;
            member.ball.motionGroupOrientation="";
            member.ball.motionGroupSize=0;
            member.ball.rigid=false;
        }
    }

    function groupIdFor(members,steps,fallback=0){
        for(const step of steps||[]){
            const id=Number(step?.bundleId)||0;
            if(id)return id;
        }
        for(const member of members||[]){
            const id=Number(member?.ball?.motionGroupId)||0;
            if(id)return id;
        }
        return Number(fallback)||0;
    }

    function commitCohort(members,steps,fallbackGroupId=0){
        const gid=groupIdFor(members,steps,fallbackGroupId);
        const size=members.length;
        for(const member of members){
            if(gid)member.ball.motionGroupId=gid;
            member.ball.motionGroupSize=size;
            member.ball.rigid=true;
        }
        return gid;
    }

    function declaredCohorts(plan,members){
        const ids=new Set(members.map(memberId));
        const buckets=new Map();

        for(const step of plan||[]){
            const id=memberId(step);
            if(!ids.has(id)||!vectorOf(step))continue;

            const size=Number(step.groupSize)||0;
            if(size<2)continue;

            const bundle=Number(step.bundleId)||0;
            const key=bundle
                ?"bundle:"+bundle
                :"declared-size:"+size;

            if(!buckets.has(key))buckets.set(key,[]);
            buckets.get(key).push(step);
        }

        return[...buckets.values()].filter(steps=>{
            const unique=new Set(steps.map(memberId));
            return unique.size>=2&&!!sameVector(steps);
        });
    }

    function upwardTriangle(members){
        if(!Array.isArray(members)||members.length!==3)return null;
        const ordered=[...members].sort((a,b)=>a.y-b.y||a.x-b.x);
        const top=ordered[0];
        const lower=ordered.slice(1).sort((a,b)=>a.x-b.x);
        if(
            !top||lower.length!==2||
            lower[0].y!==lower[1].y||
            !(top.y<lower[0].y)||
            !(lower[0].x<top.x&&top.x<lower[1].x)
        )return null;
        return{top,left:lower[0],right:lower[1]};
    }

    /* A genuine upward-convex split is encoded by a rigid pair containing
       the top ball and exactly one lower ball. The other lower ball is the
       split/contact side, so the pair is necessarily on the opposite side.
       Recognize both pair+solo plans and pair-only plans; the latter means
       the omitted solo has already finalized its position for this event. */
    function upwardOppositeSideSplit(plan,members){
        const layout=upwardTriangle(members);
        if(!layout)return null;

        const pairSteps=(plan||[]).filter(step=>
            Number(step?.groupSize)===2&&!!vectorOf(step)
        );
        const pairIds=new Set(pairSteps.map(memberId));
        if(pairIds.size!==2||!sameVector(pairSteps))return null;

        const topId=memberId(layout.top);
        const leftId=memberId(layout.left);
        const rightId=memberId(layout.right);
        if(!pairIds.has(topId))return null;

        if(pairIds.has(rightId)&&!pairIds.has(leftId)){
            return{
                splitSide:"left",
                pairSide:"right",
                pairIds:[topId,rightId],
                soloId:leftId
            };
        }
        if(pairIds.has(leftId)&&!pairIds.has(rightId)){
            return{
                splitSide:"right",
                pairSide:"left",
                pairIds:[topId,leftId],
                soloId:rightId
            };
        }
        return null;
    }

    function normalizePlan(
        plan,
        members,
        preview=false,
        forceAll=false,
        fallbackGroupId=0
    ){
        const memberById=new Map(members.map(m=>[m.ball.id,m]));
        const clean=(plan||[]).filter(step=>memberById.has(memberId(step))&&vectorOf(step));
        const cohorts=forceAll&&clean.length===members.length&&sameVector(clean)
            ?[clean]
            :declaredCohorts(clean,members);
        const groupedIds=new Set();
        const cohortInfo=[];

        for(const steps of cohorts){
            const cohortMembers=[];
            const seen=new Set();
            for(const step of steps){
                const id=memberId(step);
                if(seen.has(id))continue;
                seen.add(id);
                cohortMembers.push(memberById.get(id));
            }
            if(cohortMembers.length<2)continue;
            const gid=groupIdFor(cohortMembers,steps,fallbackGroupId);
            cohortInfo.push({ids:seen,size:cohortMembers.length,gid});
            for(const id of seen)groupedIds.add(id);
            if(!preview)commitCohort(cohortMembers,steps,fallbackGroupId);
        }

        if(!preview){
            for(const member of members){
                if(!groupedIds.has(member.ball.id))clearMember(member);
            }
        }

        return clean.map(step=>{
            const info=cohortInfo.find(q=>q.ids.has(memberId(step)));
            if(!info)return{...step,bundleId:0,groupSize:0};
            return{
                ...step,
                bundleId:info.gid||Number(step.bundleId)||0,
                groupSize:info.size
            };
        });
    }

    function commonIndependentPlan(board,members,motions){
        if(
            motions.length!==members.length ||
            motions.some(motion=>!motion) ||
            !sameVector(motions) ||
            typeof hexPhysGroupTranslationPlan!=="function"
        )return null;

        const vector=vectorOf(motions[0]);
        let plan=null;
        try{
            plan=hexPhysGroupTranslationPlan(
                board,
                members,
                vector.dx,
                vector.dy,
                "GROUP_TRANSLATE"
            );
        }catch(_){
            plan=null;
        }

        const ids=new Set(members.map(memberId));
        return Array.isArray(plan)&&
            plan.length===members.length&&
            plan.every(step=>ids.has(memberId(step)))&&
            sameVector(plan)
                ?plan
                :null;
    }

    function independentReleasePlan(board,members,motions){
        const plan=[];
        for(let i=0;i<members.length;i++){
            const motion=motions[i];
            if(!motion||!vectorOf(motion))continue;
            plan.push({...motion,ball:members[i].ball,bundleId:0,groupSize:0});
        }
        return plan;
    }

    hexPhysPlanGroup=function(board,members,preview=false){
        if(!ordinaryGroup(members))return basePlanGroup(board,members,preview)||[];

        /* Capture this before any earlier commit layer gets a chance to clear
           it. A restored moving pair must never end with size=2 but group=0. */
        const authorityGroupId=groupIdFor(members,[]);
        const motions=independentMotions(board,members);
        let basePlan=[];
        try{
            basePlan=basePlanGroup(board,members,preview)||[];
        }catch(_){
            basePlan=[];
        }

        const knownIds=new Set(members.map(memberId));
        const movingBase=basePlan.filter(step=>knownIds.has(memberId(step))&&vectorOf(step));
        const baseMovesWholeGroup=
            movingBase.length===members.length&&
            new Set(movingBase.map(memberId)).size===members.length;
        const baseDeclaresWholeRigid=
            baseMovesWholeGroup&&
            movingBase.every(step=>Number(step.groupSize)===members.length)&&
            sameVector(movingBase);

        /* The selected coordinated event is authoritative. Independent probes
           inspect balls in isolation and therefore cannot invalidate a legal
           three-ball slope translation that already contains every member. */
        if(baseDeclaresWholeRigid){
            const normalized=normalizePlan(
                movingBase,
                members,
                preview,
                true,
                authorityGroupId
            );
            if(!preview)window.__sixBallLastFinalRigidityCorrectionV1={
                reason:"selected-whole-triangle-has-priority",
                ids:members.map(memberId),
                kind:movingBase[0]?.kind||"",
                at:Date.now()
            };
            return normalized;
        }

        /* This must run before same-direction recovery. Otherwise identical
           independent vectors can accidentally rejoin an intentional 2+1
           contact split. Geometry proves that the retained pair is opposite
           the lower ball where the upward triangle split. */
        const explicitUpSplit=upwardOppositeSideSplit(movingBase,members);
        if(explicitUpSplit){
            const normalized=normalizePlan(
                movingBase,
                members,
                preview,
                false,
                authorityGroupId
            );
            if(!preview)window.__sixBallLastFinalRigidityCorrectionV1={
                reason:"upward-convex-opposite-pair-has-priority",
                ...explicitUpSplit,
                at:Date.now()
            };
            return normalized;
        }

        /* All members independently prove the same legal vector. This is the
           fallback for plans that did not already select a full rigid slope or
           an intentional upward-convex split. Preserve richer authored pivots
           when the base plan already moves every member by that same vector. */
        const independentVector=motions.every(Boolean)?sameVector(motions):null;
        if(independentVector){
            const baseVector=baseMovesWholeGroup?sameVector(movingBase):null;
            const plan=baseVector?.key===independentVector.key
                ?movingBase
                :commonIndependentPlan(board,members,motions);
            if(plan){
                const normalized=normalizePlan(
                    plan,
                    members,
                    preview,
                    true,
                    authorityGroupId
                );
                if(!preview)window.__sixBallLastFinalRigidityCorrectionV1={
                    reason:"same-direction-whole-group",
                    ids:members.map(memberId),
                    vector:[independentVector.dx,independentVector.dy],
                    at:Date.now()
                };
                return normalized;
            }
        }

        if(movingBase.length){
            /* Any member omitted from this event is position-final for this
               event. normalizePlan releases it immediately while preserving
               only explicitly declared same-direction moving cohorts. */
            return normalizePlan(
                movingBase,
                members,
                preview,
                false,
                authorityGroupId
            );
        }

        /* No coordinated event survived. Release the obsolete constraint now
           and expose independent proposals in the same resolver pass so the
           grouped-id exclusion cannot leave movable balls frozen. */
        if(!preview)for(const member of members)clearMember(member);
        const released=independentReleasePlan(board,members,motions);
        if(!preview)window.__sixBallLastFinalRigidityCorrectionV1={
            reason:released.length?"release-divergent-group":"release-settled-group",
            ids:members.map(memberId),
            at:Date.now()
        };
        return released;
    };

    window.__sixBallSameDirectionAlwaysKeepsRigidity=true;
    window.__sixBallPositionFinalAlwaysReleasesRigidity=true;
    window.__sixBallSlopeTriangleAlwaysKeepsRigidity=true;
    window.__sixBallUpConvexSplitKeepsOppositePair=true;
    window.__sixBallPositionFinalMeansMissingSelectedProposal=true;
    window.__sixBallRigidityPreviewIsReadOnly=true;
    window.__sixBallFinalRigidityAuthorityVersion="final-rigidity-authority-v2";
})();
