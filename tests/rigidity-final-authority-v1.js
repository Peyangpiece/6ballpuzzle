const fs=require("fs");
const vm=require("vm");
const path=require("path");

const source=fs.readFileSync(
  path.join(__dirname,"../public/app-rigidity-final-authority-v1.js"),
  "utf8"
);

function expect(value,message){if(!value)throw new Error(message);}
function clear(ball){
  ball.motionGroupId=0;
  ball.motionGroupRole=-1;
  ball.motionGroupOrientation="";
  ball.motionGroupSize=0;
  ball.rigid=false;
}
function makeMembers(gid=700){
  return[0,1,2].map(i=>({
    ball:{
      id:100+i,c:i,isGarbage:false,
      motionGroupId:gid,motionGroupRole:i,
      motionGroupOrientation:"up",motionGroupSize:3,rigid:true
    },
    x:5+i*2,y:4,role:i,orientation:"up"
  }));
}
function motion(member,dx=1,dy=1){
  return{
    x:member.x,y:member.y,tx:member.x+dx,ty:member.y+dy,
    ball:member.ball,kind:"ROLL_RIGHT",pivot:null,topPivot:null,
    followSupportIds:[]
  };
}
function install({base,independent,natural,groupPlan}){
  const ctx={
    console,Math,Date,Map,Set,Array,Object,Number,String,Boolean,JSON,
    Error,TypeError,
    hexPhysPlanGroup:base,
    hexPhysIndependentMemberMotion:independent,
    hexPhysNaturalMotion:natural||(()=>null),
    hexPhysGroupTranslationPlan:groupPlan||((board,members,dx,dy,kind)=>
      members.map(member=>({
        ...motion(member,dx,dy),kind,bundleId:member.ball.motionGroupId,groupSize:members.length
      }))
    ),
    hexPhysClearGroupBall:clear
  };
  ctx.window=ctx;ctx.globalThis=ctx;
  vm.createContext(ctx);
  vm.runInContext(source,ctx,{filename:"app-rigidity-final-authority-v1.js"});
  return ctx;
}

/* An earlier layer split metadata even though every independent member proves
   the same vector. The final authority must restore one three-ball cohort. */
{
  const members=makeMembers();
  const ctx=install({
    independent:(board,group,member)=>motion(member,1,1),
    base:(board,group)=>group.map((member,i)=>({
      ...motion(member,1,1),
      bundleId:i<2?700:0,
      groupSize:i<2?2:0
    }))
  });
  const out=ctx.hexPhysPlanGroup([],members,false);
  expect(out.length===3&&out.every(step=>step.bundleId===700&&step.groupSize===3),"same-direction triplet was not restored");
  expect(members.every(member=>member.ball.rigid&&member.ball.motionGroupSize===3),"same-direction triplet metadata was not restored");
}

/* A stale slope layer invented a full triplet motion from the two moving
   members. The pinned member must release before the pair moves. */
{
  const members=makeMembers(710);
  const ctx=install({
    independent:(board,group,member)=>member.ball.id===100&&group.length===3
      ?null
      :motion(member,0,2),
    base:(board,group)=>group.map(member=>({
      ...motion(member,0,2),bundleId:710,groupSize:group.length
    }))
  });
  const out=ctx.hexPhysPlanGroup([],members,false);
  expect(out.length===2&&out.every(step=>step.groupSize===2&&step.bundleId===710),"moving pair did not remain rigid after pinned release");
  expect(!members[0].ball.rigid&&members[0].ball.motionGroupId===0,"pinned member retained rigidity");
  expect(members[1].ball.rigid&&members[2].ball.rigid,"moving pair lost rigidity");
}

/* If the selected event omits one member, omission itself finalizes that
   member's position for the event. It must not keep stale group metadata. */
{
  const members=makeMembers(720);
  const ctx=install({
    independent:(board,group,member)=>motion(member,member.ball.id===100?0:1,member.ball.id===100?2:1),
    base:(board,group)=>group.slice(1).map(member=>({
      ...motion(member,1,1),bundleId:720,groupSize:2
    }))
  });
  const out=ctx.hexPhysPlanGroup([],members,false);
  expect(out.length===2&&out.every(step=>step.groupSize===2),"declared pair was not preserved");
  expect(!members[0].ball.rigid&&members[0].ball.motionGroupId===0,"omitted fixed member retained rigidity");
}

/* A terminal group releases immediately when logical positions are final. */
{
  const members=makeMembers(730);
  const ctx=install({independent:()=>null,base:()=>[]});
  const out=ctx.hexPhysPlanGroup([],members,false);
  expect(out.length===0,"settled group invented motion");
  expect(members.every(member=>!member.ball.rigid&&member.ball.motionGroupId===0),"settled group retained rigidity");
}

/* Preview must report the correction without mutating canonical metadata. */
{
  const members=makeMembers(740);
  const before=JSON.stringify(members.map(member=>member.ball));
  const ctx=install({independent:()=>null,base:()=>[]});
  ctx.hexPhysPlanGroup([],members,true);
  expect(JSON.stringify(members.map(member=>member.ball))===before,"preview mutated rigidity metadata");
}

/* Garbage always delegates to its dedicated zero-rigidity pipeline. */
{
  const members=makeMembers(750);
  members[0].ball.isGarbage=true;
  let calls=0;
  const ctx=install({independent:()=>null,base:()=>{calls++;return[];}});
  ctx.hexPhysPlanGroup([],members,false);
  expect(calls===1,"garbage did not delegate exactly once");
  expect(members[0].ball.motionGroupId===750,"ordinary final authority mutated garbage");
}

console.log("final rigidity authority v1 PASS");
