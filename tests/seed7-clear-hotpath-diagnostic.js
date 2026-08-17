const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../public/index.html','utf8');
const names=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const runtime=names.map(n=>fs.readFileSync(__dirname+'/../public/'+n,'utf8')).join('\n');
const probe=String.raw`
function stats(g){
 let balls=0,garbage=0,paths=0,segments=0,pileSegs=0;
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const b=valid(x,y)?g.board[y][x]:null;if(!b)continue;balls++;if(b.isGarbage)garbage++;
  if(Array.isArray(b.fallPath)&&b.fallPath.length){paths++;segments+=b.fallPath.length;for(const s of b.fallPath)if(s?.pileFlow)pileSegs++;}
 }
 return{balls,garbage,paths,segments,pileSegs,state:g.state,phase:g.phase,pileFlowClock:g.pileFlowClock};
}
const perf={};
function add(name,ms){const p=perf[name]||(perf[name]={calls:0,ms:0,max:0});p.calls++;p.ms+=ms;if(ms>p.max)p.max=ms;}
function reset(){for(const k of Object.keys(perf))delete perf[k];}

const origResolve=resolveVisualContacts;
resolveVisualContacts=function(){const t=Date.now();try{return origResolve.apply(this,arguments);}finally{add('resolveVisualContacts',Date.now()-t);}};
const origRestore=hexRestorePileFlowFrame;
hexRestorePileFlowFrame=function(){const t=Date.now();try{return origRestore.apply(this,arguments);}finally{add('hexRestorePileFlowFrame',Date.now()-t);}};
const origPrepare=prepareContinuousPileFlow;
prepareContinuousPileFlow=function(){const t=Date.now();try{return origPrepare.apply(this,arguments);}finally{add('prepareContinuousPileFlow',Date.now()-t);}};
const origPosition=pileFlowPositionAt;
pileFlowPositionAt=function(){const p=perf.pileFlowPositionAt||(perf.pileFlowPositionAt={calls:0});p.calls++;return origPosition.apply(this,arguments);};
const origPointFor=pileFlowPointForBall;
pileFlowPointForBall=function(){const p=perf.pileFlowPointForBall||(perf.pileFlowPointForBall={calls:0});p.calls++;return origPointFor.apply(this,arguments);};
const origUpdateVis=updateVisuals;
updateVisuals=function(){const t=Date.now();try{return origUpdateVis.apply(this,arguments);}finally{add('updateVisuals',Date.now()-t);}};
const origGarbage=updateGarbagePacks;
updateGarbagePacks=function(){const t=Date.now();try{return origGarbage.apply(this,arguments);}finally{add('updateGarbagePacks',Date.now()-t);}};

const seed=7,g=createEngine(seed);g.ai={level:1+seed%5,target:null,thinkT:0,actT:0};
let found=false;
for(let step=0;step<120*40&&g.alive;step++){
 if(step===120*7)g.incomingShapes.push('PYRAMID');
 if(step===120*14)g.incomingShapes.push('HEXAGON');
 if(step===120*23)g.incomingShapes.push('STRAIGHT');
 if(step===120*31)g.incoming+=8;
 reset();
 const t=Date.now();stepEngine(g,PHYSICS_FRAME);const frameMs=Date.now()-t;
 if(frameMs>=80||step%600===0){
  console.log('CLEAR_HOTPATH '+JSON.stringify({step,simSec:+(step/120).toFixed(3),frameMs,board:stats(g),perf}));
 }
 if(frameMs>=80){found=true;break;}
}
if(!found)console.log('CLEAR_HOTPATH no frame >=80ms');
`, context={React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date};
vm.runInNewContext(runtime+probe,context,{timeout:60000});
