const { useRef, useEffect, useState, useCallback } = React;
const W2=23,ROWS=13,CLEAR_MIN=6,TAU=Math.PI*2;
const BALL_RADIUS_N=0.5;
const HEX_ROW_H=Math.sqrt(3)/2;
const BOARD_TOP_CENTER_N=BALL_RADIUS_N;
const BOARD_FLOOR_N=1+(ROWS-1)*HEX_ROW_H;
const FLOOR_CENTER_N=BOARD_FLOOR_N-BALL_RADIUS_N;
const FLOOR_EPS=1e-7;
const cellCenterYNorm=row=>BOARD_TOP_CENTER_N+row*HEX_ROW_H;
const ballBottomYNorm=row=>cellCenterYNorm(row)+BALL_RADIUS_N;
const touchesFloorRow=row=>Math.abs(ballBottomYNorm(row)-BOARD_FLOOR_N)<=FLOOR_EPS;
const latticeRealX=x=>x*0.5;
const parityOK=(x,y)=>(((x+y)&1)===0);
const DIRS=[[2,0],[1,1],[-1,1],[-2,0],[-1,-1],[1,-1]];
const COLORS=[
 {base:"#FF3B4D",hi:"#FFC8CC",lo:"#7E0E1B",glow:"#FF6E7C",sym:"star"},
 {base:"#2E86FF",hi:"#BEDCFF",lo:"#0C3781",glow:"#63ABFF",sym:"wave"},
 {base:"#2FD36E",hi:"#BCF8D2",lo:"#0C6234",glow:"#5FEF98",sym:"cross"},
 {base:"#FFB020",hi:"#FFE9B8",lo:"#8A5602",glow:"#FFCB5F",sym:"bar"},
 {base:"#B255F0",hi:"#E9CCFF",lo:"#511D8C",glow:"#CE8AFF",sym:"arc"}
];
const WAZA={
 STRAIGHT:{jp:"ストレート",garbage:23,packs:1,hold:0.55,tint:"#A8FFCF"},
 PYRAMID:{jp:"ピラミッド",garbage:24,packs:4,hold:0.7,tint:"#FF9AD5"},
 HEXAGON:{jp:"ヘキサゴン",garbage:36,packs:6,hold:0.95,tint:"#FFD86B"}
};
const GARBAGE_SHAPES={
 STRAIGHT:[[0,0],[2,0],[4,0],[6,0],[8,0],[10,0],[12,0],[14,0],[16,0],[18,0],[20,0],[22,0],[1,1],[3,1],[5,1],[7,1],[9,1],[11,1],[13,1],[15,1],[17,1],[19,1],[21,1]],
 PYRAMID:[[2,0],[1,1],[3,1],[0,2],[2,2],[4,2]],
 HEXAGON:[[1,0],[3,0],[0,1],[4,1],[1,2],[3,2]]
};
const WAZA_PRIORITY=["HEXAGON","PYRAMID","STRAIGHT"];
const mulberry32=a=>()=>{a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};

