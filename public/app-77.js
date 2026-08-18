/* HEXDROP outer frame contact transaction.
 *
 * app-61 introduced a one-frame contact transaction, but app-62/63/64 wrap
 * stepEngine outside it and therefore issued additional final contact solves
 * after the inner transaction had already closed.  Make the transaction cover
 * the complete shipped stepEngine stack.  Nested final-solve requests become
 * no-ops and one authoritative solve runs after every outer wrapper finishes.
 */
const __hex77StepBeforeOuterContactTransaction=stepEngine;

stepEngine=function(g,dt){
    if(!g||g._hex77OuterContactFrame)return __hex77StepBeforeOuterContactTransaction(g,dt);

    const beforeY=typeof hexSnapshotSettledGarbageY==="function"?hexSnapshotSettledGarbageY(g):null;
    const monotoneY=new Map();
    if(g.board&&g.vis){
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null,v=ball&&g.vis.get(ball.id);
            if(ball?.isGarbage&&v&&Number.isFinite(v.y))monotoneY.set(ball.id,v.y);
        }
    }

    const previousTx=g._hexContactFrameTransaction;
    const tx={allowFinal:false,skippedZeroRelax:0,skippedFinal:0,outerBoundary:true};
    g._hexContactFrameTransaction=tx;
    g._hex77OuterContactFrame=true;
    let result;
    try{
        // app-61 detects the already-open transaction and therefore delegates
        // directly to the original integration path. app-62/63/64 may request
        // boundary solves, but app-61's final-solve guard suppresses them while
        // allowFinal is false.
        result=__hex77StepBeforeOuterContactTransaction(g,dt);

        // Reproduce app-61's single zero-time convergence after all outer
        // visual/rest authority layers have completed their work.
        if(typeof __hexRelaxBeforeFrameTransaction==="function"){
            __hexRelaxBeforeFrameTransaction(g,0);
        }

        // Exactly one global final contact solve is allowed at the true frame
        // boundary. Use the public wrapper so diagnostics count the real solve.
        tx.allowFinal=true;
        if(typeof hexEnforceFinalVisualNonOverlap==="function"){
            hexEnforceFinalVisualNonOverlap(g);
        }
        tx.allowFinal=false;

        // The global solver may contain a tiny upward numerical projection for
        // landed garbage. Restore the unilateral/monotone invariant, then use
        // app-64's sideways/downward garbage-only repair without another global
        // solve.
        if(g.state==="RESOLVING"&&g.board&&g.vis){
            if(typeof hex64ClampGarbageMonotone==="function")hex64ClampGarbageMonotone(g,monotoneY);
            if(typeof hex64SanitizeAllGarbagePaths==="function")hex64SanitizeAllGarbagePaths(g);
            if(typeof hex64ResolveFinalGarbageContacts==="function")hex64ResolveFinalGarbageContacts(g);
            if(typeof hex64SyncContinuousRests==="function")hex64SyncContinuousRests(g);
            if(typeof hexCanonicalizeContinuousRests==="function")hexCanonicalizeContinuousRests(g);
        }
        if(beforeY&&typeof hexClampSettledGarbageBoundaryNoise==="function"){
            hexClampSettledGarbageBoundaryNoise(g,beforeY);
        }
        return result;
    }finally{
        if(previousTx===undefined)delete g._hexContactFrameTransaction;
        else g._hexContactFrameTransaction=previousTx;
        delete g._hex77OuterContactFrame;
    }
};
