/* Continuous wall-vacancy pileFlow synchronization.
 *
 * app-wall-direct-support-fill gives the logical resolver a safe real-support
 * move for a secondary wall vacancy. The logical event is intentionally the
 * next gravity event, but post-clear rendering must not show a staged hole while
 * the lower wall member has already moved away. Convert that authored segment
 * into the existing WALL_VACANCY_FOLLOW presentation and start it with the ball
 * that vacates its target cell.
 *
 * This changes only scheduled pileFlow timing/geometry. Logical cells, fallPath
 * endpoints, gravity order and collision targets stay exactly the same.
 */
(function installWallFlowVacancySync(){
    if(typeof window==="undefined"||window.__hexWallFlowVacancySync)return;
    if(typeof markPileFlowPaths!=="function")return;
    window.__hexWallFlowVacancySync=true;

    const baseMarkPileFlowPaths=markPileFlowPaths;

    function samePoint(a,b){return !!a&&!!b&&a[0]===b[0]&&a[1]===b[1];}
    function previousEnd(ball,seg){
        const path=Array.isArray(ball?.fallPath)?ball.fallPath:[],idx=path.indexOf(seg);
        if(idx<=0)return -Infinity;
        for(let i=idx-1;i>=0;i--)if(Number.isFinite(path[i]?.pileFlowEnd))return path[i].pileFlowEnd;
        return -Infinity;
    }
    function syncDirectWallFollowers(g){
        let count=0;
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;if(!ball?.fallPath)continue;
            for(const seg of ball.fallPath){
                if(seg?.kind!=="WALL_DIRECT_SUPPORT_FILL"||!seg.pileFlow||!seg.to)continue;
                const sid=seg.followSupportIds?.[0]||seg.movingSupportId;
                const support=sid?pileFlowBallById(g,sid):null;if(!support?.fallPath)continue;
                const supportSeg=support.fallPath.find(s=>s?.pileFlow&&s.from&&samePoint(s.from,seg.to)&&Number.isFinite(s.pileFlowStart)&&Number.isFinite(s.pileFlowDuration));
                if(!supportSeg)continue;
                const start=supportSeg.pileFlowStart,duration=supportSeg.pileFlowDuration;
                if(previousEnd(ball,seg)>start+1e-10)continue;

                const old={kind:seg.kind,pivot:seg.pivot,topPivot:seg.topPivot,start:seg.pileFlowStart,duration:seg.pileFlowDuration,end:seg.pileFlowEnd,follow:[...(seg.followSupportIds||[])],moving:seg.movingSupportId};
                seg.kind="WALL_VACANCY_FOLLOW";
                seg.pivot=null;seg.topPivot=null;
                seg.followSupportIds=[support.id];seg.movingSupportId=support.id;
                seg.pileFlowStart=start;seg.pileFlowDuration=duration;seg.pileFlowEnd=start+duration;
                seg.wallVacancyFill=true;

                let safe=true;
                if(typeof pileFlowWaveSafe==="function"){
                    const priorBall=seg._pileFlowBall;seg._pileFlowBall=ball;
                    safe=pileFlowWaveSafe(g,[seg],start,duration);
                    if(priorBall)seg._pileFlowBall=priorBall;else delete seg._pileFlowBall;
                }
                if(!safe){
                    seg.kind=old.kind;seg.pivot=old.pivot;seg.topPivot=old.topPivot;
                    seg.followSupportIds=old.follow;seg.movingSupportId=old.moving;
                    seg.pileFlowStart=old.start;seg.pileFlowDuration=old.duration;seg.pileFlowEnd=old.end;
                    continue;
                }
                seg.wallFlowSynchronized=true;count++;
            }
        }
        g._lastWallDirectVacancyFollowers=count;
        return count;
    }

    markPileFlowPaths=function(g,reason="pile_flow"){
        const out=baseMarkPileFlowPaths(g,reason);
        if(reason==="clear_support_loss")syncDirectWallFollowers(g);
        return out;
    };

    window.__hexWallFlowVacancySyncVersion="wall-flow-v1";
    window.__hexWallMovingPileLeavesNoStagedGap=true;
})();
