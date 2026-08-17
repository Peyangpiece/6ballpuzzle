const {runSuite}=require('./audit-harness');
const suite=String.raw`
const g=createEngine(8);g.ai={level:4,target:null,thinkT:0,actT:0};let hit=null;
function descGroup(gid){const gr=hexPhysGroups(g.board).get(gid)||[];return gr.map(m=>{const v=g.vis.get(m.ball.id),p=(m.ball.fallPath||[]).slice(0,3).map(s=>({from:s.from,to:s.to,kind:s.kind,motionSeq:s.motionSeq,bundleId:s.bundleId||0,pivot:s.pivot,topPivot:s.topPivot}));return{id:m.ball.id,logical:[m.x,m.y],visual:v?[v.x,v.y]:null,role:m.ball.motionGroupRole,path:p};});}
for(let step=0;step<=1800&&g.alive&&!hit;step++){
 if(step===120*5)g.incomingShapes.push('PYRAMID');if(step===120*10)g.incomingShapes.push('HEXAGON');if(step===120*15)g.incomingShapes.push('STRAIGHT');if(step===120*20)g.incoming+=8;
 stepEngine(g,PHYSICS_FRAME);
 for(let y=boardScanMin(g.board);y<ROWS&&!hit;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id),s=b?.fallPath?.[0];if(b?.motionGroupId&&v&&s?.from&&s?.to&&s.to[1]<s.from[1]-1e-6){hit={step,state:g.state,phase:g.phase,gid:b.motionGroupId,triggerId:b.id,group:descGroup(b.motionGroupId),pileClock:g.pileFlowClock};}}
}
globalThis.__RIGID_RECOIL=hit;
`;
const ctx=runSuite(suite,{timeout:180000});console.log('SEED8_RIGID_RECOIL',JSON.stringify(ctx.__RIGID_RECOIL,null,2));if(!ctx.__RIGID_RECOIL)process.exitCode=1;
