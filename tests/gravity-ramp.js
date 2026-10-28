// The natural fall speeds up little by little during a match (app-04.js
// gravityRampFactor): unchanged for 30 s, 2x at 2 min, capped at 3x. The
// interval only changes at spawn, held fast fall keeps its measured on-screen
// speed, the opponent view leads by the real speed, and engines created
// without gravityRamp (tutorial, tests, AI search) never change.
const assert = require("assert"), vm = require("vm"), fs = require("fs"), path = require("path");
const { ctx } = require("./v1303-plan-group-smoke.js");
const run = src => JSON.parse(vm.runInContext(`JSON.stringify((()=>{${src}})())`, ctx));

const curve = run(`return [0,30,60,120,210,600].map(t=>gravityRampFactor(t));`);
assert.deepStrictEqual(curve.map(v => +v.toFixed(4)), [1, 1, 1.3333, 2, 3, 3], "ramp curve");

// A ramped engine: the clock runs only while playing, and the next piece uses it.
const live = run(`
  const g=createEngine(5,{gravityRamp:true});spawn(g);
  const first=g.dropInterval;
  // Freeze the piece in place so the clock, not the board, is under test.
  for(let i=0;i<120*150;i++){g.dropT=0;g.lockT=0;stepEngine(g,PHYSICS_FRAME);if(!g.alive)break;}
  const mid=g.dropInterval,clock=g.playClock;spawn(g);
  return {first,mid,clock,next:g.dropInterval,base:DROP_INTERVAL};`);
assert.strictEqual(live.first, live.base, "the first piece falls at the measured speed");
assert.strictEqual(live.mid, live.first, "a falling piece keeps its interval");
assert(Math.abs(live.clock - 150) < 1e-6, "the play clock counts match time: " + live.clock);
assert(Math.abs(live.next - live.base / 2.3333333) < 1e-6, "the next piece falls faster: " + live.next);

// Held fast fall: the same rows per second at any ramp; snapshot speed tracks the real fall.
const fast = run(`
  const a=createEngine(6,{gravityRamp:true});a.playClock=600;spawn(a);
  const b=createEngine(6);spawn(b);
  const rate=g=>activeFallTimeScale(g)/g.dropInterval;
  const natural=[rate(a),rate(b)],snapA=pieceSnapshotOf(a).s,snapB=pieceSnapshotOf(b).s;
  a.fastForward=b.fastForward=true;
  return {natural,held:[rate(a),rate(b)],snapA,snapB,heldSnap:[pieceSnapshotOf(a).s,pieceSnapshotOf(b).s]};`);
assert(Math.abs(fast.natural[0] / fast.natural[1] - 3) < 1e-9, "natural fall is 3x at the cap");
assert(Math.abs(fast.held[0] - fast.held[1]) < 1e-9, "held fast fall keeps its speed");
assert(Math.abs(fast.snapA - 3) < 1e-3, "opponent view leads by the ramped speed");
assert.strictEqual(fast.snapB, 1, "plain engines send 1");
assert(Math.abs(fast.heldSnap[0] - fast.heldSnap[1]) < 1e-2, "held fast fall sends the same speed at any ramp");

// Without gravityRamp nothing changes, however long it runs.
const plain = run(`const g=createEngine(7);for(let i=0;i<120*300;i++){g.dropT=0;g.lockT=0;stepEngine(g,PHYSICS_FRAME);}spawn(g);return {iv:g.dropInterval,base:DROP_INTERVAL,clock:g.playClock};`);
assert.strictEqual(plain.iv, plain.base);
assert.strictEqual(plain.clock, 0);

// Wiring: CPU and online matches ramp; the tutorial does not.
const app = fs.readFileSync(path.join(__dirname, "..", "public", "app-16.js"), "utf8");
const line = name => app.split("\n").find(l => l.startsWith(`const ${name} = useCallback`));
assert.strictEqual((line("startMatch").match(/gravityRamp: true/g) || []).length, 2, "both CPU-match engines ramp");
assert(/gravityRamp: true/.test(line("beginOnline")), "online matches ramp");
assert(!/gravityRamp/.test(line("startTutorial")), "the tutorial keeps a steady speed");
console.log("gravity ramp PASS");
