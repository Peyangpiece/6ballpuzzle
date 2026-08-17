/* Reference-style accumulated-pile collapse authority.
 *
 * Once a garbage ball has contacted the board it is accumulated pile physics,
 * not a second species of pile. A clear-support loss therefore has one motion
 * source for normal and former-garbage balls alike: support loss + continuous
 * gravity/tangent motion. No cross-ball wave scheduling is allowed here.
 */

const HEX_PILE_CONTACT_COUPLE_EPS=2e-5;
const HEX_PILE_CONTACT_TIME_EPS=1e-8;

function hexPileSameTranslation(a,b){
    if(!a?.from||!a?.to||!b?.from||!b?.to)return false;
    const adx=a.to[0]-a.from[0],ady=a.to[1]-a.from[1];
    const bdx=b.to[0]-b.from[0],bdy=b.to[1]-b.from[1];
    return Math.abs(adx-bdx)<=HEX_PILE_CONTACT_COUPLE_EPS&&
           Math.abs(ady-bdy)<=HEX_PILE_CONTACT_COUPLE_EPS;
}
function hexPileTouchingEndpoints(a,b){
    if(!a?.from||!a?.to||!b?.from||!b?.to)return false;
    return Math.abs(pileFlowPhysicalDist(a.from,b.from)-1)<=HEX_PILE_CONTACT_COUPLE_EPS&&
           Math.abs(pileFlowPhysicalDist(a.to,b.to)-1)<=HEX_PILE_CONTACT_COUPLE_EPS;
}
function hexPileShiftLaterSegments(ball,seg,delta){
    if(Math.abs(delta)<=1e-12||!Array.isArray(ball?.fallPath))return;
    const idx=ball.fallPath.indexOf(seg);if(idx<0)return;
    for(let i=idx+1;i<ball.fallPath.length;i++){
        const s=ball.fallPath[i];
        if(!s?.pileFlow||!Number.isFinite(s.pileFlowStart)||!Number.isFinite(s.pileFlowEnd))continue;
        s.pileFlowStart+=delta;s.pileFlowEnd+=delta;
    }
}

/* Balls that are touching at both ends of the SAME logical translation cannot
 * independently choose different roll arcs/speeds: that would require them to
 * pass through one another. During only that segment, form a temporary contact
 * cluster. A spanning-tree follower keeps the exact one-diameter offset from a
 * neighbouring leader; all members share the slower/common duration. This is
 * not permanent rigidity and disappears automatically with the segment.
 */
function hexReferenceCoupleParallelContacts(fresh){
    if(!Array.isArray(fresh)||fresh.length<2)return;
    for(let pass=0;pass<6;pass++){
        let changed=false;
        const usable=fresh.filter(q=>q?.seg?.pileFlow&&q.seg.from&&q.seg.to&&
            Number.isFinite(q.seg.pileFlowStart)&&Number.isFinite(q.seg.pileFlowDuration));
        const groups=[];
        for(const q of usable){
            let group=groups.find(g=>
                Math.abs(g.start-q.seg.pileFlowStart)<=HEX_PILE_CONTACT_TIME_EPS&&
                hexPileSameTranslation(g.seed.seg,q.seg));
            if(!group){group={start:q.seg.pileFlowStart,seed:q,items:[]};groups.push(group);}
            group.items.push(q);
        }
        for(const group of groups){
            if(group.items.length<2)continue;
            const items=group.items,adj=new Map(items.map(q=>[q.ball.id,[]]));
            for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
                if(!hexPileTouchingEndpoints(items[i].seg,items[j].seg))continue;
                adj.get(items[i].ball.id).push(items[j]);adj.get(items[j].ball.id).push(items[i]);
            }
            const seen=new Set();
            for(const seed of items){
                if(seen.has(seed.ball.id)||!adj.get(seed.ball.id).length)continue;
                const comp=[],queue=[seed];seen.add(seed.ball.id);
                while(queue.length){const q=queue.shift();comp.push(q);for(const n of adj.get(q.ball.id)){if(seen.has(n.ball.id))continue;seen.add(n.ball.id);queue.push(n);}}
                if(comp.length<2)continue;
                const commonDuration=Math.max(...comp.map(q=>q.seg.pileFlowDuration));
                for(const q of comp){
                    const old=q.seg.pileFlowDuration,delta=commonDuration-old;
                    if(delta>1e-12){q.seg.pileFlowDuration=commonDuration;q.seg.pileFlowEnd=q.seg.pileFlowStart+commonDuration;hexPileShiftLaterSegments(q.ball,q.seg,delta);changed=true;}
                }
                // Root choice is deterministic. Build only unit-distance parent
                // links so pileFlowPointForBall's one-radius follower geometry is exact.
                comp.sort((a,b)=>(a.seg.from[0]-b.seg.from[0])||(a.seg.from[1]-b.seg.from[1])||(a.ball.id-b.ball.id));
                const root=comp[0],treeSeen=new Set([root.ball.id]),tree=[root];
                while(tree.length){
                    const parent=tree.shift();
                    const ns=adj.get(parent.ball.id).slice().sort((a,b)=>(a.seg.from[0]-b.seg.from[0])||(a.ball.id-b.ball.id));
                    for(const child of ns){
                        if(treeSeen.has(child.ball.id))continue;
                        // Existing true moving-support constraints take priority;
                        // do not overwrite a physically explicit support graph.
                        if(!pileFlowSupportIds(child.seg).length){
                            child.seg.followSupportIds=[parent.ball.id];
                            child.seg.movingSupportId=parent.ball.id;
                            child.seg.pileFlowContactCoupled=true;
                            child.seg.pileFlowInferredSupport=true;
                        }
                        treeSeen.add(child.ball.id);tree.push(child);
                    }
                }
            }
        }
        if(!changed)break;
    }
}

