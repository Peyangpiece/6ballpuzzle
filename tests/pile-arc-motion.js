const fs=require("fs");
const vm=require("vm");

const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js","app-07.js","app-pile-arc.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function near(a,b,e=1e-6){return Math.abs(a-b)<=e;}
function put(g,x,y,c=0){
 const b=mkBall(g,c);g.board[y][x]=b;setVis(g,b,x,y,0);return b;
}
function pd(a,b){return Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*HEX_ROW_H);}

// A settled pile member loses its circular rail. Its vertical component is
// gravity-driven and any lateral component occurs only while it descends.
{
 const g=createEngine(98001);
 const support=put(g,7,4,0);
 const moving=put(g,6,5,1);
 const v=g.vis.get(moving.id);v.x=5;v.y=4;
 const seg={from:[5,4],to:[6,5],pivot:[7,4],topPivot:null,followSupportIds:[support.id],movingSupportId:support.id,pileFlow:true,pileFlowStart:0,pileFlowDuration:.2,pileFlowEnd:.2};
 window.__hexBindPileGravitySegment(g,moving,seg);
 expect(seg.pileGravityFall===true,"settled pile gravity marker missing");
 expect(!seg.pivot&&!seg.topPivot&&!seg.movingSupportId&&!seg.followSupportIds.length,"settled pile retained an arc/support rail");
 let prev=pileFlowPointForBall(g,moving,seg,0,0),radiusMin=Infinity,radiusMax=0;
 for(let i=1;i<=40;i++){
  const q=i/40,p=pileFlowPointForBall(g,moving,seg,q,q*.2);
  expect(p[1]>prev[1],"pile had a horizontal-only or non-downward interval: "+JSON.stringify({prev,p}));
  expect(p[0]>=prev[0]-1e-10,"pile lateral component reversed");
  const d=pd(p,[7,4]);radiusMin=Math.min(radiusMin,d);radiusMax=Math.max(radiusMax,d);
  expect(d>=1-2e-5,"gravity path crossed its former support: "+d);
  prev=p;
 }
 expect(radiusMax-radiusMin>.01,"pile still followed a constant-radius circle");
 expect(near(prev[0],6)&&near(prev[1],5),"gravity path missed its logical destination");
}

// A lower-side support uses an early lateral separation, still with strictly
// increasing y and without a constant-radius arc.
{
 const g=createEngine(98002);
 const support=put(g,4,5,2);
 const moving=put(g,6,5,3);
 const mv=g.vis.get(moving.id);mv.x=5;mv.y=4;
 const seg={from:[5,4],to:[6,5],pivot:[4,5],topPivot:null,followSupportIds:[support.id],movingSupportId:support.id,pileFlow:true,pileFlowStart:0,pileFlowDuration:.2,pileFlowEnd:.2};
 window.__hexBindPileGravitySegment(g,moving,seg);
 expect(seg.pileGravityLateralMode==="early","lower support did not select gravity separation");
 let prev=pileFlowPointForBall(g,moving,seg,0,0),varied=false;
 for(let i=1;i<=40;i++){
  const q=i/40,p=pileFlowPointForBall(g,moving,seg,q,q*.2),d=pd(p,[4,5]);
  expect(p[1]>prev[1],"lower-support path contained a horizontal-only interval");
  expect(d>=1-2e-5,"lower-support gravity path overlapped: "+d);
  if(Math.abs(d-1)>.01)varied=true;
  prev=p;
 }
 expect(varied,"lower-support pile still used a circular arc");
}

// Straight down is timed from the gravity equation and never changes x.
{
 const g=createEngine(98003);
 const moving=put(g,6,5,1);
 const seg={from:[6,3],to:[6,5],pivot:null,topPivot:null,followSupportIds:[],movingSupportId:0};
 window.__hexBindPileGravitySegment(g,moving,seg);
 const state={vy:0,speed:0},duration=pileFlowNominalDuration(seg,state);
 expect(duration>0&&state.vy>RELEASE_INITIAL_VY,"gravity did not accelerate the falling pile ball");
 const a=pileFlowPoint(seg,.25),b=pileFlowPoint(seg,.5),c=pileFlowPoint(seg,.75);
 expect(a[0]===6&&b[0]===6&&c[0]===6,"vertical pile fall moved sideways");
 expect(a[1]<b[1]&&b[1]<c[1],"vertical gravity path was not monotonic");
}

console.log("accumulated pile gravity/no-horizontal motion PASS");
`;

vm.runInNewContext(runtime+checks,{
 React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},
 ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
 Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date
},{timeout:120000});
