const fs=require("fs");
const vm=require("vm");

const names=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js",
  "app-07.js","app-08.js","app-09.js","app-10.js","app-14.js","app-17.js",
  "app-18.js","app-19.js","app-20.js","app-21.js","app-22.js","app-23.js","app-24.js","app-25.js"
];
const runtime=names.map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const assertions=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function close(a,b,e=1e-7){return Math.abs(a-b)<=e;}

// Clearing accumulated balls must remove all triplet rigidity before motion.
{
  const g=createEngine(11001);
  const b={id:1,c:0,motionGroupId:77,motionGroupRole:0,motionGroupOrientation:'down',motionGroupSize:3,rigid:true};
  g.board[ROWS-1][0]=b;g.vis.set(b.id,{x:0,y:ROWS-1,vy:0,motionSpeed:0,sq:0});
  releaseSettledConstraints(g,'clear_release');
  expect(!b.rigid&&b.motionGroupId===0,'clear release retained accumulated-pile rigidity');
}

// A one-support collapse segment must remain exactly tangent to the support,
// but progress is gravity-driven rather than constant-angular-speed.
{
  const seg={from:[5,4],to:[4,5],pivot:[6,5],topPivot:null,followSupportIds:[]};
  const state={vy:0,speed:HEX_PILE_GRAVITY_MIN_SPEED};
  const duration=pileFlowNominalDuration(seg,state);
  expect(duration>0&&seg._hexGravityProfile,'gravity arc profile was not created');
  const f25=hexPileGravityFraction(seg,.25),f50=hexPileGravityFraction(seg,.5),f75=hexPileGravityFraction(seg,.75);
  expect(f25<f50&&f50<f75,'gravity arc progress is not monotonic');
  expect(f50<.5,'gravity arc did not accelerate downhill');
  for(const q of [0,.1,.25,.5,.75,.9,1]){
    const p=pileFlowPoint(seg,q);
    expect(Math.abs(pileFlowPhysicalDist(p,seg.pivot)-1)<1e-7,'gravity arc left the supporting ball at q='+q);
  }
  const end=pileFlowPoint(seg,1);
  expect(close(end[0],seg.to[0])&&close(end[1],seg.to[1]),'gravity arc missed the final lattice point');
}

// Velocity must carry into the next logical cell instead of restarting at each
// lattice boundary. This is the key anti-stutter invariant.
{
  const state={vy:0,speed:.6};
  const first={from:[5,4],to:[4,5],pivot:[6,5],topPivot:null,followSupportIds:[]};
  pileFlowNominalDuration(first,state);
  const outSpeed=state.speed;
  const second={from:[4,5],to:[3,6],pivot:[5,6],topPivot:null,followSupportIds:[]};
  pileFlowNominalDuration(second,state);
  expect(second._hexGravityEntrySpeed>=outSpeed-1e-9,'next lattice segment restarted from a lower speed');
  expect(state.speed>=second._hexGravityEntrySpeed-1e-9,'downhill gravity reduced speed unexpectedly');
}

// Unsupported downward motion uses constant gravity and still ends exactly on
// the deterministic logical destination.
{
  const seg={from:[5,2],to:[5,4],pivot:null,topPivot:null,followSupportIds:[]};
  const state={vy:0,speed:HEX_PILE_GRAVITY_MIN_SPEED};
  pileFlowNominalDuration(seg,state);
  expect(seg._hexGravityLinear,'free-fall gravity profile was not created');
  const mid=hexPileGravityFraction(seg,.5);
  expect(mid>0&&mid<.5,'free fall is not accelerating from its initial speed');
  const end=pileFlowPoint(seg,1);
  expect(close(end[0],5)&&close(end[1],4),'free fall missed the final lattice point');
}

// Reproduce the long-run SETTLE failure exactly: the segment was compiled with
// a topPivot below it before the garbage ball at [15,8] became a fixed obstacle.
// Once that garbage settles, its unit circle must override the stale topPivot.
{
  const g=createEngine(11002),support=mkBall(g,1),mover=mkBall(g,2);
  support.isGarbage=true;support.garbageType='PYRAMID';support.fallPath=[];
  g.board[8][15]=support;setVis(g,support,15,8,0);
  const seg={
    from:[13,8],to:[14,9],kind:'ROLL_RIGHT',motionSeq:0,pileFlow:true,
    pileFlowStart:0,pileFlowDuration:1,pileFlowEnd:1,pileFlowEntry:true,
    followSupportIds:[],movingSupportId:0,
    pivot:null,topPivot:[13,10],
    _hexGravityEntrySpeed:.35
  };
  mover.fallPath=[seg];g.board[9][14]=mover;setVis(g,mover,13,8,0);
  g.state='RESOLVING';g.phase='SETTLE';g.pileFlowClock=.5;
  const v=g.vis.get(mover.id);
  updateScheduledPileFlowVisual(g,mover,v,PHYSICS_FRAME);
  expect(seg.pileFlowSettledGarbagePriority===true,'settled garbage did not override stale topPivot');
  expect(seg.pivot&&seg.pivot[0]===15&&seg.pivot[1]===8,'late pivot selected the wrong garbage support');
  expect(!seg.topPivot,'stale topPivot survived fixed garbage priority');
  expect((seg.followSupportIds||[]).length===0&&!seg.movingSupportId,'stale support metadata survived fixed garbage priority');
  expect(Math.abs(pileFlowPhysicalDist([v.x,v.y],[15,8])-1)<1e-6,'late repaired motion cut through settled garbage');
}

// Future-scheduled pileFlow is absolute-time state, not a soft contact body.
// Reproduce the accumulated drift from the seed-19 failure: while the segment
// is still waiting, generic contact correction must not preserve an already
// drifted visual centre. It is restored to the scheduled start before solving.
{
  const g=createEngine(11003),support=mkBall(g,1),mover=mkBall(g,2);
  support.isGarbage=true;support.fallPath=[];
  g.board[8][15]=support;setVis(g,support,15,8,0);
  const seg={
    from:[13,8],to:[14,9],kind:'ROLL_RIGHT',motionSeq:0,pileFlow:true,
    pileFlowStart:1,pileFlowDuration:.25,pileFlowEnd:1.25,pileFlowEntry:true,
    followSupportIds:[],movingSupportId:0,pivot:[15,8],topPivot:null,
    _hexGravityEntrySpeed:.35
  };
  mover.fallPath=[seg];g.board[9][14]=mover;
  setVis(g,mover,13.406485700155958,8.391988418130824,0);
  g.state='RESOLVING';g.phase='SETTLE';g.pileFlowClock=.5;
  resolveVisualContacts(g);
  const v=g.vis.get(mover.id);
  expect(pileFlowPhysicalDist([v.x,v.y],[13,8])<1e-6,'future pileFlow waiter retained accumulated contact drift');
  expect(pileFlowPhysicalDist([v.x,v.y],[15,8])>=.999999,'future pileFlow waiter remained inside settled garbage');
}

console.log('gravity pile flow regressions PASS');
`;

const context={
  React:{useRef(){},useEffect(){},useState(){},useCallback(){}},
  window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date
};
vm.runInNewContext(runtime+assertions,context,{timeout:120000});
