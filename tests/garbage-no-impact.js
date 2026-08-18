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
function close(a,b,e=1e-9){return Math.abs(a-b)<=e;}
function put(g,x,y,c=0,garbage=false){
 const b=mkBall(g,c);if(garbage)b.isGarbage=true;
 g.board[y][x]=b;setVis(g,b,x,y,0);return b;
}

// Stable three-ball pile: all three existed before the garbage batch.
{
 const g=createEngine(98001);
 const left=put(g,4,11,0),right=put(g,6,11,1),top=put(g,5,10,2);
 const before=new Map([left,right,top].map(b=>{
   const v=g.vis.get(b.id);return [b.id,{x:v.x,y:v.y,vy:v.vy,cell:(()=>{for(let y=BOARD_MIN_ROW;y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y)&&g.board[y][x]===b)return[x,y];})()}];
 }));
 prepareGarbageBatch(g);
 const pins=window.__hexGarbageImpactPinState(g);
 expect(pins&&pins.ids.size===3,"pre-existing pile was not captured as garbage-impact anchors");

 // Add a current-batch garbage member already penetrating the top ball a little.
 // Visual contact projection must move only the garbage ball, never the pile.
 const gar=put(g,5,8,3,true);gar.garbagePileSettled=false;
 const gv=g.vis.get(gar.id);gv.x=5;gv.y=9.02;gv.vy=4;gv.motionSpeed=4;
 g._visualMovingIds=new Set([gar.id]);
 resolveVisualContacts(g);

 for(const b of [left,right,top]){
   const snap=before.get(b.id),v=g.vis.get(b.id);
   expect(close(v.x,snap.x)&&close(v.y,snap.y),"original pile visual moved from garbage contact: "+b.id);
   expect(close(v.vy,snap.vy),"original pile gained velocity from garbage contact: "+b.id);
   let cell=null;for(let y=BOARD_MIN_ROW;y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y)&&g.board[y][x]===b)cell=[x,y];
   expect(cell&&cell[0]===snap.cell[0]&&cell[1]===snap.cell[1],"original pile logical cell moved from garbage contact: "+b.id);
   expect(!Array.isArray(b.fallPath)||b.fallPath.length===0,"original pile acquired fallPath from garbage contact: "+b.id);
 }
 const tv=g.vis.get(top.id),dist=hexPhysDist(gv.x,gv.y,tv.x,tv.y);
 expect(dist>=HEX_MIN_DIST-5e-4,"garbage was not corrected away from fixed pile: "+dist);
}

// Resolver-level guard: even if an original pre-drop ball happens to be
// gravitationally movable, garbage-phase settlePass must not move it or queue a
// path. This is what prevents materialization's board-wide settlePass from
// transmitting an artificial impact into the old pile.
{
 const g=createEngine(98002);
 const anchor=put(g,5,8,0);
 expect(!!hexPhysNaturalMotion(g.board,5,8),"test anchor unexpectedly stable");
 prepareGarbageBatch(g);
 const movedDuring=settlePass(g.board,false);
 expect(movedDuring===false,"pinned original pile moved during garbage phase");
 expect(g.board[8][5]===anchor,"pinned original pile changed lattice cell");
 expect(!Array.isArray(anchor.fallPath)||anchor.fallPath.length===0,"pinned original pile received a fallPath");

 // Empty test batch can finish immediately. Protection must then release so this
 // rule cannot freeze ordinary pile physics outside an incoming-garbage event.
 expect(garbageBatchDone(g)===true,"empty garbage batch did not finish in regression fixture");
 expect(window.__hexGarbageImpactPinState(g)===null,"garbage impact pins survived batch completion");
 const movedAfter=settlePass(g.board,false);
 expect(movedAfter===true,"original pile stayed permanently frozen after garbage batch");
}

console.log("pre-existing pile ignores all garbage impact PASS");
`;

vm.runInNewContext(runtime+checks,{
 React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},
 ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
 Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date
},{timeout:120000});
