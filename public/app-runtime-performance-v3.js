/* ============================================================
 * 6ball RUNTIME PERFORMANCE AUTHORITATIVE v3
 *
 * Performance only.
 *
 * - fast pure-vertical collapse scheduling
 * - moving-neighbour-only visual contact solving
 * - canonical fallback for difficult overlap cases
 * - one-pass rigid shadow contact
 *
 * Logical destinations / split decisions / groups are unchanged.
 * ============================================================ */
(function(){

    if(
        typeof window === "undefined" ||
        window.__sixBallRuntimePerformanceV3
    ){
        return;
    }

    window.__sixBallRuntimePerformanceV3 = true;


    /* ========================================================
     * 1. PURE VERTICAL COLLAPSE FAST PATH
     *
     * The logical physics has already decided that the motion
     * is legal.
     *
     * For a straight vertical segment with no pivot and no
     * moving-support attachment, the expensive 144-sample
     * scheduler test is redundant.
     * ======================================================== */

    if(
        typeof pileFlowWaveSafe === "function"
    ){

        const basePileFlowWaveSafeV3 =
            pileFlowWaveSafe;


        function pureVerticalSegmentV3(seg){

            if(
                !seg ||
                !Array.isArray(seg.from) ||
                !Array.isArray(seg.to)
            ){
                return false;
            }

            if(
                seg.pivot ||
                seg.topPivot ||
                seg.movingSupportId ||
                (
                    Array.isArray(seg.followSupportIds) &&
                    seg.followSupportIds.length
                )
            ){
                return false;
            }

            return(
                Math.abs(
                    Number(seg.to[0]) -
                    Number(seg.from[0])
                ) < 1e-9
                &&
                Number(seg.to[1]) >
                Number(seg.from[1])
            );
        }


        pileFlowWaveSafe =
            function(
                g,
                waveSegs,
                start,
                duration
            ){

                if(
                    Array.isArray(waveSegs) &&
                    waveSegs.length &&
                    waveSegs.every(
                        pureVerticalSegmentV3
                    )
                ){

                    for(const seg of waveSegs){

                        seg.pileFlowStart =
                            start;

                        seg.pileFlowDuration =
                            duration;

                        seg.pileFlowEnd =
                            start + duration;
                    }


                    g._perfV3VerticalScheduleSkips =
                        (
                            g._perfV3VerticalScheduleSkips ||
                            0
                        ) + 1;


                    return true;
                }


                return basePileFlowWaveSafeV3(
                    g,
                    waveSegs,
                    start,
                    duration
                );
            };
    }


    /* ========================================================
     * 2. FAST VISUAL CONTACT SOLVER
     *
     * Static-static pairs cannot suddenly collide.
     *
     * During collapse only process pairs where at least one
     * member is actually moving.
     *
     * Eight local passes handle the common case.
     *
     * If anything remains overlapping, immediately fall back
     * to the existing canonical resolver, preserving safety.
     * ======================================================== */

    if(
        typeof resolveVisualContacts === "function"
    ){

        const baseResolveVisualContactsV3 =
            resolveVisualContacts;


        resolveVisualContacts =
            function(g){

                const movingIds =
                    g?._visualMovingIds;


                if(
                    !(movingIds instanceof Set) ||
                    movingIds.size === 0
                ){

                    g._perfV3StaticContactSkips =
                        (
                            g._perfV3StaticContactSkips ||
                            0
                        ) + 1;

                    return;
                }


                const items = [];

                const scanMin =
                    boardScanMin(
                        g.board
                    );


                for(
                    let y=scanMin;
                    y<ROWS;
                    y++
                ){

                    for(
                        let x=0;
                        x<W2;
                        x++
                    ){

                        if(!valid(x,y))
                            continue;


                        const ball =
                            g.board[y][x];


                        if(!ball)
                            continue;


                        const v =
                            g.vis.get(
                                ball.id
                            );


                        if(
                            !v ||
                            !Number.isFinite(v.x) ||
                            !Number.isFinite(v.y)
                        ){
                            continue;
                        }


                        items.push({

                            ball,
                            v,
                            x,
                            y,

                            moving:
                                movingIds.has(
                                    ball.id
                                ) ||
                                (
                                    Array.isArray(
                                        ball.fallPath
                                    ) &&
                                    ball.fallPath.length>0
                                )
                        });
                    }
                }


                if(items.length < 2)
                    return;


                const H =
                    HEX_ROW_H;

                const MIN =
                    1;

                const floorMax =
                    (
                        FLOOR_CENTER_N -
                        BOARD_TOP_CENTER_N
                    ) / H;


                const shift =
                    (
                        q,
                        px,
                        py
                    ) => {

                        if(
                            q.ball?.isGarbage &&
                            py < 0
                        ){

                            const mag =
                                Math.hypot(
                                    px,
                                    py
                                );


                            let dir =
                                Math.sign(px);


                            if(!dir){

                                dir =
                                    Math.sign(
                                        q.x -
                                        q.v.x
                                    )
                                    ||
                                    (
                                        (q.ball.id & 1)
                                            ?1
                                            :-1
                                    );
                            }


                            px =
                                dir * mag;

                            py =
                                0;
                        }


                        const ox =
                            q.v.x;

                        const oy =
                            q.v.y;


                        q.v.x =
                            Math.max(
                                0,
                                Math.min(
                                    W2-1,
                                    q.v.x +
                                    px/.5
                                )
                            );


                        if(q.ball?.isGarbage){

                            const proposed =
                                q.v.y +
                                py/H;


                            q.v.y =
                                Math.min(
                                    floorMax,
                                    Math.max(
                                        q.v.y,
                                        Math.min(
                                            q.y,
                                            proposed
                                        )
                                    )
                                );
                        }
                        else{

                            q.v.y =
                                Math.min(
                                    floorMax,
                                    q.v.y +
                                    py/H
                                );
                        }


                        return[
                            (
                                q.v.x -
                                ox
                            )*.5,

                            (
                                q.v.y -
                                oy
                            )*H
                        ];
                    };


                const solvePair =
                    (
                        a,
                        b
                    ) => {

                        /*
                         * Static-static contacts are already
                         * resolved from previous frames.
                         */
                        if(
                            !a.moving &&
                            !b.moving
                        ){
                            return false;
                        }


                        let dx =
                            (
                                a.v.x -
                                b.v.x
                            )*.5;

                        let dy =
                            (
                                a.v.y -
                                b.v.y
                            )*H;

                        let d =
                            Math.hypot(
                                dx,
                                dy
                            );


                        if(
                            d >=
                            MIN-1e-9
                        ){
                            return false;
                        }


                        if(d < 1e-10){

                            const logicalDx =
                                (
                                    a.x -
                                    b.x
                                )*.5;

                            const logicalDy =
                                (
                                    a.y -
                                    b.y
                                )*H;

                            const ld =
                                Math.hypot(
                                    logicalDx,
                                    logicalDy
                                );


                            if(ld > 1e-10){

                                dx =
                                    logicalDx /
                                    ld;

                                dy =
                                    logicalDy /
                                    ld;
                            }
                            else{

                                dx =
                                    a.ball.id <
                                    b.ball.id
                                        ?-1
                                        :1;

                                dy =
                                    0;
                            }


                            d =
                                0;
                        }
                        else{

                            dx /= d;
                            dy /= d;
                        }


                        const missing =
                            MIN-d;


                        let wa =
                            a.moving &&
                            !b.moving
                                ?1
                                :(
                                    !a.moving &&
                                    b.moving
                                        ?0
                                        :.5
                                 );

                        let wb =
                            1-wa;


                        shift(
                            a,
                            dx*missing*wa,
                            dy*missing*wa
                        );

                        shift(
                            b,
                            -dx*missing*wb,
                            -dy*missing*wb
                        );


                        /*
                         * Same local retry policy as the
                         * canonical resolver.
                         */
                        for(
                            let retry=0;
                            retry<3;
                            retry++
                        ){

                            const rx =
                                (
                                    a.v.x -
                                    b.v.x
                                )*.5;

                            const ry =
                                (
                                    a.v.y -
                                    b.v.y
                                )*H;

                            const rd =
                                Math.hypot(
                                    rx,
                                    ry
                                );


                            if(
                                rd >=
                                MIN-1e-9
                            ){
                                break;
                            }


                            const nx =
                                rd>1e-10
                                    ?rx/rd
                                    :dx;

                            const ny =
                                rd>1e-10
                                    ?ry/rd
                                    :dy;

                            const need =
                                MIN-rd;


                            const first =
                                (
                                    a.moving &&
                                    !b.moving
                                )
                                    ?a
                                    :(
                                        b.moving &&
                                        !a.moving
                                            ?b
                                            :(
                                                retry&1
                                                    ?a
                                                    :b
                                             )
                                     );


                            const sign =
                                first===a
                                    ?1
                                    :-1;


                            const moved =
                                shift(
                                    first,
                                    nx*need*sign,
                                    ny*need*sign
                                );


                            const gain =
                                Math.hypot(
                                    moved[0],
                                    moved[1]
                                );


                            if(
                                gain <
                                need*.25
                            ){

                                const other =
                                    first===a
                                        ?b
                                        :a;


                                shift(
                                    other,
                                    -nx*need*sign,
                                    -ny*need*sign
                                );
                            }
                        }


                        return true;
                    };


                function nearbyPairs(){

                    const buckets =
                        new Map();

                    const pairs =
                        [];


                    for(
                        let i=0;
                        i<items.length;
                        i++
                    ){

                        const q =
                            items[i];


                        const bx =
                            Math.floor(
                                q.v.x*.5
                            );

                        const by =
                            Math.floor(
                                q.v.y*H
                            );

                        const key =
                            bx+","+by;


                        if(
                            !buckets.has(
                                key
                            )
                        ){

                            buckets.set(
                                key,
                                []
                            );
                        }


                        buckets.get(
                            key
                        ).push(i);
                    }


                    for(
                        let i=0;
                        i<items.length;
                        i++
                    ){

                        const q =
                            items[i];


                        const bx =
                            Math.floor(
                                q.v.x*.5
                            );

                        const by =
                            Math.floor(
                                q.v.y*H
                            );


                        for(
                            let ox=-1;
                            ox<=1;
                            ox++
                        ){

                            for(
                                let oy=-1;
                                oy<=1;
                                oy++
                            ){

                                const list =
                                    buckets.get(
                                        (bx+ox)+
                                        ","+
                                        (by+oy)
                                    ) || [];


                                for(const j of list){

                                    if(j<=i)
                                        continue;


                                    const other =
                                        items[j];


                                    if(
                                        !q.moving &&
                                        !other.moving
                                    ){
                                        continue;
                                    }


                                    pairs.push([
                                        q,
                                        other
                                    ]);
                                }
                            }
                        }
                    }


                    return pairs;
                }


                let passes =
                    0;


                for(
                    ;
                    passes<8;
                    passes++
                ){

                    let changed =
                        false;


                    for(
                        const [a,b]
                        of nearbyPairs()
                    ){

                        if(
                            solvePair(
                                a,
                                b
                            )
                        ){

                            changed =
                                true;
                        }
                    }


                    if(!changed)
                        break;
                }


                /*
                 * Safety verification.
                 *
                 * If the fast solver did not completely solve
                 * the difficult frame, use the old full solver.
                 *
                 * Therefore overlap correctness is not traded
                 * for speed.
                 */
                let unresolved =
                    false;


                for(
                    const [a,b]
                    of nearbyPairs()
                ){

                    const dx =
                        (
                            a.v.x -
                            b.v.x
                        )*.5;

                    const dy =
                        (
                            a.v.y -
                            b.v.y
                        )*H;


                    if(
                        Math.hypot(
                            dx,
                            dy
                        ) <
                        0.999999
                    ){

                        unresolved =
                            true;

                        break;
                    }
                }


                if(unresolved){

                    g._perfV3CanonicalContactFallbacks =
                        (
                            g._perfV3CanonicalContactFallbacks ||
                            0
                        ) + 1;


                    return baseResolveVisualContactsV3(
                        g
                    );
                }


                g._perfV3FastContactFrames =
                    (
                        g._perfV3FastContactFrames ||
                        0
                    ) + 1;
            };
    }


    /* ========================================================
     * 3. SHADOW CONTACT
     *
     * One maximum constraint only.
     * No four-pass cumulative lift.
     * Also cheaper than the old routine.
     * ======================================================== */

    if(
        typeof rigidShadowPixelPlacement ===
            "function"
    ){

        rigidShadowPixelPlacement =
            function(
                g,
                shadowCells,
                pos,
                D,
                X,
                Y,
                BW,
                BH
            ){

                if(
                    !shadowCells ||
                    !shadowCells.length
                ){
                    return[];
                }


                const pts =
                    shadowCells.map(
                        ([sx,sy,sc]) => {

                            const [px,py] =
                                pos(
                                    sx,
                                    sy
                                );


                            return{
                                px,
                                py,
                                sc
                            };
                        }
                    );


                const floorCenter =
                    Y +
                    BH -
                    D*.5;


                let dy =
                    Math.min(
                        0,
                        floorCenter -
                        Math.max(
                            ...pts.map(
                                p=>p.py
                            )
                        )
                    );


                const scanMin =
                    boardScanMin(
                        g.board
                    );


                for(const gp of pts){

                    for(
                        let by=scanMin;
                        by<ROWS;
                        by++
                    ){

                        for(
                            let bx=0;
                            bx<W2;
                            bx++
                        ){

                            if(!valid(bx,by))
                                continue;


                            const cell =
                                g.board[by][bx];


                            if(!cell)
                                continue;


                            const vv =
                                g.vis.get(
                                    cell.id
                                ) ||
                                {
                                    x:bx,
                                    y:by
                                };


                            const [bpX,bpY] =
                                pos(
                                    vv.x,
                                    vv.y
                                );


                            const dx =
                                Math.abs(
                                    gp.px -
                                    bpX
                                );


                            if(
                                dx >=
                                D-1e-6
                            ){
                                continue;
                            }


                            const vert =
                                Math.sqrt(
                                    Math.max(
                                        0,
                                        D*D -
                                        dx*dx
                                    )
                                );


                            dy =
                                Math.min(
                                    dy,
                                    bpY -
                                    vert -
                                    gp.py
                                );
                        }
                    }
                }


                return pts.map(
                    p=>[
                        p.px,
                        p.py+dy,
                        p.sc
                    ]
                );
            };
    }


    window.__sixBallRuntimePerformanceVersion =
        "runtime-performance-v3";

    window.__sixBallPureVerticalScheduleFastPath =
        true;

    window.__sixBallMovingNeighbourContactSolver =
        true;

    window.__sixBallContactFastPassLimit =
        8;

    window.__sixBallCanonicalContactFallback =
        true;

    window.__sixBallPerformanceChangesLogicalPhysics =
        false;

})();
