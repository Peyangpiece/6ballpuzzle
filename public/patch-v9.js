/* HEXDROP patch v9: reference-video rigid-dimer pivot + blocked-flow repair */
(function installHexdropV9(){
    if(typeof window!=="undefined"&&window.__hexdropV9Installed)return;
    if(typeof window!=="undefined")window.__hexdropV9Installed=true;

    const V9_MIN_DIST=0.9995;
    const V9_TANGENT=[[2,0],[1,1],[-1,1],[-2,0],[-1,-1],[1,-1]];

    function vecIndex(dx,dy){return V9_TANGENT.findIndex(([x,y])=>x===dx&&y===dy);}
    function boardBall(g,id){return typeof pileFlowBallById==='function'?pileFlowBallById(g,id):null;}

    function pivotSupported(b,pivot,members){
        const own=new Set(members.map(m=>m.ball.id));
        if(pivot.y===ROWS-1)return true;
        for(const dx of [-1,1]){
            const x=pivot.x+dx,y=pivot.y+1;
            if(!valid(x,y))continue;
            const q=b[y][x];
            if(q&&!own.has(q.id))return true;
        }
        return false;
    }

    function pivotSweepSafe(b,members,pivot,mover,tx,ty){
        if(!valid(tx,ty))return false;
        const own=new Set(members.map(m=>m.ball.id));
        const occ=b[ty][tx];
        if(occ&&!own.has(occ.id))return false;
        const px=latticeRealX(pivot.x),py=cellCenterYNorm(pivot.y);
        const sx=latticeRealX(mover.x),sy=cellCenterYNorm(mover.y);
        const ex=latticeRealX(tx),ey=cellCenterYNorm(ty);
        let a0=Math.atan2(sy-py,sx-px),a1=Math.atan2(ey-py,ex-px),da=a1-a0;
        while(da>Math.PI)da-=Math.PI*2;
        while(da<-Math.PI)da+=Math.PI*2;
        if(Math.abs(Math.abs(da)-Math.PI/3)>1e-5)return false;
        const left=0,right=latticeRealX(W2-1);
        for(let i=1;i<=36;i++){
            const a=a0+da*(i/36),x=px+Math.cos(a),y=py+Math.sin(a);
            if(x<left-1e-8||x>right+1e-8||y>FLOOR_CENTER_N+1e-8)return false;
            for(let by=0;by<ROWS;by++)for(let bx=0;bx<W2;bx++){
                if(!valid(bx,by))continue;
                const ob=b[by][bx];
                if(!ob||own.has(ob.id))continue;
                const op=normPoint(bx,by);
                if(Math.hypot(x-op[0],y-op[1])<V9_MIN_DIST)return false;
            }
        }
        return true;
    }

    function pairMomentum(members){
        let sum=0,n=0;
        for(const m of members){
            const d=Math.sign(m.ball?.momentumX||m.ball?.rollDir||m.ball?.subCellBias||0);
            if(d){sum+=d;n++;}
        }
        return n&&Math.abs(sum)===n?Math.sign(sum):0;
    }

    function pairPivotCandidate(b,members){
        if(!isUpSplitRigidPair(members))return null;
        const momentum=pairMomentum(members),out=[];
        for(const pivot of members){
            if(!pivotSupported(b,pivot,members))continue;
            const mover=members.find(m=>m!==pivot);
            const idx=mover?vecIndex(mover.x-pivot.x,mover.y-pivot.y):-1;
            if(idx<0)continue;
            for(const step of [-1,1]){
                const v=V9_TANGENT[(idx+step+6)%6];
                const tx=pivot.x+v[0],ty=pivot.y+v[1];
                if(ty<=mover.y)continue;
                if(!pivotSweepSafe(b,members,pivot,mover,tx,ty))continue;
                const dir=Math.sign(tx-mover.x);
                out.push({pivot,mover,tx,ty,dir,
                    initialTop:(mover.role===0&&mover.y<pivot.y)?1:0,
                    momentumMatch:momentum&&dir===momentum?1:0,
                    comDx:(tx-mover.x)/2,comDy:(ty-mover.y)/2});
            }
        }
        out.sort((a,b)=>b.initialTop-a.initialTop||b.momentumMatch-a.momentumMatch||
            b.comDy-a.comDy||(momentum?momentum*(b.comDx-a.comDx):a.mover.ball.id-b.mover.ball.id));
        return out[0]||null;
    }

    function applyPairPivot(b,members,c){
        const {pivot,mover,tx,ty}=c;
        const gid=mover.ball.slopeRigidGroupId||pivot.ball.slopeRigidGroupId||0;
        const seq=LIVE_MOTION_SEQ++;
        const fast=members.some(m=>!!m.ball.slopeImpactFast);
        const dur=fast?SLOPE_HARD_DURATION:SLOPE_NORMAL_DURATION;
        b[mover.y][mover.x]=null;b[ty][tx]=mover.ball;
        if(!Array.isArray(mover.ball.fallPath))mover.ball.fallPath=[];
        mover.ball.fallPath.push({
            from:[mover.x,mover.y],to:[tx,ty],pivot:[pivot.x,pivot.y],topPivot:null,
            movingSupportId:pivot.ball.id,followSupportIds:[pivot.ball.id],motionSeq:seq,
            rigidTriplet:false,rigidPair:true,slopeRigidArc:true,slopeDuration:dur,
            slopeFastImpact:fast,slopeContinues:true,slopeTerminal:false,
            videoPairPivotV9:true,videoPairGroupV9:gid,videoPairSeqV9:seq
        });
        pivot.ball.videoPairAnchorGroupV9=gid;pivot.ball.videoPairAnchorSeqV9=seq;
        const dir=Math.sign(tx-mover.x)||pairMomentum(members)||0;
        for(const m of members){
            m.ball.rigid=true;m.ball.slopeRigidActive=true;m.ball.slopeRigidPartialPair=true;
            if(dir){m.ball.rollDir=dir;m.ball.momentumX=dir;m.ball.subCellBias=dir;}
        }
    }

    function pairContinuation(b,members){
        const common=rigidBodyContinuation(b,members);
        if(common.move)return {mode:'translate',common};
        const pivot=pairPivotCandidate(b,members);
        if(pivot)return {mode:'pivot',pivot,common};
        const differential=rigidDifferentialConstraint(b,members);
        return {mode:'release',reason:(common.breakRequired||differential.breakRequired)
            ?(common.breakReason||differential.reason||'pair_differential_constraint'):'pair_settled'};
    }

    const oldApplyTranslation=applySlopeRigidTranslation;
    applySlopeRigidTranslation=function(b,members,dx,dy){
        const pair=isUpSplitRigidPair(members),gid=pair?(members[0]?.ball?.slopeRigidGroupId||0):0;
        const before=new Map(members.map(m=>[m.ball.id,(m.ball.fallPath||[]).length]));
        const r=oldApplyTranslation(b,members,dx,dy);
        if(pair&&gid){
            for(const m of members){
                const path=m.ball.fallPath||[];
                for(let i=before.get(m.ball.id)||0;i<path.length;i++){
                    const s=path[i];s.rigidPair=true;s.rigidTriplet=false;
                    s.videoPairGroupV9=gid;s.videoPairSeqV9=s.motionSeq||0;
                }
            }
        }
        return r;
    };

    advanceSlopeRigidGroups=function(b,preview=false){
        const groups=slopeRigidGroups(b);
        if(!groups.size)return {moved:false,heldIds:new Set(),released:false};
        const heldIds=new Set();let released=false;
        const release=(members,reason)=>{
            released=true;for(const m of members)heldIds.delete(m.ball.id);
            if(!preview)for(const m of members){m.ball.rigidityBreakReason=reason;m.ball.rigidityBreakSeq=LIVE_MOTION_SEQ;normalizePileBallPhysics(m.ball);}
        };
        for(const members of groups.values()){
            if(!isSupportedSlopeRigidGroup(members)){release(members,'member_missing');continue;}
            const pair=isUpSplitRigidPair(members);
            for(const m of members){heldIds.add(m.ball.id);if(!preview){m.ball.rigid=true;m.ball.slopeRigidActive=true;if(pair)m.ball.slopeRigidPartialPair=true;}}
            if(pair){
                const p=pairContinuation(b,members);
                if(p.mode==='translate'){
                    if(preview)return {moved:true,heldIds,released};
                    applySlopeRigidTranslation(b,members,p.common.dx,p.common.dy);return {moved:true,heldIds,released};
                }
                if(p.mode==='pivot'){
                    if(preview)return {moved:true,heldIds,released};
                    applyPairPivot(b,members,p.pivot);return {moved:true,heldIds,released};
                }
                release(members,p.reason);continue;
            }
            const c=rigidBodyContinuation(b,members);
            const split=window.__hexdropUpSplitV8?window.__hexdropUpSplitV8(b,members,c):upTriangleConvexSplitInfo(members,c);
            if(split){
                if(preview)return {moved:true,heldIds,released:true};
                const kept=applyUpTriangleConvexSplit(members,split);released=true;
                for(const m of members)heldIds.delete(m.ball.id);for(const m of kept)heldIds.add(m.ball.id);continue;
            }
            if(c.move){if(preview)return {moved:true,heldIds,released};applySlopeRigidTranslation(b,members,c.dx,c.dy);return {moved:true,heldIds,released};}
            release(members,c.breakRequired?(c.breakReason||'differential_constraint'):'pile_settled');
        }
        return {moved:false,heldIds,released};
    };

    stripFinishedTripletRigidity=function(g){
        for(const members of slopeRigidGroups(g.board).values()){
            if(!isSupportedSlopeRigidGroup(members)){for(const m of members)normalizePileBallPhysics(m.ball);continue;}
            if(members.some(m=>Array.isArray(m.ball.fallPath)&&m.ball.fallPath.length))continue;
            if(isUpSplitRigidPair(members)){
                const p=pairContinuation(g.board,members);
                if(p.mode==='translate'||p.mode==='pivot')continue;
                for(const m of members)normalizePileBallPhysics(m.ball);continue;
            }
            const c=rigidBodyContinuation(g.board,members);
            const split=window.__hexdropUpSplitV8?window.__hexdropUpSplitV8(g.board,members,c):upTriangleConvexSplitInfo(members,c);
            if(split||c.move)continue;
            for(const m of members)normalizePileBallPhysics(m.ball);
        }
    };

    function logicalSameGroup(g,a,b){
        const x=boardBall(g,a),y=boardBall(g,b),ga=x?.slopeRigidGroupId||0,gb=y?.slopeRigidGroupId||0;
        return !!ga&&ga===gb;
    }
    function currentPairSeg(g,id){const b=boardBall(g,id),s=Array.isArray(b?.fallPath)?b.fallPath[0]:null;return s&&s.videoPairGroupV9?s:null;}
    function visualSamePair(g,a,b){
        const x=currentPairSeg(g,a),y=currentPairSeg(g,b);
        if(x&&y&&x.videoPairGroupV9===y.videoPairGroupV9&&x.videoPairSeqV9===y.videoPairSeqV9)return true;
        if(x){const q=boardBall(g,b);if(q?.videoPairAnchorGroupV9===x.videoPairGroupV9&&q?.videoPairAnchorSeqV9===x.videoPairSeqV9)return true;}
        if(y){const q=boardBall(g,a);if(q?.videoPairAnchorGroupV9===y.videoPairGroupV9&&q?.videoPairAnchorSeqV9===y.videoPairSeqV9)return true;}
        return false;
    }
    visualPointSafe=function(g,id,x,y,minDist=V9_MIN_DIST){
        const maxY=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H;if(y>maxY+1e-7)return false;
        for(const [oid,ov] of g.vis.entries()){
            if(oid===id||!ov||logicalSameGroup(g,id,oid)||visualSamePair(g,id,oid))continue;
            const pivot=g._visualArcPivotById&&g._visualArcPivotById.get(id);
            if(pivot){const dx=(ov.x-pivot[0])*.5,dy=(ov.y-pivot[1])*HEX_ROW_H;if(dx*dx+dy*dy<=1e-10)continue;}
            const dx=(x-ov.x)*.5,dy=(y-ov.y)*HEX_ROW_H;if(dx*dx+dy*dy<minDist*minDist)return false;
        }
        return true;
    };

    const oldMarkPileFlowPaths=markPileFlowPaths;
    markPileFlowPaths=function(g,reason='pile_flow'){
        const out=oldMarkPileFlowPaths(g,reason);
        let latest=Math.max(0,g.pileFlowClock||0),repaired=0;
        for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
            const b=valid(x,y)?g.board[y][x]:null;
            for(const s of (b?.fallPath||[]))if(s?.pileFlow&&Number.isFinite(s.pileFlowEnd))latest=Math.max(latest,s.pileFlowEnd);
        }
        for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;if(!ball?.fallPath)continue;
            for(let i=0;i<ball.fallPath.length;i++){
                const seg=ball.fallPath[i];if(!seg?.pileFlowBlockedV8)continue;
                repairPileFlowSegmentGeometry(g,ball,seg);
                const dur=Math.max(1/120,seg._videoDurationV8||liveSegDuration(seg));
                let start=Math.max(0,g.pileFlowClock||0);
                if(i>0&&Number.isFinite(ball.fallPath[i-1]?.pileFlowEnd))start=Math.max(start,ball.fallPath[i-1].pileFlowEnd);
                const limit=Math.max(start,latest)+Math.max(2,dur*12);let found=null;
                seg._pileFlowBall=ball;seg.pileFlow=true;
                for(let t=start;t<=limit+1e-9;t+=PILE_FLOW_SCHEDULE_STEP){
                    if(pileFlowWaveSafe(g,[seg],t,dur)){found=t;break;}
                }
                if(found!==null){
                    seg.pileFlowBlockedV8=false;seg.pileFlowRecoveredV9=true;seg.motionSeq=0;
                    latest=Math.max(latest,seg.pileFlowEnd);repaired++;
                }else{
                    seg.pileFlow=false;seg.pileFlowBlockedV9=true;
                    seg.motionSeq=seg.pileFlowOriginalSeq||seg.motionSeq||0;
                    delete seg.pileFlowStart;delete seg.pileFlowDuration;delete seg.pileFlowEnd;
                }
                delete seg._pileFlowBall;
            }
        }
        if(repaired)out.repairedV9=(out.repairedV9||0)+repaired;
        return out;
    };

    window.__hexdropPairPivotV9=pairPivotCandidate;
    window.__hexdropReferencePhysicsV9={sourceVideos:6,pairPivot60:true,noPermanentPairRigidity:true,blockedFlowRepair:true};
})();