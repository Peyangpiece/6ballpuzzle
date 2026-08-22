/* ============================================================
 * 6ball UP-CONVEX RIGIDITY / PARTIAL RELEASE v2.3
 *
 * Physical priority for an ordinary UP triplet:
 *
 * 1. If exactly one LOWER member is already in, or is moving on this
 *    step into, a genuine V-pocket made by two external pile balls,
 *    THAT member alone releases.  The TOP + opposite LOWER member
 *    keep a 2-ball rigid constraint and move away from the pocket.
 *
 * 2. Otherwise preserve 3-ball rigidity only when the canonical
 *    current-contact rigid-slope solver proves one real common move.
 *
 * Important correction from v2.2:
 * "independent motion is null" is NOT by itself a release event.
 * A lower member may momentarily have no solo move while still being
 * carried by the rigid body.  That false rule selected the yellow
 * member in the reported clip even though the red member was the one
 * physically entering the pile red/green pocket.
 * ============================================================ */
(function(){
    if(
        typeof window === "undefined" ||
        window.__sixBallUpConvexRigidUntilImpossibleV23
    ){
        return;
    }

    if(
        typeof hexPhysPlanGroup !== "function" ||
        typeof hexPhysIndependentMemberMotion !== "function" ||
        typeof hexPhysRigidSlopePlan !== "function"
    ){
        return;
    }

    window.__sixBallUpConvexRigidUntilImpossibleV23 = true;

    const basePlanGroup = hexPhysPlanGroup;

    function layout(members){
        if(
            !Array.isArray(members) ||
            members.length !== 3 ||
            members.some(m => !m?.ball || m.ball.isGarbage)
        ){
            return null;
        }

        const orientation =
            members[0]?.orientation ||
            members[0]?.ball?.motionGroupOrientation ||
            "";

        if(orientation !== "up")
            return null;

        const lowerY = Math.max(...members.map(m => m.y));
        const lower = members
            .filter(m => m.y === lowerY)
            .sort((a,b) => a.x-b.x);
        const top = members.find(m => m.y < lowerY);

        if(
            lower.length !== 2 ||
            !top ||
            lower[1].x-lower[0].x !== 2 ||
            top.x !== lower[0].x+1 ||
            top.y !== lowerY-1
        ){
            return null;
        }

        return {top,lower,lowerY};
    }

    function isThreeBallRigidPlan(plan,members){
        if(!Array.isArray(plan) || plan.length !== 3)
            return false;

        const ids = new Set(members.map(m => m.ball.id));
        const bundles = new Set();

        for(const p of plan){
            if(!p?.ball || !ids.has(p.ball.id))
                return false;
            if((p.groupSize || 0) !== 3)
                return false;
            if(p.bundleId)
                bundles.add(p.bundleId);
        }

        return bundles.size <= 1;
    }

    function memberMotions(board,members){
        const motions=[];

        for(const m of members){
            try{
                motions.push(
                    hexPhysIndependentMemberMotion(
                        board,
                        members,
                        m
                    )
                );
            }catch(_){
                return null;
            }
        }

        return motions;
    }

    function ownIds(members){
        return new Set(members.map(m => m.ball.id));
    }

    function externalBall(board,x,y,own){
        if(
            typeof valid === "function" &&
            !valid(x,y)
        ){
            return null;
        }

        const q=board?.[y]?.[x] || null;
        return q && !own.has(q.id)
            ? q
            : null;
    }

    function pocketAt(board,x,y,members){
        if(
            !Number.isFinite(x) ||
            !Number.isFinite(y)
        ){
            return null;
        }

        if(
            typeof valid === "function" &&
            !valid(x,y)
        ){
            return null;
        }

        const own=ownIds(members);
        const target=board?.[y]?.[x] || null;

        /* The destination itself may be one of our moving origins,
           but it may not already contain an external pile ball. */
        if(target && !own.has(target.id))
            return null;

        const left=externalBall(
            board,
            x-1,
            y+1,
            own
        );
        const right=externalBall(
            board,
            x+1,
            y+1,
            own
        );

        return left && right
            ? {left,right,x,y}
            : null;
    }

    function hasRealCurrentPivot(board,members,motions){
        const own=ownIds(members);

        for(const p of motions || []){
            for(const key of ["pivot","topPivot"]){
                const pv=p?.[key];
                if(!Array.isArray(pv) || pv.length<2)
                    continue;

                const x=Number(pv[0]);
                const y=Number(pv[1]);
                if(!Number.isFinite(x) || !Number.isFinite(y))
                    continue;

                const support=board?.[y]?.[x];
                if(support && !own.has(support.id))
                    return true;
            }
        }

        return false;
    }

    function canonicalRigidSlope(board,members,motions){
        if(!motions || !hasRealCurrentPivot(board,members,motions))
            return null;

        let plan=null;

        try{
            plan=hexPhysRigidSlopePlan(
                board,
                members,
                motions
            );
        }catch(_){
            plan=null;
        }

        if(!Array.isArray(plan) || plan.length!==3)
            return null;

        const ids=ownIds(members);
        const dx=plan[0].tx-plan[0].x;
        const dy=plan[0].ty-plan[0].y;

        if(Math.abs(dx)!==1 || dy!==1)
            return null;

        for(const p of plan){
            if(
                !p?.ball ||
                !ids.has(p.ball.id) ||
                p.kind!=="GROUP_SLOPE_TRANSLATE" ||
                (p.tx-p.x)!==dx ||
                (p.ty-p.y)!==dy
            ){
                return null;
            }
        }

        return plan;
    }

    function proposalForMember(plan,member){
        if(!Array.isArray(plan))
            return null;

        return plan.find(
            p => p?.ball?.id === member.ball.id
        ) || null;
    }

    function projectedPocketCapture(
        board,
        members,
        g,
        motions,
        rigidPlan
    ){
        const found=[];

        for(const solo of g.lower){
            const index=members.indexOf(solo);
            const currentMotion=motions?.[index] || null;

            /*
             * A member is currently physically captured only when it
             * is actually sitting in a two-support external V-pocket.
             * REST/null alone is deliberately NOT sufficient.
             */
            const currentPocket=pocketAt(
                board,
                solo.x,
                solo.y,
                members
            );

            if(currentPocket && !currentMotion){
                found.push({
                    solo,
                    proposal:null,
                    pocket:currentPocket,
                    source:"current-two-support-pocket"
                });
                continue;
            }

            const candidates=[];
            if(currentMotion)
                candidates.push({
                    proposal:currentMotion,
                    source:"independent-next-step-pocket"
                });

            const rigidProposal=proposalForMember(
                rigidPlan,
                solo
            );

            if(
                rigidProposal &&
                (!currentMotion ||
                 rigidProposal.tx!==currentMotion.tx ||
                 rigidProposal.ty!==currentMotion.ty)
            ){
                candidates.push({
                    proposal:rigidProposal,
                    source:"rigid-next-step-pocket"
                });
            }

            for(const candidate of candidates){
                const p=candidate.proposal;
                if(!p || p.ty <= solo.y)
                    continue;

                const pocket=pocketAt(
                    board,
                    Number(p.tx),
                    Number(p.ty),
                    members
                );

                if(!pocket)
                    continue;

                found.push({
                    solo,
                    proposal:p,
                    pocket,
                    source:candidate.source
                });
                break;
            }
        }

        /* Only an unambiguous one-member capture may break 3 -> 1+2. */
        const unique=new Map();
        for(const item of found)
            unique.set(String(item.solo.ball.id),item);

        return unique.size===1
            ? [...unique.values()][0]
            : null;
    }

    function clearOneBall(ball){
        if(!ball)
            return;

        if(typeof hexPhysClearGroupBall === "function"){
            hexPhysClearGroupBall(ball);
            return;
        }

        ball.motionGroupId=0;
        ball.motionGroupRole=-1;
        ball.motionGroupOrientation="";
        ball.motionGroupSize=0;
        ball.rigid=false;
    }

    function pairDirection(g,solo){
        return solo.ball.id===g.lower[1].ball.id
            ? -1
            : 1;
    }

    function pairPreviewPlan(board,pair,dir){
        if(typeof hexPhysGroupTranslationPlan === "function"){
            try{
                const direct=hexPhysGroupTranslationPlan(
                    board,
                    pair,
                    dir,
                    1,
                    "GROUP_SLOPE_TRANSLATE"
                );
                if(Array.isArray(direct) && direct.length===2)
                    return direct;
            }catch(_){ }
        }

        try{
            const fallback=basePlanGroup(
                board,
                pair,
                true
            );
            return Array.isArray(fallback)
                ? fallback
                : [];
        }catch(_){
            return [];
        }
    }

    function commitPairState(pair,solo,dir){
        const gid=
            pair[0]?.ball?.motionGroupId ||
            pair[1]?.ball?.motionGroupId ||
            solo?.ball?.motionGroupId ||
            0;

        clearOneBall(solo.ball);

        for(const m of pair){
            if(gid)
                m.ball.motionGroupId=gid;
            m.ball.motionGroupSize=2;
            m.ball.rigid=true;
            m.ball.momentumX=dir;
            m.ball.rollDir=dir;
            m.ball.subCellBias=dir;
            m.ball._upPocketRemainingPairV23=true;
        }
    }

    function capturePlan(
        board,
        members,
        g,
        capture,
        preview
    ){
        const solo=capture.solo;
        const pairLower=
            g.lower[0].ball.id===solo.ball.id
                ? g.lower[1]
                : g.lower[0];
        const pair=[g.top,pairLower];
        const dir=pairDirection(g,solo);

        const pairPlan=pairPreviewPlan(
            board,
            pair,
            dir
        );

        if(!Array.isArray(pairPlan) || !pairPlan.length)
            return null;

        let soloPlan=null;
        if(capture.proposal){
            soloPlan={
                ...capture.proposal,
                ball:solo.ball,
                bundleId:0,
                groupSize:0,
                capturedIntoPocket:true
            };
        }

        if(!preview){
            commitPairState(
                pair,
                solo,
                dir
            );

            window.__sixBallLastUpProjectedPocketReleaseV23={
                soloId:solo.ball.id,
                pairIds:pair.map(m => m.ball.id),
                pairDirection:dir,
                pocket:[capture.pocket.x,capture.pocket.y],
                supportIds:[
                    capture.pocket.left.id,
                    capture.pocket.right.id
                ],
                source:capture.source,
                at:Date.now()
            };
        }

        return soloPlan
            ? [...pairPlan,soloPlan]
            : pairPlan;
    }

    hexPhysPlanGroup=function(
        board,
        members,
        preview=false
    ){
        const g=layout(members);

        if(!g){
            return basePlanGroup(
                board,
                members,
                preview
            ) || [];
        }

        const motions=memberMotions(
            board,
            members
        );

        const rigidCandidate=canonicalRigidSlope(
            board,
            members,
            motions
        );

        /*
         * The real physical one-ball capture outranks both:
         *   - a misleading current REST/null on the opposite member,
         *   - geometric protrusion-side selection.
         */
        const capture=projectedPocketCapture(
            board,
            members,
            g,
            motions,
            rigidCandidate
        );

        if(capture){
            const partial=capturePlan(
                board,
                members,
                g,
                capture,
                preview
            );

            if(partial)
                return partial;
        }

        const plan=basePlanGroup(
            board,
            members,
            preview
        ) || [];

        if(isThreeBallRigidPlan(plan,members))
            return plan;

        /* No synthetic rescue. Only the canonical current-contact
           rigid slope may keep all three members rigid. */
        if(!rigidCandidate)
            return plan;

        if(!preview){
            for(const m of members){
                m.ball.rigid=true;
                m.ball.motionGroupSize=3;
                m.ball.motionGroupOrientation="up";
                m.ball._upConvexRigidUntilImpossibleV23=true;
            }

            window.__sixBallLastUpConvexRigidUntilImpossibleV23={
                ids:members.map(m => m.ball.id),
                dx:rigidCandidate[0].tx-rigidCandidate[0].x,
                dy:rigidCandidate[0].ty-rigidCandidate[0].y,
                reason:"canonical-current-contact-rigid-slope",
                at:Date.now()
            };
        }

        return rigidCandidate;
    };

    window.__sixBallUpConvexRigidUntilContactV1=true;
    window.__sixBallUpConvexRigidUntilContactVersion=
        "upconvex-rigidity-partial-release-v2.3";
    window.__sixBallUpConvexRigidUntilImpossibleVersion=
        "upconvex-rigidity-partial-release-v2.3";
    window.__sixBallUpConvexNoSyntheticRigidTranslation=true;
    window.__sixBallUpConvexRequiresRealCurrentPivot=true;
    window.__sixBallUpPocketCaptureHasPriority=true;
    window.__sixBallUpRestAloneDoesNotChooseSolo=true;
    window.__sixBallUpRemainingTwoKeepRigidity=true;
})();