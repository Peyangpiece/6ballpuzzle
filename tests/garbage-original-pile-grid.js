const fs=require("fs");
const vm=require("vm");
const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js",
  "app-07.js","app-pile-arc.js","app-08.js","app-09.js","app-10.js","app-14.js","app-17.js",
  "app-garbage-contact.js","app-garbage-rigidity.js","app-garbage-settle-state.js",
  "app-garbage-sweep-guard.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function put(g,x,y,c=0,garbage=false){
 const b=mkBall(g,c);if(garbage)b.isGarbage=true;g.board[y][x]=b;setVis(g,b,x,y,0);return b;
}

// Snapshot semantics: only balls that existed before this batch may trigger
// airborne -> lattice contact. A same-batch garbage ball is ignored even after
// it reaches a settled grid position.
{
 const g=createEngine(98001);
 const original=put(g,5,8,0,false);
 window.__hexCaptureGarbageOriginalPile(g);
 const later=put(g,5,6,1,true);later.garbagePileSettled=true;
 const pack={type:"TEST",seq:1,pat:[[0,0]],colors:[2],ax:5,targetY:0,y:GARBAGE_START_Y,vy:0,landed:false,_started:true,totalBalls:1,landedCount:0,entryBalls:[]};
 const info=window.__hexGarbageOriginalPileContactInfo(g,pack,0);
 expect(info.supportId===original.id,"contact chose current-batch garbage instead of pre-drop pile");
 const expected=8-1/HEX_ROW_H;
 expect(Math.abs(info.y-expected)<1e-7,"pre-drop pile contact height is wrong: "+JSON.stringify(info));
}

// After contact with the pre-drop pile, the garbage ball is registered on the
// lattice. Apart from the single physical contact->grid handoff, all queued
// motion must be canonical lattice-to-lattice motion.
{
 const g=createEngine(98002);
 const original=put(g,5,10,0,false);
 window.__hexCaptureGarbageOriginalPile(g);
 const pack={type:"TEST",seq:2,pat:[[0,0]],colors:[1],ax:5,targetY:0,y:GARBAGE_START_Y,vy:RELEASE_INITIAL_VY,landed:false,_started:true,totalBalls:1,landedCount:0,entryBalls:[]};
 const info=window.__hexGarbageOriginalPileContactInfo(g,pack,0);
 const ok=materializeGarbageBallAtContact(g,pack,0,info.y);
 expect(ok,"failed to enter garbage onto lattice after original-pile contact");
 const entry=pack.entryBalls[0],ball=entry&&hexGarbageBoardBallById(g,entry.id);
 expect(ball&&ball.garbageGridEntered===true,"contacted garbage was not marked as grid-entered");
 expect(ball.garbageGridEntryFromOriginalPile===true,"original-pile contact metadata missing");
 expect(ball.garbageGridEntrySupportId===original.id,"wrong original support recorded");
 expect(window.__hexGarbageGridPathInvariant(ball),"post-contact garbage path left the lattice: "+JSON.stringify(ball.fallPath));
 const path=Array.isArray(ball.fallPath)?ball.fallPath:[];
 for(const seg of path){
   if(seg?.kind==="GARBAGE_PILE_CONTACT_HANDOFF")continue;
   if(!seg?.from||!seg?.to)continue;
   expect(Number.isInteger(seg.from[0])&&Number.isInteger(seg.from[1]),"non-grid segment origin after entry");
   expect(Number.isInteger(seg.to[0])&&Number.isInteger(seg.to[1]),"non-grid segment target after entry");
 }
}

// Canonical diagonal grid motion stays on a support circle, not the straight
// chord between cells.
{
 const g=createEngine(98003);
 const support=put(g,7,9,0,false);
 const moving=put(g,6,8,1,true);moving.garbagePileSettled=false;moving.garbageGridEntered=true;
 const seg={from:[6,8],to:[5,9],pivot:[7,9],kind:"ROLL_LEFT",motionSeq:1,pileFlow:true,pileFlowStart:0,pileFlowDuration:1,pileFlowEnd:1};
 moving.fallPath=[seg];
 window.__hexBindPileArcSegment(g,moving,seg);
 const p=pileFlowPointForBall(g,moving,seg,.5,.5);
 const sp=g.vis.get(support.id);
 const d=hexPhysDist(p[0],p[1],sp.x,sp.y);
 expect(Math.abs(d-1)<2e-5,"garbage grid roll lost support-circle radius: "+d);
 const chord=[(seg.from[0]+seg.to[0])*.5,(seg.from[1]+seg.to[1])*.5];
 expect(hexPhysDist(p[0],p[1],chord[0],chord[1])>.01,"garbage grid roll collapsed to a straight chord");
}

console.log("garbage original-pile -> lattice motion PASS");
`;

vm.runInNewContext(runtime+checks,{
 React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},
 ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
 Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date
},{timeout:120000});
