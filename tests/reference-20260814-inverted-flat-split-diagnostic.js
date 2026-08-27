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
  "app-reference-inverted-flat-split-v1.js"
])vm.runInContext(fs.readFileSync(path.join(__dirname,"../public",file),"utf8"),ctx,{filename:file});

const result=vm.runInContext(`
(()=>{
  function ball(id,role){return{id,c:4,motionGroupId:826567,motionGroupRole:role,motionGroupOrientation:"down",motionGroupSize:3,rigid:true,momentumX:0,rollDir:0,subCellBias:0,visualTripletId:826567,visualTripletOrientation:"down",visualTripletRole:role};}
  const g=createEngine(826567),b=g.board;
  const left=ball(5671,0),right=ball(5672,1),bottom=ball(5673,2);
  const members=[{ball:left,x:9,y:8,role:0,orientation:"down"},{ball:right,x:11,y:8,role:1,orientation:"down"},{ball:bottom,x:10,y:9,role:2,orientation:"down"}];
  for(const m of members){b[m.y][m.x]=m.ball;noteBoardCell(b,m.y,m.ball);g.vis.set(m.ball.id,{x:m.x,y:m.y,vy:5,motionSpeed:5,justReleased:true,sq:0});}
  const supportL={id:5791,c:0,motionGroupId:0,motionGroupSize:0,rigid:false},supportR={id:5792,c:0,motionGroupId:0,motionGroupSize:0,rigid:false};
  b[10][9]=supportL;b[10][11]=supportR;noteBoardCell(b,10,supportL);noteBoardCell(b,10,supportR);
  g.vis.set(supportL.id,{x:9,y:10,vy:0,motionSpeed:0,sq:0});g.vis.set(supportR.id,{x:11,y:10,vy:0,motionSpeed:0,sq:0});

  // Captured Nintendo contact occurs on an already-settled receiving pile.
  // Stabilize the two pivot supports on the floor so this fixture tests the
  // intended inverted split instead of letting the supports fall first.
  for(const [id,x] of [[5801,8],[5802,10],[5803,12]]){
    const base={id,c:0,motionGroupId:0,motionGroupSize:0,rigid:false};
    b[11][x]=base;noteBoardCell(b,11,base);
    g.vis.set(id,{x,y:11,vy:0,motionSpeed:0,sq:0});
  }

  const ownIds=new Set(members.map(m=>m.ball.id));
  const s=hexPhysSupportInfo(b,10,9);
  const probeL={x:9,y:8,tx:8,ty:9,ball:left,kind:"REFERENCE_INVERTED_HARD_SPLIT_LEFT",pivot:[10,9],topPivot:null,followSupportIds:[],bundleId:826567,groupSize:0};
  const probeR={x:11,y:8,tx:12,ty:9,ball:right,kind:"REFERENCE_INVERTED_HARD_SPLIT_RIGHT",pivot:[10,9],topPivot:null,followSupportIds:[],bundleId:826567,groupSize:0};
  function minStationary(p){
    let best={dist:Infinity,id:null,cell:null,t:null};
    for(let y=boardScanMin(b);y<ROWS;y++)for(let x=0;x<W2;x++){
      const q=valid(x,y)?b[y][x]:null;if(!q||q.id===p.ball.id||ownIds.has(q.id))continue;
      const qp=normPoint(x,y);
      for(let i=1;i<=128;i++){const t=i/128,pt=proposalPointAt(p,t),d=Math.hypot(pt[0]-qp[0],pt[1]-qp[1]);if(d<best.dist)best={dist:d,id:q.id,cell:[x,y],t};}
    }
    return best;
  }
  const directPreview=hexPhysPlanGroup(b,members,true)||[];
  const preDiag={
    scanMin:boardScanMin(b),groupSizes:[...hexPhysGroups(b).values()].map(q=>q.map(m=>[m.ball.id,m.x,m.y,m.orientation])),
    support:{floor:!!s.floor,count:s.count,realCount:s.realCount,leftId:s.left.ball?.id||null,rightId:s.right.ball?.id||null},
    targets:{left:{valid:valid(8,9),occupied:b[9][8]?.id||null},right:{valid:valid(12,9),occupied:b[9][12]?.id||null}},
    pathHits:{left:hexPhysPathHitsStationary(probeL,b,ownIds),right:hexPhysPathHitsStationary(probeR,b,ownIds)},
    minStationary:{left:minStationary(probeL),right:minStationary(probeR)},
    directPreview:directPreview.map(p=>({id:p.ball.id,from:[p.x,p.y],to:[p.tx,p.ty],kind:p.kind,pivot:p.pivot,groupSize:p.groupSize,bundleId:p.bundleId}))
  };

  const before=members.map(m=>({id:m.ball.id,gid:m.ball.motionGroupId,size:m.ball.motionGroupSize,rigid:!!m.ball.rigid}));
  const firstMoved=settlePass(b,false);
  const afterFirst=members.map(m=>({id:m.ball.id,gid:m.ball.motionGroupId,size:m.ball.motionGroupSize,rigid:!!m.ball.rigid,path:(m.ball.fallPath||[]).map(s=>({kind:s.kind,from:s.from,to:s.to,pivot:s.pivot,motionSeq:s.motionSeq,bundleId:s.bundleId,groupSize:s.groupSize}))}));
  const moving=[left,right].map(ball=>{const seg=ball.fallPath?.[0]||null,state={vy:5,speed:5},duration=seg?hexMotionDuration(seg,state):null;return{id:ball.id,seg:seg?{kind:seg.kind,from:seg.from,to:seg.to,pivot:seg.pivot,motionSeq:seg.motionSeq,bundleId:seg.bundleId,groupSize:seg.groupSize}:null,duration,endState:state};});
  function physDist(a,z){return Math.hypot((a[0]-z[0])*.5,(a[1]-z[1])*HEX_ROW_H);}
  function angleAround(pt,pivot){return Math.atan2((pt[1]-pivot[1])*HEX_ROW_H,(pt[0]-pivot[0])*.5);}
  let maxRadiusError=0,maxAngularProgressError=0,maxMirrorError=0;const samples=[],segL=left.fallPath?.[0],segR=right.fallPath?.[0];
  if(segL&&segR){const pivot=[10,9],a0L=angleAround(segL.from,pivot),a0R=angleAround(segR.from,pivot),total=Math.PI/3;for(let i=0;i<=120;i++){const u=i/120,pL=liveSegPoint(segL,u,{vy:5,speed:5},moving[0].duration),pR=liveSegPoint(segR,u,{vy:5,speed:5},moving[1].duration);maxRadiusError=Math.max(maxRadiusError,Math.abs(physDist(pL,pivot)-1),Math.abs(physDist(pR,pivot)-1));let dL=angleAround(pL,pivot)-a0L,dR=angleAround(pR,pivot)-a0R;while(dL>Math.PI)dL-=TAU;while(dL<-Math.PI)dL+=TAU;while(dR>Math.PI)dR-=TAU;while(dR<-Math.PI)dR+=TAU;maxAngularProgressError=Math.max(maxAngularProgressError,Math.abs(dL+total*u),Math.abs(dR-total*u));maxMirrorError=Math.max(maxMirrorError,Math.abs((pL[0]+pR[0])-20),Math.abs(pL[1]-pR[1]));if(i%30===0)samples.push({u,pL,pR,dL,dR});}}
  const occupied=[];for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y)&&b[y][x])occupied.push([b[y][x].id,x,y]);
  return{authority:window.__sixBallReferenceInvertedFlatSplitVersion||null,preDiag,firstMoved,before,afterFirst,moving,occupied,maxRadiusError,maxAngularProgressError,maxMirrorError,samples,choice:window.__sixBallLastReferenceInvertedFlatSplitV1||null,reference:{source:"Nintendo 2026-08-14 859W absolute F567-F571",fps:30,contactFrame:567,finalFrame:571,intervals:4,duration:4/30}};
})()
`,ctx);
console.log("NINTENDO_20260814_INVERTED_FLAT_SPLIT",JSON.stringify(result));
if(result.authority!=="reference-inverted-flat-split-v1")throw new Error(`authority missing: ${result.authority}`);
if(result.firstMoved!==true)throw new Error("split did not begin on the first contact settle pass");
const left=result.occupied.find(q=>q[0]===5671),right=result.occupied.find(q=>q[0]===5672),bottom=result.occupied.find(q=>q[0]===5673);
if(!left||left[1]!==8||left[2]!==9)throw new Error(`left outward target mismatch: ${JSON.stringify(left)} diag=${JSON.stringify(result.preDiag)}`);
if(!right||right[1]!==12||right[2]!==9)throw new Error(`right outward target mismatch: ${JSON.stringify(right)}`);
if(!bottom||bottom[1]!==10||bottom[2]!==9)throw new Error(`bottom centre moved: ${JSON.stringify(bottom)}`);
if(result.moving.some(q=>!q.seg||!Array.isArray(q.seg.pivot)||q.seg.pivot[0]!==10||q.seg.pivot[1]!==9))throw new Error("outward rolls do not share the lower-centre pivot");
if(result.moving[0].seg.motionSeq!==result.moving[1].seg.motionSeq)throw new Error("left/right split does not start in one motion batch");
if(result.moving[0].seg.kind!=="REFERENCE_INVERTED_HARD_SPLIT_LEFT")throw new Error(`left hard kind mismatch: ${result.moving[0].seg.kind}`);
if(result.moving[1].seg.kind!=="REFERENCE_INVERTED_HARD_SPLIT_RIGHT")throw new Error(`right hard kind mismatch: ${result.moving[1].seg.kind}`);
for(const q of result.moving)if(Math.abs(q.duration-result.reference.duration)>1e-12)throw new Error(`hard split timing mismatch ${q.id}: ${q.duration}`);
if(result.afterFirst.some(q=>q.gid!==0||q.size!==0||q.rigid))throw new Error("inverted flat split retained stale triplet rigidity");
if(result.afterFirst.find(q=>q.id===5673)?.path?.length)throw new Error("stable lower centre received a motion path");
if(result.maxRadiusError>1e-9)throw new Error(`pivot radius drift: ${result.maxRadiusError}`);
if(result.maxAngularProgressError>1e-9)throw new Error(`constant-angle timing drift: ${result.maxAngularProgressError}`);
if(result.maxMirrorError>1e-9)throw new Error(`left/right mirror drift: ${result.maxMirrorError}`);
console.log("2026-08-14 Nintendo inverted flat-split F567-F571 PASS",JSON.stringify({duration:result.moving[0].duration,firstMoved:result.firstMoved,maxRadiusError:result.maxRadiusError,maxAngularProgressError:result.maxAngularProgressError,maxMirrorError:result.maxMirrorError}));