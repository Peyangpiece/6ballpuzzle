const fs=require("fs");
const vm=require("vm");

const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js",
  "app-06.js","app-07.js","app-08.js","app-09.js","app-10.js",
  "app-14.js","app-17.js","app-18.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const assertions=String.raw`
function expect(v,m){if(!v)throw new Error(m);}

// An unobstructed active triplet must always retain both rotation directions.
// Cover all six orientations at several fractional fall phases, including the
// end of a logical fall interval where the former max-future-Y check rejected
// otherwise legal rotations.
for(const frac of [0,.25,.70,.95]){
  for(let rot=0;rot<6;rot++){
    for(const dir of [-1,1]){
      const g=createEngine(7000+rot*20+(dir>0?1:2)+Math.round(frac*100));
      spawn(g);
      g.piece={x:SPAWN_X,y:-2,rot,colors:[0,1,2]};
      g.pieceVX=SPAWN_X;
      g.pieceVY=-2;
      g.freeX=null;
      g.dropT=g.dropInterval*frac;
      const beforeRot=g.piece.rot;
      expect(hexRotationRenderedSweepSafe(g,{...g.piece},{...g.piece,rot:(rot+(dir>0?1:5))%6},dir),
        'empty rendered sweep rejected rot='+rot+' dir='+dir+' frac='+frac);
      expect(rotate(g,dir),
        'legal rotation rejected rot='+rot+' dir='+dir+' frac='+frac);
      expect(g.piece.rot!==beforeRot,
        'rotation returned true without changing orientation');
    }
  }
}

// Continuous finger X is part of the rendered pose. It must not disable turns
// on an empty field just because the piece sits between logical columns.
for(const offset of [-.75,-.35,.35,.75]){
  const g=createEngine(8100+Math.round((offset+1)*100));spawn(g);
  g.freeX=SPAWN_X+offset;g.pieceVX=g.freeX;g.dropT=g.dropInterval*.82;
  expect(rotate(g,1),'sub-cell rotation rejected at offset '+offset);
}

console.log('rotation regressions PASS');
`;

const context={
  React:{useRef(){},useEffect(){},useState(){},useCallback(){}},
  window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date
};
vm.runInNewContext(runtime+assertions,context,{timeout:120000});
