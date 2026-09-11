const assert=require('node:assert/strict');
const vm=require('node:vm');
const {ctx}=require('./v1303-plan-group-smoke.js');
ctx.testFps=Number(process.env.TEST_FPS)||120;
const result=vm.runInContext(`(()=>{
 const dist=(a,b)=>Math.hypot((a.x-b.x)*.5,(a.y-b.y)*HEX_ROW_H);
 function put(g,x,y,c){const b=mkBall(g,c);g.board[y][x]=b;noteBoardCell(g.board,y,b);setVis(g,b,x,y,0);return b;}
 function replay(kind,mirror=false,normal=false){
  const g=createEngine(140826);g.state='PLAYING';
  delete window.__sixBallLastNintendoRigidityDecision;
  const cells=kind==='up'?[[6,11,0],[8,11,4],[10,11,1],[12,11,2],[9,10,0],[11,10,0]]:[[6,11,2],[8,11,4],[7,10,4]];
  for(const [x,y,c]of cells)put(g,mirror?18-x:x,y,c);
  const first=g.nextId;
  g.piece={x:6,y:1,rot:kind==='up'?1:0,colors:[4,3,2]};
  const free=kind==='up'?5.3:.5;
  setFreeX(g,mirror?16-free:free);g.pieceVX=g.freeX;
  if(normal){g.piece=dropPiece(g.board,g.piece);g.dropT=g.dropInterval*.5;lock(g,3);}else hardDrop(g);
  const ids=[first,first+1,first+2],snap=()=>ids.map(id=>({...g.vis.get(id)}));
  let previous=snap(),upward=0,minDistance=Infinity,maxStep=0,settledAt=null,pocketPair=false;
  const initial=previous.map(p=>({x:p.x,y:p.y}));
  for(let i=1;i<=testFps;i++){
   stepEngine(g,1/testFps);const now=snap();
   const boardPositions=[];
   for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
    const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);
    if(v)boardPositions.push(v);
   }
   for(let a=0;a<boardPositions.length;a++)for(let b=a+1;b<boardPositions.length;b++)minDistance=Math.min(minDistance,dist(boardPositions[a],boardPositions[b]));
   for(let j=0;j<ids.length;j++){
    if(now[j].y<previous[j].y-1e-7)upward++;
    maxStep=Math.max(maxStep,dist(now[j],previous[j]));
    for(let k=j+1;k<ids.length;k++)minDistance=Math.min(minDistance,dist(now[j],now[k]));
   }
   if(window.__sixBallLastNintendoRigidityDecision?.reason==='lower-pocket-pinned-pair')pocketPair=true;
   if(settledAt===null&&pendingFallPathCount(g)===0&&nearlySettled(g,1e-5))settledAt=i/testFps;
   previous=now;
  }
  return {kind,mirror,normal,initial,final:snap().map(p=>({x:p.x,y:p.y})),upward,minDistance,maxStep,settledAt,pocketPair};
 }
 function clock(){
  const g=createEngine(14999);g.state='RESOLVING';g.phase='SETTLE';
  const b=put(g,8,11,0);setVis(g,b,8,7,0);
  hexPhysAppendSegment(b,{x:8,y:7,tx:8,ty:11,kind:'DROP',groupSize:0},98765);
  let maxError=0;
  for(let i=1;i<=Math.floor(testFps*.4);i++){
   updateVisuals(g,1/testFps);
   const expected=7+.5*GRAV*(i/testFps)**2/HEX_ROW_H;
   maxError=Math.max(maxError,Math.abs(g.vis.get(b.id).y-expected));
  }
  return maxError;
 }
 return {fps:testFps,replays:[replay('up'),replay('up',true),replay('down'),replay('down',true),replay('down',false,true)],clockError:clock()};
})()`,ctx);
for(const r of result.replays){
 assert.equal(r.upward,0,`upward motion: ${JSON.stringify(r)}`);
 assert.ok(r.minDistance>=.9995-1e-6,`overlapping members: ${JSON.stringify(r)}`);
 assert.ok(r.settledAt!==null&&r.settledAt<.6,`unfinished release: ${JSON.stringify(r)}`);
 const points=r.final.map(p=>[r.mirror?18-p.x:p.x,p.y]);
 if(r.mirror){const a=r.kind==='up'?1:0,b=r.kind==='up'?2:1;[points[a],points[b]]=[points[b],points[a]];}
 const expected=r.kind==='up'?[[5,10],[7,10],[4,11]]:[[0,11],[4,11],[2,11]];
 for(let i=0;i<3;i++)assert.ok(Math.hypot(points[i][0]-expected[i][0],points[i][1]-expected[i][1])<1e-5,`wrong endpoint: ${JSON.stringify(r)}`);
}
assert.ok(result.clockError<1e-7,`free-fall clock changed mid-segment: ${result.clockError}`);
console.log('reference video motion PASS',JSON.stringify(result));
