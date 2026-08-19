const fs=require("fs");
const vm=require("vm");

const core=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js",
  "app-07.js","app-08.js","app-09.js","app-10.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");
const perf=fs.readFileSync(`${__dirname}/../public/app-runtime-performance.js`,"utf8");

const before=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function put(g,x,y,c=0){
  expect(valid(x,y),"invalid performance fixture "+x+","+y);
  const b={id:g.nextId++,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0,rigid:false};
  g.board[y][x]=b;noteBoardCell(g.board,y,b);g.vis.set(b.id,{x,y,vy:0,motionSpeed:0,sq:0});g.ver++;
  return b;
}
function sameCells(a,b,eps=1e-12){
  if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return false;
  for(let i=0;i<a.length;i++)for(let j=0;j<a[i].length;j++){
    const x=a[i][j],y=b[i][j];
    if(typeof x==="number"&&typeof y==="number"){if(Math.abs(x-y)>eps)return false;}
    else if(x!==y)return false;
  }
  return true;
}
function traceCtx(alpha=1){
  return{
    globalAlpha:alpha,calls:[],
    save(){this.calls.push(["save"]);},restore(){this.calls.push(["restore"]);},
    drawImage(){this.calls.push(["drawImage",...Array.from(arguments).slice(1)]);},
    createRadialGradient(){return{addColorStop(){}};},beginPath(){},arc(){},ellipse(){},fill(){},stroke(){},
    set fillStyle(v){},set strokeStyle(v){},set lineWidth(v){}
  };
}

const g=createEngine(99001);g.state="PLAYING";
const balls=[];
balls.push(put(g,6,11,0));balls.push(put(g,8,11,1));balls.push(put(g,10,11,2));balls.push(put(g,7,10,3));balls.push(put(g,9,10,4));
g.piece={x:7,y:-2,rot:0,colors:[0,1,2]};g.pieceVX=7.37;g.freeX=7.37;
g._visualMovingIds=new Set();

const canonicalSafeActiveFallOffset=safeActiveFallOffset;
const canonicalLandingShadowVisualCells=landingShadowVisualCells;
const canonicalResolveVisualContacts=resolveVisualContacts;
const canonicalRigidShadowPixelPlacement=rigidShadowPixelPlacement;
const canonicalDrawBall=drawBall;
const canonicalHexGarbageBoardBallById=hexGarbageBoardBallById;
const shadowBefore=canonicalLandingShadowVisualCells(g);
const activeCells=pieceCells(g.piece);
const safeBefore=canonicalSafeActiveFallOffset(g,activeCells,.37,dispOff(g.piece.rot),1.7);
const pos=(x,y)=>[40+x*19,30+y*19*HEX_ROW_H];
const rigidBefore=canonicalRigidShadowPixelPlacement(g,shadowBefore,pos,38,20,20,500,500);
let delegatedContacts=0;
resolveVisualContacts=function(q){delegatedContacts++;return canonicalResolveVisualContacts(q);};
`;

const after=String.raw`
expect(window.__hexRuntimePerformanceVersion==="runtime-perf-v2","runtime performance v2 adapter was not installed");
expect(window.__hexStaticBoardContactPassSkipped===true&&window.__hexActiveCollisionColliderCache===true&&window.__hexLandingShadowColliderCache===true,"runtime performance markers missing");
expect(window.__hexRigidShadowVisualColliderCache===true,"rigid shadow cache marker missing");
expect(window.__hexDefaultBallDrawFastPath===true,"default ball draw fast path marker missing");
expect(window.__hexGarbageBoardIdLookupCache===true,"garbage id lookup cache marker missing");
expect(window.__hexPerformanceBehaviorParityRequired===true,"behavior parity marker missing");

const shadowAfter=landingShadowVisualCells(g);
const safeAfter=safeActiveFallOffset(g,activeCells,.37,dispOff(g.piece.rot),1.7);
expect(sameCells(shadowBefore,shadowAfter),"cached landing shadow changed static-board geometry");
expect(Math.abs(safeBefore-safeAfter)<1e-12,"cached active fall clamp changed static-board contact height");

const rigidAfter=rigidShadowPixelPlacement(g,shadowAfter,pos,38,20,20,500,500);
expect(sameCells(rigidBefore,rigidAfter),"cached rigid shadow placement changed pixel geometry");
const visualCache1=g._perfStaticVisualColliders?.items;
rigidShadowPixelPlacement(g,shadowAfter,pos,38,20,20,500,500);
expect(visualCache1&&visualCache1===g._perfStaticVisualColliders?.items,"rigid shadow visual collider cache was rebuilt without motion");

// Repeated calls on an unchanged active board must reuse the same compact
// collider list rather than rebuilding the whole lattice scan.
const cached1=g._perfStaticLogicalColliders?.items;
landingShadowVisualCells(g);safeActiveFallOffset(g,activeCells,.37,dispOff(g.piece.rot),1.7);
const cached2=g._perfStaticLogicalColliders?.items;
expect(cached1&&cached1===cached2,"static collider cache was rebuilt without a board change");

