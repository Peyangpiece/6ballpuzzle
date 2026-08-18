/* Wall direct-support vacancy fill.
 *
 * On alternating side-wall rows, a ball can sit directly above another wall
 * ball while the inward diagonal cell is empty. The core one-sided wall test
 * used to choose an inward roll around a virtual OUTSIDE-wall pivot before it
 * reached the real direct-below-support branch. That move is then rejected by
 * the real ball underneath, leaving the just-vacated wall cell open.
 *
 * Prefer the physically real direct-below ball as topPivot. This is the same
 * ordinary gravity move (one row down/inward), but now the sweep rolls around
 * the actual support and can legally fill the secondary wall vacancy.
 */
(function installWallDirectSupportFill(){
    if(typeof window==="undefined"||window.__hexWallDirectSupportFill)return;
    if(typeof hexPhysNaturalMotion!=="function")return;
    window.__hexWallDirectSupportFill=true;

    const baseNaturalMotion=hexPhysNaturalMotion;

    function wallSideAt(x,y){
        if(!valid(x,y))return 0;
        const left=(y&1)?0:1,right=(y&1)?W2-1:W2-2;
        if(x===left)return 1;
        if(x===right)return -1;
        return 0;
    }

    hexPhysNaturalMotion=function(board,x,y,ignore=null){
        const ball=valid(x,y)?board[y][x]:null;
        if(ball&&!touchesFloorRow(y)&&!ball.garbageBubbleHold){
            const inward=wallSideAt(x,y);
            if(inward){
                const outer=[x-inward,y+1],inner=[x+inward,y+1],direct=[x,y+2];
                // This special case is only for the parity where the outward
                // lower diagonal is outside the board. The other parity is
                // handled by WALL_EDGE_CHAIN_FOLLOW in app-wall-gap-invariant.
                if(!valid(outer[0],outer[1])&&valid(inner[0],inner[1])&&hexPhysEmpty(board,inner[0],inner[1],ignore)&&valid(direct[0],direct[1])){
                    const support=board[direct[1]][direct[0]];
                    const ignored=!!(support&&ignore&&ignore.has(support.id));
                    if(support&&!ignored){
                        return{
                            x,y,tx:inner[0],ty:inner[1],ball,
                            kind:"WALL_DIRECT_SUPPORT_FILL",
                            pivot:null,topPivot:[direct[0],direct[1]],
                            followSupportIds:[support.id],
                            wallVacancyFill:true
                        };
                    }
                }
            }
        }
        return baseNaturalMotion(board,x,y,ignore);
    };

    window.__hexWallDirectSupportFillVersion="wall-direct-support-v1";
    window.__hexWallDirectSupportVacancyAllowed=false;
})();
