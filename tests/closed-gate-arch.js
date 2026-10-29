// A ball may not step diagonally down between two balls that are only 1.73
// diameters apart (the ball beside it on its row and the ball beside the
// target cell): no path gets through without overlapping them by 13%, and the
// two side-by-side balls over the empty cell rest as an arch
// (app-intentional-hexagon-stability-v1.js). With either of them gone the
// step is allowed again.
const {ctx}=require("./v1303-plan-group-smoke.js");

function expect(value,message){if(!value)throw new Error(message);}
function ball(id){
  return{id,c:id%5,isGarbage:false,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0,rigid:false,momentumX:0,rollDir:0,subCellBias:0,impactOffsetX:0};
}
// Ball at (12,7) resting on one support below on side -dir, target cell
// (12+dir,8) empty, optionally a ball beside it at (12+2*dir,7).
function fixture(dir,gate){
  const board=ctx.__v1303OracleNewBoard();
  board[7][12]=ball(8001);
  board[8][12-dir]=ball(8002);
  if(gate)board[7][12+2*dir]=ball(8003);
  return board;
}

for(const dir of [1,-1]){
  const side=dir>0?"right":"left";
  const open=ctx.hexPhysNaturalMotion(fixture(dir,false),12,7);
  expect(open&&open.tx===12+dir&&open.ty===8,`open ${side} step was not taken: ${JSON.stringify(open&&[open.tx,open.ty])}`);
  const closed=ctx.hexPhysNaturalMotion(fixture(dir,true),12,7);
  expect(!closed,`closed ${side} gate was passed: ${JSON.stringify(closed&&[closed.tx,closed.ty,closed.kind])}`);
}
console.log("closed gate arch PASS");
