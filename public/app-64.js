/* Final invariant repair layer discovered by exhaustive fuzzing.
 *
 * 1) A clear/support-loss collapse is one continuous pile event even when
 *    already-landed garbage balls are present. Garbage is special only while
 *    airborne; after contact it uses the same pile scheduler as normal balls.
 * 2) A triplet constraint failure keeps the largest legal rigid subset (2+1)
 *    instead of destroying all rigidity when two members can still share one
 *    rigid motion.
 * 3) Landing shadow and hard drop share one exact vertical circle-sweep.
 * 4) Landed garbage may never bridge to an obsolete waypoint above its current
 *    rendered centre. Continuous-rest metadata is synchronised with the final
 *    corrected rendered centre so there is only one physical authority.
 */
const HEX64_EPS=1e-8;
const HEX64_CONTACT_RADIUS=1.000001;
const HEX64_FINAL_CONTACT_PASSES=64;

/* ---------- clear/support-loss: no garbage-only wave fallback ---------- */
scheduleFreshPileFlow=function(g,fresh,reason="pile_flow"){
    if(reason==="clear_support_loss")scheduleFreshPileFlowPerBall(g,fresh);
    else scheduleFreshPileFlowWave(g,fresh);
};

/* ---------- exact active-piece vertical sweep ---------- */
function hex64BoardVisualObstacles(g){
    const out=[];
    if(!g?.board)return out;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball)continue;
        const v=g.vis?.get?.(ball.id);
        out.push({ball,x:v&&Number.isFinite(v.x)?v.x:x,y:v&&Number.isFinite(v.y)?v.y:y});
    }
    return out;
}
function hex64PhysicalDropClearanceRows(g,piece,residual){
    if(!g||!piece)return 0;
    const H=HEX_ROW_H,obstacles=hex64BoardVisualObstacles(g);let rows=Infinity;
    for(const cell of pieceCells(piece)){
        const x=cell[0],y=cell[1],mx=latticeRealX(x+residual),my=cellCenterYNorm(y);
        rows=Math.min(rows,Math.max(0,(FLOOR_CENTER_N-my)/H));
        for(const o of obstacles){
            const ox=latticeRealX(o.x),oy=cellCenterYNorm(o.y),dx=Math.abs(mx-ox),dy=oy-my,d0=Math.hypot(dx,dy);
            if(d0<HEX64_CONTACT_RADIUS-HEX64_EPS)return 0;
            if(dy<=0||dx>=HEX64_CONTACT_RADIUS-HEX64_EPS)continue;
            const tangentY=oy-Math.sqrt(Math.max(0,HEX64_CONTACT_RADIUS*HEX64_CONTACT_RADIUS-dx*dx));
            const dr=(tangentY-my)/H;if(dr>=-HEX64_EPS)rows=Math.min(rows,Math.max(0,dr));
        }
    }
    return Number.isFinite(rows)?Math.max(0,rows):0;
}
hexActivePhysicalDropPose=function(g,piece=g?.piece){
    if(!g||!piece)return null;
    const residual=hexContinuousResidualX(g);let p={...piece};let remaining=hex64PhysicalDropClearanceRows(g,p,residual);
    const legacyFits=typeof __hexPieceFitsBeforeContinuousLegality==="function"?__hexPieceFitsBeforeContinuousLegality:pieceFits;
    let guard=0;
    while(remaining>=2-1e-7&&guard++<ROWS+8){const next={...p,y:p.y+2};if(!legacyFits(g.board,next))break;p=next;remaining=Math.max(0,remaining-2);}
    const frac=Math.max(0,Math.min(2,remaining));return{piece:p,frac,dx:residual,cells:pieceCells(p)};
};
landingShadowVisualCells=function(g){const pose=hexActivePhysicalDropPose(g);if(!pose)return null;return pose.cells.map(cell=>[cell[0]+pose.dx,cell[1]+pose.frac,cell[2]]);};
hardDrop=function(g){
    if(g.state!=="PLAYING"||!g.piece||g.hardDropAnim)return;
    const pose=hexActivePhysicalDropPose(g);if(!pose)return;
    armHardDropImpact(g,pose.piece,pose.dx,pose.frac);g.piece={...pose.piece};
    g.dropT=g.dropInterval*Math.max(0,Math.min(2,pose.frac))/2;emit(g,{t:"drop"});lock(g,5);
};

