const fs=require("fs");
const vm=require("vm");
const path=require("path");

const PUBLIC=path.join(__dirname,"../public");
const rigidSource=fs.readFileSync(path.join(PUBLIC,"app-upconvex-rigid-until-contact-v1.js"),"utf8");
const sideSource=fs.readFileSync(path.join(PUBLIC,"app-upconvex-contact-priority-v1.js"),"utf8");
const pocketSource=fs.readFileSync(path.join(PUBLIC,"app-upconvex-pocket-capture-v1.js"),"utf8");

function expect(v,m){if(!v)throw new Error(m);}
function board(){return Array.from({length:12},()=>Array(19).fill(null));}
function valid(x,y){return Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&x<19&&y>=0&&y<12;}
function upMembers(offset=0){
  const balls=[0,1,2].map(i=>({id:100+i,c:i,isGarbage:false,motionGroupId:500,motionGroupRole:i,motionGroupOrientation:"up",motionGroupSize:3,rigid:true,impactOffsetX:offset,momentumX:Math.sign(offset)}));
  return [
    {ball:balls[0],x:6,y:3,role:0,orientation:"up"},
    {ball:balls[1],x:7,y:4,role:1,orientation:"up"},
    {ball:balls[2],x:5,y:4,role:2,orientation:"up"}
  ];
}

function install(ctx,source,name){
  ctx.window=ctx;
  ctx.globalThis=ctx;
  vm.createContext(ctx);
  vm.runInContext(source,ctx,{filename:name});
  return ctx;
}

function baseSplit(members){
  return members.map((m,i)=>({x:m.x,y:m.y,tx:m.x+(i===2?-1:1),ty:m.y+1,ball:m.ball,kind:"BASE_SPLIT",bundleId:i<2?700:0,groupSize:i<2?2:0}));
}

function clearGroup(ball){
  ball.motionGroupId=0;
  ball.motionGroupRole=-1;
  ball.motionGroupOrientation="";
  ball.motionGroupSize=0;
  ball.rigid=false;
}

function rigidCase({realPivot=true,canonicalRigid=true,deform=false}={}){
  const b=board(),members=upMembers(0);
  if(deform)members[0].x+=2;
  for(const m of members)b[m.y][m.x]=m.ball;
  const support={id:999,c:4,isGarbage:false,motionGroupId:0,rigid:false};
  if(realPivot)b[5][8]=support;

  const split=baseSplit(members);
  const ctx={console,Math,Date,Map,Set,Array,Object,Number,String,Boolean,JSON,Error,TypeError,valid};
  ctx.hexPhysClearGroupBall=clearGroup;
  ctx.hexPhysPlanGroup=()=>split.map(p=>({...p}));
  ctx.hexPhysIndependentMemberMotion=(bb,mm,m)=>({x:m.x,y:m.y,tx:m.x+1,ty:m.y+1,ball:m.ball,kind:"ROLL_RIGHT",pivot:realPivot?[8,5]:null,topPivot:null});
  ctx.hexPhysRigidSlopePlan=(bb,mm,motions)=>canonicalRigid?mm.map(m=>({x:m.x,y:m.y,tx:m.x+1,ty:m.y+1,ball:m.ball,kind:"GROUP_SLOPE_TRANSLATE",pivot:[8,5],topPivot:null,bundleId:500,groupSize:3})):null;

  install(ctx,rigidSource,"app-upconvex-rigid-until-contact-v1.js");
  const out=ctx.hexPhysPlanGroup(b,members,false);
  return{ctx,out,members};
}

/* Genuine current slope contact keeps all three rigid. */
{
  const {ctx,out}=rigidCase({realPivot:true,canonicalRigid:true});
  expect(ctx.__sixBallUpConvexRigidUntilImpossibleVersion==="upconvex-rigidity-partial-release-v2.3","v2.3 wrapper did not install");
  expect(out.length===3&&out.every(p=>p.groupSize===3&&p.kind==="GROUP_SLOPE_TRANSLATE"),"genuine current rigid slope was not preserved");
}

