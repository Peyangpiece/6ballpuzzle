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

function rigidCase({withCentreContact=false,realPivot=true,canonicalRigid=true,deform=false}={}){
  const b=board(),members=upMembers(0);
  if(deform)members[0].x+=2;
  for(const m of members)b[m.y][m.x]=m.ball;

  const support={id:999,c:4,isGarbage:false,motionGroupId:0,rigid:false};
  const pivot=realPivot?(withCentreContact?[6,5]:[8,5]):null;
  if(pivot)b[pivot[1]][pivot[0]]=support;

  const split=baseSplit(members);
  const ctx={console,Math,Date,Map,Set,Array,Object,Number,String,Boolean,JSON,Error,TypeError,valid};
  ctx.hexPhysPlanGroup=()=>split.map(p=>({...p}));
  ctx.hexPhysIndependentMemberMotion=(bb,mm,m)=>({x:m.x,y:m.y,tx:m.x+1,ty:m.y+1,ball:m.ball,kind:"ROLL_RIGHT",pivot,topPivot:null});
  ctx.hexPhysRigidSlopePlan=(bb,mm,motions)=>canonicalRigid?mm.map(m=>({x:m.x,y:m.y,tx:m.x+1,ty:m.y+1,ball:m.ball,kind:"GROUP_SLOPE_TRANSLATE",pivot,topPivot:null,bundleId:500,groupSize:3})):null;

  install(ctx,rigidSource,"app-upconvex-rigid-until-contact-v1.js");
  const out=ctx.hexPhysPlanGroup(b,members,false);
  return{ctx,out};
}

/* Real current slope contact + canonical rigid solver => keep 3-ball rigidity. */
{
  const {ctx,out}=rigidCase({realPivot:true,canonicalRigid:true});
  expect(ctx.__sixBallUpConvexRigidUntilImpossibleVersion==="upconvex-rigid-until-impossible-v2.1","v2.1 wrapper did not install");
  expect(out.length===3&&out.every(p=>p.groupSize===3&&p.kind==="GROUP_SLOPE_TRANSLATE"),"genuine current rigid slope was not preserved");
}

/* Protrusion contact alone is not a split if the canonical current slope remains valid. */
{
  const {ctx,out}=rigidCase({withCentreContact:true,realPivot:true,canonicalRigid:true});
  expect(ctx.__sixBallUpConvexContactAloneDoesNotSplit===true,"contact-alone policy missing");
  expect(out.length===3&&out.every(p=>p.groupSize===3&&p.kind==="GROUP_SLOPE_TRANSLATE"),"valid rigid motion was lost merely on protrusion contact");
}

/* Live-regression: empty collision-safe space must never invent rigidity. */
{
  const {ctx,out}=rigidCase({realPivot:false,canonicalRigid:true});
  expect(ctx.__sixBallUpConvexNoSyntheticRigidTranslation===true,"no-synthetic-rigidity policy missing");
  expect(out.every(p=>p.kind==="BASE_SPLIT"),"triplet stayed rigid without a real current support pivot");
}

/* Canonical current-contact slope rejection must release to split. */
{
  const {out}=rigidCase({realPivot:true,canonicalRigid:false});
  expect(out.every(p=>p.kind==="BASE_SPLIT"),"triplet stayed rigid after canonical rigid slope became impossible");
}

/* Deformed/separated three balls must never be reconstructed as a rigid triangle. */
{
  const {out}=rigidCase({realPivot:true,canonicalRigid:true,deform:true});
  expect(out.every(p=>p.kind==="BASE_SPLIT"),"deformed/separated group was incorrectly re-rigidified");
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
