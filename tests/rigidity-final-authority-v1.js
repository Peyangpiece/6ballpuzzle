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
function install({base,independent,natural,groupPlan,supportInfo,touchesFloor,separator,splitPlan,rigidSlope,valid}){
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
  if(supportInfo)ctx.hexPhysSupportInfo=supportInfo;
  if(touchesFloor)ctx.touchesFloorRow=touchesFloor;
  if(rigidSlope)ctx.hexPhysRigidSlopePlan=rigidSlope;
  if(valid)ctx.valid=valid;
  if(separator)ctx.hexPhysUpConvexSeparator=separator;
  if(splitPlan)ctx.hexPhysUpConvexSplitPlan=splitPlan;
  ctx.window=ctx;ctx.globalThis=ctx;
  vm.createContext(ctx);
  vm.runInContext(source,ctx,{filename:"app-rigidity-final-authority-v1.js"});
  return ctx;
}

/* The selected event itself can be mislabeled as a 2+1 split even though pair
   and solo all descend by the same slope vector. Group-size metadata alone
   must not split an otherwise identical three-ball motion. */
{
  const members=makeUpMembers(812);
  const [top,left,right]=members;
  const ctx=install({
    independent:(board,group,member)=>member===top
      ?motion(member,1,1)
      :{...motion(member,member===left?-1:1,1),pivot:[6,5]},
    separator:()=>({
      hitFraction:.5,top,pairLower:right,solo:left,
      soloMotion:{...motion(left,-1,1),pivot:[6,5]},
      px:6,py:5,dir:1
    }),
    base:()=>[
      {...motion(top,1,1),bundleId:812,groupSize:2},
      {...motion(right,1,1),bundleId:812,groupSize:2},
      {...motion(left,1,1),bundleId:0,groupSize:0}
    ]
  });
  const out=ctx.hexPhysPlanGroup([],members,false);
  expect(out.length===3&&out.every(step=>step.groupSize===3&&step.bundleId===812&&step.tx-step.x===1&&step.ty-step.y===1),"same-vector authored 2+1 plan was not restored to one triplet");
  expect(members.every(member=>member.ball.rigid&&member.ball.motionGroupSize===3),"same-vector authored 2+1 plan lost rigidity");
  expect(ctx.__sixBallLastFinalRigidityCorrectionV1?.reason==="authored-same-direction-before-prospective-two-plus-one","authored same-direction correction was not recorded");
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
  expect(ctx.__sixBallFinalRigidityAuthorityVersion==="final-rigidity-authority-v11","v11 final authority marker missing");
  expect(ctx.__sixBallSlopeTriangleAlwaysKeepsRigidity===true,"slope invariant marker missing");
  expect(ctx.__sixBallUpConvexSplitKeepsOppositePair===true,"up-convex invariant marker missing");
  expect(ctx.__sixBallUpConvexActiveSplitRequiresMiddleFiftyPercent===true,"middle-50% invariant marker missing");
  expect(ctx.__sixBallUpConvexSplitRequiresCurrentBilateralPivotContact===true,"current bilateral contact marker missing");
  expect(ctx.__sixBallAirborneUpConvexTwoPlusOneIsForbidden===true,"airborne 2+1 guard marker missing");
  expect(ctx.__sixBallSplitDirectionPrecedesPairRigidity===true,"direction-before-pair marker missing");
  expect(ctx.__sixBallFallingRigidTriangleNeverRotates===true,"falling no-rotation invariant marker missing");
  expect(ctx.__sixBallUpConvexOuterQuarterUsesRigidSlide===true,"outer-quarter rigid-slide invariant marker missing");
  expect(ctx.__sixBallPairOnlyReleaseRequiresPositionFinalSupport===true,"pair-only support proof marker missing");
  expect(ctx.__sixBallCurrentCentralSplitBeatsHorizontalSnap===true,"central split vs horizontal-snap priority marker missing");
  expect(ctx.__sixBallOrdinarySplitOnlyCentralOrPositionFinal===true,"two-trigger split whitelist marker missing");
  expect(ctx.__sixBallDivergentMotionAloneCannotSplit===true,"divergent-motion split rejection marker missing");
}

