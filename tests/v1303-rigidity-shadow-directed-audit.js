const fs = require("fs");
const path = require("path");

const {
  ctx,
  planners,
  canonical
} = require(
  "./v1303-rigidity-shadow-audit.js"
);

const ORACLE = path.join(
  __dirname,
  "oracles",
  "v1303-plan-group-directed-2000.jsonl"
);

const build=require("./fixtures/v1303-directed.js")(ctx);

function runPlanner(
  fn,
  index,
  type
) {
  const {
    board,
    members
  } = build(
    index,
    type
  );

  return canonical(
    fn(
      board,
      members,
      true
    )
  );
}

function same(a,b) {
  return (
    JSON.stringify(a) ===
    JSON.stringify(b)
  );
}

const rows =
  fs.readFileSync(
    ORACLE,
    "utf8"
  )
  .trim()
  .split("\n")
  .map(JSON.parse);

if (rows.length !== 2000) {
  throw new Error(
    "Expected 2000 Directed Oracle rows"
  );
}

if (planners.length !== 6) {
  throw new Error(
    "Expected BASE + 5 planners"
  );
}

const changed = [
  0,0,0,0,0
];

const byType = {};

let finalMismatch = 0;
let firstMismatch = null;

for (const row of rows) {

  if (!byType[row.type]) {
    byType[row.type] = {
      total:0,
      finalMismatch:0
    };
  }

  byType[row.type].total++;

  const outputs =
    planners.map(
      fn =>
        runPlanner(
          fn,
          row.index,
          row.type
        )
    );

  for (
    let layer=1;
    layer<outputs.length;
    layer++
  ) {
    if (
      !same(
        outputs[layer-1],
        outputs[layer]
      )
    ) {
      changed[layer-1]++;
    }
  }

  const golden =
    row.expected.preview;

  if (
    !same(
      outputs[5],
      golden
    )
  ) {
    finalMismatch++;

    byType[
      row.type
    ].finalMismatch++;

    if (!firstMismatch) {
      firstMismatch = {
        index:
          row.index,

        type:
          row.type,

        shadow:
          outputs[5],

        golden
      };
    }
  }
}

console.log();
console.log(
  "===== DIRECTED SHADOW RESULT ====="
);

console.log(
  "Layer 1 changed:",
  changed[0]
);

console.log(
  "Layer 2 changed:",
  changed[1]
);

console.log(
  "Layer 3 changed:",
  changed[2]
);

console.log(
  "Layer 4 changed:",
  changed[3]
);

console.log(
  "Layer 5 changed:",
  changed[4]
);

console.log();

console.log(
  "DIRECTED FINAL MATCH:",
  2000-finalMismatch,
  "/ 2000"
);

console.log(
  "DIRECTED FINAL MISMATCH:",
  finalMismatch
);

console.log();

console.log(
  "===== DIRECTED BY TYPE ====="
);

for (
  const [type,result]
  of Object.entries(byType)
) {
  console.log(
    type,
    result
  );
}

if (firstMismatch) {
  console.log();
  console.log(
    "FIRST DIRECTED MISMATCH:"
  );

  console.log(
    JSON.stringify(
      firstMismatch,
      null,
      2
    )
  );
}

console.log();

if (finalMismatch === 0) {
  console.log(
    "=============================================="
  );

  console.log(
    " DIRECTED SHADOW PASS: FINAL = GOLDEN 2000/2000 "
  );

  console.log(
    "=============================================="
  );
} else {
  console.log(
    "DIRECTED SHADOW FAILED"
  );

  process.exitCode = 1;
}

module.exports = {
  buildDirected: build
};
