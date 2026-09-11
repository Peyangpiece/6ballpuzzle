const fs=require("fs");
const vm=require("vm");
const path=require("path");
const {ctx}=require("./v1303-plan-group-smoke.js");

// The shared harness already loads the current production physics layers once.

function expect(v,msg){if(!v)throw new Error(msg);}

const result=vm.runInContext(`(()=>{
  function exercise(kind,groupSize,seed){
    const g=createEngine(seed);g.state="RESOLVING";g.phase="SETTLE";
    const ball=mkBall(g,2);
    /* y=8 is a narrow/even level in the floor-based 10/9 lattice. */
    g.board[8][7]=ball;noteBoardCell(g.board,8,ball);
    g.vis.set(ball.id,{x:7,y:9.42,vy:2,motionSpeed:2});
    const proposal={
      x:7,y:8,tx:8,ty:9,ball,
      kind,pivot:null,topPivot:null,followSupportIds:[],
      bundleId:groupSize>=2?seed:0,groupSize,
      strictInnerContactAuthorized:true
    };
    hexPhysAppendSegment(ball,proposal,seed);
    const seg=ball.fallPath?.[0]||null;
    let upward=0,previous=Number(g.vis.get(ball.id).y);
    for(let i=0;i<48;i++){
      updateVisuals(g,1/120);
      const y=Number(g.vis.get(ball.id).y);
      if(y<previous-1e-9)upward++;
      previous=y;
    }
    return{
      kind,groupSize,upward,finalY:previous,
      strict:seg?.strictInnerContactAuthorized===true,
      token:seg?.splitCompletionNoLift===true,
      classified:ordinarySplitSegmentNoLift(ball,seg)===true,
      semantic:window.__sixBallStrictInnerSplitSegmentNoLift(ball,seg)===true
    };
  }

  const pair=exercise("GROUP_SLOPE_TRANSLATE",2,860001);
  const solo=exercise("ROLL_RIGHT",0,860002);

  const normal=createEngine(860003),normalBall=mkBall(normal,1);
  normal.board[8][7]=normalBall;noteBoardCell(normal.board,8,normalBall);
  hexPhysAppendSegment(normalBall,{
    x:7,y:8,tx:8,ty:9,ball:normalBall,
    kind:"GROUP_SLOPE_TRANSLATE",pivot:null,topPivot:null,
    followSupportIds:[],bundleId:860003,groupSize:3
  },860003);
  const normalSeg=normalBall.fallPath?.[0]||null;

  return{
    pair,solo,
    normal:{
      token:normalSeg?.splitCompletionNoLift===true,
      strict:normalSeg?.strictInnerContactAuthorized===true,
      classified:ordinarySplitSegmentNoLift(normalBall,normalSeg)===true
    },
    flags:{
      loaded:window.__sixBallEvenRowSplitContinuityV1,
      survives:window.__sixBallStrictInnerAuthorizationSurvivesFallPath,
      noLift:window.__sixBallStrictInnerCompletionUsesNoLiftPath,
      parityUnified:window.__sixBallEvenNarrowRowSplitUsesSameCompletionAsWideRow
    }
  };
})()`,ctx);

expect(Object.values(result.flags).every(Boolean),"even-row split continuity authority flags missing");
for(const q of[result.pair,result.solo]){
  expect(q.strict&&q.token&&q.classified&&q.semantic,"strict-inner authorization was lost before render completion");
  expect(q.upward===0,"strict-inner split completion moved upward on a narrow/even row");
}
expect(!result.normal.token&&!result.normal.strict&&!result.normal.classified,"ordinary rigid slope was incorrectly reclassified as a split");
console.log("even-row strict-inner split continuity PASS",JSON.stringify(result));
