const {runSuite}=require('./audit-harness');
const suite=String.raw`
const bugs=[],stats={};function bug(type,data){stats[type]=(stats[type]||0)+1;if(bugs.length<80)bugs.push({type,...data});}
function shapeBalls(shapes){return (shapes||[]).reduce((n,w)=>n+(GARBAGE_SHAPES[w]?.length||0),0);}
function effectiveDelivered(n,shapes){return shapes?.length?shapeBalls(shapes):Math.max(0,n||0);}
// Final payload semantics: shapes replace n at delivery, therefore the final
// shape list must represent exactly sendBuffer. app-66 is the production
// normalization authority under test here.
for(const w of ['STRAIGHT','PYRAMID','HEXAGON']){
 const total=WAZA[w].garbage,packs=WAZA[w].packs??4,shapes=Array.from({length:packs},()=>w);
 if(shapeBalls(shapes)!==total)bug('waza-shape-count-definition-mismatch',{w,total,packs,shapeBalls:shapeBalls(shapes)});
 for(let cancelled=1;cancelled<Math.min(total,10);cancelled++){
   const fake={sendBuffer:total-cancelled,sendShapes:shapes.slice()};
   if(typeof hexNormalizeAttackPayload!=='function')bug('attack-normalizer-missing',{w});
   else hexNormalizeAttackPayload(fake);
   const delivered=effectiveDelivered(fake.sendBuffer,fake.sendShapes);
   if(delivered!==fake.sendBuffer)bug('offset-payload-overdelivers',{w,total,cancelled,n:fake.sendBuffer,delivered,finalShapes:fake.sendShapes});
 }
}
// Simulate the real CLEAR commit with offset and verify the queued payload cannot deliver more than sendBuffer.
for(const w of ['STRAIGHT','PYRAMID','HEXAGON'])for(const incoming of [1,5,11]){
 const g=createEngine(880000+incoming+WAZA[w].garbage);g.offset=true;g.incoming=incoming;g.state='RESOLVING';g.phase='CLEAR';g.chain=1;g.holdT=0.01;g.stateT=0;
 const cells=[];let id=900000;for(let x=0;x<12&&cells.length<6;x++)for(let y=ROWS-1;y>=ROWS-3&&cells.length<6;y--)if(valid(x,y)&&!g.board[y][x]){const b={id:id++,c:0,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:'',motionGroupSize:0,rigid:false};g.board[y][x]=b;setVis(g,b,x,y,0);cells.push([x,y,0,b.id]);}
 g.clearing={ids:new Set(cells.map(c=>c[3])),cells,waza:[w],committed:false,ghosts:[]};
 g.stateT=g.holdT*CLEAR_SUPPORT_RELEASE_RATIO+1e-4;stepEngine(g,0);
 const queuedN=g.sendBuffer,queuedShapes=g.sendShapes.slice(),effective=effectiveDelivered(queuedN,queuedShapes),expected=Math.max(0,WAZA[w].garbage-incoming);
 if(effective!==expected||queuedN!==expected)bug('real-clear-offset-delivery-mismatch',{w,incoming,expected,queuedN,queuedShapes,effective});
}
globalThis.__ATTACK_AUDIT={stats,bugs};
`;
const ctx=runSuite(suite,{timeout:180000});console.log('ATTACK_CONSERVATION_AUDIT',JSON.stringify(ctx.__ATTACK_AUDIT,null,2));if(Object.keys(ctx.__ATTACK_AUDIT.stats).length)process.exitCode=1;
