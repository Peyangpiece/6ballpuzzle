const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const randomRuntime =
  require("./v1303-rigidity-shadow-audit.js");

const directedRuntime =
  require("./v1303-rigidity-shadow-directed-audit.js");

const {
  planners,
  canonical,
  buildRandom
} = randomRuntime;

const {
  buildDirected
} = directedRuntime;

if (planners.length !== 6) {
  throw new Error(
    "Expected BASE + five resolver planners"
  );
}

const RANDOM_ORACLE = path.join(
  __dirname,
  "oracles",
  "v1303-plan-group-10000.jsonl"
);

const DIRECTED_ORACLE = path.join(
  __dirname,
  "oracles",
  "v1303-plan-group-directed-2000.jsonl"
);

function stableValue(
  value,
  seen = new WeakSet()
) {
  if (value === undefined)
    return "__undefined__";

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint")
    return String(value);

  if (typeof value === "symbol")
    return String(value);

  if (typeof value === "function")
    return "__function__";

  if (Array.isArray(value)) {
    return value.map(
      v => stableValue(v, seen)
    );
  }

  if (typeof value === "object") {
    if (seen.has(value))
      return "__circular__";

    seen.add(value);

    const out = {};

    for (
      const key of
      Object.keys(value).sort()
    ) {
      out[key] =
        stableValue(
          value[key],
          seen
        );
    }

    seen.delete(value);

    return out;
  }

  return String(value);
}

function stateSnapshot(
  board,
  members
) {
  const occupied = [];

  for (
    let y = 0;
    y < board.length;
    y++
  ) {
    const row = board[y];

    if (!row)
      continue;

    for (
      let x = 0;
      x < row.length;
      x++
    ) {
      const ball = row[x];

      if (!ball)
        continue;

      occupied.push({
        x,
        y,
        ball:
          stableValue(ball)
      });
    }
  }

  occupied.sort(
    (a,b) =>
      a.y-b.y ||
      a.x-b.x
  );

  const memberState =
    members.map(
      m => ({
        x:m.x,
        y:m.y,
        role:m.role,
        orientation:m.orientation,
        ball:
          stableValue(m.ball)
      })
    )
    .sort(
      (a,b) =>
        Number(a.ball?.id ?? -1) -
        Number(b.ball?.id ?? -1)
    );

  return JSON.stringify({
    occupied,
    members:memberState
  });
}

function digest(text) {
  return crypto
    .createHash("sha256")
    .update(text)
    .digest("hex");
}

function same(a,b) {
  return (
    JSON.stringify(a) ===
    JSON.stringify(b)
  );
}

function execute(
  planner,
  builder
) {
  const {
    board,
    members
  } = builder();

  const plan =
    canonical(
      planner(
        board,
        members,
        false
      )
    );

  const state =
    stateSnapshot(
      board,
      members
    );

  return {
    plan,
    state
  };
}

const outputChanged = [
  0,0,0,0,0
];

const stateChanged = [
  0,0,0,0,0
];

const firstStateChange = [
  null,
  null,
  null,
  null,
  null
];

let randomFinalMismatch = 0;
let directedFinalMismatch = 0;

function auditCase(
  label,
  id,
  builder,
  goldenCommit
) {
  const result =
    planners.map(
      planner =>
        execute(
          planner,
          builder
        )
    );

  for (
    let layer=1;
    layer<result.length;
    layer++
  ) {
    const before =
      result[layer-1];

    const after =
      result[layer];

    if (
      !same(
        before.plan,
        after.plan
      )
    ) {
      outputChanged[
        layer-1
      ]++;
    }

    if (
      before.state !==
      after.state
    ) {
      stateChanged[
        layer-1
      ]++;

      if (
        !firstStateChange[
          layer-1
        ]
      ) {
        firstStateChange[
          layer-1
        ] = {
          dataset:label,
          id,
          beforeStateSha256:
            digest(before.state),
          afterStateSha256:
            digest(after.state),
          beforePlan:
            before.plan,
          afterPlan:
            after.plan
        };
      }
    }
  }

  const finalPlan =
    result[5].plan;

  return same(
    finalPlan,
    goldenCommit
  );
}


/*
 * RANDOM 10K
 */

const randomRows =
  fs.readFileSync(
    RANDOM_ORACLE,
    "utf8"
  )
  .trim()
  .split("\n")
  .map(JSON.parse);

if (randomRows.length !== 10000) {
  throw new Error(
    "Random Oracle must contain 10000 rows"
  );
}

console.log();
console.log(
  "===== COMMIT AUDIT RANDOM 10000 ====="
);

for (
  let i=0;
  i<randomRows.length;
  i++
) {
  const row =
    randomRows[i];

  const ok =
    auditCase(
      "random",
      row.index,
      () =>
        buildRandom(
          row.input
        ),
      row.expected.commit
    );

  if (!ok)
    randomFinalMismatch++;

  if (
    (i+1) % 1000 === 0
  ) {
    console.log(
      `random ${i+1} / 10000`
    );
  }
}


/*
 * DIRECTED 2K
 */

const directedRows =
  fs.readFileSync(
    DIRECTED_ORACLE,
    "utf8"
  )
  .trim()
  .split("\n")
  .map(JSON.parse);

if (directedRows.length !== 2000) {
  throw new Error(
    "Directed Oracle must contain 2000 rows"
  );
}

console.log();
console.log(
  "===== COMMIT AUDIT DIRECTED 2000 ====="
);

for (
  let i=0;
  i<directedRows.length;
  i++
) {
  const row =
    directedRows[i];

  const ok =
    auditCase(
      "directed",
      `${row.type}:${row.index}`,
      () =>
        buildDirected(
          row.index,
          row.type
        ),
      row.expected.commit
    );

  if (!ok)
    directedFinalMismatch++;

  if (
    (i+1) % 250 === 0
  ) {
    console.log(
      `directed ${i+1} / 2000`
    );
  }
}


console.log();
console.log(
  "===== COMMIT LAYER DELTAS ====="
);

for (
  let i=0;
  i<5;
  i++
) {
  console.log(
    `Layer ${i+1}: ` +
    `output changed=${outputChanged[i]}, ` +
    `state changed=${stateChanged[i]}`
  );
}

console.log();
console.log(
  "===== COMMIT GOLDEN RESULT ====="
);

console.log(
  "RANDOM COMMIT MATCH:",
  10000-randomFinalMismatch,
  "/ 10000"
);

console.log(
  "RANDOM COMMIT MISMATCH:",
  randomFinalMismatch
);

console.log(
  "DIRECTED COMMIT MATCH:",
  2000-directedFinalMismatch,
  "/ 2000"
);

console.log(
  "DIRECTED COMMIT MISMATCH:",
  directedFinalMismatch
);

console.log();
console.log(
  "===== FIRST STATE CHANGE PER LAYER ====="
);

for (
  let i=0;
  i<5;
  i++
) {
  console.log();
  console.log(
    `--- Layer ${i+1} ---`
  );

  if (
    firstStateChange[i]
  ) {
    console.log(
      JSON.stringify(
        firstStateChange[i],
        null,
        2
      )
    );
  } else {
    console.log(
      "NO STATE CHANGE IN 12000 CASES"
    );
  }
}

const totalMismatch =
  randomFinalMismatch +
  directedFinalMismatch;

console.log();

if (totalMismatch === 0) {
  console.log(
    "=============================================="
  );

  console.log(
    " COMMIT AUDIT PASS: GOLDEN 12000 / 12000 "
  );

  console.log(
    "=============================================="
  );
} else {
  console.log(
    "COMMIT AUDIT FAILED"
  );

  process.exitCode = 1;
}
