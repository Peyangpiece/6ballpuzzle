/* Simultaneous current-batch garbage motion.
 *
 * app-08 integrates ordinary single-ball paths sequentially inside one 120 Hz
 * frame. Two incoming garbage balls that are already tangent and both still
 * moving can therefore deadlock: the first sees the second at its PREVIOUS
 * frame position, clamps, then the second sees the first and clamps as well.
 *
 * During the integration of one frame, other current-batch garbage balls that
 * also still have fallPath are not treated as stationary obstacles. All of
 * them advance on their canonical paths, then the ordinary contact resolver
 * sees their common end-of-frame positions and enforces separation. Settled
 * garbage and the pre-batch frozen pile remain full collision obstacles.
 */
(function installGarbageSimultaneousMotion(){
    if(typeof window==="undefined"||window.__hexGarbageSimultaneousMotion)return;
    window.__hexGarbageSimultaneousMotion=true;

    function ballById(g,id){
        if(!g?.board)return null;
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const b=valid(x,y)?g.board[y][x]:null;
            if(b?.id===id)return b;
        }
        return null;
    }
    function activeCurrentGarbage(ball){
        return !!ball?.isGarbage&&!ball.garbagePhaseFrozen&&
            Array.isArray(ball.fallPath)&&ball.fallPath.length>0;
    }

    const baseVisualPointSafe=visualPointSafe;
    visualPointSafe=function(g,id,x,y,minDist=0.999999){
        if(!(g&&g.state==="RESOLVING"&&g.phase==="GARBAGE"))
            return baseVisualPointSafe(g,id,x,y,minDist);
        const moving=ballById(g,id);
        if(!activeCurrentGarbage(moving))return baseVisualPointSafe(g,id,x,y,minDist);

        const hidden=[];
        // Hide only other moving members of THIS incoming phase. A ball whose
        // path has completed is already part of the receiving pile and must
        // block normally. Original frozen pile balls always block normally.
        for(const [oid,ov] of g.vis.entries()){
            if(oid===id||!ov)continue;
            const other=ballById(g,oid);
            if(!activeCurrentGarbage(other))continue;
            hidden.push([oid,ov]);
        }
        if(!hidden.length)return baseVisualPointSafe(g,id,x,y,minDist);
        for(const [oid] of hidden)g.vis.delete(oid);
        try{return baseVisualPointSafe(g,id,x,y,minDist);}
        finally{for(const [oid,ov] of hidden)g.vis.set(oid,ov);}
    };

    window.__hexGarbageMovingPeersAreSimultaneous=true;
})();