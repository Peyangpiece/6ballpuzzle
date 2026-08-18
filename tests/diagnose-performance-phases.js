const {runSuite}=require('./audit-harness');
const suite=String.raw`
const log=[],phaseStack=[];let stepNo=-1;
const phase=()=>phaseStack.length?phaseStack[phaseStack.length-1]:'STEP';
function wrapPhase(name,label){if(typeof globalThis[name]!=='function')return;const old=globalThis[name];globalThis[name]=function(...args){phaseStack.push(label);try{return old.apply(this,args);}finally{phaseStack.pop();}};}
function wrapEvent(name,label){if(typeof globalThis[name]!=='function')return;const old=globalThis[name];globalThis[name]=function(...args){if(stepNo>=830&&stepNo<=880)log.push({step:stepNo,event:label,phase:phase(),state:args[0]?.state||null,gamePhase:args[0]?.phase||null});return old.apply(this,args);};}
wrapPhase('updateVisuals','UPDATE_VISUALS');
wrapPhase('resolveVisualContacts','RESOLVE_CONTACTS');
wrapPhase('updateGarbagePacks','UPDATE_GARBAGE_PACKS');
wrapEvent('hexGarbageRelaxStep','RELAX');
wrapEvent('hexGarbageApplyContinuousRests','REST');
wrapEvent('hexEnforceFinalVisualNonOverlap','FINAL');
const g=createEngine(0x50000000+1);g.ai={level:2,target:null,thinkT:0,actT:0};
for(stepNo=0;stepNo<=900&&g.alive;stepNo++){
 if(stepNo===120*4)g.incomingShapes.push('PYRAMID');
 if(stepNo===120*9)g.incomingShapes.push('HEXAGON');
 if(stepNo===120*14)g.incomingShapes.push('STRAIGHT');
 stepEngine(g,PHYSICS_FRAME);
}
const grouped={};for(const e of log){const k=String(e.step);if(!grouped[k])grouped[k]=[];grouped[k].push(e.event+'@'+e.phase);}
const compact=Object.entries(grouped).slice(0,30).map(([step,events])=>({step:Number(step),events}));
globalThis.__PERF_PHASE={compact,rawCount:log.length};
`;
const ctx=runSuite(suite,{timeout:180000});console.log('PERFORMANCE_PHASE_TRACE',JSON.stringify(ctx.__PERF_PHASE,null,2));
