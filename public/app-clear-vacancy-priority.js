/* Post-clear vacancy priority.
 *
 * A clear can expose a symmetric fork: a settled pile ball has two legal lower
 * choices and one of them is the cell that was actually cleared (or was vacated
 * by an earlier collapse move). Normal momentum and wall/floor tie-breaks are
 * useful during ordinary landing, but in this clear-support-loss context they
 * can choose the OTHER open diagonal and recreate a hole in the pile.
 *
 * Keep the normal motion solver everywhere else. During clear_support_loss
 * only, remember the original cleared cells plus every subsequent motion origin.
 * If a directly supported ball has exactly one open lower diagonal in that
 * vacancy history, choose that canonical unit-radius roll. The same rule now
 * covers the row immediately above the floor: there is no y+2 support cell on
 * that row, so choose the historical vacancy before the ordinary FLOOR_DROP
 * momentum/packing tie-break. This is still the canonical one-step floor drop;
 * no teleport, speed, collision, gravity, garbage cadence, or ordinary landing
 * rule is changed.
 */
(function installClearVacancyPriority(){
    if(typeof window==="undefined"||window.__hexClearVacancyPriority)return;
    if(typeof hexPhysNaturalMotion!=="function"||typeof hexPhysApplyEvent!=="function"||typeof prepareContinuousPileFlow!=="function")return;
    window.__hexClearVacancyPriority=true;

    const baseNaturalMotion=hexPhysNaturalMotion;
    const baseApplyEvent=hexPhysApplyEvent;
    const basePrepareContinuousPileFlow=prepareContinuousPileFlow;
    const VACANCY_PROP="__hexClearCollapseVacancies";

    function vacancySet(board){
        const s=board?.[VACANCY_PROP];
        return s instanceof Set?s:null;
    }
    function key(x,y){return x+","+y;}
    function activeSupport(board,x,y,ignore){
        if(!valid(x,y))return null;
        const ball=board[y][x];
        if(!ball)return null;
        if(ignore&&ignore.has(ball.id))return null;
        return ball;
    }
    function vacancyRoll(board,x,y,ball,ignore){
        const vacancies=vacancySet(board);
        if(!vacancies||!ball||ball.garbageBubbleHold||touchesFloorRow(y))return null;

        const left=[x-1,y+1],right=[x+1,y+1];
        if(!hexPhysEmpty(board,left[0],left[1],ignore)||!hexPhysEmpty(board,right[0],right[1],ignore))return null;

        const candidates=[];
        if(valid(left[0],left[1])&&vacancies.has(key(left[0],left[1])))candidates.push({dir:-1,to:left});
        if(valid(right[0],right[1])&&vacancies.has(key(right[0],right[1])))candidates.push({dir:1,to:right});
        if(candidates.length!==1)return null;

        const q=candidates[0];

        // The row directly above the physical floor has no valid (x,y+2)
        // support cell. The core solver already treats both open floor diagonals
        // as a legal downward FLOOR_DROP. In a clear collapse, choose the one
        // that is the actual cleared/vacated cell before residual momentum or
        // floor-packing heuristics can send the ball to the opposite side.
        if(y+1===ROWS-1){
            return{
                x,y,tx:q.to[0],ty:q.to[1],ball,
                kind:"FLOOR_DROP",pivot:null,topPivot:null,followSupportIds:[],
                clearVacancyPriority:true,
                clearFloorVacancyPriority:true,
                clearVacancyTarget:key(q.to[0],q.to[1])
            };
        }

        const supportY=y+2,support=activeSupport(board,x,supportY,ignore);
        if(!support)return null;
        return{
            x,y,tx:q.to[0],ty:q.to[1],ball,
            kind:q.dir<0?"ROLL_LEFT":"ROLL_RIGHT",
            pivot:null,topPivot:[x,supportY],followSupportIds:[],
            clearVacancyPriority:true,
            clearVacancyTarget:key(q.to[0],q.to[1])
        };
    }

    hexPhysNaturalMotion=function(board,x,y,ignore=null){
        const ball=valid(x,y)?board[y][x]:null;
        const priority=vacancyRoll(board,x,y,ball,ignore);
        if(priority)return priority;
        return baseNaturalMotion(board,x,y,ignore);
    };

    // Every accepted collapse move creates a new vacancy at its origin. Add it
    // to the SAME live Set before the next resolver event so second/third-stage
    // forks also prefer filling the actual support-loss chain.
    hexPhysApplyEvent=function(board,accepted){
        const vacancies=vacancySet(board);
        const priority=[];
        if(vacancies&&Array.isArray(accepted)){
            for(const p of accepted){
                if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||!valid(p.x,p.y))continue;
                vacancies.add(key(p.x,p.y));
                if(p.clearVacancyPriority)priority.push(p);
            }
        }
        const out=baseApplyEvent(board,accepted);
        // hexPhysAppendSegment deliberately copies only canonical motion fields.
        // Re-attach this diagnostic tag to the accepted segment so regressions
        // can prove that the vacancy branch, not stale momentum, won the fork.
        for(const p of priority){
            const path=Array.isArray(p.ball?.fallPath)?p.ball.fallPath:[];
            for(let i=path.length-1;i>=0;i--){
                const seg=path[i];
                if(seg?.to&&seg.to[0]===p.tx&&seg.to[1]===p.ty){
                    seg.clearVacancyPriority=true;
                    seg.clearFloorVacancyPriority=!!p.clearFloorVacancyPriority;
                    seg.clearVacancyTarget=p.clearVacancyTarget||key(p.tx,p.ty);
                    break;
                }
            }
        }
        return out;
    };

    prepareContinuousPileFlow=function(g,reason="pile_flow"){
        if(reason!=="clear_support_loss"||!g?.board)return basePrepareContinuousPileFlow(g,reason);

        const prior=g.board[VACANCY_PROP];
        const vacancies=new Set();
        const cells=g?.clearing?.cells;
        if(Array.isArray(cells))for(const cell of cells){
            if(!Array.isArray(cell)||cell.length<2)continue;
            const x=Number(cell[0]),y=Number(cell[1]);
            if(Number.isFinite(x)&&Number.isFinite(y)&&valid(x,y))vacancies.add(key(x,y));
        }
        g.board[VACANCY_PROP]=vacancies;
        try{
            const out=basePrepareContinuousPileFlow(g,reason);
            g._lastClearPriorityVacancyCount=vacancies.size;
            g._lastClearPriorityVacancies=new Set(vacancies);
            return out;
        }finally{
            if(prior instanceof Set)g.board[VACANCY_PROP]=prior;
            else delete g.board[VACANCY_PROP];
        }
    };

    window.__hexClearVacancyPriorityVersion="clear-vacancy-v2";
    window.__hexClearVacancyHistoryTracksMotionOrigins=true;
    window.__hexClearVacancyOverridesResidualMomentum=true;
    window.__hexClearVacancyOverridesWallTieBreak=true;
    window.__hexClearFloorVacancyPriority=true;
})();
