const fs=require('fs');
const vm=require('vm');

const runtime=[
  'app-01.js','app-02.js','app-03.js','app-04.js','app-05.js','app-06.js',
  'app-07.js','app-08.js','app-09.js','app-10.js','app-14.js','app-17.js','app-18.js'
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,'utf8')).join('\n');

const assertions=String.raw`
function findBall(g,id){for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b?.id===id)return{b,x,y};}return null;}
function neighborsAt(g,self,ep){const out=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(!b||b===self)continue;const v=g.vis.get(b.id),p=v&&Number.isFinite(v.x)&&Number.isFinite(v.y)?[v.x,v.y]:[x,y],d=pileFlowPhysicalDist(ep,p);if(d<1.15)out.push({id:b.id,logical:[x,y],visual:v?{x:v.x,y:v.y}:null,d});}return out.sort((a,b)=>a.d-b.d);}
const seed=19,g=createEngine(seed);g.ai={level:1+seed%5,target:null,thinkT:0,actT:0};
let report=null;
for(let step=0;step<=6840&&g.alive;step++){
 if(step===120*7)g.incomingShapes.push('PYRAMID');
 if(step===120*14)g.incomingShapes.push('HEXAGON');
 if(step===120*23)g.incomingShapes.push('STRAIGHT');
 if(step===120*31)g.incoming+=8;
 stepEngine(g,PHYSICS_FRAME);
 if(step>=6835){
   const f=findBall(g,22);if(!f)continue;const v=g.vis.get(22),seg=Array.isArray(f.b.fallPath)&&f.b.fallPath[0];
   if(!v||!seg?.pileFlow)continue;
   const from=seg.from,to=seg.to;
   const df=from?pileFlowPhysicalDist([v.x,v.y],from):null,dt=to?pileFlowPhysicalDist([v.x,v.y],to):null;
   if(step===6837||df<5e-5){report={step,state:g.state,phase:g.phase,logical:[f.x,f.y],visual:{...v},clock:g.pileFlowClock,seg:{...seg},fromSafe:from?hexPileEndpointSafeNow(g,f.b,from):null,toSafe:to?hexPileEndpointSafeNow(g,f.b,to):null,fromNeighbors:from?neighborsAt(g,f.b,from):[],toNeighbors:to?neighborsAt(g,f.b,to):[],df,dt};if(step===6837)break;}
 }
}
if(!report)throw new Error('pile endpoint diagnostic did not reproduce');
console.log('PILE_ENDPOINT_DIAGNOSTIC '+JSON.stringify(report));
`;
const context={React:{useRef(){},useEffect(){},useState(){},useCallback(){}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date};
vm.runInNewContext(runtime+assertions,context,{timeout:120000});
