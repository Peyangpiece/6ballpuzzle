const fs=require("fs");
const vm=require("vm");
const path=require("path");
const {ctx}=require("./v1303-plan-group-smoke.js");

// Finish loading the ordinary-ball production authority layers in index order.
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
    id,c:4,
    motionGroupId:826566,
    motionGroupRole:role,
    motionGroupOrientation:"down",
    motionGroupSize:3,
    rigid:true,
    momentumX:0,rollDir:0,subCellBias:0,
    visualTripletId:826566,
    visualTripletOrientation:"down",
    visualTripletRole:role
  };}
  const b=newBoard();
  const left=ball(5661,0),right=ball(5662,1),bottom=ball(5663,2);
  const members=[
    {ball:left,x:9,y:8,role:0,orientation:"down"},
    {ball:right,x:11,y:8,role:1,orientation:"down"},
    {ball:bottom,x:10,y:9,role:2,orientation:"down"}
  ];
  for(const m of members)b[m.y][m.x]=m.ball;
  // Nintendo source F566 contact geometry: the lower centre is held by the
  // two red balls immediately below it. The two upper purple balls are free to
  // roll simultaneously around that centre to the left and right.
  b[10][9]={id:5691,c:0,motionGroupId:0,motionGroupSize:0,rigid:false};
  b[10][11]={id:5692,c:0,motionGroupId:0,motionGroupSize:0,rigid:false};

  const before=members.map(m=>({id:m.ball.id,gid:m.ball.motionGroupId,size:m.ball.motionGroupSize,rigid:!!m.ball.rigid}));
  const firstMoved=settlePass(b,false);
  const afterFirst=members.map(m=>({id:m.ball.id,gid:m.ball.motionGroupId,size:m.ball.motionGroupSize,rigid:!!m.ball.rigid,path:(m.ball.fallPath||[]).map(s=>({kind:s.kind,from:s.from,to:s.to,pivot:s.pivot,motionSeq:s.motionSeq}))}));
  const secondMoved=settlePass(b,false);
  const afterSecond=members.map(m=>({id:m.ball.id,gid:m.ball.motionGroupId,size:m.ball.motionGroupSize,rigid:!!m.ball.rigid,path:(m.ball.fallPath||[]).map(s=>({kind:s.kind,from:s.from,to:s.to,pivot:s.pivot,motionSeq:s.motionSeq}))}));

  const moving=[left,right].map(ball=>{
    const seg=ball.fallPath?.[0]||null;
    const state={vy:RELEASE_INITIAL_VY,speed:RELEASE_INITIAL_VY};
    return{
      id:ball.id,
      seg:seg?{kind:seg.kind,from:seg.from,to:seg.to,pivot:seg.pivot,motionSeq:seg.motionSeq}:null,
      duration:seg?hexMotionDuration(seg,state):null
    };
  });
  const occupied=[];
  for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y)&&b[y][x])occupied.push([b[y][x].id,x,y]);
  return{
    before,firstMoved,afterFirst,secondMoved,afterSecond,moving,occupied,
    reference:{source:"Nintendo 2026-08-14 859W absolute F566-F570",fps:30,contactFrame:566,finalFrame:570,intervals:4,duration:4/30}
  };
})()
`,ctx);

console.log("NINTENDO_20260814_INVERTED_FLAT_SPLIT_DIAGNOSTIC",JSON.stringify(result));

const left=result.occupied.find(q=>q[0]===5661);
const right=result.occupied.find(q=>q[0]===5662);
const bottom=result.occupied.find(q=>q[0]===5663);
if(!left||left[1]!==8||left[2]!==9)throw new Error(`left outward target mismatch: ${JSON.stringify(left)}`);
if(!right||right[1]!==12||right[2]!==9)throw new Error(`right outward target mismatch: ${JSON.stringify(right)}`);
if(!bottom||bottom[1]!==10||bottom[2]!==9)throw new Error(`bottom centre moved: ${JSON.stringify(bottom)}`);
if(result.moving.some(q=>!q.seg||!Array.isArray(q.seg.pivot)||q.seg.pivot[0]!==10||q.seg.pivot[1]!==9))throw new Error("outward rolls do not share the lower-centre pivot");
if(result.moving[0].seg.motionSeq!==result.moving[1].seg.motionSeq)throw new Error("left/right split does not start in one motion batch");
console.log("2026-08-14 Nintendo inverted flat-split geometry PASS",JSON.stringify({firstMoved:result.firstMoved,secondMoved:result.secondMoved,currentDuration:result.moving[0].duration,referenceDuration:result.reference.duration}));
