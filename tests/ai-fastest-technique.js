const fs=require("fs");
const vm=require("vm");
const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js",
  "app-07.js","app-08.js","app-09.js","app-ai-technique.js","app-ai-fastest-technique.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function blankSim(waza,board=newBoard(),chain=1){return{b:board,pre:null,res:{chain,garbage:0},waza:{HEXAGON:0,PYRAMID:0,STRAIGHT:0,...waza}};}
function meta(sim,next=null){return{sim,next,nowCount:(sim.waza.HEXAGON||0)+(sim.waza.PYRAMID||0),nowAttack:(sim.waza.HEXAGON||0)*(WAZA.HEXAGON.garbage||36)+(sim.waza.PYRAMID||0)*(WAZA.PYRAMID.garbage||24),unsafeNow:false};}
function key(m){return m&&m.x+","+m.y+","+m.rot;}
function putPattern(board,pat,ax,ay,count,color){
  for(let i=0;i<count;i++){
    const [dx,dy]=pat[i],x=ax+dx,y=ay+dy;
    expect(valid(x,y),"invalid learned-strategy fixture cell "+x+","+y);
    board[y][x]=color;
  }
}

expect(window.__hexAiFastestTechniqueVersion==="fastest-technique-v2","learned Super Strong adapter missing");
expect(window.__hexAiSuperStrongEarliestActivationFirst===true,"earliest activation marker missing");
expect(window.__hexAiSuperStrongStrengthFromDecision===true,"decision-strength marker missing");
expect(window.__hexAiSuperStrongPostTechniqueForecast===true,"post-technique forecast marker missing");
expect(window.__hexAiSuperStrongDualTechniqueSetup===true,"dual-technique setup marker missing");
expect(window.__hexAiSuperStrongChainAware===true,"chain-aware marker missing");
expect(AI_PARAMS[5].act===AI_PARAMS[4].act&&AI_PARAMS[5].think===AI_PARAMS[4].think,"Level 5 still gets strength from faster execution cadence");

// Primary objective is still absolute earliest activation.  An immediate
// PYRAMID beats a larger HEXAGON that is only available on NEXT.
const nowP=window.__hexAiFastestRankFromSims(meta(blankSim({PYRAMID:1})),null);
const nextH=window.__hexAiFastestRankFromSims(meta(blankSim({},newBoard(),0),[0,1,2]),blankSim({HEXAGON:1}));
expect(nowP.turn===1&&nextH.turn===2,"activation turn classification wrong");
expect(window.__hexAiFastestCompareRank(nowP,nextH)<0,"immediate PYRAMID must beat NEXT HEXAGON");

// If activation and continuation structure are identical, attack is still a
// valid late tie-breaker: HEXAGON outranks PYRAMID only after those ties.
const nowH=window.__hexAiFastestRankFromSims(meta(blankSim({HEXAGON:1})),null);
expect(nowH.turn===nowP.turn&&nowH.followupTurns===nowP.followupTurns,"same-turn attack fixture is not structurally tied");
expect(window.__hexAiFastestCompareRank(nowH,nowP)<0,"HEXAGON should win an otherwise identical same-turn tie");

// Learned behavior: a smaller immediate attack is preferred when its post-clear
// board reaches the next exact technique sooner.  This is the key change from
// the old attack-first tie break.
const nearFollow=newBoard();
putPattern(nearFollow,GARBAGE_SHAPES.PYRAMID,5,8,5,0);
const fastFollow=window.__hexAiFastestRankFromSims(meta(blankSim({PYRAMID:1},nearFollow,1)),null);
const slowFollow=window.__hexAiFastestRankFromSims(meta(blankSim({HEXAGON:1},newBoard(),1)),null);
expect(fastFollow.turn===1&&slowFollow.turn===1,"post-technique forecast fixture lost immediate activation");
expect(fastFollow.followupTurns<slowFollow.followupTurns,"near-complete next technique was not recognised as faster follow-up");
expect(window.__hexAiFastestCompareRank(fastFollow,slowFollow)<0,"faster follow-up must beat larger immediate attack");

