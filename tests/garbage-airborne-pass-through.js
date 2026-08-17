const fs=require("fs");
const vm=require("vm");

const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js",
  "app-07.js","app-08.js","app-09.js","app-10.js","app-14.js","app-17.js",
  "app-18.js","app-19.js","app-20.js","app-21.js","app-22.js","app-23.js"
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
const empty={board:newBoard(),vis:new Map(),activeGarbagePacks:[falling],garbageClock:0};
const floorContact=hexGarbageFlightContactY(empty,falling);
delete falling._hexContactFrame;
const airborneOnly={board:newBoard(),vis:new Map(),activeGarbagePacks:[earlierAirborne,falling],garbageClock:0};
const airborneContact=hexGarbageFlightContactY(airborneOnly,falling);
expect(close(airborneContact,floorContact),"airborne garbage incorrectly triggered lattice contact");
expect(!/activeGarbagePacks/.test(hexGarbageBallContactY.toString()),"airborne garbage was reintroduced into per-ball contact solver");

// The lattice hand-off may never register an airborne ball ABOVE the physical
// contact point. If the nearest valid cell is unavailable, the function must
// return null rather than create an upward-recovery path.
{
 const g=createEngine(91000),block=mkBall(g,2);
 g.board[10][5]=block;setVis(g,block,5,10,0);
 const cell=hexGarbageSingleLogicalCell(g,5,9.86);
 expect(cell===null||cell.y>=9.86-1e-7,"garbage hand-off selected a logical cell above physical contact");
 if(cell)expect(hexPhysDist(5,9.86,cell.x,cell.y)<=1.000001,"garbage hand-off jumped farther than one diameter");
}

// Only the exact garbage ball that touches accumulated pile may materialize.
// Its sibling stays airborne even though both balls belong to the same packet.
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
 expect(leftContact<rightContact-1e-6,"fixture did not isolate one contacted garbage ball");
 const made=materializeGarbageContactsThrough(g,pack,leftContact+HEX_GARBAGE_CONTACT_EPS);
 expect(made===1,"one pile contact materialized more than one garbage ball");
 expect(pack.pat.length===1&&pack.colors.length===1,"airborne sibling did not remain in flight");
 expect(pack.landed===false&&pack.landedCount===1,"packet was marked landed after only one ball contacted pile");
 expect(pack.entryBalls.length===1&&pack.entryBalls[0].y>=pack.entryBalls[0].contactY-1e-7,
  "contacted garbage was registered above its physical contact point");
 let gridified=[];
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const b=valid(x,y)?g.board[y][x]:null;if(b?.isGarbage)gridified.push({b,x,y});
 }
 expect(gridified.length===1,"exactly one garbage ball should exist on the lattice after first contact");
 expect(gridified[0].b.motionGroupId===0&&!gridified[0].b.rigid,"contacted garbage ball retained packet rigidity");
 expect(pack.pat[0][0]===2&&pack.pat[0][1]===0,"wrong sibling remained airborne");

 for(let i=0;i<120;i++){updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);if(pendingFallPathCount(g)===0)break;}
 const remainingContact=hexGarbageBallContactY(g,pack,0);
 let made2=0;
 for(let i=0;i<240&&!made2;i++){
  made2=materializeGarbageContactsThrough(g,pack,remainingContact+HEX_GARBAGE_CONTACT_EPS);
  if(!made2){updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);}
 }
 expect(made2===1,"remaining garbage ball did not materialize at its own contact");
 expect(pack.pat.length===0&&pack.landed&&pack.landedCount===2,"packet did not finish after both individual contacts");
 expect(pack.entryBalls.every(e=>e.y>=e.contactY-1e-7),"a packet member was registered above physical contact");
}

