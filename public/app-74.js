/* HEXDROP hard-drop post-contact continuity.
 *
 * The landing guide is the exact physical contact pose. Two details matter at
 * the active-piece -> pile hand-off:
 *   1) a stable fractional contact must remain at that exact pose instead of
 *      snapping to a bookkeeping lattice centre;
 *   2) when the next logical rigid translation connects two tangent poses
 *      around the same support, the visual path must follow the support circle.
 *      A straight chord between those tangent endpoints cuts through the
 *      support and forces the contact solver to deform/recoil the triplet.
 *
 * The resulting 3-ball kinematic pose is collision-checked before the ordinary
 * visual contact pass. If it is already safe, the contact pass is not allowed
 * to perturb that rigid body afterwards. This preserves the exact guide pose,
 * exact pair distances, and monotonic downward motion at the same time.
 */
const __hex74HardDropBeforeContinuity=hardDrop;
const __hex74UpdateVisualsBeforeContinuity=updateVisuals;
const __hex74StepBeforeContinuity=stepEngine;
const __hex74NearlySettledBeforeContinuity=nearlySettled;
const __hex74RenderMobilityBeforeContinuity=typeof hexRenderMobility==="function"?hexRenderMobility:null;
const __hex74LiveBatchPointAtBeforeContinuity=typeof liveBatchPointAt==="function"?liveBatchPointAt:null;
const __hex74MotionDurationBeforeContinuity=typeof hexMotionDuration==="function"?hexMotionDuration:null;
const __hex74ResolveContactsBeforeContinuity=typeof resolveVisualContacts==="function"?resolveVisualContacts:null;

const HEX74_CONTACT_MIN_DIST=0.9998;
const HEX74_TANGENT_EPS=0.025;
const HEX74_ARC_SAMPLES=48;

function hex74EachBall(g,fn){
    if(!g?.board)return;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const b=valid(x,y)?g.board[y][x]:null;if(b)fn(b,x,y);
    }
}
function hex74FindById(g,id){
    let out=null;
    hex74EachBall(g,(b,x,y)=>{if(!out&&b.id===id)out={b,x,y};});
    return out;
}
function hex74StableContactMarker(b){return b?.hardDropContactHold||b?._hexHardDropContinuousRest||null;}
function hex74Dist(a,b){return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);}
function hex74ArcPoint(meta,t){
    t=Math.max(0,Math.min(1,t));
    const a=meta.a0+meta.da*t,p=meta.pivot;
    return[p[0]+Math.cos(a)/.5,p[1]+Math.sin(a)/HEX_ROW_H];
}
function hex74ShortestArc(from,to,pivot){
    const a0=Math.atan2((from[1]-pivot[1])*HEX_ROW_H,(from[0]-pivot[0])*.5);
    const a1=Math.atan2((to[1]-pivot[1])*HEX_ROW_H,(to[0]-pivot[0])*.5);
    let da=a1-a0;while(da>Math.PI)da-=TAU;while(da<-Math.PI)da+=TAU;
    return{a0,da};
}
function hex74ObstacleItems(g,exclude){
    const out=[];
    hex74EachBall(g,(ball,x,y)=>{
        if(exclude.has(ball.id))return;
        const v=g.vis.get(ball.id);
        if(v&&Number.isFinite(v.x)&&Number.isFinite(v.y))out.push({ball,p:[v.x,v.y]});
        else out.push({ball,p:[x,y]});
    });
    return out;
}
function hex74RigidLinearSafe(members,obstacles){
    const maxY=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H;
    for(let k=0;k<=32;k++){
        const t=k/32;
        for(const m of members){
            const s=m.seg.from,e=m.seg.to,p=[s[0]+(e[0]-s[0])*t,s[1]+(e[1]-s[1])*t];
            if(p[0]<-1e-7||p[0]>W2-1+1e-7||p[1]>maxY+1e-7)return false;
            for(const o of obstacles)if(hex74Dist(p,o.p)<HEX74_CONTACT_MIN_DIST)return false;
        }
    }
    return true;
}
function hex74RigidArcSafe(meta,members,obstacles){
    const maxY=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H,lead0=meta.leaderFrom;
    for(let k=0;k<=HEX74_ARC_SAMPLES;k++){
        const t=k/HEX74_ARC_SAMPLES,lead=hex74ArcPoint(meta,t),dx=lead[0]-lead0[0],dy=lead[1]-lead0[1];
        if(dy<-1e-7)return false;
        for(const m of members){
            const p=[m.seg.from[0]+dx,m.seg.from[1]+dy];
            if(p[0]<-1e-7||p[0]>W2-1+1e-7||p[1]>maxY+1e-7)return false;
            for(const o of obstacles)if(hex74Dist(p,o.p)<HEX74_CONTACT_MIN_DIST)return false;
        }
    }
    return true;
}
function hex74InstallRigidContactArc(g,ids){
    const idSet=new Set(ids),members=ids.map(id=>hex74FindById(g,id)).filter(Boolean).map(q=>({ball:q.b,seg:q.b.fallPath?.[0]}));
    if(members.length!==3)return false;
    const gid=members[0].ball.motionGroupId;
    if(!gid||members.some(m=>m.ball.motionGroupId!==gid||!m.ball.rigid||!m.seg?.from||!m.seg?.to||m.seg.pivot||m.seg.topPivot))return false;
    if(members.some(m=>m.seg.kind!=="GROUP_SLOPE_TRANSLATE"))return false;
    const d0=[members[0].seg.to[0]-members[0].seg.from[0],members[0].seg.to[1]-members[0].seg.from[1]];
    if(members.some(m=>Math.abs((m.seg.to[0]-m.seg.from[0])-d0[0])>1e-6||Math.abs((m.seg.to[1]-m.seg.from[1])-d0[1])>1e-6))return false;

    const obstacles=hex74ObstacleItems(g,idSet);
    if(hex74RigidLinearSafe(members,obstacles))return false;

    let best=null;
    for(const leader of members){
        const s=leader.seg.from,e=leader.seg.to;
        for(const o of obstacles){
            if(Array.isArray(o.ball.fallPath)&&o.ball.fallPath.length)continue;
            const ds=hex74Dist(s,o.p),de=hex74Dist(e,o.p);
            if(Math.abs(ds-1)>HEX74_TANGENT_EPS||Math.abs(de-1)>HEX74_TANGENT_EPS)continue;
            const mid=[(s[0]+e[0])*.5,(s[1]+e[1])*.5];
            if(hex74Dist(mid,o.p)>=Math.min(ds,de)-1e-7)continue;
            const arc=hex74ShortestArc(s,e,o.p);if(Math.abs(arc.da)<1e-7)continue;
            const meta={pivot:[...o.p],leaderFrom:[...s],leaderTo:[...e],a0:arc.a0,da:arc.da,groupId:gid,supportId:o.ball.id};
            if(!hex74RigidArcSafe(meta,members,obstacles))continue;
            const score=Math.abs(arc.da);if(!best||score<best.score)best={meta,score};
        }
    }
    if(!best)return false;
    for(const m of members)m.seg._hexHardDropRigidArc=best.meta;
    return true;
}

