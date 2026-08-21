const fs = require("fs");
const vm = require("vm");
const path = require("path");

const {
  files
} = require(
  "./v1303-plan-group-smoke.js"
);

const PUBLIC =
  path.join(
    __dirname,
    "../public"
  );

const RESOLVER =
  "app-rigidity-resolver-authoritative-v3.js";

const ORACLE =
  path.join(
    __dirname,
    "oracles",
    "v1303-plan-group-10000.jsonl"
  );

/*
 * ------------------------------------------------------------
 * VM
 * ------------------------------------------------------------
 */

function makeContext() {

  const ctx = {

    React: {
      useRef:
        initial => ({
          current: initial
        }),

      useEffect:
        () => {},

      useState:
        initial => [
          typeof initial === "function"
            ? initial()
            : initial,
          () => {}
        ],

      useCallback:
        fn => fn,

      useMemo:
        fn => fn(),

      memo:
        value => value,

      createElement:
        () => null,

      Fragment:
        Symbol("Fragment")
    },

    ReactDOM: {
      createRoot:
        () => ({
          render: () => {}
        })
    },

    console,

    Math,
    Date,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Array,
    Object,
    Number,
    String,
    Boolean,
    JSON,
    RegExp,
    Error,
    TypeError,

    parseInt,
    parseFloat,
    isFinite,
    isNaN,

    performance: {
      now: () => 0
    },

    setTimeout:
      () => 0,

    clearTimeout:
      () => {},

    setInterval:
      () => 0,

    clearInterval:
      () => {},

    requestAnimationFrame:
      () => 0,

    cancelAnimationFrame:
      () => {},

    navigator: {
      getGamepads:
        () => []
    },

    localStorage: {
      getItem:
        () => null,

      setItem:
        () => {},

      removeItem:
        () => {}
    },

    document: {
      hidden: false,

      addEventListener:
        () => {},

      removeEventListener:
        () => {},

      getElementById:
        () => null,

      querySelector:
        () => null,

      querySelectorAll:
        () => [],

      createElement:
        () => ({
          style:{},

          addEventListener:
            () => {},

          removeEventListener:
            () => {}
        })
    },

    addEventListener:
      () => {},

    removeEventListener:
      () => {}
  };

  ctx.window = ctx;
  ctx.globalThis = ctx;

  ctx.__v1303CapturedPlans = [];

  vm.createContext(ctx);

  return ctx;
}


/*
 * ------------------------------------------------------------
 * Find the closing brace of:
 *
 *     hexPhysPlanGroup = function(...) {
 *        ...
 *     };
 *
 * Strings/comments are ignored while counting braces.
 * ------------------------------------------------------------
 */

function functionEnd(
  source,
  openingBrace
) {

  let depth = 0;

  let quote = null;
  let escaped = false;

  let lineComment = false;
  let blockComment = false;

  for (
    let i = openingBrace;
    i < source.length;
    i++
  ) {

    const c = source[i];
    const n = source[i + 1];

    if (lineComment) {

      if (c === "\n")
        lineComment = false;

      continue;
    }

    if (blockComment) {

      if (
        c === "*" &&
        n === "/"
      ) {
        blockComment = false;
        i++;
      }

      continue;
    }

    if (quote) {

      if (escaped) {
        escaped = false;
        continue;
      }

      if (c === "\\") {
        escaped = true;
        continue;
      }

      if (c === quote) {
        quote = null;
      }

      continue;
    }

    if (
      c === "/" &&
      n === "/"
    ) {
      lineComment = true;
      i++;
      continue;
    }

    if (
      c === "/" &&
      n === "*"
    ) {
      blockComment = true;
      i++;
      continue;
    }

    if (
      c === "'" ||
      c === '"' ||
      c === "`"
    ) {
      quote = c;
      continue;
    }

    if (c === "{") {
      depth++;
      continue;
    }

    if (c === "}") {

      depth--;

      if (depth === 0) {

        let end = i + 1;

        while (
          end < source.length &&
          /\s/.test(
            source[end]
          )
        ) {
          end++;
        }

        if (
          source[end] === ";"
        ) {
          end++;
        }

        return end;
      }
    }
  }

  throw new Error(
    "Could not find planner function end"
  );
}


