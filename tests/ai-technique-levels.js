const fs=require("fs");
const vm=require("vm");
const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js",
  "app-07.js","app-08.js","app-09.js","app-ai-technique.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function putPattern(board,pat,ax,ay,count,color=0){
  for(let i=0;i<count;i++){
    const [dx,dy]=pat[i],x=ax+dx,y=ay+dy;
    expect(valid(x,y),"invalid technique fixture cell "+x+","+y);
    board[y][x]=color;
  }
}
function moveKey(m){return m.x+","+m.y+","+m.rot;}

expect(window.__hexAiDifficultyProfileVersion==="ai-difficulty-v4-perf","precise CPU performance profile was not installed");
expect(AI_PARAMS[1].name==="超よわい"&&AI_PARAMS[2].name==="よわい"&&AI_PARAMS[3].name==="普通"&&AI_PARAMS[4].name==="強い"&&AI_PARAMS[5].name==="超強い","CPU labels mismatch");
expect(AI_PARAMS[1].random>AI_PARAMS[2].random&&AI_PARAMS[2].random>AI_PARAMS[3].random&&AI_PARAMS[3].random>AI_PARAMS[4].random&&AI_PARAMS[4].random>AI_PARAMS[5].random,"random error is not staged downward");
expect(AI_PARAMS[5].random===0&&AI_PARAMS[5].exactTechnique===true,"Super Strong is not deterministic exact-technique mode");
expect(AI_PARAMS[1].technique<AI_PARAMS[2].technique&&AI_PARAMS[2].technique<AI_PARAMS[3].technique&&AI_PARAMS[3].technique<AI_PARAMS[4].technique&&AI_PARAMS[4].technique<AI_PARAMS[5].technique,"technique understanding is not staged upward");
expect(AI_PARAMS[1].dropMode==="fast"&&AI_PARAMS[2].dropMode==="fast","lowest CPU levels must be fast-fall only");
expect(AI_PARAMS[3].dropMode==="hard"&&AI_PARAMS[4].dropMode==="hard"&&AI_PARAMS[5].dropMode==="hard","upper CPU levels lost instant drop");
expect(AI_PARAMS[4].depth===1&&AI_PARAMS[4].beam===12&&AI_PARAMS[5].depth===1&&AI_PARAMS[5].beam===0,"lookahead tiers mismatch");
expect(window.__hexAiLowLevelsUseFastFallOnly===true&&window.__hexAiSuperStrongExactTechnique===true&&window.__hexAiSuperStrongExhaustiveNext===true,"CPU behavior markers missing");
expect(window.__hexAiSuperStrongTimeSliced===true&&window.__hexAiInternalSimulationSingleClone===true&&window.__hexAiExactCurrentMetaReuse===true,"CPU performance guards missing");
expect(window.__hexAiExactSliceMaxSimulations===40,"unexpected exact-search slice cap");

const hex=GARBAGE_SHAPES.HEXAGON;
const h3=newBoard(),h4=newBoard(),h5=newBoard();
putPattern(h3,hex,4,4,3,0);putPattern(h4,hex,4,4,4,0);putPattern(h5,hex,4,4,5,0);
const hs3=window.__hexAiTechniquePotential(h3,5,[0,1,2]);
const hs4=window.__hexAiTechniquePotential(h4,5,[0,1,2]);
const hs5=window.__hexAiTechniquePotential(h5,5,[0,1,2]);
expect(hs3.score<hs4.score&&hs4.score<hs5.score,"HEXAGON progress is not monotone: "+JSON.stringify({hs3,hs4,hs5}));
expect(hs5.best?.type==="HEXAGON"&&hs5.best?.matched===5,"five-of-six HEXAGON was not recognised as primary target");

const h3Level=window.__hexAiTechniquePotential(h5,3,[0,1,2]).score;
const h4Level=window.__hexAiTechniquePotential(h5,4,[0,1,2]).score;
const h5Level=window.__hexAiTechniquePotential(h5,5,[0,1,2]).score;
expect(h3Level<h4Level&&h4Level<h5Level,"CPU levels do not progressively value technique completion");

const pyr=GARBAGE_SHAPES.PYRAMID;
const p5=newBoard();putPattern(p5,pyr,5,4,5,0);
const ps5=window.__hexAiTechniquePotential(p5,5,[0,1,2]);
expect(ps5.best?.type==="PYRAMID"&&ps5.best?.matched===5,"five-of-six PYRAMID was not recognised");
expect(hs5.score>ps5.score,"Super Strong did not prefer equivalent HEXAGON progress");

