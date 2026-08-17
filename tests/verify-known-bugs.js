const {spawnSync}=require('child_process');

const r=spawnSync(process.execPath,['tests/known-bug-regressions-fast.js'],{
  encoding:'utf8',maxBuffer:64*1024*1024,timeout:210000
});
process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');
if(r.error)throw r.error;
if(r.status!==0)process.exitCode=1;
