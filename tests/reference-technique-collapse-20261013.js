// Technique clears on the player board of three 2026-10-13 Nintendo captures
// (tests/fixtures/reference-technique-collapse-20261013.json).  Each board is
// replayed through the normal CHECK -> CLEAR -> SETTLE flow and compared, cell
// by cell, with the captured board once the first collapse has settled (before
// any chain clear).  PYRAMID must match exactly; the HEXAGON and STRAIGHT gaps
// are ratchets that may only shrink.
const vm=require('vm');
const{ctx}=require('./v1303-plan-group-smoke.js');
const fixture=require('./fixtures/reference-technique-collapse-20261013.json');

const results=fixture.scenes.map(scene=>{
 ctx.__scene=scene;
 const r=vm.runInContext(`(()=>{
  const g=createEngine(1013);g.state='RESOLVING';g.phase='CHECK';g.stateT=0;g.chain=0;g.piece=null;
  for(const[x,y,c]of __scene.pre){const b=mkBall(g,c);g.board[y][x]=b;setVis(g,b,x,y,0);}
  let first=null,waza=null,snap=null;
  const snapshot=()=>{const out=[];for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b)out.push([x,y,b.c]);}return out;};
  for(let i=0;i<120*12&&!snap;i++){
   stepEngine(g,1/120);
   if(g.clearing&&!first){first=g.clearing;waza=[...g.clearing.waza];}
   else if(g.clearing&&g.clearing!==first)snap=snapshot();
   if(g.piece)snap=snapshot();
  }
  return{waza,snap:snap||snapshot()};
 })()`,ctx);
 const key=c=>c[0]+','+c[1];
 const sim=new Map(r.snap.filter(c=>c[1]>=4).map(c=>[key(c),c[2]])),tgt=new Map(scene.target.map(c=>[key(c),c[2]]));
 const diffs=[...new Set([...sim.keys(),...tgt.keys()])].filter(k=>sim.get(k)!==tgt.get(k)).sort();
 return{technique:scene.technique,waza:r.waza,diffs,allowed:scene.allowedDifferences};
});
console.log('2026-10-13 technique collapse',JSON.stringify(results.map(r=>({technique:r.technique,waza:r.waza,differences:r.diffs.length,allowed:r.allowed,cells:r.diffs}))));
for(const r of results){
 if(JSON.stringify(r.waza)!==JSON.stringify([r.technique]))throw new Error(`${r.technique} capture classified as ${JSON.stringify(r.waza)}`);
 if(r.diffs.length>r.allowed)throw new Error(`${r.technique} first collapse differs from the capture in ${r.diffs.length} cells (allowed ${r.allowed}): ${r.diffs.join(' ')}`);
}
