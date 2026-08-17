const fs=require("fs");
const path=require("path");
const cp=require("child_process");

const sourcePath=path.join(__dirname,"reference-convergence-3000.js");
const tmpPath=path.join(__dirname,".reference-convergence-3000-production-frame.js");
const indexPath=path.join(__dirname,"../public/index.html");
let source=fs.readFileSync(sourcePath,"utf8");

// Always execute the exact production app stack from index.html. Keeping a
// separate hard-coded test list let later correction layers be deployed without
// taking part in the convergence suite.
const productionNames=[...fs.readFileSync(indexPath,"utf8").matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
if(!productionNames.length||!productionNames.includes("app-01.js"))throw new Error("could not derive production app runtime from public/index.html");
const oldNames='const names=["app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js","app-07.js","app-08.js","app-09.js","app-10.js","app-14.js"];';
const newNames=`const names=[${productionNames.map(n=>JSON.stringify(n)).join(",")}];`;
const oldRound3='while(t<2.5&&!g.activeGarbagePacks[0]?.landed){updateGarbagePacks(g,PHYSICS_FRAME);t+=PHYSICS_FRAME;}';
const newRound3='while(t<2.5&&!g.activeGarbagePacks[0]?.landed){updateGarbagePacks(g,PHYSICS_FRAME);updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);t+=PHYSICS_FRAME;}';

if(!source.includes(oldNames))throw new Error("reference-convergence-3000 runtime list changed; update runner explicitly");
if(!source.includes(oldRound3))throw new Error("reference-convergence-3000 garbage completion loop changed; update runner explicitly");
source=source.replace(oldNames,newNames).replace(oldRound3,newRound3);

fs.writeFileSync(tmpPath,source);
try{
  cp.execFileSync(process.execPath,[tmpPath],{stdio:"inherit"});
}finally{
  try{fs.unlinkSync(tmpPath);}catch{}
}