// Natural clear/collapse chains are preferred after activation speed and
// follow-up speed tie.
const chain1=window.__hexAiFastestRankFromSims(meta(blankSim({PYRAMID:1},newBoard(),1)),null);
const chain2=window.__hexAiFastestRankFromSims(meta(blankSim({PYRAMID:1},newBoard(),2)),null);
expect(chain1.followupTurns===chain2.followupTurns,"chain fixture changed follow-up distance");
expect(window.__hexAiFastestCompareRank(chain2,chain1)<0,"2CHAIN line was not preferred over otherwise identical 1-chain line");

// Preserve another colour as a second technique route instead of dumping it.
// Both boards keep the same primary red route; only the dual board also prepares
// a blue route in a disjoint region.
const single=newBoard(),dual=newBoard();
putPattern(single,GARBAGE_SHAPES.PYRAMID,5,8,5,0);
putPattern(dual,GARBAGE_SHAPES.PYRAMID,5,8,5,0);
putPattern(dual,GARBAGE_SHAPES.HEXAGON,11,7,4,1);
const singleProfile=window.__hexAiFastestConstructionProfile(single);
const dualProfile=window.__hexAiFastestConstructionProfile(dual);
expect(singleProfile.primary.estimate===dualProfile.primary.estimate,"dual-route fixture changed primary completion distance");
expect(dualProfile.secondary.matched>singleProfile.secondary.matched,"second-colour route was not detected");
const singleRank=window.__hexAiFastestRankFromSims(meta(blankSim({PYRAMID:1},single,1)),null);
const dualRank=window.__hexAiFastestRankFromSims(meta(blankSim({PYRAMID:1},dual,1)),null);
expect(window.__hexAiFastestCompareRank(dualRank,singleRank)<0,"dual-colour technique setup was not preferred after equal primary timing");

// Any visible NEXT activation still beats a line that has no technique after
// both visible pieces.
const nextP=window.__hexAiFastestRankFromSims(meta(blankSim({},newBoard(),0),[0,1,2]),blankSim({PYRAMID:1}));
const none=window.__hexAiFastestRankFromSims(meta(blankSim({},newBoard(),0),[0,1,2]),blankSim({},newBoard(),0));
expect(nextP.turn===2&&none.turn>2,"NEXT technique must beat visible no-technique lines");
expect(window.__hexAiFastestCompareRank(nextP,none)<0,"NEXT technique was not prioritised over construction-only progress");

// Real board integration remains deterministic.  Different RNG values cannot
// change Level 5's chosen move.
{
  const b=newBoard(),colors=[0,1,2],next=[0,3,4];
  const a=bestMove(b,colors,next,5,()=>.01),z=bestMove(b,colors,next,5,()=>.99);
  expect(a&&z,"Super Strong returned no move on empty board");
  expect(key(a)===key(z),"learned Super Strong planner depends on RNG");
}

// Time slicing is responsiveness-only: one simulation per slice converges to
// exactly the same move as the synchronous exhaustive planner.
{
  const b=newBoard(),colors=[0,1,2],next=[0,3,4];
  const sync=window.__hexAiFastestTechniqueMoveSync(b,colors,next);
  const p=window.__hexAiCreateFastestTechniquePlanner(b,colors,next);
  let guard=0;while(!p.done&&guard++<30000)window.__hexAiAdvanceFastestTechniquePlanner(p,Infinity,1);
  expect(p.done,"time-sliced learned planner did not finish");
  expect(key(sync)===key(p.result),"time slicing changed the learned optimal move: "+JSON.stringify({sync:key(sync),sliced:key(p.result)}));
  expect(p.maxSliceSimulations<=1,"planner exceeded one-simulation test slice");
}

console.log("Super Strong learned multi-technique strategy PASS",JSON.stringify({immediateTurn:nowP.turn,nextTurn:nextH.turn,fastFollow:fastFollow.followupTurns,slowFollow:slowFollow.followupTurns,dualSecondary:dualProfile.secondary.matched,act:AI_PARAMS[5].act}));
`;

vm.runInNewContext(runtime+checks,{
 React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f},createElement(){}},
 ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
 Image:function(){this.complete=false;this.naturalWidth=0;},Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date,
 performance:{now(){return 0}},setTimeout(){return 0},clearTimeout(){},localStorage:{getItem(){return null},setItem(){}},
 document:{getElementById(){return null}},ResizeObserver:function(){this.observe=()=>{};this.disconnect=()=>{};}
},{timeout:120000});
