const fs=require("fs");
const vm=require("vm");
const path=require("path");
const {ctx}=require("./v1303-plan-group-smoke.js");

const PUBLIC=path.join(__dirname,"../public");
vm.runInContext(fs.readFileSync(path.join(PUBLIC,"app-runtime-performance-v3.js"),"utf8"),ctx,{filename:"app-runtime-performance-v3.js"});
ctx.__perfV3Resolve=ctx.resolveVisualContacts;
ctx.__perfV3Safe=ctx.safeActiveFallOffset;
ctx.__perfV3Shadow=ctx.landingShadowVisualCells;
vm.runInContext(fs.readFileSync(path.join(PUBLIC,"app-runtime-performance-v4.js"),"utf8"),ctx,{filename:"app-runtime-performance-v4.js"});

const result=vm.runInContext(`(()=>{
function expect(v,m){if(!v)throw new Error(m);}
function rng(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
function ball(id,c){return{id,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0,rigid:false};}
function build(spec,seed){
  const g=createEngine(seed);g.state="RESOLVING";g.phase="SETTLE";g.ver=seed;
  g._visualMovingIds=new Set(spec.moving);
  for(const q of spec.cells){
    const b=ball(q.id,q.c);g.board[q.y][q.x]=b;noteBoardCell(g.board,q.y,b);
    g.vis.set(q.id,{x:q.vx,y:q.vy,vy:0,motionSpeed:0,sq:0});
  }
  return g;
}
function snapshot(g,ids){return ids.map(id=>{const v=g.vis.get(id);return[id,v.x,v.y];});}
function sameSnapshots(a,b,eps=2e-10){
  if(a.length!==b.length)return false;
  for(let i=0;i<a.length;i++)for(let j=0;j<a[i].length;j++){
    if(typeof a[i][j]==="number"&&typeof b[i][j]==="number"){
      if(Math.abs(a[i][j]-b[i][j])>eps)return false;
    }else if(a[i][j]!==b[i][j])return false;
  }
  return true;
}
function sameCells(a,b,eps=1e-11){
  if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return false;
  for(let i=0;i<a.length;i++){
    if(a[i].length!==b[i].length)return false;
    for(let j=0;j<a[i].length;j++){
      if(typeof a[i][j]==="number"&&typeof b[i][j]==="number"){
        if(Math.abs(a[i][j]-b[i][j])>eps)return false;
      }else if(a[i][j]!==b[i][j])return false;
    }
  }
  return true;
}

expect(window.__hexRuntimePerformanceVersion==="runtime-perf-v4","v4 version marker missing");
expect(window.__hexMovingContactWorkspaceCache===true,"contact workspace cache marker missing");
expect(window.__hexNumericContactBuckets===true,"numeric contact bucket marker missing");
expect(window.__hexContactPairArrayEliminated===true,"pair-array elimination marker missing");
expect(window.__hexContactSquaredDistancePrefilter===true,"squared-distance prefilter marker missing");
expect(window.__hexStaticColliderColumnIndex===true,"static collider column marker missing");

let contactCases=0,fastFrames=0,fallbacks=0;
for(let trial=0;trial<320;trial++){
  const r=rng(700000+trial),cells=[],moving=[];
  let id=1;
  /* Dense but valid lower-board fixtures. Jitter makes a mix of separated and
   * overlapping visual states while logical cells stay authoritative. */
  for(let y=7;y<=11;y++){
    for(let x=0;x<W2;x++){
      if(!valid(x,y)||r()>.58)continue;
      const vx=x+(r()-.5)*.52,vy=y+(r()-.5)*.34;
      cells.push({id,x,y,vx,vy,c:id%5});
      if(r()<.42)moving.push(id);
      id++;
    }
  }
  if(cells.length<2)continue;
  if(!moving.length)moving.push(cells[0].id);
  const spec={cells,moving},a=build(spec,710000+trial),b=build(spec,710000+trial);
  __perfV3Resolve(a);
  resolveVisualContacts(b);
  const ids=cells.map(q=>q.id),sa=snapshot(a,ids),sb=snapshot(b,ids);
  expect(sameSnapshots(sa,sb),"v4 contact result diverged from v3 at trial "+trial+"\n"+JSON.stringify({v3:sa,v4:sb}));
  contactCases++;
  fastFrames+=b._perfV4FastContactFrames||0;
  fallbacks+=b._perfV4CanonicalContactFallbacks||0;
}
expect(contactCases>=300,"insufficient contact parity coverage");

/* Prove the board-version workspace is reused across visual frames instead of
 * rescanning/reallocating logical contact items each frame. */
{
  const spec={cells:[
    {id:1,x:5,y:10,vx:5.0,vy:10,c:1},
    {id:2,x:7,y:10,vx:6.92,vy:10,c:2},
    {id:3,x:9,y:10,vx:9.0,vy:10,c:3}
  ],moving:[2]};
  const g=build(spec,799001);
  resolveVisualContacts(g);
  const ws=g._perfV4ContactWorkspace,items=ws?.items,buckets=ws?.buckets;
  resolveVisualContacts(g);
  expect(ws&&g._perfV4ContactWorkspace===ws,"contact workspace rebuilt without board version change");
  expect(g._perfV4ContactWorkspace.items===items,"contact item array rebuilt without board version change");
  expect(g._perfV4ContactWorkspace.buckets===buckets,"contact bucket workspace rebuilt without board version change");
  expect((g._perfV4ContactWorkspaceBuilds||0)===1,"unexpected workspace build count");
}

/* Static active-piece paths must match the established v2/v3 geometry exactly,
 * while using column-local collider queries. */
let staticCases=0;
for(let trial=0;trial<120;trial++){
  const r=rng(880000+trial),g=createEngine(880000+trial);g.state="PLAYING";g.ver=900000+trial;
  g._visualMovingIds=new Set();
  let id=1;
  for(let y=7;y<=11;y++)for(let x=0;x<W2;x++){
    if(!valid(x,y)||r()>.38)continue;
    const b=ball(id,id%5);g.board[y][x]=b;noteBoardCell(g.board,y,b);g.vis.set(id,{x,y,vy:0,motionSpeed:0,sq:0});id++;
  }
  g.piece={x:7,y:-2,rot:trial%6,colors:[0,1,2]};
  g.pieceVX=4.3+r()*5.4;g.freeX=g.pieceVX;
  const cells=pieceCells(g.piece),dx=g.pieceVX-g.piece.x,dOff=dispOff(g.piece.rot),desired=.15+r()*2.4;
  const a=__perfV3Safe(g,cells,dx,dOff,desired),b=safeActiveFallOffset(g,cells,dx,dOff,desired);
  expect(Math.abs(a-b)<1e-12,"column-index active clamp changed geometry at trial "+trial+": "+a+" vs "+b);
  const sa=__perfV3Shadow(g),sb=landingShadowVisualCells(g);
  expect(sameCells(sa,sb),"column-index landing shadow changed geometry at trial "+trial);
  staticCases++;
}
expect(staticCases===120,"static parity coverage incomplete");

return{
  contactCases,staticCases,fastFrames,fallbacks,
  workspaceCache:true,numericBuckets:true,pairArrays:false,columnIndex:true
};
})()`,ctx,{timeout:120000});

console.log("runtime performance v4 parity PASS",JSON.stringify(result));