/* Sound system is intentionally independent from physics. */
const Sfx={
 ctx:null,master:null,enabled:true,haptics:true,
 init(){if(this.ctx){if(this.ctx.state==="suspended")this.ctx.resume();return;}const C=window.AudioContext||window.webkitAudioContext;if(!C)return;this.ctx=new C();this.master=this.ctx.createGain();this.master.gain.value=.26;const comp=this.ctx.createDynamicsCompressor();comp.threshold.value=-18;comp.knee.value=18;comp.ratio.value=3.2;comp.attack.value=.003;comp.release.value=.16;this.master.connect(comp);comp.connect(this.ctx.destination);},
 tone({f=440,f2=null,d=.1,type="sine",v=1,delay=0,attack=.004}){if(!this.enabled||!this.ctx)return;const t0=this.ctx.currentTime+delay,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(Math.max(20,f),t0);if(f2)o.frequency.exponentialRampToValueAtTime(Math.max(20,f2),t0+d);g.gain.setValueAtTime(.0001,t0);g.gain.exponentialRampToValueAtTime(Math.max(.0002,v),t0+attack);g.gain.exponentialRampToValueAtTime(.0001,t0+d);o.connect(g);g.connect(this.master);o.start(t0);o.stop(t0+d+.03);},
 noise({d=.12,v=.18,f=1200,q=.7,delay=0}){if(!this.enabled||!this.ctx)return;const t0=this.ctx.currentTime+delay,n=Math.max(1,Math.floor(this.ctx.sampleRate*d)),buf=this.ctx.createBuffer(1,n,this.ctx.sampleRate),ch=buf.getChannelData(0);for(let i=0;i<n;i++)ch[i]=(Math.random()*2-1)*Math.pow(1-i/n,1.8);const src=this.ctx.createBufferSource();src.buffer=buf;const lp=this.ctx.createBiquadFilter();lp.type="lowpass";lp.frequency.value=f;lp.Q.value=q;const g=this.ctx.createGain();g.gain.value=v;src.connect(lp);lp.connect(g);g.connect(this.master);src.start(t0);},
 blip(f,delay=0,v=.06){this.tone({f,f2:f*1.07,d:.055,type:"square",v,delay,attack:.002});this.tone({f:f*2,f2:f*1.92,d:.04,type:"sine",v:v*.33,delay});},
 keyThock(vol=1){this.tone({f:126,f2:92,d:.085,type:"sine",v:.105*vol,attack:.0015});this.tone({f:218,f2:172,d:.052,type:"triangle",v:.05*vol,attack:.001});this.noise({d:.028,v:.055*vol,f:760,q:1.25});this.tone({f:74,f2:61,d:.11,type:"sine",v:.045*vol,delay:.009,attack:.002});},
 vib(p){if(!this.haptics)return;try{if(navigator.vibrate)navigator.vibrate(p);}catch(e){}},
 play(ev,vol=1){switch(ev.t){
  case"move":this.tone({f:238,f2:205,d:.038,type:"triangle",v:.028*vol,attack:.001});this.noise({d:.018,v:.018*vol,f:1100,q:.8});break;
  case"rotate":this.keyThock(vol);if(vol>.9)this.vib(5);break;
  case"land":this.tone({f:148,f2:92,d:.10,type:"sine",v:.115*vol,attack:.0015});this.tone({f:286,f2:214,d:.052,type:"triangle",v:.033*vol,attack:.001});this.noise({d:.035,v:.045*vol,f:680,q:1});if(vol>.9)this.vib(7);break;
  case"drop":this.tone({f:310,f2:108,d:.13,type:"triangle",v:.072*vol,attack:.0015});this.tone({f:115,f2:78,d:.15,type:"sine",v:.048*vol,attack:.002});this.noise({d:.045,v:.038*vol,f:930,q:.9});if(vol>.9)this.vib(10);break;
  case"clear":{const step=Math.min(7,Math.max(0,(ev.chain||1)-1)),root=622*Math.pow(1.075,step);[1,1.26,1.5].forEach((r,i)=>this.blip(root*r,i*.036,(.055+step*.004)*vol));this.tone({f:root/2,f2:root*.72,d:.12,type:"sine",v:.05*vol});if(vol>.9)this.vib(step>=2?[0,12,24,12]:10);break;}
  case"waza":{const seq={STRAIGHT:[659,784,988],PYRAMID:[523,659,784,1047],HEXAGON:[392,523,659,784,988,1319]}[ev.w]||[523,659,784];seq.forEach((f,i)=>{this.blip(f,i*.043,.075*vol);this.tone({f:f/2,d:.13,type:"sine",v:.025*vol,delay:i*.043});});this.tone({f:118,f2:62,d:.34,type:"sine",v:.13*vol});this.noise({d:.09,v:.055*vol,f:1800,delay:.03});if(vol>.9)this.vib(ev.w==="HEXAGON"?[0,32,22,32,22,60]:[0,20,22,38]);break;}
  case"fast":this.tone({f:182,f2:146,d:.045,type:"triangle",v:.038*vol,attack:.001});this.noise({d:.016,v:.016*vol,f:900,q:.8});if(vol>.9)this.vib(4);break;
  case"garbage":this.tone({f:170,f2:72,d:.28,type:"triangle",v:.12*vol});this.noise({d:.24,v:.17*vol,f:620});if(vol>.9)this.vib([0,45,24,52]);break;
  case"win":[659,784,988,1319].forEach((f,i)=>this.blip(f,i*.075,.08));this.vib([0,24,30,24,30,65]);break;
  case"lose":[440,370,311,220].forEach((f,i)=>this.tone({f,f2:f*.92,d:.22,type:"triangle",v:.075,delay:i*.085}));this.vib([0,90]);break;
 }}
};

/* Basic board storage only. All motion rules live in app-02/app-03. */
const valid=(x,y)=>y>=0&&y<ROWS&&x>=0&&x<W2&&parityOK(x,y);
const newBoard=()=>Array.from({length:ROWS},()=>Array(W2).fill(null));
const getC=v=>(v==null?null:typeof v==="number"?v:v.c);
function floorPackingScore(b,tx,ty){if(ty!==ROWS-1)return 0;let score=0;for(const nx of[tx-2,tx+2])if(nx>=0&&nx<W2&&b[ty][nx]!==null)score++;if(tx<=0||tx>=W2-1)score+=.5;return score;}