// Exact objective gives actual technique production strict priority.
{
  const b=newBoard(),res={chain:0,garbage:0};
  const none={b:cloneHexGrid(b,v=>v),res,waza:{HEXAGON:0,PYRAMID:0,STRAIGHT:0}};
  const py={b:cloneHexGrid(b,v=>v),res,waza:{HEXAGON:0,PYRAMID:1,STRAIGHT:0}};
  const hx={b:cloneHexGrid(b,v=>v),res,waza:{HEXAGON:1,PYRAMID:0,STRAIGHT:0}};
  const s0=window.__hexAiExactTechniqueScore(none,null,null),sp=window.__hexAiExactTechniqueScore(py,null,null),sh=window.__hexAiExactTechniqueScore(hx,null,null);
  expect(s0<sp&&sp<sh,"exact technique objective does not rank NONE < PYRAMID < HEXAGON");
}

// With NEXT unknown, bestMove must choose the globally highest exact-technique
// score across ALL legal current placements; no random or beam shortcut is allowed.
{
  const b=newBoard(),colors=[0,1,2],cb=toColors(b),moves=enumerateMoves(b,colors);
  let best=-Infinity,keys=new Set();
  for(const m of moves){
    const sim=window.__hexAiSimulateDetailed(cb,m);if(!sim)continue;
    const s=window.__hexAiExactTechniqueScore(sim,null,null),k=moveKey(m);
    if(s>best+1e-9){best=s;keys=new Set([k]);}
    else if(Math.abs(s-best)<=1e-9)keys.add(k);
  }
  const chosen=bestMove(b,colors,null,5,()=>.999);
  expect(chosen&&keys.has(moveKey(chosen)),"Super Strong did not choose the globally best current exact-technique score: "+JSON.stringify({best,chosen,keys:[...keys]}));
}

// Synchronous and sliced exhaustive search must be result-identical. The sliced
// planner is deliberately advanced seven simulations at a time to prove that
// yielding between chunks cannot alter search order, ties or the final move.
{
  const empty=newBoard(),colors=[0,1,2],next=[0,3,4];
  const sync=bestMove(empty,colors,next,5,()=>.73);
  const planner=window.__hexAiCreateExactPlanner(empty,colors,next);
  let calls=0;
  while(!planner.done&&calls<5000){window.__hexAiAdvanceExactPlanner(planner,Infinity,7);calls++;}
  expect(planner.done&&planner.result,"time-sliced exact planner did not finish");
  expect(calls>1&&planner.maxSliceSimulations<=7,"exact planner did not respect the requested work slice");
  expect(moveKey(sync)===moveKey(planner.result),"time-sliced exact planner changed the Super Strong optimum: "+JSON.stringify({sync,chunked:planner.result,calls}));
}

// Level 5 remains deterministic and legal with exhaustive NEXT search.
{
  const empty=newBoard(),colors=[0,1,2],next=[0,3,4];
  const m1=bestMove(empty,colors,next,5,()=>.01);
  const m2=bestMove(empty,colors,next,5,()=>.99);
  expect(m1&&m2,"Super Strong returned no move on an empty board");
  expect(m1.x===m2.x&&m1.rot===m2.rot&&m1.y===m2.y,"Super Strong changed with RNG despite zero-random exact mode");
  expect(pieceFits(empty,{x:m1.x,y:-2,rot:m1.rot,colors}),"Super Strong selected an unreachable spawn orientation");
}

// Live Super Strong planning must yield instead of synchronously consuming the
// entire exhaustive tree on the first game tick.
{
  const g=createEngine(7555);spawn(g);
  g.ai={level:5,target:null,thinkT:0,actT:0,stuck:0};
  stepAI(g,PHYSICS_FRAME);
  expect(g.state==="PLAYING"&&g.piece,"live exact planner altered the active piece while still thinking");
  expect(!g.ai.target&&g.ai._exactPlanner,"live exact planner finished the full tree in one blocking tick");
  expect((g.ai._lastExactPlannerStats?.lastSliceSimulations||0)<=window.__hexAiExactSliceMaxSimulations,"live exact planner exceeded its per-tick simulation cap");
}

function alignedCpu(level){
  const g=createEngine(7000+level);spawn(g);
  g.ai={level,target:{x:g.piece.x,y:g.piece.y,rot:g.piece.rot},thinkT:0,actT:0,stuck:0};
  stepAI(g,1);
  return g;
}
for(const level of[1,2]){
  const g=alignedCpu(level);
  expect(g.state==="PLAYING"&&!!g.piece,AI_PARAMS[level].name+" used instant drop");
  expect(g.fastForward===true,AI_PARAMS[level].name+" did not enter fast-fall after alignment");
}
for(const level of[3,4,5]){
  const g=alignedCpu(level);
  expect(g.state==="RESOLVING"&&!g.piece,AI_PARAMS[level].name+" did not instant-drop after alignment");
}

console.log("precise + time-sliced technique CPU PASS",JSON.stringify({hex3:hs3.score,hex4:hs4.score,hex5:hs5.score,pyr5:ps5.score,dropModes:[1,2,3,4,5].map(l=>AI_PARAMS[l].dropMode)}));
`;

vm.runInNewContext(runtime+checks,{
 React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},
 ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
 performance:{now:()=>Date.now()},Math,Map,Set,Int8Array,Array,Number,Object,String,Boolean,JSON,Date
},{timeout:120000});
