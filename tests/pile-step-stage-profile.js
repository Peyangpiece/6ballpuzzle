const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../public/index.html','utf8');
const names=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const runtime=names.map(n=>fs.readFileSync(__dirname+'/../public/'+n,'utf8')).join('\n');
const probe=String.raw`
const g=createEngine(1);g.ai={level:2,target:null,thinkT:0,actT:0};
let current=-1,stats=null,worst=null;
function wrap(name){
 const old=globalThis[name];if(typeof old!=='function')return;
 globalThis[name]=function(...args){const t=Date.now(),r=old.apply(this,args),ms=Date.now()-t;if(stats){const s=stats[name]||(stats[name]={calls:0,ms:0,max:0});s.calls++;s.ms+=ms;s.max=Math.max(s.max,ms);}return r;};
}
for(const n of ['hexGarbageRelaxStep','hexEnforceFinalVisualNonOverlap','hexGarbageApplyContinuousRests','resolveVisualContacts','updateVisuals','updateGarbagePacks','hexResolvePileFlowFrameContacts','hexResolvePileFlowFixedWaiterConvergence'])wrap(n);
for(let step=0;step<3060&&g.alive;step++){
 current=step;if(step===840)g.incomingShapes.push('PYRAMID');if(step===1680)g.incomingShapes.push('HEXAGON');if(step===2760)g.incomingShapes.push('STRAIGHT');
 stats={};const t=Date.now();stepEngine(g,PHYSICS_FRAME);const ms=Date.now()-t;
 if(step>=2760&&(!worst||ms>worst.ms))worst={step,sec:step/120,ms,state:g.state,phase:g.phase,stats:JSON.parse(JSON.stringify(stats)),balls:[...g.vis.keys()].length,garb:(()=>{let n=0;for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b?.isGarbage)n++;}return n;})(),relax:typeof hexGarbageRelaxMembers==='function'?hexGarbageRelaxMembers(g).length:0,rest:typeof hexGarbageContinuousRestMembers==='function'?hexGarbageContinuousRestMembers(g).length:0};
 if(step>=2760&&ms>=150){console.log('PILE_STAGE_BREAK '+JSON.stringify(worst));break;}
}
if(!worst||worst.ms<150)console.log('PILE_STAGE_WORST '+JSON.stringify(worst));
`;
vm.runInNewContext(runtime+probe,{React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date,globalThis:null},{timeout:120000});
