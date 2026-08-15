/* HEXDROP patch v8: original-footage calibrated split / slide / coupled motion */
(function installHexdropV8(){
    if(typeof window!=="undefined" && window.__hexdropV8Installed)return;
    if(typeof window!=="undefined")window.__hexdropV8Installed=true;

    const V8_CONTACT_FRAMES=5;
    const V8_CONTACT_DURATION=V8_CONTACT_FRAMES/30;
    const V8_MIN_DIST=0.9995;

    function upAxisBiasV8(members,continuation){
        for(const f of ["subCellBias","momentumX","rollDir","slopeRigidSplitDir"]){
            let sum=0;
            for(const m of members){
                const v=Number(m?.ball?.[f]);
                if(Number.isFinite(v))sum+=v;
            }
            if(Math.abs(sum)>1e-7)return Math.sign(sum);
        }
        if(Number.isFinite(continuation?.dx) && Math.abs(continuation.dx)>1e-7)
            return Math.sign(continuation.dx);
        if(typeof commonRigidMomentumDir==="function"){
            const d=commonRigidMomentumDir(members);
            if(d)return Math.sign(d);
        }
        return -1;
    }

    function buildUpSplitInfoV8(members,pairSide,extra={}){
        pairSide=Math.sign(pairSide)||-1;
        const pairRoles=pairSide>0?[0,1]:[0,2];
        const loneRole=pairSide>0?2:1;
        const pair=pairRoles.map(role=>members.find(m=>m.role===role)).filter(Boolean);
        const lone=members.find(m=>m.role===loneRole);
        if(pair.length!==2||!lone)return null;
        return {
            ...extra,
            axisSide:pairSide,
            pairDir:pairSide,
            loneDir:-pairSide,
            pair,lone,
            cx:members.reduce((n,m)=>n+m.x,0)/members.length
        };
    }

    function referenceUpContactSplitV8(b,members,continuation){
        if(!members||members.length!==3)return null;
        if(slopeRigidOrientationOf(members)!=="up")return null;

        const contacts=slopeRigidExternalContacts(b,members);
        if(!contacts.length)return null;
        if(contacts.some(c=>c.kind==="floor"))return null;

        const straight=typeof strictStraightSlopeInfo==="function"
            ? strictStraightSlopeInfo(b,members,contacts)
            : null;
        if(straight)return null;

        const lowerById=new Map();
        for(const m of members)if(m.role===1||m.role===2)lowerById.set(m.ball.id,m.role);
        const ballContacts=contacts.filter(c=>c?.kind==="ball" && lowerById.has(c.memberId));
        if(!ballContacts.length)return null;

        const cx=members.reduce((n,m)=>n+m.x,0)/members.length;
        const supports=new Map();
        for(const c of ballContacts){
            const key=c.supportId ?? (c.x+","+c.y);
            if(!supports.has(key))supports.set(key,{x:c.x,y:c.y,roles:new Set(),contacts:[]});
            const q=supports.get(key);
            q.roles.add(lowerById.get(c.memberId));
            q.contacts.push(c);
        }

        const groove=[...supports.values()].find(q=>
            Math.abs(q.x-cx)<1e-7 && q.roles.has(1) && q.roles.has(2)
        );
        if(groove){
            const side=upAxisBiasV8(members,continuation);
            return buildUpSplitInfoV8(members,side,{
                groovePeak:true,
                peakX:groove.x,peakY:groove.y,
                supportContacts:groove.contacts,
                sourceRule:"reference_center_groove"
            });
        }

        const roleContacts=new Set(ballContacts.map(c=>lowerById.get(c.memberId)));
        if(roleContacts.size===1){
            const caughtRole=[...roleContacts][0];
            const pairSide=caughtRole===1 ? -1 : 1;
            return buildUpSplitInfoV8(members,pairSide,{
                groovePeak:false,
                caughtRole,
                sourceRule:"reference_single_lower_contact"
            });
        }

        const sides=[...supports.values()]
            .map(q=>Math.sign(q.x-cx)).filter(Boolean);
        if(sides.length && sides.every(s=>s===sides[0])){
            const bumpSide=sides[0];
            return buildUpSplitInfoV8(members,-bumpSide,{
                groovePeak:false,bumpSide,
                sourceRule:"reference_one_sided_peak"
            });
        }
        return null;
    }

    upTriangleConvexSplitInfo=function(members,continuation){
        if(!members||members.length!==3)return null;
        const contacts=(continuation?.ballContacts||continuation?.contacts||[])
            .filter(c=>c&&c.kind==="ball");
        if(!contacts.length)return null;
        const cx=members.reduce((n,m)=>n+m.x,0)/members.length;
        const lowerIds=new Set(members.filter(m=>m.role===1||m.role===2).map(m=>m.ball.id));
        const lower=contacts.filter(c=>lowerIds.has(c.memberId));
        if(!lower.length)return null;
        const roleById=new Map(members.map(m=>[m.ball.id,m.role]));
        const roles=new Set(lower.map(c=>roleById.get(c.memberId)));
        if(roles.size===1){
            const caught=[...roles][0];
            return buildUpSplitInfoV8(members,caught===1?-1:1,{sourceRule:"compat_single_lower"});
        }
        const center=lower.filter(c=>Math.abs(c.x-cx)<1e-7);
        if(center.length){
            return buildUpSplitInfoV8(members,upAxisBiasV8(members,continuation),{
                groovePeak:true,sourceRule:"compat_center_groove"
            });
        }
        const sides=lower.map(c=>Math.sign(c.x-cx)).filter(Boolean);
        if(sides.length&&sides.every(s=>s===sides[0]))
            return buildUpSplitInfoV8(members,-sides[0],{bumpSide:sides[0],sourceRule:"compat_side"});
        return null;
    };

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
                    if(pair)m.ball.slopeRigidPartialPair=true;
                }
            }

            const continuation=rigidBodyContinuation(b,members);

            if(!pair){
                const split=referenceUpContactSplitV8(b,members,continuation);
                if(split){
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

            releaseGroup(
                members,
                pair
                    ? "pair_common_motion_end"
                    : (continuation.breakRequired
                        ? (continuation.breakReason||"differential_constraint")
                        : "pile_settled")
            );
        }
        return {moved:false,heldIds,released};
    };

    stripFinishedTripletRigidity=function(g){
        const groups=slopeRigidGroups(g.board);
        for(const members of groups.values()){
            if(!isSupportedSlopeRigidGroup(members)){
                for(const m of members)normalizePileBallPhysics(m.ball);
                continue;
            }
            const visuallyInFlight=members.some(m=>
                Array.isArray(m.ball.fallPath)&&m.ball.fallPath.length>0
            );
            if(visuallyInFlight)continue;

            const c=rigidBodyContinuation(g.board,members);
            if(!isUpSplitRigidPair(members)){
                const split=referenceUpContactSplitV8(g.board,members,c);
                if(split)continue;
            }
            if(c.move)continue;
            for(const m of members)normalizePileBallPhysics(m.ball);
        }
    };

    function sameRigidGroupV8(g,idA,idB){
        if(!g||!idA||!idB)return false;
        const a=pileFlowBallById(g,idA), b=pileFlowBallById(g,idB);
        const ga=a?.slopeRigidGroupId||0, gb=b?.slopeRigidGroupId||0;
        return !!ga && ga===gb;
    }

    visualPointSafe=function(g,id,x,y,minDist=V8_MIN_DIST){
        const maxVisualRowY=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H;
        if(y>maxVisualRowY+1e-7)return false;
        for(const [oid,ov] of g.vis.entries()){
            if(oid===id||!ov)continue;
            if(sameRigidGroupV8(g,id,oid))continue;
            const pivot=g._visualArcPivotById&&g._visualArcPivotById.get(id);
            if(pivot){
                const pdx=(ov.x-pivot[0])*0.5;
                const pdy=(ov.y-pivot[1])*HEX_ROW_H;
                if(pdx*pdx+pdy*pdy<=1e-10)continue;
            }
            const dx=(x-ov.x)*0.5;
            const dy=(y-ov.y)*HEX_ROW_H;
            if(dx*dx+dy*dy<minDist*minDist)return false;
        }
        return true;
    };

    pileFlowNominalDuration=function(seg,state){
        const H=HEX_ROW_H;
        const dx=seg.to[0]-seg.from[0];
        const dy=seg.to[1]-seg.from[1];
        seg.videoV0Rows=0;
        seg.videoFallT=0;
        seg.videoArcT=0;

        if(seg.topPivot){
            const [px,py]=seg.topPivot;
            const contactRow=(cellCenterYNorm(py)-1-BOARD_TOP_CENTER_N)/H;
            const fallRows=Math.max(0,contactRow-seg.from[1]);
            const v0=Math.max(0,state.vy||RELEASE_INITIAL_VY);
            const fallT=fallRows>1e-9
                ? (-v0+Math.sqrt(Math.max(0,v0*v0+2*GRAV*fallRows)))/GRAV
                : 0;
            const tx=latticeRealX(seg.to[0]);
            const ty=cellCenterYNorm(seg.to[1]);
            const sx=latticeRealX(px);
            const sy=cellCenterYNorm(py);
            let da=Math.atan2(ty-sy,tx-sx)-(-Math.PI/2);
            while(da>Math.PI)da-=Math.PI*2;
            while(da<-Math.PI)da+=Math.PI*2;
            const arcT=Math.abs(da)/SLIDE_SPEED;
            seg.videoV0Rows=v0;
            seg.videoFallRows=fallRows;
            seg.videoFallT=fallT;
            seg.videoArcT=arcT;
            state.vy=Math.max(0,SLIDE_SPEED*Math.abs(Math.cos(Math.atan2(ty-sy,tx-sx)))/H);
            state.speed=SLIDE_SPEED;
            return Math.max(1/120,fallT+arcT);
        }

        if(seg.pivot){
            const [px,py]=seg.pivot;
            const a0=Math.atan2((seg.from[1]-py)*H,(seg.from[0]-px)*0.5);
            const a1=Math.atan2((seg.to[1]-py)*H,(seg.to[0]-px)*0.5);
            let da=a1-a0;
            while(da>Math.PI)da-=Math.PI*2;
            while(da<-Math.PI)da+=Math.PI*2;
            const dur=seg.slopeRigidArc && Number.isFinite(seg.slopeDuration)
                ? Math.max(1/120,seg.slopeDuration)
                : Math.max(1/120,Math.abs(da)/SLIDE_SPEED);
            seg.videoArcT=dur;
            state.speed=SLIDE_SPEED;
            state.vy=Math.max(0,SLIDE_SPEED*Math.abs(Math.cos(a1))/H);
            return dur;
        }

        if(Math.abs(dx)<1e-9 && dy>0){
            const v0=Math.max(0,state.vy||RELEASE_INITIAL_VY);
            const dur=(-v0+Math.sqrt(Math.max(0,v0*v0+2*GRAV*dy)))/GRAV;
            seg.videoV0Rows=v0;
            state.vy=v0+GRAV*dur;
            state.speed=Math.max(state.speed||0,state.vy*H);
            return Math.max(1/120,dur);
        }

        const dist=Math.hypot(dx*0.5,dy*H);
        const speed=Math.max(SLIDE_SPEED,state.speed||0.0001);
        const dur=Math.max(1/120,dist/speed);
        state.speed=speed;
        state.vy=Math.max(0,dy/Math.max(1e-9,dur));
        return dur;
    };

    pileFlowPoint=function(seg,t){
        t=Math.max(0,Math.min(1,t));
        const H=HEX_ROW_H;

        if(seg.topPivot){
            const [px,py]=seg.topPivot;
            const sx=latticeRealX(seg.from[0]);
            const sy=cellCenterYNorm(seg.from[1]);
            const supportX=latticeRealX(px);
            const supportY=cellCenterYNorm(py);
            const contactX=supportX;
            const contactY=supportY-1;
            const fallT=Math.max(0,Number(seg.videoFallT)||0);
            const arcT=Math.max(0,Number(seg.videoArcT)||0);
            const total=Math.max(1e-9,fallT+arcT);
            const elapsed=t*total;
            if(elapsed<=fallT && fallT>1e-9){
                const v0=Math.max(0,Number(seg.videoV0Rows)||0);
                const rows=Math.max(1e-9,Number(seg.videoFallRows)||0);
                const q=Math.max(0,Math.min(1,(v0*elapsed+0.5*GRAV*elapsed*elapsed)/rows));
                const rx=sx+(contactX-sx)*q;
                const ry=sy+(contactY-sy)*q;
                return [rx/0.5,(ry-BOARD_TOP_CENTER_N)/H];
            }
            const q=arcT<=1e-9?1:Math.max(0,Math.min(1,(elapsed-fallT)/arcT));
            const tx=latticeRealX(seg.to[0]), ty=cellCenterYNorm(seg.to[1]);
            const a0=-Math.PI/2;
            let da=Math.atan2(ty-supportY,tx-supportX)-a0;
            while(da>Math.PI)da-=Math.PI*2;
            while(da<-Math.PI)da+=Math.PI*2;
            const a=a0+da*q;
            return [(supportX+Math.cos(a))/0.5,(supportY+Math.sin(a)-BOARD_TOP_CENTER_N)/H];
        }

        if(seg.pivot){
            const [px,py]=seg.pivot;
            const a0=Math.atan2((seg.from[1]-py)*H,(seg.from[0]-px)*0.5);
            const a1=Math.atan2((seg.to[1]-py)*H,(seg.to[0]-px)*0.5);
            let da=a1-a0;
            while(da>Math.PI)da-=Math.PI*2;
            while(da<-Math.PI)da+=Math.PI*2;
            const q=(seg.slopeRigidArc&&seg.slopeTerminal)
                ? 1-(1-t)*(1-t)
                : t;
            const a=a0+da*q;
            return [px+Math.cos(a)/0.5,py+Math.sin(a)/H];
        }

        const dx=seg.to[0]-seg.from[0];
        const dy=seg.to[1]-seg.from[1];
        if(Math.abs(dx)<1e-9 && dy>0 && Number.isFinite(seg.videoV0Rows)){
            const dur=Math.max(1e-9,Number(seg.pileFlowDuration)||Number(seg._videoDurationV8)||1/120);
            const elapsed=t*dur;
            const v0=Math.max(0,Number(seg.videoV0Rows)||0);
            const q=Math.max(0,Math.min(1,(v0*elapsed+0.5*GRAV*elapsed*elapsed)/Math.max(1e-9,dy)));
            return [seg.from[0],seg.from[1]+dy*q];
        }
        return [seg.from[0]+dx*t,seg.from[1]+dy*t];
    };

    function variableWaveSafeV8(g,segs,start){
        for(const seg of segs){
            const dur=Math.max(1/120,seg._videoDurationV8||1/120);
            seg.pileFlowStart=start;
            seg.pileFlowDuration=dur;
            seg.pileFlowEnd=start+dur;
        }
        const boardBalls=[];
        for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
            const b=valid(x,y)?g.board[y][x]:null;
            if(b)boardBalls.push(b);
        }
        const maxDur=Math.max(1/120,...segs.map(s=>s.pileFlowDuration));
        const samples=Math.max(12,Math.min(48,Math.ceil(maxDur*120)+4));
        for(let i=0;i<=samples;i++){
            const tt=start+maxDur*(i/samples);
            const memo=new Map(),pos=new Map();
            for(const ball of boardBalls)pos.set(ball.id,pileFlowPositionAt(g,ball,tt,0,null,memo));
            for(const seg of segs){
                const moving=seg._pileFlowBall;
                if(!moving)continue;
                const a=pos.get(moving.id);
                for(const other of boardBalls){
                    if(other===moving||sameRigidGroupV8(g,moving.id,other.id))continue;
                    const b=pos.get(other.id);
                    if(pileFlowPhysicalDist(a,b)<V8_MIN_DIST){
                        for(const q of segs){delete q.pileFlowStart;delete q.pileFlowDuration;delete q.pileFlowEnd;}
                        return false;
                    }
                }
            }
        }
        return true;
    }

    scheduleFreshPileFlow=function(g,fresh){
        if(!fresh.length)return;
        const stateByBall=new Map();
        for(const q of fresh){
            if(!stateByBall.has(q.ball.id)){
                const v=g.vis.get(q.ball.id);
                stateByBall.set(q.ball.id,{
                    vy:Math.max(0,v?.vy||RELEASE_INITIAL_VY),
                    speed:Math.max(0,v?.motionSpeed||0)
                });
            }
            q.seg._videoDurationV8=pileFlowNominalDuration(q.seg,stateByBall.get(q.ball.id));
        }

        const seqs=[...new Set(fresh.map(q=>q.seq))].sort((a,b)=>a-b);
        const bySeq=new Map(seqs.map(seq=>[seq,[]]));
        for(const q of fresh)bySeq.get(q.seq).push(q);

        for(const seq of seqs){
            const entries=bySeq.get(seq), segs=entries.map(q=>q.seg);
            let earliest=Math.max(0,g.pileFlowClock||0);

            for(const {ball,seg} of entries){
                const path=ball.fallPath||[];
                const idx=path.indexOf(seg);
                if(idx>0){
                    for(let j=idx-1;j>=0;j--){
                        const prev=path[j];
                        if(Number.isFinite(prev?.pileFlowEnd)){
                            earliest=Math.max(earliest,prev.pileFlowEnd);
                            break;
                        }
                    }
                }
                for(const sid of pileFlowSupportIds(seg)){
                    const sb=pileFlowBallById(g,sid);
                    const sp=Array.isArray(sb?.fallPath)?sb.fallPath:[];
                    const ss=sp.find(s=>s?.pileFlow&&Number.isFinite(s.pileFlowStart));
                    if(ss)earliest=Math.max(earliest,ss.pileFlowStart);
                }
            }

            const boundaries=new Set([earliest]);
            let latestEnd=earliest;
            for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
                const ball=valid(x,y)?g.board[y][x]:null;
                if(!ball?.fallPath)continue;
                for(const s of ball.fallPath){
                    if(!s?.pileFlow||segs.includes(s))continue;
                    if(Number.isFinite(s.pileFlowStart)&&s.pileFlowStart>=earliest-1e-9)boundaries.add(s.pileFlowStart);
                    if(Number.isFinite(s.pileFlowEnd)&&s.pileFlowEnd>=earliest-1e-9){
                        boundaries.add(s.pileFlowEnd);latestEnd=Math.max(latestEnd,s.pileFlowEnd);
                    }
                }
            }

            let start=null;
            for(const base of [...boundaries].sort((a,b)=>a-b)){
                for(let k=0;k<=24;k++){
                    const t0=base+k*PILE_FLOW_SCHEDULE_STEP;
                    if(variableWaveSafeV8(g,segs,t0)){start=t0;break;}
                }
                if(start!==null)break;
            }
            if(start===null){
                let t0=latestEnd;
                const maxDur=Math.max(...segs.map(s=>s._videoDurationV8||1/120));
                const limit=latestEnd+Math.max(.5,maxDur*2);
                while(t0<=limit+1e-9){
                    if(variableWaveSafeV8(g,segs,t0)){start=t0;break;}
                    t0+=PILE_FLOW_SCHEDULE_STEP;
                }
            }
            if(start===null){
                for(const seg of segs){
                    seg.pileFlow=false;
                    seg.pileFlowBlockedV8=true;
                    seg.motionSeq=seg.pileFlowOriginalSeq||seg.motionSeq||0;
                    delete seg.pileFlowStart;delete seg.pileFlowDuration;delete seg.pileFlowEnd;
                }
                continue;
            }
            variableWaveSafeV8(g,segs,start);
        }
    };

    if(typeof window!=="undefined"){
        window.__hexdropReferencePhysicsV8={
            contactFrames:V8_CONTACT_FRAMES,
            contactDuration:V8_CONTACT_DURATION,
            minDistance:V8_MIN_DIST,
            sourceVideos:6
        };
        window.__hexdropUpSplitV8=referenceUpContactSplitV8;
    }
})();
