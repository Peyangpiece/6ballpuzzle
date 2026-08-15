/* index-2 exact normal motion E: copied verbatim from user-provided index-2.html */
function liveSegDuration(seg){
    if(!seg)return 1/120;
    const H=HEX_ROW_H;

    if(seg.slopeRigidArc && Number.isFinite(seg.slopeDuration))
        return Math.max(1/120,seg.slopeDuration);

    if(seg.topPivot){
        const [px,py]=seg.topPivot;
        const startY=cellCenterYNorm(seg.from[1]);
        const supportY=cellCenterYNorm(py);
        const contactY=supportY-1;
        const fallDist=Math.max(0,contactY-startY);
        const fallT=Math.sqrt(Math.max(0,2*fallDist/Math.max(0.0001,GRAV)));

        const targetX=latticeRealX(seg.to[0]);
        const targetY=cellCenterYNorm(seg.to[1]);
        const supportX=latticeRealX(px);
        const a0=-Math.PI/2;
        const a1=Math.atan2(targetY-supportY,targetX-supportX);
        let da=a1-a0;
        while(da>Math.PI)da-=Math.PI*2;
        while(da<-Math.PI)da+=Math.PI*2;
        const arcT=Math.abs(da)/SLIDE_SPEED;

        return Math.max(1/120,fallT+arcT);
    }

    if(seg.pivot){
        const [px,py]=seg.pivot;
        const a0=Math.atan2((seg.from[1]-py)*H,(seg.from[0]-px)*0.5);
        const a1=Math.atan2((seg.to[1]-py)*H,(seg.to[0]-px)*0.5);
        let da=a1-a0;
        while(da>Math.PI)da-=Math.PI*2;
        while(da<-Math.PI)da+=Math.PI*2;
        return Math.max(1/120,Math.abs(da)/SLIDE_SPEED);
    }
    const dx=(seg.to[0]-seg.from[0])*0.5;
    const dy=(seg.to[1]-seg.from[1])*H;
    const dist=Math.hypot(dx,dy);

    // Long/vertical fall: gravity-shaped duration.
    if(Math.abs(seg.to[1]-seg.from[1])>=2 || Math.abs(dx)<1e-9)
        return Math.max(1/120,Math.sqrt(Math.max(0.0001,2*dist/Math.max(0.0001,GRAV))));

    // Contact slide / translating diagonal.
    return Math.max(1/120,dist/SLIDE_SPEED);
}

function liveSegPoint(seg,t){
    const H=HEX_ROW_H;
    t=Math.max(0,Math.min(1,t));

    // On a continuous straight slope, intermediate lattice boundaries are not
    // visible "stops". Only the last slope interval eases into its stable pose.
    const pathT=(seg.slopeRigidArc && seg.slopeTerminal)
        ? 1-(1-t)*(1-t)
        : t;

    if(seg.topPivot){
        const [px,py]=seg.topPivot;
        const sx=latticeRealX(seg.from[0]);
        const sy=cellCenterYNorm(seg.from[1]);
        const supportX=latticeRealX(px);
        const supportY=cellCenterYNorm(py);
        const contactX=supportX;
        const contactY=supportY-1;

        const fallDist=Math.max(0,contactY-sy);
        const fallT=Math.sqrt(Math.max(0,2*fallDist/Math.max(0.0001,GRAV)));

        const tx=latticeRealX(seg.to[0]);
        const ty=cellCenterYNorm(seg.to[1]);
        const a0=-Math.PI/2;
        const a1=Math.atan2(ty-supportY,tx-supportX);

        let da=a1-a0;
        while(da>Math.PI)da-=Math.PI*2;
        while(da<-Math.PI)da+=Math.PI*2;

        const arcT=Math.abs(da)/SLIDE_SPEED;
        const total=Math.max(1e-9,fallT+arcT);
        const elapsed=t*total;

        if(elapsed<=fallT && fallT>1e-9){
            const q=elapsed/fallT;
            // Constant-acceleration visual progress.
            const qq=q*q;
            const rx=sx+(contactX-sx)*qq;
            const ry=sy+(contactY-sy)*qq;
            return [
                rx/0.5,
                (ry-BOARD_TOP_CENTER_N)/H
            ];
        }

        const q=arcT<=1e-9 ? 1 : Math.max(0,Math.min(1,(elapsed-fallT)/arcT));
        const ang=a0+da*q;
        const rx=supportX+Math.cos(ang);
        const ry=supportY+Math.sin(ang);

        return [
            rx/0.5,
            (ry-BOARD_TOP_CENTER_N)/H
        ];
    }

    if(seg.pivot){
        const [px,py]=seg.pivot;
        const a0=Math.atan2((seg.from[1]-py)*H,(seg.from[0]-px)*0.5);
        const a1=Math.atan2((seg.to[1]-py)*H,(seg.to[0]-px)*0.5);
        let da=a1-a0;
        while(da>Math.PI)da-=Math.PI*2;
        while(da<-Math.PI)da+=Math.PI*2;
        const a=a0+da*pathT;
        return [px+Math.cos(a)/0.5,py+Math.sin(a)/H];
    }

    const dx=seg.to[0]-seg.from[0];
    const dy=seg.to[1]-seg.from[1];
    const q=(Math.abs(dy)>=2 || Math.abs(dx)<1e-9) ? t*t : t;
    return [seg.from[0]+dx*q,seg.from[1]+dy*q];
}

function collectLiveMotionBatch(g){
    let seq=Infinity;
    const all=[];

    for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
        const cell=valid(x,y)?g.board[y][x]:null;
        if(!cell||!Array.isArray(cell.fallPath)||!cell.fallPath.length)continue;
        const seg=cell.fallPath[0];
        if(!seg?.to || seg.pileFlow || !seg.motionSeq)continue;
        const v=g.vis.get(cell.id);
        if(!v)continue;
        all.push({cell,v,x,y,seg,duration:liveSegDuration(seg)});
        seq=Math.min(seq,seg.motionSeq);
    }

    if(!Number.isFinite(seq))return null;
    const members=all.filter(m=>m.seg.motionSeq===seq);
    let duration=1/120;
    for(const m of members)duration=Math.max(duration,m.duration);
    return {seq,members,duration};
}
