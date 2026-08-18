/* Incremental strong-AI search.
 *
 * Levels 4/5 use the same two-ply scoring as bestMove(), but the legacy
 * implementation evaluated the whole tree synchronously inside one 120 Hz
 * physics tick. Dense boards could therefore block a frame for ~250 ms.
 *
 * Keep the exact candidate generation and score formula, but advance the search
 * in small time slices. No physics rule, placement score, or final choice is
 * changed; only when the already-defined calculation is performed changes.
 */
const __hex70StepAIBeforeSlices=stepAI;
const HEX70_AI_SLICE_MS=3.0;
const HEX70_AI_MAX_OPS_PER_FRAME=8;

function hex70Now(){
    if(typeof performance!=="undefined"&&performance&&typeof performance.now==="function")return performance.now();
    return Date.now();
}
function hex70PlannerKey(g){
    const colors=Array.isArray(g?.piece?.colors)?g.piece.colors.join(","):"";
    const next=Array.isArray(g?.queue?.[0])?g.queue[0].join(","):"";
    return `${g?.ver||0}|${colors}|${next}`;
}
function hex70BeginPlanner(g){
    const ai=g.ai,P=AI_PARAMS[ai.level],moves=enumerateMoves(g.board,g.piece.colors);
    if(!moves.length)return{done:true,target:null};
    // Preserve bestMove()'s random branch and RNG call order exactly.
    if(g.aiRng()<P.random){
        return{done:true,target:moves[Math.floor(g.aiRng()*moves.length)]};
    }
    return{
        key:hex70PlannerKey(g),
        phase:"first",
        moves,
        cb:toColors(g.board),
        i:0,
        scored:[],
        top:null,
        topI:0,
        secondMoves:null,
        secondI:0,
        secondBest:-1e9,
        next:Array.isArray(g.queue?.[0])?g.queue[0].slice():g.queue?.[0],
        level:ai.level,
        done:false,
        target:null
    };
}
function hex70FinishFirst(planner){
    if(!planner.scored.length){
        planner.done=true;
        planner.target=planner.moves[0]||null;
        return;
    }
    planner.scored.sort((a,z)=>z.s-a.s);
    planner.top=planner.scored.slice(0,8);
    if(!planner.next||!planner.top.length){
        planner.done=true;
        planner.target=planner.scored[0].m;
        return;
    }
    planner.phase="second";
    planner.topI=0;
    planner.secondMoves=null;
    planner.secondI=0;
    planner.secondBest=-1e9;
}
function hex70FinishSecondCandidate(planner){
    const c=planner.top[planner.topI];
    c.s=c.s*.55+planner.secondBest*.45;
    planner.topI++;
    planner.secondMoves=null;
    planner.secondI=0;
    planner.secondBest=-1e9;
    if(planner.topI>=planner.top.length){
        planner.top.sort((a,z)=>z.s-a.s);
        planner.done=true;
        planner.target=planner.top[0].m;
    }
}
function hex70PlannerOp(planner){
    if(planner.done)return;
    if(planner.phase==="first"){
        if(planner.i>=planner.moves.length){hex70FinishFirst(planner);return;}
        const m=planner.moves[planner.i++],sim=simulate(planner.cb,m);
        if(sim)planner.scored.push({m,s:evalBoard(sim.b,sim.res,planner.level),b:sim.b});
        if(planner.i>=planner.moves.length)hex70FinishFirst(planner);
        return;
    }
    if(planner.phase==="second"){
        if(planner.topI>=planner.top.length){
            planner.top.sort((a,z)=>z.s-a.s);planner.done=true;planner.target=planner.top[0]?.m||null;return;
        }
        const c=planner.top[planner.topI];
        if(!planner.secondMoves){
            planner.secondMoves=enumerateMoves(c.b,planner.next);
            planner.secondI=0;
            planner.secondBest=-1e9;
            if(!planner.secondMoves.length){hex70FinishSecondCandidate(planner);return;}
        }
        const mm=planner.secondMoves[planner.secondI++],s2=simulate(c.b,mm);
        if(s2)planner.secondBest=Math.max(planner.secondBest,evalBoard(s2.b,s2.res,planner.level));
        if(planner.secondI>=planner.secondMoves.length)hex70FinishSecondCandidate(planner);
    }
}
function hex70AdvancePlanner(planner){
    const start=hex70Now();let ops=0;
    while(!planner.done&&ops<HEX70_AI_MAX_OPS_PER_FRAME){
        hex70PlannerOp(planner);ops++;
        if(hex70Now()-start>=HEX70_AI_SLICE_MS)break;
    }
}

stepAI=function(g,dt){
    const ai=g?.ai,P=ai&&AI_PARAMS[ai.level];
    if(!ai||!P||!g.piece||g.state!=="PLAYING")return;

    // Existing low-depth AIs are inexpensive and retain the original path.
    // Once a target exists, movement/rotation/drop execution also remains
    // exactly the original implementation.
    if(P.depth<1||ai.target){
        ai._hex70Planner=null;
        return __hex70StepAIBeforeSlices(g,dt);
    }
    if(ai.thinkT>0){ai.thinkT-=dt;return;}

    const key=hex70PlannerKey(g);
    if(!ai._hex70Planner||ai._hex70Planner.key!==key){
        const planner=hex70BeginPlanner(g);
        if(planner.done){
            ai._hex70Planner=null;
            if(!planner.target){hardDrop(g);return;}
            ai.target=planner.target;
            return;
        }
        ai._hex70Planner=planner;
    }

    hex70AdvancePlanner(ai._hex70Planner);
    if(ai._hex70Planner?.done){
        const target=ai._hex70Planner.target;
        ai._hex70Planner=null;
        if(!target){hardDrop(g);return;}
        ai.target=target;
        // Execute the first ordinary control action on the next physics tick so
        // the planning slice itself has a strict upper bound.
    }
};
