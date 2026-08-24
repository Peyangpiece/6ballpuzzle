const fs=require("fs");
const vm=require("vm");
const path=require("path");

const source=fs.readFileSync(path.join(__dirname,"../public/app-upconvex-rigid-until-contact-v1.js"),"utf8");

function expect(v,m){if(!v)throw new Error(m);}
function valid(x,y){return Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&x<19&&y>=0&&y<12;}
function board(){return Array.from({length:12},()=>Array(19).fill(null));}
function clearGroup(ball){ball.motionGroupId=0;ball.motionGroupRole=-1;ball.motionGroupOrientation="";ball.motionGroupSize=0;ball.rigid=false;}

function members(offset=-0.35){
  const common={isGarbage:false,motionGroupId:500,motionGroupOrientation:"up",motionGroupSize:3,rigid:true,impactOffsetX:offset};
  const blue={...common,id:100,c:1,motionGroupRole:0};
  const red={...common,id:101,c:0,motionGroupRole:1};
  const yellow={...common,id:102,c:3,motionGroupRole:2};
  return [
    {ball:blue,x:6,y:3,role:0,orientation:"up"},
    {ball:red,x:7,y:4,role:1,orientation:"up"},
    {ball:yellow,x:5,y:4,role:2,orientation:"up"}
  ];
}

function install(ctx){
  ctx.window=ctx;ctx.globalThis=ctx;
  vm.createContext(ctx);
  vm.runInContext(source,ctx,{filename:"app-upconvex-rigid-until-contact-v1.js"});
}

/*
 * Live regression:
 *   BLUE
 * YELLOW RED
 *
 * Both lower lattice cells can point to the same central V-pocket at (6,5),
 * so discrete geometry alone is ambiguous. The piece is continuously shifted
 * left (impactOffsetX=-0.35), making RED physically closer to that pocket.
 * RED's independent motion deliberately points OUTWARD/right and YELLOW is
 * REST/null, reproducing why the previous motion-based fix missed the event.
 * Expected: RED solo into (6,5), BLUE+YELLOW rigid pair to the LEFT.
 */
{
  const b=board(),m=members(-0.35);
  for(const q of m)b[q.y][q.x]=q.ball;
  b[6][5]={id:901,c:0,isGarbage:false};
  b[6][7]={id:902,c:2,isGarbage:false};

  const ctx={console,Math,Date,Map,Set,Array,Object,Number,String,Boolean,JSON,Error,TypeError,valid};
  ctx.hexPhysClearGroupBall=clearGroup;

  ctx.hexPhysIndependentMemberMotion=(bb,mm,q)=>{
    if(q.ball.id===102)return null;
    if(q.ball.id===101)return {x:7,y:4,tx:8,ty:5,ball:q.ball,kind:"ROLL_RIGHT",pivot:null,topPivot:null};
    return {x:6,y:3,tx:7,ty:4,ball:q.ball,kind:"ROLL_RIGHT",pivot:null,topPivot:null};
  };

  ctx.hexPhysRigidSlopePlan=(bb,mm)=>mm.map(q=>({
    x:q.x,y:q.y,tx:q.x+1,ty:q.y+1,ball:q.ball,
    kind:"GROUP_SLOPE_TRANSLATE",bundleId:500,groupSize:3,pivot:null,topPivot:null
  }));

  ctx.hexPhysPlanGroup=(bb,mm)=>mm.map(q=>({
    x:q.x,y:q.y,tx:q.x+1,ty:q.y+1,ball:q.ball,
    kind:"GROUP_SLOPE_TRANSLATE",bundleId:500,groupSize:mm.length,pivot:null,topPivot:null
  }));

  ctx.hexPhysGroupTranslationPlan=(bb,mm,dx,dy,kind)=>mm.map(q=>({
    x:q.x,y:q.y,tx:q.x+dx,ty:q.y+dy,ball:q.ball,
    kind,bundleId:500,groupSize:mm.length,pivot:null,topPivot:null
  }));

  install(ctx);
  const out=ctx.hexPhysPlanGroup(b,m,false);
  const pair=out.filter(p=>p.groupSize===2);
  const solo=out.find(p=>p.ball.id===101);

  expect(ctx.__sixBallUpConvexRigidImplementationVersion==="upconvex-rigidity-partial-release-v2.6","v2.6 implementation not installed");
  expect(ctx.__sixBallUpContinuousPocketDisambiguation===true,"continuous pocket disambiguation missing");
  expect(pair.length===2&&pair.every(p=>[100,102].includes(p.ball.id)),"wrong remaining pair; expected BLUE+YELLOW");
  expect(pair.every(p=>p.tx-p.x===-1&&p.ty-p.y===1),"BLUE+YELLOW did not move left together");
  expect(solo&&solo.groupSize===0&&solo.tx===6&&solo.ty===5,"RED did not release into the central V-pocket");
  expect(m[1].ball.motionGroupId===0&&!m[1].ball.rigid&&m[1].ball.motionGroupSize===0,"RED retained rigidity");
  expect(m[0].ball.rigid&&m[2].ball.rigid&&m[0].ball.motionGroupSize===2&&m[2].ball.motionGroupSize===2,"BLUE+YELLOW lost pair rigidity");
}

