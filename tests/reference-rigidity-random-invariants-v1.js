const fs=require("fs");
const vm=require("vm");
const path=require("path");
const {ctx}=require("./v1303-plan-group-smoke.js");

for(const file of[
  "app-collapse-timing-authoritative-v2.js",
  "app-runtime-performance-v3.js",
  "app-rigidity-final-authority-v1.js",
  "app-reference-upconvex-authority-v1.js",
  "app-reference-first-contact-sweep-v3.js",
  "app-reference-inverted-flat-split-v1.js",
  "app-rigidity-nintendo-authority-v1.js"
])vm.runInContext(fs.readFileSync(path.join(__dirname,"../public",file),"utf8"),ctx,{filename:file});

vm.runInContext(`
window.__nrNewBoard=()=>newBoard();
window.__nrValid=(x,y)=>valid(x,y);
window.__nrPlan=(board,members,preview)=>hexPhysPlanGroup(board,members,preview)||[];
window.__nrPoint=(p,t)=>proposalPointAt(p,t);
window.__nrNorm=(x,y)=>normPoint(x,y);
window.__nrDist=(x1,y1,x2,y2)=>hexPhysDist(x1,y1,x2,y2);
`,ctx);

const rows=fs.readFileSync(path.join(__dirname,"oracles/v1303-plan-group-10000.jsonl"),"utf8").trim().split("\n").map(JSON.parse);
if(rows.length!==10000)throw new Error(`expected 10000 oracle inputs, got ${rows.length}`);

function groupBall(m,gid){return{id:m.id,c:m.role%5,motionGroupId:gid,motionGroupRole:m.role,motionGroupOrientation:m.orientation,motionGroupSize:3,rigid:true,momentumX:0,rollDir:0,subCellBias:0,isGarbage:false};}
function obstacleBall(o){return{id:o.id,c:o.c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0,rigid:false,momentumX:0,isGarbage:false};}
function build(input,index){
 const board=ctx.__nrNewBoard(),gid=880000+index,members=input.members.map(m=>{const ball=groupBall(m,gid);board[m.y][m.x]=ball;return{ball,x:m.x,y:m.y,role:m.role,orientation:m.orientation};});
 for(const o of input.obstacles)board[o.y][o.x]=obstacleBall(o);
 return{board,members};
}
function canon(plan){return(plan||[]).map(p=>({id:Number(p.ball?.id||-1),x:Number(p.x),y:Number(p.y),tx:Number(p.tx),ty:Number(p.ty),kind:String(p.kind||""),bundle:Number(p.bundleId||0),size:Number(p.groupSize||0)})).sort((a,b)=>a.id-b.id||a.x-b.x||a.y-b.y);}
function metadata(members){return members.map(m=>[m.ball.id,m.ball.motionGroupId,m.ball.motionGroupRole,m.ball.motionGroupOrientation,m.ball.motionGroupSize,!!m.ball.rigid,m.ball.momentumX,m.ball.rollDir,m.ball.subCellBias]);}
function close(a,b,eps=3e-5){return Math.abs(a-b)<=eps;}
function planInvariant(board,members,plan,index){
 const moving=plan.filter(p=>Number.isFinite(Number(p.tx))&&Number.isFinite(Number(p.ty))&&(Number(p.tx)!==Number(p.x)||Number(p.ty)!==Number(p.y))),movingIds=new Set(moving.map(p=>p.ball.id)),targetKeys=new Set();
 for(const p of moving){
  if(!ctx.__nrValid(p.tx,p.ty))throw new Error(`case ${index}: invalid target ${p.tx},${p.ty}`);
  const key=p.tx+","+p.ty;if(targetKeys.has(key))throw new Error(`case ${index}: duplicate target ${key}`);targetKeys.add(key);
  const q=board[p.ty]?.[p.tx]||null;if(q&&!movingIds.has(q.id)&&q.id!==p.ball.id)throw new Error(`case ${index}: target overlaps stationary ball ${q.id}`);
 }
 const memberById=new Map(members.map(m=>[m.ball.id,m]));
 const grouped=new Map();
 for(const p of moving){const size=Number(p.groupSize)||0;if(size<2)continue;const key=(Number(p.bundleId)||0)?`b:${p.bundleId}`:`s:${size}`;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(p);}
 for(const steps of grouped.values()){
  const size=Number(steps[0].groupSize)||0,cohortIds=new Set(steps.map(p=>p.ball.id));
  if(size===3)for(const m of members)cohortIds.add(m.ball.id);
  if(size===2&&cohortIds.size===1){const p=steps[0];if(Array.isArray(p.followSupportIds))for(const sid of p.followSupportIds)if(memberById.has(sid))cohortIds.add(sid);if(cohortIds.size===1&&Array.isArray(p.pivot)){const fixed=members.find(m=>Number(m.x)===Number(p.pivot[0])&&Number(m.y)===Number(p.pivot[1]));if(fixed)cohortIds.add(fixed.ball.id);}}
  if(cohortIds.size!==size)throw new Error(`case ${index}: declared rigid size ${size} but cohort has ${cohortIds.size}`);
  const cohort=[...cohortIds].map(id=>memberById.get(id)).filter(Boolean),byId=new Map(steps.map(p=>[p.ball.id,p]));
  for(let a=0;a<cohort.length;a++)for(let b=a+1;b<cohort.length;b++){
   const ma=cohort[a],mb=cohort[b],d0=ctx.__nrDist(ma.x,ma.y,mb.x,mb.y);
   for(let k=0;k<=32;k++){const t=k/32,pa=byId.has(ma.ball.id)?ctx.__nrPoint(byId.get(ma.ball.id),t):ctx.__nrNorm(ma.x,ma.y),pb=byId.has(mb.ball.id)?ctx.__nrPoint(byId.get(mb.ball.id),t):ctx.__nrNorm(mb.x,mb.y),d=Math.hypot(pa[0]-pb[0],pa[1]-pb[1]);if(!close(d,d0))throw new Error(`case ${index}: rigid distance changed ${d0} -> ${d} at t=${t}`);}
  }
 }
}

let moved=0,rigidPlans=0,splits=0,stable=0;
for(let i=0;i<rows.length;i++){
 const row=rows[i],a=build(row.input,row.index),before=JSON.stringify(metadata(a.members)),preview=ctx.__nrPlan(a.board,a.members,true),after=JSON.stringify(metadata(a.members));
 if(before!==after)throw new Error(`case ${row.index}: preview mutated rigidity metadata`);
 planInvariant(a.board,a.members,preview,row.index);
 const b=build(row.input,row.index),commit=ctx.__nrPlan(b.board,b.members,false);planInvariant(b.board,b.members,commit,row.index);
 if(JSON.stringify(canon(preview))!==JSON.stringify(canon(commit)))throw new Error(`case ${row.index}: preview/commit mismatch\npreview=${JSON.stringify(canon(preview))}\ncommit=${JSON.stringify(canon(commit))}`);
 if(preview.length)moved++;else stable++;
 if(preview.some(p=>Number(p.groupSize)>=2))rigidPlans++;
 if(preview.some(p=>Number(p.groupSize)===0))splits++;
 if((i+1)%1000===0)console.log(`Nintendo rigidity invariant audit ${i+1}/10000`);
}
console.log("Nintendo rigidity 10000-case invariant audit PASS",JSON.stringify({cases:rows.length,moved,stable,rigidPlans,splits}));
