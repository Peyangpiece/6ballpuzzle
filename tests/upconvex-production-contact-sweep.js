const fs=require("fs");
const vm=require("vm");
const path=require("path");
const {ctx}=require("./v1303-plan-group-smoke.js");

for(const file of[
  "app-collapse-timing-authoritative-v2.js",
  "app-runtime-performance-v3.js",
  "app-rigidity-final-authority-v1.js"
]){
  vm.runInContext(
    fs.readFileSync(path.join(__dirname,"../public",file),"utf8"),
    ctx,
    {filename:file}
  );
}

function expect(value,message){if(!value)throw new Error(message);}

function ball(id,extra={}){
  return{
    id,c:id%5,isGarbage:false,
    motionGroupId:880000,motionGroupRole:-1,
    motionGroupOrientation:"up",motionGroupSize:3,rigid:true,
    momentumX:0,rollDir:0,subCellBias:0,
    ...extra
  };
}

function fixture({center,topY,offset,momentum,preview,dense=false}){
  const board=ctx.__v1303OracleNewBoard();
  const balls=[
    ball(881001,{motionGroupRole:0,impactOffsetX:offset,momentumX:momentum}),
    ball(881002,{motionGroupRole:1,impactOffsetX:offset,momentumX:momentum}),
    ball(881003,{motionGroupRole:2,impactOffsetX:offset,momentumX:momentum})
  ];
  const members=[
    {ball:balls[0],x:center,y:topY,role:0,orientation:"up"},
    {ball:balls[1],x:center+1,y:topY+1,role:1,orientation:"up"},
    {ball:balls[2],x:center-1,y:topY+1,role:2,orientation:"up"}
  ];
  for(const member of members)board[member.y][member.x]=member.ball;
  board[topY+2][center]=ball(889999,{
    motionGroupId:0,motionGroupSize:0,motionGroupOrientation:"",rigid:false
  });
  if(dense){
    let pileId=890000;
    for(let y=topY+3;y<12;y++)for(let x=0;x<19;x++){
      if(ctx.__v1303OracleValid(x,y)&&!board[y][x]){
        board[y][x]=ball(pileId++,{
          motionGroupId:0,motionGroupSize:0,motionGroupOrientation:"",rigid:false
        });
      }
    }
  }

  const before=JSON.stringify(members.map(({ball:b})=>({
    id:b.id,group:b.motionGroupId,size:b.motionGroupSize,
    rigid:b.rigid,role:b.motionGroupRole,orientation:b.motionGroupOrientation
  })));
  const motions=members.map(member=>
    ctx.hexPhysIndependentMemberMotion(board,members,member)
  );
  const separator=ctx.hexPhysUpConvexSeparator(board,members,motions);
  ctx.__sixBallLastFinalRigidityCorrectionV1=null;
  const raw=ctx.hexPhysPlanGroup(board,members,preview)||[];
  const after=JSON.stringify(members.map(({ball:b})=>({
    id:b.id,group:b.motionGroupId,size:b.motionGroupSize,
    rigid:b.rigid,role:b.motionGroupRole,orientation:b.motionGroupOrientation
  })));
  const plan=raw.map(step=>({
    id:step.ball.id,
    x:Number(step.x),y:Number(step.y),
    tx:Number(step.tx),ty:Number(step.ty),
    dx:Number(step.tx)-Number(step.x),
    dy:Number(step.ty)-Number(step.y),
    kind:step.kind||"",
    pivot:Array.isArray(step.pivot)?[...step.pivot]:null,
    groupSize:Number(step.groupSize)||0,
    bundleId:Number(step.bundleId)||0
  })).sort((a,b)=>a.id-b.id);
  return{
    board,before,after,members,motions,separator,plan,
    correction:ctx.__sixBallLastFinalRigidityCorrectionV1
  };
}

function activeSplit(result){
  return result.plan.some(step=>step.groupSize===2)&&
    result.plan.some(step=>step.groupSize===0);
}

function pairOnlySplit(result){
  return result.plan.filter(step=>step.groupSize===2).length===2&&
    !result.plan.some(step=>step.groupSize===0);
}

