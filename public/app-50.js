/* Continuous-rest aware global settlement predicate. */
const __hexNearlySettledBeforeContinuousRestAware=nearlySettled;
nearlySettled=function(g,eps){
    if(!g?.board)return __hexNearlySettledBeforeContinuousRestAware(g,eps);
    const saved=[];
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball?._hexGarbageContinuousRest)continue;
        const v=g.vis.get(ball.id);if(!v)continue;
        saved.push({v,x:v.x,y:v.y,vy:v.vy,motionSpeed:v.motionSpeed});
        v.x=x;v.y=y;v.vy=0;v.motionSpeed=0;
    }
    try{return __hexNearlySettledBeforeContinuousRestAware(g,eps);}
    finally{
        for(const s of saved){s.v.x=s.x;s.v.y=s.y;s.v.vy=s.vy;s.v.motionSpeed=s.motionSpeed;}
    }
};
