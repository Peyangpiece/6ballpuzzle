const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { ctx } =
  require("./v1303-plan-group-smoke.js");

const CASES_PER_TYPE = 250;

const TYPES = [
  "blocked",
  "floor",
  "leftWall",
  "rightWall",
  "valley",
  "leftSupport",
  "rightSupport",
  "separator"
];

const OUTDIR =
  path.join(__dirname, "oracles");

const OUT =
  path.join(
    OUTDIR,
    "v1303-plan-group-directed-2000.jsonl"
  );

const META =
  path.join(
    OUTDIR,
    "v1303-plan-group-directed-2000.meta.json"
  );

fs.mkdirSync(OUTDIR, {
  recursive:true
});

function sha256(data) {
  return crypto
    .createHash("sha256")
    .update(data)
    .digest("hex");
}

function ball(
  id,
  gid,
  role,
  orientation
) {
  return {
    id,
    c:role % 5,
    motionGroupId:gid,
    motionGroupRole:role,
    motionGroupOrientation:orientation,
    motionGroupSize:3,
    rigid:true,
    momentumX:0,
    isGarbage:false
  };
}

function obstacle(id) {
  return {
    id,
    c:id % 5,
    motionGroupId:0,
    motionGroupRole:-1,
    motionGroupOrientation:"",
    motionGroupSize:0,
    rigid:false,
    momentumX:0,
    isGarbage:false
  };
}

function canonical(plan) {
  if (!Array.isArray(plan))
    return [];

  return plan.map(p => ({
    id:Number(p.ball?.id ?? -1),
    x:Number(p.x),
    y:Number(p.y),
    tx:Number(p.tx),
    ty:Number(p.ty),
    dx:Number(p.tx)-Number(p.x),
    dy:Number(p.ty)-Number(p.y),
    kind:String(p.kind || ""),
    bundleId:Number(p.bundleId || 0),
    groupSize:Number(p.groupSize || 0)
  })).sort((a,b)=>a.id-b.id);
}

function addObstacle(
  board,
  occupied,
  x,
  y,
  id
) {
  if (
    !ctx.__v1303OracleValid(x,y)
  ) return false;

  const key=`${x},${y}`;

  if (occupied.has(key))
    return false;

  board[y][x]=obstacle(id);
  occupied.add(key);

  return true;
}

function build(
  index,
  type
) {
  const board =
    ctx.__v1303OracleNewBoard();

  /*
   * Alternate UP/DOWN orientations
   * and vertical levels while keeping
   * all directed scenarios deterministic.
   */
  const orientation =
    index % 2
      ? "up"
      : "down";

  const yBase =
    2 + 2 * (index % 4);

  let base;

  if (orientation==="down") {
    base=[
      {x:7,y:yBase,role:0},
      {x:9,y:yBase,role:1},
      {x:8,y:yBase+1,role:2}
    ];
  } else {
    base=[
      {x:6,y:yBase+1,role:0},
      {x:7,y:yBase+2,role:1},
      {x:5,y:yBase+2,role:2}
    ];
  }

  /*
   * Wall cases are translated toward
   * the corresponding boundary.
   */
  if (type==="leftWall") {
    const min=
      Math.min(...base.map(m=>m.x));

    /*
     * X-only movement must be even in doubled-X space.
     * Move the leftmost member to x=1 while preserving parity.
     */
    const shift=
      1-min;

    base=base.map(m=>({
      ...m,
      x:m.x+shift
    }));
  }

  if (type==="rightWall") {
    const max=
      Math.max(...base.map(m=>m.x));

    /*
     * Preserve doubled-X parity.
     * x=17 is the symmetric reachable boundary target.
     */
    const shift=
      17-max;

    base=base.map(m=>({
      ...m,
      x:m.x+shift
    }));
  }

  /*
   * Floor scenarios are translated
   * as low as possible while preserving
   * the shape.
   */
  if (type==="floor") {
    const maxY=
      Math.max(...base.map(m=>m.y));

    /*
     * Vertical translation must also preserve x+y parity.
     * Therefore only an even number of rows may be translated
     * when X is unchanged.
     *
     * Use the largest even shift that keeps the triplet inside
     * the board. For some triangle orientations the physically
     * reachable bottom row is y=10 rather than y=11.
     */
    const room=
      Math.max(0,11-maxY);

    const shift=
      2*Math.floor(room/2);

    base=base.map(m=>({
      ...m,
      y:m.y+shift
    }));
  }

  const gid=
    900000+index;

  const members=[];

  const occupied=
    new Set();

  for (
    let i=0;
    i<base.length;
    i++
  ) {
    const m=base[i];

    if (
      !ctx.__v1303OracleValid(
        m.x,
        m.y
      )
    ) {
      throw new Error(
        `invalid directed member ${type} ${m.x},${m.y}`
      );
    }

    const b=
      ball(
        3000000+
          index*10+i,
        gid,
        m.role,
        orientation
      );

    board[m.y][m.x]=b;

    occupied.add(
      `${m.x},${m.y}`
    );

    members.push({
      ball:b,
      x:m.x,
      y:m.y,
      role:m.role,
      orientation
    });
  }

  let oid=
    5000000+
    index*100;

  const around=[
    [-2,0],
    [2,0],
    [-1,1],
    [1,1],
    [-1,-1],
    [1,-1]
  ];

  if (type==="blocked") {
    /*
     * Surround every exposed side.
     * This is deliberately much denser
     * than normal gameplay and exists to
     * capture the "must not move" path.
     */
    for (const m of base) {
      for (const [dx,dy] of around) {
        addObstacle(
          board,
          occupied,
          m.x+dx,
          m.y+dy,
          oid++
        );
      }
    }
  }

  if (type==="valley") {
    /*
     * Symmetric support beneath both
     * lower sides.
     */
    const low=
      [...base]
      .sort((a,b)=>b.y-a.y);

    for (const m of low.slice(0,2)) {
      addObstacle(
        board,
        occupied,
        m.x-1,
        m.y+1,
        oid++
      );

      addObstacle(
        board,
        occupied,
        m.x+1,
        m.y+1,
        oid++
      );
    }
  }

  if (type==="leftSupport") {
    const m=
      [...base]
      .sort((a,b)=>b.y-a.y)[0];

    addObstacle(
      board,
      occupied,
      m.x-1,
      m.y+1,
      oid++
    );
  }

  if (type==="rightSupport") {
    const m=
      [...base]
      .sort((a,b)=>b.y-a.y)[0];

    addObstacle(
      board,
      occupied,
      m.x+1,
      m.y+1,
      oid++
    );
  }

  if (type==="separator") {
    /*
     * Central protrusion immediately
     * beneath the triplet.
     */
    const cx=
      Math.round(
        base.reduce(
          (s,m)=>s+m.x,
          0
        )/3
      );

    const by=
      Math.max(...base.map(m=>m.y))+1;

    for (
      const dx of
      [0,-1,1,-2,2]
    ) {
      if (
        addObstacle(
          board,
          occupied,
          cx+dx,
          by,
          oid++
        )
      ) break;
    }
  }

  return {
    board,
    members,
    input:{
      index,
      type,
      orientation,
      members:
        base.map(m=>({
          x:m.x,
          y:m.y,
          role:m.role
        }))
    }
  };
}

