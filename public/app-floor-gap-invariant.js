/* Floor-side no-gap invariant.
 *
 * A balanced HEXAGON exemption is valid only when the lower arch is supported
 * by actual balls. The floor may stop a ball, but it must never substitute for
 * one of the two-ball supports that make an intentional interior HEXAGON hole
 * legal. This keeps the already-correct interior ball-supported HEXAGON while
 * removing the floor-adjacent cavity that could otherwise be frozen as
 * equilibrium.
 */
(function installFloorGapInvariant(){
    if(typeof window==="undefined"||window.__hexFloorGapInvariant)return;
    window.__hexFloorGapInvariant=true;

    const baseBalancedHexagonCenterHole=isBalancedHexagonCenterHole;
    const LOWER_RING_OFFSETS=[[-1,1],[1,1]];

    function lowerArchHasTwoRealBallSupports(board,cx,cy){
        for(const [dx,dy] of LOWER_RING_OFFSETS){
            const x=cx+dx,y=cy+dy;
            if(!valid(x,y)||!board[y][x])return false;
            // A lower ring member already touching the floor has no pair of
            // supporting balls beneath it. The floor itself is not a ball and
            // therefore cannot legalize a HEXAGON cavity.
            if(touchesFloorRow(y))return false;
            const s=hexPhysSupportInfo(board,x,y);
            if(!(s.left.valid&&s.right.valid&&s.left.ball&&s.right.ball))return false;
        }
        return true;
    }

    isBalancedHexagonCenterHole=function(board,cx,cy){
        if(!baseBalancedHexagonCenterHole(board,cx,cy))return false;
        return lowerArchHasTwoRealBallSupports(board,cx,cy);
    };

    window.__hexFloorGapInvariantVersion="floor-gap-v1";
    window.__hexFloorAdjacentGapAllowed=false;
    window.__hexFloorMaySupportBalancedHexagon=false;
})();