/* ---------- rigid triplet -> maximal legal 2+1 subset ---------- */
const __hex64PlanGroupBeforeMaxSubset=hexPhysPlanGroup;
function hex64GroupSnapshot(m){const b=m.ball;return{motionGroupId:b.motionGroupId,motionGroupRole:b.motionGroupRole,motionGroupOrientation:b.motionGroupOrientation,motionGroupSize:b.motionGroupSize,rigid:b.rigid,visualTripletId:b.visualTripletId,visualTripletOrientation:b.visualTripletOrientation,visualTripletRole:b.visualTripletRole};}
function hex64RestoreGroup(m,s){Object.assign(m.ball,s);}
function hex64ProbePair(board,pair){
    const fake=pair.map((m,i)=>({...m,ball:{...m.ball,motionGroupSize:2,motionGroupRole:i,rigid:true}}));
    const old=board._hexContinuousSubsetProbe;board._hexContinuousSubsetProbe=true;
    try{return __hex64PlanGroupBeforeMaxSubset(board,fake,true)||[];}
    finally{if(old===undefined)delete board._hexContinuousSubsetProbe;else board._hexContinuousSubsetProbe=old;}
}
hexPhysPlanGroup=function(board,members,preview=false){
    if(!Array.isArray(members)||members.length!==3)return __hex64PlanGroupBeforeMaxSubset(board,members,preview)||[];
    const snapshots=members.map(hex64GroupSnapshot),full=__hex64PlanGroupBeforeMaxSubset(board,members,preview)||[];if(full.length)return full;
    for(let i=0;i<members.length;i++)hex64RestoreGroup(members[i],snapshots[i]);
    let physicalHit=0;for(const m of members)if(m.ball?._hexContinuousConstraintBreak){physicalHit=m.ball.id;break;}
    const candidates=[];
    for(let omit=0;omit<3;omit++){const pair=members.filter((_,i)=>i!==omit),plan=hex64ProbePair(board,pair);if(plan.length)candidates.push({omit,pair,plan,detached:members[omit].ball.id});}
    if(!candidates.length){if(!preview)for(const m of members){hexPhysClearGroupBall(m.ball);m.ball.rigid=false;m.ball.visualTripletId=0;m.ball.visualTripletOrientation="";m.ball.visualTripletRole=-1;}return[];}
    candidates.sort((a,b)=>(a.detached===physicalHit?-1:0)-(b.detached===physicalHit?-1:0)||a.detached-b.detached);
    const chosen=candidates[0];if(preview)return chosen.plan;
    const gid=snapshots[0].motionGroupId||snapshots[1].motionGroupId||snapshots[2].motionGroupId||0;
    const orientation=snapshots[0].motionGroupOrientation||snapshots[1].motionGroupOrientation||snapshots[2].motionGroupOrientation||"";
    for(const m of members){m.ball.visualTripletId=0;m.ball.visualTripletOrientation="";m.ball.visualTripletRole=-1;}
    const detached=members[chosen.omit];hexPhysClearGroupBall(detached.ball);detached.ball.rigid=false;
    chosen.pair.forEach((m,i)=>{m.ball.motionGroupId=gid;m.ball.motionGroupRole=i;m.ball.motionGroupOrientation=orientation;m.ball.motionGroupSize=2;m.ball.rigid=true;});
    const plan=__hex64PlanGroupBeforeMaxSubset(board,chosen.pair,false)||[];if(plan.length)return plan;
    for(const m of members){hexPhysClearGroupBall(m.ball);m.ball.rigid=false;}return[];
};

