// A ball's landing offset (impactOffsetX: how far left or right of its cell
// the piece was dropped) limits sideways motion only while it lands. Once the
// board is at rest (a new piece appears) it is cleared (app-05.js spawn), so a
// ball dropped right of centre turns ago can still roll left into a hole that
// a clear opens beside it. Before, the stale offset made that roll "more than
// one cell from where it landed" and the ball stayed on one support, while
// the mirror image of the same board rolled (2026-11 mirror audit).
const vm = require("vm"), assert = require("assert");
const { ctx } = require("./v1303-plan-group-smoke.js");
const r = vm.runInContext(`(()=>{
  function put(g,x,y){const b=mkBall(g,1);g.board[y][x]=b;noteBoardCell(g.board,y,b);setVis(g,b,x,y,0);return b;}
  function scene(mirror){
    const g=createEngine(31,{offset:false,gravityRamp:false});
    let k=0;while(!(g.state==="PLAYING"&&g.piece)&&k++<20000)stepEngine(g,1/120);
    const X=x=>mirror?18-x:x;
    // Floor and a second row; the cell left of the ball's lower right
    // support (13,10) and the cell beside it (12,9) are empty, so it is no arch.
    for(const x of [0,2,4,6,8,10,12,14,16,18])put(g,x,11);
    for(const x of [11,15,17])put(g,X(x),10);
    const ball=put(g,X(14),9);
    ball.impactOffsetX=mirror?-0.665:0.665;ball.momentumX=mirror?-1:1;ball.subCellBias=mirror?-1:1;
    const stale=hexPhysNaturalMotion(g.board,X(14),9);
    spawn(g);
    const rested=hexPhysNaturalMotion(g.board,X(14),9);
    const m=p=>p?[mirror?18-p.tx:p.tx,p.ty]:null;
    return {stale:m(stale),rested:m(rested),offset:ball.impactOffsetX};
  }
  return {normal:scene(false),mirror:scene(true)};
})()`, ctx);
assert.strictEqual(JSON.stringify(r.normal.stale), "null", "fixture: the stale offset blocks the roll");
assert.strictEqual(r.normal.offset, 0, "the landing offset is cleared when the next piece appears");
assert.strictEqual(JSON.stringify(r.normal.rested), "[13,10]", "a resting ball rolls into the hole beside it: " + JSON.stringify(r));
assert.strictEqual(JSON.stringify(r.mirror.rested), "[13,10]", "the mirror image rolls the same way: " + JSON.stringify(r));
console.log("stale landing offset PASS", JSON.stringify(r));
