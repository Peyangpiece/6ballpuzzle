const fs=require("fs");
const vm=require("vm");

const html=fs.readFileSync(`${__dirname}/../public/index.html`,"utf8");
const names=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const runtime=names.map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const assertions=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function put(g,x,y,id,garbage=false){
  const b={id,c:id%5,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0,rigid:false};
  if(garbage)b.isGarbage=true;
  g.board[y][x]=b;setVis(g,b,x,y,0);return b;
}
function makePack(ax){
  return{
    type:"PYRAMID",seq:1,pat:[[0,0]],colors:[0],ax,targetY:0,
    y:GARBAGE_START_Y,vy:0,landed:false,_started:true,actualStartTime:0,
    flightAge:0,bubbleT:HEX_GARBAGE_BUBBLE_DURATION,totalBalls:1,
    landedCount:0,entryBalls:[],_hexSplitTriggered:false
  };
}
function minPackPileDistance(g,p){
  let best=Infinity;
  for(const [dx,dy] of p.pat){
    const px=p.ax+dx,py=p.y+dy;
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
      const b=valid(x,y)?g.board[y][x]:null;if(!b)continue;
      const v=g.vis.get(b.id);if(!v)continue;
      best=Math.min(best,hexPhysDist(px,py,v.x,v.y));
    }
  }
  return best;
}

// Full production integration: contact has already been crossed by absolute
// time, but lattice hand-off is deliberately refused for one update. The
// renderer-visible packet centre must be pulled back to exact circle contact.
{
  const g=createEngine(98001);put(g,5,5,980010,false);const p=makePack(5);
  g.state="RESOLVING";g.phase="GARBAGE";g.garbageClock=HEX_GARBAGE_BUBBLE_DURATION+1.25;
  g.garbagePlans=[p];g.activeGarbagePacks=[p];g.garbageNextBallAt=999;g.garbLeft=0;
  const physicalContact=hexGarbageBallContactY(g,p,0);
  const originalReserved=hexGarbageContactPointReserved;
  hexGarbageContactPointReserved=()=>true;
  updateGarbagePacks(g,PHYSICS_FRAME);
  hexGarbageContactPointReserved=originalReserved;

  expect(p.pat.length===1,"deferred-contact fixture unexpectedly materialized");
  expect(p._hexContactClamped===true,"deferred contact was not marked clamped after reaching pile");
  expect(Math.abs(p.y-physicalContact)<1e-7,"airborne garbage was rendered below its first pile contact");
  expect(p.vy===0,"clamped airborne garbage retained downward interpolation velocity");
  expect(minPackPileDistance(g,p)>=HEX_MIN_DIST-2e-7,
    "clamped airborne garbage penetrated accumulated pile: "+minPackPileDistance(g,p));

  // Once the reservation clears, the existing continuous hand-off must resume.
  let guard=0;
  while(p.pat.length&&guard++<240){
    updateGarbagePacks(g,PHYSICS_FRAME);
    updateVisuals(g,PHYSICS_FRAME);
    resolveVisualContacts(g);
    if(p.pat.length)expect(minPackPileDistance(g,p)>=HEX_MIN_DIST-2e-6,
      "retry frame tunneled through pile");
  }
  expect(!p.pat.length,"contacted garbage never resumed materialization after reservation cleared");
}

// 1000 direct overshoot cases. These isolate the new invariant itself without
// paying the cost of the entire production update stack 1000 times. Existing
// production-stack 100/1000/3000 tests still run separately in CI.
for(let i=0;i<1000;i++){
  const g=createEngine(98100+i);
  const y=3+(i%8);
  let x=((y&1)?1:0)+2*(1+(i%8));
  while(x>=W2||!valid(x,y))x-=2;
  put(g,x,y,990000+i,i%4===0);
  g.state="RESOLVING";g.phase="GARBAGE";g.garbageClock=1+(i%17)*.01;
  const p=makePack(x);g.activeGarbagePacks=[p];
  g._hexGarbageObstacleFrame=null;
  const contact=hexGarbageRemainingContactBarrier(g,p);
  expect(Number.isFinite(contact),"case "+i+": contact barrier missing");
  const overshoot=[.0001,.01,.05,.2,.75,1.5][i%6];
  p.y=contact+overshoot;
  p.vy=1+(i%23);
  const didClamp=hexGarbageClampAirborneAtContact(g,p);
  expect(didClamp===true&&p._hexContactClamped===true,"case "+i+": overshoot was not clamped");
  expect(Math.abs(p.y-contact)<1e-8,"case "+i+": clamp did not restore exact contact");
  expect(p.vy===0,"case "+i+": clamped packet kept downward velocity");
  expect(minPackPileDistance(g,p)>=HEX_MIN_DIST-2e-6,
    "case "+i+": clamped packet penetrated pile: "+minPackPileDistance(g,p));
}

console.log("garbage delayed-contact no-tunnel 1000/1000 PASS");
`;

vm.runInNewContext(runtime+assertions,{
  React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},
  ReactDOM:{createRoot(){return{render(){}}}},
  window:{},navigator:{},document:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date,setTimeout(){},clearTimeout(){}
},{timeout:120000});