/* ---------- monotone landed-garbage path authority ---------- */
function hex64SetContinuousRestFromVisual(ball,v){
    if(!ball||!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))return;
    const old=ball._hexGarbageContinuousRest;
    ball._hexGarbageContinuousRest={px:v.x*.5,py:cellCenterYNorm(v.y),groupKey:old?.groupKey||ball._hexGarbageRelax?.groupKey||""};
}
function hex64RepairFirstSegmentGeometry(seg,from){
    if(!seg)return;seg.from=[from[0],from[1]];
    if(seg.pivot&&Math.abs(hexPhysDist(from[0],from[1],seg.pivot[0],seg.pivot[1])-1)>.03){seg.pivot=null;seg.topPivot=null;seg.followSupportIds=[];seg.movingSupportId=0;}
}
function hex64RescheduleRebasedSegment(g,seg,v){
    if(!seg?.pileFlow)return;
    const state={vy:Math.max(0,v?.vy||0),speed:Math.max(0,v?.motionSpeed||0)},duration=Math.max(1/120,pileFlowNominalDuration(seg,state));
    seg.pileFlowStart=Math.max(0,Number(g.pileFlowClock)||0);seg.pileFlowDuration=duration;seg.pileFlowEnd=seg.pileFlowStart+duration;
}
function hex64SanitizeGarbagePath(g,ball){
    if(!ball?.isGarbage||!Array.isArray(ball.fallPath)||!ball.fallPath.length)return false;
    const v=g.vis?.get?.(ball.id);if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))return false;
    const src=ball.fallPath,kept=[];let from=[v.x,v.y],changed=false,needRebase=true;
    for(const seg of src){
        if(!seg?.to){changed=true;continue;}
        const target=[seg.to[0],seg.to[1]];
        if(target[1]<from[1]-HEX64_EPS){changed=true;continue;}
        if(needRebase){
            if(!seg.from||Math.abs(seg.from[0]-from[0])>HEX64_EPS||Math.abs(seg.from[1]-from[1])>HEX64_EPS){hex64RepairFirstSegmentGeometry(seg,from);hex64RescheduleRebasedSegment(g,seg,v);changed=true;}
            needRebase=false;
        }
        kept.push(seg);from=target;
    }
    if(changed)ball.fallPath=kept;
    if(!kept.length&&!ball._hexGarbageRelax){hex64SetContinuousRestFromVisual(ball,v);delete ball._hexContinuousSettled;}
    return changed;
}
const __hex64PrepareContinuousPathBeforeMonotone=hexGarbagePrepareContinuousPath;
hexGarbagePrepareContinuousPath=function(g,ball,cell,from){const result=__hex64PrepareContinuousPathBeforeMonotone(g,ball,cell,from);hex64SanitizeGarbagePath(g,ball);return result;};
function hex64SanitizeAllGarbagePaths(g){
    if(!g?.board)return 0;let n=0;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const ball=valid(x,y)?g.board[y][x]:null;if(ball&&hex64SanitizeGarbagePath(g,ball))n++;}
    return n;
}
function hex64SyncContinuousRests(g){
    if(!g?.board)return;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null;if(!ball?._hexGarbageContinuousRest||ball._hexGarbageRelax||ball.fallPath?.length)continue;
        const v=g.vis?.get?.(ball.id);if(v)hex64SetContinuousRestFromVisual(ball,v);
    }
}

/* Final unilateral contact solve. It never moves a landed garbage centre up.
 * Horizontal separation is used first. If side-wall width is exhausted, only
 * the lower movable garbage centre may move farther down. Any corrected moving
 * path is rebased on the corrected centre so the next frame cannot snap back.
 */
