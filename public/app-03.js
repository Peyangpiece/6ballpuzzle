/* HEXDROP unified event resolver.
 * One explicit ▲ center-convex split, no legacy rescue path or staged waves.
 */
function physicalContactInfo(b,x,y){
    const s=hexPhysSupportInfo(b,x,y);
    const tangent=[];
    if(s.left.valid&&s.left.ball)tangent.push({dx:-1,x:s.left.x,y:s.left.y,ball:s.left.ball});
    if(s.right.valid&&s.right.ball)tangent.push({dx:1,x:s.right.x,y:s.right.y,ball:s.right.ball});
    const directBelow=valid(x,y+2)&&b[y+2][x]?{x,y:y+2,ball:b[y+2][x]}:null;
    return {tangent,directBelow};
}
function rawNaturalProposal(b,x,y){return hexPhysNaturalMotion(b,x,y,null);}
function buildContactAwareProposals(b,bannedIds=new Set()){return hexPhysContactEntries(b,bannedIds);}

function slopeRigidGroups(b){return hexPhysGroups(b);}
function slopeRigidExpectedMemberCount(members){return members?.length||0;}
function clearSlopeRigidGroup(members){for(const m of members||[])hexPhysClearGroupBall(m.ball);}
function slopeRigidExternalContacts(b,members){
    const own=new Set((members||[]).map(m=>m.ball.id)),out=[];
    for(const m of members||[]){
        if(touchesFloorRow(m.y))out.push({kind:"floor",memberId:m.ball.id,x:m.x,y:ROWS,side:0});
        for(const dx of [-1,1]){
            const x=m.x+dx,y=m.y+1,q=valid(x,y)?b[y][x]:null;
            if(q&&!own.has(q.id))out.push({kind:"ball",memberId:m.ball.id,supportId:q.id,x,y,side:dx});
        }
    }
    return out;
}
function rigidBodyContinuation(b,members){
    const plan=hexPhysPlanGroup(b,members,true);
    if(!plan.length)return {move:false,dx:0,dy:0,mode:"rest",breakRequired:false,contacts:slopeRigidExternalContacts(b,members)};
    const p=plan[0];
    return {move:true,dx:p.tx-p.x,dy:p.ty-p.y,mode:p.kind,breakRequired:false,contacts:slopeRigidExternalContacts(b,members)};
}
function advanceSlopeRigidGroups(b,preview=false){
    hexPhysAdoptGroups(b);
    const groups=hexPhysGroups(b);
    for(const members of groups.values()){
        const plan=hexPhysPlanGroup(b,members,preview);
        if(plan.length)return {moved:true,heldIds:new Set(members.map(m=>m.ball.id)),released:false,plan};
    }
    return {moved:false,heldIds:new Set(),released:false,plan:[]};
}
function rigidDifferentialConstraint(b,members){
    const motions=(members||[]).map(m=>hexPhysIndependentMemberMotion(b,members,m));
    const moving=motions.filter(Boolean);
    if(!moving.length)return {breakRequired:false,reason:"rigid_rest",moves:motions};
    if(moving.length!==members.length)return {breakRequired:true,reason:"member_pinned",moves:motions};
    const separator=hexPhysUpConvexSeparator(b,members,motions);
    return {breakRequired:!!separator,reason:separator?"up_convex_separator":"rigid_slope",moves:motions};
}

