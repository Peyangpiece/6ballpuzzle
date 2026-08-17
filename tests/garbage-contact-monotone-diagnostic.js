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
function mapEntries(m){return m instanceof Map?[...m.entries()].map(([k,v])=>[k,v&&{...v}]):null;}
const seed=7008,type="STRAIGHT",height=3;
const g=createEngine(seed);addFlatBase(g,height,seed);g.garbShapes=[type];prepareGarbageBatch(g);
const p=g.garbagePlans[0];
let firstRelease=null,elapsed=0,preflight=null;
while(elapsed<2.5){
  const before=p.landedCount||0;
  const beforePat=p.pat.map(v=>[...v]);
  // Capture the exact first-contact preflight before updateGarbagePacks mutates the packet.
  if(!preflight&&p._started&&p.bubbleT>=HEX_GARBAGE_BUBBLE_DURATION&&p.pat.length){
    const first=hexGarbageFirstRealContactAnchor(g,p);
    const flightAge=Math.max(0,p.bubbleT-HEX_GARBAGE_BUBBLE_DURATION);
    const desiredY=GARBAGE_START_Y+(HEX_GARBAGE_FLIGHT_V0*flightAge+.5*GRAV*flightAge*flightAge)/HEX_ROW_H;
    if(Number.isFinite(first)&&desiredY+HEX_GARBAGE_CONTACT_EPS>=first){
      const candidateRows=p.pat.map(([dx,dy],i)=>{
        const x=p.ax+dx,visualY=first+dy;
        return{i,slot:[dx,dy],exact:[x,visualY],candidates:hexGarbageWholeReleaseCandidates(g,x,visualY)};
      });
      const plan=hexGarbageBuildWholeReleaseCellPlan(g,p,first);
      preflight={clock:g.garbageClock,desiredY,first,candidateRows,plan:mapEntries(plan)};
    }
  }
  updateGarbagePacks(g,PHYSICS_FRAME);
  if(!firstRelease&&(p.landedCount||0)>before){
    const planMap=p._hexWholeReleaseCellPlan;
    firstRelease={
      clock:g.garbageClock,beforePat,landedCount:p.landedCount,remaining:p.pat.length,
      anchor:p._hexWholeReleaseAnchorY,siblings:[...(p._hexWholeReleaseSiblingIds||[])],
      persistedPlan:mapEntries(planMap),entries:(p.entryBalls||[]).map(e=>({...e}))
    };
  }
  updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);
  elapsed+=PHYSICS_FRAME;
  if(p.landed)break;
}
const remaining=p.pat.map((slot,i)=>{
 const x=p.ax+slot[0],y=(p._hexWholeReleaseAnchorY??p.y)+slot[1];
 const key=hexGarbageWholeReleaseContactKey(x,y);
 const planned=p._hexWholeReleaseCellPlan instanceof Map?p._hexWholeReleaseCellPlan.get(key):null;
 const occupant=planned&&valid(planned.x,planned.y)?g.board[planned.y][planned.x]:null;
 return{index:i,slot:[...slot],key,exact:[x,y],planned:planned?{...planned}:null,plannedOccupant:occupant?{id:occupant.id,isGarbage:!!occupant.isGarbage}:null,reserved:hexGarbageContactPointReserved(g,x,y),cell:hexGarbageSingleLogicalCell(g,x,y)};
});
const boardGarbage=[];
for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
 const b=valid(x,y)?g.board[y][x]:null;if(!b?.isGarbage)continue;
 const v=g.vis.get(b.id);boardGarbage.push({id:b.id,logical:[x,y],visual:v?[v.x,v.y]:null,path:b.fallPath?.length||0});
}
console.log("STRAIGHT_PASS8_DIAGNOSTIC "+JSON.stringify({elapsed,clock:g.garbageClock,landed:p.landed,landedCount:p.landedCount,total:p.totalBalls,remainingCount:p.pat.length,anchor:p._hexWholeReleaseAnchorY,preflight,firstRelease,siblingIds:[...(p._hexWholeReleaseSiblingIds||[])],persistedPlan:mapEntries(p._hexWholeReleaseCellPlan),remaining,boardGarbage}));
`;
vm.runInNewContext(runtime+probe,{
 React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},
 ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date
},{timeout:120000});
