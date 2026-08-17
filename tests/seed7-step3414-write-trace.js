const {runSuite}=require('./audit-harness');
const suite=String.raw`
function findBall(g,id){for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b?.id===id)return{b,v:g.vis.get(id),x,y};}return null;}
function compactStack(){return String(new Error().stack||'').split('\n').slice(2,8).map(s=>s.trim()).join(' <- ');}
function desc(g,id){const q=findBall(g,id);if(!q)return null;return{id,logical:[q.x,q.y],visual:[q.v.x,q.v.y],path:(q.b.fallPath||[]).map(s=>({from:s.from,to:s.to,kind:s.kind,start:s.pileFlowStart,end:s.pileFlowEnd,dur:s.pileFlowDuration,supports:s.followSupportIds||[],movingSupportId:s.movingSupportId||0,coupled:!!s.pileFlowContactCoupled}))};}
function distance(g){const a=findBall(g,60),b=findBall(g,58);return a&&b?hexPhysDist(a.v.x,a.v.y,b.v.x,b.v.y):null;}
const g=createEngine(7);g.ai={level:3,target:null,thinkT:0,actT:0};
for(let step=0;step<3414&&g.alive;step++){
 if(step===120*7)g.incomingShapes.push('PYRAMID');
 if(step===120*14)g.incomingShapes.push('HEXAGON');
 if(step===120*23)g.incomingShapes.push('STRAIGHT');
 if(step===120*31)g.incoming+=8;
 stepEngine(g,PHYSICS_FRAME);
}
const before={pileClock:g.pileFlowClock,state:g.state,phase:g.phase,d:distance(g),a:desc(g,60),b:desc(g,58)};
const writes=[];
function instrument(id){const q=findBall(g,id);if(!q)throw new Error('missing id '+id);const v=q.v;for(const key of ['x','y']){let value=v[key];Object.defineProperty(v,key,{configurable:true,enumerable:true,get(){return value;},set(next){const old=value;value=next;if(Math.abs((Number(next)||0)-(Number(old)||0))>1e-12)writes.push({id,key,old,next,pileClock:g.pileFlowClock,state:g.state,phase:g.phase,d:distance(g),stack:compactStack()});}});}return v;}
instrument(60);instrument(58);
const stage=[];
function snap(name){const a=findBall(g,60),b=findBall(g,58);let analytic=null;if(a?.b&&b?.b){const pa=pileFlowPositionAt(g,a.b,g.pileFlowClock),pb=pileFlowPositionAt(g,b.b,g.pileFlowClock);analytic={pa,pb,d:pileFlowPhysicalDist(pa,pb)};}stage.push({name,pileClock:g.pileFlowClock,state:g.state,phase:g.phase,d:distance(g),a:desc(g,60),b:desc(g,58),analytic});}
const oldUV=updateVisuals;updateVisuals=function(g0,dt){snap('before updateVisuals');const r=oldUV(g0,dt);snap('after updateVisuals');return r;};
const oldRV=resolveVisualContacts;resolveVisualContacts=function(g0){snap('before resolveVisualContacts');const r=oldRV(g0);snap('after resolveVisualContacts');return r;};
const oldFinal=hexEnforceFinalVisualNonOverlap;hexEnforceFinalVisualNonOverlap=function(g0){snap('before finalNonOverlap');const r=oldFinal(g0);snap('after finalNonOverlap');return r;};
snap('pre-step');
stepEngine(g,PHYSICS_FRAME);
snap('post-step');
const after={pileClock:g.pileFlowClock,state:g.state,phase:g.phase,d:distance(g),a:desc(g,60),b:desc(g,58)};
globalThis.__TRACE={before,after,stage,writes:writes.map((w,i)=>({...w,i}))};
`;
const ctx=runSuite(suite,{timeout:180000});console.log('SEED7_WRITE_TRACE',JSON.stringify(ctx.__TRACE,null,2));
