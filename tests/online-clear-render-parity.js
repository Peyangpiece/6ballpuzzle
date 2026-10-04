// Exercise the real remote render adapter without Firebase/account access.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const calls=[],states=[];
const context={window:{},performance:{now:()=>0},W2:19,HEX_ROW_H:Math.sqrt(3)/2,
 Map,Set,Math,Date,Number,Array,Object,JSON,
 valid:(x,y)=>y>=0&&y<12&&x>=0&&x<19&&((x+y)&1)===1,
 drawSide(){},drawBall:(ctx,x,y,d,c,opts)=>calls.push({x,y,d,c,opts}),
 clearVisualState:(progress,hold)=>{states.push({progress,hold});return{scale:.8,alpha:1};}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('public/app-online-v2.js','utf8'),context);
const board=Array.from({length:12},()=>Array(19).fill(null));
const ball={id:1,c:1};board[9][0]=ball;
const g={state:'NET',board,fx:{},__remoteClear:{base:.5,hold:2.25,receivedAt:0,cells:[[0,9,1],[2,9,2]]}};
const canvas={save(){},restore(){},beginPath(){},rect(){},clip(){}};
context.drawSide(canvas,g,{D:40,DX:42,X:20,Y:80,BW:380,BH:420},1,0,'','','',0);
assert.deepEqual(states,[{progress:.5,hold:2.25}],'Remote clear discards technique hold');
assert.equal(calls.length,2);assert.equal(calls[0].x,21);assert.equal(calls[1].x,63);
assert(calls.every(c=>c.opts.ring===0),'Remote renderer adds an obsolete body ring');
assert.equal(board[9][0],ball,'Remote rendering permanently hides canonical cells');
console.log('remote clear timing / lattice render parity PASS');
