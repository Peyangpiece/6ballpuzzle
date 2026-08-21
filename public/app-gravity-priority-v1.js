/* ============================================================
 * 6ball GRAVITY PRIORITY PHYSICS v1
 *
 * RULES
 * ------------------------------------------------------------
 * 1. Settled/pile balls never move purely horizontally.
 * 2. Gravity is always the primary cause of motion.
 * 3. Diagonal motion is allowed only when it also descends.
 * 4. A support-loss gap may be filled by an upper ball falling
 *    diagonally downward into the newly opened space.
 * 5. Walls are collision boundaries only:
 *      no attraction
 *      no friction
 *      no virtual wall pivot
 *      no wall support count
 * 6. If two balls compete for one wall-side vacancy,
 *    one deterministic candidate wins.
 * 7. An upright ▲ triplet landing on a flat surface keeps its
 *    rigid shape. It must not deform merely because the top ball
 *    could fall when its own two members are ignored.
 * ============================================================ */
(function(){

    if(
        typeof window==="undefined" ||
        typeof hexPhysNaturalMotion!=="function"
    ){
        return;
    }

    if(
        window.__sixBallGravityPriorityVersion===
        "gravity-priority-v1"
    ){
        return;
    }


    /* ========================================================
     * SUPPORT
     *
     * Wall = occupied boundary for collision,
     * but NOT a physical lower-ball support.
     * ======================================================== */

    hexPhysSupportInfo=function(
        b,
        x,
        y,
        ignore=null
    ){

        const floor=
            touchesFloorRow(y);

        const left={
            x:x-1,
            y:y+1,
            valid:
                valid(x-1,y+1)
        };

        const right={
            x:x+1,
            y:y+1,
            valid:
                valid(x+1,y+1)
        };


        left.ball=
            left.valid
                ?b[left.y][left.x]
                :null;

        right.ball=
            right.valid
                ?b[right.y][right.x]
                :null;


        const leftReal=
            !!(
                left.valid &&
                left.ball &&
                !(ignore&&ignore.has(left.ball.id))
            );

        const rightReal=
            !!(
                right.valid &&
                right.ball &&
                !(ignore&&ignore.has(right.ball.id))
            );


        /*
         * occupied remains true outside the board so balls
         * cannot penetrate a wall.
         */
        left.occupied=
            !left.valid ||
            leftReal;

        right.occupied=
            !right.valid ||
            rightReal;


        return{
            floor,
            left,
            right,

            /*
             * IMPORTANT:
             * wall itself contributes zero support.
             */
            count:
                floor
                    ?2
                    :Number(leftReal)+
                     Number(rightReal),

            realCount:
                floor
                    ?2
                    :Number(leftReal)+
                     Number(rightReal),

            wallContact:
                !left.valid ||
                !right.valid
        };
    };


    function ignoredBall(
        ball,
        ignore
    ){
        return(
            !!ball &&
            !!ignore &&
            ignore.has(ball.id)
        );
    }


    function realBallAt(
        b,
        x,
        y,
        ignore
    ){

        if(!valid(x,y))
            return null;

        const q=b[y][x];

        if(
            !q ||
            ignoredBall(q,ignore)
        ){
            return null;
        }

        return q;
    }


    function emptyAt(
        b,
        x,
        y,
        ignore
    ){

        return(
            valid(x,y) &&
            !realBallAt(
                b,
                x,
                y,
                ignore
            )
        );
    }


    function targetSupportScore(
        b,
        x,
        y,
        ignore
    ){

        if(!valid(x,y))
            return -999;

        if(touchesFloorRow(y))
            return 100;

        const s=
            hexPhysSupportInfo(
                b,
                x,
                y,
                ignore
            );

        return s.realCount*10;
    }


    function preferredGravityDir(
        b,
        x,
        y,
        ball,
        ignore
    ){

        /*
         * Existing physical momentum wins first.
         */
        const bias=
            Math.sign(
                ball?.momentumX ||
                ball?.rollDir ||
                ball?.subCellBias ||
                0
            );

        if(bias)
            return bias;


        const ls=
            targetSupportScore(
                b,
                x-1,
                y+1,
                ignore
            );

        const rs=
            targetSupportScore(
                b,
                x+1,
                y+1,
                ignore
            );


        /*
         * Only use packing as a TIE BREAKER between two
         * already gravity-valid downward destinations.
         *
         * It never creates a horizontal move.
         */
        if(ls!==rs)
            return ls>rs?-1:1;


        /*
         * Near a wall, choose inward on a perfect tie.
         * This is not wall attraction; it merely resolves
         * simultaneous valid gravity destinations.
         */
        if(x<=1)
            return 1;

        if(x>=W2-2)
            return -1;


        /*
         * Deterministic centre tie.
         */
        return x<W2/2?1:-1;
    }


    /* ========================================================
     * NATURAL GRAVITY
     * ======================================================== */

    hexPhysNaturalMotion=function(
        b,
        x,
        y,
        ignore=null
    ){

        if(
            !valid(x,y) ||
            !b[y][x]
        ){
            return null;
        }


        const ball=
            b[y][x];


        if(
            touchesFloorRow(y) ||
            ball.garbageBubbleHold ||
            ball.garbagePhaseFrozen
        ){
            return null;
        }


        if(
            !ignore &&
            typeof ballInBalancedHexagonRing===
                "function" &&
            ballInBalancedHexagonRing(
                b,
                x,
                y
            )
        ){
            return null;
        }


        const lv=
            valid(
                x-1,
                y+1
            );

        const rv=
            valid(
                x+1,
                y+1
            );

        const dv=
            valid(
                x,
                y+2
            );


        const lb=
            realBallAt(
                b,
                x-1,
                y+1,
                ignore
            );

        const rb=
            realBallAt(
                b,
                x+1,
                y+1,
                ignore
            );

        const db=
            realBallAt(
                b,
                x,
                y+2,
                ignore
            );


        const le=
            lv&&!lb;

        const re=
            rv&&!rb;

        const de=
            dv&&!db;


        /*
         * Completely open below:
         * pure gravity straight down.
         */
        if(
            le &&
            re &&
            de
        ){
            return{
                x,
                y,

                tx:x,
                ty:y+2,

                ball,

                kind:
                    "FREE_FALL",

                pivot:null,
                topPivot:null,
                followSupportIds:[]
            };
        }


        /*
         * Actual lower-right ball:
         * gravity rolls down-left around THAT BALL.
         */
        if(
            le &&
            rb
        ){
            return{
                x,
                y,

                tx:x-1,
                ty:y+1,

                ball,

                kind:
                    "ROLL_LEFT",

                pivot:[
                    x+1,
                    y+1
                ],

                topPivot:null,
                followSupportIds:[]
            };
        }


        /*
         * Actual lower-left ball:
         * gravity rolls down-right.
         */
        if(
            re &&
            lb
        ){
            return{
                x,
                y,

                tx:x+1,
                ty:y+1,

                ball,

                kind:
                    "ROLL_RIGHT",

                pivot:[
                    x-1,
                    y+1
                ],

                topPivot:null,
                followSupportIds:[]
            };
        }


        /*
         * WALL CASE
         *
         * Never rotate around an imaginary wall ball.
         *
         * If direct-down is open, gravity remains vertical.
         */
        if(
            (!lv||!rv) &&
            de
        ){
            return{
                x,
                y,

                tx:x,
                ty:y+2,

                ball,

                kind:
                    "WALL_FREE_FALL",

                pivot:null,
                topPivot:null,
                followSupportIds:[]
            };
        }


        /*
         * At a wall where straight-down is unavailable but
         * the inward/downward lattice position is open,
         * gravity may release inward.
         *
         * NO wall pivot is used.
         */
        if(
            !lv &&
            re
        ){
            return{
                x,
                y,

                tx:x+1,
                ty:y+1,

                ball,

                kind:
                    "WALL_GRAVITY_RELEASE",

                pivot:null,
                topPivot:null,
                followSupportIds:[]
            };
        }


        if(
            !rv &&
            le
        ){
            return{
                x,
                y,

                tx:x-1,
                ty:y+1,

                ball,

                kind:
                    "WALL_GRAVITY_RELEASE",

                pivot:null,
                topPivot:null,
                followSupportIds:[]
            };
        }


        /*
         * Symmetric fork over a REAL direct support.
         *
         * Both possible moves still descend under gravity.
         * Pick only one destination deterministically.
         */
        if(
            le &&
            re &&
            db
        ){

            const dir=
                preferredGravityDir(
                    b,
                    x,
                    y,
                    ball,
                    ignore
                );


            const tx=
                x+dir;

            if(
                emptyAt(
                    b,
                    tx,
                    y+1,
                    ignore
                )
            ){
                return{
                    x,
                    y,

                    tx,
                    ty:y+1,

                    ball,

                    kind:
                        dir<0
                            ?"ROLL_LEFT"
                            :"ROLL_RIGHT",

                    pivot:null,

                    topPivot:[
                        x,
                        y+2
                    ],

                    followSupportIds:[]
                };
            }


            const alt=
                x-dir;

            if(
                emptyAt(
                    b,
                    alt,
                    y+1,
                    ignore
                )
            ){
                return{
                    x,
                    y,

                    tx:alt,
                    ty:y+1,

                    ball,

                    kind:
                        -dir<0
                            ?"ROLL_LEFT"
                            :"ROLL_RIGHT",

                    pivot:null,

                    topPivot:[
                        x,
                        y+2
                    ],

                    followSupportIds:[]
                };
            }
        }


        /*
         * Bottom parity:
         * there is no y+2 cell, but a diagonal-down floor
         * destination is still gravity.
         */
        if(
            le &&
            re &&
            !dv
        ){

            const dir=
                preferredGravityDir(
                    b,
                    x,
                    y,
                    ball,
                    ignore
                );


            if(
                emptyAt(
                    b,
                    x+dir,
                    y+1,
                    ignore
                )
            ){
                return{
                    x,
                    y,

                    tx:x+dir,
                    ty:y+1,

                    ball,

                    kind:
                        "FLOOR_GRAVITY_DROP",

                    pivot:null,
                    topPivot:null,
                    followSupportIds:[]
                };
            }


            if(
                emptyAt(
                    b,
                    x-dir,
                    y+1,
                    ignore
                )
            ){
                return{
                    x,
                    y,

                    tx:x-dir,
                    ty:y+1,

                    ball,

                    kind:
                        "FLOOR_GRAVITY_DROP",

                    pivot:null,
                    topPivot:null,
                    followSupportIds:[]
                };
            }
        }


        return null;
    };


    /* ========================================================
     * SUPPORT-LOSS GAP FILL
     *
     * This is the ONLY explicit gap-fill behaviour:
     *
     * If one of two real lower supports moves away, the upper
     * ball may FALL DOWN into the newly opened side while
     * remaining tangent to the stationary support.
     *
     * There is never a same-row sideways move.
     * ======================================================== */

    hexPhysContactEntries=function(
        b,
        excluded=new Set()
    ){

        const blocked=
            new Set(
                excluded||[]
            );

        const entries=[];
        const byId=
            new Map();


        for(
            let y=ROWS-1;
            y>=boardScanMin(b);
            y--
        ){
            for(
                let x=0;
                x<W2;
                x++
            ){

                const ball=
                    valid(x,y)
                        ?b[y][x]
                        :null;

                if(
                    !ball ||
                    blocked.has(ball.id)
                ){
                    continue;
                }


                const support=
                    hexPhysSupportInfo(
                        b,
                        x,
                        y
                    );


                const e={
                    x,
                    y,
                    ball,
                    support,

                    p:
                        hexPhysNaturalMotion(
                            b,
                            x,
                            y
                        )
                };


                entries.push(e);
                byId.set(
                    ball.id,
                    e
                );
            }
        }


        for(
            let guard=0;
            guard<ROWS*2+4;
            guard++
        ){

            let changed=false;


            for(const e of entries){

                /*
                 * ONLY ACTUAL BALLS are supports.
                 * The wall is excluded here.
                 */
                const supports=[
                    e.support.left,
                    e.support.right
                ].filter(
                    s=>
                        s.valid &&
                        s.ball &&
                        !blocked.has(
                            s.ball.id
                        )
                );


                const moving=
                    supports
                    .map(
                        s=>
                            byId.get(
                                s.ball.id
                            )
                    )
                    .filter(
                        q=>q?.p
                    );


                let next=e.p;


                /*
                 * Entire real support set moves together:
                 * the upper ball follows DOWNWARD with it.
                 */
                if(
                    supports.length &&
                    moving.length===
                        supports.length
                ){

                    const f=
                        moving[0].p;


                    if(
                        moving.every(
                            q=>
                                sameMoveVector(
                                    f,
                                    q.p
                                )
                        )
                    ){

                        const dx=
                            f.tx-f.x;

                        const dy=
                            f.ty-f.y;


                        if(
                            dy>0 &&
                            valid(
                                e.x+dx,
                                e.y+dy
                            )
                        ){
                            next={
                                x:e.x,
                                y:e.y,

                                tx:e.x+dx,
                                ty:e.y+dy,

                                ball:e.ball,

                                kind:
                                    "FOLLOW_SUPPORT",

                                pivot:null,
                                topPivot:null,

                                followProposal:f,

                                followSupportIds:
                                    moving.map(
                                        q=>q.ball.id
                                    )
                            };
                        }
                    }

                /*
                 * Exactly one of two supports moved.
                 *
                 * This is the requested:
                 * "隙間に押し出すように上の球が下に移動"
                 */
                }else if(
                    supports.length===2 &&
                    moving.length===1
                ){

                    const stationary=
                        supports.find(
                            s=>
                                s.ball.id!==
                                moving[0].ball.id
                        );


                    if(stationary){

                        const dir=
                            stationary.x<e.x
                                ?1
                                :-1;


                        const tx=
                            e.x+dir;

                        const ty=
                            e.y+1;


                        if(
                            emptyAt(
                                b,
                                tx,
                                ty,
                                blocked
                            )
                        ){

                            next={
                                x:e.x,
                                y:e.y,

                                tx,
                                ty,

                                ball:e.ball,

                                kind:
                                    "GRAVITY_GAP_FILL",

                                pivot:[
                                    stationary.x,
                                    stationary.y
                                ],

                                topPivot:null,

                                followSupportIds:[],

                                gravityGapFill:true
                            };
                        }
                    }
                }


                /*
                 * Absolute invariant:
                 * pile physics may never create a pure
                 * horizontal move.
                 */
                if(
                    next &&
                    (
                        next.ty<=next.y
                    )
                ){
                    next=null;
                }


                if(
                    proposalSignature(next)!==
                        proposalSignature(e.p) ||
                    (
                        next?.followSupportIds
                            ?.join(",")||""
                    )!==
                    (
                        e.p?.followSupportIds
                            ?.join(",")||""
                    )
                ){
                    e.p=next;
                    changed=true;
                }
            }


            if(!changed)
                break;
        }


        return entries
            .filter(e=>e.p)
            .map(e=>e.p);
    };


    /* ========================================================
     * UPRIGHT ▲ FLAT LANDING
     * ======================================================== */

    const previousPlanGroup=
        hexPhysPlanGroup;


    function isUpTriplet(
        members
    ){

        return(
            Array.isArray(members) &&
            members.length===3 &&
            (
                members[0]?.orientation ||
                members[0]?.ball
                    ?.motionGroupOrientation
            )==="up"
        );
    }


    function flatUpLanding(
        b,
        members
    ){

        if(!isUpTriplet(members))
            return false;


        const lowerY=
            Math.max(
                ...members.map(
                    m=>m.y
                )
            );


        const lower=
            members.filter(
                m=>m.y===lowerY
            );


        const top=
            members.find(
                m=>m.y<lowerY
            );


        if(
            lower.length!==2 ||
            !top
        ){
            return false;
        }


        /*
         * FLOOR:
         * both lower members are on the same physical floor.
         */
        if(
            lower.every(
                m=>touchesFloorRow(m.y)
            )
        ){
            return true;
        }


        /*
         * A "flat pile surface" means BOTH lower members are
         * independently supported by TWO REAL balls beneath.
         *
         * Merely being unable to move is NOT enough.
         * This prevents slopes / arches / wall booking from
         * being misclassified as a flat surface.
         */
        const own=
            new Set(
                members.map(
                    m=>m.ball.id
                )
            );


        const realSupports=(m)=>{

            let count=0;

            for(const dx of[-1,1]){

                const sx=m.x+dx;
                const sy=m.y+1;

                if(!valid(sx,sy))
                    continue;

                const q=b[sy][sx];

                if(
                    q &&
                    !own.has(q.id)
                ){
                    count++;
                }
            }

            return count;
        };


        return lower.every(
            m=>realSupports(m)>=2
        );
    }

    hexPhysPlanGroup=function(
        b,
        members,
        preview=false
    ){

        if(
            flatUpLanding(
                b,
                members
            )
        ){

            /*
             * Keep all three members rigid for this landing.
             * No 2+1 deformation.
             */
            window.__sixBallLastFlatUpHold={
                ids:
                    members.map(
                        m=>m.ball.id
                    ),
                at:Date.now()
            };

            return[];
        }


        return previousPlanGroup(
            b,
            members,
            preview
        );
    };


    /* ========================================================
     * DETERMINISTIC WALL BOOKING
     *
     * Existing event resolution already accepts only one bundle
     * when two targets conflict.
     *
     * We only make the candidate ordering explicit so a wall
     * conflict is deterministic.
     * ======================================================== */

    hexPhysCandidateBundles=function(
        proposals
    ){

        const mp=
            new Map();


        for(const p of proposals){

            const k=
                hexPhysBundleKey(p);

            if(!mp.has(k))
                mp.set(k,[]);

            mp.get(k).push(p);
        }


        function wallTie(
            bundle
        ){

            const tx=
                bundle.reduce(
                    (n,p)=>n+p.tx,
                    0
                )/
                bundle.length;


            if(tx<=1){

                return Math.min(
                    ...bundle.map(
                        p=>p.x
                    )
                );
            }


            if(tx>=W2-2){

                return -Math.max(
                    ...bundle.map(
                        p=>p.x
                    )
                );
            }


            return 0;
        }


        return[
            ...mp.values()
        ].sort(
            (a,b)=>{

                const ay=
                    Math.max(
                        ...a.map(
                            p=>p.y
                        )
                    );

                const by=
                    Math.max(
                        ...b.map(
                            p=>p.y
                        )
                    );


                /*
                 * Lower balls resolve first.
                 */
                if(ay!==by)
                    return by-ay;


                const ad=
                    Math.max(
                        ...a.map(
                            p=>p.ty-p.y
                        )
                    );

                const bd=
                    Math.max(
                        ...b.map(
                            p=>p.ty-p.y
                        )
                    );


                /*
                 * Prefer the stronger downward gravity move.
                 */
                if(ad!==bd)
                    return bd-ad;


                const aw=
                    wallTie(a);

                const bw=
                    wallTie(b);


                if(aw!==bw)
                    return aw-bw;


                const al=
                    a.reduce(
                        (n,p)=>
                            n+
                            Math.abs(
                                p.tx-p.x
                            ),
                        0
                    );

                const bl=
                    b.reduce(
                        (n,p)=>
                            n+
                            Math.abs(
                                p.tx-p.x
                            ),
                        0
                    );


                /*
                 * On an otherwise equal gravity path,
                 * less lateral displacement wins.
                 */
                if(al!==bl)
                    return al-bl;


                return(
                    Math.min(
                        ...a.map(
                            p=>p.x
                        )
                    )-
                    Math.min(
                        ...b.map(
                            p=>p.x
                        )
                    )
                );
            }
        );
    };


    /* ========================================================
     * FINAL SAFETY FILTER
     *
     * Even if an older wall-gap compatibility layer tries to
     * generate a horizontal pressure push, it is rejected here.
     * ======================================================== */

    const previousResolveEvent=
        hexPhysResolveEvent;


    hexPhysResolveEvent=function(
        b,
        preview=false
    ){

        const accepted=
            previousResolveEvent(
                b,
                preview
            )||[];


        if(!accepted.length)
            return accepted;


        const groups=
            new Map();


        for(const p of accepted){

            const key=
                p.bundleId
                    ?"g:"+p.bundleId
                    :"b:"+p.ball.id;

            if(!groups.has(key))
                groups.set(key,[]);

            groups.get(key).push(p);
        }


        const out=[];


        for(
            const bundle
            of groups.values()
        ){

            /*
             * Every member of a physical bundle must move
             * DOWNWARD.
             *
             * ty === y  -> forbidden sideways slide
             * ty < y    -> forbidden upward correction
             */
            const legal=
                bundle.every(
                    p=>
                        Number.isFinite(p.ty) &&
                        Number.isFinite(p.y) &&
                        p.ty>p.y
                );


            if(!legal){

                window.__sixBallRejectedSidewaysMotion=
                    (
                        window
                        .__sixBallRejectedSidewaysMotion||
                        0
                    )+
                    bundle.length;

                continue;
            }


            out.push(...bundle);
        }


        if(preview)
            return out.slice(0,1);


        return out;
    };


    window.__sixBallGravityPriorityVersion=
        "gravity-priority-v1";

    window.__sixBallPureHorizontalPileMotion=
        false;

    window.__sixBallWallActsAsSupport=
        false;

    window.__sixBallUpTriangleFlatDeforms=
        false;

})();

