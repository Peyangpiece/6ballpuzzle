const {runSuite}=require('./audit-harness');
const suite=String.raw`
const rows=[];let stepNo=-1,callNo=0;const g=createEngine(0x50000000+1);g.ai={level:2,target:null,thinkT:0,actT:0};
const oldFinal=hexEnforceFinalVisualNonOverlap,oldMin=hexGarbageFrameMinDistance;
hexEnforceFinalVisualNonOverlap=function(gg){
  const before=oldMin(gg),ret=oldFinal(gg),after=oldMin(gg);
  if(stepNo>=1034&&stepNo<=1042)rows.push({step:stepNo,call:callNo++,before,after,ret,state:gg.state,phase:gg.phase,rests:typeof hexGarbageContinuousRestMembers==='function'?hexGarbageContinuousRestMembers(gg).length:null});
  return ret;
};
for(stepNo=0;stepNo<=1042&&g.alive;stepNo++){
  if(stepNo===120*4)g.incomingShapes.push('PYRAMID');
  if(stepNo===120*9)g.incomingShapes.push('HEXAGON');
  if(stepNo===120*14)g.incomingShapes.push('STRAIGHT');
  callNo=0;stepEngine(g,PHYSICS_FRAME);
}
hexEnforceFinalVisualNonOverlap=oldFinal;
globalThis.__FINAL_IMPROVEMENT=rows;
`;
const ctx=runSuite(suite,{timeout:180000});console.log('FINAL_SOLVE_IMPROVEMENT',JSON.stringify(ctx.__FINAL_IMPROVEMENT,null,2));
