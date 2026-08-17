/* Reference-style accumulated-pile collapse authority.
 *
 * Once a garbage ball has contacted the board it is accumulated pile physics,
 * not a second species of pile.  A clear-support loss therefore has one motion
 * source for normal and former-garbage balls alike: support loss + continuous
 * gravity/tangent motion.  No cross-ball wave scheduling is allowed here.
 */

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
    // The old condition excluded isGarbage balls and silently fell back to the
    // legacy wave scheduler when a clear contained a mixture of ordinary and
    // already-landed garbage balls.  That produced measured 0.2-1.2 s start
    // delays inside one collapse.  Contacted garbage is now the same pile.
    const clearSupportLoss=reason==="clear_support_loss"&&
        Array.isArray(fresh)&&fresh.length>0;
    if(clearSupportLoss){
        hexReferencePileCollapseSchedule(g,fresh);
        return;
    }
    return __hexScheduleFreshPileFlowBeforeReferenceCollapse(g,fresh,reason);
};

function hexNormalPileOwnsFinalCentre(g,q){
    if(!q?.ball)return false;
    // Airborne/contact-relaxing garbage still owns its continuous solver. Once
    // those transient states are gone, isGarbage is origin metadata only and
    // must not exclude the ball from ordinary accumulated-pile authority.
    const specialGarbage=!!(
        q.ball._hexGarbageRelax||
        q.ball._hexGarbageContinuousRest||
        q.ball.garbageBubbleHold
    );
    if(specialGarbage)return false;
    const pilePhase=!!g&&g.state==="RESOLVING"&&(
        g.phase==="SETTLE"||(g.phase==="CLEAR"&&g.clearing?.committed)
    );
    if(pilePhase)return true;
    return !(Array.isArray(q.ball.fallPath)&&q.ball.fallPath.length);
}

function hexReferenceFinalMobility(g,q){
    if(hexNormalPileOwnsFinalCentre(g,q))return 0;
    return hexRenderMobility(g,q);
}

const HEX_REFERENCE_FINAL_CONTACT_PASSES=72;
const HEX_REFERENCE_FINAL_CONTACT_EPS=1e-7;

hexEnforceFinalVisualNonOverlap=function(g){
    const items=hexRenderBoardVisuals(g);
    if(items.length<2)return 0;
    let corrections=0;
    for(let pass=0;pass<HEX_REFERENCE_FINAL_CONTACT_PASSES;pass++){
        let changed=false;
        for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
            const a=items[i],b=items[j];
            const pdx=(b.v.x-a.v.x)*0.5,pdy=(b.v.y-a.v.y)*HEX_ROW_H;
            if(Math.abs(pdx)>=1||Math.abs(pdy)>=1)continue;
            const n=hexRenderPairNormal(a,b);
            if(n.d>=1-HEX_REFERENCE_FINAL_CONTACT_EPS)continue;

            const pileA=hexNormalPileOwnsFinalCentre(g,a);
            const pileB=hexNormalPileOwnsFinalCentre(g,b);
            // The final garbage projection must never invent a second trajectory
            // for two accumulated-pile members.
            if(pileA&&pileB)continue;

            let ma=hexReferenceFinalMobility(g,a),mb=hexReferenceFinalMobility(g,b);
            if(ma<=0&&mb<=0)continue;
            const total=ma+mb;if(total<=0)continue;
            const push=1-n.d;
            hexRenderMoveAlongNormal(a,n.nx,n.ny,push*(ma/total),-1);
            hexRenderMoveAlongNormal(b,n.nx,n.ny,push*(mb/total),+1);
            changed=true;corrections++;
        }
        if(!changed)break;
    }
    return corrections;
};
