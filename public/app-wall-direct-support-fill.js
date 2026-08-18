/* Wall direct-support vacancy fill.
 *
 * After a wall pile ball moves, its old alternating-parity wall cell can become
 * a secondary vacancy. A ball two rows above that mover may then sit directly
 * over the moved support while the just-vacated inward diagonal cell is empty.
 * The core one-sided wall branch chooses a roll around a virtual OUTSIDE-wall
 * pivot before it reaches the real direct-below-support branch, so that valid
 * secondary vacancy can remain open.
 *
 * Apply the real topPivot path ONLY when the direct support has actually just
 * vacated the target cell in its fallPath. This keeps ordinary wall landing
 * untouched while closing movement-created wall gaps with the real support.
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
    function supportVacatedTarget(support,target){
        const path=Array.isArray(support?.fallPath)?support.fallPath:[];
        return path.some(seg=>Array.isArray(seg?.from)&&seg.from[0]===target[0]&&seg.from[1]===target[1]);
    }

    hexPhysNaturalMotion=function(board,x,y,ignore=null){
        const ball=valid(x,y)?board[y][x]:null;
        if(ball&&!touchesFloorRow(y)&&!ball.garbageBubbleHold){
            const inward=wallSideAt(x,y);
            if(inward){
                const outer=[x-inward,y+1],inner=[x+inward,y+1],direct=[x,y+2];
                if(!valid(outer[0],outer[1])&&valid(inner[0],inner[1])&&hexPhysEmpty(board,inner[0],inner[1],ignore)&&valid(direct[0],direct[1])){
                    const support=board[direct[1]][direct[0]];
                    const ignored=!!(support&&ignore&&ignore.has(support.id));
                    if(support&&!ignored&&supportVacatedTarget(support,inner)){
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

    window.__hexWallDirectSupportFillVersion="wall-direct-support-v2";
    window.__hexWallDirectSupportVacancyAllowed=false;
})();