if(__hex74LiveBatchPointAtBeforeContinuity){
    liveBatchPointAt=function(batch,member,t,states,memo=new Map(),stack=new Set()){
        const meta=member?.seg?._hexHardDropRigidArc;
        if(meta){
            const id=member.cell.id;if(memo?.has(id))return memo.get(id);
            const lead=hex74ArcPoint(meta,t),dx=lead[0]-meta.leaderFrom[0],dy=lead[1]-meta.leaderFrom[1];
            const out=[member.seg.from[0]+dx,member.seg.from[1]+dy];if(memo)memo.set(id,out);return out;
        }
        return __hex74LiveBatchPointAtBeforeContinuity(batch,member,t,states,memo,stack);
    };
}
if(__hex74MotionDurationBeforeContinuity){
    hexMotionDuration=function(seg,state={vy:0,speed:0}){
        const meta=seg?._hexHardDropRigidArc;
        if(meta){
            state.speed=SLIDE_SPEED;
            const endA=meta.a0+meta.da,dir=Math.sign(meta.da||1);
            state.vy=Math.max(0,dir*SLIDE_SPEED*Math.cos(endA)/HEX_ROW_H);
            return Math.max(1/120,Math.abs(meta.da)/Math.max(.0001,SLIDE_SPEED));
        }
        return __hex74MotionDurationBeforeContinuity(seg,state);
    };
}

function hex74ProtectedSnapshots(g){
    const groups=new Map();
    hex74EachBall(g,(ball)=>{
        const gid=ball._hexHardDropProtectRigid,v=g.vis.get(ball.id);
        if(!gid||ball.motionGroupId!==gid||!ball.rigid||!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))return;
        if(!groups.has(gid))groups.set(gid,[]);
        groups.get(gid).push({id:ball.id,ball,x:v.x,y:v.y,vy:v.vy,motionSpeed:v.motionSpeed});
    });
    return[...groups.values()].filter(a=>a.length===3);
}
function hex74SnapshotStillSafe(g,snap){
    if(snap.length!==3)return false;
    const ids=new Set(snap.map(q=>q.id)),maxY=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H;
    for(const q of snap)if(q.x<-1e-7||q.x>W2-1+1e-7||q.y>maxY+1e-7)return false;
    for(let i=0;i<snap.length;i++)for(let j=i+1;j<snap.length;j++)if(hex74Dist([snap[i].x,snap[i].y],[snap[j].x,snap[j].y])<HEX74_CONTACT_MIN_DIST)return false;
    let safe=true;
    hex74EachBall(g,(ball,x,y)=>{
        if(!safe||ids.has(ball.id))return;
        const v=g.vis.get(ball.id),p=v&&Number.isFinite(v.x)&&Number.isFinite(v.y)?[v.x,v.y]:[x,y];
        for(const q of snap)if(hex74Dist([q.x,q.y],p)<HEX74_CONTACT_MIN_DIST){safe=false;break;}
    });
    return safe;
}
if(__hex74ResolveContactsBeforeContinuity){
    resolveVisualContacts=function(g){
        const protectedGroups=hex74ProtectedSnapshots(g);
        const result=__hex74ResolveContactsBeforeContinuity.apply(this,arguments);
        for(const snap of protectedGroups){
            // If ordinary contact resolution moved other bodies into this pose,
            // do not restore it; that is a genuine individual-constraint event
            // and the normal solver must be allowed to split/release rigidity.
            if(!hex74SnapshotStillSafe(g,snap))continue;
            const gid=snap[0].ball._hexHardDropProtectRigid;
            if(snap.some(q=>q.ball.motionGroupId!==gid||!q.ball.rigid))continue;
            for(const q of snap){const v=g.vis.get(q.id);if(!v)continue;v.x=q.x;v.y=q.y;if(Number.isFinite(q.vy))v.vy=q.vy;if(Number.isFinite(q.motionSpeed))v.motionSpeed=q.motionSpeed;}
        }
        return result;
    };
}

