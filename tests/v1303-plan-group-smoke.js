const fs = require("fs");
const vm = require("vm");
const path = require("path");

const PUBLIC = path.join(__dirname, "../public");

/*
 * Only the runtime layers that can affect normal-ball physics
 * are loaded, in the same order as index.html.
 *
 * UI / audio / online / AI files are intentionally excluded.
 */
const files = [
  "app-01.js",
  "app-02.js",
  "app-03.js",
  "app-04.js",
  "app-05.js",
  "app-06.js",
  "app-07.js",

  "app-pile-arc.js",
  "app-clear-gap-collapse.js",
  "app-floor-gap-invariant.js",
  "app-clear-vacancy-priority.js",
  "app-release-parity-settle.js",

  "app-08.js",
  "app-09.js",
  "app-10.js",
  "app-14.js",
  "app-17.js",

  "app-garbage-normal-physics.js",
  "app-garbage-presentation.js",
  "app-garbage-zero-rigidity.js",
  "app-garbage-deep-settle.js",
  "app-garbage-simultaneous-motion.js",
  "app-garbage-render-overlap-guard.js",

  "app-runtime-performance.js",
  "app-physics-safety-invariants.js",
  "app-mass-motion-safety.js",
  "app-gravity-priority-v1.js",
  "app-garbage-performance-v1.js",
  "app-post-clear-two-stage-v1.js",
  "app-simultaneous-collapse-v1.js",
  "app-garbage-continuous-v1.js",
  "app-contact-separation-v1.js",
  "app-floor-bridge-collapse-v1.js",
  "app-lattice-finalize-v2.js",
  "app-coherent-collapse-v1.js",
  "app-wall-boundary-authoritative-v1.js",
  "app-slope-upconvex-authoritative-v3.js",
  "app-intentional-hexagon-stability-v1.js",
  "app-rigidity-resolver-authoritative-v3.js"
];

const ctx = {
  React: {
    useRef: initial => ({ current: initial }),
    useEffect: () => {},
    useState: initial => [
      typeof initial === "function" ? initial() : initial,
      () => {}
    ],
    useCallback: fn => fn,
    useMemo: fn => fn(),
    memo: value => value,
    createElement: () => null,
    Fragment: Symbol("Fragment")
  },

  ReactDOM: {
    createRoot: () => ({
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

  setTimeout: () => 0,
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},

  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},

  navigator: {
    getGamepads: () => []
  },

  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  },

  document: {
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
      style: {},
      addEventListener: () => {},
      removeEventListener: () => {}
    })
  },

  addEventListener: () => {},
  removeEventListener: () => {}
};

ctx.window = ctx;
ctx.globalThis = ctx;

vm.createContext(ctx);

console.log("===== LOAD V1303 PHYSICS RUNTIME =====");

for (const file of files) {
  const full = path.join(PUBLIC, file);

  if (!fs.existsSync(full)) {
    throw new Error("MISSING FILE: " + file);
  }

  try {
    vm.runInContext(
      fs.readFileSync(full, "utf8"),
      ctx,
      { filename: file }
    );

    console.log("OK ", file);
  } catch (e) {
    console.error();
    console.error("FAILED:", file);
    throw e;
  }
}

console.log();
console.log("===== FINAL FUNCTION CHECK =====");

for (const name of [
  "hexPhysPlanGroup",
  "hexPhysNaturalMotion",
  "hexPhysResolveEvent",
  "hexPhysApplyEvent",
  "settlePass"
]) {
  console.log(
    name,
    typeof ctx[name]
  );

  if (typeof ctx[name] !== "function") {
    throw new Error(name + " is not available");
  }
}

console.log();
console.log("===== VERSION MARKERS =====");

console.log(
  "rigidityResolver:",
  ctx.__sixBallRigidityResolverAuthoritativeV3
);

console.log(
  "gravityPriority:",
  ctx.__sixBallGravityPriorityVersion
);

console.log();
console.log("===== CANONICAL SMOKE CASES =====");

vm.runInContext(`
(function(){

function ball(
  id,
  group,
  role,
  orientation
){
  return {
    id,
    c:role,
    motionGroupId:group,
    motionGroupRole:role,
    motionGroupOrientation:orientation,
    motionGroupSize:3,
    rigid:true,
    momentumX:0
  };
}

function canonical(plan){
  return (plan||[])
    .map(p=>({
      id:p.ball?.id ?? null,
      dx:Number(p.tx)-Number(p.x),
      dy:Number(p.ty)-Number(p.y),
      kind:p.kind || "",
      bundleId:Number(p.bundleId)||0,
      groupSize:Number(p.groupSize)||0
    }))
    .sort((a,b)=>a.id-b.id);
}

const out={};

/* CASE 1: free rigid fall */
{
  const b=newBoard();

  const balls=[
    ball(100,500,0,"down"),
    ball(101,500,1,"down"),
    ball(102,500,2,"down")
  ];

  const members=[
    {ball:balls[0],x:7,y:2,role:0,orientation:"down"},
    {ball:balls[1],x:9,y:2,role:1,orientation:"down"},
    {ball:balls[2],x:8,y:3,role:2,orientation:"down"}
  ];

  for(const m of members)
    b[m.y][m.x]=m.ball;

  out.freeFall=
    canonical(
      hexPhysPlanGroup(
        b,
        members,
        true
      )
    );
}

/* CASE 2: smooth one-sided slope */
{
  const b=newBoard();

  const balls=[
    ball(110,501,0,"down"),
    ball(111,501,1,"down"),
    ball(112,501,2,"down")
  ];

  const members=[
    {ball:balls[0],x:7,y:2,role:0,orientation:"down"},
    {ball:balls[1],x:9,y:2,role:1,orientation:"down"},
    {ball:balls[2],x:8,y:3,role:2,orientation:"down"}
  ];

  for(const m of members)
    b[m.y][m.x]=m.ball;

  b[4][9]={
    id:119,
    c:4,
    motionGroupId:0,
    rigid:false
  };

  out.slope=
    canonical(
      hexPhysPlanGroup(
        b,
        members,
        true
      )
    );
}

/* CASE 3: UP-convex separator */
{
  const b=newBoard();

  const balls=[
    ball(120,502,0,"up"),
    ball(121,502,1,"up"),
    ball(122,502,2,"up")
  ];

  const members=[
    {ball:balls[0],x:6,y:3,role:0,orientation:"up"},
    {ball:balls[1],x:7,y:4,role:1,orientation:"up"},
    {ball:balls[2],x:5,y:4,role:2,orientation:"up"}
  ];

  for(const m of members)
    b[m.y][m.x]=m.ball;

  b[5][6]={
    id:129,
    c:4,
    motionGroupId:0,
    rigid:false
  };

  out.upConvex=
    canonical(
      hexPhysPlanGroup(
        b,
        members,
        true
      )
    );
}

window.__v1303Smoke=out;

})();
`, ctx);

console.log(
  JSON.stringify(
    ctx.__v1303Smoke,
    null,
    2
  )
);

console.log();
console.log("=======================================");
console.log(" SUCCESS: V1303 FINAL PLANNER LOADED ");
console.log("=======================================");


// Reuse the verified v1303 runtime from Oracle tests.
vm.runInContext(`
window.__v1303OracleValid = (x,y) => valid(x,y);
window.__v1303OracleNewBoard = () => newBoard();
`, ctx);

module.exports = { ctx, files };
