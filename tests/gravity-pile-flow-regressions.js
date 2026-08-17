const fs=require("fs");
const vm=require("vm");

const names=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js",
  "app-07.js","app-08.js","app-09.js","app-10.js","app-14.js","app-17.js",
  "app-18.js","app-19.js","app-20.js","app-21.js"
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

console.log('gravity pile flow regressions PASS');
`;

const context={
  React:{useRef(){},useEffect(){},useState(){},useCallback(){}},
  window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date
};
vm.runInNewContext(runtime+assertions,context,{timeout:120000});
