const fs=require("fs");
const vm=require("vm");
const path=require("path");
const {ctx}=require("./v1303-plan-group-smoke.js");

// Finish loading the production normal-ball authority layers in index.html order.
for(const file of[
  "app-collapse-timing-authoritative-v2.js",
  "app-runtime-performance-v3.js",
  "app-rigidity-final-authority-v1.js",
  "app-reference-upconvex-authority-v1.js",
  "app-reference-first-contact-sweep-v3.js"
])vm.runInContext(fs.readFileSync(path.join(__dirname,"../public",file),"utf8"),ctx,{filename:file});

const result=vm.runInContext(`
(()=>{
  function ball(id,role){return{
    id,c:role,
    motionGroupId:826140,
    motionGroupRole:role,
    motionGroupOrientation:"down",
    motionGroupSize:3,
    rigid:true,
    momentumX:0,
    rollDir:0,
    subCellBias:0
  };}
  const b=newBoard();
  const balls=[ball(140,0),ball(141,1),ball(142,2)];
  const members=[
    {ball:balls[0],x:7,y:2,role:0,orientation:"down"},
    {ball:balls[1],x:9,y:2,role:1,orientation:"down"},
    {ball:balls[2],x:8,y:3,role:2,orientation:"down"}
  ];
  for(const m of members)b[m.y][m.x]=m.ball;
  // One-sided support. This is the canonical local geometry represented by
  // the Nintendo 2026-08-14 F269-F273 inverted-triangle slope event.
  b[4][9]={id:149,c:4,motionGroupId:0,motionGroupSize:0,rigid:false};

  const preview=hexPhysPlanGroup(b,members,true)||[];
  function summary(p){return{
    id:p.ball.id,
    from:[p.x,p.y],to:[p.tx,p.ty],
    dx:p.tx-p.x,dy:p.ty-p.y,
    kind:p.kind,
    pivot:p.pivot||null,topPivot:p.topPivot||null,
    bundleId:Number(p.bundleId)||0,
    groupSize:Number(p.groupSize)||0
  };}
  const plan=preview.map(summary).sort((a,z)=>a.id-z.id);
  const rawById=new Map(preview.map(p=>[p.ball.id,p]));
  const durationById={};
  for(const p of preview){
    const state={vy:5,speed:5};
    durationById[p.ball.id]=typeof hexMotionDuration==="function"?hexMotionDuration(p,state):null;
  }

  function pd(a,z){return Math.hypot(a[0]-z[0],a[1]-z[1]);}
  const starts=new Map(members.map(m=>[m.ball.id,normPoint(m.x,m.y)]));
  const basePairs=[[140,141],[140,142],[141,142]];
  let maxPairDistanceError=0,maxTranslationMismatch=0;
  const samples=[];
  for(let i=0;i<=120;i++){
    const u=i/120;
    const pts=new Map(preview.map(p=>[p.ball.id,proposalPointAt(p,u)]));
    for(const [a,z] of basePairs){
      const base=pd(starts.get(a),starts.get(z));
      maxPairDistanceError=Math.max(maxPairDistanceError,Math.abs(pd(pts.get(a),pts.get(z))-base));
    }
    const d0=[pts.get(140)[0]-starts.get(140)[0],pts.get(140)[1]-starts.get(140)[1]];
    for(const id of [141,142]){
      const d=[pts.get(id)[0]-starts.get(id)[0],pts.get(id)[1]-starts.get(id)[1]];
      maxTranslationMismatch=Math.max(maxTranslationMismatch,Math.hypot(d[0]-d0[0],d[1]-d0[1]));
    }
    if(i%30===0)samples.push({u,p140:pts.get(140),p141:pts.get(141),p142:pts.get(142)});
  }

  const commit=hexPhysPlanGroup(b,members,false)||[];
  return{
    plan,
    commit:commit.map(summary).sort((a,z)=>a.id-z.id),
    durationById,
    maxPairDistanceError,
    maxTranslationMismatch,
    samples,
    rigidAfterCommit:members.map(m=>({id:m.ball.id,gid:m.ball.motionGroupId,size:m.ball.motionGroupSize,rigid:!!m.ball.rigid})),
    reference:{source:"2026-08-14 Nintendo capture 859W F269-F273",nominalFps:30,visibleIntervals:4,visibleDuration:4/30,observedVector:[-1,1]}
  };
})()
`,ctx);

console.log("NINTENDO_20260814_INVERTED_RIGID_SLOPE",JSON.stringify(result));
if(result.plan.length!==3)throw new Error(`expected 3 rigid members, got ${result.plan.length}`);
for(const p of result.plan){
  if(p.dx!==-1||p.dy!==1)throw new Error(`Nintendo slope vector changed for ${p.id}: ${p.dx},${p.dy}`);
  if(p.kind!=="GROUP_SLOPE_TRANSLATE")throw new Error(`not rigid slope for ${p.id}: ${p.kind}`);
  if(p.groupSize!==3||p.bundleId!==826140)throw new Error(`rigid bundle metadata lost for ${p.id}`);
}
if(result.commit.length!==3)throw new Error("commit did not preserve 3-member slope");
if(result.maxPairDistanceError>1e-9)throw new Error(`rigid pair distance drift ${result.maxPairDistanceError}`);
if(result.maxTranslationMismatch>1e-9)throw new Error(`members do not share one rigid translation ${result.maxTranslationMismatch}`);
if(result.rigidAfterCommit.some(q=>!q.rigid||q.size!==3||q.gid!==826140))throw new Error("triplet rigidity released during legal Nintendo slope continuation");
const ds=Object.values(result.durationById).filter(Number.isFinite);
if(ds.length!==3)throw new Error("generic slope duration unavailable");
if(Math.max(...ds)-Math.min(...ds)>1e-12)throw new Error(`rigid members have different durations: ${ds.join(",")}`);
console.log("2026-08-14 Nintendo inverted rigid-slope geometry PASS",JSON.stringify({duration:ds[0],referenceVisibleDuration:result.reference.visibleDuration,maxPairDistanceError:result.maxPairDistanceError,maxTranslationMismatch:result.maxTranslationMismatch}));
