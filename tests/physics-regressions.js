const fs=require("fs");
const vm=require("vm");

const runtime=["app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js"]
  .map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const assertions=String.raw`
function expect(value,message){if(!value)throw new Error(message);}

// Exactly one pinned member must be detached without changing the pair's id.
{
 const b=newBoard(),balls=[0,1,2].map(i=>({id:i+1,c:i,motionGroupId:77,motionGroupRole:i,motionGroupOrientation:"down",motionGroupSize:3,rigid:true}));
 const members=balls.map((ball,i)=>({ball,x:4+i*2,y:4,role:i,orientation:"down"}));
 for(const m of members)b[m.y][m.x]=m.ball;
 const original=hexPhysIndependentMemberMotion;
 hexPhysIndependentMemberMotion=(board,group,m)=>m.role===0?null:{x:m.x,y:m.y,tx:m.x,ty:m.y+2,ball:m.ball,kind:"FREE_FALL",pivot:null,topPivot:null,followSupportIds:[]};
 hexPhysTranslationSafe=()=>true;
 const plan=hexPhysPlanGroup(b,members,false);
 hexPhysIndependentMemberMotion=original;
 expect(plan.length===2,"pinned triplet: remaining pair did not keep moving");
 expect(balls[0].motionGroupId===0&&balls[0].rigid===false,"pinned triplet: fixed ball stayed rigid");
 expect(balls[1].motionGroupId===77&&balls[2].motionGroupId===77,"pinned triplet: pair lost original group");
 expect(balls[1].motionGroupSize===2&&balls[2].motionGroupSize===2&&balls[1].rigid&&balls[2].rigid,"pinned triplet: pair rigidity was not preserved");
}

// A stable accumulated group always has zero rigidity.
{
 const g=createEngine(1),y=ROWS-1;
 const balls=[0,1].map(i=>({id:100+i,c:i,motionGroupId:88,motionGroupRole:i,motionGroupOrientation:"down",motionGroupSize:2,rigid:true}));
 g.board[y][0]=balls[0];g.board[y][2]=balls[1];
 normalizeAllNonActivePileBalls(g);
 expect(balls.every(ball=>ball.motionGroupId===0&&ball.rigid===false),"pile rigidity: stable balls remained constrained");
}

// Garbage planning/materialization must never invoke the unbounded full solver.
{
 const g=createEngine(2);
 expect(!/settleAll\s*\(/.test(reserveGarbagePlan.toString()),"garbage planning contains settleAll");
 expect(!/settleAll\s*\(/.test(materializeGarbagePack.toString()),"garbage contact contains settleAll");
 const plan={type:"TEST",pat:[[0,0]],ax:0,targetY:ROWS-1,colors:[0],seq:0,y:GARBAGE_START_Y,vy:0,landed:false};
 const shadow=cloneBoardForGarbagePlan(g.board);
 reserveGarbagePlan(shadow,plan,-1);
 expect(materializeGarbagePack(g,plan),"garbage materialization failed");
 expect(HEX_GARBAGE_SHAPE_INTERVAL===0.5,"garbage interval is not 0.5 seconds");
}

console.log("physics regressions PASS");
`;

vm.runInNewContext(runtime+assertions,{React:{useRef(){},useEffect(){},useState(){},useCallback(){}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date});
