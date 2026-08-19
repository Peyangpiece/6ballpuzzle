/* Learned Super Strong CPU strategy.
 *
 * Strength is decision quality, not faster piece execution.  The three reference
 * playthroughs show a repeatable plan:
 *   1) fire HEXAGON / PYRAMID in the fewest piece placements;
 *   2) among equally-fast activations, prefer the line whose post-clear board
 *      reaches the NEXT technique sooner;
 *   3) preserve a second-colour technique route, exploit natural clear/collapse
 *      chains, and use off-colour balls as support without occupying reserved
 *      technique cells;
 *   4) attack amount and generic board quality are tie breakers after those goals.
 *
 * Current + NEXT legal placements remain exhaustive and deterministic.  When a
 * technique fires on CURRENT, NEXT is still searched: this is intentional, since
 * the observed strong play prepares the following technique before the first one
 * has even been cleared.  Search stays time-sliced so this stronger judgement does
 * not reintroduce frame stalls.
 */
(function installFastestTechniqueCpu(){
    if(typeof window==="undefined"||window.__hexAiFastestTechnique)return;
    if(typeof bestMove!=="function"||typeof stepAI!=="function"||typeof enumerateMoves!=="function"||
       !window.__hexAiExactTechniqueScore)return;
    window.__hexAiFastestTechnique=true;

    const baseBestMove=bestMove;
    const baseStepAI=stepAI;
    const fallbackExactScore=window.__hexAiExactTechniqueScore;
    const SLICE_MS=.78;
    const SLICE_MAX_SIMULATIONS=12;

    // Level 5 does not gain strength from faster controls.  Its manipulation
    // cadence is exactly Level 4; only the placement judgement is stronger.
    AI_PARAMS[5].think=AI_PARAMS[4].think;
    AI_PARAMS[5].act=AI_PARAMS[4].act;
    AI_PARAMS[5].strengthBasis="learned-multi-technique";

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
                const sorted=cells.map(([x,y])=>x+","+y).sort();
                const k=type+":"+sorted.join("|");
                if(targetSeen.has(k))continue;
                targetSeen.add(k);
                targets.push({
                    type,cells,cellSet:new Set(sorted),
                    bottom:Math.max(...cells.map(([,y])=>y))
                });
            }
        }
    }

    function techniqueAttack(waza){
        return (waza?.HEXAGON||0)*(WAZA.HEXAGON?.garbage||36)+
               (waza?.PYRAMID||0)*(WAZA.PYRAMID?.garbage||24);
    }
    function techniqueCount(waza){return (waza?.HEXAGON||0)+(waza?.PYRAMID||0);}
    function unsafe(board){refreshBoardScanMin(board);return boardHasOverflow(board);}

    // Search simulation without the diagnostic pre-clear clone.  This is the same
    // settle -> classify -> full instant resolution used by the technique AI, but
    // avoids allocating a board image that the live planner never consumes.
    function simulateSearch(cb,p){
        const settled=cloneHexGrid(cb,v=>v);
        for(const [x,y,c] of pieceCells(p)){
            if(y<0||!valid(x,y)||settled[y][x]!==null)return null;
            settled[y][x]=c;
        }
        settleAll(settled);
        const waza={HEXAGON:0,PYRAMID:0,STRAIGHT:0};
        for(const grp of findGroups(settled)){
            const w=classify(grp.cells);
            if(w)waza[w]=(waza[w]||0)+1;
        }
        const res=resolveInstant(settled);
        return {b:settled,pre:null,res,waza};
    }

    // A reserved technique target may contain only one colour.  Off-colour balls
    // are welcome as supports outside the six reserved cells, matching the play
    // footage, but an off-colour ball inside the target invalidates that route.
    // supportDebt estimates extra scaffolding needed for target cells that have
    // neither an existing lower support nor a lower cell belonging to the target.
    function targetProgress(board,t){
        let color=null,matched=0,mixed=false;
        const missingCells=[];
        for(const [x,y] of t.cells){
            const v=board[y]?.[x];
            if(v===null||v===undefined){missingCells.push([x,y]);continue;}
            const c=getC(v);matched++;
            if(color===null)color=c;
            else if(c!==color){mixed=true;break;}
        }
        if(mixed)return null;

        let supportDebt=0;
        for(const [x,y] of missingCells){
            if(y>=ROWS-1)continue;
            let supported=false;
            for(const [nx,ny] of [[x-1,y+1],[x+1,y+1]]){
                if(!valid(nx,ny))continue;
                if(board[ny]?.[nx]!==null&&board[ny]?.[nx]!==undefined){supported=true;break;}
                if(t.cellSet.has(nx+","+ny)){supported=true;break;}
            }
            if(!supported)supportDebt++;
        }

        const missing=6-matched;
        const rawPieces=Math.ceil(missing/3);
        const estimate=Math.max(rawPieces,Math.ceil((missing+supportDebt)/3));
        return{
            type:t.type,color,matched,missing,supportDebt,estimate,
            typeTie:t.type==="HEXAGON"?1:0,bottom:t.bottom
        };
    }

    function compareTarget(a,b){
        if(!b)return-1;if(!a)return 1;
        if(a.estimate!==b.estimate)return a.estimate-b.estimate;
        if(a.supportDebt!==b.supportDebt)return a.supportDebt-b.supportDebt;
        if(a.missing!==b.missing)return a.missing-b.missing;
        if(a.matched!==b.matched)return b.matched-a.matched;
        if(a.bottom!==b.bottom)return b.bottom-a.bottom;
        if(a.typeTie!==b.typeTie)return b.typeTie-a.typeTie;
        return 0;
    }

    function constructionProfile(board){
        const options=[];
        for(const t of targets){const q=targetProgress(board,t);if(q)options.push(q);}
        options.sort(compareTarget);
        const primary=options[0]||{type:null,color:null,matched:0,missing:6,supportDebt:0,estimate:2,typeTie:0,bottom:ROWS-1};
        let secondary=null;
        if(primary.color!==null){
            secondary=options.find(q=>q.color!==null&&q.color!==primary.color)||null;
        }
        if(!secondary){
            secondary={type:null,color:null,matched:0,missing:6,supportDebt:0,estimate:3,typeTie:0,bottom:ROWS-1};
        }
        return{primary,secondary};
    }

    function constructionDistance(board){return constructionProfile(board).primary;}

    function currentMeta(sim,next){
        return{
            sim,next,
            nowCount:techniqueCount(sim?.waza),
            nowAttack:techniqueAttack(sim?.waza),
            unsafeNow:sim?unsafe(sim.b):true
        };
    }

    // Smaller comparison result means a is better.  Primary activation turn is
    // absolute.  After that, the learned play style prefers the next technique's
    // arrival, real chain/collapse value and a second-colour route before attack.
    function rankFromSims(meta,nextSim){
        const futureCount=techniqueCount(nextSim?.waza);
        const futureAttack=techniqueAttack(nextSim?.waza);
        let turn,attack=0,chain=0,followupTurns=99,followupAttack=0,continuationChain=0;
        let progressBoard,profile;

        if(meta.nowCount>0){
            turn=1;attack=meta.nowAttack;chain=meta.sim?.res?.chain||0;
            if(nextSim){
                progressBoard=nextSim.b;
                profile=constructionProfile(progressBoard);
                if(futureCount>0){
                    followupTurns=1;
                    followupAttack=futureAttack;
                    continuationChain=nextSim?.res?.chain||0;
                }else{
                    followupTurns=1+profile.primary.estimate;
                }
            }else{
                progressBoard=meta.sim.b;
                profile=constructionProfile(progressBoard);
                followupTurns=profile.primary.estimate;
            }
        }else if(futureCount>0){
            turn=2;attack=futureAttack;chain=nextSim?.res?.chain||0;
            progressBoard=nextSim.b;
            profile=constructionProfile(progressBoard);
            followupTurns=profile.primary.estimate;
        }else{
            progressBoard=nextSim?.b||meta.sim.b;
            profile=constructionProfile(progressBoard);
            turn=(nextSim?2:1)+profile.primary.estimate;
            followupTurns=profile.secondary.estimate;
        }

        if(!profile)profile=constructionProfile(progressBoard);
        const p=profile.primary,s=profile.secondary;
        const fallback=fallbackExactScore(meta.sim,nextSim||null,meta.next||null);
        return{
            turn,followupTurns,chain,continuationChain,
            attack,followupAttack,
            estimate:p.estimate,missing:p.missing,matched:p.matched,supportDebt:p.supportDebt,typeTie:p.typeTie,
            secondaryEstimate:s.estimate,secondaryMissing:s.missing,secondaryMatched:s.matched,secondarySupportDebt:s.supportDebt,
            dualMatched:p.matched+s.matched*.5,
            fallback
        };
    }

    function compareRank(a,b){
        if(!b)return-1;if(!a)return 1;
        if(a.turn!==b.turn)return a.turn-b.turn;

        // Once the first technique is equally early, reproduce the learned
        // preference for leaving the board ready to fire again.
        if(a.followupTurns!==b.followupTurns)return a.followupTurns-b.followupTurns;
        if(a.chain!==b.chain)return b.chain-a.chain;
        if(a.continuationChain!==b.continuationChain)return b.continuationChain-a.continuationChain;

        // For lines that still need construction, geometry/support debt is more
        // meaningful than raw same-colour count alone.
        if(a.estimate!==b.estimate)return a.estimate-b.estimate;
        if(a.supportDebt!==b.supportDebt)return a.supportDebt-b.supportDebt;
        if(a.missing!==b.missing)return a.missing-b.missing;
        if(a.matched!==b.matched)return b.matched-a.matched;

        // Preserve another colour as a viable second technique instead of simply
        // dumping it.  This is the dual-build behaviour visible in the recordings.
        if(a.secondaryEstimate!==b.secondaryEstimate)return a.secondaryEstimate-b.secondaryEstimate;
        if(a.secondarySupportDebt!==b.secondarySupportDebt)return a.secondarySupportDebt-b.secondarySupportDebt;
        if(a.secondaryMissing!==b.secondaryMissing)return a.secondaryMissing-b.secondaryMissing;
        if(a.secondaryMatched!==b.secondaryMatched)return b.secondaryMatched-a.secondaryMatched;
        if(a.dualMatched!==b.dualMatched)return b.dualMatched-a.dualMatched;

        // Attack is intentionally below activation/follow-up structure.  A smaller
        // attack that enables the next technique sooner is the stronger line.
        if(a.followupAttack!==b.followupAttack)return b.followupAttack-a.followupAttack;
        if(a.attack!==b.attack)return b.attack-a.attack;
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
                const index=planner.moveIndex,m=planner.moves[index],sim=simulateSearch(planner.cb,m);
                sims++;planner.simulations++;
                if(!sim){planner.moveIndex++;continue;}
                const meta=currentMeta(sim,planner.next),cur={index,m,sim,meta,nextMoves:null,nextIndex:0,bestRank:null,bestNext:null};
                planner.current=cur;

                // If a turn-1 line already exists, a non-immediate current move can
                // never beat it. Immediate lines are NOT pruned: each still searches
                // NEXT so post-technique continuation can decide between them.
                if(meta.nowCount===0&&planner.bestKnownTurn===1){
                    completeCandidate(planner,cur,rankFromSims(meta,null),null);
                    continue;
                }

                cur.nextMoves=planner.next?enumerateMoves(sim.b,planner.next):null;
                if(!cur.nextMoves||!cur.nextMoves.length){
                    completeCandidate(planner,cur,rankFromSims(meta,null),null);
                    continue;
                }
            }else{
                const cur=planner.current;
                if(cur.nextIndex>=cur.nextMoves.length){
                    completeCandidate(planner,cur,cur.bestRank||rankFromSims(cur.meta,null),cur.bestNext);
                    continue;
                }
                const nm=cur.nextMoves[cur.nextIndex++],ns=simulateSearch(cur.sim.b,nm);
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

    window.__hexAiFastestTechniqueVersion="fastest-technique-v2";
    window.__hexAiFastestConstructionDistance=constructionDistance;
    window.__hexAiFastestConstructionProfile=constructionProfile;
    window.__hexAiFastestRankFromSims=rankFromSims;
    window.__hexAiFastestCompareRank=compareRank;
    window.__hexAiCreateFastestTechniquePlanner=createPlanner;
    window.__hexAiAdvanceFastestTechniquePlanner=advancePlanner;
    window.__hexAiFastestTechniqueMoveSync=fastestMoveSync;
    window.__hexAiSuperStrongStrengthFromDecision=true;
    window.__hexAiSuperStrongEarliestActivationFirst=true;
    window.__hexAiSuperStrongPostTechniqueForecast=true;
    window.__hexAiSuperStrongDualTechniqueSetup=true;
    window.__hexAiSuperStrongChainAware=true;
})();
