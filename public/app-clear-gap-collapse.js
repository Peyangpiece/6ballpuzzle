/* Post-clear vacancy collapse invariant.
 *
 * Once a cleared ball is removed from the board it must stop acting as support
 * immediately.  Two edge cases used to leave a visible hole in an accumulated
 * pile even though a safe downward move still existed:
 *
 *  1) the contact resolver can replace a ball's own safe ROLL with a
 *     FOLLOW_SUPPORT proposal and later reject the whole coupled proposal;
 *  2) a centre cell that has just been cleared can accidentally look like an
 *     intentional balanced HEXAGON hole and suppress ordinary gravity.
 *
 * This layer is deliberately scoped to clear_support_loss.  It first lets the
 * canonical resolver drain every normal event, then, only when that resolver is
 * fully stalled, accepts one swept-safe raw natural move.  A HEXAGON-hole lock
 * is bypassed only when the hole centre is one of the cells removed by the
 * current clear.  Therefore legitimate pre-existing HEXAGON formations keep
 * their reference behaviour, while a newly-created internal vacancy cannot
 * remain as a false support gap.
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

    function isMemberOfJustClearedBalancedRing(g,x,y,cleared){
        if(!cleared?.size)return false;
        for(const [dx,dy] of RING_OFFSETS){
            const cx=x-dx,cy=y-dy;
            if(!cleared.has(cx+","+cy))continue;
            if(!valid(cx,cy)||g.board[cy][cx]!==null)continue;
            if(typeof isBalancedHexagonCenterHole==="function"&&isBalancedHexagonCenterHole(g.board,cx,cy))return true;
        }
        return false;
    }

    function rawClearProposal(g,x,y,cleared){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball||ball.garbagePhaseFrozen||ball.motionGroupId)return null;

        let p=hexPhysNaturalMotion(g.board,x,y);
        if(!p&&isMemberOfJustClearedBalancedRing(g,x,y,cleared)){
            // A non-null ignore set disables only the balanced-hole early return;
            // an empty set changes no occupancy/support result.
            p=hexPhysNaturalMotion(g.board,x,y,new Set());
            if(p)p.clearVacancyHexBypass=true;
        }
        if(!p||p.ty<=p.y||!valid(p.tx,p.ty))return null;
        const target=g.board[p.ty][p.tx];
        if(target&&target!==ball)return null;

        // The fallback is allowed only when the exact ordinary trajectory is
        // collision-safe with every other current board ball held stationary.
        if(hexPhysPathHitsStationary(p,g.board,new Set([ball.id])))return null;
        p.bundleId=0;
        p.groupSize=0;
        p.clearSupportLossFallback=true;
        return p;
    }

    function nextRawClearFallback(g,cleared){
        for(let y=ROWS-1;y>=boardScanMin(g.board);y--){
            for(let x=0;x<W2;x++){
                const p=rawClearProposal(g,x,y,cleared);
                if(p)return p;
            }
        }
        return null;
    }

    function drainClearSupportLoss(g,cleared){
        let fallbacks=0;
        // Always exhaust canonical motion before considering a raw fallback.
        settleAll(g.board);
        for(let guard=0;guard<MAX_CLEAR_FALLBACK_EVENTS;guard++){
            const p=nextRawClearFallback(g,cleared);
            if(!p)break;
            clearBoardEquilibriumLocks(g.board);
            if(!hexPhysApplyEvent(g.board,[p]))break;
            fallbacks++;
            // The one raw move may unlock a large normal cascade; let the
            // canonical resolver consume that entire cascade before retrying.
            settleAll(g.board);
        }
        return fallbacks;
    }

    prepareContinuousPileFlow=function(g,reason="pile_flow"){
        if(reason!=="clear_support_loss")return basePrepareContinuousPileFlow(g,reason);

        normalizeAllNonActivePileBalls(g);
        snapQuiescentPileVisuals(g);
        clearBoardEquilibriumLocks(g.board);

        const before=physicsSignature(g);
        const cleared=clearedVacancyKeys(g);
        const fallbacks=drainClearSupportLoss(g,cleared);
        const after=physicsSignature(g);
        const tagged=markPileFlowPaths(g,reason);
        const moved=before!==after||tagged.segments>0;
        if(moved)g.ver++;

        g._lastClearGapFallbackMoves=fallbacks;
        g._lastClearVacancyCount=cleared.size;
        return{moved,...tagged,clearGapFallbackMoves:fallbacks};
    };

    window.__hexPostClearGapCollapseVersion="clear-gap-v1";
    window.__hexPostClearGapCollapseInstalled=true;
})();
