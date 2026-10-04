// An intentionally failing source comparison, not a production CI gate.
// Keep the observed gap visible while post-clear pile timing is investigated.
const vm=require('vm'),fs=require('fs'),path=require('path');
const{ctx}=require('./v1303-plan-group-smoke.js');
ctx.referenceClearBoard=require('./fixtures/reference-clear-timing-20260814.json').ordinaryBoard.cells;
const replay=vm.runInContext(`(()=>{
 const g=createEngine(598);g.state='RESOLVING';g.phase='CLEAR';g.stateT=0;g.holdT=.4;
 const ids={};for(const[x,y,c]of referenceClearBoard){const b=mkBall(g,c);g.board[y][x]=b;setVis(g,b,x,y,0);if(x===11&&y===8)ids.upper=b.id;if(x===12&&y===9)ids.lower=b.id;}
 const group=findGroups(g.board)[0];
 g.clearing={cells:group.cells.map(([x,y])=>[x,y,g.board[y][x].c,g.board[y][x].id]),ids:new Set(group.cells.map(([x,y])=>g.board[y][x].id)),waza:[],committed:false,ghosts:[]};
 const out=[];for(let frame=600;frame<=630;frame++){
  for(let i=0;i<4;i++)stepEngine(g,1/120);
  const positions={};for(const[role,id]of Object.entries(ids)){const v=g.vis.get(id);positions[role]={x:291.5+v.x*32.2,y:875.5+(v.y-11)*63.4*HEX_ROW_H};}
  out.push({frame,positions});
 }
 return out;
})()`,ctx);
// Source clip 3 circle centres. Missed detections excluded, never interpolated.
const source=[
 [612,'upper',643.5,711.5],[612,'lower',678.5,775.5],
 [614,'upper',647.5,722.5],[614,'lower',678.5,798.5],
 [616,'upper',644.5,740.5],[616,'lower',676.5,823.5],
 [618,'upper',646.5,769.5],[618,'lower',677.5,852.5],
 [620,'upper',645.5,799.5],[622,'upper',636.5,825.5],
 [624,'upper',619.5,850.5],[624,'lower',675.5,876.5],
 [626,'upper',612.5,877.5],[626,'lower',677.5,875.5]
];
const errors=source.map(([frame,role,x,y])=>{const actual=replay.find(r=>r.frame===frame).positions[role];return{frame,role,source:{x,y},actual,error:Math.hypot(actual.x-x,actual.y-y)};});
const rms=Math.sqrt(errors.reduce((n,q)=>n+q.error*q.error,0)/errors.length),max=Math.max(...errors.map(q=>q.error));
const report={status:rms<=8&&max<=17?'within_existing_motion_tolerance':'UNMATCHED',sourceClip:3,sourceAnchorFrame:599,scope:'Reconstructed 21-ball ordinary-clear board, two green ball trajectories, 14 measured centres; source phase anchor is inferred',rms,max,errors,replay};
if(process.env.REVIEW_OUTPUT){fs.mkdirSync(process.env.REVIEW_OUTPUT,{recursive:true});fs.writeFileSync(path.join(process.env.REVIEW_OUTPUT,'post-clear-source-diagnostic.json'),JSON.stringify(report,null,2)+'\n');}
console.log('Post-clear source comparison',JSON.stringify({status:report.status,rms,max}));
process.exitCode=report.status==='UNMATCHED'?1:0;