/* ============================================================
 * 6ball GRAVITY PRIORITY PHYSICS v2
 *
 * Fixes:
 * - never freeze unsupported arches with equilibriumLocked
 * - retry alternate DOWNWARD paths when the first route is
 *   blocked by another moving/stationary ball
 * - never reintroduce pure horizontal pile movement
 * ============================================================ */
(function(){

    if(
        typeof window==="undefined" ||
        window.__sixBallGravityPriorityV2
    ){
        return;
    }

    window.__sixBallGravityPriorityV2=true;


    /* ========================================================
     * NO PERMANENT GAP LOCK
     * ======================================================== */

    function clearAllGapLocks(b){

        for(
            let y=boardScanMin(b);
            y<ROWS;
            y++
        ){
            for(let x=0;x<W2;x++){

                const ball=
                    valid(x,y)
                        ?b[y][x]
                        :null;

                if(ball){
                    delete ball.equilibriumLocked;
                }
            }
        }
    }


    clearBoardEquilibriumLocks=function(b){

        clearAllGapLocks(b);
    };


    /*
     * Previously this function converted an unresolved gap
     * into a permanent "balanced arch".
     *
     * That is exactly what produced the circled screenshots.
     */
    markCollisionBalancedGaps=function(b){

        clearAllGapLocks(b);

        window.__sixBallPreventedArchLocks=
            (
                window.__sixBallPreventedArchLocks||
                0
            )+1;

        return 0;
    };


    /* ========================================================
     * STRICT UNSUPPORTED TEST
     * ======================================================== */

    unstableFrozenBalls=function(b){

        const out=[];


        for(
            let y=boardScanMin(b);
            y<ROWS;
            y++
        ){
            for(let x=0;x<W2;x++){

                if(!valid(x,y))
                    continue;


                const ball=b[y][x];

                if(!ball)
                    continue;


                if(
                    touchesFloorRow(y) ||
                    ball.garbageBubbleHold
                ){
                    continue;
                }


                /*
                 * Intentional HEXAGON centre remains legal.
                 */
                if(
                    typeof ballInBalancedHexagonRing===
                        "function" &&
                    ballInBalancedHexagonRing(
                        b,
                        x,
                        y
                    )
                ){
                    continue;
                }


                const s=
                    hexPhysSupportInfo(
                        b,
                        x,
                        y
                    );


                const supportCount=
                    Number.isFinite(s.realCount)
                        ?s.realCount
                        :s.count;


                /*
                 * One real ball or zero real balls is NOT
                 * considered settled.
                 *
                 * Do not exclude equilibriumLocked balls.
                 */
                if(supportCount<2){

                    out.push({
                        x,
                        y,
                        id:ball.id,
                        contacts:supportCount
                    });
                }
            }
        }


        return out;
    };


    boardHasIllegalFloat=function(b){

        return unstableFrozenBalls(b).length>0;
    };


    /* ========================================================
     * ALTERNATE DOWNWARD GRAVITY RESCUE
     *
     * Normal resolver gets first chance.
     *
     * Only if it finds ZERO legal moves do we inspect a ball
     * that is still insufficiently supported and try another
     * DOWNWARD path.
     *
     * No same-row target can ever be generated here.
     * ======================================================== */

    const baseResolveEvent=
        hexPhysResolveEvent;


    function realBall(
        b,
        x,
        y
    ){

        if(!valid(x,y))
            return null;

        return b[y][x]||null;
    }


    function emptyCell(
        b,
        x,
        y
    ){

        return(
            valid(x,y) &&
            !b[y][x]
        );
    }


    function targetSupportCount(
        b,
        x,
        y
    ){

        if(touchesFloorRow(y))
            return 2;

        const s=
            hexPhysSupportInfo(
                b,
                x,
                y
            );

        return Number.isFinite(
            s.realCount
        )
            ?s.realCount
            :s.count;
    }


    function rescueCandidates(
        b,
        x,
        y,
        ball
    ){

        const out=[];


        /*
         * Never independently deform an existing rigid group.
         * The group resolver remains responsible for it.
         */
        if(ball.motionGroupId)
            return out;


        /*
         * 1. Straight gravity.
         */
        if(
            emptyCell(
                b,
                x,
                y+2
            )
        ){

            out.push({
                x,
                y,

                tx:x,
                ty:y+2,

                ball,

                kind:
                    "GRAVITY_RESCUE_FALL",

                pivot:null,
                topPivot:null,
                followSupportIds:[],

                rescueRank:0
            });
        }


        /*
         * 2. Down-left / down-right.
         *
         * Prefer rotation around a REAL support when possible.
         */
        for(const dir of[-1,1]){

            const tx=x+dir;
            const ty=y+1;

            if(
                !emptyCell(
                    b,
                    tx,
                    ty
                )
            ){
                continue;
            }


            const opposite=
                realBall(
                    b,
                    x-dir,
                    y+1
                );


            const direct=
                realBall(
                    b,
                    x,
                    y+2
                );


            let pivot=null;
            let topPivot=null;
            let rank=3;


            if(opposite){

                pivot=[
                    x-dir,
                    y+1
                ];

                rank=1;

            }else if(direct){

                topPivot=[
                    x,
                    y+2
                ];

                rank=2;
            }


            out.push({
                x,
                y,

                tx,
                ty,

                ball,

                kind:
                    dir<0
                        ?"GRAVITY_RESCUE_LEFT"
                        :"GRAVITY_RESCUE_RIGHT",

                pivot,
                topPivot,

                followSupportIds:[],

                rescueRank:rank,

                rescueDir:dir
            });
        }


        const movingIds=
            new Set([
                ball.id
            ]);


        const safe=
            out.filter(p=>{

                /*
                 * Absolute rule:
                 * rescue must still move downward.
                 */
                if(p.ty<=p.y)
                    return false;


                if(
                    typeof hexPhysPathHitsStationary===
                        "function" &&
                    hexPhysPathHitsStationary(
                        p,
                        b,
                        movingIds
                    )
                ){
                    return false;
                }


                return true;
            });


        const bias=
            Math.sign(
                ball.momentumX ||
                ball.rollDir ||
                ball.subCellBias ||
                0
            );


        safe.sort((a,z)=>{

            /*
             * Pure vertical gravity first.
             */
            if(a.rescueRank!==z.rescueRank)
                return a.rescueRank-z.rescueRank;


            /*
             * Prefer a destination that will have more
             * REAL support after arriving.
             */
            const as=
                targetSupportCount(
                    b,
                    a.tx,
                    a.ty
                );

            const zs=
                targetSupportCount(
                    b,
                    z.tx,
                    z.ty
                );


            if(as!==zs)
                return zs-as;


            /*
             * Existing physical momentum only breaks a tie.
             */
            if(
                bias &&
                a.rescueDir!==z.rescueDir
            ){

                if(a.rescueDir===bias)
                    return -1;

                if(z.rescueDir===bias)
                    return 1;
            }


            /*
             * Wall booking:
             * if two routes remain equivalent, choose one
             * deterministically rather than moving both.
             */
            if(x<=1){

                if(a.tx!==z.tx)
                    return z.tx-a.tx;

            }else if(x>=W2-2){

                if(a.tx!==z.tx)
                    return a.tx-z.tx;
            }


            /*
             * Smaller lateral displacement wins.
             */
            const ad=
                Math.abs(
                    a.tx-a.x
                );

            const zd=
                Math.abs(
                    z.tx-z.x
                );


            if(ad!==zd)
                return ad-zd;


            return a.tx-z.tx;
        });


        return safe;
    }


    function findGravityRescue(b){

        /*
         * Resolve the LOWEST unsupported ball first.
         * This prevents an upper ball being pushed through
         * a lower ball that should have moved first.
         */
        for(
            let y=ROWS-2;
            y>=boardScanMin(b);
            y--
        ){
            for(let x=0;x<W2;x++){

                if(!valid(x,y))
                    continue;


                const ball=b[y][x];

                if(
                    !ball ||
                    ball.garbageBubbleHold
                ){
                    continue;
                }


                if(
                    typeof ballInBalancedHexagonRing===
                        "function" &&
                    ballInBalancedHexagonRing(
                        b,
                        x,
                        y
                    )
                ){
                    continue;
                }


                const support=
                    hexPhysSupportInfo(
                        b,
                        x,
                        y
                    );


                const count=
                    Number.isFinite(
                        support.realCount
                    )
                        ?support.realCount
                        :support.count;


                if(count>=2)
                    continue;


                const candidates=
                    rescueCandidates(
                        b,
                        x,
                        y,
                        ball
                    );


                if(candidates.length){

                    return candidates[0];
                }
            }
        }


        return null;
    }


    hexPhysResolveEvent=function(
        b,
        preview=false
    ){

        clearAllGapLocks(b);


        const normal=
            baseResolveEvent(
                b,
                preview
            )||[];


        if(normal.length)
            return normal;


        const rescue=
            findGravityRescue(b);


        if(!rescue)
            return[];


        window.__sixBallGravityRescueCount=
            (
                window.__sixBallGravityRescueCount||
                0
            )+1;


        return[rescue];
    };


    window.__sixBallGravityPriorityVersion=
        "gravity-priority-v2";

    window.__sixBallBalancedArchLockAllowed=
        false;

})();

