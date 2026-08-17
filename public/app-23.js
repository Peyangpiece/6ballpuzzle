/* Continuous garbage hand-off.
 *
 * Logical garbage cells are still reserved on the deterministic hex lattice,
 * but the rendered ball must never snap to that cell while it is still moving.
 * Keep the exact physical contact centre, then prepend a gravity/contact-arc
 * segment from that continuous point to the first logical path node. Convert
 * the rest of that ball's queued lattice path to the same absolute-time
 * pile-flow representation, so passing a grid node never creates a stop/snap.
 * Only after the complete path has finished does the rendered centre equal the
 * final logical lattice cell.
 */
const HEX_GARBAGE_HANDOFF_PIVOT_TOL=0.025;
const HEX_GARBAGE_HANDOFF_EPS=1e-7;

function hexGarbageContinuousDist(a,b){
    return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);
}

function hexGarbageContinuousPivot(g,ballId,from,to){
    let best=null;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const b=valid(x,y)?g.board[y][x]:null;
        if(!b||b.id===ballId)continue;
        const v=g.vis.get(b.id);
        if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
        const p=[v.x,v.y];
        const d0=hexGarbageContinuousDist(from,p),d1=hexGarbageContinuousDist(to,p);
        const err=Math.abs(d0-1)+Math.abs(d1-1);
        if(Math.abs(d0-1)>HEX_GARBAGE_HANDOFF_PIVOT_TOL||Math.abs(d1-1)>HEX_GARBAGE_HANDOFF_PIVOT_TOL)continue;
        if(!best||err<best.err)best={id:b.id,p,ball:b,err};
    }
    return best;
}

function hexGarbagePrepareContinuousPath(g,ball,entry,from){
    if(!ball||!entry||!Array.isArray(from)||from.length<2)return;
    const v=g.vis.get(ball.id);if(!v)return;
    const oldPath=Array.isArray(ball.fallPath)?ball.fallPath:[];
    const firstLogical=oldPath[0]?.from?[...oldPath[0].from]:[entry.x,entry.y];
    const path=[];

    if(hexGarbageContinuousDist(from,firstLogical)>HEX_GARBAGE_HANDOFF_EPS){
        const seg={
            from:[...from],to:[...firstLogical],kind:"GARBAGE_CONTINUOUS_HANDOFF",
            pileFlow:true,pileFlowEntry:true,pileFlowReason:"garbage_continuous_handoff",
            motionSeq:0
        };
        const pivot=hexGarbageContinuousPivot(g,ball.id,from,firstLogical);
        if(pivot){
            seg.pivot=[...pivot.p];
            if(Array.isArray(pivot.ball?.fallPath)&&pivot.ball.fallPath.length){
                seg.followSupportIds=[pivot.id];
                seg.movingSupportId=pivot.id;
            }
        }
        path.push(seg);
    }
    for(const seg of oldPath)if(seg?.from&&seg?.to)path.push(seg);

    if(!path.length){
        // Exact contact already is the final canonical cell.
        v.x=entry.x;v.y=entry.y;v.vy=0;v.motionSpeed=0;v.pileFlow=false;
        delete ball.fallPath;
        return;
    }

    let firstSeq=Infinity;
    for(const seg of path){
        const s=Number(seg?.pileFlowOriginalSeq??seg?.motionSeq);
        if(Number.isFinite(s)&&s>0)firstSeq=Math.min(firstSeq,s);
    }
    if(!Number.isFinite(firstSeq))firstSeq=1;
    let orderedSeq=firstSeq-1;
    const fresh=[];
    for(let i=0;i<path.length;i++){
        const seg=path[i];
        delete seg.pileFlowStart;delete seg.pileFlowDuration;delete seg.pileFlowEnd;
        delete seg._hexGravityProfile;delete seg._hexGravityLinear;
        if(i>0)repairPileFlowSegmentGeometry(g,ball,seg,"garbage_continuous_handoff");
        const original=Number(seg.pileFlowOriginalSeq??seg.motionSeq);
        if(i===0&&seg.kind==="GARBAGE_CONTINUOUS_HANDOFF"){
            orderedSeq=firstSeq-1;
        }else{
            orderedSeq=Math.max(orderedSeq+1,Number.isFinite(original)&&original>0?original:orderedSeq+1);
        }
        seg.pileFlowOriginalSeq=orderedSeq;
        seg.motionSeq=0;
        seg.pileFlow=true;
        seg.pileFlowEntry=i===0;
        seg.pileFlowReason="garbage_continuous_handoff";
        seg._pileFlowBall=ball;
        fresh.push({ball,seg,seq:orderedSeq});
    }
    ball.fallPath=path;

    g._pileFlowBallById=new Map();
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const b=valid(x,y)?g.board[y][x]:null;if(b)g._pileFlowBallById.set(b.id,b);
    }
    scheduleFreshPileFlow(g,fresh,"garbage_continuous_handoff");
    for(const {seg}of fresh){delete seg._pileNominalDuration;delete seg._pileFlowBall;}
    v.pileFlow=true;
    v.vy=Math.max(0,v.vy||0);
    v.motionSpeed=Math.max(v.motionSpeed||0,Math.max(0,v.vy||0)*HEX_ROW_H,0.0001);
}

const __hexGarbageMaterializeBeforeContinuousHandoff=materializeGarbageBallAtContact;
materializeGarbageBallAtContact=function(g,pack,index,contactAnchorY){
    const slot=pack?.pat?.[index];
    if(!slot)return false;
    const exactX=pack.ax+slot[0],exactY=contactAnchorY+slot[1];
    const before=Array.isArray(pack.entryBalls)?pack.entryBalls.length:0;
    const ok=__hexGarbageMaterializeBeforeContinuousHandoff(g,pack,index,contactAnchorY);
    if(!ok)return false;

    const entry=pack.entryBalls?.[before]||pack.entryBalls?.[pack.entryBalls.length-1];
    const ball=entry?hexGarbageBoardBallById(g,entry.id):null;
    const v=ball?g.vis.get(ball.id):null;
    if(!entry||!ball||!v)return ok;

    // Undo the old lattice visual hand-off in the same synchronous call, before
    // a frame can be rendered. The lattice registration remains logical only.
    v.x=exactX;v.y=exactY;
    v.vy=Math.max(0,(pack.vy||0)/HEX_ROW_H);
    v.motionSpeed=Math.max(RELEASE_INITIAL_VY,pack.vy||0);
    v.garbageFreeFlightHandoff=true;
    entry.handoffX=exactX;
    entry.handoffY=exactY;
    entry.contactX=exactX;
    entry.contactY=exactY;

    hexGarbagePrepareContinuousPath(g,ball,entry,[exactX,exactY]);
    return ok;
};