function canonical(result){return JSON.stringify(result.plan);}

function preservesRigidShape(plan){
  if(plan.length!==3)return false;
  for(let i=0;i<plan.length;i++)for(let j=i+1;j<plan.length;j++){
    const before=ctx.hexPhysDist(plan[i].x,plan[i].y,plan[j].x,plan[j].y);
    const after=ctx.hexPhysDist(plan[i].tx,plan[i].ty,plan[j].tx,plan[j].ty);
    if(Math.abs(before-after)>1e-9)return false;
  }
  return true;
}

let cases=0;
let active=0;
let outerRigid=0;
let outerMoving=0;
let outerWaiting=0;
let pairOnly=0;
let exactBoundaries=0;
const outerReasons=new Map();
let denseCases=0;

const offsets=[];
for(let i=-200;i<=200;i++)offsets.push(i/200);
for(const value of[-.500000001,-.5,-.499999999,.499999999,.5,.500000001]){
  if(!offsets.includes(value))offsets.push(value);
}

for(const center of[4,6,8,10,12,14]){
  for(const topY of[1,3,5,7]){
    for(const momentum of[-1,0,1]){
      for(const offset of[
        -1,-.75,-.500000001,-.5,-.499999999,-.49,-.1,
        0,.1,.49,.499999999,.5,.500000001,.75,1
      ]){
        const input={center,topY,offset,momentum,dense:true};
        const preview=fixture({...input,preview:true});
        const commit=fixture({...input,preview:false});
        denseCases++;
        expect(preview.before===preview.after,
          `dense preview mutated metadata ${JSON.stringify(input)}`);
        expect(canonical(preview)===canonical(commit),
          `dense preview/commit mismatch ${JSON.stringify({input,preview:preview.plan,commit:commit.plan})}`);
        const outer=offset<=-.5+1e-9||offset>=.5-1e-9;
        if(outer){
          expect(!preview.separator&&!activeSplit(preview),
            `dense outer-quarter contact split ${JSON.stringify({input,plan:preview.plan})}`);
          expect(preview.plan.every(step=>step.dy>0),
            `dense outer-quarter contact moved horizontally ${JSON.stringify({input,plan:preview.plan})}`);
          expect(
            preview.plan.length===0||(
              preview.plan.length===3&&
              preview.plan.every(step=>step.groupSize===3)&&
              preservesRigidShape(preview.plan)
            ),
            `dense outer-quarter contact partially moved or deformed ${JSON.stringify({input,plan:preview.plan})}`
          );
        }
      }
    }
  }
}

/* The former outer-quarter exception bypassed gravity with a (+/-2,0)
   same-row slide. Neither the resolver nor settlePass may recreate it. */
for(const offset of[-.75,.75]){
  const live=fixture({center:8,topY:3,offset,momentum:Math.sign(offset),preview:true,dense:true});
  const resolved=ctx.hexPhysResolveEvent(live.board,false)||[];
  const ids=new Set(live.members.map(member=>member.ball.id));
  const group=resolved.filter(step=>ids.has(step.ball.id));
  expect(group.every(step=>step.ty>step.y),
    `resolver accepted same-row movement ${JSON.stringify({offset,group})}`);

  const atomic=fixture({center:8,topY:3,offset,momentum:Math.sign(offset),preview:true,dense:true});
  ctx.settlePass(atomic.board,false);
  for(const member of atomic.members){
    for(const segment of member.ball.fallPath||[]){
      expect(segment.to[1]>segment.from[1],
        `settlePass authored same-row movement ${JSON.stringify({offset,segment})}`);
    }
  }
}

