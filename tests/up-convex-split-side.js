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
function setup(offset,cx=6,blockRigidArc=false){
  const b=newBoard(),balls=[makeBall(1,offset),makeBall(2,offset),makeBall(3,offset)];
  const members=[
    {ball:balls[0],x:cx,y:3,role:0,orientation:"up"},
    {ball:balls[1],x:cx+1,y:4,role:1,orientation:"up"},
    {ball:balls[2],x:cx-1,y:4,role:2,orientation:"up"}
  ];
  for(let i=0;i<members.length;i++){members[i].ball.motionGroupRole=i;b[members[i].y][members[i].x]=members[i].ball;}
  b[5][cx]={id:99,c:4,motionGroupId:0,rigid:false};
  if(blockRigidArc){
    // Block only the far top-ball destination of the preferred whole-triplet
    // 60-degree arc. The canonical 2+1 split paths remain open.
    const bx=cx+(offset<0?-3:3);
    b[4][bx]={id:199,c:3,motionGroupId:0,rigid:false};
  }
  return{b,balls,members};
}
function pairDistances(points){
  const out=[];
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)out.push(Math.hypot(points[i][0]-points[j][0],points[i][1]-points[j][1]));
  return out;
}
function checkRigid(offset,cx,dir,label){
  const {b,balls,members}=setup(offset,cx,false);
  const motions=members.map(m=>hexPhysIndependentMemberMotion(b,members,m));
  const separator=hexPhysUpConvexSeparator(b,members,motions);
  expect(separator===null,"rigid-first: separator armed even though a full rigid arc existed for "+label);

  const before=members.map(m=>normPoint(m.x,m.y));
  const beforeD=pairDistances(before);
  const plan=hexPhysPlanGroup(b,members,false);
  expect(plan.length===3,"rigid-first: whole triplet did not receive three proposals for "+label);
  expect(plan.every(p=>p.kind==="GROUP_SLOPE_ROLL"),"rigid-first: whole triplet did not use the shared slope arc for "+label);
  expect(plan.every(p=>Math.sign(p.tx-p.x)===dir),"rigid-first: triplet reversed away from its continuous travel direction for "+label);
  expect(plan.every(p=>p.pivot&&p.pivot[0]===cx&&p.pivot[1]===5),"rigid-first: triplet members did not share the same physical support for "+label);
  expect(balls.every(ball=>ball.motionGroupId===900&&ball.motionGroupSize===3&&ball.rigid),"rigid-first: triplet metadata split before rigid motion became impossible for "+label);

  const afterD=pairDistances(plan.map(p=>normPoint(p.tx,p.ty)));
  expect(afterD.every((d,i)=>Math.abs(d-beforeD[i])<1e-9),"rigid-first: triangle geometry changed at the end of the shared arc for "+label);
  const midD=pairDistances(plan.map(p=>proposalPointAt(p,.5)));
  expect(midD.every((d,i)=>Math.abs(d-beforeD[i])<1e-9),"rigid-first: triangle geometry changed while travelling through the shared arc for "+label);
}
function checkSplit(offset,contactSide,cx,soloX,soloDir,pairDir,label){
  const {b,members}=setup(offset,cx,true);
  const motions=members.map(m=>hexPhysIndependentMemberMotion(b,members,m));
  const info=hexPhysUpConvexSeparator(b,members,motions);
  expect(info,"split-side: no separator after the full rigid route was physically blocked for "+label);
  expect(info.contactSide===contactSide,"split-side: contact side mismatch for "+label+": "+info.contactSide);
  expect(info.solo.x===soloX,"split-side: wrong single ball selected for "+label);
  expect(Math.sign(info.soloMotion.tx-info.solo.x)===soloDir,"split-side: single ball moved to the wrong side for "+label);
  expect(info.dir===pairDir,"split-side: two-ball pair moved to the wrong side for "+label);

  const plan=hexPhysPlanGroup(b,members,false);
  expect(plan.length===3,"split-side: required 2+1 split plan was not accepted for "+label);
  const solo=members.find(m=>m.x===soloX).ball;
  expect(solo.motionGroupId===0&&!solo.rigid,"split-side: selected single ball stayed in the rigid pair for "+label);
  const soloPlan=plan.find(p=>p.ball===solo);
  expect(soloPlan&&Math.sign(soloPlan.tx-soloPlan.x)===soloDir,"split-side: final solo proposal moved the wrong way for "+label);
  const pairPlan=plan.filter(p=>p.ball!==solo);
  expect(pairPlan.length===2&&pairPlan.every(p=>Math.sign(p.tx-p.x)===pairDir),"split-side: final two-ball pair moved the wrong way for "+label);
}

expect(window.__hexUpConvexSplitSideInvariant===true,"split-side invariant was not installed");
expect(window.__sixBallUpConvexRigidArcFirst===true,"rigid-first arc guard was not installed");
expect(window.__sixBallUpConvexSplitRequiresRigidFailure===true,"split was not gated by rigid-motion failure");

// A center protrusion by itself must NOT split the triplet. If the complete
// triangle can roll around that support, all three balls move together.
checkRigid(-0.4,6,-1,"open left rigid continuation");
checkRigid(0.4,6,1,"open right rigid continuation");

// Only after the preferred complete-triplet arc is actually blocked may the
// contact-side 2+1 rule fire.
checkSplit(-0.4,"right",6,7,1,-1,"blocked left rigid continuation");
checkSplit(0.4,"left",6,5,-1,1,"blocked right rigid continuation");

console.log("upward normal triangle rigid-first / physical 2+1 split PASS");
`;

const source=`const React={};\nconst window={};\nconst navigator={};\n${runtime}\n${assertions}`;
vm.runInNewContext(source,{console,Math,Set,Map,Array,Object,Number,String,Boolean,JSON,Date,Infinity,NaN,parseInt,parseFloat,isFinite});
