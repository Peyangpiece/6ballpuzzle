/* Preserve the exact landing-guide contact while routing a rigid hard-drop body
 * around the support geometry selected by the logical GROUP_SLOPE_TRANSLATE.
 *
 * A rebased visual start can be outside the final support circle. In that case
 * the physically correct rigid route is: straight to a tangent point, then roll
 * around the support circle to the logical target. This avoids the chord that
 * cuts through the support and avoids any upward recoil. */
const __hex75MotionDurationBeforeRadiusArc=hexMotionDuration;
const __hex75HardDropBeforeRadiusArc=hardDrop;

function hex75AngleDelta(a0,a1,sign=0){
    let d=a1-a0;
    while(d>Math.PI)d-=TAU;
    while(d<-Math.PI)d+=TAU;
    if(sign>0&&d<0)d+=TAU;
    if(sign<0&&d>0)d-=TAU;
    return d;
}
function hex75SupportPathCandidates(from,to,pivot,ds,de){
    const out=[],endA=Math.atan2((to[1]-pivot[1])*HEX_ROW_H,(to[0]-pivot[0])*.5);
    // Tangent-to-tangent: preserve the measured safety radii at both ends.
    if(Math.abs(ds-1)<=HEX74_TANGENT_EPS){
        const a0=Math.atan2((from[1]-pivot[1])*HEX_ROW_H,(from[0]-pivot[0])*.5),da=hex75AngleDelta(a0,endA,0),avgR=(ds+de)*.5,radial=Math.abs(de-ds);
        if(Math.abs(da)>1e-8)out.push({pivot:[...pivot],leaderFrom:[...from],leaderTo:[...to],a0,da,r0:ds,r1:de,lineEnd:null,lineLen:0,arcLen:avgR*Math.abs(da),totalLen:Math.hypot(avgR*Math.abs(da),radial)});
    }
    // Outside-to-tangent: move along the exact tangent line first, then use the
    // matching circle direction. The line/arc join is C1-continuous.
    const R=Math.max(1,Math.min(ds,de>0?de:1));
    if(ds>R+1e-7&&Math.abs(de-1)<=HEX74_TANGENT_EPS){
        const px=(from[0]-pivot[0])*.5,py=(from[1]-pivot[1])*HEX_ROW_H,d=Math.hypot(px,py);
        if(d>R+1e-9){
            const theta=Math.atan2(py,px),beta=Math.acos(Math.max(-1,Math.min(1,R/d)));
            for(const a0 of [theta+beta,theta-beta]){
                const tx=pivot[0]+R*Math.cos(a0)/.5,ty=pivot[1]+R*Math.sin(a0)/HEX_ROW_H;
                const lx=(tx-from[0])*.5,ly=(ty-from[1])*HEX_ROW_H,lineLen=Math.hypot(lx,ly);
                if(lineLen<1e-9)continue;
                const ux=lx/lineLen,uy=ly/lineLen,tpx=-Math.sin(a0),tpy=Math.cos(a0),sign=(ux*tpx+uy*tpy)>=0?1:-1;
                const da=hex75AngleDelta(a0,endA,sign),avgR=(R+de)*.5,radial=Math.abs(de-R),arcLen=avgR*Math.abs(da),totalLen=lineLen+Math.hypot(arcLen,radial);
                out.push({pivot:[...pivot],leaderFrom:[...from],leaderTo:[...to],lineEnd:[tx,ty],lineLen,arcLen,totalLen,a0,da,r0:R,r1:de});
            }
        }
    }
    return out;
}

hex74ArcPoint=function(meta,t){
    t=Math.max(0,Math.min(1,t));
    const total=Math.max(1e-9,Number.isFinite(meta.totalLen)?meta.totalLen:1),travel=t*total;
    if(meta.lineEnd&&meta.lineLen>1e-9&&travel<meta.lineLen){
        const q=travel/meta.lineLen,s=meta.leaderFrom,z=meta.lineEnd;
        return[s[0]+(z[0]-s[0])*q,s[1]+(z[1]-s[1])*q];
    }
    const arcTravel=Math.max(0,travel-(meta.lineLen||0)),arcMetric=Math.max(1e-9,total-(meta.lineLen||0)),q=Math.max(0,Math.min(1,arcTravel/arcMetric));
    const a=meta.a0+meta.da*q,p=meta.pivot,r0=Number.isFinite(meta.r0)?meta.r0:1,r1=Number.isFinite(meta.r1)?meta.r1:1,r=r0+(r1-r0)*q;
    return[p[0]+r*Math.cos(a)/.5,p[1]+r*Math.sin(a)/HEX_ROW_H];
};