for(const center of[4,6,8,10,12,14]){
  for(const topY of[1,3,5,7]){
    for(const momentum of[-1,0,1]){
      for(const offset of offsets){
        const input={center,topY,offset,momentum};
        const preview=fixture({...input,preview:true});
        const commit=fixture({...input,preview:false});
        cases++;

        expect(preview.before===preview.after,
          `preview mutated metadata ${JSON.stringify(input)}`);
        expect(canonical(preview)===canonical(commit),
          `preview/commit mismatch ${JSON.stringify({input,preview:preview.plan,commit:commit.plan})}`);

        const outer=offset<=-.5+1e-9||offset>=.5-1e-9;
        if(outer){
          expect(!preview.separator,
            `separator escaped outer-quarter gate ${JSON.stringify({input,separator:preview.separator})}`);
          expect(!activeSplit(preview),
            `active split escaped outer-quarter gate ${JSON.stringify({input,plan:preview.plan})}`);
          const wholeRigid=
            preview.plan.length===3&&
            preview.plan.every(step=>step.groupSize===3)&&
            new Set(preview.plan.map(step=>step.bundleId)).size===1&&
            preservesRigidShape(preview.plan);
          if(wholeRigid)outerMoving++;
          else if(preview.plan.length===0){
            outerWaiting++;
            const reason=commit.correction?.reason||"none";
            outerReasons.set(reason,(outerReasons.get(reason)||0)+1);
          }
          else expect(false,
            `outer-quarter contact produced partial motion ${JSON.stringify({input,plan:preview.plan})}`);
          outerRigid++;
          if(Math.abs(Math.abs(offset)-.5)<=1e-12)exactBoundaries++;
        }else if(activeSplit(preview)){
          active++;
          const pairIds=new Set(preview.plan.filter(step=>step.groupSize===2).map(step=>step.id));
          const solo=preview.plan.find(step=>step.groupSize===0);
          expect(pairIds.has(881001)&&pairIds.size===2,
            `split pair lost top ball ${JSON.stringify({input,plan:preview.plan})}`);
          if(offset>1e-9){
            expect(pairIds.has(881002)&&solo?.id===881003,
              `left split did not keep right pair ${JSON.stringify({input,plan:preview.plan})}`);
          }else if(offset<-1e-9){
            expect(pairIds.has(881003)&&solo?.id===881002,
              `right split did not keep left pair ${JSON.stringify({input,plan:preview.plan})}`);
          }
        }

        if(pairOnlySplit(preview))pairOnly++;
      }
    }
  }
}

expect(active>0,"sweep never exercised an active middle-50% split");
expect(outerRigid>0&&exactBoundaries>0,"sweep missed outer quarters or exact boundaries");
expect(outerMoving+outerWaiting===outerRigid,
  `outer-quarter accounting mismatch moving=${outerMoving} waiting=${outerWaiting}`);
expect(ctx.__sixBallFallingRigidTriangleNeverRotates===true,
  "falling no-rotation invariant marker missing");
expect(ctx.__sixBallUpConvexOuterQuarterUsesRigidSlide===false,
  "outer-quarter horizontal slide remains enabled");
expect(ctx.__sixBallOuterQuarterRigidSlideBypassesPerMemberDownFilter===false,
  "horizontal-slide gravity bypass remains enabled");
expect(ctx.__sixBallPureHorizontalGroupMotionForbidden===true,
  "pure-horizontal group guard missing");
expect(ctx.__sixBallAirborneUpConvexTwoPlusOneIsForbidden===true,
  "airborne 2+1 invariant marker missing");
expect(ctx.__sixBallSplitDirectionPrecedesPairRigidity===true,
  "direction-before-pair invariant marker missing");
expect(ctx.__sixBallPivotArcPreservesLogicalRadius===true,
  "variable-radius pivot rendering marker missing");
expect(ctx.__sixBallFinalRigidityAuthorityVersion==="final-rigidity-authority-v18",
  "final rigidity authority version mismatch");
console.log(
  `up-convex production contact sweep PASS ${cases}/${cases} `+
  `active=${active} outerRigid=${outerRigid} outerMoving=${outerMoving} `+
  `outerWaiting=${outerWaiting} exactBoundaries=${exactBoundaries} pairOnly=${pairOnly} `+
  `dense=${denseCases} resolverNoHorizontal=2 settleNoHorizontal=2 `+
  `outerReasons=${JSON.stringify(Object.fromEntries(outerReasons))}`
);
