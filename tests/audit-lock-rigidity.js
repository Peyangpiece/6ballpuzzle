const {runSuite}=require('./audit-harness');
const start=Math.max(1,Number(process.argv[2])||1),count=Math.max(1,Number(process.argv[3])||40),seconds=Math.max(10,Number(process.argv[4])||30);
const suite=String.raw`
const START=${start},COUNT=${count},SECONDS=${seconds};const events=[],stats={};
function add(type,data){stats[type]=(stats[type]||0)+1;if(events.length<120)events.push({type,...data});}
function groupMembersById(board,gid){return hexPhysGroups(board).get(gid)||[];}
const oldPlanGroup=hexPhysPlanGroup;
function compatiblePairsBeforeBreak(board,members){const out=[];if(members.length!==3)return out;for(let omit=0;omit<3;omit++){const pair=members.filter((_,i)=>i!==omit).map(m=>({...m,ball:{...m.ball,motionGroupSize:2,rigid:true}}));let plan=[];try{plan=oldPlanGroup(board,pair,true)||[];}catch(_){}if(plan.length)out.push({omit:members[omit].ball.id,pair:pair.map(m=>m.ball.id),kinds:plan.map(p=>p.kind)});}return out;}
hexPhysPlanGroup=function(board,members,preview=false){
 const initial=(members||[]).map(m=>({x:m.x,y:m.y,role:m.role,orientation:m.orientation,ball:m.ball})),gid=initial?.[0]?.ball?.motionGroupId||0;
 const compatible=!preview&&initial.length===3&&gid?compatiblePairsBeforeBreak(board,initial):[];
 const result=oldPlanGroup(board,members,preview)||[];
 if(!preview&&initial.length===3&&gid&&compatible.length&&!result.length){
   const ids=new Set(initial.map(m=>m.ball.id)),survivors=[...hexPhysGroups(board).values()].filter(gr=>gr.length===2&&gr.every(m=>ids.has(m.ball.id)));
   if(!survivors.length)add('full-break-loses-compatible-pair',{gid,members:[...ids],compatible});
 }
 return result;
};
const oldMark=markCollisionBalancedGaps;
markCollisionBalancedGaps=function(board){const g=board?._hexEngine,stuck=unstableFrozenBalls(board).map(q=>({...q}));const ret=oldMark(board);for(const q of stuck){const ball=board[q.y]?.[q.x],v=ball&&g?.vis.get(ball.id);let supports=[];if(v&&g){for(let y=boardScanMin(board);y<ROWS;y++)for(let x=0;x<W2;x++){const ob=valid(x,y)?board[y][x]:null,ov=ob&&g.vis.get(ob.id);if(!ob||ob===ball||!ov)continue;const dx=(ov.x-v.x)*.5,dy=(ov.y-v.y)*HEX_ROW_H,d=Math.hypot(dx,dy);if(d<=1.0005&&dy>1e-5)supports.push({id:ob.id,dx,dy,d,garbage:!!ob.isGarbage});}}const left=supports.some(s=>s.dx<-.02),right=supports.some(s=>s.dx>.02),direct=supports.some(s=>Math.abs(s.dx)<=.02);const floor=touchesFloorRow(q.y)||(v&&cellCenterYNorm(v.y)>=FLOOR_CENTER_N-1e-4);const wallL=v&&v.x<=1e-4,wallR=v&&v.x>=W2-1-1e-4;const geomStable=floor||direct||(left&&right)||(wallL&&right)||(wallR&&left);add(geomStable?'time-lock-geometrically-stable':'time-lock-without-static-support',{id:q.id,l:[q.x,q.y],visual:v?[v.x,v.y]:null,supports,floor,wallL,wallR});}return ret;};
const oldReleaseAll=releaseAllRigidity;
releaseAllRigidity=function(g,reason){add('release-all-rigidity-safety',{reason,state:g?.state,phase:g?.phase});return oldReleaseAll(g,reason);};
for(let seed=START;seed<START+COUNT;seed++){
 const g=createEngine(600000+seed);g.ai={level:1+seed%5,target:null,thinkT:0,actT:0};
 for(let step=0;step<Math.floor(SECONDS/PHYSICS_FRAME)&&g.alive;step++){
  if(step===120*6)g.incomingShapes.push('PYRAMID');if(step===120*11)g.incomingShapes.push('HEXAGON');if(step===120*16)g.incomingShapes.push('STRAIGHT');if(step===120*22)g.incoming+=7;
  stepEngine(g,PHYSICS_FRAME);
 }
}
globalThis.__AUDIT={start:START,count:COUNT,seconds:SECONDS,stats,events};
`;
const ctx=runSuite(suite,{timeout:420000});console.log('LOCK_RIGIDITY_AUDIT',JSON.stringify(ctx.__AUDIT,null,2));
if(ctx.__AUDIT.stats['full-break-loses-compatible-pair']||ctx.__AUDIT.stats['time-lock-without-static-support']||ctx.__AUDIT.stats['release-all-rigidity-safety'])process.exitCode=1;
