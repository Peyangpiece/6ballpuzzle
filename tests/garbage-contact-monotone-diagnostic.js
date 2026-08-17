const fs=require("fs");
const vm=require("vm");

const html=fs.readFileSync(`${__dirname}/../public/index.html`,"utf8");
const names=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const runtime=names.map(n=>fs.readFileSync(`${__dirname}/../public/${n}`,"utf8")).join("\n");
const probe=String.raw`
const g=createEngine(7000);
g.garbShapes=["PYRAMID"];
prepareGarbageBatch(g);
let lastY=GARBAGE_START_Y;
let found=null;
for(let frame=0;frame<600&&!found;frame++){
  const beforeY=lastY;
  updateGarbagePacks(g,PHYSICS_FRAME);
  const p=g.activeGarbagePacks[0];
  if(p){
    const contacts=[];
    for(let i=0;i<p.pat.length;i++)contacts.push({i,slot:[...p.pat[i]],cy:hexGarbageBallContactY(g,p,i)});
    const garbage=[];
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
      const b=valid(x,y)?g.board[y][x]:null;if(!b?.isGarbage)continue;
      const v=g.vis.get(b.id);
      garbage.push({id:b.id,logical:[x,y],visual:v?[v.x,v.y]:null,moving:!!(b.fallPath&&b.fallPath.length),pathLen:b.fallPath?.length||0});
    }
    if(p.y+1e-10<beforeY){
      found={frame,clock:g.garbageClock,beforeY,afterY:p.y,delta:p.y-beforeY,pat:p.pat.map(v=>[...v]),contacts,split:!!p._hexSplitTriggered,clamped:!!p._hexContactClamped,barrier:p._hexContactBarrierY,landedCount:p.landedCount,garbage};
      break;
    }
    lastY=p.y;
  }
  updateVisuals(g,PHYSICS_FRAME);
  resolveVisualContacts(g);
}
if(!found)console.log("MONOTONE_DIAGNOSTIC no upward frame");
else console.log("MONOTONE_DIAGNOSTIC "+JSON.stringify(found));
`;
vm.runInNewContext(runtime+probe,{
  React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},
  ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date
},{timeout:120000});
