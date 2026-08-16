const fs=require("fs");
const vm=require("vm");

const read=name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8");
const runtimeNames=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js",
  "app-06.js","app-07.js","app-08.js","app-09.js","app-10.js","app-14.js"
];
const runtime=runtimeNames.map(read).join("\n");

const suite=String.raw`
const results=[],counts={active:0,rigidity:0,pile:0,garbage:0,formation:0,network:0};
function expect(v,m){if(!v)throw new Error(m);}
function pass(category,index,fn){fn();results.push({category,index});counts[category]++;}
const close=(a,b,e=1e-7)=>Math.abs(a-b)<=e;
const dist=(ax,ay,bx,by)=>Math.hypot((ax-bx)*.5,(ay-by)*HEX_ROW_H);
function ball(id,c=0){return{id,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0,rigid:false};}
function active(seed=1){const g=createEngine(seed);spawn(g);return g;}
function groupBall(id,group,role,orientation="down"){return{id,c:role,motionGroupId:group,motionGroupRole:role,motionGroupOrientation:orientation,motionGroupSize:3,rigid:true,momentumX:0};}
function put(g,x,y,b){g.board[y][x]=b;setVis(g,b,x,y,0);return b;}
function flatBase(g,height,seed){let id=800000+seed*100;for(let y=ROWS-height;y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y))put(g,x,y,ball(id++,(Math.floor(x/2)+y+seed)%COLORS.length));}
function stepGarbage(seed,type,height,dt,total){const g=createEngine(seed);flatBase(g,height,seed);g.garbShapes=[type];prepareGarbageBatch(g);let last=GARBAGE_START_Y,mono=true;while(g.garbageClock<total-1e-10){updateGarbagePacks(g,Math.min(dt,total-g.garbageClock));const p=g.activeGarbagePacks[0];if(p&&p.y+1e-9<last)mono=false;if(p)last=p.y;}return{g,p:g.activeGarbagePacks[0],mono};}
function finishGarbage(seed,type,height){const g=createEngine(seed);flatBase(g,height,seed);g.garbShapes=[type];prepareGarbageBatch(g);let t=0;while(t<2.5){updateGarbagePacks(g,PHYSICS_FRAME);t+=PHYSICS_FRAME;if(g.activeGarbagePacks[0]?.landed)break;}const added=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b?.isGarbage)added.push({b,x,y});}return{g,p:g.activeGarbagePacks[0],t,added};}

// Reference sources: six 1920x1080 captures at 30fps. Runtime measurements
// are normalized to the 1280x720 canvas before comparisons below.
expect(VW===1280&&VH===720,"reference viewport changed");
expect(close(REFERENCE_BALL_PX,63.4,1e-9)&&REFERENCE_INSTANT_DROP_MAX_FRAMES===1&&HARD_DROP_BEAM_FRAMES===5&&HARD_DROP_SPARK_FRAMES===9,"capture-derived size or instant-drop timing changed");

// 001-180: active triplet, drag, guide, rotation and hard drop.
for(let i=0;i<180;i++)pass("active",i,()=>{
 const g=active(10000+i),mode=i%5,rot=i%6;g.piece={...g.piece,y:-2+2*(i%5),rot};g.pieceVX=g.piece.x;
 if(mode===0){
  setFreeX(g,i%2?-100:100);updateVisuals(g,PHYSICS_FRAME);
  const xs=pieceCells(g.piece).map(([x])=>x+g.pieceVX-g.piece.x);
  expect(i%2?close(Math.min(...xs),0):close(Math.max(...xs),W2-1),"active "+i+": wall range differs from reference");
 }else if(mode===1){
  const [lo,hi]=legalXRange(g),target=lo+(hi-lo)*((i%17)+.25)/17;setFreeX(g,target);updateVisuals(g,PHYSICS_FRAME);
  expect(close(g.freeX,target)&&close(g.pieceVX,target),"active "+i+": one-finger drag is not one-to-one");
 }else if(mode===2){
  setFreeX(g,SPAWN_X+.375);updateVisuals(g,PHYSICS_FRAME);const logical=landingShadowCells(g),visual=landingShadowVisualCells(g);
  expect(logical&&visual&&visual.every((v,k)=>close(v[0]-logical[k][0],g.pieceVX-g.piece.x)),"active "+i+": landing guide lost horizontal alignment");
  expect(close(Math.max(...visual.map(([,y])=>cellCenterYNorm(y))),FLOOR_CENTER_N),"active "+i+": first-level guide missed the floor");
 }else if(mode===3){
  g.dropT=g.dropInterval*((i%29)+.5)/30;const q=activeDropFraction(g);expect(q>=0&&q<2,"active "+i+": natural fall left its capture step");
  const before=q;g.dropT=Math.min(g.dropInterval*.999,g.dropT+PHYSICS_FRAME);expect(activeDropFraction(g)+1e-9>=before,"active "+i+": natural fall moved upward");
 }else{
  const current=new Set(pieceCells(g.piece).map(([x,y])=>x+","+y)),next=pieceCells({...g.piece,x:g.piece.x+2}),blocked=next.find(([x,y])=>!current.has(x+","+y));
  const obstacle=ball(900000+i,4);put(g,blocked[0],blocked[1],obstacle);const range=legalXRange(g);expect(range[1]<=g.piece.x,"active "+i+": legal drag range jumped across a blocked column");setFreeX(g,100);updateVisuals(g,PHYSICS_FRAME);
  const visual=pieceCells(g.piece).map(([x,y])=>[x+g.pieceVX-g.piece.x,y]);
  expect(visual.every(([x,y])=>dist(x,y,blocked[0],blocked[1])>=1-1e-8),"active "+i+": drag crossed a disconnected occupied column");
 }
 if(i%6===0){const h=active(60000+i),target=dropPiece(h.board,h.piece),cells=pieceCells(target);hardDrop(h);expect(h.state==="RESOLVING"&&!h.piece&&!h.hardDropAnim&&cells.every(([x,y])=>!!h.board[y][x])&&h.fx.hardDrops.length===1,"active "+i+": instant drop exposed an intermediate position");}
 expect(close(ROTATE_VISUAL_TIME,.1)&&close(LANDING_ALIGN_DURATION,4/60),"active "+i+": capture animation timing drifted");
});

// 181-400: rigidity, slopes, pinning and convex splitting.
for(let i=0;i<220;i++)pass("rigidity",i,()=>{
 const mode=i%4,group=20000+i;
 if(mode===0){
  const b=newBoard(),base=3+2*(i%6),bs=[0,1,2].map(r=>groupBall(group*10+r,group,r)),m=[{ball:bs[0],x:base,y:2,role:0},{ball:bs[1],x:base+2,y:2,role:1},{ball:bs[2],x:base+1,y:3,role:2}];m.forEach(v=>b[v.y][v.x]=v.ball);const plan=hexPhysPlanGroup(b,m,false);
  expect(plan.length===3&&plan.every(v=>v.ty-v.y===2)&&bs.every(v=>v.rigid),"rigidity "+i+": free triplet broke or stalled");
 }else if(mode===1){
  const b=newBoard(),base=5+2*(i%3),bs=[0,1,2].map(r=>groupBall(group*10+r,group,r)),m=[{ball:bs[0],x:base,y:2,role:0,orientation:"down"},{ball:bs[1],x:base+2,y:2,role:1,orientation:"down"},{ball:bs[2],x:base+1,y:3,role:2,orientation:"down"}];m.forEach(v=>b[v.y][v.x]=v.ball);b[4][base+2]=ball(group*10+9,4);const plan=hexPhysPlanGroup(b,m,false);
  expect(plan.length===3&&plan.every(v=>v.kind==="GROUP_SLOPE_TRANSLATE"&&v.tx-v.x===-1&&v.ty-v.y===1)&&bs.every(v=>v.rigid),"rigidity "+i+": slope changed the triplet shape");
 }else if(mode===2){
  const offsets=[-.51,-.5,-.4,0,.4,.5,.51],offset=offsets[i%offsets.length],b=newBoard(),bs=[0,1,2].map(r=>({...groupBall(group*10+r,group,r,"up"),impactOffsetX:offset,momentumX:Math.sign(offset)})),m=[{ball:bs[0],x:6,y:3,role:0,orientation:"up"},{ball:bs[1],x:7,y:4,role:1,orientation:"up"},{ball:bs[2],x:5,y:4,role:2,orientation:"up"}];m.forEach(v=>b[v.y][v.x]=v.ball);b[5][6]=ball(group*10+9,4);const motions=m.map(v=>hexPhysIndependentMemberMotion(b,m,v)),info=hexPhysUpConvexSeparator(b,m,motions),expected=Math.abs(offset)<=.5;
  expect(!!info===expected,"rigidity "+i+": centre-half split window changed");
  if(info&&offset)expect(info.dir===Math.sign(offset),"rigidity "+i+": convex split direction reversed");
 }else{
  const g=createEngine(group),y=ROWS-1,b=groupBall(group*10,group,0);g.board[y][0]=b;normalizeAllNonActivePileBalls(g);expect(!b.rigid&&b.motionGroupId===0,"rigidity "+i+": accumulated ball retained rigidity");
 }
});

// 401-600: pile settling, gaps, clears and equilibrium.
for(let i=0;i<200;i++)pass("pile",i,()=>{
 const mode=i%4;
 if(mode===0){
  const b=newBoard(),rng=mulberry32(30000+i);let id=300000+i*30;
  for(let n=0;n<8+(i%8);n++){const y=(n%3)*2,xs=[];for(let x=0;x<W2;x++)if(valid(x,y)&&!b[y][x])xs.push(x);if(!xs.length)continue;const x=xs[Math.floor(rng()*xs.length)];b[y][x]=ball(id++,(n+i)%COLORS.length);}
  settleAll(b);expect(!hasLegalGravityMove(b)&&!boardHasIllegalFloat(b),"pile "+i+": deterministic settle left a movable gap");
 }else if(mode===1){
  const b=newBoard(),pat=GARBAGE_SHAPES.HEXAGON,ay=ROWS-3,ax=1;pat.forEach(([x,y],n)=>b[ay+y][ax+x]=ball(400000+i*10+n,2));
  expect(isBalancedHexagonCenterHole(b,ax+2,ay+1)&&!hasLegalGravityMove(b),"pile "+i+": balanced hexagon hole was destroyed");
 }else if(mode===2){
  const b=newBoard();for(let x=0;x<W2;x++)if(valid(x,ROWS-1))b[ROWS-1][x]=ball(500000+i*30+x,x%COLORS.length);settleAll(b);expect(!boardHasIllegalFloat(b)&&!hasLegalGravityMove(b),"pile "+i+": floor row failed equilibrium");
 }else{
  const b=newBoard(),y=ROWS-1,c=i%COLORS.length;for(let n=0;n<6;n++){const x=n*2;b[y][x]=ball(600000+i*10+n,c);}const r=resolveInstant(b);expect(r.chain>=1&&r.garbage>=WAZA.STRAIGHT.garbage,"pile "+i+": straight clear/attack resolution changed");
 }
});

// 601-780: garbage bubble, packet fall, contact and opponent interpolation.
for(let i=0;i<180;i++)pass("garbage",i,()=>{
 const type=["PYRAMID","HEXAGON","STRAIGHT"][i%3],height=i%5,total=.38+(i%10)*.027,seed=40000+i;
 const a=stepGarbage(seed,type,height,1/30,total),b=stepGarbage(seed,type,height,1/120,total);
 expect(a.p&&b.p&&a.p.actualStartTime===0&&b.p.actualStartTime===0,"garbage "+i+": packet start drifted");
 expect(a.mono&&b.mono&&close(a.p.y,b.p.y)&&close(a.p.vy,b.p.vy),"garbage "+i+": fall differs by frame rate");
 if(total<=HEX_GARBAGE_BUBBLE_DURATION)expect(a.p.y===GARBAGE_START_Y,"garbage "+i+": packet moved inside bubble");
 const remote=createEngine(seed+9000);remote.state="NET",fx=remoteFxSnapshotOf(b.g);applySnapshot(remote,snapshotOf(b.g),fx);applyRemoteVisualState(remote,{piece:null,fx});let rb=null;for(let y=boardScanMin(remote.board);y<ROWS&&!rb;y++)for(let x=0;x<W2;x++){const q=valid(x,y)?remote.board[y][x]:null;if(q?.isGarbage){rb=q;break;}}const ry=rb?remote.vis.get(rb.id)?.y:null;updateVisuals(remote,1/60);expect(rb&&Number.isFinite(ry)&&remote.vis.get(rb.id).y>=ry,"garbage "+i+": opponent packet moved upward");
 const done=finishGarbage(seed,type,height);expect(done.p?.landed&&done.t<2.1,"garbage "+i+": packet missed the reference contact envelope");
 expect(done.added.length===GARBAGE_SHAPES[type].length&&done.added.every(v=>valid(v.x,v.y)&&!v.b.rigid&&!v.b.motionGroupId),"garbage "+i+": contact count, overlap or rigidity differs");
});

// 781-900: formations, attack amounts, effects and loss timing.
for(let i=0;i<120;i++)pass("formation",i,()=>{
 const mode=i%4;
 if(mode===0){
  const pat=GARBAGE_SHAPES.PYRAMID,maxY=Math.max(...pat.map(([,y])=>y)),src=i%2?pat:pat.map(([x,y])=>[x,maxY-y]),ax=(i%5)*2,ay=(i%3)*2,cells=src.map(([x,y])=>[x+ax,y+ay]);expect(classify(cells)==="PYRAMID","formation "+i+": pyramid orientation/translation changed");
 }else if(mode===1){
  const pat=GARBAGE_SHAPES.HEXAGON,ax=(i%5)*2,ay=(i%3)*2;expect(classify(pat.map(([x,y])=>[x+ax,y+ay]))==="HEXAGON","formation "+i+": hexagon translation changed");
 }else if(mode===2){
  const dirs=[[2,0],[1,1],[1,-1]],d=dirs[i%3],x=d[1]<0?2:0,y=d[1]<0?8:0,cells=Array.from({length:6},(_,n)=>[x+d[0]*n,y+d[1]*n]);expect(classify(cells)==="STRAIGHT","formation "+i+": straight direction changed");
 }else{
  expect(WAZA.PYRAMID.garbage===24&&WAZA.HEXAGON.garbage===36&&WAZA.STRAIGHT.garbage===19,"formation "+i+": attack amount changed");
  expect(close(WAZA.PYRAMID.hold,1.25)&&close(WAZA.STRAIGHT.fx,4.35)&&close(WAZA.PYRAMID.fx,4.05)&&close(WAZA.HEXAGON.fx,4.15),"formation "+i+": reference effect timing changed");
  const g=createEngine(50000+i);let id=700000+i*100;for(let y=-2;y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y)){const q=ball(id,id++);g.board[y][x]=q;noteBoardCell(g.board,y,q);}g.state="RESOLVING";g.phase="CHECK";g.garbDone=true;stepEngine(g,PHYSICS_FRAME);expect(!g.alive&&g.state==="GAMEOVER","formation "+i+": quiescent overflow did not lose");
 }
});

// 901-1000: network interpolation, snapshot handoff and short no-stall runs.
for(let i=0;i<100;i++)pass("network",i,()=>{
 const mode=i%4,seed=60000+i;
 if(mode===0){
  const src=active(seed);setFreeX(src,SPAWN_X+((i%7)-3)*.11);src.dropT=src.dropInterval*((i%9)+1)/10;const packet=pieceSnapshotOf(src),dst=createEngine(seed+1);dst.state="NET";applyRemoteVisualState(dst,{piece:packet,fx:{g:[]}});expect(dst.piece&&close(dst.pieceVX,packet.vx,1e-3),"network "+i+": first piece packet changed X");
 }else if(mode===1){
  const src=active(seed),packet=pieceSnapshotOf(src),dst=createEngine(seed+1);dst.state="NET";applyRemoteVisualState(dst,{piece:packet,fx:{g:[]}});applyRemoteVisualState(dst,{piece:{...packet,f:packet.f+.25},fx:{g:[]}});const y=dst.piece.y+dst.netPieceFrac;stepNetPieceMotion(dst,.05);expect(dst.piece.y+dst.netPieceFrac>=y,"network "+i+": remote fall moved upward");
 }else if(mode===2){
  const src=createEngine(seed),q=ball(710000+i,i%COLORS.length);put(src,5,0,q);const snap=snapshotOf(src),dst=createEngine(seed+1);applySnapshot(dst,snap);expect(dst.board[0][5]?.c===q.c,"network "+i+": board snapshot lost a ball");
 }else{
  const g=createEngine(seed);g.ai={level:1+(i%5),target:null,thinkT:0,actT:0};let last="",idle=0;for(let n=0;n<PHYSICS_HZ*2&&g.alive;n++){stepEngine(g,PHYSICS_FRAME);const s=g.state+"|"+g.phase+"|"+g.ver+"|"+(g.piece?.y??"-");idle=s===last?idle+1:0;last=s;}expect(idle<PHYSICS_HZ*2&&g.physicsWatch.fallbacks===0,"network "+i+": deterministic run stalled or used fallback");
 }
});

expect(results.length===1000,"expected 1000 passes, got "+results.length);
expect(counts.active===180&&counts.rigidity===220&&counts.pile===200&&counts.garbage===180&&counts.formation===120&&counts.network===100,"1000-pass allocation changed");
globalThis.reference1000={results,counts};
`;

const context={
 React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},
 window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date
};
vm.runInNewContext(runtime+suite,context,{timeout:120000});
const out=context.reference1000;
console.log(`reference fidelity ${out.results.length}/1000 PASS ${JSON.stringify(out.counts)}`);
