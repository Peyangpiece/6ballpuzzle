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

// Reproduce the real tunnel: pile contact is reached, but the continuous
// hand-off is temporarily refused because its corridor is reserved. Jump the
// absolute clock beyond contact to exercise the exact one-frame tunneling risk.
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

// 1000 varied delayed-contact frames. Each case starts with absolute time
// already beyond first contact, directly testing large one-frame overshoot.
for(let i=0;i<1000;i++){
  const g=createEngine(98100+i);
  const y=3+(i%8);
  let x=((y&1)?1:0)+2*(1+(i%8));
  while(x>=W2||!valid(x,y))x-=2;
  put(g,x,y,990000+i,i%4===0);
  g.state="RESOLVING";g.phase="GARBAGE";
  const p=makePack(x);
  g.garbageClock=HEX_GARBAGE_BUBBLE_DURATION+1.1+(i%5)*.12;
  g.garbagePlans=[p];g.activeGarbagePacks=[p];g.garbageNextBallAt=999;g.garbLeft=0;
  const originalReserved=hexGarbageContactPointReserved;
  hexGarbageContactPointReserved=()=>true;
  updateGarbagePacks(g,[1/30,1/60,1/120,.08,.16,.24][i%6]);
  hexGarbageContactPointReserved=originalReserved;
  expect(p._hexContactClamped===true,"case "+i+": delayed contact was not clamped");
  expect(minPackPileDistance(g,p)>=HEX_MIN_DIST-2e-6,
    "case "+i+": airborne garbage tunneled through pile: "+minPackPileDistance(g,p));
  expect(p.vy===0,"case "+i+": clamped packet could still interpolate downward");
}

console.log("garbage delayed-contact no-tunnel 1000/1000 PASS");
`;

vm.runInNewContext(runtime+assertions,{
  React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},
  ReactDOM:{createRoot(){return{render(){}}}},
  window:{},navigator:{},document:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date,setTimeout(){},clearTimeout(){}
},{timeout:120000});