/* ============================================================
 * 6ball RIGID RELEASE v3
 *
 * A rigid triplet is preserved only while all members can
 * continue one common rigid-body motion.
 *
 * If the rigid body itself has no legal continuation but at
 * least one member has a genuine DOWNWARD gravity route, that
 * is a physical constraint event and rigidity is released.
 *
 * Pure horizontal movement remains forbidden.
 * ============================================================ */
(function(){

    if(
        typeof window==="undefined" ||
        window.__sixBallRigidReleaseV3
    ){
        return;
    }

    window.__sixBallRigidReleaseV3=true;


    const baseResolveEvent=
        hexPhysResolveEvent;


    /* --------------------------------------------------------
     * TRUE flat ▲ detection
     * -------------------------------------------------------- */

    function isUpTriplet(members){

        return(
            Array.isArray(members) &&
            members.length===3 &&
            (
                members[0]?.orientation ||
                members[0]?.ball
                    ?.motionGroupOrientation
            )==="up"
        );
    }


    function realExternalSupportCount(
        b,
        m,
        ownIds
    ){

        let n=0;

        for(const dx of[-1,1]){

            const x=m.x+dx;
            const y=m.y+1;

            if(!valid(x,y))
                continue;

            const q=b[y][x];

            if(
                q &&
                !ownIds.has(q.id)
            ){
                n++;
            }
        }

        return n;
    }


    function trueFlatUpLanding(
        b,
        members
    ){

        if(!isUpTriplet(members))
            return false;


        const lowerY=
            Math.max(
                ...members.map(
                    m=>m.y
                )
            );


        const lower=
            members.filter(
                m=>m.y===lowerY
            );


        if(lower.length!==2)
            return false;


        /*
         * Physical floor.
         */
        if(
            lower.every(
                m=>touchesFloorRow(m.y)
            )
        ){
            return true;
        }


        const ownIds=
            new Set(
                members.map(
                    m=>m.ball.id
                )
            );


        /*
         * Genuine flat pile:
         * both lower balls independently sit on TWO real
         * external balls.
         */
        return lower.every(
            m=>
                realExternalSupportCount(
                    b,
                    m,
                    ownIds
                )>=2
        );
    }


    /* --------------------------------------------------------
     * Find downward movement available after breaking rigidity.
     * -------------------------------------------------------- */

    function independentDownMoves(
        b,
        members
    ){

        const ownIds=
            new Set(
                members.map(
                    m=>m.ball.id
                )
            );


        const motionById=
            new Map();


        for(const m of members){

            const p=
                hexPhysIndependentMemberMotion(
                    b,
                    members,
                    m
                );

            motionById.set(
                m.ball.id,
                p
            );
        }


        const out=[];


        for(const m of members){

            const p=
                motionById.get(
                    m.ball.id
                );


            if(!p)
                continue;


            /*
             * Absolute rule:
             * after rigidity breaks, the ball must still move
             * DOWNWARD. Never sideways.
             */
            if(
                !Number.isFinite(p.ty) ||
                p.ty<=p.y
            ){
                continue;
            }


            if(
                !valid(
                    p.tx,
                    p.ty
                )
            ){
                continue;
            }


            const target=
                b[p.ty][p.tx];


            if(target){

                /*
                 * A member of the same group may occupy the
                 * destination only if it is itself moving away.
                 */
                if(!ownIds.has(target.id))
                    continue;


                const targetMotion=
                    motionById.get(
                        target.id
                    );


                if(
                    !targetMotion ||
                    targetMotion.ty<=targetMotion.y
                ){
                    continue;
                }
            }


            /*
             * Ignore the old group members for the sweep test;
             * they are being released in the same physical
             * event. External balls still block the path.
             */
            if(
                typeof hexPhysPathHitsStationary===
                    "function" &&
                hexPhysPathHitsStationary(
                    p,
                    b,
                    ownIds
                )
            ){
                continue;
            }


            out.push({
                ...p,

                bundleId:0,
                groupSize:0,

                rigidRelease:true
            });
        }


        /*
         * Prefer the strongest gravity direction.
         *
         * Straight down before diagonal down.
         */
        out.sort((a,z)=>{

            const ah=
                Math.abs(
                    a.tx-a.x
                );

            const zh=
                Math.abs(
                    z.tx-z.x
                );


            if(ah!==zh)
                return ah-zh;


            const ad=
                a.ty-a.y;

            const zd=
                z.ty-z.y;


            if(ad!==zd)
                return zd-ad;


            /*
             * Lowest ball first.
             */
            if(a.y!==z.y)
                return z.y-a.y;


            return a.x-z.x;
        });


        return out;
    }


    function findBrokenRigidGroup(b){

        const groups=
            hexPhysGroups(b);


        for(const members of groups.values()){

            if(
                !Array.isArray(members) ||
                members.length<2 ||
                members.length>3
            ){
                continue;
            }


            /*
             * ▲ on a genuine flat surface is the explicit
             * exception: retain its shape.
             */
            if(
                trueFlatUpLanding(
                    b,
                    members
                )
            ){
                continue;
            }


            /*
             * First ask the normal rigid solver.
             *
             * If it has a common rigid continuation, keep the
             * group exactly as it is.
             */
            const rigidPlan=
                hexPhysPlanGroup(
                    b,
                    members,
                    true
                );


            if(
                Array.isArray(rigidPlan) &&
                rigidPlan.length
            ){
                continue;
            }


            /*
             * No common rigid movement exists.
             * Now test individual gravity.
             */
            const moves=
                independentDownMoves(
                    b,
                    members
                );


            if(!moves.length)
                continue;


            return{
                members,
                moves
            };
        }


        return null;
    }


    /* --------------------------------------------------------
     * Resolver
     * -------------------------------------------------------- */

    hexPhysResolveEvent=function(
        b,
        preview=false
    ){

        /*
         * Existing physics always gets first priority.
         */
        const normal=
            baseResolveEvent(
                b,
                preview
            )||[];


        if(normal.length)
            return normal;


        const broken=
            findBrokenRigidGroup(b);


        if(!broken)
            return[];


        /*
         * hasLegalGravityMove() uses preview.
         *
         * Report that a valid downward event exists without
         * mutating group metadata yet.
         */
        if(preview){

            return[
                broken.moves[0]
            ];
        }


        /*
         * This is the physical event at which the former rigid
         * body can no longer continue.
         *
         * Release the constraint NOW.
         */
        for(const m of broken.members){

            hexPhysClearGroupBall(
                m.ball
            );

            delete m.ball.equilibriumLocked;
        }


        window.__sixBallRigidReleaseCount=
            (
                window.__sixBallRigidReleaseCount||
                0
            )+1;


        window.__sixBallLastRigidRelease={
            ids:
                broken.members.map(
                    m=>m.ball.id
                ),

            candidates:
                broken.moves.map(
                    p=>({
                        id:p.ball.id,
                        from:[
                            p.x,
                            p.y
                        ],
                        to:[
                            p.tx,
                            p.ty
                        ]
                    })
                ),

            at:
                Date.now()
        };


        /*
         * Re-run the complete normal resolver AFTER releasing
         * the group.
         *
         * Collision ordering, wall booking and simultaneous
         * motion safety are therefore still handled by the
         * canonical resolver.
         */
        const released=
            baseResolveEvent(
                b,
                false
            )||[];


        /*
         * Safety net:
         * every accepted move must still descend.
         */
        return released.filter(
            p=>p.ty>p.y
        );
    };


    window.__sixBallRigidReleaseVersion=
        "rigid-release-v3";

    window.__sixBallRigidReleaseRequiresGravity=
        true;

})();

