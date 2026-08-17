const fs=require("fs");
const path=require("path");
const cp=require("child_process");

const sourcePath=path.join(__dirname,"garbage-fidelity-100.js");
const tmpPath=path.join(__dirname,".garbage-fidelity-100-production-stack.js");
const indexPath=path.join(__dirname,"../public/index.html");
let source=fs.readFileSync(sourcePath,"utf8");

const productionNames=[...fs.readFileSync(indexPath,"utf8").matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
if(!productionNames.length||!productionNames.includes("app-01.js"))throw new Error("could not derive production app runtime from public/index.html");
const runtimeDecl=/const runtimeNames=\[[\s\S]*?\];\nconst runtime=runtimeNames\.map\(read\)\.join\("\\n"\);/;
if(!runtimeDecl.test(source))throw new Error("garbage fidelity runtime declaration changed; update production runner explicitly");
const replacement=`const runtimeNames=[${productionNames.map(n=>JSON.stringify(n)).join(",")}];\nconst runtime=runtimeNames.map(read).join("\\n");`;
source=source.replace(runtimeDecl,replacement);

fs.writeFileSync(tmpPath,source);
try{
  cp.execFileSync(process.execPath,[tmpPath],{stdio:"inherit"});
}finally{
  try{fs.unlinkSync(tmpPath);}catch{}
}