hex74InstallRigidContactArc=function(g,ids){
    const diag={ids:[...ids],reason:null,memberCount:0,gid:0,kinds:[],sameDisp:null,linearSafe:null,candidates:[],movingSupports:[]};
    if(g)g._hex75LastInstallDiag=diag;
    const idSet=new Set(ids),members=ids.map(id=>hex74FindById(g,id)).filter(Boolean).map(q=>({ball:q.b,seg:q.b.fallPath?.[0]}));
    diag.memberCount=members.length;
    if(members.length!==3){diag.reason='member-count';return false;}
    const gid=members[0].ball.motionGroupId;diag.gid=gid;diag.kinds=members.map(m=>m.seg?.kind||null);
    if(!gid||members.some(m=>m.ball.motionGroupId!==gid||!m.ball.rigid||!m.seg?.from||!m.seg?.to)){diag.reason='member-shape';return false;}
    if(members.some(m=>m.seg.kind!=="GROUP_SLOPE_TRANSLATE")){diag.reason='kind';return false;}
    const d0=[members[0].seg.to[0]-members[0].seg.from[0],members[0].seg.to[1]-members[0].seg.from[1]];
    diag.sameDisp=members.every(m=>Math.abs((m.seg.to[0]-m.seg.from[0])-d0[0])<=1e-6&&Math.abs((m.seg.to[1]-m.seg.from[1])-d0[1])<=1e-6);
    if(!diag.sameDisp){diag.reason='displacement';return false;}

    const obstacles=hex74ObstacleItems(g,idSet);
    diag.linearSafe=hex74RigidLinearSafe(members,obstacles);
    if(diag.linearSafe){diag.reason='linear-safe';return false;}

    let best=null;
    for(const leader of members){
        const s=leader.seg.from,e=leader.seg.to;
        for(const o of obstacles){
            const moving=Array.isArray(o.ball.fallPath)&&o.ball.fallPath.length;
            if(moving){diag.movingSupports.push({leader:leader.ball.id,support:o.ball.id,pathKind:o.ball.fallPath?.[0]?.kind||null});continue;}
            const ds=hex74Dist(s,o.p),de=hex74Dist(e,o.p);
            if(ds<HEX74_CONTACT_MIN_DIST-1e-7||Math.abs(de-1)>HEX74_TANGENT_EPS)continue;
            const metas=hex75SupportPathCandidates(s,e,o.p,ds,de);
            for(const meta0 of metas){
                const meta={...meta0,groupId:gid,supportId:o.ball.id};
                const safe=hex74RigidArcSafe(meta,members,obstacles);
                diag.candidates.push({leader:leader.ball.id,support:o.ball.id,ds,de,lineLen:meta.lineLen||0,da:meta.da,totalLen:meta.totalLen,safe});
                if(!safe)continue;
                const score=meta.totalLen;
                if(!best||score<best.score)best={meta,score};
            }
        }
    }
    if(!best){diag.reason='no-safe-arc';return false;}
    for(const m of members)m.seg._hexHardDropRigidArc=best.meta;
    diag.reason='installed';diag.best=best.meta;
    return true;
};

hardDrop=function(g){
    const before=g?.nextId;
    __hex75HardDropBeforeRadiusArc(g);
    if(!g||!Number.isFinite(before))return;
    const ids=[before,before+1,before+2],installed=hex74InstallRigidContactArc(g,ids);
    g._hex75InstallAttempt={before,ids,installed,diag:g._hex75LastInstallDiag||null,paths:ids.map(id=>{const q=hex74FindById(g,id),s=q?.b?.fallPath?.[0];return{id,found:!!q,kind:s?.kind||null,arc:!!s?._hexHardDropRigidArc};})};
};

hexMotionDuration=function(seg,state={vy:0,speed:0}){
    const meta=seg?._hexHardDropRigidArc;
    if(meta&&Number.isFinite(meta.totalLen)){
        state.speed=SLIDE_SPEED;
        const endA=meta.a0+meta.da,dir=Math.sign(meta.da||1),avgR=((meta.r0||1)+(meta.r1||1))*.5;
        state.vy=Math.max(0,dir*avgR*SLIDE_SPEED*Math.cos(endA)/HEX_ROW_H);
        return Math.max(1/120,meta.totalLen/Math.max(.0001,SLIDE_SPEED));
    }
    return __hex75MotionDurationBeforeRadiusArc(seg,state);
};
