const fs=require("fs");
const vm=require("vm");
const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js",
  "app-07.js","app-08.js","app-09.js","app-ai-technique.js","app-ai-fastest-technique.js","app-ai-superstrong-speed.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function blankSim(waza,board=newBoard(),chain=1){return{b:board,pre:null,res:{chain,garbage:0},waza:{HEXAGON:0,PYRAMID:0,STRAIGHT:0,...waza}};}
function meta(sim,next=null){return{sim,next,nowCount:(sim.waza.HEXAGON||0)+(sim.waza.PYRAMID||0),nowAttack:(sim.waza.HEXAGON||0)*(WAZA.HEXAGON.garbage||36)+(sim.waza.PYRAMID||0)*(WAZA.PYRAMID.garbage||24),unsafeNow:false};}

expect(window.__hexAiFastestTechniqueVersion==="fastest-technique-v2","learned technique planner missing");
expect(window.__hexAiSuperStrongSpeedVersion==="superstrong-speed-v1","secondary speed adapter missing");
expect(window.__hexAiSuperStrongTechniqueFirst===true,"technique-first marker missing");
expect(window.__hexAiSuperStrongSpeedSecondary===true,"speed-secondary marker missing");
expect(window.__hexAiSuperStrongFastExecution===true,"fast execution marker missing");
expect(AI_PARAMS[5].think===.12&&AI_PARAMS[5].act===.065,"Level 5 precise fast cadence changed");
expect(AI_PARAMS[5].think<AI_PARAMS[4].think&&AI_PARAMS[5].act<AI_PARAMS[4].act,"Level 5 is not faster than Level 4");
expect(AI_PARAMS[5].dropMode==="hard","Level 5 lost hard drop");
expect(AI_PARAMS[5].strengthBasis==="technique-first-speed-second","strength priority label wrong");

// Decision priority must stay untouched by the speed adapter: a technique this
// piece always beats a larger technique that waits until NEXT.
const nowP=window.__hexAiFastestRankFromSims(meta(blankSim({PYRAMID:1})),null);
const nextH=window.__hexAiFastestRankFromSims(meta(blankSim({},newBoard(),0),[0,1,2]),blankSim({HEXAGON:1}));
expect(nowP.turn===1&&nextH.turn===2,"activation turns changed after speed restore");
expect(window.__hexAiFastestCompareRank(nowP,nextH)<0,"execution speed altered technique-first decision priority");

console.log("Super Strong technique-first + speed-second PASS",JSON.stringify({think:AI_PARAMS[5].think,act:AI_PARAMS[5].act,strongThink:AI_PARAMS[4].think,strongAct:AI_PARAMS[4].act,primary:"technique"}));
`;

vm.runInNewContext(runtime+checks,{
 React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f},createElement(){}},
 ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
 Image:function(){this.complete=false;this.naturalWidth=0;},Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date,
 performance:{now(){return 0}},setTimeout(){return 0},clearTimeout(){},localStorage:{getItem(){return null},setItem(){}},
 document:{getElementById(){return null}},ResizeObserver:function(){this.observe=()=>{};this.disconnect=()=>{};}
},{timeout:120000});
