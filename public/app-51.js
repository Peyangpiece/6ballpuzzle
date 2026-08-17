/* A continuous-rest garbage ball is resting, not welded.
 * If a later contact overlaps it, let the final contact solver move it and
 * persist that solved centre as the next authoritative rest position.
 */
const __hexRenderMobilityBeforeYieldingRest=hexRenderMobility;
hexRenderMobility=function(g,q){
    if(q?.ball?._hexGarbageContinuousRest)return 1;
    return __hexRenderMobilityBeforeYieldingRest(g,q);
};

const __hexRenderMoveAlongNormalBeforeYieldingRest=hexRenderMoveAlongNormal;
hexRenderMoveAlongNormal=function(q,nx,ny,amount,sign){
    __hexRenderMoveAlongNormalBeforeYieldingRest(q,nx,ny,amount,sign);
    const rest=q?.ball?._hexGarbageContinuousRest;
    if(!rest||!q?.v)return;
    rest.px=q.v.x*0.5;
    rest.py=cellCenterYNorm(q.v.y);
};
