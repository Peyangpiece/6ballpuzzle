/* Post-clear vacancy conservation.
 *
 * A pile collapse is a vacancy migration, not a source of new internal holes.
 * When a ball disappears, the cleared lattice cells become the only live
 * vacancies in that support-loss chain. A collapsing ball may fill one of those
 * live vacancies; its own origin then becomes the next live vacancy. Therefore
 * the number of live collapse vacancies must never increase while the pile is
 * rearranging. The vacancy should migrate upward/outward until it reaches the
 * pile surface instead of branching into a second hole.
 *
 * In addition to that causal live-vacancy rule, every accepted collapse event is
 * checked topologically: empty lattice cells connected to the open top are
 * exterior air; every other empty cell is an internal gap. During
 * clear_support_loss the internal-gap count is required to be monotonically
 * nonincreasing event by event. A move bundle that would create one extra cavity
 * is not accepted.
 *
 * This adapter is active ONLY during prepareContinuousPileFlow(...,
 * "clear_support_loss"). Ordinary landing, active pieces, gravity constants,
 * slide speed, collision geometry, garbage cadence and intentional normal
 * HEXAGON behaviour are unchanged.
 */
(function installClearVacancyPriority(){
    if(typeof window==="undefined"||window.__hexClearVacancyPriority)return;
    if(typeof hexPhysNaturalMotion!=="function"||typeof hexPhysApplyEvent!=="function"||typeof prepareContinuousPileFlow!=="function")return;
    window.__hexClearVacancyPriority=true;

    const baseNaturalMotion=hexPhysNaturalMotion;
    const baseApplyEvent=hexPhysApplyEvent;
    const basePrepareContinuousPileFlow=prepareContinuousPileFlow;
    const LIVE_PROP="__hexClearCollapseVacancies";
    const HISTORY_PROP="__hexClearCollapseVacancyHistory";
    const INITIAL_PROP="__hexClearCollapseInitialVacancyCount";
    const MAX_PROP="__hexClearCollapseMaxVacancyCount";
    const GAP_INITIAL_PROP="__hexClearCollapseInitialInternalGapCount";
    const GAP_MAX_PROP="__hexClearCollapseMaxInternalGapCount";
    const GAP_LAST_PROP="__hexClearCollapseLastInternalGapCount";
    const NEIGHBORS=[[-2,0],[2,0],[-1,-1],[1,-1],[-1,1],[1,1]];

    function key(x,y){return x+","+y;}
    function liveSet(board){const s=board?.[LIVE_PROP];return s instanceof Set?s:null;}
    function historySet(board){const s=board?.[HISTORY_PROP];return s instanceof Set?s:null;}
    function isEmptyCell(board,x,y,ignore=null){return valid(x,y)&&hexPhysEmpty(board,x,y,ignore);}
    function isLiveVacancy(board,vacancies,x,y,ignore=null){
        return !!vacancies&&vacancies.has(key(x,y))&&isEmptyCell(board,x,y,ignore);
    }
    function activeSupport(board,x,y,ignore){
        if(!valid(x,y))return null;
        const ball=board[y][x];
        if(!ball)return null;
        if(ignore&&ignore.has(ball.id))return null;
        return ball;
    }

    function internalGapCountWithMoves(board,moves=null){
        const origins=new Set(),targets=new Set();
        if(Array.isArray(moves))for(const p of moves){
            if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(p.tx)||!Number.isFinite(p.ty))continue;
            origins.add(key(p.x,p.y));targets.add(key(p.tx,p.ty));
        }
        function occupied(x,y){
            const k=key(x,y);
            if(targets.has(k))return true;
            if(origins.has(k))return false;
            return !!board[y]?.[x];
        }
        const exterior=new Set(),queue=[];
        for(let x=0;x<W2;x++){
            if(!valid(x,BOARD_MIN_ROW)||occupied(x,BOARD_MIN_ROW))continue;
            const k=key(x,BOARD_MIN_ROW);exterior.add(k);queue.push([x,BOARD_MIN_ROW]);
        }
        for(let qi=0;qi<queue.length;qi++){
            const [x,y]=queue[qi];
            for(const [dx,dy] of NEIGHBORS){
                const nx=x+dx,ny=y+dy,k=key(nx,ny);
                if(!valid(nx,ny)||ny<BOARD_MIN_ROW||ny>=ROWS||exterior.has(k)||occupied(nx,ny))continue;
                exterior.add(k);queue.push([nx,ny]);
            }
        }
        let gaps=0;
        for(let y=BOARD_MIN_ROW;y<ROWS;y++)for(let x=0;x<W2;x++){
            if(!valid(x,y)||occupied(x,y)||exterior.has(key(x,y)))continue;
            gaps++;
        }
        return gaps;
    }

    // Only a ball whose lower support neighbourhood touches a CURRENTLY EMPTY
    // live vacancy belongs to the causal collapse chain. Historical vacancies
    // that have already been filled must not keep pulling later balls around.
    function causedByLiveVacancy(board,vacancies,x,y,ignore=null){
        if(!vacancies)return false;
        return [[x-1,y+1],[x+1,y+1],[x,y+2]].some(([vx,vy])=>
            isLiveVacancy(board,vacancies,vx,vy,ignore)
        );
    }

    function annotatePriority(p,target,floor=false){
        if(!p)return null;
        p.clearVacancyPriority=true;
        p.clearFloorVacancyPriority=!!floor;
        p.clearVacancyTarget=key(target[0],target[1]);
        p.clearVacancyConserved=true;
        return p;
    }

    // Symmetric direct-support/floor forks need an explicit vacancy-directed
    // tie-break because the ordinary solver is intentionally allowed to follow
    // residual momentum. We change only WHICH already-legal lower cell wins.
    function vacancyForkMotion(board,x,y,ball,ignore){
        const vacancies=liveSet(board);
        if(!vacancies||!ball||ball.garbageBubbleHold||touchesFloorRow(y))return null;
        const left=[x-1,y+1],right=[x+1,y+1];
        if(!isEmptyCell(board,left[0],left[1],ignore)||!isEmptyCell(board,right[0],right[1],ignore))return null;

        const candidates=[];
        if(isLiveVacancy(board,vacancies,left[0],left[1],ignore))candidates.push({dir:-1,to:left});
        if(isLiveVacancy(board,vacancies,right[0],right[1],ignore))candidates.push({dir:1,to:right});
        if(candidates.length!==1)return null;
        const q=candidates[0];

        if(y+1===ROWS-1){
            return annotatePriority({
                x,y,tx:q.to[0],ty:q.to[1],ball,
                kind:"FLOOR_DROP",pivot:null,topPivot:null,followSupportIds:[]
            },q.to,true);
        }

        const supportY=y+2,support=activeSupport(board,x,supportY,ignore);
        if(!support)return null;
        return annotatePriority({
            x,y,tx:q.to[0],ty:q.to[1],ball,
            kind:q.dir<0?"ROLL_LEFT":"ROLL_RIGHT",
            pivot:null,topPivot:[x,supportY],followSupportIds:[]
        },q.to,false);
    }

    hexPhysNaturalMotion=function(board,x,y,ignore=null){
        const vacancies=liveSet(board);
        if(!vacancies)return baseNaturalMotion(board,x,y,ignore);

        const ball=valid(x,y)?board[y][x]:null;
        const fork=vacancyForkMotion(board,x,y,ball,ignore);
        if(fork)return fork;

        const p=baseNaturalMotion(board,x,y,ignore);
        if(!p)return null;
        const causal=causedByLiveVacancy(board,vacancies,x,y,ignore);
        if(!causal)return p;

        // A support-loss move that participates in the vacancy chain may only
        // move INTO an existing live vacancy. Otherwise its origin would become
        // an additional hole while the old vacancy stayed open.
        if(isLiveVacancy(board,vacancies,p.tx,p.ty,ignore)){
            return annotatePriority(p,[p.tx,p.ty],p.kind==="FLOOR_DROP");
        }
        return null;
    };

    function bundleKey(p){return p?.bundleId?"g:"+p.bundleId:"b:"+(p?.ball?.id||0);}
    function bundlesInOrder(accepted){
        const out=[],map=new Map();
        for(const p of accepted||[]){
            const k=bundleKey(p);
            if(!map.has(k)){const a=[];map.set(k,a);out.push(a);}
            map.get(k).push(p);
        }
        return out;
    }

    hexPhysApplyEvent=function(board,accepted){
        const vacancies=liveSet(board);
        if(!vacancies||!Array.isArray(accepted)||!accepted.length)return baseApplyEvent(board,accepted);
        const history=historySet(board);

        // Resolver group plans can bypass independent natural-motion selection.
        // Reject the whole bundle if a member is causally falling because of a
        // live vacancy but would land somewhere else and branch the hole.
        const blockedBundles=new Set();
        const pre=[];
        for(const p of accepted){
            if(!p||!p.ball)continue;
            const targetLive=isLiveVacancy(board,vacancies,p.tx,p.ty,null);
            const causal=targetLive||causedByLiveVacancy(board,vacancies,p.x,p.y,null);
            pre.push({p,targetLive,causal});
            if(causal&&!targetLive)blockedBundles.add(bundleKey(p));
        }
        const causalAllowed=accepted.filter(p=>!blockedBundles.has(bundleKey(p)));
        if(!causalAllowed.length)return false;

        // Topological guard: include bundles only while the hypothetical board
        // keeps the internal cavity count <= the count before this event. This
        // makes "no new gap while collapsing" an explicit invariant rather than
        // a side effect of a particular tie-break.
        const gapBefore=internalGapCountWithMoves(board,null);
        const allowed=[];
        for(const bundle of bundlesInOrder(causalAllowed)){
            if(typeof hexPhysBundleTargetsFree==="function"&&!hexPhysBundleTargetsFree(bundle,board,allowed))continue;
            if(typeof hexPhysBundleSafe==="function"&&!hexPhysBundleSafe(bundle,board,allowed))continue;
            const trial=[...allowed,...bundle];
            if(internalGapCountWithMoves(board,trial)>gapBefore)continue;
            allowed.push(...bundle);
        }
        if(!allowed.length)return false;

        const allowedSet=new Set(allowed.map(p=>p.ball?.id));
        const tracked=pre.filter(q=>allowedSet.has(q.p.ball?.id));
        const out=baseApplyEvent(board,allowed);
        if(!out)return out;

        const priority=[];
        for(const q of tracked){
            const p=q.p;
            if(board[p.ty]?.[p.tx]!==p.ball)continue;
            if(q.targetLive||q.causal){
                if(q.targetLive)vacancies.delete(key(p.tx,p.ty));
                vacancies.add(key(p.x,p.y));
                if(history)history.add(key(p.x,p.y));
            }
            if(p.clearVacancyPriority)priority.push(p);
        }

        board[MAX_PROP]=Math.max(Number(board[MAX_PROP])||0,vacancies.size);
        const gapAfter=internalGapCountWithMoves(board,null);
        board[GAP_LAST_PROP]=gapAfter;
        board[GAP_MAX_PROP]=Math.max(Number(board[GAP_MAX_PROP])||0,gapAfter);

        // hexPhysAppendSegment copies canonical motion fields only. Re-attach
        // diagnostics to prove the accepted route filled the live vacancy.
        for(const p of priority){
            const path=Array.isArray(p.ball?.fallPath)?p.ball.fallPath:[];
            for(let i=path.length-1;i>=0;i--){
                const seg=path[i];
                if(seg?.to&&seg.to[0]===p.tx&&seg.to[1]===p.ty){
                    seg.clearVacancyPriority=true;
                    seg.clearFloorVacancyPriority=!!p.clearFloorVacancyPriority;
                    seg.clearVacancyTarget=p.clearVacancyTarget||key(p.tx,p.ty);
                    seg.clearVacancyConserved=true;
                    seg.clearInternalGapGuard=true;
                    break;
                }
            }
        }
        return out;
    };

    function vacancyHasBallAbove(board,x,y){
        return [[x-1,y-1],[x+1,y-1],[x,y-2]].some(([ax,ay])=>
            valid(ax,ay)&&!!board[ay]?.[ax]
        );
    }

    prepareContinuousPileFlow=function(g,reason="pile_flow"){
        if(reason!=="clear_support_loss"||!g?.board)return basePrepareContinuousPileFlow(g,reason);

        const priorLive=g.board[LIVE_PROP];
        const priorHistory=g.board[HISTORY_PROP];
        const priorInitial=g.board[INITIAL_PROP];
        const priorMax=g.board[MAX_PROP];
        const priorGapInitial=g.board[GAP_INITIAL_PROP];
        const priorGapMax=g.board[GAP_MAX_PROP];
        const priorGapLast=g.board[GAP_LAST_PROP];
        const vacancies=new Set(),history=new Set();
        const cells=g?.clearing?.cells;
        if(Array.isArray(cells))for(const cell of cells){
            if(!Array.isArray(cell)||cell.length<2)continue;
            const x=Number(cell[0]),y=Number(cell[1]);
            if(Number.isFinite(x)&&Number.isFinite(y)&&valid(x,y)&&!g.board[y][x]){
                vacancies.add(key(x,y));history.add(key(x,y));
            }
        }
        g.board[LIVE_PROP]=vacancies;
        g.board[HISTORY_PROP]=history;
        g.board[INITIAL_PROP]=vacancies.size;
        g.board[MAX_PROP]=vacancies.size;
        const initialInternalGaps=internalGapCountWithMoves(g.board,null);
        g.board[GAP_INITIAL_PROP]=initialInternalGaps;
        g.board[GAP_MAX_PROP]=initialInternalGaps;
        g.board[GAP_LAST_PROP]=initialInternalGaps;

        try{
            const out=basePrepareContinuousPileFlow(g,reason);

            // Defensive cleanup: a live-vacancy key is meaningful only while its
            // cell is empty. A filled cell must never continue influencing later
            // collapse decisions.
            for(const k of [...vacancies]){
                const [x,y]=k.split(",").map(Number);
                if(valid(x,y)&&g.board[y][x])vacancies.delete(k);
            }
            const internal=[...vacancies].filter(k=>{
                const [x,y]=k.split(",").map(Number);
                return valid(x,y)&&!g.board[y][x]&&vacancyHasBallAbove(g.board,x,y);
            });
            const finalInternalGaps=internalGapCountWithMoves(g.board,null);

            g._lastClearPriorityVacancyCount=history.size;
            g._lastClearPriorityVacancies=new Set(history);
            g._lastClearLiveVacancies=new Set(vacancies);
            g._lastClearInitialVacancyCount=Number(g.board[INITIAL_PROP])||0;
            g._lastClearMaxLiveVacancyCount=Number(g.board[MAX_PROP])||0;
            g._lastClearRemainingInternalVacancies=new Set(internal);
            g._lastClearRemainingInternalVacancyCount=internal.length;
            g._lastClearVacancyCountNeverIncreased=g._lastClearMaxLiveVacancyCount<=g._lastClearInitialVacancyCount;
            g._lastClearInitialInternalGapCount=Number(g.board[GAP_INITIAL_PROP])||0;
            g._lastClearMaxInternalGapCount=Number(g.board[GAP_MAX_PROP])||0;
            g._lastClearFinalInternalGapCount=finalInternalGaps;
            g._lastClearInternalGapCountNeverIncreased=g._lastClearMaxInternalGapCount<=g._lastClearInitialInternalGapCount;
            return out;
        }finally{
            if(priorLive instanceof Set)g.board[LIVE_PROP]=priorLive;else delete g.board[LIVE_PROP];
            if(priorHistory instanceof Set)g.board[HISTORY_PROP]=priorHistory;else delete g.board[HISTORY_PROP];
            if(Number.isFinite(priorInitial))g.board[INITIAL_PROP]=priorInitial;else delete g.board[INITIAL_PROP];
            if(Number.isFinite(priorMax))g.board[MAX_PROP]=priorMax;else delete g.board[MAX_PROP];
            if(Number.isFinite(priorGapInitial))g.board[GAP_INITIAL_PROP]=priorGapInitial;else delete g.board[GAP_INITIAL_PROP];
            if(Number.isFinite(priorGapMax))g.board[GAP_MAX_PROP]=priorGapMax;else delete g.board[GAP_MAX_PROP];
            if(Number.isFinite(priorGapLast))g.board[GAP_LAST_PROP]=priorGapLast;else delete g.board[GAP_LAST_PROP];
        }
    };

    window.__hexInternalGapCount=board=>internalGapCountWithMoves(board,null);
    window.__hexClearVacancyPriorityVersion="clear-vacancy-v4";
    window.__hexClearVacancyHistoryTracksMotionOrigins=true;
    window.__hexClearVacancyOverridesResidualMomentum=true;
    window.__hexClearVacancyOverridesWallTieBreak=true;
    window.__hexClearFloorVacancyPriority=true;
    window.__hexClearVacancyLiveSet=true;
    window.__hexClearCollapseNoNewGaps=true;
    window.__hexClearCollapseTopologicalGapGuard=true;
})();
