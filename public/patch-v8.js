/* HEXDROP patch v8: original-video calibrated split/slide/coupled collapse */
(function installHexdropV8(){
    if (typeof window !== "undefined" && window.__hexdropV8Installed) return;
    if (typeof window !== "undefined") window.__hexdropV8Installed = true;

    // Supplied original footage is 30fps. A 60-degree contact handoff takes
    // 5 frames at normal speed and 4 frames after a fast/hard impact.
    const VIDEO_SLIDE_NORMAL = 5/30;
    const VIDEO_SLIDE_FAST = 4/30;
    const VIDEO_MIN_DIST = 0.99998;
    const PAIR_DIRS = [[2,0],[1,1],[-1,1],[-2,0],[-1,-1],[1,-1]];

    function pairDirIndex(dx,dy){
        for(let i=0;i<PAIR_DIRS.length;i++){
            if(PAIR_DIRS[i][0]===dx && PAIR_DIRS[i][1]===dy)return i;
        }
        return -1;
    }

    function pairArcSafeV8(b,members,pivot,moving,tx,ty){
        if(!valid(tx,ty))return false;
        const own=new Set(members.map(m=>m.ball.id));
        const occ=b[ty][tx];
        if(occ && !own.has(occ.id))return false;

        const pv=normPoint(pivot.x,pivot.y);
        const from=normPoint(moving.x,moving.y);
        const to=normPoint(tx,ty);
        let a0=Math.atan2(from[1]-pv[1],from[0]-pv[0]);
        let a1=Math.atan2(to[1]-pv[1],to[0]-pv[0]);
        let da=a1-a0;
        while(da>Math.PI)da-=Math.PI*2;
        while(da<-Math.PI)da+=Math.PI*2;
        if(Math.abs(Math.abs(da)-Math.PI/3)>1e-3)return false;

        for(let i=1;i<=48;i++){
            const a=a0+da*(i/48);
            const px=pv[0]+Math.cos(a);
            const py=pv[1]+Math.sin(a);
            if(py>FLOOR_CENTER_N+1e-7)return false;
            if(px<latticeRealX(0)-1e-7 || px>latticeRealX(W2-1)+1e-7)return false;
            for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
                if(!valid(x,y))continue;
                const qball=b[y][x];
                if(!qball || own.has(qball.id))continue;
                const q=normPoint(x,y);
                if(Math.hypot(px-q[0],py-q[1])<VIDEO_MIN_DIST)return false;
            }
        }
        return true;
    }

    function pairPivotCandidatesV8(b,members){
        if(!isUpSplitRigidPair(members))return [];
        const moves=new Map();
        for(const m of members)moves.set(m.ball.id,rigidMemberIndependentMove(b,members,m));
        const out=[];

        for(const pivot of members){
            const moving=members.find(m=>m!==pivot);
            const dx=moving.x-pivot.x,dy=moving.y-pivot.y;
            const idx=pairDirIndex(dx,dy);
            if(idx<0)continue;

            for(const step of [-1,1]){
                const nv=PAIR_DIRS[(idx+step+6)%6];
                const tx=pivot.x+nv[0],ty=pivot.y+nv[1];
                const comDy=(ty-moving.y)*0.5;
                if(comDy<-1e-9)continue;
                if(!pairArcSafeV8(b,members,pivot,moving,tx,ty))continue;

                const independent=moves.get(moving.ball.id);
                const pivotMove=moves.get(pivot.ball.id);
                let match=0;
                if(independent)match=-Math.hypot(tx-independent.to[0],ty-independent.to[1]);
                const caughtBonus=(!pivotMove && independent)?8:0;
                const downScore=comDy*12;
                const lateral=Math.sign(tx-moving.x);
                const momentum=Math.sign(
                    moving.ball.rollDir || moving.ball.momentumX ||
                    moving.ball.subCellBias || 0
                );
                const momentumScore=(momentum && lateral===momentum)?0.6:0;
                out.push({pivot,moving,tx,ty,step,score:caughtBonus+downScore+match+momentumScore});
            }
        }
        out.sort((a,z)=>z.score-a.score);
        return out;
    }

    function applyPairPivotV8(b,members,c){
        const motionSeq=LIVE_MOTION_SEQ++;
        const fastImpact=members.some(m=>!!m.ball.slopeImpactFast);
        const duration=fastImpact?VIDEO_SLIDE_FAST:VIDEO_SLIDE_NORMAL;
        const m=c.moving,p=c.pivot;

        b[m.y][m.x]=null;
        b[c.ty][c.tx]=m.ball;
        if(!Array.isArray(m.ball.fallPath))m.ball.fallPath=[];
        m.ball.fallPath.push({
            from:[m.x,m.y],to:[c.tx,c.ty],pivot:[p.x,p.y],topPivot:null,
            movingSupportId:p.ball.id,followSupportIds:[p.ball.id],motionSeq,
            rigidTriplet:false,rigidPair:true,pairPivotV8:true,
            slopeRigidArc:true,slopeDuration:duration,slopeFastImpact:fastImpact,
            slopeContinues:true,slopeTerminal:false
        });

        const dir=Math.sign(c.tx-m.x);
        if(dir){
            m.ball.rollDir=dir;
            m.ball.momentumX=dir;
            m.ball.subCellBias=dir;
        }
        for(const q of members){
            q.ball.rigid=true;
            q.ball.slopeRigidActive=true;
            q.ball.slopeRigidPartialPair=true;
            q.ball.upConvexPairPersistent=true;
            q.ball.slopeImpactFast=fastImpact;
        }
        return true;
    }

    advanceSlopeRigidGroups=function(b,preview=false){
        const groups=slopeRigidGroups(b);
        if(!groups.size)return {moved:false,heldIds:new Set(),released:false};
        const heldIds=new Set();
        let released=false;

        const releaseGroup=(members,reason)=>{
            released=true;
            for(const m of members)heldIds.delete(m.ball.id);
            if(!preview){
                for(const m of members){
                    m.ball.rigidityBreakReason=reason||"blocked";
                    m.ball.rigidityBreakSeq=LIVE_MOTION_SEQ;
                    normalizePileBallPhysics(m.ball);
                }
            }
        };

        for(const members of groups.values()){
            if(!isSupportedSlopeRigidGroup(members)){
                releaseGroup(members,"member_missing");
                continue;
            }
            const pair=isUpSplitRigidPair(members);
            for(const m of members){
                heldIds.add(m.ball.id);
                if(!preview){
                    m.ball.rigid=true;
                    m.ball.slopeRigidActive=true;
                    if(pair){m.ball.slopeRigidPartialPair=true;m.ball.upConvexPairPersistent=true;}
                }
            }

            const continuation=rigidBodyContinuation(b,members);

            // In the supplied footage a peak entering the lower groove of ▲
            // splits on first real dual-lower contact, before an artificial
            // whole-body escape translation.
            if(!pair && members.length===3){
                const split=upTriangleConvexSplitInfo(members,continuation);
                if(split?.groovePeak){
                    if(preview)return {moved:true,heldIds,released:true};
                    const kept=applyUpTriangleConvexSplit(members,split);
                    released=true;
                    for(const m of members)heldIds.delete(m.ball.id);
                    for(const m of kept)heldIds.add(m.ball.id);
                    continue;
                }
            }

            if(continuation.move){
                if(preview)return {moved:true,heldIds,released};
                applySlopeRigidTranslation(b,members,continuation.dx,continuation.dy);
                return {moved:true,heldIds,released};
            }

            if(!pair && members.length===3){
                const split=upTriangleConvexSplitInfo(members,continuation);
                if(split){
                    if(preview)return {moved:true,heldIds,released:true};
                    const kept=applyUpTriangleConvexSplit(members,split);
                    released=true;
                    for(const m of members)heldIds.delete(m.ball.id);
                    for(const m of kept)heldIds.add(m.ball.id);
                    continue;
                }
            }

            if(pair){
                const pivots=pairPivotCandidatesV8(b,members);
                if(pivots.length){
                    if(preview)return {moved:true,heldIds,released};
                    applyPairPivotV8(b,members,pivots[0]);
                    return {moved:true,heldIds,released};
                }
                // Resting does not dissolve the two-ball bond.
                continue;
            }

            releaseGroup(
                members,
                continuation.breakRequired
                    ? (continuation.breakReason||"differential_constraint")
                    : "pile_settled"
            );
        }
        return {moved:false,heldIds,released};
    };

    // Replace first-segment smoothstep with constant-acceleration free fall,
    // preserving the entry velocity carried from the previous contact.
    const _pileDurationV8=pileFlowNominalDuration;
    pileFlowNominalDuration=function(seg,state){
        if(seg && state){
            seg.videoEntryVyV8=Math.max(0,Number(state.vy)||0);
            seg.videoEntrySpeedV8=Math.max(0,Number(state.speed)||0);
        }
        const t=_pileDurationV8(seg,state);
        if(seg)seg.videoDurationV8=t;
        return t;
    };

    const _pilePointV8=pileFlowPoint;
    pileFlowPoint=function(seg,t){
        t=Math.max(0,Math.min(1,t));
        if(!seg)return [0,0];
        if(seg.pivot||seg.topPivot)return _pilePointV8(seg,t);
        const dx=seg.to[0]-seg.from[0];
        const dy=seg.to[1]-seg.from[1];
        if(Math.abs(dx)<1e-9 && dy>0){
            const dur=Math.max(1e-9,Number(seg.videoDurationV8)||Number(seg.pileFlowDuration)||1/120);
            const v0=Math.max(0,Number(seg.videoEntryVyV8)||0);
            const e=t*dur;
            const dist=Math.max(1e-9,dy);
            const q=Math.max(0,Math.min(1,(v0*e+0.5*GRAV*e*e)/dist));
            return [seg.from[0],seg.from[1]+dy*q];
        }
        // Between real contacts, do not ease at lattice boundaries.
        return [seg.from[0]+dx*t,seg.from[1]+dy*t];
    };

    visualPointSafe=function(g,id,x,y,minDist=VIDEO_MIN_DIST){
        const maxVisualRowY=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H;
        if(y>maxVisualRowY+1e-7)return false;
        for(const [oid,ov] of g.vis.entries()){
            if(oid===id||!ov)continue;
            const pivot=g._visualArcPivotById&&g._visualArcPivotById.get(id);
            if(pivot){
                const pdx=(ov.x-pivot[0])*0.5;
                const pdy=(ov.y-pivot[1])*HEX_ROW_H;
                if(pdx*pdx+pdy*pdy<=1e-10)continue;
            }
            const ddx=(x-ov.x)*0.5;
            const ddy=(y-ov.y)*HEX_ROW_H;
            if(ddx*ddx+ddy*ddy<minDist*minDist)return false;
        }
        return true;
    };

    if(typeof window!=="undefined"){
        window.__hexdropReferencePhysicsV8={
            fps:30,
            normalSlideFrames:5,
            fastSlideFrames:4,
            normalSlideSeconds:VIDEO_SLIDE_NORMAL,
            fastSlideSeconds:VIDEO_SLIDE_FAST,
            pairPivot:true,
            gravityFlow:true,
            noPenetration:true
        };
    }
})();
