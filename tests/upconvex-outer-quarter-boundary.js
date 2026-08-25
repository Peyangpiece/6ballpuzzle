const fs=require("fs");
const vm=require("vm");
const path=require("path");

const runtime=["app-01.js","app-02.js"]
  .map(name=>fs.readFileSync(path.join(__dirname,"../public",name),"utf8"))
  .join("\n");

function expect(value,message){if(!value)throw new Error(message);}

const assertions=String.raw`
function fixture(offset){
  const b=newBoard();
  const balls=[0,1,2].map(i=>({
    id:9000+i,c:i,motionGroupId:900,motionGroupRole:i,
    motionGroupOrientation:"up",motionGroupSize:3,rigid:true,
    impactOffsetX:offset,momentumX:Math.sign(offset)
  }));
  const members=[
    {ball:balls[0],x:6,y:3,role:0,orientation:"up"},
    {ball:balls[1],x:7,y:4,role:1,orientation:"up"},
    {ball:balls[2],x:5,y:4,role:2,orientation:"up"}
  ];
  for(const member of members)b[member.y][member.x]=member.ball;
  b[5][6]={id:9099,c:4,motionGroupId:0,rigid:false};
  const motions=members.map(member=>hexPhysIndependentMemberMotion(b,members,member));
  const separator=hexPhysUpConvexSeparator(b,members,motions);
  const plan=hexPhysPlanGroup(b,members,true)||[];
  const activeSplit=plan.some(step=>step.groupSize===2)&&plan.some(step=>step.groupSize===0);
  return{separator,activeSplit};
}

for(const [offset,shouldSplit] of [
  [-.501,false],[-.5,false],[-.499,true],
  [0,true],
  [.499,true],[.5,false],[.501,false]
]){
  const result=fixture(offset);
  if(shouldSplit){
    expect(result.separator&&result.activeSplit,"strict middle-half contact "+offset+" did not split");
  }else{
    expect(!result.separator&&!result.activeSplit,"outer-quarter contact "+offset+" split the triangle");
  }
}

/* The same middle-half geometry is only a future contact when both lower
   motions carry topPivot/free-fall data instead of a current pivot. */
{
  const b=newBoard();
  const balls=[0,1,2].map(i=>({
    id:9100+i,c:i,motionGroupId:910,motionGroupRole:i,
    motionGroupOrientation:"up",motionGroupSize:3,rigid:true,
    impactOffsetX:0,momentumX:0
  }));
  const members=[
    {ball:balls[0],x:6,y:3,role:0,orientation:"up"},
    {ball:balls[1],x:7,y:4,role:1,orientation:"up"},
    {ball:balls[2],x:5,y:4,role:2,orientation:"up"}
  ];
  for(const member of members)b[member.y][member.x]=member.ball;
  b[5][6]={id:9199,c:4,motionGroupId:0,rigid:false};
  const motions=members.map(member=>{
    const p=hexPhysIndependentMemberMotion(b,members,member);
    return p?{...p,pivot:null,topPivot:[6,5]}:p;
  });
  expect(!hexPhysUpConvexSeparator(b,members,motions),"airborne topPivot approach created a 2+1 separator");
}
`;

vm.runInNewContext(runtime+assertions,{
  React:{useRef(){},useEffect(){},useState(){},useCallback(){}},
  window:{},navigator:{},expect,console,Math,Map,Set,Array,Object,Number,String,Boolean,JSON,Date
});

console.log("up-convex strict middle-50 boundary PASS");
