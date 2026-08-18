/* HEXDROP hard-drop contact parity layer.
 * The landing guide is the physical contact pose.  A hard drop must hand the
 * triplet to pile physics at that exact pose instead of snapping one lattice
 * row upward before the first resolving frame.
 */
const __hexLockBeforeHardDropContact = lock;
const __hexHardDropBeforeContact = hardDrop;

function hexHardDropContactAnchor(g,target,pose){
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
        // Never choose a logical anchor above the already-rendered contact.
        // That would require a visible upward correction on the next frame.
        const noUp=oy<=1e-7;
        const localX=Math.abs(ox)<=1.000001;
        const dist=Math.hypot(ox*.5,oy*HEX_ROW_H);
        candidates.push({q,ox,oy,noUp,localX,dist,dy,dx});
    }
    if(!candidates.length)return null;
    candidates.sort((a,b)=>
        Number(b.noUp)-Number(a.noUp)||
        Number(b.localX)-Number(a.localX)||
        a.dist-b.dist||a.dy-b.dy||Math.abs(a.dx)-Math.abs(b.dx)
    );
    return candidates[0];
}

function hexLockHardDropAtContact(g,vy,contact){
    if(!g?.piece||!contact?.pose?.length)return __hexLockBeforeHardDropContact(g,vy);
    clearBoardEquilibriumLocks(g.board);g.balanceWait=0;
    const target={...g.piece,colors:g.piece.colors.slice()},splitRot=target.rot;
    const anchor=hexHardDropContactAnchor(g,target,contact.pose);
    if(!anchor||!anchor.noUp){
        delete g._hardDropContactPose;
        return __hexLockBeforeHardDropContact(g,vy);
    }

    g.piece={...anchor.q,colors:target.colors.slice()};
    let cells=pieceCells(g.piece);
    if(cells.some(([x,y])=>!valid(x,y)||g.board[y][x]!==null)){
        delete g._hardDropContactPose;
        g.piece=target;
        return __hexLockBeforeHardDropContact(g,vy);
    }

    const made=[];
    for(let role=0;role<cells.length;role++){
        const [x,y,c]=cells[role],ball=mkBall(g,c),p=contact.pose[role];
        const offX=p[0]-x;
        ball.impactOffsetX=offX;
        ball.subCellBias=Math.abs(offX)>1e-5?Math.sign(offX):0;
        ball.momentumX=ball.subCellBias;
        g.board[y][x]=ball;noteBoardCell(g.board,y,ball);made.push({ball,role,x,y});
        setVis(g,ball,p[0],p[1],Math.max(RELEASE_INITIAL_VY,vy||0));
        const vv=g.vis.get(ball.id);vv.motionSpeed=Math.max(RELEASE_INITIAL_VY,vy||0);vv.justReleased=true;
    }

    const gid=made.length?HEX_PHYS_GROUP_SEQ++:0,orientation=((splitRot&1)===0)?"down":"up";
    for(const m of made){
        m.ball.motionGroupId=gid;m.ball.motionGroupRole=m.role;m.ball.motionGroupOrientation=orientation;m.ball.motionGroupSize=3;m.ball.rigid=true;
        m.ball.visualTripletId=gid;m.ball.visualTripletOrientation=orientation;m.ball.visualTripletRole=m.role;
    }

    const immediateMoved=settlePass(g.board);if(immediateMoved)g.ver++;
    // Logical segments start at lattice centres. Rebase their render origin to
    // the exact guide/contact pose so the first resolving frame is continuous.
    for(const m of made){
        const p=contact.pose[m.role],seg=m.ball.fallPath?.[0];
        if(seg?.from)seg.from=[p[0],p[1]];
    }

    delete g._hardDropContactPose;
    g.piece=null;g.hardDropAnim=null;g.freeX=null;g.dragging=false;g.ver++;
    emit(g,{t:"land"});g.state="RESOLVING";g.phase="SETTLE";g.stateT=0;
    if(immediateMoved&&g.physicsWatch){g.physicsWatch.lastSig=physicsSignature(g);g.physicsWatch.repeats=0;g.physicsWatch.steps=0;}
}

lock=function(g,vy=2){
    if(g?._hardDropContactPose)return hexLockHardDropAtContact(g,vy,g._hardDropContactPose);
    return __hexLockBeforeHardDropContact(g,vy);
};

hardDrop=function(g){
    if(g.state!=="PLAYING"||!g.piece||g.hardDropAnim)return;
    const shadow=landingShadowVisualCells(g);
    if(!shadow||shadow.length!==3)return __hexHardDropBeforeContact(g);
    const target=dropPiece(g.board,g.piece),base=pieceCells(target);
    const dx=shadow[0][0]-base[0][0],contactFrac=shadow[0][1]-base[0][1];
    armHardDropImpact(g,target,dx,contactFrac);
    g._hardDropContactPose={pose:shadow.map(v=>[v[0],v[1],v[2]]),target:{x:target.x,y:target.y,rot:target.rot}};
    g.piece={...target};
    g.dropT=g.dropInterval*Math.max(0,Math.min(2,contactFrac))/2;
    emit(g,{t:"drop"});lock(g,5);
};
