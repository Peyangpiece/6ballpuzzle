const assert=require('assert/strict'),vm=require('vm');
const{ctx}=require('./v1303-plan-group-smoke.js');
const report=vm.runInContext(`(()=>{
 let samples=0,mirrorError=0,minDistance=Infinity,maxUpward=0;
 for(const delta of[-.49,-.33,-.1,-.000001,0,.000001,.1,.33,.49]){
  let previous=null;
  for(let i=0;i<=200;i++){
   const t=i/200,points=[-1,0,1].map(side=>floorContactPoint(8-delta,8,side,t));
   for(let j=0;j<3;j++){
    const mirror=floorContactPoint(8+delta,8,-[-1,0,1][j],t);
    mirrorError=Math.max(mirrorError,Math.hypot(points[j][0]+mirror[0]-16,points[j][1]-mirror[1]));
    if(previous)maxUpward=Math.max(maxUpward,previous[j][1]-points[j][1]);
    for(let k=j+1;k<3;k++)minDistance=Math.min(minDistance,Math.hypot((points[j][0]-points[k][0])*.5,(points[j][1]-points[k][1])*HEX_ROW_H));
    if(!points[j].every(Number.isFinite))throw Error('Non-finite slide');
   }
   previous=points;samples++;
  }
 }
 return{samples,mirrorError,minDistance,maxUpward,
  leading:floorContactRollClock(7.67,8,-1).duration,
  trailing:floorContactRollClock(7.67,8,1).duration,
  nearZero:floorContactRollClock(8-1e-9,8,-1).duration,
  centred:floorContactRollClock(8,8,-1).duration};
})()`,ctx);
assert(report.mirrorError<1e-10);
assert(report.minDistance>=1-1e-10);
assert(report.maxUpward<1e-10);
assert(Math.abs(report.leading-4/30)<1e-10);
assert(Math.abs(report.trailing-5/30)<1e-10);
assert(Math.abs(report.nearZero-report.centred)<1e-8);
console.log('PASS reference floor slide clock',JSON.stringify(report));
