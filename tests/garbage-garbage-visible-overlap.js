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
function put(g,x,y,c=0){const b=mkBall(g,c);g.board[y][x]=b;setVis(g,b,x,y,0);return b;}
function dist(a,b){return Math.hypot((a.x-b.x)*.5,(a.y-b.y)*HEX_ROW_H);}
function visibleGarbage(g,lead=0){
 const pts=[];
 const memo=lead>0?new Map():null;
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const b=valid(x,y)?g.board[y][x]:null;if(!b?.isGarbage)continue;
  const v=g.vis.get(b.id);if(!v)continue;
  let px=v.x,py=v.y;
  if(lead>0&&v.pileFlow&&Array.isArray(b.fallPath)&&b.fallPath.length){
   const p=pileFlowPositionAt(g,b,(g.pileFlowClock||0)+lead,0,null,memo);
   if(Number.isFinite(p?.[0])&&Number.isFinite(p?.[1])){px=p[0];py=Math.max(v.y,p[1]);}
  }
  pts.push({kind:"board",id:b.id,x:px,y:py});
 }
 for(const pack of g.activeGarbagePacks||[]){
  if(!pack||pack.landed||!pack._started)continue;
  for(let i=0;i<pack.pat.length;i++){
   const [dx,dy]=pack.pat[i];pts.push({kind:"pack",id:`p${pack.seq}:${i}`,x:pack.ax+dx,y:pack.y+dy});
  }
 }
 return pts;
}
function minPair(pts){
 let best={d:Infinity,a:null,b:null};
 for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){
  const d=dist(pts[i],pts[j]);if(d<best.d)best={d,a:pts[i],b:pts[j]};
 }
 return best;
}
function buildPile(g,variant){
 for(let x=0;x<W2;x++)if(valid(x,ROWS-1))put(g,x,ROWS-1,(x+variant)%5);
 if(variant===0){put(g,5,ROWS-2,1);put(g,4,ROWS-3,2);}
 if(variant===1){put(g,3,ROWS-2,1);put(g,7,ROWS-2,2);put(g,5,ROWS-4,3);}
 if(variant===2){put(g,1,ROWS-2,1);put(g,5,ROWS-2,2);put(g,9,ROWS-2,3);put(g,4,ROWS-3,4);put(g,6,ROWS-3,0);}
}

let worstActual={d:Infinity},worstRender={d:Infinity};
for(let variant=0;variant<3;variant++)for(const type of ["PYRAMID","HEXAGON","STRAIGHT"]){
 const g=createEngine(99500+variant*17+type.length);buildPile(g,variant);g.garbShapes=[type];prepareGarbageBatch(g);
 for(let frame=0;frame<1800;frame++){
  updateGarbagePacks(g,PHYSICS_FRAME);
  updateVisuals(g,PHYSICS_FRAME);
  resolveVisualContacts(g);
  window.__hexRefreshGarbagePileState(g);
  const actual=minPair(visibleGarbage(g,0));
  if(actual.d<worstActual.d)worstActual={...actual,variant,type,frame};
  const render=minPair(visibleGarbage(g,PHYSICS_FRAME));
  if(render.d<worstRender.d)worstRender={...render,variant,type,frame};
  expect(actual.d>=HEX_MIN_DIST-5e-4,"garbage actual overlap: "+JSON.stringify({variant,type,frame,...actual}));
  expect(render.d>=HEX_MIN_DIST-5e-4,"garbage render-lead overlap: "+JSON.stringify({variant,type,frame,...render}));
  if(garbageBatchDone(g))break;
 }
}
console.log("garbage-to-garbage visible overlap guard PASS",JSON.stringify({actual:worstActual,render:worstRender}));
`;

vm.runInNewContext(runtime+checks,{
 React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},
 ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
 Image:function(){this.complete=false;this.naturalWidth=0;},
 Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date
},{timeout:120000});
