/* HEXDROP patch v7: center-groove ▲ split + no-overlap continuous coupled flow */
(function installHexdropV7(){
    if (typeof window !== "undefined" && window.__hexdropV7Installed) return;
    if (typeof window !== "undefined") window.__hexdropV7Installed = true;

    const V7_MIN_DIST = 0.99998;

    function upAxisBiasV7(members){
        const fields=["subCellBias","momentumX","rollDir","slopeRigidSplitDir"];
        for(const f of fields){
            let sum=0;
            for(const m of members){
                const v=Number(m?.ball?.[f]);
                if(Number.isFinite(v))sum+=v;
            }
            if(Math.abs(sum)>1e-7)return Math.sign(sum);
        }
        return 0;
    }

    function buildUpSplitInfoV7(members,axisSide,extra={}){
        axisSide=Math.sign(axisSide)||1;
        const pairRoles=axisSide>0?[0,1]:[0,2];
        const loneRole=axisSide>0?2:1;
        const pair=pairRoles.map(role=>members.find(m=>m.role===role)).filter(Boolean);
        const lone=members.find(m=>m.role===loneRole);
        if(pair.length!==2||!lone)return null;
        return {
            ...extra,
            axisSide,
            pairDir:axisSide,
            loneDir:-axisSide,
            pair,
            lone,
            cx:members.reduce((n,m)=>n+m.x,0)/members.length
        };
    }

    function upTriangleGroovePeakInfoV7(members,continuation){
        if(!members||members.length!==3)return null;
        if(slopeRigidOrientationOf(members)!=="up")return null;

        const contacts=(continuation?.ballContacts||continuation?.contacts||[])
            .filter(c=>c&&c.kind==="ball");
        if(!contacts.length)return null;

        const cx=members.reduce((n,m)=>n+m.x,0)/members.length;
        const lowerIds=new Set(
            members.filter(m=>m.role===1||m.role===2).map(m=>m.ball.id)
        );
        const bySupport=new Map();
        for(const c of contacts){
            const key=c.supportId ?? (c.x+","+c.y);
            if(!bySupport.has(key))bySupport.set(key,{x:c.x,y:c.y,ids:new Set(),contacts:[]});
            const q=bySupport.get(key);
            q.contacts.push(c);
            if(lowerIds.has(c.memberId))q.ids.add(c.memberId);
        }

        const peak=[...bySupport.values()].find(q=>
            Math.abs(q.x-cx)<1e-7 && q.ids.size===2
        );
        if(!peak)return null;

        const axisSide=upAxisBiasV7(members)||1;
        return buildUpSplitInfoV7(members,axisSide,{
            groovePeak:true,
            peakX:peak.x,
            peakY:peak.y,
            supportContacts:peak.contacts
        });
    }

    upTriangleConvexSplitInfo=function(members,continuation){
        const groove=upTriangleGroovePeakInfoV7(members,continuation);
        if(groove)return groove;

        if(!members||members.length!==3||!continuation?.breakRequired)return null;
        if(slopeRigidOrientationOf(members)!=="up")return null;
        const contacts=(continuation.ballContacts||continuation.contacts||[])
            .filter(c=>c&&c.kind==="ball");
        if(!contacts.length)return null;

        const cx=members.reduce((n,m)=>n+m.x,0)/members.length;
        const unique=new Map();
        for(const c of contacts){
            const key=c.supportId ?? (c.x+","+c.y);
            if(!unique.has(key))unique.set(key,c);
        }
        const sides=[...unique.values()].map(c=>Math.sign(c.x-cx)).filter(Boolean);
        if(!sides.length||!sides.every(s=>s===sides[0]))return null;

        const bumpSide=sides[0];
        return buildUpSplitInfoV7(members,-bumpSide,{bumpSide,groovePeak:false});
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
            if(c.move)continue;

            if(isUpSplitRigidPair(members)){
                for(const m of members){
                    m.ball.rigid=true;
                    m.ball.slopeRigidActive=true;
                    m.ball.slopeRigidPartialPair=true;
                    m.ball.upConvexPairPersistent=true;
                }
                continue;
            }

            if(slopeRigidOrientationOf(members)==="up" && upTriangleConvexSplitInfo(members,c)){
                for(const m of members){
                    m.ball.rigid=true;
                    m.ball.slopeRigidActive=true;
                }
                continue;
            }

            for(const m of members)normalizePileBallPhysics(m.ball);
        }
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

            const preservedPair=isUpSplitRigidPair(members);
            for(const m of members){
                heldIds.add(m.ball.id);
                if(!preview){
                    m.ball.rigid=true;
                    m.ball.slopeRigidActive=true;
                    if(preservedPair){
                        m.ball.slopeRigidPartialPair=true;
                        m.ball.upConvexPairPersistent=true;
                    }
                }
            }

            const continuation=rigidBodyContinuation(b,members);

            if(!preservedPair){
                const groove=upTriangleGroovePeakInfoV7(members,continuation);
                if(groove){
                    if(preview)return {moved:true,heldIds,released:true};
                    const pair=applyUpTriangleConvexSplit(members,groove);
                    released=true;
                    for(const m of members)heldIds.delete(m.ball.id);
                    for(const m of pair)heldIds.add(m.ball.id);
                    continue;
                }
            }

            if(continuation.move){
                if(preview)return {moved:true,heldIds,released};
                applySlopeRigidTranslation(b,members,continuation.dx,continuation.dy);
                return {moved:true,heldIds,released};
            }

            if(!preservedPair){
                const split=upTriangleConvexSplitInfo(members,continuation);
                if(split){
                    if(preview)return {moved:true,heldIds,released:true};
                    const pair=applyUpTriangleConvexSplit(members,split);
                    released=true;
                    for(const m of members)heldIds.delete(m.ball.id);
                    for(const m of pair)heldIds.add(m.ball.id);
                    continue;
                }
            }

            if(preservedPair){
                if(!preview){
                    for(const m of members){
                        m.ball.rigid=true;
                        m.ball.slopeRigidActive=true;
                        m.ball.slopeRigidPartialPair=true;
                        m.ball.upConvexPairPersistent=true;
                    }
                }
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

    visualPointSafe=function(g,id,x,y,minDist=V7_MIN_DIST){
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
            const dx=(x-ov.x)*0.5;
            const dy=(y-ov.y)*HEX_ROW_H;
            if(dx*dx+dy*dy<minDist*minDist)return false;
        }
        return true;
    };

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
            q.seg._pileNominalDuration=pileFlowNominalDuration(q.seg,stateByBall.get(q.ball.id));
        }

        const seqs=[...new Set(fresh.map(q=>q.seq))].sort((a,b)=>a-b);
        const bySeq=new Map(seqs.map(seq=>[seq,[]]));
        for(const q of fresh)bySeq.get(q.seq).push(q);

        for(const seq of seqs){
            const entries=bySeq.get(seq);
            const segs=entries.map(q=>q.seg);
            const duration=Math.max(1/120,...segs.map(s=>s._pileNominalDuration||1/120));
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
                    for(const ss of sp){
                        if(ss?.pileFlow&&Number.isFinite(ss.pileFlowStart)){
                            earliest=Math.max(earliest,ss.pileFlowStart);
                            break;
                        }
                    }
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
                        boundaries.add(s.pileFlowEnd);
                        latestEnd=Math.max(latestEnd,s.pileFlowEnd);
                    }
                }
            }

            const candidates=[...boundaries].sort((a,b)=>a-b);
            let start=null;
            for(const base of candidates){
                for(let k=0;k<=24;k++){
                    const t=base+k*PILE_FLOW_SCHEDULE_STEP;
                    if(pileFlowWaveSafe(g,segs,t,duration)){start=t;break;}
                }
                if(start!==null)break;
            }
            if(start===null){
                let t=latestEnd;
                const limit=latestEnd+Math.max(0.5,duration*2);
                while(t<=limit+1e-9){
                    if(pileFlowWaveSafe(g,segs,t,duration)){start=t;break;}
                    t+=PILE_FLOW_SCHEDULE_STEP;
                }
            }
            if(start===null){
                for(const seg of segs){
                    seg.pileFlowBlockedV7=true;
                    seg.pileFlow=false;
                    seg.motionSeq=seg.pileFlowOriginalSeq||seg.motionSeq||0;
                    delete seg.pileFlowStart;
                    delete seg.pileFlowDuration;
                    delete seg.pileFlowEnd;
                }
                continue;
            }
            for(const seg of segs){
                seg.pileFlowStart=start;
                seg.pileFlowDuration=duration;
                seg.pileFlowEnd=start+duration;
                seg.pileFlowContinuousV7=true;
            }
        }
    };

    markPileFlowPaths=function(g,reason="pile_flow"){
        const fresh=[];
        for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball||!Array.isArray(ball.fallPath)||!ball.fallPath.length)continue;

            const rigid=!!ball.slopeRigidGroupId;
            if(!rigid){
                const wasGarbage=!!ball.isGarbage;
                normalizePileBallPhysics(ball);
                if(wasGarbage)ball.isGarbage=true;
            }

            const already=ball.fallPath.some(seg=>seg?.pileFlow);
            let isFirst=!already;
            for(const seg of ball.fallPath){
                if(!seg||!seg.to||seg.pileFlow)continue;
                repairPileFlowSegmentGeometry(g,ball,seg);
                const seq=Number(seg.motionSeq)||0;
                seg.pileFlowOriginalSeq=seq;
                seg.motionSeq=0;
                seg.pileFlow=true;
                seg.pileFlowEntry=isFirst;
                seg.pileFlowReason=reason;
                seg._pileFlowBall=ball;
                fresh.push({ball,seg,seq});
                isFirst=false;
            }
        }
        if(!fresh.length)return {balls:0,segments:0};

        g._pileFlowBallById=new Map();
        for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
            const b=valid(x,y)?g.board[y][x]:null;
            if(b)g._pileFlowBallById.set(b.id,b);
        }
        scheduleFreshPileFlow(g,fresh);
        const ids=new Set();
        for(const {ball,seg} of fresh){
            ids.add(ball.id);
            const v=g.vis.get(ball.id);
            if(v){
                v.pileFlow=true;
                if(Math.abs(v.vy||0)<0.05)v.vy=RELEASE_INITIAL_VY;
                v.motionSpeed=Math.max(v.motionSpeed||0,v.vy||0,0.0001);
            }
            delete seg._pileNominalDuration;
            delete seg._pileFlowBall;
        }
        return {balls:ids.size,segments:fresh.length};
    };

    const previousLockV7=lock;
    lock=function(g,vy=2){
        const r=previousLockV7(g,vy);
        if(g && g.state==="RESOLVING" && g.phase==="SETTLE" && !g.clearing){
            prepareContinuousPileFlow(g,"post_lock_continuous_v7");
            g.stateT=0;
        }
        return r;
    };

    if(typeof window!=="undefined"){
        window.__hexdropUpGrooveSplitV7=upTriangleGroovePeakInfoV7;
        window.__hexdropNoOverlapV7=true;
    }
})();
