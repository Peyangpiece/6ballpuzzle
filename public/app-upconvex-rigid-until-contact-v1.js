/* ============================================================
 * 6ball UP-CONVEX RIGIDITY / PARTIAL RELEASE v2.6
 * ============================================================ */
(function(){
    if(typeof window==="undefined"||window.__sixBallUpConvexRigidUntilImpossibleV26)return;
    if(typeof hexPhysPlanGroup!=="function")return;

    window.__sixBallUpConvexRigidUntilImpossibleV26=true;
    /* Compatibility marker for diagnostics written against v2.5. */
    window.__sixBallUpConvexRigidUntilImpossibleV25=true;
    /* Compatibility marker for diagnostics written against v2.4. */
    window.__sixBallUpConvexRigidUntilImpossibleV24=true;
    const basePlanGroup=hexPhysPlanGroup;

    function layout(members){
        if(!Array.isArray(members)||members.length!==3||members.some(m=>!m?.ball||m.ball.isGarbage))return null;
        const orientation=members[0]?.orientation||members[0]?.ball?.motionGroupOrientation||"";
        if(orientation!=="up")return null;
        const lowerY=Math.max(...members.map(m=>m.y));
        const lower=members.filter(m=>m.y===lowerY).sort((a,b)=>a.x-b.x);
        const top=members.find(m=>m.y<lowerY);
        if(lower.length!==2||!top||lower[1].x-lower[0].x!==2||top.x!==lower[0].x+1||top.y!==lowerY-1)return null;
        return{top,lower,lowerY};
    }

    const ownIds=members=>new Set(members.map(m=>m.ball.id));

    function externalBall(board,x,y,own){
        if(typeof valid==="function"&&!valid(x,y))return null;
        const q=board?.[y]?.[x]||null;
        return q&&!own.has(q.id)?q:null;
    }

    function pocketAt(board,x,y,members){
        if(!Number.isFinite(x)||!Number.isFinite(y)||(typeof valid==="function"&&!valid(x,y)))return null;
        const own=ownIds(members),target=board?.[y]?.[x]||null;
        if(target&&!own.has(target.id))return null;
        const left=externalBall(board,x-1,y+1,own),right=externalBall(board,x+1,y+1,own);
        return left&&right?{x,y,left,right}:null;
    }

    const clampOffset=v=>Math.max(-1,Math.min(1,v));

    function continuousOffset(members,g){
        const topOffset=Number(g?.top?.ball?.impactOffsetX);
        if(Number.isFinite(topOffset))return clampOffset(topOffset);
        const values=members.map(m=>Number(m?.ball?.impactOffsetX)).filter(Number.isFinite).map(clampOffset).sort((a,b)=>a-b);
        return values.length?values[Math.floor(values.length/2)]:0;
    }

    function actualMotionToward(board,members,candidate){
        if(typeof hexPhysIndependentMemberMotion!=="function")return 0;
        let motion=null;
        try{motion=hexPhysIndependentMemberMotion(board,members,candidate.solo);}catch(_){motion=null;}
        if(!motion)return 0;
        const dx=Math.sign(motion.tx-candidate.solo.x),dy=motion.ty-candidate.solo.y;
        if(dx!==candidate.inward||dy<=0)return 0;
        return motion.tx===candidate.tx&&motion.ty===candidate.ty?2:1;
    }

    function storedDirection(members){
        let sum=0;
        for(const m of members){
            sum+=Math.sign(Number(m?.ball?.momentumX)||Number(m?.ball?.rollDir)||Number(m?.ball?.subCellBias)||0);
        }
        return Math.sign(sum);
    }

    function inwardPocketCapture(board,members,g){
        const found=[];
        for(const solo of g.lower){
            const inward=Math.sign(g.top.x-solo.x);
            if(!inward)continue;
            const tx=solo.x+inward,ty=solo.y+1,pocket=pocketAt(board,tx,ty,members);
            if(pocket)found.push({solo,tx,ty,inward,pocket,source:"immediate-lower-inward-v-pocket"});
        }
        if(found.length===0)return null;
        if(found.length===1)return found[0];

        const offset=continuousOffset(members,g);
        const ranked=found.map(c=>({...c,continuousX:c.solo.x+offset,distanceToPocket:Math.abs((c.solo.x+offset)-c.tx),releaseOffsetX:offset})).sort((a,b)=>a.distanceToPocket-b.distanceToPocket);

        if(ranked.length>=2&&ranked[1].distanceToPocket-ranked[0].distanceToPocket>1e-6){
            return{...ranked[0],source:"continuous-pre-split-nearest-v-pocket"};
        }

        const motionRanked=ranked.map(c=>({...c,motionScore:actualMotionToward(board,members,c)})).sort((a,b)=>b.motionScore-a.motionScore);
        if(motionRanked[0].motionScore>0&&motionRanked[0].motionScore>motionRanked[1].motionScore){
            return{...motionRanked[0],source:"actual-member-motion-into-v-pocket"};
        }

        const dir=storedDirection(members);
        if(dir){
            const directional=ranked.filter(c=>c.inward===dir);
            if(directional.length===1)return{...directional[0],source:"stored-group-direction-into-v-pocket"};
        }
        return null;
    }

    function isThreeBallRigidPlan(plan,members){
        if(!Array.isArray(plan)||plan.length!==3)return false;
        const ids=new Set(members.map(m=>m.ball.id)),bundles=new Set();
        for(const p of plan){
            if(!p?.ball||!ids.has(p.ball.id)||(p.groupSize||0)!==3)return false;
            if(p.bundleId)bundles.add(p.bundleId);
        }
        return bundles.size<=1;
    }

    function clearOneBall(ball){
        if(!ball)return;
        if(typeof hexPhysClearGroupBall==="function"){hexPhysClearGroupBall(ball);return;}
        ball.motionGroupId=0;ball.motionGroupRole=-1;ball.motionGroupOrientation="";ball.motionGroupSize=0;ball.rigid=false;
    }

    const pairDirection=(g,solo)=>solo.ball.id===g.lower[1].ball.id?-1:1;

    function directPairPlan(board,pair,dir){
        if(typeof hexPhysGroupTranslationPlan!=="function")return null;
        try{
            const plan=hexPhysGroupTranslationPlan(board,pair,dir,1,"GROUP_SLOPE_TRANSLATE");
            if(!Array.isArray(plan)||plan.length!==2||!plan.every(p=>(p.tx-p.x)===dir&&(p.ty-p.y)===1))return null;
            return plan;
        }catch(_){return null;}
    }

    function fallbackPairPreview(board,pair,dir){
        const fake=pair.map(m=>({...m,ball:{...m.ball,motionGroupSize:2,rigid:true,momentumX:dir,rollDir:dir,subCellBias:dir}}));
        try{
            const plan=basePlanGroup(board,fake,true);
            if(!Array.isArray(plan)||!plan.length)return null;
            if(dir<0&&!plan.every(p=>(p.tx-p.x)<=0))return null;
            if(dir>0&&!plan.every(p=>(p.tx-p.x)>=0))return null;
            return plan;
        }catch(_){return null;}
    }

    const makePairPlan=(board,pair,dir)=>directPairPlan(board,pair,dir)||fallbackPairPreview(board,pair,dir);

    function commitPairState(pair,solo,dir){
        const gid=pair[0]?.ball?.motionGroupId||pair[1]?.ball?.motionGroupId||solo?.ball?.motionGroupId||0;
        clearOneBall(solo.ball);
        for(const m of pair){
            if(gid)m.ball.motionGroupId=gid;
            m.ball.motionGroupSize=2;m.ball.rigid=true;m.ball.momentumX=dir;m.ball.rollDir=dir;m.ball.subCellBias=dir;m.ball._upPocketRemainingPairV24=true;
        }
    }

    function capturePlan(board,g,capture,preview){
        const solo=capture.solo,pairLower=g.lower[0].ball.id===solo.ball.id?g.lower[1]:g.lower[0],pair=[g.top,pairLower],dir=pairDirection(g,solo);
        const pairPlan=makePairPlan(board,pair,dir);
        if(!Array.isArray(pairPlan)||!pairPlan.length)return null;
        const soloPlan={x:solo.x,y:solo.y,tx:capture.tx,ty:capture.ty,ball:solo.ball,kind:capture.inward<0?"ROLL_LEFT":"ROLL_RIGHT",pivot:null,topPivot:null,followSupportIds:[],bundleId:0,groupSize:0,capturedIntoPocket:true};
        if(!preview){
            commitPairState(pair,solo,dir);
            window.__sixBallLastUpInwardPocketReleaseV24={soloId:solo.ball.id,pairIds:pair.map(m=>m.ball.id),pairDirection:dir,target:[capture.tx,capture.ty],supportIds:[capture.pocket.left.id,capture.pocket.right.id],releaseOffsetX:capture.releaseOffsetX,source:capture.source,at:Date.now()};
        }
        return[...pairPlan,soloPlan];
    }

    function memberMotions(board,members){
        if(typeof hexPhysIndependentMemberMotion!=="function")return null;
        const motions=[];
        for(const m of members){try{motions.push(hexPhysIndependentMemberMotion(board,members,m));}catch(_){return null;}}
        return motions;
    }

    function hasRealCurrentPivot(board,members,motions){
        const own=ownIds(members);
        for(const p of motions||[]){
            for(const key of["pivot","topPivot"]){
                const pv=p?.[key];if(!Array.isArray(pv)||pv.length<2)continue;
                const x=Number(pv[0]),y=Number(pv[1]);if(!Number.isFinite(x)||!Number.isFinite(y))continue;
                const support=board?.[y]?.[x];if(support&&!own.has(support.id))return true;
            }
        }
        return false;
    }

    function canonicalRigidSlope(board,members,motions){
        if(typeof hexPhysRigidSlopePlan!=="function"||!motions||!hasRealCurrentPivot(board,members,motions))return null;
        let plan=null;try{plan=hexPhysRigidSlopePlan(board,members,motions);}catch(_){plan=null;}
        if(!Array.isArray(plan)||plan.length!==3)return null;
        const ids=ownIds(members),dx=plan[0].tx-plan[0].x,dy=plan[0].ty-plan[0].y;
        if(Math.abs(dx)!==1||dy!==1)return null;
        for(const p of plan){if(!p?.ball||!ids.has(p.ball.id)||p.kind!=="GROUP_SLOPE_TRANSLATE"||(p.tx-p.x)!==dx||(p.ty-p.y)!==dy)return null;}
        return plan;
    }

    function isContinuingRigidSlope(members){
        return members.every(m=>m.ball.rigid&&Number(m.ball.motionGroupSize)===3)&&members.some(m=>m.ball._smoothSlopeRigidV39||m.ball._upConvexRigidUntilImpossibleV24||m.ball._upConvexRigidUntilImpossibleV25||m.ball._upConvexRigidUntilImpossibleV26);
    }

    function keepRigidSlope(members,plan,preview,reason){
        if(!preview){
            for(const m of members){
                m.ball.rigid=true;
                m.ball.motionGroupSize=3;
                m.ball.motionGroupOrientation="up";
                m.ball._upConvexRigidUntilImpossibleV24=true;
                m.ball._upConvexRigidUntilImpossibleV25=true;
                m.ball._upConvexRigidUntilImpossibleV26=true;
            }
            const info={
                ids:members.map(m=>m.ball.id),
                vector:[plan[0].tx-plan[0].x,plan[0].ty-plan[0].y],
                reason,
                at:Date.now()
            };
            window.__sixBallLastUpConvexRigidContinuationV26=info;
            window.__sixBallLastUpConvexRigidContinuationV25=info;
        }
        return plan;
    }

    hexPhysPlanGroup=function(board,members,preview=false){
        const g=layout(members);
        if(!g)return basePlanGroup(board,members,preview)||[];

        if(
            !preview &&
            typeof window.__sixBallRememberUpConvexPreArcSideV31===
                "function"
        ){
            try{
                window.__sixBallRememberUpConvexPreArcSideV31(
                    board,
                    members
                );
            }catch(_){}
        }

        let motions=null;

        /*
         * The previous committed slope step is direct physical evidence that
         * this triplet is already descending as one body.  If the canonical
         * current-contact solver still proves another common step, a nearby
         * V-pocket is only a future release candidate and must not split the
         * body during the current fall.
         */
        if(isContinuingRigidSlope(members)){
            motions=memberMotions(board,members);
            const continuing=canonicalRigidSlope(board,members,motions);
            if(continuing)return keepRigidSlope(members,continuing,preview,"active-slope-common-step-before-pocket");
        }

        const capture=inwardPocketCapture(board,members,g);
        if(capture){const partial=capturePlan(board,g,capture,preview);if(partial)return partial;}

        let baselinePreview=[];try{baselinePreview=basePlanGroup(board,members,true)||[];}catch(_){baselinePreview=[];}
        if(isThreeBallRigidPlan(baselinePreview,members))return preview?baselinePreview:(basePlanGroup(board,members,false)||[]);

        if(!motions)motions=memberMotions(board,members);
        const rigid=canonicalRigidSlope(board,members,motions);
        if(rigid){
            return keepRigidSlope(members,rigid,preview,"current-common-slope-rescue");
        }
        return preview?baselinePreview:(basePlanGroup(board,members,false)||[]);
    };

    /* Compatibility + diagnostics used by the production guard. */
    window.__sixBallUpConvexRigidUntilContactV1=true;
    window.__sixBallUpConvexRigidUntilContactVersion="upconvex-rigidity-partial-release-v2.3";
    window.__sixBallUpConvexRigidUntilImpossibleVersion="upconvex-rigidity-partial-release-v2.3";
    window.__sixBallUpConvexRigidImplementationVersion="upconvex-rigidity-partial-release-v2.6";
    window.__sixBallUpConvexNoSyntheticRigidTranslation=true;
    window.__sixBallUpConvexRequiresRealCurrentPivot=true;
    window.__sixBallUpRestAloneDoesNotChooseSolo=true;
    window.__sixBallUpPocketCaptureHasPriority=true;
    window.__sixBallUpPocketCaptureWaitsForActiveSlopeFailure=true;
    window.__sixBallUpActiveSlopeCommonStepHasPriority=true;
    window.__sixBallUpActiveSlopeRecordsPreArcSide=true;
    window.__sixBallUpInwardPocketChoosesSolo=true;
    window.__sixBallUpContinuousPocketDisambiguation=true;
    window.__sixBallUpRemainingTwoKeepRigidity=true;
})();
