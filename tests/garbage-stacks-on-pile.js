const fs=require("fs");
const vm=require("vm");

const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js",
  "app-07.js","app-pile-arc.js","app-08.js","app-09.js","app-10.js","app-14.js","app-17.js",
  "app-garbage-contact.js","app-garbage-rigidity.js","app-garbage-settle-state.js",
  "app-garbage-no-impact.js","app-garbage-sweep-guard.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function put(g,x,y,c=0){
 const b=mkBall(g,c);g.board[y][x]=b;setVis(g,b,x,y,0);return b;
}
function cellOf(g,ball){
 for(let y=BOARD_MIN_ROW;y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y)&&g.board[y][x]===ball)return[x,y];
 return null;
}
function ballState(g,ball){
 const c=cellOf(g,ball),v=g.vis.get(ball.id);
 return {id:ball.id,cell:c,settled:ball.garbagePileSettled===true,path:(ball.fallPath||[]).map(s=>({from:s.from,to:s.to,pivot:s.pivot,kind:s.kind,pileFlow:s.pileFlow,start:s.pileFlowStart,end:s.pileFlowEnd,blocked:s.garbageSweepRerouted})),visual:v?{x:v.x,y:v.y,vy:v.vy,pileFlow:v.pileFlow,sweepBlocked:v.garbageSweepBlocked,blocks:v.garbageSweepBlockCount}:null};
}
function advanceToRest(g,balls,pack,contactAnchor){
 for(let frame=0;frame<2400;frame++){
   if(pack&&pack.pat.length)materializeGarbageContactsThrough(g,pack,contactAnchor+10);
   if(pendingFallPathCount(g)===0&&hasLegalGravityMove(g.board))settlePass(g.board,false);
   updateVisuals(g,PHYSICS_FRAME);
   resolveVisualContacts(g);
   window.__hexRefreshGarbagePileState(g);
   const allFinal=balls.every(ball=>{
     const cell=cellOf(g,ball),v=g.vis.get(ball.id);
     return !!cell&&(!ball.fallPath||!ball.fallPath.length)&&v&&!v.pileFlow&&Math.abs(v.x-cell[0])<.013&&Math.abs(v.y-cell[1])<.013;
   });
   if((!pack||!pack.pat.length)&&allFinal)return frame;
 }
 return -1;
}

const g=createEngine(99001);
const original=[];
for(let x=0;x<W2;x++)if(valid(x,ROWS-1))original.push(put(g,x,ROWS-1,(x/2)%5));
const top=put(g,5,ROWS-2,2);original.push(top);
const originalBefore=new Map(original.map(b=>{const c=cellOf(g,b),v=g.vis.get(b.id);return[b.id,{c:[...c],x:v.x,y:v.y}];}));
prepareGarbageBatch(g);

const pack={
 type:"PYRAMID",seq:501,
 pat:[[2,0],[1,1],[3,1],[0,2],[2,2],[4,2]],
 colors:[0,1,2,3,4,0],ax:3,targetY:0,y:GARBAGE_START_Y,vy:10,
 landed:false,_started:true,actualStartTime:0,bubbleT:1,totalBalls:6,landedCount:0,entryBalls:[]
};
g.garbagePlans=[pack];g.activeGarbagePacks=[pack];g.garbageClock=1;

let first=Infinity;
for(let i=0;i<pack.pat.length;i++)first=Math.min(first,hexGarbageBallContactY(g,pack,i));
expect(Number.isFinite(first),"stack fixture never contacts the pre-existing pile");
const released=materializeGarbageContactsThrough(g,pack,first+.5);
expect(pack._pileContactStarted===true,"garbage did not enter post-contact lattice state");
expect(Math.abs(pack.y-first)<3e-6,"garbage packet crossed its first pile contact before lattice handoff");
expect(released>0,"no garbage member entered the lattice at pile contact");

const ids=()=>pack.entryBalls.map(e=>e.id);
for(let frame=0;frame<2400&&pack.pat.length;frame++){
 materializeGarbageContactsThrough(g,pack,first+20);
 updateVisuals(g,PHYSICS_FRAME);
 resolveVisualContacts(g);
 if(pendingFallPathCount(g)===0&&hasLegalGravityMove(g.board))settlePass(g.board,false);
 expect(Math.abs(pack.y-first)<3e-6,"unregistered garbage descended through the pile after first contact");
}
expect(pack.pat.length===0,"some garbage members never registered on the lattice: "+JSON.stringify(pack.pat));
expect(ids().length===6,"not all garbage members were materialized");

const garbage=ids().map(id=>hexGarbageBoardBallById(g,id)).filter(Boolean);
expect(garbage.length===6,"materialized garbage disappeared from the board");
const restFrame=advanceToRest(g,garbage,null,first);
if(restFrame<0)throw new Error("garbage failed to finish lattice settling: "+JSON.stringify({clock:g.pileFlowClock,pending:pendingFallPathCount(g),legal:hasLegalGravityMove(g.board),balls:garbage.map(b=>ballState(g,b))}));
window.__hexRefreshGarbagePileState(g);

for(const ball of garbage){
 const c=cellOf(g,ball),v=g.vis.get(ball.id);
 expect(c,"settled garbage missing logical cell");
 expect(ball.garbagePileSettled===true,"final garbage did not become accumulated pile: "+ball.id);
 expect(Math.abs(v.x-c[0])<.013&&Math.abs(v.y-c[1])<.013,"final garbage visual is off lattice: "+ball.id);
 for(const old of original){
   const ov=g.vis.get(old.id);
   const d=hexPhysDist(v.x,v.y,ov.x,ov.y);
   expect(d>=HEX_MIN_DIST-5e-4,"settled garbage penetrated pre-existing pile: "+JSON.stringify({ball:ball.id,old:old.id,d}));
 }
}

for(const old of original){
 const snap=originalBefore.get(old.id),c=cellOf(g,old),v=g.vis.get(old.id);
 expect(c&&c[0]===snap.c[0]&&c[1]===snap.c[1],"pre-existing pile logical position changed");
 expect(Math.abs(v.x-snap.x)<1e-9&&Math.abs(v.y-snap.y)<1e-9,"pre-existing pile visual position changed");
}

console.log("garbage stacks on pre-existing pile and becomes pile PASS",JSON.stringify({restFrame,garbage:garbage.map(b=>({id:b.id,cell:cellOf(g,b)}))}));
`;

vm.runInNewContext(runtime+checks,{
 React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},
 ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
 Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date
},{timeout:120000});
