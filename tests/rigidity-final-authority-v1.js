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
function makeUpMembers(gid=800){
  const positions=[{x:6,y:3},{x:5,y:4},{x:7,y:4}];
  return positions.map((position,i)=>({
    ball:{
      id:200+i,c:i,isGarbage:false,
      motionGroupId:gid,motionGroupRole:i,
      motionGroupOrientation:"up",motionGroupSize:3,rigid:true
    },
    ...position,role:i,orientation:"up"
  }));
}
function motion(member,dx=1,dy=1){
  return{
    x:member.x,y:member.y,tx:member.x+dx,ty:member.y+dy,
    ball:member.ball,kind:"ROLL_RIGHT",pivot:null,topPivot:null,
    followSupportIds:[]
  };
}
function install({base,independent,natural,groupPlan,separator,splitPlan}){
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
  if(separator)ctx.hexPhysUpConvexSeparator=separator;
  if(splitPlan)ctx.hexPhysUpConvexSplitPlan=splitPlan;
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
  expect(ctx.__sixBallFinalRigidityAuthorityVersion==="final-rigidity-authority-v3","v3 final authority marker missing");
  expect(ctx.__sixBallSlopeTriangleAlwaysKeepsRigidity===true,"slope invariant marker missing");
  expect(ctx.__sixBallUpConvexSplitKeepsOppositePair===true,"up-convex invariant marker missing");
  expect(ctx.__sixBallUpConvexActiveSplitRequiresMiddleFiftyPercent===true,"middle-50% invariant marker missing");
}

/* A lower-level independent probe can report one member as stopped while the
   selected slope event legally moves the whole triangle. The selected event
   wins and all three balls remain rigid. */
{
  const members=makeMembers(710);
  const ctx=install({
    independent:(board,group,member)=>member.ball.id===100&&group.length===3
      ?null
      :motion(member,0,2),
    base:(board,group)=>group.map(member=>({
      ...motion(member,0,2),kind:"GROUP_SLOPE_TRANSLATE",bundleId:710,groupSize:group.length
    }))
  });
  const out=ctx.hexPhysPlanGroup([],members,false);
  expect(out.length===3&&out.every(step=>step.groupSize===3&&step.bundleId===710),"selected slope triangle was split by an independent stop probe");
  expect(members.every(member=>member.ball.rigid&&member.ball.motionGroupSize===3),"selected slope triangle lost rigidity");
}

/* Upward-convex LEFT split: even if all independent probes point in the same
   direction, the top+RIGHT pair must remain a pair and the left ball releases. */
{
  const members=makeUpMembers(810);
  const [top,left,right]=members;
  const ctx=install({
    independent:(board,group,member)=>motion(member,1,1),
    separator:()=>({
      hitFraction:.5,top,pairLower:right,solo:left,
      soloMotion:motion(left,-1,1),dir:1
    }),
    base:()=>[
      {...motion(top,1,1),bundleId:810,groupSize:2},
      {...motion(right,1,1),bundleId:810,groupSize:2},
      {...motion(left,-1,1),bundleId:0,groupSize:0}
    ]
  });
  const out=ctx.hexPhysPlanGroup([],members,false);
  const pair=out.filter(step=>step.groupSize===2).map(step=>step.ball.id).sort();
  expect(JSON.stringify(pair)===JSON.stringify([top.ball.id,right.ball.id].sort()),"left split did not keep the pair on the right");
  expect(!left.ball.rigid&&left.ball.motionGroupId===0,"left split solo retained rigidity");
  expect(top.ball.rigid&&right.ball.rigid,"right-side pair lost rigidity");
}

/* A legacy layer proposes the opposite side. A proven LEFT contact in the
   middle 50% must rebuild it as top+RIGHT pair and LEFT solo. */
{
  const members=makeUpMembers(815);
  const [top,left,right]=members;
  const ctx=install({
    independent:(board,group,member)=>motion(member,member===left?-1:1,1),
    separator:()=>({
      hitFraction:.5,top,pairLower:right,solo:left,
      soloMotion:motion(left,-1,1),dir:1
    }),
    splitPlan:()=>[
      {...motion(top,1,1),bundleId:815,groupSize:2},
      {...motion(right,1,1),bundleId:815,groupSize:2},
      {...motion(left,-1,1),bundleId:0,groupSize:0}
    ],
    base:()=>[
      {...motion(top,-1,1),bundleId:815,groupSize:2},
      {...motion(left,-1,1),bundleId:815,groupSize:2},
      {...motion(right,1,1),bundleId:0,groupSize:0}
    ]
  });
  const out=ctx.hexPhysPlanGroup([],members,false);
  const pair=out.filter(step=>step.groupSize===2).map(step=>step.ball.id).sort();
  expect(JSON.stringify(pair)===JSON.stringify([top.ball.id,right.ball.id].sort()),"legacy opposite-side split was not corrected");
  expect(!left.ball.rigid&&right.ball.rigid,"corrected left split metadata is wrong");
}

/* An active pair+solo proposal outside the lower edge's middle 50% is not a
   legal convex split. Keep the triplet together and wait. */
{
  for(const [index,hitFraction] of [.1,.25,.75,.9].entries()){
    const gid=817+index;
    const members=makeUpMembers(gid);
    const [top,left,right]=members;
    const ctx=install({
      independent:(board,group,member)=>motion(member,member===left?-1:1,1),
      separator:()=>({
        hitFraction,top,pairLower:right,solo:left,
        soloMotion:motion(left,-1,1),dir:1
      }),
      base:()=>[
        {...motion(top,1,1),bundleId:gid,groupSize:2},
        {...motion(right,1,1),bundleId:gid,groupSize:2},
        {...motion(left,-1,1),bundleId:0,groupSize:0}
      ]
    });
    const out=ctx.hexPhysPlanGroup([],members,false);
    expect(out.length===0,`outer-quarter contact ${hitFraction} was allowed to split the triplet`);
    expect(members.every(member=>member.ball.rigid&&member.ball.motionGroupSize===3),`rejected outer-quarter ${hitFraction} did not restore triplet rigidity`);
  }
}

/* Upward-convex RIGHT split: a pair-only selected event keeps top+LEFT, while
   the omitted right ball is position-final and releases immediately. */
{
  const members=makeUpMembers(820);
  const [top,left,right]=members;
  const ctx=install({
    independent:(board,group,member)=>motion(member,-1,1),
    base:()=>[
      {...motion(top,-1,1),bundleId:820,groupSize:2},
      {...motion(left,-1,1),bundleId:820,groupSize:2}
    ]
  });
  const out=ctx.hexPhysPlanGroup([],members,false);
  const pair=out.filter(step=>step.groupSize===2).map(step=>step.ball.id).sort();
  expect(JSON.stringify(pair)===JSON.stringify([top.ball.id,left.ball.id].sort()),"right split did not keep the pair on the left");
  expect(!right.ball.rigid&&right.ball.motionGroupId===0,"omitted right split ball retained rigidity");
  expect(top.ball.rigid&&left.ball.rigid,"left-side pair lost rigidity");
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

console.log("final rigidity authority v3 PASS");