// Non-grid physical contact must stay at the exact continuous contact centre.
// The ball may reserve a logical cell internally, but the rendered centre may
// reach that lattice cell only through a continuous gravity/contact-arc path.
{
 const g=createEngine(91002);let id=810000;
 function put(x,y,c){const b={id:id++,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0,rigid:false};g.board[y][x]=b;setVis(g,b,x,y,0);return b;}
 put(6,11,0);put(8,11,1);put(10,11,2);put(7,10,3);put(9,10,4);put(8,9,0);
 const pack={
  type:"PYRAMID",seq:8,pat:[[0,0]],colors:[1],ax:8,targetY:0,
  y:GARBAGE_START_Y,vy:9,landed:false,_started:true,actualStartTime:0,
  bubbleT:1,totalBalls:1,landedCount:0,entryBalls:[],_hexSplitTriggered:true
 };
 g.activeGarbagePacks=[pack];g.garbageClock=1;
 const contact=hexGarbageBallContactY(g,pack,0);
 expect(Math.abs(contact-Math.round(contact))>.05,"continuous hand-off fixture accidentally landed on a grid row");
 const made=materializeGarbageBallAtContact(g,pack,0,contact);
 expect(made,"continuous hand-off contact did not materialize");
 const entry=pack.entryBalls[0],ball=hexGarbageBoardBallById(g,entry.id),v=g.vis.get(entry.id);
 expect(ball&&v,"continuous hand-off ball missing after contact");
 expect(close(v.x,8,1e-8)&&close(v.y,contact,1e-8),"garbage visually snapped to lattice at contact");
 expect(close(entry.handoffX,8,1e-8)&&close(entry.handoffY,contact,1e-8),"entry metadata lost exact physical contact");
 const first=Array.isArray(ball.fallPath)?ball.fallPath[0]:null;
 expect(first?.pileFlow,"non-grid contact did not receive a continuous pile-flow segment");
 expect(close(first.from[0],8,1e-8)&&close(first.from[1],contact,1e-8),"continuous path did not start at exact physical contact");
 let maxStep=0,prev=[v.x,v.y];
 for(let i=0;i<480&&pendingFallPathCount(g)>0;i++){
  updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);
  const now=[v.x,v.y];maxStep=Math.max(maxStep,hexPhysDist(prev[0],prev[1],now[0],now[1]));prev=now;
 }
 expect(pendingFallPathCount(g)===0,"continuous garbage hand-off never finished");
 let finalCell=null;
 for(let y=boardScanMin(g.board);y<ROWS&&!finalCell;y++)for(let x=0;x<W2;x++)if(valid(x,y)&&g.board[y][x]===ball){finalCell=[x,y];break;}
 expect(finalCell,"continuous garbage ball disappeared from logical board");
 expect(close(v.x,finalCell[0],1e-6)&&close(v.y,finalCell[1],1e-6),"garbage final rendered position did not settle on lattice");
 expect(maxStep<0.35,"continuous garbage hand-off contained a visible grid snap: "+maxStep);
}

// A complete pyramid must still finish after all six individual contacts.
{
 const g=createEngine(22);g.state="RESOLVING";g.phase="GARBAGE";g.garbShapes=["PYRAMID"];
 prepareGarbageBatch(g);
 const p=g.garbagePlans[0];let guard=0;
 while(!p.landed&&guard++<720){
  updateGarbagePacks(g,PHYSICS_FRAME);updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);
 }
 let landed=0;
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const b=valid(x,y)?g.board[y][x]:null;if(b?.isGarbage)landed++;
 }
 expect(p.landed&&p.landedCount===GARBAGE_SHAPES.PYRAMID.length&&landed===GARBAGE_SHAPES.PYRAMID.length,
  "full pyramid did not finish individual contacts: "+JSON.stringify({guard,remaining:p.pat.length,landedCount:p.landedCount,boardGarbage:landed,y:p.y,entryBalls:p.entryBalls}));
 expect(p.entryBalls.every(e=>e.y>=e.contactY-1e-7),"full pyramid registered a garbage ball above physical contact");
}

console.log("garbage airborne pass-through + continuous handoff PASS");
`;

vm.runInNewContext(runtime+assertions,{
  React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},
  ReactDOM:{createRoot(){return{render(){}}}},
  window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date
});
