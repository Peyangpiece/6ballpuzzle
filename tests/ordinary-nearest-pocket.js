const {ctx}=require("./v1303-plan-group-smoke.js");

function expect(value,message){if(!value)throw new Error(message);}
function ball(id,extra={}){
  return{
    id,c:id%5,isGarbage:false,
    motionGroupId:0,motionGroupRole:-1,
    motionGroupOrientation:"",motionGroupSize:0,rigid:false,
    momentumX:0,rollDir:0,subCellBias:0,impactOffsetX:0,
    ...extra
  };
}
function fixture({offset=0,momentum=0,leftSupport=true,rightSupport=false}={}){
  const board=ctx.__v1303OracleNewBoard();
  const moving=ball(7001,{impactOffsetX:offset,momentumX:momentum});
  board[3][6]=moving;
  board[5][6]=ball(7002);
  if(leftSupport)board[5][4]=ball(7003);
  if(rightSupport)board[5][8]=ball(7004);
  return{board,moving};
}

/* A stable two-support pocket beats stale momentum when both destinations are
   exactly half a ball away. */
{
  const {board}=fixture({offset:0,momentum:1,leftSupport:true,rightSupport:false});
  const move=ctx.hexPhysNaturalMotion(board,6,3);
  expect(move&&move.tx===5&&move.ty===4,"stable left pocket did not beat rightward momentum");
}

/* With stable pockets on both sides, continuous X chooses the closest one. */
{
  const {board}=fixture({offset:.4,momentum:-1,leftSupport:true,rightSupport:true});
  const move=ctx.hexPhysNaturalMotion(board,6,3);
  expect(move&&move.tx===7&&move.ty===4,"nearest stable pocket was not selected");
}

/* A pocket more than half a ball away may not pull the ball sideways. */
{
  const {board}=fixture({offset:.4,momentum:-1,leftSupport:true,rightSupport:false});
  const move=ctx.hexPhysNaturalMotion(board,6,3);
  expect(move&&move.tx===7&&move.ty===4,"far pocket exceeded the half-ball horizontal limit");
}

expect(ctx.__sixBallOrdinaryGravityChoosesNearestStablePocket===true,"nearest-pocket gravity marker missing");
expect(ctx.__sixBallOrdinaryGravityHorizontalLimitBallDiameters===.5,"ordinary gravity half-ball marker missing");
console.log("ordinary nearest pocket PASS");
