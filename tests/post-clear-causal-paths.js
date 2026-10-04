const assert=require('assert'),vm=require('vm');
const {ctx}=require('./v1303-plan-group-smoke.js');
ctx.cells=require('./fixtures/reference-clear-timing-20260814.json').ordinaryBoard.cells;
const result=vm.runInContext(`(()=>{
 const g=createEngine(598);g.state='RESOLVING';g.phase='CLEAR';g.holdT=.4;
 for(const[x,y,c]of cells){const b=mkBall(g,c);g.board[y][x]=b;setVis(g,b,x,y,0);}
 const group=findGroups(g.board)[0];
 g.clearing={cells:group.cells.map(([x,y])=>[x,y,g.board[y][x].c,g.board[y][x].id]),ids:new Set(group.cells.map(([x,y])=>g.board[y][x].id)),waza:[],committed:false,ghosts:[]};
 for(let i=0;i<44;i++)stepEngine(g,1/120);
 const paths=[];for(const row of g.board)for(const b of row)if(b?.fallPath?.length)paths.push(JSON.parse(JSON.stringify(b.fallPath)));
 const gravity=paths.flat().filter(s=>s.pileGravityFall&&s.pileFlowEntry);
 const probe={from:[11,10],to:[10,11],pivot:[12,11]};
 const replaced=enforcePileGravitySegment(probe,'clear_support_loss');
 return{paths,gravity,replaced,pivot:probe.pivot};
})()`,ctx);
assert(result.paths.length>0);
for(const path of result.paths){
 for(let i=1;i<path.length;i++){
  assert.deepStrictEqual(path[i].from,path[i-1].to,'Queued segment must start at previous destination');
  assert(path[i].pileFlowStart>=path[i-1].pileFlowEnd-1e-8,'No overlapping per-ball clocks');
 }
 for(const s of path)assert(!s.pileFlowAuthorityV2,'Ordinary clear must not be deadline-compressed');
}
assert(result.gravity.length>0);
for(const s of result.gravity)assert.strictEqual(s.pileGravityV0,0,'Stationary pile starts at rest');
assert.strictEqual(result.replaced,false);
assert.deepStrictEqual(Array.from(result.pivot),[12,11]);
console.log('PASS ordinary-clear causal clocks, contiguous paths, rest velocity and real support geometry');
