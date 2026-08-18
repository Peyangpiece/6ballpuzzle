/* Post-clear accumulated-pile compaction invariant.
 *
 * Balanced gaps are context-sensitive:
 *   - During ordinary landing/SETTLE, a genuinely balanced HEXAGON may keep its
 *     centre hole. This preserves the reference behaviour for a normal ball
 *     landing onto an already stable pile.
 *   - During clear_support_loss, the connected pile region that is actually
 *     collapsing may NOT finish with an internal hole merely because its
 *     transient geometry happens to look like a balanced HEXAGON.
 *
 * The ordinary global HEXAGON rule is never changed.  Instead this layer tracks
 * only the support-loss component touched by the current clear.  If a member of
 * that component becomes part of a balanced ring while the pile is collapsing,
 * the ring exemption is bypassed for that collapse only, and only by using the
 * ordinary single-ball natural-motion + swept-collision checks.
 */
(function installPostClearGapCollapse(){
    if(typeof window==="undefined"||window.__hexPostClearGapCollapse)return;
    window.__hexPostClearGapCollapse=true;

    const basePrepareContinuousPileFlow=prepareContinuousPileFlow;
    const MAX_CLEAR_FALLBACK_EVENTS=(ROWS-BOARD_MIN_ROW)*W2*4;
    const RING_OFFSETS=[[-2,0],[2,0],[-1,-1],[1,-1],[-1,1],[1,1]];

    function clearedVacancyKeys(g){
        const out=new Set();
        const cells=g?.clearing?.cells;
        if(!Array.isArray(cells))return out;
        for(const cell of cells){
            if(!Array.isArray(cell)||cell.length<2)continue;
            const x=Number(cell[0]),y=Number(cell[1]);
            if(Number.isFinite(x)&&Number.isFinite(y))out.add(x+","+y);
        }
        return out;
    }

    function boardEntries(g){
        const out=[];
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(ball)out.push({ball,x,y});
        }
        return out;
    }

    function ringMembersAt(g,cx,cy){
        if(!valid(cx,cy)||g.board[cy][cx]!==null)return null;
        const out=[];
        for(const [dx,dy] of RING_OFFSETS){
            const x=cx+dx,y=cy+dy;
            if(!valid(x,y)||!g.board[y][x])return null;
            out.push(g.board[y][x]);
        }
        return out;
    }

    function expandCollapseAffected(g,cleared,affected){
        let changed=true;
        while(changed){
            changed=false;

            // Any ball that already received a path during this clear is part of
            // the collapsing component even if its current supports later become
            // balanced again.
            for(const {ball} of boardEntries(g)){
                if(affected.has(ball.id))continue;
                if(Array.isArray(ball.fallPath)&&ball.fallPath.length){
                    affected.add(ball.id);changed=true;
                }
            }

            // Propagate support loss upward.  Direct-below is included because it
            // can be the obstacle/pivot that determines a topPivot roll.
            for(const {ball,x,y} of boardEntries(g)){
                if(affected.has(ball.id))continue;
                const deps=[[x-1,y+1],[x+1,y+1],[x,y+2]];
                let touchesCollapse=false;
                for(const [sx,sy] of deps){
                    if(cleared.has(sx+","+sy)){touchesCollapse=true;break;}
                    if(!valid(sx,sy))continue;
                    const support=g.board[sy][sx];
                    if(support&&affected.has(support.id)){touchesCollapse=true;break;}
                }
                if(touchesCollapse){affected.add(ball.id);changed=true;}
            }

            // A transient HEXAGON formed by moving members is one physical
            // collapse structure.  Once one ring member belongs to the collapse,
            // all six members are treated as collapse-affected; otherwise the
            // untouched balanced-hole rule could freeze the remaining members.
            for(let cy=boardScanMin(g.board);cy<ROWS;cy++)for(let cx=0;cx<W2;cx++){
                if(!valid(cx,cy)||g.board[cy][cx]!==null)continue;
                const ring=ringMembersAt(g,cx,cy);if(!ring)continue;
                const collapseRing=cleared.has(cx+","+cy)||ring.some(ball=>affected.has(ball.id));
                if(!collapseRing)continue;
                for(const ball of ring)if(!affected.has(ball.id)){affected.add(ball.id);changed=true;}
            }
        }
        return affected;
    }

    function initialCollapseAffected(g,cleared){
        const affected=new Set();
        // Seed from cells whose support/obstacle was explicitly removed.
        for(const {ball,x,y} of boardEntries(g)){
            const deps=[[x-1,y+1],[x+1,y+1],[x,y+2]];
            if(deps.some(([sx,sy])=>cleared.has(sx+","+sy)))affected.add(ball.id);
        }
        return expandCollapseAffected(g,cleared,affected);
    }

    function rawClearProposal(g,x,y,affected){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball||ball.garbagePhaseFrozen||ball.motionGroupId)return null;

        let p=hexPhysNaturalMotion(g.board,x,y);
        const balancedCollapseMember=
            !p&&affected.has(ball.id)&&
            typeof ballInBalancedHexagonRing==="function"&&
            ballInBalancedHexagonRing(g.board,x,y);
        if(balancedCollapseMember){
            // Passing a non-null ignore set disables only the intentional-ring
            // early return.  The empty set ignores no occupancy, so the exact
            // ordinary destination, supports and collision geometry are kept.
            p=hexPhysNaturalMotion(g.board,x,y,new Set());
            if(p)p.clearCollapseHexBypass=true;
        }
        if(!p||p.ty<=p.y||!valid(p.tx,p.ty))return null;
        const target=g.board[p.ty][p.tx];
        if(target&&target!==ball)return null;

        // Never force a packing move.  The no-gap rule means "keep resolving
        // every safe gravity move", not teleporting through another ball.
        if(hexPhysPathHitsStationary(p,g.board,new Set([ball.id])))return null;
        p.bundleId=0;
        p.groupSize=0;
        p.clearSupportLossFallback=true;
        return p;
    }

    function nextRawClearFallback(g,affected){
        for(let y=ROWS-1;y>=boardScanMin(g.board);y--){
            for(let x=0;x<W2;x++){
                const p=rawClearProposal(g,x,y,affected);
                if(p)return p;
            }
        }
        return null;
    }

    function drainClearSupportLoss(g,cleared){
        let fallbacks=0;
        const affected=initialCollapseAffected(g,cleared);

        // Canonical motion always has priority.  It is allowed to create a
        // transient balanced ring; refreshCollapseAffected then marks that ring
        // as part of the collapse before the fallback check.
        settleAll(g.board);
        expandCollapseAffected(g,cleared,affected);

        for(let guard=0;guard<MAX_CLEAR_FALLBACK_EVENTS;guard++){
            const p=nextRawClearFallback(g,affected);
            if(!p)break;
            affected.add(p.ball.id);
            clearBoardEquilibriumLocks(g.board);
            if(!hexPhysApplyEvent(g.board,[p]))break;
            fallbacks++;

            // One safe raw move can unlock a full normal cascade.  Drain that
            // cascade first, then widen the affected support component and only
            // then inspect for another transient gap.
            settleAll(g.board);
            expandCollapseAffected(g,cleared,affected);
        }
        return{fallbacks,affectedCount:affected.size};
    }

    prepareContinuousPileFlow=function(g,reason="pile_flow"){
        // Ordinary landing/SETTLE never enters this branch, so balanced HEXAGON
        // holes remain legal there exactly as before.
        if(reason!=="clear_support_loss")return basePrepareContinuousPileFlow(g,reason);

        normalizeAllNonActivePileBalls(g);
        snapQuiescentPileVisuals(g);
        clearBoardEquilibriumLocks(g.board);

        const before=physicsSignature(g);
        const cleared=clearedVacancyKeys(g);
        const drained=drainClearSupportLoss(g,cleared);
        const after=physicsSignature(g);
        const tagged=markPileFlowPaths(g,reason);
        const moved=before!==after||tagged.segments>0;
        if(moved)g.ver++;

        g._lastClearGapFallbackMoves=drained.fallbacks;
        g._lastClearVacancyCount=cleared.size;
        g._lastClearCollapseAffectedCount=drained.affectedCount;
        return{
            moved,...tagged,
            clearGapFallbackMoves:drained.fallbacks,
            clearCollapseAffectedCount:drained.affectedCount
        };
    };

    window.__hexPostClearGapCollapseVersion="clear-gap-v2";
    window.__hexPostClearGapCollapseInstalled=true;
    window.__hexOrdinaryBalancedHexagonGapAllowed=true;
    window.__hexCollapseBalancedHexagonGapAllowed=false;
})();
