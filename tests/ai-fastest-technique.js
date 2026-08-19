const fs=require("fs");
const vm=require("vm");
const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js",
  "app-07.js","app-08.js","app-09.js","app-ai-technique.js","app-ai-fastest-technique.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function blankSim(waza){return{b:newBoard(),pre:null,res:{chain:0,garbage:0},waza:{HEXAGON:0,PYRAMID:0,STRAIGHT:0,...waza}};}
function meta(sim,next=null){return{sim,next,nowCount:(sim.waza.HEXAGON||0)+(sim.waza.PYRAMID||0),nowAttack:(sim.waza.HEXAGON||0)*(WAZA.HEXAGON.garbage||36)+(sim.waza.PYRAMID||0)*(WAZA.PYRAMID.garbage||24),unsafeNow:false};}
function key(m){return m&&m.x+","+m.y+","+m.rot;}

expect(window.__hexAiFastestTechniqueVersion==="fastest-technique-v1","fastest-technique adapter missing");
expect(window.__hexAiSuperStrongEarliestActivationFirst===true,"earliest activation marker missing");
expect(window.__hexAiSuperStrongStrengthFromDecision===true,"decision-strength marker missing");
expect(AI_PARAMS[5].act===AI_PARAMS[4].act&&AI_PARAMS[5].think===AI_PARAMS[4].think,"Level 5 still gets strength from faster execution cadence");

const nowP=window.__hexAiFastestRankFromSims(meta(blankSim({PYRAMID:1})),null);
const nextH=window.__hexAiFastestRankFromSims(meta(blankSim({}),[0,1,2]),blankSim({HEXAGON:1}));
expect(nowP.turn===1&&nextH.turn===2,"activation turn classification wrong");
expect(window.__hexAiFastestCompareRank(nowP,nextH)<0,"immediate PYRAMID must beat NEXT HEXAGON regardless of larger future attack");

const nowH=window.__hexAiFastestRankFromSims(meta(blankSim({HEXAGON:1})),null);
expect(window.__hexAiFastestCompareRank(nowH,nowP)<0,"same-turn HEXAGON should beat PYRAMID only after activation turn ties");

const nextP=window.__hexAiFastestRankFromSims(meta(blankSim({}),[0,1,2]),blankSim({PYRAMID:1}));
const none=window.__hexAiFastestRankFromSims(meta(blankSim({}),[0,1,2]),blankSim({}));
expect(nextP.turn===2&&none.turn>2,"NEXT technique must beat all visible two-piece no-technique lines");
expect(window.__hexAiFastestCompareRank(nextP,none)<0,"NEXT technique was not prioritised over construction-only progress");

// Find a stable five-of-six technique fixture near the floor for which at least
// one legal current move triggers HEXAGON/PYRAMID.  The planner must select an
// immediate trigger; a two-turn higher-attack line is never allowed to override it.
let fixture=null;
for(const pat of [GARBAGE_SHAPES.PYRAMID,GARBAGE_SHAPES.HEXAGON]){
  for(const ay of [9,8,7])for(const ax of [4,6,8,10])for(let hole=0;hole<pat.length&&!fixture;hole++){
    const b=newBoard();let validFixture=true;
    for(let i=0;i<pat.length;i++)if(i!==hole){const [dx,dy]=pat[i],x=ax+dx,y=ay+dy;if(!valid(x,y)){validFixture=false;break;}b[y][x]=0;}
    if(!validFixture)continue;
    const colors=[0,1,2],cb=toColors(b),moves=enumerateMoves(b,colors),immediate=[];
    for(const m of moves){const s=window.__hexAiSimulateDetailed(cb,m);if(s&&((s.waza.HEXAGON||0)+(s.waza.PYRAMID||0)>0))immediate.push(m);}
    if(immediate.length)fixture={b,colors,immediate};
  }
}
expect(fixture,"could not construct an immediate-technique fixture");
const chosen=bestMove(fixture.b,fixture.colors,[3,4,0],5,()=>.999);
expect(chosen,"Super Strong returned no move on technique fixture");
const chosenSim=window.__hexAiSimulateDetailed(toColors(fixture.b),chosen);
expect(chosenSim&&((chosenSim.waza.HEXAGON||0)+(chosenSim.waza.PYRAMID||0)>0),"Super Strong skipped an immediately available technique: "+JSON.stringify({chosen:key(chosen),immediate:fixture.immediate.map(key)}));

// Time slicing is responsiveness-only: one simulation per slice must converge
// to exactly the same move as the synchronous exhaustive planner.
{
  const b=newBoard(),colors=[0,1,2],next=[0,3,4];
  const sync=window.__hexAiFastestTechniqueMoveSync(b,colors,next);
  const p=window.__hexAiCreateFastestTechniquePlanner(b,colors,next);
  let guard=0;while(!p.done&&guard++<20000)window.__hexAiAdvanceFastestTechniquePlanner(p,Infinity,1);
  expect(p.done,"time-sliced fastest-technique planner did not finish");
  expect(key(sync)===key(p.result),"time slicing changed the optimal move: "+JSON.stringify({sync:key(sync),sliced:key(p.result)}));
  expect(p.maxSliceSimulations<=1,"planner exceeded one-simulation test slice");
}

console.log("Super Strong earliest-technique objective PASS",JSON.stringify({immediateTurn:nowP.turn,nextTurn:nextH.turn,chosen:key(chosen),act:AI_PARAMS[5].act}));
`;

vm.runInNewContext(runtime+checks,{
 React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f},createElement(){}},
 ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
 Image:function(){this.complete=false;this.naturalWidth=0;},Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date,
 performance:{now(){return 0}},setTimeout(){return 0},clearTimeout(){},localStorage:{getItem(){return null},setItem(){}},
 document:{getElementById(){return null}},ResizeObserver:function(){this.observe=()=>{};this.disconnect=()=>{};}
},{timeout:120000});
