// Ordinary blue clear on the player board of the 2026-10-13 Nintendo capture
// (tests/fixtures/reference-clear-20261013.json).  After the six blue balls
// clear, purple [8,9] lands on red [8,11] and goes right because green [6,9]
// can only roll right into [7,10]; yellow [7,8] rides green into [8,9].
//
// Gate: every released ball ends in the captured cell, and the 144 measured
// centres stay within the reference motion limits (RMS 8 / max 17 source px)
// at the fixture's anchor frame.
const vm=require('vm');
const{ctx}=require('./v1303-plan-group-smoke.js');
const fixture=require('./fixtures/reference-clear-20261013.json');

function replay(){
 ctx.__fixture=fixture;
 return vm.runInContext(`(()=>{
  const g=createEngine(1013);g.state='RESOLVING';g.phase='CLEAR';g.stateT=0;g.holdT=.4;
  const ids={};
  for(const[x,y,c]of __fixture.board){const b=mkBall(g,c);g.board[y][x]=b;setVis(g,b,x,y,0);
   for(const[k,cell]of Object.entries(__fixture.roles))if(cell[0]===x&&cell[1]===y)ids[k]=b.id;}
  const group=findGroups(g.board)[0];
  g.clearing={cells:group.cells.map(([x,y])=>[x,y,g.board[y][x].c,g.board[y][x].id]),ids:new Set(group.cells.map(([x,y])=>g.board[y][x].id)),waza:[],committed:false,ghosts:[]};
  const frames=[];
  for(let k=1;k<=50;k++){for(let i=0;i<4;i++)stepEngine(g,1/120);const row={};for(const[n,id]of Object.entries(ids)){const v=g.vis.get(id);row[n]=[v.x,v.y];}frames.push(row);}
  const finals={};
  for(const[n,id]of Object.entries(ids))for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){const c=valid(x,y)?g.board[y][x]:null;if(c?.id===id)finals[n]=[x,y];}
  return{frames,finals,clear:group.cells.map(([x,y])=>[x,y])};
 })()`,ctx);
}

function compare(result){
 const PX=32.2,PY=64.4*Math.sqrt(3)/2,toPx=(c,o)=>[291.5+PX*c[0]+o[0],875.5+(c[1]-11)*PY+o[1]];
 // Per-ball centroid bias, calibrated on the captured final rest (frames 80-90).
 const offset={};
 for(const role of Object.keys(fixture.roles)){
  const rest=fixture.samples.filter(([f,r])=>r===role&&f>=80&&f<=90),cell=fixture.finalCells[role];
  const mx=rest.reduce((n,s)=>n+s[2],0)/rest.length,my=rest.reduce((n,s)=>n+s[3],0)/rest.length;
  offset[role]=[mx-(291.5+PX*cell[0]),my-(875.5+(cell[1]-11)*PY)];
 }
 const errors=fixture.samples.map(([frame,role,x,y])=>{
  const sim=result.frames[frame-fixture.anchorFrame-1][role],p=toPx(sim,offset[role]);
  return{frame,role,error:Math.hypot(p[0]-x,p[1]-y)};
 });
 const rms=Math.sqrt(errors.reduce((n,e)=>n+e.error*e.error,0)/errors.length);
 const worst=errors.reduce((a,b)=>b.error>a.error?b:a);
 return{rms,max:worst.error,worst,count:errors.length};
}

module.exports={replay,compare,fixture};
if(require.main!==module)return;

const result=replay();
const clearKey=c=>c.map(p=>p.join(',')).sort().join(' ');
if(clearKey(result.clear)!==clearKey(fixture.clearCells))throw new Error('reconstructed board clears a different group: '+JSON.stringify(result.clear));
for(const[role,cell]of Object.entries(fixture.finalCells)){
 if(JSON.stringify(result.finals[role])!==JSON.stringify(cell))throw new Error(`${role} ended at ${JSON.stringify(result.finals[role])}, Nintendo capture ends at ${JSON.stringify(cell)}`);
}
const c=compare(result);
console.log('2026-10-13 ordinary clear collapse',JSON.stringify({finals:result.finals,rms:+c.rms.toFixed(3),max:+c.max.toFixed(3),worst:c.worst,samples:c.count}));
if(c.rms>8||c.max>17)throw new Error(`source comparison RMS ${c.rms.toFixed(2)} / max ${c.max.toFixed(2)} px exceeds RMS 8 / max 17`);
