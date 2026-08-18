/* Wall-side no-gap invariant.
 *
 * The visible wall edge alternates between x=0/1 on the left and x=18/17 on
 * the right.  Earlier wall compaction only detected rows where one lower
 * diagonal was outside the board, so every other wall row could still expose a
 * cavity while an accumulated-pile support moved inward.
 *
 * This layer keeps the ordinary logical destinations and contact geometry, but
 * makes wall-adjacent support chains continuous on BOTH row parities:
 *
 *  - an actually open wall column falls straight down;
 *  - when an inward lower support moves away, the wall ball descends against its
 *    exact contact envelope;
 *  - when the OUTER lower wall support moves inward, the upper wall ball takes
 *    that support's just-vacated wall cell instead of peeling into the interior;
 *  - during post-clear pileFlow, a later ball whose target is a wall cell just
 *    vacated by another moving ball is bound to that mover and starts with it,
 *    so secondary wall vacancies never appear as staged visual holes.
 *
 * No teleport is used. Every custom path remains unit-distance tangent to its
 * moving support and keeps the canonical final lattice cells produced by the
 * gravity resolver.
 */
(function installWallGapInvariant(){
    if(typeof window==="undefined"||window.__hexWallGapInvariant)return;
    window.__hexWallGapInvariant=true;

    const baseNaturalMotion=hexPhysNaturalMotion;
    const baseContactEntries=hexPhysContactEntries;
    const baseProposalPointAt=proposalPointAt;
    const baseLiveBatchPointAt=typeof liveBatchPointAt==="function"?liveBatchPointAt:null;
    const basePileFlowPointForBall=typeof pileFlowPointForBall==="function"?pileFlowPointForBall:null;
    const baseMarkPileFlowPaths=typeof markPileFlowPaths==="function"?markPileFlowPaths:null;

    function wallSideAt(x,y){
        if(!valid(x,y))return 0;
        const left=(y&1)?0:1;
        const right=(y&1)?W2-1:W2-2;
        if(x===left)return 1;
        if(x===right)return -1;
        return 0;
    }
    function samePoint(a,b){return !!a&&!!b&&a[0]===b[0]&&a[1]===b[1];}
    function toPhys(p){return[latticeRealX(p[0]),cellCenterYNorm(p[1])];}
    function fromPhys(p){return[p[0]/0.5,(p[1]-BOARD_TOP_CENTER_N)/HEX_ROW_H];}

    function wallEnvelopePoint(from,to,supportPoint,t){
        t=Math.max(0,Math.min(1,t));
        const wallX=latticeRealX(from[0]);
        const startY=cellCenterYNorm(from[1]);
        const targetY=cellCenterYNorm(to[1]);
        const supportX=latticeRealX(supportPoint[0]);
        const supportY=cellCenterYNorm(supportPoint[1]);
        const dx=Math.abs(supportX-wallX);
        const contactDy=dx>=1?0:Math.sqrt(Math.max(0,1-dx*dx));
        const safeY=supportY-contactDy;
        const freeY=startY+(targetY-startY)*t*t;
        const y=Math.max(startY,Math.min(targetY,freeY,safeY));
        return[from[0],(y-BOARD_TOP_CENTER_N)/HEX_ROW_H];
    }

    // Keep a follower tangent to a support that is simultaneously moving from
    // supportFrom to supportTo.  This is the physically correct continuous path
    // for alternating-parity wall compaction: start and end are both adjacent
    // hex centres, and the relative contact angle rotates while the support moves.
    function wallTangentFollowPoint(from,to,supportFrom,supportTo,supportNow,t){
        t=Math.max(0,Math.min(1,t));
        const a=toPhys(from),z=toPhys(to),s0=toPhys(supportFrom),s1=toPhys(supportTo),sn=toPhys(supportNow);
        let a0=Math.atan2(a[1]-s0[1],a[0]-s0[0]);
        let a1=Math.atan2(z[1]-s1[1],z[0]-s1[0]);
        let da=a1-a0;while(da>Math.PI)da-=Math.PI*2;while(da<-Math.PI)da+=Math.PI*2;
        const ang=a0+da*t;
        return fromPhys([sn[0]+Math.cos(ang),sn[1]+Math.sin(ang)]);
    }

    function lowerOpenForWallDrop(board,x,y,inward,ignore){
        const inner=[x+inward,y+1],outer=[x-inward,y+1];
        if(!valid(inner[0],inner[1])||!hexPhysEmpty(board,inner[0],inner[1],ignore))return false;
        // On alternating rows the outer lower cell is a real wall cell rather
        // than outside the board. Straight-down motion is safe only if that cell
        // is empty too; otherwise canonical rolling/contact-following decides.
        return !valid(outer[0],outer[1])||hexPhysEmpty(board,outer[0],outer[1],ignore);
    }

    hexPhysNaturalMotion=function(board,x,y,ignore=null){
        const ball=valid(x,y)?board[y][x]:null;
        if(ball&&!touchesFloorRow(y)&&!ball.garbageBubbleHold){
            const inward=wallSideAt(x,y);
            if(inward&&valid(x,y+2)&&hexPhysEmpty(board,x,y+2,ignore)&&lowerOpenForWallDrop(board,x,y,inward,ignore)){
                return{x,y,tx:x,ty:y+2,ball,kind:"WALL_DROP",pivot:null,topPivot:null,followSupportIds:[]};
            }
        }
        return baseNaturalMotion(board,x,y,ignore);
    };

    // Rewrite one-support FOLLOW_SUPPORT only when that support moves inward,
    // away from the side boundary. Which compact path is correct depends on row
    // parity: either descend the same wall column, or occupy the outer support's
    // just-vacated wall cell.
    hexPhysContactEntries=function(board,excluded=new Set()){
        const proposals=baseContactEntries(board,excluded);
        return proposals.map(p=>{
            if(!p||p.kind!=="FOLLOW_SUPPORT"||!p.followProposal||!(p.followSupportIds?.length===1))return p;
            const inward=wallSideAt(p.x,p.y);if(!inward)return p;
            const fp=p.followProposal,supportDx=fp.tx-fp.x,supportDy=fp.ty-fp.y;
            if(Math.sign(supportDx)!==inward||supportDy<=0)return p;

            const inner=[p.x+inward,p.y+1],outer=[p.x-inward,p.y+1];
            if(fp.x===inner[0]&&fp.y===inner[1]&&valid(p.x,p.y+2)&&hexPhysEmpty(board,p.x,p.y+2)){
                return{...p,tx:p.x,ty:p.y+2,kind:"WALL_COMPACT_FOLLOW",pivot:null,topPivot:null,wallCompact:true};
            }
            if(fp.x===outer[0]&&fp.y===outer[1]&&valid(outer[0],outer[1])){
                return{...p,tx:outer[0],ty:outer[1],kind:"WALL_EDGE_CHAIN_FOLLOW",pivot:null,topPivot:null,wallCompact:true,wallVacatedSupportCell:true};
            }
            return p;
        });
    };

    proposalPointAt=function(p,t){
        if(p?.kind==="WALL_COMPACT_FOLLOW"&&p.followProposal){
            const sp=proposalPointAt(p.followProposal,t);
            const latticeSupport=[sp[0]/0.5,(sp[1]-BOARD_TOP_CENTER_N)/HEX_ROW_H];
            const out=wallEnvelopePoint([p.x,p.y],[p.tx,p.ty],latticeSupport,t);
            return toPhys(out);
        }
        if(p?.kind==="WALL_EDGE_CHAIN_FOLLOW"&&p.followProposal){
            const sp=proposalPointAt(p.followProposal,t);
            const latticeSupport=[sp[0]/0.5,(sp[1]-BOARD_TOP_CENTER_N)/HEX_ROW_H];
            return toPhys(wallTangentFollowPoint([p.x,p.y],[p.tx,p.ty],[p.followProposal.x,p.followProposal.y],[p.followProposal.tx,p.followProposal.ty],latticeSupport,t));
        }
        return baseProposalPointAt(p,t);
    };

    if(baseLiveBatchPointAt){
        liveBatchPointAt=function(batch,member,t,states,memo=new Map(),stack=new Set()){
            const kind=member?.seg?.kind;
            if(kind==="WALL_COMPACT_FOLLOW"||kind==="WALL_EDGE_CHAIN_FOLLOW"){
                const id=member.cell?.id;if(id!=null&&memo.has(id))return memo.get(id);
                const sid=member.seg.followSupportIds?.[0],support=batch?.byId?.get(sid);
                if(support&&support.seg&&!(stack&&stack.has(id))){
                    const nextStack=new Set(stack||[]);if(id!=null)nextStack.add(id);
                    const sp=liveBatchPointAt(batch,support,t,states,memo,nextStack);
                    const out=kind==="WALL_COMPACT_FOLLOW"
                        ?wallEnvelopePoint(member.seg.from,member.seg.to,sp,t)
                        :wallTangentFollowPoint(member.seg.from,member.seg.to,support.seg.from,support.seg.to,sp,t);
                    if(id!=null)memo.set(id,out);return out;
                }
            }
            return baseLiveBatchPointAt(batch,member,t,states,memo,stack);
        };
    }

    function supportSegmentFor(g,seg,support){
        const path=Array.isArray(support?.fallPath)?support.fallPath:[];
        if(seg?.kind==="WALL_EDGE_CHAIN_FOLLOW"||seg?.kind==="WALL_VACANCY_FOLLOW"){
            const byOrigin=path.find(s=>s?.from&&samePoint(s.from,seg.to));
            if(byOrigin)return byOrigin;
        }
        const timed=path.find(s=>s?.pileFlow&&Number.isFinite(s.pileFlowStart)&&Number.isFinite(s.pileFlowEnd));
        return timed||path[0]||null;
    }

    if(basePileFlowPointForBall){
        pileFlowPointForBall=function(g,ball,seg,q,t,depth=0,seen=null){
            const kind=seg?.kind;
            if((kind==="WALL_COMPACT_FOLLOW"||kind==="WALL_EDGE_CHAIN_FOLLOW"||kind==="WALL_VACANCY_FOLLOW")&&ball){
                const sid=seg.followSupportIds?.[0]||seg.movingSupportId,support=sid?pileFlowBallById(g,sid):null;
                if(support&&support!==ball){
                    const nextSeen=new Set(seen||[]);
                    if(!nextSeen.has(ball.id)){
                        nextSeen.add(ball.id);
                        const sp=pileFlowPositionAt(g,support,t,depth+1,nextSeen);
                        if(kind==="WALL_COMPACT_FOLLOW")return wallEnvelopePoint(seg.from,seg.to,sp,q);
                        const ss=supportSegmentFor(g,seg,support);
                        if(ss?.from&&ss?.to)return wallTangentFollowPoint(seg.from,seg.to,ss.from,ss.to,sp,q);
                    }
                }
            }
            return basePileFlowPointForBall(g,ball,seg,q,t,depth,seen);
        };
    }

    function allPileSegments(g){
        const out=[];
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;if(!ball?.fallPath)continue;
            for(const seg of ball.fallPath)if(seg?.from&&seg?.to)out.push({ball,seg});
        }
        return out;
    }
    function previousPileEnd(ball,seg){
        const path=Array.isArray(ball?.fallPath)?ball.fallPath:[],idx=path.indexOf(seg);if(idx<=0)return -Infinity;
        for(let i=idx-1;i>=0;i--)if(Number.isFinite(path[i]?.pileFlowEnd))return path[i].pileFlowEnd;
        return -Infinity;
    }
    function safelyAlignWithSupport(g,ball,seg,supportSeg){
        if(!Number.isFinite(supportSeg?.pileFlowStart)||!Number.isFinite(supportSeg?.pileFlowDuration))return false;
        const start=supportSeg.pileFlowStart,duration=supportSeg.pileFlowDuration;
        if(previousPileEnd(ball,seg)>start+1e-10)return false;
        const old=[seg.pileFlowStart,seg.pileFlowDuration,seg.pileFlowEnd];
        seg.pileFlowStart=start;seg.pileFlowDuration=duration;seg.pileFlowEnd=start+duration;
        let safe=true;
        if(typeof pileFlowWaveSafe==="function")safe=pileFlowWaveSafe(g,[seg],start,duration);
        if(!safe){
            seg.pileFlowStart=old[0];seg.pileFlowDuration=old[1];seg.pileFlowEnd=old[2];
            return false;
        }
        seg.wallFlowSynchronized=true;return true;
    }

    // The logical collapse already closes secondary vacancies. This pass makes
    // the VISUAL collapse equally continuous at the side boundary by linking a
    // later wall-edge filler to the exact ball that vacated its target cell.
    function bindWallVacancyFollowers(g,reason){
        if(reason!=="clear_support_loss")return 0;
        const entries=allPileSegments(g);let bound=0;

        for(const rec of entries){
            const {ball,seg}=rec;if(!seg?.pileFlow)continue;
            const sf=wallSideAt(seg.from[0],seg.from[1]),st=wallSideAt(seg.to[0],seg.to[1]);
            if(!sf||sf!==st)continue;

            let support=null,supportSeg=null;
            const sid=seg.followSupportIds?.[0]||seg.movingSupportId;
            if(sid){
                support=pileFlowBallById(g,sid);supportSeg=supportSegmentFor(g,seg,support);
            }
            if(!support&&seg.to[1]===seg.from[1]+1&&Math.abs(seg.to[0]-seg.from[0])===1){
                const candidate=entries.find(q=>q.ball!==ball&&q.seg?.pileFlow&&samePoint(q.seg.from,seg.to)&&q.seg.to[1]>q.seg.from[1]);
                if(candidate){
                    support=candidate.ball;supportSeg=candidate.seg;
                    seg.kind="WALL_VACANCY_FOLLOW";
                    seg.followSupportIds=[support.id];seg.movingSupportId=support.id;
                    seg.wallVacancyFill=true;seg.pivot=null;seg.topPivot=null;
                }
            }
            if(!support||!supportSeg)continue;
            if(seg.kind==="WALL_EDGE_CHAIN_FOLLOW"||seg.kind==="WALL_COMPACT_FOLLOW"||seg.kind==="WALL_VACANCY_FOLLOW"){
                if(safelyAlignWithSupport(g,ball,seg,supportSeg))bound++;
            }
        }
        g._lastWallVacancyFollowers=bound;return bound;
    }

    if(baseMarkPileFlowPaths){
        markPileFlowPaths=function(g,reason="pile_flow"){
            const out=baseMarkPileFlowPaths(g,reason);
            bindWallVacancyFollowers(g,reason);
            return out;
        };
    }

    window.__hexWallGapInvariantVersion="wall-gap-v4";
    window.__hexWallGapAllowed=false;
    window.__hexWallCompactFollowEnabled=true;
    window.__hexWallAlternatingParityCompaction=true;
    window.__hexWallDynamicVacancyClosure=true;
    window.__hexWallPileFlowEnvelopeEnabled=true;
})();
