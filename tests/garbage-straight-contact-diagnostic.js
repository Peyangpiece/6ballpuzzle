const fs=require("fs"),vm=require("vm");
const names=["app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js","app-07.js","app-08.js","app-09.js","app-10.js","app-14.js","app-17.js"];
const runtime=names.map(n=>fs.readFileSync(`${__dirname}/../public/${n}`,"utf8")).join("\n");
const code=String.raw`
const types=["PYRAMID","HEXAGON","STRAIGHT"];
function addFlatBase(g,height,seed){let id=500000+seed*100;for(let y=ROWS-height;y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y)){const b={id:id++,c:(x+y+seed)%COLORS.length,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0,rigid:false};g.board[y][x]=b;setVis(g,b,x,y,0);}}
function sampleFlight(seed,type,height,dt,total){const g=createEngine(seed);addFlatBase(g,height,seed);g.garbShapes=[type];prepareGarbageBatch(g);while(g.garbageClock<total-1e-10){const h=Math.min(dt,total-g.garbageClock);updateGarbagePacks(g,h);}return{g,p:g.activeGarbagePacks[0]};}
function finishFlight(seed,type,height){const g=createEngine(seed);addFlatBase(g,height,seed);g.garbShapes=[type];prepareGarbageBatch(g);const p=g.garbagePlans[0];let frame=0,last=-1;while(frame<300&&!p.landed){updateGarbagePacks(g,PHYSICS_FRAME);updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);if(p.landedCount!==last){last=p.landedCount;console.log("finish-release",JSON.stringify({seed,type,frame,count:p.landedCount,remaining:p.pat,entries:p.entryBalls,y:p.y}));}frame++;}return{g,p,frame};}
function shapeState(){return Object.fromEntries(Object.entries(GARBAGE_SHAPES).map(([k,v])=>[k,v.map(p=>[...p])]));}
console.log("initial-shapes",JSON.stringify(shapeState()));
for(let pass=0;pass<3;pass++){
 const seed=7000+pass,type=types[pass%3],height=pass%5,total=.38+(pass%12)*.023;
 console.log("pass-start",JSON.stringify({pass,seed,type,height,total,shapes:shapeState()}));
 const slow=sampleFlight(seed,type,height,1/30,total),fast=sampleFlight(seed,type,height,1/120,total);
 console.log("after-samples",JSON.stringify({pass,slow:{pat:slow.p?.pat,y:slow.p?.y,landed:slow.p?.landed},fast:{pat:fast.p?.pat,y:fast.p?.y,landed:fast.p?.landed},shapes:shapeState()}));
 const remote=createEngine(seed+10000);remote.state="NET";const fx=remoteFxSnapshotOf(fast.g);applySnapshot(remote,snapshotOf(fast.g),fx);applyRemoteVisualState(remote,{piece:null,fx});if(fx.g.length)stepNetGarbageMotion(remote,1/60);
 console.log("after-remote",JSON.stringify({pass,fxg:fx.g,shapes:shapeState()}));
 const done=finishFlight(seed,type,height);
 console.log("finish-result",JSON.stringify({pass,landed:done.p?.landed,count:done.p?.landedCount,remaining:done.p?.pat,entries:done.p?.entryBalls,frame:done.frame,shapes:shapeState()}));
 if(!done.p?.landed)throw new Error("pass "+pass+" failed after exact prefix reproduction");
}
console.log("first-three garbage fidelity reproduction PASS");
`;
vm.runInNewContext(runtime+code,{React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date},{timeout:120000});
