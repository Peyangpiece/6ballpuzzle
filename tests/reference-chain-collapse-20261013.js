// Chain clears that follow the HEXAGON and PYRAMID technique clears of the
// 2026-10-13 Nintendo captures (tests/fixtures/reference-chain-collapse-20261013.json).
// Each scene starts from the captured board once the technique collapse has
// settled and runs CHECK -> CLEAR -> SETTLE until play resumes.
//
// Gate: the chain clears the captured colour counts, its release lands within
// the fixture's frame tolerance of the capture (shrink -> first lowered ball),
// and the settled board differs from the capture in no more than the allowed
// cells (PYRAMID keeps a two-ball arch over [4,9] that the runtime fills).
const vm=require('vm');
const{ctx}=require('./v1303-plan-group-smoke.js');
const fixture=require('./fixtures/reference-chain-collapse-20261013.json');

const results=fixture.scenes.map(scene=>{
 ctx.__scene=scene;
 const r=vm.runInContext(`(()=>{
  const g=createEngine(1013);g.state='RESOLVING';g.phase='CHECK';g.stateT=0;g.chain=0;g.piece=null;
  for(const[x,y,c]of __scene.start){const b=mkBall(g,c);g.board[y][x]=b;setVis(g,b,x,y,0);}
  let clearing=null,clearAt=null,releaseAt=null,restAt=null,t=0,last=null;
  const pos=()=>{const o=new Map();for(const[id,v]of g.vis)o.set(id,v.x+','+v.y);return o;};
  for(let i=0;i<120*6;i++){
   stepEngine(g,1/120);t+=1/120;
   if(g.clearing&&!clearing){clearing=g.clearing.cells.map(c=>c[2]);clearAt=t;}
   if(g.clearing?.committed&&releaseAt===null)releaseAt=t;
   const now=pos();
   if(releaseAt!==null&&last){let moved=false;for(const[id,p]of now)if(last.get(id)!==undefined&&last.get(id)!==p)moved=true;if(moved)restAt=null;else if(restAt===null)restAt=t;}
   last=now;
   if(g.state==='PLAYING'||g.piece)break;
  }
  const cells=[];for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b)cells.push([x,y,b.c]);}
  return{clearing,clearAt,releaseAt,restAt,cells};
 })()`,ctx);
 const key=c=>c[0]+','+c[1];
 const sim=new Map(r.cells.filter(c=>c[1]>=5).map(c=>[key(c),c[2]])),tgt=new Map(scene.target.map(c=>[key(c),c[2]]));
 const diffs=[...new Set([...sim.keys(),...tgt.keys()])].filter(k=>sim.get(k)!==tgt.get(k)).sort();
 const count=cs=>{const n=[0,0,0,0,0];for(const c of cs)n[c[2]]++;return n;};
 const expected=count(scene.start).map((n,c)=>n-count(scene.target)[c]);
 const cleared=[0,0,0,0,0];for(const c of r.clearing||[])cleared[c]++;
 const fps=30;
 return{technique:scene.technique,cleared,expected,diffs,allowed:scene.allowedDifferences,
  releaseFrames:+((r.releaseAt-r.clearAt)*fps).toFixed(1),captureReleaseFrames:scene.releaseFrame-scene.shrinkFrame,
  collapseFrames:+((r.restAt-r.releaseAt)*fps).toFixed(1),captureCollapseFrames:scene.restFrame-scene.releaseFrame};
});
console.log('2026-10-13 chain collapse',JSON.stringify(results));
for(const r of results){
 if(JSON.stringify(r.cleared)!==JSON.stringify(r.expected))throw new Error(`${r.technique} chain clears ${JSON.stringify(r.cleared)} per colour, capture ${JSON.stringify(r.expected)}`);
 if(Math.abs(r.releaseFrames-r.captureReleaseFrames)>fixture.frameTolerance)throw new Error(`${r.technique} chain release after ${r.releaseFrames} frames, capture ${r.captureReleaseFrames}`);
 if(r.diffs.length>r.allowed)throw new Error(`${r.technique} chain collapse differs from the capture in ${r.diffs.length} cells (allowed ${r.allowed}): ${r.diffs.join(' ')}`);
}
