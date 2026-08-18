/* Technique-aware CPU difficulty.
 *
 * Difficulty is no longer just random-error + search depth. Higher levels
 * increasingly understand the actual PYRAMID / HEXAGON geometry used by the
 * game and value moves by how much they reduce the remaining construction
 * distance. Level 5 is deterministic and evaluates the current set together
 * with NEXT, prioritising HEXAGON then PYRAMID while still respecting survival.
 */
(function installTechniqueAwareCpu(){
    if(typeof window==="undefined"||window.__hexTechniqueAwareCpu)return;
    window.__hexTechniqueAwareCpu=true;

    Object.assign(AI_PARAMS[1],{think:.95,act:.30,random:.82,depth:0,name:"超弱い",technique:0,beam:0});
    Object.assign(AI_PARAMS[2],{think:.72,act:.22,random:.45,depth:0,name:"弱い",technique:.10,beam:0});
    Object.assign(AI_PARAMS[3],{think:.50,act:.16,random:.15,depth:0,name:"普通",technique:.36,beam:0});
    Object.assign(AI_PARAMS[4],{think:.31,act:.11,random:.03,depth:1,name:"強い",technique:.92,beam:8});
    Object.assign(AI_PARAMS[5],{think:.18,act:.08,random:0,depth:1,name:"超強い",technique:1.65,beam:10});

    const legacyEvalBoard=evalBoard;
    const MATCH_VALUE=[0,1.5,7,28,92,300,1100];
    const TYPE_VALUE={PYRAMID:1,HEXAGON:1.30};
    const LEVEL_TECH_SCALE={1:0,2:.10,3:.36,4:.92,5:1.65};

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
        if(scale<=0)return {score:0,best:null};
        let bestScore=0,secondScore=0,best=null;
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
            if(level>=4&&color!==null&&Array.isArray(availableColors)){
                const avail=availableColors.reduce((n,c)=>n+(c===color?1:0),0);
                value*=1+avail*(level===5?.10:.06);
            }
            if(value>bestScore){secondScore=bestScore;bestScore=value;best={type:pl.type,color,matched:occupied,cells:pl.cells};}
            else if(value>secondScore)secondScore=value;
        }
        return {score:(bestScore+secondScore*.18)*scale,best};
    }

    function immediateWaza(board){
        const out={HEXAGON:0,PYRAMID:0,STRAIGHT:0};
        for(const grp of findGroups(board)){
            const w=classify(grp.cells);
            if(w)out[w]=(out[w]||0)+1;
        }
        return out;
    }

    function simulateDetailed(cb,p){
        const settled=cloneHexGrid(cb,v=>v);
        for(const [x,y,c] of pieceCells(p)){
            if(y<0||!valid(x,y)||settled[y][x]!==null)return null;
            settled[y][x]=c;
        }
        settleAll(settled);
        const preClear=cloneHexGrid(settled,v=>v);
        const waza=immediateWaza(preClear);
        const after=cloneHexGrid(settled,v=>v);
        const res=resolveInstant(after);
        return {b:after,pre:preClear,res,waza};
    }

    function wazaBonus(waza,level){
        if(level<=2)return 0;
        const k=level===3?.35:level===4?.72:1;
        return k*((waza.HEXAGON||0)*2300+(waza.PYRAMID||0)*1450+(waza.STRAIGHT||0)*260);
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
            if(after.best.matched===5)score+=(after.best.type==="HEXAGON"?420:300)*(level===5?1.35:1);
            else if(after.best.matched===4)score+=(after.best.type==="HEXAGON"?105:80)*(level===5?1.2:1);
        }
        return score;
    }

    window.__hexAiTechniquePotential=(board,level=5,next=null)=>techniquePotential(board,level,next);
    window.__hexAiSimulateDetailed=simulateDetailed;

    evalBoard=function(b,res,level,rnd=Math.random){
        const base=legacyEvalBoard(b,res,level,rnd);
        if(level<=1)return base;
        return base+techniquePotential(b,level,null).score*.64;
    };

    bestMove=function(board,colors,next,level,rnd=Math.random){
        level=Math.max(1,Math.min(5,Number(level)||1));
        const P=AI_PARAMS[level];
        const moves=enumerateMoves(board,colors);
        if(!moves.length)return null;
        if(rnd()<P.random)return moves[Math.floor(rnd()*moves.length)];

        const cb=toColors(board);
        const beforePotential=techniquePotential(cb,level,colors).score;
        const scored=[];
        for(const m of moves){
            const sim=simulateDetailed(cb,m);
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
                    const s2=simulateDetailed(c.b,mm);
                    if(!s2)continue;
                    future=Math.max(future,scoreDetailed(s2,level,nextBefore,null,rnd));
                }
                if(future>-1e11){
                    const nowW=level===5?.36:.55;
                    c.s=c.s*nowW+future*(1-nowW);
                }
            }
            top.sort((a,z)=>z.s-a.s);
            return top[0].m;
        }
        return scored[0].m;
    };
})();
