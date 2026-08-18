/* Game-over garbage rendering parity.
 *
 * Settled garbage is ordinary accumulated pile by the time a result is decided.
 * The board renderer already computes the same row-staggered GAMEOVER sink/fade
 * for every cell, but garbage that still retained a finite garbageBubbleT took
 * the bubble renderer branch. That branch draws at alpha=1 and therefore ignored
 * the already-computed death fade, leaving former garbage visible after every
 * ordinary ball had disappeared.
 *
 * Keep the gameplay/physics and the existing result timing untouched. During
 * GAMEOVER only, route those former-garbage bubble draws through drawBall with
 * the exact same row-based deathAlpha used by drawSide. Outside GAMEOVER the
 * original bubble renderer is called unchanged.
 */
(function installGameoverGarbageFade(){
    if(typeof window==="undefined"||window.__hexGameoverGarbageFade)return;
    if(typeof drawSide!=="function"||typeof drawGarbageBubbleBall!=="function"||typeof drawBall!=="function")return;
    window.__hexGameoverGarbageFade=true;

    const baseDrawSide=drawSide;
    const baseDrawGarbageBubbleBall=drawGarbageBubbleBall;
    let renderState=null;

    function clamp01(v){return Math.max(0,Math.min(1,v));}
    function rowDeathAlpha(g,y){
        const delay=Math.max(0,(ROWS-1-y)*.075);
        const dk=clamp01(((g?.stateT||0)-.48-delay)/1.85);
        return 1-dk;
    }
    function activeGarbageBubbleCount(g){
        let n=0;
        if(!Array.isArray(g?.activeGarbagePacks))return n;
        for(const pack of g.activeGarbagePacks){
            if(!pack||pack.landed||!pack._started||!Array.isArray(pack.pat))continue;
            n+=pack.pat.length;
        }
        return n;
    }
    function boardGarbageBubbleRows(g){
        const rows=[];
        if(!g?.board)return rows;
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const cell=valid(x,y)?g.board[y][x]:null;
            if(!cell?.isGarbage)continue;
            const v=g.vis?.get?.(cell.id);
            if(Number.isFinite(v?.garbageBubbleT))rows.push(y);
        }
        return rows;
    }

    drawSide=function(ctx,g,L,side,t,label,sub,big,renderLead=0){
        const prev=renderState;
        if(g?.state==="GAMEOVER"){
            renderState={
                g,
                activeRemaining:activeGarbageBubbleCount(g),
                boardRows:boardGarbageBubbleRows(g),
                boardIndex:0
            };
        }else renderState=null;
        try{return baseDrawSide(ctx,g,L,side,t,label,sub,big,renderLead);}
        finally{renderState=prev;}
    };

    drawGarbageBubbleBall=function(ctx,cx,cy,d,ci,age){
        const st=renderState;
        if(!st||st.g?.state!=="GAMEOVER")return baseDrawGarbageBubbleBall(ctx,cx,cy,d,ci,age);

        // An unfinished airborne packet should not normally coexist with a
        // decided result, but if it does, it must disappear too. Use the same
        // result fade window without changing its trajectory.
        if(st.activeRemaining>0){
            st.activeRemaining--;
            const alpha=1-clamp01(((st.g.stateT||0)-.48)/1.85);
            return drawBall(ctx,cx,cy,d,ci,{alpha});
        }

        // Board calls occur in the same y/x traversal used to build boardRows,
        // so this reproduces drawSide's exact per-row stagger rather than adding
        // a garbage-specific timing curve.
        const y=st.boardRows[st.boardIndex++];
        const alpha=Number.isFinite(y)?rowDeathAlpha(st.g,y):1-clamp01(((st.g.stateT||0)-.48)/1.85);
        return drawBall(ctx,cx,cy,d,ci,{alpha});
    };

    window.__hexGameoverGarbageFadeVersion="gameover-garbage-v1";
    window.__hexGameoverAllBoardBallsShareDeathFade=true;
})();
