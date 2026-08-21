const fs=require("fs");
const vm=require("vm");

const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-07.js",
  "app-clear-gap-collapse.js","app-floor-gap-invariant.js","app-wall-gap-invariant.js",
  "app-wall-direct-support-fill.js","app-wall-flow-vacancy-sync.js","app-up-convex-split-side.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const assertions=String.raw`
function expect(value,message){if(!value)throw new Error(message);}
function makeBall(id,offset){return{id,c:id%5,motionGroupId:900,motionGroupRole:0,motionGroupOrientation:"up",motionGroupSize:3,rigid:true,momentumX:Math.sign(offset),rollDir:Math.sign(offset),subCellBias:Math.sign(offset),impactOffsetX:offset};}
function setup(offset,cx=6){
  const b=newBoard(),balls=[makeBall(1,offset),makeBall(2,offset),makeBall(3,offset)];
  const members=[
    {ball:balls[0],x:cx,y:3,role:0,orientation:"up"},
    {ball:balls[1],x:cx+1,y:4,role:1,orientation:"up"},
    {ball:balls[2],x:cx-1,y:4,role:2,orientation:"up"}
  ];
  for(let i=0;i<members.length;i++){members[i].ball.motionGroupRole=i;b[members[i].y][members[i].x]=members[i].ball;}
  b[5][cx]={id:99,c:4,motionGroupId:0,rigid:false};
  return{b,balls,members};
}
function check(offset,contactSide,cx,soloX,soloDir,pairDir,label){
  const {b,members}=setup(offset,cx);
  const motions=members.map(m=>hexPhysIndependentMemberMotion(b,members,m));
  const info=hexPhysUpConvexSeparator(b,members,motions);
  expect(info,"split-side: no separator for "+label);
  expect(info.contactSide===contactSide,"split-side: contact side mismatch for "+label+": "+info.contactSide);
  expect(info.solo.x===soloX,"split-side: wrong single ball selected for "+label);
  expect(Math.sign(info.soloMotion.tx-info.solo.x)===soloDir,"split-side: single ball moved to the wrong side for "+label);
  expect(info.dir===pairDir,"split-side: two-ball pair moved to the wrong side for "+label);

  const plan=hexPhysPlanGroup(b,members,false);
  expect(plan.length===3,"split-side: split plan was not accepted for "+label);
  const solo=members.find(m=>m.x===soloX).ball;
  expect(solo.motionGroupId===0&&!solo.rigid,"split-side: selected single ball stayed in the rigid pair for "+label);
  const soloPlan=plan.find(p=>p.ball===solo);
  expect(soloPlan&&Math.sign(soloPlan.tx-soloPlan.x)===soloDir,"split-side: final solo proposal moved the wrong way for "+label);
  const pairPlan=plan.filter(p=>p.ball!==solo);
  expect(pairPlan.length===2&&pairPlan.every(p=>Math.sign(p.tx-p.x)===pairDir),"split-side: final two-ball pair moved the wrong way for "+label);
}

expect(window.__hexUpConvexSplitSideInvariant===true,"split-side invariant was not installed");
// Negative release offset means the pile protrusion is on the RIGHT side of
// the continuously shifted triangle: exactly one ball must go right.
check(-0.4,"right",6,7,1,-1,"interior right contact");
// Positive release offset means the protrusion is on the LEFT: exactly one
// ball must go left.
check(0.4,"left",6,5,-1,1,"interior left contact");
// The same 2+1 rule must survive the wall compaction wrappers on both sides.
check(-0.4,"right",2,3,1,-1,"left-wall right contact");
check(0.4,"left",2,1,-1,1,"left-wall left contact");
check(-0.4,"right",16,17,1,-1,"right-wall right contact");
check(0.4,"left",16,15,-1,1,"right-wall left contact");
console.log("upward normal triangle contact-side 2+1 split PASS");
`;

const source=`const React={};\nconst window={};\nconst navigator={};\n${runtime}\n${assertions}`;
vm.runInNewContext(source,{console,Math,Set,Map,Array,Object,Number,String,Boolean,JSON,Date,Infinity,NaN,parseInt,parseFloat,isFinite});
