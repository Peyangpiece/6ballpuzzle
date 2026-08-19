const fs=require("fs");
const vm=require("vm");

const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-07.js",
  "app-wall-gap-invariant.js","app-wall-direct-support-fill.js",
  "app-wall-flow-vacancy-sync.js","app-wall-zero-gap.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function ball(id,c=0,garbage=false){const b={id,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0,rigid:false};if(garbage)b.isGarbage=true;return b;}
function put(b,x,y,id,c=0,garbage=false){expect(valid(x,y),"invalid cell "+x+","+y);const q=ball(id,c,garbage);b[y][x]=q;return q;}
function wallX(side,y){return side>0?((y&1)?0:1):((y&1)?W2-1:W2-2);}
function physical(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1]);}

expect(window.__hexAbsoluteWallZeroGap===true,"absolute wall no-gap adapter missing");
expect(window.__hexWallGapAllowed===false,"wall gap policy is not strict");
expect(window.__hexWallAllBallTypesPack===true,"garbage/all-ball wall packing missing");
expect(window.__hexWallDirectSupportAlwaysPacks===true,"direct-support wall packing is not absolute");
expect(window.__hexWallBothParitiesAlwaysPack===true,"both wall parities are not covered");

let cases=0;

// One cell in from the boundary: both lower diagonals are open and residual
// momentum deliberately points AWAY from the wall. Normal and garbage balls,
// both sides and both row parities must still choose the physical wall cell.
for(const y of[8,9])for(const side of[-1,1])for(const garbage of[false,true]){
  const b=newBoard(),ty=y+1,targetX=wallX(side,ty),x=targetX+side;
  const q=put(b,x,y,1000+cases,1,garbage),support=put(b,x,y+2,2000+cases,2,false);
  q.momentumX=-side;q.rollDir=-side;q.subCellBias=-side;
  const p=hexPhysNaturalMotion(b,x,y);
  expect(p&&p.wallZeroGap===true,"adjacent wall pack missing: "+JSON.stringify({y,side,garbage,p}));
  expect(p.tx===targetX&&p.ty===ty,"ball chose interior instead of wall: "+JSON.stringify({y,side,garbage,to:p&&[p.tx,p.ty],want:[targetX,ty]}));
  expect(p.allBallWallPack===true,"all-ball wall marker missing");
  expect(Array.isArray(p.topPivot)&&p.topPivot[0]===x&&p.topPivot[1]===y+2,"adjacent wall pack lost real support pivot");
  for(let i=0;i<=144;i++){
    const a=proposalPointAt(p,i/144),s=normPoint(x,y+2);
    expect(physical(a,s)>=HEX_MIN_DIST-1e-6,"adjacent wall pack overlapped support: "+JSON.stringify({y,side,garbage,i,d:physical(a,s)}));
  }
  expect(hexPhysApplyEvent(b,[p]),"adjacent wall pack event rejected");
  expect(b[ty][targetX]===q,"adjacent wall cell remained empty after pack");
  expect(b[y+2][x]===support,"adjacent pack moved support unexpectedly");
  cases++;
}

// Ball already on the boundary: with a real direct support two rows below, the
// next alternating-parity wall cell must always win. This exercises both wall
// parities, both sides, and both ordinary/garbage metadata variants.
for(const y of[7,8])for(const side of[-1,1])for(const garbage of[false,true]){
  const b=newBoard(),x=wallX(side,y),ty=y+1,targetX=wallX(side,ty);
  const q=put(b,x,y,3000+cases,1,garbage),support=put(b,x,y+2,4000+cases,2,false);
  q.momentumX=-side;q.rollDir=-side;q.subCellBias=-side;
  const p=hexPhysNaturalMotion(b,x,y);
  expect(p&&p.kind==="WALL_ZERO_GAP_DIRECT_FILL","wall direct-support fill missing: "+JSON.stringify({y,side,garbage,p}));
  expect(p.tx===targetX&&p.ty===ty,"wall ball peeled away from boundary: "+JSON.stringify({y,side,garbage,to:p&&[p.tx,p.ty],want:[targetX,ty]}));
  expect(p.wallZeroGap===true&&p.wallDirectFill===true,"wall direct-fill markers missing");
  expect(Array.isArray(p.topPivot)&&p.topPivot[0]===x&&p.topPivot[1]===y+2,"direct wall fill lost real support pivot");
  for(let i=0;i<=144;i++){
    const a=proposalPointAt(p,i/144),s=normPoint(x,y+2);
    expect(physical(a,s)>=HEX_MIN_DIST-1e-6,"direct wall fill overlapped support: "+JSON.stringify({y,side,garbage,i,d:physical(a,s)}));
  }
  expect(hexPhysApplyEvent(b,[p]),"direct wall fill event rejected");
  expect(b[ty][targetX]===q,"next wall cell remained empty after direct fill");
  expect(b[y+2][x]===support,"direct wall fill moved support unexpectedly");
  cases++;
}

// Garbage still in an explicit spawn/bubble hold is intentionally immobile; the
// new invariant must not bypass that pre-contact state.
{
  const b=newBoard(),y=8,side=1,x=wallX(side,y),q=put(b,x,y,9001,1,true);
  q.garbageBubbleHold=true;put(b,x,y+2,9002,2,false);
  expect(hexPhysNaturalMotion(b,x,y)===null,"wall invariant bypassed garbage spawn hold");
}

// Scope guard: an interior symmetric fork remains the canonical momentum-based
// decision and is not converted into a wall-specific move.
{
  const b=newBoard(),x=9,y=9,q=put(b,x,y,9101,1,false);put(b,x,11,9102,2,false);
  q.momentumX=1;q.rollDir=1;q.subCellBias=1;
  const p=hexPhysNaturalMotion(b,x,y);
  expect(p&&!p.wallZeroGap&&p.tx===x+1&&p.ty===y+1,"interior fork was changed by wall invariant");
}

expect(cases===16,"expected 16 absolute wall cases, got "+cases);
console.log("absolute wall zero-gap regression PASS",JSON.stringify({cases}));
`;

vm.runInNewContext(`const React={};\nconst window={};\nconst navigator={};\n${runtime}\n${checks}`,{
  console,Math,Set,Map,Array,Object,Number,String,Boolean,JSON,Date,Infinity,NaN,parseInt,parseFloat,isFinite
});
