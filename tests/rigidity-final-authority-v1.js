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
function makeDownMembers(gid=900){
  const positions=[{x:5,y:3},{x:7,y:3},{x:6,y:4}];
  return positions.map((position,i)=>({
    ball:{
      id:300+i,c:i,isGarbage:false,
      motionGroupId:gid,motionGroupRole:i,
      motionGroupOrientation:"down",motionGroupSize:3,rigid:true
    },
    ...position,role:i,orientation:"down"
  }));
}
function motion(member,dx=1,dy=1){
  return{
    x:member.x,y:member.y,tx:member.x+dx,ty:member.y+dy,
    ball:member.ball,kind:"ROLL_RIGHT",pivot:null,topPivot:null,
    followSupportIds:[]
  };
}
function install({base,independent,natural,groupPlan,supportInfo,touchesFloor,separator,splitPlan,rigidSlope,valid,createEngine}){
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
  if(createEngine)ctx.createEngine=createEngine;
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
  const members=makeUpMembers(700);
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
  expect(ctx.__sixBallFinalRigidityAuthorityVersion==="final-rigidity-authority-v15","v15 final authority marker missing");
  expect(ctx.__sixBallSlopeTriangleAlwaysKeepsRigidity===true,"slope invariant marker missing");
  expect(ctx.__sixBallUpConvexSplitKeepsOppositePair===true,"up-convex invariant marker missing");
  expect(ctx.__sixBallUpConvexActiveSplitRequiresMiddleFiftyPercent===true,"middle-50% invariant marker missing");
  expect(ctx.__sixBallUpConvexSplitRequiresCurrentBilateralPivotContact===true,"current bilateral contact marker missing");
  expect(ctx.__sixBallAirborneUpConvexTwoPlusOneIsForbidden===true,"airborne 2+1 guard marker missing");
  expect(ctx.__sixBallSplitDirectionPrecedesPairRigidity===true,"direction-before-pair marker missing");
  expect(ctx.__sixBallFallingRigidTriangleNeverRotates===true,"falling no-rotation invariant marker missing");
  expect(ctx.__sixBallUpConvexOuterQuarterUsesRigidSlide===false,"outer-quarter horizontal slide remains enabled");
  expect(ctx.__sixBallOuterQuarterRigidSlideBypassesPerMemberDownFilter===false,"horizontal-slide gravity bypass remains enabled");
  expect(ctx.__sixBallPureHorizontalGroupMotionForbidden===true,"pure-horizontal group guard missing");
  expect(ctx.__sixBallPairOnlyReleaseRequiresPositionFinalSupport===true,"pair-only support proof marker missing");
  expect(ctx.__sixBallLegalPairSlopeBeatsEverySplitOrRelease===true,"legal pair-slope priority marker missing");
  expect(ctx.__sixBallCurrentContactFractionDefinesSplitSide===true,"current contact-side marker missing");
  expect(ctx.__sixBallCurrentCentralSplitBeatsHorizontalSnap===true,"central split vs horizontal-snap priority marker missing");
  expect(ctx.__sixBallOrdinarySplitOnlyCentralOrPositionFinal===false,"two-trigger whitelist still claims all ordinary groups");
  expect(ctx.__sixBallUpConvexSplitOnlyCentralOrPositionFinal===true,"up-convex two-trigger split whitelist marker missing");
  expect(ctx.__sixBallInverseTriangleUsesLegacySplitRules===true,"inverse-triangle legacy marker missing");
  expect(ctx.__sixBallPositionFinalRequiresPhysicalStop===true,"position-final physical-stop marker missing");
  expect(ctx.__sixBallDivergentMotionAloneCannotSplit===true,"divergent-motion split rejection marker missing");
}