/*
 * A triplet already descending a slope must finish every still-legal common
 * slope step before an inward V-pocket is allowed to release one member.
 * The pocket candidate describes a possible later split, not the current
 * physical event.
 */
{
  const b=board(),members=upMembers(-.35);
  for(const m of members){
    m.ball._smoothSlopeRigidV39=true;
    b[m.y][m.x]=m.ball;
  }
  b[6][5]={id:971,c:0,isGarbage:false};
  b[6][7]={id:972,c:1,isGarbage:false};

  const ctx={console,Math,Date,Map,Set,Array,Object,Number,String,Boolean,JSON,Error,TypeError,valid};
  ctx.hexPhysClearGroupBall=clearGroup;
  ctx.hexPhysPlanGroup=(bb,mm)=>baseSplit(mm);
  ctx.hexPhysIndependentMemberMotion=(bb,mm,m)=>({
    x:m.x,y:m.y,tx:m.x-1,ty:m.y+1,ball:m.ball,
    kind:"ROLL_LEFT",pivot:[7,6],topPivot:null
  });
  ctx.hexPhysRigidSlopePlan=(bb,mm)=>mm.map(m=>({
    x:m.x,y:m.y,tx:m.x-1,ty:m.y+1,ball:m.ball,
    kind:"GROUP_SLOPE_TRANSLATE",pivot:[7,6],topPivot:null,
    bundleId:500,groupSize:3
  }));
  ctx.hexPhysGroupTranslationPlan=(bb,mm,dx,dy,kind)=>mm.map(m=>({
    x:m.x,y:m.y,tx:m.x+dx,ty:m.y+dy,ball:m.ball,
    kind,pivot:null,topPivot:null,bundleId:500,groupSize:mm.length
  }));

  install(ctx,rigidSource,"app-upconvex-rigid-until-contact-v1.js");
  const out=ctx.hexPhysPlanGroup(b,members,false);

  expect(
    out.length===3&&out.every(p=>p.groupSize===3&&p.kind==="GROUP_SLOPE_TRANSLATE"&&p.tx-p.x===-1&&p.ty-p.y===1),
    "active downhill rigid step split early at a future pocket: "+JSON.stringify(out.map(p=>({id:p.ball.id,kind:p.kind,groupSize:p.groupSize,to:[p.tx,p.ty]})))
  );
  expect(members.every(m=>m.ball.rigid&&m.ball.motionGroupSize===3),"active downhill triplet lost rigidity metadata");
}

/* Empty collision-safe space cannot invent rigidity. */
{
  const {ctx,out}=rigidCase({realPivot:false,canonicalRigid:true});
  expect(ctx.__sixBallUpConvexNoSyntheticRigidTranslation===true,"no-synthetic-rigidity policy missing");
  expect(out.every(p=>p.kind==="BASE_SPLIT"),"triplet stayed rigid without a real current support pivot");
}

/* Canonical current-contact slope rejection releases to base physics. */
{
  const {out}=rigidCase({realPivot:true,canonicalRigid:false});
  expect(out.every(p=>p.kind==="BASE_SPLIT"),"triplet stayed rigid after canonical rigid slope became impossible");
}

/* Deformed/separated members must never be reconstructed as a rigid triplet. */
{
  const {out}=rigidCase({realPivot:true,canonicalRigid:true,deform:true});
  expect(out.every(p=>p.kind==="BASE_SPLIT"),"deformed/separated group was incorrectly re-rigidified");
}

/*
 * Exact regression from the user's recording.
 *
 * Layout:
 *      BLUE(100)
 * YELLOW(102) RED(101)
 *
 * YELLOW currently has no independent solo move.  v2.2 incorrectly treated
 * that REST/null as proof that yellow must detach, yielding BLUE+RED.
 * But RED's next left/down position is a real V-pocket supported by two pile
 * balls.  RED must detach into that pocket while BLUE+YELLOW stay rigid and
 * continue LEFT.
 */
{
  const b=board(),members=upMembers(0);
  for(const m of members)b[m.y][m.x]=m.ball;

  const pileRed={id:901,c:0,isGarbage:false};
  const pileGreen={id:902,c:1,isGarbage:false};
  b[6][5]=pileRed;
  b[6][7]=pileGreen;

  const ctx={console,Math,Date,Map,Set,Array,Object,Number,String,Boolean,JSON,Error,TypeError,valid};
  ctx.hexPhysClearGroupBall=clearGroup;

  ctx.hexPhysIndependentMemberMotion=(bb,mm,m)=>{
    if(m.ball.id===102)return null; // misleading current REST on yellow
    if(m.ball.id===101)return {x:7,y:4,tx:6,ty:5,ball:m.ball,kind:"ROLL_LEFT",pivot:[7,6],topPivot:null};
    return {x:6,y:3,tx:5,ty:4,ball:m.ball,kind:"ROLL_LEFT",pivot:[7,6],topPivot:null};
  };

  ctx.hexPhysRigidSlopePlan=(bb,mm)=>mm.map(m=>({
    x:m.x,y:m.y,
    tx:m.x-1,ty:m.y+1,
    ball:m.ball,
    kind:"GROUP_SLOPE_TRANSLATE",
    pivot:[7,6],topPivot:null,
    bundleId:500,groupSize:3
  }));

  /* If the new physical event does not pre-empt, this intentionally returns
     the old wrong 3-ball continuation. */
  ctx.hexPhysPlanGroup=(bb,mm)=>mm.map(m=>({
    x:m.x,y:m.y,
    tx:m.x+1,ty:m.y+1,
    ball:m.ball,
    kind:"GROUP_SLOPE_TRANSLATE",
    bundleId:500,
    groupSize:mm.length
  }));

  ctx.hexPhysGroupTranslationPlan=(bb,mm,dx,dy,kind)=>mm.map(m=>({
    x:m.x,y:m.y,
    tx:m.x+dx,ty:m.y+dy,
    ball:m.ball,
    kind,
    pivot:null,topPivot:null,
    bundleId:500,
    groupSize:mm.length
  }));

  install(ctx,rigidSource,"app-upconvex-rigid-until-contact-v1.js");
  const out=ctx.hexPhysPlanGroup(b,members,false);

  const pair=out.filter(p=>p.groupSize===2);
  const solo=out.find(p=>p.ball.id===101);

  expect(ctx.__sixBallUpPocketCaptureHasPriority===true,"pocket-capture priority missing");
  expect(ctx.__sixBallUpRestAloneDoesNotChooseSolo===true,"REST-alone rejection policy missing");
  expect(pair.length===2&&pair.every(p=>[100,102].includes(p.ball.id)&&p.tx-p.x===-1&&p.ty-p.y===1),"blue+yellow did not remain paired and move left");
  expect(solo&&solo.groupSize===0&&solo.tx===6&&solo.ty===5,"red did not release into the pile red/green pocket");
  expect(members[1].ball.motionGroupId===0&&!members[1].ball.rigid&&members[1].ball.motionGroupSize===0,"red retained rigidity after pocket capture");
  expect(members[2].ball.motionGroupSize===2&&members[0].ball.motionGroupSize===2&&members[2].ball.rigid&&members[0].ball.rigid,"blue+yellow lost their two-ball rigidity");
}

