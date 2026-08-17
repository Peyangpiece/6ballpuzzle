const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../public/index.html','utf8');
const names=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const runtime=names.map(n=>fs.readFileSync(__dirname+'/../public/'+n,'utf8')).join('\n');
const probe=String.raw`
function bubbleHold(g){let found=false;for(let y=boardScanMin(g.board);y<=0&&!found;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b?.garbageBubbleHold){found=true;break;}}return found;}
function packState(p){return p?{type:p.type,seq:p.seq,landed:!!p.landed,pat:p.pat?.length,landedCount:p.landedCount,totalBalls:p.totalBalls,started:!!p._started,bubbleT:p.bubbleT,y:p.y,contactY:p.contactY,releaseTime:p.releaseTime,wholePending:!!p._hexWholeReleasePending,wholeAnchor:p._hexWholeReleaseAnchorY,groupKey:p._hexContinuousGroupKey}:null;}
const seed=7,g=createEngine(seed);g.ai={level:1+seed%5,target:null,thinkT:0,actT:0};
let lastPhase='';
for(let step=0;step<120*18&&g.alive;step++){
 if(step===120*7)g.incomingShapes.push('PYRAMID');
 if(step===120*14)g.incomingShapes.push('HEXAGON');
 stepEngine(g,PHYSICS_FRAME);
 if(step%120===0||String(g.state)+'/'+String(g.phase)!==lastPhase){
   lastPhase=String(g.state)+'/'+String(g.phase);
   const plansDone=(g.garbagePlans||[]).every(p=>p.landed);
   const visuals=typeof garbageVisualsDone==='function'?garbageVisualsDone(g):null;
   const batch=typeof garbageBatchDone==='function'?garbageBatchDone(g):null;
   console.log('SEED7_DONE_DIAG '+JSON.stringify({step,sec:step/120,state:g.state,phase:g.phase,plansDone,garbLeft:g.garbLeft,visuals,bubble:bubbleHold(g),batch,plans:(g.garbagePlans||[]).map(packState),active:(g.activeGarbagePacks||[]).map(packState),incomingShapes:g.incomingShapes?.slice()}));
 }
}
console.log('GARBAGE_VISUALS_DONE_SOURCE '+String(garbageVisualsDone));
`;
vm.runInNewContext(runtime+probe,{React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date},{timeout:30000});
