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

function rigidCase({realPivot=true,canonicalRigid=true,deform=false}={}){
  const b=board(),members=upMembers(0);
  if(deform)members[0].x+=2;
  for(const m of members)b[m.y][m.x]=m.ball;
  const support={id:999,c:4,isGarbage:false,motionGroupId:0,rigid:false};
  if(realPivot)b[5][8]=support;

  const split=baseSplit(members);
  const ctx={console,Math,Date,Map,Set,Array,Object,Number,String,Boolean,JSON,Error,TypeError,valid};
  ctx.hexPhysClearGroupBall=(ball)=>{ball.motionGroupId=0;ball.motionGroupRole=-1;ball.motionGroupOrientation="";ball.motionGroupSize=0;ball.rigid=false;};
  ctx.hexPhysPlanGroup=()=>split.map(p=>({...p}));
  ctx.hexPhysIndependentMemberMotion=(bb,mm,m)=>({x:m.x,y:m.y,tx:m.x+1,ty:m.y+1,ball:m.ball,kind:"ROLL_RIGHT",pivot:realPivot?[8,5]:null,topPivot:null});
  ctx.hexPhysRigidSlopePlan=(bb,mm,motions)=>canonicalRigid?mm.map(m=>({x:m.x,y:m.y,tx:m.x+1,ty:m.y+1,ball:m.ball,kind:"GROUP_SLOPE_TRANSLATE",pivot:[8,5],topPivot:null,bundleId:500,groupSize:3})):null;

  install(ctx,rigidSource,"app-upconvex-rigid-until-contact-v1.js");
  const out=ctx.hexPhysPlanGroup(b,members,false);
  return{ctx,out,members};
}

{
  const {ctx,out}=rigidCase({realPivot:true,canonicalRigid:true});
  expect(ctx.__sixBallUpConvexRigidUntilImpossibleVersion==="upconvex-rigid-until-impossible-v2.2","v2.2 wrapper did not install");
  expect(out.length===3&&out.every(p=>p.groupSize===3&&p.kind==="GROUP_SLOPE_TRANSLATE"),"genuine current rigid slope was not preserved");
}

{
  const {ctx,out}=rigidCase({realPivot:false,canonicalRigid:true});
  expect(ctx.__sixBallUpConvexNoSyntheticRigidTranslation===true,"no-synthetic-rigidity policy missing");
  expect(out.every(p=>p.kind==="BASE_SPLIT"),"triplet stayed rigid without a real current support pivot");
}

{
  const {out}=rigidCase({realPivot:true,canonicalRigid:false});
  expect(out.every(p=>p.kind==="BASE_SPLIT"),"triplet stayed rigid after canonical rigid slope became impossible");
}

{
  const {out}=rigidCase({realPivot:true,canonicalRigid:true,deform:true});
  expect(out.every(p=>p.kind==="BASE_SPLIT"),"deformed/separated group was incorrectly re-rigidified");
}

