const fs=require("fs");
const vm=require("vm");

// Always test the exact production stack. This regression used to stop at
// app-25 and therefore could pass while later production layers behaved
// differently.
const html=fs.readFileSync(`${__dirname}/../public/index.html`,"utf8");
const names=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const runtime=names.map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const assertions=String.raw`
function expect(value,message){if(!value)throw new Error(message);}
const close=(a,b,e=1e-9)=>Math.abs(a-b)<=e;

// Airborne packet-to-packet proximity is still not a lattice/materialization
// surface. Airborne packets are not board-backed visuals.
{
 const falling={type:"TEST",seq:1,pat:[[0,0]],colors:[0],ax:4,targetY:0,y:GARBAGE_START_Y,vy:0,landed:false,_started:true,actualStartTime:.5,totalBalls:1,landedCount:0,entryBalls:[]};
 const earlierAirborne={type:"TEST",seq:0,pat:[[0,0]],colors:[1],ax:4,targetY:0,y:-1,vy:8,landed:false,_started:true,actualStartTime:0,totalBalls:1,landedCount:0,entryBalls:[]};
 const empty={board:newBoard(),vis:new Map(),activeGarbagePacks:[falling],garbageClock:0};
 const floorContact=hexGarbageFlightContactY(empty,falling);
 delete falling._hexContactFrame;
 const airborneOnly={board:newBoard(),vis:new Map(),activeGarbagePacks:[earlierAirborne,falling],garbageClock:0};
 const airborneContact=hexGarbageFlightContactY(airborneOnly,falling);
 expect(close(airborneContact,floorContact),"airborne packet incorrectly became a materialization surface");
}

// Reference behavior: the formation is rigid only while completely airborne.
// The first real pile contact releases the WHOLE formation into ordinary ball
// physics in the same physics frame. No sibling remains in pack.pat to tunnel
// through already-released members.
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
 expect(leftContact<rightContact-1e-6,"fixture did not isolate the first contacted member");
 const made=materializeGarbageContactsThrough(g,pack,leftContact+HEX_GARBAGE_CONTACT_EPS);
 expect(made===2,"first contact did not release the whole two-ball formation: "+made);
 expect(pack.pat.length===0&&pack.colors.length===0,"airborne siblings remained after first contact");
 expect(pack.landed===true&&pack.landedCount===2,"whole formation was not marked released");
 expect(pack._hexSplitTriggered===true,"first contact did not end airborne rigidity");
 let gridified=[];
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const b=valid(x,y)?g.board[y][x]:null;if(b?.isGarbage)gridified.push({b,x,y});
 }
 expect(gridified.length===2,"whole formation did not enter board physics");
 expect(gridified.every(e=>e.b.motionGroupId===0&&!e.b.rigid),"released garbage retained rigid packet state");
 expect(pack.entryBalls.length===2,"release metadata lost a formation member");
 expect(pack.entryBalls.every(e=>e.y>=e.contactY-1e-7),"a released member was registered above its physical handoff");
}

// A non-grid tangent still starts visually at the exact continuous contact and
// reaches its logical cell only through the existing continuous handoff path.
{
 const g=createEngine(91002);let id=810000;
 function put(x,y,c){const b={id:id++,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0,rigid:false};g.board[y][x]=b;setVis(g,b,x,y,0);return b;}
 put(6,11,0);put(8,11,1);put(10,11,2);put(7,10,3);put(9,10,4);put(8,9,0);
 const pack={type:"PYRAMID",seq:8,pat:[[0,0]],colors:[1],ax:8,targetY:0,y:GARBAGE_START_Y,vy:9,landed:false,_started:true,actualStartTime:0,bubbleT:1,totalBalls:1,landedCount:0,entryBalls:[],_hexSplitTriggered:true};
 g.activeGarbagePacks=[pack];g.garbageClock=1;
 const contact=hexGarbageBallContactY(g,pack,0);
 expect(Math.abs(contact-Math.round(contact))>.05,"continuous handoff fixture accidentally landed on a grid row");
 const made=materializeGarbageBallAtContact(g,pack,0,contact);
 expect(made,"continuous contact did not materialize");
 const entry=pack.entryBalls[0],ball=hexGarbageBoardBallById(g,entry.id),v=g.vis.get(entry.id);
 expect(ball&&v,"continuous handoff ball missing");
 expect(close(v.y,contact,1e-8),"garbage visually snapped away from exact contact");
 const first=Array.isArray(ball.fallPath)?ball.fallPath[0]:null;
 expect(first?.garbageContinuousHandoff,"non-grid contact lost continuous handoff segment");
 expect(Number(first.motionSeq)>0,"continuous handoff lost motion ordering");
}

// A complete PYRAMID must release all six members on its first real contact and
// complete without leaving an airborne remainder.
{
 const g=createEngine(22);g.state="RESOLVING";g.phase="GARBAGE";g.garbShapes=["PYRAMID"];
 prepareGarbageBatch(g);
 const p=g.garbagePlans[0];let guard=0,firstReleaseCount=0;
 while(!p.landed&&guard++<720){
  const before=p.landedCount||0;
  updateGarbagePacks(g,PHYSICS_FRAME);
  if((p.landedCount||0)>before&&!firstReleaseCount)firstReleaseCount=p.landedCount-before;
  updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);
 }
 let landed=0;
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const b=valid(x,y)?g.board[y][x]:null;if(b?.isGarbage)landed++;
 }
 expect(firstReleaseCount===GARBAGE_SHAPES.PYRAMID.length,"PYRAMID first contact did not release all six: "+firstReleaseCount);
 expect(p.landed&&p.pat.length===0&&p.landedCount===GARBAGE_SHAPES.PYRAMID.length&&landed===GARBAGE_SHAPES.PYRAMID.length,
  "full pyramid did not complete whole-packet release");
}

console.log("garbage airborne isolation + first-contact whole release PASS");
`;

vm.runInNewContext(runtime+assertions,{
  React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},
  ReactDOM:{createRoot(){return{render(){}}}},
  window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date
},{timeout:120000});