/* Even if an older wrapper proposes a 2+1 split, a canonical current external
   slope contact proves that the complete triangle can keep moving left. The
   final authority must preserve all three members and the UP orientation. */
{
  const members=makeUpMembers(805);
  const [top,left,right]=members;
  const board=Array.from({length:10},()=>Array(12).fill(null));
  board[5][8]={id:999,c:4,isGarbage:false};
  const leftMotion=member=>({...motion(member,-1,1),pivot:[8,5]});
  const ctx=install({
    valid:(x,y)=>x>=0&&x<12&&y>=0&&y<10,
    independent:(bb,group,member)=>leftMotion(member),
    rigidSlope:(bb,group)=>group.map(member=>({
      ...leftMotion(member),kind:"GROUP_SLOPE_TRANSLATE",
      bundleId:805,groupSize:3
    })),
    base:()=>[
      {...motion(top,1,1),bundleId:805,groupSize:2},
      {...motion(right,1,1),bundleId:805,groupSize:2},
      {...motion(left,-1,1),bundleId:0,groupSize:0}
    ]
  });
  const out=ctx.hexPhysPlanGroup(board,members,false);
  expect(out.length===3&&out.every(step=>
    step.groupSize===3&&
    step.bundleId===805&&
    step.tx-step.x===-1&&
    step.ty-step.y===1
  ),"current common LEFT slope lost to an older split proposal");
  expect(members.every(member=>
    member.ball.rigid&&
    member.ball.motionGroupSize===3&&
    member.ball.motionGroupOrientation==="up"
  ),"current common LEFT slope rotated or lost triplet metadata");
  expect(ctx.__sixBallCurrentCommonSlopeBeatsProspectiveSplit===true,
    "current-slope priority marker missing");
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

/* A middle-50% protrusion is only a prospective split while all three current
   probes still prove the same downhill vector. Keep the complete triplet. */
{
  const members=makeUpMembers(810);
  const [top,left,right]=members;
  const ctx=install({
    independent:(board,group,member)=>member===top
      ?motion(member,1,1)
      :{...motion(member,1,1),pivot:[6,5]},
    separator:()=>({
      hitFraction:.5,top,pairLower:right,solo:left,
      soloMotion:{...motion(left,-1,1),pivot:[6,5]},
      px:6,py:5,dir:1
    }),
    base:()=>[
      {...motion(top,1,1),bundleId:810,groupSize:2},
      {...motion(right,1,1),bundleId:810,groupSize:2},
      {...motion(left,-1,1),bundleId:0,groupSize:0}
    ]
  });
  const out=ctx.hexPhysPlanGroup([],members,false);
  expect(out.length===3&&out.every(step=>step.groupSize===3&&step.bundleId===810),"prospective 2+1 split beat a same-direction triplet");
  expect(members.every(member=>member.ball.rigid&&member.ball.motionGroupSize===3),"same-direction prospective-contact triplet lost rigidity");
  expect(ctx.__sixBallLastFinalRigidityCorrectionV1?.reason==="same-direction-whole-group","same-direction correction was not recorded");
  expect(ctx.__sixBallSameDirectionBeatsProspectiveTwoPlusOne===true,"same-direction 2+1 priority marker missing");
}

/* A middle-50% support that is only visible to the logical look-ahead is not
   yet a collision. Without current pivots from BOTH lower balls, even a fully
   authored moving 2+1 event must be rejected and the triplet restored. */
{
  const members=makeUpMembers(813);
  const [top,left,right]=members;
  const ctx=install({
    independent:(board,group,member)=>motion(member,member===left?-1:1,1),
    separator:()=>({
      hitFraction:.5,top,pairLower:right,solo:left,
      soloMotion:motion(left,-1,1),px:6,py:5,dir:1
    }),
    base:()=>[
      {...motion(top,1,1),bundleId:813,groupSize:2},
      {...motion(right,1,1),bundleId:813,groupSize:2},
      {...motion(left,-1,1),bundleId:0,groupSize:0}
    ]
  });
  const out=ctx.hexPhysPlanGroup([],members,false);
  expect(out.length===0,"airborne 2+1 candidate was allowed to move as a split");
  expect(members.every(member=>member.ball.rigid&&member.ball.motionGroupSize===3),"rejected airborne split did not restore triplet rigidity");
  expect(ctx.__sixBallLastFinalRigidityCorrectionV1?.reason==="reject-airborne-upward-two-plus-one","airborne split rejection was not recorded");
}

/* Direction +1 is finalized before pair metadata. Even if both the separator
   fields and the base plan still name the opposite pair, rebuild top+RIGHT as
   the rigid pair and release LEFT solo. */
{
  const members=makeUpMembers(815);
  const [top,left,right]=members;
  const ctx=install({
    independent:(board,group,member)=>member===top
      ?motion(member,1,1)
      :{...motion(member,member===left?-1:1,1),pivot:[6,5]},
    separator:()=>({
      hitFraction:.5,top,pairLower:left,solo:right,
      soloMotion:{...motion(right,1,1),pivot:[6,5]},
      px:6,py:5,dir:1
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
  expect(right.ball.motionGroupRole===right.role,"correct right-pair role was not restored after stale solo metadata");
  expect(ctx.__sixBallLastFinalRigidityCorrectionV1?.reason==="split-direction-confirmed-before-pair-rigidity","pair was not committed after direction confirmation");
}

/* At a current middle-50% contact, a whole-triplet horizontal correction from
   an older layer is farther than the already available split. Split in place;
   do not slide the three balls sideways first. */
{
  const members=makeUpMembers(814);
  const [top,left,right]=members;
  const ctx=install({
    independent:(board,group,member)=>member===top
      ?motion(member,1,1)
      :{...motion(member,member===left?-1:1,1),pivot:[6,5]},
    separator:()=>({
      hitFraction:.5,top,pairLower:right,solo:left,
      soloMotion:{...motion(left,-1,1),pivot:[6,5]},
      px:6,py:5,dir:1
    }),
    splitPlan:()=>[
      {...motion(top,1,1),bundleId:814,groupSize:2},
      {...motion(right,1,1),bundleId:814,groupSize:2},
      {...motion(left,-1,1),bundleId:0,groupSize:0}
    ],
    base:()=>members.map(member=>({
      ...motion(member,2,0),kind:"GROUP_HORIZONTAL_SNAP",
      bundleId:814,groupSize:3
    }))
  });
  const out=ctx.hexPhysPlanGroup([],members,false);
  expect(out.length===3&&out.every(step=>step.ty-step.y===1),"horizontal correction ran before the nearer current split");
  expect(out.filter(step=>step.groupSize===2).every(step=>[top.ball.id,right.ball.id].includes(step.ball.id)),"nearer split kept the wrong rigid pair");
  expect(ctx.__sixBallLastFinalRigidityCorrectionV1?.reason==="split-direction-confirmed-before-pair-rigidity","nearer current split was not committed directly");
}

/* Mirrored direction -1 must independently derive top+LEFT as the pair and
   release RIGHT solo, regardless of stale right-pair metadata. */
{
  const members=makeUpMembers(816);
  const [top,left,right]=members;
  const ctx=install({
    independent:(board,group,member)=>member===top
      ?motion(member,-1,1)
      :{...motion(member,member===left?-1:1,1),pivot:[6,5]},
    separator:()=>({
      hitFraction:.5,top,pairLower:right,solo:left,
      soloMotion:{...motion(left,-1,1),pivot:[6,5]},
      px:6,py:5,dir:-1
    }),
    splitPlan:()=>[
      {...motion(top,-1,1),bundleId:816,groupSize:2},
      {...motion(left,-1,1),bundleId:816,groupSize:2},
      {...motion(right,1,1),bundleId:0,groupSize:0}
    ],
    base:()=>[
      {...motion(top,1,1),bundleId:816,groupSize:2},
      {...motion(right,1,1),bundleId:816,groupSize:2},
      {...motion(left,-1,1),bundleId:0,groupSize:0}
    ]
  });
  const out=ctx.hexPhysPlanGroup([],members,false);
  const pair=out.filter(step=>step.groupSize===2).map(step=>step.ball.id).sort();
  expect(JSON.stringify(pair)===JSON.stringify([top.ball.id,left.ball.id].sort()),"mirrored split direction did not derive the left pair");
  expect(!right.ball.rigid&&left.ball.rigid,"mirrored direction committed stale right-pair rigidity");
  expect(left.ball.motionGroupRole===left.role,"correct left-pair role was not restored after stale solo metadata");
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

/* Upward-convex RIGHT split: once the omitted right ball is locked into a
   two-support V-pocket, release it and keep top+LEFT as the rigid pair. */
{
  const members=makeUpMembers(820);
  const [top,left,right]=members;
  const ctx=install({
    independent:(board,group,member)=>member===right?null:motion(member,-1,1),
    supportInfo:()=>({floor:false,count:2,realCount:2}),
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
  expect(ctx.__sixBallLastFinalRigidityCorrectionV1?.reason==="position-final-member-released-after-support-proof","position-final split lacked support proof");
}

/* A slope collision can make the isolated lower probe return null for one
   resolver pass. With only one lower support it is not position-final; rebuild
   the authored downhill vector as one rigid three-ball translation. */
{
  const members=makeUpMembers(821);
  const [top,left,right]=members;
  const ctx=install({
    independent:(board,group,member)=>member===right?null:motion(member,-1,1),
    supportInfo:()=>({floor:false,count:1,realCount:1}),
    base:()=>[
      {...motion(top,-1,1),bundleId:821,groupSize:2},
      {...motion(left,-1,1),bundleId:821,groupSize:2}
    ]
  });
  const out=ctx.hexPhysPlanGroup([],members,false);
  expect(out.length===3&&out.every(step=>step.groupSize===3&&step.tx-step.x===-1&&step.ty-step.y===1),"temporary slope stop was not restored as one triplet");
  expect(members.every(member=>member.ball.rigid&&member.ball.motionGroupSize===3),"restored slope triplet lost rigidity");
  expect(ctx.__sixBallLastFinalRigidityCorrectionV1?.reason==="restore-pair-only-slope-as-rigid-triplet","slope pair-only recovery was not recorded");
}

/* If the complete translation is physically blocked too, wait with all three
   members rigid. A single contact is still not permission to split. */
{
  const members=makeUpMembers(822);
  const [top,left,right]=members;
  const ctx=install({
    independent:(board,group,member)=>member===right?null:motion(member,-1,1),
    supportInfo:()=>({floor:false,count:1,realCount:1}),
    groupPlan:()=>null,
    base:()=>[
      {...motion(top,-1,1),bundleId:822,groupSize:2},
      {...motion(left,-1,1),bundleId:822,groupSize:2}
    ]
  });
  const out=ctx.hexPhysPlanGroup([],members,false);
  expect(out.length===0,"unsupported pair-only slope collision was allowed to split");
  expect(members.every(member=>member.ball.rigid&&member.ball.motionGroupSize===3),"rejected pair-only slope collision did not keep the triplet");
  expect(ctx.__sixBallLastFinalRigidityCorrectionV1?.reason==="reject-pair-only-slope-contact-not-position-final","unsupported pair-only rejection was not recorded");
}

/* If the selected event omits one member, omission itself finalizes that
   member's position for the event. It must not keep stale group metadata. */
{
  const members=makeMembers(720);
  const ctx=install({
    independent:(board,group,member)=>member.ball.id===100
      ?null
      :motion(member,1,1),
    supportInfo:()=>({floor:false,count:2,realCount:2}),
    base:(board,group)=>group.slice(1).map(member=>({
      ...motion(member,1,1),bundleId:720,groupSize:2
    }))
  });
  const out=ctx.hexPhysPlanGroup([],members,false);
  expect(out.length===2&&out.every(step=>step.groupSize===2),"declared pair was not preserved");
  expect(!members[0].ball.rigid&&members[0].ball.motionGroupId===0,"omitted fixed member retained rigidity");
}

/* Different moving directions are not a third split trigger. Without current
   central contact or an omitted position-final member, keep the full body. */
{
  const members=makeMembers(725);
  const ctx=install({
    independent:(board,group,member)=>motion(member,member.ball.id===100?-1:1,1),
    base:(board,group)=>group.map((member,index)=>({
      ...motion(member,index===0?-1:1,1),
      bundleId:index<2?725:0,
      groupSize:index<2?2:0
    }))
  });
  const out=ctx.hexPhysPlanGroup([],members,false);
  expect(out.length===0,"divergent motion created an unauthorized third split path");
  expect(members.every(member=>member.ball.rigid&&member.ball.motionGroupSize===3),"unauthorized divergent split did not restore the full body");
  expect(ctx.__sixBallLastFinalRigidityCorrectionV1?.reason==="reject-ordinary-split-without-central-contact-or-position-final","unauthorized split rejection was not recorded");
}

/* A terminal group releases immediately when logical positions are final. */
{
  const members=makeMembers(730);
  const ctx=install({
    independent:()=>null,
    supportInfo:()=>({floor:true,count:2,realCount:2}),
    base:()=>[]
  });
  const out=ctx.hexPhysPlanGroup([],members,false);
  expect(out.length===0,"settled group invented motion");
  expect(members.every(member=>!member.ball.rigid&&member.ball.motionGroupId===0),"settled group retained rigidity");
}

/* Preview must report the correction without mutating canonical metadata. */
{
  const members=makeMembers(740);
  const before=JSON.stringify(members.map(member=>member.ball));
  const ctx=install({
    independent:()=>null,
    supportInfo:()=>({floor:true,count:2,realCount:2}),
    base:()=>[]
  });
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

console.log("final rigidity authority v11 PASS");
