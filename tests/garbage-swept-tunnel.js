const fs=require("fs");
const vm=require("vm");

const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js",
  "app-07.js","app-08.js","app-09.js","app-10.js","app-14.js","app-17.js",
  "app-garbage-contact.js","app-garbage-rigidity.js","app-garbage-settle-state.js",
  "app-garbage-sweep-guard.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function put(g,x,y,c,isGarbage=false){
 const b=mkBall(g,c);b.isGarbage=isGarbage;g.board[y][x]=b;setVis(g,b,x,y,0);return b;
}

// A scheduled garbage path whose endpoints are both clear must still stop at a
// stationary accumulated ball if the swept interval crosses its circle.
{
 const g=createEngine(97001);
 const pile=put(g,5,6,0,false);
 const garbage=put(g,5,8,1,true);
 garbage.garbagePileSettled=false;
 const v=g.vis.get(garbage.id);v.x=5;v.y=4;v.pileFlow=true;
 garbage.fallPath=[{
   from:[5,4],to:[5,8],kind:"TEST_SWEEP_THROUGH_PILE",pileFlow:true,
   pileFlowEntry:false,pileFlowStart:0,pileFlowDuration:.1,pileFlowEnd:.1
 }];
 g.pileFlowClock=.08;
 updateScheduledPileFlowVisual(g,garbage,v,.08,new Map());
 const pv=g.vis.get(pile.id);
 const d=hexPhysDist(v.x,v.y,pv.x,pv.y);
 expect(d>=HEX_MIN_DIST-5e-5,"garbage swept through stationary pile: "+JSON.stringify({d,v,pile:pv,path:garbage.fallPath}));
 expect(Array.isArray(garbage.fallPath)&&garbage.fallPath.length===1,"blocked sweep incorrectly consumed its path");
 expect(v.y<6,"blocked garbage ended below the obstacle centre");
}

// A legitimate DOWNWARD tangent arc around a pile ball must remain free to
// move. This is the reference slide: upper-left contact -> left side ->
// lower-left contact, never requiring the garbage ball to rebound upward.
{
 const g=createEngine(97002);
 const support=put(g,5,6,2,false);
 const garbage=put(g,4,7,3,true);
 garbage.garbagePileSettled=false;
 const v=g.vis.get(garbage.id);v.x=4;v.y=5;v.pileFlow=true;
 garbage.fallPath=[{
   from:[4,5],to:[4,7],pivot:[5,6],kind:"TEST_TANGENT_ARC",pileFlow:true,
   pileFlowEntry:false,pileFlowStart:0,pileFlowDuration:.2,pileFlowEnd:.2
 }];
 g.pileFlowClock=.1;
 const before=[v.x,v.y];
 updateScheduledPileFlowVisual(g,garbage,v,.1,new Map());
 const sv=g.vis.get(support.id),d=hexPhysDist(v.x,v.y,sv.x,sv.y);
 expect(Math.hypot(v.x-before[0],v.y-before[1])>.01,"valid tangent arc was falsely frozen");
 expect(v.y>=before[1]-1e-9,"valid tangent arc moved upward");
 expect(Math.abs(d-1)<2e-4,"tangent arc lost surface contact: "+JSON.stringify({d,v,sv}));
}

console.log("garbage swept pile-tunnel guard PASS");
`;

vm.runInNewContext(runtime+checks,{
 React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},
 ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
 Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date
},{timeout:120000});
