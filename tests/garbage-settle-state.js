const fs=require("fs");
const vm=require("vm");
const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js",
  "app-07.js","app-pile-arc.js","app-08.js","app-09.js","app-10.js","app-14.js","app-17.js",
  "app-garbage-contact.js","app-garbage-rigidity.js","app-garbage-settle-state.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function close(a,b,e=1e-8){return Math.abs(a-b)<=e;}

const g=createEngine(94001);
let nextId=940000;
function put(x,y,{garbage=false,visual=[x,y],path=[]}={}){
  const b={id:nextId++,c:0,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0,rigid:false};
  if(garbage)b.isGarbage=true;
  g.board[y][x]=b;
  setVis(g,b,visual[0],visual[1],0);
  b.fallPath=path;
  return b;
}

const floorContact=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H;
const pack={type:"TEST",seq:1,pat:[[0,0]],colors:[0],ax:5,targetY:0,y:GARBAGE_START_Y,vy:0,landed:false,_started:true,totalBalls:1,landedCount:0,entryBalls:[]};

// This batch begins with an empty board. Anything added afterward belongs to
// the current incoming garbage and can never be the contact trigger for another
// still-airborne member of this same batch.
window.__hexCaptureGarbageOriginalPile(g);
const moving=put(5,8,{garbage:true,visual:[5,6.65],path:[{from:[5,6.65],to:[5,8],kind:"FREE_FALL",motionSeq:1}]});
moving.garbagePileSettled=false;
const movingContact=hexGarbageBallContactY(g,pack,0);
expect(close(movingContact,floorContact,1e-7),"moving current-batch garbage acted as pre-existing pile");
expect(window.__hexGarbageIsSettledPile(g,moving)===false,"moving garbage was promoted before final position");

// Reaching the final rendered/logical position still promotes it to accumulated
// pile for normal post-garbage physics, but NOT for contact-trigger purposes in
// the same batch because it was absent from the batch-start snapshot.
const mv=g.vis.get(moving.id);
moving.fallPath=[];mv.x=5;mv.y=8;mv.vy=0;mv.motionSpeed=0;mv.pileFlow=false;delete mv._pendingPathComplete;
window.__hexRefreshGarbagePileState(g);
expect(moving.garbagePileSettled===true,"garbage did not become pile at final position");
const sameBatchContact=hexGarbageBallContactY(g,pack,0);
expect(close(sameBatchContact,floorContact,1e-7),"settled current-batch garbage incorrectly became an airborne contact trigger");

// On the NEXT garbage batch, that same already-settled ball is now part of the
// pre-existing pile snapshot and therefore must become a valid contact surface.
window.__hexCaptureGarbageOriginalPile(g);
const nextBatchContact=hexGarbageBallContactY(g,pack,0);
expect(nextBatchContact<floorContact-0.5,"previous-batch settled garbage was not captured as pre-existing pile");

// Promotion is one-way. A later clear may move an accumulated pile ball, but it
// remains accumulated pile and must not revert to incoming-garbage state.
moving.fallPath=[{from:[5,8],to:[4,9],kind:"ROLL_LEFT",motionSeq:2}];
window.__hexRefreshGarbagePileState(g);
expect(moving.garbagePileSettled===true,"settled garbage was demoted during later pile collapse");
expect(window.__hexGarbageIsSettledPile(g,moving)===true,"later pile movement lost settled-pile classification");

// Ordinary pile balls present before the batch are always valid contact support.
const g2=createEngine(94002);const normal={id:950000,c:1,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0,rigid:false};
g2.board[8][5]=normal;setVis(g2,normal,5,8,0);window.__hexCaptureGarbageOriginalPile(g2);
const normalContact=hexGarbageBallContactY(g2,pack,0);
expect(normalContact<floorContact-0.5,"pre-existing ordinary pile ball stopped acting as contact support");

console.log("garbage final-position + pre-existing-pile gate PASS");
`;

vm.runInNewContext(runtime+checks,{
 React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},
 ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
 Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date
},{timeout:120000});
