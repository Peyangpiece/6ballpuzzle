const fs=require("fs");
const vm=require("vm");
const names=["app-01.js","app-02.js","app-03.js","app-04.js","app-07.js","app-36.js"];
const runtime=names.map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");
const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function mk(id,c=0){return{id,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0,rigid:false,momentumX:0,rollDir:0,subCellBias:0};}

// During post-clear settling, an ambiguous roll must close a buried wall pocket
// instead of taking the old unconditional-left tie break.
{
 const b=newBoard(),source=mk(1,0),support=mk(2,1),fl=mk(3,2),fr=mk(4,3);
 b[8][17]=source;b[10][17]=support;b[11][16]=fl;b[11][18]=fr;
 b._hexClearCollapsePreferHoles=true;
 const p=hexPhysNaturalMotion(b,17,8);
 expect(p&&p.tx===18&&p.ty===9,"wall pocket: clear-time gravity did not prefer the empty wall pocket");
 delete b._hexClearCollapsePreferHoles;
}

// The board preflight uses the same legal swept-circle motion, records a normal
// fallPath and leaves the wall cell occupied rather than accepting a side hole.
{
 const b=newBoard(),source=mk(10,0),support=mk(11,1),fl=mk(12,2),fr=mk(13,3);
 b[8][17]=source;b[10][17]=support;b[11][16]=fl;b[11][18]=fr;
 const r=hexClearCollapsePreflightBoard(b);
 expect(r.moved,"wall pocket: preflight reported no gravity motion");
 expect(b[9][18]===source,"wall pocket: source did not settle into the wall vacancy");
 expect(Array.isArray(source.fallPath)&&source.fallPath.length>0,"wall pocket: repair bypassed normal animated fallPath");
 expect(!hexClearCollapseWallPocket(b,18,9),"wall pocket: buried edge vacancy survived preflight");
}

// A mixed-colour internal cavity is detected and receives a collision-safe
// downhill proposal when one side of the cavity is open enough to relax.
{
 const b=newBoard();let id=100;
 for(let y=5;y<=9;y++)for(let x=0;x<W2;x++)if(valid(x,y))b[y][x]=mk(id++,(x+2*y)%COLORS.length);
 const h=[10,7],gate=[11,6];b[h[1]][h[0]]=null;b[gate[1]][gate[0]]=null;
 const holes=hexClearCollapseVoidCells(b);
 expect(holes.some(q=>q.x===h[0]&&q.y===h[1]),"internal cavity: enclosed void was not detected");
 const p=hexClearCollapseProposalForHole(b,h[0],h[1]);
 expect(p&&p.tx===h[0]&&p.ty===h[1],"internal cavity: no safe downhill repair proposal was found");
 expect(!hexPhysPathHitsStationary(p,b,new Set([p.ball.id])),"internal cavity: repair proposal penetrates the pile");
}

// The intentional same-colour HEXAGON centre remains a protected hole. The
// anti-hole pass must not destroy a valid technique while fixing accidental gaps.
{
 const b=newBoard(),pat=GARBAGE_SHAPES.HEXAGON,ax=1,baseY=ROWS-3;let id=300;
 for(const[dx,dy]of pat)b[baseY+dy][ax+dx]=mk(id++,2);
 const cx=ax+2,cy=baseY+1,before=physicsSignature(b);
 expect(isBalancedHexagonCenterHole(b,cx,cy),"hexagon protection: reference hole was not recognized");
 expect(!hexClearCollapseVoidCells(b).some(q=>q.x===cx&&q.y===cy),"hexagon protection: intentional centre was classified as an accidental cavity");
 const r=hexClearCollapsePreflightBoard(b);
 expect(physicsSignature(b)===before&&!r.moved,"hexagon protection: cavity repair destroyed an intentional HEXAGON");
}
console.log("clear hole collapse regressions PASS");
`;
const context={React:{useRef(){},useEffect(){},useState(){},useCallback(){}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date};
vm.runInNewContext(runtime+checks,context,{timeout:120000});
