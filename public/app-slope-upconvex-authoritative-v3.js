/* ============================================================
 * 6ball SLOPE + UP-CONVEX AUTHORITATIVE v3
 *
 * PRIORITY
 *
 * 1. TRUE protrusion split for normal UP triangle
 * 2. Otherwise common rigid gravity / smooth slope
 * 3. Otherwise existing canonical physics
 *
 * UP-CONVEX SIDE RULE
 *
 * triangle center > protrusion center
 *      => RIGHT pair of 2, LEFT solo
 *
 * triangle center < protrusion center
 *      => LEFT pair of 2, RIGHT solo
 *
 * No momentum, bias or tie-break may override this geometry.
 * ============================================================ */
(function(){

    if(
        typeof window==="undefined" ||
        window.__sixBallSlopeUpConvexAuthoritativeV3
    ){
        return;
    }

    if(
        typeof hexPhysPlanGroup!=="function" ||
        typeof hexPhysUpConvexSeparator!=="function" ||
        typeof hexPhysUpConvexSplitPlan!=="function"
    ){
        return;
    }

    window.__sixBallSlopeUpConvexAuthoritativeV3=true;


    const previousPlanGroup=
        hexPhysPlanGroup;

    const previousSeparator=
        hexPhysUpConvexSeparator;


    function isNormalMember(m){

        return !!(
            m?.ball &&
            !m.ball.isGarbage
        );
    }


    function orientationOf(members){

        return(
            members?.[0]?.orientation ||
            members?.[0]?.ball?.motionGroupOrientation ||
            ""
        );
    }


    function isNormalGroup(
        members,
        size=null
    ){

        return !!(
            Array.isArray(members) &&
            (size===null || members.length===size) &&
            members.length>=2 &&
            members.length<=3 &&
            members.every(isNormalMember)
        );
    }


    function isUpTriplet(members){

        return(
            isNormalGroup(members,3) &&
            orientationOf(members)==="up"
        );
    }


    /*
     * The complete triplet shares one continuous horizontal
     * release offset. Do not depend only on the top member:
     * use every finite recorded offset and take the median.
     */
    function continuousOffset(members){

        const values=
            members
            .map(
                m=>
                    Number(
                        m?.ball?.impactOffsetX
                    )
            )
            .filter(
                Number.isFinite
            )
            .map(
                v=>
                    Math.max(
                        -1,
                        Math.min(1,v)
                    )
            )
            .sort(
                (a,b)=>a-b
            );


        if(!values.length)
            return 0;


        return values[
            Math.floor(
                values.length/2
            )
        ];
    }


    function geometry(
        members,
        info
    ){

        if(
            !isUpTriplet(members) ||
            !info ||
            !Number.isFinite(info.px)
        ){
            return null;
        }


        const lowerY=
            Math.max(
                ...members.map(
                    m=>m.y
                )
            );


        const lower=
            members
            .filter(
                m=>m.y===lowerY
            )
            .sort(
                (a,b)=>a.x-b.x
            );


        const top=
            members.find(
                m=>m.y<lowerY
            );


        if(
            lower.length!==2 ||
            !top
        ){
            return null;
        }


        const offset=
            continuousOffset(
                members
            );


        const leftX=
            lower[0].x+
            offset;

        const rightX=
            lower[1].x+
            offset;


        const triangleCenter=
            (
                leftX+
                rightX
            )/2;


        const protrusionCenter=
            Number(info.px);


        const delta=
            triangleCenter-
            protrusionCenter;


        return{
            lower,
            top,
            offset,
            triangleCenter,
            protrusionCenter,
            delta
        };
    }


    function outwardSoloMotion(
        board,
        solo,
        direction,
        info,
        members
    ){

        const tx=
            solo.x+
            direction;

        const ty=
            solo.y+1;


        const ignore=
            new Set(
                members
                .filter(
                    m=>
                        m.ball.id!==
                        solo.ball.id
                )
                .map(
                    m=>m.ball.id
                )
            );


        if(
            !valid(tx,ty) ||
            !hexPhysEmpty(
                board,
                tx,
                ty,
                ignore
            )
        ){
            return null;
        }


        return{
            x:solo.x,
            y:solo.y,

            tx,
            ty,

            ball:solo.ball,

            kind:
                direction<0
                    ?"ROLL_LEFT"
                    :"ROLL_RIGHT",

            pivot:[
                info.px,
                info.py
            ],

            topPivot:null,

            followSupportIds:[]
        };
    }


    /*
     * AUTHORITATIVE UP-CONVEX GEOMETRY.
     *
     * Ignore pair/solo assignment made by older wrappers.
     * Only the continuous triangle center relative to the
     * actual protruding support decides the 2+1 side.
     */
    hexPhysUpConvexSeparator=
        function(
            board,
            members,
            motions
        ){

            const base=
                previousSeparator(
                    board,
                    members,
                    motions
                );


            if(
                !base ||
                !isUpTriplet(members)
            ){
                return base;
            }


            const g=
                geometry(
                    members,
                    base
                );


            if(!g)
                return base;


            /*
             * Exact centre is intentionally left to canonical
             * behaviour because user rule only distinguishes
             * right-shift and left-shift.
             */
            if(
                Math.abs(g.delta)<=1e-9
            ){
                return base;
            }


            /*
             * Triangle RIGHT of protrusion:
             *
             *     pair = top + RIGHT lower
             *     solo = LEFT lower
             *     pair moves RIGHT
             *
             * Triangle LEFT of protrusion:
             *
             *     pair = top + LEFT lower
             *     solo = RIGHT lower
             *     pair moves LEFT
             */
            const pairSide=
                g.delta>0
                    ?1
                    :-1;


            const pairLower=
                pairSide>0
                    ?g.lower[1]
                    :g.lower[0];


            const solo=
                pairSide>0
                    ?g.lower[0]
                    :g.lower[1];


            const soloDirection=
                -pairSide;


            let soloMotion=
                motions?.[
                    members.indexOf(
                        solo
                    )
                ]||null;


            if(
                !soloMotion ||
                Math.sign(
                    soloMotion.tx-
                    solo.x
                )!==
                soloDirection
            ){

                soloMotion=
                    outwardSoloMotion(
                        board,
                        solo,
                        soloDirection,
                        base,
                        members
                    );
            }


            /*
             * If the solo path is physically impossible,
             * do not manufacture a split through an obstacle.
             */
            if(
                !soloMotion ||
                Math.sign(
                    soloMotion.tx-
                    solo.x
                )!==
                soloDirection
            ){
                return base;
            }


            const result={
                ...base,

                dir:
                    pairSide,

                top:
                    g.top,

                pairLower,

                solo,

                soloMotion,

                triangleSide:
                    pairSide>0
                        ?"right"
                        :"left",

                pairSide:
                    pairSide>0
                        ?"right"
                        :"left",

                soloSide:
                    pairSide>0
                        ?"left"
                        :"right",

                triangleCenter:
                    g.triangleCenter,

                protrusionCenter:
                    g.protrusionCenter,

                geometryDelta:
                    g.delta,

                authoritativeSide:
                    true
            };


            window.__sixBallLastUpConvexSideDecision={

                triangleCenter:
                    g.triangleCenter,

                protrusionCenter:
                    g.protrusionCenter,

                delta:
                    g.delta,

                pairSide:
                    result.pairSide,

                soloSide:
                    result.soloSide,

                ids:{
                    top:
                        g.top.ball.id,

                    pairLower:
                        pairLower.ball.id,

                    solo:
                        solo.ball.id
                },

                at:
                    Date.now()
            };


            return result;
        };


    function independentMotions(
        board,
        members
    ){

        if(
            typeof hexPhysIndependentMemberMotion!==
                "function"
        ){
            return null;
        }


        return members.map(
            m=>
                hexPhysIndependentMemberMotion(
                    board,
                    members,
                    m
                )
        );
    }


    function rigidVertical(
        board,
        members
    ){

        if(
            typeof hexPhysGroupTranslationPlan!==
                "function"
        ){
            return null;
        }


        return hexPhysGroupTranslationPlan(
            board,
            members,
            0,
            2,
            "RIGID_COMMON_FREE_FALL"
        );
    }


    function rigidSmoothSlope(
        board,
        members,
        motions
    ){

        if(
            !motions ||
            typeof hexPhysRigidSlopePlan!==
                "function"
        ){
            return null;
        }


        const plan=
            hexPhysRigidSlopePlan(
                board,
                members,
                motions
            );


        if(
            !Array.isArray(plan) ||
            plan.length!==
                members.length
        ){
            return null;
        }


        /*
         * Require common movement direction.
         * A true split is not a smooth plane.
         */
        const dx=
            plan[0].tx-
            plan[0].x;

        const dy=
            plan[0].ty-
            plan[0].y;


        if(
            !plan.every(
                p=>
                    p.tx-p.x===dx &&
                    p.ty-p.y===dy
            )
        ){
            return null;
        }


        return plan.map(
            p=>({
                ...p,

                kind:
                    "RIGID_SMOOTH_SLOPE",

                smoothSlopeRigid:
                    true,

                groupSize:
                    members.length
            })
        );
    }


    hexPhysPlanGroup=
        function(
            board,
            members,
            preview=false
        ){

            if(
                !isNormalGroup(
                    members
                )
            ){

                return previousPlanGroup(
                    board,
                    members,
                    preview
                );
            }


            const motions=
                independentMotions(
                    board,
                    members
                );


            /*
             * PRIORITY 1
             *
             * A true centre protrusion is NOT a smooth slope.
             *
             * For an UP triplet, test the physical separator
             * before the generic rigid-slope rule.
             */
            if(
                members.length===3 &&
                isUpTriplet(members) &&
                motions
            ){

                const separator=
                    hexPhysUpConvexSeparator(
                        board,
                        members,
                        motions
                    );


                if(separator){

                    const split=
                        hexPhysUpConvexSplitPlan(
                            board,
                            members,
                            separator,
                            preview
                        );


                    if(split){

                        return split;
                    }
                }
            }


            /*
             * PRIORITY 2
             *
             * If there is NO true protrusion split:
             *
             * all normal 3-ball orientations and surviving
             * 2-ball groups retain rigidity on a completely
             * smooth common trajectory.
             */
            const vertical=
                rigidVertical(
                    board,
                    members
                );


            if(
                Array.isArray(vertical) &&
                vertical.length===
                    members.length
            ){

                if(!preview){

                    for(
                        const m
                        of members
                    ){

                        m.ball.rigid=true;

                        m.ball.motionGroupSize=
                            members.length;
                    }
                }


                return vertical;
            }


            const slope=
                rigidSmoothSlope(
                    board,
                    members,
                    motions
                );


            if(
                Array.isArray(slope) &&
                slope.length===
                    members.length
            ){

                if(!preview){

                    for(
                        const m
                        of members
                    ){

                        m.ball.rigid=true;

                        m.ball.motionGroupSize=
                            members.length;
                    }


                    window.__sixBallLastRigidSmoothSlope={

                        ids:
                            members.map(
                                m=>m.ball.id
                            ),

                        size:
                            members.length,

                        orientation:
                            orientationOf(
                                members
                            ),

                        vector:[
                            slope[0].tx-
                            slope[0].x,

                            slope[0].ty-
                            slope[0].y
                        ],

                        at:
                            Date.now()
                    };
                }


                return slope;
            }


            /*
             * PRIORITY 3
             *
             * All remaining collision / pinned-member /
             * pair logic stays canonical.
             */
            return previousPlanGroup(
                board,
                members,
                preview
            );
        };


    window.__sixBallSlopeUpConvexVersion=
        "slope-upconvex-authoritative-v3";

    window.__sixBallSmoothSlopeRigid=
        true;

    window.__sixBallUpConvexProtrusionBeforeSlope=
        true;

    window.__sixBallUpConvexSideBasis=
        "triangle_center_vs_protrusion_center";

    window.__sixBallTriangleRightMeansRightPair=
        true;

    window.__sixBallTriangleLeftMeansLeftPair=
        true;

})();