/* ============================================================
 * 6ball WALL FREEZE FIX v4
 *
 * Prevents:
 * SETTLE -> CHECK -> SETTLE infinite loop
 * when a wall-adjacent ball has <2 real supports but has
 * absolutely no collision-safe DOWNWARD gravity path.
 *
 * Wall still:
 * - does NOT count as a ball support
 * - has no attraction
 * - has no friction
 * - never causes horizontal compaction
 * ============================================================ */
(function(){

    if(
        typeof window==="undefined" ||
        window.__sixBallWallFreezeFixV4
    ){
        return;
    }

    window.__sixBallWallFreezeFixV4=true;


    function wallSideAt(x,y){

        if(!valid(x,y))
            return 0;

        const left=
            (y&1)
                ?0
                :1;

        const right=
            (y&1)
                ?W2-1
                :W2-2;

        if(x===left)
            return -1;

        if(x===right)
            return 1;

        return 0;
    }


    /*
     * Ask the CURRENT complete resolver whether any real
     * downward motion exists.
     *
     * This includes:
     * - normal gravity
     * - diagonal roll
     * - support-loss fall
     * - rigid release v3
     * - gravity rescue v2
     */
    function boardHasActualDownwardMove(b){

        const p=
            hexPhysResolveEvent(
                b,
                true
            )||[];

        return p.some(
            q=>
                q &&
                Number.isFinite(q.y) &&
                Number.isFinite(q.ty) &&
                q.ty>q.y
        );
    }


    /*
     * A ball may have only one REAL lower ball while touching
     * the side boundary.
     *
     * The wall is NOT counted as another support.
     *
     * But if every possible downward route is physically
     * blocked, repeatedly calling it an illegal float causes
     * an infinite resolver loop.
     */
    unstableFrozenBalls=function(b){

        const unsupported=[];


        for(
            let y=boardScanMin(b);
            y<ROWS;
            y++
        ){
            for(let x=0;x<W2;x++){

                if(!valid(x,y))
                    continue;


                const ball=b[y][x];

                if(!ball)
                    continue;


                if(
                    touchesFloorRow(y) ||
                    ball.garbageBubbleHold
                ){
                    continue;
                }


                if(
                    typeof ballInBalancedHexagonRing===
                        "function" &&
                    ballInBalancedHexagonRing(
                        b,
                        x,
                        y
                    )
                ){
                    continue;
                }


                const s=
                    hexPhysSupportInfo(
                        b,
                        x,
                        y
                    );


                const realCount=
                    Number.isFinite(
                        s.realCount
                    )
                        ?s.realCount
                        :s.count;


                if(realCount>=2)
                    continue;


                unsupported.push({
                    x,
                    y,
                    id:ball.id,
                    contacts:realCount,
                    wall:
                        wallSideAt(
                            x,
                            y
                        )
                });
            }
        }


        return unsupported;
    };


    boardHasIllegalFloat=function(b){

        const unsupported=
            unstableFrozenBalls(b);


        if(!unsupported.length)
            return false;


        /*
         * If the complete physics resolver can still find an
         * actual downward event, SETTLE must continue.
         */
        if(
            boardHasActualDownwardMove(b)
        ){
            return true;
        }


        /*
         * No downward event exists.
         *
         * Do NOT manufacture a sideways move and do NOT enter
         * an infinite SETTLE loop.
         *
         * This is especially important at a frictionless wall:
         * the boundary can geometrically block the remaining
         * direction even though it is not counted as a ball
         * support.
         */
        window.__sixBallBlockedStableCount=
            (
                window.__sixBallBlockedStableCount||
                0
            )+unsupported.length;


        window.__sixBallLastBlockedStable=
            unsupported.map(
                q=>({
                    x:q.x,
                    y:q.y,
                    id:q.id,
                    wall:q.wall,
                    supports:q.contacts
                })
            );


        return false;
    };


    /*
     * Keep the old arch-lock mechanism disabled.
     */
    markCollisionBalancedGaps=function(b){

        if(
            typeof clearBoardEquilibriumLocks===
                "function"
        ){
            clearBoardEquilibriumLocks(b);
        }

        return 0;
    };


    window.__sixBallGravityPriorityVersion=
        "gravity-priority-v4-wall-freeze";

    window.__sixBallWallInfiniteSettleAllowed=
        false;

})();

