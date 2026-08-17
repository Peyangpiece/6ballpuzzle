const fs=require("fs");
const vm=require("vm");

const read=name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8");
const runtimeNames=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js",
  "app-06.js","app-07.js","app-08.js","app-09.js","app-10.js","app-14.js","app-17.js"
];
const runtime=runtimeNames.map(read).join("\n");

const checks=String.raw`
function expect(value,message){if(!value)throw new Error(message);}
const close=(a,b,e=1e-8)=>Math.abs(a-b)<=e;
const types=["PYRAMID","HEXAGON","STRAIGHT"];

function addFlatBase(g,height,seed){
 let id=500000+seed*100;
 for(let y=ROWS-height;y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y)){
  const ball={id:id++,c:(x+y+seed)%COLORS.length,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0,rigid:false};
  g.board[y][x]=ball;setVis(g,ball,x,y,0);
 }
}

function sampleFlight(seed,type,height,dt,total){
 const g=createEngine(seed);addFlatBase(g,height,seed);g.garbShapes=[type];prepareGarbageBatch(g);
 let lastY=GARBAGE_START_Y,bubbleStayed=true,monotone=true,minFlight=Infinity;
 while(g.garbageClock<total-1e-10){
  const h=Math.min(dt,total-g.garbageClock);updateGarbagePacks(g,h);
  const p=g.activeGarbagePacks[0];
  if(!p)continue;
  if(p.bubbleT<=HEX_GARBAGE_BUBBLE_DURATION+1e-9&&p.y!==GARBAGE_START_Y)bubbleStayed=false;
  if(p.y+1e-10<lastY)monotone=false;
  lastY=p.y;
  if(!p.landed&&p.bubbleT>=HEX_GARBAGE_BUBBLE_DURATION){
   for(let i=0;i<p.pat.length;i++){
    const [dx,dy]=p.pat[i],px=p.ax+dx,py=p.y+dy;
    for(let j=i+1;j<p.pat.length;j++){
     const [ex,ey]=p.pat[j];minFlight=Math.min(minFlight,hexPhysDist(px,py,p.ax+ex,p.y+ey));
    }
    for(const [,v] of g.vis.entries())if(v)minFlight=Math.min(minFlight,hexPhysDist(px,py,v.x,v.y));
   }
  }
 }
 return{g,p:g.activeGarbagePacks[0],bubbleStayed,monotone,minFlight};
}

function finishFlight(seed,type,height){
 const g=createEngine(seed);addFlatBase(g,height,seed);const before=physicsSignature(g);
 g.garbShapes=[type];prepareGarbageBatch(g);
 let elapsed=0,lastY=GARBAGE_START_Y,monotone=true;
 while(elapsed<2.5){
  updateGarbagePacks(g,PHYSICS_FRAME);elapsed+=PHYSICS_FRAME;
  const p=g.activeGarbagePacks[0];
  if(p){if(p.y+1e-10<lastY)monotone=false;lastY=p.y;if(p.landed)break;}
 }
 const p=g.activeGarbagePacks[0],added=[];
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const ball=valid(x,y)?g.board[y][x]:null;if(ball?.isGarbage)added.push({ball,x,y});
 }
 return{g,p,elapsed,monotone,added,before};
}

const pyramid=GARBAGE_SHAPES.PYRAMID,pyramidMaxY=Math.max(...pyramid.map(([,y])=>y));
const inversePyramid=pyramid.map(([x,y])=>[x,pyramidMaxY-y]);
expect(classify(pyramid)==="PYRAMID"&&classify(inversePyramid)==="PYRAMID","inverse pyramid classification missing");
expect(HEX_GARBAGE_BUBBLE_DURATION===.34&&HEX_GARBAGE_BUBBLE_POP_DURATION===.14,"capture-derived bubble timing changed");
expect(HEX_GARBAGE_SHAPE_INTERVAL===.5,"capture-derived packet cadence changed");
{
 const g=createEngine(6999),baseY=5,ax=0;
 let supportId=690000;
 for(let y=7;y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y)){
  const ball={id:supportId++,c:(Math.floor(x/2)+y*2)%COLORS.length,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0,rigid:false};
  g.board[y][x]=ball;setVis(g,ball,x,y,0);
 }
 {const ball={id:supportId++,c:0,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0,rigid:false};g.board[6][5]=ball;setVis(g,ball,5,6,0);}
 inversePyramid.forEach(([x,y],i)=>{const ball=mkBall(g,2);g.board[baseY+y][ax+x]=ball;setVis(g,ball,ax+x,baseY+y,0);});
 expect(!boardHasIllegalFloat(g.board)&&!hasLegalGravityMove(g.board),"inverse pyramid activation fixture is not in equilibrium");
 g.state="RESOLVING";g.phase="CHECK";g.garbDone=true;
 stepEngine(g,PHYSICS_FRAME);
 expect(g.phase==="CLEAR"&&g.clearing.waza.includes("PYRAMID"),"inverse pyramid did not enter the pyramid clear phase");
 expect(g.fx.formations.some(f=>f.w==="PYRAMID"&&f.pointDown),"inverse pyramid did not use the downward formation effect");
 for(let i=0;i<600&&g.sendBuffer===0;i++)stepEngine(g,PHYSICS_FRAME);
 expect(g.sendBuffer===WAZA.PYRAMID.garbage&&g.sendShapes.length===WAZA.PYRAMID.packs&&g.sendShapes.every(v=>v==="PYRAMID"),"inverse pyramid did not emit pyramid garbage");
}

const passes=[];
for(let pass=0;pass<100;pass++){
 const seed=7000+pass,type=types[pass%types.length],height=pass%5,total=.38+(pass%12)*.023;
 const slow=sampleFlight(seed,type,height,1/30,total),fast=sampleFlight(seed,type,height,1/120,total);
 expect(slow.p&&fast.p,"pass "+pass+": garbage packet did not start");
 expect(slow.p.actualStartTime===0&&fast.p.actualStartTime===0,"pass "+pass+": start time depends on frame rate");
 expect(slow.bubbleStayed&&fast.bubbleStayed,"pass "+pass+": packet moved before bubble completed");
 expect(slow.monotone&&fast.monotone,"pass "+pass+": falling packet moved upward");
 expect(close(slow.p.bubbleT,fast.p.bubbleT)&&close(slow.p.y,fast.p.y)&&close(slow.p.vy,fast.p.vy),"pass "+pass+": 30fps/120fps trajectories differ");
 expect(slow.p.pat.length===GARBAGE_SHAPES[type].length,"pass "+pass+": packet shape changed during flight");
 if(Number.isFinite(fast.minFlight))expect(fast.minFlight>=HEX_MIN_DIST-1e-7,"pass "+pass+": airborne packet crossed another ball: "+fast.minFlight);

 const remote=createEngine(seed+10000);remote.state="NET";const fx=remoteFxSnapshotOf(fast.g);applySnapshot(remote,snapshotOf(fast.g),fx);applyRemoteVisualState(remote,{piece:null,fx});
 if(fx.g.length){
  const remotePack=remote.activeGarbagePacks[0];
  expect(remotePack,"pass "+pass+": opponent airborne garbage disappeared");
  const remoteY=remotePack.y;stepNetGarbageMotion(remote,1/60);
  expect(remotePack.y+1e-10>=remoteY,"pass "+pass+": opponent airborne garbage interpolation reversed");
 }else{
  const remoteBall=(()=>{for(let y=boardScanMin(remote.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?remote.board[y][x]:null;if(b?.isGarbage)return b;}return null;})();
  expect(remoteBall,"pass "+pass+": contacted opponent garbage disappeared from the board");
 }

 const done=finishFlight(seed,type,height);
 expect(done.p?.landed,"pass "+pass+": garbage did not reach contact within the reference envelope");
 expect(done.elapsed<2.1,"pass "+pass+": garbage fall exceeded the reference duration");
 expect(done.monotone,"pass "+pass+": contact approach was not monotone");
 expect(done.added.length===GARBAGE_SHAPES[type].length,"pass "+pass+": materialized ball count differs from preview");
 expect(done.added.every(({ball,x,y})=>valid(x,y)&&ball.motionGroupId===0&&!ball.rigid),"pass "+pass+": contacted garbage retained rigidity or left the board");
 expect(new Set(done.added.map(({x,y})=>x+","+y)).size===done.added.length,"pass "+pass+": garbage balls overlapped at contact");
 expect(!/settleAll\s*\(/.test(materializeGarbagePack.toString())&&!/settleAll\s*\(/.test(materializeGarbagePackAtContact.toString()),"pass "+pass+": garbage contact invoked the blocking full solver");
 passes.push({pass,type,height});
}

globalThis.garbagePasses=passes;
`;

const context={
 React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},
 window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date,
 ReactDOM:{createRoot(){return{render(){}}}}
};
vm.runInNewContext(runtime+checks,context,{timeout:120000});
if(context.garbagePasses.length!==100)throw new Error(`expected 100 passes, got ${context.garbagePasses.length}`);
console.log(`garbage fidelity ${context.garbagePasses.length}/100 PASS`);
