const fs=require("fs"),vm=require("vm");
const runtime=[
 "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js","app-07.js","app-08.js","app-09.js",
 "app-ai-technique.js","app-ai-fastest-technique.js","app-ai-superstrong-speed.js","app-ai-grandmaster.js"
].map(n=>fs.readFileSync(`${__dirname}/../public/${n}`,"utf8")).join("\n");
const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function blankSim(waza,board=newBoard(),chain=1){return{b:board,pre:null,res:{chain,garbage:0},waza:{HEXAGON:0,PYRAMID:0,STRAIGHT:0,...waza}};}
function meta(sim,next=null,pressure=0){return{sim,next,pressure,nowCount:(sim.waza.HEXAGON||0)+(sim.waza.PYRAMID||0),nowAttack:(sim.waza.HEXAGON||0)*(WAZA.HEXAGON.garbage||36)+(sim.waza.PYRAMID||0)*(WAZA.PYRAMID.garbage||24),unsafeNow:false};}
function putPattern(board,pat,ax,ay,count,color){for(let i=0;i<count;i++){const[dx,dy]=pat[i],x=ax+dx,y=ay+dy;expect(valid(x,y),"bad fixture "+x+","+y);board[y][x]=color;}}
function key(m){return m&&m.x+","+m.y+","+m.rot;}

expect(window.__hexAiGrandmasterVersion==="grandmaster-v1","grandmaster adapter missing");
expect(window.__hexAiGrandmasterTechniqueFirst===true,"technique-first marker missing");
expect(window.__hexAiGrandmasterVisibleNextOnly===true,"grandmaster must not use hidden queue");
expect(window.__hexAiGrandmasterIncomingAware===true,"incoming-aware marker missing");
expect(AI_PARAMS[5].think===.12&&AI_PARAMS[5].act===.065,"fast Level-5 cadence changed");

const e=window.__hexAiGrandmasterExpectedColorPieces;
expect(e.length===7&&e[1]>2&&e[3]>5&&e[6]>10,"future colour ETA is not stochastic enough: "+JSON.stringify(e));
expect(e[1]<e[2]&&e[2]<e[3]&&e[3]<e[4],"colour ETA must rise with missing cells");

const near=newBoard(),far=newBoard();
putPattern(near,GARBAGE_SHAPES.PYRAMID,5,8,5,0);
putPattern(far,GARBAGE_SHAPES.PYRAMID,5,8,3,0);
const np=window.__hexAiGrandmasterConstructionProfile(near),fp=window.__hexAiGrandmasterConstructionProfile(far);
expect(np.primary.matched>=5,"near technique was not recognised");
expect(np.primary.eta<fp.primary.eta,"five-ball formation must be materially closer than three-ball formation");

const nowP=window.__hexAiGrandmasterRankFromSims(meta(blankSim({PYRAMID:1})),null);
const nextH=window.__hexAiGrandmasterRankFromSims(meta(blankSim({},newBoard(),0),[0,1,2]),blankSim({HEXAGON:1}));
expect(nowP.exactTurn===1&&nextH.exactTurn===2,"exact activation classification wrong");
expect(window.__hexAiGrandmasterCompareRank(nowP,nextH)<0,"THIS-piece technique must beat NEXT technique");

const safe=newBoard(),risky=newBoard();
for(const x of [1,3,5,7,9])risky[0][x]=(x/2)|0;
expect(window.__hexAiGrandmasterBoardRisk(risky)>window.__hexAiGrandmasterBoardRisk(safe),"upper-board risk not detected");

{
 const b=newBoard(),colors=[0,1,2],next=[0,3,4];
 const a=bestMove(b,colors,next,5,()=>.01),z=bestMove(b,colors,next,5,()=>.99);
 expect(a&&z&&key(a)===key(z),"grandmaster decision is not deterministic");
 const sync=window.__hexAiGrandmasterMoveSync(b,colors,next,0),p=window.__hexAiCreateGrandmasterPlanner(b,colors,next,0);
 let guard=0;while(!p.done&&guard++<40000)window.__hexAiAdvanceGrandmasterPlanner(p,Infinity,1);
 expect(p.done,"grandmaster sliced planner did not finish");
 expect(key(sync)===key(p.result),"time slicing changed grandmaster move");
 expect(p.maxSliceSimulations<=1,"one-sim slice exceeded");
}
console.log("Super Strong grandmaster strategy PASS",JSON.stringify({eta1:e[1],eta3:e[3],eta6:e[6],near:np.primary.eta,far:fp.primary.eta,think:AI_PARAMS[5].think,act:AI_PARAMS[5].act}));
`;
vm.runInNewContext(runtime+checks,{
 React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f},createElement(){}},
 ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
 Image:function(){this.complete=false;this.naturalWidth=0;},Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date,
 performance:{now(){return 0}},setTimeout(){return 0},clearTimeout(){},localStorage:{getItem(){return null},setItem(){}},
 document:{getElementById(){return null}},ResizeObserver:function(){this.observe=()=>{};this.disconnect=()=>{};}
},{timeout:120000});
