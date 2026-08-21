/* ============================================================
 * 6ball UP-CONVEX CONTACT PRIORITY v1
 *
 * Root fix:
 * a real centre protrusion must decide the 1+2 split at the
 * FIRST physical contact step, before the later v3.9 generic
 * common-slope wrapper can translate the whole triplet past the
 * protrusion and reverse the apparent left/right relationship.
 *
 * This file does not change floor landing, garbage physics,
 * ordinary smooth slopes, collapse epochs or non-UP groups.
 * ============================================================ */
(function(){
    if(
        typeof window === "undefined" ||
        window.__sixBallUpConvexContactPriorityV1
    ){
        return;
    }

    if(
        typeof hexPhysPlanGroup !== "function" ||
        typeof hexPhysUpConvexSplitPlan !== "function" ||
        typeof hexPhysIndependentMemberMotion !== "function" ||
        typeof hexPhysEmpty !== "function" ||
        typeof valid !== "function"
    ){
        return;
    }

    window.__sixBallUpConvexContactPriorityV1 = true;

    const basePlanGroup = hexPhysPlanGroup;

    function isUpTriplet(members){
        if(!Array.isArray(members) || members.length !== 3)
            return false;

        if(members.some(m => !m?.ball || m.ball.isGarbage))
            return false;

        const orientation =
            members[0]?.orientation ||
            members[0]?.ball?.motionGroupOrientation ||
            "";

        return orientation === "up";
    }

    function continuousOffset(members){
        const values = members
            .map(m => Number(m?.ball?.impactOffsetX))
            .filter(Number.isFinite)
            .map(v => Math.max(-1, Math.min(1, v)))
            .sort((a,b) => a-b);

        if(!values.length)
            return 0;

        return values[Math.floor(values.length / 2)];
    }

    function outwardSoloMotion(board, solo, direction, px, py, members){
        const tx = solo.x + direction;
        const ty = solo.y + 1;

        const ignore = new Set(
            members
                .filter(m => m.ball.id !== solo.ball.id)
                .map(m => m.ball.id)
        );

        if(
            !valid(tx,ty) ||
            !hexPhysEmpty(board, tx, ty, ignore)
        ){
            return null;
        }

        return {
            x: solo.x,
            y: solo.y,
            tx,
            ty,
            ball: solo.ball,
            kind: direction < 0 ? "ROLL_LEFT" : "ROLL_RIGHT",
            pivot: [px,py],
            topPivot: null,
            followSupportIds: []
        };
    }

    function firstContactSeparator(board, members){
        if(!isUpTriplet(members))
            return null;

        const lowerY = Math.max(...members.map(m => m.y));
        const lower = members
            .filter(m => m.y === lowerY)
            .sort((a,b) => a.x-b.x);
        const top = members.find(m => m.y < lowerY);

        if(
            lower.length !== 2 ||
            !top ||
            lower[1].x - lower[0].x !== 2
        ){
            return null;
        }

        /*
         * The physical protrusion is the real ball directly
         * under the nominal base centre. The continuous offset
         * tells us where the falling triangle actually is at
         * this exact contact step.
         */
        const px = (lower[0].x + lower[1].x) / 2;
        const py = lowerY + 1;
        const support = valid(px,py) ? board?.[py]?.[px] : null;

        if(
            !support ||
            members.some(m => m.ball.id === support.id)
        ){
            return null;
        }

        const offset = continuousOffset(members);
        const baseLeft = lower[0].x + offset;
        const baseRight = lower[1].x + offset;
        const width = baseRight - baseLeft;

        if(Math.abs(width) <= 1e-9)
            return null;

        const hitFraction = (px - baseLeft) / width;

        /* Outer-quarter contact is an ordinary slope, not a separator. */
        if(
            hitFraction < 0.25 - 1e-9 ||
            hitFraction > 0.75 + 1e-9
        ){
            return null;
        }

        const triangleCenter = (baseLeft + baseRight) / 2;
        const delta = triangleCenter - px;

        /* Exact centre keeps the existing canonical tie-break. */
        if(Math.abs(delta) <= 1e-9)
            return null;

        /*
         * protrusion RIGHT of triangle centre (delta < 0)
         *   -> LEFT pair of 2, RIGHT solo
         *
         * protrusion LEFT of triangle centre (delta > 0)
         *   -> RIGHT pair of 2, LEFT solo
         */
        const pairSide = delta > 0 ? 1 : -1;
        const pairLower = pairSide > 0 ? lower[1] : lower[0];
        const solo = pairSide > 0 ? lower[0] : lower[1];
        const soloDirection = -pairSide;

        const motions = members.map(m => {
            try{
                return hexPhysIndependentMemberMotion(board, members, m);
            }catch(_){
                return null;
            }
        });

        let soloMotion = motions[members.indexOf(solo)] || null;

        if(
            !soloMotion ||
            Math.sign(soloMotion.tx - solo.x) !== soloDirection
        ){
            soloMotion = outwardSoloMotion(
                board,
                solo,
                soloDirection,
                px,
                py,
                members
            );
        }

        if(
            !soloMotion ||
            Math.sign(soloMotion.tx - solo.x) !== soloDirection
        ){
            return null;
        }

        return {
            dir: pairSide,
            top,
            pairLower,
            solo,
            soloMotion,
            support,
            px,
            py,
            hitFraction,
            triangleCenter,
            protrusionCenter: px,
            geometryDelta: delta,
            pairSide: pairSide > 0 ? "right" : "left",
            soloSide: pairSide > 0 ? "left" : "right",
            authoritativeFirstContact: true
        };
    }

    hexPhysPlanGroup = function(board, members, preview=false){
        const separator = firstContactSeparator(board, members);

        if(separator){
            let split = null;

            try{
                split = hexPhysUpConvexSplitPlan(
                    board,
                    members,
                    separator,
                    preview
                );
            }catch(_){
                split = null;
            }

            if(Array.isArray(split) && split.length){
                if(!preview){
                    window.__sixBallLastUpConvexFirstContactDecision = {
                        triangleCenter: separator.triangleCenter,
                        protrusionCenter: separator.protrusionCenter,
                        delta: separator.geometryDelta,
                        pairSide: separator.pairSide,
                        soloSide: separator.soloSide,
                        ids: {
                            top: separator.top.ball.id,
                            pairLower: separator.pairLower.ball.id,
                            solo: separator.solo.ball.id,
                            support: separator.support.id
                        },
                        at: Date.now()
                    };
                }

                return split;
            }
        }

        return basePlanGroup(board, members, preview);
    };

    window.__sixBallUpConvexContactPriorityVersion =
        "upconvex-first-contact-priority-v1";
})();
