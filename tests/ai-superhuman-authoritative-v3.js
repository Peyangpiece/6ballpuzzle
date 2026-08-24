const fs=require("fs");
const vm=require("vm");

const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js",
  "app-06.js","app-07.js","app-08.js","app-09.js",
  "app-ai-superstrong-authoritative-v2.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const checks=String.raw`
function expect(value,message){if(!value)throw new Error(message);}
function key(move){return move&&move.x+","+move.y+","+move.rot;}

expect(window.__sixBallSuperStrongVersion==="superhuman-authoritative-v3-four-turn-search","superhuman v3 planner was not installed");
expect(AI_PARAMS[5].name==="超強い"&&AI_PARAMS[5].random===0,"Super Strong lost deterministic difficulty settings");
expect(AI_PARAMS[5].depth===4&&AI_PARAMS[5].think===0&&AI_PARAMS[5].dropMode==="hard","Super Strong is not configured for four-turn instant execution");
expect(window.__sixBallSuperStrongSearchDepth===4,"Super Strong search depth marker mismatch");
expect(window.__sixBallSuperStrongUsesAllQueuedPieces===true,"Super Strong does not use all queued pieces");
expect(window.__sixBallSuperStrongCurrentSearchExhaustive===true,"current move search is not exhaustive");
expect(window.__sixBallSuperStrongFrameSimulationLimit===12&&window.__sixBallSuperStrongBusyFrameSimulationLimit===3,"time-slice strength limits changed");
expect(window.__sixBallSuperStrongPlannerFrameLimit===240,"planner frame budget changed");

/*
 * Across these four pieces no colour appears six times, so no technique can
 * activate.  The planner must therefore traverse every configured turn rather
 * than returning early.  This directly guards the superhuman lookahead budget.
 */
const board=newBoard();
const colors=[0,1,2];
const future=[[3,4,0],[1,2,3],[4,0,1]];
const sliced=window.__sixBallSuperStrongCreatePlanner(board,colors,future);
expect(sliced.futurePieces.length===3,"planner discarded queued pieces");
expect(sliced.moves.length===enumerateMoves(board,colors).length,"planner pruned legal current moves");

let calls=0;
while(!sliced.done&&calls++<20000)
  window.__sixBallSuperStrongAdvancePlanner(sliced,Infinity,7);

expect(sliced.done&&sliced.result,"time-sliced superhuman planner did not finish");
expect(sliced.completedTurns===4,"planner stopped before the fourth visible turn: "+sliced.completedTurns);
expect(sliced.simulations>1500,"planner searched too few positions: "+sliced.simulations);
expect(sliced.maxSliceSimulations<=7,"planner exceeded the requested seven-simulation slice");

/* Time slicing may change latency, never the selected move. */
const synchronous=window.__sixBallSuperStrongCreatePlanner(board,colors,future);
window.__sixBallSuperStrongAdvancePlanner(synchronous,Infinity,100000);
expect(synchronous.done&&synchronous.result,"synchronous superhuman planner did not finish");
expect(key(synchronous.result)===key(sliced.result),"time slicing changed the superhuman decision: "+JSON.stringify({sync:key(synchronous.result),sliced:key(sliced.result)}));
expect(synchronous.simulations===sliced.simulations,"time slicing changed the explored tree size");

/* The live Level-5 controller must consume the whole queue and execute. */
const live=createEngine(7555);
spawn(live);
live.piece={...live.piece,colors:[...colors]};
live.queue=future.map(q=>[...q]);
live.ai={level:5,target:null,thinkT:0,actT:0,stuck:0};
let frames=0;
while(live.state==="PLAYING"&&frames++<360)
  stepAI(live,PHYSICS_FRAME);
expect(live.state==="RESOLVING"&&!live.piece,"live Super Strong failed to execute its planned hard drop");
expect(live.ai._lastFocusedPlannerStats?.lookaheadPieces===4,"live Super Strong did not inspect all queued pieces");
expect(live.ai._lastFocusedPlannerStats?.maxSliceSimulations<=12,"live planner exceeded the foreground frame budget");

globalThis.__report={
  move:key(sliced.result),
  simulations:sliced.simulations,
  turns:sliced.completedTurns,
  currentMoves:sliced.moves.length,
  slicedCalls:calls,
  liveFrames:frames
};
`;

const context={
  React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f},createElement(){}},
  ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
  Image:function(){this.complete=false;this.naturalWidth=0;},Math,Map,Set,WeakMap,Int8Array,Array,Number,Object,String,Boolean,JSON,Date,
  performance:{now:()=>Date.now()},setTimeout(){return 0},clearTimeout(){},
  localStorage:{getItem(){return null},setItem(){}},
  document:{getElementById(){return null},addEventListener(){}},
  ResizeObserver:function(){this.observe=()=>{};this.disconnect=()=>{};}
};
context.window.addEventListener=()=>{};

vm.runInNewContext(runtime+checks,context,{timeout:120000});
console.log("Super Strong superhuman v3 PASS",JSON.stringify(context.__report));
