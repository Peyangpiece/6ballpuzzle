/* Technique-aware CPU difficulty.
 *
 * Five CPU levels are deliberately different in BOTH judgement and execution:
 *   1 超よわい : mostly random, no technique planning, fast-fall only.
 *   2 よわい   : basic placement with light technique awareness, fast-fall only.
 *   3 普通     : reliable one-ply placement with moderate technique preference.
 *   4 強い     : low-error technique construction + NEXT lookahead.
 *   5 超強い   : deterministic exhaustive current+NEXT search whose primary
 *                objective is producing HEXAGON / PYRAMID techniques.
 *
 * Performance invariant:
 *   - the exact level-5 search result is unchanged, but live gameplay computes
 *     that exhaustive tree in small slices instead of one long main-thread burst;
 *   - internal simulations keep only the post-resolution board, avoiding an
 *     unused full-board pre-clear clone for every search node;
 *   - current-move technique/safety metadata is computed once and reused for all
 *     of that move's NEXT branches.
 */
(function installTechniqueAwareCpu(){
    if(typeof window==="undefined"||window.__hexTechniqueAwareCpu)return;
    window.__hexTechniqueAwareCpu=true;

    Object.assign(AI_PARAMS[1],{think:1.08,act:.32,random:.88,depth:0,name:"超よわい",technique:0,beam:0,dropMode:"fast",exactTechnique:false});
    Object.assign(AI_PARAMS[2],{think:.78,act:.23,random:.52,depth:0,name:"よわい",technique:.12,beam:0,dropMode:"fast",exactTechnique:false});
    Object.assign(AI_PARAMS[3],{think:.48,act:.15,random:.14,depth:0,name:"普通",technique:.42,beam:0,dropMode:"hard",exactTechnique:false});
    Object.assign(AI_PARAMS[4],{think:.28,act:.10,random:.02,depth:1,name:"強い",technique:1.02,beam:12,dropMode:"hard",exactTechnique:false});
    Object.assign(AI_PARAMS[5],{think:.12,act:.065,random:0,depth:1,name:"超強い",technique:2.0,beam:0,dropMode:"hard",exactTechnique:true});

    const legacyEvalBoard=evalBoard;
    const legacyStepAI=stepAI;
    const MATCH_VALUE=[0,1.5,7,28,92,300,1100];
    const TYPE_VALUE={PYRAMID:1,HEXAGON:1.42};
    const LEVEL_TECH_SCALE={1:0,2:.12,3:.42,4:1.02,5:2.0};
    const TECH_ATTACK={HEXAGON:WAZA.HEXAGON?.garbage||36,PYRAMID:WAZA.PYRAMID?.garbage||24};
    const EXACT_SLICE_MS=1.15;
    const EXACT_SLICE_MAX_SIMULATIONS=40;

    function pyramidPatterns(){
        const p=GARBAGE_SHAPES.PYRAMID;
        const maxY=Math.max(...p.map(([,y])=>y));
        return [p,p.map(([x,y])=>[x,maxY-y])];
    }

    const placements=[];
    const seenPlacement=new Set();
    for(const [type,patterns] of [
        ["HEXAGON",[GARBAGE_SHAPES.HEXAGON]],
        ["PYRAMID",pyramidPatterns()]
    ]){
        for(const pat of patterns){
            for(let ay=0;ay<ROWS;ay++)for(let ax=0;ax<W2;ax++){
                const cells=pat.map(([dx,dy])=>[ax+dx,ay+dy]);
                if(!cells.every(([x,y])=>valid(x,y)))continue;
                const key=type+":"+cells.map(([x,y])=>x+","+y).sort().join("|");
                if(seenPlacement.has(key))continue;
                seenPlacement.add(key);
                placements.push({type,cells,bottom:Math.max(...cells.map(([,y])=>y))});
            }
        }
    }

    function techniquePotential(board,level=5,availableColors=null){
        const scale=LEVEL_TECH_SCALE[level]||0;
        if(scale<=0)return {score:0,best:null,second:null};
        let availableCounts=null;
        if(level>=4&&Array.isArray(availableColors)){
            availableCounts=new Int8Array(COLORS.length);
            for(const c of availableColors)if(Number.isInteger(c)&&c>=0&&c<availableCounts.length)availableCounts[c]++;
        }
        let bestScore=0,secondScore=0,best=null,second=null;
        for(const pl of placements){
            let occupied=0,color=null,mixed=false;
            for(const [x,y] of pl.cells){
                const v=board[y]?.[x];
                if(v===null||v===undefined)continue;
                const c=getC(v);
                occupied++;
                if(color===null)color=c;
                else if(c!==color){mixed=true;break;}
            }
            if(mixed||occupied===0)continue;
            let value=MATCH_VALUE[Math.min(6,occupied)]*TYPE_VALUE[pl.type];
            value*=1+Math.max(0,pl.bottom-(ROWS-5))*.025;
            if(availableCounts&&color!==null){
                const avail=availableCounts[color]||0;
                value*=1+avail*(level===5?.12:.06);
            }
            const target={type:pl.type,color,matched:occupied,cells:pl.cells,value};
            if(value>bestScore){secondScore=bestScore;second=best;bestScore=value;best=target;}
            else if(value>secondScore){secondScore=value;second=target;}
        }
        return {score:(bestScore+secondScore*.18)*scale,best,second};
    }

    function immediateWaza(board){
        const out={HEXAGON:0,PYRAMID:0,STRAIGHT:0};
        for(const grp of findGroups(board)){
            const w=classify(grp.cells);
            if(w)out[w]=(out[w]||0)+1;
        }
        return out;
    }

    // Internal search nodes do not need a second full-board clone of the settled
    // pre-clear position. The public diagnostic helper can request it explicitly.
    function simulateDetailed(cb,p,keepPre=false){
        const settled=cloneHexGrid(cb,v=>v);
        for(const [x,y,c] of pieceCells(p)){
            if(y<0||!valid(x,y)||settled[y][x]!==null)return null;
            settled[y][x]=c;
        }
        settleAll(settled);
        const waza=immediateWaza(settled);
        const pre=keepPre?cloneHexGrid(settled,v=>v):null;
        const res=resolveInstant(settled);
        return {b:settled,pre,res,waza};
    }

    function wazaBonus(waza,level){
        if(level<=2)return 0;
        const k=level===3?.34:level===4?.76:1;
        return k*((waza.HEXAGON||0)*2500+(waza.PYRAMID||0)*1650+(waza.STRAIGHT||0)*220);
    }

    function techniqueAttackValue(waza){
        return (waza?.HEXAGON||0)*TECH_ATTACK.HEXAGON+(waza?.PYRAMID||0)*TECH_ATTACK.PYRAMID;
    }

    function boardUnsafe(board){
        refreshBoardScanMin(board);
        return boardHasOverflow(board);
    }

    function scoreDetailed(sim,level,beforePotential,knownNext,rnd=Math.random){
        if(!sim)return-1e12;
        let score=legacyEvalBoard(sim.b,sim.res,level,rnd);
        if(level<=1)return score;

        const after=techniquePotential(sim.b,level,knownNext);
        const gain=after.score-beforePotential;
        score+=after.score*.64+gain*(level>=4?1.28:.72);
        score+=wazaBonus(sim.waza,level);

        const h=heightOf(sim.b);
        if(h>=ROWS-2)score-=level>=4?2600:1300;
        if(h>=ROWS-1)score-=6000;

        if(level>=4&&after.best){
            if(after.best.matched===5)score+=(after.best.type==="HEXAGON"?460:320)*(level===5?1.35:1);
            else if(after.best.matched===4)score+=(after.best.type==="HEXAGON"?120:85)*(level===5?1.2:1);
        }
        return score;
    }

    function exactCurrentMeta(sim,knownNext){
        if(!sim)return null;
        return{
            sim,
            knownNext,
            nowAttack:techniqueAttackValue(sim.waza),
            nowPotential:techniquePotential(sim.b,5,knownNext).score,
            unsafeNow:boardUnsafe(sim.b)
        };
    }

    function exactTechniqueScoreFromMeta(meta,nextSim){
        if(!meta)return-1e18;
        const futureAttack=nextSim?techniqueAttackValue(nextSim.waza):0;
        const futurePotential=nextSim?techniquePotential(nextSim.b,5,null).score:0;
        const unsafeFuture=nextSim?boardUnsafe(nextSim.b):false;
        const safety=(meta.unsafeNow?-1:0)+(unsafeFuture?-.5:0);
        const generic=nextSim
            ?legacyEvalBoard(nextSim.b,nextSim.res,5,()=>.5)
            :legacyEvalBoard(meta.sim.b,meta.sim.res,5,()=>.5);
        return safety*1e15+
            (meta.nowAttack+futureAttack*.86)*1e9+
            (meta.nowPotential+futurePotential*.72)*1e4+
            generic;
    }

    // Strict level-5 objective. Actual HEXAGON/PYRAMID production dominates,
    // then same-colour construction potential, then generic board quality.
    function exactTechniqueScore(sim,nextSim,knownNext){
        return exactTechniqueScoreFromMeta(exactCurrentMeta(sim,knownNext),nextSim);
    }

    function finishExactPlanner(planner){
        if(planner.done)return planner.result;
        if(!planner.candidates.length){
            planner.result=planner.moves[0]||null;
            planner.done=true;
            return planner.result;
        }
        const safe=planner.candidates.filter(c=>!c.meta.unsafeNow);
        const pool=safe.length?safe:planner.candidates;
        pool.sort((a,b)=>b.score-a.score||a.index-b.index);
        planner.result=pool[0].m;
        planner.done=true;
        return planner.result;
    }

    function createExactPlanner(board,colors,next){
        const cb=toColors(board),moves=enumerateMoves(board,colors);
        return{
            cb,moves,next:Array.isArray(next)?next.slice():null,
            moveIndex:0,current:null,candidates:[],done:false,result:null,
            simulations:0,slices:0,lastSliceSimulations:0,maxSliceSimulations:0
        };
    }

    function completeCurrentExactCandidate(planner,current){
        const score=current.bestNext?current.bestNextScore:exactTechniqueScoreFromMeta(current.meta,null);
        planner.candidates.push({m:current.m,sim:current.sim,nextSim:current.bestNext,score,index:current.index,meta:current.meta});
        planner.moveIndex=current.index+1;
        planner.current=null;
    }

    function performanceNow(){
        if(typeof performance!=="undefined"&&performance&&typeof performance.now==="function")return performance.now();
        return Date.now();
    }

    // Advance a deterministic prefix of the exact tree. The wall-clock budget is
    // only a responsiveness guard; search order and final score are unchanged.
    function advanceExactPlanner(planner,budgetMs=EXACT_SLICE_MS,maxSimulations=EXACT_SLICE_MAX_SIMULATIONS){
        if(!planner||planner.done)return planner?.result||null;
        const start=performanceNow();
        let simulations=0;
        planner.slices++;
        while(!planner.done&&simulations<maxSimulations){
            if(!planner.current){
                if(planner.moveIndex>=planner.moves.length){finishExactPlanner(planner);break;}
                const index=planner.moveIndex,m=planner.moves[index],sim=simulateDetailed(planner.cb,m,false);
                simulations++;planner.simulations++;
                if(!sim){planner.moveIndex++;continue;}
                const meta=exactCurrentMeta(sim,planner.next);
                const nextMoves=planner.next?enumerateMoves(sim.b,planner.next):null;
                planner.current={index,m,sim,meta,nextMoves,nextIndex:0,bestNext:null,bestNextScore:-Infinity};
                if(!nextMoves||!nextMoves.length)completeCurrentExactCandidate(planner,planner.current);
            }else{
                const cur=planner.current;
                if(!cur.nextMoves||cur.nextIndex>=cur.nextMoves.length){completeCurrentExactCandidate(planner,cur);continue;}
                const nm=cur.nextMoves[cur.nextIndex++],ns=simulateDetailed(cur.sim.b,nm,false);
                simulations++;planner.simulations++;
                if(ns){
                    const s=exactTechniqueScoreFromMeta(cur.meta,ns);
                    if(s>cur.bestNextScore){cur.bestNextScore=s;cur.bestNext=ns;}
                }
                if(cur.nextIndex>=cur.nextMoves.length)completeCurrentExactCandidate(planner,cur);
            }
            if(simulations>0&&performanceNow()-start>=budgetMs)break;
        }
        planner.lastSliceSimulations=simulations;
        planner.maxSliceSimulations=Math.max(planner.maxSliceSimulations,simulations);
        if(!planner.done&&planner.moveIndex>=planner.moves.length&&!planner.current)finishExactPlanner(planner);
        return planner.done?planner.result:null;
    }

    function bestExactTechniqueMove(board,colors,next){
        const planner=createExactPlanner(board,colors,next);
        while(!planner.done)advanceExactPlanner(planner,Infinity,1e9);
        return planner.result;
    }

    window.__hexAiTechniquePotential=(board,level=5,next=null)=>techniquePotential(board,level,next);
    window.__hexAiSimulateDetailed=(cb,p)=>simulateDetailed(cb,p,true);
    window.__hexAiExactTechniqueScore=exactTechniqueScore;
    window.__hexAiBestExactTechniqueMove=bestExactTechniqueMove;
    window.__hexAiCreateExactPlanner=createExactPlanner;
    window.__hexAiAdvanceExactPlanner=advanceExactPlanner;

    evalBoard=function(b,res,level,rnd=Math.random){
        const base=legacyEvalBoard(b,res,level,rnd);
        if(level<=1)return base;
        return base+techniquePotential(b,level,null).score*.64;
    };

    bestMove=function(board,colors,next,level,rnd=Math.random){
        level=Math.max(1,Math.min(5,Number(level)||1));
        const P=AI_PARAMS[level];
        if(P.exactTechnique)return bestExactTechniqueMove(board,colors,next);

        const moves=enumerateMoves(board,colors);
        if(!moves.length)return null;
        if(rnd()<P.random)return moves[Math.floor(rnd()*moves.length)];

        const cb=toColors(board);
        const beforePotential=techniquePotential(cb,level,colors).score;
        const scored=[];
        for(const m of moves){
            const sim=simulateDetailed(cb,m,false);
            if(!sim)continue;
            const s=scoreDetailed(sim,level,beforePotential,next,rnd);
            scored.push({m,s,b:sim.b});
        }
        if(!scored.length)return moves[0];
        scored.sort((a,z)=>z.s-a.s);

        if(P.depth>=1&&next){
            const top=scored.slice(0,P.beam||8);
            for(const c of top){
                const nextBefore=techniquePotential(c.b,level,next).score;
                let future=-1e12;
                for(const mm of enumerateMoves(c.b,next)){
                    const s2=simulateDetailed(c.b,mm,false);
                    if(!s2)continue;
                    future=Math.max(future,scoreDetailed(s2,level,nextBefore,null,rnd));
                }
                if(future>-1e11)c.s=c.s*.55+future*.45;
            }
            top.sort((a,z)=>z.s-a.s);
            return top[0].m;
        }
        return scored[0].m;
    };

    // Levels 1-2 intentionally do NOT use instant drop. Level 5 gets a dedicated
    // time-sliced exact planner so exhaustive search cannot stall rendering.
    stepAI=function(g,dt){
        const ai=g?.ai;if(!ai)return;
        const level=Math.max(1,Math.min(5,Number(ai.level)||1)),P=AI_PARAMS[level];

        if(level===5){
            g.fastForward=false;
            if(!g.piece||g.state!=="PLAYING"){ai._exactPlanner=null;return;}
            if(ai.thinkT>0){ai.thinkT-=dt;return;}
            if(!ai.target){
                if(!ai._exactPlanner)ai._exactPlanner=createExactPlanner(g.board,g.piece.colors,g.queue[0]);
                const target=advanceExactPlanner(ai._exactPlanner,EXACT_SLICE_MS,EXACT_SLICE_MAX_SIMULATIONS);
                ai._lastExactPlannerStats={
                    slices:ai._exactPlanner.slices,
                    simulations:ai._exactPlanner.simulations,
                    lastSliceSimulations:ai._exactPlanner.lastSliceSimulations,
                    maxSliceSimulations:ai._exactPlanner.maxSliceSimulations,
                    done:ai._exactPlanner.done
                };
                if(!target)return;
                ai.target=target;ai._exactPlanner=null;ai.stuck=0;
            }
            const t=ai.target;
            ai.actT-=dt;
            if(ai.actT>0)return;
            ai.actT=P.act;
            if(g.piece.rot!==t.rot){
                const cw=(t.rot-g.piece.rot+6)%6;
                if(!rotate(g,cw<=3?1:-1)){
                    ai.target=null;ai._exactPlanner=null;ai.stuck=(ai.stuck||0)+1;ai.thinkT=Math.min(.08,P.think*.2);
                }else ai.stuck=0;
                return;
            }
            if(g.piece.x!==t.x){
                if(!move(g,g.piece.x<t.x?1:-1)){
                    ai.target=null;ai._exactPlanner=null;ai.stuck=(ai.stuck||0)+1;ai.thinkT=Math.min(.08,P.think*.2);
                }else ai.stuck=0;
                return;
            }
            ai.stuck=0;
            hardDrop(g);
            return;
        }

        if(level>=3){g.fastForward=false;return legacyStepAI(g,dt);}
        if(!g.piece||g.state!=="PLAYING"){g.fastForward=false;return;}

        if(ai.thinkT>0){ai.thinkT-=dt;g.fastForward=false;return;}
        if(!ai.target){
            ai.target=bestMove(g.board,g.piece.colors,g.queue[0],level,g.aiRng);
            ai.stuck=0;
            if(!ai.target){g.fastForward=true;return;}
        }
        ai.actT-=dt;
        if(ai.actT>0)return;
        ai.actT=P.act;
        const t=ai.target;
        if(g.piece.rot!==t.rot){
            g.fastForward=false;
            const cw=(t.rot-g.piece.rot+6)%6;
            if(!rotate(g,cw<=3?1:-1)){
                ai.target=null;ai.stuck=(ai.stuck||0)+1;ai.thinkT=Math.min(.12,P.think*.2);
            }else ai.stuck=0;
            return;
        }
        if(g.piece.x!==t.x){
            g.fastForward=false;
            if(!move(g,g.piece.x<t.x?1:-1)){
                ai.target=null;ai.stuck=(ai.stuck||0)+1;ai.thinkT=Math.min(.12,P.think*.2);
            }else ai.stuck=0;
            return;
        }
        ai.stuck=0;
        g.fastForward=true;
    };

    window.__hexAiDifficultyProfileVersion="ai-difficulty-v4-perf";
    window.__hexAiLowLevelsUseFastFallOnly=true;
    window.__hexAiSuperStrongExactTechnique=true;
    window.__hexAiSuperStrongExhaustiveNext=true;
    window.__hexAiSuperStrongTimeSliced=true;
    window.__hexAiInternalSimulationSingleClone=true;
    window.__hexAiExactCurrentMetaReuse=true;
    window.__hexAiExactSliceMaxSimulations=EXACT_SLICE_MAX_SIMULATIONS;
})();
