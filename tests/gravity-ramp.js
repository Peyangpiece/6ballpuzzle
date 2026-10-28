// The natural fall speeds up as a smooth gradient during a match (app-04.js
// gravityRampFactor): a smoothstep from 1x to 3x over 4 minutes. The interval
// follows the play clock every frame without moving the falling piece, held
// fast fall keeps its measured on-screen speed, the opponent view leads by the
// real speed, and engines created without gravityRamp (tutorial, tests, AI
// search) never change.
const assert = require("assert"), vm = require("vm"), fs = require("fs"), path = require("path");
const { ctx } = require("./v1303-plan-group-smoke.js");
const run = src => JSON.parse(vm.runInContext(`JSON.stringify((()=>{${src}})())`, ctx));

const curve = run(`return [0,30,60,120,180,240,600].map(t=>gravityRampFactor(t));`);
assert.deepStrictEqual(curve.map(v => +v.toFixed(4)), [1, 1.0859, 1.3125, 2, 2.6875, 3, 3], "ramp curve");
// A gradient: strictly rising with no step between frames, flat at both ends.
const steps = run(`const out=[];let prev=gravityRampFactor(0),maxStep=0,rising=true;for(let i=1;i<=240*120;i++){const f=gravityRampFactor(i/120);maxStep=Math.max(maxStep,f-prev);if(f<=prev)rising=false;prev=f;}
  return {maxStep,rising,startSlope:(gravityRampFactor(1)-1),endSlope:(3-gravityRampFactor(239))};`);
assert(steps.rising, "the speed rises every frame");
assert(steps.maxStep < 1.1e-4, "no visible step between frames: " + steps.maxStep);
assert(steps.startSlope < 1e-3 && steps.endSlope < 1e-3, "eases in and out");

// A ramped engine: the clock runs only while playing; the interval follows it
// during a fall and the piece's position inside its step does not move.
const live = run(`
  const g=createEngine(5,{gravityRamp:true});spawn(g);
  const first=g.dropInterval;let maxJump=0;
  for(let i=0;i<120*150;i++){
    const before=activeDropFraction(g),pre=g.dropT;
    applyGravityRamp(g);
    maxJump=Math.max(maxJump,Math.abs(activeDropFraction(g)-before));
    g.dropT=Math.min(g.dropT,g.dropInterval*.4);g.lockT=0;g.piece={...g.piece,y:-2};
    stepEngine(g,PHYSICS_FRAME);if(!g.alive)break;
  }
  return {first,mid:g.dropInterval,clock:g.playClock,maxJump,base:DROP_INTERVAL,expect:rampedDropInterval(g.playClock)};`);
assert.strictEqual(live.first, live.base, "the first piece falls at the measured speed");
assert(Math.abs(live.clock - 150) < 1e-6, "the play clock counts match time: " + live.clock);
assert(Math.abs(live.mid - live.expect) < 1e-9 && live.mid < live.base / 2, "the falling piece speeds up with the clock: " + live.mid);
assert(live.maxJump < 1e-9, "re-timing never moves the piece: " + live.maxJump);

// Held fast fall: the same rows per second at any ramp; snapshot speed tracks the real fall.
const fast = run(`
  const a=createEngine(6,{gravityRamp:true});a.playClock=600;spawn(a);applyGravityRamp(a);
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
