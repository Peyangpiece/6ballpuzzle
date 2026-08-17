/* Production tolerance for the final contact solver.
 *
 * Ignore only sub-1e-7 packing noise so the solver does not chase floating-
 * point error through already packed rows. Real penetrations, including the
 * seed-7 multi-micro-unit failures, remain above this threshold and are still
 * resolved. A settled garbage ball may ride up a neighbour's tangent when
 * genuinely pushed; only an upward component no larger than the numerical
 * tolerance is treated as zero recoil.
 */
const HEX_RENDER_SOLVER_EPS=1e-7;
const HEX_RENDER_FAST_PASSES=24;
const HEX_RENDER_UPWARD_NOISE_EPS=1e-7;

const __hexRenderMoveBeforeNoiseClamp=hexRenderMoveAlongNormal;
hexRenderMoveAlongNormal=function(q,nx,ny,amount,sign){
    const oldY=q?.v?.y;
    const settledGarbage=!!q?.ball?.isGarbage&&!(q.ball.fallPath?.length)&&Math.abs(q.v?.vy||0)<=1e-9&&Math.abs(q.v?.motionSpeed||0)<=1e-9;
    __hexRenderMoveBeforeNoiseClamp(q,nx,ny,amount,sign);
    if(!settledGarbage||!Number.isFinite(oldY)||!Number.isFinite(q?.v?.y))return;
    const upward=oldY-q.v.y;
    if(upward>0&&upward<=HEX_RENDER_UPWARD_NOISE_EPS){
        q.v.y=oldY;
        const rest=q.ball._hexGarbageContinuousRest;
        if(rest)rest.py=cellCenterYNorm(q.v.y);
    }
};

function hexSnapshotSettledGarbageY(g){
    const out=new Map();
    if(!g?.board)return out;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null,v=ball&&g.vis.get(ball.id);
        if(!ball?.isGarbage||!v||ball.fallPath?.length)continue;
        if(Math.abs(v.vy||0)>1e-9||Math.abs(v.motionSpeed||0)>1e-9)continue;
        if(Number.isFinite(v.y))out.set(ball.id,v.y);
    }
    return out;
}

function hexClampSettledGarbageBoundaryNoise(g,before){
    if(!before?.size)return 0;
    let clamped=0;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        const oldY=ball?before.get(ball.id):undefined;
        if(!ball?.isGarbage||!Number.isFinite(oldY)||ball.fallPath?.length)continue;
        const v=g.vis.get(ball.id);if(!v||!Number.isFinite(v.y))continue;
        const upward=oldY-v.y;
        if(upward>0&&upward<=HEX_RENDER_UPWARD_NOISE_EPS){
            v.y=oldY;
            const rest=ball._hexGarbageContinuousRest;
            if(rest)rest.py=cellCenterYNorm(v.y);
            clamped++;
        }
    }
    return clamped;
}

const __hexUpdateVisualsBeforeBoundaryNoiseClamp=updateVisuals;
updateVisuals=function(g,dt){
    const before=hexSnapshotSettledGarbageY(g);
    const result=__hexUpdateVisualsBeforeBoundaryNoiseClamp(g,dt);
    hexClampSettledGarbageBoundaryNoise(g,before);
    return result;
};

hexEnforceFinalVisualNonOverlap=function(g){
    const items=hexRenderBoardVisuals(g);
    if(items.length<2)return 0;
    let corrections=0;
    for(let pass=0;pass<HEX_RENDER_FAST_PASSES;pass++){
        let changed=false;
        for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
            const a=items[i],b=items[j];
            const pdx=(b.v.x-a.v.x)*0.5,pdy=(b.v.y-a.v.y)*HEX_ROW_H;
            if(Math.abs(pdx)>=1||Math.abs(pdy)>=1)continue;
            const n=hexRenderPairNormal(a,b);
            if(n.d>=1-HEX_RENDER_SOLVER_EPS)continue;
            let ma=hexRenderMobility(g,a),mb=hexRenderMobility(g,b);
            if(ma<=0&&mb<=0)ma=mb=1;
            const total=ma+mb;if(total<=0)continue;
            const push=1-n.d;
            hexRenderMoveAlongNormal(a,n.nx,n.ny,push*(ma/total),-1);
            hexRenderMoveAlongNormal(b,n.nx,n.ny,push*(mb/total),+1);
            changed=true;corrections++;
        }
        if(!changed)break;
    }
    return corrections;
};
