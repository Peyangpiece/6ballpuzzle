const {runSuite}=require('./audit-harness');
const start=Math.max(1,Number(process.argv[2])||1),count=Math.max(1,Number(process.argv[3])||36),seconds=Math.max(12,Number(process.argv[4])||28);
const suite=String.raw`
const START=${start},COUNT=${count},SECONDS=${seconds},events=[],stats={};function add(type,data){stats[type]=(stats[type]||0)+1;if(events.length<160)events.push({type,...data});}
const oldSchedule=scheduleFreshPileFlow;
scheduleFreshPileFlow=function(g,fresh,reason='pile_flow'){
 const base=Math.max(0,Number(g?.pileFlowClock)||0);const before=fresh.map(q=>({id:q.ball?.id,garbage:!!q.ball?.isGarbage,seq:q.seq,pathIndex:Array.isArray(q.ball?.fallPath)?q.ball.fallPath.indexOf(q.seg):-1,hadPrev:Array.isArray(q.ball?.fallPath)&&q.ball.fallPath.slice(0,q.ball.fallPath.indexOf(q.seg)).some(s=>Number.isFinite(s?.pileFlowEnd))}));
 const r=oldSchedule(g,fresh,reason);
 for(let i=0;i<fresh.length;i++){const q=fresh[i],meta=before[i],start=Number(q.seg?.pileFlowStart);if(!meta.hadPrev&&Number.isFinite(start)&&start>base+1e-7)add('first-motion-delayed-by-scheduler',{reason,base,start,delay:start-base,id:meta.id,garbage:meta.garbage,seq:meta.seq,totalFresh:fresh.length});}
 const firstByBall=new Map();for(const q of fresh){if(!firstByBall.has(q.ball.id))firstByBall.set(q.ball.id,q.seg);}const starts=[...firstByBall.entries()].map(([id,s])=>({id,start:s.pileFlowStart,reason:s.pileFlowReason,garbage:!!pileFlowBallById(g,id)?.isGarbage})).filter(q=>Number.isFinite(q.start));if(starts.length>1){const lo=Math.min(...starts.map(s=>s.start)),hi=Math.max(...starts.map(s=>s.start));if(hi-lo>1/240+1e-9)add('cross-ball-wave-delay',{reason,spread:hi-lo,starts:starts.slice(0,12)});}
 return r;
};
const oldMat=materializeGarbagePack;
materializeGarbagePack=function(g,pack,atEntry=false){const limit=Math.max(GARBAGE_VISUAL_MAX,g?.garbageWatchdogLimit||0);if(g?.phase==='GARBAGE'&&g.stateT>=limit-1e-9)add('garbage-watchdog-materialize',{stateT:g.stateT,limit,type:pack?.type,seq:pack?.seq,started:!!pack?._started});return oldMat(g,pack,atEntry);};
const oldGarbageBall=garbageBall;
garbageBall=function(g){const limit=Math.max(GARBAGE_VISUAL_MAX,g?.garbageWatchdogLimit||0);if(g?.phase==='GARBAGE'&&g.stateT>=limit-1e-9)add('numeric-garbage-watchdog-rescue',{stateT:g.stateT,limit,left:g.garbLeft});return oldGarbageBall(g);};
for(let seed=START;seed<START+COUNT;seed++){
 const g=createEngine(900000+seed);g.ai={level:1+seed%5,target:null,thinkT:0,actT:0};const seen=new Set(),starts=[];
 for(let step=0;step<Math.floor(SECONDS/PHYSICS_FRAME)&&g.alive;step++){
  if(step===120*4)g.incomingShapes.push('PYRAMID','HEXAGON','STRAIGHT');
  if(step===120*12)g.incomingShapes.push('HEXAGON','PYRAMID');
  if(step===120*19)g.incoming+=6;
  stepEngine(g,PHYSICS_FRAME);
  for(const p of g.garbagePlans||[])if(p._started&&!seen.has(p.seq)){seen.add(p.seq);starts.push(p.actualStartTime);}
 }
 for(let i=1;i<starts.length;i++){const d=starts[i]-starts[i-1];if(Math.abs(d-.5)>1e-7)add('shape-start-interval',{seed,i,d,starts});}
}
globalThis.__AUDIT={start:START,count:COUNT,seconds:SECONDS,stats,events};
`;
const ctx=runSuite(suite,{timeout:420000});console.log('GARBAGE_SCHED_AUDIT',JSON.stringify(ctx.__AUDIT,null,2));if(Object.keys(ctx.__AUDIT.stats).length)process.exitCode=1;
