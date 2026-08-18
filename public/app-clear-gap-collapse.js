/* Post-clear accumulated-pile compaction invariant.
 *
 * Balanced gaps are context-sensitive:
 *   - During ordinary landing/SETTLE, a genuinely balanced HEXAGON may keep its
 *     centre hole only when it is an interior structure supported by balls.
 *     A wall can never substitute for one of those supports, and a HEXAGON
 *     touching either side wall never receives the balanced-hole exemption.
 *   - During clear_support_loss, the connected pile region that is actually
 *     collapsing may NOT finish with an internal hole merely because its
 *     transient geometry happens to look like a balanced HEXAGON.
 *
 * A clear can also create SECONDARY vacancies: when one accumulated ball moves
 * to fill the original cleared cell, its own previous cell becomes the next
 * support-loss location.  Those vacated path origins must participate in the
 * same collapse closure or the pile can stop one move too early with a new hole.
 */
(function installPostClearGapCollapse(){
    if(typeof window==="undefined"||window.__hexPostClearGapCollapse)return;
    window.__hexPostClearGapCollapse=true;

    const basePrepareContinuousPileFlow=prepareContinuousPileFlow;
    const MAX_CLEAR_FALLBACK_EVENTS=(ROWS-BOARD_MIN_ROW)*W2*4;
    const RING_OFFSETS=[[-2,0],[2,0],[-1,-1],[1,-1],[-1,1],[1,1]];

    function ringTouchesSideWall(cx,cy){
        for(const[dx,dy]of RING_OFFSETS){
            const x=cx+dx,y=cy+dy;
            if(!valid(x,y))return true;
            if(!valid(x-2,y)||!valid(x+2,y))return true;
        }
        return false;
    }

    function lowerArchHasRealSupport(b,x,y){
        if(!valid(x,y)||!b[y][x])return false;
        if(touchesFloorRow(y))return true;
        const s=hexPhysSupportInfo(b,x,y);
        return !!(s.left.valid&&s.right.valid&&s.left.ball&&s.right.ball);
    }

    function strictInteriorBalancedHexagon(b,cx,cy){
        if(typeof referenceHexagonRingBalls!=="function")return false;
        if(!referenceHexagonRingBalls(b,cx,cy))return false;
        if(ringTouchesSideWall(cx,cy))return false;
        return [[cx-1,cy+1],[cx+1,cy+1]].every(([x,y])=>lowerArchHasRealSupport(b,x,y));
    }

    isBalancedHexagonCenterHole=strictInteriorBalancedHexagon;

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

    function addPathVacancies(g,vacated){
        let changed=false;
        for(const {ball} of boardEntries(g)){
            const path=Array.isArray(ball?.fallPath)?ball.fallPath:[];
            for(const seg of path){
                if(!Array.isArray(seg?.from)||seg.from.length<2)continue;
                const x=Number(seg.from[0]),y=Number(seg.from[1]);
                if(!Number.isFinite(x)||!Number.isFinite(y)||!valid(x,y))continue;
                const key=x+","+y;
                if(!vacated.has(key)){vacated.add(key);changed=true;}
            }
        }
        return changed;
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

    function expandCollapseAffected(g,vacated,affected){
        let changed=true;
        while(changed){
            changed=false;

            // Every move opens its old lattice cell. Harvest those historical
            // origins before support propagation so the next layer cannot remain
            // supported by a cell that the collapse has already vacated.
            if(addPathVacancies(g,vacated))changed=true;

            for(const {ball} of boardEntries(g)){
                if(affected.has(ball.id))continue;
                if(Array.isArray(ball.fallPath)&&ball.fallPath.length){
                    affected.add(ball.id);changed=true;
                }
            }

            // Propagate support loss from BOTH the cells cleared initially and
            // every cell vacated by a later collapse move. This is the missing
            // second/third-stage relation that could previously leave a new gap.
            for(const {ball,x,y} of boardEntries(g)){
                if(affected.has(ball.id))continue;
                const deps=[[x-1,y+1],[x+1,y+1],[x,y+2]];
                let touchesCollapse=false;
                for(const [sx,sy] of deps){
                    if(vacated.has(sx+","+sy)){touchesCollapse=true;break;}
                    if(!valid(sx,sy))continue;
                    const support=g.board[sy][sx];
                    if(support&&affected.has(support.id)){touchesCollapse=true;break;}
                }
                if(touchesCollapse){affected.add(ball.id);changed=true;}
            }

            // A transient HEXAGON formed by moving members is still part of this
            // collapse. Do not let the intentional-hole exemption freeze it.
            for(let cy=boardScanMin(g.board);cy<ROWS;cy++)for(let cx=0;cx<W2;cx++){
                if(!valid(cx,cy)||g.board[cy][cx]!==null)continue;
                const ring=ringMembersAt(g,cx,cy);if(!ring)continue;
                const collapseRing=vacated.has(cx+","+cy)||ring.some(ball=>affected.has(ball.id));
                if(!collapseRing)continue;
                for(const ball of ring)if(!affected.has(ball.id)){affected.add(ball.id);changed=true;}
            }
        }
        return affected;
    }

    function initialCollapseState(g,cleared){
        const vacated=new Set(cleared),affected=new Set();
        for(const {ball,x,y} of boardEntries(g)){
            const deps=[[x-1,y+1],[x+1,y+1],[x,y+2]];
            if(deps.some(([sx,sy])=>vacated.has(sx+","+sy)))affected.add(ball.id);
        }
        expandCollapseAffected(g,vacated,affected);
        return{vacated,affected};
    }

    function rawClearProposal(g,x,y,affected){
        const ball=valid(x,y)?g.board[y][x]:null;
        if(!ball||ball.garbagePhaseFrozen||ball.motionGroupId)return null;

        let p=hexPhysNaturalMotion(g.board,x,y);
        if(!p&&affected.has(ball.id)){
            // A non-null ignore set disables only the intentional-HEX early
            // return. The set is empty, so no occupancy or contact is ignored.
            // This also covers a newly formed secondary HEX gap after another
            // collapse member has already moved away.
            p=hexPhysNaturalMotion(g.board,x,y,new Set());
            if(p)p.clearCollapseHexBypass=true;
        }
        if(!p||p.ty<=p.y||!valid(p.tx,p.ty))return null;
        const target=g.board[p.ty][p.tx];
        if(target&&target!==ball)return null;
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
        const state=initialCollapseState(g,cleared);

        clearBoardEquilibriumLocks(g.board);
        settleAll(g.board);
        expandCollapseAffected(g,state.vacated,state.affected);

        for(let guard=0;guard<MAX_CLEAR_FALLBACK_EVENTS;guard++){
            const p=nextRawClearFallback(g,state.affected);
            if(!p)break;
            state.affected.add(p.ball.id);
            state.vacated.add(p.x+","+p.y);
            clearBoardEquilibriumLocks(g.board);
            if(!hexPhysApplyEvent(g.board,[p]))break;
            fallbacks++;

            // A fallback can unlock multiple ordinary moves. Drain the entire
            // legal cascade, harvest every newly vacated path origin, and repeat
            // until the affected collapse component reaches a true fixed point.
            clearBoardEquilibriumLocks(g.board);
            settleAll(g.board);
            expandCollapseAffected(g,state.vacated,state.affected);
        }
        addPathVacancies(g,state.vacated);
        return{
            fallbacks,
            affectedCount:state.affected.size,
            dynamicVacancyCount:state.vacated.size,
            vacated:state.vacated
        };
    }

    prepareContinuousPileFlow=function(g,reason="pile_flow"){
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
        g._lastClearDynamicVacancyCount=drained.dynamicVacancyCount;
        g._lastClearCollapseAffectedCount=drained.affectedCount;
        g._lastClearCollapseVacancies=new Set(drained.vacated);
        return{
            moved,...tagged,
            clearGapFallbackMoves:drained.fallbacks,
            clearCollapseAffectedCount:drained.affectedCount,
            clearDynamicVacancyCount:drained.dynamicVacancyCount
        };
    };

    window.__hexCollectCollapseVacancyKeys=function(g){
        const out=clearedVacancyKeys(g);addPathVacancies(g,out);return out;
    };
    window.__hexPostClearGapCollapseVersion="clear-gap-v4";
    window.__hexPostClearGapCollapseInstalled=true;
    window.__hexPostClearDynamicVacancyClosure=true;
    window.__hexOrdinaryBalancedHexagonGapAllowed=true;
    window.__hexWallAdjacentGapAllowed=false;
    window.__hexCollapseBalancedHexagonGapAllowed=false;
})();
