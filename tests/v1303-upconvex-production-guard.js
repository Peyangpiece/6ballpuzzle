const fs=require("fs");
const vm=require("vm");
const path=require("path");

const PUBLIC=path.join(__dirname,"../public");
const rigidSource=fs.readFileSync(path.join(PUBLIC,"app-upconvex-rigid-until-contact-v1.js"),"utf8");
const sideSource=fs.readFileSync(path.join(PUBLIC,"app-upconvex-contact-priority-v1.js"),"utf8");

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

/* Real current slope contact + canonical rigid solver => keep 3-ball rigidity. */
{
  const {ctx,out}=rigidCase({realPivot:true,canonicalRigid:true});
  expect(ctx.__sixBallUpConvexRigidUntilImpossibleVersion==="upconvex-rigid-until-impossible-v2.2","v2.2 wrapper did not install");
  expect(out.length===3&&out.every(p=>p.groupSize===3&&p.kind==="GROUP_SLOPE_TRANSLATE"),"genuine current rigid slope was not preserved");
}

/* Empty collision-safe space cannot invent rigidity. */
{
  const {ctx,out}=rigidCase({realPivot:false,canonicalRigid:true});
  expect(ctx.__sixBallUpConvexNoSyntheticRigidTranslation===true,"no-synthetic-rigidity policy missing");
  expect(out.every(p=>p.kind==="BASE_SPLIT"),"triplet stayed rigid without a real current support pivot");
}

/* If canonical current-contact slope rejects the move, release to base physics. */
{
  const {out}=rigidCase({realPivot:true,canonicalRigid:false});
  expect(out.every(p=>p.kind==="BASE_SPLIT"),"triplet stayed rigid after canonical rigid slope became impossible");
}

/* Once geometry no longer forms the exact UP triangle, never reconstruct rigidity. */
{
  const {out}=rigidCase({realPivot:true,canonicalRigid:true,deform:true});
  expect(out.every(p=>p.kind==="BASE_SPLIT"),"deformed/separated group was incorrectly re-rigidified");
}

/*
 * Critical live-video regression:
 * lower-right member (the red ball in the reported clip) becomes physically
 * pinned between pile balls. Even if a later wrapper would otherwise return
 * a 3-ball GROUP_SLOPE_TRANSLATE, the pinned member must release alone and
 * the other two must remain a rigid pair moving left.
 */
{
  const b=board(),members=upMembers(0);
  for(const m of members)b[m.y][m.x]=m.ball;
  const ctx={console,Math,Date,Map,Set,Array,Object,Number,String,Boolean,JSON,Error,TypeError,valid};

  ctx.hexPhysClearGroupBall=(ball)=>{ball.motionGroupId=0;ball.motionGroupRole=-1;ball.motionGroupOrientation="";ball.motionGroupSize=0;ball.rigid=false;};

  ctx.hexPhysIndependentMemberMotion=(bb,mm,m)=>{
    if(m.ball.id===101)return null;
    return {x:m.x,y:m.y,tx:m.x-1,ty:m.y+1,ball:m.ball,kind:"ROLL_LEFT",pivot:[4,5],topPivot:null};
  };

  ctx.hexPhysRigidSlopePlan=(bb,mm)=>mm.map(m=>({x:m.x,y:m.y,tx:m.x+1,ty:m.y+1,ball:m.ball,kind:"GROUP_SLOPE_TRANSLATE",pivot:[8,5],topPivot:null,bundleId:500,groupSize:3}));

  ctx.hexPhysPlanGroup=(bb,mm)=>{
    if(mm.length===3){
      return mm.map(m=>({x:m.x,y:m.y,tx:m.x+1,ty:m.y+1,ball:m.ball,kind:"GROUP_SLOPE_TRANSLATE",bundleId:500,groupSize:3}));
    }
    return mm.map(m=>({x:m.x,y:m.y,tx:m.x-1,ty:m.y+1,ball:m.ball,kind:"PAIR_LEFT",bundleId:500,groupSize:2}));
  };

  install(ctx,rigidSource,"app-upconvex-rigid-until-contact-v1.js");
  const out=ctx.hexPhysPlanGroup(b,members,false);

  expect(ctx.__sixBallUpSinglePinnedMemberHasPriority===true,"single-pinned-member priority missing");
  expect(ctx.__sixBallUpRemainingTwoKeepRigidity===true,"remaining-pair rigidity policy missing");
  expect(out.length===2&&out.every(p=>p.ball.id!==101&&p.groupSize===2&&p.kind==="PAIR_LEFT"&&p.tx-p.x===-1),"pinned red member did not release while blue+yellow stayed paired left");
  expect(members[1].ball.motionGroupId===0&&members[1].ball.rigid===false&&members[1].ball.motionGroupSize===0,"pinned member kept rigidity");
  expect(members[0].ball.motionGroupId===500&&members[2].ball.motionGroupId===500&&members[0].ball.motionGroupSize===2&&members[2].ball.motionGroupSize===2&&members[0].ball.rigid&&members[2].ball.rigid,"remaining two members lost pair rigidity");
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