// Static PLAYING boards need no O(n^2) board-ball contact pass.
resolveVisualContacts(g);
expect(delegatedContacts===0,"static board delegated to the full visual contact solver");
expect((g._perfStaticContactSkips||0)===1,"static contact skip was not recorded");

// Garbage obstacle lookup must return exactly the same ball object as the
// canonical lattice scan, while repeated queries reuse one id map per version.
for(const b of balls)expect(hexGarbageBoardBallById(g,b.id)===canonicalHexGarbageBoardBallById(g,b.id),"garbage id cache returned a different ball");
expect(hexGarbageBoardBallById(g,999999)===canonicalHexGarbageBoardBallById(g,999999),"garbage id cache changed missing-id result");
const idMap1=g._perfLogicalBallById?.map;
for(const b of balls)hexGarbageBoardBallById(g,b.id);
expect(idMap1&&idMap1===g._perfLogicalBallById?.map,"garbage id map was rebuilt without a board change");

// Image-ready default balls must issue the exact same drawImage rectangle but
// without save/restore stack churn. Non-default opacity must still delegate.
{
  const a=traceCtx(1),b=traceCtx(1);
  canonicalDrawBall(a,123.5,87.25,42,2,{});
  drawBall(b,123.5,87.25,42,2,{});
  const ad=a.calls.filter(q=>q[0]==="drawImage"),bd=b.calls.filter(q=>q[0]==="drawImage");
  expect(JSON.stringify(ad)===JSON.stringify(bd),"default ball fast path changed drawImage geometry");
  expect(a.calls.some(q=>q[0]==="save")&&a.calls.some(q=>q[0]==="restore"),"canonical draw fixture did not exercise state stack");
  expect(!b.calls.some(q=>q[0]==="save")&&!b.calls.some(q=>q[0]==="restore"),"default ball fast path kept redundant state-stack work");
  const c=traceCtx(1);drawBall(c,123.5,87.25,42,2,{alpha:.5});
  expect(c.calls.some(q=>q[0]==="save")&&c.calls.some(q=>q[0]==="restore"),"non-default ball failed to delegate to canonical renderer");
}

// A board version change must invalidate all logical caches while retaining
// exact canonical geometry and lookup identity.
const added=put(g,12,11,2);
const canonicalChanged=canonicalLandingShadowVisualCells(g);
const changed=landingShadowVisualCells(g);
expect(sameCells(canonicalChanged,changed),"cache invalidation changed landing shadow geometry");
expect(g._perfStaticLogicalColliders?.items!==cached1,"board change did not invalidate the logical collider cache");
expect(hexGarbageBoardBallById(g,added.id)===added,"board-id cache did not observe a newly added ball");
expect(g._perfLogicalBallById?.map!==idMap1,"board version change did not invalidate id cache");

// The moment any board ball is moving, every motion-sensitive optimized wrapper
// must fall back to the canonical motion-aware routines.
const moving=g.board[10][7];g._visualMovingIds=new Set([moving.id]);
const mv=g.vis.get(moving.id);mv.x+=.08;
const fallbackShadowCanonical=canonicalLandingShadowVisualCells(g);
const fallbackShadow=landingShadowVisualCells(g);
const fallbackSafeCanonical=canonicalSafeActiveFallOffset(g,activeCells,.37,dispOff(g.piece.rot),1.7);
const fallbackSafe=safeActiveFallOffset(g,activeCells,.37,dispOff(g.piece.rot),1.7);
const fallbackRigidCanonical=canonicalRigidShadowPixelPlacement(g,fallbackShadowCanonical,pos,38,20,20,500,500);
const fallbackRigid=rigidShadowPixelPlacement(g,fallbackShadow,pos,38,20,20,500,500);
expect(sameCells(fallbackShadowCanonical,fallbackShadow),"moving-board landing shadow did not use canonical path");
expect(Math.abs(fallbackSafeCanonical-fallbackSafe)<1e-12,"moving-board active clamp did not use canonical path");
expect(sameCells(fallbackRigidCanonical,fallbackRigid),"moving-board rigid shadow did not use canonical path");
resolveVisualContacts(g);
expect(delegatedContacts===1,"moving board failed to delegate to full visual contact solver");

console.log("runtime performance v2 parity guards PASS",JSON.stringify({
  staticContactSkips:g._perfStaticContactSkips||0,
  colliders:g._perfStaticLogicalColliders?.items?.length||0,
  idCache:g._perfLogicalBallById?.map?.size||0,
  drawFastPath:true,
  rigidShadowCache:true
}));
`;

vm.runInNewContext(core+before+perf+after,{
  React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f},createElement(){}},
  ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
  Image:function(){this.complete=true;this.naturalWidth=64;this.naturalHeight=64;this.decoding="";this.src="";},Math,Map,Set,WeakMap,Int8Array,Array,Number,Object,String,Boolean,JSON,Date,
  setTimeout(){return 0},clearTimeout(){},performance:{now(){return 0}},localStorage:{getItem(){return null},setItem(){}},
  document:{getElementById(){return null},createElement(){return{width:0,height:0,getContext(){return null;}}}},ResizeObserver:function(){this.observe=()=>{};this.disconnect=()=>{};}
},{timeout:120000});
