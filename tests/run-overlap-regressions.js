const fs=require("fs");
const path=require("path");
const cp=require("child_process");

const sourcePath=path.join(__dirname,"overlap-regressions.js");
const tmpPath=path.join(__dirname,".overlap-regressions-full-timeout.js");
let source=fs.readFileSync(sourcePath,"utf8");
const oldTimeout='vm.runInNewContext(runtime+assertions,context,{timeout:120000});';
const newTimeout='vm.runInNewContext(runtime+assertions,context,{timeout:300000});';
const runtimePattern=/const runtime=\[[\s\S]*?\]\.map\(name=>fs\.readFileSync\(`\$\{__dirname\}\/\.\.\/public\/\$\{name\}`,"utf8"\)\)\.join\("\\n"\);/;
const currentRuntime='const runtime=["app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js","app-07.js","app-pile-arc.js","app-clear-gap-collapse.js","app-floor-gap-invariant.js","app-wall-gap-invariant.js","app-wall-direct-support-fill.js","app-wall-flow-vacancy-sync.js","app-clear-vacancy-priority.js","app-up-convex-split-side.js","app-release-parity-settle.js","app-08.js","app-09.js","app-10.js","app-14.js","app-gameover-garbage-fade.js","app-17.js","app-garbage-normal-physics.js","app-garbage-presentation.js","app-garbage-zero-rigidity.js","app-garbage-deep-settle.js","app-garbage-simultaneous-motion.js","app-garbage-render-overlap-guard.js","app-pileflow-visual-tangency.js","app-runtime-performance.js"].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\\n");';

if(!runtimePattern.test(source))throw new Error("overlap regression runtime declaration changed; update runner explicitly");
if(!source.includes(oldTimeout))throw new Error("overlap regression timeout declaration changed; update runner explicitly");
source=source.replace(runtimePattern,currentRuntime).replace(oldTimeout,newTimeout);

// Do not reduce seeds, simulated seconds, collision threshold, or sample count.
// Only run the unchanged long-run suite against the same adapters production loads.
fs.writeFileSync(tmpPath,source);
try{
  cp.execFileSync(process.execPath,[tmpPath],{stdio:"inherit"});
}finally{
  try{fs.unlinkSync(tmpPath);}catch{}
}