/* Separator-level pocket override remains valid too. */
{
  const b=board(),members=upMembers(0);
  for(const m of members)b[m.y][m.x]=m.ball;
  b[6][5]={id:911,c:0,isGarbage:false};
  b[6][7]={id:912,c:1,isGarbage:false};

  const motions=[
    {x:6,y:3,tx:5,ty:4,ball:members[0].ball,kind:"ROLL_LEFT"},
    {x:7,y:4,tx:6,ty:5,ball:members[1].ball,kind:"ROLL_LEFT"},
    {x:5,y:4,tx:4,ty:5,ball:members[2].ball,kind:"ROLL_LEFT"}
  ];

  const wrongInfo={support:{id:999,c:3,isGarbage:false},px:6,py:5,hitFraction:.5,dir:1,top:members[0],pairLower:members[1],solo:members[2],soloMotion:motions[2],preArcSideLocked:true,pairSide:"right",soloSide:"left"};
  const ctx={console,Math,Date,Map,Set,Array,Object,Number,String,Boolean,JSON,Error,TypeError,valid};
  ctx.hexPhysUpConvexSeparator=()=>({...wrongInfo});

  install(ctx,pocketSource,"app-upconvex-pocket-capture-v1.js");
  const info=ctx.hexPhysUpConvexSeparator(b,members,motions);

  expect(info&&info.projectedPocketCapture===true,"separator-level projected pocket was not detected");
  expect(info.solo.ball.id===101&&info.pairLower.ball.id===102&&info.dir===-1,"separator-level pocket override selected the wrong 1+2 split");
}

function sideCase(offset){
  const b=board(),members=upMembers(offset);
  for(const m of members)b[m.y][m.x]=m.ball;
  const support={id:990,c:4,isGarbage:false,motionGroupId:0,rigid:false};
  b[5][6]=support;

  const ctx={console,Math,Date,Map,Set,Array,Object,Number,String,Boolean,JSON,Error,TypeError,valid};
  ctx.hexPhysEmpty=(bb,x,y,ignore)=>valid(x,y)&&(!bb[y][x]||(ignore&&ignore.has(bb[y][x].id)));
  ctx.hexPhysIndependentMemberMotion=()=>null;
  ctx.hexPhysPlanGroup=()=>[];
  ctx.hexPhysUpConvexSeparator=()=>({support,px:6,py:5,hitFraction:.5,dir:offset<0?1:-1});

  install(ctx,sideSource,"app-upconvex-contact-priority-v1.js");
  ctx.hexPhysPlanGroup(b,members,false);
  const info=ctx.hexPhysUpConvexSeparator(b,members,members.map(()=>null));
  return{ctx,info};
}

{
  const {ctx,info}=sideCase(-.4);
  expect(ctx.__sixBallUpConvexContactPriorityVersion==="upconvex-pre-arc-side-lock-v3.1","pre-arc side lock wrapper did not install");
  expect(info&&info.preArcSideLocked===true&&info.pairSide==="left"&&info.soloSide==="right"&&info.dir===-1&&info.solo.x===7,"right-side protrusion did not produce LEFT pair + RIGHT solo from pre-arc position");
}
{
  const {info}=sideCase(.4);
  expect(info&&info.preArcSideLocked===true&&info.pairSide==="right"&&info.soloSide==="left"&&info.dir===1&&info.solo.x===5,"left-side protrusion did not produce RIGHT pair + LEFT solo from pre-arc position");
}

console.log("v1303 UP-convex production guard PASS");
