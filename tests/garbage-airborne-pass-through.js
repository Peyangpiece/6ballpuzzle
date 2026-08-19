const fs=require("fs");
const vm=require("vm");

const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js","app-07.js",
  "app-pile-arc.js","app-clear-gap-collapse.js","app-floor-gap-invariant.js","app-wall-gap-invariant.js",
  "app-wall-direct-support-fill.js","app-wall-flow-vacancy-sync.js","app-clear-vacancy-priority.js",
  "app-up-convex-split-side.js","app-release-parity-settle.js",
  "app-08.js","app-09.js","app-10.js","app-14.js","app-gameover-garbage-fade.js","app-17.js",
  "app-garbage-normal-physics.js","app-garbage-presentation.js","app-garbage-zero-rigidity.js",
  "app-garbage-deep-settle.js","app-garbage-simultaneous-motion.js","app-garbage-render-overlap-guard.js",
  "app-runtime-performance.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const assertions=String.raw`
function expect(value,message){if(!value)throw new Error(message);}
const close=(a,b,e=1e-9)=>Math.abs(a-b)<=e;

// Airborne packet-to-packet contact must never become a lattice surface.
const falling={
  type:"TEST",seq:1,pat:[[0,0]],colors:[0],ax:4,targetY:0,
  y:GARBAGE_START_Y,vy:0,landed:false,_started:true,actualStartTime:.5,
  totalBalls:1,landedCount:0,entryBalls:[]
};
const earlierAirborne={
  type:"TEST",seq:0,pat:[[0,0]],colors:[1],ax:4,targetY:0,
  y:-1,vy:8,landed:false,_started:true,actualStartTime:0,
  totalBalls:1,landedCount:0,entryBalls:[]
};
const empty={vis:new Map(),activeGarbagePacks:[falling]};
const floorContact=hexGarbageFlightContactY(empty,falling);
const airborneOnly={vis:new Map(),activeGarbagePacks:[earlierAirborne,falling]};
const airborneContact=hexGarbageFlightContactY(airborneOnly,falling);
expect(close(airborneContact,floorContact),"airborne garbage incorrectly triggered lattice contact");
expect(!/activeGarbagePacks/.test(hexGarbageBallContactY.toString()),"airborne garbage was reintroduced into per-ball contact solver");

// The lattice hand-off may never register an airborne ball ABOVE the physical
// contact point and its route must be physically reachable from that contact.
{
 const g=createEngine(91000),block=mkBall(g,2);
 g.board[10][5]=block;setVis(g,block,5,10,0);
 const cell=hexGarbageSingleLogicalCell(g,5,9.86);
 expect(cell===null||cell.y>=9.86-1e-7,"garbage hand-off selected a logical cell above physical contact");
 if(cell)expect(hexPhysDist(5,9.86,cell.x,cell.y)<=1.000001,"garbage hand-off jumped farther than one diameter");
}

// Only the exact garbage ball that touches accumulated pile may materialize.
// Its sibling stays airborne until its own physical contact.
{
 const g=createEngine(91001),support=mkBall(g,3);
 g.board[4][5]=support;setVis(g,support,5,4,0);
 const pack={
  type:"PYRAMID",seq:7,pat:[[0,0],[2,0]],colors:[0,1],ax:5,targetY:0,
  y:GARBAGE_START_Y,vy:12,landed:false,_started:true,actualStartTime:0,
  bubbleT:1,totalBalls:2,landedCount:0,entryBalls:[]
 };
 g.activeGarbagePacks=[pack];g.garbageClock=1;
 const leftContact=hexGarbageBallContactY(g,pack,0);
 const rightContact=hexGarbageBallContactY(g,pack,1);
 expect(Number.isFinite(leftContact),"touching garbage member had no physical contact");
 expect(rightContact>=leftContact-1e-9,"sibling contact ordering became inverted");
}

console.log("airborne garbage pass-through PASS");
`;

vm.runInNewContext(runtime+assertions,{
  React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f},createElement(){}},
  ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
  Image:function(){this.complete=false;this.naturalWidth=0;},Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date,
  setTimeout(){return 0},clearTimeout(){},performance:{now(){return 0}},localStorage:{getItem(){return null},setItem(){}},
  document:{getElementById(){return null}},ResizeObserver:function(){this.observe=()=>{};this.disconnect=()=>{};}
},{timeout:120000});
