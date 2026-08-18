const {runSuite}=require('./audit-harness');
const seconds=Math.max(16,Number(process.argv[2])||30);
const suite=String.raw`
const SECONDS=${seconds},bugs=[],stats={},profiles=[];function bug(type,data){stats[type]=(stats[type]||0)+1;if(bugs.length<80)bugs.push({type,...data});}
let counts={resolve:0,relax:0,final:0,rests:0,rawRelax:0,rawFinal:0};
function wrap(name,key){
 if(typeof globalThis[name]!=='function')return;
 const old=globalThis[name];
 globalThis[name]=function(...args){
  if(name==='hexGarbageRelaxStep'){
   counts.rawRelax++;
   const g=args[0],dt=Number(args[1])||0,tx=g?._hexContactFrameTransaction;
   // app-61 intentionally suppresses zero-time nested relaxation calls inside
   // the current physics transaction. Count the call for diagnostics, but do
   // not classify a solver invocation that returns before doing any work as
   // physical re-entry.
   if(!(tx&&Math.abs(dt)<=1e-12))counts.relax++;
  }else if(name==='hexEnforceFinalVisualNonOverlap'){
   counts.rawFinal++;
   const g=args[0],tx=g?._hexContactFrameTransaction;
   // The frame transaction permits one final boundary solve. Earlier nested
   // requests are explicit no-ops and therefore are not real solver re-entry.
   if(!(tx&&!tx.allowFinal))counts.final++;
  }else counts[key]++;
  return old.apply(this,args);
 };
}
wrap('resolveVisualContacts','resolve');wrap('hexGarbageRelaxStep','relax');wrap('hexEnforceFinalVisualNonOverlap','final');wrap('hexGarbageApplyContinuousRests','rests');
for(const seed of [1,7,19,37]){
 const g=createEngine(0x50000000+seed);g.ai={level:1+seed%5,target:null,thinkT:0,actT:0};let maxMs=0,sumMs=0,frames=0,maxCounts=null,maxCountScore=0,slow=[];
 for(let step=0;step<Math.floor(SECONDS/PHYSICS_FRAME)&&g.alive;step++){
  if(step===120*4)g.incomingShapes.push('PYRAMID');if(step===120*9)g.incomingShapes.push('HEXAGON');if(step===120*14)g.incomingShapes.push('STRAIGHT');if(step===120*20)g.incoming+=8;
  counts={resolve:0,relax:0,final:0,rests:0,rawRelax:0,rawFinal:0};const t=Date.now();stepEngine(g,PHYSICS_FRAME);const ms=Date.now()-t;frames++;sumMs+=ms;if(ms>maxMs)maxMs=ms;
  const score=counts.resolve+counts.relax+counts.final+counts.rests;if(score>maxCountScore){maxCountScore=score;maxCounts={step,ms,...counts,state:g.state,phase:g.phase};}
  if(ms>=80&&slow.length<12)slow.push({step,ms,...counts,state:g.state,phase:g.phase});
  if(counts.relax>4)bug('garbage-relax-reentry',{seed,step,...counts,state:g.state,phase:g.phase});
  if(counts.final>4)bug('final-contact-reentry',{seed,step,...counts,state:g.state,phase:g.phase});
  if(counts.resolve>5)bug('resolve-contact-reentry',{seed,step,...counts,state:g.state,phase:g.phase});
  if(ms>250)bug('frame-over-250ms',{seed,step,ms,...counts,state:g.state,phase:g.phase});
 }
 const avg=sumMs/Math.max(1,frames);profiles.push({seed,frames,maxMs,avgMs:+avg.toFixed(3),maxCounts,slow});
 if(avg>25)bug('average-frame-over-25ms',{seed,avg,maxMs});
}
globalThis.__PERF_AUDIT={seconds:SECONDS,stats,bugs,profiles};
`;
const ctx=runSuite(suite,{timeout:420000});console.log('PERFORMANCE_AUDIT',JSON.stringify(ctx.__PERF_AUDIT,null,2));if(Object.keys(ctx.__PERF_AUDIT.stats).length)process.exitCode=1;
