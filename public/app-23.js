/* Continuous garbage hand-off.
 *
 * Logical garbage cells are still reserved on the deterministic hex lattice,
 * but the rendered ball must never snap to that cell while it is still moving.
 * Keep the exact physical contact centre and prepend only one continuous
 * contact-to-first-node segment. The existing lattice path keeps its original
 * motionSeq and renderer semantics unchanged, so the established garbage
 * collision ordering remains authoritative. Passing a grid node is continuous;
 * only after the whole path has finished does the rendered centre equal the
 * final logical lattice cell.
 */
const HEX_GARBAGE_HANDOFF_PIVOT_TOL=0.025;
const HEX_GARBAGE_HANDOFF_EPS=1e-7;
const HEX_GARBAGE_FIXED_NORMAL_TOL=0.04;
const HEX_GARBAGE_FIXED_CONTACT_TARGET=1.00000005;
const HEX_GARBAGE_FIXED_CONTACT_PASSES=8;

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

function hexGarbageHandoffMotionSeq(oldPath){
    for(const seg of oldPath||[]){
        const seq=Number(seg?.pileFlowOriginalSeq??seg?.motionSeq);
        if(Number.isFinite(seq)&&seq>0)return seq;
    }
    // A stable logical cell can still have a non-grid physical contact centre.
    // Give that visual-only handoff its own normal positive event sequence so
    // later garbage cannot begin through it before the handoff has completed.
    return HEX_PHYS_EVENT_SEQ++;
}

function hexGarbagePrepareContinuousPath(g,ball,entry,from){
    if(!ball||!entry||!Array.isArray(from)||from.length<2)return;
    const v=g.vis.get(ball.id);if(!v)return;
    const oldPath=Array.isArray(ball.fallPath)?ball.fallPath:[];
    const firstLogical=oldPath[0]?.from?[...oldPath[0].from]:[entry.x,entry.y];

    if(hexGarbageContinuousDist(from,firstLogical)<=HEX_GARBAGE_HANDOFF_EPS){
        // Already exactly on the first canonical node. Leave the pre-existing
        // motion queue untouched; it owns every later transition.
        if(!oldPath.length){v.x=entry.x;v.y=entry.y;v.vy=0;v.motionSpeed=0;delete ball.fallPath;}
        return;
    }

    const seq=hexGarbageHandoffMotionSeq(oldPath);
    const seg={
        from:[...from],to:[...firstLogical],kind:"GARBAGE_CONTINUOUS_HANDOFF",
        motionSeq:seq,continuousChain:true,
        pivot:null,topPivot:null,movingSupportId:0,followSupportIds:[],
        groupSize:0,bundleId:0,
        garbageContinuousHandoff:true
    };
    const pivot=hexGarbageContinuousPivot(g,ball.id,from,firstLogical);
    if(pivot){
        seg.pivot=[...pivot.p];
        if(Array.isArray(pivot.ball?.fallPath)&&pivot.ball.fallPath.length){
            seg.followSupportIds=[pivot.id];
            seg.movingSupportId=pivot.id;
        }
    }

    // Crucial: do NOT rewrite oldPath to pileFlow and do NOT zero its
    // motionSeq. The synthetic segment participates in the same sequence as the
    // first existing event; after it is consumed, the original path proceeds
    // exactly as before.
    ball.fallPath=[seg,...oldPath];
    v.pileFlow=false;
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

/*
 * During GARBAGE the pre-existing normal pile is already at equilibrium.
 * Incoming contact must not push those settled supports away from their final
 * lattice centres; doing so made the pile itself overlap while the garbage was
 * being resolved. Keep only quiescent normal balls (no fallPath, already very
 * close to their canonical cell) fixed. Any normal ball that is genuinely
 * moving is left untouched.
 */
function hexGarbageCaptureFixedNormalPile(g){
    const fixed=[];
    if(!g||g.state!=="RESOLVING"||g.phase!=="GARBAGE")return fixed;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball||ball.isGarbage||(Array.isArray(ball.fallPath)&&ball.fallPath.length))continue;
        const v=g.vis.get(ball.id);
        if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
        if(hexGarbageContinuousDist([v.x,v.y],[x,y])>HEX_GARBAGE_FIXED_NORMAL_TOL)continue;
        // Canonical resting position is the only valid final position for a
        // quiescent pile ball. Snap before obstacle caching so contact heights
        // are computed from the same geometry that will be rendered.
        v.x=x;v.y=y;v.vy=0;v.motionSpeed=0;
        fixed.push({ball,v,x,y});
    }
    return fixed;
}

function hexGarbageProjectMovingFromFixedPile(g,fixed){
    if(!fixed.length)return;
    const H=HEX_ROW_H;
    const moving=[];
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball?.isGarbage)continue;
        const v=g.vis.get(ball.id);
        if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
        if(!(Array.isArray(ball.fallPath)&&ball.fallPath.length))continue;
        moving.push({ball,v});
    }
    if(!moving.length)return;

    for(let pass=0;pass<HEX_GARBAGE_FIXED_CONTACT_PASSES;pass++){
        let changed=false;
        for(const m of moving){
            for(const s of fixed){
                const dx=(m.v.x-s.x)*.5,dy=(m.v.y-s.y)*H;
                const d2=dx*dx+dy*dy;
                if(d2>=(HEX_GARBAGE_FIXED_CONTACT_TARGET-1e-10)**2)continue;
                let d=Math.sqrt(Math.max(0,d2)),nx,ny;
                if(d<1e-10){
                    const lx=(Number(m.ball?.rollDir)||Number(m.ball?.momentumX)||1)>0?1:-1;
                    nx=lx*.5;ny=-Math.sqrt(.75);d=1;
                }else{nx=dx/d;ny=dy/d;}
                const missing=HEX_GARBAGE_FIXED_CONTACT_TARGET-(d2<1e-20?0:Math.sqrt(d2));
                if(missing<=0)continue;
                m.v.x+=nx*missing/.5;
                m.v.y+=ny*missing/H;
                changed=true;
            }
        }
        if(!changed)break;
    }
}

function hexGarbageRestoreFixedNormalPile(fixed){
    for(const s of fixed){
        s.v.x=s.x;s.v.y=s.y;s.v.vy=0;s.v.motionSpeed=0;
    }
}

// app-22 performs its deferred full contact solve inside updateGarbagePacks().
// Wrap that whole operation so quiescent normal supports are canonical before
// its obstacle cache is built, then restore them after the solver and apply any
// remaining penetration correction to the moving garbage only.
const __hexGarbageUpdatePacksBeforeFixedNormalPile=updateGarbagePacks;
updateGarbagePacks=function(g,dt){
    const fixed=hexGarbageCaptureFixedNormalPile(g);
    const result=__hexGarbageUpdatePacksBeforeFixedNormalPile(g,dt);
    hexGarbageRestoreFixedNormalPile(fixed);
    hexGarbageProjectMovingFromFixedPile(g,fixed);
    hexGarbageRestoreFixedNormalPile(fixed);
    return result;
};
