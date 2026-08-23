const fs=require("fs");
const vm=require("vm");
const read=name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8");

const base=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js",
  "app-07.js","app-pile-arc.js","app-clear-gap-collapse.js","app-floor-gap-invariant.js",
  "app-clear-vacancy-priority.js","app-release-parity-settle.js","app-08.js","app-09.js",
  "app-10.js","app-14.js","app-clear-all-ball-fx.js","app-gameover-garbage-fade.js",
  "app-17.js","app-garbage-normal-physics.js","app-garbage-presentation.js",
  "app-garbage-zero-rigidity.js","app-garbage-deep-settle.js","app-garbage-simultaneous-motion.js"
];

const layers=[
  "app-garbage-render-overlap-guard.js",
  "app-runtime-performance.js",
  "app-physics-safety-invariants.js",
  "app-mass-motion-safety.js",
  "app-gravity-priority-v1.js",
  "app-garbage-performance-v1.js",
  "app-post-clear-two-stage-v1.js",
  "app-simultaneous-collapse-v1.js",
  "app-garbage-continuous-v1.js",
  "app-contact-separation-v1.js",
  "app-floor-bridge-collapse-v1.js",
  "app-lattice-finalize-v2.js",
  "app-coherent-collapse-v1.js",
  "app-wall-boundary-authoritative-v1.js",
  "app-slope-upconvex-authoritative-v3.js",
  "app-intentional-hexagon-stability-v1.js",
  "app-rigidity-resolver-authoritative-v3.js",
  "app-upconvex-contact-priority-v1.js",
  "app-upconvex-pocket-capture-v1.js",
  "app-upconvex-rigid-until-contact-v1.js",
  "app-collapse-timing-authoritative-v2.js",
  "app-runtime-performance-v3.js"
];

const probe=String.raw`
function put(g,x,y,c=0){if(!valid(x,y)||g.board[y][x])return null;const b=mkBall(g,c);g.board[y][x]=b;noteBoardCell(g.board,y,b);setVis(g,b,x,y,0);return b;}
function entries(g){const a=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b)a.push({b,x,y,v:g.vis.get(b.id)});}return a;}
const g=createEngine(991001);g.state="RESOLVING";g.phase="GARBAGE";g.garbDone=true;
for(let x=0;x<W2;x++)if(valid(x,ROWS-1))put(g,x,ROWS-1,x%5);
put(g,3,ROWS-2,1);put(g,7,ROWS-2,2);put(g,5,ROWS-4,3);
const original=entries(g).map(q=>({id:q.b.id,x:q.x,y:q.y,vx:q.v.x,vy:q.v.y}));
g.garbShapes=["PYRAMID"];g.garbLeft=0;prepareGarbageBatch(g);
const frozenBefore=original.every(o=>{const q=entries(g).find(z=>z.b.id===o.id);return q&&q.x===o.x&&q.y===o.y&&q.b.garbagePhaseFrozen===true;});
updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);updateGarbagePacks(g,PHYSICS_FRAME);
const moved=[];
for(const o of original){const q=entries(g).find(z=>z.b.id===o.id);if(!q||q.x!==o.x||q.y!==o.y||Math.abs(q.v.x-o.vx)>1e-7||Math.abs(q.v.y-o.vy)>1e-7)moved.push({id:o.id,from:[o.x,o.y],to:q&&[q.x,q.y],visual:q&&[q.v.x,q.v.y],frozen:q&&!!q.b.garbagePhaseFrozen});}
globalThis.__freezeProbe={frozenBefore,moved};
`;

function context(){return{
  React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f},createElement(){}},
  ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
  Image:function(){this.complete=false;this.naturalWidth=0;},Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date,
  setTimeout(){return 0},clearTimeout(){},performance:{now(){return 0}},localStorage:{getItem(){return null},setItem(){}},
  document:{getElementById(){return null}},ResizeObserver:function(){this.observe=()=>{};this.disconnect=()=>{};}
};}

const reports=[];
for(let n=0;n<=layers.length;n++){
  const files=base.concat(layers.slice(0,n));
  const ctx=context();
  try{
    vm.runInNewContext(files.map(read).join("\n")+probe,ctx,{timeout:120000});
    reports.push({through:n?layers[n-1]:"BASE",ok:ctx.__freezeProbe.frozenBefore&&ctx.__freezeProbe.moved.length===0,probe:ctx.__freezeProbe});
  }catch(error){
    reports.push({through:n?layers[n-1]:"BASE",ok:false,error:String(error&&error.stack||error)});
  }
}
console.log(JSON.stringify(reports,null,2));
const first=reports.find(r=>!r.ok);
if(first)throw new Error("first production layer breaking garbage freeze: "+first.through+" "+JSON.stringify(first.probe||first.error));
console.log("garbage production freeze layer bisect PASS");
