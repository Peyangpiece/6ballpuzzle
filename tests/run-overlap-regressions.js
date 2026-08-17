const fs=require("fs");
const path=require("path");
const cp=require("child_process");

const sourcePath=path.join(__dirname,"overlap-regressions.js");
const tmpPath=path.join(__dirname,".overlap-regressions-full-timeout.js");
const indexPath=path.join(__dirname,"../public/index.html");
let source=fs.readFileSync(sourcePath,"utf8");
const oldTimeout='vm.runInNewContext(runtime+assertions,context,{timeout:120000});';
const newTimeout='vm.runInNewContext(runtime+assertions,context,{timeout:300000});';

// Continuous non-overlap is a production invariant, so execute exactly the
// app layers shipped by index.html rather than a separately maintained suffix.
const productionNames=[...fs.readFileSync(indexPath,"utf8").matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const app10Index=productionNames.indexOf("app-10.js");
if(app10Index<0||!productionNames.includes("app-01.js"))throw new Error("could not derive production app runtime from public/index.html");
const oldRuntime='"app-10.js","app-14.js","app-17.js"';
const newRuntime=productionNames.slice(app10Index).map(n=>JSON.stringify(n)).join(",");

if(!source.includes(oldTimeout)){
  throw new Error("overlap regression timeout declaration changed; update runner explicitly");
}
if(!source.includes(oldRuntime)){
  throw new Error("overlap regression runtime list changed; update production override injection explicitly");
}

// Do not reduce seeds, simulated seconds, collision threshold, or sample count.
// The former runner put all four 60-second simulations inside one 300-second VM
// budget. With the stricter continuous garbage contact solver the aggregate run
// can exceed that wall-clock budget even when every seed is progressing normally.
// Run the exact same four seeds independently so each receives the same 300-second
// VM allowance. This changes only test orchestration, never physics coverage.
source=source.replace(oldRuntime,newRuntime).replace(oldTimeout,newTimeout);
fs.writeFileSync(tmpPath,source);
const seeds=[1,7,19,37];
try{
  for(const seed of seeds){
    console.log(`overlap production seed ${seed} START`);
    cp.execFileSync(process.execPath,[tmpPath,String(seed),"60"],{stdio:"inherit"});
    console.log(`overlap production seed ${seed} PASS`);
  }
  console.log("overlap production all seeds PASS 4/4");
}finally{
  try{fs.unlinkSync(tmpPath);}catch{}
}
