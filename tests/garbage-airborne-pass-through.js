const fs=require("fs");
const vm=require("vm");

const runtime=["app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js"]
  .map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const assertions=String.raw`
function expect(value,message){if(!value)throw new Error(message);}
const close=(a,b,e=1e-9)=>Math.abs(a-b)<=e;

const falling={
  type:"TEST",seq:1,pat:[[0,0]],ax:4,targetY:0,
  y:GARBAGE_START_Y,vy:0,landed:false,_started:true,actualStartTime:.5
};
const earlierAirborne={
  type:"TEST",seq:0,pat:[[0,0]],ax:4,targetY:0,
  y:-1,vy:8,landed:false,_started:true,actualStartTime:0
};

const empty={vis:new Map(),activeGarbagePacks:[falling]};
const floorContact=hexGarbageFlightContactY(empty,falling);

// An earlier airborne garbage packet directly below the falling packet must
// not become a collision surface. The later packet keeps the same free-fall
// contact limit it would have on an otherwise empty board.
const airborneOnly={vis:new Map(),activeGarbagePacks:[earlierAirborne,falling]};
const airborneContact=hexGarbageFlightContactY(airborneOnly,falling);
expect(close(airborneContact,floorContact),"airborne garbage incorrectly triggered lattice contact");
expect(!/activeGarbagePacks/.test(hexGarbageFlightContactY.toString()),"airborne garbage was reintroduced into the contact solver");

// A real accumulated pile ball remains a valid transition surface. Once the
// falling garbage reaches this continuous circle contact, it may materialize
// and begin ordinary lattice motion.
const pile={vis:new Map([[9001,{x:4,y:4}]]),activeGarbagePacks:[earlierAirborne,falling]};
const pileContact=hexGarbageFlightContactY(pile,falling);
const expectedPileContact=4-1/HEX_ROW_H;
expect(close(pileContact,expectedPileContact),"pile contact no longer uses continuous one-diameter collision");
expect(pileContact<floorContact,"pile ball did not trigger contact before the floor");

console.log("garbage airborne pass-through PASS");
`;

vm.runInNewContext(runtime+assertions,{
  React:{useRef(){},useEffect(){},useState(){},useCallback(){}},
  window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date
});