/*
 * ------------------------------------------------------------
 * Modify source IN MEMORY ONLY.
 *
 * public/ file is never written.
 * ------------------------------------------------------------
 */

function instrumentResolver(
  source
) {

  const re =
    /\bhexPhysPlanGroup\s*=\s*function\s*\(/g;

  const hits = [];

  let m;

  while (
    (m = re.exec(source))
  ) {

    const brace =
      source.indexOf(
        "{",
        m.index +
        m[0].length
      );

    if (brace < 0) {
      throw new Error(
        "Planner opening brace missing"
      );
    }

    const end =
      functionEnd(
        source,
        brace
      );

    hits.push({
      start:
        m.index,

      end
    });
  }

  console.log(
    "resolver planner definitions:",
    hits.length
  );

  if (
    hits.length !== 5
  ) {
    throw new Error(
      "Expected exactly 5 resolver planner wrappers"
    );
  }

  let out = source;

  /*
   * Insert from end to start so positions
   * remain valid.
   */
  for (
    let i =
      hits.length - 1;
    i >= 0;
    i--
  ) {

    const insertion =

      `\nwindow.__v1303CapturedPlans.push(hexPhysPlanGroup);` +
      `\n`;

    const p =
      hits[i].end;

    out =
      out.slice(0,p) +
      insertion +
      out.slice(p);
  }

  return out;
}


/*
 * ------------------------------------------------------------
 * Load the same runtime as the verified smoke test.
 * ------------------------------------------------------------
 */

const ctx =
  makeContext();

for (
  const file of files
) {

  const full =
    path.join(
      PUBLIC,
      file
    );

  if (
    !fs.existsSync(full)
  ) {
    throw new Error(
      "Missing runtime file: " +
      file
    );
  }

  let source =
    fs.readFileSync(
      full,
      "utf8"
    );

  if (
    file === RESOLVER
  ) {

    /*
     * Planner BEFORE resolver Layer 1.
     */
    vm.runInContext(
      `
      window.__v1303CapturedPlans.push(
        hexPhysPlanGroup
      );
      `,
      ctx
    );

    source =
      instrumentResolver(
        source
      );
  }

  vm.runInContext(
    source,
    ctx,
    {
      filename:file
    }
  );
}


/*
 * BASE + five resolver wrappers
 */
if (
  ctx.__v1303CapturedPlans.length !== 6
) {

  throw new Error(
    "Expected BASE + 5 planners, got " +
    ctx.__v1303CapturedPlans.length
  );
}

vm.runInContext(
  `
  window.__shadowNewBoard =
    () => newBoard();

  window.__shadowValid =
    (x,y) => valid(x,y);
  `,
  ctx
);

console.log(
  "captured planners:",
  ctx.__v1303CapturedPlans.length
);


/*
 * ------------------------------------------------------------
 * Oracle helpers
 * ------------------------------------------------------------
 */

function groupBall(
  id,
  gid,
  role,
  orientation
) {

  return {
    id,

    c:
      role % 5,

    motionGroupId:
      gid,

    motionGroupRole:
      role,

    motionGroupOrientation:
      orientation,

    motionGroupSize:
      3,

    rigid:
      true,

    momentumX:
      0,

    isGarbage:
      false
  };
}


function obstacleBall(
  o
) {

  return {
    id:o.id,

    c:o.c,

    motionGroupId:0,

    motionGroupRole:-1,

    motionGroupOrientation:"",

    motionGroupSize:0,

    rigid:false,

    momentumX:0,

    isGarbage:false
  };
}


function build(
  input
) {

  const board =
    ctx.__shadowNewBoard();

  const gid =
    500000 +
    input.index;

  const members =
    input.members.map(
      m => {

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
      }
    );

  for (
    const o of
    input.obstacles
  ) {

    board[o.y][o.x] =
      obstacleBall(o);
  }

  return {
    board,
    members
  };
}


function canonical(
  plan
) {

  if (
    !Array.isArray(plan)
  ) {
    return [];
  }

  return plan
    .map(
      p => ({
        id:
          Number(
            p.ball?.id ?? -1
          ),

        x:
          Number(p.x),

        y:
          Number(p.y),

        tx:
          Number(p.tx),

        ty:
          Number(p.ty),

        dx:
          Number(p.tx) -
          Number(p.x),

        dy:
          Number(p.ty) -
          Number(p.y),

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
      })
    )
    .sort(
      (a,b) =>
        a.id-b.id ||
        a.x-b.x ||
        a.y-b.y
    );
}


function runPlanner(
  fn,
  input
) {

  const {
    board,
    members
  } = build(input);

  return canonical(
    fn(
      board,
      members,
      true
    )
  );
}


function same(
  a,
  b
) {

  return (
    JSON.stringify(a) ===
    JSON.stringify(b)
  );
}


/*
 * ------------------------------------------------------------
 * Replay the locked 10k input set.
 * ------------------------------------------------------------
 */

const rows =
  fs.readFileSync(
    ORACLE,
    "utf8"
  )
  .trim()
  .split("\n")
  .map(JSON.parse);


if (
  rows.length !== 10000
) {
  throw new Error(
    "Expected 10000 random Oracle rows"
  );
}


const changed = [
  0,0,0,0,0
];

let finalMismatch = 0;

const firstChanges = [
  null,
  null,
  null,
  null,
  null
];

let firstFinalMismatch =
  null;


console.log();
console.log(
  "===== REPLAY 10000 RANDOM CASES ====="
);


for (
  let i=0;
  i<rows.length;
  i++
) {

  const row =
    rows[i];

  const outputs =
    ctx.__v1303CapturedPlans.map(
      fn =>
        runPlanner(
          fn,
          row.input
        )
    );

  /*
   * BASE -> L1 -> L2 -> L3 -> L4 -> L5
   */
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

      if (
        !firstChanges[
          layer-1
        ]
      ) {

        firstChanges[
          layer-1
        ] = {
          index:
            row.index,

          before:
            outputs[
              layer-1
            ],

          after:
            outputs[
              layer
            ]
        };
      }
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

    if (
      !firstFinalMismatch
    ) {

      firstFinalMismatch = {
        index:
          row.index,

        shadow:
          outputs[5],

        golden
      };
    }
  }


  if (
    (i+1) % 1000 === 0
  ) {

    console.log(
      `replayed ${i+1} / 10000`
    );
  }
}


