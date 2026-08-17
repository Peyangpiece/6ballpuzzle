const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../public/index.html','utf8');
const names=[...html.matchAll(/\"(app-\d+\.js)\"/g)].map(m=>m[1]);
const runtime=names.map(n=>fs.readFileSync(__dirname+'/../public/'+n,'utf8')).join('\n');
const probe=String.raw`
function snap(g,frame,stage){
 const balls=[];
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const q=valid(x,y)?g.board[y][x]:null,v=q&&g.vis.get(q.id),r=q?._hexGarbageRelax;
  if(q?.isGarbage&&v)balls.push({id:q.id,logical:[x,y],visual:[v.x,v.y],r:r?{px:r.px,py:r.py,vx:r.vx,vy:r.vy,homePx:r.homePx,homePy:r.homePy,groupKey:r.groupKey,groupFrozen:!!r.groupFrozen,stableT:r.stableT,age:r.age}:null});
 }
 let best=null;
 for(let i=0;i<balls.length;i++)for(let j=i+1;j<balls.length;j++){
  const a=balls[i],b=balls[j],d=hexPhysDist(a.visual[0],a.visual[1],b.visual[0],b.visual[1]);
  if(!best||d<best.d)best={d,a,b};
 }
 return{frame,stage,best,count:balls.length};
}
const g=createEngine(87);g.garbShapes=['STRAIGHT'];prepareGarbageBatch(g);
let prev=null,found=null;
for(let frame=0;frame<600&&!found;frame++){
 const before=snap(g,frame,'before');
 updateGarbagePacks(g,PHYSICS_FRAME);
 const afterPacks=snap(g,frame,'afterPacks');
 updateVisuals(g,PHYSICS_FRAME);
 const afterVisual=snap(g,frame,'afterVisual');
 resolveVisualContacts(g);
 const afterResolve=snap(g,frame,'afterResolve');
 const stages=[before,afterPacks,afterVisual,afterResolve];
 for(const s of stages){if(s.best&&s.best.d<HEX_MIN_DIST-1e-9){found={prev,stages,threshold:HEX_MIN_DIST};break;}}
 prev=afterResolve;
}
console.log('G87_STAGE '+JSON.stringify(found||{ok:true,threshold:HEX_MIN_DIST}));
`;
vm.runInNewContext(runtime+probe,{React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date},{timeout:120000});
