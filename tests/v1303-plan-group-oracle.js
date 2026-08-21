const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/*
 * This loads the already-verified V1303 runtime.
 * The smoke test itself runs once during require().
 */
const { ctx, files } =
  require("./v1303-plan-group-smoke.js");

const CASES = 10000;
const SEED = 0x13030001;

const OUTDIR =
  path.join(__dirname, "oracles");

const OUT =
  path.join(
    OUTDIR,
    "v1303-plan-group-10000.jsonl"
  );

const META =
  path.join(
    OUTDIR,
    "v1303-plan-group-10000.meta.json"
  );

const PUBLIC =
  path.join(__dirname, "../public");

fs.mkdirSync(
  OUTDIR,
  { recursive: true }
);

function sha256(data) {
  return crypto
    .createHash("sha256")
    .update(data)
    .digest("hex");
}

function mulberry32(a) {
  return function() {
    a |= 0;
    a =
      (a + 0x6D2B79F5) | 0;

    let t =
      Math.imul(
        a ^ (a >>> 15),
        1 | a
      );

    t =
      (t +
        Math.imul(
          t ^ (t >>> 7),
          61 | t
        )) ^ t;

    return (
      (t ^ (t >>> 14)) >>> 0
    ) / 4294967296;
  };
}

const rnd =
  mulberry32(SEED);

const ri = n =>
  Math.floor(rnd() * n);

const chance = p =>
  rnd() < p;

function normalBall(
  id,
  color = 0
) {
  return {
    id,
    c: color,
    motionGroupId: 0,
    motionGroupRole: -1,
    motionGroupOrientation: "",
    motionGroupSize: 0,
    rigid: false,
    momentumX: 0,
    isGarbage: false
  };
}

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
    motionGroupOrientation:
      orientation,
    motionGroupSize: 3,

    rigid: true,
    momentumX: 0,
    isGarbage: false
  };
}

function canonical(plan) {
  if (!Array.isArray(plan))
    return [];

  return plan
    .map(p => {
      const x =
        Number(p.x);

      const y =
        Number(p.y);

      const tx =
        Number(p.tx);

      const ty =
        Number(p.ty);

      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(tx) ||
        !Number.isFinite(ty)
      ) {
        throw new Error(
          "non-finite planner result"
        );
      }

      return {
        id:
          Number(
            p.ball?.id ?? -1
          ),

        x,
        y,
        tx,
        ty,

        dx: tx - x,
        dy: ty - y,

        kind:
          String(
            p.kind || ""
          ),

        bundleId:
          Number(
            p.bundleId || 0
          ),

        groupSize:
          Number(
            p.groupSize || 0
          )
      };
    })
    .sort(
      (a, b) =>
        a.id - b.id ||
        a.x - b.x ||
        a.y - b.y
    );
}

function makeInput(index) {

  const orientation =
    chance(.5)
      ? "down"
      : "up";

  const base =
    orientation === "down"
      ? [
          {x:7,y:2,role:0},
          {x:9,y:2,role:1},
          {x:8,y:3,role:2}
        ]
      : [
          {x:6,y:3,role:0},
          {x:7,y:4,role:1},
          {x:5,y:4,role:2}
        ];

  /*
   * Even translations preserve
   * doubled-X hex parity.
   */
  const xShift =
    [-4,-2,0,2,4][ri(5)];

  const yShift =
    [0,2,4,6][ri(4)];

  const members =
    base.map(
      (m, i) => ({
        id:
          1000000 +
          index * 10 +
          i,

        x:
          m.x + xShift,

        y:
          m.y + yShift,

        role:
          m.role,

        orientation
      })
    );

  const occupied =
    new Set(
      members.map(
        m =>
          `${m.x},${m.y}`
      )
    );

  const obstacles = [];

  let oid =
    2000000 +
    index * 100;

  const minX =
    Math.max(
      0,
      Math.min(
        ...members.map(m=>m.x)
      ) - 4
    );

  const maxX =
    Math.min(
      18,
      Math.max(
        ...members.map(m=>m.x)
      ) + 4
    );

  const minY =
    Math.max(
      -1,
      Math.min(
        ...members.map(m=>m.y)
      ) - 2
    );

  const maxY =
    Math.min(
      11,
      Math.max(
        ...members.map(m=>m.y)
      ) + 4
    );

  const density =
    [0,.08,.14,.22,.32][ri(5)];

  for (
    let y=minY;
    y<=maxY;
    y++
  ) {
    for (
      let x=minX;
      x<=maxX;
      x++
    ) {

      if (!ctx.__v1303OracleValid(x,y))
        continue;

      const key =
        `${x},${y}`;

      if (occupied.has(key))
        continue;

      if (!chance(density))
        continue;

      obstacles.push({
        id: oid++,
        x,
        y,
        c: ri(5)
      });

      occupied.add(key);
    }
  }

  /*
   * Add a nearby deterministic
   * contact in most cases.
   * This increases slope/split coverage.
   */
  const scenario =
    index % 8;

  if (scenario >= 2) {

    const candidates = [];

    for (
      const m of members
    ) {
      for (
        const [dx,dy]
        of [
          [-2,0],
          [2,0],
          [-1,1],
          [1,1],
          [-1,-1],
          [1,-1]
        ]
      ) {
        candidates.push({
          x:m.x+dx,
          y:m.y+dy
        });
      }
    }

    const start =
      ri(candidates.length);

    for (
      let k=0;
      k<candidates.length;
      k++
    ) {

      const c =
        candidates[
          (start+k) %
          candidates.length
        ];

      const key =
        `${c.x},${c.y}`;

      if (
        ctx.__v1303OracleValid(c.x,c.y) &&
        !occupied.has(key)
      ) {
        obstacles.push({
          id: oid++,
          x:c.x,
          y:c.y,
          c:ri(5)
        });

        occupied.add(key);
        break;
      }
    }
  }

  return {
    index,
    scenario,
    orientation,
    members,
    obstacles
  };
}

