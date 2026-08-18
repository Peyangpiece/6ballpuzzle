const fs=require("fs");
const vm=require("vm");

const runtime=["app-01.js","app-02.js","app-07.js","app-clear-gap-collapse.js"]
  .map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const assertions=String.raw`
function expect(value,message){if(!value)throw new Error(message);}
function makeBall(id,c=0){return{id,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0,rigid:false};}
function put(board,x,y,id,c=0){expect(valid(x,y),"invalid test cell "+x+","+y);board[y][x]=makeBall(id,c);}
function placeHexagonWithBallFoundation(board,cx,cy,startId=1){
  const ring=[[-2,0],[2,0],[-1,-1],[1,-1],[-1,1],[1,1]];
  let id=startId;
  for(const[dx,dy]of ring)put(board,cx+dx,cy+dy,id++,0);
  // Both lower arch members are supported by real balls. This makes the
  // wall-adjacent case especially important: it must still be rejected solely
  // because the HEXAGON itself touches the side wall.
  const foundation=[[cx-2,cy+2],[cx,cy+2],[cx+2,cy+2]];
  for(const[x,y]of foundation)if(!board[y][x])put(board,x,y,id++,1);
}

{
  const b=newBoard(),cx=8,cy=5;
  placeHexagonWithBallFoundation(b,cx,cy,100);
  expect(isBalancedHexagonCenterHole(b,cx,cy),"interior ball-supported HEXAGON gap was rejected");
  expect(ballInBalancedHexagonRing(b,cx-2,cy),"interior HEXAGON ring did not receive the balanced exemption");
}

{
  const b=newBoard(),cx=2,cy=5;
  placeHexagonWithBallFoundation(b,cx,cy,200);
  expect(!isBalancedHexagonCenterHole(b,cx,cy),"wall-adjacent HEXAGON gap was incorrectly preserved");
  expect(!ballInBalancedHexagonRing(b,cx-2,cy),"wall-adjacent ring still received the no-gravity exemption");
}

console.log("wall gap regression PASS");
`;

const source=`const React={};\nconst window={};\nconst navigator={};\n${runtime}\n${assertions}`;
vm.runInNewContext(source,{console,Math,Set,Map,Array,Object,Number,String,Boolean,JSON,Date,Infinity,NaN,parseInt,parseFloat,isFinite});
