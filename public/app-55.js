/* Keep penetration tolerance strict; widen only the frame-net recoil noise band.
 * Measured reference-invisible STRAIGHT recoil is ~1.1e-7 rows, while the real
 * seed-7 contact failure is several micro-units. Suppress only net upward drift
 * <=1e-6 for pathless garbage at frame boundaries.
 */
const HEX_FRAME_RECOIL_NOISE_EPS=1e-6;

hexClampSettledGarbageBoundaryNoise=function(g,before){
    if(!before?.size)return 0;
    let clamped=0;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        const oldY=ball?before.get(ball.id):undefined;
        if(!ball?.isGarbage||!Number.isFinite(oldY)||ball.fallPath?.length)continue;
        const v=g.vis.get(ball.id);if(!v||!Number.isFinite(v.y))continue;
        const upward=oldY-v.y;
        if(upward>0&&upward<=HEX_FRAME_RECOIL_NOISE_EPS){
            v.y=oldY;
            const rest=ball._hexGarbageContinuousRest;
            if(rest)rest.py=cellCenterYNorm(v.y);
            clamped++;
        }
    }
    return clamped;
};
