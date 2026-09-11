// Original directed-oracle fixture builder; shared by historical and production audits.
module.exports=function directedBuilder(ctx){
function groupBall(
  id,
  gid,
  role,
  orientation
) {
  return {
    id,
    c: role % 5,

    motionGroupId: gid,
    motionGroupRole: role,
    motionGroupOrientation: orientation,
    motionGroupSize: 3,

    rigid: true,
    momentumX: 0,
    isGarbage: false
  };
}

function obstacle(id) {
  return {
    id,
    c: id % 5,

    motionGroupId: 0,
    motionGroupRole: -1,
    motionGroupOrientation: "",
    motionGroupSize: 0,

    rigid: false,
    momentumX: 0,
    isGarbage: false
  };
}

function addObstacle(
  board,
  occupied,
  x,
  y,
  id
) {
  if (!ctx.__shadowValid(x,y))
    return false;

  const key = `${x},${y}`;

  if (occupied.has(key))
    return false;

  board[y][x] =
    obstacle(id);

  occupied.add(key);

  return true;
}

function build(
  index,
  type
) {
  const board =
    ctx.__shadowNewBoard();

  const orientation =
    index % 2
      ? "up"
      : "down";

  const yBase =
    2 + 2 * (index % 4);

  let base;

  if (orientation === "down") {
    base = [
      {x:7,y:yBase,role:0},
      {x:9,y:yBase,role:1},
      {x:8,y:yBase+1,role:2}
    ];
  } else {
    base = [
      {x:6,y:yBase+1,role:0},
      {x:7,y:yBase+2,role:1},
      {x:5,y:yBase+2,role:2}
    ];
  }

  /*
   * Same lattice-preserving transforms
   * used when the locked Directed Oracle
   * was generated.
   */

  if (type === "leftWall") {
    const min =
      Math.min(
        ...base.map(m=>m.x)
      );

    const shift =
      1 - min;

    base = base.map(m=>({
      ...m,
      x:m.x+shift
    }));
  }

  if (type === "rightWall") {
    const max =
      Math.max(
        ...base.map(m=>m.x)
      );

    const shift =
      17 - max;

    base = base.map(m=>({
      ...m,
      x:m.x+shift
    }));
  }

  if (type === "floor") {
    const maxY =
      Math.max(
        ...base.map(m=>m.y)
      );

    const room =
      Math.max(
        0,
        11-maxY
      );

    const shift =
      2 * Math.floor(
        room/2
      );

    base = base.map(m=>({
      ...m,
      y:m.y+shift
    }));
  }

  const gid =
    900000 + index;

  const members = [];

  const occupied =
    new Set();

  for (
    let i=0;
    i<base.length;
    i++
  ) {
    const m =
      base[i];

    if (
      !ctx.__shadowValid(
        m.x,
        m.y
      )
    ) {
      throw new Error(
        `invalid directed member ${type} ${m.x},${m.y}`
      );
    }

    const b =
      groupBall(
        3000000 +
          index*10+i,
        gid,
        m.role,
        orientation
      );

    board[m.y][m.x] =
      b;

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

  let oid =
    5000000 +
    index*100;

  const around = [
    [-2,0],
    [2,0],
    [-1,1],
    [1,1],
    [-1,-1],
    [1,-1]
  ];

  if (type === "blocked") {
    for (const m of base) {
      for (
        const [dx,dy]
        of around
      ) {
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

  if (type === "valley") {
    const low =
      [...base]
      .sort(
        (a,b)=>b.y-a.y
      );

    for (
      const m of
      low.slice(0,2)
    ) {
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

  if (type === "leftSupport") {
    const m =
      [...base]
      .sort(
        (a,b)=>b.y-a.y
      )[0];

    addObstacle(
      board,
      occupied,
      m.x-1,
      m.y+1,
      oid++
    );
  }

  if (type === "rightSupport") {
    const m =
      [...base]
      .sort(
        (a,b)=>b.y-a.y
      )[0];

    addObstacle(
      board,
      occupied,
      m.x+1,
      m.y+1,
      oid++
    );
  }

  if (type === "separator") {
    const cx =
      Math.round(
        base.reduce(
          (sum,m)=>sum+m.x,
          0
        ) / 3
      );

    const by =
      Math.max(
        ...base.map(m=>m.y)
      ) + 1;

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
      ) {
        break;
      }
    }
  }

  return {
    board,
    members
  };
}

return build;
};
