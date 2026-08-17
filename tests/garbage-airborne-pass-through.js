const fs=require("fs");
const vm=require("vm");

const runtime=["app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js","app-07.js","app-08.js","app-09.js","app-10.js","app-14.js","app-17.js"]
  .map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

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

console.log("garbage airborne pass-through + individual contact PASS");
`;

vm.runInNewContext(runtime+assertions,{
  React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},
  ReactDOM:{createRoot(){return{render(){}}}},
  window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date
});
