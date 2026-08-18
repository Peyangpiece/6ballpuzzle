const {spawnSync}=require('child_process');

let failed=false;
for(const file of ['tests/known-bug-regressions-fast.js','tests/harddrop-contact-convergence.js']){
  const r=spawnSync(process.execPath,[file],{
    encoding:'utf8',maxBuffer:64*1024*1024,timeout:210000
  });
  process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');
  if(r.error)throw r.error;
  if(r.status!==0)failed=true;
}
if(failed)process.exitCode=1;