function hexPhysBundleKey(p){return p.bundleId?"g:"+p.bundleId:"b:"+p.ball.id;}
function hexPhysCandidateBundles(proposals){
    const mp=new Map();
    for(const p of proposals){const k=hexPhysBundleKey(p);if(!mp.has(k))mp.set(k,[]);mp.get(k).push(p);}
    return [...mp.values()].sort((a,b)=>{
        const ay=Math.max(...a.map(p=>p.y)),by=Math.max(...b.map(p=>p.y));
        if(ay!==by)return by-ay;
        return Math.min(...a.map(p=>p.x))-Math.min(...b.map(p=>p.x));
    });
}
function hexPhysBundleTargetsFree(bundle,b,accepted){
    const own=new Set(bundle.map(p=>p.ball.id));
    const vacating=new Set([...bundle,...accepted].map(p=>p.ball.id));
    const targets=new Set();
    for(const p of bundle){
        if(!valid(p.tx,p.ty))return false;
        const k=p.tx+","+p.ty;if(targets.has(k))return false;targets.add(k);
        const q=b[p.ty][p.tx];
        if(q&&!own.has(q.id)&&!vacating.has(q.id))return false;
    }
    return true;
}
function hexPhysBundleSafe(bundle,b,accepted){
    const movingIds=new Set([...bundle,...accepted].map(p=>p.ball.id));
    for(const p of bundle)if(hexPhysPathHitsStationary(p,b,movingIds))return false;
    for(const p of bundle)for(const q of accepted){
        const linked=(p.followSupportIds||[]).includes(q.ball.id)||(q.followSupportIds||[]).includes(p.ball.id);
        if(!linked&&proposalsSweepOverlap(p,q))return false;
    }
    for(let i=0;i<bundle.length;i++)for(let j=i+1;j<bundle.length;j++){
        const a=bundle[i],z=bundle[j];
        const linked=(a.followSupportIds||[]).includes(z.ball.id)||(z.followSupportIds||[]).includes(a.ball.id)||a.bundleId===z.bundleId;
        if(!linked&&proposalsSweepOverlap(a,z))return false;
    }
    return true;
}
function hexPhysResolveEvent(b,preview=false){
    hexPhysAdoptGroups(b);
    const groupedIds=new Set();
    const groupPlans=[];
    for(const members of hexPhysGroups(b).values()){
        for(const m of members)groupedIds.add(m.ball.id);
        const p=hexPhysPlanGroup(b,members,preview);
        if(p.length)groupPlans.push(...p);
    }
    const independent=hexPhysContactEntries(b,groupedIds);
    const proposals=[...groupPlans,...independent];
    if(!proposals.length)return [];

    const accepted=[];
    for(const bundle of hexPhysCandidateBundles(proposals)){
        if(!hexPhysBundleTargetsFree(bundle,b,accepted))continue;
        if(!hexPhysBundleSafe(bundle,b,accepted))continue;
        accepted.push(...bundle);
        if(preview)return accepted.slice(0,1);
    }
    return accepted;
}
function hexPhysAppendSegment(ball,p,eventSeq){
    // AI evaluation boards store cells as primitive colour numbers. They need
    // logical gravity resolution only and must never receive render metadata.
    // Writing fallPath/rollDir to a number throws in strict-mode runtimes and
    // aborts the shared requestAnimationFrame loop, freezing both boards.
    if(!ball || typeof ball!=="object")return;
    if(!Array.isArray(ball.fallPath))ball.fallPath=[];
    const seg={
        from:[p.x,p.y],to:[p.tx,p.ty],
        pivot:p.pivot||null,topPivot:p.topPivot||null,
        movingSupportId:(p.followSupportIds&&p.followSupportIds[0])||0,
        followSupportIds:[...(p.followSupportIds||[])],
        kind:p.kind||"",motionSeq:eventSeq,
        continuousChain:true,
        groupSize:p.groupSize||0,
        bundleId:p.bundleId||0
    };
    const last=ball.fallPath[ball.fallPath.length-1];
    if(!last||last.to[0]!==seg.to[0]||last.to[1]!==seg.to[1])ball.fallPath.push(seg);
    const dx=p.tx-p.x,dy=p.ty-p.y;
    if(dx){ball.rollDir=Math.sign(dx);ball.momentumX=Math.sign(dx);ball.subCellBias=Math.sign(dx);ball.impactOffsetX=0;}
    else if(dy>=2)ball.rollDir=0;
    ball.forceSplit=false;ball.fallBias=0;ball.fallBiasTTL=0;ball.fixedGarbage=false;
}
function hexPhysApplyEvent(b,accepted){
    if(!accepted.length)return false;
    clearBoardEquilibriumLocks(b);
    const seq=HEX_PHYS_EVENT_SEQ++;
    for(const p of accepted)if(b[p.y][p.x]===p.ball)b[p.y][p.x]=null;
    const placed=[];
    for(const p of accepted){
        if(!valid(p.tx,p.ty)||b[p.ty][p.tx])continue;
        b[p.ty][p.tx]=p.ball;noteBoardCell(b,p.ty,p.ball);placed.push(p);
    }
    for(const p of placed)hexPhysAppendSegment(p.ball,p,seq);
    return placed.length>0;
}

function settlePass(b,preview=false){
    const accepted=hexPhysResolveEvent(b,preview);
    if(preview)return accepted.length>0;
    return hexPhysApplyEvent(b,accepted);
}
const settleAll=(b)=>{
    const cap=(ROWS-BOARD_MIN_ROW)*W2*4;
    let moved=false;
    for(let i=0;i<cap;i++){
        const q=settlePass(b,false);
        if(!q)break;
        moved=true;
    }
    for(const members of hexPhysGroups(b).values()){
        const plan=hexPhysPlanGroup(b,members,true);
        if(!plan.length)for(const m of members)hexPhysClearGroupBall(m.ball);
    }
    return moved||!boardHasIllegalFloat(b);
};
const hasLegalGravityMove=(b)=>settlePass(b,true);

function enforceParityPhysicsMode(g){
    if(!g)return;
    g.activeCluster=null;g.landingSpecial=null;g.rigidSlideDir=0;g.rigidSlideSteps=0;
}
function physicsSignature(gOrBoard){
    const b=Array.isArray(gOrBoard)?gOrBoard:gOrBoard?.board;
    if(!b)return "";
    const a=[];
    for(let y=boardScanMin(b);y<ROWS;y++)for(let x=0;x<W2;x++){
        const v=valid(x,y)?b[y][x]:null;if(v)a.push(v.id+"@"+x+","+y);
    }
    return a.join("|");
}

function commonRigidMomentumDir(members){
    let d=0;for(const m of members||[]){const q=hexPhysBias(m.ball);if(!q)continue;if(d&&d!==q)return 0;d=q;}return d;
}
function rigidContactPreferredDir(contacts,members){
    const sum=(contacts||[]).filter(c=>c.kind==="ball").reduce((n,c)=>n+Math.sign(c.side||0),0);
    return sum?-Math.sign(sum):commonRigidMomentumDir(members);
}
function rigidMemberIndependentMove(b,members,m){
    const p=hexPhysIndependentMemberMotion(b,members,m);return p?{dx:p.tx-p.x,dy:p.ty-p.y,to:[p.tx,p.ty]}:null;
}
function slopeRigidTranslationSafe(b,members,dx,dy){return hexPhysTranslationSafe(b,members,dx,dy);}
function applySlopeRigidTranslation(b,members,dx,dy){
    const bundle=members[0]?.ball?.motionGroupId||HEX_PHYS_GROUP_SEQ++;
    return hexPhysApplyEvent(b,members.map(m=>({x:m.x,y:m.y,tx:m.x+dx,ty:m.y+dy,ball:m.ball,kind:"GROUP_TRANSLATE",pivot:null,topPivot:null,followSupportIds:[],bundleId:bundle,groupSize:members.length})));
}