/* Mirror case: right-shifted piece means LEFT lower enters the same pocket. */
{
  const b=board(),m=members(0.35);
  for(const q of m)b[q.y][q.x]=q.ball;
  b[6][5]={id:911,c:0,isGarbage:false};
  b[6][7]={id:912,c:2,isGarbage:false};

  const ctx={console,Math,Date,Map,Set,Array,Object,Number,String,Boolean,JSON,Error,TypeError,valid};
  ctx.hexPhysClearGroupBall=clearGroup;
  ctx.hexPhysIndependentMemberMotion=()=>null;
  ctx.hexPhysRigidSlopePlan=()=>null;
  ctx.hexPhysPlanGroup=(bb,mm)=>[];
  ctx.hexPhysGroupTranslationPlan=(bb,mm,dx,dy,kind)=>mm.map(q=>({x:q.x,y:q.y,tx:q.x+dx,ty:q.y+dy,ball:q.ball,kind,bundleId:500,groupSize:mm.length,pivot:null,topPivot:null}));
  install(ctx);
  const out=ctx.hexPhysPlanGroup(b,m,false);
  const solo=out.find(p=>p.groupSize===0);
  expect(solo&&solo.ball.id===102&&solo.tx===6&&solo.ty===5,"mirror pocket did not select LEFT lower member");
  expect(out.filter(p=>p.groupSize===2).every(p=>p.tx-p.x===1),"mirror remaining pair did not move right");
}

/* No V-pocket: preserve canonical 3-ball continuation. */
{
  const b=board(),m=members(-0.35);
  for(const q of m)b[q.y][q.x]=q.ball;
  const ctx={console,Math,Date,Map,Set,Array,Object,Number,String,Boolean,JSON,Error,TypeError,valid};
  ctx.hexPhysClearGroupBall=clearGroup;
  ctx.hexPhysIndependentMemberMotion=(bb,mm,q)=>({x:q.x,y:q.y,tx:q.x+1,ty:q.y+1,ball:q.ball,kind:"ROLL_RIGHT",pivot:null,topPivot:null});
  ctx.hexPhysRigidSlopePlan=(bb,mm)=>mm.map(q=>({x:q.x,y:q.y,tx:q.x+1,ty:q.y+1,ball:q.ball,kind:"GROUP_SLOPE_TRANSLATE",bundleId:500,groupSize:3,pivot:null,topPivot:null}));
  ctx.hexPhysPlanGroup=(bb,mm)=>mm.map(q=>({x:q.x,y:q.y,tx:q.x+1,ty:q.y+1,ball:q.ball,kind:"GROUP_SLOPE_TRANSLATE",bundleId:500,groupSize:mm.length,pivot:null,topPivot:null}));
  ctx.hexPhysGroupTranslationPlan=(bb,mm,dx,dy,kind)=>mm.map(q=>({x:q.x,y:q.y,tx:q.x+dx,ty:q.y+dy,ball:q.ball,kind,bundleId:500,groupSize:mm.length,pivot:null,topPivot:null}));
  install(ctx);
  const out=ctx.hexPhysPlanGroup(b,m,false);
  expect(out.length===3&&out.every(p=>p.groupSize===3&&p.tx-p.x===1),"3-ball rigidity changed without an immediate V-pocket");
}

console.log("v1303 live red-pocket v2.6 PASS");
