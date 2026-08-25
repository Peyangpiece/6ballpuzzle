/* ============================================================
 * 6ball UP-CONVEX PROJECTED POCKET CAPTURE v1
 *
 * Physical priority for an ordinary UP triplet:
 * if exactly one LOWER member is about to move into a real V-pocket
 * formed by two stationary NORMAL pile balls, that member is the one
 * that must release from the 3-ball constraint.
 *
 * The remaining TOP + opposite LOWER member keep a 2-ball rigid pair
 * and move away from the captured member. Pocket detection may confirm
 * split timing, but it must never override an already selected geometric
 * side: split LEFT keeps the pair RIGHT, split RIGHT keeps the pair LEFT.
 *
 * Example from the reported clip:
 *   red lower-right -> projected into pile red/green pocket -> SOLO
 *   blue top + yellow lower-left -> rigid pair -> LEFT
 * ============================================================ */
(function(){
    if(
        typeof window === "undefined" ||
        window.__sixBallUpProjectedPocketCaptureV1
    ){
        return;
    }

    if(typeof hexPhysUpConvexSeparator !== "function")
        return;

    window.__sixBallUpProjectedPocketCaptureV1 = true;

    const baseSeparator = hexPhysUpConvexSeparator;
    const MAX_POCKET_HORIZONTAL_GRID = 1;

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

        return {top,lower};
    }

    function externalPileBall(board,x,y,own){
        if(
            typeof valid === "function" &&
            !valid(x,y)
        ){
            return null;
        }

        const q=board?.[y]?.[x] || null;
        if(
            !q ||
            q.isGarbage ||
            own.has(q.id)
        ){
            return null;
        }

        return q;
    }

    function projectedPocket(board,members,motions){
        const g=layout(members);
        if(!g || !Array.isArray(motions))
            return null;

        const own=new Set(members.map(m => m.ball.id));
        const found=[];

        for(const solo of g.lower){
            const index=members.indexOf(solo);
            const motion=motions[index];

            if(!motion)
                continue;

            const tx=Number(motion.tx);
            const ty=Number(motion.ty);
            const offset=Math.max(
                -1,
                Math.min(1,Number(solo.ball?.impactOffsetX)||0)
            );
            const continuousX=solo.x+offset;
            const distanceToPocket=Math.abs(tx-continuousX);

            if(
                !Number.isFinite(tx) ||
                !Number.isFinite(ty) ||
                ty <= solo.y ||
                distanceToPocket>MAX_POCKET_HORIZONTAL_GRID+1e-9
            ){
                continue;
            }

            const leftSupport=externalPileBall(
                board,
                tx-1,
                ty+1,
                own
            );
            const rightSupport=externalPileBall(
                board,
                tx+1,
                ty+1,
                own
            );

            if(!leftSupport || !rightSupport)
                continue;

            found.push({
                solo,
                motion,
                leftSupport,
                rightSupport,
                tx,
                ty,
                continuousX,
                distanceToPocket
            });
        }

        if(!found.length)return null;
        const ranked=[...found].sort(
            (a,b)=>a.distanceToPocket-b.distanceToPocket
        );
        if(
            ranked.length>1&&
            Math.abs(ranked[1].distanceToPocket-ranked[0].distanceToPocket)<=1e-9
        )return null;
        return{...ranked[0],layout:g};
    }

    hexPhysUpConvexSeparator=function(
        board,
        members,
        motions
    ){
        const info=baseSeparator(
            board,
            members,
            motions
        );

        if(!info)
            return info;

        const hitFraction=Number(info.hitFraction);
        if(
            !Number.isFinite(hitFraction)||
            hitFraction<=.25+1e-9||
            hitFraction>=.75-1e-9
        ){
            return info;
        }

        const capture=projectedPocket(
            board,
            members,
            motions
        );

        if(!capture)
            return info;

        const {top,lower}=capture.layout;
        const solo=capture.solo;
        const pairLower=
            lower[0].ball.id === solo.ball.id
                ? lower[1]
                : lower[0];

        const pairDir =
            solo.x > pairLower.x
                ? -1
                : 1;

        /* The wrapped separator is the authority for WHICH SIDE split. A
           projected pocket is only allowed to enrich that decision when it
           names the same solo lower ball. The old override here was able to
           invert a pre-arc LEFT/RIGHT decision in otherwise valid layouts. */
        const selectedSoloId=info?.solo?.ball?.id;
        const selectedPairLowerId=info?.pairLower?.ball?.id;
        const selectedTopId=info?.top?.ball?.id;
        const hasSelectedSide=
            selectedSoloId!=null&&
            selectedPairLowerId!=null&&
            selectedTopId!=null;

        if(
            hasSelectedSide&&
            (
                selectedSoloId!==solo.ball.id||
                selectedPairLowerId!==pairLower.ball.id||
                selectedTopId!==top.ball.id
            )
        ){
            window.__sixBallLastUpProjectedPocketConflictIgnoredV2={
                selectedSoloId,
                projectedSoloId:solo.ball.id,
                selectedPairLowerId,
                projectedPairLowerId:pairLower.ball.id,
                reason:"contact-side-is-authoritative",
                at:Date.now()
            };
            return info;
        }

        const corrected={
            ...info,
            dir:pairDir,
            top,
            pairLower,
            solo,
            soloMotion:capture.motion,
            projectedPocketCapture:true,
            projectedPocketTarget:[capture.tx,capture.ty],
            projectedPocketSupportIds:[
                capture.leftSupport.id,
                capture.rightSupport.id
            ],
            projectedPocketHorizontalDistance:capture.distanceToPocket,
            preArcSideLocked:false,
            pairSide:pairDir<0?"left":"right",
            soloSide:pairDir<0?"right":"left",
            sideDecisionSource:"projected-single-member-pocket-capture"
        };

        window.__sixBallLastUpProjectedPocketCaptureV1={
            soloId:solo.ball.id,
            pairIds:[top.ball.id,pairLower.ball.id],
            pairSide:corrected.pairSide,
            target:corrected.projectedPocketTarget,
            supportIds:corrected.projectedPocketSupportIds,
            at:Date.now()
        };

        return corrected;
    };

    window.__sixBallUpProjectedPocketCaptureVersion=
        "up-projected-pocket-capture-v3";
    window.__sixBallUpPocketCaptureOverridesGeometricSide=false;
    window.__sixBallUpPocketCaptureNeverOverridesSelectedSide=true;
    window.__sixBallUpPocketCaptureRequiresMiddleFiftyPercent=true;
    window.__sixBallUpPocketCaptureNormalSupportsOnly=true;
    window.__sixBallUpProjectedPocketChoosesNearestWithinHalfBall=true;
})();