console.log();
console.log(
  "===== LAYER ACTIVATION ====="
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
  "===== FINAL GOLDEN CHECK ====="
);

console.log(
  "FINAL MATCH:",
  10000 -
    finalMismatch,
  "/ 10000"
);

console.log(
  "FINAL MISMATCH:",
  finalMismatch
);


if (
  firstFinalMismatch
) {

  console.log();
  console.log(
    "FIRST FINAL MISMATCH:"
  );

  console.log(
    JSON.stringify(
      firstFinalMismatch,
      null,
      2
    )
  );
}


console.log();
console.log(
  "===== FIRST ACTIVATION PER LAYER ====="
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
    firstChanges[i]
  ) {

    console.log(
      JSON.stringify(
        firstChanges[i],
        null,
        2
      )
    );

  } else {

    console.log(
      "NO OUTPUT CHANGE IN RANDOM ORACLE"
    );
  }
}


console.log();

if (
  finalMismatch === 0
) {

  console.log(
    "============================================"
  );

  console.log(
    " SHADOW AUDIT PASS: FINAL = GOLDEN 10000/10000 "
  );

  console.log(
    "============================================"
  );

} else {

  console.log(
    "SHADOW AUDIT FAILED"
  );

  process.exitCode = 1;
}


module.exports = {
  ctx,
  planners: ctx.__v1303CapturedPlans,
  canonical,
  buildRandom: build
};
