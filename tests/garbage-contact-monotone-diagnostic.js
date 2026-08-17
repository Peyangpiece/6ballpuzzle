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
const seed=7008,g=createEngine(seed);addFlatBase(g,3,seed);g.garbShapes=["STRAIGHT"];prepareGarbageBatch(g);
const p=g.garbagePlans[0];
const initialAnchor=hexGarbageFirstRealContactAnchor(g,p);
const initialCandidates=p.pat.map(([dx,dy],i)=>{
 const x=p.ax+dx,y=initialAnchor+dy;
 return{i,slot:[dx,dy],exact:[x,y],candidates:hexGarbageWholeReleaseCandidates(g,x,y)};
});
const initialPlan=hexGarbageBuildWholeReleaseCellPlan(g,p,initialAnchor);
let elapsed=0,firstRelease=null;
while(elapsed<2.5){
 const before=p.landedCount||0;
 updateGarbagePacks(g,PHYSICS_FRAME);
 if(!firstRelease&&(p.landedCount||0)>before){
  firstRelease={clock:g.garbageClock,landedCount:p.landedCount,remaining:p.pat.length,anchor:p._hexWholeReleaseAnchorY,plan:mapEntries(p._hexWholeReleaseCellPlan),entries:(p.entryBalls||[]).map(e=>({...e}))};
 }
 updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);elapsed+=PHYSICS_FRAME;
 if(p.landed)break;
}
console.log("STRAIGHT_INITIAL_PLAN "+JSON.stringify({anchor:initialAnchor,candidateCounts:initialCandidates.map(q=>({i:q.i,slot:q.slot,exact:q.exact,count:q.candidates.length,candidates:q.candidates})),plan:mapEntries(initialPlan),firstRelease,final:{landed:p.landed,landedCount:p.landedCount,remaining:p.pat.map(v=>[...v])}}));
`;
vm.runInNewContext(runtime+probe,{
 React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},
 ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date
},{timeout:120000});
