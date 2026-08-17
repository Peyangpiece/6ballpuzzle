const fs=require("fs"),vm=require("vm");
const names=["app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js","app-07.js","app-08.js","app-09.js","app-10.js","app-14.js","app-17.js"];
const runtime=names.map(n=>fs.readFileSync(`${__dirname}/../public/${n}`,"utf8")).join("\n");
const code=String.raw`
function addFlatBase(g,height,seed){let id=500000+seed*100;for(let y=ROWS-height;y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y)){const b={id:id++,c:(x+y+seed)%COLORS.length,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0,rigid:false};g.board[y][x]=b;setVis(g,b,x,y,0);}}
const g=createEngine(7002);addFlatBase(g,2,7002);g.garbShapes=["STRAIGHT"];prepareGarbageBatch(g);const p=g.garbagePlans[0];let last=-1;
for(let frame=0;frame<600&&!p.landed;frame++){
 updateGarbagePacks(g,PHYSICS_FRAME);updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);
 if(p.landedCount!==last){last=p.landedCount;console.log("release",JSON.stringify({frame,t:frame/120,count:p.landedCount,remaining:p.pat,entries:p.entryBalls,y:p.y}));}
}
const probes=(p.pat||[]).map((slot,i)=>{const cy=hexGarbageBallContactY(g,p,i),vy=cy+slot[1],cell=hexGarbageSingleLogicalCell(g,p.ax+slot[0],vy);return{slot,contactAnchor:cy,visualY:vy,cell};});
console.log("straight contact diagnostic",JSON.stringify({landed:p.landed,count:p.landedCount,remaining:p.pat,entries:p.entryBalls,y:p.y,bubbleT:p.bubbleT,probes}));
if(!p.landed)throw new Error("STRAIGHT individual contacts did not finish");
`;
vm.runInNewContext(runtime+code,{React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date},{timeout:120000});
