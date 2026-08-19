/* Earliest-technique objective for Super Strong CPU.
 *
 * "Strong" means reaching HEXAGON / PYRAMID in the fewest piece placements,
 * not moving the active piece faster.  Level 5 therefore uses a lexicographic
 * objective:
 *   1) technique on THIS piece always beats technique on NEXT;
 *   2) technique on NEXT always beats any non-technique line;
 *   3) if neither visible piece can trigger a technique, minimise the number of
 *      missing cells in the closest exact HEXAGON / PYRAMID construction;
 *   4) only then use attack amount / board quality as tie breakers.
 *
 * The current+NEXT tree is still exhaustive and deterministic.  Live gameplay
 * evaluates it in small main-thread slices so decision quality is not bought by
 * frame drops.  Level 5 uses the same rotation/move cadence as Level 4; its
 * strength comes from the choice of move, not faster execution.
 */
(function installFastestTechniqueCpu(){
    if(typeof window==="undefined"||window.__hexAiFastestTechnique)return;
    if(typeof bestMove!=="function"||typeof stepAI!=="function"||typeof enumerateMoves!=="function"||
       !window.__hexAiSimulateDetailed||!window.__hexAiExactTechniqueScore)return;
    window.__hexAiFastestTechnique=true;

    const baseBestMove=bestMove;
    const baseStepAI=stepAI;
    const simulate=window.__hexAiSimulateDetailed;
    const fallbackExactScore=window.__hexAiExactTechniqueScore;
    const SLICE_MS=.85;
    const SLICE_MAX_SIMULATIONS=14;

    // Remove execution-speed advantage from Level 5.  Level 4 and Level 5 now
    // manipulate the piece at the same cadence; only judgement is stronger.
    AI_PARAMS[5].think=AI_PARAMS[4].think;
    AI_PARAMS[5].act=AI_PARAMS[4].act;
    AI_PARAMS[5].strengthBasis="earliest-technique";

    function pyramidPatterns(){
        const p=GARBAGE_SHAPES.PYRAMID;
        const maxY=Math.max(...p.map(([,y])=>y));
        return [p,p.map(([x,y])=>[x,maxY-y])];
    }

    const targets=[];
    const targetSeen=new Set();
    for(const [type,patterns] of [["HEXAGON",[GARBAGE_SHAPES.HEXAGON]],["PYRAMID",pyramidPatterns()]]){
        for(const pat of patterns){
            for(let ay=0;ay<ROWS;ay++)for(let ax=0;ax<W2;ax++){
                const cells=pat.map(([dx,dy])=>[ax+dx,ay+dy]);
                if(!cells.every(([x,y])=>valid(x,y)))continue;
                const k=type+":"+cells.map(([x,y])=>x+","+y).sort().join("|");
                if(targetSeen.has(k))continue;
                targetSeen.add(k);
                targets.push({type,cells});
            }
        }
    }

    function techniqueAttack(waza){
        return (waza?.HEXAGON||0)*(WAZA.HEXAGON?.garbage||36)+
               (waza?.PYRAMID||0)*(WAZA.PYRAMID?.garbage||24);
    }
    function techniqueCount(waza){return (waza?.HEXAGON||0)+(waza?.PYRAMID||0);}
    function unsafe(board){refreshBoardScanMin(board);return boardHasOverflow(board);}

    // Exact construction distance in cells.  A mixed-colour target is invalid;
    // otherwise each occupied same-colour target cell is real progress toward a
    // six-ball technique.  This is used only when neither CURRENT nor NEXT can
    // already fire a technique.
    function constructionDistance(board){
        let best=null;
        for(const t of targets){
            let color=null,matched=0,mixed=false;
            for(const [x,y] of t.cells){
                const v=board[y]?.[x];
                if(v===null||v===undefined)continue;
                const c=getC(v);matched++;
                if(color===null)color=c;
                else if(c!==color){mixed=true;break;}
            }
            if(mixed)continue;
            const missing=6-matched;
            const estimate=Math.ceil(missing/3);
            const typeTie=t.type==="HEXAGON"?1:0;
            const q={missing,estimate,matched,type:t.type,color,typeTie};
            if(!best||q.estimate<best.estimate||
               (q.estimate===best.estimate&&q.missing<best.missing)||
               (q.estimate===best.estimate&&q.missing===best.missing&&q.typeTie>best.typeTie))best=q;
        }
        return best||{missing:6,estimate:2,matched:0,type:null,color:null,typeTie:0};
    }

    function currentMeta(sim,next){
        return{
            sim,next,
            nowCount:techniqueCount(sim?.waza),
            nowAttack:techniqueAttack(sim?.waza),
            unsafeNow:sim?unsafe(sim.b):true
        };
    }

    // Smaller cmp result = a is better.  Activation turn is absolute priority.
    function rankFromSims(meta,nextSim){
        const futureCount=techniqueCount(nextSim?.waza);
        const futureAttack=techniqueAttack(nextSim?.waza);
        let turn,attack,progressBoard;
        if(meta.nowCount>0){turn=1;attack=meta.nowAttack;progressBoard=meta.sim.b;}
        else if(futureCount>0){turn=2;attack=futureAttack;progressBoard=nextSim.b;}
        else{
            progressBoard=nextSim?.b||meta.sim.b;
            const d=constructionDistance(progressBoard);
            // One current piece has been consumed; when NEXT was simulated two
            // visible pieces have been consumed.  The estimate is only reached
            // after proving that neither of those pieces can already activate.
            turn=(nextSim?2:1)+d.estimate;
            attack=0;
        }
        const distance=constructionDistance(progressBoard);
        const fallback=fallbackExactScore(meta.sim,nextSim||null,meta.next||null);
        return{
            turn,attack,
            missing:distance.missing,
            estimate:distance.estimate,
            matched:distance.matched,
            typeTie:distance.typeTie,
            fallback
        };
    }

    function compareRank(a,b){
        if(!b)return-1;if(!a)return 1;
        if(a.turn!==b.turn)return a.turn-b.turn;
        if(a.attack!==b.attack)return b.attack-a.attack;
        if(a.estimate!==b.estimate)return a.estimate-b.estimate;
        if(a.missing!==b.missing)return a.missing-b.missing;
        if(a.matched!==b.matched)return b.matched-a.matched;
        if(a.typeTie!==b.typeTie)return b.typeTie-a.typeTie;
        if(a.fallback!==b.fallback)return b.fallback-a.fallback;
        return 0;
    }

    function createPlanner(board,colors,next){
        const cb=toColors(board),moves=enumerateMoves(board,colors);
        return{
            cb,moves,next:Array.isArray(next)?next.slice():null,
            moveIndex:0,current:null,candidates:[],done:false,result:null,
            simulations:0,slices:0,lastSliceSimulations:0,maxSliceSimulations:0,
            bestKnownTurn:Infinity
        };
    }

    function completeCandidate(planner,cur,rank,nextSim=null){
        planner.candidates.push({m:cur.m,index:cur.index,meta:cur.meta,rank,nextSim});
        planner.bestKnownTurn=Math.min(planner.bestKnownTurn,rank.turn);
        planner.moveIndex=cur.index+1;
        planner.current=null;
    }

    function finishPlanner(planner){
        if(planner.done)return planner.result;
        if(!planner.candidates.length){planner.result=planner.moves[0]||null;planner.done=true;return planner.result;}
        const safe=planner.candidates.filter(c=>!c.meta.unsafeNow);
        const pool=safe.length?safe:planner.candidates;
        pool.sort((a,b)=>compareRank(a.rank,b.rank)||a.index-b.index);
        planner.result=pool[0].m;planner.done=true;
        planner.bestRank=pool[0].rank;
        return planner.result;
    }

    function nowMs(){return typeof performance!=="undefined"&&performance?.now?performance.now():Date.now();}

    function advancePlanner(planner,budgetMs=SLICE_MS,maxSimulations=SLICE_MAX_SIMULATIONS){
        if(!planner||planner.done)return planner?.result||null;
        const start=nowMs();let sims=0;planner.slices++;
        while(!planner.done&&sims<maxSimulations){
            if(!planner.current){
                if(planner.moveIndex>=planner.moves.length){finishPlanner(planner);break;}
                const index=planner.moveIndex,m=planner.moves[index],sim=simulate(planner.cb,m);
                sims++;planner.simulations++;
                if(!sim){planner.moveIndex++;continue;}
                const meta=currentMeta(sim,planner.next),cur={index,m,sim,meta,nextMoves:null,nextIndex:0,bestRank:null,bestNext:null};
                planner.current=cur;

                // A technique on the current piece is unbeatable by any later
                // activation turn.  Do not waste NEXT simulations on this move.
                if(meta.nowCount>0){completeCandidate(planner,cur,rankFromSims(meta,null),null);continue;}

                // Once ANY turn-1 line exists, non-immediate candidates cannot
                // beat it, regardless of NEXT attack strength.
                if(planner.bestKnownTurn===1){completeCandidate(planner,cur,rankFromSims(meta,null),null);continue;}

                cur.nextMoves=planner.next?enumerateMoves(sim.b,planner.next):null;
                if(!cur.nextMoves||!cur.nextMoves.length){completeCandidate(planner,cur,rankFromSims(meta,null),null);continue;}
            }else{
                const cur=planner.current;
                if(cur.nextIndex>=cur.nextMoves.length){
                    completeCandidate(planner,cur,cur.bestRank||rankFromSims(cur.meta,null),cur.bestNext);
                    continue;
                }
                const nm=cur.nextMoves[cur.nextIndex++],ns=simulate(cur.sim.b,nm);
                sims++;planner.simulations++;
                if(ns){
                    const r=rankFromSims(cur.meta,ns);
                    if(compareRank(r,cur.bestRank)<0){cur.bestRank=r;cur.bestNext=ns;}
                }
                if(cur.nextIndex>=cur.nextMoves.length){
                    completeCandidate(planner,cur,cur.bestRank||rankFromSims(cur.meta,null),cur.bestNext);
                    continue;
                }
            }
            if(sims>0&&nowMs()-start>=budgetMs)break;
        }
        planner.lastSliceSimulations=sims;
        planner.maxSliceSimulations=Math.max(planner.maxSliceSimulations,sims);
        if(!planner.done&&planner.moveIndex>=planner.moves.length&&!planner.current)finishPlanner(planner);
        return planner.done?planner.result:null;
    }

    function fastestMoveSync(board,colors,next){
        const p=createPlanner(board,colors,next);
        while(!p.done)advancePlanner(p,Infinity,1e9);
        return p.result;
    }

    bestMove=function(board,colors,next,level,rnd=Math.random){
        level=Math.max(1,Math.min(5,Number(level)||1));
        if(level===5)return fastestMoveSync(board,colors,next);
        return baseBestMove(board,colors,next,level,rnd);
    };

    stepAI=function(g,dt){
        const ai=g?.ai;if(!ai)return;
        const level=Math.max(1,Math.min(5,Number(ai.level)||1));
        if(level!==5)return baseStepAI(g,dt);
        const P=AI_PARAMS[5];g.fastForward=false;
        if(!g.piece||g.state!=="PLAYING"){ai._fastTechniquePlanner=null;return;}
        if(ai.thinkT>0){ai.thinkT-=dt;return;}
        if(!ai.target){
            if(!ai._fastTechniquePlanner)ai._fastTechniquePlanner=createPlanner(g.board,g.piece.colors,g.queue[0]);
            const target=advancePlanner(ai._fastTechniquePlanner,SLICE_MS,SLICE_MAX_SIMULATIONS);
            ai._lastFastTechniquePlannerStats={
                slices:ai._fastTechniquePlanner.slices,
                simulations:ai._fastTechniquePlanner.simulations,
                lastSliceSimulations:ai._fastTechniquePlanner.lastSliceSimulations,
                maxSliceSimulations:ai._fastTechniquePlanner.maxSliceSimulations,
                bestKnownTurn:ai._fastTechniquePlanner.bestKnownTurn,
                done:ai._fastTechniquePlanner.done
            };
            if(!target)return;
            ai.target=target;ai._fastTechniquePlanner=null;ai.stuck=0;
        }
        const t=ai.target;ai.actT-=dt;if(ai.actT>0)return;ai.actT=P.act;
        if(g.piece.rot!==t.rot){
            const cw=(t.rot-g.piece.rot+6)%6;
            if(!rotate(g,cw<=3?1:-1)){ai.target=null;ai._fastTechniquePlanner=null;ai.stuck=(ai.stuck||0)+1;ai.thinkT=Math.min(.08,P.think*.2);}
            else ai.stuck=0;
            return;
        }
        if(g.piece.x!==t.x){
            if(!move(g,g.piece.x<t.x?1:-1)){ai.target=null;ai._fastTechniquePlanner=null;ai.stuck=(ai.stuck||0)+1;ai.thinkT=Math.min(.08,P.think*.2);}
            else ai.stuck=0;
            return;
        }
        ai.stuck=0;hardDrop(g);
    };

    window.__hexAiFastestTechniqueVersion="fastest-technique-v1";
    window.__hexAiFastestConstructionDistance=constructionDistance;
    window.__hexAiFastestRankFromSims=rankFromSims;
    window.__hexAiFastestCompareRank=compareRank;
    window.__hexAiCreateFastestTechniquePlanner=createPlanner;
    window.__hexAiAdvanceFastestTechniquePlanner=advancePlanner;
    window.__hexAiFastestTechniqueMoveSync=fastestMoveSync;
    window.__hexAiSuperStrongStrengthFromDecision=true;
    window.__hexAiSuperStrongEarliestActivationFirst=true;
})();
