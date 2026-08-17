const {runSuite}=require('./audit-harness');
const suite=String.raw`
function item(g,id){for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);if(b?.id===id)return{id,b,v,l:[x,y]};}return null;}
function all(g){const out=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);if(b&&v)out.push({id:b.id,g:!!b.isGarbage,x:v.x,y:v.y,l:[x,y],path:b.fallPath?.[0]?.kind||'',coupled:!!b.fallPath?.[0]?.pileFlowContactCoupled});}return out;}
function snap(g,name,prev){const a=item(g,60),b=item(g,58),aa=a&&pileFlowPositionAt(g,a.b,g.pileFlowClock),bb=b&&pileFlowPositionAt(g,b.b,g.pileFlowClock),now=all(g);const nearby=[];for(const id of [60,58]){const q=now.find(x=>x.id===id);if(!q)continue;for(const o of now){if(o.id===id)continue;const d=hexPhysDist(q.x,q.y,o.x,o.y);if(d<1.08)nearby.push({from:id,to:o.id,d,x:o.x,y:o.y,path:o.path,coupled:o.coupled});}}nearby.sort((u,v)=>u.d-v.d);const changed=[];if(prev){for(const q of now){const p=prev.find(x=>x.id===q.id);if(!p)continue;const d=Math.hypot((q.x-p.x)*.5,(q.y-p.y)*HEX_ROW_H);if(d>1e-9)changed.push({id:q.id,d,from:[p.x,p.y],to:[q.x,q.y],path:q.path,coupled:q.coupled});}changed.sort((u,v)=>v.d-u.d);}return{name,pileClock:g.pileFlowClock,pair:a&&b?hexPhysDist(a.v.x,a.v.y,b.v.x,b.v.y):null,analytic:aa&&bb?{a:aa,b:bb,d:pileFlowPhysicalDist(aa,bb)}:null,a:a&&{v:[a.v.x,a.v.y],path:a.b.fallPath?.[0]?.kind,supports:a.b.fallPath?.[0]?.followSupportIds||[]},b:b&&{v:[b.v.x,b.v.y],path:b.b.fallPath?.[0]?.kind,supports:b.b.fallPath?.[0]?.followSupportIds||[]},nearby:nearby.slice(0,18),changed:changed.slice(0,20),now};}
const g=createEngine(7);g.ai={level:3,target:null,thinkT:0,actT:0};for(let step=0;step<3414&&g.alive;step++){if(step===840)g.incomingShapes.push('PYRAMID');if(step===1680)g.incomingShapes.push('HEXAGON');if(step===2760)g.incomingShapes.push('STRAIGHT');if(step===3720)g.incoming+=8;stepEngine(g,PHYSICS_FRAME);}
// Advance only the analytic visual integration for the target frame; do not run the global contact solve yet.
updateVisuals(g,PHYSICS_FRAME);
const stages=[];let prev=all(g);let s=snap(g,'after-updateVisuals',null);delete s.now;stages.push(s);
// Recreate app-35's resolving branch exactly, but expose each mutation pass.
hexRestorePileFlowFrame(g);let n=all(g);s=snap(g,'after-analytic-restore',prev);delete s.now;stages.push(s);prev=n;
const baseSolve=typeof __hexResolveVisualContactsBeforeResidualPrecision==='function'?__hexResolveVisualContactsBeforeResidualPrecision:__hexResolveVisualContactsBeforeAuthoritativePileFlow;
hexWithFuturePileFlowWaitersFixed(g,()=>{for(let i=0;i<3;i++){baseSolve(g);const cur=all(g),q=snap(g,'after-baseSolve-'+(i+1),prev);delete q.now;stages.push(q);prev=cur;}});
if(typeof hexRestoreFuturePileFlowWaiters==='function'){hexRestoreFuturePileFlowWaiters(g);const cur=all(g),q=snap(g,'after-waiter-restore',prev);delete q.now;stages.push(q);prev=cur;}
if(typeof hexCanonicalizeFinishedPileVisuals==='function'){hexCanonicalizeFinishedPileVisuals(g);const cur=all(g),q=snap(g,'after-canonicalize',prev);delete q.now;stages.push(q);prev=cur;}
globalThis.__CP={stages};
`;
const ctx=runSuite(suite,{timeout:180000});console.log('SEED7_CONTACT_PASS_TRACE',JSON.stringify(ctx.__CP,null,2));