hardDrop=function(g){
    const before=g?.nextId;
    __hex74HardDropBeforeContinuity(g);
    if(!g||!Number.isFinite(before))return;
    const ids=[before,before+1,before+2],qs=ids.map(id=>hex74FindById(g,id)).filter(Boolean);
    hex74InstallRigidContactArc(g,ids);
    if(qs.length===3){
        const gid=qs[0].b.motionGroupId;
        if(gid&&qs.every(q=>q.b.motionGroupId===gid&&q.b.rigid))for(const q of qs)q.b._hexHardDropProtectRigid=gid;
    }
};

if(__hex74RenderMobilityBeforeContinuity){
    hexRenderMobility=function(g,q){
        if(hex74StableContactMarker(q?.ball))return 0;
        return __hex74RenderMobilityBeforeContinuity(g,q);
    };
}

nearlySettled=function(g,tol){
    if(!g?.board)return __hex74NearlySettledBeforeContinuity(g,tol);
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const cell=valid(x,y)?g.board[y][x]:null;if(!cell)continue;
        const v=g.vis.get(cell.id);
        if(Array.isArray(cell.fallPath)&&cell.fallPath.length)return false;
        const rest=hex74StableContactMarker(cell);
        if(rest){if(!v||Math.abs(v.y-rest.y)>tol||Math.abs(v.x-rest.x)>tol)return false;continue;}
        if(v&&(Math.abs(v.y-y)>tol||Math.abs(v.x-x)>tol))return false;
    }
    return true;
};

updateVisuals=function(g,dt){
    hex74EachBall(g,(b,x,y)=>{
        const rest=b._hexHardDropContinuousRest;if(!rest)return;
        const path=Array.isArray(b.fallPath)?b.fallPath:null;
        if(path&&path.length){const seg=path[0];if(seg?.from)seg.from=[rest.x,rest.y];delete b._hexHardDropContinuousRest;}
        else if(x!==rest.ax||y!==rest.ay)delete b._hexHardDropContinuousRest;
    });
    __hex74UpdateVisualsBeforeContinuity(g,dt);
    hex74EachBall(g,(b,x,y)=>{
        const rest=b._hexHardDropContinuousRest;if(!rest)return;
        if(x!==rest.ax||y!==rest.ay){delete b._hexHardDropContinuousRest;return;}
        const v=g.vis.get(b.id);if(v){v.x=rest.x;v.y=rest.y;v.vy=0;v.motionSpeed=0;}
    });
};

stepEngine=function(g,dt){
    if(!g)return __hex74StepBeforeContinuity(g,dt);
    const result=__hex74StepBeforeContinuity(g,dt);
    hex74EachBall(g,(b,x,y)=>{
        const v=g.vis.get(b.id);if(!v)return;
        const hold=b.hardDropContactHold,path=Array.isArray(b.fallPath)?b.fallPath:null;
        if(hold&&(!path||!path.length)){v.x=hold.x;v.y=hold.y;v.vy=0;v.motionSpeed=0;}
        if(hold&&(!path||!path.length)&&(g.state!=="RESOLVING"||g.phase!=="SETTLE")){
            b._hexHardDropContinuousRest={x:hold.x,y:hold.y,ax:x,ay:y};delete b.hardDropContactHold;
        }
        const rest=b._hexHardDropContinuousRest;
        if(rest&&x===rest.ax&&y===rest.ay&&(!path||!path.length)){v.x=rest.x;v.y=rest.y;v.vy=0;v.motionSpeed=0;}
        const gid=b._hexHardDropProtectRigid;
        if(gid&&(!b.rigid||b.motionGroupId!==gid||((!path||!path.length)&&!hex74StableContactMarker(b))))delete b._hexHardDropProtectRigid;
    });
    return result;
};
