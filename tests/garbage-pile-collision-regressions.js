const fs=require('fs');
const vm=require('vm');

const html=fs.readFileSync(`${__dirname}/../public/index.html`,'utf8');
const names=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const runtime=names.map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,'utf8')).join('\n');

const assertions=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function close(a,b,e=1e-7){return Math.abs(a-b)<=e;}
function makeBall(id,{garbage=false,moving=false}={}){
  const b={id,c:id%5,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:'',motionGroupSize:0,rigid:false};
  if(garbage){b.isGarbage=true;b.garbageType='PYRAMID';}
  if(moving)b.fallPath=[{from:[5,4],to:[4,5],motionSeq:1,kind:'ROLL_LEFT',pivot:[6,5],topPivot:null,followSupportIds:[]}];
  return b;
}
function basePack(){return{type:'PYRAMID',seq:1,pat:[[0,0]],colors:[0],ax:5,targetY:0,y:GARBAGE_START_Y,vy:0,landed:false,_started:true,totalBalls:1,landedCount:0,entryBalls:[],_hexSplitTriggered:false};}
function floorAnchorY(){return (FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H;}
function exactCenterContactY(obstacleY){return obstacleY-1/HEX_ROW_H;}

// A settled garbage ball from an earlier attack is accumulated pile geometry.
// It must stop a later airborne packet even before that packet's first split.
{
  const g=createEngine(97001),support=makeBall(970010,{garbage:true,moving:false});
  g.state='RESOLVING';g.phase='GARBAGE';g.board[4][5]=support;g.vis.set(support.id,{x:5,y:4,vy:0,motionSpeed:0,sq:0});g.garbageClock=1;
  const pack=basePack();g.activeGarbagePacks=[pack];
  g._hexGarbageObstacleFrame=null;delete pack._hexContactFrame;
  const contact=hexGarbageFlightContactY(g,pack);
  expect(close(contact,exactCenterContactY(4),1e-7),'settled garbage pile was ignored by incoming garbage contact');
  expect(contact<floorAnchorY()-1,'fixture did not stop above floor');
  const frame=hexGarbageObstacleFrame(g),entry=frame.obstacles.find(e=>e.id===support.id);
  expect(hexGarbageObstacleStopsAirborne(frame,entry,false)===true,'settled garbage was not classified as solid pile before split');
}

// Only moving garbage is exempt. Airborne/gridified-but-still-moving garbage
// must not become a premature lattice support for another airborne member.
{
  const g=createEngine(97002),moving=makeBall(970020,{garbage:true,moving:true});
  g.state='RESOLVING';g.phase='GARBAGE';g.board[4][5]=moving;g.vis.set(moving.id,{x:5,y:4,vy:1,motionSpeed:1,sq:0});g.garbageClock=1;
  const pack=basePack();g.activeGarbagePacks=[pack];
  g._hexGarbageObstacleFrame=null;delete pack._hexContactFrame;
  const contact=hexGarbageFlightContactY(g,pack);
  expect(close(contact,floorAnchorY(),1e-7),'moving garbage incorrectly became a solid pile obstacle');
  const frame=hexGarbageObstacleFrame(g),entry=frame.obstacles.find(e=>e.id===moving.id);
  expect(hexGarbageObstacleStopsAirborne(frame,entry,false)===false,'moving garbage lost airborne pass-through exception');
}

// Normal accumulated balls remain solid with the same exact-circle contact.
{
  const g=createEngine(97003),support=makeBall(970030,{garbage:false,moving:false});
  g.state='RESOLVING';g.phase='GARBAGE';g.board[4][5]=support;g.vis.set(support.id,{x:5,y:4,vy:0,motionSpeed:0,sq:0});g.garbageClock=1;
  const pack=basePack();g.activeGarbagePacks=[pack];
  g._hexGarbageObstacleFrame=null;delete pack._hexContactFrame;
  const contact=hexGarbageFlightContactY(g,pack);
  expect(close(contact,exactCenterContactY(4),1e-7),'normal accumulated pile stopped blocking incoming garbage');
}

console.log('garbage versus accumulated pile collision regression PASS');
`;

vm.runInNewContext(runtime+assertions,{
  React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},
  ReactDOM:{createRoot(){return{render(){}}}},
  window:{},navigator:{},document:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date,setTimeout(){},clearTimeout(){}
},{timeout:120000});