/* Without a central split contact, an older same-row group correction is
   discarded completely. The triplet waits rigid instead of moving sideways. */
{
  const members=makeUpMembers(703);
  const ctx=install({
    independent:()=>null,
    base:()=>members.map(member=>({
      ...motion(member,2,0),kind:"GROUP_HORIZONTAL_SNAP",
      bundleId:703,groupSize:3
    }))
  });
  const out=ctx.hexPhysPlanGroup([],members,false);
  expect(out.length===0,"pure-horizontal triplet proposal was accepted");
  expect(members.every(member=>member.ball.rigid&&member.ball.motionGroupSize===3),"horizontal rejection broke triplet rigidity");
  expect(ctx.__sixBallLastFinalRigidityCorrectionV1?.reason==="reject-pure-horizontal-group-motion","horizontal rejection was not recorded");
}

/* The two-trigger whitelist is intentionally NOT an inverse-triangle rule.
   Preserve the exact pair+solo plan selected by the pre-authority planner,
   including its legacy rigidity metadata and split direction. */
{
  const members=makeDownMembers(901);
  const [left,right,bottom]=members;
  let independentCalls=0;
  const legacyPlan=[
    {...motion(left,-1,1),bundleId:901,groupSize:2},
    {...motion(bottom,-1,1),bundleId:901,groupSize:2},
    {...motion(right,1,1),bundleId:0,groupSize:0}
  ];
  const ctx=install({
    independent:()=>{independentCalls++;return null;},
    base:()=>legacyPlan
  });
  const out=ctx.hexPhysPlanGroup([],members,false);
  expect(out===legacyPlan,"inverse triangle did not return the legacy plan unchanged");
  expect(independentCalls===0,"up-convex authority probed an inverse triangle");
  expect(out[0].groupSize===2&&out[2].groupSize===0,"inverse triangle legacy split metadata was rewritten");
  expect(!ctx.__sixBallLastFinalRigidityCorrectionV1,"inverse triangle received an up-convex correction");
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
  const members=makeUpMembers(710);
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

/* Recording 17:08:01: the BLUE lower-left side is the current contact side.
   A stale approach direction still says -1 (left pair), but hitFraction is on
   the left half. Current contact must release BLUE to the left and rebuild the
   RIGHT pair from PURPLE top + RED lower-right. */
{
  const members=makeUpMembers(823);
  const [purple,blue,red]=members;
  const ctx=install({
    independent:(board,group,member)=>member===purple
      ?motion(member,1,1)
      :{...motion(member,member===blue?-1:1,1),pivot:[6,5]},
    separator:()=>({
      hitFraction:.4,top:purple,pairLower:blue,solo:red,
      soloMotion:{...motion(red,1,1),pivot:[6,5]},
      px:6,py:5,dir:-1
    }),
    splitPlan:(board,group,info)=>[
      {...motion(info.top,info.dir,1),bundleId:823,groupSize:2},
      {...motion(info.pairLower,info.dir,1),bundleId:823,groupSize:2},
      {...info.soloMotion,bundleId:0,groupSize:0}
    ],
    base:()=>[
      {...motion(purple,-1,1),bundleId:823,groupSize:2},
      {...motion(blue,-1,1),bundleId:823,groupSize:2},
      {...motion(red,1,1),bundleId:0,groupSize:0}
    ]
  });
  const out=ctx.hexPhysPlanGroup([],members,false);
  const pair=out.filter(step=>step.groupSize===2).map(step=>step.ball.id).sort();
  expect(JSON.stringify(pair)===JSON.stringify([purple.ball.id,red.ball.id].sort()),"blue-side contact kept the reversed left pair");
  const solo=out.find(step=>step.ball.id===blue.ball.id);
  expect(solo?.groupSize===0&&solo.tx-solo.x===-1,"blue contact ball did not split left as the solo");
  expect(!blue.ball.rigid&&purple.ball.rigid&&red.ball.rigid,"blue-side contact committed the wrong rigidity pair");
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
   two-support V-pocket and the whole-triplet slope is blocked, release it and
   keep top+LEFT as the rigid pair. */
{
  const members=makeUpMembers(820);
  const [top,left,right]=members;
  const ctx=install({
    independent:(board,group,member)=>member===right?null:motion(member,-1,1),
    supportInfo:()=>({floor:false,count:2,realCount:2}),
    groupPlan:()=>null,
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

/* A slope collision can make the isolated lower probe look position-final for
   one resolver pass. The exact pair vector is nevertheless safe for the whole
   triplet, so rebuild it before either support release or split selection. */
{
  const members=makeUpMembers(821);
  const [top,left,right]=members;
  const ctx=install({
    independent:(board,group,member)=>member===right?null:motion(member,-1,1),
    supportInfo:()=>({floor:false,count:2,realCount:2}),
    base:()=>[
      {...motion(top,-1,1),bundleId:821,groupSize:2},
      {...motion(left,-1,1),bundleId:821,groupSize:2}
    ]
  });
  const out=ctx.hexPhysPlanGroup([],members,false);
  expect(out.length===3&&out.every(step=>step.groupSize===3&&step.tx-step.x===-1&&step.ty-step.y===1),"temporary slope stop was not restored as one triplet");
  expect(members.every(member=>member.ball.rigid&&member.ball.motionGroupSize===3),"restored slope triplet lost rigidity");
  expect(ctx.__sixBallLastFinalRigidityCorrectionV1?.reason==="legal-pair-slope-before-split-or-position-final","slope pair-only priority was not recorded");
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

/* If the selected event omits one physically stopped, two-support member,
   release it without leaving stale group metadata. */
{
  const members=makeUpMembers(720);
  const fixed=members[1];
  const ctx=install({
    independent:(board,group,member)=>member===fixed
      ?null
      :motion(member,1,1),
    supportInfo:()=>({floor:false,count:2,realCount:2}),
    groupPlan:()=>null,
    base:(board,group)=>group.filter(member=>member!==fixed).map(member=>({
      ...motion(member,1,1),bundleId:720,groupSize:2
    }))
  });
  const out=ctx.hexPhysPlanGroup([],members,false);
  expect(out.length===2&&out.every(step=>step.groupSize===2),"declared pair was not preserved");
  expect(!fixed.ball.rigid&&fixed.ball.motionGroupId===0,"omitted fixed member retained rigidity");
}

/* Logical support is insufficient while the live ball still has physical
   velocity. Release the fixed member only after its visual position, active
   batch and speed all report a complete stop. */
{
  const members=makeUpMembers(724);
  const fixed=members[1];
  const ctx=install({
    createEngine:()=>({
      board:Array.from({length:10},()=>Array(12).fill(null)),
      vis:new Map(),_visualMovingIds:new Set(),
      _liveBatchClock:{elapsed:0,duration:0,states:new Map()}
    }),
    independent:(board,group,member)=>member===fixed?null:motion(member,1,1),
    supportInfo:()=>({floor:false,count:2,realCount:2}),
    groupPlan:()=>null,
    base:(board,group)=>group.filter(member=>member!==fixed).map(member=>({
      ...motion(member,1,1),bundleId:724,groupSize:2
    }))
  });
  const game=ctx.createEngine();
  for(const member of members){
    game.board[member.y][member.x]=member.ball;
    game.vis.set(member.ball.id,{x:member.x,y:member.y,vy:0,motionSpeed:0});
  }
  game.vis.get(fixed.ball.id).vy=.25;
  const movingOut=ctx.hexPhysPlanGroup(game.board,members,false);
  expect(movingOut.length===0,"blocked, physically moving triplet should wait rigid");
  expect(fixed.ball.rigid&&fixed.ball.motionGroupSize===3,"moving member lost triplet rigidity");

  game.vis.get(fixed.ball.id).vy=0;
  const stoppedOut=ctx.hexPhysPlanGroup(game.board,members,false);
  expect(stoppedOut.length===2,"physically stopped supported member was not released");
  expect(!fixed.ball.rigid&&fixed.ball.motionGroupId===0,"physically stopped member retained rigidity");
}

/* Different moving directions are not a third split trigger. Without current
   central contact or an omitted position-final member, keep the full body. */
{
  const members=makeUpMembers(725);
  const divergent=members[0];
  const ctx=install({
    independent:(board,group,member)=>motion(member,member===divergent?-1:1,1),
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
  const members=makeUpMembers(730);
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
  const members=makeUpMembers(740);
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

console.log("final rigidity authority v15 PASS");
