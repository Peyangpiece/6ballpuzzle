// Full source comparison for the 2026-10-13 ordinary clear (RMS 8 / max 17,
// the same limits as the other reference motion comparisons).  Not a CI gate
// while the maximum is unmet: the riding yellow [7,8] follows green's arc,
// whereas the capture shows it sinking onto green first and rolling off last.
const{replay,compare}=require('./reference-clear-20261013-collapse.js');
const c=compare(replay());
const status=c.rms<=8&&c.max<=17?'within_existing_motion_tolerance':'UNMATCHED';
console.log('2026-10-13 clear source comparison',JSON.stringify({status,rms:c.rms,max:c.max,worst:c.worst}));
process.exitCode=status==='UNMATCHED'?1:0;
