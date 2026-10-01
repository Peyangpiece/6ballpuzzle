const vm=require('vm'),assert=require('assert/strict'),fs=require('fs');
const {ctx}=require('./v1303-plan-group-smoke.js');
const ref=require('./fixtures/reference-gameover-20260814.json');
ctx.gameOverReference=ref;
const result=vm.runInContext(`(()=>{
 const r=gameOverReference;
 const errors=r.samples.map(([f,y])=>{
  const s=gameOverBallVisualState((f-r.lossFrame)/r.fps,r.upperRow);
  return {frame:f,actual:r.upperOriginY+s.offset*REFERENCE_BALL_PX,expected:y,alpha:s.alpha};
 });
 const floor=r.floorSamples.map(([f,y])=>({frame:f,actual:r.floorOriginY+gameOverBallVisualState((f-r.lossFrame)/r.fps,ROWS-1).offset*REFERENCE_BALL_PX,expected:y}));
 const g=createEngine(716);g.state='GAMEOVER';g.stateT=0;g.alive=false;
 const b=mkBall(g,1);g.board[11][8]=b;setVis(g,b,8,11,0);
 const before=JSON.stringify(g.board);for(let i=0;i<480;i++)stepEngine(g,1/120);
 return {errors,floor,boardFrozen:before===JSON.stringify(g.board),lateOffset:gameOverBallVisualState(3,0).offset};
})()`,ctx);
const errors=[...result.errors,...result.floor].map(p=>Math.abs(p.actual-p.expected));
const rms=Math.sqrt(errors.reduce((n,e)=>n+e*e,0)/errors.length),max=Math.max(...errors);
assert(rms<=ref.rmsTolerancePx,`Loss trajectory RMS: ${rms}`);
assert(max<=ref.maxTolerancePx,`Loss trajectory max: ${max}`);
assert(result.boardFrozen,'Death presentation changes logical board');
assert(result.lateOffset>12,'Upper row never falls out of field');
assert(result.errors.every(p=>p.alpha===1),'Death balls fade before leaving through clip');
const renderer=fs.readFileSync('public/app-14.js','utf8');
assert(renderer.includes('const death=gameOverBallVisualState(g.stateT,y)'),'Renderer bypasses reference sink');
assert(!renderer.includes('py+=D*1.45*dk*dk'),'Short legacy sink is still active');
console.log('reference game-over capture parity PASS',JSON.stringify({rms,max,result}));
