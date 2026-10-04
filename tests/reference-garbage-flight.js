const vm=require('vm'),assert=require('assert/strict');
const {ctx}=require('./v1303-plan-group-smoke.js');
const source=require('./fixtures/reference-garbage-flight-20260814.json');
ctx.garbageReferenceFps=Number(process.env.TEST_FPS)||120;
const fps=ctx.garbageReferenceFps;
const actual=vm.runInContext(`(()=>{
 const g=createEngine(232);g.state='RESOLVING';g.phase='GARBAGE';g.garbShapes=['PYRAMID','PYRAMID','PYRAMID','PYRAMID'];g.garbLeft=0;
 prepareGarbageBatch(g);updateGarbagePacks(g,0);
 const first=g.garbagePlans[0],id=first.ballIds[3],trace=[];
 const initial=g.board.flat().find(b=>b?.id===id)?.fallPath?.map(s=>({from:s.from,to:s.to,start:s.pileFlowStart,end:s.pileFlowEnd,d:s.pileFlowDuration,v:s.__garbageV0}));
 const origins=first.ballIds.map(id=>({id,x:g.vis.get(id).x,y:g.vis.get(id).y}));
 let airborneDeformation=0;
 for(let i=0;i<=Math.ceil(garbageReferenceFps*1.6);i++){
  if(i){updateVisuals(g,1/garbageReferenceFps);resolveVisualContacts(g);updateGarbagePacks(g,1/garbageReferenceFps);}
  const v=g.vis.get(id);trace.push({t:i/garbageReferenceFps,y:v.y});
  if(i/garbageReferenceFps<=.6){
   const displacement=v.y-origins[3].y;
   for(const q of origins){const z=g.vis.get(q.id);airborneDeformation=Math.max(airborneDeformation,Math.abs(z.x-q.x),Math.abs(z.y-q.y-displacement));}
  }
 }
 return{trace,initial,airborneDeformation,starts:g.garbagePlans.map(p=>p.actualStartTime),first: first.actualStartTime,
  compressed:g.board.flat().filter(Boolean).some(b=>b.fallPath?.some(s=>s.pileFlowAuthorityV2))};
})()`,ctx);
const errors=source.samples.map(([frame,y])=>{
 const n=(frame-source.launchFrame)/source.fps*fps,a=actual.trace[Math.floor(n)],b=actual.trace[Math.ceil(n)],q=n-Math.floor(n);
 const py=875.5+(a.y+(b.y-a.y)*q-11)*63.4*Math.sqrt(3)/2;
 return {frame,actual:py,reference:y,error:Math.abs(py-y)};
});
const rms=Math.sqrt(errors.reduce((n,q)=>n+q.error*q.error,0)/errors.length),max=Math.max(...errors.map(q=>q.error));
console.log('Measured garbage vertical flight',JSON.stringify({fps,rms,max,airborneDeformation:actual.airborneDeformation,starts:actual.starts,errors}));
assert(rms<=5&&max<=9,'Reference incoming garbage vertical flight differs');
assert(!actual.compressed,'Garbage flight was compressed by a common deadline');
assert(actual.airborneDeformation<1e-7,'Incoming packet deformed before real contact');
for(const seg of actual.initial)assert(Math.abs(seg.end-seg.start-seg.d)<1e-9,'Merged flight has inconsistent completion clock');
for(let i=1;i<actual.starts.length;i++){
 assert(Number.isFinite(actual.starts[i]),'Next packet waited for previous landing');
 assert(Math.abs(actual.starts[i]-actual.starts[i-1]-.45)<=1/fps+1e-8,'Incoming packet cadence differs');
}