function hexReferencePileCollapseSchedule(g,fresh){
    if(!fresh?.length)return;
    preparePileFlowDurations(g,fresh);
    const base=Math.max(0,Number(g.pileFlowClock)||0);
    const byBall=new Map();
    for(const q of fresh){
        if(!byBall.has(q.ball.id))byBall.set(q.ball.id,[]);
        byBall.get(q.ball.id).push(q);
    }

    // Every affected ball starts its first segment on the same physical frame.
    // Only later segments of the SAME ball are sequential.
    for(const entries of byBall.values()){
        entries.sort((a,b)=>{
            const ap=Array.isArray(a.ball?.fallPath)?a.ball.fallPath.indexOf(a.seg):-1;
            const bp=Array.isArray(b.ball?.fallPath)?b.ball.fallPath.indexOf(b.seg):-1;
            return ap-bp;
        });
        let cursor=base;
        for(const q of entries){
            const duration=Math.max(1/120,Number(q.seg._pileNominalDuration)||1/120);
            q.seg.pileFlowStart=cursor;
            q.seg.pileFlowDuration=duration;
            q.seg.pileFlowEnd=cursor+duration;
            q.seg.pileFlowReferenceConcurrent=true;
            cursor=q.seg.pileFlowEnd;
        }
    }

    // Couple same-translation touching neighbours before inferring vertical
    // moving supports. This removes impossible intersecting roll arcs while
    // preserving fully concurrent collapse onset.
    hexReferenceCoupleParallelContacts(fresh);

    const ordered=fresh.slice().sort((a,b)=>
        (b.seg.from?.[1]||0)-(a.seg.from?.[1]||0)||
        (a.seg.from?.[0]||0)-(b.seg.from?.[0]||0)||
        (a.ball.id||0)-(b.ball.id||0)
    );
    for(const q of ordered){
        if(pileFlowSupportIds(q.seg).length)continue;
        pileFlowAttachCausalSupports(
            g,q.ball,q.seg,q.seg.pileFlowStart,q.seg.pileFlowDuration
        );
    }
}

const __hexScheduleFreshPileFlowBeforeReferenceCollapse=scheduleFreshPileFlow;
scheduleFreshPileFlow=function(g,fresh,reason="pile_flow"){
    const clearSupportLoss=reason==="clear_support_loss"&&Array.isArray(fresh)&&fresh.length>0;
    if(clearSupportLoss){hexReferencePileCollapseSchedule(g,fresh);return;}
    return __hexScheduleFreshPileFlowBeforeReferenceCollapse(g,fresh,reason);
};

function hexNormalPileOwnsFinalCentre(g,q){
    if(!q?.ball)return false;
    const specialGarbage=!!(q.ball._hexGarbageRelax||q.ball._hexGarbageContinuousRest||q.ball.garbageBubbleHold);
    if(specialGarbage)return false;
    const pilePhase=!!g&&g.state==="RESOLVING"&&(g.phase==="SETTLE"||(g.phase==="CLEAR"&&g.clearing?.committed));
    if(pilePhase)return true;
    return !(Array.isArray(q.ball.fallPath)&&q.ball.fallPath.length);
}
function hexReferenceFinalMobility(g,q){if(hexNormalPileOwnsFinalCentre(g,q))return 0;return hexRenderMobility(g,q);}
const HEX_REFERENCE_FINAL_CONTACT_PASSES=72;
const HEX_REFERENCE_FINAL_CONTACT_EPS=1e-7;
hexEnforceFinalVisualNonOverlap=function(g){
    const items=hexRenderBoardVisuals(g);if(items.length<2)return 0;let corrections=0;
    for(let pass=0;pass<HEX_REFERENCE_FINAL_CONTACT_PASSES;pass++){
        let changed=false;
        for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
            const a=items[i],b=items[j],pdx=(b.v.x-a.v.x)*0.5,pdy=(b.v.y-a.v.y)*HEX_ROW_H;
            if(Math.abs(pdx)>=1||Math.abs(pdy)>=1)continue;
            const n=hexRenderPairNormal(a,b);if(n.d>=1-HEX_REFERENCE_FINAL_CONTACT_EPS)continue;
            const pileA=hexNormalPileOwnsFinalCentre(g,a),pileB=hexNormalPileOwnsFinalCentre(g,b);
            if(pileA&&pileB)continue;
            const ma=hexReferenceFinalMobility(g,a),mb=hexReferenceFinalMobility(g,b);if(ma<=0&&mb<=0)continue;
            const total=ma+mb;if(total<=0)continue;const push=1-n.d;
            hexRenderMoveAlongNormal(a,n.nx,n.ny,push*(ma/total),-1);hexRenderMoveAlongNormal(b,n.nx,n.ny,push*(mb/total),+1);
            changed=true;corrections++;
        }
        if(!changed)break;
    }
    return corrections;
};
