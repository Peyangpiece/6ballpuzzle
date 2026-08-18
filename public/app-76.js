/* HEXDROP hard-drop anchor locality + straight-handoff repair.
 *
 * app-68 ranked `noUp` before horizontal locality. Near walls / dense piles a
 * valid contact could therefore be stored two logical columns away merely to
 * keep the bookkeeping anchor below the rendered contact. Prefer a local rigid
 * horizontal offset first.
 *
 * A second continuity issue appears after that anchor is corrected: the logical
 * GROUP_SLOPE_TRANSLATE still carries pivot/topPivot metadata calculated from
 * the old lattice-centre start. Once the segment start is rebased to the exact
 * landing-guide contact, that old pivot can make an otherwise collision-free
 * translation arc upward. If the common straight rigid path is proven safe and
 * monotonic from the rebased contact, render that straight path directly.
 */
const __hex76HardDropBeforeStraightHandoff=hardDrop;

hexHardDropContactAnchor=function(g,target,pose){
    if(!g||!target||!Array.isArray(pose)||pose.length!==3)return null;
    const candidates=[];
    for(let dy=0;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
        const q={...target,x:target.x+dx,y:target.y+dy};
        if(!pieceFits(g.board,q))continue;
        const cs=pieceCells(q);
        const ox=pose[0][0]-cs[0][0],oy=pose[0][1]-cs[0][1];
        let rigid=true;
        for(let i=1;i<3;i++){
            if(Math.abs((pose[i][0]-cs[i][0])-ox)>1e-7||
               Math.abs((pose[i][1]-cs[i][1])-oy)>1e-7){rigid=false;break;}
        }
        if(!rigid)continue;
        const noUp=oy<=1e-7;
        const localX=Math.abs(ox)<=1.000001;
        const dist=Math.hypot(ox*.5,oy*HEX_ROW_H);
        candidates.push({q,ox,oy,noUp,localX,dist,dy,dx});
    }
    if(!candidates.length)return null;
    candidates.sort((a,b)=>
        Number(b.localX)-Number(a.localX)||
        Number(b.noUp)-Number(a.noUp)||
        a.dist-b.dist||
        Math.abs(a.ox)-Math.abs(b.ox)||
        a.dy-b.dy||Math.abs(a.dx)-Math.abs(b.dx)
    );
    return candidates[0];
};

function hex76UseSafeStraightHandoff(g,ids){
    if(!g||!Array.isArray(ids)||ids.length!==3)return false;
    const idSet=new Set(ids);
    const members=ids.map(id=>hex74FindById(g,id)).filter(Boolean).map(q=>({ball:q.b,seg:q.b.fallPath?.[0]}));
    if(members.length!==3)return false;
    const gid=members[0].ball.motionGroupId;
    if(!gid||members.some(m=>m.ball.motionGroupId!==gid||!m.ball.rigid||!m.seg?.from||!m.seg?.to||m.seg.kind!=="GROUP_SLOPE_TRANSLATE"))return false;
    const d0=[members[0].seg.to[0]-members[0].seg.from[0],members[0].seg.to[1]-members[0].seg.from[1]];
    if(members.some(m=>Math.abs((m.seg.to[0]-m.seg.from[0])-d0[0])>1e-6||Math.abs((m.seg.to[1]-m.seg.from[1])-d0[1])>1e-6))return false;
    if(members.some(m=>m.seg.to[1]<m.seg.from[1]-1e-7))return false;
    const obstacles=hex74ObstacleItems(g,idSet);
    if(!hex74RigidLinearSafe(members,obstacles))return false;
    for(const m of members){
        m.seg.pivot=null;
        m.seg.topPivot=null;
        m.seg.virtualPivot=false;
        delete m.seg._hexHardDropRigidArc;
        m.seg._hexHardDropStraight=true;
    }
    return true;
}

hardDrop=function(g){
    const before=g?.nextId;
    __hex76HardDropBeforeStraightHandoff(g);
    if(!g||!Number.isFinite(before))return;
    const ids=[before,before+1,before+2];
    const straight=hex76UseSafeStraightHandoff(g,ids);
    g._hex76StraightHandoff={ids,straight};
};