/* ============================================================
 * 6ball SETTLE PROGRESS INVARIANT v5
 *
 * Absolute invariant:
 *
 * preview says MOVE
 *        ↓
 * commit MUST produce physical progress
 *
 * Progress means:
 * 1. at least one ball moves downward
 * OR
 * 2. an obsolete rigid constraint is released
 *
 * Never:
 * - pure horizontal pile movement
 * - endless SETTLE/CHECK cycling
 * ============================================================ */
(function(){

    if(
        typeof window==="undefined" ||
        window.__sixBallSettleProgressV5
    ){
        return;
    }

    window.__sixBallSettleProgressV5=true;


    /* ========================================================
     * HELPERS
     * ======================================================== */

    function groupSignature(b){

        const out=[];

        for(
            let y=boardScanMin(b);
            y<ROWS;
            y++
        ){
            for(let x=0;x<W2;x++){

                const ball=
                    valid(x,y)
                        ?b[y][x]
                        :null;

                if(!ball)
                    continue;

                out.push(
                    ball.id+
                    ":"+
                    (ball.motionGroupId||0)+
                    ":"+
                    (ball.motionGroupSize||0)+
                    ":"+
                    (ball.rigid?1:0)
                );
            }
        }

        return out.join("|");
    }


    function trueFlatUpGroup(
        b,
        members
    ){

        if(
            !Array.isArray(members) ||
            members.length!==3
        ){
            return false;
        }


        const orientation=
            members[0]?.orientation ||
            members[0]?.ball
                ?.motionGroupOrientation;


        if(orientation!=="up")
            return false;


        const lowerY=
            Math.max(
                ...members.map(
                    m=>m.y
                )
            );


        const lower=
            members.filter(
                m=>m.y===lowerY
            );


        if(lower.length!==2)
            return false;


        /*
         * Real floor.
         */
        if(
            lower.every(
                m=>touchesFloorRow(m.y)
            )
        ){
            return true;
        }


        const own=
            new Set(
                members.map(
                    m=>m.ball.id
                )
            );


        function supportCount(m){

            let n=0;

            for(const dx of[-1,1]){

                const sx=m.x+dx;
                const sy=m.y+1;

                if(!valid(sx,sy))
                    continue;

                const q=b[sy][sx];

                if(
                    q &&
                    !own.has(q.id)
                ){
                    n++;
                }
            }

            return n;
        }


        /*
         * Only a genuinely flat external platform preserves
         * the upright triplet.
         */
        return lower.every(
            m=>supportCount(m)>=2
        );
    }


    function groupForBall(
        b,
        ball
    ){

        if(!ball?.motionGroupId)
            return null;

        const groups=
            hexPhysGroups(b);

        return(
            groups.get(
                ball.motionGroupId
            )||
            null
        );
    }


    function free(
        b,
        x,
        y
    ){

        return(
            valid(x,y) &&
            !b[y][x]
        );
    }


    function pathSafe(
        b,
        p
    ){

        if(
            !p ||
            p.ty<=p.y
        ){
            return false;
        }


        if(
            typeof hexPhysPathHitsStationary!==
                "function"
        ){
            return true;
        }


        return !hexPhysPathHitsStationary(
            p,
            b,
            new Set([
                p.ball.id
            ])
        );
    }


    /* ========================================================
     * LAST-RESORT GRAVITY
     *
     * Used only when the canonical resolver produced no event.
     *
     * It NEVER moves horizontally.
     * ======================================================== */

    function candidatesForBall(
        b,
        x,
        y,
        ball
    ){

        const candidates=[];


        /*
         * Straight down has highest priority.
         */
        if(
            free(
                b,
                x,
                y+2
            )
        ){

            candidates.push({
                x,
                y,

                tx:x,
                ty:y+2,

                ball,

                kind:
                    "FINAL_GRAVITY_FALL",

                pivot:null,
                topPivot:null,
                followSupportIds:[],

                rank:0
            });
        }


        /*
         * Down-left / down-right.
         */
        for(const dir of[-1,1]){

            const tx=x+dir;
            const ty=y+1;

            if(!free(b,tx,ty))
                continue;


            const oppositeX=
                x-dir;

            const oppositeY=
                y+1;


            const opposite=
                valid(
                    oppositeX,
                    oppositeY
                )
                    ?b[
                        oppositeY
                    ][
                        oppositeX
                    ]
                    :null;


            const direct=
                valid(
                    x,
                    y+2
                )
                    ?b[y+2][x]
                    :null;


            let pivot=null;
            let topPivot=null;
            let rank=3;


            /*
             * Roll around a REAL neighbouring ball.
             */
            if(opposite){

                pivot=[
                    oppositeX,
                    oppositeY
                ];

                rank=1;

            /*
             * Or fall/roll around the real ball directly below.
             */
            }else if(direct){

                topPivot=[
                    x,
                    y+2
                ];

                rank=2;

            /*
             * Wall/open-edge release.
             * Still DOWNWARD, never sideways.
             */
            }else{

                const outsideOpposite=
                    !valid(
                        oppositeX,
                        oppositeY
                    );

                if(!outsideOpposite)
                    continue;
            }


            candidates.push({
                x,
                y,

                tx,
                ty,

                ball,

                kind:
                    dir<0
                        ?"FINAL_GRAVITY_LEFT"
                        :"FINAL_GRAVITY_RIGHT",

                pivot,
                topPivot,

                followSupportIds:[],

                rank
            });
        }


        return candidates
            .filter(
                p=>pathSafe(b,p)
            )
            .sort(
                (a,z)=>{

                    if(a.rank!==z.rank)
                        return a.rank-z.rank;


                    const ax=
                        Math.abs(
                            a.tx-a.x
                        );

                    const zx=
                        Math.abs(
                            z.tx-z.x
                        );


                    if(ax!==zx)
                        return ax-zx;


                    const bias=
                        Math.sign(
                            ball.momentumX ||
                            ball.rollDir ||
                            ball.subCellBias ||
                            0
                        );


                    if(bias){

                        if(
                            Math.sign(
                                a.tx-a.x
                            )===bias
                        ){
                            return -1;
                        }

                        if(
                            Math.sign(
                                z.tx-z.x
                            )===bias
                        ){
                            return 1;
                        }
                    }


                    /*
                     * Deterministic wall booking.
                     */
                    if(x<=1)
                        return z.tx-a.tx;

                    if(x>=W2-2)
                        return a.tx-z.tx;


                    return a.tx-z.tx;
                }
            );
    }


    function findFinalGravity(
        b,
        allowRelease
    ){

        /*
         * Lowest unsupported ball first.
         */
        for(
            let y=ROWS-2;
            y>=boardScanMin(b);
            y--
        ){
            for(let x=0;x<W2;x++){

                if(!valid(x,y))
                    continue;


                const ball=b[y][x];

                if(
                    !ball ||
                    ball.garbageBubbleHold
                ){
                    continue;
                }


                /*
                 * Preserve intentional HEXAGON centre hole.
                 */
                if(
                    typeof ballInBalancedHexagonRing===
                        "function" &&
                    ballInBalancedHexagonRing(
                        b,
                        x,
                        y
                    )
                ){
                    continue;
                }


                const group=
                    groupForBall(
                        b,
                        ball
                    );


                if(group){

                    /*
                     * Genuine flat ▲ stays rigid.
                     */
                    if(
                        trueFlatUpGroup(
                            b,
                            group
                        )
                    ){
                        continue;
                    }


                    /*
                     * During preview we may report that release
                     * is required, but do not mutate anything.
                     */
                    const own=
                        new Set(
                            group.map(
                                m=>m.ball.id
                            )
                        );


                    const independent=
                        hexPhysIndependentMemberMotion(
                            b,
                            group,
                            group.find(
                                m=>m.ball.id===ball.id
                            )
                        );


                    if(
                        independent &&
                        independent.ty>
                            independent.y
                    ){

                        if(!allowRelease){

                            return{
                                releaseOnly:true,
                                group,
                                preview:
                                    independent
                            };
                        }


                        /*
                         * Physical constraint event:
                         * the group cannot continue as one body.
                         */
                        for(const m of group){

                            hexPhysClearGroupBall(
                                m.ball
                            );

                            delete m.ball
                                .equilibriumLocked;
                        }


                        window.__sixBallForcedRigidRelease=
                            (
                                window
                                .__sixBallForcedRigidRelease||
                                0
                            )+1;


                        /*
                         * Recalculate this board from the next
                         * resolver pass.
                         */
                        return{
                            releaseOnly:true,
                            group
                        };
                    }


                    continue;
                }


                const candidates=
                    candidatesForBall(
                        b,
                        x,
                        y,
                        ball
                    );


                if(candidates.length){

                    return{
                        releaseOnly:false,
                        proposal:
                            candidates[0]
                    };
                }
            }
        }


        return null;
    }


    /* ========================================================
     * SETTLE PASS
     *
     * Make preview and commit agree.
     * ======================================================== */

    settlePass=function(
        b,
        preview=false
    ){

        if(preview){

            const normal=
                hexPhysResolveEvent(
                    b,
                    true
                )||[];


            if(
                normal.some(
                    p=>p&&p.ty>p.y
                )
            ){
                return true;
            }


            return !!findFinalGravity(
                b,
                false
            );
        }


        const beforeGroups=
            groupSignature(b);


        let accepted=
            hexPhysResolveEvent(
                b,
                false
            )||[];


        /*
         * Absolute downward-only invariant.
         */
        accepted=
            accepted.filter(
                p=>
                    p &&
                    p.ty>p.y
            );


        if(accepted.length){

            const moved=
                hexPhysApplyEvent(
                    b,
                    accepted
                );


            if(moved){

                window.__sixBallSettleMoved=
                    (
                        window
                        .__sixBallSettleMoved||
                        0
                    )+
                    accepted.length;

                return true;
            }
        }


        /*
         * hexPhysResolveEvent itself may have released a rigid
         * constraint. That is real progress even if no cell
         * changed yet.
         */
        const afterGroups=
            groupSignature(b);


        if(beforeGroups!==afterGroups){

            clearBoardEquilibriumLocks(
                b
            );

            window.__sixBallConstraintOnlyProgress=
                (
                    window
                    .__sixBallConstraintOnlyProgress||
                    0
                )+1;

            return true;
        }


        /*
         * Canonical resolver had no event.
         * Try exactly ONE verified gravity-only fallback.
         */
        const fallback=
            findFinalGravity(
                b,
                true
            );


        if(!fallback)
            return false;


        if(fallback.releaseOnly){

            clearBoardEquilibriumLocks(
                b
            );

            return true;
        }


        if(
            fallback.proposal &&
            fallback.proposal.ty>
                fallback.proposal.y
        ){

            const moved=
                hexPhysApplyEvent(
                    b,
                    [
                        fallback.proposal
                    ]
                );


            if(moved){

                window.__sixBallFinalGravityMoves=
                    (
                        window
                        .__sixBallFinalGravityMoves||
                        0
                    )+1;

                return true;
            }
        }


        return false;
    };


    /* ========================================================
     * CRITICAL:
     *
     * "Illegal float" must NEVER claim that settlement should
     * continue unless settlePass(preview) can actually produce
     * physical progress.
     *
     * This removes the freeze permanently.
     * ======================================================== */

    boardHasIllegalFloat=function(b){

        return settlePass(
            b,
            true
        );
    };


    markCollisionBalancedGaps=function(b){

        clearBoardEquilibriumLocks(
            b
        );

        return 0;
    };


    window.__sixBallGravityPriorityVersion=
        "gravity-priority-v5-progress";

    window.__sixBallPreviewCommitParity=
        true;

    window.__sixBallInfiniteSettleLoopAllowed=
        false;

})();

