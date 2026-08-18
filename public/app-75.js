/* Preserve the measured contact radius at both ends of app-74's support arc.
 * The landing guide intentionally keeps a tiny separation margin (~1e-6).
 * Normalising the arc to radius exactly 1 moved t=0 by that margin and made an
 * otherwise valid monotonic arc fail its own no-up safety check. */
const __hex75MotionDurationBeforeRadiusArc=hexMotionDuration;
const __hex75HardDropBeforeRadiusArc=hardDrop;

hex74ArcPoint=function(meta,t){
    t=Math.max(0,Math.min(1,t));
    const a=meta.a0+meta.da*t,p=meta.pivot;
    const r0=Number.isFinite(meta.r0)?meta.r0:1,r1=Number.isFinite(meta.r1)?meta.r1:1,r=r0+(r1-r0)*t;
    return[p[0]+r*Math.cos(a)/.5,p[1]+r*Math.sin(a)/HEX_ROW_H];
};

hex74InstallRigidContactArc=function(g,ids){
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
            const meta={pivot:[...o.p],leaderFrom:[...s],leaderTo:[...e],a0:arc.a0,da:arc.da,r0:ds,r1:de,groupId:gid,supportId:o.ball.id};
            if(!hex74RigidArcSafe(meta,members,obstacles))continue;
            const avgR=(ds+de)*.5,radial=Math.abs(de-ds),score=Math.hypot(avgR*Math.abs(arc.da),radial);
            if(!best||score<best.score)best={meta,score};
        }
    }
    if(!best)return false;
    for(const m of members)m.seg._hexHardDropRigidArc=best.meta;
    return true;
};

/* app-74 already attempts to install the support arc at the end of hardDrop().
 * Re-run that installation here from the final overlay so the radius-aware
 * implementation above is guaranteed to be the one used for the shipped
 * hand-off. This is idempotent and only annotates an already-created rigid path. */
hardDrop=function(g){
    const before=g?.nextId;
    __hex75HardDropBeforeRadiusArc(g);
    if(!g||!Number.isFinite(before))return;
    hex74InstallRigidContactArc(g,[before,before+1,before+2]);
};

hexMotionDuration=function(seg,state={vy:0,speed:0}){
    const meta=seg?._hexHardDropRigidArc;
    if(meta&&Number.isFinite(meta.r0)&&Number.isFinite(meta.r1)){
        const avgR=(meta.r0+meta.r1)*.5,radial=Math.abs(meta.r1-meta.r0),length=Math.hypot(avgR*Math.abs(meta.da),radial);
        state.speed=SLIDE_SPEED;
        const endA=meta.a0+meta.da,dir=Math.sign(meta.da||1),dr=meta.r1-meta.r0;
        const tangentialY=dir*avgR*SLIDE_SPEED*Math.cos(endA)/HEX_ROW_H;
        const radialY=length>1e-9?(dr/Math.max(1e-9,length))*SLIDE_SPEED*Math.sin(endA)/HEX_ROW_H:0;
        state.vy=Math.max(0,tangentialY+radialY);
        return Math.max(1/120,length/Math.max(.0001,SLIDE_SPEED));
    }
    return __hex75MotionDurationBeforeRadiusArc(seg,state);
};