/* Already-pinned member: release only it, keep the other two as a pair. */
{
  const b=board(),members=upMembers(0);
  for(const m of members)b[m.y][m.x]=m.ball;
  const ctx={console,Math,Date,Map,Set,Array,Object,Number,String,Boolean,JSON,Error,TypeError,valid};

  ctx.hexPhysClearGroupBall=(ball)=>{ball.motionGroupId=0;ball.motionGroupRole=-1;ball.motionGroupOrientation="";ball.motionGroupSize=0;ball.rigid=false;};
  ctx.hexPhysIndependentMemberMotion=(bb,mm,m)=>m.ball.id===101?null:{x:m.x,y:m.y,tx:m.x-1,ty:m.y+1,ball:m.ball,kind:"ROLL_LEFT",pivot:[4,5],topPivot:null};
  ctx.hexPhysRigidSlopePlan=(bb,mm)=>mm.map(m=>({x:m.x,y:m.y,tx:m.x+1,ty:m.y+1,ball:m.ball,kind:"GROUP_SLOPE_TRANSLATE",pivot:[8,5],topPivot:null,bundleId:500,groupSize:3}));
  ctx.hexPhysPlanGroup=(bb,mm)=>mm.length===3?mm.map(m=>({x:m.x,y:m.y,tx:m.x+1,ty:m.y+1,ball:m.ball,kind:"GROUP_SLOPE_TRANSLATE",bundleId:500,groupSize:3})):mm.map(m=>({x:m.x,y:m.y,tx:m.x-1,ty:m.y+1,ball:m.ball,kind:"PAIR_LEFT",bundleId:500,groupSize:2}));

  install(ctx,rigidSource,"app-upconvex-rigid-until-contact-v1.js");
  const out=ctx.hexPhysPlanGroup(b,members,false);

  expect(ctx.__sixBallUpSinglePinnedMemberHasPriority===true,"single-pinned-member priority missing");
  expect(out.length===2&&out.every(p=>p.ball.id!==101&&p.groupSize===2&&p.kind==="PAIR_LEFT"&&p.tx-p.x===-1),"pinned red member did not release while blue+yellow stayed paired left");
  expect(members[1].ball.motionGroupId===0&&!members[1].ball.rigid&&members[1].ball.motionGroupSize===0,"pinned member kept rigidity");
  expect(members[0].ball.motionGroupSize===2&&members[2].ball.motionGroupSize===2&&members[0].ball.rigid&&members[2].ball.rigid,"remaining two members lost pair rigidity");
}

/*
 * Reported video, one step earlier:
 * the lower-right red ball is still moving, but its proposed destination
 * is the V-pocket between two pile balls. Geometric side selection would
 * choose the wrong solo. Projected pocket capture must choose RED as solo,
 * leaving BLUE + YELLOW paired to the LEFT.
 */
{
  const b=board(),members=upMembers(0);
  for(const m of members)b[m.y][m.x]=m.ball;

  const pileA={id:901,c:0,isGarbage:false};
  const pileB={id:902,c:1,isGarbage:false};
  b[6][5]=pileA;
  b[6][7]=pileB;

  const motions=[
    {x:6,y:3,tx:5,ty:4,ball:members[0].ball,kind:"ROLL_LEFT"},
    {x:7,y:4,tx:6,ty:5,ball:members[1].ball,kind:"ROLL_LEFT"},
    {x:5,y:4,tx:4,ty:5,ball:members[2].ball,kind:"ROLL_LEFT"}
  ];

  const wrongInfo={
    support:{id:999,c:3,isGarbage:false},
    px:6,py:5,hitFraction:.5,
    dir:1,
    top:members[0],
    pairLower:members[1],
    solo:members[2],
    soloMotion:motions[2],
    preArcSideLocked:true,
    pairSide:"right",
    soloSide:"left"
  };

  const ctx={console,Math,Date,Map,Set,Array,Object,Number,String,Boolean,JSON,Error,TypeError,valid};
  ctx.hexPhysUpConvexSeparator=()=>({...wrongInfo});

  install(ctx,pocketSource,"app-upconvex-pocket-capture-v1.js");
  const info=ctx.hexPhysUpConvexSeparator(b,members,motions);

  expect(ctx.__sixBallUpPocketCaptureOverridesGeometricSide===true,"projected pocket priority missing");
  expect(info&&info.projectedPocketCapture===true,"projected pocket was not detected");
  expect(info.solo.ball.id===101,"lower-right red member was not selected as captured solo");
  expect(info.pairLower.ball.id===102&&info.top.ball.id===100,"blue+yellow were not kept as the remaining pair");
  expect(info.dir===-1&&info.pairSide==="left"&&info.soloSide==="right","remaining blue+yellow pair did not resolve left");
  expect(info.projectedPocketTarget[0]===6&&info.projectedPocketTarget[1]===5,"red pocket destination was not preserved");
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
