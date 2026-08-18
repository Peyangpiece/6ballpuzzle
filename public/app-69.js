/* HEXDROP visual-contact performance guard.
 * app-48 invokes the continuous-rest authority four times per frame so exact
 * granular garbage centres survive legacy visual passes. app-50 wraps that
 * authority with a global no-overlap solve. When no continuous-rest ball exists,
 * those calls do no useful work but still trigger four full-board contact solves.
 * Preserve the exact same behavior whenever a rest marker exists; skip only the
 * provably empty case.
 */
const __hexGarbageApplyContinuousRestsBeforeEmptyGuard=hexGarbageApplyContinuousRests;
hexGarbageApplyContinuousRests=function(g){
    if(!g?.board)return;
    let found=false;
    for(let y=boardScanMin(g.board);y<ROWS&&!found;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(ball?._hexGarbageContinuousRest){found=true;break;}
    }
    if(!found)return;
    return __hexGarbageApplyContinuousRestsBeforeEmptyGuard(g);
};
