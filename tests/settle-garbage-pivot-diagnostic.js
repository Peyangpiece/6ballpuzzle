const fs=require('fs');
const vm=require('vm');

const names=[
  'app-01.js','app-02.js','app-03.js','app-04.js','app-05.js','app-06.js',
  'app-07.js','app-08.js','app-09.js','app-10.js','app-14.js','app-17.js',
  'app-18.js','app-19.js','app-20.js','app-21.js','app-22.js','app-23.js','app-24.js'
];
const runtime=names.map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,'utf8')).join('\n');

const probe=String.raw`
const g=createEngine(19);g.ai={level:5,target:null,thinkT:0,actT:0};
function ballById(id){for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b?.id===id)return {b,x,y,v:g.vis.get(id)};}return null;}
function segInfo(b){const s=b?.fallPath?.[0];if(!s)return null;return {from:s.from,to:s.to,kind:s.kind,pivot:s.pivot,topPivot:s.topPivot,followSupportIds:s.followSupportIds,movingSupportId:s.movingSupportId,pileFlow:s.pileFlow,pileFlowLateGarbagePivot:s.pileFlowLateGarbagePivot,pileFlowSettledGarbagePriority:s.pileFlowSettledGarbagePriority,pileFlowInferredSupport:s.pileFlowInferredSupport,pileFlowStaticContact:s.pileFlowStaticContact,start:s.pileFlowStart,end:s.pileFlowEnd};}
function nearby(px,py,excludeId){
  const out=[];
  for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
    const b=valid(x,y)?g.board[y][x]:null;if(!b||b.id===excludeId)continue;
    const v=g.vis.get(b.id);if(!v)continue;
    const d=hexPhysDist(px,py,v.x,v.y);
    if(d<1.35)out.push({id:b.id,logical:[x,y],visual:[v.x,v.y],d,garbage:!!b.isGarbage,moving:hexGarbageBallStillMoving(b),seg:segInfo(b)});
  }
  out.sort((a,b)=>a.d-b.d);return out;
}
for(let step=0;step<=5110&&g.alive;step++){
  if(step===120*7)g.incomingShapes.push('PYRAMID');
  if(step===120*14)g.incomingShapes.push('HEXAGON');
  if(step===120*23)g.incomingShapes.push('STRAIGHT');
  if(step===120*31)g.incoming+=8;
  if(step>=5106&&step<=5110){
    const a=ballById(55),s=ballById(65);
    console.log('BEFORE',step,'phase',g.phase,'pileFlowClock',g.pileFlowClock,'mover',a&&{x:a.x,y:a.y,v:a.v&&[a.v.x,a.v.y],seg:segInfo(a.b)},'support',s&&{x:s.x,y:s.y,v:s.v&&[s.v.x,s.v.y],moving:hexGarbageBallStillMoving(s.b),path:s.b.fallPath});
    if(a){console.log('NEAR_CURRENT',step,nearby(a.v.x,a.v.y,a.b.id));const sg=a.b.fallPath?.[0];if(sg?.from)console.log('NEAR_FROM',step,sg.from,nearby(sg.from[0],sg.from[1],a.b.id));}
    if(a?.b?.fallPath?.[0]){
      const seg=a.b.fallPath[0];
      console.log('ATTACH_RESULT',step,hexGarbageAttachLateSettledPivot(g,a.b,seg),'after',segInfo(a.b));
    }
  }
  stepEngine(g,PHYSICS_FRAME);
  if(step>=5106&&step<=5110){
    const a=ballById(55),s=ballById(65);
    console.log('AFTER',step,'phase',g.phase,'pileFlowClock',g.pileFlowClock,'mover',a&&{x:a.x,y:a.y,v:a.v&&[a.v.x,a.v.y],seg:segInfo(a.b)},'support',s&&{x:s.x,y:s.y,v:s.v&&[s.v.x,s.v.y],moving:hexGarbageBallStillMoving(s.b),path:s.b.fallPath},'dist',a&&s?hexPhysDist(a.v.x,a.v.y,s.v.x,s.v.y):null);
  }
}
`;
const context={React:{useRef(){},useEffect(){},useState(){},useCallback(){}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date};
vm.runInNewContext(runtime+probe,context,{timeout:180000});