function runCase(
  index,
  type,
  preview
) {
  const {
    board,
    members
  }=build(
    index,
    type
  );

  return canonical(
    ctx.hexPhysPlanGroup(
      board,
      members,
      preview
    )
  );
}

const fd=
  fs.openSync(
    OUT,
    "w"
  );

const counts={
  total:0,
  empty:0,
  rigid3:0,
  split:0,
  other:0,
  previewCommitMismatch:0
};

const byType={};
const kinds={};

let index=0;

for (const type of TYPES) {
  byType[type]={
    total:0,
    empty:0,
    rigid3:0,
    split:0,
    other:0
  };

  for (
    let n=0;
    n<CASES_PER_TYPE;
    n++
  ) {
    const preview=
      runCase(
        index,
        type,
        true
      );

    const commit=
      runCase(
        index,
        type,
        false
      );

    const same=
      JSON.stringify(preview)===
      JSON.stringify(commit);

    if (!same)
      counts.previewCommitMismatch++;

    const sig=
      new Set(
        preview.map(
          p=>`${p.dx},${p.dy}`
        )
      );

    let category;

    if (preview.length===0) {
      category="empty";
    } else if (
      preview.length===3 &&
      sig.size===1
    ) {
      category="rigid3";
    } else if (
      sig.size>1
    ) {
      category="split";
    } else {
      category="other";
    }

    counts.total++;
    counts[category]++;

    byType[type].total++;
    byType[type][category]++;

    for (const p of preview) {
      kinds[p.kind]=
        (kinds[p.kind]||0)+1;
    }

    fs.writeSync(
      fd,
      JSON.stringify({
        index,
        type,
        expected:{
          preview,
          commit
        }
      })+"\n"
    );

    index++;
  }
}

fs.closeSync(fd);

const bytes=
  fs.readFileSync(OUT);

const hash=
  sha256(bytes);

const meta={
  oracle:
    "v1303-plan-group-directed-2000",
  cases:index,
  casesPerType:
    CASES_PER_TYPE,
  types:TYPES,
  oracleSha256:hash,
  counts,
  byType,
  kinds
};

fs.writeFileSync(
  META,
  JSON.stringify(
    meta,
    null,
    2
  )+"\n"
);

console.log(
  "===== DIRECTED ORACLE SUMMARY ====="
);

console.log(
  JSON.stringify(
    counts,
    null,
    2
  )
);

console.log();
console.log(
  "===== BY TYPE ====="
);

console.log(
  JSON.stringify(
    byType,
    null,
    2
  )
);

console.log();
console.log(
  "===== EVENT KINDS ====="
);

console.log(
  JSON.stringify(
    kinds,
    null,
    2
  )
);

console.log();
console.log(
  "ORACLE SHA256:"
);

console.log(hash);

console.log();
console.log(
  "============================================"
);

console.log(
  " SUCCESS: 2000 DIRECTED V1303 CASES CAPTURED "
);

console.log(
  "============================================"
);
