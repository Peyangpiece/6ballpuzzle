const fs=require("fs");
const vm=require("vm");

const core=fs.readFileSync(`${__dirname}/../public/app-01.js`,"utf8");
const adapter=fs.readFileSync(`${__dirname}/../public/app-pileflow-visual-tangency.js`,"utf8");

const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function baseMove(g,cell,v,dt){v.x=v._tx;v.y=v._ty;return true;}
function updateScheduledPileFlowVisual(g,cell,v,dt){return baseMove(g,cell,v,dt);}

function physicalDist(ax,ay,bx,by){return Math.hypot((ax-bx)*.5,(ay-by)*HEX_ROW_H);}
function oldSafeAt(g,id,x,y){
  if(!g?.board||!g?.vis)return true;
  for(let yy=boardScanMin(g.board);yy<ROWS;yy++)for(let xx=0;xx<W2;xx++){
    if(!valid(xx,yy))continue;
    const other=g.board[yy][xx];
    if(!other||other.id===id)continue;
    const ov=g.vis.get(other.id);
    if(!ov||!Number.isFinite(ov.x)||!Number.isFinite(ov.y))continue;
    if(physicalDist(x,y,ov.x,ov.y)<0.999999)return false;
  }
  return true;
}
function oldGuard(g,cell,v,dt){
  if(!cell||!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))return baseMove(g,cell,v,dt);
  const ox=v.x,oy=v.y;
  const handled=baseMove(g,cell,v,dt);
  if(!handled||!Number.isFinite(v.x)||!Number.isFinite(v.y))return handled;
  const nx=v.x,ny=v.y;
  if(oldSafeAt(g,cell.id,nx,ny))return handled;
  if(!oldSafeAt(g,cell.id,ox,oy))return handled;
  let lo=0,hi=1;
  for(let i=0;i<22;i++){
    const m=(lo+hi)*.5,x=ox+(nx-ox)*m,y=oy+(ny-oy)*m;
    if(oldSafeAt(g,cell.id,x,y))lo=m;else hi=m;
  }
  v.x=ox+(nx-ox)*lo;
  v.y=Math.max(oy,oy+(ny-oy)*lo);
  const d=Math.max(1e-9,Number(dt)||0);
  v.vy=Math.max(0,(v.y-oy)/d);
  v.motionSpeed=physicalDist(ox,oy,v.x,v.y)/d;
  v.pileFlowTangencyClamped=true;
  return handled;
}
function fixture(obstacleX=9,targetX=8,targetY=10.4){
  const board=newBoard();
  const moving={id:1,c:0},other={id:2,c:1};
  board[10][7]=moving;board[10][9]=other;
  const vis=new Map();
  vis.set(1,{x:7,y:10,vy:0,motionSpeed:0,_tx:targetX,_ty:targetY});
  vis.set(2,{x:obstacleX,y:10,vy:0,motionSpeed:0});
  return{g:{board,vis},cell:moving,v:vis.get(1)};
}
function snapshot(v){return{x:v.x,y:v.y,vy:v.vy,motionSpeed:v.motionSpeed,clamped:!!v.pileFlowTangencyClamped};}
function sameNumber(a,b){return Object.is(a,b)||Math.abs((a||0)-(b||0))<1e-12;}
function sameState(a,b){return sameNumber(a.x,b.x)&&sameNumber(a.y,b.y)&&sameNumber(a.vy,b.vy)&&sameNumber(a.motionSpeed,b.motionSpeed)&&a.clamped===b.clamped;}

${adapter}

expect(window.__hexPileFlowVisualTangencyVersion==="pileflow-tangency-v2","pile-flow tangency v2 not installed");
expect(window.__hexPileFlowTangencyCollisionSnapshot===true,"collision snapshot optimization marker missing");
expect(window.__hexPileFlowTangencySearchSteps===22,"binary-search resolution changed");
expect(window.__hexPileFlowVisualTangencyPhysicsUnchanged===true,"physics unchanged marker missing");

for(const spec of[
  {name:"collision clamp",args:[9,8,10.4]},
  {name:"safe target",args:[9,5,10.2]},
  {name:"origin already unsafe",args:[7.8,8,10.2]}
]){
  const a=fixture(...spec.args),b=fixture(...spec.args);
  const ra=oldGuard(a.g,a.cell,a.v,1/120),rb=updateScheduledPileFlowVisual(b.g,b.cell,b.v,1/120);
  expect(ra===rb,spec.name+" changed handled result");
  const sa=snapshot(a.v),sb=snapshot(b.v);
  expect(sameState(sa,sb),spec.name+" changed visual result: "+JSON.stringify({old:sa,optimized:sb}));
}

console.log("pile-flow tangency performance parity PASS",JSON.stringify({searchSteps:22,snapshotOnCollision:true}));
`;

vm.runInNewContext(core+checks,{
  React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f},createElement(){}},
  window:{},navigator:{},console,Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date,
  setTimeout(){return 0},clearTimeout(){},performance:{now(){return 0}},localStorage:{getItem(){return null},setItem(){}},
  document:{getElementById(){return null}}
},{timeout:120000});
