/* ============================================================
 * 6ball UP-CONVEX PROJECTED POCKET CAPTURE v1
 *
 * Physical priority for an ordinary UP triplet:
 * if exactly one LOWER member is about to move into a real V-pocket
 * formed by two stationary NORMAL pile balls, that member is the one
 * that must release from the 3-ball constraint.
 *
 * The remaining TOP + opposite LOWER member keep a 2-ball rigid pair
 * and move away from the captured member. This overrides geometric
 * protrusion-side selection only for this concrete physical event.
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

            if(
                !Number.isFinite(tx) ||
                !Number.isFinite(ty) ||
                ty <= solo.y
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
                ty
            });
        }

        return found.length === 1
            ? {...found[0],layout:g}
            : null;
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
        "up-projected-pocket-capture-v1";
    window.__sixBallUpPocketCaptureOverridesGeometricSide=true;
    window.__sixBallUpPocketCaptureNormalSupportsOnly=true;
})();
