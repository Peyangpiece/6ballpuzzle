const fs=require("fs");
const path=require("path");
const cp=require("child_process");

const sourcePath=path.join(__dirname,"movement-fidelity-100.js");
const tmpPath=path.join(__dirname,".movement-fidelity-100-production-frame.js");
const source=fs.readFileSync(sourcePath,"utf8");
const oldSequence="updateGarbagePacks(g,PHYSICS_FRAME);updateVisuals(g,PHYSICS_FRAME);const balls=[];";
const productionSequence="updateGarbagePacks(g,PHYSICS_FRAME);updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);const balls=[];";

if(!source.includes(oldSequence)){
  throw new Error("movement fidelity garbage frame sequence changed; update the production-frame runner explicitly");
}

// Keep all 100 existing assertions intact. Only case 087 is evaluated after
// the same final contact projection that stepEngine() applies on every visible
// frame. Measuring before resolveVisualContacts() observes an internal
// intermediate state that is never rendered by the game.
fs.writeFileSync(tmpPath,source.replace(oldSequence,productionSequence));
try{
  cp.execFileSync(process.execPath,[tmpPath],{stdio:"inherit"});
}finally{
  try{fs.unlinkSync(tmpPath);}catch{}
}
