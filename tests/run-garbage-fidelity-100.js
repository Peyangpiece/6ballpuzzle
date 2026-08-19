const fs=require("fs");
const path=require("path");
const cp=require("child_process");

const sourcePath=path.join(__dirname,"garbage-fidelity-100.js");
const tmpPath=path.join(__dirname,".garbage-fidelity-100-current-runtime.js");
let source=fs.readFileSync(sourcePath,"utf8");

const runtimePattern=/const runtimeNames=\[[\s\S]*?\];\nconst runtime=runtimeNames\.map\(read\)\.join\("\\n"\);/;
// This suite measures garbage flight/contact fidelity. Use the current garbage
// adapters without unrelated clear/floor/wall policy overrides; those policies
// are covered by their own dedicated production regressions.
const currentRuntime='const runtimeNames=["app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js","app-07.js","app-08.js","app-09.js","app-10.js","app-14.js","app-gameover-garbage-fade.js","app-17.js","app-garbage-normal-physics.js","app-garbage-presentation.js","app-garbage-zero-rigidity.js","app-garbage-deep-settle.js","app-garbage-simultaneous-motion.js","app-garbage-render-overlap-guard.js"];\nconst runtime=runtimeNames.map(read).join("\\n");';

if(!runtimePattern.test(source))throw new Error("garbage-fidelity-100 runtime declaration changed; update runner explicitly");
source=source.replace(runtimePattern,currentRuntime);

fs.writeFileSync(tmpPath,source);
try{
  cp.execFileSync(process.execPath,[tmpPath],{stdio:"inherit"});
}finally{
  try{fs.unlinkSync(tmpPath);}catch{}
}
