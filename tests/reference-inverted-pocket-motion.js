const vm=require('vm'),assert=require('assert/strict');
const{ctx}=require('./v1303-plan-group-smoke.js');
const source=require('./fixtures/reference-inverted-pocket-20260814.json');
ctx.pocketCells=source.board;ctx.pocketFps=Number(process.env.TEST_FPS)||120;
const pocketFps=ctx.pocketFps;
const traces=vm.runInContext(`(()=>{
 function replay(mirror){
  const g=createEngine(198);g.state='PLAYING';
  for(const[x,y,c]of pocketCells){const xx=mirror?18-x:x,b=mkBall(g,c);g.board[y][xx]=b;noteBoardCell(g.board,y,b);setVis(g,b,xx,y,0);}
  const first=g.nextId;g.piece={x:12,y:1,rot:0,colors:mirror?[1,0,1]:[0,1,1]};setFreeX(g,mirror?3:13);g.pieceVX=g.freeX;hardDrop(g);
  const roll=mirror?first:first+1,fixed=mirror?first+1:first,lower=first+2,trace=[];
  const initial=[fixed,lower].map(id=>{const v=g.vis.get(id);return{id,x:v.x,y:v.y};});
  for(let i=0;i<=Math.ceil(pocketFps*.4);i++){
   if(i)stepEngine(g,1/pocketFps);
   const v=g.vis.get(roll),b=g.board.flat().find(b=>b?.id===roll);
   trace.push({t:i/pocketFps,x:mirror?18-v.x:v.x,y:v.y,pending:b?.fallPath?.length||0});
  }
  return{trace,fixed:initial.map(q=>{const v=g.vis.get(q.id);return{dx:v.x-q.x,dy:v.y-q.y};})};
 }
 const guard=createEngine(198),support=mkBall(guard,2);guard.board[11][12]=support;setVis(guard,support,12,11,0);
 const cells=[[14,9,0],[16,9,1],[15,10,1]];
 const staticPocket=!!floorContactSplit(guard,cells,-1,.998367006429925,0);
 const airbornePocket=!!floorContactSplit(guard,cells,-1,.9,0);
 guard.vis.get(support.id).y=10.9;
 const movingPocket=!!floorContactSplit(guard,cells,-1,.998367006429925,0);
 return{normal:replay(false),mirror:replay(true),guards:{staticPocket,movingPocket,airbornePocket}};
})()`,ctx);
let symmetry=0;
for(let i=0;i<traces.normal.trace.length;i++)symmetry=Math.max(symmetry,Math.hypot(traces.normal.trace[i].x-traces.mirror.trace[i].x,traces.normal.trace[i].y-traces.mirror.trace[i].y));
assert(symmetry<1e-7,'One-sided pocket slide must mirror');
assert.equal(traces.guards.staticPocket,true);
assert.equal(traces.guards.movingPocket,false,'Moving support is not a fixed pocket');
assert.equal(traces.guards.airbornePocket,false,'An airborne piece is not floor contact');
for(const trace of [traces.normal,traces.mirror]){
 assert.equal(trace.trace.at(-1).pending,0,'Pocket slide frozen');
 for(const fixed of trace.fixed){assert(Math.abs(fixed.dx)<.01);assert(Math.abs(fixed.dy)<.01);}
}
const errors=source.samples.map(([frame,x,y])=>{
 const f=(frame-source.contactFrame)/source.fps*pocketFps,a=traces.normal.trace[Math.floor(f)],b=traces.normal.trace[Math.ceil(f)],q=f-Math.floor(f);
 const ax=291.5+(a.x+(b.x-a.x)*q)*32.2,ay=875.5+((a.y+(b.y-a.y)*q)-11)*63.4*Math.sqrt(3)/2;
 return{frame,error:Math.hypot(ax-x,ay-y)};
});
const rms=Math.sqrt(errors.reduce((n,q)=>n+q.error*q.error,0)/errors.length),max=Math.max(...errors.map(q=>q.error));
assert(rms<=3.5&&max<=6,'Third measured source trajectory is unmatched');
console.log('PASS measured inverted one-sided pocket slide',JSON.stringify({fps:pocketFps,rms,max,symmetry,errors}));
