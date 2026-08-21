/* ============================================================
 * 6ball GARBAGE PERFORMANCE v1
 *
 * Performance-only layer.
 *
 * DOES NOT change:
 * - logical gravity
 * - fallPath
 * - collision destinations
 * - garbage timing
 * - spawn cadence
 * - final board cells
 *
 * Optimisations:
 * 1. Disable expensive predictive render-lookahead during GARBAGE.
 * 2. Skip visual contact solving when the garbage board is static.
 * ============================================================ */
(function(){

    if(
        typeof window==="undefined" ||
        window.__sixBallGarbagePerformanceV1
    ){
        return;
    }

    window.__sixBallGarbagePerformanceV1=true;


    const stats={
        renderLeadSkips:0,
        staticContactSkips:0,
        garbageFrames:0,
        maxMoving:0
    };


    window.__sixBallGarbagePerfStats=
        stats;


    function garbagePhase(g){

        return !!(
            g &&
            g.state==="RESOLVING" &&
            g.phase==="GARBAGE"
        );
    }


    function movingCount(g){

        if(
            g?._visualMovingIds
            instanceof Set
        ){
            return g._visualMovingIds.size;
        }

        return -1;
    }


    /* ========================================================
     * DRAW OPTIMISATION
     *
     * The existing garbage overlap guard searches up to
     * 32 predictive renderLead samples.
     *
     * renderLead is at most one physics frame (~8.3ms).
     *
     * During GARBAGE we simply render the CURRENT already
     * collision-resolved 120Hz state.
     *
     * Physics and animation timing are unchanged.
     * ======================================================== */

    if(typeof drawSide==="function"){

        const previousDrawSide=
            drawSide;


        drawSide=function(
            ctx,
            g,
            L,
            side,
            t,
            label,
            sub,
            big,
            renderLead=0
        ){

            if(garbagePhase(g)){

                stats.garbageFrames++;

                const n=
                    movingCount(g);

                if(n>=0){

                    stats.maxMoving=
                        Math.max(
                            stats.maxMoving,
                            n
                        );
                }


                if(renderLead>0){

                    stats.renderLeadSkips++;
                }


                /*
                 * IMPORTANT:
                 *
                 * Passing 0 bypasses the expensive
                 * 32-slice garbage render-overlap search.
                 *
                 * updateVisuals has already produced the
                 * collision-safe current position.
                 */
                return previousDrawSide(
                    ctx,
                    g,
                    L,
                    side,
                    t,
                    label,
                    sub,
                    big,
                    0
                );
            }


            return previousDrawSide(
                ctx,
                g,
                L,
                side,
                t,
                label,
                sub,
                big,
                renderLead
            );
        };
    }


    /* ========================================================
     * CONTACT OPTIMISATION
     *
     * stepEngine calls resolveVisualContacts after updateVisuals.
     *
     * If _visualMovingIds is an empty Set, every visible board
     * ball is static. A static collision-safe lattice cannot
     * spontaneously develop a new overlap.
     *
     * Therefore the O(n²) contact pass is unnecessary.
     * ======================================================== */

    if(
        typeof resolveVisualContacts===
            "function"
    ){

        const previousResolve=
            resolveVisualContacts;


        resolveVisualContacts=function(g){

            if(garbagePhase(g)){

                const moving=
                    movingCount(g);


                if(moving===0){

                    stats.staticContactSkips++;

                    return;
                }
            }


            return previousResolve(g);
        };
    }


    window.__sixBallGarbagePerformanceVersion=
        "garbage-performance-v1";

    window.__sixBallGarbageRenderPredictionEnabled=
        false;

    window.__sixBallGarbagePhysicsChanged=
        false;

})();
