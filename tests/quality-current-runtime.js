// Reproducible full review: the actual deployment gates plus CPU and startup.
const fs=require("fs"),path=require("path"),{spawn}=require("child_process");
const root=path.join(__dirname,"..");
const workflow=fs.readFileSync(path.join(root,".github/workflows/validate.yml"),"utf8");
const scripts=[...new Set([...workflow.matchAll(/node (tests\/[\w.-]+\.js)/g)].map(m=>m[1]))];
scripts.push("tests/ai-superhuman-authoritative-v3.js","tests/landscape-startup.js");
const jobs=scripts.map(file=>({file}));
for(const fps of [30,60,120,240])for(const file of ["tests/no-upward-bounce-split-continuity-v1.js","tests/reference-video-motion.js","tests/reference-capture-motion-parity.js","tests/reference-inverted-pocket-motion.js"]){
  jobs.push({file,fps});
}
const results=[];
const out=process.env.REVIEW_OUTPUT||path.join(root,"audit-results","quality-2026-10-02");
fs.mkdirSync(out,{recursive:true});
let cursor=0;
async function worker(){
  while(cursor<jobs.length){
    const job=jobs[cursor++],started=Date.now();
    const result=await new Promise(resolve=>{
      const child=spawn(process.execPath,[job.file],{cwd:root,env:{...process.env,...(job.fps?{TEST_FPS:String(job.fps)}:{})}});
      let output="",timedOut=false;
      const timer=setTimeout(()=>{timedOut=true;child.kill("SIGTERM");},240000);
      child.stdout.on("data",data=>output+=data);child.stderr.on("data",data=>output+=data);
      child.on("error",error=>output+=error.stack);
      child.on("close",code=>{clearTimeout(timer);resolve({...job,code,timedOut,seconds:Math.round((Date.now()-started)/100)/10,output});});
    });
    const label=path.basename(job.file,".js")+(job.fps?"-"+job.fps+"fps":"");
    fs.writeFileSync(path.join(out,label+".log"),result.output.replace(/[ \t]+$/gm,""));
    results.push({...result,output:undefined,log:label+".log"});
    console.log((result.code===0?"PASS":"FAIL")+" "+label+" "+result.seconds+"s");
  }
}
(async()=>{
  await Promise.all([worker(),worker(),worker()]);
  results.sort((a,b)=>(a.file+String(a.fps||0)).localeCompare(b.file+String(b.fps||0)));
  const failures=results.filter(r=>r.code!==0);
  fs.writeFileSync(path.join(out,"results.json"),JSON.stringify({date:"2026-10-02",passed:results.length-failures.length,total:results.length,results},null,2)+"\n");
  console.log("QUALITY REVIEW "+(results.length-failures.length)+"/"+results.length);
  process.exitCode=failures.length?1:0;
})();
