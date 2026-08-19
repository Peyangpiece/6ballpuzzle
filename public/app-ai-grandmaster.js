/* Grandmaster Super Strong CPU.
 *
 * This adapter keeps the existing technique-first rule, but fixes the biggest
 * long-horizon weakness in the v2 planner: after CURRENT + visible NEXT, a
 * missing target-colour ball was effectively treated as if every future piece
 * could supply up to three copies of that colour. In the real generator each of
 * the three balls is independently one of five colours, so a six-cell formation
 * must be valued by the expected number of future pieces needed to actually
 * receive the missing colour. This planner uses that stochastic ETA, exact
 * current+NEXT simulation, multi-colour continuation, chain value and incoming
 * pressure. It does not read hidden queue entries.
 */
(function installGrandmasterSuperStrong(){
    if(typeof window==="undefined"||window.__hexAiGrandmaster)return;
    if(typeof bestMove!=="function"||typeof stepAI!=="function"||typeof enumerateMoves!=="function"||
       typeof cloneHexGrid!=="function"||typeof resolveInstant!=="function"||
       !window.__hexAiExactTechniqueScore)return;
    window.__hexAiGrandmaster=true;

    const baseBestMove=bestMove;
    const baseStepAI=stepAI;
    const fallbackExactScore=window.__hexAiExactTechniqueScore;
    const SLICE_MS=.96;
    const SLICE_MAX_SIMULATIONS=24;

    AI_PARAMS[5].strengthBasis="grandmaster-technique-first";

    function pyramidPatterns(){
        const p=GARBAGE_SHAPES.PYRAMID;
        const maxY=Math.max(...p.map(([,y])=>y));
        return [p,p.map(([x,y])=>[x,maxY-y])];
    }

    const targets=[];
    const seen=new Set();
    for(const [type,patterns] of [["HEXAGON",[GARBAGE_SHAPES.HEXAGON]],["PYRAMID",pyramidPatterns()]]){
        for(const pat of patterns){
            for(let ay=0;ay<ROWS;ay++)for(let ax=0;ax<W2;ax++){
                const cells=pat.map(([dx,dy])=>[ax+dx,ay+dy]);
                if(!cells.every(([x,y])=>valid(x,y)))continue;
                const sorted=cells.map(([x,y])=>x+","+y).sort();
                const key=type+":"+sorted.join("|");
                if(seen.has(key))continue;
                seen.add(key);
                targets.push({type,cells,cellSet:new Set(sorted),key,bottom:Math.max(...cells.map(([,y])=>y))});
            }
        }
    }

    const ARRIVAL=[.512,.384,.096,.008];
    const EXPECTED_COLOR_PIECES=[0];
    for(let missing=1;missing<=6;missing++){
        let numerator=1;
        for(let k=1;k<=3;k++)numerator+=ARRIVAL[k]*EXPECTED_COLOR_PIECES[Math.max(0,missing-k)];
        EXPECTED_COLOR_PIECES[missing]=numerator/(1-ARRIVAL[0]);
    }

    function techniqueAttack(waza){
        return (waza?.HEXAGON||0)*(WAZA.HEXAGON?.garbage||36)+
               (waza?.PYRAMID||0)*(WAZA.PYRAMID?.garbage||24);
    }
    function techniqueCount(waza){return (waza?.HEXAGON||0)+(waza?.PYRAMID||0);}
    function unsafe(board){refreshBoardScanMin(board);return boardHasOverflow(board);}

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
        return{b:settled,pre:null,res,waza};
    }

    function supportDebtFor(board,t,missingCells){
        let debt=0;
        for(const [x,y] of missingCells){
            if(y>=ROWS-1)continue;
            let supported=false;
            for(const [nx,ny] of [[x-1,y+1],[x+1,y+1]]){
                if(!valid(nx,ny))continue;
                if(board[ny]?.[nx]!==null&&board[ny]?.[nx]!==undefined){supported=true;break;}
                if(t.cellSet.has(nx+","+ny)){supported=true;break;}
            }
            if(!supported)debt++;
        }
        return debt;
    }

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
        const missing=6-matched;
        const supportDebt=supportDebtFor(board,t,missingCells);
        const colorEta=color===null?10.7:EXPECTED_COLOR_PIECES[missing];
        const eta=colorEta+supportDebt*.34;
        return{
            type:t.type,key:t.key,color,matched,missing,supportDebt,eta,
            typeTie:t.type==="HEXAGON"?1:0,bottom:t.bottom
        };
    }

    function compareTarget(a,b){
        if(!b)return-1;if(!a)return 1;
        if(Math.abs(a.eta-b.eta)>1e-9)return a.eta-b.eta;
        if(a.supportDebt!==b.supportDebt)return a.supportDebt-b.supportDebt;
        if(a.missing!==b.missing)return a.missing-b.missing;
        if(a.matched!==b.matched)return b.matched-a.matched;
        if(a.bottom!==b.bottom)return b.bottom-a.bottom;
        if(a.typeTie!==b.typeTie)return b.typeTie-a.typeTie;
        return a.key<b.key?-1:a.key>b.key?1:0;
    }

    function constructionProfile(board){
        const options=[];
        for(const t of targets){const q=targetProgress(board,t);if(q)options.push(q);}
        options.sort(compareTarget);
        const empty={type:null,key:"",color:null,matched:0,missing:6,supportDebt:0,eta:10.7,typeTie:0,bottom:ROWS-1};
        const primary=options[0]||empty;
        const portfolio=[primary];
        const used=new Set(primary.color===null?[]:[primary.color]);
        for(const q of options){
            if(q.color===null||used.has(q.color))continue;
            portfolio.push(q);used.add(q.color);
            if(portfolio.length>=3)break;
        }
        while(portfolio.length<3)portfolio.push(empty);
        const secondary=portfolio[1],tertiary=portfolio[2];
        const portfolioStrength=portfolio.reduce((s,q,i)=>{
            if(q.color===null)return s;
            const weight=i===0?1:i===1?.48:.24;
            return s+weight*(q.matched+2.4/(1+q.eta));
        },0);
        return{primary,secondary,tertiary,portfolioStrength,options};
    }

    function boardRisk(board){
        let top=ROWS,count=0,topLoad=0,upperLoad=0;
        for(let y=boardScanMin(board);y<ROWS;y++)for(let x=0;x<W2;x++){
            if(!valid(x,y)||board[y]?.[x]===null||board[y]?.[x]===undefined)continue;
            count++;if(y<top)top=y;
            if(y<=1)topLoad++;
            if(y<=4)upperLoad+=(5-y);
        }
        if(!count)return 0;
        const height=Math.max(0,5-top);
        return topLoad*38+upperLoad*1.8+height*4+count*.035;
    }

    function currentMeta(sim,next,pressure=0){
        return{
            sim,next,pressure,
            nowCount:techniqueCount(sim?.waza),
            nowAttack:techniqueAttack(sim?.waza),
            unsafeNow:sim?unsafe(sim.b):true
        };
    }

    function rankFromSims(meta,nextSim){
        const futureCount=techniqueCount(nextSim?.waza);
        const futureAttack=techniqueAttack(nextSim?.waza);
        let exactTurn=3,attack=0,chain=0,continuationChain=0,followupEta=99,activationEta=99;
        let progressBoard,profile;

        if(meta.nowCount>0){
            exactTurn=1;attack=meta.nowAttack;chain=meta.sim?.res?.chain||0;
            if(nextSim){
                progressBoard=nextSim.b;profile=constructionProfile(progressBoard);
                if(futureCount>0){followupEta=1;continuationChain=nextSim?.res?.chain||0;}
                else followupEta=1+profile.primary.eta;
            }else{
                progressBoard=meta.sim.b;profile=constructionProfile(progressBoard);followupEta=profile.primary.eta;
            }
            activationEta=1;
        }else if(futureCount>0){
            exactTurn=2;attack=futureAttack;chain=nextSim?.res?.chain||0;
            progressBoard=nextSim.b;profile=constructionProfile(progressBoard);
            activationEta=2;followupEta=profile.primary.eta;
        }else{
            progressBoard=nextSim?.b||meta.sim.b;profile=constructionProfile(progressBoard);
            activationEta=(nextSim?2:1)+profile.primary.eta;
            followupEta=profile.secondary.eta;
        }

        if(!profile)profile=constructionProfile(progressBoard);
        const p=profile.primary,s=profile.secondary,t=profile.tertiary;
        const risk=boardRisk(progressBoard)*(1+Math.min(3,(meta.pressure||0)/18));
        const fallback=fallbackExactScore(meta.sim,nextSim||null,meta.next||null);
        return{
            exactTurn,activationEta,followupEta,
            chain,continuationChain,attack,risk,
            eta:p.eta,missing:p.missing,matched:p.matched,supportDebt:p.supportDebt,typeTie:p.typeTie,
            secondaryEta:s.eta,secondaryMatched:s.matched,
            tertiaryEta:t.eta,tertiaryMatched:t.matched,
            portfolioStrength:profile.portfolioStrength,
            fallback
        };
    }

    function compareRank(a,b){
        if(!b)return-1;if(!a)return 1;
        if(a.exactTurn!==b.exactTurn)return a.exactTurn-b.exactTurn;
        if(a.exactTurn<3){
            if(Math.abs(a.followupEta-b.followupEta)>1e-9)return a.followupEta-b.followupEta;
        }else if(Math.abs(a.activationEta-b.activationEta)>1e-9)return a.activationEta-b.activationEta;
        if(Math.abs(a.risk-b.risk)>1e-9)return a.risk-b.risk;
        if(a.chain!==b.chain)return b.chain-a.chain;
        if(a.continuationChain!==b.continuationChain)return b.continuationChain-a.continuationChain;
        if(Math.abs(a.eta-b.eta)>1e-9)return a.eta-b.eta;
        if(a.supportDebt!==b.supportDebt)return a.supportDebt-b.supportDebt;
        if(a.missing!==b.missing)return a.missing-b.missing;
        if(a.matched!==b.matched)return b.matched-a.matched;
        if(Math.abs(a.secondaryEta-b.secondaryEta)>1e-9)return a.secondaryEta-b.secondaryEta;
        if(a.secondaryMatched!==b.secondaryMatched)return b.secondaryMatched-a.secondaryMatched;
        if(Math.abs(a.tertiaryEta-b.tertiaryEta)>1e-9)return a.tertiaryEta-b.tertiaryEta;
        if(a.tertiaryMatched!==b.tertiaryMatched)return b.tertiaryMatched-a.tertiaryMatched;
        if(Math.abs(a.portfolioStrength-b.portfolioStrength)>1e-9)return b.portfolioStrength-a.portfolioStrength;
        if(a.attack!==b.attack)return b.attack-a.attack;
        if(a.typeTie!==b.typeTie)return b.typeTie-a.typeTie;
        if(a.fallback!==b.fallback)return b.fallback-a.fallback;
        return 0;
    }

    function createPlanner(board,colors,next,pressure=0){
        const cb=toColors(board),moves=enumerateMoves(board,colors);
        return{
            cb,moves,next:Array.isArray(next)?next.slice():null,pressure,
            moveIndex:0,current:null,candidates:[],done:false,result:null,
            simulations:0,slices:0,lastSliceSimulations:0,maxSliceSimulations:0,
            bestExactTurn:3
        };
    }

    function completeCandidate(planner,cur,rank,nextSim=null){
        planner.candidates.push({m:cur.m,index:cur.index,meta:cur.meta,rank,nextSim});
        planner.bestExactTurn=Math.min(planner.bestExactTurn,rank.exactTurn);
        planner.moveIndex=cur.index+1;planner.current=null;
    }

    function finishPlanner(planner){
        if(planner.done)return planner.result;
        if(!planner.candidates.length){planner.result=planner.moves[0]||null;planner.done=true;return planner.result;}
        const safe=planner.candidates.filter(c=>!c.meta.unsafeNow);
        const pool=safe.length?safe:planner.candidates;
        pool.sort((a,b)=>compareRank(a.rank,b.rank)||a.index-b.index);
        planner.result=pool[0].m;planner.bestRank=pool[0].rank;planner.done=true;
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
                const meta=currentMeta(sim,planner.next,planner.pressure);
                const cur={index,m,meta,nextMoves:null,nextIndex:0,bestRank:null,bestNext:null};
                planner.current=cur;
                if(meta.nowCount===0&&planner.bestExactTurn===1){
                    completeCandidate(planner,cur,rankFromSims(meta,null),null);continue;
                }
                cur.nextMoves=planner.next?enumerateMoves(sim.b,planner.next):null;
                if(!cur.nextMoves||!cur.nextMoves.length){completeCandidate(planner,cur,rankFromSims(meta,null),null);continue;}
            }else{
                const cur=planner.current;
                if(cur.nextIndex>=cur.nextMoves.length){
                    completeCandidate(planner,cur,cur.bestRank||rankFromSims(cur.meta,null),cur.bestNext);continue;
                }
                const nm=cur.nextMoves[cur.nextIndex++],ns=simulateSearch(cur.meta.sim.b,nm);
                sims++;planner.simulations++;
                if(ns){
                    const r=rankFromSims(cur.meta,ns);
                    if(compareRank(r,cur.bestRank)<0){cur.bestRank=r;cur.bestNext=ns;}
                }
                if(cur.nextIndex>=cur.nextMoves.length){
                    completeCandidate(planner,cur,cur.bestRank||rankFromSims(cur.meta,null),cur.bestNext);continue;
                }
            }
            if(sims>0&&nowMs()-start>=budgetMs)break;
        }
        planner.lastSliceSimulations=sims;
        planner.maxSliceSimulations=Math.max(planner.maxSliceSimulations,sims);
        if(!planner.done&&planner.moveIndex>=planner.moves.length&&!planner.current)finishPlanner(planner);
        return planner.done?planner.result:null;
    }

    function grandmasterMoveSync(board,colors,next,pressure=0){
        const p=createPlanner(board,colors,next,pressure);
        while(!p.done)advancePlanner(p,Infinity,1e9);
        return p.result;
    }

    function incomingPressure(g){
        let n=Math.max(0,Number(g?.incoming)||0);
        for(const type of g?.incomingShapes||[])n+=(GARBAGE_SHAPES[type]?.length||6);
        return n;
    }

    bestMove=function(board,colors,next,level,rnd=Math.random){
        level=Math.max(1,Math.min(5,Number(level)||1));
        if(level===5)return grandmasterMoveSync(board,colors,next,0);
        return baseBestMove(board,colors,next,level,rnd);
    };

    stepAI=function(g,dt){
        const ai=g?.ai;if(!ai)return;
        const level=Math.max(1,Math.min(5,Number(ai.level)||1));
        if(level!==5)return baseStepAI(g,dt);
        const P=AI_PARAMS[5];g.fastForward=false;
        if(!g.piece||g.state!=="PLAYING"){ai._grandmasterPlanner=null;return;}
        if(ai.thinkT>0){ai.thinkT-=dt;return;}
        if(!ai.target){
            if(!ai._grandmasterPlanner)ai._grandmasterPlanner=createPlanner(g.board,g.piece.colors,g.queue[0],incomingPressure(g));
            const target=advancePlanner(ai._grandmasterPlanner,SLICE_MS,SLICE_MAX_SIMULATIONS);
            ai._lastGrandmasterPlannerStats={
                slices:ai._grandmasterPlanner.slices,
                simulations:ai._grandmasterPlanner.simulations,
                lastSliceSimulations:ai._grandmasterPlanner.lastSliceSimulations,
                maxSliceSimulations:ai._grandmasterPlanner.maxSliceSimulations,
                bestExactTurn:ai._grandmasterPlanner.bestExactTurn,
                done:ai._grandmasterPlanner.done,
                rank:ai._grandmasterPlanner.bestRank||null
            };
            if(!target)return;
            ai.target=target;ai._grandmasterPlanner=null;ai.stuck=0;
        }
        const t=ai.target;ai.actT-=dt;if(ai.actT>0)return;ai.actT=P.act;
        if(g.piece.rot!==t.rot){
            const cw=(t.rot-g.piece.rot+6)%6;
            if(!rotate(g,cw<=3?1:-1)){ai.target=null;ai._grandmasterPlanner=null;ai.stuck=(ai.stuck||0)+1;ai.thinkT=Math.min(.06,P.think*.18);}
            else ai.stuck=0;
            return;
        }
        if(g.piece.x!==t.x){
            if(!move(g,g.piece.x<t.x?1:-1)){ai.target=null;ai._grandmasterPlanner=null;ai.stuck=(ai.stuck||0)+1;ai.thinkT=Math.min(.06,P.think*.18);}
            else ai.stuck=0;
            return;
        }
        ai.stuck=0;hardDrop(g);
    };

    window.__hexAiGrandmasterVersion="grandmaster-v1";
    window.__hexAiGrandmasterExpectedColorPieces=EXPECTED_COLOR_PIECES.slice();
    window.__hexAiGrandmasterConstructionProfile=constructionProfile;
    window.__hexAiGrandmasterBoardRisk=boardRisk;
    window.__hexAiGrandmasterRankFromSims=rankFromSims;
    window.__hexAiGrandmasterCompareRank=compareRank;
    window.__hexAiCreateGrandmasterPlanner=createPlanner;
    window.__hexAiAdvanceGrandmasterPlanner=advancePlanner;
    window.__hexAiGrandmasterMoveSync=grandmasterMoveSync;
    window.__hexAiGrandmasterVisibleNextOnly=true;
    window.__hexAiGrandmasterTechniqueFirst=true;
    window.__hexAiGrandmasterIncomingAware=true;
})();
