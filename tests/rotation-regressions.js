const fs=require("fs");
const vm=require("vm");

const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js",
  "app-06.js","app-07.js","app-08.js","app-09.js","app-10.js",
  "app-14.js","app-17.js","app-18.js","app-19.js","app-20.js","app-21.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const assertions=String.raw`
function expect(v,m){if(!v)throw new Error(m);}

// An unobstructed active triplet must always retain both rotation directions.
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
      expect(rotate(g,dir),'legal rotation rejected rot='+rot+' dir='+dir+' frac='+frac);
      expect(g.piece.rot!==beforeRot,'rotation returned true without changing orientation');
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

// Wall regression: find the actual leftmost/rightmost legal anchor for every
// orientation and require both turn directions there. The final kicked piece
// must remain fully legal even though the 0.10 s visual sweep may overhang the
// wall by a tiny amount.
for(let rot=0;rot<6;rot++){
  const anchors=[];
  for(let x=0;x<W2;x++){
    const p={x,y:2,rot,colors:[0,1,2]};
    if(pieceFits(newBoard(),p))anchors.push(x);
  }
  expect(anchors.length>1,'no legal wall anchors for rot='+rot);
  for(const edge of [anchors[0],anchors[anchors.length-1]]){
    for(const dir of [-1,1]){
      const g=createEngine(9000+rot*100+edge*3+(dir>0?1:2));
      g.state='PLAYING';
      g.piece={x:edge,y:2,rot,colors:[0,1,2]};
      g.pieceVX=edge;g.pieceVY=2;g.freeX=null;g.dropT=g.dropInterval*.55;
      expect(rotate(g,dir),'wall rotation rejected rot='+rot+' x='+edge+' dir='+dir);
      expect(pieceFits(g.board,g.piece),'wall rotation finished outside the board');
    }
  }
}

console.log('rotation regressions PASS');
`;

const context={
  React:{useRef(){},useEffect(){},useState(){},useCallback(){}},
  window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date
};
vm.runInNewContext(runtime+assertions,context,{timeout:120000});
