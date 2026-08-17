const fs=require("fs");
const vm=require("vm");

const html=fs.readFileSync(`${__dirname}/../public/index.html`,"utf8");
const names=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const runtime=names.map(n=>fs.readFileSync(`${__dirname}/../public/${n}`,"utf8")).join("\n");
const probe=String.raw`
function addFlatBase(g,height,seed){
 let id=500000+seed*100;
 for(let y=ROWS-height;y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y)){
  const ball={id:id++,c:(x+y+seed)%COLORS.length,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0,rigid:false};
  g.board[y][x]=ball;setVis(g,ball,x,y,0);
 }
}
const seed=7008,type="STRAIGHT",height=3;
const g=createEngine(seed);addFlatBase(g,height,seed);g.garbShapes=[type];prepareGarbageBatch(g);
const p=g.garbagePlans[0];
let firstRelease=null,elapsed=0;
while(elapsed<2.5){
  const before=p.landedCount||0;
  updateGarbagePacks(g,PHYSICS_FRAME);
  if(!firstRelease&&(p.landedCount||0)>before){
    firstRelease={clock:g.garbageClock,landedCount:p.landedCount,remaining:p.pat.length,anchor:p._hexWholeReleaseAnchorY,siblings:[...(p._hexWholeReleaseSiblingIds||[])],entries:(p.entryBalls||[]).map(e=>({...e}))};
  }
  updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);
  elapsed+=PHYSICS_FRAME;
  if(p.landed)break;
}
const remaining=p.pat.map((slot,i)=>{
 const x=p.ax+slot[0],y=(p._hexWholeReleaseAnchorY??p.y)+slot[1];
 return{index:i,slot:[...slot],exact:[x,y],reserved:hexGarbageContactPointReserved(g,x,y),cell:hexGarbageSingleLogicalCell(g,x,y)};
});
const boardGarbage=[];
for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
 const b=valid(x,y)?g.board[y][x]:null;if(!b?.isGarbage)continue;
 const v=g.vis.get(b.id);boardGarbage.push({id:b.id,logical:[x,y],visual:v?[v.x,v.y]:null,path:b.fallPath?.length||0});
}
console.log("STRAIGHT_PASS8_DIAGNOSTIC "+JSON.stringify({elapsed,clock:g.garbageClock,landed:p.landed,landedCount:p.landedCount,total:p.totalBalls,remainingCount:p.pat.length,anchor:p._hexWholeReleaseAnchorY,firstRelease,siblingIds:[...(p._hexWholeReleaseSiblingIds||[])],remaining,boardGarbage}));
`;
vm.runInNewContext(runtime+probe,{
 React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},
 ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date
},{timeout:120000});
