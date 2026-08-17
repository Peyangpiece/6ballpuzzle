const {runSuite}=require('./audit-harness');
const suite=String.raw`
function desc(g,id){for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(!b||b.id!==id)continue;const v=g.vis.get(id);return{id,logical:[x,y],visual:v&&[v.x,v.y],vy:v?.vy,speed:v?.motionSpeed,garbage:!!b.isGarbage,rest:b._hexGarbageContinuousRest||null,path:(b.fallPath||[]).map(s=>({from:s.from,to:s.to,pivot:s.pivot,topPivot:s.topPivot,kind:s.kind,motionSeq:s.motionSeq,pileFlow:!!s.pileFlow,start:s.pileFlowStart,end:s.pileFlowEnd,dur:s.pileFlowDuration,supports:s.followSupportIds||[],movingSupportId:s.movingSupportId||0,entry:!!s.pileFlowEntry,profile:s._hexGravityProfile&&{duration:s._hexGravityProfile.duration,vOut:s._hexGravityProfile.vOut}}))};}return null;}
function pair(g){const a=desc(g,60),b=desc(g,58);if(!a||!b||!a.visual||!b.visual)return null;return{d:hexPhysDist(a.visual[0],a.visual[1],b.visual[0],b.visual[1]),a,b};}
const g=createEngine(7);g.ai={level:3,target:null,thinkT:0,actT:0};let first=null,worst={d:Infinity},frames=[];
for(let step=0;step<=3422&&g.alive;step++){
 if(step===120*7)g.incomingShapes.push('PYRAMID');
 if(step===120*14)g.incomingShapes.push('HEXAGON');
 if(step===120*23)g.incomingShapes.push('STRAIGHT');
 if(step===120*31)g.incoming+=8;
 const before=pair(g);stepEngine(g,PHYSICS_FRAME);const q=pair(g);
 if(q&&q.d<worst.d)worst={step,...q};
 if(q&&q.d<.999999&&!first)first={step,before,after:q,pileClock:g.pileFlowClock,state:g.state,phase:g.phase};
 if(step>=3408&&step<=3420)frames.push({step,pileClock:g.pileFlowClock,state:g.state,phase:g.phase,pair:q});
}
function scheduledPos(id,t){const b=hexContinuousBoardBallById(g.board,id);return b?pileFlowPositionAt(g,b,t):null;}
let scheduleProbe=null;const A=desc(g,60),B=desc(g,58);if(A?.path?.[0]&&B?.path?.[0]){const s=Math.min(A.path[0].start,B.path[0].start),e=Math.max(A.path[0].end,B.path[0].end),samples=[];for(let i=0;i<=40;i++){const t=s+(e-s)*i/40,pa=scheduledPos(60,t),pb=scheduledPos(58,t);if(pa&&pb)samples.push({t,pa,pb,d:pileFlowPhysicalDist(pa,pb)});}scheduleProbe={s,e,min:samples.reduce((m,x)=>Math.min(m,x.d),Infinity),samples:samples.filter(x=>x.d<1.0001)};}
globalThis.__D={first,worst,frames,scheduleProbe};
`;
const ctx=runSuite(suite,{timeout:180000});console.log('SEED7_PARALLEL',JSON.stringify(ctx.__D,null,2));
