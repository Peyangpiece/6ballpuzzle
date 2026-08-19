const fs=require("fs");
const vm=require("vm");

const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js","app-07.js",
  "app-pile-arc.js","app-08.js","app-09.js","app-10.js","app-14.js","app-gameover-garbage-fade.js","app-17.js",
  "app-garbage-normal-physics.js","app-garbage-presentation.js","app-garbage-zero-rigidity.js",
  "app-garbage-deep-settle.js","app-garbage-simultaneous-motion.js","app-garbage-render-overlap-guard.js",
  "app-pileflow-visual-tangency.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function put(g,x,y,c=0){const b=mkBall(g,c);g.board[y][x]=b;noteBoardCell(g.board,y,b);setVis(g,b,x,y,0);return b;}
function locate(g,id){for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b?.id===id)return{x,y,b,v:g.vis.get(id)};}return null;}
function phys(a,b){return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);}
function stableBase(g,height,seed){
  for(let y=ROWS-height;y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y))put(g,x,y,(x+y+seed)%COLORS.length);
}

expect(window.__hexGarbageUsesNormalPhysics===true,"production ordinary-garbage adapter missing");
expect(window.__hexGarbageAirbornePacketsDisabled===true,"legacy airborne garbage packets are active");

const types=["PYRAMID","HEXAGON","STRAIGHT"],passes=[];
for(let pass=0;pass<100;pass++){
  const seed=7000+pass,type=types[pass%types.length],height=pass%5;
  const g=createEngine(seed);g.state="RESOLVING";g.phase="GARBAGE";g.garbDone=true;
  stableBase(g,height,seed);g.garbShapes=[type];g.garbLeft=0;
  const original=[];
  for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
    const b=valid(x,y)?g.board[y][x]:null;if(!b)continue;const v=g.vis.get(b.id);original.push({id:b.id,x,y,vx:v.x,vy:v.y});
  }
  prepareGarbageBatch(g);
  expect(g.activeGarbagePacks.length===0,"pass "+pass+": legacy airborne packet appeared");
  expect(g.garbagePlans.length===1&&g.garbagePlans[0].type===type,"pass "+pass+": planned shape changed");

  let doneFrame=-1,maxSpawned=0,minDistance=Infinity,moved=false;
  const last=new Map();
  for(let frame=0;frame<1200;frame++){
    updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);updateGarbagePacks(g,PHYSICS_FRAME);
    expect(g.activeGarbagePacks.length===0,"pass "+pass+": airborne packet reappeared");
    for(const q of original){
      const z=locate(g,q.id);expect(z,"pass "+pass+": existing pile ball disappeared");
      expect(z.x===q.x&&z.y===q.y,"pass "+pass+": frozen pile logical cell moved");
      expect(Math.abs(z.v.x-q.vx)<1e-7&&Math.abs(z.v.y-q.vy)<1e-7,"pass "+pass+": frozen pile visual moved");
    }
    const gar=[];
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
      const b=valid(x,y)?g.board[y][x]:null;if(!b?.isGarbage)continue;const v=g.vis.get(b.id);gar.push({b,v,x,y});
      expect(!b.rigid&&!b.motionGroupId,"pass "+pass+": incoming garbage retained rigidity");
      const prior=last.get(b.id);if(prior&&phys(prior,[v.x,v.y])>1e-5)moved=true;last.set(b.id,[v.x,v.y]);
    }
    maxSpawned=Math.max(maxSpawned,gar.length);
    for(let i=0;i<gar.length;i++)for(let j=i+1;j<gar.length;j++){
      const d=phys([gar[i].v.x,gar[i].v.y],[gar[j].v.x,gar[j].v.y]);minDistance=Math.min(minDistance,d);
      expect(d>=HEX_MIN_DIST-8e-4,"pass "+pass+": garbage visual overlap "+d);
    }
    if(garbageBatchDone(g)){doneFrame=frame;break;}
  }
  expect(doneFrame>=0,"pass "+pass+": ordinary garbage batch did not finish");
  expect(doneFrame<1200,"pass "+pass+": garbage exceeded completion envelope");
  expect(maxSpawned===GARBAGE_SHAPES[type].length,"pass "+pass+": spawned ball count differs from shape");
  expect(moved,"pass "+pass+": incoming balls never moved through ordinary fallPath");
  finishGarbageVisuals(g);
  for(const q of original){const z=locate(g,q.id);expect(z&&!z.b.garbagePhaseFrozen,"pass "+pass+": pile remained frozen after completion");}
  expect(pendingFallPathCount(g)===0,"pass "+pass+": pending fallPath remained");
  passes.push({pass,type,height,doneFrame,minDistance});
}
globalThis.productionGarbagePasses=passes;
console.log("production ordinary-garbage fidelity 100/100 PASS",JSON.stringify({maxFrame:Math.max(...passes.map(p=>p.doneFrame))}));
`;

const context={
 React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f},createElement(){}},
 ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
 Image:function(){this.complete=false;this.naturalWidth=0;},Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date,
 setTimeout(){return 0},clearTimeout(){},performance:{now(){return 0}},localStorage:{getItem(){return null},setItem(){}},
 document:{getElementById(){return null}},ResizeObserver:function(){this.observe=()=>{};this.disconnect=()=>{};}
};
vm.runInNewContext(runtime+checks,context,{timeout:240000});
if(context.productionGarbagePasses.length!==100)throw new Error("production garbage fidelity count changed");
