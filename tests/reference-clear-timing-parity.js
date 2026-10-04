const assert=require('assert/strict'),vm=require('vm');
const{ctx}=require('./v1303-plan-group-smoke.js');
const fixture=require('./fixtures/reference-clear-timing-20260814.json');
ctx.clearTimingReference=fixture;
const result=vm.runInContext(`(()=>{
 const rows=clearTimingReference.scenes.map(s=>{
  const hold=s.technique?WAZA[s.technique].hold:.4;
  const g=createEngine(813);g.state='RESOLVING';g.phase='CLEAR';g.holdT=hold;g.stateT=0;
  const cell=mkBall(g,1);g.board[11][8]=cell;setVis(g,cell,8,11,0);
  g.clearing={cells:[[8,11,1,cell.id]],ids:new Set([cell.id]),waza:s.technique?[s.technique]:[],committed:false,ghosts:[]};
  let committedAt=null;
  for(let i=1;i<600;i++){
   stepEngine(g,1/120);
   if(g.clearing?.committed){committedAt=i/120;break;}
  }
  return{...s,hold,committedAt,frameError:committedAt*s.fps-(s.releaseFrame-s.highlightFrame)};
 });
 const curves=[.4,WAZA.PYRAMID.hold,WAZA.HEXAGON.hold,WAZA.STRAIGHT.hold].map(hold=>{
  const points=[];for(let i=0;i<=240;i++)points.push(clearVisualState(i/240,hold));
  return{hold,points};
 });
 const shrink=clearTimingReference.plainShrink;
 const at=(frame)=>clearVisualState((frame-shrink.startFrame)/shrink.fps/.4,.4);
 return{rows,curves,plain:[at(599),at(600),at(602),at(605),at(606)]};
})()`,ctx);
for(const r of result.rows){assert(r.committedAt!==null);assert(Math.abs(r.frameError)<=fixture.frameTolerance,`Clear release phase differs: ${JSON.stringify(r)}`);}
for(const{points}of result.curves)for(let i=1;i<points.length;i++){assert(points[i].scale<=points[i-1].scale+1e-9,'Clear body enlarges instead of shrinking');assert(points[i].scale>=0);}
assert(result.plain[1].scale<result.plain[0].scale,'Plain clear waits before shrinking');
assert(result.plain[3].scale<.001&&result.plain[4].alpha===0,'Plain ball survives past source disappearance');
console.log('reference clear phase timing PASS',JSON.stringify({rows:result.rows,plain:result.plain}));
