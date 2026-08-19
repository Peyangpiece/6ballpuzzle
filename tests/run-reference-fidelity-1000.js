const fs=require("fs");
const path=require("path");
const cp=require("child_process");

const sourcePath=path.join(__dirname,"reference-fidelity-1000.js");
const tmpPath=path.join(__dirname,".reference-fidelity-1000-current-garbage.js");
let source=fs.readFileSync(sourcePath,"utf8");

// Preserve all 820 non-garbage capture-reference checks exactly as authored.
// The historical 180 garbage checks describe the retired airborne-packet model,
// while production now intentionally uses ordinary board-ball physics. Replace
// only that obsolete segment with 180 equally-counted checks against the actual
// production garbage stack; total allocation remains exactly 1000.
const garbageStart='// 601-780: garbage bubble, packet fall, contact and opponent interpolation.';
const formationStart='// 781-900: formations, attack amounts, effects and loss timing.';
const a=source.indexOf(garbageStart),b=source.indexOf(formationStart);
if(a<0||b<0||b<=a)throw new Error('reference-fidelity-1000 garbage block changed; update runner explicitly');
source=source.slice(0,a)+source.slice(b);

const prodFiles=[
  'app-pile-arc.js','app-gameover-garbage-fade.js','app-garbage-normal-physics.js',
  'app-garbage-presentation.js','app-garbage-zero-rigidity.js','app-garbage-deep-settle.js',
  'app-garbage-simultaneous-motion.js','app-garbage-render-overlap-guard.js',
  'app-pileflow-visual-tangency.js'
];
const prodRuntime=prodFiles.map(name=>fs.readFileSync(path.join(__dirname,'../public',name),'utf8')).join('\n');
const prodRuntimeB64=Buffer.from(prodRuntime,'utf8').toString('base64');
const anchor='expect(results.length===1000,"expected 1000 passes, got "+results.length);';
if(!source.includes(anchor))throw new Error('reference-fidelity-1000 final assertion changed; update runner explicitly');
const contextNeedle='window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date';
if(!source.includes(contextNeedle))throw new Error('reference-fidelity-1000 context changed; update runner explicitly');
source=source.replace(contextNeedle,'window:{},navigator:{},console,Buffer,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date');

const productionGarbageBlock=String.raw`
// Modern 601-780: production ordinary-garbage physics, same 180-pass budget.
eval(Buffer.from("__PROD_RUNTIME_B64__","base64").toString("utf8"));
for(let i=0;i<180;i++)pass("garbage",i,()=>{
 const type=["PYRAMID","HEXAGON","STRAIGHT"][i%3],height=i%5,seed=40000+i;
 const g=createEngine(seed);flatBase(g,height,seed);g.state="RESOLVING";g.phase="GARBAGE";g.garbDone=true;g.garbShapes=[type];g.garbLeft=0;
 const original=[];
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const q=valid(x,y)?g.board[y][x]:null;if(!q)continue;const v=g.vis.get(q.id);original.push({id:q.id,x,y,vx:v.x,vy:v.y});
 }
 prepareGarbageBatch(g);
 expect(window.__hexGarbageUsesNormalPhysics===true&&window.__hexGarbageAirbornePacketsDisabled===true,"garbage "+i+": production ordinary-physics adapter missing");
 expect(g.activeGarbagePacks.length===0,"garbage "+i+": retired airborne packet model reappeared");
 let done=-1,spawned=0,moved=false;const last=new Map();
 for(let frame=0;frame<1200;frame++){
  updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);updateGarbagePacks(g,PHYSICS_FRAME);
  for(const o of original){
   let z=null;for(let yy=boardScanMin(g.board);yy<ROWS&&!z;yy++)for(let xx=0;xx<W2;xx++){const q=valid(xx,yy)?g.board[yy][xx]:null;if(q?.id===o.id){z={x:xx,y:yy,v:g.vis.get(q.id)};break;}}
   expect(z&&z.x===o.x&&z.y===o.y,"garbage "+i+": frozen existing pile moved logically");
   expect(close(z.v.x,o.vx,1e-6)&&close(z.v.y,o.vy,1e-6),"garbage "+i+": frozen existing pile moved visually");
  }
  const gs=[];
  for(let yy=boardScanMin(g.board);yy<ROWS;yy++)for(let xx=0;xx<W2;xx++){
   const q=valid(xx,yy)?g.board[yy][xx]:null;if(!q?.isGarbage)continue;const v=g.vis.get(q.id);gs.push({q,v});
   expect(!q.rigid&&!q.motionGroupId,"garbage "+i+": incoming ball retained rigidity");
   const p=last.get(q.id);if(p&&dist(p[0],p[1],v.x,v.y)>1e-5)moved=true;last.set(q.id,[v.x,v.y]);
  }
  spawned=Math.max(spawned,gs.length);
  if(garbageBatchDone(g)){done=frame;break;}
 }
 expect(done>=0&&done<1200,"garbage "+i+": production batch did not finish");
 expect(spawned===GARBAGE_SHAPES[type].length,"garbage "+i+": production shape ball count changed");
 expect(moved,"garbage "+i+": ordinary fallPath never moved");
 finishGarbageVisuals(g);
 expect(pendingFallPathCount(g)===0,"garbage "+i+": pending production fallPath remained");
});

`.replace('__PROD_RUNTIME_B64__',prodRuntimeB64);
source=source.replace(anchor,productionGarbageBlock+anchor);
fs.writeFileSync(tmpPath,source);
try{
  cp.execFileSync(process.execPath,[tmpPath],{stdio:'inherit'});
}finally{
  try{fs.unlinkSync(tmpPath);}catch{}
}
