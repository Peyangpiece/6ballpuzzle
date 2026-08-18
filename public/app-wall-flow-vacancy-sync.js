/* Continuous wall-vacancy pileFlow synchronization.
 *
 * A post-clear collapse can move a pile ball away from a side-wall cell and a
 * different ball can fill that exact cell in the next logical gravity event.
 * The logical order is correct, but rendering those two events as separate
 * scheduled waves exposes a wall hole for a few frames.
 *
 * During clear_support_loss only, detect the causal relation directly from the
 * authored paths: if a wall-adjacent segment TARGET is another moving segment's
 * ORIGIN, the target cell is a movement-created vacancy. The filler is then
 * rendered as WALL_VACANCY_FOLLOW beginning with the ball that vacates that
 * target. app-wall-gap-invariant supplies the exact tangent contact geometry.
 *
 * This is deliberately path-based rather than kind-based, so it also covers
 * second/third-stage wall cascades regardless of whether the logical resolver
 * labelled the filler as ROLL, direct-support fill, or another ordinary move.
 * Logical destinations, gravity order, speed constants and collision targets
 * remain unchanged; only the already-authored pileFlow segments are synchronized.
 */
(function installWallFlowVacancySync(){
    if(typeof window==="undefined"||window.__hexWallFlowVacancySync)return;
    if(typeof markPileFlowPaths!=="function")return;
    window.__hexWallFlowVacancySync=true;

    const baseMarkPileFlowPaths=markPileFlowPaths;

    function samePoint(a,b){return !!a&&!!b&&a[0]===b[0]&&a[1]===b[1];}
    function wallSideAt(x,y){
        if(!valid(x,y))return 0;
        const left=(y&1)?0:1,right=(y&1)?W2-1:W2-2;
        if(x===left)return 1;
        if(x===right)return -1;
        return 0;
    }
    function previousEnd(ball,seg){
        const path=Array.isArray(ball?.fallPath)?ball.fallPath:[],idx=path.indexOf(seg);
        if(idx<=0)return -Infinity;
        for(let i=idx-1;i>=0;i--)if(Number.isFinite(path[i]?.pileFlowEnd))return path[i].pileFlowEnd;
        return -Infinity;
    }
    function entries(g){
        const out=[];
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;if(!ball?.fallPath)continue;
            for(const seg of ball.fallPath)if(seg?.pileFlow&&seg.from&&seg.to)out.push({ball,seg});
        }
        return out;
    }
    function causalVacater(all,ball,seg){
        const sid=seg.followSupportIds?.[0]||seg.movingSupportId;
        if(sid){
            const direct=all.find(q=>q.ball.id===sid&&q.ball!==ball&&samePoint(q.seg.from,seg.to));
            if(direct)return direct;
        }
        return all.find(q=>q.ball!==ball&&samePoint(q.seg.from,seg.to)&&q.seg.to[1]>=q.seg.from[1]);
    }

    function syncMovementCreatedWallVacancies(g){
        const all=entries(g);let total=0;
        // Multiple passes propagate timing through an arbitrarily long wall
        // cascade: lower mover -> filler -> next filler -> ...
        for(let pass=0;pass<Math.min(ROWS+2,16);pass++){
            let changed=0;
            for(const rec of all){
                const {ball,seg}=rec;
                const sf=wallSideAt(seg.from[0],seg.from[1]),st=wallSideAt(seg.to[0],seg.to[1]);
                if(!sf||sf!==st)continue;
                const vacater=causalVacater(all,ball,seg);if(!vacater)continue;
                const support=vacater.ball,supportSeg=vacater.seg;
                if(!Number.isFinite(supportSeg.pileFlowStart)||!Number.isFinite(supportSeg.pileFlowDuration))continue;
                const start=supportSeg.pileFlowStart,duration=supportSeg.pileFlowDuration;
                if(previousEnd(ball,seg)>start+1e-10)continue;

                const already=seg.kind==="WALL_VACANCY_FOLLOW"&&seg.movingSupportId===support.id&&
                    Math.abs((seg.pileFlowStart??Infinity)-start)<1e-10&&
                    Math.abs((seg.pileFlowDuration??Infinity)-duration)<1e-10;
                if(already)continue;

                seg.kind="WALL_VACANCY_FOLLOW";
                seg.pivot=null;seg.topPivot=null;
                seg.followSupportIds=[support.id];seg.movingSupportId=support.id;
                seg.pileFlowStart=start;seg.pileFlowDuration=duration;seg.pileFlowEnd=start+duration;
                seg.wallVacancyFill=true;
                seg.wallFlowSynchronized=true;
                seg.wallContactSafeByConstruction=true;
                changed++;total++;
            }
            if(!changed)break;
        }
        g._lastWallDynamicVacancyFollowers=total;
        return total;
    }

    markPileFlowPaths=function(g,reason="pile_flow"){
        const out=baseMarkPileFlowPaths(g,reason);
        if(reason==="clear_support_loss")syncMovementCreatedWallVacancies(g);
        return out;
    };

    window.__hexWallFlowVacancySyncVersion="wall-flow-v3";
    window.__hexWallMovingPileLeavesNoStagedGap=true;
    window.__hexWallMovementCreatedVacancySync=true;
})();
