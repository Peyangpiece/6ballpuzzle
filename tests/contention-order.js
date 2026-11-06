// Two moves that want the same cell: the ball whose support went first moves
// first; equal times keep the old left-to-right order
// (public/app-contention-order-v1.js, hexPhysCandidateBundles).
const vm = require("vm"), assert = require("assert");
const { ctx } = require("./v1303-plan-group-smoke.js");
const r = vm.runInContext(`(()=>{
  const b=__v1303OracleNewBoard();
  const ball=id=>({id,c:1,motionGroupId:0,motionGroupRole:-1,motionGroupSize:0});
  // (8,7) rests on nothing: (7,8) and (9,8) are empty. (10,7) rests on (11,8).
  b[8][11]=ball(1);
  b.__vacatedAt=new Map([["9,8",1],["7,8",2]]);
  const lostLeft=hexPhysSupportLostAt(b,8,7),lostRight=hexPhysSupportLostAt(b,10,7);
  // Two single-ball rolls into (9,8), equal in height, depth and sideways step.
  const L={x:8,y:7,tx:9,ty:8,ball:ball(2),supportLostAt:lostLeft};
  const R={x:10,y:7,tx:9,ty:8,ball:ball(3),supportLostAt:lostRight};
  const order=hexPhysCandidateBundles([L,R]).map(bundle=>bundle[0].ball.id);
  const tieL={...L,ball:ball(4),supportLostAt:1},tieR={...R,ball:ball(5),supportLostAt:1};
  const tie=hexPhysCandidateBundles([tieR,tieL]).map(bundle=>bundle[0].ball.id);
  return {lostLeft,lostRight,order:order.join(","),tie:tie.join(",")};
})()`, ctx);
assert.strictEqual(r.lostLeft, 2, "a ball with nothing under it lost its support when the later cell emptied");
assert.strictEqual(r.lostRight, 1, "a ball rolling round one support lost it when the cell it rolls into emptied");
assert.strictEqual(r.order, "3,2", "the right ball's support went first, so it moves first");
assert.strictEqual(r.tie, "4,5", "equal times keep left before right");
console.log("contention order PASS", JSON.stringify(r));
