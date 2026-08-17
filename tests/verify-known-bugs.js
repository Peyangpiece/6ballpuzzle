const {spawnSync}=require('child_process');

function runTargeted(){
  const r=spawnSync(process.execPath,['tests/audit-targeted-first-failures.js'],{encoding:'utf8',maxBuffer:64*1024*1024});
  process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');
  const marker='TARGETED_FAILURES ';
  const i=(r.stdout||'').indexOf(marker);
  if(i<0)throw new Error('targeted audit did not emit JSON');
  const data=JSON.parse((r.stdout||'').slice(i+marker.length));
  const failures=Object.entries(data).filter(([,v])=>v!=null);
  console.log('KNOWN_BUG_GATE',JSON.stringify({failures:failures.map(([k])=>k)},null,2));
  if(failures.length)process.exitCode=1;
}
runTargeted();
