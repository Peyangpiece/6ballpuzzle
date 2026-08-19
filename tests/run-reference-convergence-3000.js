const fs=require("fs");
const path=require("path");
const cp=require("child_process");

const sourcePath=path.join(__dirname,"reference-convergence-3000.js");
const tmpPath=path.join(__dirname,".reference-convergence-3000-production-frame.js");
let source=fs.readFileSync(sourcePath,"utf8");

// The 3000 samples are a frozen capture-reference baseline. Production policy
// adapters are covered by dedicated current-runtime tests; do not reinterpret
// those capture samples through newer clear/garbage policy layers.
const oldGarbageAt='function garbageAt(seed,type,height,dt,total){const g=createEngine(seed);flat(g,height,seed);g.garbShapes=[type];prepareGarbageBatch(g);while(g.garbageClock<total-1e-10)updateGarbagePacks(g,Math.min(dt,total-g.garbageClock));return g.activeGarbagePacks[0];}';
const newGarbageAt='function garbageAt(seed,type,height,dt,total){const g=createEngine(seed);flat(g,height,seed);g.garbShapes=[type];prepareGarbageBatch(g);while(g.garbageClock<total-1e-10){const h=Math.min(dt,total-g.garbageClock);updateGarbagePacks(g,h);updateVisuals(g,h);resolveVisualContacts(g);}return g.activeGarbagePacks[0];}';
const oldRound3='while(t<2.5&&!g.activeGarbagePacks[0]?.landed){updateGarbagePacks(g,PHYSICS_FRAME);t+=PHYSICS_FRAME;}';
const newRound3='while(t<2.5&&!g.activeGarbagePacks[0]?.landed){updateGarbagePacks(g,PHYSICS_FRAME);updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);t+=PHYSICS_FRAME;}';

if(!source.includes(oldGarbageAt))throw new Error("reference-convergence-3000 garbage trajectory helper changed; update runner explicitly");
if(!source.includes(oldRound3))throw new Error("reference-convergence-3000 garbage completion loop changed; update runner explicitly");
source=source.replace(oldGarbageAt,newGarbageAt).replace(oldRound3,newRound3);

fs.writeFileSync(tmpPath,source);
try{
  cp.execFileSync(process.execPath,[tmpPath],{stdio:"inherit"});
}finally{
  try{fs.unlinkSync(tmpPath);}catch{}
}
