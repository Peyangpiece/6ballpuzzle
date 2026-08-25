/* ============================================================
 * 6ball FINAL RIGIDITY AUTHORITY v1 (UP-CONVEX SCOPE)
 *
 * This is the last ordinary-ball group planner in the runtime.
 * Earlier layers may choose the physical split side or path, but an
 * upward-convex ordinary triplet may not violate these final invariants.
 * Downward/inverse triangles and already-separated two-ball groups delegate
 * unchanged to the legacy planner, preserving their former split rules:
 *
 * 1. A selected three-ball rigid slope event always keeps the
 *    complete triangle, even when a lower-level independent probe
 *    temporarily reports one member as stopped.
 * 2. A prospective upward-convex 2+1 split never overrides a legal
 *    same-direction three-ball descent. Once common motion differs,
 *    the split direction is finalized first; only then is the opposite-side
 *    pair rebuilt and given two-ball rigidity.
 * 3. An active upward-convex split is legal only when the protrusion
 *    contacts the middle 50% of the lower two-ball edge and BOTH lower
 *    balls currently name that same protrusion as their contact pivot.
 *    A future/top pivot is an airborne approach and cannot split.
 * 4. An omitted member is detached only after the board proves that
 *    it is position-final on the floor or on two real lower supports.
 *    A temporarily missing isolated probe on a slope is not settlement.
 * 5. A declared moving pair is always normalized to one two-ball
 *    constraint; solo movers always have zero rigidity.
 * 6. For an upward-convex triplet, different independent directions,
 *    isolated collisions, and lower-layer pair metadata can never authorize
 *    a split by themselves.
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
    const liveEngineByBoard=new WeakMap();

    /* Group planning normally receives only the board, while physical stop
       proof also needs the live visual/batch state. Register every engine at
       creation without putting a circular owner reference on the board. */
    if(typeof createEngine==="function"){
        const baseCreateEngine=createEngine;
        createEngine=function(...args){
            const game=baseCreateEngine(...args);
            if(game?.board&&typeof game.board==="object"){
                liveEngineByBoard.set(game.board,game);
            }
            return game;
        };
    }

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
            if(Number.isFinite(member.role)){
                member.ball.motionGroupRole=member.role;
            }
            if(member.orientation){
                member.ball.motionGroupOrientation=member.orientation;
            }
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

    function currentBilateralCentralContact(info,members,motions){
        const px=Number(info?.px);
        const py=Number(info?.py);
        if(!Number.isFinite(px)||!Number.isFinite(py))return false;
        const currentPivotIs=(member)=>{
            const index=members.indexOf(member);
            const pivot=index>=0?motions?.[index]?.pivot:null;
            return !!(
                Array.isArray(pivot)&&
                Number(pivot[0])===px&&
                Number(pivot[1])===py
            );
        };
        return currentPivotIs(info.pairLower)&&currentPivotIs(info.solo);
    }

    function memberIsPhysicallyStopped(board,member){
        const ball=member?.ball;
        if(!ball)return false;
        if(Array.isArray(ball.fallPath)&&ball.fallPath.length)return false;

        const game=liveEngineByBoard.get(board);
        if(!game){
            /* Headless planner/audit boards have no render clock. In that
               environment an empty physical path is the strongest available
               stop proof; live games always take the stricter branch below. */
            return true;
        }

        if(
            game._visualMovingIds instanceof Set&&
            game._visualMovingIds.has(ball.id)
        )return false;

        const clock=game._liveBatchClock;
        if(
            clock?.states instanceof Map&&
            clock.states.has(ball.id)&&
            Number(clock.elapsed)<Number(clock.duration)-1e-9
        )return false;

        const visual=game.vis?.get?.(ball.id);
        if(!visual)return false;
        if(
            Math.abs(Number(visual.x)-Number(member.x))>1e-6||
            Math.abs(Number(visual.y)-Number(member.y))>1e-6||
            Math.abs(Number(visual.vy)||0)>1e-5||
            Math.abs(Number(visual.motionSpeed)||0)>1e-5||
            visual.pileFlow||
            visual.justReleased||
            visual._pendingPathComplete
        )return false;

        return true;
    }

    /* A lower member disappearing from an earlier layer's plan is not proof
       that it has settled. Isolated probes can temporarily return null at a
       slope collision even though the complete triangle can still descend.
       Only the floor or two real lower supports establish a position-final
       ball, and even that support proof is accepted only after its physical
       motion has completely stopped. Ignore the other members so the old
       triplet cannot prove its own settlement. */
    function positionFinalSupportProven(board,members,motions,id){
        const index=members.findIndex(member=>memberId(member)===id);
        const member=index>=0?members[index]:null;
        if(!member?.ball||motions?.[index])return false;
        if(!memberIsPhysicallyStopped(board,member))return false;

        try{
            if(
                typeof touchesFloorRow==="function"&&
                touchesFloorRow(member.y)
            )return true;
        }catch(_){}

        if(typeof hexPhysSupportInfo!=="function")return false;
        const ownIds=new Set(members.map(memberId));
        let support=null;
        try{
            support=hexPhysSupportInfo(
                board,
                member.x,
                member.y,
                ownIds
            );
        }catch(_){
            support=null;
        }
        if(!support)return false;
        const realCount=Number.isFinite(support.realCount)
            ?Number(support.realCount)
            :Number(support.count)||0;
        return !!support.floor||realCount>=2;
    }

    /* If a pair-only slope plan was created from one null isolated probe, ask
       the collision-safe group translator whether the authored downhill vector
       is legal for all three members. This reconstructs one rigid triangle and
       prevents both a false split and a one-frame freeze. */
    function restoreTripletFromPairSlope(board,members,pairPlan){
        if(
            !Array.isArray(pairPlan)||
            pairPlan.length!==2||
            typeof hexPhysGroupTranslationPlan!=="function"
        )return null;
        const vector=sameVector(pairPlan);
        if(!vector||Math.abs(vector.dx)!==1||vector.dy!==1)return null;

        let plan=null;
        try{
            plan=hexPhysGroupTranslationPlan(
                board,
                members,
                vector.dx,
                vector.dy,
                "GROUP_SLOPE_TRANSLATE"
            );
        }catch(_){
            plan=null;
        }
        const ids=new Set((plan||[]).map(memberId));
        const restoredVector=sameVector(plan||[]);
        return Array.isArray(plan)&&
            plan.length===members.length&&
            ids.size===members.length&&
            members.every(member=>ids.has(memberId(member)))&&
            restoredVector?.dx===vector.dx&&
            restoredVector?.dy===vector.dy
                ?plan
                :null;
    }

    function airborneUpwardSplitCandidate(board,members,motions){
        if(
            !upwardTriangle(members)||
            typeof hexPhysUpConvexSeparator!=="function"
        )return null;
        let info=null;
        try{info=hexPhysUpConvexSeparator(board,members,motions);}catch(_){info=null;}
        const hitFraction=Number(info?.hitFraction);
        if(
            !info?.top?.ball||
            !info?.pairLower?.ball||
            !info?.solo?.ball||
            !Number.isFinite(hitFraction)||
            hitFraction<=.25+1e-9||
            hitFraction>=.75-1e-9||
            currentBilateralCentralContact(info,members,motions)
        )return null;
        return{info,hitFraction};
    }

    function selectedUpwardSplitSide(board,members,motions){
        const layout=upwardTriangle(members);
        if(!layout||typeof hexPhysUpConvexSeparator!=="function")return null;

        let info=null;
        try{info=hexPhysUpConvexSeparator(board,members,motions);}catch(_){info=null;}
        if(!info?.top?.ball||!info?.pairLower?.ball||!info?.solo?.ball)return null;

        /* Canonical UP-convex contact measures the protrusion across the
           lower edge as hitFraction. Only its strict middle 50% (25%..75%)
           is a legal active split. Exact 25% and 75% boundaries belong to
           the outer quarters and remain rigid slopes. */
        const hitFraction=Number(info.hitFraction);
        if(
            !Number.isFinite(hitFraction)||
            hitFraction<=.25+1e-9||
            hitFraction>=.75-1e-9
        )return null;

        const topId=memberId(layout.top);
        const leftId=memberId(layout.left);
        const rightId=memberId(layout.right);
        if(memberId(info.top)!==topId)return null;

        /* Direction is the authority; pair metadata is only its consequence.
           Older wrappers could carry a stale pairLower/solo assignment from a
           previous approach even after `dir` had been corrected. Derive both
           lower roles afresh from the confirmed split direction before any
           two-ball rigidity is accepted or committed. */
        const pairDir=Math.sign(Number(info.dir)||0);
        if(!pairDir)return null;
        const pairLower=pairDir>0?layout.right:layout.left;
        const solo=pairDir>0?layout.left:layout.right;
        const pairMotion=motions?.[members.indexOf(pairLower)]||null;
        const soloMotion=motions?.[members.indexOf(solo)]||null;
        if(
            Math.sign(Number(pairMotion?.tx)-Number(pairMotion?.x))!==pairDir||
            Math.sign(Number(soloMotion?.tx)-Number(soloMotion?.x))!==-pairDir
        )return null;
        const correctedInfo={
            ...info,
            dir:pairDir,
            top:layout.top,
            pairLower,
            solo,
            soloMotion
        };

        /* Merely finding a pile ball below the lower edge is predictive
           geometry, not physical contact. The old separator could therefore
           commit a pair+solo event while the triangle was still airborne.
           A real split requires both lower balls to be tangent to this exact
           protrusion NOW. `topPivot` deliberately does not qualify: it encodes
           a free-fall approach whose contact occurs later in the segment. */
        if(!currentBilateralCentralContact(correctedInfo,members,motions))return null;

        const pairLowerId=memberId(pairLower);
        const soloId=memberId(solo);
        return{
            info:correctedInfo,
            splitDirection:pairDir,
            splitSide:pairDir>0?"left":"right",
            pairSide:pairDir>0?"right":"left",
            pairIds:[topId,pairLowerId],
            pairLowerId,
            soloId,
            hitFraction
        };
    }

    /* Ask the canonical contact solver before any older split wrapper mutates
       the group. A complete current slope plan is direct physical proof that
       all three balls can continue together. It therefore has priority over
       a simultaneous prospective split or an isolated per-ball probe. */
    function currentWholeRigidSlope(board,members,motions){
        if(
            members.length!==3||
            typeof hexPhysRigidSlopePlan!=="function"||
            !Array.isArray(motions)
        )return null;

        const own=new Set(members.map(memberId));
        let hasRealPivot=false;
        for(const motion of motions){
            for(const field of["pivot","topPivot"]){
                const pivot=motion?.[field];
                if(!Array.isArray(pivot)||pivot.length<2)continue;
                const x=Number(pivot[0]),y=Number(pivot[1]);
                if(!Number.isFinite(x)||!Number.isFinite(y))continue;
                const support=board?.[y]?.[x]||null;
                if(support&&!own.has(support.id))hasRealPivot=true;
            }
        }
        if(!hasRealPivot)return null;

        let plan=null;
        try{plan=hexPhysRigidSlopePlan(board,members,motions);}catch(_){plan=null;}
        if(!Array.isArray(plan)||plan.length!==members.length)return null;
        const ids=new Set(plan.map(memberId));
        const vector=sameVector(plan);
        if(
            ids.size!==members.length||
            !members.every(member=>ids.has(memberId(member)))||
            !vector||
            Math.abs(vector.dx)!==1||
            vector.dy!==1
        )return null;
        return plan;
    }

    function requestedSplitPlan(board,members,selected,preview){
        if(!selected||typeof hexPhysUpConvexSplitPlan!=="function")return null;
        let plan=null;
        try{
            plan=hexPhysUpConvexSplitPlan(
                board,
                members,
                selected.info,
                preview
            );
        }catch(_){
            plan=null;
        }
        if(!Array.isArray(plan))return null;
        const classified=upwardOppositeSideSplit(plan,members);
        return classified&&classified.soloId===selected.soloId
            ?plan
            :null;
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

    /* The only non-contact split is a proven position-final release. Detach
       exactly the omitted settled members. If two members remain, they keep
       one pair constraint even when this resolver pass cannot move them; the
       authorized fixed-ball release must not accidentally split that pair too. */
    function positionFinalRelease(
        board,
        members,
        motions,
        plan,
        preview,
        authorityGroupId
    ){
        const movingIds=new Set((plan||[]).map(memberId));
        const omitted=members.filter(member=>!movingIds.has(memberId(member)));
        if(
            !omitted.length||
            !omitted.every(member=>positionFinalSupportProven(
                board,
                members,
                motions,
                memberId(member)
            ))
        )return null;

        const remaining=members.filter(member=>movingIds.has(memberId(member)));
        const clean=(plan||[]).filter(step=>movingIds.has(memberId(step))&&vectorOf(step));
        let authorized=[];

        if(remaining.length>=2){
            const complete=
                clean.length===remaining.length&&
                new Set(clean.map(memberId)).size===remaining.length&&
                !!sameVector(clean);
            if(complete){
                authorized=normalizePlan(
                    clean,
                    remaining,
                    preview,
                    true,
                    authorityGroupId
                );
            }else if(!preview){
                commitCohort(remaining,[],authorityGroupId);
            }
        }else if(remaining.length===1){
            authorized=normalizePlan(
                clean,
                remaining,
                preview,
                false,
                authorityGroupId
            );
        }

        if(!preview)for(const member of omitted)clearMember(member);
        return{
            plan:authorized,
            omittedIds:omitted.map(memberId),
            remainingIds:remaining.map(memberId)
        };
    }

    hexPhysPlanGroup=function(board,members,preview=false){
        if(!ordinaryGroup(members))return basePlanGroup(board,members,preview)||[];

        /* The middle-50% / position-final whitelist belongs exclusively to
           the upward-convex triangle. A downward (inverse) triangle must use
           the planner that existed before this final authority was installed;
           the same is true once a legacy split has produced a two-ball group.
           Delegate before independent probes or metadata normalization so
           this layer cannot alter either the returned plan or its rigidity. */
        if(!upwardTriangle(members)){
            return basePlanGroup(board,members,preview)||[];
        }

        /* Capture this before any earlier commit layer gets a chance to clear
           it. A restored moving pair must never end with size=2 but group=0. */
        const authorityGroupId=groupIdFor(members,[]);
        const motions=independentMotions(board,members);
        const selectedSideBefore=selectedUpwardSplitSide(
            board,
            members,
            motions
        );
        const airborneSplitBefore=airborneUpwardSplitCandidate(
            board,
            members,
            motions
        );
        const currentSlopeBefore=currentWholeRigidSlope(
            board,
            members,
            motions
        );
        let basePlan=[];
        try{
            basePlan=basePlanGroup(board,members,preview)||[];
        }catch(_){
            basePlan=[];
        }

        const knownIds=new Set(members.map(memberId));
        const proposedBase=basePlan.filter(step=>knownIds.has(memberId(step))&&vectorOf(step));
        const baseHasPureHorizontal=proposedBase.some(step=>
            Number(step.ty)===Number(step.y)&&
            Number(step.tx)!==Number(step.x)
        );
        /* Pure sideways proposals are not physical gravity. Remove them before
           any whole-group, pair or position-final classification. A diagonal
           slope remains legal because its target is strictly lower. */
        const movingBase=proposedBase.filter(step=>Number(step.ty)>Number(step.y));
        const baseMovesWholeGroup=
            movingBase.length===members.length&&
            new Set(movingBase.map(memberId)).size===members.length;
        const baseDeclaresWholeRigid=
            baseMovesWholeGroup&&
            movingBase.every(step=>Number(step.groupSize)===members.length)&&
            sameVector(movingBase);
        const selectedSide=
            selectedSideBefore||
            selectedUpwardSplitSide(board,members,motions);
        const authoredBaseVector=
            baseMovesWholeGroup?sameVector(movingBase):null;

        if(currentSlopeBefore){
            const normalized=normalizePlan(
                currentSlopeBefore,
                members,
                preview,
                true,
                authorityGroupId
            );
            if(!preview){
                const vector=vectorOf(normalized[0]);
                for(const member of members){
                    member.ball.momentumX=vector?.dx||0;
                    member.ball.rollDir=vector?.dx||0;
                    member.ball.subCellBias=vector?.dx||0;
                    member.ball._finalRigidSlopeContinuationV5=true;
                }
                if(typeof window.__sixBallRememberUpConvexRigidApproachV32==="function"){
                    try{window.__sixBallRememberUpConvexRigidApproachV32(members,normalized);}catch(_){}
                }
                window.__sixBallLastFinalRigidityCorrectionV1={
                    reason:"current-common-rigid-slope-before-split",
                    ids:members.map(memberId),
                    vector:[vector?.dx||0,vector?.dy||0],
                    at:Date.now()
                };
            }
            return normalized;
        }

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

        /* A pair-only downhill proposal is not yet a position-final release.
           First ask whether that exact slope vector can translate the complete
           triangle without hitting the board. If it can, the third ball is
           still physically movable through the rigid constraint: no separator
           or isolated two-support result may split the body first. */
        const restoredPairSlope=restoreTripletFromPairSlope(
            board,
            members,
            movingBase
        );
        if(restoredPairSlope){
            const normalized=normalizePlan(
                restoredPairSlope,
                members,
                preview,
                true,
                authorityGroupId
            );
            if(!preview){
                const vector=vectorOf(normalized[0]);
                for(const member of members){
                    member.ball.momentumX=vector?.dx||0;
                    member.ball.rollDir=vector?.dx||0;
                    member.ball.subCellBias=vector?.dx||0;
                    member.ball._finalRigidSlopeContinuationV5=true;
                }
                if(typeof window.__sixBallRememberUpConvexRigidApproachV32==="function"){
                    try{window.__sixBallRememberUpConvexRigidApproachV32(members,normalized);}catch(_){}
                }
                window.__sixBallLastFinalRigidityCorrectionV1={
                    reason:"legal-pair-slope-before-split-or-position-final",
                    ids:members.map(memberId),
                    vector:[vector?.dx||0,vector?.dy||0],
                    prospectiveSplit:!!selectedSide,
                    at:Date.now()
                };
            }
            return normalized;
        }

        /* A separator can see the protruding pile ball one logical step before
           the falling visual reaches it. Older priority treated that future
           middle-50% candidate as an immediate 2+1 split, even when all three
           authored steps already had one identical downhill vector. Group-size
           metadata alone cannot turn that common motion into a split. */
        const authoredVector=authoredBaseVector;
        if(authoredVector){
            const normalized=normalizePlan(
                movingBase,
                members,
                preview,
                true,
                authorityGroupId
            );
            if(!preview)window.__sixBallLastFinalRigidityCorrectionV1={
                reason:selectedSide
                    ?"authored-same-direction-before-prospective-two-plus-one"
                    :"authored-same-direction-whole-group",
                ids:members.map(memberId),
                vector:[authoredVector.dx,authoredVector.dy],
                prospectiveSplit:!!selectedSide,
                at:Date.now()
            };
            return normalized;
        }

        /* An older split wrapper can also author divergent pair/solo steps even
           though all three independent current probes prove one safe downhill
           translation. Resolve that common translation before considering the
           future separator. A real split is considered only once current
           physical directions actually differ. */
        const independentVector=motions.every(Boolean)?sameVector(motions):null;
        if(independentVector){
            const plan=commonIndependentPlan(board,members,motions);
            if(plan){
                const normalized=normalizePlan(
                    plan,
                    members,
                    preview,
                    true,
                    authorityGroupId
                );
                if(!preview)window.__sixBallLastFinalRigidityCorrectionV1={
                    reason:selectedSide
                        ?"same-direction-before-prospective-two-plus-one"
                        :"same-direction-whole-group",
                    ids:members.map(memberId),
                    vector:[independentVector.dx,independentVector.dy],
                    prospectiveSplit:!!selectedSide,
                    at:Date.now()
                };
                return normalized;
            }
        }

        /* Same-direction recovery has already failed. Do not manufacture a
           rigid path through a real contact when the shared translation is
           unsafe. Geometry now proves which opposite-side pair survives once
           current directions differ. */
        const explicitUpSplit=upwardOppositeSideSplit(movingBase,members);

        /* Split direction is finalized first. Discard every pair/solo cohort
           that an earlier layer committed, restore the triplet metadata, then
           construct exactly one pair from that direction. Even a coincidentally
           matching old pair is rebuilt so pair rigidity can never precede the
           direction decision. */
        if(selectedSide){
            if(!preview){
                commitCohort(members,[],authorityGroupId);
                for(const member of members){
                    member.ball.motionGroupOrientation="up";
                }
            }

            const corrected=requestedSplitPlan(
                board,
                members,
                selectedSide,
                preview
            );
            if(corrected){
                const normalized=normalizePlan(
                    corrected,
                    members,
                    preview,
                    false,
                    authorityGroupId
                );
                if(!preview)window.__sixBallLastFinalRigidityCorrectionV1={
                    reason:"split-direction-confirmed-before-pair-rigidity",
                    ...selectedSide,
                    info:undefined,
                    replacedPair:explicitUpSplit||null,
                    at:Date.now()
                };
                return normalized;
            }

            if(!preview){
                window.__sixBallLastFinalRigidityCorrectionV1={
                    reason:"wait-instead-of-unconfirmed-directional-pair",
                    rejected:explicitUpSplit||null,
                    required:selectedSide,
                    at:Date.now()
                };
            }
            return[];
        }

        /* A moving solo plus a moving pair is an active physical split, not a
           position-final release. Without a proven middle-50% contact it is
           forbidden, regardless of what a generic pair or pocket layer
           proposed. */
        if(
            explicitUpSplit&&
            movingBase.some(step=>memberId(step)===explicitUpSplit.soloId)
        ){
            if(!preview){
                commitCohort(members,[],authorityGroupId);
                for(const member of members){
                    member.ball.motionGroupOrientation="up";
                }
                window.__sixBallLastFinalRigidityCorrectionV1={
                    reason:airborneSplitBefore
                        ?"reject-airborne-upward-two-plus-one"
                        :"reject-upward-split-outside-middle-fifty-percent",
                    rejected:explicitUpSplit,
                    airborneCandidate:!!airborneSplitBefore,
                    at:Date.now()
                };
            }
            return[];
        }

        if(explicitUpSplit){
            const positionFinal=positionFinalSupportProven(
                board,
                members,
                motions,
                explicitUpSplit.soloId
            );
            if(!positionFinal){
                if(!preview){
                    commitCohort(members,[],authorityGroupId);
                    for(const member of members){
                        member.ball.motionGroupOrientation="up";
                    }
                    window.__sixBallLastFinalRigidityCorrectionV1={
                        reason:"reject-pair-only-slope-contact-not-position-final",
                        rejected:explicitUpSplit,
                        at:Date.now()
                    };
                }
                return[];
            }

            const normalized=normalizePlan(
                movingBase,
                members,
                preview,
                false,
                authorityGroupId
            );
            if(!preview)window.__sixBallLastFinalRigidityCorrectionV1={
                reason:"position-final-member-released-after-support-proof",
                ...explicitUpSplit,
                at:Date.now()
            };
            return normalized;
        }

        const finalized=positionFinalRelease(
            board,
            members,
            motions,
            movingBase,
            preview,
            authorityGroupId
        );
        if(finalized){
            if(!preview)window.__sixBallLastFinalRigidityCorrectionV1={
                reason:"release-only-proven-position-final-members",
                omittedIds:finalized.omittedIds,
                remainingIds:finalized.remainingIds,
                at:Date.now()
            };
            return finalized.plan;
        }

        /* No other trigger may divide an ordinary rigid body. Restore the
           complete current cohort and wait for either a current middle-50%
           contact or a board-proven position-final member. */
        if(!preview){
            commitCohort(members,[],authorityGroupId);
            window.__sixBallLastFinalRigidityCorrectionV1={
                reason:baseHasPureHorizontal
                    ?"reject-pure-horizontal-group-motion"
                    :"reject-ordinary-split-without-central-contact-or-position-final",
                ids:members.map(memberId),
                proposedIds:movingBase.map(memberId),
                at:Date.now()
            };
        }
        return[];
    };

    window.__sixBallSameDirectionAlwaysKeepsRigidity=true;
    window.__sixBallSameDirectionBeatsProspectiveTwoPlusOne=true;
    window.__sixBallPositionFinalAlwaysReleasesRigidity=true;
    window.__sixBallPositionFinalRequiresPhysicalStop=true;
    window.__sixBallSlopeTriangleAlwaysKeepsRigidity=true;
    window.__sixBallUpConvexSplitKeepsOppositePair=true;
    window.__sixBallUpConvexSelectedSideCannotBeOverridden=true;
    window.__sixBallUpConvexWrongSideWaitsInsteadOfSplitting=true;
    window.__sixBallUpConvexActiveSplitRequiresMiddleFiftyPercent=true;
    window.__sixBallUpConvexSplitRequiresCurrentBilateralPivotContact=true;
    window.__sixBallAirborneUpConvexTwoPlusOneIsForbidden=true;
    window.__sixBallSplitDirectionPrecedesPairRigidity=true;
    window.__sixBallUpConvexPositionFinalReleaseExemptsContactBand=true;
    window.__sixBallCurrentCommonSlopeBeatsProspectiveSplit=true;
    window.__sixBallFallingRigidTriangleNeverRotates=true;
    window.__sixBallUpConvexOuterQuarterUsesRigidSlide=false;
    window.__sixBallOuterQuarterRigidSlideBypassesPerMemberDownFilter=false;
    window.__sixBallPureHorizontalGroupMotionForbidden=true;
    window.__sixBallPositionFinalMeansMissingSelectedProposal=false;
    window.__sixBallPairOnlyReleaseRequiresPositionFinalSupport=true;
    window.__sixBallLegalPairSlopeBeatsEverySplitOrRelease=true;
    window.__sixBallCurrentCentralSplitBeatsHorizontalSnap=true;
    window.__sixBallOrdinarySplitOnlyCentralOrPositionFinal=false;
    window.__sixBallUpConvexSplitOnlyCentralOrPositionFinal=true;
    window.__sixBallInverseTriangleUsesLegacySplitRules=true;
    window.__sixBallDivergentMotionAloneCannotSplit=true;
    window.__sixBallRigidityPreviewIsReadOnly=true;
    window.__sixBallFinalRigidityAuthorityVersion="final-rigidity-authority-v14";
})();
