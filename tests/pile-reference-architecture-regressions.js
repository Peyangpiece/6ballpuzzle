const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/../public/index.html','utf8');
const names=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const runtime=names.map(n=>fs.readFileSync(__dirname+'/../public/'+n,'utf8')).join('\n');
const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function close(a,b,e=1e-10){return Math.abs(a-b)<=e;}
function ball(id){return{id,c:id%COLORS.length,isGarbage:false,fallPath:[],motionGroupId:0,rigid:false,momentumX:0,rollDir:0,subCellBias:0};}

// Independent accumulated-pile members must begin on the SAME collapse frame.
// motionSeq records logical discovery order only and may not create visible waves.
{
 const g={pileFlowClock:.25,board:newBoard(),vis:new Map()};
 const a=ball(1),b=ball(2),c=ball(3);
 const sa={from:[3,4],to:[3,6],motionSeq:1},sb={from:[9,4],to:[9,6],motionSeq:7},sc={from:[15,4],to:[15,6],motionSeq:19};
 a.fallPath=[sa];b.fallPath=[sb];c.fallPath=[sc];
 g.vis.set(1,{x:3,y:4,vy:0,motionSpeed:0});g.vis.set(2,{x:9,y:4,vy:0,motionSpeed:0});g.vis.set(3,{x:15,y:4,vy:0,motionSpeed:0});
 const fresh=[{ball:a,seg:sa,seq:1},{ball:b,seg:sb,seq:7},{ball:c,seg:sc,seq:19}];
 scheduleFreshPileFlow(g,fresh,'clear_support_loss');
 expect(close(sa.pileFlowStart,.25)&&close(sb.pileFlowStart,.25)&&close(sc.pileFlowStart,.25),'post-clear pile still starts in staged logical waves');
 expect(sa.pileFlowReferenceConcurrent&&sb.pileFlowReferenceConcurrent&&sc.pileFlowReferenceConcurrent,'reference concurrent schedule marker missing');
}

// Only later segments of the SAME ball are sequential; another ball must not
// wait for those segments to finish.
{
 const g={pileFlowClock:.5,board:newBoard(),vis:new Map()};
 const a=ball(11),b=ball(12);
 const a1={from:[5,2],to:[5,4],motionSeq:1},a2={from:[5,4],to:[4,5],motionSeq:2,pivot:[6,5]},b1={from:[13,2],to:[13,4],motionSeq:9};
 a.fallPath=[a1,a2];b.fallPath=[b1];
 g.vis.set(11,{x:5,y:2,vy:0,motionSpeed:0});g.vis.set(12,{x:13,y:2,vy:0,motionSpeed:0});
 scheduleFreshPileFlow(g,[{ball:a,seg:a1,seq:1},{ball:a,seg:a2,seq:2},{ball:b,seg:b1,seq:9}],'clear_support_loss');
 expect(close(a1.pileFlowStart,.5)&&close(b1.pileFlowStart,.5),'independent pile member was delayed behind another ball');
 expect(close(a2.pileFlowStart,a1.pileFlowEnd,1e-9),'same-ball path is not continuous across logical cells');
}

// The final garbage/global solver may yield garbage away from an accumulated
// normal pile support, but it must not push that normal pile support itself.
{
 const g=createEngine(59001);g.state='RESOLVING';g.phase='SETTLE';g._visualMovingIds=new Set();
 const y=ROWS-1,x0=[...Array(W2).keys()].find(x=>valid(x,y)),x1=[...Array(W2).keys()].find(x=>x>x0&&valid(x,y));
 const n=ball(21),z=ball(22);z.isGarbage=true;z.garbageType='HEXAGON';z._hexGarbageContinuousRest={px:(x0+1.98)*.5,py:cellCenterYNorm(y),groupKey:'t'};
 g.board[y][x0]=n;g.board[y][x1]=z;
 g.vis.set(n.id,{x:x0,y,vy:0,motionSpeed:0});g.vis.set(z.id,{x:x0+1.98,y,vy:0,motionSpeed:0});
 const before=[g.vis.get(n.id).x,g.vis.get(n.id).y],zBefore=g.vis.get(z.id).x;
 hexEnforceFinalVisualNonOverlap(g);
 const nv=g.vis.get(n.id),zv=g.vis.get(z.id);
 expect(close(nv.x,before[0])&&close(nv.y,before[1]),'garbage final solver pushed accumulated normal pile');
 expect(zv.x>zBefore,'garbage did not yield away from fixed accumulated pile');
 expect(hexPhysDist(nv.x,nv.y,zv.x,zv.y)>=1-1.1e-7,'garbage/pile contact did not separate');
}

// Two normal pile members are NEVER given a second trajectory by the final
// garbage/global solver. Their current-frame correction belongs to app-31..35.
{
 const g=createEngine(59002);g.state='RESOLVING';g.phase='SETTLE';g._visualMovingIds=new Set();
 const y=ROWS-1,xs=[...Array(W2).keys()].filter(x=>valid(x,y));
 const a=ball(31),b=ball(32);g.board[y][xs[0]]=a;g.board[y][xs[1]]=b;
 g.vis.set(a.id,{x:xs[0],y,vy:0,motionSpeed:0});g.vis.set(b.id,{x:xs[0]+1.98,y,vy:0,motionSpeed:0});
 const beforeA=[g.vis.get(a.id).x,g.vis.get(a.id).y],beforeB=[g.vis.get(b.id).x,g.vis.get(b.id).y];
 const n=hexEnforceFinalVisualNonOverlap(g);
 expect(n===0,'final garbage/global solver still corrected normal-normal pile contact');
 expect(close(g.vis.get(a.id).x,beforeA[0])&&close(g.vis.get(a.id).y,beforeA[1])&&close(g.vis.get(b.id).x,beforeB[0])&&close(g.vis.get(b.id).y,beforeB[1]),'normal pile was deformed by final global projection');
}

console.log('pile reference architecture regressions PASS');
`;
vm.runInNewContext(runtime+checks,{React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date},{timeout:120000});