function build(input) {

  const board =
    ctx.__v1303OracleNewBoard();

  const gid =
    500000 +
    input.index;

  const members =
    input.members.map(m => {

      const ball =
        groupBall(
          m.id,
          gid,
          m.role,
          m.orientation
        );

      board[m.y][m.x] =
        ball;

      return {
        ball,
        x:m.x,
        y:m.y,
        role:m.role,
        orientation:
          m.orientation
      };
    });

  for (
    const o of
    input.obstacles
  ) {
    board[o.y][o.x] =
      normalBall(
        o.id,
        o.c
      );
  }

  return {
    board,
    members
  };
}

function execute(
  input,
  preview
) {

  /*
   * Always construct a fresh board.
   * preview is therefore unable to
   * contaminate the commit result.
   */
  const {
    board,
    members
  } = build(input);

  return canonical(
    ctx.hexPhysPlanGroup(
      board,
      members,
      preview
    )
  );
}

function movementSignature(plan) {
  return new Set(
    plan.map(
      p =>
        `${p.dx},${p.dy}`
    )
  );
}

console.log();
console.log(
  "===== GENERATE V1303 GOLDEN ORACLE ====="
);

console.log(
  "CASES:",
  CASES
);

console.log(
  "SEED:",
  "0x" +
  SEED.toString(16)
);

const fd =
  fs.openSync(
    OUT,
    "w"
  );

const counts = {
  empty:0,
  rigid3:0,
  split:0,
  other:0,
  previewCommitMismatch:0
};

const kinds = {};

for (
  let i=0;
  i<CASES;
  i++
) {

  const input =
    makeInput(i);

  const preview =
    execute(
      input,
      true
    );

  const commit =
    execute(
      input,
      false
    );

  const same =
    JSON.stringify(preview) ===
    JSON.stringify(commit);

  if (!same) {
    counts
      .previewCommitMismatch++;
  }

  if (
    preview.length === 0
  ) {
    counts.empty++;

  } else if (
    preview.length === 3 &&
    movementSignature(
      preview
    ).size === 1
  ) {
    counts.rigid3++;

  } else if (
    movementSignature(
      preview
    ).size > 1
  ) {
    counts.split++;

  } else {
    counts.other++;
  }

  for (
    const p of preview
  ) {
    kinds[p.kind] =
      (kinds[p.kind] || 0) +
      1;
  }

  fs.writeSync(
    fd,
    JSON.stringify({
      index:i,
      input,
      expected:{
        preview,
        commit
      }
    }) + "\n"
  );

  if (
    (i+1) % 1000 === 0
  ) {
    console.log(
      `generated ${i+1} / ${CASES}`
    );
  }
}

fs.closeSync(fd);

const oracleBytes =
  fs.readFileSync(OUT);

const oracleSha256 =
  sha256(
    oracleBytes
  );

const runtimeHashes = {};

for (
  const file of files
) {
  runtimeHashes[file] =
    sha256(
      fs.readFileSync(
        path.join(
          PUBLIC,
          file
        )
      )
    );
}

const meta = {
  oracle:
    "v1303-plan-group-10000",

  count:
    CASES,

  seed:
    "0x" +
    SEED.toString(16),

  oracleSha256,

  counts,

  kinds,

  runtimeHashes
};

fs.writeFileSync(
  META,
  JSON.stringify(
    meta,
    null,
    2
  ) + "\n"
);

console.log();
console.log(
  "===== ORACLE SUMMARY ====="
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

console.log(
  oracleSha256
);

console.log();
console.log(
  "======================================="
);

console.log(
  " SUCCESS: 10000 V1303 CASES CAPTURED "
);

console.log(
  "======================================="
);
