/* Absolute side-wall packing invariant.
 *
 * The physical side boundary alternates one lattice column every row. Whenever
 * gravity offers a legal choice that can keep a ball flush with that boundary,
 * the wall cell wins regardless of colour, source metadata, residual momentum,
 * row parity or left/right side.
 *
 * This layer deliberately changes only two already-physical one-ball forks:
 *   1) a ball one cell in from the wall, balanced on a real direct support with
 *      both lower diagonals open, always rolls into the open wall diagonal;
 *   2) a ball already on the wall, above a real direct support, always uses the
 *      next lower alternating-parity wall cell when that cell is open.
 *
 * No teleport, compaction snap, gravity/speed change or collision relaxation is
 * introduced. Both custom moves use the ordinary direct-support topPivot path.
 * Incoming garbage is included after its spawn hold because it is ordinary ball
 * physics at that point. Frozen pre-existing garbage-phase pile balls are still
 * blocked by app-garbage-normal-physics outside this adapter.
 */
(function installAbsoluteWallZeroGap(){
    if(typeof window==="undefined"||window.__hexAbsoluteWallZeroGap)return;
    if(typeof hexPhysNaturalMotion!=="function")return;
    window.__hexAbsoluteWallZeroGap=true;

    const baseNaturalMotion=hexPhysNaturalMotion;

    function wallSideAt(x,y){
        if(!valid(x,y))return 0;
        const left=(y&1)?0:1,right=(y&1)?W2-1:W2-2;
        if(x===left)return 1;
        if(x===right)return -1;
        return 0;
    }
    function wallX(side,y){
        if(side>0)return(y&1)?0:1;
        if(side<0)return(y&1)?W2-1:W2-2;
        return NaN;
    }
    function realSupport(board,x,y,ignore){
        if(!valid(x,y))return null;
        const q=board[y][x];
        if(!q||(ignore&&ignore.has(q.id)))return null;
        return q;
    }

    // A ball already touching the side boundary must not peel away from it when
    // the next lower physical wall cell is available. The direct support is a
    // real ball, so this is the same fall-then-roll contact path used by core
    // topPivot motion; only the wall-facing tie-break is made absolute.
    function directWallFill(board,x,y,ball,ignore){
        if(!ball||ball.garbageBubbleHold||touchesFloorRow(y))return null;
        const side=wallSideAt(x,y);if(!side)return null;
        const ty=y+1,tx=wallX(side,ty);
        if(!valid(tx,ty)||!hexPhysEmpty(board,tx,ty,ignore))return null;
        const sy=y+2,support=realSupport(board,x,sy,ignore);if(!support)return null;
        return{
            x,y,tx,ty,ball,
            kind:"WALL_ZERO_GAP_DIRECT_FILL",
            pivot:null,topPivot:[x,sy],followSupportIds:[support.id],
            wallPack:true,wallZeroGap:true,wallDirectFill:true
        };
    }

    // The symmetric direct-support fork one cell in from the wall used to be
    // strict only for non-garbage balls. Make the same physical wall preference
    // apply to every ordinary-contact ball, including settled/incoming garbage.
    function adjacentWallPack(board,x,y,ball,ignore){
        if(!ball||ball.garbageBubbleHold||wallSideAt(x,y)||touchesFloorRow(y))return null;
        const sy=y+2,support=realSupport(board,x,sy,ignore);if(!support)return null;
        if(!hexPhysEmpty(board,x-1,y+1,ignore)||!hexPhysEmpty(board,x+1,y+1,ignore))return null;
        let chosen=null;
        for(const dx of[-1,1]){
            const tx=x+dx,ty=y+1;
            if(!valid(tx,ty)||!wallSideAt(tx,ty)||!hexPhysEmpty(board,tx,ty,ignore))continue;
            if(chosen)return null;
            chosen={dx,tx,ty};
        }
        if(!chosen)return null;
        return{
            x,y,tx:chosen.tx,ty:chosen.ty,ball,
            kind:chosen.dx<0?"ROLL_LEFT":"ROLL_RIGHT",
            pivot:null,topPivot:[x,sy],followSupportIds:[],
            wallPack:true,normalWallPack:true,allBallWallPack:true,wallZeroGap:true
        };
    }

    hexPhysNaturalMotion=function(board,x,y,ignore=null){
        const ball=valid(x,y)?board[y][x]:null;
        if(ball&&!ball.garbageBubbleHold&&!touchesFloorRow(y)){
            const direct=directWallFill(board,x,y,ball,ignore);
            if(direct)return direct;
            const packed=adjacentWallPack(board,x,y,ball,ignore);
            if(packed)return packed;
        }
        return baseNaturalMotion(board,x,y,ignore);
    };

    window.__hexAbsoluteWallZeroGapVersion="wall-zero-gap-v1";
    window.__hexWallGapAllowed=false;
    window.__hexWallAllBallTypesPack=true;
    window.__hexWallDirectSupportAlwaysPacks=true;
    window.__hexWallBothParitiesAlwaysPack=true;
})();
