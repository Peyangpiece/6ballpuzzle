/* ============================================================
 * 6ball UP-CONVEX RIGIDITY / PARTIAL RELEASE v2.4
 *
 * Ordinary UP-triplet priority:
 *
 * 1. Let the canonical planner decide whether all THREE balls can
 *    still continue as one rigid body. If yes, keep all three rigid.
 *
 * 2. Only after canonical 3-ball rigidity is no longer available,
 *    check the two LOWER members for the concrete physical event
 *    seen in the reference recording: one lower member's INWARD
 *    diagonal destination is an empty V-pocket supported by two
 *    external pile balls.
 *
 *    That member alone releases into the pocket. The TOP + opposite
 *    LOWER member remain a rigid pair and move away from the pocket.
 *
 * 3. REST/null by itself is NEVER a release condition. A lower ball
 *    may have no independent solo move while still being carried by
 *    the rigid triplet/pair.
 *
 * This specifically fixes the live case:
 *      BLUE
 *  YELLOW  RED
 * RED enters the pile red/green V-pocket, so RED releases and
 * BLUE+YELLOW remain paired and move LEFT.
 * ============================================================ */
(function(){
    if(
        typeof window === "undefined" ||
        window.__sixBallUpConvexRigidUntilImpossibleV24
    ){
        return;
    }

    if(typeof hexPhysPlanGroup !== "function")
        return;

    window.__sixBallUpConvexRigidUntilImpossibleV24 = true;

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
        return q && !own.has(q.id) ? q : null;
    }

    function pocketAt(board,x,y,members){
        if(
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            (typeof valid === "function" && !valid(x,y))
        ){
            return null;
        }

        const own=ownIds(members);
        const target=board?.[y]?.[x] || null;

        /* Target must be free of an external stationary ball. */
        if(target && !own.has(target.id))
            return null;

        const left=externalBall(board,x-1,y+1,own);
        const right=externalBall(board,x+1,y+1,own);

        return left && right
            ? {x,y,left,right}
            : null;
    }

    function inwardPocketCapture(board,members,g){
        const found=[];

        for(const solo of g.lower){
            const inward=Math.sign(g.top.x-solo.x);
            if(!inward)
                continue;

            const tx=solo.x+inward;
            const ty=solo.y+1;
            const pocket=pocketAt(
                board,
                tx,
                ty,
                members
            );

            if(!pocket)
                continue;

            found.push({
                solo,
                tx,
                ty,
                inward,
                pocket,
                source:"lower-member-inward-v-pocket"
            });
        }

        /* Never guess when both lower members have valid pockets. */
        return found.length === 1
            ? found[0]
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
        /* RIGHT lower captured -> remaining pair moves LEFT. */
        return solo.ball.id===g.lower[1].ball.id
            ? -1
            : 1;
    }

    function directPairPlan(board,pair,dir){
        if(typeof hexPhysGroupTranslationPlan !== "function")
            return null;

        try{
            const plan=hexPhysGroupTranslationPlan(
                board,
                pair,
                dir,
                1,
                "GROUP_SLOPE_TRANSLATE"
            );

            if(!Array.isArray(plan) || plan.length!==2)
                return null;

            if(!plan.every(p =>
                (p.tx-p.x)===dir &&
                (p.ty-p.y)===1
            )){
                return null;
            }

            return plan;
        }catch(_){
            return null;
        }
    }

    function fallbackPairPreview(board,pair,dir){
        const fake=pair.map(m => ({
            ...m,
            ball:{
                ...m.ball,
                motionGroupSize:2,
                rigid:true,
                momentumX:dir,
                rollDir:dir,
                subCellBias:dir
            }
        }));

        try{
            const plan=basePlanGroup(board,fake,true);
            if(!Array.isArray(plan) || !plan.length)
                return null;

            /* The remaining pair must actually leave away from the pocket. */
            if(!plan.every(p => (p.tx-p.x)<=0) && dir<0)
                return null;
            if(!plan.every(p => (p.tx-p.x)>=0) && dir>0)
                return null;

            return plan;
        }catch(_){
            return null;
        }
    }

    function makePairPlan(board,pair,dir){
        return directPairPlan(board,pair,dir) ||
               fallbackPairPreview(board,pair,dir);
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
            m.ball._upPocketRemainingPairV24=true;
        }
    }

    function capturePlan(board,members,g,capture,preview){
        const solo=capture.solo;
        const pairLower=
            g.lower[0].ball.id===solo.ball.id
                ? g.lower[1]
                : g.lower[0];
        const pair=[g.top,pairLower];
        const dir=pairDirection(g,solo);

        const pairPlan=makePairPlan(
            board,
            pair,
            dir
        );

        if(!Array.isArray(pairPlan) || !pairPlan.length)
            return null;

        const soloPlan={
            x:solo.x,
            y:solo.y,
            tx:capture.tx,
            ty:capture.ty,
            ball:solo.ball,
            kind:capture.inward<0 ? "ROLL_LEFT" : "ROLL_RIGHT",
            pivot:null,
            topPivot:null,
            followSupportIds:[],
            bundleId:0,
            groupSize:0,
            capturedIntoPocket:true
        };

        if(!preview){
            commitPairState(pair,solo,dir);

            window.__sixBallLastUpInwardPocketReleaseV24={
                soloId:solo.ball.id,
                pairIds:pair.map(m => m.ball.id),
                pairDirection:dir,
                target:[capture.tx,capture.ty],
                supportIds:[
                    capture.pocket.left.id,
                    capture.pocket.right.id
                ],
                source:capture.source,
                at:Date.now()
            };
        }

        return [...pairPlan,soloPlan];
    }

    function memberMotions(board,members){
        if(typeof hexPhysIndependentMemberMotion !== "function")
            return null;

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
        if(
            typeof hexPhysRigidSlopePlan !== "function" ||
            !motions ||
            !hasRealCurrentPivot(board,members,motions)
        ){
            return null;
        }

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

    hexPhysPlanGroup=function(board,members,preview=false){
        const g=layout(members);

        if(!g)
            return basePlanGroup(board,members,preview) || [];

        /*
         * First ask the canonical stack, read-only. If it still has a
         * real 3-ball rigid continuation, NOTHING may split yet.
         */
        let baselinePreview=[];
        try{
            baselinePreview=basePlanGroup(
                board,
                members,
                true
            ) || [];
        }catch(_){
            baselinePreview=[];
        }

        if(isThreeBallRigidPlan(baselinePreview,members)){
            return preview
                ? baselinePreview
                : (basePlanGroup(board,members,false) || []);
        }

        /*
         * Canonical 3-ball rigidity has ended. Now choose WHO releases
         * from actual pocket geometry, not from REST/null and not from
         * protrusion-side heuristics.
         */
        const capture=inwardPocketCapture(
            board,
            members,
            g
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

        /*
         * No concrete one-member pocket event. Preserve three-ball
         * rigidity only when the canonical current-contact slope solver
         * itself proves a genuine common move.
         */
        const motions=memberMotions(board,members);
        const rigid=canonicalRigidSlope(
            board,
            members,
            motions
        );

        if(rigid){
            if(!preview){
                for(const m of members){
                    m.ball.rigid=true;
                    m.ball.motionGroupSize=3;
                    m.ball.motionGroupOrientation="up";
                    m.ball._upConvexRigidUntilImpossibleV24=true;
                }
            }
            return rigid;
        }

        return preview
            ? baselinePreview
            : (basePlanGroup(board,members,false) || []);
    };

    window.__sixBallUpConvexRigidUntilContactV1=true;
    window.__sixBallUpConvexRigidUntilContactVersion=
        "upconvex-rigidity-partial-release-v2.4";
    window.__sixBallUpConvexRigidUntilImpossibleVersion=
        "upconvex-rigidity-partial-release-v2.4";
    window.__sixBallUpRestAloneDoesNotChooseSolo=true;
    window.__sixBallUpInwardPocketChoosesSolo=true;
    window.__sixBallUpRemainingTwoKeepRigidity=true;
    window.__sixBallUpCanonicalThreeBallMotionHasPriority=true;
})();