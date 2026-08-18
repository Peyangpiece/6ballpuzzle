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

// Static support: adjacent diagonal lattice motion must use the 60-degree
// contact arc, never the straight chord between the two lattice centres.
{
 const g=createEngine(98001);
 const support=put(g,7,4,0);
 const moving=put(g,6,5,1);
 const v=g.vis.get(moving.id);v.x=5;v.y=4;
 const seg={from:[5,4],to:[6,5],pivot:null,topPivot:null,followSupportIds:[],movingSupportId:0,pileFlow:true,pileFlowStart:0,pileFlowDuration:.2,pileFlowEnd:.2};
 window.__hexBindPileArcSegment(g,moving,seg);
 expect(Array.isArray(seg.pivot)&&seg.pivot[0]===7&&seg.pivot[1]===4,"static support pivot not recovered: "+JSON.stringify(seg));
 expect(seg.movingSupportId===support.id&&seg.followSupportIds.includes(support.id),"static support id not bound");
 const mid=pileFlowPointForBall(g,moving,seg,.5,.1);
 const sp=[7,4];
 expect(near(pd(mid,sp),1,2e-6),"static pile arc lost one-diameter contact: "+JSON.stringify({mid,d:pd(mid,sp)}));
 const chord=[5.5,4.5];
 expect(pd(mid,chord)>.03,"pile motion collapsed back to straight chord: "+JSON.stringify({mid,chord}));
 expect(mid[1]>=4-1e-8&&mid[1]<=5+1e-8,"pile arc moved upward/outside lattice transition");
}

// Moving historical support: the support is already at its final LOGICAL cell,
// but its fallPath proves that it occupied the original pivot. The upper pile
// ball must still bind to that object and follow a moving unit-radius arc.
{
 const g=createEngine(98002);
 const support=put(g,7,6,2);
 const sv=g.vis.get(support.id);sv.x=7;sv.y=4;sv.pileFlow=true;
 support.fallPath=[{from:[7,4],to:[7,6],pivot:null,topPivot:null,pileFlow:true,pileFlowStart:0,pileFlowDuration:.2,pileFlowEnd:.2}];
 const moving=put(g,6,5,3);
 const mv=g.vis.get(moving.id);mv.x=5;mv.y=4;
 const seg={from:[5,4],to:[6,5],pivot:null,topPivot:null,followSupportIds:[],movingSupportId:0,pileFlow:true,pileFlowStart:0,pileFlowDuration:.2,pileFlowEnd:.2};
 window.__hexBindPileArcSegment(g,moving,seg);
 expect(Array.isArray(seg.pivot)&&seg.pivot[0]===7&&seg.pivot[1]===4,"historical moving pivot not recovered: "+JSON.stringify(seg));
 expect(seg.movingSupportId===support.id&&seg.followSupportIds.includes(support.id),"moving historical support id not bound");
 const mid=pileFlowPointForBall(g,moving,seg,.5,.1);
 const supportMid=pileFlowPositionAt(g,support,.1);
 expect(near(pd(mid,supportMid),1,2e-6),"moving-support arc lost one-diameter contact: "+JSON.stringify({mid,supportMid,d:pd(mid,supportMid)}));
 expect(mid[1]>=4-1e-8&&mid[1]<=5+1e-8,"moving-support pile arc moved upward");
}

// Never invent an arc without a real accumulated support ball.
{
 const g=createEngine(98003);
 const moving=put(g,6,5,1);
 const seg={from:[5,4],to:[6,5],pivot:null,topPivot:null,followSupportIds:[],movingSupportId:0};
 window.__hexBindPileArcSegment(g,moving,seg);
 expect(!seg.pivot&&!seg.movingSupportId,"virtual pile support was invented without a ball");
}

console.log("accumulated pile support-arc motion PASS");
`;

vm.runInNewContext(runtime+checks,{
 React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},
 ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
 Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date
},{timeout:120000});
