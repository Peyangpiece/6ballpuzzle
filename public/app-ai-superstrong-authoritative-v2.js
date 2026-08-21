/*
 * 6ball SUPER STRONG AUTHORITATIVE v2
 *
 * Rules:
 *
 * 1. Technique activation first.
 * 2. Same activation turn:
 *      HEXAGON > PYRAMID > STRAIGHT.
 * 3. Do not pursue every colour.
 * 4. Choose the most buildable technique-colour projects.
 * 5. Maximum parallel projects = 3.
 * 6. Automatically concentrate to 2 when three-way construction
 *    would endanger completion.
 * 7. Planning is sliced to protect frame rate.
 */
(function(){

    if(
        typeof window==="undefined" ||
        window.__sixBallSuperStrongAuthoritativeV2
    ){
        return;
    }

    if(
        typeof stepAI!=="function" ||
        typeof enumerateMoves!=="function" ||
        typeof resolveInstant!=="function" ||
        typeof pieceCells!=="function" ||
        typeof cloneHexGrid!=="function"
    ){
        return;
    }

    window.__sixBallSuperStrongAuthoritativeV2=true;


    const baseStepAI=stepAI;

    const TYPE_RANK={
        STRAIGHT:1,
        PYRAMID:2,
        HEXAGON:3
    };

    const CURRENT_MOVE_BEAM=36;
    const NEXT_CURRENT_BEAM=6;
    const NEXT_MOVE_BEAM=12;

    const SLICE_MS=.42;
    const MAX_SIMULATIONS_PER_SLICE=2;
    const MAX_PLANNER_FRAMES=42;


    Object.assign(
        AI_PARAMS[5],
        {
            think:.006,
            act:.012,
            random:0,
            depth:2,
            name:"超強い",
            dropMode:"hard",
            exactTechnique:true,
            strengthBasis:"focused-technique-authoritative-v2"
        }
    );


    function colorOf(v){

        if(v===null || v===undefined)
            return null;

        if(
            typeof v==="object" &&
            Number.isInteger(v.c)
        ){
            return v.c;
        }

        return v;
    }


    function colorBoard(board){

        return cloneHexGrid(
            board,
            v=>colorOf(v)
        );
    }


    function countColors(arr){

        const out=
            Array(
                COLORS.length
            ).fill(0);

        if(!Array.isArray(arr))
            return out;

        for(const c of arr){

            if(
                Number.isInteger(c) &&
                c>=0 &&
                c<out.length
            ){
                out[c]++;
            }
        }

        return out;
    }


    function boardColorCounts(board){

        const out=
            Array(
                COLORS.length
            ).fill(0);

        for(let y=0;y<ROWS;y++){

            for(let x=0;x<W2;x++){

                if(!valid(x,y))
                    continue;

                const v=
                    board[y]?.[x];

                if(
                    v===null ||
                    v===undefined
                ){
                    continue;
                }

                const c=
                    colorOf(v);

                if(
                    Number.isInteger(c) &&
                    c>=0 &&
                    c<out.length
                ){
                    out[c]++;
                }
            }
        }

        return out;
    }


    function pyramidPatterns(){

        const p=
            GARBAGE_SHAPES.PYRAMID;

        const maxY=
            Math.max(
                ...p.map(
                    ([,y])=>y
                )
            );

        return[
            p,
            p.map(
                ([x,y])=>[
                    x,
                    maxY-y
                ]
            )
        ];
    }


    function buildTechniqueTargets(){

        const out=[];
        const seen=new Set();


        function add(
            type,
            cells
        ){

            if(
                !cells.every(
                    ([x,y])=>
                        valid(x,y)
                )
            ){
                return;
            }

            const sorted=
                cells
                .map(
                    ([x,y])=>
                        x+","+y
                )
                .sort();

            const key=
                type+":"+
                sorted.join("|");

            if(seen.has(key))
                return;

            seen.add(key);

            out.push({
                type,
                cells:
                    cells.map(
                        q=>[...q]
                    ),
                cellSet:
                    new Set(sorted),
                key,
                bottom:
                    Math.max(
                        ...cells.map(
                            ([,y])=>y
                        )
                    )
            });
        }


        for(const pat of [GARBAGE_SHAPES.HEXAGON]){

            for(let ay=0;ay<ROWS;ay++){

                for(let ax=0;ax<W2;ax++){

                    add(
                        "HEXAGON",
                        pat.map(
                            ([dx,dy])=>[
                                ax+dx,
                                ay+dy
                            ]
                        )
                    );
                }
            }
        }


        for(const pat of pyramidPatterns()){

            for(let ay=0;ay<ROWS;ay++){

                for(let ax=0;ax<W2;ax++){

                    add(
                        "PYRAMID",
                        pat.map(
                            ([dx,dy])=>[
                                ax+dx,
                                ay+dy
                            ]
                        )
                    );
                }
            }
        }


        for(
            const [dx,dy]
            of [
                [2,0],
                [1,1],
                [1,-1]
            ]
        ){

            for(let y=0;y<ROWS;y++){

                for(let x=0;x<W2;x++){

                    const cells=[];

                    for(let i=0;i<6;i++){

                        cells.push([
                            x+dx*i,
                            y+dy*i
                        ]);
                    }

                    add(
                        "STRAIGHT",
                        cells
                    );
                }
            }
        }


        return out;
    }


    const TARGETS=
        buildTechniqueTargets();


    function supportDebt(
        board,
        target,
        missingCells
    ){

        let debt=0;


        for(
            const [x,y]
            of missingCells
        ){

            if(
                typeof touchesFloorRow==="function" &&
                touchesFloorRow(y)
            ){
                continue;
            }


            let supported=false;


            for(
                const [nx,ny]
                of [
                    [x-1,y+1],
                    [x+1,y+1]
                ]
            ){

                if(!valid(nx,ny))
                    continue;


                const v=
                    board[ny]?.[nx];


                if(
                    v!==null &&
                    v!==undefined
                ){

                    supported=true;
                    break;
                }


                if(
                    target.cellSet.has(
                        nx+","+ny
                    )
                ){

                    supported=true;
                    break;
                }
            }


            if(!supported)
                debt++;
        }


        return debt;
    }


    function evaluateTarget(
        board,
        target,
        color,
        currentSupply,
        nextSupply
    ){

        let matched=0;
        const missingCells=[];


        for(
            const [x,y]
            of target.cells
        ){

            const v=
                board[y]?.[x];


            if(
                v===null ||
                v===undefined
            ){

                missingCells.push([
                    x,
                    y
                ]);

                continue;
            }


            if(
                colorOf(v)!==color
            ){

                return null;
            }


            matched++;
        }


        const missing=
            6-matched;


        const debt=
            supportDebt(
                board,
                target,
                missingCells
            );


        const seedPenalty=
            matched===0
                ?1.85
                :0;


        const eta=
            missing
            +
            debt*.52
            +
            seedPenalty
            -
            matched*.18
            -
            (currentSupply[color]||0)*.42
            -
            (nextSupply[color]||0)*.26;


        return{
            color,
            type:target.type,
            target,
            matched,
            missing,
            supportDebt:debt,
            eta
        };
    }


    function betterProject(
        a,
        b
    ){

        if(!b)
            return true;

        if(!a)
            return false;


        if(
            Math.abs(
                a.eta-b.eta
            )>1e-9
        ){
            return a.eta<b.eta;
        }


        if(
            TYPE_RANK[a.type] !==
            TYPE_RANK[b.type]
        ){

            return(
                TYPE_RANK[a.type] >
                TYPE_RANK[b.type]
            );
        }


        if(
            a.matched !==
            b.matched
        ){

            return(
                a.matched >
                b.matched
            );
        }


        if(
            a.supportDebt !==
            b.supportDebt
        ){

            return(
                a.supportDebt <
                b.supportDebt
            );
        }


        return(
            a.target.bottom >
            b.target.bottom
        );
    }


    function bestProjectForColor(
        board,
        color,
        currentSupply,
        nextSupply
    ){

        let best=null;


        for(const target of TARGETS){

            const p=
                evaluateTarget(
                    board,
                    target,
                    color,
                    currentSupply,
                    nextSupply
                );


            if(
                p &&
                betterProject(
                    p,
                    best
                )
            ){

                best=p;
            }
        }


        return best;
    }


    function selectProjects(
        board,
        currentColors,
        nextColors
    ){

        const currentSupply=
            countColors(
                currentColors
            );

        const nextSupply=
            countColors(
                nextColors
            );

        const boardCounts=
            boardColorCounts(
                board
            );


        const candidates=[];


        for(
            let color=0;
            color<COLORS.length;
            color++
        ){

            const best=
                bestProjectForColor(
                    board,
                    color,
                    currentSupply,
                    nextSupply
                );


            if(!best)
                continue;


            const cost=
                best.eta
                -
                Math.min(
                    6,
                    boardCounts[color]
                )*.055;


            candidates.push({
                ...best,
                cost,
                boardCount:
                    boardCounts[color],
                currentSupply:
                    currentSupply[color]||0,
                nextSupply:
                    nextSupply[color]||0
            });
        }


        candidates.sort(
            (a,b)=>
                a.cost-b.cost
                ||
                TYPE_RANK[b.type]-
                TYPE_RANK[a.type]
                ||
                b.matched-a.matched
        );


        let limit=
            Math.min(
                3,
                candidates.length
            );

        let reason=
            "three-way-viable";


        if(limit>=3){

            const a=candidates[0];
            const b=candidates[1];
            const c=candidates[2];


            let height=0;

            if(
                typeof heightOf==="function"
            ){

                height=
                    heightOf(board);
            }


            const boardDanger=
                height>=ROWS-4;


            const primaryNearCompletion=
                a.missing<=2;


            const thirdMuchWorse=
                c.cost >
                b.cost+1.15
                ||
                c.cost >
                a.cost+1.8;


            const supplyConcentrated=
                c.currentSupply+
                c.nextSupply===0
                &&
                (
                    a.currentSupply+
                    a.nextSupply+
                    b.currentSupply+
                    b.nextSupply
                )>=2;


            const completionCompetition=
                (
                    a.missing+
                    b.missing
                )<=6
                &&
                c.missing>=4;


            if(
                boardDanger ||
                primaryNearCompletion ||
                thirdMuchWorse ||
                supplyConcentrated ||
                completionCompetition
            ){

                limit=2;


                if(boardDanger)
                    reason="board-danger";

                else if(primaryNearCompletion)
                    reason="primary-near-completion";

                else if(thirdMuchWorse)
                    reason="third-project-too-slow";

                else if(supplyConcentrated)
                    reason="known-colour-supply-concentrated";

                else
                    reason="protect-two-project-completion";
            }
        }


        const projects=
            candidates
            .slice(
                0,
                limit
            )
            .map(
                p=>({
                    color:p.color,
                    type:p.type,
                    target:p.target,
                    initial:p
                })
            );


        return{
            limit,
            reason,
            projects,
            candidates
        };
    }


    function evaluateFixedProject(
        board,
        project,
        knownNext
    ){

        const zero=
            Array(
                COLORS.length
            ).fill(0);

        const next=
            countColors(
                knownNext
            );


        const p=
            evaluateTarget(
                board,
                project.target,
                project.color,
                zero,
                next
            );


        if(!p){

            return{
                color:project.color,
                type:project.type,
                matched:0,
                missing:6,
                supportDebt:9,
                eta:99,
                blocked:true
            };
        }


        return{
            ...p,
            blocked:false
        };
    }


    function portfolioMetrics(
        board,
        projects,
        knownNext=null
    ){

        const list=
            projects.map(
                p=>
                    evaluateFixedProject(
                        board,
                        p,
                        knownNext
                    )
            );


        const sorted=
            [...list]
            .sort(
                (a,b)=>
                    a.eta-b.eta
                    ||
                    TYPE_RANK[b.type]-
                    TYPE_RANK[a.type]
                    ||
                    b.matched-a.matched
            );


        const weights=[
            1,
            .34,
            .14
        ];


        let weighted=0;
        let impossible=0;


        for(let i=0;i<list.length;i++){

            weighted+=
                list[i].eta*
                (
                    weights[i]||
                    .08
                );


            if(
                list[i].blocked ||
                list[i].eta>=90
            ){

                impossible++;
            }
        }


        return{
            list,
            sorted,
            primary:
                sorted[0]||
                {
                    eta:99,
                    matched:0,
                    missing:6,
                    supportDebt:9,
                    type:"STRAIGHT"
                },
            weighted,
            impossible
        };
    }


    function boardRisk(board){

        let top=ROWS;
        let topLoad=0;
        let count=0;


        for(let y=0;y<ROWS;y++){

            for(let x=0;x<W2;x++){

                if(!valid(x,y))
                    continue;


                const v=
                    board[y]?.[x];


                if(
                    v===null ||
                    v===undefined
                ){
                    continue;
                }


                count++;

                if(y<top)
                    top=y;

                if(y<=2)
                    topLoad+=3-y;
            }
        }


        if(!count)
            return 0;


        return(
            topLoad*8
            +
            Math.max(
                0,
                5-top
            )*3
            +
            count*.02
        );
    }


    function detectTechniques(board){

        const out=[];


        for(
            const group
            of findGroups(board)
        ){

            const type=
                classify(
                    group.cells
                );


            if(!type)
                continue;


            let color=
                group.color;


            if(
                color===undefined &&
                group.cells.length
            ){

                const [x,y]=
                    group.cells[0];

                color=
                    colorOf(
                        board[y]?.[x]
                    );
            }


            out.push({
                type,
                color,
                rank:
                    TYPE_RANK[type]||0
            });
        }


        return out;
    }


    function bestTechnique(list){

        if(
            !Array.isArray(list) ||
            !list.length
        ){
            return null;
        }


        return[
            ...list
        ].sort(
            (a,b)=>
                b.rank-a.rank
        )[0];
    }


    function simulateSearch(
        colorBoardSource,
        move
    ){

        const board=
            cloneHexGrid(
                colorBoardSource,
                v=>v
            );


        for(
            const [x,y,c]
            of pieceCells(move)
        ){

            if(
                y<0 ||
                !valid(x,y) ||
                (
                    board[y][x]!==null &&
                    board[y][x]!==undefined
                )
            ){

                return null;
            }


            board[y][x]=c;
        }


        if(
            typeof settleAll==="function"
        ){

            settleAll(board);
        }


        const techniques=
            detectTechniques(
                board
            );


        const res=
            resolveInstant(
                board
            );


        return{
            b:board,
            res,
            techniques,
            bestTechnique:
                bestTechnique(
                    techniques
                )
        };
    }


    function cheapMoveScore(
        move,
        projects
    ){

        const focus=
            new Set(
                projects.map(
                    p=>p.color
                )
            );


        const targetByColor=
            new Map(
                projects.map(
                    p=>[
                        p.color,
                        p
                    ]
                )
            );


        let score=0;


        for(
            const [x,y,c]
            of pieceCells(move)
        ){

            if(focus.has(c))
                score+=2.2;

            else
                score-=.2;


            const p=
                targetByColor.get(c);


            if(
                p &&
                p.target.cellSet.has(
                    x+","+y
                )
            ){

                score+=
                    13+
                    TYPE_RANK[p.type]*.8;
            }


            score+=
                Math.max(
                    0,
                    y
                )*.018;
        }


        return score;
    }


    function prepareMoves(
        board,
        colors,
        projects,
        beam
    ){

        const moves=
            enumerateMoves(
                board,
                colors
            );


        return moves
            .map(
                (m,index)=>({
                    m,
                    index,
                    cheap:
                        cheapMoveScore(
                            m,
                            projects
                        )
                })
            )
            .sort(
                (a,b)=>
                    b.cheap-a.cheap
                    ||
                    a.index-b.index
            )
            .slice(
                0,
                beam
            );
    }


    function makeRank(
        turn,
        technique,
        metrics,
        sim,
        index
    ){

        return{
            turn,
            techRank:
                technique?.rank||0,
            techType:
                technique?.type||null,
            metrics,
            risk:
                boardRisk(
                    sim.b
                ),
            chain:
                sim.res?.chain||0,
            index
        };
    }


    function compareRank(
        a,
        b
    ){

        if(!b)
            return -1;

        if(!a)
            return 1;


        if(
            a.turn !==
            b.turn
        ){

            return(
                a.turn-
                b.turn
            );
        }


        if(
            a.turn<=2 &&
            a.techRank !==
            b.techRank
        ){

            return(
                b.techRank-
                a.techRank
            );
        }


        if(
            a.metrics.impossible !==
            b.metrics.impossible
        ){

            return(
                a.metrics.impossible-
                b.metrics.impossible
            );
        }


        if(
            Math.abs(
                a.metrics.primary.eta-
                b.metrics.primary.eta
            )>1e-9
        ){

            return(
                a.metrics.primary.eta-
                b.metrics.primary.eta
            );
        }


        if(
            Math.abs(
                a.metrics.weighted-
                b.metrics.weighted
            )>1e-9
        ){

            return(
                a.metrics.weighted-
                b.metrics.weighted
            );
        }


        if(
            TYPE_RANK[
                a.metrics.primary.type
            ] !==
            TYPE_RANK[
                b.metrics.primary.type
            ]
        ){

            return(
                TYPE_RANK[
                    b.metrics.primary.type
                ]-
                TYPE_RANK[
                    a.metrics.primary.type
                ]
            );
        }


        if(
            a.metrics.primary.matched !==
            b.metrics.primary.matched
        ){

            return(
                b.metrics.primary.matched-
                a.metrics.primary.matched
            );
        }


        if(
            a.metrics.primary.supportDebt !==
            b.metrics.primary.supportDebt
        ){

            return(
                a.metrics.primary.supportDebt-
                b.metrics.primary.supportDebt
            );
        }


        if(
            Math.abs(
                a.risk-
                b.risk
            )>1e-9
        ){

            return(
                a.risk-
                b.risk
            );
        }


        if(
            a.chain !==
            b.chain
        ){

            return(
                b.chain-
                a.chain
            );
        }


        return(
            a.index-
            b.index
        );
    }


    function nowMs(){

        return(
            typeof performance!=="undefined" &&
            typeof performance.now==="function"
        )
            ?performance.now()
            :Date.now();
    }


    function createPlanner(
        board,
        colors,
        next
    ){

        const cb=
            colorBoard(
                board
            );


        const focus=
            selectProjects(
                cb,
                colors,
                next
            );


        const moveEntries=
            prepareMoves(
                board,
                colors,
                focus.projects,
                CURRENT_MOVE_BEAM
            );


        return{
            cb,
            colors:
                [...colors],
            next:
                Array.isArray(next)
                    ?[...next]
                    :null,
            focus,
            moves:
                moveEntries,
            currentIndex:0,
            candidates:[],
            stage:"CURRENT",
            nextPool:null,
            nextCurrentIndex:0,
            activeNext:null,
            done:false,
            result:null,
            bestRank:null,
            simulations:0,
            slices:0,
            frames:0
        };
    }


    function finishWithCandidate(
        planner,
        candidate,
        rank
    ){

        planner.done=true;

        planner.result=
            candidate?.entry?.m
            ||
            planner.moves[0]?.m
            ||
            null;

        planner.bestRank=
            rank||
            candidate?.rank||
            null;

        return planner.result;
    }


    function bestCurrentCandidate(
        planner
    ){

        let best=null;


        for(
            const c
            of planner.candidates
        ){

            if(
                !best ||
                compareRank(
                    c.rank,
                    best.rank
                )<0
            ){

                best=c;
            }
        }


        return best;
    }


    function finishAvailable(
        planner
    ){

        let best=null;
        let bestRank=null;


        for(
            const c
            of planner.candidates
        ){

            const rank=
                c.bestFuture?.rank
                ||
                c.rank;


            if(
                !best ||
                compareRank(
                    rank,
                    bestRank
                )<0
            ){

                best=c;
                bestRank=rank;
            }
        }


        return finishWithCandidate(
            planner,
            best,
            bestRank
        );
    }


    function beginNextStage(
        planner
    ){

        const immediate=
            planner.candidates
            .filter(
                c=>c.rank.turn===1
            )
            .sort(
                (a,b)=>
                    compareRank(
                        a.rank,
                        b.rank
                    )
            );


        if(immediate.length){

            finishWithCandidate(
                planner,
                immediate[0],
                immediate[0].rank
            );

            return;
        }


        planner.nextPool=
            [...planner.candidates]
            .sort(
                (a,b)=>
                    compareRank(
                        a.rank,
                        b.rank
                    )
            )
            .slice(
                0,
                NEXT_CURRENT_BEAM
            );


        if(
            !planner.next ||
            !planner.nextPool.length
        ){

            finishAvailable(
                planner
            );

            return;
        }


        planner.stage="NEXT";
    }


    function advancePlanner(
        planner,
        budgetMs=SLICE_MS,
        maxSimulations=MAX_SIMULATIONS_PER_SLICE
    ){

        if(
            !planner ||
            planner.done
        ){

            return planner?.result||null;
        }


        const start=
            nowMs();

        let sims=0;

        planner.slices++;


        while(
            !planner.done &&
            sims<maxSimulations
        ){

            if(planner.stage==="CURRENT"){

                if(
                    planner.currentIndex >=
                    planner.moves.length
                ){

                    beginNextStage(
                        planner
                    );

                    continue;
                }


                const entry=
                    planner.moves[
                        planner.currentIndex++
                    ];


                const sim=
                    simulateSearch(
                        planner.cb,
                        entry.m
                    );


                sims++;
                planner.simulations++;


                if(!sim)
                    continue;


                const metrics=
                    portfolioMetrics(
                        sim.b,
                        planner.focus.projects,
                        planner.next
                    );


                const technique=
                    sim.bestTechnique;


                const rank=
                    makeRank(
                        technique?1:3,
                        technique,
                        metrics,
                        sim,
                        entry.index
                    );


                planner.candidates.push({
                    entry,
                    sim,
                    rank,
                    bestFuture:null
                });
            }


            else if(planner.stage==="NEXT"){

                if(
                    planner.nextCurrentIndex >=
                    planner.nextPool.length
                ){

                    finishAvailable(
                        planner
                    );

                    continue;
                }


                if(!planner.activeNext){

                    const current=
                        planner.nextPool[
                            planner.nextCurrentIndex
                        ];


                    const moves=
                        prepareMoves(
                            current.sim.b,
                            planner.next,
                            planner.focus.projects,
                            NEXT_MOVE_BEAM
                        );


                    planner.activeNext={
                        current,
                        moves,
                        index:0
                    };
                }


                const active=
                    planner.activeNext;


                if(
                    active.index >=
                    active.moves.length
                ){

                    planner.activeNext=null;
                    planner.nextCurrentIndex++;

                    continue;
                }


                const nextEntry=
                    active.moves[
                        active.index++
                    ];


                const sim=
                    simulateSearch(
                        active.current.sim.b,
                        nextEntry.m
                    );


                sims++;
                planner.simulations++;


                if(!sim)
                    continue;


                const metrics=
                    portfolioMetrics(
                        sim.b,
                        planner.focus.projects,
                        null
                    );


                const technique=
                    sim.bestTechnique;


                const rank=
                    makeRank(
                        technique?2:3,
                        technique,
                        metrics,
                        sim,
                        active.current.entry.index
                    );


                if(
                    !active.current.bestFuture ||
                    compareRank(
                        rank,
                        active.current.bestFuture.rank
                    )<0
                ){

                    active.current.bestFuture={
                        rank,
                        sim,
                        move:nextEntry.m
                    };
                }
            }


            if(
                sims>0 &&
                nowMs()-start>=budgetMs
            ){

                break;
            }
        }


        return(
            planner.done
                ?planner.result
                :null
        );
    }


    function sceneBusy(
        current
    ){

        try{

            if(
                typeof engines!=="undefined" &&
                engines &&
                typeof engines[
                    Symbol.iterator
                ]==="function"
            ){

                for(const g of engines){

                    const moving=
                        g?._visualMovingIds instanceof Set
                            ?g._visualMovingIds.size
                            :0;


                    if(moving>=4)
                        return true;


                    if(
                        g?.state==="RESOLVING" &&
                        (
                            g.phase==="CLEAR" ||
                            g.phase==="GARBAGE"
                        )
                    ){
                        return true;
                    }
                }
            }

        }catch(e){}


        const moving=
            current?._visualMovingIds instanceof Set
                ?current._visualMovingIds.size
                :0;


        return moving>=4;
    }


    function decisionKey(g){

        const now=
            Array.isArray(
                g.piece?.colors
            )
                ?g.piece.colors.join(",")
                :"";

        const next=
            Array.isArray(
                g.queue?.[0]
            )
                ?g.queue[0].join(",")
                :"";


        return[
            Number(g.ver)||0,
            now,
            next
        ].join("|");
    }


    stepAI=
        function(g,dt){

            const ai=
                g?.ai;


            if(!ai)
                return;


            const level=
                Math.max(
                    1,
                    Math.min(
                        5,
                        Number(ai.level)||1
                    )
                );


            if(level!==5){

                return baseStepAI(
                    g,
                    dt
                );
            }


            g.fastForward=false;


            if(
                !g.piece ||
                g.state!=="PLAYING"
            ){

                ai._focusedPlannerV2=null;
                ai.target=null;

                return;
            }


            if(ai.thinkT>0){

                ai.thinkT-=dt;

                return;
            }


            const key=
                decisionKey(g);


            if(!ai.target){

                if(
                    ai._focusedDecisionKey===key &&
                    ai._focusedDecisionTarget
                ){

                    ai.target={
                        ...ai._focusedDecisionTarget
                    };
                }


                else{

                    if(
                        !ai._focusedPlannerV2 ||
                        ai._focusedPlannerKey!==key
                    ){

                        ai._focusedPlannerV2=
                            createPlanner(
                                g.board,
                                g.piece.colors,
                                g.queue[0]
                            );


                        ai._focusedPlannerKey=
                            key;


                        const f=
                            ai._focusedPlannerV2.focus;


                        ai._lastSuperStrongFocus={
                            limit:f.limit,
                            reason:f.reason,
                            projects:
                                f.projects.map(
                                    p=>({
                                        color:p.color,
                                        type:p.type,
                                        matched:
                                            p.initial.matched,
                                        missing:
                                            p.initial.missing,
                                        eta:
                                            p.initial.eta,
                                        target:
                                            p.target.cells.map(
                                                q=>[...q]
                                            )
                                    })
                                )
                        };
                    }


                    const planner=
                        ai._focusedPlannerV2;


                    planner.frames++;


                    if(
                        !sceneBusy(g)
                    ){

                        advancePlanner(
                            planner,
                            SLICE_MS,
                            MAX_SIMULATIONS_PER_SLICE
                        );
                    }


                    if(
                        !planner.done &&
                        planner.frames>=MAX_PLANNER_FRAMES
                    ){

                        finishAvailable(
                            planner
                        );
                    }


                    ai._lastFocusedPlannerStats={
                        frames:
                            planner.frames,
                        slices:
                            planner.slices,
                        simulations:
                            planner.simulations,
                        stage:
                            planner.stage,
                        done:
                            planner.done,
                        focusLimit:
                            planner.focus.limit,
                        focusReason:
                            planner.focus.reason
                    };


                    if(!planner.done)
                        return;


                    ai.target=
                        planner.result;


                    ai._focusedDecisionKey=
                        key;


                    ai._focusedDecisionTarget=
                        ai.target
                            ?{
                                ...ai.target
                             }
                            :null;


                    ai._lastSuperStrongDecision={
                        target:
                            ai.target
                                ?{
                                    x:ai.target.x,
                                    rot:ai.target.rot
                                 }
                                :null,
                        rank:
                            planner.bestRank,
                        focus:
                            ai._lastSuperStrongFocus
                    };


                    ai._focusedPlannerV2=null;
                    ai.stuck=0;
                }
            }


            if(!ai.target){

                hardDrop(g);
                return;
            }


            const P=
                AI_PARAMS[5];


            ai.actT-=dt;


            if(ai.actT>0)
                return;


            ai.actT=
                P.act;


            const t=
                ai.target;


            if(
                g.piece.rot!==
                t.rot
            ){

                const cw=
                    (
                        t.rot-
                        g.piece.rot+
                        6
                    )%6;


                if(
                    !rotate(
                        g,
                        cw<=3
                            ?1
                            :-1
                    )
                ){

                    ai.target=null;
                    ai._focusedPlannerV2=null;
                    ai._focusedDecisionTarget=null;
                    ai._focusedDecisionKey=null;
                    ai.stuck=
                        (ai.stuck||0)+1;
                    ai.thinkT=.01;
                }
                else{

                    ai.stuck=0;
                }


                return;
            }


            if(
                g.piece.x!==
                t.x
            ){

                if(
                    !move(
                        g,
                        g.piece.x<t.x
                            ?1
                            :-1
                    )
                ){

                    ai.target=null;
                    ai._focusedPlannerV2=null;
                    ai._focusedDecisionTarget=null;
                    ai._focusedDecisionKey=null;
                    ai.stuck=
                        (ai.stuck||0)+1;
                    ai.thinkT=.01;
                }
                else{

                    ai.stuck=0;
                }


                return;
            }


            ai.stuck=0;

            hardDrop(g);
        };


    window.__sixBallSuperStrongVersion=
        "superstrong-authoritative-v2-focused-projects";

    window.__sixBallSuperStrongMaximumParallelTechniques=
        3;

    window.__sixBallSuperStrongMayConcentrateToTwo=
        true;

    window.__sixBallSuperStrongUsesAllColors=
        false;

    window.__sixBallSuperStrongTechniquePriority=[
        "ACTIVATE_EARLIEST",
        "HEXAGON",
        "PYRAMID",
        "STRAIGHT"
    ];

    window.__sixBallSuperStrongFrameSimulationLimit=
        MAX_SIMULATIONS_PER_SLICE;

    window.__sixBallSuperStrongFocusSelector=
        selectProjects;

    window.__sixBallSuperStrongCreatePlanner=
        createPlanner;

    window.__sixBallSuperStrongAdvancePlanner=
        advancePlanner;

})();