/* ============================================================
 * 6ball AI SIMULATION FAST PATH v6
 *
 * Live board:
 *   keeps gravity-priority v1-v5 exactly as-is.
 *
 * AI search board:
 *   cells are primitive colour numbers, not ball objects.
 *   It therefore does NOT need:
 *     - motionGroup bookkeeping
 *     - visual fallPath
 *     - rigid-release signatures
 *     - equilibrium watchdog
 *     - render collision metadata
 *
 * This prevents CPU planning from stalling the game loop.
 * ============================================================ */
(function(){

    if(
        typeof window==="undefined" ||
        window.__sixBallAiPhysicsFastPathV6
    ){
        return;
    }

    window.__sixBallAiPhysicsFastPathV6=true;


    /* --------------------------------------------------------
     * Detect AI/evaluation board.
     *
     * Live game balls are objects:
     *   { id, c, ... }
     *
     * AI simulations use primitive colour numbers:
     *   0,1,2,3,4
     * -------------------------------------------------------- */

    function primitiveSimulationBoard(b){

        if(!b)
            return false;


        for(
            let y=boardScanMin(b);
            y<ROWS;
            y++
        ){
            for(let x=0;x<W2;x++){

                if(!valid(x,y))
                    continue;


                const v=b[y]?.[x];

                if(v===null || v===undefined)
                    continue;


                return typeof v!=="object";
            }
        }


        /*
         * Empty cloned AI boards are also possible.
         * They do not carry live-game visual state.
         */
        return !b.__liveEngineBoard;
    }


    /*
     * Save the complete v5 live implementations.
     */
    const liveSettlePass=
        settlePass;

    const liveBoardHasIllegalFloat=
        boardHasIllegalFloat;


    /* --------------------------------------------------------
     * Lightweight AI gravity.
     *
     * One logical downward move per settlePass.
     * settleAll() already repeats settlePass until stable.
     *
     * Never:
     *   same-row slide
     *   upward correction
     * -------------------------------------------------------- */

    function simulationMove(
        b,
        preview=false
    ){

        /*
         * Lowest balls resolve first.
         *
         * This gives deterministic support-loss behaviour and
         * avoids moving an upper ball through a lower one.
         */
        for(
            let y=ROWS-2;
            y>=boardScanMin(b);
            y--
        ){
            for(let x=0;x<W2;x++){

                if(!valid(x,y))
                    continue;


                const ball=b[y][x];

                if(
                    ball===null ||
                    ball===undefined
                ){
                    continue;
                }


                const p=
                    hexPhysNaturalMotion(
                        b,
                        x,
                        y,
                        null
                    );


                if(!p)
                    continue;


                /*
                 * Same absolute rule as live physics:
                 * gravity must contain downward movement.
                 */
                if(
                    !Number.isFinite(p.ty) ||
                    p.ty<=p.y
                ){
                    continue;
                }


                if(
                    !valid(
                        p.tx,
                        p.ty
                    )
                ){
                    continue;
                }


                if(
                    b[p.ty][p.tx]!==null
                ){
                    continue;
                }


                if(preview)
                    return true;


                /*
                 * AI board contains only primitive colours.
                 * Move the value directly; no visual or rigid
                 * metadata exists or is required.
                 */
                b[y][x]=null;

                b[p.ty][p.tx]=ball;

                noteBoardCell(
                    b,
                    p.ty,
                    ball
                );


                window.__sixBallAiFastGravityMoves=
                    (
                        window.__sixBallAiFastGravityMoves||
                        0
                    )+1;


                return true;
            }
        }


        return false;
    }


    /* --------------------------------------------------------
     * Dispatch
     * -------------------------------------------------------- */

    settlePass=function(
        b,
        preview=false
    ){

        if(
            primitiveSimulationBoard(b)
        ){
            return simulationMove(
                b,
                preview
            );
        }


        return liveSettlePass(
            b,
            preview
        );
    };


    boardHasIllegalFloat=function(b){

        if(
            primitiveSimulationBoard(b)
        ){
            /*
             * For an AI board, "illegal float" simply means
             * another gravity move remains.
             *
             * No expensive live-board rescue machinery.
             */
            return simulationMove(
                b,
                true
            );
        }


        return liveBoardHasIllegalFloat(
            b
        );
    };


    window.__sixBallGravityPriorityVersion=
        "gravity-priority-v6-ai-fastpath";

    window.__sixBallAiUsesLiveRigidPhysics=
        false;

})();
