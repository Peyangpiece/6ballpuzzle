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
const HEX_GARBAGE_FIXED_CONTACT_TARGET=1.00000005;
const HEX_GARBAGE_FIXED_CONTACT_PASSES=8;

function hexGarbageContinuousDist(a,b){
    return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);
}

function hexGarbageBallStillMoving(ball){
    return !!(ball&&Array.isArray(ball.fallPath)&&ball.fallPath.length);
}

function hexGarbageContinuousPivot(g,ballId,from,to){
    let best=null;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const b=valid(x,y)?g.board[y][x]:null;
        if(!b||b.id===ballId)continue;
        // A garbage ball is not pile geometry until its own motion is finished.
        // Moving garbage may geometrically cross/touch another garbage ball but
        // must never become a pivot that makes the latter gridify or roll.
        if(b.isGarbage&&hexGarbageBallStillMoving(b))continue;
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

/*
 * app-22 lets gridified garbage join the obstacle list after a packet's first
 * real pile/floor contact. Refine that rule here: a gridified garbage member is
 * still moving while it has fallPath, so it is NOT a support yet. This keeps
 * the earlier invariant intact: garbage-to-garbage contact during motion does
 * not cause a stop or split. Only a garbage ball whose complete path has ended
 * is accumulated pile geometry for later airborne members.
 */
function hexGarbageObstacleStopsAirborne(frame,entry,splitTriggered){
    if(!entry?.isGarbage)return true;
    if(!splitTriggered)return false;
    const ball=frame?.byId?.get(entry.id);
    return !!ball&&!hexGarbageBallStillMoving(ball);
}

hexGarbageBallContactY=function(g,pack,index){
    if(!pack?.pat?.[index])return Infinity;
    const frame=hexGarbageObstacleFrame(g);
    const splitTriggered=!!pack._hexSplitTriggered;
    const perf=hexGarbagePerfState(g);perf.contactQueries++;
    const [dx,dy]=pack.pat[index],px=pack.ax+dx,H=HEX_ROW_H;
    let limit=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/H-dy;

    // Use live visuals when a normal pile member is genuinely moving; otherwise
    // the one-frame cache is equivalent and avoids repeated board scans.
    if(frame.hasMovingNormal){
        for(const [id,ov]of g.vis.entries()){
            if(!ov||!Number.isFinite(ov.x)||!Number.isFinite(ov.y))continue;
            const obstacle=hexGarbageBoardBallById(g,id);if(!obstacle)continue;
            const entry={id,x:ov.x,y:ov.y,isGarbage:!!obstacle.isGarbage};
            if(!hexGarbageObstacleStopsAirborne(frame,entry,splitTriggered))continue;
            const hx=Math.abs((px-ov.x)*.5);if(hx>=1-1e-10)continue;
            const vertical=Math.sqrt(Math.max(0,1-hx*hx))/H;
            limit=Math.min(limit,ov.y-dy-vertical);
        }
        return limit;
    }

    for(const ov of frame.obstacles){
        if(!hexGarbageObstacleStopsAirborne(frame,ov,splitTriggered))continue;
        const hx=Math.abs((px-ov.x)*.5);if(hx>=1-1e-10)continue;
        const vertical=Math.sqrt(Math.max(0,1-hx*hx))/H;
        limit=Math.min(limit,ov.y-dy-vertical);
    }
    return limit;
};

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

function hexGarbageContactPointReserved(g,x,y){
    // The logical-cell reservation in app-17 protects future lattice nodes, but
    // a continuous handoff begins at the physical contact centre, which may be
    // between lattice nodes. Reserve that exact centre against every remaining
    // visual path as well. If a prior moving ball will pass within one diameter,
    // keep this member airborne and retry after the corridor clears.
    if(typeof __hexdropGarbageCellCrossesActivePath==="function"&&__hexdropGarbageCellCrossesActivePath(g,x,y))return true;

    // The one-frame obstacle cache is intentionally not rebuilt after every
    // member materializes. Therefore another member can become settled during
    // this same update even though it was absent from the cached contact-height
    // calculation. Guard the exact continuous handoff centre against ALL board
    // balls using live visual centres. Tangent contact at one diameter is legal;
    // only penetration/centre coincidence delays this member to the next frame.
    for(let by=boardScanMin(g.board);by<ROWS;by++)for(let bx=0;bx<W2;bx++){
        const b=valid(bx,by)?g.board[by][bx]:null;
        if(!b)continue;
        const v=g.vis.get(b.id);
        if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
        if(hexPhysDist(v.x,v.y,x,y)<HEX_MIN_DIST-1e-7)return true;
    }
    return false;
}

const __hexGarbageMaterializeBeforeContinuousHandoff=materializeGarbageBallAtContact;
materializeGarbageBallAtContact=function(g,pack,index,contactAnchorY){
    const slot=pack?.pat?.[index];
    if(!slot)return false;
    const exactX=pack.ax+slot[0],exactY=contactAnchorY+slot[1];

    // Do not convert an airborne member into a board ball at a centre that is
    // currently occupied OR will be traversed by an earlier active path. This
    // is the continuous-coordinate equivalent of reserving an intermediate
    // lattice cell and prevents a waiting handoff from being hit later.
    if(hexGarbageContactPointReserved(g,exactX,exactY))return false;

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
 * A normal ball with no fallPath is therefore final, not an object that should
 * be displaced by an incoming visual contact solve. Canonicalize every such
 * ball to its logical lattice centre before contact heights and arc pivots are
 * computed. This also repairs any stale sub-cell drift left by an earlier
 * visual projection instead of letting that drift distort the next contact arc.
 */
function hexGarbageCaptureFixedNormalPile(g){
    const fixed=[];
    if(!g||g.state!=="RESOLVING"||g.phase!=="GARBAGE")return fixed;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball||ball.isGarbage||(Array.isArray(ball.fallPath)&&ball.fallPath.length))continue;
        const v=g.vis.get(ball.id);
        if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
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
        if(!hexGarbageBallStillMoving(ball))continue;
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
                const rawD=Math.sqrt(Math.max(0,d2));
                let nx,ny;
                if(rawD<1e-10){
                    const lx=(Number(m.ball?.rollDir)||Number(m.ball?.momentumX)||1)>0?1:-1;
                    nx=lx*.5;ny=-Math.sqrt(.75);
                }else{nx=dx/rawD;ny=dy/rawD;}
                const missing=HEX_GARBAGE_FIXED_CONTACT_TARGET-rawD;
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
// its obstacle cache and continuous pivots are built, then restore them after
// the solver. Any numerical penetration is corrected on moving garbage only.
const __hexGarbageUpdatePacksBeforeFixedNormalPile=updateGarbagePacks;
updateGarbagePacks=function(g,dt){
    const fixed=hexGarbageCaptureFixedNormalPile(g);
    const result=__hexGarbageUpdatePacksBeforeFixedNormalPile(g,dt);
    hexGarbageRestoreFixedNormalPile(fixed);
    hexGarbageProjectMovingFromFixedPile(g,fixed);
    hexGarbageRestoreFixedNormalPile(fixed);
    return result;
};

/*
 * A pile-flow path can be planned while a garbage support is still moving. In
 * that moment repairPileFlowSegmentGeometry correctly refuses to use it as a
 * pivot. By the time the visual segment actually starts, however, the support
 * may already have reached its final lattice cell. Re-check diagonal downhill
 * segments at render time and promote a newly-settled garbage ball to the true
 * circular pivot whenever both endpoints are exactly tangent to it.
 */
function hexGarbageAttachLateSettledPivot(g,cell,seg){
    if(!g||!cell||!seg?.pileFlow||seg.pivot||seg.topPivot)return false;
    if(pileFlowSupportIds(seg).length)return false;
    if(!seg.from||!seg.to)return false;
    const dx=seg.to[0]-seg.from[0],dy=seg.to[1]-seg.from[1];
    if(dy!==1||Math.abs(dx)!==1)return false;
    const candidates=[[seg.from[0]+2*dx,seg.from[1]],[seg.from[0]-dx,seg.from[1]+1]];
    for(const [px,py]of candidates){
        if(!valid(px,py))continue;
        const support=g.board[py][px];
        if(!support||support===cell||!support.isGarbage||hexGarbageBallStillMoving(support))continue;
        const d0=hexGarbageContinuousDist(seg.from,[px,py]);
        const d1=hexGarbageContinuousDist(seg.to,[px,py]);
        if(Math.abs(d0-1)>1e-6||Math.abs(d1-1)>1e-6)continue;
        seg.pivot=[px,py];
        seg.pileFlowLateGarbagePivot=true;
        // The schedule/duration remains unchanged, but replace the old linear
        // progress map with a gravity-shaped angular profile so geometry is a
        // true tangent arc rather than a chord through the support.
        delete seg._hexGravityLinear;
        if(typeof hexBuildPileGravityArcProfile==="function"){
            const v0=Math.max(HEX_PILE_GRAVITY_MIN_SPEED||0.35,Number(seg._hexGravityEntrySpeed)||0.35);
            const profile=hexBuildPileGravityArcProfile(seg,v0);
            if(profile)seg._hexGravityProfile=profile;
        }
        return true;
    }
    return false;
}

const __hexGarbageUpdateScheduledPileFlowBeforeLatePivot=updateScheduledPileFlowVisual;
updateScheduledPileFlowVisual=function(g,cell,v,dt){
    const seg=Array.isArray(cell?.fallPath)&&cell.fallPath.length?cell.fallPath[0]:null;
    if(seg?.pileFlow)hexGarbageAttachLateSettledPivot(g,cell,seg);
    return __hexGarbageUpdateScheduledPileFlowBeforeLatePivot(g,cell,v,dt);
};