function hex64VisualItems(g){
    const out=[];if(!g?.board||!g?.vis)return out;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null,v=ball&&g.vis.get(ball.id);
        if(ball&&v&&Number.isFinite(v.x)&&Number.isFinite(v.y))out.push({ball,v});
    }
    return out;
}
function hex64ApplyCorrectedAuthority(g,item){
    const {ball,v}=item;
    if(ball._hexGarbageRelax){ball._hexGarbageRelax.px=v.x*.5;ball._hexGarbageRelax.py=cellCenterYNorm(v.y);}
    if(ball._hexGarbageContinuousRest)hex64SetContinuousRestFromVisual(ball,v);
    if(Array.isArray(ball.fallPath)&&ball.fallPath.length){
        const seg=ball.fallPath[0];
        if(seg?.to&&seg.to[1]>=v.y-HEX64_EPS){hex64RepairFirstSegmentGeometry(seg,[v.x,v.y]);hex64RescheduleRebasedSegment(g,seg,v);}
        hex64SanitizeGarbagePath(g,ball);
    }
}
function hex64MoveHorizontal(item,realDx){item.v.x+=realDx/.5;item.v.x=Math.max(0,Math.min(W2-1,item.v.x));}
function hex64MoveDown(item,realDy){if(realDy<=0)return;const maxY=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H;item.v.y=Math.min(maxY,item.v.y+realDy/HEX_ROW_H);}
function hex64ResolveGarbagePair(a,b){
    const ma=!!a.ball?.isGarbage,mb=!!b.ball?.isGarbage;if(!ma&&!mb)return false;
    let ax=a.v.x*.5,bx=b.v.x*.5,ay=cellCenterYNorm(a.v.y),by=cellCenterYNorm(b.v.y),dx=ax-bx,dy=ay-by,d=Math.hypot(dx,dy);
    if(d>=HEX64_CONTACT_RADIUS-HEX64_EPS)return false;
    const maxX=(W2-1)*.5;
    let side=Math.abs(dx)>HEX64_EPS?Math.sign(dx):((a.ball.id||0)<(b.ball.id||0)?-1:1);
    const reqX=Math.abs(dy)>=HEX64_CONTACT_RADIUS?0:Math.sqrt(Math.max(0,HEX64_CONTACT_RADIUS*HEX64_CONTACT_RADIUS-dy*dy));
    let signed=side*dx,need=Math.max(0,reqX-signed),moveA=0,moveB=0;
    const availA=ma?Math.max(0,side>0?maxX-ax:ax):0,availB=mb?Math.max(0,side>0?bx:maxX-bx):0;
    if(ma&&mb){moveA=Math.min(need*.5,availA);moveB=Math.min(need-moveA,availB);if(moveA+moveB<need){const x=Math.min(need-moveA-moveB,Math.max(0,availA-moveA));moveA+=x;const y=Math.min(need-moveA-moveB,Math.max(0,availB-moveB));moveB+=y;}}
    else if(ma)moveA=Math.min(need,availA);else if(mb)moveB=Math.min(need,availB);
    if(moveA)hex64MoveHorizontal(a,side*moveA);if(moveB)hex64MoveHorizontal(b,-side*moveB);

    ax=a.v.x*.5;bx=b.v.x*.5;ay=cellCenterYNorm(a.v.y);by=cellCenterYNorm(b.v.y);dx=ax-bx;dy=ay-by;d=Math.hypot(dx,dy);
    if(d<HEX64_CONTACT_RADIUS-HEX64_EPS){
        const reqY=Math.abs(dx)>=HEX64_CONTACT_RADIUS?0:Math.sqrt(Math.max(0,HEX64_CONTACT_RADIUS*HEX64_CONTACT_RADIUS-dx*dx));
        const missing=Math.max(0,reqY-Math.abs(dy));
        if(missing>0){
            if(dy>=0&&ma)hex64MoveDown(a,missing);
            else if(dy<0&&mb)hex64MoveDown(b,missing);
            else if(dy>=0&&mb&&ma)hex64MoveDown(a,missing);
            else if(dy<0&&ma&&mb)hex64MoveDown(b,missing);
        }
    }
    return true;
}
function hex64ResolveFinalGarbageContacts(g){
    const items=hex64VisualItems(g);if(items.length<2)return;
    const touched=new Set();
    for(let pass=0;pass<HEX64_FINAL_CONTACT_PASSES;pass++){
        let changed=false;
        for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
            const a=items[i],b=items[j],beforeA=[a.v.x,a.v.y],beforeB=[b.v.x,b.v.y];
            if(!hex64ResolveGarbagePair(a,b))continue;
            if(Math.abs(a.v.x-beforeA[0])>HEX64_EPS||Math.abs(a.v.y-beforeA[1])>HEX64_EPS){touched.add(a);changed=true;}
            if(Math.abs(b.v.x-beforeB[0])>HEX64_EPS||Math.abs(b.v.y-beforeB[1])>HEX64_EPS){touched.add(b);changed=true;}
        }
        if(!changed)break;
    }
    for(const item of touched)if(item.ball?.isGarbage)hex64ApplyCorrectedAuthority(g,item);
}
function hex64ClampGarbageMonotone(g,prev){
    if(!g?.board||!g?.vis)return;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null,v=ball&&g.vis.get(ball.id),py=ball&&prev.get(ball.id);
        if(ball?.isGarbage&&v&&Number.isFinite(py)&&v.y<py-HEX64_EPS){v.y=py;v.vy=0;}
    }
}

const __hex64StepBeforeFinalInvariants=stepEngine;
stepEngine=function(g,dt){
    const prev=new Map();
    if(g?.board&&g?.vis)for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const ball=valid(x,y)?g.board[y][x]:null,v=ball&&g.vis.get(ball.id);if(ball&&v&&Number.isFinite(v.y))prev.set(ball.id,v.y);}
    const result=__hex64StepBeforeFinalInvariants(g,dt);
    if(g?.state==="RESOLVING"&&g?.board&&g?.vis){
        hex64ClampGarbageMonotone(g,prev);hex64SanitizeAllGarbagePaths(g);
        if(typeof hexEnforceFinalVisualNonOverlap==="function")hexEnforceFinalVisualNonOverlap(g);
        // The legacy final solver may use a tiny upward numerical projection.
        // Restore monotonic Y, then recover separation only sideways/downward.
        hex64ClampGarbageMonotone(g,prev);hex64ResolveFinalGarbageContacts(g);
        hex64SyncContinuousRests(g);
        if(typeof hexCanonicalizeContinuousRests==="function")hexCanonicalizeContinuousRests(g);
    }
    return result;
};
