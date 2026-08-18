/* Wall-side no-gap invariant.
 *
 * A side wall is never allowed to become one half of a stable pocket. Two
 * reference-facing rules are enforced here without weakening interior HEXAGON
 * equilibrium:
 *
 *  1) when a wall-edge ball has open space directly below and its inward lower
 *     neighbour is also open, gravity stays on the wall column instead of
 *     peeling the ball inward and leaving a visible notch;
 *  2) when the only real lower support moves inward away from the wall, the
 *     wall-edge ball does not FOLLOW_SUPPORT into the support's old cell. It
 *     descends the wall at the same time, limited by the moving support's exact
 *     contact envelope so the two balls never overlap.
 *
 * The second rule matters most during floor packing and post-clear pile
 * collapse, where the old FOLLOW_SUPPORT path could briefly or permanently
 * expose a wall cavity even though the final pile still had room to compact.
 */
(function installWallGapInvariant(){
    if(typeof window==="undefined"||window.__hexWallGapInvariant)return;
    window.__hexWallGapInvariant=true;

    const baseNaturalMotion=hexPhysNaturalMotion;
    const baseContactEntries=hexPhysContactEntries;
    const baseProposalPointAt=proposalPointAt;
    const baseLiveBatchPointAt=typeof liveBatchPointAt==="function"?liveBatchPointAt:null;

    function wallSideAt(x,y){
        const lv=valid(x-1,y+1),rv=valid(x+1,y+1);
        if(lv===rv)return 0;
        return lv?-1:1; // -1 = right wall, +1 = left wall; value points inward.
    }

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

    // Prefer the wall column whenever it is genuinely open. This removes the
    // ordinary ROLL around a virtual outside-wall pivot that used to peel a ball
    // inward and expose the side column.
    hexPhysNaturalMotion=function(board,x,y,ignore=null){
        const ball=valid(x,y)?board[y][x]:null;
        if(ball&&!touchesFloorRow(y)&&!ball.garbageBubbleHold){
            const inward=wallSideAt(x,y);
            if(inward&&valid(x,y+2)&&hexPhysEmpty(board,x,y+2,ignore)){
                const ix=x+inward,iy=y+1;
                if(valid(ix,iy)&&hexPhysEmpty(board,ix,iy,ignore)){
                    return{x,y,tx:x,ty:y+2,ball,kind:"WALL_DROP",pivot:null,topPivot:null,followSupportIds:[]};
                }
            }
        }
        return baseNaturalMotion(board,x,y,ignore);
    };

    // Rewrite only the problematic one-support FOLLOW_SUPPORT case. Vertical
    // support motion remains ordinary FOLLOW_SUPPORT because it already packs
    // the wall column. Inward support motion becomes a contact-safe wall drop.
    hexPhysContactEntries=function(board,excluded=new Set()){
        const proposals=baseContactEntries(board,excluded);
        return proposals.map(p=>{
            if(!p||p.kind!=="FOLLOW_SUPPORT"||!p.followProposal||!(p.followSupportIds?.length===1))return p;
            const inward=wallSideAt(p.x,p.y);
            if(!inward||!valid(p.x,p.y+2)||!hexPhysEmpty(board,p.x,p.y+2))return p;
            const supportDx=p.followProposal.tx-p.followProposal.x;
            const supportDy=p.followProposal.ty-p.followProposal.y;
            if(Math.sign(supportDx)!==inward||supportDy<=0)return p;
            return{
                ...p,
                tx:p.x,ty:p.y+2,
                kind:"WALL_COMPACT_FOLLOW",
                pivot:null,topPivot:null,
                wallCompact:true
            };
        });
    };

    // Collision preview for WALL_COMPACT_FOLLOW follows the moving support's
    // exact proposal while gravity advances only as far as unit-distance contact
    // permits. This keeps the side-wall drop overlap-free for every sampled t.
    proposalPointAt=function(p,t){
        if(p?.kind==="WALL_COMPACT_FOLLOW"&&p.followProposal){
            const sp=proposalPointAt(p.followProposal,t);
            return wallEnvelopePoint([p.x,p.y],[p.tx,p.ty],[(sp[0]/0.5),(sp[1]-BOARD_TOP_CENTER_N)/HEX_ROW_H],t)
                .map((v,i)=>i===0?latticeRealX(v):cellCenterYNorm(v));
        }
        return baseProposalPointAt(p,t);
    };

    if(baseLiveBatchPointAt){
        liveBatchPointAt=function(batch,member,t,states,memo=new Map(),stack=new Set()){
            if(member?.seg?.kind==="WALL_COMPACT_FOLLOW"){
                const id=member.cell?.id;
                if(id!=null&&memo.has(id))return memo.get(id);
                const sid=member.seg.followSupportIds?.[0],support=batch?.byId?.get(sid);
                if(support&&!(stack&&stack.has(id))){
                    const nextStack=new Set(stack||[]);if(id!=null)nextStack.add(id);
                    const sp=liveBatchPointAt(batch,support,t,states,memo,nextStack);
                    const out=wallEnvelopePoint(member.seg.from,member.seg.to,sp,t);
                    if(id!=null)memo.set(id,out);
                    return out;
                }
            }
            return baseLiveBatchPointAt(batch,member,t,states,memo,stack);
        };
    }

    window.__hexWallGapInvariantVersion="wall-gap-v2";
    window.__hexWallGapAllowed=false;
    window.__hexWallCompactFollowEnabled=true;
})();
