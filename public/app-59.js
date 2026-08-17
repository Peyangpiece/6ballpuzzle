/* Reference-style accumulated-pile collapse authority.
 *
 * The accumulated pile must have one motion source: support loss + continuous
 * gravity/tangent motion.  The previous stack still had two independent motion
 * generators layered on top of that model:
 *   1) a collision-safe scheduler that could delay later logical events into
 *      visible waves, and
 *   2) the global render-boundary projection that was allowed to push normal
 *      pile balls away from their analytic/support-driven centres.
 *
 * For a normal post-clear collapse, every ball's FIRST segment begins at the
 * same collapse clock.  Causal support links keep upper balls tangent to moving
 * lower supports in that same interval.  Only later segments of the SAME ball
 * are sequential.  No other ball is delayed merely because settleAll happened
 * to discover its logical move later.
 *
 * The final global projection is now garbage-side only with respect to the
 * accumulated normal pile.  Normal pile motion is owned by pileFlow + the
 * established app-31..35 instantaneous pile contact solve; garbage may yield to
 * that pile, but the garbage solver may not become a second pile trajectory.
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

    // All independently affected pile members begin on the same physical frame.
    // Logical event sequence is bookkeeping only; it must not become animation
    // latency.  A ball's own later cells remain continuous and sequential.
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

    // Now that every first segment shares one clock, infer moving supports from
    // the complete continuous schedule.  Lower members are inspected first only
    // to make the causal graph deterministic; their start time is not advanced.
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
    const normalClear=reason==="clear_support_loss"&&
        Array.isArray(fresh)&&fresh.length>0&&fresh.every(q=>!q.ball?.isGarbage);
    if(normalClear){
        hexReferencePileCollapseSchedule(g,fresh);
        return;
    }
    return __hexScheduleFreshPileFlowBeforeReferenceCollapse(g,fresh,reason);
};

function hexNormalPileOwnsFinalCentre(g,q){
    if(!q?.ball||q.ball.isGarbage)return false;
    const pilePhase=!!g&&g.state==="RESOLVING"&&(
        g.phase==="SETTLE"||(g.phase==="CLEAR"&&g.clearing?.committed)
    );
    // During post-clear pile flow, app-31..35 owns both moving and supporting
    // normal balls. Outside that phase, an accumulated normal ball with no path
    // is a fixed support for garbage, not something garbage may push around.
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
            // Never let the garbage/global solver invent a second trajectory for
            // two normal pile members. Their same-frame contact solve already ran
            // inside resolveVisualContacts from the analytic pileFlow frame.
            if(pileA&&pileB)continue;

            let ma=hexReferenceFinalMobility(g,a),mb=hexReferenceFinalMobility(g,b);
            // If one side is authoritative pile, the other side takes the whole
            // correction.  If neither side can move, do not manufacture motion.
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
